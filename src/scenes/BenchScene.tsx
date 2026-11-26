import { OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { useEffect, useMemo, useRef } from 'react';
import type { ComponentRef } from 'react';
import * as THREE from 'three';
import { ComponentRenderer } from '../components3d/ComponentRenderer';
import { WireMesh } from '../components3d/Wire';
import { buildNets } from '../core/circuit/nets';
import { getExperiment } from '../core/experiments/registry';
import type { CameraPreset, TransformerLoadOutput } from '../core/types';
import { useSessionStore } from '../stores/sessionStore';
import { useThemeStore } from '../stores/themeStore';
import { useWiringStore } from '../stores/wiringStore';
import { THEME_TOKENS } from '../theme/tokens';

const CAMERA_PRESETS: Record<
  CameraPreset,
  { pos: [number, number, number]; target: [number, number, number] }
> = {
  overview: { pos: [0.15, 5.7, 5.2], target: [0.15, 0.25, -0.15] },
  supply: { pos: [-3.45, 2.5, 3.0], target: [-3.45, 0.35, -0.15] },
  meters: { pos: [0.95, 3.1, 3.3], target: [0.95, 0.4, -0.2] },
  transformer: { pos: [1.0, 2.6, 2.8], target: [1.0, 0.45, -0.15] },
  load: { pos: [3.65, 2.8, 3.1], target: [3.65, 0.4, -0.15] },
};

function tweenColor(
  targetColor: THREE.Color,
  hex: string,
  duration: number,
): void {
  const dest = new THREE.Color(hex);
  if (duration <= 0) {
    targetColor.copy(dest);
    return;
  }
  gsap.killTweensOf(targetColor);
  gsap.to(targetColor, {
    r: dest.r,
    g: dest.g,
    b: dest.b,
    duration,
    ease: 'power2.out',
  });
}

function CameraController() {
  const cameraPreset = useSessionStore((s) => s.cameraPreset);
  const setCameraPreset = useSessionStore((s) => s.setCameraPreset);
  const { camera } = useThree();
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (!cameraPreset) return;
    const preset = CAMERA_PRESETS[cameraPreset];
    const controls = controlsRef.current;

    if (isFirstRender.current) {
      isFirstRender.current = false;
      camera.position.set(...preset.pos);
      if (controls) {
        controls.target.set(...preset.target);
        controls.update();
      }
      return;
    }

    gsap.killTweensOf(camera.position);
    gsap.to(camera.position, {
      x: preset.pos[0],
      y: preset.pos[1],
      z: preset.pos[2],
      duration: 0.75,
      ease: 'power2.inOut',
    });

    if (controls) {
      gsap.killTweensOf(controls.target);
      gsap.to(controls.target, {
        x: preset.target[0],
        y: preset.target[1],
        z: preset.target[2],
        duration: 0.75,
        ease: 'power2.inOut',
        onUpdate: () => controls.update(),
      });
    }
  }, [cameraPreset, camera]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={1.8}
      maxDistance={15}
      maxPolarAngle={Math.PI * 0.48}
      minPolarAngle={0.15}
      onStart={() => {
        gsap.killTweensOf(camera.position);
        if (controlsRef.current) {
          gsap.killTweensOf(controlsRef.current.target);
        }
        if (useSessionStore.getState().cameraPreset !== null) {
          setCameraPreset(null);
        }
      }}
    />
  );
}

interface ThemedEnvironmentProps {
  benchTopMat: THREE.MeshStandardMaterial;
  benchEdgeMat: THREE.MeshStandardMaterial;
  benchLegMat: THREE.MeshStandardMaterial;
  floorMat: THREE.MeshStandardMaterial;
}

