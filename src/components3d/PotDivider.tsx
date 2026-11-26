import { useEffect, useRef, useState } from 'react';
import { getComponentDef } from '../core/components';
import type { ComponentInstance } from '../core/types';
import { useControlsStore } from '../stores/controlsStore';
import { LabelPlate } from './LabelPlate';
import { Terminal } from './Terminal';

interface PotDividerProps {
  instance: ComponentInstance;
  controlId?: string;
  p: number;
  damaged?: boolean;
  controlsLocked?: boolean;
}

export function PotDivider({
  instance,
  controlId = 'pot.p',
  p,
  damaged = false,
  controlsLocked = false,
}: PotDividerProps) {
  const def = getComponentDef(instance.type);
  const stepControlValue = useControlsStore((s) => s.stepControlValue);
  const setControlValue = useControlsStore((s) => s.setControlValue);
  const setIsDraggingControl = useControlsStore((s) => s.setIsDraggingControl);
  const [hovered, setHovered] = useState(false);
  const dragRef = useRef<{ x: number; startP: number } | null>(null);

  const clamped = Math.max(0, Math.min(1, p));
  // Slider rail spans x in [-0.46, +0.46]
  const wiperX = -0.46 + clamped * 0.92;

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = (e.clientX - drag.x) / 180;
      const next = Math.max(0, Math.min(1, drag.startP + dx));
      setControlValue(controlId, Math.round(next * 100) / 100);
    };
    const end = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setIsDraggingControl(false);
      document.body.style.cursor = 'auto';
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [controlId, setControlValue, setIsDraggingControl]);

  return (
    <group position={instance.position}>
      {/* Plinth */}
      <mesh position={[0, 0.1, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.24, 0.2, 0.82]} />
        <meshStandardMaterial color="#1e293b" roughness={0.65} metalness={0.25} />
      </mesh>

      {/* Ceramic tubular wire-wound resistor body */}
      <mesh position={[0, 0.42, -0.06]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.13, 0.13, 1.0, 20]} />
        <meshStandardMaterial color={damaged ? '#7f1d1d' : '#78350f'} roughness={0.7} />
      </mesh>

      {/* Top slide rail */}
      <mesh position={[0, 0.62, -0.06]}>
        <boxGeometry args={[1.04, 0.04, 0.04]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.85} roughness={0.2} />
      </mesh>

      {/* Draggable insulated wiper carriage */}
      <mesh
        position={[wiperX, 0.64, -0.06]}
        castShadow
        onPointerDown={(e) => {
          e.stopPropagation();
          if (controlsLocked) return;
          setIsDraggingControl(true);
          dragRef.current = { x: e.clientX, startP: clamped };
          document.body.style.cursor = 'grabbing';
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          if (controlsLocked) return;
          setHovered(true);
          document.body.style.cursor = 'grab';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
          if (!dragRef.current) document.body.style.cursor = 'auto';
        }}
        onWheel={(e) => {
          e.stopPropagation();
          if (controlsLocked) return;
          stepControlValue(controlId, e.deltaY < 0 ? 0.02 : -0.02, 0, 1, 0.02);
        }}
      >
        <boxGeometry args={[0.14, 0.14, 0.16]} />
        <meshStandardMaterial
          color={damaged ? '#ef4444' : hovered ? '#38bdf8' : '#0f172a'}
          roughness={0.4}
        />
      </mesh>

      <LabelPlate
        text="POTENTIAL DIVIDER"
        subtext={damaged ? 'DAMAGED (OVERCURRENT)' : `p = ${(clamped * 100).toFixed(0)}%`}
        width={0.94}
        height={0.15}
        fontSize={26}
        bg="#0f172a"
        fg="#f8fafc"
        border={damaged ? '#ef4444' : '#334155'}
        position={[0, 0.21, -0.18]}
        rotation={[-Math.PI / 2, 0, 0]}
      />

      {def.terminals.map((t) => (
        <Terminal
          key={t.name}
          componentId={instance.id}
          componentLabel={instance.label}
          terminal={t}
        />
      ))}
    </group>
  );
}
