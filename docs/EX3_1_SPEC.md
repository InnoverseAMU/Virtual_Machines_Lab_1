# Exp 3.1 Spec and Antigravity Prompts

Companion to Virtual Machines Lab: Architecture v0.1. Experiment: EEC2912 Ex3.1, Load test of single-phase transformer. Where this spec and the architecture doc disagree for Exp 3.1, this spec wins (see Section 11 for the architecture changes it implies).

## 1. Experiment summary

**Object (from the manual):** perform a load test on a single-phase transformer and determine (a) voltage regulation, (b) efficiency, and plot efficiency versus load.

**Default nameplate:** 2 kVA, 230/115 V. The manual's own sample question uses this rating, so it is the default here; replace it with your lab's transformer if it differs.

**What the student does:** wires the autotransformer, wattmeter, transformer, voltmeters, ammeter and lamp load; applies rated primary voltage (230 V); records V2, I2 and input power from no load to full load while holding V1 at 230 V.

## 2. Apparatus

All apparatus are procedural 3D primitives (boxes, cylinders) with labels, per the architecture doc.

| Id | Type | Label | Ratings | Terminals | Controls |
| --- | --- | --- | --- | --- | --- |
| sup | acSupply | 230 V AC supply with MCB | 230 V, 50 Hz | P, N | ON/OFF switch (default OFF) |
| va | variac1ph | Autotransformer | 230 V in, 0 to 270 V out, 3 kVA | IN\_P, IN\_N, OUT\_P, OUT\_N (IN\_N and OUT\_N are internally common) | knob 0 to 270 V, default 0 |
| wm | wattmeter | Wattmeter | PC 150/300 V, CC 2.5/5/10 A, 150 divisions | M, L, V1, V2 | voltage range, current range selectors |
| tx | transformer1ph | Transformer under test | 2 kVA, 230/115 V, rated I1 = 8.70 A, rated I2 = 17.39 A | P1, P2, S1, S2 | none |
| vp | voltmeter | V primary | 0 to 300 V (AC) | A, B | none |
| vs | voltmeter | V secondary | 0 to 150 V (AC) | A, B | none |
| am | ammeter | A secondary | 0 to 25 A (AC) | IN, OUT | none |
| ld | lampLoad | Lamp bank | 12 lamps, 200 W each at 115 V (2.4 kW total) | A, B | lamps 0 to 12, switched one at a time |

**Rating logic (manual Section 1.2 rule: instrument rating at least 20 percent above the highest value):** 300 V is above 1.2 x 230 = 276 V; 150 V is above 1.2 x 115 = 138 V; 25 A is above 1.2 x 17.39 = 20.9 A. The lamp bank is slightly above the transformer kVA, as the manual requires.

**Known tension:** rated primary current is 8.70 A and the wattmeter top current range is 10 A. The manual asks for a current coil rated at least for the rated primary current; the 20 percent guideline would suggest about 10.4 A. The sim keeps 10 A and warns on overload (Section 8). Check this against your lab's real wattmeters.

## 3. Wiring: accepted netlists

Terminal ids are `componentId.terminalName`. This is **Netlist A** (wattmeter V1 tied to M, which is connection (a) in manual Section 2.3.1 and the one drawn in Fig. 3.1.1):

| Net | Terminals |
| --- | --- |
| N1 | sup.P, va.IN\_P |
| N2 (neutral) | sup.N, va.IN\_N, va.OUT\_N, wm.V2, tx.P2, vp.B |
| N3 | va.OUT\_P, wm.M, wm.V1 |
| N4 | wm.L, tx.P1, vp.A |
| N5 | tx.S1, vs.A, am.IN |
| N6 | am.OUT, ld.A |
| N7 | tx.S2, vs.B, ld.B |

**Netlist B** (connection (b), wattmeter V1 tied to L) differs only here: N3 = va.OUT\_P, wm.M; N4 = wm.L, wm.V1, tx.P1, vp.A. The manual says either connection is acceptable because the coil losses are small, so the validator accepts both. Netlist A is canonical (the solution view draws it).

**Internal links:** only the variac neutral (va.IN\_N and va.OUT\_N). The wattmeter current coil (M to L) and the ammeter (IN to OUT) are NOT internal links: their two ends are separate nets because they are in series.

A correct wiring needs about 14 wires. In the spec data this is `acceptedNetlists: [NET_A, NET_B]`.

## 4. Controls (data)

| Control | Range | Default |
| --- | --- | --- |
| sup.switch | OFF / ON | OFF |
| va.knob | 0 to 270 V, step 1 V (fine step with arrow keys) | 0 |
| wm.vRange | 150 or 300 V | 300 |
| wm.iRange | 2.5, 5, or 10 A | 10 |
| ld.lamps | integer 0 to 12 | 0 |

