// glb-core.ts – Core GLB functions without WASM dependencies for testing
// This extracts the testable core functions from glb.ts

import { WGS84toEPSG3857, tileToRegionSquare } from './utils/utils';
import { fromUrl } from 'geotiff';
// @ts-ignore – no types
import Martini from '@mapbox/martini';
import { Document, NodeIO } from '@gltf-transform/core';

// Constants
const ELEV_NO_DATA = -9999;

// Types
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
 * Read elevation data from TIFF file
 */
export async function readElevationData(
  elevURL: string,
  tileBounds: TileBounds,
  tileSize: number
): Promise<TypedArray> {
  const tiff = await fromUrl(elevURL);
  const raster = await tiff.readRasters({
    bbox: [tileBounds.minX, tileBounds.minY, tileBounds.maxX, tileBounds.maxY],
    width: tileSize,
    height: tileSize,
    fillValue: ELEV_NO_DATA
  });
  
  if (!raster || !raster[0] || typeof raster[0] === 'number') {
    throw new Error('No elevation data available');
  }
  
  return raster[0] as TypedArray;
}

/**
 * Generate terrain mesh using Martini
 */
export function generateTerrainMesh(
  elevationData: TypedArray,
  tileSize: number
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
    terrainGrid[gridSize * (gridSize - 1) + col] = terrainGrid[gridSize * (gridSize - 2) + col];
  }
  for (let row = 0; row < gridSize; ++row) {
    terrainGrid[gridSize * row + gridSize - 1] = terrainGrid[gridSize * row + gridSize - 2];
  }

  const martini = new Martini(gridSize);
  const tile = martini.createTile(terrainGrid);
  const { vertices, triangles } = tile.getMesh(10);

  return {
    vertices,
    triangles,
    terrainGrid
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
  tileSize: number
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
    const gx = vertices[i];
    const gy = vertices[i + 1];
    const elevation = terrainGrid[Math.floor(gy) * gridSize + Math.floor(gx)];
    
    if (elevation === ELEV_NO_DATA) { 
      vMap.set(i / 2, -1); 
      continue;
    }

    vMap.set(i / 2, next);
    
    const rasterX = tileBounds.minX + (gx / tileSize) * tileWidth;
    const rasterY = tileBounds.maxY - (gy / tileSize) * tileHeight;
    
    const threejsX = rasterX - tilesetCenter[0];
    const threejsY = elevation;
    const threejsZ = rasterY - tilesetCenter[1];
    
    pos.push(threejsX, threejsY, threejsZ);
    uvs.push(gx / tileSize, 1.0 - (gy / tileSize));
    
    minElevation = Math.min(minElevation, elevation);
    maxElevation = Math.max(maxElevation, elevation);
    ++next;
  }

  return {
    positions: pos,
    uvs,
    vertexMap: vMap,
    minElevation,
    maxElevation
  };
}

/**
 * Build triangle indices from Martini triangles
 */
export function buildTriangleIndices(
  triangles: Uint16Array,
  vertexMap: Map<number, number>
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

/**
 * Build glTF document from mesh geometry (without texture support)
 */
export async function buildGltfDocumentCore(
  positions: number[],
  uvs: number[],
  indices: number[]
): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();

  const positionAccessor = doc.createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array(positions))
    .setBuffer(buffer);

  const uvAccessor = doc.createAccessor()
    .setType('VEC2')
    .setArray(new Float32Array(uvs))
    .setBuffer(buffer);

  const indexAccessor = doc.createAccessor()
    .setType('SCALAR')
    .setArray(indices.length > 65535 ? new Uint32Array(indices) : new Uint16Array(indices))
    .setBuffer(buffer);

  const material = doc.createMaterial()
    .setBaseColorFactor([0.8, 0.8, 0.8, 1])
    .setDoubleSided(true);

  const primitive = doc.createPrimitive()
    .setAttribute('POSITION', positionAccessor)
    .setAttribute('TEXCOORD_0', uvAccessor)
    .setIndices(indexAccessor)
    .setMaterial(material);

  const mesh = doc.createMesh().addPrimitive(primitive);
  const node = doc.createNode().setMesh(mesh);
  const scene = doc.getRoot().getDefaultScene() || doc.createScene();
  scene.addChild(node);

  return await new NodeIO().writeBinary(doc);
} 