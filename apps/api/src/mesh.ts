// @ts-ignore – no types
import Martini from '@mapbox/martini';
import {
  ELEVATION_NO_DATA,
  DEFAULT_MESH_ERROR,
  VERTEX_COMPONENTS_3D,
  TRIANGLE_VERTICES,
  VERTEX_COMPONENTS_2D,
} from './constants';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/** Raw terrain mesh data from Martini triangulation */
export interface TerrainMesh {
  /** Vertex coordinates in grid space */
  vertices: Uint16Array;
  /** Triangle indices referencing vertices */
  triangles: Uint16Array;
  /** Elevation grid data used for triangulation */
  terrainGrid: Float32Array;
}

/** Processed mesh geometry ready for 3D rendering */
export interface MeshGeometry {
  /** 3D vertex positions in world coordinates */
  positions: number[];
  /** UV texture coordinates for each vertex */
  uvs: number[];
  /** Mapping from Martini vertex indices to final vertex indices */
  vertexMap: Map<number, number>;
  /** Minimum elevation value in the mesh */
  minElevation: number;
  /** Maximum elevation value in the mesh */
  maxElevation: number;
  /** Per-vertex normal vectors for lighting */
  normals: number[];
}

/** Triangle indices for mesh rendering */
export interface TriangleIndices {
  /** Array of vertex indices forming triangles */
  indices: number[];
}

// ============================================================================
// PRIVATE HELPER FUNCTIONS
// ============================================================================

/**
 * Normalize a 3D vector in place
 *
 * @param normals - Float32Array containing normal vectors
 * @param startIndex - Starting index of the vector to normalize
 */
function normalizeVector(normals: Float32Array, startIndex: number): void {
  const nx = normals[startIndex];
  const ny = normals[startIndex + 1];
  const nz = normals[startIndex + 2];
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;

  normals[startIndex] = nx / len;
  normals[startIndex + 1] = ny / len;
  normals[startIndex + 2] = nz / len;
}

/**
 * Compute face normal from three triangle vertices
 *
 * @param positions - Vertex position array
 * @param ia - First vertex index (multiplied by 3)
 * @param ib - Second vertex index (multiplied by 3)
 * @param ic - Third vertex index (multiplied by 3)
 * @returns Face normal as [x, y, z]
 */
function computeFaceNormal(
  positions: number[],
  ia: number,
  ib: number,
  ic: number,
): [number, number, number] {
  // Get vertex positions
  const ax = positions[ia],
    ay = positions[ia + 1],
    az = positions[ia + 2];
  const bx = positions[ib],
    by = positions[ib + 1],
    bz = positions[ib + 2];
  const cx = positions[ic],
    cy = positions[ic + 1],
    cz = positions[ic + 2];

  // Compute face normal using cross product
  const abx = bx - ax,
    aby = by - ay,
    abz = bz - az;
  const acx = cx - ax,
    acy = cy - ay,
    acz = cz - az;

  return [
    aby * acz - abz * acy, // nx
    abz * acx - abx * acz, // ny
    abx * acy - aby * acx, // nz
  ];
}

// ============================================================================
// PUBLIC API FUNCTIONS
// ============================================================================

/**
 * Generate terrain mesh using Martini triangulation algorithm
 *
 * Creates a simplified triangular mesh from elevation data using the Martini
 * algorithm, which performs adaptive triangulation based on terrain features.
 * The output includes vertices, triangles, and the processed terrain grid.
 *
 * @param elevationData - Elevation values as a typed array
 * @param tileSize - Size of the tile in pixels (grid will be tileSize + 1)
 * @returns Raw terrain mesh data ready for coordinate mapping
 */
export function generateTerrainMesh(
  elevationData: TypedArray,
  tileSize: number,
): TerrainMesh {
  const gridSize = tileSize + 1;
  const terrainGrid = new Float32Array(gridSize * gridSize);

  // Fill grid from elevation data
  for (let row = 0; row < gridSize; ++row) {
    for (let col = 0; col < gridSize; ++col) {
      const src = row * gridSize + col;
      const dst = row * gridSize + col;
      terrainGrid[dst] = Number(elevationData[src]);
    }
  }

  const martini = new Martini(gridSize);
  const tile = martini.createTile(terrainGrid);
  const { vertices, triangles } = tile.getMesh(DEFAULT_MESH_ERROR);

  return {
    vertices,
    triangles,
    terrainGrid,
  };
}

