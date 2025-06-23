// glb.ts – Simplified 3D Tiles for Lausanne Terrain (Debug Version)
// -----------------------------------------------------------------------------
// Fixed coordinate system with consistent transformations for debugging
// Uses consistent Web Mercator coordinates throughout
// -----------------------------------------------------------------------------

import { Hono } from 'hono';
import { WGS84toEPSG3857, tileToRegionSquare, createSquareBounds } from './utils/utils';
import { fromUrl } from 'geotiff';
// @ts-ignore – no types
import Martini from '@mapbox/martini';
import { Document, NodeIO } from '@gltf-transform/core';
import { encode } from '@cf-wasm/png';

// -----------------------------------------------------------------------------
// Types and constants
// -----------------------------------------------------------------------------

type Bindings = {
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
  R2_ENDPOINT: string;
  R2_PUBLIC_ARPENTRY_ENDPOINT: string;
};

const glb = new Hono<{ Bindings: Bindings }>();

// Simplified tile generation parameters
const TILE_SIZE = 512;                // Reduced for faster debugging
const QUADTREE_MAX_LEVEL = 2;         // More levels for better debugging
const ELEV_NO_DATA = -9999;

// Global coordinate system reference
let GLOBAL_BOUNDS: [number, number, number, number] | null = null;
let TILESET_CENTER: [number, number] | null = null;

// -----------------------------------------------------------------------------
// Simplified tileset structure with natural BOX bounds
// -----------------------------------------------------------------------------

function createTileChildren(level: number, x: number, y: number, minX: number, minY: number, maxX: number, maxY: number, minHeight: number, maxHeight: number, centerX: number, centerY: number, maxLevel = QUADTREE_MAX_LEVEL): Array<any> {
  if (level >= maxLevel) return [];

  const children: Array<any> = [];
  const childLevel = level + 1;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  const quads = [
    { x: x * 2, y: y * 2, minX, minY, maxX: midX, maxY: midY },         // SW
    { x: x * 2 + 1, y: y * 2, minX: midX, minY, maxX, maxY: midY },     // SE
    { x: x * 2, y: y * 2 + 1, minX, minY: midY, maxX: midX, maxY },     // NW
    { x: x * 2 + 1, y: y * 2 + 1, minX: midX, minY: midY, maxX, maxY }  // NE
  ];

  for (const q of quads) {
    const geometricError = Math.max(50, 2000 / Math.pow(2, childLevel));
    
    // Natural bounding box calculation - no rotation
    const boxCenterX = ((q.minX + q.maxX) / 2) - centerX;    // X = easting (centered)
    const boxCenterY = (minHeight + maxHeight) / 2;          // Y = elevation
    const boxCenterZ = ((q.minY + q.maxY) / 2) - centerY;    // Z = northing (centered)
    
    const boxWidth = q.maxX - q.minX;     // X extent (easting)
    const boxHeight = maxHeight - minHeight;  // Y extent (elevation)
    const boxDepth = q.maxY - q.minY;     // Z extent (northing)
    
    children.push({
      boundingVolume: { 
        box: [
          boxCenterX, boxCenterY, boxCenterZ,  // center
          boxWidth/2, 0, 0,                    // X axis half-extents (easting)
          0, boxHeight/2, 0,                   // Y axis half-extents (elevation)
          0, 0, boxDepth/2                     // Z axis half-extents (northing)
        ]
      },
      refine: 'REPLACE',
      geometricError,
      content: { uri: `/tiles/${childLevel}/${q.x}/${q.y}.glb` },
      children: createTileChildren(childLevel, q.x, q.y, q.minX, q.minY, q.maxX, q.maxY, minHeight, maxHeight, centerX, centerY, maxLevel)
    });
  }

  return children;
}

// -----------------------------------------------------------------------------
// Tileset JSON endpoint with natural BOX bounds
// -----------------------------------------------------------------------------

