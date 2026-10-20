import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

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

  // ============ מסך מלא ============
  let fsOk = false, fsTries = 0, userExited = false;
  const fsBtn = document.getElementById('btn-fullscreen');
  function requestFS() {
    const el = document.documentElement;
    const rq = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
    if (!rq) return;
    try {
      const p = rq.call(el);
      if (p && p.then) p.then(() => { fsOk = true; }).catch(() => {});
    } catch (e) {}
  }
  function autoFS() {
    if (fsOk || userExited || fsTries > 8) return;
    fsTries++;
    requestFS();
  }
  function onFSChange() {
    const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (fsOk && !on) userExited = true;
    fsOk = on;
    fsBtn.style.display = on ? 'none' : '';
    setTimeout(onResize, 60);
  }
  document.addEventListener('fullscreenchange', onFSChange);
  document.addEventListener('webkitfullscreenchange', onFSChange);
  fsBtn.addEventListener('click', () => {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      const ex = document.exitFullscreen || document.webkitExitFullscreen;
      if (ex) ex.call(document);
    } else { userExited = false; requestFS(); }
  });
  document.addEventListener('touchstart', autoFS, { passive: true });

  function checkOrientation() {
    document.getElementById('orientation-warning').classList.toggle('show', window.innerHeight > window.innerWidth);
  }

  // ============ סצנה ============
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

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.32, 0.7, 0.85);
  composer.addPass(bloomPass);
  composer.addPass(new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; varying vec2 vUv;
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        float g = dot(c.rgb, vec3(0.299,0.587,0.114));
        c.rgb = mix(vec3(g), c.rgb, 1.18);
        c.rgb = (c.rgb - 0.5) * 1.10 + 0.5;
        c.r *= 1.06; c.g *= 1.01; c.b *= 0.94;
        vec2 q = vUv - 0.5;
        float vig = smoothstep(0.9, 0.3, length(q) * 1.35);
        c.rgb *= mix(0.72, 1.0, vig);
        gl_FragColor = c;
      }`
  }));

  // ============ שמיים ============
  const skyUniforms = {
    zenith: { value: new THREE.Color(0x8fc4e8) },
    horizon: { value: new THREE.Color(0xf6dcb4) },
    sunDir: { value: new THREE.Vector3(0.4, 0.5, 0.3).normalize() },
    sunColor: { value: new THREE.Color(0xffd9a0) }
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 24, 12),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
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

  // ============ תאורה ============
  const ambientLight = new THREE.AmbientLight(0x8899bb, 0.35);
  scene.add(ambientLight);
  const hemiLight = new THREE.HemisphereLight(0xbfd8e8, 0x6b7a4a, 0.65);
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
  const fillLight = new THREE.DirectionalLight(0x99bbee, 0.45);
  fillLight.position.set(-50, 30, -40);
  scene.add(fillLight);

  // ============ 🌟 Environment Map - השתקפויות למתכת והזכוכית! ============
  const envCanvas = document.createElement('canvas');
  envCanvas.width = 256;
  envCanvas.height = 128;
  const ectx = envCanvas.getContext('2d');
  const envGrad = ectx.createLinearGradient(0, 0, 0, 128);
  envGrad.addColorStop(0, '#7fb2d9');
  envGrad.addColorStop(0.45, '#f6dcb4');
  envGrad.addColorStop(0.7, '#d9a86c');
  envGrad.addColorStop(1, '#5a6640');
  ectx.fillStyle = envGrad;
  ectx.fillRect(0, 0, 256, 128);
  ectx.fillStyle = 'rgba(255,244,210,0.95)';
  ectx.beginPath(); ectx.arc(70, 56, 13, 0, Math.PI * 2); ectx.fill();
  ectx.fillStyle = 'rgba(255,244,210,0.35)';
  ectx.beginPath(); ectx.arc(70, 56, 26, 0, Math.PI * 2); ectx.fill();
  const envTex = new THREE.CanvasTexture(envCanvas);
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  envTex.colorSpace = THREE.SRGBColorSpace;
  scene.environment = envTex;

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
  function pathCenter(z) { return Math.sin(z * 0.05) * 6 + Math.sin(z * 0.013) * 4; }
  function pathMask(x, z) {
    const d = Math.abs(x - pathCenter(z));
    return 1 - THREE.MathUtils.smoothstep(d, 1.6, 3.4);
  }

  // ============ רשת גבהים ============
  const GSEG = 110;
  const GCELL = WORLD_SIZE / GSEG;
  const HGRID = new Float32Array((GSEG + 1) * (GSEG + 1));
  for (let iz = 0; iz <= GSEG; iz++) {
    for (let ix = 0; ix <= GSEG; ix++) {
      const x = -HALF + ix * GCELL;
      const z = -HALF + iz * GCELL;
      HGRID[iz * (GSEG + 1) + ix] = fbm(x, z) * 3.5 - 1.75 - pathMask(x, z) * 0.15;
    }
  }
  function getGroundHeight(x, z) {
    const gx = THREE.MathUtils.clamp((x + HALF) / GCELL, 0, GSEG - 0.0001);
    const gz = THREE.MathUtils.clamp((z + HALF) / GCELL, 0, GSEG - 0.0001);
    const ix = Math.floor(gx), iz = Math.floor(gz);
    const fx = gx - ix, fz = gz - iz;
    const i00 = iz * (GSEG + 1) + ix, i10 = i00 + 1;
    const i01 = i00 + (GSEG + 1), i11 = i01 + 1;
    const a = HGRID[i00] * (1 - fx) + HGRID[i10] * fx;
    const b = HGRID[i01] * (1 - fx) + HGRID[i11] * fx;
    return a * (1 - fz) + b * fz;
  }

  // ============ קרקע ============
  const groundGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, GSEG, GSEG);
  const pos = groundGeo.attributes.position;
  const GP1 = GSEG + 1;
  const colors = new Float32Array(pos.count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const ix = i % GP1, iy = Math.floor(i / GP1);
    const x = -HALF + ix * GCELL;
    const z = -HALF + iy * GCELL;
    pos.setZ(i, HGRID[i]);

    const nx = (x + HALF) / WORLD_SIZE;
    const nz = (z + HALF) / WORLD_SIZE;
    const dist = Math.sqrt(x * x + z * z);
    const bn = fbm(x * 0.5, z * 0.5);
    const micro = noise2D(x * 3.1, z * 2.7) * 0.06;

    if (dist < 22) col.setRGB(0.30, 0.55, 0.24);
    else if (nx < 0.3 && nz < 0.3) col.setRGB(0.16, 0.36, 0.19);
    else if (nx > 0.7 && nz < 0.3) col.setRGB(0.82, 0.71, 0.45);
    else if (nx < 0.3 && nz > 0.7) col.setRGB(0.86, 0.90, 0.95);
    else if (nx > 0.7 && nz > 0.7) col.setRGB(0.36, 0.41, 0.26);
    else col.setRGB(0.33 + bn * 0.08, 0.54 + bn * 0.09, 0.26);

    col.r += micro; col.g += micro; col.b += micro;

    const pm = pathMask(x, z);
    if (pm > 0) {
      const dirt = 0.85 + noise2D(x * 5.3, z * 4.7) * 0.25;
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

  // ============ דשא תלת מימדי ============
  function makeBladeGeo(h, w, bend) {
    const segs = 4;
    const positions = [], normals = [], uvs = [], vcols = [], indices = [];
    const baseCol = new THREE.Color(0x24521c);
    const tipCol = new THREE.Color(0x8cc63f);
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const y = h * t;
      const z = bend * t * t;
      const halfW = w * (1 - t * 0.85) * 0.5;
      positions.push(-halfW, y, z, halfW, y, z);
      normals.push(0, 0.25, 1, 0, 0.25, 1);
      uvs.push(0, t, 1, t);
      const c = baseCol.clone().lerp(tipCol, t);
      vcols.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    for (let i = 0; i < segs; i++) {
      const a = i * 2, b = a + 1, c2 = a + 2, d = a + 3;
      indices.push(a, c2, b, b, c2, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(vcols, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }

  const bladeParts = [];
  for (let k = 0; k < 5; k++) {
    const b = makeBladeGeo(0.42 + Math.random() * 0.38, 0.09 + Math.random() * 0.06, 0.10 + Math.random() * 0.14);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((Math.random() - 0.5) * 0.6, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.6));
    m.compose(new THREE.Vector3((Math.random() - 0.5) * 0.2, 0, (Math.random() - 0.5) * 0.2), q, new THREE.Vector3(1, 1, 1));
    b.applyMatrix4(m);
    bladeParts.push(b);
  }
  const tuftGeo = mergeGeometries(bladeParts, false);

  const uTime = { value: 0 };
  const grassMat = new THREE.MeshStandardMaterial({
    vertexColors: true, side: THREE.DoubleSide, roughness: 0.9, metalness: 0.0
  });
  grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vec4 wpos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
       float ph = wpos.x * 0.35 + wpos.z * 0.27;
       float gust = sin(uTime * 1.6 + ph) * 0.6 + sin(uTime * 3.3 + ph * 1.7) * 0.4;
       float hf = position.y * position.y * 2.4;
       transformed.x += gust * 0.17 * hf;
       transformed.z += cos(uTime * 1.2 + ph) * 0.11 * hf;`
    );
  };

  const GRASS = 7000;
  const grassMesh = new THREE.InstancedMesh(tuftGeo, grassMat, GRASS);
  grassMesh.receiveShadow = true;
  const dummy = new THREE.Object3D();
  const gCol = new THREE.Color();
  let gi = 0;
  for (let i = 0; i < GRASS * 1.5 && gi < GRASS; i++) {
    const x = (Math.random() - 0.5) * WORLD_SIZE * 0.94;
    const z = (Math.random() - 0.5) * WORLD_SIZE * 0.94;
    if (pathMask(x, z) > 0.5) continue;
    dummy.position.set(x, getGroundHeight(x, z) - 0.04, z);
    dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    dummy.scale.setScalar(0.7 + Math.random() * 0.9);
    dummy.updateMatrix();
    grassMesh.setMatrixAt(gi, dummy.matrix);
    const t = Math.random();
    gCol.setRGB(0.85 + t * 0.3, 0.9 + t * 0.25, 0.8 + t * 0.35);
    grassMesh.setColorAt(gi, gCol);
    gi++;
  }
  grassMesh.count = gi;
  grassMesh.instanceMatrix.needsUpdate = true;
  if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true;
  scene.add(grassMesh);

  // ============ פרחים ============
  const flowerPlans = [];
  for (let i = 0; i < 160; i++) {
    const x = (Math.random() - 0.5) * WORLD_SIZE * 0.85;
    const z = (Math.random() - 0.5) * WORLD_SIZE * 0.85;
    if (pathMask(x, z) > 0.4) continue;
    flowerPlans.push({ x, z, c: [0xff6699, 0xffcc33, 0xff8844, 0xaa66ff, 0xffffff][i % 5] });
  }
  const flowerIM = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.09, 0),
    new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true }),
    Math.max(1, flowerPlans.length)
  );
  flowerPlans.forEach((p, i) => {
    dummy.position.set(p.x, getGroundHeight(p.x, p.z) + 0.24, p.z);
    dummy.rotation.set(0, Math.random() * 3, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    flowerIM.setMatrixAt(i, dummy.matrix);
    flowerIM.setColorAt(i, gCol.setHex(p.c));
  });
  flowerIM.instanceMatrix.needsUpdate = true;
  if (flowerIM.instanceColor) flowerIM.instanceColor.needsUpdate = true;
  scene.add(flowerIM);

  // ============ התנגשויות ============
  const colliders = [];

  // ============ סלעים ============
  const rockPlans = [];
  for (let i = 0; i < 70; i++) {
    const x = (Math.random() - 0.5) * WORLD_SIZE * 0.9;
    const z = (Math.random() - 0.5) * WORLD_SIZE * 0.9;
    if (Math.sqrt(x * x + z * z) < 6) continue;
    rockPlans.push({ x, z, s: 0.4 + Math.random() * 1.4 });
  }
  for (let i = 0; i < 50; i++) {
    const z = (Math.random() - 0.5) * WORLD_SIZE * 0.9;
    const x = pathCenter(z) + (Math.random() > 0.5 ? 1 : -1) * (2.6 + Math.random() * 1.6);
    rockPlans.push({ x, z, s: 0.15 + Math.random() * 0.3 });
  }
  const rockIM = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.8, 0),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }),
    rockPlans.length
  );
  rockIM.castShadow = true;
  rockIM.receiveShadow = true;
  rockPlans.forEach((p, i) => {
    dummy.position.set(p.x, getGroundHeight(p.x, p.z) + p.s * 0.22, p.z);
    dummy.rotation.set(Math.random() * 0.6, Math.random() * Math.PI * 2, Math.random() * 0.6);
    dummy.scale.set(p.s, p.s * (0.55 + Math.random() * 0.3), p.s * (0.8 + Math.random() * 0.4));
    dummy.updateMatrix();
    rockIM.setMatrixAt(i, dummy.matrix);
    const shade = 0.55 + Math.random() * 0.3;
    rockIM.setColorAt(i, gCol.setRGB(shade, shade * 0.97, shade * 0.92));
    colliders.push({ x: p.x, z: p.z, r: 0.7 * p.s });
  });
  rockIM.instanceMatrix.needsUpdate = true;
  if (rockIM.instanceColor) rockIM.instanceColor.needsUpdate = true;
  scene.add(rockIM);

  // ============ עצים ============
  const treePlans = [];
  for (let i = 0; i < 110; i++) {
    const x = (Math.random() - 0.5) * WORLD_SIZE * 0.9;
    const z = (Math.random() - 0.5) * WORLD_SIZE * 0.9;
    if (Math.sqrt(x * x + z * z) < 9 || pathMask(x, z) > 0.5) continue;
    const nx = (x + HALF) / WORLD_SIZE, nz = (z + HALF) / WORLD_SIZE;
    let type = 'normal';
    if (nx < 0.3 && nz < 0.3) type = 'pine';
    else if (nx > 0.7 && nz < 0.3) type = 'dead';
    const plan = { x, z, type, s: 0.85 + Math.random() * 0.6, trunkH: 1.6 + Math.random() * 1.2, parts: [] };
    plan.color = new THREE.Color().setHSL(0.29 + Math.random() * 0.06, 0.5 + Math.random() * 0.2, 0.28 + Math.random() * 0.12).getHex();
    if (type === 'pine') {
      for (let k = 0; k < 3; k++) plan.parts.push({ k, size: 1.7 - k * 0.4 });
    } else if (type === 'normal') {
      const blobs = 2 + Math.floor(Math.random() * 2);
      for (let k = 0; k < blobs; k++) {
        plan.parts.push({ ox: (Math.random() - 0.5) * 0.9, oy: Math.random() * 0.7, oz: (Math.random() - 0.5) * 0.9, r: 1.1 + Math.random() * 0.6 });
      }
    }
    treePlans.push(plan);
    colliders.push({ x, z, r: 0.45 * plan.s });
  }
  let coneCount = 0, blobCount = 0, branchCount = 0;
  treePlans.forEach(p => {
    if (p.type === 'pine') coneCount += 3;
    else if (p.type === 'normal') blobCount += p.parts.length;
    else branchCount += 3;
  });

  const trunkIM = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.16, 0.3, 1, 6),
    new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.95, flatShading: true }),
    Math.max(1, treePlans.length)
  );
  trunkIM.castShadow = true;
  const coneIM = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1, 1, 7),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }),
    Math.max(1, coneCount)
  );
  coneIM.castShadow = true;
  const blobIM = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }),
    Math.max(1, blobCount)
  );
  blobIM.castShadow = true;
  const branchIM = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.05, 0.1, 1.2, 5),
    new THREE.MeshStandardMaterial({ color: 0x554433, roughness: 0.9, flatShading: true }),
    Math.max(1, branchCount)
  );
  let ci = 0, bi = 0, ri = 0;
  treePlans.forEach((p, ti) => {
    const h = getGroundHeight(p.x, p.z) - 0.1;
    dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    dummy.position.set(p.x, h + p.trunkH * p.s / 2, p.z);
    dummy.scale.set(p.s, p.trunkH * p.s, p.s);
    dummy.updateMatrix();
    trunkIM.setMatrixAt(ti, dummy.matrix);

    if (p.type === 'pine') {
      p.parts.forEach(part => {
        dummy.position.set(p.x, h + (p.trunkH + 0.6 + part.k * 1.05) * p.s, p.z);
        dummy.scale.set(part.size * p.s, 1.9 * p.s, part.size * p.s);
        dummy.updateMatrix();
        coneIM.setMatrixAt(ci, dummy.matrix);
        coneIM.setColorAt(ci, gCol.setHex(p.color));
        ci++;
      });
    } else if (p.type === 'normal') {
      p.parts.forEach(part => {
        dummy.position.set(p.x + part.ox * p.s, h + (p.trunkH + 0.9 + part.oy) * p.s, p.z + part.oz * p.s);
        dummy.scale.setScalar(part.r * p.s);
        dummy.updateMatrix();
        blobIM.setMatrixAt(bi, dummy.matrix);
        blobIM.setColorAt(bi, gCol.setHex(p.color));
        bi++;
      });
    } else {
      for (let k = 0; k < 3; k++) {
        dummy.position.set(p.x, h + (p.trunkH + 0.3) * p.s, p.z);
        dummy.rotation.set(0, 0, (k - 1) * 0.7);
        dummy.scale.setScalar(p.s);
        dummy.updateMatrix();
        branchIM.setMatrixAt(ri, dummy.matrix);
        ri++;
      }
      dummy.rotation.set(0, 0, 0);
    }
  });
  trunkIM.count = Math.max(1, treePlans.length);
  coneIM.count = Math.max(1, ci);
  blobIM.count = Math.max(1, bi);
  branchIM.count = Math.max(1, ri);
  [trunkIM, coneIM, blobIM, branchIM].forEach(im => {
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    scene.add(im);
  });

  // ============ גבעות רקע ============
  const hillIM = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1, 1, 6),
    new THREE.MeshStandardMaterial({ color: 0x7a8a5a, roughness: 1, flatShading: true }),
    10
  );
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = 18 + Math.random() * 14, hh = 10 + Math.random() * 8;
    dummy.position.set(Math.cos(a) * 150, 0, Math.sin(a) * 150);
    dummy.rotation.set(0, Math.random() * 3, 0);
    dummy.scale.set(r, hh, r);
    dummy.updateMatrix();
    hillIM.setMatrixAt(i, dummy.matrix);
  }
  hillIM.instanceMatrix.needsUpdate = true;
  scene.add(hillIM);

  // ============ 🚜 התותח - רובר תלת מימדי ונאה! ============
  const rover = new THREE.Group();
  rover.rotation.order = 'YXZ';

  // חומרים חדשים: מתכת אמיתית עם השתקפויות + צבעים בהירים
  const MATS = {
    paint: new THREE.MeshStandardMaterial({ color: 0xcfd8e2, metalness: 0.25, roughness: 0.35, flatShading: true, envMapIntensity: 0.9 }),
    paintDark: new THREE.MeshStandardMaterial({ color: 0x5a6b7c, metalness: 0.35, roughness: 0.5, flatShading: true, envMapIntensity: 0.7 }),
    accent: new THREE.MeshStandardMaterial({ color: 0xe8763a, metalness: 0.15, roughness: 0.5, flatShading: true }),
    metal: new THREE.MeshStandardMaterial({ color: 0xb0b8c0, metalness: 0.7, roughness: 0.28, flatShading: true, envMapIntensity: 1.2 }),
    metalDark: new THREE.MeshStandardMaterial({ color: 0x33383e, metalness: 0.6, roughness: 0.45, flatShading: true, envMapIntensity: 0.8 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x23201d, roughness: 0.92, flatShading: true }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fd8ea, metalness: 0.1, roughness: 0.12, transparent: true, opacity: 0.8, flatShading: true, emissive: 0x1a4a5a, emissiveIntensity: 0.35, envMapIntensity: 1.5 }),
    black: new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.6, flatShading: true }),
    glow: new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffeeaa, emissiveIntensity: 1.8, flatShading: true }),
    tail: new THREE.MeshStandardMaterial({ color: 0xff3322, emissive: 0xff2211, emissiveIntensity: 0.9, flatShading: true }),
    solar: new THREE.MeshStandardMaterial({ color: 0x16264a, metalness: 0.4, roughness: 0.3, flatShading: true, emissive: 0x0a1a3a, emissiveIntensity: 0.4, envMapIntensity: 1.0 }),
    cable: new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.8 })
  };

  const buckets = {};
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _v = new THREE.Vector3();
  const _s = new THREE.Vector3();
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

  const B = new THREE.BoxGeometry(1, 1, 1);
  const C = new THREE.CylinderGeometry(1, 1, 1, 10);
  const T = new THREE.TorusGeometry(1, 0.25, 6, 12);

  // גוף ראשי בהיר + פרטים
  part(B, place(0, 0.8, 0), 'paint'); scaleLast('paint', 2.0, 0.5, 1.3);
  part(B, place(0, 1.0, -0.15, 0.12, 0, 0), 'paint'); scaleLast('paint', 1.7, 0.3, 1.2);
  part(B, place(0, 0.75, -0.72, -0.3, 0, 0), 'paintDark'); scaleLast('paintDark', 1.6, 0.35, 0.12);
  part(B, place(0, 1.05, 0.35), 'paintDark'); scaleLast('paintDark', 1.6, 0.25, 1.2);
  part(B, place(0, 0.62, 0.68), 'paintDark'); scaleLast('paintDark', 2.1, 0.18, 0.1);
  part(B, place(0, 0.62, -0.68), 'paintDark'); scaleLast('paintDark', 2.1, 0.18, 0.1);
  part(B, place(-0.5, 1.32, 0.35, 0, 0.2, 0), 'metalDark'); scaleLast('metalDark', 0.6, 0.45, 0.5);
  part(B, place(0, 0.55, -0.8), 'metalDark'); scaleLast('metalDark', 1.7, 0.12, 0.1);

  // פסי הדגשה כתומים
  part(B, place(0, 1.17, -0.28, 0.12, 0, 0), 'accent'); scaleLast('accent', 0.45, 0.03, 0.9);
  part(B, place(0, 0.5, 0.82), 'accent'); scaleLast('accent', 1.7, 0.1, 0.08);

  // כיפה + עיניים + טבעת
  const domeGeo = new THREE.SphereGeometry(0.62, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  part(domeGeo, place(0, 1.15, 0), 'glass'); scaleLast('glass', 1, 0.9, 1);
  const ringGeo = new THREE.TorusGeometry(0.62, 0.05, 6, 14);
  part(ringGeo, place(0, 1.15, 0, Math.PI / 2, 0, 0), 'metalDark');
  part(B, place(-0.22, 1.28, -0.52, -0.4, 0, 0), 'black'); scaleLast('black', 0.26, 0.05, 0.02);
  part(B, place(0.22, 1.28, -0.52, -0.4, 0, 0), 'black'); scaleLast('black', 0.26, 0.05, 0.02);

  // פאנל סולארי על הגג האחורי
  part(B, place(0, 1.2, 0.35), 'solar'); scaleLast('solar', 1.3, 0.04, 0.9);

  // פודים צדדיים + מצלמות
  [-1, 1].forEach(side => {
    part(B, place(0.45, 1.05, side * 0.7), 'metal'); scaleLast('metal', 0.35, 0.09, 0.5);
    part(C, place(0.45, 1.15, side * 0.9), 'metalDark'); scaleLast('metalDark', 0.15, 0.15, 0.2);
    part(C, place(0.45, 1.35, side * 0.9), 'paint'); scaleLast('paint', 0.16, 0.32, 0.16);
    part(C, place(0.45, 1.44, side * 0.9), 'black'); scaleLast('black', 0.17, 0.12, 0.17);
    part(B, place(0.75, 1.2, side * 0.9), 'paintDark'); scaleLast('paintDark', 0.24, 0.18, 0.16);
    part(C, place(0.69, 1.2, side * 0.9 - 0.09, Math.PI / 2, 0, 0), 'black'); scaleLast('black', 0.05, 0.04, 0.05);
    part(C, place(0.81, 1.2, side * 0.9 - 0.09, Math.PI / 2, 0, 0), 'black'); scaleLast('black', 0.05, 0.04, 0.05);
  });

  // מתלים + כנפי מגן כתומות מעל הגלגלים
  const wheelSlots = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  wheelSlots.forEach(([sx, sz]) => {
    const wx = sx * 1.12, wz = sz * 0.85;
    part(B, place(sx * 0.75, 0.95, wz * 0.8, 0, 0, -sx * 0.3), 'metal'); scaleLast('metal', 0.5, 0.08, 0.08);
    part(B, place(sx * 0.8, 0.5, wz * 0.85, 0, 0, -sx * 0.15), 'metal'); scaleLast('metal', 0.55, 0.08, 0.08);
    part(B, place(sx * 1.0, 0.62, wz * 0.85), 'metalDark'); scaleLast('metalDark', 0.08, 0.5, 0.08);
    part(C, place(sx * 0.7, 0.85, wz * 0.6, 0, 0, -sx * 0.5), 'metalDark'); scaleLast('metalDark', 0.035, 0.5, 0.035);
    for (let k = 0; k < 4; k++) {
      part(T, place(sx * (0.72 - k * 0.06), 0.68 + k * 0.1, wz * 0.6, Math.PI / 2, 0, -sx * 0.5), 'metal');
      scaleLast('metal', 0.075, 0.075, 0.075);
    }
    // כנף מגן (fender) כתומה
    part(B, place(wx, 0.88, wz), 'accent'); scaleLast('accent', 0.62, 0.09, 1.05);
  });

  // פנסים קדמיים + פנסים אחוריים אדומים
  part(C, place(-0.55, 0.78, -0.78, Math.PI / 2, 0, 0), 'glow'); scaleLast('glow', 0.09, 0.1, 0.11);
  part(C, place(0.55, 0.78, -0.78, Math.PI / 2, 0, 0), 'glow'); scaleLast('glow', 0.09, 0.1, 0.11);
  part(B, place(-0.62, 0.88, 0.71), 'tail'); scaleLast('tail', 0.24, 0.1, 0.05);
  part(B, place(0.62, 0.88, 0.71), 'tail'); scaleLast('tail', 0.24, 0.1, 0.05);

  // אנטנה + אגזוזים
  part(C, place(-0.6, 1.55, 0.4, 0, 0, 0.35), 'metal'); scaleLast('metal', 0.025, 0.9, 0.035);
  part(B, place(-0.78, 2.0, 0.47, 0, 0.3, 0.5), 'paintDark'); scaleLast('paintDark', 0.3, 0.45, 0.03);
  part(C, place(-0.25, 1.25, 0.62), 'metalDark'); scaleLast('metalDark', 0.06, 0.35, 0.06);
  part(C, place(0.25, 1.25, 0.62), 'metalDark'); scaleLast('metalDark', 0.06, 0.35, 0.06);
  part(C, place(-0.25, 1.44, 0.62), 'metal'); scaleLast('metal', 0.07, 0.05, 0.07);
  part(C, place(0.25, 1.44, 0.62), 'metal'); scaleLast('metal', 0.07, 0.05, 0.07);

  // כבלים
  const cable1 = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.5, 1.05, -0.5), new THREE.Vector3(-0.2, 0.92, -0.66),
    new THREE.Vector3(0.2, 0.95, -0.64), new THREE.Vector3(0.5, 1.05, -0.5)
  ]);
  part(new THREE.TubeGeometry(cable1, 14, 0.022, 5), new THREE.Matrix4(), 'cable');
  const cable2 = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.6, 0.98, 0.55), new THREE.Vector3(-0.2, 0.85, 0.7),
    new THREE.Vector3(0.3, 0.88, 0.68), new THREE.Vector3(0.6, 0.98, 0.5)
  ]);
  part(new THREE.TubeGeometry(cable2, 14, 0.02, 5), new THREE.Matrix4(), 'cable');

  Object.keys(buckets).forEach(key => {
    const merged = mergeGeometries(buckets[key], false);
    const mesh = new THREE.Mesh(merged, MATS[key]);
    mesh.castShadow = true;
    rover.add(mesh);
  });

  // גלגלים
  function buildWheelGeo() {
    const rubberParts = [];
    const rim = new THREE.CylinderGeometry(0.44, 0.44, 0.34, 10);
    rim.rotateZ(Math.PI / 2);
    rubberParts.push(rim);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const tread = new THREE.BoxGeometry(0.36, 0.12, 0.14);
      const m = new THREE.Matrix4().makeRotationX(a);
      m.setPosition(0, Math.cos(a) * 0.46, Math.sin(a) * 0.46);
      tread.applyMatrix4(m);
      rubberParts.push(tread);
    }
    const rubberMerged = mergeGeometries(rubberParts, false);
    const hub = new THREE.CylinderGeometry(0.17, 0.17, 0.37, 8);
    hub.rotateZ(Math.PI / 2);
    return mergeGeometries([rubberMerged, hub], true);
  }
  const wheelGeo = buildWheelGeo();
  const wheels = [];
  wheelSlots.forEach(([sx, sz]) => {
    const w = new THREE.Mesh(wheelGeo, [MATS.rubber, MATS.metal]);
    w.position.set(sx * 1.12, 0.46, sz * 0.85);
    w.castShadow = true;
    rover.add(w);
    wheels.push({ mesh: w, baseY: 0.46, phase: Math.random() * 6.28 });
  });

  const headLight = new THREE.SpotLight(0xffeecc, 2.0, 18, Math.PI / 6, 0.35);
  headLight.position.set(0, 0.9, -0.8);
  headLight.target.position.set(0, 0, -12);
  rover.add(headLight); rover.add(headLight.target);

  scene.add(rover);

  // ============ שליטה ============
  const keys = { forward: false, backward: false, left: false, right: false };
  document.querySelectorAll('.ctrl-round').forEach(btn => {
    const key = btn.dataset.key;
    const on = (e) => { if (e) e.preventDefault(); keys[key] = true; btn.classList.add('active'); autoFS(); };
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
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.forward = false;
    if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.backward = false;
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.left = false;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.right = false;
  });

  // ============ מינימפה ============
  const mmCanvas = document.getElementById('minimap-canvas');
  const mmCtx = mmCanvas.getContext('2d');
  const mmRover = document.getElementById('minimap-rover');
  let currentRot = 0;
  let mmTimer = 0;

  function drawMinimap() {
    const w = mmCanvas.width, h = mmCanvas.height;
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

    const rx = ((rover.position.x + HALF) / WORLD_SIZE) * w;
    const ry = ((rover.position.z + HALF) / WORLD_SIZE) * h;
    const fx = -Math.sin(currentRot), fz = -Math.cos(currentRot);
    const ang = Math.atan2(fz, fx);
    mmCtx.fillStyle = 'rgba(200,240,255,0.16)';
    mmCtx.beginPath(); mmCtx.moveTo(rx, ry); mmCtx.arc(rx, ry, 36, ang - 0.5, ang + 0.5); mmCtx.closePath(); mmCtx.fill();

    mmRover.style.left = rx + 'px'; mmRover.style.top = ry + 'px';
  }

  // ============ יום-לילה ============
  let gameTime = 0.32;
  const zenDay = new THREE.Color(0x8fc4e8), horDay = new THREE.Color(0xf6dcb4);
  const zenDusk = new THREE.Color(0x4a3a6a), horDusk = new THREE.Color(0xff9a5a);
  const zenNight = new THREE.Color(0x070c22), horNight = new THREE.Color(0x141a34);
  const tmpA = new THREE.Color(), tmpB = new THREE.Color();
  let lastTimeText = '', lastBiomeText = '';

  function updateDayNight(dt) {
    gameTime = (gameTime + dt * 0.0012) % 1;
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
    hemiLight.intensity = 0.25 + day * 0.4;

    const hours = Math.floor(gameTime * 24);
    const mins = Math.floor((gameTime * 24 - hours) * 60);
    const icon = day > 0.5 ? '🌞' : (dusk > 0.5 ? '🌅' : '🌙');
    const txt = icon + ' ' + String(hours).padStart(2, '0') + ':' + String(mins).padStart(2, '0');
    if (txt !== lastTimeText) {
      lastTimeText = txt;
      document.getElementById('time-display').textContent = txt;
    }
  }

  // ============ ביצועים ============
  let downgraded = false;
  function downgradeGraphics() {
    if (downgraded) return;
    downgraded = true;
    bloomPass.enabled = false;
    renderer.setPixelRatio(1);
    composer.setPixelRatio(1);
    composer.setSize(window.innerWidth, window.innerHeight);
    if (sunLight.shadow.map) { sunLight.shadow.map.dispose(); sunLight.shadow.map = null; }
    sunLight.shadow.mapSize.set(1024, 1024);
  }
  if ((navigator.hardwareConcurrency || 4) <= 4) downgradeGraphics();

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    checkOrientation();
  }
  window.addEventListener('resize', onResize);

  // ============ לולאה ============
  const clock = new THREE.Clock();
  const maxSpeed = 9.0;
  const rotSpeed = 2.6;
  let velocity = 0, prevVelocity = 0;
  let wheelSpin = 0, pitch = 0, roll = 0, pitchAccel = 0, rollSteer = 0;
  let perfFrames = 0, perfAcc = 0;

  const _camPos = new THREE.Vector3();
  const _look = new THREE.Vector3();

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

    const target = keys.forward ? maxSpeed : (keys.backward ? -maxSpeed * 0.5 : 0);
    velocity = THREE.MathUtils.damp(velocity, target, 2.2, dt);
    if (target === 0 && Math.abs(velocity) < 0.02) velocity = 0;

    const fwdX = -Math.sin(currentRot), fwdZ = -Math.cos(currentRot);
    rover.position.x += fwdX * velocity * dt;
    rover.position.z += fwdZ * velocity * dt;

    const steer = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
    const spd = Math.abs(velocity);
    const steerFactor = 0.25 + 0.75 * THREE.MathUtils.clamp(spd / 5, 0, 1);
    const dirSign = velocity >= 0 ? 1 : -1;
    currentRot += steer * rotSpeed * steerFactor * dirSign * dt;
    rover.rotation.y = currentRot;
    wheelSpin += (velocity * dt) / 0.46;

    const speedNorm = spd / maxSpeed;
    wheels.forEach(w => {
      w.mesh.rotation.x = wheelSpin;
      w.mesh.position.y = w.baseY + Math.sin(t * 13 + w.phase) * 0.02 * speedNorm;
    });

    // פנסים אחוריים: נדלקים חזק ברוורס או בפגיעה
    MATS.tail.emissiveIntensity = velocity < -0.2 ? 2.4 : 0.9;

    let hit = false;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      const dx = rover.position.x - c.x;
      const dz = rover.position.z - c.z;
      const rr = c.r + 1.0;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = (rr - d) / d;
        rover.position.x += dx * push;
        rover.position.z += dz * push;
        hit = true;
      }
    }
    if (hit) MATS.tail.emissiveIntensity = 2.8;
    if (hit && spd > 2) velocity *= 0.7;

    const rx = rover.position.x, rz = rover.position.z;
    const hC = getGroundHeight(rx, rz);
    rover.position.y += (hC + 0.06 - rover.position.y) * 0.25;
    if (spd > 0.5) rover.position.y += Math.abs(Math.sin(t * 11)) * 0.02 * speedNorm;

    const sinR = Math.sin(currentRot), cosR = Math.cos(currentRot);
    const hF = getGroundHeight(rx - sinR * 1.3, rz - cosR * 1.3);
    const hB = getGroundHeight(rx + sinR * 1.3, rz + cosR * 1.3);
    const hR = getGroundHeight(rx + cosR * 1.1, rz - sinR * 1.1);
    const hL = getGroundHeight(rx - cosR * 1.1, rz + sinR * 1.1);
    const accel = (velocity - prevVelocity) / Math.max(dt, 0.0001);
    prevVelocity = velocity;
    pitchAccel = THREE.MathUtils.damp(pitchAccel, THREE.MathUtils.clamp(-accel * 0.02, -0.10, 0.10), 5, dt);
    rollSteer = THREE.MathUtils.damp(rollSteer, -steer * THREE.MathUtils.clamp(spd / maxSpeed, 0, 1) * 0.07, 5, dt);
    pitch = THREE.MathUtils.damp(pitch, Math.atan2(hF - hB, 2.6) * 0.8 + pitchAccel, 6, dt);
    roll = THREE.MathUtils.damp(roll, Math.atan2(hR - hL, 2.2) * 0.6 + rollSteer, 6, dt);
    rover.rotation.x = pitch;
    rover.rotation.z = roll;

    const limit = HALF - 6;
    rover.position.x = THREE.MathUtils.clamp(rover.position.x, -limit, limit);
    rover.position.z = THREE.MathUtils.clamp(rover.position.z, -limit, limit);

    const biomeTxt = getBiomeName(rx, rz);
    if (biomeTxt !== lastBiomeText) {
      lastBiomeText = biomeTxt;
      document.getElementById('current-biome').textContent = biomeTxt;
    }

    sky.position.copy(camera.position);
    const camDist = 6.8 + spd * 0.14;
    const camH = 3.4 + spd * 0.06;
    _camPos.set(rx - fwdX * camDist, rover.position.y + camH, rz - fwdZ * camDist);
    camera.position.lerp(_camPos, 1 - Math.exp(-4.5 * dt));
    const lookAhead = 2.2 + spd * 0.25;
    _look.set(rx + fwdX * lookAhead, rover.position.y + 1.0, rz + fwdZ * lookAhead);
    camera.lookAt(_look);
    const targetFov = 58 + spd * 1.1;
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 3, dt);
      camera.updateProjectionMatrix();
    }

    updateDayNight(dt);
    mmTimer += dt;
    if (mmTimer > 0.25) { mmTimer = 0; drawMinimap(); }

    composer.render();

    perfFrames++; perfAcc += dt;
    if (perfFrames === 180) {
      if (perfAcc / 180 > 0.040) downgradeGraphics();
      perfFrames = -9999;
    }
  }

  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

  checkOrientation();
  drawMinimap();
  animate();
}