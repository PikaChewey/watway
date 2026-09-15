import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  segments,
  doors,
  surfacesAt,
  samplePhysical,
  type PhysicalSegment,
} from "./physicalModel";
import type { Point } from "../types";
function quad(a: Point, b: Point, c: Point, d: Point) {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3),
  );
  g.computeVertexNormals();
  return g;
}
export function createPhysicalScene() {
  const group = new THREE.Group(),
    shell = new THREE.Group(),
    signs = new THREE.Group(),
    tunnelOverview = new THREE.Group();
  group.add(shell, signs, tunnelOverview);
  const buckets = new Map<string, THREE.BufferGeometry[]>();
  const add = (key: string, g: THREE.BufferGeometry) => {
    g.deleteAttribute("uv");
    const list = buckets.get(key) || [];
    list.push(g);
    buckets.set(key, list);
  };
  for (const s of segments) {
    if (s.building === "DC" && s.floor === 1 && s.kind === "corridor") continue;
    const dx = s.b[0] - s.a[0],
      dz = s.b[2] - s.a[2],
      len = Math.hypot(dx, dz);
    if (len < 0.01) continue;
    const nx = ((-dz / len) * s.width) / 2,
      nz = ((dx / len) * s.width) / 2;
    const point = (t: number, side: number, up = 0): Point => [
      s.a[0] + dx * t + nx * side,
      s.a[1] + (s.b[1] - s.a[1]) * t + up,
      s.a[2] + dz * t + nz * side,
    ];
    const key = `${s.building}:${s.floor}:${s.kind === "tunnel" ? "tunnel" : "interior"}`;
    if (s.kind === "stairs") {
      for (let i = 0; i < (s.steps || 12); i++) {
        const n = s.steps || 12,
          t = (i + 0.5) / n,
          p = point(t, 0),
          height = s.a[1] + ((s.b[1] - s.a[1]) * (i + 1)) / n;
        const g = new THREE.BoxGeometry(len / n + 0.01, 0.16, s.width);
        g.rotateY(-Math.atan2(dz, dx));
        g.translate(p[0], height - 0.085, p[2]);
        add(key + ":floor", g);
      }
      for (const side of [-1, 1]) {
        const a = point(0, side, 1),
          b = point(1, side, 1),
          va = new THREE.Vector3(...a),
          vb = new THREE.Vector3(...b),
          g = new THREE.CylinderGeometry(0.035, 0.035, va.distanceTo(vb), 6);
        g.applyQuaternion(
          new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            vb.clone().sub(va).normalize(),
          ),
        );
        g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
        add(key + ":rail", g);
      }
    } else {
      add(
        key + ":floor",
        quad(
          point(0, -1, -0.035),
          point(1, -1, -0.035),
          point(1, 1, -0.035),
          point(0, 1, -0.035),
        ),
      );
      if (!["landing", "entrance"].includes(s.kind))
        add(
          key + ":ceiling",
          quad(
            point(0, -1, 2.9),
            point(1, -1, 2.9),
            point(1, 1, 2.9),
            point(0, 1, 2.9),
          ),
        );
    }
    if (["corridor", "tunnel", "bridge", "door", "entrance"].includes(s.kind)) {
      const divisions = Math.max(1, Math.ceil(len / 0.55));
      for (const side of [-1, 1])
        for (let i = 0; i < divisions; i++) {
          const t = (i + 0.5) / divisions,
            p = point(t, side);
          const junction = samplePhysical(p[0], p[2], p[1], -0.12, s.id);
          if (junction) continue;
          add(
            key + ":wall",
            quad(
              point(i / divisions, side),
              point((i + 1) / divisions, side),
              point((i + 1) / divisions, side, 2.9),
              point(i / divisions, side, 2.9),
            ),
          );
        }
    }
    if (["corridor", "tunnel", "bridge"].includes(s.kind)) {
      for (let d = 2; d < len; d += 7) {
        const p = point(d / len, 0, 2.86),
          g = new THREE.BoxGeometry(0.18, 0.035, 1.3);
        g.rotateY(-Math.atan2(dz, dx));
        g.translate(...p);
        add(key + ":light", g);
      }
    }
    if (s.kind === "tunnel") {
      const curve = new THREE.LineCurve3(
        new THREE.Vector3(...s.a),
        new THREE.Vector3(...s.b),
      );
      const mesh = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 1, 0.8, 6, false),
        new THREE.MeshBasicMaterial({ color: "#79d8cb" }),
      );
      tunnelOverview.add(mesh);
    }
  }
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 512;
  textureCanvas.height = 256;
  const paint = textureCanvas.getContext("2d")!;
  paint.fillStyle = "#d5b666";
  paint.fillRect(0, 0, 512, 256);
  paint.fillStyle = "#a96f39";
  paint.beginPath();
  paint.moveTo(0, 0);
  paint.lineTo(220, 0);
  paint.lineTo(512, 256);
  paint.lineTo(290, 256);
  paint.closePath();
  paint.fill();
  for (let i = 0; i < 2000; i++) {
    paint.fillStyle = i % 2 ? "#584b3320" : "#fff5c714";
    paint.fillRect((i * 71) % 512, (i * 43) % 256, 1 + (i % 4), 1 + (i % 3));
  }
  const artsTexture = new THREE.CanvasTexture(textureCanvas);
  artsTexture.wrapS = artsTexture.wrapT = THREE.RepeatWrapping;
  artsTexture.colorSpace = THREE.SRGBColorSpace;
  artsTexture.anisotropy = 4;
  const materials = {
    floor: new THREE.MeshStandardMaterial({
      color: "#b0b5aa",
      roughness: 0.88,
      side: THREE.DoubleSide,
    }),
    wall: new THREE.MeshBasicMaterial({
      color: "#cbd0c5",
      side: THREE.DoubleSide,
    }),
    ceiling: new THREE.MeshBasicMaterial({
      color: "#c8cfc6",
      side: THREE.DoubleSide,
    }),
    rail: new THREE.MeshStandardMaterial({
      color: "#6f817c",
      roughness: 0.4,
      metalness: 0.3,
    }),
    light: new THREE.MeshBasicMaterial({ color: "#fff7d9" }),
  };
  for (const [key, geos] of buckets) {
    const kind = key.split(":").at(-1)! as keyof typeof materials;
    const geometry = mergeGeometries(
      geos.map((g) => (g.index ? g.toNonIndexed() : g)),
      false,
    );
    if (!geometry) continue;
    const material = materials[kind].clone();
    if (
      key.includes(":tunnel:") &&
      ["AL", "ML", "TC", "SCH"].includes(key.split(":")[0]) &&
      ["floor", "wall", "ceiling"].includes(kind)
    ) {
      const pos = geometry.attributes.position,
        uv = [];
      for (let i = 0; i < pos.count; i++)
        uv.push(
          (pos.getX(i) + pos.getZ(i)) * 0.07,
          kind === "wall" ? pos.getY(i) * 0.25 : pos.getZ(i) * 0.07,
        );
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      material.map = artsTexture;
      material.color.set("#ffffff");
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = {
      building: key.split(":")[0],
      floor: Number(key.split(":")[1]),
      part: kind,
      tunnel: key.includes(":tunnel:"),
    };
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    shell.add(mesh);
    geos.forEach((g) => g.dispose());
  }
  const doorMeshes = new Map<string, THREE.Group>();
  for (const d of doors) {
    const g = new THREE.Group();
    g.position.set(...d.point);
    const angle = Math.atan2(d.direction[0], d.direction[2]);
    g.rotation.y = angle;
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(1.25, 2.25, 0.09),
      new THREE.MeshStandardMaterial({ color: "#516c69", roughness: 0.65 }),
    );
    panel.position.y = 1.125;
    g.add(panel);
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(1.48, 2.45, 0.12),
      new THREE.MeshBasicMaterial({ color: "#e4e6d7" }),
    );
    trim.position.set(0, 1.2, 0.07);
    g.add(trim);
    panel.position.z = 0.15;
    const label = document.createElement("canvas");
    label.width = 256;
    label.height = 96;
    const c = label.getContext("2d")!;
    c.fillStyle = "#203d45";
    c.fillRect(0, 0, 256, 96);
    c.fillStyle = "#f3e6ba";
    c.font = "600 35px system-ui";
    c.textAlign = "center";
    c.fillText(d.label, 128, 59);
    const texture = new THREE.CanvasTexture(label),
      sign = new THREE.Mesh(
        new THREE.PlaneGeometry(1.4, 0.52),
        new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }),
      );
    sign.position.set(0, 2.75, 0.12);
    g.add(sign);
    signs.add(g);
    doorMeshes.set(d.id, g);
  }
  return {
    group,
    update: (
      building: string | null,
      floor: number,
      walking: boolean,
      tunnelsOnly: boolean,
      destination?: string,
    ) => {
      tunnelOverview.visible = tunnelsOnly;
      shell.children.forEach((obj: any) => {
        if (tunnelsOnly) {
          obj.visible = obj.userData.tunnel && obj.userData.part === "floor";
          obj.material.transparent = true;
          obj.material.opacity = 0.25;
          obj.material.depthWrite = false;
          return;
        }
        obj.visible =
          !walking || obj.userData.building === building || obj.userData.tunnel;
        if (walking) {
          obj.visible =
            obj.visible &&
            (obj.userData.part === "ceiling" || obj.userData.part === "wall"
              ? Math.abs(obj.userData.floor - floor) < 1.1
              : Math.abs(obj.userData.floor - floor) < 2);
          obj.material.transparent = false;
          obj.material.opacity = 1;
        } else {
          obj.material.transparent =
            obj.userData.part === "ceiling" || obj.userData.part === "wall";
          obj.material.opacity =
            obj.userData.part === "ceiling"
              ? 0.06
              : obj.userData.part === "wall"
                ? 0.28
                : 1;
        }
      });
      signs.visible = !tunnelsOnly;
      doorMeshes.forEach((g, id) => {
        const panel = g.children[0] as THREE.Mesh;
        const material = panel.material as THREE.MeshStandardMaterial;
        material.emissive.set(id === destination ? "#76bda2" : "#000000");
        material.emissiveIntensity = id === destination ? 0.6 : 0;
      });
    },
    dispose: () => {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => m.dispose());
        }
      });
    },
  };
}
