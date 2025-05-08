import { Document, NodeIO } from '@gltf-transform/core';

/**
 * Creates a cube glTF model representing a tile at the specified coordinates using gltf-transform
 * @param level The tile level
 * @param x The tile x coordinate
 * @param y The tile y coordinate
 * @param size The size of the tile in meters
 * @returns Response with the binary glTF data
 */
export async function getCube(
  level: number,
  x: number,
  y: number,
  size: number,
) {
  const document = new Document();
  const io = new NodeIO();

  const r = Math.random();
  const g = Math.random();
  const b = Math.random();

  /**
   * Material
   */
  const material = document
    .createMaterial('cubeMaterial')
    .setBaseColorFactor([r, g, b, 1.0])
    .setMetallicFactor(0.0)
    .setRoughnessFactor(0.5);

  /**
   * Buffer
   */
  const buffer = document.createBuffer('cubeBuffer');

  /**
   * Cube mesh
   */
  const halfSize = size;
  const positions = new Float32Array([
    // Face 0
    0,
    0,
    0,

    halfSize,
    0,
    0,

    halfSize,
    0,
    halfSize,

    0,
    0,
    halfSize,

    // Face 1
    0,
    0,
    0,

    0,
    0,
    halfSize,

    0,
    halfSize,
    halfSize,

    0,
    halfSize,
    0,

    // Face 2
    0,
    0,
    0,

    0,
    halfSize,
    0,

    halfSize,
    halfSize,
    0,

    halfSize,
    0,
    0,

    // Face 3
    0,
    halfSize,
    0,

    0,
    halfSize,
    halfSize,

    halfSize,
    halfSize,
    halfSize,

    halfSize,
    halfSize,
    0,

    // Face 4
    halfSize,
    halfSize,
    0,

    halfSize,
    halfSize,
    halfSize,

    halfSize,
    0,
    halfSize,

    halfSize,
    0,
    0,

    // Face 5
    0,
    halfSize,
    halfSize,

    0,
    0,
    halfSize,

    halfSize,
    0,
    halfSize,

    halfSize,
    halfSize,
    halfSize,
  ]);

  const indices = new Uint16Array([
    // Face 0
    0, 1, 2, 0, 2, 3,

    // Face 1
    4, 5, 6, 4, 6, 7,

    // Face 2
    8, 9, 10, 8, 10, 11,

    // Face 3
    12, 13, 14, 12, 14, 15,

    // Face 4
    16, 17, 18, 16, 18, 19,

    // Face 5
    20, 21, 22, 20, 22, 23,
  ]);

  /**
   * Normals (for each vertex)
   */
  const normals = new Float32Array([
    // Face 0
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,

    // Face 1
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,

    // Face 2
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,

    // Face 3
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,

    // Face 4
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,

    // Face 5
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
  ]);

  /**
   * Primitive
   */
  const primitives = document
    .createPrimitive()
    .setAttribute(
      'POSITION',
      document
        .createAccessor()
        .setArray(positions)
        .setType('VEC3')
        .setBuffer(buffer),
    )
    .setAttribute(
      'NORMAL',
      document
        .createAccessor()
        .setArray(normals)
        .setType('VEC3')
        .setBuffer(buffer),
    )
    .setIndices(
      document
        .createAccessor()
        .setArray(indices)
        .setType('SCALAR')
        .setBuffer(buffer),
    )
    .setMaterial(material);

  const mesh = document.createMesh('cubeMesh').addPrimitive(primitives);

  const node = document.createNode('cubeNode').setMesh(mesh).setMatrix([
    1,
    0,
    0,
    0, // Column 1
    0,
    0,
    1,
    0, // Column 2
    0,
    -1,
    0,
    0, // Column 3
    0,
    0,
    0,
    1, // Column 4
  ]); // This matrix rotates -90 degrees around X axis to convert Y-up to Z-up

  const scene = document.createScene('cubeScene').addChild(node);

  document.getRoot().listScenes().push(scene);

  /**
   * Convert to binary GLTF and return
   */
  return io.writeBinary(document);
}
