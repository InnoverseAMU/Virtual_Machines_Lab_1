import { useFrame } from '@react-three/fiber';
import gsap from 'gsap';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ComponentInstance, Wire } from '../core/types';
import { useControlsStore } from '../stores/controlsStore';
import { useSessionStore } from '../stores/sessionStore';
import { useWiringStore } from '../stores/wiringStore';
import { NET_WIRE_COLORS } from '../theme/tokens';
import { getTerminalWorldPos } from './terminalPos';

interface WireMeshProps {
  wire: Wire;
  components: ComponentInstance[];
  netIndex: number;
  wireIndexInNet: number;
  readOnly?: boolean;
  ghost?: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
  flowDirection?: -1 | 0 | 1;
  flowCurrentA?: number;
}

const MAX_PARTICLE_COUNT = 26;
const SHARED_PARTICLE_GEO = new THREE.SphereGeometry(0.0115, 8, 8);
const SHARED_PARTICLE_MAT = new THREE.MeshBasicMaterial({
  color: '#f0f9ff',
  toneMapped: false,
});
const _scratchObj = new THREE.Object3D();

function WireFlowParticles({
  curve,
  direction,
  currentA,
}: {
  curve: THREE.QuadraticBezierCurve3;
  direction: -1 | 1;
  currentA: number;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const phaseRef = useRef(0);

  const { curveLength, count } = useMemo(() => {
    const len = Math.max(0.25, curve.getLength());
    const n = Math.max(6, Math.min(MAX_PARTICLE_COUNT, Math.round(len * 9)));
    return { curveLength: len, count: n };
  }, [curve]);

  useFrame((_, delta) => {
    const inst = meshRef.current;
    if (!inst) return;
    const dt = Math.min(delta, 0.05);
    // Uniform world-space drift speed (m/s) along all wires, gently modulated by current
    const worldSpeed = Math.min(
      0.85,
      Math.max(0.32, 0.3 + Math.log10(1 + Math.max(0, currentA)) * 0.35),
    );
    const cyclesPerSec = worldSpeed / curveLength;
    phaseRef.current = (phaseRef.current + dt * cyclesPerSec) % 1;

    for (let i = 0; i < count; i++) {
      const u = (phaseRef.current + i / count) % 1;
      const t = direction > 0 ? u : 1 - u;
      curve.getPoint(t, _scratchObj.position);
      const envelope = 0.45 + 0.55 * Math.sin(Math.PI * u);
      _scratchObj.scale.setScalar(envelope);
      _scratchObj.updateMatrix();
      inst.setMatrixAt(i, _scratchObj.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      key={count}
      ref={meshRef}
      args={[SHARED_PARTICLE_GEO, SHARED_PARTICLE_MAT, count]}
      dispose={null}
      renderOrder={1}
      frustumCulled={false}
    />
  );
}

export function WireMesh({
  wire,
  components,
  netIndex,
  wireIndexInNet,
  readOnly = false,
  ghost = false,
  highlighted = false,
  dimmed = false,
  flowDirection = 0,
  flowCurrentA = 0,
}: WireMeshProps) {
  const [hovered, setHovered] = useState(false);
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const removeWire = useWiringStore((s) => s.removeWire);
  const supplyOn = useControlsStore((s) => s.supplyOn);
  const mode = useSessionStore((s) => s.mode);
  const isLearnMode = mode === 'learn';
  const isObserveMode = mode === 'observe';
  const blockClick = readOnly || ghost || isLearnMode;
  const cursorLocked = blockClick || isObserveMode;

  const startPos = useMemo(
    () => getTerminalWorldPos(components, wire.a),
    [components, wire.a],
  );
  const endPos = useMemo(
    () => getTerminalWorldPos(components, wire.b),
    [components, wire.b],
  );

  const { curve, geometry } = useMemo(() => {
    if (!startPos || !endPos) return { curve: null, geometry: null };
    const yLift = ghost ? 0.035 : 0;
    const p0 = new THREE.Vector3(
      startPos[0],
      startPos[1] + yLift,
      startPos[2] + 0.055,
    );
    const p2 = new THREE.Vector3(
      endPos[0],
      endPos[1] + yLift,
      endPos[2] + 0.055,
    );
    const dist = p0.distanceTo(p2);

    const midX = (p0.x + p2.x) * 0.5;
    const maxZ = Math.max(p0.z, p2.z);
    const forwardBump =
      Math.min(0.95, 0.22 + dist * 0.14 + (netIndex % 4) * 0.06) +
      (ghost ? 0.06 : 0);
    const sagY =
      (dist < 0.7
        ? Math.max(0.06, (p0.y + p2.y) * 0.5 - 0.08)
        : Math.max(0.05, 0.08 + (wireIndexInNet % 3) * 0.02)) + yLift;

    const p1 = new THREE.Vector3(midX, sagY, maxZ + forwardBump);
    const bezier = new THREE.QuadraticBezierCurve3(p0, p1, p2);
    return {
      curve: bezier,
      geometry: new THREE.TubeGeometry(bezier, 32, ghost ? 0.017 : 0.022, 10, false),
    };
  }, [startPos, endPos, netIndex, wireIndexInNet, ghost]);

  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    gsap.fromTo(
      mesh.scale,
      { x: 0.96, y: 0.05, z: 0.96 },
      { x: 1, y: 1, z: 1, duration: 0.28, ease: 'power2.out' },
    );
  }, []);

  useEffect(() => {
    if (!ghost || !matRef.current) return;
    const mat = matRef.current;
    const tween = gsap.fromTo(
      mat,
      { opacity: 0.35 },
      {
        opacity: 0.85,
        duration: 0.85,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      },
    );
    return () => {
      tween.kill();
    };
  }, [ghost]);

  if (!geometry || !curve) return null;

  const baseColor =
    NET_WIRE_COLORS[Math.abs(netIndex) % NET_WIRE_COLORS.length];
  const isFlowing = !ghost && !dimmed && flowDirection !== 0;

  return (
    <group>
      {isFlowing && (
        <WireFlowParticles
          curve={curve}
          direction={flowDirection}
          currentA={flowCurrentA}
        />
      )}
      <mesh
        ref={meshRef}
        geometry={geometry}
        castShadow={!ghost}
        renderOrder={isFlowing ? 2 : 0}
        onClick={(e) => {
          if (blockClick) return;
          e.stopPropagation();
          removeWire(wire.id, supplyOn);
          document.body.style.cursor = cursorLocked ? 'default' : 'auto';
        }}
        onPointerOver={(e) => {
          if (blockClick) return;
          e.stopPropagation();
          setHovered(!isObserveMode);
          document.body.style.cursor = cursorLocked ? 'default' : 'pointer';
        }}
        onPointerOut={(e) => {
          if (blockClick) return;
          e.stopPropagation();
          setHovered(false);
          document.body.style.cursor = 'auto';
        }}
      >
        <meshStandardMaterial
          ref={matRef}
          color={ghost ? '#38bdf8' : hovered ? '#ffffff' : baseColor}
          emissive={
            ghost ? '#0ea5e9' : highlighted || hovered ? baseColor : '#000000'
          }
          emissiveIntensity={
            ghost ? 0.5 : highlighted ? 0.75 : hovered ? 0.6 : 0
          }
          roughness={0.4}
          metalness={0.1}
          transparent={ghost || dimmed || isFlowing}
          opacity={ghost ? 0.65 : dimmed ? 0.16 : isFlowing ? 0.76 : 1}
          depthWrite={!ghost && !dimmed && !isFlowing}
        />
      </mesh>
    </group>
  );
}
