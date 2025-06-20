import { Hono } from 'hono';
import { WGS84toEPSG3857, tileToRegionSquare, createSquareBounds } from './utils/utils';
import { GeoTIFF, GeoTIFFImage, ReadRasterResult, fromUrl } from 'geotiff';
// @ts-ignore - @mapbox/martini doesn't have TypeScript declarations
import Martini from '@mapbox/martini';
import { Document, NodeIO } from '@gltf-transform/core';
import { encode } from '@cf-wasm/png';

// Define environment variable types
type Bindings = {
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
  R2_ENDPOINT: string;
  R2_PUBLIC_ARPENTRY_ENDPOINT: string;
};

const glb = new Hono<{ Bindings: Bindings }>();
const tileSize = 512;

// 3D Tiles 1.0 configuration  
const MAX_TILE_LEVELS = 4; // Maximum levels in the explicit tile hierarchy

// Root tileset JSON endpoint for 3D Tiles 1.0 (explicit tiling)
glb.get('/tileset.json', async (c) => {
  try {
    // Use a sample elevation file to determine the bounds
    const elevation = 'swissalti3d/swissalti3d_web_mercator.tif';
    const url = `${c.env.R2_PUBLIC_ARPENTRY_ENDPOINT}/${elevation}`;
    const tiff: GeoTIFF = await fromUrl(url);
    const image: GeoTIFFImage = await tiff.getImage();
    const bbox = image.getBoundingBox();
    
    // Create square bounds that encompass the rectangular GeoTIFF bounds
    const squareBounds = createSquareBounds([bbox[0], bbox[1], bbox[2], bbox[3]]);
    
    // Convert bounds to WGS84 degrees for the region
    // Assuming the GeoTIFF is in Web Mercator (EPSG:3857)
    const minLonRad = squareBounds[0] * Math.PI / 20037508.34;
    const minLatRad = Math.atan(Math.sinh(squareBounds[1] * Math.PI / 20037508.34));
    const maxLonRad = squareBounds[2] * Math.PI / 20037508.34;
    const maxLatRad = Math.atan(Math.sinh(squareBounds[3] * Math.PI / 20037508.34));
    
    // Get min/max heights from a sample tile (approximate)
    const minHeight = 0;
    const maxHeight = 4500; // Approximate max height for Switzerland
    
    // Generate explicit children for 3D Tiles 1.0 (quadtree subdivision)
    const generateChildren = (level: number, x: number, y: number, 
                            west: number, south: number, east: number, north: number,
                            maxLevel: number = 4): any[] => {
      if (level >= maxLevel) return [];
      
      const children = [];
      const childLevel = level + 1;
      const midLon = (west + east) / 2;
      const midLat = (south + north) / 2;
      
      // Generate 4 children (quadtree)
      const childTiles = [
        { x: x * 2,     y: y * 2,     west: west,   south: south, east: midLon, north: midLat }, // SW
        { x: x * 2 + 1, y: y * 2,     west: midLon, south: south, east: east,   north: midLat }, // SE  
        { x: x * 2,     y: y * 2 + 1, west: west,   south: midLat, east: midLon, north: north }, // NW
        { x: x * 2 + 1, y: y * 2 + 1, west: midLon, south: midLat, east: east,   north: north }  // NE
      ];
      
      for (const child of childTiles) {
        children.push({
          boundingVolume: {
            region: [
              child.west,   // west
              child.south,  // south  
              child.east,   // east
              child.north,  // north
              minHeight,    // minimum height
              maxHeight     // maximum height
            ]
          },
          refine: "REPLACE",
          geometricError: 2000 / Math.pow(2, childLevel),
          content: {
            uri: `/tiles/${childLevel}/${child.x}/${child.y}.glb`
          },
          children: generateChildren(childLevel, child.x, child.y, 
                                   child.west, child.south, child.east, child.north, maxLevel)
        });
      }
      
      return children;
    };
    
    const tileset = {
      asset: {
        version: "1.0" // 3D Tiles 1.0 specification
      },
      geometricError: 2000,
      root: {
        boundingVolume: {
          region: [
            minLonRad,  // west
            minLatRad,  // south  
            maxLonRad,  // east
            maxLatRad,  // north
            minHeight,  // minimum height
            maxHeight   // maximum height
          ]
        },
        refine: "REPLACE",
        geometricError: 2000,
        content: {
          uri: "/0/0/0.glb"
        },
        children: generateChildren(0, 0, 0, minLonRad, minLatRad, maxLonRad, maxLatRad, 4)
      }
    };

    return c.json(tileset);
  } catch (error) {
    console.error('Tileset generation error:', error);
    return c.json({ error: 'Failed to generate tileset' }, 500);
  }
});



