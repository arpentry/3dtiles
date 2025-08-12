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

// Mount TMS routes
app.route('/tms', tms);
app.route('/', glb);

export default app;
