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

#### For API (Cloudflare R2)

Create `apps/api/.dev.vars` for local development:

```bash
R2_PUBLIC_ARPENTRY_ENDPOINT=https://pub-your_public_r2_bucket_endpoint.r2.dev
```

#### For Web App

Create `apps/web/.env`:

```bash
VITE_TILES_URL=http://localhost:8787
```

#### For R2 Upload (Optional)

Create `scripts/.env`:

```bash
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=your_bucket
R2_ENDPOINT=https://your_account_id.r2.cloudflarestorage.com
```

## Development

### Start Development Servers

```bash
# Start both API and web app simultaneously
pnpm dev

# Or start individually:
pnpm --filter 3dtiles-api dev    # API on :8787
pnpm --filter 3dtiles-web dev    # Web app on :5173
```

Note: you can also run `pnpm dev` from each app

## Data Processing

### Swiss Topographic Data

Download and process Swiss topo data

```bash
bash scripts/swisstopo.sh
```

This script:

- Downloads elevation data from SwissTopo
- Generates GeoTiff
- Optionally uploads to Cloudflare R2

## Project Structure

```
3dtiles/
├── apps/
│   ├── api/                 # Cloudflare Worker API
│   │   ├── src/
│   │   │   ├── routes/      # API endpoints
│   │   │   ├── services/    # Business logic
│   │   │   └── utils/       # Utilities
│   │   └── wrangler.json    # Cloudflare config
│   └── web/                 # React frontend
│       ├── src/
│       │   ├── plugins/     # Three.js custom plugins
│       │   └── components/  # React components
│       └── vite.config.ts   # Build config
└── scripts/                  # SwissTopo scripts
```

## License

MIT License
