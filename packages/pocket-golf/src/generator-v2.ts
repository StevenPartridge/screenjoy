import { createRandom, seedFrom } from '@screenjoy/runtime';
import { generateHole as generateV1, validateHole as validateV1 } from './generator-v1.js';
import { blob, contains, type Blob, type Hole, type HoleSettings, type Point } from './course.js';

const TAU = Math.PI * 2;
function bounds(p: Blob) {
  const cos = Math.cos(p.rotation), sin = Math.sin(p.rotation);
  const factor = 1 + p.wobble * 1.4;
  const x = Math.hypot(p.rx * cos, p.ry * sin) * factor;
  const y = Math.hypot(p.rx * sin, p.ry * cos) * factor;
  return { left: p.x - x, right: p.x + x, top: p.y - y, bottom: p.y + y };
}
function overlaps(a: Blob, b: Blob) {
  const aa = bounds(a), bb = bounds(b);
  const left = Math.max(aa.left, bb.left), right = Math.min(aa.right, bb.right);
  const top = Math.max(aa.top, bb.top), bottom = Math.min(aa.bottom, bb.bottom);
  for (let y = top; y <= bottom; y += 1) for (let x = left; x <= right; x += 1) {
    if (contains(a, { x, y }) && contains(b, { x, y })) return true;
  }
  return false;
}
function protects(patch: Blob, center: Point, radius: number) {
  if (contains(patch, center)) return false;
  for (let n = 0; n < 24; n++) {
    if (contains(patch, { x: center.x + Math.cos(n * TAU / 24) * radius, y: center.y + Math.sin(n * TAU / 24) * radius })) return false;
  }
  return true;
}
function greenEdge(green: Blob, angle: number): number {
  let radius = 0;
  while (radius < 50 && contains(green, { x: green.x + Math.cos(angle) * radius, y: green.y + Math.sin(angle) * radius })) radius += .25;
  return radius;
}

/** Larger edge water is intentional; the green and fairway still need to fit. */
export function validateV2(hole: Hole): Hole['validation'] {
  const checked = validateV1(hole);
  if (!checked.reasons.includes('Terrain too close to the edge')) return checked;
  const inland = validateV1({ ...hole, water: [] });
  if (inland.reasons.includes('Terrain too close to the edge')) return checked;
  const reasons = checked.reasons.filter(reason => reason !== 'Terrain too close to the edge');
  return { ...checked, valid: reasons.length === 0, reasons };
}

/** Keep the g1 tee, fairway, cup and green for direct hazard comparisons. */
export function generateV2(settings: HoleSettings): Hole {
  const base = generateV1(settings);
  const hole: Hole = { ...base, version: 'g2', settings: { ...base.settings, version: 'g2' }, id: base.id.replace(/^g1:/, 'g2:'), water: [], sand: [] };
  const random = createRandom(seedFrom(`${hole.id}:hazards`));
  const between = (a: number, b: number) => a + random() * (b - a);
  const approach = base.route[base.route.length - 2];
  const approachAngle = Math.atan2(approach.y - hole.green.y, approach.x - hole.green.x);
  const safeLandings = base.validation.safeRoute;
  const canPlace = (patch: Blob, kind: 'sand' | 'water') => {
    const box = bounds(patch);
    if (kind === 'sand' && (box.left < 6 || box.right > 250 || box.top < 6 || box.bottom > 250)) return false;
    if (!protects(patch, hole.tee, 17) || !protects(patch, hole.cup, 12)) return false;
    if (safeLandings.some(p => !protects(patch, p, 9))) return false;
    if (overlaps(patch, hole.green)) return false;
    return ![...hole.water, ...hole.sand].some(p => overlaps(patch, p));
  };

  // Tangential bunkers hug the actual irregular green boundary. Most guard
  // the two approach shoulders, with a few perimeter placements for variety.
  for (let i = 0; i < base.sand.length; i++) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const side = i === 0 ? random() < .5 ? -1 : 1 : -1;
      const angle = attempt < 65 ? approachAngle + side * between(.55, 1.3) : between(0, TAU);
      const depth = between(6.5, 9.5);
      const radius = greenEdge(hole.green, angle) + depth + between(.6, 2.4);
      const patch = { ...blob(hole.green.x + Math.cos(angle) * radius, hole.green.y + Math.sin(angle) * radius, between(11, 17), depth), rotation: angle + Math.PI / 2, wobble: .08, phase: between(0, TAU) };
      if (!canPlace(patch, 'sand')) continue;
      const candidate = { ...hole, sand: [...hole.sand, patch] };
      if (validateV2(candidate).reasons.some(reason => reason === 'No safe sequence of approach shots found')) continue;
      hole.sand.push(patch); break;
    }
  }

  if (base.water.length) {
    const route = base.route;
    const forward = Math.atan2(hole.green.y - hole.tee.y, hole.green.x - hole.tee.x);
    const oldArea = base.water.reduce((sum, p) => sum + p.rx * p.ry, 0);
    for (let attempt = 0; attempt < 180; attempt++) {
      let center: Point, rotation: number;
      if (hole.shape === 'islands' && attempt < 55) {
        const a = route[1], b = route[2];
        center = { x: (a.x + b.x) / 2 + between(-5, 5), y: (a.y + b.y) / 2 + between(-6, 6) };
        rotation = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
      } else if (hole.shape === 'dogleg' && attempt < 55) {
        center = { x: (hole.tee.x + hole.green.x) / 2 + between(-10, 10), y: (hole.tee.y + hole.green.y) / 2 + between(-8, 8) };
        rotation = forward;
      } else {
        const side = random() < .5 ? -1 : 1, along = between(.28, .62), offset = between(49, 75);
        center = { x: hole.tee.x + (hole.green.x - hole.tee.x) * along + Math.cos(forward + Math.PI / 2) * offset * side,
          y: hole.tee.y + (hole.green.y - hole.tee.y) * along + Math.sin(forward + Math.PI / 2) * offset * side };
        rotation = forward + between(-.18, .18);
      }
      const patch = { ...blob(center.x, center.y, between(43, 61), between(22, 33)), rotation, wobble: .1, phase: between(0, TAU) };
      if (patch.rx * patch.ry < Math.max(1050, oldArea * 1.08)) continue;
      // Keep the lake's center on screen so a clipped sliver cannot stand in
      // for the larger water feature being requested.
      if (patch.x < 20 || patch.x > 236 || patch.y < 25 || patch.y > 231 || !canPlace(patch, 'water')) continue;
      const candidate = { ...hole, water: [patch] };
      if (!validateV2(candidate).valid) continue;
      hole.water = [patch]; break;
    }
  }
  hole.validation = { ...validateV2(hole), attempts: base.validation.attempts, fallback: base.validation.fallback };
  // An unusual seed must remain playable. Keep the original hazards if no
  // replacement fits, label the fallback, and preserve its replay address.
  if (!hole.validation.valid || (base.sand.length && !hole.sand.length) || (base.water.length && !hole.water.length)) {
    hole.water = base.water; hole.sand = base.sand;
    hole.validation = { ...validateV2(hole), attempts: base.validation.attempts, fallback: true };
  }
  return hole;
}
