import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
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
const BUILD = 31;

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
const fill = new THREE.DirectionalLight(0xffe6cc, 1.5); scene.add(fill);   // soft light from behind the camera, so rocks and the ship are never pure silhouettes

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
// the racing rover body, wheels removed: it hovers in space
const roverBody = (() => {
  const rover = new THREE.Group();
  const mergeSafe = (list, groups) => mergeGeometries(list.map(g => (g.index ? g.toNonIndexed() : g)), groups);
  rover.rotation.order = 'YXZ';

  const MATS = {
    light:  new THREE.MeshStandardMaterial({ color: 0xa9b8c2, metalness: 0.20, roughness: 0.60, flatShading: true, envMapIntensity: 0.6 }),
    joint:  new THREE.MeshStandardMaterial({ color: 0x6a717a, metalness: 0.60, roughness: 0.45, flatShading: true }),
    dome:   new THREE.MeshStandardMaterial({ color: 0x4ea2ec, emissive: 0x0c3470, emissiveIntensity: 0.45, metalness: 0.0, roughness: 0.1, flatShading: true, envMapIntensity: 1.2, transparent: true, opacity: 0.42, depthWrite: false }),
    black:  new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.70, flatShading: true }),
    glow:   new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.8, flatShading: true , polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    tail:   new THREE.MeshStandardMaterial({ color: 0xff3322, emissive: 0xff2211, emissiveIntensity: 0.9, flatShading: true , polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    tailHot: new THREE.MeshStandardMaterial({ color: 0xffc8bb, emissive: 0xff6a55, emissiveIntensity: 1.4 }),
    revLamp: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xdfeeff, emissiveIntensity: 0.1 }),
    amber:   new THREE.MeshStandardMaterial({ color: 0xffa020, emissive: 0xff8a00, emissiveIntensity: 0.5 }),
    headHot: new THREE.MeshStandardMaterial({ color: 0xe8fbff, emissive: 0xbfefff, emissiveIntensity: 1.8 , polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    hullS: new THREE.MeshStandardMaterial({ color: 0x23282d, emissive: 0x080a0c, metalness: 0.15, roughness: 0.55, envMapIntensity: 0.5, flatShading: true }),
    deckS: new THREE.MeshStandardMaterial({ color: 0xdfe3e7, emissive: 0x1a1f24, metalness: 0.05, roughness: 0.55, envMapIntensity: 0.4, flatShading: true }),
    midS:  new THREE.MeshStandardMaterial({ color: 0x7c868e, metalness: 0.10, roughness: 0.55, envMapIntensity: 0.5, flatShading: true }),
    tailDark: new THREE.MeshStandardMaterial({ color: 0x3a0707, emissive: 0x2a0000, emissiveIntensity: 0.8, flatShading: true , polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    darkS: new THREE.MeshStandardMaterial({ color: 0x1f2328, metalness: 0.35, roughness: 0.60, flatShading: true }),
    neon:  new THREE.MeshStandardMaterial({ color: 0x2fd6ff, emissive: 0x2fd6ff, emissiveIntensity: 2.2, flatShading: true }),
    tyre:  new THREE.MeshStandardMaterial({ color: 0x1b1d21, metalness: 0.10, roughness: 0.55, envMapIntensity: 0.8, flatShading: true, side: THREE.DoubleSide }),
    rim:   new THREE.MeshStandardMaterial({ color: 0x2b3036, metalness: 0.55, roughness: 0.40, flatShading: true })
  };

  const BODY_LIFT = 0.85;
  const buckets = {};
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _v = new THREE.Vector3();
  const _s = new THREE.Vector3();
  const _va = new THREE.Vector3();
  const _vb = new THREE.Vector3();
  const _vd = new THREE.Vector3();
  const ZAXIS = new THREE.Vector3(0, 0, 1);
  const YAXIS = new THREE.Vector3(0, 1, 0);

  function place(px, py, pz, rx, ry, rz) {
    _q.setFromEuler(_e.set(rx || 0, ry || 0, rz || 0));
    return new THREE.Matrix4().compose(_v.set(px, py, pz), _q, _s.set(1, 1, 1));
  }
  function part(geo, matrix, key) {
    const g = geo.clone();
    g.applyMatrix4(matrix);
    (buckets[key] = buckets[key] || []).push(g);
  }
  function scaleLast(key, sx, sy, sz) {
    buckets[key][buckets[key].length - 1].scale(sx, sy, sz);
  }
  function partBeam(key, fx, fy, fz, tx, ty, tz, t) {
    _va.set(fx, fy, fz); _vb.set(tx, ty, tz);
    _vd.subVectors(_vb, _va);
    const len = _vd.length(); _vd.normalize();
    _q.setFromUnitVectors(ZAXIS, _vd);
    const g = new THREE.BoxGeometry(t, t, len);
    const m = new THREE.Matrix4().compose(
      _v.copy(_va).addScaledVector(_vd, len / 2), _q, _s.set(1, 1, 1));
    g.applyMatrix4(m);
    (buckets[key] = buckets[key] || []).push(g);
  }
  function partDisc(key, x, y, z, r, h, ax, ay, az, segs) {
    _vd.set(ax, ay, az).normalize();
    _q.setFromUnitVectors(YAXIS, _vd);
    const g = new THREE.CylinderGeometry(r, r, h, segs || 10);
    const m = new THREE.Matrix4().compose(_v.set(x, y, z), _q, _s.set(1, 1, 1));
    g.applyMatrix4(m);
    (buckets[key] = buckets[key] || []).push(g);
  }
  function partCoil(key, fx, fy, fz, tx, ty, tz, turns, radius, tube) {
    _va.set(fx, fy, fz); _vb.set(tx, ty, tz);
    _vd.subVectors(_vb, _va);
    const len = _vd.length(); _vd.normalize();
    _q.setFromUnitVectors(ZAXIS, _vd);
    for (let i = 0; i < turns; i++) {
      const tt = (i + 0.5) / turns;
      const g = new THREE.TorusGeometry(radius, tube, 6, 12);
      const m = new THREE.Matrix4().compose(
        _v.copy(_va).addScaledVector(_vd, len * tt), _q, _s.set(1, 1, 1));
      g.applyMatrix4(m);
      (buckets[key] = buckets[key] || []).push(g);
    }
  }

  function partPiston(fx, fy, fz, tx, ty, tz) {
    const mx = fx + (tx - fx) * 0.55, my = fy + (ty - fy) * 0.55, mz = fz + (tz - fz) * 0.55;
    const l1 = Math.hypot(mx - fx, my - fy, mz - fz), l2 = Math.hypot(tx - mx, ty - my, tz - mz);
    partDisc('darkS', (fx + mx) / 2, (fy + my) / 2, (fz + mz) / 2, 0.12, l1, tx - fx, ty - fy, tz - fz, 8);
    partDisc('armS', (mx + tx) / 2, (my + ty) / 2, (mz + tz) / 2, 0.07, l2, tx - fx, ty - fy, tz - fz, 6);
  }

  function partRB(key, x, y, z, w, h, d, r, rx, ry, rz) {
    part(new RoundedBoxGeometry(w, h, d, 1, r), place(x, y, z, rx, ry, rz), key);
  }
  function partPlate(key, fx, fy, fz, tx, ty, tz, w, t) {
    _va.set(fx, fy, fz); _vb.set(tx, ty, tz);
    _vd.subVectors(_vb, _va);
    const len = _vd.length(); _vd.normalize();
    _q.setFromUnitVectors(ZAXIS, _vd);
    const g = new RoundedBoxGeometry(w, t, len + 0.1, 1, Math.min(w, t) * 0.35);
    g.applyMatrix4(new THREE.Matrix4().compose(_v.copy(_va).addScaledVector(_vd, len / 2), _q, _s.set(1, 1, 1)));
    (buckets[key] = buckets[key] || []).push(g);
  }

  const B = new THREE.BoxGeometry(1, 1, 1);

  // ---- Dark cartoon outline (inverted hull) like the target image ----
  const OUTLINE_KEYS = ['hullS', 'deckS', 'midS', 'darkS'];
  const OUTLINE_MAT = new THREE.MeshBasicMaterial({ color: 0x15110d, side: THREE.BackSide });
  const OUTLINE_W = { value: 0.03 };   // set from the render resolution in applyPR()
  OUTLINE_MAT.onBeforeCompile = (sh) => {
    sh.uniforms.uOutlineW = OUTLINE_W;
    sh.vertexShader = 'uniform float uOutlineW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += normalize(normal) * uOutlineW;');
  };
  function makeOutlineGeo(src) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', src.attributes.position.clone());
    if (src.index) g.setIndex(src.index.clone());
    const m = mergeVertices(g, 1e-3);
    m.computeVertexNormals();
    return m;
  }

  // ---- Angular racing body (low-poly, faceted). Each block = 8 corners: bottom ring (front-left, front-right, back-right, back-left) then the top ring. Front is -z. ----
  const HEX_T = [[0,1,2],[0,2,3],[4,6,5],[4,7,6],[0,5,1],[0,4,5],[1,6,2],[1,5,6],[2,7,3],[2,6,7],[3,4,0],[3,7,4]];
  function hexBlock(key, P, mirror) {
    if (mirror) P = P.map(p => [-p[0], p[1], p[2]]);
    let cx = 0, cy = 0, cz = 0;
    P.forEach(p => { cx += p[0] / 8; cy += p[1] / 8; cz += p[2] / 8; });
    const pos = [];
    HEX_T.forEach(t => {
      const a = P[t[0]]; let b = P[t[1]], c = P[t[2]];
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const fx = (a[0] + b[0] + c[0]) / 3 - cx, fy = (a[1] + b[1] + c[1]) / 3 - cy, fz = (a[2] + b[2] + c[2]) / 3 - cz;
      if (nx * fx + ny * fy + nz * fz < 0) { const s = b; b = c; c = s; }   // always face outwards
      pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
    g.computeVertexNormals();
    (buckets[key] = buckets[key] || []).push(g);
  }
  function hexSym(key, P) { hexBlock(key, P, false); hexBlock(key, P, true); }
  // ---- Rounded (chamfered) solids: convex hull of a point cloud, built with a tiny hull routine (no extra libraries) ----
  function hullGeo(pts) {
    const n = pts.length, planes = new Map(), EPS = 1e-5;
    let cx = 0, cy = 0, cz = 0; pts.forEach(p => { cx += p[0] / n; cy += p[1] / n; cz += p[2] / n; });
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
      const a = pts[i], b = pts[j], c = pts[k];
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz); if (l < 1e-9) continue;
      nx /= l; ny /= l; nz /= l;
      let d = nx * a[0] + ny * a[1] + nz * a[2];
      if (nx * cx + ny * cy + nz * cz - d > 0) { nx = -nx; ny = -ny; nz = -nz; d = -d; }   // make the normal point away from the middle
      let ok = true;
      for (let m = 0; m < n; m++) { if (nx * pts[m][0] + ny * pts[m][1] + nz * pts[m][2] - d > EPS) { ok = false; break; } }
      if (!ok) continue;
      const key = [nx, ny, nz, d].map(v => Math.round(v * 2000)).join(',');
      if (!planes.has(key)) {
        const idx = [];
        for (let m = 0; m < n; m++) if (Math.abs(nx * pts[m][0] + ny * pts[m][1] + nz * pts[m][2] - d) <= EPS) idx.push(m);
        planes.set(key, { n: [nx, ny, nz], idx });
      }
    }
    const pos = [];
    planes.forEach(({ n: nn, idx }) => {
      let px = 0, py = 0, pz = 0; idx.forEach(m => { px += pts[m][0] / idx.length; py += pts[m][1] / idx.length; pz += pts[m][2] / idx.length; });
      let ex = pts[idx[0]][0] - px, ey = pts[idx[0]][1] - py, ez = pts[idx[0]][2] - pz;
      const el = Math.hypot(ex, ey, ez) || 1; ex /= el; ey /= el; ez /= el;
      const fx = nn[1] * ez - nn[2] * ey, fy = nn[2] * ex - nn[0] * ez, fz = nn[0] * ey - nn[1] * ex;   // n x e
      const ord = idx.map(m => { const dx = pts[m][0] - px, dy = pts[m][1] - py, dz = pts[m][2] - pz; return { m, a: Math.atan2(dx * fx + dy * fy + dz * fz, dx * ex + dy * ey + dz * ez) }; }).sort((p, q) => p.a - q.a);
      for (let t = 1; t < ord.length - 1; t++) [ord[0].m, ord[t].m, ord[t + 1].m].forEach(m => pos.push(pts[m][0], pts[m][1], pts[m][2]));
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
    g.computeVertexNormals();
    return g;
  }
  function hullBlock(key, pts) { (buckets[key] = buckets[key] || []).push(hullGeo(pts)); }
  // like hexBlock (same 8 corners) but every edge and corner is chamfered by about r
  function hexR(key, P, r, mirror) {
    if (mirror) P = P.map(p => [-p[0], p[1], p[2]]);
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const lu = (dist(P[0], P[1]) + dist(P[3], P[2]) + dist(P[4], P[5]) + dist(P[7], P[6])) / 4;
    const lv = (dist(P[0], P[4]) + dist(P[1], P[5]) + dist(P[2], P[6]) + dist(P[3], P[7])) / 4;
    const lw = (dist(P[0], P[3]) + dist(P[1], P[2]) + dist(P[4], P[7]) + dist(P[5], P[6])) / 4;
    const a = Math.min(0.4, r / lu), b = Math.min(0.4, r / lv), c = Math.min(0.4, r / lw);
    const tri = (u, v, w) => {
      const f = (i, j, k, l) => [0, 1, 2].map(q => (1 - w) * ((1 - u) * P[i][q] + u * P[j][q]) + w * ((1 - u) * P[l][q] + u * P[k][q]));
      const bo = f(0, 1, 2, 3), to = f(4, 5, 6, 7);
      return [0, 1, 2].map(q => (1 - v) * bo[q] + v * to[q]);
    };
    const pts = [];
    [a, 1 - a].forEach(u => [b, 1 - b].forEach(v => [0, 1].forEach(w => pts.push(tri(u, v, w)))));
    [a, 1 - a].forEach(u => [0, 1].forEach(v => [c, 1 - c].forEach(w => pts.push(tri(u, v, w)))));
    [0, 1].forEach(u => [b, 1 - b].forEach(v => [c, 1 - c].forEach(w => pts.push(tri(u, v, w)))));
    hullBlock(key, pts);
  }
  function hexRSym(key, P, r) { hexR(key, P, r, false); hexR(key, P, r, true); }
  // rounded body section: the cross-section ring with every corner cut off (like a soft-edged hull instead of a box)
  const RING_CUT = [0.20, 0.12, 0.22, 0.22];
  function ringPts(S, z) {
    const P = [[0, S[0]], [S[1], S[0]], [S[3], S[2]], [S[5], S[4]], [S[7], S[6]], [0, S[6]]];
    const right = [];
    for (let i = 1; i <= 4; i++) {
      const c = P[i], p = P[i - 1], q = P[i + 1];
      const lp = Math.hypot(p[0] - c[0], p[1] - c[1]), lq = Math.hypot(q[0] - c[0], q[1] - c[1]);
      const dp = Math.min(RING_CUT[i - 1], lp * 0.45), dq = Math.min(RING_CUT[i - 1], lq * 0.45);
      right.push([c[0] + (p[0] - c[0]) / lp * dp, c[1] + (p[1] - c[1]) / lp * dp, z], [c[0] + (q[0] - c[0]) / lq * dq, c[1] + (q[1] - c[1]) / lq * dq, z]);
    }
    return right.concat(right.map(q => [-q[0], q[1], z]));
  }

  // ---- Racing body built from the multi-view target sheet (front / back / sides / top). Pre-lift coords (BODY_LIFT added later).
  //      Front is -z (front face z = -2.15), rear face is the plane z = 1.75. The wheels sit at the four corners (WZ); between them the side pods bulge out wide.
  //      Section: [bottom y, bottom half-w, waist y, waist half-w, top y, top half-w, bevel-top y, bevel-top half-w]
  const SECT = [
    [-2.15, [0.26, 0.95, 0.55, 1.55, 0.82, 1.56, 1.02, 0.62]],   // front face
    [-1.05, [0.22, 1.60, 0.56, 1.90, 0.86, 1.86, 1.06, 0.70]],   // pods start (behind the front wheels)
    [-0.55, [0.22, 1.85, 0.56, 2.15, 0.88, 2.08, 1.08, 0.72]],   // pods widest
    [ 0.45, [0.22, 1.85, 0.58, 2.15, 0.92, 2.06, 1.16, 0.70]],
    [ 1.05, [0.22, 1.05, 0.58, 1.66, 0.98, 1.66, 1.30, 0.66]],   // pods end (in front of the rear wheels)
    [ 1.75, [0.22, 1.00, 0.58, 1.62, 1.00, 1.64, 1.32, 0.66]]    // rear face
  ];
  const SEG_KEYS = [['hullS', 'hullS'], ['hullS', 'hullS'], ['hullS', 'hullS'], ['hullS', 'hullS'], ['hullS', 'hullS']];   // [upper sides, bevel] per segment: light-grey nose + pod ends, charcoal middle / back
  function loft(key, zA, A, zB, B, i0, i1) {   // block between two sections, from level i0 to level i1 (0 bottom, 1 waist, 2 top, 3 bevel top)
    hexBlock(key, [[-A[i0 * 2 + 1], A[i0 * 2], zA], [A[i0 * 2 + 1], A[i0 * 2], zA], [B[i0 * 2 + 1], B[i0 * 2], zB], [-B[i0 * 2 + 1], B[i0 * 2], zB],
                   [-A[i1 * 2 + 1], A[i1 * 2], zA], [A[i1 * 2 + 1], A[i1 * 2], zA], [B[i1 * 2 + 1], B[i1 * 2], zB], [-B[i1 * 2 + 1], B[i1 * 2], zB]]);
  }
  for (let k = 0; k < SECT.length - 1; k++) {
    const [zA, A] = SECT[k], [zB, B] = SECT[k + 1];
    hullBlock('hullS', ringPts(A, zA).concat(ringPts(B, zB)));   // one soft-edged hull segment (lower sides, upper sides and shoulders)
    // dark centre strip on top (the light-grey only shows on the shoulders)
    hexBlock('hullS', [[-0.42, A[6] - 0.02, zA], [0.42, A[6] - 0.02, zA], [0.42, B[6] - 0.02, zB], [-0.42, B[6] - 0.02, zB],
                       [-0.40, A[6] + 0.03, zA], [0.40, A[6] + 0.03, zA], [0.40, B[6] + 0.03, zB], [-0.40, B[6] + 0.03, zB]]);
    // thick cyan sill bar low on the pod sides, between the wheels (like the target's side view)
    if (k >= 1 && k <= 3) [-1, 1].forEach(s => partBeam('neon', s * (A[1] + 0.5 * (A[3] - A[1]) + 0.03), 0.40, zA + 0.05, s * (B[1] + 0.5 * (B[3] - B[1]) + 0.03), 0.40, zB - 0.05, 0.17));
  }
  // ---- White armour plates (target side/top views): a big front plate + a nose band forming the front "C", a separate wedge plate at the back, dark gap with the antenna between.
  //      Each plate = a slab on the pod wall + a slab on the shoulder (they wrap the upper corner), wide at the start and narrowing along +z.
  function secAt(z) {
    let k = 0; while (k < SECT.length - 2 && z > SECT[k + 1][0]) k++;
    const [za, A] = SECT[k], [zb, B] = SECT[k + 1], t = Math.max(0, Math.min(1, (z - za) / (zb - za)));
    return A.map((v, i) => v + (B[i] - v) * t);
  }
  function armour(zA, zB, wA, wB, th) {
    const A = secAt(zA), B = secAt(zB);
    const ys = (S, h) => S[4] + (S[5] - h) / (S[5] - S[7]) * (S[6] - S[4]);       // height of the shoulder surface at half-width h
    // wall slab (waist -> shoulder edge), pushed out by th
    hexRSym('deckS', [[A[3] - 0.05, A[2] + 0.04, zA], [A[3] + th, A[2] + 0.04, zA], [B[3] + th, B[2] + 0.04, zB], [B[3] - 0.05, B[2] + 0.04, zB],
                     [A[5] - 0.05, A[4] + 0.10, zA], [A[5] + th, A[4] + 0.10, zA], [B[5] + th, B[4] + 0.10, zB], [B[5] - 0.05, B[4] + 0.10, zB]], 0.06);
    // shoulder slab (lies on the sloped shoulder, wide -> narrow)
    const hiA = A[5] - wA, hiB = B[5] - wB;
    hexRSym('deckS', [[hiA, ys(A, hiA) - 0.02, zA], [A[5] + th, A[4] + 0.06, zA], [B[5] + th, B[4] + 0.06, zB], [hiB, ys(B, hiB) - 0.02, zB],
                     [hiA, ys(A, hiA) + 0.13, zA], [A[5] + th, A[4] + 0.16, zA], [B[5] + th, B[4] + 0.16, zB], [hiB, ys(B, hiB) + 0.13, zB]], 0.06);
  }
  armour(-1.95, -0.15, 0.80, 0.40, 0.13);     // front plate (continues into the nose band)
  armour(0.20, 1.45, 0.62, 0.30, 0.13);       // rear wedge plate
  // nose band across the front edge (the base of the "C")
  hexR('deckS', [[-1.60, 0.78, -2.17], [1.60, 0.78, -2.17], [1.50, 0.86, -1.80], [-1.50, 0.86, -1.80], [-1.55, 0.93, -2.17], [1.55, 0.93, -2.17], [1.45, 0.99, -1.80], [-1.45, 0.99, -1.80]], 0.07);
  const RS = SECT[SECT.length - 1][1];
  const sideW = y => y < RS[2] ? RS[1] + (y - RS[0]) / (RS[2] - RS[0]) * (RS[3] - RS[1]) : RS[3];   // rear half-width at height y
  // charcoal trapezoids on the rear and front faces between the light-grey bevel corners
  hexBlock('hullS', [[-1.15, 1.00, 1.74], [1.15, 1.00, 1.74], [1.15, 1.00, 1.775], [-1.15, 1.00, 1.775], [-0.62, 1.30, 1.74], [0.62, 1.30, 1.74], [0.62, 1.30, 1.775], [-0.62, 1.30, 1.775]]);
  hexBlock('hullS', [[-1.25, 0.82, -2.16], [1.25, 0.82, -2.16], [1.25, 0.82, -2.14], [-1.25, 0.82, -2.14], [-0.56, 1.00, -2.16], [0.56, 1.00, -2.16], [0.56, 1.00, -2.14], [-0.56, 1.00, -2.14]]);
  // hump behind the canopy with the little cyan light, and the seat / head rest
  // raised dark tail deck behind the canopy (sloping down to the rear, like the target) with two little cyan lights at its front
  hexR('darkS', [[-0.72, 1.27, 1.00], [0.72, 1.27, 1.00], [0.58, 1.27, 1.70], [-0.58, 1.27, 1.70], [-0.40, 1.47, 1.02], [0.40, 1.47, 1.02], [0.30, 1.35, 1.68], [-0.30, 1.35, 1.68]], 0.07);
  [-1, 1].forEach(sd => partRB('neon', sd * 0.20, 1.468, 1.10, 0.09, 0.022, 0.16, 0.007));
  // puffy rounded fairings on both sides of the canopy (the dark bulges flanking the glass in the target)
  hexRSym('darkS', [[0.74, 1.00, -0.86], [1.42, 1.00, -0.80], [1.38, 1.00, 0.86], [0.74, 1.00, 0.90], [0.80, 1.52, -0.72], [1.14, 1.52, -0.68], [1.12, 1.52, 0.74], [0.80, 1.52, 0.78]], 0.15);
  // dark underbody plate + front splitter
  hexBlock('darkS', [[-0.52, 0.16, -2.05], [0.52, 0.16, -2.05], [0.62, 0.16, 1.72], [-0.62, 0.16, 1.72], [-0.52, 0.24, -2.05], [0.52, 0.24, -2.05], [0.62, 0.24, 1.72], [-0.62, 0.24, 1.72]]);
  hexBlock('darkS', [[-0.70, 0.20, -2.40], [0.70, 0.20, -2.40], [0.64, 0.20, -2.10], [-0.64, 0.20, -2.10], [-0.70, 0.27, -2.40], [0.70, 0.27, -2.40], [0.64, 0.27, -2.10], [-0.64, 0.27, -2.10]]);
  // ---- Glass canopy (see-through, like the target): a low dark wall around two glass bubbles, the cockpit shows through the glass ----
  const MB = { cz: -0.05, ax: 0.72, az: 1.0, h: 0.74 };      // main bubble (ellipse half axes x / z, height)
  const FB = { cz: -1.05, ax: 0.50, az: 0.60, h: 0.50 };    // small front bubble
  const GY = 1.20;                                            // glass base height
  const inEll = (E, x, z) => (x / E.ax) ** 2 + ((z - E.cz) / E.az) ** 2;
  function glassWall(E, other) {
    const N = 28, k = 1.05;
    for (let i = 0; i < N; i++) {
      const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2, am = (a0 + a1) / 2;
      if (other && inEll(other, Math.sin(am) * E.ax * k, E.cz + Math.cos(am) * E.az * k) < 1.0) continue;   // this part is hidden inside the other bubble
      [1.15, 1.22].forEach(y => partBeam('darkS', Math.sin(a0) * E.ax * k, y, E.cz + Math.cos(a0) * E.az * k, Math.sin(a1) * E.ax * k, y, E.cz + Math.cos(a1) * E.az * k, 0.11));
    }
  }
  glassWall(MB, FB); glassWall(FB, MB);
  // frame ribs on the glass: a ridge along the roof and two arches (they follow the faceted dome)
  function glassRib(E, pts, t) {
    for (let i = 0; i < pts.length - 1; i++) partBeam('darkS', pts[i][0], pts[i][1], pts[i][2], pts[i + 1][0], pts[i + 1][1], pts[i + 1][2], t);
  }
  const ribPt = (E, x, z, k) => { const f = 1 - (x / E.ax) ** 2 - ((z - E.cz) / E.az) ** 2; return f <= 0 ? null : [x * k, GY + E.h * Math.sqrt(f) * k + 0.01, z]; };
  (function () {
    const ridge = []; for (let z = MB.cz - MB.az * 0.93; z <= MB.cz + MB.az * 0.93; z += MB.az / 5) { const q = ribPt(MB, 0, z, 1.03); if (q) ridge.push(q); }
    glassRib(MB, ridge, 0.035);
    [-0.52, 0.38].forEach(zz => {
      const pts = []; for (let a = 0; a <= 10; a++) {
        const c = 1 - ((zz - MB.cz) / MB.az) ** 2, w = MB.ax * Math.sqrt(c), th = a / 10 * Math.PI;
        pts.push([Math.cos(th) * w * 1.03, GY + Math.sin(th) * MB.h * Math.sqrt(c) * 1.03 + 0.01, zz]);
      }
      glassRib(MB, pts, 0.04);
    });
    const fr = []; for (let z = FB.cz - FB.az * 0.9; z <= FB.cz + FB.az * 0.5; z += FB.az / 4) { const q = ribPt(FB, 0, z, 1.03); if (q) fr.push(q); }
    glassRib(FB, fr, 0.03);
  })();
  const domeGeo = new THREE.SphereGeometry(0.5, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  domeGeo.scale(MB.ax * 2, MB.h * 2, MB.az * 2);
  part(domeGeo, place(0, GY, MB.cz), 'dome');
  const dome2 = new THREE.SphereGeometry(0.5, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  dome2.scale(FB.ax * 2, FB.h * 2, FB.az * 2);
  part(dome2, place(0, GY, FB.cz), 'dome');
  // cockpit: seat, head rest, dashboard with a neon strip, steering wheel, a little pod in the front bubble
  hexBlock('black', [[-0.26, 1.10, 0.04], [0.26, 1.10, 0.04], [0.26, 1.10, 0.46], [-0.26, 1.10, 0.46], [-0.24, 1.22, 0.06], [0.24, 1.22, 0.06], [0.24, 1.22, 0.46], [-0.24, 1.22, 0.46]]);   // seat cushion
  hexBlock('black', [[-0.26, 1.10, 0.42], [0.26, 1.10, 0.42], [0.26, 1.10, 0.56], [-0.26, 1.10, 0.56], [-0.22, 1.62, 0.50], [0.22, 1.62, 0.50], [0.22, 1.62, 0.62], [-0.22, 1.62, 0.62]]); // seat back
  hexBlock('midS', [[-0.14, 1.50, 0.48], [0.14, 1.50, 0.48], [0.14, 1.50, 0.58], [-0.14, 1.50, 0.58], [-0.12, 1.66, 0.52], [0.12, 1.66, 0.52], [0.12, 1.66, 0.60], [-0.12, 1.66, 0.60]]);   // head rest
  hexBlock('darkS', [[-0.30, 1.10, -0.82], [0.30, 1.10, -0.82], [0.50, 1.10, -0.40], [-0.50, 1.10, -0.40], [-0.28, 1.25, -0.80], [0.28, 1.25, -0.80], [0.46, 1.31, -0.42], [-0.46, 1.31, -0.42]]);   // dashboard
  partRB('neon', 0, 1.318, -0.50, 0.62, 0.02, 0.05, 0.005);
  partBeam('darkS', 0, 1.24, -0.46, 0, 1.36, -0.24, 0.05);
  part(new THREE.TorusGeometry(0.14, 0.025, 4, 10), place(0, 1.38, -0.22, -0.45, 0, 0), 'joint');
  hexBlock('darkS', [[-0.20, 1.10, -1.38], [0.20, 1.10, -1.38], [0.22, 1.10, -1.00], [-0.22, 1.10, -1.00], [-0.16, 1.24, -1.34], [0.16, 1.24, -1.34], [0.18, 1.26, -1.04], [-0.18, 1.26, -1.04]]);
  partRB('neon', 0, 1.27, -1.19, 0.20, 0.02, 0.05, 0.005);

  // ---- Cyan neon ----
  [-1, 1].forEach(s => partBeam('neon', s * (sideW(0.38) + 0.015), 0.38, 1.05, s * (sideW(0.38) + 0.015), 0.38, 1.60, 0.05));   // low side strip at the back

  // ---- Rear face (what the chase camera sees): narrow neon bar on a dark band near the top, V-slanted red lamps, big dark grille, light bumper ----
  partRB('darkS', 0, 0.90, 1.760, 2.20, 0.22, 0.02, 0.008);
  partRB('neon', 0, 0.90, 1.790, 1.50, 0.12, 0.04, 0.02);
  function lampBar(key, cx, cy, cz, w, h, d, ox, oy, roll, yaw) {
    const cr = Math.cos(roll), sr = Math.sin(roll), cy2 = Math.cos(yaw), sy2 = Math.sin(yaw);
    const lx = ox * cr - oy * sr, ly = ox * sr + oy * cr;
    partRB(key, cx + lx * cy2, cy + ly, cz - lx * sy2, w, h, d, Math.min(h, d) * 0.3, 0, yaw, roll);
  }
  // Sharp, swept lamp shapes. Each lamp is a thin plate whose outline is a tapered parallelogram: the outer end rises and ends in a point (an angry eye / a claw mark).
  // xi..xo = inner..outer x (mirrored for both sides), yi0/yi1 = bottom/top edge at the inner end, yo0/yo1 = bottom/top edge at the outer end.
  function slash(key, xi, xo, yi0, yi1, yo0, yo1, z, dir, th) {
    [-1, 1].forEach(sd => {
      const ring = zz => [[sd * xi, yi0, zz], [sd * xo, yo0, zz], [sd * xo, yo1, zz], [sd * xi, yi1, zz]];
      hexBlock(key, ring(z).concat(ring(z + dir * th)));
    });
  }
  // lampQuad: P = [inner-bottom, outer-bottom, outer-top, inner-top] as [x, y] (right side, mirrored). Housing + outline tube + inner line.
  function lampQuad(frameKey, coreKey, lineKey, P, z, dir) {
    const cx = (P[0][0] + P[1][0] + P[2][0] + P[3][0]) / 4, cy = (P[0][1] + P[1][1] + P[2][1] + P[3][1]) / 4;
    const grow = (q, g) => { const dx = q[0] - cx, dy = q[1] - cy, l = Math.hypot(dx, dy) || 1; return [q[0] + dx / l * g, q[1] + dy / l * g]; };
    [-1, 1].forEach(sd => {
      const ring = (Q, zz) => Q.map(q => [sd * q[0], q[1], zz]);
      const H = P.map(q => grow(q, 0.05));
      hexBlock('black', ring(H, z).concat(ring(H, z + dir * 0.035)));                                           // dark housing
      const C = P.map(q => grow(q, -0.04));
      hexBlock(coreKey, ring(C, z + dir * 0.02).concat(ring(C, z + dir * 0.045)));                             // core
      for (let i = 0; i < 4; i++) {                                                                              // outline tube
        const a = P[i], b = P[(i + 1) % 4];
        partBeam(frameKey, sd * a[0], a[1], z + dir * 0.05, sd * b[0], b[1], z + dir * 0.05, 0.045);
      }
      const L0 = [(P[0][0] * 0.55 + P[3][0] * 0.45), (P[0][1] * 0.55 + P[3][1] * 0.45)], L1 = [(P[1][0] * 0.55 + P[2][0] * 0.45), (P[1][1] * 0.55 + P[2][1] * 0.45)];
      partBeam(lineKey, sd * (L0[0] + (sd > 0 ? 0.04 : 0.04)), L0[1], z + dir * 0.06, sd * (L1[0] - 0.04), L1[1], z + dir * 0.06, 0.02);   // inner line
    });
  }
  // REAR LAMPS (paint shop colour): a big sheared parallelogram like the target: black housing, thick glowing outline, dark core and a bright inner line
  hexBlock('darkS', [[-0.46, 0.25, 1.74], [0.46, 0.25, 1.74], [0.42, 0.25, 1.86], [-0.42, 0.25, 1.86], [-0.46, 0.80, 1.74], [0.46, 0.80, 1.74], [0.42, 0.78, 1.86], [-0.42, 0.78, 1.86]]);   // grille frame
  partRB('black', 0, 0.515, 1.865, 0.74, 0.46, 0.02, 0.01);
  for (let j = 0; j < 5; j++) partRB('darkS', 0, 0.34 + j * 0.08, 1.878, 0.70, 0.016, 0.012, 0.004);
  partRB('deckS', 0, 0.20, 1.84, 0.98, 0.07, 0.20, 0.02);                          // light bumper bar under the grille
  [-1, 1].forEach(s => partRB('deckS', s * 0.46, 0.29, 1.88, 0.07, 0.18, 0.08, 0.02));

  // ---- Front face (the target's front mirrors the back): neon bar, V lamps, dark grille ----
  partRB('darkS', 0, 0.80, -2.175, 1.30, 0.20, 0.03, 0.01);
  partRB('neon', 0, 0.80, -2.195, 1.00, 0.10, 0.04, 0.02);
  // HEADLIGHTS: ALWAYS white (own materials, the paint shop never touches them). Angry eyes: the inner end is low, the outer end sweeps up into a point, with a dark brow above.
  hexBlock('darkS', [[-0.38, 0.27, -2.26], [0.38, 0.27, -2.26], [0.40, 0.27, -2.14], [-0.40, 0.27, -2.14], [-0.38, 0.64, -2.25], [0.38, 0.64, -2.25], [0.40, 0.66, -2.14], [-0.40, 0.66, -2.14]]);   // grille frame
  partRB('black', 0, 0.455, -2.265, 0.62, 0.30, 0.02, 0.01);
  for (let j = 0; j < 4; j++) partRB('darkS', 0, 0.35 + j * 0.07, -2.278, 0.58, 0.014, 0.012, 0.004);
  partRB('neon', 0, 0.275, -2.405, 1.36, 0.03, 0.025, 0.008);                                // splitter edge

  // ---- Tall antenna at the rear-right shoulder with a white lamp ----
  partBeam('joint', 0.84, 1.10, 1.30, 0.84, 2.65, 1.30, 0.035);

  const haloCv = document.createElement('canvas');
  haloCv.width = 64; haloCv.height = 64;
  const hc = haloCv.getContext('2d');
  const hg = hc.createRadialGradient(32, 32, 2, 32, 32, 32);
  hg.addColorStop(0, 'rgba(255,255,255,0.9)');
  hg.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  hg.addColorStop(1, 'rgba(255,255,255,0)');
  hc.fillStyle = hg; hc.fillRect(0, 0, 64, 64);
  const haloTex = new THREE.CanvasTexture(haloCv);
  haloTex.colorSpace = THREE.SRGBColorSpace;
  const tailHalos = [-1, 1].map(side => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloTex, color: 0xff3322, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.4, fog: false
    }));
    s.position.set(side * 1.05, 0.60 + BODY_LIFT, 1.88);
    s.scale.set(1.1, 0.6, 1);
    return s;
  });

  // soft glow in front of the lamps (colour follows the HEADLIGHTS paint)
  const fhCv = document.createElement('canvas');
  fhCv.width = 64; fhCv.height = 64;
  const fhc = fhCv.getContext('2d');
  const fhg = fhc.createRadialGradient(32, 32, 2, 32, 32, 32);
  fhg.addColorStop(0, 'rgba(255,255,255,0.95)');
  fhg.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  fhg.addColorStop(1, 'rgba(255,255,255,0)');
  fhc.fillStyle = fhg; fhc.fillRect(0, 0, 64, 64);
  const fhTex = new THREE.CanvasTexture(fhCv);
  fhTex.colorSpace = THREE.SRGBColorSpace;
  const frontHalos = [-1, 1].map(side => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: fhTex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.4, fog: false
    }));
    s.position.set(side * 1.00, 0.60 + BODY_LIFT, -2.30);
    s.scale.set(1.1, 0.5, 1);
    return s;
  });

  Object.keys(buckets).forEach(key => {
    const merged = mergeSafe(buckets[key], false);
    if (!merged) return;
    merged.translate(0, BODY_LIFT, 0);   // the body rides clearly above the wheels, like the target
    const mesh = new THREE.Mesh(merged, MATS[key]);
    if (OUTLINE_KEYS.includes(key)) rover.add(new THREE.Mesh(makeOutlineGeo(merged), OUTLINE_MAT));
    mesh.castShadow = key !== 'dome';
    rover.add(mesh);
  });
  Object.values(MATS).forEach(mt => { mt.fog = false; });
  MATS.hullS.color.setHex(0x4a535c); MATS.hullS.emissive.setHex(0x4a5663); MATS.deckS.emissive.setHex(0x7a838e); MATS.midS.emissive.setHex(0x59636e); MATS.darkS.color.setHex(0x333a43); MATS.darkS.emissive.setHex(0x303842); MATS.black.emissive.setHex(0x0c1016);
  return rover;
})();
roverBody.rotation.set(0, 0, 0); roverBody.scale.setScalar(1.25); roverBody.position.set(0, -1.35, 0.15);
shipBody.add(roverBody);
// hover pads: glowing discs under the four corners instead of wheels
const hoverPads = [];
for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const g = glowSprite(0x4fdcff, 2.2, 0.8); g.position.set(sx * 2.1, -1.45, sz * 2.0); shipBody.add(g); hoverPads.push(g); }
// twin engines at the rear: dark nacelles with a glowing nozzle ring; the thrust flames come out of them
const engMat = new THREE.MeshStandardMaterial({ color: 0x4a535c, roughness: 0.45, metalness: 0.6, emissive: 0x1c232b });
const nozMat = new THREE.MeshStandardMaterial({ color: 0x15191f, roughness: 0.6, metalness: 0.4, emissive: 0x05070a, side: THREE.DoubleSide });
const ringMat = new THREE.MeshBasicMaterial({ color: 0x7fe9ff });
const flameMat = new THREE.MeshBasicMaterial({ color: 0x7fe9ff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
const flameCones = [];
for (const s of [-1, 1]) {
  const e = new THREE.Group(); e.position.set(s * 1.3, -0.35, 2.55);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.42, 1.3, 16), engMat); body.rotation.x = Math.PI / 2; e.add(body);
  const intake = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.5, 0.22, 16), engMat); intake.rotation.x = Math.PI / 2; intake.position.z = -0.55; e.add(intake);
  const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.5, 0.35, 16, 1, true), nozMat); noz.rotation.x = Math.PI / 2; noz.position.z = 0.78; e.add(noz);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.035, 6, 20), ringMat); ring.position.z = 0.95; e.add(ring);
  const fc = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1, 12, 1, true), flameMat); fc.rotation.x = Math.PI / 2; fc.position.set(0, 0, 0.95); e.add(fc); flameCones.push(fc);
  const strut = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.9), engMat); strut.position.set(-s * 0.55, 0.15, -0.1); e.add(strut);
  shipBody.add(e);
}
const flames = [-1, 1].map(s => { const f = glowSprite(0x7fe9ff, 2.0, 0.8); f.position.set(s * 1.3, -0.35, 3.7); shipBody.add(f); return f; });
const flameCore = [-1, 1].map(s => { const f = glowSprite(0xffffff, 0.9, 0.9); f.position.set(s * 1.3, -0.35, 3.45); shipBody.add(f); return f; });

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
    // round, whole rock: a fine sphere with shared vertices, pushed in and out by smooth low-frequency waves (no spikes) plus a few shallow craters
    let g = new THREE.IcosahedronGeometry(1, 3); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g);
    const p = g.attributes.position, v = V3(), ph = [Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3];
    const craters = []; for (let c = 0; c < 4; c++) craters.push(V3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize());
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      let k = 1 + 0.07 * Math.sin(v.x * 2.4 + ph[0]) * Math.sin(v.y * 2.1 + ph[1]) + 0.05 * Math.sin(v.z * 3.1 + v.x * 1.7 + ph[2]) + 0.025 * Math.sin(v.y * 5.3 + v.z * 4.1 + ph[3]);
      for (const c of craters) { const d = v.dot(c); if (d > 0.9) { const t = (d - 0.9) / 0.1; k -= 0.075 * t * t * (3 - 2 * t); } }
      p.setXYZ(i, v.x * k * (0.88 + s * 0.12), v.y * k * (1.0 - s * 0.04), v.z * k * (1.1 - s * 0.1));
    }
    g.computeVertexNormals();
    { const cc = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = 0.82 + 0.18 * Math.sin(v.x * 6.1 + ph[0]) * Math.sin(v.y * 5.3 + ph[1]) * Math.sin(v.z * 6.7 + ph[2]); cc[i * 3] = n; cc[i * 3 + 1] = n * 0.97; cc[i * 3 + 2] = n * 0.93; } g.setAttribute('color', new THREE.BufferAttribute(cc, 3)); }
    const m = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9, metalness: 0.05, flatShading: false, emissive: 0x1c1610 }), AST_PER);
    m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < AST_PER; i++) {
      col.setHSL(rnd(0.05, 0.1), rnd(0.1, 0.28), rnd(0.42, 0.62)); m.setColorAt(i, col);
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
  shield: 80, hull: 100, boost: 100, thr: 1, boosting: false, regenT: 0, inv: 0, shake: 0, fireT: 0, side: 1,
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
    // soft engine: a looping deep "rumble" (filtered brown noise) plus a faint low hum - a calm thrust, no buzzy saw/square tone
    const rb = actx.createBuffer(1, actx.sampleRate * 3, actx.sampleRate), rd = rb.getChannelData(0); let last = 0;
    for (let i = 0; i < rd.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; rd[i] = last * 3.5; }
    const rs = actx.createBufferSource(); rs.buffer = rb; rs.loop = true;
    const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220; lp.Q.value = 0.7;
    const g = actx.createGain(); g.gain.value = 0.0;
    rs.connect(lp); lp.connect(g); g.connect(master); rs.start();
    const o1 = actx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 62; const hg = actx.createGain(); hg.gain.value = 0.0; o1.connect(hg); hg.connect(master); o1.start();
    const o2 = { frequency: { setTargetAtTime() {} } };
    const nb = actx.createBuffer(1, actx.sampleRate * 0.6, actx.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    eng = { master, o1, o2, lp, g, hg, nb };
  } catch (e) { actx = null; }
}
function sfx(kind, k) {
  if (!actx || !save.snd || actx.state !== 'running') return; const t = actx.currentTime;
  const tone = (type, f0, f1, dur, vol, delay) => { const o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t + (delay || 0)); o.frequency.exponentialRampToValueAtTime(f1, t + (delay || 0) + dur); g.gain.setValueAtTime(vol, t + (delay || 0)); g.gain.exponentialRampToValueAtTime(0.001, t + (delay || 0) + dur); o.connect(g); g.connect(eng.master); o.start(t + (delay || 0)); o.stop(t + (delay || 0) + dur + 0.02); };
  const noise = (cut, dur, vol) => { const s = actx.createBufferSource(); s.buffer = eng.nb; const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cut; const g = actx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f); f.connect(g); g.connect(eng.master); s.start(t); };
  if (kind === 'laser') {
    if (t - lastLaser < 0.07) return; lastLaser = t; const r = 0.95 + Math.random() * 0.1;
    // blaster: punchy low thump + a bright saw zap that sweeps down through a closing filter + a high sparkle + a tiny click
    const sweep = (type, f0, f1, dur, vol, cut0, cut1, det) => {
      const o = actx.createOscillator(), f = actx.createBiquadFilter(), g = actx.createGain(); o.type = type; o.detune.value = det || 0;
      o.frequency.setValueAtTime(f0 * r, t); o.frequency.exponentialRampToValueAtTime(f1 * r, t + dur);
      f.type = 'lowpass'; f.Q.value = 3; f.frequency.setValueAtTime(cut0, t); f.frequency.exponentialRampToValueAtTime(cut1, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(f); f.connect(g); g.connect(eng.master); o.start(t); o.stop(t + dur + 0.02);
    };
    sweep('sine', 240, 60, 0.11, 0.2, 2000, 2000);
    sweep('sawtooth', 1700, 170, 0.2, 0.075, 5000, 500, 0);
    sweep('sawtooth', 1700, 170, 0.2, 0.05, 5000, 500, 14);
    sweep('triangle', 3400, 1100, 0.07, 0.04, 9000, 3000);
    const cs = actx.createBufferSource(); cs.buffer = eng.nb; const cf = actx.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 3500; cf.Q.value = 0.9; const cg = actx.createGain(); cg.gain.setValueAtTime(0.09, t); cg.gain.exponentialRampToValueAtTime(0.001, t + 0.03); cs.connect(cf); cf.connect(cg); cg.connect(eng.master); cs.start(t); cs.stop(t + 0.04);
  }
  else if (kind === 'elaser') { tone('triangle', 520, 140, 0.16, 0.05); tone('sine', 1300, 300, 0.1, 0.025); }
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
  eng.lp.frequency.setTargetAtTime(160 + k * 380 + (S.boosting ? 380 : 0), t, 0.12);
  eng.g.gain.setTargetAtTime(on ? 0.16 + k * 0.20 + (S.boosting ? 0.16 : 0) : 0.0, t, 0.2);
  eng.o1.frequency.setTargetAtTime(58 + k * 30 + (S.boosting ? 22 : 0), t, 0.2);
  eng.hg.gain.setTargetAtTime(on ? 0.025 + k * 0.03 : 0.0, t, 0.2);
}

