import {test} from 'node:test';
import assert from 'node:assert/strict';
import {STRAIGHT,stairEnd,straightEnd,straightHeight,moveStraight} from '../navigation/straightDemo';
test('straight demo joins both hallways and all stair heights without gaps',()=>{
 assert.equal(straightHeight(STRAIGHT.hall),0);
 assert.equal(straightHeight(stairEnd),STRAIGHT.rise);
 assert.equal(straightHeight(straightEnd),STRAIGHT.rise);
 let previous=0;
 for(let d=.5;d<straightEnd;d+=.01){const h=straightHeight(d);assert.ok(h>=previous);assert.ok(h-previous<=STRAIGHT.rise/STRAIGHT.steps+1e-8);previous=h;}
});
test('straight demo confines the walker to walls and reaches the end without turns',()=>{
 let state=moveStraight(0,.5,0,0);
 for(let i=0;i<2000;i++)state=moveStraight(state.x,state.distance,0,1.7/60);
 assert.equal(state.x,0);assert.equal(state.progress,1);assert.equal(state.height,STRAIGHT.rise);
 assert.ok(moveStraight(0,10,100,0).x<STRAIGHT.width/2);
 assert.ok(moveStraight(0,10,-100,0).x>-STRAIGHT.width/2);
 assert.equal(moveStraight(0,10,0,-100).distance,.5);
});
