import * as THREE from 'three';
import type { PhysicalSegment } from '../navigation/physicalModel';

/** Solid stair sides/soffit with separate horizontal treads and vertical risers. */
export function buildStairGeometry(s: PhysicalSegment) {
  const dx=s.b[0]-s.a[0],dz=s.b[2]-s.a[2],length=Math.hypot(dx,dz);
  const count=s.steps||12,run=length/count,rise=(s.b[1]-s.a[1])/count;
  const yaw=-Math.atan2(dz,dx),half=s.width/2;
  const transform=(g:THREE.BufferGeometry)=>{g.rotateY(yaw);g.translate(s.a[0],s.a[1],s.a[2]);return g;};
  const face=(a:number[],b:number[],c:number[],d:number[])=>{
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([...a,...b,...c,...a,...c,...d],3));g.computeVertexNormals();return transform(g);
  };
  const treads:THREE.BufferGeometry[]=[],risers:THREE.BufferGeometry[]=[],nosings:THREE.BufferGeometry[]=[];
  for(let i=0;i<count;i++){
    const x=i*run,h=(i+1)*rise,previous=i*rise;
    treads.push(face([x,h,-half],[x+run,h,-half],[x+run,h,half],[x,h,half]));
    risers.push(face([x,previous,-half],[x,h,-half],[x,h,half],[x,previous,half]));
    // Inset edge band is a real horizontal strip, not a striped wall texture.
    nosings.push(face([x+.012,h+.006,-half+.04],[x+.057,h+.006,-half+.04],[x+.057,h+.006,half-.04],[x+.012,h+.006,half-.04]));
  }
  const shape=new THREE.Shape();
  shape.moveTo(0,-.28);shape.lineTo(length,count*rise-.28);shape.lineTo(length,count*rise);
  for(let i=count-1;i>=0;i--){shape.lineTo(i*run,(i+1)*rise);if(i>0)shape.lineTo(i*run,i*rise);}
  shape.lineTo(0,-.28);shape.closePath();
  const left=new THREE.ShapeGeometry(shape);left.translate(0,0,-half);
  const right=new THREE.ShapeGeometry(shape);right.translate(0,0,half);
  const body=[transform(left),transform(right),face([0,-.28,-half],[length,count*rise-.28,-half],[length,count*rise-.28,half],[0,-.28,half])];
  return {treads,risers,nosings,body,count,run,rise};
}
