import * as THREE from "three";
export type FacadeStyle = "concrete" | "brick" | "glass" | "davis" | "stone";
let seed = 518;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
function canvasTexture(canvas: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
export function makeSurface(kind: "roof" | "concrete" | "asphalt" | "grass") {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  const base =
    kind === "roof"
      ? [96, 103, 102]
      : kind === "asphalt"
        ? [76, 83, 83]
        : kind === "grass"
          ? [83, 107, 55]
          : [178, 176, 164];
  const image = ctx.createImageData(256, 256);
  for (let i = 0; i < image.data.length; i += 4) {
    const noise = (rand() - 0.5) * (kind === "roof" ? 48 : 28);
    for (let k = 0; k < 3; k++) image.data[i + k] = base[k] + noise;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  if (kind === "concrete") {
    ctx.strokeStyle = "#aaa89d";
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, 256, 256);
  }
  const t = canvasTexture(c);
  t.repeat.set(
    kind === "roof" ? 0.5 : kind === "grass" ? 0.18 : 0.25,
    kind === "roof" ? 0.5 : kind === "grass" ? 0.18 : 0.25,
  );
  return t;
}
export function makeFacade(style: FacadeStyle) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  const glow = document.createElement("canvas");
  glow.width = glow.height = 256;
  const ec = glow.getContext("2d")!;
  ec.fillStyle = "#000";
  ec.fillRect(0, 0, 256, 256);
  const base =
    style === "brick"
      ? "#967158"
      : style === "glass"
        ? "#49717a"
        : style === "davis"
          ? "#73958e"
          : style === "stone"
            ? "#b4ae96"
            : "#a5a597";
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  if (style === "brick") {
    for (let y = 0; y < 256; y += 12) {
      ctx.fillStyle = "#6e6b5d";
      ctx.fillRect(0, y, 256, 1);
      for (let x = ((y / 12) % 2) * -18; x < 256; x += 36) {
        ctx.fillStyle = `rgba(45,32,21,${rand() * 0.12})`;
        ctx.fillRect(x + 1, y + 1, 34, 10);
        ctx.fillStyle = "#827764";
        ctx.fillRect(x, y, 1, 12);
      }
    }
  } else {
    for (let i = 0; i < 4000; i++) {
      ctx.fillStyle = rand() > 0.5 ? "#ffffff08" : "#00000009";
      ctx.fillRect(rand() * 256, rand() * 256, 1, 2);
    }
  }
  const glass = style === "glass" || style === "davis";
  const x = glass ? 3 : style === "concrete" ? 38 : 27,
    y = glass ? 6 : 44,
    w = glass ? 250 : style === "concrete" ? 180 : 202,
    h = glass ? 230 : 150;
  ctx.fillStyle = "#303e3c";
  ctx.fillRect(x - 5, y - 5, w + 10, h + 10);
  const gradient = ctx.createLinearGradient(0, y, 0, y + h);
  gradient.addColorStop(0, glass ? "#90b4b9" : "#69878b");
  gradient.addColorStop(0.45, glass ? "#5b828a" : "#4b6468");
  gradient.addColorStop(0.52, "#456166");
  gradient.addColorStop(1, "#263f45");
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, w, h);
  for (let i = 0; i < 3; i++) {
    const xx = x + (i * w) / 3;
    ctx.fillStyle = i === 1 ? "#b6c6b533" : "#192b2d28";
    ctx.fillRect(xx + 3, y + 3, w / 3 - 6, h - 6);
    ctx.fillStyle = "#91a6a1";
    ctx.fillRect(xx, y, 2, h);
    ec.fillStyle = i === 1 ? "#e9cd83" : "#4e604b";
    ec.fillRect(xx + 4, y + 4, w / 3 - 8, h - 8);
  }
  ctx.fillStyle = "#89928a";
  ctx.fillRect(x, y + h * 0.57, w, 3);
  ctx.fillStyle =
    style === "davis" ? "#ba5941" : style === "glass" ? "#b4c2bc" : "#beb9a6";
  ctx.fillRect(0, 249, 256, 7);
  if (style === "concrete") {
    ctx.fillStyle = "#c0beb0";
    ctx.fillRect(0, 0, 22, 256);
    ctx.fillRect(233, 0, 23, 256);
    ctx.fillStyle = "#70796d";
    ctx.fillRect(22, 0, 4, 256);
  }
  const map = canvasTexture(c),
    emissiveMap = canvasTexture(glow);
  const material = new THREE.MeshStandardMaterial({
    map,
    color: "#ffffff",
    roughness: glass ? 0.32 : 0.78,
    metalness: glass ? 0.3 : 0.02,
    emissiveMap,
    emissive: "#ffcc78",
    emissiveIntensity: 0,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  return material;
}
export function facadeStyle(id: string): FacadeStyle {
  return ["QNC", "E5", "E6", "PSE", "STC"].includes(id)
    ? "glass"
    : id === "DC"
      ? "davis"
      : [
            "M3",
            "HH",
            "AL",
            "DWE",
            "E2",
            "E3",
            "CPH",
            "EV1",
            "EV2",
            "SCH",
            "ML",
            "TC",
          ].includes(id)
        ? "brick"
        : id === "LIB"
          ? "stone"
          : "concrete";
}
export function facadeGeometry(points: number[][], height: number, bottom = 0) {
  const positions: number[] = [],
    uvs: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.3) continue;
    const u = len / 3.6,
      v = (height - bottom) / 3.8;
    positions.push(
      a[0],
      bottom,
      a[1],
      b[0],
      bottom,
      b[1],
      a[0],
      height,
      a[1],
      a[0],
      height,
      a[1],
      b[0],
      bottom,
      b[1],
      b[0],
      height,
      b[1],
    );
    uvs.push(0, 0, u, 0, 0, v, 0, v, u, 0, u, v);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}
