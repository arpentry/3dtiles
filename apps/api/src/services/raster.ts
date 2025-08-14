import { fromUrl } from 'geotiff';
import { encode } from '@cf-wasm/png';
import { createSquareBounds, Bounds, Coordinate } from '../utils/geometry';
import { TileBounds } from './tiles';
import {
  ELEVATION_NO_DATA,
  DEFAULT_RESAMPLE_METHOD,
  ALPHA_OPAQUE,
  RGBA_CHANNELS,
} from '../constants';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/** Elevation raster data with spatial bounds */
export interface ElevationRaster {
  /** Typed array containing elevation values */
  data: TypedArray;
  /** Spatial bounds of the raster data */
  bbox: Bounds;
}

/** GeoTIFF metadata including spatial information */
export interface TiffMetadata {
  /** Image width in pixels */
  imageWidth: number;
  /** Image height in pixels */
  imageHeight: number;
  /** Original image bounds from GeoTIFF */
  imageBounds: Bounds;
  /** Square bounds for tileset generation */
  tilesetBounds: Bounds;
  /** Center point of the tileset */
  tilesetCenter: Coordinate;
}

// ============================================================================
// PRIVATE HELPER FUNCTIONS
// ============================================================================

/**
 * Compute expanded and clamped bounds for seamless tile edges
 * 
 * Expands the tile bounds by one pixel in the east and south directions
 * to ensure seamless edges between adjacent tiles, then clamps to the
 * original image bounds to prevent out-of-bounds requests.
 * 
 * @param imageBounds - Original GeoTIFF image bounds
 * @param tileBounds - Target tile bounds
 * @param tileSize - Tile size in pixels
 * @returns Expanded and clamped bounds for raster reading
 */
function computeExpandedClampedBounds(
  imageBounds: Bounds,
  tileBounds: TileBounds,
  tileSize: number,
): Bounds {
  const pixelWidth = (tileBounds.maxX - tileBounds.minX) / tileSize;
  const pixelHeight = (tileBounds.maxY - tileBounds.minY) / tileSize;

  const expandedBbox: Bounds = [
    tileBounds.minX,
    tileBounds.minY - pixelHeight, // extend south
    tileBounds.maxX + pixelWidth, // extend east
    tileBounds.maxY,
  ];

  return [
    Math.max(expandedBbox[0], imageBounds[0]),
    Math.max(expandedBbox[1], imageBounds[1]),
    Math.min(expandedBbox[2], imageBounds[2]),
    Math.min(expandedBbox[3], imageBounds[3]),
  ];
}

/**
 * Convert raster bands to RGBA pixel data
 * 
 * @param bands - Array of raster bands (grayscale or RGB)
 * @param pixelCount - Total number of pixels
 * @returns RGBA pixel data as Uint8Array
 */
function convertBandsToRgba(bands: TypedArray[], pixelCount: number): Uint8Array {
  const rgbaPixels = new Uint8Array(pixelCount * RGBA_CHANNELS);
  const numBands = bands.length;

  for (let i = 0; i < pixelCount; ++i) {
    const baseIndex = i * RGBA_CHANNELS;
    
    if (numBands >= 3) {
      // RGB data
      rgbaPixels[baseIndex] = Number(bands[0][i]);     // Red
      rgbaPixels[baseIndex + 1] = Number(bands[1][i]); // Green
      rgbaPixels[baseIndex + 2] = Number(bands[2][i]); // Blue
      rgbaPixels[baseIndex + 3] = ALPHA_OPAQUE;        // Alpha
    } else {
      // Grayscale data
      const grayscale = Number(bands[0][i]);
      rgbaPixels[baseIndex] = grayscale;     // Red
      rgbaPixels[baseIndex + 1] = grayscale; // Green
      rgbaPixels[baseIndex + 2] = grayscale; // Blue
      rgbaPixels[baseIndex + 3] = ALPHA_OPAQUE; // Alpha
    }
  }

  return rgbaPixels;
}

// ============================================================================
// PUBLIC API FUNCTIONS
// ============================================================================

