import { CanvasSaverElement, clamp } from '@screenjoy/runtime';
import { generateHole, DEFAULT_SETTINGS } from './generator.js';
import { lifetimeScores, holeResult, type GolfTotals } from './scores.js';
import type { HoleSettings } from './course.js';
import { COLORS, PRACTICE_HOLE, surfaceAt, aimAt, rangeAt, distance, simulateShot, accuracyAngle, meterPosition, powerAtMeter, meterAtPower, METER_RATE, ACCURACY_CENTER, ACCURACY_HALF_WIDTH, type Point, type Shot, type Hole } from './course.js';

export { generateHole, holeAddress, settingsFromAddress, normalizeSettings, DEFAULT_SETTINGS, LAYOUTS, HAZARDS } from './generator.js';
export type { Hole, HoleSettings, Layout, Hazards } from './course.js';

export type HoleSnapshot = { holeId: string; ball: Point; strokes: number; view: 'hole' | 'green'; phase: string; lastShot: { start: Point; target: Point; power: number; angle: number; end: Point; outcome: string } | null };

type Phase = 'aim' | 'power' | 'accuracy' | 'travel' | 'fade' | 'complete';
const TAU = Math.PI * 2;

export class PocketGolfElement extends CanvasSaverElement {
  static observedAttributes = [...CanvasSaverElement.observedAttributes, 'seed', 'hole-index', 'review', 'show-route'];
  private hole: Hole = PRACTICE_HOLE;
  private lastShot: HoleSnapshot['lastShot'] = null;
  private ball: Point = { ...this.hole.tee };
  private target: Point = aimAt(this.hole.tee, this.hole.cup, this.hole);
  private phase: Phase = 'aim';
  private strokes = 0;
  private total = 0;
  private holes = 0;
  private green = false;
  private meterTime = 0;
  private lockedPower = 0;
  private accuracyStart = 1;
  private elapsed = 0;
  private shot?: Shot;
  private sampleIndex = 0;
  private height = 0;
  private pointer?: number;
  private result = '';
  private hoverScore = false;
  private nextGreen = false;
  private nextHole = false;
  private fadeApplied = false;
  private terrain?: HTMLCanvasElement;
  private motionPreference?: MediaQueryList;
  private readonly hud: HTMLDivElement;
  private readonly score: HTMLButtonElement;
  private readonly status: HTMLDivElement;
  private readonly swing: HTMLButtonElement;
  private readonly meter: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private readonly targetTick: HTMLDivElement;
  private readonly powerTick: HTMLDivElement;
  private readonly feedback: HTMLDivElement;
  private readonly readout: HTMLDivElement;
  private previousStatus = '';
  private initialized = false;
  private preserveOnConnect = false;
  private connectedAttributes?: string;
  private celebrationTimer?: ReturnType<typeof setInterval>;