// ---------- fullscreen (needs a tap; tries again on every tap until it works) ----------
{
  const fsBtn = $('b-fs'); let fsOk = false, userExited = false, tries = 0;
  const isFS = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  const requestFS = () => {
    const el = document.documentElement, rq = el.requestFullscreen || el.webkitRequestFullscreen; if (!rq) return;
    try { const p = rq.call(el, { navigationUI: 'hide' }); if (p && p.then) p.then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) {} }).catch(() => {}); } catch (e) {}
  };
  const autoFS = () => { if (isFS() || userExited || tries > 10) return; tries++; requestFS(); };
  const onFS = () => { const on = isFS(); if (fsOk && !on) userExited = true; fsOk = on; if (fsBtn) fsBtn.style.display = on ? 'none' : ''; setTimeout(() => dispatchEvent(new Event('resize')), 80); };
  document.addEventListener('fullscreenchange', onFS); document.addEventListener('webkitfullscreenchange', onFS);
  if (fsBtn) fsBtn.addEventListener('click', () => { if (isFS()) { const ex = document.exitFullscreen || document.webkitExitFullscreen; if (ex) ex.call(document); } else { userExited = false; requestFS(); } });
  document.addEventListener('touchstart', autoFS, { passive: true }); document.addEventListener('pointerdown', autoFS);
  if (!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen) && fsBtn) fsBtn.style.display = 'none';
}

