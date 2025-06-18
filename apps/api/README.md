# 3DTiles API

A Hono-based API for serving 3D tiles and SwissALTI3D data.

## Setup

```bash
pnpm install
pnpm dev
```

## Environment Variables

The API requires the following environment variables for R2 access:

### Local Development

Create a `.dev.vars` file in the `apps/api` directory (this file is gitignored):

```bash
# apps/api/.dev.vars
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET_NAME=arpentry
R2_ENDPOINT=https://your_account_id.r2.cloudflarestorage.com
```

### Production Deployment

Set these environment variables in your Cloudflare Workers dashboard:

1. Go to your Cloudflare dashboard
2. Navigate to Workers & Pages
3. Select your worker
4. Go to Settings → Variables
5. Add each environment variable

**Security Note**: Never commit secrets to the repository. The `wrangler.json` file is committed, so it should not contain sensitive information.

## Endpoints

### `/swissalti3d`

Fetches files from the R2 bucket "arpentry".

**Query Parameters:**

- `filename` (required): The name of the file to fetch from R2

**Example:**

```
GET /swissalti3d?filename=swissalti3d/swissalti3d_web_mercator.tif
```

**Response:**

- Returns the file content with appropriate Content-Type header
- Supports .tif, .tiff, .xml, and other file types
- Includes caching headers for better performance
