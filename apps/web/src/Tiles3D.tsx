import { EnvironmentControls, TilesRenderer } from '3d-tiles-renderer';
import { useFrame, useThree } from '@react-three/fiber';
import { useControls } from 'leva';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { DebugTilesPlugin } from '3d-tiles-renderer/plugins';

// @ts-ignore
import { TopoLinesPlugin } from './plugins/topolines/TopoLinesPlugin';

/**
 * Tiles3D component
 * @param url - The url of the tileset
 * @returns The Tiles3D component
 */
export default function Tiles3D({ url }: { url: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const tilesRendererRef = useRef<TilesRenderer>(null);
  const controlsRef = useRef<EnvironmentControls>(null);
  const { camera, gl } = useThree();

  // 3D Tiles Settings
  const { errorTarget, maxDepth, displayActiveTiles } = useControls(
    '3D Tiles - Settings',
    {
      errorTarget: { value: 50, min: 1, max: 200, step: 1 },
      maxDepth: { value: 10, min: 1, max: 20, step: 1 },
      displayActiveTiles: true,
    },
  );

  // Debug Visualization
  const { displayBoxBounds, enableTopoLines, topoOpacity } = useControls(
    '3D Tiles - Debug',
    {
      displayBoxBounds: true,
      enableTopoLines: false,
      topoOpacity: { value: 0.5, min: 0, max: 1, step: 0.01 },
    },
  );

  // Camera Controls
  const { minDistance, cameraRadius, enableDamping } = useControls(
    '3D Tiles - Camera',
    {
      minDistance: { value: 2, min: 0.1, max: 100, step: 0.1 },
      cameraRadius: { value: 1, min: 0.1, max: 10, step: 0.1 },
      enableDamping: true,
    },
  );

  useEffect(() => {
    const tiles = new TilesRenderer(url);
    tiles.registerPlugin(new DebugTilesPlugin());
    if (enableTopoLines) {
      tiles.registerPlugin(new TopoLinesPlugin());
    }
    tiles.setCamera(camera);
    tiles.setResolutionFromRenderer(camera, gl);
    tiles.errorTarget = errorTarget;
    tiles.maxDepth = maxDepth;
    tiles.displayActiveTiles = displayActiveTiles;
    tilesRendererRef.current = tiles;

    if (groupRef.current) {
      groupRef.current.add(tiles.group as unknown as THREE.Group);
    }

    // Pass the tilesRenderer directly to EnvironmentControls to isolate it from other scene elements
    const controls = new EnvironmentControls(
      undefined,
      camera,
      gl.domElement,
      tiles,
    );
    controls.minDistance = minDistance;
    controls.cameraRadius = cameraRadius;
    controls.enableDamping = enableDamping;
    controlsRef.current = controls;

    return () => {
      if (groupRef.current) {
        groupRef.current.remove(tiles.group as unknown as THREE.Group);
      }
      tiles.dispose();
    };
  }, [
    url,
    camera,
    gl,
    errorTarget,
    maxDepth,
    displayActiveTiles,
    enableTopoLines,
    minDistance,
    cameraRadius,
    enableDamping,
  ]);

  // Update tilesRenderer every frame
  useFrame(() => {
    if (tilesRendererRef.current) {
      const debugTilesPlugin = tilesRendererRef.current.getPluginByName(
        'DEBUG_TILES_PLUGIN',
      ) as DebugTilesPlugin;
      debugTilesPlugin.displayBoxBounds = displayBoxBounds;

      if (enableTopoLines) {
        const topoLinesPlugin = tilesRendererRef.current.getPluginByName(
          'TOPO_LINES_PLUGIN',
        ) as TopoLinesPlugin;
        if (topoLinesPlugin) {
          topoLinesPlugin.topoOpacity = topoOpacity;
        }
      }

      tilesRendererRef.current.setCamera(camera);
      tilesRendererRef.current.setResolutionFromRenderer(camera, gl);
      tilesRendererRef.current.update();
    }
    if (controlsRef.current) {
      controlsRef.current.update();
    }
  });

  return <group ref={groupRef} />;
}