// ---------- throttle slider (drag up = faster, down = slower; boost still works on top) ----------
{
  const el = $('thr'), trk = el.querySelector('.trk'), fl = $('thr-fl'), hd = $('thr-hd'); let id = null;
  const show = () => { const p = (S.thr - 0.2) / 0.8; fl.style.transform = `scaleY(${p})`; hd.style.top = (1 - p) * 100 + '%'; };
  const setFrom = (y) => { const r = trk.getBoundingClientRect(); S.thr = clamp(0.2 + 0.8 * (1 - (y - r.top) / r.height), 0.2, 1); show(); };
  el.addEventListener('pointerdown', (e) => { id = e.pointerId; el.setPointerCapture(id); setFrom(e.clientY); e.preventDefault(); });
  el.addEventListener('pointermove', (e) => { if (e.pointerId === id) setFrom(e.clientY); });
  const end = (e) => { if (e.pointerId === id) id = null; }; el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  show();
}

// ---------- input ----------
const keys = {}; let touchX = 0, touchY = 0, firing = false, boostHeld = false;
addEventListener('keydown', (e) => { keys[e.code] = true; if (e.code === 'Space') e.preventDefault(); if (e.code === 'KeyT') cycleTarget(); if (e.code === 'KeyM') fireMissile(); if (e.code === 'KeyE') tryDock(); });
addEventListener('keyup', (e) => { keys[e.code] = false; });
let stickId = null, stickOx = 0, stickOy = 0; let STICK_R = 62;
const stickEl = $('stick'), knob = $('knob');
const setKnob = (x, y) => { knob.style.transform = `translate(${x}px,${y}px)`; };
canvas.addEventListener('pointerdown', (e) => {
  if (stickId !== null || e.clientX > innerWidth * 0.5) return;
  stickId = e.pointerId; canvas.setPointerCapture(e.pointerId);
  const w = stickEl.offsetWidth || 132; STICK_R = w * 0.4; stickEl.style.left = clamp(e.clientX - w / 2, 4, innerWidth * 0.5) + 'px'; stickEl.style.bottom = (innerHeight - clamp(e.clientY + w / 2, w + 4, innerHeight - 4)) + 'px';
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
    save.kills++; persist(); $('kills').textContent = save.kills; if (S.target === e) S.target = null;
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
refreshHud(); updateMissHud(); $('kills').textContent = save.kills;

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
    let target = ST.cruise * S.thr;
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
  flames.forEach(f => { f.scale.setScalar(2.2 * fl * flick); f.material.color.setHex(S.boosting ? 0xffa050 : 0x7fe9ff); }); flameCore.forEach(f => f.scale.setScalar(0.9 * fl * flick)); flameMat.color.setHex(S.boosting ? 0xffa050 : 0x7fe9ff); flameCones.forEach(c => { c.scale.set(fl * (0.8 + 0.2 * flick), 1.2 * fl * flick + 0.3, fl * (0.8 + 0.2 * flick)); c.position.z = 0.95 + 0.6 * fl * flick + 0.15; });
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
  fill.position.set(0.5, 0.7, 1).applyQuaternion(camera.quaternion);

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