glb.get('/tileset.json', async (c) => {
  try {
    const elevKey = 'swissalti3d/swissalti3d_web_mercator.tif';
    const url = `${c.env.R2_PUBLIC_ARPENTRY_ENDPOINT}/${elevKey}`;
    const tiff = await fromUrl(url);
    const image = await tiff.getImage();
    const bbox3857 = image.getBoundingBox();
    const square = createSquareBounds(bbox3857 as [number, number, number, number]);

    // Store global bounds for consistent coordinate system
    GLOBAL_BOUNDS = square;
    TILESET_CENTER = [(square[0] + square[2]) / 2, (square[1] + square[3]) / 2];

    const minH = 0, maxH = 4500; // Swiss terrain height range

    console.log('🌍 Tileset coordinate system:', {
      web_mercator_bounds: `${square[0].toFixed(0)}, ${square[1].toFixed(0)} to ${square[2].toFixed(0)}, ${square[3].toFixed(0)}`,
      web_mercator_center: `${TILESET_CENTER[0].toFixed(0)}, ${TILESET_CENTER[1].toFixed(0)}`,
      size_km: {
        width: ((square[2] - square[0]) / 1000).toFixed(1),
        height: ((square[3] - square[1]) / 1000).toFixed(1)
      }
    });

    // Natural root bounding box calculation
    const rootBoxCenterX = 0;                // X = easting (centered at origin)
    const rootBoxCenterY = (minH + maxH) / 2;  // Y = elevation center
    const rootBoxCenterZ = 0;                // Z = northing (centered at origin)
    
    const rootBoxWidth = square[2] - square[0];   // X extent (easting)
    const rootBoxHeight = maxH - minH;            // Y extent (elevation)
    const rootBoxDepth = square[3] - square[1];   // Z extent (northing)

    console.log('📦 Natural Root bounding box:', {
      center: `(${rootBoxCenterX.toFixed(0)}, ${rootBoxCenterY.toFixed(0)}, ${rootBoxCenterZ.toFixed(0)})`,
      size: `${rootBoxWidth.toFixed(0)} × ${rootBoxHeight.toFixed(0)} × ${rootBoxDepth.toFixed(0)}`
    });

    const root = {
      boundingVolume: { 
        box: [
          rootBoxCenterX, rootBoxCenterY, rootBoxCenterZ,  // center
          rootBoxWidth/2, 0, 0,                            // X axis half-extents (easting)
          0, rootBoxHeight/2, 0,                           // Y axis half-extents (elevation)
          0, 0, rootBoxDepth/2                             // Z axis half-extents (northing)
        ]
      },
      refine: 'REPLACE',
      geometricError: 5000,
      content: { uri: '/tiles/0/0/0.glb' },
      children: createTileChildren(0, 0, 0, square[0], square[1], square[2], square[3], minH, maxH, TILESET_CENTER[0], TILESET_CENTER[1])
    };

    return c.json({
      asset: { version: '1.1' },
      geometricError: 5000,
      root
    });
  } catch (err) {
    console.error('Tileset error:', err);
    return c.json({ error: 'Failed to build tileset' }, 500);
  }
});

// -----------------------------------------------------------------------------
// GLB tile endpoint with FIXED coordinates (centered)
// -----------------------------------------------------------------------------