function ThemedEnvironment({
  benchTopMat,
  benchEdgeMat,
  benchLegMat,
  floorMat,
}: ThemedEnvironmentProps) {
  const resolved = useThemeStore((s) => s.resolved);
  const { scene } = useThree();
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const keyRef = useRef<THREE.DirectionalLight>(null);
  const fillRef = useRef<THREE.DirectionalLight>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    const tokens = THEME_TOKENS[resolved].scene;
    const duration = isFirstRender.current ? 0 : 0.3;
    isFirstRender.current = false;

    if (scene.background instanceof THREE.Color) {
      tweenColor(scene.background, tokens.background, duration);
    } else {
      scene.background = new THREE.Color(tokens.background);
    }

    if (scene.fog instanceof THREE.Fog) {
      tweenColor(scene.fog.color, tokens.fog, duration);
    }

    tweenColor(benchTopMat.color, tokens.benchTop, duration);
    tweenColor(benchEdgeMat.color, tokens.benchEdge, duration);
    tweenColor(benchLegMat.color, tokens.benchLegs, duration);
    tweenColor(floorMat.color, tokens.floor, duration);

    const animateLight = (
      light: THREE.Light | null,
      hex: string,
      intensity: number,
    ) => {
      if (!light) return;
      tweenColor(light.color, hex, duration);
      if (duration <= 0) {
        light.intensity = intensity;
      } else {
        gsap.killTweensOf(light);
        gsap.to(light, { intensity, duration, ease: 'power2.out' });
      }
    };

    animateLight(ambientRef.current, tokens.ambientColor, tokens.ambientIntensity);
    animateLight(keyRef.current, tokens.keyLightColor, tokens.keyLightIntensity);
    animateLight(fillRef.current, tokens.fillLightColor, tokens.fillLightIntensity);

    if (hemiRef.current) {
      const hemi = hemiRef.current;
      tweenColor(hemi.color, tokens.hemisphereSky, duration);
      tweenColor(hemi.groundColor, tokens.hemisphereGround, duration);
      if (duration <= 0) {
        hemi.intensity = tokens.hemisphereIntensity;
      } else {
        gsap.killTweensOf(hemi);
        gsap.to(hemi, {
          intensity: tokens.hemisphereIntensity,
          duration,
          ease: 'power2.out',
        });
      }
    }
  }, [resolved, scene, benchTopMat, benchEdgeMat, benchLegMat, floorMat]);

  const initialTokens = useMemo(
    () => THEME_TOKENS[useThemeStore.getState().resolved].scene,
    [],
  );

  return (
    <>
      <color attach="background" args={[initialTokens.background]} />
      <fog attach="fog" args={[initialTokens.fog, 18, 42]} />

      <ambientLight
        ref={ambientRef}
        color={initialTokens.ambientColor}
        intensity={initialTokens.ambientIntensity}
      />
      <hemisphereLight
        ref={hemiRef}
        color={initialTokens.hemisphereSky}
        groundColor={initialTokens.hemisphereGround}
        intensity={initialTokens.hemisphereIntensity}
      />
      <directionalLight
        ref={keyRef}
        position={[4, 8, 6]}
        color={initialTokens.keyLightColor}
        intensity={initialTokens.keyLightIntensity}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={24}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
        shadow-bias={-0.0004}
      />
      {/* Subtle rim/back light to separate dark apparatus from the benchtop */}
      <directionalLight
        ref={fillRef}
        position={[0, 4.5, -6]}
        color={initialTokens.fillLightColor}
        intensity={initialTokens.fillLightIntensity}
      />
    </>
  );
}

interface BenchSceneProps {
  labOutput?: TransformerLoadOutput;
}

