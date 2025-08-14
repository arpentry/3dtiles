import { Bounds, Coordinate, tileToRegionSquare } from './geometry';
import { WGS84toEPSG3857 } from './projections';
import {
  TILES_VERSION,
  DEFAULT_UP_AXIS,
  QUAD_MULTIPLIER,
  ELEVATION_ERROR_FACTOR,
  MIN_GEOMETRIC_ERROR,
  DEM_RESOLUTION,
  RESOLUTION_SCALE_FACTOR,
} from './constants';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/** Tile bounds in both Web Mercator and geographic coordinates */
export interface TileBounds {
  /** Web Mercator minimum X (easting) */
  minX: number;
  /** Web Mercator minimum Y (northing) */
  minY: number;
  /** Web Mercator maximum X (easting) */
  maxX: number;
  /** Web Mercator maximum Y (northing) */
  maxY: number;
  /** Geographic west longitude in degrees */
  westDeg: number;
  /** Geographic south latitude in degrees */
  southDeg: number;
  /** Geographic east longitude in degrees */
  eastDeg: number;
  /** Geographic north latitude in degrees */
  northDeg: number;
}

/** Quadtree tile coordinates */
export interface TileCoordinates {
  /** Zoom level (0 = root) */
  level: number;
  /** Tile column index */
  x: number;
  /** Tile row index */
  y: number;
}

/** Quadrant definition for quadtree subdivision */
interface Quadrant {
  /** Child tile column index */
  x: number;
  /** Child tile row index */
  y: number;
  /** Quadrant minimum X bound (Web Mercator) */
  minX: number;
  /** Quadrant minimum Y bound (Web Mercator) */
  minY: number;
  /** Quadrant maximum X bound (Web Mercator) */
  maxX: number;
  /** Quadrant maximum Y bound (Web Mercator) */
  maxY: number;
}

/** 3D Tiles bounding volume using oriented bounding box */
export interface BoundingVolume {
  /** 12-element array defining center and half-axes of oriented bounding box */
  box: [
    number, number, number, // center (x, y, z)
    number, number, number, // x-axis half-extents (x, y, z)
    number, number, number, // y-axis half-extents (x, y, z) 
    number, number, number  // z-axis half-extents (x, y, z)
  ];
}

/** 3D Tiles tile content reference */
export interface TileContent {
  /** URI to the tile's content (GLB file) */
  uri: string;
}

/** 3D Tiles tile object */
export interface Tile {
  /** Bounding volume that encloses the tile */
  boundingVolume: BoundingVolume;
  /** Refinement strategy - typically 'REPLACE' for terrain */
  refine: 'REPLACE' | 'ADD';
  /** Screen-space error threshold for this tile */
  geometricError: number;
  /** Reference to tile content */
  content: TileContent;
  /** Child tiles in the quadtree */
  children: Tile[];
}

/** 3D Tiles asset metadata */
export interface TilesetAsset {
  /** 3D Tiles specification version */
  version: string;
  /** Coordinate system up-axis */
  gltfUpAxis?: 'Y' | 'Z';
}

/** Complete 3D Tiles tileset */
export interface Tileset {
  /** Asset metadata */
  asset: TilesetAsset;
  /** Root-level geometric error threshold */
  geometricError: number;
  /** Root tile of the tileset */
  root: Tile;
}

/** Geometric error calculation methods */
export enum GeometricErrorMethod {
  RESOLUTION_BASED = 'resolution-based',
  ELEVATION_BASED = 'elevation-based'
}

/** Default geometric error calculation method */
export const DEFAULT_GEOMETRIC_ERROR_METHOD = GeometricErrorMethod.RESOLUTION_BASED;

/**
 * Type guard to validate geometric error method string values
 * @param value - String value to validate
 * @returns True if value is a valid GeometricErrorMethod
 */
export function isValidGeometricErrorMethod(value: string): value is GeometricErrorMethod {
  return Object.values(GeometricErrorMethod).includes(value as GeometricErrorMethod);
}

/**
 * Parse geometric error method from string with fallback to default
 * @param value - String value to parse (from query parameter)
 * @returns Valid GeometricErrorMethod, defaults to ELEVATION_BASED if invalid/undefined
 */
export function parseGeometricErrorMethod(value: string | undefined): GeometricErrorMethod {
  if (value && isValidGeometricErrorMethod(value)) {
    return value;
  }
  return DEFAULT_GEOMETRIC_ERROR_METHOD;
}

// ============================================================================
// PRIVATE HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate geometric error using elevation-based method
 *
 * Uses elevation scaling as the basis for geometric error calculation, providing
 * consistent error thresholds regardless of DEM resolution.
 * Root error is calculated as elevation range × error factor.
 *
 * @param level - Quadtree level (0 = root)
 * @param elevationRange - Total elevation range (maxHeight - minHeight) in meters
 * @returns Geometric error threshold for screen-space error calculations
 */
