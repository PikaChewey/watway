import {
  samplePhysical,
  coveredBuildings,
  doors,
  type PhysicalSegment,
} from "./physicalModel";
import { buildingById, buildings } from "../data/campus";
import { pointInPolygon, collides } from "../indoor";
import type { Point, Route } from "../types";
const bounds = buildings.map((b) => ({
  b,
  minX: Math.min(...b.polygon.map((p) => p[0])),
  maxX: Math.max(...b.polygon.map((p) => p[0])),
  minZ: Math.min(...b.polygon.map((p) => p[1])),
  maxZ: Math.max(...b.polygon.map((p) => p[1])),
}));
function containing(x: number, z: number) {
  return bounds
    .filter(
      (o) =>
        x >= o.minX &&
        x <= o.maxX &&
        z >= o.minZ &&
        z <= o.maxZ &&
        pointInPolygon(x, z, o.b.polygon),
    )
    .map((o) => o.b);
}
export interface WalkerResult {
  point: Point;
  blocked: boolean;
  segment?: PhysicalSegment;
  building?: string;
  floor?: number;
}
export function movePhysicalWalker(
  position: Point,
  dx: number,
  dz: number,
  heightHint?: number,
): WalkerResult {
  let point = [...position] as Point;
  const count = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.12));
  let blocked = false,
    segment: PhysicalSegment | undefined;
  const attempt = (x: number, z: number): Point | undefined => {
    if (
      doors.some(
        (d) =>
          Math.abs(d.point[1] - point[1]) < 0.4 &&
          Math.hypot(x - d.point[0], z - d.point[2]) < 0.35,
      )
    )
      return;
    const reference = heightHint === undefined ? point[1] : Math.max(point[1]-.35,Math.min(point[1]+.35,heightHint));
    const sample = samplePhysical(x, z, reference, 0.21, undefined, heightHint === undefined);
    if (sample) {
      segment = sample.segment;
      return [x, sample.height, z];
    }
    const b = containing(x, z);
    if (
      b.some((b) => b.id === "DC") &&
      Math.abs(point[1] - 0.5) < 0.35 &&
      !collides(x, z, 0.23)
    )
      return [x, 0.5, z];
    if (b.length) return;
    const nearEntrance =
      samplePhysical(point[0], point[2], point[1], 0.1)?.segment.kind ===
      "entrance";
    if (point[1] > 0.9 || point[1] < 0.1) return;
    if (nearEntrance || !samplePhysical(point[0], point[2], point[1], 0.1))
      return [x, 0.5, z];
  };
  for (let i = 0; i < count; i++) {
    const x = point[0] + dx / count,
      z = point[2] + dz / count;
    const next = attempt(x, z);
    if (next) point = next;
    else {
      const slideX = attempt(x, point[2]);
      if (slideX) point = slideX;
      const slideZ = attempt(point[0], z);
      if (slideZ) point = slideZ;
      blocked = true;
    }
  }
  const building = segment?.building || containing(point[0], point[2])[0]?.id;
  const floor =
    segment?.kind === "stairs"
      ? segment.floor
      : Math.round((point[1] - 0.5) / 3.8) + 1;
  return { point, blocked, segment, building, floor };
}
export interface RehearsalState {
  index: number;
  distance: number;
  blockedFrames: number;
  done: boolean;
}
export function advanceRehearsal(
  position: Point,
  route: Route,
  state: RehearsalState,
  dt: number,
  speed = 1.55,
): WalkerResult & { progress: number; done: boolean; yaw: number } {
  let point = [...position] as Point,
    remaining = Math.min(0.1, dt) * speed,
    yaw = 0,
    blocked = false;
  let budget = 0;
  while (remaining > 0 && state.index < route.nodes.length && budget++ < 100) {
    const target = route.nodes[state.index].point,
      dx = target[0] - point[0],
      dz = target[2] - point[2],
      horizontal = Math.hypot(dx, dz);
    if (horizontal < 0.09 && Math.abs(target[1] - point[1]) < 0.27) {
      state.index++;
      continue;
    }
    if (horizontal < 0.001) {
      const step=movePhysicalWalker(point,0,0,target[1]);
      if(Math.abs(step.point[1]-target[1])<.1&&Math.abs(step.point[1]-point[1])<=.38){point=step.point;state.index++;remaining=Math.max(0,remaining-.05);continue;}
      blocked = true;
      break;
    }
    const distance = Math.min(horizontal, remaining),
      m = movePhysicalWalker(
        point,
        (dx / horizontal) * distance,
        (dz / horizontal) * distance,
        target[1],
      );
    const moved = Math.hypot(m.point[0] - point[0], m.point[2] - point[2]);
    yaw = Math.atan2(-dx, -dz);
    point = m.point;
    state.distance += moved;
    remaining -= distance;
    if (moved < 0.001) {
      blocked = true;
      break;
    }
  }
  state.blockedFrames = blocked ? state.blockedFrames + 1 : 0;
  state.done = state.index >= route.nodes.length;
  const p = movePhysicalWalker(point, 0, 0);
  return {
    ...p,
    point,
    blocked,
    progress: state.done
      ? 1
      : Math.min(0.999, state.index / Math.max(1, route.nodes.length)),
    done: state.done,
    yaw,
  };
}
