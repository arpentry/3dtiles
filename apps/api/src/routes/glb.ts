import { Hono, Context } from 'hono';
import { cache } from 'hono/cache';
import {
  readElevationDataFromGeoTiff,
  createTextureFromGeoTiff,
  readGeoTiffMetadata,
} from '../services/raster';
import {
  generateTerrainMesh,
  mapCoordinates,
  buildTriangleIndices,
  computeVertexNormals,
} from '../services/mesh';
import { createGltfDocument } from '../services/gltf';
import { calculateTileBounds, createTileset } from '../services/tiles';
import { Bindings } from '../index';
import { memoize } from '../utils/memoize';

export const TILE_SIZE = 512;
export const QUADTREE_MAX_LEVEL = 5;

const glb = new Hono<{ Bindings: Bindings }>();

export const memoizedTiffMetadata = memoize(readGeoTiffMetadata);

/**
 * Tileset JSON endpoint - provides 3D Tiles structure
 */
glb.get('/tileset.json', async (c: Context) => {
  try {
    const elevKey = 'swissalti3d/swissalti3d_web_mercator.tif';
    const url = `${c.env.R2_PUBLIC_ARPENTRY_ENDPOINT}/${elevKey}`;

    const { tilesetBounds: globalBounds, tilesetCenter: tilesetCenter } = await memoizedTiffMetadata(url);

    const minH = 0;
    const maxH = 4500; // Swiss terrain height range

    const tileset = createTileset(
      globalBounds,
      tilesetCenter,
      minH,
      maxH,
      QUADTREE_MAX_LEVEL,
    );

    return c.json(tileset);
  } catch (err) {
    console.error('Failed to build tileset:', err);
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

    if (isNaN(level) || isNaN(x) || isNaN(y)) {
      return c.json({ error: 'Invalid tile coordinates' }, 400);
    }

    const elevationFile = 'swissalti3d/swissalti3d_web_mercator.tif';
    const textureFile = 'swissimage-dop10/swissimage_web_mercator.tif';
    const elevationURL = `${c.env.R2_PUBLIC_ARPENTRY_ENDPOINT}/${elevationFile}`;
    const textureURL = `${c.env.R2_PUBLIC_ARPENTRY_ENDPOINT}/${textureFile}`;

    const { tilesetBounds: globalBounds, tilesetCenter: tilesetCenter } = await memoizedTiffMetadata(elevationURL);

    try {
      // 1. Calculate tile bounds
      const tileBounds = calculateTileBounds(level, x, y, globalBounds);

      // 2. Read elevation data
      const { data: elevationData, bbox: elevationBbox } =
        await readElevationDataFromGeoTiff(elevationURL, tileBounds, TILE_SIZE);

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
        console.error('No valid triangles generated for tile', { level, x, y });
        return c.json({ error: 'Tile void' }, 404);
      }

      // 6. Generate optional texture
      const texture = await createTextureFromGeoTiff(textureURL, tileBounds, TILE_SIZE);

      // 7. Build glTF document
      const glbBuffer = await createGltfDocument(
        meshGeometry.positions,
        meshGeometry.uvs,
        triangleIndices.indices,
        meshGeometry.normals,
        texture,
      );

      return new Response(glbBuffer, {
        headers: {
          'Content-Type': 'model/gltf-binary',
          'Content-Disposition': `attachment; filename="${level}-${x}-${y}.glb"`,
        },
      });
    } catch (err) {
      console.error('Failed to generate GLB tile:', err);
      return c.json({ error: 'Failed to generate tile' }, 500);
    }
  },
);

export default glb;
