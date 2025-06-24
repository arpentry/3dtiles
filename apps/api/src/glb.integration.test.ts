import { describe, it, expect, vi } from 'vitest'
import { 
  calculateTileBounds,
  readElevationData,
  generateTerrainMesh,
  mapCoordinates,
  buildTriangleIndices,
  buildGltfDocument,
  generateTexture
} from './glb'
import { 
  TEST_ELEVATION_URL,
  TEST_TEXTURE_URL,
  createMockGlobalBounds,
  createMockTilesetCenter
} from './test-setup'

describe('GLB Integration Tests with Real TIFF Files', () => {
  const mockGlobalBounds = createMockGlobalBounds()
  const mockTilesetCenter = createMockTilesetCenter()
  
  describe('Full Pipeline Tests', () => {
    it('should generate GLB from real TIFF files', async () => {
      // Test the complete pipeline with mocked TIFF files
      const tileBounds = calculateTileBounds(1, 0, 0, mockGlobalBounds)
      
      // Read elevation data
      const elevationData = await readElevationData(TEST_ELEVATION_URL, tileBounds, 64)
      expect(elevationData).toBeInstanceOf(Float32Array)
      expect(elevationData.length).toBe(64 * 64)
      
      // Generate terrain mesh
      const mesh = generateTerrainMesh(elevationData, 64)
      expect(mesh.vertices.length).toBeGreaterThan(0)
      expect(mesh.triangles.length).toBeGreaterThan(0)
      
      // Map coordinates
      const geometry = mapCoordinates(
        mesh.vertices,
        mesh.terrainGrid,
        tileBounds,
        mockTilesetCenter,
        64
      )
      expect(geometry.positions.length).toBeGreaterThan(0)
      expect(geometry.uvs.length).toBeGreaterThan(0)
      
      // Build triangle indices
      const triangleIndices = buildTriangleIndices(mesh.triangles, geometry.vertexMap)
      expect(triangleIndices.indices.length).toBeGreaterThan(0)
      
      // Generate texture (optional - might be undefined)
      const texture = await generateTexture(TEST_TEXTURE_URL, tileBounds, 64)
      
      // Build glTF document
      const glbBuffer = await buildGltfDocument(
        geometry.positions,
        geometry.uvs,
        triangleIndices.indices,
        texture
      )
      
      expect(glbBuffer).toBeInstanceOf(Uint8Array)
      expect(glbBuffer.length).toBeGreaterThan(1000)
      
      // Verify it's a valid glTF binary
      const header = new TextDecoder().decode(glbBuffer.slice(0, 4))
      expect(header).toBe('glTF')
    }, 30000) // Extended timeout for file processing

    it('should handle different tile levels and coordinates', async () => {
      const testCases = [
        { level: 0, x: 0, y: 0 },
        { level: 1, x: 0, y: 0 },
        { level: 1, x: 1, y: 0 },
        { level: 1, x: 0, y: 1 },
        { level: 2, x: 0, y: 0 }
      ]
      
      for (const { level, x, y } of testCases) {
        const tileBounds = calculateTileBounds(level, x, y, mockGlobalBounds)
        
        // Verify bounds make sense
        expect(tileBounds.minX).toBeLessThan(tileBounds.maxX)
        expect(tileBounds.minY).toBeLessThan(tileBounds.maxY)
        expect(tileBounds.westDeg).toBeLessThan(tileBounds.eastDeg)
        expect(tileBounds.southDeg).toBeLessThan(tileBounds.northDeg)
        
        // Test with small tile size for speed
        const elevationData = await readElevationData(TEST_ELEVATION_URL, tileBounds, 32)
        expect(elevationData.length).toBe(32 * 32)
      }
    }, 30000)

    it('should produce consistent results across multiple runs', async () => {
      const tileBounds = calculateTileBounds(1, 0, 0, mockGlobalBounds)
      const tileSize = 32
      
      // Run the same process twice
      const results = []
      
      for (let i = 0; i < 2; i++) {
        const elevationData = await readElevationData(TEST_ELEVATION_URL, tileBounds, tileSize)
        const mesh = generateTerrainMesh(elevationData, tileSize)
        const geometry = mapCoordinates(mesh.vertices, mesh.terrainGrid, tileBounds, mockTilesetCenter, tileSize)
        const triangleIndices = buildTriangleIndices(mesh.triangles, geometry.vertexMap)
        
        results.push({
          vertexCount: geometry.positions.length / 3,
          triangleCount: triangleIndices.indices.length / 3,
          minElevation: geometry.minElevation,
          maxElevation: geometry.maxElevation
        })
      }
      
      // Results should be identical
      expect(results[0]).toEqual(results[1])
    }, 30000)
  })

  describe('Error Handling Tests', () => {
    it('should handle missing elevation data gracefully', async () => {
      const tileBounds = calculateTileBounds(1, 0, 0, mockGlobalBounds)
      
      await expect(readElevationData(
        'http://nonexistent-url/missing.tif',
        tileBounds,
        64
      )).rejects.toThrow()
    })

    it('should handle corrupted elevation data', async () => {
      // Mock a corrupted response
      const originalFetch = global.fetch
      global.fetch = vi.fn().mockResolvedValueOnce(
        new Response('corrupted data', { status: 200 })
      )
      
      const tileBounds = calculateTileBounds(1, 0, 0, mockGlobalBounds)
      
      await expect(readElevationData(
        TEST_ELEVATION_URL,
        tileBounds,
        64
      )).rejects.toThrow()
      
      global.fetch = originalFetch
    })
  })

  describe('Performance Tests', () => {
    it('should process small tiles quickly', async () => {
      const startTime = Date.now()
      
      const tileBounds = calculateTileBounds(1, 0, 0, mockGlobalBounds)
      const elevationData = await readElevationData(TEST_ELEVATION_URL, tileBounds, 32)
      const mesh = generateTerrainMesh(elevationData, 32)
      const geometry = mapCoordinates(mesh.vertices, mesh.terrainGrid, tileBounds, mockTilesetCenter, 32)
      const triangleIndices = buildTriangleIndices(mesh.triangles, geometry.vertexMap)
      await buildGltfDocument(geometry.positions, geometry.uvs, triangleIndices.indices)
      
      const processingTime = Date.now() - startTime
      
      // Should process in reasonable time (less than 5 seconds)
      expect(processingTime).toBeLessThan(5000)
    }, 10000)

    it('should handle larger tiles within timeout', async () => {
      const startTime = Date.now()
      
      const tileBounds = calculateTileBounds(0, 0, 0, mockGlobalBounds)
      const elevationData = await readElevationData(TEST_ELEVATION_URL, tileBounds, 128)
      const mesh = generateTerrainMesh(elevationData, 128)
      const geometry = mapCoordinates(mesh.vertices, mesh.terrainGrid, tileBounds, mockTilesetCenter, 128)
      const triangleIndices = buildTriangleIndices(mesh.triangles, geometry.vertexMap)
      const glbBuffer = await buildGltfDocument(geometry.positions, geometry.uvs, triangleIndices.indices)
      
      const processingTime = Date.now() - startTime
      
      // Should still process in reasonable time
      expect(processingTime).toBeLessThan(15000)
      expect(glbBuffer.length).toBeGreaterThan(5000) // Should be larger file
    }, 20000)
  })

  describe('Data Validation Tests', () => {
    it('should produce valid mesh geometry', async () => {
      const tileBounds = calculateTileBounds(1, 0, 0, mockGlobalBounds)
      const elevationData = await readElevationData(TEST_ELEVATION_URL, tileBounds, 64)
      const mesh = generateTerrainMesh(elevationData, 64)
      const geometry = mapCoordinates(mesh.vertices, mesh.terrainGrid, tileBounds, mockTilesetCenter, 64)
      
      // Validate geometry structure
      expect(geometry.positions.length % 3).toBe(0) // Must be multiple of 3
      expect(geometry.uvs.length % 2).toBe(0) // Must be multiple of 2
      expect(geometry.positions.length / 3).toBe(geometry.uvs.length / 2) // Same vertex count
      
      // Validate elevation bounds are reasonable for Swiss terrain
      expect(geometry.minElevation).toBeGreaterThanOrEqual(0)
      expect(geometry.maxElevation).toBeLessThan(5000) // Swiss Alps max ~4.8km
      expect(geometry.maxElevation).toBeGreaterThan(geometry.minElevation)
      
      // Validate UV coordinates are normalized
      geometry.uvs.forEach(uv => {
        expect(uv).toBeGreaterThanOrEqual(0)
        expect(uv).toBeLessThanOrEqual(1)
      })
    })

    it('should produce valid triangle indices', async () => {
      const tileBounds = calculateTileBounds(1, 0, 0, mockGlobalBounds)
      const elevationData = await readElevationData(TEST_ELEVATION_URL, tileBounds, 32)
      const mesh = generateTerrainMesh(elevationData, 32)
      const geometry = mapCoordinates(mesh.vertices, mesh.terrainGrid, tileBounds, mockTilesetCenter, 32)
      const triangleIndices = buildTriangleIndices(mesh.triangles, geometry.vertexMap)
      
      const vertexCount = geometry.positions.length / 3
      
      // Validate triangle indices
      expect(triangleIndices.indices.length % 3).toBe(0) // Must be multiple of 3
      
      triangleIndices.indices.forEach(index => {
        expect(index).toBeGreaterThanOrEqual(0)
        expect(index).toBeLessThan(vertexCount)
      })
      
      // Check for degenerate triangles (shouldn't have any with same indices)
      for (let i = 0; i < triangleIndices.indices.length; i += 3) {
        const a = triangleIndices.indices[i]
        const b = triangleIndices.indices[i + 1]
        const c = triangleIndices.indices[i + 2]
        
        expect(a).not.toBe(b)
        expect(b).not.toBe(c)
        expect(a).not.toBe(c)
      }
    })
  })
}) 