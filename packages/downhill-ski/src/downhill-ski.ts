import {
  CanvasSaverElement,
  clamp,
  createRandom,
  seedFrom,
} from "@screenjoy/runtime";

export type SkiMode =
  | "free-ride"
  | "slalom"
  | "freestyle"
  | "tree-slalom";

type ObstacleType =
  | "tree"
  | "bare-tree"
  | "rock"
  | "stump"
  | "mogul"
  | "ramp"
  | "skier"
  | "dog"
  | "gate-left"
  | "gate-right";

type Obstacle = {
  id: number;
  type: ObstacleType;
  x: number;
  y: number;
  radius: number;
  phase: number;
  passed?: boolean;
  pair?: number;
};

const TAG_NAME = "downhill-ski";
const MIN_PACE = 0.8;
const MAX_PACE = 2.2;
const BASE_DOWNHILL_SPEED = 23;
const THROTTLE_SPEED_RANGE = 7;
const JUMP_GRAVITY = 18;
const MANUAL_JUMP_VELOCITY = 14.5;
const RAMP_JUMP_VELOCITY = 18;
const MOGUL_JUMP_VELOCITY = 10.5;
const TRICK_SPIN_VELOCITY = 4.25;
const AUTO_RESTART_DELAY = 10;
const MODES: SkiMode[] = [
  "free-ride",
  "slalom",
  "freestyle",
  "tree-slalom",
];
const MODE_LABELS: Record<SkiMode, string> = {
  "free-ride": "Free ride",
  slalom: "Slalom",
  freestyle: "Freestyle",
  "tree-slalom": "Tree slalom",
};

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const corner = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + corner, y);
  context.arcTo(x + width, y, x + width, y + height, corner);
  context.arcTo(x + width, y + height, x, y + height, corner);
  context.arcTo(x, y + height, x, y, corner);
  context.arcTo(x, y, x + width, y, corner);
  context.closePath();
}

export class DownhillSkiElement extends CanvasSaverElement {
  static observedAttributes = [
    ...CanvasSaverElement.observedAttributes,
    "seed",
    "speed",
    "mode",
  ];

  private random = createRandom(1);
  private obstacles: Obstacle[] = [];
  private nextObstacleId = 1;
  private generatedTo = 0;
  private nextGateAt = 34;
  private gatePair = 0;
  private nextGateSide = -1;
  private keys = new Set<string>();
  private playerX = 0;
  private distance = 0;
  private heading = 0;
  private targetHeading = 0;
  private throttle = 0;
  private runSeconds = 0;
  private score = 0;
  private gates = 0;
  private missedGates = 0;
  private jumpHeight = 0;
  private jumpVelocity = 0;
  private spin = 0;
  private spinVelocity = 0;
  private crashTimer = 0;
  private invulnerableTimer = 0;
  private introTimer = 4.8;
  private gameOver = false;
  private eaten = false;
  private yetiActive = false;
  private yetiX = 0;
  private yetiY = 0;
  private pointerActive = false;
  private pointerControlEnabled = false;
  private lastInputAt = -10;
  private autoTargetX = 0;
  private nextAutoDecision = 0;
  private restartCountdown = 0;
  private best = 0;
  private tracks: { x: number; y: number; angle: number; start: boolean }[] = [];
  private nextTrackAt = 0;
  private trackStart = true;

  constructor() {
    super();
    this.canvas.style.imageRendering = "pixelated";
    this.context.imageSmoothingEnabled = false;
  }

  get speed(): number {
    return clamp(
      Number(this.getAttribute("speed") ?? 1) || 1,
      MIN_PACE,
      MAX_PACE,
    );
  }

  set speed(value: number | string | null | undefined) {
    if (value === null || value === undefined || value === "") {
      this.removeAttribute("speed");
      return;
    }
    this.setAttribute(
      "speed",
      String(clamp(Number(value) || 1, MIN_PACE, MAX_PACE)),
    );
  }

  get mode(): SkiMode {
    const value = this.getAttribute("mode") as SkiMode | null;
    return value && MODES.includes(value) ? value : "free-ride";
  }

  set mode(value: SkiMode | string | null | undefined) {
    if (!value || !MODES.includes(value as SkiMode)) {
      this.removeAttribute("mode");
      return;
    }
    this.setAttribute("mode", value);
  }

  restart(seed?: string | number) {
    if (seed !== undefined) this.setAttribute("seed", String(seed));
    this.resetScene();
    this.requestDraw();
  }

  protected get resolutionScale() {
    return 0.9;
  }

  protected get maxCanvasWidth() {
    return 640;
  }

  protected get maxCanvasHeight() {
    return 420;
  }

  protected elementDidConnect() {
    this.removeAttribute("aria-hidden");
    this.setAttribute("role", "application");
    this.setAttribute(
      "aria-label",
      "Powder Run autoplays by default. Click or tap to take control; use arrow keys, mouse, or touch to steer. Press Space to trick and R to restart.",
    );
    if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    this.addEventListener("keydown", this.handleKeyDown);
    this.addEventListener("keyup", this.handleKeyUp);
    this.addEventListener("pointerdown", this.handlePointerDown);
    this.addEventListener("pointermove", this.handlePointerMove);
    this.addEventListener("pointerup", this.handlePointerUp);
    this.addEventListener("pointercancel", this.handlePointerUp);
    this.addEventListener("contextmenu", this.preventContextMenu);
    this.loadBest();
  }

  protected elementDidDisconnect() {
    this.removeEventListener("keydown", this.handleKeyDown);
    this.removeEventListener("keyup", this.handleKeyUp);
    this.removeEventListener("pointerdown", this.handlePointerDown);
    this.removeEventListener("pointermove", this.handlePointerMove);
    this.removeEventListener("pointerup", this.handlePointerUp);
    this.removeEventListener("pointercancel", this.handlePointerUp);
    this.removeEventListener("contextmenu", this.preventContextMenu);
    this.keys.clear();
  }

