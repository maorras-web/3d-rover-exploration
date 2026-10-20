window.addEventListener('DOMContentLoaded', () => {

    if (typeof THREE === 'undefined') {
        console.error('Three.js library is missing!');
        return;
    }

    // ==========================================
    // 1. הגדרת סצנה וגרפיקה נקייה
    // ==========================================
    const scene = new THREE.Scene();
    
    // סביבה צבעונית רכה ושקיעה פסטלית
    scene.background = new THREE.Color(0x5a4a50);
    scene.fog = new THREE.Fog(0xd09a6d, 25, 92);
    // צבע דשא אחיד אחד לכל המשחק — שנה כאן כדי לשנות את כל הדשא.
    // שימו לב: בגרסת Three.js הזו צבעי חומר נכנסים לחישוב התאורה כמו שהם (בלי המרת gamma),
    // ולכן הערך נראה כהה מאוד בקוד, אבל על המסך הוא יוצא ירוק עשיר (~ #68a037).
    // אם הדשא נראה חיוור או שרוף — להחשיך את הערך; אם כהה מדי — להבהיר אותו.
    const GRASS_GREEN = 0x13410d;

    // ערפל אווירי: הצבע קרוב לצבע האופק של שמיים השקיעה, כך שהמרחק "נבלע" בשמיים.
    // עד FOG_NEAR (מרחק מהמצלמה) אין ערפל בכלל, ומשם הוא מתגבר בהדרגה עד FOG_FAR.
    const FOG_COLOR = 0xc9956b;
    const FOG_NEAR = 24;
    const FOG_FAR = 92;
    const SHOW_GRASS_ROCKS = false;   // true = מחזיר את האבנים והסלעים הקטנים שעל הדשא במפת הפירמידות

    const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    let screenLimitX = 4.8;

    // מרחק המצלמה מהתותח — להגדלת "המקום" במסך: הגדל את שני הערכים (אחורה וגם למעלה קצת).
    // לקרב את המצלמה: להקטין. (ערכים קודמים: Y=8.4–8.6, Z=18.0–18.2)
    const CAM_BASE_Y = 10.0;
    const CAM_BASE_Z = 23.0;
    // הורדת התותח במסך: 0 = כמו קודם, 0.17 = התותח יורד בערך 17% מגובה המסך.
    // זו הזזה ויזואלית בלבד של התמונה — לא משנה מיקומים, התנגשויות או ירי.
    const CAM_SHIFT_DOWN = 0.17;

    // ==========================================
    // MOBILE ONLY
    // ==========================================
    // המשחק משתמש בקומפוזיציה אנכית אחת בלבד.
    function updateCameraForDevice() {
        const width = window.innerWidth;
        const height = Math.max(window.innerHeight, 1);

        camera.aspect = width / height;
        camera.position.set(0, CAM_BASE_Y, CAM_BASE_Z);
        camera.lookAt(0, 2.50, -8.8);

        // שומרים על טווח תנועה מתאים למסך טלפון.
        screenLimitX = Math.max(4.25, Math.min(4.9, width / 78));

        camera.setViewOffset(width, height, 0, -height * CAM_SHIFT_DOWN, width, height);
        camera.updateProjectionMatrix();

        renderer.setSize(
            width,
            height,
            false
        );

        renderer.setPixelRatio(
            Math.min(
                window.devicePixelRatio || 1,
                1.5
            )
        );
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.innerWidth <= 768
        ? Math.min(window.devicePixelRatio || 1, 1.5)
        : Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.88;
    document.body.appendChild(renderer.domElement);

    // ==========================================
    // 1B. שכבת Color Grade קולנועית — ויזואלית בלבד
    // ==========================================
    const cinematicGrade = document.createElement('div');
    cinematicGrade.setAttribute('aria-hidden', 'true');
    Object.assign(cinematicGrade.style, {
        position: 'fixed',
        inset: '0',
        pointerEvents: 'none',
        zIndex: '5',
        background: 'radial-gradient(ellipse at 50% 42%, rgba(255,196,112,0.02) 0%, rgba(112,54,37,0.06) 58%, rgba(18,15,24,0.30) 100%), linear-gradient(to bottom, rgba(40,34,55,0.08), rgba(255,168,88,0.03) 58%, rgba(35,24,16,0.10))',
        mixBlendMode: 'multiply'
    });
    document.body.appendChild(cinematicGrade);

    function updateMobileViewportState() {
        const desktopBlocker = document.getElementById('desktop-blocker');
        const landscapeBlocker = document.getElementById('landscape-blocker');

        const isDesktopViewport =
            window.innerWidth > 768;

        const isLandscapePhone =
            window.innerWidth <= 768 &&
            window.innerWidth > window.innerHeight;

        if (desktopBlocker) {
            desktopBlocker.style.display =
                isDesktopViewport ? 'flex' : 'none';
        }

        if (landscapeBlocker) {
            landscapeBlocker.style.display =
                isLandscapePhone ? 'flex' : 'none';
        }
    }

    updateCameraForDevice();
    updateMobileViewportState();

    // ==========================================
    // 2. תאורה מתקדמת ל-Low Poly
    // ==========================================
    const hemiLight = new THREE.HemisphereLight(0xffd9a0, 0x172612, 0.30);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xffbd78, 1.75);
    sunLight.position.set(-10, 20, 14);
    sunLight.castShadow = true;
    // טלפונים חזקים מקבלים מפת צללים חדה פי 2 (2048), שאר הטלפונים נשארים על 1024.
    const isStrongPhone = (navigator.hardwareConcurrency || 4) >= 6 && (navigator.deviceMemory || 4) >= 4;
    const SHADOW_MAP_SIZE = isStrongPhone ? 2048 : 1024;
    sunLight.shadow.mapSize.width = SHADOW_MAP_SIZE;
    sunLight.shadow.mapSize.height = SHADOW_MAP_SIZE;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 60;
    sunLight.shadow.camera.left = -22;
    sunLight.shadow.camera.right = 22;
    sunLight.shadow.camera.top = 26;
    sunLight.shadow.camera.bottom = -12;
    sunLight.shadow.bias = -0.00035;
    sunLight.shadow.normalBias = 0.018;
    sunLight.shadow.radius = 1.6;
    scene.add(sunLight);

    // אור משלים קריר־סגלגל מימין: הצד המוצל נהיה קריר והמואר חם — ניגוד צבע של שקיעה.
    const fillLight = new THREE.DirectionalLight(0x7f8fd0, 0.22);
    fillLight.position.set(12, 8, 16);
    scene.add(fillLight);

    // אור קדמי עדין שמחזיר פרטים מהאזורים הכהים.
    const frontLight = new THREE.DirectionalLight(0xffd19a, 0.10);
    frontLight.position.set(0, 8, 20);
    scene.add(frontLight);

    // אור קצה זהוב מאחור-שמאל: מדגיש את קצוות הפירמידות כמו בתמונת היעד.
    const rimLight = new THREE.DirectionalLight(0xffb04a, 1.15);
    rimLight.position.set(-16, 7, -34);
    scene.add(rimLight);

    // ==========================================
    // 3. מערכת מפות
    // ==========================================
    const mapGroup = new THREE.Group();
    scene.add(mapGroup);

    // חלקיקי אווירה לכל מפה — מעט אובייקטים, הרבה יותר תחושת עולם חי.
    let weatherParticles = null;
    let volcanoFx = null;   // אפקטים חיים של מפת הר הגעש (זוהר, גחלים, כוכבים)

    // בשלב הזה המשחק מתמקד במפה אחת בלבד: יער.
    // שומרים את ההגדרה פשוטה כדי שכל השיפור הגרפי יושקע בעולם אחד.
    const MAPS = {
        forest: { name: 'PYRAMIDS', label: 'Pyramids', price: 0 },
        volcano: { name: 'SEA', label: 'Night sea', price: 0 }   // לשנות price כדי להפוך את המפה לנעולה/בתשלום
    };

    let selectedMap = localStorage.getItem('bb3d_map');
    let purchasedMaps = [];
    try { purchasedMaps = JSON.parse(localStorage.getItem('bb3d_purchased_maps') || '[]'); } catch (e) { purchasedMaps = []; }
    purchasedMaps = purchasedMaps.filter(id => MAPS[id]);
    Object.keys(MAPS).forEach(id => { if (MAPS[id].price === 0 && !purchasedMaps.includes(id)) purchasedMaps.push(id); });
    if (!MAPS[selectedMap] || !purchasedMaps.includes(selectedMap)) selectedMap = 'forest';
    localStorage.setItem('bb3d_map', selectedMap);
    localStorage.setItem('bb3d_purchased_maps', JSON.stringify(purchasedMaps));

    function clearMapGroup() {
        while (mapGroup.children.length) {
            const obj = mapGroup.children.pop();
            obj.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    const disposeMaterial = material => {
                        if (material.map) material.map.dispose();
                        material.dispose();
                    };
                    if (Array.isArray(child.material)) child.material.forEach(disposeMaterial);
                    else disposeMaterial(child.material);
                }
            });
        }
    }

    function addMesh(geo, mat, x = 0, y = 0, z = 0, cast = true, receive = true) {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, z);
        mesh.castShadow = cast;
        mesh.receiveShadow = receive;
        mapGroup.add(mesh);
        return mesh;
    }

    function addLowPolyTree(x, z, scale = 1) {
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b3a29, roughness: 1 });
        const leafMat = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.9, flatShading: true });
        addMesh(new THREE.CylinderGeometry(0.18 * scale, 0.24 * scale, 1.5 * scale, 6), trunkMat, x, 0.75 * scale, z);
        addMesh(new THREE.ConeGeometry(0.95 * scale, 1.8 * scale, 7), leafMat, x, 2.0 * scale, z);
        addMesh(new THREE.ConeGeometry(0.7 * scale, 1.5 * scale, 7), leafMat, x, 2.9 * scale, z);
    }

    function addRockDecoration(x, z, scale = 1, color = 0x64748b) {
        const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true });
        addMesh(new THREE.DodecahedronGeometry(0.65 * scale, 0), mat, x, 0.5 * scale, z, true, true);
    }

    function addCrystal(x, z, scale = 1) {
        const mat = new THREE.MeshStandardMaterial({ color: 0x67e8f9, roughness: 0.28, metalness: 0.15, flatShading: true });
        const crystal = addMesh(new THREE.ConeGeometry(0.45 * scale, 1.8 * scale, 6), mat, x, 0.9 * scale, z);
        crystal.rotation.z = (Math.random() - 0.5) * 0.22;
    }

    function addLavaRock(x, z, scale = 1) {
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x292524, roughness: 0.95, flatShading: true });
        addMesh(new THREE.DodecahedronGeometry(0.75 * scale, 0), darkMat, x, 0.55 * scale, z);
    }

    function addCactus(x, z, scale = 1) {
        const cactusMat = new THREE.MeshStandardMaterial({
            color: 0x3f6212,
            roughness: 0.95,
            flatShading: true
        });

        const trunk = addMesh(
            new THREE.CylinderGeometry(0.14 * scale, 0.18 * scale, 1.45 * scale, 7),
            cactusMat,
            x,
            0.72 * scale,
            z,
            true,
            true
        );
        trunk.rotation.z = (Math.random() - 0.5) * 0.06;

        const arm = addMesh(
            new THREE.CylinderGeometry(0.09 * scale, 0.12 * scale, 0.7 * scale, 7),
            cactusMat,
            x + 0.24 * scale,
            0.75 * scale,
            z,
            true,
            true
        );
        arm.rotation.z = -0.9;

        addMesh(
            new THREE.SphereGeometry(0.13 * scale, 8, 6),
            cactusMat,
            x + 0.51 * scale,
            0.97 * scale,
            z,
            true,
            true
        );
    }

    // ==========================================
    // 3A. שכבת שמיים + עומק סביבתי
    // ==========================================
    // הרעיון כאן הוא ליצור "עולם" מאחורי אזור המשחק:
    // שמיים מדורגים, שמש/זוהר, רכסי הרים רחוקים ושכבות
    // של אובייקטים. הכול עדיין Low-Poly כדי לשמור על ביצועים.
    function createSkyTexture(mapId) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        let top = '#2f4b63';
        let middle = '#8eb7c8';
        let horizon = '#e5b17e';
        let glow = 'rgba(255, 236, 184, 0.48)';

        if (mapId === 'desert') {
            top = '#25283d';
            middle = '#8a5360';
            horizon = '#f1a35f';
            glow = 'rgba(255, 194, 104, 0.78)';
        } else if (mapId === 'forest') {
            top = '#193b46';
            middle = '#39766c';
            horizon = '#8fb58a';
            glow = 'rgba(205, 232, 176, 0.33)';
        } else if (mapId === 'ice') {
            top = '#355b79';
            middle = '#79afd0';
            horizon = '#d8eff5';
            glow = 'rgba(236, 251, 255, 0.64)';
        } else if (mapId === 'volcano') {
            top = '#050a22';
            middle = '#101c4a';
            horizon = '#34408a';
            glow = 'rgba(150, 175, 255, 0.28)';
        }

        const gradient = ctx.createLinearGradient(0, 0, 0, 512);
        gradient.addColorStop(0, top);
        gradient.addColorStop(0.45, middle);
        gradient.addColorStop(0.82, horizon);
        gradient.addColorStop(1, horizon);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 512, 512);

        // הילה רכה באזור האופק.
        const horizonGlow = ctx.createRadialGradient(256, 425, 10, 256, 425, 190);
        horizonGlow.addColorStop(0, glow);
        horizonGlow.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = horizonGlow;
        ctx.fillRect(0, 280, 512, 232);

        // שכבה עדינה של עננות/ערפל גרפי.
        const cloudRGB = mapId === 'desert' ? '42,39,48' : '255,255,255';
        ctx.globalAlpha = mapId === 'desert' ? 0.34 : 0.08;
        for (let i = 0; i < 16; i++) {
            const x = Math.random() * 512;
            const y = 105 + Math.random() * 190;
            const rx = 55 + Math.random() * 120;
            const ry = 14 + Math.random() * 28;
            const cloud = ctx.createRadialGradient(x, y, 0, x, y, rx);
            cloud.addColorStop(0, `rgba(${cloudRGB},0.72)`);
            cloud.addColorStop(0.55, `rgba(${cloudRGB},0.28)`);
            cloud.addColorStop(1, `rgba(${cloudRGB},0)`);
            ctx.fillStyle = cloud;
            ctx.beginPath();
            ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        // שכבת ענני-אופק חמה ורכה, בהשראת תמונת הפתיחה.
        if (mapId === 'desert') {
            const warmCloud = ctx.createLinearGradient(0, 315, 0, 440);
            warmCloud.addColorStop(0, 'rgba(255,196,112,0)');
            warmCloud.addColorStop(0.5, 'rgba(255,174,91,0.20)');
            warmCloud.addColorStop(1, 'rgba(255,232,185,0)');
            ctx.fillStyle = warmCloud;
            ctx.fillRect(0, 300, 512, 150);
        }
        ctx.globalAlpha = 1;

        const texture = new THREE.CanvasTexture(canvas);
        texture.encoding = THREE.sRGBEncoding;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.needsUpdate = true;
        return texture;
    }

    function addSkyDome(mapId) {
        const skyMat = new THREE.MeshBasicMaterial({
            map: createSkyTexture(mapId),
            side: THREE.BackSide,
            depthWrite: false,
            fog: false
        });
        const sky = new THREE.Mesh(
            new THREE.SphereGeometry(180, 24, 14),
            skyMat
        );
        sky.position.set(0, 12, 0);
        sky.renderOrder = -100;
        mapGroup.add(sky);
        return sky;
    }

    // ==========================================
    // שמיים דרמטיים (backdrop): לוח ענק מאחורי הפירמידות עם גרדיאנט שקיעה, עננים כהים,
    // זוהר שמש וקרני אור. הוא מצויר ברזולוציה מלאה בדיוק על הטווח שהמצלמה רואה
    // (כיפת השמיים הרגילה מותחת רק ~40 פיקסלים על כל המסך, ולכן יצאה מטושטשת ושטוחה),
    // ובלי tone mapping, כדי שהצבעים יגיעו למסך כמו שהם מוגדרים כאן.
    // ==========================================
    function createSunsetBackdropTexture() {
        const W = 1024;
        const H = 512;
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');

        // המרה מזווית מעל האופק (מעלות) לשורת פיקסל בקנבס.
        // הלוח במרחק 165 מהמצלמה, גובה המצלמה ~7.5, והלוח מכסה y מ-94 (למעלה) עד -34 (למטה).
        const DIST = 165;
        const pyAt = deg => (94 - (7.5 + DIST * Math.tan(deg * Math.PI / 180))) * 4;

        // מחולל מספרים אקראי קבוע, כדי שהשמיים ייראו אותו דבר בכל טעינה.
        let seed = 20260930;
        const rnd = () => {
            seed = (seed + 0x6D2B79F5) | 0;
            let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };

        // 1) גרדיאנט אנכי: סגול עמוק למעלה, ורוד־אדום, כתום, וזהב בקו האופק.
        const sky = ctx.createLinearGradient(0, 0, 0, H);
        const stops = [
            [30, '#3b3739'], [20, '#5a4a47'], [14, '#8a6046'], [10, '#c98a45'],
            [6.5, '#efae4c'], [3, '#ffc968'], [0, '#ffe3a3'], [-6, '#f4c27a'], [-12, '#b98a58']
        ];
        stops.forEach(([deg, color]) => {
            sky.addColorStop(Math.min(1, Math.max(0, pyAt(deg) / H)), color);
        });
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, H);

        // 2) זוהר השמש: מאחורי קצה הפירמידה המרכזית.
        const sunX = W / 2;
        const sunY = pyAt(7.6);
        ctx.globalCompositeOperation = 'lighter';
        const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 210);
        glow.addColorStop(0, 'rgba(255,236,170,0.95)');
        glow.addColorStop(0.10, 'rgba(255,205,120,0.70)');
        glow.addColorStop(0.35, 'rgba(255,140,60,0.28)');
        glow.addColorStop(1, 'rgba(255,100,50,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, W, H);

        // 3) קרני אור (god rays) שיוצאות מהשמש.
        for (let i = 0; i < 22; i++) {
            const angle = (-Math.PI / 2) + (rnd() - 0.5) * 2.5;
            const spread = 0.02 + rnd() * 0.05;
            const len = 330 + rnd() * 120;
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(sunX, sunY);
            ctx.lineTo(sunX + Math.cos(angle - spread) * len, sunY + Math.sin(angle - spread) * len);
            ctx.lineTo(sunX + Math.cos(angle + spread) * len, sunY + Math.sin(angle + spread) * len);
            ctx.closePath();
            ctx.clip();
            const ray = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, len);
            ray.addColorStop(0, `rgba(255,222,150,${0.14 + rnd() * 0.12})`);
            ray.addColorStop(1, 'rgba(255,200,120,0)');
            ctx.fillStyle = ray;
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
        }
        ctx.globalCompositeOperation = 'source-over';

        // 4) עננים כהים וארוכים עם קצה תחתון זהוב. הקצוות רכים (גרדיאנט), בלי קווי מתאר חדים.
        // העננים הנמוכים (קרובים לשמש) דלילים יותר, כדי שהזוהר יישאר גלוי מעל הפירמידות.
        const softBlob = (cx, cy, rx, ry, rgb, alpha) => {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(1, ry / rx);
            const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
            g.addColorStop(0, `rgba(${rgb},${alpha})`);
            g.addColorStop(0.55, `rgba(${rgb},${alpha * 0.7})`);
            g.addColorStop(1, `rgba(${rgb},0)`);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(0, 0, rx, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        };

        const bands = [
            { deg: 26.0, tint: '58,52,54', a: 0.80, n: 9 },
            { deg: 22.0, tint: '64,54,54', a: 0.80, n: 9 },
            { deg: 18.5, tint: '74,58,54', a: 0.75, n: 8 },
            { deg: 15.5, tint: '88,64,54', a: 0.70, n: 7 },
            { deg: 13.0, tint: '104,70,52', a: 0.62, n: 6 },
            { deg: 11.0, tint: '124,78,50', a: 0.52, n: 4 },
            { deg: 9.4,  tint: '140,88,48', a: 0.38, n: 2 }
        ];
        bands.forEach(({ deg, tint, a, n }) => {
            const baseY = pyAt(deg);
            for (let c = 0; c < n; c++) {
                const cx = 220 + rnd() * 580;
                const cy = baseY + (rnd() - 0.5) * 10;
                const rx = 70 + rnd() * 140;
                const ry = 7 + rnd() * 11;
                for (let k = 0; k < 3; k++) {
                    const ox = (rnd() - 0.5) * rx * 0.8;
                    const oy = (rnd() - 0.5) * ry * 0.6;
                    const erx = rx * (0.55 + rnd() * 0.4);
                    const ery = ry * (0.8 + rnd() * 0.5);
                    softBlob(cx + ox, cy + oy + ery * 0.7, erx, ery * 1.1, '255,170,80', 0.42);  // קצה זהוב מתחת
                    softBlob(cx + ox, cy + oy, erx, ery, tint, a);                                 // גוף כהה
                }
            }
        });

        const texture = new THREE.CanvasTexture(canvas);
        texture.encoding = THREE.sRGBEncoding;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;
        return texture;
    }

    function addSkyBackdrop() {
        const mat = new THREE.MeshBasicMaterial({
            map: createSunsetBackdropTexture(),
            depthWrite: false,
            fog: false,
            toneMapped: false
        });
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(256, 128), mat);
        plane.position.set(0, 30, -150);
        plane.renderOrder = -90;
        mapGroup.add(plane);
        return plane;
    }

    function addSunGlow(mapId) {
        let color = 0xffe0a8;
        if (mapId === 'forest') color = 0xd7efc1;
        if (mapId === 'ice') color = 0xe5f8ff;
        if (mapId === 'volcano') color = 0xff6a3a;

        const sun = new THREE.Mesh(
            new THREE.SphereGeometry(2.2, 16, 12),
            new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.72,
                depthWrite: false,
                fog: false
            })
        );
        sun.position.set(-8, 17, -52);
        sun.renderOrder = -50;
        mapGroup.add(sun);

        // טבעת זוהר רחבה סביב השמש — מעט גאומטריה, הרבה עומק.
        const halo = new THREE.Mesh(
            new THREE.SphereGeometry(4.8, 16, 10),
            new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.10,
                depthWrite: false,
                fog: false
            })
        );
        halo.position.copy(sun.position);
        halo.scale.set(1.7, 0.85, 1);
        halo.renderOrder = -51;
        mapGroup.add(halo);
    }

    function addDistantHill(x, y, z, sx, sy, sz, color, opacity = 1) {
        const mat = new THREE.MeshStandardMaterial({
            color,
            roughness: 1,
            flatShading: true,
            transparent: opacity < 1,
            opacity,
            depthWrite: opacity >= 1
        });
        const hill = addMesh(
            new THREE.SphereGeometry(1, 10, 6),
            mat,
            x,
            y,
            z,
            false,
            false
        );
        hill.scale.set(sx, sy, sz);
        return hill;
    }

    function addDistantMountain(x, y, z, radius, height, color, rotation = 0) {
        const mat = new THREE.MeshStandardMaterial({
            color,
            roughness: 1,
            flatShading: true
        });
        const mountain = addMesh(
            new THREE.ConeGeometry(radius, height, 7),
            mat,
            x,
            y,
            z,
            false,
            false
        );
        mountain.rotation.y = rotation;
        return mountain;
    }

    function addBush(x, z, scale = 1, color = 0x356b23) {
        const mat = new THREE.MeshStandardMaterial({
            color,
            roughness: 1,
            flatShading: true
        });
        const bush = addMesh(
            new THREE.DodecahedronGeometry(0.65 * scale, 0),
            mat,
            x,
            0.48 * scale,
            z,
            true,
            true
        );
        bush.scale.y = 0.78;
        return bush;
    }

    function addDistantForestRow(z, baseScale = 1) {
        const xs = [-13.5, -10.8, -8.1, -5.4, -2.7, 0, 2.7, 5.4, 8.1, 10.8, 13.5];
        xs.forEach((x, index) => {
            const scale = baseScale * (0.78 + ((index * 17) % 7) * 0.07);
            addLowPolyTree(x, z, scale);
        });
    }

    function addEnvironmentalDepth(mapId, volcanoSky) {
        addSkyDome(volcanoSky ? 'volcano' : mapId);
        if (mapId === 'desert') {
            if (!volcanoSky) addSkyBackdrop();   // שמיים דרמטיים + שמש מאחורי הפירמידה (במקום כדור השמש הלבן)
        } else {
            addSunGlow(mapId);
        }

        if (mapId === 'desert' && !volcanoSky) {
            // שכבת אובך חמה באופק — מחברת את הפירמידות לשמיים.
            const hazeMat = new THREE.MeshBasicMaterial({
                color: 0xffc27a,
                transparent: true,
                opacity: 0.075,
                depthWrite: false,
                fog: false
            });
            const haze = new THREE.Mesh(new THREE.PlaneGeometry(34, 8), hazeMat);
            haze.position.set(0, 5.0, -35);
            haze.renderOrder = -10;
            mapGroup.add(haze);

            // שלוש שכבות של דיונות/הרים יוצרות מרחק ברור.
            // (הוסרו השיחים הירוקים החלקים בצדדים — הם נראו כגושים שטוחים.)
        } else if (mapId === 'forest') {
            // יער בשכבות: שורה רחוקה, שורה בינונית, ואז כמה עצים קרובים.
            addDistantHill(-10, 1.5, -22, 11, 5.0, 4.0, 0x28543a, 0.82);
            addDistantHill(10, 1.7, -24, 12, 5.6, 4.5, 0x244b34, 0.80);
            addDistantHill(0, 2.0, -36, 22, 7.5, 6.0, 0x1d3d2d, 0.64);
            addDistantForestRow(-20, 1.25);
            addDistantForestRow(-30, 1.75);
            addBush(-11.5, -6.5, 1.0, 0x2d5d25);
            addBush(11.5, -7.0, 1.1, 0x2a5722);
            addBush(-9.5, -10.5, 0.72, 0x376e29);
            addBush(9.5, -11.5, 0.82, 0x356728);
        } else if (mapId === 'ice') {
            addDistantMountain(-15, 6, -21, 7.5, 15, 0xb8d6e4, 0.3);
            addDistantMountain(15, 7, -23, 9.5, 18, 0x9fc5d8, -0.15);
            addDistantMountain(-3, 9, -34, 14, 23, 0x86b1c7, 0.4);
            addDistantHill(0, 1.2, -18, 20, 4.0, 4.0, 0xb9d7e1, 0.72);
            for (let i = 0; i < 7; i++) {
                addCrystal(-11 + i * 3.4, -8 - (i % 3) * 1.8, 0.45 + (i % 2) * 0.25);
            }
        } else if (mapId === 'volcano') {
            addDistantMountain(-14, 5.5, -24, 8.0, 15, 0x302528, -0.2);
            addDistantMountain(14, 5.8, -27, 9.0, 17, 0x2a2225, 0.25);
            addDistantMountain(1, 8, -40, 15, 25, 0x1d171a, 0.1);
            addDistantHill(0, 1.1, -14, 20, 3.7, 3.7, 0x3a2b2c, 0.84);

            // לבה זעירה בנקודות רחוקות כדי לתת תחושת "חי" לסביבה.
            [-10, -3, 6, 12].forEach((x, i) => {
                const lavaMat = new THREE.MeshBasicMaterial({
                    color: 0xff7138,
                    transparent: true,
                    opacity: 0.7,
                    depthWrite: false
                });
                addMesh(
                    new THREE.SphereGeometry(0.18 + (i % 2) * 0.08, 8, 6),
                    lavaMat,
                    x,
                    0.22,
                    -10 - (i % 3) * 3,
                    false,
                    false
                );
            });
        }
    }

    function addWeatherParticles(mapId) {
        const group = new THREE.Group();
        mapGroup.add(group);

        const count = mapId === 'ice' ? 52 : mapId === 'volcano' ? 70 : mapId === 'forest' ? 34 : 22;
        const positions = new Float32Array(count * 3);
        const velocity = new Float32Array(count * 3);

        let color = 0xdbe9e2;
        let size = 0.055;
        let opacity = 0.24;

        if (mapId === 'desert') {
            color = 0xf4d0a2;
            size = 0.042;
            opacity = 0.16;
        } else if (mapId === 'forest') {
            color = 0xd8f0b6;
            size = 0.048;
            opacity = 0.18;
        } else if (mapId === 'ice') {
            color = 0xf4fdff;
            size = 0.075;
            opacity = 0.52;
        } else if (mapId === 'volcano') {
            color = 0xd9ff8f;
            size = 0.12;
            opacity = 0.50;
        }

        for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            positions[i3] = (Math.random() - 0.5) * 25;
            positions[i3 + 1] = 1.1 + Math.random() * 8.5;
            positions[i3 + 2] = -2 - Math.random() * 25;

            if (mapId === 'ice') {
                velocity[i3] = -0.008 + Math.random() * 0.016;
                velocity[i3 + 1] = -(0.018 + Math.random() * 0.024);
                velocity[i3 + 2] = 0.002 + Math.random() * 0.008;
            } else if (mapId === 'volcano') {
                velocity[i3] = -0.012 + Math.random() * 0.024;
                velocity[i3 + 1] = 0.010 + Math.random() * 0.022;
                velocity[i3 + 2] = -0.002 + Math.random() * 0.010;
            } else {
                velocity[i3] = -0.004 + Math.random() * 0.008;
                velocity[i3 + 1] = 0.004 + Math.random() * 0.008;
                velocity[i3 + 2] = 0.001 + Math.random() * 0.004;
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const material = new THREE.PointsMaterial({
            color,
            size,
            transparent: true,
            opacity,
            depthWrite: false,
            sizeAttenuation: true
        });

        const points = new THREE.Points(geometry, material);
        points.renderOrder = 5;
        group.add(points);

        weatherParticles = {
            mapId,
            points,
            positions,
            velocity,
            count
        };

        // תאורת אווירה מקומית בלבד במפת הר הגעש — ללא צללים כדי לשמור על מובייל חלק.
        if (mapId === 'volcano') {
            [[-7, 1.1, -8], [7, 1.0, -10], [0, 1.4, -15]].forEach(([x, y, z]) => {
                const glow = new THREE.PointLight(0xc5ff80, 0.5, 11, 2);
                glow.position.set(x, y, z);
                mapGroup.add(glow);
            });
        }
    }

    function updateVolcanoFx(time) {
        const f = volcanoFx;
        if (!f) return;
        const t = time * 0.001;
        f.starsSmall.material.opacity = 0.7 + 0.25 * Math.sin(t * 1.6);
        f.starsBig.material.opacity = 0.75 + 0.25 * Math.sin(t * 2.3 + 1.2);

        // גלים שזזים לאט, שביל ירח מנצנץ וקצף שמתחלף.
        f.seaMat.uniforms.uTime.value = t;
        f.glitter.material.opacity = 0.6 + 0.2 * Math.sin(t * 1.9) + 0.08 * Math.sin(t * 5.3);
        f.foam.material.opacity = 0.22 + 0.14 * Math.sin(t * 1.1);

        // המגדלור מהבהב.
        const flash = Math.max(0, Math.sin(t * 1.3));
        f.lhGlow.material.opacity = 0.2 + 0.8 * flash * flash * flash;

        // סירות מתנדנדות.
        f.boats.forEach(b => {
            b.boat.position.y = b.baseY + Math.sin(t * 1.1 + b.phase) * 0.12;
            b.boat.rotation.z = Math.sin(t * 0.9 + b.phase) * 0.04;
        });
    }

    function updateWeatherParticles() {
        if (!weatherParticles) return;

        const { mapId, points, positions, velocity, count } = weatherParticles;
        for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            positions[i3] += velocity[i3];
            positions[i3 + 1] += velocity[i3 + 1];
            positions[i3 + 2] += velocity[i3 + 2];

            if (mapId === 'ice' && positions[i3 + 1] < 0.5) {
                positions[i3] = (Math.random() - 0.5) * 25;
                positions[i3 + 1] = 8.5 + Math.random() * 2;
                positions[i3 + 2] = -2 - Math.random() * 25;
            } else if (mapId === 'volcano' && positions[i3 + 1] > 10.5) {
                positions[i3] = (Math.random() - 0.5) * 20;
                positions[i3 + 1] = 0.8 + Math.random() * 1.8;
                positions[i3 + 2] = -8 - Math.random() * 14;
            } else if (mapId !== 'ice' && positions[i3 + 2] > 1) {
                positions[i3 + 2] = -25;
                positions[i3] = (Math.random() - 0.5) * 25;
                positions[i3 + 1] = 1.2 + Math.random() * 7.5;
            }
        }
        points.geometry.attributes.position.needsUpdate = true;
    }

    // ==========================================
    // 3B. נפח קרקע + פרטי 3D קטנים
    // ==========================================
    function createTerrainGeometry(mapId) {
        const geometry = new THREE.PlaneGeometry(40, 90, 32, 60);
        const position = geometry.attributes.position;

        for (let i = 0; i < position.count; i++) {
            const x = position.getX(i);
            const z = position.getY(i);

            const waveA = Math.sin(x * 0.42 + z * 0.18) * 0.105;
            const waveB = Math.cos(z * 0.55 - x * 0.22) * 0.070;
            const waveC = Math.sin((x + z) * 0.9) * 0.032;

            let height = waveA + waveB + waveC;

            // משאירים את האזור שמתחת לקנון כמעט שטוח.
            const centerDistance = Math.hypot(x / 5.0, z / 3.8);
            const centerWeight = THREE.MathUtils.smoothstep(centerDistance, 0.25, 1.0);
            height *= centerWeight;

            if (mapId === 'ice') {
                height *= 0.55;
            } else if (mapId === 'volcano') {
                height *= 0.25;   // קרקע כמעט שטוחה במפת הטירה
                height += Math.sin(x * 0.23 - z * 0.31) * 0.012;
            }

            position.setZ(i, height);
        }

        geometry.computeVertexNormals();
        return geometry;
    }

    function addGroundDetail(mapId) {
        const detailGroup = new THREE.Group();
        mapGroup.add(detailGroup);

        const isIce = mapId === 'ice';
        const isVolcano = mapId === 'volcano';
        const isForest = mapId === 'forest';

        const pebbleColors = isIce
            ? [0x8ebdce, 0xaad4df, 0x6e9eaf]
            : isVolcano
                ? [0x302b29, 0x48403b, 0x201d1b]
                : isForest
                    ? [0x415b2f, 0x526e35, 0x314b27]
                    : [0x6d572f, 0x806842, 0x5c4727];

        // מעט מאוד פרטים כדי לתת קנה מידה ועומק בלי להעמיס על מובייל.
        for (let i = 0; i < (SHOW_GRASS_ROCKS ? 26 : 0); i++) {
            const side = i % 2 === 0 ? -1 : 1;
            const x = side * (8.3 + Math.random() * 5.2);
            const z = -5.5 - Math.random() * 10.5;
            const size = 0.045 + Math.random() * 0.085;

            const pebble = new THREE.Mesh(
                new THREE.DodecahedronGeometry(size, 0),
                new THREE.MeshStandardMaterial({
                    color: pebbleColors[i % pebbleColors.length],
                    roughness: 0.95,
                    metalness: 0.0,
                    flatShading: true
                })
            );

            pebble.position.set(
                x + (Math.random() - 0.5) * 1.8,
                0.05 + size * 0.55,
                z
            );

            pebble.rotation.set(
                Math.random() * 0.6,
                Math.random() * 1.2,
                Math.random() * 0.5
            );

            pebble.castShadow = true;
            pebble.receiveShadow = true;
            detailGroup.add(pebble);
        }

        // עשבונים קטנים רק במפות טבעיות.
        if (!isIce && !isVolcano) {
            for (let i = 0; i < 18; i++) {
                const side = i % 2 === 0 ? -1 : 1;
                const x = side * (8.1 + Math.random() * 5.5);
                const z = -4.5 - Math.random() * 11.5;
                const scale = 0.45 + Math.random() * 0.45;

                const grassMat = new THREE.MeshStandardMaterial({
                    color: GRASS_GREEN,
                    roughness: 1,
                    flatShading: true
                });

                const blade = new THREE.Mesh(
                    new THREE.ConeGeometry(0.055 * scale, 0.5 * scale, 5),
                    grassMat
                );

                blade.position.set(
                    x + (Math.random() - 0.5) * 1.7,
                    0.24 * scale,
                    z
                );

                blade.rotation.z = (Math.random() - 0.5) * 0.28;
                blade.castShadow = true;
                detailGroup.add(blade);
            }
        }
    }

    // ==========================================
    // 3C. שכבת פרטי חזית — נותנת תחושת עולם אמיתית
    // ==========================================
    function addForegroundScenery(mapId) {
        const group = new THREE.Group();
        mapGroup.add(group);

        const isDesert = mapId === 'desert';
        const isForest = mapId === 'forest';
        const isIce = mapId === 'ice';
        const isVolcano = mapId === 'volcano';

        // (הוסרו רכסי הקרקע החלקים בצדדים — הם כיסו את הדשא ויצרו גושים ירוקים שטוחים.)

        // אבנים שטוחות בפרונט, מפוזרות רק מחוץ למסלול התותח.
        const stonePalette = isIce
            ? [0x9ec8d5, 0x7faebb, 0xc8e7ee]
            : isVolcano
                ? [0x282322, 0x3a3330, 0x1f1b1a]
                : isForest
                    ? [0x3c522f, 0x51683f, 0x2c4024]
                    : [0x6b5d52, 0x7d6d60, 0x594d45];

        for (let i = 0; i < (SHOW_GRASS_ROCKS ? 20 : 0); i++) {
            const side = i % 2 === 0 ? -1 : 1;
            const stoneSize = 0.16 + Math.random() * 0.26;
            const stone = new THREE.Mesh(
                new THREE.IcosahedronGeometry(stoneSize, 1),
                new THREE.MeshStandardMaterial({
                    color: stonePalette[i % stonePalette.length],
                    roughness: 0.90,
                    metalness: 0.02,
                    flatShading: true
                })
            );
            stone.position.set(
                side * (5.9 + Math.random() * 4.8),
                0.16 + stoneSize * 0.5,
                -0.8 - Math.random() * 8.5
            );
            stone.scale.y = 0.55 + Math.random() * 0.35;
            stone.rotation.set(Math.random() * 0.9, Math.random() * 1.8, Math.random() * 0.7);
            stone.castShadow = true;
            stone.receiveShadow = true;
            group.add(stone);
        }

        // (הוסרו גושי ה-dune הירוקים השטוחים מהקרקע.)

        if (isForest) {
            // צמחייה נמוכה עם גבעולים ועלים נפרדים — הרבה יותר נפח מעצים לבדם.
            const leafMat = new THREE.MeshStandardMaterial({
                color: 0x4d7e2f,
                roughness: 0.97,
                flatShading: true
            });
            const stemMat = new THREE.MeshStandardMaterial({
                color: 0x5b432c,
                roughness: 1,
                flatShading: true
            });

            for (let i = 0; i < 14; i++) {
                const side = i % 2 === 0 ? -1 : 1;
                const x = side * (6.5 + Math.random() * 4.8);
                const z = -2.0 - Math.random() * 9.0;
                const s = 0.55 + Math.random() * 0.55;

                const stem = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.035 * s, 0.05 * s, 0.45 * s, 6),
                    stemMat
                );
                stem.position.set(x, 0.22 * s, z);
                stem.castShadow = true;
                group.add(stem);

                const leaves = new THREE.Mesh(
                    new THREE.ConeGeometry(0.20 * s, 0.55 * s, 5),
                    leafMat
                );
                leaves.position.set(x, 0.49 * s, z);
                leaves.rotation.y = Math.random() * Math.PI;
                leaves.castShadow = true;
                group.add(leaves);
            }
        }

        if (isIce) {
            // שברי קרח זוויתיים שממשיכים את הקרקע לתוך העומק.
            const iceMat = new THREE.MeshPhysicalMaterial({
                color: 0xbfe7f2,
                roughness: 0.18,
                metalness: 0.04,
                clearcoat: 0.75,
                clearcoatRoughness: 0.12,
                flatShading: true
            });

            for (let i = 0; i < 9; i++) {
                const shard = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.22, 0.42, 0.9 + Math.random() * 0.8, 5),
                    iceMat
                );
                const side = i % 2 === 0 ? -1 : 1;
                shard.position.set(side * (6.4 + Math.random() * 4.8), 0.38, -3.0 - Math.random() * 10);
                shard.rotation.set(Math.random() * 0.35, Math.random() * 1.5, (Math.random() - 0.5) * 0.22);
                shard.castShadow = true;
                shard.receiveShadow = true;
                group.add(shard);
            }
        }

        if (isVolcano) {
            // סלעים שחורים וחריצי לבה קטנים כדי להגדיל את עומק המפה.
            const lavaMat = new THREE.MeshBasicMaterial({
                color: 0xff6b35,
                transparent: true,
                opacity: 0.82,
                depthWrite: false
            });

            for (let i = 0; i < 7; i++) {
                const crack = new THREE.Mesh(
                    new THREE.BoxGeometry(0.06 + Math.random() * 0.08, 0.025, 0.65 + Math.random() * 0.65),
                    lavaMat
                );
                const side = i % 2 === 0 ? -1 : 1;
                crack.position.set(side * (6.0 + Math.random() * 5.0), 0.028, -2.0 - Math.random() * 10.0);
                crack.rotation.y = (Math.random() - 0.5) * 0.9;
                group.add(crack);
            }
        }
    }

    function addCannonLighting(mapId) {
        let keyColor = 0x5dd7ff;
        let rimColor = 0xc6edff;

        if (mapId === 'desert') {
            keyColor = 0xffc77a;
            rimColor = 0xb8d6ff;
        } else if (mapId === 'forest') {
            keyColor = 0x8be28b;
            rimColor = 0x9ed6ff;
        } else if (mapId === 'ice') {
            keyColor = 0xbcefff;
            rimColor = 0xe7fbff;
        } else if (mapId === 'volcano') {
            keyColor = 0x6fa8ff;
            rimColor = 0xb8d4ff;
        }

        const key = new THREE.PointLight(keyColor, mapId === 'volcano' ? 0.45 : 0.22, 6.5, 2);
        key.position.set(0, 2.7, 2.2);
        cannonGroup.add(key);

        const rim = new THREE.PointLight(rimColor, 0.34, 7, 2);
        rim.position.set(0, 2.0, -2.4);
        cannonGroup.add(rim);

        // תאורת צד חלשה שמדגישה את הקימורים בזמן תנועה.
        const side = new THREE.PointLight(0xffffff, 0.12, 5, 2);
        side.position.set(3.2, 1.15, 0.4);
        cannonGroup.add(side);
    }

    function createGroundTexture(mapId) {
        const canvas = document.createElement('canvas');
        const bumpCanvas = document.createElement('canvas');
        canvas.width = bumpCanvas.width = 512;
        canvas.height = bumpCanvas.height = 512;

        const ctx = canvas.getContext('2d');
        const bumpCtx = bumpCanvas.getContext('2d');

        // צבעי דשא בהירים בצדדים — כמו ברפרנס — עם מרקם עדין.
        const base = '#6f9148';
        const accentA = '#7fa456';
        const accentB = '#5e803f';

        ctx.fillStyle = base;
        ctx.fillRect(0, 0, 512, 512);
        bumpCtx.fillStyle = '#858585';
        bumpCtx.fillRect(0, 0, 512, 512);

        // שכבות רחבות, כדי שהקרקע תיראה טבעית ולא כמו כתמים אקראיים.
        for (let i = 0; i < 14; i++) {
            const y = (i / 14) * 512;
            const grad = ctx.createLinearGradient(0, y, 512, y + 55);
            grad.addColorStop(0, i % 2 === 0 ? accentA : accentB);
            grad.addColorStop(0.5, base);
            grad.addColorStop(1, i % 2 === 0 ? accentB : accentA);
            ctx.globalAlpha = 0.20;
            ctx.fillStyle = grad;
            ctx.fillRect(0, y, 512, 58);
        }
        ctx.globalAlpha = 1;

        // להבי דשא/קווים ארוכים ועדינים.
        for (let i = 0; i < 210; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const len = 18 + Math.random() * 70;
            const alpha = 0.035 + Math.random() * 0.055;
            ctx.strokeStyle = i % 3 === 0
                ? `rgba(190,220,135,${alpha})`
                : `rgba(30,62,25,${alpha})`;
            ctx.lineWidth = 0.6 + Math.random() * 0.8;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.quadraticCurveTo(
                x + len * 0.45,
                y + (Math.random() - 0.5) * 5,
                x + len,
                y + (Math.random() - 0.5) * 8
            );
            ctx.stroke();
        }

        // bump עדין שמרגיש כמו קרקע ולא כמו רעש.
        for (let i = 0; i < 120; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const len = 15 + Math.random() * 60;
            const shade = 105 + Math.floor(Math.random() * 40);
            bumpCtx.strokeStyle = `rgb(${shade},${shade},${shade})`;
            bumpCtx.globalAlpha = 0.12 + Math.random() * 0.12;
            bumpCtx.lineWidth = 0.8 + Math.random() * 1.2;
            bumpCtx.beginPath();
            bumpCtx.moveTo(x, y);
            bumpCtx.quadraticCurveTo(
                x + len * 0.5,
                y + (Math.random() - 0.5) * 4,
                x + len,
                y + (Math.random() - 0.5) * 6
            );
            bumpCtx.stroke();
        }
        bumpCtx.globalAlpha = 1;

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(5.5, 11.5);
        texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        texture.encoding = THREE.sRGBEncoding;
        texture.minFilter = THREE.LinearMipMapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.needsUpdate = true;

        const bumpTexture = new THREE.CanvasTexture(bumpCanvas);
        bumpTexture.wrapS = THREE.RepeatWrapping;
        bumpTexture.wrapT = THREE.RepeatWrapping;
        bumpTexture.repeat.copy(texture.repeat);
        bumpTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        bumpTexture.minFilter = THREE.LinearMipMapLinearFilter;
        bumpTexture.magFilter = THREE.LinearFilter;
        bumpTexture.needsUpdate = true;

        return { texture, bumpTexture };
    }

    function createForestPathTexture() {
        const canvas = document.createElement('canvas');
        const bumpCanvas = document.createElement('canvas');
        canvas.width = bumpCanvas.width = 512;
        canvas.height = bumpCanvas.height = 512;

        const ctx = canvas.getContext('2d');
        const bumpCtx = bumpCanvas.getContext('2d');

        ctx.fillStyle = '#12371d';
        ctx.fillRect(0, 0, 512, 512);
        bumpCtx.fillStyle = '#777777';
        bumpCtx.fillRect(0, 0, 512, 512);

        for (let i = 0; i < 170; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const len = 20 + Math.random() * 90;
            const alpha = 0.045 + Math.random() * 0.055;
            ctx.strokeStyle = i % 2 === 0
                ? `rgba(42,82,38,${alpha})`
                : `rgba(6,28,14,${alpha})`;
            ctx.lineWidth = 0.8 + Math.random() * 1.1;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.quadraticCurveTo(
                x + len * 0.45,
                y + (Math.random() - 0.5) * 5,
                x + len,
                y + (Math.random() - 0.5) * 7
            );
            ctx.stroke();
        }

        for (let i = 0; i < 100; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const len = 18 + Math.random() * 65;
            const shade = 95 + Math.floor(Math.random() * 35);
            bumpCtx.strokeStyle = `rgb(${shade},${shade},${shade})`;
            bumpCtx.globalAlpha = 0.12 + Math.random() * 0.12;
            bumpCtx.lineWidth = 0.8 + Math.random() * 1.2;
            bumpCtx.beginPath();
            bumpCtx.moveTo(x, y);
            bumpCtx.lineTo(x + len, y + (Math.random() - 0.5) * 5);
            bumpCtx.stroke();
        }
        bumpCtx.globalAlpha = 1;

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(3.5, 8.5);
        texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        texture.encoding = THREE.sRGBEncoding;
        texture.minFilter = THREE.LinearMipMapLinearFilter;
        texture.magFilter = THREE.LinearFilter;

        const bumpTexture = new THREE.CanvasTexture(bumpCanvas);
        bumpTexture.wrapS = THREE.RepeatWrapping;
        bumpTexture.wrapT = THREE.RepeatWrapping;
        bumpTexture.repeat.copy(texture.repeat);
        bumpTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        bumpTexture.minFilter = THREE.LinearMipMapLinearFilter;
        bumpTexture.magFilter = THREE.LinearFilter;

        return { texture, bumpTexture };
    }

    // מרקם סלע מחוספס ואפור־חום לפירמידות (כמו בתמונת הפתיח).
    function createRockTexture() {
        const size = 512;
        const canvas = document.createElement('canvas');
        const bumpCanvas = document.createElement('canvas');
        canvas.width = canvas.height = bumpCanvas.width = bumpCanvas.height = size;
        const ctx = canvas.getContext('2d');
        const bumpCtx = bumpCanvas.getContext('2d');

        ctx.fillStyle = '#7a6d62';
        ctx.fillRect(0, 0, size, size);
        bumpCtx.fillStyle = '#808080';
        bumpCtx.fillRect(0, 0, size, size);

        const poly = (c, x, y, r, n, fill) => {
            c.beginPath();
            for (let k = 0; k < n; k++) {
                const a = (k / n) * Math.PI * 2 + Math.random() * 0.6;
                const rr = r * (0.65 + Math.random() * 0.5);
                const px = x + Math.cos(a) * rr;
                const py = y + Math.sin(a) * rr;
                if (k === 0) c.moveTo(px, py); else c.lineTo(px, py);
            }
            c.closePath();
            c.fillStyle = fill;
            c.fill();
        };

        // פלחי סלע לא סדירים בגוונים קרובים.
        for (let i = 0; i < 260; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const r = 14 + Math.random() * 46;
            const n = 5 + Math.floor(Math.random() * 3);
            const shade = 92 + Math.floor(Math.random() * 56);
            const tint = Math.floor(Math.random() * 14);
            poly(ctx, x, y, r, n, `rgba(${shade + tint},${shade},${shade - 10},0.55)`);
            const bump = 90 + Math.floor(Math.random() * 80);
            poly(bumpCtx, x, y, r, n, `rgba(${bump},${bump},${bump},0.5)`);
        }

        // סדקים כהים.
        for (let i = 0; i < 90; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const len = 20 + Math.random() * 60;
            const ang = Math.random() * Math.PI * 2;
            ctx.strokeStyle = 'rgba(30,24,22,0.28)';
            ctx.lineWidth = 1 + Math.random() * 1.6;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
            ctx.stroke();
            bumpCtx.strokeStyle = 'rgba(40,40,40,0.5)';
            bumpCtx.lineWidth = 1.5;
            bumpCtx.beginPath();
            bumpCtx.moveTo(x, y);
            bumpCtx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
            bumpCtx.stroke();
        }

        const aniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        const map = new THREE.CanvasTexture(canvas);
        map.wrapS = map.wrapT = THREE.RepeatWrapping;
        map.repeat.set(2.5, 2.5);
        map.anisotropy = aniso;
        map.encoding = THREE.sRGBEncoding;
        map.needsUpdate = true;

        const bumpMap = new THREE.CanvasTexture(bumpCanvas);
        bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
        bumpMap.repeat.copy(map.repeat);
        bumpMap.anisotropy = aniso;
        bumpMap.needsUpdate = true;

        return { map, bumpMap };
    }

    // פירמידה בעלת 4 פאות עם מיפוי טקסטורה בלי עיוות.
    // ב-ConeGeometry הרגיל הטקסטורה נמתחת כמלבן על משולש, ולכן היא נדחסת לרוחב
    // ככל שעולים לקצה ומתקבלים פסים מרוחים/מטושטשים בפסגה. כאן כל פאה מקבלת
    // מיפוי שטוח לפי מידות אמיתיות, והנורמלים שטוחים (פאות חדות כמו בפירמידה אמיתית).
    function createPyramidGeometry(radius, height, heightSegments) {
        const base = new THREE.ConeGeometry(radius, height, 4, heightSegments);
        const geo = base.toNonIndexed();
        const pos = geo.attributes.position;
        const uv = geo.attributes.uv;

        const TILE = 22;                                              // גודל אריח הטקסטורה ביחידות עולם (לפני repeat)
        const slantScale = Math.sqrt(height * height + radius * radius * 0.5) / height;
        const halfH = height / 2;
        const quarter = Math.PI / 2;

        for (let i = 0; i < pos.count; i += 3) {
            // שלושת הקודקודים של המשולש
            let cx = 0, cz = 0, allBottom = true;
            for (let k = 0; k < 3; k++) {
                cx += pos.getX(i + k);
                cz += pos.getZ(i + k);
                if (Math.abs(pos.getY(i + k) + halfH) > 1e-4) allBottom = false;
            }
            if (allBottom) continue;                                  // בסיס תחתון (מוסתר): משאירים כמו שהוא

            // איזו פאה זו? (פינות הפירמידה בזוויות 0, 90, 180, 270 מעלות)
            let ang = Math.atan2(cx, cz);
            if (ang < 0) ang += Math.PI * 2;
            const face = Math.min(3, Math.floor(ang / quarter));

            // כיוון הקצה התחתון של הפאה
            const a0 = face * quarter, a1 = (face + 1) * quarter;
            let ex = Math.sin(a1) - Math.sin(a0);
            let ez = Math.cos(a1) - Math.cos(a0);
            const el = Math.hypot(ex, ez) || 1;
            ex /= el; ez /= el;

            for (let k = 0; k < 3; k++) {
                const x = pos.getX(i + k), y = pos.getY(i + k), z = pos.getZ(i + k);
                const t = x * ex + z * ez;                            // מרחק לאורך הפאה
                const v = (y + halfH) * slantScale;                   // מרחק לאורך השיפוע
                uv.setXY(i + k, t / TILE + face * 0.37, v / TILE);
            }
        }
        uv.needsUpdate = true;

        geo.computeVertexNormals();                                   // נורמלים שטוחים לכל פאה
        geo.parameters = base.parameters;
        return geo;
    }

    function createStoneTexture() {
        const canvas = document.createElement('canvas');
        const bumpCanvas = document.createElement('canvas');
        canvas.width = bumpCanvas.width = 512;
        canvas.height = bumpCanvas.height = 512;

        const ctx = canvas.getContext('2d');
        const bumpCtx = bumpCanvas.getContext('2d');

        ctx.fillStyle = '#9c774d';
        ctx.fillRect(0, 0, 512, 512);
        bumpCtx.fillStyle = '#828282';
        bumpCtx.fillRect(0, 0, 512, 512);

        // אבני בנייה רחבות — נותנות לפירמידה חומר, בלי כתמי רעש.
        const rows = 11;
        const cols = 8;
        const tileW = 512 / cols;
        const tileH = 512 / rows;

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const offset = row % 2 === 0 ? 0 : tileW * 0.5;
                const x = col * tileW - offset;
                const y = row * tileH;
                const w = tileW + 2;
                const h = tileH + 2;

                const value = 120 + ((row * 17 + col * 11) % 34);
                ctx.fillStyle = `rgb(${value + 20},${value},${value - 24})`;
                ctx.fillRect(x + 2, y + 2, w - 4, h - 4);

                ctx.strokeStyle = 'rgba(53,38,24,0.34)';
                ctx.lineWidth = 3;
                ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

                const shade = 105 + ((row + col) % 4) * 15;
                bumpCtx.fillStyle = `rgb(${shade},${shade},${shade})`;
                bumpCtx.fillRect(x + 3, y + 3, w - 6, h - 6);
            }
        }

        ctx.globalAlpha = 0.35;
        for (let i = 0; i < 65; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            ctx.strokeStyle = i % 2 ? '#6f5239' : '#c09a6d';
            ctx.lineWidth = 0.8 + Math.random() * 1.2;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + 5 + Math.random() * 18, y + (Math.random() - 0.5) * 5);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        const map = new THREE.CanvasTexture(canvas);
        map.wrapS = THREE.RepeatWrapping;
        map.wrapT = THREE.RepeatWrapping;
        map.repeat.set(0.95, 1.15);
        map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        map.encoding = THREE.sRGBEncoding;
        map.minFilter = THREE.LinearMipMapLinearFilter;
        map.magFilter = THREE.LinearFilter;

        const bumpMap = new THREE.CanvasTexture(bumpCanvas);
        bumpMap.wrapS = THREE.RepeatWrapping;
        bumpMap.wrapT = THREE.RepeatWrapping;
        bumpMap.repeat.copy(map.repeat);
        bumpMap.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        bumpMap.minFilter = THREE.LinearMipMapLinearFilter;
        bumpMap.magFilter = THREE.LinearFilter;

        return { map, bumpMap };
    }

    // ==========================================
    // 3D DEPTH CUES
    // ==========================================
    // אובייקטים בגדלים שונים לאורך ציר Z יוצרים
    // נקודות ייחוס ברורות למרחק ומחזקים את תחושת התלת-ממד.
    function addPerspectiveDepthDetails(mapId) {
        const group = new THREE.Group();
        mapGroup.add(group);

        let colors;

        if (mapId === 'forest') {
            colors = [0x294b2a, 0x355d31, 0x203f28];
        } else if (mapId === 'ice') {
            colors = [0x8bbdce, 0xaed8e2, 0x6f9faf];
        } else if (mapId === 'volcano') {
            colors = [0x25201f, 0x38302e, 0x1c1818];
        } else {
            colors = [0x6b5d52, 0x7d6d60, 0x594d45];
        }

        const depthLayers = [
            { z: -2.5, scale: 0.42 },
            { z: -7.0, scale: 0.60 },
            { z: -13.0, scale: 0.82 },
            { z: -21.0, scale: 1.08 },
            { z: -32.0, scale: 1.38 },
            { z: -45.0, scale: 1.72 }
        ];

        (SHOW_GRASS_ROCKS ? depthLayers : []).forEach((layer, layerIndex) => {
            [-1, 1].forEach(side => {
                const scale = layer.scale * (0.88 + Math.random() * 0.22);
                const mat = new THREE.MeshStandardMaterial({
                    color: colors[layerIndex % colors.length],
                    roughness: 0.94,
                    metalness: mapId === 'ice' ? 0.04 : 0,
                    flatShading: true
                });

                const marker = new THREE.Mesh(
                    new THREE.DodecahedronGeometry(0.72 * scale, 0),
                    mat
                );

                marker.position.set(
                    side * (7.0 + scale * 0.65),
                    0.42 * scale,
                    layer.z
                );

                marker.scale.y = 0.72 + Math.random() * 0.45;
                marker.rotation.set(
                    Math.random() * 0.45,
                    Math.random() * Math.PI,
                    Math.random() * 0.35
                );

                marker.castShadow = true;
                marker.receiveShadow = true;
                group.add(marker);

                // סימן גובה קטן מאחוריו נותן עוד רמז לפרספקטיבה.
                if (layerIndex >= 2) {
                    const postMat = new THREE.MeshStandardMaterial({
                        color: colors[(layerIndex + 1) % colors.length],
                        roughness: 0.9,
                        flatShading: true
                    });

                    const post = new THREE.Mesh(
                        new THREE.CylinderGeometry(
                            0.10 * scale,
                            0.16 * scale,
                            1.15 * scale,
                            6
                        ),
                        postMat
                    );

                    post.position.set(
                        side * (8.1 + scale * 0.4),
                        0.58 * scale,
                        layer.z - 0.45
                    );

                    post.castShadow = true;
                    post.receiveShadow = true;
                    group.add(post);
                }
            });
        });
    }

    // ==========================================
    // דשא ריאליסטי: להבים עם מעבר צבע + שונות + רוח
    // ==========================================
    // כוונון מהיר (אם נראה כבד במובייל — להקטין GRASS_BLADE_COUNT):
    const GRASS_BLADE_COUNT = 24000;
    let grassWind = null; // { uTime } — מתעדכן בלולאת ה-animate

    function add3DGrass(mapId) {
        if (mapId !== 'forest') return;

        const grassGroup = new THREE.Group();
        mapGroup.add(grassGroup);

        // להב אחד: בסיס רחב -> אמצע -> קצה מחודד ומעט כפוף קדימה.
        // גובה הגיאומטריה = 1; הגובה האמיתי נקבע לכל להב בנפרד (scale.y).
        const w = 0.045;
        const bend = 0.32;
        const P = [
            [-w, 0, 0], [w, 0, 0],
            [-w * 0.72, 0.5, bend * 0.3], [w * 0.72, 0.5, bend * 0.3],
            [0, 1, bend]
        ];
        // צבעים (ליניאריים): בסיס כהה -> אמצע -> קצה בהיר, כמו דשא אמיתי.
        const C = [
            [0.020, 0.075, 0.008], [0.020, 0.075, 0.008],
            [0.075, 0.270, 0.028], [0.075, 0.270, 0.028],
            [0.300, 0.560, 0.085]
        ];
        const tris = [0, 1, 2, 1, 3, 2, 2, 3, 4];
        const pos = [], col = [], nor = [];
        // כל משולש פעמיים (קדמי + אחורי) כדי שהלהב ייראה משני הצדדים עם תאורה זהה.
        [false, true].forEach(back => {
            for (let i = 0; i < tris.length; i += 3) {
                const tri = back ? [tris[i], tris[i + 2], tris[i + 1]] : [tris[i], tris[i + 1], tris[i + 2]];
                tri.forEach(idx => {
                    pos.push(...P[idx]);
                    col.push(...C[idx]);
                    nor.push(0, 1, 0); // נורמל כלפי מעלה = תאורה רכה כמו של מדשאה
                });
            }
        });
        const bladeGeo = new THREE.BufferGeometry();
        bladeGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        bladeGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        bladeGeo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));

        grassWind = { uTime: { value: 0 } };
        const grassMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            vertexColors: true,
            roughness: 1,
            metalness: 0
        });
        // תנועת רוח עדינה בקצה הלהבים (בשיידר, בלי עלות CPU).
        grassMat.onBeforeCompile = (shader) => {
            shader.uniforms.uTime = grassWind.uTime;
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', '#include <common>\nuniform float uTime;')
                .replace('#include <begin_vertex>', `#include <begin_vertex>
                #ifdef USE_INSTANCING
                    vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
                    float hf = clamp(position.y, 0.0, 1.0);
                    float sw = sin(uTime * 1.7 + ip.x * 0.45 + ip.z * 0.32) * 0.6
                             + sin(uTime * 3.1 + ip.x * 1.30 + ip.z * 0.90) * 0.25;
                    transformed.x += sw * 0.16 * hf * hf;
                    transformed.z += sw * 0.07 * hf * hf;
                #endif`);
        };

        const mesh = new THREE.InstancedMesh(bladeGeo, grassMat, GRASS_BLADE_COUNT);
        const dummy = new THREE.Object3D();
        const tint = new THREE.Color();

        for (let i = 0; i < GRASS_BLADE_COUNT; i++) {
            // יותר צפיפות קרוב למצלמה, פחות בטווח הרחוק.
            const z = 14 - 62 * Math.pow(Math.random(), 1.6);
            const x = (Math.random() - 0.5) * 36;

            // מחוץ לנתיב: דשא גבוה יותר. בתוך הנתיב: מכוסח ונמוך (שלא יכסה את הגלגלים).
            const t = (12 - z) / 64;
            const pathHalf = 5.65 - THREE.MathUtils.clamp(t, 0, 1) * 3.05;
            const edge = THREE.MathUtils.smoothstep(Math.abs(x) - pathHalf, -0.4, 2.2);
            const height = THREE.MathUtils.lerp(
                0.15 + Math.random() * 0.12,
                0.34 + Math.random() * 0.34,
                edge
            );
            const width = 0.8 + Math.random() * 0.7;

            dummy.position.set(x, getForestTerrainHeight(x, z) + 0.03, z);
            dummy.rotation.set(
                (Math.random() - 0.5) * 0.25,
                Math.random() * Math.PI * 2,
                (Math.random() - 0.5) * 0.25
            );
            dummy.scale.set(width, height, width);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);

            // שונות צבע בין להבים: חלק צהבהבים, חלק כהים.
            tint.setRGB(
                0.85 + Math.random() * 0.40,
                0.85 + Math.random() * 0.25,
                0.80 + Math.random() * 0.20
            );
            mesh.setColorAt(i, tint);
        }

        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.frustumCulled = false; // ה-bounding הוא של להב בודד, לא של כל השדה
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        grassGroup.add(mesh);
    }

    function getForestTerrainHeight(x, z) {
        const waveA = Math.sin(x * 0.42 + z * 0.18) * 0.105;
        const waveB = Math.cos(z * 0.55 - x * 0.22) * 0.070;
        const waveC = Math.sin((x + z) * 0.9) * 0.032;
        const centerDistance = Math.hypot(x / 5.0, z / 3.8);
        const centerWeight = THREE.MathUtils.smoothstep(centerDistance, 0.25, 1.0);
        return (waveA + waveB + waveC) * centerWeight;
    }

    function createForestPathGeometry() {
        const segments = 42;
        const positions = [];
        const uvs = [];
        const indices = [];

        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const z = 12 - t * 64;
            const width = 5.65 - t * 3.05;
            const curve = Math.sin(t * Math.PI * 1.15) * 0.22;
            const leftX = -width + curve;
            const rightX = width + curve;
            const leftY = getForestTerrainHeight(leftX, z) + 0.045;
            const rightY = getForestTerrainHeight(rightX, z) + 0.045;

            positions.push(leftX, leftY, z);
            positions.push(rightX, rightY, z);
            uvs.push(0, t * 8.0, 1, t * 8.0);
        }

        for (let i = 0; i < segments; i++) {
            const a = i * 2;
            const b = a + 1;
            const c = a + 2;
            const d = a + 3;
            indices.push(a, c, b, b, c, d);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        return geometry;
    }

    // ==========================================
    // 3D WORLD CORRIDOR — שכבות עומק אמיתיות
    // ==========================================
    // מעבר עומק נוסף למפת המדבר: תותח → עשב קדמי → אמצע המפה → פירמידות → שמיים.
    // שכבה ויזואלית בלבד — אינה נוגעת בפיזיקה, במסלול או בתותח.
    function addDesertDepthTransition(mapId) {
        if (mapId !== 'desert') return;

        const group = new THREE.Group();
        mapGroup.add(group);

        // צבעים מעט כהים יותר ככל שמתרחקים, כדי ליצור הפרדה בין שכבות העומק.
        const foregroundMat = new THREE.MeshStandardMaterial({
            color: 0x4f7f2d,
            roughness: 0.98,
            flatShading: true
        });
        const midMat = new THREE.MeshStandardMaterial({
            color: 0x5b8535,
            roughness: 1.0,
            flatShading: true
        });
        const farMat = new THREE.MeshStandardMaterial({
            color: 0x71804a,
            roughness: 1.0,
            flatShading: true
        });

        // 1) קדמת המסך — קבוצות עשב נמוכות בצדדים, בלי להיכנס למסלול.
        for (let i = 0; i < 24; i++) {
            const side = i % 2 === 0 ? -1 : 1;
            const x = side * (5.3 + Math.random() * 4.1);
            const z = -2.5 - Math.random() * 6.5;
            const h = 0.28 + Math.random() * 0.48;
            const w = 0.055 + Math.random() * 0.035;

            const tuft = new THREE.Mesh(
                new THREE.ConeGeometry(w, h, 5),
                foregroundMat
            );
            tuft.position.set(x, h * 0.5, z);
            tuft.rotation.z = (Math.random() - 0.5) * 0.35;
            tuft.rotation.y = Math.random() * Math.PI;
            tuft.castShadow = true;
            group.add(tuft);
        }

        // 3) שכבת מרחק — צלליות נמוכות שמייצרות מעבר רך אל הפירמידות.
        for (let i = 0; i < 10; i++) {
            const side = i % 2 === 0 ? -1 : 1;
            const z = -20.0 - Math.random() * 8.0;
            const x = side * (8.5 + Math.random() * 4.5);
            const w = 0.9 + Math.random() * 1.0;
            const h = 0.65 + Math.random() * 0.75;

            const silhouette = new THREE.Mesh(
                new THREE.ConeGeometry(w, h, 6),
                farMat
            );
            silhouette.position.set(x, h * 0.5, z);
            silhouette.scale.z = 0.7;
            silhouette.rotation.y = Math.random() * Math.PI;
            silhouette.receiveShadow = true;
            group.add(silhouette);
        }

        // שכבת אובך עדינה בגובה נמוך שמחברת את אמצע המפה לבסיס הפירמידות.
        const transitionHazeMat = new THREE.MeshBasicMaterial({
            color: 0xffc982,
            transparent: true,
            opacity: 0.055,
            depthWrite: false,
            fog: false
        });
        const transitionHaze = new THREE.PlaneGeometry(27, 3.2);
        const haze = new THREE.Mesh(transitionHaze, transitionHazeMat);
        haze.position.set(0, 1.55, -24.5);
        haze.renderOrder = -5;
        group.add(haze);
    }

    function addDeepPerspectiveCorridor(mapId) {
        const group = new THREE.Group();
        mapGroup.add(group);

        const palettes = {
            desert: [0x6b5d52, 0x7d6d60, 0x594d45],
            forest: [0x2b542e, 0x3b6938, 0x234526],
            ice: [0x86b7c8, 0xa6cfdb, 0x6d9cac],
            volcano: [0x292322, 0x3a302e, 0x211b1b]
        };
        const palette = palettes[mapId] || palettes.forest;

        // שולי מסלול מדורגים יוצרים קווי עומק רציפים.
        // במפת המדבר (המראה הפעיל) מדלגים עליהם: הם קופסאות ירוקות חלקות שיצרו
        // מדרגות שטוחות עם קצוות חדים בצידי הדשא.
        for (let sideIndex = 0; sideIndex < 2 && mapId !== 'desert'; sideIndex++) {
            const side = sideIndex === 0 ? -1 : 1;

            for (let i = 0; i < 12; i++) {
                const z = 2.0 - i * 4.25;
                const depth = Math.max(0, -z);
                const x = side * (6.0 + depth * 0.035);
                const width = 2.2 + depth * 0.018;
                const height = 0.28 + depth * 0.006;

                const shoulder = new THREE.Mesh(
                    new THREE.BoxGeometry(width, height, 4.5),
                    new THREE.MeshStandardMaterial({
                        color: mapId === 'desert' ? GRASS_GREEN : palette[(i + sideIndex) % palette.length],
                        roughness: 0.96,
                        metalness: mapId === 'ice' ? 0.03 : 0,
                        flatShading: true
                    })
                );

                shoulder.position.set(side * (6.0 + depth * 0.035), -0.03 + height * 0.45, z);
                shoulder.rotation.y = side * (0.035 + i * 0.002);
                shoulder.receiveShadow = true;
                shoulder.castShadow = i < 5;
                group.add(shoulder);
            }
        }

        // אבני מסגרת בגדלים שונים לאורך הציר.
        const markerDistances = [-3, -8, -15, -24, -35, -48];
        (SHOW_GRASS_ROCKS ? markerDistances : []).forEach((z, index) => {
            const depth = Math.abs(z);
            const scale = Math.max(0.22, 0.82 - depth * 0.0105);

            [-1, 1].forEach(side => {
                const marker = new THREE.Mesh(
                    new THREE.IcosahedronGeometry(scale, 1),
                    new THREE.MeshStandardMaterial({
                        color: palette[(index + 1) % palette.length],
                        roughness: 0.90,
                        flatShading: true
                    })
                );

                marker.position.set(side * (7.1 + depth * 0.025), scale * 0.45, z);
                marker.scale.y = 0.65 + index * 0.025;
                marker.rotation.set(0.12 * index, index * 0.65, side * 0.08);
                marker.castShadow = true;
                marker.receiveShadow = true;
                group.add(marker);
            });
        });

        // צלליות רחוקות יוצרות שכבה נוספת של עומק.
        const farGroup = new THREE.Group();
        group.add(farGroup);

        for (let i = 0; i < (SHOW_GRASS_ROCKS ? 18 : 0); i++) {
            const side = i % 2 === 0 ? -1 : 1;
            const z = -18 - Math.random() * 34;
            const x = side * (8.0 + Math.random() * 5.0);
            const h = 0.6 + Math.random() * 1.7;
            const w = 0.45 + Math.random() * 0.75;

            const silhouette = new THREE.Mesh(
                new THREE.ConeGeometry(w, h, 5),
                new THREE.MeshStandardMaterial({
                    color: palette[i % palette.length],
                    roughness: 1,
                    flatShading: true
                })
            );

            silhouette.position.set(x, h * 0.5, z);
            silhouette.rotation.y = Math.random() * Math.PI;
            silhouette.receiveShadow = true;
            farGroup.add(silhouette);
        }
    }

    // טקסטורת מדשאה: אלפי קווי עשב קצרים בגווני ירוק + כתמי שונות רחבים.
    // מצויירת פעם אחת על canvas ונחזרת על הקרקע (נראית כמו דשא צפוף מקרוב ומרחוק).
    function createLawnTexture(repeatX, repeatY) {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#2f5f1b';
        ctx.fillRect(0, 0, size, size);

        // ציור שחוזר מעבר לקצה כדי שהמרקם יהיה חלק בחיבורים.
        const wrapped = (x, y, margin, draw) => {
            const xs = [0], ys = [0];
            if (x < margin) xs.push(size); else if (x > size - margin) xs.push(-size);
            if (y < margin) ys.push(size); else if (y > size - margin) ys.push(-size);
            xs.forEach(dx => ys.forEach(dy => draw(x + dx, y + dy)));
        };

        // כתמים רחבים של בהיר/כהה — שוברים את החזרתיות.
        for (let i = 0; i < 46; i++) {
            const x = Math.random() * size, y = Math.random() * size;
            const r = 40 + Math.random() * 90;
            const light = Math.random() < 0.5;
            wrapped(x, y, r, (px, py) => {
                const g = ctx.createRadialGradient(px, py, 0, px, py, r);
                const c = light ? '120,170,60' : '20,50,15';
                g.addColorStop(0, `rgba(${c},0.12)`);
                g.addColorStop(1, `rgba(${c},0)`);
                ctx.fillStyle = g;
                ctx.fillRect(px - r, py - r, r * 2, r * 2);
            });
        }

        // להבי עשב: קווים קצרים וצפופים, בעיקר כלפי מעלה, בגוונים מהכהה לבהיר.
        const palette = ['#244d14', '#2d5f1a', '#3a7421', '#478a28', '#5a9f32', '#74b640', '#92cb55', '#b3dc72'];
        const weights = [0.12, 0.2, 0.2, 0.18, 0.14, 0.09, 0.05, 0.02];
        const pick = () => {
            let r = Math.random(), acc = 0;
            for (let i = 0; i < palette.length; i++) { acc += weights[i]; if (r <= acc) return palette[i]; }
            return palette[2];
        };
        ctx.lineCap = 'round';
        for (let i = 0; i < 11000; i++) {
            const x = Math.random() * size, y = Math.random() * size;
            const len = 5 + Math.random() * 9;
            const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.3;
            const dx = Math.cos(ang) * len, dy = Math.sin(ang) * len;
            ctx.strokeStyle = pick();
            ctx.globalAlpha = 0.55 + Math.random() * 0.4;
            ctx.lineWidth = 0.8 + Math.random() * 0.9;
            wrapped(x, y, 14, (px, py) => {
                ctx.beginPath();
                ctx.moveTo(px, py);
                ctx.quadraticCurveTo(px + dx * 0.4 + (Math.random() - 0.5) * 2, py + dy * 0.5, px + dx, py + dy);
                ctx.stroke();
            });
        }
        ctx.globalAlpha = 1;

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(repeatX, repeatY);
        texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        texture.encoding = THREE.sRGBEncoding;
        texture.minFilter = THREE.LinearMipMapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.needsUpdate = true;
        return texture;
    }

    // ==========================================
    // מפת VOLCANO: הרי געש במקום פירמידות + קרקע בזלת במקום דשא
    // ==========================================
    function createBasaltTexture(repeatX, repeatY) {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#272337';
        ctx.fillRect(0, 0, size, size);

        const wrapped = (x, y, margin, draw) => {
            const xs = [0], ys = [0];
            if (x < margin) xs.push(size); else if (x > size - margin) xs.push(-size);
            if (y < margin) ys.push(size); else if (y > size - margin) ys.push(-size);
            xs.forEach(dx => ys.forEach(dy => draw(x + dx, y + dy)));
        };

        // כתמים בהירים/כהים שוברים את החזרתיות.
        for (let i = 0; i < 46; i++) {
            const x = Math.random() * size, y = Math.random() * size;
            const r = 40 + Math.random() * 90;
            const c = Math.random() < 0.5 ? '78,70,112' : '8,6,16';
            wrapped(x, y, r, (px, py) => {
                const g = ctx.createRadialGradient(px, py, 0, px, py, r);
                g.addColorStop(0, `rgba(${c},0.16)`);
                g.addColorStop(1, `rgba(${c},0)`);
                ctx.fillStyle = g;
                ctx.fillRect(px - r, py - r, r * 2, r * 2);
            });
        }

        // גרגרי בזלת.
        const shades = ['#16131f', '#1f1b2c', '#2c2740', '#3a3454', '#4a4468'];
        for (let i = 0; i < 6000; i++) {
            ctx.fillStyle = shades[(Math.random() * shades.length) | 0];
            ctx.globalAlpha = 0.5 + Math.random() * 0.4;
            const s = 1 + Math.random() * 2.5;
            wrapped(Math.random() * size, Math.random() * size, 4, (px, py) => ctx.fillRect(px, py, s, s));
        }
        ctx.globalAlpha = 1;

        // סדקי לבה זוהרים (נציירים גם מוזזים כדי שהמרקם יתחבר בקצוות).
        ctx.lineCap = ctx.lineJoin = 'round';
        for (let i = 0; i < 18; i++) {
            let x = Math.random() * size, y = Math.random() * size;
            let a = Math.random() * Math.PI * 2;
            const pts = [[x, y]];
            for (let k = 0; k < 7; k++) {
                a += (Math.random() - 0.5) * 1.3;
                x += Math.cos(a) * (14 + Math.random() * 22);
                y += Math.sin(a) * (14 + Math.random() * 22);
                pts.push([x, y]);
            }
            [[4, 'rgba(70,50,150,0.30)'], [1.4, 'rgba(150,130,255,0.80)']].forEach(([w, col]) => {
                ctx.lineWidth = w;
                ctx.strokeStyle = col;
                [-size, 0, size].forEach(dx => [-size, 0, size].forEach(dy => {
                    ctx.beginPath();
                    pts.forEach(([px, py], n) => n ? ctx.lineTo(px + dx, py + dy) : ctx.moveTo(px + dx, py + dy));
                    ctx.stroke();
                }));
            });
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(repeatX, repeatY);
        texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        texture.encoding = THREE.sRGBEncoding;
        texture.minFilter = THREE.LinearMipMapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.needsUpdate = true;
        return texture;
    }

    // טקסטורת זוהר רך (עיגול שדועך) — משמשת לפתח הבוער ולירח.
    function makeGlowTexture(inner, outer) {
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0, inner);
        grad.addColorStop(0.35, inner.replace(/[0-9.]+\)$/, '0.45)'));
        grad.addColorStop(1, outer);
        g.fillStyle = grad;
        g.fillRect(0, 0, 128, 128);
        const tex = new THREE.CanvasTexture(c);
        tex.encoding = THREE.sRGBEncoding;
        return tex;
    }

    function makeMoonTexture() {
        const c = document.createElement('canvas');
        c.width = c.height = 256;
        const g = c.getContext('2d');
        const halo = g.createRadialGradient(128, 128, 40, 128, 128, 128);
        halo.addColorStop(0, 'rgba(225,195,255,0.40)');
        halo.addColorStop(1, 'rgba(225,195,255,0)');
        g.fillStyle = halo;
        g.fillRect(0, 0, 256, 256);
        const disc = g.createRadialGradient(112, 108, 8, 128, 128, 66);
        disc.addColorStop(0, '#fbf3ff');
        disc.addColorStop(1, '#c9b2ee');
        g.fillStyle = disc;
        g.beginPath();
        g.arc(128, 128, 62, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(140,110,190,0.30)';
        [[104, 112, 12], [146, 100, 8], [138, 148, 14], [108, 154, 7], [158, 128, 6]].forEach(([x, y, r]) => {
            g.beginPath();
            g.arc(x, y, r, 0, Math.PI * 2);
            g.fill();
        });
        const tex = new THREE.CanvasTexture(c);
        tex.encoding = THREE.sRGBEncoding;
        return tex;
    }

    // מרקם ים: כחול כהה עם פסי גלים בהירים (נגלל לאט כדי ליצור תנועה).
    function createSeaTexture() {
        const size = 256;
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const g = c.getContext('2d');
        g.fillStyle = '#0a1a45';
        g.fillRect(0, 0, size, size);
        for (let i = 0; i < 28; i++) {
            const x = Math.random() * size, y = Math.random() * size, r = 30 + Math.random() * 60;
            const col = Math.random() < 0.5 ? '40,70,150' : '4,10,30';
            [-size, 0, size].forEach(dx => [-size, 0, size].forEach(dy => {
                const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
                gr.addColorStop(0, `rgba(${col},0.22)`);
                gr.addColorStop(1, `rgba(${col},0)`);
                g.fillStyle = gr;
                g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
            }));
        }
        g.lineCap = 'round';
        for (let i = 0; i < 70; i++) {
            const x = Math.random() * size, y = Math.random() * size, len = 14 + Math.random() * 34;
            g.lineWidth = 1 + Math.random() * 1.2;
            g.strokeStyle = `rgba(${130 + (Math.random() * 60) | 0},${165 + (Math.random() * 50) | 0},255,0.22)`;
            [-size, 0, size].forEach(dx => [-size, 0, size].forEach(dy => {
                g.beginPath();
                g.moveTo(x + dx, y + dy);
                g.quadraticCurveTo(x + dx + len / 2, y + dy - 3, x + dx + len, y + dy);
                g.stroke();
            }));
        }
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(60, 40);
        tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        tex.encoding = THREE.sRGBEncoding;
        return tex;
    }

    // מפת הים: דשא כמו במפה הראשונה, חוף חול, ים באופק עם ירח, מגדלור וסירות.
    function addSea() {
        const SEA_Y = -0.3;
        const glowAdd = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false };
        const std = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 1, flatShading: true }, extra || {}));

        // קרקע כהה רחבה מתחת לכל, שמכסה כל חור בצדדים.
        const under = new THREE.Mesh(new THREE.PlaneGeometry(400, 140), std(0x14301c));
        under.rotation.x = -Math.PI / 2;
        under.position.set(0, -0.4, -15);
        mapGroup.add(under);

        // חוף חול בקצה הדשא.
        const sand = new THREE.Mesh(new THREE.PlaneGeometry(260, 13), std(0xcbbd98));
        sand.rotation.x = -Math.PI / 2;
        sand.position.set(0, -0.22, -50.5);
        mapGroup.add(sand);

        // הים עצמו.
        const seaMat = new THREE.ShaderMaterial({
            uniforms: { uTime: { value: 0 } },
            vertexShader: [
                'varying vec3 vWorld;',
                'void main() {',
                '  vec4 w = modelMatrix * vec4(position, 1.0);',
                '  vWorld = w.xyz;',
                '  gl_Position = projectionMatrix * viewMatrix * w;',
                '}'
            ].join('\n'),
            fragmentShader: [
                'uniform float uTime;',
                'varying vec3 vWorld;',
                'vec2 waveGrad(vec2 p, float t, float dist) {',
                '  float hiFade = 1.0 / (1.0 + dist * 0.045);   // הגלים הקטנים נעלמים בהדרגה עם המרחק (מונע ריצוד)',
                '  vec2 g = vec2(0.0);',
                '  vec2 k1 = vec2(0.32, 0.20);   g += k1 * (0.55 * cos(dot(k1, p) + t * 0.55));',
                '  vec2 k2 = vec2(-0.21, 0.37);  g += k2 * (0.45 * cos(dot(k2, p) - t * 0.45));',
                '  vec2 k3 = vec2(0.80, -0.35);  g += k3 * (0.12 * hiFade * cos(dot(k3, p) + t * 1.0));',
                '  vec2 k4 = vec2(-0.55, -0.95); g += k4 * (0.07 * hiFade * cos(dot(k4, p) - t * 1.2));',
                '  return g;',
                '}',
                'void main() {',
                '  vec3 V = cameraPosition - vWorld;',
                '  float dist = length(V);',
                '  V /= dist;',
                '  float fade = 1.0 / (1.0 + dist * 0.018);',
                '  vec2 g = waveGrad(vWorld.xz, uTime, dist) * fade * 0.50;',
                '  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));',
                '  float ndv = max(dot(N, V), 0.0);',
                '  float fres = clamp(0.06 + 0.94 * pow(1.0 - ndv, 3.0), 0.0, 1.0);',
                '  float d = max(-57.0 - vWorld.z, 0.0);',
                '  float shallow = exp(-d * 0.09);',
                '  vec3 deep = vec3(0.025, 0.07, 0.20);',
                '  vec3 body = mix(deep, vec3(0.05, 0.30, 0.40), shallow * 0.6);',
                '  vec3 skyCol = vec3(0.20, 0.27, 0.58);',
                '  vec3 col = mix(body, skyCol, fres * 0.85);',
                '  vec3 L = normalize(vec3(-0.114, 0.075, -1.0));',
                '  vec3 R = reflect(-V, N);',
                '  float rl = max(dot(R, L), 0.0);',
                '  col += vec3(0.75, 0.82, 1.0) * (pow(rl, 60.0) * 0.22 + pow(rl, 260.0) * 0.55);',
                '  float edge = 1.6 + 0.9 * sin(uTime * 0.8 + vWorld.x * 0.15);',
                '  float foamBase = 1.0 - smoothstep(0.0, edge, d);',
                '  float streak = 0.5 + 0.5 * sin(vWorld.x * 0.9 + sin(vWorld.z * 1.4 + uTime * 0.8) * 1.4);',
                '  float foam = foamBase * smoothstep(0.35, 0.9, streak);',
                '  col = mix(col, vec3(0.78, 0.86, 1.0), foam * 0.5);',
                '  float hf = smoothstep(70.0, 430.0, dist);',
                '  vec3 horizonCol = vec3(0.21, 0.27, 0.57);   // אותו צבע כמו אופק השמיים',
                '  col = mix(col, horizonCol, pow(hf, 1.4));',
                '  gl_FragColor = vec4(col, 1.0);',
                '}'
            ].join('\n')
        });
        const sea = new THREE.Mesh(new THREE.PlaneGeometry(600, 400), seaMat);
        sea.rotation.x = -Math.PI / 2;
        sea.position.set(0, SEA_Y, -257);
        mapGroup.add(sea);

        // ערפל ים רך: שני סרטי אובך עם דעיכה חלקה למעלה ולמטה (במקום קו אופק חד ושטוח).
        const mistTex = (() => {
            const c = document.createElement('canvas');
            c.width = 8;
            c.height = 128;
            const mx = c.getContext('2d');
            const gr = mx.createLinearGradient(0, 0, 0, 128);
            gr.addColorStop(0, 'rgba(95,110,195,0)');
            gr.addColorStop(0.55, 'rgba(95,110,195,0.55)');
            gr.addColorStop(1, 'rgba(95,110,195,0)');
            mx.fillStyle = gr;
            mx.fillRect(0, 0, 8, 128);
            const t = new THREE.CanvasTexture(c);
            t.encoding = THREE.sRGBEncoding;
            return t;
        })();
        [[-58, 2.4, 240, 7, 0.5], [-150, 4.5, 420, 12, 0.55]].forEach(([mz, my, mw, mh, mo]) => {
            const mist = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh),
                new THREE.MeshBasicMaterial({ map: mistTex, transparent: true, opacity: mo, depthWrite: false, fog: false }));
            mist.position.set(0, my, mz);
            mist.renderOrder = -2;
            mapGroup.add(mist);
        });

        // קצף גלים על קו החוף.
        const foam = new THREE.Mesh(new THREE.PlaneGeometry(260, 1.4),
            new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0.3, depthWrite: false }));
        foam.rotation.x = -Math.PI / 2;
        foam.position.set(0, -0.2, -57.4);
        mapGroup.add(foam);

        // סלעים כהים לאורך החוף.
        [[-11, -52.5, 1.1], [-5, -55, 0.8], [4, -53.5, 1.3], [10, -56, 0.9], [-16, -54, 1.2], [15, -52, 1.0]].forEach(([x, z, r]) => {
            const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), std(0x1b2036));
            rock.scale.y = 0.7;
            rock.position.set(x, -0.05 + r * 0.3, z);
            mapGroup.add(rock);
        });

        // שביל זוהר של הירח על המים.
        const glitterGroup = new THREE.Group();
        glitterGroup.rotation.y = 0.114;
        glitterGroup.position.y = -0.25;
        mapGroup.add(glitterGroup);
        const glitter = new THREE.Mesh(new THREE.PlaneGeometry(11, 170),
            new THREE.MeshBasicMaterial({ map: makeGlowTexture('rgba(190,205,255,0.9)', 'rgba(160,180,255,0)'), ...glowAdd }));
        glitter.rotation.x = -Math.PI / 2;
        glitter.position.set(0, 0, -150);
        glitter.renderOrder = -3;
        glitterGroup.add(glitter);

        // איים כהים רחוקים על קו האופק.
        const farMat = new THREE.MeshBasicMaterial({ color: 0x0a1030, fog: false });
        [[-62, -300, 48, 14], [30, -330, 34, 10], [-5, -380, 50, 8]].forEach(([x, z, r, h]) => {
            const isle = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), farMat);
            isle.position.set(x, h / 2 + SEA_Y, z);
            mapGroup.add(isle);
        });

        // מגדלור על אי קטן.
        const islet = new THREE.Mesh(new THREE.ConeGeometry(6, 3.4, 7), std(0x161b2e));
        islet.position.set(16, SEA_Y + 1.4, -105);
        mapGroup.add(islet);
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 8, 10), std(0xd5d8e6, { emissive: 0x1a2040, emissiveIntensity: 0.5 }));
        tower.position.set(16, 6.8, -105);
        mapGroup.add(tower);
        const gallery = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.35, 10), std(0x10142a));
        gallery.position.set(16, 10.95, -105);
        mapGroup.add(gallery);
        const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.2, 10), new THREE.MeshBasicMaterial({ color: 0xfff0a0, fog: false }));
        lantern.position.set(16, 11.7, -105);
        mapGroup.add(lantern);
        const lhRoof = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.3, 10), std(0x8a2a3a));
        lhRoof.position.set(16, 12.95, -105);
        mapGroup.add(lhRoof);
        const lhGlow = new THREE.Mesh(new THREE.PlaneGeometry(16, 16),
            new THREE.MeshBasicMaterial({ map: makeGlowTexture('rgba(255,240,170,0.9)', 'rgba(255,220,120,0)'), ...glowAdd }));
        lhGlow.position.set(16, 11.7, -104);
        lhGlow.renderOrder = -3;
        mapGroup.add(lhGlow);

        // סירות מפרש קטנות שמתנדנדות על המים.
        const sailShape = new THREE.Shape();
        sailShape.moveTo(0, 0);
        sailShape.lineTo(0, 2.6);
        sailShape.lineTo(1.5, 0.2);
        sailShape.lineTo(0, 0);
        const sailGeo = new THREE.ShapeGeometry(sailShape);
        const boats = [];
        [[-9, -86, 0, 1.0], [21, -132, 2.1, 1.3]].forEach(([x, z, phase, sc]) => {
            const boat = new THREE.Group();
            const hull = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.7, 1.2), std(0x2b1f1c));
            hull.position.y = 0.35;
            boat.add(hull);
            const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6), std(0x1a1520));
            mast.position.y = 2.0;
            boat.add(mast);
            const sail = new THREE.Mesh(sailGeo, new THREE.MeshBasicMaterial({ color: 0x9a9fc8, side: THREE.DoubleSide }));
            sail.position.set(0.1, 0.8, 0);
            boat.add(sail);
            const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffd27a, fog: false }));
            lamp.position.y = 3.65;
            boat.add(lamp);
            boat.scale.set(sc, sc, sc);
            boat.position.set(x, SEA_Y + 0.1, z);
            mapGroup.add(boat);
            boats.push({ boat, baseY: SEA_Y + 0.1, phase });
        });

        // אובך דק מעל המים בקו האופק ובחוף.
        [[-150, 2, 400, 6, 0x6a78d0, 0.12], [-60, 1.2, 80, 2.4, 0x8fa0ff, 0.08]].forEach(([z, y, w, h, color, op]) => {
            const haze = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
                new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, fog: false }));
            haze.position.set(0, y, z);
            haze.renderOrder = -5;
            mapGroup.add(haze);
        });

        // כוכבים וירח גדול בשמיים.
        const makeStars = (n, size, color) => {
            const sp = new Float32Array(n * 3);
            for (let i = 0; i < n; i++) {
                sp[i * 3] = (Math.random() - 0.5) * 190;
                sp[i * 3 + 1] = 12 + Math.random() * 88;
                sp[i * 3 + 2] = -150 - Math.random() * 6;
            }
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
            const pts = new THREE.Points(geo, new THREE.PointsMaterial({
                color, size, transparent: true, opacity: 0.9, depthWrite: false, fog: false, toneMapped: false
            }));
            pts.frustumCulled = false;
            pts.renderOrder = -85;
            mapGroup.add(pts);
            return pts;
        };
        const starsSmall = makeStars(190, 0.55, 0xf1e6ff);
        const starsBig = makeStars(45, 1.05, 0xffffff);

        const moon = new THREE.Mesh(new THREE.PlaneGeometry(32, 32),
            new THREE.MeshBasicMaterial({ map: makeMoonTexture(), transparent: true, depthWrite: false, fog: false, toneMapped: false }));
        moon.position.set(-17, 62, -148);
        moon.renderOrder = -84;
        mapGroup.add(moon);

        volcanoFx = { starsSmall, starsBig, seaMat, glitter, foam, lhGlow, boats };
    }

    function buildMap(mapId) {
        if (!MAPS[mapId]) mapId = 'forest';
        const isVolcano = mapId === 'volcano';
        const theme = 'desert'; // שמיים/שמש/ערפל/סלעים משותפים לשתי המפות; ההבדל: הרי געש+בזלת מול פירמידות+דשא
        clearMapGroup();

        // עומק סביבתי נבנה לפני הקרקע והפריטים, כדי שהעולם ירגיש
        // כמו סביבה שלמה ולא רק אוסף אובייקטים.
        volcanoFx = null;
        addEnvironmentalDepth(theme, isVolcano);

        // הקרקע הראשית היא דשא בהיר; השביל הכהה נבנה מעליה.
        const groundColor = GRASS_GREEN;
        const groundRoughness = 0.92;

        // בסיס שקוע שנותן לקרקע עובי בלי להיראות כפלטפורמה.
        const groundBaseMat = new THREE.MeshStandardMaterial({
            color: groundColor,
            roughness: groundRoughness + 0.08,
            metalness: 0.01
        });

        // הבסיס מונמך מתחת לנקודה הנמוכה ביותר של הקרקע המגלגלת (~ -0.19), אחרת
        // פני השטח השטוחים שלו בצבע אחיד בצבצו מבעד לעמקי הקרקע ויצרו כתמים ירוקים חלקים.
        addMesh(
            new THREE.BoxGeometry(40, 0.55, 90),
            groundBaseMat,
            0,
            -0.62,
            0,
            false,
            true
        );

        // קרקע עם טקסטורת מדשאה צפופה (במקום צבע אחיד).
        const terrainMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: createLawnTexture(10, 22),
            roughness: groundRoughness,
            metalness: 0.0
        });

        const terrain = addMesh(
            createTerrainGeometry(isVolcano ? 'forest' : mapId),
            terrainMat,
            0,
            0.018,
            0,
            false,
            true
        );

        terrain.rotation.x = -Math.PI / 2;
        terrain.position.y = 0.018;

        // (השביל הוסר: הוא נראה בדיוק כמו הקרקע ויצר רק קו תפר אלכסוני.)

        // במפת הים הדשא נקי: בלי אבנים, חלוקים וקישוטים.
        if (!isVolcano) {
            addGroundDetail(theme);
            addForegroundScenery(theme);
            addPerspectiveDepthDetails(theme);
            addDeepPerspectiveCorridor(theme);
            addDesertDepthTransition(theme);   // קבוצות עשב וצלליות ירוקות
        }
        add3DGrass(isVolcano ? 'forest' : mapId);   // מחזיר מיד אם המפה אינה 'forest'
        addWeatherParticles(isVolcano ? 'volcano' : theme);

        if (theme === 'desert') {
            // שקיעה זהובה: רקע, ערפל ותאורה חמים.
            scene.background.set(FOG_COLOR);
            scene.fog.color.set(FOG_COLOR);
            scene.fog.near = FOG_NEAR;
            scene.fog.far = FOG_FAR;
            if (isVolcano) {
                scene.background.set(0x1f2a66);
                scene.fog.color.set(0x1f2a66);
                scene.fog.near = 26;
                scene.fog.far = 175;
                sunLight.color.set(0xa9b9ff);
                sunLight.intensity = 1.0;
                hemiLight.color.set(0x6f80e0);
                hemiLight.groundColor.set(0x1b2a1f);
                hemiLight.intensity = 0.6;
            } else {
                sunLight.color.set(0xffbd78);
                sunLight.intensity = 1.75;
                hemiLight.color.set(0xffd9a0);
                hemiLight.groundColor.set(0x172612);
                hemiLight.intensity = 0.30;
            }

            // פירמידות סלע ענקיות: שתיים מסגרות משני הצדדים ואחת גדולה ברקע.
            // הן ממוקמות מחוץ לשביל, והשטח שבו התותח והסלעים זזים נשאר פנוי.
            const rockTexture = createRockTexture();
            const pyramidMatA = new THREE.MeshStandardMaterial({
                color: 0x4f4034,
                map: rockTexture.map,
                bumpMap: rockTexture.bumpMap,
                bumpScale: 0.9,
                roughness: 0.95,
                metalness: 0.0
            });
            const pyramidMatB = new THREE.MeshStandardMaterial({
                color: 0x382d25,
                map: rockTexture.map,
                bumpMap: rockTexture.bumpMap,
                bumpScale: 0.9,
                roughness: 0.96,
                metalness: 0.0
            });
            // הגובה והמרחק חושבו מול זווית המצלמה, כך שקצות הפירמידות נשארים
            // נמוכים מספיק והשמיים הזהובים נראים מעליהן; הבסיסים מחוץ לשביל (רוחב ~3.7).
            if (isVolcano) addSea(); else {
            const p1 = addMesh(createPyramidGeometry(7.4, 17.5, 12), pyramidMatA, -11.6, 8.75, -29);
            p1.rotation.y = Math.PI / 4;
            const p2 = addMesh(createPyramidGeometry(7.8, 18.5, 12), pyramidMatA, 12.0, 9.25, -32);
            p2.rotation.y = Math.PI / 4;
            const p3 = addMesh(createPyramidGeometry(10.5, 15.5, 14), pyramidMatB, 0, 7.75, -47);
            p3.rotation.y = Math.PI / 4;
            }

            // (הוסרה שכבת הזוהר התוספתית שישבה כמעטפת כמעט חופפת על הפירמידות: היא יצרה
            // כיפה מוארת מרצדת בקצוות. הקצוות נשארים נקיים וחדים.)
            if (!isVolcano && SHOW_GRASS_ROCKS) {   // הסלעים שעל הדשא הוסרו
                addRockDecoration(-6, -5, 1.2, 0x6b5d52);
                addRockDecoration(7, -7, 0.85, 0x7d6d60);
            }

            // פס אדמה עמוק בחזית, בהשראת החלק התחתון של תמונת הפתיחה.
            const soilMat = new THREE.MeshStandardMaterial({
                color: 0x513522,
                roughness: 1.0,
                metalness: 0
            });
            const soilBand = addMesh(
                new THREE.BoxGeometry(40, 0.42, 1.35),
                soilMat,
                0,
                -0.52,
                11.2,
                false,
                true
            );
            soilBand.receiveShadow = true;

            const rootShadow = new THREE.Mesh(
                new THREE.BoxGeometry(40, 0.05, 0.18),
                new THREE.MeshBasicMaterial({ color: isVolcano ? 0x1a0e08 : 0x263713, transparent: true, opacity: 0.55 })
            );
            rootShadow.position.set(0, 0.03, 10.52);
            mapGroup.add(rootShadow);
        } else if (theme === 'forest') {
            scene.background.set(FOG_COLOR);
            scene.fog.color.set(FOG_COLOR);
            scene.fog.near = FOG_NEAR;
            scene.fog.far = FOG_FAR;
            sunLight.color.set(0xfff6d7);
            sunLight.intensity = 1.34;

            // עצים קרובים — גדולים וברורים, כמו ברפרנס.
            [
                [-9.8, -3.0, 1.15], [-7.8, -7.0, 1.45],
                [8.8, -4.0, 1.25], [10.0, -8.0, 1.55],
                [-10.8, -12.5, 1.65], [11.2, -14.0, 1.80]
            ].forEach(([x, z, scale]) => addLowPolyTree(x, z, scale));

            // שכבת עצים בינונית שממלאת את צידי המסלול.
            [-11, -8.5, -5.8, 5.8, 8.5, 11].forEach((x, i) => {
                addLowPolyTree(x, -19 - (i % 2) * 2.2, 1.55 + (i % 3) * 0.18);
            });

            // סלעים וצמחייה נמוכה נותנים קנה מידה לקרקע.
            addRockDecoration(-7.0, -9.0, 0.72, 0x56634f);
            addRockDecoration(7.2, -11.0, 0.82, 0x4d5c48);
            addRockDecoration(-9.2, -17.0, 0.95, 0x465542);
            addRockDecoration(9.4, -18.0, 1.05, 0x45533f);
        } else if (mapId === 'ice') {
            scene.background.set(0x79b8d1);
            scene.fog.color.set(0x79b8d1);
            scene.fog.density = 0.012;
            sunLight.color.set(0xeaf8ff);
            sunLight.intensity = 1.24;
            const mountainMat = new THREE.MeshStandardMaterial({ color: 0xe0f2fe, roughness: 0.6, flatShading: true });
            [-15, 15].forEach((x, i) => {
                const m = addMesh(new THREE.ConeGeometry(7 + i * 2, 13 + i * 4, 5), mountainMat, x, 6.5 + i * 2, -15);
                m.rotation.y = 0.35;
            });
            for (let i = 0; i < 8; i++) addCrystal((Math.random() - 0.5) * 24, -5 - Math.random() * 13, 0.7 + Math.random() * 0.8);
        } else if (mapId === 'volcano') {
            scene.background.set(0x241114);
            scene.fog.color.set(0x241114);
            scene.fog.density = 0.0155;
            sunLight.color.set(0xffb098);
            sunLight.intensity = 1.12;
            const mountainMat = new THREE.MeshStandardMaterial({ color: 0x44403c, roughness: 1, flatShading: true });
            const volcano = addMesh(new THREE.ConeGeometry(11, 19, 7), mountainMat, 0, 7.5, -18);
            volcano.rotation.y = 0.2;
            const lavaMat = new THREE.MeshBasicMaterial({ color: 0xff6b35 });
            addMesh(new THREE.CylinderGeometry(1.9, 2.6, 0.15, 16), lavaMat, 0, 0.12, -18, false, false);
            [-10, -5, 5, 10].forEach((x, i) => addLavaRock(x, -7 - (i % 2) * 3, 0.9 + (i % 2) * 0.25));
        }
    }

    buildMap(selectedMap);

    // ==========================================
    // 4. עיצוב התותח - 3D DETAIL PASS
    // ==========================================
    const cannonGroup = new THREE.Group();
    // גודל התותח. הנובה גדול יותר (כמו בתמונת המטרה, שבה התותח תופס את רוב רוחב המסך).
    const CANNON_BASE_SCALE = 1.14;
    const NOVA_SIZE_BOOST = 1.00;      // אפשר לשחק: 1.0 = כמו הקלאסי, 1.5 = הכי קרוב לתמונה
    let CANNON_SCALE = CANNON_BASE_SCALE;

    // גוף תלת-ממדי עם קצוות מעוגלים.
    function createRoundedBoxGeometry(width, height, depth, radius, bevelSize = 0.08, bevelSegments = 2) {
        const shape = new THREE.Shape();
        const x = -width / 2;
        const y = -height / 2;
        const w = width;
        const h = height;
        const r = Math.min(radius, width / 2, height / 2);

        shape.moveTo(x + r, y);
        shape.lineTo(x + w - r, y);
        shape.quadraticCurveTo(x + w, y, x + w, y + r);
        shape.lineTo(x + w, y + h - r);
        shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        shape.lineTo(x + r, y + h);
        shape.quadraticCurveTo(x, y + h, x, y + h - r);
        shape.lineTo(x, y + r);
        shape.quadraticCurveTo(x, y, x + r, y);

        const geometry = new THREE.ExtrudeGeometry(shape, {
            depth,
            bevelEnabled: true,
            bevelSegments,
            steps: 1,
            bevelSize,
            bevelThickness: bevelSize
        });

        geometry.center();
        geometry.computeVertexNormals();
        return geometry;
    }

    function addCannonPart(geometry, material, position, cast = true, receive = true) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(position);
        mesh.castShadow = cast;
        mesh.receiveShadow = receive;
        cannonGroup.add(mesh);
        return mesh;
    }

    // חומרים שונים כדי שהמתכת, הגומי והצבע לא ייראו כמו חומר אחד.
    const darkMetalMat = new THREE.MeshStandardMaterial({
        color: 0x18232d,
        roughness: 0.26,
        metalness: 0.72
    });

    const bodyMetalMat = new THREE.MeshPhysicalMaterial({
        color: 0x2d3e49,
        roughness: 0.27,
        metalness: 0.72,
        clearcoat: 0.22,
        clearcoatRoughness: 0.18
    });

    const edgeMetalMat = new THREE.MeshPhysicalMaterial({
        color: 0x526572,
        roughness: 0.20,
        metalness: 0.88,
        clearcoat: 0.16,
        clearcoatRoughness: 0.16
    });

    const rubberMat = new THREE.MeshStandardMaterial({
        color: 0x101417,
        roughness: 0.96,
        metalness: 0.01
    });

    const hubMat = new THREE.MeshStandardMaterial({
        color: 0x778994,
        roughness: 0.28,
        metalness: 0.78
    });

    const boltMat = new THREE.MeshStandardMaterial({
        color: 0x9aa7ae,
        roughness: 0.22,
        metalness: 0.88
    });

    // גוף ראשי מעוגל.
    addCannonPart(
        createRoundedBoxGeometry(
            2.25,
            0.64,
            1.72,
            0.22,
            0.10,
            3
        ),
        bodyMetalMat,
        new THREE.Vector3(0, 0.34, 0)
    );

    // מסגרת תחתונה שנותנת משקל ותחושת שלדה.
    addCannonPart(
        createRoundedBoxGeometry(
            1.86,
            0.24,
            1.44,
            0.09,
            0.05,
            2
        ),
        darkMetalMat,
        new THREE.Vector3(0, 0.04, 0)
    );

    // לוחות צד משוריינים וברגים.
    [-1, 1].forEach(side => {
        addCannonPart(
            createRoundedBoxGeometry(
                0.16,
                0.52,
                1.35,
                0.06,
                0.03,
                2
            ),
            edgeMetalMat,
            new THREE.Vector3(side * 1.06, 0.43, 0)
        );

        [-0.43, 0.43].forEach(z => {
            const bolt = new THREE.Mesh(
                new THREE.SphereGeometry(0.075, 10, 8),
                boltMat
            );
            bolt.position.set(side * 1.155, 0.51, z);
            bolt.castShadow = true;
            cannonGroup.add(bolt);
        });
    });

    // פרטי פאנלים עדינים שמונעים מהגוף להיראות כמו קופסה אחת.
    const panelLineMat = new THREE.MeshStandardMaterial({
        color: 0x111a20,
        roughness: 0.46,
        metalness: 0.55
    });

    [-0.58, 0, 0.58].forEach((z, index) => {
        const line = new THREE.Mesh(
            new THREE.BoxGeometry(0.075, 0.035, 0.72 - index * 0.05),
            panelLineMat
        );
        line.position.set(-0.48 + index * 0.48, 0.665, z * 0.7);
        line.castShadow = true;
        cannonGroup.add(line);
    });

    // פסי חיזוק קדמיים.
    [-0.68, 0.68].forEach(x => {
        const brace = new THREE.Mesh(
            createRoundedBoxGeometry(0.10, 0.34, 0.92, 0.04, 0.02, 2),
            edgeMetalMat
        );
        brace.position.set(x, 0.67, 0.05);
        brace.rotation.y = x > 0 ? -0.08 : 0.08;
        brace.castShadow = true;
        cannonGroup.add(brace);
    });

    // טבעת מסתובבת לבסיס הצריח.
    const turretRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.82, 0.10, 8, 24),
        edgeMetalMat
    );
    turretRing.rotation.x = Math.PI / 2;
    turretRing.position.set(0, 0.72, 0);
    turretRing.castShadow = true;
    cannonGroup.add(turretRing);

    // גוף צריח חצי-כיפתי.
    const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.90, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshPhysicalMaterial({
            color: 0x1f7fc4,
            emissive: 0x06304f,
            roughness: 0.28,
            metalness: 0.2,
            clearcoat: 1.0,
            clearcoatRoughness: 0.12
        })
    );
    dome.position.y = 0.60;
    dome.castShadow = true;
    dome.receiveShadow = true;
    cannonGroup.add(dome);

    // צוואר צריח קטן — כחול כדי שלא יופיע חלק שחור על/מתחת לכיפה הכחולה.
    // שינוי ויזואלי בלבד: לא נוגעים במיקום, בגלגלים, במתלים או בפיזיקה.
    const turretCollarMat = new THREE.MeshPhysicalMaterial({
        color: 0x1f7fc4,
        emissive: 0x06304f,
        roughness: 0.30,
        metalness: 0.18,
        clearcoat: 0.85,
        clearcoatRoughness: 0.14
    });

    const turretCollar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.67, 0.74, 0.20, 20),
        turretCollarMat
    );
    turretCollar.position.y = 0.67;
    turretCollar.castShadow = true;
    turretCollar.receiveShadow = true;
    cannonGroup.add(turretCollar);

    const rearHousing = new THREE.Mesh(
        createRoundedBoxGeometry(0.94, 0.32, 0.34, 0.10, 0.035, 2),
        darkMetalMat
    );
    rearHousing.position.set(0, 0.84, -0.63);
    rearHousing.castShadow = true;
    cannonGroup.add(rearHousing);

    // לוחית צבע קטנה שנותנת נקודת חומר שונה על הגוף.
    const accentPlate = new THREE.Mesh(
        createRoundedBoxGeometry(0.54, 0.12, 0.48, 0.045, 0.02, 2),
        edgeMetalMat
    );
    accentPlate.position.set(0, 0.73, -0.40);
    accentPlate.castShadow = true;
    cannonGroup.add(accentPlate);

    // לוח קדמי כהה לצריח.
    // לוח הצריח הקדמי נשאר בגיאומטריה המקורית, אבל כחול כדי שלא יכסה
    // את הכיפה הכחולה בכתם שחור. שינוי חומר בלבד — ללא שינוי במיקום/פיזיקה.
    const frontPlate = new THREE.Mesh(
        createRoundedBoxGeometry(1.62, 0.48, 0.16, 0.12, 0.04, 2),
        turretCollarMat
    );
    frontPlate.position.set(0, 0.70, 0.70);
    frontPlate.castShadow = true;
    cannonGroup.add(frontPlate);

    // תושבת ומכלול הקנים נפרדים כדי שנוכל לתת רתיעה מכנית אמיתית.
    const barrelAssembly = new THREE.Group();
    barrelAssembly.position.set(0, 0.82, 0.05);
    cannonGroup.add(barrelAssembly);

    // בסיס הקנים צר ורדוד מספיק כדי להישאר כולו בתוך הכיפה גם בזמן רתיעה -
    // קודם הפינות שלו בלטו מבעד לכיפה ויצרו שתי נקודות שחורות בכל ירייה.
    const barrelBase = new THREE.Mesh(
        createRoundedBoxGeometry(0.96, 0.24, 0.60, 0.10, 0.045, 2),
        darkMetalMat
    );
    barrelBase.position.set(0, 0.06, 0.0);
    barrelBase.castShadow = true;
    barrelAssembly.add(barrelBase);

    const barrelMat = new THREE.MeshStandardMaterial({
        color: 0x3d4e5a,
        metalness: 0.82,
        roughness: 0.22
    });

    const muzzleMat = new THREE.MeshStandardMaterial({
        color: 0x11191f,
        metalness: 0.68,
        roughness: 0.25
    });

    const barrelGeo = new THREE.CylinderGeometry(0.13, 0.15, 0.98, 18);
    const muzzleGeo = new THREE.CylinderGeometry(0.17, 0.15, 0.12, 18, 1, false);
    const muzzleBoreGeo = new THREE.CylinderGeometry(0.095, 0.095, 0.125, 16, 1, true);

    [-0.37, 0.37].forEach(x => {
        const barrel = new THREE.Mesh(barrelGeo, barrelMat);
        barrel.position.set(x, 0.61, 0);
        barrel.castShadow = true;
        barrelAssembly.add(barrel);

        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.145, 0.028, 6, 16),
            edgeMetalMat
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.set(x, 0.56, 0);
        ring.castShadow = true;
        barrelAssembly.add(ring);

        const muzzle = new THREE.Mesh(muzzleGeo, muzzleMat);
        muzzle.position.set(x, 1.12, 0);
        muzzle.castShadow = true;
        barrelAssembly.add(muzzle);

        const bore = new THREE.Mesh(
            muzzleBoreGeo,
            new THREE.MeshBasicMaterial({ color: 0x020507 })
        );
        bore.position.set(x, 1.125, 0);
        barrelAssembly.add(bore);
    });

    // =========================================================
    // הגבהת גוף התותח ביחס לגלגלים
    // =========================================================
    // כל חלקי גוף התותח שנבנו עד לנקודה הזו מורמים, בעוד הגלגלים
    // והמתלים שנוצרים בהמשך נשארים נמוכים. כך מתקבל מבנה כמו ברפרנס:
    // גוף גבוה, מתלים גלויים מתחתיו וגלגלים בצדדים.
    const CANNON_BODY_LIFT = 0.90;
    cannonGroup.children.forEach(child => {
        child.position.y += CANNON_BODY_LIFT;
    });

    // =========================================================
    // תנועת מתלים: הגוף "צף" על המתלים, הגלגלים נשארים על הקרקע
    // =========================================================
    // כל חלקי הגוף (כולל הקנים) עוברים לקבוצה אחת שאפשר להוריד ולהטות מעט.
    // הגלגלים, הנאבות והחלק התחתון של המתלים נשארים במקום, והכריות והזרועות
    // נמתחות ומתכווצות בין הגוף לגלגלים, בלי לשנות את הצורה שלהם במנוחה.
    const BODY_PIVOT_Y = 1.0;
    const bodyRig = new THREE.Group();
    bodyRig.position.set(0, BODY_PIVOT_Y, 0);
    cannonGroup.add(bodyRig);
    cannonGroup.children.slice().forEach(child => {
        if (child === bodyRig) return;
        child.position.y -= BODY_PIVOT_Y;
        bodyRig.add(child);
    });

    // כל המשתנים כאן נמדדים ביחידות של התותח (לפני CANNON_SCALE).
    const suspensionMotion = {
        dip: 0, dipV: 0,        // צלילה אנכית (חיובי = הגוף יורד)
        roll: 0, rollV: 0,      // הטיה לצדדים
        pitch: 0, pitchV: 0,    // הטיה קדימה/אחורה
        prevX: null, prevVx: 0,
        rest: true
    };
    const suspensionLinks = [];   // זרועות + בולמי קפיץ: { mesh, a, b, aSprung, bSprung, len0 }
    const suspensionSprings = []; // קבוצות coil-over שמתעדכנות עם תנועת הגוף
    const suspensionJoints = [];  // מפרקים שנעים עם הגוף: { mesh, rest }
    const suspensionOuterParts = []; // חלקים בצד הגלגל (לא זזים עם הגוף): { mesh, rest }

    const _susPivot = new THREE.Vector3(0, BODY_PIVOT_Y, 0);
    const _susA = new THREE.Vector3();
    const _susB = new THREE.Vector3();
    const _susDir = new THREE.Vector3();
    const _susUp = new THREE.Vector3(0, 1, 0);

    // מתנע דחיפה קצרה (למשל בירי או כשסלע פוגע): הגוף ינוע ויחזור בקפיצה רכה.
    function suspensionKick(dipKick, pitchKick) {
        suspensionMotion.dipV += dipKick;
        suspensionMotion.pitchV += pitchKick;
        suspensionMotion.rest = false;
    }

    // נקודה שנעה עם הגוף (או נשארת במקום אם היא על הגלגל).
    function susPoint(rest, sprung, out) {
        out.copy(rest);
        if (sprung) out.sub(_susPivot).applyMatrix4(bodyRig.matrix);
        return out;
    }

    function updateSuspensionMotion() {
        const S = suspensionMotion;

        const x = cannonGroup.position.x;
        let vx = S.prevX === null ? 0 : x - S.prevX;
        S.prevX = x;
        if (Math.abs(vx) > 1.2) vx = 0;
        const ax = vx - S.prevVx;
        S.prevVx = vx;

        S.dipV += Math.min(Math.abs(ax), 0.15) * 0.10;
        S.dipV += -S.dip * 0.12;
        S.dipV *= 0.82;
        S.dip = Math.max(-0.05, Math.min(0.11, S.dip + S.dipV));

        const rollTarget = Math.max(-0.05, Math.min(0.05, vx * 0.13));
        S.rollV += (rollTarget - S.roll) * 0.10;
        S.rollV *= 0.80;
        S.roll += S.rollV;

        S.pitchV += -S.pitch * 0.10;
        S.pitchV *= 0.84;
        S.pitch = Math.max(-0.04, Math.min(0.04, S.pitch + S.pitchV));

        const settled =
            Math.abs(S.dip) < 1e-4 && Math.abs(S.dipV) < 1e-4 &&
            Math.abs(S.roll) < 1e-4 && Math.abs(S.rollV) < 1e-4 &&
            Math.abs(S.pitch) < 1e-4 && Math.abs(S.pitchV) < 1e-4;

        if (settled) {
            if (S.rest) return;
            S.dip = S.dipV = S.roll = S.rollV = S.pitch = S.pitchV = 0;
            S.rest = true;
        } else {
            S.rest = false;
        }

        bodyRig.position.set(0, BODY_PIVOT_Y - S.dip, 0);
        bodyRig.rotation.set(S.pitch, 0, S.roll);
        bodyRig.updateMatrix();

        // זרועות: נמתחות בין נקודה בגוף לנקודה בגלגל.
        for (let i = 0; i < suspensionLinks.length; i++) {
            const L = suspensionLinks[i];
            susPoint(L.a, L.aSprung, _susA);
            susPoint(L.b, L.bSprung, _susB);
            _susDir.subVectors(_susB, _susA);
            const len = _susDir.length();
            L.mesh.position.addVectors(_susA, _susB).multiplyScalar(0.5);
            L.mesh.quaternion.setFromUnitVectors(_susUp, _susDir.multiplyScalar(1 / Math.max(len, 1e-6)));
            L.mesh.scale.y = len / L.len0;
        }

        // קפיצי coil-over: הקצה העליון נע עם הגוף, התחתון נשאר באזור הנאבה.
        for (let i = 0; i < suspensionSprings.length; i++) {
            const K = suspensionSprings[i];
            susPoint(K.a, K.aSprung, _susA);
            susPoint(K.b, K.bSprung, _susB);
            _susDir.subVectors(_susB, _susA);
            const len = _susDir.length();
            K.group.position.addVectors(_susA, _susB).multiplyScalar(0.5);
            K.group.quaternion.setFromUnitVectors(_susUp, _susDir.multiplyScalar(1 / Math.max(len, 1e-6)));
            K.group.scale.y = len / K.len0;
        }

        for (let i = 0; i < suspensionJoints.length; i++) {
            const J = suspensionJoints[i];
            susPoint(J.rest, true, J.mesh.position);
        }
    }

    // גלגלים - צמיגי שטח גדולים ושחורים עם דוגמת שיני אחיזה, צדדים מעוצבים וחישוק כרום עמוק.
    // כל הגלגלים ישרים ומתגלגלים יחד סביב ציר Z.
    // כדי לחסוך עומס, כל החלקים של גלגל אחד ממוזגים לכמה גיאומטריות בודדות (שמשותפות לארבעת הגלגלים).
    const cannonWheels = [];
    const classicCannonWheels = [];

    // ---- מידות הצמיג (אפשר לשחק איתן) ----
    const TIRE_MAJOR_R = 0.355;                       // רדיוס הטבעת של הצמיג
    const TIRE_MINOR_R = 0.19;                        // עובי הצמיג (חצי רוחב)
    const TIRE_OUTER_R = TIRE_MAJOR_R + TIRE_MINOR_R; // רדיוס חיצוני של הגומי (0.545)
    const TIRE_GROUND_DROP = 0.425;                   // כמה מרכז הגלגל גבוה מהקרקע
    const WHEEL_X = 1.74;                             // המרחק של הגלגלים מאמצע התותח
    const WHEEL_Y = TIRE_OUTER_R - TIRE_GROUND_DROP;  // גובה מרכז הגלגל: התחתית נשארת על הקרקע

    // X = רוחב, Y = גובה, Z = קדימה/אחורה.
    const wheelPositions = [
        [-WHEEL_X, WHEEL_Y,  0.72],
        [ WHEEL_X, WHEEL_Y,  0.72],
        [-WHEEL_X, WHEEL_Y, -0.72],
        [ WHEEL_X, WHEEL_Y, -0.72]
    ];

    // מפת סביבה קטנה (שמיים של שקיעה) בשביל ההשתקפות בכרום ובברק העדין של הגומי.
    // אם המכשיר לא תומך, נופלים לחומרים רגילים בלי לשבור את המשחק.
    function createWheelEnvMap() {
        try {
            const c = document.createElement('canvas');
            c.width = 256;
            c.height = 128;
            const g = c.getContext('2d');

            const sky = g.createLinearGradient(0, 0, 0, 128);
            sky.addColorStop(0.00, '#6f86b8');
            sky.addColorStop(0.38, '#ffd9a0');
            sky.addColorStop(0.50, '#ffb36b');
            sky.addColorStop(0.52, '#3a2a1c');
            sky.addColorStop(1.00, '#17110c');
            g.fillStyle = sky;
            g.fillRect(0, 0, 256, 128);

            // השמש (בכיוון אור השמש של הסצנה) + זוהר חם מאחור.
            [[217, 29, 34, 'rgba(255,248,225,1)'], [46, 56, 40, 'rgba(255,176,74,0.9)']].forEach(([x, y, r, col]) => {
                const glow = g.createRadialGradient(x, y, 0, x, y, r);
                glow.addColorStop(0, col);
                glow.addColorStop(1, 'rgba(255,170,80,0)');
                g.fillStyle = glow;
                g.fillRect(0, 0, 256, 128);
            });

            const tex = new THREE.CanvasTexture(c);
            tex.encoding = THREE.sRGBEncoding;
            const pmrem = new THREE.PMREMGenerator(renderer);
            const rt = pmrem.fromEquirectangular(tex);
            tex.dispose();
            pmrem.dispose();
            return rt.texture;
        } catch (err) {
            console.warn('Wheel env map unavailable, using fallback materials', err);
            return null;
        }
    }
    const wheelEnvMap = createWheelEnvMap();

    // ---- כלים קטנים לבניית הגלגל ----
    function smooth01(t) {
        t = Math.min(1, Math.max(0, t));
        return t * t * (3 - 2 * t);
    }

    // קופסה שהצד העליון שלה צר יותר (שיפוע), כדי שהקצוות יתפסו אור ויראו תלת-ממדיים.
    // axis: 'y' / 'z' / '-z' = לאיזה כיוון הקופסה מצטמצמת.
    function taperedBox(sx, sy, sz, axis, k) {
        const g = new THREE.BoxGeometry(sx, sy, sz);
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) {
            const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
            if (axis === 'y' && y > 0) { p.setX(i, x * k); p.setZ(i, z * k); }
            else if (axis === 'z' && z > 0) { p.setX(i, x * k); p.setY(i, y * k); }
            else if (axis === '-z' && z < 0) { p.setX(i, x * k); p.setY(i, y * k); }
        }
        g.computeVertexNormals();
        return g;
    }

    function partMatrix(x, y, z, rx = 0, ry = 0, rz = 0) {
        return new THREE.Matrix4().compose(
            new THREE.Vector3(x, y, z),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
            new THREE.Vector3(1, 1, 1)
        );
    }

    // ממזג הרבה חלקים לגיאומטריה אחת. אם לחלקים יש צבע - נשמר צבע לכל קודקוד
    // (אפשר גם פונקציית shade שמכהה/מבהירה לפי מיקום, כמו צל קטן ליד החישוק).
    function mergeWheelParts(parts) {
        const pos = [], nor = [], col = [];
        const tmp = new THREE.Color();
        parts.forEach(part => {
            const g = part.geo.index ? part.geo.toNonIndexed() : part.geo.clone();
            g.applyMatrix4(part.m);
            const p = g.attributes.position.array;
            const n = g.attributes.normal.array;
            for (let i = 0; i < p.length; i++) {
                pos.push(p[i]);
                nor.push(n[i]);
            }
            if (part.color) {
                for (let i = 0; i < p.length; i += 3) {
                    const f = part.shade ? part.shade(p[i], p[i + 1], p[i + 2]) : 1;
                    tmp.copy(part.color).multiplyScalar(f);
                    col.push(tmp.r, tmp.g, tmp.b);
                }
            }
            g.dispose();
        });
        const out = new THREE.BufferGeometry();
        out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
        if (col.length) out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        return out;
    }

    // ---- הגומי: שחור עמוק עם ברק עדין ----
    // בגרסת Three.js הזו צבעים נכנסים לתאורה בלי gamma, ולכן ערכים כהים מאוד נחוצים כדי שייראה שחור
    // (ערכים בהירים יותר נראו חומים תחת אור השקיעה החם). הגוון הכחלחל מבטל את החום של השמש.
    const COLOR_TIRE = new THREE.Color(0x030304);
    const COLOR_LUG = new THREE.Color(0x09090b);

    const LUG_N = 14;
    const LUG_STEP = (Math.PI * 2) / LUG_N;
    const centerLugGeo = taperedBox(0.17, 0.19, 0.17, 'y', 0.72);      // x משיכה, y רדיאלי, z רוחב
    const shoulderLugGeo = taperedBox(0.15, 0.20, 0.125, 'y', 0.70);
    const sideBlockGeoPos = taperedBox(0.075, 0.10, 0.04, 'z', 0.75);
    const sideBlockGeoNeg = taperedBox(0.075, 0.10, 0.04, '-z', 0.75);

    const rubberParts = [];

    // גוף הצמיג (כהה יותר ליד החישוק, כאילו יש צל).
    rubberParts.push({
        geo: new THREE.TorusGeometry(TIRE_MAJOR_R, TIRE_MINOR_R, 16, 40),
        m: partMatrix(0, 0, 0),
        color: COLOR_TIRE,
        shade: (x, y) => 0.6 + 0.9 * smooth01((Math.hypot(x, y) - 0.17) / 0.38)
    });

    for (let i = 0; i < LUG_N; i++) {
        const a = i * LUG_STEP;
        const a2 = (i + 0.5) * LUG_STEP;

        // שן אחיזה מרכזית גבוהה.
        rubberParts.push({
            geo: centerLugGeo,
            m: partMatrix(Math.cos(a) * 0.57, Math.sin(a) * 0.57, 0, 0, 0, a - Math.PI / 2),
            color: COLOR_LUG
        });

        [-1, 1].forEach(side => {
            // שיני כתף משני הצדדים, מוסטות בחצי צעד - נותן דוגמת "זיגזג" של צמיג שטח אמיתי.
            rubberParts.push({
                geo: shoulderLugGeo,
                m: partMatrix(Math.cos(a2) * 0.525, Math.sin(a2) * 0.525, side * 0.125, 0, 0, a2 - Math.PI / 2),
                color: COLOR_LUG
            });

            // בלוקים מורמים על דופן הצמיג (מה שרואים מהמצלמה).
            rubberParts.push({
                geo: side > 0 ? sideBlockGeoPos : sideBlockGeoNeg,
                m: partMatrix(Math.cos(a) * 0.47, Math.sin(a) * 0.47, side * 0.15, 0, 0, a - Math.PI / 2),
                color: COLOR_LUG
            });
        });
    }

    // טבעת הגנה מורמת סביב החישוק, בכל צד.
    [-1, 1].forEach(side => {
        rubberParts.push({
            geo: new THREE.TorusGeometry(0.335, 0.022, 6, 40),
            m: partMatrix(0, 0, side * 0.183),
            color: COLOR_LUG
        });
    });

    // ---- החישוק: כרום + צלחת כהה-מתכתית עמוקה ----
    const chromeParts = [];
    const dishParts = [];
    const spokeGeoPos = taperedBox(0.25, 0.085, 0.045, 'z', 0.7);
    const spokeGeoNeg = taperedBox(0.25, 0.085, 0.045, '-z', 0.7);
    const lipGeo = new THREE.TorusGeometry(0.29, 0.032, 10, 36);
    const nutGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.05, 6);
    const domeGeo = new THREE.SphereGeometry(0.09, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const capBaseGeo = new THREE.CylinderGeometry(0.095, 0.095, 0.03, 20);
    const dishOuterGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.04, 36);
    const dishInnerGeo = new THREE.CylinderGeometry(0.20, 0.20, 0.04, 28);

    [-1, 1].forEach(side => {
        // טבעת כרום עבה בקצה החישוק.
        chromeParts.push({ geo: lipGeo, m: partMatrix(0, 0, side * 0.19) });

        // 5 חישורים עם שיפוע בקצוות + 5 אומי גלגל בין החישורים.
        for (let i = 0; i < 5; i++) {
            const b = (i / 5) * Math.PI * 2 + Math.PI / 2;
            chromeParts.push({
                geo: side > 0 ? spokeGeoPos : spokeGeoNeg,
                m: partMatrix(Math.cos(b) * 0.165, Math.sin(b) * 0.165, side * 0.178, 0, 0, b)
            });
            const nb = b + Math.PI / 5;
            chromeParts.push({
                geo: nutGeo,
                m: partMatrix(Math.cos(nb) * 0.115, Math.sin(nb) * 0.115, side * 0.185, Math.PI / 2, 0, 0)
            });
        }

        // מכסה מרכזי: בסיס + כיפה.
        chromeParts.push({ geo: capBaseGeo, m: partMatrix(0, 0, side * 0.18, Math.PI / 2, 0, 0) });
        chromeParts.push({ geo: domeGeo, m: partMatrix(0, 0, side * 0.185, side * Math.PI / 2, 0, 0) });

        // צלחת עמוקה בשני מדרגות מאחורי החישורים.
        dishParts.push({ geo: dishOuterGeo, m: partMatrix(0, 0, side * 0.15, Math.PI / 2, 0, 0) });
        dishParts.push({ geo: dishInnerGeo, m: partMatrix(0, 0, side * 0.165, Math.PI / 2, 0, 0) });
    });

    const wheelRubberGeo = mergeWheelParts(rubberParts);
    const wheelChromeGeo = mergeWheelParts(chromeParts);
    const wheelDishGeo = mergeWheelParts(dishParts);

    // ---- חומרים ----
    const wheelRubberMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: true,
        roughness: wheelEnvMap ? 0.58 : 0.85,
        metalness: 0.0,
        envMap: wheelEnvMap,
        envMapIntensity: 0.55
    });

    const chromeMat = new THREE.MeshStandardMaterial({
        color: 0xe6ebee,
        roughness: 0.16,
        metalness: 1.0,
        envMap: wheelEnvMap,
        envMapIntensity: 1.25
    });

    const gunmetalMat = new THREE.MeshStandardMaterial({
        color: 0x2a3036,
        roughness: 0.32,
        metalness: 1.0,
        envMap: wheelEnvMap,
        envMapIntensity: 1.0
    });

    if (!wheelEnvMap) {
        chromeMat.metalness = 0.55;
        chromeMat.roughness = 0.22;
        chromeMat.emissive.setHex(0x2a2e31);
        gunmetalMat.metalness = 0.5;
        gunmetalMat.color.setHex(0x1a1f23);
    }

    const nvTireMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.82, metalness: 0.0 });
    const hubSteelMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.34, metalness: 0.75 });
    const hubDarkMat = new THREE.MeshStandardMaterial({ color: 0x07080a, roughness: 0.5, metalness: 0.5 });
    const hubBoltGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.04, 6);
    const nvRingMat = new THREE.MeshStandardMaterial({ color: 0x080605, roughness: 0.8, metalness: 0.0 });
    const nvTreadMat = new THREE.MeshStandardMaterial({ color: 0x090908, roughness: 0.85, metalness: 0.0 });
    const MK2_TREAD_N = 18;            // פקעות בכל שורה
    const MK2_TREAD_ROWS = [-0.20, 0.0, 0.20];   // שלוש שורות לרוחב הצמיג, מתחלפות
    const nvTireGeo = new THREE.TorusGeometry(TIRE_MAJOR_R, TIRE_MINOR_R, 36, 96);
    {
        const pos = nvTireGeo.attributes.position;
        const col = new Float32Array(pos.count * 3);
        const TREAD_BLOCKS = 26;
        for (let ci = 0; ci < pos.count; ci++) {
            let px = pos.getX(ci), py = pos.getY(ci);
            let pz = pos.getZ(ci);
            {   // חתך סופר-אליפסה: צמיג מנופח ובעל נפח (כתפיים מלאות, כתר רחב ושטוח יותר)
                const r0 = Math.hypot(px, py);
                const c0 = (r0 - TIRE_MAJOR_R) / TIRE_MINOR_R, s0 = pz / TIRE_MINOR_R;
                const kk = 1 / Math.pow(Math.pow(Math.abs(c0), 2.5) + Math.pow(Math.abs(s0), 2.5), 0.4);
                const r1 = TIRE_MAJOR_R + TIRE_MINOR_R * c0 * kk;
                px *= r1 / r0; py *= r1 / r0; pz = TIRE_MINOR_R * s0 * kk;
            }
            const ringR = Math.hypot(px, py);
            const cosT = (ringR - TIRE_MAJOR_R) / TIRE_MINOR_R;                 // 1 = כתר (חיצוני), -1 = פנים
            const crown = Math.min(Math.max((cosT + 0.15) / 1.15, 0), 1);
            const side = Math.abs(pz) / TIRE_MINOR_R;                             // 1 = דופן
            let shade = Math.max(0.38 + 0.70 * Math.pow(crown, 0.9) - 0.10 * side, 0.20);
            shade += 0.55 * Math.exp(-Math.pow((cosT - 0.05) / 0.30, 2));                       // הכתף המעוגלת תופסת אור
            if (cosT < -0.40) shade *= 0.50 + 0.50 * Math.min(Math.max((cosT + 1.0) / 0.6, 0), 1);   // כהה ושקוע ליד החישוק

            // אזור הדוגמה: רק על הכתר. בלוקים מתחלפים בין שורת מרכז לשורות הצד
            const treadMask = Math.min(Math.max((cosT - 0.15) / 0.5, 0), 1);
            const ang = Math.atan2(py, px);
            const rowOff = side > 0.45 ? 0 : 0.5;
            const wv = 0.5 + 0.5 * Math.sin(((ang / (Math.PI * 2)) * TREAD_BLOCKS + rowOff) * Math.PI * 2);
            shade *= 1 + treadMask * 0.30 * (wv - 0.5) * 2;

            // בליטה נמוכה ובלתי אחידה בצללית (לא גלגל שיניים)
            const irregular = 0.75 + 0.25 * Math.sin(ang * 7.0 + 1.3);
            const k = 1 + treadMask * 0.020 * wv * irregular;
            pos.setXYZ(ci, px * k, py * k, pz);

            const jit = 0.86 + 0.28 * (0.5 + 0.5 * Math.sin(ci * 12.9898 + (ci % 7) * 4.1414));   // כתמי אבק עדינים
            col[ci * 3] = 0.030 * shade * jit; col[ci * 3 + 1] = 0.028 * shade * jit; col[ci * 3 + 2] = 0.027 * shade * jit;
        }
        pos.needsUpdate = true;
        nvTireGeo.computeVertexNormals();
        nvTireGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    const mk2TreadGeo = taperedBox(0.22, 0.14, 0.17, 'y', 0.78);   // שן אחיזה בולטת (בלוק מחורץ)
    const wheelOuter_smooth = [];

    wheelPositions.forEach(pos => {
        // wheelOuter = מיקום הגלגל. wheel = הציר שמסתובב.
        const wheelOuter = new THREE.Group();
        wheelOuter.position.set(pos[0], pos[1], pos[2]);

        const wheel = new THREE.Group();
        wheelOuter.add(wheel);

        const tireMesh = new THREE.Mesh(wheelRubberGeo, wheelRubberMat);
        tireMesh.castShadow = true;
        tireMesh.receiveShadow = true;
        wheel.add(tireMesh);

        // צמיג חלק עם דוגמת אחיזה נמוכה (קו חיצוני חלק כמו בתמונת המטרה) - מוצג רק בתותח האפור
        const smoothTire = new THREE.Group();
        smoothTire.visible = false;
        const smoothTorus = new THREE.Mesh(nvTireGeo, nvTireMat);
        smoothTorus.scale.z = 1.6;
        smoothTorus.castShadow = true;
        smoothTorus.receiveShadow = true;
        smoothTire.add(smoothTorus);
        const TIRE_W = 1.6;
        const treadMesh = new THREE.InstancedMesh(mk2TreadGeo, nvTreadMat, MK2_TREAD_N * MK2_TREAD_ROWS.length);
        const treadDummy = new THREE.Object3D();
        treadDummy.rotation.order = 'ZXY';
        let treadIdx = 0;
        MK2_TREAD_ROWS.forEach((rz, ri) => {
            // רדיוס פני הצמיג בגובה הזה לרוחב, ונטיית הפני (שיני הכתף נוטות החוצה ועוטפות את הכתף)
            const sN = Math.min(Math.abs(rz) / (TIRE_W * TIRE_MINOR_R), 0.97);
            const cN = Math.pow(1 - Math.pow(sN, 2.5), 0.4);
            const surfR = TIRE_MAJOR_R + TIRE_MINOR_R * cN;
            const tilt = Math.atan(Math.pow(sN / Math.max(cN, 0.05), 1.5) / TIRE_W) * Math.sign(rz);
            for (let ti = 0; ti < MK2_TREAD_N; ti++) {
                const ta = (ti + (ri % 2 ? 0.5 : 0)) * (Math.PI * 2 / MK2_TREAD_N);
                treadDummy.position.set(Math.cos(ta) * (surfR + 0.012), Math.sin(ta) * (surfR + 0.012), rz);
                treadDummy.rotation.set(tilt, 0, ta - Math.PI / 2);
                treadDummy.updateMatrix();
                treadMesh.setMatrixAt(treadIdx++, treadDummy.matrix);
            }
        });
        treadMesh.castShadow = true;
        treadMesh.frustumCulled = false;
        smoothTire.add(treadMesh);
        // בלוקים מורמים על שתי דפנות הצמיג (מה שרואים מהמצלמה)
        {
            const sideGeoP = taperedBox(0.12, 0.13, 0.06, 'z', 0.72), sideGeoN = taperedBox(0.12, 0.13, 0.06, '-z', 0.72);
            const Rb = 0.44;
            const cb = (Rb - TIRE_MAJOR_R) / TIRE_MINOR_R;
            const zFace = Math.pow(1 - Math.pow(Math.abs(cb), 2.5), 0.4) * TIRE_MINOR_R * TIRE_W;
            [1, -1].forEach(hs => {
                const sideMesh = new THREE.InstancedMesh(hs > 0 ? sideGeoP : sideGeoN, nvTreadMat, MK2_TREAD_N);
                const sd = new THREE.Object3D();
                for (let bi = 0; bi < MK2_TREAD_N; bi++) {
                    const ba = (bi + 0.25) * (Math.PI * 2 / MK2_TREAD_N);
                    sd.position.set(Math.cos(ba) * Rb, Math.sin(ba) * Rb, hs * (zFace - 0.012));
                    sd.rotation.set(0, 0, ba - Math.PI / 2);
                    sd.updateMatrix();
                    sideMesh.setMatrixAt(bi, sd.matrix);
                }
                sideMesh.castShadow = true;
                sideMesh.frustumCulled = false;
                smoothTire.add(sideMesh);
            });
        }
        // (הפקעות הבולטות הוחלפו בדוגמה על הצמיג עצמו)
        // רכזת מתכת גלויה על שני צדי הגלגל: דיסק פלדה, מרכז כהה וחמישה ברגים
        [-1, 1].forEach(hs => {
            const hz = hs * 0.19;   // החישוק שקוע בתוך הצמיג
            [[0.30, 0.322], [0.42, 0.318]].forEach(rr => {
                const ring = new THREE.Mesh(new THREE.TorusGeometry(rr[0], 0.012, 8, 40), nvRingMat);
                ring.position.z = hs * rr[1];
                smoothTire.add(ring);
            });
            const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.05, 28), hubSteelMat);
            disc.rotation.x = Math.PI / 2;
            disc.position.z = hz;
            smoothTire.add(disc);
            const well = new THREE.Mesh(new THREE.TorusGeometry(0.225, 0.03, 8, 36), nvRingMat);
            well.position.z = hz - hs * 0.005;
            smoothTire.add(well);
            const flange = new THREE.Mesh(new THREE.TorusGeometry(0.245, 0.036, 10, 40), hubSteelMat);   // שפת חישוק בולטת
            flange.position.z = hs * 0.235;
            smoothTire.add(flange);
            const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.06, 20), hubDarkMat);
            cap.rotation.x = Math.PI / 2;
            cap.position.z = hz + hs * 0.012;
            smoothTire.add(cap);
            for (let hb = 0; hb < 5; hb++) {
                const ha = hb * (Math.PI * 2 / 5);
                const bolt = new THREE.Mesh(hubBoltGeo, hubSteelMat);
                bolt.rotation.x = Math.PI / 2;
                bolt.position.set(Math.cos(ha) * 0.155, Math.sin(ha) * 0.155, hz + hs * 0.03);
                smoothTire.add(bolt);
            }
        });
        wheel.add(smoothTire);
        wheelOuter_smooth.push({ tire: tireMesh, smooth: smoothTire });

        const rimMesh = new THREE.Mesh(wheelChromeGeo, chromeMat);
        wheel.add(rimMesh);

        const dishMesh = new THREE.Mesh(wheelDishGeo, gunmetalMat);
        dishMesh.receiveShadow = true;
        wheel.add(dishMesh);

        // אין היגוי מלאכותי: התותח נע ימינה/שמאלה, ולכן כל ארבעת הגלגלים
        // מתגלגלים יחד סביב ציר Z. זה מונע סיבוב עקום בזמן שינוי כיוון.
        wheelOuter.userData.spinGroup = wheel;
        wheelOuter.userData.lastX = wheelOuter.position.x;

        cannonGroup.add(wheelOuter);
        cannonWheels.push(wheelOuter);
        classicCannonWheels.push(wheelOuter);
    });

    // =========================================================
    // מתלה חדש בסגנון התמונה שבחרת:
    // Coil-over שחור + Double Wishbone מתכתי פתוח.
    // אין כריות אוויר, ולכן אין יותר חדירה של מפוח לתוך גוף התותח או הצמיג.
    const suspensionRubberMat = new THREE.MeshStandardMaterial({
        color: 0x111315,
        roughness: 0.76,
        metalness: 0.06
    });

    const suspensionMetalMat = new THREE.MeshPhysicalMaterial({
        color: 0xb8bec1,
        roughness: 0.20,
        metalness: 0.94,
        clearcoat: 0.45,
        clearcoatRoughness: 0.10
    });

    const suspensionDarkMetalMat = new THREE.MeshStandardMaterial({
        color: 0x242a2d,
        roughness: 0.23,
        metalness: 0.92
    });

    function addSuspensionCylinderBetween(a, b, radius, material, segments = 14, aSprung = false, bSprung = false) {
        const start = a.clone();
        const end = b.clone();
        const direction = new THREE.Vector3().subVectors(end, start);
        const length = direction.length();
        const mesh = new THREE.Mesh(
            new THREE.CylinderGeometry(radius, radius, length, segments),
            material
        );
        mesh.position.copy(start).add(end).multiplyScalar(0.5);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        cannonGroup.add(mesh);
        suspensionLinks.push({ mesh, a: start, b: end, aSprung, bSprung, len0: Math.max(length, 1e-6) });
        return mesh;
    }

    function addSuspensionArmBetween(a, b, width, depth, material, aSprung = false, bSprung = false) {
        const start = a.clone();
        const end = b.clone();
        const direction = new THREE.Vector3().subVectors(end, start);
        const length = direction.length();
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(width, length, depth),
            material
        );
        mesh.position.copy(start).add(end).multiplyScalar(0.5);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        cannonGroup.add(mesh);
        suspensionLinks.push({ mesh, a: start, b: end, aSprung, bSprung, len0: Math.max(length, 1e-6) });
        return mesh;
    }

    function addSuspensionJoint(position, radius = 0.105, sprung = false) {
        const joint = new THREE.Mesh(
            new THREE.SphereGeometry(radius, 16, 12),
            suspensionDarkMetalMat
        );
        joint.position.copy(position);
        joint.castShadow = true;
        joint.receiveShadow = true;
        cannonGroup.add(joint);
        if (sprung) suspensionJoints.push({ mesh: joint, rest: position.clone() });
        else if (Math.abs(position.x) > 1.2) suspensionOuterParts.push({ mesh: joint, rest: position.clone() });
        return joint;
    }

    function addBolt(position, radius = 0.055, sprung = false) {
        const bolt = new THREE.Mesh(
            new THREE.CylinderGeometry(radius, radius, 0.065, 14),
            suspensionMetalMat
        );
        bolt.rotation.x = Math.PI / 2;
        bolt.position.copy(position);
        bolt.castShadow = true;
        bolt.receiveShadow = true;
        cannonGroup.add(bolt);
        if (sprung) suspensionJoints.push({ mesh: bolt, rest: position.clone() });
        else if (Math.abs(position.x) > 1.2) suspensionOuterParts.push({ mesh: bolt, rest: position.clone() });
        return bolt;
    }

    function addCoilOver(side, z) {
        const hub = new THREE.Vector3(side * WHEEL_X, WHEEL_Y, z);

        // מיקום פנימי ובטוח: הקפיץ נמצא בין הגוף לגלגל, אך לא בתוך הצמיג.
        const springX = side * 1.17;
        const springTop = new THREE.Vector3(springX, 1.03, z);
        const springBottom = new THREE.Vector3(side * 1.47, WHEEL_Y + 0.16, z);
        const direction = new THREE.Vector3().subVectors(springBottom, springTop);
        const length = direction.length();

        const group = new THREE.Group();
        group.position.copy(springTop).add(springBottom).multiplyScalar(0.5);
        group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
        group.castShadow = true;
        cannonGroup.add(group);

        // בולם מרכזי שחור.
        const damper = new THREE.Mesh(
            new THREE.CylinderGeometry(0.052, 0.052, length, 12),
            suspensionDarkMetalMat
        );
        damper.castShadow = true;
        damper.receiveShadow = true;
        group.add(damper);

        // קפיץ סלילי רחב — 8 טבעות ברורות במקום כרית אוויר.
        const coilYs = [-0.33, -0.235, -0.14, -0.045, 0.05, 0.145, 0.24, 0.335];
        coilYs.forEach((y, i) => {
            const coil = new THREE.Mesh(
                new THREE.TorusGeometry(0.115 + (i % 2 ? 0.008 : 0), 0.027, 8, 22),
                suspensionRubberMat
            );
            coil.rotation.x = Math.PI / 2;
            coil.position.y = y;
            coil.castShadow = true;
            coil.receiveShadow = true;
            group.add(coil);
        });

        suspensionSprings.push({ group, a: springTop, b: springBottom, aSprung: true, bSprung: false, len0: Math.max(length, 1e-6) });

        // תושבות מתכת לקפיץ.
        addSuspensionCylinderBetween(
            new THREE.Vector3(side * 0.98, 1.02, z),
            springTop,
            0.070,
            suspensionMetalMat,
            12,
            true,
            true
        );
        addSuspensionCylinderBetween(
            springBottom,
            new THREE.Vector3(side * 1.54, WHEEL_Y + 0.16, z),
            0.060,
            suspensionMetalMat,
            12,
            false,
            false
        );

        // נאבה/תושבת מרכזית.
        const hubMount = new THREE.Mesh(
            new THREE.CylinderGeometry(0.13, 0.13, 0.22, 16),
            suspensionDarkMetalMat
        );
        hubMount.rotation.x = Math.PI / 2;
        hubMount.position.copy(hub);
        hubMount.castShadow = true;
        hubMount.receiveShadow = true;
        cannonGroup.add(hubMount);
        suspensionOuterParts.push({ mesh: hubMount, rest: hub.clone() });
    }

    // מסגרת מרכזית חדשה מתחת לגוף — ממלאת את החלל בין שני צדדי המתלה
    // ונותנת חיבור מכני ברור במקום שהשלדה נראתה "מרחפת".
    function addCentralSuspensionFrame() {
        const frameDark = suspensionDarkMetalMat;
        const frameMetal = suspensionMetalMat;

        // קורת רוחב ראשית מתחת לגוף.
        const mainBeam = new THREE.Mesh(
            new THREE.BoxGeometry(1.72, 0.20, 0.28),
            frameDark
        );
        mainBeam.position.set(0, 0.38, 0);
        mainBeam.castShadow = true;
        mainBeam.receiveShadow = true;
        cannonGroup.add(mainBeam);

        // פלטת חיזוק קדמית — זו החלקה הבולטת שרואים בין שני הגלגלים.
        const frontPlate = new THREE.Mesh(
            new THREE.BoxGeometry(1.48, 0.34, 0.10),
            frameMetal
        );
        frontPlate.position.set(0, 0.49, 0.18);
        frontPlate.castShadow = true;
        frontPlate.receiveShadow = true;
        cannonGroup.add(frontPlate);

        // קורת תחתית ליצירת מסגרת סגורה וברורה.
        const lowerBeam = new THREE.Mesh(
            new THREE.BoxGeometry(1.30, 0.12, 0.24),
            frameDark
        );
        lowerBeam.position.set(0, 0.24, 0.02);
        lowerBeam.castShadow = true;
        lowerBeam.receiveShadow = true;
        cannonGroup.add(lowerBeam);

        // שתי תושבות צד שמתחברות לאזור ה-inner pivots.
        [-1, 1].forEach(side => {
            const upperMount = new THREE.Mesh(
                new THREE.BoxGeometry(0.18, 0.38, 0.30),
                frameDark
            );
            upperMount.position.set(side * 0.70, 0.52, 0);
            upperMount.castShadow = true;
            upperMount.receiveShadow = true;
            cannonGroup.add(upperMount);

            const lowerMount = new THREE.Mesh(
                new THREE.BoxGeometry(0.16, 0.28, 0.28),
                frameMetal
            );
            lowerMount.position.set(side * 0.61, 0.30, 0.12);
            lowerMount.castShadow = true;
            lowerMount.receiveShadow = true;
            cannonGroup.add(lowerMount);

            // חיזוק אלכסוני — יוצר את צורת ה-V/טרפז של התמונה.
            addSuspensionArmBetween(
                new THREE.Vector3(side * 0.50, 0.27, 0.16),
                new THREE.Vector3(side * 0.76, 0.58, 0.16),
                0.105,
                0.095,
                frameMetal,
                false,
                false
            );

            // חיזוק אלכסוני נוסף בחלק האחורי.
            addSuspensionArmBetween(
                new THREE.Vector3(side * 0.53, 0.43, -0.12),
                new THREE.Vector3(side * 0.76, 0.69, -0.12),
                0.085,
                0.085,
                frameDark,
                false,
                false
            );

            // ברגים גדולים על המסגרת.
            addSuspensionJoint(new THREE.Vector3(side * 0.70, 0.58, 0.20), 0.085);
            addBolt(new THREE.Vector3(side * 0.70, 0.58, 0.255), 0.040);
            addSuspensionJoint(new THREE.Vector3(side * 0.50, 0.27, 0.20), 0.075);
            addBolt(new THREE.Vector3(side * 0.50, 0.27, 0.255), 0.036);
        });

        // ארבעה ברגי חזית שמדגישים שהקורה מחוברת לשלדה.
        [-0.58, 0.58].forEach(x => {
            [0.32, 0.54].forEach(y => {
                addSuspensionJoint(new THREE.Vector3(x, y, 0.235), 0.060);
                addBolt(new THREE.Vector3(x, y, 0.275), 0.028);
            });
        });
    }

    function addReferenceCoiloverSuspension(side, z) {
        const outerX = side * (WHEEL_X - 0.10);

        // נקודות inner-pivot בגוף: שתי זרועות לכל A-arm, כמו ברפרנס.
        const lowerInnerFront = new THREE.Vector3(side * 0.70, 0.40, z - 0.20);
        const lowerInnerRear  = new THREE.Vector3(side * 0.70, 0.40, z + 0.20);
        const lowerOuterFront = new THREE.Vector3(outerX, WHEEL_Y + 0.02, z - 0.12);
        const lowerOuterRear  = new THREE.Vector3(outerX, WHEEL_Y + 0.02, z + 0.12);

        addSuspensionArmBetween(lowerInnerFront, lowerOuterFront, 0.135, 0.105, suspensionMetalMat, true, false);
        addSuspensionArmBetween(lowerInnerRear, lowerOuterRear, 0.135, 0.105, suspensionMetalMat, true, false);

        const upperInnerFront = new THREE.Vector3(side * 0.83, 0.82, z - 0.18);
        const upperInnerRear  = new THREE.Vector3(side * 0.83, 0.82, z + 0.18);
        const upperOuterFront = new THREE.Vector3(outerX, WHEEL_Y + 0.27, z - 0.105);
        const upperOuterRear  = new THREE.Vector3(outerX, WHEEL_Y + 0.27, z + 0.105);

        addSuspensionArmBetween(upperInnerFront, upperOuterFront, 0.115, 0.095, suspensionMetalMat, true, false);
        addSuspensionArmBetween(upperInnerRear, upperOuterRear, 0.115, 0.095, suspensionMetalMat, true, false);

        // מפרקי inner/outer גדולים.
        addSuspensionJoint(lowerOuterFront, 0.105);
        addSuspensionJoint(lowerOuterRear, 0.105);
        addSuspensionJoint(upperOuterFront, 0.092);
        addSuspensionJoint(upperOuterRear, 0.092);
        addSuspensionJoint(lowerInnerFront, 0.090, true);
        addSuspensionJoint(lowerInnerRear, 0.090, true);
        addSuspensionJoint(upperInnerFront, 0.080, true);
        addSuspensionJoint(upperInnerRear, 0.080, true);

        addBolt(lowerOuterFront, 0.045);
        addBolt(lowerOuterRear, 0.045);
        addBolt(upperOuterFront, 0.040);
        addBolt(upperOuterRear, 0.040);

        // חיבור קצר מהשלדה לכיוון ה-inner pivots כדי לתת מראה של מסגרת אמיתית.
        addSuspensionCylinderBetween(
            new THREE.Vector3(side * 0.48, 0.46, z),
            new THREE.Vector3(side * 0.70, 0.40, z),
            0.080,
            suspensionDarkMetalMat,
            12,
            true,
            true
        );
        addSuspensionCylinderBetween(
            new THREE.Vector3(side * 0.60, 0.90, z),
            new THREE.Vector3(side * 0.83, 0.82, z),
            0.070,
            suspensionDarkMetalMat,
            12,
            true,
            true
        );

        addCoilOver(side, z);
    }

    // מסגרת מרכזית מתחת לגוף — מחברת ויזואלית את שני צדדי המתלה.
    const _centralFrameStart = cannonGroup.children.length;
    addCentralSuspensionFrame();
    const centralFrameParts = cannonGroup.children.slice(_centralFrameStart);

    // ארבע יחידות מתלה — עכשיו Coil-over + Double Wishbone, ללא כריות אוויר.
    [-1, 1].forEach(side => {
        [0.72, -0.72].forEach(z => addReferenceCoiloverSuspension(side, z));
    });

    // ==========================================
    // התותח השני / התותח האפור — Quad Cannon V2
    // ארבעת הקנים נשארים גדולים ודומיננטיים. הסבב הזה מחזק את הגוף סביבם
    // בלבד, בלי לשנות את התותח הראשון ובלי לגעת בשדה האנרגיה החיצוני.
    // ==========================================
    const ADVANCED_CANNON_PRICE = 250;
    // מצב תצוגה לבדיקה: פותחים את המשחק עם ?mk2view=1 בסוף הכתובת.
    // התותח האפור פעיל בלי לקנות אותו, המצלמה קרובה אליו, ושום דבר לא נשמר.
    const MK2_PREVIEW = /[?&]mk2view=1/.test(window.location.search) || /cannon\.html$/.test(window.location.pathname);
    let advancedCannonOwned = MK2_PREVIEW || localStorage.getItem('bb3d_cannon_mk2_owned') === '1';
    let activeCannon = MK2_PREVIEW ? 'mk2' : (localStorage.getItem('bb3d_active_cannon') || 'classic');

    const advancedCannonGroup = new THREE.Group();
    advancedCannonGroup.visible = false;   // ה-MK-II הישן כבוי; התותח האפור בנוי על הקלאסי
    advancedCannonGroup.position.set(0, 0, 0);
    cannonGroup.add(advancedCannonGroup);

    // ---- חומרים ----
    function createMk2EnvMap() {
        try {
            const c = document.createElement('canvas');
            c.width = 256;
            c.height = 128;
            const g = c.getContext('2d');
            const grad = g.createLinearGradient(0, 0, 0, 128);
            grad.addColorStop(0.00, '#9fb0c8');
            grad.addColorStop(0.35, '#c4ccd8');
            grad.addColorStop(0.50, '#6b7480');
            grad.addColorStop(0.52, '#262a30');
            grad.addColorStop(1.00, '#101215');
            g.fillStyle = grad;
            g.fillRect(0, 0, 256, 128);
            const glow = g.createRadialGradient(217, 34, 0, 217, 34, 26);
            glow.addColorStop(0, 'rgba(255,236,200,0.9)');
            glow.addColorStop(1, 'rgba(255,236,200,0)');
            g.fillStyle = glow;
            g.fillRect(0, 0, 256, 128);
            const tex = new THREE.CanvasTexture(c);
            tex.encoding = THREE.sRGBEncoding;
            const pmrem = new THREE.PMREMGenerator(renderer);
            const rt = pmrem.fromEquirectangular(tex);
            tex.dispose();
            pmrem.dispose();
            return rt.texture;
        } catch (err) {
            console.warn('MK-II env map unavailable', err);
            return null;
        }
    }
    const mk2Env = createMk2EnvMap();
    const mk2BodyMat = new THREE.MeshStandardMaterial({
        color: 0x343a42, roughness: 0.32, metalness: 0.76,
        envMap: mk2Env, envMapIntensity: 0.62
    });
    const mk2DarkMat = new THREE.MeshStandardMaterial({
        color: 0x12161b, roughness: 0.44, metalness: 0.74,
        envMap: mk2Env, envMapIntensity: 0.48
    });
    const mk2EdgeMat = new THREE.MeshStandardMaterial({
        color: 0x8f9baa, roughness: 0.20, metalness: 0.90,
        envMap: mk2Env, envMapIntensity: 0.88
    });
    const mk2BlackMat = new THREE.MeshStandardMaterial({
        color: 0x0c0e11, roughness: 0.82, metalness: 0.22
    });
    const mk2TireMat = new THREE.MeshStandardMaterial({
        color: 0x08090a, roughness: 0.90, metalness: 0.0
    });
    if (!mk2Env) {
        [mk2BodyMat, mk2DarkMat, mk2EdgeMat].forEach(m => {
            m.metalness = Math.min(m.metalness, 0.40);
        });
    }

    const mk2CoolFill = new THREE.PointLight(0xb4c8ff, 0.7, 9, 1.5);
    mk2CoolFill.position.set(0, 2.5, 3.0);
    advancedCannonGroup.add(mk2CoolFill);

    function addMk2Mesh(geometry, material, x, y, z, rx = 0, ry = 0, rz = 0, parent = advancedCannonGroup) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        mesh.rotation.set(rx, ry, rz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parent.add(mesh);
        return mesh;
    }

    function addMk2Rounded(w, h, d, radius, bevel, material, x, y, z, rx = 0, ry = 0, rz = 0, parent = advancedCannonGroup) {
        const geo = createRoundedBoxGeometry(w - bevel * 2, h - bevel * 2, d - bevel * 2, radius, bevel, 2);
        return addMk2Mesh(geo, material, x, y, z, rx, ry, rz, parent);
    }

    function addMk2ZCylinder(rTop, rBottom, length, material, x, y, z, parent = advancedCannonGroup, segments = 18) {
        return addMk2Mesh(
            new THREE.CylinderGeometry(rTop, rBottom, length, segments),
            material, x, y, z, Math.PI / 2, 0, 0, parent
        );
    }

    const _mk2Up = new THREE.Vector3(0, 1, 0);
    function addMk2Link(pa, pb, width, depth, material, parent = advancedCannonGroup) {
        const A = new THREE.Vector3(pa[0], pa[1], pa[2]);
        const B = new THREE.Vector3(pb[0], pb[1], pb[2]);
        const dir = new THREE.Vector3().subVectors(B, A);
        const len = dir.length();
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, len, depth), material);
        mesh.position.addVectors(A, B).multiplyScalar(0.5);
        mesh.quaternion.setFromUnitVectors(_mk2Up, dir.normalize());
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parent.add(mesh);
        return mesh;
    }

    // הקבוצה עדיין בקנה המידה המקורי של התותח השני כדי לא לשנות את מיקום המשחק.
    const MK2_SCALE = 0.70;
    advancedCannonGroup.scale.setScalar(MK2_SCALE);
    const MK2_WS = 1 / MK2_SCALE;
    const MK2_WX = 2.30;
    const MK2_WY = TIRE_OUTER_R * MK2_WS - TIRE_GROUND_DROP;

    // מיקומי ארבעת הקנים נשמרים — הם חלק מעוצמת הירי של התותח השני.
    const MK2_BARREL_X = [-0.37, 0.37];
    // כמה הגוף של הנובה מורם ביחס לגלגלים (0 = כמו קודם). מגדיל את שיפוע הזרועות.
    const MK2_BODY_RAISE = 0.05;
    let MK2_MUZZLE_Y = 2.95 + MK2_BODY_RAISE;

    const mk2GlowCyanMat = new THREE.MeshBasicMaterial({ color: 0x59d8ff });
    const mk2GlowPurpleMat = new THREE.MeshBasicMaterial({ color: 0xa55cff });
    const mk2HullMat = new THREE.MeshStandardMaterial({
        color: 0x1b2028, roughness: 0.34, metalness: 0.68,
        envMap: mk2Env, envMapIntensity: 0.38
    });

    // ---- גוף מרכזי: רחב, נמוך וכבד יותר — שלב שדרוג הגוף בלבד ----
    addMk2Rounded(3.85, 0.62, 2.55, 0.18, 0.09, mk2DarkMat, 0, 0.82, 0);
    addMk2Rounded(3.52, 0.25, 2.30, 0.11, 0.055, mk2BodyMat, 0, 1.15, 0);
    addMk2Rounded(2.72, 0.34, 1.90, 0.11, 0.055, mk2HullMat, 0, 1.40, 0);

    // כתפי שריון צדדיות — רחבות יותר כדי לתמוך בארבעת הקנים.
    [-1, 1].forEach(side => {
        addMk2Rounded(0.46, 0.58, 2.10, 0.11, 0.055, mk2BodyMat, side * 1.67, 1.16, 0);
        addMk2Rounded(0.26, 0.28, 1.88, 0.06, 0.03, mk2EdgeMat, side * 1.92, 1.03, 0);
    });

    // לוחות קדמיים/אחוריים רחבים יותר ליצירת silhouette כבד וברור.
    addMk2Rounded(3.10, 0.46, 0.20, 0.05, 0.03, mk2BodyMat, 0, 1.14, 1.18);
    addMk2Rounded(3.10, 0.38, 0.20, 0.05, 0.03, mk2DarkMat, 0, 1.08, -1.18);

    // פסי אור — חלק מהשריון בלבד, ללא שינוי בשדה האנרגיה החיצוני.
    addMk2Mesh(new THREE.BoxGeometry(2.55, 0.045, 0.035), mk2GlowCyanMat, 0, 1.00, 1.28).castShadow = false;
    [-1, 1].forEach(side => {
        addMk2Mesh(new THREE.BoxGeometry(0.035, 0.045, 1.60), mk2GlowCyanMat, side * 1.92, 1.04, 0).castShadow = false;
    });

    // ---- שכבת פירוט מכנית: מוסיפה עומק לגוף בלי לשנות את הקנים ----
    const mk2DetailMat = new THREE.MeshStandardMaterial({
        color: 0x222831, roughness: 0.28, metalness: 0.82,
        envMap: mk2Env, envMapIntensity: 0.52
    });
    const mk2FastenerMat = new THREE.MeshStandardMaterial({
        color: 0x9da8b5, roughness: 0.18, metalness: 0.92,
        envMap: mk2Env, envMapIntensity: 0.75
    });

    // מסגרת קדמית מדורגת סביב הליבה — לא מכסה את הליבה ולא משנה את שדה האנרגיה.
    addMk2Rounded(2.42, 0.18, 0.16, 0.045, 0.02, mk2DetailMat, 0, 1.04, 1.31);
    addMk2Rounded(2.42, 0.16, 0.16, 0.04, 0.02, mk2BodyMat, 0, 1.72, 1.28);

    // ארבעה עמודי חיזוק שממסגרים את הליבה.
    [-1, 1].forEach(side => {
        addMk2Rounded(0.20, 0.52, 0.18, 0.045, 0.02, mk2DetailMat, side * 1.05, 1.39, 1.30);
        addMk2Rounded(0.16, 0.24, 0.20, 0.035, 0.015, mk2EdgeMat, side * 1.27, 1.20, 1.29);
        addMk2Rounded(0.16, 0.24, 0.20, 0.035, 0.015, mk2EdgeMat, side * 1.27, 1.58, 1.29);
    });

    // פאנלים מדורגים על מכסה הגוף — נותנים לו תחושת מכונה ולא קופסה חלקה.
    [-1, 1].forEach(side => {
        addMk2Rounded(0.72, 0.12, 1.32, 0.035, 0.018, mk2DetailMat, side * 0.92, 1.62, 0.02);
        addMk2Rounded(0.48, 0.08, 1.05, 0.025, 0.012, mk2EdgeMat, side * 0.92, 1.72, 0.02);
    });

    // צלעות חיזוק אלכסוניות בצידי הגוף.
    [-1, 1].forEach(side => {
        addMk2Link(
            [side * 1.46, 1.52, -0.82],
            [side * 1.82, 1.08, -0.30],
            0.13, 0.12, mk2DetailMat
        );
        addMk2Link(
            [side * 1.46, 1.52, 0.82],
            [side * 1.82, 1.08, 0.30],
            0.13, 0.12, mk2DetailMat
        );
    });

    // מחברי מתכת קטנים בחזית — ארבעה ברגים/פיני חיבור בולטים.
    [-1, 1].forEach(side => {
        [-1, 1].forEach(v => {
            addMk2Mesh(
                new THREE.CylinderGeometry(0.055, 0.055, 0.035, 10),
                mk2FastenerMat,
                side * 1.18, 1.18 + v * 0.30, 1.40,
                Math.PI / 2, 0, 0
            );
        });
    });

    // בתי צד קטנים מעל הגלגלים — מחברים בין השריון לשלדת הגלגל.
    [-1, 1].forEach(side => {
        [0.72, -0.72].forEach(z => {
            addMk2Rounded(0.46, 0.18, 0.48, 0.04, 0.02, mk2DetailMat, side * 1.72, 1.12, z);
            addMk2Rounded(0.30, 0.10, 0.34, 0.025, 0.012, mk2EdgeMat, side * 1.78, 1.25, z);
        });
    });

    // ארבעה חיזוקים קצרים סביב בסיס הגשר העליון — תומכים ויזואלית בארבעת הקנים.
    [-1, 1].forEach(side => {
        [-1, 1].forEach(zSide => {
            addMk2Rounded(
                0.22, 0.28, 0.34, 0.045, 0.02,
                mk2DetailMat,
                side * 0.92, 1.88, zSide * 0.46
            );
        });
    });

    // ---- שכבת מבנה חדשה: גוף זוויתי יותר ובסיס אמיתי לארבעת הקנים ----
    // סף תחתון רחב — נותן לתותח מסה בלי להגביה אותו.
    addMk2Rounded(4.08, 0.22, 2.68, 0.08, 0.04, mk2BlackMat, 0, 0.68, 0);
    addMk2Rounded(3.74, 0.16, 2.46, 0.06, 0.03, mk2DetailMat, 0, 0.96, 0);

    // לוחות כתף משופעים — יוצרים silhouette זוויתי במקום קופסה שטוחה.
    [-1, 1].forEach(side => {
        addMk2Mesh(
            new THREE.BoxGeometry(0.62, 0.34, 1.88),
            mk2BodyMat,
            side * 1.54, 1.42, 0,
            0, 0, side * 0.16
        ).castShadow = true;

        addMk2Mesh(
            new THREE.BoxGeometry(0.22, 0.42, 1.72),
            mk2DetailMat,
            side * 1.88, 1.30, 0,
            0, 0, side * 0.10
        ).castShadow = true;
    });

    // מסגרת נשיאה לארבעת הקנים — ארבעה בתי בסיס נפרדים בתוך הגוף.
    MK2_BARREL_X.map(w => w / MK2_SCALE).forEach(bx => {
        addMk2Rounded(0.34, 0.30, 0.62, 0.07, 0.03, mk2DetailMat, bx, 1.92, 0);
        addMk2Rounded(0.26, 0.12, 0.48, 0.035, 0.018, mk2EdgeMat, bx, 2.08, 0);
    });

    // קורת חיבור קדמית/אחורית מתחת לבסיסי הקנים.
    addMk2Rounded(3.20, 0.20, 0.30, 0.055, 0.025, mk2DarkMat, 0, 1.94, 0.64);
    addMk2Rounded(3.20, 0.16, 0.26, 0.045, 0.02, mk2DetailMat, 0, 1.91, -0.64);

    // מסגרות צד סביב הגלגלים — חיבור ויזואלי בין הגוף לשלדה.
    [-1, 1].forEach(side => {
        [0.72, -0.72].forEach(z => {
            addMk2Rounded(0.58, 0.24, 0.62, 0.05, 0.025, mk2DarkMat, side * 1.82, 0.94, z);
            addMk2Rounded(0.40, 0.12, 0.46, 0.03, 0.015, mk2EdgeMat, side * 1.90, 1.08, z);
        });
    });

    // לוחות קדמיים זוויתיים שמקיפים את אזור הליבה בלי להסתיר אותה.
    addMk2Mesh(
        new THREE.BoxGeometry(2.78, 0.22, 0.18),
        mk2DetailMat,
        0, 1.34, 1.38,
        0, 0, 0
    ).castShadow = true;
    addMk2Mesh(
        new THREE.BoxGeometry(2.48, 0.16, 0.16),
        mk2BodyMat,
        0, 1.57, 1.36,
        0, 0, 0
    ).castShadow = true;

    // ברגי חיזוק נוספים לאורך הכתפיים — פרט קטן שנראה גם מרחוק.
    [-1, 1].forEach(side => {
        [-0.72, 0, 0.72].forEach(z => {
            addMk2Mesh(
                new THREE.CylinderGeometry(0.045, 0.045, 0.045, 10),
                mk2FastenerMat,
                side * 2.02, 1.22, z,
                0, 0, Math.PI / 2
            );
        });
    });

    // ---- גשר עליון כבד לקנים ----
    addMk2Rounded(3.30, 0.38, 1.42, 0.10, 0.05, mk2DarkMat, 0, 1.82, 0);
    addMk2Rounded(3.00, 0.20, 1.18, 0.06, 0.03, mk2BodyMat, 0, 2.02, 0);

    // ---- ארבעה קנים: נשארים גדולים; רק הבסיסים והשריון סביבם מתחזקים ----
    const advancedBarrelAssembly = new THREE.Group();
    advancedBarrelAssembly.position.set(0, 0, 0);
    advancedCannonGroup.add(advancedBarrelAssembly);
    const BG = advancedBarrelAssembly;

    addMk2Rounded(3.50, 0.24, 1.20, 0.06, 0.03, mk2BlackMat, 0, 2.12, 0, 0, 0, 0, BG);

    const mk2SteelMat = new THREE.MeshStandardMaterial({
        color: 0xb4bec9, roughness: 0.28, metalness: 0.80,
        envMap: mk2Env, envMapIntensity: 0.85
    });
    const mk2BarrelGeo = new THREE.CylinderGeometry(0.20, 0.21, 1.95, 16);
    const mk2RingGeo = new THREE.CylinderGeometry(0.255, 0.255, 0.07, 16);
    const mk2BandGeo = new THREE.CylinderGeometry(0.215, 0.215, 0.05, 16);
    const mk2MuzzleGeo = new THREE.CylinderGeometry(0.27, 0.24, 0.13, 16);
    const mk2BoreGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.01, 14);
    const mk2BaseCollarGeo = new THREE.CylinderGeometry(0.36, 0.32, 0.20, 18);
    const mk2BaseRingGeo = new THREE.TorusGeometry(0.33, 0.045, 8, 22);

    MK2_BARREL_X.forEach(wx => {
        const bx = wx / MK2_SCALE;
        const bz = 0;
        addMk2Mesh(mk2BaseCollarGeo, mk2BodyMat, bx, 2.20, bz, 0, 0, 0, BG);
        addMk2Mesh(mk2BaseRingGeo, mk2EdgeMat, bx, 2.31, bz, 0, 0, 0, BG);
        addMk2Mesh(mk2BarrelGeo, mk2SteelMat, bx, 3.15, bz, 0, 0, 0, BG);
        [2.50, 2.98, 3.46, 3.94].forEach(ry => {
            addMk2Mesh(mk2RingGeo, mk2DarkMat, bx, ry, bz, 0, 0, 0, BG);
        });
        [2.74, 3.70].forEach(gy => {
            addMk2Mesh(mk2BandGeo, mk2GlowCyanMat, bx, gy, bz, 0, 0, 0, BG).castShadow = false;
        });
        addMk2Mesh(mk2MuzzleGeo, mk2DarkMat, bx, 4.15, bz, 0, 0, 0, BG);
        addMk2Mesh(mk2BoreGeo, mk2BlackMat, bx, 4.215, bz, 0, 0, 0, BG);
    });

    // ---- ליבה זוהרת קדמית — חלק מהתותח עצמו, לא שדה האנרגיה ----
    const mk2CoreGroup = new THREE.Group();
    mk2CoreGroup.position.set(0, 2.62, 0.72);
    mk2CoreGroup.scale.setScalar(1.15);
    advancedCannonGroup.add(mk2CoreGroup);
    addMk2Mesh(new THREE.CylinderGeometry(0.74, 0.88, 0.34, 22), mk2DarkMat, 0, 2.17, 0.66);
    addMk2Mesh(new THREE.TorusGeometry(0.80, 0.05, 8, 26), mk2EdgeMat, 0, 2.34, 0.66, Math.PI / 2, 0, 0);

    const mk2SocketGeo = new THREE.CylinderGeometry(0.66, 0.72, 0.22, 18);
    mk2SocketGeo.rotateX(Math.PI / 2);
    addMk2Mesh(mk2SocketGeo, mk2DarkMat, 0, 0, -0.10, 0, 0, 0, mk2CoreGroup);
    addMk2Mesh(new THREE.TorusGeometry(0.66, 0.09, 8, 20), mk2EdgeMat, 0, 0, 0, 0, 0, 0, mk2CoreGroup);

    const mk2CoreShellMat = new THREE.MeshStandardMaterial({
        color: 0x24085c, emissive: 0x7a2cff, emissiveIntensity: 1.0,
        roughness: 0.32, metalness: 0.20, flatShading: true
    });
    const mk2CoreShell = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), mk2CoreShellMat);
    mk2CoreGroup.add(mk2CoreShell);
    const mk2CoreInner = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.32, 1),
        new THREE.MeshBasicMaterial({ color: 0x9fe6ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    mk2CoreGroup.add(mk2CoreInner);
    const mk2CoreWire = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.66, 0),
        new THREE.MeshBasicMaterial({ color: 0x7fd8ff, wireframe: true, transparent: true, opacity: 0.55 })
    );
    mk2CoreGroup.add(mk2CoreWire);
    const mk2CoreLight = new THREE.PointLight(0xa040ff, 1.5, 7.5, 1.6);
    mk2CoreLight.position.set(0, 0.1, 0.85);
    mk2CoreGroup.add(mk2CoreLight);

    // ---- מגיני גלגלים וזרועות: הגלגלים נשארים, אבל הגוף עוטף אותם יותר ----
    [-1, 1].forEach(side => {
        [0.72, -0.72].forEach(z => {
            addMk2Rounded(0.34, 0.42, 0.62, 0.10, 0.04, mk2BodyMat, side * 1.58, 0.78, z, 0, 0, 0, advancedCannonGroup);
            addMk2Link([side * 1.28, 0.98, z], [side * MK2_WX, MK2_WY + 0.05, z], 0.22, 0.28, mk2EdgeMat);
            addMk2Link([side * 1.28, 0.82, z], [side * MK2_WX, MK2_WY + 0.05, z], 0.13, 0.30, mk2DarkMat);
        });
    });

    const mk2TireGeo = new THREE.TorusGeometry(0.30, 0.245, 14, 32);
    const mk2RimGeo = new THREE.CylinderGeometry(0.31, 0.31, 0.80, 28);
    const mk2RimCoreGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.82, 20);
    const mk2HubGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.90, 14);
    const mk2LipGeo = new THREE.TorusGeometry(0.31, 0.035, 8, 32);
    const mk2WheelGlowGeo = new THREE.TorusGeometry(0.20, 0.03, 8, 28);
    const advancedCannonWheels = [];

    [[-MK2_WX, 0.72], [MK2_WX, 0.72], [-MK2_WX, -0.72], [MK2_WX, -0.72]].forEach(([x, z]) => {
        const wheel = new THREE.Group();
        wheel.position.set(x, MK2_WY, z);
        wheel.scale.setScalar(MK2_WS);
        const spin = new THREE.Group();
        wheel.add(spin);
        const tire = addMk2Mesh(mk2TireGeo, mk2TireMat, 0, 0, 0, 0, 0, 0, spin);
        tire.scale.z = 1.5;
        addMk2Mesh(mk2RimGeo, mk2BodyMat, 0, 0, 0, Math.PI / 2, 0, 0, spin);
        addMk2Mesh(mk2RimCoreGeo, mk2BlackMat, 0, 0, 0, Math.PI / 2, 0, 0, spin);
        addMk2Mesh(mk2HubGeo, mk2EdgeMat, 0, 0, 0, Math.PI / 2, 0, 0, spin);
        [-1, 1].forEach(sd => {
            addMk2Mesh(mk2LipGeo, mk2EdgeMat, 0, 0, sd * 0.405, 0, 0, 0, spin);
            addMk2Mesh(mk2WheelGlowGeo, mk2GlowCyanMat, 0, 0, sd * 0.44, 0, 0, 0, spin).castShadow = false;
        });
        advancedCannonGroup.add(wheel);
        advancedCannonWheels.push(wheel);
        wheel.userData.spinGroup = spin;
    });

    function updateMk2Glow(time) {
        const pulse = 0.5 + 0.5 * Math.sin(time * 0.004);
        const kick = Math.min(1, Math.max(0, cannonRecoil) * 5);
        mk2CoreShellMat.emissiveIntensity = 1.3 + pulse * 0.4 + kick * 0.7;
        mk2CoreInner.scale.setScalar(0.92 + pulse * 0.22 + kick * 0.38);
        mk2CoreWire.rotation.y = time * 0.0006;
        mk2CoreWire.rotation.x = time * 0.0004;
        mk2CoreShell.rotation.y = -time * 0.0005;
        mk2CoreLight.intensity = 1.0 + pulse * 0.45 + kick * 1.3;
    }

    advancedBarrelAssembly.userData.baseY = advancedBarrelAssembly.position.y;

    // סיום התותח השני. שדה האנרגיה שמסביב למשחק אינו חלק מהמודל הזה.

    // שומרים את התותח המקורי כ"קלאסי" ומסתירים אותו רק כש-MK-II פעיל.
    const classicCannonParts = cannonGroup.children.slice();
    const classicBodyParts = bodyRig.children.slice();

    // ==========================================================
    // התותח האפור (NOVA): "ראש" חדש על ההשעיה והגלגלים של הקלאסי
    // הגלגלים, זרועות ההשעיה והקפיצים נשארים כמו בתמונת המטרה (הם כבר עובדים).
    // מוחלפים רק הגוף, הכיפה והקנים: גוף עגול וגבוה בשחור עם מצחייה זוהרת,
    // כיפה קטנה, ושני קנים עבים. התותח הקלאסי לא משתנה בכלל.
    // המידות כאן זהות למידות של התותח הקלאסי.
    // ==========================================================
    // ---- מידות התותח האפור (אפשר לשחק איתן) ----
    const MK2_BODY_W = 2.60;        // רוחב הגוף (היה 2.30)
    const MK2_WHEEL_SHIFT = 0.72;   // כמה הגלגלים זזים החוצה (כדי שהזרועות יהיו ארוכות כמו בתמונת המטרה)
    const MK2_WHEEL_SCALE = 1.50;   // צמיגים גדולים יותר (היה 1.28)
    const MK2_WHEEL_Z = 0.96;       // מרחק הגלגלים קדימה/אחורה מהמרכז (במקום 0.72)   // גלגלים גדולים ועבים כמו בתמונת המטרה (1 = הגודל הקלאסי)
    // מרכז הגלגל המוגדל: התחתית נשארת על אותה קרקע כמו בגלגל הרגיל.
    const MK2_WHEEL_Y = (WHEEL_Y - TIRE_OUTER_R) + TIRE_OUTER_R * MK2_WHEEL_SCALE + 0.03;

    const mk2Head = new THREE.Group();
    mk2Head.position.y = -BODY_PIVOT_Y + MK2_BODY_RAISE;
    bodyRig.add(mk2Head);

    // צבע הגוף והכיפה: כחול מבריק כמו בתמונת המטרה (השם nvBlack נשאר כדי לא לשבור הפניות)
    const nvBlack = new THREE.MeshPhysicalMaterial({ color: 0x083a86, emissive: 0x01050c, roughness: 0.28, metalness: 0.20, clearcoat: 0.9, clearcoatRoughness: 0.14, envMap: mk2Env, envMapIntensity: 0.38 });
    const nvVisor = new THREE.MeshPhysicalMaterial({ color: 0x07080a, roughness: 0.22, metalness: 0.4, clearcoat: 0.9, clearcoatRoughness: 0.1, envMap: mk2Env, envMapIntensity: 0.6 });
    const nvFin = new THREE.MeshStandardMaterial({ color: 0x555a61, roughness: 0.42, metalness: 0.50, envMap: mk2Env, envMapIntensity: 0.30 });
    const nvGoldGlow = new THREE.MeshBasicMaterial({ color: 0xffc94a });
    const nvDark  = new THREE.MeshStandardMaterial({ color: 0x0a0b0e, roughness: 0.5, metalness: 0.6, envMap: mk2Env, envMapIntensity: 0.5 });
    const nvSteel = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.40, metalness: 0.55, envMap: mk2Env, envMapIntensity: 0.22 });
    const nvBoreMat = new THREE.MeshBasicMaterial({ color: 0x020507 });
    // קנים בצבע פלדה אפורה בהירה + "אוזניים" בהירות, כמו בתמונת המטרה
    const nvBarrelMat = new THREE.MeshStandardMaterial({ color: 0x70767d, roughness: 0.34, metalness: 0.80, envMap: mk2Env, envMapIntensity: 0.9 });
    const nvEarMat = new THREE.MeshStandardMaterial({ color: 0xb9bfc5, roughness: 0.36, metalness: 0.70, envMap: mk2Env, envMapIntensity: 0.8 });

    function nvAdd(parent, geometry, material, x, y, z, rx = 0, ry = 0, rz = 0, cast = true) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        mesh.rotation.set(rx, ry, rz);
        mesh.castShadow = cast;
        mesh.receiveShadow = true;
        parent.add(mesh);
        return mesh;
    }
    function nvBox(parent, w, h, d, r, b, material, x, y, z) {
        return nvAdd(parent, createRoundedBoxGeometry(w - b * 2, h - b * 2, d - b * 2, r, b, 3), material, x, y, z);
    }
    function nvCyl(parent, rTop, rBottom, h, material, x, y, z, cast = true) {
        return nvAdd(parent, new THREE.CylinderGeometry(rTop, rBottom, h, 24), material, x, y, z, 0, 0, 0, cast);
    }

    // ---- גוף עגול וגבוה ----
    nvBox(mk2Head, MK2_BODY_W, 1.00, 1.75, 0.42, 0.12, nvBlack, 0, 1.535, 0);
    // מצחייה כהה לרוחב חזית הגוף (כמו הפס השחור בתמונת המטרה)
    nvBox(mk2Head, MK2_BODY_W * 0.64, 0.14, 0.62, 0.05, 0.02, nvVisor, 0, 2.04, 0.56);
    // כיפה כחולה גדולה ומעוגלת
    const nvDome = nvAdd(mk2Head, new THREE.SphereGeometry(0.62, 32, 20), nvBlack, 0, 1.99, 0.10);
    nvDome.scale.y = 0.85;
    // גומה כחולה קטנה מול הכיפה, מעל המצחייה
    const nvNub = nvAdd(mk2Head, new THREE.SphereGeometry(0.26, 24, 14), nvBlack, 0, 2.06, 0.62);
    nvNub.scale.y = 0.55;
    nvNub.visible = false;   // הוסתר: נראה כגוש נפרד מהכיפה (אפשר להחזיר ל-true)

    // ---- עומק: שכבות, פלטות, ברגים ---------------------------------
    // לוחית תחתית כהה - נותנת צל ומשקל מתחת לגוף
    nvBox(mk2Head, MK2_BODY_W * 0.80, 0.10, 1.30, 0.04, 0.015, nvDark, 0, 1.03, 0);

    // ---- שני קנים עבים מאחורי הכיפה, בתוך קבוצה שזזה אחורה בכל ירייה ----
    const mk2BarrelsRig = new THREE.Group();
    mk2Head.add(mk2BarrelsRig);
    MK2_BARREL_X.forEach(bx => {
        nvCyl(mk2BarrelsRig, 0.24, 0.27, 0.30, nvDark, bx, 2.05, -0.15);
        nvCyl(mk2BarrelsRig, 0.21, 0.23, 1.00, nvBarrelMat, bx, 2.70, -0.15);
        [2.40, 2.95].forEach(ry => nvCyl(mk2BarrelsRig, 0.255, 0.255, 0.07, nvDark, bx, ry, -0.15));
        nvAdd(mk2BarrelsRig, new THREE.CylinderGeometry(0.225, 0.225, 0.04, 22), nvGoldGlow, bx, 3.10, -0.15, 0, 0, 0, false);
        // לוחית "אוזן" בהירה מאחורי כל קנה
        nvBox(mk2BarrelsRig, 0.66, 1.15, 0.10, 0.05, 0.02, nvEarMat, bx, 2.75, -0.32);
        nvCyl(mk2BarrelsRig, 0.24, 0.21, 0.16, nvDark, bx, 3.28, -0.15);
        nvAdd(mk2BarrelsRig, new THREE.CylinderGeometry(0.12, 0.12, 0.01, 16), nvBoreMat, bx, 3.365, -0.15, 0, 0, 0, false);
    });

    // ==========================================================
    // השעיה חדשה לתותח האפור - מועתקת מתמונת המטרה:
    // שתי זרועות שטוחות ועבות במקביל (עליונה ותחתונה), לוחית רכזת אנכית ליד הגלגל
    // ובולם הידראולי ביניהן. הכל שוכב במישור אחד שמול הגלגל (פונה למצלמה)
    // ומחובר לחזית הגוף בעמודי חיבור מוברגים. ההשעיה הקלאסית מוסתרת כשהאפור פעיל.
    // ==========================================================
    // פלדה מוברשת בהירה כמו בתמונת המטרה. הערכים הכהים הקודמים: זרועות 0x34383c, פלטות 0x1b1d20
    const mk2ArmMat = new THREE.MeshPhysicalMaterial({ color: 0x46474b, emissive: 0x070809, roughness: 0.40, metalness: 0.90, clearcoat: 0.10, clearcoatRoughness: 0.20, envMap: mk2Env || null, envMapIntensity: 0.85 });
    const mk2PlateMat = new THREE.MeshStandardMaterial({ color: 0x3c3e42, roughness: 0.46, metalness: 0.80, envMap: mk2Env || null, envMapIntensity: 0.8 });
    const mk2BossMat = new THREE.MeshStandardMaterial({ color: 0x34363a, roughness: 0.38, metalness: 0.80, envMap: wheelEnvMap || null, envMapIntensity: 0.8 });
    const MK2_HUB_X = WHEEL_X + MK2_WHEEL_SHIFT;   // מרכז הגלגל (אחרי ההזזה)
    const MK2_PLANE_Z = 1.46;                      // מישור הזרועות, מול פני הצמיג
    let mk2GroundShadowRef = null;
    const mk2BoltGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.05, 6);
    {
        const gc = document.createElement('canvas');
        gc.width = gc.height = 128;
        const gx = gc.getContext('2d');
        const gr = gx.createRadialGradient(64, 64, 6, 64, 64, 62);
        gr.addColorStop(0, 'rgba(0,0,0,0.60)');
        gr.addColorStop(0.55, 'rgba(0,0,0,0.30)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        gx.fillStyle = gr;
        gx.fillRect(0, 0, 128, 128);
        const gtex = new THREE.CanvasTexture(gc);
        const groundShadow = new THREE.Mesh(
            new THREE.PlaneGeometry(10.5, 6.6),
            new THREE.MeshBasicMaterial({ map: gtex, transparent: true, depthWrite: false, fog: false })
        );
        groundShadow.rotation.x = -Math.PI / 2;
        groundShadow.position.set(0, WHEEL_Y - TIRE_OUTER_R + 0.03, 0.05);
        groundShadow.renderOrder = 1;
        groundShadow.visible = false;
        cannonGroup.add(groundShadow);
        mk2GroundShadowRef = groundShadow;
    }
    const mk2OnlyParts = [];
    mk2OnlyParts.push(mk2GroundShadowRef);                       // חלקים שנראים רק בתותח האפור

    // זרוע מחושלת: צורת "עצם" (קצוות רחבים ועגולים סביב הצירים, מותן צרה באמצע) עם שיפוע בכל הקצוות.
    // הציר הארוך הוא Y והעומק Z, בדיוק כמו הקופסה הישנה, כך שתנועת ההשעיה (scale.y) ממשיכה לעבוד.
    function createMk2LinkGeometry(len, w, d, wHub) {
        // זרוע שטוחה מפלדה (כמו בתמונת המטרה): לוח עם קצוות עגולים ושיפוע בקצוות.
        // הציר הארוך הוא Y והעומק Z, כך שתנועת ההשעיה (scale.y) ממשיכה לעבוד.
        const bs = 0.035, bt = 0.035;
        const hw = w / 2 - bs;                                  // חצי רוחב בקצה שליד הגוף
        const hwTop = (wHub ? wHub : w) / 2 - bs;               // חצי רוחב בקצה שליד הגלגל
        const half = len / 2;
        const sh = new THREE.Shape();
        sh.moveTo(-hw, -half);
        sh.absarc(0, -half, hw, Math.PI, 2 * Math.PI, false);
        sh.lineTo(hwTop, half);
        sh.absarc(0, half, hwTop, 0, Math.PI, false);
        sh.lineTo(-hw, -half);
        const depth = Math.max(d - 2 * bt, 0.02);
        const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelSize: bs, bevelThickness: bt, bevelSegments: 2, curveSegments: 16 });
        g.translate(0, 0, -depth / 2);
        return g;
    }
    function mk2Link(a, b, w, d, material, aSprung, bSprung, wHub) {
        addSuspensionArmBetween(new THREE.Vector3(a[0], a[1], a[2]), new THREE.Vector3(b[0], b[1], b[2]), w, d, material, aSprung, bSprung);
        const L = suspensionLinks[suspensionLinks.length - 1];
        L.mk2Only = true;
        L.mesh.geometry.dispose();
        L.mesh.geometry = createMk2LinkGeometry(L.len0, w, d, wHub);
        // חריץ כהה לאורך הזרוע, בצד שפונה למצלמה
        const groove = new THREE.Mesh(new THREE.BoxGeometry(((w + (wHub || w)) / 2) * 0.26, L.len0 * 0.60, 0.03), mk2PlateMat);
        groove.position.z = (a[2] >= 0 ? 1 : -1) * (d / 2 + 0.012);
        L.mesh.add(groove);
        return L;
    }
    function mk2Rod(a, b, radius, material, aSprung, bSprung) {
        addSuspensionCylinderBetween(new THREE.Vector3(a[0], a[1], a[2]), new THREE.Vector3(b[0], b[1], b[2]), radius, material, 24, aSprung, bSprung);
        const L = suspensionLinks[suspensionLinks.length - 1];
        L.mk2Only = true;
        return L;
    }
    // דיסק עגול עם ראש בורג משושה - פונה למצלמה
    function mk2Boss(x, y, z, r, sprung) {
        const g = new THREE.Group();
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.08, 28), mk2BossMat);
        disc.rotation.x = Math.PI / 2;
        g.add(disc);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.94, 0.024, 8, 32), mk2ArmMat);
        ring.position.z = 0.042;
        g.add(ring);
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.42, r * 0.42, 0.11, 6), mk2ArmMat);
        bolt.rotation.x = Math.PI / 2;
        g.add(bolt);
        g.position.set(x, y, z);
        g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
        cannonGroup.add(g);
        mk2OnlyParts.push(g);
        if (sprung) suspensionJoints.push({ mesh: g, rest: new THREE.Vector3(x, y, z), mk2Only: true });
        return g;
    }

    // קפיץ אמיתי (סליל דק ממתכת כהה) סביב מוט כרום וגוף בולם כהה, כמו בתמונת המטרה
    const mk2DamperMat = new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.30, metalness: 0.85, envMap: mk2Env || null, envMapIntensity: 0.9 });
    const mk2CoilMat = new THREE.MeshStandardMaterial({ color: 0x17191d, roughness: 0.38, metalness: 0.75, envMap: mk2Env || null, envMapIntensity: 1.1 });
    function addMk2Spring(side, sgn) {
        const z = sgn * 0.40;           // על החלק השטוח של צד הגוף (הפינות מעוגלות)
        // הקצה התחתון מעל פסגת הצמיג הגדול (כדי שהקפיץ לא ייכנס לגומי)
        const springTopY = MK2_WHEEL_Y + TIRE_OUTER_R * MK2_WHEEL_SCALE;
        const top = new THREE.Vector3(side * 1.46, 1.72 + MK2_BODY_RAISE, z);
        const bottom = new THREE.Vector3(side * 2.00, MK2_WHEEL_Y + 0.26, z);
        const dir = new THREE.Vector3().subVectors(bottom, top);
        const length = dir.length();

        const group = new THREE.Group();
        group.position.copy(top).add(bottom).multiplyScalar(0.5);
        group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
        cannonGroup.add(group);

        // מוט כרום מרכזי + גוף בולם כהה בחצי התחתון
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, length, 16), mk2ArmMat);
        rod.castShadow = true;
        group.add(rod);
        const dmp = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, length * 0.50, 20), suspensionDarkMetalMat);
        dmp.position.y = -length * 0.22;
        dmp.castShadow = true;
        group.add(dmp);

        // סליל קפיץ דק (הליקס) עם רווחים נראים בין הכריכות
        const coilH = Math.max(length - 0.20, 0.2);
        const coilTurns = 8, coilR = 0.20;
        const helix = new THREE.Curve();
        helix.getPoint = function (t, target) {
            const ang = t * coilTurns * Math.PI * 2;
            return (target || new THREE.Vector3()).set(Math.cos(ang) * coilR, (t - 0.5) * coilH, Math.sin(ang) * coilR);
        };
        const coil = new THREE.Mesh(new THREE.TubeGeometry(helix, coilTurns * 18, 0.072, 10, false), mk2CoilMat);
        coil.castShadow = true;
        group.add(coil);

        // טבעות כסופות בשני קצות הקפיץ
        [-1, 1].forEach(end => {
            const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.07, 24), mk2DamperMat);
            collar.position.y = end * (length / 2 - 0.045);
            collar.castShadow = true;
            group.add(collar);
        });

        // עמוד חיבור קצר מפני הגוף אל קצה הקפיץ העליון (נע עם הגוף)
        const zbBody = sgn * 0.875;
        // תושבת ברזל צמודה לחלק השטוח של צד הגוף, והקפיץ תלוי עליה בעין עם בורג
        const yb = top.y - MK2_BODY_RAISE;
        nvAdd(mk2Head, new THREE.BoxGeometry(0.07, 0.56, 0.34), mk2PlateMat, side * 1.335, yb - 0.15, z, 0, 0, 0).castShadow = true;
        nvAdd(mk2Head, new THREE.BoxGeometry(0.12, 0.20, 0.30), mk2PlateMat, side * 1.43, yb, z, 0, 0, 0).castShadow = true;
        nvAdd(mk2Head, new THREE.CylinderGeometry(0.05, 0.05, 0.40, 14), mk2ArmMat, side * 1.46, yb, z, Math.PI / 2, 0, 0).castShadow = true;
        [-0.20, 0.0, 0.20].forEach(dy => {
            nvAdd(mk2Head, new THREE.CylinderGeometry(0.032, 0.032, 0.03, 6), mk2ArmMat, side * 1.375, yb - 0.15 + dy, z + sgn * 0.11, 0, 0, Math.PI / 2);
            nvAdd(mk2Head, new THREE.CylinderGeometry(0.032, 0.032, 0.03, 6), mk2ArmMat, side * 1.375, yb - 0.15 + dy, z - sgn * 0.11, 0, 0, Math.PI / 2);
        });

        suspensionSprings.push({ group, a: top, b: bottom, aSprung: true, bSprung: false, len0: Math.max(length, 1e-6), mk2Only: true });
    }

    [-1, 1].forEach(side => {
        [1, -1].forEach(sgn => {
            const zp = sgn * MK2_PLANE_Z;   // מישור הזרועות
            const zb = sgn * 0.875;         // פני הגוף
            const hx = side * MK2_HUB_X;
            const zU = zp + sgn * 0.10;     // הזרוע העליונה בשכבה קדמית - נותן עומק
            const upperBody = [side * 0.85, 1.86 + MK2_BODY_RAISE, sgn * 1.015];   // שורש עליון: פינת הפנים הקדמיות, ליד המצחייה
            const lowerBody = [side * 0.66, 1.25 + MK2_BODY_RAISE, sgn * 0.985];   // שורש תחתון: תחתית הפנים הקדמיות, קרוב למרכז
            const upperHub  = [hx - side * 0.72, MK2_WHEEL_Y + 0.82, zU];
            const lowerHub  = [hx, MK2_WHEEL_Y, zp];
            const lowerEnd  = [hx - side * 1.05, MK2_WHEEL_Y + 0.30, zp];   // הזרוע התחתונה נגמרת על הפינה של לוחית הטריז

            // עמודי חיבור מוברגים מפני הגוף אל מישור הזרועות
            [upperBody, lowerBody].forEach(P => {
                const post = nvAdd(mk2Head, new THREE.CylinderGeometry(0.10, 0.10, Math.abs(P[2] - zb) + 0.06, 16), nvSteel,
                    P[0], P[1] - MK2_BODY_RAISE, (P[2] + zb) / 2 - sgn * 0.02, Math.PI / 2, 0, 0);
                post.castShadow = true;
            });

            // שתי זרועות שטוחות ועבות במקביל + לוחית רכזת אנכית
            // צלע מורמת ומעט כהה במרכז כל זרוע - ילד של הזרוע, כך שנמתחת ונעה איתה
            mk2Link(upperBody, upperHub, sgn > 0 ? 0.38 : 0.30, 0.10, sgn > 0 ? mk2ArmMat : nvSteel, true, false, sgn > 0 ? 0.50 : 0.38);
            mk2Link(lowerBody, lowerEnd, sgn > 0 ? 0.34 : 0.28, 0.10, sgn > 0 ? mk2ArmMat : nvSteel, true, false, sgn > 0 ? 0.46 : 0.36);
            // (לוח הברך הוא עכשיו לוחית הטריז למטה)

            // לוחית השורש: ברזל עבה ורחב בין שני הברגים בתחילת הזרוע (כמו במטרה)
            mk2Link([upperBody[0], upperBody[1], upperBody[2] + sgn * 0.05], [lowerBody[0], lowerBody[1], lowerBody[2] + sgn * 0.05],
                sgn > 0 ? 0.30 : 0.24, 0.07, sgn > 0 ? mk2ArmMat : nvSteel, true, true, sgn > 0 ? 0.34 : 0.26);

            // פלטת חיבור רחבה שמחברת את שתי הזרועות לגלגל (כמו בתמונת המטרה) - רק בצד שפונה למצלמה
            if (sgn > 0) {
            const gShape = new THREE.Shape();
            {
                const KX = -side * 0.72, KY = 0.82, rH = 0.34, rK = 0.19;
                const Lk = Math.hypot(KX, KY), ang = Math.atan2(KY, KX), beta = Math.acos((rH - rK) / Lk);
                gShape.moveTo(rH * Math.cos(ang + beta), rH * Math.sin(ang + beta));
                gShape.lineTo(KX + rK * Math.cos(ang + beta), KY + rK * Math.sin(ang + beta));
                gShape.absarc(KX, KY, rK, ang + beta, ang - beta, true);
                gShape.lineTo(rH * Math.cos(ang - beta), rH * Math.sin(ang - beta));
                gShape.absarc(0, 0, rH, ang - beta, ang + beta - 2 * Math.PI, true);
            }
            gShape.closePath();
            const gGeo = new THREE.ExtrudeGeometry(gShape, { depth: 0.12, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.03, bevelSegments: 2, steps: 1 });
            gGeo.translate(0, 0, -0.05);
            const gusset = new THREE.Mesh(gGeo, mk2PlateMat);
            gusset.position.set(hx, MK2_WHEEL_Y, zp - sgn * 0.02);
            gusset.castShadow = true;
            gusset.receiveShadow = true;
            cannonGroup.add(gusset);
            mk2OnlyParts.push(gusset);
            {
                const pts = [[-0.10 * side, -0.28], [-1.05 * side, 0.22], [-0.60 * side, 0.64]];
                const wShape = new THREE.Shape();
                for (let i = 0; i < 3; i++) {
                    const prev = pts[(i + 2) % 3], cur = pts[i], next = pts[(i + 1) % 3];
                    const dp = Math.hypot(prev[0] - cur[0], prev[1] - cur[1]), dn = Math.hypot(next[0] - cur[0], next[1] - cur[1]);
                    const d = 0.16;
                    const p1 = [cur[0] + (prev[0] - cur[0]) / dp * d, cur[1] + (prev[1] - cur[1]) / dp * d];
                    const p2 = [cur[0] + (next[0] - cur[0]) / dn * d, cur[1] + (next[1] - cur[1]) / dn * d];
                    if (i === 0) wShape.moveTo(p1[0], p1[1]); else wShape.lineTo(p1[0], p1[1]);
                    wShape.quadraticCurveTo(cur[0], cur[1], p2[0], p2[1]);
                }
                wShape.closePath();
                const wGeo = new THREE.ExtrudeGeometry(wShape, { depth: 0.12, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.03, bevelSegments: 2, steps: 1 });
                wGeo.translate(0, 0, -0.05);
                const wedge = new THREE.Mesh(wGeo, mk2PlateMat);
                wedge.castShadow = true;
                wedge.receiveShadow = true;
                gusset.add(wedge);
                mk2Boss(lowerEnd[0], lowerEnd[1], zp + sgn * 0.12, 0.09, false);
            }
            [[-0.72 * 0.5 / 0.8, 0.82 * 0.5 / 0.8], [0.14 / 0.8, -0.20 / 0.8]].forEach(bp => {
                const bolt = new THREE.Mesh(mk2BoltGeo, nvFin);
                bolt.rotation.x = Math.PI / 2;
                bolt.position.set(side * bp[0] * 0.80, bp[1] * 0.80, sgn * 0.11);
                bolt.castShadow = true;
                gusset.add(bolt);
            });
            }

            // בולם הידראולי בין הזרועות: גוף כהה + מוט כרום שמחליק
            const dBody = [side * 0.95, 1.40 + MK2_BODY_RAISE, sgn * 1.00];
            const dHub  = [side * (MK2_HUB_X - 0.48), MK2_WHEEL_Y + 0.55, zp + sgn * 0.10];
            const dMid  = [dBody[0] + (dHub[0] - dBody[0]) * 0.62, dBody[1] + (dHub[1] - dBody[1]) * 0.62, dBody[2]];
            mk2Rod(dBody, dMid, 0.115, mk2ArmMat, true, false);
            mk2Rod(dMid, dHub, 0.07, mk2ArmMat, false, false);

            // דיסקים עם ברגים בקצות הזרועות
            const zf = zp + sgn * 0.10, zfU = zU + sgn * 0.12;
            mk2Boss(upperBody[0], upperBody[1], upperBody[2] + sgn * 0.11, 0.13, true);
            mk2Boss(lowerBody[0], lowerBody[1], lowerBody[2] + sgn * 0.11, 0.13, true);
            mk2Boss(upperHub[0], upperHub[1], zfU, 0.10, false);
            mk2Boss(hx, MK2_WHEEL_Y, zf, 0.13, false);

            // קפיץ סלילי שחור בין הגוף לגלגל (נראה מאחורי הזרועות, כמו בתמונת המטרה)
            addMk2Spring(side, sgn);
        });
    });

    // ---- סימני צמיגים על הדשא (רק כשהתותח האפור פעיל) ----
    const mk2Tracks = new THREE.Group();
    mk2Tracks.visible = false;
    {
        const tc = document.createElement('canvas');
        tc.width = 256;
        tc.height = 64;
        const tx = tc.getContext('2d');
        tx.clearRect(0, 0, 256, 64);
        tx.fillStyle = 'rgba(28, 20, 10, 0.55)';
        for (let i = 0; i < 16; i++) {
            const x = i * 16 + 3;
            tx.beginPath();
            tx.moveTo(x, 6);
            tx.lineTo(x + 9, 6);
            tx.lineTo(x + 5, 58);
            tx.lineTo(x - 4, 58);
            tx.closePath();
            tx.fill();
        }
        const trackTex = new THREE.CanvasTexture(tc);
        trackTex.wrapS = THREE.RepeatWrapping;
        trackTex.repeat.set(28 / 5.12, 1);
        const trackMat = new THREE.MeshBasicMaterial({
            map: trackTex, transparent: true, depthWrite: false, fog: false,
            polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
        });
        [-1, 1].forEach(sgn => {
            const strip = new THREE.Mesh(new THREE.PlaneGeometry(28, 0.62), trackMat);
            strip.rotation.x = -Math.PI / 2;
            strip.position.set(0, 0.03, sgn * MK2_WHEEL_Z * CANNON_SCALE);
            strip.renderOrder = 1;
            mk2Tracks.add(strip);
        });
    }
    scene.add(mk2Tracks);

    function layoutSuspensionForLook(isMk2) {
        // ההשעיה הקלאסית (זרועות, קפיצים, מפרקים, מסגרת מרכזית) מוסתרת כשהתותח האפור פעיל
        suspensionLinks.forEach(L => { L.mesh.visible = L.mk2Only ? isMk2 : !isMk2; });
        suspensionSprings.forEach(K => { K.group.visible = K.mk2Only ? isMk2 : !isMk2; });
        suspensionJoints.forEach(J => { if (!J.mk2Only) J.mesh.visible = !isMk2; });
        suspensionOuterParts.forEach(P => { P.mesh.visible = !isMk2; });
        centralFrameParts.forEach(m => { m.visible = !isMk2; });
        mk2OnlyParts.forEach(m => { m.visible = isMk2; });
        // הגלגלים: בתותח האפור הם רחוקים יותר מהגוף
        cannonWheels.forEach((wheelOuter, i) => {
            const baseX = wheelPositions[i][0];
            wheelOuter.position.x = baseX + (isMk2 ? Math.sign(baseX) * MK2_WHEEL_SHIFT : 0);
            wheelOuter.position.y = isMk2 ? MK2_WHEEL_Y : wheelPositions[i][1];
            wheelOuter.position.z = isMk2 ? Math.sign(wheelPositions[i][2]) * MK2_WHEEL_Z : wheelPositions[i][2];
            wheelOuter.scale.setScalar(isMk2 ? MK2_WHEEL_SCALE : 1);
            const sw = wheelOuter_smooth[i];
            if (sw) { sw.tire.visible = !isMk2; sw.smooth.visible = isMk2; }
        });
        // צמיגים עם גוון אבק חום-אפור כמו בתמונת המטרה (רק בתותח האפור)
        wheelRubberMat.emissive.setHex(isMk2 ? 0x030303 : 0x000000);
        // מכריחים עדכון אחד של הזרועות גם אם התותח במנוחה
        suspensionMotion.rest = false;
    }

    function applyCannonLook(isMk2) {
        // הגוף הקלאסי (גוף, כיפה, קנים) מוסתר כשהתותח האפור פעיל; הגלגלים נשארים
        classicBodyParts.forEach(part => { part.visible = !isMk2; });
        mk2Head.visible = isMk2;
        mk2Tracks.visible = isMk2;
        layoutSuspensionForLook(isMk2);
    }

    function setActiveCannon(type) {
        activeCannon = type === 'mk2' && advancedCannonOwned ? 'mk2' : 'classic';
        advancedCannonGroup.visible = false;
        // הנובה גדול יותר; כל החישובים (קליעים, התנגשויות, גלגלים) משתמשים ב-CANNON_SCALE החי
        CANNON_SCALE = CANNON_BASE_SCALE * (activeCannon === 'mk2' ? NOVA_SIZE_BOOST : 1);
        cannonGroup.scale.setScalar(CANNON_SCALE);
        mk2Tracks.children.forEach((strip, i) => { strip.position.z = (i === 0 ? -1 : 1) * MK2_WHEEL_Z * CANNON_SCALE; });
        applyCannonLook(activeCannon === 'mk2');
        if (!MK2_PREVIEW) localStorage.setItem('bb3d_active_cannon', activeCannon);
    }

    setActiveCannon(activeCannon);

   cannonGroup.scale.setScalar(
        CANNON_SCALE
    );

    scene.add(
        cannonGroup
    );

    addCannonLighting(selectedMap);

    // צל רך מתחת לתותח - חלק מהדשא, לא פלטפורמה.
    const cannonShadow = new THREE.Mesh(
        new THREE.CircleGeometry(
            1.45,
            32
        ),
        new THREE.MeshBasicMaterial({
            color: 0x1f2937,
            transparent: true,
            opacity: 0.22,
            depthWrite: false
        })
    );

    cannonShadow.rotation.x =
        -Math.PI / 2;

    cannonShadow.position.y =
        0.015;

    cannonShadow.scale.set(
        1.18,
        0.76,
        1
    );

    scene.add(
        cannonShadow
    );

    const cannonShadowSoft = new THREE.Mesh(
        new THREE.CircleGeometry(
            1.0,
            26
        ),
        new THREE.MeshBasicMaterial({
            color: 0x0f172a,
            transparent: true,
            opacity: 0.10,
            depthWrite: false
        })
    );

    cannonShadowSoft.rotation.x =
        -Math.PI / 2;

    cannonShadowSoft.position.y =
        0.018;

    cannonShadowSoft.scale.set(
        1.10,
        0.58,
        1
    );

    scene.add(
        cannonShadowSoft
    );

    // ==========================================
    // 5. משתני משחק
    // ==========================================
    // ==========================================
    let isGameStarted = false;
    let isPaused = false;
    let isGameOver = false;

    let score = 0;
    let coins = parseInt(localStorage.getItem('bb3d_coins')) || 0;
    let bestScore = parseInt(localStorage.getItem('bb3d_best')) || 0;
    let level = 1;
    let playerHp = 100;
    let maxHp = 100;

    let firePowerLvl = parseInt(localStorage.getItem('bb3d_upg_power')) || 1;
    let fireRateLvl = parseInt(localStorage.getItem('bb3d_upg_rate')) || 1;

    // מצב בדיקה: כוח אש וקצב אש קבועים על 1, כדי לראות את התנהגות היריות בלי השפעת השדרוגים.
    // רמות השדרוגים נשמרות ולא נפגעות (רק אין להן השפעה על היריות). כדי לחזור לרגיל: false.
    const FIXED_FIRE_STATS = true;
    let firePower = FIXED_FIRE_STATS ? 1 : firePowerLvl;
    let fireRate = FIXED_FIRE_STATS ? 1 : 1 + (fireRateLvl - 1) * 0.25;

    let bullets = [];
    let rocks = [];
    // סבב 1: איום חדש ליער, נפרד לחלוטין ממערכת הסלעים.
    let droppedCoins = [];

    let lastShotTime = 0;
    let targetX = 0;

    let cannonRecoil = 0;
    const cannonBaseY = 0.45;
    cannonGroup.userData.previousWheelX = cannonGroup.position.x;
    const effects = [];
    const tempVec3 = new THREE.Vector3();

    // ==========================================
    // 6. אלמנטים של UI ועדכון החנות במסך הפתיחה
    // ==========================================
    const coinsValEl = document.getElementById('coins-val');
    const scoreValEl = document.getElementById('score-val');
    const hpTextEl = document.getElementById('hp-text');
    const hpBarEl = document.getElementById('hp-bar');
    const levelTextEl = document.getElementById('level-text');

    const splashScreen = document.getElementById('splash-screen');

    // פתיח: תמונת הפתיחה מוצגת לבדה INTRO_ONLY_MS, ואז נכנס כרטיס התפריט.
    // הספירה מתחילה אחרי שהתמונה נטענה (עם גיבוי למקרה של טעינה איטית).
    const INTRO_ONLY_MS = 2000;
    if (splashScreen) {
        let introTimerStarted = false;
        const startIntroTimer = () => {
            if (introTimerStarted) return;
            introTimerStarted = true;
            setTimeout(() => splashScreen.classList.remove('intro-only'), INTRO_ONLY_MS);
        };
        const introImg = new Image();
        introImg.onload = introImg.onerror = startIntroTimer;
        introImg.src = 'blast-royale-splash.jpg';
        setTimeout(startIntroTimer, 1500);
    }
    const startBtn = document.getElementById('start-btn');
    const startCoinsEl = document.getElementById('start-coins');
    const startBestScoreEl = document.getElementById('start-best-score');

    const buyPowerBtn = document.getElementById('buy-power-btn');
    const buyRateBtn = document.getElementById('buy-rate-btn');
    // בחירת תותח: שני כרטיסים קבועים בתוך כרטיס הפתיחה (index.html).
    const cannonClassicBtn = document.getElementById('cannon-classic');
    const cannonMk2Btn = document.getElementById('cannon-mk2');

    const mapButtons = Array.from(document.querySelectorAll('[data-map-id]'));
    mapButtons.forEach(btn => {
        if (!MAPS[btn.dataset.mapId]) btn.remove();
    });
    const forestMapButtons = mapButtons.filter(btn => MAPS[btn.dataset.mapId]);

    // ==========================================
    // נשקים (נפרד מהתותח): Standard / Rockets / Lightning / Laser
    // המחירים כאן - אפשר לשנות. הנשק שנבחר נשמר בין משחקים.
    // ==========================================
    const WEAPONS = {
        standard:  { name: 'Standard',  price: 0 },
        rocket:    { name: 'Rockets',   price: 0 },
        lightning: { name: 'Lightning', price: 0 },
        laser:     { name: 'Laser',     price: 0 }
    };
    // כל הנשקים בחינם: כולם בבעלות מההתחלה
    let ownedWeapons = Object.keys(WEAPONS);
    try {
        const savedWeapons = JSON.parse(localStorage.getItem('bb3d_weapons_owned') || '[]');
        if (Array.isArray(savedWeapons)) savedWeapons.forEach(id => { if (WEAPONS[id] && !ownedWeapons.includes(id)) ownedWeapons.push(id); });
    } catch (e) { /* ignore */ }
    let activeWeapon = localStorage.getItem('bb3d_active_weapon') || 'standard';
    if (!WEAPONS[activeWeapon] || !ownedWeapons.includes(activeWeapon)) activeWeapon = 'standard';
    const weaponButtons = Array.from(document.querySelectorAll('[data-weapon-id]'));

    function updateWeaponTiles() {
        weaponButtons.forEach(btn => {
            const id = btn.dataset.weaponId;
            const w = WEAPONS[id];
            if (!w) return;
            const owned = ownedWeapons.includes(id);
            const selected = activeWeapon === id;
            btn.classList.toggle('selected', selected);
            btn.classList.toggle('owned', owned);
            btn.disabled = !owned && coins < w.price;
            const action = btn.querySelector('.map-action');
            if (action) action.innerText = selected ? 'Selected' : owned ? 'Select' : `${w.price} C`;
        });
    }

    weaponButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.weaponId;
            const w = WEAPONS[id];
            if (!w) return;
            if (!ownedWeapons.includes(id)) {
                if (coins < w.price) return;
                coins -= w.price;
                ownedWeapons.push(id);
                localStorage.setItem('bb3d_coins', coins);
                localStorage.setItem('bb3d_weapons_owned', JSON.stringify(ownedWeapons));
            }
            activeWeapon = id;
            localStorage.setItem('bb3d_active_weapon', activeWeapon);
            updateUI();
        });
    });

    // ==========================================
    // כפתור "Level Up" הירוק בזמן המשחק: רמה אחת משדרגת גם עוצמת ירייה וגם קצב אש
    // מחיר = מה שהיו עולים שני השדרוגים הרגילים יחד.
    // ==========================================
    let levelUpUI = null;   // נבנה בהמשך (ליד כפתור העצירה)
    let levelUpActive = false;   // true בזמן ההמתנה לפני תחילת הריצה (שם הכפתור יכול להופיע)
    let awaitingStart = false;   // תחילת ריצה: המשחק מחכה ללחיצה על המסך או על כפתור השדרוג
    let startHintEl = null;
    function beginRun() {
        if (!awaitingStart) return;
        awaitingStart = false;
        setLevelUpVisible(false);
        lastShotTime = 0;
        startNextWave();
    }
    function cannonLevelCost() { return firePowerLvl * 50 + fireRateLvl * 60; }
    function cannonLevelNumber() { return Math.floor((firePowerLvl + fireRateLvl) / 2); }
    function refreshLevelUpBtn() {
        if (!levelUpUI) return;
        const cost = cannonLevelCost();
        levelUpUI.lvl.textContent = cannonLevelNumber();
        levelUpUI.cost.textContent = cost.toLocaleString('en-US');
        const can = coins >= cost;
        levelUpUI.btn.classList.toggle('can', can);
        levelUpUI.btn.disabled = !can;
        // הכפתור מופיע רק כשהמשחק רץ וגם יש מספיק מטבעות לשדרוג (נעלם כשאין).
        levelUpUI.wrap.style.display = (levelUpActive && can) ? 'flex' : 'none';
    }
    function setLevelUpVisible(on) {
        levelUpActive = on;
        refreshLevelUpBtn();
        if (startHintEl) startHintEl.style.display = on ? 'block' : 'none';
    }


    // ==========================================
    // INVENTORY: מסך אחד לתותחים ולנשקים (כרטיסים + חלון פרטים עם קנייה / הצטיידות)
    // ==========================================
    let invUI = null;          // נבנה בהמשך
    let invOpenKey = null;     // הכרטיס שפתוח כרגע בחלון הפרטים, למשל 'weapon:rocket'
    const INV_ITEMS = [
        { kind: 'cannon', id: 'classic', name: 'Classic', icon: '⚙️', color: '#facc15', tag: 'CANNON',
          desc: 'The reliable twin-barrel cannon. Balanced, steady and easy to control.' },
        { kind: 'cannon', id: 'mk2', name: 'Nova Cannon', icon: '🛡️', color: '#38bdf8', tag: 'CANNON',
          desc: 'Armored off-road cannon with powered suspension and big tyres. Bigger, tougher and ready for anything.' },
        { kind: 'weapon', id: 'standard', name: 'Standard', icon: '🔫', color: '#fbbf24', tag: 'WEAPON',
          desc: 'Twin golden shots. Dependable damage at a steady rate.',
          stars: ['+20% damage', 'Fan shots: 2 extra angled bullets', '+25% damage', 'Wide fan: 4 extra angled bullets'] },
        { kind: 'weapon', id: 'rocket', name: 'Rockets', icon: '🚀', color: '#fb923c', tag: 'WEAPON',
          desc: 'Slow, heavy rockets that explode on impact and damage every rock inside the blast.',
          stars: ['+20% blast radius', '+25% damage', '+20% blast radius', 'Cluster: each blast spawns 4 mini-blasts'] },
        { kind: 'weapon', id: 'lightning', name: 'Lightning', icon: '⚡', color: '#60a5fa', tag: 'WEAPON',
          desc: 'Plasma orbs that arc between nearby rocks. Perfect against crowded waves.',
          stars: ['+1 chain jump', '+25% damage', '+1 chain jump', 'Overcharge: +1 chain jump and +25% damage'] },
        { kind: 'weapon', id: 'laser', name: 'Laser', icon: '🔦', color: '#f87171', tag: 'WEAPON',
          desc: 'Rapid laser bolts that fly straight through the rocks in their path.',
          stars: ['+20% damage', 'Wider bolts: easier to hit', '+20% damage', 'Double bolts: two bolts per barrel'] }
    ];

    function invItemState(item) {
        if (item.kind === 'cannon') {
            const price = item.id === 'mk2' ? ADVANCED_CANNON_PRICE : 0;
            const owned = item.id === 'mk2' ? advancedCannonOwned : true;
            const equipped = (activeCannon === 'mk2') === (item.id === 'mk2');
            return { owned, equipped, price };
        }
        const w = WEAPONS[item.id];
        return { owned: ownedWeapons.includes(item.id), equipped: activeWeapon === item.id, price: w ? w.price : 0 };
    }

    function selectOrBuyCannon(id) {
        if (id === 'mk2') {
            if (!advancedCannonOwned) {
                if (coins < ADVANCED_CANNON_PRICE) return;
                coins -= ADVANCED_CANNON_PRICE;
                advancedCannonOwned = true;
                localStorage.setItem('bb3d_cannon_mk2_owned', '1');
                localStorage.setItem('bb3d_coins', coins);
            }
            setActiveCannon('mk2');
        } else {
            setActiveCannon('classic');
        }
        updateUI();
    }

    function selectOrBuyWeapon(id) {
        const w = WEAPONS[id];
        if (!w) return;
        if (!ownedWeapons.includes(id)) {
            if (coins < w.price) return;
            coins -= w.price;
            ownedWeapons.push(id);
            localStorage.setItem('bb3d_coins', coins);
            localStorage.setItem('bb3d_weapons_owned', JSON.stringify(ownedWeapons));
        }
        activeWeapon = id;
        localStorage.setItem('bb3d_active_weapon', activeWeapon);
        updateUI();
    }

    function invAct(item) {
        if (item.kind === 'cannon') selectOrBuyCannon(item.id);
        else selectOrBuyWeapon(item.id);
    }

    // ---- כוכבי נשק: כל נשק שנקנה מתחיל ב-1 כוכב ואפשר לשדרג עד 5 (במטבעות) ----
    const STAR_COSTS = [3000, 8000, 20000, 50000];   // המחיר להגיע לכוכב 2, 3, 4, 5
    let weaponStarsMap = {};
    try {
        const savedStars = JSON.parse(localStorage.getItem('bb3d_weapon_stars') || '{}');
        if (savedStars && typeof savedStars === 'object') weaponStarsMap = savedStars;
    } catch (e) { /* ignore */ }
    let fanToggle = false;

    function getStars(id) { return Math.max(1, Math.min(5, parseInt(weaponStarsMap[id], 10) || 1)); }
    function nextStarCost(id) { const st = getStars(id); return st >= 5 ? null : STAR_COSTS[st - 1]; }
    function upgradeWeaponStar(id) {
        if (!ownedWeapons.includes(id)) return;
        const cost = nextStarCost(id);
        if (cost === null || coins < cost) return;
        coins -= cost;
        weaponStarsMap[id] = getStars(id) + 1;
        localStorage.setItem('bb3d_coins', coins);
        localStorage.setItem('bb3d_weapon_stars', JSON.stringify(weaponStarsMap));
        updateUI();
    }
    // מה כל כוכב נותן (חייב להתאים לטקסטים ב-INV_ITEMS)
    function starDmgMult(id) {
        const st = getStars(id);
        if (id === 'standard') return 1 + (st >= 2 ? 0.20 : 0) + (st >= 4 ? 0.25 : 0);
        if (id === 'rocket') return 1 + (st >= 3 ? 0.25 : 0);
        if (id === 'lightning') return 1 + (st >= 3 ? 0.25 : 0) + (st >= 5 ? 0.25 : 0);
        if (id === 'laser') return 1 + (st >= 2 ? 0.20 : 0) + (st >= 4 ? 0.20 : 0);
        return 1;
    }
    function rocketRadiusMult() { const st = getStars('rocket'); return 1 + (st >= 2 ? 0.20 : 0) + (st >= 4 ? 0.20 : 0); }
    function lightningExtraJumps() { const st = getStars('lightning'); return (st >= 2 ? 1 : 0) + (st >= 4 ? 1 : 0) + (st >= 5 ? 1 : 0); }
    function laserWidthMult() { return getStars('laser') >= 3 ? 1.35 : 1; }
    function laserDoubleBolts() { return getStars('laser') >= 5; }
    function standardFanAngles() {
        const st = getStars('standard');
        if (st >= 5) return [-0.24, -0.12, 0.12, 0.24];
        if (st >= 3) return [-0.14, 0.14];
        return [];
    }

    function refreshInventory() {
        if (!invUI) return;
        invUI.coins.textContent = coins.toLocaleString('en-US');
        invUI.cards.forEach(c => {
            const st = invItemState(c.item);
            c.el.classList.toggle('equipped', st.equipped);
            c.el.classList.toggle('locked', !st.owned);
            c.check.style.display = st.equipped ? 'flex' : 'none';
            c.price.style.display = st.owned ? 'none' : 'inline-flex';
            c.price.textContent = '🪙 ' + st.price.toLocaleString('en-US');
            c.price.classList.toggle('no', !st.owned && coins < st.price);
            if (c.stars) {
                const n = getStars(c.item.id);
                c.stars.innerHTML = st.owned ? '★'.repeat(n) + '<u>' + '★'.repeat(5 - n) + '</u>' : '';
            }
        });
        if (invOpenKey) renderInvDetail();
    }

    function renderInvDetail() {
        if (!invUI || !invOpenKey) return;
        const item = INV_ITEMS.find(i => (i.kind + ':' + i.id) === invOpenKey);
        if (!item) return;
        const st = invItemState(item);
        const d = invUI.detail;
        d.panel.style.setProperty('--c', item.color);
        d.ico.textContent = item.icon;
        d.name.textContent = item.name;
        d.tag.textContent = item.tag;
        d.desc.textContent = item.desc;
        d.stats.innerHTML = '';
        const curStars = item.stars ? getStars(item.id) : 0;
        if (item.stars) {
            ['Base weapon'].concat(item.stars).forEach((txt, k) => {
                const level = k + 1;
                const row = document.createElement('div');
                const unlocked = st.owned && level <= curStars;
                row.className = 'inv-star-row' + (unlocked ? ' on' : '') + (st.owned && level === curStars + 1 ? ' next' : '');
                row.innerHTML = '<b>' + level + '★</b><span>' + txt + '</span><em>' + (unlocked ? '✓' : '🔒') + '</em>';
                d.stats.appendChild(row);
            });
        } else if (item.stats) {
            Object.keys(item.stats).forEach(label => {
                const row = document.createElement('div');
                row.className = 'inv-stat';
                let bars = '';
                for (let k = 1; k <= 5; k++) bars += '<i class="' + (k <= item.stats[label] ? 'on' : '') + '"></i>';
                row.innerHTML = '<span>' + label + '</span><div class="inv-bar">' + bars + '</div>';
                d.stats.appendChild(row);
            });
        }
        const u = d.upgrade;
        if (item.stars && st.owned) {
            u.style.display = 'block';
            const cost = nextStarCost(item.id);
            if (cost === null) {
                u.className = 'inv-upgrade max';
                u.textContent = 'MAX LEVEL  ★★★★★';
                u.disabled = true;
            } else {
                const canUp = coins >= cost;
                u.className = 'inv-upgrade' + (canUp ? '' : ' no');
                u.textContent = canUp ? 'UPGRADE  ★' + (curStars + 1) + '  ·  🪙 ' + cost.toLocaleString('en-US')
                                      : 'NEED 🪙 ' + cost.toLocaleString('en-US');
                u.disabled = !canUp;
            }
        } else {
            u.style.display = 'none';
        }
        const a = d.action;
        if (st.equipped) {
            a.className = 'inv-action done';
            a.textContent = 'EQUIPPED ✓';
            a.disabled = true;
        } else if (st.owned) {
            a.className = 'inv-action equip';
            a.textContent = 'EQUIP';
            a.disabled = false;
        } else {
            const can = coins >= st.price;
            a.className = 'inv-action buy';
            a.textContent = can ? 'BUY  ·  🪙 ' + st.price.toLocaleString('en-US') : 'NEED 🪙 ' + st.price.toLocaleString('en-US');
            a.disabled = !can;
        }
    }

    // מצב כרטיס תותח: נבחר / בחר / מחיר (נעול אם אין מספיק מטבעות).
    function renderCannonTile(btn, { selected, owned, label, locked }) {
        if (!btn) return;
        btn.classList.toggle('selected', selected);
        btn.classList.toggle('owned', owned);
        btn.disabled = !!locked;
        const action = btn.querySelector('.map-action');
        if (action) action.innerText = label;
    }

    function updateCannonTiles() {
        const mk2Active = activeCannon === 'mk2';
        renderCannonTile(cannonClassicBtn, {
            selected: !mk2Active,
            owned: true,
            label: !mk2Active ? 'Selected' : 'Select',
            locked: false
        });
        renderCannonTile(cannonMk2Btn, {
            selected: mk2Active,
            owned: advancedCannonOwned,
            label: !advancedCannonOwned ? `${ADVANCED_CANNON_PRICE} C` : (mk2Active ? 'Selected' : 'Select'),
            locked: !advancedCannonOwned && coins < ADVANCED_CANNON_PRICE
        });
    }

    function updateUI() {
        if (coinsValEl) coinsValEl.innerText = coins;
        if (scoreValEl) scoreValEl.innerText = score;
        if (startCoinsEl) startCoinsEl.innerText = coins;
        if (startBestScoreEl) startBestScoreEl.innerText = bestScore;
        if (hpTextEl) hpTextEl.innerText = `${Math.max(0, playerHp)} / ${maxHp}`;
        if (hpBarEl) hpBarEl.style.width = `${Math.max(0, (playerHp / maxHp) * 100)}%`;
        if (levelTextEl) levelTextEl.innerText = `LEVEL ${level}`;

        // מחירים לשדרוגים
        const powerCost = firePowerLvl * 50;
        const rateCost = fireRateLvl * 60;

        if (buyPowerBtn) {
            buyPowerBtn.innerText = `${powerCost} C`;
            buyPowerBtn.disabled = coins < powerCost;
            const el = document.getElementById('power-lvl-text');
            if (el) el.innerText = `Lvl ${firePowerLvl}`;
        }
        if (buyRateBtn) {
            buyRateBtn.innerText = `${rateCost} C`;
            buyRateBtn.disabled = coins < rateCost;
            const el = document.getElementById('rate-lvl-text');
            if (el) el.innerText = `Lvl ${fireRateLvl}`;
        }
        updateCannonTiles();
        updateWeaponTiles();
        refreshLevelUpBtn();
        refreshInventory();

        forestMapButtons.forEach(btn => {
            const mapId = btn.dataset.mapId;
            const map = MAPS[mapId];
            if (!map) return;
            const owned = purchasedMaps.includes(mapId);
            const selected = selectedMap === mapId;
            const action = btn.querySelector('.map-action');
            const state = btn.querySelector('.map-state');
            if (action) action.innerText = selected ? 'Selected' : owned ? 'Select' : `${map.price} C`;
            if (state) state.innerText = selected ? 'ACTIVE' : owned ? 'OWNED' : 'LOCKED';
            btn.classList.toggle('selected', selected);
            btn.classList.toggle('owned', owned);
            btn.disabled = !owned && coins < map.price;
        });
    }

    if (cannonClassicBtn) {
        cannonClassicBtn.addEventListener('click', () => {
            setActiveCannon('classic');
            updateUI();
        });
    }

    if (cannonMk2Btn) {
        cannonMk2Btn.addEventListener('click', () => {
            if (!advancedCannonOwned) {
                if (coins < ADVANCED_CANNON_PRICE) return;
                coins -= ADVANCED_CANNON_PRICE;
                advancedCannonOwned = true;
                localStorage.setItem('bb3d_cannon_mk2_owned', '1');
                localStorage.setItem('bb3d_coins', coins);
            }
            setActiveCannon('mk2');
            updateUI();
        });
    }

    // חנות מפות - הקנייה והשינוי נעשים במסך הפתיחה בלבד.
    forestMapButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const mapId = btn.dataset.mapId;
            const map = MAPS[mapId];
            if (!map) return;

            const owned = purchasedMaps.includes(mapId);
            if (!owned) {
                if (coins < map.price) return;
                coins -= map.price;
                purchasedMaps.push(mapId);
                localStorage.setItem('bb3d_coins', coins);
                localStorage.setItem('bb3d_purchased_maps', JSON.stringify(purchasedMaps));
            }

            selectedMap = mapId;
            localStorage.setItem('bb3d_map', selectedMap);
            buildMap(selectedMap);
            updateUI();
        });
    });

    // חיבור כפתורי השדרוגים במסך הפתיחה
    if (buyPowerBtn) {
        buyPowerBtn.addEventListener('click', () => {
            const cost = firePowerLvl * 50;
            if (coins >= cost) {
                coins -= cost;
                firePowerLvl++;
                firePower = FIXED_FIRE_STATS ? 1 : firePowerLvl;
                localStorage.setItem('bb3d_coins', coins);
                localStorage.setItem('bb3d_upg_power', firePowerLvl);
                updateUI();
            }
        });
    }

    if (buyRateBtn) {
        buyRateBtn.addEventListener('click', () => {
            const cost = fireRateLvl * 60;
            if (coins >= cost) {
                coins -= cost;
                fireRateLvl++;
                fireRate = FIXED_FIRE_STATS ? 1 : 1 + (fireRateLvl - 1) * 0.25;
                localStorage.setItem('bb3d_coins', coins);
                localStorage.setItem('bb3d_upg_rate', fireRateLvl);
                updateUI();
            }
        });
    }

    updateUI();

    // ==========================================
    // 7. סאונד
    // ==========================================
    let audioCtx = null;
    function getAudioCtx() {
        if (!audioCtx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return null;
            audioCtx = new AudioContextClass();
        }
        return audioCtx;
    }

    function playSound(type) {
        return;   // כל צלילי האפקטים (ירייה / פגיעה / מטבע) בוטלו לגמרי. נשארה רק מוזיקת הרקע.
        const ctx = getAudioCtx();
        if (!ctx) return;
        if (ctx.state === 'suspended') ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        if (type === 'shoot') {
            osc.frequency.setValueAtTime(320, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(90, ctx.currentTime + 0.07);
            gain.gain.setValueAtTime(0.05, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.07);
            osc.start(); osc.stop(ctx.currentTime + 0.07);
        } else if (type === 'hit') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(120, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.06);
            gain.gain.setValueAtTime(0.08, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.06);
            osc.start(); osc.stop(ctx.currentTime + 0.06);
        } else if (type === 'coin') {
            osc.frequency.setValueAtTime(850, ctx.currentTime);
            osc.frequency.setValueAtTime(1250, ctx.currentTime + 0.05);
            gain.gain.setValueAtTime(0.07, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.12);
            osc.start(); osc.stop(ctx.currentTime + 0.12);
        }
    }

    // ==========================================
    // מוזיקת רקע - נוצרת בקוד (בלי קבצים), מתנגנת רק בזמן משחק פעיל:
    // לא בתפריט, לא בעצירה ולא במסך סוף המשחק.
    // ==========================================
    const MUSIC_VOLUME = 0.13;      // עוצמה כללית (0-1)
    const MUSIC_BPM = 128;
    const MUSIC_CHORDS = [
        { root: 45, tones: [57, 60, 64] },   // Am
        { root: 41, tones: [53, 57, 60] },   // F
        { root: 48, tones: [55, 60, 64] },   // C
        { root: 43, tones: [55, 59, 62] }    // G
    ];
    const MUSIC_BASS_STEPS = [0, 2, 3, 6, 8, 10, 11, 14];
    const MUSIC_ARP = [0, 1, 2, 1, 2, 1, 0, 1, 0, 1, 2, 1, 2, 1, 2, 1];
    let musicMaster = null, musicNoise = null, musicTimer = null;
    let musicStep = 0, musicNextTime = 0, musicPlaying = false;

    const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);

    function musicTone(ctx, type, freq, t, dur, vol, cutoff, detune) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        if (detune) osc.detune.setValueAtTime(detune, t);
        let node = osc;
        if (cutoff) {
            const f = ctx.createBiquadFilter();
            f.type = 'lowpass';
            f.frequency.setValueAtTime(cutoff, t);
            f.frequency.exponentialRampToValueAtTime(Math.max(150, cutoff * 0.3), t + dur);
            osc.connect(f);
            node = f;
        }
        node.connect(g);
        g.connect(musicMaster);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.start(t);
        osc.stop(t + dur + 0.03);
    }

    function musicNoiseHit(ctx, t, dur, vol, filterType, freq) {
        const src = ctx.createBufferSource();
        src.buffer = musicNoise;
        const f = ctx.createBiquadFilter();
        f.type = filterType;
        f.frequency.setValueAtTime(freq, t);
        const g = ctx.createGain();
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(f); f.connect(g); g.connect(musicMaster);
        src.start(t);
        src.stop(t + dur + 0.02);
    }

    function musicPlayStep(ctx, step, t, stepDur) {
        const s = step % 16;
        const bar = Math.floor(step / 16) % 8;
        const chord = MUSIC_CHORDS[Math.floor(bar / 2) % 4];

        // תוף בס: ארבע על הרצפה
        if (s % 4 === 0) {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(150, t);
            osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
            g.gain.setValueAtTime(0.9, t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
            osc.connect(g); g.connect(musicMaster);
            osc.start(t); osc.stop(t + 0.26);
        }
        // סנר / מחיאה
        if (s === 4 || s === 12) musicNoiseHit(ctx, t, 0.13, 0.42, 'bandpass', 1900);
        // האט
        if (s % 2 === 0) musicNoiseHit(ctx, t, s % 4 === 2 ? 0.09 : 0.035, s % 4 === 2 ? 0.2 : 0.09, 'highpass', 7000);
        // בס פועם
        if (MUSIC_BASS_STEPS.includes(s)) {
            const note = chord.root + (s === 6 || s === 14 ? 12 : 0);
            musicTone(ctx, 'sawtooth', midiHz(note), t, stepDur * 1.9, 0.38, 520);
        }
        // ארפג'יו מעל האקורד (חזק יותר אחרי שני התיבות הראשונות)
        const arpNote = chord.tones[MUSIC_ARP[s]] + 12;
        musicTone(ctx, 'triangle', midiHz(arpNote), t, stepDur * 1.5, bar < 2 ? 0.06 : 0.095, 3000);
        if (bar >= 4 && s % 4 === 0) musicTone(ctx, 'square', midiHz(chord.tones[2] + 24), t, stepDur * 2.2, 0.035, 2400);
        // פאד רך שמחזיק את האקורד כל תיבה
        if (s === 0) {
            const barDur = stepDur * 16;
            chord.tones.forEach((n, i) => {
                const pad = ctx.createOscillator();
                const f = ctx.createBiquadFilter();
                const g = ctx.createGain();
                pad.type = 'sawtooth';
                pad.frequency.setValueAtTime(midiHz(n), t);
                pad.detune.setValueAtTime((i - 1) * 9, t);
                f.type = 'lowpass';
                f.frequency.setValueAtTime(900, t);
                g.gain.setValueAtTime(0.0001, t);
                g.gain.linearRampToValueAtTime(0.03, t + 0.35);
                g.gain.linearRampToValueAtTime(0.0001, t + barDur);
                pad.connect(f); f.connect(g); g.connect(musicMaster);
                pad.start(t); pad.stop(t + barDur + 0.05);
            });
        }
    }

    function musicSchedule() {
        const ctx = audioCtx;
        if (!ctx || !musicPlaying) return;
        const stepDur = 60 / MUSIC_BPM / 4;
        if (musicNextTime < ctx.currentTime - 0.5) musicNextTime = ctx.currentTime + 0.05;
        while (musicNextTime < ctx.currentTime + 0.15) {
            musicPlayStep(ctx, musicStep, musicNextTime, stepDur);
            musicNextTime += stepDur;
            musicStep = (musicStep + 1) % 128;
        }
    }

    function startMusic() {
        const ctx = getAudioCtx();
        if (!ctx || musicPlaying) return;
        if (ctx.state === 'suspended') ctx.resume();
        if (!musicMaster) {
            musicMaster = ctx.createGain();
            musicMaster.connect(ctx.destination);
            musicNoise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
            const d = musicNoise.getChannelData(0);
            for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        }
        const now = ctx.currentTime;
        musicMaster.gain.cancelScheduledValues(now);
        musicMaster.gain.setValueAtTime(0.0001, now);
        musicMaster.gain.linearRampToValueAtTime(MUSIC_VOLUME, now + 0.6);
        musicNextTime = now + 0.08;
        musicPlaying = true;
        musicTimer = setInterval(musicSchedule, 30);
    }

    function stopMusic() {
        if (!musicPlaying) return;
        musicPlaying = false;
        clearInterval(musicTimer);
        musicTimer = null;
        if (musicMaster && audioCtx) {
            const now = audioCtx.currentTime;
            musicMaster.gain.cancelScheduledValues(now);
            musicMaster.gain.setValueAtTime(Math.max(0.0001, musicMaster.gain.value), now);
            musicMaster.gain.linearRampToValueAtTime(0.0001, now + 0.25);
        }
    }

    // מנגן רק כשיש משחק פעיל (התחיל, לא בעצירה, לא נגמר) והעמוד גלוי.
    function syncMusic() {
        const shouldPlay = isGameStarted && !isPaused && !isGameOver && !document.hidden;
        if (shouldPlay) {
            startMusic();
        } else {
            stopMusic();
            if (!isGameStarted || isGameOver) musicStep = 0;   // ריצה חדשה מתחילה את המוזיקה מההתחלה
        }
    }
    setInterval(syncMusic, 250);

    // דפדפנים מאפשרים סאונד רק אחרי נגיעה: פותחים את האודיו בנגיעה הראשונה.
    ['pointerdown', 'touchstart', 'click'].forEach(ev => {
        window.addEventListener(ev, () => {
            const c = getAudioCtx();
            if (c && c.state === 'suspended') c.resume();
        }, { passive: true });
    });

    // ==========================================
    // 8. יצירת סלעים, כדורים ומטבעות
    // ==========================================
    // משאבים משותפים לקליעים: אותה גאומטריה/חומר משמשים את כל היריות.
    // כך אפשר לחדד את המראה בלי ליצור ולשחרר עשרות גאומטריות וחומרים בזמן המשחק.
    const PROJECTILE_GEO = {
        core: new THREE.SphereGeometry(1, 12, 10),
        shell: new THREE.SphereGeometry(1, 12, 10),
        halo: new THREE.SphereGeometry(1, 10, 8),
        trail: new THREE.ConeGeometry(1, 1, 8, 1, true)
    };
    const PROJECTILE_MAT = {
        goldCore: new THREE.MeshBasicMaterial({ color: 0xfff2b0, toneMapped: false }),
        goldShell: new THREE.MeshBasicMaterial({ color: 0xffa21c, opacity: 0.38, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
        goldHalo: new THREE.MeshBasicMaterial({ color: 0xff5d0a, opacity: 0.075, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
        goldTrail: new THREE.MeshBasicMaterial({ color: 0xff6a10, opacity: 0.42, side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
        blueCore: new THREE.MeshBasicMaterial({ color: 0xdaf6ff, toneMapped: false }),
        blueShell: new THREE.MeshBasicMaterial({ color: 0x2f8cff, opacity: 0.38, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
        blueHalo: new THREE.MeshBasicMaterial({ color: 0x1a50ff, opacity: 0.09, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
        blueTrail: new THREE.MeshBasicMaterial({ color: 0x39aaff, opacity: 0.48, side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
    };

    function spawnBullet(x, y, z, weapon, streamIdx) {
        const bullet = new THREE.Group();
        const blue = weapon === 'lightning';
        const mats = blue
            ? [PROJECTILE_MAT.blueCore, PROJECTILE_MAT.blueShell, PROJECTILE_MAT.blueHalo, PROJECTILE_MAT.blueTrail]
            : [PROJECTILE_MAT.goldCore, PROJECTILE_MAT.goldShell, PROJECTILE_MAT.goldHalo, PROJECTILE_MAT.goldTrail];

        const core = new THREE.Mesh(PROJECTILE_GEO.core, mats[0]);
        core.scale.set(0.15, 0.22, 0.15);
        const shell = new THREE.Mesh(PROJECTILE_GEO.shell, mats[1]);
        shell.scale.set(0.24, 0.34, 0.24);
        const halo = new THREE.Mesh(PROJECTILE_GEO.halo, mats[2]);
        halo.scale.set(0.34, 0.50, 0.34);
        // זנב אנרגיה מחודד מאחורי הקליע, ללא חלקיקים נוספים.
        const trail = new THREE.Mesh(PROJECTILE_GEO.trail, mats[3]);
        trail.scale.set(0.11, 0.75, 0.11);
        trail.rotation.x = Math.PI;
        trail.position.y = -0.45;

        bullet.add(halo, shell, core, trail);
        bullet.position.set(x, y, z);
        bullet.userData = { core, trail, weapon: weapon || null, stream: streamIdx || 0, dmgMult: weapon ? 1 : starDmgMult('standard') };
        // ברק: הקליע נשאר בלתי נראה לצורך חישוב הפגיעה; כדור הפלזמה מצויר בנפרד (updatePlasmaOrbs).
        if (blue) {
            bullet.visible = false;
            // כדור פלזמה נראה רק על חלק מהקליעים (בקצב אש גבוה יש המון קליעים) - במרווחים קבועים ויציבים.
            const si = streamIdx || 0;
            lightningSeq[si] = (lightningSeq[si] || 0) + 1;
            bullet.userData.orb = ((lightningSeq[si] - 1) % lightningOrbEvery) === 0;
        }
        scene.add(bullet);
        bullets.push(bullet);
        return bullet;
    }


    // ==========================================
    // נשקים מיוחדים: רקטות / ברק / לייזר
    // ==========================================
    const ROCKET_DAMAGE = 2.2;        // x כוח ירי, במרכז הפיצוץ
    const ROCKET_RADIUS = 2.3;        // רדיוס הפיצוץ
    const ROCKET_SPEED = 0.30;        // איטית מקליע רגיל (0.42)
    const ROCKET_RATE = 1.8;          // ירי איטי יותר (רגיל: 4 לשנייה)
    const LIGHTNING_DAMAGE = 1.2;     // x כוח ירי בפגיעה הראשונה
    const LIGHTNING_JUMPS = 3;        // כמה קפיצות נוספות בין סלעים
    const LIGHTNING_RANGE = 4.8;      // מרחק מקסימלי לקפיצה
    const LIGHTNING_FALLOFF = 0.7;    // כל קפיצה חלשה יותר
    const LASER_DAMAGE = 0.5;         // x כוח ירי לכל קרן בכל פעימה
    const LASER_TICKS_PER_SEC = 6;    // פעימות לשנייה (גדל עם קצב האש)
    const LASER_TOP_Y = 17;

    const weaponFx = [];
    const pendingWeaponHits = [];
    const delayedBlasts = [];
    const laserBeams = [];
    let lastLaserTick = 0;

    // פגיעה בסלע שלא דרך לולאת הכדורים (פיצוץ / ברק / לייזר).
    function damageRock(r, dmg, withBurst) {
        const idx = rocks.indexOf(r);
        if (idx < 0) return;
        const data = r.userData;
        const amount = Math.max(1, Math.round(dmg));
        data.hp -= amount;
        data.flash = 1;
        score += amount;
        if (withBurst) spawnImpactBurst(r.position.x, r.position.y, r.position.z);

        if (data.hp <= 0) {
            if (Math.random() > 0.3) spawnCoin(r.position.x, r.position.y);
            splitRockIntoChildren(r, data);
            missionOnRock();
            removeRock(r, idx);
            updateUI();
        } else {
            updateRockLabel(r);
        }
    }

    // רקטה מפורטת עם חומרים וגאומטריות משותפים — אין יצירה/שחרור של משאבים בכל ירייה.
    const ROCKET_GEO = {
        body: new THREE.CylinderGeometry(0.10, 0.12, 0.56, 10),
        nose: new THREE.ConeGeometry(0.10, 0.26, 10),
        band: new THREE.CylinderGeometry(0.126, 0.126, 0.055, 10),
        fin: new THREE.BoxGeometry(0.22, 0.17, 0.035),
        flame: new THREE.ConeGeometry(0.13, 0.7, 8),
        nozzle: new THREE.TorusGeometry(0.105, 0.025, 5, 10)
    };
    const ROCKET_MAT = {
        body: new THREE.MeshStandardMaterial({ color: 0xbfc7d0, metalness: 0.78, roughness: 0.30, flatShading: true }),
        nose: new THREE.MeshStandardMaterial({ color: 0xd9432f, metalness: 0.32, roughness: 0.36, flatShading: true }),
        band: new THREE.MeshStandardMaterial({ color: 0xf06a35, metalness: 0.48, roughness: 0.32 }),
        fin: new THREE.MeshStandardMaterial({ color: 0x343b45, metalness: 0.72, roughness: 0.38, flatShading: true }),
        flame: new THREE.MeshBasicMaterial({ color: 0xffa020, transparent: true, opacity: 0.88, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
        nozzle: new THREE.MeshBasicMaterial({ color: 0xff8b32, toneMapped: false })
    };

    function spawnRocket(x, y, z) {
        const g = new THREE.Group();
        const body = new THREE.Mesh(ROCKET_GEO.body, ROCKET_MAT.body);
        const nose = new THREE.Mesh(ROCKET_GEO.nose, ROCKET_MAT.nose);
        nose.position.y = 0.40;
        const band = new THREE.Mesh(ROCKET_GEO.band, ROCKET_MAT.band);
        band.position.y = 0.12;
        const rearBand = new THREE.Mesh(ROCKET_GEO.band, ROCKET_MAT.body);
        rearBand.position.y = -0.22;
        const flame = new THREE.Mesh(ROCKET_GEO.flame, ROCKET_MAT.flame);
        flame.rotation.x = Math.PI;
        flame.position.y = -0.58;
        flame.scale.set(0.82, 0.9, 0.82);
        const nozzle = new THREE.Mesh(ROCKET_GEO.nozzle, ROCKET_MAT.nozzle);
        nozzle.rotation.x = Math.PI / 2;
        nozzle.position.y = -0.285;
        const fins = [];
        for (let i = 0; i < 3; i++) {
            const fin = new THREE.Mesh(ROCKET_GEO.fin, ROCKET_MAT.fin);
            const angle = i * (Math.PI * 2 / 3);
            fin.position.set(Math.sin(angle) * 0.105, -0.18, Math.cos(angle) * 0.105);
            fin.rotation.y = angle;
            fins.push(fin);
        }
        g.add(body, nose, band, rearBand, flame, nozzle, ...fins);
        g.position.set(x, y, z);
        g.userData = { weapon: 'rocket', speed: ROCKET_SPEED, flame };
        scene.add(g);
        bullets.push(g);
    }

    // סרט דק שפונה למצלמה (קו ברק): נקודות [x, y] -> רצועה אחת.
    function makeRibbon(pts, width, color, opacity) {
        const n = pts.length;
        const pos = new Float32Array(n * 2 * 3);
        const idx = [];
        for (let i = 0; i < n; i++) {
            const a = pts[Math.max(0, i - 1)];
            const b = pts[Math.min(n - 1, i + 1)];
            let dx = b[0] - a[0], dy = b[1] - a[1];
            const l = Math.hypot(dx, dy) || 1;
            dx /= l; dy /= l;
            const nx = -dy, ny = dx;
            const hw = width * 0.5 * (0.45 + 0.55 * Math.sin(Math.PI * i / (n - 1)));
            pos.set([pts[i][0] + nx * hw, pts[i][1] + ny * hw, 0.4, pts[i][0] - nx * hw, pts[i][1] - ny * hw, 0.4], i * 6);
            if (i < n - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setIndex(idx);
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
            color, transparent: true, opacity, depthWrite: false, depthTest: false,
            blending: THREE.AdditiveBlending, side: THREE.DoubleSide
        }));
        mesh.renderOrder = 20;
        mesh.userData.baseOpacity = opacity;
        return mesh;
    }

    function spawnBolt(x1, y1, x2, y2) {
        const segs = 7;
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1;
        const px = -dy / len, py = dx / len;
        const pts = [];
        for (let i = 0; i <= segs; i++) {
            const t = i / segs;
            const j = (i === 0 || i === segs) ? 0 : (Math.random() - 0.5) * 0.7;
            pts.push([x1 + dx * t + px * j, y1 + dy * t + py * j]);
        }
        const g = new THREE.Group();
        [[0.50, 0x2a1fd0, 0.5], [0.20, 0x6fd8ff, 0.9], [0.07, 0xffffff, 1.0]].forEach(([w, c, o]) => {
            const rb = makeRibbon(pts, w, c, o);
            rb.material.blending = THREE.NormalBlending;
            g.add(rb);
        });
        g.userData = { type: 'bolt', life: 9, maxLife: 9 };
        scene.add(g);
        weaponFx.push(g);
    }

    function spawnBlastFx(x, y, R) {
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.78, 1.0, 32),
            new THREE.MeshBasicMaterial({ color: 0xffb050, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
        );
        ring.position.set(x, y, 0.5);
        ring.renderOrder = 20;
        ring.userData = { type: 'blastRing', life: 16, maxLife: 16, baseOpacity: 0.9, R: R || ROCKET_RADIUS };
        scene.add(ring);
        weaponFx.push(ring);

        const ball = new THREE.Mesh(
            new THREE.SphereGeometry(1, 14, 10),
            new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.7, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })
        );
        ball.position.set(x, y, 0.5);
        ball.renderOrder = 19;
        ball.userData = { type: 'blastBall', life: 12, maxLife: 12, baseOpacity: 0.7, R: R || ROCKET_RADIUS };
        scene.add(ball);
        weaponFx.push(ball);

        spawnImpactBurst(x, y, 0, 0xffa040);
        spawnImpactBurst(x, y, 0, 0xffe08a);
    }

    function disposeWeaponFx(fx) {
        scene.remove(fx);
        fx.traverse(c => {
            if (c.geometry) c.geometry.dispose();
            if (c.material) c.material.dispose();
        });
    }

    function updateWeaponFx() {
        for (let i = weaponFx.length - 1; i >= 0; i--) {
            const fx = weaponFx[i];
            const d = fx.userData;
            d.life -= 1;
            const k = Math.max(0, d.life / d.maxLife);
            if (d.type === 'bolt') {
                fx.children.forEach(c => { c.material.opacity = c.userData.baseOpacity * k * (0.7 + 0.3 * Math.random()); });
            } else if (d.type === 'blastRing') {
                const prog = 1 - k;
                fx.scale.setScalar(0.4 + prog * (d.R || ROCKET_RADIUS) * 1.05);
                fx.material.opacity = d.baseOpacity * k;
            } else if (d.type === 'plasmaRing') {
                fx.scale.setScalar(0.3 + (1 - k) * 1.4);
                fx.material.opacity = d.baseOpacity * k;
            } else if (d.type === 'plasmaFlash') {
                fx.scale.setScalar(0.15 + (1 - k) * 0.4);
                fx.material.opacity = d.baseOpacity * k * k;
            } else if (d.type === 'blastBall') {
                const prog = 1 - k;
                fx.scale.setScalar(0.3 + prog * (d.R || ROCKET_RADIUS) * 0.75);
                fx.material.opacity = d.baseOpacity * k * k;
            }
            if (d.life <= 0) {
                disposeWeaponFx(fx);
                weaponFx.splice(i, 1);
            }
        }
    }

    // פגיעת פלזמה: טבעת תכולה + הבזק לבן-כחול
    function spawnPlasmaImpact(x, y) {
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.88, 1.0, 32),
            new THREE.MeshBasicMaterial({ color: 0x3fb8ff, transparent: true, opacity: 0.85, depthWrite: false, depthTest: false, blending: THREE.NormalBlending, side: THREE.DoubleSide })
        );
        ring.position.set(x, y, 0.5);
        ring.renderOrder = 20;
        ring.userData = { type: 'plasmaRing', life: 12, maxLife: 12, baseOpacity: 0.85 };
        scene.add(ring);
        weaponFx.push(ring);

        const flash = new THREE.Mesh(
            new THREE.SphereGeometry(1, 12, 10),
            new THREE.MeshBasicMaterial({ color: 0x59d0ff, transparent: true, opacity: 0.55, depthWrite: false, depthTest: false, blending: THREE.NormalBlending })
        );
        flash.position.set(x, y, 0.5);
        flash.renderOrder = 21;
        flash.userData = { type: 'plasmaFlash', life: 8, maxLife: 8, baseOpacity: 0.55 };
        scene.add(flash);
        weaponFx.push(flash);

        spawnImpactBurst(x, y, 0, 0x9fe6ff);
    }

    function explodeRocket(x, y, opts) {
        const o = opts || {};
        const R = ROCKET_RADIUS * rocketRadiusMult() * (o.rScale || 1);
        const dmgMul = starDmgMult('rocket') * (o.dScale || 1);
        spawnBlastFx(x, y, R);
        playSound('hit');
        rocks.slice().forEach(r => {
            const d = Math.hypot(r.position.x - x, r.position.y - y);
            const reach = R + r.userData.size * 0.6;
            if (d < reach) {
                const falloff = 1 - 0.5 * Math.min(1, d / reach);   // 100% במרכז, 50% בקצה
                damageRock(r, firePower * ROCKET_DAMAGE * dmgMul * falloff, true);
            }
        });
        // כוכב 5: פיצוצים קטנים סביב הפיצוץ הראשי
        if (!o.noCluster && getStars('rocket') >= 5) {
            for (let i = 0; i < 4; i++) {
                const ang = (i / 4) * Math.PI * 2 + 0.6;
                delayedBlasts.push({ t: 7 + i * 3, x: x + Math.cos(ang) * R * 0.85, y: y + Math.sin(ang) * R * 0.85, rScale: 0.5, dScale: 0.45 });
            }
        }
    }

    function chainLightning(startRock, hitX, hitY) {
        const visited = new Set();
        let target = startRock;
        let prevX = hitX, prevY = hitY;
        // הנזק נספר בכל פגיעה, אבל הציור (ברקים + הבזק) רק כל ~100ms לכל סלע - אחרת המסך מתמלא וכבד
        const nowMs = performance.now();
        const drawFx = !startRock.userData.lastChainFx || nowMs - startRock.userData.lastChainFx > 100;
        if (drawFx) startRock.userData.lastChainFx = nowMs;
        const maxJumps = LIGHTNING_JUMPS + lightningExtraJumps();
        for (let jump = 0; jump <= maxJumps; jump++) {
            if (!target || !rocks.includes(target)) break;
            visited.add(target);
            const tx = target.position.x, ty = target.position.y;
            if (drawFx) {
                if (jump === 0) spawnPlasmaImpact(tx, ty);
                spawnBolt(prevX, prevY, tx, ty);
            }

            // הסלע הקרוב הבא (לפני שהפגיעה הנוכחית עלולה למחוק את הסלע)
            let best = null, bestD = LIGHTNING_RANGE;
            rocks.forEach(o => {
                if (visited.has(o)) return;
                const d = Math.hypot(o.position.x - tx, o.position.y - ty);
                if (d < bestD) { bestD = d; best = o; }
            });

            damageRock(target, firePower * LIGHTNING_DAMAGE * starDmgMult('lightning') * Math.pow(LIGHTNING_FALLOFF, jump), true);
            prevX = tx; prevY = ty;
            target = best;
        }
    }

    function processWeaponHits() {
        for (let i = delayedBlasts.length - 1; i >= 0; i--) {
            const d = delayedBlasts[i];
            d.t -= 1;
            if (d.t <= 0) {
                delayedBlasts.splice(i, 1);
                explodeRocket(d.x, d.y, { rScale: d.rScale, dScale: d.dScale, noCluster: true });
            }
        }
        if (!pendingWeaponHits.length) return;
        const hits = pendingWeaponHits.splice(0);
        let blasts = 0;
        hits.forEach(h => {
            if (h.type === 'rocket') {
                explodeRocket(h.x, h.y);
                blasts++;
            } else if (h.type === 'lightning') {
                chainLightning(h.rock, h.x, h.y);
            }
        });
        if (blasts) cannonRecoil = Math.max(cannonRecoil, 0.03);
    }

    // ---- לייזר: שתי קרני אור רציפות מהקנים, חודרות דרך כל הסלעים שבקו ----
    function ensureLaserBeams() {
        if (laserBeams.length) return;
        for (let i = 0; i < 2; i++) {
            const g = new THREE.Group();
            const mk = (rad, color, op) => {
                const m = new THREE.Mesh(
                    new THREE.CylinderGeometry(rad, rad, 1, 10),
                    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })
                );
                m.renderOrder = 18;
                return m;
            };
            const outer = mk(0.36, 0x1f9bff, 0.14);
            const glow = mk(0.20, 0x5fd3ff, 0.35);
            const core = mk(0.07, 0xffffff, 0.95);
            g.add(outer, glow, core);
            g.userData = { outer, glow, core };
            g.visible = false;
            scene.add(g);
            laserBeams.push(g);
        }
    }

    function hideLaser() {
        laserBeams.forEach(g => { g.visible = false; });
    }

    function updateLaser(time, xs, y0) {
        ensureLaserBeams();
        const len = Math.max(1, LASER_TOP_Y - y0);
        laserBeams.forEach((g, i) => {
            g.visible = true;
            g.position.set(xs[i], y0 + len / 2, 0.4);
            const flick = 1 + 0.12 * Math.sin(time * 0.045 + i * 1.7);
            g.userData.outer.scale.set(flick * 1.1, len, flick * 1.1);
            g.userData.glow.scale.set(flick, len, flick);
            g.userData.core.scale.set(1, len, 1);
        });

        const tickMs = 1000 / (LASER_TICKS_PER_SEC * fireRate);
        if (time - lastLaserTick < tickMs) return;
        lastLaserTick = time;
        cannonRecoil = Math.max(cannonRecoil, 0.04);

        let hitAny = false;
        rocks.slice().forEach(r => {
            if (r.position.y < y0 - r.userData.size * 0.4) return;
            xs.forEach(bx => {
                if (!rocks.includes(r)) return;
                if (Math.abs(r.position.x - bx) < r.userData.size * 0.85 + 0.1) {
                    damageRock(r, firePower * LASER_DAMAGE, true);
                    hitAny = true;
                }
            });
        });
        if (hitAny) playSound('hit');
    }

    // ---- לייזר: יריות בלסטר קצרות כמו במלחמת הכוכבים (במקום קרניים רציפות) ----
    // כל ירייה היא "גלולה" זוהרת שטסה למעלה ועוברת דרך כל הסלעים (פעם אחת לכל סלע).
    const LASER_BOLT_COLOR = 0xff0808;   // גוף אדום טהור וברור
    const LASER_BOLT_CORE = 0xff3030;    // ליבה אדומה בוהקת — ללא גוון לבן
    const LASER_BOLT_SPEED = 0.95;       // מהירה בהרבה מקליע רגיל (0.42)
    const LASER_BOLT_DAMAGE = 0.75;      // x כוח ירי לכל סלע שהירייה חודרת
    const laserBolts = [];
    let laserBoltShared = null;
    let lastLaserHitSnd = 0;

    function getLaserBoltShared() {
        if (laserBoltShared) return laserBoltShared;
        const mat = (color, op) => new THREE.MeshBasicMaterial({
            color, transparent: true, opacity: op, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
        });
        laserBoltShared = {
            geo: new THREE.SphereGeometry(1, 14, 10),
            outer: mat(0xff0018, 0.34),
            mid: mat(LASER_BOLT_COLOR, 0.90),
            core: mat(LASER_BOLT_CORE, 1.0)
        };
        return laserBoltShared;
    }

    function spawnLaserBolt(x, y) {
        const sh = getLaserBoltShared();
        const g = new THREE.Group();
        const layer = (material, sx, sy) => {
            const m = new THREE.Mesh(sh.geo, material);
            m.scale.set(sx, sy, sx);
            m.renderOrder = 19;
            g.add(m);
        };
        layer(sh.outer, 0.36, 1.24);   // הילה רחבה ומוארכת
        layer(sh.mid, 0.19, 1.02);     // גוף אדום צפוף
        layer(sh.core, 0.075, 0.78);   // ליבה לבנה חמה
        g.position.set(x, y + 0.5, 0.4);
        g.userData = { hit: new Set() };
        scene.add(g);
        laserBolts.push(g);
    }

    function updateLaserBolts(time) {
        for (let i = laserBolts.length - 1; i >= 0; i--) {
            const b = laserBolts[i];
            const y0 = b.position.y;
            b.position.y += LASER_BOLT_SPEED;
            const y1 = b.position.y;
            const hit = b.userData.hit;
            let hitSomething = false;
            for (let k = rocks.length - 1; k >= 0; k--) {
                const r = rocks[k];
                if (!r || hit.has(r)) continue;
                const sz = r.userData.size;
                if (Math.abs(r.position.x - b.position.x) > (sz * 0.85 + 0.08) * laserWidthMult()) continue;
                if (r.position.y < y0 - sz * 0.6 || r.position.y > y1 + sz * 0.6) continue;
                hit.add(r);
                damageRock(r, firePower * LASER_BOLT_DAMAGE * starDmgMult('laser'), true);
                hitSomething = true;
            }
            if (hitSomething && time - lastLaserHitSnd > 70) {
                lastLaserHitSnd = time;
                playSound('hit');
            }
            if (b.position.y > LASER_TOP_Y + 1) {
                scene.remove(b);
                laserBolts.splice(i, 1);
            }
        }
    }

    function clearLaserBolts() {
        laserBolts.forEach(g => scene.remove(g));
        laserBolts.length = 0;
    }

    // ---- ברק: זרמי חשמל כחולים שיוצאים מהקנים (במקום כדורים) ----
    // כל קנה מצייר פס חשמל מחוספס שעובר דרך הקליעים שלו, ולכן הוא נשבר ונעקם יחד עם תנועת התותח
    // ונעצר בסלע שנפגע. מרכז לבן, זוהר כחול סביבו, והבהוב מחדש בכל פריים.
    const STREAM_MAX_PTS = 600;     // נקודות לכל פס (חיץ קבוע, בלי הקצאות בכל פריים)
    const STREAM_GAP = 2.6;         // קליעים קרובים מזה מתחברים לזרם אחד
    const STREAM_TAIL = 1.7;        // אורך הזרם מאחורי קליע בודד (קצב אש נמוך)
    const STREAM_STEP = 0.42;       // אורך מקטע ברק
    const STREAM_JITTER = 0.26;     // עוצמת ההתעקמות הצידה
    const lightningStreams = [];    // לכל קנה: { layers: [3 ריבונים] }
    let streamMuzzleXs = null, streamMuzzleY = 0;

    function createStreamRibbon(width, color, opacity) {
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(STREAM_MAX_PTS * 2 * 3);
        const idx = new Uint16Array(STREAM_MAX_PTS * 6);
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
        geo.setIndex(new THREE.BufferAttribute(idx, 1).setUsage(THREE.DynamicDrawUsage));
        geo.setDrawRange(0, 0);
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
            color, transparent: true, opacity, depthWrite: false, depthTest: false,
            blending: THREE.AdditiveBlending, side: THREE.DoubleSide
        }));
        mesh.renderOrder = 21;
        mesh.frustumCulled = false;
        mesh.visible = false;
        mesh.userData = { width, pos, idx, geo, baseOpacity: opacity };
        scene.add(mesh);
        return mesh;
    }

    function ensureLightningStream(i) {
        while (lightningStreams.length <= i) {
            lightningStreams.push({
                layers: [
                    createStreamRibbon(0.52, 0x1f6bff, 0.20),   // זוהר חיצוני
                    createStreamRibbon(0.24, 0x59b8ff, 0.55),   // גוף כחול
                    createStreamRibbon(0.09, 0xffffff, 1.0)     // ליבה לבנה
                ]
            });
        }
        return lightningStreams[i];
    }

    function fillStreamRibbon(mesh, strands) {
        const u = mesh.userData;
        let vi = 0, ii = 0;
        for (let s = 0; s < strands.length; s++) {
            const pts = strands[s];
            const n = pts.length;
            if (n < 2) continue;
            if (vi + n > STREAM_MAX_PTS) break;
            for (let i = 0; i < n; i++) {
                const a = pts[i > 0 ? i - 1 : 0], b = pts[i < n - 1 ? i + 1 : n - 1];
                let dx = b[0] - a[0], dy = b[1] - a[1];
                const l = Math.hypot(dx, dy) || 1;
                dx /= l; dy /= l;
                const nx = -dy, ny = dx;
                const hw = u.width * 0.5 * pts[i][2];
                const o = (vi + i) * 6;
                u.pos[o] = pts[i][0] + nx * hw; u.pos[o + 1] = pts[i][1] + ny * hw; u.pos[o + 2] = 0.45;
                u.pos[o + 3] = pts[i][0] - nx * hw; u.pos[o + 4] = pts[i][1] - ny * hw; u.pos[o + 5] = 0.45;
                if (i < n - 1) {
                    const k = (vi + i) * 2;
                    u.idx[ii] = k; u.idx[ii + 1] = k + 1; u.idx[ii + 2] = k + 2;
                    u.idx[ii + 3] = k + 1; u.idx[ii + 4] = k + 3; u.idx[ii + 5] = k + 2;
                    ii += 6;
                }
            }
            vi += n;
        }
        u.geo.attributes.position.needsUpdate = true;
        u.geo.index.needsUpdate = true;
        u.geo.setDrawRange(0, ii);
        mesh.visible = ii > 0;
        mesh.material.opacity = u.baseOpacity * (0.78 + Math.random() * 0.22);
    }

    // נקודות עוגן -> קו חשמל מחוספס (מקטעים קצרים עם סטייה אקראית לצדדים)
    function electrifyStrand(anchors) {
        const out = [];
        for (let i = 0; i < anchors.length - 1; i++) {
            const x1 = anchors[i][0], y1 = anchors[i][1], x2 = anchors[i + 1][0], y2 = anchors[i + 1][1];
            const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
            const px = -dy / len, py = dx / len;
            const k = Math.max(1, Math.round(len / STREAM_STEP));
            for (let j = 0; j < k; j++) {
                const t = j / k;
                const jit = (i === 0 && j === 0) ? 0 : (Math.random() - 0.5) * STREAM_JITTER;
                out.push([x1 + dx * t + px * jit, y1 + dy * t + py * jit, 1]);
            }
        }
        const last = anchors[anchors.length - 1];
        out.push([last[0], last[1], 1]);
        out[0][2] = 0.55;
        out[out.length - 1][2] = 0.3;
        return out;
    }

    function updateLightningStreams() {
        // איסוף קליעי הברק לפי קנה
        const perBarrel = [];
        for (let i = 0; i < bullets.length; i++) {
            const d = bullets[i].userData;
            if (d && d.weapon === 'lightning') {
                (perBarrel[d.stream] || (perBarrel[d.stream] = [])).push(bullets[i]);
            }
        }
        const count = Math.max(perBarrel.length, lightningStreams.length);
        for (let si = 0; si < count; si++) {
            const list = perBarrel[si];
            if (!list || !list.length) {
                if (lightningStreams[si]) lightningStreams[si].layers.forEach(m => { m.visible = false; });
                continue;
            }
            const stream = ensureLightningStream(si);
            list.sort((a, b) => a.position.y - b.position.y);
            const mx = streamMuzzleXs ? streamMuzzleXs[si] : list[0].position.x;
            const my = streamMuzzleY;

            // עוגנים: מהקנה דרך הקליעים. קליעים רחוקים נפרדים לפסים נפרדים עם זנב קצר.
            const strands = [];
            let cur = null, lastY = 0;
            for (let i = 0; i < list.length; i++) {
                const x = list[i].position.x, y = list[i].position.y;
                const isLast = i === list.length - 1;
                if (!cur) {
                    cur = (streamMuzzleXs && y - my <= STREAM_GAP) ? [[mx, my]] : [[x, y - STREAM_TAIL]];
                    lastY = cur[0][1];
                } else if (y - lastY > STREAM_GAP) {
                    strands.push(cur);
                    cur = [[x, y - STREAM_TAIL]];
                    lastY = cur[0][1];
                }
                if (y - lastY >= 0.3 || isLast) {
                    cur.push([x, y]);
                    lastY = y;
                }
            }
            if (cur) strands.push(cur);

            const dense = [];
            for (let s = 0; s < strands.length; s++) {
                if (strands[s].length >= 2) dense.push(electrifyStrand(strands[s]));
            }
            // ענפי ברק קצרים שקופצים הצידה
            if (dense.length && Math.random() < 0.4) {
                const base = dense[Math.floor(Math.random() * dense.length)];
                const p = base[1 + Math.floor(Math.random() * (base.length - 1))];
                const ang = Math.PI / 2 + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.8);
                const fl = 0.5 + Math.random() * 0.7;
                const ex = p[0] + Math.cos(ang) * fl, ey = p[1] + Math.sin(ang) * fl;
                dense.push([[p[0], p[1], 0.9],
                            [(p[0] + ex) / 2 + (Math.random() - 0.5) * 0.2, (p[1] + ey) / 2 + (Math.random() - 0.5) * 0.2, 0.7],
                            [ex, ey, 0.25]]);
            }
            stream.layers.forEach(m => fillStreamRibbon(m, dense));
        }
    }

    // ==========================================
    // כדורי פלזמה (נשק הברק): כדור זוהר עם "ורידי" חשמל שזורמים בתוכו, הילה, זנב,
    // וקשתות חשמל קטנות שקופצות סביבו. בריכה קבועה של כדורים - בלי הקצאות בכל פריים.
    // ==========================================
    const PLASMA_ORB_GAP = 2.2;       // מרווח בין כדורים נראים באותו קנה (יחידות עולם)
    const PLASMA_MAX = 24;            // מקסימום כדורים נראים בבת אחת
    const PLASMA_ARCS = 3;            // קשתות חשמל לכל כדור
    const plasmaUniforms = { uTime: { value: 0 } };
    const lightningSeq = [0, 0];
    let lightningOrbEvery = 1;
    const plasmaPool = [];
    let plasmaLayers = null;
    let plasmaAssets = null;

    function ensurePlasmaAssets() {
        if (plasmaAssets) return plasmaAssets;

        const glowCanvas = document.createElement('canvas');
        glowCanvas.width = glowCanvas.height = 128;
        const gx = glowCanvas.getContext('2d');
        const gg = gx.createRadialGradient(64, 64, 0, 64, 64, 64);
        gg.addColorStop(0.00, 'rgba(255,255,255,1)');
        gg.addColorStop(0.10, 'rgba(215,248,255,0.95)');
        gg.addColorStop(0.28, 'rgba(110,205,255,0.55)');
        gg.addColorStop(0.55, 'rgba(70,110,255,0.20)');
        gg.addColorStop(1.00, 'rgba(40,30,200,0)');
        gx.fillStyle = gg;
        gx.fillRect(0, 0, 128, 128);

        const tailCanvas = document.createElement('canvas');
        tailCanvas.width = 32;
        tailCanvas.height = 128;
        const tx = tailCanvas.getContext('2d');
        const tg = tx.createLinearGradient(0, 0, 0, 128);
        tg.addColorStop(0.0, 'rgba(150,235,255,0.85)');
        tg.addColorStop(0.35, 'rgba(70,140,255,0.38)');
        tg.addColorStop(1.0, 'rgba(60,40,220,0)');
        tx.fillStyle = tg;
        tx.fillRect(0, 0, 32, 128);
        // מרכז חזק יותר בציר האנכי (זנב מחודד)
        const tmask = tx.createLinearGradient(0, 0, 32, 0);
        tmask.addColorStop(0.0, 'rgba(0,0,0,1)');
        tmask.addColorStop(0.5, 'rgba(0,0,0,0)');
        tmask.addColorStop(1.0, 'rgba(0,0,0,1)');
        tx.globalCompositeOperation = 'destination-out';
        tx.fillStyle = tmask;
        tx.globalAlpha = 0.9;
        tx.fillRect(0, 0, 32, 128);

        const mat = new THREE.ShaderMaterial({
            uniforms: plasmaUniforms,
            transparent: true,
            depthWrite: false,
            depthTest: false,
            blending: THREE.AdditiveBlending,
            vertexShader: [
                'varying vec3 vPos;',
                'varying vec3 vN;',
                'varying vec3 vV;',
                'void main() {',
                '  vPos = position;',
                '  vN = normalize(normalMatrix * normal);',
                '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
                '  vV = normalize(-mv.xyz);',
                '  gl_Position = projectionMatrix * mv;',
                '}'
            ].join('\n'),
            fragmentShader: [
                'precision highp float;',
                'uniform float uTime;',
                'varying vec3 vPos;',
                'varying vec3 vN;',
                'varying vec3 vV;',
                'float hash(vec3 p) {',
                '  p = fract(p * 0.3183099 + 0.1);',
                '  p *= 17.0;',
                '  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));',
                '}',
                'float noise(vec3 x) {',
                '  vec3 i = floor(x);',
                '  vec3 f = fract(x);',
                '  f = f * f * (3.0 - 2.0 * f);',
                '  return mix(mix(mix(hash(i + vec3(0.,0.,0.)), hash(i + vec3(1.,0.,0.)), f.x),',
                '                 mix(hash(i + vec3(0.,1.,0.)), hash(i + vec3(1.,1.,0.)), f.x), f.y),',
                '             mix(mix(hash(i + vec3(0.,0.,1.)), hash(i + vec3(1.,0.,1.)), f.x),',
                '                 mix(hash(i + vec3(0.,1.,1.)), hash(i + vec3(1.,1.,1.)), f.x), f.y), f.z);',
                '}',
                'float fbm(vec3 p) {',
                '  float a = 0.5, v = 0.0;',
                '  for (int i = 0; i < 3; i++) { v += a * noise(p); p *= 2.07; a *= 0.5; }',
                '  return v;',
                '}',
                'void main() {',
                '  vec3 p = vPos * 7.0;',
                '  float n1 = fbm(p + vec3(0.0, uTime * 1.9, uTime * 0.8));',
                '  float n2 = fbm(p * 1.7 - vec3(uTime * 1.2, 0.0, uTime * 1.5));',
                '  float v1 = pow(clamp(1.0 - abs(n1 - 0.5) * 2.4, 0.0, 1.0), 5.0);',
                '  float v2 = pow(clamp(1.0 - abs(n2 - 0.5) * 2.4, 0.0, 1.0), 6.0);',
                '  float facing = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);',
                '  float rim = pow(1.0 - facing, 2.2);',
                '  vec3 base = mix(vec3(0.10, 0.16, 0.95), vec3(0.20, 0.72, 1.0), n2);',
                '  vec3 col = base * 0.95;',
                '  col += vec3(0.80, 0.96, 1.0) * (v1 * 1.4 + v2 * 0.9);',
                '  col += vec3(0.45, 0.35, 1.0) * rim * 1.3;',
                '  col += vec3(0.95, 1.0, 1.0) * pow(facing, 3.0) * 0.8;',
                '  float a = clamp(0.80 + rim * 0.35 + v1 * 0.5, 0.0, 1.0);',
                '  gl_FragColor = vec4(col, a);',
                '}'
            ].join('\n')
        });

        plasmaAssets = {
            glowTex: new THREE.CanvasTexture(glowCanvas),
            tailTex: new THREE.CanvasTexture(tailCanvas),
            sphereGeo: new THREE.SphereGeometry(0.30, 22, 16),
            tailGeo: new THREE.PlaneGeometry(0.50, 2.0),
            sphereMat: mat
        };
        plasmaAssets.glowTex.encoding = THREE.sRGBEncoding;
        plasmaAssets.tailTex.encoding = THREE.sRGBEncoding;
        return plasmaAssets;
    }

    function createPlasmaOrb() {
        const A = ensurePlasmaAssets();
        const g = new THREE.Group();

        const tail = new THREE.Mesh(A.tailGeo, new THREE.MeshBasicMaterial({
            map: A.tailTex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
        }));
        tail.position.y = -1.15;
        tail.renderOrder = 20;

        const glow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: A.glowTex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
        }));
        glow.scale.set(1.9, 1.9, 1);
        glow.renderOrder = 21;

        const sphere = new THREE.Mesh(A.sphereGeo, A.sphereMat);
        sphere.renderOrder = 22;

        g.add(tail, glow, sphere);
        g.userData = {
            sphere, glow,
            seed: Math.random() * 100,
            arcs: Array.from({ length: PLASMA_ARCS }, () => ({ ang: 0, len: 0.6, j: [0, 0, 0], age: 99 }))
        };
        g.visible = false;
        scene.add(g);
        return g;
    }

    function ensurePlasmaLayers() {
        if (plasmaLayers) return plasmaLayers;
        plasmaLayers = [
            createStreamRibbon(0.20, 0x4a5cff, 0.32),   // הילה סגולה-כחולה
            createStreamRibbon(0.085, 0x8fe9ff, 0.80),  // גוף תכלת
            createStreamRibbon(0.032, 0xffffff, 1.0)    // ליבה לבנה דקה
        ];
        return plasmaLayers;
    }

    function updatePlasmaOrbs(time) {
        ensurePlasmaAssets();
        plasmaUniforms.uTime.value = time * 0.001;

        let n = 0;
        const strands = [];
        for (let i = 0; i < bullets.length && n < PLASMA_MAX; i++) {
            const b = bullets[i];
            const d = b.userData;
            if (!d || !d.orb) continue;

            const orb = plasmaPool[n] || (plasmaPool[n] = createPlasmaOrb());
            const od = orb.userData;
            orb.visible = true;
            orb.position.set(b.position.x, b.position.y, 0.3);
            const pulse = 1 + 0.10 * Math.sin(time * 0.022 + od.seed);
            orb.scale.setScalar(pulse);
            od.sphere.rotation.x += 0.06;
            od.sphere.rotation.y += 0.09;
            od.glow.material.opacity = 0.85 + 0.15 * Math.sin(time * 0.05 + od.seed * 2);

            // קשתות חשמל סביב הכדור: מתחדשות בערך כל 3 פריימים, ועוקבות אחרי הכדור בכל פריים.
            for (let a = 0; a < od.arcs.length; a++) {
                const arc = od.arcs[a];
                if (arc.age++ >= 3) {
                    arc.age = 0;
                    arc.ang = Math.random() * Math.PI * 2;
                    arc.len = Math.random() < 0.35 ? 0.95 + Math.random() * 0.35 : 0.55 + Math.random() * 0.3;
                    for (let k = 0; k < 3; k++) arc.j[k] = (Math.random() - 0.5) * 0.22;
                }
                const cx = Math.cos(arc.ang), cy = Math.sin(arc.ang);
                const px = -cy, py = cx;
                const bx = b.position.x, by = b.position.y;
                const r0 = 0.20;
                const pts = [];
                for (let k = 0; k <= 4; k++) {
                    const t = k / 4;
                    const r = r0 + (arc.len - r0) * t;
                    const jit = (k === 0 || k === 4) ? 0 : arc.j[k - 1];
                    pts.push([bx + cx * r + px * jit, by + cy * r + py * jit, k === 4 ? 0.25 : (k === 0 ? 0.7 : 1)]);
                }
                strands.push(pts);
            }
            n++;
        }
        for (let k = n; k < plasmaPool.length; k++) plasmaPool[k].visible = false;

        const layers = ensurePlasmaLayers();
        if (strands.length) layers.forEach(m => fillStreamRibbon(m, strands));
        else layers.forEach(m => { m.visible = false; });
    }

    function hidePlasma() {
        plasmaPool.forEach(o => { o.visible = false; });
        if (plasmaLayers) plasmaLayers.forEach(m => { m.visible = false; });
    }

    function hideLightningStreams() {
        lightningStreams.forEach(st => st.layers.forEach(m => { m.visible = false; }));
        hidePlasma();
    }

    // ניקוי בתחילת/סוף ריצה
    function clearWeaponState() {
        hideLightningStreams();
        clearLaserBolts();
        pendingWeaponHits.length = 0;
        delayedBlasts.length = 0;
        weaponFx.forEach(disposeWeaponFx);
        weaponFx.length = 0;
        hideLaser();
    }

    // ==========================================
    // סלעים: צורה מסותתת + צבע לפי כמות החיים
    // ==========================================
    // צבע הסלע מראה כמה הוא "כבד": חול -> חום -> חלודה -> סלע געשי כהה.
    // כשסלע מתפצל, הצאצאים (עם חצי חיים) נעשים בהירים יותר, כך שרואים את הדרגה בלי לקרוא מספרים.
    const ROCK_TIERS = [
        { max: 24,       bottom: [0.20, 0.17, 0.14], top: [0.54, 0.47, 0.38], emissive: 0x24190f },  // חול
        { max: 60,       bottom: [0.17, 0.12, 0.09], top: [0.46, 0.34, 0.25], emissive: 0x2a160b },  // חום
        { max: 120,      bottom: [0.14, 0.08, 0.06], top: [0.48, 0.25, 0.17], emissive: 0x34140a },  // חלודה
        { max: Infinity, bottom: [0.07, 0.06, 0.07], top: [0.30, 0.22, 0.24], emissive: 0x3a1208 }   // געשי
    ];
    const ROCK_FLASH_COLOR = new THREE.Color(0xd9a15a);

    function getRockTier(hp) {
        for (let i = 0; i < ROCK_TIERS.length; i++) {
            if (hp <= ROCK_TIERS[i].max) return ROCK_TIERS[i];
        }
        return ROCK_TIERS[ROCK_TIERS.length - 1];
    }

    // גוף סלע סגור (בלי קרעים). ההסטה תלויה רק בכיוון הנקודה, ולכן נקודות זהות זזות יחד.
    // 1) גיבשושיות רחבות + חספוס עדין  2) 5-7 "חיתוכים" שטוחים שנותנים מראה של סלע מסותת
    // 3) צבע לכל פאה בנפרד: בהיר בראש ובפאות שפונות למעלה, כהה בסדקים ובבסיס, עם שונות אקראית.
    function createIrregularRockGeometry(size, hp = 0) {
        const geo = new THREE.IcosahedronGeometry(1, 2).toNonIndexed();
        const position = geo.attributes.position;
        const ph = Array.from({ length: 8 }, () => Math.random() * Math.PI * 2);
        const sx = 1.05 + (Math.random() - 0.5) * 0.12;
        const sy = 0.92 + (Math.random() - 0.5) * 0.10;
        const sz = 1.00 + (Math.random() - 0.5) * 0.12;

        // מישורי חיתוך אקראיים
        const planes = [];
        const planeCount = 5 + Math.floor(Math.random() * 3);
        for (let k = 0; k < planeCount; k++) {
            const n = new THREE.Vector3(
                Math.random() * 2 - 1,
                Math.random() * 2 - 1,
                Math.random() * 2 - 1
            ).normalize();
            planes.push({ n, d: 0.78 + Math.random() * 0.14 });
        }

        const p = new THREE.Vector3();
        const FIT = 1.03;   // מפצה על החיתוכים, כדי שהגודל הנראה יישאר קרוב לאזור ההתנגשות

        for (let i = 0; i < position.count; i++) {
            const dx = position.getX(i);
            const dy = position.getY(i);
            const dz = position.getZ(i);
            const len = Math.hypot(dx, dy, dz) || 1;
            const nx = dx / len, ny = dy / len, nz = dz / len;

            const bumps =
                Math.sin(nx * 2.1 + ph[0]) * Math.cos(ny * 1.9 + ph[1]) * 0.55 +
                Math.sin(ny * 3.7 + nz * 3.1 + ph[2]) * 0.30 +
                Math.sin(nz * 6.3 + nx * 5.7 + ph[3]) * 0.15;
            const fine = Math.sin(nx * 11 + ph[4]) * Math.sin(ny * 9 + ph[5]) * Math.sin(nz * 10 + ph[6]);
            const r = 1 + 0.15 * bumps + 0.04 * fine;

            p.set(nx * r, ny * r, nz * r);
            for (let k = 0; k < planes.length; k++) {
                const over = p.dot(planes[k].n) - planes[k].d;
                if (over > 0) p.addScaledVector(planes[k].n, -over);
            }

            position.setXYZ(i, p.x * size * sx * FIT, p.y * size * sy * FIT, p.z * size * sz * FIT);
        }

        geo.computeVertexNormals();   // גיאומטריה לא-אינדקסית: נורמל שטוח לכל פאה
        const normal = geo.attributes.normal;

        const tier = getRockTier(hp);
        const bottom = new THREE.Color(tier.bottom[0], tier.bottom[1], tier.bottom[2]);
        const top = new THREE.Color(tier.top[0], tier.top[1], tier.top[2]);
        const tmp = new THREE.Color();
        const colors = [];

        for (let i = 0; i < position.count; i += 3) {
            const cx = (position.getX(i) + position.getX(i + 1) + position.getX(i + 2)) / 3;
            const cy = (position.getY(i) + position.getY(i + 1) + position.getY(i + 2)) / 3;
            const cz = (position.getZ(i) + position.getZ(i + 1) + position.getZ(i + 2)) / 3;

            const height = THREE.MathUtils.smoothstep((cy / (size * sy)) * 0.5 + 0.5, 0.10, 0.95);
            const facingUp = normal.getY(i) * 0.5 + 0.5;
            const radial = Math.hypot(cx / sx, cy / sy, cz / sz) / size;          // ~0.8 בסדקים, ~1.1 בבליטות
            const proud = THREE.MathUtils.clamp((radial - 0.82) / 0.25, 0, 1);
            const jitter = 0.88 + Math.random() * 0.24;

            tmp.copy(bottom).lerp(top, 0.55 * height + 0.45 * facingUp);
            tmp.multiplyScalar(jitter * (0.78 + 0.30 * proud));
            for (let v = 0; v < 3; v++) colors.push(tmp.r, tmp.g, tmp.b);
        }

        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        return geo;
    }

    function getRockColor() {
        return 0xffffff; // הצבע האמיתי מגיע מצבעי הקודקודים בגיאומטריה
    }

    // צל מגע דינמי לסלעים.
    function createRockContactShadow(rockSize) {
        const shadow = new THREE.Mesh(
            new THREE.CircleGeometry(1.0, 20),
            new THREE.MeshBasicMaterial({
                color: 0x111827,
                transparent: true,
                opacity: 0.18,
                depthWrite: false
            })
        );

        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = 0.012;
        shadow.scale.set(
            rockSize * 0.90,
            rockSize * 0.42,
            1
        );

        scene.add(shadow);
        return shadow;
    }

    // מספר החיים על הסלע: לבן עם קו מתאר כהה כדי שיהיה קריא על כל רקע.
    function drawRockLabel(ctx, hp) {
        ctx.clearRect(0, 0, 128, 128);
        ctx.font = 'Bold 62px Rubik, Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 9;
        ctx.strokeStyle = 'rgba(20,12,6,0.9)';
        ctx.strokeText(hp, 64, 66);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(hp, 64, 66);
    }

    // ==========================================
    // פיזיקת סלעים בסגנון Ball Blast (משחק ההשראה)
    // ==========================================
    // מה נמדד בסרטון של משחק ההשראה:
    //  - הסלעים נכנסים מצד המסך בגובה קבוע (בלי ליפול), ורק אחרי שנכנסו מתחילה הכבידה.
    //  - כל קפיצה מהקרקע מגיעה לאותו גובה בדיוק (בלי איבוד אנרגיה); סלע גדול קופץ גבוה יותר מקטן.
    //  - המהירות האופקית קבועה, והסלעים מוחזרים מקירות המסך.
    //  - סלעים עוברים זה דרך זה (בלי התנגשות ביניהם).
    //  - סלע שנהרס מתפצל לשניים קטנים יותר שנפרדים לשני הצדדים ומקפצים.
    const ROCK_BOUNCE_FRAMES = 74;           // פריימים שלוקח לסלע הגדול לעלות מהקרקע לשיא (~1.2 שנ' ב-60fps). קטן = מהיר יותר
    const ROCK_SPEED_X = 0.040;              // מהירות אופקית קבועה לפריים (יחידות עולם)
    const ROCK_CHILD_SCALE = 0.66;           // גודל הסלעים שנוצרים מהפיצול ביחס להורה
    const ROCK_COLLIDE_EACH_OTHER = false;   // true = כמו קודם: סלעים דוחפים זה את זה
    // כמה מגובה המסך (מהקרקע) מגיע שיא הקפיצה של סלע בגודל נתון
    function rockApexFraction(size) {
        return THREE.MathUtils.clamp(0.26 + 0.22 * size, 0.36, 0.66);
    }
    // כבידה אחת לכל הסלעים (מותאמת לגובה המסך), ומהירות קפיצה קבועה לפי גודל הסלע
    function getRockPhysics(size) {
        const field = Math.max(8, getScreenTopWorldY() - 0.2);
        const bigRise = rockApexFraction(1.75) * field;
        const g = 2 * bigRise / (ROCK_BOUNCE_FRAMES * ROCK_BOUNCE_FRAMES);
        return { g, bounceVy: Math.sqrt(2 * g * rockApexFraction(size) * field) };
    }
    // פיצול סלע שנהרס לשניים: נוצרים באותה נקודה ונפרדים לשני הצדדים עם קפיצה קטנה כלפי מעלה
    function splitRockIntoChildren(r, data) {
        if (data.isBoss) return;     // הבוס לא מתפרק: הוא מוחלף בפרס
        if (data.size <= 0.9) return;
        const childHp = Math.max(1, Math.floor(data.maxHp / 2));
        const childSize = data.size * ROCK_CHILD_SCALE;
        const speed = data.speedX || ROCK_SPEED_X;
        spawnRock(r.position.x - 0.3, r.position.y, childHp, childSize, -speed, 0.09);
        spawnRock(r.position.x + 0.3, r.position.y, childHp, childSize, speed, 0.09);
    }

    function spawnRock(x, y, hp, size, launchVx = null, launchVy = null, entering = false) {
        const tier = getRockTier(hp);
        const geo = createIrregularRockGeometry(size, hp);
        const mat = new THREE.MeshStandardMaterial({
            color: getRockColor(),
            vertexColors: true,
            roughness: 0.95,
            metalness: 0.0,
            flatShading: true,
            // זוהר חם עדין: מונע מהצד המוצל (מול השקיעה) להפוך לשחור מלא.
            emissive: tier.emissive,
            emissiveIntensity: 0.5
        });

        const rock = new THREE.Mesh(geo, mat);
        rock.castShadow = true;
        rock.receiveShadow = true;
        rock.position.set(x, y, 0);
        rock.rotation.set(
            Math.random() * 0.6,
            Math.random() * 0.8,
            Math.random() * 0.6
        );

        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        drawRockLabel(ctx, hp);

        const texture = new THREE.CanvasTexture(canvas);
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;

        // המספר במרכז הסלע: בלי depthTest הוא תמיד מצויר מעל הסלע (קודם הוא נבלע בתוכו ולא נראה).
        const spriteMat = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false
        });
        const label = new THREE.Sprite(spriteMat);
        label.scale.set(size * 1.25, size * 1.25, 1);
        label.renderOrder = 20;
        label.position.y = 0.0;
        rock.add(label);

        const initVx = launchVx !== null ? launchVx : (Math.random() < 0.5 ? -1 : 1) * ROCK_SPEED_X;
        const phys = getRockPhysics(size);
        rock.userData = {
            hp,
            maxHp: hp,
            size,
            vx: initVx,
            vy: launchVy !== null ? launchVy : 0,
            speedX: Math.abs(initVx),                   // מהירות אופקית קבועה
            g: phys.g,                                  // כבידה
            bounceVy: phys.bounceVy,                    // מהירות הקפיצה מהקרקע (תמיד אותו גובה)
            entering,                                   // נכנס מצד המסך: בלי כבידה ובלי קיר עד שנכנס
            rotX: (Math.random() - 0.5) * 0.012,
            rotY: (Math.random() - 0.5) * 0.014,
            rotZ: 0,                                    // גלגול: מחושב כל פריים לפי המהירות האופקית
            ctx,
            texture,
            hitCooldown: 0,
            flash: 0,                                   // הבהוב קצר בפגיעת כדור (0..1)
            baseEmissive: new THREE.Color(tier.emissive)
        };

        rock.userData.contactShadow = createRockContactShadow(size);

        scene.add(rock);
        rocks.push(rock);
    }

    // ==========================================
    // התנגשות סלע-תותח: הסלע קופץ מהתותח במקום לעבור דרכו
    // ==========================================
    // התותח מורכב מצורות פשוטות (קפסולה לגוף+כיפה, עיגולים לגלגלים ולקנים).
    // הקואורדינטות בצד התותח (לפני CANNON_SCALE): x רוחב, y גובה מעל הקרקע.
    const CANNON_COLLIDERS = [
        { ax: -0.35, ay: 1.45, bx: 0.35, by: 1.45, r: 0.80 }, // גוף + כיפה
        { ax: -WHEEL_X, ay: WHEEL_Y, bx: -WHEEL_X, by: WHEEL_Y, r: 0.62 }, // גלגל שמאל
        { ax: WHEEL_X, ay: WHEEL_Y, bx: WHEEL_X, by: WHEEL_Y, r: 0.62 },   // גלגל ימין
        { ax: -0.37, ay: 2.55, bx: -0.37, by: 2.55, r: 0.20 }, // קנה שמאל
        { ax: 0.37, ay: 2.55, bx: 0.37, by: 2.55, r: 0.20 }    // קנה ימין
    ];

    // ==========================================
    // התנגשות סלע-סלע: הסלעים דוחפים זה את זה
    // ==========================================
    function resolveRockRockCollisions() {
        for (let i = 0; i < rocks.length - 1; i++) {
            const a = rocks[i];
            if (!a || !a.userData) continue;
            const ad = a.userData;
            const ar = ad.size * 0.95;

            for (let j = i + 1; j < rocks.length; j++) {
                const b = rocks[j];
                if (!b || !b.userData) continue;
                const bd = b.userData;
                if (ad.isBoss || bd.isBoss) continue;   // הבוס מרחף: לא מתנגש עם סלעים
                const br = bd.size * 0.95;

                let dx = b.position.x - a.position.x;
                let dy = b.position.y - a.position.y;
                let dist = Math.hypot(dx, dy);
                const minDist = ar + br;

                if (dist >= minDist) continue;

                // אם המרכזים כמעט חופפים, בוחרים כיוון יציב ולא נותנים להם להישאר תקועים.
                if (dist < 1e-4) {
                    const angle = (i * 1.73 + j * 2.41) % (Math.PI * 2);
                    dx = Math.cos(angle);
                    dy = Math.sin(angle);
                    dist = 1;
                }

                const nx = dx / dist;
                const ny = dy / dist;
                const overlap = minDist - dist;

                // מסת משוערת לפי שטח החתך. הסלע הגדול מזיז את הקטן יותר.
                const ma = Math.max(0.35, ar * ar);
                const mb = Math.max(0.35, br * br);
                const invA = 1 / ma;
                const invB = 1 / mb;
                const invSum = invA + invB;

                // קודם מפרידים אותם פיזית, כדי שלא יוכלו להישאר אחד בתוך השני.
                const correction = overlap + 0.008;
                a.position.x -= nx * correction * (invA / invSum);
                a.position.y -= ny * correction * (invA / invSum);
                b.position.x += nx * correction * (invB / invSum);
                b.position.y += ny * correction * (invB / invSum);

                // אחר כך מעבירים תנע לאורך קו ההתנגשות.
                const relVx = bd.vx - ad.vx;
                const relVy = bd.vy - ad.vy;
                const velAlongNormal = relVx * nx + relVy * ny;

                if (velAlongNormal < 0) {
                    const restitution = 0.72;
                    const impulse = -(1 + restitution) * velAlongNormal / invSum;
                    const ix = impulse * nx;
                    const iy = impulse * ny;

                    ad.vx -= ix * invA;
                    ad.vy -= iy * invA;
                    bd.vx += ix * invB;
                    bd.vy += iy * invB;
                }

                // דחיפה קטנה גם במפגש כמעט-סטטי, כדי למנוע "הדבקה".
                if (Math.abs(velAlongNormal) < 0.035) {
                    const separationImpulse = 0.035 / invSum;
                    const sx = separationImpulse * nx;
                    const sy = separationImpulse * ny;
                    ad.vx -= sx * invA;
                    ad.vy -= sy * invA;
                    bd.vx += sx * invB;
                    bd.vy += sy * invB;
                }

                // מעט סיבוב מהפגיעה כדי שההתנגשות תרגיש פיזית ולא כמו החלקה מושלמת.
                const tangent = -relVx * ny + relVy * nx;
                ad.rotZ = THREE.MathUtils.clamp(ad.rotZ - tangent * 0.002, -0.06, 0.06);
                bd.rotZ = THREE.MathUtils.clamp(bd.rotZ + tangent * 0.002, -0.06, 0.06);
            }
        }
    }

    // מחזיר את מהירות הפגיעה (0 אם לא הייתה פגיעה).
    function collideRockWithCannon(rock, cannonVx) {
        const data = rock.userData;
        const s = CANNON_SCALE;
        const cx = cannonGroup.position.x;
        const cy = cannonGroup.position.y;
        const rockR = data.size * 0.95;
        let impact = 0;

        for (const c of CANNON_COLLIDERS) {
            const ax = cx + c.ax * s, ay = cy + c.ay * s;
            const bx = cx + c.bx * s, by = cy + c.by * s;
            const abx = bx - ax, aby = by - ay;
            const len2 = abx * abx + aby * aby;

            let t = len2 > 1e-6
                ? ((rock.position.x - ax) * abx + (rock.position.y - ay) * aby) / len2
                : 0;
            t = THREE.MathUtils.clamp(t, 0, 1);

            let dx = rock.position.x - (ax + abx * t);
            let dy = rock.position.y - (ay + aby * t);
            let dist = Math.hypot(dx, dy);
            const minDist = rockR + c.r * s;
            if (dist >= minDist) continue;

            if (dist < 1e-4) { dx = 0; dy = 1; dist = 1; }
            const nx = dx / dist, ny = dy / dist;

            // דוחפים את הסלע החוצה כדי שלא יישאר בתוך התותח.
            const push = minDist - dist;
            rock.position.x += nx * push;
            rock.position.y += ny * push;

            // קפיצה: מחזירים את רכיב המהירות שלפני המשטח, ביחס לתותח הנע.
            const vn = (data.vx - cannonVx) * nx + data.vy * ny;
            if (vn < 0) {
                const e = 0.92;
                let j = -(1 + e) * vn;
                if (-e * vn < 0.14) j = 0.14 - vn; // תמיד קפיצה מורגשת, לא "נדבק"
                data.vx += j * nx;
                data.vy += j * ny;

                // נחיתה ישר על הראש: בועטים קצת הצידה כדי שלא יקפוץ אנכית לנצח.
                if (ny > 0.85 && Math.abs(nx) < 0.15) {
                    data.vx += (Math.random() - 0.5) * 0.05;
                }
                data.rotZ = THREE.MathUtils.clamp(data.rotZ - nx * 0.012, -0.05, 0.05);
                impact = Math.max(impact, -vn);
            }
        }
        return impact;
    }

    function spawnMuzzleFlash(x, y, z, color = 0xfff1a8) {
        const flash = new THREE.Mesh(
            new THREE.SphereGeometry(0.24, 8, 8),
            new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.95
            })
        );
        flash.position.set(x, y, z);
        flash.scale.set(0.75, 1.8, 0.75);
        flash.userData = {
            type: 'flash',
            life: 5,
            maxLife: 5,
            startScale: 1
        };
        scene.add(flash);
        effects.push(flash);
    }

    function spawnImpactBurst(x, y, z, color = 0xfde68a) {
        const count = 6;
        for (let i = 0; i < count; i++) {
            const particle = new THREE.Mesh(
                new THREE.TetrahedronGeometry(0.08 + Math.random() * 0.06, 0),
                new THREE.MeshBasicMaterial({
                    color,
                    transparent: true,
                    opacity: 1
                })
            );

            particle.position.set(
                x + (Math.random() - 0.5) * 0.16,
                y + (Math.random() - 0.5) * 0.16,
                z + (Math.random() - 0.5) * 0.12
            );

            particle.userData = {
                type: 'particle',
                life: 14 + Math.random() * 7,
                vx: (Math.random() - 0.5) * 0.16,
                vy: 0.04 + Math.random() * 0.12,
                vz: (Math.random() - 0.5) * 0.08,
                spin: (Math.random() - 0.5) * 0.2
            };

            scene.add(particle);
            effects.push(particle);
        }
    }

    function spawnDustBurst(x, y, z) {
        const count = 5;
        for (let i = 0; i < count; i++) {
            const dust = new THREE.Mesh(
                new THREE.SphereGeometry(0.10 + Math.random() * 0.08, 7, 7),
                new THREE.MeshBasicMaterial({
                    color: 0xd6b58a,
                    transparent: true,
                    opacity: 0.55
                })
            );

            dust.position.set(
                x + (Math.random() - 0.5) * 0.5,
                Math.max(0.3, y - 0.2 + Math.random() * 0.25),
                z + (Math.random() - 0.5) * 0.22
            );

            dust.userData = {
                type: 'dust',
                life: 16 + Math.random() * 10,
                vx: (Math.random() - 0.5) * 0.06,
                vy: 0.015 + Math.random() * 0.035,
                vz: (Math.random() - 0.5) * 0.035
            };

            scene.add(dust);
            effects.push(dust);
        }
    }

    function updateEffects() {
        for (let i = effects.length - 1; i >= 0; i--) {
            const fx = effects[i];
            const data = fx.userData;
            data.life -= 1;

            if (data.type === 'flash') {
                const progress = 1 - data.life / data.maxLife;
                const scale = 1 + progress * 1.4;
                fx.scale.set(0.75 * scale, 1.8 * scale, 0.75 * scale);
                fx.material.opacity = Math.max(0, data.life / data.maxLife);
            } else {
                fx.position.x += data.vx;
                fx.position.y += data.vy;
                fx.position.z += data.vz;
                data.vy -= 0.0025;
                if (data.spin) {
                    fx.rotation.x += data.spin;
                    fx.rotation.y += data.spin * 0.7;
                }
                fx.material.opacity = Math.max(0, data.life / 24);
                if (data.type === 'dust') fx.scale.multiplyScalar(1.015);
            }

            if (data.life <= 0) {
                scene.remove(fx);
                if (fx.geometry) fx.geometry.dispose();
                if (fx.material) fx.material.dispose();
                effects.splice(i, 1);
            }
        }

        // הגנה על מובייל: לא יותר מדי אפקטים בבת אחת.
        if (effects.length > 32) {
            const overflow = effects.length - 32;
            for (let i = 0; i < overflow; i++) {
                const fx = effects.shift();
                scene.remove(fx);
                if (fx.geometry) fx.geometry.dispose();
                if (fx.material) fx.material.dispose();
            }
        }
    }

    function updateRockLabel(rock) {
        drawRockLabel(rock.userData.ctx, rock.userData.hp);
        rock.userData.texture.needsUpdate = true;
    }

    function removeRock(rock, index) {
        if (rock.userData.isBoss) onBossDefeated(rock);
        spawnImpactBurst(rock.position.x, rock.position.y, rock.position.z);
        if (rock.position.y < 2.2) {
            spawnDustBurst(rock.position.x, rock.position.y, rock.position.z);
        }

        if (rock.userData.contactShadow) {
            scene.remove(rock.userData.contactShadow);
            if (rock.userData.contactShadow.geometry) {
                rock.userData.contactShadow.geometry.dispose();
            }
            if (rock.userData.contactShadow.material) {
                rock.userData.contactShadow.material.dispose();
            }
            rock.userData.contactShadow = null;
        }

        if (rock.userData.texture) rock.userData.texture.dispose();
        if (rock.geometry) rock.geometry.dispose();
        if (rock.material) rock.material.dispose();
        scene.remove(rock);
        rocks.splice(index, 1);
    }

    let coinTexture = null;
    function getCoinTexture() {
        if (coinTexture) return coinTexture;
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(46, 42, 6, 64, 64, 62);
        grad.addColorStop(0, '#ffe98a'); grad.addColorStop(0.6, '#f2b92a'); grad.addColorStop(1, '#a8680c');
        g.fillStyle = grad; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
        g.lineWidth = 5; g.strokeStyle = '#8a5408'; g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
        g.lineWidth = 3; g.strokeStyle = 'rgba(255,240,170,0.8)'; g.beginPath(); g.arc(64, 64, 57, 0, Math.PI * 2); g.stroke();
        g.fillStyle = '#9a5f0a'; g.font = '900 78px Rubik, Arial, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('$', 64, 70);
        coinTexture = new THREE.CanvasTexture(c);
        coinTexture.encoding = THREE.sRGBEncoding;
        return coinTexture;
    }

    // מטבע 3D אמיתי: גוף גלילי עם עובי, חזית/גב עם סימן $, ושפת מתכת.
    // הוא מסתובב סביב ציר Y ולכן רואים את העובי והברק שלו בזמן התנועה.
    function create3DCoin() {
        const group = new THREE.Group();
        const radius = 0.48;
        const thickness = 0.12;

        const edgeMat = new THREE.MeshPhysicalMaterial({
            color: 0xb9790d,
            roughness: 0.22,
            metalness: 0.86,
            clearcoat: 0.35,
            clearcoatRoughness: 0.14
        });

        const faceMat = new THREE.MeshPhysicalMaterial({
            map: getCoinTexture(),
            color: 0xffffff,
            roughness: 0.20,
            metalness: 0.48,
            clearcoat: 0.42,
            clearcoatRoughness: 0.12
        });

        const body = new THREE.Mesh(
            new THREE.CylinderGeometry(radius, radius, thickness, 32, 1, false),
            edgeMat
        );
        body.rotation.x = Math.PI / 2;
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        const front = new THREE.Mesh(
            new THREE.CircleGeometry(radius * 0.91, 32),
            faceMat
        );
        front.position.z = thickness * 0.5 + 0.004;
        front.castShadow = true;
        group.add(front);

        const back = new THREE.Mesh(
            new THREE.CircleGeometry(radius * 0.91, 32),
            faceMat
        );
        back.rotation.y = Math.PI;
        back.position.z = -thickness * 0.5 - 0.004;
        back.castShadow = true;
        group.add(back);

        const rim = new THREE.Mesh(
            new THREE.TorusGeometry(radius * 0.91, 0.025, 8, 32),
            edgeMat
        );
        rim.position.z = thickness * 0.5 + 0.009;
        group.add(rim);

        const rimBack = rim.clone();
        rimBack.position.z = -thickness * 0.5 - 0.009;
        rimBack.rotation.y = Math.PI;
        group.add(rimBack);

        group.scale.setScalar(0.92);
        return group;
    }

    function disposeCoin(coin) {
        coin.traverse(child => {
            if (!child.isMesh) return;
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                else child.material.dispose();
            }
        });
        scene.remove(coin);
    }

    function spawnCoin(x, y) {
        const coin = create3DCoin();
        coin.position.set(x, y, 0.58);
        coin.rotation.y = Math.random() * Math.PI * 2;
        coin.rotation.z = (Math.random() - 0.5) * 0.18;
        coin.userData = {
            vy: -0.04,
            spin: Math.random() * 6,
            bob: Math.random() * Math.PI * 2
        };
        scene.add(coin);
        droppedCoins.push(coin);
    }

    // גובה (בעולם) של קצה המסך העליון במישור הסלעים (z=0) — כדי שסלעים ייכנסו מלמעלה
    // מחוץ למסך ולא יופיעו פתאום באמצע השמיים.
    const _skyRayTmp = new THREE.Vector3();
    function getScreenTopWorldY() {
        camera.updateMatrixWorld(true);
        _skyRayTmp.set(0, 1, 0.5).unproject(camera);
        const origin = camera.position;
        const dir = _skyRayTmp.sub(origin);
        if (Math.abs(dir.z) < 1e-6) return 25;
        const t = (0 - origin.z) / dir.z;
        return origin.y + dir.y * t;
    }

    // ==========================================
    // בוס מרחף: מופיע בכל שלב שמתחלק ב-5. מרחף בחלק העליון של המסך ולא נוגע בתותח (אין לו התנגשות איתו),
    // אבל מפיל סלעים רגילים ויש לו פס חיים ושלושה שלבי קרב (מהיר ומפיל יותר כשהחיים יורדים).
    // הוא סלע לכל דבר בשביל כל סוגי הנשק (כדורים, טילים, ברק, לייזר, פלזמה), ולכן אין צורך בקוד נשק נפרד.
    // ==========================================
    const BOSS_EVERY = 5;                      // בוס בכל שלב שמתחלק במספר הזה
    const BOSS_HP_FACTOR = 16;                 // חיי הבוס = חיי סלע רגיל בשלב הזה x המספר הזה
    const BOSS_SIZE = 2.4;
    const BOSS_MAX_ROCKS = 7;                  // אם כבר יש כל כך הרבה סלעים על המסך, הוא לא מפיל עוד
    const BOSS_DROP_FRAMES = [150, 115, 85];   // כל כמה פריימים הוא מפיל סלע (לפי שלב הקרב)
    let bossRock = null;
    let bossUi = null;
    let bossSpikeGeo = null;

    function ensureBossUI() {
        if (bossUi) return bossUi;
        const style = document.createElement('style');
        style.textContent = `
            #boss-bar{position:fixed;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + 86px);
                width:min(66vw,300px);z-index:30;pointer-events:none;opacity:0;transition:opacity .3s;
                font-family:Rubik,system-ui,Arial,sans-serif;text-align:center}
            #boss-bar.on{opacity:1}
            #boss-bar .bb-label{font-weight:900;letter-spacing:.32em;font-size:12px;color:#ff6a4d;text-shadow:0 1px 3px #000;margin-bottom:4px}
            #boss-bar .bb-track{height:14px;border-radius:999px;background:rgba(0,0,0,.55);border:1px solid rgba(255,120,90,.65);
                overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.5)}
            #boss-bar .bb-fill{height:100%;width:100%;background:linear-gradient(90deg,#ff3b2f,#ff9a3c);transition:width .12s linear}
            #boss-banner{position:fixed;left:0;right:0;top:34%;z-index:31;text-align:center;pointer-events:none;opacity:0;
                font-family:Rubik,system-ui,Arial,sans-serif;font-weight:900;font-size:40px;letter-spacing:.12em;color:#ff5a3c;
                text-shadow:0 3px 12px rgba(0,0,0,.75)}
            #boss-banner.show{animation:bossBanner 1.9s ease-out forwards}
            @keyframes bossBanner{0%{opacity:0;transform:scale(.6)}15%{opacity:1;transform:scale(1.08)}70%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.05)}}
        `;
        document.head.appendChild(style);
        const bar = document.createElement('div');
        bar.id = 'boss-bar';
        bar.innerHTML = '<div class="bb-label">BOSS</div><div class="bb-track"><div class="bb-fill"></div></div>';
        const banner = document.createElement('div');
        banner.id = 'boss-banner';
        document.body.appendChild(bar);
        document.body.appendChild(banner);
        bossUi = { bar, fill: bar.querySelector('.bb-fill'), banner, lastPct: -1 };
        return bossUi;
    }

    function showBossBanner(text) {
        const ui = ensureBossUI();
        ui.banner.textContent = text;
        ui.banner.classList.remove('show');
        void ui.banner.offsetWidth;     // מאתחל את האנימציה גם אם הכיתוב כבר הופיע
        ui.banner.classList.add('show');
    }

    function clearBossState() {
        bossRock = null;
        if (bossUi) {
            bossUi.bar.classList.remove('on');
            bossUi.banner.classList.remove('show');
        }
    }

    function updateBossBar(d) {
        if (!bossUi) return;
        const pct = Math.max(0, Math.round(d.hp / d.maxHp * 100));
        if (pct !== bossUi.lastPct) {
            bossUi.lastPct = pct;
            bossUi.fill.style.width = pct + '%';
        }
    }

    function spawnBoss() {
        const ui = ensureBossUI();
        const topY = getScreenTopWorldY();
        const size = BOSS_SIZE;
        const hp = Math.round((8 + level * 6) * BOSS_HP_FACTOR);

        spawnRock(0, topY + size + 2, hp, size, 0, 0, false);
        const r = rocks[rocks.length - 1];
        const d = r.userData;
        d.isBoss = true;
        d.vx = 0; d.vy = 0; d.speedX = 0;
        d.rotX = 0; d.rotY = 0;
        d.t = 0;
        d.intro = 0;                                   // 0..1: ירידה מלמעלה המסך
        d.startY = r.position.y;
        d.hoverY = 0.2 + (topY - 0.2) * 0.64;          // גובה הריחוף (מתחת לכרטיסי המידע)
        d.sway = 0;
        d.phase = 0;
        d.dropT = 90;

        // מראה: גוון אדום חם וקוצים בקשת מעל הסלע. ללא צל מגע על הקרקע (הוא באוויר).
        r.material.color.setHex(0xff9a88);
        d.baseEmissive.setHex(0x7a1408);
        r.material.emissive.copy(d.baseEmissive);
        r.material.emissiveIntensity = 0.6;
        if (d.contactShadow) {
            scene.remove(d.contactShadow);
            if (d.contactShadow.geometry) d.contactShadow.geometry.dispose();
            if (d.contactShadow.material) d.contactShadow.material.dispose();
            d.contactShadow = null;
        }
        if (!bossSpikeGeo) bossSpikeGeo = new THREE.ConeGeometry(0.2, 0.7, 6);
        const spikeMat = new THREE.MeshStandardMaterial({ color: 0x3a0d0a, roughness: 0.5, metalness: 0.4, flatShading: true });
        for (let i = 0; i < 7; i++) {
            const a = -1.15 + i * (2.3 / 6);
            const sp = new THREE.Mesh(bossSpikeGeo, spikeMat);
            sp.position.set(Math.sin(a) * size * 0.95, Math.cos(a) * size * 0.95, 0.1);
            sp.rotation.z = -a;
            sp.scale.setScalar(0.8 + (i % 2) * 0.35);
            r.add(sp);
        }

        bossRock = r;
        ui.lastPct = -1;
        updateBossBar(d);
        ui.bar.classList.add('on');
        showBossBanner('BOSS');
    }

    function bossDropRocks(r, d, n) {
        for (let i = 0; i < n; i++) {
            if (rocks.length > BOSS_MAX_ROCKS) return;
            const size = 0.95 + Math.random() * 0.45;
            const hp = Math.max(4, Math.floor((8 + level * 6) * (size / 1.2) * 0.7));
            const dir = (i % 2 === 0 ? 1 : -1) * (Math.random() < 0.5 ? 1 : -1);
            spawnRock(
                r.position.x + (Math.random() - 0.5) * d.size,
                r.position.y - d.size * 0.7,
                hp, size, dir * ROCK_SPEED_X, -0.05, false
            );
        }
    }

    function updateBossMotion(r, d) {
        d.t++;
        if (d.intro < 1) {
            d.intro = Math.min(1, d.intro + 1 / 110);
            const e = 1 - Math.pow(1 - d.intro, 3);
            r.position.y = d.startY + (d.hoverY - d.startY) * e;
        } else {
            r.position.y = d.hoverY + Math.sin(d.t * 0.035) * 0.45;
        }
        const amp = Math.max(0.5, screenLimitX - d.size * 0.55);
        d.sway += 0.011 * [1, 1.35, 1.7][d.phase];
        r.position.x = Math.sin(d.sway) * amp;
        r.rotation.set(Math.sin(d.t * 0.021) * 0.10, Math.sin(d.t * 0.013) * 0.28, Math.sin(d.t * 0.017) * 0.12);

        // שלבי קרב לפי החיים שנשארו: בכל מעבר הוא מתעצבן ומפיל שני סלעים מיד.
        const frac = d.hp / d.maxHp;
        const ph = frac <= 0.33 ? 2 : (frac <= 0.66 ? 1 : 0);
        if (ph > d.phase) {
            d.phase = ph;
            d.flash = 1;
            bossDropRocks(r, d, 2);
        }
        if (d.intro >= 1) {
            d.dropT--;
            if (d.dropT <= 0) {
                bossDropRocks(r, d, 1);
                d.dropT = BOSS_DROP_FRAMES[d.phase];
            }
        }
        updateBossBar(d);
    }

    function onBossDefeated(rock) {
        const d = rock.userData;
        const n = Math.min(30, 12 + level * 2);
        for (let i = 0; i < n; i++) {
            spawnCoin(
                rock.position.x + (Math.random() - 0.5) * d.size * 1.6,
                rock.position.y + (Math.random() - 0.5) * d.size
            );
        }
        for (let i = 0; i < 6; i++) {
            spawnImpactBurst(
                rock.position.x + (Math.random() - 0.5) * d.size * 1.4,
                rock.position.y + (Math.random() - 0.5) * d.size,
                0
            );
        }
        score += 150 + level * 20;
        showBossBanner('BOSS DEFEATED');
        if (bossUi) bossUi.bar.classList.remove('on');
        bossRock = null;
    }

    let hasStartedFirstWave = false;
    function startNextWave() {
        // לא מתחילים גל חדש עד שכל הסלעים נעלמו.
        if (rocks.length === 0) {
            if (hasStartedFirstWave) { level++; missionOnLevel(level); }
            hasStartedFirstWave = true;

            if (level % BOSS_EVERY === 0) {
                spawnBoss();
                updateUI();
                return;
            }

            const count = Math.min(2 + Math.floor(level / 2), 5);
            // כמו במשחק ההשראה: הסלעים נכנסים מצדי המסך (לסירוגין) בגובה קבוע, ורק אחרי שנכנסו מתחילה הכבידה.
            const topY = getScreenTopWorldY();
            const enterY = 0.2 + (topY - 0.2) * 0.62;
            for (let i = 0; i < count; i++) {
                const size = 0.95 + Math.random() * 0.8;
                const hp = Math.floor((8 + level * 6) * (size / 1.2));
                const side = i % 2 === 0 ? -1 : 1;
                const lane = Math.floor(i / 2);
                const spawnX = side * (screenLimitX + 2.6 + size + lane * (size * 2.6 + 0.6));
                const spawnY = Math.min(enterY, topY - size - 2.5);
                spawnRock(spawnX, spawnY, hp, size, -side * ROCK_SPEED_X * (0.92 + Math.random() * 0.16), 0, true);
            }

            updateUI();
        }
    }

    // ==========================================
    // 9. שליטה וגרירה - מותאמת במיוחד למובייל
    // ==========================================
    // במקום לקשור את התותח ישירות למיקום האצבע על המסך,
    // אנחנו משתמשים בתנועה יחסית: מזיזים את האצבע ->
    // התותח זז באותו כיוון, אבל במהירות נשלטת.
    let isDragging = false;
    let dragPointerId = null;
    let dragStartX = 0;
    let dragStartTargetX = 0;
    let lastPointerX = 0;

    // רגישות תנועת התותח (נשמרת בין משחקים). 1.0 = ברירת מחדל. נשלט מתפריט ההגדרות במסך העצירה.
    const MOVE_SENS_KEY = 'bb3d_move_sens';
    const MOVE_SENS_MIN = 0.5;
    const MOVE_SENS_MAX = 2.0;
    let moveSensMult = (() => {
        const v = parseFloat(localStorage.getItem(MOVE_SENS_KEY));
        return Number.isFinite(v) ? Math.min(MOVE_SENS_MAX, Math.max(MOVE_SENS_MIN, v)) : 1;
    })();

    const TOUCH_DEADZONE = 2.5;
    const TOUCH_SENSITIVITY = 0.016;
    const DESKTOP_SENSITIVITY = 0.020;

    function getPointerSensitivity() {
        return (window.innerWidth <= 768
            ? TOUCH_SENSITIVITY
            : DESKTOP_SENSITIVITY) * moveSensMult;
    }

    function moveCannonByPointer(clientX) {
        const deltaX = clientX - dragStartX;

        if (Math.abs(deltaX) < TOUCH_DEADZONE) {
            return;
        }

        const nextTarget =
            dragStartTargetX +
            deltaX *
            getPointerSensitivity();

        targetX = Math.max(
            -screenLimitX,
            Math.min(
                screenLimitX,
                nextTarget
            )
        );
    }

    const controlSurface = renderer.domElement;

    controlSurface.addEventListener('pointerdown', (e) => {
        if (!isGameStarted || isPaused || isGameOver) return;
        if (awaitingStart) beginRun();

        // רק אצבע אחת / מצביע אחד שולט בתותח.
        if (dragPointerId !== null) return;

        isDragging = true;
        dragPointerId = e.pointerId;
        dragStartX = e.clientX;
        lastPointerX = e.clientX;
        dragStartTargetX = targetX;

        try {
            controlSurface.setPointerCapture(e.pointerId);
        } catch (_) {}

        e.preventDefault();
    }, { passive: false });

    controlSurface.addEventListener('pointermove', (e) => {
        if (!isDragging || e.pointerId !== dragPointerId) return;

        const movementSinceLastFrame =
            e.clientX - lastPointerX;

        // מונע קפיצה במקרה של אירוע pointermove גדול.
        if (Math.abs(movementSinceLastFrame) > 120) {
            dragStartX = e.clientX;
            dragStartTargetX = targetX;
            lastPointerX = e.clientX;
            return;
        }

        moveCannonByPointer(e.clientX);
        lastPointerX = e.clientX;

        e.preventDefault();
    }, { passive: false });

    function endPointerControl(e) {
        if (dragPointerId !== null && e.pointerId !== dragPointerId) {
            return;
        }

        isDragging = false;

        try {
            if (dragPointerId !== null) {
                controlSurface.releasePointerCapture(dragPointerId);
            }
        } catch (_) {}

        dragPointerId = null;
    }

    controlSurface.addEventListener('pointerup', endPointerControl);
    controlSurface.addEventListener('pointercancel', endPointerControl);
    controlSurface.addEventListener('lostpointercapture', () => {
        isDragging = false;
        dragPointerId = null;
    });

    // קו יישור קטן למניעת התנהגות לא צפויה ממגע במכשירים מסוימים.
    controlSurface.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });

    // ==========================================
    // 10. התחלת משחק והסרת מסך הפתיחה
    // ==========================================
    // ניקוי כל מה שנוצר במהלך ריצה (סלעים, כדורים, מטבעות, אפקטים) ואיפוס המצב — בלי רענון דף.
    function resetRunState() {
        for (let i = rocks.length - 1; i >= 0; i--) {
            const rock = rocks[i];
            const ud = rock.userData;
            if (ud.contactShadow) {
                scene.remove(ud.contactShadow);
                if (ud.contactShadow.geometry) ud.contactShadow.geometry.dispose();
                if (ud.contactShadow.material) ud.contactShadow.material.dispose();
                ud.contactShadow = null;
            }
            rock.children.forEach(child => { if (child.material) child.material.dispose(); });
            if (ud.texture) ud.texture.dispose();
            if (rock.geometry) rock.geometry.dispose();
            if (rock.material) rock.material.dispose();
            scene.remove(rock);
        }
        rocks.length = 0;
        clearBossState();

        bullets.forEach(b => {
            scene.remove(b);
        });
        bullets.length = 0;

        droppedCoins.forEach(disposeCoin);
        droppedCoins.length = 0;

        effects.forEach(fx => {
            scene.remove(fx);
            if (fx.geometry) fx.geometry.dispose();
            if (fx.material) fx.material.dispose();
        });
        effects.length = 0;
        clearWeaponState();

        isDragging = false;
        dragPointerId = null;
        targetX = 0;

        score = 0;
        playerHp = maxHp;
        level = 1;
        hasStartedFirstWave = false;
        cannonRecoil = 0;
        cannonGroup.position.set(0, cannonBaseY, 0);
        cannonGroup.userData.previousWheelX = 0;
        cannonGroup.userData.prevColX = 0;
    }

    function startGame() {
        if (isGameStarted) return;
        isGameStarted = true;
        isGameOver = false;
        pauseBtn.style.display = 'flex';
        setLevelUpVisible(true);

        if (splashScreen) splashScreen.classList.add('hidden');

        resetRunState();
        missionOnRunStart();
        score = 0;
        playerHp = maxHp;
        level = 1;
        hasStartedFirstWave = false;
        cannonRecoil = 0;
        cannonGroup.position.set(0, cannonBaseY, 0);
        buildMap(selectedMap);
        updateUI();

        // לפני שהסלעים נכנסים: השחקן יכול לשדרג (אם יש לו מטבעות) או פשוט ללחוץ על המסך כדי להתחיל.
        awaitingStart = true;
        setLevelUpVisible(true);
    }

    if (startBtn) startBtn.addEventListener('click', startGame);

    // ==========================================
    // כפתור עצירה (שלב 1)
    // ==========================================
    const PAUSE_BTN_TOP = 74;   // מרחק מהקצה העליון (px) — לשנות אם מתנגש עם ה-HUD

    const pauseStyle = document.createElement('style');
    pauseStyle.textContent = `
        .pz-btn{position:fixed;right:12px;top:calc(env(safe-area-inset-top,0px) + ${PAUSE_BTN_TOP}px);z-index:55;width:44px;height:44px;
            border-radius:50%;border:2px solid rgba(255,255,255,.6);background:rgba(20,12,22,.55);color:#fff;font-size:18px;
            display:none;align-items:center;justify-content:center;padding:0;touch-action:manipulation}
        .pz-overlay{position:fixed;inset:0;z-index:70;display:none;align-items:center;justify-content:center;background:rgba(8,4,10,.7);
            font-family:Rubik,system-ui,Arial,sans-serif;direction:ltr;color:#fff}
        .pz-overlay.on{display:flex}
        .pz-box{width:min(86vw,340px);background:linear-gradient(#2c1a30,#150c1a);border:2px solid rgba(255,214,140,.5);
            border-radius:22px;padding:22px 18px;text-align:center}
        .pz-box h2{margin:0 0 6px;font-size:30px;color:#ffd24a}
        .pz-box p{margin:4px 0 10px;font-size:17px}
        .pz-act{display:block;width:100%;margin-top:10px;padding:13px;border:0;border-radius:12px;font:inherit;font-weight:800;font-size:18px;
            color:#3a1d05;background:linear-gradient(#ffe27a,#f0a028)}
        .pz-act.alt{background:rgba(255,255,255,.16);color:#fff}
        .pz-overlay.pz-settings{z-index:75}
        .pz-set-row{margin:14px 0 6px;text-align:left}
        .pz-set-head{display:flex;justify-content:space-between;align-items:baseline;font-size:15px;font-weight:700;margin-bottom:12px}
        .pz-set-head b{color:#ffd24a;font-size:17px;font-variant-numeric:tabular-nums}
        .pz-range{-webkit-appearance:none;appearance:none;display:block;width:100%;height:8px;border-radius:999px;outline:none;margin:0;
            background:linear-gradient(90deg,#f0a028,#ffe27a);touch-action:pan-x}
        .pz-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:30px;height:30px;border-radius:50%;
            background:#fff;border:3px solid #f0a028;box-shadow:0 2px 8px rgba(0,0,0,.55)}
        .pz-range::-moz-range-thumb{width:24px;height:24px;border-radius:50%;background:#fff;border:3px solid #f0a028;box-shadow:0 2px 8px rgba(0,0,0,.55)}
        .pz-set-ends{display:flex;justify-content:space-between;font-size:12px;color:rgba(255,255,255,.6);margin-top:8px}
    `;
    document.head.appendChild(pauseStyle);

    const pauseBtn = document.createElement('button');
    pauseBtn.className = 'pz-btn';
    pauseBtn.textContent = '⏸';
    document.body.appendChild(pauseBtn);

    // ---- כפתור Level Up ירוק: על הדשא, קרוב למצלמה, מול התותח ----
    const levelStyle = document.createElement('style');
    levelStyle.textContent = `
        .lv-wrap{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 34px);transform:translateX(-50%);z-index:54;
            display:none;align-items:center;gap:10px;padding:7px 8px 7px 8px;border-radius:26px;
            background:linear-gradient(180deg,rgba(52,72,102,.97) 0%,rgba(20,30,46,.98) 100%);
            border:2px solid rgba(170,210,255,.38);
            box-shadow:0 7px 0 rgba(0,0,0,.35),0 14px 26px rgba(0,0,0,.45),inset 0 2px 0 rgba(255,255,255,.20),inset 0 -3px 0 rgba(0,0,0,.35);
            font-family:Rubik,system-ui,Arial,sans-serif;direction:ltr;user-select:none;-webkit-user-select:none;touch-action:manipulation;
            animation:lvIn .5s cubic-bezier(.2,1.35,.4,1) both}
        .lv-wrap::after{content:'';position:absolute;inset:-5px;border-radius:31px;pointer-events:none;
            box-shadow:0 0 22px 3px rgba(130,255,70,.38);animation:lvGlow 1.8s ease-in-out infinite}
        .lv-badge{position:relative;width:58px;height:58px;border-radius:17px;display:flex;flex-direction:column;align-items:center;justify-content:center;
            background:linear-gradient(180deg,#ffe27a 0%,#ffb82e 55%,#e8860f 100%);border:2px solid #fff1b8;
            box-shadow:0 3px 0 #8f520a,inset 0 2px 0 rgba(255,255,255,.7),inset 0 -4px 0 rgba(150,80,0,.25)}
        .lv-cap{font-size:9px;font-weight:900;letter-spacing:1.6px;color:#7a4300;line-height:1;margin-top:1px}
        .lv-num{font-size:27px;font-weight:900;line-height:1;color:#fff;text-shadow:0 2px 0 #9a5a06,0 0 8px rgba(120,60,0,.35)}
        .lv-btn{position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;
            min-width:158px;padding:6px 18px 9px;border-radius:19px;border:3px solid #1b6b08;cursor:pointer;
            background:linear-gradient(180deg,#b9ff50 0%,#67d81e 46%,#3fae0e 100%);
            box-shadow:0 5px 0 #14500a,0 9px 14px rgba(0,0,0,.4),inset 0 2px 0 rgba(255,255,255,.7),inset 0 -6px 0 rgba(0,0,0,.18);
            color:#fff;font:inherit;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
        .lv-btn::before{content:'';position:absolute;left:0;right:0;top:0;height:46%;pointer-events:none;
            background:linear-gradient(rgba(255,255,255,.55),rgba(255,255,255,.04));border-radius:16px 16px 60% 60%/16px 16px 14px 14px}
        .lv-btn:active:not(:disabled){transform:translateY(3px);box-shadow:0 2px 0 #14500a,0 5px 10px rgba(0,0,0,.4),inset 0 2px 0 rgba(255,255,255,.7),inset 0 -6px 0 rgba(0,0,0,.18)}
        .lv-btn.can{animation:lvPulse 1.6s ease-in-out infinite}
        .lv-btn:disabled{filter:grayscale(.85) brightness(.85)}
        .lv-shine{position:absolute;top:-25%;left:-60%;width:38%;height:150%;pointer-events:none;transform:skewX(-20deg);
            background:linear-gradient(100deg,transparent,rgba(255,255,255,.8),transparent);animation:lvShine 2.7s ease-in-out infinite}
        .lv-top{position:relative;display:flex;align-items:center;gap:6px;font-size:12px;font-weight:900;letter-spacing:1.8px;
            color:#0f4a06;text-shadow:0 1px 0 rgba(255,255,255,.55)}
        .lv-top svg{animation:lvBob 1s ease-in-out infinite}
        .lv-price{position:relative;display:flex;align-items:center;gap:7px;font-size:25px;font-weight:900;line-height:1.05;
            text-shadow:0 2px 0 #1b6b08,0 0 7px rgba(0,60,0,.35)}
        .lv-hint{position:fixed;left:50%;top:60%;transform:translate(-50%,-50%);z-index:54;display:none;pointer-events:none;
            color:#fff;font-family:Rubik,system-ui,Arial,sans-serif;font-weight:900;font-size:30px;letter-spacing:4px;white-space:nowrap;
            text-shadow:0 0 16px rgba(255,255,255,.6),0 3px 0 rgba(0,0,0,.6);animation:lvHint 1.3s ease-in-out infinite}
        .lv-burst{position:fixed;z-index:56;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;pointer-events:none;
            border:4px solid #b9ff50;box-shadow:0 0 18px 4px rgba(130,255,70,.7);animation:lvBurst .55s ease-out forwards}
        @keyframes lvIn{0%{opacity:0;transform:translateX(-50%) translateY(46px) scale(.8)}100%{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}}
        @keyframes lvPulse{50%{transform:scale(1.045)}}
        @keyframes lvGlow{50%{opacity:.35}}
        @keyframes lvShine{0%,55%{left:-60%}100%{left:130%}}
        @keyframes lvBob{50%{transform:translateY(-2px)}}
        @keyframes lvHint{0%,100%{opacity:1;transform:translate(-50%,-50%) scale(1)}50%{opacity:.5;transform:translate(-50%,-50%) scale(1.05)}}
        @keyframes lvBurst{0%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(11)}}`;
    document.head.appendChild(levelStyle);

    const levelWrap = document.createElement('div');
    levelWrap.className = 'lv-wrap';
    levelWrap.innerHTML = `
        <div class="lv-badge"><span class="lv-cap">LEVEL</span><span class="lv-num">1</span></div>
        <button class="lv-btn" type="button">
            <span class="lv-shine"></span>
            <span class="lv-top">
                <svg viewBox="0 0 16 18" width="13" height="15" aria-hidden="true">
                    <path d="M2 8.5l6-6 6 6" fill="none" stroke="#0f4a06" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M2 15l6-6 6 6" fill="none" stroke="#0f4a06" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>LEVEL UP
            </span>
            <span class="lv-price">
                <svg viewBox="0 0 24 24" width="25" height="25" aria-hidden="true">
                    <circle cx="12" cy="12" r="11" fill="#b9780a"/>
                    <circle cx="12" cy="12" r="9.2" fill="#ffd84a"/>
                    <path d="M5.2 9.5A7.4 7.4 0 0 1 12 4.6" fill="none" stroke="#fff6c2" stroke-width="1.6" stroke-linecap="round"/>
                    <text x="12" y="16.6" text-anchor="middle" font-size="12.5" font-weight="900" fill="#a06a00" font-family="Rubik,Arial,sans-serif">$</text>
                </svg><span class="lv-cost">0</span>
            </span>
        </button>`;
    document.body.appendChild(levelWrap);
    levelUpUI = {
        wrap: levelWrap,
        lvl: levelWrap.querySelector('.lv-num'),
        btn: levelWrap.querySelector('.lv-btn'),
        cost: levelWrap.querySelector('.lv-cost')
    };
    startHintEl = document.createElement('div');
    startHintEl.className = 'lv-hint';
    startHintEl.textContent = 'TAP TO START';
    document.body.appendChild(startHintEl);
    levelWrap.addEventListener('pointerdown', (e) => e.stopPropagation());
    levelUpUI.btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const cost = cannonLevelCost();
        if (coins < cost) return;
        coins -= cost;
        firePowerLvl++;
        fireRateLvl++;
        firePower = firePowerLvl;
        fireRate = 1 + (fireRateLvl - 1) * 0.25;
        localStorage.setItem('bb3d_coins', coins);
        localStorage.setItem('bb3d_upg_power', firePowerLvl);
        localStorage.setItem('bb3d_upg_rate', fireRateLvl);
        updateUI();
        playSound('coin');
        spawnImpactBurst(cannonGroup.position.x, 1.6, 0.5, 0x7ee22a);
        // טבעת ירוקה שמתפשטת ממקום הכפתור
        const br = levelUpUI.btn.getBoundingClientRect();
        const burst = document.createElement('div');
        burst.className = 'lv-burst';
        burst.style.left = (br.left + br.width / 2) + 'px';
        burst.style.top = (br.top + br.height / 2) + 'px';
        document.body.appendChild(burst);
        setTimeout(() => burst.remove(), 600);
        beginRun();   // שדרוג = התחלת הריצה
    });
    refreshLevelUpBtn();

    // ---- Inventory: כפתור פתיחה + מסך כרטיסים + חלון פרטים ----
    const invStyle = document.createElement('style');
    invStyle.textContent = `
        .inv-open{flex:none;display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:12px;border-radius:16px;
            border:2px solid rgba(250,204,21,.55);background:linear-gradient(180deg,rgba(250,204,21,.24),rgba(250,204,21,.08));
            color:#fde047;font-size:16px;font-weight:900;letter-spacing:2px;cursor:pointer;box-shadow:0 4px 0 rgba(0,0,0,.35)}
        .inv-open:active{transform:scale(.97)}
        .inv-open span{font-size:20px;letter-spacing:0}
        .inv-screen{position:fixed;inset:0;z-index:120;display:none;flex-direction:column;color:#fff;font-family:Rubik,system-ui,Arial,sans-serif;direction:ltr;
            background:radial-gradient(120% 70% at 50% 0%,#46321b 0%,#1c130b 55%,#0d0804 100%)}
        .inv-top{flex:none;display:flex;align-items:center;gap:10px;padding:calc(env(safe-area-inset-top,0px) + 12px) 14px 12px;border-bottom:1px solid rgba(250,204,21,.25)}
        .inv-back{width:42px;height:42px;border-radius:14px;border:2px solid rgba(250,204,21,.55);background:rgba(250,204,21,.12);color:#fde047;font-size:24px;font-weight:900;line-height:1;cursor:pointer}
        .inv-title{flex:1;text-align:center;font-weight:900;font-size:22px;letter-spacing:4px;color:#fde047;text-shadow:0 2px 0 rgba(0,0,0,.55)}
        .inv-coins{display:flex;align-items:center;gap:6px;padding:7px 12px;border-radius:14px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);font-weight:800;color:#fde047;font-size:15px}
        .inv-scroll,.inv-scroll *{touch-action:pan-y}
        .inv-scroll{flex:1;min-height:0;overflow-y:auto;padding:14px 14px calc(env(safe-area-inset-bottom,0px) + 28px);scrollbar-width:none;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
        .inv-scroll::-webkit-scrollbar{display:none}
        .inv-sec-title{margin:4px 0 10px;padding:7px 14px;border-radius:10px;background:linear-gradient(90deg,rgba(250,204,21,.28),rgba(250,204,21,0));font-weight:900;font-size:13px;letter-spacing:3px}
        .inv-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px}
        .inv-card{position:relative;aspect-ratio:1/1.18;border-radius:16px;border:2px solid rgba(255,255,255,.16);padding:0;overflow:hidden;
            display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;color:#fff;cursor:pointer;
            background:linear-gradient(180deg,rgba(255,255,255,.11),rgba(255,255,255,.03));box-shadow:0 5px 0 rgba(0,0,0,.38)}
        .inv-card:active{transform:scale(.96)}
        .inv-glow{position:absolute;inset:0;background:radial-gradient(70% 55% at 50% 38%,var(--c),transparent 72%);opacity:.40;pointer-events:none}
        .inv-ico{position:relative;font-size:32px;line-height:1;filter:drop-shadow(0 3px 0 rgba(0,0,0,.45))}
        .inv-name{position:relative;font-size:10.5px;font-weight:800;text-align:center;padding:0 4px;line-height:1.1}
        .inv-card.equipped{border-color:#4ade80;box-shadow:0 0 0 2px rgba(74,222,128,.35),0 5px 0 rgba(0,0,0,.38)}
        .inv-card.locked{background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(0,0,0,.30))}
        .inv-card.locked .inv-ico{filter:grayscale(.9) brightness(.65)}
        .inv-card.locked .inv-glow{opacity:.12}
        .inv-check{position:absolute;top:7px;left:7px;width:22px;height:22px;border-radius:50%;display:none;align-items:center;justify-content:center;
            background:#22c55e;border:2px solid #bbf7d0;color:#fff;font-size:13px;font-weight:900}
        .inv-stars{position:relative;font-size:9px;letter-spacing:.5px;color:#fde047;line-height:1}
        .inv-stars u{text-decoration:none;color:rgba(255,255,255,.22)}
        .inv-price{position:relative;display:none;align-items:center;padding:2px 7px;border-radius:999px;background:rgba(0,0,0,.6);
            border:1px solid rgba(250,204,21,.55);font-size:10px;font-weight:800;color:#fde047}
        .inv-price.no{color:#fca5a5;border-color:rgba(248,113,113,.55)}
        .inv-detail{position:fixed;inset:0;z-index:130;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.66);
            font-family:Rubik,system-ui,Arial,sans-serif;direction:ltr}
        .inv-panel{position:relative;width:min(90vw,380px);padding:16px 16px 18px;border-radius:24px;color:#fff;
            background:linear-gradient(180deg,#3d2c19,#1d140c);border:2px solid rgba(250,204,21,.5);box-shadow:0 18px 50px rgba(0,0,0,.65);
            animation:invPop .25s cubic-bezier(.2,1.3,.4,1) both}
        .inv-x{position:absolute;top:10px;right:10px;width:34px;height:34px;border-radius:12px;background:#ef4444;border:2px solid #fecaca;color:#fff;font-weight:900;font-size:16px;cursor:pointer}
        .inv-head{display:flex;align-items:center;gap:12px;margin-bottom:12px;padding-right:40px}
        .inv-bigico{flex:none;width:72px;height:72px;border-radius:18px;display:flex;align-items:center;justify-content:center;font-size:42px;
            background:radial-gradient(circle at 50% 40%,var(--c),rgba(0,0,0,.4));border:2px solid rgba(255,255,255,.28)}
        .inv-dname{font-size:22px;font-weight:900;line-height:1.1}
        .inv-dtag{margin-top:3px;font-size:11px;font-weight:800;letter-spacing:2px;color:#fde047}
        .inv-desc{font-size:14px;line-height:1.45;color:#e7e5e4;margin-bottom:12px}
        .inv-stats{display:grid;gap:6px;margin-bottom:14px}
        .inv-stat{display:grid;grid-template-columns:64px 1fr;align-items:center;gap:8px;font-size:12px;font-weight:700;color:#d6d3d1}
        .inv-bar{display:flex;gap:4px}
        .inv-bar i{flex:1;height:9px;border-radius:5px;background:rgba(255,255,255,.13)}
        .inv-bar i.on{background:linear-gradient(#fde047,#f59e0b)}
        .inv-action{width:100%;padding:13px;border-radius:16px;border:3px solid;font-size:18px;font-weight:900;letter-spacing:1px;color:#fff;cursor:pointer;font-family:inherit}
        .inv-star-row{display:flex;align-items:center;gap:8px;padding:6px 9px;border-radius:10px;background:rgba(255,255,255,.05);font-size:12.5px;color:#a8a29e}
        .inv-star-row b{flex:none;min-width:30px;color:#78716c;font-weight:900}
        .inv-star-row span{flex:1;line-height:1.25}
        .inv-star-row em{flex:none;font-style:normal;font-size:12px}
        .inv-star-row.on{background:rgba(250,204,21,.13);color:#fff}
        .inv-star-row.on b{color:#fde047}
        .inv-star-row.next{outline:1px dashed rgba(167,139,250,.8);color:#e9e4ff}
        .inv-upgrade{display:none;width:100%;margin-top:10px;padding:11px;border-radius:16px;border:3px solid #3b2a8f;font-size:15px;font-weight:900;letter-spacing:1px;
            color:#fff;cursor:pointer;font-family:inherit;background:linear-gradient(#b79bff,#6d4be0);box-shadow:0 4px 0 #2a1d6b;text-shadow:0 2px 0 rgba(0,0,0,.35)}
        .inv-upgrade:active:not(:disabled){transform:translateY(2px)}
        .inv-upgrade.no,.inv-upgrade:disabled{background:linear-gradient(#9aa4ad,#6d767e);border-color:#4a525a;box-shadow:0 4px 0 #3a4046;text-shadow:none}
        .inv-upgrade.max{background:linear-gradient(#ffe27a,#f59e0b);border-color:#92560a;box-shadow:0 4px 0 #6b3d06;color:#4a2800;text-shadow:none}
        .inv-action:active:not(:disabled){transform:translateY(2px)}
        .inv-action.buy{background:linear-gradient(#b9ff50,#4fb512);border-color:#1f6a0a;box-shadow:0 5px 0 #14500a;text-shadow:0 2px 0 rgba(0,0,0,.4)}
        .inv-action.equip{background:linear-gradient(#ffe27a,#f59e0b);border-color:#92560a;box-shadow:0 5px 0 #6b3d06;color:#4a2800}
        .inv-action.done,.inv-action:disabled{background:linear-gradient(#9aa4ad,#6d767e);border-color:#4a525a;box-shadow:0 5px 0 #3a4046;color:#eef0f2;text-shadow:none}
        @keyframes invPop{0%{opacity:0;transform:scale(.88) translateY(18px)}100%{opacity:1;transform:none}}`;
    document.head.appendChild(invStyle);

    const invScreen = document.createElement('div');
    invScreen.className = 'inv-screen';
    invScreen.innerHTML = `
        <div class="inv-top">
            <button class="inv-back" type="button" aria-label="Back">‹</button>
            <div class="inv-title">INVENTORY</div>
            <div class="inv-coins">🪙 <span class="inv-coins-val">0</span></div>
        </div>
        <div class="inv-scroll">
            <div class="inv-sec-title">CANNONS</div>
            <div class="inv-grid" data-sec="cannon"></div>
            <div class="inv-sec-title">WEAPONS</div>
            <div class="inv-grid" data-sec="weapon"></div>
        </div>`;
    document.body.appendChild(invScreen);

    const invDetail = document.createElement('div');
    invDetail.className = 'inv-detail';
    invDetail.innerHTML = `
        <div class="inv-panel">
            <button class="inv-x" type="button" aria-label="Close">✕</button>
            <div class="inv-head">
                <div class="inv-bigico"></div>
                <div><div class="inv-dname"></div><div class="inv-dtag"></div></div>
            </div>
            <div class="inv-desc"></div>
            <div class="inv-stats"></div>
            <button class="inv-action" type="button"></button>
            <button class="inv-upgrade" type="button"></button>
        </div>`;
    document.body.appendChild(invDetail);

    const invCards = [];
    INV_ITEMS.forEach(item => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'inv-card';
        el.style.setProperty('--c', item.color);
        el.innerHTML = '<span class="inv-glow"></span><span class="inv-ico">' + item.icon + '</span><span class="inv-name">' + item.name +
            '</span>' + (item.stars ? '<span class="inv-stars"></span>' : '') + '<span class="inv-check">✓</span><span class="inv-price"></span>';
        invScreen.querySelector('[data-sec="' + item.kind + '"]').appendChild(el);
        invCards.push({ item, el, check: el.querySelector('.inv-check'), price: el.querySelector('.inv-price'), stars: el.querySelector('.inv-stars') });
        el.addEventListener('click', () => {
            invOpenKey = item.kind + ':' + item.id;
            invDetail.style.display = 'flex';
            renderInvDetail();
        });
    });

    invUI = {
        screen: invScreen,
        coins: invScreen.querySelector('.inv-coins-val'),
        cards: invCards,
        detail: {
            panel: invDetail.querySelector('.inv-panel'),
            ico: invDetail.querySelector('.inv-bigico'),
            name: invDetail.querySelector('.inv-dname'),
            tag: invDetail.querySelector('.inv-dtag'),
            desc: invDetail.querySelector('.inv-desc'),
            stats: invDetail.querySelector('.inv-stats'),
            action: invDetail.querySelector('.inv-action'),
            upgrade: invDetail.querySelector('.inv-upgrade')
        }
    };

    function closeInvDetail() {
        invOpenKey = null;
        invDetail.style.display = 'none';
    }
    invDetail.addEventListener('click', (e) => { if (e.target === invDetail) closeInvDetail(); });
    invDetail.querySelector('.inv-x').addEventListener('click', closeInvDetail);
    invUI.detail.upgrade.addEventListener('click', () => {
        const item = INV_ITEMS.find(i => (i.kind + ':' + i.id) === invOpenKey);
        if (item && item.stars) upgradeWeaponStar(item.id);
    });
    invUI.detail.action.addEventListener('click', () => {
        const item = INV_ITEMS.find(i => (i.kind + ':' + i.id) === invOpenKey);
        if (item) invAct(item);
    });
    invScreen.querySelector('.inv-back').addEventListener('click', () => {
        closeInvDetail();
        invScreen.style.display = 'none';
    });
    const invOpenBtn = document.getElementById('inventory-btn');
    if (invOpenBtn) {
        invOpenBtn.addEventListener('click', () => {
            invScreen.style.display = 'flex';
            refreshInventory();
        });
    }
    refreshInventory();

    const pauseOverlay = document.createElement('div');
    pauseOverlay.className = 'pz-overlay';
    pauseOverlay.innerHTML = `
        <div class="pz-box">
            <h2>⏸ Paused</h2>
            <p>Score: <b id="pz-score">0</b></p>
            <button class="pz-act" data-act="resume">▶ Resume</button>
            <button class="pz-act alt" data-act="restart">↻ Restart</button>
            <button class="pz-act alt" data-act="settings">⚙ Settings</button>
            <button class="pz-act alt" data-act="menu">🏠 Menu</button>
        </div>`;
    document.body.appendChild(pauseOverlay);

    // ---- הגדרות (נפתח ממסך העצירה): רגישות תנועת התותח ----
    const settingsOverlay = document.createElement('div');
    settingsOverlay.className = 'pz-overlay pz-settings';
    settingsOverlay.innerHTML = `
        <div class="pz-box">
            <h2>⚙ Settings</h2>
            <div class="pz-set-row">
                <div class="pz-set-head"><span>Cannon sensitivity</span><b id="pz-sens-val">1.00x</b></div>
                <input id="pz-sens" class="pz-range" type="range" min="${MOVE_SENS_MIN}" max="${MOVE_SENS_MAX}" step="0.05" value="1">
                <div class="pz-set-ends"><span>Slower</span><span>Faster</span></div>
            </div>
            <button class="pz-act alt" data-act="sens-reset">Reset</button>
            <button class="pz-act" data-act="settings-back">← Back</button>
        </div>`;
    document.body.appendChild(settingsOverlay);

    const sensSlider = settingsOverlay.querySelector('#pz-sens');
    const sensValueEl = settingsOverlay.querySelector('#pz-sens-val');
    function applyMoveSens(v, save) {
        moveSensMult = Math.min(MOVE_SENS_MAX, Math.max(MOVE_SENS_MIN, v));
        sensSlider.value = moveSensMult;
        sensValueEl.textContent = moveSensMult.toFixed(2) + 'x';
        if (save) localStorage.setItem(MOVE_SENS_KEY, moveSensMult);
    }
    applyMoveSens(moveSensMult, false);
    sensSlider.addEventListener('input', () => applyMoveSens(parseFloat(sensSlider.value), true));
    settingsOverlay.addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        if (b.dataset.act === 'settings-back') settingsOverlay.classList.remove('on');
        else if (b.dataset.act === 'sens-reset') applyMoveSens(1, true);
    });

    function setPaused(p) {
        if (!isGameStarted || isGameOver) return;
        isPaused = p;
        if (p) {
            // משחררים שליטה כדי שהתותח לא "ייתקע" בגרירה.
            isDragging = false;
            dragPointerId = null;
            localStorage.setItem('bb3d_coins', coins);
            document.getElementById('pz-score').textContent = score;
            pauseOverlay.classList.add('on');
        } else {
            pauseOverlay.classList.remove('on');
        }
    }

    pauseBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    pauseBtn.addEventListener('click', (e) => { e.stopPropagation(); setPaused(true); });
    // ---- מסך Game Over (במקום alert + רענון דף) ----
    const gameOverOverlay = document.createElement('div');
    gameOverOverlay.className = 'pz-overlay';
    gameOverOverlay.innerHTML = `
        <div class="pz-box">
            <h2>💥 Game Over</h2>
            <p>Score: <b data-go="score">0</b></p>
            <p>Best: <b data-go="best">0</b></p>
            <p data-go="record" style="display:none;color:#ffd24a;font-weight:800">🏆 New best!</p>
            <p data-go="gap" style="display:none;color:#ffd24a;font-weight:800"></p>
            <div class="go-stats">
                <div><span>Rocks</span><b data-go="rocks">0</b></div>
                <div><span>Coins</span><b data-go="coins">+0</b></div>
                <div><span>Level</span><b data-go="level">1</b></div>
            </div>
            <div class="go-card" data-go="goal"></div>
            <div class="go-card" data-go="mission"></div>
            <button class="pz-act" data-act="again">↻ Play again</button>
            <button class="pz-act alt" data-act="menu">🏠 Menu</button>
        </div>`;
    document.body.appendChild(gameOverOverlay);

    const goScoreEl = gameOverOverlay.querySelector('[data-go="score"]');
    const goBestEl = gameOverOverlay.querySelector('[data-go="best"]');
    const goRecordEl = gameOverOverlay.querySelector('[data-go="record"]');

    function triggerGameOver() {
        isGameOver = true;
        clearBossState();
        hideLaser();
        isDragging = false;
        dragPointerId = null;

        const isNewBest = score > bestScore;
        if (isNewBest) {
            bestScore = score;
            localStorage.setItem('bb3d_best', bestScore);
        }
        localStorage.setItem('bb3d_coins', coins);

        pauseBtn.style.display = 'none';
        setLevelUpVisible(false);
        goScoreEl.textContent = score;
        goBestEl.textContent = bestScore;
        goRecordEl.style.display = isNewBest ? 'block' : 'none';
        missionOnRunEnd(true);
        fillGameOverExtras(isNewBest);
        gameOverOverlay.classList.add('on');
        updateUI();
    }

    // התחלת ריצה חדשה מיד, בלי לחזור למסך הפתיחה.
    function restartRun() {
        pauseOverlay.classList.remove('on');
        gameOverOverlay.classList.remove('on');
        isPaused = false;
        isGameStarted = false;
        isGameOver = false;
        localStorage.setItem('bb3d_coins', coins);
        startGame();
    }

    // חזרה למסך הפתיחה (חנות, שדרוגים, בחירת תותח).
    function returnToMenu() {
        pauseOverlay.classList.remove('on');
        gameOverOverlay.classList.remove('on');
        isPaused = false;
        isGameStarted = false;
        isGameOver = false;
        pauseBtn.style.display = 'none';
        setLevelUpVisible(false);
        resetRunState();
        missionOnRunEnd(false);
        localStorage.setItem('bb3d_coins', coins);
        if (splashScreen) splashScreen.classList.remove('hidden');
        updateUI();
    }

    function handleOverlayAction(e) {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const act = b.dataset.act;
        if (act === 'resume') setPaused(false);
        else if (act === 'restart' || act === 'again') restartRun();
        else if (act === 'menu') returnToMenu();
        else if (act === 'settings') settingsOverlay.classList.add('on');
    }

    pauseOverlay.addEventListener('click', handleOverlayAction);
    gameOverOverlay.addEventListener('click', handleOverlayAction);

    // ==========================================
    // משימות יומיות + "המטרה הבאה" במסך הסיום
    // ==========================================
    // שלוש משימות ביום (מתאפסות בחצות לפי שעון המכשיר). ההתקדמות נשמרת ב-localStorage.
    // לכל משימה פרס במטבעות שנאסף בלחיצה על Claim בתפריט.
    const MISSIONS_KEY = 'bb3d_missions';
    const MISSION_TYPES = {
        rocks: { icon: '🪨', text: n => `Destroy ${n} rocks`,         targets: [40, 70, 110] },
        coins: { icon: '🪙', text: n => `Collect ${n} coins`,         targets: [50, 100, 160] },
        level: { icon: '🌊', text: n => `Reach level ${n} in one run`, targets: [4, 6, 8] },
        runs:  { icon: '🎮', text: n => `Finish ${n} runs`,           targets: [2, 4, 6] }
    };
    const MISSION_REWARDS = [150, 300, 500];   // קל / בינוני / קשה (מטבעות)

    function missionDayKey() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    // מחולל אקראי עם זרע (אותן משימות לכל מי שפותח באותו יום)
    function missionRand(seedStr) {
        let h = 2166136261;
        for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
        return () => {
            h += 0x6D2B79F5;
            let t = h;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function generateMissions(dayKey) {
        const rnd = missionRand('bb3d-' + dayKey);
        const shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
        const types = shuffle(Object.keys(MISSION_TYPES));
        const tiers = shuffle([0, 1, 2]);
        return types.slice(0, 3).map((type, i) => ({
            type, tier: tiers[i],
            target: MISSION_TYPES[type].targets[tiers[i]],
            reward: MISSION_REWARDS[tiers[i]],
            progress: 0, claimed: false
        }));
    }

    let missionsState = null;
    function saveMissions() {
        try { localStorage.setItem(MISSIONS_KEY, JSON.stringify(missionsState)); } catch (e) { /* ignore */ }
    }
    function loadMissions() {
        const key = missionDayKey();
        try {
            const saved = JSON.parse(localStorage.getItem(MISSIONS_KEY));
            if (saved && saved.date === key && Array.isArray(saved.list) && saved.list.length === 3) { missionsState = saved; return; }
        } catch (e) { /* ignore */ }
        missionsState = { date: key, list: generateMissions(key) };
        saveMissions();
    }
    function missionText(m) { return MISSION_TYPES[m.type].text(m.target); }
    function missionDone(m) { return m.progress >= m.target; }
    function missionReadyCount() { return missionsState.list.filter(m => missionDone(m) && !m.claimed).length; }

    // ---- אירועים מהמשחק ----
    const runStats = { rocks: 0, coins: 0, level: 1, active: false };
    function freshMissions() {
        if (!missionsState || missionsState.date !== missionDayKey()) { loadMissions(); renderMissions(); }
    }
    function missionAdd(type, amount) {
        freshMissions();
        missionsState.list.forEach(m => {
            if (m.type !== type || missionDone(m)) return;
            m.progress = Math.min(m.target, m.progress + amount);
            if (missionDone(m)) showMissionToast(m);
        });
    }
    function missionMax(type, value) {
        freshMissions();
        missionsState.list.forEach(m => {
            if (m.type !== type || missionDone(m)) return;
            m.progress = Math.min(m.target, Math.max(m.progress, value));
            if (missionDone(m)) showMissionToast(m);
        });
    }
    function missionOnRock() { runStats.rocks++; missionAdd('rocks', 1); }
    function missionOnCoin(n) { runStats.coins += n; missionAdd('coins', n); }
    function missionOnLevel(lv) { runStats.level = Math.max(runStats.level, lv); missionMax('level', lv); }
    function missionOnRunStart() { runStats.rocks = 0; runStats.coins = 0; runStats.level = 1; runStats.active = true; }
    function missionOnRunEnd(finished) {
        if (!runStats.active && !finished) { renderMissions(); return; }
        runStats.active = false;
        if (finished) missionAdd('runs', 1);
        saveMissions();
        renderMissions();
    }

    // ---- סגנונות ----
    const missionStyle = document.createElement('style');
    missionStyle.textContent = `
        .msn-section{margin-bottom:6px}
        .msn-sub{font-size:11px;font-weight:700;color:rgba(255,255,255,.55);margin:-2px 2px 8px;letter-spacing:.04em}
        .msn-list{display:flex;flex-direction:column;gap:8px}
        .msn-row{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:14px;
            background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.03));border:1px solid rgba(255,214,140,.16)}
        .msn-row.ready{border-color:rgba(255,210,74,.75);box-shadow:0 0 0 1px rgba(255,210,74,.25),0 0 18px rgba(255,190,40,.25)}
        .msn-row.claimed{opacity:.55}
        .msn-ico{flex:none;width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:21px;
            background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.08)}
        .msn-main{flex:1;min-width:0}
        .msn-text{font-size:13px;font-weight:800;color:#f6efe2;line-height:1.15;margin-bottom:5px}
        .msn-bar{height:7px;border-radius:999px;background:rgba(0,0,0,.4);overflow:hidden}
        .msn-bar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#f0a028,#ffe27a);transition:width .3s}
        .msn-num{font-size:10px;font-weight:700;color:rgba(255,255,255,.55);margin-top:3px;font-variant-numeric:tabular-nums}
        .msn-act{flex:none;min-width:74px;text-align:center}
        .msn-state{display:inline-block;font-size:12px;font-weight:800;color:#ffd24a;padding:6px 8px;border-radius:999px;background:rgba(255,210,74,.10);border:1px solid rgba(255,210,74,.28)}
        .msn-state.done{color:#7be495;background:rgba(80,200,120,.10);border-color:rgba(80,200,120,.30)}
        .msn-claim{font:inherit;font-weight:900;font-size:13px;color:#3a1d05;padding:9px 10px;border:0;border-radius:12px;white-space:nowrap;
            background:linear-gradient(#ffe27a,#f0a028);box-shadow:0 3px 0 #b36d10;animation:msnPulse 1.1s ease-in-out infinite;touch-action:manipulation}
        .msn-claim:active{transform:translateY(2px);box-shadow:0 1px 0 #b36d10}
        @keyframes msnPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
        .msn-toast{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 118px);transform:translate(-50%,-14px);z-index:68;pointer-events:none;
            opacity:0;transition:opacity .25s,transform .25s;max-width:88vw;padding:9px 14px;border-radius:14px;text-align:center;
            font-family:Rubik,system-ui,Arial,sans-serif;direction:ltr;font-size:13px;font-weight:800;color:#3a1d05;
            background:linear-gradient(#ffe27a,#f0a028);box-shadow:0 8px 22px rgba(0,0,0,.45)}
        .msn-toast.on{opacity:1;transform:translate(-50%,0)}
        .pz-box{max-height:92vh;overflow-y:auto;-webkit-overflow-scrolling:touch}   /* מסך הסיום ארוך יותר עכשיו: שלא ייחתך בטלפונים נמוכים */
        .go-stats{display:flex;gap:8px;margin:10px 0 8px}
        .go-stats>div{flex:1;padding:8px 4px;border-radius:12px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.08)}
        .go-stats span{display:block;font-size:11px;font-weight:700;color:rgba(255,255,255,.55);letter-spacing:.06em;text-transform:uppercase}
        .go-stats b{display:block;font-size:19px;color:#ffd24a;font-variant-numeric:tabular-nums}
        .go-card{margin:8px 0 0;padding:10px 12px;border-radius:14px;text-align:left;background:rgba(0,0,0,.28);border:1px solid rgba(255,214,140,.18)}
        .go-card:empty{display:none}
        .go-card.ready{border-color:rgba(255,210,74,.7);box-shadow:0 0 16px rgba(255,190,40,.22)}
        .go-top{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:6px}
        .go-top span{font-size:10px;font-weight:900;letter-spacing:.12em;color:rgba(255,255,255,.55)}
        .go-top b{font-size:14px;color:#fff;text-align:right}
        .go-sub{font-size:12px;font-weight:700;color:rgba(255,255,255,.75);margin-top:6px}
        .go-sub.ok{color:#7be495}
    `;
    document.head.appendChild(missionStyle);

    // ---- הודעה קצרה כשמשימה הושלמה באמצע ריצה ----
    const msnToast = document.createElement('div');
    msnToast.className = 'msn-toast';
    document.body.appendChild(msnToast);
    let msnToastTimer = null;
    function showMissionToast(m) {
        msnToast.textContent = `✓ Mission complete: ${missionText(m)} (+${m.reward} C, claim in menu)`;
        msnToast.classList.add('on');
        clearTimeout(msnToastTimer);
        msnToastTimer = setTimeout(() => msnToast.classList.remove('on'), 2800);
    }

    // ---- כרטיס המשימות בתפריט הפתיחה (נבנה ב-JS, בראש אזור הגלילה) ----
    let msnSection = null;
    function buildMissionsSection() {
        const scroll = splashScreen && splashScreen.querySelector('.splash-scroll');
        if (!scroll) return;
        msnSection = document.createElement('section');
        msnSection.className = 'splash-section msn-section';
        msnSection.innerHTML = `
            <div class="shop-section-title">Daily Missions</div>
            <div class="msn-sub" data-msn="timer"></div>
            <div class="msn-list" data-msn="list"></div>`;
        scroll.insertBefore(msnSection, scroll.firstChild);
        msnSection.addEventListener('click', (e) => {
            const b = e.target.closest('[data-claim]');
            if (b) claimMission(parseInt(b.dataset.claim, 10));
        });
    }
    function renderMissions() {
        if (!msnSection || !missionsState) return;
        if (missionsState.date !== missionDayKey()) loadMissions();
        const now = new Date();
        const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const mins = Math.max(1, Math.round((midnight - now) / 60000));
        msnSection.querySelector('[data-msn="timer"]').textContent = `New missions in ${Math.floor(mins / 60)}h ${mins % 60}m`;
        msnSection.querySelector('[data-msn="list"]').innerHTML = missionsState.list.map((m, i) => {
            const done = missionDone(m);
            const pct = Math.round(Math.min(1, m.progress / m.target) * 100);
            let action;
            if (m.claimed) action = '<span class="msn-state done">Done ✓</span>';
            else if (done) action = `<button class="msn-claim" type="button" data-claim="${i}">Claim +${m.reward}</button>`;
            else action = `<span class="msn-state">+${m.reward} C</span>`;
            return `<div class="msn-row${done && !m.claimed ? ' ready' : ''}${m.claimed ? ' claimed' : ''}">
                <div class="msn-ico">${MISSION_TYPES[m.type].icon}</div>
                <div class="msn-main">
                    <div class="msn-text">${missionText(m)}</div>
                    <div class="msn-bar"><i style="width:${pct}%"></i></div>
                    <div class="msn-num">${Math.min(m.progress, m.target).toLocaleString('en-US')} / ${m.target.toLocaleString('en-US')}</div>
                </div>
                <div class="msn-act">${action}</div>
            </div>`;
        }).join('');
    }
    function claimMission(i) {
        const m = missionsState.list[i];
        if (!m || m.claimed || !missionDone(m)) return;
        m.claimed = true;
        coins += m.reward;
        localStorage.setItem('bb3d_coins', coins);
        saveMissions();
        playSound('coin');
        renderMissions();
        updateUI();
    }

    // ---- מסך הסיום: סטטיסטיקות, מטרה הבאה, ומשימה קרובה ----
    function pickNextGoal() {
        const goals = [
            { label: `Fire Power → Lvl ${firePowerLvl + 1}`, cost: firePowerLvl * 50 },
            { label: `Fire Rate → Lvl ${fireRateLvl + 1}`, cost: fireRateLvl * 60 }
        ];
        if (ownedWeapons.includes(activeWeapon)) {
            const sc = nextStarCost(activeWeapon);
            if (sc !== null) goals.push({ label: `${WEAPONS[activeWeapon].name} → ★${getStars(activeWeapon) + 1}`, cost: sc });
        }
        if (!advancedCannonOwned) goals.push({ label: 'Nova Cannon', cost: ADVANCED_CANNON_PRICE });
        const unaffordable = goals.filter(g => g.cost > coins).sort((a, b) => (a.cost - coins) - (b.cost - coins));
        if (unaffordable.length) return unaffordable[0];            // הכי קרוב להשגה
        return goals.sort((a, b) => b.cost - a.cost)[0];            // הכול בהישג יד: מציעים את היקר ביותר
    }
    function fillGameOverExtras(isNewBest) {
        const q = k => gameOverOverlay.querySelector(`[data-go="${k}"]`);
        q('rocks').textContent = runStats.rocks;
        q('coins').textContent = `+${runStats.coins}`;
        q('level').textContent = runStats.level;

        const gapEl = q('gap');
        if (!isNewBest && bestScore > score && score >= bestScore * 0.5) {
            gapEl.textContent = `Only ${(bestScore - score + 1).toLocaleString('en-US')} to beat your best!`;
            gapEl.style.display = 'block';
        } else gapEl.style.display = 'none';

        const goal = pickNextGoal();
        const can = coins >= goal.cost;
        const pct = Math.round(Math.min(1, coins / goal.cost) * 100);
        const goalEl = q('goal');
        goalEl.classList.toggle('ready', can);
        goalEl.innerHTML = `
            <div class="go-top"><span>NEXT GOAL</span><b>${goal.label}</b></div>
            <div class="msn-bar"><i style="width:${pct}%"></i></div>
            <div class="go-sub${can ? ' ok' : ''}">${can
                ? `Ready to buy! (${goal.cost.toLocaleString('en-US')} C) Open the menu to upgrade`
                : `${coins.toLocaleString('en-US')} / ${goal.cost.toLocaleString('en-US')} C · ${(goal.cost - coins).toLocaleString('en-US')} to go`}</div>`;

        const ready = missionsState.list.find(m => missionDone(m) && !m.claimed);
        const open = missionsState.list.filter(m => !missionDone(m)).sort((a, b) => (b.progress / b.target) - (a.progress / a.target))[0];
        const missionEl = q('mission');
        missionEl.classList.toggle('ready', !!ready);
        if (ready) {
            missionEl.innerHTML = `
                <div class="go-top"><span>MISSION</span><b>🎁 ${missionText(ready)}</b></div>
                <div class="go-sub ok">Complete! Claim +${ready.reward} C in the menu</div>`;
        } else if (open) {
            const mp = Math.round(Math.min(1, open.progress / open.target) * 100);
            missionEl.innerHTML = `
                <div class="go-top"><span>MISSION</span><b>${missionText(open)}</b></div>
                <div class="msn-bar"><i style="width:${mp}%"></i></div>
                <div class="go-sub">${open.progress.toLocaleString('en-US')} / ${open.target.toLocaleString('en-US')} · +${open.reward} C</div>`;
        } else {
            missionEl.innerHTML = `<div class="go-top"><span>MISSION</span><b>All done today ✓</b></div><div class="go-sub">New missions tomorrow</div>`;
        }
        const menuBtn = gameOverOverlay.querySelector('[data-act="menu"]');
        if (menuBtn) menuBtn.textContent = (ready || can) ? '🏠 Menu 🎁' : '🏠 Menu';
    }

    // ---- אתחול ושמירה ----
    loadMissions();
    buildMissionsSection();
    renderMissions();
    setInterval(() => {
        if (splashScreen && !splashScreen.classList.contains('hidden')) renderMissions();
    }, 30000);
    window.addEventListener('pagehide', saveMissions);
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveMissions(); });

    // ==========================================
    // שמיים חיים: מטוסים מאחורי הפירמידות (שלב 2)
    // ==========================================
    // אפשר לשנות כאן. מהירות ביחידות לשנייה (לא תלוי במהירות המסך).
    const SKY_PLANE_SPEED = 1.0;      // מכפיל מהירות מטוסים
    // תדירות המטוסים: אחרי שמטוס יוצא מהמסך הוא נעלם ומופיע שוב רק אחרי הפסקה אקראית בין שני הערכים (בשניות).
    // להגדיל = מטוסים נדירים יותר, להקטין = תכופים יותר.
    const SKY_PLANE_GAP_MIN = 35;
    const SKY_PLANE_GAP_MAX = 70;
    const SKY_PLANE_FIRST_MIN = 10;   // הופעה ראשונה אחרי תחילת המשחק (שניות)
    const SKY_PLANE_FIRST_MAX = 25;

    const skyGroup = new THREE.Group();
    scene.add(skyGroup);   // לא ב-mapGroup, כדי ש-buildMap לא ימחק אותם

    // פס עשן למטוס: טקסטורה מדרגת שקיפות.
    function makeContrailTexture() {
        const c = document.createElement('canvas');
        c.width = 256; c.height = 8;
        const g = c.getContext('2d');
        const grad = g.createLinearGradient(0, 0, 256, 0);
        grad.addColorStop(0, 'rgba(255,240,220,0.0)');
        grad.addColorStop(0.35, 'rgba(255,236,210,0.28)');
        grad.addColorStop(1, 'rgba(255,230,200,0.55)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 256, 8);
        return new THREE.CanvasTexture(c);
    }
    const contrailTex = makeContrailTexture();
    const planeMat = new THREE.MeshBasicMaterial({ color: 0x35252d, fog: false });
    const planeLightMat = new THREE.MeshBasicMaterial({ color: 0xff3a30, fog: false });

    const skyPlanes = [];
    [
        { y: 26, z: -74, s: 3.2, v: 9, x: -70, jet: true },
        { y: 20, z: -68, s: 2.4, v: -6, x: 75, jet: false }
    ].forEach(p => {
        const g = new THREE.Group();
        const dir = Math.sign(p.v);
        const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 3.2, 8), planeMat);
        fus.rotation.z = Math.PI / 2;
        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 8), planeMat);
        nose.rotation.z = -Math.PI / 2;
        nose.position.x = 1.85;
        const wing = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.05, 3.2), planeMat);
        wing.position.set(0.2, -0.02, 0);
        const tailWing = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 2.4), planeMat);
        tailWing.position.set(-1.35, 0.0, 0);
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.06), planeMat);
        fin.position.set(-1.45, 0.5, 0);
        g.add(fus, nose, wing, tailWing, fin);
        if (p.jet) {
            [-0.7, 0.7].forEach(z => {
                const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 8), planeMat);
                eng.rotation.z = Math.PI / 2;
                eng.position.set(0.3, -0.18, z);
                g.add(eng);
            });
        }
        const light = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), planeLightMat);
        light.position.set(-1.55, 0.95, 0);
        g.add(light);

        const trail = new THREE.Mesh(
            new THREE.PlaneGeometry(10, 0.3),
            new THREE.MeshBasicMaterial({ map: contrailTex, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })
        );
        trail.position.set(-6.7, 0, 0);
        g.add(trail);

        g.scale.set(p.s * dir, p.s, p.s);   // dir=-1 הופך כיוון טיסה
        const startX = dir > 0 ? -80 : 80;
        g.position.set(startX, p.y, p.z);
        g.visible = false;                  // המטוס מחכה מחוץ למסך עד שהטיימר מסתיים
        g.userData = {
            v: p.v, y: p.y, light, startX,
            wait: SKY_PLANE_FIRST_MIN + Math.random() * (SKY_PLANE_FIRST_MAX - SKY_PLANE_FIRST_MIN)
        };
        skyGroup.add(g);
        skyPlanes.push(g);
    });

    let skyLastTime = null;
    function updateSkyTraffic(time) {
        if (selectedMap === 'volcano') {   // במפת הטירה אין מטוסים
            skyPlanes.forEach(p => { p.visible = false; p.userData.wait = SKY_PLANE_FIRST_MIN; });
            return;
        }
        if (skyLastTime === null) skyLastTime = time;
        const dt = Math.min(0.1, Math.max(0, (time - skyLastTime) / 1000));
        skyLastTime = time;
        const t = time * 0.001;

        skyPlanes.forEach(p => {
            const u = p.userData;

            // ממתין מחוץ למסך עד שהטיימר מסתיים, ואז יוצא למעבר חדש.
            if (u.wait > 0) {
                u.wait -= dt;
                if (u.wait > 0) return;
                p.position.x = u.startX;
                p.visible = true;
            }

            p.position.x += u.v * SKY_PLANE_SPEED * dt;
            p.position.y = u.y + Math.sin(t * 0.3 + u.v) * 0.4;
            u.light.visible = (Math.floor(t * 1.6) % 2) === 0;

            // סיים את המעבר: נעלם ומחכה הפסקה אקראית לפני המעבר הבא.
            if ((u.v > 0 && p.position.x > 80) || (u.v < 0 && p.position.x < -80)) {
                p.visible = false;
                u.wait = SKY_PLANE_GAP_MIN + Math.random() * (SKY_PLANE_GAP_MAX - SKY_PLANE_GAP_MIN);
            }
        });
    }

    // ==========================================
    // 11. לולאת המשחק
    // ==========================================
    function animate(time) {
        requestAnimationFrame(animate);
        if (grassWind) grassWind.uTime.value = time * 0.001;
        if (!isPaused) updateSkyTraffic(time);
        updateVolcanoFx(time);

        if (!isGameStarted || isPaused || isGameOver || awaitingStart) {
            renderer.render(scene, camera);
            return;
        }

        updateWeatherParticles();

        // ======================================
        // תנועת התותח + רתיעה קטנה בירי
        // ======================================
        cannonGroup.position.x += (targetX - cannonGroup.position.x) * 0.2;
        cannonShadow.position.x += (cannonGroup.position.x - cannonShadow.position.x) * 0.3;
        cannonShadowSoft.position.x += (cannonGroup.position.x - cannonShadowSoft.position.x) * 0.32;
        {
            const shK = CANNON_SCALE / CANNON_BASE_SCALE;
            cannonShadow.scale.set(1.18 * shK, 0.76 * shK, 1);
            cannonShadowSoft.scale.set(1.10 * shK, 0.58 * shK, 1);
        }
        cannonRecoil *= 0.78;

        // רתיעה מכנית של מכלול הקנים - בנוסף לתנועת הגוף.
        barrelAssembly.position.z +=
            ((-cannonRecoil * 0.65) - barrelAssembly.position.z) * 0.35;
        mk2BarrelsRig.position.z = barrelAssembly.position.z - 0.05;
        if (advancedCannonGroup.visible) {
            advancedBarrelAssembly.position.y +=
                ((advancedBarrelAssembly.userData.baseY - cannonRecoil * 0.35) - advancedBarrelAssembly.position.y) * 0.35;
        }

        // הגלגלים נשארים על הקרקע; הגוף הוא זה שצולל ומתרומם על המתלים.
        cannonGroup.position.y = cannonBaseY;
        updateSuspensionMotion();

        // MK-II משתמש באותה תנועת גוף/מתלים בדיוק כמו התותח המקורי.
        // הוא נשאר תותח חדש מבחינת העיצוב, אבל לא מקבל מערכת תנועה נפרדת.
        if (activeCannon === 'mk2') {
            advancedCannonGroup.position.set(
                bodyRig.position.x,
                bodyRig.position.y - BODY_PIVOT_Y + TIRE_GROUND_DROP * (MK2_SCALE - 1),
                bodyRig.position.z
            );
            advancedCannonGroup.rotation.copy(bodyRig.rotation);
            updateMk2Glow(time);

            // הגלגלים של MK-II מסתובבים בדיוק כמו הגלגלים של התותח הקלאסי.
            for (let wi = 0; wi < advancedCannonWheels.length && wi < classicCannonWheels.length; wi++) {
                const srcSpin = classicCannonWheels[wi].userData.spinGroup;
                const dstSpin = advancedCannonWheels[wi].userData.spinGroup;
                if (srcSpin && dstSpin) dstSpin.rotation.z = srcSpin.rotation.z / (MK2_WS * MK2_SCALE);
            }
        }

        // ======================================
        // גלגול הגלגלים - תנועה אופקית אמיתית
        // ======================================
        // התותח נע על ציר X, ולכן הגלגלים צריכים להסתובב סביב ציר Z.
        // אין כאן היגוי נוסף: כל הגלגלים נשארים ישרים ומתגלגלים באותה מהירות.
        const currentCannonX = cannonGroup.position.x;
        const previousCannonX = cannonGroup.userData.previousWheelX ?? currentCannonX;
        const wheelTravel = currentCannonX - previousCannonX;
        const wheelRadius = 0.60 * CANNON_SCALE;
        const spinAmount = wheelRadius > 0.001 ? wheelTravel / wheelRadius : 0;

        cannonWheels.forEach(wheelOuter => {
            if (wheelOuter.userData.spinGroup && Math.abs(spinAmount) > 0.000001) {
                wheelOuter.userData.spinGroup.rotation.z -= spinAmount;
            }
        });

        cannonGroup.userData.previousWheelX = currentCannonX;

        // ======================================
        // ירי
        // ======================================
        {
            // מיקום הקנים של התותח הפעיל
            let muzzleXs, muzzleY;
            if (activeCannon === 'mk2') {
                muzzleY = cannonGroup.position.y + MK2_MUZZLE_Y * CANNON_SCALE;
                muzzleXs = MK2_BARREL_X.map(bxw => cannonGroup.position.x + bxw * CANNON_SCALE);
            } else {
                muzzleY = cannonGroup.position.y + (1.5 + CANNON_BODY_LIFT) * CANNON_SCALE;
                muzzleXs = [cannonGroup.position.x - 0.35 * CANNON_SCALE, cannonGroup.position.x + 0.35 * CANNON_SCALE];
            }

            streamMuzzleXs = muzzleXs;
            streamMuzzleY = muzzleY;

            {
                hideLaser();
                const shotInterval = activeWeapon === 'rocket' ? 1000 / (fireRate * ROCKET_RATE) : 1000 / (fireRate * 4);
                if (time - lastShotTime > shotInterval) {
                    if (activeWeapon === 'lightning') {
                        const spacing = Math.max(0.2, shotInterval / 16.667 * 0.42);   // מרחק בין קליעים עוקבים
                        lightningOrbEvery = Math.max(1, Math.round(PLASMA_ORB_GAP / spacing));
                    }
                    muzzleXs.forEach((bx, bi) => {
                        if (activeWeapon === 'rocket') spawnRocket(bx, muzzleY, 0);
                        else if (activeWeapon === 'laser') {
                            if (laserDoubleBolts()) { spawnLaserBolt(bx - 0.17, muzzleY); spawnLaserBolt(bx + 0.17, muzzleY); }
                            else spawnLaserBolt(bx, muzzleY);
                        }
                        else spawnBullet(bx, muzzleY, 0, activeWeapon === 'lightning' ? 'lightning' : null, bi);
                        spawnMuzzleFlash(bx, muzzleY, 0, activeWeapon === 'lightning' ? 0x9fe6ff : undefined);
                    });
                    if (activeWeapon === 'standard') {
                        const fan = standardFanAngles();
                        if (fan.length) {
                            fanToggle = !fanToggle;   // בכל ירייה שנייה, כדי לא להכביד
                            if (fanToggle) {
                                fan.forEach(ang => {
                                    const fb = spawnBullet(cannonGroup.position.x, muzzleY, 0, null, 0);
                                    fb.userData.vx = 0.42 * Math.tan(ang);
                                    fb.rotation.z = -ang;
                                });
                            }
                        }
                    }
                    cannonRecoil = 0.14;
                    suspensionKick(0.016, 0.010);
                    lastShotTime = time;
                }
            }
        }

        // ======================================
        // כדורים
        // ======================================
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            b.position.y += (b.userData && b.userData.speed) || 0.42;
            if (b.userData && b.userData.vx) b.position.x += b.userData.vx;
            if (b.userData && b.userData.flame) b.userData.flame.scale.set(1, 0.75 + Math.random() * 0.55, 1);

            if (b.position.y > 18 || Math.abs(b.position.x) > 16) {
                scene.remove(b);
                bullets.splice(i, 1);
            }
        }

        updatePlasmaOrbs(time);
        updateLaserBolts(time);

        // ======================================
        // סלעים
        // ======================================
        // מהירות התותח בפריים הזה (לחישוב קפיצה נכונה כשהוא נע לתוך סלע).
        const cannonColVx = cannonGroup.position.x - (cannonGroup.userData.prevColX ?? cannonGroup.position.x);
        cannonGroup.userData.prevColX = cannonGroup.position.x;

        for (let rIdx = rocks.length - 1; rIdx >= 0; rIdx--) {
            const r = rocks[rIdx];
            const data = r.userData;

            if (data.hitCooldown > 0) data.hitCooldown -= 1;
            if (data.isBoss) updateBossMotion(r, data);

            // הבהוב פגיעה: הסלע מתחמם לרגע ו"קופץ" מעט בגודל, ואז חוזר לרגיל.
            if (data.flash > 0) {
                data.flash = Math.max(0, data.flash - 0.12);
                r.material.emissive.copy(data.baseEmissive).lerp(ROCK_FLASH_COLOR, data.flash);
                r.material.emissiveIntensity = 0.5 + data.flash * 0.8;
                r.scale.setScalar(1 + data.flash * 0.05);
            }

            if (!data.entering && !data.isBoss) data.vy -= data.g;     // בכניסה מהצד אין כבידה. הבוס מרחף
            r.position.x += data.vx;
            r.position.y += data.vy;
            if (data.entering && Math.abs(r.position.x) <= screenLimitX) data.entering = false;
            data.rotZ = -data.vx / data.size * 0.9;     // גולל לכיוון התנועה
            r.rotation.x += data.rotX;
            r.rotation.y += data.rotY;
            r.rotation.z += data.rotZ;

            // צל מגע דינמי: כשהסלע עולה, הצל קטן ונחלש.
            if (data.contactShadow) {
                const shadow = data.contactShadow;
                const heightAboveGround = Math.max(0, r.position.y - data.size);
                const squash = THREE.MathUtils.clamp(
                    1.0 - heightAboveGround * 0.055,
                    0.34,
                    1.0
                );

                shadow.position.x = r.position.x;
                shadow.position.z = r.position.z;
                shadow.scale.set(
                    data.size * (0.90 + squash * 0.18),
                    data.size * (0.42 + squash * 0.10),
                    1
                );
                shadow.material.opacity = THREE.MathUtils.clamp(
                    0.20 - heightAboveGround * 0.010,
                    0.055,
                    0.20
                );
            }

            // ==================================
            // קפיצות מהקרקע
            // ==================================
            if (r.position.y - data.size < 0.2) {
                r.position.y = 0.2 + data.size;
                data.vy = data.bounceVy;                               // תמיד אותו גובה קפיצה (בלי איבוד אנרגיה)
                data.vx = (Math.sign(data.vx) || 1) * data.speedX;     // מהירות אופקית קבועה
                spawnDustBurst(r.position.x, 0.25, r.position.z);
            }

            // ==================================
            // גבולות X
            // ==================================
            if (!data.entering && Math.abs(r.position.x) > screenLimitX) {
                data.vx *= -1;
                r.position.x = Math.sign(r.position.x) * screenLimitX;
            }

            // התנגשות בין כל זוגות הסלעים: מבוצעת פעם אחת בכל פריים.
            // כך סלעים שנפגשים באמת דוחפים, מפרידים ומעבירים תנע אחד לשני.
            if (rIdx === 0 && ROCK_COLLIDE_EACH_OTHER) {
                resolveRockRockCollisions();
            }

            // ==================================
            // פגיעה של כדור בסלע
            // ==================================
            for (let bIdx = bullets.length - 1; bIdx >= 0; bIdx--) {
                const b = bullets[bIdx];

                if (b.position.distanceTo(r.position) < data.size * 0.88) {
                    scene.remove(b);
                    bullets.splice(bIdx, 1);

                    // רקטות וברק: הנזק מחושב אחרי הלולאה (פיצוץ באזור / קפיצה בין סלעים)
                    const wtype = b.userData && b.userData.weapon;
                    if (wtype === 'rocket' || wtype === 'lightning') {
                        pendingWeaponHits.push({ type: wtype, rock: r, x: b.position.x, y: b.position.y });
                        data.flash = 1;
                        playSound('hit');
                        continue;
                    }

                    const shotDmg = Math.max(1, Math.round(firePower * ((b.userData && b.userData.dmgMult) || 1)));
                    data.hp -= shotDmg;
                    data.flash = 1;
                    score += shotDmg;
                    spawnImpactBurst(r.position.x, r.position.y, r.position.z);
                    playSound('hit');

                    if (data.hp <= 0) {
                        if (Math.random() > 0.3) spawnCoin(r.position.x, r.position.y);

                        splitRockIntoChildren(r, data);
                        missionOnRock();

                        removeRock(r, rIdx);
                        updateUI();
                        break;
                    } else {
                        updateRockLabel(r);
                    }
                }
            }

            if (!rocks[rIdx]) continue;

            // ==================================
            // פגיעה בתותח
            // ==================================
            const cannonImpact = data.isBoss ? 0 : collideRockWithCannon(r, cannonColVx);   // הבוס לא נוגע בתותח
            if (cannonImpact > 0.02 && data.hitCooldown <= 0) {
                playerHp -= 10;
                data.hitCooldown = 24;
                cannonRecoil = -0.08;
                suspensionKick(0.032, 0);
                spawnDustBurst(r.position.x, Math.max(0.3, r.position.y - data.size * 0.5), 0);
                updateUI();

                if (playerHp <= 0) {
                    triggerGameOver();
                    return;
                }
            }
        }

        processWeaponHits();

        // ==========================================
        // מטבעות - שאיבה אוטומטית כברירת מחדל
        // ==========================================
        // כל מטבע שנוצר במשחק נשאב אוטומטית ומהר אל התותח.
        for (let cIdx = droppedCoins.length - 1; cIdx >= 0; cIdx--) {
            const c = droppedCoins[cIdx];

            const targetX = cannonGroup.position.x;
            const targetY = cannonGroup.position.y + 1.05;
            const targetZ = 0.58;

            const dx = targetX - c.position.x;
            const dy = targetY - c.position.y;
            const dz = targetZ - c.position.z;
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

            // שאיבה מהירה וברורה: רחוק = מהיר יותר, קרוב = מעט עדין יותר.
            const suctionSpeed = Math.min(
                0.42,
                0.14 + distance * 0.055
            );

            if (distance > 0.001) {
                c.position.x += (dx / distance) * suctionSpeed;
                c.position.y += (dy / distance) * suctionSpeed;
                c.position.z += (dz / distance) * suctionSpeed;
            }

            // סיבוב 3D בזמן השאיבה.
            c.userData.spin += 0.13;
            c.userData.bob += 0.08;
            c.rotation.y = c.userData.spin;
            c.rotation.z = Math.sin(c.userData.bob) * 0.10;

            // הגעה לאזור הכיפה = איסוף מיידי.
            if (distance <= 0.82) {
                coins += 5;
                missionOnCoin(5);
                playSound('coin');
                disposeCoin(c);
                droppedCoins.splice(cIdx, 1);
                updateUI();
                continue;
            }

            // Fail-safe נגד מטבע שאבד בגלל מצב קצה.
            if (
                c.position.y < -2 ||
                !Number.isFinite(c.position.x) ||
                !Number.isFinite(c.position.y) ||
                !Number.isFinite(c.position.z)
            ) {
                coins += 5;
                missionOnCoin(5);
                playSound('coin');
                disposeCoin(c);
                droppedCoins.splice(cIdx, 1);
                updateUI();
            }
        }

        updateEffects();
        updateWeaponFx();
        startNextWave();

        // מצלמת 3D דינמית: זום אאוט (יותר חלל נסיעה) + מעקב אחרי התותח
        // שמתחיל כשהוא מתקרב לקצה ימין/שמאל.
        const cannonX = cannonGroup.position.x;

        // מרחק שעבר את "אזור המרכז" (55% מהגבול) — רק שם המצלמה מתחילה לעקוב חזק.
        const edgeStart = screenLimitX * 0.55;
        const edgeOver = Math.sign(cannonX) * Math.max(0, Math.abs(cannonX) - edgeStart);

        const cameraTargetX = cannonX * 0.10 + edgeOver * 1.15;
        const cameraTargetY = CAM_BASE_Y + 0.2 + Math.abs(cannonX) * 0.035;
        const cameraTargetZ = CAM_BASE_Z + 0.2 + Math.abs(cannonX) * 0.045;

        camera.position.x += (cameraTargetX - camera.position.x) * 0.06;
        camera.position.y += (cameraTargetY - camera.position.y) * 0.035;
        camera.position.z += (cameraTargetZ - camera.position.z) * 0.035;

        const lookX = cannonX * 0.08 + edgeOver * 0.75;
        const lookY = 2.45 + cannonRecoil * 0.15;
        const lookZ = -8.1;

        if (MK2_PREVIEW) {
            camera.position.set(cannonX, 5.4, 12.5);
            camera.lookAt(cannonX, 1.8, 0);
        } else {
            camera.lookAt(lookX, lookY, lookZ);
        }

        renderer.render(scene, camera);
    }

    // ==========================================
    // מסך מלא + מניעת זום
    // ==========================================

    // מניעת זום בלחיצה כפולה ובצביטה (לא פוגע בלחיצות על כפתורים)
    document.documentElement.style.touchAction = 'pan-x pan-y';
    document.body.style.touchAction = 'pan-x pan-y';
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(type => {
        document.addEventListener(type, e => e.preventDefault(), { passive: false });
    });
    document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });

    // בקשת מסך מלא פעם אחת בלבד, ולא בכל לחיצה
    let fullscreenTried = false;
    document.addEventListener('click', () => {
        if (fullscreenTried) return;
        fullscreenTried = true;
        const el = document.documentElement;
        if (!document.fullscreenElement && el.requestFullscreen) {
            el.requestFullscreen({ navigationUI: 'hide' })
                .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('portrait'))
                .catch(() => {});
        }
    });

    // סנכרון גודל ה-canvas והמצלמה לגודל המסך האמיתי
    function syncViewport() {
        // גובה אמיתי אחד לכל המסך (ה-CSS משתמש ב-var(--app-h) לרקע, לתפריט ולקנבס)
        document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
        updateCameraForDevice();
        updateMobileViewportState();
        // setSize(..., false) לא מעדכן את ה-style של ה-canvas, אז עושים את זה ידנית
        renderer.domElement.style.width = window.innerWidth + 'px';
        renderer.domElement.style.height = window.innerHeight + 'px';
    }

    window.addEventListener('resize', syncViewport);
    document.addEventListener('fullscreenchange', () => {
        syncViewport();
        setTimeout(syncViewport, 150);
    });
    window.addEventListener('orientationchange', () => {
        setTimeout(syncViewport, 120);
    });
    // חזרה אחורה / חזרה לדף מהזיכרון, ושינויי סרגל הכתובת בטלפון
    window.addEventListener('pageshow', () => {
        syncViewport();
        setTimeout(syncViewport, 150);
    });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', syncViewport);
    }
    syncViewport();

    animate(0);
});