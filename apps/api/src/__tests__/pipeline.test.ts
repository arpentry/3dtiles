import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateTileGlb } from '../pipeline';
import { TILE_SIZE } from '../constants';
import coordinateTestCases from './fixtures/coordinate-test-cases.json';

// Mock all the pipeline dependencies
const mockRaster = vi.hoisted(() => ({
  readElevationDataFromGeoTiff: vi.fn(),
  readTextureDataFromGeoTiff: vi.fn(),
}));

const mockMesh = vi.hoisted(() => ({
  generateTerrainMesh: vi.fn(),
  mapCoordinates: vi.fn(),
  buildTriangleIndices: vi.fn(),
  computeVertexNormals: vi.fn(),
}));

const mockGltf = vi.hoisted(() => ({
  createGltfDocument: vi.fn(),
}));

const mockTiles = vi.hoisted(() => ({
  calculateTileBounds: vi.fn(),
}));

vi.mock('../raster', () => mockRaster);
vi.mock('../mesh', () => mockMesh);
vi.mock('../gltf', () => mockGltf);
vi.mock('../tiles', () => mockTiles);

/**
 * COORDINATE SYSTEM DOCUMENTATION: Complete Pipeline Integration
 * 
 * The pipeline integrates all coordinate system transformations:
 * 
 * COMPLETE TRANSFORMATION FLOW:
 * 1. INPUT: Tile coordinates (level, x, y) + Global bounds + URLs
 * 2. RASTER: GeoTIFF spatial data → Grid elevation/texture (0 to tileSize+1)
 * 3. MESH: Grid coordinates → Martini triangulation → Three.js world coords
 * 4. GLTF: Three.js coordinates → GLB binary (no coordinate change)
 * 5. OUTPUT: GLB binary ready for 3D Tiles consumption
 * 
 * COORDINATE SYSTEM CHAIN:
 *   Tile Bounds → Raster Grid → Terrain Mesh → World Coordinates → GLB
 *   [Web Mercator] → [Grid Space] → [Martini Vertices] → [Three.js] → [Binary]
 * 
 * KEY INTEGRATION POINTS:
 *   - Spatial bounds consistency between raster and mesh steps
 *   - Elevation data → terrain mesh → 3D positions
 *   - UV coordinates aligned with texture data
 *   - Error handling for no-data geometries
 * 
 * END-TO-END CONTRACTS:
 *   - Input: URLs + tile coordinates + spatial bounds
 *   - Output: GLB binary with terrain geometry + texture + normals
 *   - Error cases: Invalid geometry, missing data, coordinate mismatches
 */

