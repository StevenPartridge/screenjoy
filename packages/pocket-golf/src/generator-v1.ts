import { createRandom, seedFrom, clamp } from '@screenjoy/runtime';
import { blob, contains, distance, surfaceAt, simulateShot, type Blob, type Hole, type HoleSettings, type Layout, type Hazards, type Point } from './course.js';

export const LAYOUTS: readonly Layout[] = ['mixed', 'straight', 'bend', 'dogleg', 'islands'];
export const HAZARDS: readonly Hazards[] = ['mixed', 'none', 'water', 'sand'];
export const DEFAULT_SETTINGS: HoleSettings = { seed: 'greenskeeper', index: 0, layout: 'mixed', hazards: 'mixed' };
export function normalizeSettings(settings: Partial<HoleSettings>): HoleSettings {
  return {
    seed: typeof settings.seed === 'string' && settings.seed.trim() ? settings.seed.trim().slice(0, 80) : DEFAULT_SETTINGS.seed,
    index: Number.isSafeInteger(settings.index) ? clamp(settings.index!, 0, 999999) : 0,
    layout: LAYOUTS.includes(settings.layout!) ? settings.layout! : 'mixed',
    hazards: HAZARDS.includes(settings.hazards!) ? settings.hazards! : 'mixed',
  };
}
export function holeAddress(settings: HoleSettings) {
  const s = normalizeSettings(settings);
  return `g1:${encodeURIComponent(s.seed)}:${s.index}:${s.layout}:${s.hazards}`;
}
export function settingsFromAddress(address: string): HoleSettings | null {
  try {
    const [version, seed, index, layout, hazards, extra] = address.split(':');
    if (version !== 'g1' || extra !== undefined || !seed || !/^\d{1,6}$/.test(index) ||
        !LAYOUTS.includes(layout as Layout) || !HAZARDS.includes(hazards as Hazards)) return null;
    const decoded = decodeURIComponent(seed);
    if (!decoded.trim() || decoded.length > 80) return null;
    return { seed: decoded, index: Number(index), layout: layout as Layout, hazards: hazards as Hazards };
  } catch { return null; }
}

