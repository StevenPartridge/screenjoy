import {
  CanvasSaverElement,
  clamp,
  createRandom,
  seedFrom,
} from "@screenjoy/runtime";

const TAG_NAME = "game-of-life";
const MAX_GENERATIONS = 1_200;
const MAX_TRACKED_STATES = 512;
const MIN_LOOP_HOLD_GENERATIONS = 18;
const MAX_LOOP_HOLD_GENERATIONS = 60;

export type LifeStep = {
  changed: number;
  population: number;
};

export type GameOfLifeSeedChangeDetail = {
  seed: number;
};

function formatLifeStateKey(
  cellCount: number,
  population: number,
  first: number,
  second: number,
) {
  return `${cellCount}:${population}:${first >>> 0}:${second >>> 0}`;
}

/** Hash only alive/dead state so cell ages do not hide a repeating pattern. */
export function lifeStateKey(cells: Uint8Array): string {
  let first = 2166136261;
  let second = 0x9e3779b9;
  let population = 0;

  for (let index = 0; index < cells.length; index += 1) {
    if (cells[index] === 0) continue;
    const position = index + 1;
    population += 1;
    first = Math.imul(first ^ position, 16777619);
    second = Math.imul(
      second ^ Math.imul(position, 0x45d9f3b),
      0x27d4eb2d,
    );
  }

  return formatLifeStateKey(cells.length, population, first, second);
}

/** Advance one generation using Conway's B3/S23 rules on a wrapping grid. */
export function stepLifeGrid(
  current: Uint8Array,
  next: Uint8Array,
  columns: number,
  rows: number,
): LifeStep {
  let changed = 0;
  let population = 0;

  for (let y = 0; y < rows; y += 1) {
    const north = y === 0 ? rows - 1 : y - 1;
    const south = y === rows - 1 ? 0 : y + 1;

    for (let x = 0; x < columns; x += 1) {
      const west = x === 0 ? columns - 1 : x - 1;
      const east = x === columns - 1 ? 0 : x + 1;
      const index = y * columns + x;
      const alive = current[index] > 0;
      const neighbors =
        Number(current[north * columns + west] > 0) +
        Number(current[north * columns + x] > 0) +
        Number(current[north * columns + east] > 0) +
        Number(current[y * columns + west] > 0) +
        Number(current[y * columns + east] > 0) +
        Number(current[south * columns + west] > 0) +
        Number(current[south * columns + x] > 0) +
        Number(current[south * columns + east] > 0);
      const survives = alive && (neighbors === 2 || neighbors === 3);
      const born = !alive && neighbors === 3;

      if (survives || born) {
        next[index] = survives ? Math.min(255, current[index] + 1) : 1;
        population += 1;
      } else {
        next[index] = 0;
      }

      if (alive !== (next[index] > 0)) changed += 1;
    }
  }

  return { changed, population };
}

export class GameOfLifeElement extends CanvasSaverElement {
  static observedAttributes = [
    ...CanvasSaverElement.observedAttributes,
    "seed",
    "speed",
    "density",
  ];

  private columns = 0;
  private rows = 0;
  private cells = new Uint8Array();
  private nextCells = new Uint8Array();
  private trails = new Uint8Array();
  private accumulator = 0;
  private generation = 0;
  private population = 0;
  private stillGenerations = 0;
  private sparseGenerations = 0;
  private sceneSeed = 1;
  private advancingSeed = false;
  private stateHistory = new Map<string, number>();
  private stateOrder: string[] = [];
  private loopDetectedAt = -1;
  private loopPeriod = 0;
  private needsDraw = true;

  constructor() {
    super();
    this.canvas.style.imageRendering = "auto";
  }

  regenerate(seed?: string | number) {
    this.setAttribute(
      "seed",
      String(seed ?? Math.floor(Math.random() * 999999)),
    );
  }

  get speed(): number {
    return clamp(Number(this.getAttribute("speed") ?? 1) || 1, 0.25, 3);
  }

  set speed(value: number | string | null | undefined) {
    if (value === null || value === undefined || value === "") {
      this.removeAttribute("speed");
      return;
    }
    this.setAttribute("speed", String(clamp(Number(value) || 1, 0.25, 3)));
  }

  get density(): number {
    return clamp(Number(this.getAttribute("density") ?? 0.28) || 0.28, 0.12, 0.48);
  }

  set density(value: number | string | null | undefined) {
    if (value === null || value === undefined || value === "") {
      this.removeAttribute("density");
      return;
    }
    this.setAttribute(
      "density",
      String(clamp(Number(value) || 0.28, 0.12, 0.48)),
    );
  }

  protected get resolutionScale() {
    return 1;
  }

  protected get maxCanvasWidth() {
    return 860;
  }

