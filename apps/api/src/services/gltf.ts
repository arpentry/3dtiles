import { Document, NodeIO, TextureInfo, Accessor, Buffer, Material } from '@gltf-transform/core';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Default base color for terrain materials (white) */
const DEFAULT_BASE_COLOR: [number, number, number, number] = [1, 1, 1, 1];

/** Default roughness factor for terrain surfaces (semi-glossy) */
const DEFAULT_ROUGHNESS_FACTOR = 0.95;

/** Default metallic factor for terrain (non-metallic) */
const DEFAULT_METALLIC_FACTOR = 0.0;

/** Threshold for switching from 16-bit to 32-bit indices */
const INDEX_16BIT_LIMIT = 65535;

/** PNG MIME type for embedded textures */
const PNG_MIME_TYPE = 'image/png';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/** glTF mesh creation parameters */
export interface GltfMeshParams {
  /** 3D vertex positions [x, y, z, x, y, z, ...] */
  positions: number[];
  /** UV texture coordinates [u, v, u, v, ...] */
  uvs: number[];
  /** Triangle vertex indices */
  indices: number[];
  /** Optional vertex normals for lighting */
  normals?: number[];
  /** Optional PNG texture data */
  texture?: Uint8Array;
}

// ============================================================================
// PRIVATE HELPER FUNCTIONS
// ============================================================================

/**
 * Create vertex position accessor for glTF mesh
 * 
 * @param doc - glTF document
 * @param buffer - Buffer to store data
 * @param positions - Vertex positions array
 * @returns Position accessor
 */
function createPositionAccessor(doc: Document, buffer: Buffer, positions: number[]): Accessor {
  return doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array(positions))
    .setBuffer(buffer);
}

/**
 * Create UV texture coordinate accessor for glTF mesh
 * 
 * @param doc - glTF document
 * @param buffer - Buffer to store data
 * @param uvs - UV coordinates array
 * @returns UV accessor
 */
function createUvAccessor(doc: Document, buffer: Buffer, uvs: number[]): Accessor {
  return doc
    .createAccessor()
    .setType('VEC2')
    .setArray(new Float32Array(uvs))
    .setBuffer(buffer);
}

/**
 * Create triangle index accessor for glTF mesh
 * 
 * Automatically chooses between 16-bit and 32-bit indices based on
 * the number of indices to optimize file size and compatibility.
 * 
 * @param doc - glTF document
 * @param buffer - Buffer to store data
 * @param indices - Triangle indices array
 * @returns Index accessor
 */
function createIndexAccessor(doc: Document, buffer: Buffer, indices: number[]): Accessor {
  return doc
    .createAccessor()
    .setType('SCALAR')
    .setArray(
      indices.length > INDEX_16BIT_LIMIT
        ? new Uint32Array(indices)
        : new Uint16Array(indices),
    )
    .setBuffer(buffer);
}

/**
 * Create vertex normal accessor for glTF mesh
 * 
 * @param doc - glTF document
 * @param buffer - Buffer to store data
 * @param normals - Vertex normals array
 * @returns Normal accessor or undefined if normals are empty
 */
function createNormalAccessor(doc: Document, buffer: Buffer, normals: number[]): Accessor | undefined {
  if (!normals || normals.length === 0) {
    return undefined;
  }

  return doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array(normals))
    .setBuffer(buffer);
}

/**
 * Create PBR material optimized for terrain rendering
 * 
 * @param doc - glTF document
 * @param texture - Optional PNG texture data
 * @returns Configured PBR material
 */
function createTerrainMaterial(doc: Document, texture?: Uint8Array): Material {
  let material = doc
    .createMaterial()
    .setBaseColorFactor(DEFAULT_BASE_COLOR)
    .setRoughnessFactor(DEFAULT_ROUGHNESS_FACTOR)
    .setMetallicFactor(DEFAULT_METALLIC_FACTOR)
    .setDoubleSided(false);

  if (texture) {
    const gltfTexture = doc
      .createTexture()
      .setImage(texture)
      .setMimeType(PNG_MIME_TYPE);
    
    material = material.setBaseColorTexture(gltfTexture);
    
    // Configure texture wrapping to prevent edge artifacts
    const textureInfo = material.getBaseColorTextureInfo();
    if (textureInfo) {
      textureInfo.setWrapS(TextureInfo.WrapMode.CLAMP_TO_EDGE);
      textureInfo.setWrapT(TextureInfo.WrapMode.CLAMP_TO_EDGE);
    }
  }

  return material;
}

// ============================================================================
// PUBLIC API FUNCTIONS
// ============================================================================

/**
 * Create a complete glTF document from mesh geometry data
 * 
 * Generates a GLB (binary glTF) file containing terrain mesh data with
 * optional texture and normal information. The output is optimized for
 * 3D Tiles usage with proper PBR material configuration for terrain rendering.
 * 
 * @param positions - 3D vertex positions in world coordinates
 * @param uvs - UV texture coordinates for each vertex
 * @param indices - Triangle vertex indices
 * @param normals - Optional vertex normals for lighting
 * @param texture - Optional PNG texture data
 * @returns GLB binary data ready for 3D Tiles content
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

  // Create accessors for mesh geometry data
  const positionAccessor = createPositionAccessor(doc, buffer, positions);
  const uvAccessor = createUvAccessor(doc, buffer, uvs);
  const indexAccessor = createIndexAccessor(doc, buffer, indices);
  const normalAccessor = normals ? createNormalAccessor(doc, buffer, normals) : undefined;

  // Create terrain-optimized PBR material
  const material = createTerrainMaterial(doc, texture);

  // Build mesh primitive with all attributes
  const primitive = doc
    .createPrimitive()
    .setAttribute('POSITION', positionAccessor)
    .setAttribute('TEXCOORD_0', uvAccessor)
    .setIndices(indexAccessor)
    .setMaterial(material);

  if (normalAccessor) {
    primitive.setAttribute('NORMAL', normalAccessor);
  }

  // Create mesh and scene hierarchy
  const mesh = doc.createMesh().addPrimitive(primitive);
  const node = doc.createNode().setMesh(mesh); // No transformations - mesh uses centered coordinates
  const scene = doc.getRoot().getDefaultScene() || doc.createScene();
  scene.addChild(node);

  // Export as GLB binary format
  return await new NodeIO().writeBinary(doc);
}
