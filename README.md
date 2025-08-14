# 3DTiles Demo

A modern 3D tiles visualization platform built with React, Three.js, and Cloudflare Workers. This project demonstrates how to process Swiss topographic data and serve it as 3D tiles for web-based visualization.

## Architecture

This is a monorepo containing:

- **`apps/api`** - Cloudflare Worker API for serving 3D tiles
- **`apps/web`** - React Three Fiber frontend for 3D visualization
- **`scripts/`** - Swiss topographic data download automation

## Prerequisites

- **Node.js** 18+
- **pnpm** 8+
- **GDAL** for raster processing
- **Cloudflare account** (for deployment)

### System Dependencies

```bash
# macOS
brew install curl jq gdal awscli

# Ubuntu/Debian
sudo apt install curl jq gdal-bin awscli
```

## Installation

1. **Clone the repository**
2. **Install dependencies**
   ```bash
   pnpm install
   ```

## Configuration

### Environment Variables

#### For API (Cloudflare Worker)

The API uses the following environment variables configured in `apps/api/wrangler.json`:

```json
{
  "vars": {
    "ELEVATION_DATA_URL": "https://pub-201a95028ab1488d96d15b38f33f28b2.r2.dev/swissalti3d/swissalti3d_web_mercator.tif",
    "TEXTURE_DATA_URL": "https://pub-201a95028ab1488d96d15b38f33f28b2.r2.dev/swissimage-dop10/swissimage_web_mercator.tif"
  }
}
```

For local development, create `apps/api/.dev.vars`:

```bash
ELEVATION_DATA_URL=https://pub-201a95028ab1488d96d15b38f33f28b2.r2.dev/swissalti3d/swissalti3d_web_mercator.tif
TEXTURE_DATA_URL=https://pub-201a95028ab1488d96d15b38f33f28b2.r2.dev/swissimage-dop10/swissimage_web_mercator.tif
```

#### For Web App (Static Assets)

The web app uses the following environment variable for build-time injection:

For local development and builds, create `apps/web/.env`:

```bash
VITE_TILESET_URL=https://3dtiles-api.arpentry.com/tileset.json
```

For local development only, you can override with:

```bash
VITE_TILESET_URL=http://localhost:8787
```

**Note**: If deploying to Cloudflare Pages, set this environment variable in the Cloudflare dashboard under Settings → Environment variables.

#### For R2 Upload (Optional)

Create `scripts/.env`:

```bash
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=your_bucket
R2_ENDPOINT=https://your_account_id.r2.cloudflarestorage.com
```

## Topographic Data Download and Processing

### Swiss Topographic Data

Download and process Swiss topo data using the provided script.

```bash
bash scripts/swisstopo.sh
```

You can edit the `XMIN`, `YMIN`, `XMAX`, `YMAX` LV95 coordinates variables to change the geographical region.

This script:

- Downloads elevation data and texture from SwissTopo
- Process and generates the GeoTiffs raster
- Optionally uploads to Cloudflare R2

## Development

### Available Commands

All commands run from the root directory and execute in parallel across all workspaces:

```bash
# Development
pnpm dev          # Start development servers (API on :8787, Web on :5173)

# Building
pnpm build        # Build all applications

# Testing
pnpm test         # Run tests in watch mode
pnpm test:run     # Run tests once
pnpm test:ui      # Open Vitest UI

# Linting
pnpm lint         # Check code style
pnpm lint:fix     # Fix code style issues

# Deployment
pnpm deploy       # Deploy all applications
```

### Development Workflow

1. **Start development servers:**
   ```bash
   pnpm dev
   ```
   This starts both the API server (port 8787) and web app (port 5173) simultaneously.

2. **Access the applications:**
   - WEB: http://localhost:5173
   - API: http://localhost:8787

3. **Run tests:**
   ```bash
   pnpm test       # Watch mode
   pnpm test:ui    # Interactive UI
   ```

4. **Check code quality:**
   ```bash
   pnpm lint
   pnpm lint:fix
   ```

## License

MIT License
