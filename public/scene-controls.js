export const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export const DEFAULT_ORBIT={azimuth:Math.atan2(13,18),polar:.91,zoom:1};
export function orbitPosition(orbit,radius=27){const sin=Math.sin(orbit.polar);return {x:radius*sin*Math.sin(orbit.azimuth),y:1.1+radius*Math.cos(orbit.polar),z:radius*sin*Math.cos(orbit.azimuth)};}
export function dragOrbit(start,dx,dy){return {...start,azimuth:start.azimuth-dx*.006,polar:clamp(start.polar-dy*.004,.3,1.34)};}
export function zoomOrbit(value,delta){return clamp(value*Math.exp(-clamp(delta,-200,200)*.0018),.65,2.5);}
export function routePose(points,time,{speed=.7,pause=2,offset=0}={}){
 const lengths=points.map((p,i)=>{const n=points[(i+1)%points.length];return Math.hypot(n[0]-p[0],n[1]-p[1]);});
 const total=lengths.reduce((n,d)=>n+d/speed+pause,0);let cursor=((time+offset)%total+total)%total;
 for(let i=0;i<points.length;i++){const duration=lengths[i]/speed,next=points[(i+1)%points.length],p=points[i],angle=Math.atan2(next[0]-p[0],next[1]-p[1]);if(cursor<pause)return {x:p[0],z:p[1],angle,walking:false,phase:cursor};cursor-=pause;if(cursor<duration){const u=cursor/duration;return {x:p[0]+(next[0]-p[0])*u,z:p[1]+(next[1]-p[1])*u,angle,walking:true,phase:cursor};}cursor-=duration;}
 return {x:points[0][0],z:points[0][1],angle:0,walking:false,phase:0};
}
