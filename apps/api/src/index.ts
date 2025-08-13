import { Hono } from 'hono';
import { cors } from 'hono/cors';

import tms from './routes/tms';
import glb from './routes/glb';

/**
 * Shared environment bindings type
 */
export type Bindings = {
  R2_PUBLIC_ARPENTRY_ENDPOINT: string;
  KV_ARPENTRY: KVNamespace;
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
app.route('/', glb);

export default app;