  protected attributeDidChange(name: string) {
    if (name === "seed" || name === "mode") this.resetScene();
  }

  protected canvasDidResize() {
    this.context.imageSmoothingEnabled = false;
  }

  protected resetScene() {
    this.random = createRandom(
      seedFrom(`${this.getAttribute("seed") ?? "1991"}:${this.mode}`),
    );
    this.obstacles = [];
    this.tracks = [];
    this.nextTrackAt = 0;
    this.trackStart = true;
    this.nextObstacleId = 1;
    this.generatedTo = 0;
    this.nextGateAt = 34;
    this.gatePair = 0;
    this.nextGateSide = -1;
    this.playerX = 0;
    this.distance = 0;
    this.heading = 0;
    this.targetHeading = 0;
    this.throttle = 0;
    this.runSeconds = 0;
    this.score = 0;
    this.gates = 0;
    this.missedGates = 0;
    this.jumpHeight = 0;
    this.jumpVelocity = 0;
    this.spin = 0;
    this.spinVelocity = 0;
    this.crashTimer = 0;
    this.invulnerableTimer = 0;
    this.introTimer = 4.8;
    this.gameOver = false;
    this.eaten = false;
    this.yetiActive = false;
    this.yetiX = 0;
    this.yetiY = 0;
    this.pointerActive = false;
    this.pointerControlEnabled = false;
    this.lastInputAt = -10;
    this.autoTargetX = 0;
    this.nextAutoDecision = 0;
    this.restartCountdown = 0;
    this.loadBest();
    this.generateCourse(95);
  }

  private loadBest() {
    try {
      if (typeof localStorage === "undefined") return;
      const stored = Number(localStorage.getItem(`screenjoy:powder-run:${this.mode}`) ?? 0);
      this.best = Number.isFinite(stored) && stored >= 0 ? stored : 0;
    } catch {
      this.best = 0;
    }
  }

