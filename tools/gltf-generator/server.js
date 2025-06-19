import express from 'express';
import { fromFile } from 'geotiff';  // For COG reading
import Martini from '@mapbox/martini';
import { Document, NodeIO } from '@gltf-transform/core';
import { PNG } from 'pngjs';

// ------------------- Configuration ------------------- //
const PORT = 3000;

const QUADTREE_LEVELS = 5;
const SUBTREE_LEVELS = 2;

// Use the extents from your file:
const ROOT_BOUNDS = {
    minX: 787683.576,
    minY: 5807265.005,
    maxX: 792040.487,
    maxY: 5811660.135
};

const REGION_BOUNDS = [0.1235, 0.8066, 0.1242, 0.8069, 0, 3000];
const TILE_SIZE = 256; // tile resolution in pixels per tile
// If you had a DEM, you could apply a HEIGHT_EXAGGERATION, but here it's flat.
const HEIGHT_EXAGGERATION = 1.0;

// Paths to GeoTIFFs (must exist)
const DEM_PATH = 'swissalti3d/mosaic_3857_cog.tif';   // If DEM not available, can be same as image or skip
const IMAGE_PATH = 'swissimage/mosaic_3857_cog.tif';

let demTiff, imageTiff;

async function loadTiffs() {
    demTiff = await fromFile(DEM_PATH);
    imageTiff = await fromFile(IMAGE_PATH);
}

function tileCoordsToBounds(level, x, y) {
    const divs = 2 ** level;
    const dx = (ROOT_BOUNDS.maxX - ROOT_BOUNDS.minX) / divs;
    const dy = (ROOT_BOUNDS.maxY - ROOT_BOUNDS.minY) / divs;
    const minX = ROOT_BOUNDS.minX + dx * x;
    const maxX = ROOT_BOUNDS.minX + dx * (x + 1);
    const minY = ROOT_BOUNDS.minY + dy * y;
    const maxY = ROOT_BOUNDS.minY + dy * (y + 1);
    return { minX, minY, maxX, maxY };
}

function generateSubtreeJSON() {
    return {
        "tileAvailability": { "constant": 1 },
        "contentAvailability": [{ "constant": 1 }],
        "childSubtreeAvailability": { "constant": 0 }
    };
}

function generateTilesetJSON() {
    return {
        "asset": {
            "version": "1.0"
        },
        "root": {
            "boundingVolume": {
                "region": REGION_BOUNDS
            },
            "geometricError": 5000,
            "refine": "REPLACE",
            "content": {
                "uri": "content/{level}/{x}/{y}.glb"
            },
            "implicitTiling": {
                "subdivisionScheme": "QUADTREE",
                "availableLevels": QUADTREE_LEVELS,
                "subtreeLevels": SUBTREE_LEVELS,
                "subtrees": {
                    "uri": "subtrees/{level}/{x}/{y}.json"
                }
            }
        }
    };
}

async function readImageForTile(bounds) {
    throw new Error('Not implemented');
}

// Generate the GLB mesh tile (flat mesh)
async function generateTileGlb(level, x, y) {
    throw new Error('Not implemented');
}


// ------------------- Express Server ------------------- //

const app = express();

app.get('/tileset.json', (req, res) => {
    const tileset = generateTilesetJSON();
    res.json(tileset);
});

app.get('/subtrees/:level/:x/:y.json', (req, res) => {
    const subtree = generateSubtreeJSON();
    res.json(subtree);
});

app.get('/content/:level/:x/:y.glb', async (req, res) => {
    const { level, x, y } = req.params;
    try {
        const glb = await generateTileGlb(parseInt(level), parseInt(x), parseInt(y));
        res.setHeader('Content-Type', 'model/gltf-binary');
        res.send(glb);
    } catch (e) {
        console.error(e);
        res.status(500).send('Error generating tile');
    }
});

app.use(express.static('.'));

loadTiffs().then(() => {
    app.listen(PORT, () => {
        console.log(`3D Tiles server running at http://localhost:${PORT}/tileset.json`);
    });
});
