# SwissTopo Processing Script

Single bash script that downloads SwissTopo data (elevation + imagery), processes with GDAL, and uploads to Cloudflare R2.

## What it does

1. Downloads SwissALTI3D and SwissImage DOP10 data for Lausanne area
2. Combines tiles into single GeoTIFF files  
3. Creates Web Mercator projections
4. Uploads to R2 storage

## Requirements

```bash
# macOS
brew install curl jq gdal awscli

# Ubuntu/Debian  
sudo apt install curl jq gdal-bin awscli
```

## Run

```bash
bash swisstopo.sh
```

## Output

```
downloads_swissalti3d/
├── swissalti3d.tif              # Combined elevation
└── swissalti3d_web_mercator.tif # EPSG:3857 projection

downloads_swissimage-dop10/  
├── swissimage.tif               # Combined imagery
└── swissimage_web_mercator.tif  # EPSG:3857 projection
```

## R2 Upload (Optional)

Create `.env` file:
```bash
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=your_bucket
R2_ENDPOINT=https://your_account_id.r2.cloudflarestorage.com
```

## Customize Area

Edit bounding box in `swisstopo.sh`:
```bash
DATASOURCE_swissalti3d="...&xMin=2530539&yMin=1150522&xMax=2540550&yMax=1162600&csv=true"
```
