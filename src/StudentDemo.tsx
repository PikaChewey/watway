import { useState } from 'react';
import { ArrowRight, CalendarDays, ChevronRight, Dumbbell, Home, Play, X } from 'lucide-react';
import { chapters, student, studentClasses, type DemoChapter } from './intelligence/student-demo';
import type { CampusEvent } from './intelligence/types';
const clock = (value:string) => new Date(value).toLocaleTimeString('en-CA',{hour:'2-digit',minute:'2-digit',hour12:false});
export function StudentStory({at,onChapter,onProfile,onTunnel}:{at:Date;onChapter:(c:DemoChapter)=>void;onProfile:()=>void;onTunnel:()=>void}) {
  const time=at.getHours()*60+at.getMinutes();
  const active=[...chapters].reverse().find(c=>time>=c.time) || chapters[0];
  return <section className="student-story">
    <div className="student-story-heading"><button className="student-avatar" onClick={onProfile} aria-label="Meet Maya Park">MP</button><div><span className="eyebrow">FICTIONAL STUDENT · DEMO</span><h2>Maya’s Tuesday</h2><small>CS 2A · REV residence · Winter demo</small></div><button className="student-profile-link" onClick={onProfile} aria-label="View student profile"><ChevronRight size={19}/></button></div>
    <div className="student-chapters" aria-label="Follow Maya’s day">{chapters.map(c=><button key={c.id} aria-pressed={c.id===active.id} onClick={()=>onChapter(c)}><span>{String(Math.floor(c.time/60)).padStart(2,'0')}:{String(c.time%60).padStart(2,'0')}</span>{c.label}</button>)}</div>
    <p>{active.note}</p>
    <div className="student-scene-footer"><select className="student-scene-select" aria-label="Jump to demo scene" value={active.id} onChange={e=>{const chapter=chapters.find(c=>c.id===e.target.value);if(chapter)onChapter(chapter);}}>{chapters.map((c,i)=><option value={c.id} key={c.id}>{i+1}/{chapters.length} · {c.label}</option>)}</select><span>SCENE {chapters.indexOf(active)+1} / {chapters.length}</span><button onClick={()=>onChapter(chapters[(chapters.indexOf(active)+1)%chapters.length])}>{chapters.indexOf(active)===chapters.length-1?'Restart day':`Next: ${chapters[chapters.indexOf(active)+1].label}`}<ArrowRight size={15}/></button></div>
    {active.id==='tunnel'&&<button className="primary" onClick={onTunnel}><Play size={16}/>Play Maya’s tunnel walk<ArrowRight size={16}/></button>}
  </section>;
}
export function StudentWeek({events,at,onRoute,onProfile}:{events:CampusEvent[];at:Date;onRoute:(id:string)=>void;onProfile:()=>void}) {
  const [selectedDay,setSelectedDay]=useState(2);
  const date=new Date(2026,8,14+(selectedDay+6)%7);
  const list=events.filter(e=>new Date(e.start).toDateString()===date.toDateString());
  return <div className="student-week"><div className="panel-heading"><div><span className="eyebrow">MAYA PARK · DEMO WEEK</span><h1>A full campus life.</h1></div><button className="student-avatar" onClick={onProfile} aria-label="View student profile">MP</button></div><p className="micro-copy">Five courses and labs, four workouts, coffee, friends, and selected Luma / WYGO events. All times are fictional.</p>
  <div className="week-selector">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d,i)=><button key={d} aria-label={d} onClick={()=>setSelectedDay((i+1)%7)} className={selectedDay===(i+1)%7?'selected':''}><span>{d}</span><b>{14+i}</b></button>)}</div>
  <div className="section-head"><h2>{date.toLocaleDateString('en-CA',{weekday:'long'})}</h2><span>{list.length} plans</span></div>
  {list.map(e=><div className={`agenda-item student-agenda ${Date.parse(e.end)<at.getTime()?'is-past':''}`} key={e.id}><div className="agenda-time">{clock(e.start)}<small>{clock(e.end)}</small></div><div><strong>{e.title}</strong><span>{e.location?.label}</span><small className="source-tag">{e.source==='Sample'?e.id.includes('demo-')?'Course · demo':'Habit · demo':`${e.source} · attending · demo`}</small><button className="inline-route" onClick={()=>e.location&&onRoute(e.location.locationId)}>Show route<ChevronRight size={14}/></button></div></div>)}
  </div>;
}
export function StudentProfile({onClose,onPersonal}:{onClose:()=>void;onPersonal:()=>void}) {
 return <div className="student-modal-backdrop" onClick={onClose}><section className="student-profile" role="dialog" aria-modal="true" aria-labelledby="student-profile-name" onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape')onClose();}}><button autoFocus className="student-close" aria-label="Close student profile" onClick={onClose}><X size={21}/></button><div className="student-avatar large">MP</div><span className="eyebrow">YOUR DEMO STUDENT</span><h1 id="student-profile-name">{student.name}</h1><p>{student.program}</p><span className="student-home"><Home size={15}/>{student.residence}</span><p>{student.bio}</p><h2><CalendarDays size={18}/>The weekly rhythm</h2><div className="student-course-list">{studentClasses.map(c=><div key={c.id}><strong>{c.title}</strong><span>{c.days.map(d=>['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join(' / ')} · {c.start}–{c.end}</span></div>)}</div><h2><Dumbbell size={18}/>Off the timetable</h2><ul>{student.habits.map(h=><li key={h}>{h}</li>)}</ul><p className="student-disclaimer">Maya, her timetable, attendance, and activity figures are fictional pitch data. Source links provide context; demo times are not live listings.</p><button className="secondary" onClick={onPersonal}>Switch to my own calendar<ArrowRight size={16}/></button></section></div>;
}
