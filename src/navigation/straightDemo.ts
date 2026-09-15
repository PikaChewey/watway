import * as THREE from 'three';
import { buildStairGeometry } from '../visual/stairGeometry';
export const STRAIGHT={hall:18,steps:24,run:.28,rise:3.8,width:3.2,upperHall:18};
export const stairEnd=STRAIGHT.hall+STRAIGHT.steps*STRAIGHT.run;
export const straightEnd=stairEnd+STRAIGHT.upperHall;
export function straightHeight(distance:number){
 if(distance<=STRAIGHT.hall)return 0;
 if(distance>=stairEnd)return STRAIGHT.rise;
 return Math.ceil((distance-STRAIGHT.hall)/STRAIGHT.run-1e-8)*STRAIGHT.rise/STRAIGHT.steps;
}
export function moveStraight(x:number,distance:number,side:number,forward:number){
 const d=Math.max(.5,Math.min(straightEnd-.5,distance+forward));
 return {x:Math.max(-STRAIGHT.width/2+.22,Math.min(STRAIGHT.width/2-.22,x+side)),distance:d,height:straightHeight(d),progress:(d-.5)/(straightEnd-1)};
}
export function createStraightScene(){
 const group=new THREE.Group();group.visible=false;
 const wall=new THREE.MeshBasicMaterial({color:'#d9dbd5',side:THREE.DoubleSide});
 const floor=new THREE.MeshBasicMaterial({color:'#afb6b0',side:THREE.DoubleSide});
 const ceiling=new THREE.MeshBasicMaterial({color:'#e9ebe5',side:THREE.DoubleSide});
 const riser=new THREE.MeshBasicMaterial({color:'#77857c',side:THREE.DoubleSide});
 const edge=new THREE.MeshBasicMaterial({color:'#435d4d',side:THREE.DoubleSide});
 const add=(g:THREE.BufferGeometry,m:THREE.Material)=>group.add(new THREE.Mesh(g,m));
 const quad=(a:number[],b:number[],c:number[],d:number[],m:THREE.Material)=>{
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([...a,...b,...c,...a,...c,...d],3));g.computeVertexNormals();add(g,m);
 };
 const half=STRAIGHT.width/2,h=3.1;
 for(const [start,end,y1,y2] of [[0,STRAIGHT.hall,0,0],[STRAIGHT.hall,stairEnd,0,STRAIGHT.rise],[stairEnd,straightEnd,STRAIGHT.rise,STRAIGHT.rise]]){
  for(const x of [-half,half])quad([x,y1,-start],[x,y2,-end],[x,y2+h,-end],[x,y1+h,-start],wall);
  quad([-half,y1+h,-start],[half,y1+h,-start],[half,y2+h,-end],[-half,y2+h,-end],ceiling);
  if(y1===y2)quad([-half,y1,-start],[half,y1,-start],[half,y2,-end],[-half,y2,-end],floor);
 }
 const stairs=buildStairGeometry({id:'straight-demo',a:[0,0,-STRAIGHT.hall],b:[0,STRAIGHT.rise,-stairEnd],width:STRAIGHT.width,steps:STRAIGHT.steps,kind:'stairs',building:'DEMO',floor:1,estimated:true,label:'Simple demonstration staircase'});
 stairs.treads.forEach(g=>add(g,floor));stairs.risers.forEach(g=>add(g,riser));stairs.nosings.forEach(g=>add(g,edge));stairs.body.forEach(g=>g.dispose());
 quad([-half,0,0],[half,0,0],[half,h,0],[-half,h,0],wall);
 quad([-half,STRAIGHT.rise,-straightEnd],[half,STRAIGHT.rise,-straightEnd],[half,STRAIGHT.rise+h,-straightEnd],[-half,STRAIGHT.rise+h,-straightEnd],wall);
 const door=new THREE.BoxGeometry(1.2,2.3,.05);door.translate(0,STRAIGHT.rise+1.15,-straightEnd+.035);add(door,edge);
 return group;
}
