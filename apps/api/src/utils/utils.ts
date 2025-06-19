import proj4 from 'proj4';

proj4.defs(
  'WGS84',
  '+title=WGS 84 (long/lat) +proj=longlat +ellps=WGS84 +datum=WGS84 +units=degrees',
);

proj4.defs(
  'LV95',
  '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs',
);

/**
 * Convert LV95 coordinates to WGS84 coordinates
 * @param x LV95 x coordinate
 * @param y LV95 y coordinate
 * @returns WGS84 coordinates
 */
export function LV95toWGS84(x: number, y: number) {
  return proj4('LV95', 'WGS84', [x, y]);
}

/**
 * Convert degrees to radians
 * @param deg Degrees
 * @returns Radians
 */
export function degToRad(deg: number) {
  return deg * (Math.PI / 180);
}

/** A geographic bounding region as used by 3D Tiles 1.1 (radians + metres). */
export interface BoundingRegion {
  west:  number;  // longitude,  radians
  south: number;  // latitude,   radians
  east:  number;  // longitude,  radians
  north: number;  // latitude,   radians
  minH:  number;  // metres
  maxH:  number;  // metres
}

/**
 * Compute the bounding region of a quadtree tile.
 *
 * @param root     Full-extent region for level 0 (usually the implicit-root tile).
 * @param level    0-based quadtree level.
 * @param x,y      Horizontal tile indices in that level (0 ≤ index < 2^level).
 * @param splitH   If true, height is halved each level; otherwise height stays constant.
 */
export function tileToRegion(
  root: BoundingRegion,
  level: number,
  x: number,
  y: number,
  splitH = false
): BoundingRegion {
  const div = 1 << level;                           // 2^level
  const lonStep = (root.east  - root.west)  / div;  // Δλ per tile
  const latStep = (root.north - root.south) / div;  // Δφ per tile

  const west  = root.west  + lonStep * x;           // west → east is +λ :contentReference[oaicite:1]{index=1}
  const east  = west + lonStep;
  const south = root.south + latStep * y;           // south → north is +φ :contentReference[oaicite:2]{index=2}
  const north = south + latStep;

  let { minH, maxH } = root;
  if (splitH && level > 0) {
    const hStep = (root.maxH - root.minH) / div;    // follow same rule for z (height)
    minH = root.minH + hStep * y;                   // use y as proxy for z-slice; adapt if you store z
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
  if (lon < root.west || lon > root.east ||
      lat < root.south || lat > root.north) {
    throw new RangeError("Position is outside the root bounding region");
  }

  const div   = 1 << level;                       // = 2^level
  const sizeX = (root.east  - root.west)  / div;  // Δλ per tile
  const sizeY = (root.north - root.south) / div;  // Δφ per tile

  // Compute zero-based indices (west→east, south→north) :contentReference[oaicite:0]{index=0}
  const x = Math.min(
    div - 1,
    Math.floor((lon - root.west)  / sizeX),
  );
  const y = Math.min(
    div - 1,
    Math.floor((lat - root.south) / sizeY),
  );

  return { x, y };
}
