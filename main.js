import * as THREE from 'three';

// ============ הגדרות עולם ============
const WORLD_SIZE = 200;
const HALF = WORLD_SIZE / 2;

// ============ סצנה ============
const scene = new THREE.Scene();
// שמיים בצבע שקיעה חמה כמו בוידאו
scene.background = new THREE.Color(0xd4845a);
scene.fog = new THREE.Fog(0xd4845a, 40, 130);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// ============ תאורת שקיעה חמה ============
const ambientLight = new THREE.AmbientLight(0xffaa77, 0.5);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffcc88, 1.8);
sunLight.position.set(30, 50, 20);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 200;
sunLight.shadow.camera.left = -100;
sunLight.shadow.camera.right = 100;
sunLight.shadow.camera.top = 100;
sunLight.shadow.camera.bottom = -100;
sunLight.shadow.bias = -0.0005;
scene.add(sunLight);

const hemiLight = new THREE.HemisphereLight(0xffaa66, 0x445522, 0.4);
scene.add(hemiLight);

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

// ============ קרקע ============
const groundGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 100, 100);
const pos = groundGeo.attributes.position;
const colors = new Float32Array(pos.count * 3);

for (let i = 0; i < pos.count; i++) {
  const x = pos.getX(i);
  const y = pos.getY(i);
  const h = fbm(x, y) * 3 - 1.5;
  pos.setZ(i, h);

  const nx = (x + HALF) / WORLD_SIZE;
  const nz = (y + HALF) / WORLD_SIZE;
  const dist = Math.sqrt(x * x + y * y);
  const biomeNoise = fbm(x * 0.5, y * 0.5);
  let r, g, b;

  if (dist < 20) { r = 0.25; g = 0.55; b = 0.20; }
  else if (nx < 0.3 && nz < 0.3) { r = 0.15; g = 0.35; b = 0.18; }
  else if (nx > 0.7 && nz < 0.3) { r = 0.82; g = 0.71; b = 0.45; }
  else if (nx < 0.3 && nz > 0.7) { r = 0.85; g = 0.9; b = 0.95; }
  else if (nx > 0.7 && nz > 0.7) { r = 0.35; g = 0.4; b = 0.25; }
  else { r = 0.28 + biomeNoise * 0.08; g = 0.52 + biomeNoise * 0.08; b = 0.22; }

  colors[i * 3] = r;
  colors[i * 3 + 1] = g;
  colors[i * 3 + 2] = b;
}
groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
groundGeo.computeVertexNormals();

const groundMat = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.95,
  metalness: 0.05,
  flatShading: true
});
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

function getGroundHeight(x, z) {
  return fbm(x, z) * 3 - 1.5;
}

// ============ דשא צפוף (10000 להבים!) ============
const grassBladeGeo = new THREE.ConeGeometry(0.05, 0.4, 3);
grassBladeGeo.translate(0, 0.2, 0);
const grassMat = new THREE.MeshStandardMaterial({
  color: 0x3a7a2a,
  flatShading: true,
  side: THREE.DoubleSide
});
const grassCount = 10000;
const grassMesh = new THREE.InstancedMesh(grassBladeGeo, grassMat, grassCount);
grassMesh.receiveShadow = true;

const dummy = new THREE.Object3D();
for (let i = 0; i < grassCount; i++) {
  const x = (Math.random() - 0.5) * WORLD_SIZE * 0.95;
  const z = (Math.random() - 0.5) * WORLD_SIZE * 0.95;
  const h = getGroundHeight(x, z);
  dummy.position.set(x, h, z);
  dummy.rotation.set((Math.random() - 0.5) * 0.2, Math.random() * Math.PI, (Math.random() - 0.5) * 0.2);
  dummy.scale.setScalar(0.8 + Math.random() * 0.6);
  dummy.updateMatrix();
  grassMesh.setMatrixAt(i, dummy.matrix);
}
grassMesh.instanceMatrix.needsUpdate = true;
scene.add(grassMesh);

