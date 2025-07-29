import { EffectComposer, ToneMapping } from '@react-three/postprocessing';
import { useFrame, useThree } from '@react-three/fiber';
import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { TilesRenderer } from '3d-tiles-renderer';
import { Environment, OrbitControls } from '@react-three/drei';
import { useControls } from 'leva';

function Tiles3D({ url }: { url: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const tilesRendererRef = useRef<TilesRenderer>(null);
  const { camera, gl } = useThree();

  useEffect(() => {
    const tiles = new TilesRenderer(url);
    tiles.setCamera(camera);
    tiles.setResolutionFromRenderer(camera, gl);
    tiles.errorTarget = 50;
    tiles.maxDepth = 10;
    tiles.displayActiveTiles = true;
    tilesRendererRef.current = tiles;
    if (groupRef.current) {
      groupRef.current.add(tiles.group as unknown as THREE.Group);
    }
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
      tilesRendererRef.current.setCamera(camera);
      tilesRendererRef.current.setResolutionFromRenderer(camera, gl);
      tilesRendererRef.current.update();
    }
  });

  return <group ref={groupRef} />;
}

export default function SceneComponent() {
  const state = useThree();

  const {
    toneMapping,
    toneMappingExposure,
    autoRotate,
    adaptive,
    resolution,
    middleGrey,
    maxLuminance,
    averageLuminance,
    adaptationRate,
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
    autoRotate: !0,
    adaptive: !0,
    resolution: { value: 256, options: [4, 8, 16, 64, 128, 256, 512, 1024] },
    middleGrey: { value: 0.6, min: 0, max: 1, step: 0.01 },
    maxLuminance: { value: 16, min: 0, max: 100, step: 1 },
    averageLuminance: { value: 1, min: 0, max: 100, step: 0.01 },
    adaptationRate: { value: 1, min: 0, max: 100, step: 0.01 },
  });

  useEffect(() => {
    state.gl.toneMapping = toneMapping;
    state.gl.toneMappingExposure = toneMappingExposure;
  }, [toneMapping, toneMappingExposure]);

  return (
    <>
      <Environment background files="/hdri/venice_sunset_4k.hdr" />
      <OrbitControls autoRotate={autoRotate} />
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
      <mesh position={[0, 20000, 0]}>
        <sphereGeometry args={[5000, 64, 64]} />
        <meshStandardMaterial />
      </mesh>
      <Tiles3D url={`${import.meta.env.VITE_TILES_URL}/tileset.json`} />
    </>
  );
}
