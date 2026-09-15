import { test } from "node:test";
import assert from "node:assert/strict";
import routeData from "../data/tunnel-pitch-route.json";
import {
  movePhysicalWalker,
  advanceRehearsal,
} from "../navigation/physicalWalker";
import { segments } from "../navigation/physicalModel";
import type { Point, Route } from "../types";
test("the frozen SCH to AL pitch completes through the collision controller", () => {
  const route = routeData as unknown as Route;
  let point = [...route.nodes[0].point] as Point;
  const state = { index: 1, distance: 0, blockedFrames: 0, done: false };
  for (let i = 0; i < 15000 && !state.done; i++) {
    const next = advanceRehearsal(point, route, state, 0.05, 4.8);
    assert.ok(Math.abs(next.point[1] - point[1]) <= 0.4);
    point = next.point;
    assert.ok(state.blockedFrames < 10);
  }
  assert.ok(state.done);
  assert.ok(route.edges.some((e) => e.kind === "tunnel"));
  assert.ok(
    Math.hypot(...point.map((x, i) => x - route.nodes.at(-1)!.point[i])) < 0.3,
  );
});
test("manual walking cannot strafe through either side of a tunnel wall", () => {
  const s = segments.find(
    (s) =>
      s.kind === "tunnel" && Math.hypot(s.b[0] - s.a[0], s.b[2] - s.a[2]) > 30,
  )!;
  assert.ok(s);
  const center: Point = s.a.map((n, i) => (n + s.b[i]) / 2) as Point,
    dx = s.b[0] - s.a[0],
    dz = s.b[2] - s.a[2],
    length = Math.hypot(dx, dz),
    nx = -dz / length,
    nz = dx / length;
  for (const sign of [-1, 1]) {
    let p = [...center] as Point;
    let blocked = false;
    for (let i = 0; i < 150; i++) {
      const step = movePhysicalWalker(p, nx * sign * 0.08, nz * sign * 0.08);
      p = step.point;
      blocked ||= step.blocked;
    }
    const lateral = Math.abs((p[0] - center[0]) * nx + (p[2] - center[2]) * nz);
    assert.ok(blocked);
    assert.ok(lateral < s.width / 2 + 0.15, `Crossed wall by ${lateral}m`);
  }
});
