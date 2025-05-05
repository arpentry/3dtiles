import proj4 from "proj4";

proj4.defs(
  "WGS84",
  "+title=WGS 84 (long/lat) +proj=longlat +ellps=WGS84 +datum=WGS84 +units=degrees",
);

proj4.defs(
  "LV95",
  "+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs",
);

/**
 * Convert LV95 coordinates to WGS84 coordinates
 * @param x LV95 x coordinate
 * @param y LV95 y coordinate
 * @returns WGS84 coordinates
 */
const LV95toWGS84 = (x: number, y: number) => {
  return proj4("LV95", "WGS84", [x, y]);
};

/**
 * Convert degrees to radians
 * @param deg Degrees
 * @returns Radians
 */
const degToRad = (deg: number) => {
  return deg * (Math.PI / 180);
};

export { LV95toWGS84, degToRad };
