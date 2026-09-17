import { CanvasSaverElement, clamp } from "@screenjoy/runtime";
import { createScene, projectStar, type FlightMode, type Scene } from "./scene.js";
import { buildExterior, drawExterior, type ExteriorModel } from "./exterior.js";
export type { FlightMode } from "./scene.js";

export class StarlinerElement extends CanvasSaverElement {
  static observedAttributes = [...CanvasSaverElement.observedAttributes, "seed", "speed", "mode"];
  private scene: Scene = createScene("2026");
  private distance = 0;
  private elapsed = 0;
  private warp = 1;
  private cabin?: HTMLCanvasElement;
  private sky?: HTMLCanvasElement;
  private exteriorModel: ExteriorModel = [];

  get speed(): number { return clamp(Number(this.getAttribute("speed") ?? 1) || 1, 0.2, 2.5); }
  set speed(value: number | string | null | undefined) {
    if (value == null || value === "") this.removeAttribute("speed");
    else this.setAttribute("speed", String(clamp(Number(value) || 1, 0.2, 2.5)));
  }
  get mode(): FlightMode { return this.getAttribute("mode") === "cruise" ? "cruise" : "ftl"; }
  set mode(value: FlightMode | string | null | undefined) {
    if (value == null || value === "") this.removeAttribute("mode");
    else this.setAttribute("mode", value === "cruise" ? "cruise" : "ftl");
  }
  regenerate(seed?: string | number) {
    const next = String(seed ?? Math.floor(Math.random() * 999999));
    if (next === this.getAttribute("seed")) { this.resetScene(); this.requestDraw(); }
    else this.setAttribute("seed", next);
  }
  protected get resolutionScale() { return 1; }
  protected get maxCanvasWidth() { return 1100; }
  protected get maxCanvasHeight() { return 760; }
  protected resetScene() {
    this.scene = createScene(this.getAttribute("seed") ?? "2026");
    this.exteriorModel = buildExterior(this.scene);
    this.distance = 0;
    this.elapsed = 0;
    this.warp = this.mode === "ftl" ? 1 : 0;
    this.cabin = undefined;
    this.sky = undefined;
  }
  protected attributeDidChange(name: string) { if (name === "seed") this.resetScene(); }
  protected canvasDidResize() { this.cabin = undefined; this.sky = undefined; }
  protected elementDidDisconnect() { this.cabin = undefined; this.sky = undefined; }
  protected updateFrame(delta: number) {
    const target = this.mode === "ftl" ? 1 : 0;
    this.warp += (target - this.warp) * (1 - Math.exp(-delta * 1.5));
    this.distance += delta * this.speed * this.scene.pace * (0.12 + this.warp * 3.8);
    this.elapsed += delta;
  }

  private portal(ctx: CanvasRenderingContext2D, inset = 0) {
    const w = this.canvasWidth, h = this.canvasHeight;
    const x = w * 0.075 + inset, y = h * 0.105 + inset;
    const pw = w * 0.85 - inset * 2, ph = h * 0.71 - inset * 2;
    ctx.beginPath();
    if (this.scene.shape === "oval") {
      ctx.ellipse(w / 2, y + ph / 2, pw / 2, ph / 2, 0, 0, Math.PI * 2);
    } else if (this.scene.shape === "chamfered") {
      const c = Math.min(pw, ph) * 0.18;
      ctx.moveTo(x + c, y); ctx.lineTo(x + pw - c, y); ctx.lineTo(x + pw, y + c);
      ctx.lineTo(x + pw, y + ph - c); ctx.lineTo(x + pw - c, y + ph);
      ctx.lineTo(x + c, y + ph); ctx.lineTo(x, y + ph - c); ctx.lineTo(x, y + c); ctx.closePath();
    } else {
      ctx.roundRect(x, y, pw, ph, Math.min(pw, ph) * 0.2);
    }
  }

