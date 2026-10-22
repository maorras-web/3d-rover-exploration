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
  const WORLD_SIZE = 440;
  const HALF = WORLD_SIZE / 2;
  // Snowy zone = the corner where nx < SNOW_NX and nz > SNOW_NZ (nx/nz are 0..1 across the world).
  // It was 0.30 / 0.70 (a 132 m square); now 0.40 / 0.60 (a 176 m square, ~1.8x the area).
  const SNOW_NX = 0.40, SNOW_NZ = 0.60;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xe9c9a2, 0.0035);

  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 750);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;   // we decide each frame whether the shadow map is redrawn
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); }, false);   // allow the browser to restore the context
  renderer.domElement.addEventListener('webglcontextrestored', () => { shadowDirty = true; }, false);

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
        c.rgb = mix(vec3(g), c.rgb, 1.14);
        c.rgb = (c.rgb - 0.5) * 1.08 + 0.5;
        c.r *= 1.05; c.g *= 1.02; c.b *= 0.95;
        vec2 q = vUv - 0.5;
        float vig = smoothstep(0.9, 0.3, length(q) * 1.35);
        c.rgb *= mix(0.87, 1.0, vig);
        gl_FragColor = c;
      }`
  }));

  // ============ Sky ============
  const skyUniforms = {
    zenith: { value: new THREE.Color(0x8fc4e8) },
    horizon: { value: new THREE.Color(0xf6dcb4) },
    sunDir: { value: new THREE.Vector3(0.4, 0.5, 0.3).normalize() },
    sunColor: { value: new THREE.Color(0xffd9a0) },
    cloudCol: { value: new THREE.Color(0xffffff) },
    cloudAmt: { value: 1.0 },
    uT: { value: 0 }
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 24, 12),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor;
        uniform vec3 cloudCol; uniform float cloudAmt; uniform float uT;
        float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
        float fbm2(vec2 p){ float s = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }
        varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          vec3 col = mix(horizon, zenith, pow(clamp(d.y, 0.0, 1.0), 0.55));
          float s = max(dot(d, normalize(sunDir)), 0.0);
          col += sunColor * (pow(s, 240.0) * 1.4 + pow(s, 10.0) * 0.45);
          vec2 cuv = d.xz / (d.y + 0.25) * 1.3 + vec2(uT * 0.008, 0.0);
          float cl = smoothstep(0.50, 0.74, fbm2(cuv));
          cl = floor(cl * 3.0 + 0.5) / 3.0;
          cl *= smoothstep(0.03, 0.25, d.y) * cloudAmt;
          vec3 cc = cloudCol + sunColor * pow(s, 5.0) * 0.45;
          col = mix(col, cc, cl * 0.85);
          gl_FragColor = vec4(col, 1.0);
        }`
    })
  );
  scene.add(sky);

  // ============ Lights ============
  const ambientLight = new THREE.AmbientLight(0x8899bb, 0.22);
  scene.add(ambientLight);
  const hemiLight = new THREE.HemisphereLight(0xbfd8e8, 0x6b7a4a, 0.6);
  scene.add(hemiLight);
  const sunLight = new THREE.DirectionalLight(0xffd9a0, 2.6);
  sunLight.position.set(60, 45, 35);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 8;          // tight depth range = more precise shadows, less self-shadow flicker
  sunLight.shadow.camera.far = 165;
  let SHADOW_R = 40;                       // shadows cover the area around the rover (sharper than a whole-map shadow)
  sunLight.shadow.camera.left = -SHADOW_R;
  sunLight.shadow.camera.right = SHADOW_R;
  sunLight.shadow.camera.top = SHADOW_R;
  sunLight.shadow.camera.bottom = -SHADOW_R;
  sunLight.shadow.camera.updateProjectionMatrix();
  sunLight.shadow.bias = -0.0003;
  sunLight.shadow.normalBias = 0.035;
  sunLight.shadow.radius = 3;
  scene.add(sunLight);
  scene.add(sunLight.target);
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
  const GSEG = 220;
  const GCELL = WORLD_SIZE / GSEG;
  const HGRID = new Float32Array((GSEG + 1) * (GSEG + 1));
  for (let iz = 0; iz <= GSEG; iz++) {
    for (let ix = 0; ix <= GSEG; ix++) {
      const x = -HALF + ix * GCELL;
      const z = -HALF + iz * GCELL;
      HGRID[iz * (GSEG + 1) + ix] = (fbm(x, z) - 0.5) * 5.4 + (smoothNoise(x + 300, z - 120, 75) - 0.5) * 4.2 - pathMask(x, z) * 0.15 + moundH(x, z);
    }
  }
  function getGroundHeight(x, z) {
    const gx = THREE.MathUtils.clamp((x + HALF) / GCELL, 0, GSEG - 0.0001);
    const gz = THREE.MathUtils.clamp((z + HALF) / GCELL, 0, GSEG - 0.0001);
    const ix = Math.floor(gx), iz = Math.floor(gz);
    const fx = gx - ix, fz = gz - iz;
    const i00 = iz * (GSEG + 1) + ix, i10 = i00 + 1;
    const i01 = i00 + (GSEG + 1), i11 = i01 + 1;
    const h00 = HGRID[i00], h10 = HGRID[i10], h01 = HGRID[i01], h11 = HGRID[i11];
    // same two triangles the ground mesh is drawn with (no mismatch = no sinking)
    if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
    return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
  }

  // ============ Ground ============
  const groundGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, GSEG, GSEG);
  const pos = groundGeo.attributes.position;
  const GP1 = GSEG + 1;
  const colors = new Float32Array(pos.count * 3);
  const col = new THREE.Color();
  const tmpRock = new THREE.Color(0.42, 0.40, 0.30), tmpSun = new THREE.Color(0.62, 0.62, 0.30);
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
    else if (nx < SNOW_NX && nz > SNOW_NZ) col.setRGB(0.80, 0.86, 0.93);
    else if (nx > 0.7 && nz > 0.7) col.setRGB(0.36, 0.41, 0.26);
    else col.setRGB(0.38 + bn * 0.08, 0.47 + bn * 0.08, 0.23);

    col.r += micro; col.g += micro; col.b += micro;
    { const pt = smoothNoise(x + 90, z - 40, 20) - 0.5; col.r += pt * 0.14; col.g += pt * 0.04; col.b -= pt * 0.03; }

    // baked ambient occlusion (hollows darker, crests lighter) + rocky slopes + sun-bleached heights
    {
      let sum = 0, cnt = 0;
      for (let dz2 = -2; dz2 <= 2; dz2 += 2) for (let dx2 = -2; dx2 <= 2; dx2 += 2) {
        if (!dx2 && !dz2) continue;
        const jx = Math.min(GSEG, Math.max(0, ix + dx2)), jz = Math.min(GSEG, Math.max(0, iy + dz2));
        sum += HGRID[jz * GP1 + jx]; cnt++;
      }
      const hv = HGRID[i];
      const ao = THREE.MathUtils.clamp(1 - (sum / cnt - hv) * 0.55, 0.70, 1.12);
      const ixa = Math.min(GSEG, ix + 1), ixb = Math.max(0, ix - 1), iza = Math.min(GSEG, iy + 1), izb = Math.max(0, iy - 1);
      const gdx = (HGRID[iy * GP1 + ixa] - HGRID[iy * GP1 + ixb]) / (2 * GCELL);
      const gdz = (HGRID[iza * GP1 + ix] - HGRID[izb * GP1 + ix]) / (2 * GCELL);
      const slope = Math.hypot(gdx, gdz);
      col.lerp(tmpRock, THREE.MathUtils.smoothstep(slope, 0.22, 0.7) * 0.45);
      col.lerp(tmpSun, THREE.MathUtils.smoothstep(hv, 1.0, 4.0) * 0.25);
      col.multiplyScalar(ao);
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
      const o = (r * TEXN + c) * 4;
      let R, G, Bc, A = 0;
      {
        // continuous, soft patches (two scales) instead of 3 hard steps + per-texel random speckle
        const l = Math.min(1, 0.95 + (smoothNoise(x, z, 5) - 0.5) * 0.12 + (smoothNoise(x + 40, z - 70, 1.6) - 0.5) * 0.06);
        R = G = Bc = Math.round(255 * l);
      }
      texData[o] = R; texData[o + 1] = G; texData[o + 2] = Bc; texData[o + 3] = A;
    }
  }
  const groundTex = new THREE.DataTexture(texData, TEXN, TEXN, THREE.RGBAFormat);
  groundTex.magFilter = THREE.LinearFilter;
  groundTex.minFilter = THREE.LinearMipmapLinearFilter;
  groundTex.generateMipmaps = true;
  groundTex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  groundTex.needsUpdate = true;
  const groundMat = new THREE.MeshStandardMaterial({
    map: groundTex, vertexColors: true, roughness: 0.95, metalness: 0.0, flatShading: true
  });
  // The dirt trail is drawn per-pixel (fine grain, wheel ruts, pebbles, ragged grassy edges)
  // instead of from the coarse ground texture, so it looks like a real worn track.
  groundMat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
        float fb(vec2 p){ return vn(p) * 0.5 + vn(p * 2.1) * 0.3 + vn(p * 4.3) * 0.2; }`)
      .replace('#include <map_fragment>', '')
      .replace('#include <color_fragment>', `
        vec4 gt = texture2D( map, vMapUv );
        vec3 base = diffuseColor.rgb * vColor * gt.rgb;
        vec2 wp = vec2( -${HALF.toFixed(1)} + vMapUv.x * ${WORLD_SIZE.toFixed(1)}, ${HALF.toFixed(1)} - vMapUv.y * ${WORLD_SIZE.toFixed(1)} );
        float cz = sin(wp.y * 0.05) * 6.0 + sin(wp.y * 0.013) * 4.0;
        float ad = abs(wp.x - cz);
        float lod = 1.0 - smoothstep(14.0, 45.0, length(vViewPosition));
        float wHalf = 2.4 + (fb(wp * 1.6) - 0.5) * 1.1 + (vn(wp * 0.3 + 7.0) - 0.5) * 0.9;
        float pm = 1.0 - smoothstep(wHalf - 0.45, wHalf + 0.1, ad);
        vec3 pcol = base;
        if (pm > 0.002) {
          float large = fb(wp * 0.5);
          float fine = vn(wp * 9.0) * 0.6 + vn(wp * 22.0) * 0.4;
          vec3 dirt = mix(vec3(0.52, 0.38, 0.25), vec3(0.67, 0.52, 0.35), large);
          dirt *= 0.86 + mix(0.5, fine, lod) * 0.28;
          float rut = 1.0 - smoothstep(0.12, 0.42, abs(ad - 1.9));
          dirt = mix(dirt, vec3(0.34, 0.25, 0.17), rut * 0.6 * (0.65 + fine * 0.5));
          float ridge = 1.0 - smoothstep(0.0, 0.5, ad);
          dirt = mix(dirt, vec3(0.70, 0.56, 0.38), ridge * 0.35);
          float peb = step(0.955, vn(wp * 13.0));
          dirt = mix(dirt, vec3(0.64, 0.59, 0.50), peb * 0.85 * lod);
          float tuft = smoothstep(0.6, 0.78, vn(wp * 5.5 + 40.0)) * (1.0 - rut);
          float edgeW = 1.0 - smoothstep(0.35, 1.0, pm);
          dirt = mix(dirt, vec3(0.30, 0.40, 0.17), clamp(tuft * 0.35 + edgeW * step(0.52, vn(wp * 8.0)) * 0.6, 0.0, 0.8));
          dirt *= mix(0.82, 1.0, smoothstep(0.0, 1.0, pm));
          dirt = pow(dirt, vec3(2.2));
          pcol = mix(base, dirt, pm);
        }
        diffuseColor.rgb = pcol;
      `);
  };
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ============ 3D grass with wind ============
  // Snowy zone: same rule as the ground colours / biome name / minimap.
  // No grass at all there; the margin also covers the blended white-to-green edge of the ground.
  const SNOW_MARGIN = 3;
  function inSnow(x, z) {
    return x < -HALF + SNOW_NX * WORLD_SIZE + SNOW_MARGIN && z > -HALF + SNOW_NZ * WORLD_SIZE - SNOW_MARGIN;
  }

  function makeBladeGeo(h, w, bend, bc, tc, nSegs) {
    const segs = nSegs || 3;
    const positions = [], normals = [], uvs = [], vcols = [], indices = [];
    const baseCol = new THREE.Color(bc !== undefined ? bc : 0x46682a);
    const tipCol = new THREE.Color(tc !== undefined ? tc : 0xb9cc5c);
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
  for (let k = 0; k < 3; k++) {
    const b = makeBladeGeo(0.2 + Math.random() * 0.18, 0.10 + Math.random() * 0.06, 0.05 + Math.random() * 0.08);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((Math.random() - 0.5) * 0.6, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.6));
    m.compose(new THREE.Vector3((Math.random() - 0.5) * 0.2, 0, (Math.random() - 0.5) * 0.2), q, new THREE.Vector3(1, 1, 1));
    b.applyMatrix4(m);
    bladeParts.push(b);
  }
  const tuftGeo = mergeGeometries(bladeParts, false);

  const uTime = { value: 0 };
  const uGrassQ = { value: 1 }, uGrassD = { value: 1 };   // grass range / density (set by the quality level)
  const uRover = { value: new THREE.Vector3(0, -999, 0) };
  const grassMat = new THREE.MeshStandardMaterial({
    vertexColors: true, side: THREE.DoubleSide, roughness: 0.9, metalness: 0.0
  });
  grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.uniforms.uRover = uRover;
    shader.vertexShader = 'uniform float uTime;\nuniform vec3 uRover;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vec4 wpos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
       float dR = distance(wpos.xz, uRover.xz);
       float dC = distance(wpos.xyz, cameraPosition);
       transformed *= mix(0.3, 1.0, smoothstep(2.4, 4.4, dR)) * mix(0.15, 1.0, smoothstep(1.0, 3.0, dC));
       float ph = wpos.x * 0.35 + wpos.z * 0.27;
       float gust = sin(uTime * 1.6 + ph) * 0.6 + sin(uTime * 3.3 + ph * 1.7) * 0.4;
       float hf = position.y * position.y * 6.0;
       transformed.x += gust * 0.17 * hf;
       transformed.z += cos(uTime * 1.2 + ph) * 0.11 * hf;`
    );
  };

  const GRASS = 20000;
  const dummy = new THREE.Object3D();
  const gCol = new THREE.Color();

  // ---- culling helpers: grass that is outside the camera view is not drawn at all ----
  let GH_MIN = Infinity, GH_MAX = -Infinity;
  for (let i = 0; i < HGRID.length; i++) { if (HGRID[i] < GH_MIN) GH_MIN = HGRID[i]; if (HGRID[i] > GH_MAX) GH_MAX = HGRID[i]; }
  function heightRange(x0, z0, x1, z1) {
    if ((x1 - x0) * (z1 - z0) > 1800) return [GH_MIN, GH_MAX];
    const ix0 = Math.max(0, Math.floor((x0 + HALF) / GCELL)), ix1 = Math.min(GSEG, Math.ceil((x1 + HALF) / GCELL));
    const iz0 = Math.max(0, Math.floor((z0 + HALF) / GCELL)), iz1 = Math.min(GSEG, Math.ceil((z1 + HALF) / GCELL));
    let lo = Infinity, hi = -Infinity;
    for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
      const h = HGRID[iz * (GSEG + 1) + ix];
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
    return lo > hi ? [GH_MIN, GH_MAX] : [lo, hi];
  }
  function sphereFromBox(x0, y0, z0, x1, y1, z1) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    return new THREE.Sphere(new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), 0.5 * Math.sqrt(dx * dx + dy * dy + dz * dz));
  }

  // far-field grass: square chunks, each one is its own draw call that is skipped when it is out of view
  const FG_CH = 33, FG_N = Math.ceil(WORLD_SIZE / FG_CH);
  const fgMats = Array.from({ length: FG_N * FG_N }, () => []);
  const fgCols = Array.from({ length: FG_N * FG_N }, () => []);
  let gi = 0;
  for (let i = 0; i < GRASS * 1.5 && gi < GRASS; i++) {
    const z = (Math.random() - 0.5) * WORLD_SIZE * 0.94;
    const x = Math.random() < 0.3 ? pathCenter(z) + (Math.random() - 0.5) * 30 : (Math.random() - 0.5) * WORLD_SIZE * 0.94;
    if (pathMask(x, z) > 0.5 || inSnow(x, z)) continue;
    dummy.position.set(x, getGroundHeight(x, z) - 0.04, z);
    dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    dummy.scale.setScalar(0.75 + Math.random() * 0.5);
    dummy.updateMatrix();
    const q = Math.min(FG_N - 1, Math.max(0, Math.floor((z + HALF) / FG_CH))) * FG_N + Math.min(FG_N - 1, Math.max(0, Math.floor((x + HALF) / FG_CH)));
    const e = dummy.matrix.elements;
    for (let k = 0; k < 16; k++) fgMats[q].push(e[k]);
    const t = Math.random();
    if (Math.random() < 0.14) gCol.setRGB(1.18, 1.05, 0.62); else gCol.setRGB(0.84 + t * 0.25, 0.90 + t * 0.20, 0.76 + t * 0.25);
    fgCols[q].push(gCol.r, gCol.g, gCol.b);
    gi++;
  }
  const grassChunks = [];
  for (let q = 0; q < fgMats.length; q++) {
    const n = fgCols[q].length / 3;
    if (!n) continue;
    const m = new THREE.InstancedMesh(tuftGeo, grassMat, n);
    m.instanceMatrix.array.set(fgMats[q]);
    m.instanceMatrix.needsUpdate = true;
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(fgCols[q]), 3);
    m.frustumCulled = false;      // we cull the chunks ourselves (see cullGrass)
    m.receiveShadow = true;
    const cI = q % FG_N, cJ = Math.floor(q / FG_N);
    const x0 = -HALF + cI * FG_CH, z0 = -HALF + cJ * FG_CH;
    const hr = heightRange(x0, z0, x0 + FG_CH, z0 + FG_CH);
    grassChunks.push({ mesh: m, sphere: sphereFromBox(x0 - 1.5, hr[0] - 0.3, z0 - 1.5, x0 + FG_CH + 1.5, hr[1] + 1.4, z0 + FG_CH + 1.5) });
    scene.add(m);
  }
  const grassLayers = [];

  // ============ Streamed grass around the rover (no visible "edge of the grass") ============
  // Two world-anchored rings follow the rover: a very dense, fine one close by and a sparser, wider one behind it.
  // Each tuft thins out smoothly with distance (a per-tuft random threshold, so tufts grow/shrink instead of popping),
  // and the two layers cross-fade into each other and into the far-field grass, so the density just fades away naturally.
  const nearParts = [];
  for (let k = 0; k < 5; k++) {
    const b = makeBladeGeo(0.18 + Math.random() * 0.24, 0.07 + Math.random() * 0.05, 0.04 + Math.random() * 0.10, 0x395824, 0xc2d868);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((Math.random() - 0.5) * 0.7, (k / 5) * Math.PI * 2 + Math.random() * 0.8, (Math.random() - 0.5) * 0.7));
    m.compose(new THREE.Vector3((Math.random() - 0.5) * 0.2, 0, (Math.random() - 0.5) * 0.2), q, new THREE.Vector3(1, 1, 1));
    b.applyMatrix4(m);
    nearParts.push(b);
  }
  const nearGeo = mergeGeometries(nearParts, false);
  // Cheap geometry for the wide layer (3 blades x 2 segments = 12 triangles vs 30), so it can cover a much bigger area
  const midParts = [];
  for (let k = 0; k < 3; k++) {
    const b = makeBladeGeo(0.18 + Math.random() * 0.24, 0.08 + Math.random() * 0.05, 0.04 + Math.random() * 0.10, 0x395824, 0xb5ca62, 2);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((Math.random() - 0.5) * 0.7, (k / 3) * Math.PI * 2 + Math.random() * 0.8, (Math.random() - 0.5) * 0.7));
    m.compose(new THREE.Vector3((Math.random() - 0.5) * 0.2, 0, (Math.random() - 0.5) * 0.2), q, new THREE.Vector3(1, 1, 1));
    b.applyMatrix4(m);
    midParts.push(b);
  }
  const midGeo = mergeGeometries(midParts, false);
  function ngHash(i, j, sd) { const n = Math.sin(i * 127.1 + j * 311.7 + sd * 74.7) * 43758.5453; return n - Math.floor(n); }

  function makeGrassLayer(geo, CELL, N, K, densGLSL, scaleMul, TILE, maxR) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85, metalness: 0.0 });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uTime;
      shader.uniforms.uRover = uRover;
      shader.uniforms.uGrassQ = uGrassQ;
      shader.uniforms.uGrassD = uGrassD;
      shader.vertexShader = 'uniform float uTime;\nuniform vec3 uRover;\nuniform float uGrassQ;\nuniform float uGrassD;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vec4 wpos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
         float dR = distance(wpos.xz, uRover.xz);
         float dRd = dR / uGrassQ;
         float dC = distance(wpos.xyz, cameraPosition);
         ${densGLSL}
         dens *= uGrassD;
         float rnd = fract(sin(dot(wpos.xz, vec2(12.9898, 78.233))) * 43758.5453);
         float vis = 1.0 - smoothstep(dens * 1.1 - 0.1, dens * 1.1, rnd);
         float fade = vis * mix(0.3, 1.0, smoothstep(2.4, 4.4, dR)) * mix(0.1, 1.0, smoothstep(0.8, 2.2, dC));
         transformed *= fade;
         float ph = wpos.x * 0.35 + wpos.z * 0.27;
         float gust = sin(uTime * 1.6 + ph) * 0.6 + sin(uTime * 3.3 + ph * 1.7) * 0.4;
         float hf = position.y * position.y * 6.0;
         transformed.x += gust * 0.17 * hf * fade;
         transformed.z += cos(uTime * 1.2 + ph) * 0.11 * hf * fade;`
      );
    };
    // The ring is cut into square tiles (one draw call each). Tiles behind the camera, outside the
    // picture, or too far away to show any grass are skipped completely.
    const NT = Math.ceil(N / TILE);
    const tiles = [];
    const white = new THREE.Color(1, 1, 1);
    for (let tb = 0; tb < NT; tb++) {
      for (let ta = 0; ta < NT; ta++) {
        const a0 = ta * TILE, b0 = tb * TILE;
        const w = Math.min(N, a0 + TILE) - a0, h = Math.min(N, b0 + TILE) - b0;
        const mesh = new THREE.InstancedMesh(geo, mat, w * h * K);
        mesh.frustumCulled = false;
        mesh.receiveShadow = true;
        mesh.visible = false;      // shown after the first fill
        for (let i = 0; i < w * h * K; i++) mesh.setColorAt(i, white);
        scene.add(mesh);
        tiles.push({ mesh, a0, b0, w, h, dirty: false, ready: false, sphere: new THREE.Sphere(), x0: 0, x1: 0, z0: 0, z1: 0 });
      }
    }
    const dm = new THREE.Object3D();
    const col = new THREE.Color();
    const cellI = new Int32Array(N * N).fill(-2147483000);
    const cellJ = new Int32Array(N * N).fill(-2147483000);
    function update(px, pz) {
      const cx = Math.floor(px / CELL), cz = Math.floor(pz / CELL);
      const baseI = cx - (N >> 1), baseJ = cz - (N >> 1);
      for (let b = 0; b < N; b++) {
        const cj = baseJ + ((((b - baseJ) % N) + N) % N);
        const tbi = Math.floor(b / TILE);
        for (let a = 0; a < N; a++) {
          const ci = baseI + ((((a - baseI) % N) + N) % N);
          const si = b * N + a;
          if (cellI[si] === ci && cellJ[si] === cj) continue;
          cellI[si] = ci; cellJ[si] = cj;
          const tile = tiles[tbi * NT + Math.floor(a / TILE)];
          tile.dirty = true;
          const local = (b - tile.b0) * tile.w + (a - tile.a0);
          for (let k = 0; k < K; k++) {
            const idx = local * K + k;
            const x = (ci + ngHash(ci, cj, k * 7 + 1)) * CELL;
            const z = (cj + ngHash(ci, cj, k * 7 + 2)) * CELL;
            const pm = pathMask(x, z);
            const keep = Math.abs(x) < HALF - 1 && Math.abs(z) < HALF - 1 && !inSnow(x, z) && (pm < 0.2 || (pm < 0.5 && ngHash(ci, cj, k * 7 + 3) > 0.5));
            if (keep) {
              dm.position.set(x, getGroundHeight(x, z) - 0.03, z);
              dm.rotation.set(0, ngHash(ci, cj, k * 7 + 4) * Math.PI * 2, 0);
              dm.scale.setScalar((0.8 + ngHash(ci, cj, k * 7 + 5) * 0.6) * scaleMul);
            } else {
              dm.position.set(x, -50, z);
              dm.rotation.set(0, 0, 0);
              dm.scale.setScalar(0.0001);
            }
            dm.updateMatrix();
            tile.mesh.setMatrixAt(idx, dm.matrix);
            const t = ngHash(ci, cj, k * 7 + 6);
            if (t < 0.12) col.setRGB(1.12, 1.0, 0.62); else col.setRGB(0.82 + t * 0.3, 0.9 + t * 0.22, 0.74 + t * 0.26);
            tile.mesh.setColorAt(idx, col);
          }
        }
      }
      for (let n = 0; n < tiles.length; n++) {
        const tile = tiles[n];
        if (!tile.dirty) continue;
        tile.dirty = false;
        tile.mesh.instanceMatrix.needsUpdate = true;
        tile.mesh.instanceColor.needsUpdate = true;
        // world box of this tile (cell indices of its slots) -> culling sphere
        let mi = Infinity, ma = -Infinity, mj = Infinity, mb = -Infinity;
        for (let a = tile.a0; a < tile.a0 + tile.w; a++) { const v = cellI[tile.b0 * N + a]; if (v < mi) mi = v; if (v > ma) ma = v; }
        for (let b = tile.b0; b < tile.b0 + tile.h; b++) { const v = cellJ[b * N + tile.a0]; if (v < mj) mj = v; if (v > mb) mb = v; }
        tile.x0 = mi * CELL - 1.2; tile.x1 = (ma + 1) * CELL + 1.2;
        tile.z0 = mj * CELL - 1.2; tile.z1 = (mb + 1) * CELL + 1.2;
        const hr = heightRange(tile.x0, tile.z0, tile.x1, tile.z1);
        tile.sphere.copy(sphereFromBox(tile.x0, hr[0] - 0.3, tile.z0, tile.x1, hr[1] + 1.6, tile.z1));
        tile.ready = true;
      }
    }
    function cull(frustum, px, pz) {
      for (let n = 0; n < tiles.length; n++) {
        const t = tiles[n];
        if (!t.ready) { t.mesh.visible = false; continue; }
        const dx = Math.max(t.x0 - px, 0, px - t.x1), dz = Math.max(t.z0 - pz, 0, pz - t.z1);
        const mr = maxR * uGrassQ.value;
        t.mesh.visible = (dx * dx + dz * dz < mr * mr) && frustum.intersectsSphere(t.sphere);
      }
    }
    grassLayers.push({ cull });
    return update;
  }
  // dense close layer: full density next to the rover, thinning smoothly to nothing by ~18 m (patch radius ~19.5 m)
  const updateGrassNear = makeGrassLayer(nearGeo, 0.85, 46, 4, 'float dens = pow(1.0 - smoothstep(3.0, 18.5, dRd), 2.0);', 1.0, 8, 19.0);
  // wide layer: cheap geometry, slightly bigger tufts, covers ~100 m and fades into the far-field grass
  const updateGrassMid = makeGrassLayer(midGeo, 3.0, 68, 3, 'float dens = smoothstep(4.0, 14.0, dRd) * (1.0 - smoothstep(60.0, 100.0, dRd));', 1.3, 12, 100.0);
  function updateNearGrass(px, pz) { updateGrassNear(px, pz); updateGrassMid(px, pz); }
  const _gFrustum = new THREE.Frustum(), _gPV = new THREE.Matrix4();
  let grassFarMax = 1e9;           // far-field grass beyond this distance is not drawn (quality level)
  function cullGrass(px, pz) {
    camera.updateMatrixWorld();
    _gPV.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _gFrustum.setFromProjectionMatrix(_gPV);
    for (let i = 0; i < grassChunks.length; i++) {
      const c = grassChunks[i];
      const cdx = c.sphere.center.x - px, cdz = c.sphere.center.z - pz;
      c.mesh.visible = (Math.sqrt(cdx * cdx + cdz * cdz) - c.sphere.radius < grassFarMax) && _gFrustum.intersectsSphere(c.sphere);
    }
    for (let i = 0; i < grassLayers.length; i++) grassLayers[i].cull(_gFrustum, px, pz);
  }

  // ============ Flowers ============
  const flowerPlans = [];
  for (let i = 0; i < 320; i++) {
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

  function withGradient(geo, lo, hi) {
    geo.computeBoundingBox();
    const bb = geo.boundingBox, ps = geo.attributes.position;
    const cs = new Float32Array(ps.count * 3);
    for (let i = 0; i < ps.count; i++) {
      const t = (ps.getY(i) - bb.min.y) / Math.max(0.0001, bb.max.y - bb.min.y);
      const f = lo + (hi - lo) * t;
      cs[i * 3] = f; cs[i * 3 + 1] = f; cs[i * 3 + 2] = f;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cs, 3));
    return geo;
  }

  // ============ Colliders ============
  const colliders = [];
  const smallRocks = [];
  // Climbable rocks: every rock keeps the inverse of its real transform, so the drive height matches the
  // visible mesh (an ellipsoid just inside the dodecahedron) and wheels ride up the rock instead of sinking in.
  const ROCK_CELL = 6;
  const rockGrid = new Map();
  const ROCK_LOCAL_R2 = (0.8 * 0.93) * (0.8 * 0.93);
  const rockKey = (ix, iz) => (ix + 2000) * 4096 + (iz + 2000);
  function addClimbRock(matrix, s) {
    const e = new THREE.Matrix3().setFromMatrix4(matrix).invert().elements.slice();
    const rad = 0.8 * s * 1.3;
    const rec = { x: matrix.elements[12], y: matrix.elements[13], z: matrix.elements[14], e, rad2: rad * rad, bb: e[3] * e[3] + e[4] * e[4] + e[5] * e[5] };
    const i0 = Math.floor((rec.x - rad) / ROCK_CELL), i1 = Math.floor((rec.x + rad) / ROCK_CELL);
    const j0 = Math.floor((rec.z - rad) / ROCK_CELL), j1 = Math.floor((rec.z + rad) / ROCK_CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = rockKey(i, j);
      if (!rockGrid.has(k)) rockGrid.set(k, []);
      rockGrid.get(k).push(rec);
    }
  }
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
    let h = getGroundHeight(x, z) + bump;
    const list = rockGrid.get(rockKey(Math.floor(x / ROCK_CELL), Math.floor(z / ROCK_CELL)));
    if (list) {
      for (let i = 0; i < list.length; i++) {
        const r = list[i];
        const dx = x - r.x, dz = z - r.z;
        if (dx * dx + dz * dz > r.rad2) continue;
        const e = r.e;
        const ax = e[0] * dx + e[6] * dz, ay = e[1] * dx + e[7] * dz, az = e[2] * dx + e[8] * dz;
        const ab = ax * e[3] + ay * e[4] + az * e[5];
        const disc = ab * ab - r.bb * (ax * ax + ay * ay + az * az - ROCK_LOCAL_R2);
        if (disc > 0) {
          const top = r.y + (-ab + Math.sqrt(disc)) / r.bb;
          if (top > h) h = top;
        }
      }
    }
    return h;
  }

  // ============ Rocks ============
  const rockPlans = [];
  for (let i = 0; i < 140; i++) {
    const x = (Math.random() - 0.5) * WORLD_SIZE * 0.9;
    const z = (Math.random() - 0.5) * WORLD_SIZE * 0.9;
    if (Math.sqrt(x * x + z * z) < 6) continue;
    rockPlans.push({ x, z, s: 0.4 + Math.random() * 1.4 });
  }
  for (let i = 0; i < 180; i++) {
    const z = (Math.random() - 0.5) * WORLD_SIZE * 0.9;
    const x = pathCenter(z) + (Math.random() > 0.5 ? 1 : -1) * (2.6 + Math.random() * 1.6);
    rockPlans.push({ x, z, s: 0.15 + Math.random() * 0.3 });
  }
  // wheel-sized rocks along the trail (the rover can drive right over these)
  for (let i = 0; i < 46; i++) {
    const z = (Math.random() - 0.5) * WORLD_SIZE * 0.9;
    const x = pathCenter(z) + (Math.random() > 0.5 ? 1 : -1) * (1.4 + Math.random() * 3.4);
    if (Math.hypot(x, z) < 8) continue;
    rockPlans.push({ x, z, s: 0.85 + Math.random() * 0.45 });
  }
  const rockIM = new THREE.InstancedMesh(
    withGradient(new THREE.DodecahedronGeometry(0.8, 0), 0.62, 1.08),
    new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.95, flatShading: true }),
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
    const shade = 0.48 + Math.random() * 0.26;
    rockIM.setColorAt(i, gCol.setRGB(shade, shade * 0.95, shade * 0.86));
    if (p.s > 1.45) colliders.push({ x: p.x, z: p.z, r: 0.7 * p.s });   // only really big boulders block the rover
    else addClimbRock(dummy.matrix, p.s);                              // everything else can be driven over
  });
  rockIM.instanceMatrix.needsUpdate = true;
  if (rockIM.instanceColor) rockIM.instanceColor.needsUpdate = true;
  scene.add(rockIM);

  // ============ Trees ============
  const treePlans = [];
  for (let i = 0; i < 220; i++) {
    const x = (Math.random() - 0.5) * WORLD_SIZE * 0.9;
    const z = (Math.random() - 0.5) * WORLD_SIZE * 0.9;
    if (Math.sqrt(x * x + z * z) < 9 || pathMask(x, z) > 0.5) continue;
    const nx = (x + HALF) / WORLD_SIZE, nz = (z + HALF) / WORLD_SIZE;
    let type = 'normal';
    if (nx < 0.3 && nz < 0.3) type = 'pine';
    else if (nx > 0.7 && nz < 0.3) type = 'dead';
    const plan = { x, z, type, s: 1.1 + Math.random() * 0.7, trunkH: 2.2 + Math.random() * 1.6, parts: [] };
    plan.color = new THREE.Color().setHSL(type === 'pine' ? 0.34 : 0.20 + Math.random() * 0.07, 0.46 + Math.random() * 0.12, type === 'pine' ? 0.20 + Math.random() * 0.07 : 0.34 + Math.random() * 0.11).getHex();
    if (type === 'pine') {
      for (let k = 0; k < 3; k++) plan.parts.push({ k, size: 1.7 - k * 0.4 });
    } else if (type === 'normal') {
      const blobs = 3 + Math.floor(Math.random() * 3);
      for (let k = 0; k < blobs; k++) {
        plan.parts.push({ ox: (Math.random() - 0.5) * 1.5, oy: Math.random() * 1.3, oz: (Math.random() - 0.5) * 1.5, r: 0.9 + Math.random() * 0.6 });
      }
    }
    treePlans.push(plan);
    colliders.push({ x, z, r: 0.45 * plan.s, tree: true });
  }
  let coneCount = 0, blobCount = 0, branchCount = 0;
  treePlans.forEach(p => {
    if (p.type === 'pine') coneCount += 3;
    else if (p.type === 'normal') blobCount += p.parts.length;
    else branchCount += 3;
  });

  const trunkIM = new THREE.InstancedMesh(
    withGradient(new THREE.CylinderGeometry(0.16, 0.3, 1, 6), 0.72, 1.08),
    new THREE.MeshStandardMaterial({ color: 0x70502f, vertexColors: true, roughness: 0.95, flatShading: true }),
    Math.max(1, treePlans.length)
  );
  trunkIM.castShadow = true;
  const coneIM = new THREE.InstancedMesh(
    withGradient(new THREE.ConeGeometry(1, 1, 7), 0.55, 1.06),
    new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9, flatShading: true }),
    Math.max(1, coneCount)
  );
  coneIM.castShadow = true;
  const blobIM = new THREE.InstancedMesh(
    withGradient(new THREE.IcosahedronGeometry(1, 0), 0.58, 1.12),
    new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9, flatShading: true }),
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
    im.receiveShadow = true;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    scene.add(im);
  });

  // ============ Bushes: a middle layer of volume between the grass and the trees ============
  const bushPlans = [];
  for (let c = 0; c < 120; c++) {
    const cx = (Math.random() - 0.5) * WORLD_SIZE * 0.9, cz = (Math.random() - 0.5) * WORLD_SIZE * 0.9;
    if (Math.hypot(cx, cz) < 7 || pathMask(cx, cz) > 0.25) continue;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      const x = cx + (Math.random() - 0.5) * 3.2, z = cz + (Math.random() - 0.5) * 3.2;
      if (pathMask(x, z) > 0.2) continue;
      bushPlans.push({ x, z, s: 0.45 + Math.random() * 0.65 });
    }
  }
  const bushIM = new THREE.InstancedMesh(
    withGradient(new THREE.IcosahedronGeometry(1, 0), 0.58, 1.1),
    new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9, flatShading: true }),
    Math.max(1, bushPlans.length)
  );
  bushIM.castShadow = true;
  bushIM.receiveShadow = true;
  bushPlans.forEach((p, i) => {
    dummy.position.set(p.x, getGroundHeight(p.x, p.z) + p.s * 0.36, p.z);
    dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    dummy.scale.set(p.s * 1.15, p.s * 0.78, p.s * 1.15);
    dummy.updateMatrix();
    bushIM.setMatrixAt(i, dummy.matrix);
    bushIM.setColorAt(i, gCol.setHSL(0.22 + Math.random() * 0.07, 0.38 + Math.random() * 0.12, 0.26 + Math.random() * 0.10));
    if (p.s >= 0.7) colliders.push({ x: p.x, z: p.z, r: p.s * 1.0 });
    else smallRocks.push({ x: p.x, z: p.z, r: p.s * 1.1, h: p.s * 0.5 });
  });
  bushIM.count = bushPlans.length;
  bushIM.instanceMatrix.needsUpdate = true;
  if (bushIM.instanceColor) bushIM.instanceColor.needsUpdate = true;
  scene.add(bushIM);

  // ============ Soft contact shadows under trees, rocks and bushes (they look planted in the ground) ============
  const blobCv = document.createElement('canvas');
  blobCv.width = 64; blobCv.height = 64;
  const bctx = blobCv.getContext('2d');
  const bgr = bctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  bgr.addColorStop(0, 'rgba(0,0,0,0.85)');
  bgr.addColorStop(0.55, 'rgba(0,0,0,0.38)');
  bgr.addColorStop(1, 'rgba(0,0,0,0)');
  bctx.fillStyle = bgr; bctx.fillRect(0, 0, 64, 64);
  const blobTex = new THREE.CanvasTexture(blobCv);
  const blobGeo = new THREE.PlaneGeometry(1, 1);
  blobGeo.rotateX(-Math.PI / 2);
  const contactPlans = [];
  treePlans.forEach(p => contactPlans.push({ x: p.x, z: p.z, s: 3.0 * p.s }));
  rockPlans.forEach(p => contactPlans.push({ x: p.x, z: p.z, s: p.s * 2.6 }));
  bushPlans.forEach(p => contactPlans.push({ x: p.x, z: p.z, s: p.s * 3.0 }));
  const contactIM = new THREE.InstancedMesh(
    blobGeo,
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    Math.max(1, contactPlans.length)
  );
  const _cUp = new THREE.Vector3(0, 1, 0), _cN = new THREE.Vector3(), _cQ = new THREE.Quaternion();
  contactPlans.forEach((p, i) => {
    const y = getGroundHeight(p.x, p.z);
    const gdx = (getGroundHeight(p.x + 0.8, p.z) - getGroundHeight(p.x - 0.8, p.z)) / 1.6;
    const gdz = (getGroundHeight(p.x, p.z + 0.8) - getGroundHeight(p.x, p.z - 0.8)) / 1.6;
    _cN.set(-gdx, 1, -gdz).normalize();
    _cQ.setFromUnitVectors(_cUp, _cN);
    dummy.position.set(p.x, y + 0.09, p.z);
    dummy.quaternion.copy(_cQ);
    dummy.scale.set(p.s, 1, p.s);
    dummy.updateMatrix();
    contactIM.setMatrixAt(i, dummy.matrix);
  });
  contactIM.count = contactPlans.length;
  contactIM.instanceMatrix.needsUpdate = true;
  contactIM.renderOrder = 1;
  scene.add(contactIM);

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
  addHills(16, 262, 48, 74, 14, 24, 0x6f8f3e);
  addHills(16, 376, 80, 115, 29, 45, 0x86a07a);

  // ============ Standing stones (the POI) ============
  const poiGround = getGroundHeight(POI_X, POI_Z);
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xb7ae9c, vertexColors: true, roughness: 0.95, flatShading: true });
  const STONES = 7;
  for (let k = 0; k < STONES; k++) {
    if (k === 3) continue;
    const ang = (k / STONES) * Math.PI * 2;
    const sx = POI_X + Math.cos(ang) * 5, sz = POI_Z + Math.sin(ang) * 5;
    const sh = k === 0 ? 5 : 4 + Math.random() * 2.5;
    const stone = new THREE.Mesh(withGradient(new THREE.BoxGeometry(1.2, sh, 0.8), 0.62, 1.05), stoneMat);
    stone.receiveShadow = true;
    stone.position.set(sx, getGroundHeight(sx, sz) - 0.3 + sh / 2, sz);
    stone.rotation.set((Math.random() - 0.5) * 0.12, -ang + Math.PI / 2, (Math.random() - 0.5) * 0.12);
    stone.castShadow = true;
    scene.add(stone);
    colliders.push({ x: sx, z: sz, r: 0.8 });
  }
  const lintel = new THREE.Mesh(withGradient(new THREE.BoxGeometry(3.4, 0.8, 1.0), 0.8, 1.05), stoneMat);
  lintel.receiveShadow = true;
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
    arm:    new THREE.MeshStandardMaterial({ color: 0xb5afa0, metalness: 0.35, roughness: 0.50, flatShading: true, envMapIntensity: 0.6 }),
    joint:  new THREE.MeshStandardMaterial({ color: 0x5e584d, metalness: 0.60, roughness: 0.50, flatShading: true }),
    under:  new THREE.MeshStandardMaterial({ color: 0x3a352d, metalness: 0.30, roughness: 0.80, flatShading: true }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x24211e, roughness: 0.9, flatShading: true }),
    dome:   new THREE.MeshStandardMaterial({ color: 0xa6c4d8, metalness: 0.05, roughness: 0.5, flatShading: true, envMapIntensity: 0.55 }),
    black:  new THREE.MeshStandardMaterial({ color: 0x141210, roughness: 0.70, flatShading: true }),
    copper: new THREE.MeshStandardMaterial({ color: 0x8a5a34, metalness: 0.30, roughness: 0.60, flatShading: true }),
    crate:  new THREE.MeshStandardMaterial({ color: 0x4c463a, roughness: 0.80, flatShading: true }),
    glow:   new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffeeaa, emissiveIntensity: 1.6, flatShading: true }),
    tail:   new THREE.MeshStandardMaterial({ color: 0xff3322, emissive: 0xff2211, emissiveIntensity: 0.9, flatShading: true }),
    tailHot: new THREE.MeshStandardMaterial({ color: 0xffc8bb, emissive: 0xff6a55, emissiveIntensity: 1.4 }),
    revLamp: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xdfeeff, emissiveIntensity: 0.1 }),
    amber:   new THREE.MeshStandardMaterial({ color: 0xffa020, emissive: 0xff8a00, emissiveIntensity: 0.5 }),
    headHot: new THREE.MeshStandardMaterial({ color: 0xe8fbff, emissive: 0xbfefff, emissiveIntensity: 1.8 }),
    hullS: new THREE.MeshStandardMaterial({ color: 0x8fa1ad, metalness: 0.35, roughness: 0.45, envMapIntensity: 1.1, flatShading: true }),
    deckS: new THREE.MeshStandardMaterial({ color: 0xa8b8c2, metalness: 0.30, roughness: 0.45, envMapIntensity: 1.1, flatShading: true }),
    tanS:  new THREE.MeshStandardMaterial({ color: 0xb5a488, metalness: 0.15, roughness: 0.60, flatShading: true }),
    armS:  new THREE.MeshStandardMaterial({ color: 0xb8b2a2, metalness: 0.35, roughness: 0.50, envMapIntensity: 0.6, flatShading: true }),
    darkS: new THREE.MeshStandardMaterial({ color: 0x2a2723, metalness: 0.30, roughness: 0.65, flatShading: true }),
    tread: new THREE.MeshStandardMaterial({ color: 0x5a4e42, roughness: 0.85, flatShading: true })
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
  partRB('deckS', 0, 1.40, 0.30, 1.75, 0.30, 2.25, 0.12);                 // upper deck
  partRB('hullS', 0, 1.02, -1.18, 1.95, 0.50, 0.75, 0.20, -0.38, 0, 0);   // sloped nose
  partRB('darkS', 0, 0.62, 0.05, 1.85, 0.22, 2.10, 0.08);                 // skid plate
  partRB('tanS', -1.14, 1.02, 0.05, 0.14, 0.50, 1.50, 0.06);              // side armor
  partRB('tanS',  1.14, 1.02, 0.05, 0.14, 0.50, 1.50, 0.06);
  partRB('hullS', 0, 1.0, 1.2, 1.95, 0.55, 0.20, 0.08);                   // rear plate
  for (let i = 0; i < 4; i++) partRB('darkS', 0, 0.86 + i * 0.1, 1.31, 1.05, 0.05, 0.03, 0.01); // vent slats

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
    const px = side * 1.08;
    partRB('hullS', side * 1.05, 1.42, -0.25, 0.56, 0.18, 0.46, 0.05);
    partRB('tanS', px, 1.62, -0.25, 0.44, 0.55, 0.55, 0.1);
    partRB('darkS', px, 1.92, -0.25, 0.40, 0.1, 0.46, 0.02);
    for (let j = -1.5; j <= 1.5; j++) { partRB('armS', px + j * 0.09, 1.975, -0.25, 0.022, 0.02, 0.44, 0.004); partRB('armS', px, 1.975, -0.25 + j * 0.1, 0.38, 0.02, 0.022, 0.004); }
    partDisc('darkS', px, 1.66, -0.54, 0.12, 0.06, 0, 0, 1, 12);
    partDisc('armS', px, 1.66, -0.56, 0.06, 0.03, 0, 0, 1, 10);
  });

  // ---- Rear equipment: black case, tan backpack, antenna ----
  partRB('darkS', -0.5, 1.775, 1.16, 0.8, 0.45, 0.46, 0.08);
  partRB('armS', -0.5, 2.02, 1.16, 0.5, 0.04, 0.34, 0.015);
  partDisc('tanS', 0.34, 1.85, 1.16, 0.17, 0.6, 0, 1, 0, 12);
  partDisc('tanS', 0.68, 1.85, 1.16, 0.17, 0.6, 0, 1, 0, 12);
  partDisc('armS', 0.34, 2.17, 1.16, 0.09, 0.06, 0, 1, 0, 10);
  partDisc('armS', 0.68, 2.17, 1.16, 0.09, 0.06, 0, 1, 0, 10);
  partBeam('joint', -0.72, 2.0, 1.31, -0.72, 2.95, 1.31, 0.035);
  partDisc('glow', -0.72, 2.97, 1.31, 0.05, 0.05, 0, 1, 0, 8);
  partBeam('joint', -0.35, 2.04, 0.5, -0.35, 2.25, 0.5, 0.05);
  partDisc('armS', -0.35, 2.3, 0.5, 0.26, 0.04, 0.2, 1, -0.5, 14);

  // ---- Suspension brackets: mounted ON the outside of the hull (never buried) ----
  // The arms and air springs themselves are dynamic (see updateSuspension) and follow each wheel.
  const WHEEL_R = 0.84;     // outer radius of the tire incl. teeth
  const TRACK = 1.95;      // wheel centre distance from the body centre line (a bit wider so the suspension is visible)
  const CAP_TIP = TRACK - 0.45;   // inner end of each hub cap
  const wheelSlots = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  wheelSlots.forEach(([sx, sz]) => {
    partRB('darkS', sx * 0.80, 1.60, sz * 0.74, 0.34, 0.12, 0.38, 0.03);
    partDisc('darkS', sx * 0.80, 1.64, sz * 0.74, 0.17, 0.38, 0, 0, 1, 8);   // hinge knuckle   // upper mount, sits on top of the deck
    partRB('darkS', sx * 1.25, 0.86, sz * 0.5, 0.12, 0.28, 0.38, 0.03);
    partDisc('darkS', sx * 1.29, 0.86, sz * 0.5, 0.15, 0.38, 0, 0, 1, 8);   // hinge knuckle   // lower mount, bolted to the side armor
    partRB('darkS', sx * 1.14, 1.31, sz * 0.40, 0.16, 0.09, 0.22, 0.02);   // air-spring mount, on top of the side armor
  });

  // ---- Copper cables ----
  const cable1 = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.95, 1.62, -0.35), new THREE.Vector3(-0.4, 1.5, -0.95),
    new THREE.Vector3(0.4, 1.5, -0.95), new THREE.Vector3(0.95, 1.62, -0.35)
  ]);
  part(new THREE.TubeGeometry(cable1, 16, 0.03, 5), new THREE.Matrix4(), 'copper');
  const cable3 = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.1, 1.72, 1.16), new THREE.Vector3(0.05, 1.62, 1.16),
    new THREE.Vector3(0.2, 1.66, 1.16)
  ]);
  part(new THREE.TubeGeometry(cable3, 12, 0.022, 5), new THREE.Matrix4(), 'copper');

  // ---- Lights ----
  // Angry headlights: slanted LED slits with a brow line, a dark fang and an amber corner light.
  // (coordinates are on the tilted nose face: lx = across, ox/ov = offset in the face plane, ld = out of the face)
  const NOSE_TILT = -0.38;
  function noseLamp(key, lx, ox, ov, ld, w, h, dd, r, roll) {
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const wx = lx + ox * cr - ov * sr;
    const v = ov * cr + ox * sr;
    const zl = -(0.375 + ld);
    const wy = 1.02 + v * Math.cos(NOSE_TILT) - zl * Math.sin(NOSE_TILT);
    const wz = -1.18 + v * Math.sin(NOSE_TILT) + zl * Math.cos(NOSE_TILT);
    partRB(key, wx, wy, wz, w, h, dd, r, NOSE_TILT, 0, roll);
  }
  [-1, 1].forEach(s => {
    const lx = s * 0.64, roll = s * 0.3;
    noseLamp('darkS', lx, 0, 0, 0.02, 0.58, 0.25, 0.07, 0.05, roll);                 // housing
    noseLamp('headHot', lx, 0, -0.01, 0.06, 0.48, 0.06, 0.03, 0.012, roll);            // main LED slit
    noseLamp('headHot', lx, 0, 0.085, 0.06, 0.40, 0.025, 0.03, 0.008, roll);           // brow line
    noseLamp('headHot', lx, s * 0.08, -0.085, 0.06, 0.30, 0.025, 0.03, 0.008, roll);   // lower accent
    noseLamp('darkS', lx, -s * 0.28, -0.12, 0.05, 0.07, 0.2, 0.05, 0.02, s * 0.5);      // fang
    noseLamp('amber', lx, s * 0.26, 0.02, 0.05, 0.05, 0.12, 0.03, 0.01, roll);          // corner indicator
    partDisc('headHot', s * 0.75, 0.76, -1.72, 0.07, 0.03, 0, 0, 1, 10);               // bumper fog lamp
  });
  partRB('headHot', 0, 0.80, -1.715, 1.1, 0.03, 0.02, 0.01);                          // bumper LED strip
  [-1, 1].forEach(side => {
    const lx = side * 0.8;
    partRB('darkS', lx, 1.04, 1.325, 0.42, 0.28, 0.06, 0.04);          // housing frame
    partRB('tail', lx, 1.04, 1.36, 0.34, 0.2, 0.04, 0.05);             // red lens
    for (let j = 0; j < 3; j++) partRB('tailHot', lx, 1.11 - j * 0.07, 1.385, 0.28, 0.025, 0.02, 0.008); // LED strips
    partRB('amber', lx, 1.225, 1.36, 0.2, 0.04, 0.04, 0.015);          // turn signal
    partRB('revLamp', lx, 0.885, 1.36, 0.16, 0.06, 0.04, 0.02);        // reverse lamp
  });
  partRB('tailHot', 0, 1.22, 1.32, 1.0, 0.03, 0.03, 0.01);              // light bar between the lamps

  const haloCv = document.createElement('canvas');
  haloCv.width = 64; haloCv.height = 64;
  const hc = haloCv.getContext('2d');
  const hg = hc.createRadialGradient(32, 32, 2, 32, 32, 32);
  hg.addColorStop(0, 'rgba(255,90,70,0.9)');
  hg.addColorStop(0.4, 'rgba(255,50,40,0.35)');
  hg.addColorStop(1, 'rgba(255,40,30,0)');
  hc.fillStyle = hg; hc.fillRect(0, 0, 64, 64);
  const haloTex = new THREE.CanvasTexture(haloCv);
  haloTex.colorSpace = THREE.SRGBColorSpace;
  const tailHalos = [-1, 1].map(side => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.4, fog: false
    }));
    s.position.set(side * 0.8, 1.04, 1.45);
    s.scale.set(0.95, 0.7, 1);
    rover.add(s);
    return s;
  });

  // cool white glow in front of the headlights
  const fhCv = document.createElement('canvas');
  fhCv.width = 64; fhCv.height = 64;
  const fhc = fhCv.getContext('2d');
  const fhg = fhc.createRadialGradient(32, 32, 2, 32, 32, 32);
  fhg.addColorStop(0, 'rgba(235,250,255,0.95)');
  fhg.addColorStop(0.4, 'rgba(150,215,255,0.35)');
  fhg.addColorStop(1, 'rgba(120,200,255,0)');
  fhc.fillStyle = fhg; fhc.fillRect(0, 0, 64, 64);
  const fhTex = new THREE.CanvasTexture(fhCv);
  fhTex.colorSpace = THREE.SRGBColorSpace;
  const frontHalos = [-1, 1].map(side => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: fhTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.4, fog: false
    }));
    s.position.set(side * 0.64, 0.88, -1.72);
    s.scale.set(1.0, 0.6, 1);
    rover.add(s);
    return s;
  });
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
    const carcass = new THREE.CylinderGeometry(0.62, 0.62, 0.74, 18);
    carcass.rotateZ(Math.PI / 2);
    // Grip teeth: two staggered rows of angled (herringbone) lugs + knobs on both sidewalls
    const tp = [];
    const N = 14;
    for (let i = 0; i < N; i++) {
      for (let row = 0; row < 2; row++) {
        const a = ((i + row * 0.5) / N) * Math.PI * 2;
        const sgn = row === 0 ? 1 : -1;
        const lug = new RoundedBoxGeometry(0.34, 0.28, 0.3, 1, 0.04);
        lug.rotateY(sgn * 0.45);
        lug.translate(sgn * 0.19, 0.72, 0);
        lug.applyMatrix4(new THREE.Matrix4().makeRotationX(a));
        tp.push(lug);
      }
    }
    for (let i = 0; i < 10; i++) {
      for (let s = 0; s < 2; s++) {
        const sgn = s === 0 ? 1 : -1;
        const a = ((i + s * 0.5) / 10) * Math.PI * 2;
        const knob = new RoundedBoxGeometry(0.09, 0.24, 0.22, 1, 0.03);
        knob.translate(sgn * 0.385, 0.5, 0);
        knob.applyMatrix4(new THREE.Matrix4().makeRotationX(a));
        tp.push(knob);
      }
    }
    const treads = mergeGeometries(tp, false);
    const hp = [];
    const hub = new THREE.CylinderGeometry(0.4, 0.4, 0.82, 10); hub.rotateZ(Math.PI / 2); hp.push(hub);
    const cap = new THREE.CylinderGeometry(0.2, 0.2, 0.9, 8); cap.rotateZ(Math.PI / 2); hp.push(cap);
    for (let s = 0; s < 2; s++) {
      const ring = new THREE.TorusGeometry(0.47, 0.045, 6, 18);
      ring.rotateY(Math.PI / 2);
      ring.translate((s === 0 ? 1 : -1) * 0.385, 0, 0);
      hp.push(ring);
    }
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
  const hubJointGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.2, 8);
  hubJointGeo.rotateZ(Math.PI / 2);
  const rodGeo = new THREE.CylinderGeometry(0.055, 0.055, 1, 6);
  rodGeo.rotateX(Math.PI / 2);

  const suspension = wheelSlots.map(([sx, sz], i) => {
    const rod = new THREE.Mesh(rodGeo, MATS.darkS); rod.castShadow = true; rover.add(rod);
    const spring = new THREE.Mesh(springGeo, MATS.armS); spring.castShadow = true; rover.add(spring);
    const joint = new THREE.Mesh(hubJointGeo, MATS.darkS); joint.castShadow = true; rover.add(joint);
    return {
      sx, sz, wheel: wheels[i],
      upper: unitBeam(0.34, 0.2, MATS.armS, 0.05, true),
      lower: unitBeam(0.32, 0.17, MATS.armS, 0.05, true),
      rod, spring, joint,
      U: new THREE.Vector3(sx * 0.80, 1.62, sz * 0.74),
      L: new THREE.Vector3(sx * 1.28, 0.86, sz * 0.5),
      T: new THREE.Vector3(sx * 1.14, 1.34, sz * 0.40)
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
      _Bp.lerpVectors(q.L, _Hb, 0.5); _Bp.y += 0.1; _Bp.z = q.sz * 0.62;
      placeBeam(q.spring, q.T, _Bp);
      placeBeam(q.rod, q.T, _Bp);
      q.joint.position.set(q.sx * CAP_TIP, wy, q.sz * 1.0);
    }
  }
  updateSuspension();

  const headLight = new THREE.SpotLight(0xe6f4ff, 2.4, 18, Math.PI / 6, 0.35);
  headLight.position.set(0, 1.0, -1.2);
  headLight.target.position.set(0, 0, -12);
  rover.add(headLight); rover.add(headLight.target);

  rover.traverse(o => { if (o.isMesh && o.material !== OUTLINE_MAT) o.receiveShadow = true; });
  const roverBlob = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.7, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })
  );
  roverBlob.scale.set(5.4, 1, 6.2);
  roverBlob.position.set(0, -0.03, 0.05);
  roverBlob.renderOrder = 2;
  rover.add(roverBlob);
  scene.add(rover);

  // ============ Controls ============
  const keys = { forward: false, backward: false, left: false, right: false };
  document.querySelectorAll('.ctrl-round').forEach(btn => {
    const key = btn.dataset.key;
    const on = (e) => { if (e) e.preventDefault(); keys[key] = true; btn.classList.add('active'); autoFS(); initAudio(); };
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

  // ============ Sound (synthesized in the browser, no audio files needed) ============
  const sunGlowEl = document.getElementById('sun-glow');
  let actx = null, master = null, soundOn = true, noiseBuf = null, eng = null, lastThud = 0;
  function initAudio() {
    if (actx) { if (actx.state === 'suspended' && soundOn) actx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      actx = new AC();
      master = actx.createGain();
      master.gain.value = soundOn ? 0.9 : 0;
      const comp = actx.createDynamicsCompressor();
      master.connect(comp); comp.connect(actx.destination);

      const len = Math.floor(actx.sampleRate * 2);
      noiseBuf = actx.createBuffer(1, len, actx.sampleRate);
      const nd = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1;

      // Motor: saw + sub square through a low-pass filter, plus a thin electric whine
      const bus = actx.createGain(); bus.gain.value = 0.0;
      const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; lp.Q.value = 0.9;
      const o1 = actx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 60;
      const o2 = actx.createOscillator(); o2.type = 'square'; o2.frequency.value = 30;
      const g2 = actx.createGain(); g2.gain.value = 0.55;
      o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(bus); bus.connect(master);
      const o3 = actx.createOscillator(); o3.type = 'triangle'; o3.frequency.value = 240;
      const whine = actx.createGain(); whine.gain.value = 0;
      o3.connect(whine); whine.connect(master);
      // engine "pulse"
      const lfo = actx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 8;
      const lfoG = actx.createGain(); lfoG.gain.value = 0.035;
      lfo.connect(lfoG); lfoG.connect(bus.gain);
      o1.start(); o2.start(); o3.start(); lfo.start();

      // Wheels on ground (gravel on the trail, swish on grass)
      const ns = actx.createBufferSource(); ns.buffer = noiseBuf; ns.loop = true;
      const nf = actx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 500; nf.Q.value = 0.7;
      const ng = actx.createGain(); ng.gain.value = 0;
      ns.connect(nf); nf.connect(ng); ng.connect(master); ns.start();

      // Soft wind ambience
      const ws = actx.createBufferSource(); ws.buffer = noiseBuf; ws.loop = true; ws.playbackRate.value = 0.6;
      const wf = actx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 420;
      const wg = actx.createGain(); wg.gain.value = 0.05;
      const wl = actx.createOscillator(); wl.frequency.value = 0.15;
      const wlg = actx.createGain(); wlg.gain.value = 0.025;
      wl.connect(wlg); wlg.connect(wg.gain); wl.start();
      ws.connect(wf); wf.connect(wg); wg.connect(master); ws.start();

      eng = { bus, lp, o1, o2, o3, whine, lfo, nf, ng };
      if (actx.state === 'suspended') actx.resume();
    } catch (e) { actx = null; }
  }
  ['touchend', 'pointerup', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, initAudio, true));
  document.addEventListener('visibilitychange', () => {
    if (!actx) return;
    if (document.hidden) actx.suspend(); else if (soundOn) actx.resume();
  });
  const btnSound = document.getElementById('btn-sound');
  if (btnSound) btnSound.addEventListener('click', () => {
    soundOn = !soundOn;
    btnSound.classList.toggle('off', !soundOn);
    initAudio();
    if (master) master.gain.setTargetAtTime(soundOn ? 0.9 : 0, actx.currentTime, 0.05);
    if (actx && soundOn && actx.state === 'suspended') actx.resume();
  });
  function updateAudio(speedNorm, throttle, onPath) {
    if (!actx || !eng || actx.state !== 'running') return;
    const t0 = actx.currentTime;
    const rpm = 0.15 + speedNorm * 0.85 + (throttle ? 0.05 : 0);
    eng.o1.frequency.setTargetAtTime(55 + rpm * 120, t0, 0.07);
    eng.o2.frequency.setTargetAtTime(27 + rpm * 60, t0, 0.07);
    eng.o3.frequency.setTargetAtTime(220 + rpm * 620, t0, 0.07);
    eng.lp.frequency.setTargetAtTime(330 + rpm * 900 + (throttle ? 150 : 0), t0, 0.1);
    eng.bus.gain.setTargetAtTime(0.10 + rpm * 0.17 + (throttle ? 0.04 : 0), t0, 0.1);
    eng.whine.gain.setTargetAtTime(speedNorm * 0.02, t0, 0.1);
    eng.lfo.frequency.setTargetAtTime(7 + rpm * 26, t0, 0.1);
    eng.nf.frequency.setTargetAtTime(onPath ? 750 + speedNorm * 900 : 380 + speedNorm * 320, t0, 0.15);
    eng.ng.gain.setTargetAtTime(speedNorm * (onPath ? 0.22 : 0.11), t0, 0.12);
  }
  function thud(strength) {
    if (!actx || actx.state !== 'running' || !soundOn) return;
    const now = actx.currentTime;
    if (now - lastThud < 0.25) return;
    lastThud = now;
    const s = actx.createBufferSource(); s.buffer = noiseBuf;
    const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220;
    const g = actx.createGain();
    g.gain.setValueAtTime(0.5 * Math.min(1, 0.4 + strength), now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(now); s.stop(now + 0.3);
  }

  // ============ Dust kicked up by the wheels ============
  const DUST_N = 80;
  const dustPos = new Float32Array(DUST_N * 3), dustLife = new Float32Array(DUST_N), dustSize = new Float32Array(DUST_N);
  const dustVel = new Float32Array(DUST_N * 3);
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute('aLife', new THREE.BufferAttribute(dustLife, 1));
  dustGeo.setAttribute('aSize', new THREE.BufferAttribute(dustSize, 1));
  const dustMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uCol: { value: new THREE.Color(0xc9a678) }, uPR: { value: 1 } },
    vertexShader: `
      attribute float aLife; attribute float aSize; uniform float uPR; varying float vA;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * (1.0 + (1.0 - aLife) * 1.8) * (260.0 / max(0.5, -mv.z)) * uPR;
        vA = aLife;
      }`,
    fragmentShader: `
      uniform vec3 uCol; varying float vA;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = vec4(uCol, smoothstep(0.5, 0.05, d) * vA * 0.38);
      }`
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  scene.add(dust);
  let dustNext = 0, dustAcc = 0;
  const dustTrail = new THREE.Color(0xc9a678), dustGrass = new THREE.Color(0x9fb06a);
  function updateDust(dt, spd, rx, rz, cosR, sinR, onPath) {
    dustMat.uniforms.uPR.value = renderer.getPixelRatio();
    dustMat.uniforms.uCol.value.lerp(onPath ? dustTrail : dustGrass, 0.1);
    if (spd > 1.2) {
      dustAcc += spd * dt * 5;
      while (dustAcc >= 1) {
        dustAcc -= 1;
        const i = dustNext; dustNext = (dustNext + 1) % DUST_N;
        const sx = Math.random() < 0.5 ? -1 : 1;
        const lx = sx * 1.95, lz = 1.0;
        const wx = rx + lx * cosR + lz * sinR + (Math.random() - 0.5) * 0.4;
        const wz = rz - lx * sinR + lz * cosR + (Math.random() - 0.5) * 0.4;
        dustPos[i * 3] = wx; dustPos[i * 3 + 1] = getGroundHeight(wx, wz) + 0.15; dustPos[i * 3 + 2] = wz;
        dustVel[i * 3] = (Math.random() - 0.5) * 0.6 + sinR * spd * 0.12;
        dustVel[i * 3 + 1] = 0.5 + Math.random() * 0.7;
        dustVel[i * 3 + 2] = (Math.random() - 0.5) * 0.6 + cosR * spd * 0.12;
        dustLife[i] = 1; dustSize[i] = 0.5 + Math.random() * 0.5;
      }
    }
    for (let i = 0; i < DUST_N; i++) {
      if (dustLife[i] <= 0) continue;
      dustLife[i] -= dt * 1.1;
      if (dustLife[i] < 0) dustLife[i] = 0;
      dustPos[i * 3] += dustVel[i * 3] * dt;
      dustPos[i * 3 + 1] += dustVel[i * 3 + 1] * dt;
      dustPos[i * 3 + 2] += dustVel[i * 3 + 2] * dt;
      dustVel[i * 3 + 1] *= 0.97;
    }
    dustGeo.attributes.position.needsUpdate = true;
    dustGeo.attributes.aLife.needsUpdate = true;
    dustGeo.attributes.aSize.needsUpdate = true;
  }

  // ============ Minimap ============
  const mmCanvas = document.getElementById('minimap-canvas');
  const mmCtx = mmCanvas.getContext('2d');
  const mmRover = document.getElementById('minimap-rover');
  let currentRot = 0;
  let mmTimer = 0;

  function drawMinimap() {
    const w = mmCanvas.width, h = mmCanvas.height;
    mmCtx.clearRect(0, 0, w, h);
    mmCtx.fillStyle = 'rgba(12,26,26,0.80)'; mmCtx.fillRect(0, 0, w, h);
    mmCtx.fillStyle = 'rgba(30,80,50,0.35)'; mmCtx.fillRect(0, 0, w * 0.3, h * 0.3);
    mmCtx.fillStyle = 'rgba(170,130,70,0.30)'; mmCtx.fillRect(w * 0.7, 0, w * 0.3, h * 0.3);
    mmCtx.fillStyle = 'rgba(190,220,235,0.26)'; mmCtx.fillRect(0, h * SNOW_NZ, w * SNOW_NX, h * (1 - SNOW_NZ));
    mmCtx.fillStyle = 'rgba(90,110,60,0.34)'; mmCtx.fillRect(w * 0.7, h * 0.7, w * 0.3, h * 0.3);

    mmCtx.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      mmCtx.strokeStyle = i === 4 ? 'rgba(126,240,255,0.30)' : 'rgba(126,240,255,0.12)';
      mmCtx.beginPath(); mmCtx.moveTo(i * w / 8, 0); mmCtx.lineTo(i * w / 8, h); mmCtx.stroke();
      mmCtx.beginPath(); mmCtx.moveTo(0, i * h / 8); mmCtx.lineTo(w, i * h / 8); mmCtx.stroke();
    }

    mmCtx.save();
    mmCtx.strokeStyle = 'rgba(255,214,150,0.9)'; mmCtx.lineWidth = 2.6;
    mmCtx.shadowColor = 'rgba(255,200,120,0.8)'; mmCtx.shadowBlur = 5;
    mmCtx.beginPath();
    for (let k = 0; k <= 80; k++) {
      const zz = -HALF + (k / 80) * WORLD_SIZE;
      const px = ((pathCenter(zz) + HALF) / WORLD_SIZE) * w, py = (k / 80) * h;
      if (k === 0) mmCtx.moveTo(px, py); else mmCtx.lineTo(px, py);
    }
    mmCtx.stroke();
    mmCtx.restore();

    const ppx = ((POI_X + HALF) / WORLD_SIZE) * w, ppy = ((POI_Z + HALF) / WORLD_SIZE) * h;
    mmCtx.save();
    mmCtx.shadowColor = '#7ef0ff'; mmCtx.shadowBlur = 8;
    mmCtx.strokeStyle = '#9ff1ff'; mmCtx.lineWidth = 2;
    mmCtx.beginPath(); mmCtx.moveTo(ppx, ppy - 6); mmCtx.lineTo(ppx + 6, ppy); mmCtx.lineTo(ppx, ppy + 6); mmCtx.lineTo(ppx - 6, ppy); mmCtx.closePath(); mmCtx.stroke();
    mmCtx.fillStyle = 'rgba(126,240,255,0.55)';
    mmCtx.beginPath(); mmCtx.moveTo(ppx, ppy - 3); mmCtx.lineTo(ppx + 3, ppy); mmCtx.lineTo(ppx, ppy + 3); mmCtx.lineTo(ppx - 3, ppy); mmCtx.closePath(); mmCtx.fill();
    mmCtx.restore();

    const rx = ((rover.position.x + HALF) / WORLD_SIZE) * w;
    const ry = ((rover.position.z + HALF) / WORLD_SIZE) * h;
    const ang = Math.atan2(-Math.cos(currentRot), -Math.sin(currentRot));
    const cone = mmCtx.createRadialGradient(rx, ry, 2, rx, ry, 44);
    cone.addColorStop(0, 'rgba(126,240,255,0.50)');
    cone.addColorStop(1, 'rgba(126,240,255,0)');
    mmCtx.fillStyle = cone;
    mmCtx.beginPath(); mmCtx.moveTo(rx, ry); mmCtx.arc(rx, ry, 44, ang - 0.55, ang + 0.55); mmCtx.closePath(); mmCtx.fill();
    mmCtx.save();
    mmCtx.translate(rx, ry); mmCtx.rotate(ang + Math.PI / 2); mmCtx.scale(1.35, 1.35);
    mmCtx.shadowColor = '#7ef0ff'; mmCtx.shadowBlur = 8;
    mmCtx.fillStyle = '#7ef0ff'; mmCtx.strokeStyle = '#06222a'; mmCtx.lineWidth = 1.5;
    mmCtx.beginPath(); mmCtx.moveTo(0, -8); mmCtx.lineTo(5.5, 6); mmCtx.lineTo(0, 3); mmCtx.lineTo(-5.5, 6); mmCtx.closePath();
    mmCtx.stroke(); mmCtx.fill();
    mmCtx.restore();
  }

  // ============ Day-night ============
  let gameTime = 0.07;
  let dayFactor = 1;
  const _shLd = new THREE.Vector3(), _shLr = new THREE.Vector3(), _shLu = new THREE.Vector3(), _shUp = new THREE.Vector3(0, 1, 0), _shT = new THREE.Vector3();
  const zenDay = new THREE.Color(0x6fb2e6), horDay = new THREE.Color(0xf6e2b8);
  const zenDusk = new THREE.Color(0x4a3a6a), horDusk = new THREE.Color(0xff9a5a);
  const zenNight = new THREE.Color(0x070c22), horNight = new THREE.Color(0x141a34);
  const tmpA = new THREE.Color(), tmpB = new THREE.Color();
  let lastTimeText = '', lastBiomeText = '';

  function updateDayNight(dt) {
    gameTime = (gameTime + dt * 0.0004) % 1;
    const ang = gameTime * Math.PI * 2;
    const sh = Math.sin(ang);
    _shLd.set(Math.cos(ang) * 80, Math.max(sh * 80, -25), -12).normalize();
    skyUniforms.sunDir.value.copy(_shLd);
    // keep the shadow frustum centred on the rover, snapped to shadow-map texels (no shimmering edges)
    _shLr.crossVectors(_shUp, _shLd).normalize();
    _shLu.crossVectors(_shLd, _shLr);
    const _tx = rover.position.x, _ty = rover.position.y, _tz = rover.position.z;
    const _texel = (2 * SHADOW_R) / sunLight.shadow.mapSize.width;
    const _pr = Math.round((_tx * _shLr.x + _ty * _shLr.y + _tz * _shLr.z) / _texel) * _texel;
    const _pu = Math.round((_tx * _shLu.x + _ty * _shLu.y + _tz * _shLu.z) / _texel) * _texel;
    const _pd = _tx * _shLd.x + _ty * _shLd.y + _tz * _shLd.z;
    _shT.set(0, 0, 0).addScaledVector(_shLr, _pr).addScaledVector(_shLu, _pu).addScaledVector(_shLd, _pd);
    sunLight.target.position.copy(_shT);
    sunLight.position.copy(_shT).addScaledVector(_shLd, 80);

    const day = THREE.MathUtils.smoothstep(sh, 0.05, 0.3);
    dayFactor = day;
    const dusk = 1 - THREE.MathUtils.smoothstep(sh, -0.25, 0.05);

    tmpA.copy(zenNight).lerp(zenDusk, dusk);
    tmpB.copy(tmpA).lerp(zenDay, day);
    skyUniforms.zenith.value.copy(tmpB);
    tmpA.copy(horNight).lerp(horDusk, dusk);
    tmpB.copy(tmpA).lerp(horDay, day);
    skyUniforms.horizon.value.copy(tmpB);

    scene.fog.color.copy(skyUniforms.horizon.value);
    skyUniforms.cloudAmt.value = 0.15 + day * 0.85;
    skyUniforms.cloudCol.value.setRGB(0.25 + dusk * 0.55 + day * 0.72, 0.25 + dusk * 0.30 + day * 0.68, 0.35 + dusk * 0.20 + day * 0.55);
    if (sunGlowEl) sunGlowEl.style.opacity = (day * 0.95).toFixed(2);
    sunLight.intensity = 0.4 + day * 2.2 + dusk * 0.6;
    sunLight.color.setRGB(1.0, 0.75 + day * 0.15, 0.55 + day * 0.25);
    ambientLight.intensity = 0.12 + day * 0.2;
    hemiLight.intensity = 0.25 + day * 0.5;

    const hours = Math.floor(gameTime * 24);
    const mins = Math.floor((gameTime * 24 - hours) * 60);
    const icon = day > 0.5 ? '🌞' : (dusk > 0.5 ? '🌅' : '🌙');
    const txt = icon + ' ' + String(hours).padStart(2, '0') + ':' + String(mins).padStart(2, '0');
    if (txt !== lastTimeText) {
      lastTimeText = txt;
      document.getElementById('time-text').textContent = txt.split(' ')[1];
      document.getElementById('time-display').dataset.night = (icon === '🌙') ? '1' : '0';
    }
  }

  // ============ Performance guard ============
  let downgraded = false;
  function downgradeGraphics() {
    if (downgraded) return;
    downgraded = true;
    bloomPass.enabled = false;
    if (sunLight.shadow.map) { sunLight.shadow.map.dispose(); sunLight.shadow.map = null; }
    sunLight.shadow.mapSize.set(1024, 1024);
    shadowDirty = true;
  }
  // (automatic quality drop disabled - always full quality)

  // ============ Smooth adaptive resolution: full quality on fast phones, fluid on slower ones ============
  let PR_MAX = Math.min(window.devicePixelRatio, 2);
  let PR_MIN = Math.min(PR_MAX, 1.0);
  let curPR = PR_MAX;
  // IMPORTANT (black-flicker fix): the <canvas> itself is kept at a FIXED pixel ratio (PR_MAX).
  // Resizing a WebGL canvas clears its buffer, and doing it right after composer.render() made the
  // browser show one empty (black) frame every time the adaptive resolution changed.
  // So adaptive resolution only resizes the composer's internal render targets (never the canvas).
  function applyPR(r) {
    curPR = r;
    composer.setPixelRatio(r);
    composer.setSize(window.innerWidth, window.innerHeight);
    bloomPass.setSize(window.innerWidth / 2, window.innerHeight / 2);
  }
  const ADAPTIVE_RES = false;   // resolution is ALWAYS kept at maximum (never lowered automatically)
  let shadowDirty = false;   // force a shadow-map redraw on the next frame (after the map was disposed)
  renderer.info.autoReset = false;
  let lastFrameMs = 0, emaMs = 16.7, nextEvalMs = 0, adaptWarm = 3, fastWins = 0, veryLow = 0, ceilPR = 99, ceilUntil = 0, overlayAt = 0;

  // Hidden FPS panel: tap the clock 3 times quickly to show / hide it
  const perfEl = document.createElement('div');
  perfEl.style.cssText = 'position:fixed;left:50%;top:6px;transform:translateX(-50%);z-index:99998;padding:3px 8px;background:rgba(0,0,0,0.6);color:#9fffb5;font:11px/1.3 monospace;border-radius:6px;pointer-events:none;display:none;white-space:nowrap;';
  document.body.appendChild(perfEl);
  let perfOn = false, perfTaps = [];
  document.getElementById('time-display').addEventListener('click', () => {
    const nw = performance.now();
    perfTaps = perfTaps.filter(x => nw - x < 900);
    perfTaps.push(nw);
    if (perfTaps.length >= 3) { perfTaps = []; setPerf(!perfOn); }
  });

  // Arrow at the screen edge that points to the POI when it is out of view
  const poiArrow = document.createElement('div');
  poiArrow.style.cssText = 'position:fixed;left:0;top:0;z-index:55;pointer-events:none;display:none;width:44px;height:52px;text-align:center;font:700 10px sans-serif;color:#cfeeff;text-shadow:0 1px 3px #000;';
  poiArrow.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30" style="display:block;margin:0 auto;filter:drop-shadow(0 0 4px #7ef0ff)"><path d="M12 2 L21 20 L12 15 L3 20 Z" fill="#7ef0ff" stroke="#06222a" stroke-width="1.2"/></svg><span></span>';
  document.body.appendChild(poiArrow);
  const poiArrowSvg = poiArrow.querySelector('svg'), poiArrowTxt = poiArrow.querySelector('span');
  const _poiV = new THREE.Vector3();

  // ============ Settings: graphics quality (High / Medium / Low) + FPS counter ============
  const QUALITY = {
    high:   { pr: 2.0, bloom: true,  shadow: 2048, shR: 40, half: false, grassQ: 1.0,  grassD: 1.0, far: 1e9, bushes: true,
              note: 'Best looks. The resolution adjusts itself if the phone struggles.' },
    medium: { pr: 1.5, bloom: false, shadow: 1024, shR: 40, half: false, grassQ: 0.75, grassD: 0.8, far: 170, bushes: true,
              note: 'Balanced. Slightly softer image, no glow, a bit less grass.' },
    low:    { pr: 1.0, bloom: false, shadow: 1024, shR: 30, half: true,  grassQ: 0.5,  grassD: 0.6, far: 120, bushes: false,
              note: 'Fastest. Soft image, simpler shadows, much less grass.' }
  };
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode: ignore */ } }
  };
  let qualityLevel = 'high';
  function applyQuality(level, save) {
    const q = QUALITY[level] || QUALITY.high;
    if (!QUALITY[level]) level = 'high';
    qualityLevel = level;
    PR_MAX = Math.min(window.devicePixelRatio, q.pr);
    PR_MIN = Math.min(PR_MAX, 1.0);
    ceilPR = 99; ceilUntil = 0; fastWins = 0; veryLow = 0; adaptWarm = 2;
    renderer.setPixelRatio(PR_MAX);   // the only place the canvas is resized (on quality change)
    renderer.setSize(window.innerWidth, window.innerHeight);
    applyPR(PR_MAX);
    bloomPass.enabled = q.bloom;
    downgraded = false;
    if (sunLight.shadow.mapSize.width !== q.shadow) {
      if (sunLight.shadow.map) { sunLight.shadow.map.dispose(); sunLight.shadow.map = null; }
      sunLight.shadow.mapSize.set(q.shadow, q.shadow);
      shadowDirty = true;
    }
    SHADOW_R = q.shR;
    sunLight.shadow.camera.left = -SHADOW_R; sunLight.shadow.camera.right = SHADOW_R;
    sunLight.shadow.camera.top = SHADOW_R; sunLight.shadow.camera.bottom = -SHADOW_R;
    sunLight.shadow.camera.updateProjectionMatrix();
    shadowForceHalf = q.half;
    uGrassQ.value = q.grassQ; uGrassD.value = q.grassD; grassFarMax = q.far;
    bushIM.visible = q.bushes;
    if (save) store.set('roverQuality', level);
    try { renderer.shadowMap.needsUpdate = true; composer.render(); } catch (e) { /* scene not ready yet */ }   // refill the cleared canvas right away
  }
  function setPerf(on) {
    perfOn = on;
    perfEl.style.display = on ? 'block' : 'none';
    const fb = document.getElementById('fps-toggle');
    if (fb) { fb.textContent = on ? 'ON' : 'OFF'; fb.classList.toggle('on', on); }
    store.set('roverFps', on ? '1' : '0');
  }
  {
    const spPanel = document.getElementById('settings-panel');
    const openSp = () => spPanel.classList.add('show');
    const closeSp = () => spPanel.classList.remove('show');
    document.getElementById('btn-settings').addEventListener('click', openSp);
    document.getElementById('sp-close').addEventListener('click', closeSp);
    spPanel.addEventListener('click', (e) => { if (e.target === spPanel) closeSp(); });
    document.getElementById('fps-toggle').addEventListener('click', () => setPerf(!perfOn));
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    bloomPass.setSize(window.innerWidth / 2, window.innerHeight / 2);
    checkOrientation();
    try { renderer.shadowMap.needsUpdate = true; composer.render(); } catch (e) { }   // resize clears the canvas: repaint now
  }
  window.addEventListener('resize', onResize);

  // ============ Health & fuel (the dashboard bars really work) ============
  let health = 100, fuel = 100, repairT = 0, dmgCool = 0, msgT = 0;
  let lowFuelShown = false, emptyShown = false, lastH = -1, lastF = -1;
  const elMsg = document.getElementById('hud-msg');
  const elHp = document.getElementById('bar-health');
  const elEn = document.getElementById('bar-energy');
  const elHealthFill = document.querySelector('.health-fill');
  const elFuelFill = document.querySelector('.fuel-fill');
  const fuelCells = elFuelFill ? Array.from(elFuelFill.children) : [];
  function showMsg(text, secs) {
    if (!elMsg) return;
    elMsg.textContent = text;
    elMsg.classList.add('show');
    msgT = secs;
  }
  function updateVitals(dt, spd, speedNorm, throttle, hit) {
    dmgCool = Math.max(0, dmgCool - dt);
    // crashes damage the rover
    if (hit && spd > 2 && dmgCool <= 0 && repairT <= 0) {
      health = Math.max(0, health - (4 + (spd - 2) * 2.2));
      dmgCool = 0.7;
      if (health <= 0) { repairT = 3; showMsg('ROVER DAMAGED - REPAIRING...', 3); }
    }
    if (repairT > 0) {
      repairT -= dt;
      if (repairT <= 0) health = 40;
    }
    // fuel: burns while driving, slowly recharges (solar) while parked
    if (throttle) fuel -= (0.12 + speedNorm * 0.26) * dt;
    else if (spd < 0.6) {
      fuel += 0.6 * (0.25 + 0.75 * dayFactor) * dt;
      if (repairT <= 0 && health < 100) health = Math.min(100, health + 0.3 * dt);
    }
    fuel = Math.max(0, Math.min(100, fuel));
    if (fuel < 20 && fuel > 0 && !lowFuelShown) { lowFuelShown = true; showMsg('LOW FUEL', 2.5); }
    if (fuel >= 35) { lowFuelShown = false; emptyShown = false; }
    if (fuel <= 0 && !emptyShown) { emptyShown = true; showMsg('OUT OF FUEL - STOP TO RECHARGE', 3.5); }

    if (msgT > 0) { msgT -= dt; if (msgT <= 0 && elMsg) elMsg.classList.remove('show'); }

    const h = Math.round(health), f = Math.round(fuel);
    if (h !== lastH) {
      lastH = h;
      if (elHp) { elHp.style.width = h + '%'; elHp.classList.toggle('low', h < 25); }
      if (elHealthFill) { elHealthFill.style.setProperty('--v', (h / 100).toFixed(2)); elHealthFill.classList.toggle('low', h < 25); }
    }
    if (f !== lastF) {
      lastF = f;
      if (elEn) { elEn.style.width = f + '%'; elEn.classList.toggle('low', f < 20); }
      const on = f <= 0 ? 0 : Math.ceil(f / 100 * fuelCells.length);
      fuelCells.forEach((c, i) => c.classList.toggle('on', i < on));
      if (elFuelFill) elFuelFill.classList.toggle('low', f < 20);
    }
  }

  // ============ Main loop ============
  const clock = new THREE.Clock();
  const maxSpeed = 9.0;
  let velocity = 0, prevVelocity = 0;
  let steerSmooth = 0;          // smoothed steering input (-1..1)
  let camYaw = 0;               // independent smoothed camera yaw
  let wheelSpin = 0, pitch = 0, roll = 0;
  let perfFrames = 0, perfAcc = 0;
  let shadowFrame = 0, shadowHalf = false, shadowForceHalf = false, shadowRetestAt = 0;   // slow phones: redraw the shadow map every 2nd frame
  let camMode = 0, camZoom = 1;   // 0 = behind the rover, 1 = front (like the picture)
  const btnCamView = document.getElementById('cam-view');
  // Drag a finger on empty space to slowly orbit the camera 360 degrees around the rover
  let orbitYaw = 0, orbitPitch = 0, orbitTouch = null, orbitLX = 0, orbitLY = 0, lastOrbitMs = 0;
  const ORBIT_K = 0.0035;
  const orbitEl = renderer.domElement;
  function orbitDrag(x, y) {
    orbitYaw -= (x - orbitLX) * ORBIT_K;
    orbitPitch = THREE.MathUtils.clamp(orbitPitch + (y - orbitLY) * ORBIT_K * 1.1, -0.25, 1.1);
    orbitLX = x; orbitLY = y;
    lastOrbitMs = performance.now();
  }
  orbitEl.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (orbitTouch !== null) return;
    const t0 = e.changedTouches[0];
    orbitTouch = t0.identifier; orbitLX = t0.clientX; orbitLY = t0.clientY;
    lastOrbitMs = performance.now();
  }, { passive: false });
  orbitEl.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t1 of e.changedTouches) if (t1.identifier === orbitTouch) orbitDrag(t1.clientX, t1.clientY);
  }, { passive: false });
  const orbitEnd = (e) => {
    for (const t1 of e.changedTouches) if (t1.identifier === orbitTouch) { orbitTouch = null; lastOrbitMs = performance.now(); }
  };
  orbitEl.addEventListener('touchend', orbitEnd, { passive: true });
  orbitEl.addEventListener('touchcancel', orbitEnd, { passive: true });
  let orbitMouse = false;
  orbitEl.addEventListener('mousedown', (e) => { orbitMouse = true; orbitTouch = -1; orbitLX = e.clientX; orbitLY = e.clientY; });
  window.addEventListener('mousemove', (e) => { if (orbitMouse) orbitDrag(e.clientX, e.clientY); });
  window.addEventListener('mouseup', () => { if (orbitMouse) { orbitMouse = false; orbitTouch = null; lastOrbitMs = performance.now(); } });

  btnCamView.addEventListener('click', () => { camMode = 1 - camMode; btnCamView.classList.toggle('alt', !!camMode); });
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
    if (nx < SNOW_NX && nz > SNOW_NZ) return '❄️ Snowy Zone';
    if (nx > 0.7 && nz > 0.7) return '🌾 Swamp';
    return '🌱 Grassland';
  }

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    uTime.value = t;
    skyUniforms.uT.value = t;

    // ---- Throttle ----
    let target = keys.forward ? maxSpeed : (keys.backward ? -maxSpeed * 0.5 : 0);
    if (repairT > 0) target = 0;            // rover is being repaired
    else if (fuel <= 0) target *= 0.25;     // out of fuel: crawl only
    velocity = THREE.MathUtils.damp(velocity, target, 2.2, dt);
    if (target === 0 && Math.abs(velocity) < 0.02) velocity = 0;

    const spd = Math.abs(velocity);
    const speedNorm = spd / maxSpeed;

    // ---- SMOOTH steering: damped input + speed-sensitive rate ----
    const steerTarget = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
    steerSmooth = THREE.MathUtils.damp(steerSmooth, steerTarget, 6.0, dt);
    if (steerTarget === 0 && Math.abs(steerSmooth) < 0.01) steerSmooth = 0;
    // Car-like steering: turning needs movement, steering angle shrinks with speed, reverse behaves like a real car
    const maxSteerAngle = 0.6 / (1 + spd * 0.25);
    const steerAngle = steerSmooth * maxSteerAngle;
    const WHEELBASE = 2.4;
    currentRot += (velocity * Math.tan(steerAngle) / WHEELBASE) * dt;
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
    if (hit && spd > 2) { velocity *= 0.7; thud(speedNorm); }

    // ---- TRUE 3D SUSPENSION: sample ground under EACH wheel ----
    const rx = rover.position.x, rz = rover.position.z;
    const cosR = Math.cos(currentRot), sinR = Math.sin(currentRot);
    const hw = [0, 0, 0, 0];
    let hF = 0, hB = 0, hL = 0, hR = 0;
    for (let i = 0; i < 4; i++) {
      const w = wheels[i];
      const wx = rx + w.lx * cosR + w.lz * sinR;
      const wz = rz - w.lx * sinR + w.lz * cosR;
      // a wheel is a circle: it rests on the highest point of its rim, so it never sinks on slopes
      let top = -Infinity;
      for (let k = -4; k <= 4; k++) {
        const d = k * WHEEL_R / 4;
        const ch = Math.sqrt(Math.max(0, WHEEL_R * WHEEL_R - d * d));
        for (let l = -1; l <= 1; l++) {
          const lat = l * 0.3;
          const gh = driveHeight(wx - sinR * d + cosR * lat, wz - cosR * d - sinR * lat) + ch;
          if (gh > top) top = gh;
        }
      }
      hw[i] = top - WHEEL_R;
      if (w.lz < 0) hF += hw[i]; else hB += hw[i];
      if (w.lx > 0) hR += hw[i]; else hL += hw[i];
    }
    hF *= 0.5; hB *= 0.5; hL *= 0.5; hR *= 0.5;
    const bodyH = (hw[0] + hw[1] + hw[2] + hw[3]) * 0.25 * 0.6 + Math.max(hw[0], hw[1], hw[2], hw[3]) * 0.4;

    // Body height follows average of wheels (smoothed)
    rover.position.y = THREE.MathUtils.damp(rover.position.y, bodyH + 0.04, (bodyH + 0.04 > rover.position.y) ? 26 : 16, dt);
    if (spd > 0.5) rover.position.y += Math.abs(Math.sin(t * 11)) * 0.015 * speedNorm;

    // Body attitude from the 4 contact points + accel pitch + turn bank
    const accel = (velocity - prevVelocity) / Math.max(dt, 0.0001);
    prevVelocity = velocity;
    const pitchTarget = Math.atan2(hF - hB, 2.0) + THREE.MathUtils.clamp(-accel * 0.022, -0.11, 0.11);
    const rollTarget = Math.atan2(hR - hL, 2 * TRACK) - steerSmooth * speedNorm * 0.10;
    pitch = THREE.MathUtils.damp(pitch, pitchTarget, 7, dt);
    roll = THREE.MathUtils.damp(roll, rollTarget, 7, dt);
    rover.rotation.x = pitch;
    rover.rotation.z = roll;

    // ---- Hull clearance: probe the body footprint, lift the rover if any point would touch the ground ----
    {
      const sP = Math.sin(pitch), sRl = Math.sin(roll);
      const probes = [[-1.0, -1.6], [1.0, -1.6], [-1.0, 1.3], [1.0, 1.3], [0, -1.6], [0, 1.3], [-1.1, 0], [1.1, 0], [0, 0]];
      let lift = 0;
      for (let k = 0; k < probes.length; k++) {
        const px = probes[k][0], pz = probes[k][1];
        const gx2 = rx + px * cosR + pz * sinR;
        const gz2 = rz - px * sinR + pz * cosR;
        const need = driveHeight(gx2, gz2) + 0.06 - (rover.position.y + 0.52 - pz * sP + px * sRl);
        if (need > lift) lift = need;
      }
      if (lift > 0) rover.position.y += lift;
    }

    // Each wheel travels independently (visible suspension compression)
    for (let i = 0; i < 4; i++) {
      const w = wheels[i];
      // wheel centre height in the body's own (pitched/rolled) frame, so a wheel on a rock really sits on top of it
      const wantY = THREE.MathUtils.clamp((((hw[i] + WHEEL_R - rover.position.y) + w.lz * Math.sin(pitch)) / Math.cos(pitch) - w.lx * Math.sin(roll)) / Math.cos(roll), 0.45, 1.95);
      w.y = THREE.MathUtils.damp(w.y, wantY, wantY > w.y ? 34 : 12, dt);
      w.mesh.rotation.x = wheelSpin;
      if (w.lz < 0) {            // front wheels visibly steer
        w.mesh.rotation.order = 'YXZ';
        w.mesh.rotation.y = THREE.MathUtils.clamp(steerAngle, -0.35, 0.35);
      }
      w.mesh.position.y = w.y;
    }

    updateSuspension();
    uRover.value.set(rover.position.x, rover.position.y, rover.position.z);
    updateNearGrass(rover.position.x, rover.position.z);
    const limit = HALF - 6;
    rover.position.x = THREE.MathUtils.clamp(rover.position.x, -limit, limit);
    rover.position.z = THREE.MathUtils.clamp(rover.position.z, -limit, limit);

    const braking = velocity < -0.2 || hit;
    MATS.tail.emissiveIntensity = braking ? 2.6 : 0.9;
    MATS.tailHot.emissiveIntensity = braking ? 3.0 : 1.4;
    MATS.revLamp.emissiveIntensity = velocity < -0.2 ? 2.4 : 0.1;
    tailHalos.forEach(s => { s.material.opacity = braking ? 0.95 : 0.4; });
    const darkness = Math.max(0, 1.6 - sunLight.intensity);
    MATS.headHot.emissiveIntensity = 1.6 + darkness * 1.5;
    frontHalos.forEach(s => { s.material.opacity = Math.min(0.9, 0.25 + darkness * 0.45); });
    const onPathNow = pathMask(rx, rz) > 0.35;
    updateAudio(speedNorm, keys.forward || keys.backward, onPathNow);
    updateDust(dt, spd, rx, rz, cosR, sinR, onPathNow);
    updateVitals(dt, spd, speedNorm, keys.forward || keys.backward, hit);

    const biomeTxt = getBiomeName(rx, rz);
    if (biomeTxt !== lastBiomeText) {
      lastBiomeText = biomeTxt;
      document.getElementById('biome-text').textContent = biomeTxt.replace(/^\S+\s+/, '');
    }

    // ---- Orbit view eases back behind the rover when you drive or let go for a few seconds ----
    if (orbitTouch === null) {
      const drivingNow = keys.forward || keys.backward || keys.left || keys.right;
      if (drivingNow || performance.now() - lastOrbitMs > 4000) {
        orbitYaw = Math.atan2(Math.sin(orbitYaw), Math.cos(orbitYaw));
        orbitYaw = THREE.MathUtils.damp(orbitYaw, 0, 1.6, dt);
        orbitPitch = THREE.MathUtils.damp(orbitPitch, 0, 1.6, dt);
      }
    }

    // ---- Camera with its OWN smoothed yaw (no snap on turns) ----
    let dAng = currentRot - camYaw;
    dAng = Math.atan2(Math.sin(dAng), Math.cos(dAng));
    camYaw += dAng * (1 - Math.exp(-4.0 * dt));
    const cfX = -Math.sin(camYaw), cfZ = -Math.cos(camYaw);

    sky.position.copy(camera.position);
    if (camMode === 0) {
      const camDist = (4.4 + spd * 0.14) * camZoom;
      const camH = (1.9 + spd * 0.05) * camZoom;
      _camPos.set(rx - cfX * camDist, rover.position.y + camH, rz - cfZ * camDist);
      const lookAhead = (2.2 + spd * 0.25) * (1 + Math.cos(orbitYaw)) / 2;
      _look.set(rx + cfX * lookAhead, rover.position.y + 1.3, rz + cfZ * lookAhead);
    } else {
      const camDist = (4.6 + spd * 0.1) * camZoom;
      const camH = 1.2 * camZoom;
      _camPos.set(rx + cfX * camDist, rover.position.y + camH, rz + cfZ * camDist);
      _look.set(rx, rover.position.y + 1.2, rz);
    }
    if (orbitYaw !== 0 || orbitPitch !== 0) {
      const odx = _camPos.x - rx, odz = _camPos.z - rz;
      const oc = Math.cos(orbitYaw), os = Math.sin(orbitYaw);
      _camPos.x = rx + odx * oc + odz * os;
      _camPos.z = rz - odx * os + odz * oc;
      _camPos.y += orbitPitch * 3.0 * camZoom;
    }
    {
      // trees must not sit between the camera and the rover: pull the camera closer when one is in the way
      const sdx = _camPos.x - rx, sdz = _camPos.z - rz;
      const sl2 = sdx * sdx + sdz * sdz;
      if (sl2 > 0.01) {
        const slen = Math.sqrt(sl2);
        let tMin = 1;
        for (let i = 0; i < colliders.length; i++) {
          const c = colliders[i];
          if (!c.tree) continue;
          const tt = ((c.x - rx) * sdx + (c.z - rz) * sdz) / sl2;
          if (tt < 0.12 || tt > 1.0) continue;
          const px = rx + sdx * tt - c.x, pz = rz + sdz * tt - c.z;
          const rr = c.r + 0.9;
          if (px * px + pz * pz < rr * rr) tMin = Math.min(tMin, Math.max(0.55, tt - rr / slen));
        }
        if (tMin < 1) { _camPos.x = rx + sdx * tMin; _camPos.z = rz + sdz * tMin; }
      }
    }
    camera.position.lerp(_camPos, 1 - Math.exp(-4.5 * dt));
    // keep the camera out of tree trunks / boulders...
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      const cdx = camera.position.x - c.x, cdz = camera.position.z - c.z;
      const rr = c.r + 0.8;
      const cd2 = cdx * cdx + cdz * cdz;
      if (cd2 < rr * rr) {
        const cd = Math.sqrt(cd2) || 0.001;
        camera.position.x = c.x + cdx / cd * rr;
        camera.position.z = c.z + cdz / cd * rr;
      }
    }
    // ...and above rocks (driveHeight includes the rock surfaces)
    const camGround = driveHeight(camera.position.x, camera.position.z) + 0.7;
    if (camera.position.y < camGround) camera.position.y = camGround;
    camera.lookAt(_look);
    camLight.position.set(camera.position.x, camera.position.y + 3, camera.position.z);
    camLight.target.position.set(rx, rover.position.y + 1, rz);
    camLight.intensity = 0.05 + Math.min(0.14, sunLight.intensity * 0.05);
    const targetFov = 58 + spd * 1.1;
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 3, dt);
      camera.updateProjectionMatrix();
    }

    const poiDist = Math.hypot(POI_X - rx, POI_Z - rz);
    const poiS = THREE.MathUtils.clamp(2.2 + poiDist * 0.05, 2.2, 6);
    poi.scale.set(poiS, poiS * 1.5, 1);
    poi.position.y = poiBaseY + Math.sin(t * 2) * 0.3;

    _poiV.copy(poi.position).project(camera);
    const poiBehind = _poiV.z > 1;
    let pnx = poiBehind ? -_poiV.x : _poiV.x, pny = poiBehind ? -_poiV.y : _poiV.y;
    if (!poiBehind && Math.abs(pnx) < 0.92 && Math.abs(pny) < 0.88) {
      poiArrow.style.display = 'none';
    } else {
      const pm = Math.max(Math.abs(pnx), Math.abs(pny), 0.0001);
      pnx /= pm; pny /= pm;
      const sw = window.innerWidth, sh = window.innerHeight;
      const ex = THREE.MathUtils.clamp((pnx * 0.5 + 0.5) * sw, 60, sw - 60);
      const ey = THREE.MathUtils.clamp((1 - (pny * 0.5 + 0.5)) * sh, 70, sh - 120);
      poiArrow.style.display = 'block';
      poiArrow.style.transform = 'translate(' + (ex - 22) + 'px,' + (ey - 26) + 'px)';
      poiArrowSvg.style.transform = 'rotate(' + (Math.atan2(pnx, pny) * 180 / Math.PI) + 'deg)';
      poiArrowTxt.textContent = Math.round(poiDist) + ' m';
    }

    updateDayNight(dt);
    mmTimer += dt;
    if (mmTimer > 0.25) { mmTimer = 0; drawMinimap(); }

    cullGrass(rx, rz);
    shadowFrame++;
    renderer.shadowMap.needsUpdate = shadowDirty || !((shadowHalf || shadowForceHalf) && (shadowFrame & 1));
    shadowDirty = false;
    renderer.info.reset();
    composer.render();

    // ---- adaptive resolution (checked once a second) ----
    const nowMs = performance.now();
    const rawMs = lastFrameMs ? nowMs - lastFrameMs : 16.7;
    lastFrameMs = nowMs;
    if (rawMs < 250) emaMs += (rawMs - emaMs) * 0.05;
    if (!shadowHalf && emaMs > 19 && nowMs > shadowRetestAt && adaptWarm <= 0) { shadowHalf = true; shadowRetestAt = nowMs + 15000; }
    else if (shadowHalf && nowMs > shadowRetestAt) { shadowHalf = false; shadowRetestAt = nowMs + 4000; }   // re-test full-rate shadows
    if (ADAPTIVE_RES && nowMs > nextEvalMs) {
      nextEvalMs = nowMs + 1000;
      if (adaptWarm > 0) {
        adaptWarm--;
      } else {
        if (emaMs > 20 && curPR > PR_MIN + 0.01) {
          ceilPR = Math.max(PR_MIN, curPR - 0.1); ceilUntil = nowMs + 60000;
          applyPR(Math.max(PR_MIN, curPR - 0.15));
          fastWins = 0; adaptWarm = 2;
        } else if (emaMs < 17.6 && curPR < PR_MAX - 0.01) {
          if (++fastWins >= 4) {
            const cap = nowMs < ceilUntil ? ceilPR : PR_MAX;
            if (curPR < cap - 0.01) applyPR(Math.min(cap, curPR + 0.1));
            fastWins = 0; adaptWarm = 2;
          }
        } else {
          fastWins = 0;
        }
        if (emaMs > 30 && curPR <= PR_MIN + 0.01) { if (++veryLow >= 5 && !downgraded) downgradeGraphics(); } else veryLow = 0;
      }
    }
    if (perfOn && nowMs > overlayAt) {
      overlayAt = nowMs + 500;
      const inf = renderer.info.render;
      perfEl.textContent = Math.round(1000 / emaMs) + ' fps | ' + emaMs.toFixed(1) + ' ms | res x' + curPR.toFixed(2) + ' | ' + inf.calls + ' calls | ' + Math.round(inf.triangles / 1000) + 'k tris' + (shadowHalf ? ' | shadow 1/2' : '') + (downgraded ? ' | LOW' : '');
    }

    perfFrames++; perfAcc += dt;
    if (perfFrames === 180) {
      // (automatic quality drop disabled)
      perfFrames = -9999;
    }
  }

  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

  applyQuality('high', true);   // always start on HIGH (ignores any saved lower setting)
  setPerf(store.get('roverFps') !== '0');
  checkOrientation();
  drawMinimap();
  animate();
}