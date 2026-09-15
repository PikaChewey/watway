import * as THREE from "three";
import { project } from "../data/campus";
export type VisualMode = "realistic" | "satellite" | "terrain";
const lon = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const lat = (y: number, z: number) =>
  (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;
export function createBasemaps(onStatus: (status: string) => void) {
  const group = new THREE.Group(),
    satellite = new THREE.Group(),
    terrain = new THREE.Group();
  group.add(satellite, terrain);
  terrain.visible = false;
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin("anonymous");
  let stopped = false;
  let loaded = 0,
    failed = 0;
  const textures: THREE.Texture[] = [];
  const z = 17,
    minX = Math.floor(((-80.567 + 180) / 360) * 2 ** z),
    maxX = Math.floor(((-80.53 + 180) / 360) * 2 ** z);
  const yFor = (la: number) =>
    Math.floor(
      ((1 - Math.asinh(Math.tan((la * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z,
    );
  const minY = yFor(43.478),
    maxY = yFor(43.465);
  const jobs: { x: number; y: number; parent: THREE.Group; service: string }[] =
    [];
  for (let x = minX; x <= maxX; x++)
    for (let y = minY; y <= maxY; y++)
      jobs.push({ x, y, parent: satellite, service: "World_Imagery" });
  jobs.sort(
    (a, b) =>
      Math.hypot(a.x - (minX + maxX) / 2, a.y - (minY + maxY) / 2) -
      Math.hypot(b.x - (minX + maxX) / 2, b.y - (minY + maxY) / 2),
  );
  const createTile = async (job: (typeof jobs)[number]) => {
    const { x, y, parent, service } = job;
    const nw = project(lat(y, z), lon(x, z)),
      se = project(lat(y + 1, z), lon(x + 1, z));
    try {
      const texture = await loader.loadAsync(
        `https://server.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/tile/${z}/${y}/${x}`,
      );
      if (stopped) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      textures.push(texture);
      const material = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.97,
        color: "#ffffff",
      });
      const tile = new THREE.Mesh(
        new THREE.PlaneGeometry(se[0] - nw[0], se[2] - nw[2]),
        material,
      );
      tile.rotation.x = -Math.PI / 2;
      tile.position.set((nw[0] + se[0]) / 2, -0.09, (nw[2] + se[2]) / 2);
      tile.receiveShadow = true;
      parent.add(tile);
      loaded++;
      onStatus(loaded > 8 ? "Imagery ready" : "Loading imagery…");
    } catch {
      failed++;
      if (loaded === 0 && failed > 5)
        onStatus("Imagery unavailable · 3D map ready");
    }
  };
  let index = 0;
  const run = async () => {
    while (index < jobs.length && !stopped) {
      const job = jobs[index++];
      await createTile(job);
    }
  };
  let imageryStarted = false;
  let terrainStarted = false;
  return {
    group,
    satellite,
    terrain,
    setMode: (mode: VisualMode) => {
      group.visible = mode !== "realistic";
      if (mode !== "realistic" && !imageryStarted) {
        imageryStarted = true;
        for (let i = 0; i < 6; i++) void run();
      }
      satellite.visible = mode !== "terrain";
      terrain.visible = mode === "terrain";
      if (mode === "terrain" && !terrainStarted) {
        terrainStarted = true;
        for (let x = minX; x <= maxX; x++)
          for (let y = minY; y <= maxY; y++)
            jobs.push({ x, y, parent: terrain, service: "World_Topo_Map" });
        for (let i = 0; i < 4; i++) void run();
      }
    },
    setNight: (night: boolean) => {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.material.color.set(night ? "#647b8c" : "#ffffff");
          o.material.emissive.set(night ? "#152735" : "#000000");
          o.material.emissiveIntensity = night ? 0.22 : 0;
        }
      });
    },
    dispose: () => {
      stopped = true;
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          o.material.dispose();
        }
      });
      textures.forEach((t) => t.dispose());
    },
  };
}
