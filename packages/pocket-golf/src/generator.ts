import { normalizeSettings as normalizeV1, settingsFromAddress as parseV1, generateHole as generateV1, validateHole as validateV1 } from './generator-v1.js';
import { generateV2, validateV2 } from './generator-v2.js';
import { generateV3 } from './generator-v3.js';
import type { Hole, HoleSettings } from './course.js';
export { LAYOUTS, HAZARDS } from './generator-v1.js';

export const DEFAULT_SETTINGS: HoleSettings = { version: 'g3', seed: 'greenskeeper', index: 0, layout: 'mixed', hazards: 'mixed' };
export function normalizeSettings(settings: Partial<HoleSettings>): HoleSettings {
  return { ...normalizeV1(settings), version: settings.version === 'g1' || settings.version === 'g2' ? settings.version : 'g3' };
}
export function holeAddress(settings: HoleSettings) {
  const s = normalizeSettings(settings);
  return `${s.version}:${encodeURIComponent(s.seed)}:${s.index}:${s.layout}:${s.hazards}`;
}
export function settingsFromAddress(address: string): HoleSettings | null {
  const version = address.split(':')[0];
  if (version !== 'g1' && version !== 'g2' && version !== 'g3') return null;
  const settings = parseV1(`g1${address.slice(2)}`);
  return settings ? { ...settings, version } : null;
}
export function generateHole(input: Partial<HoleSettings> = {}): Hole {
  const settings = normalizeSettings({ ...DEFAULT_SETTINGS, ...input });
  if (settings.version === 'g3') return generateV3(settings);
  if (settings.version === 'g2') return generateV2(settings);
  const hole = generateV1(settings);
  return { ...hole, settings: { ...hole.settings, version: 'g1' } };
}
export function validateHole(hole: Hole) {
  return hole.version === 'g2' || hole.version === 'g3' ? validateV2(hole) : validateV1(hole);
}
