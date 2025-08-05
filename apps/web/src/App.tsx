import type { RootState } from '@react-three/fiber';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import SceneComponent from './SceneComponent';

const created = (state: RootState) => {
  state.gl.outputColorSpace = THREE.SRGBColorSpace;
};

export default function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas
        shadows
        camera={{ position: [50000, 50000, 50000], near: 1, far: 1e8 }}
        onCreated={created}
      >
        <SceneComponent />
      </Canvas>
    </div>
  );
}
