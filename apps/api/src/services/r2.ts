import { Context } from 'hono';

const getR2ObjectETag = async (c: Context, key: string): Promise<string> => {
  const response = await fetch(`${c.env.R2_PUBLIC_ARPENTRY_ENDPOINT}/${key}`, {
    method: 'HEAD', // Header only
  });

  return response.headers.get('ETag') || '';
};

// TODO : Call this function when starting the server ?
const invalidateCache = async (c: Context, r2_keys: string[]) => {
  for (const r2_key of r2_keys) {
    const r2_ETag = await getR2ObjectETag(c, r2_key);
    const kv_ETag = await c.env.KV_ARPENTRY.get(r2_key);
    if (kv_ETag !== r2_ETag) {
      console.log(`Invalidating cache for ${r2_key}`);
      // TODO : Purge cache
      await c.env.KV_ARPENTRY.put(r2_key, r2_ETag);
    }
  }
};

export { getR2ObjectETag, invalidateCache };
