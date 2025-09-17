# 3D Tiles Terrain Visualization Demo

A real-time 3D terrain visualization platform that transforms geospatial data into interactive 3D tiles. Built with React Three Fiber, Cloudflare Workers, and modern web technologies to deliver high-performance terrain rendering in the browser.

## What It Does

This demo processes high-resolution geodata to create an interactive 3D terrain viewer:

- **Real-time terrain streaming**: Dynamic 3D tile generation from elevation and satellite imagery
- **Level-of-detail rendering**: Adaptive mesh quality based on viewer distance and screen space
- **Interactive exploration**: Smooth camera controls with terrain-aware navigation

## Demo Dataset

This project uses Swiss geodata as an example dataset due to its high quality and open availability:

- **Elevation**: [swissALTI3D](https://www.swisstopo.admin.ch/en/height-model-swissalti3d) - 2m resolution digital terrain model (0.5m is also available)
- **Imagery**: [SWISSIMAGE](https://www.swisstopo.admin.ch/en/orthoimage-swissimage-10) - 2m resolution orthophotos (0.1m-0.25m is also available)

The default region showcased is the Thun Lake area, including the Lauterbrunnen Valley and Jungfrau Massif. This spectacular Alpine landscape is perfect for demonstrating 3D terrain capabilities.

#### <a id="tileset-version"></a> current tileset version :

`v1`

## Quick Start

### Prerequisites

- **Node.js** 18+ and **pnpm** 8+
- **GDAL** for raster processing
- **Cloudflare account** (for deployment only)

### System Dependencies

Ensure you have the following tools installed:

- `curl` and `jq` for data download and processing
- `gdal` for geospatial data transformation
- `awscli` for cloud storage (optional)

### Installation & Setup

1. **Clone and install dependencies**

   ```bash
   git clone https://github.com/arpentry/3dtiles.git
   cd 3dtiles
   pnpm install
   ```

2. **Download and process demo geodata (Optional)**

   ```bash
   bash scripts/swisstopo.sh
   ```

   This script will:
   - Download Swiss elevation and imagery data for the demo region
   - Process the data into Web Mercator projection
   - Generate optimized GeoTIFF files for the API
   - Attempt to upload the processed data to CloudFlare if configured

   > **Note**: Edit the coordinates in the script to select different regions of Switzerland, or adapt the script for other geodata sources.

3. **Configure environment variables**

   Choose one of the following configurations based on your use case:

   #### Option A: Use hosted demo data via Cloudflare API (recommended for quick development)

   Create `apps/api/.dev.vars`:

   ```
   ELEVATION_DATA_URL=https://pub-201a95028ab1488d96d15b38f33f28b2.r2.dev/swissalti3d/swissalti3d_web_mercator.tif
   TEXTURE_DATA_URL=https://pub-201a95028ab1488d96d15b38f33f28b2.r2.dev/swissimage-dop10/swissimage_web_mercator.tif
   TILE_CACHE_DURATION=60
   ```

   Create `apps/web/.env`:

   ```
   # Use production tileset
   VITE_TILESET_URL=https://3dtiles-api.arpentry.com/tileset.json?version={CURRENT_TILESET_VERSION}
   ```

   [tileset version](#tileset-version)

   #### Option B: Use locally processed data

   After running the swisstopo script, create `apps/api/.dev.vars`:

   ```
   ELEVATION_DATA_URL=./downloads_swissalti3d/swissalti3d_web_mercator.tif
   TEXTURE_DATA_URL=./downloads_swissimage-dop10/swissimage_web_mercator.tif
   TILE_CACHE_DURATION=60
   ```

   Create `apps/web/.env`:

   ```
   # For local development
   VITE_TILESET_URL=http://localhost:8787?version={CURRENT_TILESET_VERSION}
   ```

   [tileset version](#tileset-version)

4. **Start development servers**

   ```bash
   pnpm dev
   ```

   - **API server**: http://localhost:8787
   - **Web application**: http://localhost:5173

## Development

### Project Structure

This monorepo contains two main applications:

- **`apps/api/`** - Cloudflare Worker that processes geodata and serves 3D tiles
- **`apps/web/`** - React Three Fiber frontend for interactive terrain visualization
- **`scripts/`** - Swiss topographic data download and processing automation

### Architecture Overview

```
User Request → React 3D Viewer → Cloudflare Worker API → GeoTIFF Processing → 3D Tile Response
```

The system works by:

1. **Data Processing**: Swiss geodata is processed into Web Mercator GeoTIFF files
2. **Tile Generation**: API dynamically generates 3D tiles from elevation/texture data
3. **Level-of-Detail**: Quadtree structure provides adaptive mesh resolution
4. **Rendering**: Three.js renders tiles with proper LOD management

### Cache Configuration

The API supports configurable cache duration for tile responses via the `TILE_CACHE_DURATION` environment variable:

- **Development**: Set to `60` (1 minute) for fast iteration and testing
- **Production**: Set to `604800` (1 week) for optimal performance
- **Default**: Falls back to 604800 seconds if not specified

This configuration helps balance development speed with production performance by allowing shorter cache durations during development.

### Available Commands

All commands run from the root directory and execute across both applications:

```bash
# Development
pnpm dev          # Start both API (:8787) and Web (:5173) servers
pnpm build        # Build all applications
pnpm deploy       # Deploy all applications

# Testing & Quality
pnpm test         # Run tests in watch mode
pnpm test:run     # Run tests once
pnpm test:ui      # Open Vitest UI
pnpm lint         # Check code style
pnpm lint:fix     # Fix code style issues
```

## Deployment

### Production Environment Variables

#### Data Upload to R2 (Optional)

Create `scripts/.env` for automated cloud upload:

```bash
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=your_bucket
R2_ENDPOINT=https://your_account_id.r2.cloudflarestorage.com
```

#### API (Cloudflare Worker)

Configure in `apps/api/wrangler.json`:

```json
{
  "vars": {
    "ELEVATION_DATA_URL": "https://your-cdn.com/swissalti3d_web_mercator.tif",
    "TEXTURE_DATA_URL": "https://your-cdn.com/swissimage_web_mercator.tif",
    "TILE_CACHE_DURATION": "604800"
  }
}
```

#### Web App (Cloudflare Pages)

Set in Cloudflare dashboard under Settings → Environment Variables:

```bash
VITE_TILESET_URL=https://your-api-domain.com/tileset.json?version={current_version_see_above}
```

[tileset version](#tileset-version)

### Deploy Commands

```bash
pnpm deploy  # Deploy both API and Web applications
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Run tests: `pnpm test`
4. Submit a pull request

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
