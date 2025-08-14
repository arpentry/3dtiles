import { fromUrl } from 'geotiff';
import { encode } from '@cf-wasm/png';
import { createSquareBounds } from '../utils/geometry';

export interface TileBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  westDeg: number;
  southDeg: number;
  eastDeg: number;
  northDeg: number;
}

// Web Mercator bounds as [minX, minY, maxX, maxY]
export type Bounds = [number, number, number, number];
export type Coordinate = [number, number];

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
 * Get TIFF metadata including the tileset bounds and center
 */
export async function getTiffMetadata(url: string): Promise<TiffMetadata> {
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

// Compute a clamped bounding box, expanded by one pixel east/south to ensure seamless edges
function computeExpandedClampedBbox(
  imageBbox: Bounds,
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
    Math.max(expandedBbox[0], imageBbox[0]),
    Math.max(expandedBbox[1], imageBbox[1]),
    Math.min(expandedBbox[2], imageBbox[2]),
    Math.min(expandedBbox[3], imageBbox[3]),
  ];
}

/**
 * Read elevation data from TIFF file
 */
export async function readElevationRaster(
  elevationUrl: string,
  tileBounds: TileBounds,
  tileSize: number,
): Promise<ElevationRaster> {
  const tiff = await fromUrl(elevationUrl);
  const image = await tiff.getImage();
  const imageBbox = image.getBoundingBox() as Bounds;

  const clampedBbox = computeExpandedClampedBbox(imageBbox, tileBounds, tileSize);

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
 * Generate texture from TIFF file
 */
export async function generateTexturePng(
  textureUrl: string,
  tileBounds: TileBounds,
  tileSize: number,
): Promise<Uint8Array> {
  const tiff = await fromUrl(textureUrl);
  const image = await tiff.getImage();
  const imageBbox = image.getBoundingBox() as Bounds;

  const clampedBbox = computeExpandedClampedBbox(imageBbox, tileBounds, tileSize);

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


