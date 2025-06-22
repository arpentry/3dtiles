// glb.ts – v2  (2025‑06‑22)
// -----------------------------------------------------------------------------
// Fix: terrain meshes loaded but did not appear in Three‑TilesRenderer.
// Cause: geometry was authored in local ENU but *no* tile.transform was
// supplied, so every tile rendered at (0,0,0).  This rewrite
//  • generates a per‑tile `transform` matrix in **ECEF** metres
//  • removes the root‑node centre translation (now handled by the transform)
//  • keeps vertices in local East‑North‑Up metres (high precision)
//  • adds `transform` to root & every child returned by `createChildren`.
// Everything else (axis‑fix quaternion, texture, Martini grid) is unchanged.
// -----------------------------------------------------------------------------

import { Hono } from 'hono';
import { WGS84toEPSG3857, tileToRegionSquare, createSquareBounds } from './utils/utils';
import { fromUrl } from 'geotiff';
// @ts-ignore – no types
import Martini from '@mapbox/martini';
import { Document, NodeIO } from '@gltf-transform/core';
import { encode } from '@cf-wasm/png';

// -----------------------------------------------------------------------------
// Types, constants, ellipsoid helpers
// -----------------------------------------------------------------------------

type Bindings = {
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
  R2_ENDPOINT: string;
  R2_PUBLIC_ARPENTRY_ENDPOINT: string;
};

const glb = new Hono<{ Bindings: Bindings }>();

const TILE_SIZE = 512;                // raster pixels per side
const QUADTREE_MAX_LEVEL = 1;         // tiling depth (increased from 1)
const ELEV_NO_DATA = -9999;
const X_ROT_NEG_90 = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2] as [number, number, number, number];

// WGS‑84 ellipsoid constants (metres)
const A = 6378137.0;
const E2 = 6.69437999014e-3;

function geodeticToECEF(lonRad: number, latRad: number, height: number): [number, number, number] {
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const sinLon = Math.sin(lonRad);
  const cosLon = Math.cos(lonRad);
  const N = A / Math.sqrt(1 - E2 * sinLat * sinLat);
  const x = (N + height) * cosLat * cosLon;
  const y = (N + height) * cosLat * sinLon;
  const z = (N * (1 - E2) + height) * sinLat;
  return [x, y, z];
}

function enuBasis(lonRad: number, latRad: number) {
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const sinLon = Math.sin(lonRad);
  const cosLon = Math.cos(lonRad);

  // Unit vectors (ECEF) of local axes
  const east  = [-sinLon,              cosLon,             0];
  const up    = [ cosLat * cosLon,     cosLat * sinLon,    sinLat];
  const north = [ -sinLat * cosLon,    -sinLat * sinLon,   cosLat];
  return { east, north, up };
}

function makeTransform(west: number, south: number, east: number, north: number, minH: number, maxH: number) {
  const lonCenter = (west + east) / 2;
  const latCenter = (south + north) / 2;
  const hCenter   = (minH + maxH) / 2;

  const { east: e, north: n, up: u } = enuBasis(lonCenter, latCenter);
  const [cx, cy, cz] = geodeticToECEF(lonCenter, latCenter, hCenter);

  // 4×4 matrix, column‑major order (east, north, up, translation)
  return [
    e[0], n[0], u[0], 0,
    e[1], n[1], u[1], 0,
    e[2], n[2], u[2], 0,
    cx,   cy,   cz,   1
  ];
}


// -----------------------------------------------------------------------------
// Recursive quadtree builder – now injects `transform`
// -----------------------------------------------------------------------------
function createChildren(level: number, x: number, y: number,
                        west: number, south: number, east: number, north: number,
                        minHeight: number, maxHeight: number,
                        maxLevel = QUADTREE_MAX_LEVEL) {
  if (level >= maxLevel) return [];
  const children = [] as any[];
  const childLevel = level + 1;
  const midLon = (west + east) / 2;
  const midLat = (south + north) / 2;
  const quads = [
    { x: x * 2,     y: y * 2,     w: west,   s: south,  e: midLon, n: midLat }, // SW
    { x: x * 2 + 1, y: y * 2,     w: midLon, s: south,  e: east,   n: midLat }, // SE
    { x: x * 2,     y: y * 2 + 1, w: west,   s: midLat, e: midLon, n: north }, // NW
    { x: x * 2 + 1, y: y * 2 + 1, w: midLon, s: midLat, e: east,   n: north }  // NE
  ];

  for (const q of quads) {
    // Use much smaller geometric error for better LOD selection
    // The geometric error should represent the maximum error in meters when this tile is rendered
    const geometricError = Math.max(10, 100 / Math.pow(2, childLevel));
    
    children.push({
      boundingVolume: { region: [q.w, q.s, q.e, q.n, minHeight, maxHeight] },
      transform:      makeTransform(q.w, q.s, q.e, q.n, minHeight, maxHeight),
      refine:         'REPLACE',
      geometricError: geometricError,
      content:        { uri: `/tiles/${childLevel}/${q.x}/${q.y}.glb` },
      children:       createChildren(childLevel, q.x, q.y, q.w, q.s, q.e, q.n, minHeight, maxHeight, maxLevel)
    });
  }
  return children;
}

