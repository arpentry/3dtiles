import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateTerrainMesh,
  mapCoordinates,
  buildTriangleIndices,
  computeVertexNormals,
  type TerrainMesh,
  type MeshGeometry,
  type TriangleIndices,
} from '../mesh';
import { ELEVATION_NO_DATA, DEFAULT_MESH_ERROR } from '../constants';
import coordinateTestCases from './fixtures/coordinate-test-cases.json';

// Mock the Martini library
const mockMartini = vi.hoisted(() => {
  const mockTile = {
    getMesh: vi.fn(),
  };
  
  const mockMartiniClass = Object.assign(
    vi.fn(() => ({
      createTile: vi.fn(() => mockTile),
    })),
    { mockTile }
  );
  
  return mockMartiniClass;
});

vi.mock('@mapbox/martini', () => ({ default: mockMartini }));

/**
 * COORDINATE SYSTEM DOCUMENTATION: mesh.ts functions
 * 
 * The mesh step transforms data through these coordinate systems:
 * 
 * INPUT COORDINATE SYSTEM:
 *   - Grid space: Elevation data as Float32Array (0 to tileSize+1 pixels)
 *   - Martini vertices: Uint16Array with grid coordinates [gx, gy, gx, gy, ...]
 *   - Spatial bounds: Web Mercator bounds [minX, minY, maxX, maxY] in meters
 * 
 * OUTPUT COORDINATE SYSTEM:
 *   - Three.js world coordinates: [x, y, z] where:
 *     * X = easting offset from tileset center (meters)
 *     * Y = elevation above sea level (meters) 
 *     * Z = -northing offset from tileset center (meters, negative for right-handed)
 *   - UV texture coordinates: [u, v] normalized 0-1 range
 *   - Triangle indices: Referencing final vertex array positions
 * 
 * KEY TRANSFORMATIONS:
 *   1. generateTerrainMesh: Elevation grid → Martini triangulation
 *   2. mapCoordinates: Grid coords → Web Mercator → Three.js world coords
 *   3. buildTriangleIndices: Martini triangle refs → Final mesh indices
 *   4. computeVertexNormals: Triangle geometry → Smooth vertex normals
 * 
 * COORDINATE SYSTEM CONTRACTS:
 *   - Grid space (0 to tileSize+1) → World space (meters, centered)
 *   - Web Mercator Y-axis flipping (north-up → south-up for texture UVs)
 *   - Three.js right-handed coordinates with Y-up elevation
 *   - UV coordinates normalized to tile boundaries
 */

