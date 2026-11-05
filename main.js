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
const BUILD = 48;

// ---------- save ----------
const SAVE_KEY = 'starCourier2';
let save = { credits: 100, up: [0, 0, 0, 0], missiles: 4, kills: 0, inv: false, snd: true, cargo: [0, 0, 0, 0, 0] };
try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && Array.isArray(s.up)) save = Object.assign(save, s); } catch (e) { }
if (!Array.isArray(save.cargo) || save.cargo.length !== 5) save.cargo = [0, 0, 0, 0, 0];
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
const camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 1, 40000);
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
  const spaceSun = (() => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(16, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.96, 0.82), fog: false, toneMapped: false }));
    skyS.add(m);
    return m;
  })();
  // ---- nebula: soft coloured gas clouds, dark dust lanes and a faint milky-way band, painted ONCE into a small texture (no per-frame cost) ----
  const spaceNebula = (() => {
    const W = 512, H = 256;
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
    const makeNeb = (PUR, TEAL, WARM, BASE) => {
    const data = new Uint8ClampedArray(W * H * 4);
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
    tex.generateMipmaps = false; tex.needsUpdate = true; return tex;
    };
    const tex = makeNeb([0.62, 0.16, 0.86], [0.08, 0.62, 0.92], [0.95, 0.40, 0.18], [0.012, 0.016, 0.045]);   // first system: purple / teal / warm
    let tex1 = null;   // YAPZO's own palette (amber / green / magenta), painted the first time you arrive
    const m = new THREE.Mesh(new THREE.SphereGeometry(465, 32, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }));
    m.renderOrder = -100; m.frustumCulled = false;
    skyS.add(m);
    m.userData.setSys = (k) => { if (k === 1 && !tex1) tex1 = makeNeb([0.92, 0.46, 0.08], [0.08, 0.78, 0.42], [0.86, 0.12, 0.38], [0.03, 0.02, 0.012]); m.material.map = k === 1 ? tex1 : tex; };
    return m;
  })();
spaceSun.position.copy(SUN_DIR).multiplyScalar(450);
{ const g1 = glowSprite(0xfff0c0, 110, 0.9); g1.position.copy(spaceSun.position); skyS.add(g1); }

// ---------- player ship ----------
const SHIP_K = 1.7;   // the whole ship is drawn 1.7x bigger
const ship = new THREE.Group(); ship.scale.setScalar(SHIP_K); scene.add(ship);
const shipBody = new THREE.Group(); ship.add(shipBody);
// shield bubble: a see-through glowing shell that ripples for a moment whenever the shield absorbs a hit (hidden otherwise, so it costs nothing)
const shGl = new THREE.Mesh(new THREE.SphereGeometry(4.6, 20, 14), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  uniforms: { op: { value: 0 }, t: { value: 0 } },
  vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
  fragmentShader: 'uniform float op; uniform float t; varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0); float r = 0.55 + 0.45 * sin(vP.z * 1.3 + vP.y * 1.7 - t * 16.0); gl_FragColor = vec4(vec3(0.25, 0.65, 1.0) * (f * 1.5 + 0.1) * r * op, 1.0); }' }));
shGl.scale.set(1, 0.65, 1.3); shGl.visible = false; ship.add(shGl);
// ---- the ship: a real fighter built from simple solids (one merged vertex-coloured mesh + a glass canopy + a glowing-accent mesh) ----
const roverBody = (() => {
  const grp = new THREE.Group(), Yc = -0.1;
  const HULL = 0xdde3ec, HULL2 = 0xb4bfcf, DARK = 0x39414d, DARK2 = 0x262c36, RED = 0xd0432e, CY = 0x35d4ff;
  const body = [], glow = [], glass = [];
  const E = new THREE.Euler(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), Sc = new THREE.Vector3(), M4 = new THREE.Matrix4();
  const put = (list, geo, color, pos, rot, scl) => {
    const g = geo.index ? geo.toNonIndexed() : geo; E.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0); Q.setFromEuler(E);
    M4.compose(P.set(pos[0], pos[1], pos[2]), Q, Sc.set(scl ? scl[0] : 1, scl ? scl[1] : 1, scl ? scl[2] : 1)); g.applyMatrix4(M4); g.computeVertexNormals();
    const c = new THREE.Color(color), n = g.attributes.position.count, col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('uv'); list.push(g);
  };
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const CYL = (r0, r1, h, seg) => new THREE.CylinderGeometry(r1, r0, h, seg || 10);   // r0 = front (-z) radius, r1 = rear (+z) radius once rotated along z
  const RX = Math.PI / 2;
  // "Warden": a bulbous armoured gunship - rounded dark hull with a glass dome, two long arms carrying cannon pods with glowing rings, twin thrusters at the rear
  const HC = 0xf0f3f8, HD = 0xc6ceda, GUN = 0x7c8698, ICE = 0x35d4ff;
  const loft = (secs, colFn, cx, cy, pw, mt) => {
    const N = 16, pos = [], idx = [];
    secs.forEach(s => { for (let j = 0; j < N; j++) { const a = j / N * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a), e = 2 / (pw || 2.6); pos.push(cx + Math.sign(c) * Math.pow(Math.abs(c), e) * s[1], cy + s[3] + Math.sign(sn) * Math.pow(Math.abs(sn), e) * s[2], s[0]); } });
    for (let i = 0; i < secs.length - 1; i++) for (let j = 0; j < N; j++) { const a = i * N + j, b = i * N + (j + 1) % N, c = (i + 1) * N + j, d = (i + 1) * N + (j + 1) % N; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const ng = g.toNonIndexed(), p = ng.attributes.position, col = new Float32Array(p.count * 3), cc = new THREE.Color();
    for (let i = 0; i < p.count; i++) { cc.set(colFn(p.getZ(i), p.getY(i) - cy)); col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b; }
    ng.setAttribute('color', new THREE.BufferAttribute(col, 3)); ng.deleteAttribute('uv'); if (mt) { ng.applyMatrix4(mt); ng.computeVertexNormals(); } body.push(ng);
  };
  // hull: broad rounded front tapering to the rear; panel-grey top, dark belly
  loft([[-3.7, 0.06, 0.06, 0], [-3.3, 0.5, 0.28, 0], [-2.6, 0.95, 0.5, 0.02], [-1.62, 1.32, 0.66, 0.05], [-1.56, 1.32, 0.66, 0.05], [-0.2, 1.3, 0.68, 0.05], [0.58, 1.2, 0.65, 0.04], [0.64, 1.2, 0.65, 0.04], [1.2, 1.05, 0.6, 0.03], [1.76, 0.92, 0.55, 0.02], [1.82, 0.92, 0.55, 0.02], [2.3, 0.78, 0.48, 0], [2.45, 0.2, 0.2, 0], [2.5, 0.03, 0.03, 0]],
    (z, y) => (Math.abs(z + 1.59) < 0.04 || Math.abs(z - 0.61) < 0.04 || Math.abs(z - 1.79) < 0.04) ? GUN : (y < -0.3 ? GUN : (y > 0.3 ? HC : HD)), 0, Yc, 2.5);
  // smooth sculpted parts only (no stacked boxes): dorsal spine, shoulder fairings, chin, glass dome, swept arms, cannon pods - all lofted
  put(glow, B(0.04, 0.04, 2.8), ICE, [-1.12, Yc + 0.2, -0.7], [0, 0.06, 0]); put(glow, B(0.04, 0.04, 2.8), ICE, [1.12, Yc + 0.2, -0.7], [0, -0.06, 0]);
  put(glow, B(0.12, 0.03, 1.6), ICE, [0, Yc + 0.66, 0.9]);
  put(glass, new THREE.SphereGeometry(0.5, 20, 14), 0x4a82b8, [0, Yc + 0.5, -1.85], 0, [0.98, 0.62, 2.05]);
  put(glow, B(0.05, 0.02, 1.5), 0xcfeaff, [0, Yc + 0.93, -1.9]);   // glint along the canopy
  for (const s of [-1, 1]) {
    // twin tail fins (they give the ship a proper fighter silhouette from behind) with a glowing edge, and a coloured navigation light on every wing pod
    loft([[0.35, 0.03, 0.05, 0], [0.9, 0.045, 0.42, 0.34], [1.8, 0.045, 0.56, 0.46], [2.5, 0.02, 0.12, 0.1]], (z, y) => y > 0.5 ? HD : HC, 0, 0, 2.2,
      new THREE.Matrix4().makeTranslation(s * 0.78, Yc + 0.22, 0).multiply(new THREE.Matrix4().makeRotationZ(-s * 0.28)));
    put(glow, B(0.1, 0.1, 0.1), s < 0 ? 0xff3a2a : 0x3aff6a, [s * 2.6, 0.48, 0.3]);
  }
  for (const s of [-1, 1]) {
    // swept arm: flat tapered blade from the hull to the pod, blending into both
    const th = Math.atan2(1.45 * s, -0.5);
    loft([[-0.95, 0.05, 0.05, 0], [-0.6, 0.42, 0.13, 0], [0, 0.55, 0.17, 0], [0.6, 0.42, 0.13, 0], [0.95, 0.05, 0.05, 0]], (z) => z > 0.2 ? HC : HD, 0, 0, 2.4, new THREE.Matrix4().makeTranslation(s * 1.85, Yc + 0.04, 0.25).multiply(new THREE.Matrix4().makeRotationY(th)));
    // cannon pod: one smooth capsule with a thicker rear collar
    loft([[-2.4, 0.05, 0.05, 0], [-2.0, 0.2, 0.2, 0], [-1.2, 0.3, 0.3, 0], [0.3, 0.36, 0.36, 0], [0.75, 0.42, 0.42, 0], [1.05, 0.3, 0.3, 0]], (z) => z > 0.2 ? HC : HD, s * 2.6, -0.05, 2.0);
    put(body, new THREE.CylinderGeometry(0.07, 0.07, 1.2, 8), GUN, [s * 2.6, -0.05, -1.7], [RX, 0, 0]);               // barrel
    put(glow, new THREE.CylinderGeometry(0.06, 0.06, 0.1, 8), 0xffffff, [s * 2.6, -0.05, -2.32], [RX, 0, 0]);        // muzzle
    put(glow, new THREE.TorusGeometry(0.34, 0.05, 6, 18), ICE, [s * 2.6, -0.05, 0.9]);                              // glowing ring
    put(glow, new THREE.TorusGeometry(0.3, 0.03, 6, 18), ICE, [s * 2.6, -0.05, -0.75]);
    loft([[-0.5, 0.02, 0.04, 0], [0, 0.03, 0.4, 0], [0.8, 0.03, 0.34, 0], [1.1, 0.02, 0.04, 0]], () => HC, s * 2.6, 0.32, 2.0);   // blade fin
  }
  for (const s of [-1, 1]) loft([[-0.63, 0.4, 0.3, 0], [-0.3, 0.42, 0.33, 0], [0.3, 0.42, 0.33, 0], [0.63, 0.38, 0.3, 0]], () => HD, 0, 0, 2.2,
    new THREE.Matrix4().makeTranslation(s * 1.22, -0.25, 1.75).multiply(new THREE.Matrix4().makeRotationY(s * Math.PI / 2)));   // engine pylon: a clean strut from hull to nacelle
  const sface = (c0, c1) => { const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 32); gr.addColorStop(0, c0); gr.addColorStop(1, c1); x.fillStyle = gr; x.fillRect(0, 0, 32, 32); return c; };
  const senv = new THREE.CubeTexture([sface('#e8eef8', '#3a4458'), sface('#d5dcea', '#2e374a'), sface('#ffffff', '#f2f6ff'), sface('#10141c', '#1c222e'), sface('#dbe2ee', '#3a4458'), sface('#e8eef8', '#323c50')]); senv.colorSpace = THREE.SRGBColorSpace; senv.needsUpdate = true;
  const bgeo = mergeGeometries(body);
  // armour-plate texture: drawn once in code (panels, seams, rivets, vents, scratches, hazard marks) and mapped per triangle along its dominant axis
  const drawPlates = (x, W, H, bump) => {
    let sd = 11; const rn = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    x.fillStyle = bump ? '#bbb' : '#d5dae4'; x.fillRect(0, 0, W, H);
    const panels = []; const split = (px, py, pw, ph, d) => { if (d > 3 || (d > 1 && rn() < 0.22) || pw < 70 || ph < 70) { panels.push([px, py, pw, ph]); return; } if ((pw > ph) ^ (rn() < 0.2)) { const c = pw * (0.35 + rn() * 0.3); split(px, py, c, ph, d + 1); split(px + c, py, pw - c, ph, d + 1); } else { const c = ph * (0.35 + rn() * 0.3); split(px, py, pw, c, d + 1); split(px, py + c, pw, ph - c, d + 1); } };
    split(0, 0, W, H, 0);
    for (const [px, py, pw, ph] of panels) {
      const t = rn(); x.fillStyle = bump ? `rgb(${170 + t * 40 | 0},${170 + t * 40 | 0},${170 + t * 40 | 0})` : `rgb(${196 + t * 40 | 0},${204 + t * 36 | 0},${216 + t * 30 | 0})`; x.fillRect(px + 2, py + 2, pw - 4, ph - 4);
      x.strokeStyle = bump ? '#222' : '#4c5466'; x.lineWidth = bump ? 7 : 5; x.strokeRect(px + 2.5, py + 2.5, pw - 5, ph - 5);
      if (!bump) { x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 1.5; x.strokeRect(px + 5, py + 5, pw - 10, ph - 10); }
      x.fillStyle = bump ? '#eee' : '#6c7486'; for (const [rx, ry] of [[9, 9], [pw - 9, 9], [9, ph - 9], [pw - 9, ph - 9]]) { x.beginPath(); x.arc(px + rx, py + ry, 2.2, 0, 7); x.fill(); }   // rivets
      const k = rn();
      if (k < 0.2 && pw > 90 && ph > 90) { x.strokeStyle = bump ? '#222' : '#2c3240'; x.lineWidth = 3; for (let i = 0; i < 5; i++) { const yy = py + ph * 0.3 + i * ph * 0.1; x.beginPath(); x.moveTo(px + pw * 0.2, yy); x.lineTo(px + pw * 0.8, yy); x.stroke(); } }   // vent slats
      else if (k < 0.32 && !bump) { x.fillStyle = rn() < 0.5 ? 'rgba(255,120,40,.85)' : 'rgba(53,212,255,.8)'; x.fillRect(px + pw * 0.15, py + ph * 0.45, pw * 0.7, 7); }   // marking stripe
    }
    x.lineCap = 'round'; for (let i = 0; i < 40; i++) { const sx = rn() * W, sy = rn() * H, a = rn() * 6.28, l = 6 + rn() * 26; x.strokeStyle = bump ? 'rgba(20,20,20,.5)' : (rn() < 0.5 ? 'rgba(40,46,60,.35)' : 'rgba(255,255,255,.35)'); x.lineWidth = 1; x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + Math.cos(a) * l, sy + Math.sin(a) * l); x.stroke(); }   // scratches
  };
  const plateMap = canvasTex(512, 512, (x, w, h) => drawPlates(x, w, h, false), [1, 1]);
  const plateBump = canvasTex(512, 512, (x, w, h) => drawPlates(x, w, h, true), [1, 1]); plateBump.colorSpace = THREE.NoColorSpace;
  plateMap.anisotropy = plateBump.anisotropy = 4;
  { const p = bgeo.attributes.position, uv = new Float32Array(p.count * 2), S3 = 1 / 3.2, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2); n.crossVectors(b.sub(a), c.sub(a)); const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
      for (let k = 0; k < 3; k++) { const X = p.getX(i + k), Y = p.getY(i + k), Z = p.getZ(i + k); let u, v; if (ay >= ax && ay >= az) { u = X; v = Z; } else if (ax >= az) { u = Z; v = Y; } else { u = X; v = Y; } uv[(i + k) * 2] = u * S3; uv[(i + k) * 2 + 1] = v * S3; }
    }
    bgeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); }
  { // bake light into the vertex colours: bright on top faces, dark underneath and in the belly = strong depth for free
    const nr = bgeo.attributes.normal, cl = bgeo.attributes.color, ps = bgeo.attributes.position;
    for (let i = 0; i < nr.count; i++) {
      const nx = nr.getX(i), ny = nr.getY(i), nz = nr.getZ(i), py = ps.getY(i), px = Math.abs(ps.getX(i));
      const key = Math.max(0, nx * -0.42 + ny * 0.78 + nz * -0.46);                  // key light: from above, front-left
      let f = 0.3 + 0.6 * key + 0.14 * (ny * 0.5 + 0.5);
      if (ny < -0.45) f *= 0.62; if (py < Yc - 0.4) f *= 0.78;                        // dark belly
      if (nz > 0.6) f *= 0.7;                                                         // rear faces in shade
      f *= 1 - 0.22 * Math.min(1, Math.max(0, (px - 0.9) / 0.5)) * (ny < 0.3 ? 1 : 0.4); // occlusion where arms meet the hull
      f *= 1.7; cl.setXYZ(i, Math.min(1, cl.getX(i) * f), Math.min(1, cl.getY(i) * f), Math.min(1, cl.getZ(i) * f));
    }
  }
  const bmat = new THREE.MeshStandardMaterial({ vertexColors: true, map: plateMap, bumpMap: plateBump, bumpScale: 1.6, roughness: 0.3, metalness: 0.7, flatShading: false, envMap: senv, envMapIntensity: 1.3, emissive: 0x2a303c });
  bmat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n float rimK = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0), 2.6); totalEmissiveRadiance += vec3(0.1, 0.55, 0.85) * rimK * 0.5;'); };   // cyan rim light round the silhouette
  const bm = new THREE.Mesh(bgeo, bmat);
  const gm = new THREE.Mesh(mergeGeometries(glow), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false }));
  const cm = new THREE.Mesh(mergeGeometries(glass), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.9, emissive: 0x123e66, transparent: true, opacity: 0.9 }));
  grp.add(bm, gm, cm); return grp;
})();
shipBody.add(roverBody);
const hoverPads = [];
// twin engines at the rear: dark nacelles with a glowing nozzle ring; the thrust flames come out of them
const engMat = new THREE.MeshStandardMaterial({ color: 0xbcc5d4, roughness: 0.4, metalness: 0.12, emissive: 0x3a4458, side: THREE.DoubleSide });
const nozMat = new THREE.MeshStandardMaterial({ color: 0x15191f, roughness: 0.6, metalness: 0.4, emissive: 0x05070a, side: THREE.DoubleSide });
const ringMat = new THREE.MeshBasicMaterial({ color: 0x7fe9ff });
const flameTex = canvasTex(8, 64, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.3, 'rgba(255,255,255,.18)'); g.addColorStop(0.7, 'rgba(255,255,255,.7)'); g.addColorStop(1, 'rgba(255,255,255,1)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
const mkFlame = (c, o) => new THREE.MeshBasicMaterial({ color: c, map: flameTex, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
const flameMats = [mkFlame(0x2a9dff, 0.5), mkFlame(0x7fe9ff, 0.55), mkFlame(0xffffff, 0.8)];   // outer glow, middle, white-hot core
const flameCols = [[0x2a9dff, 0xff5a1a], [0x7fe9ff, 0xffb050], [0xffffff, 0xfff0c0]];
const FL = [{ r: 0.5, len: 1.9, k: 0 }, { r: 0.33, len: 1.4, k: 1 }, { r: 0.18, len: 0.9, k: 2 }];
const flameCones = [];
// engine nacelle profile (radius, along-axis) turned into one smooth lathe: flared intake lip, slim body, step, bell-shaped nozzle
const engProf = [[0.0, -0.78], [0.3, -0.76], [0.52, -0.66], [0.5, -0.5], [0.45, -0.3], [0.47, 0.1], [0.55, 0.15], [0.55, 0.3], [0.44, 0.34], [0.42, 0.55], [0.5, 0.72], [0.6, 0.9], [0.55, 0.92], [0.46, 0.8], [0.0, 0.8]].map(p => new THREE.Vector2(p[0], p[1]));
const engGeo = new THREE.LatheGeometry(engProf, 20);
const engPod = new THREE.SphereGeometry(1, 14, 10);
const bandMat = new THREE.MeshStandardMaterial({ color: 0x6a7488, roughness: 0.5, metalness: 0.2, emissive: 0x1c2230 });
const coreMat = new THREE.MeshBasicMaterial({ color: 0x2a8fc0, toneMapped: false, fog: false });
for (const s of [-1, 1]) {
  const e = new THREE.Group(); e.position.set(s * 1.85, -0.25, 2.2);
  const body = new THREE.Mesh(engGeo, engMat); body.rotation.x = Math.PI / 2; e.add(body);
  const lipBand = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 6, 24), ringMat); lipBand.position.z = -0.66; e.add(lipBand);              // glowing intake lip
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.05, 6, 24), bandMat); band.position.z = 0.22; e.add(band);                           // armoured band
  const core = new THREE.Mesh(new THREE.CircleGeometry(0.43, 20), coreMat); core.position.z = 0.62; e.add(core);                                       // white-hot throat inside the nozzle
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.04, 6, 24), ringMat); ring.position.z = 0.91; e.add(ring);                            // glowing nozzle rim
  FL.forEach((L, k) => { const fc = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 16, 1, true), flameMats[k]); fc.rotation.x = Math.PI / 2; fc.position.set(0, 0, 0.95); fc.userData = { L, ph: s * 1.7 + k }; e.add(fc); flameCones.push(fc); });
  shipBody.add(e);
}
const flames = [-1, 1].map(s => { const f = glowSprite(0x7fe9ff, 2.0, 0.42); f.position.set(s * 1.85, -0.25, 3.35); shipBody.add(f); return f; });
const flameCore = [-1, 1].map(s => { const f = glowSprite(0xffffff, 0.9, 0.6); f.position.set(s * 1.85, -0.25, 3.1); shipBody.add(f); return f; });

