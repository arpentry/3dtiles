const https = require('https');
const fs = require('fs');
const path = require('path');

// SwissTopo API URLs
const urls = [
    {
        name: 'swissalti3d',
        url: 'https://ogd.swisstopo.admin.ch/services/swiseld/services/assets/ch.swisstopo.swissalti3d/search?format=image%2Ftiff%3B%20application%3Dgeotiff%3B%20profile%3Dcloud-optimized&resolution=2.0&srid=2056&state=current&xMin=2530539&yMin=1150522&xMax=2540550&yMax=1162600&csv=true'
    },
    {
        name: 'swissimage-dop10',
        url: 'https://ogd.swisstopo.admin.ch/services/swiseld/services/assets/ch.swisstopo.swissimage-dop10/search?format=image%2Ftiff%3B%20application%3Dgeotiff%3B%20profile%3Dcloud-optimized&resolution=2.0&srid=2056&state=current&xMin=2529405&yMin=1149425&xMax=2540443&yMax=1162528&csv=true'
    }
];

function downloadFromSwissTopo(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            
            // Handle redirects
            if (res.statusCode === 301 || res.statusCode === 302) {
                const newUrl = res.headers.location;
                console.log(`Redirecting to: ${newUrl}`);
                https.get(newUrl, (redirectRes) => {
                    redirectRes.on('data', (chunk) => {
                        data += chunk;
                    });
                    
                    redirectRes.on('end', () => {
                        resolve(data);
                    });
                }).on('error', (err) => {
                    reject(err);
                });
                return;
            }
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                resolve(data);
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

function downloadFromUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            
            // Handle redirects
            if (res.statusCode === 301 || res.statusCode === 302) {
                const newUrl = res.headers.location;
                console.log(`Redirecting to: ${newUrl}`);
                https.get(newUrl, (redirectRes) => {
                    redirectRes.on('data', (chunk) => {
                        data += chunk;
                    });
                    
                    redirectRes.on('end', () => {
                        resolve(data);
                    });
                }).on('error', (err) => {
                    reject(err);
                });
                return;
            }
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                resolve(data);
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

function downloadFile(url, filepath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filepath);
        
        https.get(url, (res) => {
            // Handle redirects
            if (res.statusCode === 301 || res.statusCode === 302) {
                const newUrl = res.headers.location;
                console.log(`Redirecting to: ${newUrl}`);
                https.get(newUrl, (redirectRes) => {
                    redirectRes.pipe(file);
                    redirectRes.on('end', () => {
                        file.close();
                        resolve();
                    });
                }).on('error', (err) => {
                    file.close();
                    fs.unlink(filepath, () => {}); // Delete the file if download failed
                    reject(err);
                });
                return;
            }
            
            res.pipe(file);
            res.on('end', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            file.close();
            fs.unlink(filepath, () => {}); // Delete the file if download failed
            reject(err);
        });
    });
}

function parseJSONAndExtractHref(jsonData) {
    try {
        const data = JSON.parse(jsonData);
        console.log('JSON structure:', Object.keys(data));
        
        // Extract href from the simple JSON structure
        if (data.href) {
            console.log('Found href:', data.href);
            return data.href;
        } else {
            console.log('No href found in JSON. Full JSON structure:');
            console.log(JSON.stringify(data, null, 2));
            return null;
        }
    } catch (error) {
        console.error('Error parsing JSON:', error.message);
        console.log('Raw response:', jsonData.substring(0, 500));
        return null;
    }
}

function parseCSVUrls(csvData) {
    const lines = csvData.trim().split('\n');
    const urls = [];
    
    // Skip header line if it exists
    const dataLines = lines.slice(1);
    
    for (const line of dataLines) {
        // Split by comma, but handle quoted fields properly
        const fields = line.split(',').map(field => {
            // Remove quotes if present
            return field.replace(/^"(.*)"$/, '$1');
        });
        
        // Get the first column (index 0) which contains the URL
        if (fields[0] && fields[0].trim()) {
            urls.push(fields[0].trim());
        }
    }
    
    return urls;
}

