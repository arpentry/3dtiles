import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getCube } from './utils/gltf-generator';
import { degToRad, LV95toWGS84 } from './utils/utils';
import { generateTransformMatrixFromWGS84 } from './utils/cesium';

/**
 * Server
 */
const app = new Hono();

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

export default app;
