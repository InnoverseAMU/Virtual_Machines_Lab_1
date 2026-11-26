import { Html } from '@react-three/drei';
import { useState } from 'react';
import type { TerminalDef, TerminalId } from '../core/types';
import { useControlsStore } from '../stores/controlsStore';
import { useSessionStore } from '../stores/sessionStore';
import { useWiringStore } from '../stores/wiringStore';
import { TERMINAL_SELECTED_COLOR } from '../theme/tokens';
import { LabelPlate } from './LabelPlate';

interface TerminalProps {
  componentId: string;
  componentLabel: string;
  terminal: TerminalDef;
}

function getTerminalRingColor(name: string): string {
  if (
    name === 'N' ||
    name === 'IN_N' ||
    name === 'OUT_N' ||
    name === 'V2' ||
    name === 'P2' ||
    name === 'S2' ||
    name === 'B' ||
    name === 'OUT'
  ) {
    return '#1e293b'; // neutral / return / COM
  }
  if (name === 'V1' || name === 'L' || name === 'OUT_P') {
    return '#eab308'; // instrument / variable tap
  }
  return '#dc2626'; // live / phase / M / P1 / S1 / A / IN
}

export function Terminal({
  componentId,
  componentLabel,
  terminal,
}: TerminalProps) {
  const fullId: TerminalId = `${componentId}.${terminal.name}`;
  const [hovered, setHovered] = useState(false);

  const selectedTerminal = useWiringStore((s) => s.selectedTerminal);
  const clickTerminal = useWiringStore((s) => s.clickTerminal);
  const setHoveredTerminal = useWiringStore((s) => s.setHoveredTerminal);
  const showTerminalLabels = useSessionStore((s) => s.showTerminalLabels);
  const supplyOn = useControlsStore((s) => s.supplyOn);

  const isSelected = selectedTerminal === fullId;
  const ringColor = getTerminalRingColor(terminal.name);

  return (
    <group position={terminal.localPos}>
      {/* Invisible larger hit sphere for reliable clicks and hover */}
      <mesh
        position={[0, 0, 0.03]}
        onClick={(e) => {
          e.stopPropagation();
          clickTerminal(fullId, supplyOn);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          setHoveredTerminal(fullId);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
          setHoveredTerminal(null);
          document.body.style.cursor = 'auto';
        }}
      >
        <sphereGeometry args={[0.09, 12, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Insulated collar */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.015]} castShadow>
        <cylinderGeometry args={[0.046, 0.052, 0.04, 18]} />
        <meshStandardMaterial
          color={
            isSelected
              ? TERMINAL_SELECTED_COLOR
              : hovered
                ? '#f59e0b'
                : ringColor
          }
          emissive={
            isSelected
              ? TERMINAL_SELECTED_COLOR
              : hovered
                ? '#b45309'
                : '#000000'
          }
          emissiveIntensity={isSelected ? 0.7 : hovered ? 0.45 : 0}
          roughness={0.35}
          metalness={0.2}
        />
      </mesh>

      {/* Brass binding stud */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.045]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 0.045, 16]} />
        <meshStandardMaterial
          color={isSelected ? '#38bdf8' : '#fbbf24'}
          metalness={0.75}
          roughness={0.25}
        />
      </mesh>

      {/* Optional printed terminal tag directly below post (key L) */}
      {showTerminalLabels && (
        <LabelPlate
          text={terminal.name}
          width={0.18}
          height={0.085}
          fontSize={36}
          bg="#0f172a"
          fg="#f8fafc"
          border="#334155"
          position={[0, -0.075, 0.012]}
        />
      )}

      {/* Hover / selected tooltip */}
      {(hovered || isSelected) && (
        <Html position={[0, 0.14, 0.06]} center distanceFactor={8}>
          <div
            className="pointer-events-none whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium shadow-lg"
            style={{
              backgroundColor: 'var(--vml-tooltip-bg)',
              color: 'var(--vml-tooltip-text)',
              border: '1px solid var(--vml-tooltip-border)',
            }}
          >
            <span style={{ color: 'var(--vml-accent)', fontWeight: 600 }}>
              {componentLabel}
            </span>
            <span className="mx-1 opacity-50">·</span>
            <span>{terminal.label}</span>
          </div>
        </Html>
      )}
    </group>
  );
}
