import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { RootState } from '@react-three/fiber';
import { EffectComposer, ToneMapping } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { TilesRenderer } from '3d-tiles-renderer';
import { Environment, OrbitControls } from '@react-three/drei';

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

const created = (state: RootState) => {
  state.gl.toneMapping = THREE.ACESFilmicToneMapping;
  state.gl.toneMappingExposure = 3;
  state.gl.outputColorSpace = THREE.SRGBColorSpace;
};

export default function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas
        camera={{ position: [3000, 3000, 3000], near: 1, far: 1e8 }}
        onCreated={created}
      >
        <Environment
          background
          files="/hdri/qwantani_afternoon_puresky_4k.hdr"
        />
        <color attach="background" args={['#87ceeb']} /> {/* Sky Color */}
        <OrbitControls />
        {/* <directionalLight position={[10000, 10000, 10000]} /> */}
        <ToneMapping
          blendFunction={BlendFunction.NORMAL} // blend mode
          adaptive={true} // toggle adaptive luminance map usage
          resolution={256} // texture resolution of the luminance map
          middleGrey={0.6} // middle grey factor
          maxLuminance={16.0} // maximum luminance
          averageLuminance={1.0} // average luminance
          adaptationRate={1.0} // luminance adaptation rate
        />
        <Tiles3D url="http://localhost:8787/tileset.json" />
      </Canvas>
    </div>
  );
}
