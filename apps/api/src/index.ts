import { Hono, Context } from 'hono';
import { cors } from 'hono/cors';
import { cache } from 'hono/cache';
import { readGeoTiffMetadata } from './raster';
import { createTileset, parseGeometricErrorMethod } from './tiles';
import { generateTileGlb } from './pipeline';
import { memoize } from './memoize';
import {
  TILE_SIZE,
  QUADTREE_MAX_LEVEL,
  MIN_ELEVATION,
  MAX_ELEVATION,
  TILE_CACHE_DURATION,
  GLB_CONTENT_TYPE,
} from './constants';

/**
 * Shared environment bindings type
 */
export type Bindings = {
  ELEVATION_DATA_URL: string;
  TEXTURE_DATA_URL: string;
};

// Memoized metadata reader for performance optimization
export const memoizedTiffMetadata = memoize(readGeoTiffMetadata);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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

/**
 * Server
 */
const app = new Hono<{ Bindings: Bindings }>();

app.use(
  '*',
  cors({
    origin: '*',
  }),
);

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
app.get('/tileset.json', async (c: Context) => {
  try {
    const method = parseGeometricErrorMethod(c.req.query('method'));
    const { tilesetBounds: globalBounds, tilesetCenter } = await memoizedTiffMetadata(c.env.ELEVATION_DATA_URL);

    const tileset = createTileset(
      globalBounds,
      tilesetCenter,
      MIN_ELEVATION,
      MAX_ELEVATION,
      QUADTREE_MAX_LEVEL,
      method,
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
app.get(
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
      // Get tileset metadata
      const { tilesetBounds: globalBounds, tilesetCenter } = await memoizedTiffMetadata(c.env.ELEVATION_DATA_URL);

      // Generate GLB tile using extracted pipeline
      const glbBuffer = await generateTileGlb(
        c.env.ELEVATION_DATA_URL,
        c.env.TEXTURE_DATA_URL,
        level,
        x,
        y,
        globalBounds,
        tilesetCenter
      );

      return createGlbResponse(glbBuffer, level, x, y);

    } catch (err) {
      console.error('Failed to generate GLB tile:', { level, x, y, error: err });
      
      // Handle specific geometry error from pipeline
      if (err instanceof Error && err.message === 'Tile contains no valid geometry') {
        return c.json({ error: 'Tile contains no valid geometry' }, 404);
      }
      
      return c.json({ error: 'Failed to generate tile' }, 500);
    }
  },
);

export default app;
