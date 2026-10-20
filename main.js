import * as THREE from 'three';

// ============ עולם פתוח - הגדרות ============
const WORLD_SIZE = 300;
const HALF = WORLD_SIZE / 2;

// ============ סצנה, מצלמה, רנדרר ============
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 30, 140);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 500);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

// ============ תאורה דינמית (מחזור יום-לילה) ============
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfff4e0, 1.1);
sunLight.position.set(50, 80, 30);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 200;
sunLight.shadow.camera.left = -80;
sunLight.shadow.camera.right = 80;
sunLight.shadow.camera.top = 80;
sunLight.shadow.camera.bottom = -80;
scene.add(sunLight);

const moonLight = new THREE.DirectionalLight(0x8899cc, 0.3);
moonLight.position.set(-50, 80, -30);
scene.add(moonLight);

// ============ פונקציית noise פשוטה ============
function noise2D(x, z) {
  const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return n - Math.floor(n);
}
function smoothNoise(x, z, scale) {
  const sx = x / scale;
  const sz = z / scale;
  const ix = Math.floor(sx), iz = Math.floor(sz);
  const fx = sx - ix, fz = sz - iz;
  const a = noise2D(ix, iz);
  const b = noise2D(ix + 1, iz);
  const c = noise2D(ix, iz + 1);
  const d = noise2D(ix + 1, iz + 1);
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  return a * (1-ux)*(1-uz) + b * ux*(1-uz) + c * (1-ux)*uz + d * ux*uz;
}
function fbm(x, z) {
  return smoothNoise(x, z, 40) * 0.5 + smoothNoise(x, z, 20) * 0.3 + smoothNoise(x, z, 10) * 0.2;
}

// ============ קרקע עם ביומות ============
const groundGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 80, 80);
const pos = groundGeo.attributes.position;
const colors = new Float32Array(pos.count * 3);

for (let i = 0; i < pos.count; i++) {
  const x = pos.getX(i);
  const y = pos.getY(i);
  const h = fbm(x, y) * 4 - 2;
  pos.setZ(i, h);

  // קביעת ביומה לפי מיקום
  const nx = (x + HALF) / WORLD_SIZE;
  const nz = (y + HALF) / WORLD_SIZE;
  const dist = Math.sqrt(x*x + y*y);
  const biomeNoise = fbm(x * 0.5, y * 0.5);

  let r, g, b;
  if (dist < 25) {
    // מרכז - שטח ירוק
    r = 0.29; g = 0.56; b = 0.25;
  } else if (nx < 0.3 && nz < 0.3) {
    // פינה צפון-מערב - יער צפוף
    r = 0.15; g = 0.35; b = 0.18;
  } else if (nx > 0.7 && nz < 0.3) {
    // פינה צפון-מזרח - מדבר
    r = 0.82; g = 0.71; b = 0.45;
  } else if (nx < 0.3 && nz > 0.7) {
    // פינה דרום-מערב - שלג
    r = 0.85; g = 0.9; b = 0.95;
  } else if (nx > 0.7 && nz > 0.7) {
    // פינה דרום-מזרח - ביצה
    r = 0.35; g = 0.4; b = 0.25;
  } else {
    // ערבות
    r = 0.35 + biomeNoise * 0.1;
    g = 0.55 + biomeNoise * 0.1;
    b = 0.28;
  }
  colors[i*3] = r; colors[i*3+1] = g; colors[i*3+2] = b;
}
groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
groundGeo.computeVertexNormals();

const groundMat = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.95,
  metalness: 0.05
});
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ============ פונקציית גובה ============
function getGroundHeight(x, z) {
  return fbm(x, z) * 4 - 2;
}

// ============ עצים ============
function createTree(x, z, type = 'normal') {
  const tree = new THREE.Group();
  const h = getGroundHeight(x, z);

  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.35, 1.8, 8);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4423 });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 0.9;
  trunk.castShadow = true;
  tree.add(trunk);

  const leavesColor = type === 'pine' ? 0x1a4a2a : type === 'dead' ? 0x554433 : 0x2d7a3a;
  const leavesGeo = type === 'pine' 
    ? new THREE.ConeGeometry(1.5, 3, 8)
    : new THREE.SphereGeometry(1.4, 8, 6);
  const leavesMat = new THREE.MeshStandardMaterial({ color: leavesColor });
  const leaves = new THREE.Mesh(leavesGeo, leavesMat);
  leaves.position.y = type === 'pine' ? 2.5 : 2.2;
  leaves.castShadow = true;
  tree.add(leaves);

  tree.position.set(x, h, z);
  scene.add(tree);
  return tree;
}

