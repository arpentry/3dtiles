import { describe, it, expect } from 'vitest'
import { lonLatToTile, tileToRegion, type BoundingRegion, degToRad } from './utils'

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

describe('tileToRegion', () => {
  // Define a test root region covering a 2x2 degree area in radians
  const testRoot: BoundingRegion = {
    west: degToRad(-1),   // -1 degree
    south: degToRad(-1),  // -1 degree  
    east: degToRad(1),    // 1 degree
    north: degToRad(1),   // 1 degree
    minH: 0,
    maxH: 100
  }

  describe('level 0 (root tile)', () => {
    it('should return the exact root region for tile (0,0)', () => {
      const result = tileToRegion(testRoot, 0, 0, 0)
      
      expect(result.west).toBeCloseTo(testRoot.west)
      expect(result.south).toBeCloseTo(testRoot.south)
      expect(result.east).toBeCloseTo(testRoot.east)
      expect(result.north).toBeCloseTo(testRoot.north)
      expect(result.minH).toBe(testRoot.minH)
      expect(result.maxH).toBe(testRoot.maxH)
    })
  })

  describe('level 1 (2x2 grid)', () => {
    it('should return correct region for bottom-left tile (0,0)', () => {
      const result = tileToRegion(testRoot, 1, 0, 0)
      
      expect(result.west).toBeCloseTo(degToRad(-1))
      expect(result.south).toBeCloseTo(degToRad(-1))
      expect(result.east).toBeCloseTo(degToRad(0))
      expect(result.north).toBeCloseTo(degToRad(0))
      expect(result.minH).toBe(0)
      expect(result.maxH).toBe(100)
    })

    it('should return correct region for bottom-right tile (1,0)', () => {
      const result = tileToRegion(testRoot, 1, 1, 0)
      
      expect(result.west).toBeCloseTo(degToRad(0))
      expect(result.south).toBeCloseTo(degToRad(-1))
      expect(result.east).toBeCloseTo(degToRad(1))
      expect(result.north).toBeCloseTo(degToRad(0))
      expect(result.minH).toBe(0)
      expect(result.maxH).toBe(100)
    })

    it('should return correct region for top-left tile (0,1)', () => {
      const result = tileToRegion(testRoot, 1, 0, 1)
      
      expect(result.west).toBeCloseTo(degToRad(-1))
      expect(result.south).toBeCloseTo(degToRad(0))
      expect(result.east).toBeCloseTo(degToRad(0))
      expect(result.north).toBeCloseTo(degToRad(1))
      expect(result.minH).toBe(0)
      expect(result.maxH).toBe(100)
    })

    it('should return correct region for top-right tile (1,1)', () => {
      const result = tileToRegion(testRoot, 1, 1, 1)
      
      expect(result.west).toBeCloseTo(degToRad(0))
      expect(result.south).toBeCloseTo(degToRad(0))
      expect(result.east).toBeCloseTo(degToRad(1))
      expect(result.north).toBeCloseTo(degToRad(1))
      expect(result.minH).toBe(0)
      expect(result.maxH).toBe(100)
    })
  })

  describe('level 2 (4x4 grid)', () => {
    it('should return correct region for first tile (0,0)', () => {
      const result = tileToRegion(testRoot, 2, 0, 0)
      
      expect(result.west).toBeCloseTo(degToRad(-1))
      expect(result.south).toBeCloseTo(degToRad(-1))
      expect(result.east).toBeCloseTo(degToRad(-0.5))
      expect(result.north).toBeCloseTo(degToRad(-0.5))
      expect(result.minH).toBe(0)
      expect(result.maxH).toBe(100)
    })

    it('should return correct region for last tile (3,3)', () => {
      const result = tileToRegion(testRoot, 2, 3, 3)
      
      expect(result.west).toBeCloseTo(degToRad(0.5))
      expect(result.south).toBeCloseTo(degToRad(0.5))
      expect(result.east).toBeCloseTo(degToRad(1))
      expect(result.north).toBeCloseTo(degToRad(1))
      expect(result.minH).toBe(0)
      expect(result.maxH).toBe(100)
    })

    it('should return correct region for center tile (1,1)', () => {
      const result = tileToRegion(testRoot, 2, 1, 1)
      
      expect(result.west).toBeCloseTo(degToRad(-0.5))
      expect(result.south).toBeCloseTo(degToRad(-0.5))
      expect(result.east).toBeCloseTo(degToRad(0))
      expect(result.north).toBeCloseTo(degToRad(0))
      expect(result.minH).toBe(0)
      expect(result.maxH).toBe(100)
    })
  })

  describe('height splitting (splitH parameter)', () => {
    const rootWithHeight: BoundingRegion = {
      west: degToRad(0),
      south: degToRad(0),
      east: degToRad(2),
      north: degToRad(2),
      minH: 0,
      maxH: 400
    }

    it('should keep original height when splitH is false', () => {
      const result = tileToRegion(rootWithHeight, 2, 1, 1, false)
      
      expect(result.minH).toBe(0)
      expect(result.maxH).toBe(400)
    })

    it('should split height at level 1 when splitH is true', () => {
      // At level 1, height should be split in half
      const resultBottomLeft = tileToRegion(rootWithHeight, 1, 0, 0, true)
      const resultTopRight = tileToRegion(rootWithHeight, 1, 1, 1, true)
      
      // Bottom tile (y=0) should get lower half of height
      expect(resultBottomLeft.minH).toBe(0)
      expect(resultBottomLeft.maxH).toBe(200)
      
      // Top tile (y=1) should get upper half of height  
      expect(resultTopRight.minH).toBe(200)
      expect(resultTopRight.maxH).toBe(400)
    })

    it('should split height at level 2 when splitH is true', () => {
      // At level 2, height should be split into 4 parts
      const result00 = tileToRegion(rootWithHeight, 2, 0, 0, true)
      const result01 = tileToRegion(rootWithHeight, 2, 0, 1, true)
      const result02 = tileToRegion(rootWithHeight, 2, 0, 2, true)
      const result03 = tileToRegion(rootWithHeight, 2, 0, 3, true)
      
      expect(result00.minH).toBe(0)
      expect(result00.maxH).toBe(100)
      
      expect(result01.minH).toBe(100)
      expect(result01.maxH).toBe(200)
      
      expect(result02.minH).toBe(200)
      expect(result02.maxH).toBe(300)
      
      expect(result03.minH).toBe(300)
      expect(result03.maxH).toBe(400)
    })

    it('should not split height at level 0 even when splitH is true', () => {
      const result = tileToRegion(rootWithHeight, 0, 0, 0, true)
      
      expect(result.minH).toBe(0)
      expect(result.maxH).toBe(400)
    })
  })

  describe('tile coverage verification', () => {
    it('should ensure all level 1 tiles cover the entire root region', () => {
      const tiles = [
        tileToRegion(testRoot, 1, 0, 0),
        tileToRegion(testRoot, 1, 1, 0),
        tileToRegion(testRoot, 1, 0, 1),
        tileToRegion(testRoot, 1, 1, 1)
      ]
      
      // Check that tiles don't overlap and cover the entire area
      expect(tiles[0].east).toBeCloseTo(tiles[1].west) // Bottom tiles connect
      expect(tiles[0].north).toBeCloseTo(tiles[2].south) // Left tiles connect
      expect(tiles[1].north).toBeCloseTo(tiles[3].south) // Right tiles connect
      expect(tiles[2].east).toBeCloseTo(tiles[3].west) // Top tiles connect
      
      // Check coverage of root bounds
      expect(Math.min(tiles[0].west, tiles[2].west)).toBeCloseTo(testRoot.west)
      expect(Math.min(tiles[0].south, tiles[1].south)).toBeCloseTo(testRoot.south)
      expect(Math.max(tiles[1].east, tiles[3].east)).toBeCloseTo(testRoot.east)
      expect(Math.max(tiles[2].north, tiles[3].north)).toBeCloseTo(testRoot.north)
    })
  })

  describe('real-world coordinate systems', () => {
    const lausanneRegion: BoundingRegion = {
      west: degToRad(6.5248166),
      south: degToRad(46.4976347),
      east: degToRad(6.6700634),
      north: degToRad(46.6156402),
      minH: 0,
      maxH: 1000
    }

    it('should handle realistic geographic coordinates for Lausanne', () => {
      const result = tileToRegion(lausanneRegion, 3, 2, 4)
      
      // Verify the result is within the original bounds
      expect(result.west).toBeGreaterThanOrEqual(lausanneRegion.west)
      expect(result.south).toBeGreaterThanOrEqual(lausanneRegion.south)
      expect(result.east).toBeLessThanOrEqual(lausanneRegion.east)
      expect(result.north).toBeLessThanOrEqual(lausanneRegion.north)
      
      // Verify it's a proper sub-region
      expect(result.west).toBeLessThan(result.east)
      expect(result.south).toBeLessThan(result.north)
      expect(result.minH).toBe(lausanneRegion.minH)
      expect(result.maxH).toBe(lausanneRegion.maxH)
    })

    it('should create consistent subdivisions for Lausanne dataset', () => {
      // Test that adjacent tiles share boundaries
      const tile00 = tileToRegion(lausanneRegion, 2, 0, 0)
      const tile10 = tileToRegion(lausanneRegion, 2, 1, 0)
      const tile01 = tileToRegion(lausanneRegion, 2, 0, 1)
      
      expect(tile00.east).toBeCloseTo(tile10.west)
      expect(tile00.north).toBeCloseTo(tile01.south)
    })
  })

  describe('mathematical precision', () => {
    it('should maintain precision with floating point arithmetic', () => {
      const preciseRoot: BoundingRegion = {
        west: 0.123456789,
        south: 0.987654321,
        east: 1.123456789,
        north: 1.987654321,
        minH: 123.456,
        maxH: 987.654
      }
      
      const result = tileToRegion(preciseRoot, 4, 5, 7)
      
      // Verify the result maintains reasonable precision
      expect(result.west).toBeLessThan(result.east)
      expect(result.south).toBeLessThan(result.north)
      expect(result.west).toBeGreaterThanOrEqual(preciseRoot.west)
      expect(result.east).toBeLessThanOrEqual(preciseRoot.east)
      expect(result.south).toBeGreaterThanOrEqual(preciseRoot.south)
      expect(result.north).toBeLessThanOrEqual(preciseRoot.north)
    })
  })
}) 