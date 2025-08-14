import { Bounds, Coordinate, tileToRegionSquare } from '../utils/geometry';
import { WGS84toEPSG3857 } from '../utils/projections';

export interface TileBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  westDeg: number;
  southDeg: number;
  eastDeg: number;
  northDeg: number;
}

export interface TileCoordinates {
  level: number;
  x: number;
  y: number;
}

/** 3D Tiles bounding volume using oriented bounding box */
export interface BoundingVolume {
  /** 12-element array defining center and half-axes of oriented bounding box */
  box: [
    number, number, number, // center (x, y, z)
    number, number, number, // x-axis half-extents (x, y, z)
    number, number, number, // y-axis half-extents (x, y, z) 
    number, number, number  // z-axis half-extents (x, y, z)
  ];
}

/** 3D Tiles tile content reference */
export interface TileContent {
  /** URI to the tile's content (GLB file) */
  uri: string;
}

/** 3D Tiles tile object */
export interface Tile {
  /** Bounding volume that encloses the tile */
  boundingVolume: BoundingVolume;
  /** Refinement strategy - typically 'REPLACE' for terrain */
  refine: 'REPLACE' | 'ADD';
  /** Screen-space error threshold for this tile */
  geometricError: number;
  /** Reference to tile content */
  content: TileContent;
  /** Child tiles in the quadtree */
  children: Tile[];
}

/** 3D Tiles asset metadata */
export interface TilesetAsset {
  /** 3D Tiles specification version */
  version: string;
  /** Coordinate system up-axis */
  gltfUpAxis?: 'Y' | 'Z';
}

/** Complete 3D Tiles tileset */
export interface Tileset {
  /** Asset metadata */
  asset: TilesetAsset;
  /** Root-level geometric error threshold */
  geometricError: number;
  /** Root tile of the tileset */
  root: Tile;
}

/**
 * Create a 3D Tiles tile with bounding volume and content
 */
function createTile(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  minHeight: number,
  maxHeight: number,
  centerX: number,
  centerY: number,
  geometricError: number,
  contentUri: string,
  children: Tile[] = [],
): Tile {
  // Calculate bounding box center (relative to tileset center)
  const boxCenterX = (minX + maxX) / 2 - centerX; // X = easting (centered)
  const boxCenterY = (minHeight + maxHeight) / 2; // Y = elevation
  const boxCenterZ = -((minY + maxY) / 2 - centerY); // Z = southing (centered)

  // Calculate bounding box dimensions
  const boxWidth = maxX - minX; // X extent (easting)
  const boxHeight = maxHeight - minHeight; // Y extent (elevation)
  const boxDepth = maxY - minY; // Z extent (northing)

  return {
    boundingVolume: {
      box: [
        boxCenterX,
        boxCenterY,
        boxCenterZ, // center
        boxWidth / 2,
        0,
        0, // X axis half-extents (easting)
        0,
        boxHeight / 2,
        0, // Y axis half-extents (elevation)
        0,
        0,
        boxDepth / 2, // Z axis half-extents (northing)
      ],
    },
    refine: 'REPLACE',
    geometricError,
    content: { uri: contentUri },
    children,
  };
}

/**
 * Create a 3D Tiles tile recursively with its children
 */
function createTileRecursive(
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
  maxLevel: number,
): Tile {
  // Calculate geometric error based on level
  const geometricError = level === 0 ? 5000 : Math.max(50, 2000 / Math.pow(2, level));
  const contentUri = `/tiles/${level}/${x}/${y}/tile.glb`;
  
  // Create children if we haven't reached max level
  const children: Tile[] = [];
  if (level < maxLevel) {
    const childLevel = level + 1;
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    const quads = [
      { x: x * 2, y: y * 2, minX, minY, maxX: midX, maxY: midY }, // SW
      { x: x * 2 + 1, y: y * 2, minX: midX, minY, maxX, maxY: midY }, // SE
      { x: x * 2, y: y * 2 + 1, minX, minY: midY, maxX: midX, maxY }, // NW
      { x: x * 2 + 1, y: y * 2 + 1, minX: midX, minY: midY, maxX, maxY }, // NE
    ];

    for (const q of quads) {
      const childTile = createTileRecursive(
        childLevel,
        q.x,
        q.y,
        q.minX,
        q.minY,
        q.maxX,
        q.maxY,
        minHeight,
        maxHeight,
        centerX,
        centerY,
        maxLevel,
      );
      children.push(childTile);
    }
  }

  return createTile(
    minX,
    minY,
    maxX,
    maxY,
    minHeight,
    maxHeight,
    centerX,
    centerY,
    geometricError,
    contentUri,
    children,
  );
}

/**
 * Calculate tile bounds in both geographic and Web Mercator coordinates
 */
export function calculateTileBounds(
  level: number,
  x: number,
  y: number,
  globalBounds: Bounds,
): TileBounds {
  const regionRad = tileToRegionSquare(globalBounds, level, x, y);
  const westDeg = (regionRad.west * 180) / Math.PI;
  const southDeg = (regionRad.south * 180) / Math.PI;
  const eastDeg = (regionRad.east * 180) / Math.PI;
  const northDeg = (regionRad.north * 180) / Math.PI;

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
    northDeg,
  };
}

/**
 * Create a tileset for a given bounds and center
 */
export function createTileset(
  bounds: Bounds,
  center: Coordinate,
  minHeight: number,
  maxHeight: number,
  maxLevel: number,
): Tileset {
  return {
    asset: {
      version: '1.1',
      gltfUpAxis: 'Z',
    },
    geometricError: 5000,
    root: createTileRecursive(
      0, // level
      0, // x
      0, // y
      bounds[0], // minX
      bounds[1], // minY
      bounds[2], // maxX
      bounds[3], // maxY
      minHeight,
      maxHeight,
      center[0], // centerX
      center[1], // centerY
      maxLevel,
    ),
  };
}
