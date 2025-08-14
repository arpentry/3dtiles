import { Hono } from 'hono';
import {
  GeoTIFF,
  ReadRasterResult,
  fromUrl,
  writeArrayBuffer,
} from 'geotiff';
import { tileToRegionSquare } from '../utils/geometry';
import { WGS84toEPSG3857 } from '../utils/projections';
import { readTiffMetadata } from '../services/raster';
import { Bindings } from '../index';

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
    const { tilesetBounds } = await readTiffMetadata(url);

    const tileMapXml = `<?xml version="1.0" encoding="UTF-8" ?>
<TileMap>
  <Title>${tilemap}</Title>
  <SRS>EPSG:3857</SRS>
  <BoundingBox minx="${tilesetBounds[0]}" miny="${tilesetBounds[1]}" maxx="${tilesetBounds[2]}" maxy="${tilesetBounds[3]}" />
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
    const { tilesetBounds } = await readTiffMetadata(url);
    
    // We still need the GeoTIFF instance for reading raster data
    const tiff: GeoTIFF = await fromUrl(url);
    const tileRegion = tileToRegionSquare(tilesetBounds, levelNum, xNum, yNum);

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
      height: 512,
      fillValue: -9999,
    });

    const pixelSizeX = (eastDeg - westDeg) / 512;
    const pixelSizeY = (northDeg - southDeg) / 512;
    const [originX, originY] = WGS84toEPSG3857(westDeg, northDeg);
    const [pixelSizeXMercator] = WGS84toEPSG3857(
      westDeg + pixelSizeX,
      northDeg,
    );
    const [, pixelSizeYMercator] = WGS84toEPSG3857(
      westDeg,
      northDeg - pixelSizeY,
    );

    const metadata = {
      height: 512,
      width: 512,
      ProjectedCSTypeGeoKey: 3857,
      ModelPixelScale: [
        Math.abs(pixelSizeXMercator - originX),
        Math.abs(pixelSizeYMercator - originY),
        0,
      ],
      ModelTiepoint: [0, 0, 0, originX, originY, 0],
    };

    const tiffBuffer = await writeArrayBuffer(raster[0], metadata);

    return new Response(tiffBuffer, {
      headers: {
        'Content-Type': 'image/tiff',
      },
    });
  } catch (error) {
    return c.json({ error: 'Failed to fetch tile' }, 500);
  }
});

export default tms;