// ============ סלעים ============
function createRock(x, z, scale = 1) {
  const h = getGroundHeight(x, z);
  const rockGeo = new THREE.DodecahedronGeometry(0.8, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.9 });
  const rock = new THREE.Mesh(rockGeo, rockMat);
  rock.scale.set(scale, scale * 0.7, scale);
  rock.position.set(x, h + scale * 0.3, z);
  rock.rotation.set(Math.random(), Math.random(), Math.random());
  rock.castShadow = true;
  rock.receiveShadow = true;
  scene.add(rock);
  return rock;
}

// ============ פיזור טבע ============
const trees = [];
const rocks = [];
for (let i = 0; i < 120; i++) {
  const x = (Math.random() - 0.5) * WORLD_SIZE * 0.9;
  const z = (Math.random() - 0.5) * WORLD_SIZE * 0.9;
  if (Math.sqrt(x*x + z*z) > 8) {
    const nx = (x + HALF) / WORLD_SIZE;
    const nz = (z + HALF) / WORLD_SIZE;
    let type = 'normal';
    if (nx < 0.3 && nz < 0.3) type = 'pine';
    if (nx > 0.7 && nz < 0.3) type = 'dead';
    trees.push(createTree(x, z, type));
  }
}
for (let i = 0; i < 60; i++) {
  const x = (Math.random() - 0.5) * WORLD_SIZE * 0.9;
  const z = (Math.random() - 0.5) * WORLD_SIZE * 0.9;
  rocks.push(createRock(x, z, 0.5 + Math.random() * 1.5));
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

  if (data.type === 'ruins') {
    // עמודים שבורים
    for (let i = 0; i < 4; i++) {
      const col = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.35, 2.5, 8),
        new THREE.MeshStandardMaterial({ color: 0xaaaaaa })
      );
      col.position.set(Math.cos(i * Math.PI/2) * 2, 1.25, Math.sin(i * Math.PI/2) * 2);
      col.rotation.z = (Math.random() - 0.5) * 0.3;
      col.castShadow = true;
      group.add(col);
    }
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(5, 0.3, 5),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    base.position.y = 0.15;
    group.add(base);
  } else if (data.type === 'lab') {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(4, 2.5, 3),
      new THREE.MeshStandardMaterial({ color: 0x556677, metalness: 0.4 })
    );
    box.position.y = 1.25;
    box.castShadow = true;
    group.add(box);
    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6),
      new THREE.MeshStandardMaterial({ color: 0xcccccc })
    );
    antenna.position.set(1, 3.2, 0);
    group.add(antenna);
    const dish = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 8, 6, 0, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0xdddddd, side: THREE.DoubleSide })
    );
    dish.position.set(1, 3.8, 0);
    dish.rotation.x = Math.PI;
    group.add(dish);
  } else if (data.type === 'temple') {
    const pyr = new THREE.Mesh(
      new THREE.ConeGeometry(3, 4, 4),
      new THREE.MeshStandardMaterial({ color: 0xccaa66, roughness: 0.8 })
    );
    pyr.position.y = 2;
    pyr.rotation.y = Math.PI / 4;
    pyr.castShadow = true;
    group.add(pyr);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xffaa00, emissiveIntensity: 0.8 })
    );
    glow.position.y = 4.5;
    group.add(glow);
    const light = new THREE.PointLight(0xffaa00, 1.5, 10);
    light.position.y = 4.5;
    group.add(light);
  } else if (data.type === 'monument') {
    const statue = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.8, 5, 8),
      new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.3 })
    );
    statue.position.y = 2.5;
    statue.castShadow = true;
    group.add(statue);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xaaaaaa })
    );
    head.position.y = 5.3;
    group.add(head);
  } else if (data.type === 'cave') {
    const cave = new THREE.Mesh(
      new THREE.SphereGeometry(2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x333333, side: THREE.BackSide })
    );
    cave.position.y = 1;
    group.add(cave);
    const rocks2 = new THREE.Mesh(
      new THREE.DodecahedronGeometry(2.2, 1),
      new THREE.MeshStandardMaterial({ color: 0x555555 })
    );
    rocks2.position.y = 0.5;
    group.add(rocks2);
  } else if (data.type === 'lighthouse') {
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 1.2, 6, 8),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    tower.position.y = 3;
    tower.castShadow = true;
    group.add(tower);
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.8, 1, 8),
      new THREE.MeshStandardMaterial({ color: 0xff3333 })
    );
    top.position.y = 6.5;
    group.add(top);
    const light = new THREE.PointLight(0xffff00, 2, 15);
    light.position.y = 6.5;
    group.add(light);
    group.userData.light = light;
  } else if (data.type === 'pool') {
    const pool = new THREE.Mesh(
      new THREE.CylinderGeometry(3, 3, 0.2, 24),
      new THREE.MeshStandardMaterial({ color: 0x00aaff, emissive: 0x0066aa, emissiveIntensity: 0.5, transparent: true, opacity: 0.8 })
    );
    pool.position.y = 0.1;
    group.add(pool);
    const light = new THREE.PointLight(0x00aaff, 1.5, 10);
    light.position.y = 1;
    group.add(light);
  } else if (data.type === 'tree') {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 1.2, 4, 12),
      new THREE.MeshStandardMaterial({ color: 0x553311 })
    );
    trunk.position.y = 2;
    trunk.castShadow = true;
    group.add(trunk);
    const leaves = new THREE.Mesh(
      new THREE.SphereGeometry(3.5, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0x22aa44, emissive: 0x115522, emissiveIntensity: 0.2 })
    );
    leaves.position.y = 5;
    leaves.castShadow = true;
    group.add(leaves);
  }

  scene.add(group);
  discoveries.push({
    group,
    data,
    discovered: false,
    marker: null
  });
  return group;
}

