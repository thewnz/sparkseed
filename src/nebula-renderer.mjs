// Shader passes adapted from the provided star map HTML.
const vertexSource=`#version 300 es
precision highp float;out vec2 vUv;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);vUv=p;gl_Position=vec4(p*2.-1.,0.,1.);}`;
const sceneSource=`#version 300 es
precision highp float;
in vec2 vUv;out vec4 fragColor;
uniform sampler2D uNoise,uBackdrop;uniform vec2 uResolution,uPan,uPointer;uniform float uTime,uZoom,uBrightness,uHasBackdrop,uImageAspect;uniform vec4 uLights[12];uniform int uLightCount;
float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec3 p){vec3 ip=floor(p),f=fract(p);f=f*f*(3.-2.*f);vec2 uv=ip.xy+vec2(37.,17.)*ip.z+f.xy;vec2 n=texture(uNoise,(uv+.5)/256.).rg;return mix(n.x,n.y,f.z);}
float fbm(vec3 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+vec3(13.1,7.7,5.3);a*=.5;}return v;}
vec3 stars(vec2 uv,float scale,float layer){vec2 g=uv*scale,id=floor(g),f=fract(g)-.5;float h=hash21(id+layer*11.2);vec2 pos=(vec2(hash21(id+8.2),hash21(id+23.1))-.5)*.65;vec2 d=f-pos;float r2=dot(d,d);float big=pow(hash21(id+5.4),8.);float core=exp(-r2/(.00020+big*.00055));float halo=.00015/(r2+.002);vec3 tint=mix(vec3(.39,.57,.86),vec3(1.,.82,.52),hash21(id+74.));float blink=.82+.18*sin(uTime*(.14+h*.25)+h*53.);return tint*(core*(.11+big*.8)+halo*big*.17)*step(.962,h)*blink;}
vec3 proceduralNebula(vec2 q){vec3 p=vec3(q*1.48,2.3);p.x+=uTime*.0011;float warp=fbm(p*.86);float axis=q.y-q.x*.47+(warp-.5)*.68;float band=exp(-axis*axis*4.5);float trans=1.;vec3 c=vec3(.0015,.002,.004);for(int i=0;i<7;i++){float z=float(i)*.27;vec3 v=p+vec3(warp*.7,-warp*.4,z);float n=fbm(v*1.65);float detail=fbm(v*4.2+n);float density=smoothstep(.39,.77,n*.68+detail*.4)*band*.31;float shadow=fbm(v*2.+vec3(-.5,.4,.2));vec3 tint=mix(vec3(.26,.085,.28),vec3(.06,.25,.37),smoothstep(-1.,1.2,q.x+q.y*.4));vec3 light=tint*(.17+pow(shadow,3.)*2.5);c+=trans*light*density;trans*=1.-density*.72;}return c;}
void main(){float aspect=uResolution.x/uResolution.y;vec2 q=(vUv-.5)*vec2(aspect,1.)*2.;float bgZoom=1.+(uZoom-1.)*.18;vec2 offset=vec2(uPan.x,-uPan.y);vec2 pointer=vec2(uPointer.x,-uPointer.y);vec2 bg=(q-offset*.24)/bgZoom;vec3 color;float cloudDensity=.25;
if(uHasBackdrop>.5){vec2 cover=vec2(min(1.,aspect/uImageAspect),min(1.,uImageAspect/aspect));vec2 flow=vec2(sin(bg.y*3.7+uTime*.018),cos(bg.x*2.3+uTime*.014))*.0011;vec2 uv=.5+(vUv-.5)*cover*.91/bgZoom-offset*.032+flow;vec3 surface=texture(uBackdrop,uv).rgb;float depth=dot(surface,vec3(.21,.62,.17));uv+=pointer*(.0015+depth*.009);vec3 photo=texture(uBackdrop,uv).rgb;cloudDensity=clamp(dot(photo,vec3(.23,.61,.16))*2.8,0.,1.);color=pow(photo,vec3(2.2))*1.13;
float movingShadow=fbm(vec3(bg*3.2+vec2(uTime*.002,-uTime*.001),2.8));color*=.86+movingShadow*.3;
}else{color=proceduralNebula(bg)*1.25;}
color*=uBrightness;vec2 starUv=(q-offset*1.85-pointer*.003)/uZoom;vec3 st=stars(starUv,137.,1.)*1.15;st+=stars(starUv*.92+1.4,242.,2.)*.71;st+=stars(starUv*.85+3.5,380.,3.)*.44;color+=st;
for(int i=0;i<12;i++){if(i>=uLightCount)break;vec4 light=uLights[i];vec2 d=(vUv-light.xy)*vec2(aspect,1.);float r=length(d);vec3 tint=mix(vec3(.30,.58,1.),vec3(1.,.70,.36),light.w);float core=exp(-r*r*1800000.)*22.;float corona=exp(-r*245.)*.64;float halo=.000011/(r*r+.00008);float horizontal=exp(-abs(d.y)*1900.)*exp(-abs(d.x)*29.);float vertical=exp(-abs(d.x)*2700.)*exp(-abs(d.y)*78.);float diffraction=(horizontal*.24+vertical*.1);float dustScatter=exp(-r*14.)*cloudDensity*.044;color+=(tint*(corona+halo+diffraction+dustScatter)+vec3(1.,.97,.91)*core)*light.z;}
vec2 dustUV=(q-offset*2.4-pointer*.018)*19.;vec2 cell=floor(dustUV),dd=fract(dustUV)-.5;float mote=exp(-dot(dd,dd)*85.)*step(.994,hash21(cell+27.));color+=vec3(.35,.41,.53)*mote*.045;
float phase=mod(uTime+8.,29.);if(phase<1.15){float t=phase/1.15;vec2 head=vec2(.63,.40)+vec2(.34,.16)*t;vec2 d=(vUv-head)*vec2(aspect,1.);vec2 direction=normalize(vec2(.34*aspect,.16));float along=dot(d,direction),across=abs(dot(d,vec2(-direction.y,direction.x)));float trail=exp(-across*1800.)*exp(along*32.)*step(along,0.)*step(-.18,along);color+=vec3(.32,.43,.58)*trail*sin(t*3.14159)*.12;}
fragColor=vec4(max(color,vec3(0.)),1.);}`;
const downsampleSource=`#version 300 es
precision highp float;in vec2 vUv;out vec4 fragColor;uniform sampler2D uImage;uniform vec2 uTexel;uniform float uThreshold;
void main(){vec3 c=vec3(0.);for(int y=0;y<4;y++)for(int x=0;x<4;x++){vec2 delta=(vec2(float(x),float(y))-1.5)*uTexel;c+=texture(uImage,vUv+delta).rgb;}fragColor=vec4(max(c/16.-uThreshold,vec3(0.)),1.);}`;
const blurSource=`#version 300 es
precision highp float;in vec2 vUv;out vec4 fragColor;uniform sampler2D uImage;uniform vec2 uDirection;uniform float uExtract;
vec3 sampleColor(vec2 uv){vec3 c=texture(uImage,uv).rgb;return uExtract>.5?max(c-.15,vec3(0.)):c;}
void main(){vec3 c=sampleColor(vUv)*.227027;c+=sampleColor(vUv+uDirection*1.384615)*.316216;c+=sampleColor(vUv-uDirection*1.384615)*.316216;c+=sampleColor(vUv+uDirection*3.230769)*.070270;c+=sampleColor(vUv-uDirection*3.230769)*.070270;fragColor=vec4(c,1.);}`;
const postSource=`#version 300 es
precision highp float;in vec2 vUv;out vec4 fragColor;uniform sampler2D uScene,uBloom,uBloomWide;uniform float uTime;
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
void main(){vec2 p=vUv-.5;vec2 fringe=p*dot(p,p)*.0011;vec3 color=vec3(texture(uScene,vUv+fringe).r,texture(uScene,vUv).g,texture(uScene,vUv-fringe).b);color+=texture(uBloom,vUv).rgb*.52+texture(uBloomWide,vUv).rgb*.38;color*=1.-dot(p,p)*.40;color=aces(color*1.12);color=pow(color,vec3(1./2.2));float grain=fract(sin(dot(gl_FragCoord.xy+floor(uTime*18.),vec2(12.9898,78.233)))*43758.5453);color+=(grain-.5)*.003;fragColor=vec4(color,1.);}`;