  protected get maxCanvasHeight() {
    return 560;
  }

  protected resetScene() {
    this.sceneSeed = seedFrom(this.getAttribute("seed") ?? "1970");
    this.rebuildGrid();
  }

  protected attributeDidChange(name: string) {
    if (name === "seed" && this.advancingSeed) return;
    if (name === "seed" || name === "density") this.resetScene();
  }

  protected canvasDidResize() {
    this.rebuildGrid();
  }

  protected updateFrame(deltaSeconds: number) {
    this.accumulator += deltaSeconds;
    const generationDuration = 1 / (4.5 * this.speed);
    let steps = 0;

    while (this.accumulator >= generationDuration && steps < 5) {
      this.accumulator -= generationDuration;
      this.advanceGeneration();
      steps += 1;
    }
  }

  protected drawFrame() {
    if (!this.needsDraw) return;

    const context = this.context;
    const width = this.canvasWidth;
    const height = this.canvasHeight;
    const cellWidth = width / Math.max(1, this.columns);
    const cellHeight = height / Math.max(1, this.rows);

    context.save();
    context.fillStyle = "#030912";
    context.fillRect(0, 0, width, height);

    const ambient = context.createRadialGradient(
      width * 0.5,
      height * 0.48,
      0,
      width * 0.5,
      height * 0.48,
      Math.max(width, height) * 0.72,
    );
    ambient.addColorStop(0, "#092e39");
    ambient.addColorStop(0.56, "#071a29");
    ambient.addColorStop(1, "#02060d");
    context.fillStyle = ambient;
    context.fillRect(0, 0, width, height);

    if (cellWidth >= 7 && cellHeight >= 7) {
      context.beginPath();
      for (let x = 1; x < this.columns; x += 1) {
        const lineX = Math.round(x * cellWidth) + 0.5;
        context.moveTo(lineX, 0);
        context.lineTo(lineX, height);
      }
      for (let y = 1; y < this.rows; y += 1) {
        const lineY = Math.round(y * cellHeight) + 0.5;
        context.moveTo(0, lineY);
        context.lineTo(width, lineY);
      }
      context.strokeStyle = "rgba(83, 183, 190, 0.055)";
      context.lineWidth = 1;
      context.stroke();
    }

    for (let y = 0; y < this.rows; y += 1) {
      for (let x = 0; x < this.columns; x += 1) {
        const index = y * this.columns + x;
        const age = this.cells[index];
        const trail = this.trails[index];
        if (age === 0 && trail === 0) continue;

        const left = Math.floor(x * cellWidth) + 1;
        const top = Math.floor(y * cellHeight) + 1;
        const cellPixelWidth = Math.max(1, Math.ceil(cellWidth) - 2);
        const cellPixelHeight = Math.max(1, Math.ceil(cellHeight) - 2);

        if (age === 0) {
          context.fillStyle = `rgba(19, 104, 123, ${trail * 0.035})`;
        } else if (age === 1) {
          context.fillStyle = "#efff71";
        } else if (age <= 3) {
          context.fillStyle = "#8affbd";
        } else if (age <= 8) {
          context.fillStyle = "#42ddb7";
        } else {
          context.fillStyle = "#1e9aa9";
        }

        context.fillRect(left, top, cellPixelWidth, cellPixelHeight);

        if (age === 1 && cellWidth >= 6) {
          context.fillStyle = "rgba(239, 255, 113, 0.24)";
          context.fillRect(left - 1, top - 1, cellPixelWidth + 2, cellPixelHeight + 2);
        }
      }
    }

    const labelSize = clamp(Math.round(height / 38), 9, 13);
    context.fillStyle = "rgba(220, 255, 232, 0.62)";
    context.font = `700 ${labelSize}px ui-monospace, "SFMono-Regular", Menlo, monospace`;
    context.textAlign = "left";
    context.textBaseline = "top";
    context.fillText(
      `GEN ${String(this.generation).padStart(4, "0")}  ·  POP ${String(this.population).padStart(4, "0")}`,
      10,
      9,
    );

    const vignette = context.createRadialGradient(
      width * 0.5,
      height * 0.5,
      Math.min(width, height) * 0.3,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.72,
    );
    vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
    vignette.addColorStop(1, "rgba(0, 0, 0, 0.38)");
    context.fillStyle = vignette;
    context.fillRect(0, 0, width, height);
    context.restore();
    this.needsDraw = false;
  }

