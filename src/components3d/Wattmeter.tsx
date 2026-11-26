import { useState } from 'react';
import { getComponentDef } from '../core/components';
import { describeWattmeterCcLinkMode } from '../core/physics/meters';
import type { ComponentInstance, MeterReading } from '../core/types';
import { useControlsStore } from '../stores/controlsStore';
import { useSessionStore } from '../stores/sessionStore';
import { LabelPlate, MeterDial } from './LabelPlate';
import { Terminal } from './Terminal';

interface WattmeterProps {
  instance: ComponentInstance;
  reading?: MeterReading;
  vRange: number;
  iRange: number;
  divisions?: number;
  pf?: number;
  vOptions: number[];
  iOptions: number[];
  hasVSelector?: boolean;
  hasISelector?: boolean;
  hasReverseSwitch?: boolean;
  reverseOn?: boolean;
  controlsLocked?: boolean;
}

export function Wattmeter({
  instance,
  reading,
  vRange,
  iRange,
  divisions = 150,
  pf = 1.0,
  vOptions,
  iOptions,
  hasVSelector = true,
  hasISelector = true,
  hasReverseSwitch = false,
  reverseOn = false,
  controlsLocked = false,
}: WattmeterProps) {
  const def = getComponentDef(instance.type);
  const showNumericReadouts = useSessionStore((s) => s.showNumericReadouts);
  const cycleControlOption = useControlsStore((s) => s.cycleControlOption);
  const setControlValue = useControlsStore((s) => s.setControlValue);
  const [hoveredSel, setHoveredSel] = useState<'v' | 'i' | 'rev' | null>(null);

  const activeDivs = reading?.divisions ?? divisions;
  const activePf = reading?.pf ?? pf;
  const mf = reading?.mf ?? (vRange * iRange * activePf) / activeDivs;
  const ccLink = describeWattmeterCcLinkMode(iRange, iOptions);
  const mfText = mf < 1 ? mf.toFixed(2) : mf.toFixed(1);
  const readingText = reading?.damaged
    ? 'DAMAGED'
    : `${(reading?.dial ?? 0).toFixed(1)} div`;

  const pfTag = activePf < 0.99 ? ` · PF ${activePf}` : '';

  return (
    <group position={instance.position}>
      {/* Desk meter wooden/slate base */}
      <mesh position={[0, 0.16, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.02, 0.32, 0.9]} />
        <meshStandardMaterial color="#3f2e21" roughness={0.65} metalness={0.1} />
      </mesh>

      {/* Sloped upper dial housing */}
      <mesh
        position={[0, 0.36, -0.08]}
        rotation={[0.42, 0, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[0.92, 0.22, 0.64]} />
        <meshStandardMaterial color="#1e293b" roughness={0.5} metalness={0.2} />
      </mesh>

      <MeterDial
        title={instance.label.toUpperCase()}
        unit={`DIV (${vRange}V / ${iRange}A${pfTag})`}
        maxScale={activeDivs}
        pointerRatio={reading?.pointerRatio ?? 0}
        readingText={readingText}
        showNumericReadout={showNumericReadouts}
        width={0.78}
        height={0.48}
        position={[0, 0.49, -0.03]}
        rotation={[-Math.PI / 2 + 0.42, 0, 0]}
        allowNegative
        overrange={reading?.overrange}
        damaged={reading?.damaged}
        reversed={reading?.reversed}
      />

      {/* Clickable Voltage Range Selector */}
      <group position={[-0.24, 0.33, 0.33]}>
        {hasVSelector && vOptions.length > 1 && (
          <mesh
            position={[0, 0.03, 0]}
            onClick={(e) => {
              e.stopPropagation();
              if (controlsLocked) return;
              cycleControlOption(`${instance.id}.vRange`, vOptions);
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              if (controlsLocked) return;
              setHoveredSel('v');
              document.body.style.cursor = 'pointer';
            }}
            onPointerOut={(e) => {
              e.stopPropagation();
              setHoveredSel(null);
              document.body.style.cursor = 'auto';
            }}
          >
            <boxGeometry args={[0.38, 0.14, 0.22]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        )}
        <LabelPlate
          text={`V: ${vRange} V`}
          subtext="PC Multiplier"
          width={0.34}
          height={0.11}
          fontSize={32}
          bg={hoveredSel === 'v' ? '#0284c7' : '#0f172a'}
          border="#64748b"
          rotation={[-Math.PI / 2, 0, 0]}
        />
      </group>

      {/* Clickable Current Range Selector + Brass Series/Parallel CC Link */}
      <group position={[0.24, 0.33, 0.33]}>
        {hasISelector && iOptions.length > 1 && (
          <mesh
            position={[0, 0.03, 0]}
            onClick={(e) => {
              e.stopPropagation();
              if (controlsLocked) return;
              cycleControlOption(`${instance.id}.iRange`, iOptions);
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              if (controlsLocked) return;
              setHoveredSel('i');
              document.body.style.cursor = 'pointer';
            }}
            onPointerOut={(e) => {
              e.stopPropagation();
              setHoveredSel(null);
              document.body.style.cursor = 'auto';
            }}
          >
            <boxGeometry args={[0.38, 0.14, 0.22]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        )}
        {/* Physical brass coil-link strap visual */}
        {ccLink && (
          <group position={[0, 0.015, -0.085]}>
            {[-0.08, 0.08].map((px) => (
              <mesh key={`p1-${px}`} position={[px, 0, -0.02]}>
                <cylinderGeometry args={[0.013, 0.013, 0.025, 10]} />
                <meshStandardMaterial color="#d97706" metalness={0.75} roughness={0.3} />
              </mesh>
            ))}
            {ccLink.short === 'SER' ? (
              <mesh position={[0, 0.008, -0.02]}>
                <boxGeometry args={[0.17, 0.01, 0.022]} />
                <meshStandardMaterial color="#fbbf24" metalness={0.8} roughness={0.25} />
              </mesh>
            ) : (
              <>
                <mesh position={[-0.08, 0.008, -0.02]}>
                  <boxGeometry args={[0.026, 0.01, 0.05]} />
                  <meshStandardMaterial color="#fbbf24" metalness={0.8} roughness={0.25} />
                </mesh>
                <mesh position={[0.08, 0.008, -0.02]}>
                  <boxGeometry args={[0.026, 0.01, 0.05]} />
                  <meshStandardMaterial color="#fbbf24" metalness={0.8} roughness={0.25} />
                </mesh>
              </>
            )}
          </group>
        )}
        <LabelPlate
          text={ccLink ? `I: ${iRange} A (${ccLink.short})` : `I: ${iRange} A`}
          subtext={`MF=${mfText}`}
          width={0.34}
          height={0.11}
          fontSize={28}
          bg={hoveredSel === 'i' ? '#0284c7' : '#0f172a'}
          border="#64748b"
          rotation={[-Math.PI / 2, 0, 0]}
        />
      </group>

      {/* Optional Reverse Switch on Wattmeter */}
      {hasReverseSwitch && (
        <group position={[0, 0.33, 0.33]}>
          <mesh
            position={[0, 0.03, 0]}
            onClick={(e) => {
              e.stopPropagation();
              if (controlsLocked) return;
              setControlValue(`${instance.id}.reverse`, !reverseOn);
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              if (controlsLocked) return;
              setHoveredSel('rev');
              document.body.style.cursor = 'pointer';
            }}
            onPointerOut={(e) => {
              e.stopPropagation();
              setHoveredSel(null);
              document.body.style.cursor = 'auto';
            }}
          >
            <boxGeometry args={[0.14, 0.14, 0.14]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
          <LabelPlate
            text={reverseOn ? 'REV' : 'FWD'}
            width={0.12}
            height={0.11}
            fontSize={28}
            bg={
              hoveredSel === 'rev'
                ? '#0284c7'
                : reverseOn
                  ? '#b45309'
                  : '#0f172a'
            }
            border="#64748b"
            rotation={[-Math.PI / 2, 0, 0]}
          />
        </group>
      )}

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
