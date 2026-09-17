import {
  SaverElement,
  clamp,
  createRandom,
  seedFrom,
} from "@screenjoy/runtime";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  FISH_ARCHETYPES,
  FISH_CAST,
  FISH_PROFILE,
  createFishModel,
  type FishArchetype,
} from "./fish-models.js";
import {
  ACESFilmicToneMapping, DynamicDrawUsage,
  InstancedMesh, Mesh, MeshStandardMaterial, Object3D, PerspectiveCamera,
  Plane, PlaneGeometry, Points, Raycaster, Scene, ShaderMaterial, SphereGeometry, SRGBColorSpace, Texture,
  Vector2, Vector3, WebGLRenderer,
} from "three";
import { createReefEnvironment, type ReefEnvironment } from "./reef-environment.js";

type Fish = {
  group: Object3D;
  tail: Object3D;
  fins: Object3D[];
  position: Vector3;
  velocity: Vector3;
  target: Vector3;
  targetTimer: number;
  cruiseSpeed: number;
  phase: number;
  tailSpeed: number;
  finSpeed: number;
  bobAmount: number;
  archetype: FishArchetype;
  size: number;
};

type FishVisual = {
  group: Object3D;
  tail: Object3D;
  fins: Object3D[];
  size: number;
  cruiseSpeed: number;
};

type Bubble = {
  x: number;
  y: number;
  z: number;
  rise: number;
  scale: number;
  phase: number;
};

type Food = { position: Vector3; phase: number };

const TAG_NAME = "fish-tank";
const BUBBLE_COUNT = 46;
const FOOD_LIMIT = 24;
const TANK = { minX: -6.1, maxX: 6.1, minY: -1.9, maxY: 3.1, minZ: -3.6, maxZ: 2.1 };
const instanceHelper = new Object3D();
const tankMin = new Vector3(TANK.minX, TANK.minY, TANK.minZ);
const tankMax = new Vector3(TANK.maxX, TANK.maxY, TANK.maxZ);
const desiredVelocity = new Vector3();
const separation = new Vector3();
const delta = new Vector3();
const foodPlane = new Plane(new Vector3(0, 0, 1), -0.8);
const raycaster = new Raycaster();
const pointer = new Vector2();
const feedingPoint = new Vector3();

function fishModelUrl(archetype: FishArchetype) {
  switch (archetype) {
    case "angel":
      return new URL("./models/angel.glb", import.meta.url).href;
    case "tang":
      return new URL("./models/tang.glb", import.meta.url).href;
    case "clown":
      return new URL("./models/clown.glb", import.meta.url).href;
    case "butterfly":
      return new URL("./models/butterfly.glb", import.meta.url).href;
    case "mint":
      return new URL("./models/mint.glb", import.meta.url).href;
    case "ruby":
      return new URL("./models/ruby.glb", import.meta.url).href;
    case "tetra":
      return new URL("./models/tetra.glb", import.meta.url).href;
  }
}

