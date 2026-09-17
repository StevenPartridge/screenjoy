const HTMLElementBase = (
  typeof HTMLElement === "undefined" ? class {} : HTMLElement
) as typeof HTMLElement;

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function seedFrom(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
}

export function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export type CanvasSizeOptions = {
  width: number;
  height: number;
  resolutionScale: number;
  maxWidth: number;
  maxHeight: number;
  devicePixelRatio: number;
  fullscreenPixelBudget?: number | null;
};

export function resolveCanvasSize({
  width: rectWidth,
  height: rectHeight,
  resolutionScale,
  maxWidth,
  maxHeight,
  devicePixelRatio,
  fullscreenPixelBudget = null,
}: CanvasSizeOptions) {
  const aspect =
    rectWidth > 0 && rectHeight > 0 ? rectWidth / rectHeight : 1.6;
  let layoutHeight = clamp(
    Math.round(rectHeight * resolutionScale),
    64,
    maxHeight,
  );
  let layoutWidth = Math.round(layoutHeight * aspect);

  if (layoutWidth > maxWidth) {
    layoutWidth = maxWidth;
    layoutHeight = Math.max(64, Math.round(layoutWidth / aspect));
  } else if (layoutWidth < 110) {
    layoutWidth = 110;
    layoutHeight = Math.max(64, Math.round(layoutWidth / aspect));
  }

  let renderWidth = layoutWidth;
  let renderHeight = layoutHeight;

  if (fullscreenPixelBudget !== null) {
    const pixelRatio = clamp(devicePixelRatio || 1, 1, 2);
    renderWidth = Math.max(1, Math.round(rectWidth * pixelRatio));
    renderHeight = Math.max(1, Math.round(rectHeight * pixelRatio));
    const requestedPixels = renderWidth * renderHeight;

    if (requestedPixels > fullscreenPixelBudget) {
      const budgetScale = Math.sqrt(
        fullscreenPixelBudget / requestedPixels,
      );
      renderWidth = Math.max(1, Math.round(renderWidth * budgetScale));
      renderHeight = Math.max(1, Math.round(renderHeight * budgetScale));
    }
  }

  return { layoutWidth, layoutHeight, renderWidth, renderHeight };
}

export abstract class SaverElement extends HTMLElementBase {
  static observedAttributes = ["fps", "paused", "motion"];

  protected readonly canvas: HTMLCanvasElement;

  private resizeObserver?: ResizeObserver;
  private intersectionObserver?: IntersectionObserver;
  private motionQuery?: MediaQueryList;
  private animationFrame = 0;
  private lastFrame = 0;
  private lastPaint = 0;
  private active = false;
  private visible = true;
  private animationSettled = false;
  private layoutCanvasWidth = 320;
  private layoutCanvasHeight = 200;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      :host {
        display: block;
        min-width: 80px;
        min-height: 60px;
        contain: strict;
        overflow: hidden;
        background: #050505;
      }

