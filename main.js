import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// ============ זיהוי מובייל ============
function isMobile() {
  const ua = navigator.userAgent || '';
  const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i;
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  return mobileRegex.test(ua.toLowerCase()) || (hasTouch && Math.min(screen.width, screen.height) < 1000);
}

if (!isMobile()) {
  document.getElementById('desktop-warning').classList.add('show');
} else {
  initGame();
}

function initGame() {

// ============ מסך מלא + סיבוב ============
let fsDone = false;
function tryFullscreen() {
  if (fsDone) return;
  fsDone = true;
  const el = document.documentElement;
  const rq = el.requestFullscreen || el.webkitRequestFullscreen;
  if (rq) rq.call(el).catch(() => {});
}
document.addEventListener('touchstart', tryFullscreen, { once: true });

function checkOrientation() {
  document.getElementById('orientation-warning').classList.toggle('show', window.innerHeight > window.innerWidth);
}
window.addEventListener('resize', checkOrientation);
window.addEventListener('orientationchange', () => setTimeout(checkOrientation, 150));
checkOrientation();

// ============ סצנה ורנדרר ============
const WORLD_SIZE = 220;
const HALF = WORLD_SIZE / 2;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xe9c9a2, 0.0095);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 600);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// ============ Post-processing (Bloom + Color Grading) ============
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.38, 0.7, 0.82
);
composer.addPass(bloomPass);

const gradePass = new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float g = dot(c.rgb, vec3(0.299,0.587,0.114));
      c.rgb = mix(vec3(g), c.rgb, 1.18);              // saturation
      c.rgb = (c.rgb - 0.5) * 1.10 + 0.5;            // contrast
      c.r *= 1.06; c.g *= 1.01; c.b *= 0.94;         // warm grade
      vec2 q = vUv - 0.5;
      float vig = smoothstep(0.9, 0.3, length(q) * 1.35);
      c.rgb *= mix(0.72, 1.0, vig);                  // vignette
      gl_FragColor = c;
    }`
});
composer.addPass(gradePass);

// ============ שמיים עם gradient ושמש ============
const skyUniforms = {
  zenith: { value: new THREE.Color(0x8fc4e8) },
  horizon: { value: new THREE.Color(0xf6dcb4) },
  sunDir: { value: new THREE.Vector3(0.4, 0.5, 0.3).normalize() },
  sunColor: { value: new THREE.Color(0xffd9a0) }
};
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(400, 24, 12),
  new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        vec3 col = mix(horizon, zenith, pow(clamp(d.y, 0.0, 1.0), 0.55));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += sunColor * (pow(s, 240.0) * 1.4 + pow(s, 10.0) * 0.30);
        gl_FragColor = vec4(col, 1.0);
      }`
  })
);
scene.add(sky);

// ============ תאורת שעת זהב ============
const ambientLight = new THREE.AmbientLight(0x8899bb, 0.35);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0xbfd8e8, 0x6b7a4a, 0.55);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xffd9a0, 2.4);
sunLight.position.set(60, 45, 35);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 220;
sunLight.shadow.camera.left = -70;
sunLight.shadow.camera.right = 70;
sunLight.shadow.camera.top = 70;
sunLight.shadow.camera.bottom = -70;
sunLight.shadow.bias = -0.0004;
sunLight.shadow.radius = 3;
scene.add(sunLight);

const fillLight = new THREE.DirectionalLight(0x99bbee, 0.35);
fillLight.position.set(-50, 30, -40);
scene.add(fillLight);

// ============ Noise ============
function noise2D(x, z) {
  const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return n - Math.floor(n);
}
function smoothNoise(x, z, scale) {
  const sx = x / scale, sz = z / scale;
  const ix = Math.floor(sx), iz = Math.floor(sz);
  const fx = sx - ix, fz = sz - iz;
  const a = noise2D(ix, iz), b = noise2D(ix + 1, iz);
  const c = noise2D(ix, iz + 1), d = noise2D(ix + 1, iz + 1);
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  return a * (1 - ux) * (1 - uz) + b * ux * (1 - uz) + c * (1 - ux) * uz + d * ux * uz;
}
function fbm(x, z) {
  return smoothNoise(x, z, 40) * 0.5 + smoothNoise(x, z, 20) * 0.3 + smoothNoise(x, z, 10) * 0.2;
}
function getGroundHeight(x, z) { return fbm(x, z) * 3.5 - 1.75; }
function pathCenter(z) { return Math.sin(z * 0.05) * 6 + Math.sin(z * 0.013) * 4; }
function pathMask(x, z) {
  const d = Math.abs(x - pathCenter(z));
  return 1 - THREE.MathUtils.smoothstep(d, 1.6, 3.4);
}

// ============ קרקע עם שביל עפר ============
const groundGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 140, 140);
const pos = groundGeo.attributes.position;
const colors = new Float32Array(pos.count * 3);
const col = new THREE.Color();

