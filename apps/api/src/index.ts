import { Hono } from 'hono';
import { cors } from 'hono/cors';

import tms from './routes/tms';
import glb from './routes/glb';

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

// const getR2ObjectETag = async (key: string): Promise<string> => {
//   const response = await fetch(`${c.env.R2_PUBLIC_ARPENTRY_ENDPOINT}/${key}`, {
//     method: 'HEAD', // Only get headers, not content
//   });

//   return response.headers.get('ETag') || '';
// };

// const invalidateCache = async (c: Context) => {
//   await c.env.KV_ARPENTRY.delete('global_bounds');
//   await c.env.KV_ARPENTRY.delete('tileset_center');
// };

// Mount TMS routes
app.route('/tms', tms);
app.route('/', glb);

export default app;