  private buildLayers() {
    const w = this.canvasWidth, h = this.canvasHeight;
    const { material, hue } = this.scene;
    this.sky = document.createElement("canvas");
    this.sky.width = Math.ceil(w * 1.2); this.sky.height = Math.ceil(h * 1.2);
    const sky = this.sky.getContext("2d")!;
    sky.fillStyle = "#020611"; sky.fillRect(0, 0, this.sky.width, this.sky.height);
    for (const cloud of this.scene.clouds) {
      const x = cloud.x * this.sky.width, y = cloud.y * this.sky.height;
      const r = cloud.radius * Math.max(w, h);
      const glow = sky.createRadialGradient(x, y, 0, x, y, r);
      glow.addColorStop(0, `hsla(${cloud.hue}, 55%, 30%, 0.17)`);
      glow.addColorStop(0.45, `hsla(${cloud.hue}, 50%, 18%, 0.09)`);
      glow.addColorStop(1, "transparent");
      sky.fillStyle = glow; sky.fillRect(x - r, y - r, r * 2, r * 2);
    }
    this.cabin = document.createElement("canvas");
    this.cabin.width = this.canvas.width; this.cabin.height = this.canvas.height;
    const ctx = this.cabin.getContext("2d")!;
    ctx.scale(this.cabin.width / w, this.cabin.height / h);
    const wall = ctx.createLinearGradient(0, 0, w * 0.3, h);
    wall.addColorStop(0, material.light); wall.addColorStop(0.22, material.wall);
    wall.addColorStop(0.8, material.wall); wall.addColorStop(1, "#090b11");
    ctx.fillStyle = wall; ctx.fillRect(0, 0, w, h);
    // Subtle panel seams and brushed grain stay fixed to the passenger's cabin.
    ctx.strokeStyle = "#00000030"; ctx.lineWidth = 1;
    for (let y = 1; y < h; y += 3) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y + 0.4); ctx.stroke(); }
    for (const x of [w * 0.035, w * 0.965]) {
      ctx.fillStyle = "#00000055"; ctx.fillRect(x, 0, 1, h);
      ctx.fillStyle = "#ffffff0c"; ctx.fillRect(x + 1, 0, 1, h);
    }
    const thickness = Math.min(w, h) * 0.035;
    this.portal(ctx, -thickness * 0.45);
    ctx.shadowColor = "#000000"; ctx.shadowBlur = thickness * 1.2; ctx.shadowOffsetY = thickness * 0.5;
    ctx.fillStyle = "#080c13"; ctx.fill(); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    this.portal(ctx);
    ctx.strokeStyle = material.rim; ctx.lineWidth = thickness * 0.6; ctx.stroke();
    this.portal(ctx, thickness * 0.28);
    ctx.strokeStyle = "#10151e"; ctx.lineWidth = thickness * 0.8; ctx.stroke();
    this.portal(ctx, thickness * 0.6);
    ctx.globalCompositeOperation = "destination-out"; ctx.fill(); ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = `hsla(${hue}, 65%, 75%, 0.22)`; ctx.lineWidth = 1.1; ctx.stroke();
    // A recessed reading light and a broad sill anchor the otherwise moving view.
    const lamp = ctx.createLinearGradient(w * 0.3, 0, w * 0.7, 0);
    lamp.addColorStop(0, "transparent"); lamp.addColorStop(0.2, material.lamp);
    lamp.addColorStop(0.8, material.lamp); lamp.addColorStop(1, "transparent");
    ctx.fillStyle = lamp; ctx.shadowColor = material.lamp; ctx.shadowBlur = h * 0.025;
    ctx.fillRect(w * 0.3, h * 0.048, w * 0.4, Math.max(1, h * 0.003)); ctx.shadowBlur = 0;
    const sill = ctx.createLinearGradient(0, h * 0.855, 0, h);
    sill.addColorStop(0, material.light); sill.addColorStop(0.08, material.wall); sill.addColorStop(1, "#090c12");
    ctx.fillStyle = sill; ctx.beginPath();
    ctx.moveTo(w * 0.05, h * 0.87); ctx.quadraticCurveTo(w * 0.5, h * 0.835, w * 0.95, h * 0.87);
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#ffffff16"; ctx.lineWidth = 1; ctx.stroke();
    for (const x of [w * 0.048, w * 0.952]) for (const y of [h * 0.065, h * 0.85]) {
      ctx.beginPath(); ctx.arc(x, y, Math.max(1.2, h * 0.004), 0, Math.PI * 2);
      ctx.fillStyle = "#080b1266"; ctx.fill();
    }
  }

  protected drawFrame() {
    if (!this.cabin || !this.sky) this.buildLayers();
    const ctx = this.context, w = this.canvasWidth, h = this.canvasHeight;
    ctx.save();
    ctx.fillStyle = "#020611"; ctx.fillRect(0, 0, w, h);
    // Clouds drift far more slowly than nearby stars and never jump on wrapping.
    const drift = Math.sin(this.distance * 0.012) * w * 0.05;
    ctx.globalAlpha = 1 - this.warp * 0.5;
    ctx.drawImage(this.sky!, -w * 0.1 + drift, -h * 0.1);
    ctx.globalAlpha = 1;
    const trail = 0.006 + this.warp * 0.95;
    ctx.lineCap = "round";
    for (const star of this.scene.stars) {
      const p = projectStar(star, this.scene, this.distance, trail, w / h);
      if (p.brightness < 0.01 || p.x < -0.4 || p.x > 1.4 || p.y < -0.4 || p.y > 1.4) continue;
      const x = p.x * w, y = p.y * h, tx = p.tailX * w, ty = p.tailY * h;
      const size = star.size * p.scale * Math.max(0.65, h / 550);
      const tint = star.tint < 0.14 ? "255, 210, 166" : star.tint > 0.8 ? "174, 188, 255" : "195, 226, 255";
      const alpha = p.brightness * (0.88 + 0.12 * Math.sin(this.elapsed * 0.5 + star.phase));
      if (this.warp > 0.015) {
        ctx.strokeStyle = `rgba(${tint}, ${alpha * 0.12})`; ctx.lineWidth = size * 4;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
        ctx.strokeStyle = `rgba(${tint}, ${alpha * 0.75})`; ctx.lineWidth = Math.max(0.45, size * 0.85);
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
      }
      ctx.fillStyle = `rgba(${tint}, ${alpha})`;
      ctx.beginPath(); ctx.arc(x, y, Math.max(0.4, size * 0.65), 0, Math.PI * 2); ctx.fill();
    }
    // Exterior geometry occludes stars and remains inside the glass.
    ctx.save(); this.portal(ctx, Math.min(w, h) * 0.021); ctx.clip();
    drawExterior(ctx, this.scene, this.exteriorModel, w, h, this.elapsed, this.warp);
    // Engine light falls gently across the lower edge of the recess.
    if (this.scene.exterior.kind === "nacelle") {
      const side = this.scene.exterior.side;
      const glow = ctx.createRadialGradient(w * (0.5 + side * 0.3), h * 0.74, 0,
        w * (0.5 + side * 0.3), h * 0.74, h * 0.42);
      glow.addColorStop(0, `hsla(${this.scene.exterior.hue}, 70%, 60%, ${0.04 + this.warp * 0.035})`);
      glow.addColorStop(1, "transparent"); ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
    }
    const reflection = ctx.createLinearGradient(0, 0, w, h);
    reflection.addColorStop(0, "#dae7ff0a"); reflection.addColorStop(0.35, "transparent");
    reflection.addColorStop(0.8, "transparent"); reflection.addColorStop(1, "#dae7ff05");
    ctx.fillStyle = reflection; ctx.fillRect(0, 0, w, h); ctx.restore();
    ctx.drawImage(this.cabin!, 0, 0, w, h);
    ctx.restore();
  }
}

export function registerStarliner(tagName = "star-liner") {
  if (typeof customElements !== "undefined" && !customElements.get(tagName)) customElements.define(tagName, StarlinerElement);
}


declare global {
  interface HTMLElementTagNameMap {
    "star-liner": StarlinerElement;
  }
}