glb.get('/tiles/:level/:x/:y.glb', async (c) => {
  const level = Number(c.req.param('level'));
  const x = Number(c.req.param('x'));
  const y = Number((c.req.param('y') || '0').replace(/\.glb$/, ''));

  console.log(`🏗️ Generating tile ${level}/${x}/${y}`);

  if (isNaN(level) || isNaN(x) || isNaN(y)) {
    return c.json({ error: 'Invalid tile coordinates' }, 400);
  }

  if (!GLOBAL_BOUNDS || !TILESET_CENTER) {
    console.error('❌ Global bounds not initialized');
    return c.json({ error: 'Global bounds not available' }, 500);
  }

  const elevKey = 'swissalti3d/swissalti3d_web_mercator.tif';
  const texKey = 'swissimage-dop10/swissimage_web_mercator.tif';
  const elevURL = `${c.env.R2_PUBLIC_ARPENTRY_ENDPOINT}/${elevKey}`;
  const texURL = `${c.env.R2_PUBLIC_ARPENTRY_ENDPOINT}/${texKey}`;

  try {
    // 1. Calculate tile bounds using SAME coordinate system as tileset
    const regionRad = tileToRegionSquare(GLOBAL_BOUNDS, level, x, y);
    const westDeg = regionRad.west * 180 / Math.PI;
    const southDeg = regionRad.south * 180 / Math.PI;
    const eastDeg = regionRad.east * 180 / Math.PI;
    const northDeg = regionRad.north * 180 / Math.PI;

    const [minX, minY] = WGS84toEPSG3857(westDeg, southDeg);
    const [maxX, maxY] = WGS84toEPSG3857(eastDeg, northDeg);
    const tileBbox = [minX, minY, maxX, maxY] as [number, number, number, number];

    console.log(`   📍 Tile geographic: ${westDeg.toFixed(4)}°, ${southDeg.toFixed(4)}° to ${eastDeg.toFixed(4)}°, ${northDeg.toFixed(4)}°`);
    console.log(`   📍 Tile Web Mercator: ${minX.toFixed(0)}, ${minY.toFixed(0)} to ${maxX.toFixed(0)}, ${maxY.toFixed(0)}`);
    console.log(`   📏 Size: ${(maxX-minX).toFixed(0)}m × ${(maxY-minY).toFixed(0)}m`);

    // 2. Read elevation raster
    const tiff = await fromUrl(elevURL);
    const raster = await tiff.readRasters({
      bbox: tileBbox,
      width: TILE_SIZE,
      height: TILE_SIZE,
      fillValue: ELEV_NO_DATA
    });
    if (!raster || !raster[0] || typeof raster[0] === 'number') {
      return c.json({ error: 'No elevation data' }, 404);
    }
    const elev = raster[0] as TypedArray;

    // 3. Build geometry via Martini
    const gridSize = TILE_SIZE + 1;
    const terrainGrid = new Float32Array(gridSize * gridSize);
    for (let row = 0; row < TILE_SIZE; ++row) {
      for (let col = 0; col < TILE_SIZE; ++col) {
        const src = row * TILE_SIZE + col;
        const dst = row * gridSize + col;
        terrainGrid[dst] = Number(elev[src]);
      }
    }
    // Duplicate last row/col
    for (let col = 0; col < gridSize - 1; ++col) {
      terrainGrid[gridSize * (gridSize - 1) + col] = terrainGrid[gridSize * (gridSize - 2) + col];
    }
    for (let row = 0; row < gridSize; ++row) {
      terrainGrid[gridSize * row + gridSize - 1] = terrainGrid[gridSize * row + gridSize - 2];
    }

    const martini = new Martini(gridSize);
    const tile = martini.createTile(terrainGrid);
    const { vertices, triangles } = tile.getMesh(10); // Higher error threshold for simpler meshes

    // 4. CLEAN COORDINATE MAPPING - No rotations needed
    const pos: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const vMap = new Map<number, number>();

    // Calculate tile dimensions in meters  
    const tileWidth = maxX - minX;   
    const tileHeight = maxY - minY;  

    let next = 0;
    let minElevation = Infinity;
    let maxElevation = -Infinity;

    for (let i = 0; i < vertices.length; i += 2) {
      const gx = vertices[i];       // Grid X (0 to TILE_SIZE)
      const gy = vertices[i + 1];   // Grid Y (0 to TILE_SIZE)
      const elevation = terrainGrid[Math.floor(gy) * gridSize + Math.floor(gx)];
      
      if (elevation === ELEV_NO_DATA) { 
        vMap.set(i / 2, -1); 
        continue;
      }

      vMap.set(i / 2, next);
      
      // NATURAL COORDINATE MAPPING:
      // Grid coordinates → Web Mercator → Centered Three.js coordinates
      const rasterX = minX + (gx / TILE_SIZE) * tileWidth;      // Web Mercator X (easting)
      const rasterY = maxY - (gy / TILE_SIZE) * tileHeight;     // Web Mercator Y (northing) - Y-FLIPPED
      
      // Three.js coordinates (centered at origin)
      const threejsX = rasterX - TILESET_CENTER[0];             // X = easting (centered)
      const threejsY = elevation;                               // Y = elevation (up)
      const threejsZ = rasterY - TILESET_CENTER[1];             // Z = northing (centered)
      
      pos.push(threejsX, threejsY, threejsZ);
      uvs.push(gx / TILE_SIZE, 1.0 - (gy / TILE_SIZE));
      
      minElevation = Math.min(minElevation, elevation);
      maxElevation = Math.max(maxElevation, elevation);
      ++next;
    }

    console.log(`   ⛰️  Elevation range: ${minElevation.toFixed(0)}m to ${maxElevation.toFixed(0)}m`);
    console.log(`   🔺 Vertices: ${next}, Triangles: ${triangles.length / 3}`);
    console.log(`   🌍 Web Mercator bounds: X[${minX.toFixed(0)} to ${maxX.toFixed(0)}] Y[${minY.toFixed(0)} to ${maxY.toFixed(0)}]`);
    console.log(`   🎯 Three.js coordinates: X[${(minX - TILESET_CENTER[0]).toFixed(0)} to ${(maxX - TILESET_CENTER[0]).toFixed(0)}] Y[${minElevation.toFixed(0)} to ${maxElevation.toFixed(0)}] Z[${(minY - TILESET_CENTER[1]).toFixed(0)} to ${(maxY - TILESET_CENTER[1]).toFixed(0)}] (Y-corrected)`);
    
    // Debug: Show sample vertex coordinates in natural mapping
    console.log(`   📊 Sample vertices (X=easting, Y=elevation, Z=northing):`);
    for (let i = 0; i < Math.min(9, pos.length); i += 3) {
      console.log(`      Vertex ${i/3}: (${pos[i].toFixed(1)}, ${pos[i+1].toFixed(1)}, ${pos[i+2].toFixed(1)})`);
    }

    // 5. Build triangle indices
    for (let i = 0; i < triangles.length; i += 3) {
      const a = vMap.get(triangles[i])!;
      const b = vMap.get(triangles[i + 1])!;
      const c = vMap.get(triangles[i + 2])!;
      if (a < 0 || b < 0 || c < 0) continue;
      indices.push(a, b, c);
    }
    if (!indices.length) {
      console.warn('   ⚠️ No valid triangles generated');
      return c.json({ error: 'Tile void' }, 404);
    }

    // 6. Optional texture (simplified)
    let png: Uint8Array | undefined;
    try {
      const texTiff = await fromUrl(texURL);
      const texRaster = await texTiff.readRasters({
        bbox: tileBbox,
        width: TILE_SIZE,
        height: TILE_SIZE,
        resampleMethod: 'bilinear'
      });
      if (Array.isArray(texRaster)) {
        const img = new Uint8Array(TILE_SIZE * TILE_SIZE * 4);
        const bands = texRaster.length;
        for (let i = 0; i < TILE_SIZE * TILE_SIZE; ++i) {
          const bi = i * 4;
          if (bands >= 3) {
            img[bi] = Number((texRaster[0] as TypedArray)[i]);
            img[bi + 1] = Number((texRaster[1] as TypedArray)[i]);
            img[bi + 2] = Number((texRaster[2] as TypedArray)[i]);
            img[bi + 3] = 255;
          } else {
            const g = Number((texRaster[0] as TypedArray)[i]);
            img[bi] = img[bi + 1] = img[bi + 2] = g; 
            img[bi + 3] = 255;
          }
        }
        png = encode(img, TILE_SIZE, TILE_SIZE);
        console.log('   🖼️ Texture generated');
      }
    } catch {
      console.log('   🖼️ No texture (OK for debugging)');
    }

    // 7. Build glTF with NO transformations
    const doc = new Document();
    const buffer = doc.createBuffer();

    const positionAccessor = doc.createAccessor()
      .setType('VEC3')
      .setArray(new Float32Array(pos))
      .setBuffer(buffer);

    const uvAccessor = doc.createAccessor()
      .setType('VEC2')
      .setArray(new Float32Array(uvs))
      .setBuffer(buffer);

    const indexAccessor = doc.createAccessor()
      .setType('SCALAR')
      .setArray(indices.length > 65535 ? new Uint32Array(indices) : new Uint16Array(indices))
      .setBuffer(buffer);

    let material = doc.createMaterial()
      .setBaseColorFactor([0.8, 0.8, 0.8, 1])  // Light gray for better visibility
      .setDoubleSided(true);

    if (png) {
      const texture = doc.createTexture()
        .setImage(png)
        .setMimeType('image/png');
      material = material.setBaseColorTexture(texture);
    }

    const primitive = doc.createPrimitive()
      .setAttribute('POSITION', positionAccessor)
      .setAttribute('TEXCOORD_0', uvAccessor)
      .setIndices(indexAccessor)
      .setMaterial(material);

    const mesh = doc.createMesh().addPrimitive(primitive);
    
    // NO TRANSFORMATIONS - mesh uses centered coordinates
    const node = doc.createNode().setMesh(mesh);

    const scene = doc.getRoot().getDefaultScene() || doc.createScene();
    scene.addChild(node);

    // Export as GLB
    const glbBuffer = await new NodeIO().writeBinary(doc);
    console.log(`   ✅ GLB generated: ${glbBuffer.length} bytes`);
    
    return new Response(glbBuffer, {
      headers: { 'Content-Type': 'model/gltf-binary' }
    });

  } catch (err) {
    console.error('GLB generation error:', err);
    return c.json({ error: 'Failed to generate tile' }, 500);
  }
});

export default glb;
