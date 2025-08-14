import { EnvironmentControls, TilesRenderer } from '3d-tiles-renderer';
import { useFrame, useThree } from '@react-three/fiber';
import { useControls } from 'leva';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { DebugTilesPlugin } from '3d-tiles-renderer/plugins';

// LOD Colors for level-based visualization
const LOD_COLORS = [
  new THREE.Color(0x0000FF), // Level 0 : blue
  new THREE.Color(0xA300E2), // Level 1 : violet
  new THREE.Color(0xF60081), // Level 2 : red
  new THREE.Color(0xDDB500), // Level 3 : orange
  new THREE.Color(0xDDB500), // Level 4 : yellow
  new THREE.Color(0x00FF00), // Level 5 : green
];

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
  const { errorTarget, maxDepth, displayActiveTiles, geometricErrorMethod } = useControls(
    '3D Tiles - Settings',
    {
      errorTarget: { value: 4, min: 1, max: 20, step: 1 },
      maxDepth: { value: 10, min: 1, max: 20, step: 1 },
      displayActiveTiles: true,
      geometricErrorMethod: { value: 'resolution-based', options: ['resolution-based', 'diagonal-based', 'sse-based', 'elevation-based'] },
    },
  );

  // Debug Visualization
  const { displayBoxBounds, enableLODColoring, enableTopoLines, topoOpacity } = useControls(
    '3D Tiles - Debug',
    {
      displayBoxBounds: true,
      enableLODColoring: false,
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
    const urlWithParams = new URL(url, window.location.origin);
    urlWithParams.searchParams.set('method', geometricErrorMethod);
    const tiles = new TilesRenderer(url);

    // Create DebugTilesPlugin with LOD-based coloring
    const debugPlugin = new DebugTilesPlugin({
      displayBoxBounds: displayBoxBounds,
      colorMode: enableLODColoring ? 9 : 0, // 9 = CUSTOM_COLOR, 0 = NONE
      customColorCallback: enableLODColoring ? (tile: any, child: any) => {
        const colorIndex = tile.__depth % LOD_COLORS.length;
        child.material.color.copy(LOD_COLORS[colorIndex]);
      } : undefined,
      enabled: true,
    });

    tiles.registerPlugin(debugPlugin);

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
    geometricErrorMethod,
    displayBoxBounds,
    enableLODColoring,
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