// ============ פירמידות ברקע (כמו בוידאו) ============
function createPyramid(x, z, size) {
  const pyr = new THREE.Mesh(
    new THREE.ConeGeometry(size, size * 1.5, 4),
    new THREE.MeshStandardMaterial({ color: 0x8b6f47, flatShading: true, roughness: 0.9 })
  );
  pyr.position.set(x, size * 0.75, z);
  pyr.rotation.y = Math.PI / 4;
  pyr.castShadow = true;
  pyr.receiveShadow = true;
  scene.add(pyr);
}

createPyramid(0, -70, 18);
createPyramid(-45, -60, 12);
createPyramid(45, -60, 12);
createPyramid(-80, -80, 14);
createPyramid(80, -80, 14);

// ============ עצים Low Poly ============
function createTree(x, z, type = 'normal') {
  const tree = new THREE.Group();
  const h = getGroundHeight(x, z);

  const trunkH = 1.8 + Math.random() * 0.8;
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.3, trunkH, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1a, flatShading: true });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  tree.add(trunk);

  const leavesColor = type === 'pine' ? 0x1a4a2a : type === 'dead' ? 0x554433 : 0x2d7a3a;

  if (type === 'pine') {
    for (let i = 0; i < 3; i++) {
      const size = 1.6 - i * 0.35;
      const coneGeo = new THREE.ConeGeometry(size, 1.8, 7);
      const coneMat = new THREE.MeshStandardMaterial({ color: leavesColor, flatShading: true });
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.y = trunkH + 0.7 + i * 1.1;
      cone.castShadow = true;
      tree.add(cone);
    }
  } else {
    const leavesGeo = new THREE.IcosahedronGeometry(1.4, 0);
    const leavesMat = new THREE.MeshStandardMaterial({ color: leavesColor, flatShading: true });
    const leaves = new THREE.Mesh(leavesGeo, leavesMat);
    leaves.position.y = trunkH + 1.2;
    leaves.castShadow = true;
    tree.add(leaves);
  }

  tree.position.set(x, h, z);
  tree.scale.setScalar(0.9 + Math.random() * 0.4);
  scene.add(tree);
  return tree;
}

// ============ סלעים Low Poly ============
function createRock(x, z, scale = 1) {
  const h = getGroundHeight(x, z);
  const rockGeo = new THREE.DodecahedronGeometry(0.8, 0);
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x777777, roughness: 0.95, flatShading: true
  });
  const rock = new THREE.Mesh(rockGeo, rockMat);
  rock.scale.set(scale, scale * 0.6, scale);
  rock.position.set(x, h + scale * 0.25, z);
  rock.rotation.set(Math.random(), Math.random(), Math.random());
  rock.castShadow = true;
  rock.receiveShadow = true;
  scene.add(rock);
  return rock;
}

