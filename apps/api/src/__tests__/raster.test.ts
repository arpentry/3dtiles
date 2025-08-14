import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  readGeoTiffMetadata,
  readElevationDataFromGeoTiff,
  readTextureDataFromGeoTiff,
  type TiffMetadata,
  type ElevationRaster,
} from '../raster';
import { TileBounds } from '../tiles';
import { ELEVATION_NO_DATA, ALPHA_OPAQUE } from '../constants';
import coordinateTestCases from './fixtures/coordinate-test-cases.json';

// Mock the geotiff library
const mockGeotiff = vi.hoisted(() => ({
  fromUrl: vi.fn(),
}));

const mockPngEncoder = vi.hoisted(() => ({
  encode: vi.fn(),
}));

vi.mock('geotiff', () => mockGeotiff);
vi.mock('@cf-wasm/png', () => mockPngEncoder);

/**
 * COORDINATE SYSTEM DOCUMENTATION: raster.ts functions
 * 
 * The raster step transforms data through these coordinate systems:
 * 
 * INPUT COORDINATE SYSTEM:
 *   - GeoTIFF files with various projections (usually Web Mercator EPSG:3857)
 *   - Spatial bounds as [minX, minY, maxX, maxY] in projection units (meters)
 *   - TileBounds interface defining the spatial extent of a tile
 * 
 * OUTPUT COORDINATE SYSTEM:
 *   - Grid space: Pixel coordinates from 0 to tileSize+1
 *   - Elevation values: Float32Array with elevation in meters
 *   - Texture values: RGBA pixels encoded as PNG
 * 
 * KEY TRANSFORMATIONS:
 *   1. Spatial bounds → Pixel grid coordinates (tileSize+1 x tileSize+1)
 *   2. GeoTIFF pixel values → Elevation meters (preserving no-data values)
 *   3. GeoTIFF bands → RGBA pixel values → PNG encoding
 *   4. Bounds expansion for seamless tile edges (+1 pixel buffer)
 * 
 * COORDINATE SYSTEM CONTRACTS:
 *   - readGeoTiffMetadata: GeoTIFF spatial metadata → Square tileset bounds
 *   - readElevationDataFromGeoTiff: Spatial bounds → Grid elevation data
 *   - readTextureDataFromGeoTiff: Spatial bounds → Grid texture data (PNG)
 */

