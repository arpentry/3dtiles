import { beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Test TIFF files paths
export const TEST_ELEVATION_PATH = join(
  process.cwd(),
  'public',
  'swissalti3d_web_mercator_test.tif',
);
export const TEST_TEXTURE_PATH = join(
  process.cwd(),
  'public',
  'swissimage_web_mercator_test.tif',
);

// Test data URLs that will be mocked
export const TEST_ELEVATION_URL =
  'http://localhost:8787/swissalti3d/swissalti3d_web_mercator.tif';
export const TEST_TEXTURE_URL =
  'http://localhost:8787/swissimage-dop10/swissimage_web_mercator.tif';

beforeEach(() => {
  // Mock fetch for TIFF file requests
  global.fetch = vi.fn().mockImplementation(async (url: string) => {
    if (url.includes('swissalti3d_web_mercator.tif')) {
      if (existsSync(TEST_ELEVATION_PATH)) {
        const buffer = readFileSync(TEST_ELEVATION_PATH);
        return new Response(buffer, {
          status: 200,
          headers: { 'Content-Type': 'image/tiff' },
        });
      } else {
        // Return a mock TIFF-like buffer for testing
        const mockBuffer = new ArrayBuffer(1000);
        return new Response(mockBuffer, {
          status: 200,
          headers: { 'Content-Type': 'image/tiff' },
        });
      }
    }

    if (url.includes('swissimage_web_mercator.tif')) {
      if (existsSync(TEST_TEXTURE_PATH)) {
        const buffer = readFileSync(TEST_TEXTURE_PATH);
        return new Response(buffer, {
          status: 200,
          headers: { 'Content-Type': 'image/tiff' },
        });
      } else {
        // Return a mock TIFF-like buffer for testing
        const mockBuffer = new ArrayBuffer(1000);
        return new Response(mockBuffer, {
          status: 200,
          headers: { 'Content-Type': 'image/tiff' },
        });
      }
    }

    throw new Error(`Unmocked fetch request: ${url}`);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Test data factories
export function createMockTileBounds() {
  return {
    minX: 2485071.5,
    minY: 1075268.5,
    maxX: 2513171.5,
    maxY: 1103368.5,
    westDeg: 6.8,
    southDeg: 46.3,
    eastDeg: 7.1,
    northDeg: 46.6,
  };
}

export function createMockElevationData(size = 256): Float32Array {
  const data = new Float32Array(size * size);
  for (let i = 0; i < data.length; i++) {
    // Create some realistic elevation data (300-2000m range)
    data[i] = 300 + Math.sin(i / 100) * 500 + Math.cos(i / 200) * 300;
  }
  return data;
}

export function createMockGlobalBounds(): [number, number, number, number] {
  return [2485071.5, 1075268.5, 2513171.5, 1103368.5]; // Swiss bounds in Web Mercator
}

export function createMockTilesetCenter(): [number, number] {
  return [2499121.5, 1089318.5]; // Center of mock bounds
}