// ============ פיזור טבע ============
const trees = [], rocks = [];
for (let i = 0; i < 100; i++) {
  const x = (Math.random() - 0.5) * WORLD_SIZE * 0.85;
  const z = (Math.random() - 0.5) * WORLD_SIZE * 0.85;
  if (Math.sqrt(x * x + z * z) > 8) {
    const nx = (x + HALF) / WORLD_SIZE;
    const nz = (z + HALF) / WORLD_SIZE;
    let type = 'normal';
    if (nx < 0.3 && nz < 0.3) type = 'pine';
    if (nx > 0.7 && nz < 0.3) type = 'dead';
    trees.push(createTree(x, z, type));
  }
}
for (let i = 0; i < 60; i++) {
  const x = (Math.random() - 0.5) * WORLD_SIZE * 0.85;
  const z = (Math.random() - 0.5) * WORLD_SIZE * 0.85;
  rocks.push(createRock(x, z, 0.5 + Math.random() * 1.2));
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

  const mat = (c, opts = {}) => new THREE.MeshStandardMaterial({
    color: c, flatShading: true, ...opts
  });

  if (data.type === 'ruins') {
    for (let i = 0; i < 4; i++) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 2.5, 6), mat(0xaaaaaa));
      col.position.set(Math.cos(i * Math.PI / 2) * 2, 1.25, Math.sin(i * Math.PI / 2) * 2);
      col.rotation.z = (Math.random() - 0.5) * 0.3;
      col.castShadow = true;
      group.add(col);
    }
    const base = new THREE.Mesh(new THREE.BoxGeometry(5, 0.3, 5), mat(0x888888));
    base.position.y = 0.15;
    group.add(base);
  } else if (data.type === 'lab') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(4, 2.5, 3), mat(0x556677, { metalness: 0.4 }));
    box.position.y = 1.25; box.castShadow = true; group.add(box);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6), mat(0xcccccc));
    antenna.position.set(1, 3.2, 0); group.add(antenna);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6, 0, Math.PI), mat(0xdddddd, { side: THREE.DoubleSide }));
    dish.position.set(1, 3.8, 0); dish.rotation.x = Math.PI; group.add(dish);
  } else if (data.type === 'temple') {
    const pyr = new THREE.Mesh(new THREE.ConeGeometry(3, 4, 4), mat(0xccaa66, { roughness: 0.8 }));
    pyr.position.y = 2; pyr.rotation.y = Math.PI / 4; pyr.castShadow = true; group.add(pyr);
    const glow = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), mat(0xffaa00, { emissive: 0xffaa00, emissiveIntensity: 0.8 }));
    glow.position.y = 4.5; group.add(glow);
    const light = new THREE.PointLight(0xffaa00, 1.5, 10);
    light.position.y = 4.5; group.add(light);
  } else if (data.type === 'monument') {
    const statue = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 5, 6), mat(0x999999, { metalness: 0.3 }));
    statue.position.y = 2.5; statue.castShadow = true; group.add(statue);
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0), mat(0xaaaaaa));
    head.position.y = 5.3; group.add(head);
  } else if (data.type === 'cave') {
    const cave = new THREE.Mesh(new THREE.SphereGeometry(2, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x333333, { side: THREE.BackSide }));
    cave.position.y = 1; group.add(cave);
    const rocks2 = new THREE.Mesh(new THREE.DodecahedronGeometry(2.2, 0), mat(0x555555));
    rocks2.position.y = 0.5; group.add(rocks2);
  } else if (data.type === 'lighthouse') {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 6, 8), mat(0xffffff));
    tower.position.y = 3; tower.castShadow = true; group.add(tower);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 1, 8), mat(0xff3333));
    top.position.y = 6.5; group.add(top);
    const light = new THREE.PointLight(0xffff00, 2, 15);
    light.position.y = 6.5; group.add(light);
    group.userData.light = light;
  } else if (data.type === 'pool') {
    const pool = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.2, 16), mat(0x00aaff, { emissive: 0x0066aa, emissiveIntensity: 0.5, transparent: true, opacity: 0.8 }));
    pool.position.y = 0.1; group.add(pool);
    const light = new THREE.PointLight(0x00aaff, 1.5, 10);
    light.position.y = 1; group.add(light);
  } else if (data.type === 'tree') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 4, 8), mat(0x553311));
    trunk.position.y = 2; trunk.castShadow = true; group.add(trunk);
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(3.5, 1), mat(0x22aa44, { emissive: 0x115522, emissiveIntensity: 0.2 }));
    leaves.position.y = 5; leaves.castShadow = true; group.add(leaves);
  }

  scene.add(group);
  discoveries.push({ group, data, discovered: false });
  return group;
}
discoveryData.forEach(createDiscovery);

// ============ גבישים זוהרים ============
const collectibles = [];
const crystalGeo = new THREE.OctahedronGeometry(0.3, 0);
const crystalColors = [0xffd700, 0x00ffff, 0xff00ff, 0x00ff88, 0xff4444];
for (let i = 0; i < 30; i++) {
  const x = (Math.random() - 0.5) * WORLD_SIZE * 0.85;
  const z = (Math.random() - 0.5) * WORLD_SIZE * 0.85;
  const h = getGroundHeight(x, z);
  const color = crystalColors[Math.floor(Math.random() * crystalColors.length)];
  const crystal = new THREE.Mesh(crystalGeo, new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 0.8,
    transparent: true, opacity: 0.9, flatShading: true
  }));
  crystal.position.set(x, h + 0.8, z);
  const light = new THREE.PointLight(color, 0.6, 3);
  light.position.set(x, h + 0.8, z);
  scene.add(crystal); scene.add(light);
  collectibles.push({ mesh: crystal, light, collected: false, color });
}

