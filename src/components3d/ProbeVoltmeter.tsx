import { useState } from 'react';
import type { ComponentInstance, MeterReading } from '../core/types';
import { useControlsStore } from '../stores/controlsStore';
import { useSessionStore } from '../stores/sessionStore';
import { LabelPlate, MeterDial } from './LabelPlate';

interface ProbeVoltmeterProps {
  instance: ComponentInstance;
  reading?: MeterReading;
  controlsLocked?: boolean;
}

export function ProbeVoltmeter({
  instance,
  reading,
  controlsLocked = false,
}: ProbeVoltmeterProps) {
  const showNumericReadouts = useSessionStore((s) => s.showNumericReadouts);
  const activeProbeLead = useSessionStore((s) => s.activeProbeLead);
  const setActiveProbeLead = useSessionStore((s) => s.setActiveProbeLead);
  const values = useControlsStore((s) => s.values);
  const [hoveredBtn, setHoveredBtn] = useState<'a' | 'b' | null>(null);

  const probeA = String(values['probe.a'] ?? '');
  const probeB = String(values['probe.b'] ?? '');
  const val = reading?.shownValue ?? 0;
  const readingText = `${val.toFixed(1)} V`;

  const shortTerm = (id: string) => (id ? id.replace(/^tx\./, '') : '--');

  return (
    <group position={instance.position}>
      {/* Instrument body */}
      <mesh position={[0, 0.14, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.92, 0.28, 0.84]} />
        <meshStandardMaterial color="#1e293b" roughness={0.55} metalness={0.25} />
      </mesh>

      {/* Sloped dial housing */}
      <mesh
        position={[0, 0.34, -0.06]}
        rotation={[0.45, 0, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[0.84, 0.22, 0.58]} />
        <meshStandardMaterial color="#0f172a" roughness={0.5} />
      </mesh>

      <MeterDial
        title={instance.label.toUpperCase()}
        unit="V AC (PROBE)"
        maxScale={reading?.range ?? 300}
        pointerRatio={reading?.pointerRatio ?? 0}
        readingText={readingText}
        showNumericReadout={showNumericReadouts}
        width={0.72}
        height={0.46}
        position={[0, 0.465, -0.01]}
        rotation={[-Math.PI / 2 + 0.45, 0, 0]}
        overrange={reading?.overrange}
      />

      {/* Red Probe (+ Lead A) jack button */}
      <group position={[-0.22, 0.285, 0.3]}>
        <mesh
          position={[0, 0.03, 0]}
          onClick={(e) => {
            e.stopPropagation();
            if (controlsLocked) return;
            setActiveProbeLead(activeProbeLead === 'a' ? null : 'a');
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            if (controlsLocked) return;
            setHoveredBtn('a');
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
            setHoveredBtn(null);
            document.body.style.cursor = 'auto';
          }}
        >
          <cylinderGeometry args={[0.07, 0.07, 0.06, 16]} />
          <meshStandardMaterial
            color={
              activeProbeLead === 'a'
                ? '#ef4444'
                : hoveredBtn === 'a'
                  ? '#f87171'
                  : '#b91c1c'
            }
            emissive={activeProbeLead === 'a' ? '#ef4444' : '#000000'}
            emissiveIntensity={activeProbeLead === 'a' ? 0.65 : 0}
          />
        </mesh>
        <LabelPlate
          text={`+ ${shortTerm(probeA)}`}
          width={0.32}
          height={0.11}
          fontSize={30}
          bg="#0f172a"
          fg="#fca5a5"
          border={activeProbeLead === 'a' ? '#ef4444' : '#334155'}
          position={[0, 0.012, 0.1]}
          rotation={[-Math.PI / 2, 0, 0]}
        />
      </group>

      {/* Black/Cyan Probe (- Lead B) jack button */}
      <group position={[0.22, 0.285, 0.3]}>
        <mesh
          position={[0, 0.03, 0]}
          onClick={(e) => {
            e.stopPropagation();
            if (controlsLocked) return;
            setActiveProbeLead(activeProbeLead === 'b' ? null : 'b');
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            if (controlsLocked) return;
            setHoveredBtn('b');
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
            setHoveredBtn(null);
            document.body.style.cursor = 'auto';
          }}
        >
          <cylinderGeometry args={[0.07, 0.07, 0.06, 16]} />
          <meshStandardMaterial
            color={
              activeProbeLead === 'b'
                ? '#38bdf8'
                : hoveredBtn === 'b'
                  ? '#7dd3fc'
                  : '#0369a1'
            }
            emissive={activeProbeLead === 'b' ? '#38bdf8' : '#000000'}
            emissiveIntensity={activeProbeLead === 'b' ? 0.65 : 0}
          />
        </mesh>
        <LabelPlate
          text={`- ${shortTerm(probeB)}`}
          width={0.32}
          height={0.11}
          fontSize={30}
          bg="#0f172a"
          fg="#7dd3fc"
          border={activeProbeLead === 'b' ? '#38bdf8' : '#334155'}
          position={[0, 0.012, 0.1]}
          rotation={[-Math.PI / 2, 0, 0]}
        />
      </group>
    </group>
  );
}