export function BenchScene({ labOutput }: BenchSceneProps) {
  const experimentId = useSessionStore((s) => s.experimentId);
  const wires = useWiringStore((s) => s.wires);
  const clearSelectedTerminal = useWiringStore((s) => s.clearSelectedTerminal);

  const experiment = useMemo(() => getExperiment(experimentId), [experimentId]);
  const netGraph = useMemo(
    () => buildNets(experiment.components, wires),
    [experiment.components, wires],
  );

  const wireMeta = useMemo(() => {
    const countPerNet = new Map<number, number>();
    return wires.map((w) => {
      const netIdx = netGraph.terminalToNetIndex.get(w.a) ?? 0;
      const idxInNet = countPerNet.get(netIdx) ?? 0;
      countPerNet.set(netIdx, idxInNet + 1);
      return { wire: w, netIdx, idxInNet };
    });
  }, [wires, netGraph]);

  const benchMaterials = useMemo(() => {
    const init = THEME_TOKENS[useThemeStore.getState().resolved].scene;
    return {
      benchTopMat: new THREE.MeshStandardMaterial({
        color: init.benchTop,
        roughness: 0.78,
        metalness: 0.04,
      }),
      benchEdgeMat: new THREE.MeshStandardMaterial({
        color: init.benchEdge,
        roughness: 0.4,
        metalness: 0.6,
      }),
      benchLegMat: new THREE.MeshStandardMaterial({
        color: init.benchLegs,
        roughness: 0.6,
        metalness: 0.4,
      }),
      floorMat: new THREE.MeshStandardMaterial({
        color: init.floor,
        roughness: 0.95,
      }),
    };
  }, []);

  useEffect(() => {
    return () => {
      benchMaterials.benchTopMat.dispose();
      benchMaterials.benchEdgeMat.dispose();
      benchMaterials.benchLegMat.dispose();
      benchMaterials.floorMat.dispose();
    };
  }, [benchMaterials]);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      style={{ display: 'block', width: '100%', height: '100%' }}
      camera={{
        position: CAMERA_PRESETS.overview.pos,
        fov: 40,
        near: 0.1,
        far: 80,
      }}
      gl={{
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
      }}
      onPointerMissed={() => clearSelectedTerminal()}
      className="h-full w-full"
    >
      <ThemedEnvironment
        benchTopMat={benchMaterials.benchTopMat}
        benchEdgeMat={benchMaterials.benchEdgeMat}
        benchLegMat={benchMaterials.benchLegMat}
        floorMat={benchMaterials.floorMat}
      />

      <CameraController />

      {/* Lab benchtop */}
      <group>
        <mesh
          position={[0.15, -0.09, -0.15]}
          receiveShadow
          castShadow
          material={benchMaterials.benchTopMat}
        >
          <boxGeometry args={[11.8, 0.18, 4.3]} />
        </mesh>
        {/* Front bench edge trim */}
        <mesh
          position={[0.15, -0.09, 2.01]}
          receiveShadow
          material={benchMaterials.benchEdgeMat}
        >
          <boxGeometry args={[11.8, 0.18, 0.04]} />
        </mesh>
        {/* Bench legs */}
        {[
          [-5.4, -1.18, -1.9],
          [5.6, -1.18, -1.9],
          [-5.4, -1.18, 1.7],
          [5.6, -1.18, 1.7],
        ].map(([x, y, z], i) => (
          <mesh
            key={i}
            position={[x, y, z]}
            castShadow
            receiveShadow
            material={benchMaterials.benchLegMat}
          >
            <boxGeometry args={[0.16, 2.0, 0.16]} />
          </mesh>
        ))}
        {/* Lab room floor */}
        <mesh
          position={[0, -2.18, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
          material={benchMaterials.floorMat}
        >
          <planeGeometry args={[80, 80]} />
        </mesh>
      </group>

      {/* Apparatus + generic risers for elevated rear instruments */}
      {experiment.components.map((comp) => (
        <group key={comp.id}>
          {comp.position[1] > 0.01 && (
            <mesh
              position={[comp.position[0], comp.position[1] / 2, comp.position[2]]}
              castShadow
              receiveShadow
              material={benchMaterials.benchLegMat}
            >
              <boxGeometry args={[0.96, comp.position[1], 0.92]} />
            </mesh>
          )}
          <ComponentRenderer instance={comp} labOutput={labOutput} />
        </group>
      ))}

      {/* Student / solution wires */}
      {wireMeta.map(({ wire, netIdx, idxInNet }) => (
        <WireMesh
          key={wire.id}
          wire={wire}
          components={experiment.components}
          netIndex={netIdx}
          wireIndexInNet={idxInNet}
        />
      ))}
    </Canvas>
  );
}