// ============ חיות בר ============
const animals = [];
function createAnimal(x, z, type) {
  const h = getGroundHeight(x, z);
  const group = new THREE.Group();
  if (type === 'bird') {
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true }));
    group.add(body);
    const wing1 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.2), new THREE.MeshStandardMaterial({ color: 0xeeeeee }));
    wing1.position.set(0, 0, 0.2); group.add(wing1);
    const wing2 = wing1.clone(); wing2.position.z = -0.2; group.add(wing2);
    group.position.set(x, h + 8 + Math.random() * 4, z);
  } else if (type === 'fox') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: 0xcc6622, flatShading: true }));
    body.position.y = 0.3; group.add(body);
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 0), new THREE.MeshStandardMaterial({ color: 0xcc6622, flatShading: true }));
    head.position.set(0.5, 0.4, 0); group.add(head);
    group.position.set(x, h, z);
  }
  group.userData = { type, speed: 0.5 + Math.random() * 0.5, dir: Math.random() * Math.PI * 2, timer: 0 };
  scene.add(group);
  animals.push(group);
}
for (let i = 0; i < 8; i++) {
  const x = (Math.random() - 0.5) * WORLD_SIZE * 0.7;
  const z = (Math.random() - 0.5) * WORLD_SIZE * 0.7;
  createAnimal(x, z, Math.random() > 0.5 ? 'bird' : 'fox');
}

// ============ בניית הרובר (דומה לוידאו) ============
const rover = new THREE.Group();

// גוף שחור/אפור כהה
const bodyGeo = new THREE.BoxGeometry(1.8, 0.5, 1.2, 2, 1, 1);
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.3, roughness: 0.7, flatShading: true });
const body = new THREE.Mesh(bodyGeo, bodyMat);
body.position.y = 0.6;
body.castShadow = true;
rover.add(body);

// כיפה כחולה בוהקת (כמו בוידאו!)
const domeGeo = new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
const domeMat = new THREE.MeshStandardMaterial({
  color: 0x88ddff,
  metalness: 0.2,
  roughness: 0.3,
  emissive: 0x44aacc,
  emissiveIntensity: 0.4,
  transparent: true,
  opacity: 0.85,
  flatShading: true
});
const dome = new THREE.Mesh(domeGeo, domeMat);
dome.position.y = 0.85;
dome.castShadow = true;
rover.add(dome);

// גלגלים שחורים גדולים עם חישוקים
const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 12);
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95, flatShading: true });
const wheelHubGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.32, 8);
const wheelHubMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.6, flatShading: true });

const wheelPositions = [[-0.9, 0.4, 0.7], [0.9, 0.4, 0.7], [-0.9, 0.4, -0.7], [0.9, 0.4, -0.7]];
wheelPositions.forEach(p => {
  const wheel = new THREE.Mesh(wheelGeo, wheelMat);
  wheel.rotation.z = Math.PI / 2;
  wheel.position.set(...p);
  wheel.castShadow = true;
  rover.add(wheel);

  const hub = new THREE.Mesh(wheelHubGeo, wheelHubMat);
  hub.rotation.z = Math.PI / 2;
  hub.position.set(...p);
  rover.add(hub);
});

// מתלים
const armMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.5, flatShading: true });
const armGeo = new THREE.BoxGeometry(0.1, 0.1, 0.5);
[[-0.8, 0.6, 0.5], [0.8, 0.6, 0.5], [-0.8, 0.6, -0.5], [0.8, 0.6, -0.5]].forEach(p => {
  const arm = new THREE.Mesh(armGeo, armMat);
  arm.position.set(...p);
  arm.rotation.x = 0.3;
  arm.castShadow = true;
  rover.add(arm);
});

