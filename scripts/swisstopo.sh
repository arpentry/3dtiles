#!/usr/bin/env bash

# SwissTopo Processing Script
# Downloads, processes, and uploads SwissTopo data

set -e

echo "SwissTopo Processing Script"
echo "==========================="

# Check required tools
check_dependencies() {
    for cmd in curl jq gdalbuildvrt gdal_translate gdalwarp aws; do
        if ! command -v $cmd >/dev/null 2>&1; then
            echo "Error: $cmd not found. Please install required dependencies."
            exit 1
        fi
    done
    echo "Dependencies: OK"
}

# Data sources
DATASOURCE_NAMES="swissalti3d swissimage-dop10"
DATASOURCE_swissalti3d="https://ogd.swisstopo.admin.ch/services/swiseld/services/assets/ch.swisstopo.swissalti3d/search?format=image%2Ftiff%3B%20application%3Dgeotiff%3B%20profile%3Dcloud-optimized&resolution=2.0&srid=2056&state=current&xMin=2530539&yMin=1150522&xMax=2540550&yMax=1162600&csv=true"
DATASOURCE_swissimage_dop10="https://ogd.swisstopo.admin.ch/services/swiseld/services/assets/ch.swisstopo.swissimage-dop10/search?format=image%2Ftiff%3B%20application%3Dgeotiff%3B%20profile%3Dcloud-optimized&resolution=2.0&srid=2056&state=current&xMin=2529405&yMin=1149425&xMax=2540443&yMax=1162528&csv=true"

# Download function
download_file() {
    curl -L -s -o "$2" "$1"
}

# Download .tif files from URL list
download_tif_files() {
    local urls_file="$1"
    local download_dir="$2"
    
    local count=0
    while IFS= read -r url; do
        if [ -z "$url" ]; then continue; fi
        count=$((count + 1))
        local filename=$(basename "$url")
        download_file "$url" "$download_dir/$filename"
        echo "Downloaded: $filename"
    done < "$urls_file"
    echo "Downloaded $count files"
}

# Process single data source
process_data_source() {
    local name="$1"
    local url="$2"
    
    echo "Processing: $name"
    
    local download_dir="downloads_$name"
    mkdir -p "$download_dir"
    
    # Download and parse API response
    local json_response=$(curl -L -s "$url")
    local href=$(echo "$json_response" | jq -r '.href')
    
    # Download CSV file
    local csv_file="$download_dir/files.csv"
    download_file "$href" "$csv_file"
    
    # Extract URLs from CSV
    local urls_file="$download_dir/urls.txt"
    tail -n +2 "$csv_file" | cut -d',' -f1 | sed 's/^"//;s/"$//' > "$urls_file"
    
    # Download all .tif files
    download_tif_files "$urls_file" "$download_dir"
}

# Process downloaded files with GDAL
process_with_gdal() {
    local datasource="$1"
    local output_name="$2"
    local download_dir="downloads_$datasource"
    
    echo "Processing: $output_name"
    cd "$download_dir"
    
    # Build VRT from original .tif files only (exclude _web_mercator files)
    find ./ -name "*.tif" -type f | grep -v "_web_mercator" > ./files.txt
    gdalbuildvrt -input_file_list ./files.txt ./files.vrt

    # Create combined GeoTIFF
    gdal_translate files.vrt "$output_name.tif" \
        -of COG \
        -co COMPRESS=DEFLATE \
        -co BLOCKSIZE=512 \
        -co OVERVIEWS=IGNORE_EXISTING \
        -co NUM_THREADS=ALL_CPUS
    
    # Create Web Mercator projection
    gdalwarp "$output_name.tif" "${output_name}_web_mercator.tif" \
        -t_srs EPSG:3857 \
        -r bilinear \
        -of COG \
        -co TILING_SCHEME=GoogleMapsCompatible \
        -co BLOCKSIZE=256 \
        -co COMPRESS=DEFLATE \
        -co OVERVIEW_RESAMPLING=AVERAGE \
        -co OVERVIEW_COUNT=10 \
        -co NUM_THREADS=ALL_CPUS
    
    cd ..
}

# Upload file to R2
upload_to_r2() {
    local local_file="$1"
    local remote_key="$2"
    
    echo "Uploading: $(basename "$local_file")"
    AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
    AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
    aws s3api put-object \
        --bucket "$R2_BUCKET_NAME" \
        --key "$remote_key" \
        --body "$local_file" \
        --endpoint-url "$R2_ENDPOINT" \
        --checksum-algorithm CRC32 > /dev/null 2>&1
}

# Upload processed files
upload_files() {
    echo "Uploading to R2..."
    
    # Load .env file if it exists
    if [ -f ".env" ]; then
        source .env
    fi
    
    # Upload files
    upload_to_r2 "downloads_swissimage-dop10/swissimage_web_mercator.tif" "swissimage-dop10/swissimage_web_mercator.tif"
    upload_to_r2 "downloads_swissalti3d/swissalti3d_web_mercator.tif" "swissalti3d/swissalti3d_web_mercator.tif"
}

# Main execution function
main() {
    check_dependencies
    
    # Download data
    for datasource in $DATASOURCE_NAMES; do
        datasource_var="DATASOURCE_${datasource//-/_}"
        datasource_url="${!datasource_var}"
        process_data_source "$datasource" "$datasource_url"
    done
    
    # Process with GDAL
    process_with_gdal "swissalti3d" "swissalti3d"
    process_with_gdal "swissimage-dop10" "swissimage"
    
    # Upload to R2
    upload_files
    
    echo "Processing completed"
}

# Run main function
main "$@"