discoveryData.forEach(createDiscovery);

// ============ פריטים לאסוף (גבישים) ============
const collectibles = [];
const crystalGeo = new THREE.OctahedronGeometry(0.3, 0);
const crystalColors = [0x00ffff, 0xff00ff, 0x00ff88, 0xffaa00, 0xff4444];

for (let i = 0; i < 25; i++) {
  const x = (Math.random() - 0.5) * WORLD_SIZE * 0.85;
  const z = (Math.random() - 0.5) * WORLD_SIZE * 0.85;
  const h = getGroundHeight(x, z);
  const color = crystalColors[Math.floor(Math.random() * crystalColors.length)];
  const crystal = new THREE.Mesh(
    crystalGeo,
    new THREE.MeshStandardMaterial({ 
      color, emissive: color, emissiveIntensity: 0.6,
      transparent: true, opacity: 0.85
    })
  );
  crystal.position.set(x, h + 0.8, z);
  const light = new THREE.PointLight(color, 0.5, 3);
  light.position.set(x, h + 0.8, z);
  scene.add(crystal);
  scene.add(light);
  collectibles.push({ mesh: crystal, light, collected: false, color });
}

// ============ חיות בר ============
const animals = [];
function createAnimal(x, z, type) {
  const h = getGroundHeight(x, z);
  const group = new THREE.Group();
  
  if (type === 'bird') {
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    group.add(body);
    const wing1 = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.05, 0.2),
      new THREE.MeshStandardMaterial({ color: 0xeeeeee })
    );
    wing1.position.set(0, 0, 0.2);
    group.add(wing1);
    const wing2 = wing1.clone();
    wing2.position.z = -0.2;
    group.add(wing2);
    group.position.set(x, h + 8 + Math.random() * 4, z);
  } else if (type === 'fox') {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.4, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xcc6622 })
    );
    body.position.y = 0.3;
    group.add(body);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xcc6622 })
    );
    head.position.set(0.5, 0.4, 0);
    group.add(head);
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

// ============ בניית הרובר ============
const rover = new THREE.Group();

const domeGeo = new THREE.SphereGeometry(0.8, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
const domeMat = new THREE.MeshStandardMaterial({ color: 0xaaddff, metalness: 0.3, roughness: 0.4 });
const dome = new THREE.Mesh(domeGeo, domeMat);
dome.position.y = 1;
dome.castShadow = true;
rover.add(dome);

const bodyGeo = new THREE.BoxGeometry(2, 0.6, 1.6);
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x556677, metalness: 0.4, roughness: 0.5 });
const body = new THREE.Mesh(bodyGeo, bodyMat);
body.position.y = 0.7;
body.castShadow = true;
rover.add(body);

const wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.4, 16);
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
[[-1.1, 0.55, 0.9], [1.1, 0.55, 0.9], [-1.1, 0.55, -0.9], [1.1, 0.55, -0.9]].forEach(p => {
  const wheel = new THREE.Mesh(wheelGeo, wheelMat);
  wheel.rotation.z = Math.PI / 2;
  wheel.position.set(...p);
  wheel.castShadow = true;
  rover.add(wheel);
});

