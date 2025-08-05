import { Sky } from '@react-three/drei';
import { useControls } from 'leva';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * Compute the sun position based on the azimuth and elevation
 * @param sunPosition - The sun position
 * @param elevation - The elevation
 * @param azimuth - The azimuth
 * @returns The sun position
 */
function computeSunPosition(
  sunPosition: THREE.Vector3,
  elevation: number,
  azimuth: number,
) {
  const phi = THREE.MathUtils.degToRad(90 - elevation);
  const theta = THREE.MathUtils.degToRad(azimuth);
  sunPosition.setFromSphericalCoords(1, phi, theta);
  return sunPosition;
}

export default function SkyComponent() {
  // @ts-ignore
  const skyRef = useRef<Sky>(null);

  // Sky & Atmosphere Controls
  const { turbidity, rayleigh, mieCoefficient, mieDirectionalG } = useControls(
    'Scene - Sky & Atmosphere',
    {
      turbidity: { value: 7.8, min: 0.0, max: 20.0, step: 0.1 },
      rayleigh: { value: 3, min: 0.0, max: 4, step: 0.001 },
      mieCoefficient: { value: 0.005, min: 0.0, max: 0.1, step: 0.001 },
      mieDirectionalG: { value: 0.5, min: 0.0, max: 1, step: 0.001 },
    },
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

  const sunPosition = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  computeSunPosition(sunPosition.current, elevation, azimuth);

  useEffect(() => {
    if (skyRef.current) {
      computeSunPosition(sunPosition.current, elevation, azimuth);
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
    </>
  );
}
