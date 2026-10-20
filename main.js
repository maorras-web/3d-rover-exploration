import * as THREE from 'three';

// 1. הגדרת סצנה, מצלמה ורנדרר
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// 2. יצירת משטח הדשא והתאורה
const groundGeo = new THREE.PlaneGeometry(120, 120);
const groundMat = new THREE.MeshStandardMaterial({ 
    color: 0x2ecc71, // ירוק דשא
    roughness: 0.9,
    metalness: 0.1
});

const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2; // שכיבה אופקית
ground.receiveShadow = true;
scene.add(ground);

// תאורת סביבה ואור שמש עם צללים
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
sunLight.position.set(20, 40, 20);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
scene.add(sunLight);

// 3. בניית התותח הקלאסי
const cannonGroup = new THREE.Group();

// גוף התותח
const bodyGeo = new THREE.BoxGeometry(1.4, 0.8, 1.8);
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.4 });
const body = new THREE.Mesh(bodyGeo, bodyMat);
body.position.y = 0.5;
body.castShadow = true;
body.receiveShadow = true;
cannonGroup.add(body);

// קנה התותח
const barrelGeo = new THREE.CylinderGeometry(0.3, 0.4, 2.2, 16);
const barrelMat = new THREE.MeshStandardMaterial({ color: 0x7f8c8d, metalness: 0.7, roughness: 0.3 });
const barrel = new THREE.Mesh(barrelGeo, barrelMat);
barrel.rotation.x = Math.PI / 2;
barrel.position.set(0, 0.9, 0.8);
barrel.castShadow = true;
cannonGroup.add(barrel);

// גלגלים
const wheelGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.3, 16);
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });

const leftWheel = new THREE.Mesh(wheelGeo, wheelMat);
leftWheel.rotation.z = Math.PI / 2;
leftWheel.position.set(-0.85, 0.6, 0);
leftWheel.castShadow = true;
cannonGroup.add(leftWheel);

const rightWheel = new THREE.Mesh(wheelGeo, wheelMat);
rightWheel.rotation.z = Math.PI / 2;
rightWheel.position.set(0.85, 0.6, 0);
rightWheel.castShadow = true;
cannonGroup.add(rightWheel);

scene.add(cannonGroup);

// 4. ניהול מקשים לשליטה חופשית (W, A, S, D או חיצים)
const keys = {
    forward: false,
    backward: false,
    left: false,
    right: false
};

window.addEventListener('keydown', (e) => {
    switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
            keys.forward = true;
            break;
        case 'KeyS':
        case 'ArrowDown':
            keys.backward = true;
            break;
        case 'KeyA':
        case 'ArrowLeft':
            keys.left = true;
            break;
        case 'KeyD':
        case 'ArrowRight':
            keys.right = true;
            break;
    }
});

window.addEventListener('keyup', (e) => {
    switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
            keys.forward = false;
            break;
        case 'KeyS':
        case 'ArrowDown':
            keys.backward = false;
            break;
        case 'KeyA':
        case 'ArrowLeft':
            keys.left = false;
            break;
        case 'KeyD':
        case 'ArrowRight':
            keys.right = false;
            break;
    }
});

const moveSpeed = 0.15;

// 5. לולאת המשחק (Game Loop)
function animate() {
    requestAnimationFrame(animate);

    // תנועת התותח לכל הכיוונים
    if (keys.forward) cannonGroup.position.z -= moveSpeed;
    if (keys.backward) cannonGroup.position.z += moveSpeed;
    if (keys.left) cannonGroup.position.x -= moveSpeed;
    if (keys.right) cannonGroup.position.x += moveSpeed;

    // שמירה על גבולות הדשא
    const limit = 55;
    cannonGroup.position.x = Math.max(-limit, Math.min(limit, cannonGroup.position.x));
    cannonGroup.position.z = Math.max(-limit, Math.min(limit, cannonGroup.position.z));

    // עדכון המצלמה שתעקוב אחרי התותח
    camera.position.x = cannonGroup.position.x;
    camera.position.z = cannonGroup.position.z + 10;
    camera.position.y = cannonGroup.position.y + 7;
    camera.lookAt(cannonGroup.position);

    renderer.render(scene, camera);
}

// התאמה לשינוי גודל החלון
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();