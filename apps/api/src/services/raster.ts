import { fromUrl } from 'geotiff';
import { encode } from '@cf-wasm/png';

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

const ELEV_NO_DATA = -9999;

/**
 * Read elevation data from TIFF file
 */
export async function readElevationData(
  elevURL: string,
  tileBounds: TileBounds,
  tileSize: number,
): Promise<TypedArray> {
  const tiff = await fromUrl(elevURL);
  const image = await tiff.getImage();
  const globalBbox = image.getBoundingBox();

  // Calculate the size of one pixel in Mercator coordinates
  const pixelWidth = (tileBounds.maxX - tileBounds.minX) / tileSize;
  const pixelHeight = (tileBounds.maxY - tileBounds.minY) / tileSize;

  // Expand the bounding box by one pixel on the right and bottom edges
  const expandedBbox = [
    tileBounds.minX,
    tileBounds.minY - pixelHeight, // Extend south
    tileBounds.maxX + pixelWidth, // Extend east
    tileBounds.maxY,
  ];

  // Clamp the expanded bounding box to the global bounding box of the TIFF
  const clampedBbox = [
    Math.max(expandedBbox[0], globalBbox[0]),
    Math.max(expandedBbox[1], globalBbox[1]),
    Math.min(expandedBbox[2], globalBbox[2]),
    Math.min(expandedBbox[3], globalBbox[3]),
  ];

  const raster = await tiff.readRasters({
    bbox: clampedBbox,
    width: tileSize + 1,
    height: tileSize + 1,
    fillValue: ELEV_NO_DATA,
  });

  if (!raster || !raster[0] || typeof raster[0] === 'number') {
    throw new Error('No elevation data available');
  }

  return raster[0] as TypedArray;
}

/**
 * Generate texture from TIFF file
 */
export async function generateTexture(
  texURL: string,
  tileBounds: TileBounds,
  tileSize: number,
): Promise<Uint8Array | undefined> {
  try {
    const texTiff = await fromUrl(texURL);
    const texRaster = await texTiff.readRasters({
      bbox: [
        tileBounds.minX,
        tileBounds.minY,
        tileBounds.maxX,
        tileBounds.maxY,
      ],
      width: tileSize,
      height: tileSize,
      resampleMethod: 'bilinear',
    });

    if (!Array.isArray(texRaster)) {
      return undefined;
    }

    const img = new Uint8Array(tileSize * tileSize * 4);
    const bands = texRaster.length;

    for (let i = 0; i < tileSize * tileSize; ++i) {
      const bi = i * 4;
      if (bands >= 3) {
        img[bi] = Number((texRaster[0] as TypedArray)[i]);
        img[bi + 1] = Number((texRaster[1] as TypedArray)[i]);
        img[bi + 2] = Number((texRaster[2] as TypedArray)[i]);
        img[bi + 3] = 255;
      } else {
        const g = Number((texRaster[0] as TypedArray)[i]);
        img[bi] = img[bi + 1] = img[bi + 2] = g;
        img[bi + 3] = 255;
      }
    }

    return encode(img, tileSize, tileSize);
  } catch {
    return undefined;
  }
}

/**
 * Get TIFF metadata for TMS services
 */
export async function getTiffMetadata(url: string) {
  const tiff = await fromUrl(url);
  const image = await tiff.getImage();
  return {
    bbox: image.getBoundingBox(),
    width: image.getWidth(),
    height: image.getHeight(),
  };
}