// ---------- hangar room (Galaxy-on-Fire-style): far away from the world, enclosed, only drawn while docked ----------
const HP = V3(0, -6000, 0);
const padTiles = [];   // the amber markers on the landing pad (squares in the first system, triangles + circles in YAPZO)
const hangar = new THREE.Group(); hangar.position.copy(HP); hangar.visible = false; scene.add(hangar);
{
  const std = (c, e, r, mt) => new THREE.MeshStandardMaterial({ color: c, emissive: e, roughness: r === undefined ? 0.8 : r, metalness: mt === undefined ? 0.35 : mt, flatShading: true, fog: false });
  const glow = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: o !== undefined, opacity: o === undefined ? 1 : o, toneMapped: false, fog: false, side: THREE.DoubleSide });
  const add = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); hangar.add(o); return o; };
  const WR = 40, WH = 26;
  // walls, ceiling, floor
  const wallTex = canvasTex(512, 128, (x, w, h) => { x.fillStyle = '#222'; x.fillRect(0, 0, w, h); x.strokeStyle = '#333'; x.lineWidth = 3; for (let i = 0; i <= 16; i++) { x.beginPath(); x.moveTo(i * 32, 0); x.lineTo(i * 32, h); x.stroke(); } x.fillStyle = '#666'; for (let i = 0; i < 16; i++) x.fillRect(i * 32 + 6, 20, 20, 8); }, [3, 1]);
  add(new THREE.CylinderGeometry(WR, WR, WH, 48, 1, true), new THREE.MeshStandardMaterial({ map: wallTex, emissive: 0x2f7a46, emissiveMap: wallTex, roughness: 0.9, metalness: 0.2, side: THREE.BackSide, fog: false }), 0, WH / 2, 0);
  add(new THREE.CircleGeometry(WR, 48), std(0x1b2a22, 0x14301f), 0, WH, 0).rotation.x = Math.PI / 2;
  const floorTex = canvasTex(512, 512, (x, w, h) => { x.fillStyle = '#222'; x.fillRect(0, 0, w, h); x.strokeStyle = '#3a3a3a'; x.lineWidth = 2; for (let i = 0; i <= 16; i++) { x.beginPath(); x.moveTo(i * 32, 0); x.lineTo(i * 32, h); x.moveTo(0, i * 32); x.lineTo(w, i * 32); x.stroke(); } });
  const fl = add(new THREE.CircleGeometry(WR, 48), new THREE.MeshStandardMaterial({ map: floorTex, emissive: 0x2c6a40, emissiveMap: floorTex, roughness: 0.7, metalness: 0.4, fog: false }), 0, -0.6, 0); fl.rotation.x = -Math.PI / 2;
  // glowing wall strips
  [3.2, 20.5].forEach(y => add(new THREE.CylinderGeometry(WR - 0.3, WR - 0.3, 0.5, 48, 1, true), glow(0x44ff88, 0.85), 0, y, 0).material.side = THREE.BackSide);
  // big orange window on the back wall (towards -z): asteroid field in a red-orange glow
  const winTex = canvasTex(1024, 256, (x, w, h) => { x.fillStyle = '#000'; x.fillRect(0, 0, w, h); for (let i = 0; i < 260; i++) { const a = 0.35 + Math.random() * 0.65, r = Math.random() < 0.12 ? 1.6 : 0.9; x.fillStyle = `rgba(${200 + Math.random() * 55 | 0},${210 + Math.random() * 45 | 0},255,${a})`; x.beginPath(); x.arc(Math.random() * w, Math.random() * h, r, 0, 7); x.fill(); } });
  const win = add(new THREE.CylinderGeometry(WR - 0.6, WR - 0.6, 10, 24, 1, true, Math.PI - 1.0, 2.0), new THREE.MeshBasicMaterial({ map: winTex, side: THREE.BackSide, toneMapped: false, fog: false }), 0, 11.5, 0);
  add(new THREE.CylinderGeometry(WR - 0.5, WR - 0.5, 0.7, 24, 1, true, Math.PI - 1.0, 2.0), std(0x08100c, 0x061008), 0, 16.6, 0).material.side = THREE.BackSide;
  add(new THREE.CylinderGeometry(WR - 0.5, WR - 0.5, 0.7, 24, 1, true, Math.PI - 1.0, 2.0), std(0x08100c, 0x061008), 0, 6.4, 0).material.side = THREE.BackSide;
  // landing platform: stepped disc, glowing rings, amber tiles on the front
  add(new THREE.CylinderGeometry(12, 12.6, 0.9, 40), std(0x3f6a52, 0x1f4a32, 0.6, 0.5), 0, -0.15, 0);
  add(new THREE.CylinderGeometry(9.6, 10, 0.5, 40), std(0x4f8064, 0x2a5a3e, 0.55, 0.55), 0, 0.3, 0);
  const ring = (r0, r1, c, y) => { const o = add(new THREE.RingGeometry(r0, r1, 56), glow(c), 0, y, 0); o.rotation.x = -Math.PI / 2; };
  ring(11.7, 11.95, 0x7dffb0, 0.32); ring(8.2, 8.5, 0x44ff88, 0.56); ring(5.2, 5.4, 0x7dffb0, 0.56); ring(2.4, 2.6, 0x20e070, 0.56);
  add(new THREE.CylinderGeometry(2.3, 2.3, 0.1, 24), std(0x14502e, 0x0a3a20, 0.5, 0.4), 0, 0.56, 0);
  for (let k = 0; k < 9; k++) { const t = (k - 4) * 0.21, r = 9.0; const o = add(new THREE.BoxGeometry(0.9, 0.14, 1.0), glow(0xc8ffb0), Math.sin(t) * r, 0.58, Math.cos(t) * r); o.rotation.y = t; padTiles.push(o); }
  // crates and pillars around the walls
  let sd = 7; const rn = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 26; i++) {
    const a = rn() * Math.PI * 2, r = 25 + rn() * 11, w = 2.5 + rn() * 4, h = 2 + rn() * 5, d = 2.5 + rn() * 4;
    const c = add(new THREE.BoxGeometry(w, h, d), std(0x3a5a48 + ((rn() * 16 | 0) << 8), 0x1f4a32, 0.7, 0.4), Math.sin(a) * r, h / 2 - 0.6, Math.cos(a) * r); c.rotation.y = rn() * 3;
    if (rn() > 0.5) add(new THREE.BoxGeometry(w * 0.6, 0.18, 0.05), glow(0x5aff9a), Math.sin(a) * r, h * 0.7 - 0.6, Math.cos(a) * r).rotation.y = c.rotation.y + 0.0;
  }
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + 0.39; add(new THREE.CylinderGeometry(1.1, 1.1, WH, 8), std(0x2f4a3b, 0x1c3a28), Math.sin(a) * (WR - 1.4), WH / 2, Math.cos(a) * (WR - 1.4)); }
}
const padGeo = { box: padTiles[0].geometry, tri: new THREE.CylinderGeometry(0.75, 0.75, 0.14, 3), cir: new THREE.CylinderGeometry(0.52, 0.52, 0.14, 20) };
const setPad = (sys) => padTiles.forEach((o, k) => { o.geometry = sys === 1 ? (k % 2 ? padGeo.cir : padGeo.tri) : padGeo.box; });
let hangarVO = false, vo = 0;
// recolour the whole hangar to the colour of the station you docked at (hue only; shapes and brightness stay)
const hangarMats = []; hangar.traverse(ob => { if (ob.material && !hangarMats.some(r => r.m === ob.material)) hangarMats.push({ m: ob.material, c: ob.material.color.clone(), e: ob.material.emissive ? ob.material.emissive.clone() : null }); });
const _hs = { h: 0, s: 0, l: 0 };
function tintHangar(hex) {
  const hue = new THREE.Color(hex).getHSL(_hs).h;
  for (const r of hangarMats) {
    const re = (src, dst) => { src.getHSL(_hs); if (_hs.s > 0.15) dst.setHSL(hue, _hs.s, _hs.l); else dst.copy(src); };
    re(r.c, r.m.color); if (r.e) re(r.e, r.m.emissive);
  }
}

