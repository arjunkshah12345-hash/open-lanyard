import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createLanyardPhysics } from './physics.js';
import { makeTextures } from './artwork.js';
import { createTracedShadows } from './lighting.js';

const W = 2.5;
const H = 3.55;

function roundedRect(width, height, r) {
  const x = -width / 2, y = -height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x + r, y);
  shape.lineTo(x + width - r, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + r);
  shape.lineTo(x + width, y + height - r);
  shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  shape.lineTo(x + r, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

function printGeometry() {
  const geometry = new THREE.ShapeGeometry(roundedRect(W - 0.06, H - 0.06, 0.13), 16);
  const positions = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < positions.count; i++) uv.setXY(i, positions.getX(i) / W + 0.5, positions.getY(i) / H + 0.5);
  return geometry;
}

function hardwareRing(width, height, thickness, material, depth = 0.05) {
  const shape = roundedRect(width, height, Math.min(width, height) * 0.3);
  const hole = roundedRect(width - thickness * 2, height - thickness * 2, Math.min(width, height) * 0.2);
  shape.holes.push(hole);
  const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled:true, bevelThickness:0.014, bevelSize:0.014, bevelSegments:3, steps:1, curveSegments:16,
  }), material);
  mesh.position.z = -depth / 2;
  return mesh;
}

function makeCard(textures) {
  const group = new THREE.Group();
  const rim = new THREE.MeshPhysicalMaterial({ color: '#8795a4', metalness:0.92, roughness:0.25, clearcoat:0.75 });
  const bodyGeometry=new THREE.ExtrudeGeometry(roundedRect(W,H,0.14),{
    depth:0.075,steps:1,bevelEnabled:true,bevelThickness:0.014,bevelSize:0.009,bevelSegments:3,curveSegments:16,
  });
  bodyGeometry.translate(0,0,-0.0375);
  const body = new THREE.Mesh(bodyGeometry, rim);
  group.add(body);
  const makePrint = (map) => new THREE.MeshPhysicalMaterial({ map, metalness:0.04, roughness:0.53, specularIntensity:0.35, clearcoat:0.2, clearcoatRoughness:0.2, envMapIntensity:0.15 });
  const front = new THREE.Mesh(printGeometry(), makePrint(textures.front));
  front.position.z = 0.054;
  const back = new THREE.Mesh(printGeometry(), makePrint(textures.back));
  back.position.z = -0.054;
  back.rotation.y = Math.PI;
  group.add(front, back);

  const metal = new THREE.MeshStandardMaterial({ color:'#c8cdc8', metalness:1, roughness:0.2 });
  const black = new THREE.MeshStandardMaterial({ color:'#121612', metalness:0.35, roughness:0.42 });
  const tab = new THREE.Mesh(new RoundedBoxGeometry(0.38, 0.27, 0.1, 3, 0.04), black);
  tab.position.y = H / 2 + 0.025;
  group.add(tab);
  const ring = hardwareRing(0.29, 0.32, 0.044, metal);
  ring.position.y = H / 2 + 0.11;
  group.add(ring);
  const clasp = hardwareRing(0.22, 0.26, 0.036, metal, 0.06);
  clasp.position.y = H / 2 + 0.23;
  group.add(clasp);
  const latch = new THREE.Mesh(new THREE.CylinderGeometry(0.027,0.027,0.17,12),metal);
  latch.position.set(0.10,H / 2 + 0.25,0.035);
  group.add(latch);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.061,0.061,0.17,16),metal);
  pin.rotation.z = Math.PI / 2;
  pin.position.y = 2.06;
  group.add(pin);

  // A small foil stamp catches the light independently of the printed surface.
  const foil = new THREE.Mesh(new THREE.CircleGeometry(0.077, 6), new THREE.MeshPhysicalMaterial({ color:'#c9dfff', metalness:1, roughness:0.17, iridescence:0.75, iridescenceIOR:1.35 }));
  foil.position.set(0.92,-1.12,0.055);
  group.add(foil);
  return { group, front, back, meshes:[body, front, back] };
}

