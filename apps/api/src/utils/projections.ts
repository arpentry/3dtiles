import proj4 from 'proj4';

// Define coordinate systems
proj4.defs(
  'WGS84',
  '+title=WGS 84 (long/lat) +proj=longlat +ellps=WGS84 +datum=WGS84 +units=degrees',
);

proj4.defs(
  'LV95',
  '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs',
);

proj4.defs(
  'EPSG:3857',
  '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs',
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
 * Convert EPSG:3857 (Web Mercator) coordinates to WGS84 coordinates
 * @param x EPSG:3857 x coordinate (easting)
 * @param y EPSG:3857 y coordinate (northing)
 * @returns WGS84 coordinates [longitude, latitude] in degrees
 */
export function EPSG3857toWGS84(x: number, y: number) {
  return proj4('EPSG:3857', 'WGS84', [x, y]);
}

/**
 * Convert WGS84 coordinates to EPSG:3857 (Web Mercator) coordinates
 * @param lon WGS84 longitude in degrees
 * @param lat WGS84 latitude in degrees
 * @returns EPSG:3857 coordinates [x, y] in meters
 */
export function WGS84toEPSG3857(lon: number, lat: number) {
  return proj4('WGS84', 'EPSG:3857', [lon, lat]);
}

/**
 * Convert degrees to radians
 * @param deg Degrees
 * @returns Radians
 */
export function degToRad(deg: number) {
  return deg * (Math.PI / 180);
} 