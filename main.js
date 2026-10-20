const canvas = document.getElementById('gameCanvas');
const scene = new THREE.Scene();

scene.background = new THREE.Color(0x0e1628);
scene.fog = new THREE.FogExp2(0x0e1628, 0.012);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

const ambientLight = new THREE.AmbientLight(0x334466, 0.7);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfff5e6, 1.2);
sunLight.position.set(60, 100, 40);
sunLight.castShadow = true;
scene.add(sunLight);

// גובה פני השטח
function getTerrainHeight(x, z) {
  return Math.sin(x * 0.05) * Math.cos(z * 0.05) * 4 + Math.sin(x * 0.02) * 3;
}

// יצירת הקרקע
const terrainSize = 240;
const terrainSegments = 70;
const terrainGeometry = new THREE.PlaneGeometry(terrainSize, terrainSize, terrainSegments, terrainSegments);
terrainGeometry.rotateX(-Math.PI / 2);

const posAttr = terrainGeometry.attributes.position;
for (let i = 0; i < posAttr.count; i++) {
  const x = posAttr.getX(i);
  const z = posAttr.getZ(i);
  posAttr.setY(i, getTerrainHeight(x, z));
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

// בניית מודל הרובוט
const roverGroup = new THREE.Group();

const bodyGeo = new THREE.BoxGeometry(2.0, 0.7, 3.2);
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2b6cb0, flatShading: true });
const body = new THREE.Mesh(bodyGeo, bodyMat);
body.position.y = 0.9;
body.castShadow = true;
roverGroup.add(body);

const domeGeo = new THREE.OctahedronGeometry(0.8, 1);
const domeMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x006666, flatShading: true });
const dome = new THREE.Mesh(domeGeo, domeMat);
dome.position.set(0, 1.5, -0.3);
roverGroup.add(dome);

const wheels = [];
const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.35, 10);
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, flatShading: true });

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

// ניהול קלט מקשים ומגע
const keys = {};
window.addEventListener('keydown', (e) => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);

function setupTouchButton(id, keyName) {
  const btn = document.getElementById(id);
  if (!btn) return;
  
  const pressOn = (e) => { if(e) e.preventDefault(); keys[keyName] = true; btn.classList.add('active'); };
  const pressOff = (e) => { if(e) e.preventDefault(); keys[keyName] = false; btn.classList.remove('active'); };

  btn.addEventListener('touchstart', pressOn, {passive: false});
  btn.addEventListener('touchend', pressOff, {passive: false});
  btn.addEventListener('mousedown', pressOn);
  btn.addEventListener('mouseup', pressOff);
  btn.addEventListener('mouseleave', pressOff);
}

setupTouchButton('btn-up', 'w');
setupTouchButton('btn-down', 's');
setupTouchButton('btn-left', 'a');
setupTouchButton('btn-right', 'd');

// כפתור מסך מלא למובייל
const fsBtn = document.getElementById('btn-fullscreen');
if (fsBtn) {
  fsBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });
}

let speed = 0;
let maxSpeed = 0.22;
let acceleration = 0.01;
let friction = 0.95;
let turnSpeed = 0.035;

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
    if (keys['a'] || keys['arrowleft']) roverGroup.rotation.y += turnSpeed * dir;
    if (keys['d'] || keys['arrowright']) roverGroup.rotation.y -= turnSpeed * dir;
  }

  roverGroup.translateZ(speed);

  // הצמדה מדויקת לאדמה
  const groundY = getTerrainHeight(roverGroup.position.x, roverGroup.position.z);
  roverGroup.position.y = groundY;

  wheels.forEach(w => w.rotation.x += speed * 2.5);

  const cameraOffset = new THREE.Vector3(0, 3.8, -7.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), roverGroup.rotation.y);
  camera.position.copy(roverGroup.position).add(cameraOffset);
  camera.lookAt(roverGroup.position.x, roverGroup.position.y + 0.8, roverGroup.position.z);

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();