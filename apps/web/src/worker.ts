export default {
  async fetch(request: Request, env: any, ctx: any) {
    return env.ASSETS.fetch(request);
  },
};
