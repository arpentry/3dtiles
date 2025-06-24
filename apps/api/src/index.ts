import { Hono } from 'hono';
import { cors } from 'hono/cors';

import tms from './routes/tms';
import glb from './routes/glb';

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
app.route('/', glb);

export default app;