// -----------------------------------------------------------------------------
// Tileset JSON (root) – now with root.transform
// -----------------------------------------------------------------------------

glb.get('/tileset.json', async c => {
  try {
    const elevKey  = 'swissalti3d/swissalti3d_web_mercator.tif';
    const url      = `${c.env.R2_PUBLIC_ARPENTRY_ENDPOINT}/${elevKey}`;
    const tiff     = await fromUrl(url);
    const image    = await tiff.getImage();
    const bbox3857 = image.getBoundingBox();
    const square   = createSquareBounds(bbox3857 as [number, number, number, number]);

    // Convert square bounds to WGS‑84 radians
    const proj = (x: number, y: number) => [x * Math.PI / 20037508.34,
                                            Math.atan(Math.sinh(y * Math.PI / 20037508.34))];
    const [west,  south] = proj(square[0], square[1]);
    const [east,  north] = proj(square[2], square[3]);

    const minH = 0, maxH = 4500; // rough global extremes

    const root = {
      boundingVolume: { region: [west, south, east, north, minH, maxH] },
      transform:      makeTransform(west, south, east, north, minH, maxH),
      refine:         'REPLACE',
      geometricError: 100,
      content:        { uri: '/tiles/0/0/0.glb' },
      children:       createChildren(0, 0, 0, west, south, east, north, minH, maxH)
    };

    return c.json({ asset: { version: '1.1' }, geometricError: 100, root });
  } catch (err) {
    console.error('Tileset error', err);
    return c.json({ error: 'Failed to build tileset' }, 500);
  }
});

// -----------------------------------------------------------------------------
// Single‑tile endpoint – *unchanged* except: node has no centre translation
// -----------------------------------------------------------------------------

