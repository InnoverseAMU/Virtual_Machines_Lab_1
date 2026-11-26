import { useEffect, useRef, useState } from 'react';
import { getComponentDef } from '../core/components';
import type { ComponentInstance } from '../core/types';
import { useControlsStore } from '../stores/controlsStore';
import { LabelPlate } from './LabelPlate';
import { Terminal } from './Terminal';

interface RheostatProps {
  instance: ComponentInstance;
  switchControlId: string;
  resistanceControlId: string;
  switchOn: boolean;
  resistance: number;
  minR: number;
  maxR: number;
  stepR: number;
  controlsLocked?: boolean;
}

export function Rheostat({
  instance,
  switchControlId,
  resistanceControlId,
  switchOn,
  resistance,
  minR,
  maxR,
  stepR,
  controlsLocked = false,
}: RheostatProps) {
  const def = getComponentDef(instance.type);
  const setControlValue = useControlsStore((s) => s.setControlValue);
  const stepControlValue = useControlsStore((s) => s.stepControlValue);
  const setFocusedControl = useControlsStore((s) => s.setFocusedControl);
  const setIsDraggingControl = useControlsStore((s) => s.setIsDraggingControl);

  const [hoveredKnob, setHoveredKnob] = useState(false);
  const [hoveredSwitch, setHoveredSwitch] = useState(false);
  const dragStartRef = useRef<{ x: number; startR: number } | null>(null);

  const span = Math.max(1, maxR - minR);
  // Slider position along X: minR (3 ohm) on left (-0.38), maxR (100 ohm) on right (+0.38)
  const frac = Math.max(0, Math.min(1, (resistance - minR) / span));
  const sliderX = -0.38 + frac * 0.76;

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const drag = dragStartRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const rawDelta = (dx / 180) * span;
      const stepped = Math.round(rawDelta / stepR) * stepR;
      const next = Math.max(minR, Math.min(maxR, drag.startR + stepped));
      setControlValue(
        resistanceControlId,
        stepR < 1 ? Math.round(next * 10) / 10 : Math.round(next),
      );
    };

    const endDrag = () => {
      if (!dragStartRef.current) return;
      dragStartRef.current = null;
      setIsDraggingControl(false);
      document.body.style.cursor = 'auto';
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
    };
  }, [resistanceControlId, minR, maxR, span, stepR, setControlValue, setIsDraggingControl]);

  return (
    <group position={instance.position}>
      {/* Base plinth */}
      <mesh position={[0, 0.14, 0.04]} castShadow receiveShadow>
        <boxGeometry args={[1.22, 0.28, 0.84]} />
        <meshStandardMaterial color="#1e293b" roughness={0.6} metalness={0.25} />
      </mesh>

      {/* End support brackets */}
      {[-0.48, 0.48].map((bx, idx) => (
        <mesh key={idx} position={[bx, 0.44, -0.1]} castShadow receiveShadow>
          <boxGeometry args={[0.08, 0.42, 0.34]} />
          <meshStandardMaterial color="#334155" roughness={0.5} metalness={0.55} />
        </mesh>
      ))}

      {/* Wire-wound ceramic cylinder */}
      <mesh position={[0, 0.44, -0.1]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.14, 0.14, 0.88, 24]} />
        <meshStandardMaterial color="#92400e" roughness={0.45} metalness={0.35} />
      </mesh>

      {/* Top brass slide bar */}
      <mesh position={[0, 0.68, -0.1]} castShadow>
        <boxGeometry args={[0.96, 0.04, 0.05]} />
        <meshStandardMaterial color="#d97706" roughness={0.3} metalness={0.75} />
      </mesh>

      {/* Sliding contact carriage + handle */}
      <group position={[sliderX, 0.68, -0.1]}>
        <mesh castShadow>
          <boxGeometry args={[0.12, 0.12, 0.12]} />
          <meshStandardMaterial
            color={hoveredKnob ? '#38bdf8' : '#0f172a'}
            roughness={0.4}
            metalness={0.3}
          />
        </mesh>
        <mesh position={[0, 0.09, 0]} castShadow>
          <cylinderGeometry args={[0.055, 0.045, 0.09, 18]} />
          <meshStandardMaterial color="#f59e0b" roughness={0.35} />
        </mesh>
        <mesh
          position={[0, 0.06, 0]}
          onPointerDown={(e) => {
            e.stopPropagation();
            if (controlsLocked) return;
            setFocusedControl(resistanceControlId);
            setIsDraggingControl(true);
            dragStartRef.current = { x: e.nativeEvent.clientX, startR: resistance };
            document.body.style.cursor = 'grabbing';
          }}
          onWheel={(e) => {
            e.stopPropagation();
            if (controlsLocked) return;
            stepControlValue(
              resistanceControlId,
              e.deltaY < 0 ? -stepR : stepR,
              minR,
              maxR,
              stepR,
            );
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            if (controlsLocked) return;
            setHoveredKnob(true);
            document.body.style.cursor = 'grab';
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
            setHoveredKnob(false);
            if (!dragStartRef.current) document.body.style.cursor = 'auto';
          }}
        >
          <boxGeometry args={[0.24, 0.28, 0.24]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>

      {/* Load switch toggle on front apron */}
      <group position={[0.45, 0.3, 0.28]}>
        <mesh
          onClick={(e) => {
            e.stopPropagation();
            if (controlsLocked) return;
            setControlValue(switchControlId, !switchOn);
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            if (controlsLocked) return;
            setHoveredSwitch(true);
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
            setHoveredSwitch(false);
            document.body.style.cursor = 'auto';
          }}
        >
          <boxGeometry args={[0.18, 0.16, 0.18]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <mesh rotation={[switchOn ? -0.35 : 0.35, 0, 0]} castShadow>
          <boxGeometry args={[0.07, 0.08, 0.05]} />
          <meshStandardMaterial
            color={hoveredSwitch ? '#38bdf8' : switchOn ? '#22c55e' : '#ef4444'}
          />
        </mesh>
      </group>

      <LabelPlate
        text="RHEOSTAT LOAD"
        subtext={`${resistance.toFixed(1)} Ω · ${switchOn ? 'ON' : 'OFF'} · 40 A`}
        width={0.9}
        height={0.14}
        fontSize={30}
        position={[-0.08, 0.285, 0.24]}
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
