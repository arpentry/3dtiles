import { Hono, Context } from 'hono';
import { cache } from 'hono/cache';
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
  computeVertexNormals,
} from '../services/mesh';
import { buildGltfDocument } from '../services/gltf';
import { calculateTileBounds, createRootTile } from '../services/tiles';
import { Bindings } from '../index';

const glb = new Hono<{ Bindings: Bindings }>();

type Bounds = [number, number, number, number];
type Coordinate = [number, number];

// Configuration
const TILE_SIZE = 512;
const QUADTREE_MAX_LEVEL = 5;

const fetchGlobalBounds = async (
  url: string,
): Promise<{
  globalBounds: Bounds;
  tilesetCenter: Coordinate;
}> => {
  try {
    const { bbox } = await getTiffMetadata(url);
    console.log('🌍 Bounding box fetched:', bbox);

    const bounds = createSquareBounds(bbox as Bounds);
    console.log('🌍 Square bounds created:', bounds);

    return {
      globalBounds: bounds,
      tilesetCenter: [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2],
    };
  } catch (err) {
    console.error('Failed to fetch global bounds for url:', url, err);
    throw err;
  }
};

/**
 * Tileset JSON endpoint - provides 3D Tiles structure
 */
glb.get('/tileset.json', async (c: Context) => {
  console.log('🌍 Tileset JSON endpoint');
  try {
    const elevKey = 'swissalti3d/swissalti3d_web_mercator.tif';
    const url = `${c.env.R2_PUBLIC_ARPENTRY_ENDPOINT}/${elevKey}`;
    console.log('🌍 Elevation URL:', url);

    const { globalBounds, tilesetCenter } = await fetchGlobalBounds(url);

    const minH = 0;
    const maxH = 4500; // Swiss terrain height range

    console.log('🌍 Tileset coordinate system:', {
      web_mercator_bounds: `${globalBounds}, ${globalBounds} to ${globalBounds}, ${globalBounds}`,
      web_mercator_center: `${tilesetCenter[0].toFixed(0)}, ${tilesetCenter[1].toFixed(0)}`,
      size_km: {
        width: ((globalBounds[2] - globalBounds[0]) / 1000).toFixed(1),
        height: ((globalBounds[3] - globalBounds[1]) / 1000).toFixed(1),
      },
    });

    const root = createRootTile(
      globalBounds,
      tilesetCenter,
      minH,
      maxH,
      QUADTREE_MAX_LEVEL,
    );

    return c.json({
      asset: { version: '1.1', gltfUpAxis: 'Z' },
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
glb.get(
  '/tiles/:level/:x/:y/tile.glb',
  cache({
    cacheName: 'tiles',
    cacheControl: 'max-age=3600',
  }),
  async (c: Context) => {
    const level = Number(c.req.param('level'));
    const x = Number(c.req.param('x'));
    const y = Number(c.req.param('y'));
    console.log(`🏗️ Generating tile ${level}/${x}/${y}`);

    if (isNaN(level) || isNaN(x) || isNaN(y)) {
      return c.json({ error: 'Invalid tile coordinates' }, 400);
    }

    const elevationFile = 'swissalti3d/swissalti3d_web_mercator.tif';
    const textureFile = 'swissimage-dop10/swissimage_web_mercator.tif';
    const elevationURL = `${c.env.R2_PUBLIC_ARPENTRY_ENDPOINT}/${elevationFile}`;
    const textureURL = `${c.env.R2_PUBLIC_ARPENTRY_ENDPOINT}/${textureFile}`;

    const { globalBounds, tilesetCenter } = await fetchGlobalBounds(elevationURL);

    try {
      // 1. Calculate tile bounds
      const tileBounds = calculateTileBounds(level, x, y, globalBounds);

      console.log(
        `   📍 Tile bounds: ${tileBounds.westDeg.toFixed(4)}°, ${tileBounds.southDeg.toFixed(4)}° to ${tileBounds.eastDeg.toFixed(4)}°, ${tileBounds.northDeg.toFixed(4)}°`,
      );
      console.log(
        `   📏 Size: ${(tileBounds.maxX - tileBounds.minX).toFixed(0)}m × ${(tileBounds.maxY - tileBounds.minY).toFixed(0)}m`,
      );

      // 2. Read elevation data
      const { data: elevationData, bbox: elevationBbox } =
        await readElevationData(elevationURL, tileBounds, TILE_SIZE);

      // 3. Generate terrain mesh
      const terrainMesh = generateTerrainMesh(elevationData, TILE_SIZE);

      // 4. Map coordinates to 3D positions
      const meshGeometry = mapCoordinates(
        terrainMesh.vertices,
        terrainMesh.terrainGrid,
        elevationBbox,
        tilesetCenter,
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

      // Compute normals and add to meshGeometry
      meshGeometry.normals = computeVertexNormals(
        meshGeometry.positions,
        triangleIndices.indices,
      );

      if (!triangleIndices.indices.length) {
        console.warn('   ⚠️ No valid triangles generated');
        return c.json({ error: 'Tile void' }, 404);
      }

      // 6. Generate optional texture
      const texture = await generateTexture(textureURL, tileBounds, TILE_SIZE);
      if (texture) {
        console.log('   🖼️ Texture generated');
      }

      // 7. Build glTF document
      const glbBuffer = await buildGltfDocument(
        meshGeometry.positions,
        meshGeometry.uvs,
        triangleIndices.indices,
        meshGeometry.normals,
        texture,
      );

      console.log(`   ✅ GLB generated: ${glbBuffer.byteLength} bytes`);

      return new Response(glbBuffer, {
        headers: {
          'Content-Type': 'model/gltf-binary',
          'Content-Disposition': `attachment; filename="${level}-${x}-${y}.glb"`,
        },
      });
    } catch (err) {
      console.error('GLB generation error:', err);
      return c.json({ error: 'Failed to generate tile' }, 500);
    }
  },
);

export default glb;