  private saveBest() {
    if (this.score <= this.best) return;
    this.best = this.score;
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(
        `screenjoy:powder-run:${this.mode}`,
        String(Math.floor(this.best)),
      );
    } catch {
      // Storage is optional. The run still works in restricted contexts.
    }
  }

  private handleKeyDown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (
      [
        "arrowleft",
        "arrowright",
        "arrowup",
        "arrowdown",
        "a",
        "d",
        "w",
        "s",
        " ",
        "r",
        "enter",
      ].includes(key)
    ) {
      event.preventDefault();
    }
    if (key === "r" || (this.gameOver && (key === "enter" || key === " "))) {
      this.restart();
      return;
    }
    if (key === " " && !event.repeat) this.tryJump();
    this.keys.add(key);
    this.noteInput();
  };

  private handleKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.key.toLowerCase());
  };

  private handlePointerDown = (event: PointerEvent) => {
    event.preventDefault();
    this.focus({ preventScroll: true });
    if (this.gameOver) {
      this.restart();
      return;
    }
    this.pointerControlEnabled = true;
    this.pointerActive = true;
    this.setPointerCapture?.(event.pointerId);
    this.updatePointerControl(event);
    this.tryJump();
  };

  private handlePointerMove = (event: PointerEvent) => {
    if (!this.shouldAcceptPointerMove(event.pointerType)) return;
    this.updatePointerControl(event);
  };

  private handlePointerUp = (event: PointerEvent) => {
    this.pointerActive = false;
    if (this.hasPointerCapture?.(event.pointerId)) {
      this.releasePointerCapture(event.pointerId);
    }
  };

  private preventContextMenu = (event: Event) => {
    event.preventDefault();
  };

  private shouldAcceptPointerMove(pointerType: string) {
    return (
      this.pointerControlEnabled &&
      (pointerType !== "touch" || this.pointerActive)
    );
  }

  private updatePointerControl(event: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const horizontal = (event.clientX - rect.left) / rect.width;
    const vertical = (event.clientY - rect.top) / rect.height;
    this.targetHeading = clamp((horizontal - 0.5) * 2.2, -1.08, 1.08);
    this.throttle = clamp((vertical - 0.48) * 2.4, -1, 1);
    this.noteInput();
  }

  private noteInput() {
    this.lastInputAt = this.runSeconds;
    this.introTimer = Math.min(this.introTimer, 0.8);
  }

  private tryJump() {
    if (this.crashTimer > 0 || this.gameOver) return;
    const turn =
      this.keys.has("arrowleft") || this.keys.has("a")
        ? -1
        : this.keys.has("arrowright") || this.keys.has("d")
          ? 1
          : (this.targetHeading || this.heading) < 0
            ? -1
            : 1;
    if (this.jumpHeight <= 0.01) {
      this.jumpVelocity = MANUAL_JUMP_VELOCITY;
      this.spinVelocity = turn * TRICK_SPIN_VELOCITY;
    } else {
      this.spinVelocity = clamp(
        this.spinVelocity + turn * TRICK_SPIN_VELOCITY,
        -TRICK_SPIN_VELOCITY * 2,
        TRICK_SPIN_VELOCITY * 2,
      );
    }
  }

  private addObstacle(
    type: ObstacleType,
    x: number,
    y: number,
    radius: number,
    pair?: number,
  ) {
    this.obstacles.push({
      id: this.nextObstacleId,
      type,
      x,
      y,
      radius,
      phase: this.random() * Math.PI * 2,
      pair,
    });
    this.nextObstacleId += 1;
  }

  private generateGate(y: number) {
    this.gatePair += 1;
    const openingCenter =
      this.playerX +
      this.nextGateSide * (10 + this.random() * 14) +
      (this.random() - 0.5) * 7;
    const openingHalfWidth = this.mode === "tree-slalom" ? 6.2 : 7.5;
    this.addObstacle(
      "gate-left",
      openingCenter - openingHalfWidth,
      y,
      1.1,
      this.gatePair,
    );
    this.addObstacle(
      "gate-right",
      openingCenter + openingHalfWidth,
      y,
      1.1,
      this.gatePair,
    );
    this.nextGateSide *= -1;
    this.nextGateAt += this.mode === "tree-slalom" ? 24 : 29;
  }

  private generateCourse(targetDistance: number) {
    const mode = this.mode;
    while (this.generatedTo < targetDistance) {
      this.generatedTo += 6 + this.random() * 5;
      const y = this.generatedTo;

      if (
        (mode === "slalom" || mode === "tree-slalom") &&
        y >= this.nextGateAt
      ) {
        this.generateGate(y);
      }

      const density =
        mode === "tree-slalom"
          ? 0.92
          : mode === "freestyle"
            ? 0.52
            : 0.68;
      if (this.random() > density) continue;

      const count =
        mode === "tree-slalom" && this.random() < 0.42
          ? 3
          : this.random() < 0.2
            ? 2
            : 1;
      for (let index = 0; index < count; index += 1) {
        const x =
          this.playerX +
          (this.random() - 0.5) * 94 +
          (index - (count - 1) / 2) * 6;
        const roll = this.random();
        let type: ObstacleType;
        let radius: number;

        if (mode === "freestyle" && roll < 0.31) {
          type = "ramp";
          radius = 3.5;
        } else if (roll < 0.49) {
          type = "tree";
          radius = 2.6;
        } else if (roll < 0.59) {
          type = "bare-tree";
          radius = 2.4;
        } else if (roll < 0.7) {
          type = "rock";
          radius = 2.1;
        } else if (roll < 0.78) {
          type = "stump";
          radius = 1.8;
        } else if (roll < 0.87) {
          type = "mogul";
          radius = 2.3;
        } else if (roll < 0.93) {
          type = "ramp";
          radius = 3.5;
        } else if (roll < 0.97) {
          type = "skier";
          radius = 2;
        } else {
          type = "dog";
          radius = 1.7;
        }
        this.addObstacle(type, x, y + index * 2, radius);
      }
    }
  }

  private updateAutopilot(deltaSeconds: number) {
    if (this.runSeconds - this.lastInputAt < 4.5) return;
    this.nextAutoDecision -= deltaSeconds;
    if (this.nextAutoDecision <= 0) {
      this.nextAutoDecision = 0.35 + this.random() * 0.35;
      const hazards = this.obstacles.filter(
        (obstacle) =>
          obstacle.y > this.distance + 5 &&
          obstacle.y < this.distance + 31 &&
          !obstacle.type.startsWith("gate"),
      );
      const nearest = hazards
        .filter((obstacle) => Math.abs(obstacle.x - this.playerX) < 8)
        .sort((a, b) => a.y - b.y)[0];

      if (nearest) {
        this.autoTargetX =
          nearest.x +
          (nearest.x > this.playerX ? -1 : 1) *
            (10 + this.random() * 5);
      } else if (Math.abs(this.autoTargetX - this.playerX) < 4) {
        this.autoTargetX = this.playerX + (this.random() - 0.5) * 30;
      }
    }
    this.targetHeading = clamp(
      (this.autoTargetX - this.playerX) * 0.055,
      -0.72,
      0.72,
    );
    this.throttle = 0.15;
  }

  private checkGates() {
    const passedPairs = new Set<number>();
    for (const obstacle of this.obstacles) {
      if (
        obstacle.pair === undefined ||
        obstacle.passed ||
        obstacle.y > this.distance
      ) {
        continue;
      }
      passedPairs.add(obstacle.pair);
    }

    for (const pair of passedPairs) {
      const posts = this.obstacles.filter((obstacle) => obstacle.pair === pair);
      if (posts.some((post) => post.passed)) continue;
      const left = posts.find((post) => post.type === "gate-left");
      const right = posts.find((post) => post.type === "gate-right");
      if (!left || !right) continue;
      const madeGate = this.playerX > left.x && this.playerX < right.x;
      if (madeGate) {
        this.gates += 1;
        this.score += 250 + this.gates * 15;
      } else {
        this.missedGates += 1;
        this.score = Math.max(0, this.score - 100);
      }
      left.passed = true;
      right.passed = true;
    }
  }

  private crash(obstacle?: Obstacle) {
    if (this.invulnerableTimer > 0 || this.crashTimer > 0 || this.gameOver) {
      return;
    }
    this.crashTimer = 1.35;
    this.invulnerableTimer = 2.2;
    this.jumpHeight = 0;
    this.jumpVelocity = 0;
    this.spinVelocity = 0;
    this.score = Math.max(0, this.score - 125);
    if (obstacle) obstacle.passed = true;
  }

  private landJump() {
    const turns = this.spin / (Math.PI * 2);
    const nearestTurn = Math.round(turns);
    const landingError = Math.abs(turns - nearestTurn);
    const trickTurns = Math.abs(nearestTurn);
    if (landingError > 0.18 && Math.abs(this.spinVelocity) > 1.2) {
      this.crash();
    } else if (trickTurns > 0) {
      this.score += trickTurns * 400;
    } else {
      this.score += 25;
    }
    this.jumpHeight = 0;
    this.jumpVelocity = 0;
    this.spin = 0;
    this.spinVelocity = 0;
  }

  private checkCollisions() {
    if (this.jumpHeight > 0.75 || this.crashTimer > 0) return;
    for (const obstacle of this.obstacles) {
      if (obstacle.passed || obstacle.type.startsWith("gate")) continue;
      const dy = obstacle.y - this.distance;
      if (Math.abs(dy) > obstacle.radius + 1.7) continue;
      const dx = obstacle.x - this.playerX;
      if (Math.abs(dx) > obstacle.radius + 1.45) continue;

      if (obstacle.type === "ramp") {
        obstacle.passed = true;
        this.jumpVelocity = RAMP_JUMP_VELOCITY;
        this.jumpHeight = 0.08;
        this.score += 50;
      } else if (obstacle.type === "mogul") {
        obstacle.passed = true;
        this.jumpVelocity = MOGUL_JUMP_VELOCITY;
        this.jumpHeight = 0.05;
        this.score += 10;
      } else {
        this.crash(obstacle);
      }
      break;
    }
  }

  private updateMovingObstacles(deltaSeconds: number) {
    for (const obstacle of this.obstacles) {
      if (obstacle.type === "skier") {
        obstacle.x += Math.sin(this.runSeconds * 1.4 + obstacle.phase) *
          deltaSeconds *
          7;
        obstacle.y += deltaSeconds * 7.5;
      } else if (obstacle.type === "dog") {
        obstacle.x += Math.sin(this.runSeconds * 2.2 + obstacle.phase) *
          deltaSeconds *
          12;
        obstacle.y += deltaSeconds * 4.5;
      }
    }
  }

  private updateYeti(deltaSeconds: number) {
    if (!this.yetiActive && this.distance >= 2000) {
      this.yetiActive = true;
      this.yetiX = this.playerX + (this.random() - 0.5) * 36;
      this.yetiY = this.distance - 25;
    }
    if (!this.yetiActive) return;

    const chaseSpeed = 23.5 * this.speed;
    this.yetiY += chaseSpeed * deltaSeconds;
    this.yetiX +=
      clamp(this.playerX - this.yetiX, -1, 1) * chaseSpeed * 0.72 * deltaSeconds;
    if (
      this.yetiY > this.distance - 1.5 &&
      Math.abs(this.yetiX - this.playerX) < 4.5
    ) {
      this.gameOver = true;
      this.eaten = true;
      this.restartCountdown = AUTO_RESTART_DELAY;
      this.saveBest();
    }
  }

  protected updateFrame(deltaSeconds: number) {
    this.introTimer = Math.max(0, this.introTimer - deltaSeconds);
    if (this.gameOver) {
      this.restartCountdown = Math.max(
        0,
        this.restartCountdown - deltaSeconds,
      );
      if (this.restartCountdown <= 0) this.restart();
      return;
    }

    this.runSeconds += deltaSeconds;
    this.invulnerableTimer = Math.max(0, this.invulnerableTimer - deltaSeconds);
    this.updateAutopilot(deltaSeconds);

    const left = this.keys.has("arrowleft") || this.keys.has("a");
    const right = this.keys.has("arrowright") || this.keys.has("d");
    const brake = this.keys.has("arrowup") || this.keys.has("w");
    const tuck = this.keys.has("arrowdown") || this.keys.has("s");
    if (left || right) {
      this.targetHeading = clamp(
        this.targetHeading + (right ? 1 : -1) * deltaSeconds * 2.35,
        -1.12,
        1.12,
      );
    }
    if (brake) this.throttle = -1;
    else if (tuck) this.throttle = 1;
    else if (!this.pointerActive) this.throttle *= 0.9;

    const headingEase = 1 - Math.exp(-deltaSeconds * 7.5);
    this.heading += (this.targetHeading - this.heading) * headingEase;

    if (this.crashTimer > 0) {
      this.crashTimer = Math.max(0, this.crashTimer - deltaSeconds);
      this.heading *= Math.max(0, 1 - deltaSeconds * 4);
      this.targetHeading = this.heading;
      if (this.crashTimer === 0) this.score += 5;
    } else {
      const baseSpeed =
        (BASE_DOWNHILL_SPEED + this.throttle * THROTTLE_SPEED_RANGE) *
        this.speed;
      const downhillSpeed = Math.max(2.2, Math.cos(this.heading) * baseSpeed);
      this.distance += downhillSpeed * deltaSeconds;
      this.playerX += Math.sin(this.heading) * baseSpeed * 1.25 * deltaSeconds;
      this.score += downhillSpeed * deltaSeconds * 0.7;
    }

    if (this.jumpHeight > 0 || this.jumpVelocity > 0) {
      this.jumpVelocity -= JUMP_GRAVITY * deltaSeconds;
      this.jumpHeight += this.jumpVelocity * deltaSeconds;
      this.spin += this.spinVelocity * deltaSeconds;
      this.spinVelocity *= Math.pow(0.9995, deltaSeconds * 60);
      if (this.jumpHeight <= 0) this.landJump();
    }

    this.updateMovingObstacles(deltaSeconds);
    this.generateCourse(this.distance + 105);
    this.checkGates();
    this.checkCollisions();
    this.updateYeti(deltaSeconds);
    this.recordTracks();
    this.obstacles = this.obstacles.filter(
      (obstacle) => obstacle.y > this.distance - 38,
    );
    this.saveBest();
  }

  private recordTracks() {
    if (this.jumpHeight > 0 || this.crashTimer > 0 || this.gameOver) {
      this.trackStart = true;
      return;
    }
    if (this.runSeconds < this.nextTrackAt) return;
    this.nextTrackAt = this.runSeconds + 0.06;
    this.tracks.push({
      x: this.playerX,
      y: this.distance,
      angle: Math.atan2(Math.sin(this.heading) * 1.25, Math.cos(this.heading)),
      start: this.trackStart,
    });
    this.trackStart = false;
    this.tracks = this.tracks.filter((point) => point.y > this.distance - 45).slice(-180);
  }

  private screenPosition(obstacle: Pick<Obstacle, "x" | "y">) {
    const scale = Math.max(2.3, this.canvasHeight / 105);
    return {
      x: this.canvasWidth / 2 + (obstacle.x - this.playerX) * scale,
      y: this.canvasHeight * 0.43 + (obstacle.y - this.distance) * scale,
      // The slope uses an overhead camera, so objects keep their size as they pass.
      scale: 1,
    };
  }

  private drawSnow() {
    const context = this.context;
    const width = this.canvasWidth;
    const height = this.canvasHeight;
    context.fillStyle = "#f8fcff";
    context.fillRect(0, 0, width, height);

    // Anchor snow detail to world coordinates, using the same camera as obstacles.
    const scale = Math.max(2.3, height / 105);
    const left = this.playerX - width / (2 * scale);
    const top = this.distance - height * 0.43 / scale;
    for (let row = Math.floor(top / 9); row < (top + height / scale) / 9 + 1; row++) {
      for (let column = Math.floor(left / 13); column < (left + width / scale) / 13 + 1; column++) {
        const hash = Math.imul(column, 374761393) ^ Math.imul(row, 668265263);
        const noise = (hash ^ (hash >>> 13)) >>> 0;
        const point = this.screenPosition({
          x: column * 13 + (noise % 101) / 10,
          y: row * 9 + ((noise >>> 8) % 61) / 10,
        });
        context.fillStyle = noise % 4 === 0 ? "#dcebf3" : "#e7f1f7";
        context.fillRect(Math.round(point.x), Math.round(point.y), 2 + noise % 4, 1);
        if (noise % 7 === 0) {
          context.fillStyle = "#ffffff";
          context.fillRect(Math.round(point.x) - 2, Math.round(point.y) - 2, 9, 1);
        }
      }
    }

    context.save();
    context.strokeStyle = "#cedfea";
    context.lineWidth = 1;
    context.lineCap = "round";
    for (const side of [-1, 1]) {
      context.beginPath();
      for (const point of this.tracks) {
        const screen = this.screenPosition(point);
        const x = screen.x + side * Math.cos(point.angle) * 4;
        const y = screen.y - side * Math.sin(point.angle) * 4;
        if (point.start) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    }
    context.restore();
  }

  private drawShadow(x: number, y: number, width: number, alpha = 0.16) {
    const context = this.context;
    context.save();
    context.globalAlpha = alpha;
    context.fillStyle = "#31536a";
    context.beginPath();
    context.ellipse(x + 2, y + 3, width, width * 0.34, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  private drawTree(x: number, y: number, scale: number, bare = false) {
    const context = this.context;
    context.save();
    context.translate(Math.round(x), Math.round(y));
    context.scale(scale, scale);
    this.drawShadow(0, 0, 7);
    context.fillStyle = "#6c3b24";
    context.fillRect(-2, -12, 4, 15);
    context.fillStyle = "#a47753";
    context.fillRect(-2, -10, 1, 11);
    if (bare) {
      context.strokeStyle = "#5b321f";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(0, -10);
      context.lineTo(-7, -20);
      context.moveTo(0, -13);
      context.lineTo(7, -23);
      context.moveTo(-4, -17);
      context.lineTo(-8, -24);
      context.moveTo(5, -20);
      context.lineTo(10, -25);
      context.stroke();
      context.strokeStyle = "#dceaf1";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(-7, -21);
      context.lineTo(-3, -17);
      context.moveTo(3, -19);
      context.lineTo(7, -24);
      context.stroke();
    } else {
      // Layered boughs share the upper-left light used by rocks and skiers.
      for (const [tip, base, halfWidth] of [[-35, -19, 9], [-28, -12, 12], [-20, -5, 15]]) {
        context.fillStyle = "#195949";
        context.beginPath();
        context.moveTo(0, tip);
        context.lineTo(halfWidth, base);
        context.lineTo(halfWidth * 0.4, base + 2);
        context.lineTo(-halfWidth, base);
        context.closePath();
        context.fill();
        context.fillStyle = "#2c8064";
        context.beginPath();
        context.moveTo(0, tip + 1);
        context.lineTo(-halfWidth, base);
        context.lineTo(-1, base - 1);
        context.closePath();
        context.fill();
        context.fillStyle = "#d9eaf0";
        context.beginPath();
        context.moveTo(0, tip);
        context.lineTo(halfWidth * 0.65, base - 5);
        context.lineTo(1, base - 7);
        context.lineTo(-halfWidth * 0.7, base - 4);
        context.closePath();
        context.fill();
        context.fillStyle = "#ffffff";
        context.beginPath();
        context.moveTo(0, tip);
        context.lineTo(0, base - 8);
        context.lineTo(-halfWidth * 0.7, base - 4);
        context.closePath();
        context.fill();
      }
    }
    context.restore();
  }

  private drawRock(x: number, y: number, scale: number) {
    const context = this.context;
    context.save();
    context.translate(Math.round(x), Math.round(y));
    context.scale(scale, scale);
    this.drawShadow(0, 0, 7);
    context.fillStyle = "#657582";
    context.beginPath();
    context.moveTo(-8, 0);
    context.lineTo(-5, -8);
    context.lineTo(2, -12);
    context.lineTo(9, -5);
    context.lineTo(8, 1);
    context.closePath();
    context.fill();
    context.fillStyle = "#a0b6c4";
    context.beginPath();
    context.moveTo(-4, -7);
    context.lineTo(2, -10);
    context.lineTo(5, -6);
    context.lineTo(-1, -4);
    context.closePath();
    context.fill();
    context.fillStyle = "#f8fcff";
    context.beginPath();
    context.moveTo(-5, -8);
    context.lineTo(2, -12);
    context.lineTo(7, -7);
    context.lineTo(1, -8);
    context.lineTo(-3, -5);
    context.closePath();
    context.fill();
    context.restore();
  }

  private drawStump(x: number, y: number, scale: number) {
    const context = this.context;
    context.save();
    context.translate(Math.round(x), Math.round(y));
    context.scale(scale, scale);
    this.drawShadow(0, 0, 6);
    context.fillStyle = "#6c3a22";
    context.fillRect(-6, -7, 12, 8);
    context.fillStyle = "#956442";
    context.fillRect(-4, -5, 2, 5);
    context.fillRect(2, -5, 1, 5);
    context.fillStyle = "#cea574";
    context.beginPath();
    context.ellipse(0, -7, 6, 3, 0, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#754323";
    context.lineWidth = 1;
    context.stroke();
    context.beginPath();
    context.ellipse(0, -7, 3, 1.5, 0, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = "#f8fcff";
    context.fillRect(-6, -9, 7, 2);
    context.restore();
  }

  private drawMogul(x: number, y: number, scale: number) {
    const context = this.context;
    context.save();
    context.translate(Math.round(x), Math.round(y));
    context.scale(scale, scale);
    this.drawShadow(0, -1, 10, 0.08);
    context.fillStyle = "#d4e7f4";
    context.beginPath();
    context.ellipse(0, -1, 11, 5, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.ellipse(-2, -3, 8, 3, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  private drawRamp(x: number, y: number, scale: number) {
    const context = this.context;
    context.save();
    context.translate(Math.round(x), Math.round(y));
    context.scale(scale, scale);
    this.drawShadow(0, 2, 10, 0.12);
    context.fillStyle = "#bdd3e2";
    context.beginPath();
    context.moveTo(-11, 3);
    context.lineTo(-9, -9);
    context.lineTo(9, -9);
    context.lineTo(12, 3);
    context.closePath();
    context.fill();
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.moveTo(-11, 3);
    context.lineTo(-9, -9);
    context.lineTo(9, -9);
    context.lineTo(9, -3);
    context.closePath();
    context.fill();
    context.strokeStyle = "#6f96ae";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(-9, -9);
    context.lineTo(9, -9);
    context.lineTo(12, 3);
    context.stroke();
    context.fillStyle = "#e95643";
    context.fillRect(-8, -9, 16, 2);
    context.fillStyle = "#ffffff";
    context.fillRect(-5, -9, 3, 2);
    context.fillRect(3, -9, 3, 2);
    context.restore();
  }

  private drawGate(
    x: number,
    y: number,
    scale: number,
    type: "gate-left" | "gate-right",
  ) {
    const context = this.context;
    const color = type === "gate-left" ? "#e34935" : "#3475c9";
    context.save();
    context.translate(Math.round(x), Math.round(y));
    context.scale(scale, scale);
    this.drawShadow(0, 1, 4, 0.12);
    context.fillStyle = "#30343a";
    context.fillRect(-1, -19, 2, 21);
    const side = type === "gate-left" ? -1 : 1;
    const flutter = Math.sin(this.runSeconds * 3 + x * 0.1);
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(side, -19);
    context.lineTo(side * 10, -18 + flutter);
    context.lineTo(side * 10, -12 + flutter);
    context.lineTo(side, -13);
    context.closePath();
    context.fill();
    context.fillStyle = "#ffffff";
    context.fillRect(side < 0 ? -4 : 2, -17, 2, 3);
    context.fillRect(-1, -20, 2, 2);
    context.restore();
  }

  private drawDog(x: number, y: number, scale: number, phase: number) {
    const context = this.context;
    context.save();
    context.translate(Math.round(x), Math.round(y));
    context.scale(scale, scale);
    this.drawShadow(0, 1, 6);
    if (Math.sin(this.runSeconds * 2.2 + phase) < 0) context.scale(-1, 1);
    context.fillStyle = "#9a6037";
    context.fillRect(-6, -7, 10, 7);
    context.fillRect(3, -10, 6, 6);
    context.fillStyle = "#c58c57";
    context.fillRect(-5, -7, 8, 2);
    context.fillRect(5, -9, 4, 2);
    context.fillStyle = "#e95643";
    context.fillRect(3, -5, 4, 2);
    context.strokeStyle = "#9a6037";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(-6, -5);
    context.lineTo(-9, -9);
    context.stroke();
    context.fillStyle = "#263e4a";
    context.fillRect(8, -8, 1, 1);
    context.fillRect(9, -6, 2, 2);
    context.fillStyle = "#54311e";
    context.fillRect(4, -12, 2, 4);
    context.fillRect(8, -12, 2, 4);
    const leg = Math.sin(this.runSeconds * 12 + phase) > 0 ? 1 : -1;
    context.fillRect(-4, 0, 2, 3 + leg);
    context.fillRect(2, 0, 2, 3 - leg);
    context.restore();
  }

  private drawOtherSkier(x: number, y: number, scale: number, phase: number) {
    const lateralSpeed = Math.sin(this.runSeconds * 1.4 + phase) * 7;
    const angle = Math.atan2(lateralSpeed / 1.25, 7.5);
    this.drawShadow(x, y, 7 * scale);
    this.drawSkier(x, y, scale * 0.85, angle, 0, false, "#7964b5");
  }

  private drawSkier(
    x: number,
    y: number,
    scale: number,
    angle: number,
    spin: number,
    crashed: boolean,
    coat = "#ee4939",
  ) {
    const context = this.context;
    context.save();
    context.translate(Math.round(x), Math.round(y));
    context.scale(scale, scale);
    context.rotate(crashed ? Math.PI / 2.3 : spin);

    // Positive heading travels right. Canvas rotation is clockwise, so turn
    // the local +Y ski axis counterclockwise to match that velocity.
    const skiAngle = Math.atan2(Math.sin(angle) * 1.25, Math.cos(angle));
    context.save();
    context.rotate(-skiAngle);
    context.lineCap = "round";
    context.lineJoin = "round";
    for (const side of [-1, 1]) {
      const skiX = side * 4;
      context.strokeStyle = "#1c2933";
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(skiX, -8);
      context.lineTo(skiX, 12);
      context.lineTo(skiX + 0.5, 14);
      context.stroke();
      context.strokeStyle = "#f4bd45";
      context.lineWidth = 1.2;
      context.beginPath();
      context.moveTo(skiX - 0.3, -6);
      context.lineTo(skiX - 0.3, 11);
      context.stroke();
      context.fillStyle = "#20364a";
      context.fillRect(skiX - 1.5, -1, 3, 5);
      context.fillStyle = "#f8fcff";
      context.fillRect(skiX - 1, 1, 2, 1);
    }
    context.strokeStyle = "#253d58";
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(-3, -7);
    context.lineTo(-4, 1);
    context.moveTo(3, -7);
    context.lineTo(4, 1);
    context.stroke();
    context.restore();

    // Keep the torso upright in the overhead view, with a small carving lean.
    context.translate(Math.sin(angle) * 2, 0);
    context.rotate(-angle * 0.18);
    // Anchor each pole to its glove while the basket trails opposite travel.
    const poleX = Math.sin(skiAngle - angle * 0.18) * 11;
    const poleY = Math.cos(skiAngle - angle * 0.18) * 11;
    context.strokeStyle = "#627f92";
    context.lineWidth = 1;
    for (const side of [-1, 1]) {
      const basketX = side * 11 - poleX;
      const basketY = -7 - poleY;
      context.beginPath();
      context.moveTo(side * 8, -7);
      context.lineTo(basketX, basketY);
      context.stroke();
      context.fillStyle = "#344e61";
      context.fillRect(basketX - 2, basketY, 4, 1);
    }

    context.fillStyle = "#263f55";
    roundedRect(context, -6, -16, 12, 12, 3);
    context.fill();
    context.fillStyle = coat;
    roundedRect(context, -6, -16, 12, 10, 3);
    context.fill();
    context.fillRect(-8, -13, 3, 6);
    context.fillRect(5, -13, 3, 6);
    context.fillStyle = "#ffffff";
    context.fillRect(-4, -14, 2, 6);
    context.fillRect(-4, -14, 8, 1);
    context.fillStyle = "#253d58";
    context.fillRect(-9, -8, 3, 3);
    context.fillRect(6, -8, 3, 3);
    context.fillStyle = "#efb28c";
    context.fillRect(-3, -18, 6, 3);
    context.fillStyle = "#174c72";
    roundedRect(context, -5, -24, 10, 9, 4);
    context.fill();
    context.fillStyle = "#3989b1";
    roundedRect(context, -4, -24, 7, 5, 2);
    context.fill();
    context.fillStyle = "#b7ebee";
    context.fillRect(-4, -18, 8, 2);
    context.fillStyle = "#ffffff";
    context.fillRect(-3, -18, 3, 1);
    context.restore();
  }

  private drawYeti() {
    if (!this.yetiActive) return;
    const obstacle: Obstacle = {
      id: -1,
      type: "tree",
      x: this.yetiX,
      y: this.yetiY,
      radius: 4,
      phase: 0,
    };
    const position = this.screenPosition(obstacle);
    if (position.y < -40 || position.y > this.canvasHeight + 40) return;
    const context = this.context;
    const bob = Math.sin(this.runSeconds * 10) * 2;
    context.save();
    context.translate(Math.round(position.x), Math.round(position.y));
    context.scale(position.scale * 1.05, position.scale * 1.05);
    this.drawShadow(0, 5, 12, 0.2);
    context.translate(0, bob);
    context.fillStyle = "#f2f5f6";
    context.fillRect(-10, -22, 20, 25);
    context.fillRect(-15, -18, 5, 18);
    context.fillRect(10, -18, 5, 18);
    context.fillRect(-9, 3, 7, 8);
    context.fillRect(2, 3, 7, 8);
    context.fillStyle = "#d4e3eb";
    context.fillRect(6, -20, 4, 22);
    context.fillRect(12, -16, 3, 16);
    context.fillRect(-9, 8, 7, 3);
    context.fillRect(2, 8, 7, 3);
    context.fillStyle = "#ffffff";
    context.fillRect(-9, -21, 4, 17);
    context.fillRect(-5, -21, 10, 3);
    context.fillStyle = "#b9cbd2";
    context.fillRect(-7, -28, 14, 10);
    context.fillStyle = "#1c2830";
    context.fillRect(-5, -24, 3, 3);
    context.fillRect(3, -24, 3, 3);
    context.fillRect(-4, -18, 8, 3);
    context.fillStyle = "#ee4939";
    context.fillRect(-3, -17, 6, 2);
    context.restore();
  }

  private drawObstacle(obstacle: Obstacle) {
    const position = this.screenPosition(obstacle);
    if (
      position.x < -45 ||
      position.x > this.canvasWidth + 45 ||
      position.y < -55 ||
      position.y > this.canvasHeight + 55
    ) {
      return;
    }
    switch (obstacle.type) {
      case "tree":
        this.drawTree(position.x, position.y, position.scale);
        break;
      case "bare-tree":
        this.drawTree(position.x, position.y, position.scale, true);
        break;
      case "rock":
        this.drawRock(position.x, position.y, position.scale);
        break;
      case "stump":
        this.drawStump(position.x, position.y, position.scale);
        break;
      case "mogul":
        this.drawMogul(position.x, position.y, position.scale);
        break;
      case "ramp":
        this.drawRamp(position.x, position.y, position.scale);
        break;
      case "gate-left":
      case "gate-right":
        this.drawGate(position.x, position.y, position.scale, obstacle.type);
        break;
      case "skier":
        this.drawOtherSkier(
          position.x,
          position.y,
          position.scale,
          obstacle.phase,
        );
        break;
      case "dog":
        this.drawDog(
          position.x,
          position.y,
          position.scale,
          obstacle.phase,
        );
        break;
    }
  }

  private drawHud() {
    const context = this.context;
    const width = this.canvasWidth;
    context.save();
    context.font = '700 11px "Courier New", monospace';
    context.textBaseline = "top";
    context.fillStyle = "rgba(248, 252, 255, 0.92)";
    roundedRect(context, 9, 9, Math.min(244, width - 18), 45, 3);
    context.fill();
    context.strokeStyle = "#8ba5b6";
    context.lineWidth = 1;
    context.stroke();
    context.fillStyle = "#142430";
    context.fillText(`${Math.floor(this.distance)} m`, 17, 16);
    context.fillText(
      `${String(Math.floor(this.score)).padStart(6, "0")} pts`,
      17,
      33,
    );
    context.fillStyle = "#426176";
    context.textAlign = "right";
    context.fillText(MODE_LABELS[this.mode].toUpperCase(), Math.min(244, width - 18), 16);
    const detail =
      this.mode === "slalom" || this.mode === "tree-slalom"
        ? `${this.gates} gates · ${this.missedGates} missed`
        : `best ${Math.floor(this.best)}`;
    context.fillText(detail, Math.min(244, width - 18), 33);

    if (this.yetiActive && !this.gameOver) {
      context.fillStyle = "#d93d31";
      context.textAlign = "right";
      context.fillText(
        "⚠ SOMETHING HUNGRY IS CLOSE",
        width - 12,
        13,
      );
    }
    context.restore();
  }

  private drawIntro() {
    if (this.introTimer <= 0 || this.gameOver) return;
    const context = this.context;
    const width = this.canvasWidth;
    const height = this.canvasHeight;
    const panelWidth = Math.min(310, width - 32);
    const alpha =
      this.introTimer < 0.7 ? clamp(this.introTimer / 0.7, 0, 1) : 1;
    context.save();
    context.globalAlpha = alpha;
    context.fillStyle = "rgba(11, 31, 43, 0.9)";
    roundedRect(
      context,
      (width - panelWidth) / 2,
      height * 0.67,
      panelWidth,
      58,
      3,
    );
    context.fill();
    context.fillStyle = "#ffffff";
    context.textAlign = "center";
    context.textBaseline = "top";
    context.font = '900 17px Arial, sans-serif';
    context.fillText("PICK A LINE. SEND IT.", width / 2, height * 0.67 + 10);
    context.fillStyle = "#b9e6f3";
    context.font = '700 9px "Courier New", monospace';
    const autoplaying = this.runSeconds - this.lastInputAt >= 4.5;
    context.fillText(
      autoplaying
        ? "AUTOPILOT ON · CLICK / TAP TO TAKE OVER"
        : "ARROWS / MOUSE / TOUCH · SPACE TO TRICK",
      width / 2,
      height * 0.67 + 36,
    );
    context.restore();
  }

  private drawGameOver() {
    if (!this.gameOver) return;
    const context = this.context;
    const width = this.canvasWidth;
    const height = this.canvasHeight;
    context.save();
    context.fillStyle = "rgba(7, 22, 31, 0.72)";
    context.fillRect(0, 0, width, height);
    const panelWidth = Math.min(360, width - 30);
    const panelHeight = 142;
    const x = (width - panelWidth) / 2;
    const y = (height - panelHeight) / 2;
    context.fillStyle = "#f8fcff";
    roundedRect(context, x, y, panelWidth, panelHeight, 4);
    context.fill();
    context.strokeStyle = "#172c39";
    context.lineWidth = 2;
    context.stroke();
    context.textAlign = "center";
    context.textBaseline = "top";
    context.fillStyle = "#d93d31";
    context.font = '900 24px Arial, sans-serif';
    context.fillText(
      this.eaten ? "YETI SNACK." : "RUN OVER.",
      width / 2,
      y + 20,
    );
    context.fillStyle = "#172c39";
    context.font = '700 12px "Courier New", monospace';
    context.fillText(
      `${Math.floor(this.distance)} m · ${Math.floor(this.score)} points`,
      width / 2,
      y + 59,
    );
    context.fillStyle = "#41647a";
    context.font = '700 10px "Courier New", monospace';
    context.fillText(
      `NEXT RUN IN ${Math.max(1, Math.ceil(this.restartCountdown))} · CLICK TO GO NOW`,
      width / 2,
      y + 94,
    );
    context.restore();
  }

  private drawPlayer() {
    const playerY = this.canvasHeight * 0.43;
    const airOffset = this.jumpHeight * Math.max(2.4, this.canvasHeight / 110);
    this.drawShadow(
      this.canvasWidth / 2,
      playerY,
      clamp(10 - this.jumpHeight * 0.35, 4, 10),
      clamp(0.2 - this.jumpHeight * 0.012, 0.05, 0.2),
    );
    const blink =
      this.invulnerableTimer > 0 &&
      Math.floor(this.invulnerableTimer * 10) % 2 === 0;
    if (!blink || this.crashTimer > 0) {
      this.drawSkier(
        this.canvasWidth / 2,
        playerY - airOffset,
        1,
        this.heading,
        this.spin,
        this.crashTimer > 0,
      );
    }
  }

  protected drawFrame() {
    this.drawSnow();
    const sorted = this.obstacles.map((obstacle) => ({
      y: obstacle.y,
      draw: () => this.drawObstacle(obstacle),
    }));
    sorted.push({ y: this.distance, draw: () => this.drawPlayer() });
    if (this.yetiActive) sorted.push({ y: this.yetiY, draw: () => this.drawYeti() });
    sorted.sort((a, b) => a.y - b.y);
    for (const sprite of sorted) sprite.draw();
    this.drawHud();
    this.drawIntro();
    this.drawGameOver();
  }
}

export function registerDownhillSki() {
  if (
    typeof customElements !== "undefined" &&
    !customElements.get(TAG_NAME)
  ) {
    customElements.define(TAG_NAME, DownhillSkiElement);
  }
}