function calculateElevationBasedError(level: number, elevationRange: number): number {
  const rootError = elevationRange * ELEVATION_ERROR_FACTOR;
  return Math.max(MIN_GEOMETRIC_ERROR, rootError / Math.pow(QUAD_MULTIPLIER, level));
}

/**
 * Calculate geometric error using resolution-based method
 *
 * Uses DEM resolution as the basis for geometric error calculation, providing
 * consistent error thresholds regardless of terrain elevation variation.
 * Root error is calculated as DEM resolution × scale factor.
 *
 * @param level - Quadtree level (0 = root)
 * @returns Geometric error threshold for screen-space error calculations
 */
function calculateResolutionBasedError(level: number): number {
  const rootError = DEM_RESOLUTION * RESOLUTION_SCALE_FACTOR;
  return Math.max(MIN_GEOMETRIC_ERROR, rootError / Math.pow(QUAD_MULTIPLIER, level));
}

/**
 * Calculate geometric error for a quadtree level
 *
 * Uses elevation-based scaling by default, or resolution-based when specified.
 * Elevation-based: root error is 2% of elevation range (terrain-appropriate)
 * Resolution-based: root error is DEM resolution × scale factor (consistent across terrain)
 *
 * @param level - Quadtree level (0 = root)
 * @param elevationRange - Total elevation range (maxHeight - minHeight) in meters
 * @param method - Geometric error calculation method
 * @returns Geometric error threshold for screen-space error calculations
 */
function calculateGeometricError(
  level: number,
  elevationRange: number,
  method: GeometricErrorMethod = GeometricErrorMethod.RESOLUTION_BASED
): number {
  switch (method) {
    case GeometricErrorMethod.RESOLUTION_BASED:
      return calculateResolutionBasedError(level);
    case GeometricErrorMethod.ELEVATION_BASED:
      return calculateElevationBasedError(level, elevationRange);
    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = method;
      return _exhaustive;
  }
}

/**
 * Generate content URI for a tile at given coordinates
 * 
 * @param level - Quadtree level
 * @param x - Tile column index  
 * @param y - Tile row index
 * @returns URI path to the tile's GLB content
 */
function generateContentUri(level: number, x: number, y: number): string {
  return `/tiles/${level}/${x}/${y}/tile.glb`;
}

/**
 * Create quadrant subdivision data for a tile
 * 
 * @param x - Parent tile column index
 * @param y - Parent tile row index  
 * @param minX - Parent tile minimum X bound
 * @param minY - Parent tile minimum Y bound
 * @param maxX - Parent tile maximum X bound
 * @param maxY - Parent tile maximum Y bound
 * @returns Array of 4 quadrant definitions (SW, SE, NW, NE)
 */
function createQuadrants(
  x: number,
  y: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): Quadrant[] {
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  
  return [
    { x: x * QUAD_MULTIPLIER, y: y * QUAD_MULTIPLIER, minX, minY, maxX: midX, maxY: midY }, // SW
    { x: x * QUAD_MULTIPLIER + 1, y: y * QUAD_MULTIPLIER, minX: midX, minY, maxX, maxY: midY }, // SE
    { x: x * QUAD_MULTIPLIER, y: y * QUAD_MULTIPLIER + 1, minX, minY: midY, maxX: midX, maxY }, // NW
    { x: x * QUAD_MULTIPLIER + 1, y: y * QUAD_MULTIPLIER + 1, minX: midX, minY: midY, maxX, maxY }, // NE
  ];
}

/**
 * Create a 3D Tiles tile with bounding volume and content
 */
function createTile(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  minHeight: number,
  maxHeight: number,
  centerX: number,
  centerY: number,
  geometricError: number,
  contentUri: string,
  children: Tile[] = [],
): Tile {
  // Calculate bounding box center (relative to tileset center)
  const boxCenterX = (minX + maxX) / 2 - centerX; // X = easting (centered)
  const boxCenterY = (minHeight + maxHeight) / 2; // Y = elevation
  const boxCenterZ = -((minY + maxY) / 2 - centerY); // Z = southing (centered)

  // Calculate bounding box dimensions
  const boxWidth = maxX - minX; // X extent (easting)
  const boxHeight = maxHeight - minHeight; // Y extent (elevation)
  const boxDepth = maxY - minY; // Z extent (northing)

  return {
    boundingVolume: {
      box: [
        boxCenterX,
        boxCenterY,
        boxCenterZ, // center
        boxWidth / 2,
        0,
        0, // X axis half-extents (easting)
        0,
        boxHeight / 2,
        0, // Y axis half-extents (elevation)
        0,
        0,
        boxDepth / 2, // Z axis half-extents (northing)
      ],
    },
    refine: 'REPLACE',
    geometricError,
    content: { uri: contentUri },
    children,
  };
}

