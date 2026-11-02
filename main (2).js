import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// ============ Cheap glow (replaces the heavy UnrealBloom): the bright parts are shrunk to 1/4 and 1/8 size, blurred there, and added in the final grading pass ============
// Only small textures are touched (about 1/16 and 1/64 of the screen), so it costs a fraction of the old bloom, and the neon keeps its glow on weak phones too.
class CheapGlow extends Pass {
  constructor(w, h) {
    super();
    this.needsSwap = false;
    this._en = true; this.u = null; this.k = [0.55, 0.75];
    this.fsq = new FullScreenQuad(null);
    const mk = () => new THREE.WebGLRenderTarget(8, 8, { type: THREE.UnsignedByteType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.A = mk(); this.B = mk(); this.C = mk(); this.D = mk();
    const vs = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    this.mBright = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: vs, depthTest: false, depthWrite: false,
      fragmentShader: `uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
        void main(){
          vec3 s = (texture2D(tSrc, vUv + vec2(-1.0,-1.0) * uTexel).rgb + texture2D(tSrc, vUv + vec2(1.0,-1.0) * uTexel).rgb
                  + texture2D(tSrc, vUv + vec2(-1.0, 1.0) * uTexel).rgb + texture2D(tSrc, vUv + vec2(1.0, 1.0) * uTexel).rgb) * 0.25;
          float m = max(s.r, max(s.g, s.b));
          float k = smoothstep(0.80, 0.98, m);
          gl_FragColor = vec4(s * k, 1.0);
        }`
    });
    this.mDown = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: vs, depthTest: false, depthWrite: false,
      fragmentShader: `uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
        void main(){
          vec3 s = (texture2D(tSrc, vUv + vec2(-0.5,-0.5) * uTexel).rgb + texture2D(tSrc, vUv + vec2(0.5,-0.5) * uTexel).rgb
                  + texture2D(tSrc, vUv + vec2(-0.5, 0.5) * uTexel).rgb + texture2D(tSrc, vUv + vec2(0.5, 0.5) * uTexel).rgb) * 0.25;
          gl_FragColor = vec4(s, 1.0);
        }`
    });
    this.mBlur = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uStep: { value: new THREE.Vector2() } },
      vertexShader: vs, depthTest: false, depthWrite: false,
      fragmentShader: `uniform sampler2D tSrc; uniform vec2 uStep; varying vec2 vUv;
        void main(){
          vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270270;
          c += (texture2D(tSrc, vUv + uStep * 1.3846153846).rgb + texture2D(tSrc, vUv - uStep * 1.3846153846).rgb) * 0.3162162162;
          c += (texture2D(tSrc, vUv + uStep * 3.2307692308).rgb + texture2D(tSrc, vUv - uStep * 3.2307692308).rgb) * 0.0702702703;
          gl_FragColor = vec4(c, 1.0);
        }`
    });
    this.setSize(w, h);
  }
  get enabled() { return this._en; }
  set enabled(v) { this._en = v; if (this.u) this.u.uGlow.value.set(v ? this.k[0] : 0, v ? this.k[1] : 0); }
  setSize(w, h) {
    const aw = Math.max(16, Math.round(w / 2)), ah = Math.max(16, Math.round(h / 2));
    const cw = Math.max(8, Math.round(aw / 2)), ch = Math.max(8, Math.round(ah / 2));
    this.A.setSize(aw, ah); this.B.setSize(aw, ah); this.C.setSize(cw, ch); this.D.setSize(cw, ch);
  }
  attach(uniforms) { this.u = uniforms; uniforms.tGlow.value = this.A.texture; uniforms.tGlow2.value = this.C.texture; this.enabled = this._en; }
  _pass(renderer, mat, src, dst) {
    this.fsq.material = mat; mat.uniforms.tSrc.value = src.texture;
    if (mat.uniforms.uTexel) mat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
    renderer.setRenderTarget(dst); this.fsq.render(renderer);
  }
  render(renderer, writeBuffer, readBuffer) {
    const A = this.A, B = this.B, C = this.C, D = this.D;
    this._pass(renderer, this.mBright, readBuffer, A);
    this.mBlur.uniforms.uStep.value.set(1 / A.width, 0); this._pass(renderer, this.mBlur, A, B);
    this.mBlur.uniforms.uStep.value.set(0, 1 / A.height); this._pass(renderer, this.mBlur, B, A);
    this._pass(renderer, this.mDown, A, C);
    this.mBlur.uniforms.uStep.value.set(1 / C.width, 0); this._pass(renderer, this.mBlur, C, D);
    this.mBlur.uniforms.uStep.value.set(0, 1 / C.height); this._pass(renderer, this.mBlur, D, C);
  }
  dispose() { [this.A, this.B, this.C, this.D].forEach(t => t.dispose()); [this.mBright, this.mDown, this.mBlur].forEach(m => m.dispose()); this.fsq.dispose(); }
}


/* ==================== STAR COURIER (space combat) ====================
   Free flight, lasers + missiles, pirate fighters, target lock, radar, stations with missions and upgrades.
   Light on purpose: instanced asteroids / bolts / loot, merged-geometry enemies, shader dust, no post-processing. */

const $ = (id) => document.getElementById(id);
const BUILD = 5;

// ---------- save ----------
const SAVE_KEY = 'starCourier2';
let save = { credits: 100, up: [0, 0, 0, 0], missiles: 4, kills: 0, inv: false, snd: true };
try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && Array.isArray(s.up)) save = Object.assign(save, s); } catch (e) { }
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { } };

const UPG = [
  { name: 'LASERS', desc: 'More damage per shot', max: 6 },
  { name: 'SHIELD', desc: 'Bigger, faster-recharging shield', max: 6 },
  { name: 'ARMOUR', desc: 'Stronger hull', max: 6 },
  { name: 'ENGINE', desc: 'Higher cruise and boost speed', max: 6 },
];
const upCost = (i) => Math.round(80 * Math.pow(1.7, save.up[i]));
const stats = () => ({
  dmg: 11 * (1 + 0.28 * save.up[0]),
  shieldMax: 70 + 30 * save.up[1], shieldRegen: 7 + 2 * save.up[1],
  hullMax: 90 + 30 * save.up[2],
  cruise: 92 * (1 + 0.07 * save.up[3]),
});
let ST = stats();

