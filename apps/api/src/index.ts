import { Hono } from 'hono';
import { cors } from 'hono/cors';

import glb from './routes/glb';

/**
 * Shared environment bindings type
 */
export type Bindings = {
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

app.route('/', glb);

export default app;
