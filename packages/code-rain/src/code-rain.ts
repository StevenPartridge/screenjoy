import {
  CanvasSaverElement,
  clamp,
  createRandom,
  seedFrom,
} from "@screenjoy/runtime";

type RainColumn = {
  x: number;
  head: number;
  velocity: number;
  length: number;
  intensity: number;
  phase: number;
  glyphSeed: number;
  generation: number;
};

const TAG_NAME = "code-rain";
const GLYPHS = Array.from(
  "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ<>[]{}:=+*#%&",
);

function mix(value: number) {
  let mixed = value | 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x45d9f3b);
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x45d9f3b);
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

function glyphAt(column: RainColumn, row: number, mutation: number) {
  const hash = mix(
    column.glyphSeed ^
      Math.imul(row + 2048, 0x9e3779b1) ^
      Math.imul(mutation + column.generation * 17, 0x85ebca6b),
  );
  return GLYPHS[hash % GLYPHS.length];
}

export class CodeRainElement extends CanvasSaverElement {
  static observedAttributes = [
    ...CanvasSaverElement.observedAttributes,
    "seed",
    "speed",
    "density",
  ];

  private columns: RainColumn[] = [];
  private random = createRandom(1);
  private elapsed = 0;
  private fontSize = 15;
  private rowHeight = 17;
  private rowCount = 16;
  private sceneSeed = 1;

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
    return clamp(Number(this.getAttribute("speed") ?? 1) || 1, 0.2, 2.5);
  }

  set speed(value: number | string | null | undefined) {
    if (value === null || value === undefined || value === "") {
      this.removeAttribute("speed");
      return;
    }
    this.setAttribute("speed", String(clamp(Number(value) || 1, 0.2, 2.5)));
  }

  get density(): number {
    return clamp(Number(this.getAttribute("density") ?? 1) || 1, 0.45, 1.6);
  }

  set density(value: number | string | null | undefined) {
    if (value === null || value === undefined || value === "") {
      this.removeAttribute("density");
      return;
    }
    this.setAttribute(
      "density",
      String(clamp(Number(value) || 1, 0.45, 1.6)),
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
    this.sceneSeed = seedFrom(this.getAttribute("seed") ?? "10101");
    this.random = createRandom(this.sceneSeed);
    this.elapsed = 0;
    this.rebuildColumns();
  }

  protected attributeDidChange(name: string) {
    if (name === "seed" || name === "density") this.resetScene();
  }

  protected canvasDidResize() {
    this.resetScene();
  }

  protected updateFrame(deltaSeconds: number) {
    this.elapsed += deltaSeconds;
    const pace = this.speed;

    for (const column of this.columns) {
      column.head += deltaSeconds * column.velocity * pace;
      if (column.head - column.length <= this.rowCount + 3) continue;

      column.head = -2 - this.random() * this.rowCount * 0.8;
      column.velocity = 5.2 + this.random() * 10.5;
      column.length = Math.round(7 + this.random() * Math.max(8, this.rowCount * 0.78));
      column.intensity = 0.62 + this.random() * 0.38;
      column.phase = this.random() * 20;
      column.glyphSeed = Math.floor(this.random() * 0xffffffff) >>> 0;
      column.generation += 1;
    }
  }

  protected drawFrame() {
    const context = this.context;
    const width = this.canvasWidth;
    const height = this.canvasHeight;

    context.save();
    context.fillStyle = "#010503";
    context.fillRect(0, 0, width, height);

    const ambient = context.createRadialGradient(
      width * 0.5,
      height * 0.46,
      0,
      width * 0.5,
      height * 0.46,
      Math.max(width, height) * 0.7,
    );
    ambient.addColorStop(0, "#062014");
    ambient.addColorStop(0.52, "#03120b");
    ambient.addColorStop(1, "#010302");
    context.fillStyle = ambient;
    context.fillRect(0, 0, width, height);

    context.font = `600 ${this.fontSize}px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`;
    context.textAlign = "center";
    context.textBaseline = "middle";

    for (const column of this.columns) {
      const headRow = Math.floor(column.head);
      const headFraction = column.head - headRow;

      for (let offset = column.length; offset >= 0; offset -= 1) {
        const row = headRow - offset;
        if (row < -1 || row > this.rowCount + 1) continue;

        const life = 1 - offset / Math.max(1, column.length);
        const dropout = mix(column.glyphSeed ^ Math.imul(row + 99, 7919)) % 19;
        if (dropout === 0 && offset > 2) continue;

        const mutation = Math.floor(
          this.elapsed * (2.2 + column.velocity * 0.11) +
            column.phase +
            offset * 0.13,
        );
        const glyph = glyphAt(column, row, mutation);
        const y = (row + headFraction) * this.rowHeight + this.rowHeight * 0.5;

        if (offset === 0) {
          context.save();
          context.shadowColor = "#72ff9d";
          context.shadowBlur = this.fontSize * 0.8;
          context.fillStyle = `rgba(226, 255, 235, ${column.intensity})`;
          context.fillText(glyph, column.x, y);
          context.restore();
          continue;
        }

        const alpha = Math.pow(life, 1.65) * column.intensity * 0.88;
        const green = offset <= 2 ? 255 : Math.round(164 + life * 70);
        const red = offset <= 2 ? 87 : Math.round(15 + life * 35);
        context.fillStyle = `rgba(${red}, ${green}, ${Math.round(72 + life * 56)}, ${alpha})`;
        context.fillText(glyph, column.x, y);
      }
    }

    context.fillStyle = "rgba(0, 0, 0, 0.12)";
    for (let y = 1; y < height; y += 4) {
      context.fillRect(0, y, width, 1);
    }

    const vignette = context.createRadialGradient(
      width * 0.5,
      height * 0.5,
      Math.min(width, height) * 0.22,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.72,
    );
    vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
    vignette.addColorStop(0.7, "rgba(0, 0, 0, 0.08)");
    vignette.addColorStop(1, "rgba(0, 0, 0, 0.64)");
    context.fillStyle = vignette;
    context.fillRect(0, 0, width, height);
    context.restore();
  }

  private rebuildColumns() {
    const width = this.canvasWidth;
    const height = this.canvasHeight;
    this.fontSize = clamp(Math.round(height / 25), 12, 22);
    this.rowHeight = this.fontSize * 1.08;
    this.rowCount = Math.ceil(height / this.rowHeight);
    const columnWidth = (this.fontSize * 1.02) / this.density;
    const columnCount = Math.ceil(width / columnWidth) + 1;

    this.columns = Array.from({ length: columnCount }, (_, index) => ({
      x: (index + 0.5) * columnWidth,
      head: -this.rowCount * 0.7 + this.random() * this.rowCount * 1.8,
      velocity: 5.2 + this.random() * 10.5,
      length: Math.round(7 + this.random() * Math.max(8, this.rowCount * 0.78)),
      intensity: 0.62 + this.random() * 0.38,
      phase: this.random() * 20,
      glyphSeed: Math.floor(this.random() * 0xffffffff) >>> 0,
      generation: 0,
    }));
  }
}

export function registerCodeRain() {
  if (typeof customElements === "undefined") return;
  if (!customElements.get(TAG_NAME)) {
    customElements.define(TAG_NAME, CodeRainElement);
  }
}