/**
 * Compute per-vertex normals from mesh positions and triangle indices
 *
 * Calculates smooth vertex normals by accumulating face normals for each
 * vertex and then normalizing the result. This provides proper lighting
 * for the terrain mesh in 3D rendering.
 *
 * @param positions - Array of vertex positions [x, y, z, x, y, z, ...]
 * @param indices - Array of triangle indices referencing positions
 * @returns Array of normalized vertex normals [nx, ny, nz, nx, ny, nz, ...]
 */
export function computeVertexNormals(
  positions: number[],
  indices: number[],
): number[] {
  const normals = new Float32Array(positions.length);

  // Accumulate face normals for each vertex
  for (let i = 0; i < indices.length; i += TRIANGLE_VERTICES) {
    const ia = indices[i] * VERTEX_COMPONENTS_3D;
    const ib = indices[i + 1] * VERTEX_COMPONENTS_3D;
    const ic = indices[i + 2] * VERTEX_COMPONENTS_3D;

    const [nx, ny, nz] = computeFaceNormal(positions, ia, ib, ic);

    // Add face normal to each vertex normal
    normals[ia] += nx;
    normals[ia + 1] += ny;
    normals[ia + 2] += nz;
    normals[ib] += nx;
    normals[ib + 1] += ny;
    normals[ib + 2] += nz;
    normals[ic] += nx;
    normals[ic + 1] += ny;
    normals[ic + 2] += nz;
  }

  // Normalize all vertex normals
  for (let i = 0; i < normals.length; i += VERTEX_COMPONENTS_3D) {
    normalizeVector(normals, i);
  }

  return Array.from(normals);
}

/**
 * Map grid coordinates to 3D world positions with UV texture coordinates
 *
 * Transforms Martini's grid-space vertices to world coordinates suitable for
 * 3D rendering. Handles coordinate system conversion from grid space to
 * Web Mercator to Three.js coordinates, with proper centering and axis mapping.
 * Also generates UV coordinates for texture mapping.
 *
 * Why neighbor invalidation around no-data values:
 * Elevation rasters often contain no-data cells at dataset edges or voids.
 * If we only drop the exact no-data vertices, triangles adjacent to those
 * cells can create T-junctions, razor-thin slivers, or cracks along the
 * boundary. To prevent visual artifacts and unstable normals, we conservatively
 * expand the invalid region by a small Chebyshev radius around each no-data
 * vertex and mark those vertices as invalid too. These vertices are mapped to
 * -1 in `vertexMap`, and downstream triangle building skips any triangle that
 * references them. The radius is configurable so callers can tune edge cleanup
 * versus mesh coverage depending on their dataset.
 *
 * @param vertices - Martini vertex coordinates in grid space
 * @param terrainGrid - Elevation grid used for height lookup
 * @param clampedBbox - Spatial bounds of the tile [minX, minY, maxX, maxY]
 * @param tilesetCenter - Center point of the tileset [x, y]
 * @param tileSize - Size of the tile in pixels
 * @param neighborRadius - Chebyshev radius to invalidate neighbors of no-data vertices (default 2)
 * @returns Mesh geometry with positions, UVs, and elevation bounds
 */
