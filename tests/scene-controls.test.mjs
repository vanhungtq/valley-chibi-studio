import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_ORBIT,dragOrbit,zoomOrbit,orbitPosition,routePose} from '../public/scene-controls.js';

test('mouse orbit supports complete turns and keeps the camera above the floor',()=>{
 const turned=dragOrbit(DEFAULT_ORBIT,1800,-10000);assert.ok(Math.abs(turned.azimuth-DEFAULT_ORBIT.azimuth)>Math.PI*2);assert.equal(turned.polar,1.34);
 for(let azimuth=-Math.PI*2;azimuth<=Math.PI*2;azimuth+=.2){const camera=orbitPosition({...turned,azimuth});assert.ok(camera.y>1.1);assert.ok(Number.isFinite(camera.x)&&Number.isFinite(camera.z));}
 assert.equal(dragOrbit(DEFAULT_ORBIT,0,10000).polar,.3);
});
test('wheel zoom stays within bounds and reverses direction without an abrupt jump',()=>{
 let zoom=1;for(let i=0;i<50;i++)zoom=zoomOrbit(zoom,-100);assert.equal(zoom,2.5);for(let i=0;i<50;i++)zoom=zoomOrbit(zoom,100);assert.equal(zoom,.65);assert.ok(zoomOrbit(1,-30)>1);assert.ok(Math.abs(zoomOrbit(zoomOrbit(1,30),-30)-1)<1e-9);
});
test('staff pause at a workstation, walk at a fixed speed, then loop without teleporting',()=>{
 const route=[[0,0],[4,0],[4,3],[0,3]],config={speed:1,pause:2};
 assert.equal(routePose(route,1,config).walking,false);assert.deepEqual([routePose(route,4,config).x,routePose(route,4,config).z],[2,0]);assert.equal(routePose(route,6.5,config).walking,false);
 let previous=routePose(route,0,config);for(let time=.05;time<60;time+=.05){const next=routePose(route,time,config);assert.ok(Math.hypot(next.x-previous.x,next.z-previous.z)<.051);assert.ok(next.x>=0&&next.x<=4&&next.z>=0&&next.z<=3);previous=next;}
});
