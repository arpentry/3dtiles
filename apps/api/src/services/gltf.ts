import { Document, NodeIO, TextureInfo } from '@gltf-transform/core';

/**
 * Create a glTF document
 */
export async function createGltfDocument(
  positions: number[],
  uvs: number[],
  indices: number[],
  normals?: number[],
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

  let normalAccessor = undefined;
  if (normals && normals.length > 0) {
    normalAccessor = doc
      .createAccessor()
      .setType('VEC3')
      .setArray(new Float32Array(normals))
      .setBuffer(buffer);
  }

  // Create PBR material that responds to lighting
  let material = doc
    .createMaterial()
    .setBaseColorFactor([1, 1, 1, 1]) // White base color
    .setRoughnessFactor(0.95) // Semi-glossy surface (good for terrain)
    .setMetallicFactor(0.0) // Non-metallic (terrain is typically non-metallic)
    .setDoubleSided(false);

  if (texture) {
    const gltfTexture = doc
      .createTexture()
      .setImage(texture)
      .setMimeType('image/png');
    material = material.setBaseColorTexture(gltfTexture);
    const textureInfo = material.getBaseColorTextureInfo();
    if (textureInfo) {
      textureInfo.setWrapS(TextureInfo.WrapMode.CLAMP_TO_EDGE);
      textureInfo.setWrapT(TextureInfo.WrapMode.CLAMP_TO_EDGE);
    }
  }

  const primitive = doc
    .createPrimitive()
    .setAttribute('POSITION', positionAccessor)
    .setAttribute('TEXCOORD_0', uvAccessor)
    .setIndices(indexAccessor)
    .setMaterial(material);

  if (normalAccessor) {
    primitive.setAttribute('NORMAL', normalAccessor);
  }

  const mesh = doc.createMesh().addPrimitive(primitive);

  // NO TRANSFORMATIONS - mesh uses centered coordinates
  const node = doc.createNode().setMesh(mesh);

  const scene = doc.getRoot().getDefaultScene() || doc.createScene();
  scene.addChild(node);

  // Export as GLB
  return await new NodeIO().writeBinary(doc);
}