// אנטנות כפולות (כמו בוידאו)
const antennaGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6);
const antennaMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
const ant1 = new THREE.Mesh(antennaGeo, antennaMat);
ant1.position.set(-0.2, 1.1, 0);
rover.add(ant1);
const ant2 = ant1.clone();
ant2.position.x = 0.2;
rover.add(ant2);

// פנסים קדמיים זוהרים
const headlightGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.15, 8);
const headlightMat = new THREE.MeshStandardMaterial({
  color: 0xffffaa,
  emissive: 0xffffaa,
  emissiveIntensity: 0.8,
  flatShading: true
});
const hl1 = new THREE.Mesh(headlightGeo, headlightMat);
hl1.rotation.x = Math.PI / 2;
hl1.position.set(-0.5, 0.7, 0.65);
rover.add(hl1);
const hl2 = hl1.clone();
hl2.position.x = 0.5;
rover.add(hl2);

const headLight = new THREE.SpotLight(0xffffaa, 1.0, 12, Math.PI / 6, 0.3);
headLight.position.set(0, 0.8, 0.7);
headLight.target.position.set(0, 0, 10);
rover.add(headLight);
rover.add(headLight.target);

scene.add(rover);
rover.position.set(0, 0, 0);

// ============ בקרת מקשים ============
const keys = { forward: false, backward: false, left: false, right: false };
window.addEventListener('keydown', (e) => {
  switch (e.code) {
    case 'KeyW': case 'ArrowUp': keys.forward = true; break;
    case 'KeyS': case 'ArrowDown': keys.backward = true; break;
    case 'KeyA': case 'ArrowLeft': keys.left = true; break;
    case 'KeyD': case 'ArrowRight': keys.right = true; break;
    case 'KeyE': case 'Space': interact(); break;
  }
});
window.addEventListener('keyup', (e) => {
  switch (e.code) {
    case 'KeyW': case 'ArrowUp': keys.forward = false; break;
    case 'KeyS': case 'ArrowDown': keys.backward = false; break;
    case 'KeyA': case 'ArrowLeft': keys.left = false; break;
    case 'KeyD': case 'ArrowRight': keys.right = false; break;
  }
});

document.querySelectorAll('.ctrl-btn').forEach(btn => {
  const key = btn.dataset.key;
  const start = () => { keys[key] = true; btn.classList.add('active'); };
  const end = () => { keys[key] = false; btn.classList.remove('active'); };
  btn.addEventListener('touchstart', (e) => { e.preventDefault(); start(); });
  btn.addEventListener('touchend', end);
  btn.addEventListener('mousedown', start);
  btn.addEventListener('mouseup', end);
  btn.addEventListener('mouseleave', end);
});

document.getElementById('btn-fullscreen').addEventListener('click', () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
  else document.exitFullscreen();
});

// ============ מערכת אינטראקציה ============
let nearDiscovery = null;
const interactBtn = document.getElementById('btn-interact');
function interact() {
  if (nearDiscovery && !nearDiscovery.discovered) {
    nearDiscovery.discovered = true;
    showDiscoveryToast(nearDiscovery.data.name, nearDiscovery.data.desc);
    updateDiscoveryCount();
    updateQuest();
  }
}
function showDiscoveryToast(title, text) {
  const toast = document.getElementById('discovery-toast');
  document.getElementById('toast-text').textContent = `${title} - ${text}`;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}
function showItemToast(text) {
  const toast = document.getElementById('item-toast');
  document.getElementById('item-text').textContent = text;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}
function updateDiscoveryCount() {
  const count = discoveries.filter(d => d.discovered).length;
  document.getElementById('disc-num').textContent = count;
}
document.getElementById('disc-total').textContent = discoveries.length;

// ============ משימות ============
const quests = [
  { text: 'חקור את העולם וגלה מקומות חדשים', check: () => true },
  { text: 'גלה 3 מקומות מסתוריים', check: () => discoveries.filter(d => d.discovered).length >= 3 },
  { text: 'אסוף 5 גבישים זוהרים', check: () => collectibles.filter(c => c.collected).length >= 5 },
  { text: 'גלה את כל 8 המקומות!', check: () => discoveries.filter(d => d.discovered).length >= 8 }
];
let currentQuest = 0;
function updateQuest() {
  for (let i = quests.length - 1; i >= 0; i--) {
    if (quests[i].check()) { currentQuest = i; break; }
  }
  document.getElementById('quest-text').textContent = quests[currentQuest].text;
}