// ---------- enemy fighter (one merged mesh, vertex colours) ----------
const enemyGeo = (() => {
  const parts = [];
  const add = (geo, color, pos, rot) => {
    const g = geo.toNonIndexed(); if (rot) { _m.makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])); g.applyMatrix4(_m); } g.translate(pos[0], pos[1], pos[2]);
    const c = new THREE.Color(color), n = g.attributes.position.count, col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('uv'); parts.push(g);
  };
  // X-shaped raider: four arms in an X around a round central pod (the pilot is "inside", unseen)
  add(new THREE.SphereGeometry(1.15, 14, 10), 0x9a6c7a, [0, 0, 0]);                                  // central pod
  add(new THREE.TorusGeometry(1.2, 0.12, 6, 18), 0xff4a3a, [0, 0, 0]);                              // red armour band round the pod
  add(new THREE.CylinderGeometry(0.5, 0.62, 0.7, 10), 0x6a5460, [0, 0, 1.15], [Math.PI / 2, 0, 0]);  // rear engine block
  add(new THREE.SphereGeometry(0.42, 8, 6), 0xff7a4a, [0, 0, -1.0]);                                  // front sensor eye
  for (let k = 0; k < 4; k++) {
    const an = Math.PI / 4 + k * Math.PI / 2, c = Math.cos(an), s = Math.sin(an);
    // arm: tapered strut from the pod out to the tip, swept slightly backwards
    const L = 3.0, mid = 0.9 + L / 2;
    const g = new THREE.CylinderGeometry(0.28, 0.46, L, 6); g.rotateZ(an - Math.PI / 2);   // cylinder axis (y) -> pointing along the diagonal
    add(g, 0xb87d8a, [c * mid, s * mid, 0]);
    add(new THREE.CylinderGeometry(0.34, 0.44, 1.5, 7), 0x7a5a66, [c * 4.1, s * 4.1, 0.5], [Math.PI / 2, 0, 0]);            // wing-tip engine pod
    add(new THREE.SphereGeometry(0.3, 7, 5), 0xff6a3a, [c * 4.1, s * 4.1, -0.25]);                                          // glowing gun muzzle at the tip
  }
  return mergeGeometries(parts);
})();
const enemyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.35, flatShading: true, fog: false, emissive: 0x3c1a1c });
enemyMat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n float rimE = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.2); totalEmissiveRadiance += vec3(1.0, 0.25, 0.14) * rimE * 0.8;'); };   // red rim light so pirates stand out against dark space

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
const boltMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.7, 17), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false }), BOLT_N);
const boltHalo = new THREE.InstancedMesh(new THREE.BoxGeometry(1.9, 1.9, 19), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }), BOLT_N);
boltHalo.frustumCulled = false; boltHalo.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(boltHalo);
boltMesh.frustumCulled = false; boltMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(boltMesh);
for (let i = 0; i < BOLT_N; i++) { bolts.push({ pos: V3(), vel: V3(), life: 0, enemy: false, dmg: 0 }); boltMesh.setColorAt(i, _col.set(0xffffff)); boltHalo.setColorAt(i, _col.set(0x6dfcff)); }
let boltNext = 0;
function fireBolt(pos, dir, speed, dmg, enemy) {
  const b = bolts[boltNext]; boltNext = (boltNext + 1) % BOLT_N;
  b.pos.copy(pos); b.vel.copy(dir).multiplyScalar(speed); b.life = enemy ? 2.6 : 1.7; b.enemy = enemy; b.dmg = dmg;
  { const bi = bolts.indexOf(b); _col.set(enemy ? 0xff5a2a : 0x6dfcff); boltMesh.setColorAt(bi, _col); boltHalo.setColorAt(bi, _col); boltMesh.instanceColor.needsUpdate = true; boltHalo.instanceColor.needsUpdate = true; }
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
const ringTex = canvasTex(128, 128, (x, w, h) => { const g = x.createRadialGradient(64, 64, 34, 64, 64, 62); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.55, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
const EXP_N = 8, expl = [];
for (let i = 0; i < EXP_N; i++) { const f = glowSprite(0xffa040, 1, 0), r = glowSprite(0xffffff, 1, 0), w = glowSprite(0xffd9a0, 1, 0); w.material.map = ringTex; f.visible = r.visible = w.visible = false; scene.add(f, r, w); expl.push({ f, r, w, t: 99, size: 10 }); }
// tiny bright flash where a laser/missile hits
const HF_N = 6, hflash = []; for (let i = 0; i < HF_N; i++) { const s = glowSprite(0xbff8ff, 1, 0); s.visible = false; scene.add(s); hflash.push({ s, t: 9 }); } let hfNext = 0;
function hitFlash(p, big) { const h = hflash[hfNext]; hfNext = (hfNext + 1) % HF_N; h.t = 0; h.big = big ? 1.5 : 1; h.s.position.copy(p); h.s.visible = true; }
let explNext = 0;
function explode(p, size) {
  const e = expl[explNext]; explNext = (explNext + 1) % EXP_N; e.t = 0; e.size = size; e.f.position.copy(p); e.r.position.copy(p); e.f.visible = e.r.visible = true; e.w.position.copy(p); e.w.visible = size > 12;
  sparks(p, size > 12 ? 40 : 12, size * 3.2, 1.3); sfx('boom', size);
}
function updateFx(dt) {
  for (const e of expl) {
    if (e.t > 1) { if (e.f.visible) e.f.visible = e.r.visible = e.w.visible = false; continue; }
    e.t += dt * 1.5; const k = e.t, s = e.size * (0.5 + k * 2.4);
    e.f.scale.set(s, s, 1); e.f.material.opacity = Math.max(0, 1 - k) * 0.95; e.r.scale.set(s * 0.45, s * 0.45, 1); e.r.material.opacity = Math.max(0, 1 - k * 2.2);
    if (e.w.visible) { const ws = e.size * (1 + k * 7); e.w.scale.set(ws, ws, 1); e.w.material.opacity = Math.max(0, 1 - k) * 0.8; }
  }
  for (const h of hflash) { if (h.t > 1) { if (h.s.visible) h.s.visible = false; continue; } h.t += dt * 7; const s = (3 + h.t * 5) * h.big; h.s.scale.set(s, s, 1); h.s.material.opacity = Math.max(0, 1 - h.t); }
  if (!dbAlive) return; let any = false;
  for (let i = 0; i < DB_N; i++) {
    if (dbLife[i] <= 0) continue; dbLife[i] -= dt;
    if (dbLife[i] <= 0) { dbPos[i * 3 + 1] = -99999; continue; } any = true;
    dbPos[i * 3] += dbVel[i * 3] * dt; dbPos[i * 3 + 1] += dbVel[i * 3 + 1] * dt; dbPos[i * 3 + 2] += dbVel[i * 3 + 2] * dt;
  }
  dbGeo.attributes.position.needsUpdate = true; if (!any) dbAlive = 0;
}

// ---------- stations ----------
function buildStation(name, col, V) {
  const g = new THREE.Group(), spin = new THREE.Group(); g.add(spin);
  const darkM = new THREE.MeshStandardMaterial({ color: 0x3a4152, roughness: 0.6, metalness: 0.6, flatShading: true, fog: false });
  // alien-organic station: a horned dome, a bulging body with ribs, a neck ringed with spheres and a cage of petal fins around the hangar mouth
  const dots = canvasTex(512, 256, (x, w, h) => { x.fillStyle = '#2a3140'; x.fillRect(0, 0, w, h); const cs = ['#ffd24a', '#5dff8a', '#ff5ad2', '#4fe0ff', '#ffffff']; for (let i = 0; i < 1100; i++) { x.fillStyle = cs[Math.random() * cs.length | 0]; x.globalAlpha = 0.45 + Math.random() * 0.55; x.fillRect(Math.random() * w, Math.random() * h, 2, 2 + (Math.random() * 3 | 0)); } x.globalAlpha = 1; }, [3, 3]);
  // cheap fake reflections: a tiny 6-face canvas cube (blue planet below/behind, black space above) gives the glossy sheen of the reference
  const face = (c0, c1) => { const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 32); gr.addColorStop(0, c0); gr.addColorStop(1, c1); x.fillStyle = gr; x.fillRect(0, 0, 32, 32); return c; };
  const env = new THREE.CubeTexture([face('#1b2a44', '#3a78c8'), face('#1b2a44', '#2d5fa8'), face('#050810', '#0a1020'), face('#4a8ad8', '#8fc0f0'), face('#16223a', '#2f68b4'), face('#1b2a44', '#3a78c8')]); env.colorSpace = THREE.SRGBColorSpace; env.needsUpdate = true;
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xc4cad8).lerp(new THREE.Color(col), V.tint * 0.7), roughness: 0.55, metalness: 0.5, envMap: env, envMapIntensity: 0.9, emissive: 0xffffff, emissiveMap: dots, emissiveIntensity: 1.1, fog: false });
  const parts = [], Mx = new THREE.Matrix4(), Qq = new THREE.Quaternion(), Pp = new THREE.Vector3(), Ss = new THREE.Vector3();
  const put = (geo, pos, quat, scl) => { Mx.compose(Pp.set(pos[0], pos[1], pos[2]), quat || Qq.identity(), Ss.set(scl ? scl[0] : 1, scl ? scl[1] : 1, scl ? scl[2] : 1)); geo.applyMatrix4(Mx); parts.push(geo); };
  // spindle station: a smooth pearl-shaped hull, a glowing halo ring held on slim struts, swept tail blades round the hangar mouth and a crown of swept antennae
  const prof = [[0, -52], [4, -50.5], [10, -46], [17, -39], [22, -30], [25, -20], [24.5, -10], [20, -1], [14, 6], [10.5, 11], [10, 16], [10, 30], [11.5, 32]];
  const lathe = new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), 28); lathe.rotateX(Math.PI / 2); parts.push(lathe);
  // struts from the hull to the halo ring
  for (let k = 0; k < V.ribs; k++) { const an = k * Math.PI * 2 / V.ribs + 0.2; put(new THREE.BoxGeometry(1, 1, 1), [Math.cos(an) * 30, Math.sin(an) * 30, -19], Qq.clone().setFromAxisAngle(Z, an), [13, 1.4, 3]); }
  // swept tail blades round the hangar mouth (long, thin, leaning outwards)
  for (let k = 0; k < V.fins; k++) { const an = k * Math.PI * 2 / V.fins, d = new THREE.Vector3(Math.cos(an) * 0.2, Math.sin(an) * 0.2, 1).normalize(); put(new THREE.SphereGeometry(1, 12, 8), [Math.cos(an) * 14, Math.sin(an) * 14, 36], Qq.clone().setFromUnitVectors(Z, d), [V.fw * 0.75, 1.5, 22]); }
  // crown of swept antennae (they lean back from the nose)
  for (let hk = 0; hk < V.horns; hk++) { const an = hk * Math.PI * 2 / V.horns + 0.3, d = new THREE.Vector3(Math.cos(an) * 0.7, Math.sin(an) * 0.7, -0.7).normalize(); put(new THREE.ConeGeometry(1.5, 14 + 14 * V.hl, 8), [Math.cos(an) * 14, Math.sin(an) * 14, -43 - 3 * V.hl], Qq.clone().setFromUnitVectors(Y, d)); }
  if (V.spire) put(new THREE.ConeGeometry(2, 34, 8), [0, 0, -69], Qq.clone().setFromUnitVectors(Y, new THREE.Vector3(0, 0, -1)));
  { const halo = new THREE.Mesh(new THREE.TorusGeometry(38, 1.7, 8, 64), new THREE.MeshBasicMaterial({ color: V.band[0], toneMapped: false, fog: false })); halo.position.z = -19; g.add(halo); }
  g.add(new THREE.Mesh(mergeGeometries(parts), skin));
  const beacon = glowSprite(0x6fe8ff, 1, 0);   // kept only because the frame loop pulses it; not added to the scene
  g.userData = { spin, beacon };
  return g;
}
// ---------- second station style (YAPZO system): an industrial ring station - a big turning-wheel habitat on spokes round a long hub, solar wings and an open docking cage ----------
function buildStationB(name, col, V) {
  const g = new THREE.Group(), spin = new THREE.Group(); g.add(spin);
  const C = new THREE.Color(col);
  const win = canvasTex(256, 128, (x, w, h) => { x.fillStyle = '#c8d0dc'; x.fillRect(0, 0, w, h); x.fillStyle = '#6a7486'; for (let i = 0; i < w; i += 32) x.fillRect(i, 0, 2, h); for (let j = 0; j < h; j += 32) x.fillRect(0, j, w, 2); const cs = ['#ffe9a0', '#ffffff', '#9fe8ff']; for (let i = 0; i < 170; i++) { x.fillStyle = cs[Math.random() * 3 | 0]; x.fillRect((Math.random() * w) | 0, (Math.random() * h) | 0, 2, 2); } });
  const emTex = canvasTex(256, 128, (x, w, h) => { x.fillStyle = '#000'; x.fillRect(0, 0, w, h); const cs = ['#ffe9a0', '#ffffff', '#9fe8ff']; for (let i = 0; i < 170; i++) { x.fillStyle = cs[Math.random() * 3 | 0]; x.fillRect((Math.random() * w) | 0, (Math.random() * h) | 0, 3, 3); } });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xdfe4ec).lerp(C, V.tint), map: win, roughness: 0.55, metalness: 0.2, emissive: 0xffffff, emissiveMap: emTex, emissiveIntensity: 0.9, fog: false });
  const panelTex = canvasTex(128, 64, (x, w, h) => { x.fillStyle = '#16265a'; x.fillRect(0, 0, w, h); x.strokeStyle = '#4a70d0'; x.lineWidth = 1; for (let i = 0; i <= w; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); } for (let j = 0; j <= h; j += 16) { x.beginPath(); x.moveTo(0, j); x.lineTo(w, j); x.stroke(); } });
  const panelMat = new THREE.MeshStandardMaterial({ map: panelTex, roughness: 0.35, metalness: 0.7, emissive: 0x0a1a44, fog: false });
  const parts = [], pparts = [], Mx = new THREE.Matrix4(), Qq = new THREE.Quaternion(), Pp = new THREE.Vector3(), Ss = new THREE.Vector3();
  const put = (arr, geo, pos, quat, scl) => { Mx.compose(Pp.set(pos[0], pos[1], pos[2]), quat || Qq.identity(), Ss.set(scl ? scl[0] : 1, scl ? scl[1] : 1, scl ? scl[2] : 1)); geo.applyMatrix4(Mx); arr.push(geo); };
  const R = V.R;
  // hub: long pointed spindle along z (docking end at +z)
  const hub = new THREE.LatheGeometry([[0, -54], [4, -53], [8, -49], [9.5, -43], [9.5, 24], [12.5, 28], [12.5, 33], [10, 35]].map(p => new THREE.Vector2(p[0], p[1])), 20); hub.rotateX(Math.PI / 2); parts.push(hub);
  // the big habitat wheel(s) and the spokes holding them
  const rings = V.rings || 1;
  for (let r = 0; r < rings; r++) { const z = -14 + r * 14; put(parts, new THREE.TorusGeometry(R, V.tube || 3.8, 10, 44), [0, 0, z]); for (let k = 0; k < V.spokes; k++) { const an = k * Math.PI * 2 / V.spokes + 0.4; put(parts, new THREE.BoxGeometry(R - 8, 1.6, 2.2), [Math.cos(an) * (R + 8) / 2, Math.sin(an) * (R + 8) / 2, z], Qq.clone().setFromAxisAngle(Z, an)); } }
  // solar wings on booms
  for (let k = 0; k < (V.panels || 0); k++) { const sd = k % 2 ? -1 : 1, z = -38 + (k >> 1) * -9; put(parts, new THREE.BoxGeometry(14, 1.2, 1.2), [sd * 15, 0, z]); put(pparts, new THREE.BoxGeometry(24, 0.6, 12), [sd * 33, 0, z]); }
  // fuel tanks on the hub
  for (let k = 0; k < (V.tanks || 0); k++) { const an = k * Math.PI * 2 / V.tanks; put(parts, new THREE.SphereGeometry(5, 12, 9), [Math.cos(an) * 14, Math.sin(an) * 14, 12]); }
  // docking cage at the +z end: open frame of pylons round the mouth
  for (let k = 0; k < 6; k++) { const an = k * Math.PI / 3; put(parts, new THREE.BoxGeometry(2.2, 2.2, 22), [Math.cos(an) * 17, Math.sin(an) * 17, 42]); }
  g.add(new THREE.Mesh(mergeGeometries(parts), skin)); if (pparts.length) g.add(new THREE.Mesh(mergeGeometries(pparts), panelMat));
  // glowing strips: rim of the cage, a lit band on the wheel
  const glow = (c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false, fog: false });
  const cage = new THREE.Mesh(new THREE.TorusGeometry(17, 0.8, 6, 36), glow(V.band[0])); cage.position.z = 53; g.add(cage);
  const bandTex = canvasTex(256, 16, (x, w, h) => { for (let i = 0; i < 32; i++) { x.fillStyle = i % 4 === 0 ? V.band[1] : V.band[0]; x.fillRect(i * 8 + 1, 3, 6, 10); } }, [3, 1]);
  for (let r = 0; r < rings; r++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(R + (V.tube || 3.8) * 0.97, R + (V.tube || 3.8) * 0.97, 1.6, 48, 1, true), new THREE.MeshBasicMaterial({ map: bandTex, toneMapped: false, fog: false })); b.rotation.x = Math.PI / 2; b.position.z = -14 + r * 14; g.add(b); }
  const tip = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 6), glow(V.band[1])); tip.position.z = -56; g.add(tip);
  g.userData = { spin, beacon: glowSprite(0x6fe8ff, 1, 0) };
  return g;
}
// ---------- solar system: six planets in different colours, each with exactly ONE station in orbit next to it ----------
// pl.off = where the planet sits relative to its station (the station is always about one planet-radius + 400 away from the surface)
const stations = [
  { name: 'XIAQA', col: '#ffa040', v: { fins: 6, fw: 4.6, ribs: 8, horns: 2, hl: 1, ringN: 11, tint: 0.25, band: ['#4dff7a', '#ffd24a'] }, pos: V3(0, 0, 0), front: V3(0, -1, 0), pl: { kind: 'gas', r: 620, off: V3(-900, -150, -640), atm: [1.0, 0.55, 0.26], ring: true } },
  { name: 'TIANOG', col: '#4aa0ff', v: { fins: 4, fw: 5.4, ribs: 6, horns: 0, spire: 1, hl: 1, ringN: 8, tint: 0.35, band: ['#4aa0ff', '#ffffff'] }, pos: V3(1800, 260, -1500), front: V3(0, -1, 0), pl: { kind: 'ocean', r: 420, off: V3(700, -300, -500), atm: [0.28, 0.58, 1.0] } },
  { name: 'MIRAK', col: '#b46bff', v: { fins: 8, fw: 3.2, ribs: 10, horns: 4, hl: 0.8, ringN: 14, tint: 0.4, band: ['#d49aff', '#ff5ad2'] }, pos: V3(-2100, -180, -2000), front: V3(0, -1, 0), pl: { kind: 'purple', r: 460, off: V3(-500, 200, -800), atm: [0.7, 0.35, 1.0], ring: true } },
  { name: 'TEPZONIAX', col: '#4cff8a', v: { fins: 5, fw: 4.2, ribs: 5, horns: 2, hl: 1.4, ringN: 10, tint: 0.4, band: ['#4cff8a', '#bfffd8'] }, pos: V3(3400, -350, 900), front: V3(0, -1, 0), pl: { kind: 'jungle', r: 520, off: V3(800, 200, 500), atm: [0.3, 1.0, 0.55] } },
  { name: 'PEXTRA', col: '#ff4a2a', v: { fins: 3, fw: 6.4, ribs: 8, horns: 6, hl: 0.55, ringN: 6, tint: 0.45, band: ['#ff7a24', '#ffd24a'] }, pos: V3(-3600, 400, 1200), front: V3(0, -1, 0), pl: { kind: 'lava', r: 380, off: V3(-600, -100, 500), atm: [1.0, 0.3, 0.15] } },
  { name: 'VAJJA', col: '#9fe8ff', v: { fins: 6, fw: 3.6, ribs: 0, horns: 0, spire: 1, hl: 1, ringN: 12, tint: 0.35, band: ['#9fe8ff', '#ffffff'] }, pos: V3(400, 700, -3800), front: V3(0, -1, 0), pl: { kind: 'ice', r: 480, off: V3(-700, 300, -300), atm: [0.6, 0.9, 1.0] } },
  // ---- YAPZO system: five more worlds, far away from the first system (reach it from the star map) ----
  { name: 'KAIFMA', col: '#ffcc55', v: { ring: 1, R: 34, tube: 3.8, spokes: 4, panels: 2, tanks: 0, tint: 0.12, band: ['#ffcc55', '#ffffff'] }, pos: V3(9000, 300, -6000), front: V3(0, -1, 0), pl: { kind: 'desert', r: 560, off: V3(-850, -150, -600), atm: [1.0, 0.75, 0.3] } },
  { name: 'VELNOR', col: '#7aa8ff', v: { ring: 1, R: 30, tube: 3.2, rings: 2, spokes: 3, panels: 0, tanks: 3, tint: 0.2, band: ['#7aa8ff', '#ffffff'] }, pos: V3(11000, 0, -4800), front: V3(0, -1, 0), pl: { kind: 'storm', r: 600, off: V3(800, -250, -550), atm: [0.4, 0.6, 1.0], ring: true } },
  { name: 'YAZMIR', col: '#ff6ad0', v: { ring: 1, R: 36, tube: 2.6, spokes: 6, panels: 2, tanks: 0, tint: 0.28, band: ['#ff6ad0', '#ffd0f0'] }, pos: V3(6700, 550, -5100), front: V3(0, -1, 0), pl: { kind: 'bloom', r: 440, off: V3(-550, 200, -700), atm: [1.0, 0.4, 0.8] } },
  { name: 'ERSO', col: '#c8ff3a', v: { ring: 1, R: 26, tube: 4.4, spokes: 5, panels: 4, tanks: 4, tint: 0.3, band: ['#c8ff3a', '#ffffff'] }, pos: V3(9800, 400, -9200), front: V3(0, -1, 0), pl: { kind: 'toxic', r: 400, off: V3(650, 150, -450), atm: [0.7, 1.0, 0.2] } },
  { name: 'PIOPA', col: '#35e0c8', v: { ring: 1, R: 38, tube: 3.0, rings: 2, spokes: 8, panels: 0, tanks: 0, tint: 0.2, band: ['#35e0c8', '#d0fff6'] }, pos: V3(8000, -400, -8600), front: V3(0, -1, 0), pl: { kind: 'onyx', r: 500, off: V3(-700, 250, -350), atm: [0.2, 0.9, 0.8] } },
];
const SYSTEMS = ['HELIOS', 'YAPZO']; stations.forEach((s, i) => { s.sys = i < 6 ? 0 : 1; });
const ST_K = 3;   // station scale: everything is built at 1x and the whole station group is scaled
const SYS_K = 2.2;   // spread the system out: distance between stations x2.2 (planets move with their stations)
stations.forEach(s => s.pos.multiplyScalar(SYS_K));
stations.forEach(s => { s.front.normalize(); s.g = (s.v.ring ? buildStationB : buildStation)(s.name, s.col, s.v); s.g.scale.setScalar(ST_K); s.g.position.copy(s.pos); s.g.up.set(0, 0, 1); s.g.lookAt(s.pos.clone().add(s.front)); scene.add(s.g); });
const planets = [];
{
  const geo = new THREE.SphereGeometry(1, 48, 32), geoLo = new THREE.SphereGeometry(1, 14, 9);   // geoLo: cheap sphere for planets that are only a small disc on screen
  const rn = (n) => Math.random() * n;
  // ---- procedural planet surfaces: tileable value-noise (fBm), painted once into a canvas, no per-frame cost ----
  const NT = new Float32Array(65536); for (let i = 0; i < 65536; i++) NT[i] = Math.random();
  const vn = (x, y, px, py) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const x0 = ((xi % px) + px) % px, x1 = (x0 + 1) % px, y0 = ((yi % py) + py) % py, y1 = (y0 + 1) % py, h = (X, Y) => NT[(X * 1619 + Y * 31337 + 977) & 65535];
    const a0 = h(x0, y0), a1 = h(x1, y0), b0 = h(x0, y1), b1 = h(x1, y1); return (a0 + (a1 - a0) * u) * (1 - v) + (b0 + (b1 - b0) * u) * v; };
  const fbm = (u, v, base, oct) => { let s = 0, amp = 0.5, tot = 0, f = base; for (let o = 0; o < oct; o++) { s += amp * vn(u * f + o * 17.3, v * f * 0.5 + o * 9.1, f, Math.max(2, f >> 1)); tot += amp; amp *= 0.5; f *= 2; } return s / tot; };
  const hx = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const ramp = (st, t) => { if (t <= st[0][0]) return st[0].slice(1); for (let i = 1; i < st.length; i++) if (t <= st[i][0]) { const k = (t - st[i - 1][0]) / (st[i][0] - st[i - 1][0]); return [0, 1, 2].map(c => st[i - 1][c + 1] + (st[i][c + 1] - st[i - 1][c + 1]) * k); } return st[st.length - 1].slice(1); };
  const cyc = (cols, t) => { const n = cols.length, i = Math.floor(t) % n, k = t - Math.floor(t), A = cols[(i + n) % n], B = cols[(i + 1 + n) % n], s = k * k * (3 - 2 * k); return [A[0] + (B[0] - A[0]) * s, A[1] + (B[1] - A[1]) * s, A[2] + (B[2] - A[2]) * s]; };
  const SW = 512, SH = 256;
  const paint = (fn, w, h) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const x = cv.getContext('2d'), im = x.createImageData(w, h), d = im.data; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const c = fn(i / w, j / h, i, j), o = (j * w + i) * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = c.length > 3 ? c[3] : 255; } x.putImageData(im, 0, 0); return cv; };
  const GAS = { gas: ['#c9783c', '#e8b074', '#a8552e', '#f0d2a0', '#b9663a', '#7a3d28', '#dba06a', '#e9c48e'], purple: ['#5b2a9a', '#8a4ad0', '#b878f0', '#3e1c74', '#d49af8', '#6f36b8'], storm: ['#1f3f8a', '#3f6fd0', '#9ec0ff', '#2a52a8', '#e8f0ff', '#17306a', '#5a8ae8'], desert: ['#d9a066', '#c07a3c', '#e6b87c', '#a8652f', '#d2924f', '#efc890'] };
  const SPOT = { gas: [0.62, 0.62, [190, 62, 36]], storm: [0.3, 0.4, [238, 244, 255]], purple: [0.75, 0.35, [250, 200, 255]] };
  let lastAux = null;
  const WORLD = {   // sea level, sea ramp, land ramp, polar cap
    ocean: [0.5, [[0, 8, 34, 100], [1, 40, 120, 190]], [[0, 205, 190, 125], [0.12, 80, 155, 85], [0.5, 60, 115, 62], [0.8, 125, 105, 85], [1, 238, 238, 242]], 1],
    jungle: [0.42, [[0, 10, 70, 95], [1, 40, 150, 160]], [[0, 200, 185, 120], [0.1, 80, 200, 100], [0.5, 45, 140, 65], [0.9, 110, 95, 65], [1, 230, 235, 225]], 1],
    bloom: [0.46, [[0, 50, 8, 70], [1, 150, 40, 140]], [[0, 255, 190, 235], [0.2, 255, 110, 205], [0.6, 160, 50, 140], [1, 255, 225, 245]], 1],
    toxic: [0.45, [[0, 55, 85, 8], [1, 125, 165, 25]], [[0, 230, 255, 150], [0.2, 190, 245, 50], [0.6, 95, 120, 22], [1, 235, 250, 190]], 0],
    ice: [0, [[0, 150, 200, 230], [1, 150, 200, 230]], [[0, 85, 135, 175], [0.5, 135, 170, 202], [1, 195, 215, 232]], 1]
  };
  const tex = (kind) => {
    let cv, aux = null;
    if (GAS[kind]) {
      const cols = GAS[kind].map(hx), calm = kind === 'desert' ? 0.4 : 1, nb = kind === 'gas' ? 9 : kind === 'desert' ? 7 : 11;
      cv = paint((u, v) => { const wv = fbm(u, v, 4, 5), w2 = fbm(u + 0.3, v, 8, 4), ph = v * nb + (wv - 0.5) * 3.2 * calm + (w2 - 0.5) * 1.1, c = cyc(cols, ph), sh = 0.9 + 0.2 * fbm(u, v, 16, 3), sp = SPOT[kind]; if (sp) { const ex = (((u - sp[0] + 1.5) % 1) - 0.5) * 2, ey = v - sp[1], q = ex * ex / 0.011 + ey * ey / 0.0032; if (q < 1) { const t = 1 - q, k = Math.min(1, t * 1.6) * 0.9, sw = 0.85 + 0.3 * Math.sin(Math.atan2(ey * 3, ex) * 3 + q * 9); return [(c[0] + (sp[2][0] - c[0]) * k) * sw, (c[1] + (sp[2][1] - c[1]) * k) * sw, (c[2] + (sp[2][2] - c[2]) * k) * sw]; } } return [c[0] * sh, c[1] * sh, c[2] * sh]; }, SW, SH);
    } else if (kind === 'lava' || kind === 'onyx') {
      const gl = kind === 'lava' ? [255, 110, 30] : [53, 224, 200], lo = kind === 'lava' ? [24, 10, 8] : [14, 22, 26], hi = kind === 'lava' ? [80, 40, 30] : [34, 52, 60];
      cv = paint((u, v) => { const h = fbm(u, v, 8, 5), r = 1 - Math.abs(2 * fbm(u + 0.5, v, 8, 5) - 1), cr = Math.max(0, Math.min(1, (r - 0.945) / 0.04)), hot = cr * cr * (3 - 2 * cr), t = h; return [0, 1, 2].map(c => (lo[c] + (hi[c] - lo[c]) * t) * (1 - hot) + gl[c] * hot + (hot > 0.7 ? 80 * (hot - 0.7) : 0)); }, SW, SH);
    } else {
      const W = WORLD[kind] || WORLD.ice, sea = W[0], seaR = W[1], landR = W[2], cap = W[3];
      aux = new Uint8ClampedArray(SW * SH * 4); const lights = kind === 'ocean' || kind === 'jungle' || kind === 'bloom';
      cv = paint((u, v, pi, pj) => { const h = fbm(u, v, 8, 7), lat = Math.abs(v - 0.5) * 2, ao = (pj * SW + pi) * 4; aux[ao + 3] = 255; if (kind !== 'ice') { if (h < sea) aux[ao + 1] = 255; else if (lights && lat < 0.8) { const cl = fbm(u + 0.7, v, 16, 3); if (cl > 0.55 && h > sea + 0.03) aux[ao] = Math.min(255, (cl - 0.55) * 900); } }
        if (kind === 'ice') { const r = 1 - Math.abs(2 * fbm(u + 0.2, v, 16, 4) - 1), c = ramp(landR, h), k = Math.max(0, (r - 0.93) / 0.07) * 0.6; return [c[0] * (1 - k) + 70 * k, c[1] * (1 - k) + 130 * k, c[2] * (1 - k) + 190 * k]; }
        if (cap && lat > 0.86 + 0.08 * fbm(u, v, 8, 3)) return [215, 228, 240];
        const sc = ramp(seaR, Math.min(1, h / sea)), lc = ramp(landR, Math.max(0, (h - sea) / (1 - sea))), k = Math.max(0, Math.min(1, (h - sea + 0.012) / 0.024)); const shal = Math.max(0, 1 - Math.abs(h - sea) / 0.05) * 0.35; return [0, 1, 2].map(c => (sc[c] * (1 - k) + lc[c] * k) * (1 - shal) + (c === 0 ? 60 : c === 1 ? 200 : 190) * shal * (k < 1 ? 1 : 0)); }, SW, SH);
    }
    lastAux = null; if (aux) { const ac = document.createElement('canvas'); ac.width = SW; ac.height = SH; ac.getContext('2d').putImageData(new ImageData(aux, SW, SH), 0, 0); lastAux = new THREE.CanvasTexture(ac); }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 2; return t;
  };
  // cloud layers (two shared textures, white with an alpha made from noise) - drawn on a slightly bigger sphere that turns slowly
  const cloudTex = [0, 1].map(s => { const cv = paint((u, v) => { const n = fbm(u + s * 0.37, v, 6, 5), a = Math.max(0, Math.min(1, (n - 0.54) / 0.13)); return [255, 255, 255, a * 235]; }, 256, 128); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; });
  const MOONS = { ocean: 0.2, desert: 0.16, jungle: 0.18, ice: 0.14, bloom: 0.17 };
  const moonTex = (() => { const cv = paint((u, v) => { const h = fbm(u, v, 8, 5), cr = 1 - Math.abs(2 * fbm(u + 0.3, v, 16, 3) - 1), g = 95 + 90 * h - (cr > 0.9 ? 40 : 0); return [g, g * 0.97, g * 0.93]; }, 128, 64); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const CLOUDS = { ocean: 0.95, jungle: 0.85, bloom: 0.7, toxic: 0.6, ice: 0.22, storm: 0.45, desert: 0.3 };
  const SUN = sun.position.clone().normalize(); const blankAux = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); blankAux.needsUpdate = true; const blankTex = new THREE.DataTexture(new Uint8Array([40, 44, 56, 255]), 1, 1); blankTex.needsUpdate = true; blankTex.colorSpace = THREE.SRGBColorSpace;
  const planetMat = (tx, atm, emis, rel) => new THREE.ShaderMaterial({ fog: false,
    uniforms: { map: { value: tx }, aux: { value: blankAux }, L: { value: SUN }, atm: { value: new THREE.Color(atm[0], atm[1], atm[2]) }, emis: { value: emis }, rel: { value: rel || 0 }, tx: { value: new THREE.Vector2(1 / 512, 1 / 256) } },
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 wp = modelMatrix * vec4(position, 1.0); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }',
    fragmentShader: 'uniform sampler2D map; uniform sampler2D aux; uniform vec3 L; uniform vec3 atm; uniform float emis; uniform float rel; uniform vec2 tx; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vec3 n = normalize(vN); vec3 ax = texture2D(aux, vUv).rgb; vec3 Lp = normalize(L + 0.9 * normalize(vV)); float d = dot(n, Lp); float lit = smoothstep(-0.25, 0.55, d); vec3 b = texture2D(map, vUv).rgb; if (rel > 0.0) { vec3 wl = vec3(0.3, 0.59, 0.11); float h0 = dot(b, wl), hu = dot(texture2D(map, vUv + vec2(tx.x * 1.6, 0.0)).rgb, wl), hv = dot(texture2D(map, vUv + vec2(0.0, tx.y * 1.6)).rgb, wl); vec3 ea = normalize(cross(vec3(0.0, 1.0, 0.0), n)); vec3 no = cross(n, ea); vec2 gq = clamp(vec2(hu - h0, hv - h0), -0.012, 0.012); vec3 n2 = normalize(n - (ea * gq.x + no * gq.y) * 22.0 * rel); lit = clamp(lit + (dot(n2, Lp) - d) * 1.5 * rel * smoothstep(-0.1, 0.4, d), 0.0, 1.2); } vec3 col = b * (0.2 + 1.1 * lit) + b * emis; float fr = pow(1.0 - max(dot(n, normalize(vV)), 0.0), 3.0); col += atm * fr * (0.1 + 0.9 * smoothstep(-0.35, 0.5, d)) * 0.8; float tw = smoothstep(-0.05, 0.12, d) * (1.0 - smoothstep(0.12, 0.4, d)); col += atm * tw * 0.12; col += vec3(1.0, 0.82, 0.5) * ax.r * (1.0 - smoothstep(-0.05, 0.3, d)) * 1.3; col += vec3(1.0, 0.95, 0.85) * pow(max(dot(reflect(-Lp, n), normalize(vV)), 0.0), 28.0) * ax.g * 0.45; gl_FragColor = vec4(col, 1.0); }' });
  const cloudMat = (tx, op) => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false,
    uniforms: { map: { value: tx }, L: { value: SUN }, op: { value: op } },
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 wp = modelMatrix * vec4(position, 1.0); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }',
    fragmentShader: 'uniform sampler2D map; uniform vec3 L; uniform float op; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vec4 c = texture2D(map, vUv); vec3 Lp = normalize(L + 0.9 * normalize(vV)); float lit = smoothstep(-0.25, 0.55, dot(normalize(vN), Lp)); gl_FragColor = vec4(vec3(1.0) * (0.25 + 1.1 * lit), c.a * op); }' });
  const haloMat = (c) => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide, fog: false,
    uniforms: { c: { value: new THREE.Color(c[0], c[1], c[2]) }, L: { value: SUN } },
    vertexShader: 'varying vec3 vN; varying vec3 vWN; varying vec3 vV; varying vec3 vWV; void main(){ vWN = normalize(mat3(modelMatrix) * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vWV = normalize(cameraPosition - (modelMatrix * vec4(position, 1.0)).xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 c; uniform vec3 L; varying vec3 vN; varying vec3 vWN; varying vec3 vV; varying vec3 vWV; void main(){ vec3 Lp = normalize(L + 0.9 * normalize(vWV)); float a = abs(dot(normalize(vN), normalize(vV))); float f = pow(clamp(a / 0.42, 0.0, 1.0), 1.6); float day = 0.3 + 0.9 * smoothstep(-0.45, 0.5, dot(normalize(vWN), Lp)); gl_FragColor = vec4(c * f * day * 0.85, 1.0); }' });
  const atmMat = (c, pw) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { c: { value: new THREE.Color(c[0], c[1], c[2]) }, pw: { value: pw } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 c; uniform float pw; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), pw); gl_FragColor = vec4(c * f, 1.0); }'
  });
  const PIMG = { 'TIANOG': ['planet_kepler.webp', 1], 'MIRAK': ['planet_vega.webp', 0], 'TEPZONIAX': ['planet_aurora.webp', 1], 'VAJJA': ['planet_frost.webp', 0], 'YAZMIR': ['planet_orchid.webp', 0], 'XIAQA': ['planet_helios.webp', 0], 'PIOPA': ['planet_onyx.webp', 0], 'ERSO': ['planet_sulphur.webp', 0], 'KAIFMA': ['planet_yapzo.webp', 0], 'PEXTRA': ['planet_cinder.webp', 0], 'VELNOR': ['planet_nimbus.webp', 0] };   // painted surface maps: add one line per planet
  for (const s of stations) {
    const p = s.pl; p.pos = s.pos.clone().add(p.off); p.sys = s.sys; planets.push(p);
    p.build = () => { const u = p.mesh.material.uniforms; u.map.value = tex(p.kind); u.aux.value = lastAux || blankAux;
      const pi = PIMG[s.name], f = pi && pi[0]; if (f) { const im = new Image(); im.onload = () => {   // a hand-made painting replaces the generated surface (the generated one stays if the file is missing)
        const t = new THREE.Texture(im); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4; t.needsUpdate = true;
        const ac = document.createElement('canvas'); ac.width = 256; ac.height = 128; const x = ac.getContext('2d'); x.drawImage(im, 0, 0, 256, 128); const d = x.getImageData(0, 0, 256, 128), q = d.data;
        for (let i = 0; i < q.length; i += 4) { const r = q[i], g = q[i + 1], bl = q[i + 2], sea = Math.max(0, Math.min(255, (bl - Math.max(r, g * 0.95) - 6) * 9)); q[i] = 0; q[i + 1] = pi[1] ? sea : 0; q[i + 2] = 0; q[i + 3] = 255; }
        x.putImageData(d, 0, 0); const at = new THREE.CanvasTexture(ac); at.wrapS = THREE.RepeatWrapping;
        u.map.value = t; u.aux.value = at; u.rel.value = 0; u.tx.value.set(1 / im.width, 1 / im.height); if (p.paintCb) { const cb = p.paintCb; p.paintCb = null; cb(); } }; im.src = f; } };
    const pm = new THREE.Mesh(geo, planetMat(blankTex, p.atm, p.kind === 'lava' || p.kind === 'onyx' ? 0.45 : 0.0, GAS[p.kind] ? 0 : 1)); pm.scale.setScalar(p.r); pm.position.copy(p.pos); pm.rotation.z = 0.3; scene.add(pm); p.mesh = pm;
    if (CLOUDS[p.kind]) { const cm = new THREE.Mesh(geo, cloudMat(cloudTex[planets.length & 1], CLOUDS[p.kind])); cm.scale.setScalar(1.03); pm.add(cm); p.cl = cm; }
    if (MOONS[p.kind]) { const mo = new THREE.Mesh(geo, planetMat(moonTex, [0.55, 0.6, 0.7], 0)); mo.scale.setScalar(MOONS[p.kind]); pm.add(mo); p.moon = mo; p.mt = Math.random() * 6; }
    p.g0 = geo; p.g1 = geoLo; { const hm = new THREE.Mesh(geo, haloMat(p.atm)); p.hm = hm; hm.scale.setScalar(1.12); pm.add(hm); }
    if (p.ring) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 256; const x = cv.getContext('2d');
      for (let r = 128; r > 0; r -= 1.5) { const t = r / 128, inRing = t > 0.62 && t < 0.99, a = inRing ? 0.25 + 0.55 * Math.abs(Math.sin(r * 0.55) * Math.cos(r * 0.17)) : 0; x.strokeStyle = 'rgba(' + (225 - (r % 7) * 6) + ',' + (190 - (r % 5) * 6) + ',' + (150 - (r % 9) * 4) + ',' + (t > 0.78 && t < 0.82 ? 0.05 : a) + ')'; x.lineWidth = 1.7; x.beginPath(); x.arc(128, 128, r, 0, Math.PI * 2); x.stroke(); }
      const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
      const rg = new THREE.Mesh(new THREE.PlaneGeometry(p.r * 3.4, p.r * 3.4), new THREE.MeshBasicMaterial({ map: tx, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false, opacity: 0.85 }));
      rg.material.color.setRGB(p.atm[0], p.atm[1], p.atm[2]).lerp(new THREE.Color(1, 1, 1), p.kind === 'gas' ? 1 : 0.55); rg.position.copy(p.pos); rg.quaternion.setFromUnitVectors(Z, V3(0.2 + (planets.length % 3) * 0.15, 0.9, 0.3 - (planets.length % 2) * 0.4).normalize()); scene.add(rg); p.rg = rg;
    }
  }
}
const _pd = V3(), _pc = V3(), PCENS = SYSTEMS.map((nm, k) => { const c = V3(); let n = 0; planets.forEach(p => { if (p.sys === k) { c.add(p.pos); n++; } }); return c.multiplyScalar(1 / (n || 1)); });
let curSys = 0, lastSkySys = 0;   // the system you are in = the system of the nearest station
const sysBanner = (k) => { const el = document.getElementById('sysbn'); if (!el) return; el.firstChild.textContent = 'ENTERING ' + SYSTEMS[k] + ' SYSTEM'; el.lastChild.textContent = SYSTEM_SUB[k]; el.style.opacity = '1'; setTimeout(() => { el.style.opacity = '0'; }, 3400); };
const SYSTEM_SUB = ['5 WORLDS', '5 WORLDS \u00B7 AMBER NEBULA'];
const updCurSys = () => { if (S.mode === 'dock') { curSys = stations[S.station].sys; return; } let b = 1e18; for (const s of stations) { const d = S.pos.distanceToSquared(s.pos); if (d < b) { b = d; curSys = s.sys; } } if (curSys !== lastSkySys) { lastSkySys = curSys; spaceNebula.userData.setSys(curSys); if (S.mode !== 'dock') setTimeout(() => sysBanner(curSys), 900); } };
const firstOfSys = (k) => stations.findIndex(s => s.sys === k);
const lookUp = (d) => Math.abs(d.y) > 0.98 ? Z : Y;   // up-vector that is never parallel to the view direction
const dockPoint = (st, out) => out.copy(st.pos).addScaledVector(st.front, 58);

