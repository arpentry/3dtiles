# SwissTopo DEM Download Script

This script downloads DEM (Digital Elevation Model) data from the SwissTopo API, extracts the href links from the CSV response, downloads the CSV file from the href, and extracts URLs from the first column.

## Features

- Downloads data from SwissTopo's SwissALTI3D service
- Handles HTTP redirects automatically
- Parses CSV response to extract href links
- Downloads the CSV file from the extracted href
- Extracts URLs from the first column of the downloaded CSV
- Saves all intermediate and final results to files
- Provides detailed console output for debugging
- **Uploads processed web_mercator files to Cloudflare R2 storage**

## Usage

### Prerequisites

- Node.js (version 14 or higher)
- pnpm (recommended package manager)

### Running the Script

1. **Using pnpm:**

   ```bash
   pnpm start
   # or
   pnpm run download
   ```

2. **Direct execution:**
   ```bash
   node download.js
   ```

## Output Files

The script generates several files:

1. **`swisstopo_response.csv`** - Raw CSV response from the initial API call
2. **`extracted_hrefs.txt`** - Extracted href links (one per line)
3. **`downloaded_csv.csv`** - The CSV file downloaded from the first href
4. **`extracted_urls.txt`** - URLs extracted from the first column of the downloaded CSV

## Process Flow

1. **Initial API Call**: Downloads CSV from SwissTopo API
2. **Href Extraction**: Parses the CSV to find href/URL columns
3. **CSV Download**: Downloads the CSV file from the first extracted href
4. **URL Extraction**: Parses the downloaded CSV to extract URLs from the first column
5. **File Output**: Saves all results to separate files

## API Endpoint

The script uses the following SwissTopo API endpoint:

```
https://ogd.swisstopo.admin.ch/services/swiseld/services/assets/ch.swisstopo.swissalti3d/search
```

With parameters:

- `format`: image/tiff; application=geotiff; profile=cloud-optimized
- `resolution`: 2.0
- `srid`: 2056 (Swiss coordinate system)
- `state`: current
- `xMin`, `yMin`, `xMax`, `yMax`: Bounding box coordinates
- `csv`: true (return CSV format)

## Customization

To modify the download area or parameters, edit the `url` variable in `download.js` with your desired coordinates and parameters.

## Error Handling

The script includes comprehensive error handling for:

- Network errors
- HTTP redirects
- CSV parsing issues
- File I/O operations
- Individual download failures

## Uploading to Cloudflare R2

This project includes functionality to upload processed web_mercator files to Cloudflare R2 storage.

### Setup

1. **Install dependencies:**

   ```bash
   pnpm install
   ```

2. **Configure R2 credentials:**

   - Copy `env.example` to `.env`
   - Fill in your Cloudflare R2 credentials:
     ```bash
     cp env.example .env
     ```

3. **Required environment variables:**
   - `R2_ACCOUNT_ID`: Your Cloudflare account ID
   - `R2_ACCESS_KEY_ID`: R2 API access key ID
   - `R2_SECRET_ACCESS_KEY`: R2 API secret access key
   - `R2_BUCKET_NAME`: Your R2 bucket name
   - `R2_ENDPOINT`: R2 endpoint URL (usually `https://your_account_id.r2.cloudflarestorage.com`)
   - `R2_PUBLIC_URL`: (Optional) Custom domain for public access

### Running the Upload

```bash
pnpm run upload
# or
node upload.js
```

### What Gets Uploaded

The upload script will upload the following files to R2:

- `swissimage-dop10/swissimage_web_mercator.tif` - SwissImage DOP10 Web Mercator projection
- `swissimage-dop10/swissimage_web_mercator.tif.aux.xml` - Auxiliary XML metadata
- `swissalti3d/swissalti3d_web_mercator.tif` - SwissALTI3D Web Mercator projection

### Features

- **Skip existing files**: Won't re-upload files that already exist in R2
- **Progress tracking**: Shows upload progress and file sizes
- **Error handling**: Graceful handling of upload failures
- **Metadata**: Adds upload date and description metadata to files
- **Public URLs**: Displays public URLs if custom domain is configured

### Getting R2 Credentials

1. Go to your Cloudflare dashboard
2. Navigate to R2 Object Storage
3. Create a new bucket or use an existing one
4. Go to "Manage R2 API tokens"
5. Create a new API token with appropriate permissions
6. Copy the Account ID, Access Key ID, and Secret Access Key to your `.env` file

## License

MIT License
