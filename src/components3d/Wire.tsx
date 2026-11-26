import gsap from 'gsap';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ComponentInstance, Wire } from '../core/types';
import { useControlsStore } from '../stores/controlsStore';
import { useWiringStore } from '../stores/wiringStore';
import { getTerminalWorldPos } from './terminalPos';

const NET_COLORS = [
  '#ef4444', // red
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#10b981', // emerald
  '#a855f7', // purple
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#f97316', // orange
];

interface WireMeshProps {
  wire: Wire;
  components: ComponentInstance[];
  netIndex: number;
  wireIndexInNet: number;
  readOnly?: boolean;
}

export function WireMesh({
  wire,
  components,
  netIndex,
  wireIndexInNet,
  readOnly = false,
}: WireMeshProps) {
  const [hovered, setHovered] = useState(false);
  const meshRef = useRef<THREE.Mesh>(null);
  const removeWire = useWiringStore((s) => s.removeWire);
  const supplyOn = useControlsStore((s) => s.supplyOn);

  const startPos = useMemo(
    () => getTerminalWorldPos(components, wire.a),
    [components, wire.a],
  );
  const endPos = useMemo(
    () => getTerminalWorldPos(components, wire.b),
    [components, wire.b],
  );

  const geometry = useMemo(() => {
    if (!startPos || !endPos) return null;
    const p0 = new THREE.Vector3(startPos[0], startPos[1], startPos[2] + 0.055);
    const p2 = new THREE.Vector3(endPos[0], endPos[1], endPos[2] + 0.055);
    const dist = p0.distanceTo(p2);

    const midX = (p0.x + p2.x) * 0.5;
    const maxZ = Math.max(p0.z, p2.z);
    // Route wires slightly forward and gently sagged toward the bench top
    const forwardBump = Math.min(0.95, 0.22 + dist * 0.14 + (netIndex % 4) * 0.06);
    const sagY =
      dist < 0.7
        ? Math.max(0.06, (p0.y + p2.y) * 0.5 - 0.08)
        : Math.max(0.05, 0.08 + (wireIndexInNet % 3) * 0.02);

    const p1 = new THREE.Vector3(midX, sagY, maxZ + forwardBump);
    const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
    return new THREE.TubeGeometry(curve, 32, 0.022, 10, false);
  }, [startPos, endPos, netIndex, wireIndexInNet]);

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

  if (!geometry) return null;

  const baseColor = NET_COLORS[Math.abs(netIndex) % NET_COLORS.length];

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      castShadow
      onClick={(e) => {
        if (readOnly) return;
        e.stopPropagation();
        removeWire(wire.id, supplyOn);
        document.body.style.cursor = 'auto';
      }}
      onPointerOver={(e) => {
        if (readOnly) return;
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={(e) => {
        if (readOnly) return;
        e.stopPropagation();
        setHovered(false);
        document.body.style.cursor = 'auto';
      }}
    >
      <meshStandardMaterial
        color={hovered ? '#ffffff' : baseColor}
        emissive={hovered ? baseColor : '#000000'}
        emissiveIntensity={hovered ? 0.6 : 0}
        roughness={0.4}
        metalness={0.1}
      />
    </mesh>
  );
}