// ---------- game state ----------
const S = {
  pos: V3(0, 0, 200), q: new THREE.Quaternion(), vel: V3(), speed: 0, roll: 0, sx: 0, sy: 0,
  shield: 80, hull: 100, boost: 100, thr: 1, boosting: false, regenT: 0, inv: 0, shake: 0, fireT: 0, side: 1,
  mode: 'menu', target: null, tPlanet: -1, station: 0, camQ: new THREE.Quaternion(), mission: null, patrolT: 40, missT: 0, hitFlash: 0,
};
const fwd = V3(0, 0, -1);
const enemies = []; const ENEMY_N = 6;
for (let i = 0; i < ENEMY_N; i++) {
  const g = new THREE.Group(); const mesh = new THREE.Mesh(enemyGeo, enemyMat); mesh.scale.setScalar(1.8); g.add(mesh);
  const glow = glowSprite(0xff6a3a, 6.5, 0.95); glow.position.set(0, 0, 3.4); g.add(glow);
  g.visible = false; scene.add(g);
  enemies.push({ g, pos: g.position, q: g.quaternion, vel: V3(), speed: 90, shield: 0, shieldMax: 0, hull: 0, hullMax: 0, active: false, fireT: 0, evadeT: 0, evadeDir: V3(), burst: 0, name: 'PIRATE' });
}
function spawnEnemy(pos, level) {
  const e = enemies.find(x => !x.active); if (!e) return null;
  e.active = true; e.g.visible = true; e.pos.copy(pos); e.q.identity(); e.speed = 90; e.evadeT = 0; e.fireT = rnd(1, 2.5); e.burst = 0;
  const lv = Math.min(level, 6); e.shieldMax = e.shield = 20 + lv * 6; e.hullMax = e.hull = 26 + lv * 6; e.name = ['PIRATE', 'RAIDER', 'MARAUDER'][Math.min(2, lv >> 1)];
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
  else if (kind === 'missile') {
    // short crackle at the start, then a deep whoosh that rises
    for (let i = 0; i < 6; i++) { const d = i * 0.018 + Math.random() * 0.012, s = actx.createBufferSource(); s.buffer = eng.nb; const hp = actx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800 + Math.random() * 2500; const g = actx.createGain(); g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.28, t + d + 0.003); g.gain.exponentialRampToValueAtTime(0.001, t + d + 0.03); s.connect(hp); hp.connect(g); g.connect(eng.master); s.start(t + d, Math.random() * 0.4, 0.04); }
    const w = actx.createBufferSource(); w.buffer = eng.nb; w.loop = true; const bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4; bp.frequency.setValueAtTime(140, t); bp.frequency.exponentialRampToValueAtTime(1500, t + 0.95);
    const wg = actx.createGain(); wg.gain.setValueAtTime(0.0001, t); wg.gain.exponentialRampToValueAtTime(0.55, t + 0.55); wg.gain.exponentialRampToValueAtTime(0.001, t + 1.0); w.connect(bp); bp.connect(wg); wg.connect(eng.master); w.start(t); w.stop(t + 1.05);
    tone('triangle', 55, 230, 0.8, 0.22, 0.02);
  }
  else if (kind === 'boost') tone('sawtooth', 90, 420, 0.4, 0.16);
  else if (kind === 'dock') { tone('triangle', 523, 523, 0.45, 0.22); tone('triangle', 659, 659, 0.45, 0.22, 0.12); tone('triangle', 784, 784, 0.5, 0.22, 0.24); }
  else if (kind === 'lock') tone('sine', 1200, 1200, 0.06, 0.12);
  // menu / button sounds: short soft electronic blips
  else if (kind === 'ui') { tone('sine', 1900, 1500, 0.04, 0.09); tone('triangle', 950, 800, 0.05, 0.05); }
  else if (kind === 'uiTab') { tone('sine', 1500, 2100, 0.05, 0.09); tone('sine', 3000, 3000, 0.03, 0.03, 0.015); }
  else if (kind === 'uiOk') { tone('sine', 880, 880, 0.07, 0.11); tone('sine', 1320, 1320, 0.09, 0.11, 0.06); tone('triangle', 1760, 1760, 0.08, 0.05, 0.06); }
  else if (kind === 'uiNo') { tone('sine', 620, 380, 0.12, 0.11); tone('triangle', 310, 240, 0.12, 0.05); }
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

