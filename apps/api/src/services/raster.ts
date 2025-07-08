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
  const raster = await tiff.readRasters({
    bbox: [tileBounds.minX, tileBounds.minY, tileBounds.maxX, tileBounds.maxY],
    width: tileSize,
    height: tileSize,
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
