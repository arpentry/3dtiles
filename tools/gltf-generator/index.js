import fs from 'fs';
import GeoTIFF, { fromArrayBuffer } from 'geotiff';
import Martini from '@mapbox/martini';
import { Document, NodeIO, Texture, ImageUtils } from '@gltf-transform/core';
import { PNG } from 'pngjs';


const io = new NodeIO();

async function readGeoTiff(filePath) {
    try {
        const fileBuffer = fs.readFileSync(filePath);
        const tiff = await fromArrayBuffer(fileBuffer.buffer);
        const image = await tiff.getImage();
        const raster = await image.readRasters();
        const tileSize = image.getWidth();
        const gridSize = tileSize + 1;
        const terrain = new Float32Array(gridSize * gridSize);

        for (let y = 0; y < tileSize; y++) {
            for (let x = 0; x < tileSize; x++) {
                terrain[y * gridSize + x] = raster[0][y * tileSize + x];
            }
        }

        for (let x = 0; x < gridSize - 1; x++) {
            terrain[gridSize * (gridSize - 1) + x] = terrain[gridSize * (gridSize - 2) + x];
        }

        for (let y = 0; y < gridSize; y++) {
            terrain[gridSize * y + gridSize - 1] = terrain[gridSize * y + gridSize - 2];
        }

        return terrain;
    } catch (error) {
        console.error('Error reading GeoTIFF file:', error);
        throw error;
    }
}

function computeNormalMap(heightData, size, heightScale = 1.0, strength = 1.0) {
    const normalMap = new Uint8Array(size * size * 4);

    function getHeight(x, y) {
        // Handle edge cases by clamping to the boundary
        if (x < 0) x = 0;
        if (x >= size) x = size - 1;
        if (y < 0) y = 0;
        if (y >= size) y = size - 1;
        return heightData[y * size + x];
    }

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            // Sample neighboring heights
            const hL = getHeight(x - 1, y);
            const hR = getHeight(x + 1, y);
            const hD = getHeight(x, y - 1);
            const hU = getHeight(x, y + 1);

            // Compute gradients
            // dx, dy represent slope in X and Y directions
            // We invert them and scale by strength to control how steep slopes affect the normal
            const dx = (hL - hR) * strength;
            const dy = (hD - hU) * strength;

            // Assume "up" direction as Z. For a perfectly flat surface, normal should be (0,0,1).
            // We give dz a baseline of 1.0 (or 2.0 if you want even more upward bias).
            let dz = 1.0 / heightScale;

            // Normalize the vector
            const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
            let nx = dx / len;
            let ny = dy / len;
            let nz = dz / len;

            // Convert from [-1,1] to [0,1]
            const r = Math.floor((nx * 0.5 + 0.5) * 255);
            const g = Math.floor((ny * 0.5 + 0.5) * 255);
            const b = Math.floor((nz * 0.5 + 0.5) * 255);

            const idx = (y * size + x) * 4;
            normalMap[idx] = r;
            normalMap[idx + 1] = g;
            normalMap[idx + 2] = b;
            normalMap[idx + 3] = 255;
        }
    }

    return normalMap;
}


function computeRoughnessMap(heightData, size, neighborhoodSize = 3) {
    const halfN = Math.floor(neighborhoodSize / 2);
    const roughnessMap = new Uint8Array(size * size * 4);

    const getHeight = (x, y) => {
        if (x < 0 || x >= size || y < 0 || y >= size) return heightData[0];
        return heightData[y * size + x];
    };

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            let count = 0;
            let sum = 0;
            let sumSq = 0;

            // Compute local height variation
            for (let ny = y - halfN; ny <= y + halfN; ny++) {
                for (let nx = x - halfN; nx <= x + halfN; nx++) {
                    const h = getHeight(nx, ny);
                    sum += h;
                    sumSq += h * h;
                    count++;
                }
            }

            const mean = sum / count;
            const variance = (sumSq / count) - mean * mean;
            const stddev = Math.sqrt(Math.max(0, variance));

            // Map standard deviation to roughness [0,1]
            // Adjust scaling factor as needed. Larger factor -> more sensitive.
            const scale = 0.005;
            let roughness = Math.min(1.0, stddev * scale);

            // Encode into RGBA (only need one channel, store in R)
            const idx = (y * size + x) * 4;
            const val = Math.floor(roughness * 255);
            roughnessMap[idx] = val;
            roughnessMap[idx + 1] = val;
            roughnessMap[idx + 2] = val;
            roughnessMap[idx + 3] = 255;
        }
    }

    return roughnessMap;
}

