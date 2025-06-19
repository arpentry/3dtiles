import { Hono } from 'hono';
import { cors } from 'hono/cors';
// import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getCube } from './utils/gltf-generator';
import { degToRad, LV95toWGS84, EPSG3857toWGS84, WGS84toEPSG3857, tileToRegion, tileToRegionSquare, getSwissWebMercatorBounds, createSquareBounds, type BoundingRegion } from './utils/utils';
import { generateTransformMatrixFromWGS84 } from './utils/cesium';
import { GeoTIFF, GeoTIFFImage, ReadRasterResult, fromUrl, writeArrayBuffer } from 'geotiff';
import tms from './tms';
import glb from './glb';

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

// Mount TMS routes
app.route('/tms', tms);
app.route('/glb', glb);

/**
 * Endpoints
 */
app.get('/tileset', (c) => {
  console.log('getting tileset');

  // Use consistent square bounds for Swiss territory
  const swissBounds = getSwissWebMercatorBounds();
  const rootRegion = tileToRegionSquare(swissBounds, 0, 0, 0);

  const TILESET_TEST = {
    asset: {
      version: '1.1',
    },
    geometricError: 2000,
    root: {
      boundingVolume: {
        region: [rootRegion.west, rootRegion.south, rootRegion.east, rootRegion.north, 0, 2000],
      },
      geometricError: 2000,
      refine: 'ADD',
      content: { uri: '/content?level=0&x=0&y=0' },
      children: [],
      transform: generateTransformMatrixFromWGS84(rootRegion.west, rootRegion.south, 700, 100),
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

export default app;