## 5. Fault patterns

Each pattern is matched against the student nets (Architecture Section 8, step 5). The effect then feeds the physics so the meters behave as on a real bench.

| Id | Trigger | Effect | Feedback text |
| --- | --- | --- | --- |
| wm-cc-reversed | wm.L connected to va.OUT\_P (M and L swapped) | wm reads reversed (pointer goes below zero) | The wattmeter current coil is the wrong way round. M faces the mains, L faces the load. |
| wm-pc-open | wm.V2 not connected to the neutral net | wm reads zero | The wattmeter pressure coil is not across the supply, so it senses no voltage. |
| wm-pc-reversed | wm.V1 connected to neutral net (V1 and V2 swapped) | wm reads reversed | The pressure coil ends are swapped. V1 goes to the live side, V2 to neutral. |
| ammeter-across-secondary | am.IN to tx.S1 and am.OUT to tx.S2 | short: heavy current, MCB trips | The ammeter is across the secondary instead of in series with the load. An ammeter is almost a short circuit. |
| voltmeter-in-series-load | vs.A to tx.S1 and vs.B to ld.A | I2 about 0, ammeter about 0, vs reads V2 no-load | A voltmeter must be connected across what it measures, not in series with the load. |
| voltmeter-in-series-primary | vp.A to wm.L and vp.B to tx.P1 | transformer gets almost no current, V2 about 0 | The primary voltmeter is in series with the transformer. Connect it across the primary winding. |
| live-neutral-short | any student net joining a live net (N1, N3, N4) to the neutral net (N2) | short: MCB trips when switched on | A live terminal is connected to neutral. |
| variac-bypassed | sup.P connected to va.OUT\_P or wm.M | primary voltage fixed at 230 V minus sag, knob has no effect | The autotransformer is bypassed, so you cannot set or hold the primary voltage. |

Voltmeter-in-series faults are stretch goals for the first build.

Generic consequences from open nets (no pattern needed): if the primary path is broken, V2 and wattmeter read zero; if the load path is open, I2 is zero.

## 6. Physics model (transformerLoad)

Parameters (example values, tune later): a = 2, R2eq = 0.15 ohm, X2eq = 0.22 ohm (both referred to secondary), Pi = 20 W at 230 V, Io = 0.35 A, source impedance Rs = 0.3 ohm (supply sag), lamp resistance = 66.125 ohm each (200 W at 115 V).

```ts
function solve(vset: number, nLamps: number) {
  const RL = nLamps === 0 ? Infinity : 66.125 / nLamps;
  let I1 = 0.35;
  let V1 = vset, V1s = vset / 2, I2 = 0;
  for (let k = 0; k < 8; k++) {            // fixed-point iteration for supply sag
    V1 = Math.max(0, vset - I1 * 0.3);
    V1s = V1 / 2;                           // V1 referred to secondary
    I2 = nLamps === 0 ? 0 : V1s / Math.hypot(0.15 + RL, 0.22);
    I1 = Math.hypot(I2 / 2, 0.35 * V1 / 230);
  }
  const V2 = nLamps === 0 ? V1s : I2 * RL;
  const Pout = I2 * I2 * (nLamps === 0 ? 0 : RL);
  const Pcu = I2 * I2 * 0.15;
  const Pi = 20 * (V1 / 230) ** 2;
  const Pin = Pout + Pcu + Pi;             // what the wattmeter measures
  return { V1, I1, V2, I2, Pout, Pin, eta: Pin > 0 ? Pout / Pin : 0 };
}
```

The `ConnectionState` derived from nets decides whether to call this at all, and applies fault effects: for example `primaryEnergised` (supply ON, path through variac, wattmeter CC and tx.P1 to neutral), `wmPcEnergised`, `wmReversed` (CC reversed XOR PC reversed), `loadConnected`, `ammeterInSeries`.

**Reference values for tests** (V1 held at exactly 230 V, no sag, resistive lamp load; approximate, recompute rather than trust to the last digit, tolerance 1 percent):

| Lamps | I2 (A) | V2 (V) | Pout (W) | Pin (W) | Efficiency (%) |
| --- | --- | --- | --- | --- | --- |
| 0 | 0 | 115.0 | 0 | 20 | 0 |
| 5 | 8.60 | 113.7 | 977 | 1008 | 96.9 |
| 10 | 17.00 | 112.4 | 1910 | 1973 | 96.8 |
| 12 | 20.30 | 111.9 | 2271 | 2353 | 96.5 |