const qualityProfiles = {
  performance: { ratio: .65, maxSide: 1100 },
  balanced: { ratio: 1, maxSide: 1800 },
  cinematic: { ratio: 1.6, maxSide: 2880 },
};

export class NebulaRenderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false });
    if (!gl) throw new Error('WebGL 2 unavailable');
    this.gl = gl;
    this.canvas = canvas;
    this.hdr = Boolean(gl.getExtension('EXT_color_buffer_float'));
    this.width = 0;
    this.height = 0;
    this.targets = [];
    this.programs = [];
    this.textures = [];
    this.imageAspect = 1;
    this.vao = gl.createVertexArray();
    try {
      this.scene = this.makeProgram(sceneSource);
      this.downsample = this.makeProgram(downsampleSource);
      this.blur = this.makeProgram(blurSource);
      this.post = this.makeProgram(postSource);
      this.noise = this.makeNoise();
      this.backdrop = this.makeTexture(gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([2, 3, 7, 255]));
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  makeProgram(fragmentSource) {
    const gl = this.gl;
    const shaders = [];
    const program = gl.createProgram();
    this.programs.push(program);
    try {
      for (const [kind, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]]) {
        const shader = gl.createShader(kind);
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
        gl.attachShader(program, shader);
      }
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      const uniforms = {};
      for (let index = 0; index < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); index++) {
        const { name } = gl.getActiveUniform(program, index);
        uniforms[name] = gl.getUniformLocation(program, name);
      }
      return { program, uniforms };
    } finally {
      for (const shader of shaders) gl.deleteShader(shader);
    }
  }

  configureTexture(wrap) {
    const gl = this.gl;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  }

  makeTexture(wrap) {
    const gl = this.gl;
    const texture = gl.createTexture();
    this.textures.push(texture);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    this.configureTexture(wrap);
    return texture;
  }

  makeNoise() {
    const gl = this.gl;
    const noise = new Uint8Array(256 * 256);
    const channels = new Uint8Array(noise.length * 2);
    let seed = 81473;
    for (let index = 0; index < noise.length; index++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      noise[index] = seed >>> 24;
    }
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const index = y * 256 + x;
        channels[index * 2] = noise[index];
        channels[index * 2 + 1] = noise[((y + 17) % 256) * 256 + (x + 37) % 256];
      }
    }
    const texture = this.makeTexture(gl.REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, 256, 256, 0, gl.RG, gl.UNSIGNED_BYTE, channels);
    return texture;
  }

  loadBackdrop(image) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.backdrop);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image); }
    finally { gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); }
    this.imageAspect = image.naturalWidth / image.naturalHeight;
    this.hasBackdrop = true;
  }

  makeTarget(width, height) {
    const gl = this.gl;
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, this.hdr ? gl.RGBA16F : gl.RGBA8, width, height, 0,
      gl.RGBA, this.hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    this.configureTexture(gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const target = { texture, framebuffer, width, height };
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      this.deleteTarget(target);
      throw new Error('Framebuffer allocation failed');
    }
    return target;
  }

  deleteTarget(target) {
    this.gl.deleteTexture(target.texture);
    this.gl.deleteFramebuffer(target.framebuffer);
  }

  resize(cssWidth, cssHeight, quality) {
    const profile = qualityProfiles[quality];
    const ratio = Math.min(quality === 'cinematic' ? Math.max(devicePixelRatio, 1.5) : devicePixelRatio,
      profile.ratio, profile.maxSide / Math.max(cssWidth, cssHeight));
    const width = Math.max(1, Math.round(cssWidth * ratio));
    const height = Math.max(1, Math.round(cssHeight * ratio));
    if (width === this.width && height === this.height) return;
    const next = [];
    try {
      for (const divisor of [1, 4, 4, 12, 12]) {
        next.push(this.makeTarget(Math.max(1, Math.round(width / divisor)), Math.max(1, Math.round(height / divisor))));
      }
    } catch (error) {
      for (const target of next) this.deleteTarget(target);
      if (!this.hdr) throw error;
      this.hdr = false;
      this.resize(cssWidth, cssHeight, quality);
      return;
    }
    for (const target of this.targets) this.deleteTarget(target);
    this.targets = next;
    this.canvas.width = this.width = width;
    this.canvas.height = this.height = height;
  }

  texture(unit, texture) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
  }

  useTarget(target) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target?.framebuffer || null);
    gl.viewport(0, 0, target?.width || this.width, target?.height || this.height);
  }

  bloom(source, first, second, threshold) {
    const gl = this.gl;
    gl.useProgram(this.downsample.program);
    this.useTarget(first);
    this.texture(0, source.texture);
    const downsample = this.downsample.uniforms;
    gl.uniform1i(downsample.uImage, 0);
    gl.uniform2f(downsample.uTexel, 1 / source.width, 1 / source.height);
    gl.uniform1f(downsample.uThreshold, threshold);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.useProgram(this.blur.program);
    const blur = this.blur.uniforms;
    gl.uniform1i(blur.uImage, 0);
    gl.uniform1f(blur.uExtract, 0);
    for (let pass = 0; pass < 4; pass++) {
      const horizontal = pass % 2 === 0;
      this.useTarget(horizontal ? second : first);
      this.texture(0, (horizontal ? first : second).texture);
      gl.uniform2f(blur.uDirection, horizontal ? 1 / first.width : 0, horizontal ? 0 : 1 / first.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }

  draw(frame) {
    if (!this.targets.length) return;
    const gl = this.gl;
    const [scene, near, nearBuffer, far, farBuffer] = this.targets;
    gl.bindVertexArray(this.vao);
    gl.useProgram(this.scene.program);
    this.useTarget(scene);
    this.texture(0, this.noise);
    this.texture(1, this.backdrop);
    const uniforms = this.scene.uniforms;
    gl.uniform1i(uniforms.uNoise, 0);
    gl.uniform1i(uniforms.uBackdrop, 1);
    gl.uniform2f(uniforms.uResolution, this.width, this.height);
    gl.uniform2f(uniforms.uPan, frame.panX, frame.panY);
    gl.uniform1f(uniforms.uZoom, frame.zoom);
    gl.uniform1f(uniforms.uTime, frame.time);
    gl.uniform1f(uniforms.uBrightness, frame.brightness);
    gl.uniform1f(uniforms.uHasBackdrop, this.hasBackdrop ? 1 : 0);
    gl.uniform1f(uniforms.uImageAspect, this.imageAspect);
    gl.uniform2f(uniforms.uPointer, frame.pointerX, frame.pointerY);
    gl.uniform1i(uniforms.uLightCount, frame.lightCount);
    gl.uniform4fv(uniforms['uLights[0]'], frame.lights);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    this.bloom(scene, near, nearBuffer, .15);
    this.bloom(near, far, farBuffer, 0);
    gl.useProgram(this.post.program);
    this.useTarget(null);
    this.texture(0, scene.texture);
    this.texture(1, near.texture);
    this.texture(2, far.texture);
    const post = this.post.uniforms;
    gl.uniform1i(post.uScene, 0);
    gl.uniform1i(post.uBloom, 1);
    gl.uniform1i(post.uBloomWide, 2);
    gl.uniform1f(post.uTime, frame.time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose() {
    const gl = this.gl;
    for (const target of this.targets) this.deleteTarget(target);
    for (const texture of this.textures) gl.deleteTexture(texture);
    for (const program of this.programs) gl.deleteProgram(program);
    gl.deleteVertexArray(this.vao);
    this.targets = [];
  }
}

