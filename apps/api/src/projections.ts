import proj4 from 'proj4';
import {
  DEG_TO_RAD_FACTOR,
  WGS84_CRS,
  LV95_CRS,
  WEB_MERCATOR_CRS,
  WGS84_PROJ_DEF,
  LV95_PROJ_DEF,
  WEB_MERCATOR_PROJ_DEF,
} from './constants';

// ============================================================================
// PROJECTION SYSTEM SETUP
// ============================================================================

// Register coordinate system definitions with proj4
proj4.defs(WGS84_CRS, WGS84_PROJ_DEF);
proj4.defs(LV95_CRS, LV95_PROJ_DEF);
proj4.defs(WEB_MERCATOR_CRS, WEB_MERCATOR_PROJ_DEF);

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/** Coordinate pair [x, y] or [longitude, latitude] */
export type CoordinatePair = [number, number];

// ============================================================================
// PUBLIC API FUNCTIONS
// ============================================================================

/**
 * Convert Swiss LV95 coordinates to WGS84 geographic coordinates
 * 
 * Transforms coordinates from the Swiss national coordinate system (LV95)
 * to the global WGS84 coordinate system. LV95 uses an Oblique Mercator
 * projection optimized for Swiss territory.
 * 
 * @param x - LV95 easting coordinate in meters
 * @param y - LV95 northing coordinate in meters
 * @returns WGS84 coordinates [longitude, latitude] in degrees
 */
export function LV95toWGS84(x: number, y: number): CoordinatePair {
  return proj4(LV95_CRS, WGS84_CRS, [x, y]) as CoordinatePair;
}

/**
 * Convert Web Mercator coordinates to WGS84 geographic coordinates
 * 
 * Transforms coordinates from EPSG:3857 (Web Mercator) projection to
 * WGS84 geographic coordinates. Web Mercator is widely used by web
 * mapping services like Google Maps, OpenStreetMap, and others.
 * 
 * @param x - Web Mercator easting coordinate in meters
 * @param y - Web Mercator northing coordinate in meters
 * @returns WGS84 coordinates [longitude, latitude] in degrees
 */
export function EPSG3857toWGS84(x: number, y: number): CoordinatePair {
  return proj4(WEB_MERCATOR_CRS, WGS84_CRS, [x, y]) as CoordinatePair;
}

/**
 * Convert WGS84 geographic coordinates to Web Mercator coordinates
 * 
 * Transforms coordinates from WGS84 geographic system to EPSG:3857
 * (Web Mercator) projection. This is commonly used for web mapping
 * applications and tile-based mapping systems.
 * 
 * @param lon - WGS84 longitude in degrees (-180 to +180)
 * @param lat - WGS84 latitude in degrees (-85.0511 to +85.0511)
 * @returns Web Mercator coordinates [x, y] in meters
 */
export function WGS84toEPSG3857(lon: number, lat: number): CoordinatePair {
  return proj4(WGS84_CRS, WEB_MERCATOR_CRS, [lon, lat]) as CoordinatePair;
}

/**
 * Convert degrees to radians
 * 
 * Utility function for angular unit conversion. Commonly used when
 * working with 3D Tiles specification which requires angles in radians,
 * or when performing trigonometric calculations.
 * 
 * @param deg - Angle in degrees
 * @returns Angle in radians
 */
export function degToRad(deg: number): number {
  return deg * DEG_TO_RAD_FACTOR;
}

/**
 * Convert radians to degrees
 * 
 * Utility function for angular unit conversion. Useful when converting
 * from mathematical calculations back to human-readable degree format.
 * 
 * @param rad - Angle in radians
 * @returns Angle in degrees
 */
export function radToDeg(rad: number): number {
  return rad / DEG_TO_RAD_FACTOR;
}
