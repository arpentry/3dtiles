import {
  readElevationDataFromGeoTiff,
  readTextureDataFromGeoTiff,
} from './raster';
import {
  generateTerrainMesh,
  mapCoordinates,
  buildTriangleIndices,
  computeVertexNormals,
} from './mesh';
import { createGltfDocument } from './gltf';
import { calculateTileBounds } from './tiles';
import { TILE_SIZE } from './constants';
import type { Bounds, Coordinate } from './geometry';
import type { TileBounds } from './tiles';

/**
 * Generate a GLB tile from elevation and texture data
 * 
 * Pure function that processes geospatial raster data through the
 * raster → mesh → gltf pipeline to generate 3D tiles content.
 * 
 * @param elevationUrl - URL to GeoTIFF elevation data
 * @param textureUrl - URL to GeoTIFF texture data  
 * @param level - Tile level in quadtree
 * @param x - Tile X coordinate
 * @param y - Tile Y coordinate
 * @param globalBounds - Global spatial bounds of the tileset
 * @param tilesetCenter - Center point of the tileset
 * @returns GLB binary data ready for 3D Tiles content
 */
export async function generateTileGlb(
  elevationUrl: string,
  textureUrl: string,
  level: number,
  x: number,
  y: number,
  globalBounds: Bounds,
  tilesetCenter: Coordinate
): Promise<Uint8Array> {
  // Calculate spatial bounds for this tile
  const tileBounds = calculateTileBounds(level, x, y, globalBounds);

  // RASTER STEP: Read elevation data and generate terrain mesh
  const { data: elevationData, bbox: elevationBbox } = 
    await readElevationDataFromGeoTiff(elevationUrl, tileBounds, TILE_SIZE);
  
  const terrainMesh = generateTerrainMesh(elevationData, TILE_SIZE);

  // MESH STEP: Transform grid coordinates to 3D world positions
  const meshGeometry = mapCoordinates(
    terrainMesh.vertices,
    terrainMesh.terrainGrid,
    elevationBbox,
    tilesetCenter,
    TILE_SIZE,
  );

  // Build triangle indices and compute vertex normals
  const triangleIndices = buildTriangleIndices(terrainMesh.triangles, meshGeometry.vertexMap);
  
  if (!triangleIndices.indices.length) {
    throw new Error('Tile contains no valid geometry');
  }

  meshGeometry.normals = computeVertexNormals(meshGeometry.positions, triangleIndices.indices);

  // RASTER STEP: Read texture data for material
  const texture = await readTextureDataFromGeoTiff(textureUrl, tileBounds, TILE_SIZE);

  // GLTF STEP: Generate GLB document
  const glbBuffer = await createGltfDocument(
    meshGeometry.positions,
    meshGeometry.uvs,
    triangleIndices.indices,
    meshGeometry.normals,
    texture,
  );

  return glbBuffer;
}