function makeStrap(texture) {
  const segments = 90;
  const positions = new Float32Array((segments + 1) * 2 * 3);
  const uvs = new Float32Array((segments + 1) * 2 * 2);
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    uvs.set([0, 1 - i / segments, 1, 1 - i / segments], i * 4);
    if (i < segments) {
      const n = i * 2;
      indices.push(n,n+1,n+2,n+1,n+3,n+2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2));
  geometry.setIndex(indices);
  const material = new THREE.MeshPhysicalMaterial({ map:texture, side:THREE.DoubleSide, roughness:0.93, metalness:0, envMapIntensity:0.25, sheen:0.12, sheenColor:new THREE.Color('#a0af8c'), sheenRoughness:0.8 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  const curve = new THREE.CatmullRomCurve3(Array.from({length:7},()=>new THREE.Vector3()), false, 'centripetal');
  const point = new THREE.Vector3(), tangent = new THREE.Vector3(), width = new THREE.Vector3();
  const forward = new THREE.Vector3(0,0,1);
  const cardWidth = new THREE.Vector3();
  return {
    mesh,
    update(points, rotation, tension=0) {
      curve.points = points.map(p => new THREE.Vector3(p.x,p.y,p.z));
      cardWidth.set(1,0,0).applyQuaternion(rotation);
      for (let i=0;i<=segments;i++) {
        const t=i/segments;
        curve.getPoint(t,point);
        curve.getTangent(t,tangent);
        width.crossVectors(tangent,forward).normalize();
        if (width.x<0) width.negate();
        // The last portion twists continuously into the badge's metal clip.
        width.lerp(cardWidth, Math.pow(t,4)).normalize().multiplyScalar(0.13*(1-0.045*tension));
        const j=i*6;
        positions[j]=point.x-width.x; positions[j+1]=point.y-width.y; positions[j+2]=point.z-width.z;
        positions[j+3]=point.x+width.x; positions[j+4]=point.y+width.y; positions[j+5]=point.z+width.z;
      }
      geometry.attributes.position.needsUpdate=true;
      geometry.computeVertexNormals();
    },
  };
}

export async function createScene(container, config, onInteraction=()=>{}) {
  const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000,0);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.22;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34,1,0.1,100);
  camera.position.set(0,1.1,14.8);
  camera.lookAt(0,1.1,0);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const softboxMaterial=new THREE.MeshBasicMaterial({color:new THREE.Color(4,4.1,4.3)});
  const softbox=new THREE.Mesh(new THREE.PlaneGeometry(2.4,7),softboxMaterial);
  softbox.position.set(-4,3,5);softbox.lookAt(0,0,0);room.add(softbox);
  const environment = pmrem.fromScene(room,0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity=0.65;
  room.dispose(); pmrem.dispose();
  scene.add(new THREE.AmbientLight('#e5eaf2',0.65));
  const key = new THREE.DirectionalLight('#fffcf4',2.4);
  key.position.set(-3.5,7,6); scene.add(key);
  const fill = new THREE.DirectionalLight('#d9e1ff',0.85);
  fill.position.set(5,1,3); scene.add(fill);
  const rim = new THREE.DirectionalLight('#d9e8ff',3.5);
  rim.position.set(0,4,-3); scene.add(rim);

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const physics = await createLanyardPhysics({reducedMotion});
  let textures = makeTextures(config, renderer);
  const card = makeCard(textures);
  scene.add(card.group);
  const strap = makeStrap(textures.strap);
  scene.add(strap.mesh);

  const shadows=createTracedShadows({mobile:window.matchMedia('(pointer: coarse)').matches});
  scene.add(shadows.mesh);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0,0,1),0);
  const worldPoint = new THREE.Vector3(), offset = new THREE.Vector3();
  let pointerId=null, disposed=false, lastTime=0, frame;
  const listeners=[];
  const listen=(node,type,fn,options)=>{ node.addEventListener(type,fn,options); listeners.push(()=>node.removeEventListener(type,fn,options)); };
  function ray(event) {
    const rect=container.getBoundingClientRect();
    pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
    raycaster.setFromCamera(pointer,camera);
  }
  listen(container,'pointerdown',(event)=>{
    if (pointerId!==null || (event.pointerType==='mouse' && event.button!==0)) return;
    ray(event);
    const hit=raycaster.intersectObjects(card.meshes)[0];
    if (!hit) return;
    event.preventDefault(); container.focus({preventScroll:true});
    pointerId=event.pointerId;
    plane.constant=-hit.point.z;
    raycaster.ray.intersectPlane(plane,worldPoint);
    offset.copy(worldPoint).sub(card.group.position);
    physics.startDrag(card.group.position);
    container.setPointerCapture(event.pointerId);
    container.classList.add('is-dragging');
    onInteraction('drag');
  });
  listen(container,'pointermove',(event)=>{
    ray(event);
    if (pointerId===event.pointerId) {
      if (raycaster.ray.intersectPlane(plane,worldPoint)) physics.dragTo(worldPoint.sub(offset));
    } else if(pointerId===null) container.classList.toggle('is-hovering',raycaster.intersectObjects(card.meshes).length>0);
  });
  const release=(event)=>{
    if(pointerId!==event.pointerId) return;
    physics.endDrag(); pointerId=null;
    container.classList.remove('is-dragging');
    if(container.hasPointerCapture(event.pointerId)) container.releasePointerCapture(event.pointerId);
    onInteraction('release');
  };
  listen(container,'pointerup',release);
  listen(container,'pointercancel',release);
  listen(container,'lostpointercapture',release);
  listen(container,'pointerleave',()=>container.classList.remove('is-hovering'));
  listen(container,'keydown',(event)=>{
    if(event.key===' ') { event.preventDefault(); if(!reducedMotion) {physics.spin(); onInteraction('spin');} }
    else if(event.key.toLowerCase()==='r') { physics.reset(); onInteraction('reset'); }
    else if(event.key.startsWith('Arrow')) {
      event.preventDefault();
      const p=physics.getCardTransform().position;
      physics.startDrag(p);
      physics.dragTo({x:p.x+(event.key==='ArrowLeft'?-.9:event.key==='ArrowRight'?.9:0),y:p.y+(event.key==='ArrowUp'?.6:event.key==='ArrowDown'?-.6:0),z:p.z});
      // Release after a few simulation frames, so keyboard movement carries momentum.
      clearTimeout(keyRelease); keyRelease=setTimeout(()=>physics.endDrag(),130);
    }
  });
  let keyRelease;
  function resize() {
    const width=container.clientWidth, height=container.clientHeight;
    camera.aspect=width/height;
    // Preserve the object size on narrow screens and leave room for swinging.
    const visibleHeight=Math.max(8.2, 4.2/camera.aspect);
    camera.position.z=visibleHeight/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));
    camera.updateProjectionMatrix();
    renderer.setSize(width,height);
    shadows.resize(width,height,camera);
  }
  const observer=new ResizeObserver(resize); observer.observe(container); resize();
  const draw=(time)=>{
    if(disposed) return;
    const dt=lastTime?Math.min((time-lastTime)/1000,1/30):1/60;
    lastTime=time;
    if(!document.hidden) {
      physics.step(dt);
      const pose=physics.getCardTransform();
      card.group.position.copy(pose.position);
      card.group.quaternion.copy(pose.quaternion);
      const rope=physics.getRopePoints();
      // Keep the fixed attachment outside even unusually tall mobile viewports.
      const top=camera.position.y+camera.position.z*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))+1;
      rope.unshift({x:0,y:Math.max(top,rope[0].y+0.25),z:0});
      strap.update(rope,card.group.quaternion,physics.getTension?.()??0);
      shadows.update(card.group,rope);
      shadows.render(renderer,camera);
      renderer.render(scene,camera);
    }
    frame=requestAnimationFrame(draw);
  };
  frame=requestAnimationFrame(draw);
  return {
    spin:()=>{if(!reducedMotion) {physics.spin();onInteraction('spin');}},
    reset:()=>{physics.reset();onInteraction('reset');},
    setLight:(light)=>{renderer.toneMappingExposure=light?1.22:1.1;shadows.setLight(light);},
    update(next) {
      const old=textures;
      textures=makeTextures(next,renderer);
      card.front.material.map=textures.front; card.back.material.map=textures.back; strap.mesh.material.map=textures.strap;
      old.dispose();
    },
    dispose() {
      disposed=true; cancelAnimationFrame(frame); clearTimeout(keyRelease); observer.disconnect(); listeners.forEach(off=>off());
      scene.traverse(obj=>{obj.geometry?.dispose(); if(obj.material) (Array.isArray(obj.material)?obj.material:[obj.material]).forEach(m=>m.dispose());});
      shadows.dispose(); textures.dispose(); environment.dispose(); physics.dispose(); renderer.dispose(); renderer.domElement.remove();
    },
  };
}