// ---------- renderer / scene ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
let PR_MAX = Math.min(window.devicePixelRatio || 1, 2), pr = PR_MAX; const PR_MIN = 0.6;
renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15; renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02030a);
scene.fog = new THREE.FogExp2(0x02030a, 0.0030);
const camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.5, 7000);
scene.add(camera);
// same render pipeline as the racing game: 4x MSAA 8-bit target, cheap glow (bloom), colour grade
const MSAA_SAMPLES = (() => {
  try { const gl = renderer.getContext(); if (!renderer.capabilities.isWebGL2 || !gl.getInternalformatParameter) return 0; const list = gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA8, gl.SAMPLES); for (let i = 0; i < list.length; i++) if (list[i] <= 4 && list[i] >= 2) return list[i]; } catch (e) { }
  return 0;
})();
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.UnsignedByteType, samples: MSAA_SAMPLES }));
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new CheapGlow(innerWidth / 2, innerHeight / 2);
composer.addPass(bloomPass);
  const gradePass = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, tGlow: { value: null }, tGlow2: { value: null }, uGlow: { value: new THREE.Vector2(0, 0) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform sampler2D tGlow; uniform sampler2D tGlow2; uniform vec2 uGlow; varying vec2 vUv;
      float hh(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec3 c = texture2D(tDiffuse, vUv).rgb + texture2D(tGlow, vUv).rgb * uGlow.x + texture2D(tGlow2, vUv).rgb * uGlow.y;
        c = pow(max(c, vec3(0.0)), vec3(0.92));
        float g = dot(c, vec3(0.299, 0.587, 0.114));
        c = mix(vec3(g), c, 1.10);
        float shd = 1.0 - smoothstep(0.0, 0.5, g);
        float hil = smoothstep(0.45, 1.0, g);
        c += vec3(-0.010, 0.006, 0.022) * shd;
        c += vec3(0.030, 0.014, -0.020) * hil;
        vec3 ov = max(c - vec3(0.8), vec3(0.0));
        c = min(c, vec3(0.8)) + vec3(0.2) * (vec3(1.0) - exp(-ov / 0.2));
        c = clamp(c, 0.0, 1.0);
        c = mix(c, c * c * (3.0 - 2.0 * c), 0.30);
        c *= vec3(1.03, 1.01, 0.97);
        vec2 q = vUv - 0.5;
        float vig = 1.0 - smoothstep(0.35, 1.0, length(q * vec2(1.0, 1.1)) * 1.35);
        c *= mix(0.80, 1.0, vig);
        c += (hh(gl_FragCoord.xy) - 0.5) / 160.0;
        gl_FragColor = vec4(c, 1.0);
      }`
  });
composer.addPass(gradePass);
bloomPass.attach(gradePass.uniforms);
function applyPR() { renderer.setPixelRatio(pr); composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight); renderer.setSize(innerWidth, innerHeight, false); }
applyPR();
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); applyPR(); });
const sun = new THREE.DirectionalLight(0xfff0d8, 2.6); sun.position.set(0.72, 0.677, -0.148); scene.add(sun);
scene.add(new THREE.HemisphereLight(0x6f86c8, 0x1a1420, 0.9));

// ---------- helpers ----------
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = THREE.MathUtils.clamp, damp = THREE.MathUtils.damp;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const _a = V3(), _b = V3(), _c = V3(), _d = V3(), X = V3(1, 0, 0), Y = V3(0, 1, 0), Z = V3(0, 0, 1), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _m = new THREE.Matrix4(), _zero = V3();
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
const glowTex = canvasTex(64, 64, (x) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); });
function glowSprite(color, size, opacity) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: opacity == null ? 1 : opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
  s.scale.set(size, size, 1); return s;
}
const fwdOf = (q, out) => out.set(0, 0, -1).applyQuaternion(q);

// ---------- sky (the racing game's space: stars, nebula, ringed planet, blue planet, sun) - painted once, rides with the camera ----------
const sky = new THREE.Group(); scene.add(sky);
const skyS = new THREE.Group(); skyS.scale.setScalar(6); sky.add(skyS);      // everything is ~2.5 km away so stations and asteroids always draw in front
  const SUN_DIR = new THREE.Vector3(0.72, 0.677, -0.148).normalize();
  const BAND_N = new THREE.Vector3(0.35, 0.8, -0.5).normalize();     // the plane of the milky way
  const spaceStars = (() => {
    const n = 3000, p = new Float32Array(n * 3), c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      let u, a, r;
      if (i < 1800) { u = Math.random() * 2 - 1; a = Math.random() * Math.PI * 2; r = Math.sqrt(1 - u * u); }
      else {                                                            // 1200 stars squeezed towards the milky-way band
        const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
        v.addScaledVector(BAND_N, -v.dot(BAND_N) * 0.88).normalize();
        u = v.y; a = Math.atan2(v.z, v.x); r = Math.sqrt(1 - u * u);
      }
      p[i * 3] = Math.cos(a) * r * 480; p[i * 3 + 1] = u * 480; p[i * 3 + 2] = Math.sin(a) * r * 480;
      const t = Math.random(), k = 0.45 + Math.random() * 0.55;
      c[i * 3] = k * (t < 0.2 ? 1.0 : 0.85); c[i * 3 + 1] = k * (t < 0.2 ? 0.85 : 0.92); c[i * 3 + 2] = k * (t < 0.5 ? 1.0 : 0.8);
    }
    const sz = new Float32Array(n);
    for (let i = 0; i < n; i++) sz[i] = 1.1 + Math.pow(Math.random(), 3) * 2.4;      // mostly small, a few bright big ones
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('aCol', new THREE.BufferAttribute(c, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
    const pts = new THREE.Points(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uPR: { value: Math.min(window.devicePixelRatio, 2) } },
      vertexShader: 'attribute vec3 aCol; attribute float aSize; uniform float uPR; varying vec3 vC; void main(){ vC = aCol; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uPR; }',
      fragmentShader: 'varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vC, smoothstep(0.5, 0.12, d)); }'
    }));
    pts.frustumCulled = false;
    skyS.add(pts);
    return pts;
  })();
  const planetDir = new THREE.Vector3(-0.38, 0.20, -0.9).normalize(), moonDir = new THREE.Vector3(0.62, 0.34, 0.71).normalize();
  const spacePlanet = (() => {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
    const x = cv.getContext('2d');
    const bands = ['#c9783c', '#e8b074', '#a8552e', '#f0d2a0', '#b9663a', '#7a3d28', '#dba06a', '#e9c48e'];
    for (let y = 0; y < 128; y += 4) { x.fillStyle = bands[(y / 4 + (y > 60 ? 3 : 0)) % bands.length]; x.fillRect(0, y, 256, 4); }
    for (let k = 0; k < 900; k++) { x.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '255,235,200' : '90,40,20') + ',0.10)'; x.fillRect(Math.random() * 256, Math.random() * 128, 10 + Math.random() * 30, 1 + Math.random() * 3); }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.SphereGeometry(95, 32, 16), new THREE.MeshLambertMaterial({ map: tex, fog: false }));
    m.rotation.z = 0.35;
    skyS.add(m);
    return m;
  })();
  const spaceMoon = (() => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(22, 20, 12), new THREE.MeshLambertMaterial({ color: 0xb9bcc4, fog: false }));
    skyS.add(m);
    return m;
  })();
  const spaceSun = (() => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(16, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.96, 0.82), fog: false, toneMapped: false }));
    skyS.add(m);
    return m;
  })();
  // ---- nebula: soft coloured gas clouds, dark dust lanes and a faint milky-way band, painted ONCE into a small texture (no per-frame cost) ----
  const spaceNebula = (() => {
    const W = 512, H = 256, data = new Uint8ClampedArray(W * H * 4);
    const hs = (x, y, z) => { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); };
    const vn3 = (x, y, z) => {
      const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
      let fx = x - ix, fy = y - iy, fz = z - iz; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
      const a = hs(ix, iy, iz), b = hs(ix + 1, iy, iz), c = hs(ix, iy + 1, iz), d = hs(ix + 1, iy + 1, iz);
      const e = hs(ix, iy, iz + 1), f = hs(ix + 1, iy, iz + 1), g = hs(ix, iy + 1, iz + 1), h = hs(ix + 1, iy + 1, iz + 1);
      return (a + (b - a) * fx) * (1 - fy) * (1 - fz) + (c + (d - c) * fx) * fy * (1 - fz) + (e + (f - e) * fx) * (1 - fy) * fz + (g + (h - g) * fx) * fy * fz;
    };
    const fbm = (x, y, z, o) => { let t = 0, am = 0.5; for (let i = 0; i < o; i++) { t += am * vn3(x, y, z); x *= 2.03; y *= 2.03; z *= 2.03; am *= 0.5; } return t; };
    const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const PUR = [0.62, 0.16, 0.86], TEAL = [0.08, 0.62, 0.92], WARM = [0.95, 0.40, 0.18], BASE = [0.012, 0.016, 0.045];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const lon = x / W * Math.PI * 2, lat = (0.5 - y / H) * Math.PI;
      const dx = Math.cos(lat) * Math.cos(lon), dy = Math.sin(lat), dz = Math.cos(lat) * Math.sin(lon);
      const dens = fbm(dx * 1.7 + 5.3, dy * 1.7 + 1.7, dz * 1.7 + 9.1, 5) + 0.06 * Math.cos(lat) * Math.cos(lat);   // a bit more gas around the horizon, where you look while racing
      const cloud = ss(0.46, 0.78, dens);
      const t1 = ss(0.35, 0.65, fbm(dx * 0.9 + 2.2, dy * 0.9 + 7.7, dz * 0.9 + 4.4, 2));
      const t2 = ss(0.58, 0.72, fbm(dx * 1.3 + 8.8, dy * 1.3 + 3.3, dz * 1.3 + 6.6, 2));
      const dust = ss(0.52, 0.78, fbm(dx * 3.1 + 11.1, dy * 3.1 + 5.5, dz * 3.1 + 1.3, 4));
      const bd = dx * BAND_N.x + dy * BAND_N.y + dz * BAND_N.z;
      const band = Math.exp(-(bd / 0.20) * (bd / 0.20)) * (0.45 + 0.9 * fbm(dx * 4 + 3, dy * 4 + 9, dz * 4 + 5, 3));
      const k = 0.62 * cloud * (1 - 0.55 * dust) * (1 + 0.8 * band);
      const o = (y * W + x) * 4, nz = (Math.random() - 0.5) / 255;
      for (let ch = 0; ch < 3; ch++) {
        let col = PUR[ch] + (TEAL[ch] - PUR[ch]) * t1;
        col += (WARM[ch] - col) * t2 * 0.75;
        let v = BASE[ch] + col * k + (0.52 + 0.3 * ch * 0.4) * band * 0.16 * (1 - 0.5 * dust) + nz;
        data[o + ch] = Math.max(0, Math.min(255, v * 255));
      }
      data[o + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
    tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false; tex.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.SphereGeometry(465, 32, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }));
    m.renderOrder = -100; m.frustumCulled = false;
    skyS.add(m);
    return m;
  })();
  // glowing atmosphere shell (fresnel rim) for planets
  function planetAtmosphere(radius, color, power) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { c: { value: new THREE.Color(color[0], color[1], color[2]) }, pw: { value: power } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 c; uniform float pw; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), pw); gl_FragColor = vec4(c * f, 1.0); }'
    }));
    skyS.add(m);
    return m;
  }
  const planetAtm = planetAtmosphere(95 * 1.09, [1.0, 0.55, 0.26], 2.6);
  // rings around the big planet (concentric bands painted into a texture)
  const planetRing = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const x = cv.getContext('2d');
    for (let r = 128; r > 0; r -= 1.5) {
      const t = r / 128, inRing = t > 0.62 && t < 0.99;
      const a = inRing ? 0.25 + 0.55 * Math.abs(Math.sin(r * 0.55) * Math.cos(r * 0.17)) : 0;
      x.strokeStyle = 'rgba(' + (225 - (r % 7) * 6) + ',' + (190 - (r % 5) * 6) + ',' + (150 - (r % 9) * 4) + ',' + (t > 0.78 && t < 0.82 ? 0.05 : a) + ')';
      x.lineWidth = 1.7; x.beginPath(); x.arc(128, 128, r, 0, Math.PI * 2); x.stroke();
    }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(95 * 4.1, 95 * 4.1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false, opacity: 0.85 }));
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), planetDir.clone().negate());
    m.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1.12));
    m.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.35));
    skyS.add(m);
    return m;
  })();
  // a second, smaller blue planet with clouds
  const bluePlanetDir = new THREE.Vector3(0.9, 0.18, -0.45).normalize();
  const bluePlanet = (() => {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
    const x = cv.getContext('2d');
    x.fillStyle = '#1a4f9e'; x.fillRect(0, 0, 256, 128);
    for (let k = 0; k < 26; k++) { x.fillStyle = Math.random() < 0.7 ? 'rgba(66,150,84,0.85)' : 'rgba(196,170,110,0.8)'; x.beginPath(); x.ellipse(Math.random() * 256, 20 + Math.random() * 90, 6 + Math.random() * 22, 3 + Math.random() * 9, Math.random() * 3, 0, Math.PI * 2); x.fill(); }
    for (let k = 0; k < 70; k++) { x.fillStyle = 'rgba(255,255,255,' + (0.18 + Math.random() * 0.3) + ')'; x.beginPath(); x.ellipse(Math.random() * 256, Math.random() * 128, 10 + Math.random() * 30, 1.5 + Math.random() * 4, 0, 0, Math.PI * 2); x.fill(); }
    x.fillStyle = 'rgba(240,248,255,0.9)'; x.fillRect(0, 0, 256, 8); x.fillRect(0, 120, 256, 8);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.SphereGeometry(42, 28, 14), new THREE.MeshLambertMaterial({ map: tex, fog: false }));
    m.rotation.z = -0.3;
    skyS.add(m);
    return m;
  })();
  const blueAtm = planetAtmosphere(42 * 1.1, [0.28, 0.58, 1.0], 2.2);
planetAtm.position.copy(planetDir).multiplyScalar(420); planetRing.position.copy(planetDir).multiplyScalar(420); spacePlanet.position.copy(planetDir).multiplyScalar(420);
bluePlanet.position.copy(bluePlanetDir).multiplyScalar(430); blueAtm.position.copy(bluePlanet.position);
spaceMoon.position.copy(moonDir).multiplyScalar(400); spaceSun.position.copy(SUN_DIR).multiplyScalar(450);
{ const g1 = glowSprite(0xfff0c0, 110, 0.9); g1.position.copy(spaceSun.position); skyS.add(g1); }

// ---------- player ship ----------
const ship = new THREE.Group(); scene.add(ship);
const shipBody = new THREE.Group(); ship.add(shipBody);
{
  const hull = new THREE.MeshStandardMaterial({ color: 0xe8eef6, roughness: 0.4, metalness: 0.35, flatShading: true, fog: false, emissive: 0x46505e });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a4456, roughness: 0.5, metalness: 0.4, flatShading: true, fog: false, emissive: 0x1a2030 });
  const neon = new THREE.MeshBasicMaterial({ color: 0x5fe4ff, toneMapped: false, fog: false });
  const glass = new THREE.MeshStandardMaterial({ color: 0x66d9ff, roughness: 0.08, metalness: 0.9, emissive: 0x0a4a66, flatShading: true, fog: false });
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.2, 7), hull); nose.rotation.x = -Math.PI / 2; nose.position.z = -2.0; shipBody.add(nose);
  const mid = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.15, 2.6, 7), hull); mid.rotation.x = Math.PI / 2; mid.position.z = 0.4; shipBody.add(mid);
  const cock = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), glass); cock.scale.set(0.9, 0.8, 1.7); cock.position.set(0, 0.62, -0.5); shipBody.add(cock);
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.14, 1.9), hull); wing.position.set(s * 2.0, -0.12, 1.0); wing.rotation.y = s * -0.42; wing.rotation.z = s * 0.05; shipBody.add(wing);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 1.1), dark); tip.position.set(s * 3.25, 0.1, 1.35); shipBody.add(tip);
    const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.2, 5), dark); cannon.rotation.x = Math.PI / 2; cannon.position.set(s * 2.6, -0.05, -0.1); shipBody.add(cannon);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.05, 0.1), neon); strip.position.set(s * 2.0, -0.03, 0.45); strip.rotation.y = wing.rotation.y; shipBody.add(strip);
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 1.7, 8), dark); eng.rotation.x = Math.PI / 2; eng.position.set(s * 1.25, -0.15, 1.5); shipBody.add(eng);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 5, 12), neon); ring.position.set(s * 1.25, -0.15, 2.35); shipBody.add(ring);
  }
}
const flames = [-1, 1].map(s => { const f = glowSprite(0x7fe9ff, 2.0, 0.8); f.position.set(s * 1.25, -0.15, 2.9); shipBody.add(f); return f; });
const flameCore = [-1, 1].map(s => { const f = glowSprite(0xffffff, 0.9, 0.9); f.position.set(s * 1.25, -0.15, 2.6); shipBody.add(f); return f; });

// ---------- enemy fighter (one merged mesh, vertex colours) ----------
const enemyGeo = (() => {
  const parts = [];
  const add = (geo, color, pos, rot) => {
    const g = geo.toNonIndexed(); if (rot) { _m.makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])); g.applyMatrix4(_m); } g.translate(pos[0], pos[1], pos[2]);
    const c = new THREE.Color(color), n = g.attributes.position.count, col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('uv'); parts.push(g);
  };
  add(new THREE.ConeGeometry(0.8, 3.6, 5), 0x3a2630, [0, 0, -2.2], [-Math.PI / 2, 0, 0]);
  add(new THREE.CylinderGeometry(0.8, 1.0, 2.8, 5), 0x2a2630, [0, 0, 0.5], [Math.PI / 2, 0, 0]);
  add(new THREE.SphereGeometry(0.55, 6, 5), 0xff4a3a, [0, 0.55, -0.7]);
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(3.6, 0.12, 1.8), 0x4a2a34, [s * 2.0, -0.05, 0.9], [0, s * 0.5, s * -0.12]);
    add(new THREE.BoxGeometry(0.14, 1.1, 1.0), 0xc0302a, [s * 3.6, 0.35, 1.5]);
    add(new THREE.CylinderGeometry(0.4, 0.5, 1.5, 6), 0x2a2630, [s * 1.1, -0.1, 1.6], [Math.PI / 2, 0, 0]);
  }
  return mergeGeometries(parts);
})();
const enemyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.5, flatShading: true, fog: false, emissive: 0x3a1210 });

// ---------- dust streaks ----------
const dustMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  uniforms: { uCam: { value: V3() }, uVel: { value: V3() }, uBox: { value: 240 }, uK: { value: 0.03 }, uAlpha: { value: 0.3 } },
  vertexShader:
    'uniform vec3 uCam,uVel; uniform float uBox,uK; attribute vec3 aBase; attribute float aEnd; varying float vA;' +
    'void main(){' +
    ' vec3 p=fract((aBase*uBox-uCam)/uBox)*uBox-uBox*0.5+uCam;' +
    ' float d=length(p-uCam)/(uBox*0.5);' +
    ' vA=(1.0-smoothstep(0.55,1.0,d))*smoothstep(0.03,0.2,d)*(1.0-aEnd*0.9);' +
    ' p-=uVel*uK*aEnd;' +
    ' gl_Position=projectionMatrix*viewMatrix*vec4(p,1.0);}',
  fragmentShader: 'uniform float uAlpha; varying float vA; void main(){ gl_FragColor=vec4(0.75,0.88,1.0,vA*uAlpha); }'
});
{
  const N = 420, base = new Float32Array(N * 2 * 3), end = new Float32Array(N * 2), pos = new Float32Array(N * 2 * 3);
  for (let i = 0; i < N; i++) { const x = Math.random(), y = Math.random(), z = Math.random(); for (let k = 0; k < 2; k++) { base.set([x, y, z], (i * 2 + k) * 3); end[i * 2 + k] = k; } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aBase', new THREE.BufferAttribute(base, 3)); g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  const dust = new THREE.LineSegments(g, dustMat); dust.frustumCulled = false; scene.add(dust);
}

// ---------- asteroids ----------
const AST_PER = 40, AST_N = AST_PER * 3, ASTR = 520;
const asteroids = [], astMeshes = [];
{
  const col = new THREE.Color();
  for (let s = 0; s < 3; s++) {
    const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position, v = V3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = 0.72 + Math.random() * 0.5; p.setXYZ(i, v.x * k * (0.8 + s * 0.15), v.y * k, v.z * k * (1.25 - s * 0.15)); }
    g.computeVertexNormals();
    const m = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0.05, flatShading: true }), AST_PER);
    m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < AST_PER; i++) {
      col.setHSL(rnd(0.05, 0.1), rnd(0.08, 0.25), rnd(0.22, 0.42)); m.setColorAt(i, col);
      asteroids.push({ x: 0, y: -99999, z: 0, r: 1, hp: 1, rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6, ax: rnd(-0.4, 0.4), ay: rnd(-0.4, 0.4), mesh: m, idx: i, active: false });
    }
    scene.add(m); astMeshes.push(m);
  }
}
const dummy = new THREE.Object3D();

// ---------- loot ----------
const LOOT_N = 40, loot = [];
const lootMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false }), LOOT_N);
lootMesh.frustumCulled = false; lootMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(lootMesh);
const lootGlow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTex, color: 0x39b8ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }), LOOT_N);
lootGlow.frustumCulled = false; lootGlow.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(lootGlow);
{ const c = new THREE.Color(); for (let i = 0; i < LOOT_N; i++) { loot.push({ pos: V3(0, -99999, 0), vel: V3(), val: 0, ore: false, life: 0, active: false }); lootMesh.setColorAt(i, c.set(0xffd166)); } }
function dropLoot(p, val, ore, n) {
  for (let k = 0; k < n; k++) {
    const l = loot.find(o => !o.active); if (!l) return;
    l.active = true; l.pos.copy(p); l.vel.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(rnd(8, 22)); l.val = val; l.ore = ore; l.life = 60;
    lootMesh.setColorAt(loot.indexOf(l), _col.set(ore ? 0x7be8ff : 0xffd166)); lootMesh.instanceColor.needsUpdate = true;
  }
}
const _col = new THREE.Color();

// ---------- bolts (lasers) ----------
const BOLT_N = 120, bolts = [];
const boltMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.34, 9), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false }), BOLT_N);
boltMesh.frustumCulled = false; boltMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(boltMesh);
for (let i = 0; i < BOLT_N; i++) { bolts.push({ pos: V3(), vel: V3(), life: 0, enemy: false, dmg: 0 }); boltMesh.setColorAt(i, _col.set(0xffffff)); }
let boltNext = 0;
function fireBolt(pos, dir, speed, dmg, enemy) {
  const b = bolts[boltNext]; boltNext = (boltNext + 1) % BOLT_N;
  b.pos.copy(pos); b.vel.copy(dir).multiplyScalar(speed); b.life = enemy ? 2.6 : 1.7; b.enemy = enemy; b.dmg = dmg;
  boltMesh.setColorAt(bolts.indexOf(b), _col.set(enemy ? 0xff5a2a : 0x6dfcff)); boltMesh.instanceColor.needsUpdate = true;
}

// ---------- debris / sparks + explosions ----------
const DB_N = 220, dbPos = new Float32Array(DB_N * 3), dbVel = new Float32Array(DB_N * 3), dbLife = new Float32Array(DB_N); let dbNext = 0, dbAlive = 0;
for (let i = 0; i < DB_N; i++) dbPos[i * 3 + 1] = -99999;
const dbGeo = new THREE.BufferGeometry(); dbGeo.setAttribute('position', new THREE.BufferAttribute(dbPos, 3));
const debris = new THREE.Points(dbGeo, new THREE.PointsMaterial({ color: 0xffb040, size: 1.6, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
debris.frustumCulled = false; scene.add(debris);
function sparks(p, n, spd, life) {
  for (let i = 0; i < n; i++) { const k = dbNext; dbNext = (dbNext + 1) % DB_N; dbPos[k * 3] = p.x; dbPos[k * 3 + 1] = p.y; dbPos[k * 3 + 2] = p.z; _a.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(0.3, 1) * spd); dbVel[k * 3] = _a.x; dbVel[k * 3 + 1] = _a.y; dbVel[k * 3 + 2] = _a.z; dbLife[k] = rnd(0.4, 1) * life; }
  dbAlive = DB_N;
}
const EXP_N = 8, expl = [];
for (let i = 0; i < EXP_N; i++) { const f = glowSprite(0xffa040, 1, 0), r = glowSprite(0xffffff, 1, 0); f.visible = r.visible = false; scene.add(f, r); expl.push({ f, r, t: 99, size: 10 }); }
let explNext = 0;
function explode(p, size) {
  const e = expl[explNext]; explNext = (explNext + 1) % EXP_N; e.t = 0; e.size = size; e.f.position.copy(p); e.r.position.copy(p); e.f.visible = e.r.visible = true;
  sparks(p, size > 12 ? 28 : 12, size * 3.2, 1.3); sfx('boom', size);
}
function updateFx(dt) {
  for (const e of expl) {
    if (e.t > 1) { if (e.f.visible) e.f.visible = e.r.visible = false; continue; }
    e.t += dt * 1.5; const k = e.t, s = e.size * (0.5 + k * 2.4);
    e.f.scale.set(s, s, 1); e.f.material.opacity = Math.max(0, 1 - k) * 0.95; e.r.scale.set(s * 0.45, s * 0.45, 1); e.r.material.opacity = Math.max(0, 1 - k * 2.2);
  }
  if (!dbAlive) return; let any = false;
  for (let i = 0; i < DB_N; i++) {
    if (dbLife[i] <= 0) continue; dbLife[i] -= dt;
    if (dbLife[i] <= 0) { dbPos[i * 3 + 1] = -99999; continue; } any = true;
    dbPos[i * 3] += dbVel[i * 3] * dt; dbPos[i * 3 + 1] += dbVel[i * 3 + 1] * dt; dbPos[i * 3 + 2] += dbVel[i * 3 + 2] * dt;
  }
  dbGeo.attributes.position.needsUpdate = true; if (!any) dbAlive = 0;
}

// ---------- stations ----------
function buildStation() {
  const g = new THREE.Group(), spin = new THREE.Group(); g.add(spin);
  const metal = new THREE.MeshStandardMaterial({ color: 0xaab4c4, roughness: 0.45, metalness: 0.7, flatShading: true, fog: false });
  const darkM = new THREE.MeshStandardMaterial({ color: 0x3a4152, roughness: 0.6, metalness: 0.6, flatShading: true, fog: false });
  const winTex = canvasTex(256, 32, (x, w, h) => { x.fillStyle = '#10141c'; x.fillRect(0, 0, w, h); for (let i = 0; i < 70; i++) { x.fillStyle = Math.random() > 0.3 ? '#ffd88a' : '#8fe8ff'; x.fillRect(Math.random() * w, 6 + Math.random() * 20, rnd(3, 8), 3); } }, [10, 1]);
  const ringM = new THREE.MeshStandardMaterial({ color: 0xc8d0dc, roughness: 0.5, metalness: 0.6, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.9, map: winTex, fog: false });
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 64, 12), metal); hub.rotation.x = Math.PI / 2; g.add(hub);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 6, 12), darkM); cap.rotation.x = Math.PI / 2; cap.position.z = -30; g.add(cap);
  spin.add(new THREE.Mesh(new THREE.TorusGeometry(33, 4.2, 10, 40), ringM));
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; const sp = new THREE.Mesh(new THREE.BoxGeometry(1.8, 25, 1.8), darkM); sp.position.set(Math.cos(a) * 17, Math.sin(a) * 17, 0); sp.rotation.z = a - Math.PI / 2; spin.add(sp); }
  const panelTex = canvasTex(128, 64, (x, w, h) => { x.fillStyle = '#10264f'; x.fillRect(0, 0, w, h); x.strokeStyle = '#3d7fd0'; x.lineWidth = 2; for (let i = 0; i <= 8; i++) { x.beginPath(); x.moveTo(i * 16, 0); x.lineTo(i * 16, h); x.stroke(); } for (let j = 0; j <= 4; j++) { x.beginPath(); x.moveTo(0, j * 16); x.lineTo(w, j * 16); x.stroke(); } });
  const panelM = new THREE.MeshStandardMaterial({ map: panelTex, roughness: 0.3, metalness: 0.8, emissive: 0x0a1a3a, fog: false });
  for (const s of [-1, 1]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(14, 1.2, 1.2), darkM); arm.position.set(s * 16, 0, -18); g.add(arm); const pan = new THREE.Mesh(new THREE.BoxGeometry(30, 0.5, 18), panelM); pan.position.set(s * 38, 0, -18); g.add(pan); }
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(6, 7, 14, 10), metal); tube.rotation.x = Math.PI / 2; tube.position.z = 38; g.add(tube);
  const dockRing = new THREE.Mesh(new THREE.TorusGeometry(14, 1.1, 8, 28), new THREE.MeshBasicMaterial({ color: 0x59ffb0, toneMapped: false, fog: false })); dockRing.position.z = 46; g.add(dockRing);
  const beacon = glowSprite(0x6fe8ff, 90, 0.9); beacon.position.z = 46; g.add(beacon);
  g.userData = { spin, beacon };
  return g;
}
const stations = [
  { name: 'HELIOS PRIME', pos: V3(0, 0, 0), front: V3(0.3, 0.1, -1) },
  { name: 'KEPLER', pos: V3(1800, 260, -1500), front: V3(-1, -0.1, 0.5) },
  { name: 'VEGA GATE', pos: V3(-2100, -180, -2000), front: V3(0.8, 0.1, 0.7) },
];
stations.forEach(s => { s.front.normalize(); s.g = buildStation(); s.g.position.copy(s.pos); s.g.lookAt(s.pos.clone().add(s.front)); scene.add(s.g); });
const dockPoint = (st, out) => out.copy(st.pos).addScaledVector(st.front, 58);

// ---------- game state ----------
const S = {
  pos: V3(0, 0, 200), q: new THREE.Quaternion(), vel: V3(), speed: 0, roll: 0, sx: 0, sy: 0,
  shield: 80, hull: 100, boost: 100, boosting: false, regenT: 0, inv: 0, shake: 0, fireT: 0, side: 1,
  mode: 'menu', target: null, station: 0, camQ: new THREE.Quaternion(), mission: null, patrolT: 40, missT: 0, hitFlash: 0,
};
const fwd = V3(0, 0, -1);
const enemies = []; const ENEMY_N = 6;
for (let i = 0; i < ENEMY_N; i++) {
  const g = new THREE.Group(); const mesh = new THREE.Mesh(enemyGeo, enemyMat); mesh.scale.setScalar(1.8); g.add(mesh);
  const glow = glowSprite(0xff6a3a, 5, 0.9); glow.position.set(0, -0.2, 4.6); g.add(glow);
  g.visible = false; scene.add(g);
  enemies.push({ g, pos: g.position, q: g.quaternion, vel: V3(), speed: 90, shield: 0, shieldMax: 0, hull: 0, hullMax: 0, active: false, fireT: 0, evadeT: 0, evadeDir: V3(), burst: 0, name: 'PIRATE' });
}
function spawnEnemy(pos, level) {
  const e = enemies.find(x => !x.active); if (!e) return null;
  e.active = true; e.g.visible = true; e.pos.copy(pos); e.q.identity(); e.speed = 90; e.evadeT = 0; e.fireT = rnd(1, 2.5); e.burst = 0;
  const lv = Math.min(level, 6); e.shieldMax = e.shield = 28 + lv * 9; e.hullMax = e.hull = 36 + lv * 10; e.name = ['PIRATE', 'RAIDER', 'MARAUDER'][Math.min(2, lv >> 1)];
  _a.copy(S.pos).sub(e.pos).normalize(); _m.lookAt(_zero, _a, Y); e.q.setFromRotationMatrix(_m);
  return e;
}
function activeEnemies() { let n = 0; for (const e of enemies) if (e.active) n++; return n; }
const ZONE_R = 500;

// ---------- audio ----------
let actx = null, eng = null, lastLaser = 0;
function initAudio() {
  if (actx) return;
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    const master = actx.createGain(); master.gain.value = save.snd ? 0.5 : 0; master.connect(actx.destination);
    const o1 = actx.createOscillator(); o1.type = 'sawtooth'; const o2 = actx.createOscillator(); o2.type = 'square';
    const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; const g = actx.createGain(); g.gain.value = 0.0;
    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(master); o1.start(); o2.start();
    const nb = actx.createBuffer(1, actx.sampleRate * 0.6, actx.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    eng = { master, o1, o2, lp, g, nb };
  } catch (e) { actx = null; }
}
function sfx(kind, k) {
  if (!actx || !save.snd || actx.state !== 'running') return; const t = actx.currentTime;
  const tone = (type, f0, f1, dur, vol, delay) => { const o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t + (delay || 0)); o.frequency.exponentialRampToValueAtTime(f1, t + (delay || 0) + dur); g.gain.setValueAtTime(vol, t + (delay || 0)); g.gain.exponentialRampToValueAtTime(0.001, t + (delay || 0) + dur); o.connect(g); g.connect(eng.master); o.start(t + (delay || 0)); o.stop(t + (delay || 0) + dur + 0.02); };
  const noise = (cut, dur, vol) => { const s = actx.createBufferSource(); s.buffer = eng.nb; const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cut; const g = actx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f); f.connect(g); g.connect(eng.master); s.start(t); };
  if (kind === 'laser') { if (t - lastLaser < 0.07) return; lastLaser = t; tone('square', 1100, 260, 0.09, 0.06); }
  else if (kind === 'elaser') { tone('sawtooth', 600, 180, 0.12, 0.035); }
  else if (kind === 'hit') noise(900, 0.3, 0.5);
  else if (kind === 'boom') noise(500 + 200 / (k || 1), 0.55, clamp(0.25 + (k || 10) * 0.02, 0.3, 0.8));
  else if (kind === 'pick') tone('sine', 760, 1480, 0.16, 0.2);
  else if (kind === 'missile') { tone('sawtooth', 160, 700, 0.5, 0.12); }
  else if (kind === 'boost') tone('sawtooth', 90, 420, 0.4, 0.16);
  else if (kind === 'dock') { tone('triangle', 523, 523, 0.45, 0.22); tone('triangle', 659, 659, 0.45, 0.22, 0.12); tone('triangle', 784, 784, 0.5, 0.22, 0.24); }
  else if (kind === 'lock') tone('sine', 1200, 1200, 0.06, 0.12);
}
function updateAudio() {
  if (!eng || actx.state !== 'running') return; const t = actx.currentTime, k = clamp(S.speed / 170, 0, 1), on = S.mode === 'fly';
  eng.o1.frequency.setTargetAtTime(46 + k * 70 + (S.boosting ? 25 : 0), t, 0.08); eng.o2.frequency.setTargetAtTime(23 + k * 35, t, 0.08);
  eng.lp.frequency.setTargetAtTime(260 + k * 900 + (S.boosting ? 500 : 0), t, 0.1); eng.g.gain.setTargetAtTime(on ? 0.06 + k * 0.08 : 0.0, t, 0.15);
}

// ---------- input ----------
const keys = {}; let touchX = 0, touchY = 0, firing = false, boostHeld = false;
addEventListener('keydown', (e) => { keys[e.code] = true; if (e.code === 'Space') e.preventDefault(); if (e.code === 'KeyT') cycleTarget(); if (e.code === 'KeyM') fireMissile(); if (e.code === 'KeyE') tryDock(); });
addEventListener('keyup', (e) => { keys[e.code] = false; });
let stickId = null, stickOx = 0, stickOy = 0; const STICK_R = 62;
const stickEl = $('stick'), knob = $('knob');
const setKnob = (x, y) => { knob.style.transform = `translate(${x}px,${y}px)`; };
canvas.addEventListener('pointerdown', (e) => {
  if (stickId !== null || e.clientX > innerWidth * 0.5) return;
  stickId = e.pointerId; canvas.setPointerCapture(e.pointerId);
  const w = 132; stickEl.style.left = clamp(e.clientX - w / 2, 4, innerWidth * 0.5) + 'px'; stickEl.style.bottom = (innerHeight - clamp(e.clientY + w / 2, w + 4, innerHeight - 4)) + 'px';
  stickOx = parseFloat(stickEl.style.left) + w / 2; stickOy = innerHeight - parseFloat(stickEl.style.bottom) - w / 2;
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== stickId) return;
  let dx = e.clientX - stickOx, dy = e.clientY - stickOy; const l = Math.hypot(dx, dy); if (l > STICK_R) { dx *= STICK_R / l; dy *= STICK_R / l; }
  touchX = dx / STICK_R; touchY = dy / STICK_R; setKnob(dx, dy);
});
const endStick = (e) => { if (e.pointerId !== stickId) return; stickId = null; touchX = touchY = 0; setKnob(0, 0); stickEl.style.left = ''; stickEl.style.bottom = ''; };
canvas.addEventListener('pointerup', endStick); canvas.addEventListener('pointercancel', endStick);
function holdBtn(el, set) {
  const on = (e) => { e.preventDefault(); set(true); el.classList.add('down'); initAudio(); }, off = (e) => { e.preventDefault(); set(false); el.classList.remove('down'); };
  el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off);
}
function tapBtn(el, fn) { el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.classList.add('down'); initAudio(); fn(); }); const off = () => el.classList.remove('down'); el.addEventListener('pointerup', off); el.addEventListener('pointerleave', off); el.addEventListener('pointercancel', off); }
holdBtn($('b-fire'), (v) => firing = v); holdBtn($('b-boost'), (v) => boostHeld = v);
tapBtn($('b-miss'), () => fireMissile()); tapBtn($('b-tgt'), () => cycleTarget()); tapBtn($('b-dock'), () => tryDock());
$('b-inv').classList.toggle('on', save.inv); $('b-snd').classList.toggle('on', save.snd);
$('b-inv').addEventListener('click', () => { save.inv = !save.inv; $('b-inv').classList.toggle('on', save.inv); persist(); });
$('b-snd').addEventListener('click', () => { save.snd = !save.snd; $('b-snd').classList.toggle('on', save.snd); if (eng) eng.master.gain.value = save.snd ? 0.5 : 0; persist(); initAudio(); });
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- missiles ----------
const MS_N = 4, missiles = [];
for (let i = 0; i < MS_N; i++) { const g = new THREE.Group(); const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.4, 6), new THREE.MeshBasicMaterial({ color: 0xffe9b0, toneMapped: false, fog: false })); body.rotation.x = Math.PI / 2; g.add(body); const fl = glowSprite(0xffa040, 4, 0.9); fl.position.z = 1.4; g.add(fl); g.visible = false; scene.add(g); missiles.push({ g, vel: V3(), life: 0, target: null, active: false }); }
function fireMissile() {
  if (S.mode !== 'fly') return; if (save.missiles <= 0) { toast('NO MISSILES', 0.8); return; }
  const m = missiles.find(x => !x.active); if (!m) return;
  save.missiles--; persist(); updateMissHud(); sfx('missile');
  m.active = true; m.g.visible = true; m.life = 7; m.target = S.target && S.target.active ? S.target : null;
  m.g.position.copy(S.pos).addScaledVector(fwd, 3).addScaledVector(_a.set(0, -0.6, 0).applyQuaternion(S.q), 1); m.g.quaternion.copy(S.q); m.vel.copy(fwd).multiplyScalar(S.speed + 110);
}
function updateMissiles(dt) {
  for (const m of missiles) {
    if (!m.active) continue; m.life -= dt;
    const t = m.target && m.target.active ? m.target : null;
    fwdOf(m.g.quaternion, _a);
    if (t) {
      _b.copy(t.pos).sub(m.g.position); const dist = _b.length(); _b.divideScalar(dist || 1);
      _m.lookAt(_zero, _b, Y); _qa.setFromRotationMatrix(_m); m.g.quaternion.rotateTowards(_qa, 3.2 * dt); fwdOf(m.g.quaternion, _a);
      if (dist < 7) { damageEnemy(t, 70 + 15 * save.up[0], m.g.position); m.active = false; m.g.visible = false; explode(m.g.position, 9); continue; }
    }
    const sp = Math.min(330, m.vel.length() + 260 * dt); m.vel.copy(_a).multiplyScalar(sp); m.g.position.addScaledVector(m.vel, dt);
    sparks(m.g.position, 1, 4, 0.5);
    if (m.life <= 0) { m.active = false; m.g.visible = false; explode(m.g.position, 5); }
  }
}

// ---------- damage ----------
function damagePlayer(d) {
  if (S.inv > 0 || S.mode !== 'fly') return;
  S.regenT = 3.5; S.shake = Math.max(S.shake, 0.5);
  if (S.shield > 0) { S.shield -= d; if (S.shield < 0) { S.hull += S.shield; S.shield = 0; } flash('shield'); }
  else { S.hull -= d; flash('hull'); S.shake = 1; buzz(40); }
  sfx('hit');
  if (S.hull <= 0) { S.hull = 0; wrecked(); }
}
function damageEnemy(e, d, at) {
  if (!e.active) return;
  if (e.shield > 0) { e.shield -= d; if (e.shield < 0) { e.hull += e.shield; e.shield = 0; } } else e.hull -= d;
  if (at) sparks(at, 4, 14, 0.4);
  if (e.hull <= 0) {
    e.active = false; e.g.visible = false; explode(e.pos, 16); dropLoot(e.pos, 22 + save.kills % 3 * 6, false, 3);
    save.kills++; persist(); $('kills').textContent = '☠ ' + save.kills; if (S.target === e) S.target = null;
    S.shake = Math.max(S.shake, 0.25);
    if (S.mission && S.mission.type === 'bounty') { S.mission.done++; updateMissionHud(); if (S.mission.done >= S.mission.n) completeMission(); }
  }
}

// ---------- targeting ----------
function cycleTarget() {
  if (S.mode !== 'fly') return; fwdOf(S.q, fwd);
  const list = enemies.filter(e => e.active).map(e => { _a.copy(e.pos).sub(S.pos); const d = _a.length(); return { e, score: Math.acos(clamp(fwd.dot(_a) / (d || 1), -1, 1)) + d / 3000 }; }).sort((a, b) => a.score - b.score);
  if (!list.length) { S.target = null; return; }
  let i = list.findIndex(o => o.e === S.target); S.target = list[(i + 1) % list.length].e; sfx('lock');
}

// ---------- missions ----------
function rndStationOtherThan(i) { const o = [0, 1, 2].filter(k => k !== i); return o[Math.random() * o.length | 0]; }
function genMissions(from) {
  const lvl = Math.min(save.kills, 40);
  const n = 3 + (Math.random() * 3 | 0), dirv = V3(rnd(-1, 1), rnd(-0.3, 0.3), rnd(-1, 1)).normalize();
  const to = rndStationOtherThan(from), ore = 5 + (Math.random() * 6 | 0);
  return [
    { type: 'bounty', n, done: 0, reward: 140 * n + lvl * 3, zone: stations[from].pos.clone().addScaledVector(dirv, rnd(700, 1100)), spawned: 0, title: 'BOUNTY', text: `Destroy ${n} pirates in the marked zone` },
    { type: 'delivery', to, reward: Math.round(stations[from].pos.distanceTo(stations[to].pos) / 7) + 80, title: 'DELIVERY', text: `Deliver cargo to ${stations[to].name}` },
    { type: 'mining', n: ore, done: 0, reward: 90 + ore * 14, title: 'MINING', text: `Shoot asteroids and collect ${ore} ore` },
  ];
}
let offered = [];
function updateMissionHud() {
  const m = S.mission, el = $('mission');
  if (!m) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.textContent = m.type === 'bounty' ? `BOUNTY  ${m.done}/${m.n} pirates` : m.type === 'delivery' ? `DELIVERY → ${stations[m.to].name}` : `MINING  ${m.done}/${m.n} ore`;
}
function completeMission() {
  const m = S.mission; if (!m) return; save.credits += m.reward; persist(); refreshHud(); toast('MISSION COMPLETE  +' + m.reward, 2.2); sfx('dock'); S.mission = null; updateMissionHud();
}

// ---------- UI ----------
let toastT = 0;
function toast(t, secs) { const el = $('toast'); el.textContent = t; el.style.opacity = '1'; toastT = secs || 1; }
function flash(kind) { const f = $('flash'); f.style.background = kind === 'shield' ? 'radial-gradient(ellipse at center,rgba(60,170,255,0) 45%,rgba(60,170,255,.5) 100%)' : 'radial-gradient(ellipse at center,rgba(255,50,40,0) 40%,rgba(255,50,40,.7) 100%)'; f.style.opacity = '1'; setTimeout(() => f.style.opacity = '0', 110); }
const buzz = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { } };
const refreshHud = () => { $('credits').textContent = save.credits; };
const updateMissHud = () => { $('miss-n').textContent = save.missiles; };
refreshHud(); updateMissHud(); $('kills').textContent = '☠ ' + save.kills;

let shopTab = 'm';
function openShop(msg) {
  S.mode = 'dock';
  $('shop-title').textContent = 'DOCKED · ' + stations[S.station].name;
  $('shop-earn').textContent = msg || '';
  $('tab-m').classList.toggle('on', shopTab === 'm'); $('tab-u').classList.toggle('on', shopTab === 'u');
  const list = $('shop-list'); list.innerHTML = '';
  const row = (nm, desc, extra, btnText, dis, fn) => {
    const r = document.createElement('div'); r.className = 'row';
    r.innerHTML = `<div class="nm">${nm}<span>${desc}</span></div>${extra ? `<div class="lv">${extra}</div>` : ''}`;
    if (btnText) { const b = document.createElement('button'); b.className = 'buy'; b.textContent = btnText; b.disabled = dis; b.addEventListener('click', fn); r.appendChild(b); }
    list.appendChild(r);
  };
  if (shopTab === 'm') {
    if (S.mission) row('ACTIVE: ' + S.mission.title, S.mission.text + '  ·  ◆ ' + S.mission.reward, '', 'ABANDON', false, () => { S.mission = null; updateMissionHud(); openShop(msg); });
    offered.forEach((m) => row(m.title + '  ◆ ' + m.reward, m.text, '', S.mission ? 'BUSY' : 'ACCEPT', !!S.mission, () => { S.mission = Object.assign({}, m); if (m.zone) S.mission.zone = m.zone; updateMissionHud(); sfx('pick'); openShop('MISSION ACCEPTED'); }));
  } else {
    UPG.forEach((u, i) => { const lv = save.up[i], maxed = lv >= u.max, cost = upCost(i); row(u.name, u.desc, '■'.repeat(lv) + '□'.repeat(u.max - lv), maxed ? 'MAX' : '◆ ' + cost, maxed || save.credits < cost, () => { save.credits -= cost; save.up[i]++; persist(); refreshHud(); ST = stats(); sfx('pick'); openShop(msg); }); });
    row('MISSILES  ×' + save.missiles, 'Homing missiles, 3 per pack', '', '◆ 90', save.credits < 90 || save.missiles > 30, () => { save.credits -= 90; save.missiles += 3; persist(); refreshHud(); updateMissHud(); sfx('pick'); openShop(msg); });
  }
  $('shop').classList.add('show');
}
$('tab-m').addEventListener('click', () => { shopTab = 'm'; openShop($('shop-earn').textContent); });
$('tab-u').addEventListener('click', () => { shopTab = 'u'; openShop($('shop-earn').textContent); });

function dockAt(i) {
  S.station = i; S.mode = 'dock'; S.target = null; S.speed = 0; S.shield = ST.shieldMax; S.hull = ST.hullMax; S.boost = 100;
  for (const e of enemies) { e.active = false; e.g.visible = false; } for (const m of missiles) { m.active = false; m.g.visible = false; }
  sfx('dock'); buzz(50);
  let msg = 'SHIP REPAIRED';
  if (S.mission && S.mission.type === 'delivery' && S.mission.to === i) { const r = S.mission.reward; completeMission(); msg = 'DELIVERY COMPLETE  +' + r; }
  offered = genMissions(i); shopTab = 'm'; openShop(msg);
}
function tryDock() { if (S.mode !== 'fly') return; const i = nearStation(); if (i >= 0) dockAt(i); }
function nearStation() { let best = -1, bd = 450; for (let i = 0; i < stations.length; i++) { const d = S.pos.distanceTo(stations[i].pos); if (d < bd) { bd = d; best = i; } } return best; }

function launchFrom(i) {
  ST = stats(); S.station = i; const st = stations[i];
  dockPoint(st, S.pos).addScaledVector(st.front, 40);
  _m.lookAt(_zero, st.front, Y); S.q.setFromRotationMatrix(_m); S.camQ.copy(S.q);
  S.speed = 60; S.shield = ST.shieldMax; S.hull = ST.hullMax; S.boost = 100; S.inv = 2; S.mode = 'fly'; S.target = null; S.patrolT = 45; S.sx = S.sy = 0;
  for (const a of asteroids) a.active = false; for (const l of loot) l.active = false;
  $('shop').classList.remove('show');
}
function startGame() { initAudio(); if (actx && actx.state === 'suspended') actx.resume(); $('start').classList.remove('show'); updateMissionHud(); launchFrom(0); offered = genMissions(0); }
$('go-start').addEventListener('click', startGame);
$('go-start').textContent = 'LAUNCH';
{ const b = document.createElement('div'); b.style.cssText = 'margin-top:10px;font-size:10px;opacity:.5;letter-spacing:2px'; b.textContent = 'BUILD ' + BUILD; $('go-start').parentNode.appendChild(b); }
$('go-launch').addEventListener('click', () => { initAudio(); if (actx && actx.state === 'suspended') actx.resume(); launchFrom(S.station); });
function wrecked() {
  S.mode = 'wreck'; explode(S.pos, 18); sfx('hit'); buzz(250);
  save.credits = Math.floor(save.credits * 0.9); persist(); refreshHud(); S.mission = null; updateMissionHud(); toast('SHIP DESTROYED', 2); $('flash').style.background = 'rgba(255,40,30,.6)'; $('flash').style.opacity = '1';
  setTimeout(() => { $('flash').style.opacity = '0'; if (S.mode === 'wreck') { for (const e of enemies) { e.active = false; e.g.visible = false; } dockAt(S.station); } }, 2000);
}

// ---------- spawning (asteroids) ----------
function spawnAsteroid(a, first) {
  fwdOf(S.q, fwd);
  for (let tries = 0; tries < 6; tries++) {
    if (first) { _b.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)); if (_b.lengthSq() > 1) continue; _b.multiplyScalar(ASTR); }
    else { _b.set(rnd(-1, 1), rnd(-0.8, 0.8), rnd(-1, 1)).normalize().multiplyScalar(rnd(0.8, 1.0) * ASTR); if (_b.dot(fwd) < 0) _b.addScaledVector(fwd, -2 * _b.dot(fwd)); }
    _b.add(S.pos);
    let ok = _b.distanceTo(S.pos) > 100;
    for (const st of stations) if (_b.distanceTo(st.pos) < 220) ok = false;
    if (!ok) continue;
    a.x = _b.x; a.y = _b.y; a.z = _b.z;
    const big = Math.random() < 0.15; a.r = big ? rnd(14, 26) : rnd(3, 11); a.hp = a.r * a.r * 0.35; a.active = true; return;
  }
  a.active = false; a.y = -99999;
}
function updateSpawns() {
  fwdOf(S.q, fwd); let act = 0; const target = 85;
  for (let i = 0; i < AST_N; i++) {
    const a = asteroids[i];
    if (a.active) { _b.set(a.x - S.pos.x, a.y - S.pos.y, a.z - S.pos.z); const d2 = _b.lengthSq(); if (d2 > ASTR * ASTR * 1.1 || (d2 > 200 * 200 && _b.dot(fwd) < 0 && d2 > 330 * 330)) a.active = false; }
    if (a.active) act++;
  }
  for (let i = 0; i < AST_N && act < target; i++) { const a = asteroids[i]; if (!a.active) { spawnAsteroid(a, false); if (a.active) act++; } }
}
function breakAsteroid(a) {
  a.active = false; a.y = -99999; _a.set(a.x, a.y === -99999 ? 0 : a.y, a.z);
}

// ---------- main loop ----------
const mk = [$('mk-s0'), $('mk-s1'), $('mk-s2')], mkWp = $('mk-wp'), tgtEl = $('tgt'), leadEl = $('lead'), crossEl = $('cross');
const radar = $('radar'), rctx = radar.getContext('2d');
let last = performance.now(), tAcc = 0, slow = 0, fast = 0, frames = 0, ema = 16, flip = 0;
const proj = V3(), qInv = new THREE.Quaternion();
function place(el, worldPos, label, edge, hideIfBehind) {
  proj.copy(worldPos).project(camera);
  const behind = proj.z > 1; let nx = proj.x, ny = proj.y; const W = innerWidth, H = innerHeight;
  const inView = !behind && Math.abs(nx) < 0.92 && Math.abs(ny) < 0.84;
  const dot = el.querySelector('i'), arrow = el.querySelector('svg'), txt = el.querySelector('span');
  if (txt && label !== undefined) txt.textContent = label;
  if (inView) { el.style.display = 'block'; el.style.left = (nx * 0.5 + 0.5) * W + 'px'; el.style.top = (1 - (ny * 0.5 + 0.5)) * H + 'px'; if (arrow) { arrow.style.display = 'none'; dot.style.display = 'block'; } return true; }
  if (!edge) { el.style.display = 'none'; return false; }
  if (behind) { nx = -nx; ny = -ny; } const m = Math.max(Math.abs(nx), Math.abs(ny), 1e-4); nx /= m; ny /= m;
  el.style.display = 'block'; el.style.left = clamp((nx * 0.5 + 0.5) * W, 90, W - 90) + 'px'; el.style.top = clamp((1 - (ny * 0.5 + 0.5)) * H, 70, H - 150) + 'px';
  arrow.style.display = 'block'; dot.style.display = 'none'; arrow.style.transform = `rotate(${Math.atan2(nx, ny) * 180 / Math.PI}deg)`; return false;
}
function drawRadar() {
  const c = rctx, W = 208, R = 98, cx = 104, cy = 104, range = 1500, k = R / range;
  c.clearRect(0, 0, W, W);
  c.strokeStyle = 'rgba(126,240,255,.28)'; c.lineWidth = 1.5; c.beginPath(); c.arc(cx, cy, R * 0.5, 0, 7); c.stroke(); c.beginPath(); c.moveTo(cx - R, cy); c.lineTo(cx + R, cy); c.moveTo(cx, cy - R); c.lineTo(cx, cy + R); c.stroke();
  qInv.copy(S.q).invert();
  const dot = (p, col, size, sq) => {
    _c.copy(p).sub(S.pos).applyQuaternion(qInv); let x = _c.x, z = _c.z, y = _c.y; const d = Math.hypot(x, z); let a = 1;
    if (d > range) { x *= range / d; z *= range / d; a = 0.45; }
    const px = cx + x * k, py = cy + z * k, ey = clamp(y * k * 0.6, -26, 26);
    c.globalAlpha = a; c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 1.5; c.beginPath(); c.moveTo(px, py); c.lineTo(px, py - ey); c.stroke();
    if (sq) c.fillRect(px - size, py - ey - size, size * 2, size * 2); else { c.beginPath(); c.arc(px, py - ey, size, 0, 7); c.fill(); } c.globalAlpha = 1;
  };
  for (const s of stations) dot(s.pos, '#8fe8ff', 5, true);
  if (S.mission && S.mission.type === 'bounty') dot(S.mission.zone, '#ffd166', 5, true);
  if (S.mission && S.mission.type === 'delivery') dot(stations[S.mission.to].pos, '#ffd166', 6, true);
  for (const l of loot) if (l.active) dot(l.pos, '#ffd166', 2.2);
  for (const e of enemies) if (e.active) dot(e.pos, e === S.target ? '#ffffff' : '#ff5a4a', e === S.target ? 5 : 4);
  c.fillStyle = '#9ff3ff'; c.beginPath(); c.moveTo(cx, cy - 8); c.lineTo(cx + 6, cy + 6); c.lineTo(cx - 6, cy + 6); c.closePath(); c.fill();
}

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now; if (dt > 0.05) dt = 0.05; if (dt <= 0) return;
  tAcc += dt; ema += (dt * 1000 - ema) * 0.05; frames++;
  if (frames > 60) { if (ema > 24) { slow += dt; fast = 0; } else if (ema < 15) { fast += dt; slow = 0; } else { slow = fast = 0; } if (slow > 1.5 && pr > PR_MIN) { pr = Math.max(PR_MIN, pr * 0.85); applyPR(); slow = 0; } else if (slow > 3 && pr <= PR_MIN + 0.01 && bloomPass.enabled) { bloomPass.enabled = false; slow = 0; } if (fast > 5 && pr < PR_MAX) { pr = Math.min(PR_MAX, pr * 1.12); applyPR(); fast = 0; } }
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').style.opacity = '0'; }
  const flying = S.mode === 'fly';
  fwdOf(S.q, fwd);

  if (flying) {
    // ---- steering (local axes: full 3D flight) ----
    let ix = touchX, iy = touchY;
    if (keys.ArrowLeft || keys.KeyA) ix -= 1; if (keys.ArrowRight || keys.KeyD) ix += 1; if (keys.ArrowUp || keys.KeyW) iy -= 1; if (keys.ArrowDown || keys.KeyS) iy += 1;
    ix = clamp(ix, -1, 1); iy = clamp(iy, -1, 1);
    const dz = (v) => { const a = Math.abs(v); return a < 0.1 ? 0 : Math.sign(v) * (a - 0.1) / 0.9; };
    ix = dz(ix); iy = dz(iy); ix = Math.sign(ix) * ix * ix * 0.4 + ix * 0.6; iy = Math.sign(iy) * iy * iy * 0.4 + iy * 0.6;
    S.sx = damp(S.sx, ix, 9, dt); S.sy = damp(S.sy, iy, 9, dt);
    const spN = clamp(S.speed / 170, 0, 1), yawR = 1.7 - 0.45 * spN, pitR = 1.3 - 0.3 * spN;
    _qa.setFromAxisAngle(X, (save.inv ? 1 : -1) * S.sy * pitR * dt); S.q.multiply(_qa);
    _qa.setFromAxisAngle(Y, -S.sx * yawR * dt); S.q.multiply(_qa);
    // self-levelling bank (the ship rights itself slowly so it never gets confusing)
    S.q.normalize(); S.roll = damp(S.roll, -S.sx * 0.8, 6, dt);
    fwdOf(S.q, fwd);

    // ---- speed / boost ----
    S.boosting = (boostHeld || keys.ShiftLeft || keys.KeyB) && S.boost > 2;
    let target = ST.cruise;
    if (S.boosting) { target = ST.cruise * 1.85; S.boost = Math.max(0, S.boost - 32 * dt); if (!S._wasB) sfx('boost'); } else S.boost = Math.min(100, S.boost + 15 * dt);
    S._wasB = S.boosting;
    S.speed = damp(S.speed, target, S.speed > target ? 2.0 : 2.6, dt);
    S.vel.copy(fwd).multiplyScalar(S.speed); S.pos.addScaledVector(S.vel, dt);

    // ---- weapons ----
    S.fireT -= dt;
    // target & aim assist
    if (S.target && !S.target.active) S.target = null;
    if (!S.target) { for (const e of enemies) if (e.active) { _a.copy(e.pos).sub(S.pos); const d = _a.length(); if (d < 900 && fwd.dot(_a) / d > 0.6) { S.target = e; sfx('lock'); break; } } }
    let leadOk = false;
    if (S.target) {
      const e = S.target; _a.copy(e.pos).sub(S.pos); const d = _a.length(); const tt = d / 560;
      _b.copy(e.pos).addScaledVector(e.vel, tt).addScaledVector(S.vel, -tt * 0.0); S.lead = (S.lead || V3()).copy(_b);
      _c.copy(_b).sub(S.pos).normalize(); leadOk = Math.acos(clamp(fwd.dot(_c), -1, 1)) < 0.22; S._leadDir = (S._leadDir || V3()).copy(_c);
    }
    if ((firing || keys.Space) && S.fireT <= 0) {
      S.fireT = 0.13; S.side = -S.side;
      _a.set(S.side * 2.6, -0.05, -1.5).applyQuaternion(S.q).add(S.pos);
      _b.copy(fwd); if (leadOk) _b.lerp(S._leadDir, 0.85).normalize();
      fireBolt(_a, _b, 560, ST.dmg, false); sfx('laser');
    }

    // ---- bolts ----
    for (let i = 0; i < BOLT_N; i++) {
      const b = bolts[i]; if (b.life <= 0) continue; b.life -= dt;
      _a.copy(b.pos); b.pos.addScaledVector(b.vel, dt);
      if (b.enemy) {
        _c.copy(S.pos).sub(_a); const seg = _d.copy(b.pos).sub(_a), sl = seg.lengthSq(), t = clamp(_c.dot(seg) / (sl || 1), 0, 1);
        _c.copy(_a).addScaledVector(seg, t).sub(S.pos); if (_c.lengthSq() < 9) { b.life = 0; damagePlayer(b.dmg); }
      } else {
        let hit = false;
        for (const e of enemies) { if (!e.active) continue; const seg = _d.copy(b.pos).sub(_a), sl = seg.lengthSq(); _c.copy(e.pos).sub(_a); const t = clamp(_c.dot(seg) / (sl || 1), 0, 1); _c.copy(_a).addScaledVector(seg, t).sub(e.pos); if (_c.lengthSq() < 42) { b.life = 0; damageEnemy(e, b.dmg, b.pos); hit = true; break; } }
        if (!hit) for (let j = 0; j < AST_N; j++) {
          const a = asteroids[j]; if (!a.active) continue; _c.set(a.x - b.pos.x, a.y - b.pos.y, a.z - b.pos.z); const rr = a.r * 0.95;
          if (_c.lengthSq() < rr * rr) {
            b.life = 0; sparks(b.pos, 3, 12, 0.35);
            if (a.r < 13) { a.hp -= b.dmg; if (a.hp <= 0) { _b.set(a.x, a.y, a.z); a.active = false; a.y = -99999; explode(_b, a.r * 0.9); dropLoot(_b, 15, true, 1 + (a.r > 7 ? 1 : 0)); } }
            break;
          }
        }
      }
    }

    // ---- enemies ----
    S.patrolT -= dt;
    const zone = S.mission && S.mission.type === 'bounty' ? S.mission : null;
    if (zone && zone.spawned < zone.n && S.pos.distanceTo(zone.zone) < 800 && activeEnemies() < 3 && S.missT <= 0) {
      for (let k = 0; k < Math.min(2, zone.n - zone.spawned); k++) { _b.copy(zone.zone).add(_a.set(rnd(-1, 1), rnd(-0.4, 0.4), rnd(-1, 1)).multiplyScalar(240)); if (spawnEnemy(_b, Math.min(5, 1 + (save.kills / 8 | 0)))) zone.spawned++; }
      S.missT = 12; toast('PIRATES!', 1.2);
    }
    S.missT -= dt;
    if (S.patrolT <= 0) {
      S.patrolT = rnd(55, 95);
      if (activeEnemies() === 0 && S.pos.distanceTo(stations[S.station].pos) > 500) {
        const n = 1 + (Math.random() < 0.4 ? 1 : 0); for (let k = 0; k < n; k++) { _b.copy(fwd).multiplyScalar(rnd(500, 700)).add(_a.set(rnd(-1, 1), rnd(-0.5, 0.5), rnd(-1, 1)).multiplyScalar(160)).add(S.pos); spawnEnemy(_b, Math.min(5, save.kills / 8 | 0)); }
        toast('HOSTILES INBOUND', 1.4);
      }
    }
    for (const e of enemies) {
      if (!e.active) continue;
      _a.copy(S.pos).sub(e.pos); const dist = _a.length(); const dirTo = _b.copy(_a).divideScalar(dist || 1);
      if (dist > 2200) { e.active = false; e.g.visible = false; if (S.target === e) S.target = null; continue; }
      fwdOf(e.q, _c);
      let want = dirTo;
      // predicted aim point so they actually lead you
      _d.copy(S.pos).addScaledVector(S.vel, dist / 500).sub(e.pos).normalize(); want = _d;
      e.evadeT -= dt;
      if (e.evadeT > 0) want = e.evadeDir;
      else if (dist < 80 && Math.random() < 0.03) { e.evadeDir.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).addScaledVector(dirTo, -0.6).normalize(); e.evadeT = rnd(1.1, 2.0); }
      _m.lookAt(_zero, want, Y); _qb.setFromRotationMatrix(_m); e.q.rotateTowards(_qb, (e.evadeT > 0 ? 2.4 : 1.35) * dt);
      fwdOf(e.q, _c);
      const wantSp = e.evadeT > 0 ? 125 : dist > 400 ? 120 : dist > 160 ? 96 : 80; e.speed = damp(e.speed, wantSp, 1.4, dt);
      e.vel.copy(_c).multiplyScalar(e.speed); e.pos.addScaledVector(e.vel, dt);
      e.fireT -= dt;
      if (dist < 420 && e.evadeT <= 0 && _c.dot(dirTo) > 0.965 && e.fireT <= 0) {
        e.burst = 3; e.fireT = rnd(1.4, 2.4);
      }
      if (e.burst > 0 && (e.burstT = (e.burstT || 0) - dt) <= 0) {
        e.burst--; e.burstT = 0.13; _d.copy(_c).add(_a.set(rnd(-0.03, 0.03), rnd(-0.03, 0.03), rnd(-0.03, 0.03))).normalize();
        fireBolt(_a.copy(e.pos).addScaledVector(_c, 3), _d, 380, 5 + save.kills * 0.05, true); sfx('elaser');
      }
    }
    // ---- missiles / loot / collisions ----
    updateMissiles(dt);
    for (let i = 0; i < AST_N; i++) {
      const a = asteroids[i]; if (!a.active) continue; const dx = S.pos.x - a.x, dy = S.pos.y - a.y, dz2 = S.pos.z - a.z, rr = a.r * 0.9 + 2.4;
      if (dx * dx + dy * dy + dz2 * dz2 < rr * rr) {
        const d = Math.sqrt(dx * dx + dy * dy + dz2 * dz2) || 1; S.pos.set(a.x + dx / d * rr, a.y + dy / d * rr, a.z + dz2 / d * rr);
        if (S.inv <= 0) { const dmg = clamp(6 + S.speed * 0.14 + a.r * 0.4, 6, 50); damagePlayer(dmg); S.inv = 0.6; S.speed *= 0.5; }
      }
    }
    if (S.inv > 0) S.inv -= dt;
    for (const st of stations) { _a.copy(S.pos).sub(st.pos); const d = _a.length(); if (d < 40) { S.pos.copy(st.pos).addScaledVector(_a.multiplyScalar(40 / (d || 1)), 1); S.speed *= 0.6; } }
    const mag = 20 + 0;
    for (let i = 0; i < LOOT_N; i++) {
      const l = loot[i]; if (!l.active) continue; l.life -= dt; l.pos.addScaledVector(l.vel, dt); l.vel.multiplyScalar(Math.max(0, 1 - 1.2 * dt));
      _a.copy(S.pos).sub(l.pos); const d = _a.length();
      if (d < mag * 3) l.vel.addScaledVector(_a.divideScalar(d || 1), (1 - d / (mag * 3)) * 220 * dt);
      if (d < 7) { l.active = false; save.credits += l.val; refreshHud(); sfx('pick'); S.shield = Math.min(ST.shieldMax, S.shield + 3); if (l.ore && S.mission && S.mission.type === 'mining') { S.mission.done++; updateMissionHud(); if (S.mission.done >= S.mission.n) completeMission(); } persist(); }
      else if (l.life <= 0) l.active = false;
    }
    // shield recharge
    S.regenT -= dt; if (S.regenT <= 0 && S.shield < ST.shieldMax) S.shield = Math.min(ST.shieldMax, S.shield + ST.shieldRegen * dt);
    S.shake = Math.max(0, S.shake - dt * 2.4);
    updateSpawns();
  } else { S.speed = damp(S.speed, 0, 3, dt); S.boosting = false; if (S.mode === 'wreck') S.pos.addScaledVector(fwd, S.speed * dt); }

  updateFx(dt);

  // ---- ship + camera ----
  ship.position.copy(S.pos); ship.quaternion.copy(S.q); shipBody.rotation.z = S.roll;
  const vis = S.mode !== 'wreck' && S.mode !== 'dock', blink = S.inv > 0 && Math.floor(S.inv * 14) % 2 === 0; ship.visible = vis && !blink;
  const fl = 0.7 + S.speed / 220 + (S.boosting ? 0.9 : 0), flick = 0.9 + Math.sin(tAcc * 50) * 0.1;
  flames.forEach(f => { f.scale.setScalar(2.2 * fl * flick); f.material.color.setHex(S.boosting ? 0xffa050 : 0x7fe9ff); }); flameCore.forEach(f => f.scale.setScalar(0.9 * fl * flick));
  for (const e of enemies) if (e.active) { e.g.children[1].scale.setScalar(5 + Math.sin(tAcc * 40 + e.pos.x) * 0.6); }
  S.camQ.slerp(S.q, 1 - Math.exp(-7 * dt));
  const cd = 12.5 + S.speed * 0.012;
  _a.set(0, 3.1, cd).applyQuaternion(S.camQ); camera.position.copy(S.pos).add(_a);
  _qa.setFromAxisAngle(X, -0.07); camera.quaternion.copy(S.camQ).multiply(_qa);
  if (S.shake > 0) { const a = S.shake * 0.35; camera.position.x += Math.sin(tAcc * 71) * a; camera.position.y += Math.sin(tAcc * 83) * a; }
  _qa.setFromAxisAngle(Z, -S.sx * 0.05); camera.quaternion.multiply(_qa);
  const wantFov = 64 + clamp(S.speed / 150, 0, 1.4) * 12 + (S.boosting ? 6 : 0);
  if (Math.abs(camera.fov - wantFov) > 0.05) { camera.fov = damp(camera.fov, wantFov, 4, dt); camera.updateProjectionMatrix(); }
  sky.position.copy(camera.position);

  // ---- world animation ----
  for (let i = 0; i < AST_N; i++) {
    const a = asteroids[i]; a.rx += a.ax * dt; a.ry += a.ay * dt;
    if (!a.active) { dummy.position.set(0, -99999, 0); dummy.scale.setScalar(0.0001); } else { dummy.position.set(a.x, a.y, a.z); dummy.rotation.set(a.rx, a.ry, a.rz); dummy.scale.setScalar(a.r); }
    dummy.updateMatrix(); a.mesh.setMatrixAt(a.idx, dummy.matrix);
  }
  astMeshes.forEach(m => m.instanceMatrix.needsUpdate = true);
  for (let i = 0; i < LOOT_N; i++) {
    const l = loot[i];
    if (!l.active) { dummy.position.set(0, -99999, 0); dummy.scale.setScalar(0.0001); dummy.quaternion.identity(); dummy.updateMatrix(); lootMesh.setMatrixAt(i, dummy.matrix); lootGlow.setMatrixAt(i, dummy.matrix); continue; }
    dummy.position.copy(l.pos); dummy.rotation.set(0.4, tAcc * 1.8 + i, 0); dummy.scale.set(1.0, 1.7, 1.0); dummy.updateMatrix(); lootMesh.setMatrixAt(i, dummy.matrix);
    dummy.quaternion.copy(camera.quaternion); dummy.scale.setScalar(8); dummy.updateMatrix(); lootGlow.setMatrixAt(i, dummy.matrix);
  }
  lootMesh.instanceMatrix.needsUpdate = true; lootGlow.instanceMatrix.needsUpdate = true;
  // bolts
  for (let i = 0; i < BOLT_N; i++) {
    const b = bolts[i];
    if (b.life <= 0) { dummy.position.set(0, -99999, 0); dummy.scale.setScalar(0.0001); dummy.quaternion.identity(); }
    else { dummy.position.copy(b.pos); dummy.scale.set(1, 1, 1); _m.lookAt(_zero, b.vel, Y); dummy.quaternion.setFromRotationMatrix(_m); }
    dummy.updateMatrix(); boltMesh.setMatrixAt(i, dummy.matrix);
  }
  boltMesh.instanceMatrix.needsUpdate = true;
  for (const st of stations) { st.g.userData.spin.rotation.z += dt * 0.12; st.g.userData.beacon.material.opacity = 0.6 + Math.sin(tAcc * 3) * 0.25; }
  dustMat.uniforms.uCam.value.copy(camera.position); dustMat.uniforms.uVel.value.copy(S.vel);
  dustMat.uniforms.uK.value = 0.012 + (S.boosting ? 0.02 : 0.008); dustMat.uniforms.uAlpha.value = 0.22 + clamp(S.speed / 170, 0, 1) * 0.35 + (S.boosting ? 0.2 : 0);

  // ---- HUD ----
  $('b-sh').style.transform = `scaleX(${clamp(S.shield / ST.shieldMax, 0, 1).toFixed(3)})`;
  $('b-hu').style.transform = `scaleX(${clamp(S.hull / ST.hullMax, 0, 1).toFixed(3)})`;
  $('b-bo').style.transform = `scaleX(${clamp(S.boost / 100, 0, 1).toFixed(3)})`;
  $('kmh').textContent = Math.round(S.speed);
  const showHud = flying;
  crossEl.style.display = showHud ? 'block' : 'none';
  if (flying) {
    for (let i = 0; i < 3; i++) { const d = S.pos.distanceTo(stations[i].pos); place(mk[i], stations[i].pos, stations[i].name + ' · ' + (d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m'), false); }
    const m = S.mission;
    if (m && (m.type === 'bounty' || m.type === 'delivery')) { const p = m.type === 'bounty' ? m.zone : stations[m.to].pos, d = S.pos.distanceTo(p); place(mkWp, p, (m.type === 'bounty' ? 'BOUNTY ZONE' : 'DELIVERY') + ' · ' + (d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m'), true); } else mkWp.style.display = 'none';
    if (S.target && S.target.active) {
      const e = S.target; const d = S.pos.distanceTo(e.pos);
      const on = place(tgtEl, e.pos, undefined, false); $('t-txt').textContent = e.name + ' · ' + Math.round(d) + ' m';
      $('t-sh').style.transform = `scaleX(${clamp(e.shield / e.shieldMax, 0, 1)})`; $('t-hu').style.transform = `scaleX(${clamp(e.hull / e.hullMax, 0, 1)})`;
      if (on) { place(leadEl, S.lead, undefined, false); } else leadEl.style.display = 'none';
      if (!on) { /* off-screen: radar shows it */ }
    } else { tgtEl.style.display = 'none'; leadEl.style.display = 'none'; }
    const ns = nearStation(); $('b-dock').style.display = ns >= 0 ? 'flex' : 'none';
    if (++flip % 2 === 0) drawRadar();
  } else { for (const e of mk) e.style.display = 'none'; mkWp.style.display = 'none'; tgtEl.style.display = 'none'; leadEl.style.display = 'none'; $('b-dock').style.display = 'none'; }
  updateAudio();
  composer.render();
}

// menu backdrop: the ship idling next to HELIOS PRIME
(function menuScene() { S.pos.set(30, 14, 150); _m.lookAt(_zero, V3(-0.15, 0.05, -1).normalize(), Y); S.q.setFromRotationMatrix(_m); S.camQ.copy(S.q); S.mode = 'menu'; ST = stats(); for (let i = 0; i < AST_N; i++) spawnAsteroid(asteroids[i], true); })();
requestAnimationFrame(frame);
document.addEventListener('visibilitychange', () => { last = performance.now(); if (actx) { document.hidden ? actx.suspend() : actx.resume(); } });
window.__sc = { S, stations, save, enemies, startGame, spawnEnemy, dockAt, damageEnemy, THREE, renderer };