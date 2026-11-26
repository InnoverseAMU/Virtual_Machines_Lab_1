import gsap from 'gsap';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ComponentInstance, Wire } from '../core/types';
import { useControlsStore } from '../stores/controlsStore';
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
}

export function WireMesh({
  wire,
  components,
  netIndex,
  wireIndexInNet,
  readOnly = false,
  ghost = false,
}: WireMeshProps) {
  const [hovered, setHovered] = useState(false);
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
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
    const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
    return new THREE.TubeGeometry(curve, 32, ghost ? 0.017 : 0.022, 10, false);
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

  if (!geometry) return null;

  const baseColor =
    NET_WIRE_COLORS[Math.abs(netIndex) % NET_WIRE_COLORS.length];

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      castShadow={!ghost}
      onClick={(e) => {
        if (readOnly || ghost) return;
        e.stopPropagation();
        removeWire(wire.id, supplyOn);
        document.body.style.cursor = 'auto';
      }}
      onPointerOver={(e) => {
        if (readOnly || ghost) return;
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={(e) => {
        if (readOnly || ghost) return;
        e.stopPropagation();
        setHovered(false);
        document.body.style.cursor = 'auto';
      }}
    >
      <meshStandardMaterial
        ref={matRef}
        color={ghost ? '#38bdf8' : hovered ? '#ffffff' : baseColor}
        emissive={ghost ? '#0ea5e9' : hovered ? baseColor : '#000000'}
        emissiveIntensity={ghost ? 0.5 : hovered ? 0.6 : 0}
        roughness={0.4}
        metalness={0.1}
        transparent={ghost}
        opacity={ghost ? 0.65 : 1}
        depthWrite={!ghost}
      />
    </mesh>
  );
}