describe('raster.ts - Coordinate System & Function Tests', () => {
  let mockImage: any;
  let mockTiff: any;

  beforeEach(() => {
    // Create comprehensive mocks for GeoTIFF objects
    mockImage = {
      getWidth: vi.fn(() => 2048),
      getHeight: vi.fn(() => 2048),
      getBoundingBox: vi.fn(() => [2485071.5, 1075268.5, 2513171.5, 1103368.5]),
    };

    mockTiff = {
      getImage: vi.fn(() => Promise.resolve(mockImage)),
      readRasters: vi.fn(),
    };

    mockGeotiff.fromUrl.mockResolvedValue(mockTiff);
    mockPngEncoder.encode.mockReturnValue(new Uint8Array([137, 80, 78, 71])); // PNG header
  });

  describe('readGeoTiffMetadata()', () => {
    it('should extract metadata and create square tileset bounds', async () => {
      const testCases = coordinateTestCases.transformation_test_cases.tile_coordinate_examples;
      const expectedBounds = testCases.global_bounds_web_mercator;
      const expectedCenter = testCases.tileset_center;

      mockImage.getBoundingBox.mockReturnValue(expectedBounds);

      const metadata = await readGeoTiffMetadata('http://test-url.tif');

      expect(metadata).toMatchObject({
        imageWidth: 2048,
        imageHeight: 2048,
        imageBounds: expectedBounds,
        tilesetCenter: expectedCenter,
      });

      // Verify tileset bounds are square (width === height)
      const [minX, minY, maxX, maxY] = metadata.tilesetBounds;
      const width = maxX - minX;
      const height = maxY - minY;
      expect(width).toBeCloseTo(height, 1); // Should be square within tolerance
    });

    it('should handle GeoTIFF metadata extraction errors', async () => {
      mockGeotiff.fromUrl.mockRejectedValue(new Error('Invalid TIFF'));

      await expect(readGeoTiffMetadata('http://invalid-url.tif'))
        .rejects.toThrow('Invalid TIFF');
    });

    it('should convert rectangular bounds to square bounds', async () => {
      // Test with non-square input bounds
      const rectangularBounds = [1000, 2000, 3000, 3000]; // 2000x1000 rectangle
      mockImage.getBoundingBox.mockReturnValue(rectangularBounds);

      const metadata = await readGeoTiffMetadata('http://test-url.tif');

      // Should expand to 2000x2000 square centered on original bounds
      const [minX, minY, maxX, maxY] = metadata.tilesetBounds;
      const width = maxX - minX;
      const height = maxY - minY;
      
      expect(width).toBeCloseTo(height, 0.01);
      expect(width).toBe(2000); // Should use the larger dimension
    });
  });

  describe('readElevationDataFromGeoTiff()', () => {
    it('should read elevation data with expanded bounds for seamless edges', async () => {
      const testTileBounds: TileBounds = {
        minX: 2485071.5,
        minY: 1089318.5, 
        maxX: 2499121.5,
        maxY: 1103368.5,
        westDeg: 6.8,
        southDeg: 46.5,
        eastDeg: 7.0,
        northDeg: 46.7,
      };

      const mockElevationData = new Float32Array(257 * 257); // tileSize+1 x tileSize+1
      for (let i = 0; i < mockElevationData.length; i++) {
        // Create realistic Swiss elevation data (300-2000m)
        mockElevationData[i] = 500 + Math.sin(i / 100) * 300;
      }

      mockTiff.readRasters.mockResolvedValue([mockElevationData]);

      const result = await readElevationDataFromGeoTiff(
        'http://test-elevation.tif',
        testTileBounds,
        256
      );

      // Verify coordinate system contract
      expect(result.data).toBeInstanceOf(Float32Array);
      expect(result.data.length).toBe(257 * 257); // Expanded by 1 pixel
      expect(result.bbox).toHaveLength(4); // [minX, minY, maxX, maxY]
      
      // Verify elevation values are in valid range
      const elevations = Array.from(result.data);
      expect(Math.min(...elevations)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...elevations)).toBeLessThanOrEqual(5000); // Reasonable max for Swiss terrain
    });

    it('should handle no-data values correctly', async () => {
      const mockElevationData = new Float32Array(257 * 257);
      mockElevationData.fill(ELEVATION_NO_DATA);

      mockTiff.readRasters.mockResolvedValue([mockElevationData]);

      const testTileBounds: TileBounds = {
        minX: 2485071.5, minY: 1089318.5, maxX: 2499121.5, maxY: 1103368.5,
        westDeg: 6.8, southDeg: 46.5, eastDeg: 7.0, northDeg: 46.7,
      };

      const result = await readElevationDataFromGeoTiff(
        'http://test-elevation.tif',
        testTileBounds,
        256
      );

      // Verify no-data values are preserved
      expect(result.data.every(val => val === ELEVATION_NO_DATA)).toBe(true);
    });

    it('should request data with correct expanded bounds', async () => {
      const testTileBounds: TileBounds = {
        minX: 1000, minY: 2000, maxX: 2000, maxY: 3000,
        westDeg: 6.8, southDeg: 46.5, eastDeg: 7.0, northDeg: 46.7,
      };
      const tileSize = 256;
      
      // Mock the GeoTIFF to return bounds larger than test bounds to allow expansion
      mockImage.getBoundingBox.mockReturnValue([900, 1900, 2100, 3100]);
      mockTiff.readRasters.mockResolvedValue([new Float32Array(257 * 257)]);

      await readElevationDataFromGeoTiff('http://test.tif', testTileBounds, tileSize);

      // Verify bounds expansion for seamless edges
      const readRastersCall = mockTiff.readRasters.mock.calls[0][0];
      expect(readRastersCall.width).toBe(tileSize + 1);
      expect(readRastersCall.height).toBe(tileSize + 1);
      expect(readRastersCall.fillValue).toBe(ELEVATION_NO_DATA);
      
      // Bounds should be expanded by 1 pixel in east/south directions
      const pixelWidth = (testTileBounds.maxX - testTileBounds.minX) / tileSize;
      const pixelHeight = (testTileBounds.maxY - testTileBounds.minY) / tileSize;
      
      expect(readRastersCall.bbox[2]).toBeCloseTo(testTileBounds.maxX + pixelWidth, 0.01);
      expect(readRastersCall.bbox[1]).toBeCloseTo(testTileBounds.minY - pixelHeight, 0.01);
    });

    it('should throw error for invalid elevation data', async () => {
      mockTiff.readRasters.mockResolvedValue(null);

      const testTileBounds: TileBounds = {
        minX: 1000, minY: 2000, maxX: 2000, maxY: 3000,
        westDeg: 6.8, southDeg: 46.5, eastDeg: 7.0, northDeg: 46.7,
      };

      await expect(readElevationDataFromGeoTiff('http://test.tif', testTileBounds, 256))
        .rejects.toThrow('No elevation data available');
    });
  });

  describe('readTextureDataFromGeoTiff()', () => {
    it('should read and convert RGB texture data to PNG', async () => {
      const tileSize = 256;
      const outputSize = tileSize + 1;
      const pixelCount = outputSize * outputSize;

      // Mock RGB bands
      const redBand = new Uint8Array(pixelCount).fill(255);   // Red
      const greenBand = new Uint8Array(pixelCount).fill(128); // Green  
      const blueBand = new Uint8Array(pixelCount).fill(64);   // Blue

      mockTiff.readRasters.mockResolvedValue([redBand, greenBand, blueBand]);

      const testTileBounds: TileBounds = {
        minX: 1000, minY: 2000, maxX: 2000, maxY: 3000,
        westDeg: 6.8, southDeg: 46.5, eastDeg: 7.0, northDeg: 46.7,
      };

      const result = await readTextureDataFromGeoTiff(
        'http://test-texture.tif',
        testTileBounds,
        tileSize
      );

      // Verify PNG encoding call
      expect(mockPngEncoder.encode).toHaveBeenCalledWith(
        expect.any(Uint8Array), // RGBA pixel data
        outputSize,
        outputSize
      );

      // Verify RGBA conversion - check the pixel data passed to encoder
      const rgbaData = mockPngEncoder.encode.mock.calls[0][0] as Uint8Array;
      expect(rgbaData.length).toBe(pixelCount * 4); // RGBA = 4 channels

      // Check first pixel RGBA values
      expect(rgbaData[0]).toBe(255);        // Red
      expect(rgbaData[1]).toBe(128);        // Green
      expect(rgbaData[2]).toBe(64);         // Blue
      expect(rgbaData[3]).toBe(ALPHA_OPAQUE); // Alpha

      // Verify function returns PNG data
      expect(result).toEqual(new Uint8Array([137, 80, 78, 71])); // PNG header
    });

    it('should handle grayscale texture data', async () => {
      const tileSize = 256;
      const outputSize = tileSize + 1;
      const pixelCount = outputSize * outputSize;

      // Mock single grayscale band
      const grayBand = new Uint8Array(pixelCount).fill(192);

      mockTiff.readRasters.mockResolvedValue([grayBand]);

      const testTileBounds: TileBounds = {
        minX: 1000, minY: 2000, maxX: 2000, maxY: 3000,
        westDeg: 6.8, southDeg: 46.5, eastDeg: 7.0, northDeg: 46.7,
      };

      await readTextureDataFromGeoTiff('http://test-gray.tif', testTileBounds, tileSize);

      // Verify RGBA conversion for grayscale
      const rgbaData = mockPngEncoder.encode.mock.calls[0][0] as Uint8Array;
      
      // Check first pixel - grayscale should be replicated across RGB channels
      expect(rgbaData[0]).toBe(192); // Red
      expect(rgbaData[1]).toBe(192); // Green  
      expect(rgbaData[2]).toBe(192); // Blue
      expect(rgbaData[3]).toBe(ALPHA_OPAQUE); // Alpha
    });

    it('should use expanded bounds for seamless texture edges', async () => {
      const testTileBounds: TileBounds = {
        minX: 1000, minY: 2000, maxX: 2000, maxY: 3000,
        westDeg: 6.8, southDeg: 46.5, eastDeg: 7.0, northDeg: 46.7,
      };
      const tileSize = 256;
      
      const mockTextureData = new Uint8Array(257 * 257);
      mockTiff.readRasters.mockResolvedValue([mockTextureData]);

      await readTextureDataFromGeoTiff('http://test.tif', testTileBounds, tileSize);

      // Verify texture reading uses expanded bounds
      const readRastersCall = mockTiff.readRasters.mock.calls[0][0];
      expect(readRastersCall.width).toBe(tileSize + 1);
      expect(readRastersCall.height).toBe(tileSize + 1);
      expect(readRastersCall.resampleMethod).toBe('bilinear'); // DEFAULT_RESAMPLE_METHOD
    });

    it('should throw error for no texture data', async () => {
      mockTiff.readRasters.mockResolvedValue([]);

      const testTileBounds: TileBounds = {
        minX: 1000, minY: 2000, maxX: 2000, maxY: 3000,
        westDeg: 6.8, southDeg: 46.5, eastDeg: 7.0, northDeg: 46.7,
      };

      await expect(readTextureDataFromGeoTiff('http://test.tif', testTileBounds, 256))
        .rejects.toThrow('No texture data available');
    });
  });

  describe('Coordinate System Integration Tests', () => {
    it('should maintain coordinate system contracts across raster functions', async () => {
      // Use known coordinate test case
      const testCase = coordinateTestCases.transformation_test_cases.tile_coordinate_examples.cases[1];
      const tileBounds: TileBounds = {
        minX: testCase.expected_bounds_web_mercator[0],
        minY: testCase.expected_bounds_web_mercator[1],
        maxX: testCase.expected_bounds_web_mercator[2],
        maxY: testCase.expected_bounds_web_mercator[3],
        westDeg: 6.8, southDeg: 46.5, eastDeg: 7.0, northDeg: 46.7,
      };

      // Mock consistent data for both functions
      const pixelCount = 257 * 257;
      const mockElevationData = new Float32Array(pixelCount).fill(500);
      const mockTextureData = new Uint8Array(pixelCount).fill(128);

      mockTiff.readRasters
        .mockResolvedValueOnce([mockElevationData]) // First call for elevation
        .mockResolvedValueOnce([mockTextureData]);  // Second call for texture

      // Test both functions maintain same spatial bounds
      const elevationResult = await readElevationDataFromGeoTiff('http://elev.tif', tileBounds, 256);
      const textureResult = await readTextureDataFromGeoTiff('http://tex.tif', tileBounds, 256);

      // Both should use expanded bounds for seamless edges
      expect(mockTiff.readRasters).toHaveBeenCalledTimes(2);
      
      // Verify both calls used same expanded bounds approach
      const elevationCall = mockTiff.readRasters.mock.calls[0][0];
      const textureCall = mockTiff.readRasters.mock.calls[1][0];
      
      expect(elevationCall.width).toBe(257);
      expect(textureCall.width).toBe(257);
      expect(elevationCall.height).toBe(257);
      expect(textureCall.height).toBe(257);

      // Elevation data should be Float32Array in proper range
      expect(elevationResult.data).toBeInstanceOf(Float32Array);
      expect(elevationResult.data.length).toBe(pixelCount);
      
      // Texture data should be encoded PNG
      expect(textureResult).toBeInstanceOf(Uint8Array);
      expect(mockPngEncoder.encode).toHaveBeenCalled();
    });
  });
});