At 10 lamps the regulation is about 2.3 percent. Maximum efficiency occurs where copper loss equals iron loss, at x = sqrt(20 / 45.4), about 0.66 of full load (about 11.5 A), where efficiency is about 97.1 percent. With the sag parameter, V1 falls about 2.6 V at full load, so the student must re-adjust the knob; this is the teaching point of manual procedure step (iii).

## 7. Meter model

- Each meter has a fixed per-session gain error drawn once from a class 0.5 band (plus or minus 0.5 percent of full scale). No per-frame noise, so readings are stable.
- Voltmeter and ammeter: shown = true x (1 + gain), pointer angle proportional to shown / range. Pointer pegs at 105 percent of full scale.
- Wattmeter: dial = P / MF, where MF = (voltage range x current range) / 150 divisions (manual Eq. 2.5). At 300 V and 10 A, MF = 20 W per division; at 300 V and 2.5 A, MF = 5 W per division. True power = dial x MF (manual Eq. 2.4).
- A numeric readout under each dial is on by default for the MVP and can be hidden later.

## 8. Runtime events and safety

| Event | Condition | Response |
| --- | --- | --- |
| Wiring while energised | wire added or removed with supply ON | blocked; message: Always shut off power before handling the wiring. |
| Variac not at zero on power-on | supply turned ON with knob above 10 V | warning toast: start the autotransformer from zero |
| Primary overvoltage | V1 above 253 V (110 percent) | warning toast |
| Transformer overload | I2 above 19.1 A warn; above 21.7 A (125 percent) overheating | warning; at 125 percent the run fails |
| Voltmeter overrange | reading above range | pointer pegged, warning; above 150 percent meter damaged (reads zero) |
| Ammeter overrange | I2 above 25 A | pegged, warning; above 37.5 A damaged |
| Wattmeter overrange | I1 above CC range or V1 above PC range | pegged, warning; above 150 percent damaged |
| Short | any fault with effect short | MCB trips, supply switches OFF, message from the fault feedback |

Powering on without a passing check is allowed (consequences apply), matching a real lab where staff check connections before energising.

## 9. Self mode flow and tests

1. Empty bench. Student sets controls and wires terminals.
2. Submit runs validation (Architecture Section 8). Result: success or a fault list.
3. **Feedback policy:** first failure shows the category (for example, the primary side is incomplete) plus any matched fault text. It does not list exact missing wires. Each Hint press reveals the next hint. Show solution draws Netlist A.
4. Success screen: connections correct. (In the MVP free play follows; the full run phase is milestone 4.)

**Progressive hints:**

1. Trace the power path: supply, autotransformer, wattmeter current coil, transformer primary.
2. The wattmeter has two coils. Which one goes in series and which across the supply?
3. Voltmeters go across what they measure. Where does the ammeter go?
4. Everything on the neutral side (supply N, variac common, wattmeter V2, primary second end, primary voltmeter) shares one line.
5. Check the wattmeter M and L: M faces the mains, L faces the load.
6. Specific: show the first open net as a pair of terminals to connect.

**Validation tests required:** Netlist A passes; Netlist B passes; wire order does not matter; one wire missing gives an open net; every fault pattern in Section 5 produces its feedback; wiring blocked while supply ON; the neutral net can be joined through either va.IN\_N or va.OUT\_N.

**Physics tests required:** reference table in Section 6 within 1 percent; dial reading times MF equals true power; sag reduces V1 under load.

## 10. Observation table and report

Manual columns: S.No., Secondary current I2 (A), Secondary voltage V2 (V), Input power P1 (W). The sim adds V1 (V) so the student shows the primary was held at 230 V, and records the wattmeter dial reading and multiplying factor before the true power.

Report: voltage regulation = (V2o - V2fl) / V2rated x 100 (manual Eq. 3.1.1), efficiency = V2 I2 / P1 x 100 for resistive load (manual Eq. 3.1.4), efficiency versus load VA (V2 x I2) curve, and the load for maximum efficiency read off the curve.

## 11. Learn mode steps (data for learnSteps)

Each step: camera preset, focus components, wires drawn, and the popup text (the why).

