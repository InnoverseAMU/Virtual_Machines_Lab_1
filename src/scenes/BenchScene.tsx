import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { useEffect, useMemo, useRef } from 'react';
import type { ComponentRef } from 'react';
import * as THREE from 'three';
import { ComponentRenderer } from '../components3d/ComponentRenderer';
import { WireMesh } from '../components3d/Wire';
import { computeWireCurrentFlows } from '../core/circuit/flow';
import { COMPONENT_FOOTPRINTS } from '../core/circuit/layout';
import { buildNets, collectInternalLinks } from '../core/circuit/nets';
import {
  getStage,
  getStageCameraPresets,
  getStageComponents,
} from '../core/circuit/stages';
import { getExperiment, netlistToWirePairs } from '../core/experiments/registry';
import type {
  BaseConnectionState,
  CameraPresetDef,
  ComponentType,
  PhysicsSolveOutput,
  Wire,
} from '../core/types';
import { useControlsStore } from '../stores/controlsStore';
import { useSessionStore } from '../stores/sessionStore';
import { useThemeStore } from '../stores/themeStore';
import { useWiringStore } from '../stores/wiringStore';
import { THEME_TOKENS } from '../theme/tokens';

function FocusHighlight({
  position,
  type,
  color,
}: {
  position: [number, number, number];
  type: ComponentType;
  color: string;
}) {
  const [w, h, d] = COMPONENT_FOOTPRINTS[type];
  const matRef = useRef<THREE.LineBasicMaterial>(null);
  const ringRef = useRef<THREE.MeshBasicMaterial>(null);

  const edgesGeom = useMemo(() => {
    const box = new THREE.BoxGeometry(w, h, d);
    const edges = new THREE.EdgesGeometry(box);
    box.dispose();
    return edges;
  }, [w, h, d]);

  useEffect(() => {
    return () => {
      edgesGeom.dispose();
    };
  }, [edgesGeom]);

  useFrame(({ clock }) => {
    const pulse = 0.65 + 0.35 * Math.sin(clock.getElapsedTime() * 4.2);
    if (matRef.current) matRef.current.opacity = pulse;
    if (ringRef.current) ringRef.current.opacity = 0.22 + 0.14 * pulse;
  });

  return (
    <group position={position}>
      <lineSegments position={[0, h / 2, 0]} geometry={edgesGeom}>
        <lineBasicMaterial
          ref={matRef}
          color={color}
          transparent
          opacity={0.9}
        />
      </lineSegments>
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w + 0.14, d + 0.14]} />
        <meshBasicMaterial
          ref={ringRef}
          color={color}
          transparent
          opacity={0.28}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

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

function getResponsivePreset(
  presets: CameraPresetDef[],
  presetKey: string,
  viewportWidth: number,
): { pos: [number, number, number]; target: [number, number, number] } {
  const base =
    presets.find((p) => p.id === presetKey) ??
    presets[0] ?? {
      id: 'overview',
      label: 'Overview',
      pos: [0.25, 9.2, 8.4],
      target: [0.25, -1.15, 0.05],
    };
  if (viewportWidth >= 640) return base;

  const mult =
    presetKey === 'overview'
      ? 2.4
      : presetKey === 'meters' || presetKey === 'load'
        ? 2.15
        : 1.7;
  const dx = base.pos[0] - base.target[0];
  const dy = base.pos[1] - base.target[1];
  const dz = base.pos[2] - base.target[2];
  return {
    pos: [
      base.target[0] + dx * mult,
      base.target[1] + dy * mult,
      base.target[2] + dz * mult,
    ],
    target: [base.target[0], base.target[1] - 0.45, base.target[2]],
  };
}

function CameraController({ presets }: { presets: CameraPresetDef[] }) {
  const cameraPreset = useSessionStore((s) => s.cameraPreset);
  const setCameraPreset = useSessionStore((s) => s.setCameraPreset);
  const isDraggingControl = useControlsStore((s) => s.isDraggingControl);
  const { camera, size } = useThree();
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (!cameraPreset) return;
    const preset = getResponsivePreset(presets, cameraPreset, size.width);
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
  }, [cameraPreset, presets, camera, size.width]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enabled={!isDraggingControl}
      enableDamping
      dampingFactor={0.08}
      minDistance={1.8}
      maxDistance={18}
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
  labOutput?: PhysicsSolveOutput;
  connectionState?: BaseConnectionState;
  focusIds?: string[];
  controlsLocked?: boolean;
}

