export const SCORE_STORAGE_KEY = 'screenjoy:pocket-golf:score:v1';
export type GolfTotals = { version: 1; score: number; holes: number };
type ScoreStorage = Pick<Storage, 'getItem' | 'setItem'>;
const empty = (): GolfTotals => ({ version: 1, score: 0, holes: 0 });

export function parseTotals(raw: string | null): GolfTotals | null {
  try {
    const value = JSON.parse(raw ?? 'null');
    if (value?.version !== 1 || !Number.isSafeInteger(value.score) ||
      !Number.isSafeInteger(value.holes) || value.holes < 0 || (value.holes === 0 && value.score !== 0)) return null;
    return { version: 1, score: value.score, holes: value.holes };
  } catch { return null; }
}

/** One record updates both totals together; blocked storage retains session totals. */
export class GolfScores {
  private memory = empty();
  private unavailable = false;
  constructor(private readonly storage: () => ScoreStorage | null) {}
  get saved() { return !this.unavailable; }
  read(): GolfTotals {
    if (!this.unavailable) {
      try {
        const storage = this.storage();
        if (!storage) this.unavailable = true;
        else this.memory = parseTotals(storage.getItem(SCORE_STORAGE_KEY)) ?? this.memory;
      } catch { this.unavailable = true; }
    }
    return { ...this.memory };
  }
  complete(strokes: number, par: number): GolfTotals {
    if (!Number.isSafeInteger(strokes) || strokes < 1 || !Number.isSafeInteger(par) || par < 1) throw new Error('Invalid completed hole');
    const previous = this.read();
    const next: GolfTotals = { version: 1, score: previous.score + strokes - par, holes: previous.holes + 1 };
    if (!Number.isSafeInteger(next.score) || !Number.isSafeInteger(next.holes)) return previous;
    this.memory = next;
    if (!this.unavailable) {
      try { this.storage()!.setItem(SCORE_STORAGE_KEY, JSON.stringify(next)); }
      catch { this.unavailable = true; }
    }
    return { ...next };
  }
}

export const lifetimeScores = new GolfScores(() => globalThis.localStorage);
export function holeResult(strokes: number, par: number) {
  const delta = strokes - par;
  const name = strokes === 1 ? 'Hole in one' : delta === -3 ? 'Albatross' : delta === -2 ? 'Eagle' :
    delta === -1 ? 'Birdie' : delta === 0 ? 'Par' : delta === 1 ? 'Bogey' : delta === 2 ? 'Double bogey' :
    delta === 3 ? 'Triple bogey' : `${strokes} strokes`;
  return `${name} · ${delta > 0 ? '+' : ''}${delta}`;
}
