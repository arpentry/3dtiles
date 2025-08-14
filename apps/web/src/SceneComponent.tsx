import {
  EffectComposer,
  ToneMapping,
  TiltShift2,
} from '@react-three/postprocessing';
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';
import { useControls } from 'leva';
import CloudsComponent from './Clouds';
import SkyComponent from './Sky';
import Tiles3D from './Tiles3D';

/**
 * SceneComponent
 * @returns scene
 */
export default function SceneComponent() {
  const state = useThree();

  // -----------------------------------------------------------------------------
  // Controls
  // -----------------------------------------------------------------------------

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
    },
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

  // Tilt Shift Controls
  const { tiltShiftEnabled, blur, taper, startX, startY, endX, endY, samples } =
    useControls('Scene - Tilt Shift', {
      tiltShiftEnabled: false,
      blur: { value: 0.5, min: 0, max: 2, step: 0.01 },
      taper: { value: 1.5, min: 0, max: 2, step: 0.01 },
      startX: { value: 0.0, min: 0, max: 1, step: 0.01 },
      startY: { value: 0.3, min: 0, max: 1, step: 0.01 },
      endX: { value: 1.0, min: 0, max: 1, step: 0.01 },
      endY: { value: 0.7, min: 0, max: 1, step: 0.01 },
      samples: { value: 5, min: 1, max: 20, step: 1 },
    });

  // Environment Controls
  const { fogColor, fogDensity } = useControls('Scene - Environment', {
    fogColor: '#d0dadb',
    fogDensity: { value: 0.0000075, min: 0, max: 0.000025, step: 0.0000001 },
  });

  // -----------------------------------------------------------------------------
  // Effects
  // -----------------------------------------------------------------------------

  useEffect(() => {
    state.scene.fog = new THREE.FogExp2(fogColor, fogDensity);
  }, [fogColor, fogDensity]);

  useEffect(() => {
    if (state.gl) {
      state.gl.toneMapping = toneMapping;
      state.gl.toneMappingExposure = toneMappingExposure;
    }
  }, [toneMapping, toneMappingExposure]);

  // -----------------------------------------------------------------------------
  // Scene
  // -----------------------------------------------------------------------------

  return (
    <>
      <SkyComponent />
      <EffectComposer>
        <ToneMapping
          adaptive={adaptive}
          resolution={resolution}
          middleGrey={middleGrey}
          maxLuminance={maxLuminance}
          averageLuminance={averageLuminance}
          adaptationRate={adaptationRate}
        />
        <TiltShift2
          blur={tiltShiftEnabled ? blur : 0}
          taper={tiltShiftEnabled ? taper : 0}
          start={[startX, startY]}
          end={[endX, endY]}
          samples={samples}
        />
      </EffectComposer>
      <Tiles3D url={`${import.meta.env.VITE_TILESET_URL}`} />

      <CloudsComponent />
    </>
  );
}
