import { Hono } from 'hono';
import { createSquareBounds } from '../utils/geometry';
import {
  getTiffMetadata,
  readElevationData,
  generateTexture,
} from '../services/raster';
import {
  generateTerrainMesh,
  mapCoordinates,
  buildTriangleIndices,
} from '../services/mesh';
import { buildGltfDocument } from '../services/gltf';
import { calculateTileBounds, createRootTile } from '../services/tiles';

type Bindings = {
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
  R2_ENDPOINT: string;
  R2_PUBLIC_ARPENTRY_ENDPOINT: string;
};

const glb = new Hono<{ Bindings: Bindings }>();

// Configuration
const TILE_SIZE = 512;
const QUADTREE_MAX_LEVEL = 2;

// Global coordinate system reference
let GLOBAL_BOUNDS: [number, number, number, number] | null = null;
let TILESET_CENTER: [number, number] | null = null;

/**
 * Tileset JSON endpoint - provides 3D Tiles structure
 */
glb.get('/tileset.json', async (c) => {
  try {
    const elevKey = 'swissalti3d/swissalti3d_web_mercator.tif';
    const url = `${c.env.R2_PUBLIC_ARPENTRY_ENDPOINT}/${elevKey}`;

    const { bbox } = await getTiffMetadata(url);
    const square = createSquareBounds(bbox as [number, number, number, number]);

    // Store global bounds for consistent coordinate system
    GLOBAL_BOUNDS = square;
    TILESET_CENTER = [(square[0] + square[2]) / 2, (square[1] + square[3]) / 2];

    const minH = 0,
      maxH = 4500; // Swiss terrain height range

    console.log('🌍 Tileset coordinate system:', {
      web_mercator_bounds: `${square[0].toFixed(0)}, ${square[1].toFixed(0)} to ${square[2].toFixed(0)}, ${square[3].toFixed(0)}`,
      web_mercator_center: `${TILESET_CENTER[0].toFixed(0)}, ${TILESET_CENTER[1].toFixed(0)}`,
      size_km: {
        width: ((square[2] - square[0]) / 1000).toFixed(1),
        height: ((square[3] - square[1]) / 1000).toFixed(1),
      },
    });

    const root = createRootTile(
      square,
      TILESET_CENTER,
      minH,
      maxH,
      QUADTREE_MAX_LEVEL,
    );

    return c.json({
      asset: { version: '1.1' },
      geometricError: 5000,
      root,
    });
  } catch (err) {
    console.error('Tileset error:', err);
    return c.json({ error: 'Failed to build tileset' }, 500);
  }
});

/**
 * GLB tile endpoint - generates individual terrain tiles
 */
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
    // 1. Calculate tile bounds
    const tileBounds = calculateTileBounds(level, x, y, GLOBAL_BOUNDS);

    console.log(
      `   📍 Tile bounds: ${tileBounds.westDeg.toFixed(4)}°, ${tileBounds.southDeg.toFixed(4)}° to ${tileBounds.eastDeg.toFixed(4)}°, ${tileBounds.northDeg.toFixed(4)}°`,
    );
    console.log(
      `   📏 Size: ${(tileBounds.maxX - tileBounds.minX).toFixed(0)}m × ${(tileBounds.maxY - tileBounds.minY).toFixed(0)}m`,
    );

    // 2. Read elevation data
    const elevationData = await readElevationData(
      elevURL,
      tileBounds,
      TILE_SIZE,
    );

    // 3. Generate terrain mesh
    const terrainMesh = generateTerrainMesh(elevationData, TILE_SIZE);

    // 4. Map coordinates to 3D positions
    const meshGeometry = mapCoordinates(
      terrainMesh.vertices,
      terrainMesh.terrainGrid,
      tileBounds,
      TILESET_CENTER,
      TILE_SIZE,
    );

    console.log(
      `   ⛰️  Elevation range: ${meshGeometry.minElevation.toFixed(0)}m to ${meshGeometry.maxElevation.toFixed(0)}m`,
    );
    console.log(
      `   🔺 Vertices: ${meshGeometry.positions.length / 3}, Triangles: ${terrainMesh.triangles.length / 3}`,
    );

    // 5. Build triangle indices
    const triangleIndices = buildTriangleIndices(
      terrainMesh.triangles,
      meshGeometry.vertexMap,
    );

    if (!triangleIndices.indices.length) {
      console.warn('   ⚠️ No valid triangles generated');
      return c.json({ error: 'Tile void' }, 404);
    }

    // 6. Generate optional texture
    const texture = await generateTexture(texURL, tileBounds, TILE_SIZE);
    if (texture) {
      console.log('   🖼️ Texture generated');
    }

    // 7. Build glTF document
    const glbBuffer = await buildGltfDocument(
      meshGeometry.positions,
      meshGeometry.uvs,
      triangleIndices.indices,
      texture,
    );

    console.log(`   ✅ GLB generated: ${glbBuffer.byteLength} bytes`);

    return new Response(glbBuffer, {
      headers: { 'Content-Type': 'model/gltf-binary' },
    });
  } catch (err) {
    console.error('GLB generation error:', err);
    return c.json({ error: 'Failed to generate tile' }, 500);
  }
});

export default glb;
