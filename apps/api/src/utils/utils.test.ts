import { describe, it, expect } from 'vitest'
import { lonLatToTile, type BoundingRegion, degToRad } from './utils'

describe('lonLatToTile', () => {
  // Define a test root region covering a 2x2 degree area in radians
  const testRoot: BoundingRegion = {
    west: degToRad(-1),   // -1 degree
    south: degToRad(-1),  // -1 degree  
    east: degToRad(1),    // 1 degree
    north: degToRad(1),   // 1 degree
    minH: 0,
    maxH: 100
  }

  describe('level 0 (single tile)', () => {
    it('should return {x: 0, y: 0} for any point inside the root region', () => {
      expect(lonLatToTile(testRoot, 0, degToRad(0), degToRad(0))).toEqual({ x: 0, y: 0 })
      expect(lonLatToTile(testRoot, 0, degToRad(-0.5), degToRad(0.5))).toEqual({ x: 0, y: 0 })
      expect(lonLatToTile(testRoot, 0, degToRad(0.9), degToRad(-0.9))).toEqual({ x: 0, y: 0 })
    })
  })

  describe('level 1 (2x2 grid)', () => {
    it('should return correct tile coordinates for each quadrant', () => {
      // Bottom-left quadrant (x=0, y=0)
      expect(lonLatToTile(testRoot, 1, degToRad(-0.5), degToRad(-0.5))).toEqual({ x: 0, y: 0 })
      
      // Bottom-right quadrant (x=1, y=0)  
      expect(lonLatToTile(testRoot, 1, degToRad(0.5), degToRad(-0.5))).toEqual({ x: 1, y: 0 })
      
      // Top-left quadrant (x=0, y=1)
      expect(lonLatToTile(testRoot, 1, degToRad(-0.5), degToRad(0.5))).toEqual({ x: 0, y: 1 })
      
      // Top-right quadrant (x=1, y=1)
      expect(lonLatToTile(testRoot, 1, degToRad(0.5), degToRad(0.5))).toEqual({ x: 1, y: 1 })
    })

    it('should handle coordinates at tile boundaries correctly', () => {
      // Point exactly at the center should go to bottom-left tile
      expect(lonLatToTile(testRoot, 1, degToRad(0), degToRad(0))).toEqual({ x: 1, y: 1 })
      
      // Point at west boundary should go to left tiles
      expect(lonLatToTile(testRoot, 1, degToRad(-1), degToRad(-0.5))).toEqual({ x: 0, y: 0 })
      expect(lonLatToTile(testRoot, 1, degToRad(-1), degToRad(0.5))).toEqual({ x: 0, y: 1 })
    })
  })

  describe('level 2 (4x4 grid)', () => {
    it('should return correct tile coordinates for higher subdivision', () => {
      // Test a point in the first tile (0,0)
      expect(lonLatToTile(testRoot, 2, degToRad(-0.75), degToRad(-0.75))).toEqual({ x: 0, y: 0 })
      
      // Test a point in the last tile (3,3)
      expect(lonLatToTile(testRoot, 2, degToRad(0.75), degToRad(0.75))).toEqual({ x: 3, y: 3 })
      
      // Test center point
      expect(lonLatToTile(testRoot, 2, degToRad(0), degToRad(0))).toEqual({ x: 2, y: 2 })
    })
  })

  describe('boundary conditions', () => {
    it('should handle coordinates at exact region boundaries', () => {
      // Points at the exact boundaries of the root region
      expect(lonLatToTile(testRoot, 1, testRoot.west, testRoot.south)).toEqual({ x: 0, y: 0 })
      expect(lonLatToTile(testRoot, 1, testRoot.east, testRoot.north)).toEqual({ x: 1, y: 1 })
      
      // Points very close to but within boundaries
      const epsilon = 1e-10
      expect(lonLatToTile(testRoot, 1, testRoot.west + epsilon, testRoot.south + epsilon)).toEqual({ x: 0, y: 0 })
    })

    it('should clamp to maximum tile indices for edge coordinates', () => {
      // At level 2, max indices should be 3,3
      expect(lonLatToTile(testRoot, 2, testRoot.east, testRoot.north)).toEqual({ x: 3, y: 3 })
    })
  })

  describe('error conditions', () => {
    it('should throw RangeError for coordinates outside west boundary', () => {
      expect(() => {
        lonLatToTile(testRoot, 1, degToRad(-1.1), degToRad(0))
      }).toThrow(RangeError)
      expect(() => {
        lonLatToTile(testRoot, 1, degToRad(-1.1), degToRad(0))
      }).toThrow('Position is outside the root bounding region')
    })

    it('should throw RangeError for coordinates outside east boundary', () => {
      expect(() => {
        lonLatToTile(testRoot, 1, degToRad(1.1), degToRad(0))
      }).toThrow(RangeError)
    })

    it('should throw RangeError for coordinates outside south boundary', () => {
      expect(() => {
        lonLatToTile(testRoot, 1, degToRad(0), degToRad(-1.1))
      }).toThrow(RangeError)
    })

    it('should throw RangeError for coordinates outside north boundary', () => {
      expect(() => {
        lonLatToTile(testRoot, 1, degToRad(0), degToRad(1.1))
      }).toThrow(RangeError)
    })
  })

  describe('real-world coordinate system', () => {
    // Test with a more realistic bounding region (Switzerland area)
    const swissRegion: BoundingRegion = {
      west: degToRad(5.96),   // Western Switzerland
      south: degToRad(45.82), // Southern Switzerland  
      east: degToRad(10.49),  // Eastern Switzerland
      north: degToRad(47.81), // Northern Switzerland
      minH: 0,
      maxH: 4000
    }

    it('should handle realistic geographic coordinates', () => {
      // Test Bern coordinates (approximately 7.45°E, 46.95°N)
      const bernLon = degToRad(7.45)
      const bernLat = degToRad(46.95)
      
      const result = lonLatToTile(swissRegion, 3, bernLon, bernLat)
      
      // Verify the result is within expected bounds for level 3 (8x8 grid)
      expect(result.x).toBeGreaterThanOrEqual(0)
      expect(result.x).toBeLessThanOrEqual(7)
      expect(result.y).toBeGreaterThanOrEqual(0)
      expect(result.y).toBeLessThanOrEqual(7)
      
      // Verify it's roughly in the center of Switzerland (should be around middle tiles)
      // Bern is roughly in the center-west of Switzerland, so expect x around 2-3 and y around 4-5
      expect(result.x).toBeGreaterThanOrEqual(2)
      expect(result.x).toBeLessThanOrEqual(4)
      expect(result.y).toBeGreaterThanOrEqual(3)
      expect(result.y).toBeLessThanOrEqual(6)
    })

    it('should handle Lausanne dataset coordinates', () => {
      // Lausanne dataset bounds
      const lausanneRegion: BoundingRegion = {
        west: degToRad(6.5248166),   // Western Lausanne
        south: degToRad(46.4976347), // Southern Lausanne
        east: degToRad(6.6700634),   // Eastern Lausanne
        north: degToRad(46.6156402), // Northern Lausanne
        minH: 0,
        maxH: 1000
      }

      // Test coordinates in central Lausanne (approximately 6.63°E, 46.52°N)
      const lausanneLon = degToRad(6.63)
      const lausanneLat = degToRad(46.52)
      
      const result = lonLatToTile(lausanneRegion, 4, lausanneLon, lausanneLat)
      
      // Verify the result is within expected bounds for level 4 (16x16 grid)
      expect(result.x).toBeGreaterThanOrEqual(0)
      expect(result.x).toBeLessThanOrEqual(15)
      expect(result.y).toBeGreaterThanOrEqual(0)
      expect(result.y).toBeLessThanOrEqual(15)
      
      // For a small region like Lausanne, the coordinates should be in the eastern part
      // since 6.63 is closer to the eastern bound (6.67) than western (6.52)
      expect(result.x).toBeGreaterThan(8) // Should be in the eastern half
      expect(result.y).toBeGreaterThanOrEqual(0) // Should be in the valid range
    })

    it('should handle coordinates at Lausanne dataset boundaries', () => {
      const lausanneRegion: BoundingRegion = {
        west: degToRad(6.5248166),
        south: degToRad(46.4976347),
        east: degToRad(6.6700634),
        north: degToRad(46.6156402),
        minH: 0,
        maxH: 1000
      }

      // Test boundary coordinates
      expect(() => {
        lonLatToTile(lausanneRegion, 2, lausanneRegion.west, lausanneRegion.south)
      }).not.toThrow()

      expect(() => {
        lonLatToTile(lausanneRegion, 2, lausanneRegion.east, lausanneRegion.north)
      }).not.toThrow()

      // Test coordinates just outside the boundaries
      expect(() => {
        lonLatToTile(lausanneRegion, 2, degToRad(6.5), degToRad(46.5))
      }).toThrow(RangeError)

      expect(() => {
        lonLatToTile(lausanneRegion, 2, degToRad(6.68), degToRad(46.62))
      }).toThrow(RangeError)
    })
  })
}) 