| # | Camera | Focus | Wires drawn | Popup text |
| --- | --- | --- | --- | --- |
| 1 | overview | all | none | In a load test the transformer is loaded for real, so voltage regulation and efficiency are measured directly instead of calculated from an equivalent circuit. You will record secondary voltage, secondary current and input power from no load up to full load. |
| 2 | overview | sup | none | Switch the supply off before touching any wire, and check instrument ratings: each meter should be rated at least 20 percent above the highest value it will see. Today that means a 300 V primary voltmeter, a 150 V secondary voltmeter and a 25 A ammeter. |
| 3 | supply | sup, va | none | The transformer must be tested at its rated primary voltage, 230 V, and that voltage must be held while the load changes. A variable autotransformer lets you set and re-adjust it. Its kVA rating must be at least that of the transformer under test. |
| 4 | supply | sup, va | sup.P to va.IN\_P; sup.N to va.IN\_N | Supply phase goes to the autotransformer input, and neutral to its common terminal. The common is shared between input and output. |
| 5 | meters | wm | none | The wattmeter has two coils. The current coil (M, L) goes in series because it must carry the primary current. The pressure coil (V1, V2) goes across the supply because it senses voltage. M faces the mains. |
| 6 | meters | wm, va | va.OUT\_P to wm.M; wm.V1 to wm.M; wm.V2 to va.OUT\_N | The variac output feeds M. V1 is tied to M and V2 returns to neutral, so the pressure coil sees the same voltage as the transformer primary. This is connection (a) from the manual, preferred when the circuit voltage is high relative to the current. |
| 7 | transformer | tx | none | Transformer under test: 2 kVA, 230/115 V. Rated currents are about 8.7 A on the 230 V side and 17.4 A on the 115 V side. We energise the 230 V winding at rated voltage and load the 115 V winding. |
| 8 | transformer | wm, tx | wm.L to tx.P1; tx.P2 to va.OUT\_N | The wattmeter current coil feeds the primary, and the primary returns to neutral. The coil is now in series with the primary current. |
| 9 | meters | vp | vp.A to wm.L; vp.B to va.OUT\_N | A voltmeter always goes across what it measures. This one reads the primary voltage so you can set 230 V and keep it there. |
| 10 | load | am, vs | tx.S1 to vs.A; tx.S1 to am.IN; tx.S2 to vs.B | On the secondary the ammeter goes in series with the load and the voltmeter across the secondary terminals ahead of the ammeter, so the voltmeter does not include the ammeter drop. |
| 11 | load | ld | am.OUT to ld.A; ld.B to tx.S2 | The load is a bank of lamps: a resistive load at unity power factor. Its total rating is a little above the transformer kVA so full load can be reached. Lamps are switched in step by step. |
| 12 | supply | sup, va | none (student acts) | Start from zero: knob at 0 V and all lamps off, then switch the supply on. Raise the knob until the primary voltmeter reads 230 V. |
| 13 | meters | wm, vs | none (student acts) | No load: read V2 and the wattmeter. The transformer draws only magnetising current, so the input power is almost entirely iron loss. This power is small, so switch the wattmeter to its lowest current range or the pointer barely moves. |
| 14 | load | ld, vp | none (student acts) | Add load in steps. Each time the primary voltage dips because of the drop in the supply and autotransformer, so re-adjust the knob to hold 230 V before reading V2, I2 and the wattmeter. |
| 15 | meters | wm | none | The wattmeter dial is not in watts. True power = dial reading x multiplying factor, where MF = (voltage range x current range) / full-scale divisions. For 300 V, 10 A and 150 divisions, MF = 20 W per division. |
| 16 | overview | vs | none | Voltage regulation = (V2 no-load - V2 full-load) / V2 rated x 100. Use V2 at no load and V2 at rated secondary current, about 17.4 A. |
| 17 | overview | none | none | Efficiency = V2 x I2 / P1 x 100 for a resistive load. Plotting efficiency against load shows a maximum where copper loss equals iron loss. |

## 12. Changes this spec implies for the architecture doc

- Section 7 (`ExperimentDef`): replace `requiredNets` with `acceptedNetlists: Net[][]` (first one canonical). The validator passes if the student nets match any accepted netlist exactly.
- Section 6 (`ComponentTypeDef`): add `internalLinks?: [string, string][]` (for the variac neutral). Union-find must merge these before checking.
- Section 7 excerpt: Exp 3.1 now uses a lamp bank (not a rheostat) and a 25 A ammeter, as in Section 2 here.
- Section 3 (stack): GSAP is already in the table; use it for camera moves and wire-draw animations.

## 13. Verify before building

These were read from the manual's figures and text and should be checked against the real lab:

- Fig. 3.1.1 appears to draw a single common bottom line. This spec keeps the secondary isolated from the primary neutral. If your lab joins tx.S2 to neutral, the validator needs an allowed-merge rule.
- Wattmeter V1 position (tied to M in the figure) and the accepted variant (tied to L).
- Real wattmeter, voltmeter and ammeter ranges, and whether your lab uses a lamp bank or a rheostat.
- Your transformer's nameplate (the default here is the manual's 2 kVA, 230/115 V example).
- Model parameters in Section 6 are plausible placeholders, not measured values.
