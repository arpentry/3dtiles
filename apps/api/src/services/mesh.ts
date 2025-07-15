// @ts-ignore – no types
import Martini from '@mapbox/martini';
import { TileBounds } from './raster';

const ELEV_NO_DATA = -9999;

export interface TerrainMesh {
  vertices: Uint16Array;
  triangles: Uint16Array;
  terrainGrid: Float32Array;
}

export interface MeshGeometry {
  positions: number[];
  uvs: number[];
  vertexMap: Map<number, number>;
  minElevation: number;
  maxElevation: number;
}

export interface TriangleIndices {
  indices: number[];
}

/**
 * Generate terrain mesh using Martini
 */
export function generateTerrainMesh(
  elevationData: TypedArray,
  tileSize: number,
): TerrainMesh {
  const gridSize = tileSize + 1;
  const terrainGrid = new Float32Array(gridSize * gridSize);

  // Fill grid from elevation data
  for (let row = 0; row < tileSize; ++row) {
    for (let col = 0; col < tileSize; ++col) {
      const src = row * tileSize + col;
      const dst = row * gridSize + col;
      terrainGrid[dst] = Number(elevationData[src]);
    }
  }

  // Duplicate last row/col for Martini
  for (let col = 0; col < gridSize - 1; ++col) {
    terrainGrid[gridSize * (gridSize - 1) + col] =
      terrainGrid[gridSize * (gridSize - 2) + col];
  }
  for (let row = 0; row < gridSize; ++row) {
    terrainGrid[gridSize * row + gridSize - 1] =
      terrainGrid[gridSize * row + gridSize - 2];
  }

  const martini = new Martini(gridSize);
  const tile = martini.createTile(terrainGrid);
  const { vertices, triangles } = tile.getMesh(10); // Higher error threshold for simpler meshes

  return {
    vertices,
    triangles,
    terrainGrid,
  };
}

/**
 * Map grid coordinates to 3D positions with UV coordinates
 */
export function mapCoordinates(
  vertices: Uint16Array,
  terrainGrid: Float32Array,
  tileBounds: TileBounds,
  tilesetCenter: [number, number],
  tileSize: number,
): MeshGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  const vMap = new Map<number, number>();

  const tileWidth = tileBounds.maxX - tileBounds.minX;
  const tileHeight = tileBounds.maxY - tileBounds.minY;
  const gridSize = tileSize + 1;

  let next = 0;
  let minElevation = Infinity;
  let maxElevation = -Infinity;

  for (let i = 0; i < vertices.length; i += 2) {
    const gx = vertices[i]; // Grid X (0 to TILE_SIZE)
    const gy = vertices[i + 1]; // Grid Y (0 to TILE_SIZE)
    const elevation = terrainGrid[Math.floor(gy) * gridSize + Math.floor(gx)];

    if (elevation === ELEV_NO_DATA) {
      vMap.set(i / 2, -1);
      continue;
    }

    vMap.set(i / 2, next);

    // NATURAL COORDINATE MAPPING:
    // Grid coordinates → Web Mercator → Centered Three.js coordinates
    const rasterX = tileBounds.minX + (gx / tileSize) * tileWidth; // Web Mercator X (easting)
    const rasterY = tileBounds.maxY - (gy / tileSize) * tileHeight; // Web Mercator Y (northing) - Y-FLIPPED

    // Three.js coordinates (centered at origin)
    const threejsX = rasterX - tilesetCenter[0]; // X = easting (centered)
    const threejsY = elevation; // Y = elevation (up)
    const threejsZ = -(rasterY - tilesetCenter[1]); // Z = southing (centered)

    pos.push(threejsX, threejsY, threejsZ);
    uvs.push(gx / tileSize, gy / tileSize);

    minElevation = Math.min(minElevation, elevation);
    maxElevation = Math.max(maxElevation, elevation);
    ++next;
  }

  return {
    positions: pos,
    uvs,
    vertexMap: vMap,
    minElevation,
    maxElevation,
  };
}

/**
 * Build triangle indices from Martini triangles
 */
export function buildTriangleIndices(
  triangles: Uint16Array,
  vertexMap: Map<number, number>,
): TriangleIndices {
  const indices: number[] = [];

  for (let i = 0; i < triangles.length; i += 3) {
    const a = vertexMap.get(triangles[i])!;
    const b = vertexMap.get(triangles[i + 1])!;
    const c = vertexMap.get(triangles[i + 2])!;
    if (a < 0 || b < 0 || c < 0) continue;
    indices.push(a, b, c);
  }

  return { indices };
}
