import { describe, it, expect } from 'vitest'
import { 
  calculateTileBounds,
  generateTerrainMesh,
  mapCoordinates,
  buildTriangleIndices,
  buildGltfDocumentCore,
  type TileBounds,
} from './glb-core'
import { 
  createMockTileBounds,
  createMockElevationData,
  createMockGlobalBounds,
  createMockTilesetCenter
} from './test-setup'

describe('GLB Core Functions (No WASM)', () => {
  const mockGlobalBounds = createMockGlobalBounds()
  const mockTilesetCenter = createMockTilesetCenter()
  const mockTileBounds = createMockTileBounds()

  describe('calculateTileBounds', () => {
    it('should calculate bounds for level 0 tile', () => {
      const bounds = calculateTileBounds(0, 0, 0, mockGlobalBounds)
      
      expect(bounds).toHaveProperty('minX')
      expect(bounds).toHaveProperty('maxX')
      expect(bounds.minX).toBeLessThan(bounds.maxX)
      expect(bounds.minY).toBeLessThan(bounds.maxY)
    })

    it('should handle different zoom levels', () => {
      const level0 = calculateTileBounds(0, 0, 0, mockGlobalBounds)
      const level1 = calculateTileBounds(1, 0, 0, mockGlobalBounds)
      
      const level0Size = level0.maxX - level0.minX
      const level1Size = level1.maxX - level1.minX
      
      expect(level1Size).toBeLessThan(level0Size)
    })
  })

  describe('generateTerrainMesh', () => {
    it('should generate mesh from elevation data', () => {
      const tileSize = 32
      const elevationData = createMockElevationData(tileSize)
      
      const mesh = generateTerrainMesh(elevationData, tileSize)
      
      expect(mesh.vertices.length).toBeGreaterThan(0)
      expect(mesh.triangles.length).toBeGreaterThan(0)
      expect(mesh.terrainGrid.length).toBe((tileSize + 1) * (tileSize + 1))
    })

    it('should handle different tile sizes', () => {
      const sizes = [16, 32, 64]
      
      sizes.forEach(size => {
        const elevationData = createMockElevationData(size)
        const mesh = generateTerrainMesh(elevationData, size)
        
        expect(mesh.vertices.length).toBeGreaterThan(0)
        expect(mesh.triangles.length).toBeGreaterThan(0)
      })
    })
  })

  describe('mapCoordinates', () => {
    it('should map vertices to 3D positions', () => {
      const tileSize = 16
      const elevationData = createMockElevationData(tileSize)
      const mesh = generateTerrainMesh(elevationData, tileSize)
      
      const geometry = mapCoordinates(
        mesh.vertices,
        mesh.terrainGrid,
        mockTileBounds,
        mockTilesetCenter,
        tileSize
      )
      
      expect(geometry.positions.length % 3).toBe(0)
      expect(geometry.uvs.length % 2).toBe(0)
      expect(geometry.positions.length / 3).toBe(geometry.uvs.length / 2)
      expect(geometry.minElevation).toBeLessThanOrEqual(geometry.maxElevation)
    })

    it('should generate UV coordinates in correct range', () => {
      const tileSize = 16
      const elevationData = createMockElevationData(tileSize)
      const mesh = generateTerrainMesh(elevationData, tileSize)
      
      const geometry = mapCoordinates(
        mesh.vertices,
        mesh.terrainGrid,
        mockTileBounds,
        mockTilesetCenter,
        tileSize
      )
      
      geometry.uvs.forEach(uv => {
        expect(uv).toBeGreaterThanOrEqual(0)
        expect(uv).toBeLessThanOrEqual(1)
      })
    })
  })

  describe('buildTriangleIndices', () => {
    it('should build valid triangle indices', () => {
      const tileSize = 16
      const elevationData = createMockElevationData(tileSize)
      const mesh = generateTerrainMesh(elevationData, tileSize)
      
      const geometry = mapCoordinates(
        mesh.vertices,
        mesh.terrainGrid,
        mockTileBounds,
        mockTilesetCenter,
        tileSize
      )
      
      const triangleIndices = buildTriangleIndices(mesh.triangles, geometry.vertexMap)
      
      expect(triangleIndices.indices.length % 3).toBe(0)
      expect(triangleIndices.indices.length).toBeGreaterThan(0)
      
      const vertexCount = geometry.positions.length / 3
      triangleIndices.indices.forEach(index => {
        expect(index).toBeGreaterThanOrEqual(0)
        expect(index).toBeLessThan(vertexCount)
      })
    })
  })

  describe('buildGltfDocumentCore', () => {
    it('should create valid glTF binary data', async () => {
      const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0] // Triangle vertices
      const uvs = [0, 0, 1, 0, 0, 1] // UV coordinates
      const indices = [0, 1, 2] // Triangle indices
      
      const glbBuffer = await buildGltfDocumentCore(positions, uvs, indices)
      
      expect(glbBuffer).toBeInstanceOf(Uint8Array)
      expect(glbBuffer.length).toBeGreaterThan(0)
      
      // Check for glTF binary header
      const header = new TextDecoder().decode(glbBuffer.slice(0, 4))
      expect(header).toBe('glTF')
    })
  })

  describe('Integration - Full Pipeline without WASM', () => {
    it('should process complete terrain mesh pipeline', async () => {
      const tileSize = 32
      
      // 1. Calculate bounds
      const bounds = calculateTileBounds(1, 0, 0, mockGlobalBounds)
      expect(bounds.minX).toBeLessThan(bounds.maxX)
      
      // 2. Generate elevation data
      const elevationData = createMockElevationData(tileSize)
      expect(elevationData.length).toBe(tileSize * tileSize)
      
      // 3. Generate terrain mesh
      const mesh = generateTerrainMesh(elevationData, tileSize)
      expect(mesh.vertices.length).toBeGreaterThan(0)
      
      // 4. Map coordinates
      const geometry = mapCoordinates(
        mesh.vertices,
        mesh.terrainGrid,
        bounds,
        mockTilesetCenter,
        tileSize
      )
      expect(geometry.positions.length).toBeGreaterThan(0)
      
      // 5. Build indices
      const triangleIndices = buildTriangleIndices(mesh.triangles, geometry.vertexMap)
      expect(triangleIndices.indices.length).toBeGreaterThan(0)
      
      // 6. Build glTF document
      const glbBuffer = await buildGltfDocumentCore(
        geometry.positions,
        geometry.uvs,
        triangleIndices.indices
      )
      expect(glbBuffer.length).toBeGreaterThan(1000)
      
      // Verify the pipeline produces valid data
      expect(geometry.positions.length / 3).toBe(geometry.uvs.length / 2)
      expect(triangleIndices.indices.length % 3).toBe(0)
    })

    it('should handle edge cases gracefully', () => {
      const tileSize = 8 // Very small tile
      const elevationData = createMockElevationData(tileSize)
      
      const mesh = generateTerrainMesh(elevationData, tileSize)
      const geometry = mapCoordinates(
        mesh.vertices,
        mesh.terrainGrid,
        mockTileBounds,
        mockTilesetCenter,
        tileSize
      )
      const triangleIndices = buildTriangleIndices(mesh.triangles, geometry.vertexMap)
      
      // Even with small data, should produce valid results
      expect(geometry.positions.length).toBeGreaterThan(0)
      expect(triangleIndices.indices.length).toBeGreaterThan(0)
    })
  })
}) 