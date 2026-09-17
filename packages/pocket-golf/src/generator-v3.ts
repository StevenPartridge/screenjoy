import { generateV2, validateV2 } from './generator-v2.js';
import type { Hole, HoleSettings } from './course.js';

/** Preserve approved g2 placement; fairway and a smooth rough bank clip water. */
export function generateV3(settings: HoleSettings): Hole {
  const base = generateV2({ ...settings, version: 'g2' });
  const hole: Hole = {
    ...base, version: 'g3', id: base.id.replace(/^g2:/, 'g3:'),
    settings: { ...base.settings, version: 'g3' }, waterRoughBuffer: 4,
  };
  hole.validation = { ...validateV2(hole), attempts: base.validation.attempts, fallback: base.validation.fallback };
  return hole;
}