      canvas {
        display: block;
        width: 100%;
        height: 100%;
      }
    `;
    this.canvas = document.createElement("canvas");
    this.canvas.width = 320;
    this.canvas.height = 200;
    this.canvas.setAttribute("aria-hidden", "true");
    shadow.append(style, this.canvas);
  }

  connectedCallback() {
    if (this.active) return;
    this.active = true;
    if (!this.hasAttribute("aria-hidden")) this.setAttribute("aria-hidden", "true");

    this.elementDidConnect();
    this.resetScene();
    this.resizeObserver = new ResizeObserver(() => {
      this.resizeCanvas();
      this.drawNow();
    });
    this.resizeObserver.observe(this);

    this.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.visible = entry?.isIntersecting ?? true;
      this.syncAnimation();
    });
    this.intersectionObserver.observe(this);

    this.motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.motionQuery.addEventListener("change", this.handleMotionChange);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    document.addEventListener("fullscreenchange", this.handleFullscreenChange);

    this.resizeCanvas();
    this.drawNow();
    this.syncAnimation();
  }

  disconnectedCallback() {
    this.active = false;
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    this.motionQuery?.removeEventListener("change", this.handleMotionChange);
    document.removeEventListener(
      "visibilitychange",
      this.handleVisibilityChange,
    );
    document.removeEventListener(
      "fullscreenchange",
      this.handleFullscreenChange,
    );
    this.stopAnimation();
    this.elementDidDisconnect();
    this.canvas.width = 1;
    this.canvas.height = 1;
  }

  attributeChangedCallback(
    name: string,
    previousValue: string | null,
    nextValue: string | null,
  ) {
    if (!this.active || previousValue === nextValue) return;
    this.attributeDidChange(name, previousValue, nextValue);
    this.drawNow();
    this.syncAnimation();
  }

  get fps(): number {
    return clamp(Number(this.getAttribute("fps") ?? 30) || 30, 12, 60);
  }

  set fps(value: number | string | null | undefined) {
    if (value === null || value === undefined || value === "") {
      this.removeAttribute("fps");
      return;
    }
    this.setAttribute("fps", String(clamp(Number(value) || 30, 12, 60)));
  }

  get paused(): boolean {
    return this.hasAttribute("paused");
  }

  set paused(value: boolean | string | null | undefined) {
    const shouldPause =
      value !== false &&
      value !== null &&
      value !== undefined &&
      value !== "false";
    this.toggleAttribute("paused", shouldPause);
  }

  play() {
    this.paused = false;
  }

  pause() {
    this.paused = true;
  }

  protected get resolutionScale() {
    return 0.75;
  }

  protected get maxCanvasWidth() {
    return 480;
  }

  protected get maxCanvasHeight() {
    return 260;
  }

  protected get fullscreenPixelBudget(): number | null {
    return 1920 * 1080;
  }

  protected get fullscreenFpsCap(): number | null {
    return null;
  }

  protected get canvasWidth() {
    return this.canvas.width;
  }

  protected get canvasHeight() {
    return this.canvas.height;
  }

  protected get layoutWidth() {
    return this.layoutCanvasWidth;
  }

  protected get layoutHeight() {
    return this.layoutCanvasHeight;
  }

  protected requestDraw() {
    this.drawNow();
  }

  protected setAnimationSettled(settled: boolean) {
    if (this.animationSettled === settled) return;
    this.animationSettled = settled;
    this.syncAnimation();
  }

  protected abstract resetScene(): void;

  protected abstract updateFrame(deltaSeconds: number): void;

  protected abstract drawFrame(): void;

  protected canvasDidResize() {}

  protected prepareCanvasForDraw() {}

  protected elementDidConnect() {}

  protected elementDidDisconnect() {}

  protected attributeDidChange(
    _name: string,
    _previousValue: string | null,
    _nextValue: string | null,
  ) {}

  private get shouldAnimate() {
    const reduceMotion =
      this.motionQuery?.matches && this.getAttribute("motion") !== "allow";
    return (
      this.active &&
      this.visible &&
      !this.animationSettled &&
      document.visibilityState !== "hidden" &&
      !this.paused &&
      !reduceMotion
    );
  }

  private handleMotionChange = () => {
    this.syncAnimation();
  };

  private handleVisibilityChange = () => {
    this.syncAnimation();
  };

  private handleFullscreenChange = () => {
    this.resizeCanvas();
    this.drawNow();
    this.syncAnimation();
  };

  private get isInFullscreen() {
    const fullscreenElement = document.fullscreenElement;
    return Boolean(fullscreenElement?.contains(this));
  }

  private get effectiveFps() {
    const fullscreenCap = this.isInFullscreen
      ? this.fullscreenFpsCap
      : null;
    return fullscreenCap === null
      ? this.fps
      : Math.min(this.fps, fullscreenCap);
  }

  private resizeCanvas() {
    const rect = this.getBoundingClientRect();
    const size = resolveCanvasSize({
      width: rect.width,
      height: rect.height,
      resolutionScale: this.resolutionScale,
      maxWidth: this.maxCanvasWidth,
      maxHeight: this.maxCanvasHeight,
      devicePixelRatio: window.devicePixelRatio,
      fullscreenPixelBudget: this.isInFullscreen
        ? this.fullscreenPixelBudget
        : null,
    });

    if (
      this.canvas.width === size.renderWidth &&
      this.canvas.height === size.renderHeight &&
      this.layoutCanvasWidth === size.layoutWidth &&
      this.layoutCanvasHeight === size.layoutHeight
    ) {
      return;
    }

    this.layoutCanvasWidth = size.layoutWidth;
    this.layoutCanvasHeight = size.layoutHeight;
    this.canvas.width = size.renderWidth;
    this.canvas.height = size.renderHeight;
    this.prepareCanvasForDraw();
    this.canvasDidResize();
  }

  private drawNow() {
    this.drawFrame();
  }

  private tick = (time: number) => {
    this.animationFrame = 0;
    if (!this.shouldAnimate) return;

    const frameInterval = 1000 / this.effectiveFps;
    if (time - this.lastPaint >= frameInterval) {
      const delta = clamp((time - (this.lastFrame || time)) / 1000, 0, 0.05);
      this.lastFrame = time;
      this.lastPaint = time;
      this.updateFrame(delta);
      this.drawNow();
    }

    if (this.shouldAnimate) {
      this.animationFrame = requestAnimationFrame(this.tick);
    }
  };

  private syncAnimation() {
    if (!this.shouldAnimate) {
      this.stopAnimation();
      this.drawNow();
      return;
    }
    if (this.animationFrame) return;
    this.lastFrame = performance.now();
    this.lastPaint = 0;
    this.animationFrame = requestAnimationFrame(this.tick);
  }

  private stopAnimation() {
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
  }
}

export abstract class CanvasSaverElement extends SaverElement {
  protected readonly context: CanvasRenderingContext2D;

  constructor() {
    super();
    const context = this.canvas.getContext("2d", { alpha: false });
    if (!context) {
      throw new Error("This screensaver requires a 2D canvas context.");
    }
    this.context = context;
  }

  protected get canvasWidth() {
    return this.layoutWidth;
  }

  protected get canvasHeight() {
    return this.layoutHeight;
  }

  protected prepareCanvasForDraw() {
    this.context.setTransform(
      this.canvas.width / this.canvasWidth,
      0,
      0,
      this.canvas.height / this.canvasHeight,
      0,
      0,
    );
  }
}
