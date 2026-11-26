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
import { useWiringStore } from '../stores/wiringStore';

const CAMERA_PRESETS: Record<
  CameraPreset,
  { pos: [number, number, number]; target: [number, number, number] }
> = {
  overview: { pos: [0.2, 4.8, 7.2], target: [0.2, 0.35, -0.1] },
  supply: { pos: [-3.35, 2.3, 3.1], target: [-3.35, 0.4, -0.35] },
  meters: { pos: [-0.8, 2.6, 3.3], target: [-0.8, 0.35, -0.15] },
  transformer: { pos: [1.0, 2.5, 3.1], target: [1.0, 0.45, -0.3] },
  load: { pos: [3.6, 2.6, 3.4], target: [3.6, 0.4, -0.1] },
};

function CameraController() {
  const cameraPreset = useSessionStore((s) => s.cameraPreset);
  const { camera } = useThree();
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
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
    />
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

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: CAMERA_PRESETS.overview.pos, fov: 42, near: 0.1, far: 60 }}
      gl={{ toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      onPointerMissed={() => clearSelectedTerminal()}
      className="h-full w-full"
    >
      <color attach="background" args={['#0f172a']} />
      <fog attach="fog" args={['#0f172a', 14, 30]} />

      <ambientLight intensity={0.55} />
      <directionalLight
        position={[4, 8, 6]}
        intensity={1.55}
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
      <directionalLight position={[-6, 4, -4]} intensity={0.45} color="#93c5fd" />

      <CameraController />

      {/* Lab benchtop */}
      <group>
        <mesh position={[0.1, -0.09, -0.05]} receiveShadow castShadow>
          <boxGeometry args={[11.4, 0.18, 3.5]} />
          <meshStandardMaterial color="#3b2f26" roughness={0.75} metalness={0.05} />
        </mesh>
        {/* Front bench edge trim */}
        <mesh position={[0.1, -0.09, 1.71]} receiveShadow>
          <boxGeometry args={[11.4, 0.18, 0.04]} />
          <meshStandardMaterial color="#64748b" roughness={0.4} metalness={0.6} />
        </mesh>
        {/* Bench legs */}
        {[
          [-5.2, -1.18, -1.5],
          [5.4, -1.18, -1.5],
          [-5.2, -1.18, 1.4],
          [5.4, -1.18, 1.4],
        ].map(([x, y, z], i) => (
          <mesh key={i} position={[x, y, z]} castShadow receiveShadow>
            <boxGeometry args={[0.16, 2.0, 0.16]} />
            <meshStandardMaterial color="#1e293b" roughness={0.6} metalness={0.4} />
          </mesh>
        ))}
        {/* Lab room floor */}
        <mesh
          position={[0, -2.18, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <planeGeometry args={[40, 40]} />
          <meshStandardMaterial color="#0b1120" roughness={0.95} />
        </mesh>
      </group>

      {/* Apparatus */}
      {experiment.components.map((comp) => (
        <ComponentRenderer
          key={comp.id}
          instance={comp}
          labOutput={labOutput}
        />
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
