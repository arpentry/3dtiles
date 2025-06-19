import { Hono } from 'hono';
import { cors } from 'hono/cors';
// import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getCube } from './utils/gltf-generator';
import { degToRad, LV95toWGS84, EPSG3857toWGS84, WGS84toEPSG3857, tileToRegion, type BoundingRegion } from './utils/utils';
import { generateTransformMatrixFromWGS84 } from './utils/cesium';
import { GeoTIFF, GeoTIFFImage, ReadRasterResult, fromUrl, writeArrayBuffer } from 'geotiff';

// Define environment variable types
type Bindings = {
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
  R2_ENDPOINT: string;
  R2_PUBLIC_ARPENTRY_ENDPOINT: string;
};

/**
 * Server
 */
const app = new Hono<{ Bindings: Bindings }>();

app.use(
  '*',
  cors({
    origin: '*',
  }),
);

/**
 * Endpoints
 */
app.get('/tileset', (c) => {
  console.log('getting tileset');

  const lv95Coords1 = [2600000, 1200000];
  const lv95Coords2 = [2601000, 1201000];

  const [lon1, lat1] = LV95toWGS84(lv95Coords1[0], lv95Coords1[1]);
  const [lon2, lat2] = LV95toWGS84(lv95Coords2[0], lv95Coords2[1]);

  const [lonRad1, latRad1] = [degToRad(lon1), degToRad(lat1)];
  const [lonRad2, latRad2] = [degToRad(lon2), degToRad(lat2)];

  const TILESET_TEST = {
    asset: {
      version: '1.1',
    },
    geometricError: 2000,
    root: {
      boundingVolume: {
        region: [lonRad1, latRad1, lonRad2, latRad2, 0, 2000],
      },
      geometricError: 2000,
      refine: 'ADD',
      content: { uri: '/content?level=0&x=0&y=0' },
      children: [],
      transform: generateTransformMatrixFromWGS84(lonRad1, latRad1, 700, 100),
    },
  };

  return c.json(TILESET_TEST);
});

app.get('/subtrees', async (c) => {
  const { level, x, y } = c.req.query();

  console.log('getting subtrees', level, x, y);

  const subtreeTest = {};

  return c.json(subtreeTest);
});

app.get('/content', async (c) => {
  const { level, x, y } = c.req.query();

  console.log('getting content', level, x, y);

  const levelNum = level ? parseInt(level) : 0;
  const xNum = x ? parseInt(x) : 0;
  const yNum = y ? parseInt(y) : 0;
  const size = 1;

  return new Response(await getCube(levelNum, xNum, yNum, size), {
    headers: {
      'Content-Type': 'model/gltf-binary',
      'Content-Disposition': `attachment; filename="tile_${level}_${x}_${y}.glb"`,
    },
  });
});

