# 3D Tiles Pipeline - Coordinate System Documentation

This document provides comprehensive documentation of coordinate system transformations throughout the 3D tiles pipeline, defining clear contracts for each step and documenting the mental models needed to understand the data flow.

## Overview

The 3D tiles pipeline transforms geospatial data through a series of coordinate systems:

```
GeoTIFF Input → Raster Grid → Terrain Mesh → World Coordinates → GLB Binary
[Various CRS] → [Grid Space] → [Martini] → [Three.js] → [glTF Format]
```

## Coordinate Systems

### 1. WGS84 Geographic (EPSG:4326)
- **Units**: Decimal degrees
- **Format**: `[longitude, latitude]`
- **Usage**: Input coordinate reference, 3D Tiles bounding regions (as radians)
- **Example**: `[8.5417, 47.3769]` (Zurich center)

### 2. Web Mercator (EPSG:3857)
- **Units**: Meters
- **Format**: `[x, y]` where x=easting, y=northing
- **Usage**: Spatial bounds calculations, tile boundaries
- **Example**: `[951127.0, 6002729.0]` (Zurich center)

### 3. Grid Space
- **Units**: Pixels
- **Format**: `[col, row]` where col=0 to tileSize+1, row=0 to tileSize+1  
- **Usage**: Raster data indexing, Martini triangulation input
- **Example**: `[128, 128]` (center of 256x256 tile)

### 4. World Space
- **Units**: Meters
- **Format**: `[x, y, z]` where x=easting, y=elevation, z=northing
- **Usage**: Intermediate 3D coordinates before Three.js transformation
- **Example**: `[2485071.5, 500.0, 1089318.5]`

### 5. Three.js Coordinates
- **Units**: Meters
- **Format**: `[x, y, z]` where x=easting_offset, y=elevation, z=-northing_offset
- **Usage**: Final 3D rendering coordinates, glTF vertex positions
- **Example**: `[-14050.0, 500.0, 14050.0]` (relative to tileset center)

## Pipeline Step Coordinate Contracts

### RASTER STEP (`raster.ts`)

#### Input Coordinate System
- **GeoTIFF files**: Various projections (typically Web Mercator EPSG:3857)
- **Spatial bounds**: `[minX, minY, maxX, maxY]` in projection units (meters)
- **TileBounds interface**: Defines spatial extent of target tile

#### Output Coordinate System  
- **Grid space**: Pixel coordinates from 0 to tileSize+1
- **Elevation values**: Float32Array with elevation in meters above sea level
- **Texture values**: RGBA pixels encoded as PNG

#### Key Transformations
1. **Spatial bounds → Pixel grid coordinates**: Maps Web Mercator bounds to (tileSize+1 x tileSize+1) grid
2. **GeoTIFF pixel values → Elevation meters**: Preserves elevation data with no-data value handling
3. **GeoTIFF bands → RGBA → PNG**: Converts raster bands to texture format
4. **Bounds expansion**: Adds +1 pixel buffer for seamless tile edges

#### Function Contracts
- `readGeoTiffMetadata()`: GeoTIFF spatial metadata → Square tileset bounds + center point
- `readElevationDataFromGeoTiff()`: Spatial bounds → Grid elevation data (Float32Array)
- `readTextureDataFromGeoTiff()`: Spatial bounds → Grid texture data (PNG-encoded)

#### Mental Model
Think of the raster step as a "spatial windowing" operation that extracts a rectangular region from global GeoTIFF data and resamples it to a uniform pixel grid. The key insight is bounds expansion (+1 pixel) to ensure seamless tile edges in the final mesh.

---

### MESH STEP (`mesh.ts`)

#### Input Coordinate System
- **Grid space**: Pixel coordinates (0 to tileSize pixels)
- **Elevation grid**: Float32Array with heights in meters
- **Spatial bounds**: Web Mercator bounds [minX, minY, maxX, maxY]

#### Output Coordinate System
- **Three.js world coordinates**: `[x, y, z]` where:
  - X = easting offset from tileset center (meters)
  - Y = elevation above sea level (meters)
  - Z = -northing offset from tileset center (meters, negative for right-handed)
- **UV coordinates**: `[u, v]` normalized to 0-1 range
- **Triangle indices**: References to final vertex array positions

#### Key Transformations
1. **Grid coordinates → Martini triangulation**: Adaptive terrain simplification
2. **Grid space → Web Mercator**: Maps pixel coordinates to spatial coordinates
3. **Web Mercator → World space**: Translates to tileset-centered coordinates  
4. **World space → Three.js**: Applies Y-up, right-handed coordinate system
5. **Triangle geometry → Vertex normals**: Computes smooth lighting normals

#### Function Contracts
- `generateTerrainMesh()`: Elevation grid → Martini triangulated mesh (grid coordinates)
- `mapCoordinates()`: Grid vertices + spatial bounds → Three.js world positions + UVs
- `buildTriangleIndices()`: Martini triangles + vertex mapping → Final mesh indices
- `computeVertexNormals()`: Triangle geometry → Smooth vertex normals

#### Mental Model
Think of the mesh step as a "coordinate transformation factory" that converts 2D elevation grids into 3D triangle meshes. The pipeline: Grid → Triangulation → Spatial Mapping → 3D Coordinates. The key insight is centering coordinates at the tileset origin to avoid floating-point precision issues.

---

### GLTF STEP (`gltf.ts`)

