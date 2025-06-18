import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getCube } from './utils/gltf-generator';
import { degToRad, LV95toWGS84 } from './utils/utils';
import { generateTransformMatrixFromWGS84 } from './utils/cesium';

// Define environment variable types
type Bindings = {
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
  R2_ENDPOINT: string;
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

  // Initialize S3 client for R2 with environment variables
  const s3Client = new S3Client({
    region: 'auto',
    endpoint: c.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: c.env.R2_ACCESS_KEY_ID,
      secretAccessKey: c.env.R2_SECRET_ACCESS_KEY,
    },
  });

  try {
    console.log(`Fetching file from R2: ${filename}`);

    const getObjectCommand = new GetObjectCommand({
      Bucket: c.env.R2_BUCKET_NAME,
      Key: filename,
    });

    const response = await s3Client.send(getObjectCommand);

    if (!response.Body) {
      return c.json({ error: 'File not found' }, 404);
    }

    // Convert the readable stream to a buffer
    const chunks: Uint8Array[] = [];
    const reader = response.Body.transformToWebStream().getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const buffer = new Uint8Array(
      chunks.reduce((acc, chunk) => acc + chunk.length, 0),
    );
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }

    return new Response(buffer, {
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

export default app;
