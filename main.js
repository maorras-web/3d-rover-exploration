// --- הגדרות סצנה בסיסיות ---
const canvas = document.getElementById('gameCanvas');
const scene = new THREE.Scene();

// הוספת ערפל בסגנון Low Poly
scene.background = new THREE.Color(0xa0d8ef);
scene.fog = new THREE.FogExp2(0xa0d8ef, 0.015);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// --- תאורה ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfffaed, 0.8);
sunLight.position.set(50, 80, 50);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 200;
const d = 50;
sunLight.shadow.camera.left = -d;
sunLight.shadow.camera.right = d;
sunLight.shadow.camera.top = d;
sunLight.shadow.camera.bottom = -d;
scene.add(sunLight);

// --- יצירת השטח (Low Poly Terrain) ---
const terrainSize = 200;
const terrainSegments = 60;
const terrainGeometry = new THREE.PlaneGeometry(terrainSize, terrainSize, terrainSegments, terrainSegments);
terrainGeometry.rotateX(-Math.PI / 2);

// עיוות קודקודים ליצירת גבעות
const posAttr = terrainGeometry.attributes.position;
for (let i = 0; i < posAttr.count; i++) {
  const x = posAttr.getX(i);
  const z = posAttr.getZ(i);
  const y = Math.sin(x * 0.08) * Math.cos(z * 0.08) * 3 + Math.sin(x * 0.03) * 2;
  posAttr.setY(i, y);
}
terrainGeometry.computeVertexNormals();

const terrainMaterial = new THREE.MeshStandardMaterial({
  color: 0x559944,
  flatShading: true, // סגנון Low Poly מובהק
  roughness: 0.8
});
const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
terrain.receiveShadow = true;
scene.add(terrain);

// --- הוספת אלמנטים בסביבה (סלעים ועצים Low Poly) ---
function createLowPolyRock(x, z, scale) {
  const geo = new THREE.DodecahedronGeometry(scale, 1);
  const mat = new THREE.MeshStandardMaterial({ color: 0x888888, flatShading: true });
  const rock = new THREE.Mesh(geo, mat);
  rock.position.set(x, scale * 0.5, z);
  rock.rotation.set(Math.random(), Math.random(), Math.random());
  rock.castShadow = true;
  rock.receiveShadow = true;
  scene.add(rock);
}

for (let i = 0; i < 40; i++) {
  const rx = (Math.random() - 0.5) * 160;
  const rz = (Math.random() - 0.5) * 160;
  if (Math.hypot(rx, rz) > 10) {
    createLowPolyRock(rx, rz, 1 + Math.random() * 2);
  }
}

// --- בניית הרובוט (Low Poly Rover) ---
const roverGroup = new THREE.Group();

// גוף הרובוט
const bodyGeo = new THREE.BoxGeometry(2.2, 0.8, 3);
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3377aa, flatShading: true });
const body = new THREE.Mesh(bodyGeo, bodyMat);
body.position.y = 1;
body.castShadow = true;
roverGroup.add(body);

// כיפה עליונה
const domeGeo = new THREE.SphereGeometry(0.9, 8, 6);
const domeMat = new THREE.MeshStandardMaterial({ color: 0x66ccff, flatShading: true });
const dome = new THREE.Mesh(domeGeo, domeMat);
dome.position.set(0, 1.5, -0.2);
roverGroup.add(dome);

// גלגלים
const wheels = [];
const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 8);
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, flatShading: true });

const wheelPositions = [
  [-1.3, 0.5, 1.1],  // קדמי שמאלי
  [1.3, 0.5, 1.1],   // קדמי ימני
  [-1.3, 0.5, -1.1], // אחורי שמאלי
  [1.3, 0.5, -1.1]   // אחורי ימני
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

// --- שליטה בתנועה ---
const keys = {};
window.addEventListener('keydown', (e) => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);

let speed = 0;
let maxSpeed = 0.25;
let acceleration = 0.01;
let friction = 0.96;
let turnSpeed = 0.03;

// --- לולאת המשחק (Animation Loop) ---
function animate() {
  requestAnimationFrame(animate);

  // חישוב תנועה קדימה / אחורה
  if (keys['w'] || keys['arrowup']) {
    speed = Math.min(speed + acceleration, maxSpeed);
  } else if (keys['s'] || keys['arrowdown']) {
    speed = Math.max(speed - acceleration, -maxSpeed * 0.5);
  } else {
    speed *= friction;
  }

  // פנייה ימינה / שמאלה
  if (Math.abs(speed) > 0.001) {
    const dir = speed > 0 ? 1 : -1;
    if (keys['a'] || keys['arrowleft']) {
      roverGroup.rotation.y += turnSpeed * dir;
    }
    if (keys['d'] || keys['arrowright']) {
      roverGroup.rotation.y -= turnSpeed * dir;
    }
  }

  // עדכון מיקום הרובוט
  roverGroup.translateZ(speed);

  // סיבוב גלגלים לפי התנועה
  wheels.forEach(w => w.rotation.x += speed * 2);

  // עדכון מיקום מצלמה - מעקב גוף שלישי (Third-person)
  const cameraOffset = new THREE.Vector3(0, 4, -8).applyAxisAngle(new THREE.Vector3(0, 1, 0), roverGroup.rotation.y);
  camera.position.copy(roverGroup.position).add(cameraOffset);
  camera.lookAt(roverGroup.position.x, roverGroup.position.y + 1, roverGroup.position.z);

  // רינדור הסצנה
  renderer.render(scene, camera);
}

// התאמת גודל חלון
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// התחלת המשחק
animate();