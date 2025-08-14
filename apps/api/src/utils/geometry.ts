import { WGS84toEPSG3857, EPSG3857toWGS84, degToRad } from './projections';
import {
  DEFAULT_MAX_HEIGHT,
  DEFAULT_MIN_HEIGHT,
  SWITZERLAND_WGS84_BOUNDS,
} from '../constants';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/** Web Mercator bounds as [minX, minY, maxX, maxY] in meters */
export type Bounds = [number, number, number, number];

/** A coordinate pair [x, y] in any coordinate system */
export type Coordinate = [number, number];

/** Tile coordinates in a quadtree structure */
export interface TileCoordinates {
  /** Tile column index (0 ≤ x < 2^level) */
  x: number;
  /** Tile row index (0 ≤ y < 2^level) */
  y: number;
}

/** 
 * Geographic bounding region as used by 3D Tiles 1.1 specification
 * All coordinates are in radians for longitude/latitude, meters for height
 */
export interface BoundingRegion {
  /** Western longitude boundary in radians */
  west: number;
  /** Southern latitude boundary in radians */
  south: number;
  /** Eastern longitude boundary in radians */
  east: number;
  /** Northern latitude boundary in radians */
  north: number;
  /** Minimum height in meters */
  minH: number;
  /** Maximum height in meters */
  maxH: number;
}

// ============================================================================
// PRIVATE HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate quadtree subdivision factor for a given level
 * 
 * @param level - Quadtree level (0 = root)
 * @returns Number of tiles per dimension at this level (2^level)
 */
function calculateQuadtreeDivision(level: number): number {
  return 1 << level; // 2^level
}

/**
 * Clamp tile coordinates to valid range for the given level
 * 
 * @param coordinate - Tile coordinate to clamp
 * @param maxValue - Maximum valid coordinate (exclusive)
 * @returns Clamped coordinate
 */
function clampTileCoordinate(coordinate: number, maxValue: number): number {
  return Math.min(maxValue - 1, Math.max(0, Math.floor(coordinate)));
}

// ============================================================================
// PUBLIC API FUNCTIONS
// ============================================================================

/**
 * Compute the bounding region of a quadtree tile in geographic coordinates
 * 
 * Calculates the geographic bounds of a specific tile within a quadtree
 * hierarchy. Supports optional height subdivision for 3D applications.
 * 
 * @param root - Full-extent region for level 0 (root tile bounds)
 * @param level - 0-based quadtree level
 * @param x - Tile column index (0 ≤ x < 2^level)
 * @param y - Tile row index (0 ≤ y < 2^level)
 * @param splitH - If true, height is subdivided each level; otherwise constant
 * @returns Bounding region for the specified tile
 */
export function tileToRegion(
  root: BoundingRegion,
  level: number,
  x: number,
  y: number,
  splitH = false,
): BoundingRegion {
  const div = calculateQuadtreeDivision(level);
  const lonStep = (root.east - root.west) / div; // Longitude step per tile
  const latStep = (root.north - root.south) / div; // Latitude step per tile

  const west = root.west + lonStep * x;
  const east = west + lonStep;
  const south = root.south + latStep * y;
  const north = south + latStep;

  let { minH, maxH } = root;
  if (splitH && level > 0) {
    const hStep = (root.maxH - root.minH) / div;
    minH = root.minH + hStep * y; // Use y as proxy for height subdivision
    maxH = minH + hStep;
  }

  return { west, south, east, north, minH, maxH };
}

/**
 * Find tile coordinates that contain a given geographic point
 * 
 * Converts a longitude/latitude point to tile coordinates within
 * a quadtree at the specified level. Useful for spatial indexing
 * and tile-based data queries.
 * 
 * @param root - The bounding region of the root tile
 * @param level - Quadtree level (0 = root)
 * @param lon - Longitude in radians (WGS84)
 * @param lat - Latitude in radians (WGS84)
 * @returns Tile coordinates containing the point
 * @throws RangeError if the point lies outside the root region
 */
