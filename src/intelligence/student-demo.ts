import type { ClassEvent } from '../types';
import type { CampusEvent } from './types';
import { resolveLocationId } from './locations';
import { createDemoFeed } from './demo';

export const DEMO_DAY = new Date(2026, 8, 15, 9, 5);
export const student = {
  name: 'Maya Park', initials: 'MP', program: 'Computer Science · 2A',
  residence: 'Ron Eydt Village', home: 'REV',
  bio: 'A second-year builder with a full backpack, a gym routine, and one too many side projects.',
  habits: ['Coffee at Math C&D between lectures', 'Quiet study at Davis with a power outlet', 'PAC strength training · Tue / Thu / Sat', 'CIF recovery run · Sunday', 'Startup talks and evening coworking', 'Covered routes when it rains'],
};
export const studentClasses: ClassEvent[] = [
  {id:'demo-math239',title:'MATH 239 · Combinatorics',location:'room-MC-4020',start:'09:30',end:'10:50',days:[2,4]},
  {id:'demo-cs245',title:'CS 245 · Logic',location:'room-MC-2065',start:'11:30',end:'12:50',days:[2,4]},
  {id:'demo-cs246',title:'CS 246 · Software development',location:'room-DC-1350',start:'10:30',end:'11:20',days:[1,3,5]},
  {id:'demo-stat230',title:'STAT 230 · Probability',location:'room-STC-0010',start:'13:30',end:'14:20',days:[1,3,5]},
  {id:'demo-cs246lab',title:'CS 246 · Programming lab',location:'room-DC-1351',start:'13:30',end:'14:20',days:[2,4]},
];
const routines: ClassEvent[] = [
  {id:'breakfast',title:'Breakfast at REV',location:'REV',start:'08:15',end:'08:45',days:[1,2,3,4,5]},
  {id:'coffee',title:'Coffee at Math C&D',location:'poi-10',start:'11:00',end:'11:20',days:[2,4]},
  {id:'lunch',title:'Lunch at SLC',location:'SLC',start:'13:00',end:'13:20',days:[2,4]},
  {id:'lunch-mwf',title:'Lunch with friends',location:'SLC',start:'12:15',end:'13:00',days:[1,3,5]},
  {id:'study',title:'Focus time · Davis Library',location:'poi-0',start:'14:30',end:'15:10',days:[1,2,3,4,5]},
  {id:'gym',title:'PAC · Strength session',location:'PAC',start:'15:30',end:'16:20',days:[2,4,6]},
  {id:'run',title:'CIF · Recovery run',location:'CIF',start:'10:00',end:'10:45',days:[0]},
  {id:'weekend-study',title:'Weekly review at Davis',location:'poi-0',start:'13:00',end:'14:30',days:[0,6]},
  {id:'al',title:'Project study with friends',location:'AL',start:'18:15',end:'19:15',days:[2]},
  {id:'dinner-tue',title:'Dinner before coworking',location:'SCH',start:'19:25',end:'19:45',days:[2]},
  {id:'dinner',title:'Dinner & catch up at REV',location:'REV',start:'18:30',end:'19:15',days:[0,1,3,4,5,6]},
  {id:'home',title:'Head home · wind down at REV',location:'REV',start:'22:30',end:'23:00',days:[0,1,2,3,4,5,6]},
];
export const chapters = [
  {id:'morning',label:'Leave REV',time:545,from:'REV',note:'09:05 · MATH 239 starts at 09:30 in MC 4020. Time to leave residence.'},
  {id:'coffee',label:'Coffee',time:655,from:'room-MC-4020',note:'10:55 · A coffee stop downstairs before CS 245 in MC 2065.'},
  {id:'lunch',label:'Lunch',time:772,from:'room-MC-2065',note:'12:52 · Lunch at SLC, then the CS 246 lab at Davis.'},
  {id:'study',label:'Study',time:862,from:'room-DC-1351',note:'14:22 · The lab is over. Find a quiet spot at Davis before the gym.'},
  {id:'gym',label:'Gym',time:915,from:'poi-0',note:'15:15 · Head to PAC for strength training. Compare the demo gym activity first.'},
  {id:'event',label:'Luma',time:1000,from:'PAC',note:'16:40 · After the workout, head to the 17:00 Velocity panel at SCH.'},
  {id:'tunnel',label:'Tunnel',time:1083,from:'SCH',note:'18:03 · It’s snowing after the panel. Take the arts tunnel to meet friends at AL.'},
  {id:'cowork',label:'WYGO',time:1185,from:'SCH',note:'19:45 · Dinner done. Join the Liminal coworking demo at RCH at 20:00.'},
  {id:'home',label:'Home',time:1335,from:'RCH',note:'22:15 · Close the laptop and walk back to REV. Tomorrow’s classes are ready.'},
] as const;
export type DemoChapter = typeof chapters[number];
export function studentWeek(): CampusEvent[] {
  const result: CampusEvent[] = [];
  const monday = new Date(2026,8,14);
  for(let i=0;i<7;i++) {
    const date = new Date(monday); date.setDate(date.getDate()+i);
    for(const item of [...studentClasses,...routines]) {
      if(!item.days.includes(date.getDay())) continue;
      const start=new Date(date), end=new Date(date);
      const [h,m]=item.start.split(':').map(Number), [eh,em]=item.end.split(':').map(Number);
      start.setHours(h,m); end.setHours(eh,em);
      const place=resolveLocationId(item.location);
      if(!place) throw Error(`Unresolved demo stop: ${item.location}`);
      result.push({id:`maya-${item.id}-${i}`, title:item.title, start:start.toISOString(),end:end.toISOString(),locationText:place.name,location:{locationId:item.location,building:place.building,label:place.name,point:place.point,confidence:item.location.startsWith('room-')?'room':'building',reason:'Fictional student demo itinerary'},source:'Sample',demo:true,personal:true});
    }
  }
  const feed=createDemoFeed(DEMO_DAY);
  for(const e of feed.events) {
    const day=new Date(e.start).getDay();
    if((day===2 && (e.source==='WYGO'||e.title.startsWith('Velocity'))) || (day===5&&e.title.startsWith('A peek'))) {
      // Attendance is a subset of the shared public feed; the source time stays identical.
      const location=e.source==='WYGO'?resolveLocationId('RCH'):undefined;
      result.push({...e,id:`maya-${e.id}`,personal:true,end:e.source==='WYGO'?new Date(new Date(e.start).getTime()+2*3600000).toISOString():e.end,location:location?{locationId:'RCH',building:'RCH',label:'RCH · Helix Lab 108 (follow signs)',point:location.point,confidence:'building',reason:'Building arrival; room door is not modeled'}:e.location});
    }
  }
  return result.sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
}
