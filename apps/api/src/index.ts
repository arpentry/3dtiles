import { Hono } from 'hono';
import { cors } from 'hono/cors';

import tms from './routes/tms';
import glb from './routes/glb';

// Define environment variable types
type Bindings = {
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