#### Input Coordinate System
- **Three.js world coordinates**: From mesh step, already transformed
- **UV coordinates**: Normalized 0-1 texture coordinates  
- **Triangle indices**: Final vertex array references
- **Normals**: Unit vectors for lighting

#### Output Coordinate System
- **glTF/GLB binary format**: Same Three.js coordinates (NO transformation)
- **Scene graph**: Single node with mesh, no additional transforms
- **PBR material**: Configured for terrain rendering

#### Key Transformations
1. **Geometry arrays → glTF accessor buffers**: Binary encoding for efficiency
2. **PNG texture → glTF texture/material**: PBR material setup
3. **Three.js coordinates → glTF vertices**: Direct copy (no coordinate change)
4. **16-bit vs 32-bit indices**: Automatic optimization based on vertex count

#### Function Contracts
- `createGltfDocument()`: All geometry data → GLB binary (preserves Three.js coordinates)

#### Mental Model
Think of the glTF step as a "binary encoder" that packages 3D geometry into an efficient transmission format. There are NO coordinate transformations—it preserves the Three.js coordinate system from the mesh step. The focus is on binary efficiency and PBR material setup.

---

## Complete Pipeline Flow Example

Using Zurich coordinates as an example:

### 1. Input Parameters
- **Tile**: Level 1, X=0, Y=0
- **Global bounds**: `[2485071.5, 1075268.5, 2513171.5, 1103368.5]` (Web Mercator)
- **Tileset center**: `[2499121.5, 1089318.5]` (Web Mercator)

### 2. Raster Step Output
- **Grid size**: 257×257 pixels (256 + 1 for seamless edges)
- **Elevation data**: Float32Array with Swiss elevations (300-2000m)
- **Texture data**: PNG-encoded Swiss imagery

### 3. Mesh Step Output
- **Martini triangulation**: ~1000 vertices, ~2000 triangles (adaptive)
- **Three.js positions**: `[-14050.0, 432.0, 14050.0, ...]` (Zurich airport relative to center)
- **UV coordinates**: `[0.0, 0.0, 0.5, 0.5, 1.0, 1.0, ...]`

### 4. glTF Step Output
- **GLB size**: ~50KB (geometry + texture)
- **Coordinate preservation**: Same Three.js coordinates as mesh step
- **PBR material**: Terrain-optimized (non-metallic, rough surface)

## Testing and Validation

### Test Data Sources
- **Swiss reference points**: Known WGS84 ↔ Web Mercator coordinate pairs
- **Elevation test points**: Real Swiss elevations for validation
- **Grid transformation cases**: Known grid ↔ world coordinate mappings

### Validation Tolerances
- **Web Mercator**: ±0.1 meters (sub-meter precision)
- **WGS84**: ±0.000001 degrees (~10cm precision)
- **Grid pixels**: ±0.5 pixels (sub-pixel precision)
- **Elevation**: ±0.01 meters (centimeter precision)

### Critical Test Cases
1. **Coordinate round-trips**: WGS84 → Web Mercator → WGS84
2. **Spatial consistency**: Same bounds used across raster/mesh steps
3. **Elevation preservation**: Heights maintained through all transformations
4. **UV alignment**: Texture coordinates match spatial extents
5. **No-data handling**: Proper filtering of invalid geometry

## Common Pitfalls and Solutions

### 1. Y-Axis Confusion
- **Problem**: Different Y-axis directions in different systems
- **Solution**: Raster uses image coordinates (Y-down), Three.js uses Y-up
- **Key**: Y-flipping in `mapCoordinates()` function

### 2. Coordinate System Mixing
- **Problem**: Using wrong coordinate system for calculations
- **Solution**: Clear function contracts and consistent naming
- **Key**: Each step has explicit input/output coordinate documentation

### 3. Floating-Point Precision
- **Problem**: Large Web Mercator coordinates cause precision loss
- **Solution**: Center coordinates at tileset origin in mesh step
- **Key**: Relative coordinates prevent floating-point errors

### 4. Bounds Expansion
- **Problem**: Tile edge artifacts in final mesh
- **Solution**: +1 pixel expansion in raster step for seamless edges
- **Key**: Grid size = tileSize + 1, not tileSize

### 5. No-Data Handling
- **Problem**: Invalid elevation values break mesh generation
- **Solution**: Filter no-data vertices in mesh step, validate geometry
- **Key**: `vertexMap` tracks valid vs invalid vertices

## Mental Model Summary

Each pipeline step can be understood as:

1. **Raster**: "Spatial windowing" - Extract and resample spatial data to uniform grids
2. **Mesh**: "Coordinate transformation factory" - Convert 2D grids to 3D triangle meshes  
3. **glTF**: "Binary encoder" - Package 3D geometry for efficient transmission

The key insight is that coordinate transformations happen primarily in the mesh step, while raster handles spatial windowing and glTF handles binary encoding. Understanding this separation of concerns is crucial for maintaining and debugging the pipeline.

## Debugging Coordinate Issues

When debugging coordinate problems:

1. **Check input bounds**: Verify spatial extents are correct for the region
2. **Validate transformations**: Test individual coordinate pairs through each step
3. **Examine edge cases**: Test with extreme coordinates, no-data values, empty geometry
4. **Visual verification**: Render intermediate results to verify coordinate correctness
5. **Unit test coverage**: Use known coordinate pairs to validate each transformation

This documentation should be updated whenever coordinate system contracts change or new transformations are added to the pipeline.