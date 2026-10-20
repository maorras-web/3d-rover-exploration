const canvas = document.getElementById('gameCanvas');
const scene = new THREE.Scene();

// אווירה ותאורה מתקדמת
scene.background = new THREE.Color(0x0e1628);
scene.fog = new THREE.FogExp2(0x0e1628, 0.012);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// תאורת סביבה ושמש
const ambientLight = new THREE.AmbientLight(0x334466, 0.7);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfff5e6, 1.2);
sunLight.position.set(60, 100, 40);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 250;
const d = 60;
sunLight.shadow.camera.left = -d;
sunLight.shadow.camera.right = d;
sunLight.shadow.camera.top = d;
sunLight.shadow.camera.bottom = -d;
scene.add(sunLight);

// יצירת שטח עשיר בגבעות
const terrainSize = 240;
const terrainSegments = 70;
const terrainGeometry = new THREE.PlaneGeometry(terrainSize, terrainSize, terrainSegments, terrainSegments);
terrainGeometry.rotateX(-Math.PI / 2);

const posAttr = terrainGeometry.attributes.position;
for (let i = 0; i < posAttr.count; i++) {
  const x = posAttr.getX(i);
  const z = posAttr.getZ(i);
  const y = Math.sin(x * 0.05) * Math.cos(z * 0.05) * 4 + Math.sin(x * 0.02) * 3;
  posAttr.setY(i, y);
}
terrainGeometry.computeVertexNormals();

const terrainMaterial = new THREE.MeshStandardMaterial({
  color: 0x3b5332,
  flatShading: true,
  roughness: 0.9
});
const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
terrain.receiveShadow = true;
scene.add(terrain);

// הוספת סלעים וקריסטלים זוהרים בסביבה
function createRock(x, z, scale) {
  const geo = new THREE.DodecahedronGeometry(scale, 1);
  const mat = new THREE.MeshStandardMaterial({ color: 0x5a6577, flatShading: true, roughness: 0.8 });
  const rock = new THREE.Mesh(geo, mat);
  rock.position.set(x, scale * 0.4, z);
  rock.rotation.set(Math.random(), Math.random(), Math.random());
  rock.castShadow = true;
  rock.receiveShadow = true;
  scene.add(rock);
}

function createCrystal(x, z, color) {
  const geo = new THREE.ConeGeometry(0.6, 2.5, 5);
  const mat = new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: 0.4, flatShading: true });
  const crystal = new THREE.Mesh(geo, mat);
  crystal.position.set(x, 1, z);
  crystal.rotation.z = (Math.random() - 0.5) * 0.3;
  crystal.castShadow = true;
  scene.add(crystal);
}

for (let i = 0; i < 50; i++) {
  const rx = (Math.random() - 0.5) * 200;
  const rz = (Math.random() - 0.5) * 200;
  if (Math.hypot(rx, rz) > 12) {
    createRock(rx, rz, 1 + Math.random() * 2.5);
  }
}

for (let i = 0; i < 15; i++) {
  const cx = (Math.random() - 0.5) * 180;
  const cz = (Math.random() - 0.5) * 180;
  if (Math.hypot(cx, cz) > 15) {
    createCrystal(cx, cz, i % 2 === 0 ? 0x00ffcc : 0xffaa00);
  }
}

// --- בניית רובוט מפורט (Advanced Rover) ---
const roverGroup = new THREE.Group();

// מרכב ראשי
const bodyGeo = new THREE.BoxGeometry(2.0, 0.7, 3.2);
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2b6cb0, flatShading: true, metalness: 0.2 });
const body = new THREE.Mesh(bodyGeo, bodyMat);
body.position.y = 0.9;
body.castShadow = true;
roverGroup.add(body);

// כיפה שקופה / קוביות סוללה
const domeGeo = new THREE.OctahedronGeometry(0.8, 1);
const domeMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x006666, flatShading: true, roughness: 0.3 });
const dome = new THREE.Mesh(domeGeo, domeMat);
dome.position.set(0, 1.5, -0.3);
roverGroup.add(dome);

