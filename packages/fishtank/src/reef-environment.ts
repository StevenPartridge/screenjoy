import {
  AdditiveBlending, BufferGeometry, CatmullRomCurve3, Color, CylinderGeometry,
  DirectionalLight, DoubleSide, Float32BufferAttribute, FogExp2, Group,
  HemisphereLight, IcosahedronGeometry, Mesh, MeshStandardMaterial,
  Object3D, PlaneGeometry, Points, Scene, ShaderMaterial, SphereGeometry,
  TubeGeometry, Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type ReefObstacle = { center: Vector3; radius: number };
export type ReefEnvironment = {
  obstacles: ReefObstacle[];
  update(time: number): void;
};

const waterVertex = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const causticFunctions = `
  float caustic(vec2 p, float t) {
    p += vec2(sin(p.y * 1.7 + t * 0.31), cos(p.x * 1.4 - t * 0.23)) * 0.24;
    float a = abs(sin(p.x * 3.4 + p.y * 2.7 + t * 0.4));
    float b = abs(sin(p.x * 2.9 - p.y * 3.1 - t * 0.33));
    return pow(1.0 - min(a, b), 12.0);
  }
`;

/** Static reef geometry is merged by material; only the water and soft plants move. */
export function createReefEnvironment(scene: Scene, random: () => number): ReefEnvironment {
  const time = { value: 0 };
  const obstacles: ReefObstacle[] = [];
  scene.background = new Color(0x063448);
  scene.fog = new FogExp2(0x086579, 0.035);
  scene.add(new HemisphereLight(0xb5faff, 0x43677b, 1.7));
  const sun = new DirectionalLight(0xfff0ce, 3.5);
  sun.position.set(-3, 7, 5);
  scene.add(sun);
  const rim = new DirectionalLight(0x52dfff, 2.0);
  rim.position.set(3, 3, -5);
  scene.add(rim);

  const background = new Mesh(new PlaneGeometry(50, 24), new ShaderMaterial({
    vertexShader: waterVertex,
    fragmentShader: `varying vec2 vUv;
      void main() {
        vec3 bottom = vec3(0.012, 0.115, 0.17);
        vec3 top = vec3(0.025, 0.43, 0.48);
        float glow = exp(-pow((vUv.x - 0.36) * 3.5, 2.0)) * smoothstep(0.25, 1.0, vUv.y);
        vec3 color = mix(bottom, top, smoothstep(0.0, 1.0, vUv.y)) + vec3(0.035, 0.13, 0.12) * glow;
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    depthWrite: false,
  }));
  background.position.set(0, 3, -9);
  scene.add(background);

  const sandGeometry = new PlaneGeometry(38, 28, 110, 75);
  sandGeometry.rotateX(-Math.PI / 2);
  const sandPositions = sandGeometry.getAttribute("position");
  for (let i = 0; i < sandPositions.count; i++) {
    const x = sandPositions.getX(i), z = sandPositions.getZ(i);
    sandPositions.setY(i, -2.65 + Math.sin(x * 0.58 + z * 0.33) * 0.09 + Math.sin(z * 3 + x * 0.45) * 0.025);
  }
  sandGeometry.computeVertexNormals();
  const sandMaterial = new MeshStandardMaterial({ color: 0xe7d5a5, roughness: 0.92 });
  sandMaterial.onBeforeCompile = shader => {
    shader.uniforms.reefTime = time;
    shader.vertexShader = 'varying vec3 reefPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n reefPosition = position;');
    shader.fragmentShader = 'uniform float reefTime; varying vec3 reefPosition;\n' + causticFunctions + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float ripple = sin(reefPosition.z * 28.0 + sin(reefPosition.x * 1.8) * 1.9);
      float grain = fract(sin(dot(reefPosition.xz, vec2(127.1, 311.7))) * 43758.5453);
      diffuseColor.rgb *= 0.94 + ripple * 0.035 + grain * 0.065;
      float leftShadow = exp(-dot((reefPosition.xz - vec2(-4.6, -1.35)) / vec2(2.0, 1.5), (reefPosition.xz - vec2(-4.6, -1.35)) / vec2(2.0, 1.5)) * 1.4);
      float rightShadow = exp(-dot((reefPosition.xz - vec2(4.55, -2.1)) / vec2(1.8, 1.4), (reefPosition.xz - vec2(4.55, -2.1)) / vec2(1.8, 1.4)) * 1.4);
      diffuseColor.rgb *= 1.0 - max(leftShadow, rightShadow) * 0.36;
      float light = caustic(reefPosition.xz * 0.83, reefTime);
      diffuseColor.rgb += vec3(0.22, 0.31, 0.22) * light;
    `);
  };
  scene.add(new Mesh(sandGeometry, sandMaterial));

  // Long, feathered light shafts. Their edges fade in the shader rather than forming cones.
  const rayMaterial = new ShaderMaterial({
    uniforms: { reefTime: time }, vertexShader: waterVertex,
    fragmentShader: `uniform float reefTime; varying vec2 vUv;
      void main() {
        float edge = pow(max(0.0, sin(vUv.x * 3.14159)), 3.0);
        float ends = smoothstep(0.0, 0.16, vUv.y) * (1.0 - smoothstep(0.8, 1.0, vUv.y));
        float shimmer = 0.8 + 0.2 * sin(reefTime * 0.3 + vUv.y * 5.0);
        gl_FragColor = vec4(0.40, 0.84, 0.86, edge * ends * shimmer * 0.085);
      }`,
    transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
  });
  for (let i = 0; i < 7; i++) {
    const ray = new Mesh(new PlaneGeometry(0.48 + random() * 0.75, 12), rayMaterial);
    ray.position.set(-6 + i * 2.3, 2.2, -5.4 + random() * 0.5);
    ray.rotation.z = -0.26;
    scene.add(ray);
  }
  const surface = new Mesh(new PlaneGeometry(38, 22), new ShaderMaterial({
    uniforms: { reefTime: time }, vertexShader: waterVertex,
    fragmentShader: `uniform float reefTime; varying vec2 vUv; ${causticFunctions}
      void main() { float c = caustic(vUv * vec2(18.0, 12.0), reefTime);
        gl_FragColor = vec4(0.35, 0.9, 0.87, 0.045 + c * 0.16); }`,
    transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending,
  }));
  surface.rotation.x = Math.PI / 2;
  surface.position.y = 4.35;
  scene.add(surface);

  const batches = new Map<string, { geometries: BufferGeometry[]; material: MeshStandardMaterial }>();
  const helper = new Object3D();
  function batch(geometry: BufferGeometry, color: number, position: Vector3, scale = new Vector3(1, 1, 1), rotation = new Vector3(), kind = "solid") {
    const key = kind;
    if (!batches.has(key)) {
      const material = new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.77, side: DoubleSide });
      if (kind === "plants" || kind === "anemone") {
        material.onBeforeCompile = shader => {
          shader.uniforms.reefTime = time;
          shader.vertexShader = 'uniform float reefTime;\n' + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
            float weight = uv.y * uv.y;
            transformed.x += sin(reefTime * 0.85 + position.x * 1.3 + position.y * 1.8) * weight * ${kind === "plants" ? "0.20" : "0.07"};
            transformed.z += cos(reefTime * 0.6 + position.y * 2.1 + position.z) * weight * 0.10;
          `);
        };
        material.customProgramCacheKey = () => kind;
      }
      batches.set(key, { geometries: [], material });
    }
    const geo = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    geometry.dispose();
    helper.position.copy(position); helper.scale.copy(scale);
    helper.rotation.set(rotation.x, rotation.y, rotation.z); helper.updateMatrix();
    geo.applyMatrix4(helper.matrix);
    const count = geo.getAttribute("position").count;
    const colors = new Float32Array(count * 3), c = new Color(color);
    const p = geo.getAttribute("position");
    for (let i = 0; i < count; i++) {
      const shade = 0.92 + Math.sin(p.getY(i) * 7 + p.getX(i) * 3) * 0.08;
      colors[i * 3] = c.r * shade; colors[i * 3 + 1] = c.g * shade; colors[i * 3 + 2] = c.b * shade;
    }
    geo.setAttribute("color", new Float32BufferAttribute(colors, 3));
    if (!geo.getAttribute("uv")) geo.setAttribute("uv", new Float32BufferAttribute(new Float32Array(count * 2), 2));
    batches.get(key)!.geometries.push(geo);
  }
  function branch(points: Vector3[], radius: number, color: number, kind = "solid") {
    const geometry = new TubeGeometry(new CatmullRomCurve3(points), 10, radius, 6, false);
    // Tube UV.x runs from root to tip; plants use UV.y as their pinned sway weight.
    const uv = geometry.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), uv.getX(i));
    batch(geometry, color, new Vector3(), undefined, undefined, kind);
  }
  function rock(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number) {
    const geo = new IcosahedronGeometry(1, 2), p = geo.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const noise = 1 + 0.09 * Math.sin(x * 13 + y * 9) * Math.cos(z * 11 - y * 7);
      p.setXYZ(i, x * noise, y * noise, z * noise);
    }
    geo.computeVertexNormals();
    batch(geo, color, new Vector3(x, y, z), new Vector3(sx, sy, sz), new Vector3(0.1, random() * 3, 0.08));
  }
  // Two unequal islands make a sheltered, open channel between them.
  const islands = [
    { x: -4.6, z: -1.35, scale: 1.15 }, { x: 4.55, z: -2.1, scale: 0.94 },
  ];
  for (const island of islands) {
    const { x, z, scale: s } = island;
    for (let i = 0; i < 9; i++) {
      const angle = i * 2.4, spread = i < 5 ? 1.0 : 0.55;
      const rx = x + Math.cos(angle) * spread * s, rz = z + Math.sin(angle) * spread * s;
      const ry = -2.3 + (i < 5 ? 0 : 0.62) * s;
      rock(rx, ry, rz, (0.58 + random() * 0.5) * s, (0.45 + random() * 0.4) * s, (0.6 + random() * 0.4) * s, [0x597d7e, 0x75918b, 0x9aa698][i % 3]);
    }
    obstacles.push({ center: new Vector3(x, -1.65, z), radius: 1.55 * s });
  }
  for (let i = 0; i < 50; i++) {
    const x = (random() - 0.5) * 16, z = -4 + random() * 9;
    const s = 0.025 + random() * 0.105;
    rock(x, -2.58, z, s * 1.4, s * 0.55, s, i % 2 ? 0xb0b09a : 0xc5bf9f);
  }

  // Antler coral branches have rounded growing tips.
  function coral(x: number, y: number, z: number, size: number, color: number) {
    const root = new Vector3(x, y, z);
    for (let i = 0; i < 8; i++) {
      const angle = i * 2.4, height = size * (0.55 + random() * 0.6);
      const tip = root.clone().add(new Vector3(Math.cos(angle) * size * 0.46, height, Math.sin(angle) * size * 0.32));
      const middle = root.clone().lerp(tip, 0.5);
      branch([root, middle, tip], size * 0.043, color);
      batch(new SphereGeometry(size * 0.048, 7, 5), 0xffd8af, tip);
      for (let j = 0; j < 2; j++) {
        const from = root.clone().lerp(tip, 0.40 + j * 0.23);
        const end = from.clone().add(new Vector3(Math.cos(angle + j + 1) * size * 0.3, size * 0.35, Math.sin(angle + j) * size * 0.25));
        branch([from, from.clone().lerp(end, 0.55), end], size * 0.028, color);
        batch(new SphereGeometry(size * 0.032, 6, 4), 0xffd2c1, end);
      }
    }
  }
  coral(4.3, -1.45, -1.7, 1.55, 0xf89372);
  coral(5.6, -1.85, -2.4, 1.22, 0xe85e8b);
  coral(-4.0, -1.2, -1.2, 0.96, 0xf9ba6a);
  coral(-5.6, -1.7, -0.75, 0.75, 0xf46d78);

  // A branching purple sea fan behind the left island.
  const fanRoot = new Vector3(-4.9, -1.5, -2.4);
  for (let i = 0; i < 17; i++) {
    const angle = -1.25 + i / 16 * 2.5;
    const tip = fanRoot.clone().add(new Vector3(Math.sin(angle) * 1.65, 0.55 + Math.cos(angle) * 2.5, 0.12 * Math.sin(i)));
    const mid = fanRoot.clone().lerp(tip, 0.58);
    branch([fanRoot, mid, tip], 0.019, 0xb75cbb);
    for (let j = 1; j < 5; j++) {
      const start = fanRoot.clone().lerp(tip, j / 6);
      branch([start, start.clone().add(new Vector3(0.13, 0.15, 0)), start.clone().add(new Vector3(0.31, 0.31, 0.02))], 0.009, 0xd990d0);
    }
  }
  // Layered, fluted plate coral on the reef shoulders.
  for (const [x, y, z, color] of [[-3.9, -1.9, 0, 0x77b5b1], [5.3, -1.7, -0.4, 0x9a85c9], [-5.2, -1.8, -1, 0x66b793]]) {
    for (let layer = 0; layer < 5; layer++) {
      const geo = new SphereGeometry(1, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2);
      const p = geo.getAttribute("position");
      for (let i = 0; i < p.count; i++) {
        const theta = Math.atan2(p.getZ(i), p.getX(i));
        p.setY(i, p.getY(i) * 0.12 + Math.sin(theta * 9) * 0.027);
      }
      geo.computeVertexNormals();
      const size = 0.70 - layer * 0.085;
      batch(geo, color, new Vector3(x + Math.sin(layer) * 0.15, y + layer * 0.13, z), new Vector3(size, 1, size));
    }
  }
  // Sea grass ribbons are tapered and curved, with roots fixed to the sand.
  const grassBeds = [[-6.3, -2.7, 2.7], [-3.4, -3.2, 2.1], [3.5, -3.6, 2.5], [6.25, -2.8, 3.3], [-6.6, 1.2, 1.1], [6.4, 0.8, 1.15]];
  for (const [x, z, height] of grassBeds) {
    for (let blade = 0; blade < 15; blade++) {
      const h = height * (0.5 + random() * 0.65), angle = random() * Math.PI * 2;
      const geo = new PlaneGeometry(1, 1, 2, 14), p = geo.getAttribute("position"), uv = geo.getAttribute("uv");
      for (let i = 0; i < p.count; i++) {
        const t = uv.getY(i), width = Math.sin(t * Math.PI) * 0.16 + 0.012;
        p.setXYZ(i, p.getX(i) * width + Math.sin(t * 2.5) * h * 0.17, t * h, Math.sin(t * 3.5) * 0.15);
      }
      geo.computeVertexNormals();
      batch(geo, [0x3b9f78, 0x76b956, 0x38b3a2][blade % 3], new Vector3(x + (random() - 0.5) * 1.1, -2.58, z + (random() - 0.5) * 0.65), undefined, new Vector3(0, angle, 0), "plants");
    }
  }
  // A soft anemone beside the clownfish's home.
  for (let i = 0; i < 72; i++) {
    const angle = i * 2.39996, radius = Math.sqrt(i / 72) * 0.58;
    const root = new Vector3(-2.9 + Math.cos(angle) * radius, -2.48, 0.35 + Math.sin(angle) * radius * 0.75);
    const h = 0.32 + random() * 0.27;
    const tip = root.clone().add(new Vector3(Math.cos(angle) * 0.15, h, Math.sin(angle) * 0.12));
    branch([root, root.clone().add(new Vector3(0, h * 0.6, 0)), tip], 0.026, i % 3 ? 0xc694cb : 0x93cfbd, "anemone");
    const bulb = new SphereGeometry(0.039, 7, 5);
    const uv = bulb.getAttribute("uv");
    for (let j = 0; j < uv.count; j++) uv.setY(j, 1);
    batch(bulb, 0xe8e4b0, tip, undefined, undefined, "anemone");
  }

  // Five tapered arms, raised center and small pale bumps make proper sea stars.
  function star(x: number, z: number, size: number, color: number, angle: number) {
    const root = new Vector3(x, -2.53, z);
    batch(new SphereGeometry(size * 0.24, 12, 8), color, root, new Vector3(1, 0.42, 1));
    for (let arm = 0; arm < 5; arm++) {
      const a = angle + arm * Math.PI * 2 / 5;
      const tip = root.clone().add(new Vector3(Math.cos(a) * size, -0.025, Math.sin(a) * size));
      const geo = new CylinderGeometry(0.012, size * 0.17, size, 8, 4);
      const pivot = new Object3D();
      pivot.position.copy(root).lerp(tip, 0.5);
      pivot.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), tip.clone().sub(root).normalize());
      pivot.updateMatrix(); geo.applyMatrix4(pivot.matrix);
      batch(geo, color, new Vector3(), new Vector3(1, 1, 1));
      for (let j = 1; j < 5; j++) {
        const p = root.clone().lerp(tip, j / 5); p.y += 0.05;
        batch(new SphereGeometry(0.014, 5, 4), 0xffdca1, p);
      }
    }
  }
  star(2.6, 2.0, 0.48, 0xf8884f, 0.25);
  star(-5.5, 2.2, 0.31, 0xdb7979, 1.2);

  for (const { geometries, material } of batches.values()) {
    const merged = mergeGeometries(geometries, false);
    for (const geometry of geometries) geometry.dispose();
    if (merged) scene.add(new Mesh(merged, material));
    else material.dispose();
  }

  // A pearl-bearing clam opens and closes on the foreground sand.
  const clam = new Group(); clam.position.set(3.8, -2.5, 1.1); clam.rotation.y = -0.35;
  const shellMat = new MeshStandardMaterial({ color: 0xc09bbd, roughness: 0.55, side: DoubleSide });
  function shell() {
    const geo = new SphereGeometry(1, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const p = geo.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const theta = Math.atan2(p.getZ(i), p.getX(i));
      const ridge = 1 + Math.cos(theta * 14) * 0.045;
      p.setXYZ(i, p.getX(i) * 0.46 * ridge, p.getY(i) * 0.14, p.getZ(i) * 0.34 * ridge);
    }
    geo.computeVertexNormals();
    return new Mesh(geo, shellMat);
  }
  const lower = shell(); lower.rotation.x = Math.PI;
  const lid = new Group(); lid.position.z = -0.25;
  const upper = shell(); upper.position.z = 0.25; lid.add(upper);
  const pearl = new Mesh(new SphereGeometry(0.10, 20, 14), new MeshStandardMaterial({ color: 0xfff1df, metalness: 0.28, roughness: 0.17, emissive: 0x8dcfcf, emissiveIntensity: 0.15 }));
  pearl.position.y = 0.07;
  clam.add(lower, lid, pearl); scene.add(clam);

  // A little sand crab occasionally makes a sideways dash, then settles again.
  const crab = new Group();
  const crabMat = new MeshStandardMaterial({ color: 0xe88855, roughness: 0.49 });
  const darkMat = new MeshStandardMaterial({ color: 0x172d36, roughness: 0.2 });
  const sphere = new SphereGeometry(1, 12, 8);
  const carapace = new Mesh(sphere, crabMat); carapace.scale.set(0.23, 0.12, 0.17); carapace.position.y = 0.16; crab.add(carapace);
  const legs: Group[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const leg = new Group(); leg.position.set(side * 0.15, 0.12, (i - 1.5) * 0.075);
      const curve = new CatmullRomCurve3([new Vector3(), new Vector3(side * 0.16, 0.05, (i - 1.5) * 0.025), new Vector3(side * 0.24, -0.105, (i - 1.5) * 0.05)]);
      leg.add(new Mesh(new TubeGeometry(curve, 5, 0.017, 5, false), crabMat)); crab.add(leg); legs.push(leg);
    }
    const eyeStem = new Mesh(new CylinderGeometry(0.013, 0.019, 0.11, 6), crabMat); eyeStem.position.set(side * 0.09, 0.29, 0.10);
    const eye = new Mesh(sphere, darkMat); eye.scale.setScalar(0.033); eye.position.set(side * 0.09, 0.35, 0.10);
    const claw = new Mesh(sphere, crabMat); claw.scale.set(0.07, 0.1, 0.085); claw.position.set(side * 0.31, 0.22, 0.20);
    crab.add(eyeStem, eye, claw);
  }
  scene.add(crab);

  // Tiny suspended particles reveal the water's depth without covering the fish.
  const dustPositions = new Float32Array(180 * 3), dustPhases = new Float32Array(180);
  for (let i = 0; i < 180; i++) {
    dustPositions.set([(random() - 0.5) * 19, -2.4 + random() * 6.5, -6 + random() * 10], i * 3);
    dustPhases[i] = random() * Math.PI * 2;
  }
  const dustGeo = new BufferGeometry();
  dustGeo.setAttribute("position", new Float32BufferAttribute(dustPositions, 3));
  dustGeo.setAttribute("phase", new Float32BufferAttribute(dustPhases, 1));
  const dust = new Points(dustGeo, new ShaderMaterial({
    uniforms: { reefTime: time },
    vertexShader: `uniform float reefTime; attribute float phase; varying float vFade;
      void main() { vec3 p = position; p.x += sin(reefTime * 0.14 + phase) * 0.3; p.y += sin(reefTime * 0.2 + phase) * 0.16;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(23.0 / -mv.z, 1.0, 3.0); vFade = 0.13 + 0.12 * sin(phase); }`,
    fragmentShader: `varying float vFade; void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
      gl_FragColor = vec4(0.6, 0.92, 0.87, (1.0 - smoothstep(0.05, 0.5, d)) * vFade); }`,
    transparent: true, depthWrite: false, blending: AdditiveBlending,
  }));
  scene.add(dust);

  return { obstacles, update(t: number) {
    time.value = t;
    lid.rotation.x = -0.20 - Math.pow(0.5 + Math.sin(t * 0.38) * 0.5, 3) * 0.40;
    const cycle = t % 24;
    const progress = Math.min(1, Math.max(0, (cycle - 8) / 5));
    const travel = progress * progress * (3 - 2 * progress);
    const direction = Math.floor(t / 24) % 2 ? -1 : 1;
    crab.position.set(-0.7 + direction * (travel - 0.5) * 1.8, -2.52, 1.75);
    crab.rotation.y = 0.15 + Math.sin(t * 0.2) * 0.08;
    for (let i = 0; i < legs.length; i++) legs[i].rotation.z = cycle > 8 && cycle < 13 ? Math.sin(t * 18 + i * 2) * 0.22 : Math.sin(t + i) * 0.025;
  } };
}