function computeAOMap(heightData, size, radius = 5) {
    // AO approximation: For each pixel, check a neighborhood of pixels.
    // If surrounded by taller heights, reduce AO (darker).
    // If mostly unobstructed, increase AO (lighter).
    //
    // This is a very rough approximation.

    const aoMap = new Uint8Array(size * size * 4);

    const getHeight = (x, y) => {
        if (x < 0 || x >= size || y < 0 || y >= size) return heightData[0];
        return heightData[y * size + x];
    };

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const baseHeight = getHeight(x, y);
            let obstructionCount = 0;
            let sampleCount = 0;

            // Sample a set of points in a square radius
            for (let ny = y - radius; ny <= y + radius; ny++) {
                for (let nx = x - radius; nx <= x + radius; nx++) {
                    if (nx === x && ny === y) continue;
                    const h = getHeight(nx, ny);
                    if (h > baseHeight) {
                        obstructionCount++;
                    }
                    sampleCount++;
                }
            }

            // AO is lower if many obstructions, higher if few
            // obstructionRatio: 0 means no obstructions, 1 means fully obstructed
            const obstructionRatio = obstructionCount / sampleCount;
            // AO should decrease with more obstructions
            // so AO = 1 - obstructionRatio
            let ao = 1.0 - obstructionRatio;

            // Clamp and possibly curve
            ao = Math.max(0.0, Math.min(1.0, ao));

            const idx = (y * size + x) * 4;
            const val = Math.floor(ao * 255);
            aoMap[idx] = val;
            aoMap[idx + 1] = val;
            aoMap[idx + 2] = val;
            aoMap[idx + 3] = 255;
        }
    }

    return aoMap;
}

function computeEmmisiveMap(heightData, size) {
    const snowLineHeight = 2000;
    const emissiveMap = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const h = heightData[y * size + x];
            emissiveMap[(y * size + x) * 4 + 0] = 0;
            emissiveMap[(y * size + x) * 4 + 1] = 0;
            emissiveMap[(y * size + x) * 4 + 2] = 0;
            emissiveMap[(y * size + x) * 4 + 3] = 255;
        }
    }
    return emissiveMap;
}

