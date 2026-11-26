import { useEffect, useRef, useState } from 'react';
import { getComponentDef } from '../core/components';
import type { ComponentInstance } from '../core/types';
import { useControlsStore } from '../stores/controlsStore';
import { LabelPlate } from './LabelPlate';
import { Terminal } from './Terminal';

interface VariacProps {
  instance: ComponentInstance;
  controlId?: string;
  variacV: number;
  minV: number;
  maxV: number;
  stepV: number;
  fineStepV?: number;
  controlsLocked?: boolean;
}

export function Variac({
  instance,
  controlId = 'va.knob',
  variacV,
  minV,
  maxV,
  stepV,
  fineStepV = 0.1,
  controlsLocked = false,
}: VariacProps) {
  const def = getComponentDef(instance.type);
  const setControlValue = useControlsStore((s) => s.setControlValue);
  const stepControlValue = useControlsStore((s) => s.stepControlValue);
  const focusedControl = useControlsStore((s) => s.focusedControl);
  const setFocusedControl = useControlsStore((s) => s.setFocusedControl);
  const setIsDraggingControl = useControlsStore((s) => s.setIsDraggingControl);

  const [hovered, setHovered] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; startV: number } | null>(
    null,
  );

  const isFocused = focusedControl === controlId;
  const span = Math.max(1, maxV - minV);
  const knobAngle = Math.PI * 0.75 - ((variacV - minV) / span) * Math.PI * 1.5;

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const drag = dragStartRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = drag.y - e.clientY;
      const deltaPx = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
      const rawDelta = (deltaPx / 200) * span;
      const stepDelta = Math.round(rawDelta / stepV) * stepV;
      const next = Math.max(minV, Math.min(maxV, drag.startV + stepDelta));
      setControlValue(
        controlId,
        stepV < 1 ? Math.round(next * 10) / 10 : Math.round(next),
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
  }, [controlId, minV, maxV, span, stepV, setControlValue, setIsDraggingControl]);

  useEffect(() => {
    if (!isFocused) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      const deltaMag = e.altKey
        ? fineStepV
        : e.shiftKey
          ? stepV * 10
          : stepV;
      const prec = e.altKey ? fineStepV : stepV;
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
        e.preventDefault();
        stepControlValue(controlId, deltaMag, minV, maxV, prec);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
        e.preventDefault();
        stepControlValue(controlId, -deltaMag, minV, maxV, prec);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFocused, controlId, stepV, fineStepV, minV, maxV, stepControlValue]);

  const vDisplay = Number.isInteger(variacV) ? String(variacV) : variacV.toFixed(1);

  return (
    <group position={instance.position}>
      {/* Base plate & front terminal apron */}
      <mesh position={[0, 0.14, 0.04]} castShadow receiveShadow>
        <boxGeometry args={[1.0, 0.28, 0.94]} />
        <meshStandardMaterial color="#1e293b" roughness={0.6} metalness={0.25} />
      </mesh>

      {/* Cylindrical toroidal coil housing */}
      <mesh position={[0, 0.5, -0.14]} castShadow receiveShadow>
        <cylinderGeometry args={[0.37, 0.39, 0.48, 28]} />
        <meshStandardMaterial color="#475569" roughness={0.5} metalness={0.35} />
      </mesh>

      {/* Top dial ring */}
      <mesh position={[0, 0.745, -0.14]}>
        <cylinderGeometry args={[0.31, 0.31, 0.02, 28]} />
        <meshStandardMaterial color="#0f172a" roughness={0.7} />
      </mesh>

      {/* Focus / hover halo ring */}
      {(isFocused || hovered) && (
        <mesh position={[0, 0.76, -0.14]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.18, 0.22, 32]} />
          <meshBasicMaterial color={isFocused ? '#38bdf8' : '#f59e0b'} />
        </mesh>
      )}

      {/* Invisible hit cylinder for mouse/touch drag and wheel */}
      <mesh
        position={[0, 0.84, -0.14]}
        onPointerDown={(e) => {
          e.stopPropagation();
          if (controlsLocked) return;
          setFocusedControl(controlId);
          setIsDraggingControl(true);
          dragStartRef.current = {
            x: e.nativeEvent.clientX,
            y: e.nativeEvent.clientY,
            startV: variacV,
          };
          document.body.style.cursor = 'grabbing';
        }}
        onWheel={(e) => {
          e.stopPropagation();
          if (controlsLocked) return;
          setFocusedControl(controlId);
          const step = e.altKey ? fineStepV : stepV;
          stepControlValue(controlId, e.deltaY < 0 ? step : -step, minV, maxV, step);
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
          if (!dragStartRef.current) {
            document.body.style.cursor = 'auto';
          }
        }}
      >
        <cylinderGeometry args={[0.32, 0.32, 0.28, 20]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Rotating control knob */}
      <group position={[0, 0.81, -0.14]} rotation={[0, knobAngle, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.15, 0.17, 0.12, 24]} />
          <meshStandardMaterial color="#020617" roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.065, -0.075]}>
          <boxGeometry args={[0.03, 0.02, 0.11]} />
          <meshStandardMaterial color="#f59e0b" />
        </mesh>
      </group>

      <LabelPlate
        text="AUTOTRANSFORMER"
        subtext={`${minV}-${maxV} V · ${vDisplay} V`}
        width={0.86}
        height={0.14}
        fontSize={32}
        position={[0, 0.285, 0.35]}
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
