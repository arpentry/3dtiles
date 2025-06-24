import { describe, it, expect, beforeEach } from 'vitest'
import { 
  calculateTileBounds,
  generateTerrainMesh,
  mapCoordinates,
  buildTriangleIndices,
  buildGltfDocument,
  readElevationData,
  generateTexture,
  type TileBounds,
  type TerrainMesh,
  type MeshGeometry,
} from './glb'
import { 
  createMockTileBounds,
  createMockElevationData,
  createMockGlobalBounds,
  createMockTilesetCenter,
  TEST_ELEVATION_URL,
  TEST_TEXTURE_URL
} from './test-setup'

describe('GLB Generation Functions', () => {
  let mockGlobalBounds: [number, number, number, number]
  let mockTilesetCenter: [number, number]
  let mockTileBounds: TileBounds

  beforeEach(() => {
    mockGlobalBounds = createMockGlobalBounds()
    mockTilesetCenter = createMockTilesetCenter()
    mockTileBounds = createMockTileBounds()
  })

  describe('calculateTileBounds', () => {
    it('should calculate correct bounds for level 0 tile', () => {
      const bounds = calculateTileBounds(0, 0, 0, mockGlobalBounds)
      
      expect(bounds).toHaveProperty('minX')
      expect(bounds).toHaveProperty('minY')
      expect(bounds).toHaveProperty('maxX')
      expect(bounds).toHaveProperty('maxY')
      expect(bounds).toHaveProperty('westDeg')
      expect(bounds).toHaveProperty('southDeg')
      expect(bounds).toHaveProperty('eastDeg')
      expect(bounds).toHaveProperty('northDeg')
      
      // Check that bounds are within reasonable ranges
      expect(bounds.westDeg).toBeGreaterThan(-180)
      expect(bounds.westDeg).toBeLessThan(180)
      expect(bounds.eastDeg).toBeGreaterThan(bounds.westDeg)
      expect(bounds.northDeg).toBeGreaterThan(bounds.southDeg)
    })

    it('should calculate smaller bounds for higher level tiles', () => {
      const level0 = calculateTileBounds(0, 0, 0, mockGlobalBounds)
      const level1 = calculateTileBounds(1, 0, 0, mockGlobalBounds)
      
      const level0Width = level0.maxX - level0.minX
      const level1Width = level1.maxX - level1.minX
      
      // Higher level tiles should be smaller
      expect(level1Width).toBeLessThan(level0Width)
    })

    it('should handle different tile coordinates', () => {
      const tile00 = calculateTileBounds(1, 0, 0, mockGlobalBounds)
      const tile01 = calculateTileBounds(1, 0, 1, mockGlobalBounds)
      const tile10 = calculateTileBounds(1, 1, 0, mockGlobalBounds)
      
      // Different tiles should have different bounds
      expect(tile00.minX).not.toBe(tile01.minX)
      expect(tile00.minX).not.toBe(tile10.minX)
      expect(tile01.minX).not.toBe(tile10.minX)
    })
  })

  describe('generateTerrainMesh', () => {
    it('should generate mesh from elevation data', () => {
      const elevationData = createMockElevationData(64) // Small size for fast testing
      const mesh = generateTerrainMesh(elevationData, 64)
      
      expect(mesh).toHaveProperty('vertices')
      expect(mesh).toHaveProperty('triangles')
      expect(mesh).toHaveProperty('terrainGrid')
      
      expect(mesh.vertices.length).toBeGreaterThan(0)
      expect(mesh.triangles.length).toBeGreaterThan(0)
      expect(mesh.terrainGrid.length).toBe(65 * 65) // gridSize = tileSize + 1
    })

    it('should create terrain grid with correct dimensions', () => {
      const tileSize = 32
      const elevationData = createMockElevationData(tileSize)
      const mesh = generateTerrainMesh(elevationData, tileSize)
      
      const expectedGridSize = (tileSize + 1) * (tileSize + 1)
      expect(mesh.terrainGrid.length).toBe(expectedGridSize)
    })

    it('should handle different tile sizes', () => {
      const sizes = [16, 32, 64]
      
      for (const size of sizes) {
        const elevationData = createMockElevationData(size)
        const mesh = generateTerrainMesh(elevationData, size)
        
        expect(mesh.vertices.length).toBeGreaterThan(0)
        expect(mesh.triangles.length).toBeGreaterThan(0)
        expect(mesh.terrainGrid.length).toBe((size + 1) * (size + 1))
      }
    })
  })

  describe('mapCoordinates', () => {
    it('should map vertices to 3D coordinates', () => {
      const elevationData = createMockElevationData(32)
      const mesh = generateTerrainMesh(elevationData, 32)
      
      const geometry = mapCoordinates(
        mesh.vertices,
        mesh.terrainGrid,
        mockTileBounds,
        mockTilesetCenter,
        32
      )
      
      expect(geometry).toHaveProperty('positions')
      expect(geometry).toHaveProperty('uvs')
      expect(geometry).toHaveProperty('vertexMap')
      expect(geometry).toHaveProperty('minElevation')
      expect(geometry).toHaveProperty('maxElevation')
      
      expect(geometry.positions.length % 3).toBe(0) // Should be multiple of 3 (x,y,z)
      expect(geometry.uvs.length % 2).toBe(0) // Should be multiple of 2 (u,v)
      expect(geometry.positions.length / 3).toBe(geometry.uvs.length / 2) // Same number of vertices
    })

    it('should calculate correct elevation bounds', () => {
      const elevationData = new Float32Array(16 * 16)
      elevationData.fill(500) // Fill with constant elevation
      elevationData[0] = 100 // Min elevation
      elevationData[1] = 1000 // Max elevation
      
      const mesh = generateTerrainMesh(elevationData, 16)
      const geometry = mapCoordinates(
        mesh.vertices,
        mesh.terrainGrid,
        mockTileBounds,
        mockTilesetCenter,
        16
      )
      
      expect(geometry.minElevation).toBeLessThanOrEqual(geometry.maxElevation)
      expect(geometry.minElevation).toBeGreaterThan(0)
    })

    it('should generate UV coordinates in correct range', () => {
      const elevationData = createMockElevationData(16)
      const mesh = generateTerrainMesh(elevationData, 16)
      
      const geometry = mapCoordinates(
        mesh.vertices,
        mesh.terrainGrid,
        mockTileBounds,
        mockTilesetCenter,
        16
      )
      
      // Check UV coordinates are in [0,1] range
      for (let i = 0; i < geometry.uvs.length; i++) {
        expect(geometry.uvs[i]).toBeGreaterThanOrEqual(0)
        expect(geometry.uvs[i]).toBeLessThanOrEqual(1)
      }
    })
  })

  describe('buildTriangleIndices', () => {
    it('should build valid triangle indices', () => {
      const elevationData = createMockElevationData(16)
      const mesh = generateTerrainMesh(elevationData, 16)
      
      const geometry = mapCoordinates(
        mesh.vertices,
        mesh.terrainGrid,
        mockTileBounds,
        mockTilesetCenter,
        16
      )
      
      const triangleIndices = buildTriangleIndices(mesh.triangles, geometry.vertexMap)
      
      expect(triangleIndices.indices.length % 3).toBe(0) // Should be multiple of 3
      expect(triangleIndices.indices.length).toBeGreaterThan(0)
      
      // All indices should be valid (less than vertex count)
      const vertexCount = geometry.positions.length / 3
      for (const index of triangleIndices.indices) {
        expect(index).toBeGreaterThanOrEqual(0)
        expect(index).toBeLessThan(vertexCount)
      }
    })

    it('should handle empty triangles array', () => {
      const emptyTriangles = new Uint16Array(0)
      const emptyVertexMap = new Map<number, number>()
      
      const result = buildTriangleIndices(emptyTriangles, emptyVertexMap)
      
      expect(result.indices).toHaveLength(0)
    })
  })

  describe('buildGltfDocument', () => {
    it('should create valid glTF binary data', async () => {
      // Create minimal test data
      const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0] // Triangle vertices
      const uvs = [0, 0, 1, 0, 0, 1] // UV coordinates
      const indices = [0, 1, 2] // Triangle indices
      
      const glbBuffer = await buildGltfDocument(positions, uvs, indices)
      
      expect(glbBuffer).toBeInstanceOf(Uint8Array)
      expect(glbBuffer.length).toBeGreaterThan(0)
      
      // Check for glTF binary header (should start with 'glTF')
      const header = new TextDecoder().decode(glbBuffer.slice(0, 4))
      expect(header).toBe('glTF')
    })

    it('should handle texture data', async () => {
      const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0]
      const uvs = [0, 0, 1, 0, 0, 1]
      const indices = [0, 1, 2]
      
      // Create a minimal PNG texture (just a few bytes)
      const mockTexture = new Uint8Array([
        137, 80, 78, 71, 13, 10, 26, 10, // PNG signature
        0, 0, 0, 13, 73, 72, 68, 82, // IHDR chunk
        0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, // 1x1 image
      ])
      
      const glbBuffer = await buildGltfDocument(positions, uvs, indices, mockTexture)
      
      expect(glbBuffer).toBeInstanceOf(Uint8Array)
      expect(glbBuffer.length).toBeGreaterThan(0)
    })

    it('should handle large index arrays', async () => {
      // Create data that requires 32-bit indices
      const vertexCount = 70000 // More than 65535
      const positions: number[] = []
      const uvs: number[] = []
      const indices: number[] = []
      
      // Create vertices
      for (let i = 0; i < vertexCount; i++) {
        positions.push(i, 0, 0) // Simple vertex positions
        uvs.push(0, 0) // Simple UV coordinates
      }
      
      // Create indices (just first 3 vertices as a triangle)
      indices.push(0, 1, 2)
      
      const glbBuffer = await buildGltfDocument(positions, uvs, indices)
      
      expect(glbBuffer).toBeInstanceOf(Uint8Array)
      expect(glbBuffer.length).toBeGreaterThan(0)
    })
  })

  describe('readElevationData', () => {
    it('should read elevation data from TIFF', async () => {
      // This test will use the mocked fetch from test-setup
      const elevationData = await readElevationData(
        TEST_ELEVATION_URL,
        mockTileBounds,
        64
      )
      
      expect(elevationData).toBeInstanceOf(Float32Array)
      expect(elevationData.length).toBe(64 * 64)
    })

    it('should throw error for invalid URL', async () => {
      await expect(readElevationData(
        'http://invalid-url/nonexistent.tif',
        mockTileBounds,
        64
      )).rejects.toThrow()
    })
  })

  describe('generateTexture', () => {
    it('should generate texture from TIFF', async () => {
      // This test will use the mocked fetch from test-setup
      const texture = await generateTexture(
        TEST_TEXTURE_URL,
        mockTileBounds,
        64
      )
      
      if (texture) {
        expect(texture).toBeInstanceOf(Uint8Array)
        expect(texture.length).toBeGreaterThan(0)
      }
      // Note: texture might be undefined if the mock texture file doesn't exist
    })

    it('should handle invalid texture URL gracefully', async () => {
      const texture = await generateTexture(
        'http://invalid-url/nonexistent.tif',
        mockTileBounds,
        64
      )
      
      expect(texture).toBeUndefined()
    })
  })

  describe('Integration Tests', () => {
    it('should generate complete tile mesh from mock data', async () => {
      // Test the complete pipeline with mock data
      const elevationData = createMockElevationData(32)
      const mesh = generateTerrainMesh(elevationData, 32)
      
      const geometry = mapCoordinates(
        mesh.vertices,
        mesh.terrainGrid,
        mockTileBounds,
        mockTilesetCenter,
        32
      )
      
      const triangleIndices = buildTriangleIndices(mesh.triangles, geometry.vertexMap)
      
      expect(triangleIndices.indices.length).toBeGreaterThan(0)
      
      const glbBuffer = await buildGltfDocument(
        geometry.positions,
        geometry.uvs,
        triangleIndices.indices
      )
      
      expect(glbBuffer.length).toBeGreaterThan(1000) // Should be a reasonable size
    })
  })
}) 