(async () => {
    const filePath = 'swissalti3d_small.tif';
    const texturePath = 'swissimage_small.png';

    try {
        const terrain = await readGeoTiff(filePath);
        const martini = new Martini(4097);
        const tile = martini.createTile(terrain);
        const { triangles, vertices } = tile.getMesh(5);

        const document = new Document();
        const buffer = document.createBuffer();

        const positionArray = [];
        for (let i = 0; i < vertices.length; i += 2) {
            const x = vertices[i];
            const y = vertices[i + 1];
            const z = terrain[Math.floor(y) * 4097 + Math.floor(x)];
            positionArray.push(x, z, y);
        }

        const positionBuffer = new Float32Array(positionArray);
        const positionAccessor = document.createAccessor()
            .setType('VEC3')
            .setArray(positionBuffer)
            .setBuffer(buffer);

        const indexBuffer = new Uint16Array(triangles);
        const indexAccessor = document.createAccessor()
            .setType('SCALAR')
            .setArray(indexBuffer)
            .setBuffer(buffer);

        const primitive = document.createPrimitive()
            .setAttribute('POSITION', positionAccessor)
            .setIndices(indexAccessor);

        const mesh = document.createMesh('terrainMesh')
            .addPrimitive(primitive);

        const node = document.createNode('terrain')
            .setMesh(mesh);

        const scene = document.getRoot().listScenes()[0] || document.createScene('defaultScene');
        scene.addChild(node);

        const uvArray = [];
        for (let i = 0; i < vertices.length; i += 2) {
            const x = vertices[i];
            const y = vertices[i + 1];
            const z = terrain[Math.floor(y) * 4097 + Math.floor(x)];
            positionArray.push(x, z, y);
            uvArray.push(x / 4096, y / 4096); // Normalize UVs
        }
        const uvBuffer = new Float32Array(uvArray);
        const uvAccessor = document.createAccessor()
            .setType('VEC2')
            .setArray(uvBuffer)
            .setBuffer(buffer);

        primitive.setAttribute('TEXCOORD_0', uvAccessor);

        const imageBuffer = fs.readFileSync(texturePath);
        const baseColorTexture = document.createTexture("BaseColorTexture")
            .setImage(imageBuffer)
            .setMimeType('image/png');

        const gridSize = 4097;

        // Compute normal map from terrain data
        const normalData = computeNormalMap(terrain, gridSize);
        const normalTexture = document.createTexture("NormalTexture")
            .setImage(normalData)
            .setMimeType('image/png');

        // Save normal map for debugging
        const normalPng = new PNG({ width: gridSize, height: gridSize });
        normalPng.data = normalData;
        const normalChunks = PNG.sync.write(normalPng);
        fs.writeFileSync('normal_map.png', normalChunks);

        // Compute the roughness map from terrain data
        const roughnessData = computeRoughnessMap(terrain, gridSize);
        const roughnessTexture = document.createTexture("RoughnessTexture")
            .setImage(roughnessData)
            .setMimeType('image/png');

        // Save roughness map for debugging
        const roughnessPng = new PNG({ width: gridSize, height: gridSize });
        roughnessPng.data = roughnessData;
        PNG.sync.write(roughnessPng);
        const roughnessChunks = PNG.sync.write(roughnessPng);
        fs.writeFileSync('roughness_map.png', roughnessChunks);

        // Compute the AO map from terrain data
        const aoData = computeAOMap(terrain, gridSize);
        const aoTexture = document.createTexture("AOTexture")
            .setImage(aoData)
            .setMimeType('image/png');

        // Save AO map for debugging
        const aoPng = new PNG({ width: gridSize, height: gridSize });
        aoPng.data = aoData;
        PNG.sync.write(aoPng);
        const aoChunks = PNG.sync.write(aoPng);
        fs.writeFileSync('ao_map.png', aoChunks);

        // Compute emissive map for terrain
        const emissiveData = computeEmmisiveMap(terrain, gridSize);
        const emissiveTexture = document.createTexture("EmissiveTexture")
            .setImage(emissiveData)
            .setMimeType('image/png');

        // Save emissive map for debugging
        const emissivePng = new PNG({ width: gridSize, height: gridSize });
        emissivePng.data = emissiveData;
        PNG.sync.write(emissivePng);
        const emissiveChunks = PNG.sync.write(emissivePng);
        fs.writeFileSync('emissive_map.png', emissiveChunks);

        // Create material and set textures
        // Use baseColorTexture as the color and normalTexture for improved shading
        const material = document.createMaterial()
            .setBaseColorTexture(baseColorTexture)
            .setNormalTexture(normalTexture)
            .setMetallicRoughnessTexture(roughnessTexture)
            .setOcclusionTexture(aoTexture)
            .setEmissiveTexture(emissiveTexture)
            .setBaseColorFactor([1.0, 1.0, 1.0, 1.0])
            .setMetallicFactor(0.1)
            .setOcclusionStrength(0.9)
            .setRoughnessFactor(0.9)
            .setDoubleSided(true);

        primitive.setMaterial(material);

        await io.write('model_with_texture.glb', document);

        console.log('GLB model with texture created successfully!');
    } catch (error) {
        console.error('Failed to process GeoTIFF:', error);
    }
})();
