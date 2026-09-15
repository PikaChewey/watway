import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildStairGeometry} from '../visual/stairGeometry';
import {segments} from '../navigation/physicalModel';
test('stair mesh treads are level and meet each collision-model step height',()=>{
 for(const s of segments.filter(s=>s.kind==='stairs')){
  const result=buildStairGeometry(s);
  assert.equal(result.treads.length,s.steps||12);
  for(let i=0;i<result.count;i++){
   const positions=result.treads[i].getAttribute('position');
   const expected=s.a[1]+(s.b[1]-s.a[1])*(i+1)/result.count;
   for(let j=0;j<positions.count;j++)assert.ok(Math.abs(positions.getY(j)-expected)<.00001,`${s.id} tread ${i}`);
   const riser=result.risers[i].getAttribute('position');
   const ys=Array.from({length:riser.count},(_,j)=>riser.getY(j));
   assert.ok(Math.abs(Math.max(...ys)-Math.min(...ys)-Math.abs(result.rise))<.00001);
  }
  for(const g of [...result.treads,...result.risers,...result.nosings,...result.body])g.dispose();
 }
});
