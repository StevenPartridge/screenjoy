import { clamp } from '@screenjoy/runtime';

export type Point = { x: number; y: number };
export type Surface = 'rough' | 'fairway' | 'green' | 'water' | 'sand' | 'outside';
export const TEE: Point = { x: 72, y: 210 };
export const CUP: Point = { x: 174, y: 53 };
export const PAR = 4;
export const COLORS: Record<Surface, string> = {
  rough: '#286945', fairway: '#65a94b', green: '#a5c864',
  water: '#348a9b', sand: '#dfbf76', outside: '#286945',
};
export type Blob = {
  kind: 'blob'; x: number; y: number; rx: number; ry: number;
  rotation: number; wobble: number; phase: number;
};
export type Lane = { kind: 'lane'; start: Point; end: Point; startRadius: number; endRadius: number };
export type Patch = Blob | Lane;
export type Layout = 'mixed' | 'straight' | 'bend' | 'dogleg' | 'islands';
export type Hazards = 'mixed' | 'none' | 'water' | 'sand';
export type GeneratorVersion = 'g1' | 'g2' | 'g3';
export type HoleSettings = { version?: GeneratorVersion; seed: string; index: number; layout: Layout; hazards: Hazards };
export type Hole = {
  id: string; version: 'practice' | GeneratorVersion; settings: HoleSettings;
  shape: Exclude<Layout, 'mixed'> | 'practice'; tee: Point; cup: Point; par: number;
  green: Blob; fairway: Patch[]; water: Blob[]; sand: Blob[]; route: Point[];
  waterRoughBuffer?: number;
  validation: { valid: boolean; reasons: string[]; attempts: number; fallback: boolean; approachShots: number; safeRoute: Point[] };
};
export const blob = (x: number, y: number, rx: number, ry: number): Blob =>
  ({ kind: 'blob', x, y, rx, ry, rotation: 0, wobble: 0, phase: 0 });
export const PRACTICE_HOLE: Hole = {
  id: 'practice-1', version: 'practice', settings: { seed: 'practice', index: 0, layout: 'mixed', hazards: 'mixed' },
  shape: 'practice', tee: TEE, cup: CUP, par: PAR,
  green: blob(174, 57, 32, 29),
  sand: [blob(211, 78, 13, 20), blob(151, 91, 17, 9)],
  water: [blob(200, 153, 34, 35), blob(218, 132, 30, 26)],
  fairway: [blob(73, 198, 27, 29), blob(88, 171, 31, 35), blob(115, 144, 34, 29), blob(139, 119, 27, 35), blob(159, 91, 23, 32)],
  route: [TEE, { x: 132, y: 125 }, { x: 171, y: 72 }, CUP],
  validation: { valid: true, reasons: [], attempts: 1, fallback: false, approachShots: 2, safeRoute: [] },
};

