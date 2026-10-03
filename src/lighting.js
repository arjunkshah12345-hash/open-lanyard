import * as THREE from 'three';

// Real shadow rays against simplified badge/hardware geometry. This is a
// direct-light shadow renderer, not a multi-bounce path tracer. Using analytic
// intersections avoids rebuilding a BVH for the moving badge and fabric.
export function createTracedShadows({ mobile = false } = {}) {
  const samples = mobile ? 10 : 20;
  const ropeCount = 12;
  const material = new THREE.ShaderMaterial({
    blending:THREE.NoBlending,
    depthWrite:false,
    toneMapped:false,
    uniforms:{
      inverseCard:{value:new THREE.Matrix4()},
      lightCenter:{value:new THREE.Vector3(-3.5,7,6)},
      lightSize:{value:new THREE.Vector2(1.1,1.5)},
      ropePoints:{value:Array.from({length:ropeCount},()=>new THREE.Vector3(0,20,0))},
      shadowOpacity:{value:0.24},
    },
    vertexShader:`
      varying vec3 worldPoint;
      void main() {
        vec4 world=modelMatrix*vec4(position,1.0);
        worldPoint=world.xyz;
        gl_Position=projectionMatrix*viewMatrix*world;
      }
    `,
    fragmentShader:`
      precision highp float;
      varying vec3 worldPoint;
      uniform mat4 inverseCard;
      uniform vec3 lightCenter;
      uniform vec2 lightSize;
      uniform vec3 ropePoints[${ropeCount}];
      uniform float shadowOpacity;

      float boxHit(vec3 origin,vec3 direction,vec3 center,vec3 halfSize) {
        vec3 safeDirection=mix(vec3(0.00001),direction,step(vec3(0.00001),abs(direction)));
        vec3 t0=(center-halfSize-origin)/safeDirection;
        vec3 t1=(center+halfSize-origin)/safeDirection;
        vec3 nearT=min(t0,t1),farT=max(t0,t1);
        float entry=max(max(nearT.x,nearT.y),nearT.z);
        float leave=min(min(farT.x,farT.y),farT.z);
        return leave>=max(entry,0.0)&&entry<1.0?max(entry,0.0):-1.0;
      }

      float cardOcclusion(vec3 origin,vec3 direction) {
        vec3 o=(inverseCard*vec4(origin,1.0)).xyz;
        vec3 d=(inverseCard*vec4(direction,0.0)).xyz;
        float t=boxHit(o,d,vec3(0.0),vec3(1.26,1.785,0.06));
        if(t>=0.0) {
          vec2 p=abs((o+d*t).xy)-vec2(1.12,1.645);
          if(length(max(p,vec2(0.0)))<0.145) return 1.0;
        }
        return boxHit(o,d,vec3(0.0,1.94,0.0),vec3(0.17,0.25,0.07))>=0.0?1.0:0.0;
      }

      // Capsule occlusion for each short strap segment; endpoints come from
      // the same interpolated physical curve that drives the woven ribbon.
      float strapOcclusion(vec3 origin,vec3 direction) {
        float dd=dot(direction,direction);
        for(int j=0;j<${ropeCount-1};j++) {
          vec3 a=ropePoints[j];
          vec3 segment=ropePoints[j+1]-a;
          vec3 relative=origin-a;
          float ss=dot(segment,segment),ds=dot(direction,segment);
          float denominator=max(dd*ss-ds*ds,0.00001);
          float t=clamp((ds*dot(segment,relative)-ss*dot(direction,relative))/denominator,0.0,1.0);
          float u=clamp(dot(origin+direction*t-a,segment)/max(ss,0.00001),0.0,1.0);
          t=clamp(dot(a+segment*u-origin,direction)/max(dd,0.00001),0.0,1.0);
          if(distance(origin+direction*t,a+segment*u)<0.105) return 1.0;
        }
        return 0.0;
      }

      void main() {
        float occluded=0.0;
        // Fixed low-discrepancy area-light samples: no temporal grain or shimmer.
        for(int i=0;i<${samples};i++) {
          float f=float(i)+0.5;
          float radius=sqrt(f/float(${samples}));
          float angle=f*2.39996323;
          vec3 light=lightCenter+vec3(cos(angle)*radius*lightSize.x,sin(angle)*radius*lightSize.y,0.0);
          vec3 direction=light-worldPoint;
          float hit=cardOcclusion(worldPoint,direction);
          occluded+=hit;
        }
        float fabric=0.0;
        for(int i=0;i<7;i++) {
          float f=float(i)+0.5;
          float radius=sqrt(f/7.0);
          float angle=f*2.39996323;
          vec3 light=lightCenter+vec3(cos(angle)*radius*lightSize.x,sin(angle)*radius*lightSize.y,0.0);
          fabric+=strapOcclusion(worldPoint,light-worldPoint)/7.0;
        }
        float alpha=max(occluded/float(${samples}),fabric)*shadowOpacity;
        gl_FragColor=vec4(vec3(0.0),alpha);
      }
    `,
  });
  const tracedPlane=new THREE.Mesh(new THREE.PlaneGeometry(36,36),material);
  tracedPlane.position.z=-0.8;
  const shadowScene=new THREE.Scene();
  shadowScene.add(tracedPlane);
  // Trace at half resolution, then spatially reconstruct the area-light samples
  // with a separable Gaussian. Filtering alpha avoids dark premultiplied edges.
  const makeTarget=()=>new THREE.WebGLRenderTarget(512,512,{depthBuffer:false,stencilBuffer:false});
  const target=makeTarget(),horizontal=makeTarget(),softened=makeTarget();
  const blurMaterial=new THREE.ShaderMaterial({
    depthWrite:false,depthTest:false,toneMapped:false,
    uniforms:{source:{value:target.texture},direction:{value:new THREE.Vector2()}},
    vertexShader:`
      varying vec2 vUv;
      void main() {vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}
    `,
    fragmentShader:`
      varying vec2 vUv;
      uniform sampler2D source;
      uniform vec2 direction;
      void main() {
        float alpha=texture2D(source,vUv).a*0.227027;
        alpha+=texture2D(source,vUv+direction*1.384615).a*0.316216;
        alpha+=texture2D(source,vUv-direction*1.384615).a*0.316216;
        alpha+=texture2D(source,vUv+direction*3.230769).a*0.070270;
        alpha+=texture2D(source,vUv-direction*3.230769).a*0.070270;
        gl_FragColor=vec4(vec3(0.0),alpha);
      }
    `,
  });
  const blurScene=new THREE.Scene();
  const blurQuad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),blurMaterial);
  blurQuad.frustumCulled=false;
  blurScene.add(blurQuad);
  const blurCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({
    map:softened.texture,transparent:true,depthWrite:false,toneMapped:false,
  }));
  mesh.position.z=-0.8;
  mesh.renderOrder=-1;
  const curve=new THREE.CatmullRomCurve3([],false,'centripetal');
  return {
    mesh,
    resize(width,height,camera) {
      const scale=Math.min(0.5,(mobile?460:760)/width);
      for(const buffer of [target,horizontal,softened]) {
        buffer.setSize(Math.max(1,Math.ceil(width*scale)),Math.max(1,Math.ceil(height*scale)));
      }
      const heightWorld=2*(camera.position.z-mesh.position.z)*Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
      mesh.scale.set(heightWorld*camera.aspect,heightWorld,1);
      mesh.position.x=camera.position.x;
      mesh.position.y=camera.position.y;
    },
    render(renderer,camera) {
      const previousTarget=renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.render(shadowScene,camera);
      blurMaterial.uniforms.source.value=target.texture;
      blurMaterial.uniforms.direction.value.set(2.4/target.width,0);
      renderer.setRenderTarget(horizontal);
      renderer.render(blurScene,blurCamera);
      blurMaterial.uniforms.source.value=horizontal.texture;
      blurMaterial.uniforms.direction.value.set(0,2.4/target.height);
      renderer.setRenderTarget(softened);
      renderer.render(blurScene,blurCamera);
      renderer.setRenderTarget(previousTarget);
    },
    update(card,points) {
      card.updateMatrixWorld(true);
      material.uniforms.inverseCard.value.copy(card.matrixWorld).invert();
      curve.points=points.map(p=>new THREE.Vector3(p.x,p.y,p.z));
      for(let i=0;i<ropeCount;i++) curve.getPoint(i/(ropeCount-1),material.uniforms.ropePoints.value[i]);
    },
    setLight(light) {material.uniforms.shadowOpacity.value=light?0.24:0.4;},
    dispose() {
      for(const buffer of [target,horizontal,softened]) buffer.dispose();
      tracedPlane.geometry.dispose();material.dispose();
      blurQuad.geometry.dispose();blurMaterial.dispose();
    },
  };
}
