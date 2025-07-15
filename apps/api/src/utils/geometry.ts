import { WGS84toEPSG3857, EPSG3857toWGS84, degToRad } from './projections';

/** A geographic bounding region as used by 3D Tiles 1.1 (radians + metres). */
export interface BoundingRegion {
  west: number; // longitude,  radians
  south: number; // latitude,   radians
  east: number; // longitude,  radians
  north: number; // latitude,   radians
  minH: number; // metres
  maxH: number; // metres
}

/**
 * Compute the bounding region of a quadtree tile.
 *
 * @param root     Full-extent region for level 0 (usually the implicit-root tile).
 * @param level    0-based quadtree level.
 * @param x,y      Horizontal tile indices in that level (0 ≤ index < 2^level).
 * @param splitH   If true, length is halved each level; otherwise length stays constant.
 */
export function tileToRegion(
  root: BoundingRegion,
  level: number,
  x: number,
  y: number,
  splitH = false,
): BoundingRegion {
  const div = 1 << level; // 2^level
  const lonStep = (root.east - root.west) / div; // Δλ per tile
  const latStep = (root.north - root.south) / div; // Δφ per tile

  const west = root.west + lonStep * x; // west → east is +λ
  const east = west + lonStep;
  const south = root.south + latStep * y; // south → north is +φ
  const north = south + latStep;

  let { minH, maxH } = root;
  if (splitH && level > 0) {
    const hStep = (root.maxH - root.minH) / div; // follow same rule for z (length)
    minH = root.minH + hStep * y; // use y as proxy for z-slice; adapt if you store z
    maxH = minH + hStep;
  }
  return { west, south, east, north, minH, maxH };
}

/**
 * Return the (x, y) tile coordinates that contain the given longitude/latitude.
 *
 * @param root   The bounding region of the implicit-root tile.
 * @param level  Quadtree level (0 = root).
 * @param lon    Longitude in **radians** (WGS 84, same units as the spec).
 * @param lat    Latitude  in **radians**.
 *
 * @throws RangeError if the point lies outside the root region.
 */
export function lonLatToTile(
  root: BoundingRegion,
  level: number,
  lon: number,
  lat: number,
): { x: number; y: number } {
  if (
    lon < root.west ||
    lon > root.east ||
    lat < root.south ||
    lat > root.north
  ) {
    throw new RangeError('Position is outside the root bounding region');
  }

  const div = 1 << level; // = 2^level
  const sizeX = (root.east - root.west) / div; // Δλ per tile
  const sizeY = (root.north - root.south) / div; // Δφ per tile

  // Compute zero-based indices (west→east, south→north)
  const x = Math.min(div - 1, Math.floor((lon - root.west) / sizeX));
  const y = Math.min(div - 1, Math.floor((lat - root.south) / sizeY));

  return { x, y };
}

/**
 * Compute the bounding region of a quadtree tile in EPSG:3857 (Web Mercator) coordinates
 * that results in square tiles with consistent pixel density.
 *
 * @param rootBounds   Full-extent bounds in EPSG:3857 for level 0 [minX, minY, maxX, maxY]
 * @param level        0-based quadtree level
 * @param x,y          Horizontal tile indices in that level (0 ≤ index < 2^level)
 * @returns            Bounding region in WGS84 radians for 3D Tiles compatibility
 */
export function tileToRegionSquare(
  rootBounds: [number, number, number, number], // [minX, minY, maxX, maxY] in EPSG:3857
  level: number,
  x: number,
  y: number,
): BoundingRegion {
  const div = 1 << level; // 2^level

  // Calculate tile size in EPSG:3857 meters
  const width = rootBounds[2] - rootBounds[0];
  const length = rootBounds[3] - rootBounds[1];
  const tileWidth = width / div;
  const tileLength = length / div;

  // Calculate EPSG:3857 bounds for this specific tile
  const minX = rootBounds[0] + tileWidth * x;
  const maxX = minX + tileWidth;
  const minY = rootBounds[1] + tileLength * y;
  const maxY = minY + tileLength;

  // Convert EPSG:3857 corners to WGS84
  const [westDeg, southDeg] = EPSG3857toWGS84(minX, minY);
  const [eastDeg, northDeg] = EPSG3857toWGS84(maxX, maxY);

  // Convert to radians for 3D Tiles compatibility
  return {
    west: degToRad(westDeg),
    south: degToRad(southDeg),
    east: degToRad(eastDeg),
    north: degToRad(northDeg),
    minH: 0,
    maxH: 5000, // Adjust based on your use case
  };
}

/**
 * Create a square bounding box in EPSG:3857 that encompasses the given rectangular bounds
 * This ensures proper TMS tile pyramid geometry with square tiles
 */
export function createSquareBounds(
  bbox: [number, number, number, number],
): [number, number, number, number] {
  const [minX, minY, maxX, maxY] = bbox;
  const width = maxX - minX;
  const length = maxY - minY;
  const maxSize = Math.max(width, length);

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return [
    centerX - maxSize / 2,
    centerY - maxSize / 2,
    centerX + maxSize / 2,
    centerY + maxSize / 2,
  ];
}

/**
 * Get standard Web Mercator bounds for Switzerland
 * These bounds ensure square tiles and good coverage of Swiss territory
 */
export function getSwissWebMercatorBounds(): [number, number, number, number] {
  // Switzerland bounds in WGS84: approximately [5.95587, 45.81802, 10.49203, 47.80838]
  const [minX, minY] = WGS84toEPSG3857(5.95587, 45.81802);
  const [maxX, maxY] = WGS84toEPSG3857(10.49203, 47.80838);

  // Make bounds square by expanding the smaller dimension
  const width = maxX - minX;
  const length = maxY - minY;
  const maxSize = Math.max(width, length);

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return [
    centerX - maxSize / 2,
    centerY - maxSize / 2,
    centerX + maxSize / 2,
    centerY + maxSize / 2,
  ];
}