function getFilenameFromUrl(url) {
    // Extract filename from URL
    const urlParts = url.split('/');
    let filename = urlParts[urlParts.length - 1];
    
    // If no extension or not .tif, add .tif
    if (!filename.includes('.tif')) {
        filename = filename + '.tif';
    }
    
    return filename;
}

async function downloadTifFiles(urls, dataSourceName) {
    // Create downloads directory for this data source
    const downloadsDir = `downloads_${dataSourceName}`;
    if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir);
        console.log(`Created downloads directory: ${downloadsDir}`);
    }
    
    console.log(`\nStarting download of ${urls.length} .tif files for ${dataSourceName}...`);
    
    const downloadPromises = urls.map(async (url, index) => {
        try {
            const filename = getFilenameFromUrl(url);
            const filepath = path.join(downloadsDir, filename);
            
            console.log(`[${index + 1}/${urls.length}] Downloading: ${filename}`);
            await downloadFile(url, filepath);
            console.log(`[${index + 1}/${urls.length}] ✓ Downloaded: ${filename}`);
            
            return { success: true, filename, url };
        } catch (error) {
            console.error(`[${index + 1}/${urls.length}] ✗ Failed to download: ${url}`, error.message);
            return { success: false, filename: getFilenameFromUrl(url), url, error: error.message };
        }
    });
    
    const results = await Promise.all(downloadPromises);
    
    // Summary
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    console.log(`\n=== Download Summary for ${dataSourceName} ===`);
    console.log(`Total files: ${urls.length}`);
    console.log(`Successfully downloaded: ${successful.length}`);
    console.log(`Failed: ${failed.length}`);
    
    if (failed.length > 0) {
        console.log(`\nFailed downloads:`);
        failed.forEach(f => {
            console.log(`- ${f.filename}: ${f.error}`);
        });
    }
    
    return results;
}

async function processDataSource(dataSource) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Processing: ${dataSource.name}`);
    console.log(`URL: ${dataSource.url}`);
    console.log(`${'='.repeat(60)}`);
    
    try {
        console.log('Downloading from SwissTopo API...');
        const response = await downloadFromSwissTopo(dataSource.url);
        
        console.log('Response received. Length:', response.length);
        console.log('First 500 characters of response:');
        console.log(response.substring(0, 500));
        
        // Parse JSON and extract href
        const href = parseJSONAndExtractHref(response);
        
        if (href) {
            console.log(`\nDownloading CSV file from: ${href}`);
            
            try {
                const csvContent = await downloadFromUrl(href);
                console.log('CSV file downloaded successfully. Length:', csvContent.length);
                
                // Parse the CSV to extract URLs from first column
                const urls = parseCSVUrls(csvContent);
                
                if (urls.length > 0) {
                    console.log(`\nFound ${urls.length} URLs in the CSV:`);
                    urls.forEach((url, index) => {
                        console.log(`${index + 1}: ${url}`);
                    });
                    
                    // Download all .tif files
                    await downloadTifFiles(urls, dataSource.name);
                    
                } else {
                    console.log('\nNo URLs found in the downloaded CSV.');
                    console.log('CSV content preview:');
                    console.log(csvContent.substring(0, 500));
                }
                
            } catch (downloadError) {
                console.error('Error downloading CSV file:', downloadError.message);
            }
            
        } else {
            console.log('\nNo href found in the JSON response.');
        }
        
    } catch (error) {
        console.error(`Error processing ${dataSource.name}:`, error.message);
    }
}

async function main() {
    console.log('SwissTopo Multi-Source Download Script');
    console.log('=====================================');
    
    for (const dataSource of urls) {
        await processDataSource(dataSource);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('All data sources processed!');
    console.log('='.repeat(60));
}

// Run the script
main();

