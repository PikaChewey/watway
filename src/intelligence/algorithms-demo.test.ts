import {test} from 'node:test';
import assert from 'node:assert/strict';
import {computeRoute,weatherCostModel,edges,nodes} from '../routing';
import {studentWeek,DEMO_DAY,chapters} from './student-demo';
import {createDemoFeed} from './demo';
import {buildingMinCut} from './state';
import {connections,distance} from '../data/campus';

test('A* returns the same optimal cost as Dijkstra across campus and interior routes',()=>{
 const at=new Date(2026,8,15,12,55);
 for(const [from,to] of [['REV','room-MC-4020'],['MC','DC'],['SCH','AL'],['poi-0','PAC'],['PAC','SCH'],['SCH','RCH'],['RCH','REV']]) {
  for(const profile of ['fastest','shortest','weather','accessible'] as const) {
   const a=computeRoute(from,to,profile,{code:73,precipitation:1},12,{at});
   const d=computeRoute(from,to,profile,{code:73,precipitation:1},12,{at,algorithm:'dijkstra'});
   assert.equal(!!a,!!d,`${from} → ${to} ${profile}`);
   if(a&&d) assert.ok(Math.abs(a.search!.cost-d.search!.cost)<1e-6,`${from} → ${to} ${profile}: ${a.search!.cost} / ${d.search!.cost}`);
  }
 }
});
test('A* heuristic lower bound is supported by actual graph geometry',()=>{
 for(const e of edges)assert.ok(e.distance+1e-5>=distance(nodes.get(e.from)!.point,nodes.get(e.to)!.point),e.id);
});
test('winter increases exposed-route travel cost over dry weather',()=>{
 const at=new Date(DEMO_DAY);
 const dry=computeRoute('REV','MC','shortest',{code:0,precipitation:0},9,{at})!;
 const snow=computeRoute('REV','MC','shortest',{code:73,precipitation:1},9,{at})!;
 assert.ok(snow.seconds>dry.seconds); assert.equal(snow.distance,dry.distance);
 assert.equal(weatherCostModel({code:73,precipitation:1}).outdoorMultiplier,1.32);
});
test('Maya has a non-overlapping week and all chapter destinations are routable',()=>{
 const week=studentWeek();assert.ok(week.length>50);
 for(let i=1;i<week.length;i++)assert.ok(Date.parse(week[i].start)>=Date.parse(week[i-1].end),`${week[i-1].title} overlaps ${week[i].title}`);
 for(const c of chapters){const at=new Date(DEMO_DAY);at.setHours(Math.floor(c.time/60),c.time%60);const next=week.find(e=>Date.parse(e.start)>at.getTime());assert.ok(next);assert.ok(computeRoute(c.from,next.location!.locationId,'weather',{code:73,precipitation:1},at.getHours(),{at}),`${c.id} to ${next?.title}`);}
});
test('selected Luma and WYGO attendance agrees with the shared demo feed',()=>{
 const week=studentWeek(),feed=createDemoFeed(DEMO_DAY);
 for(const e of week.filter(e=>e.source==='Luma'||e.source==='WYGO'))assert.ok(feed.events.some(p=>p.title===e.title&&p.start===e.start&&p.url===e.url));
});
test('capacity control produces an observable min-cut change',()=>{
 const links=connections.map(([from,to,kind])=>({from,to,capacity:kind==='bridge'?60:kind==='tunnel'?35:90}));
 const normal=buildingMinCut('MC','DC',links),tight=buildingMinCut('MC','DC',links.map(l=>l.from==='MC'&&l.to==='QNC'?{...l,capacity:16}:l));
 assert.equal(normal.capacity,60);assert.equal(tight.capacity,16);
});