export function contains(patch: Patch, p: Point, padding = 0): boolean {
  if (patch.kind === 'lane') {
    const dx = patch.end.x - patch.start.x, dy = patch.end.y - patch.start.y;
    const t = clamp(((p.x - patch.start.x) * dx + (p.y - patch.start.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    const radius = patch.startRadius + (patch.endRadius - patch.startRadius) * t + padding;
    return Math.hypot(p.x - patch.start.x - dx * t, p.y - patch.start.y - dy * t) <= radius;
  }
  const dx = p.x - patch.x, dy = p.y - patch.y;
  const cos = Math.cos(patch.rotation), sin = Math.sin(patch.rotation);
  const x = (dx * cos + dy * sin) / (patch.rx + padding), y = (-dx * sin + dy * cos) / (patch.ry + padding);
  if (!patch.wobble) return x * x + y * y <= 1;
  const angle = Math.atan2(y, x);
  const edge = 1 + patch.wobble * (Math.sin(angle * 3 + patch.phase) + 0.4 * Math.sin(angle * 5 - patch.phase));
  return x * x + y * y <= edge * edge;
}

/** Rendering and contact physics query the same immutable hole geometry. */
export function surfaceAt(p: Point, hole: Hole = PRACTICE_HOLE): Surface {
  if (p.x < 0 || p.y < 0 || p.x >= 256 || p.y >= 256) return 'outside';
  if (contains(hole.green, p)) return 'green';
  if (hole.sand.some(patch => contains(patch, p))) return 'sand';
  const onFairway = hole.fairway.some(patch => contains(patch, p));
  const buffer = hole.waterRoughBuffer ?? 0;
  // Expand the same rounded fairway geometry to cut a rough shoreline into
  // water. Bunkers retain their priority and their approved placement.
  if (buffer > 0 && onFairway) return 'fairway';
  if (hole.water.some(patch => contains(patch, p))) {
    if (buffer > 0 && hole.fairway.some(patch => contains(patch, p, buffer))) return 'rough';
    return 'water';
  }
  if (onFairway) return 'fairway';
  return 'rough';
}
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export function rangeAt(p: Point, hole: Hole = PRACTICE_HOLE) {
  return { rough: 100, fairway: 139, green: 76, sand: 68, water: 0, outside: 0 }[surfaceAt(p, hole)];
}
export function aimAt(ball: Point, target: Point, hole: Hole = PRACTICE_HOLE): Point {
  const distanceToTarget = distance(ball, target);
  const ratio = Math.min(1, rangeAt(ball, hole) / (distanceToTarget || 1));
  return { x: ball.x + (target.x - ball.x) * ratio, y: ball.y + (target.y - ball.y) * ratio };
}
export type Sample = Point & { t: number; height: number };
export type Shot = { samples: Sample[]; landing: Point; end: Point; duration: number; outcome: 'rest' | 'water' | 'outside' | 'cup' };

/** Fixed-step, deterministic carry and roll, used for both prediction and play. */
export function simulateShot(start: Point, target: Point, power?: number, angleError = 0, hole: Hole = PRACTICE_HOLE): Shot {
  const putting = surfaceAt(start, hole) === 'green';
  const range = rangeAt(start, hole);
  const selectedPower = clamp(power ?? distance(start, target) / (range || 1), 0.01, 1);
  const angle = Math.atan2(target.y - start.y, target.x - start.x) + angleError;
  const direction = { x: Math.cos(angle), y: Math.sin(angle) };
  const shotDistance = range * selectedPower;
  let ball = { ...start };
  let landing = { ...start };
  const samples: Sample[] = [{ ...ball, t: 0, height: 0 }];
  let t = 0;
  let outcome: Shot['outcome'] = 'rest';
  if (!putting) {
    const flightTime = 0.7 + selectedPower * 0.8;
    const steps = Math.ceil(flightTime * 120);
    for (let i = 1; i <= steps; i++) {
      const fraction = i / steps;
      t = flightTime * fraction;
      ball = { x: start.x + direction.x * shotDistance * fraction, y: start.y + direction.y * shotDistance * fraction };
      samples.push({ ...ball, t, height: Math.sin(fraction * Math.PI) });
    }
    landing = { ...ball };
  }
  const finish = (): Shot => ({ samples, landing, end: { ...ball }, duration: t, outcome });
  const terrain = surfaceAt(ball, hole);
  if (terrain === 'water' || terrain === 'outside') { outcome = terrain; return finish(); }
  if (distance(ball, hole.cup) <= 2.2) { outcome = 'cup'; ball = { ...hole.cup }; return finish(); }
  if (terrain === 'sand' && !putting) return finish();
  let velocity = putting ? Math.sqrt(2 * 32 * shotDistance) : 15 + selectedPower * 20;
  const dt = 1 / 120;
  for (let step = 0; step < 1800 && velocity > 0; step++) {
    const currentTerrain = surfaceAt(ball, hole);
    const friction = currentTerrain === 'green' ? 32 : currentTerrain === 'fairway' ? 70 : currentTerrain === 'sand' ? 320 : 145;
    const nextVelocity = Math.max(0, velocity - friction * dt);
    const travel = (velocity + nextVelocity) * 0.5 * dt;
    const next = { x: ball.x + direction.x * travel, y: ball.y + direction.y * travel };
    const nextTerrain = surfaceAt(next, hole);
    t += dt;
    // Sweep the cup against the segment, including the last partial step.
    const along = clamp((hole.cup.x - ball.x) * direction.x + (hole.cup.y - ball.y) * direction.y, 0, travel);
    const nearest = { x: ball.x + direction.x * along, y: ball.y + direction.y * along };
    ball = next;
    velocity = nextVelocity;
    if (nextTerrain === 'water' || nextTerrain === 'outside') outcome = nextTerrain;
    else if (distance(nearest, hole.cup) <= 2.2 && velocity < 24) { outcome = 'cup'; ball = { ...hole.cup }; }
    samples.push({ ...ball, t, height: 0 });
    if (outcome !== 'rest') break;
  }
  return finish();
}
export const ACCURACY_CENTER = 0.21;
export const ACCURACY_HALF_WIDTH = 0.12;

export const POWER_START = ACCURACY_CENTER + ACCURACY_HALF_WIDTH;
// Keep the usable 0–100% power sweep at one second, plus preparation time.
export const METER_RATE = 1 - POWER_START;

export function powerAtMeter(position: number) {
  if (position <= POWER_START + Number.EPSILON) return 0;
  return clamp((position - POWER_START) / (1 - POWER_START), 0, 1);
}

export function meterAtPower(power: number) {
  return POWER_START + clamp(power, 0, 1) * (1 - POWER_START);
}

/** Repeating triangular sweep. Time is the accumulated meter travel. */
export function meterPosition(time: number) {
  return 1 - Math.abs(1 - time % 2);
}

export function accuracyAngle(position: number) {
  const offset = ACCURACY_CENTER - position;
  return Math.sign(offset) * clamp(Math.abs(offset) - ACCURACY_HALF_WIDTH, 0, 0.6) / 0.6 * 0.14;
}
