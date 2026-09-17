import {
  SaverElement,
  clamp,
  createRandom,
  seedFrom,
} from "@screenjoy/runtime";
import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DynamicDrawUsage,
  Fog,
  HemisphereLight,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";

type Vec3 = { x: number; y: number; z: number };
type PipeSegment = {
  from: Vec3;
  to: Vec3;
  color: number;
  progress: number;
};
type PipeJoint = {
  position: Vec3;
  color: number;
};
export type PipesMode = "classic" | "single";
export type PipesSeedChangeDetail = { seed: number };

const TAG_NAME = "pipes-saver";
const EXTENT = 4;
const DEFAULT_SEGMENT_LIMIT = 400;
const MAX_SEGMENTS = 500;
const MAX_JOINTS = 600;
const END_HOLD_SECONDS = 1.25;
const CELEBRATION_HOLD_SECONDS = 4;
const DIRECTIONS: Vec3[] = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
];
const OPPOSITE_DIRECTION = [1, 0, 3, 2, 5, 4];
const COLORS = [
  0xd63c22,
  0x287ce2,
  0x39b84a,
  0xf3bd21,
  0xa552d0,
  0x29aaa1,
];
const Y_AXIS = new Vector3(0, 1, 0);
const directionVector = new Vector3();
const instanceHelper = new Object3D();
const instanceColor = new Color();

function keyFor(point: Vec3) {
  return `${point.x},${point.y},${point.z}`;
}

function add(left: Vec3, right: Vec3): Vec3 {
  return {
    x: left.x + right.x,
    y: left.y + right.y,
    z: left.z + right.z,
  };
}

function interpolate(from: Vec3, to: Vec3, progress: number): Vec3 {
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
    z: from.z + (to.z - from.z) * progress,
  };
}

function inside(point: Vec3) {
  return (
    point.x >= -EXTENT &&
    point.x <= EXTENT &&
    point.y >= -EXTENT &&
    point.y <= EXTENT &&
    point.z >= -EXTENT &&
    point.z <= EXTENT
  );
}

export class PipesSaverElement extends SaverElement {
  static observedAttributes = [
    ...SaverElement.observedAttributes,
    "seed",
    "speed",
    "density",
    "mode",
  ];

  private random = createRandom(95);
  private segments: PipeSegment[] = [];
  private joints: PipeJoint[] = [];
  private occupied = new Set<string>();
  private currentPosition: Vec3 = { x: 0, y: 0, z: 0 };
  private currentDirection = 0;
  private currentColor = 0;
  private currentPipeLength = 0;
  private targetPipeLength = 12;
  private activeSegment?: PipeSegment;
  private resetCountdown = -1;
  private fade = 0;
  private complete = false;
  private advancingSeed = false;
  private celebration?: HTMLDivElement;
  private celebrationDetail?: HTMLSpanElement;

  private renderer?: WebGLRenderer;
  private scene?: Scene;
  private camera?: PerspectiveCamera;
  private segmentMesh?: InstancedMesh;
  private jointMesh?: InstancedMesh;
  private segmentGeometry?: CylinderGeometry;
  private jointGeometry?: SphereGeometry;
  private segmentMaterial?: MeshStandardMaterial;
  private jointMaterial?: MeshStandardMaterial;

