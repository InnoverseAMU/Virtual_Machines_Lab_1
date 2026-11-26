import { useEffect, useRef, useState } from 'react';
import { getComponentDef } from '../core/components';
import type { ComponentInstance } from '../core/types';
import { useControlsStore } from '../stores/controlsStore';
import { LabelPlate } from './LabelPlate';
import { Terminal } from './Terminal';

interface Variac3phProps {
  instance: ComponentInstance;
  controlId?: string;
  variacV: number;
  minV: number;
  maxV: number;
  stepV: number;
  fineStepV?: number;
  controlsLocked?: boolean;
}

export function Variac3ph({
  instance,
  controlId = 'va3.knob',
  variacV,
  minV,
  maxV,
  stepV,
  fineStepV = 0.1,
  controlsLocked = false,
}: Variac3phProps) {
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

  const hideTerminals = Boolean(instance.params.hideTerminals);
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
      const deltaMag = e.altKey ? fineStepV : e.shiftKey ? stepV * 10 : stepV;
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
  }, [isFocused, controlId, minV, maxV, stepV, fineStepV, stepControlValue]);

  return (
    <group position={instance.position}>
      {/* Plinth */}
      <mesh position={[0, 0.14, 0.04]} castShadow receiveShadow>
        <boxGeometry args={[1.18, 0.28, 0.96]} />
        <meshStandardMaterial color="#1e293b" roughness={0.65} metalness={0.25} />
      </mesh>

      {/* Stacked 3-coil toroidal enclosure */}
      <mesh position={[0, 0.52, -0.05]} castShadow receiveShadow>
        <cylinderGeometry args={[0.45, 0.47, 0.56, 32]} />
        <meshStandardMaterial color="#334155" roughness={0.45} metalness={0.5} />
      </mesh>
      {/* Internal copper coil bands visible through slots */}
      {[0.38, 0.52, 0.66].map((y, idx) => (
        <mesh key={idx} position={[0, y, -0.05]}>
          <cylinderGeometry args={[0.458, 0.458, 0.06, 32]} />
          <meshStandardMaterial color="#b45309" roughness={0.4} metalness={0.75} />
        </mesh>
      ))}

      {/* Handwheel shaft + dial knob */}
      <group position={[0, 0.85, -0.05]} rotation={[0, knobAngle, 0]}>
        <mesh
          position={[0, 0.06, 0]}
          castShadow
          onPointerDown={(e) => {
            e.stopPropagation();
            if (controlsLocked) return;
            setFocusedControl(controlId);
            setIsDraggingControl(true);
            dragStartRef.current = {
              x: e.clientX,
              y: e.clientY,
              startV: variacV,
            };
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
            if (!dragStartRef.current) document.body.style.cursor = 'auto';
          }}
          onWheel={(e) => {
            e.stopPropagation();
            if (controlsLocked) return;
            const delta = e.deltaY < 0 ? stepV : -stepV;
            stepControlValue(controlId, delta, minV, maxV, stepV);
          }}
        >
          <cylinderGeometry args={[0.21, 0.24, 0.1, 24]} />
          <meshStandardMaterial
            color={isFocused ? '#38bdf8' : hovered ? '#94a3b8' : '#0f172a'}
            roughness={0.35}
            metalness={0.35}
          />
        </mesh>
        <mesh position={[0, 0.125, -0.11]}>
          <boxGeometry args={[0.032, 0.02, 0.14]} />
          <meshStandardMaterial color="#f59e0b" />
        </mesh>
      </group>

      <LabelPlate
        text="3φ AUTOTRANSFORMER"
        subtext={`${variacV.toFixed(1)} V L-L`}
        width={0.96}
        height={0.18}
        fontSize={28}
        bg="#0f172a"
        fg="#f8fafc"
        border={isFocused ? '#38bdf8' : '#334155'}
        position={[0, 0.29, 0.29]}
        rotation={[-Math.PI / 2 + 0.35, 0, 0]}
      />

      {hideTerminals && (
        <LabelPlate
          text="FIXED 3φ DELTA FEED TO TX"
          width={0.92}
          height={0.13}
          fontSize={24}
          bg="#0f172a"
          fg="#94a3b8"
          border="#334155"
          position={[0, 0.17, 0.53]}
        />
      )}

      {!hideTerminals &&
        def.terminals.map((t) => (
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
