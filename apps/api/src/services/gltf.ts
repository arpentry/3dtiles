import { Document, NodeIO } from '@gltf-transform/core';

/**
 * Build glTF document from mesh geometry and optional texture
 */
export async function buildGltfDocument(
  positions: number[],
  uvs: number[],
  indices: number[],
  texture?: Uint8Array,
): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();

  const positionAccessor = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array(positions))
    .setBuffer(buffer);

  const uvAccessor = doc
    .createAccessor()
    .setType('VEC2')
    .setArray(new Float32Array(uvs))
    .setBuffer(buffer);

  const indexAccessor = doc
    .createAccessor()
    .setType('SCALAR')
    .setArray(
      indices.length > 65535
        ? new Uint32Array(indices)
        : new Uint16Array(indices),
    )
    .setBuffer(buffer);

  let material = doc
    .createMaterial()
    .setBaseColorFactor([0.8, 0.8, 0.8, 1]) // Light gray for better visibility
    .setDoubleSided(false);

  if (texture) {
    const gltfTexture = doc
      .createTexture()
      .setImage(texture)
      .setMimeType('image/png');
    material = material.setBaseColorTexture(gltfTexture);
  }

  const primitive = doc
    .createPrimitive()
    .setAttribute('POSITION', positionAccessor)
    .setAttribute('TEXCOORD_0', uvAccessor)
    .setIndices(indexAccessor)
    .setMaterial(material);

  const mesh = doc.createMesh().addPrimitive(primitive);

  // NO TRANSFORMATIONS - mesh uses centered coordinates
  const node = doc.createNode().setMesh(mesh);

  const scene = doc.getRoot().getDefaultScene() || doc.createScene();
  scene.addChild(node);

  // Export as GLB
  return await new NodeIO().writeBinary(doc);
}