for (let i = 0; i < pos.count; i++) {
  const x = pos.getX(i);
  const y = pos.getY(i);
  const wz = -y;
  const h = fbm(x, y) * 3.5 - 1.75 - pathMask(x, wz) * 0.15;
  pos.setZ(i, h);

  const nx = (x + HALF) / WORLD_SIZE;
  const nz = (wz + HALF) / WORLD_SIZE;
  const dist = Math.sqrt(x * x + wz * wz);
  const bn = fbm(x * 0.5, y * 0.5);
  const micro = noise2D(x * 3.1, y * 2.7) * 0.06;

  if (dist < 22) col.setRGB(0.30, 0.55, 0.24);
  else if (nx < 0.3 && nz < 0.3) col.setRGB(0.16, 0.36, 0.19);
  else if (nx > 0.7 && nz < 0.3) col.setRGB(0.82, 0.71, 0.45);
  else if (nx < 0.3 && nz > 0.7) col.setRGB(0.86, 0.90, 0.95);
  else if (nx > 0.7 && nz > 0.7) col.setRGB(0.36, 0.41, 0.26);
  else col.setRGB(0.33 + bn * 0.08, 0.54 + bn * 0.09, 0.26);

  col.r += micro; col.g += micro; col.b += micro;

  const pm = pathMask(x, wz);
  if (pm > 0) {
    const dirt = 0.85 + noise2D(x * 5.3, y * 4.7) * 0.25;
    col.lerp(new THREE.Color(0.47 * dirt, 0.35 * dirt, 0.23 * dirt), pm);
  }
  colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
}
groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
groundGeo.computeVertexNormals();

