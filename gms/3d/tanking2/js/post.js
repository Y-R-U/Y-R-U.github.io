import * as THREE from "../vendor/three.module.js";

// Compact photograph finish: contact shading, a restrained lens glow, and a
// depth-aware lens in photo mode. No external composer or fullscreen libraries.
export class AquariumPost {
  constructor(renderer, camera) {
    this.renderer = renderer;
    this.camera = camera;
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: renderer.extensions.has("EXT_color_buffer_float")
        ? THREE.HalfFloatType
        : THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      samples: renderer.capabilities.isWebGL2 ? 2 : 0,
    });
    this.target.depthTexture = new THREE.DepthTexture(
      1,
      1,
      THREE.UnsignedIntType,
    );
    this.uniforms = {
      tColor: { value: this.target.texture },
      tDepth: { value: this.target.depthTexture },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uNear: { value: camera.near },
      uFar: { value: camera.far },
      uFocus: { value: 16 },
      uPhoto: { value: 0 },
      uExposure: { value: 1 },
    };
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
    );
    geometry.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2),
    );
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      vertexShader:
        "varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position,1.);}",
      fragmentShader: `
      varying vec2 vUv;uniform sampler2D tColor;uniform sampler2D tDepth;
      uniform vec2 uResolution;uniform float uNear,uFar,uFocus,uPhoto,uExposure;
      float depthAt(vec2 uv){float d=texture2D(tDepth,uv).x;return uNear*uFar/(uFar-d*(uFar-uNear));}
      vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
      void main(){
        vec2 pixel=1./uResolution;float depth=depthAt(vUv);vec3 sharp=texture2D(tColor,vUv).rgb;
        vec3 blur=sharp*2.,glow=vec3(0.);float ao=0.;float radius=clamp(abs(depth-uFocus)*.8,0.,5.)*uPhoto;
        for(int i=0;i<8;i++){
          float a=float(i)*.785398;vec2 dir=vec2(cos(a),sin(a));
          vec2 uv=vUv+dir*pixel*3.5;float other=depthAt(uv);
          float delta=depth-other;ao+=smoothstep(.018,.16,delta)*(1.-smoothstep(.20,1.4,delta));
          blur+=texture2D(tColor,vUv+dir*pixel*radius).rgb;
          vec3 g=texture2D(tColor,vUv+dir*pixel*4.5).rgb;glow+=max(vec3(0.),g-vec3(1.25));
        }
        vec3 c=mix(sharp,blur*.1,uPhoto*.85);c*=1.-ao*.026;c+=glow*.012;
        c=aces(c*uExposure);
        float vig=1.-smoothstep(.25,.88,length((vUv-.5)*vec2(.95,1.)))*.21;
        c*=vig;c=mix(vec3(dot(c,vec3(.2126,.7152,.0722))),c,1.045);
        c=mix(12.92*c,1.055*pow(max(c,vec3(0.)),vec3(1./2.4))-.055,step(vec3(.0031308),c));
        gl_FragColor=vec4(c,1.);
      }`,
    });
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.Mesh(geometry, this.material));
    this.screenCamera = new THREE.Camera();
  }
  resize(w, h) {
    this.target.setSize(w, h);
    this.uniforms.uResolution.value.set(w, h);
  }
  render(scene, photo, focus) {
    this.uniforms.uPhoto.value = photo ? 1 : 0;
    this.uniforms.uFocus.value = focus;
    this.uniforms.uExposure.value = photo ? 1.05 : 1;
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, this.camera);
    const metrics = {
      drawCalls: this.renderer.info.render.calls + 1,
      triangles: this.renderer.info.render.triangles + 1,
    };
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.screenCamera);
    return metrics;
  }
  dispose() {
    this.target.dispose();
    this.material.dispose();
    this.scene.children[0].geometry.dispose();
  }
}