  constructor() {
    super();

    const shadow = this.shadowRoot;
    if (!shadow) return;

    const style = document.createElement("style");
    style.textContent = `
      :host {
        position: relative;
      }

      .pipes-celebration {
        position: absolute;
        inset: 0;
        display: grid;
        place-content: center;
        gap: 10px;
        padding: 24px;
        background: radial-gradient(circle, rgb(3 3 3 / 26%), rgb(3 3 3 / 72%));
        color: #fff;
        font-family: "Arial Narrow", "Helvetica Neue", Arial, sans-serif;
        text-align: center;
        text-shadow: 0 2px 0 #000, 0 0 16px rgb(255 220 67 / 80%);
        pointer-events: none;
      }

      .pipes-celebration[hidden] {
        display: none;
      }

      .pipes-celebration::before,
      .pipes-celebration::after {
        color: #f3bd21;
        content: "✦  ★  ✦  ★  ✦";
        font-size: clamp(16px, 4vw, 28px);
        letter-spacing: 0.18em;
      }

      .pipes-celebration strong {
        font-size: clamp(24px, 7vw, 50px);
        font-weight: 900;
        letter-spacing: -0.04em;
        line-height: 0.9;
        text-transform: uppercase;
      }

      .pipes-celebration span {
        font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
        font-size: clamp(11px, 2.5vw, 16px);
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
    `;

    const celebration = document.createElement("div");
    celebration.className = "pipes-celebration";
    celebration.hidden = true;
    celebration.setAttribute("role", "status");
    celebration.setAttribute("aria-live", "polite");

    const title = document.createElement("strong");
    title.textContent = "COOLEST SEED FOUND!";
    const detail = document.createElement("span");
    celebration.append(title, detail);
    shadow.append(style, celebration);

    this.celebration = celebration;
    this.celebrationDetail = detail;
  }

  get speed(): number {
    return clamp(Number(this.getAttribute("speed") ?? 1) || 1, 0.2, 3);
  }

  set speed(value: number | string | null | undefined) {
    if (value === null || value === undefined || value === "") {
      this.removeAttribute("speed");
      return;
    }
    this.setAttribute("speed", String(clamp(Number(value) || 1, 0.2, 3)));
  }

  get density(): number {
    return clamp(Number(this.getAttribute("density") ?? 1) || 1, 0.5, 1.5);
  }

  set density(value: number | string | null | undefined) {
    if (value === null || value === undefined || value === "") {
      this.removeAttribute("density");
      return;
    }
    this.setAttribute("density", String(clamp(Number(value) || 1, 0.5, 1.5)));
  }

  get mode(): PipesMode {
    return this.getAttribute("mode") === "single" ? "single" : "classic";
  }

  set mode(value: PipesMode | string | null | undefined) {
    if (value === null || value === undefined || value === "") {
      this.removeAttribute("mode");
      return;
    }
    this.setAttribute("mode", value === "single" ? "single" : "classic");
  }

  regenerate(seed?: string | number) {
    if (seed !== undefined) {
      this.setAttribute("seed", String(seed));
    } else {
      this.setAttribute("seed", String(Math.floor(Math.random() * 99999)));
    }
  }

  protected get resolutionScale() {
    return 1;
  }

  protected get maxCanvasWidth() {
    return 720;
  }

  protected get maxCanvasHeight() {
    return 420;
  }

  protected elementDidConnect() {
    this.initializeRenderer();
  }

  protected resetScene() {
    const seed = seedFrom(this.getAttribute("seed") ?? "95");
    this.random = createRandom(seed);
    this.segments = [];
    this.joints = [];
    this.occupied = new Set();
    this.activeSegment = undefined;
    this.resetCountdown = -1;
    this.fade = 0;
    this.complete = false;
    this.canvas.style.opacity = "1";
    if (this.celebration) {
      this.celebration.hidden = true;
      this.celebration.style.opacity = "1";
    }
    this.startPipe();
    this.queueNextSegment();
    this.syncAllInstances();
    this.setAnimationSettled(false);
  }

  protected attributeDidChange(name: string) {
    if (name === "seed" && this.advancingSeed) return;
    if (name === "seed" || name === "density" || name === "mode") {
      this.resetScene();
    }
  }

  protected canvasDidResize() {
    if (!this.renderer || !this.camera) return;
    this.renderer.setSize(this.canvasWidth, this.canvasHeight, false);
    this.camera.aspect = this.canvasWidth / this.canvasHeight;
    this.camera.updateProjectionMatrix();
  }

  protected elementDidDisconnect() {
    this.segments = [];
    this.joints = [];
    this.occupied.clear();
    this.activeSegment = undefined;
    this.scene?.clear();
    this.segmentGeometry?.dispose();
    this.jointGeometry?.dispose();
    this.segmentMaterial?.dispose();
    this.jointMaterial?.dispose();
    this.renderer?.dispose();
    this.renderer = undefined;
    this.scene = undefined;
    this.camera = undefined;
    this.segmentMesh = undefined;
    this.jointMesh = undefined;
    this.segmentGeometry = undefined;
    this.jointGeometry = undefined;
    this.segmentMaterial = undefined;
    this.jointMaterial = undefined;
    this.canvas.style.opacity = "1";
    if (this.celebration) this.celebration.hidden = true;
  }