const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: 0.95, metalness: 0.0, flatShading: true
}));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ============ דשא עם רוח + צבעים משתנים ============
const uTime = { value: 0 };
const grassGeo = new THREE.ConeGeometry(0.07, 0.55, 4, 1, true);
grassGeo.translate(0, 0.27, 0);
const grassMat = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
grassMat.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = uTime;
  shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>
     vec4 wpos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
     float sway = sin(uTime * 1.7 + wpos.x * 0.35 + wpos.z * 0.27);
     float hf = position.y * position.y * 3.0;
     transformed.x += sway * 0.14 * hf;
     transformed.z += cos(uTime * 1.3 + wpos.z * 0.22) * 0.09 * hf;`
  );
};
const GRASS = 9000;
const grassMesh = new THREE.InstancedMesh(grassGeo, grassMat, GRASS);
grassMesh.receiveShadow = true;
const dummy = new THREE.Object3D();
const gCol = new THREE.Color();
let gi = 0;
for (let i = 0; i < GRASS * 1.4 && gi < GRASS; i++) {
  const x = (Math.random() - 0.5) * WORLD_SIZE * 0.94;
  const z = (Math.random() - 0.5) * WORLD_SIZE * 0.94;
  if (pathMask(x, z) > 0.45) continue;
  const h = getGroundHeight(x, z);
  dummy.position.set(x, h - 0.03, z);
  dummy.rotation.set((Math.random() - 0.5) * 0.25, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.25);
  dummy.scale.setScalar(0.7 + Math.random() * 0.9);
  dummy.updateMatrix();
  grassMesh.setMatrixAt(gi, dummy.matrix);
  const t = Math.random();
  gCol.setRGB(0.22 + t * 0.18, 0.45 + t * 0.25, 0.16 + t * 0.10);
  grassMesh.setColorAt(gi, gCol);
  gi++;
}
grassMesh.count = gi;
grassMesh.instanceMatrix.needsUpdate = true;
if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true;
scene.add(grassMesh);

// ============ פרחים ============
const flowerCols = [0xff6699, 0xffcc33, 0xff8844, 0xaa66ff, 0xffffff];
const flowerGeo = new THREE.IcosahedronGeometry(0.09, 0);
for (let i = 0; i < 160; i++) {
  const x = (Math.random() - 0.5) * WORLD_SIZE * 0.85;
  const z = (Math.random() - 0.5) * WORLD_SIZE * 0.85;
  if (pathMask(x, z) > 0.4) continue;
  const f = new THREE.Mesh(flowerGeo, new THREE.MeshStandardMaterial({
    color: flowerCols[i % 5], emissive: flowerCols[i % 5], emissiveIntensity: 0.15, flatShading: true
  }));
  f.position.set(x, getGroundHeight(x, z) + 0.28, z);
  scene.add(f);
}

// ============ סלעים עם וריאציה ============
function createRock(x, z, s) {
  const geo = new THREE.DodecahedronGeometry(0.8, 0);
  const shade = 0.55 + Math.random() * 0.3;
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: new THREE.Color(shade, shade * 0.97, shade * 0.92), roughness: 0.95, flatShading: true
  }));
  m.scale.set(s, s * (0.55 + Math.random() * 0.3), s * (0.8 + Math.random() * 0.4));
  m.position.set(x, getGroundHeight(x, z) + s * 0.22, z);
  m.rotation.set(Math.random() * 0.6, Math.random() * Math.PI * 2, Math.random() * 0.6);
  m.castShadow = true; m.receiveShadow = true;
  scene.add(m);
  return m;
}
for (let i = 0; i < 70; i++) {
  const x = (Math.random() - 0.5) * WORLD_SIZE * 0.9;
  const z = (Math.random() - 0.5) * WORLD_SIZE * 0.9;
  createRock(x, z, 0.4 + Math.random() * 1.4);
}
for (let i = 0; i < 50; i++) {
  const z = (Math.random() - 0.5) * WORLD_SIZE * 0.9;
  const x = pathCenter(z) + (Math.random() > 0.5 ? 1 : -1) * (2.6 + Math.random() * 1.6);
  createRock(x, z, 0.15 + Math.random() * 0.3);
}

// ============ עצים עשירים ============
function createTree(x, z, type) {
  const tree = new THREE.Group();
  const h = getGroundHeight(x, z);
  const trunkH = 1.6 + Math.random() * 1.2;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.3, trunkH, 6),
    new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.95, flatShading: true })
  );
  trunk.position.y = trunkH / 2;
  trunk.rotation.z = (Math.random() - 0.5) * 0.12;
  trunk.castShadow = true;
  tree.add(trunk);

  const green = new THREE.Color().setHSL(0.29 + Math.random() * 0.06, 0.5 + Math.random() * 0.2, 0.28 + Math.random() * 0.12);
  const leafMat = new THREE.MeshStandardMaterial({ color: green, roughness: 0.9, flatShading: true });

  if (type === 'pine') {
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.7 - i * 0.4, 1.9, 7), leafMat);
      cone.position.y = trunkH + 0.6 + i * 1.05;
      cone.rotation.y = Math.random() * Math.PI;
      cone.castShadow = true;
      tree.add(cone);
    }
  } else if (type === 'dead') {
    for (let i = 0; i < 3; i++) {
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, 1.2, 5), leafMat);
      br.position.y = trunkH + 0.3;
      br.rotation.z = (i - 1) * 0.7;
      tree.add(br);
    }
  } else {
    const blobs = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < blobs; i++) {
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1 + Math.random() * 0.6, 0), leafMat);
      blob.position.set((Math.random() - 0.5) * 0.9, trunkH + 0.9 + Math.random() * 0.7, (Math.random() - 0.5) * 0.9);
      blob.rotation.set(Math.random(), Math.random(), Math.random());
      blob.castShadow = true;
      tree.add(blob);
    }
  }
  tree.position.set(x, h, z);
  tree.scale.setScalar(0.85 + Math.random() * 0.6);
  scene.add(tree);
  return tree;
}
for (let i = 0; i < 110; i++) {
  const x = (Math.random() - 0.5) * WORLD_SIZE * 0.9;
  const z = (Math.random() - 0.5) * WORLD_SIZE * 0.9;
  if (Math.sqrt(x * x + z * z) < 9 || pathMask(x, z) > 0.5) continue;
  const nx = (x + HALF) / WORLD_SIZE, nz = (z + HALF) / WORLD_SIZE;
  let type = 'normal';
  if (nx < 0.3 && nz < 0.3) type = 'pine';
  if (nx > 0.7 && nz < 0.3) type = 'dead';
  createTree(x, z, type);
}
// גבעות רקע רחוקות
for (let i = 0; i < 10; i++) {
  const a = (i / 10) * Math.PI * 2;
  const hill = new THREE.Mesh(
    new THREE.ConeGeometry(18 + Math.random() * 14, 10 + Math.random() * 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x7a8a5a, roughness: 1, flatShading: true })
  );
  hill.position.set(Math.cos(a) * 150, 0, Math.sin(a) * 150);
  scene.add(hill);
}

// ============ מבנים לגילוי ============
const discoveries = [];
const discoveryData = [
  { name: 'חורבות עתיקות', desc: 'שרידי תרבות קדומה', pos: [40, 0, -40], type: 'ruins' },
  { name: 'מעבדה נטושה', desc: 'ציוד מדעי ישן', pos: [-50, 0, 30], type: 'lab' },
  { name: 'מקדש השמש', desc: 'מבנה מסתורי', pos: [60, 0, 50], type: 'temple' },
  { name: 'אנדרטת הרוח', desc: 'פסל ענק', pos: [-40, 0, -60], type: 'monument' },
  { name: 'מערה נסתרת', desc: 'פתח חשוך', pos: [20, 0, 70], type: 'cave' },
  { name: 'מגדלור עזוב', desc: 'אור מרוחק', pos: [-70, 0, -30], type: 'lighthouse' },
  { name: 'בריכת בדולח', desc: 'מים זוהרים', pos: [0, 0, -80], type: 'pool' },
  { name: 'עץ החיים', desc: 'עץ עתיק וענק', pos: [80, 0, -10], type: 'tree' }
];
function createDiscovery(data) {
  const group = new THREE.Group();
  const h = getGroundHeight(data.pos[0], data.pos[2]);
  group.position.set(data.pos[0], h, data.pos[2]);
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.85, ...o });

  if (data.type === 'ruins') {
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 2.2 + Math.random(), 7), mat(0xb8b0a2));
      const a = (i / 5) * Math.PI * 2;
      c.position.set(Math.cos(a) * 2.2, 1.1, Math.sin(a) * 2.2);
      c.rotation.z = (Math.random() - 0.5) * 0.35;
      c.castShadow = true; group.add(c);
    }
    const base = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.3, 5.4), mat(0x9a9284));
    base.position.y = 0.15; base.receiveShadow = true; group.add(base);
  } else if (data.type === 'lab') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(4, 2.5, 3), mat(0x556677, { metalness: 0.4 }));
    box.position.y = 1.25; box.castShadow = true; group.add(box);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), mat(0xcccccc, { metalness: 0.6 }));
    ant.position.set(1, 3.3, 0); group.add(ant);
  } else if (data.type === 'temple') {
    const pyr = new THREE.Mesh(new THREE.ConeGeometry(3.2, 4.2, 4), mat(0xccaa66));
    pyr.position.y = 2.1; pyr.rotation.y = Math.PI / 4; pyr.castShadow = true; group.add(pyr);
    const glow = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0),
      new THREE.MeshStandardMaterial({ color: 0xffcc44, emissive: 0xffaa00, emissiveIntensity: 2.2, flatShading: true }));
    glow.position.y = 4.8; group.add(glow);
    const l = new THREE.PointLight(0xffaa00, 2.5, 14); l.position.y = 4.8; group.add(l);
  } else if (data.type === 'monument') {
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 5, 7), mat(0x999999, { metalness: 0.3 }));
    st.position.y = 2.5; st.castShadow = true; group.add(st);
    const hd = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), mat(0xaaaaaa));
    hd.position.y = 5.4; group.add(hd);
  } else if (data.type === 'cave') {
    const cv = new THREE.Mesh(new THREE.SphereGeometry(2.4, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x333333, { side: THREE.BackSide }));
    cv.position.y = 0.8; group.add(cv);
    const r2 = new THREE.Mesh(new THREE.DodecahedronGeometry(2.4, 0), mat(0x555555));
    r2.position.y = 0.6; r2.castShadow = true; group.add(r2);
  } else if (data.type === 'lighthouse') {
    const tw = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.3, 6, 8), mat(0xf2f2f2));
    tw.position.y = 3; tw.castShadow = true; group.add(tw);
    const tp = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 1, 8), mat(0xdd3333));
    tp.position.y = 6.5; group.add(tp);
    const l = new THREE.PointLight(0xffff88, 3, 20); l.position.y = 6.5; group.add(l);
  } else if (data.type === 'pool') {
    const pl = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.2, 18),
      new THREE.MeshStandardMaterial({ color: 0x33ccff, emissive: 0x0088cc, emissiveIntensity: 1.2, transparent: true, opacity: 0.85, flatShading: true }));
    pl.position.y = 0.1; group.add(pl);
    const l = new THREE.PointLight(0x00aaff, 2.5, 14); l.position.y = 1; group.add(l);
  } else if (data.type === 'tree') {
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.3, 4, 8), mat(0x553311));
    tr.position.y = 2; tr.castShadow = true; group.add(tr);
    const lv = new THREE.Mesh(new THREE.IcosahedronGeometry(3.6, 1),
      new THREE.MeshStandardMaterial({ color: 0x33bb55, emissive: 0x116622, emissiveIntensity: 0.5, flatShading: true }));
    lv.position.y = 5.2; lv.castShadow = true; group.add(lv);
  }
  scene.add(group);
  discoveries.push({ group, data, discovered: false });
}
discoveryData.forEach(createDiscovery);

// ============ גבישים ============
const collectibles = [];
const crystalGeo = new THREE.OctahedronGeometry(0.3, 0);
const crystalColors = [0xffd700, 0x00ffff, 0xff00ff, 0x00ff88, 0xff4444];
for (let i = 0; i < 25; i++) {
  const x = (Math.random() - 0.5) * WORLD_SIZE * 0.85;
  const z = (Math.random() - 0.5) * WORLD_SIZE * 0.85;
  const color = crystalColors[i % 5];
  const crystal = new THREE.Mesh(crystalGeo, new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 1.8, transparent: true, opacity: 0.9, flatShading: true
  }));
  crystal.position.set(x, getGroundHeight(x, z) + 0.8, z);
  const light = new THREE.PointLight(color, 1.2, 4);
  light.position.copy(crystal.position);
  scene.add(crystal); scene.add(light);
  collectibles.push({ mesh: crystal, light, collected: false });
}

// ============ הרובר המפורט (כמו בתמונה!) ============
const rover = new THREE.Group();
const M = {
  body: new THREE.MeshStandardMaterial({ color: 0x9fb4c4, metalness: 0.35, roughness: 0.5, flatShading: true }),
  bodyDark: new THREE.MeshStandardMaterial({ color: 0x5d6d7c, metalness: 0.45, roughness: 0.55, flatShading: true }),
  metal: new THREE.MeshStandardMaterial({ color: 0x8a97a3, metalness: 0.7, roughness: 0.4, flatShading: true }),
  metalDark: new THREE.MeshStandardMaterial({ color: 0x3c434c, metalness: 0.6, roughness: 0.6, flatShading: true }),
  wheel: new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.95, flatShading: true }),
  tread: new THREE.MeshStandardMaterial({ color: 0x352e28, roughness: 0.95, flatShading: true }),
  dome: new THREE.MeshStandardMaterial({ color: 0xcfe8f5, metalness: 0.15, roughness: 0.3, flatShading: true }),
  black: new THREE.MeshStandardMaterial({ color: 0x101418, roughness: 0.6, flatShading: true }),
  cable: new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.8 })
};

// גוף
const hull = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 1.3), M.body);
hull.position.y = 0.78; rover.add(hull);
const frontPlate = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.42, 0.14), M.bodyDark);
frontPlate.position.set(0, 0.78, -0.68); frontPlate.rotation.x = -0.25; rover.add(frontPlate);
const crate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.6), M.bodyDark);
crate.position.set(-0.55, 1.25, 0.3); crate.rotation.y = 0.2; rover.add(crate);

// כיפה עם "עיניים"
const dome = new THREE.Mesh(new THREE.SphereGeometry(0.72, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.dome);
dome.position.y = 1.05; dome.scale.y = 0.88; rover.add(dome);
const domeRing = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.05, 6, 14), M.bodyDark);
domeRing.position.y = 1.05; domeRing.rotation.x = Math.PI / 2; rover.add(domeRing);
[-0.24, 0.24].forEach(ex => {
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.055, 0.03), M.black);
  eye.position.set(ex, 1.22, -0.56); eye.rotation.x = -0.45; rover.add(eye);
});

// פודים צדדיים (חיישנים + מצלמות)
[-1, 1].forEach(side => {
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.55), M.metal);
  arm.position.set(0.35, 1.0, side * 0.72); rover.add(arm);
  const podBase = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.21, 0.16, 8), M.bodyDark);
  podBase.position.set(0.35, 1.1, side * 0.92); rover.add(podBase);
  const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.34, 10), M.body);
  pod.position.set(0.35, 1.32, side * 0.92); rover.add(pod);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.13, 10), M.black);
  band.position.set(0.35, 1.4, side * 0.92); rover.add(band);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.17, 0.08, 10), M.body);
  cap.position.set(0.35, 1.53, side * 0.92); rover.add(cap);
  const camHead = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.18), M.body);
  camHead.position.set(0.72, 1.15, side * 0.92); rover.add(camHead);
  [-0.06, 0.06].forEach(o => {
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8), M.black);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0.72 + o, 1.15, side * 0.92 - 0.1); rover.add(lens);
  });
});

// מתלים + גלגלים עם סוליות
const wheels = [];
function createShock(len) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, len, 8), M.metalDark);
  g.add(body);
  for (let i = 0; i < 4; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.022, 6, 12), M.metal);
    ring.position.y = -len / 2 + (i + 0.5) * (len / 4);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
  }
  return g;
}
[[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sz]) => {
  const wx = sx * 1.15, wz = sz * 0.85;
  const upArm = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.09, 0.09), M.metal);
  upArm.position.set(sx * 0.82, 0.95, wz * 0.85);
  upArm.rotation.z = -sx * 0.35; upArm.rotation.x = sz * 0.25; rover.add(upArm);
  const loArm = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.09, 0.09), M.metal);
  loArm.position.set(sx * 0.85, 0.5, wz * 0.9);
  loArm.rotation.z = -sx * 0.18; rover.add(loArm);
  const shock = createShock(0.55);
  shock.position.set(sx * 0.78, 0.8, wz * 0.72);
  shock.rotation.z = -sx * 0.45; shock.rotation.x = sz * 0.25; rover.add(shock);

  const wg = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.34, 12), M.wheel);
  rim.rotation.z = Math.PI / 2; wg.add(rim);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.11, 0.13), M.tread);
    t.position.set(0, Math.cos(a) * 0.44, Math.sin(a) * 0.44);
    t.rotation.x = a; wg.add(t);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.37, 8), M.metal);
  hub.rotation.z = Math.PI / 2; wg.add(hub);
  wg.position.set(wx, 0.45, wz);
  rover.add(wg); wheels.push(wg);
});

// כבלים
const cableCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-0.5, 1.02, -0.5), new THREE.Vector3(-0.2, 0.9, -0.66),
  new THREE.Vector3(0.2, 0.93, -0.64), new THREE.Vector3(0.5, 1.02, -0.5)
]);
rover.add(new THREE.Mesh(new THREE.TubeGeometry(cableCurve, 16, 0.022, 6), M.cable));
const cable2 = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-0.6, 0.95, 0.55), new THREE.Vector3(-0.2, 0.82, 0.7),
  new THREE.Vector3(0.3, 0.85, 0.68), new THREE.Vector3(0.6, 0.95, 0.5)
]);
rover.add(new THREE.Mesh(new THREE.TubeGeometry(cable2, 16, 0.02, 6), M.cable));

// אנטנה משופעת
const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.95, 6), M.metal);
mast.position.set(-0.6, 1.5, 0.35); mast.rotation.z = 0.35; mast.rotation.x = -0.15; rover.add(mast);
const panel = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.5, 0.04), M.bodyDark);
panel.position.set(-0.78, 1.95, 0.42); panel.rotation.z = 0.5; panel.rotation.y = 0.3; rover.add(panel);

// פנסים
const hlMat = new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffeeaa, emissiveIntensity: 1.6, flatShading: true });
[-0.55, 0.55].forEach(hx => {
  const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.12, 8), hlMat);
  hl.rotation.x = Math.PI / 2; hl.position.set(hx, 0.78, -0.74); rover.add(hl);
});
const headLight = new THREE.SpotLight(0xffeecc, 2.0, 18, Math.PI / 6, 0.35);
headLight.position.set(0, 0.9, -0.8);
headLight.target.position.set(0, 0, -12);
rover.add(headLight); rover.add(headLight.target);

rover.traverse(o => { if (o.isMesh) o.castShadow = true; });
scene.add(rover);

// ============ שליטה ============
const keys = { forward: false, backward: false, left: false, right: false };
document.querySelectorAll('.dpad-btn').forEach(btn => {
  const key = btn.dataset.key;
  const on = (e) => { if (e) e.preventDefault(); keys[key] = true; btn.classList.add('active'); };
  const off = (e) => { if (e) e.preventDefault(); keys[key] = false; btn.classList.remove('active'); };
  btn.addEventListener('touchstart', on, { passive: false });
  btn.addEventListener('touchend', off, { passive: false });
  btn.addEventListener('touchcancel', off, { passive: false });
  btn.addEventListener('mousedown', on);
  btn.addEventListener('mouseup', off);
  btn.addEventListener('mouseleave', off);
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.forward = true;
  if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.backward = true;
  if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.left = true;
  if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.right = true;
  if (e.code === 'KeyE' || e.code === 'Space') interact();
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.forward = false;
  if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.backward = false;
  if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.left = false;
  if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.right = false;
});

// ============ אינטראקציה ומשימות ============
let nearDiscovery = null;
const interactBtn = document.getElementById('btn-interact');
interactBtn.addEventListener('touchstart', (e) => { e.preventDefault(); interact(); }, { passive: false });
function interact() {
  if (nearDiscovery && !nearDiscovery.discovered) {
    nearDiscovery.discovered = true;
    showToast('discovery-toast', 'toast-text', `${nearDiscovery.data.name} - ${nearDiscovery.data.desc}`);
    document.getElementById('disc-num').textContent = discoveries.filter(d => d.discovered).length;
    updateQuest();
  }
}
function showToast(id, textId, text) {
  const t = document.getElementById(id);
  document.getElementById(textId).textContent = text;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}
document.getElementById('disc-total').textContent = discoveries.length;

const quests = [
  { text: 'חקור את העולם וגלה מקומות חדשים', check: () => true },
  { text: 'גלה 3 מקומות מסתוריים', check: () => discoveries.filter(d => d.discovered).length >= 3 },
  { text: 'אסוף 5 גבישים זוהרים', check: () => collectibles.filter(c => c.collected).length >= 5 },
  { text: 'גלה את כל 8 המקומות!', check: () => discoveries.filter(d => d.discovered).length >= 8 }
];
function updateQuest() {
  let q = quests[0];
  for (let i = quests.length - 1; i >= 0; i--) if (quests[i].check()) { q = quests[i]; break; }
  document.getElementById('quest-text').textContent = q.text;
}
updateQuest();

// ============ מינימפה עם קונוס ראייה ============
const mmCanvas = document.getElementById('minimap-canvas');
const mmCtx = mmCanvas.getContext('2d');
const mmRover = document.getElementById('minimap-rover');
let currentRot = 0;

function drawMinimap() {
  const w = mmCanvas.width, h = mmCanvas.height;
  mmCtx.fillStyle = '#16211a'; mmCtx.fillRect(0, 0, w, h);
  mmCtx.fillStyle = '#2d5a28'; mmCtx.fillRect(0, 0, w, h);
  mmCtx.fillStyle = '#1a4a2a'; mmCtx.fillRect(0, 0, w * 0.3, h * 0.3);
  mmCtx.fillStyle = '#c9a86c'; mmCtx.fillRect(w * 0.7, 0, w * 0.3, h * 0.3);
  mmCtx.fillStyle = '#dde4ea'; mmCtx.fillRect(0, h * 0.7, w * 0.3, h * 0.3);
  mmCtx.fillStyle = '#5a6640'; mmCtx.fillRect(w * 0.7, h * 0.7, w * 0.3, h * 0.3);

  mmCtx.strokeStyle = 'rgba(255,255,255,0.06)'; mmCtx.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    mmCtx.beginPath(); mmCtx.moveTo(i * w / 5, 0); mmCtx.lineTo(i * w / 5, h); mmCtx.stroke();
    mmCtx.beginPath(); mmCtx.moveTo(0, i * h / 5); mmCtx.lineTo(w, i * h / 5); mmCtx.stroke();
  }

  discoveries.forEach(d => {
    const x = ((d.data.pos[0] + HALF) / WORLD_SIZE) * w;
    const y = ((d.data.pos[2] + HALF) / WORLD_SIZE) * h;
    mmCtx.fillStyle = d.discovered ? '#7ef0c0' : '#e8a34a';
    mmCtx.beginPath(); mmCtx.arc(x, y, d.discovered ? 3 : 3.5, 0, Math.PI * 2); mmCtx.fill();
  });
  collectibles.forEach(c => {
    if (!c.collected) {
      const x = ((c.mesh.position.x + HALF) / WORLD_SIZE) * w;
      const y = ((c.mesh.position.z + HALF) / WORLD_SIZE) * h;
      mmCtx.fillStyle = '#7ef0ff'; mmCtx.fillRect(x - 1, y - 1, 2, 2);
    }
  });

  const rx = ((rover.position.x + HALF) / WORLD_SIZE) * w;
  const ry = ((rover.position.z + HALF) / WORLD_SIZE) * h;
  const fx = -Math.sin(currentRot), fz = -Math.cos(currentRot);
  const ang = Math.atan2(fz, fx);
  mmCtx.fillStyle = 'rgba(200,240,255,0.16)';
  mmCtx.beginPath(); mmCtx.moveTo(rx, ry); mmCtx.arc(rx, ry, 36, ang - 0.5, ang + 0.5); mmCtx.closePath(); mmCtx.fill();

  mmRover.style.left = rx + 'px'; mmRover.style.top = ry + 'px';
}

// ============ מחזור יום-לילה עם שמיים דינמיים ============
let gameTime = 0.33;
const zenDay = new THREE.Color(0x8fc4e8), horDay = new THREE.Color(0xf6dcb4);
const zenDusk = new THREE.Color(0x4a3a6a), horDusk = new THREE.Color(0xff9a5a);
const zenNight = new THREE.Color(0x070c22), horNight = new THREE.Color(0x141a34);
const tmpA = new THREE.Color(), tmpB = new THREE.Color();

function updateDayNight(dt) {
  gameTime = (gameTime + dt * 0.006) % 1;
  const ang = gameTime * Math.PI * 2;
  const sh = Math.sin(ang);
  sunLight.position.set(Math.cos(ang) * 80, Math.max(sh * 80, -25), 35);
  skyUniforms.sunDir.value.copy(sunLight.position).normalize();

  const day = THREE.MathUtils.smoothstep(sh, 0.05, 0.3);
  const dusk = 1 - THREE.MathUtils.smoothstep(sh, -0.25, 0.05);

  tmpA.copy(zenNight).lerp(zenDusk, dusk);
  tmpB.copy(tmpA).lerp(zenDay, day);
  skyUniforms.zenith.value.copy(tmpB);
  tmpA.copy(horNight).lerp(horDusk, dusk);
  tmpB.copy(tmpA).lerp(horDay, day);
  skyUniforms.horizon.value.copy(tmpB);

  scene.fog.color.copy(skyUniforms.horizon.value);
  sunLight.intensity = 0.4 + day * 2.0 + dusk * 0.6;
  sunLight.color.setRGB(1.0, 0.75 + day * 0.15, 0.55 + day * 0.25);
  ambientLight.intensity = 0.18 + day * 0.25;
  hemiLight.intensity = 0.2 + day * 0.4;

  const hours = Math.floor(gameTime * 24);
  const mins = Math.floor((gameTime * 24 - hours) * 60);
  const icon = day > 0.5 ? '🌞' : (dusk > 0.5 ? '🌅' : '🌙');
  document.getElementById('time-display').textContent =
    `${icon} ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

