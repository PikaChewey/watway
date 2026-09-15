import buildingData from './buildings.json';
import mapData from './map.json';
import type {Building,MapFeature,Place,Category,Point} from '../types';
export const buildings=buildingData as unknown as Building[];
export const mapFeatures=mapData as MapFeature[];
export const buildingById=Object.fromEntries(buildings.map(b=>[b.id,b]));
export const CAMPUS={lat:43.47165,lon:-80.5437};
export function project(lat:number,lon:number):Point{return [(lon-CAMPUS.lon)*111320*Math.cos(CAMPUS.lat*Math.PI/180),0,-(lat-CAMPUS.lat)*111320]}
export function unproject(p:Point){return {lat:CAMPUS.lat-p[2]/111320,lon:CAMPUS.lon+p[0]/(111320*Math.cos(CAMPUS.lat*Math.PI/180))}}
export const distance=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
export const sources={buildings:'https://github.com/uwaterloo/Datasets/blob/master/Buildings/Buildings.json',map:'https://www.openstreetmap.org/copyright',accessibility:'https://uwaterloo.ca/accessibility/catalogs/building-accessibility',closure:'https://uwaterloo.ca/news/mathematics/wat-connects-us',library:'https://uwaterloo.ca/lib/study',food:'https://uwaterloo.ca/food-services/locations-and-hours',disruptions:'https://uwaterloo.ca/plant-operations/service-interruptions',weather:'https://open-meteo.com/'};
const catalog:[string,string,number,Category,string[],string,'verified'|'approximate'][]=[
 ['DC','Davis Centre Library',1,'study',['quiet','silent','outlets','wifi','individual','library','computers'],'Quiet and silent study zones in the Davis Centre Library. Seat and outlet availability varies.','verified'],
 ['LIB','Dana Porter · Quiet study',6,'study',['quiet','silent','library','individual','carrels','outlets'],'Individual study carrels on the upper floors. Quiet and silent zones; follow posted signage.','verified'],
 ['LIB','Dana Porter · Group study',3,'study',['group','collaborative','outlets','wifi','library'],'Collaborative study spaces. Bookable rooms require a separate library reservation.','verified'],
 ['SLC','SLC · Study lounge',3,'study',['group','outlets','late','wifi','lounge'],'A place to work between classes. Facilities and occupancy are estimates.','approximate'],
 ['E5','Engineering 5 · Study space',3,'study',['quiet','outlets','bright','engineering','wifi'],'Engineering study areas; exact desk availability and outlet access are not live.','approximate'],
 ['M3','Mathematics 3 · Study space',1,'study',['quiet','outlets','math','wifi'],'A suggested study stop near mathematics classes. Confirm available space on arrival.','approximate'],
 ['QNC','QNC · Atrium',1,'study',['group','bright','wifi','outlets'],'Suggested informal study space in the Quantum-Nano Centre.','approximate'],
 ['STC','STC · Atrium',1,'study',['group','bright','wifi'],'A central meeting point between science classes.','approximate'],
 ['SLC','SLC · Food court',1,'food',['food','lunch','vegetarian','coffee','snack'],'Food options in the Student Life Centre. Check Food Services for current vendors and hours.','verified'],
 ['DC','Davis Centre · Food court',1,'food',['food','lunch','coffee','tim hortons'],'Food court and coffee options on the first floor. Check current opening hours.','verified'],
 ['MC','Math C&D',3,'food',['coffee','donut','snack','cheap','mathsoc'],'MathSoc’s coffee and doughnut shop. Hours follow the student term schedule.','approximate'],
 ['SCH','South Campus Hall · Food',1,'food',['food','lunch','coffee'],'Campus food options. Check current locations and hours before making a detour.','approximate'],
 ['EIT','Earth Sciences Museum',1,'recreation',['museum','fossils','dinosaurs','rocks','free'],'Explore earth science exhibits inside EIT.','verified'],
 ['PAC','PAC · Fitness centre',1,'recreation',['gym','fitness','sport','workout','climbing'],'Campus athletics and recreation. Check membership access and opening hours.','verified'],
 ['HS','Health Services',1,'health',['doctor','health','medical','clinic'],'Campus health services. Appointments and opening hours vary.','verified'],
 ['SLC','SLC · Microwave',1,'microwave',['heat','food','microwave','lunch'],'Suggested microwave stop. Location within the building is approximate.','approximate'],
 ['MC','MC · Printer',3,'printer',['print','printer','watcard','computer'],'Suggested printing location. Confirm device access and availability locally.','approximate'],
 ['DC','Davis Library · Printing',1,'printer',['print','printer','watcard','library'],'Library printing facilities. Equipment availability is not live.','approximate'],
 ['LIB','Dana Porter · Printing',2,'printer',['print','printer','watcard','library'],'Library printing facilities. Exact position is schematic.','approximate'],
];
export const places:Place[]=catalog.filter(x=>buildingById[x[0]]).map((x,i)=>{const b=buildingById[x[0]];return {id:`poi-${i}`,building:b.id,name:x[1],floor:x[2],category:x[3],tags:x[4],description:x[5],confidence:x[6],source:x[3]==='study'?sources.library:x[3]==='food'?sources.food:sources.accessibility,point:[b.center[0]+(i%3-1)*9,(x[2]-1)*3.8+1,b.center[2]+(i%2?8:-8)]}});
for(const [i,code] of ['DC','SLC','MC','LIB','E5','STC','QNC','HH','M3','EIT','PSE','EV3'].entries()){
 const b=buildingById[code];if(!b)continue;
 for(const [cat,name,tags] of [['washroom','Washrooms',['washroom','bathroom','toilet','restroom']],['water','Water refill',['water','fountain','bottle','refill']],['bike','Bike parking',['bike','bicycle','rack']]] as [Category,string,string[]][]){
  places.push({id:`${code}-${cat}`,building:code,name:`${b.id} · ${name}`,floor:1,category:cat,tags,description:cat==='washroom'&&code==='DC'?'Accessible stalls are listed on the northeast, southwest, and northwest sides of the first floor.':'Building-level suggestion. Exact fixture location and availability need local confirmation.',confidence:cat==='washroom'&&code==='DC'?'verified':'approximate',source:sources.accessibility,point:[b.center[0]+(cat==='bike'?23:-12),1,b.center[2]+(cat==='water'?12:0)]});
 }
}
const transit:Place={id:'ion',name:'University of Waterloo · ION',building:'E5',floor:0,category:'transit',point:project(43.47387,-80.54114),tags:['train','ion','lrt','bus','transit','station','grt'],description:'ION light rail and the University of Waterloo bus terminal. Check GRT for live departures.',confidence:'approximate',source:'https://www.grt.ca/'};
places.push(transit);
places.push({id:'parking-c',name:'Parking C',building:'SCH',floor:0,category:'parking',point:project(43.46745,-80.539),tags:['parking','car','visitor','pay'],description:'South campus parking. Check Sustainable Transportation for permits and rates.',confidence:'approximate',source:'https://uwaterloo.ca/sustainable-transportation/'});
const roomCodes:Record<string,string[]>={MC:['2034','2035','2038','2065','2066','4020','4040'],DC:['1350','1351','1358','2568'],E5:['2004','2008','3101'],PSE:['3343','3353','4043'],QNC:['1501','1502','2501'],RCH:['101','103','105','112','207','301'],STC:['1012','0020','0040'],M3:['1006','3103','3127'],HH:['1101','1102','1104'],AL:['113','116','124'],CPH:['1346','3607']};
for(const [code,rooms] of Object.entries(roomCodes)){const b=buildingById[code];if(!b)continue;for(const [i,room]of rooms.entries()){const floor=Math.max(0,Math.min(b.floors,Number(room[0])));places.push({id:`room-${code}-${room}`,name:`${code} ${room}`,building:code,floor,category:'room',point:[b.center[0]+(i%2?14:-14),(floor-1)*3.8+1,b.center[2]+(Math.floor(i/2)%3-1)*12],tags:['room','class','lecture',room,code,...b.aliases],description:'Room identifier included for planning. Interior placement is schematic; follow building signage for the final approach.',confidence:'approximate'})}}
export const placeById=Object.fromEntries(places.map(p=>[p.id,p]));
export const categoryNames:Record<string,string>={academic:'Buildings',study:'Study spaces',food:'Food & coffee',washroom:'Washrooms',water:'Water refill',printer:'Printing',microwave:'Microwaves',bike:'Bike parking',parking:'Parking',transit:'Transit',health:'Health',recreation:'Recreation',residence:'Residences',room:'Rooms'};
export function resolveLocation(id:string):{id:string;name:string;point:Point;building:string;floor:number}|null{const p=placeById[id];if(p)return p;const b=buildingById[id];if(b)return {id:b.id,name:b.shortName,point:b.center,building:b.id,floor:1};return null}
export function findRoom(query:string):Place|undefined{const m=query.trim().toUpperCase().match(/^([A-Z]{1,3}\d?)\s*[- ]?\s*(\d{3,5}[A-Z]?)$/);if(!m)return;let code=m[1];if(code==='E7')code='PSE';if(code==='DP')code='LIB';const b=buildingById[code];if(!b)return;const found=places.find(p=>p.name===`${code} ${m[2]}`);if(found)return found;const floor=Math.min(b.floors,Number(m[2][0]));const p:Place={id:`room-${code}-${m[2]}`,name:`${code} ${m[2]}`,building:code,floor,category:'room',point:[b.center[0]+12,(floor-1)*3.8+1,b.center[2]+8],tags:['room','class',m[2]],description:'Unverified room number. Floor is inferred from the identifier; position is schematic. Confirm the room exists before relying on this plan.',confidence:'approximate'};places.push(p);placeById[p.id]=p;return p}
export const connections:[string,string,'bridge'|'tunnel'|'indoor',number,number,boolean,string?][]=[
 ['MC','QNC','bridge',2,2,true],['MC','SLC','bridge',2,2,true],['SLC','PAC','indoor',1,1,true],['QNC','B2','bridge',2,2,true],['B2','B1','indoor',1,1,true],['B1','ESC','bridge',2,2,true],['ESC','C2','bridge',2,2,true],['C2','DC','bridge',2,2,false,'Steep ramp: excluded from step-free routes'],['ESC','EIT','indoor',1,1,true],['EIT','DC','bridge',2,2,true],['DC','E3','bridge',1,2,true],['E3','E2','indoor',2,2,true],['E3','E5','bridge',3,3,true],['E5','PSE','indoor',2,2,true],['PSE','E6','indoor',2,2,true],['E2','CPH','indoor',1,1,true],['E2','DWE','indoor',1,1,true],['E2','RCH','tunnel',0,0,true],['PHY','EIT','indoor',1,1,true],['B1','STC','indoor',1,1,true],['AL','SCH','tunnel',0,0,false],['AL','ML','tunnel',0,0,false],['ML','EV1','tunnel',0,0,false],['EV1','EV2','indoor',1,1,true],['EV2','EV3','indoor',1,1,true],['EV1','HH','tunnel',0,0,false]
];
export const closure={id:'m4',title:'M4 construction',detail:'MC–DC and MC–M3 bridges were removed in December 2024. Routes avoid these links. Nearby ground paths may change; follow site signage.',source:sources.closure,point:project(43.47266,-80.54352)};