type Random = () => number;
function makeCandidate(settings: HoleSettings, random: Random): Hole {
  const between = (a: number, b: number) => a + random() * (b - a);
  const choice = random();
  const shape = settings.layout === 'mixed' ? choice < .35 ? 'straight' : choice < .6 ? 'bend' : choice < .85 ? 'dogleg' : 'islands' : settings.layout;
  const turn = between(-0.16, 0.16), mirror = random() < .5 ? -1 : 1;
  const transform = (p: Point): Point => {
    const x = (p.x - 128) * mirror, y = p.y - 128;
    return { x: 128 + x * Math.cos(turn) - y * Math.sin(turn), y: 128 + x * Math.sin(turn) + y * Math.cos(turn) };
  };
  let centers: Point[];
  if (shape === 'straight') {
    const x = between(98, 150), top = x + between(-22, 22);
    centers = [{ x, y: between(197, 211) }, { x: (x + top) / 2 + between(-7, 7), y: 132 }, { x: top, y: between(46, 64) }];
  } else if (shape === 'bend') {
    centers = [{ x: between(66, 83), y: 204 }, { x: 93, y: 153 }, { x: 153, y: 118 }, { x: between(164, 183), y: between(46, 61) }];
  } else if (shape === 'dogleg') {
    centers = [{ x: between(60, 76), y: 205 }, { x: between(59, 77), y: between(94, 113) }, { x: between(177, 191), y: 51 }];
  } else {
    centers = [{ x: between(61, 78), y: 205 }, { x: between(85, 103), y: 141 }, { x: between(153, 175), y: 111 }, { x: between(165, 181), y: 48 }];
  }
  centers = centers.map(transform);
  const tee = centers[0], end = centers[centers.length - 1];
  const green = { ...blob(end.x, end.y, between(25, 30), between(24, 29)), rotation: turn, wobble: between(.025, .055), phase: between(0, Math.PI * 2) };
  const cup = { x: end.x + between(-5, 5), y: end.y + between(-5, 5) };
  const fairway: Hole['fairway'] = [];
  const widths = centers.map((_, i) => i === 0 ? between(17, 21) : between(18, 25));
  if (shape === 'islands') {
    centers.slice(0, -1).forEach((p, i) => fairway.push({ ...blob(p.x, p.y, widths[i], widths[i] * between(1, 1.2)), rotation: turn, wobble: .08, phase: between(0, 6.28) }));
  } else {
    for (let i = 0; i < centers.length - 1; i++) {
      fairway.push({ kind: 'lane', start: centers[i], end: centers[i + 1], startRadius: widths[i], endRadius: widths[i + 1] });
      if (i > 0) fairway.push({ ...blob(centers[i].x, centers[i].y, widths[i] * 1.15, widths[i]), wobble: .08, phase: between(0, 6.28) });
    }
  }
  const hole: Hole = {
    id: holeAddress(settings), version: 'g1', settings, shape, tee, cup, par: 4, green, fairway,
    water: [], sand: [], route: [...centers.slice(0, -1), { x: green.x, y: green.y }],
    validation: { valid: false, reasons: [], attempts: 0, fallback: false, approachShots: 0, safeRoute: [] },
  };
  // Keep a generous landing pocket at every route waypoint. Hazards may trim
  // a fairway edge, but cannot erase a landing or intrude into the green.
  const canPlace = (patch: Blob) => {
    const reach = Math.max(patch.rx, patch.ry) * 1.15;
    if (patch.x - reach < 8 || patch.x + reach > 248 || patch.y - reach < 8 || patch.y + reach > 248) return false;
    if (hole.route.some(p => distance(p, patch) < reach + 15)) return false;
    if (distance(green, patch) < reach + Math.max(green.rx, green.ry) + 2) return false;
    return ![...hole.water, ...hole.sand].some(p => distance(p, patch) < reach + Math.max(p.rx, p.ry) * 1.15 + 3);
  };
  const wantWater = settings.hazards === 'water' || (settings.hazards === 'mixed' && random() < .6);
  const sandCount = settings.hazards === 'sand' ? 1 + Math.floor(random() * 2) : settings.hazards === 'mixed' ? Math.floor(random() * 3) : 0;
  if (wantWater) {
    const count = random() < .35 ? 2 : 1;
    for (let i = 0; i < count; i++) for (let attempt = 0; attempt < 60; attempt++) {
      let p: Point;
      if (shape === 'islands' && attempt < 12) {
        p = { x: (centers[1].x + centers[2].x) / 2, y: (centers[1].y + centers[2].y) / 2 + between(-8, 8) };
      } else if (shape === 'dogleg' && attempt < 12) {
        p = { x: (tee.x + end.x) / 2 + between(-12, 12), y: (tee.y + end.y) / 2 + between(-12, 12) };
      } else p = { x: between(35, 221), y: between(35, 220) };
      const patch = { ...blob(p.x, p.y, between(15, 29), between(13, 25)), rotation: between(0, 3.14), wobble: .1, phase: between(0, 6.28) };
      if (canPlace(patch)) { hole.water.push(patch); break; }
    }
  }
  for (let i = 0; i < sandCount; i++) for (let attempt = 0; attempt < 60; attempt++) {
    const angle = between(0, Math.PI * 2), radius = between(43, 58);
    const patch = { ...blob(green.x + Math.cos(angle) * radius, green.y + Math.sin(angle) * radius, between(8, 13), between(6, 10)), rotation: angle, wobble: .1, phase: between(0, 6.28) };
    if (canPlace(patch)) { hole.sand.push(patch); break; }
  }
  return hole;
}

