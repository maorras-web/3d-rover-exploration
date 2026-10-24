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
  scene.fog = new THREE.FogExp2(0xe9c9a2, 0.0040);   // denser haze = depth + everything past ~500 m is fully hidden

  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 560);   // far clipping: at 560 m the fog is ~99.5% so nothing visibly pops
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
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

  // 4x MSAA for the scene render target: on tile-based mobile GPUs (Mali, Adreno) it is resolved in on-chip tile memory,
  // so it is far cheaper than raising the resolution, and it removes the jagged edges. The GPU is asked first; if it cannot
  // do multisampled RGBA16F targets the scene is rendered without MSAA exactly as before.
  // The scene is drawn into an 8-bit RGBA8 target (half the memory traffic of the old 16-bit one: the main cost on phone GPUs).
  // Add ?hdr to the page address to compare with the old 16-bit buffer.
  const USE_HDR = /[?&]hdr/.test(location.search);
  const MSAA_SAMPLES = (() => {
    if (/[?&]nomsaa/.test(location.search)) return 0;   // A/B test: add ?nomsaa to the page address to compare
    try {
      const gl = renderer.getContext();
      if (!renderer.capabilities.isWebGL2 || !gl.getInternalformatParameter) return 0;
      const list = gl.getInternalformatParameter(gl.RENDERBUFFER, USE_HDR ? gl.RGBA16F : gl.RGBA8, gl.SAMPLES);
      for (let i = 0; i < list.length; i++) if (list[i] <= 4 && list[i] >= 2) return list[i];
    } catch (e) { /* no MSAA */ }
    return 0;
  })();
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { type: USE_HDR ? THREE.HalfFloatType : THREE.UnsignedByteType, samples: MSAA_SAMPLES }));
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.30, 0.7, 0.85);
  composer.addPass(bloomPass);
  bloomPass.nMips = 3;   // fewer blur passes = a cheaper glow (the widest, faintest halo is dropped)
  composer.addPass(new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; varying vec2 vUv;
      float hh(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec3 c = texture2D(tDiffuse, vUv).rgb;
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
  }));

  // ============ Sky ============
  const skyUniforms = {
    zenith: { value: new THREE.Color(0x8fc4e8) },
    horizon: { value: new THREE.Color(0xf6dcb4) },
    sunDir: { value: new THREE.Vector3(0.4, 0.5, 0.3).normalize() },
    sunColor: { value: new THREE.Color(0xffd9a0) },
    cloudCol: { value: new THREE.Color(0xffffff) },
    cloudAmt: { value: 1.0 },
    nightAmt: { value: 0.0 },
    uT: { value: 0 }
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 24, 12),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor;
        uniform vec3 cloudCol; uniform float cloudAmt; uniform float uT; uniform float nightAmt;
        float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
        float fbm2(vec2 p){ float s = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }
        varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          vec3 sd = normalize(sunDir);
          float up = clamp(d.y, 0.0, 1.0);
          float s = max(dot(d, sd), 0.0);
          float vis = 1.0 - nightAmt;
          vec3 col = mix(horizon, zenith, pow(up, 0.5));
          col = mix(col, zenith * vec3(0.80, 0.90, 1.08), smoothstep(0.5, 1.0, up) * 0.35);
          float hz = exp(-up * 6.0);
          float side = pow(max(dot(normalize(d.xz + vec2(0.0001)), normalize(sd.xz + vec2(0.0001))), 0.0), 3.0);
          col += sunColor * hz * side * 0.30 * vis;
          col = mix(col, horizon * 1.04, hz * 0.30);
          col += sunColor * (pow(s, 1800.0) * 5.0 + pow(s, 260.0) * 1.1 + pow(s, 12.0) * 0.38) * vis;
          float mo = max(dot(d, -sd), 0.0);
          col += vec3(0.85, 0.90, 1.0) * (pow(mo, 1200.0) * 2.5 + pow(mo, 50.0) * 0.10) * nightAmt;
          if (nightAmt > 0.01 && d.y > 0.02) {
            vec2 sp = d.xz / (d.y + 0.35) * 14.0;
            vec2 sid = floor(sp);
            vec2 sf = fract(sp) - 0.5;
            float sr = h21(sid);
            vec2 soff = (vec2(h21(sid + 3.1), h21(sid + 7.7)) - 0.5) * 0.6;
            float st = step(0.965, sr) * (1.0 - smoothstep(0.0, 0.16, length(sf - soff)));
            st *= 0.55 + 0.45 * sin(uT * 2.5 + sr * 60.0);
            col += vec3(0.85, 0.90, 1.0) * st * nightAmt * smoothstep(0.02, 0.25, d.y);
          }
          vec2 cuv = d.xz / (max(d.y, 0.0) + 0.22) * 1.25 + vec2(uT * 0.008, 0.0);
          float dn = fbm2(cuv);
          float cov = smoothstep(0.47, 0.76, dn);
          float lt = clamp(1.25 - dn * 1.05 + pow(s, 2.0) * 0.30, 0.0, 1.0);
          cov *= smoothstep(0.02, 0.22, d.y) * cloudAmt;
          vec3 cdark = cloudCol * vec3(0.55, 0.62, 0.78);
          vec3 cc = mix(cdark, cloudCol, lt);
          cc += sunColor * (pow(s, 4.0) * 0.35 + pow(s, 30.0) * 0.5) * (0.3 + 0.7 * lt) * vis;
          cc = mix(cc, horizon, hz * 0.45);
          col = mix(col, cc, cov * 0.93);
          col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;   // anti-banding for the 8-bit buffer
          gl_FragColor = vec4(col, 1.0);
        }`
    })
  );
  scene.add(sky);

  // ============ Lights ============
  const ambientLight = new THREE.AmbientLight(0x8899bb, 0.22);
  scene.add(ambientLight);
  const hemiLight = new THREE.HemisphereLight(0xcfe6f7, 0x8a9650, 0.6);
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
    // baked ground details (zero runtime cost): big colour patches, sun-dried yellow grass, mossy clover patches (grassy biomes only)
    if (col.g > col.r * 1.05 && col.g > col.b * 1.2) {
      const mac = smoothNoise(x - 33, z + 71, 9) - 0.5;
      const dry = THREE.MathUtils.smoothstep(smoothNoise(x + 140, z + 15, 14), 0.62, 0.8);
      const moss = THREE.MathUtils.smoothstep(smoothNoise(x - 60, z - 120, 7), 0.6, 0.8);
      col.r *= 1 + mac * 0.30 + dry * 0.06;
      col.g *= 1 + mac * 0.30 + dry * 0.05 + moss * 0.06;
      col.b *= 1 - mac * 0.12 - dry * 0.04;
    }

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
  // ---- baked lawn detail map (tileable, built once): soft patches + tiny grass strokes + dry flecks ----
  // Sampled twice in the ground shader (two scales). It replaces a per-pixel hash noise, so it adds detail at ~zero GPU cost.
  const detailTex = (() => {
    // LAWN CARPET in the style of a stylised mobile game: calm deep green, thin lighter blade strokes, soft darker patches.
    // The texture is a MULTIPLIER (0.5 = "no change") so it works on top of the ground colour; it tiles seamlessly.
    const N = 384;
    let seed = 4242;
    const R = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const lattice = (n) => { const a = new Float32Array(n * n); for (let i = 0; i < a.length; i++) a[i] = R(); return a; };
    const periodic = (lat, n, x, y) => {
      const fx = x / N * n, fy = y / N * n;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      const x0 = ix % n, y0 = iy % n, x1 = (ix + 1) % n, y1 = (iy + 1) % n;
      const a = lat[y0 * n + x0], b = lat[y0 * n + x1], c = lat[y1 * n + x0], d = lat[y1 * n + x1];
      return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    };
    const l1 = lattice(6), l2 = lattice(14), l3 = lattice(34), ld = lattice(5);
    const CR = new Float32Array(N * N).fill(1), CG = new Float32Array(N * N).fill(1), CB = new Float32Array(N * N).fill(1);
    const splat = (x, y, r, g, b, a) => {
      const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
      for (let k = 0; k < 4; k++) {
        const w = ((k & 1) ? fx : 1 - fx) * ((k & 2) ? fy : 1 - fy) * a;
        if (w < 0.02) continue;
        let px = ix + (k & 1), py = iy + ((k >> 1) & 1);
        px = px >= N ? px - N : (px < 0 ? px + N : px); py = py >= N ? py - N : (py < 0 ? py + N : py);
        const i = py * N + px;
        CR[i] += (r - CR[i]) * w; CG[i] += (g - CG[i]) * w; CB[i] += (b - CB[i]) * w;
      }
    };
    const stroke = (x0, y0, ang, len, r, g, b, a) => {
      let dx = Math.cos(ang), dy = Math.sin(ang);
      const cv = (R() - 0.5) * 0.10, cc = Math.cos(cv), ss = Math.sin(cv);
      let x = x0, y = y0;
      for (let s = 0; s <= len; s++) {
        const w = Math.sin(Math.PI * s / len), aa = a * (0.2 + 0.8 * w);       // thin at both ends, strongest in the middle
        splat(x, y, r, g, b, aa);
        splat(x - dy * 1.0, y + dx * 1.0, r, g, b, aa * 0.75);                  // ~3 px wide blade
        splat(x + dy * 1.0, y - dx * 1.0, r, g, b, aa * 0.75);
        const nx = dx * cc - dy * ss; dy = dx * ss + dy * cc; dx = nx;
        x += dx; y += dy;
      }
    };
    const dirA = () => (R() < 0.7 ? -Math.PI / 2 + (R() - 0.5) * 1.9 : R() * Math.PI * 2);   // most blades lean the same general way
    for (let i = 0; i < 700; i++) stroke(R() * N, R() * N, dirA(), 9 + R() * 13, 0.68, 0.74, 0.60, 0.6);                      // dark gaps / shadow lines
    for (let i = 0; i < 1000; i++) { const k = 0.9 + R() * 0.22; stroke(R() * N, R() * N, dirA(), 17 + R() * 19, 1.46 * k, 1.34 * k, 1.72 * k, 0.9); }   // light blades
    const HN = N >> 1, PA = new Float32Array(HN * HN), TA = new Float32Array(HN * HN);
    for (let y = 0; y < HN; y++) for (let x = 0; x < HN; x++) {
      const X = x * 2, Y = y * 2;
      PA[y * HN + x] = 0.86 + (periodic(l1, 6, X, Y) * 0.5 + periodic(l2, 14, X, Y) * 0.3 + periodic(l3, 34, X, Y) * 0.2) * 0.28;   // soft light / dark patches
      TA[y * HN + x] = periodic(ld, 5, X, Y) - 0.5;
    }
    let mr = 0, mg = 0, mb = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, j = (y >> 1) * HN + (x >> 1), patch = PA[j], t = TA[j];
      CR[i] *= patch * (1 + t * 0.10); CG[i] *= patch; CB[i] *= patch * (1 - t * 0.10);
      mr += CR[i]; mg += CG[i]; mb += CB[i];
    }
    mr /= N * N; mg /= N * N; mb /= N * N;
    const data = new Uint8Array(N * N * 4);
    const c8 = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
    const cl = (v) => Math.max(0.28, Math.min(0.78, v));
    for (let i = 0; i < N * N; i++) {
      data[i * 4] = c8(cl(CR[i] / mr * 0.5)); data[i * 4 + 1] = c8(cl(CG[i] / mg * 0.5)); data[i * 4 + 2] = c8(cl(CB[i] / mb * 0.5)); data[i * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);   // data texture: 0.5 = "no change"
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = Math.min(2, renderer.capabilities.getMaxAnisotropy());   // x2 keeps the blades sharp at the flat viewing angle (x4 was too slow in the speed test); set to 1 if the ground gets slow
    tex.needsUpdate = true;
    return tex;
  })();
  const groundMat = new THREE.MeshStandardMaterial({
    map: groundTex, vertexColors: true, roughness: 0.95, metalness: 0.0, flatShading: false
  });
  // The dirt trail is drawn per-pixel (fine grain, wheel ruts, pebbles, ragged grassy edges)
  // instead of from the coarse ground texture, so it looks like a real worn track.
  groundMat.onBeforeCompile = (sh) => {
    sh.uniforms.detailTex = { value: detailTex };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D detailTex;
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
        float pm = 0.0;
        if (ad < 3.6) {   // the trail is never wider than ~3.5 m from its centre line: no noise needed anywhere else
          float wHalf = 2.4 + (fb(wp * 1.6) - 0.5) * 1.1 + (vn(wp * 0.3 + 7.0) - 0.5) * 0.9;
          pm = 1.0 - smoothstep(wHalf - 0.45, wHalf + 0.1, ad);
        }
        float lodG = 1.0 - smoothstep(12.0, 70.0, length(vViewPosition));
        // lawn detail (grassy biomes only; not on snow / sand): soft patches at ~17 m and blade strokes / flecks at ~3.4 m
        float lawn = smoothstep(0.0, 0.04, vColor.g - vColor.r * 1.05) * smoothstep(0.0, 0.06, vColor.g - vColor.b * 1.2);
        vec3 dBig = texture2D(detailTex, wp * 0.0588, 2.5).rgb * 2.0;
        vec3 dFine = texture2D(detailTex, wp * 0.20 + 0.37).rgb * 2.0;
        base *= mix(vec3(1.0), vec3(0.50, 0.47, 0.41), lawn);   // deep olive green: measured against the reference game (target 88,115,38), no neon lime
        base *= mix(vec3(1.0), dBig, 0.8 * lawn) * mix(vec3(1.0), dFine, 1.0 * lodG * lawn);
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
  // CHUNKED GROUND: the 220x220 grid is cut into 5x5 chunks that share one material. Each chunk is culled by the
  // camera frustum / far plane on its own, so only the part of the terrain you actually see is sent to the GPU.
  const ground = new THREE.Group();
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  {
    const S = 44, nC = GSEG / S, W1 = S + 1;
    const gP = groundGeo.attributes.position.array, gN = groundGeo.attributes.normal.array;
    const gU = groundGeo.attributes.uv.array, gC = groundGeo.attributes.color.array;
    for (let cb = 0; cb < nC; cb++) for (let ca = 0; ca < nC; ca++) {
      const i0 = ca * S, j0 = cb * S, vc = W1 * W1;
      const cp = new Float32Array(vc * 3), cn = new Float32Array(vc * 3), cu = new Float32Array(vc * 2), cc = new Float32Array(vc * 3);
      let o = 0;
      for (let j = 0; j <= S; j++) for (let i = 0; i <= S; i++, o++) {
        const src = (j0 + j) * GP1 + (i0 + i);
        cp[o * 3] = gP[src * 3]; cp[o * 3 + 1] = gP[src * 3 + 1]; cp[o * 3 + 2] = gP[src * 3 + 2];
        cn[o * 3] = gN[src * 3]; cn[o * 3 + 1] = gN[src * 3 + 1]; cn[o * 3 + 2] = gN[src * 3 + 2];
        cu[o * 2] = gU[src * 2]; cu[o * 2 + 1] = gU[src * 2 + 1];
        cc[o * 3] = gC[src * 3]; cc[o * 3 + 1] = gC[src * 3 + 1]; cc[o * 3 + 2] = gC[src * 3 + 2];
      }
      const idx = new Uint16Array(S * S * 6);
      let t = 0;
      for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
        // exactly the same two triangles as PlaneGeometry (the height lookup relies on this split)
        const a = i + W1 * j, b = i + W1 * (j + 1), c = (i + 1) + W1 * (j + 1), d = (i + 1) + W1 * j;
        idx[t++] = a; idx[t++] = b; idx[t++] = d; idx[t++] = b; idx[t++] = c; idx[t++] = d;
      }
      const cg = new THREE.BufferGeometry();
      cg.setAttribute('position', new THREE.BufferAttribute(cp, 3));
      cg.setAttribute('normal', new THREE.BufferAttribute(cn, 3));
      cg.setAttribute('uv', new THREE.BufferAttribute(cu, 2));
      cg.setAttribute('color', new THREE.BufferAttribute(cc, 3));
      cg.setIndex(new THREE.BufferAttribute(idx, 1));
      cg.computeBoundingSphere();
      const cm = new THREE.Mesh(cg, groundMat);
      cm.receiveShadow = true;
      ground.add(cm);
    }
  }

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

  // ============ GRASS: textured clumps (many blades per clump) instead of a few geometric blades ============
  // Every clump is 2-3 crossed quads that carry a hand-drawn alpha texture of ~50-80 blades. The left half of the atlas
  // is lush grass, the right half is grass with wild flowers (daisies, lupines, buttercups). This looks far denser
  // than real blade geometry and costs ~4x fewer triangles.
function drawGrassAtlasCanvas() {
  const W = 512, H = 256;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  let seed = 90210;
  const R = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const hsl = (h, s, l) => 'hsl(' + h.toFixed(0) + ',' + s.toFixed(0) + '%,' + l.toFixed(0) + '%)';
  const YB = 252;
  function blade(ox, x0, h, w, lean, dark, gold) {
    const xt = ox + x0 + lean, yt = YB - h;
    const gr = g.createLinearGradient(0, YB, 0, yt);
    const hu = 96 + R() * 14, k = dark ? 0.72 : 1;
    gr.addColorStop(0, hsl(hu + 4, 55, 13 * k + 2));
    gr.addColorStop(0.45, hsl(hu, 58, 27 * k + 3));
    gr.addColorStop(1, gold ? hsl(46 + R() * 8, 52, 52) : hsl(hu - 16 + R() * 8, 62, 44 * k + 8));
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(ox + x0 - w / 2, YB);
    g.quadraticCurveTo(ox + x0 - w * 0.5 + lean * 0.15, YB - h * 0.5, xt, yt);
    g.quadraticCurveTo(ox + x0 + w * 0.5 + lean * 0.6, YB - h * 0.55, ox + x0 + w / 2, YB);
    g.closePath();
    g.fill();
  }
  function clump(ox, n) {
    for (let i = 0; i < n; i++) {
      const x0 = 128 + (R() + R() - 1) * 60;
      const h = 70 + R() * 150 + (R() < 0.12 ? 30 : 0);
      blade(ox, x0, h, 3.5 + R() * 5, (R() - 0.5) * 84, i < n * 0.4, R() < 0.08);
    }
  }
  function stem(ox, x0, h, lean) {
    g.strokeStyle = hsl(100, 45, 26); g.lineWidth = 2.4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(ox + x0, YB); g.quadraticCurveTo(ox + x0 + lean * 0.2, YB - h * 0.5, ox + x0 + lean, YB - h); g.stroke();
    return [ox + x0 + lean, YB - h];
  }
  function daisy(ox, x0, h) {
    const lean = (R() - 0.5) * 30, p = stem(ox, x0, h, lean);
    g.save(); g.translate(p[0], p[1]); g.rotate(R() * 3);
    g.fillStyle = '#f7f7f1';
    for (let k = 0; k < 9; k++) { g.save(); g.rotate(k / 9 * Math.PI * 2); g.beginPath(); g.ellipse(9, 0, 8.5, 3.2, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
    g.fillStyle = '#f0c21e'; g.beginPath(); g.arc(0, 0, 4.4, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  function lupine(ox, x0, h) {
    const lean = (R() - 0.5) * 24, p = stem(ox, x0, h * 0.55, lean * 0.5);
    for (let j = 0; j < 16; j++) {
      const y = p[1] - j * 4.6, x = p[0] + Math.sin(j * 0.8) * 1.6 + lean * 0.02 * j, r = 2.2 + (16 - j) * 0.28;
      g.fillStyle = hsl(268 + R() * 18, 52, 50 + R() * 14);
      g.beginPath(); g.arc(x - 2.5, y, r, 0, Math.PI * 2); g.arc(x + 2.5, y, r, 0, Math.PI * 2); g.fill();
    }
  }
  function dot(ox, x0, h, col, r) {
    const p = stem(ox, x0, h, (R() - 0.5) * 24);
    g.fillStyle = col; g.beginPath(); g.arc(p[0], p[1], r, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(p[0] - r * 0.3, p[1] - r * 0.3, r * 0.4, 0, Math.PI * 2); g.fill();
  }
  clump(0, 84);
  clump(256, 46);
  for (let i = 0; i < 4; i++) daisy(256, 128 + (R() - 0.5) * 120, 80 + R() * 80);
  for (let i = 0; i < 2; i++) lupine(256, 128 + (R() - 0.5) * 100, 150 + R() * 70);
  for (let i = 0; i < 3; i++) dot(256, 128 + (R() - 0.5) * 120, 70 + R() * 70, '#f2d23c', 5.5);
  for (let i = 0; i < 2; i++) dot(256, 128 + (R() - 0.5) * 120, 60 + R() * 60, '#e08fc0', 6);
  return cv;
}

  const grassTex = (() => {
    const cv = drawGrassAtlasCanvas();
    const W = cv.width, H = cv.height;
    const src = cv.getContext('2d').getImageData(0, 0, W, H).data;
    const out = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) {
      const sy = H - 1 - y;                          // DataTexture rows start at the bottom
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4, j = (sy * W + x) * 4, a = src[j + 3];
        if (a < 6) { out[i] = 70; out[i + 1] = 118; out[i + 2] = 40; out[i + 3] = 0; }   // green fringe colour (no dark halo when mip-mapped)
        else { out[i] = src[j]; out[i + 1] = src[j + 1]; out[i + 2] = src[j + 2]; out[i + 3] = a; }
      }
    }
    const t = new THREE.DataTexture(out, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    t.needsUpdate = true;
    return t;
  })();
  function makeClumpGeo(nQuads, w, h) {
    const pos = [], nor = [], uv = [], idx = [];
    for (let q = 0; q < nQuads; q++) {
      const a = (q / nQuads) * Math.PI + 0.35, c = Math.cos(a) * w / 2, sn = Math.sin(a) * w / 2;
      const b0 = pos.length / 3;
      pos.push(-c, 0, -sn, c, 0, sn, c, h, sn, -c, h, -sn);
      for (let k = 0; k < 4; k++) nor.push(0, 1, 0);          // up-facing normals: the grass is lit like the ground (soft, no dark backs)
      uv.push(0, 0, 0.5, 0, 0.5, 1, 0, 1);                    // left half of the atlas (the shader shifts 14% of clumps to the flower half)
      idx.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }
  const tuftGeo = makeClumpGeo(2, 1.8, 0.85);   // far-field clumps (bigger, they have to cover more ground)

  const uTime = { value: 0 };
  const uGrassQ = { value: 1 }, uGrassD = { value: 1 };   // grass range / density (set by the quality level)
  const uRover = { value: new THREE.Vector3(0, -999, 0) };
  const grassMat = new THREE.MeshLambertMaterial({ map: grassTex, alphaTest: 0.38, side: THREE.DoubleSide, alphaToCoverage: MSAA_SAMPLES > 0 });
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
       float vr = fract(sin(dot(wpos.xz, vec2(41.3, 17.9))) * 9731.17);
       vMapUv.x += step(0.86, vr) * 0.5;
       float ph = wpos.x * 0.35 + wpos.z * 0.27;
       float gust = sin(uTime * 1.6 + ph) * 0.6 + sin(uTime * 3.3 + ph * 1.7) * 0.4;
       float hf = position.y * position.y * 3.2;
       transformed.x += gust * 0.17 * hf;
       transformed.z += cos(uTime * 1.2 + ph) * 0.11 * hf;
       float mt = sin(wpos.x * 0.045 + 1.3) * sin(wpos.z * 0.04 + 0.5);
       vColor *= vec3(1.0 + mt * 0.10, 1.0 + mt * 0.04, 1.0 - mt * 0.07) * (1.0 + gust * 0.09 * hf) * mix(0.6, 1.0, smoothstep(0.9, 3.6, dR));`
    );
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize( vNormal );');
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
  const FG_CH = 55, FG_N = Math.ceil(WORLD_SIZE / FG_CH);
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
    m.receiveShadow = false;   // speed test: grass was the biggest cost; the shadow lookup per grass pixel is skipped
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
  const nearGeo = makeClumpGeo(3, 1.0, 0.58);   // close layer: 3 crossed quads = 6 triangles per clump (was 30)
  const midGeo = makeClumpGeo(2, 1.15, 0.64);   // wide layer: 4 triangles per clump (was 12)
  function ngHash(i, j, sd) { const n = Math.sin(i * 127.1 + j * 311.7 + sd * 74.7) * 43758.5453; return n - Math.floor(n); }

  function makeGrassLayer(geo, CELL, N, K, densGLSL, scaleMul, TILE, maxR) {
    const mat = new THREE.MeshLambertMaterial({ map: grassTex, alphaTest: 0.38, side: THREE.DoubleSide, alphaToCoverage: MSAA_SAMPLES > 0 });
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
         float hf = position.y * position.y * 3.2;
         transformed.x += gust * 0.17 * hf * fade;
         transformed.z += cos(uTime * 1.2 + ph) * 0.11 * hf * fade;
         float vr = fract(sin(dot(wpos.xz, vec2(41.3, 17.9))) * 9731.17);
         vMapUv.x += step(0.86, vr) * 0.5;
         float mt = sin(wpos.x * 0.045 + 1.3) * sin(wpos.z * 0.04 + 0.5);
         vColor *= vec3(1.0 + mt * 0.10, 1.0 + mt * 0.04, 1.0 - mt * 0.07) * (1.0 + gust * 0.09 * hf) * mix(0.6, 1.0, smoothstep(0.9, 3.6, dR));`
      );
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize( vNormal );');
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
        mesh.receiveShadow = false;   // speed test: no shadow lookup per grass pixel
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
  const updateGrassNear = makeGrassLayer(nearGeo, 0.85, 46, 3, 'float dens = pow(1.0 - smoothstep(3.0, 18.5, dRd), 2.0);', 1.0, 12, 19.0);
  // wide layer: cheap geometry, slightly bigger tufts, covers ~100 m and fades into the far-field grass
  const updateGrassMid = makeGrassLayer(midGeo, 3.0, 68, 3, 'float dens = smoothstep(4.0, 14.0, dRd) * (1.0 - smoothstep(60.0, 100.0, dRd)) * 0.30;', 2.0, 17, 100.0);
  function updateNearGrass(px, pz) { updateGrassNear(px, pz); updateGrassMid(px, pz); }
  const _gFrustum = new THREE.Frustum(), _gPV = new THREE.Matrix4();
  // The ground carpet carries the grass look now, so the 3D tufts are only a light accent close to the rover.
  // Raise these three numbers if you want more 3D grass (and pay for it in speed): density 1 / range 1 / far 1e9 = the old full grass.
  const GRASS3D_DENSITY = 1.00, GRASS3D_RANGE = 0.50, GRASS3D_FAR = 0;   // full 3D grass up to ~9 m around the rover (tiny area = cheap), far-field tufts off
  let grassFarMax = 1e9;           // far-field grass beyond this distance is not drawn (quality level)
  function cullGrass(px, pz) {
    camera.updateMatrixWorld();
    if (dbg.noGrass) {
      for (let i = 0; i < grassChunks.length; i++) grassChunks[i].mesh.visible = false;
      for (let i = 0; i < grassLayers.length; i++) grassLayers[i].cull(_gFrustum, 1e9, 1e9);
      return;
    }
    _gPV.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _gFrustum.setFromProjectionMatrix(_gPV);
    for (let i = 0; i < grassChunks.length; i++) {
      const c = grassChunks[i];
      const cdx = c.sphere.center.x - px, cdz = c.sphere.center.z - pz;
      c.mesh.visible = grassFarMax > 0 && (Math.sqrt(cdx * cdx + cdz * cdz) - c.sphere.radius < grassFarMax) && _gFrustum.intersectsSphere(c.sphere);   // far-field tufts are off when GRASS3D_FAR = 0
    }
    for (let i = 0; i < grassLayers.length; i++) grassLayers[i].cull(_gFrustum, px, pz);
  }

  // ============ CHUNKED WORLD STREAMING (trees, rocks, bushes, flowers, contact shadows) ============
  // The world is a grid of 88 m chunks (5 x 5 = few draw calls). Every decor type keeps its instance data per chunk and only builds a small
  // THREE.InstancedMesh for chunks near the rover; chunks that are far away (inside the fog) are disposed again.
  // Each live chunk mesh has its own bounding sphere, so the camera and the shadow camera cull them one by one.
  const CHUNK = 88, CH_N = Math.ceil(WORLD_SIZE / CHUNK);
  const chunkLayers = [];
  function chunkIndexOf(x, z) {
    const cx = Math.min(CH_N - 1, Math.max(0, Math.floor((x + HALF) / CHUNK)));
    const cz = Math.min(CH_N - 1, Math.max(0, Math.floor((z + HALF) / CHUNK)));
    return cz * CH_N + cx;
  }
  // Takes a fully filled InstancedMesh (n real instances), splits its instances into chunks and registers a layer.
  function chunkify(im, n, loadR, unloadR) {
    const L = {
      geo: im.geometry, mat: im.material, cast: im.castShadow, recv: im.receiveShadow, order: im.renderOrder,
      mats: im.instanceMatrix.array, cols: im.instanceColor ? im.instanceColor.array : null,
      lists: new Array(CH_N * CH_N), live: new Array(CH_N * CH_N).fill(null), loadR, unloadR, visible: true
    };
    for (let i = 0; i < n; i++) {
      const k = chunkIndexOf(L.mats[i * 16 + 12], L.mats[i * 16 + 14]);
      (L.lists[k] || (L.lists[k] = [])).push(i);
    }
    chunkLayers.push(L);
    return L;
  }
  function buildChunk(L, k) {
    const list = L.lists[k], n = list.length;
    const m = new THREE.InstancedMesh(L.geo, L.mat, n);
    const ma = m.instanceMatrix.array;
    for (let j = 0; j < n; j++) { const sI = list[j] * 16; for (let e = 0; e < 16; e++) ma[j * 16 + e] = L.mats[sI + e]; }
    if (L.cols) {
      const ca = new Float32Array(n * 3);
      for (let j = 0; j < n; j++) { const sI = list[j] * 3; ca[j * 3] = L.cols[sI]; ca[j * 3 + 1] = L.cols[sI + 1]; ca[j * 3 + 2] = L.cols[sI + 2]; }
      m.instanceColor = new THREE.InstancedBufferAttribute(ca, 3);
    }
    m.castShadow = L.cast; m.receiveShadow = L.recv; m.renderOrder = L.order; m.visible = L.visible;
    if (typeof m.computeBoundingSphere === 'function') m.computeBoundingSphere(); else m.frustumCulled = false;
    scene.add(m);
    L.live[k] = m;
  }
  function unloadChunk(L, k) {
    const m = L.live[k];
    if (!m) return;
    scene.remove(m);
    m.dispose();
    L.live[k] = null;
  }
  // force = build everything in range right now (first frame); otherwise at most 3 chunks per call (no hitches)
  function updateChunks(px, pz, force) {
    let builds = 0;
    const maxBuilds = force ? 1e9 : 3;
    for (let li = 0; li < chunkLayers.length; li++) {
      const L = chunkLayers[li];
      for (let k = 0; k < L.lists.length; k++) {
        if (!L.lists[k]) continue;
        const cx = (k % CH_N + 0.5) * CHUNK - HALF, cz = (Math.floor(k / CH_N) + 0.5) * CHUNK - HALF;
        const d = Math.hypot(cx - px, cz - pz) - CHUNK * 0.7;
        if (L.live[k]) { if (d > L.unloadR) unloadChunk(L, k); }
        else if (d < L.loadR && builds < maxBuilds) { buildChunk(L, k); builds++; }
      }
    }
  }
  let chunkTick = 0;
  // gentle wind sway for foliage: done in the vertex shader, so it costs no extra draw calls
  function addSway(mat, amp) {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 swp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float swh = position.y + 1.0;
        transformed.x += sin(uTime * 1.3 + swp.x * 0.21 + swp.z * 0.17) * ${amp.toFixed(3)} * swh;
        transformed.z += cos(uTime * 1.1 + swp.z * 0.23 + swp.x * 0.05) * ${(amp * 0.8).toFixed(3)} * swh;`);
    };
  }

  // ============ Flowers ============
  const flowerPlans = [];
  for (let i = 0; i < 520; i++) {
    const x = (Math.random() - 0.5) * WORLD_SIZE * 0.85;
    const z = (Math.random() - 0.5) * WORLD_SIZE * 0.85;
    if (pathMask(x, z) > 0.4) continue;
    flowerPlans.push({ x, z, c: [0xff6699, 0xffcc33, 0xff8844, 0xaa66ff, 0xffffff, 0xff4455, 0x66ccff][i % 7] });
  }
  const flowerIM = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.09, 0),
    new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true }),
    Math.max(1, flowerPlans.length)
  );
  flowerPlans.forEach((p, i) => {
    dummy.position.set(p.x, getGroundHeight(p.x, p.z) + 0.24, p.z);
    dummy.rotation.set(0, Math.random() * 3, 0);
    dummy.scale.setScalar(1.4 + Math.random() * 0.7);
    dummy.updateMatrix();
    flowerIM.setMatrixAt(i, dummy.matrix);
    flowerIM.setColorAt(i, gCol.setHex(p.c));
  });
  chunkify(flowerIM, flowerPlans.length, 120, 145);

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
  const bushState = { on: true };   // bushes can be hidden on weaker graphics levels: then they must not block or lift the rover
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
      if (s.bush && !bushState.on) continue;
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
  chunkify(rockIM, rockPlans.length, 270, 300);

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
    plan.color = new THREE.Color().setHSL(type === 'pine' ? 0.36 + Math.random() * 0.03 : 0.22 + Math.random() * 0.09, 0.44 + Math.random() * 0.14, type === 'pine' ? 0.20 + Math.random() * 0.08 : 0.28 + Math.random() * 0.12).getHex();
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
    withGradient(new THREE.IcosahedronGeometry(1, 1), 0.52, 1.18),
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
        blobIM.setColorAt(bi, gCol.setHex(p.color).offsetHSL((Math.random() - 0.5) * 0.025, 0, (Math.random() - 0.5) * 0.07));
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
  [trunkIM, coneIM, blobIM, branchIM].forEach(im => { im.receiveShadow = true; });
  addSway(coneIM.material, 0.05);
  addSway(blobIM.material, 0.035);
  const treeLayers = [
    chunkify(trunkIM, treePlans.length, 400, 430),
    chunkify(coneIM, ci, 400, 430),
    chunkify(blobIM, bi, 400, 430),
    chunkify(branchIM, ri, 400, 430)
  ];

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
    withGradient(new THREE.IcosahedronGeometry(1, 1), 0.55, 1.15),
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
    if (p.s >= 0.7) colliders.push({ x: p.x, z: p.z, r: p.s * 1.0, bush: true });
    else smallRocks.push({ x: p.x, z: p.z, r: p.s * 1.1, h: p.s * 0.5, bush: true });
  });
  addSway(bushIM.material, 0.03);
  const bushLayer = chunkify(bushIM, bushPlans.length, 230, 260);

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
  contactIM.renderOrder = 1;
  chunkify(contactIM, contactPlans.length, 300, 330);

  // ============ Floating pollen (day) / fireflies (night): a single Points draw call, 140 vertices ============
  const POLLEN_N = 140;
  const pollenGeo = new THREE.BufferGeometry();
  {
    const pp = new Float32Array(POLLEN_N * 3), ps = new Float32Array(POLLEN_N);
    for (let i = 0; i < POLLEN_N; i++) { pp[i * 3] = Math.random(); pp[i * 3 + 1] = Math.random(); pp[i * 3 + 2] = Math.random(); ps[i] = Math.random(); }
    pollenGeo.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    pollenGeo.setAttribute('seed', new THREE.BufferAttribute(ps, 1));
  }
  const pollenU = { uTime: uTime, uC: { value: new THREE.Vector3() }, uNight: skyUniforms.nightAmt, uSize: { value: 60 } };
  const pollen = new THREE.Points(pollenGeo, new THREE.ShaderMaterial({
    uniforms: pollenU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float uTime; uniform vec3 uC; uniform float uNight; uniform float uSize;
      attribute float seed; varying float vA;
      void main(){
        vec3 p = vec3(position.x * 36.0, position.y * 3.4 + 0.3, position.z * 36.0);
        p.x += sin(uTime * 0.40 + seed * 40.0) * 1.2;
        p.y += sin(uTime * 0.55 + seed * 17.0) * 0.45;
        p.z += cos(uTime * 0.35 + seed * 23.0) * 1.2;
        vec2 w = mod(p.xz - uC.xz + 18.0, 36.0) - 18.0;
        vec3 wp = vec3(uC.x + w.x, uC.y + p.y, uC.z + w.y);
        vec4 mv = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = max(-mv.z, 0.5);
        gl_PointSize = min(uSize * mix(1.0, 1.8, uNight) / dist, 36.0);
        float tw = 0.55 + 0.45 * sin(uTime * (1.5 + seed * 2.0) + seed * 30.0);
        vA = tw * (1.0 - smoothstep(10.0, 20.0, dist)) * smoothstep(0.8, 2.0, dist);
      }`,
    fragmentShader: `
      uniform float uNight; varying float vA;
      void main(){
        float d = length(gl_PointCoord - vec2(0.5));
        float a = 1.0 - smoothstep(0.1, 0.5, d);
        vec3 col = mix(vec3(1.0, 0.95, 0.72), vec3(0.78, 1.0, 0.45), uNight);
        gl_FragColor = vec4(col, a * vA * mix(0.35, 0.95, uNight));
      }`
  }));
  pollen.frustumCulled = false;
  scene.add(pollen);

  // ============ Rolling hills (two hazy layers) ============
  function addHills(count, ringR, rMin, rMax, hMin, hMax, color) {
    const im = new THREE.InstancedMesh(
      withGradient(new THREE.SphereGeometry(1, 16, 10), 0.78, 1.12),
      new THREE.MeshStandardMaterial({ color, vertexColors: true, roughness: 1, flatShading: false }), count);
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
  addHills(20, 262, 48, 74, 14, 24, 0x5f8a3a);
  addHills(20, 376, 80, 115, 29, 45, 0x7d9c86);

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
  // radar mast on top of the dome: a collar sits on the dome surface, the mast rises clearly above it and the dish floats on top
  partDisc('tanS', -0.18, 2.27, 0.12, 0.10, 0.07, 0, 1, 0, 10);
  partBeam('joint', -0.18, 2.27, 0.12, -0.18, 2.62, 0.12, 0.03);
  partDisc('armS', -0.18, 2.68, 0.12, 0.27, 0.04, 0.2, 1, -0.5, 14);

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
  // Engine: detuned saw voices + a sub, soft-clipped for harmonics, filtered by revs/throttle, with an automatic
  // 4-gear box (revs rise, drop at every shift), engine-brake when you lift off, a thin motor whine,
  // granular gravel under the tires (grain rate follows the speed), tire hum, wind and a very light outdoor echo.
  const sunGlowEl = document.getElementById('sun-glow');
  let actx = null, master = null, mix = null, soundOn = true, noiseBuf = null, eng = null, lastThud = 0;
  let rpmState = 0.2, gear = 1, shiftDuck = 0;
  // volume trims in decibels (negative = quieter)
  const GRAVEL_DB = -6, ENGINE_DB = -5;
  const GRAVEL_K = Math.pow(10, GRAVEL_DB / 20), ENGINE_K = Math.pow(10, ENGINE_DB / 20);
  const GEAR_AT = [0, 0.16, 0.36, 0.60, 1.01];     // speed (0..1) where each gear starts
  function makeGravelBuffer(ctx) {
    const sr = ctx.sampleRate, len = Math.floor(sr * 3);
    const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    let fine = 0, chunk = 0, lp = 0;
    for (let i = 0; i < len; i++) {
      if (Math.random() < 0.012) fine = 0.5 + Math.random() * 0.5;        // many tiny stones
      if (Math.random() < 0.0009) chunk = 0.8 + Math.random() * 0.6;      // now and then a bigger crunch
      const n = Math.random() * 2 - 1;
      lp += (n - lp) * 0.35;                                              // the big crunches are duller
      d[i] = n * fine * 0.55 + lp * chunk;
      fine *= 0.972; chunk *= 0.9965;
    }
    let mx = 0.0001;
    for (let i = 0; i < len; i++) if (Math.abs(d[i]) > mx) mx = Math.abs(d[i]);
    const fadeN = Math.floor(sr * 0.05);
    for (let i = 0; i < len; i++) d[i] *= 0.9 / mx;
    for (let i = 0; i < fadeN; i++) { const k = i / fadeN; d[i] *= k; d[len - 1 - i] *= k; }   // loops without a click
    return buf;
  }
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

      // everything plays through "mix": a dry path plus a very light echo (cheap feedback delays, no heavy reverb)
      mix = actx.createGain(); mix.gain.value = 1;
      mix.connect(master);
      const rvIn = actx.createGain(); rvIn.gain.value = 0.15;
      mix.connect(rvIn);
      [[0.041, 0.36], [0.067, 0.32], [0.097, 0.28]].forEach(([dtm, fb]) => {
        const dl = actx.createDelay(0.3); dl.delayTime.value = dtm;
        const fg = actx.createGain(); fg.gain.value = fb;
        const lpf = actx.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = 2200;
        rvIn.connect(dl); dl.connect(lpf); lpf.connect(master); lpf.connect(fg); fg.connect(dl);
      });

      const len = Math.floor(actx.sampleRate * 2);
      noiseBuf = actx.createBuffer(1, len, actx.sampleRate);
      const nd = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1;

      // ---- engine ----
      const bus = actx.createGain(); bus.gain.value = 0;
      const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 1.1;
      const growl = actx.createBiquadFilter(); growl.type = 'peaking'; growl.frequency.value = 260; growl.Q.value = 1.2; growl.gain.value = 5;
      const shaper = actx.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 2.6); }
      shaper.curve = curve;
      const pre = actx.createGain(); pre.gain.value = 0.55;
      const mk = (type, g) => { const o = actx.createOscillator(); o.type = type; o.frequency.value = 50; const og = actx.createGain(); og.gain.value = g; o.connect(og); og.connect(pre); return o; };
      const oscs = [mk('sawtooth', 0.9), mk('sawtooth', 0.7), mk('square', 0.5), mk('sawtooth', 0.25)];   // main, detuned, sub, octave
      pre.connect(shaper); shaper.connect(lp); lp.connect(growl); growl.connect(bus); bus.connect(mix);
      // tiny random wobble of the revs (an engine is never perfectly steady)
      const wob = actx.createOscillator(); wob.type = 'sine'; wob.frequency.value = 2.7;
      const wobG = actx.createGain(); wobG.gain.value = 9;
      wob.connect(wobG); oscs.forEach(o => wobG.connect(o.detune));
      // firing "lope"
      const lfo = actx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 12;
      const lfoG = actx.createGain(); lfoG.gain.value = 0.03 * ENGINE_K;
      lfo.connect(lfoG); lfoG.connect(bus.gain);
      // intake / exhaust breath
      const inSrc = actx.createBufferSource(); inSrc.buffer = noiseBuf; inSrc.loop = true; inSrc.playbackRate.value = 0.7;
      const inF = actx.createBiquadFilter(); inF.type = 'bandpass'; inF.frequency.value = 420; inF.Q.value = 0.8;
      const inG = actx.createGain(); inG.gain.value = 0;
      inSrc.connect(inF); inF.connect(inG); inG.connect(mix);
      // electric / gearbox whine
      const wh = actx.createOscillator(); wh.type = 'triangle'; wh.frequency.value = 260;
      const whG = actx.createGain(); whG.gain.value = 0;
      wh.connect(whG); whG.connect(mix);
      oscs.forEach(o => o.start()); wob.start(); lfo.start(); inSrc.start(); wh.start();

      // ---- tires: gravel grains (trail), swish (grass), low hum ----
      const gSrc = actx.createBufferSource(); gSrc.buffer = makeGravelBuffer(actx); gSrc.loop = true;
      const gHp = actx.createBiquadFilter(); gHp.type = 'highpass'; gHp.frequency.value = 650;
      const gG = actx.createGain(); gG.gain.value = 0;
      gSrc.connect(gHp); gHp.connect(gG); gG.connect(mix); gSrc.start();
      const sSrc = actx.createBufferSource(); sSrc.buffer = noiseBuf; sSrc.loop = true; sSrc.playbackRate.value = 0.9;
      const sF = actx.createBiquadFilter(); sF.type = 'bandpass'; sF.frequency.value = 1500; sF.Q.value = 0.5;
      const sG = actx.createGain(); sG.gain.value = 0;
      sSrc.connect(sF); sF.connect(sG); sG.connect(mix); sSrc.start();
      const hSrc = actx.createBufferSource(); hSrc.buffer = noiseBuf; hSrc.loop = true; hSrc.playbackRate.value = 0.35;
      const hF = actx.createBiquadFilter(); hF.type = 'bandpass'; hF.frequency.value = 130; hF.Q.value = 1.0;
      const hG = actx.createGain(); hG.gain.value = 0;
      hSrc.connect(hF); hF.connect(hG); hG.connect(mix); hSrc.start();

      // ---- wind (grows with speed) ----
      const ws = actx.createBufferSource(); ws.buffer = noiseBuf; ws.loop = true; ws.playbackRate.value = 0.6;
      const wf = actx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 420;
      const wg = actx.createGain(); wg.gain.value = 0.04;
      const wl = actx.createOscillator(); wl.frequency.value = 0.15;
      const wlg = actx.createGain(); wlg.gain.value = 0.02;
      wl.connect(wlg); wlg.connect(wg.gain); wl.start();
      ws.connect(wf); wf.connect(wg); wg.connect(mix); ws.start();

      eng = { bus, lp, oscs, lfo, inG, inF, wh, whG, gSrc, gG, sG, hG, wg, wf };
      if (actx.state === 'suspended') actx.resume();
    } catch (e) { actx = null; eng = null; }
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
  function updateAudio(speedNorm, throttle, onPath, dt, reversing) {
    if (!actx || !eng || actx.state !== 'running') return;
    const t0 = actx.currentTime;
    const sp = Math.min(1, Math.max(0, speedNorm));
    // automatic gearbox: the revs follow the wheels inside a gear and fall at each upshift
    let g = 1;
    for (let i = 1; i < 4; i++) if (sp >= GEAR_AT[i]) g = i + 1;
    if (g !== gear) { if (g > gear) shiftDuck = 1; gear = g; }
    const lo = GEAR_AT[gear - 1], hi = GEAR_AT[gear];
    const frac = Math.min(1, Math.max(0, (sp - lo) / (hi - lo)));
    let target = 0.2 + frac * 0.62 + (gear - 1) * 0.02 + (throttle ? 0.1 : 0);
    if (reversing) target *= 0.9;
    // the engine has inertia: revs climb fast when you push, fall slower when you lift off
    rpmState += (target - rpmState) * Math.min(1, dt * (target > rpmState ? 4.5 : 2.2));
    shiftDuck = Math.max(0, shiftDuck - dt * 7);
    const rpm = Math.min(1, Math.max(0, rpmState));
    const f0 = 26 + rpm * 98;
    eng.oscs[0].frequency.setTargetAtTime(f0, t0, 0.05);
    eng.oscs[1].frequency.setTargetAtTime(f0 * 1.006, t0, 0.05);
    eng.oscs[2].frequency.setTargetAtTime(f0 * 0.5, t0, 0.05);
    eng.oscs[3].frequency.setTargetAtTime(f0 * 2, t0, 0.05);
    eng.lp.frequency.setTargetAtTime(380 + rpm * 1300 + (throttle ? 500 : 0), t0, 0.08);
    eng.bus.gain.setTargetAtTime((0.10 + rpm * 0.13) * (throttle ? 1 : 0.8) * (1 - 0.4 * shiftDuck) * ENGINE_K, t0, 0.06);
    eng.lfo.frequency.setTargetAtTime(f0 * 0.5, t0, 0.08);
    eng.inG.gain.setTargetAtTime((throttle ? 0.012 + rpm * 0.05 : 0.004) * ENGINE_K, t0, 0.1);
    eng.inF.frequency.setTargetAtTime(300 + rpm * 900, t0, 0.1);
    eng.wh.frequency.setTargetAtTime((260 + sp * 760) * (reversing ? 1.25 : 1), t0, 0.08);
    eng.whG.gain.setTargetAtTime(sp * 0.016 * (throttle ? 1 : 0.6) * ENGINE_K, t0, 0.1);
    // ground
    eng.gSrc.playbackRate.setTargetAtTime(0.45 + sp * 1.25, t0, 0.1);
    eng.gG.gain.setTargetAtTime(Math.pow(sp, 1.1) * (onPath ? 0.30 : 0.04) * GRAVEL_K, t0, 0.12);
    eng.sG.gain.setTargetAtTime(sp * (onPath ? 0.02 : 0.10), t0, 0.15);
    eng.hG.gain.setTargetAtTime(sp * 0.16, t0, 0.15);
    eng.wg.gain.setTargetAtTime(0.03 + sp * 0.06, t0, 0.2);
    eng.wf.frequency.setTargetAtTime(380 + sp * 900, t0, 0.2);
  }
  function thud(strength) {
    if (!actx || actx.state !== 'running' || !soundOn) return;
    const now = actx.currentTime;
    if (now - lastThud < 0.25) return;
    lastThud = now;
    const k = Math.min(1, 0.4 + strength);
    // low body "boom"
    const o = actx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(130, now); o.frequency.exponentialRampToValueAtTime(42, now + 0.25);
    const og = actx.createGain();
    og.gain.setValueAtTime(0.55 * k, now); og.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    o.connect(og); og.connect(mix); o.start(now); o.stop(now + 0.32);
    // short crack of the impact
    const s = actx.createBufferSource(); s.buffer = noiseBuf;
    const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.8;
    const g = actx.createGain();
    g.gain.setValueAtTime(0.35 * k, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    s.connect(f); f.connect(g); g.connect(mix);
    s.start(now); s.stop(now + 0.16);
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
  let gameTime = 0.19;   // high morning sun (sun is at the horizon at t=0 -> clock shows 06:00)
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
    skyUniforms.nightAmt.value = 1 - THREE.MathUtils.smoothstep(sh, -0.3, 0.02);
    skyUniforms.cloudCol.value.setRGB(0.25 + dusk * 0.55 + day * 0.72, 0.25 + dusk * 0.30 + day * 0.68, 0.35 + dusk * 0.20 + day * 0.55);
    if (sunGlowEl) sunGlowEl.style.opacity = (day * 0.95).toFixed(2);
    sunLight.intensity = 0.4 + day * 2.2 + dusk * 0.6;
    sunLight.color.setRGB(1.0, 0.75 + day * 0.15, 0.55 + day * 0.25);
    ambientLight.intensity = 0.12 + day * 0.2;
    hemiLight.intensity = 0.25 + day * 0.5;

    const clockH = (gameTime * 24 + 6) % 24;
    const hours = Math.floor(clockH);
    const mins = Math.floor((clockH - hours) * 60);
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
    OUTLINE_W.value = r >= 1.5 ? 0.03 : 0.02 + Math.max(0, r - 1.0) * 0.02;   // thinner outline at low resolution
    pollenU.uSize.value = window.innerHeight * r * 0.045;
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
  perfEl.style.cssText = 'position:fixed;left:50%;top:6px;transform:translateX(-50%);z-index:99998;padding:3px 8px;background:rgba(0,0,0,0.6);color:#9fffb5;font:11px/1.3 monospace;border-radius:6px;pointer-events:none;display:none;white-space:pre;text-align:center;';
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
    medium: { pr: 2.0, bloom: false, shadow: 1024, shR: 40, half: false, grassQ: 0.75, grassD: 0.8, far: 170, bushes: true,
              note: 'Balanced. Slightly softer image, no glow, a bit less grass.' },
    low:    { pr: 1.5, bloom: false, shadow: 1024, shR: 30, half: true,  grassQ: 0.5,  grassD: 0.6, far: 120, bushes: false,
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
    uGrassQ.value = q.grassQ * GRASS3D_RANGE; uGrassD.value = q.grassD * GRASS3D_DENSITY; grassFarMax = Math.min(q.far, GRASS3D_FAR);
    bushLayer.visible = bushState.on = q.bushes;
    bushLayer.live.forEach(m => { if (m) m.visible = q.bushes; });
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

  // ============ Auto performance: finds the best graphics level for THIS phone and keeps the game smooth ============
  // 1) at start: the phone is recognised (GPU name, CPU cores, memory, screen size) and a starting level is chosen
  // 2) while playing: the real frame time is measured; if it is too slow the game steps down one small level at a
  //    time (the least visible savings first), and later it carefully tries to step back up
  // 3) the level that worked is remembered for next time (so a phone is tuned once, then starts right)
  // The canvas is NEVER resized while playing (that was the cause of the black flicker); the levels only change
  // grass density / range, glow, shadow update rate and (last resort) the internal render resolution.
  const LEVELS = [
    { bloom: true,  half: false, gD: 1.00, gQ: 1.00, far: 1e9, bush: true,  res: 1.00 },   // 0  best looks
    { bloom: true,  half: true,  gD: 1.00, gQ: 1.00, far: 1e9, bush: true,  res: 1.00 },   // 1  shadows refreshed every 2nd frame
    { bloom: false, half: true,  gD: 1.00, gQ: 1.00, far: 1e9, bush: true,  res: 1.00 },   // 2  no glow (measured ~10 ms: the biggest saving that is barely visible)
    { bloom: false, half: true,  gD: 0.92, gQ: 0.95, far: 300, bush: true,  res: 1.00 },   // 3  grass only just thinned
    { bloom: false, half: true,  gD: 0.82, gQ: 0.85, far: 240, bush: true,  res: 1.00 },   // 4
    { bloom: false, half: true,  gD: 0.70, gQ: 0.75, far: 190, bush: false, res: 1.00 },   // 5  no bushes
    { bloom: false, half: true,  gD: 0.60, gQ: 0.65, far: 150, bush: false, res: 0.85 },   // 6  slightly lower resolution
    { bloom: false, half: true,  gD: 0.45, gQ: 0.55, far: 120, bush: false, res: 0.70 },   // 7
    { bloom: false, half: true,  gD: 0.30, gQ: 0.45, far: 90,  bush: false, res: 0.60 }    // 8  weakest phones
  ];
  function detectDevice() {
    let gpu = '';
    try {
      const gl = renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
      if (!gpu) gpu = String(gl.getParameter(gl.RENDERER) || '');
    } catch (e) { /* unknown GPU */ }
    const ua = navigator.userAgent || '';
    return {
      gpu, ua,
      cores: navigator.hardwareConcurrency || 4,
      mem: navigator.deviceMemory || 0,
      dpr: window.devicePixelRatio || 1,
      ios: /iPhone|iPad|iPod/.test(ua)
    };
  }
  function estimateLevel(d, pixels) {
    const g = (d.gpu || '').toLowerCase();
    let lvl = 3, m;                                   // unknown phone: start in the middle
    if (d.ios || g.indexOf('apple') >= 0) lvl = 0;
    else if ((m = g.match(/adreno[^\d]*(\d{3})/))) {
      const n = +m[1];
      lvl = n >= 825 ? 0 : n >= 800 ? 1 : n >= 730 ? 0 : n >= 650 ? 1 : n >= 640 ? 2 : n >= 610 ? 3 : 4;
    } else if (/immortalis/.test(g)) lvl = 0;
    else if ((m = g.match(/mali[^\d]*g(\d{2,3})/))) {
      const n = +m[1];
      lvl = n >= 710 ? 1 : n === 78 ? 1 : n === 77 ? 2 : (n === 76 || n === 68 || n === 57 || n === 610 || n === 615) ? 3 : (n === 72 || n === 71 || n === 52) ? 4 : (n === 51 || n === 31) ? 5 : 3;
    } else if (/powervr/.test(g)) lvl = 4;
    else if (/swiftshader|llvmpipe|software/.test(g)) lvl = 7;
    else if (/nvidia|geforce|radeon/.test(g)) lvl = 0;
    else if (/intel/.test(g)) lvl = 1;
    if (d.mem && d.mem <= 3) lvl += 1;
    if (d.cores <= 4) lvl += 1;
    if (pixels > 2.4e6) lvl += 1;
    return Math.max(0, Math.min(LEVELS.length - 1, lvl));
  }
  const autoTune = (() => {
    const dev = detectDevice();
    const key = 'roverAuto6|' + dev.gpu + '|' + dev.cores + '|' + dev.mem;
    const keyM = key + '|m30';
    const MAXL = LEVELS.length - 1;
    let lvl = 0, minLvl = 0, bad = 0, good = 0, lastChange = 0, evalAt = 0, frames = 0;
    let probeUntil = 0, probeFails = 0, probeBlockUntil = 0, saved = -1, capMs = 0, startLvl = 0, mode30 = false;
    function apply(i) {
      const L = LEVELS[i];
      bloomPass.enabled = L.bloom;
      shadowForceHalf = L.half;
      uGrassQ.value = L.gQ * GRASS3D_RANGE; uGrassD.value = L.gD * GRASS3D_DENSITY; grassFarMax = Math.min(L.far, GRASS3D_FAR);
      bushLayer.visible = bushState.on = L.bush;
      bushLayer.live.forEach(m => { if (m) m.visible = L.bush; });
      const pr = Math.max(PR_MIN, PR_MAX * L.res * (mode30 ? 0.75 : 1));   // never below 1.0 (0.6 was a blurry 5x upscale)
      if (Math.abs(pr - curPR) > 0.01) applyPR(pr);
    }
    function init() {
      const px = window.innerWidth * window.innerHeight * Math.pow(Math.min(dev.dpr, 2), 2);
      let start = estimateLevel(dev, px);
      if (/[?&]reset/.test(location.search)) { store.set(key, ''); store.set(keyM, ''); }   // add ?reset to the page address: forget the saved level
      const stored = parseInt(store.get(key), 10);
      if (!isNaN(stored) && stored >= 0 && stored <= MAXL) start = stored;     // this phone was tuned before
      if (store.get(keyM) === '1') mode30 = true;
      else if (isNaN(stored) && start >= 6) { mode30 = true; start = 3; }   // weak phone: steady 30 fps with nicer looks
      lvl = startLvl = start;
      // very weak phones also start with a lighter shadow map / smaller canvas (decided once, before playing)
      applyQuality(mode30 ? 'low' : (start <= 3 ? 'high' : (start <= 5 ? 'medium' : 'low')), false);
      apply(lvl);
      lastChange = performance.now();
    }
    // called every rendered frame; returns true when the level changed (caller resets its smoothing)
    function tick(now, ema) {
      frames++;
      if (frames < 100) return false;                       // warm-up: shader compiles, world streaming
      if (!capMs && frames > 150 && ema < 10.5) capMs = 1000 / 60;   // 90/120 Hz phones that are very fast: steady 60 fps
      if (now < evalAt) return false;
      evalAt = now + 500;
      let changed = false;
      const veryBad = ema > (mode30 ? 55 : 33), isBad = ema > (mode30 ? 38 : 21), isGood = ema < (mode30 ? 35.5 : 18.3);   // 21 ms = below ~47 fps: on 60 Hz screens that already feels uneven
      if (isBad) {
        good = 0; bad += veryBad ? 2 : 1;
        if (bad >= 3 && !mode30 && lvl >= 6) {           // all the cheap tricks are used up: lock to 30 fps and restore the looks instead
          mode30 = true; store.set(keyM, '1'); lvl = 3; apply(lvl); lastChange = now; bad = 0; evalAt = now + 1500;
          return true;
        }
        if (bad >= 3 && lvl < MAXL) {                       // about 1.5 s of slow frames
          lvl = Math.min(MAXL, lvl + (veryBad ? 2 : 1));
          if (now < probeUntil) { probeFails++; probeUntil = 0; probeBlockUntil = now + Math.min(300000, 15000 * Math.pow(2, probeFails - 1)); }   // the step up we just tried did not hold: wait longer before the next try (15 s, 30 s, 1 min, 2 min, 4 min, then every 5 min)
          apply(lvl); lastChange = now; bad = 0; evalAt = now + 1500; changed = true;
        }
      } else if (isGood) {
        bad = 0; good++;
        if (probeUntil && now > probeUntil) { probeFails = 0; probeUntil = 0; }          // the last step up held: forget old failures
        if (lvl > minLvl && now >= probeBlockUntil && good >= 20 && now - lastChange > 12000) {   // ~10 s of full speed: try better looks
          lvl--; probeUntil = now + 8000; apply(lvl); lastChange = now; good = 0; evalAt = now + 1500; changed = true;
        }
      } else {
        bad = Math.max(0, bad - 1); good = 0;
      }
      if (now - lastChange > 25000 && saved !== lvl) { saved = lvl; store.set(key, String(lvl)); }   // remember what works
      return changed;
    }
    return {
      init, tick, dev,
      forceLevel(i) { apply(i); },
      restoreLevel() { apply(lvl); },
      get capMs() { return mode30 ? 1000 / 30 : capMs; },
      get level() { return lvl; },
      label() { return 'auto L' + lvl + (mode30 ? ' | 30fps lock' : (capMs ? ' | 60fps cap' : '')); },
      info() { return (dev.gpu || 'gpu?').slice(0, 38) + ' | ' + dev.cores + ' cores' + (dev.mem ? ' | ' + dev.mem + ' GB' : '') + ' | start L' + startLvl + ' | ' + (USE_HDR ? 'RT16' : 'RT8') + (MSAA_SAMPLES ? ' msaa' + MSAA_SAMPLES : ' nomsaa'); }
    };
  })();

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    bloomPass.setSize(window.innerWidth / 2, window.innerHeight / 2);
    pollenU.uSize.value = window.innerHeight * renderer.getPixelRatio() * 0.045;
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

  let lastRenderAt = 0;
  function animate() {
    requestAnimationFrame(animate);
    const rafNow = performance.now();
    if (autoTune.capMs && rafNow - lastRenderAt < autoTune.capMs - 2) return;   // 120 Hz phones: render at a steady 60 fps
    lastRenderAt = rafNow;
    const jsT0 = performance.now();
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
      if (c.bush && !bushState.on) continue;
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
    updateAudio(speedNorm, keys.forward || keys.backward, onPathNow, dt, velocity < -0.2);
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
      if (c.bush && !bushState.on) continue;
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

    chunkTick++;
    pollenU.uC.value.copy(rover.position);
    if (chunkTick === 1) updateChunks(rx, rz, true); else if ((chunkTick & 7) === 0) updateChunks(rx, rz, false);
    cullGrass(rx, rz);
    shadowFrame++;
    renderer.shadowMap.needsUpdate = shadowDirty || !((shadowHalf || shadowForceHalf) && (shadowFrame & 1));
    shadowDirty = false;
    renderer.info.reset();
    const jsT1 = performance.now();
    for (let rk = 0; rk < dbg.multi; rk++) {       // (speed test only) several renders per frame, so the cost shows even above the 60 fps cap
      if (rk > 0) renderer.shadowMap.needsUpdate = true;
      if (dbg.noPost) renderer.render(scene, camera); else composer.render();
    }
    const jsT2 = performance.now();
    jsEma += ((jsT1 - jsT0) - jsEma) * 0.05;
    subEma += ((jsT2 - jsT1) - subEma) * 0.05;

    // ---- adaptive resolution (checked once a second) ----
    const nowMs = performance.now();
    const rawMs = lastFrameMs ? nowMs - lastFrameMs : 16.7;
    lastFrameMs = nowMs;
    if (rawMs < 250) emaMs += (rawMs - emaMs) * 0.05;
    diagTick(nowMs, rawMs);
    if (!dbg.running && autoTune.tick(nowMs, emaMs)) emaMs = 17;      // level changed: restart the measurement
    if (ADAPTIVE_RES && !dbg.running && nowMs > nextEvalMs) {
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
      perfEl.textContent = 'JS ' + jsEma.toFixed(1) + ' | submit ' + subEma.toFixed(1) + ' | wait ' + Math.max(0, emaMs - jsEma - subEma).toFixed(1) + ' ms\n' + Math.round(1000 / emaMs) + ' fps | ' + emaMs.toFixed(1) + ' ms | res x' + curPR.toFixed(2) + ' | ' + inf.calls + ' calls | ' + Math.round(inf.triangles / 1000) + 'k tris' + ' | ' + autoTune.label() + '\n' + autoTune.info();
    }

    perfFrames++; perfAcc += dt;
    if (perfFrames === 180) {
      // (automatic quality drop disabled)
      perfFrames = -9999;
    }
  }

  // ============ Speed test: finds out what slows the game down on THIS phone ============
  const dbg = { noGrass: false, noPost: false, running: false, multi: 1 };
  let jsEma = 0, subEma = 0;
  perfEl.style.whiteSpace = 'pre';
  function setTrees(v) { treeLayers.forEach(l => { l.visible = v; l.live.forEach(m => { if (m) m.visible = v; }); }); }
  const DIAG_STEPS = [
    { name: 'Full (reference)', on() {}, off() {} },
    { name: 'No post-processing', on() { dbg.noPost = true; }, off() { dbg.noPost = false; } },
    { name: 'No shadows', on() { sunLight.castShadow = false; }, off() { sunLight.castShadow = true; } },
    { name: 'No grass', on() { dbg.noGrass = true; }, off() { dbg.noGrass = false; } },
    { name: 'No trees', on() { setTrees(false); }, off() { setTrees(true); } },
    { name: 'No ground', on() { ground.visible = false; }, off() { ground.visible = true; } },
    { name: 'No sky', on() { sky.visible = false; }, off() { sky.visible = true; } },
    { name: 'No rover', on() { rover.visible = false; }, off() { rover.visible = true; } },
    { name: 'Full again (drift)', on() {}, off() {} }
  ];
  const DIAG_K = 4;   // renders per frame during the test
  const diagHud = document.createElement('div');
  diagHud.style.cssText = 'position:fixed;left:8px;top:96px;z-index:99997;padding:6px 9px;background:rgba(0,0,0,0.75);color:#e8f6ff;font:11px/1.45 monospace;border-radius:8px;pointer-events:none;display:none;white-space:pre;';
  document.body.appendChild(diagHud);
  let diagStep = -1, diagT0 = 0, diagSum = 0, diagN = 0, diagRes = [], diagHideAt = 0;
  let diagCurrent = false;
  function diagStart(useCurrent) {
    diagCurrent = !!useCurrent;
    dbg.running = true; diagRes = []; diagStep = -1; diagT0 = 0; diagHideAt = 0;
    if (!diagCurrent) autoTune.forceLevel(0);          // test the BEST quality (the auto level hides the real costs)
    dbg.multi = DIAG_K;
    document.getElementById('settings-panel').classList.remove('show');
    diagHud.style.display = 'block';
    diagHud.textContent = 'SPEED TEST starting: leave the rover STANDING STILL and do not touch the screen (about 35 seconds)...';
  }
  function diagFinish() {
    dbg.running = false; dbg.multi = 1;
    autoTune.restoreLevel();
    // frame time with DIAG_K renders per frame = max(16.7 ms, DIAG_K x cost of one frame)
    const cost = (ms) => ms > 21 ? ms / DIAG_K : 0;            // 0 = "cheaper than ~5 ms": hidden by the 60 fps cap
    const fmt = (c) => c ? c.toFixed(1) + ' ms' : '< 5 ms';
    const base = cost(diagRes[0].ms);
    let txt = 'SPEED TEST (cost of ONE frame ' + (diagCurrent ? 'at the CURRENT level ' + autoTune.label() : 'at best quality') + ', res x' + curPR.toFixed(2) + ')\n';
    diagRes.forEach((r, i) => {
      const c = cost(r.ms);
      txt += (r.name + '                              ').slice(0, 22) + fmt(c) + '  ' + (c ? Math.round(1000 / c) + ' fps' : '') +
        (i === 0 ? '' : '  (' + (c - base >= 0 ? '+' : '') + (c - base).toFixed(1) + ')') + '\n';
    });
    txt += '\nIf "Full again" differs from "Full (reference)" by more than ~10%, the phone is heating up:\nwait 5 minutes and run it again. Then take a screenshot and send it';
    diagHud.textContent = txt;
    diagHideAt = performance.now() + 120000;
  }
  function diagTick(now, raw) {
    if (!dbg.running) { if (diagHideAt && now > diagHideAt) { diagHud.style.display = 'none'; diagHideAt = 0; } return; }
    if (diagStep >= 0 && now - diagT0 > 800 && raw < 400) { diagSum += raw; diagN++; }
    if (diagStep < 0 || now - diagT0 > 3600) {
      if (diagStep >= 0) {
        DIAG_STEPS[diagStep].off();
        diagRes.push({ name: DIAG_STEPS[diagStep].name, ms: diagN ? diagSum / diagN : 0 });
      }
      diagStep++; diagSum = 0; diagN = 0; diagT0 = now;
      if (diagStep >= DIAG_STEPS.length) { diagFinish(); return; }
      DIAG_STEPS[diagStep].on();
      diagHud.textContent = 'SPEED TEST ' + (diagStep + 1) + '/' + DIAG_STEPS.length + ': ' + DIAG_STEPS[diagStep].name + '\nstand still, do not touch the screen...';
    }
  }
  document.getElementById('diag-btn').addEventListener('click', () => diagStart(false));
  document.getElementById('diag-btn2').addEventListener('click', () => diagStart(true));

  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

  autoTune.init();   // recognise the phone, pick the starting graphics level
  setPerf(store.get('roverFps') !== '0');
  checkOrientation();
  drawMinimap();
  animate();
}