  private rebuildGrid() {
    if (this.canvasWidth <= 1 || this.canvasHeight <= 1) return;
    const targetCellSize = clamp(Math.round(this.canvasHeight / 42), 7, 12);
    this.columns = Math.max(18, Math.floor(this.canvasWidth / targetCellSize));
    this.rows = Math.max(12, Math.floor(this.canvasHeight / targetCellSize));
    const cellCount = this.columns * this.rows;
    this.cells = new Uint8Array(cellCount);
    this.nextCells = new Uint8Array(cellCount);
    this.trails = new Uint8Array(cellCount);
    this.seedColony();
  }

  private seedColony() {
    const colonySeed = (this.sceneSeed ^ 0x9e3779b1) >>> 0;
    const random = createRandom(colonySeed || 1);
    let population = 0;

    this.cells.fill(0);
    this.nextCells.fill(0);
    this.trails.fill(0);
    for (let index = 0; index < this.cells.length; index += 1) {
      if (random() >= this.density) continue;
      this.cells[index] = 1;
      population += 1;
    }

    this.accumulator = 0;
    this.generation = 0;
    this.population = population;
    this.stillGenerations = 0;
    this.sparseGenerations = 0;
    this.stateHistory.clear();
    this.stateOrder = [];
    this.loopDetectedAt = -1;
    this.loopPeriod = 0;
    this.needsDraw = true;
    this.rememberCurrentState();
  }

  private advanceGeneration() {
    const previous = this.cells;
    const result = stepLifeGrid(
      previous,
      this.nextCells,
      this.columns,
      this.rows,
    );
    let firstHash = 2166136261;
    let secondHash = 0x9e3779b9;

    for (let index = 0; index < previous.length; index += 1) {
      if (this.nextCells[index] > 0) {
        this.trails[index] = 0;
        const position = index + 1;
        firstHash = Math.imul(firstHash ^ position, 16777619);
        secondHash = Math.imul(
          secondHash ^ Math.imul(position, 0x45d9f3b),
          0x27d4eb2d,
        );
      } else if (previous[index] > 0) {
        this.trails[index] = 7;
      } else if (this.trails[index] > 0) {
        this.trails[index] -= 1;
      }
    }

    this.cells = this.nextCells;
    this.nextCells = previous;
    this.nextCells.fill(0);
    this.generation += 1;
    this.population = result.population;
    this.stillGenerations = result.changed === 0 ? this.stillGenerations + 1 : 0;
    this.sparseGenerations =
      result.population < Math.max(6, this.cells.length * 0.002)
        ? this.sparseGenerations + 1
        : 0;
    this.needsDraw = true;
    this.rememberCurrentState(
      formatLifeStateKey(
        this.cells.length,
        result.population,
        firstHash,
        secondHash,
      ),
    );

    const loopHoldGenerations = clamp(
      this.loopPeriod * 2,
      MIN_LOOP_HOLD_GENERATIONS,
      MAX_LOOP_HOLD_GENERATIONS,
    );
    const repeatingLongEnough =
      this.loopDetectedAt >= 0 &&
      this.generation - this.loopDetectedAt >= loopHoldGenerations;

    if (
      this.stillGenerations >= 18 ||
      this.sparseGenerations >= 24 ||
      repeatingLongEnough ||
      this.generation >= MAX_GENERATIONS
    ) {
      this.advanceSeed();
    }
  }

  private rememberCurrentState(key = lifeStateKey(this.cells)) {
    if (this.loopDetectedAt >= 0) return;
    const seenAt = this.stateHistory.get(key);

    if (seenAt !== undefined) {
      this.loopDetectedAt = this.generation;
      this.loopPeriod = this.generation - seenAt;
      return;
    }

    this.stateHistory.set(key, this.generation);
    this.stateOrder.push(key);
    if (this.stateOrder.length <= MAX_TRACKED_STATES) return;

    const oldestKey = this.stateOrder.shift();
    if (oldestKey !== undefined) this.stateHistory.delete(oldestKey);
  }

  private advanceSeed() {
    const currentValue = this.getAttribute("seed") ?? "1970";
    const numericSeed = Number(currentValue);
    const nextSeed =
      (Number.isFinite(numericSeed)
        ? Math.trunc(numericSeed)
        : seedFrom(currentValue)) + 1;

    this.advancingSeed = true;
    try {
      this.setAttribute("seed", String(nextSeed));
    } finally {
      this.advancingSeed = false;
    }

    this.resetScene();
    if (
      typeof CustomEvent !== "undefined" &&
      typeof this.dispatchEvent === "function"
    ) {
      this.dispatchEvent(
        new CustomEvent<GameOfLifeSeedChangeDetail>("seedchange", {
          bubbles: true,
          composed: true,
          detail: { seed: nextSeed },
        }),
      );
    }
  }
}

export function registerGameOfLife() {
  if (typeof customElements === "undefined") return;
  if (!customElements.get(TAG_NAME)) {
    customElements.define(TAG_NAME, GameOfLifeElement);
  }
}
