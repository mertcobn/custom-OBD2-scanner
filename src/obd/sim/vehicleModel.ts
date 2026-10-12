/**
 * A small, deterministic "virtual car" used by Demo mode and tests.
 * It drives a repeating urban/suburban cycle and produces physically plausible,
 * mutually consistent readings (rpm follows speed and gear, MAF follows rpm and load, …).
 */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** [target speed km/h, seconds to hold the phase] */
const CYCLE: [number, number][] = [
  [0, 14],
  [48, 22],
  [48, 18],
  [0, 10],
  [0, 6],
  [72, 20],
  [96, 16],
  [96, 24],
  [55, 12],
  [30, 10],
  [0, 10],
];

const GEARS = [3.6, 2.1, 1.4, 1.0, 0.8];
const FINAL_DRIVE = 4.1;
const WHEEL_CIRCUMFERENCE_M = 1.95;
const DISPLACEMENT_L = 1.6;
const AMBIENT = 18;

export const SIM_SUPPORTED = [
  'rpm', 'speed', 'engineLoad', 'absLoad', 'throttle', 'relThrottle', 'pedalD', 'pedalE', 'cmdThrottle',
  'timingAdvance', 'runTime', 'maf', 'map', 'baro', 'coolantTemp', 'intakeTemp', 'ambientTemp', 'oilTemp',
  'catTempB1S1', 'catTempB1S2', 'stftB1', 'ltftB1', 'fuelLevel', 'fuelRate', 'o2VB1S1', 'o2VB1S2',
  'cmdLambda', 'evapPurge', 'evapVaporPressure', 'warmUps', 'moduleVoltage', 'adapterVoltage', 'distanceMil',
  'distanceCleared', 'timeMil', 'timeCleared',
];

export interface VehicleModel {
  /** Advance the simulation. */
  step(dtMs: number): void;
  /** Current value of a signal in base units, or undefined if unsupported. */
  read(id: string): number | undefined;
  /** Simulated engine running state (false = ignition on, engine off). */
  running: boolean;
  elapsedMs: number;
}

export function createVehicleModel(seed = 7): VehicleModel {
  const rnd = mulberry32(seed);
  const noise = (amp: number) => (rnd() * 2 - 1) * amp;

  let elapsed = 0;
  let phase = 0;
  let phaseT = 0;
  let speed = 0; // km/h
  let accel = 0; // km/h per s
  let coolant = 34;
  let oil = 30;
  let cat = 160;
  let fuelLevel = 62.4;
  let distance = 0; // km driven in the sim
  let o2Phase = 0;
  let lastLoad = 22;

  const state: Record<string, number> = {};

  function gearFor(v: number): number {
    if (v < 16) return 0;
    if (v < 32) return 1;
    if (v < 52) return 2;
    if (v < 78) return 3;
    return 4;
  }

  function step(dtMs: number) {
    const dt = dtMs / 1000;
    elapsed += dtMs;
    phaseT += dt;
    const [target, hold] = CYCLE[phase]!;
    if (phaseT > hold) {
      phase = (phase + 1) % CYCLE.length;
      phaseT = 0;
    }

    // Longitudinal dynamics: chase the target speed with limited accel/decel.
    const diff = target - speed;
    const wanted = Math.max(-9, Math.min(7, diff * 0.6));
    accel += (wanted - accel) * Math.min(1, dt * 2);
    speed = Math.max(0, speed + accel * dt);
    if (target === 0 && speed < 0.5) speed = 0;
    distance += (speed / 3600) * dt;

    const moving = speed > 1;
    const gear = gearFor(speed);
    const wheelRpm = ((speed / 3.6) / WHEEL_CIRCUMFERENCE_M) * 60;
    let rpm = moving ? wheelRpm * GEARS[gear]! * FINAL_DRIVE : 0;
    rpm = Math.max(rpm, 790) + noise(12);

    const accelerating = accel > 0.8;
    const braking = accel < -0.8;
    const throttle = braking ? 0 : accelerating ? 22 + accel * 6 + noise(1.5) : moving ? 12 + speed * 0.06 + noise(0.8) : 0;
    const pedal = Math.max(0, throttle * 1.08);
    let load = braking ? 12 : accelerating ? 48 + accel * 5 : moving ? 30 + speed * 0.08 : 22;
    load = Math.max(8, Math.min(98, load + noise(1.2)));
    lastLoad += (load - lastLoad) * Math.min(1, dt * 3);

    const ve = 1.6;
    const maf = ((rpm * DISPLACEMENT_L * 1.2) / 120) * (lastLoad / 100) * ve;
    const map = 28 + lastLoad * 0.72 + noise(0.6);

    // Thermal model.
    const coolantTarget = 90 + Math.sin(elapsed / 40000) * 3;
    coolant += (coolantTarget - coolant) * dt * (coolant < 80 ? 1 / 70 : 1 / 25);
    oil += (coolant + 6 - oil) * dt / 140;
    cat += (380 + lastLoad * 4.2 - cat) * dt / 30;

    // Closed loop fuelling: O2 switches ~1.2 Hz once warm.
    o2Phase += dt * 2 * Math.PI * 1.2;
    const closedLoop = coolant > 45;
    const o2 = closedLoop ? 0.45 + Math.sin(o2Phase) * 0.38 + noise(0.04) : 0.1 + noise(0.02);
    const stft = closedLoop ? Math.sin(o2Phase + 1.3) * 3.2 + noise(0.8) : 0;

    const fuelRate = (maf / 14.7 / 745) * 3600;
    fuelLevel = Math.max(0, fuelLevel - (fuelRate / 3600) * dt * (100 / 50));

    Object.assign(state, {
      rpm,
      speed,
      engineLoad: lastLoad,
      absLoad: lastLoad * 0.92,
      throttle: Math.max(0, throttle + 14.5),
      relThrottle: Math.max(0, throttle),
      pedalD: pedal + 15,
      pedalE: pedal * 0.5 + 7.5,
      cmdThrottle: Math.max(0, throttle),
      timingAdvance: braking ? 2 + noise(1) : accelerating ? 16 + noise(2) : moving ? 28 + noise(2) : 10 + noise(1.5),
      runTime: Math.floor(elapsed / 1000) + 3,
      maf,
      map,
      baro: 101,
      coolantTemp: coolant,
      intakeTemp: AMBIENT + 9 + noise(0.4) + (moving ? -2 : 3),
      ambientTemp: AMBIENT,
      oilTemp: oil,
      catTempB1S1: cat,
      catTempB1S2: cat * 0.82,
      stftB1: stft,
      ltftB1: 4.7,
      fuelLevel,
      fuelRate,
      o2VB1S1: Math.max(0.02, Math.min(1.1, o2)),
      o2VB1S2: 0.68 + noise(0.02),
      cmdLambda: braking ? 1.0 : accelerating ? 0.97 : 1.0,
      evapPurge: closedLoop && moving ? 18 + noise(3) : 0,
      evapVaporPressure: -0.2 + noise(0.02),
      warmUps: 14,
      moduleVoltage: 14.18 + noise(0.04),
      adapterVoltage: 14.1 + noise(0.05),
      distanceMil: 37 + distance,
      distanceCleared: 1243 + distance,
      timeMil: 52 + elapsed / 60000,
      timeCleared: 2930 + elapsed / 60000,
    });
  }

  step(0);

  return {
    step,
    read: (id) => (SIM_SUPPORTED.includes(id) ? state[id] : undefined),
    running: true,
    get elapsedMs() {
      return elapsed;
    },
  };
}