  constructor() {
    super();
    const style = document.createElement('style');
    style.textContent = `
      :host { position:relative; background:#286945; touch-action:none; user-select:none; }
      canvas { image-rendering:pixelated; cursor:crosshair; }
      * { box-sizing:border-box; }
      button { font:inherit; cursor:pointer; }
      .score { position:absolute; left:18px; top:16px; background:none; padding:4px; border:0; color:white; font:18px monospace; text-shadow:1px 2px #1c4a32; }
      .score:focus-visible,.swing:focus-visible { outline:2px solid #f3cb73; outline-offset:4px; }
      .hud { position:absolute; bottom:18px; left:50%; transform:translateX(-50%); width:min(270px,calc(100% - 120px)); color:white; font:12px monospace; text-align:center; }
      .status { margin-bottom:9px; text-shadow:1px 1px #174d34; line-height:1.4; }
      .swing { background:#193f30ed; border:1px solid #b7ce83; border-radius:4px; padding:9px 24px; color:#fff; min-height:38px; }
      .swing:hover { background:#285a3e; }
      .swing:disabled { cursor:default; opacity:.55; }
      .meter { position:relative; height:15px; margin-bottom:9px; background:#183f32e8; border:1px solid #90af70; }
      .zone { position:absolute; z-index:2; pointer-events:none; left:${(ACCURACY_CENTER - ACCURACY_HALF_WIDTH) * 100}%; top:-2px; height:calc(100% + 4px); width:${ACCURACY_HALF_WIDTH * 200}%; background:#b5e98280; border:2px solid #c7ed96; }
      .zone::after { content:""; position:absolute; left:50%; top:-4px; bottom:-4px; border-left:2px solid #c7ed96; box-shadow:1px 0 #193f30; }
      .fill { position:absolute; z-index:1; left:0; top:0; height:100%; background:#edbd60; }
      .target,.power { position:absolute; z-index:3; top:-4px; height:21px; border-left:2px solid #f3c36a; }
      .power { border-color:#f8d88b; }
      .readout { min-height:16px; margin-bottom:5px; font-size:11px; }
      .feedback { position:absolute; left:12px; right:12px; top:16%; text-align:center; pointer-events:none; color:white; font:14px monospace; text-shadow:1px 2px #184b35; }
      [hidden] { display:none !important; }
      @media(max-width:380px) { .hud { width:calc(100% - 104px); bottom:14px; } .score { left:10px; top:10px; font-size:16px; } .swing { padding:8px 10px; } }
    `;
    this.score = document.createElement('button');
    this.score.type = 'button'; this.score.className = 'score';
    this.score.title = 'Holes played';
    this.hud = document.createElement('div'); this.hud.className = 'hud';
    this.status = document.createElement('div'); this.status.className = 'status';
    this.status.setAttribute('role', 'status');
    this.meter = document.createElement('div'); this.meter.className = 'meter';
    this.meter.setAttribute('aria-hidden', 'true');
    const zone = document.createElement('div'); zone.className = 'zone';
    this.fill = document.createElement('div'); this.fill.className = 'fill';
    this.targetTick = document.createElement('div'); this.targetTick.className = 'target';
    this.powerTick = document.createElement('div'); this.powerTick.className = 'power';
    this.meter.append(zone, this.fill, this.targetTick, this.powerTick);
    this.readout = document.createElement('div'); this.readout.className = 'readout';
    this.swing = document.createElement('button'); this.swing.type = 'button'; this.swing.className = 'swing';
    this.swing.addEventListener('click', () => this.clickSwing());
    this.score.addEventListener('mouseenter', () => { this.hoverScore = true; this.syncUI(); });
    this.score.addEventListener('mouseleave', () => { this.hoverScore = false; this.syncUI(); });
    this.score.addEventListener('focus', () => { this.hoverScore = true; this.syncUI(); });
    this.score.addEventListener('blur', () => { this.hoverScore = false; this.syncUI(); });
    this.feedback = document.createElement('div'); this.feedback.className = 'feedback';
    this.feedback.setAttribute('role', 'status');
    this.hud.append(this.status, this.meter, this.readout, this.swing);
    this.shadowRoot!.append(style, this.score, this.hud, this.feedback);
  }

  protected get maxCanvasWidth() { return 800; }
  protected get maxCanvasHeight() { return 800; }
  private get reducedMotion() { return !!this.motionPreference?.matches && this.getAttribute('motion') !== 'allow'; }
  private get targetPower() { return clamp(distance(this.ball, this.target) / (rangeAt(this.ball, this.hole) || 1), 0.01, 1); }
  private get canInput() { return !this.paused && document.visibilityState !== 'hidden'; }
  get seed(): string { return this.initialized ? this.hole.settings.seed : this.getAttribute('seed') ?? this.hole.settings.seed; }
  set seed(value: string | number) { this.setAttribute('seed', String(value)); }
  get holeIndex(): number { return this.initialized ? this.hole.settings.index : Number(this.getAttribute('hole-index') ?? this.hole.settings.index); }
  set holeIndex(value: number) { this.setAttribute('hole-index', String(value)); }

