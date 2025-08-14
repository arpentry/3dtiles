import { fromUrl } from 'geotiff';
import { encode } from '@cf-wasm/png';
import { createSquareBounds, Bounds, Coordinate } from '../utils/geometry';
import { TileBounds } from './tiles';

export interface ElevationRaster {
  data: TypedArray;
  bbox: Bounds;
}

export interface TiffMetadata {
  imageWidth: number;
  imageHeight: number;
  imageBounds: Bounds;
  tilesetBounds: Bounds;
  tilesetCenter: Coordinate;
}

const ELEVATION_NO_DATA = -9999;

/**
 * Read GeoTIFF metadata including the tileset bounds and center
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

// Compute clamped bounds, expanded by one pixel east/south to ensure seamless edges
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
 * Read elevation data from a GeoTIFF file
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
 * Create a texture from a GeoTIFF file
 */
export async function createTextureFromGeoTiff(
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
    resampleMethod: 'bilinear',
  });

  const bands = Array.isArray(raster) ? (raster as unknown as TypedArray[]) : [raster as TypedArray];
  if (bands.length === 0) {
    throw new Error('No texture data available');
  }

  const outputSize = tileSize + 1;
  const pixelCount = outputSize * outputSize;
  const rgbaPixels = new Uint8Array(pixelCount * 4);
  const numBands = bands.length;

  for (let i = 0; i < pixelCount; ++i) {
    const baseIndex = i * 4;
    if (numBands >= 3) {
      rgbaPixels[baseIndex] = Number(bands[0][i]);
      rgbaPixels[baseIndex + 1] = Number(bands[1][i]);
      rgbaPixels[baseIndex + 2] = Number(bands[2][i]);
      rgbaPixels[baseIndex + 3] = 255;
    } else {
      const grayscale = Number(bands[0][i]);
      rgbaPixels[baseIndex] = grayscale;
      rgbaPixels[baseIndex + 1] = grayscale;
      rgbaPixels[baseIndex + 2] = grayscale;
      rgbaPixels[baseIndex + 3] = 255;
    }
  }

  return encode(rgbaPixels, outputSize, outputSize);
}


