import { Cloud, Clouds } from '@react-three/drei';
import { useControls } from 'leva';
import { useRef } from 'react';
import * as THREE from 'three';

/**
 * Create clouds
 * @returns The CloudsComponent
 */
export default function CloudsComponent() {
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