  protected elementDidConnect() {
    this.preserveOnConnect = this.initialized;
    const attributes = this.courseAttributes();
    if (this.initialized && attributes !== this.connectedAttributes) {
      this.preserveOnConnect = false;
      this.startCourse(this.attributeSettings());
    }
    this.connectedAttributes = attributes;
    if (!this.initialized) {
      this.initialized = true;
      if (!this.hasAttribute('review')) {
        const totals = lifetimeScores.read(); this.total = totals.score; this.holes = totals.holes;
        if (this.hole.version === 'practice') this.hole = generateHole(this.attributeSettings());
      }
    }
    this.setAttribute('aria-hidden', 'false');
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.cancelInput);
    this.canvas.addEventListener('lostpointercapture', this.cancelInput);
    window.addEventListener('blur', this.cancelInput);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.motionPreference.addEventListener('change', this.onMotion);
    this.scheduleCelebration();
    this.notifyHole();
  }
  protected elementDidDisconnect() {
    this.clearCelebration();
    this.cancelInput();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.cancelInput);
    this.canvas.removeEventListener('lostpointercapture', this.cancelInput);
    window.removeEventListener('blur', this.cancelInput);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.motionPreference?.removeEventListener('change', this.onMotion);
  }
  protected attributeDidChange(name: string) {
    if (name === 'seed' || name === 'hole-index') {
      this.connectedAttributes = this.courseAttributes();
      this.startCourse(this.attributeSettings());
    }
    if (name === 'paused') this.cancelInput();
    if (name === 'motion') this.onMotion();
    this.syncUI();
  }
  private courseAttributes() { return JSON.stringify([this.getAttribute('seed'), this.getAttribute('hole-index')]); }
  private attributeSettings(): Partial<HoleSettings> {
    return { seed: this.getAttribute('seed') ?? DEFAULT_SETTINGS.seed, index: Number(this.getAttribute('hole-index') ?? 0) };
  }
  protected resetScene() {
    if (this.preserveOnConnect) {
      this.preserveOnConnect = false;
      this.syncUI(); return;
    }
    this.clearCelebration();
    this.ball = { ...this.hole.tee }; this.target = aimAt(this.ball, this.hole.cup, this.hole);
    this.strokes = 0; this.green = false; this.phase = 'aim'; this.lastShot = null;
    this.height = 0; this.shot = undefined; this.result = '';
    this.elapsed = 0; this.nextHole = false; this.fadeApplied = false;
    this.setAnimationSettled(true); this.syncUI();
  }
  /** Load geometry without changing the approved swing or movement rules. */
  loadHole(hole: Hole) {
    this.cancelInput();
    this.hole = structuredClone(hole);
    this.terrain = undefined;
    this.resetScene(); this.requestDraw();
    this.notifyHole();
  }
  /** Begin a replayable sequence. Only completed holes contribute to the score. */
  startCourse(settings: Partial<HoleSettings> = {}) { this.loadHole(generateHole(settings)); }
  get holeAddress() { return this.hole.id; }
  getTotals(): GolfTotals { return { version: 1, score: this.total, holes: this.holes }; }
  get scoreSaved() { return !this.hasAttribute('review') && lifetimeScores.saved; }
  private notifyHole() {
    this.dispatchEvent(new CustomEvent('holechange', { detail: { address: this.hole.id, settings: { ...this.hole.settings } }, bubbles: true, composed: true }));
  }
  getSnapshot(): HoleSnapshot {
    return structuredClone({ holeId: this.hole.id, ball: this.ball, strokes: this.strokes,
      view: this.green ? 'green' : 'hole', phase: this.phase, lastShot: this.lastShot });
  }
  /** Replay the current hole without clearing completed session totals. */
  restart() { this.cancelInput(); this.resetScene(); this.requestDraw(); }

  private onVisibility = () => { if (document.visibilityState === 'hidden') this.cancelInput(); };
  private onMotion = () => {
    this.cancelInput();
    if (this.reducedMotion && this.phase === 'travel') this.finishShot();
    if (this.reducedMotion && this.phase === 'fade') this.finishFade();
    if (this.phase === 'complete') this.setAnimationSettled(this.reducedMotion || this.hasAttribute('review'));
    this.scheduleCelebration();
    this.syncUI(); this.requestDraw();
  };
  private clearCelebration() { clearInterval(this.celebrationTimer); this.celebrationTimer = undefined; }
  private scheduleCelebration() {
    this.clearCelebration();
    // The shared runtime deliberately stops animation for reduced motion.
    // Keep the result readable, then advance without animating the transition.
    if (this.phase === 'complete' && this.reducedMotion && !this.hasAttribute('review')) {
      this.celebrationTimer = setInterval(() => {
        if (this.isConnected && this.canInput) this.updateFrame(0.1);
      }, 100);
    }
  }
  private cancelInput = () => {
    const pointer = this.pointer; this.pointer = undefined;
    if (pointer !== undefined && this.canvas.hasPointerCapture(pointer)) this.canvas.releasePointerCapture(pointer);
    if (this.phase === 'power' || this.phase === 'accuracy') {
      this.phase = 'aim'; this.setAnimationSettled(true);
    }
    this.syncUI(); this.requestDraw();
  };
  private camera() {
    const size = Math.min(this.canvasWidth, this.canvasHeight);
    const span = this.green ? 100 : 256;
    return { scale: size / span, x: (this.canvasWidth - size) / 2, y: (this.canvasHeight - size) / 2,
      left: this.green ? this.hole.cup.x - 50 : 0, top: this.green ? this.hole.cup.y - 43 : 0 };
  }
  private pointerPoint(event: PointerEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    const camera = this.camera();
    return { x: ((event.clientX - rect.left) * this.canvasWidth / rect.width - camera.x) / camera.scale + camera.left,
      y: ((event.clientY - rect.top) * this.canvasHeight / rect.height - camera.y) / camera.scale + camera.top };
  }
  private onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || !event.isPrimary || !this.canInput) return;
    event.preventDefault();
    if (this.phase === 'power' || this.phase === 'accuracy') { this.clickSwing(); return; }
    if (this.phase !== 'aim') return;
    this.pointer = event.pointerId; this.canvas.setPointerCapture(event.pointerId);
    this.moveTarget(event);
  };
  private onPointerMove = (event: PointerEvent) => { if (this.pointer === event.pointerId) this.moveTarget(event); };
  private onPointerUp = (event: PointerEvent) => {
    if (this.pointer !== event.pointerId) return;
    this.moveTarget(event); this.pointer = undefined;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
  };
  private moveTarget(event: PointerEvent) {
    if (!this.canInput || this.phase !== 'aim') return;
    this.target = aimAt(this.ball, this.pointerPoint(event), this.hole);
    this.syncUI(); this.requestDraw();
  }
  private clickSwing() {
    if (!this.canInput) return;
    if (this.phase === 'complete') { this.beginFade(false, true); return; }
    if (this.phase === 'aim') {
      if (this.reducedMotion) { this.launch(this.targetPower, 0); return; }
      this.meterTime = ACCURACY_CENTER; this.phase = 'power'; this.result = '';
      this.setAnimationSettled(false);
    } else if (this.phase === 'power') {
      const power = powerAtMeter(meterPosition(this.meterTime));
      if (power <= 0) return;
      this.lockedPower = clamp(power, 0.01, 1);
      this.accuracyStart = Math.floor(this.meterTime / 2) * 2 + 1;
      // Keep the motion continuous and allow two tolerance widths to prepare.
      const latestLock = this.accuracyStart + 1 - ACCURACY_CENTER - ACCURACY_HALF_WIDTH * 2;
      if (this.meterTime > latestLock) this.accuracyStart += 2;
      this.phase = 'accuracy';
    } else if (this.phase === 'accuracy' && this.meterTime >= this.accuracyStart) {
      this.launch(this.lockedPower, accuracyAngle(meterPosition(this.meterTime)));
    }
    this.syncUI(); this.requestDraw();
  }
  private launch(power: number, angle: number) {
    this.shot = simulateShot(this.ball, this.target, power, angle, this.hole);
    this.lastShot = { start: { ...this.ball }, target: { ...this.target }, power, angle, end: { ...this.shot.end }, outcome: this.shot.outcome };
    this.strokes++; this.elapsed = 0; this.sampleIndex = 0; this.phase = 'travel';
    this.result = `${Math.round(power * 100)}% power · ${Math.abs(angle) < 0.001 ? 'Straight' : `${(Math.abs(angle) * 180 / Math.PI).toFixed(1)}° ${angle < 0 ? 'left' : 'right'}`}`;
    if (this.reducedMotion) this.finishShot();
    else this.setAnimationSettled(false);
  }
  private finishShot() {
    const shot = this.shot; if (!shot) return;
    this.height = 0;
    if (shot.outcome === 'water' || shot.outcome === 'outside') {
      this.strokes++;
      const start = shot.samples[0]; this.ball = { x: start.x, y: start.y };
      this.result = shot.outcome === 'water' ? 'Water · +1 penalty · Try again' : 'Out of bounds · +1 penalty · Try again';
    } else this.ball = { ...shot.end };
    this.shot = undefined;
    if (shot.outcome === 'cup') {
      if (this.hasAttribute('review')) { this.total += this.strokes - this.hole.par; this.holes++; }
      else {
        const totals = lifetimeScores.complete(this.strokes, this.hole.par);
        this.total = totals.score; this.holes = totals.holes;
        this.dispatchEvent(new CustomEvent('scorechange', { detail: { ...totals, saved: this.scoreSaved }, bubbles: true, composed: true }));
      }
      this.phase = 'complete'; this.elapsed = 0;
      this.result = holeResult(this.strokes, this.hole.par);
      this.setAnimationSettled(this.reducedMotion || this.hasAttribute('review'));
      this.scheduleCelebration();
    } else {
      const onGreen = surfaceAt(this.ball, this.hole) === 'green';
      if (onGreen !== this.green) this.beginFade(onGreen, false);
      else { this.phase = 'aim'; this.target = aimAt(this.ball, this.hole.cup, this.hole); this.setAnimationSettled(true); }
    }
    this.syncUI(); this.requestDraw();
  }
  private beginFade(green: boolean, nextHole: boolean) {
    this.clearCelebration();
    this.nextGreen = green; this.nextHole = nextHole; this.fadeApplied = false; this.elapsed = 0; this.phase = 'fade';
    if (this.reducedMotion) this.finishFade(); else this.setAnimationSettled(false);
  }
  private applyFade() {
    if (this.fadeApplied) return;
    this.fadeApplied = true; this.green = this.nextGreen;
    if (this.nextHole) {
      if (!this.hasAttribute('review') && this.hole.version !== 'practice') {
        this.hole = generateHole({ ...this.hole.settings, index: (this.hole.settings.index + 1) % 1000000 });
        this.terrain = undefined;
      }
      this.ball = { ...this.hole.tee }; this.strokes = 0; this.result = ''; this.lastShot = null;
      this.notifyHole();
    }
    this.target = aimAt(this.ball, this.hole.cup, this.hole);
  }
  private finishFade() {
    this.applyFade(); this.phase = 'aim'; this.setAnimationSettled(true);
    this.syncUI(); this.requestDraw();
  }
  protected updateFrame(delta: number) {
    if (this.phase === 'power' || this.phase === 'accuracy') {
      this.meterTime += delta * METER_RATE;
      if (this.phase === 'accuracy' && this.meterTime >= this.accuracyStart + 1) {
        this.result = 'No rush. Try the swing again.'; this.phase = 'aim'; this.setAnimationSettled(true);
      }
      this.syncUI();
    } else if (this.phase === 'travel' && this.shot) {
      this.elapsed += delta;
      while (this.sampleIndex + 1 < this.shot.samples.length && this.shot.samples[this.sampleIndex + 1].t <= this.elapsed) this.sampleIndex++;
      const sample = this.shot.samples[this.sampleIndex]; this.ball = { x: sample.x, y: sample.y }; this.height = sample.height;
      if (this.elapsed >= this.shot.duration) this.finishShot();
    } else if (this.phase === 'fade') {
      this.elapsed += delta;
      if (this.elapsed >= 0.28) this.applyFade();
      if (this.elapsed >= 0.56) this.finishFade();
    } else if (this.phase === 'complete' && !this.hasAttribute('review')) {
      this.elapsed += delta;
      if (this.elapsed >= 2.2) this.beginFade(false, true);
    }
  }
  private syncUI() {
    if (!this.score) return;
    const total = this.total === 0 ? 'E' : this.total > 0 ? `+${this.total}` : String(this.total);
    this.score.textContent = this.hoverScore ? `${this.holes} ${this.holes === 1 ? 'hole' : 'holes'}` : total;
    this.score.setAttribute('aria-label', `${this.hasAttribute('review') ? 'Lab' : 'Total'} score ${total}. ${this.holes} holes played.`);
    const active = this.phase === 'power' || this.phase === 'accuracy';
    const rest = this.phase === 'aim';
    this.hud.hidden = this.phase === 'travel' || this.phase === 'fade';
    this.feedback.textContent = this.result;
    this.feedback.hidden = !this.result || active || this.phase === 'fade';
    const status = this.phase === 'complete' ? 'In the cup.' : this.paused ? 'Paused' :
      this.phase === 'power' ? powerAtMeter(meterPosition(this.meterTime)) === 0 ? 'Get ready…' : 'Click at the amber target' : this.phase === 'accuracy' ?
      (this.meterTime < this.accuracyStart ? 'Power set. Wait for the return…' : 'Click in the green zone') :
      `${this.green ? 'Putt' : 'Shot'} ${this.strokes + 1} · Par ${this.hole.par} · ${surfaceAt(this.ball, this.hole)}`;
    if (status !== this.previousStatus) { this.status.textContent = status; this.previousStatus = status; }
    this.swing.textContent = this.phase === 'complete' ? this.hasAttribute('review') ? 'Replay hole' : 'Next hole' : rest ? this.reducedMotion ? 'Take shot' : this.green ? 'Putt' : 'Swing' : this.phase === 'power' ? 'Set power' : 'Set accuracy';
    this.swing.disabled = this.paused || (this.phase === 'accuracy' && this.meterTime < this.accuracyStart);
    this.meter.hidden = this.phase === 'complete' || this.reducedMotion;
    this.readout.hidden = this.phase === 'complete';
    this.readout.textContent = rest ? `Target ${Math.round(this.targetPower * 100)}%` : `Power ${Math.round((this.phase === 'power' ? powerAtMeter(meterPosition(this.meterTime)) : this.lockedPower) * 100)}%`;
    const value = rest ? ACCURACY_CENTER : meterPosition(this.meterTime);
    this.fill.style.width = `${value * 100}%`; this.fill.style.opacity = rest ? '.35' : '1';
    this.targetTick.hidden = this.phase === 'accuracy';
    this.targetTick.style.left = `${meterAtPower(this.targetPower) * 100}%`;
    this.powerTick.hidden = this.phase !== 'accuracy'; this.powerTick.style.left = `${meterAtPower(this.lockedPower) * 100}%`;
  }
  private makeTerrain() {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
    const c = canvas.getContext('2d')!;
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const surface = surfaceAt({ x, y }, this.hole);
      c.fillStyle = COLORS[surface]; c.fillRect(x, y, 1, 1);
      const noise = ((x * 73 + y * 151) ^ (x * y * 13)) >>> 0;
      if (surface === 'fairway' && Math.floor((x + y) / 9) % 2 === 0) { c.fillStyle = '#79b752'; c.fillRect(x, y, 1, 1); }
      if (surface === 'rough' && noise % 19 === 0) { c.fillStyle = '#377a48'; c.fillRect(x, y, 1, 1); }
      if (surface === 'sand' && noise % 13 === 0) { c.fillStyle = '#cba75f'; c.fillRect(x, y, 1, 1); }
      if (surface === 'water' && y % 8 === 0 && x % 13 < 5) { c.fillStyle = '#58a4ac'; c.fillRect(x, y, 1, 1); }
    }
    this.terrain = canvas;
  }
  protected drawFrame() {
    if (!this.terrain) this.makeTerrain();
    const c = this.context; const camera = this.camera();
    c.fillStyle = COLORS.rough; c.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    c.save(); c.translate(camera.x, camera.y); c.scale(camera.scale, camera.scale); c.translate(-camera.left, -camera.top);
    c.imageSmoothingEnabled = false; c.drawImage(this.terrain!, 0, 0);
    if (this.hasAttribute('show-route') && !this.green && this.hole.validation.safeRoute.length > 1) {
      c.strokeStyle = '#99dac5'; c.lineWidth = 1; c.setLineDash([2, 3]);
      c.beginPath();
      this.hole.validation.safeRoute.forEach((p, i) => { if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); });
      c.stroke(); c.setLineDash([]);
      for (const p of this.hole.validation.safeRoute) { c.beginPath(); c.arc(p.x, p.y, 3, 0, TAU); c.stroke(); }
    }
    c.fillStyle = '#173e2b'; c.beginPath(); c.ellipse(this.hole.cup.x, this.hole.cup.y, 2.4, 1.8, 0, 0, TAU); c.fill();
    c.fillStyle = '#ee7657';
    if (!this.green) { c.fillRect(this.hole.cup.x, this.hole.cup.y - 9, 1, 8); c.fillRect(this.hole.cup.x + 1, this.hole.cup.y - 9, 6, 4); }
    if (this.phase === 'aim' || this.phase === 'power' || this.phase === 'accuracy') {
      const prediction = simulateShot(this.ball, this.target, undefined, 0, this.hole);
      c.strokeStyle = '#eec474'; c.lineWidth = this.green ? 0.5 : 0.75; c.setLineDash(this.green ? [0.5, 2] : [1, 3]);
      c.beginPath(); c.moveTo(this.ball.x, this.ball.y); c.lineTo(prediction.end.x, prediction.end.y); c.stroke(); c.setLineDash([]);
      c.strokeStyle = '#f3c36a'; c.lineWidth = this.green ? 0.6 : 1;
      c.beginPath(); c.arc(this.target.x, this.target.y, this.green ? 2 : 4, 0, TAU); c.stroke();
      c.beginPath(); c.arc(prediction.end.x, prediction.end.y, this.green ? 0.8 : 1.6, 0, TAU); c.stroke();
      c.fillStyle = '#f3c36a'; c.fillRect(this.target.x - 0.6, this.target.y - 0.6, 1.2, 1.2);
    }
    c.fillStyle = '#183b3066'; c.beginPath(); c.ellipse(this.ball.x + 0.8, this.ball.y + 1, 2 + this.height, 1.1, 0, 0, TAU); c.fill();
    if (this.phase !== 'complete') {
      c.fillStyle = '#fff'; c.beginPath(); c.arc(this.ball.x, this.ball.y - this.height * 4, (this.green ? 1.1 : 1.8) * (1 + this.height * 0.65), 0, TAU); c.fill();
    }
    c.restore();
    if (this.phase === 'fade') {
      c.fillStyle = `rgba(17,44,35,${Math.max(0, 1 - Math.abs(this.elapsed - 0.28) / 0.28)})`;
      c.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    }
  }
}
export function registerPocketGolf() {
  if (typeof customElements !== 'undefined' && !customElements.get('pocket-golf')) customElements.define('pocket-golf', PocketGolfElement);
}

declare global {
  interface HTMLElementTagNameMap { 'pocket-golf': PocketGolfElement; }
}

export { createReview, parseReviews, reviewText, holeFingerprint, REVIEW_STORAGE_KEY, REVIEW_TAGS } from './reviews.js';
export type { HoleReview, Verdict } from './reviews.js';
