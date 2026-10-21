import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// ============ Error display (shows crashes on screen) ============
window.addEventListener('error', (e) => {
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999999;background:rgba(140,0,0,0.9);color:#fff;font:12px monospace;padding:6px;direction:ltr;';
  d.textContent = 'ERROR: ' + e.message + ' (line ' + e.lineno + ')';
  document.body.appendChild(d);
});

// ============ Mobile detection ============
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

  // ============ Fullscreen ============
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

  // ============ Scene ============
  const WORLD_SIZE = 220;
  const HALF = WORLD_SIZE / 2;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xe9c9a2, 0.0065);

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
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.16, 0.6, 0.92);
  composer.addPass(bloomPass);
  composer.addPass(new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; varying vec2 vUv;
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        float g = dot(c.rgb, vec3(0.299,0.587,0.114));
        c.rgb = mix(vec3(g), c.rgb, 0.90);
        c.rgb = (c.rgb - 0.5) * 1.05 + 0.5;
        c.r *= 1.04; c.g *= 1.01; c.b *= 0.96;
        vec2 q = vUv - 0.5;
        float vig = smoothstep(0.9, 0.3, length(q) * 1.35);
        c.rgb *= mix(0.80, 1.0, vig);
        gl_FragColor = c;
      }`
  }));

  // ============ Sky ============
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
          col += sunColor * (pow(s, 240.0) * 1.4 + pow(s, 10.0) * 0.45);
          gl_FragColor = vec4(col, 1.0);
        }`
    })
  );
  scene.add(sky);

  // ============ Lights ============
  const ambientLight = new THREE.AmbientLight(0x8899bb, 0.32);
  scene.add(ambientLight);
  const hemiLight = new THREE.HemisphereLight(0xbfd8e8, 0x6b7a4a, 0.6);
  scene.add(hemiLight);
  const sunLight = new THREE.DirectionalLight(0xffd9a0, 2.6);
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
  const fillLight = new THREE.DirectionalLight(0x99bbee, 0.4);
  fillLight.position.set(-50, 30, -40);
  scene.add(fillLight);
  const camLight = new THREE.DirectionalLight(0xffeedd, 0.6);
  scene.add(camLight);
  scene.add(camLight.target);

  // ============ Environment map ============
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

  // ============ Standing-stones hill (part of the terrain) ============
  const POI_X = 10, POI_Z = -72;
  function moundH(x, z) {
    const d2 = ((x - POI_X) * (x - POI_X) + (z - POI_Z) * (z - POI_Z)) / (12 * 12);
    if (d2 >= 1) return 0;
    const t = 1 - d2;
    return 3.2 * t * t;
  }

  // ============ Unified height grid ============
  const GSEG = 110;
  const GCELL = WORLD_SIZE / GSEG;
  const HGRID = new Float32Array((GSEG + 1) * (GSEG + 1));
  for (let iz = 0; iz <= GSEG; iz++) {
    for (let ix = 0; ix <= GSEG; ix++) {
      const x = -HALF + ix * GCELL;
      const z = -HALF + iz * GCELL;
      HGRID[iz * (GSEG + 1) + ix] = fbm(x, z) * 3.5 - 1.75 - pathMask(x, z) * 0.15 + moundH(x, z);
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

  // ============ Ground ============
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

    if (dist < 22) col.setRGB(0.36, 0.47, 0.21);
    else if (nx < 0.3 && nz < 0.3) col.setRGB(0.16, 0.36, 0.19);
    else if (nx > 0.7 && nz < 0.3) col.setRGB(0.82, 0.71, 0.45);
    else if (nx < 0.3 && nz > 0.7) col.setRGB(0.86, 0.90, 0.95);
    else if (nx > 0.7 && nz > 0.7) col.setRGB(0.36, 0.41, 0.26);
    else col.setRGB(0.38 + bn * 0.08, 0.47 + bn * 0.08, 0.23);

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

  const TEXN = 640;
  const texData = new Uint8Array(TEXN * TEXN * 4);
  const lin = (b) => Math.round(255 * Math.pow(Math.min(255, b) / 255, 2.2));
  for (let r = 0; r < TEXN; r++) {
    for (let c = 0; c < TEXN; c++) {
      const x = -HALF + (c + 0.5) / TEXN * WORLD_SIZE;
      const z = HALF - (r + 0.5) / TEXN * WORLD_SIZE;
      const n = noise2D(c * 0.73 + 1.3, r * 0.91 + 7.1);
      const pmk = pathMask(x, z) + (n - 0.5) * 0.5;
      const o = (r * TEXN + c) * 4;
      let R, G, Bc, A = 0;
      if (pmk > 0.5) {
        const d = Math.abs(x - pathCenter(z));
        let sh = 0.8 + Math.floor(smoothNoise(x, z, 3) * 4) / 4 * 0.35 + (n - 0.5) * 0.12;
        if (Math.abs(d - 0.85) < 0.28) sh *= 0.74;
        R = lin(158 * sh); G = lin(116 * sh); Bc = lin(72 * sh);
        if (n > 0.985) { R = lin(180); G = lin(165); Bc = lin(145); }
        A = 255;
      } else {
        const l = Math.min(1, 0.9 + Math.floor(smoothNoise(x, z, 4) * 3) / 3 * 0.08 + n * 0.06);
        R = G = Bc = Math.round(255 * l);
      }
      texData[o] = R; texData[o + 1] = G; texData[o + 2] = Bc; texData[o + 3] = A;
    }
  }
  const groundTex = new THREE.DataTexture(texData, TEXN, TEXN, THREE.RGBAFormat);
  groundTex.magFilter = THREE.NearestFilter;
  groundTex.minFilter = THREE.LinearMipmapLinearFilter;
  groundTex.generateMipmaps = true;
  groundTex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  groundTex.needsUpdate = true;
  const groundMat = new THREE.MeshStandardMaterial({
    map: groundTex, vertexColors: true, roughness: 0.95, metalness: 0.0, flatShading: true
  });
  groundMat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <map_fragment>', '')
      .replace('#include <color_fragment>', `
        vec4 gt = texture2D( map, vMapUv );
        diffuseColor.rgb = mix( diffuseColor.rgb * vColor * gt.rgb, gt.rgb, gt.a );
      `);
  };
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ============ 3D grass with wind ============
  function makeBladeGeo(h, w, bend) {
    const segs = 4;
    const positions = [], normals = [], uvs = [], vcols = [], indices = [];
    const baseCol = new THREE.Color(0x3a5424);
    const tipCol = new THREE.Color(0x9aae4c);
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
    const b = makeBladeGeo(0.6 + Math.random() * 0.55, 0.13 + Math.random() * 0.08, 0.12 + Math.random() * 0.16);
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
    const z = (Math.random() - 0.5) * WORLD_SIZE * 0.94;
    const x = Math.random() < 0.55 ? pathCenter(z) + (Math.random() - 0.5) * 30 : (Math.random() - 0.5) * WORLD_SIZE * 0.94;
    if (pathMask(x, z) > 0.5) continue;
    dummy.position.set(x, getGroundHeight(x, z) - 0.04, z);
    dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    dummy.scale.setScalar(0.7 + Math.random() * 0.9);
    dummy.updateMatrix();
    grassMesh.setMatrixAt(gi, dummy.matrix);
    const t = Math.random();
    gCol.setRGB(0.80 + t * 0.25, 0.85 + t * 0.20, 0.75 + t * 0.25);
    grassMesh.setColorAt(gi, gCol);
    gi++;
  }
  grassMesh.count = gi;
  grassMesh.instanceMatrix.needsUpdate = true;
  if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true;
  scene.add(grassMesh);

  // ============ Flowers ============
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

  // ============ Colliders ============
  const colliders = [];
  const smallRocks = [];
  function driveHeight(x, z) {
    let bump = 0;
    for (let i = 0; i < smallRocks.length; i++) {
      const s = smallRocks[i];
      const dx = x - s.x, dz = z - s.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < s.r * s.r) {
        const bmp = s.h * (1 - d2 / (s.r * s.r));
        if (bmp > bump) bump = bmp;
      }
    }
    return getGroundHeight(x, z) + bump;
  }

  // ============ Rocks ============
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
    if (p.s >= 1.0) colliders.push({ x: p.x, z: p.z, r: 0.7 * p.s });
    else smallRocks.push({ x: p.x, z: p.z, r: p.s * 0.9, h: p.s * 0.55 });
  });
  rockIM.instanceMatrix.needsUpdate = true;
  if (rockIM.instanceColor) rockIM.instanceColor.needsUpdate = true;
  scene.add(rockIM);

  // ============ Trees ============
  const treePlans = [];
  for (let i = 0; i < 110; i++) {
    const x = (Math.random() - 0.5) * WORLD_SIZE * 0.9;
    const z = (Math.random() - 0.5) * WORLD_SIZE * 0.9;
    if (Math.sqrt(x * x + z * z) < 9 || pathMask(x, z) > 0.5) continue;
    const nx = (x + HALF) / WORLD_SIZE, nz = (z + HALF) / WORLD_SIZE;
    let type = 'normal';
    if (nx < 0.3 && nz < 0.3) type = 'pine';
    else if (nx > 0.7 && nz < 0.3) type = 'dead';
    const plan = { x, z, type, s: 1.1 + Math.random() * 0.7, trunkH: 2.2 + Math.random() * 1.6, parts: [] };
    plan.color = new THREE.Color().setHSL(type === 'pine' ? 0.34 : 0.22 + Math.random() * 0.06, 0.30 + Math.random() * 0.12, type === 'pine' ? 0.17 + Math.random() * 0.06 : 0.27 + Math.random() * 0.09).getHex();
    if (type === 'pine') {
      for (let k = 0; k < 3; k++) plan.parts.push({ k, size: 1.7 - k * 0.4 });
    } else if (type === 'normal') {
      const blobs = 3 + Math.floor(Math.random() * 3);
      for (let k = 0; k < blobs; k++) {
        plan.parts.push({ ox: (Math.random() - 0.5) * 1.5, oy: Math.random() * 1.3, oz: (Math.random() - 0.5) * 1.5, r: 0.9 + Math.random() * 0.6 });
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
    new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 0.95, flatShading: true }),
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

  // ============ Rolling hills (two hazy layers) ============
  function addHills(count, ringR, rMin, rMax, hMin, hMax, color) {
    const im = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 8, 5),
      new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }), count);
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      const rr = rMin + Math.random() * (rMax - rMin), hh = hMin + Math.random() * (hMax - hMin);
      dummy.position.set(Math.cos(ang) * ringR, -hh * 0.3, Math.sin(ang) * ringR);
      dummy.rotation.set(0, Math.random() * 3, 0);
      dummy.scale.set(rr, hh, rr * 0.8);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
    scene.add(im);
  }
  addHills(12, 150, 30, 46, 9, 15, 0x6f8f3e);
  addHills(12, 215, 50, 72, 18, 28, 0x86a07a);

  // ============ Standing stones (the POI) ============
  const poiGround = getGroundHeight(POI_X, POI_Z);
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xb7ae9c, roughness: 0.95, flatShading: true });
  const STONES = 7;
  for (let k = 0; k < STONES; k++) {
    if (k === 3) continue;
    const ang = (k / STONES) * Math.PI * 2;
    const sx = POI_X + Math.cos(ang) * 5, sz = POI_Z + Math.sin(ang) * 5;
    const sh = k === 0 ? 5 : 4 + Math.random() * 2.5;
    const stone = new THREE.Mesh(new THREE.BoxGeometry(1.2, sh, 0.8), stoneMat);
    stone.position.set(sx, getGroundHeight(sx, sz) - 0.3 + sh / 2, sz);
    stone.rotation.set((Math.random() - 0.5) * 0.12, -ang + Math.PI / 2, (Math.random() - 0.5) * 0.12);
    stone.castShadow = true;
    scene.add(stone);
    colliders.push({ x: sx, z: sz, r: 0.8 });
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.8, 1.0), stoneMat);
  lintel.position.set(POI_X + 5, getGroundHeight(POI_X + 5, POI_Z) - 0.3 + 5.4, POI_Z);
  lintel.rotation.y = Math.PI / 2;
  lintel.castShadow = true;
  scene.add(lintel);

  const poiCv = document.createElement('canvas');
  poiCv.width = 128; poiCv.height = 192;
  const pc = poiCv.getContext('2d');
  pc.shadowColor = '#5fd8ff'; pc.shadowBlur = 14;
  pc.fillStyle = '#bfefff'; pc.font = 'bold 34px sans-serif'; pc.textAlign = 'center';
  pc.fillText('POI', 64, 40);
  pc.strokeStyle = '#8fe6ff'; pc.lineWidth = 5;
  pc.beginPath(); pc.moveTo(64, 52); pc.lineTo(100, 88); pc.lineTo(64, 124); pc.lineTo(28, 88); pc.closePath(); pc.stroke();
  pc.fillStyle = 'rgba(140,230,255,0.55)';
  pc.beginPath(); pc.moveTo(64, 68); pc.lineTo(80, 88); pc.lineTo(64, 108); pc.lineTo(48, 88); pc.closePath(); pc.fill();
  pc.fillStyle = 'rgba(110,200,255,0.85)';
  pc.beginPath(); pc.moveTo(40, 136); pc.lineTo(88, 136); pc.lineTo(64, 176); pc.closePath(); pc.fill();
  const poiTex = new THREE.CanvasTexture(poiCv);
  poiTex.colorSpace = THREE.SRGBColorSpace;
  const poi = new THREE.Sprite(new THREE.SpriteMaterial({ map: poiTex, fog: false, depthTest: false, transparent: true }));
  const poiBaseY = poiGround + 11;
  poi.position.set(POI_X, poiBaseY, POI_Z);
  poi.renderOrder = 10;
  scene.add(poi);

  // ============================================================
  // ============ 🚜 THE ROVER ============
  // ============================================================
  const rover = new THREE.Group();
  rover.rotation.order = 'YXZ';

  const MATS = {
    light:  new THREE.MeshStandardMaterial({ color: 0xa9b8c2, metalness: 0.20, roughness: 0.60, flatShading: true, envMapIntensity: 0.6 }),
    mid:    new THREE.MeshStandardMaterial({ color: 0xa89f8a, metalness: 0.30, roughness: 0.55, flatShading: true, envMapIntensity: 0.7 }),
    arm:    new THREE.MeshStandardMaterial({ color: 0xc9c4b6, metalness: 0.55, roughness: 0.40, flatShading: true, envMapIntensity: 1.0 }),
    joint:  new THREE.MeshStandardMaterial({ color: 0x5e584d, metalness: 0.60, roughness: 0.50, flatShading: true }),
    under:  new THREE.MeshStandardMaterial({ color: 0x3a352d, metalness: 0.30, roughness: 0.80, flatShading: true }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x3b332c, roughness: 0.95, flatShading: true }),
    dome:   new THREE.MeshStandardMaterial({ color: 0xa6c4d8, metalness: 0.05, roughness: 0.5, flatShading: true, envMapIntensity: 0.55 }),
    black:  new THREE.MeshStandardMaterial({ color: 0x141210, roughness: 0.70, flatShading: true }),
    copper: new THREE.MeshStandardMaterial({ color: 0x8a5a34, metalness: 0.30, roughness: 0.60, flatShading: true }),
    crate:  new THREE.MeshStandardMaterial({ color: 0x4c463a, roughness: 0.80, flatShading: true }),
    glow:   new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffeeaa, emissiveIntensity: 1.6, flatShading: true }),
    tail:   new THREE.MeshStandardMaterial({ color: 0xff3322, emissive: 0xff2211, emissiveIntensity: 0.9, flatShading: true }),
    hullS: new THREE.MeshStandardMaterial({ color: 0x8fa1ad, metalness: 0.35, roughness: 0.45, envMapIntensity: 1.1, flatShading: true }),
    deckS: new THREE.MeshStandardMaterial({ color: 0xa8b8c2, metalness: 0.30, roughness: 0.45, envMapIntensity: 1.1, flatShading: true }),
    tanS:  new THREE.MeshStandardMaterial({ color: 0xb5a488, metalness: 0.15, roughness: 0.60, flatShading: true }),
    armS:  new THREE.MeshStandardMaterial({ color: 0xcfcabb, metalness: 0.60, roughness: 0.35, envMapIntensity: 1.2, flatShading: true }),
    darkS: new THREE.MeshStandardMaterial({ color: 0x2a2723, metalness: 0.30, roughness: 0.65, flatShading: true }),
    tread: new THREE.MeshStandardMaterial({ color: 0x5e5144, roughness: 0.95, flatShading: true })
  };

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
  const OUTLINE_KEYS = ['hullS', 'deckS', 'tanS', 'armS', 'darkS', 'dome'];
  const OUTLINE_MAT = new THREE.MeshBasicMaterial({ color: 0x15110d, side: THREE.BackSide });
  OUTLINE_MAT.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += normalize(normal) * 0.03;');
  };
  function makeOutlineGeo(src) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', src.attributes.position.clone());
    if (src.index) g.setIndex(src.index.clone());
    const m = mergeVertices(g, 1e-3);
    m.computeVertexNormals();
    return m;
  }

  // ---- Body: rounded, layered, solid (no scaleLast: positions are real) ----
  partRB('hullS', 0, 0.98, 0.05, 2.15, 0.72, 2.25, 0.22);                 // lower hull
  partRB('deckS', 0, 1.40, 0.10, 1.75, 0.30, 1.85, 0.12);                 // upper deck
  partRB('hullS', 0, 1.02, -1.18, 1.95, 0.50, 0.75, 0.20, -0.38, 0, 0);   // sloped nose
  partRB('darkS', 0, 0.62, 0.05, 1.85, 0.22, 2.10, 0.08);                 // skid plate
  partRB('tanS', -1.14, 1.02, 0.05, 0.14, 0.50, 1.50, 0.06);              // side armor
  partRB('tanS',  1.14, 1.02, 0.05, 0.14, 0.50, 1.50, 0.06);
  partRB('hullS', 0, 1.0, 1.2, 1.95, 0.55, 0.20, 0.08);                   // rear plate
  for (let i = 0; i < 4; i++) partRB('darkS', 0, 0.86 + i * 0.1, 1.31, 1.3, 0.05, 0.03, 0.01); // vent slats

  // ---- Dome + eyes + emblem ----
  const domeGeo = new THREE.SphereGeometry(0.85, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  domeGeo.scale(1, 0.92, 1);
  part(domeGeo, place(0, 1.55, 0), 'dome');
  part(new THREE.TorusGeometry(0.85, 0.08, 8, 16), place(0, 1.56, 0, Math.PI / 2, 0, 0), 'tanS');
  part(new THREE.BoxGeometry(0.42, 0.08, 0.05), place(-0.3, 1.69, -0.78, -0.2, 0.37, 0), 'black');
  part(new THREE.BoxGeometry(0.42, 0.08, 0.05), place(0.3, 1.69, -0.78, -0.2, -0.37, 0), 'black');
  partDisc('joint', 0, 2.07, -0.675, 0.17, 0.03, 0, 0.82, -0.9, 10);
  partDisc('light', 0, 2.08, -0.69, 0.09, 0.03, 0, 0.82, -0.9, 8);

  // ---- Side sensor pods (tan housing, grille top, lens) ----
  [-1, 1].forEach(side => {
    const px = side * 1.0;
    partRB('hullS', side * 0.9, 1.45, -0.25, 0.3, 0.2, 0.4, 0.05);
    partRB('tanS', px, 1.62, -0.25, 0.5, 0.55, 0.55, 0.1);
    partRB('darkS', px, 1.92, -0.25, 0.46, 0.1, 0.46, 0.02);
    for (let j = -1.5; j <= 1.5; j++) { partRB('armS', px + j * 0.1, 1.975, -0.25, 0.022, 0.02, 0.44, 0.004); partRB('armS', px, 1.975, -0.25 + j * 0.1, 0.44, 0.02, 0.022, 0.004); }
    partDisc('darkS', px, 1.66, -0.54, 0.12, 0.06, 0, 0, 1, 12);
    partDisc('armS', px, 1.66, -0.56, 0.06, 0.03, 0, 0, 1, 10);
  });

  // ---- Rear equipment: black case, tan backpack, antenna ----
  partRB('darkS', -0.5, 1.78, 0.62, 0.8, 0.45, 0.65, 0.08);
  partRB('armS', -0.5, 2.02, 0.62, 0.5, 0.04, 0.4, 0.015);
  partDisc('tanS', 0.38, 1.85, 0.62, 0.17, 0.6, 0, 1, 0, 12);
  partDisc('tanS', 0.72, 1.85, 0.62, 0.17, 0.6, 0, 1, 0, 12);
  partDisc('armS', 0.38, 2.17, 0.62, 0.09, 0.06, 0, 1, 0, 10);
  partDisc('armS', 0.72, 2.17, 0.62, 0.09, 0.06, 0, 1, 0, 10);
  partBeam('joint', -0.7, 2.04, 0.85, -0.7, 2.95, 0.85, 0.035);
  partDisc('glow', -0.7, 2.97, 0.85, 0.05, 0.05, 0, 1, 0, 8);
  partBeam('joint', -0.35, 2.04, 0.5, -0.35, 2.25, 0.5, 0.05);
  partDisc('armS', -0.35, 2.3, 0.5, 0.26, 0.04, 0.2, 1, -0.5, 14);

  // ---- Suspension brackets: mounted ON the outside of the hull (never buried) ----
  // The arms and air springs themselves are dynamic (see updateSuspension) and follow each wheel.
  const TRACK = 1.95;      // wheel centre distance from the body centre line (a bit wider so the suspension is visible)
  const CAP_TIP = TRACK - 0.45;   // inner end of each hub cap
  const wheelSlots = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  wheelSlots.forEach(([sx, sz]) => {
    partRB('darkS', sx * 0.80, 1.60, sz * 0.74, 0.30, 0.12, 0.30, 0.03);   // upper mount, sits on top of the deck
    partRB('darkS', sx * 1.25, 0.86, sz * 0.62, 0.12, 0.26, 0.32, 0.03);   // lower mount, bolted to the side armor
    partRB('darkS', sx * 1.14, 1.31, sz * 0.50, 0.16, 0.09, 0.22, 0.02);   // air-spring mount, on top of the side armor
  });

  // ---- Copper cables ----
  const cable1 = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.95, 1.62, -0.35), new THREE.Vector3(-0.4, 1.5, -0.95),
    new THREE.Vector3(0.4, 1.5, -0.95), new THREE.Vector3(0.95, 1.62, -0.35)
  ]);
  part(new THREE.TubeGeometry(cable1, 16, 0.03, 5), new THREE.Matrix4(), 'copper');
  const cable3 = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.3, 1.6, 0.5), new THREE.Vector3(0.5, 1.5, 1.0),
    new THREE.Vector3(-0.2, 1.5, 1.05)
  ]);
  part(new THREE.TubeGeometry(cable3, 12, 0.022, 5), new THREE.Matrix4(), 'copper');

  // ---- Lights ----
  partDisc('glow', -0.7, 0.9, -1.57, 0.11, 0.06, 0, 0.35, -1, 10);
  partDisc('glow', 0.7, 0.9, -1.57, 0.11, 0.06, 0, 0.35, -1, 10);
  partRB('tail', -0.62, 1.05, 1.32, 0.34, 0.13, 0.05, 0.03);
  partRB('tail', 0.62, 1.05, 1.32, 0.34, 0.13, 0.05, 0.03);
  partRB('darkS', 0, 0.78, -1.62, 1.9, 0.2, 0.18, 0.07);

  Object.keys(buckets).forEach(key => {
    const merged = mergeSafe(buckets[key], false);
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, MATS[key]);
    if (OUTLINE_KEYS.includes(key)) rover.add(new THREE.Mesh(makeOutlineGeo(merged), OUTLINE_MAT));
    mesh.castShadow = true;
    rover.add(mesh);
  });

  // ---- Wheels with DEEP treads for strong silhouette ----
  function mergeSafe(list, groups) {
    return mergeGeometries(list.map(g => (g.index ? g.toNonIndexed() : g)), groups);
  }
  function buildWheelGeo() {
    const carcass = new THREE.CylinderGeometry(0.62, 0.62, 0.72, 10);
    carcass.rotateZ(Math.PI / 2);
    const tp = [];
    const N = 10;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const tread = new RoundedBoxGeometry(0.76, 0.27, 0.36, 1, 0.06);
      const m = new THREE.Matrix4().makeRotationX(a);
      m.setPosition(0, Math.cos(a) * 0.7, Math.sin(a) * 0.7);
      tread.applyMatrix4(m);
      tp.push(tread);
    }
    const treads = mergeGeometries(tp, false);
    const hp = [];
    const hub = new THREE.CylinderGeometry(0.4, 0.4, 0.82, 8); hub.rotateZ(Math.PI / 2); hp.push(hub);
    const cap = new THREE.CylinderGeometry(0.2, 0.2, 0.9, 8); cap.rotateZ(Math.PI / 2); hp.push(cap);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const bolt = new THREE.CylinderGeometry(0.04, 0.04, 0.88, 5);
      bolt.rotateZ(Math.PI / 2);
      bolt.translate(0, Math.cos(a) * 0.3, Math.sin(a) * 0.3);
      hp.push(bolt);
    }
    return mergeSafe([carcass, treads, mergeGeometries(hp, false)], true);
  }
  const wheelGeo = buildWheelGeo();
  const wheelOutlineGeo = makeOutlineGeo(wheelGeo);
  const wheels = [];
  wheelSlots.forEach(([sx, sz]) => {
    const w = new THREE.Mesh(wheelGeo, [MATS.rubber, MATS.tread, MATS.armS]);
    w.add(new THREE.Mesh(wheelOutlineGeo, OUTLINE_MAT));
    w.position.set(sx * TRACK, 0.74, sz * 1.0);
    w.castShadow = true;
    rover.add(w);
    wheels.push({ mesh: w, baseY: 0.74, y: 0.74, phase: Math.random() * 6.28, lx: sx * TRACK, lz: sz * 1.0 });
  });

  // ---- Dynamic suspension: arms + air springs follow each wheel's travel ----
  const _ZA = new THREE.Vector3(0, 0, 1);
  function unitBeam(w, t, mat, r, outline) {
    const g = new RoundedBoxGeometry(w, t, 1, 1, r);
    const m = new THREE.Mesh(g, mat);
    if (outline) m.add(new THREE.Mesh(makeOutlineGeo(g), OUTLINE_MAT));
    m.castShadow = true;
    rover.add(m);
    return m;
  }
  const springGeo = (() => {
    const list = [];
    const R = 6;
    for (let i = 0; i < R; i++) {
      const tr = new THREE.TorusGeometry(0.12, 0.04, 5, 8);
      tr.translate(0, 0, -0.5 + (i + 0.5) / R);
      list.push(tr);
    }
    return mergeSafe(list, false);
  })();
  const hubJointGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.14, 8);
  hubJointGeo.rotateZ(Math.PI / 2);
  const rodGeo = new THREE.CylinderGeometry(0.055, 0.055, 1, 6);
  rodGeo.rotateX(Math.PI / 2);

  const suspension = wheelSlots.map(([sx, sz], i) => {
    const rod = new THREE.Mesh(rodGeo, MATS.darkS); rod.castShadow = true; rover.add(rod);
    const spring = new THREE.Mesh(springGeo, MATS.armS); spring.castShadow = true; rover.add(spring);
    const joint = new THREE.Mesh(hubJointGeo, MATS.darkS); joint.castShadow = true; rover.add(joint);
    return {
      sx, sz, wheel: wheels[i],
      upper: unitBeam(0.2, 0.15, MATS.armS, 0.04, true),
      lower: unitBeam(0.2, 0.13, MATS.armS, 0.04, true),
      rod, spring, joint,
      U: new THREE.Vector3(sx * 0.80, 1.62, sz * 0.74),
      L: new THREE.Vector3(sx * 1.28, 0.86, sz * 0.62),
      T: new THREE.Vector3(sx * 1.14, 1.34, sz * 0.50)
    };
  });
  const _sa = new THREE.Vector3(), _sb = new THREE.Vector3(), _sd = new THREE.Vector3();
  function placeBeam(mesh, a, b) {
    _sd.subVectors(b, a);
    const len = Math.max(0.0001, _sd.length());
    mesh.position.copy(a).addScaledVector(_sd, 0.5);
    mesh.quaternion.setFromUnitVectors(_ZA, _sd.multiplyScalar(1 / len));
    mesh.scale.set(1, 1, len);
  }
  const _Ht = new THREE.Vector3(), _Hb = new THREE.Vector3(), _Bp = new THREE.Vector3();
  function updateSuspension() {
    for (let i = 0; i < suspension.length; i++) {
      const q = suspension[i];
      const wy = q.wheel.mesh.position.y;
      _Ht.set(q.sx * CAP_TIP, wy + 0.12, q.sz * 1.0);
      _Hb.set(q.sx * CAP_TIP, wy - 0.12, q.sz * 1.0);
      placeBeam(q.upper, q.U, _Ht);
      placeBeam(q.lower, q.L, _Hb);
      _Bp.lerpVectors(q.L, _Hb, 0.5); _Bp.y += 0.1;
      placeBeam(q.spring, q.T, _Bp);
      placeBeam(q.rod, q.T, _Bp);
      q.joint.position.set(q.sx * CAP_TIP, wy, q.sz * 1.0);
    }
  }
  updateSuspension();

  const headLight = new THREE.SpotLight(0xffeecc, 2.0, 18, Math.PI / 6, 0.35);
  headLight.position.set(0, 1.0, -1.2);
  headLight.target.position.set(0, 0, -12);
  rover.add(headLight); rover.add(headLight.target);

  scene.add(rover);

  // ============ Controls ============
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

  // ============ Minimap ============
  const mmCanvas = document.getElementById('minimap-canvas');
  const mmCtx = mmCanvas.getContext('2d');
  const mmRover = document.getElementById('minimap-rover');
  let currentRot = 0;
  let mmTimer = 0;

  function drawMinimap() {
    const w = mmCanvas.width, h = mmCanvas.height;
    mmCtx.clearRect(0, 0, w, h);
    mmCtx.fillStyle = 'rgba(40,62,46,0.55)'; mmCtx.fillRect(0, 0, w, h);
    mmCtx.fillStyle = 'rgba(20,50,30,0.5)'; mmCtx.fillRect(0, 0, w * 0.3, h * 0.3);
    mmCtx.fillStyle = 'rgba(150,125,80,0.45)'; mmCtx.fillRect(w * 0.7, 0, w * 0.3, h * 0.3);
    mmCtx.fillStyle = 'rgba(200,215,225,0.4)'; mmCtx.fillRect(0, h * 0.7, w * 0.3, h * 0.3);
    mmCtx.fillStyle = 'rgba(80,95,60,0.5)'; mmCtx.fillRect(w * 0.7, h * 0.7, w * 0.3, h * 0.3);

    mmCtx.strokeStyle = 'rgba(255,255,255,0.28)'; mmCtx.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      mmCtx.beginPath(); mmCtx.moveTo(i * w / 6, 0); mmCtx.lineTo(i * w / 6, h); mmCtx.stroke();
      mmCtx.beginPath(); mmCtx.moveTo(0, i * h / 6); mmCtx.lineTo(w, i * h / 6); mmCtx.stroke();
    }

    mmCtx.strokeStyle = 'rgba(230,200,150,0.8)'; mmCtx.lineWidth = 2; mmCtx.beginPath();
    for (let k = 0; k <= 40; k++) {
      const zz = -HALF + (k / 40) * WORLD_SIZE;
      const px = ((pathCenter(zz) + HALF) / WORLD_SIZE) * w, py = (k / 40) * h;
      if (k === 0) mmCtx.moveTo(px, py); else mmCtx.lineTo(px, py);
    }
    mmCtx.stroke();

    const ppx = ((POI_X + HALF) / WORLD_SIZE) * w, ppy = ((POI_Z + HALF) / WORLD_SIZE) * h;
    mmCtx.fillStyle = '#ffb347';
    mmCtx.beginPath(); mmCtx.arc(ppx, ppy - 4, 4, 0, Math.PI * 2); mmCtx.fill();
    mmCtx.beginPath(); mmCtx.moveTo(ppx - 3, ppy - 2); mmCtx.lineTo(ppx + 3, ppy - 2); mmCtx.lineTo(ppx, ppy + 4); mmCtx.fill();

    const rx = ((rover.position.x + HALF) / WORLD_SIZE) * w;
    const ry = ((rover.position.z + HALF) / WORLD_SIZE) * h;
    const ang = Math.atan2(-Math.cos(currentRot), -Math.sin(currentRot));
    mmCtx.fillStyle = 'rgba(126,240,255,0.30)';
    mmCtx.beginPath(); mmCtx.moveTo(rx, ry); mmCtx.arc(rx, ry, 40, ang - 0.55, ang + 0.55); mmCtx.closePath(); mmCtx.fill();
    mmCtx.save();
    mmCtx.translate(rx, ry); mmCtx.rotate(ang + Math.PI / 2);
    mmCtx.fillStyle = '#222';
    mmCtx.fillRect(-6, -5, 3, 4); mmCtx.fillRect(3, -5, 3, 4); mmCtx.fillRect(-6, 1, 3, 4); mmCtx.fillRect(3, 1, 3, 4);
    mmCtx.fillStyle = '#cfe7ff'; mmCtx.fillRect(-3.5, -5, 7, 10);
    mmCtx.fillStyle = '#7ef0ff'; mmCtx.beginPath(); mmCtx.arc(0, -1, 2.3, 0, Math.PI * 2); mmCtx.fill();
    mmCtx.restore();
  }

  // ============ Day-night ============
  let gameTime = 0.07;
  const zenDay = new THREE.Color(0x9cc8e4), horDay = new THREE.Color(0xf4dfb8);
  const zenDusk = new THREE.Color(0x4a3a6a), horDusk = new THREE.Color(0xff9a5a);
  const zenNight = new THREE.Color(0x070c22), horNight = new THREE.Color(0x141a34);
  const tmpA = new THREE.Color(), tmpB = new THREE.Color();
  let lastTimeText = '', lastBiomeText = '';

  function updateDayNight(dt) {
    gameTime = (gameTime + dt * 0.0004) % 1;
    const ang = gameTime * Math.PI * 2;
    const sh = Math.sin(ang);
    sunLight.position.set(Math.cos(ang) * 80, Math.max(sh * 80, -25), -30);
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
    sunLight.intensity = 0.4 + day * 2.2 + dusk * 0.6;
    sunLight.color.setRGB(1.0, 0.75 + day * 0.15, 0.55 + day * 0.25);
    ambientLight.intensity = 0.15 + day * 0.3;
    hemiLight.intensity = 0.25 + day * 0.5;

    const hours = Math.floor(gameTime * 24);
    const mins = Math.floor((gameTime * 24 - hours) * 60);
    const icon = day > 0.5 ? '🌞' : (dusk > 0.5 ? '🌅' : '🌙');
    const txt = icon + ' ' + String(hours).padStart(2, '0') + ':' + String(mins).padStart(2, '0');
    if (txt !== lastTimeText) {
      lastTimeText = txt;
      document.getElementById('time-display').textContent = txt;
    }
  }

  // ============ Performance guard ============
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

  // ============ Main loop ============
  const clock = new THREE.Clock();
  const maxSpeed = 9.0;
  let velocity = 0, prevVelocity = 0;
  let steerSmooth = 0;          // smoothed steering input (-1..1)
  let camYaw = 0;               // independent smoothed camera yaw
  let wheelSpin = 0, pitch = 0, roll = 0;
  let perfFrames = 0, perfAcc = 0;
  let camMode = 0, camZoom = 1;   // 0 = behind the rover, 1 = front (like the picture)
  const btnCamView = document.getElementById('cam-view');
  btnCamView.addEventListener('click', () => { camMode = 1 - camMode; btnCamView.textContent = camMode ? '🚗' : '🎥'; });
  document.getElementById('cam-in').addEventListener('click', () => { camZoom = Math.max(0.55, camZoom / 1.2); });
  document.getElementById('cam-out').addEventListener('click', () => { camZoom = Math.min(2.4, camZoom * 1.2); });

  const _camPos = new THREE.Vector3();
  const _look = new THREE.Vector3();

  function getBiomeName(x, z) {
    const nx = (x + HALF) / WORLD_SIZE, nz = (z + HALF) / WORLD_SIZE;
    const dist = Math.sqrt(x * x + z * z);
    if (dist < 22) return '🌿 Green Field';
    if (nx < 0.3 && nz < 0.3) return '🌲 Dense Forest';
    if (nx > 0.7 && nz < 0.3) return '🏜️ Desert';
    if (nx < 0.3 && nz > 0.7) return '❄️ Snowy Zone';
    if (nx > 0.7 && nz > 0.7) return '🌾 Swamp';
    return '🌱 Grassland';
  }

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    uTime.value = t;

    // ---- Throttle ----
    const target = keys.forward ? maxSpeed : (keys.backward ? -maxSpeed * 0.5 : 0);
    velocity = THREE.MathUtils.damp(velocity, target, 2.2, dt);
    if (target === 0 && Math.abs(velocity) < 0.02) velocity = 0;

    const spd = Math.abs(velocity);
    const speedNorm = spd / maxSpeed;

    // ---- SMOOTH steering: damped input + speed-sensitive rate ----
    const steerTarget = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
    steerSmooth = THREE.MathUtils.damp(steerSmooth, steerTarget, 6.0, dt);
    if (steerTarget === 0 && Math.abs(steerSmooth) < 0.01) steerSmooth = 0;
    const authority = 0.25 + 0.75 * Math.min(1, spd / 5.0);      // less turn when slow
    const highSpeedTrim = 1.15 - 0.45 * speedNorm;               // less turn when very fast
    const dirSign = velocity >= 0 ? 1 : -1;
    currentRot += 1.7 * steerSmooth * authority * highSpeedTrim * dirSign * dt;
    rover.rotation.y = currentRot;

    // ---- Move ----
    const fwdX = -Math.sin(currentRot), fwdZ = -Math.cos(currentRot);
    rover.position.x += fwdX * velocity * dt;
    rover.position.z += fwdZ * velocity * dt;
    wheelSpin += (velocity * dt) / 0.7;

    // ---- Collisions ----
    let hit = false;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      const dx = rover.position.x - c.x;
      const dz = rover.position.z - c.z;
      const rr = c.r + 1.2;
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

    // ---- TRUE 3D SUSPENSION: sample ground under EACH wheel ----
    const rx = rover.position.x, rz = rover.position.z;
    const cosR = Math.cos(currentRot), sinR = Math.sin(currentRot);
    const hw = [0, 0, 0, 0];
    let hF = 0, hB = 0, hL = 0, hR = 0;
    for (let i = 0; i < 4; i++) {
      const w = wheels[i];
      const wx = rx + w.lx * cosR + w.lz * sinR;
      const wz = rz - w.lx * sinR + w.lz * cosR;
      hw[i] = driveHeight(wx, wz);
      if (w.lz < 0) hF += hw[i]; else hB += hw[i];
      if (w.lx > 0) hR += hw[i]; else hL += hw[i];
    }
    hF *= 0.5; hB *= 0.5; hL *= 0.5; hR *= 0.5;
    const bodyH = (hF + hB) * 0.5;

    // Body height follows average of wheels (smoothed)
    rover.position.y += (bodyH + 0.04 - rover.position.y) * 0.25;
    if (spd > 0.5) rover.position.y += Math.abs(Math.sin(t * 11)) * 0.015 * speedNorm;

    // Body attitude from the 4 contact points + accel pitch + turn bank
    const accel = (velocity - prevVelocity) / Math.max(dt, 0.0001);
    prevVelocity = velocity;
    const pitchTarget = Math.atan2(hF - hB, 2.0) + THREE.MathUtils.clamp(-accel * 0.022, -0.11, 0.11);
    const rollTarget = Math.atan2(hR - hL, 3.24) - steerSmooth * speedNorm * 0.10;
    pitch = THREE.MathUtils.damp(pitch, pitchTarget, 7, dt);
    roll = THREE.MathUtils.damp(roll, rollTarget, 7, dt);
    rover.rotation.x = pitch;
    rover.rotation.z = roll;

    // Each wheel travels independently (visible suspension compression)
    for (let i = 0; i < 4; i++) {
      const w = wheels[i];
      const wantY = THREE.MathUtils.clamp(hw[i] + 0.74 - rover.position.y, 0.74 - 0.22, 0.74 + 0.22);
      w.y = THREE.MathUtils.damp(w.y, wantY, 12, dt);
      w.mesh.rotation.x = wheelSpin;
      w.mesh.position.y = w.y;
    }

    updateSuspension();
    const limit = HALF - 6;
    rover.position.x = THREE.MathUtils.clamp(rover.position.x, -limit, limit);
    rover.position.z = THREE.MathUtils.clamp(rover.position.z, -limit, limit);

    MATS.tail.emissiveIntensity = (velocity < -0.2 || hit) ? 2.6 : 0.9;

    const biomeTxt = getBiomeName(rx, rz);
    if (biomeTxt !== lastBiomeText) {
      lastBiomeText = biomeTxt;
      document.getElementById('current-biome').textContent = biomeTxt;
    }

    // ---- Camera with its OWN smoothed yaw (no snap on turns) ----
    let dAng = currentRot - camYaw;
    dAng = Math.atan2(Math.sin(dAng), Math.cos(dAng));
    camYaw += dAng * (1 - Math.exp(-4.0 * dt));
    const cfX = -Math.sin(camYaw), cfZ = -Math.cos(camYaw);

    sky.position.copy(camera.position);
    if (camMode === 0) {
      const camDist = (5.6 + spd * 0.14) * camZoom;
      const camH = (2.4 + spd * 0.05) * camZoom;
      _camPos.set(rx - cfX * camDist, rover.position.y + camH, rz - cfZ * camDist);
      const lookAhead = 2.2 + spd * 0.25;
      _look.set(rx + cfX * lookAhead, rover.position.y + 1.3, rz + cfZ * lookAhead);
    } else {
      const camDist = (5.8 + spd * 0.1) * camZoom;
      const camH = 1.5 * camZoom;
      _camPos.set(rx + cfX * camDist, rover.position.y + camH, rz + cfZ * camDist);
      _look.set(rx, rover.position.y + 1.2, rz);
    }
    camera.position.lerp(_camPos, 1 - Math.exp(-4.5 * dt));
    const camGround = getGroundHeight(camera.position.x, camera.position.z) + 0.7;
    if (camera.position.y < camGround) camera.position.y = camGround;
    camera.lookAt(_look);
    camLight.position.set(camera.position.x, camera.position.y + 3, camera.position.z);
    camLight.target.position.set(rx, rover.position.y + 1, rz);
    camLight.intensity = 0.15 + Math.min(0.5, sunLight.intensity * 0.2);
    const targetFov = 58 + spd * 1.1;
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 3, dt);
      camera.updateProjectionMatrix();
    }

    const poiDist = Math.hypot(POI_X - rx, POI_Z - rz);
    const poiS = THREE.MathUtils.clamp(2.2 + poiDist * 0.05, 2.2, 6);
    poi.scale.set(poiS, poiS * 1.5, 1);
    poi.position.y = poiBaseY + Math.sin(t * 2) * 0.3;

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