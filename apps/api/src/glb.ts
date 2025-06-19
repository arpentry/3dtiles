import { Hono } from 'hono';
import { WGS84toEPSG3857, tileToRegionSquare, createSquareBounds } from './utils/utils';
import { GeoTIFF, GeoTIFFImage, ReadRasterResult, fromUrl } from 'geotiff';
// @ts-ignore - @mapbox/martini doesn't have TypeScript declarations
import Martini from '@mapbox/martini';
import { Document, NodeIO } from '@gltf-transform/core';

// Define environment variable types
type Bindings = {
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
  R2_ENDPOINT: string;
  R2_PUBLIC_ARPENTRY_ENDPOINT: string;
};

const glb = new Hono<{ Bindings: Bindings }>();
const tileSize = 512;

glb.get('/:z/:x/:y.glb', async (c) => {
    const { z, x } = c.req.param();
    const yWithExt = c.req.param('y.glb');
    const y = yWithExt ? yWithExt.replace('.glb', '') : '0';
    
    let elevation = 'swissalti3d/swissalti3d_web_mercator.tif';
  
    const levelNum = parseInt(z);
    const xNum = parseInt(x);
    const yNum = parseInt(y);
  
    if (isNaN(levelNum) || isNaN(xNum) || isNaN(yNum)) {
      return c.json({ error: 'Invalid tile coordinates' }, 400);
    }
  
    try {
      const url = `${c.env.R2_PUBLIC_ARPENTRY_ENDPOINT}/${elevation}`;
      const tiff: GeoTIFF = await fromUrl(url);
      const image: GeoTIFFImage = await tiff.getImage();
      const bbox = image.getBoundingBox();
      
      // Create square bounds that encompass the rectangular GeoTIFF bounds
      const squareBounds = createSquareBounds([bbox[0], bbox[1], bbox[2], bbox[3]]);
      const tileRegion = tileToRegionSquare(squareBounds, levelNum, xNum, yNum);
      
      const westDeg = tileRegion.west * (180 / Math.PI);
      const southDeg = tileRegion.south * (180 / Math.PI);
      const eastDeg = tileRegion.east * (180 / Math.PI);
      const northDeg = tileRegion.north * (180 / Math.PI);
      
      const [minX, minY] = WGS84toEPSG3857(westDeg, southDeg);
      const [maxX, maxY] = WGS84toEPSG3857(eastDeg, northDeg);
      const tileBbox = [minX, minY, maxX, maxY];
      
      const raster: ReadRasterResult = await tiff.readRasters({ 
        bbox: tileBbox,
        width: tileSize,
        height: tileSize,
        fillValue: -9999
      });
      
      // Ensure we have elevation data
      if (!raster || !raster[0] || typeof raster[0] === 'number') {
        return c.json({ error: 'No elevation data available' }, 404);
      }

      const elevationData = raster[0] as TypedArray;
      const gridSize = tileSize + 1;
      const terrain = new Float32Array(gridSize * gridSize);

      // Copy elevation data to terrain grid
      for (let y = 0; y < tileSize; y++) {
        for (let x = 0; x < tileSize; x++) {
          const sourceIndex = y * tileSize + x;
          const targetIndex = y * gridSize + x;
          const value = elevationData[sourceIndex];
          terrain[targetIndex] = typeof value === 'bigint' ? Number(value) : (value || 0);
        }
      }

      // Fill the extra row and column for Martini (grid is tileSize+1)
      for (let x = 0; x < gridSize - 1; x++) {
          terrain[gridSize * (gridSize - 1) + x] = terrain[gridSize * (gridSize - 2) + x];
      }

      for (let y = 0; y < gridSize; y++) {
          terrain[gridSize * y + gridSize - 1] = terrain[gridSize * y + gridSize - 2];
      }

      const martini = new Martini(gridSize);
      const tile = martini.createTile(terrain);
      const { triangles, vertices } = tile.getMesh(5);

      // Filter out vertices and triangles with no-data values
      const NO_DATA_VALUE = -9999;
      const validVertexMap = new Map<number, number>(); // old index -> new index
      const validVertices: number[] = [];
      const validTriangles: number[] = [];
      
      // First pass: identify valid vertices (those not containing no-data)
      let newVertexIndex = 0;
      for (let i = 0; i < vertices.length; i += 2) {
          const x = vertices[i];
          const y = vertices[i + 1];
          const terrainIndex = Math.floor(y) * gridSize + Math.floor(x);
          const elevation = terrain[terrainIndex];
          
          // Only include vertices that don't have no-data values
          if (elevation !== NO_DATA_VALUE) {
              const oldVertexIndex = i / 2;
              validVertexMap.set(oldVertexIndex, newVertexIndex);
              validVertices.push(x, y);
              newVertexIndex++;
          }
      }
      
      // Second pass: filter triangles - only include those where all vertices are valid
      for (let i = 0; i < triangles.length; i += 3) {
          const v1 = triangles[i];
          const v2 = triangles[i + 1];
          const v3 = triangles[i + 2];
          
          // Check if all three vertices are valid (not no-data)
          if (validVertexMap.has(v1) && validVertexMap.has(v2) && validVertexMap.has(v3)) {
              validTriangles.push(
                  validVertexMap.get(v1)!,
                  validVertexMap.get(v2)!,
                  validVertexMap.get(v3)!
              );
          }
      }
      
      // If no valid triangles, return empty response
      if (validTriangles.length === 0) {
          return c.json({ error: 'No valid elevation data in tile' }, 404);
      }

      const document = new Document();
      const buffer = document.createBuffer();

      // Calculate tile dimensions in world coordinates
      const tileWidth = maxX - minX;
      const tileHeight = maxY - minY;
      const scaleX = tileWidth / tileSize;
      const scaleY = tileHeight / tileSize;

      const positionArray = [];
      for (let i = 0; i < validVertices.length; i += 2) {
          const x = validVertices[i];
          const y = validVertices[i + 1];
          const terrainIndex = Math.floor(y) * gridSize + Math.floor(x);
          const z = terrain[terrainIndex];
          
          // Convert to world coordinates
          const worldX = minX + x * scaleX;
          const worldY = minY + y * scaleY;
          
          positionArray.push(worldX, z, worldY);
      }

      const positionBuffer = new Float32Array(positionArray);
      const positionAccessor = document.createAccessor()
          .setType('VEC3')
          .setArray(positionBuffer)
          .setBuffer(buffer);

      const indexBuffer = new Uint16Array(validTriangles);
      const indexAccessor = document.createAccessor()
          .setType('SCALAR')
          .setArray(indexBuffer)
          .setBuffer(buffer);

      const primitive = document.createPrimitive()
          .setAttribute('POSITION', positionAccessor)
          .setIndices(indexAccessor);

      const mesh = document.createMesh('terrainMesh')
          .addPrimitive(primitive);

      const node = document.createNode('terrain')
          .setMesh(mesh);

      const scene = document.getRoot().listScenes()[0] || document.createScene('defaultScene');
      scene.addChild(node);

      const io = new NodeIO();
      const glbBuffer = await io.writeBinary(document);

      return new Response(glbBuffer, {
        headers: {
          'Content-Type': 'model/gltf-binary'
        },
      });
    } catch (error) {
      console.error('GLB generation error:', error);
      return c.json({ error: 'Failed to generate GLB tile' }, 500);
    }
  });

export default glb;