export function BenchScene({
  labOutput,
  connectionState,
  focusIds = [],
  controlsLocked = false,
}: BenchSceneProps) {
  const experimentId = useSessionStore((s) => s.experimentId);
  const currentStageIndex = useSessionStore((s) => s.currentStageIndex);
  const mode = useSessionStore((s) => s.mode);
  const showingSolution = useSessionStore((s) => s.showingSolution);
  const highlightedNetIndex = useSessionStore((s) => s.highlightedNetIndex);
  const clearHighlightedNet = useSessionStore((s) => s.clearHighlightedNet);
  const resolvedTheme = useThemeStore((s) => s.resolved);
  const wires = useWiringStore((s) => s.wires);
  const clearSelectedTerminal = useWiringStore((s) => s.clearSelectedTerminal);
  const controlValues = useControlsStore((s) => s.values);

  const experiment = useMemo(() => getExperiment(experimentId), [experimentId]);
  const stage = useMemo(
    () => getStage(experiment, currentStageIndex),
    [experiment, currentStageIndex],
  );
  const stageComponents = useMemo(
    () => getStageComponents(experiment, stage),
    [experiment, stage],
  );
  const cameraPresets = useMemo(
    () => getStageCameraPresets(stage),
    [stage],
  );

  const highlightedNetTerminals = useMemo(() => {
    if (mode !== 'observe' || highlightedNetIndex === null) return null;
    const net = stage.acceptedNetlists[0]?.[highlightedNetIndex];
    return net ? new Set(net) : null;
  }, [mode, highlightedNetIndex, stage]);

  const netGraph = useMemo(
    () => buildNets(stageComponents, wires, controlValues),
    [stageComponents, wires, controlValues],
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

  const wireFlows = useMemo(
    () =>
      computeWireCurrentFlows(
        stageComponents,
        wires,
        controlValues,
        labOutput,
        connectionState,
      ),
    [stageComponents, wires, controlValues, labOutput, connectionState],
  );

  const ghostWireMeta = useMemo(() => {
    if (!showingSolution) return [];
    const pairs = netlistToWirePairs(
      stage.acceptedNetlists[0],
      collectInternalLinks(stageComponents, controlValues),
    );
    const ghostWires: Wire[] = pairs.map(([a, b], idx) => ({
      id: `ghost_${idx}_${a}_${b}`,
      a,
      b,
    }));
    const ghostGraph = buildNets(stageComponents, ghostWires, controlValues);
    const countPerNet = new Map<number, number>();
    return ghostWires.map((w) => {
      const netIdx = ghostGraph.terminalToNetIndex.get(w.a) ?? 0;
      const idxInNet = countPerNet.get(netIdx) ?? 0;
      countPerNet.set(netIdx, idxInNet + 1);
      return { wire: w, netIdx, idxInNet };
    });
  }, [showingSolution, stage, stageComponents, controlValues]);

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

  const focusColor = resolvedTheme === 'dark' ? '#38bdf8' : '#0284c7';
  const overviewPose = cameraPresets[0]?.pos ?? [0.25, 9.2, 8.4];

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      style={{ display: 'block', width: '100%', height: '100%' }}
      camera={{
        position: overviewPose,
        fov: 40,
        near: 0.1,
        far: 80,
      }}
      gl={{
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
      }}
      onPointerMissed={() => {
        clearSelectedTerminal();
        clearHighlightedNet();
      }}
      className="h-full w-full"
    >
      <ThemedEnvironment
        benchTopMat={benchMaterials.benchTopMat}
        benchEdgeMat={benchMaterials.benchEdgeMat}
        benchLegMat={benchMaterials.benchLegMat}
        floorMat={benchMaterials.floorMat}
      />

      <CameraController presets={cameraPresets} />

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
        <mesh
          position={[0.15, -0.09, 2.01]}
          receiveShadow
          material={benchMaterials.benchEdgeMat}
        >
          <boxGeometry args={[11.8, 0.18, 0.04]} />
        </mesh>
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
        <mesh
          position={[0, -2.18, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
          material={benchMaterials.floorMat}
        >
          <planeGeometry args={[80, 80]} />
        </mesh>
      </group>

      {/* Stage apparatus + risers + Learn mode focus highlights */}
      {stageComponents.map((comp) => (
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
          <ComponentRenderer
            instance={comp}
            controlsDef={stage.controls}
            labOutput={labOutput}
            connectionState={connectionState}
            controlsLocked={controlsLocked}
          />
          {mode === 'learn' && focusIds.includes(comp.id) && (
            <FocusHighlight
              position={comp.position}
              type={comp.type}
              color={focusColor}
            />
          )}
        </group>
      ))}

      {/* Student / tutorial wires */}
      {wireMeta.map(({ wire, netIdx, idxInNet }) => {
        const isWireHighlighted =
          highlightedNetTerminals !== null &&
          highlightedNetTerminals.has(wire.a) &&
          highlightedNetTerminals.has(wire.b);
        const isWireDimmed =
          highlightedNetTerminals !== null && !isWireHighlighted;
        const flow = wireFlows.get(wire.id);
        return (
          <WireMesh
            key={wire.id}
            wire={wire}
            components={stageComponents}
            netIndex={netIdx}
            wireIndexInNet={idxInNet}
            highlighted={isWireHighlighted}
            dimmed={isWireDimmed}
            flowDirection={flow?.direction ?? 0}
            flowCurrentA={flow?.currentA ?? 0}
          />
        );
      })}

      {/* Canonical ghost solution overlay */}
      {ghostWireMeta.map(({ wire, netIdx, idxInNet }) => (
        <WireMesh
          key={wire.id}
          wire={wire}
          components={stageComponents}
          netIndex={netIdx}
          wireIndexInNet={idxInNet}
          ghost
          readOnly
        />
      ))}
    </Canvas>
  );
}
