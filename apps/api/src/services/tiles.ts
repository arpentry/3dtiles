import { tileToRegionSquare } from '../utils/geometry';
import { WGS84toEPSG3857 } from '../utils/projections';
import { TileBounds } from './raster';

export interface TileCoordinates {
  level: number;
  x: number;
  y: number;
}

/**
 * Calculate tile bounds in both geographic and Web Mercator coordinates
 */
export function calculateTileBounds(
  level: number, 
  x: number, 
  y: number, 
  globalBounds: [number, number, number, number]
): TileBounds {
  const regionRad = tileToRegionSquare(globalBounds, level, x, y);
  const westDeg = regionRad.west * 180 / Math.PI;
  const southDeg = regionRad.south * 180 / Math.PI;
  const eastDeg = regionRad.east * 180 / Math.PI;
  const northDeg = regionRad.north * 180 / Math.PI;

  const [minX, minY] = WGS84toEPSG3857(westDeg, southDeg);
  const [maxX, maxY] = WGS84toEPSG3857(eastDeg, northDeg);

  return {
    minX,
    minY,
    maxX,
    maxY,
    westDeg,
    southDeg,
    eastDeg,
    northDeg
  };
}

/**
 * Create tile children for 3D Tiles quadtree structure
 */
export function createTileChildren(
  level: number, 
  x: number, 
  y: number, 
  minX: number, 
  minY: number, 
  maxX: number, 
  maxY: number, 
  minHeight: number, 
  maxHeight: number, 
  centerX: number, 
  centerY: number, 
  maxLevel: number
): Array<any> {
  if (level >= maxLevel) return [];

  const children: Array<any> = [];
  const childLevel = level + 1;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  const quads = [
    { x: x * 2, y: y * 2, minX, minY, maxX: midX, maxY: midY },         // SW
    { x: x * 2 + 1, y: y * 2, minX: midX, minY, maxX, maxY: midY },     // SE
    { x: x * 2, y: y * 2 + 1, minX, minY: midY, maxX: midX, maxY },     // NW
    { x: x * 2 + 1, y: y * 2 + 1, minX: midX, minY: midY, maxX, maxY }  // NE
  ];

  for (const q of quads) {
    const geometricError = Math.max(50, 2000 / Math.pow(2, childLevel));
    
    // Natural bounding box calculation - no rotation
    const boxCenterX = ((q.minX + q.maxX) / 2) - centerX;    // X = easting (centered)
    const boxCenterY = (minHeight + maxHeight) / 2;          // Y = elevation
    const boxCenterZ = ((q.minY + q.maxY) / 2) - centerY;    // Z = northing (centered)
    
    const boxWidth = q.maxX - q.minX;     // X extent (easting)
    const boxHeight = maxHeight - minHeight;  // Y extent (elevation)
    const boxDepth = q.maxY - q.minY;     // Z extent (northing)
    
    children.push({
      boundingVolume: { 
        box: [
          boxCenterX, boxCenterY, boxCenterZ,  // center
          boxWidth/2, 0, 0,                    // X axis half-extents (easting)
          0, boxHeight/2, 0,                   // Y axis half-extents (elevation)
          0, 0, boxDepth/2                     // Z axis half-extents (northing)
        ]
      },
      refine: 'REPLACE',
      geometricError,
      content: { uri: `/tiles/${childLevel}/${q.x}/${q.y}.glb` },
      children: createTileChildren(childLevel, q.x, q.y, q.minX, q.minY, q.maxX, q.maxY, minHeight, maxHeight, centerX, centerY, maxLevel)
    });
  }

  return children;
}

/**
 * Create 3D Tiles root tile
 */
export function createRootTile(
  square: [number, number, number, number],
  center: [number, number],
  minH: number,
  maxH: number,
  maxLevel: number
) {
  // Natural root bounding box calculation
  const rootBoxCenterX = 0;                // X = easting (centered at origin)
  const rootBoxCenterY = (minH + maxH) / 2;  // Y = elevation center
  const rootBoxCenterZ = 0;                // Z = northing (centered at origin)
  
  const rootBoxWidth = square[2] - square[0];   // X extent (easting)
  const rootBoxHeight = maxH - minH;            // Y extent (elevation)
  const rootBoxDepth = square[3] - square[1];   // Z extent (northing)

  return {
    boundingVolume: { 
      box: [
        rootBoxCenterX, rootBoxCenterY, rootBoxCenterZ,  // center
        rootBoxWidth/2, 0, 0,                            // X axis half-extents (easting)
        0, rootBoxHeight/2, 0,                           // Y axis half-extents (elevation)
        0, 0, rootBoxDepth/2                             // Z axis half-extents (northing)
      ]
    },
    refine: 'REPLACE',
    geometricError: 5000,
    content: { uri: '/tiles/0/0/0.glb' },
    children: createTileChildren(0, 0, 0, square[0], square[1], square[2], square[3], minH, maxH, center[0], center[1], maxLevel)
  };
} 