// ---------- throttle: touch any free spot on the right half and drag up = faster, down = slower / full stop (like Galaxy on Fire 2) ----------
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
let thrId = null, thrY0 = 0, thr0 = 1;
canvas.addEventListener('pointerdown', (e) => {
  if (thrId !== null || e.clientX <= innerWidth * 0.5 || S.mode !== 'fly') return;
  thrId = e.pointerId; canvas.setPointerCapture(e.pointerId); thrY0 = e.clientY; thr0 = S.thr;
});
canvas.addEventListener('pointermove', (e) => { if (e.pointerId !== thrId) return; S.thr = clamp(thr0 - (e.clientY - thrY0) / (innerHeight * 0.4), 0, 1); });
const endThr = (e) => { if (e.pointerId !== thrId) return; thrId = null; };
canvas.addEventListener('pointerup', endThr); canvas.addEventListener('pointercancel', endThr);
function holdBtn(el, set) {
  const on = (e) => { e.preventDefault(); set(true); el.classList.add('down'); initAudio(); }, off = (e) => { e.preventDefault(); set(false); el.classList.remove('down'); };
  el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off);
}
function tapBtn(el, fn) { el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.classList.add('down'); initAudio(); fn(); }); const off = () => el.classList.remove('down'); el.addEventListener('pointerup', off); el.addEventListener('pointerleave', off); el.addEventListener('pointercancel', off); }
holdBtn($('b-fire'), (v) => firing = v); holdBtn($('b-boost'), (v) => boostHeld = v);
tapBtn($('b-miss'), () => fireMissile()); tapBtn($('b-tgt'), () => cycleTarget());
$('b-inv').classList.toggle('on', save.inv); $('b-snd').classList.toggle('on', save.snd);
$('b-inv').addEventListener('click', () => { save.inv = !save.inv; $('b-inv').classList.toggle('on', save.inv); persist(); });
$('b-snd').addEventListener('click', () => { save.snd = !save.snd; $('b-snd').classList.toggle('on', save.snd); if (eng) eng.master.gain.value = save.snd ? 0.5 : 0; persist(); initAudio(); });
let paused = false;
function setPause(v) {
  if (v === paused) return; if (v && (S.mode === 'dock' || mapOn || $('start').classList.contains('show'))) return;
  paused = v; $('pause-ov').style.display = v ? 'flex' : 'none'; firing = false; boostHeld = false; stickId = null; setKnob(0, 0);
  if (actx && !document.hidden) { v ? actx.suspend() : actx.resume(); }
}
$('b-pause').addEventListener('click', () => { initAudio(); setPause(true); });
$('b-resume').addEventListener('click', () => setPause(false));
addEventListener('keydown', (e) => { if (e.code === 'Escape' || e.code === 'KeyP') setPause(!paused); });
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- missiles ----------
const MS_N = 4, missiles = [];
// one shared rocket model: white body, red nose cone, four swept fins, dark nozzle - lit like the ship; the engine flame is a small additive cone
const msGeo = (() => {
  const parts = [], paint = (g, c) => { g = g.toNonIndexed(); g.deleteAttribute('uv'); const n = g.attributes.position.count, col = new Float32Array(n * 3), cc = new THREE.Color(c); for (let i = 0; i < n; i++) { col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(col, 3)); parts.push(g); };
  const cyl = (r0, r1, len, z, c) => { const g = new THREE.CylinderGeometry(r0, r1, len, 10); g.rotateX(Math.PI / 2); g.translate(0, 0, z); paint(g, c); };
  cyl(0.3, 0.3, 2.2, 0, 0xe6ebf2);          // body
  cyl(0.02, 0.3, 1.0, -1.6, 0xff4a2a);      // nose cone
  cyl(0.31, 0.31, 0.16, -0.7, 0xff9a2a);    // warning band
  cyl(0.24, 0.3, 0.3, 1.2, 0x39414f);       // nozzle
  for (let k = 0; k < 4; k++) { const f = new THREE.BoxGeometry(0.05, 0.62, 0.8); f.translate(0, 0.5, 0.75); f.rotateZ(k * Math.PI / 2); paint(f, 0x5a6578); }
  return mergeGeometries(parts);
})();
const msFlameMat = mkFlame(0xff9a30, 0.95);
const msMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3, emissive: 0x58627a });
const msFlameGeo = new THREE.ConeGeometry(0.3, 1, 10, 1, true); msFlameGeo.rotateX(-Math.PI / 2); msFlameGeo.translate(0, 0, 0.5);
for (let i = 0; i < MS_N; i++) {
  const g = new THREE.Group(), body = new THREE.Mesh(msGeo, msMat); g.add(body);
  const fc = new THREE.Mesh(msFlameGeo, msFlameMat); fc.position.z = 1.35; fc.scale.set(1, 1, 2.6); g.add(fc);
  const fl = glowSprite(0xffa040, 2.6, 0.7); fl.position.z = 1.5; g.add(fl);
  g.scale.setScalar(2.1); g.visible = false; scene.add(g); missiles.push({ g, body, fc, vel: V3(), life: 0, target: null, active: false });
}
function fireMissile() {
  if (S.mode !== 'fly') return; if (save.missiles <= 0) { toast('NO MISSILES', 0.8); return; }
  const m = missiles.find(x => !x.active); if (!m) return;
  save.missiles--; persist(); updateMissHud(); sfx('missile');
  m.active = true; m.g.visible = true; m.life = 7; m.target = S.target && S.target.active ? S.target : null;
  m.g.position.copy(S.pos).addScaledVector(fwd, 5.5).addScaledVector(_a.set(0, -0.6, 0).applyQuaternion(S.q), 1); m.g.quaternion.copy(S.q); m.vel.copy(fwd).multiplyScalar(S.speed + 110);
}
function updateMissiles(dt) {
  updateSmoke(dt);
  for (const m of missiles) {
    if (!m.active) continue; m.life -= dt;
    const t = m.target && m.target.active ? m.target : null;
    fwdOf(m.g.quaternion, _a);
    if (t) {
      _b.copy(t.pos).sub(m.g.position); const dist = _b.length(); _b.divideScalar(dist || 1);
      _m.lookAt(_zero, _b, Y); _qa.setFromRotationMatrix(_m); m.g.quaternion.rotateTowards(_qa, 3.2 * dt); fwdOf(m.g.quaternion, _a);
      if (dist < 7) { damageEnemy(t, 70 + 15 * save.up[0], m.g.position); m.active = false; m.g.visible = false; explode(m.g.position, 9); continue; }
    }
    { let hitA = false; for (let j = 0; j < AST_N; j++) { const a = asteroids[j]; if (!a.active) continue; const dx = a.x - m.g.position.x, dy = a.y - m.g.position.y, dz = a.z - m.g.position.z, rr = a.r + 2; if (dx * dx + dy * dy + dz * dz < rr * rr) { hitAsteroid(a, 9999); hitA = true; break; } }
      if (hitA) { m.active = false; m.g.visible = false; explode(m.g.position, 9); continue; } }
    const sp = Math.min(330, m.vel.length() + 260 * dt); m.vel.copy(_a).multiplyScalar(sp); m.g.position.addScaledVector(m.vel, dt);
    m.body.rotation.z += dt * 9; m.fc.scale.z = 2.2 + Math.random() * 0.9; smokePuff(_b.copy(m.g.position).addScaledVector(_a, -3.6));
    if (m.life <= 0) { m.active = false; m.g.visible = false; explode(m.g.position, 5); }
  }
}

// ---------- damage ----------
function damagePlayer(d) {
  if (S.inv > 0 || S.mode !== 'fly') return;
  S.regenT = 3.5; S.shake = Math.max(S.shake, 0.5);
  if (S.shield > 0) { S.shGlow = 1; S.shield -= d; if (S.shield < 0) { S.hull += S.shield; S.shield = 0; } flash('shield'); }
  else { S.hull -= d; flash('hull'); S.shake = 1; buzz(40); }
  sfx('hit');
  if (S.hull <= 0) { S.hull = 0; wrecked(); }
}
function hitAsteroid(a, d) {   // any asteroid, any size, can be destroyed
  a.hp -= d; if (a.hp > 0) return;
  _b.set(a.x, a.y, a.z); a.active = false; a.y = -99999; explode(_b, Math.max(5, a.r * 0.9)); dropLoot(_b, 15, true, 1 + (a.r > 7 ? 1 : 0) + (a.r > 14 ? 2 : 0));
}
function damageEnemy(e, d, at) {
  if (!e.active) return;
  if (e.shield > 0) { e.shield -= d; if (e.shield < 0) { e.hull += e.shield; e.shield = 0; } } else e.hull -= d;
  if (at) { sparks(at, 7, 18, 0.45); hitFlash(at, d > 40); }
  if (e.hull <= 0) {
    e.active = false; e.g.visible = false; explode(e.pos, 16); S.shake = Math.max(S.shake, 0.5); dropLoot(e.pos, 22 + save.kills % 3 * 6, false, 3);
    save.kills++; persist(); $('kills').textContent = save.kills; if (S.target === e) S.target = null;
    S.shake = Math.max(S.shake, 0.25);
    if (S.mission && S.mission.type === 'bounty') { S.mission.done++; updateMissionHud(); if (S.mission.done >= S.mission.n) completeMission(); }
  }
}

// ---------- targeting ----------
function cycleTarget() {
  if (S.mode !== 'fly') return; fwdOf(S.q, fwd);
  const list = enemies.filter(e => e.active).map(e => { _a.copy(e.pos).sub(S.pos); const d = _a.length(); return { e, score: Math.acos(clamp(fwd.dot(_a) / (d || 1), -1, 1)) + d / 3000 }; }).sort((a, b) => a.score - b.score);
  if (!list.length) {   // no enemies around: TARGET picks a planet to visit (the planet you are already at is skipped)
    S.target = null; const here = nearPlanet();
    const cand = planets.map((p, i) => ({ i, a: _a.copy(p.mesh.position).sub(S.pos).normalize().dot(fwd) })).filter(o => o.i !== here && planets[o.i].sys === curSys).sort((x, y) => y.a - x.a).map(o => o.i);
    const k = cand.indexOf(S.tPlanet); S.tPlanet = cand[(k + 1) % cand.length]; sfx('lock');
    trvOn = true; $('trv-name').textContent = stations[S.tPlanet].name; $('trv-dlg').style.display = 'flex'; return;
  }
  S.tPlanet = -1; if (trvOn) { trvOn = false; $('trv-dlg').style.display = 'none'; }
  let i = list.findIndex(o => o.e === S.target); S.target = list[(i + 1) % list.length].e; sfx('lock');
}
// ---- missile smoke trail: one shared Points cloud (ring buffer of puffs). A puff is born at the nozzle, then only its age changes, so the whole trail is one draw call ----
const SM_N = 320, smPos = new Float32Array(SM_N * 3), smAge = new Float32Array(SM_N).fill(1); let smNext = 0, smAlive = 0;
const smGeo = new THREE.BufferGeometry(); smGeo.setAttribute('position', new THREE.BufferAttribute(smPos, 3)); smGeo.setAttribute('age', new THREE.BufferAttribute(smAge, 1));
const smMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, uniforms: { px: { value: 600 } },
  vertexShader: 'attribute float age; uniform float px; varying float vA; void main(){ vA = age; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = age >= 1.0 ? 0.0 : (3.0 + age * 10.0) * px / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }',
  fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = (1.0 - smoothstep(0.05, 0.5, d)) * pow(max(0.0, 1.0 - vA), 1.6) * 0.6; vec3 c = mix(vec3(1.0, 0.72, 0.38), vec3(0.62, 0.66, 0.74), smoothstep(0.0, 0.3, vA)); gl_FragColor = vec4(c, a); }' });
const smoke = new THREE.Points(smGeo, smMat); smoke.frustumCulled = false; scene.add(smoke);
function smokePuff(p) { const k = smNext; smNext = (smNext + 1) % SM_N; smPos[k * 3] = p.x; smPos[k * 3 + 1] = p.y; smPos[k * 3 + 2] = p.z; smAge[k] = 0; smAlive = SM_N; smGeo.attributes.position.needsUpdate = true; }
function updateSmoke(dt) { if (!smAlive) return; smMat.uniforms.px.value = innerHeight * 0.85; let any = false; for (let i = 0; i < SM_N; i++) if (smAge[i] < 1) { smAge[i] = Math.min(1, smAge[i] + dt / 1.5); any = true; } smGeo.attributes.age.needsUpdate = true; if (!any) smAlive = 0; }
const smokeReset = () => { smAge.fill(1); smAlive = 0; smGeo.attributes.age.needsUpdate = true; };
// ---- station traffic: three little ships circle every station you are near (one instanced mesh, only the near stations are updated, no interaction) ----
const TR_K = 3, TR_N = stations.length * TR_K;
const trGeo = (() => { const parts = [], add = (g, c) => { g = g.toNonIndexed(); g.deleteAttribute('uv'); const n = g.attributes.position.count, col = new Float32Array(n * 3), cc = new THREE.Color(c); for (let i = 0; i < n; i++) { col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(col, 3)); parts.push(g); };
  const body = new THREE.BoxGeometry(1.5, 0.7, 5); add(body, 0xcfd6e0);
  const nose = new THREE.ConeGeometry(0.75, 2.2, 4); nose.rotateX(-Math.PI / 2); nose.translate(0, 0, -3.5); add(nose, 0xe2e8f0);
  const wing = new THREE.BoxGeometry(6, 0.14, 1.8); wing.translate(0, -0.1, 1); add(wing, 0x6b7689);
  const fin = new THREE.BoxGeometry(0.14, 1.3, 1.2); fin.translate(0, 0.8, 2); add(fin, 0x8a95a8);
  return mergeGeometries(parts); })();
const trMesh = new THREE.InstancedMesh(trGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0.05, emissive: 0x8b97ac }), TR_N); trMesh.frustumCulled = false; trMesh.count = 0; scene.add(trMesh);
const trLpos = new Float32Array(TR_N * 3), trLGeo = new THREE.BufferGeometry(); trLGeo.setAttribute('position', new THREE.BufferAttribute(trLpos, 3));
const trLights = new THREE.Points(trLGeo, new THREE.PointsMaterial({ color: 0x7fd8ff, size: 6, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false })); trLights.frustumCulled = false; trLights.visible = false; scene.add(trLights);
const _tc = new THREE.Color(), TR_U = [], TR_V = [];
stations.forEach((st, k) => { const n = V3(Math.sin(k * 1.7), 1.2, Math.cos(k * 2.3)).normalize(), u = V3(1, 0, 0).cross(n).normalize(), v = n.clone().cross(u); TR_U.push(u); TR_V.push(v); });
const _tq = new THREE.Quaternion(), _tp = V3(), _tt = V3(), _ts = V3(2.6, 2.6, 2.6);
function updateTraffic() {
  let n = 0;
  for (let k = 0; k < stations.length; k++) { const st = stations[k]; if (!st.g.visible) continue;
    for (let j = 0; j < TR_K; j++) { const dir = (j & 1) ? -1 : 1, th = tAcc * dir * (0.13 - j * 0.02) + j * 2.09 + k, R = 175 + j * 48, c = Math.cos(th), sn = Math.sin(th), u = TR_U[k], v = TR_V[k];
      _tp.set(st.pos.x + (u.x * c + v.x * sn) * R, st.pos.y + (u.y * c + v.y * sn) * R, st.pos.z + (u.z * c + v.z * sn) * R);
      _tt.set((-u.x * sn + v.x * c) * dir, (-u.y * sn + v.y * c) * dir, (-u.z * sn + v.z * c) * dir);
      _m.lookAt(_zero, _tt, Y); _tq.setFromRotationMatrix(_m); trMesh.setMatrixAt(n, dummy.matrix.compose(_tp, _tq, _ts)); trMesh.setColorAt(n, _tc.setHSL((k * 0.13 + j * 0.31) % 1, 0.25, 0.9));
      trLpos[n * 3] = _tp.x - _tt.x * 8; trLpos[n * 3 + 1] = _tp.y - _tt.y * 8; trLpos[n * 3 + 2] = _tp.z - _tt.z * 8; n++; } }
  trMesh.count = n; trLights.visible = n > 0; if (n) { trMesh.instanceMatrix.needsUpdate = true; if (trMesh.instanceColor) trMesh.instanceColor.needsUpdate = true; trLGeo.attributes.position.needsUpdate = true; trLGeo.setDrawRange(0, n); }
}
let trvOn = false, aimCool = 0;
const spdEl = $('spd'), flareEl = $('flare'), flGh = [...flareEl.children], FLT = [0, 0.3, 0.62, 1.1, 1.5], FLS = [260, 46, 80, 38, 110], _fl = V3(); let spdOn = false, flOn = false;
flGh.forEach((g, q) => { g.style.width = g.style.height = FLS[q] + 'px'; });
const nearPlanet = () => { let b = -1, bd = 3500; for (let i = 0; i < planets.length; i++) { const d = S.pos.distanceTo(stations[i].pos); if (d < bd) { bd = d; b = i; } } return b; };
// warp to another planet: short fade, then you arrive in front of that planet's station
const WP = { t: 0, to: 0, done: false, far: false }, tunnelEl = document.getElementById('tunnel');
function startWarp(i) {
  if (S.mode !== 'fly') return; WP.t = 0; WP.to = i; WP.done = false; WP.far = stations[i].sys !== curSys; S.mode = 'warp'; S.tPlanet = -1; S.target = null; S.boosting = false; S.sx = S.sy = 0;
  document.body.classList.add('docked'); fadeEl.style.transition = 'none'; fadeEl.style.opacity = '0'; sfx('boost'); if (WP.far) tunnelEl.classList.add('on');   // jump tunnel: pure CSS, runs on the GPU
}
function updateWarp(dt) {
  WP.t += dt; fwdOf(S.q, fwd); S.speed = 160 + WP.t * 420; S.pos.addScaledVector(fwd, S.speed * dt); S.vel.copy(fwd).multiplyScalar(S.speed);
  fadeEl.style.opacity = Math.max(0, Math.min(1, (WP.t - (WP.far ? 0.95 : 0.45)) / (WP.far ? 0.8 : 0.65))).toFixed(2);
  if (!WP.done && WP.t >= (WP.far ? 1.9 : 1.25)) {
    WP.done = true; tunnelEl.classList.remove('on'); const st = stations[WP.to];
    S.pos.copy(st.pos).addScaledVector(st.pl.off.clone().normalize(), -1100); S.pos.y -= 350;
    _m.lookAt(_zero, _a.copy(st.pos).sub(S.pos).normalize(), Y); S.q.setFromRotationMatrix(_m); S.camQ.copy(S.q);
    S.speed = 50; S.inv = 2; S.mode = 'fly'; entDismissed = WP.to; document.body.classList.remove('docked'); fadeOut();
  }
}