glb.get('/tiles/:level/:x/:y.glb', async c => {
  const level = Number(c.req.param('level'));
  const xIdx  = Number(c.req.param('x'));
  const yIdx  = Number((c.req.param('y.glb') ?? '0').replace(/\.glb$/, ''));
  if (Number.isNaN(level) || Number.isNaN(xIdx) || Number.isNaN(yIdx)) {
    return c.json({ error: 'Invalid tile coordinates' }, 400);
  }

  const elevKey   = 'swissalti3d/swissalti3d_web_mercator.tif';
  const texKey    = 'swissimage-dop10/swissimage_web_mercator.tif';
  const elevURL   = `${c.env.R2_PUBLIC_ARPENTRY_ENDPOINT}/${elevKey}`;
  const texURL    = `${c.env.R2_PUBLIC_ARPENTRY_ENDPOINT}/${texKey}`;

  try {
    // 1. Determine tile bounds in Web‑Mercator
    const tiff       = await fromUrl(elevURL);
    const image      = await tiff.getImage();
    const bbox3857   = createSquareBounds(image.getBoundingBox() as [number, number, number, number]);
    const regionRad  = tileToRegionSquare(bbox3857, level, xIdx, yIdx);
    const westDeg    = regionRad.west  * 180 / Math.PI;
    const southDeg   = regionRad.south * 180 / Math.PI;
    const eastDeg    = regionRad.east  * 180 / Math.PI;
    const northDeg   = regionRad.north * 180 / Math.PI;

    const [minX, minY] = WGS84toEPSG3857(westDeg,  southDeg);
    const [maxX, maxY] = WGS84toEPSG3857(eastDeg,  northDeg);
    const tileBbox     = [minX, minY, maxX, maxY] as [number, number, number, number];

    // --- Read elevation raster ------------------------------------------------
    const raster = await tiff.readRasters({
      bbox: tileBbox,
      width: TILE_SIZE,
      height: TILE_SIZE,
      fillValue: ELEV_NO_DATA
    });
    if (!raster || !raster[0] || typeof raster[0] === 'number') {
      return c.json({ error: 'No elevation data' }, 404);
    }
    const elev = raster[0] as TypedArray;

    // --- Build geometry via Martini ------------------------------------------
    const gridSize     = TILE_SIZE + 1;
    const terrainGrid  = new Float32Array(gridSize * gridSize);
    for (let y = 0; y < TILE_SIZE; ++y) {
      for (let x = 0; x < TILE_SIZE; ++x) {
        const src = y * TILE_SIZE + x;
        const dst = y * gridSize   + x;
        terrainGrid[dst] = Number(elev[src]);
      }
    }
    // duplicate last row/col
    for (let x = 0; x < gridSize - 1; ++x) terrainGrid[gridSize * (gridSize - 1) + x] = terrainGrid[gridSize * (gridSize - 2) + x];
    for (let y = 0; y < gridSize;   ++y) terrainGrid[gridSize * y + gridSize - 1]        = terrainGrid[gridSize * y + gridSize - 2];

    const martini   = new Martini(gridSize);
    const tile      = martini.createTile(terrainGrid);
    const { vertices, triangles } = tile.getMesh(5);

    // --- Convert to ENU coordinates ------------------------------------------
    const pos      : number[] = [];
    const uvs      : number[] = [];
    const indices  : number[] = [];
    const vMap     = new Map<number, number>();

    const scaleX = (maxX - minX) / TILE_SIZE;
    const scaleY = (maxY - minY) / TILE_SIZE;

    let next = 0;
    for (let i = 0; i < vertices.length; i += 2) {
      const gx = vertices[i];
      const gy = vertices[i + 1];
      const z  = terrainGrid[Math.floor(gy) * gridSize + Math.floor(gx)];
      if (z === ELEV_NO_DATA) { vMap.set(i / 2, -1); continue; }

      vMap.set(i / 2, next);
      // Use the actual tile scale - this means geometry size matches real-world tile size
      pos.push((gx * scaleX) - (maxX - minX) / 2,   // east metres centred at 0
               (gy * scaleY) - (maxY - minY) / 2,   // north metres centred at 0
               z);                                  // up metres
      uvs.push(gx / TILE_SIZE, gy / TILE_SIZE);
      ++next;
    }

    for (let i = 0; i < triangles.length; i += 3) {
      const a = vMap.get(triangles[i])!;
      const b = vMap.get(triangles[i + 1])!;
      const c = vMap.get(triangles[i + 2])!;
      if (a < 0 || b < 0 || c < 0) continue;
      indices.push(a, b, c);
    }
    if (!indices.length) return c.json({ error: 'Tile void' }, 404);

    // --- Optional texture -----------------------------------------------------
    let png: Uint8Array | undefined;
    try {
      const texTiff   = await fromUrl(texURL);
      const texRaster = await texTiff.readRasters({
        bbox: tileBbox,
        width: TILE_SIZE,
        height: TILE_SIZE,
        resampleMethod: 'bilinear'
      });
      if (Array.isArray(texRaster)) {
        const img = new Uint8Array(TILE_SIZE * TILE_SIZE * 4);
        const bands = texRaster.length;
        for (let i = 0; i < TILE_SIZE * TILE_SIZE; ++i) {
          const bi = i * 4;
          if (bands >= 3) {
            img[bi]     = Number((texRaster[0] as TypedArray)[i]);
            img[bi + 1] = Number((texRaster[1] as TypedArray)[i]);
            img[bi + 2] = Number((texRaster[2] as TypedArray)[i]);
            img[bi + 3] = 255;
          } else {
            const g = Number((texRaster[0] as TypedArray)[i]);
            img[bi] = img[bi + 1] = img[bi + 2] = g; img[bi + 3] = 255;
          }
        }
        png = encode(img, TILE_SIZE, TILE_SIZE);
      }
    } catch {}

    // --- Build glTF -----------------------------------------------------------
    const doc    = new Document();
    const buffer = doc.createBuffer();

    const posAcc = doc.createAccessor('POSITION').setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buffer);
    const uvAcc  = doc.createAccessor('TEXCOORD_0').setType('VEC2').setArray(new Float32Array(uvs)).setBuffer(buffer);
    const idxAcc = doc.createAccessor('indices')
                      .setType('SCALAR')
                      .setArray(indices.length > 65535 ? new Uint32Array(indices) : new Uint16Array(indices))
                      .setBuffer(buffer);

    let material = doc.createMaterial('mat').setBaseColorFactor([1, 1, 1, 1]).setDoubleSided(true);
    if (png) {
      const tex = doc.createTexture('albedo').setImage(png).setMimeType('image/png');
      material = material.setBaseColorTexture(tex);
    }

    const prim = doc.createPrimitive().setAttribute('POSITION', posAcc).setAttribute('TEXCOORD_0', uvAcc).setIndices(idxAcc).setMaterial(material);
    const mesh = doc.createMesh('terrain').addPrimitive(prim);
    const node = doc.createNode('root').setMesh(mesh).setRotation(X_ROT_NEG_90); // no translation now

    doc.getRoot().listScenes()[0] ?? doc.createScene();
    doc.getRoot().listScenes()[0].addChild(node);

    const glbBuffer = await new NodeIO().writeBinary(doc);
    return new Response(glbBuffer, { headers: { 'Content-Type': 'model/gltf-binary' } });
  } catch (err) {
    console.error('GLB generation error', err);
    return c.json({ error: 'Failed to build GLB' }, 500);
  }
});

export default glb;
