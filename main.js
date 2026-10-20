import * as THREE from 'three';
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
  function requestFS() {
    const el = document.documentElement;
    const rq = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
    if (!rq) return;
    try {
      const p = rq.call(el);
      if (p && p.then) p.then(() => { fsOk = true; }).catch(() => {});
    } catch (e) {}
  }
  function exitFS() {
    const ex = document.exitFullscreen || document.webkitExitFullscreen;
    if (ex) ex.call(document);
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
    setTimeout(onResize, 60);
  }
  document.addEventListener('fullscreenchange', onFSChange);
  document.addEventListener('webkitfullscreenchange', onFSChange);
  document.getElementById('btn-fullscreen').addEventListener('click', () => {
    if (document.fullscreenElement || document.webkitFullscreenElement) exitFS();
    else { userExited = false; requestFS(); }
  });
  document.addEventListener('touchstart', autoFS, { passive: true });
  document.addEventListener('mousedown', autoFS);

  // ============ סיבוב מסך ============
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

  // ============ פוסט-פרוססינג ============
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.38, 0.7, 0.82);
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
  function pathCenter(z) { return Math.sin(z * 0.05) * 6 + Math.sin(z * 0.013) * 4; }
  function pathMask(x, z) {
    const d = Math.abs(x - pathCenter(z));
    return 1 - THREE.MathUtils.smoothstep(d, 1.6, 3.4);
  }

  // ============ רשת גבהים אחידה ============
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

  // ============ דשא עם רוח (Instanced) ============
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
    dummy.position.set(x, getGroundHeight(x, z) - 0.03, z);
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

  // ============ התנגשויות ============
  const colliders = [];
  const slowZones = [];

  // ============ סלעים (Instanced - draw call אחד!) ============
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

  // ============ עצים (Instanced - 4 draw calls לכל היער!) ============
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
    const green = new THREE.Color().setHSL(0.29 + Math.random() * 0.06, 0.5 + Math.random() * 0.2, 0.28 + Math.random() * 0.12);
    plan.color = green.getHex();
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
    treePlans.length
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
  [trunkIM, coneIM, blobIM, branchIM].forEach(im => {
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.count = Math.max(1, im.count === coneIM.count ? ci : im.count === blobIM.count ? bi : im.count === branchIM.count ? ri : im.count);
    scene.add(im);
  });
  trunkIM.count = treePlans.length;
  coneIM.count = Math.max(1, ci);
  blobIM.count = Math.max(1, bi);
  branchIM.count = Math.max(1, ri);

  // ============ פרחים (Instanced) ============
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
    dummy.position.set(p.x, getGroundHeight(p.x, p.z) + 0.28, p.z);
    dummy.rotation.set(0, Math.random() * 3, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    flowerIM.setMatrixAt(i, dummy.matrix);
    flowerIM.setColorAt(i, gCol.setHex(p.c));
  });
  flowerIM.count = Math.max(1, flowerPlans.length);
  flowerIM.instanceMatrix.needsUpdate = true;
  if (flowerIM.instanceColor) flowerIM.instanceColor.needsUpdate = true;
  scene.add(flowerIM);

  // ============ גבעות רקע (Instanced) ============
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

  // ============ מבנים לגילוי ============
  const discoveries = [];
  const discoveryData = [
    { name: 'חורבות עתיקות', desc: 'שרידי תרבות קדומה', pos: [40, -40], type: 'ruins' },
    { name: 'מעבדה נטושה', desc: 'ציוד מדעי ישן', pos: [-50, 30], type: 'lab' },
    { name: 'מקדש השמש', desc: 'מבנה מסתורי', pos: [60, 50], type: 'temple' },
    { name: 'אנדרטת הרוח', desc: 'פסל ענק', pos: [-40, -60], type: 'monument' },
    { name: 'מערה נסתרת', desc: 'פתח חשוך', pos: [20, 70], type: 'cave' },
    { name: 'מגדלור עזוב', desc: 'אור מרוחק', pos: [-70, -30], type: 'lighthouse' },
    { name: 'בריכת בדולח', desc: 'מים זוהרים', pos: [0, -80], type: 'pool' },
    { name: 'עץ החיים', desc: 'עץ עתיק וענק', pos: [80, -10], type: 'tree' }
  ];
  function createDiscovery(data) {
    const group = new THREE.Group();
    group.position.set(data.pos[0], getGroundHeight(data.pos[0], data.pos[1]), data.pos[1]);
    const mat = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, flatShading: true, roughness: 0.85 }, o || {}));

    if (data.type === 'ruins') {
      for (let i = 0; i < 5; i++) {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 2.2 + Math.random(), 7), mat(0xb8b0a2));
        const a = (i / 5) * Math.PI * 2;
        c.position.set(Math.cos(a) * 2.2, 1.1, Math.sin(a) * 2.2);
        c.castShadow = true; group.add(c);
      }
      const base = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.3, 5.4), mat(0x9a9284));
      base.position.y = 0.15; group.add(base);
      colliders.push({ x: data.pos[0], z: data.pos[1], r: 3.0 });
    } else if (data.type === 'lab') {
      const box = new THREE.Mesh(new THREE.BoxGeometry(4, 2.5, 3), mat(0x556677, { metalness: 0.4 }));
      box.position.y = 1.25; box.castShadow = true; group.add(box);
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), mat(0xcccccc, { metalness: 0.6 }));
      ant.position.set(1, 3.3, 0); group.add(ant);
      colliders.push({ x: data.pos[0], z: data.pos[1], r: 2.5 });
    } else if (data.type === 'temple') {
      const pyr = new THREE.Mesh(new THREE.ConeGeometry(3.2, 4.2, 4), mat(0xccaa66));
      pyr.position.y = 2.1; pyr.rotation.y = Math.PI / 4; pyr.castShadow = true; group.add(pyr);
      const glow = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0),
        new THREE.MeshStandardMaterial({ color: 0xffcc44, emissive: 0xffaa00, emissiveIntensity: 2.2, flatShading: true }));
      glow.position.y = 4.8; group.add(glow);
      const l = new THREE.PointLight(0xffaa00, 2.5, 14); l.position.y = 4.8; group.add(l);
      colliders.push({ x: data.pos[0], z: data.pos[1], r: 2.6 });
    } else if (data.type === 'monument') {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 5, 7), mat(0x999999, { metalness: 0.3 }));
      st.position.y = 2.5; st.castShadow = true; group.add(st);
      const hd = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), mat(0xaaaaaa));
      hd.position.y = 5.4; group.add(hd);
      colliders.push({ x: data.pos[0], z: data.pos[1], r: 1.5 });
    } else if (data.type === 'cave') {
      const r2 = new THREE.Mesh(new THREE.DodecahedronGeometry(2.4, 0), mat(0x555555));
      r2.position.y = 0.6; r2.castShadow = true; group.add(r2);
      colliders.push({ x: data.pos[0], z: data.pos[1], r: 2.4 });
    } else if (data.type === 'lighthouse') {
      const tw = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.3, 6, 8), mat(0xf2f2f2));
      tw.position.y = 3; tw.castShadow = true; group.add(tw);
      const tp = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 1, 8), mat(0xdd3333));
      tp.position.y = 6.5; group.add(tp);
      const l = new THREE.PointLight(0xffff88, 3, 20); l.position.y = 6.5; group.add(l);
      colliders.push({ x: data.pos[0], z: data.pos[1], r: 1.6 });
    } else if (data.type === 'pool') {
      const pl = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.2, 18),
        new THREE.MeshStandardMaterial({ color: 0x33ccff, emissive: 0x0088cc, emissiveIntensity: 1.2, transparent: true, opacity: 0.85, flatShading: true }));
      pl.position.y = 0.05; group.add(pl);
      const l = new THREE.PointLight(0x00aaff, 2.5, 14); l.position.y = 1; group.add(l);
      slowZones.push({ x: data.pos[0], z: data.pos[1], r: 3.4 });
    } else if (data.type === 'tree') {
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.3, 4, 8), mat(0x553311));
      tr.position.y = 2; tr.castShadow = true; group.add(tr);
      const lv = new THREE.Mesh(new THREE.IcosahedronGeometry(3.6, 1),
        new THREE.MeshStandardMaterial({ color: 0x33bb55, emissive: 0x115522, emissiveIntensity: 0.5, flatShading: true }));
      lv.position.y = 5.2; lv.castShadow = true; group.add(lv);
      colliders.push({ x: data.pos[0], z: data.pos[1], r: 1.6 });
    }
    scene.add(group);
    discoveries.push({ group, data, discovered: false });
  }
  discoveryData.forEach(createDiscovery);

  // ============ הרובר ============
  const rover = new THREE.Group();
  rover.rotation.order = 'YXZ';
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

  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 1.3), M.body);
  hull.position.y = 0.78; rover.add(hull);
  const frontPlate = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.42, 0.14), M.bodyDark);
  frontPlate.position.set(0, 0.78, -0.68); frontPlate.rotation.x = -0.25; rover.add(frontPlate);
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.6), M.bodyDark);
  crate.position.set(-0.55, 1.25, 0.3); crate.rotation.y = 0.2; rover.add(crate);

  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.72, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.dome);
  dome.position.y = 1.05; dome.scale.y = 0.88; rover.add(dome);
  const domeRing = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.05, 6, 14), M.bodyDark);
  domeRing.position.y = 1.05; domeRing.rotation.x = Math.PI / 2; rover.add(domeRing);
  [-0.24, 0.24].forEach(ex => {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.055, 0.03), M.black);
    eye.position.set(ex, 1.22, -0.56); eye.rotation.x = -0.45; rover.add(eye);
  });

  [-1, 1].forEach(side => {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.55), M.metal);
    arm.position.set(0.35, 1.0, side * 0.72); rover.add(arm);
    const podBase = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.21, 0.16, 8), M.bodyDark);
    podBase.position.set(0.35, 1.1, side * 0.92); rover.add(podBase);
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.34, 10), M.body);
    pod.position.set(0.35, 1.32, side * 0.92); rover.add(pod);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.13, 10), M.black);
    band.position.set(0.35, 1.4, side * 0.92); rover.add(band);
    const camHead = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.18), M.body);
    camHead.position.set(0.72, 1.15, side * 0.92); rover.add(camHead);
  });

  const wheels = [];
  function createShock(len) {
    const g = new THREE.Group();
    const sb = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, len, 8), M.metalDark);
    g.add(sb);
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
    upArm.rotation.z = -sx * 0.35; rover.add(upArm);
    const loArm = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.09, 0.09), M.metal);
    loArm.position.set(sx * 0.85, 0.5, wz * 0.9);
    loArm.rotation.z = -sx * 0.18; rover.add(loArm);
    const shock = createShock(0.55);
    shock.position.set(sx * 0.78, 0.8, wz * 0.72);
    shock.rotation.z = -sx * 0.45; rover.add(shock);

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

  const cableCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.5, 1.02, -0.5), new THREE.Vector3(-0.2, 0.9, -0.66),
    new THREE.Vector3(0.2, 0.93, -0.64), new THREE.Vector3(0.5, 1.02, -0.5)
  ]);
  rover.add(new THREE.Mesh(new THREE.TubeGeometry(cableCurve, 16, 0.022, 6), M.cable));

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.95, 6), M.metal);
  mast.position.set(-0.6, 1.5, 0.35); mast.rotation.z = 0.35; rover.add(mast);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.5, 0.04), M.bodyDark);
  panel.position.set(-0.78, 1.95, 0.42); panel.rotation.z = 0.5; rover.add(panel);

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
  let distTraveled = 0;
  const interactBtn = document.getElementById('btn-interact');
  interactBtn.addEventListener('touchstart', (e) => { e.preventDefault(); interact(); }, { passive: false });
  function interact() {
    autoFS();
    if (nearDiscovery && !nearDiscovery.discovered) {
      nearDiscovery.discovered = true;
      showDiscoveryToast(nearDiscovery.data.name + ' - ' + nearDiscovery.data.desc);
      document.getElementById('disc-num').textContent = discoveries.filter(d => d.discovered).length;
    }
  }
  function showDiscoveryToast(text) {
    const t = document.getElementById('discovery-toast');
    document.getElementById('toast-text').textContent = text;
    t.classList.add('show');
    clearTimeout(t._hideTimer);
    t._hideTimer = setTimeout(() => t.classList.remove('show'), 3000);
  }
  document.getElementById('disc-total').textContent = discoveries.length;

  const quests = [
    { text: 'חקור את העולם וגלה מקומות חדשים', check: () => true },
    { text: 'סע 200 מטרים עם הרובר', check: () => distTraveled >= 200 },
    { text: 'גלה 3 מקומות מסתוריים', check: () => discoveries.filter(d => d.discovered).length >= 3 },
    { text: 'גלה את כל 8 המקומות!', check: () => discoveries.filter(d => d.discovered).length >= 8 }
  ];
  let lastQuestText = '';
  function updateQuest() {
    let q = quests[0];
    for (let i = quests.length - 1; i >= 0; i--) if (quests[i].check()) { q = quests[i]; break; }
    if (q.text !== lastQuestText) {
      lastQuestText = q.text;
      document.getElementById('quest-text').textContent = q.text;
    }
  }
  updateQuest();

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

    discoveries.forEach(d => {
      const x = ((d.data.pos[0] + HALF) / WORLD_SIZE) * w;
      const y = ((d.data.pos[1] + HALF) / WORLD_SIZE) * h;
      mmCtx.fillStyle = d.discovered ? '#7ef0c0' : '#e8a34a';
      mmCtx.beginPath(); mmCtx.arc(x, y, d.discovered ? 3 : 3.5, 0, Math.PI * 2); mmCtx.fill();
    });

    const rx = ((rover.position.x + HALF) / WORLD_SIZE) * w;
    const ry = ((rover.position.z + HALF) / WORLD_SIZE) * h;
    const fx = -Math.sin(currentRot), fz = -Math.cos(currentRot);
    const ang = Math.atan2(fz, fx);
    mmCtx.fillStyle = 'rgba(200,240,255,0.16)';
    mmCtx.beginPath(); mmCtx.moveTo(rx, ry); mmCtx.arc(rx, ry, 36, ang - 0.5, ang + 0.5); mmCtx.closePath(); mmCtx.fill();

    mmRover.style.left = rx + 'px'; mmRover.style.top = ry + 'px';
  }

  // ============ יום-לילה איטי ============
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
    hemiLight.intensity = 0.2 + day * 0.4;

    const hours = Math.floor(gameTime * 24);
    const mins = Math.floor((gameTime * 24 - hours) * 60);
    const icon = day > 0.5 ? '🌞' : (dusk > 0.5 ? '🌅' : '🌙');
    const txt = icon + ' ' + String(hours).padStart(2, '0') + ':' + String(mins).padStart(2, '0');
    if (txt !== lastTimeText) {
      lastTimeText = txt;
      document.getElementById('time-display').textContent = txt;
    }
  }

  // ============ ניהול ביצועים ============
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

  // ============ resize ============
  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    checkOrientation();
  }
  window.addEventListener('resize', onResize);

  // ============ לולאה ראשית - פיזיקת נסיעה משודרגת ============
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

    // האטה במים
    let inWater = false;
    for (let i = 0; i < slowZones.length; i++) {
      const zn = slowZones[i];
      const dx = rover.position.x - zn.x, dz = rover.position.z - zn.z;
      if (dx * dx + dz * dz < zn.r * zn.r) { inWater = true; break; }
    }
    const waterMul = inWater ? 0.45 : 1;

    // תאוצה/בלימה הדרגתית (תחושת רכב אמיתית)
    const target = keys.forward ? maxSpeed * waterMul : (keys.backward ? -maxSpeed * 0.5 * waterMul : 0);
    velocity = THREE.MathUtils.damp(velocity, target, 2.2, dt);
    if (target === 0 && Math.abs(velocity) < 0.02) velocity = 0;

    const fwdX = -Math.sin(currentRot), fwdZ = -Math.cos(currentRot);
    rover.position.x += fwdX * velocity * dt;
    rover.position.z += fwdZ * velocity * dt;
    distTraveled += Math.abs(velocity) * dt;

    // היגוי תלוי מהירות (יציב במהירות גבוהה)
    const steer = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
    const spd = Math.abs(velocity);
    const steerFactor = 0.25 + 0.75 * THREE.MathUtils.clamp(spd / 5, 0, 1);
    const dirSign = velocity >= 0 ? 1 : -1;
    currentRot += steer * rotSpeed * steerFactor * dirSign * dt;
    rover.rotation.y = currentRot;
    wheelSpin += (velocity * dt) / 0.44;
    wheels.forEach(w => { w.rotation.x = wheelSpin; });

    // התנגשויות
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
    if (hit && spd > 2) velocity *= 0.7;

    // גובה + הטיה לפי שיפוע + השתטחות בבלימה/תאוצה
    const rx = rover.position.x, rz = rover.position.z;
    const hC = getGroundHeight(rx, rz);
    rover.position.y += (hC + 0.06 + (inWater ? -0.05 : 0) - rover.position.y) * 0.25;
    if (spd > 0.5) rover.position.y += Math.abs(Math.sin(t * 11)) * 0.02 * (spd / maxSpeed);

    const sinR = Math.sin(currentRot), cosR = Math.cos(currentRot);
    const hF = getGroundHeight(rx - sinR * 1.3, rz - cosR * 1.3);
    const hB = getGroundHeight(rx + sinR * 1.3, rz + cosR * 1.3);
    const hR = getGroundHeight(rx + cosR * 1.1, rz - sinR * 1.1);
    const hL = getGroundHeight(rx - cosR * 1.1, rz + sinR * 1.1);
    const accel = (velocity - prevVelocity) / Math.max(dt, 0.0001);
    prevVelocity = velocity;
    const pitchAccelTarget = THREE.MathUtils.clamp(-accel * 0.02, -0.10, 0.10);
    const rollSteerTarget = -steer * THREE.MathUtils.clamp(spd / maxSpeed, 0, 1) * 0.07;
    pitchAccel = THREE.MathUtils.damp(pitchAccel, pitchAccelTarget, 5, dt);
    rollSteer = THREE.MathUtils.damp(rollSteer, rollSteerTarget, 5, dt);
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

    // גילויים קרובים
    nearDiscovery = null;
    let best = 36;
    for (let i = 0; i < discoveries.length; i++) {
      const d = discoveries[i];
      const dx = rx - d.group.position.x;
      const dz = rz - d.group.position.z;
      const dd = dx * dx + dz * dz;
      if (dd < best && !d.discovered) { best = dd; nearDiscovery = d; }
    }
    const poi = document.getElementById('poi-marker');
    if (nearDiscovery) {
      interactBtn.classList.add('show');
      poi.style.display = 'flex';
      document.getElementById('poi-label').textContent = nearDiscovery.data.name;
    } else {
      interactBtn.classList.remove('show');
      poi.style.display = 'none';
    }
    updateQuest();

    // מצלמה חכמה: מרחק/גובה/FOV לפי מהירות + look-ahead
    sky.position.copy(camera.position);
    const camDist = 7.2 + spd * 0.14;
    const camH = 3.9 + spd * 0.06;
    _camPos.set(rx - fwdX * camDist, rover.position.y + camH, rz - fwdZ * camDist);
    camera.position.lerp(_camPos, 1 - Math.exp(-4.5 * dt));
    const lookAhead = 2.0 + spd * 0.25;
    _look.set(rx + fwdX * lookAhead, rover.position.y + 1.1, rz + fwdZ * lookAhead);
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