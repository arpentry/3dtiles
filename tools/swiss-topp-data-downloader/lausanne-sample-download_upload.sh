#!/bin/bash

# SwissTopo Download and Processing Script
# This script downloads data using download.js, processes the files with GDAL, and uploads to R2

# set -e  # Exit on any error

echo "=========================================="
echo "SwissTopo Download and Processing Script"
echo "=========================================="

# Step 1: Execute download.js until completion
echo "Step 1: Executing download.js..."
node download.js

if [ $? -ne 0 ]; then
    echo "Error: download.js failed to execute properly"
    exit 1
fi

echo "Download completed successfully!"

# Step 2: Process downloads_swissalti3d folder
echo ""
echo "Step 2: Processing downloads_swissalti3d folder..."

if [ -d "downloads_swissalti3d" ]; then
    cd downloads_swissalti3d
    
    echo "  - Finding all .tif files..."
    find ./ -name "*.tif" > ./files.txt
    
    if [ -s ./files.txt ]; then
        echo "  - Building VRT from $(wc -l < ./files.txt) files..."
        gdalbuildvrt -input_file_list ./files.txt ./files.vrt
        
        echo "  - Creating combined swissalti3d.tif..."
        gdal_translate ./files.vrt swissalti3d.tif -co TILED=YES -co COPY_SRC_OVERVIEWS=YES -co COMPRESS=DEFLATE -co NUM_THREADS=ALL_CPUS -co BIGTIFF=YES
        
        echo "  - Creating Web Mercator projection..."
        gdalwarp -t_srs EPSG:3857 -r bilinear swissalti3d.tif swissalti3d_web_mercator.tif -co TILED=YES -co COPY_SRC_OVERVIEWS=YES -co COMPRESS=DEFLATE -co NUM_THREADS=ALL_CPUS -co BIGTIFF=YES
        
        echo "  ✓ swissalti3d processing completed!"
    else
        echo "  ⚠ No .tif files found in downloads_swissalti3d"
    fi
    
    cd ..
else
    echo "  ⚠ downloads_swissalti3d folder not found"
fi

# Step 3: Process downloads_swissimage-dop10 folder
echo ""
echo "Step 3: Processing downloads_swissimage-dop10 folder..."

if [ -d "downloads_swissimage-dop10" ]; then
    cd downloads_swissimage-dop10
    
    echo "  - Finding all .tif files..."
    find ./ -name "*.tif" > ./files.txt
    
    if [ -s ./files.txt ]; then
        echo "  - Building VRT from $(wc -l < ./files.txt) files..."
        gdalbuildvrt -input_file_list ./files.txt ./files.vrt
        
        echo "  - Creating combined swissimage.tif..."
        gdal_translate ./files.vrt swissimage.tif -co TILED=YES -co COPY_SRC_OVERVIEWS=YES -co COMPRESS=DEFLATE -co NUM_THREADS=ALL_CPUS -co BIGTIFF=YES
        
        echo "  - Creating Web Mercator projection..."
        gdalwarp -t_srs EPSG:3857 -r bilinear swissimage.tif swissimage_web_mercator.tif -co TILED=YES -co COPY_SRC_OVERVIEWS=YES -co COMPRESS=DEFLATE -co NUM_THREADS=ALL_CPUS -co BIGTIFF=YES
        
        echo "  ✓ swissimage processing completed!"
    else
        echo "  ⚠ No .tif files found in downloads_swissimage-dop10"
    fi
    
    cd ..
else
    echo "  ⚠ downloads_swissimage-dop10 folder not found"
fi

# Step 4: Upload processed files to R2
echo ""
echo "Step 4: Uploading processed files to R2..."

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "  ⚠ .env file not found. Please create one based on env.example"
    echo "  Skipping upload step..."
else
    echo "  - Executing upload.js..."
    node upload.js
    
    if [ $? -ne 0 ]; then
        echo "  ❌ Error: upload.js failed to execute properly"
        echo "  Check your R2 credentials and network connection"
    else
        echo "  ✓ Upload completed successfully!"
    fi
fi

echo ""
echo "=========================================="
echo "Processing completed!"
echo "=========================================="
echo ""
echo "Generated files:"
echo "  downloads_swissalti3d/swissalti3d.tif"
echo "  downloads_swissalti3d/swissalti3d_web_mercator.tif"
echo "  downloads_swissimage-dop10/swissimage.tif"
echo "  downloads_swissimage-dop10/swissimage_web_mercator.tif"
echo ""
echo "Uploaded to R2 (if .env configured):"
echo "  swissalti3d/swissalti3d_web_mercator.tif"
echo "  swissimage-dop10/swissimage_web_mercator.tif"
