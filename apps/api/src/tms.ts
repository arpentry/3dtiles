import { Hono } from 'hono';
import { GeoTIFF, GeoTIFFImage, ReadRasterResult, fromUrl, writeArrayBuffer } from 'geotiff';
import { WGS84toEPSG3857, tileToRegionSquare, createSquareBounds } from './utils/utils';

type Bindings = {
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
  R2_ENDPOINT: string;
  R2_PUBLIC_ARPENTRY_ENDPOINT: string;
};

const tms = new Hono<{ Bindings: Bindings }>();

// TMS Service Resource
tms.get('/', (c) => {
  const baseUrl = `${c.req.url.split('/tms')[0]}`;
  
  const serviceXml = `<?xml version="1.0" encoding="UTF-8" ?>
<TileMapService>
  <Title>TMS</Title>
  <Abstract>Tile Map Service</Abstract>
  <TileMaps>
    <TileMap title="SwissImage" srs="EPSG:3857" href="${baseUrl}/tms/swissimage-dop10" />
    <TileMap title="SwissALTI3D" srs="EPSG:3857" href="${baseUrl}/tms/swissalti3d" />
  </TileMaps>
</TileMapService>`;

  return new Response(serviceXml, {
    headers: { 'Content-Type': 'text/xml' },
  });
});

// TileMap Resource
tms.get('/:tilemap', async (c) => {
  const { tilemap } = c.req.param();

  let filename: string;
  switch (tilemap) {
    case 'swissimage-dop10':
      filename = 'swissimage-dop10/swissimage_web_mercator.tif';
      break;
    case 'swissalti3d':
      filename = 'swissalti3d/swissalti3d_web_mercator.tif';
      break;
    default:
      return c.json({ error: 'TileMap not found' }, 404);
  }

  try {
    const url = `${c.env.R2_PUBLIC_ARPENTRY_ENDPOINT}/${filename}`;
    const tiff: GeoTIFF = await fromUrl(url);
    const image: GeoTIFFImage = await tiff.getImage();
    const bbox = image.getBoundingBox();
    // Use square bounds for consistent TMS geometry
    const squareBounds = createSquareBounds([bbox[0], bbox[1], bbox[2], bbox[3]]);

    const tileMapXml = `<?xml version="1.0" encoding="UTF-8" ?>
<TileMap>
  <Title>${tilemap}</Title>
  <SRS>EPSG:3857</SRS>
  <BoundingBox minx="${squareBounds[0]}" miny="${squareBounds[1]}" maxx="${squareBounds[2]}" maxy="${squareBounds[3]}" />
  <TileFormat width="512" height="512" mime-type="image/tiff" extension="tif" />
</TileMap>`;

    return new Response(tileMapXml, {
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    return c.json({ error: 'Failed to get TileMap metadata' }, 500);
  }
});

// TMS Tile Resource
tms.get('/:tilemap/:z/:x/:y.tif', async (c) => {
  const { tilemap, z, x } = c.req.param();
  const yWithExt = c.req.param('y.tif');
  const y = yWithExt ? yWithExt.replace('.tif', '') : '0';
  
  let filename: string;
  switch (tilemap) {
    case 'swissimage-dop10':
      filename = 'swissimage-dop10/swissimage_web_mercator.tif';
      break;
    case 'swissalti3d':
      filename = 'swissalti3d/swissalti3d_web_mercator.tif';
      break;
    default:
      return c.json({ error: 'TileMap not found' }, 404);
  }

  const levelNum = parseInt(z);
  const xNum = parseInt(x);
  const yNum = parseInt(y);

  if (isNaN(levelNum) || isNaN(xNum) || isNaN(yNum)) {
    return c.json({ error: 'Invalid tile coordinates' }, 400);
  }

  try {
    const url = `${c.env.R2_PUBLIC_ARPENTRY_ENDPOINT}/${filename}`;
    const tiff: GeoTIFF = await fromUrl(url);
    const image: GeoTIFFImage = await tiff.getImage();
    const bbox = image.getBoundingBox();
    // Create square bounds that encompass the rectangular GeoTIFF bounds
    const squareBounds = createSquareBounds([bbox[0], bbox[1], bbox[2], bbox[3]]);
    const tileRegion = tileToRegionSquare(squareBounds, levelNum, xNum, yNum);
    
    const westDeg = tileRegion.west * (180 / Math.PI);
    const southDeg = tileRegion.south * (180 / Math.PI);
    const eastDeg = tileRegion.east * (180 / Math.PI);
    const northDeg = tileRegion.north * (180 / Math.PI);
    
    const [minX, minY] = WGS84toEPSG3857(westDeg, southDeg);
    const [maxX, maxY] = WGS84toEPSG3857(eastDeg, northDeg);
    const tileBbox = [minX, minY, maxX, maxY];
    
    const raster: ReadRasterResult = await tiff.readRasters({ 
      bbox: tileBbox,
      width: 512,
      height: 512
    });
    
    const pixelSizeX = (eastDeg - westDeg) / 512;
    const pixelSizeY = (northDeg - southDeg) / 512;
    const [originX, originY] = WGS84toEPSG3857(westDeg, northDeg);
    const [pixelSizeXMercator] = WGS84toEPSG3857(westDeg + pixelSizeX, northDeg);
    const [, pixelSizeYMercator] = WGS84toEPSG3857(westDeg, northDeg - pixelSizeY);
    
    const metadata = {
      height: 512,
      width: 512,
      ProjectedCSTypeGeoKey: 3857,
      ModelPixelScale: [Math.abs(pixelSizeXMercator - originX), Math.abs(pixelSizeYMercator - originY), 0],
      ModelTiepoint: [0, 0, 0, originX, originY, 0],
    };

    const tiffBuffer = await writeArrayBuffer(raster[0], metadata);

    return new Response(tiffBuffer, {
      headers: {
        'Content-Type': 'image/tiff',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    return c.json({ error: 'Failed to fetch tile' }, 500);
  }
});

export default tms;
