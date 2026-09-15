import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowRight, Cpu, GitBranch, Route as RouteIcon, ShieldCheck, Snowflake, X } from 'lucide-react';
import { connections } from './data/campus';
import { buildingMinCut, type FlowResult } from './intelligence/state';
import { graphStats, weatherCostModel } from './routing';
import type { Route, Weather } from './types';
export default function AlgorithmPanel({presentationStage,route,flow,weather,at,frozen,onWeather,onTraffic,onClose}:{presentationStage?:number;route:Route|null;flow:FlowResult;weather:Weather;at:Date;frozen:boolean;onWeather:(snow:boolean)=>void;onTraffic:(busy:boolean)=>void;onClose:()=>void}) {
 const [narrow,setNarrow]=useState(false);
 const panel=useRef<HTMLElement>(null);
 useEffect(()=>{
   if(presentationStage===undefined)return;
   panel.current?.querySelectorAll('article')[presentationStage]?.scrollIntoView({block:'start',behavior:'smooth'});
   setNarrow(false);
   if(presentationStage===2){const timer=setTimeout(()=>setNarrow(true),4500);return()=>clearTimeout(timer);}
 },[presentationStage]);
 const model=weatherCostModel(weather), winter=model.label==='Winter snow';
 const cut=useMemo(()=>buildingMinCut('MC','DC',connections.map(([from,to,kind])=>({from,to,capacity:from==='MC'&&to==='QNC'&&narrow?16:kind==='bridge'?60:kind==='tunnel'?35:90}))),[narrow]);
 const cost=route?.edges.filter(e=>e.kind==='outdoor').reduce((s,e)=>s+e.distance/1.35*(model.outdoorMultiplier-1),0)||0;
 const points:Record<string,[number,number]>={MC:[20,40],QNC:[70,40],B2:[120,40],B1:[170,40],ESC:[220,40],C2:[267,18],EIT:[267,75],DC:[325,40]};
 const links=connections.filter(([a,b])=>points[a]&&points[b]);
 return <div className="engine-backdrop" onClick={onClose}><section ref={panel} role="dialog" aria-modal="true" aria-labelledby="engine-title" className="engine-panel" onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape')onClose();}}>
  <button autoFocus className="engine-close" aria-label="Close algorithm panel" onClick={onClose}><X size={22}/></button>
  <span className="eyebrow">WATWAY ENGINE · JUDGE VIEW</span><h1 id="engine-title">See the decisions.</h1><p className="engine-lede">Real algorithms. Repeatable demo inputs. Every control below recomputes a result.</p>
  <div className="engine-live"><span/>{at.toLocaleTimeString('en-CA',{hour:'2-digit',minute:'2-digit'})} · {frozen?'Curated tunnel playback':'Computing Maya’s route'} · {winter?'Winter scenario':'Dry scenario'}</div>
  <article className="engine-card"><h2><RouteIcon size={19}/>01 · A* path search<b>COMPUTED</b></h2>
  <p>Search the campus graph for the lowest-cost connected route.</p>
  {frozen?<div className="engine-notice">This walk uses the frozen SCH → AL pitch route. Live A* runs for other destinations; playback follows the collision-tested path.</div>:route?.search?<><div className="engine-numbers"><div><strong>{route.search.expanded.toLocaleString()}</strong><span>nodes expanded</span></div><div><strong>{route.search.milliseconds.toFixed(1)}<small> ms</small></strong><span>search time</span></div><div><strong>{Math.round(route.distance)}<small> m</small></strong><span>chosen path</span></div></div><div className="engine-progress"><i style={{width:`${Math.max(2,route.search.expanded/graphStats.nodes*100)}%`}}/></div><small>{graphStats.nodes.toLocaleString()} graph nodes · {graphStats.edges.toLocaleString()} edges · {route.search.relaxed.toLocaleString()} improvements</small></>:<p>No connected route for this stop.</p>}
  <code>f(n) = g(n) + h(n)</code><small>g = cost so far; h = straight-line distance ÷ maximum speed. Closed and inaccessible edges are filtered first.</small></article>
  <article className="engine-card"><h2><Snowflake size={19}/>02 · Seasonal route costs<b>{winter?'WINTER':'DRY'}</b></h2><div className="engine-toggle"><button aria-pressed={winter} onClick={()=>onWeather(true)}>Winter · −3°C</button><button aria-pressed={!winter} onClick={()=>onWeather(false)}>Dry · 23°C</button></div>
  <div className="engine-numbers"><div><strong>×{model.outdoorMultiplier.toFixed(2)}</strong><span>outdoor travel time</span></div><div><strong>{route?.indoorPercent??0}<small>%</small></strong><span>covered route</span></div><div><strong>+{Math.round(cost)}<small>s</small></strong><span>weather cost*</span></div></div><code>cost = travel time + exposure + traffic</code><small>Weather-smart routing adds {model.exposurePenalty} cost units per outdoor metre. *Added outdoor time before crowds, on this path. Snow factors are demo assumptions.</small></article>
  <article className="engine-card"><h2><GitBranch size={19}/>03 · Max-flow / min-cut<b>COMPUTED</b></h2><p>How much flow can the covered MC → DC network carry?</p>
  <svg className="engine-network" viewBox="0 0 345 105" role="img" aria-label={`MC to DC flow network; bottleneck ${cut.capacity} people per minute`}>
    {links.map(([a,b])=>{const isCut=cut.cut.some(l=>(l.from===a&&l.to===b)||(l.to===a&&l.from===b));return <line key={a+b} x1={points[a][0]} y1={points[a][1]} x2={points[b][0]} y2={points[b][1]} stroke={isCut?'#f4bd59':'#5c998a'} strokeWidth={isCut?5:2} strokeDasharray={isCut?'5 3':undefined}/>;})}
    {Object.entries(points).map(([n,[x,y]])=><g key={n}><circle cx={x} cy={y} r="10" fill="#172f30" stroke="#b3d5c7"/><text x={x} y={y+25} textAnchor="middle" fill="#d9e9e1" fontSize="9">{n}</text></g>)}
  </svg><div className="engine-toggle"><button aria-pressed={!narrow} onClick={()=>setNarrow(false)}>Normal bridge</button><button aria-pressed={narrow} onClick={()=>setNarrow(true)}>Constrain MC → QNC</button></div>
  <div className="engine-cut"><strong>{cut.capacity}<small> people/min</small></strong><span>Max flow = minimum cut</span></div><p className="engine-cut-name">Bottleneck: {cut.cut.map(l=>`${l.from} → ${l.to}`).join(' · ')}</p><small>Edmonds–Karp on the coarse building network. Capacities are illustrative; this is separate from the pedestrian delay model below.</small></article>
  <article className="engine-card"><h2><Activity size={19}/>04 · Traffic-aware ETA<b>MODEL</b></h2><div className="engine-toggle"><button onClick={()=>onTraffic(false)}>12:40 · Between classes</button><button onClick={()=>onTraffic(true)}>12:55 · Class change</button></div><div className="engine-numbers"><div><strong>{flow.totalDemand}</strong><span>model trips / min</span></div><div><strong>{flow.burst.toFixed(2)}<small>×</small></strong><span>class-change demand</span></div></div>{flow.bottlenecks.slice(0,2).map(b=><div className="engine-bottleneck" key={b.id}><span>{b.name}</span><b>{b.peoplePerMinute}/{b.capacity} per min</b><div><i style={{width:`${Math.min(100,b.ratio*100)}%`}}/></div></div>)}<small>Demand from curated building pairs is assigned to routes. Load/capacity creates edge delays, then A* searches with those delays.</small></article>
  <article className="engine-card"><h2><ShieldCheck size={19}/>05 · Connected navigation</h2><div className="engine-feature"><Cpu size={17}/><span>Wall collisions, stair height checks, and continuous route playback</span></div><div className="engine-feature"><ArrowRight size={17}/><span>Calendar → room resolution → departure time → next useful stop</span></div><small>Demo student and events are fictional. Corridor and stair geometry is reconstructed from mapped connections.</small></article>
 </section></div>;
}
