import { seedFrom } from '@screenjoy/runtime';
import { settingsFromAddress } from './generator.js';
import type { Hole } from './course.js';
import type { HoleSnapshot } from './pocket-golf.js';

export const REVIEW_STORAGE_KEY = 'screenjoy:golf-generation-reviews:v1';
export const REVIEW_TAGS = ['Fairway shape', 'Hazard placement', 'Too easy', 'Too hard', 'Putting green', 'Visual glitch'] as const;
export type Verdict = 'keep' | 'tweak' | 'broken';
export type HoleReview = {
  id: string; address: string; fingerprint: string; createdAt: string; verdict: Verdict;
  tags: string[]; note: string;
  summary: { shape: string; par: number; water: number; sand: number; fallback: boolean };
  snapshot: HoleSnapshot | null;
};
export function holeFingerprint(hole: Hole) {
  const { tee, cup, green, fairway, water, sand, par } = hole;
  const terrainRules = hole.waterRoughBuffer ? { waterRoughBuffer: hole.waterRoughBuffer } : {};
  return seedFrom(JSON.stringify({ tee, cup, green, fairway, water, sand, par, ...terrainRules })).toString(16).padStart(8, '0');
}
export function createReview(hole: Hole, snapshot: HoleSnapshot | null, verdict: Verdict, tags: string[], note: string): HoleReview {
  return {
    id: crypto.randomUUID(), address: hole.id, fingerprint: holeFingerprint(hole), createdAt: new Date().toISOString(), verdict,
    tags: [...new Set(tags.filter(tag => REVIEW_TAGS.includes(tag as typeof REVIEW_TAGS[number])))], note: note.trim().slice(0, 4000),
    summary: { shape: hole.shape, par: hole.par, water: hole.water.length, sand: hole.sand.length, fallback: hole.validation.fallback },
    snapshot: snapshot?.holeId === hole.id ? structuredClone(snapshot) : null,
  };
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object';
const point = (value: unknown) => object(value) && typeof value.x === 'number' && Number.isFinite(value.x) && typeof value.y === 'number' && Number.isFinite(value.y);
function validSnapshot(value: unknown, address: string): boolean {
  if (value === null) return true;
  if (!object(value) || value.holeId !== address || !point(value.ball) || !Number.isSafeInteger(value.strokes) || Number(value.strokes) < 0 ||
      !['hole', 'green'].includes(String(value.view)) || !['aim', 'power', 'accuracy', 'travel', 'fade', 'complete'].includes(String(value.phase))) return false;
  if (value.lastShot === null) return true;
  const shot = value.lastShot;
  return object(shot) && point(shot.start) && point(shot.target) && point(shot.end) && typeof shot.power === 'number' && shot.power >= 0 && shot.power <= 1 &&
    typeof shot.angle === 'number' && Number.isFinite(shot.angle) && ['rest', 'water', 'outside', 'cup'].includes(String(shot.outcome));
}
/** Discard malformed records individually, preserving valid local feedback. */
export function parseReviews(raw: string | null): HoleReview[] {
  try {
    const data: unknown = JSON.parse(raw ?? '[]');
    if (!Array.isArray(data)) return [];
    return data.filter((item): item is HoleReview => {
      if (!object(item) || typeof item.id !== 'string' || item.id.length > 100 || typeof item.address !== 'string' || !settingsFromAddress(item.address) ||
          typeof item.fingerprint !== 'string' || !/^[a-f0-9]{8}$/.test(item.fingerprint) || typeof item.createdAt !== 'string' || !Number.isFinite(Date.parse(item.createdAt)) ||
          !['keep', 'tweak', 'broken'].includes(String(item.verdict)) || typeof item.note !== 'string' || item.note.length > 4000 ||
          !Array.isArray(item.tags) || !item.tags.every(tag => REVIEW_TAGS.includes(tag)) || !validSnapshot(item.snapshot, item.address)) return false;
      const summary = item.summary;
      return object(summary) && ['straight', 'bend', 'dogleg', 'islands'].includes(String(summary.shape)) &&
        Number.isInteger(summary.par) && Number(summary.par) >= 3 && Number(summary.par) <= 5 &&
        Number.isInteger(summary.water) && Number(summary.water) >= 0 && Number(summary.water) <= 2 &&
        Number.isInteger(summary.sand) && Number(summary.sand) >= 0 && Number(summary.sand) <= 2 && typeof summary.fallback === 'boolean';
    });
  } catch { return []; }
}
export function reviewText(review: HoleReview, origin: string) {
  const url = new URL('/golf/lab', origin); url.searchParams.set('hole', review.address);
  return [
    `Pocket golf feedback · ${review.verdict === 'keep' ? 'Keep it' : review.verdict === 'tweak' ? 'Needs tuning' : 'Broken'}`,
    `Hole: ${review.address}`, `Replay: ${url.href}`, `Geometry: ${review.fingerprint}`,
    `Layout: ${review.summary.shape} · Par ${review.summary.par} · Water ${review.summary.water} · Sand ${review.summary.sand}${review.summary.fallback ? ' · Fallback layout' : ''}`,
    review.tags.length ? `Tags: ${review.tags.join(', ')}` : '', review.note ? `Notes: ${review.note}` : '',
    review.snapshot ? `Play state: ${JSON.stringify(review.snapshot)}` : '',
  ].filter(Boolean).join('\n');
}