// ============ מינימפה ============
const minimapCanvas = document.getElementById('minimap-canvas');
const minimapCtx = minimapCanvas.getContext('2d');
const minimapRover = document.getElementById('minimap-rover');

function drawMinimap() {
  const w = minimapCanvas.width, h = minimapCanvas.height;
  minimapCtx.fillStyle = '#1a0f05';
  minimapCtx.fillRect(0, 0, w, h);

  minimapCtx.fillStyle = '#2d5a28';
  minimapCtx.fillRect(0, 0, w, h);
  minimapCtx.fillStyle = '#1a4a2a';
  minimapCtx.fillRect(0, 0, w * 0.3, h * 0.3);
  minimapCtx.fillStyle = '#c9a86c';
  minimapCtx.fillRect(w * 0.7, 0, w * 0.3, h * 0.3);
  minimapCtx.fillStyle = '#dde4ea';
  minimapCtx.fillRect(0, h * 0.7, w * 0.3, h * 0.3);
  minimapCtx.fillStyle = '#5a6640';
  minimapCtx.fillRect(w * 0.7, h * 0.7, w * 0.3, h * 0.3);

  discoveries.forEach(d => {
    const x = ((d.data.pos[0] + HALF) / WORLD_SIZE) * w;
    const y = ((d.data.pos[2] + HALF) / WORLD_SIZE) * h;
    minimapCtx.fillStyle = d.discovered ? '#ffd700' : '#ff8844';
    minimapCtx.beginPath();
    minimapCtx.arc(x, y, d.discovered ? 3 : 4, 0, Math.PI * 2);
    minimapCtx.fill();
  });

  collectibles.forEach(c => {
    if (!c.collected) {
      const x = ((c.mesh.position.x + HALF) / WORLD_SIZE) * w;
      const y = ((c.mesh.position.z + HALF) / WORLD_SIZE) * h;
      minimapCtx.fillStyle = '#ffd700';
      minimapCtx.fillRect(x - 1, y - 1, 2, 2);
    }
  });

  const rx = ((rover.position.x + HALF) / WORLD_SIZE) * w;
  const ry = ((rover.position.z + HALF) / WORLD_SIZE) * h;
  const viewRadius = 40 * (w / WORLD_SIZE);
  const grad = minimapCtx.createRadialGradient(rx, ry, 0, rx, ry, viewRadius);
  grad.addColorStop(0, 'rgba(255,215,0,0.2)');
  grad.addColorStop(1, 'rgba(0,0,0,0.5)');
  minimapCtx.fillStyle = grad;
  minimapCtx.fillRect(0, 0, w, h);

  minimapRover.style.left = rx + 'px';
  minimapRover.style.top = ry + 'px';
}

// ============ לולאת משחק ============
const clock = new THREE.Clock();
const moveSpeed = 7;
const rotSpeed = 2.5;
let currentRot = 0;