describe('mesh.ts - Coordinate System & Function Tests', () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
  });

  describe('generateTerrainMesh()', () => {
    it('should generate terrain mesh using Martini triangulation', () => {
      const tileSize = 256;
      const gridSize = tileSize + 1;
      const elevationData = new Float32Array(gridSize * gridSize);
      
      // Create realistic elevation data
      for (let i = 0; i < elevationData.length; i++) {
        elevationData[i] = 500 + Math.sin(i / 100) * 200; // 300-700m range
      }

      // Mock Martini output
      const mockVertices = new Uint16Array([0, 0, 128, 0, 256, 0, 0, 128]); // Grid coordinates
      const mockTriangles = new Uint16Array([0, 1, 2, 0, 2, 3]); // Triangle indices
      
      mockMartini.mockTile.getMesh.mockReturnValue({
        vertices: mockVertices,
        triangles: mockTriangles,
      });

      const result = generateTerrainMesh(elevationData, tileSize);

      // Verify Martini setup and calls
      expect(mockMartini).toHaveBeenCalledWith(gridSize);
      expect(mockMartini.mockTile.getMesh).toHaveBeenCalledWith(DEFAULT_MESH_ERROR);

      // Verify output structure
      expect(result).toMatchObject({
        vertices: mockVertices,
        triangles: mockTriangles,
        terrainGrid: expect.any(Float32Array),
      });

      // Verify terrain grid conversion
      expect(result.terrainGrid.length).toBe(gridSize * gridSize);
      expect(result.terrainGrid[0]).toBeCloseTo(elevationData[0], 0.01);
    });

    it('should handle elevation data with no-data values', () => {
      const tileSize = 8; // Small for testing
      const gridSize = tileSize + 1;
      const elevationData = new Float32Array(gridSize * gridSize);
      
      // Mix valid elevations with no-data values
      for (let i = 0; i < elevationData.length; i++) {
        elevationData[i] = (i % 3 === 0) ? ELEVATION_NO_DATA : 500;
      }

      mockMartini.mockTile.getMesh.mockReturnValue({
        vertices: new Uint16Array([0, 0, 4, 4]),
        triangles: new Uint16Array([0, 1, 2]),
      });

      const result = generateTerrainMesh(elevationData, tileSize);

      // Verify no-data values are preserved in terrain grid
      expect(result.terrainGrid[0]).toBe(ELEVATION_NO_DATA);
      expect(result.terrainGrid[1]).toBe(500);
      expect(result.terrainGrid[3]).toBe(ELEVATION_NO_DATA);
    });
  });

  describe('mapCoordinates()', () => {
    it('should transform grid coordinates to Three.js world coordinates', () => {
      const tileSize = 256;
      const testCase = coordinateTestCases.transformation_test_cases.grid_to_world_transformations;
      
      // Use test data from coordinate test cases
      const vertices = new Uint16Array([
        0, 0,     // Grid origin (0,0)
        128, 128, // Grid center (128,128) 
        256, 256, // Grid max (256,256)
      ]);

      const gridSize = tileSize + 1;
      const terrainGrid = new Float32Array(gridSize * gridSize);
      terrainGrid.fill(500); // 500m elevation

      const clampedBbox = testCase.test_tile.bounds_web_mercator;
      const tilesetCenter = testCase.test_tile.tileset_center as [number, number];

      const result = mapCoordinates(vertices, terrainGrid, clampedBbox, tilesetCenter, tileSize);

      // Verify coordinate system transformations
      expect(result.positions.length).toBe(9); // 3 vertices × 3 components
      expect(result.uvs.length).toBe(6); // 3 vertices × 2 UV components

      // Test first vertex (grid origin 0,0)
      const expectedFirst = testCase.cases[0];
      expect(result.positions[0]).toBeCloseTo(expectedFirst.expected_world_coordinates[0], 1); // X
      expect(result.positions[1]).toBe(500); // Y = elevation
      expect(result.positions[2]).toBeCloseTo(expectedFirst.expected_world_coordinates[2], 1); // Z

      // Test UV coordinates (normalized 0-1)
      expect(result.uvs[0]).toBe(0); // U at grid origin
      expect(result.uvs[1]).toBe(0); // V at grid origin
      expect(result.uvs[4]).toBe(1); // U at grid max
      expect(result.uvs[5]).toBe(1); // V at grid max

      // Verify elevation tracking
      expect(result.minElevation).toBe(500);
      expect(result.maxElevation).toBe(500);

      // Verify vertex map
      expect(result.vertexMap.size).toBe(3);
      expect(result.vertexMap.get(0)).toBe(0);
      expect(result.vertexMap.get(1)).toBe(1);
      expect(result.vertexMap.get(2)).toBe(2);
    });

    it('should handle coordinate system transformations with varying elevations', () => {
      const tileSize = 4; // Small grid for testing
      const vertices = new Uint16Array([0, 0, 2, 2, 4, 4]); // Three vertices
      const gridSize = 5;
      const terrainGrid = new Float32Array(gridSize * gridSize);
      
      // Set different elevations at vertex positions
      terrainGrid[0] = 300;  // Low elevation
      terrainGrid[12] = 1500; // High elevation  
      terrainGrid[24] = 800; // Medium elevation

      const clampedBbox = [1000, 2000, 2000, 3000]; // 1000x1000 Web Mercator bounds
      const tilesetCenter: [number, number] = [1500, 2500]; // Center of bounds

      const result = mapCoordinates(vertices, terrainGrid, clampedBbox, tilesetCenter, tileSize);

      // Verify elevation values are correctly assigned
      expect(result.positions[1]).toBe(300);  // First vertex Y
      expect(result.positions[4]).toBe(1500); // Second vertex Y
      expect(result.positions[7]).toBe(800);  // Third vertex Y

      // Verify elevation bounds tracking
      expect(result.minElevation).toBe(300);
      expect(result.maxElevation).toBe(1500);

      // Verify Web Mercator to Three.js coordinate transformation
      // X should be offset from tileset center
      expect(result.positions[0]).toBeCloseTo(1000 - 1500, 1); // X = bbox.minX - center.x
      expect(result.positions[6]).toBeCloseTo(2000 - 1500, 1); // X = bbox.maxX - center.x

      // Z should be negative northing offset (Y-axis flip)
      expect(result.positions[2]).toBeCloseTo(-(3000 - 2500), 1); // Z = -(bbox.maxY - center.y)
      expect(result.positions[8]).toBeCloseTo(-(2000 - 2500), 1); // Z = -(bbox.minY - center.y)
    });

    it('should filter out vertices with no-data elevations', () => {
      const tileSize = 4;
      const vertices = new Uint16Array([0, 0, 2, 2, 4, 4]); // Three vertices
      const gridSize = 5;
      const terrainGrid = new Float32Array(gridSize * gridSize);
      
      // Set first and third vertices to no-data, second to valid elevation
      terrainGrid[0] = ELEVATION_NO_DATA;
      terrainGrid[12] = 500; // Valid
      terrainGrid[24] = ELEVATION_NO_DATA;

      const clampedBbox = [0, 0, 1000, 1000];
      const tilesetCenter: [number, number] = [500, 500];

      const result = mapCoordinates(vertices, terrainGrid, clampedBbox, tilesetCenter, tileSize);

      // Should only have one valid vertex
      expect(result.positions.length).toBe(3); // 1 vertex × 3 components
      expect(result.uvs.length).toBe(2); // 1 vertex × 2 UV components

      // Vertex map should mark no-data vertices as -1
      expect(result.vertexMap.get(0)).toBe(-1); // No-data
      expect(result.vertexMap.get(1)).toBe(0);  // Valid vertex (remapped to index 0)
      expect(result.vertexMap.get(2)).toBe(-1); // No-data

      // Valid vertex should have correct elevation
      expect(result.positions[1]).toBe(500);
    });
  });

  describe('buildTriangleIndices()', () => {
    it('should build triangle indices from Martini output', () => {
      const triangles = new Uint16Array([0, 1, 2, 1, 3, 2]); // Two triangles
      const vertexMap = new Map([
        [0, 0], [1, 1], [2, 2], [3, 3] // All vertices valid
      ]);

      const result = buildTriangleIndices(triangles, vertexMap);

      expect(result.indices).toEqual([0, 1, 2, 1, 3, 2]);
    });

    it('should filter out triangles with no-data vertices', () => {
      const triangles = new Uint16Array([
        0, 1, 2, // Valid triangle
        1, 3, 4, // Triangle with no-data vertex (3 is -1)
        2, 4, 5, // Valid triangle
      ]);
      
      const vertexMap = new Map([
        [0, 0], [1, 1], [2, 2], [3, -1], [4, 3], [5, 4] // Vertex 3 is no-data
      ]);

      const result = buildTriangleIndices(triangles, vertexMap);

      // Should exclude the middle triangle due to no-data vertex
      expect(result.indices).toEqual([0, 1, 2, 2, 3, 4]);
    });

    it('should handle empty triangles array', () => {
      const triangles = new Uint16Array([]);
      const vertexMap = new Map();

      const result = buildTriangleIndices(triangles, vertexMap);

      expect(result.indices).toEqual([]);
    });
  });

  describe('computeVertexNormals()', () => {
    it('should compute smooth vertex normals from triangle mesh', () => {
      // Simple triangle mesh: right triangle in XY plane
      const positions = [
        0, 0, 0,  // Vertex 0: origin
        1, 0, 0,  // Vertex 1: X-axis
        0, 1, 0,  // Vertex 2: Y-axis
      ];
      const indices = [0, 1, 2]; // Single triangle

      const normals = computeVertexNormals(positions, indices);

      expect(normals.length).toBe(9); // 3 vertices × 3 components

      // All vertices should have same normal (face normal) since it's a single triangle
      // Cross product of (1,0,0) × (0,1,0) = (0,0,1)
      expect(normals[0]).toBeCloseTo(0, 0.01);  // Vertex 0 normal X
      expect(normals[1]).toBeCloseTo(0, 0.01);  // Vertex 0 normal Y
      expect(normals[2]).toBeCloseTo(1, 0.01);  // Vertex 0 normal Z

      // All normals should be normalized (length = 1)
      for (let i = 0; i < normals.length; i += 3) {
        const nx = normals[i], ny = normals[i + 1], nz = normals[i + 2];
        const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
        expect(length).toBeCloseTo(1, 0.01);
      }
    });

    it('should compute averaged normals for shared vertices', () => {
      // Two triangles sharing vertices (forming a "roof" shape)
      const positions = [
        0, 0, 0,  // Vertex 0: shared
        1, 0, 0,  // Vertex 1: shared  
        0.5, 0, 1, // Vertex 2: peak
        0.5, 1, 0, // Vertex 3: other side
      ];
      const indices = [
        0, 1, 2, // First triangle
        0, 2, 3, // Second triangle (shares vertices 0, 2)
      ];

      const normals = computeVertexNormals(positions, indices);

      expect(normals.length).toBe(12); // 4 vertices × 3 components

      // Shared vertices (0, 1, 2) should have averaged normals
      // Individual normals will be averaged and normalized
      
      // Verify all normals are properly normalized
      for (let i = 0; i < normals.length; i += 3) {
        const nx = normals[i], ny = normals[i + 1], nz = normals[i + 2];
        const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
        expect(length).toBeCloseTo(1, 0.01);
      }
    });

    it('should handle degenerate triangles gracefully', () => {
      // Degenerate triangle (all points collinear)
      const positions = [
        0, 0, 0,
        1, 0, 0,
        2, 0, 0, // Collinear with first two
      ];
      const indices = [0, 1, 2];

      const normals = computeVertexNormals(positions, indices);

      // Should still produce normalized vectors (may be arbitrary for degenerate case)
      expect(normals.length).toBe(9);
      
      for (let i = 0; i < normals.length; i += 3) {
        const nx = normals[i], ny = normals[i + 1], nz = normals[i + 2];
        const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
        expect(length).toBeCloseTo(1, 0.01);
      }
    });
  });

  describe('Coordinate System Integration Tests', () => {
    it('should maintain coordinate system contracts across mesh pipeline', () => {
      // Test complete mesh pipeline with known coordinates
      const testCase = coordinateTestCases.transformation_test_cases.grid_to_world_transformations;
      const tileSize = testCase.tile_size;
      
      // Step 1: Generate terrain mesh
      const gridSize = tileSize + 1;
      const elevationData = new Float32Array(gridSize * gridSize);
      elevationData.fill(500); // Constant elevation for testing

      // Mock Martini to return simple triangle
      const mockVertices = new Uint16Array([0, 0, 128, 0, 0, 128]); // L-shaped triangle
      const mockTriangles = new Uint16Array([0, 1, 2]); // Single triangle
      mockMartini.mockTile.getMesh.mockReturnValue({
        vertices: mockVertices,
        triangles: mockTriangles,
      });

      const terrainMesh = generateTerrainMesh(elevationData, tileSize);

      // Step 2: Map coordinates
      const clampedBbox = testCase.test_tile.bounds_web_mercator;
      const tilesetCenter = testCase.test_tile.tileset_center as [number, number];
      
      const meshGeometry = mapCoordinates(
        terrainMesh.vertices,
        terrainMesh.terrainGrid,
        clampedBbox,
        tilesetCenter,
        tileSize
      );

      // Step 3: Build triangle indices
      const triangleIndices = buildTriangleIndices(terrainMesh.triangles, meshGeometry.vertexMap);

      // Step 4: Compute vertex normals
      const normals = computeVertexNormals(meshGeometry.positions, triangleIndices.indices);

      // Verify complete pipeline coordinate system contracts
      expect(meshGeometry.positions.length).toBe(9); // 3 vertices × 3 components
      expect(meshGeometry.uvs.length).toBe(6); // 3 vertices × 2 UV components
      expect(triangleIndices.indices.length).toBe(3); // 1 triangle × 3 vertices
      expect(normals.length).toBe(9); // 3 vertices × 3 components

      // Verify coordinate system transformations
      // X coordinates should be relative to tileset center
      expect(meshGeometry.positions[0]).toBeCloseTo(clampedBbox[0] - tilesetCenter[0], 1);
      
      // Y coordinates should be elevation values
      expect(meshGeometry.positions[1]).toBe(500);
      
      // Z coordinates should be negative northing relative to center
      expect(meshGeometry.positions[2]).toBeCloseTo(-(clampedBbox[3] - tilesetCenter[1]), 1);

      // UV coordinates should be normalized 0-1
      expect(meshGeometry.uvs[0]).toBe(0); // Grid 0 → UV 0
      expect(meshGeometry.uvs[2]).toBeCloseTo(0.5, 0.01); // Grid 128 → UV 0.5

      // All normals should be unit length
      for (let i = 0; i < normals.length; i += 3) {
        const nx = normals[i], ny = normals[i + 1], nz = normals[i + 2];
        const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
        expect(length).toBeCloseTo(1, 0.01);
      }
    });

    it('should handle Swiss terrain coordinate transformations correctly', () => {
      // Test with realistic Swiss coordinate bounds
      const swissTestCase = coordinateTestCases.transformation_test_cases.swiss_reference_points.cases[0];
      const webMercatorBounds = [
        swissTestCase.web_mercator[0] - 1000,
        swissTestCase.web_mercator[1] - 1000,
        swissTestCase.web_mercator[0] + 1000,
        swissTestCase.web_mercator[1] + 1000,
      ];

      const vertices = new Uint16Array([128, 128]); // Single vertex at center
      const tileSize = 256;
      const gridSize = tileSize + 1;
      const terrainGrid = new Float32Array(gridSize * gridSize);
      
      // Use Swiss elevation data
      const swissElevation = coordinateTestCases.transformation_test_cases.elevation_test_data.swiss_elevation_points[2];
      terrainGrid[128 * gridSize + 128] = swissElevation.elevation_meters;

      const tilesetCenter: [number, number] = [
        swissTestCase.web_mercator[0], 
        swissTestCase.web_mercator[1]
      ];

      const result = mapCoordinates(vertices, terrainGrid, webMercatorBounds, tilesetCenter, tileSize);

      // Verify Swiss coordinate system handling
      expect(result.positions.length).toBe(3);
      expect(result.positions[0]).toBeCloseTo(0, 1); // Should be centered
      expect(result.positions[1]).toBe(swissElevation.elevation_meters); // Correct elevation
      expect(result.positions[2]).toBeCloseTo(0, 1); // Should be centered

      // UV should be at center
      expect(result.uvs[0]).toBeCloseTo(0.5, 0.01);
      expect(result.uvs[1]).toBeCloseTo(0.5, 0.01);
    });
  });
});