/**
 * Create a quadtree of 3D Tiles with recursive subdivision
 *
 * This function implements the core quadtree subdivision logic for 3D Tiles,
 * recursively creating child tiles until the maximum level is reached.
 *
 * @param level - Current quadtree level (0 = root)
 * @param quadrant - Quadrant bounds and tile coordinates
 * @param minHeight - Minimum terrain height (meters)
 * @param maxHeight - Maximum terrain height (meters)
 * @param centerX - Tileset center X coordinate (Web Mercator)
 * @param centerY - Tileset center Y coordinate (Web Mercator)
 * @param maxLevel - Maximum subdivision level
 * @param method - Geometric error calculation method
 * @returns Complete quadtree tile with children (if not at max level)
 */
function createQuadtree(
  level: number,
  quadrant: Quadrant,
  minHeight: number,
  maxHeight: number,
  centerX: number,
  centerY: number,
  maxLevel: number,
  method: GeometricErrorMethod = GeometricErrorMethod.ELEVATION_BASED,
): Tile {
  const elevationRange = maxHeight - minHeight;
  const geometricError = calculateGeometricError(level, elevationRange, method);
  const contentUri = generateContentUri(level, quadrant.x, quadrant.y);
  
  // Create children if we haven't reached max level
  const children: Tile[] = [];
  if (level < maxLevel) {
    const childLevel = level + 1;
    const childQuadrants = createQuadrants(
      quadrant.x, 
      quadrant.y, 
      quadrant.minX, 
      quadrant.minY, 
      quadrant.maxX, 
      quadrant.maxY
    );

    for (const childQuadrant of childQuadrants) {
      const childTile = createQuadtree(
        childLevel,
        childQuadrant,
        minHeight,
        maxHeight,
        centerX,
        centerY,
        maxLevel,
        method,
      );
      children.push(childTile);
    }
  }

  return createTile(
    quadrant.minX,
    quadrant.minY,
    quadrant.maxX,
    quadrant.maxY,
    minHeight,
    maxHeight,
    centerX,
    centerY,
    geometricError,
    contentUri,
    children,
  );
}

// ============================================================================
// PUBLIC API FUNCTIONS
// ============================================================================

/**
 * Calculate tile bounds in both geographic and Web Mercator coordinates
 * 
 * Converts from quadtree tile coordinates to both geographic (degrees) and 
 * Web Mercator (meters) coordinate systems for raster data processing.
 * 
 * @param level - Quadtree zoom level
 * @param x - Tile column index
 * @param y - Tile row index  
 * @param globalBounds - Overall tileset bounds in Web Mercator
 * @returns Bounds in both coordinate systems
 */
export function calculateTileBounds(
  level: number,
  x: number,
  y: number,
  globalBounds: Bounds,
): TileBounds {
  const regionRad = tileToRegionSquare(globalBounds, level, x, y);
  const westDeg = (regionRad.west * 180) / Math.PI;
  const southDeg = (regionRad.south * 180) / Math.PI;
  const eastDeg = (regionRad.east * 180) / Math.PI;
  const northDeg = (regionRad.north * 180) / Math.PI;

  const [minX, minY] = WGS84toEPSG3857(westDeg, southDeg);
  const [maxX, maxY] = WGS84toEPSG3857(eastDeg, northDeg);

  return {
    minX,
    minY,
    maxX,
    maxY,
    westDeg,
    southDeg,
    eastDeg,
    northDeg,
  };
}

/**
 * Create a complete 3D Tiles tileset with recursive quadtree structure
 * 
 * This is the main entry point for creating a 3D Tiles tileset. It generates
 * a complete quadtree structure up to the specified maximum level, with proper
 * 3D Tiles metadata and geometric error calculations.
 * 
 * @param bounds - Tileset spatial bounds in Web Mercator [minX, minY, maxX, maxY]
 * @param center - Tileset center point in Web Mercator [x, y]
 * @param minHeight - Minimum terrain elevation in meters
 * @param maxHeight - Maximum terrain elevation in meters  
 * @param maxLevel - Maximum quadtree subdivision level (0 = root only)
 * @param method - Geometric error calculation method
 * @returns Complete 3D Tiles tileset ready for JSON serialization
 * ```
 */
export function createTileset(
  bounds: Bounds,
  center: Coordinate,
  minHeight: number,
  maxHeight: number,
  maxLevel: number,
  method: GeometricErrorMethod = GeometricErrorMethod.ELEVATION_BASED,
): Tileset {
  const rootQuadrant: Quadrant = {
    x: 0,
    y: 0,
    minX: bounds[0],
    minY: bounds[1],
    maxX: bounds[2],
    maxY: bounds[3],
  };

  const elevationRange = maxHeight - minHeight;

  return {
    asset: {
      version: TILES_VERSION,
      gltfUpAxis: DEFAULT_UP_AXIS,
    },
    geometricError: calculateGeometricError(0, elevationRange, method),
    root: createQuadtree(
      0, // level (root)
      rootQuadrant,
      minHeight,
      maxHeight,
      center[0], // centerX
      center[1], // centerY
      maxLevel,
      method,
    ),
  };
}
