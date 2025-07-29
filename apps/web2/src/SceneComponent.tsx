import { EffectComposer, ToneMapping } from '@react-three/postprocessing';
import { useFrame, useThree } from '@react-three/fiber';
import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { EnvironmentControls, TilesRenderer } from '3d-tiles-renderer';
import { Environment, Sky } from '@react-three/drei';
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
      debugTilesPlugin.displayBoxBounds = true;

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

  // @ts-ignore
  const skyRef = useRef<Sky>(null);

  const {
    toneMapping,
    adaptive,
    resolution,
    middleGrey,
    maxLuminance,
    averageLuminance,
    adaptationRate,
    sunIntensity,
    fogColor,
    fogDensity,
    turbidity,
    rayleigh,
    mieCoefficient,
    mieDirectionalG,
    azimuth,
    elevation,
    distance,
    toneMappingExposure,
    ambientIntensity,
  } = useControls({
    toneMapping: {
      value: THREE.ACESFilmicToneMapping,
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
    adaptive: true,
    resolution: { value: 256, options: [4, 8, 16, 64, 128, 256, 512, 1024] },
    middleGrey: { value: 0.6, min: 0, max: 1, step: 0.01 },
    maxLuminance: { value: 16, min: 0, max: 100, step: 1 },
    averageLuminance: { value: 1, min: 0, max: 100, step: 0.01 },
    adaptationRate: { value: 1, min: 0, max: 100, step: 0.01 },
    sunIntensity: { value: 20, min: 0, max: 100, step: 0.1 },
    fogColor: '#d0dadb',
    fogDensity: { value: 0.0000075, min: 0, max: 0.000025, step: 0.0000001 },
    turbidity: { value: 10, min: 0.0, max: 20.0, step: 0.1 },
    rayleigh: { value: 3, min: 0.0, max: 4, step: 0.001 },
    mieCoefficient: { value: 0.005, min: 0.0, max: 0.1, step: 0.001 },
    mieDirectionalG: { value: 0.7, min: 0.0, max: 1, step: 0.001 },
    azimuth: { value: -180, min: -180, max: 180, step: 0.1 },
    elevation: { value: 30, min: 0, max: 90, step: 0.1 },
    distance: { value: 3000000, min: 0, max: 10000000, step: 10000 },
    toneMappingExposure: {
      value: 0.75,
      min: 0,
      max: 1,
      step: 0.0001,
    },
    ambientIntensity: { value: 0.3, min: 0, max: 10, step: 0.01 },
  });

  useEffect(() => {
    state.gl.toneMapping = toneMapping;
    state.gl.toneMappingExposure = toneMappingExposure;
  }, [toneMapping, toneMappingExposure]);

  useEffect(() => {
    (state.scene as any).fog = new THREE.FogExp2(0xd0dadb, 0.0000075);
  }, [state.scene]);

  useEffect(() => {
    if (state.scene) {
      (state.scene as any).fog = new THREE.FogExp2(fogColor, fogDensity);
    }
  }, [fogColor, fogDensity]);

  useEffect(() => {
    if (state.gl) {
      console.log('exposure', toneMappingExposure);
      state.gl.toneMappingExposure = toneMappingExposure;
    }
  }, [toneMappingExposure]);

  // TODO : put in a function
  const phi = THREE.MathUtils.degToRad(90 - elevation);
  const theta = THREE.MathUtils.degToRad(azimuth);
  const sunPosition = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  sunPosition.current.setFromSphericalCoords(1, phi, theta);

  useEffect(() => {
    if (skyRef.current) {
      const phi = THREE.MathUtils.degToRad(90 - elevation);
      const theta = THREE.MathUtils.degToRad(azimuth);
      sunPosition.current.setFromSphericalCoords(1, phi, theta);
      skyRef.current.sunPosition = sunPosition.current;
    }
  }, [elevation, azimuth]);

  return (
    <>
      <Sky
        ref={skyRef}
        turbidity={turbidity}
        rayleigh={rayleigh}
        mieCoefficient={mieCoefficient}
        mieDirectionalG={mieDirectionalG}
        azimuth={azimuth}
        inclination={elevation}
        distance={distance}
        sunPosition={sunPosition.current.toArray()}
      />
      <ambientLight intensity={ambientIntensity} />
      <directionalLight
        color={0xfffeed}
        position={sunPosition.current.toArray()}
        intensity={sunIntensity}
      />
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