// ============ לולאה ראשית ============
const clock = new THREE.Clock();
const moveSpeed = 7.5, rotSpeed = 2.4;
let wheelSpin = 0;
let useComposer = true, perfFrames = 0, perfAcc = 0;

function getBiomeName(x, z) {
  const nx = (x + HALF) / WORLD_SIZE, nz = (z + HALF) / WORLD_SIZE;
  const dist = Math.sqrt(x * x + z * z);
  if (dist < 22) return '🌿 שטח ירוק';
  if (nx < 0.3 && nz < 0.3) return '🌲 יער צפוף';
  if (nx > 0.7 && nz < 0.3) return '🏜️ מדבר';
  if (nx < 0.3 && nz > 0.7) return '❄️ אזור מושלג';
  if (nx > 0.7 && nz > 0.7) return '🌾 ביצה';
  return '🌱 ערבה';
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  uTime.value = t;

  let moving = false, speed = 0;
  if (keys.forward) { speed = moveSpeed; moving = true; }
  else if (keys.backward) { speed = -moveSpeed * 0.6; moving = true; }
  if (moving) {
    rover.position.x -= Math.sin(currentRot) * speed * dt;
    rover.position.z -= Math.cos(currentRot) * speed * dt;
    wheelSpin += (speed * dt) / 0.44;
  }
  if (keys.left) { currentRot += rotSpeed * dt; rover.rotation.y = currentRot; }
  if (keys.right) { currentRot -= rotSpeed * dt; rover.rotation.y = currentRot; }
  wheels.forEach(w => { w.rotation.x = wheelSpin; });

  const gh = getGroundHeight(rover.position.x, rover.position.z);
  rover.position.y += (gh - rover.position.y) * 0.2;
  if (moving) rover.position.y += Math.abs(Math.sin(t * 11)) * 0.035;
  rover.rotation.z = Math.sin(t * 7) * (moving ? 0.015 : 0);

  const limit = HALF - 6;
  rover.position.x = THREE.MathUtils.clamp(rover.position.x, -limit, limit);
  rover.position.z = THREE.MathUtils.clamp(rover.position.z, -limit, limit);

  document.getElementById('current-biome').textContent = getBiomeName(rover.position.x, rover.position.z);

  collectibles.forEach((c, i) => {
    if (!c.collected) {
      c.mesh.rotation.y += dt * 2.5;
      c.mesh.position.y = getGroundHeight(c.mesh.position.x, c.mesh.position.z) + 0.8 + Math.sin(t * 2.5 + i) * 0.15;
      const dx = rover.position.x - c.mesh.position.x;
      const dz = rover.position.z - c.mesh.position.z;
      if (dx * dx + dz * dz < 2.2) {
        c.collected = true;
        scene.remove(c.mesh); scene.remove(c.light);
        showToast('item-toast', 'item-text', 'גביש זוהר נאסף!');
        updateQuest();
      }
    }
  });

  nearDiscovery = null;
  let best = 36;
  discoveries.forEach(d => {
    const dx = rover.position.x - d.group.position.x;
    const dz = rover.position.z - d.group.position.z;
    const dd = dx * dx + dz * dz;
    if (dd < best && !d.discovered) { best = dd; nearDiscovery = d; }
  });
  const poi = document.getElementById('poi-marker');
  if (nearDiscovery) {
    interactBtn.classList.add('show');
    poi.style.display = 'flex';
    document.getElementById('poi-label').textContent = nearDiscovery.data.name;
  } else {
    interactBtn.classList.remove('show');
    poi.style.display = 'none';
  }

  sky.position.copy(camera.position);
  const camOffset = new THREE.Vector3(Math.sin(currentRot) * 7.5, 4.2, Math.cos(currentRot) * 7.5);
  camera.position.lerp(rover.position.clone().add(camOffset), 0.09);
  camera.lookAt(rover.position.x, rover.position.y + 1.2, rover.position.z);

  updateDayNight(dt);
  if (Math.floor(t * 60) % 12 === 0) drawMinimap();

  if (useComposer && composer) composer.render();
  else renderer.render(scene, camera);

  // התאמת ביצועים אוטומטית
  perfFrames++; perfAcc += dt;
  if (perfFrames === 150) {
    if (perfAcc / 150 > 0.034) {
      useComposer = false;
      renderer.setPixelRatio(1);
    }
    perfFrames = -9999;
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  checkOrientation();
});

// מניעת zoom/gestures
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

drawMinimap();
animate();
}