const armMat = new THREE.MeshStandardMaterial({ color: 0x8899aa, metalness: 0.5 });
const armGeo = new THREE.BoxGeometry(0.15, 0.15, 0.8);
[[-1, 0.8, 0.7], [1, 0.8, 0.7], [-1, 0.8, -0.7], [1, 0.8, -0.7]].forEach(p => {
  const arm = new THREE.Mesh(armGeo, armMat);
  arm.position.set(...p);
  arm.rotation.x = 0.3;
  arm.castShadow = true;
  rover.add(arm);
});

const sensorGeo = new THREE.BoxGeometry(0.2, 0.1, 0.1);
const sensorMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x003333 });
const sensorL = new THREE.Mesh(sensorGeo, sensorMat);
sensorL.position.set(-0.3, 1.1, 0.75);
rover.add(sensorL);
const sensorR = new THREE.Mesh(sensorGeo, sensorMat);
sensorR.position.set(0.3, 1.1, 0.75);
rover.add(sensorR);

const antennaGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6);
const antennaMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
const antenna = new THREE.Mesh(antennaGeo, antennaMat);
antenna.position.set(0, 1.8, 0);
rover.add(antenna);

const antennaBall = new THREE.Mesh(
  new THREE.SphereGeometry(0.08, 8, 6),
  new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.6 })
);
antennaBall.position.set(0, 2.1, 0);
rover.add(antennaBall);

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
    if (quests[i].check()) {
      currentQuest = i;
      break;
    }
  }
  document.getElementById('quest-text').textContent = quests[currentQuest].text;
}

// ============ מינימפה ============
const minimapCanvas = document.getElementById('minimap-canvas');
const minimapCtx = minimapCanvas.getContext('2d');
const minimapRover = document.getElementById('minimap-rover');

function drawMinimap() {
  const w = minimapCanvas.width;
  const h = minimapCanvas.height;
  minimapCtx.fillStyle = '#0a1410';
  minimapCtx.fillRect(0, 0, w, h);

  const scale = w / WORLD_SIZE;
  const cx = w / 2, cy = h / 2;

  // אזורים
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

  // גילויים
  discoveries.forEach(d => {
    const x = ((d.data.pos[0] + HALF) / WORLD_SIZE) * w;
    const y = ((d.data.pos[2] + HALF) / WORLD_SIZE) * h;
    minimapCtx.fillStyle = d.discovered ? '#00ffaa' : '#ffaa00';
    minimapCtx.beginPath();
    minimapCtx.arc(x, y, d.discovered ? 3 : 4, 0, Math.PI * 2);
    minimapCtx.fill();
  });

  // פריטים
  collectibles.forEach(c => {
    if (!c.collected) {
      const x = ((c.mesh.position.x + HALF) / WORLD_SIZE) * w;
      const y = ((c.mesh.position.z + HALF) / WORLD_SIZE) * h;
      minimapCtx.fillStyle = '#00ffff';
      minimapCtx.fillRect(x - 1, y - 1, 2, 2);
    }
  });

  // טווח ראייה
  const rx = ((rover.position.x + HALF) / WORLD_SIZE) * w;
  const ry = ((rover.position.z + HALF) / WORLD_SIZE) * h;
  const viewRadius = 40 * scale;
  const grad = minimapCtx.createRadialGradient(rx, ry, 0, rx, ry, viewRadius);
  grad.addColorStop(0, 'rgba(255,255,255,0.15)');
  grad.addColorStop(1, 'rgba(0,0,0,0.4)');
  minimapCtx.fillStyle = grad;
  minimapCtx.fillRect(0, 0, w, h);

  minimapRover.style.left = rx + 'px';
  minimapRover.style.top = ry + 'px';
}

// ============ לולאת משחק ============
const clock = new THREE.Clock();
const moveSpeed = 8;
const rotSpeed = 2.5;
let currentRot = 0;
let gameTime = 0.35; // 0-1 (0.25 = בוקר, 0.5 = צהריים, 0.75 = ערב)

function getBiomeName(x, z) {
  const nx = (x + HALF) / WORLD_SIZE;
  const nz = (z + HALF) / WORLD_SIZE;
  const dist = Math.sqrt(x*x + z*z);
  if (dist < 25) return '🌿 שטח ירוק';
  if (nx < 0.3 && nz < 0.3) return '🌲 יער צפוף';
  if (nx > 0.7 && nz < 0.3) return '🏜️ מדבר';
  if (nx < 0.3 && nz > 0.7) return '❄️ אזור מושלג';
  if (nx > 0.7 && nz > 0.7) return '🌾 ביצה';
  return '🌱 ערבה';
}