app.get('/swissalti3d', async (c) => {
  const { filename } = c.req.query();

  if (!filename) {
    return c.json({ error: 'Filename parameter is required' }, 400);
  }

  try {
    console.log(
      `Fetching file from R2: ${filename} (${c.env.R2_PUBLIC_ARPENTRY_ENDPOINT}/${filename})`,
    );

    const tiff: GeoTIFF = await fromUrl(
      `${c.env.R2_PUBLIC_ARPENTRY_ENDPOINT}/${filename}`,
    );

    console.log('tiff', tiff);

    const image: GeoTIFFImage = await tiff.getImage();

    console.log('image', image);

    const raster: ReadRasterResult = await image.readRasters();

    console.log('raster', raster);

    return new Response(raster[0] as Uint8Array, {
      headers: {
        'Content-Type': 'image/tiff',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Error fetching file from R2:', error);
    return c.json({ error: 'Failed to fetch file' }, 500);
  }
});

app.get('/tile/:level/:x/:y/file.tif', async (c) => {
  const { level, x, y } = c.req.param();
  
  // TODO: Specify how to determine which GeoTIFF file to load
  const filename = 'swissimage-dop10/swissimage_web_mercator.tif'; 
  //const filename = 'swissalti3d/swissalti3d_web_mercator.tif';

  const levelNum = parseInt(level);
  const xNum = parseInt(x);
  const yNum = parseInt(y);

  if (isNaN(levelNum) || isNaN(xNum) || isNaN(yNum)) {
    return c.json({ error: 'Invalid tile coordinates' }, 400);
  }

  try {
    console.log(
      `Fetching tile ${levelNum}/${xNum}/${yNum} from file: ${filename}`,
    );

    const url = `${c.env.R2_PUBLIC_ARPENTRY_ENDPOINT}/${filename}`;

    // Load the GeoTIFF file
    const tiff: GeoTIFF = await fromUrl(url);

    console.log('tiff', tiff);

    const image: GeoTIFFImage = await tiff.getImage();

    console.log("--------------------------------")

    // Get the geographic bounds of the GeoTIFF (in EPSG:3857)
    const bbox = image.getBoundingBox();

    // Convert EPSG:3857 corners to WGS84
    const [minLon, minLat] = EPSG3857toWGS84(bbox[0], bbox[1]); // bottom-left
    const [maxLon, maxLat] = EPSG3857toWGS84(bbox[2], bbox[3]); // top-right
    
    // Convert to BoundingRegion (in radians)
    const rootRegion: BoundingRegion = {
      west: degToRad(minLon),    // west longitude
      south: degToRad(minLat),   // south latitude
      east: degToRad(maxLon),    // east longitude
      north: degToRad(maxLat),   // north latitude
      minH: 0,                   // Assume sea level for DEM
      maxH: 5000,                // Assume max height for Swiss Alps
    };

    // Calculate the specific tile's bounding region
    const tileRegion = tileToRegion(rootRegion, levelNum, xNum, yNum);
    console.log('tileRegion', tileRegion);

    // Convert back to degrees first, then to EPSG:3857 for the GeoTIFF bbox parameter
    const westDeg = tileRegion.west * (180 / Math.PI);
    const southDeg = tileRegion.south * (180 / Math.PI);
    const eastDeg = tileRegion.east * (180 / Math.PI);
    const northDeg = tileRegion.north * (180 / Math.PI);
    
    // Convert WGS84 corners to EPSG:3857 for readRasters
    const [minX, minY] = WGS84toEPSG3857(westDeg, southDeg);   // bottom-left
    const [maxX, maxY] = WGS84toEPSG3857(eastDeg, northDeg);   // top-right
    
    const tileBbox = [minX, minY, maxX, maxY];
    console.log('tileBbox (EPSG:3857):', tileBbox);

    // Read the raster data for the specific tile region
    const raster: ReadRasterResult = await tiff.readRasters({
      bbox: tileBbox,
    });

    console.log('raster dimensions:', raster.width, 'x', raster.height);
    console.log('raster data type:', raster[0].constructor.name);

    // Calculate the resolution for the tile
    const tileWidthDegrees = eastDeg - westDeg;
    const tileHeightDegrees = northDeg - southDeg;
    const pixelSizeX = tileWidthDegrees / raster.width;
    const pixelSizeY = tileHeightDegrees / raster.height;

    // Convert back to EPSG:3857 for the ModelPixelScale and ModelTiepoint
    const [originX, originY] = WGS84toEPSG3857(westDeg, northDeg); // top-left corner
    const [pixelSizeXMercator] = WGS84toEPSG3857(westDeg + pixelSizeX, northDeg);
    const [, pixelSizeYMercator] = WGS84toEPSG3857(westDeg, northDeg - pixelSizeY);
    
    const mercatorPixelSizeX = Math.abs(pixelSizeXMercator - originX);
    const mercatorPixelSizeY = Math.abs(pixelSizeYMercator - originY);

    // Create GeoTIFF metadata for the tile
    const metadata = {
      height: raster.height,
      width: raster.width,
      // EPSG:3857 Web Mercator
      ProjectedCSTypeGeoKey: 3857,
      // Model pixel scale (X, Y, Z resolution)
      ModelPixelScale: [mercatorPixelSizeX, mercatorPixelSizeY, 0],
      // Model tiepoint (pixel coordinates to geographic coordinates)
      // Format: [pixel_x, pixel_y, pixel_z, geo_x, geo_y, geo_z]
      ModelTiepoint: [0, 0, 0, originX, originY, 0],
    };

    console.log('GeoTIFF metadata:', metadata);

    // Create a valid GeoTIFF file
    const tiffBuffer = await writeArrayBuffer(raster[0], metadata);

    return new Response(tiffBuffer, {
      headers: {
        'Content-Type': 'image/tiff',
        'Content-Disposition': `attachment; filename="tile_${level}_${x}_${y}.tif"`,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Error fetching tile from GeoTIFF:', error);
    return c.json({ error: 'Failed to fetch tile' }, 500);
  }
});

export default app;
