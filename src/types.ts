export type Point = [number, number, number];
export type Category = 'academic'|'study'|'food'|'washroom'|'water'|'printer'|'microwave'|'bike'|'parking'|'transit'|'health'|'recreation'|'residence';
export interface Building { id:string; name:string; shortName:string; lat:number; lon:number; center:Point; polygon:number[][]; height:number; floors:number; category:Category; description:string; color:string; source:string; geometrySource:string; aliases:string[]; }
export interface MapFeature {id:string; points:number[][]; type:string; name?:string; width?:number; height?:number; surface?:string; stairs?:boolean; access?:string; nodes?:number[];}
export interface Place {id:string; name:string; building:string; floor:number; category:Category|'room'; point:Point; tags:string[]; description:string; confidence:'verified'|'approximate'; source?:string;}
export interface GraphNode {id:string; point:Point; kind:'path'|'entrance'|'hallway'|'room'|'stairs'|'elevator'; building?:string; floor?:number; label?:string;}
export type EdgeKind='outdoor'|'indoor'|'bridge'|'tunnel'|'stairs'|'elevator'|'entrance';
export interface GraphEdge {id:string; from:string; to:string; distance:number; kind:EdgeKind; accessible:boolean; estimated:boolean; closed?:boolean; name?:string; steep?:boolean;}
export type RouteProfile='fastest'|'shortest'|'indoor'|'accessible'|'stairs'|'weather';
export interface Route {nodes:GraphNode[]; edges:GraphEdge[]; distance:number; seconds:number; outdoorDistance:number; indoorPercent:number; stairs:number; elevatorWait:number; profile:RouteProfile; steps:RouteStep[]; estimated:boolean;}
export interface RouteStep {title:string; detail:string; kind:EdgeKind; distance:number; point:Point; edgeStart:number; edgeEnd:number;}
export type WeatherMode='live'|'sun'|'rain'|'snow'|'fog';
export interface Weather {temperature:number; apparent:number; code:number; precipitation:number; wind:number; isDay:boolean; time:string; fetchedAt:string; status:'loading'|'live'|'offline'; hourly:{time:string;temperature:number;rain:number;code:number}[];}
export interface ClassEvent {id:string; title:string; location:string; start:string; end:string; days:number[];}
