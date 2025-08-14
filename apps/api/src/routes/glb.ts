import { Hono, Context } from 'hono';
import { cache } from 'hono/cache';
import {
  readElevationDataFromGeoTiff,
  readTextureDataFromGeoTiff,
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

// ============================================================================
// CONSTANTS
// ============================================================================

/** Tile resolution in pixels (grid will be TILE_SIZE + 1) */
export const TILE_SIZE = 512;

/** Maximum quadtree subdivision level for 3D Tiles */
export const QUADTREE_MAX_LEVEL = 5;

/** Swiss terrain minimum elevation in meters */
const SWISS_MIN_ELEVATION = 0;

/** Swiss terrain maximum elevation in meters */
const SWISS_MAX_ELEVATION = 4500;

/** Cache duration for tile responses in seconds */
const TILE_CACHE_DURATION = 3600;

/** Swiss elevation data file path */
const SWISS_ELEVATION_FILE = 'swissalti3d/swissalti3d_web_mercator.tif';

/** Swiss texture data file path */
const SWISS_TEXTURE_FILE = 'swissimage-dop10/swissimage_web_mercator.tif';

/** GLB content type for HTTP responses */
const GLB_CONTENT_TYPE = 'model/gltf-binary';

// ============================================================================
// ROUTE SETUP
// ============================================================================

const glb = new Hono<{ Bindings: Bindings }>();

// Memoized metadata reader for performance optimization
export const memoizedTiffMetadata = memoize(readGeoTiffMetadata);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build data URL from environment and file path
 * 
 * @param env - Environment bindings
 * @param filePath - Path to the data file
 * @returns Complete URL to the data file
 */
function buildDataUrl(env: Bindings, filePath: string): string {
  return `${env.R2_PUBLIC_ARPENTRY_ENDPOINT}/${filePath}`;
}

/**
 * Validate tile coordinates from route parameters
 * 
 * @param level - Quadtree level parameter
 * @param x - Tile X coordinate parameter
 * @param y - Tile Y coordinate parameter
 * @returns Validation result with parsed coordinates or error
 */
function validateTileCoordinates(level: string, x: string, y: string): 
  { valid: true; level: number; x: number; y: number } | 
  { valid: false; error: string } {
  
  const parsedLevel = Number(level);
  const parsedX = Number(x);
  const parsedY = Number(y);

  if (isNaN(parsedLevel) || isNaN(parsedX) || isNaN(parsedY)) {
    return { valid: false, error: 'Invalid tile coordinates - must be numbers' };
  }

  if (parsedLevel < 0 || parsedLevel > QUADTREE_MAX_LEVEL) {
    return { valid: false, error: `Invalid level - must be between 0 and ${QUADTREE_MAX_LEVEL}` };
  }

  if (parsedX < 0 || parsedY < 0) {
    return { valid: false, error: 'Invalid coordinates - must be non-negative' };
  }

  return { valid: true, level: parsedLevel, x: parsedX, y: parsedY };
}

/**
 * Create GLB response with proper headers
 * 
 * @param glbBuffer - Binary GLB data
 * @param level - Tile level for filename
 * @param x - Tile X coordinate for filename
 * @param y - Tile Y coordinate for filename
 * @returns HTTP Response with GLB data
 */
function createGlbResponse(glbBuffer: Uint8Array, level: number, x: number, y: number): Response {
  return new Response(glbBuffer, {
    headers: {
      'Content-Type': GLB_CONTENT_TYPE,
      'Content-Disposition': `attachment; filename="${level}-${x}-${y}.glb"`,
    },
  });
}

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

/**
 * Tileset JSON endpoint - provides 3D Tiles structure
 * 
 * Returns the root tileset.json file that defines the quadtree structure
 * and spatial bounds for the 3D Tiles dataset. Clients use this to
 * understand the tile hierarchy and begin loading terrain data.
 */
glb.get('/tileset.json', async (c: Context) => {
  try {
    const elevationUrl = buildDataUrl(c.env, SWISS_ELEVATION_FILE);
    const { tilesetBounds: globalBounds, tilesetCenter } = await memoizedTiffMetadata(elevationUrl);

    const tileset = createTileset(
      globalBounds,
      tilesetCenter,
      SWISS_MIN_ELEVATION,
      SWISS_MAX_ELEVATION,
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
 * 
 * Processes elevation and texture data to generate a single 3D Tiles GLB file
 * for the specified tile coordinates. The pipeline includes:
 * 1. Coordinate validation and bounds calculation
 * 2. Elevation data reading and mesh generation
 * 3. Texture data reading and material creation
 * 4. GLB assembly and response formatting
 */
glb.get(
  '/tiles/:level/:x/:y/tile.glb',
  cache({
    cacheName: 'tiles',
    cacheControl: `max-age=${TILE_CACHE_DURATION}`,
  }),
  async (c: Context) => {
    // Validate and parse tile coordinates
    const validation = validateTileCoordinates(
      c.req.param('level'),
      c.req.param('x'),
      c.req.param('y')
    );

    if (!validation.valid) {
      return c.json({ error: validation.error }, 400);
    }

    const { level, x, y } = validation;

    try {
      // Build data URLs
      const elevationUrl = buildDataUrl(c.env, SWISS_ELEVATION_FILE);
      const textureUrl = buildDataUrl(c.env, SWISS_TEXTURE_FILE);

      // Get tileset metadata
      const { tilesetBounds: globalBounds, tilesetCenter } = await memoizedTiffMetadata(elevationUrl);

      // Calculate spatial bounds for this tile
      const tileBounds = calculateTileBounds(level, x, y, globalBounds);

      // Read elevation data and generate terrain mesh
      const { data: elevationData, bbox: elevationBbox } = 
        await readElevationDataFromGeoTiff(elevationUrl, tileBounds, TILE_SIZE);
      
      const terrainMesh = generateTerrainMesh(elevationData, TILE_SIZE);

      // Transform grid coordinates to 3D world positions
      const meshGeometry = mapCoordinates(
        terrainMesh.vertices,
        terrainMesh.terrainGrid,
        elevationBbox,
        tilesetCenter,
        TILE_SIZE,
      );

      // Build triangle indices and compute vertex normals
      const triangleIndices = buildTriangleIndices(terrainMesh.triangles, meshGeometry.vertexMap);
      
      if (!triangleIndices.indices.length) {
        console.error('No valid triangles generated for tile', { level, x, y });
        return c.json({ error: 'Tile contains no valid geometry' }, 404);
      }

      meshGeometry.normals = computeVertexNormals(meshGeometry.positions, triangleIndices.indices);

      // Read texture data for material
      const texture = await readTextureDataFromGeoTiff(textureUrl, tileBounds, TILE_SIZE);

      // Generate GLB document
      const glbBuffer = await createGltfDocument(
        meshGeometry.positions,
        meshGeometry.uvs,
        triangleIndices.indices,
        meshGeometry.normals,
        texture,
      );

      return createGlbResponse(glbBuffer, level, x, y);

    } catch (err) {
      console.error('Failed to generate GLB tile:', { level, x, y, error: err });
      return c.json({ error: 'Failed to generate tile' }, 500);
    }
  },
);

export default glb;