// ---------- missions ----------
function rndStationOtherThan(i) { const o = stations.map((s, k) => k).filter(k => k !== i && stations[k].sys === stations[i].sys); return o[Math.random() * o.length | 0]; }
function genMissions(from) {
  const lvl = Math.min(save.kills, 40);
  const n = 3 + (Math.random() * 3 | 0), dirv = (() => { const po = stations[from].pl.off.clone().normalize(); let d, t = 0; do { d = V3(rnd(-1, 1), rnd(-0.3, 0.3), rnd(-1, 1)).normalize(); } while (d.dot(po) > 0.2 && ++t < 10); return d; })();
  const to = rndStationOtherThan(from), ore = 5 + (Math.random() * 6 | 0);
  return [
    { type: 'bounty', n, done: 0, reward: 140 * n + lvl * 3, zone: stations[from].pos.clone().addScaledVector(dirv, rnd(700, 1100)), spawned: 0, title: 'BOUNTY', text: `Destroy ${n} pirates in the marked zone` },
    { type: 'delivery', to, reward: Math.round(stations[from].pos.distanceTo(stations[to].pos) / 15) + 80, title: 'DELIVERY', text: `Deliver cargo to ${stations[to].name}` },
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
  const m = S.mission; if (!m) return; save.credits += m.reward; persist(); refreshHud(); toast('MISSION COMPLETE  +' + m.reward, 2.2); sfx('pick'); S.mission = null; updateMissionHud();
}

// ---------- UI ----------
let toastT = 0;
function toast(t, secs) { const el = $('toast'); el.textContent = t; el.style.opacity = '1'; toastT = secs || 1; }
function flash(kind) { const f = $('flash'); f.style.background = kind === 'shield' ? 'radial-gradient(ellipse at center,rgba(60,170,255,0) 45%,rgba(60,170,255,.5) 100%)' : 'radial-gradient(ellipse at center,rgba(255,50,40,0) 40%,rgba(255,50,40,.7) 100%)'; f.style.opacity = '1'; setTimeout(() => f.style.opacity = '0', 110); }
const buzz = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { } };
const refreshHud = () => { $('credits').textContent = save.credits; };
const updateMissHud = () => { $('miss-n').textContent = save.missiles; const e = document.getElementById('shop-ms'); if (e) e.textContent = 'MISSILES  ' + save.missiles; };
refreshHud(); updateMissHud(); $('kills').textContent = save.kills;

// station music: loops while docked, fades in/out; never starts until the player has tapped (browser rule)
const stMus = new Audio('station.mp3?v=1'); stMus.loop = true; stMus.preload = 'auto'; stMus.volume = 0; let stVol = 0, stUnlocked = false;
function unlockMusic() { if (stUnlocked) return; stUnlocked = true; try { const p = stMus.play(); if (p && p.then) p.then(() => { if (stVol <= 0.01) stMus.pause(); }).catch(() => { stUnlocked = false; }); } catch (e) { stUnlocked = false; } }
function updateMusic(dt) {
  const want = S.mode === 'dock' && save.snd && !document.hidden ? 0.6 : 0;
  stVol += (want - stVol) * Math.min(1, dt * (want > stVol ? 0.9 : 2.2)); if (Math.abs(want - stVol) < 0.004) stVol = want;
  if (stVol > 0.01) { if (stMus.paused) { try { const p = stMus.play(); if (p && p.catch) p.catch(() => { }); } catch (e) { } } stMus.volume = clamp(stVol, 0, 1); }
  else if (!stMus.paused) { stMus.pause(); stMus.volume = 0; }
}
let shopTab = 'm', lgSt = -1, shopSub = 'u', mapSys = -1;
const HOLD = 20, GOODS = [{ nm: 'ORE', base: 40, desc: 'Raw asteroid ore' }, { nm: 'FOOD', base: 25, desc: 'Sealed rations' }, { nm: 'MEDS', base: 70, desc: 'Medical supplies' }, { nm: 'TECH', base: 120, desc: 'Electronic parts' }, { nm: 'GEMS', base: 200, desc: 'Cut crystals' }];
const cMul = (st, gi) => { const x = Math.sin((st + 1) * 12.9898 + gi * 78.233) * 43758.5453; return 0.7 + 0.7 * (x - Math.floor(x)); };   // each station pays a different price for each good
// ---- 3D planet viewer for the Map tab: a tiny software sphere on a 120px canvas. Pixel lookups are precomputed once, so a frame is ~14k array reads, and it only runs while the tab is open ----
const pvEnd = { id: 0 };
function pvStart(cv, k) {
  const p = stations[k].pl, id = ++pvEnd.id; if (p.build) { p.build(); p.build = null; p.paintCb = () => { if (id === pvEnd.id && cv.isConnected) pvStart(cv, k); }; }   // a painted map arrives a moment later: restart the viewer with it
  let img = p.mesh.material.uniforms.map.value.image; if (!img) return; if (!img.getContext) { const c2 = document.createElement('canvas'); c2.width = 512; c2.height = 256; c2.getContext('2d').drawImage(img, 0, 0, 512, 256); img = c2; }   // a painted map is an <img>: copy it small
  const sw = img.width, sh = img.height, src = img.getContext('2d').getImageData(0, 0, sw, sh).data, N = 120, R = 56, c0 = N / 2, g = cv.getContext('2d'), out = g.createImageData(N, N), o = out.data;
  const U = new Float32Array(N * N), Vr = new Int32Array(N * N), Sh = new Float32Array(N * N), Rm = new Float32Array(N * N), Al = new Uint8Array(N * N), tilt = 0.3, ct = Math.cos(tilt), st = Math.sin(tilt), L = [-0.55, 0.45, 0.7], ll = Math.hypot(...L);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = y * N + x, nx = (x + 0.5 - c0) / R, ny = -(y + 0.5 - c0) / R, r2 = nx * nx + ny * ny; if (r2 >= 1.06) continue;
    const nz = Math.sqrt(Math.max(0, 1 - r2)), d = Math.sqrt(r2), edge = Math.max(0, Math.min(1, (1.03 - d) / 0.05)); if (edge <= 0) continue; Al[i] = edge * 255;
    const px = nx * ct + ny * st, py = -nx * st + ny * ct, lon = Math.atan2(px, nz), lat = Math.asin(Math.max(-1, Math.min(1, py)));
    U[i] = lon / 6.2831853; Vr[i] = Math.min(sh - 1, Math.max(0, (0.5 - lat / Math.PI) * sh | 0)) * sw;
    const dl = (nx * L[0] + ny * L[1] + nz * L[2]) / ll; Sh[i] = 0.1 + 0.95 * Math.max(0, Math.min(1, (dl + 0.2) / 0.8)); Rm[i] = Math.pow(Math.max(0, d), 6) * (0.35 + 0.65 * Math.max(0, dl + 0.3)); }
  const ac = p.atm, A0 = ac[0] * 255, A1 = ac[1] * 255, A2 = ac[2] * 255; let rot = Math.random(), last = performance.now(), drag = -1;
  cv.onpointerdown = (e) => { drag = e.clientX; cv.setPointerCapture(e.pointerId); }; cv.onpointermove = (e) => { if (drag >= 0) { rot -= (e.clientX - drag) / 260; drag = e.clientX; } }; cv.onpointerup = cv.onpointercancel = () => { drag = -1; };
  const frame = (now) => { if (id !== pvEnd.id || !cv.isConnected) return; const dt = Math.min(0.1, (now - last) / 1000); last = now; if (drag < 0) rot += dt * 0.035;
    for (let i = 0; i < N * N; i++) { const a = Al[i], j = i << 2; if (!a) { o[j + 3] = 0; continue; } let u = U[i] + rot; u -= Math.floor(u); const q = (Vr[i] + (u * sw | 0)) << 2, s = Sh[i], rm = Rm[i];
      o[j] = Math.min(255, src[q] * s + A0 * rm); o[j + 1] = Math.min(255, src[q + 1] * s + A1 * rm); o[j + 2] = Math.min(255, src[q + 2] * s + A2 * rm); o[j + 3] = a; }
    g.putImageData(out, 0, 0); requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
}
const PKIND = { gas: 'GAS GIANT', ocean: 'OCEAN WORLD', purple: 'VIOLET GIANT', jungle: 'JUNGLE WORLD', lava: 'LAVA WORLD', ice: 'ICE WORLD', desert: 'DESERT WORLD', storm: 'STORM GIANT', bloom: 'BLOOM WORLD', toxic: 'TOXIC WORLD', onyx: 'ONYX WORLD' };
function openShop(msg) {
  S.mode = 'dock';
  $('shop-title').textContent = 'DOCKED · ' + stations[S.station].name;
  $('shop-earn').textContent = msg || '';
  ['h', 'u', 'p', 'm', 's', 'b'].forEach(k => $('tab-' + k).classList.toggle('on', shopTab === k)); $('sh-panel').style.display = shopTab === 'h' || shopTab === 'b' ? 'none' : 'flex'; $('shop').classList.toggle('npcon', shopTab === 'u' || shopTab === 's'); $('shop').classList.toggle('lgon', shopTab === 'b'); if (shopTab === 'b') $('lounge').classList.toggle('sys1', stations[S.station].sys === 1); if (shopTab === 'b' && window.__fillLounge && lgSt !== S.station) { window.__fillLounge(); lgSt = S.station; }
  { const hero = shopTab === 's'; $('npc').src = hero ? 'pilot.webp' : 'merchant.webp'; $('npc').classList.toggle('hero', hero); $('npc-nm').textContent = hero ? 'NABIYAX · PILOT' : 'VORR · TRADER'; $('npc-tx').textContent = hero ? 'Ship ready. Let\'s fly.' : 'Best prices this side of the nebula, pilot.'; }
  const list = $('shop-list'); list.innerHTML = '';
  const ICO = {   // one small glowing icon per upgrade (inline SVG, no image files)
    0: ['#ff6a8a', '<path d="M13.5 2L5 13.5h5.5L9.5 22 19 9.5h-5.8z" fill="currentColor" fill-opacity=".28"/>'],
    1: ['#5fe4ff', '<path d="M12 2.5l8 3v6c0 4.8-3.3 8.6-8 10-4.7-1.4-8-5.2-8-10v-6z" fill="currentColor" fill-opacity=".2"/><path d="M12 6.5v11M8 10.5h8" />'],
    2: ['#ffc24a', '<path d="M12 2.5l8.2 4.2v10.6L12 21.5l-8.2-4.2V6.7z" fill="currentColor" fill-opacity=".2"/><path d="M12 8l4 2.2v3.6L12 16l-4-2.2v-3.6z"/>'],
    3: ['#ff8a3a', '<path d="M12 2.5c3.2 3.8 5 6.8 5 10.2a5 5 0 0 1-10 0c0-3.4 1.8-6.4 5-10.2z" fill="currentColor" fill-opacity=".25"/><path d="M12 11.5c1.3 1.6 2 2.8 2 4a2 2 0 0 1-4 0c0-1.2.7-2.4 2-4z"/>'],
    c0: ['#c9a27a', '<path d="M4 9l8-4.500 8 4.500v7l-8 4.500-8-4.500z" fill="currentColor" fill-opacity=".2"/><path d="M4 9l8 4.500 8-4.500M12 13.500v7"/>'],
    c1: ['#7bf08a', '<path d="M12 20c-4 0-7-3-7-7 0-3 2-5 4-5 1.500 0 2 .8 3 .8s1.500-.8 3-.8c2 0 4 2 4 5 0 4-3 7-7 7z" fill="currentColor" fill-opacity=".2"/><path d="M12 8c0-2 1-3.500 3-4"/>'],
    c2: ['#ff6a8a', '<rect x="4" y="4" width="16" height="16" rx="3" fill="currentColor" fill-opacity=".15"/><path d="M12 8v8M8 12h8"/>'],
    c3: ['#5fe4ff', '<rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" fill-opacity=".15"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>'],
    c4: ['#d49aff', '<path d="M7 4h10l4 5-9 12L3 9z" fill="currentColor" fill-opacity=".2"/><path d="M3 9h18M9 4l3 5 3-5M12 9v12"/>'],
    m: ['#c79bff', '<path d="M12 2c3 2.2 4 5.8 4 9v4.2l-2 2.3h-4l-2-2.3V11c0-3.200 1-6.800 4-9z" fill="currentColor" fill-opacity=".22"/><path d="M8 14l-3.200 3.800V20L8 18M16 14l3.200 3.800V20L16 18M12 21v1.500"/><circle cx="12" cy="9.500" r="1.600"/>']
  };
  const row = (nm, desc, extra, btnText, dis, fn, ic) => {
    const r = document.createElement('div'); r.className = 'row';
    r.innerHTML = `${ic !== undefined && ICO[ic] ? `<div class="ico" style="--c:${ICO[ic][0]}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICO[ic][1]}</svg></div>` : ''}<div class="nm">${nm}<span>${desc}</span></div>${extra ? `<div class="lv">${extra}</div>` : ''}`;
    if (btnText) { const b = document.createElement('button'); b.className = 'buy'; b.textContent = btnText; b.disabled = dis; b.addEventListener('click', fn); r.appendChild(b); }
    list.appendChild(r);
  };
  $('shop-cr').textContent = '◆ ' + save.credits;
  if (shopTab === 's') {
    const tot = save.up.reduce((x, y) => x + y, 0), mk = ['I', 'II', 'III', 'IV', 'V'][Math.min(4, tot / 6 | 0)];
    const hd = document.createElement('div'); hd.className = 'spec-hd'; hd.innerHTML = `<b>STAR COURIER  MK ${mk}</b><span>Light multirole fighter · twin ion engines · 2 laser hardpoints · missile rack</span>`; list.appendChild(hd);
    const at = (i, f) => { const s0 = stats(); save.up[i] = Math.min(UPG[i].max, save.up[i] + 1); const s1 = stats(); save.up[i] = Math.max(0, save.up[i] - 1); return [f(s0), f(s1)]; };
    const mx = (i, f) => { const s0 = stats(), u = save.up[i]; save.up[i] = UPG[i].max; const s1 = stats(); save.up[i] = u; return f(s1); };
    const bar = (label, val, unit, i, f) => { const mxv = mx(i, f), nx = at(i, f)[1], cur = f(stats());
      const r = document.createElement('div'); r.className = 'spec';
      r.innerHTML = `<div class="sl">${label}</div><div class="sb"><i class="nx" style="width:${Math.min(100, nx / mxv * 100)}%"></i><i style="width:${Math.min(100, cur / mxv * 100)}%"></i></div><div class="sv">${val}${unit}</div>`; list.appendChild(r); };
    bar('LASER DAMAGE', ST.dmg.toFixed(1), ' /shot', 0, s => s.dmg);
    bar('SHIELD', ST.shieldMax, '', 1, s => s.shieldMax);
    bar('SHIELD RECHARGE', ST.shieldRegen, ' /s', 1, s => s.shieldRegen);
    bar('HULL', ST.hullMax, '', 2, s => s.hullMax);
    bar('CRUISE SPEED', Math.round(ST.cruise), ' m/s', 3, s => s.cruise);
    const ft = document.createElement('div'); ft.className = 'spec-ft'; ft.innerHTML = `<span>MISSILES <b>${save.missiles}</b></span><span>PIRATES DESTROYED <b>${save.kills}</b></span><span>UPGRADES <b>${tot}/${UPG.reduce((x, u) => x + u.max, 0)}</b></span>`; list.appendChild(ft);
    const lg = document.createElement('div'); lg.className = 'spec-lg'; lg.textContent = 'Bright bar = current  ·  faint extension = next upgrade'; list.appendChild(lg);
  } else if (shopTab === 'p') {
    const mp = document.createElement('div'); mp.className = 'smap'; list.appendChild(mp);
    const ms = mapSys < 0 ? stations[S.station].sys : mapSys, ids = stations.map((s, k) => k).filter(k => stations[k].sys === ms);
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; ids.forEach(k => { const s = stations[k]; x0 = Math.min(x0, s.pos.x); x1 = Math.max(x1, s.pos.x); z0 = Math.min(z0, s.pos.z); z1 = Math.max(z1, s.pos.z); });
    const pc = []; ids.forEach(k => { const s = stations[k]; pc[k] = [8 + 50 * (s.pos.x - x0) / (x1 - x0 || 1), 14 + 66 * (s.pos.z - z0) / (z1 - z0 || 1)]; });
    // network of lanes: every station linked to its two nearest neighbours, plus brighter lanes out of the station you are docked at
    const lanes = new Set(), here = S.station; ids.forEach(k => { ids.map(j => [j, stations[k].pos.distanceTo(stations[j].pos)]).filter(q => q[0] !== k).sort((p, q) => p[1] - q[1]).slice(0, 2).forEach(q => lanes.add(Math.min(k, q[0]) + '-' + Math.max(k, q[0]))); });
    let svg = '<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none">';
    lanes.forEach(l => { const [i, j] = l.split('-').map(Number); svg += `<line x1="${pc[i][0]}" y1="${pc[i][1]}" x2="${pc[j][0]}" y2="${pc[j][1]}" stroke="rgba(110,170,240,.35)" stroke-width="1" vector-effect="non-scaling-stroke"/>`; });
    ids.forEach(k => { if (k !== here && stations[here].sys === ms) svg += `<line x1="${pc[here][0]}" y1="${pc[here][1]}" x2="${pc[k][0]}" y2="${pc[k][1]}" stroke="rgba(255,200,96,.55)" stroke-width="1.2" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>`; });
    mp.insertAdjacentHTML('afterbegin', svg + '</svg><div style="position:absolute;left:10px;top:7px;font:700 10px system-ui,Arial,sans-serif;letter-spacing:3px;color:#7fb4e8">' + SYSTEMS[ms] + ' SYSTEM</div><div class="sysw">' + SYSTEMS.map((n, q) => `<button data-q="${q}" class="${q === ms ? 'on' : ''}">${n}</button>`).join('') + '</div>');
    ids.forEach(k => { const s = stations[k], d = document.createElement('div'); d.className = 'sn' + (k === S.station ? ' here' : '') + (S.mission && S.mission.type === 'delivery' && S.mission.to === k ? ' tgt' : '') + (pc[k][0] > 44 ? ' fl' : ''); d.style.left = pc[k][0] + '%'; d.style.top = pc[k][1] + '%';
      d.innerHTML = `<i style="${k === S.station ? '' : `background:${s.col};box-shadow:0 0 12px ${s.col}`}"></i><span>${s.name}<br><small>${k === S.station ? 'YOU ARE HERE' : (stations[S.station].pos.distanceTo(s.pos) / 1000 * (s.sys === stations[S.station].sys ? 1 : 3)).toFixed(1) + ' LY'}</small></span>`; mp.appendChild(d); d.addEventListener('click', () => pvShow(k)); });
    mp.querySelectorAll('.sysw button').forEach(b => b.addEventListener('click', () => { mapSys = +b.dataset.q; sfx('ui'); openShop($('shop-earn').textContent); }));
    const pvw = document.createElement('div'); pvw.className = 'pvw'; pvw.innerHTML = '<canvas width="120" height="120"></canvas><b></b><small></small><em>drag to spin · tap a station</em>'; mp.appendChild(pvw);
    const pvShow = (k) => { const p = stations[k].pl; pvw.querySelector('b').textContent = (PKIND[p.kind] || 'PLANET'); pvw.querySelector('small').textContent = stations[k].name + ' · ' + ((k * 600000 + p.r * 3000) / 1e6).toFixed(1) + 'M KM'; pvStart(pvw.querySelector('canvas'), k); };
    pvShow(stations[S.station].sys === ms ? S.station : ids[0]);
  } else if (shopTab === 'm') {
    if (S.mission) row('ACTIVE: ' + S.mission.title, S.mission.text + '  ·  ◆ ' + S.mission.reward, '', 'ABANDON', false, () => { S.mission = null; updateMissionHud(); openShop(msg); });
    offered.forEach((m) => row(m.title + '  ◆ ' + m.reward, m.text, '', S.mission ? 'BUSY' : 'ACCEPT', !!S.mission, () => { S.mission = Object.assign({}, m); if (m.zone) S.mission.zone = m.zone; updateMissionHud(); sfx('pick'); openShop('MISSION ACCEPTED'); }));
  } else {
    const prev = (i) => { const c = stats(); save.up[i]++; const n = stats(); save.up[i]--; return [
      `${c.dmg.toFixed(0)} → ${n.dmg.toFixed(0)} damage`, `${c.shieldMax} → ${n.shieldMax} shield`, `${c.hullMax} → ${n.hullMax} hull`, `${Math.round(c.cruise)} → ${Math.round(n.cruise)} m/s`][i]; };
    const tg = document.createElement('div'); tg.className = 'subtg'; tg.innerHTML = `<button class="${shopSub === 'u' ? 'on' : ''}" data-s="u">UPGRADES</button><button class="${shopSub === 'c' ? 'on' : ''}" data-s="c">CARGO</button>`;
    tg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { shopSub = b.dataset.s; sfx('ui'); openShop(msg); })); list.appendChild(tg);
    if (shopSub === 'c') {
      const used = save.cargo.reduce((x, y) => x + y, 0), hd = document.createElement('div'); hd.className = 'spec-ft'; hd.innerHTML = `<span>HOLD <b>${used}/${HOLD}</b></span><span>PRICES AT <b>${stations[S.station].name}</b></span>`; list.appendChild(hd);
      GOODS.forEach((g, gi) => { const m = cMul(S.station, gi), bp = Math.round(g.base * m), sp = Math.round(g.base * m * 0.9), tag = m < 0.9 ? '  ·  CHEAP HERE' : m > 1.18 ? '  ·  SELLS HIGH' : '';
        row(g.nm + '  ×' + save.cargo[gi], g.desc + tag, '', '◆ ' + bp, save.credits < bp || used >= HOLD, () => { save.credits -= bp; save.cargo[gi]++; persist(); refreshHud(); sfx('pick'); openShop(msg); }, 'c' + gi);
        const sb = document.createElement('button'); sb.className = 'buy sell'; sb.textContent = 'SELL ◆ ' + sp; sb.disabled = save.cargo[gi] < 1; sb.addEventListener('click', () => { save.credits += sp; save.cargo[gi]--; persist(); refreshHud(); sfx('pick'); openShop(msg); }); list.lastChild.appendChild(sb); });
      const ft = document.createElement('div'); ft.className = 'spec-lg'; ft.textContent = 'Buy where it is cheap, sell where it is dear. Every station pays differently.'; list.appendChild(ft);
    } else {
    UPG.forEach((u, i) => { const lv = save.up[i], maxed = lv >= u.max, cost = upCost(i); row(u.name, u.desc + (maxed ? '' : '  ·  ' + prev(i)), '■'.repeat(lv) + '□'.repeat(u.max - lv), maxed ? 'MAX' : '◆ ' + cost, maxed || save.credits < cost, () => { save.credits -= cost; save.up[i]++; persist(); refreshHud(); ST = stats(); sfx('pick'); openShop(msg); }, i); });
    row('MISSILES  ×' + save.missiles, 'Homing missiles, 3 per pack', '', '◆ 90', save.credits < 90 || save.missiles > 30, () => { save.credits -= 90; save.missiles += 3; persist(); refreshHud(); updateMissHud(); sfx('pick'); openShop(msg); }, 'm');
    }
  }
  updateMissHud(); document.body.classList.add('docked'); $('shop').classList.add('show');
}
['h', 'u', 'p', 'm', 's', 'b'].forEach(k => $('tab-' + k).addEventListener('click', () => { shopTab = k; openShop($('shop-earn').textContent); }));
// ---- space lounge: tap a patron to hear a rumour (free), or order a drink (small credit sink) for a better tip ----
{
  const PT = [
    { nm: 'MALVOR · SYNDICATE BOSS', t: ['Pay up or keep moving.', 'I own half this sector. Do not make it more.', 'Smile less, pilot. It does not suit you.'] },
    { nm: 'KYRA · ASSASSIN', t: ['I never miss. Ask my last target.', 'Quiet is how I like my work.', 'You blink, I vanish.'] },
    { nm: 'GRAKK · MERCENARY', t: ['Strong hull, stronger fists.', 'I do not ask who. I ask how much.', 'Hit me. I dare you.'] },
    { nm: 'SILAS · BROKER', t: ['Everything has a price. Even you.', 'I know who wants you dead. For a fee, I will tell you.', 'Information is the sharpest blade.'] },
    { nm: 'ZIRRA · SCOUT', t: ['I see you long before you see me.', 'The dark is my home. Stay out of it.', 'Do not follow me. You will not like where it ends.'] },
    { nm: 'BRUTE · BOUNCER', t: ['No trouble in here, pilot.', 'One wrong word and you leave through the airlock.', 'Move along. Or I move you.'] },
    { nm: 'NYX · SMUGGLER', t: ['Cargo? What cargo?', 'The border patrol never found me. They never will.', 'Fast ship, empty questions. That is my rule.'] },
    { nm: 'HOGG · FIXER', t: ['I can get anything. Cash first.', 'Do not ask where it came from.', 'A deal is a deal. Break it and I break you.'] },
    { nm: 'CORVAX · BOUNTY HUNTER', t: ['Your face is on a wanted list. Kidding. Maybe.', 'I always collect.', 'Run. It makes the hunt more fun.'] },
    { nm: 'ORLA · SPY', t: ['Walls have ears. Mine are better.', 'I know what you did last cycle.', 'Smile. You are being watched.'] },
    { nm: 'VYRA · PIRATE QUEEN', t: ['Fly well, or fly for me.', 'Every pirate out there answers to me.', 'Bow your head, pilot. I am only joking. Almost.'] },
    { nm: 'THE WATCHER · ORACLE', t: ['I know how your last fight ends.', 'The stars remember every pilot who fell.', 'Fear is only a warning. Listen to it.'] }
  ], TIP = ['Pextra is full of pirates. Go in with full shields.', 'The pirate pilot is always in the middle of the X. Hit the middle.', 'Keep your boost for escaping, not for chasing.', 'Missile packs are cheap. Pirates are not. Buy more.', 'Yapzo pays better than Helios, but the pirates hit harder.', 'A missile cracks even the biggest asteroid in one hit.'];
  const SLOTS = [{ x: 345, y: 344, s: 0.5 }, { x: 440, y: 342, s: 0.46 }, { x: 625, y: 334, s: 0.42 }, { x: 775, y: 340, s: 0.44 }, { x: 885, y: 354, s: 0.5 }];
  // five different faces at every station (a rotating pick from the twelve), cut from one sprite sheet
  const fillLounge = () => { const g = $('lg-pts'), st = S.station | 0, ns = 'http://www.w3.org/2000/svg'; let h = '';
    SLOTS.forEach((sl, j) => { const c = (st * 5 + j * 1 + (st > 5 ? 3 : 0)) % PT.length, w = 288 * sl.s, hh = 480 * sl.s;
      h += `<g class="pt" data-i="${c}" transform="translate(${sl.x} ${sl.y})"><ellipse cx="0" cy="${-hh * 0.45}" rx="${w * 0.7}" ry="${hh * 0.55}" fill="url(#lgGlow)"/><svg x="${-w / 2}" y="${-hh}" width="${w}" height="${hh}" viewBox="${(c % 6) * 288} ${(c / 6 | 0) * 480} 288 480" overflow="hidden"><image href="lounge.webp" width="1728" height="960"/></svg><rect class="hit" x="${-w / 2}" y="${-hh}" width="${w}" height="${hh}" fill="transparent"/></g>`; });
    g.innerHTML = h;
    g.querySelectorAll('.pt').forEach(el => el.addEventListener('click', () => { const i = +el.dataset.i, p = PT[i]; initAudio(); sfx('ui'); say(p.nm, p.t[idx[i]++ % p.t.length]); })); };
  window.__fillLounge = fillLounge;
  const idx = new Array(12).fill(0), say = (nm, tx) => { $('lg-nm').textContent = nm; $('lg-tx').textContent = tx; };
  $('lg-drink').addEventListener('click', () => { if (save.credits < 15) { toast('NOT ENOUGH CREDITS', 1); return; } save.credits -= 15; persist(); refreshHud(); $('shop-cr').textContent = '◆ ' + save.credits; initAudio(); sfx('pick'); { const nb = $('lg-nab'); nb.classList.add('on'); clearTimeout(nb._t); nb._t = setTimeout(() => nb.classList.remove('on'), 5000); } const on = $('lg-pts').querySelectorAll('.pt'), p = PT[+on[Math.random() * on.length | 0].dataset.i]; say(p.nm + ' · CHEERS', TIP[Math.random() * TIP.length | 0]); });
}