/**
 * Read GeoTIFF metadata including tileset bounds and center
 * 
 * Extracts spatial metadata from a GeoTIFF file and calculates the
 * square bounds and center point required for 3D Tiles generation.
 * 
 * @param url - URL to the GeoTIFF file
 * @returns Metadata including dimensions, bounds, and center point
 * @throws Error if the GeoTIFF cannot be read or processed
 */
export async function readGeoTiffMetadata(url: string): Promise<TiffMetadata> {
  try {
    const tiff = await fromUrl(url);
    const image = await tiff.getImage();
    const imageBounds = image.getBoundingBox() as Bounds;
    const tileBounds = createSquareBounds(imageBounds);
    const tilesetCenter: Coordinate = [
      (tileBounds[0] + tileBounds[2]) / 2,
      (tileBounds[1] + tileBounds[3]) / 2,
    ];

    return {
      imageWidth: image.getWidth(),
      imageHeight: image.getHeight(),
      imageBounds,
      tilesetBounds: tileBounds,
      tilesetCenter: tilesetCenter,
    };
  } catch (err) {
    console.error('Failed to fetch TIFF metadata for url:', url, err);
    throw err;
  }
}

/**
 * Read elevation data from a GeoTIFF file for terrain generation
 * 
 * Extracts elevation data from a GeoTIFF file within the specified tile bounds,
 * with expanded bounds to ensure seamless tile edges. The data is resampled
 * to the requested tile size with proper no-data handling.
 * 
 * @param geoTiffUrl - URL to the GeoTIFF elevation file
 * @param tileBounds - Spatial bounds of the target tile
 * @param tileSize - Output tile size in pixels
 * @returns Elevation raster data with spatial bounds
 * @throws Error if elevation data cannot be read or is invalid
 */
export async function readElevationDataFromGeoTiff(
  geoTiffUrl: string,
  tileBounds: TileBounds,
  tileSize: number,
): Promise<ElevationRaster> {
  const tiff = await fromUrl(geoTiffUrl);
  const image = await tiff.getImage();
  const imageBbox = image.getBoundingBox() as Bounds;

  const clampedBbox = computeExpandedClampedBounds(imageBbox, tileBounds, tileSize);

  const raster = await tiff.readRasters({
    bbox: clampedBbox,
    width: tileSize + 1,
    height: tileSize + 1,
    fillValue: ELEVATION_NO_DATA,
  });

  if (!raster || !raster[0] || typeof raster[0] === 'number') {
    throw new Error('No elevation data available');
  }

  return { data: raster[0] as TypedArray, bbox: clampedBbox };
}

/**
 * Read a PNG texture from a GeoTIFF file for 3D rendering
 * 
 * Reads image data from a GeoTIFF file, converts it to RGBA format,
 * and encodes it as a PNG texture suitable for use in 3D tiles.
 * Supports both RGB and grayscale input data with bilinear resampling.
 * 
 * @param geoTiffUrl - URL to the GeoTIFF image file
 * @param tileBounds - Spatial bounds of the target tile
 * @param tileSize - Output tile size in pixels
 * @returns PNG-encoded texture data as Uint8Array
 * @throws Error if texture data cannot be read or processed
 */
export async function readTextureDataFromGeoTiff(
  geoTiffUrl: string,
  tileBounds: TileBounds,
  tileSize: number,
): Promise<Uint8Array> {
  const tiff = await fromUrl(geoTiffUrl);
  const image = await tiff.getImage();
  const imageBbox = image.getBoundingBox() as Bounds;

  const clampedBbox = computeExpandedClampedBounds(imageBbox, tileBounds, tileSize);

  const raster = await tiff.readRasters({
    bbox: clampedBbox,
    width: tileSize + 1,
    height: tileSize + 1,
    resampleMethod: DEFAULT_RESAMPLE_METHOD,
  });

  const bands = Array.isArray(raster) ? (raster as unknown as TypedArray[]) : [raster as TypedArray];
  if (bands.length === 0) {
    throw new Error('No texture data available');
  }

  const outputSize = tileSize + 1;
  const pixelCount = outputSize * outputSize;
  const rgbaPixels = convertBandsToRgba(bands, pixelCount);

  return encode(rgbaPixels, outputSize, outputSize);
}