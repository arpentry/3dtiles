// ============================================================================
// SHARED CONSTANTS
// ============================================================================
// This file contains constants shared across multiple services to avoid
// duplication and ensure consistency throughout the application.

// ============================================================================
// GEOMETRIC & MATH CONSTANTS
// ============================================================================

/** Number of components per 3D vertex (x, y, z) */
export const VERTEX_COMPONENTS_3D = 3;

/** Number of components per 2D vertex (x, y) */
export const VERTEX_COMPONENTS_2D = 2;

/** Number of vertices per triangle */
export const TRIANGLE_VERTICES = 3;

/** Number of color channels in RGBA format */
export const RGBA_CHANNELS = 4;

/** Degrees to radians conversion factor */
export const DEG_TO_RAD_FACTOR = Math.PI / 180;

// ============================================================================
// COORDINATE SYSTEM CONSTANTS
// ============================================================================

/** WGS84 coordinate system identifier */
export const WGS84_CRS = 'WGS84';

/** Swiss LV95 coordinate system identifier */
export const LV95_CRS = 'LV95';

/** Web Mercator (EPSG:3857) coordinate system identifier */
export const WEB_MERCATOR_CRS = 'EPSG:3857';

/** WGS84 (World Geodetic System 1984) projection definition */
export const WGS84_PROJ_DEF = '+title=WGS 84 (long/lat) +proj=longlat +ellps=WGS84 +datum=WGS84 +units=degrees';

/** 
 * Swiss LV95 (Landesvermessung 1995) projection definition
 * Official Swiss coordinate system using Oblique Mercator projection
 */
export const LV95_PROJ_DEF = '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs';

/** 
 * Web Mercator (EPSG:3857) projection definition
 * Spherical Mercator projection used by web mapping services
 */
export const WEB_MERCATOR_PROJ_DEF = '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs';

// ============================================================================
// GEOGRAPHIC BOUNDS CONSTANTS
// ============================================================================

/** Swiss terrain minimum elevation in meters */
export const MIN_ELEVATION = -10000;

/** Swiss terrain maximum elevation in meters */
export const MAX_ELEVATION = 10000;

/** Switzerland WGS84 bounds: [west, south, east, north] in degrees */
export const SWITZERLAND_WGS84_BOUNDS = [5.95587, 45.81802, 10.49203, 47.80838] as const;

// ============================================================================
// TILE PROCESSING CONSTANTS
// ============================================================================

/** Tile resolution in pixels (grid will be TILE_SIZE + 1) */
export const TILE_SIZE = 512;

/** Maximum quadtree subdivision level for 3D Tiles */
export const QUADTREE_MAX_LEVEL = 5;

/** Cache duration for tile responses in seconds */
export const TILE_CACHE_DURATION = 3600;

// ============================================================================
// DATA PROCESSING CONSTANTS
// ============================================================================

/** Default no-data value for elevation rasters */
export const ELEVATION_NO_DATA = -9999;

/** Default mesh error threshold for terrain simplification */
export const DEFAULT_MESH_ERROR = 10;

/** RGBA alpha channel value for opaque pixels */
export const ALPHA_OPAQUE = 255;

// ============================================================================
// GRAPHICS & RENDERING CONSTANTS
// ============================================================================

/** Threshold for switching from 16-bit to 32-bit indices in WebGL */
export const INDEX_16BIT_LIMIT = 65535;

/** PNG MIME type for embedded textures */
export const PNG_MIME_TYPE = 'image/png';

/** GLB content type for HTTP responses */
export const GLB_CONTENT_TYPE = 'model/gltf-binary';

/** Default base color for terrain materials (white) */
export const DEFAULT_BASE_COLOR: [number, number, number, number] = [1, 1, 1, 1];

/** Default roughness factor for terrain surfaces (semi-glossy) */
export const DEFAULT_ROUGHNESS_FACTOR = 0.95;

/** Default metallic factor for terrain (non-metallic) */
export const DEFAULT_METALLIC_FACTOR = 0.0;

/** Default resampling method for texture data */
export const DEFAULT_RESAMPLE_METHOD = 'bilinear' as const;

// ============================================================================
// 3D TILES CONSTANTS
// ============================================================================

/** Default 3D Tiles specification version */
export const TILES_VERSION = '1.1';

/** Default coordinate system up-axis for terrain */
export const DEFAULT_UP_AXIS = 'Z' as const;

/** Elevation-based geometric error scaling factor (2% of elevation range) */
export const ELEVATION_ERROR_FACTOR = 0.02;

/** Minimum geometric error for leaf tiles */
export const MIN_GEOMETRIC_ERROR = 1;

/** Quadtree subdivision multiplier */
export const QUAD_MULTIPLIER = 2;
