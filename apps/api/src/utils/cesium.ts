import * as Cesium from "@cesium/engine";

/**
 * Generate a transform matrix from WGS84 coordinates
 * @param lonRad Longitude in radians
 * @param latRad Latitude in radians
 * @param height Height in meters
 * @param scale Scale factor
 * @returns Transform matrix
 */
export const generateTransformMatrixFromWGS84 = (
  lonRad: number,
  latRad: number,
  height: number,
  scale: number,
) => {
  const position = Cesium.Cartographic.fromRadians(lonRad, latRad, height);
  const cartesianPosition = Cesium.Cartesian3.fromRadians(
    position.longitude,
    position.latitude,
    position.height,
  );

  const headingRad = 0;
  const pitchRad = 0;
  const rollRad = 0;

  // Transform Matrix
  const transformMatrix = Cesium.Transforms.headingPitchRollToFixedFrame(
    cartesianPosition,
    new Cesium.HeadingPitchRoll(headingRad, pitchRad, rollRad),
  );

  // Scale
  const scaleMatrix = new Cesium.Matrix4();
  Cesium.Matrix4.fromScale(
    new Cesium.Cartesian3(scale, scale, scale),
    scaleMatrix,
  );
  Cesium.Matrix4.multiply(transformMatrix, scaleMatrix, transformMatrix);

  return Cesium.Matrix4.toArray(transformMatrix);
};
