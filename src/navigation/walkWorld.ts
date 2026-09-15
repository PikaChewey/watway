import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import raw from "../data/watisgrass.json";
import { communityLinks } from "../data/communityPaths";
import { buildingById, project } from "../data/campus";
import type { Point } from "../types";
export interface WalkSurface {
  a: Point;
  b: Point;
  width: number;
  kind: "stairs" | "landing" | "tunnel" | "bridge";
  building: string;
  floor: number;
  steps?: number;
}
export const walkSurfaces: WalkSurface[] = [];
const code = (s: string) => (s === "DP" ? "LIB" : s === "E7" ? "PSE" : s);
const floorNumber = (s: string) => (s === "B" ? 0 : Number(s) || 1);
export const stairWells: {
  id: string;
  point: Point;
  building: string;
  floor: number;
}[] = [];
for (const f of raw.features as any[]) {
  if (f.properties.type !== "stairs" || f.geometry.type !== "Point") continue;
  const c = f.properties.connections || [];
  const center = project(f.geometry.coordinates[1], f.geometry.coordinates[0]);
  const ordered = c
    .filter((x: any) => buildingById[code(x.buildingCode)])
    .sort((a: any, b: any) => a.level - b.level);
  if (ordered.length < 2) continue;
  const b = code(ordered[0].buildingCode),
    first = floorNumber(ordered[0].floor);
  stairWells.push({
    id: f.id,
    point: [center[0] - 1, (first - 1) * 3.8 + 0.5, center[2] + 3.4],
    building: b,
    floor: first,
  });
  for (let i = 1; i < ordered.length; i++) {
    const fa = floorNumber(ordered[i - 1].floor),
      fb = floorNumber(ordered[i].floor);
    if (fb - fa !== 1) continue;
    const y = (fa - 1) * 3.8 + 0.5,
      x = center[0],
      z = center[2];
    walkSurfaces.push(
      {
        a: [x - 1, y, z + 3],
        b: [x - 1, y + 1.9, z - 3],
        width: 1.8,
        kind: "stairs",
        building: b,
        floor: fa,
        steps: 12,
      },
      {
        a: [x + 1, y + 1.9, z - 3],
        b: [x + 1, y + 3.8, z + 3],
        width: 1.8,
        kind: "stairs",
        building: b,
        floor: fa,
        steps: 12,
      },
      {
        a: [x - 1.5, y + 1.9, z - 3.4],
        b: [x + 1.5, y + 1.9, z - 3.4],
        width: 1.4,
        kind: "landing",
        building: b,
        floor: fa,
      },
      {
        a: [x - 1.5, y, z + 3.4],
        b: [x + 1.5, y, z + 3.4],
        width: 1.4,
        kind: "landing",
        building: b,
        floor: fa,
      },
      {
        a: [x - 1.5, y + 3.8, z + 3.4],
        b: [x + 1.5, y + 3.8, z + 3.4],
        width: 1.4,
        kind: "landing",
        building: b,
        floor: fb,
      },
    );
  }
}
const segmentKeys = new Set<string>();
for (const path of communityLinks) {
  for (let i = 1; i < path.points.length; i++) {
    const a = [...path.points[i - 1]] as Point,
      b = [...path.points[i]] as Point;
    a[1] -= 0.5;
    b[1] -= 0.5;
    const key = [a.join(","), b.join(",")].sort().join("|");
    if (segmentKeys.has(key)) continue;
    segmentKeys.add(key);
    walkSurfaces.push({
      a,
      b,
      width: path.kind === "tunnel" ? 3.2 : 3.4,
      kind: path.kind === "tunnel" ? "tunnel" : "bridge",
      building: i < path.points.length / 2 ? path.from : path.to,
      floor: i < path.points.length / 2 ? path.fromFloor : path.toFloor,
    });
  }
}
export function sampleWalkSurface(x: number, z: number, currentY: number) {
  let best:
    { height: number; surface: WalkSurface; distance: number } | undefined;
  for (const surface of walkSurfaces) {
    const dx = surface.b[0] - surface.a[0],
      dz = surface.b[2] - surface.a[2],
      length2 = dx * dx + dz * dz;
    if (length2 < 0.001) continue;
    const t = ((x - surface.a[0]) * dx + (z - surface.a[2]) * dz) / length2;
    if (t < -0.04 || t > 1.04) continue;
    const clamped = Math.max(0, Math.min(1, t)),
      distance = Math.hypot(
        x - surface.a[0] - clamped * dx,
        z - surface.a[2] - clamped * dz,
      );
    if (distance > surface.width / 2 + 0.12) continue;
    const stepT = surface.steps
      ? Math.round(clamped * surface.steps) / surface.steps
      : clamped;
    const height = surface.a[1] + (surface.b[1] - surface.a[1]) * stepT;
    if (Math.abs(height - currentY) > 0.65) continue;
    if (
      !best ||
      Math.abs(height - currentY) + distance * 0.05 <
        Math.abs(best.height - currentY) + best.distance * 0.05
    )
      best = { height, surface, distance };
  }
  return best;
}
function quad(a: Point, b: Point, c: Point, d: Point) {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3),
  );
  g.computeVertexNormals();
  return g;
}
export function createWalkWorld() {
  const group = new THREE.Group();
  const floors: THREE.BufferGeometry[] = [],
    walls: THREE.BufferGeometry[] = [],
    ceilings: THREE.BufferGeometry[] = [],
    lights: THREE.BufferGeometry[] = [],
    rails: THREE.BufferGeometry[] = [];
  for (const s of walkSurfaces) {
    const dx = s.b[0] - s.a[0],
      dz = s.b[2] - s.a[2],
      len = Math.hypot(dx, dz);
    if (len < 0.05) continue;
    const nx = ((-dz / len) * s.width) / 2,
      nz = ((dx / len) * s.width) / 2;
    const point = (p: Point, side: number, y = 0): Point => [
      p[0] + nx * side,
      p[1] + y,
      p[2] + nz * side,
    ];
    if (s.kind === "stairs") {
      for (let i = 0; i < s.steps!; i++) {
        const t = (i + 0.5) / s.steps!,
          height = s.a[1] + ((s.b[1] - s.a[1]) * (i + 1)) / s.steps!;
        const stair = new THREE.BoxGeometry(
          len / s.steps! + 0.025,
          0.17,
          s.width,
        );
        stair.rotateY(-Math.atan2(dz, dx));
        stair.translate(s.a[0] + dx * t, height - 0.1, s.a[2] + dz * t);
        floors.push(stair);
      }
      for (const side of [-1, 1]) {
        const ra = point(s.a, side, 1),
          rb = point(s.b, side, 1);
        const rail = new THREE.CylinderGeometry(
          0.04,
          0.04,
          new THREE.Vector3(...ra).distanceTo(new THREE.Vector3(...rb)),
          6,
        );
        rail.applyQuaternion(
          new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3(...rb).sub(new THREE.Vector3(...ra)).normalize(),
          ),
        );
        rail.translate(
          (ra[0] + rb[0]) / 2,
          (ra[1] + rb[1]) / 2,
          (ra[2] + rb[2]) / 2,
        );
        rails.push(rail);
      }
    } else
      floors.push(
        quad(
          point(s.a, -1, -0.04),
          point(s.b, -1, -0.04),
          point(s.b, 1, -0.04),
          point(s.a, 1, -0.04),
        ),
      );
    if (s.kind === "tunnel") {
      walls.push(
        quad(
          point(s.a, -1),
          point(s.b, -1),
          point(s.b, -1, 2.7),
          point(s.a, -1, 2.7),
        ),
        quad(
          point(s.a, 1),
          point(s.b, 1),
          point(s.b, 1, 2.7),
          point(s.a, 1, 2.7),
        ),
      );
      ceilings.push(
        quad(
          point(s.a, -1, 2.7),
          point(s.b, -1, 2.7),
          point(s.b, 1, 2.7),
          point(s.a, 1, 2.7),
        ),
      );
      for (let d = 2; d < len; d += 6) {
        const t = d / len,
          g = new THREE.BoxGeometry(0.2, 0.04, 1.2);
        g.rotateY(-Math.atan2(dz, dx));
        g.translate(
          s.a[0] + dx * t,
          s.a[1] + (s.b[1] - s.a[1]) * t + 2.66,
          s.a[2] + dz * t,
        );
        lights.push(g);
      }
    }
  }
  const add = (gs: THREE.BufferGeometry[], color: string, basic = false) => {
    if (!gs.length) return;
    const geometry = mergeGeometries(
      gs.map((g) => {
        g.deleteAttribute("uv");
        return g.index ? g.toNonIndexed() : g;
      }),
      false,
    );
    const mat = basic
      ? new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
      : new THREE.MeshStandardMaterial({
          color,
          roughness: 0.9,
          side: THREE.DoubleSide,
        });
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
    gs.forEach((g) => g.dispose());
  };
  add(floors, "#8e948a");
  add(walls, "#b5b9a9", true);
  add(ceilings, "#b0b6aa", true);
  add(lights, "#fff3c9", true);
  add(rails, "#947544");
  return group;
}
export function tunnelStart() {
  const p =
    communityLinks.find(
      (p) => p.kind === "tunnel" && p.from === "AL" && p.to === "SCH",
    ) || communityLinks.find((p) => p.kind === "tunnel")!;
  const a = [...p.points[0]] as Point;
  a[1] -= 0.5;
  const b = p.points[1];
  return {
    point: a,
    yaw: Math.atan2(-(b[0] - a[0]), -(b[2] - a[2])),
    building: p.from,
    floor: p.fromFloor,
  };
}