// מצלמות וחיישנים קדמיים
const camGeo = new THREE.BoxGeometry(0.6, 0.4, 0.5);
const camMat = new THREE.MeshStandardMaterial({ color: 0x111111, flatShading: true });
const cameraBox = new THREE.Mesh(camGeo, camMat);
cameraBox.position.set(0, 1.1, 1.5);
roverGroup.add(cameraBox);

// גלגלים ומתלים
const wheels = [];
const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.35, 10);
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, flatShading: true, roughness: 0.9 });

const wheelPositions = [
  [-1.2, 0.45, 1.1],
  [1.2, 0.45, 1.1],
  [-1.2, 0.45, -1.1],
  [1.2, 0.45, -1.1]
];

wheelPositions.forEach(pos => {
  const wheel = new THREE.Mesh(wheelGeo, wheelMat);
  wheel.rotation.z = Math.PI / 2;
  wheel.position.set(...pos);
  wheel.castShadow = true;
  roverGroup.add(wheel);
  wheels.push(wheel);
});

scene.add(roverGroup);

// --- מערכת שליטה (מקלדת + כפתורי מגע) ---
const keys = {};
window.addEventListener('keydown', (e) => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);

// חיבור כפתורי המגע בפלאפון
function setupTouchButton(id, keyName) {
  const btn = document.getElementById(id);
  if (!btn) return;
  
  const pressOn = () => keys[keyName] = true;
  const pressOff = () => keys[keyName] = false;

  btn.addEventListener('touchstart', (e) => { e.preventDefault(); pressOn(); btn.classList.add('active'); });
  btn.addEventListener('touchend', (e) => { e.preventDefault(); pressOff(); btn.classList.remove('active'); });
  btn.addEventListener('mousedown', () => { pressOn(); btn.classList.add('active'); });
  btn.addEventListener('mouseup', () => { pressOff(); btn.classList.remove('active'); });
  btn.addEventListener('mouseleave', () => { pressOff(); btn.classList.remove('active'); });
}

setupTouchButton('btn-up', 'w');
setupTouchButton('btn-down', 's');
setupTouchButton('btn-left', 'a');
setupTouchButton('btn-right', 'd');

let speed = 0;
let maxSpeed = 0.22;
let acceleration = 0.01;
let friction = 0.95;
let turnSpeed = 0.035;

// לולאת המשחק
function animate() {
  requestAnimationFrame(animate);

  if (keys['w'] || keys['arrowup']) {
    speed = Math.min(speed + acceleration, maxSpeed);
  } else if (keys['s'] || keys['arrowdown']) {
    speed = Math.max(speed - acceleration, -maxSpeed * 0.5);
  } else {
    speed *= friction;
  }

  if (Math.abs(speed) > 0.001) {
    const dir = speed > 0 ? 1 : -1;
    if (keys['a'] || keys['arrowleft']) {
      roverGroup.rotation.y += turnSpeed * dir;
    }
    if (keys['d'] || keys['arrowright']) {
      roverGroup.rotation.y -= turnSpeed * dir;
    }
  }

  roverGroup.translateZ(speed);
  wheels.forEach(w => w.rotation.x += speed * 2.5);

  // עדכון מצלמה עוקבת
  const cameraOffset = new THREE.Vector3(0, 3.8, -7.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), roverGroup.rotation.y);
  camera.position.copy(roverGroup.position).add(cameraOffset);
  camera.lookAt(roverGroup.position.x, roverGroup.position.y + 0.8, roverGroup.position.z);

  // עדכון מיפוי המפה הקטנה
  const minimapRover = document.getElementById('minimap-rover');
  if (minimapRover) {
    const rx = 50 + (roverGroup.position.x / terrainSize) * 80;
    const rz = 50 + (roverGroup.position.z / terrainSize) * 80;
    minimapRover.style.left = `${Math.max(5, Math.min(95, rx))}%`;
    minimapRover.style.top = `${Math.max(5, Math.min(95, rz))}%`;
  }

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();