function dockAt(i) {
  mapSys = -1;
  tintHangar(stations[i].col); setPad(stations[i].sys); S.station = i; S.mode = 'dock'; S.target = null; S.speed = 0; S.vel.set(0, 0, 0); S.pos.set(HP.x, HP.y + 2.1, HP.z); S.q.identity(); S.shield = ST.shieldMax; S.hull = ST.hullMax; S.boost = 100;
  for (const e of enemies) { e.active = false; e.g.visible = false; } for (const m of missiles) { m.active = false; m.g.visible = false; } smokeReset();
  buzz(50);
  let msg = 'SHIP REPAIRED';
  if (S.mission && S.mission.type === 'delivery' && S.mission.to === i) { const r = S.mission.reward; completeMission(); msg = 'DELIVERY COMPLETE  +' + r; }
  offered = genMissions(i); shopTab = 'h'; openShop(msg);
}
// docking cinematic: swing onto the station axis, then fly down the hangar tunnel and stop; then the hangar menu opens
let entOn = false, entFor = 0, entDismissed = -1;
const fadeEl = document.getElementById('fade');
function fadeOut() { fadeEl.style.transition = 'opacity .7s'; fadeEl.style.opacity = '0'; }   // black screen that fades away after docking / launching
const DK = { i: 0, t: 0, tA: 1, p0: V3(), q0: new THREE.Quaternion(), q1: new THREE.Quaternion(), P1: V3(), dir: V3() };

// ---- star map ----
const mapOv = $('map-ov'), mapFld = $('map-fld'), mapMe = $('map-me'); let mapOn = false, mapB = null;
const mapBs = SYSTEMS.map((nm, k) => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const p of planets) if (p.sys === k) { x0 = Math.min(x0, p.pos.x); x1 = Math.max(x1, p.pos.x); z0 = Math.min(z0, p.pos.z); z1 = Math.max(z1, p.pos.z); } const sp = Math.max(x1 - x0, z1 - z0) || 1; return { x0, z0, sx: 1 / sp, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 }; });
(function () {
  planets.forEach((p, i) => {
    const mb = mapBs[p.sys], b = document.createElement('button'); b.className = 'mn'; b.id = 'mn' + i; b.style.setProperty('--c', stations[i].col);
    b.style.left = (50 + (p.pos.x - mb.cx) * mb.sx * 84) + '%'; b.style.top = (50 + (p.pos.z - mb.cz) * mb.sx * 84) + '%';
    b.innerHTML = '<i></i><span>' + stations[i].name + '</span><small></small>'; mapFld.appendChild(b);
    b.addEventListener('click', () => { if (S.mode !== 'fly') return; closeMap(); if (nearPlanet() === i) return; initAudio(); S.tPlanet = i; sfx('lock'); trvOn = true; $('trv-name').textContent = stations[i].name; $('trv-dlg').style.display = 'flex'; });
  });
  $('map-sys').addEventListener('click', () => { if (S.mode !== 'fly') return; const to = firstOfSys((curSys + 1) % SYSTEMS.length); closeMap(); initAudio(); S.tPlanet = to; sfx('lock'); trvOn = true; $('trv-name').textContent = SYSTEMS[stations[to].sys] + ' SYSTEM'; $('trv-dlg').style.display = 'flex'; });
})();
function updateMap() {
  updCurSys(); mapB = mapBs[curSys]; $('map-sys').textContent = '\u27A4 JUMP TO ' + SYSTEMS[(curSys + 1) % SYSTEMS.length] + ' SYSTEM'; $('map-title').textContent = 'STAR MAP \u00B7 ' + SYSTEMS[curSys] + ' SYSTEM'; planets.forEach((p, i) => { $('mn' + i).style.display = p.sys === curSys ? '' : 'none'; });
  const sc = mapB.sx * 84; mapMe.style.left = (50 + (S.pos.x - mapB.cx) * sc) + '%'; mapMe.style.top = (50 + (S.pos.z - mapB.cz) * sc) + '%';
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(S.q); mapMe.style.transform = 'translate(-50%,-60%) rotate(' + Math.atan2(f.x, -f.z) + 'rad)';
  const n = nearPlanet(); planets.forEach((p, i) => { const e = $('mn' + i); e.classList.toggle('cur', n === i); e.lastChild.textContent = n === i ? 'YOU ARE HERE' : ''; });
}
function openMap() { if (S.mode !== 'fly') return; if (entOn) { entOn = false; $('ent-dlg').style.display = 'none'; } mapOn = true; mapOv.style.display = 'block'; updateMap(); }
function closeMap() { mapOn = false; mapOv.style.display = 'none'; }
$('b-map').addEventListener('click', () => { setPause(false); mapOn ? closeMap() : openMap(); });
$('map-x').addEventListener('click', closeMap);
$('trv-yes').addEventListener('click', () => { trvOn = false; $('trv-dlg').style.display = 'none'; initAudio(); if (S.tPlanet >= 0) startWarp(S.tPlanet); });
$('trv-no').addEventListener('click', () => { aimCool = 8; trvOn = false; S.tPlanet = -1; $('trv-dlg').style.display = 'none'; });
$('ent-yes').addEventListener('click', () => { entOn = false; $('ent-dlg').style.display = 'none'; initAudio(); tryDock(); });
$('ent-no').addEventListener('click', () => { entOn = false; entDismissed = entFor; $('ent-dlg').style.display = 'none'; });
function tryDock() {
  if (S.mode !== 'fly') return; const i = nearStation(); if (i < 0) return;
  const st = stations[i]; DK.i = i; DK.t = 0; DK.p0.copy(S.pos); DK.q0.copy(S.q); DK.dir.copy(st.front).negate();
  _m.lookAt(_zero, DK.dir, lookUp(DK.dir)); DK.q1.setFromRotationMatrix(_m); DK.P1.copy(st.pos).addScaledVector(st.front, 125 * ST_K);
  DK.tA = 1.0; fadeEl.style.transition = 'none'; fadeEl.style.opacity = '0'; S.mode = 'dockin'; document.body.classList.add('docked'); S.target = null; S.boosting = false; S.sx = S.sy = 0;
}
function updateDockIn(dt) {   // no flying into the station: the ship is beamed in - the screen fades to black right where you are and the hangar opens
  DK.t += dt; S.speed *= Math.max(0, 1 - dt * 4); S.vel.multiplyScalar(Math.max(0, 1 - dt * 4)); S.pos.addScaledVector(S.vel, dt); S.roll = 0;
  fadeEl.style.opacity = Math.min(1, DK.t / 0.55).toFixed(2);
  if (DK.t >= 0.65) { dockAt(DK.i); fadeOut(); }
}
function nearStation() { let best = -1, bd = 200; for (let i = 0; i < stations.length; i++) { const d = S.pos.distanceTo(stations[i].pos); if (d < bd) { bd = d; best = i; } } return best; }