/** Find a playable sequence with the actual carry, roll and landing rules. */
export function validateHole(hole: Hole): Hole['validation'] {
  const reasons: string[] = [];
  if (surfaceAt(hole.tee, hole) !== 'fairway') reasons.push('Tee must be on fairway');
  if (surfaceAt(hole.cup, hole) !== 'green') reasons.push('Cup must be on green');
  for (let i = 0; i < 16; i++) {
    const p = { x: hole.cup.x + Math.cos(i * Math.PI / 8) * 8, y: hole.cup.y + Math.sin(i * Math.PI / 8) * 8 };
    if (surfaceAt(p, hole) !== 'green') { reasons.push('Cup needs green on every side'); break; }
  }
  if (hole.settings.hazards === 'water' && !hole.water.length) reasons.push('Requested water is missing');
  if (hole.settings.hazards === 'sand' && !hole.sand.length) reasons.push('Requested sand is missing');
  if (hole.settings.hazards === 'none' && (hole.water.length || hole.sand.length)) reasons.push('Unexpected hazard');
  if (hole.sand.length > 2) reasons.push('Too many bunkers');
  // Sampling all patch outlines also catches rotation and wobble near an edge.
  for (const patch of [hole.green, ...hole.water, ...hole.sand, ...hole.fairway.filter(p => p.kind === 'blob')]) {
    for (let y = -40; y <= 40; y += 2) for (let x = -40; x <= 40; x += 2) {
      const p = { x: patch.x + x, y: patch.y + y };
      if (contains(patch, p) && (p.x < 6 || p.x > 250 || p.y < 6 || p.y > 250)) reasons.push('Terrain too close to the edge');
    }
  }
  let current = { ...hole.tee };
  const safeRoute: Point[] = [{ ...current }];
  let shots = 0;
  // Advance to the furthest reachable authored landing pocket. A 14-unit
  // undershoot leaves room for the approved short roll instead of requiring
  // every landing to hit a perfect single point.
  for (let step = 0; step < hole.route.length + 2 && surfaceAt(current, hole) !== 'green'; step++) {
    let best: { point: Point; progress: number } | undefined;
    const currentProgress = safeRoute.length === 1 ? 0 : nearestRouteIndex(hole.route, current);
    for (let i = hole.route.length - 1; i > currentProgress; i--) {
      const destination = hole.route[i];
      const length = distance(current, destination);
      if (length > 134 || length < 8) continue;
      for (const short of [9, 5, 14]) {
        const target = { x: current.x + (destination.x - current.x) * (length - short) / length, y: current.y + (destination.y - current.y) * (length - short) / length };
        const shot = simulateShot(current, target, undefined, 0, hole);
        if (shot.outcome === 'water' || shot.outcome === 'outside') continue;
        const ground = surfaceAt(shot.end, hole);
        if ((ground !== 'fairway' && ground !== 'green') || distance(shot.end, destination) > 16) continue;
        const safeMargin = [0, 1, 2, 3].every(n => {
          const p = { x: shot.end.x + Math.cos(n * Math.PI / 2) * 6, y: shot.end.y + Math.sin(n * Math.PI / 2) * 6 };
          return ['fairway', 'green'].includes(surfaceAt(p, hole));
        });
        if (safeMargin) { best = { point: shot.end, progress: i }; break; }
      }
      if (best) break;
    }
    if (!best) break;
    current = best.point; safeRoute.push(current); shots++;
  }
  if (surfaceAt(current, hole) !== 'green') reasons.push('No safe sequence of approach shots found');
  return { valid: reasons.length === 0, reasons: [...new Set(reasons)], attempts: 1, fallback: false, approachShots: shots, safeRoute };
}
function nearestRouteIndex(route: Point[], p: Point) {
  let index = 0;
  route.forEach((point, i) => { if (distance(point, p) < distance(route[index], p)) index = i; });
  return index;
}

export function generateHole(input: Partial<HoleSettings> = {}): Hole {
  const settings = normalizeSettings({ ...DEFAULT_SETTINGS, ...input });
  const random = createRandom(seedFrom(holeAddress(settings)));
  for (let attempt = 1; attempt <= 24; attempt++) {
    const hole = makeCandidate(settings, random);
    hole.validation = { ...validateHole(hole), attempts: attempt };
    if (hole.validation.valid) { hole.par = clamp(hole.validation.approachShots + 2, 3, 5); return hole; }
  }
  // A bounded, deterministic fallback with the requested hazards still present.
  const tee = { x: 105, y: 204 }, cup = { x: 105, y: 52 };
  const hole: Hole = {
    id: holeAddress(settings), version: 'g1', settings, shape: 'straight', tee, cup, par: 4,
    green: blob(cup.x, cup.y, 28, 27),
    fairway: [{ kind: 'lane', start: tee, end: cup, startRadius: 21, endRadius: 22 }],
    sand: settings.hazards === 'sand' || settings.hazards === 'mixed' ? [blob(150, 77, 10, 8)] : [],
    water: settings.hazards === 'water' || settings.hazards === 'mixed' ? [blob(191, 142, 23, 28)] : [],
    route: [tee, { x: 105, y: 126 }, cup],
    validation: { valid: false, reasons: [], attempts: 25, fallback: true, approachShots: 2, safeRoute: [] },
  };
  hole.validation = { ...validateHole(hole), attempts: 25, fallback: true };
  hole.par = clamp(hole.validation.approachShots + 2, 3, 5);
  return hole;
}
