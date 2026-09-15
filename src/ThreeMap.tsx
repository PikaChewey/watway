import {
  createWalkWorld,
  sampleWalkSurface,
  stairWells,
  tunnelStart,
} from "./navigation/walkWorld";
import { createBasemaps, type VisualMode } from "./visual/basemaps";
import {
  createBuildingMaterials,
  buildDetailedBuilding,
} from "./visual/buildings";
import { makeSurface } from "./visual/materials";
import { Sky } from "three/addons/objects/Sky.js";
import { communityLinks, communityPaths } from "./data/communityPaths";
import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  buildings,
  buildingById,
  mapFeatures,
  connections,
  closure,
  places,
} from "./data/campus";
import {
  dcWalls,
  dcRooms,
  indoorFeatures,
  collides,
  pointInPolygon,
} from "./indoor";
import { routePoint } from "./routing";
import type { Point, Route, Weather } from "./types";
export type CameraMode = "orbit" | "map" | "first" | "third";
export interface MapHandle {
  experience: (kind: "tunnel" | "stairs") => void;
  focus: (point: Point, distance?: number) => void;
  zoom: (factor: number) => void;
  reset: () => void;
  rotate: () => void;
  getPosition: () => Point;
  move: (key: string, down: boolean) => void;
}
interface Props {
  visualMode?: VisualMode;
  onImageryStatus?: (status: string) => void;
  quality?: "auto" | "high" | "battery";
  timeOfDay?: number;
  flowScale?: number;
  viewportInset?: number;
  selected: string | null;
  onSelect: (id: string) => void;
  mode: CameraMode;
  route: Route | null;
  progress: number;
  playing: boolean;
  indoor: boolean;
  floor: number;
  weather: Weather;
  night: boolean;
  season: string;
  showPaths: boolean;
  showLabels: boolean;
  showConnections: boolean;
  showCrowds: boolean;
  onReady: () => void;
  onPosition?: (p: Point) => void;
  onWalkContext?: (building: string, floor: number) => void;
}
const v = (p: Point) => new THREE.Vector3(...p);
function shapeGeometry(points: number[][], height = 0) {
  const shape = new THREE.Shape(
    points.map((p) => new THREE.Vector2(p[0], -p[1])),
  );
  const g = height
    ? new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false })
    : new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
  return g;
}
function ribbon(points: number[][], width: number, y: number) {
  const positions: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!d) continue;
    const dx = ((-(b[1] - a[1]) / d) * width) / 2,
      dz = (((b[0] - a[0]) / d) * width) / 2;
    positions.push(
      a[0] + dx,
      y,
      a[1] + dz,
      a[0] - dx,
      y,
      a[1] - dz,
      b[0] + dx,
      y,
      b[1] + dz,
      b[0] + dx,
      y,
      b[1] + dz,
      a[0] - dx,
      y,
      a[1] - dz,
      b[0] - dx,
      y,
      b[1] - dz,
    );
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}
function mesh(
  geometry: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
  roughness = 0.85,
) {
  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color,
      roughness,
      side: THREE.DoubleSide,
    }),
  );
}
function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}
function merged(gs: THREE.BufferGeometry[], color: string, cast = false) {
  if (!gs.length) return new THREE.Group();
  const g = mergeGeometries(
    gs.map((g) => {g.deleteAttribute("uv");return g.index ? g.toNonIndexed() : g;}),
    false,
  );
  const m = mesh(g, color);
  m.castShadow = cast;
  m.receiveShadow = true;
  gs.forEach((g) => g.dispose());
  return m;
}
function disposeGroup(group: THREE.Group) {
  group.traverse((o) => {
    if (
      o instanceof THREE.Mesh ||
      o instanceof THREE.Line ||
      o instanceof THREE.Points
    ) {
      o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => m.dispose());
    }
  });
  group.clear();
}
export default forwardRef<MapHandle, Props>(function ThreeMap(props, ref) {
  const host = useRef<HTMLDivElement>(null),
    labels = useRef<HTMLDivElement>(null),
    p = useRef(props);
  p.current = props;
  const state = useRef<any>(null);
  useImperativeHandle(
    ref,
    () => ({
      experience: (kind) => {
        const s = state.current;
        if (!s) return;
        const spawn =
          kind === "tunnel"
            ? tunnelStart()
            : { ...stairWells.find((w) => w.building === "MC"), yaw: 0 };
        s.pendingSpawn = spawn;
        s.networkWalk = true;
      },
      focus: (point, d = 200) => {
        const s = state.current;
        if (!s) return;
        s.target.copy(v(point));
        s.destination.copy(
          v(point).add(new THREE.Vector3(d * 0.55, d, d * 0.72)),
        );
        s.transition = 1;
        s.player.copy(v(point));
        s.player.y = Math.max(0.5, point[1]);
      },
      zoom: (factor) => {
        const s = state.current;
        if (s) {
          s.destination
            .copy(s.camera.position)
            .sub(s.controls.target)
            .multiplyScalar(factor)
            .add(s.controls.target);
          s.target.copy(s.controls.target);
          s.transition = 1;
        }
      },
      reset: () => {
        const s = state.current;
        if (s) {
          s.target.set(-20, 0, 30);
          s.destination.set(420, 530, 580);
          s.transition = 1;
        }
      },
      rotate: () => {
        const s = state.current;
        if (s) {
          const d = s.camera.position.clone().sub(s.controls.target);
          d.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
          s.destination.copy(s.controls.target).add(d);
          s.target.copy(s.controls.target);
          s.transition = 1;
        }
      },
      getPosition: () => state.current?.player.toArray() || [0, 0, 0],
      move: (key, down) => {
        if (state.current) state.current.keys[key] = down;
      },
    }),
    [],
  );
  useEffect(() => {
    const root = host.current!,
      width = root.clientWidth,
      height = root.clientHeight;
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, window.innerWidth < 760 ? 1.25 : 1.7),
    );
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.domElement.tabIndex = 0;
    root.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      "aria-label",
      "Interactive 3D Waterloo campus. Use the search or building list for keyboard navigation.",
    );
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#b9c9ca");
    scene.fog = new THREE.Fog("#b9c9ca", 1900, 3600);
    const camera = new THREE.PerspectiveCamera(43, width / height, 1, 4500);
    camera.position.set(550, 760, 780);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(-20, 0, 30);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.maxPolarAngle = Math.PI / 2 - 0.03;
    controls.minDistance = 10;
    controls.maxDistance = 2100;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    const ambient = new THREE.HemisphereLight("#d9e8f1", "#48503d", 1.3);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight("#fff0ce", 2.2);
    sun.position.set(-300, 650, 250);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -900,
      right: 900,
      top: 900,
      bottom: -900,
      near: 10,
      far: 1800,
    });
    sun.shadow.bias = -0.001;
    sun.shadow.normalBias = 1.5;
    sun.shadow.radius = 3;
    scene.add(sun);
    const ground = mesh(new THREE.PlaneGeometry(8000, 8000), "#b2c3a7");
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -3;
    ground.receiveShadow = true;
    scene.add(ground);
    const basemaps = createBasemaps((status) =>
      p.current.onImageryStatus?.(status),
    );
    scene.add(basemaps.group);
    const buildingMaterials = createBuildingMaterials();
    const sky = new Sky();
    sky.scale.setScalar(4500);
    const skyUniforms = (sky.material as THREE.ShaderMaterial).uniforms;
    skyUniforms.turbidity.value = 3.8;
    skyUniforms.rayleigh.value = 1.4;
    skyUniforms.mieCoefficient.value = 0.004;
    skyUniforms.mieDirectionalG.value = 0.84;
    skyUniforms.sunPosition.value.copy(sun.position);
    scene.add(sky);

    const roads: THREE.BufferGeometry[] = [],
      curbs: THREE.BufferGeometry[] = [],
      paths: THREE.BufferGeometry[] = [],
      water: THREE.BufferGeometry[] = [],
      parks: THREE.BufferGeometry[] = [],
      roadlines: THREE.BufferGeometry[] = [];
    const bounds = (ps: number[][]) =>
      ps.every((q) => Math.abs(q[0]) < 1900 && Math.abs(q[1]) < 1800);
    for (const f of mapFeatures) {
      if (!bounds(f.points)) continue;
      if (f.type === "road") {
        roads.push(ribbon(f.points, f.width || 9, 0.12));
        curbs.push(ribbon(f.points, (f.width || 9) + 2, 0.08));
        if ((f.width || 9) > 10) roadlines.push(ribbon(f.points, 0.25, 0.17));
      } else if (f.type === "path") paths.push(ribbon(f.points, 2.6, 0.19));
      else if (f.type === "water" && f.points.length > 1) {
        const a = f.points[0],
          b = f.points[f.points.length - 1];
        if (f.points.length > 3 && Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.2)
          water.push(shapeGeometry(f.points).translate(0, 0.07, 0));
        else water.push(ribbon(f.points, 4, 0.07));
      } else if (f.type === "park" || f.type === "wood")
        parks.push(shapeGeometry(f.points).translate(0, 0.015, 0));
    }
    const surfaceGroup = new THREE.Group();
    surfaceGroup.add(
      merged(parks, "#7d965b"),
      merged(curbs, "#bcbeb4"),
      merged(roads, "#626b69"),
      merged(roadlines, "#d7d0aa"),
    );
    scene.add(surfaceGroup);
    const pathMesh = merged(paths, "#c9c8bc");
    scene.add(pathMesh);
    const waterMesh = merged(water, "#416f6b");
    if (waterMesh instanceof THREE.Mesh) {
      const mat = waterMesh.material as THREE.MeshStandardMaterial;
      mat.transparent = false;
      mat.opacity = 1;
      mat.roughness = 0.7;
      mat.metalness = 0;
      waterMesh.receiveShadow = false;
    }
    scene.add(waterMesh);
    const buildingGroup = new THREE.Group(),
      buildingMeshes = new Map<string, THREE.Group>();
    scene.add(buildingGroup);
    const knownIds = new Set((buildings as any[]).map((b) => b.osmId));
    const contextGeoms: THREE.BufferGeometry[] = [];
    for (const f of mapFeatures.filter(
      (f) => f.type === "building" && !knownIds.has(f.id),
    )) {
      if (f.points.length < 4 || !bounds(f.points)) continue;
      contextGeoms.push(shapeGeometry(f.points, Math.min(45, f.height || 10)));
    }
    buildingGroup.add(merged(contextGeoms, "#c0c1b5", true));
    for (const b of buildings) {
      const group = buildDetailedBuilding(b, buildingMaterials);
      buildingGroup.add(group);
      buildingMeshes.set(b.id, group);
    }
    // Deterministic landscaping, placed away from the mapped structures and walking network.
    let seed = 42;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const treeGeoms: THREE.BufferGeometry[][] = [[], [], []],
      trunks: THREE.BufferGeometry[] = [];
    const avoidBuildings = mapFeatures.filter((f) => f.type === "building");
    const nearPaths = mapFeatures.filter(
      (f) => f.type === "road" || f.type === "path",
    );
    const spatial = new Map<string, number[][][]>();
    for (const f of avoidBuildings) {
      const xs = f.points.map((p) => p[0]),
        zs = f.points.map((p) => p[1]);
      for (
        let x = Math.floor(Math.min(...xs) / 50);
        x <= Math.floor(Math.max(...xs) / 50);
        x++
      )
        for (
          let z = Math.floor(Math.min(...zs) / 50);
          z <= Math.floor(Math.max(...zs) / 50);
          z++
        ) {
          const key = `${x},${z}`,
            list = spatial.get(key) || [];
          list.push(f.points);
          spatial.set(key, list);
        }
    }
    for (let i = 0; i < 850; i++) {
      const x = (random() - 0.5) * 1900 - 100,
        z = (random() - 0.5) * 1750,
        h = 5 + random() * 6,
        r = 2 + random() * 2.8;
      if (
        (spatial.get(`${Math.floor(x / 50)},${Math.floor(z / 50)}`) || []).some(
          (poly) => pointInPolygon(x, z, poly),
        )
      )
        continue;
      if (
        nearPaths.some((f) =>
          f.points.some(
            (p) =>
              Math.hypot(x - p[0], z - p[1]) < (f.type === "road" ? 11 : 5),
          ),
        )
      )
        continue;
      const g = new THREE.IcosahedronGeometry(r, 1);
      g.scale(1, 1.25, 1);
      g.translate(x, h * 0.65, z);
      treeGeoms[i % 3].push(g);
      for (let clump = 0; clump < 1; clump++) {
        const crown = new THREE.IcosahedronGeometry(
          r * (0.48 + random() * 0.3),
          1,
        );
        crown.scale(1, 1.15, 1);
        crown.translate(
          x + (random() - 0.5) * r * 1.3,
          h * 0.66 + (random() - 0.3) * r,
          z + (random() - 0.5) * r * 1.3,
        );
        treeGeoms[i % 3].push(crown);
      }
      trunks.push(
        new THREE.CylinderGeometry(0.3, 0.45, h * 0.7, 5).translate(
          x,
          h * 0.35,
          z,
        ),
      );
    }
    const treeMeshes = treeGeoms.map((gs, i) =>
      merged(gs, ["#678665", "#7c996c", "#52745c"][i]),
    );
    const treeTrunks = merged(trunks, "#655849");
    scene.add(...treeMeshes, treeTrunks);
    const bridges = new THREE.Group();
    for (const path of communityLinks) {
      if (path.kind !== "bridge") continue;
      for (let i = 1; i < path.points.length; i++) {
        const a = path.points[i - 1],
          b = path.points[i],
          len = Math.hypot(b[0] - a[0], b[2] - a[2]);
        const g = new THREE.BoxGeometry(len, 2.7, 3.3);
        g.rotateY(-Math.atan2(b[2] - a[2], b[0] - a[0]));
        g.translate(
          (a[0] + b[0]) / 2,
          Math.max(3, (a[1] + b[1]) / 2) + 1.1,
          (a[2] + b[2]) / 2,
        );
        const m = mesh(g, "#8da6a0");
        m.castShadow = true;
        bridges.add(m);
      }
    }
    scene.add(bridges);
    const construction = mesh(
      box(52, 0.8, 65, closure.point[0], 0.6, closure.point[2]),
      "#b8a078",
    );
    scene.add(construction);
    const fence: THREE.BufferGeometry[] = [];
    for (let i = -26; i <= 26; i += 4) {
      fence.push(
        box(0.18, 3, 0.18, closure.point[0] + i, 1.5, closure.point[2] - 32.5),
      );
      fence.push(
        box(0.18, 3, 0.18, closure.point[0] + i, 1.5, closure.point[2] + 32.5),
      );
    }
    scene.add(merged(fence, "#d6963b"));
    const crane = new THREE.Group();
    crane.add(
      mesh(
        box(1, 48, 1, closure.point[0] - 16, 24, closure.point[2]),
        "#d9a02b",
      ),
      mesh(
        box(65, 1.5, 1.5, closure.point[0] - 5, 48, closure.point[2]),
        "#e7b641",
      ),
    );
    scene.add(crane);
    const routeGroup = new THREE.Group(),
      selectionGroup = new THREE.Group(),
      indoorGroup = new THREE.Group();
    scene.add(routeGroup, selectionGroup, indoorGroup);
    const walkWorld = createWalkWorld();
    scene.add(walkWorld);
    const avatar = new THREE.Group();
    const body = mesh(new THREE.CapsuleGeometry(0.38, 1, 5, 8), "#f1c84e");
    body.position.y = 1;
    avatar.add(body);
    const head = mesh(new THREE.SphereGeometry(0.29, 12, 8), "#f6d5b2");
    head.position.y = 1.94;
    avatar.add(head);
    const backpack = mesh(box(0.6, 0.65, 0.27, 0, 1.25, 0.35), "#29474e");
    avatar.add(backpack);
    avatar.visible = false;
    scene.add(avatar);
    const rainGeo = new THREE.BufferGeometry(),
      rainPos = new Float32Array(1800 * 3);
    for (let i = 0; i < 1800; i++) {
      rainPos[i * 3] = (random() - 0.5) * 1400;
      rainPos[i * 3 + 1] = random() * 220;
      rainPos[i * 3 + 2] = (random() - 0.5) * 1400;
    }
    rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
    const particles = new THREE.Points(
      rainGeo,
      new THREE.PointsMaterial({
        color: "#e2eff6",
        size: 1,
        transparent: true,
        opacity: 0.6,
      }),
    );
    particles.visible = false;
    scene.add(particles);
    const crowd = new THREE.Group();
    for (let i = 0; i < 100; i++) {
      const f = nearPaths[Math.floor(random() * nearPaths.length)];
      if (!f) continue;
      const p = f.points[Math.floor(random() * f.points.length)];
      const dot = mesh(
        new THREE.CapsuleGeometry(0.42, 0.8, 3, 5),
        ["#5d7f8b", "#be8057", "#68806b", "#454e60"][i % 4],
      );
      dot.position.set(p[0], 1, p[1]);
      dot.userData.path = f.points;
      dot.userData.t = random() * Math.max(1, f.points.length - 1);
      crowd.add(dot);
    }
    scene.add(crowd);
    crowd.visible = false;
    const vehicles = new THREE.Group();
    const drivePaths = mapFeatures.filter(
      (f) => f.type === "road" && (f.width || 0) > 10 && f.points.length > 3,
    );
    for (let i = 0; i < 14; i++) {
      const path = drivePaths[i % drivePaths.length];
      if (!path) continue;
      const car = new THREE.Group();
      const chassis = mesh(
        new THREE.BoxGeometry(4.4, 0.85, 1.8),
        ["#e0d4b4", "#6b898c", "#b57d4f", "#405564"][i % 4],
      );
      chassis.position.y = 0.65;
      car.add(chassis);
      const cabin = mesh(new THREE.BoxGeometry(2.25, 0.65, 1.65), "#8dadae");
      cabin.position.set(-0.25, 1.35, 0);
      car.add(cabin);
      for (const z of [-0.9, 0.9])
        for (const x of [-1.4, 1.4]) {
          const wheel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.35, 0.35, 0.22, 8),
            new THREE.MeshStandardMaterial({ color: "#36433e" }),
          );
          wheel.rotation.x = Math.PI / 2;
          wheel.position.set(x, 0.35, z);
          car.add(wheel);
        }
      const lights = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.2, 1.25),
        new THREE.MeshBasicMaterial({ color: "#fff4ce" }),
      );
      lights.position.set(2.22, 0.78, 0);
      car.add(lights);
      car.userData.path = path.points;
      car.userData.t = i * 0.3;
      vehicles.add(car);
    }
    scene.add(vehicles);

    const labelElements: HTMLButtonElement[] = [];
    for (const b of buildings) {
      const el = document.createElement("button");
      el.className = "map-building-label";
      el.innerHTML = `<span class="label-dot"></span><strong>${b.id === "LIB" ? "DP" : b.id === "PSE" ? "PSE / E7" : b.id}</strong><span class="label-name">${b.shortName}</span>`;
      el.setAttribute("aria-label", `Explore ${b.shortName}`);
      el.onclick = () => p.current.onSelect(b.id);
      labels.current!.appendChild(el);
      labelElements.push(el);
    }
    const destination = new THREE.Vector3(420, 530, 580),
      target = controls.target.clone(),
      player = new THREE.Vector3(80, 1, -70),
      keys: Record<string, boolean> = {};
    const s: any = {
      scene,
      camera,
      controls,
      renderer,
      destination,
      target,
      transition: 1,
      player,
      keys,
      mode: "orbit",
      yaw: 0,
      pitch: 0,
      routeGroup,
      selectionGroup,
      indoorGroup,
      buildingMeshes,
      avatar,
      ambient,
      sun,
      ground,
      treeMeshes,
      particles,
      walkWorld,
      pendingSpawn: null,
      networkWalk: false,
      walkContext: null,
      basemaps,
      buildingMaterials,
      sky,
      skyUniforms,
      buildingGroup,
      surfaceGroup,
      waterMesh,
      treeTrunks,
      bridges,
      pathMesh,
      crowd,
    };
    state.current = s;
    const resize = () => {
      camera.aspect = root.clientWidth / root.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(root.clientWidth, root.clientHeight);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(root);
    const raycaster = new THREE.Raycaster(),
      pointer = new THREE.Vector2();
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      renderer.domElement.focus({ preventScroll: true });
      down = { x: e.clientX, y: e.clientY };
      if (p.current.mode === "first" || p.current.mode === "third") {
        renderer.domElement.setPointerCapture(e.pointerId);
      }
    };
    const onMove = (e: PointerEvent) => {
      if (
        (p.current.mode === "first" || p.current.mode === "third") &&
        (e.buttons === 1 || document.pointerLockElement === renderer.domElement)
      ) {
        s.yaw -= e.movementX * 0.003;
        s.pitch = Math.max(
          -1.35,
          Math.min(1.35, s.pitch - e.movementY * 0.002),
        );
      }
    };
    const onUp = (e: PointerEvent) => {
      if (
        down &&
        Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5 &&
        p.current.mode !== "first" &&
        p.current.mode !== "third"
      ) {
        const r = root.getBoundingClientRect();
        pointer.set(
          ((e.clientX - r.left) / r.width) * 2 - 1,
          (-(e.clientY - r.top) / r.height) * 2 + 1,
        );
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(buildingGroup.children, true);
        const hit = hits.find((x) => x.object.userData.building);
        if (hit) p.current.onSelect(hit.object.userData.building);
      }
      down = null;
    };
    const keydown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.matches("input,textarea,select")) return;
      if (
        [
          "w",
          "a",
          "s",
          "d",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "Shift",
        ].includes(e.key)
      ) {
        keys[e.key.toLowerCase()] = true;
        if (p.current.mode === "first" || p.current.mode === "third")
          e.preventDefault();
      }
    };
    const keyup = (e: KeyboardEvent) => {
      keys[e.key.toLowerCase()] = false;
    };
    const blur = () => Object.keys(keys).forEach((k) => (keys[k] = false));
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", blur);
    controls.addEventListener("start", () => (s.transition = 0));
    let frame = 0,
      last = performance.now(),
      lastPosition = 0;
    const tmp = new THREE.Vector3();
    const animate = (now: number) => {
      frame = requestAnimationFrame(animate);
      if (document.visibilityState === "hidden") {
        last = now;
        return;
      }
      const battery = p.current.quality === "battery";
      if (battery && now - last < 32) return;
      const dt = Math.max(0, Math.min((now - last) / 1000, 0.05));
      last = now;
      const current = p.current;
      if (current.mode !== s.mode) {
        const wasWalking = s.mode === "first" || s.mode === "third";
        s.mode = current.mode;
        camera.near =
          current.mode === "first" || current.mode === "third" ? 0.08 : 1;
        camera.updateProjectionMatrix();
        if (current.mode === "first" || current.mode === "third") {
          controls.enabled = false;
          s.transition = 0;
          const b = buildingById[current.selected || "DC"];
          if (!wasWalking && current.indoor && b?.id === "DC") {
            const corridor = indoorFeatures.find(
              (f) =>
                f.building === "DC" &&
                f.type === "corridor" &&
                f.levels.includes(1) &&
                f.points.length > 1,
            );
            if (corridor)
              player.set(corridor.points[0][0], 1, corridor.points[0][1]);
            else player.set(b.center[0], 1, b.center[2]);
          } else if (!wasWalking && b) {
            const candidates = mapFeatures
              .filter((f) => f.type === "path")
              .flatMap((f) => f.points)
              .filter(
                (pt) =>
                  !buildings.some((bb) =>
                    pointInPolygon(pt[0], pt[1], bb.polygon),
                  ),
              )
              .sort(
                (a, c) =>
                  Math.hypot(a[0] - b.center[0], a[1] - b.center[2]) -
                  Math.hypot(c[0] - b.center[0], c[1] - b.center[2]),
              );
            const at = candidates[0];
            if (at) player.set(at[0], 0.5, at[1]);
            else player.set(b.center[0] + 60, 0.5, b.center[2] + 60);
          }
          if (!wasWalking) {
            s.yaw = -0.5;
            s.pitch = 0;
          }
        } else {
          controls.enabled = true;
          s.target.copy(
            current.selected
              ? v(buildingById[current.selected].center)
              : new THREE.Vector3(-20, 0, 30),
          );
          s.destination
            .copy(s.target)
            .add(
              current.mode === "map"
                ? new THREE.Vector3(0, 900, 1)
                : new THREE.Vector3(450, 650, 600),
            );
          s.transition = 1;
        }
      }
      if (current.mode === "first" || current.mode === "third") {
        if (current.playing && current.route) {
          const pos = routePoint(current.route, current.progress);
          player.copy(v(pos.point));
          const dx = pos.next[0] - player.x,
            dz = pos.next[2] - player.z;
          if (Math.hypot(dx, dz) > 0.1) s.yaw = Math.atan2(-dx, -dz);
        } else {
          const f =
              (keys.w || keys.arrowup ? 1 : 0) -
              (keys.s || keys.arrowdown ? 1 : 0),
            side = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
          if (keys.arrowleft) s.yaw += dt * 1.7;
          if (keys.arrowright) s.yaw -= dt * 1.7;
          const speed = (keys.shift ? 1.65 : 1) * dt;
          const norm = Math.hypot(f, side) || 1,
            forward = (f / norm) * 4.8,
            strafe = (side / norm) * 2.8;
          const dx =
              (-Math.sin(s.yaw) * forward + Math.cos(s.yaw) * strafe) * speed,
            dz =
              (-Math.cos(s.yaw) * forward - Math.sin(s.yaw) * strafe) * speed;
          const insideDC =
            current.indoor && current.selected === "DC" && current.floor === 1;
          const blocked = (x: number, z: number) =>
            sampleWalkSurface(x, z, player.y)
              ? false
              : s.walkContext?.kind === "tunnel" &&
                  Math.min(
                    Math.hypot(x - s.walkContext.a[0], z - s.walkContext.a[2]),
                    Math.hypot(x - s.walkContext.b[0], z - s.walkContext.b[2]),
                  ) > 1
                ? true
                : insideDC
                  ? collides(x, z)
                  : buildings.some(
                      (b) =>
                        !(current.indoor && b.id === current.selected) &&
                        pointInPolygon(x, z, b.polygon),
                    );
          if (!blocked(player.x + dx, player.z)) player.x += dx;
          if (!blocked(player.x, player.z + dz)) player.z += dz;
          player.x = THREE.MathUtils.clamp(player.x, -2100, 1700);
          player.z = THREE.MathUtils.clamp(player.z, -1400, 1400);
        }
        if (!current.playing) {
          const surface = sampleWalkSurface(player.x, player.z, player.y);
          if (surface) {
            player.y = THREE.MathUtils.damp(player.y, surface.height, 24, dt);
            s.walkContext = surface.surface;
            s.networkWalk = true;
            if (now - lastPosition > 250)
              current.onWalkContext?.(
                surface.surface.building,
                Math.max(0, Math.floor((player.y - 0.5 + 0.15) / 3.8) + 1),
              );
          } else {
            s.walkContext = null;
            if (!s.networkWalk && current.indoor)
              player.y = (current.floor - 1) * 3.8 + 0.5;
          }
        }

        if (s.pendingSpawn) {
          player.copy(v(s.pendingSpawn.point));
          s.yaw = s.pendingSpawn.yaw || 0;
          s.pendingSpawn = null;
        }
        const eye = player.clone().add(new THREE.Vector3(0, 1.65, 0)),
          look = new THREE.Vector3(
            -Math.sin(s.yaw) * Math.cos(s.pitch),
            Math.sin(s.pitch),
            -Math.cos(s.yaw) * Math.cos(s.pitch),
          );
        if (current.mode === "first") {
          camera.position.lerp(eye, 0.3);
          camera.lookAt(eye.clone().add(look));
          avatar.visible = false;
        } else {
          camera.position.lerp(
            eye
              .clone()
              .sub(look.clone().multiplyScalar(7))
              .add(new THREE.Vector3(0, 3, 0)),
            0.13,
          );
          camera.lookAt(eye.clone().add(look.clone().multiplyScalar(3)));
          avatar.visible = true;
          avatar.position.copy(player);
          avatar.rotation.y = s.yaw;
        }
        if (now - lastPosition > 250) {
          current.onPosition?.(player.toArray() as Point);
          lastPosition = now;
        }
      } else {
        avatar.visible = current.playing && !!current.route;
        if (avatar.visible) {
          avatar.position.copy(
            v(routePoint(current.route!, current.progress).point),
          );
          avatar.scale.setScalar(3);
        } else avatar.scale.setScalar(1);
        if (s.transition) {
          camera.position.lerp(destination, 1 - Math.exp(-dt * 7));
          controls.target.lerp(target, 1 - Math.exp(-dt * 7));
          if (camera.position.distanceTo(destination) < 0.3) s.transition = 0;
        }
        controls.update();
      }
      if (particles.visible) {
        const speed =
          current.weather.code >= 71 && current.weather.code <= 77 ? 9 : 65;
        for (let i = 0; i < 1800; i++) {
          rainPos[i * 3 + 1] -= dt * speed;
          if (rainPos[i * 3 + 1] < 1) rainPos[i * 3 + 1] = 220;
        }
        rainGeo.attributes.position.needsUpdate = true;
      }
      buildings.forEach((b, i) => {
        const el = labelElements[i];
        tmp
          .set(
            b.center[0],
            (buildingMeshes.get(b.id)?.userData.height || b.height) + 5,
            b.center[2],
          )
          .project(camera);
        const far = camera.position.distanceTo(v(b.center));
        const visible =
          current.showLabels &&
          current.mode !== "first" &&
          current.mode !== "third" &&
          tmp.z < 1 &&
          Math.abs(tmp.x) < 1.1 &&
          Math.abs(tmp.y) < 1.1 &&
          (far < 320 ||
            [
              "DC",
              "MC",
              "SLC",
              "LIB",
              "E5",
              "QNC",
              "M3",
              "STC",
              "PAC",
              "EV3",
              "HH",
              "EIT",
              "PSE",
            ].includes(b.id));
        el.style.display = visible ? "flex" : "none";
        if (visible) {
          el.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * root.clientWidth}px,${(-tmp.y * 0.5 + 0.5) * root.clientHeight}px) translate(-50%,-100%)`;
          el.classList.toggle("selected", current.selected === b.id);
          el.classList.toggle("compact", far > 650);
        }
      });
      crowd.children.forEach((o: any, i: number) => {
        const path = o.userData.path;
        if (!path || path.length < 2) return;
        o.visible = i < Math.min(100, 25 + (current.flowScale || 0.4) * 80);
        o.userData.t =
          ((((o.userData.t || 0) + dt * (0.018 + (i % 4) * 0.004)) %
            (path.length - 1)) +
            (path.length - 1)) %
          (path.length - 1);
        const k = Math.floor(o.userData.t),
          t = o.userData.t - k,
          a = path[k],
          b = path[k + 1];
        if (!a || !b) {
          o.userData.t = 0;
          return;
        }
        o.position.x = a[0] + (b[0] - a[0]) * t;
        o.position.z = a[1] + (b[1] - a[1]) * t;
        o.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
      });
      vehicles.visible = current.showCrowds;
      vehicles.children.forEach((car: any, i: number) => {
        const path = car.userData.path;
        if (!path || path.length < 2) return;
        car.userData.t = (car.userData.t + dt * 0.045) % (path.length - 1);
        const k = Math.floor(car.userData.t),
          t = car.userData.t - k,
          a = path[k],
          b = path[k + 1];
        if (!a || !b) return;
        car.position.set(
          a[0] + (b[0] - a[0]) * t,
          0.15,
          a[1] + (b[1] - a[1]) * t,
        );
        car.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
      });
      const geographic =
        current.visualMode === "satellite" || current.visualMode === "terrain";
      buildingGroup.visible = !geographic;
      bridges.visible = !geographic && current.showConnections;
      treeMeshes.forEach((t) => (t.visible = !geographic));
      treeTrunks.visible = !geographic;
      surfaceGroup.visible = !geographic;
      pathMesh.visible = !geographic && current.showPaths;
      waterMesh.visible = !geographic;
      crowd.visible = !geographic && current.showCrowds;
      vehicles.visible = !geographic && current.showCrowds;
      crane.visible = !geographic;
      construction.visible = !geographic;
      const insideTunnel =
        s.walkContext?.kind === "tunnel" &&
        (current.mode === "first" || current.mode === "third");
      walkWorld.visible =
        !geographic &&
        (current.mode === "first" ||
          current.mode === "third" ||
          current.indoor);
      if (insideTunnel) {
        buildingGroup.visible = false;
        indoorGroup.visible = false;
        ground.visible = true;
        surfaceGroup.visible = false;
        pathMesh.visible = false;
        basemaps.group.visible = false;
      } else {
        ground.visible = true;
        indoorGroup.visible = current.indoor;
      }
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(animate);
    props.onReady();
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", blur);
      controls.dispose();
      scene.traverse((o) => {
        if (
          o instanceof THREE.Mesh ||
          o instanceof THREE.Line ||
          o instanceof THREE.Points
        ) {
          o.geometry?.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
            m?.dispose(),
          );
        }
      });
      basemaps.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      labelElements.forEach((e) => e.remove());
      state.current = null;
    };
  }, []);
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    disposeGroup(s.routeGroup);
    if (!props.route) return;
    for (let i = 0; i < props.route.edges.length; i++) {
      const a = props.route.nodes[i].point,
        b = props.route.nodes[i + 1].point;
      const points = [
        new THREE.Vector3(a[0], Math.max(0.75, a[1]), a[2]),
        new THREE.Vector3(b[0], Math.max(0.75, b[1]), b[2]),
      ];
      if (points[0].distanceTo(points[1]) < 0.01) continue;
      const line = new THREE.CatmullRomCurve3(points);
      const width = props.indoor ? 0.32 : 1.25;
      const tube = mesh(
        new THREE.TubeGeometry(line, 1, width, 6, false),
        props.route.edges[i].kind === "outdoor" ? "#ffc94f" : "#40daca",
      );
      (tube.material as THREE.MeshStandardMaterial).emissive.set(
        props.route.edges[i].kind === "outdoor" ? "#af6800" : "#187e75",
      );
      (tube.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.25;
      s.routeGroup.add(tube);
    }
    for (const [idx, color] of [
      [0, "#ffffff"],
      [props.route.nodes.length - 1, "#ffcf4d"],
    ] as [number, string][]) {
      const p = props.route.nodes[idx].point;
      const marker = mesh(new THREE.CylinderGeometry(3, 3, 1, 24), color);
      marker.position.set(p[0], Math.max(1, p[1]), p[2]);
      s.routeGroup.add(marker);
    }
  }, [props.route, props.indoor]);
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    disposeGroup(s.selectionGroup);
    for (const [id, g] of s.buildingMeshes)
      g.visible = !(props.indoor && props.selected === id);
    if (props.selected) {
      const b = buildingById[props.selected];
      if (b) {
        const outline = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(
            b.polygon.map((p) => new THREE.Vector3(p[0], 0.35, p[1])),
          ),
          new THREE.LineBasicMaterial({ color: "#e9b02b" }),
        );
        s.selectionGroup.add(outline);
      }
    }
    disposeGroup(s.indoorGroup);
    if (props.indoor && props.selected) {
      const b = buildingById[props.selected];
      if (!b) return;
      const y = (props.floor - 1) * 3.8 + 0.3;
      const floor = mesh(shapeGeometry(b.polygon), "#e8e3d9");
      floor.position.y = y;
      floor.receiveShadow = true;
      s.indoorGroup.add(floor);
      if (b.id === "DC" && props.floor === 1) {
        if (props.mode === "first") {
          const ceiling = new THREE.Mesh(
            shapeGeometry(b.polygon),
            new THREE.MeshBasicMaterial({
              color: "#becac8",
              side: THREE.DoubleSide,
            }),
          );
          s.indoorGroup.add(new THREE.AmbientLight("#fff5df", 0.7));
          ceiling.position.y = y + 3.5;
          s.indoorGroup.add(ceiling);
          const panels: THREE.BufferGeometry[] = [];
          const xs = b.polygon.map((p) => p[0]),
            zs = b.polygon.map((p) => p[1]);
          for (let x = Math.min(...xs) + 4; x < Math.max(...xs); x += 8)
            for (let z = Math.min(...zs) + 4; z < Math.max(...zs); z += 8)
              if (pointInPolygon(x, z, b.polygon))
                panels.push(box(1.2, 0.04, 2.2, x, y + 3.44, z));
          const lights = merged(panels, "#fff8db");
          if (lights instanceof THREE.Mesh) {
            (lights.material as THREE.MeshStandardMaterial).emissive.set(
              "#fff4c9",
            );
            (lights.material as THREE.MeshStandardMaterial).emissiveIntensity =
              0.8;
          }
          s.indoorGroup.add(lights);
          const tile = document.createElement("canvas");
          tile.width = 128;
          tile.height = 128;
          const tc = tile.getContext("2d")!;
          tc.fillStyle = "#d8d4c9";
          tc.fillRect(0, 0, 128, 128);
          tc.strokeStyle = "#bcbcb2";
          tc.lineWidth = 1;
          tc.strokeRect(0, 0, 128, 128);
          const tx = new THREE.CanvasTexture(tile);
          tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
          tx.repeat.set(0.5, 0.5);
          (floor.material as THREE.MeshStandardMaterial).map = tx;
        }
        const walls: THREE.BufferGeometry[] = [],
          glass: THREE.BufferGeometry[] = [];
        for (const w of dcWalls) {
          const d = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
          const g = new THREE.BoxGeometry(
            d,
            props.mode === "first" || props.mode === "third" ? 3.1 : 2.1,
            0.2,
          );
          g.rotateY(-Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0]));
          g.translate(
            (w.a[0] + w.b[0]) / 2,
            y +
              (props.mode === "first" || props.mode === "third" ? 1.55 : 1.05),
            (w.a[1] + w.b[1]) / 2,
          );
          (w.glass ? glass : walls).push(g);
        }
        s.indoorGroup.add(
          merged(walls, "#c6c6b9", true),
          merged(glass, "#7caaae"),
        );
        const desks: THREE.BufferGeometry[] = [],
          chairs: THREE.BufferGeometry[] = [];
        for (const r of dcRooms) {
          if (
            !["lecture", "conference"].includes(r.room) &&
            !/study/i.test(r.name)
          )
            continue;
          const xs = r.points.map((p) => p[0]),
            zs = r.points.map((p) => p[1]);
          for (let x = Math.min(...xs) + 2; x < Math.max(...xs) - 2; x += 3.3)
            for (let z = Math.min(...zs) + 2; z < Math.max(...zs) - 2; z += 2.5)
              if (pointInPolygon(x, z, r.points)) {
                desks.push(box(1.6, 0.12, 0.8, x, y + 0.8, z));
                chairs.push(box(0.5, 0.6, 0.5, x, y + 0.3, z + 0.8));
              }
        }
        s.indoorGroup.add(merged(desks, "#b18a5b"), merged(chairs, "#566f73"));
        // Mapped room labels, rendered as crisp signs on the floor-plan and at eye level.
        for (const r of dcRooms.filter((r) => r.ref || r.name).slice(0, 70)) {
          const ps = r.points.slice(0, -1),
            x = ps.reduce((s, p) => s + p[0], 0) / ps.length,
            z = ps.reduce((s, p) => s + p[1], 0) / ps.length;
          const canvas = document.createElement("canvas");
          canvas.width = 256;
          canvas.height = 64;
          const c = canvas.getContext("2d")!;
          c.fillStyle = "#183437";
          c.fillRect(0, 0, 256, 64);
          c.fillStyle = "#f5e4b5";
          c.font = "600 28px system-ui";
          c.textAlign = "center";
          c.fillText(r.ref || r.name.slice(0, 17), 128, 42);
          const texture = new THREE.CanvasTexture(canvas);
          const sign = new THREE.Sprite(
            new THREE.SpriteMaterial({ map: texture, depthTest: true }),
          );
          sign.position.set(x, y + 2.7, z);
          sign.scale.set(
            props.mode === "first" || props.mode === "third" ? 2.3 : 5.2,
            props.mode === "first" || props.mode === "third" ? 0.575 : 1.3,
            1,
          );
          s.indoorGroup.add(sign);
        }
      } else {
        for (const path of communityPaths.filter(
          (p) =>
            p.from === b.id &&
            p.fromFloor === props.floor &&
            p.kind === "hallway",
        )) {
          const line = mesh(
            ribbon(
              path.points.map((p) => [p[0], p[2]]),
              2.7,
              y + 0.06,
            ),
            "#8cb4a6",
          );
          s.indoorGroup.add(line);
        }
        const walls: THREE.BufferGeometry[] = [];
        for (let i = 1; i < b.polygon.length; i++) {
          const a = b.polygon[i - 1],
            c = b.polygon[i],
            d = Math.hypot(c[0] - a[0], c[1] - a[1]);
          const g = new THREE.BoxGeometry(d, 2, 0.25);
          g.rotateY(-Math.atan2(c[1] - a[1], c[0] - a[0]));
          g.translate((a[0] + c[0]) / 2, y + 1, (a[1] + c[1]) / 2);
          walls.push(g);
        }
        s.indoorGroup.add(merged(walls, "#b5bdb3"));
        for (const place of places.filter(
          (p) => p.building === b.id && p.floor === props.floor,
        )) {
          const dot = mesh(
            new THREE.CylinderGeometry(1, 1, 0.15, 16),
            place.category === "room" ? "#e3b650" : "#56b2a9",
          );
          dot.position.set(place.point[0], y + 0.2, place.point[2]);
          s.indoorGroup.add(dot);
        }
      }
    }
  }, [props.selected, props.indoor, props.floor, props.mode]);
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    const ratio =
      props.quality === "battery"
        ? 1
        : props.quality === "high"
          ? Math.min(devicePixelRatio, 2)
          : Math.min(devicePixelRatio, window.innerWidth < 760 ? 1.25 : 1.7);
    s.renderer.setPixelRatio(ratio);
    s.renderer.shadowMap.enabled = props.quality !== "battery";
    const el = host.current;
    if (el) {
      if (props.viewportInset)
        s.camera.setViewOffset(
          el.clientWidth,
          el.clientHeight,
          0,
          el.clientHeight * props.viewportInset,
          el.clientWidth,
          el.clientHeight,
        );
      else s.camera.clearViewOffset();
      s.camera.updateProjectionMatrix();
    }
    const angle = (((props.timeOfDay ?? 13) - 6) / 12) * Math.PI;
    s.sun.position.set(
      Math.cos(angle) * 550,
      Math.max(60, Math.sin(angle) * 650),
      250,
    );
    s.ground.position.y=props.visualMode==="satellite"||props.visualMode==="terrain"?-3:-.25;
    s.basemaps.setMode(props.visualMode || "realistic");
    s.basemaps.setNight(props.night);
    s.buildingMaterials.setNight(props.night);
    s.sky.visible = !props.night;
    s.skyUniforms.sunPosition.value.copy(s.sun.position);
    s.pathMesh.visible = props.showPaths;
    s.bridges.visible = props.showConnections;
    s.crowd.visible = props.showCrowds;
    const snowy =
      props.season === "winter" ||
      (props.weather.code >= 71 && props.weather.code <= 77);
    const night = props.night;
    const bg = night
      ? "#152b39"
      : props.weather.code === 45
        ? "#bac6c5"
        : "#b9c9ca";
    s.scene.background.set(bg);
    s.scene.fog.color.set(bg);
    s.scene.fog.near = props.weather.code === 45 ? 100 : night ? 650 : 1900;
    s.scene.fog.far = props.weather.code === 45 ? 650 : night ? 2100 : 3600;
    s.ground.material.color.set(
      snowy ? "#e0e7e2" : night ? "#617361" : "#b2c3a7",
    );
    s.ambient.intensity = night ? 0.6 : 1.35;
    s.sun.intensity = night ? 0.4 : 2.5;
    s.renderer.toneMappingExposure = night ? 1 : 0.88;
    s.treeMeshes.forEach((m: any, i: number) =>
      m.material?.color.set(
        snowy
          ? "#bccfc1"
          : props.season === "autumn"
            ? ["#b89346", "#b86c3c", "#809058"][i]
            : ["#678665", "#7c996c", "#52745c"][i],
      ),
    );
    s.particles.visible = props.weather.precipitation > 0;
    s.particles.material.size = snowy ? 2.5 : 0.9;
  }, [
    props.weather,
    props.night,
    props.season,
    props.showPaths,
    props.showConnections,
    props.showCrowds,
    props.quality,
    props.timeOfDay,
    props.viewportInset,
    props.visualMode,
  ]);
  return (
    <div className="scene-root" ref={host}>
      <div className="map-labels" ref={labels} />
    </div>
  );
});
