import { EffectComposer, ToneMapping } from '@react-three/postprocessing';
import { useFrame, useThree } from '@react-three/fiber';
import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { EnvironmentControls, TilesRenderer } from '3d-tiles-renderer';
import { Environment } from '@react-three/drei';
import { useControls } from 'leva';
import { DebugTilesPlugin } from '3d-tiles-renderer/plugins';
// @ts-ignore
import { TopoLinesPlugin } from './plugins/topolines/TopoLinesPlugin';

function Tiles3D({ url }: { url: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const tilesRendererRef = useRef<TilesRenderer>(null);
  const controlsRef = useRef<EnvironmentControls>(null);
  const { camera, gl, scene } = useThree();

  useEffect(() => {
    const tiles = new TilesRenderer(url);
    tiles.registerPlugin(new DebugTilesPlugin());
    // tiles.registerPlugin(new TopoLinesPlugin());
    tiles.setCamera(camera);
    tiles.setResolutionFromRenderer(camera, gl);
    tiles.errorTarget = 50;
    tiles.maxDepth = 10;
    tiles.displayActiveTiles = true;
    tilesRendererRef.current = tiles;
    if (groupRef.current) {
      groupRef.current.add(tiles.group as unknown as THREE.Group);
    }

    const controls = new EnvironmentControls(scene, camera, gl.domElement);
    controls.minDistance = 2;
    controls.cameraRadius = 1;
    controls.enableDamping = true;
    controlsRef.current = controls;

    return () => {
      if (groupRef.current) {
        groupRef.current.remove(tiles.group as unknown as THREE.Group);
      }
      tiles.dispose();
    };
  }, [url, camera, gl]);

  // Update tilesRenderer every frame
  useFrame(() => {
    if (tilesRendererRef.current) {
      const debugTilesPlugin = tilesRendererRef.current.getPluginByName(
        'DEBUG_TILES_PLUGIN',
      ) as DebugTilesPlugin;
      debugTilesPlugin.displaySphereBounds = true;

      //   const topoLinesPlugin = tilesRendererRef.current.getPluginByName(
      //     'TOPO_LINES_PLUGIN',
      //   ) as TopoLinesPlugin;
      //   topoLinesPlugin.topoOpacity = 0.5;

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

export default function SceneComponent() {
  const state = useThree();
  const sunLightRef = useRef<THREE.DirectionalLight>(null);

  const {
    toneMapping,
    toneMappingExposure,
    adaptive,
    resolution,
    middleGrey,
    maxLuminance,
    averageLuminance,
    adaptationRate,
    sunIntensity,
    fogColor,
    fogDensity,
  } = useControls({
    toneMapping: {
      value: THREE.NoToneMapping,
      options: [
        THREE.NoToneMapping,
        THREE.LinearToneMapping,
        THREE.ReinhardToneMapping,
        THREE.CineonToneMapping,
        THREE.ACESFilmicToneMapping,
        THREE.AgXToneMapping,
        THREE.NeutralToneMapping,
        THREE.CustomToneMapping,
      ],
    },
    toneMappingExposure: { value: 1, min: 0, max: 20, step: 0.1 },
    adaptive: true,
    resolution: { value: 256, options: [4, 8, 16, 64, 128, 256, 512, 1024] },
    middleGrey: { value: 0.6, min: 0, max: 1, step: 0.01 },
    maxLuminance: { value: 16, min: 0, max: 100, step: 1 },
    averageLuminance: { value: 1, min: 0, max: 100, step: 0.01 },
    adaptationRate: { value: 1, min: 0, max: 100, step: 0.01 },
    sunIntensity: { value: 8, min: 0, max: 10, step: 0.1 },
    fogColor: '#d0dadb',
    fogDensity: { value: 0.0000075, min: 0, max: 0.000025, step: 0.0000001 },
  });

  useEffect(() => {
    state.gl.toneMapping = toneMapping;
    state.gl.toneMappingExposure = toneMappingExposure;
  }, [toneMapping, toneMappingExposure]);

  useEffect(() => {
    // Set fog for the entire scene
    (state.scene as any).fog = new THREE.FogExp2(0xd0dadb, 0.0000075);
  }, [state.scene]);

  useEffect(() => {
    if (sunLightRef.current) {
      sunLightRef.current.intensity = sunIntensity;
    }
  }, [sunIntensity]);

  useEffect(() => {
    if (state.scene) {
      (state.scene as any).fog = new THREE.FogExp2(fogColor, fogDensity);
    }
  }, [fogColor, fogDensity]);

  return (
    <>
      <Environment files="/hdri/venice_sunset_4k.hdr" />
      <directionalLight ref={sunLightRef} position={[10, 10, 5]} />
      <EffectComposer>
        <ToneMapping
          adaptive={adaptive}
          resolution={resolution}
          middleGrey={middleGrey}
          maxLuminance={maxLuminance}
          averageLuminance={averageLuminance}
          adaptationRate={adaptationRate}
        />
      </EffectComposer>
      <Tiles3D url={`${import.meta.env.VITE_TILES_URL}/tileset.json`} />
    </>
  );
}
