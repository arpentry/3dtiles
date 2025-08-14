import { describe, it, expect } from 'vitest';
import { WGS84toEPSG3857, EPSG3857toWGS84, degToRad, radToDeg } from '../projections';
import { 
  tileToRegionSquare, 
  lonLatToTile, 
  createSquareBounds,
  getSwissWebMercatorBounds,
} from '../geometry';
import coordinateTestCases from './fixtures/coordinate-test-cases.json';

/**
 * COORDINATE SYSTEM VALIDATION TESTS
 * 
 * These tests validate the coordinate system transformations used throughout
 * the 3D tiles pipeline, ensuring accuracy and consistency across different
 * coordinate systems and transformations.
 * 
 * COORDINATE SYSTEMS TESTED:
 * 1. WGS84 Geographic (degrees) ↔ Web Mercator EPSG:3857 (meters)
 * 2. Web Mercator bounds → Tile coordinates → Geographic regions
 * 3. Swiss coordinate reference points validation
 * 4. Grid space → World space transformations
 * 
 * These tests use known coordinate pairs from coordinate-test-cases.json
 * to validate transformation accuracy within acceptable tolerances.
 */

describe('Coordinate System Transformations', () => {
  describe('WGS84 ↔ Web Mercator Projections', () => {
    it('should transform Swiss reference points correctly', () => {
      const swissPoints = coordinateTestCases.transformation_test_cases.swiss_reference_points.cases;
      const tolerances = coordinateTestCases.validation_tolerances.coordinate_precision;

      for (const point of swissPoints) {
        // Test WGS84 → Web Mercator
        const [mercatorX, mercatorY] = WGS84toEPSG3857(point.wgs84_deg[0], point.wgs84_deg[1]);
        expect(mercatorX).toBeCloseTo(point.web_mercator[0], 0);
        expect(mercatorY).toBeCloseTo(point.web_mercator[1], 0);

        // Test Web Mercator → WGS84 (round trip)
        const [wgs84Lon, wgs84Lat] = EPSG3857toWGS84(point.web_mercator[0], point.web_mercator[1]);
        expect(wgs84Lon).toBeCloseTo(point.wgs84_deg[0], tolerances.wgs84_degrees);
        expect(wgs84Lat).toBeCloseTo(point.wgs84_deg[1], tolerances.wgs84_degrees);
      }
    });

    it('should handle degree ↔ radian conversions accurately', () => {
      const swissPoints = coordinateTestCases.transformation_test_cases.swiss_reference_points.cases;
      const tolerances = coordinateTestCases.validation_tolerances.coordinate_precision;

      for (const point of swissPoints) {
        // Test degrees → radians
        const lonRad = degToRad(point.wgs84_deg[0]);
        const latRad = degToRad(point.wgs84_deg[1]);
        expect(lonRad).toBeCloseTo(point.wgs84_rad[0], tolerances.wgs84_degrees);
        expect(latRad).toBeCloseTo(point.wgs84_rad[1], tolerances.wgs84_degrees);

        // Test radians → degrees (round trip)
        const lonDeg = radToDeg(point.wgs84_rad[0]);
        const latDeg = radToDeg(point.wgs84_rad[1]);
        expect(lonDeg).toBeCloseTo(point.wgs84_deg[0], tolerances.wgs84_degrees);
        expect(latDeg).toBeCloseTo(point.wgs84_deg[1], tolerances.wgs84_degrees);
      }
    });
  });

  describe('Tile Coordinate System', () => {
    it('should calculate tile bounds correctly for different levels', () => {
      const testCases = coordinateTestCases.transformation_test_cases.tile_coordinate_examples;
      const globalBounds = testCases.global_bounds_web_mercator as [number, number, number, number];
      const tolerances = coordinateTestCases.validation_tolerances.coordinate_precision;

      for (const testCase of testCases.cases) {
        const region = tileToRegionSquare(globalBounds, testCase.level, testCase.x, testCase.y);
        
        // Convert region back to Web Mercator for comparison
        const [westMerc, southMerc] = WGS84toEPSG3857(radToDeg(region.west), radToDeg(region.south));
        const [eastMerc, northMerc] = WGS84toEPSG3857(radToDeg(region.east), radToDeg(region.north));

        // Verify tile bounds match expected values (with reasonable tolerance for coordinate transformations)
        expect(westMerc).toBeCloseTo(testCase.expected_bounds_web_mercator[0], -2); // ±100m tolerance
        expect(southMerc).toBeCloseTo(testCase.expected_bounds_web_mercator[1], -2);
        expect(eastMerc).toBeCloseTo(testCase.expected_bounds_web_mercator[2], -2);
        expect(northMerc).toBeCloseTo(testCase.expected_bounds_web_mercator[3], -2);
      }
    });

    it('should convert lon/lat to tile coordinates correctly', () => {
      const swissPoints = coordinateTestCases.transformation_test_cases.swiss_reference_points.cases;
      const globalBounds = coordinateTestCases.transformation_test_cases.tile_coordinate_examples.global_bounds_web_mercator as [number, number, number, number];
      
      // Create root region for tile coordinate conversion
      const [westDeg, southDeg] = EPSG3857toWGS84(globalBounds[0], globalBounds[1]);
      const [eastDeg, northDeg] = EPSG3857toWGS84(globalBounds[2], globalBounds[3]);
      const rootRegion = {
        west: degToRad(westDeg),
        south: degToRad(southDeg), 
        east: degToRad(eastDeg),
        north: degToRad(northDeg),
        minH: 200,
        maxH: 4600,
      };

      for (const point of swissPoints) {
        const lonRad = degToRad(point.wgs84_deg[0]);
        const latRad = degToRad(point.wgs84_deg[1]);

        // Test if point is within bounds before tile conversion
        if (lonRad >= rootRegion.west && lonRad <= rootRegion.east &&
            latRad >= rootRegion.south && latRad <= rootRegion.north) {
          
          // Test tile coordinate conversion at different levels
          for (let level = 0; level <= 2; level++) {
            const tileCoords = lonLatToTile(rootRegion, level, lonRad, latRad);
            
            // Verify tile coordinates are within valid range
            const maxTileCoord = Math.pow(2, level) - 1;
            expect(tileCoords.x).toBeGreaterThanOrEqual(0);
            expect(tileCoords.x).toBeLessThanOrEqual(maxTileCoord);
            expect(tileCoords.y).toBeGreaterThanOrEqual(0);
            expect(tileCoords.y).toBeLessThanOrEqual(maxTileCoord);
          }
        }
      }
    });
  });

  describe('Bounds and Geometry Utilities', () => {
    it('should create square bounds correctly', () => {
      // Test with rectangular bounds
      const rectangularBounds: [number, number, number, number] = [1000, 2000, 3000, 3500];
      const squareBounds = createSquareBounds(rectangularBounds);
      
      const width = squareBounds[2] - squareBounds[0];
      const height = squareBounds[3] - squareBounds[1];
      
      // Should be square (width === height)
      expect(width).toBeCloseTo(height, 0.01);
      
      // Should use the larger dimension (2000 width vs 1500 height → use 2000)
      expect(width).toBe(2000);
      
      // Should be centered on original bounds
      const originalCenterX = (1000 + 3000) / 2; // 2000
      const originalCenterY = (2000 + 3500) / 2; // 2750
      const newCenterX = (squareBounds[0] + squareBounds[2]) / 2;
      const newCenterY = (squareBounds[1] + squareBounds[3]) / 2;
      
      expect(newCenterX).toBeCloseTo(originalCenterX, 0.01);
      expect(newCenterY).toBeCloseTo(originalCenterY, 0.01);
    });

    it('should return consistent Swiss Web Mercator bounds', () => {
      const swissBounds = getSwissWebMercatorBounds();
      
      // Should be square bounds
      const width = swissBounds[2] - swissBounds[0];
      const height = swissBounds[3] - swissBounds[1];
      expect(width).toBeCloseTo(height, 0.01);
      
      // Should cover Swiss territory (approximately)
      const [centerX, centerY] = [(swissBounds[0] + swissBounds[2]) / 2, (swissBounds[1] + swissBounds[3]) / 2];
      const [centerLon, centerLat] = EPSG3857toWGS84(centerX, centerY);
      
      // Center should be approximately in Switzerland
      expect(centerLon).toBeGreaterThan(6.0); // Roughly Swiss western boundary
      expect(centerLon).toBeLessThan(11.0); // Roughly Swiss eastern boundary  
      expect(centerLat).toBeGreaterThan(45.0); // Roughly Swiss southern boundary
      expect(centerLat).toBeLessThan(48.0); // Roughly Swiss northern boundary
    });
  });

  describe('Grid to World Coordinate Transformations', () => {
    it('should validate grid-to-world transformation examples', () => {
      const gridTestCases = coordinateTestCases.transformation_test_cases.grid_to_world_transformations;
      const tolerances = coordinateTestCases.validation_tolerances.coordinate_precision;
      
      // These transformations are tested in mesh.test.ts with actual implementation
      // Here we validate the test case data consistency
      
      for (const testCase of gridTestCases.cases) {
        const { grid_coordinates, expected_world_coordinates, notes } = testCase;
        
        // Validate test case data structure
        expect(grid_coordinates).toHaveLength(2); // [x, y]
        expect(expected_world_coordinates).toHaveLength(3); // [x, y, z]
        expect(typeof notes).toBe('string');
        
        // Validate coordinate ranges are reasonable
        expect(grid_coordinates[0]).toBeGreaterThanOrEqual(0);
        expect(grid_coordinates[0]).toBeLessThanOrEqual(gridTestCases.tile_size);
        expect(grid_coordinates[1]).toBeGreaterThanOrEqual(0);
        expect(grid_coordinates[1]).toBeLessThanOrEqual(gridTestCases.tile_size);
        
        // World coordinates should be reasonable for Swiss terrain
        expect(Math.abs(expected_world_coordinates[0])).toBeLessThan(50000); // X offset
        expect(Math.abs(expected_world_coordinates[2])).toBeLessThan(50000); // Z offset
      }
    });
  });

  describe('Elevation Data Validation', () => {
    it('should validate Swiss elevation test points', () => {
      const elevationPoints = coordinateTestCases.transformation_test_cases.elevation_test_data.swiss_elevation_points;
      const tolerances = coordinateTestCases.validation_tolerances.coordinate_precision;
      
      for (const point of elevationPoints) {
        // Validate coordinate structure
        expect(point.wgs84_deg).toHaveLength(2);
        expect(typeof point.elevation_meters).toBe('number');
        expect(typeof point.location).toBe('string');
        
        // Validate coordinates are in Switzerland
        const [lon, lat] = point.wgs84_deg;
        expect(lon).toBeGreaterThan(5.95); // Swiss western boundary
        expect(lon).toBeLessThan(10.50); // Swiss eastern boundary
        expect(lat).toBeGreaterThan(45.80); // Swiss southern boundary  
        expect(lat).toBeLessThan(47.81); // Swiss northern boundary
        
        // Validate elevation is reasonable for Switzerland
        expect(point.elevation_meters).toBeGreaterThan(200); // Lake Geneva level
        expect(point.elevation_meters).toBeLessThan(5000); // Above Matterhorn
        
        // Test coordinate projection consistency
        const [mercX, mercY] = WGS84toEPSG3857(lon, lat);
        const [backLon, backLat] = EPSG3857toWGS84(mercX, mercY);
        expect(backLon).toBeCloseTo(lon, tolerances.wgs84_degrees);
        expect(backLat).toBeCloseTo(lat, tolerances.wgs84_degrees);
      }
    });
  });

  describe('Coordinate System Contract Validation', () => {
    it('should validate coordinate system contracts from test cases', () => {
      const contracts = coordinateTestCases.transformation_test_cases.coordinate_system_contracts;
      
      // Validate raster step contract
      const rasterContract = contracts.raster_step;
      expect(rasterContract.input).toContain('GeoTIFF');
      expect(rasterContract.coordinate_system_out).toContain('Grid space');
      expect(rasterContract.key_transformations).toHaveLength(3);
      
      // Validate mesh step contract
      const meshContract = contracts.mesh_step;
      expect(meshContract.coordinate_system_in).toContain('Grid space');
      expect(meshContract.coordinate_system_out).toContain('Three.js');
      expect(meshContract.key_transformations).toContain('Grid coordinates → Web Mercator coordinates');
      
      // Validate glTF step contract
      const gltfContract = contracts.gltf_step;
      expect(gltfContract.coordinate_system_in).toContain('Three.js');
      expect(gltfContract.coordinate_system_out).toContain('Three.js');
      expect(gltfContract.key_transformations).toContain('Three.js coordinates → glTF vertex buffers');
    });

    it('should validate coordinate precision tolerances', () => {
      const tolerances = coordinateTestCases.validation_tolerances.coordinate_precision;
      
      // Verify reasonable tolerance values
      expect(tolerances.web_mercator_meters).toBeGreaterThan(0);
      expect(tolerances.web_mercator_meters).toBeLessThan(1); // Sub-meter precision
      
      expect(tolerances.wgs84_degrees).toBeGreaterThan(0);
      expect(tolerances.wgs84_degrees).toBeLessThan(0.001); // ~100m precision
      
      expect(tolerances.grid_pixels).toBeGreaterThan(0);
      expect(tolerances.grid_pixels).toBeLessThanOrEqual(1); // Sub-pixel precision
      
      expect(tolerances.elevation_meters).toBeGreaterThan(0);
      expect(tolerances.elevation_meters).toBeLessThan(1); // Sub-meter elevation precision
    });
  });
});