function getBiomeName(x, z) {
  const nx = (x + HALF) / WORLD_SIZE;
  const nz = (z + HALF) / WORLD_SIZE;
  const dist = Math.sqrt(x * x + z * z);
  if (dist < 20) return '🌿 שטח ירוק';
  if (nx < 0.3 && nz < 0.3) return '🌲 יער צפוף';
  if (nx > 0.7 && nz < 0.3) return '🏜️ מדבר';
  if (nx < 0.3 && nz > 0.7) return '❄️ אזור מושלג';
  if (nx > 0.7 && nz > 0.7) return ' ביצה';
  return '🌱 ערבה';
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  let moving = false;
  if (keys.forward) {
    rover.position.x -= Math.sin(currentRot) * moveSpeed * dt;
    rover.position.z -= Math.cos(currentRot) * moveSpeed * dt;
    moving = true;
  }
  if (keys.backward) {
    rover.position.x += Math.sin(currentRot) * moveSpeed * dt;
    rover.position.z += Math.cos(currentRot) * moveSpeed * dt;
    moving = true;
  }
  if (keys.left) { currentRot += rotSpeed * dt; rover.rotation.y = currentRot; }
  if (keys.right) { currentRot -= rotSpeed * dt; rover.rotation.y = currentRot; }

  const gh = getGroundHeight(rover.position.x, rover.position.z);
  rover.position.y += (gh - rover.position.y) * 0.2;
  if (moving) {
    rover.position.y += Math.abs(Math.sin(clock.elapsedTime * 12)) * 0.04;
  }

  const limit = HALF - 5;
  rover.position.x = Math.max(-limit, Math.min(limit, rover.position.x));
  rover.position.z = Math.max(-limit, Math.min(limit, rover.position.z));

  document.getElementById('current-biome').textContent = getBiomeName(rover.position.x, rover.position.z);

  // אנימציות גבישים
  collectibles.forEach((c, i) => {
    if (!c.collected) {
      c.mesh.rotation.y += dt * 3;
      const baseH = getGroundHeight(c.mesh.position.x, c.mesh.position.z);
      c.mesh.position.y = baseH + 0.8 + Math.sin(clock.elapsedTime * 3 + i) * 0.15;
    }
  });

  // חיות
  animals.forEach(a => {
    a.userData.timer -= dt;
    if (a.userData.timer <= 0) {
      a.userData.dir = Math.random() * Math.PI * 2;
      a.userData.timer = 2 + Math.random() * 3;
    }
    if (a.userData.type === 'bird') {
      a.position.x += Math.cos(a.userData.dir) * a.userData.speed * dt;
      a.position.z += Math.sin(a.userData.dir) * a.userData.speed * dt;
      a.position.y += Math.sin(clock.elapsedTime * 3) * 0.02;
    } else {
      a.position.x += Math.cos(a.userData.dir) * a.userData.speed * dt * 0.5;
      a.position.z += Math.sin(a.userData.dir) * a.userData.speed * dt * 0.5;
      a.position.y = getGroundHeight(a.position.x, a.position.z);
      a.rotation.y = -a.userData.dir;
    }
    const al = HALF - 10;
    a.position.x = Math.max(-al, Math.min(al, a.position.x));
    a.position.z = Math.max(-al, Math.min(al, a.position.z));
  });

  // בדיקת גילויים קרובים
  nearDiscovery = null;
  let closestDist = 6;
  discoveries.forEach(d => {
    const dx = rover.position.x - d.group.position.x;
    const dz = rover.position.z - d.group.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < closestDist && !d.discovered) { closestDist = dist; nearDiscovery = d; }
  });

  const poiMarker = document.getElementById('poi-marker');
  if (nearDiscovery) {
    interactBtn.classList.add('show');
    poiMarker.style.display = 'flex';
    document.getElementById('poi-label').textContent = nearDiscovery.data.name;
  } else {
    interactBtn.classList.remove('show');
    poiMarker.style.display = 'none';
  }

  // איסוף פריטים
  collectibles.forEach((c, i) => {
    if (!c.collected) {
      const dx = rover.position.x - c.mesh.position.x;
      const dz = rover.position.z - c.mesh.position.z;
      if (Math.sqrt(dx * dx + dz * dz) < 1.5) {
        c.collected = true;
        scene.remove(c.mesh); scene.remove(c.light);
        showItemToast(`גביש זוהר נאסף!`);
        updateQuest();
      }
    }
  });

  // מצלמה חלקה
  const camOffset = new THREE.Vector3(
    Math.sin(currentRot) * 8,
    5,
    Math.cos(currentRot) * 8
  );
  const targetPos = rover.position.clone().add(camOffset);
  camera.position.lerp(targetPos, 0.1);
  camera.lookAt(rover.position.x, rover.position.y + 1, rover.position.z);

  if (Math.floor(clock.elapsedTime * 60) % 10 === 0) drawMinimap();
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

drawMinimap();
animate();