export function lonLatToTile(
  root: BoundingRegion,
  level: number,
  lon: number,
  lat: number,
): TileCoordinates {
  if (
    lon < root.west ||
    lon > root.east ||
    lat < root.south ||
    lat > root.north
  ) {
    throw new RangeError('Position is outside the root bounding region');
  }

  const div = calculateQuadtreeDivision(level);
  const sizeX = (root.east - root.west) / div;
  const sizeY = (root.north - root.south) / div;

  // Compute tile indices with proper clamping
  const x = clampTileCoordinate((lon - root.west) / sizeX, div);
  const y = clampTileCoordinate((lat - root.south) / sizeY, div);

  return { x, y };
}

/**
 * Compute Web Mercator tile bounds and convert to geographic bounding region
 * 
 * Creates square tiles in Web Mercator projection for consistent pixel density,
 * then converts the bounds to WGS84 radians for 3D Tiles compatibility.
 * This approach ensures proper tile pyramid geometry.
 * 
 * @param rootBounds - Full-extent bounds in EPSG:3857 [minX, minY, maxX, maxY]
 * @param level - 0-based quadtree level
 * @param x - Tile column index (0 ≤ x < 2^level)
 * @param y - Tile row index (0 ≤ y < 2^level)
 * @returns Bounding region in WGS84 radians for 3D Tiles compatibility
 */
export function tileToRegionSquare(
  rootBounds: Bounds,
  level: number,
  x: number,
  y: number,
): BoundingRegion {
  const div = calculateQuadtreeDivision(level);

  // Calculate tile dimensions in Web Mercator meters
  const width = rootBounds[2] - rootBounds[0];
  const height = rootBounds[3] - rootBounds[1];
  const tileWidth = width / div;
  const tileHeight = height / div;

  // Calculate Web Mercator bounds for this specific tile
  const minX = rootBounds[0] + tileWidth * x;
  const maxX = minX + tileWidth;
  const minY = rootBounds[1] + tileHeight * y;
  const maxY = minY + tileHeight;

  // Convert Web Mercator corners to WGS84 degrees
  const [westDeg, southDeg] = EPSG3857toWGS84(minX, minY);
  const [eastDeg, northDeg] = EPSG3857toWGS84(maxX, maxY);

  // Convert to radians for 3D Tiles specification compliance
  return {
    west: degToRad(westDeg),
    south: degToRad(southDeg),
    east: degToRad(eastDeg),
    north: degToRad(northDeg),
    minH: DEFAULT_MIN_HEIGHT,
    maxH: DEFAULT_MAX_HEIGHT,
  };
}

/**
 * Create square bounding box from rectangular bounds
 * 
 * Expands rectangular bounds to create a square bounding box centered
 * on the original bounds. This ensures proper TMS tile pyramid geometry
 * with consistent aspect ratios and prevents distortion.
 * 
 * @param bbox - Input bounds [minX, minY, maxX, maxY]
 * @returns Square bounds [minX, minY, maxX, maxY]
 */
export function createSquareBounds(bbox: Bounds): Bounds {
  const [minX, minY, maxX, maxY] = bbox;
  const width = maxX - minX;
  const height = maxY - minY;
  const maxSize = Math.max(width, height);

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const halfSize = maxSize / 2;

  return [
    centerX - halfSize,
    centerY - halfSize,
    centerX + halfSize,
    centerY + halfSize,
  ];
}

/**
 * Get standard Web Mercator bounds for Switzerland
 * 
 * Returns pre-calculated square bounds optimized for Swiss territory
 * coverage. These bounds ensure proper tile pyramid geometry and
 * efficient spatial indexing for Swiss geospatial data.
 * 
 * @returns Square Web Mercator bounds for Switzerland [minX, minY, maxX, maxY]
 */
export function getSwissWebMercatorBounds(): Bounds {
  const [westDeg, southDeg, eastDeg, northDeg] = SWITZERLAND_WGS84_BOUNDS;
  
  // Convert WGS84 bounds to Web Mercator
  const [minX, minY] = WGS84toEPSG3857(westDeg, southDeg);
  const [maxX, maxY] = WGS84toEPSG3857(eastDeg, northDeg);

  // Ensure square bounds for consistent tile geometry
  return createSquareBounds([minX, minY, maxX, maxY]);
}
