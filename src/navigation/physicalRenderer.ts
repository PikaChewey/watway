import { buildStairGeometry } from "../visual/stairGeometry";
import { createInteriorTextures } from "../visual/interiorTextures";
import pitchRoute from "../data/tunnel-pitch-route.json";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  segments,
  doors,
  surfacesAt,
  samplePhysical,
  type PhysicalSegment,
  stairShafts,
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
  const pitchSurfaces=new Set(pitchRoute.edges.map(e=>e.surfaceId).filter(Boolean));
  const stairSegments = segments.filter(s => s.kind === "stairs");
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
    const key = `${s.building}:${s.floor}:${s.kind === "tunnel" ? "tunnel" : ["stairs","landing"].includes(s.kind) ? "stairs" : "interior"}`;
    if (s.kind === "stairs") {
      const stair=buildStairGeometry(s);
      stair.treads.forEach(g=>add(key+":tread",g));
      stair.risers.forEach(g=>add(key+":riser",g));
      stair.nosings.forEach(g=>add(key+":nosing",g));
      stair.body.forEach(g=>add(key+":stairBody",g));
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
        for(let d=.15;d<len;d+=1.35){
          const t=d/len,base=point(t,side*.96);
          const treadHeight=s.a[1]+(s.b[1]-s.a[1])*Math.ceil(t*(s.steps||12))/(s.steps||12);
          const top=base[1]+1,postHeight=Math.max(.65,top-treadHeight);
          const post=new THREE.CylinderGeometry(.024,.024,postHeight,8);
          post.translate(base[0],treadHeight+postHeight/2,base[2]);add(key+":rail",post);
        }
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
      if (!["landing", "entrance"].includes(s.kind)) {
        const pieces = Math.max(1, Math.ceil(len / 0.6));
        for (let i = 0; i < pieces; i++) {
          const mid = point((i + 0.5) / pieces, 0, 2.9);
          const shaftOpening = stairSegments.some(w => {
            if(w.building !== s.building || Math.abs(w.floor-s.floor)>1) return false;
            const dx=w.b[0]-w.a[0], dz=w.b[2]-w.a[2], den=dx*dx+dz*dz;
            const t=Math.max(0,Math.min(1,((mid[0]-w.a[0])*dx+(mid[2]-w.a[2])*dz)/(den||1)));
            return Math.hypot(mid[0]-w.a[0]-t*dx,mid[2]-w.a[2]-t*dz)<w.width/2+.25;
          });
          if (shaftOpening) continue;
          add(
            key + ":ceiling",
            quad(
              point(i / pieces, -1, 2.9),
              point((i + 1) / pieces, -1, 2.9),
              point((i + 1) / pieces, 1, 2.9),
              point(i / pieces, 1, 2.9),
            ),
          );
        }
      }
    }
    if (["corridor", "tunnel", "bridge", "door", "entrance", "stairs", "landing"].includes(s.kind)) {
      const divisions = Math.max(1, Math.ceil(len / 0.55));
      for (const side of [-1, 1])
        for (let i = 0; i < divisions; i++) {
          const t = (i + 0.5) / divisions,
            p = point(t, side);
          // Test beyond the wall, not on its boundary: duplicated parallel
          // corridor segments must not erase each other's enclosing walls.
          const junction = samplePhysical(p[0] + nx / (s.width/2) * side * .2, p[2] + nz / (s.width/2) * side * .2, p[1], .02, s.id);
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
    if (["corridor","tunnel","bridge","landing"].includes(s.kind)) {
      // Close dead ends while leaving actual connecting passages open.
      const pieces=Math.max(2,Math.ceil(s.width/.45));
      for(const end of [0,1]) for(let i=0;i<pieces;i++) {
        const a=-1+2*i/pieces,b=-1+2*(i+1)/pieces;
        const p=point(end,(a+b)/2), sign=end===0?-1:1;
        if(samplePhysical(p[0]+dx/len*.2*sign,p[2]+dz/len*.2*sign,p[1],.02,s.id))continue;
        add(key+":wall",quad(point(end,a),point(end,b),point(end,b,2.9),point(end,a,2.9)));
      }
    }
    if (["stairs","landing"].includes(s.kind))
      add(key+":ceiling",quad(point(0,-1,2.9),point(1,-1,2.9),point(1,1,2.9),point(0,1,2.9)));
    if (["corridor", "tunnel", "bridge"].includes(s.kind)) {
      for (let d = 2; d < len; d += 7) {
        const p = point(d / len, 0, 2.86),
          g = new THREE.BoxGeometry(0.18, 0.035, 1.3);
        g.rotateY(-Math.atan2(dz, dx));
        g.translate(...p);
        add(key + ":light", g);
      }
    }
    if (s.kind === "tunnel" || pitchSurfaces.has(s.id)) {
      const featured=pitchSurfaces.has(s.id);
      const wires:number[]=[],frames:number[]=[];
      const cage=(t:number,side:number,height:number)=>point(t,side*2,height);
      const wire=(list:number[],a:Point,b:Point)=>list.push(...a,...b);
      const count=Math.max(1,Math.ceil(len/3));
      for(let i=0;i<count;i++){
        const a=i/count,b=(i+1)/count;
        for(const side of [-1,1]){
          for(const height of [0,3.1,6.2])wire(wires,cage(a,side,height),cage(b,side,height));
          wire(wires,cage(a,side,0),cage(b,side,6.2));
          wire(wires,cage(a,side,6.2),cage(b,side,0));
          wire(frames,cage(a,side,0),cage(a,side,6.2));
        }
        for(const height of [0,6.2]){
          wire(wires,cage(a,-1,height),cage(b,1,height));
          wire(wires,cage(a,1,height),cage(b,-1,height));
          wire(frames,cage(a,-1,height),cage(a,1,height));
        }
      }
      for(const side of [-1,1])wire(frames,cage(1,side,0),cage(1,side,6.2));
      for(const height of [0,6.2])wire(frames,cage(1,-1,height),cage(1,1,height));
      for(const [coords,opacity,color] of [[wires,featured?.24:.12,featured?"#4dd9ed":"#4283b9"],[frames,featured?.7:.32,featured?"#9bf8ec":"#5b9eb9"]] as [number[],number,string][]){
        const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.Float32BufferAttribute(coords,3));
        tunnelOverview.add(new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending})));
      }
      if(featured){
        const curve=new THREE.LineCurve3(new THREE.Vector3(...point(0,0,3.1)),new THREE.Vector3(...point(1,0,3.1)));
        tunnelOverview.add(new THREE.Mesh(new THREE.TubeGeometry(curve,1,.12,6,false),new THREE.MeshBasicMaterial({color:"#ffd782"})));
        tunnelOverview.add(new THREE.Mesh(new THREE.TubeGeometry(curve,1,.55,8,false),new THREE.MeshBasicMaterial({color:"#ffa940",transparent:true,opacity:.12,depthWrite:false,blending:THREE.AdditiveBlending})));
        for(let d=5;d<len;d+=12){
          const node=new THREE.Mesh(new THREE.OctahedronGeometry(.7),new THREE.MeshBasicMaterial({color:"#ffdc8f",wireframe:true}));
          node.position.set(...point(d/len,0,3.1));tunnelOverview.add(node);
        }
      }

    }
  }
  const grid = new THREE.GridHelper(1200, 120, "#284c68", "#132a3b");
  grid.position.set(150, -8, 130);
  (grid.material as THREE.LineBasicMaterial).transparent = true;
  (grid.material as THREE.LineBasicMaterial).opacity = 0.4;
  tunnelOverview.add(grid);
  for (const [i, node] of [
    pitchRoute.nodes[0],
    pitchRoute.nodes[pitchRoute.nodes.length - 1],
  ].entries()) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3, 4.4, 32),
      new THREE.MeshBasicMaterial({
        color: i ? "#eac784" : "#a5ddd0",
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(node.point[0], node.point[1] + 0.15, node.point[2]);
    tunnelOverview.add(ring);
  }
  // A closed outer envelope backs incomplete reconstructed corridor joins.
  // It stays outside the walkable network and is shown only from inside.
  const interiors=new Map<string,PhysicalSegment[]>();
  for(const segment of segments){if(segment.kind === "tunnel" || segment.kind === "bridge")continue;const list=interiors.get(segment.building)||[];list.push(segment);interiors.set(segment.building,list);}
  for(const [building,list] of interiors){
    const minX=Math.min(...list.flatMap(s=>[s.a[0]-s.width/2,s.b[0]-s.width/2]))-1;
    const maxX=Math.max(...list.flatMap(s=>[s.a[0]+s.width/2,s.b[0]+s.width/2]))+1;
    const minZ=Math.min(...list.flatMap(s=>[s.a[2]-s.width/2,s.b[2]-s.width/2]))-1;
    const maxZ=Math.max(...list.flatMap(s=>[s.a[2]+s.width/2,s.b[2]+s.width/2]))+1;
    const bottom=Math.min(...list.flatMap(s=>[s.a[1],s.b[1]]))-.1;
    const top=Math.max(...list.flatMap(s=>[s.a[1],s.b[1]]))+3.3;
    const corners:Point[]=[[minX,bottom,minZ],[maxX,bottom,minZ],[maxX,bottom,maxZ],[minX,bottom,maxZ]];
    const key=`${building}:1:backdrop`;
    for(let i=0;i<4;i++){const a=corners[i],b=corners[(i+1)%4];add(key+":wall",quad(a,b,[b[0],top,b[2]],[a[0],top,a[2]]));}
    add(key+":ceiling",quad(...corners.map(p=>[p[0],top,p[2]] as Point) as [Point,Point,Point,Point]));
    add(key+":floor",quad(...corners as [Point,Point,Point,Point]));
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
  const interiorTextures = createInteriorTextures();
  const materials = {
    tread: new THREE.MeshBasicMaterial({color:"#ffffff",map:interiorTextures.stair,side:THREE.DoubleSide}),
    riser: new THREE.MeshBasicMaterial({color:"#858c85",side:THREE.DoubleSide}),
    nosing: new THREE.MeshBasicMaterial({color:"#354a40",side:THREE.DoubleSide}),
    stairBody: new THREE.MeshBasicMaterial({color:"#777e77",side:THREE.DoubleSide}),
    floor: new THREE.MeshBasicMaterial({
      color: "#ffffff",
      map: interiorTextures.floor,
      side: THREE.DoubleSide,
    }),
    wall: new THREE.MeshBasicMaterial({
      color: "#ffffff",
      map: interiorTextures.wall,
      side: THREE.DoubleSide,
    }),
    ceiling: new THREE.MeshBasicMaterial({
      color: "#ffffff",
      map: interiorTextures.ceiling,
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
    if (["floor", "wall", "ceiling", "tread"].includes(kind)) {
      const pos=geometry.attributes.position, normals=geometry.attributes.normal;
      const uv:number[]=[];
      const baseY=(Number(key.split(":")[1])-1)*3.8+.5;
      for(let i=0;i<pos.count;i++) {
        if(kind === "wall") {
          const along=Math.abs(normals.getX(i))>Math.abs(normals.getZ(i))?pos.getZ(i):pos.getX(i);
          uv.push(along/3.2,(pos.getY(i)-baseY)/2.9);
        } else if(kind === "floor" && Math.abs(normals.getY(i))<.5) {
          uv.push((Math.abs(normals.getX(i))>.5?pos.getZ(i):pos.getX(i))/2.4,pos.getY(i)/2.4);
        } else uv.push(pos.getX(i)/2.4,pos.getZ(i)/2.4);
      }
      geometry.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
      if(kind === "wall" && key.includes(":tunnel:") && ["AL","ML","TC","SCH"].includes(key.split(":")[0])) material.map=artsTexture;
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = {
      building: key.split(":")[0],
      floor: Number(key.split(":")[1]),
      part: kind,
      tunnel: key.includes(":tunnel:"),
      stairs: key.includes(":stairs:"),
      backdrop: key.includes(":backdrop:"),
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
      new THREE.MeshStandardMaterial({ color: "#ffffff", map: interiorTextures.door, roughness: 0.8 }),
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
      contextKind?: string,
    ) => {
      tunnelOverview.visible = tunnelsOnly;
      shell.children.forEach((obj: any) => {
        if (tunnelsOnly) {
          obj.visible = false;
          obj.material.transparent = true;
          obj.material.opacity = 0.25;
          obj.material.depthWrite = false;
          return;
        }
        if(obj.userData.backdrop){obj.visible=walking && obj.userData.building===building && !["tunnel","bridge","entrance"].includes(contextKind || "");obj.material.transparent=false;obj.material.opacity=1;obj.material.depthWrite=true;return;}
        obj.visible =
          !walking || obj.userData.building === building || obj.userData.tunnel;
        if (walking) {
          obj.visible =
            obj.visible &&
            (obj.userData.tunnel || (obj.userData.stairs
              ? Math.abs(obj.userData.floor - floor) <= 1
              : obj.userData.floor === floor));
          obj.material.transparent = false;
          obj.material.opacity = 1;
          obj.material.depthWrite = true;
        } else {
          obj.material.transparent =
            obj.userData.part === "ceiling" || obj.userData.part === "wall";
          obj.material.depthWrite =
            obj.userData.part !== "ceiling" && obj.userData.part !== "wall";
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