describe('pipeline.ts - End-to-End Coordinate System Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Set up default mock implementations
    setupDefaultMocks();
  });

  function setupDefaultMocks() {
    // Mock tile bounds calculation
    const testCase = coordinateTestCases.transformation_test_cases.tile_coordinate_examples.cases[1];
    mockTiles.calculateTileBounds.mockReturnValue({
      minX: testCase.expected_bounds_web_mercator[0],
      minY: testCase.expected_bounds_web_mercator[1],
      maxX: testCase.expected_bounds_web_mercator[2],
      maxY: testCase.expected_bounds_web_mercator[3],
      westDeg: 6.8, southDeg: 46.5, eastDeg: 7.0, northDeg: 46.7,
    });

    // Mock elevation data (raster step output)
    const gridSize = TILE_SIZE + 1;
    const elevationData = new Float32Array(gridSize * gridSize);
    elevationData.fill(500); // 500m elevation
    mockRaster.readElevationDataFromGeoTiff.mockResolvedValue({
      data: elevationData,
      bbox: testCase.expected_bounds_web_mercator,
    });

    // Mock texture data (raster step output)
    const mockPngData = new Uint8Array([137, 80, 78, 71]); // PNG header
    mockRaster.readTextureDataFromGeoTiff.mockResolvedValue(mockPngData);

    // Mock terrain mesh generation (mesh step output)
    const mockTerrainMesh = {
      vertices: new Uint16Array([0, 0, 128, 0, 128, 128]), // Triangle in grid space
      triangles: new Uint16Array([0, 1, 2]),
      terrainGrid: elevationData,
    };
    mockMesh.generateTerrainMesh.mockReturnValue(mockTerrainMesh);

    // Mock coordinate mapping (mesh step output)
    const mockMeshGeometry = {
      positions: [-7025, 500, 7025, 0, 500, 0, 7025, 500, -7025], // Three.js coordinates
      uvs: [0, 0, 0.5, 0, 0.5, 0.5],
      vertexMap: new Map([[0, 0], [1, 1], [2, 2]]),
      minElevation: 500,
      maxElevation: 500,
      normals: [], // Will be filled by computeVertexNormals
    };
    mockMesh.mapCoordinates.mockReturnValue(mockMeshGeometry);

    // Mock triangle indices (mesh step output)
    const mockTriangleIndices = { indices: [0, 1, 2] };
    mockMesh.buildTriangleIndices.mockReturnValue(mockTriangleIndices);

    // Mock vertex normals (mesh step output)
    const mockNormals = [0, 1, 0, 0, 1, 0, 0, 1, 0]; // All pointing up
    mockMesh.computeVertexNormals.mockReturnValue(mockNormals);

    // Mock GLB creation (glTF step output)
    const mockGlbBuffer = new Uint8Array([0x67, 0x6C, 0x54, 0x46]); // glTF magic
    mockGltf.createGltfDocument.mockResolvedValue(mockGlbBuffer);
  }

  describe('generateTileGlb() - Complete Pipeline', () => {
    it('should execute complete raster→mesh→gltf pipeline', async () => {
      const elevationUrl = 'http://test-elevation.tif';
      const textureUrl = 'http://test-texture.tif';
      const level = 1, x = 0, y = 0;
      const globalBounds = coordinateTestCases.transformation_test_cases.tile_coordinate_examples.global_bounds_web_mercator as [number, number, number, number];
      const tilesetCenter = coordinateTestCases.transformation_test_cases.tile_coordinate_examples.tileset_center as [number, number];

      const result = await generateTileGlb(
        elevationUrl, textureUrl, level, x, y, globalBounds, tilesetCenter
      );

      // Verify pipeline execution order and data flow
      expect(mockTiles.calculateTileBounds).toHaveBeenCalledWith(level, x, y, globalBounds);
      
      // RASTER STEP verification
      expect(mockRaster.readElevationDataFromGeoTiff).toHaveBeenCalledWith(
        elevationUrl, 
        expect.any(Object), // tileBounds
        TILE_SIZE
      );
      expect(mockRaster.readTextureDataFromGeoTiff).toHaveBeenCalledWith(
        textureUrl,
        expect.any(Object), // tileBounds  
        TILE_SIZE
      );

      // MESH STEP verification
      expect(mockMesh.generateTerrainMesh).toHaveBeenCalledWith(
        expect.any(Float32Array), // elevation data
        TILE_SIZE
      );
      expect(mockMesh.mapCoordinates).toHaveBeenCalledWith(
        expect.any(Uint16Array), // vertices
        expect.any(Float32Array), // terrainGrid
        expect.any(Array), // elevationBbox
        tilesetCenter,
        TILE_SIZE
      );
      expect(mockMesh.buildTriangleIndices).toHaveBeenCalledWith(
        expect.any(Uint16Array), // triangles
        expect.any(Map) // vertexMap
      );
      expect(mockMesh.computeVertexNormals).toHaveBeenCalledWith(
        expect.any(Array), // positions
        expect.any(Array) // indices
      );

      // GLTF STEP verification
      expect(mockGltf.createGltfDocument).toHaveBeenCalledWith(
        expect.any(Array), // positions
        expect.any(Array), // uvs
        expect.any(Array), // indices
        expect.any(Array), // normals
        expect.any(Uint8Array) // texture
      );

      // Verify final output
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result).toEqual(new Uint8Array([0x67, 0x6C, 0x54, 0x46]));
    });

    it('should handle coordinate system transformations end-to-end', async () => {
      const elevationUrl = 'http://elevation.tif';
      const textureUrl = 'http://texture.tif';
      
      // Use known Swiss coordinate test case
      const swissCase = coordinateTestCases.transformation_test_cases.swiss_reference_points.cases[0];
      const level = 2, x = 1, y = 1;
      const globalBounds: [number, number, number, number] = [
        swissCase.web_mercator[0] - 10000,
        swissCase.web_mercator[1] - 10000, 
        swissCase.web_mercator[0] + 10000,
        swissCase.web_mercator[1] + 10000,
      ];
      const tilesetCenter: [number, number] = [swissCase.web_mercator[0], swissCase.web_mercator[1]];

      await generateTileGlb(elevationUrl, textureUrl, level, x, y, globalBounds, tilesetCenter);

      // Verify coordinate system chain integrity
      
      // 1. Tile bounds should be calculated from input coordinates
      expect(mockTiles.calculateTileBounds).toHaveBeenCalledWith(level, x, y, globalBounds);
      
      // 2. Raster functions should receive same tile bounds
      const expectedTileBounds = mockTiles.calculateTileBounds.mock.results[0].value;
      expect(mockRaster.readElevationDataFromGeoTiff).toHaveBeenCalledWith(
        elevationUrl, expectedTileBounds, TILE_SIZE
      );
      expect(mockRaster.readTextureDataFromGeoTiff).toHaveBeenCalledWith(
        textureUrl, expectedTileBounds, TILE_SIZE
      );

      // 3. Mesh functions should receive outputs from raster step
      expect(mockMesh.generateTerrainMesh).toHaveBeenCalledWith(
        expect.any(Float32Array), // elevation data from raster step
        TILE_SIZE
      );
      
      // 4. Coordinate mapping should use elevation bbox and tileset center
      expect(mockMesh.mapCoordinates).toHaveBeenCalledWith(
        expect.any(Uint16Array),
        expect.any(Float32Array),
        expect.any(Array), // elevation bbox from raster step
        tilesetCenter, // Coordinate system link: tileset center for world coords
        TILE_SIZE
      );

      // 5. glTF should receive final geometry in Three.js coordinates
      const meshGeometry = mockMesh.mapCoordinates.mock.results[0].value;
      const triangleIndices = mockMesh.buildTriangleIndices.mock.results[0].value;
      const normals = mockMesh.computeVertexNormals.mock.results[0].value;
      
      expect(mockGltf.createGltfDocument).toHaveBeenCalledWith(
        meshGeometry.positions, // Three.js world coordinates
        meshGeometry.uvs, // Normalized UV coordinates
        triangleIndices.indices, // Final triangle indices
        normals, // Computed vertex normals
        expect.any(Uint8Array) // PNG texture data
      );
    });

    it('should handle no-data geometry error correctly', async () => {
      // Mock empty triangle indices (no valid geometry)
      mockMesh.buildTriangleIndices.mockReturnValue({ indices: [] });

      const elevationUrl = 'http://elevation.tif';
      const textureUrl = 'http://texture.tif';
      const level = 0, x = 0, y = 0;
      const globalBounds: [number, number, number, number] = [0, 0, 1000, 1000];
      const tilesetCenter: [number, number] = [500, 500];

      await expect(generateTileGlb(
        elevationUrl, textureUrl, level, x, y, globalBounds, tilesetCenter
      )).rejects.toThrow('Tile contains no valid geometry');

      // Verify pipeline executed up to geometry validation
      expect(mockMesh.buildTriangleIndices).toHaveBeenCalled();
      expect(mockGltf.createGltfDocument).not.toHaveBeenCalled(); // Should stop before glTF creation
    });

    it('should propagate raster step errors', async () => {
      mockRaster.readElevationDataFromGeoTiff.mockRejectedValue(
        new Error('Failed to read elevation data')
      );

      const elevationUrl = 'http://bad-elevation.tif';
      const textureUrl = 'http://texture.tif';
      const level = 0, x = 0, y = 0;
      const globalBounds: [number, number, number, number] = [0, 0, 1000, 1000];
      const tilesetCenter: [number, number] = [500, 500];

      await expect(generateTileGlb(
        elevationUrl, textureUrl, level, x, y, globalBounds, tilesetCenter
      )).rejects.toThrow('Failed to read elevation data');

      // Verify pipeline stops at raster step
      expect(mockRaster.readElevationDataFromGeoTiff).toHaveBeenCalled();
      expect(mockMesh.generateTerrainMesh).not.toHaveBeenCalled();
    });

    it('should propagate mesh step errors', async () => {
      mockMesh.generateTerrainMesh.mockImplementation(() => {
        throw new Error('Martini triangulation failed');
      });

      const elevationUrl = 'http://elevation.tif';
      const textureUrl = 'http://texture.tif';
      const level = 0, x = 0, y = 0;
      const globalBounds: [number, number, number, number] = [0, 0, 1000, 1000];
      const tilesetCenter: [number, number] = [500, 500];

      await expect(generateTileGlb(
        elevationUrl, textureUrl, level, x, y, globalBounds, tilesetCenter
      )).rejects.toThrow('Martini triangulation failed');

      // Verify pipeline executed raster step but failed at mesh step
      expect(mockRaster.readElevationDataFromGeoTiff).toHaveBeenCalled();
      expect(mockMesh.generateTerrainMesh).toHaveBeenCalled();
      expect(mockGltf.createGltfDocument).not.toHaveBeenCalled();
    });

    it('should propagate glTF step errors', async () => {
      mockGltf.createGltfDocument.mockRejectedValue(
        new Error('glTF encoding failed')
      );

      const elevationUrl = 'http://elevation.tif';
      const textureUrl = 'http://texture.tif';
      const level = 0, x = 0, y = 0;
      const globalBounds: [number, number, number, number] = [0, 0, 1000, 1000];
      const tilesetCenter: [number, number] = [500, 500];

      await expect(generateTileGlb(
        elevationUrl, textureUrl, level, x, y, globalBounds, tilesetCenter
      )).rejects.toThrow('glTF encoding failed');

      // Verify pipeline executed all steps up to glTF creation
      expect(mockMesh.computeVertexNormals).toHaveBeenCalled();
      expect(mockGltf.createGltfDocument).toHaveBeenCalled();
    });

    it('should maintain data consistency across pipeline steps', async () => {
      // Test with controlled data to verify data flow consistency
      const gridSize = TILE_SIZE + 1;
      const controlledElevationData = new Float32Array(gridSize * gridSize);
      
      // Create elevation pattern for testing
      for (let i = 0; i < controlledElevationData.length; i++) {
        controlledElevationData[i] = 1000 + (i % 100); // 1000-1099m range
      }

      const controlledBbox = [1000, 2000, 2000, 3000];
      mockRaster.readElevationDataFromGeoTiff.mockResolvedValue({
        data: controlledElevationData,
        bbox: controlledBbox,
      });

      const elevationUrl = 'http://elevation.tif';
      const textureUrl = 'http://texture.tif';
      const level = 1, x = 0, y = 0;
      const globalBounds: [number, number, number, number] = [0, 0, 4000, 4000];
      const tilesetCenter: [number, number] = [2000, 2000];

      await generateTileGlb(elevationUrl, textureUrl, level, x, y, globalBounds, tilesetCenter);

      // Verify data consistency through pipeline steps

      // 1. Elevation data flows from raster to mesh generation
      expect(mockMesh.generateTerrainMesh).toHaveBeenCalledWith(
        controlledElevationData, TILE_SIZE
      );

      // 2. Terrain grid flows to coordinate mapping
      const terrainMesh = mockMesh.generateTerrainMesh.mock.results[0].value;
      expect(mockMesh.mapCoordinates).toHaveBeenCalledWith(
        terrainMesh.vertices,
        terrainMesh.terrainGrid,
        expect.any(Array), // elevationBbox - should be the bbox from elevation data
        tilesetCenter,
        TILE_SIZE
      );

      // 3. Geometry flows to triangle building and normal computation
      const meshGeometry = mockMesh.mapCoordinates.mock.results[0].value;
      expect(mockMesh.buildTriangleIndices).toHaveBeenCalledWith(
        terrainMesh.triangles,
        meshGeometry.vertexMap
      );

      const triangleIndices = mockMesh.buildTriangleIndices.mock.results[0].value;
      expect(mockMesh.computeVertexNormals).toHaveBeenCalledWith(
        meshGeometry.positions,
        triangleIndices.indices
      );

      // 4. All geometry data flows to glTF creation
      const normals = mockMesh.computeVertexNormals.mock.results[0].value;
      
      expect(mockGltf.createGltfDocument).toHaveBeenCalledWith(
        meshGeometry.positions,
        meshGeometry.uvs,
        triangleIndices.indices,
        normals,
        expect.any(Uint8Array) // texture data
      );
    });

    it('should handle different tile levels and coordinates correctly', async () => {
      // Test pipeline with various tile coordinates from test cases
      const testCases = coordinateTestCases.transformation_test_cases.tile_coordinate_examples.cases;
      
      for (const testCase of testCases) {
        vi.clearAllMocks();
        setupDefaultMocks();

        // Override tile bounds calculation for this test case
        mockTiles.calculateTileBounds.mockReturnValue({
          minX: testCase.expected_bounds_web_mercator[0],
          minY: testCase.expected_bounds_web_mercator[1],
          maxX: testCase.expected_bounds_web_mercator[2],
          maxY: testCase.expected_bounds_web_mercator[3],
          westDeg: 6.8, southDeg: 46.5, eastDeg: 7.0, northDeg: 46.7,
        });

        const elevationUrl = 'http://elevation.tif';
        const textureUrl = 'http://texture.tif';
        const globalBounds = coordinateTestCases.transformation_test_cases.tile_coordinate_examples.global_bounds_web_mercator as [number, number, number, number];
        const tilesetCenter = coordinateTestCases.transformation_test_cases.tile_coordinate_examples.tileset_center as [number, number];

        const result = await generateTileGlb(
          elevationUrl, textureUrl, testCase.level, testCase.x, testCase.y, 
          globalBounds, tilesetCenter
        );

        // Verify tile bounds calculation uses correct coordinates
        expect(mockTiles.calculateTileBounds).toHaveBeenCalledWith(
          testCase.level, testCase.x, testCase.y, globalBounds
        );

        // Verify successful pipeline completion
        expect(result).toBeInstanceOf(Uint8Array);
        expect(mockGltf.createGltfDocument).toHaveBeenCalled();
      }
    });
  });

  describe('Pipeline Coordinate System Validation', () => {
    it('should validate complete coordinate system transformation chain', async () => {
      // This test validates the complete coordinate transformation from
      // tile coordinates → spatial bounds → grid coordinates → world coordinates → GLB

      const elevationUrl = 'http://elevation.tif';
      const textureUrl = 'http://texture.tif';
      const level = 1, x = 0, y = 0;
      
      // Use precise test coordinates
      const globalBounds: [number, number, number, number] = [
        2485071.5, 1075268.5, 2513171.5, 1103368.5
      ];
      const tilesetCenter: [number, number] = [2499121.5, 1089318.5];

      // Set up mocks with coordinate validation
      const expectedTileBounds = {
        minX: 2485071.5, minY: 1089318.5,
        maxX: 2499121.5, maxY: 1103368.5,
        westDeg: 6.8, southDeg: 46.5, eastDeg: 7.0, northDeg: 46.7,
      };
      mockTiles.calculateTileBounds.mockReturnValue(expectedTileBounds);

      await generateTileGlb(elevationUrl, textureUrl, level, x, y, globalBounds, tilesetCenter);

      // Validate coordinate system transformation chain
      
      // 1. Tile coordinates → Spatial bounds
      expect(mockTiles.calculateTileBounds).toHaveBeenCalledWith(level, x, y, globalBounds);
      
      // 2. Spatial bounds → Raster grid coordinates
      expect(mockRaster.readElevationDataFromGeoTiff).toHaveBeenCalledWith(
        elevationUrl, expectedTileBounds, TILE_SIZE
      );
      
      // 3. Grid coordinates → World coordinates (via mesh pipeline)
      expect(mockMesh.mapCoordinates).toHaveBeenCalledWith(
        expect.any(Uint16Array), // Grid vertices
        expect.any(Float32Array), // Elevation grid
        expect.any(Array), // Spatial bounds
        tilesetCenter, // World coordinate origin
        TILE_SIZE
      );
      
      // 4. World coordinates → GLB (preserving coordinate system)
      expect(mockGltf.createGltfDocument).toHaveBeenCalledWith(
        expect.any(Array), // Three.js world positions
        expect.any(Array), // UV coordinates  
        expect.any(Array), // Triangle indices
        expect.any(Array), // Vertex normals
        expect.any(Uint8Array) // Texture data
      );

      // Verify no coordinate system contracts are broken
      const mapCoordinatesCall = mockMesh.mapCoordinates.mock.calls[0];
      expect(mapCoordinatesCall[3]).toEqual(tilesetCenter); // Tileset center preserved
      expect(mapCoordinatesCall[4]).toBe(TILE_SIZE); // Tile size preserved
    });
  });
});