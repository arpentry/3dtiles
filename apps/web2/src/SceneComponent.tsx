import { EffectComposer, ToneMapping } from '@react-three/postprocessing';
import { useFrame, useThree } from '@react-three/fiber';
import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { EnvironmentControls, TilesRenderer } from '3d-tiles-renderer';
import { Cloud, Clouds, Sky } from '@react-three/drei';
import { useControls } from 'leva';
import { DebugTilesPlugin } from '3d-tiles-renderer/plugins';
// @ts-ignore
import { TopoLinesPlugin } from './plugins/topolines/TopoLinesPlugin';

function Tiles3D({ url }: { url: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const tilesRendererRef = useRef<TilesRenderer>(null);
  const controlsRef = useRef<EnvironmentControls>(null);
  const { camera, gl, scene } = useThree();

  // 3D Tiles Settings
  const { errorTarget, maxDepth, displayActiveTiles } = useControls(
    '3D Tiles - Settings',
    {
      errorTarget: { value: 50, min: 1, max: 200, step: 1 },
      maxDepth: { value: 10, min: 1, max: 20, step: 1 },
      displayActiveTiles: true,
    }
  );

  // Debug Visualization
  const { displayBoxBounds, enableTopoLines, topoOpacity } = useControls(
    '3D Tiles - Debug',
    {
      displayBoxBounds: true,
      enableTopoLines: false,
      topoOpacity: { value: 0.5, min: 0, max: 1, step: 0.01 },
    }
  );

  // Camera Controls
  const { minDistance, cameraRadius, enableDamping } = useControls(
    '3D Tiles - Camera',
    {
      minDistance: { value: 2, min: 0.1, max: 100, step: 0.1 },
      cameraRadius: { value: 1, min: 0.1, max: 10, step: 0.1 },
      enableDamping: true,
    }
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

    const controls = new EnvironmentControls(scene, camera, gl.domElement);
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
  }, [url, camera, gl, errorTarget, maxDepth, displayActiveTiles, enableTopoLines, minDistance, cameraRadius, enableDamping]);

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

function CloudsComponent() {
  const ref = useRef<THREE.Group>(null);

  // Cloud Properties
  const { seed, segments, volume, opacity, fade, growth, speed, color } =
    useControls('Clouds - Properties', {
      seed: { value: 1, min: 1, max: 100, step: 1 },
      segments: { value: 60, min: 1, max: 80, step: 1 },
      volume: { value: 4800, min: 0, max: 10000, step: 100 },
      opacity: { value: 0.6, min: 0, max: 1, step: 0.01 },
      fade: { value: 10, min: 0, max: 400, step: 1 },
      growth: { value: 4, min: 0, max: 20, step: 1 },
      speed: { value: 0.1, min: 0, max: 1, step: 0.01 },
      color: 'white',
    });

  // Cloud Bounds
  const { x, y, z } = useControls('Clouds - Bounds', {
    x: { value: 5000, min: 0, max: 10000, step: 100 },
    y: { value: 700, min: 0, max: 10000, step: 100 },
    z: { value: 2000, min: 0, max: 10000, step: 100 },
  });

  const config = { seed, segments, volume, opacity, fade, growth, speed };

  return (
    <>
      <group ref={ref} position={[0, 5000, 0]}>
        <Clouds limit={400} range={1000}>
          <Cloud {...config} bounds={[x, y, z]} color={color} />
        </Clouds>
      </group>
    </>
  );
}

export default function SceneComponent() {
  const state = useThree();

  // @ts-ignore
  const skyRef = useRef<Sky>(null);

  // Tone Mapping Controls
  const { toneMapping, toneMappingExposure } = useControls(
    'Scene - Tone Mapping',
    {
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
      toneMappingExposure: {
        value: 0.55,
        min: 0,
        max: 1,
        step: 0.0001,
      },
    }
  );

  // Post Processing Controls
  const {
    adaptive,
    resolution,
    middleGrey,
    maxLuminance,
    averageLuminance,
    adaptationRate,
  } = useControls('Scene - Post Processing', {
    adaptive: true,
    resolution: { value: 256, options: [4, 8, 16, 64, 128, 256, 512, 1024] },
    middleGrey: { value: 0.6, min: 0, max: 1, step: 0.01 },
    maxLuminance: { value: 16, min: 0, max: 100, step: 1 },
    averageLuminance: { value: 1, min: 0, max: 100, step: 0.01 },
    adaptationRate: { value: 1, min: 0, max: 100, step: 0.01 },
  });

  // Sky & Atmosphere Controls
  const { turbidity, rayleigh, mieCoefficient, mieDirectionalG } = useControls(
    'Scene - Sky & Atmosphere',
    {
      turbidity: { value: 7.8, min: 0.0, max: 20.0, step: 0.1 },
      rayleigh: { value: 3, min: 0.0, max: 4, step: 0.001 },
      mieCoefficient: { value: 0.005, min: 0.0, max: 0.1, step: 0.001 },
      mieDirectionalG: { value: 0.5, min: 0.0, max: 1, step: 0.001 },
    }
  );

  // Sun & Lighting Controls
  const { azimuth, elevation, distance, sunIntensity, ambientIntensity } =
    useControls('Scene - Sun & Lighting', {
      azimuth: { value: -180, min: -180, max: 180, step: 0.1 },
      elevation: { value: 16, min: 0, max: 90, step: 0.1 },
      distance: { value: 800000, min: 0, max: 10000000, step: 10000 },
      sunIntensity: { value: 20, min: 0, max: 100, step: 0.1 },
      ambientIntensity: { value: 5.6, min: 0, max: 10, step: 0.01 },
    });

  // Environment Controls
  const { fogColor, fogDensity } = useControls('Scene - Environment', {
    fogColor: '#d0dadb',
    fogDensity: { value: 0.0000075, min: 0, max: 0.000025, step: 0.0000001 },
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
      <CloudsComponent />
    </>
  );
}
