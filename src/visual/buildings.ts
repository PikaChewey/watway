import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import parts from "../data/building-parts.json";
import type { Building } from "../types";
import {
  makeFacade,
  makeSurface,
  facadeStyle,
  facadeGeometry,
  type FacadeStyle,
} from "./materials";
const styles: FacadeStyle[] = ["concrete", "brick", "glass", "davis", "stone"];
export function createBuildingMaterials() {
  const facades = Object.fromEntries(
    styles.map((s) => [s, makeFacade(s)]),
  ) as Record<FacadeStyle, THREE.MeshStandardMaterial>;
  const roof = new THREE.MeshStandardMaterial({
    // Uniform roof finish avoids texture interference where mapped parts meet.
    roughness: 0.92,
    color: "#c4c8bd",
  });
  const concrete = new THREE.MeshStandardMaterial({
    map: makeSurface("concrete"),
    roughness: 0.9,
    color: "#b8b8aa",
  });
  const trim = new THREE.MeshStandardMaterial({
    color: "#a6ada5",
    roughness: 0.55,
    metalness: 0.2,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: "#689296",
    roughness: 0.2,
    metalness: 0.48,
    transparent: false,
    opacity: 1,
  });
  return {
    facades,
    roof,
    concrete,
    trim,
    glass,
    setNight(n: boolean) {
      for (const m of Object.values(facades)) m.emissiveIntensity = n ? 0.7 : 0;
      glass.emissive.set(n ? "#c6a86d" : "#000000");
      glass.emissiveIntensity = n ? 0.15 : 0;
    },
  };
}
function shape(points: number[][], height = 0) {
  const sh = new THREE.Shape(points.map((p) => new THREE.Vector2(p[0], -p[1])));
  const g = height
    ? new THREE.ExtrudeGeometry(sh, { depth: height, bevelEnabled: false })
    : new THREE.ShapeGeometry(sh);
  g.rotateX(-Math.PI / 2);
  return g;
}
function merge(gs: THREE.BufferGeometry[]) {
  if (!gs.length) return null;
  return mergeGeometries(
    gs.map((g) => (g.index ? g.toNonIndexed() : g)),
    false,
  );
}
export function buildDetailedBuilding(
  b: Building,
  materials: ReturnType<typeof createBuildingMaterials>,
) {
  const group = new THREE.Group();
  group.userData.building = b.id;
  const detailed = parts.filter((p) => p.building === b.id);
  const segments =
    detailed.length > 1
      ? detailed
      : [
          {
            polygon: b.polygon,
            height: b.height,
            bottom: 0,
            roofShape: "flat",
            roofHeight: 0,
            material: "",
            color: "",
          },
        ];
  const walls: THREE.BufferGeometry[] = [],
    roofGeos: THREE.BufferGeometry[] = [],
    solidGeos: THREE.BufferGeometry[] = [],
    trimGeos: THREE.BufferGeometry[] = [],
    hardware: THREE.BufferGeometry[] = [];
  let top = b.height;
  for (const segment of segments) {
    const height = Math.max(segment.bottom + 2, segment.height);
    top = Math.max(top, height);
    // The facade already supplies the full wall surface. Rendering an
    // extrusion underneath it creates coplanar faces and visible z-fighting.
    walls.push(facadeGeometry(segment.polygon, height, segment.bottom));
    const roof = shape(segment.polygon);
    const positions = roof.attributes.position;
    if (segment.roofShape === "round") {
      let longest = 0,
        axis = [1, 0];
      for (let i = 1; i < segment.polygon.length; i++) {
        const a = segment.polygon[i - 1],
          p = segment.polygon[i],
          d = Math.hypot(p[0] - a[0], p[1] - a[1]);
        if (d > longest) {
          longest = d;
          axis = [(p[0] - a[0]) / d, (p[1] - a[1]) / d];
        }
      }
      const across = segment.polygon.map(
          (p) => -axis[1] * p[0] + axis[0] * p[1],
        ),
        min = Math.min(...across),
        max = Math.max(...across);
      for (let i = 0; i < positions.count; i++) {
        const q = -axis[1] * positions.getX(i) + axis[0] * positions.getZ(i);
        positions.setY(
          i,
          Math.sin(((q - min) / (max - min || 1)) * Math.PI) *
            Math.min(4, (max - min) * 0.35),
        );
      }
      roof.computeVertexNormals();
    }
    roof.translate(0, height + 0.18, 0);
    roofGeos.push(roof);
    for (let i = 1; i < segment.polygon.length; i++) {
      const a = segment.polygon[i - 1],
        p = segment.polygon[i],
        len = Math.hypot(p[0] - a[0], p[1] - a[1]);
      if (len < 1) continue;
      const bar = new THREE.BoxGeometry(len, 0.52, 0.32);
      bar.rotateY(-Math.atan2(p[1] - a[1], p[0] - a[0]));
      bar.translate((a[0] + p[0]) / 2, height + 0.2, (a[1] + p[1]) / 2);
      trimGeos.push(bar);
    }
    if (segment.polygon.length > 4 && height > 5) {
      const ps = segment.polygon.slice(0, -1),
        x = ps.reduce((s, p) => s + p[0], 0) / ps.length,
        z = ps.reduce((s, p) => s + p[1], 0) / ps.length;
      hardware.push(
        new THREE.BoxGeometry(3.4, 1.2, 2).translate(x, height + 0.7, z),
      );
      hardware.push(
        new THREE.BoxGeometry(1.5, 0.7, 1.5).translate(
          x + 4,
          height + 0.4,
          z + 2,
        ),
      );
    }
  }
  for (const [geos, material] of [
    [solidGeos, materials.concrete],
    [walls, materials.facades[facadeStyle(b.id)]],
    [roofGeos, materials.roof],
    [trimGeos, materials.trim],
    [hardware, materials.trim],
  ] as [THREE.BufferGeometry[], THREE.Material][]) {
    const geo = merge(geos);
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, material);
    mesh.userData.building = b.id;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    group.add(mesh);
    geos.forEach((g) => g.dispose());
  }
  // Signature QNC graphene lattice on the longest public-facing facade.
  if (b.id === "QNC") {
    const segments = b.polygon
      .slice(1)
      .map((p, i) => ({
        a: b.polygon[i],
        b: p,
        len: Math.hypot(p[0] - b.polygon[i][0], p[1] - b.polygon[i][1]),
      }))
      .sort((a, b) => b.len - a.len);
    const face = segments[0];
    if (face) {
      const dx = (face.b[0] - face.a[0]) / face.len,
        dz = (face.b[1] - face.a[1]) / face.len,
        lines: number[] = [];
      for (let u = 3; u < face.len - 3; u += 5.6)
        for (let y = 4; y < top - 2; y += 4.8) {
          for (let k = 0; k < 6; k++) {
            const a = (k * Math.PI) / 3,
              bb = ((k + 1) * Math.PI) / 3;
            const ua = u + 2.8 * Math.cos(a),
              ub = u + 2.8 * Math.cos(bb);
            lines.push(
              face.a[0] + dx * ua - dz * 0.13,
              y + 2.8 * Math.sin(a),
              face.a[1] + dz * ua + dx * 0.13,
              face.a[0] + dx * ub - dz * 0.13,
              y + 2.8 * Math.sin(bb),
              face.a[1] + dz * ub + dx * 0.13,
            );
          }
        }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(lines, 3),
      );
      group.add(
        new THREE.LineSegments(
          geometry,
          new THREE.LineBasicMaterial({ color: "#d8dbcf" }),
        ),
      );
    }
  }
  group.userData.height = top;
  return group;
}