export function mapCoordinates(
  vertices: Uint16Array,
  terrainGrid: Float32Array,
  clampedBbox: number[],
  tilesetCenter: [number, number],
  tileSize: number,
  neighborRadius: number = 2,
): MeshGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  const vMap = new Map<number, number>();

  const tileWidth = clampedBbox[2] - clampedBbox[0];
  const tileHeight = clampedBbox[3] - clampedBbox[1];
  const gridSize = tileSize + 1;

  const geometryWidth = (tileWidth * tileSize) / gridSize;
  const geometryHeight = (tileHeight * tileSize) / gridSize;

  let next = 0;
  let minElevation = Infinity;
  let maxElevation = -Infinity;

  // Build lookup from grid coord -> vertex index
  const coordKeyToVertexIndex = new Map<string, number>();
  for (let i = 0; i < vertices.length; i += VERTEX_COMPONENTS_2D) {
    const gx = vertices[i];
    const gy = vertices[i + 1];
    coordKeyToVertexIndex.set(`${gx},${gy}`, i / VERTEX_COMPONENTS_2D);
  }

  // Precompute set of invalid (no-data expanded by neighborRadius) vertex indices
  const invalidVertexIndices = new Set<number>();
  if (neighborRadius > 0) {
    for (let i = 0; i < vertices.length; i += VERTEX_COMPONENTS_2D) {
      const gx = vertices[i];
      const gy = vertices[i + 1];
      const elevation = terrainGrid[Math.floor(gy) * gridSize + Math.floor(gx)];
      if (elevation !== ELEVATION_NO_DATA) continue;

      // Mark neighbors within Chebyshev distance <= neighborRadius
      for (let dy = -neighborRadius; dy <= neighborRadius; dy++) {
        for (let dx = -neighborRadius; dx <= neighborRadius; dx++) {
          const ngx = Math.max(0, Math.min(tileSize, gx + dx));
          const ngy = Math.max(0, Math.min(tileSize, gy + dy));
          const vIdx = coordKeyToVertexIndex.get(`${ngx},${ngy}`);
          if (vIdx !== undefined) invalidVertexIndices.add(vIdx);
        }
      }
    }
  }

  for (let i = 0; i < vertices.length; i += VERTEX_COMPONENTS_2D) {
    const gx = vertices[i]; // Grid X (0 to TILE_SIZE)
    const gy = vertices[i + 1]; // Grid Y (0 to TILE_SIZE)
    const vertexIndex = i / VERTEX_COMPONENTS_2D;
    const elevation = terrainGrid[Math.floor(gy) * gridSize + Math.floor(gx)];

    if (
      elevation === ELEVATION_NO_DATA ||
      invalidVertexIndices.has(vertexIndex)
    ) {
      vMap.set(vertexIndex, -1);
      continue;
    }

    vMap.set(vertexIndex, next);

    // COORDINATE SYSTEM TRANSFORMATION:
    // Grid coordinates → Web Mercator → Centered Three.js coordinates
    const rasterX = clampedBbox[0] + (gx / tileSize) * geometryWidth; // Web Mercator X (easting)
    const rasterY = clampedBbox[3] - (gy / tileSize) * geometryHeight; // Web Mercator Y (northing) - Y-FLIPPED

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

  // Normals will be computed after indices are built
  // Return empty normals for now; caller should fill in
  return {
    positions: pos,
    uvs,
    vertexMap: vMap,
    minElevation,
    maxElevation,
    normals: [],
  };
}

/**
 * Build triangle indices from Martini triangulation output
 *
 * Converts Martini's triangle vertex references to final mesh indices,
 * filtering out triangles that reference vertices with no-data elevations.
 * The vertex map is used to translate from Martini's vertex indices to
 * the final mesh vertex indices.
 *
 * @param triangles - Triangle vertex indices from Martini
 * @param vertexMap - Mapping from Martini indices to final vertex indices
 * @returns Triangle indices ready for mesh rendering
 */
export function buildTriangleIndices(
  triangles: Uint16Array,
  vertexMap: Map<number, number>,
): TriangleIndices {
  const indices: number[] = [];

  for (let i = 0; i < triangles.length; i += TRIANGLE_VERTICES) {
    const a = vertexMap.get(triangles[i])!;
    const b = vertexMap.get(triangles[i + 1])!;
    const c = vertexMap.get(triangles[i + 2])!;

    // Skip triangles with no-data vertices (marked as -1)
    if (a < 0 || b < 0 || c < 0) continue;

    indices.push(a, b, c);
  }

  return { indices };
}