  protected updateFrame(deltaSeconds: number) {
    if (this.resetCountdown >= 0) {
      if (this.resetCountdown > 0) {
        this.resetCountdown = Math.max(
          0,
          this.resetCountdown - deltaSeconds,
        );
      } else {
        this.fade += deltaSeconds * 1.35;
        const opacity = String(clamp(1 - this.fade, 0, 1));
        this.canvas.style.opacity = opacity;
        if (this.celebration && !this.celebration.hidden) {
          this.celebration.style.opacity = opacity;
        }
        if (this.fade >= 1) this.advanceSeed();
      }
      return;
    }

    let growth = deltaSeconds * this.speed * 1.75;

    while (growth > 0 && this.resetCountdown < 0) {
      if (!this.activeSegment) {
        this.queueNextSegment();
        if (!this.activeSegment) return;
      }

      const remaining = 1 - this.activeSegment.progress;
      if (growth < remaining) {
        this.activeSegment.progress += growth;
        this.syncActiveSegment();
        return;
      }

      this.activeSegment.progress = 1;
      this.syncActiveSegment();
      growth -= remaining;
      this.currentPosition = { ...this.activeSegment.to };
      this.occupied.add(keyFor(this.currentPosition));
      this.currentPipeLength += 1;
      this.activeSegment = undefined;

      if (this.segments.length >= this.segmentLimit) {
        if (this.mode === "single") {
          this.completeScene();
        } else {
          this.beginEndState(END_HOLD_SECONDS);
        }
        return;
      }

      if (this.currentPipeLength >= this.targetPipeLength) {
        this.startPipe();
      }
    }
  }

  protected drawFrame() {
    if (!this.renderer || !this.scene || !this.camera) return;
    this.renderer.render(this.scene, this.camera);
  }

  private get segmentLimit() {
    return Math.min(
      MAX_SEGMENTS,
      Math.round(DEFAULT_SEGMENT_LIMIT * this.density),
    );
  }

