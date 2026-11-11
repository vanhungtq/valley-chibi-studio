import * as T from './vendor/three.module.js';
import {AGENTS} from './data.js';

export function mountScene(container,{onSelect,getStatus}){
 const scene=new T.Scene();
 const camera=new T.OrthographicCamera(-10,10,6,-6,.1,100);camera.position.set(13,14,18);camera.lookAt(0,1,0);
 let renderer;
 try{renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});}catch{return null;}
 renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.7));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
 renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.35;renderer.setClearColor(0x000000,0);
 container.replaceChildren(renderer.domElement);
 renderer.domElement.setAttribute('aria-label','Mô hình 3D xưởng phim chibi với năm cộng sự AI. Chọn nhân vật để xem vai trò.');renderer.domElement.setAttribute('role','img');
 const room=new T.Group();scene.add(room);
 const mats={};
 const mat=(c)=>mats[c]||(mats[c]=new T.MeshStandardMaterial({color:c,roughness:.9,metalness:0}));
 function box(w,h,d,c,x=0,y=0,z=0,parent=room,radius=0){const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),mat(c));mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
 function sphere(r,c,x=0,y=0,z=0,parent=room,scale){const mesh=new T.Mesh(new T.SphereGeometry(r,24,18),mat(c));mesh.position.set(x,y,z);if(scale)mesh.scale.set(...scale);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
 function cyl(rt,rb,h,c,x=0,y=0,z=0,parent=room,segments=24){const mesh=new T.Mesh(new T.CylinderGeometry(rt,rb,h,segments),mat(c));mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
 function line(points,c,width=1,parent=room){const g=new T.BufferGeometry().setFromPoints(points.map(p=>new T.Vector3(...p)));const l=new T.Line(g,new T.LineBasicMaterial({color:c,linewidth:width}));parent.add(l);return l;}
 const hemi=new T.HemisphereLight(0xfff9e9,0xb2b68f,3.3);scene.add(hemi);
 const sun=new T.DirectionalLight(0xfff0d5,4);sun.position.set(-6,14,9);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-12;sun.shadow.camera.right=12;sun.shadow.camera.top=12;sun.shadow.camera.bottom=-12;sun.shadow.normalBias=.035;sun.shadow.bias=-.0002;sun.shadow.radius=4;scene.add(sun);
 const fill=new T.DirectionalLight(0xd9e8ee,1.6);fill.position.set(8,7,-5);scene.add(fill);
 // A small wooden studio, open toward the viewer.
 box(13.5,.42,10.5,'#c3baa1',0,-.23,0);
 box(13.7,.13,10.65,'#d7ccaf',0,.03,0);
 for(let i=0;i<19;i++)box(.69,.025,10.3,i%3===0?'#dcd0b5':i%3===1?'#dfd4bb':'#d8ccaf',-6.35+i*.705,.11,0);
 box(13.7,4.15,.2,'#ece8d6',0,2.12,-5.15);
 box(.2,4.15,10.5,'#e6e3cf',-6.7,2.12,0);
 box(13.8,.18,.32,'#b4a88b',0,4.25,-5.15);
 box(.32,.18,10.5,'#b4a88b',-6.7,4.25,0);
 box(13.5,.15,.15,'#bdae8d',0,.25,-4.99);
 box(.15,.15,10.2,'#bdae8d',-6.53,.25,0);
 for(const x of [-6.6,-1.3,6.6])box(.16,4.1,.23,'#c3b493',x,2.1,-4.98);
 // Windows with a miniature landscape beyond them.
 function windowAt(x,z,rot=0){const g=new T.Group();g.position.set(x,2.65,z);g.rotation.y=rot;room.add(g);box(2.25,2.1,.07,'#a8bba7',0,0,0,g);box(2.12,.85,.025,'#c4ceaf',0,-.56,.05,g);sphere(.53,'#8fa287',-.5,-.52,.07,g,[1.6,1,.05]);sphere(.7,'#adb995',.5,-.6,.09,g,[1.4,1,.04]);sphere(.19,'#eddfb2',.58,.57,.07,g,[1,1,.08]);for(const xx of [-1.2,0,1.2])box(.09,2.3,.14,'#f3edda',xx,0,.14,g);for(const yy of [-1.1,.1,1.1])box(2.48,.09,.15,'#f3edda',0,yy,.14,g);box(2.7,.1,.42,'#c9ba97',0,-1.2,.22,g);box(.2,2.28,.12,'#d6c8a5',-1.45,0,.14,g);box(.2,2.28,.12,'#d6c8a5',1.45,0,.14,g);return g;}
 windowAt(-3.9,-5.02);windowAt(3.75,-5.02);windowAt(-6.54,-2.8,Math.PI/2);
 // Shelving, little books, and hand-pinned ideas.
 box(.65,2.3,2.7,'#bdac8c',-6.2,1.35,.55);
 for(const y of [.35,1.05,1.8,2.5])box(.8,.08,2.85,'#cebd9a',-6.1,y,.55);
 for(let i=0;i<9;i++){const b=box(.48,.45,.15,['#91a083','#c7ab81','#ebe1c4','#a4b6ad','#b4957d'][i%5],-6.02,.62,-.55+i*.26);b.rotation.x=(i%3-1)*.04;}
 for(let i=0;i<6;i++)box(.5,.14,.5,['#9da58a','#d6c79d','#e8ddbd'][i%3],-6.0,1.14+i*.14,.8);
 box(1.7,1.35,.09,'#bdae8e',.3,2.76,-4.96);box(1.5,1.18,.03,'#dad3b6',.3,2.76,-4.9);
 for(let i=0;i<6;i++){const p=box(.37,.38,.02,['#f2ecd6','#e8bda5','#c5d1b1'][i%3],-.19+(i%3)*.46,2.51+Math.floor(i/3)*.48,-4.86);p.rotation.z=(i%2?1:-1)*.06;sphere(.025,'#aa8a65',p.position.x,p.position.y+.14,-4.83);}
 // Plants and soft clay furniture.
 function plant(x,z,size=1,c='#8c9e70'){const g=new T.Group();g.position.set(x,.14,z);g.scale.setScalar(size);room.add(g);cyl(.32,.24,.48,'#bfa082',0,.24,0,g);cyl(.33,.33,.09,'#c9ad8a',0,.46,0,g);cyl(.27,.27,.02,'#8c7f5d',0,.5,0,g);for(let i=0;i<7;i++){const a=i*2.4,r=.13+(i%3)*.09;const leaf=sphere(.27,c,Math.cos(a)*r,.76+(i%3)*.2,Math.sin(a)*r,g,[.55,1.3,.4]);leaf.rotation.z=Math.cos(a)*.6;leaf.rotation.x=Math.sin(a)*.5;}}
 plant(-5.5,-4.1,1.7);plant(5.9,-4.25,1.6,'#91a37c');plant(5.8,3.9,1.4);plant(-5.6,4.2,1.35,'#a1ae78');plant(-5.95,.1,.65);
 const rug=cyl(2.45,2.45,.035,'#c8caaa',0,.17,.4,room,64);rug.scale.z=.75;
 const coffee=cyl(.9,.9,.12,'#beaa86',-.2,.58,.35);cyl(.35,.4,.4,'#ad9877',-.2,.33,.35);
 box(.43,.06,.58,'#e8ddbe',-.4,.68,.35);box(.42,.045,.56,'#7e927a',-.43,.73,.35).rotation.y=.2;
 cyl(.09,.08,.15,'#f3ecda',.25,.73,.5);cyl(.065,.065,.01,'#7b664e',.25,.81,.5);
 function desk(x,z,rotation=0,kind='laptop'){
  const g=new T.Group();g.position.set(x,0,z);g.rotation.y=rotation;room.add(g);
  box(2.1,.14,1.07,'#c6b38d',0,1.0,0,g);box(2.17,.06,1.1,'#ddcba7',0,1.1,0,g);
  for(const xx of [-.83,.83])for(const zz of [-.35,.35])box(.085,.88,.085,'#b29e7c',xx,.55,zz,g);
  if(kind==='laptop'){
   box(.7,.035,.45,'#9fa99b',.1,1.16,-.06,g);const screen=box(.7,.48,.045,'#7d8e80',.1,1.39,-.25,g);screen.rotation.x=-.15;
   box(.61,.38,.014,'#d9e1ce',.1,1.4,-.215,g).rotation.x=-.15;
   for(let i=0;i<3;i++)box(.31-i*.05,.015,.01,'#afc19a',.02,1.49-i*.085,-.174-i*.01,g);
   box(.37,.035,.44,'#f0e7cc',-.64,1.16,.1,g).rotation.y=.1;
  }else{
   for(let i=0;i<3;i++){const paper=box(.64,.012,.45,'#faf2d9',-.55+i*.53,1.15,(i%2)*.2,g);paper.rotation.y=(i-1)*.1;for(let j=0;j<3;j++)box(.25,.016,.012,'#c5c6a8',-.52+i*.53,1.17,.1+j*.08+(i%2)*.1,g);}
   const pen=box(.035,.025,.4,'#8d9780',.7,1.19,.2,g);pen.rotation.y=.5;
  }
  cyl(.095,.075,.15,'#e7ddbf',.78,1.22,-.17,g);cyl(.07,.07,.01,'#867256',.78,1.3,-.17,g);
  const chair=new T.Group();chair.position.set(0,0,-.95);g.add(chair);box(.76,.13,.68,'#8e9e7e',0,.67,0,chair);box(.76,.58,.12,'#9da98c',0,1.0,-.3,chair);for(const xx of [-.27,.27])for(const zz of [-.23,.23])box(.06,.55,.06,'#a99b7c',xx,.35,zz,chair);
  return g;
 }
 desk(.1,-3.1,0);desk(-3.9,-.2,-.13,'paper');desk(3.5,-2.15,.14);desk(3.25,2.2,-.1,'paper');
 // Creative easel and a reference board.
 const easel=new T.Group();room.add(easel);easel.position.set(-4.8,.15,1.5);easel.rotation.y=.3;
 for(const xx of [-.58,.58]){const leg=box(.075,2.5,.075,'#b7a27c',xx,1.2,0,easel);leg.rotation.z=xx>0?.12:-.12;}
 box(1.6,1.3,.1,'#c1ae89',0,1.85,0,easel);box(1.43,1.12,.04,'#f1ecd8',0,1.85,.07,easel);
 for(let i=0;i<4;i++){box(.52,.36,.02,['#b8c4a4','#d4bc96','#a4b7aa','#d8cfaf'][i],-.34+(i%2)*.68,1.59+Math.floor(i/2)*.5,.11,easel);}
 // The cinematographer's miniature camera and tripod.
 const tripod=new T.Group();tripod.position.set(-2.8,.15,2.65);tripod.rotation.y=-.35;room.add(tripod);
 for(let i=0;i<3;i++){const a=i*Math.PI*2/3;const leg=box(.055,1.6,.055,'#68756a',Math.sin(a)*.3,.8,Math.cos(a)*.3,tripod);leg.rotation.z=-Math.sin(a)*.4;leg.rotation.x=Math.cos(a)*.4;}
 box(.53,.39,.35,'#626f62',0,1.68,0,tripod);const lens=cyl(.17,.19,.34,'#4d5d52',0,1.68,.32,tripod);lens.rotation.x=Math.PI/2;const glass=cyl(.13,.13,.02,'#8ca299',0,1.68,.5,tripod);glass.rotation.x=Math.PI/2;box(.23,.12,.15,'#5d6b5c',0,1.92,-.03,tripod);box(.21,.22,.025,'#b3bea7',.3,1.7,-.01,tripod).rotation.y=.3;
 box(.7,.5,.5,'#b5a789',-4.0,.4,3.5);box(.75,.06,.56,'#c9bb9b',-4.0,.69,3.5);box(.4,.19,.32,'#9aab92',-4.0,.8,3.5);
 // Five clay chibi colleagues, each with a distinct silhouette.
 const people=[];
 function character(id,x,z,shirt,style,rotation=0){
  const g=new T.Group();g.position.set(x,.2,z);g.rotation.y=rotation;g.userData.agent=id;room.add(g);
  const skin='#efd0ac',hair=style==='designer'?'#8c7255':style==='writer'?'#6b5b4c':'#60564b';
  for(const xx of [-.14,.14]){cyl(.115,.095,.33,'#8b8c76',xx,.25,0,g);sphere(.13,'#f2e9d1',xx,.1,.08,g,[1,.62,1.5]);}
  const torso=cyl(.24,.29,.63,shirt,0,.71,0,g);sphere(.27,shirt,0,.96,0,g,[1,.65,.85]);
  const head=new T.Group();head.position.set(0,1.45,0);g.add(head);
  sphere(.43,hair,0,.035,-.06,head,[1.05,1.06,1.02]);sphere(.4,skin,0,-.055,.075,head,[1,.96,.91]);
  sphere(.4,hair,0,.16,-.04,head,[1.04,.7,1]);
  for(let i=0;i<3;i++){const fringe=sphere(.2,hair,-.21+i*.2,.13,.28,head,[.7,.6,.48]);fringe.rotation.z=(i-1)*-.3;}
  for(const xx of [-.41,.41])sphere(.08,skin,xx,-.06,.06,head,[.6,.95,.7]);
  for(const xx of [-.145,.145]){sphere(.035,'#3b3932',xx,-.06,.411,head,[.85,1.25,.5]);sphere(.013,'#fff8ea',xx-.009,-.048,.427,head);sphere(.065,'#dfac8f',xx*1.55,-.15,.38,head,[1,.43,.19]);}
  sphere(.027,'#e5bd98',0,-.13,.442,head,[.8,.75,.5]);
  const smile=new T.CatmullRomCurve3([new T.Vector3(-.053,-.205,.405),new T.Vector3(0,-.221,.415),new T.Vector3(.053,-.205,.405)]);head.add(new T.Mesh(new T.TubeGeometry(smile,12,.009,5,false),mat('#bc9376')));
  const arms=[];
  for(const side of [-1,1]){const arm=new T.Group();arm.position.set(side*.28,.96,.015);g.add(arm);const sleeve=cyl(.105,.09,.32,shirt,0,-.12,.055,arm);sleeve.rotation.x=-.35;const hand=sphere(.096,skin,0,-.29,.12,arm);arm.rotation.z=side*-.18;arms.push(arm);}
  if(style==='ceo'){
   const cap=sphere(.37,'#82916c',0,.25,-.035,head,[1.15,.52,1.1]);sphere(.27,'#82916c',0,.19,.28,head,[1.35,.13,.7]);
   for(const xx of [-.15,.15]){const r=new T.Mesh(new T.TorusGeometry(.086,.012,5,24),mat('#8e8b73'));r.position.set(xx,-.06,.44);head.add(r);}line([[-.06,-.045,.44],[.06,-.045,.44]],'#8e8b73',1,head);
  }
  if(style==='creative'){sphere(.19,hair,.23,.4,-.17,head);sphere(.075,'#cfab80',.29,.44,-.08,head);}
  if(style==='writer'){for(const side of [-1,1])sphere(.2,hair,side*.34,-.11,-.05,head,[.6,1.6,1]);}
  if(style==='camera'){
   sphere(.4,'#829d9f',0,.22,-.03,head,[1.06,.65,1.03]);cyl(.407,.407,.11,'#9fb4af',0,.17,-.03,head);sphere(.1,'#9ab0a8',0,.49,-.035,head);box(.12,.1,.02,'#e3ddc3',.1,.2,.379,head);
   const strap=new T.Mesh(new T.TorusGeometry(.25,.024,6,30,Math.PI*1.2),mat('#727f69'));strap.position.set(0,.9,.2);strap.rotation.z=Math.PI;g.add(strap);box(.3,.23,.16,'#6d796a',0,.58,.32,g);const l=cyl(.07,.07,.13,'#4e6252',0,.59,.45,g);l.rotation.x=Math.PI/2;
  }
  if(style==='designer'){sphere(.22,hair,.28,-.14,-.2,head,[1,1.6,1]);sphere(.06,'#d3b965',.39,-.02,-.11,head);}
  people.push({id,group:g,head,arms,baseY:.2,label:null,phase:people.length*1.4});return g;
 }
 character('ceo',.1,-3.95,'#8b9a73','ceo');
 character('creative',-3.86,-1.05,'#c89e7b','creative',-.1);
 character('writer',3.62,-3.04,'#b0a0b4','writer',.12);
 character('camera',-2.1,3.08,'#8ca6a6','camera',-.15);
 character('designer',3.25,1.3,'#c9b36d','designer',-.1);
 // A little slate and a sleepy studio cat.
 const slate=box(.5,.4,.05,'#85927e',1.44,.4,3.65);slate.rotation.z=-.08;box(.55,.08,.07,'#c5cdb4',1.43,.64,3.65).rotation.z=-.12;
 sphere(.25,'#d8b78d',1.7,.36,1.1,room,[1.4,.7,.85]);sphere(.15,'#d8b78d',1.48,.45,1.07);for(const xx of [1.39,1.56]){const ear=new T.Mesh(new T.ConeGeometry(.07,.14,3),mat('#d8b78d'));ear.position.set(xx,.59,1.05);room.add(ear);}
 const clock=cyl(.27,.27,.06,'#f1e9d0',1.8,3.55,-4.99);clock.rotation.x=Math.PI/2;line([[1.8,3.55,-4.93],[1.8,3.72,-4.93]],'#929c80');line([[1.8,3.55,-4.92],[1.95,3.49,-4.92]],'#929c80');
 // Scene labels use the same state as the workflow and collaboration feed.
 for(const p of people){const a=AGENTS.find(a=>a.id===p.id);const el=document.createElement('button');el.className='agent-label';el.dataset.agent=p.id;el.innerHTML='<span class="dot" style="background:'+a.color+'"></span>'+a.name+' · '+a.short;el.addEventListener('click',ev=>{ev.stopPropagation();onSelect(p.id);});container.append(el);p.label=el;}
 let dead=false,frame=0,visible=true,zoom=1,angle=0,drag=null,moved=false;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 function resize(){const r=container.getBoundingClientRect();const ratio=r.width/Math.max(r.height,1);const height=ratio<1.6?14.8:12.8;camera.left=-height*ratio/2/zoom;camera.right=height*ratio/2/zoom;camera.top=height/2/zoom;camera.bottom=-height/2/zoom;camera.updateProjectionMatrix();renderer.setSize(r.width,r.height,false);draw();}
 function draw(){
  if(dead)return;
  camera.position.set(13*Math.cos(angle)+18*Math.sin(angle),14,18*Math.cos(angle)-13*Math.sin(angle));camera.lookAt(0,1,0);camera.updateMatrixWorld();
  renderer.render(scene,camera);
  const r=container.getBoundingClientRect(),status=getStatus();
  for(const p of people){const v=new T.Vector3();p.group.getWorldPosition(v);v.y+=2.2;v.project(camera);p.label.style.left=(v.x*.5+.5)*r.width+'px';p.label.style.top=(-v.y*.5+.5)*r.height+'px';p.label.classList.toggle('selected',status.selected===p.id);p.label.classList.toggle('running',status.running===p.id);p.label.setAttribute('aria-label',AGENTS.find(a=>a.id===p.id).role+' — '+(status.running===p.id?'Đang xử lý':'Xem vai trò'));}
 }
 function animate(t){if(dead)return;frame=requestAnimationFrame(animate);if(!visible||document.hidden)return;const status=getStatus();
  for(const p of people){const working=status.running===p.id;const speed=working?7:1.25;const amp=working?.025:.004;p.head.rotation.x=Math.sin(t*.001*speed+p.phase)*amp;p.head.rotation.z=Math.cos(t*.001*speed*.8+p.phase)*amp*.7;p.group.position.y=p.baseY+Math.sin(t*.0014+p.phase)*.006;p.arms.forEach((arm,i)=>{arm.rotation.x=working?-.35+Math.sin(t*.008+i*2)*.1:Math.sin(t*.001+p.phase)*.015;});}
  draw();
 }
 const observer=new ResizeObserver(resize);observer.observe(container);const visibility=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;});visibility.observe(container);
 const ray=new T.Raycaster(),pointer=new T.Vector2();
 function down(ev){drag={x:ev.clientX,angle};moved=false;}
 function move(ev){if(!drag)return;const d=ev.clientX-drag.x;if(Math.abs(d)>4)moved=true;angle=Math.max(-.32,Math.min(.32,drag.angle+d*.002));draw();}
 function up(ev){if(drag&&!moved){const r=renderer.domElement.getBoundingClientRect();pointer.set((ev.clientX-r.left)/r.width*2-1,-(ev.clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,camera);const hits=ray.intersectObjects(people.map(p=>p.group),true);if(hits.length){let obj=hits[0].object;while(obj&&!obj.userData.agent)obj=obj.parent;if(obj)onSelect(obj.userData.agent);}}drag=null;}
 renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('pointerleave',()=>{drag=null;});
 resize();if(!reduced)frame=requestAnimationFrame(animate);
 return {update:draw,zoom(delta){zoom=Math.max(.8,Math.min(1.35,zoom+delta));resize();},reset(){zoom=1;angle=0;resize();},destroy(){dead=true;cancelAnimationFrame(frame);observer.disconnect();visibility.disconnect();renderer.dispose();scene.traverse(obj=>{if(obj.geometry)obj.geometry.dispose();});Object.values(mats).forEach(m=>m.dispose());container.replaceChildren();}};
}
