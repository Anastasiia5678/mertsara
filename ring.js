(() => {
  const C = Object.assign({
    color: 0xe2b24a,      
    emissive: 0xffb347,  
    metalness: 0.6,
    roughness: 0.28,
    glow: 1.6,            
    spark: 0xffe3a0,     
    light: 0xffc477,     
    sky: 0xfff1d0,        
    ground: 0x2a2040      
  }, window.COLLECTION || {});

  const N = 200, PER_ROW = 50, STONE = 12, CAM_Z = 30;
  const clamp01 = v => Math.min(1, Math.max(0, v));
  const ph = (s, a, b) => clamp01((s - a) / (b - a));
  const stagger = (p, delay, spread) => clamp01((p - delay * spread) / (1 - spread));
  const ease = t => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const smooth = t => t * t * (3 - 2 * t);

  
  const canvas = document.getElementById('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
  camera.position.set(0, 0, CAM_Z);

  scene.add(new THREE.HemisphereLight(C.sky, C.ground, 1.0));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(8, 14, 20);
  scene.add(key);
  const rim = new THREE.PointLight(C.light, 2.4, 90);
  scene.add(rim);

  
  function starGeometry() {
    const sh = new THREE.Shape();
    for (let k = 0; k < 10; k++) {
      const a = Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 0.45 : 1;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      k ? sh.lineTo(x, y) : sh.moveTo(x, y);
    }
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, {
      depth: 0.35, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 2
    });
    g.translate(0, 0, -0.175);
    return g;
  }
  const material = new THREE.MeshStandardMaterial({
    color: C.color, metalness: C.metalness, roughness: C.roughness,
    emissive: C.emissive, emissiveIntensity: 0
  });
  const mesh = new THREE.InstancedMesh(starGeometry(), material, N);
  mesh.frustumCulled = false;
  scene.add(mesh);

  new THREE.GLTFLoader().load('untitled.glb', (gltf) => {
      let g;
      gltf.scene.traverse((c) => { if (c.isMesh) g = c.geometry; });
      if (!g) return console.error('В модели нет Mesh');
      g = g.clone();
      g.center();
      g.computeBoundingSphere();
      const k = 1 / g.boundingSphere.radius;
      g.scale(k, k, k);
      mesh.geometry = g;
    }, undefined, (err) => console.error(err));
  
  function spriteTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(.25, 'rgba(255,255,255,.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  const SPARKS = 260;
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3));
  const sparkMat = new THREE.PointsMaterial({
    map: spriteTexture(), size: 0.8, sizeAttenuation: true, transparent: true,
    opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: C.spark
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  scene.add(sparks);

  
  const V = () => new THREE.Vector3();
  const start = [], ringT = [], cur = [], off = [], rot0 = [];
  const dFall = new Float32Array(N), spin = new Float32Array(N),
        ph0 = new Float32Array(N), kick = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    start.push(V()); ringT.push(V()); cur.push(V()); off.push(V());
    rot0.push(new THREE.Vector3(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28));
    dFall[i] = Math.random();
    spin[i] = (Math.random() - .5) * 2.4;
    ph0[i] = Math.random() * 6.28;
    mesh.setColorAt(i, new THREE.Color(1, 1, 1));
  }

  let viewW = 1, viewH = 1, starR = 0.3, ringR = 5, pushR = 5, cx = 0, cy = 0;

  function layout() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    viewH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * CAM_Z;
    viewW = viewH * camera.aspect;

    ringR = Math.min(viewW * 0.3, viewH * 0.17);
    const tube = ringR * 0.16;
    starR = Math.max(0.15, (2 * Math.PI * ringR / PER_ROW) * 0.62);
    cx = 0; cy = viewH * 0.07;               
    pushR = viewW * 0.2;

    
    for (let i = 0; i < N; i++) {
      const k = i % PER_ROW, row = Math.floor(i / PER_ROW);
      const th = (k / PER_ROW) * Math.PI * 2;
      const phi = (row / 4) * Math.PI * 2 + k * 0.45;
      const rad = ringR + tube * Math.cos(phi);
      ringT[i].set(rad * Math.cos(th), tube * Math.sin(phi), rad * Math.sin(th));
      start[i].set((Math.random() - .5) * viewW * .95, (Math.random() - .5) * viewH * .85,
                   (Math.random() - .5) * 10);
    }
    ringT[STONE].set(0, tube * 0.2, ringR + tube * 1.7);   

    const p = sparkGeo.attributes.position;
    for (let i = 0; i < SPARKS; i++) {
      const a = Math.random() * 6.28, b = Math.acos(2 * Math.random() - 1), r = ringR * (0.8 + Math.random() * 1.4);
      p.setXYZ(i, cx + r * Math.sin(b) * Math.cos(a), cy + r * Math.sin(b) * Math.sin(a) * 0.8,
               r * Math.cos(b) * 0.6);
    }
    p.needsUpdate = true;
  }

  
  let sT = 0, sS = 0;
  const caps = [...document.querySelectorAll('.caption')];
  const flash = document.getElementById('flash');
  function onScroll() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    sT = max > 0 ? clamp01(window.scrollY / max) : 0;
  }

  
  const ptr = new THREE.Vector2();
  let ptrOn = false, down = null;
  const toWorld = (x, y) => ptr.set(((x / innerWidth) * 2 - 1) * viewW / 2,
                                    -((y / innerHeight) * 2 - 1) * viewH / 2);
  addEventListener('pointermove', e => { toWorld(e.clientX, e.clientY); ptrOn = true; });
  addEventListener('pointerdown', e => {
    toWorld(e.clientX, e.clientY); ptrOn = true;
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  addEventListener('pointerup', e => {
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 12 &&
        performance.now() - down.t < 500) {
      toWorld(e.clientX, e.clientY);
      const R = Math.max(viewW * 0.22, starR * 6);
      for (let i = 0; i < N; i++) {
        const d = Math.hypot(cur[i].x - ptr.x, cur[i].y - ptr.y);
        if (d < R) kick[i] = Math.max(kick[i], 1 - d / R);
      }
    }
    down = null;
    if (e.pointerType !== 'mouse') ptrOn = false;
  });
  addEventListener('pointercancel', () => { down = null; ptrOn = false; });
  document.addEventListener('mouseleave', () => { ptrOn = false; });

  const dummy = new THREE.Object3D();
  const p = new THREE.Vector3(), tgt = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, 'XYZ');
  const color = new THREE.Color();
  const TILT = -1.0;
  let last = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000) || 0.016; last = now;
    const t = now / 1000;
    sS += (sT - sS) * (1 - Math.exp(-dt * 7));
    const s = sS;

    const pG = ph(s, .20, .55);                       
    const settle = smooth(ph(s, .50, .78));           
    const blaze = smooth(ph(s, .70, .80));            
    material.emissiveIntensity = (settle * C.glow * 0.6 + blaze * C.glow * 0.9)
                               * (0.88 + 0.12 * Math.sin(t * 6));

    euler.set(TILT, Math.sin(t * 0.35) * 0.45 + (s - 0.5) * 0.6, 0);

    for (let i = 0; i < N; i++) {
      const g = ease(stagger(pG, dFall[i], .55));

      
      const ang = (1 - g) * 2.4, ca = Math.cos(ang), sa = Math.sin(ang);
      p.set(start[i].x * ca - start[i].y * sa, start[i].x * sa + start[i].y * ca, start[i].z);

      tgt.copy(ringT[i]).applyEuler(euler);
      tgt.x += cx; tgt.y += cy;
      p.lerp(tgt, g);

      const idle = 1 - g;                             
      p.x += Math.sin(t * .8 + ph0[i]) * 0.25 * idle;
      p.y += Math.cos(t * .6 + ph0[i]) * 0.25 * idle;

     
      const o = off[i];
      let tx = 0, ty = 0;
      if (ptrOn) {
        const dx = p.x - ptr.x, dy = p.y - ptr.y, d = Math.hypot(dx, dy);
        if (d < pushR && d > 0.001) {
          const k = Math.pow(1 - d / pushR, 2) * viewW * 0.07;
          tx = dx / d * k; ty = dy / d * k;
        }
      }
      o.x += (tx - o.x) * 0.2; o.y += (ty - o.y) * 0.2;
      p.x += o.x; p.y += o.y;
      cur[i].copy(p);

      let kk = kick[i];
      if (kk > 0) kick[i] = kk = Math.max(0, kk - dt * 1.6);

      dummy.position.copy(p);
      dummy.rotation.set(
        (rot0[i].x + t * spin[i]) * (1 - g) + Math.sin(t + ph0[i]) * 0.2 * g,
        (rot0[i].y + t * spin[i]) * (1 - g) + Math.sin(t * 1.2 + ph0[i]) * 0.6 * g + kk * 6,
        rot0[i].z * (1 - g)
      );
      const isStone = i === STONE;
      const sc = isStone ? 2.6 + blaze * 1.2 + Math.sin(t * 3) * 0.15 * blaze
                         : 1 + kk * 1.2;
      dummy.scale.setScalar(starR * sc);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      const br = isStone ? 1.5 + blaze * 1.5 : 1 + kk * 0.9;
      mesh.setColorAt(i, color.setRGB(br, br, br));
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;

    rim.position.set(Math.sin(t * .7) * 12, Math.cos(t * .5) * 10, 10);
    sparkMat.opacity = smooth(ph(s, .76, .86)) * (0.65 + 0.35 * Math.sin(t * 5));
    sparks.rotation.z = t * 0.04;
    if (flash) flash.style.opacity = Math.max(0, 1 - Math.abs(s - .8) / .03) * 0.85;

    caps.forEach(el => {
      el.classList.toggle('on', s >= +el.dataset.from && s <= +el.dataset.to);
    });
    renderer.render(scene, camera);
  }

  addEventListener('resize', () => { layout(); onScroll(); });
  addEventListener('scroll', onScroll, { passive: true });
  layout(); onScroll(); sS = sT;
  requestAnimationFrame(frame);
})();