  private initializeRenderer() {
    if (this.renderer) return;

    const renderer = new WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.setSize(this.canvasWidth, this.canvasHeight, false);

    const scene = new Scene();
    scene.background = new Color(0x030303);
    scene.fog = new Fog(0x030303, 16, 36);

    const camera = new PerspectiveCamera(
      43,
      this.canvasWidth / this.canvasHeight,
      0.1,
      50,
    );
    camera.position.set(9.25, 7.5, 11.9);
    camera.lookAt(0, 0, 0);

    scene.add(new HemisphereLight(0xb9d7ff, 0x15100d, 1.25));
    scene.add(new AmbientLight(0xffffff, 0.45));
    const keyLight = new DirectionalLight(0xfff0cf, 3.8);
    keyLight.position.set(-7, 10, 9);
    scene.add(keyLight);

    const segmentGeometry = new CylinderGeometry(0.18, 0.18, 1, 14, 1);
    const jointGeometry = new SphereGeometry(0.1872, 14, 10);
    const segmentMaterial = new MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.12,
      roughness: 0.28,
    });
    const jointMaterial = new MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.1,
      roughness: 0.32,
    });
    const segmentMesh = new InstancedMesh(
      segmentGeometry,
      segmentMaterial,
      MAX_SEGMENTS,
    );
    const jointMesh = new InstancedMesh(
      jointGeometry,
      jointMaterial,
      MAX_JOINTS,
    );
    segmentMesh.count = 0;
    jointMesh.count = 0;
    segmentMesh.frustumCulled = false;
    jointMesh.frustumCulled = false;
    segmentMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    jointMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    scene.add(segmentMesh, jointMesh);

    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.segmentMesh = segmentMesh;
    this.jointMesh = jointMesh;
    this.segmentGeometry = segmentGeometry;
    this.jointGeometry = jointGeometry;
    this.segmentMaterial = segmentMaterial;
    this.jointMaterial = jointMaterial;
  }

  private startPipe() {
    let start: Vec3 | undefined;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const candidate = {
        x: Math.floor(this.random() * (EXTENT * 2 + 1)) - EXTENT,
        y: Math.floor(this.random() * (EXTENT * 2 + 1)) - EXTENT,
        z: Math.floor(this.random() * (EXTENT * 2 + 1)) - EXTENT,
      };
      if (!this.occupied.has(keyFor(candidate))) {
        start = candidate;
        break;
      }
    }

    if (!start) {
      this.beginEndState(0.5);
      return;
    }

    this.currentPosition = start;
    this.currentDirection = Math.floor(this.random() * DIRECTIONS.length);
    this.currentColor = Math.floor(this.random() * COLORS.length);
    this.currentPipeLength = 0;
    this.targetPipeLength =
      this.mode === "single"
        ? this.segmentLimit
        : 7 + Math.floor(this.random() * 13);
    this.occupied.add(keyFor(start));
    this.joints.push({ position: { ...start }, color: this.currentColor });
    this.syncJointInstance(this.joints.length - 1);
  }

  private queueNextSegment() {
    if (this.resetCountdown >= 0) return;

    const reverse = OPPOSITE_DIRECTION[this.currentDirection];
    let candidates = DIRECTIONS.map((direction, index) => ({
      direction,
      index,
      target: add(this.currentPosition, direction),
    })).filter(
      ({ index, target }) =>
        index !== reverse &&
        inside(target) &&
        !this.occupied.has(keyFor(target)),
    );

    if (candidates.length === 0) {
      if (this.mode === "single") {
        this.beginEndState(END_HOLD_SECONDS);
        return;
      }
      this.startPipe();
      if (this.resetCountdown >= 0) return;
      candidates = DIRECTIONS.map((direction, index) => ({
        direction,
        index,
        target: add(this.currentPosition, direction),
      })).filter(
        ({ target }) =>
          inside(target) && !this.occupied.has(keyFor(target)),
      );
    }

    if (candidates.length === 0) {
      this.beginEndState(0.5);
      return;
    }

    const scoredCandidates = candidates.map((candidate) => ({
      ...candidate,
      reachable: this.countReachableCells(candidate.target),
      exits: this.countOpenNeighbors(candidate.target),
    }));
    const largestReachableArea = Math.max(
      ...scoredCandidates.map(({ reachable }) => reachable),
    );
    const roomyCandidates = scoredCandidates.filter(
      ({ reachable }) => reachable === largestReachableArea,
    );
    const mostExits = Math.max(
      ...roomyCandidates.map(({ exits }) => exits),
    );
    const safeCandidates = roomyCandidates.filter(
      ({ exits }) => exits === mostExits,
    );
    const straight = safeCandidates.find(
      ({ index }) => index === this.currentDirection,
    );
    const weighted = straight
      ? [...safeCandidates, straight, straight]
      : safeCandidates;
    const choice = weighted[Math.floor(this.random() * weighted.length)];

    if (choice.index !== this.currentDirection) {
      this.joints.push({
        position: { ...this.currentPosition },
        color: this.currentColor,
      });
      this.syncJointInstance(this.joints.length - 1);
    }

    this.currentDirection = choice.index;
    const segment: PipeSegment = {
      from: { ...this.currentPosition },
      to: choice.target,
      color: this.currentColor,
      progress: 0,
    };
    this.segments.push(segment);
    this.activeSegment = segment;
    this.syncSegmentInstance(this.segments.length - 1);
  }

  private countOpenNeighbors(point: Vec3) {
    let count = 0;
    for (const direction of DIRECTIONS) {
      const neighbor = add(point, direction);
      if (inside(neighbor) && !this.occupied.has(keyFor(neighbor))) count += 1;
    }
    return count;
  }

  private countReachableCells(start: Vec3) {
    const visited = new Set([keyFor(start)]);
    const queue = [start];

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const point = queue[cursor];
      for (const direction of DIRECTIONS) {
        const neighbor = add(point, direction);
        const key = keyFor(neighbor);
        if (
          inside(neighbor) &&
          !this.occupied.has(key) &&
          !visited.has(key)
        ) {
          visited.add(key);
          queue.push(neighbor);
        }
      }
    }

    return visited.size;
  }

  private syncAllInstances() {
    if (this.segmentMesh) {
      this.segmentMesh.count = this.segments.length;
      for (let index = 0; index < this.segments.length; index += 1) {
        this.syncSegmentInstance(index);
      }
    }
    if (this.jointMesh) {
      this.jointMesh.count = this.joints.length;
      for (let index = 0; index < this.joints.length; index += 1) {
        this.syncJointInstance(index);
      }
    }
  }

  private syncActiveSegment() {
    if (!this.activeSegment) return;
    this.syncSegmentInstance(this.segments.length - 1);
  }

  private syncSegmentInstance(index: number) {
    const mesh = this.segmentMesh;
    const segment = this.segments[index];
    if (!mesh || !segment || index >= MAX_SEGMENTS) return;

    const to = interpolate(segment.from, segment.to, segment.progress);
    const deltaX = to.x - segment.from.x;
    const deltaY = to.y - segment.from.y;
    const deltaZ = to.z - segment.from.z;
    const length = Math.hypot(deltaX, deltaY, deltaZ);
    directionVector.set(deltaX, deltaY, deltaZ);

    instanceHelper.position.set(
      (segment.from.x + to.x) / 2,
      (segment.from.y + to.y) / 2,
      (segment.from.z + to.z) / 2,
    );
    if (length > 0.0001) {
      instanceHelper.quaternion.setFromUnitVectors(
        Y_AXIS,
        directionVector.normalize(),
      );
    } else {
      instanceHelper.quaternion.identity();
    }
    instanceHelper.scale.set(1, length, 1);
    instanceHelper.updateMatrix();
    mesh.setMatrixAt(index, instanceHelper.matrix);
    mesh.setColorAt(index, instanceColor.setHex(COLORS[segment.color]));
    mesh.count = Math.max(mesh.count, index + 1);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  private syncJointInstance(index: number) {
    const mesh = this.jointMesh;
    const joint = this.joints[index];
    if (!mesh || !joint || index >= MAX_JOINTS) return;

    instanceHelper.position.set(
      joint.position.x,
      joint.position.y,
      joint.position.z,
    );
    instanceHelper.quaternion.identity();
    instanceHelper.scale.set(1, 1, 1);
    instanceHelper.updateMatrix();
    mesh.setMatrixAt(index, instanceHelper.matrix);
    mesh.setColorAt(index, instanceColor.setHex(COLORS[joint.color]));
    mesh.count = Math.max(mesh.count, index + 1);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  private completeScene() {
    this.activeSegment = undefined;
    this.complete = true;
    this.resetCountdown = CELEBRATION_HOLD_SECONDS;
    this.fade = 0;
    if (this.celebration) {
      this.celebration.hidden = false;
      this.celebration.style.opacity = "1";
    }
    if (this.celebrationDetail) {
      const seed = this.getAttribute("seed") ?? "95";
      this.celebrationDetail.textContent = `Seed ${seed} went the distance`;
    }
    this.setAnimationSettled(false);
  }

  private beginEndState(holdSeconds: number) {
    this.activeSegment = undefined;
    this.complete = false;
    this.resetCountdown = holdSeconds;
    this.fade = 0;
    this.setAnimationSettled(false);
  }

  private advanceSeed() {
    const currentValue = this.getAttribute("seed") ?? "95";
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
        new CustomEvent<PipesSeedChangeDetail>("seedchange", {
          bubbles: true,
          composed: true,
          detail: { seed: nextSeed },
        }),
      );
    }
  }
}

export function registerPipesSaver() {
  if (
    typeof window === "undefined" ||
    typeof customElements === "undefined" ||
    customElements.get(TAG_NAME)
  ) {
    return;
  }
  customElements.define(TAG_NAME, PipesSaverElement);
}

declare global {
  interface HTMLElementTagNameMap {
    "pipes-saver": PipesSaverElement;
  }
}