function updateDayNight(dt) {
  gameTime = (gameTime + dt * 0.01) % 1;
  const sunAngle = gameTime * Math.PI * 2;
  const sunHeight = Math.sin(sunAngle);
  
  sunLight.position.set(Math.cos(sunAngle) * 80, Math.max(sunHeight * 80, -20), 30);
  moonLight.position.set(-Math.cos(sunAngle) * 80, Math.max(-sunHeight * 80, -20), -30);
  
  const dayFactor = Math.max(0, sunHeight);
  ambientLight.intensity = 0.3 + dayFactor * 0.4;
  sunLight.intensity = dayFactor * 1.2;
  moonLight.intensity = (1 - dayFactor) * 0.4;
  
  const skyColor = new THREE.Color();
  if (dayFactor > 0.3) skyColor.setRGB(0.53, 0.81, 0.92);
  else if (dayFactor > 0) skyColor.setRGB(0.9, 0.5, 0.3);
  else skyColor.setRGB(0.05, 0.05, 0.15);
  scene.background = skyColor;
  scene.fog.color = skyColor;

  const hours = Math.floor(gameTime * 24);
  const mins = Math.floor((gameTime * 24 - hours) * 60);
  const icon = dayFactor > 0.3 ? '🌞' : dayFactor > 0 ? '🌅' : '';
  document.getElementById('time-display').textContent = `${icon} ${String(hours).padStart(2,'0')}:${String(mins).padStart(2,'0')}`;
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  // תנועה
  let moving = false;
  if (keys.forward) {
    rover.position.z -= Math.cos(currentRot) * moveSpeed * dt;
    rover.position.x -= Math.sin(currentRot) * moveSpeed * dt;
    moving = true;
  }
  if (keys.backward) {
    rover.position.z += Math.cos(currentRot) * moveSpeed * dt;
    rover.position.x += Math.sin(currentRot) * moveSpeed * dt;
    moving = true;
  }
  if (keys.left) {
    currentRot += rotSpeed * dt;
    rover.rotation.y = currentRot;
  }
  if (keys.right) {
    currentRot -= rotSpeed * dt;
    rover.rotation.y = currentRot;
  }

  // גובה לפי קרקע
  const gh = getGroundHeight(rover.position.x, rover.position.z);
  rover.position.y += (gh - rover.position.y) * 0.2;
  
  if (moving) {
    rover.position.y += Math.abs(Math.sin(clock.elapsedTime * 10)) * 0.03;
  }

  const limit = HALF - 5;
  rover.position.x = Math.max(-limit, Math.min(limit, rover.position.x));
  rover.position.z = Math.max(-limit, Math.min(limit, rover.position.z));

  // עדכון ביומה
  document.getElementById('current-biome').textContent = getBiomeName(rover.position.x, rover.position.z);

  // אנימציות
  collectibles.forEach((c, i) => {
    if (!c.collected) {
      c.mesh.rotation.y += dt * 2;
      c.mesh.position.y = getGroundHeight(c.mesh.position.x, c.mesh.position.z) + 0.8 + Math.sin(clock.elapsedTime * 2 + i) * 0.2;
    }
  });

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
    const dist = Math.sqrt(dx*dx + dz*dz);
    if (dist < closestDist && !d.discovered) {
      closestDist = dist;
      nearDiscovery = d;
    }
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
      if (Math.sqrt(dx*dx + dz*dz) < 1.5) {
        c.collected = true;
        scene.remove(c.mesh);
        scene.remove(c.light);
        showItemToast(`גביש ${['כחול','סגול','ירוק','זהב','אדום'][i % 5]} נאסף!`);
        updateQuest();
      }
    }
  });

  // מצלמה חלקה
  const camOffset = new THREE.Vector3(
    Math.sin(currentRot) * 9,
    6,
    Math.cos(currentRot) * 9
  );
  const targetPos = rover.position.clone().add(camOffset);
  camera.position.lerp(targetPos, 0.08);
  camera.lookAt(rover.position.x, rover.position.y + 1.5, rover.position.z);

  // עדכון יום-לילה
  updateDayNight(dt);

  // מינימפה (כל 10 פריימים לביצועים)
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