function launchFrom(i) {
  ST = stats(); S.station = i; const st = stations[i];
  S.pos.copy(st.pos).addScaledVector(st.front, 48 * ST_K);
  _m.lookAt(_zero, st.front, lookUp(st.front)); S.q.setFromRotationMatrix(_m); S.camQ.copy(S.q); entDismissed = i; fadeEl.style.transition = 'none'; fadeEl.style.opacity = '1'; setTimeout(fadeOut, 60);
  S.speed = 60; S.shield = ST.shieldMax; S.hull = ST.hullMax; S.boost = 100; S.inv = 2; S.mode = 'fly'; S.target = null; S.patrolT = 45; S.sx = S.sy = 0;
  for (const a of asteroids) a.active = false; for (const l of loot) l.active = false;
  document.body.classList.remove('docked'); $('shop').classList.remove('show');
}
function startGame() { initAudio(); unlockMusic(); if (actx && actx.state === 'suspended') actx.resume(); $('start').classList.remove('show'); updateMissionHud(); launchFrom(0); offered = genMissions(0); }
$('go-start').addEventListener('click', startGame);
$('go-start').textContent = 'LAUNCH';
{ const b = document.createElement('div'); b.style.cssText = 'margin-top:10px;font-size:10px;opacity:.5;letter-spacing:2px'; b.textContent = 'BUILD ' + BUILD; $('go-start').parentNode.appendChild(b); }
$('go-launch').addEventListener('click', () => { unlockMusic(); $('sh-dlg').style.display = 'flex'; });
document.addEventListener('click', (e) => {   // one place gives every menu button its sound
  const b = e.target.closest('button, .go'); if (!b || !b.closest('#shop, .edlg, #sh-dlg, #map-ov, #start, #pause-ov')) return; const id = b.id || '';
  initAudio(); sfx(['ent-yes', 'trv-yes', 'dlg-yes', 'go-start'].includes(id) ? 'uiOk' : ['ent-no', 'trv-no', 'dlg-no', 'map-x'].includes(id) ? 'uiNo' : id.startsWith('tab-') ? 'uiTab' : 'ui');
}, true);
$('dlg-no').addEventListener('click', () => { $('sh-dlg').style.display = 'none'; });
$('dlg-yes').addEventListener('click', () => { $('sh-dlg').style.display = 'none'; initAudio(); if (actx && actx.state === 'suspended') actx.resume(); launchFrom(S.station); });
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
    for (const st of stations) if (_b.distanceTo(st.pos) < 700) ok = false;
    for (const p of planets) if (_b.distanceTo(p.pos) < p.r + 120) ok = false;
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
const STN_VIS = 4500;   // a station is only drawn when you are at its planet (no stations scattered in the background)
const mk = stations.map((s, i) => $('mk-s' + i) || (() => { const e = $('mk-s0').cloneNode(true); e.id = 'mk-s' + i; $('mk-s0').parentNode.appendChild(e); return e; })()), mkWp = $('mk-wp'), tgtEl = $('tgt'), leadEl = $('lead'), crossEl = $('cross');
const mkp = stations.map((s, i) => { const e = $('mk-s0').cloneNode(true); e.id = 'mk-p' + i; e.classList.add('pl'); e.style.color = s.col; $('mk-s0').parentNode.appendChild(e); return e; });
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
  for (const s of stations) if (S.pos.distanceTo(s.pos) < STN_VIS) dot(s.pos, '#8fe8ff', 5, true);
  if (S.mission && S.mission.type === 'bounty') dot(S.mission.zone, '#ffd166', 5, true);
  if (S.mission && S.mission.type === 'delivery') dot(stations[S.mission.to].pos, '#ffd166', 6, true);
  for (const l of loot) if (l.active) dot(l.pos, '#ffd166', 2.2);
  for (const e of enemies) if (e.active) dot(e.pos, e === S.target ? '#ffffff' : '#ff5a4a', e === S.target ? 5 : 4);
  c.fillStyle = '#9ff3ff'; c.beginPath(); c.moveTo(cx, cy - 8); c.lineTo(cx + 6, cy + 6); c.lineTo(cx - 6, cy + 6); c.closePath(); c.fill();
}

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now; if (paused || dt > 0.05) dt = paused ? 0 : 0.05; if (dt <= 0) return;
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
    if (keys.KeyW || keys.ArrowUp) { S.thr = Math.min(1, S.thr + dt * 0.6); } if (keys.KeyS || keys.ArrowDown) { S.thr = Math.max(0, S.thr - dt * 0.6); }
    let target = ST.cruise * S.thr;
    if (S.boosting) { target = ST.cruise * 1.85; S.boost = Math.max(0, S.boost - 32 * dt); } else S.boost = Math.min(100, S.boost + 15 * dt);
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
      _a.set(S.side * 2.6 * SHIP_K, -0.05 * SHIP_K, -1.6 * SHIP_K).applyQuaternion(S.q).add(S.pos);
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
            hitAsteroid(a, b.dmg);
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
      else if (dist < 60 && Math.random() < 0.006) { e.evadeDir.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).addScaledVector(dirTo, -0.6).normalize(); e.evadeT = rnd(0.5, 0.9); }
      _m.lookAt(_zero, want, Y); _qb.setFromRotationMatrix(_m); e.q.rotateTowards(_qb, (e.evadeT > 0 ? 1.6 : 1.0) * dt);
      fwdOf(e.q, _c);
      const wantSp = e.evadeT > 0 ? 100 : dist > 400 ? 105 : dist > 160 ? 85 : 66; e.speed = damp(e.speed, wantSp, 1.4, dt);
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
    for (const st of stations) { _a.copy(S.pos).sub(st.pos); const d = _a.length(); if (d < 40 * ST_K) { S.pos.copy(st.pos).addScaledVector(_a.multiplyScalar(40 * ST_K / (d || 1)), 1); S.speed *= 0.6; } }
    // planets are scenery: they can never be reached (see the planet placement in the world animation)
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

  if (S.mode === 'dockin') updateDockIn(dt); else if (S.mode === 'warp') updateWarp(dt);
  // ---- ship + camera ----
  ship.position.copy(S.pos); ship.quaternion.copy(S.q); shipBody.rotation.z = S.roll;
  if (S.shGlow > 0) { S.shGlow = Math.max(0, S.shGlow - dt * 2.4); shGl.visible = S.shGlow > 0; shGl.material.uniforms.op.value = S.shGlow; shGl.material.uniforms.t.value = tAcc; }
  const vis = S.mode !== 'wreck', blink = S.inv > 0 && Math.floor(S.inv * 14) % 2 === 0; ship.visible = vis && !blink;
  { const on = S.mode !== 'dock'; flames.forEach(f => f.visible = on); flameCore.forEach(f => f.visible = on); flameCones.forEach(f => f.visible = on); hoverPads.forEach(p => p.visible = on); }
  const fl = 0.7 + S.speed / 220 + (S.boosting ? 0.9 : 0), flick = 0.9 + Math.sin(tAcc * 50) * 0.1;
  flames.forEach(f => { f.scale.setScalar(1.9 * fl * flick); f.material.color.setHex(S.boosting ? 0xffa050 : 0x7fe9ff); }); flameCore.forEach(f => f.scale.setScalar(0.7 * fl * flick)); flameMats.forEach((fm, k) => fm.color.setHex(flameCols[k][S.boosting ? 1 : 0])); flameCones.forEach(c => { const u = c.userData, L = u.L, fk = 0.88 + 0.12 * Math.sin(tAcc * (38 + L.k * 17) + u.ph) + 0.05 * Math.sin(tAcc * 91 + u.ph * 3), len = L.len * (0.45 + 0.55 * fl) * fk + 0.2, r = L.r * (0.85 + 0.15 * fl); c.scale.set(r, len, r); c.position.z = 0.9 + len / 2; });
  for (const e of enemies) if (e.active) { e.g.children[1].scale.setScalar(5 + Math.sin(tAcc * 40 + e.pos.x) * 0.6); }
  S.camQ.slerp(S.q, 1 - Math.exp(-7 * dt));
  const cd = 17 + S.speed * 0.014;
  _a.set(0, 4.6, cd).applyQuaternion(S.camQ); camera.position.copy(S.pos).add(_a);
  _qa.setFromAxisAngle(X, -0.07); camera.quaternion.copy(S.camQ).multiply(_qa);
  if (S.shake > 0) { const a = S.shake * 0.35; camera.position.x += Math.sin(tAcc * 71) * a; camera.position.y += Math.sin(tAcc * 83) * a; }
  _qa.setFromAxisAngle(Z, -S.sx * 0.05); camera.quaternion.multiply(_qa);
  const wantFov = 64 + clamp(S.speed / 150, 0, 1.4) * 12 + (S.boosting ? 13 : 0);
  if (Math.abs(camera.fov - wantFov) > 0.05) { camera.fov = damp(camera.fov, wantFov, S.boosting ? 6 : 3.5, dt); camera.updateProjectionMatrix(); }
  if (S.mode === 'dock') {
    // hangar view: the ship sits on its platform, the camera swings slowly round it (like Galaxy on Fire 2)
    hangar.visible = true; ship.quaternion.setFromAxisAngle(Y, 0.5); shipBody.rotation.z = 0;
    const a = Math.sin(tAcc * 0.17) * 1.05, hy = Math.sin(tAcc * 0.23) * 1.2, land = innerWidth > innerHeight * 1.2, off = land && shopTab !== 'h' ? 1 : 0;
    camera.position.set(HP.x + Math.sin(a) * 19, HP.y + 7.5 + hy, HP.z + Math.cos(a) * 19); camera.lookAt(HP.x, HP.y + 2.0, HP.z);
    if (!hangarVO || camera.fov !== 46 || off !== vo) { camera.fov = 46; hangarVO = true; vo = off; if (off) camera.setViewOffset(innerWidth, innerHeight, innerWidth * 0.2, 0, innerWidth, innerHeight); else { camera.clearViewOffset(); camera.updateProjectionMatrix(); } }
  } else if (hangarVO) { hangarVO = false; vo = 0; hangar.visible = false; camera.clearViewOffset(); camera.fov = 64; camera.updateProjectionMatrix(); }
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
    dummy.updateMatrix(); boltMesh.setMatrixAt(i, dummy.matrix); boltHalo.setMatrixAt(i, dummy.matrix);
  }
  boltMesh.instanceMatrix.needsUpdate = true; boltHalo.instanceMatrix.needsUpdate = true;
  updCurSys();
  let pBuilt = false; const PSIZE = 2;   // every planet is drawn twice as big
  fwdOf(S.q, fwd); const here0 = nearPlanet(); let pi = -1; aimCool = Math.max(0, aimCool - dt); const aimOk = S.mode === 'fly' && !trvOn && !entOn && !mapOn && !S.target && aimCool <= 0;
  for (const p of planets) { pi++;   // planets are unreachable scenery: drawn along the true direction but at an apparent distance that barely shrinks, with the size you would see from the real distance
    if (p.sys !== curSys) { p.mesh.visible = false; if (p.rg) p.rg.visible = false; continue; } p.mesh.visible = true; if (p.rg) p.rg.visible = true;
    _a.copy(p.pos).sub(S.pos); const d = _a.length() || 1, dA = 2600 + 0.12 * d, a = Math.max(0.026, p.r / Math.max(d, p.r * 1.6) * (d > 4000 ? Math.pow(4000 / d, 1.5) : 1)), k = a * dA / p.r;   // like Galaxy on Fire 2: far planets are tiny discs (about 3 degrees), the one at your station is huge
    const w = clamp((d - 1500) / 2500, 0, 1) * 0.7; _pd.copy(_a).divideScalar(d).multiplyScalar(1 - w).addScaledVector(_pc.copy(p.pos).sub(PCENS[p.sys]).normalize(), w).normalize();   // far planets fan out around the system centre so they never bunch up on screen
    if (p.build && !pBuilt) { p.build(); p.build = null; pBuilt = true; }   // each planet paints its surface the first time it is in view (one per frame, so there is no long freeze)
    if (p.cl) p.cl.rotation.y += dt * 0.012;
    if (p.moon) { p.mt += dt * 0.04; p.moon.position.set(Math.cos(p.mt) * 1.9, Math.sin(p.mt * 0.7) * 0.3, Math.sin(p.mt) * 1.9); }
    p.mesh.position.copy(S.pos).addScaledVector(_pd, dA); p.sm = (p.sm || 1) + (((here0 >= 0 && pi !== here0) ? 0.4 : 1) - (p.sm || 1)) * Math.min(1, dt * 1.5); const f = Math.min(PSIZE, 0.75 / a) * p.sm;   // while you are at one planet the others shrink to 40% (you can still see them, they just stop dominating the sky)   // double size, but the planet right next to you grows less so it does not swallow the whole sky
    { const lo = a * f < 0.085; if (lo !== p.lo) { p.lo = lo; p.mesh.geometry = lo ? p.g1 : p.g0; if (p.hm) p.hm.geometry = p.mesh.geometry; if (p.cl) p.cl.visible = !lo; if (p.moon) p.moon.visible = !lo; } }   // LOD: far planets (small discs) drop clouds, moon and sphere detail
    if (aimOk && pi !== here0 && fwd.dot(_pd) > Math.cos(Math.max(0.07, a * f * 1.3))) { p.aim = (p.aim || 0) + dt; if (p.aim > 0.9) { p.aim = 0; S.tPlanet = pi; sfx('lock'); trvOn = true; $('trv-name').textContent = stations[pi].name; $('trv-dlg').style.display = 'flex'; } } else p.aim = 0;   // hold the crosshair on a planet for ~1 s and the game asks if you want to go there
    p.mesh.scale.setScalar(p.r * k * f); if (p.rg) { p.rg.position.copy(p.mesh.position); p.rg.scale.setScalar(k * f); }
  }
  { const bo = S.boosting && S.mode === 'fly'; if (bo !== spdOn) { spdOn = bo; spdEl.style.opacity = bo ? '1' : '0'; }
    let fi = 0; if (S.mode === 'fly' || S.mode === 'wreck') { _fl.copy(SUN_DIR).multiplyScalar(9000).add(camera.position).project(camera); if (_fl.z < 1) fi = clamp(1.2 - Math.max(Math.abs(_fl.x), Math.abs(_fl.y)), 0, 1); }
    if (fi > 0.01 || flOn) { flOn = fi > 0.01; flareEl.style.opacity = fi.toFixed(2); if (flOn) { const W = innerWidth, H = innerHeight, sx = (_fl.x + 1) / 2 * W, sy = (1 - _fl.y) / 2 * H, cx = W / 2, cy = H / 2;
      for (let q = 0; q < flGh.length; q++) { const g = flGh[q], t = FLT[q]; g.style.transform = 'translate(' + (sx + (cx - sx) * t - FLS[q] / 2).toFixed(0) + 'px,' + (sy + (cy - sy) * t - FLS[q] / 2).toFixed(0) + 'px)'; } } }   // sun lens flare: a glow on the sun plus ghost discs along the line through the screen centre
  }
  for (const st of stations) { st.g.visible = S.pos.distanceTo(st.pos) < STN_VIS; }
  updateTraffic();
  dustMat.uniforms.uCam.value.copy(camera.position); dustMat.uniforms.uVel.value.copy(S.vel);
  dustMat.uniforms.uK.value = 0.012 + (S.boosting ? 0.05 : 0.008); dustMat.uniforms.uAlpha.value = S.mode === 'dock' ? 0 : 0.22 + clamp(S.speed / 170, 0, 1) * 0.35 + (S.boosting ? 0.2 : 0);

  // ---- HUD ----
  $('b-sh').style.transform = `scaleX(${clamp(S.shield / ST.shieldMax, 0, 1).toFixed(3)})`;
  $('b-hu').style.transform = `scaleX(${clamp(S.hull / ST.hullMax, 0, 1).toFixed(3)})`;
  $('b-bo').style.transform = `scaleX(${clamp(S.boost / 100, 0, 1).toFixed(3)})`;
  $('kmh').textContent = Math.round(S.speed);
  const showHud = flying;
  crossEl.style.display = showHud ? 'block' : 'none';
  if (flying) {
    for (let i = 0; i < stations.length; i++) {
      const d = S.pos.distanceTo(stations[i].pos); if (d < STN_VIS) place(mk[i], stations[i].pos, stations[i].name + ' STATION · ' + (d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m'), false); else mk[i].style.display = 'none';
      const lk = S.tPlanet === i; mkp[i].classList.toggle('lock', lk); if (!lk) mkp[i].style.display = 'none'; else place(mkp[i], planets[i].mesh.position, '', lk);
    }
    const m = S.mission;
    if (m && (m.type === 'bounty' || m.type === 'delivery')) { const p = m.type === 'bounty' ? m.zone : stations[m.to].pos, d = S.pos.distanceTo(p); place(mkWp, p, (m.type === 'bounty' ? 'BOUNTY ZONE' : 'DELIVERY') + ' · ' + (d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m'), true); } else mkWp.style.display = 'none';
    if (S.target && S.target.active) {
      const e = S.target; const d = S.pos.distanceTo(e.pos);
      const on = place(tgtEl, e.pos, undefined, false); $('t-txt').textContent = e.name + ' · ' + Math.round(d) + ' m';
      $('t-sh').style.transform = `scaleX(${clamp(e.shield / e.shieldMax, 0, 1)})`; $('t-hu').style.transform = `scaleX(${clamp(e.hull / e.hullMax, 0, 1)})`;
      if (on) { place(leadEl, S.lead, undefined, false); } else leadEl.style.display = 'none';
      if (!on) { /* off-screen: radar shows it */ }
    } else { tgtEl.style.display = 'none'; leadEl.style.display = 'none'; }
    const ns = nearStation();
    if (entDismissed >= 0 && S.pos.distanceTo(stations[entDismissed].pos) > 300) entDismissed = -1;
    const wantEnt = ns >= 0 && ns !== entDismissed && stations[ns].g.visible && !trvOn && !mapOn;
    if (wantEnt && !entOn) { entOn = true; entFor = ns; $('ent-name').textContent = stations[ns].name; $('ent-dlg').style.display = 'flex'; sfx('lock'); }
    else if (!wantEnt && entOn) { entOn = false; $('ent-dlg').style.display = 'none'; }
    if (++flip % 2 === 0) drawRadar();
  } else { if (entOn) { entOn = false; $('ent-dlg').style.display = 'none'; } if (trvOn) { trvOn = false; $('trv-dlg').style.display = 'none'; } for (const e of mk) e.style.display = 'none'; for (const e of mkp) e.style.display = 'none'; mkWp.style.display = 'none'; tgtEl.style.display = 'none'; leadEl.style.display = 'none'; }
  updateAudio(); updateMusic(dt);
  composer.render();
}

// menu backdrop: the ship idling next to XIAQA
(function menuScene() { S.pos.set(170, -40, 520); _m.lookAt(_zero, V3(-170, 30, -520).normalize(), Y); S.q.setFromRotationMatrix(_m); S.camQ.copy(S.q); S.mode = 'menu'; ST = stats(); for (let i = 0; i < AST_N; i++) spawnAsteroid(asteroids[i], true); })();
requestAnimationFrame(frame);
document.addEventListener('visibilitychange', () => { last = performance.now(); if (actx) { document.hidden ? actx.suspend() : actx.resume(); } });
window.__sc = { S, stations, save, enemies, startGame, spawnEnemy, dockAt, damageEnemy, THREE, renderer };