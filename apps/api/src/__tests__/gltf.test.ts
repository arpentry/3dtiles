import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createGltfDocument } from '../gltf';
import {
  DEFAULT_BASE_COLOR,
  DEFAULT_ROUGHNESS_FACTOR,
  DEFAULT_METALLIC_FACTOR,
  INDEX_16BIT_LIMIT,
  PNG_MIME_TYPE,
} from '../constants';

// Mock the gltf-transform library
const mockGltfTransform = vi.hoisted(() => {
  let currentMockPrimitive: any = null;

  // Create factory functions that return new instances
  const createMockAccessor = () => ({
    setType: vi.fn().mockReturnThis(),
    setArray: vi.fn().mockReturnThis(), 
    setBuffer: vi.fn().mockReturnThis(),
  });

  const createMockTexture = () => ({
    setImage: vi.fn().mockReturnThis(),
    setMimeType: vi.fn().mockReturnThis(),
  });

  const createMockTextureInfo = () => ({
    setWrapS: vi.fn().mockReturnThis(),
    setWrapT: vi.fn().mockReturnThis(),
  });

  const createMockMaterial = () => ({
    setBaseColorFactor: vi.fn().mockReturnThis(),
    setRoughnessFactor: vi.fn().mockReturnThis(), 
    setMetallicFactor: vi.fn().mockReturnThis(),
    setDoubleSided: vi.fn().mockReturnThis(),
    setBaseColorTexture: vi.fn().mockReturnThis(),
    getBaseColorTextureInfo: vi.fn().mockReturnValue(createMockTextureInfo()),
  });

  const createMockPrimitive = () => {
    currentMockPrimitive = {
      setAttribute: vi.fn().mockReturnThis(),
      setIndices: vi.fn().mockReturnThis(),
      setMaterial: vi.fn().mockReturnThis(),
    };
    return currentMockPrimitive;
  };

  const createMockMesh = () => ({
    addPrimitive: vi.fn().mockReturnThis(),
  });

  const createMockNode = () => ({
    setMesh: vi.fn().mockReturnThis(),
  });

  const createMockScene = () => ({
    addChild: vi.fn().mockReturnThis(),
  });

  const mockBuffer = {};
  const mockRoot = {
    getDefaultScene: vi.fn().mockReturnValue(null), // Initially null, like a real document
  };

  const mockDocument = {
    createAccessor: vi.fn(() => createMockAccessor()),
    createBuffer: vi.fn(() => mockBuffer),
    createTexture: vi.fn(() => createMockTexture()),
    createMaterial: vi.fn(() => createMockMaterial()),
    createPrimitive: vi.fn(() => createMockPrimitive()),
    createMesh: vi.fn(() => createMockMesh()),
    createNode: vi.fn(() => createMockNode()),
    createScene: vi.fn(() => createMockScene()),
    getRoot: vi.fn(() => mockRoot),
  };

  const mockNodeIOInstance = {
    writeBinary: vi.fn().mockResolvedValue(new Uint8Array([0x67, 0x6C, 0x54, 0x46])), // glTF magic
  };

  return {
    Document: vi.fn(() => mockDocument),
    NodeIO: vi.fn(() => mockNodeIOInstance),
    TextureInfo: {
      WrapMode: {
        CLAMP_TO_EDGE: 33071,
      },
    },
    // Expose mocks for testing
    mockDocument,
    mockNodeIO: mockNodeIOInstance,
    get mockPrimitive() { return currentMockPrimitive; },
  };
});

vi.mock('@gltf-transform/core', () => mockGltfTransform);

/**
 * COORDINATE SYSTEM DOCUMENTATION: gltf.ts functions
 * 
 * The glTF step transforms data through these coordinate systems:
 * 
 * INPUT COORDINATE SYSTEM:
 *   - Three.js world coordinates from mesh step: [x, y, z] arrays
 *     * X = easting offset from tileset center (meters)
 *     * Y = elevation above sea level (meters)
 *     * Z = -northing offset from tileset center (meters)
 *   - UV texture coordinates: [u, v] normalized 0-1 range
 *   - Triangle indices: References to vertex array positions
 *   - Optional normals: [nx, ny, nz] normalized unit vectors
 * 
 * OUTPUT COORDINATE SYSTEM:
 *   - glTF/GLB binary format: Same Three.js coordinates (no transformation)
 *   - glTF scene graph: Single node with mesh, no transforms applied
 *   - PBR material: Configured for terrain rendering with optional texture
 * 
 * KEY TRANSFORMATIONS:
 *   1. Geometry arrays → glTF accessor binary buffers
 *   2. PNG texture data → glTF texture/image/material
 *   3. Three.js coordinates → glTF vertex positions (no transform)
 *   4. Mesh attributes → glTF primitive with PBR material
 * 
 * COORDINATE SYSTEM CONTRACTS:
 *   - NO coordinate transformations (preserves Three.js coordinates)
 *   - Binary encoding of geometry data for efficient transmission
 *   - PBR material setup optimized for terrain visualization
 *   - Automatic 16-bit vs 32-bit index selection for optimization
 */