// GLB tile endpoint for 3D Tiles 1.0 (handles both /:z/:x/:y.glb and /:level/:x/:y.glb)
glb.get('/tiles/:level/:x/:y.glb', async (c) => {
  const { level, x } = c.req.param();
  const yWithExt = c.req.param('y.glb');
  const y = yWithExt ? yWithExt.replace('.glb', '') : '0';
  
  // Use the existing GLB generation logic with z=level mapping
  const z = level;
  const levelNum = parseInt(z);
  const xNum = parseInt(x);
  const yNum = parseInt(y);

  if (isNaN(levelNum) || isNaN(xNum) || isNaN(yNum)) {
    return c.json({ error: 'Invalid tile coordinates' }, 400);
  }

  // Reuse the existing GLB generation logic
  let elevation = 'swissalti3d/swissalti3d_web_mercator.tif';
  let texture = 'swissimage-dop10/swissimage_web_mercator.tif';

  try {
    const url = `${c.env.R2_PUBLIC_ARPENTRY_ENDPOINT}/${elevation}`;
    const tiff: GeoTIFF = await fromUrl(url);
    const image: GeoTIFFImage = await tiff.getImage();
    const bbox = image.getBoundingBox();
    
    // Create square bounds that encompass the rectangular GeoTIFF bounds
    const squareBounds = createSquareBounds([bbox[0], bbox[1], bbox[2], bbox[3]]);
    const tileRegion = tileToRegionSquare(squareBounds, levelNum, xNum, yNum);
    
    const westDeg = tileRegion.west * (180 / Math.PI);
    const southDeg = tileRegion.south * (180 / Math.PI);
    const eastDeg = tileRegion.east * (180 / Math.PI);
    const northDeg = tileRegion.north * (180 / Math.PI);
    
    const [minX, minY] = WGS84toEPSG3857(westDeg, southDeg);
    const [maxX, maxY] = WGS84toEPSG3857(eastDeg, northDeg);
    const tileBbox = [minX, minY, maxX, maxY];
    
    const raster: ReadRasterResult = await tiff.readRasters({ 
      bbox: tileBbox,
      width: tileSize,
      height: tileSize,
      fillValue: -9999
    });
    
    // Ensure we have elevation data
    if (!raster || !raster[0] || typeof raster[0] === 'number') {
      return c.json({ error: 'No elevation data available' }, 404);
    }

    const elevationData = raster[0] as TypedArray;
    const gridSize = tileSize + 1;
    const terrain = new Float32Array(gridSize * gridSize);

    // Copy elevation data to terrain grid
    for (let y = 0; y < tileSize; y++) {
      for (let x = 0; x < tileSize; x++) {
        const sourceIndex = y * tileSize + x;
        const targetIndex = y * gridSize + x;
        const value = elevationData[sourceIndex];
        terrain[targetIndex] = typeof value === 'bigint' ? Number(value) : (value || 0);
      }
    }

    // Fill the extra row and column for Martini (grid is tileSize+1)
    for (let x = 0; x < gridSize - 1; x++) {
        terrain[gridSize * (gridSize - 1) + x] = terrain[gridSize * (gridSize - 2) + x];
    }

    for (let y = 0; y < gridSize; y++) {
        terrain[gridSize * y + gridSize - 1] = terrain[gridSize * y + gridSize - 2];
    }

    const martini = new Martini(gridSize);
    const tile = martini.createTile(terrain);
    const { triangles, vertices } = tile.getMesh(5);

    // Filter out vertices and triangles with no-data values
    const NO_DATA_VALUE = -9999;
    const validVertexMap = new Map<number, number>(); // old index -> new index
    const validVertices: number[] = [];
    const validTriangles: number[] = [];
    
    // First pass: identify valid vertices (those not containing no-data)
    let newVertexIndex = 0;
    for (let i = 0; i < vertices.length; i += 2) {
        const x = vertices[i];
        const y = vertices[i + 1];
        const terrainIndex = Math.floor(y) * gridSize + Math.floor(x);
        const elevation = terrain[terrainIndex];
        
        // Only include vertices that don't have no-data values
        if (elevation !== NO_DATA_VALUE) {
            const oldVertexIndex = i / 2;
            validVertexMap.set(oldVertexIndex, newVertexIndex);
            validVertices.push(x, y);
            newVertexIndex++;
        }
    }
    
    // Second pass: filter triangles - only include those where all vertices are valid
    for (let i = 0; i < triangles.length; i += 3) {
        const v1 = triangles[i];
        const v2 = triangles[i + 1];
        const v3 = triangles[i + 2];
        
        // Check if all three vertices are valid (not no-data)
        if (validVertexMap.has(v1) && validVertexMap.has(v2) && validVertexMap.has(v3)) {
            validTriangles.push(
                validVertexMap.get(v1)!,
                validVertexMap.get(v2)!,
                validVertexMap.get(v3)!
            );
        }
    }
    
    // If no valid triangles, return empty response
    if (validTriangles.length === 0) {
        return c.json({ error: 'No valid elevation data in tile' }, 404);
    }

    // Load texture GeoTIFF URL
    const textureUrl = `${c.env.R2_PUBLIC_ARPENTRY_ENDPOINT}/${texture}`;

          // Load and resample texture GeoTIFF with same parameters as elevation
    let texturePngBuffer: Uint8Array | null = null;
    try {
        const textureTiff: GeoTIFF = await fromUrl(textureUrl);
        
        const textureRaster: ReadRasterResult = await textureTiff.readRasters({ 
            bbox: tileBbox,
            width: tileSize,
            height: tileSize,
            fillValue: 0
        });
        
        // Convert raster data to PNG using UPNG
        if (textureRaster && Array.isArray(textureRaster)) {
            const imageData = new Uint8Array(tileSize * tileSize * 4);
            const numBands = textureRaster.length;
            
            for (let i = 0; i < tileSize * tileSize; i++) {
                const pixelIndex = i * 4;
                
                if (numBands >= 3) {
                    // RGB or RGBA
                    const r = textureRaster[0] as TypedArray;
                    const g = textureRaster[1] as TypedArray;
                    const b = textureRaster[2] as TypedArray;
                    
                    imageData[pixelIndex] = Number(r[i]) || 0;     // R
                    imageData[pixelIndex + 1] = Number(g[i]) || 0; // G
                    imageData[pixelIndex + 2] = Number(b[i]) || 0; // B
                    imageData[pixelIndex + 3] = 255;              // A
                } else if (numBands === 1) {
                    // Grayscale
                    const gray = textureRaster[0] as TypedArray;
                    const value = Number(gray[i]) || 0;
                    
                    imageData[pixelIndex] = value;     // R
                    imageData[pixelIndex + 1] = value; // G
                    imageData[pixelIndex + 2] = value; // B
                    imageData[pixelIndex + 3] = 255;   // A
                }
            }
            
            // Create PNG buffer using @cf-wasm/png
            texturePngBuffer = encode(imageData, tileSize, tileSize);
        }
    } catch (error) {
        console.warn('Failed to load texture GeoTIFF:', error);
    }

    const document = new Document();
    const buffer = document.createBuffer();

    // Calculate tile dimensions in world coordinates
    const tileWidth = maxX - minX;
    const tileHeight = maxY - minY;
    const scaleX = tileWidth / tileSize;
    const scaleY = tileHeight / tileSize;

    const positionArray = [];
    const uvArray = [];
    for (let i = 0; i < validVertices.length; i += 2) {
        const x = validVertices[i];
        const y = validVertices[i + 1];
        const terrainIndex = Math.floor(y) * gridSize + Math.floor(x);
        const z = terrain[terrainIndex];
        
        // Convert to world coordinates
        const worldX = minX + x * scaleX;
        const worldY = minY + y * scaleY;
        
        positionArray.push(worldX, z, worldY);
        
        // Create UV coordinates (normalized to 0-1 range)
        uvArray.push(x / tileSize, y / tileSize);
    }

    const positionBuffer = new Float32Array(positionArray);
    const positionAccessor = document.createAccessor()
        .setType('VEC3')
        .setArray(positionBuffer)
        .setBuffer(buffer);

    const uvBuffer = new Float32Array(uvArray);
    const uvAccessor = document.createAccessor()
        .setType('VEC2')
        .setArray(uvBuffer)
        .setBuffer(buffer);

    const indexBuffer = new Uint16Array(validTriangles);
    const indexAccessor = document.createAccessor()
        .setType('SCALAR')
        .setArray(indexBuffer)
        .setBuffer(buffer);

    const primitive = document.createPrimitive()
        .setAttribute('POSITION', positionAccessor)
        .setAttribute('TEXCOORD_0', uvAccessor)
        .setIndices(indexAccessor);

    // Create material with resampled texture if available
    if (texturePngBuffer) {
        const baseColorTexture = document.createTexture("BaseColorTexture")
            .setImage(texturePngBuffer)
            .setMimeType('image/png');

        const material = document.createMaterial()
            .setBaseColorTexture(baseColorTexture)
            .setBaseColorFactor([1.0, 1.0, 1.0, 1.0])
            .setDoubleSided(true);

        primitive.setMaterial(material);
    }

    const mesh = document.createMesh('terrainMesh')
        .addPrimitive(primitive);

    const node = document.createNode('terrain')
        .setMesh(mesh);

    const scene = document.getRoot().listScenes()[0] || document.createScene('defaultScene');
    scene.addChild(node);

    const io = new NodeIO();
    const glbBuffer = await io.writeBinary(document);

    return new Response(glbBuffer, {
      headers: {
        'Content-Type': 'model/gltf-binary'
      },
    });
  } catch (error) {
    console.error('GLB generation error:', error);
    return c.json({ error: 'Failed to generate GLB tile' }, 500);
  }
});

export default glb;