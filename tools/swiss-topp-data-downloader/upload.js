const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

// Validate environment variables
const requiredEnvVars = [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID', 
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
    'R2_ENDPOINT'
];

for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        console.error(`❌ Missing required environment variable: ${envVar}`);
        console.error('Please check your .env file and ensure all required variables are set.');
        process.exit(1);
    }
}

// Initialize S3 client for R2
const s3Client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

// Files to upload
const filesToUpload = [
    {
        localPath: 'downloads_swissimage-dop10/swissimage_web_mercator.tif',
        remoteKey: 'swissimage-dop10/swissimage_web_mercator.tif',
        description: 'SwissImage DOP10 Web Mercator'
    },
    {
        localPath: 'downloads_swissalti3d/swissalti3d_web_mercator.tif',
        remoteKey: 'swissalti3d/swissalti3d_web_mercator.tif',
        description: 'SwissALTI3D Web Mercator'
    }
];

async function checkFileExists(key) {
    try {
        await s3Client.send(new HeadObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: key
        }));
        return true;
    } catch (error) {
        if (error.name === 'NotFound') {
            return false;
        }
        throw error;
    }
}

async function uploadFile(localPath, remoteKey, description) {
    try {
        // Check if file exists locally
        if (!fs.existsSync(localPath)) {
            console.log(`⚠️  Skipping ${description}: File not found at ${localPath}`);
            return { success: false, reason: 'file_not_found' };
        }

        // Read file
        const fileBuffer = fs.readFileSync(localPath);
        const fileStats = fs.statSync(localPath);
        
        console.log(`📤 Uploading ${description}...`);
        console.log(`   Size: ${(fileStats.size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   Local: ${localPath}`);
        console.log(`   Remote: ${remoteKey}`);

        // Upload to R2
        const uploadCommand = new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: remoteKey,
            Body: fileBuffer,
            ContentType: getContentType(localPath),
            Metadata: {
                'original-filename': path.basename(localPath),
                'upload-date': new Date().toISOString(),
                'description': description
            }
        });

        await s3Client.send(uploadCommand);
        
        console.log(`✅ Successfully uploaded ${description}`);
        return { success: true };
        
    } catch (error) {
        console.error(`❌ Failed to upload ${description}:`, error.message);
        return { success: false, reason: 'upload_failed', error: error.message };
    }
}

function getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.tif':
        case '.tiff':
            return 'image/tiff';
        case '.xml':
            return 'application/xml';
        default:
            return 'application/octet-stream';
    }
}

async function main() {
    console.log('🚀 Starting upload to Cloudflare R2...');
    console.log(`📦 Bucket: ${process.env.R2_BUCKET_NAME}`);
    console.log(`🌐 Endpoint: ${process.env.R2_ENDPOINT}`);
    console.log('');

    const results = {
        total: filesToUpload.length,
        successful: 0,
        failed: 0,
        details: []
    };

    for (const file of filesToUpload) {
        const result = await uploadFile(file.localPath, file.remoteKey, file.description);
        
        if (result.success) {
            results.successful++;
        } else {
            results.failed++;
        }
        
        results.details.push({
            file: file.description,
            ...result
        });
        
        console.log(''); // Add spacing between uploads
    }

    // Summary
    console.log('📊 Upload Summary:');
    console.log(`   Total files: ${results.total}`);
    console.log(`   ✅ Successful: ${results.successful}`);
    console.log(`   ❌ Failed: ${results.failed}`);
    
    if (results.failed > 0) {
        console.log('\n❌ Failed uploads:');
        results.details
            .filter(r => !r.success)
            .forEach(r => {
                console.log(`   - ${r.file}: ${r.reason}`);
            });
    }

    if (results.successful > 0) {
        console.log('\n🎉 Upload completed successfully!');
        if (process.env.R2_PUBLIC_URL) {
            console.log('\n📎 Public URLs:');
            results.details
                .filter(r => r.success)
                .forEach(r => {
                    const url = `${process.env.R2_PUBLIC_URL}/${r.remoteKey}`;
                    console.log(`   ${r.file}: ${url}`);
                });
        }
    }
}

// Handle errors
process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled promise rejection:', error);
    process.exit(1);
});

// Run the upload
main().catch((error) => {
    console.error('❌ Upload failed:', error);
    process.exit(1);
});