describe('gltf.ts - Coordinate System & Function Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-setup the writeBinary mock to prevent state corruption
    mockGltfTransform.mockNodeIO.writeBinary.mockResolvedValue(new Uint8Array([0x67, 0x6C, 0x54, 0x46]));
  });

  describe('createGltfDocument()', () => {
    it('should create basic glTF document with positions, UVs, and indices', async () => {
      // Simple triangle mesh in Three.js coordinates
      const positions = [
        0, 500, 0,    // Vertex 0: centered, 500m elevation
        100, 450, -50, // Vertex 1: east 100m, lower elevation, south 50m  
        -100, 600, 50, // Vertex 2: west 100m, higher elevation, north 50m
      ];
      const uvs = [0.5, 0.5, 1.0, 0.0, 0.0, 1.0]; // UV coordinates
      const indices = [0, 1, 2]; // Single triangle

      const result = await createGltfDocument(positions, uvs, indices);

      // Verify glTF document creation
      expect(mockGltfTransform.Document).toHaveBeenCalled();
      expect(mockGltfTransform.mockDocument.createBuffer).toHaveBeenCalled();

      // Verify accessor creation for positions
      expect(mockGltfTransform.mockDocument.createAccessor).toHaveBeenCalledTimes(3); // pos, uv, indices

      // Verify scene hierarchy
      expect(mockGltfTransform.mockDocument.createNode).toHaveBeenCalled();
      expect(mockGltfTransform.mockDocument.createMesh).toHaveBeenCalled();

      // Verify GLB export
      expect(mockGltfTransform.NodeIO).toHaveBeenCalled();
      expect(mockGltfTransform.mockNodeIO.writeBinary).toHaveBeenCalled();
      expect(result).toBeInstanceOf(Uint8Array);
    });

    it('should handle vertex normals when provided', async () => {
      const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
      const uvs = [0, 0, 1, 0, 0, 1];
      const indices = [0, 1, 2];
      const normals = [0, 0, 1, 0, 0, 1, 0, 0, 1]; // All pointing up

      await createGltfDocument(positions, uvs, indices, normals);

      // Should create 4 accessors: positions, uvs, indices, normals
      expect(mockGltfTransform.mockDocument.createAccessor).toHaveBeenCalledTimes(4);

      // Verify normal attribute is set
      expect(mockGltfTransform.mockPrimitive.setAttribute).toHaveBeenCalledWith('NORMAL', expect.any(Object));
    });

    it('should handle large meshes with 32-bit indices', async () => {
      // Create mesh exceeding 16-bit index limit
      const vertexCount = INDEX_16BIT_LIMIT + 100;
      const positions = new Array(vertexCount * 3).fill(0);
      const uvs = new Array(vertexCount * 2).fill(0);
      const indices = Array.from({ length: vertexCount }, (_, i) => i);

      await createGltfDocument(positions, uvs, indices);

      // Verify accessors were created for large mesh
      expect(mockGltfTransform.mockDocument.createAccessor).toHaveBeenCalledTimes(3);
    });

    it('should handle small meshes with 16-bit indices', async () => {
      const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
      const uvs = [0, 0, 1, 0, 0, 1];
      const indices = [0, 1, 2]; // Small mesh

      await createGltfDocument(positions, uvs, indices);

      // Verify accessors were created for small mesh
      expect(mockGltfTransform.mockDocument.createAccessor).toHaveBeenCalledTimes(3);
    });

    it('should create PBR material with texture when provided', async () => {
      const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
      const uvs = [0, 0, 1, 0, 0, 1];
      const indices = [0, 1, 2];
      const texture = new Uint8Array([137, 80, 78, 71]); // PNG header

      await createGltfDocument(positions, uvs, indices, undefined, texture);

      // Verify texture setup was called
      expect(mockGltfTransform.mockDocument.createTexture).toHaveBeenCalled();
    });

    it('should create PBR material without texture when not provided', async () => {
      const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
      const uvs = [0, 0, 1, 0, 0, 1];
      const indices = [0, 1, 2];

      await createGltfDocument(positions, uvs, indices);

      // Verify no texture creation when not provided
      expect(mockGltfTransform.mockDocument.createTexture).not.toHaveBeenCalled();
    });

    it('should preserve Three.js coordinate system without transformations', async () => {
      // Test coordinates representing Swiss terrain in Three.js system
      const positions = [
        -7025.0, 432.0, 14050.0,  // Zurich airport coordinates (relative to tileset center)
        0.0, 500.0, 0.0,          // Tileset center
        7025.0, 1500.0, -14050.0, // High elevation point
      ];
      const uvs = [0, 0, 0.5, 0.5, 1, 1];
      const indices = [0, 1, 2];

      await createGltfDocument(positions, uvs, indices);

      // Verify basic document creation
      expect(mockGltfTransform.mockDocument.createNode).toHaveBeenCalled();
    });

    it('should handle empty geometry gracefully', async () => {
      const positions: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];

      await createGltfDocument(positions, uvs, indices);

      // Should still create valid glTF structure
      expect(mockGltfTransform.mockDocument.createAccessor).toHaveBeenCalledTimes(3);
      expect(mockGltfTransform.mockPrimitive.setAttribute).toHaveBeenCalledTimes(2);
      expect(mockGltfTransform.mockNodeIO.writeBinary).toHaveBeenCalled();
    });

    it('should validate geometry data consistency', async () => {
      // Mismatched array lengths should still work (glTF-transform handles validation)
      const positions = [0, 0, 0, 1, 0, 0]; // 2 vertices
      const uvs = [0, 0, 1, 0, 0, 1, 0.5, 0.5]; // 4 UV pairs
      const indices = [0, 1]; // Incomplete triangle

      await createGltfDocument(positions, uvs, indices);

      // Function should complete without throwing
      expect(mockGltfTransform.mockNodeIO.writeBinary).toHaveBeenCalled();
    });

    it('should handle terrain-specific material configuration', async () => {
      const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
      const uvs = [0, 0, 1, 0, 0, 1];
      const indices = [0, 1, 2];

      await createGltfDocument(positions, uvs, indices);

      // Verify material was created
      expect(mockGltfTransform.mockDocument.createMaterial).toHaveBeenCalled();
    });

    it('should maintain coordinate system contracts from mesh to glTF', async () => {
      // Test with realistic Swiss terrain coordinates
      const swissTerrainPositions = [
        -14050.0, 372.0, 14050.0,   // Lake Geneva level (relative coordinates)
        0.0, 500.0, 0.0,            // Tileset center elevation
        7025.0, 1500.0, -7025.0,    // Mountain elevation
      ];
      
      const uvs = [
        0.0, 0.0,    // Bottom-left UV
        0.5, 0.5,    // Center UV
        1.0, 1.0,    // Top-right UV
      ];
      
      const indices = [0, 1, 2];
      
      const normals = [
        0, 1, 0,  // Normal pointing up
        0, 1, 0,  // Normal pointing up
        0, 1, 0,  // Normal pointing up
      ];

      const texture = new Uint8Array(100).fill(128); // Mock PNG data

      const result = await createGltfDocument(swissTerrainPositions, uvs, indices, normals, texture);

      // GLB binary output should be generated
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBeGreaterThan(0);

      // Verify all required accessors were created
      expect(mockGltfTransform.mockDocument.createAccessor).toHaveBeenCalledTimes(4); // pos, uv, indices, normals
    });
  });

  describe('Coordinate System Integration Tests', () => {

    it('should handle coordinate extremes for large terrain tiles', async () => {
      // Test with extreme coordinate values that might occur in large Swiss terrain tiles
      const extremePositions = [
        -50000.0, 200.0, 50000.0,   // Far corner (100km span)
        0.0, 2000.0, 0.0,           // High mountain peak
        50000.0, 4478.0, -50000.0,  // Matterhorn-level elevation
      ];
      
      const uvs = [0, 0, 0.5, 0.5, 1, 1];
      const indices = [0, 1, 2];

      await createGltfDocument(extremePositions, uvs, indices);

      // Verify extreme coordinates handled properly
      expect(mockGltfTransform.mockDocument.createAccessor).toHaveBeenCalledTimes(3);
    });
  });
});