function disposeObject(root: Object3D) {
  const geometries = new Set<{ dispose(): void }>();
  const materials = new Set<{ dispose(): void }>();
  const textures = new Set<Texture>();
  root.traverse(object => {
    if (!(object instanceof Mesh) && !(object instanceof Points)) return;
    if (object instanceof InstancedMesh) object.dispose();
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
}

function lerpAngle(from: number, to: number, amount: number) {
  const difference = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + difference * amount;
}

export class FishTankElement extends SaverElement {
  static observedAttributes = [
    ...SaverElement.observedAttributes,
    "seed",
    "speed",
    "population",
  ];

  private renderer?: WebGLRenderer;
  private scene?: Scene;
  private camera?: PerspectiveCamera;
  private fish: Fish[] = [];
  private fishTemplates = new Map<FishArchetype, Object3D>();
  private fishLoadPromise?: Promise<void>;
  private templateGeneration = 0;
  private bubbles: Bubble[] = [];
  private bubbleMesh?: InstancedMesh;
  private reef?: ReefEnvironment;
  private food: Food[] = [];
  private foodMesh?: InstancedMesh;
  private fishShadowMesh?: InstancedMesh;
  private lastFeed = -10;
  private random = createRandom(728);
  private elapsed = 0;
  private sceneGeneration = 0;

  get speed(): number {
    return clamp(Number(this.getAttribute("speed") ?? 0.8) || 0.8, 0.2, 3);
  }

  set speed(value: number | string | null | undefined) {
    if (value === null || value === undefined || value === "") {
      this.removeAttribute("speed");
      return;
    }
    this.setAttribute("speed", String(clamp(Number(value) || 0.8, 0.2, 3)));
  }

  get population(): number {
    return Math.round(
      clamp(Number(this.getAttribute("population") ?? 11) || 11, 4, 18),
    );
  }

  set population(value: number | string | null | undefined) {
    if (value === null || value === undefined || value === "") {
      this.removeAttribute("population");
      return;
    }
    this.setAttribute(
      "population",
      String(Math.round(clamp(Number(value) || 11, 4, 18))),
    );
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
    return 1280;
  }

  protected get maxCanvasHeight() {
    return 800;
  }

  protected elementDidConnect() {
    this.initializeRenderer();
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
  }

  protected resetScene() {
    if (!this.scene) return;

    this.sceneGeneration += 1;
    this.disposeScene();
    this.random = createRandom(seedFrom(this.getAttribute("seed") ?? "728"));
    this.elapsed = 0;
    this.fish = [];
    this.bubbles = [];
    this.food = [];
    this.lastFeed = -10;
    this.bubbleMesh = undefined;
    this.foodMesh = undefined;
    this.fishShadowMesh = undefined;
    this.reef = createReefEnvironment(this.scene, this.random);
    this.reef.update(0);
    this.buildBubbles();
    this.buildFood();
    this.buildFish();
    this.setAnimationSettled(false);
  }

  protected attributeDidChange(name: string) {
    if (name === "seed" || name === "population") this.resetScene();
  }

  protected canvasDidResize() {
    if (!this.renderer || !this.camera) return;
    this.renderer.setSize(this.canvasWidth, this.canvasHeight, false);
    this.camera.aspect = this.canvasWidth / this.canvasHeight;
    // Fit both wide desktop windows and tall embeds without clipping the reef.
    this.camera.fov = 42;
    const distance = Math.max(13.6, 7.9 / (Math.tan(21 * Math.PI / 180) * this.camera.aspect));
    this.camera.position.set(0, 1.3 + (distance - 13.6) * 0.12, distance);
    this.camera.far = Math.max(65, distance + 35);
    this.camera.lookAt(0, 0.25, -0.6);
    this.camera.updateProjectionMatrix();
  }

  protected elementDidDisconnect() {
    this.sceneGeneration += 1;
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.disposeScene();
    this.disposeFishTemplates();
    this.renderer?.dispose();
    this.renderer = undefined;
    this.scene = undefined;
    this.camera = undefined;
    this.fish = [];
    this.bubbles = [];
    this.reef = undefined;
    this.food = [];
    this.foodMesh = undefined;
    this.fishShadowMesh = undefined;
    this.bubbleMesh = undefined;
  }

  protected updateFrame(deltaSeconds: number) {
    const scaledDelta = deltaSeconds * this.speed;
    this.elapsed += scaledDelta;
    this.updateFish(scaledDelta);
    this.updateBubbles(scaledDelta);
    this.updateFood(scaledDelta);
    this.updateFishShadows();
    this.reef?.update(this.elapsed);
  }

  protected drawFrame() {
    if (!this.renderer || !this.scene || !this.camera) return;
    this.renderer.render(this.scene, this.camera);
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
    renderer.toneMappingExposure = 1.05;
    renderer.setSize(this.canvasWidth, this.canvasHeight, false);

    const camera = new PerspectiveCamera(
      42,
      this.canvasWidth / this.canvasHeight,
      0.1,
      65,
    );
    camera.position.set(0, 1.3, 13.6);
    camera.lookAt(0, 0.25, -0.6);

    this.renderer = renderer;
    this.camera = camera;
    this.scene = new Scene();
  }

  private buildBubbles() {
    if (!this.scene) return;
    const geometry = new SphereGeometry(0.07, 12, 8);
    const material = new ShaderMaterial({
      vertexShader: `varying vec3 vNormal; varying vec3 vView;
        void main() {
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying vec3 vNormal; varying vec3 vView;
        void main() {
          vec3 n = normalize(vNormal);
          float rim = pow(1.0 - abs(dot(n, normalize(vView))), 3.0);
          float shine = pow(max(0.0, dot(n, normalize(vec3(-0.5, 0.7, 0.5)))), 28.0);
          gl_FragColor = vec4(vec3(0.55, 0.94, 1.0) + shine * 0.4, rim * 0.46 + shine * 0.6);
        }`,
      transparent: true, depthWrite: false,
    });
    const mesh = new InstancedMesh(geometry, material, BUBBLE_COUNT);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    this.bubbleMesh = mesh;
    for (let i = 0; i < BUBBLE_COUNT; i++) this.bubbles.push(this.createBubble(-2.4 + this.random() * 6.7));
    this.syncBubbles();
    this.scene.add(mesh);
  }

  /** Drop a small meal at normalized element coordinates, or at the surface center. */
  feed(x = 0.5, y = 0.16) {
    if (!this.scene || !this.camera || this.paused || this.elapsed - this.lastFeed < 0.7) return;
    this.lastFeed = this.elapsed;
    pointer.set(clamp(x, 0, 1) * 2 - 1, 1 - clamp(y, 0, 1) * 2);
    raycaster.setFromCamera(pointer, this.camera);
    if (!raycaster.ray.intersectPlane(foodPlane, feedingPoint)) return;
    feedingPoint.x = clamp(feedingPoint.x, -5.4, 5.4);
    feedingPoint.y = clamp(feedingPoint.y, -0.5, 3.2);
    for (let i = 0; i < 8 && this.food.length < FOOD_LIMIT; i++) {
      this.food.push({ position: feedingPoint.clone().add(new Vector3((this.random() - 0.5) * 0.6, this.random() * 0.25, (this.random() - 0.5) * 0.4)), phase: this.random() * Math.PI * 2 });
    }
    this.syncFood();
    this.requestDraw();
  }

  private handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width && rect.height) this.feed((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
  };

  private buildFood() {
    const mesh = new InstancedMesh(new SphereGeometry(0.036, 6, 4), new MeshStandardMaterial({ color: 0xf4bd68, roughness: 0.8 }), FOOD_LIMIT);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    this.foodMesh = mesh;
    this.scene?.add(mesh);
    const shadows = new InstancedMesh(new PlaneGeometry(1, 1), new ShaderMaterial({
      vertexShader: `varying vec2 vUv; void main() { vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec2 vUv; void main() {
        float d = length((vUv - 0.5) * 2.0);
        gl_FragColor = vec4(0.035, 0.16, 0.17, pow(max(0.0, 1.0 - d), 2.0) * 0.23); }`,
      transparent: true, depthWrite: false,
    }), 18);
    shadows.instanceMatrix.setUsage(DynamicDrawUsage);
    shadows.frustumCulled = false;
    shadows.count = 0;
    this.fishShadowMesh = shadows;
    this.scene?.add(shadows);
  }

  private updateFishShadows() {
    if (!this.fishShadowMesh) return;
    for (let i = 0; i < this.fish.length; i++) {
      const fish = this.fish[i];
      const height = fish.position.y + 2.6;
      const x = fish.position.x + height * 0.20, z = fish.position.z - height * 0.13;
      const floorY = -2.65 + Math.sin(x * 0.58 + z * 0.33) * 0.09 + Math.sin(z * 3 + x * 0.45) * 0.025;
      instanceHelper.position.set(x, floorY + 0.045, z);
      instanceHelper.rotation.set(-Math.PI / 2, 0, fish.group.rotation.y);
      instanceHelper.scale.set(fish.size * 2.5 + height * 0.18, fish.size * 0.9 + height * 0.14, 1);
      instanceHelper.updateMatrix();
      this.fishShadowMesh.setMatrixAt(i, instanceHelper.matrix);
    }
    this.fishShadowMesh.count = this.fish.length;
    this.fishShadowMesh.instanceMatrix.needsUpdate = true;
  }

  private updateFood(dt: number) {
    for (let i = this.food.length - 1; i >= 0; i--) {
      const food = this.food[i];
      food.position.y -= dt * 0.16;
      food.position.x += Math.sin(this.elapsed + food.phase) * dt * 0.035;
      if (food.position.y < -2.5) this.food.splice(i, 1);
    }
    this.syncFood();
  }

  private syncFood() {
    if (!this.foodMesh) return;
    this.food.forEach((food, i) => {
      instanceHelper.position.copy(food.position);
      instanceHelper.rotation.set(0, food.phase, this.elapsed);
      instanceHelper.scale.setScalar(1);
      instanceHelper.updateMatrix();
      this.foodMesh!.setMatrixAt(i, instanceHelper.matrix);
    });
    this.foodMesh.count = this.food.length;
    this.foodMesh.instanceMatrix.needsUpdate = true;
  }

  private buildFish() {
    const scene = this.scene;
    const generation = this.sceneGeneration;
    if (!scene) return;

    const populate = () => {
      if (
        !this.scene ||
        this.scene !== scene ||
        this.sceneGeneration !== generation
      ) {
        return;
      }

      const fish = Array.from({ length: this.population }, (_, index) =>
        this.createFish(index),
      );
      this.fish.push(...fish);
      scene.add(...fish.map((entry) => entry.group));
      this.updateFishShadows();
      this.requestDraw();
    };

    void this.loadFishTemplates()
      .then(populate)
      .catch(() => {
        if (
          !this.scene ||
          this.scene !== scene ||
          this.sceneGeneration !== generation
        ) {
          return;
        }

        this.useProceduralFishTemplates();
        populate();
      })
      .catch((error: unknown) => {
        this.dispatchEvent(
          new CustomEvent("fish-model-error", {
            detail: error,
          }),
        );
      });
  }

  private createFish(index: number): Fish {
    const archetype = FISH_CAST[index % FISH_CAST.length];
    const visual = this.createLoadedFishVisual(archetype);
    const { group, tail, fins, size, cruiseSpeed } = visual;
    group.scale.setScalar(size);
    const position = new Vector3(
      TANK.minX + 0.45 + this.random() * (TANK.maxX - TANK.minX - 0.9),
      TANK.minY + 0.4 + this.random() * (TANK.maxY - TANK.minY - 0.8),
      TANK.minZ + 0.35 + this.random() * (TANK.maxZ - TANK.minZ - 0.7),
    );
    const openingPositions = [[-2.2, 0.25, 1.1], [1.3, 1.25, 0.1], [3.0, 0.1, -0.3], [-0.6, 2.0, -1.2], [-3.0, -0.8, 0.5]];
    if (index < openingPositions.length) {
      const [x, y, z] = openingPositions[index];
      position.set(x + (this.random() - 0.5) * 0.5, y + (this.random() - 0.5) * 0.3, z);
    }
    const direction = this.random() > 0.5 ? 1 : -1;
    const velocity = new Vector3(
      direction * (0.42 + this.random() * 0.3),
      (this.random() - 0.5) * 0.12,
      (this.random() - 0.5) * 0.18,
    );
    group.position.copy(position);
    group.rotation.order = "YXZ";
    group.rotation.y = Math.atan2(-velocity.z, velocity.x);

    return {
      group,
      tail,
      fins,
      position,
      velocity,
      target: this.chooseTarget(position),
      targetTimer: 2.8 + this.random() * 5,
      cruiseSpeed,
      phase: this.random() * Math.PI * 2,
      tailSpeed: 6.2 + cruiseSpeed * 4.4 + this.random() * 1.8,
      finSpeed: 2.2 + this.random() * 1.7,
      bobAmount: FISH_PROFILE[archetype].bobAmount,
      archetype,
      size,
    };
  }

  private async loadFishTemplates() {
    if (this.fishTemplates.size === FISH_ARCHETYPES.length) return;
    if (this.fishLoadPromise) return this.fishLoadPromise;

    const loader = new GLTFLoader();
    const generation = this.templateGeneration;
    this.fishLoadPromise = Promise.all(
      FISH_ARCHETYPES.map(async (archetype) => {
        let model: Object3D;
        try {
          const gltf = await loader.loadAsync(fishModelUrl(archetype));
          model = gltf.scene.getObjectByName(`Fish_${archetype}`) ?? gltf.scene;
          if (!model.getObjectByName("Tail")) {
            disposeObject(model);
            model = createFishModel(archetype).group;
          }
        } catch {
          model = createFishModel(archetype).group;
        }
        if (this.templateGeneration !== generation) disposeObject(model);
        else this.fishTemplates.set(archetype, model);
      }),
    ).then(() => undefined);

    return this.fishLoadPromise;
  }

  private createLoadedFishVisual(archetype: FishArchetype): FishVisual {
    const template =
      this.fishTemplates.get(archetype) ?? createFishModel(archetype).group;
    const group = template.clone(true);

    group.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.geometry = object.geometry.clone();
      object.material = Array.isArray(object.material)
        ? object.material.map((material) => material.clone())
        : object.material.clone();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        const properties = material as unknown as Record<string, unknown>;
        for (const [key, value] of Object.entries(properties)) {
          if (value instanceof Texture) properties[key] = value.clone();
        }
      }
    });

    const tail = group.getObjectByName("Tail");
    if (!tail) {
      throw new Error(`The ${archetype} fish model needs a Tail node.`);
    }
    const fins = [
      "FinDorsal",
      "FinVentral",
      "FinPectoralL",
      "FinPectoralR",
    ]
      .map((name) => group.getObjectByName(name))
      .filter((object): object is Object3D => object !== undefined);
    const profile = FISH_PROFILE[archetype];
    const size =
      profile.scale[0] +
      this.random() * (profile.scale[1] - profile.scale[0]);
    const cruiseSpeed =
      profile.cruiseSpeed[0] +
      this.random() * (profile.cruiseSpeed[1] - profile.cruiseSpeed[0]);

    return { group, tail, fins, size, cruiseSpeed };
  }

  private useProceduralFishTemplates() {
    this.disposeFishTemplates();
    for (const archetype of FISH_ARCHETYPES) {
      this.fishTemplates.set(archetype, createFishModel(archetype).group);
    }
  }

  private chooseTarget(from: Vector3) {
    const direction = from.x > 2.5 ? -1 : from.x < -2.5 ? 1 : this.random() > 0.5 ? 1 : -1;
    const travel = 2.6 + this.random() * 4.3;
    return new Vector3(
      clamp(from.x + travel * direction, TANK.minX + 0.35, TANK.maxX - 0.35),
      TANK.minY + 0.35 + this.random() * (TANK.maxY - TANK.minY - 0.7),
      TANK.minZ + 0.3 + this.random() * (TANK.maxZ - TANK.minZ - 0.6),
    );
  }

  private updateFish(deltaSeconds: number) {
    for (const fish of this.fish) {
      fish.targetTimer -= deltaSeconds;
      if (fish.targetTimer <= 0 || fish.position.distanceTo(fish.target) < 0.65) {
        fish.target.copy(this.chooseTarget(fish.position));
        fish.targetTimer = 5 + this.random() * 7;
      }
      // Tetras travel as a loose shoal on a shared route, with individual spacing.
      if (fish.archetype === "tetra") {
        const t = this.elapsed * 0.13;
        fish.target.set(Math.sin(t) * 4.3 + Math.sin(fish.phase) * 0.6, 1.15 + Math.cos(t * 1.6) * 0.65 + Math.cos(fish.phase) * 0.28, -1.2 + Math.cos(t) * 1.0);
      }
      let nearestFood: Food | undefined;
      let foodDistance = 5.5;
      for (const food of this.food) {
        const distance = fish.position.distanceTo(food.position);
        if (distance < foodDistance) { nearestFood = food; foodDistance = distance; }
      }
      const target = nearestFood?.position ?? fish.target;
      desiredVelocity.copy(target).sub(fish.position);
      // Mostly horizontal swimming preserves clear fish silhouettes.
      desiredVelocity.y *= 0.65;
      desiredVelocity.normalize().multiplyScalar(fish.cruiseSpeed * (nearestFood ? 1.65 : 1));
      separation.set(0, 0, 0);
      for (const other of this.fish) {
        if (fish === other) continue;
        delta.copy(fish.position).sub(other.position);
        const distance = delta.length();
        const spacing = (fish.size + other.size) * 0.53;
        if (distance < spacing && distance > 0.001) separation.addScaledVector(delta, (spacing - distance) / (distance * spacing) * 0.85);
      }
      for (const obstacle of this.reef?.obstacles ?? []) {
        delta.copy(fish.position).sub(obstacle.center);
        const distance = delta.length(), margin = obstacle.radius + fish.size * 0.65;
        if (distance < margin && distance > 0.001) separation.addScaledVector(delta, (margin - distance) / distance * 1.8);
      }
      desiredVelocity.add(separation);
      // Soft walls turn fish before the boundaries; clamps guard large time steps.
      for (const axis of ["x", "y", "z"] as const) {
        const min = axis === "x" ? TANK.minX : axis === "y" ? TANK.minY : TANK.minZ;
        const max = axis === "x" ? TANK.maxX : axis === "y" ? TANK.maxY : TANK.maxZ;
        desiredVelocity[axis] += Math.max(0, min + 0.65 - fish.position[axis]) * 1.4 - Math.max(0, fish.position[axis] - max + 0.65) * 1.4;
      }
      desiredVelocity.clampLength(0, fish.cruiseSpeed * (nearestFood ? 1.9 : 1.35));
      fish.velocity.lerp(desiredVelocity, 1 - Math.exp(-deltaSeconds * 1.65));
      fish.position.addScaledVector(fish.velocity, deltaSeconds);
      fish.position.y += Math.sin(this.elapsed * 1.25 + fish.phase) * deltaSeconds * fish.bobAmount;
      fish.position.clamp(tankMin, tankMax);
      const yaw = Math.atan2(-fish.velocity.z, fish.velocity.x);
      const pitch = Math.atan2(fish.velocity.y, Math.max(0.1, Math.hypot(fish.velocity.x, fish.velocity.z)));
      const previousYaw = fish.group.rotation.y;
      fish.group.rotation.y = lerpAngle(previousYaw, yaw, 1 - Math.exp(-deltaSeconds * 3.6));
      fish.group.rotation.z += (clamp(pitch, -0.45, 0.45) - fish.group.rotation.z) * Math.min(1, deltaSeconds * 3);
      fish.group.rotation.x += (clamp((fish.group.rotation.y - previousYaw) * 3, -0.18, 0.18) - fish.group.rotation.x) * Math.min(1, deltaSeconds * 2);
      fish.group.position.copy(fish.position);
      const effort = nearestFood ? 1.35 : 1;
      const stroke = this.elapsed * fish.tailSpeed + fish.phase;
      fish.tail.rotation.y = Math.sin(stroke) * 0.32 * effort;
      fish.tail.rotation.z = Math.cos(stroke * 0.5) * 0.025;
      for (const fin of fish.fins) {
        const side = fin.name.endsWith("R") ? -1 : 1;
        const pectoral = fin.name.startsWith("FinPectoral");
        fin.rotation.y = Math.sin(this.elapsed * fish.finSpeed * (pectoral ? 2.8 : 1) + fish.phase) * (pectoral ? 0.30 : 0.045) * side;
        fin.rotation.x = Math.cos(stroke * 0.45) * 0.06 * side;
      }
      if (nearestFood && foodDistance < fish.size * 0.65 + 0.12) {
        // Food must reach the head, rather than disappear beside a passing tail.
        delta.set(0.77 * fish.size, 0, 0).applyEuler(fish.group.rotation).add(fish.position);
        if (delta.distanceTo(nearestFood.position) < 0.26) {
          this.food.splice(this.food.indexOf(nearestFood), 1);
          fish.targetTimer = 0;
        }
      }
    }
  }

  private createBubble(y?: number): Bubble {
    const emitter = this.random() > 0.46 ? 5.1 : -4.7;
    return {
      x: emitter + (this.random() - 0.5) * 0.55,
      y: y ?? -2.2 + this.random() * 5,
      z: -1.3 + this.random() * 0.65,
      rise: 0.38 + this.random() * 0.55,
      scale: 0.42 + this.random() * 1.05,
      phase: this.random() * Math.PI * 2,
    };
  }

  private updateBubbles(deltaSeconds: number) {
    for (const bubble of this.bubbles) {
      bubble.y += bubble.rise * deltaSeconds;
      if (bubble.y > 4.3) {
        Object.assign(bubble, this.createBubble(-2.25 - this.random() * 0.45));
      }
    }
    this.syncBubbles();
  }

  private syncBubbles() {
    if (!this.bubbleMesh) return;
    for (let index = 0; index < this.bubbles.length; index += 1) {
      const bubble = this.bubbles[index];
      const wobble = Math.sin(this.elapsed * 1.7 + bubble.phase) * 0.11;
      instanceHelper.position.set(bubble.x + wobble, bubble.y, bubble.z);
      instanceHelper.quaternion.identity();
      instanceHelper.scale.setScalar(bubble.scale);
      instanceHelper.updateMatrix();
      this.bubbleMesh.setMatrixAt(index, instanceHelper.matrix);
    }
    this.bubbleMesh.count = this.bubbles.length;
    this.bubbleMesh.instanceMatrix.needsUpdate = true;
  }

  private disposeFishTemplates() {
    this.templateGeneration += 1;
    for (const model of this.fishTemplates.values()) disposeObject(model);
    this.fishTemplates.clear();
    this.fishLoadPromise = undefined;
  }

  private disposeScene() {
    if (!this.scene) return;
    disposeObject(this.scene);
    this.scene.clear();
  }

}

export function registerFishTank() {
  if (
    typeof window === "undefined" ||
    typeof customElements === "undefined" ||
    customElements.get(TAG_NAME)
  ) {
    return;
  }
  customElements.define(TAG_NAME, FishTankElement);
}

declare global {
  interface HTMLElementTagNameMap {
    "fish-tank": FishTankElement;
  }
}
