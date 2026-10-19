// BuildBin station — interactive 3D viewer (model built in Blender, exported as GLB)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export function mountStation(el, { onPick, streams } = {}) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  camera.position.set(9.5, 6.2, 9.5);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 6; controls.maxDistance = 22;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.target.set(0, 1.1, 0);
  controls.autoRotate = !reduce;
  controls.autoRotateSpeed = 0.6;

  const key = new THREE.DirectionalLight(0xfff3e6, 2.4); key.position.set(6, 10, 7); scene.add(key);
  const rim = new THREE.DirectionalLight(0xdfe8ff, 1.2); rim.position.set(-8, 5, -6); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xeef1f3, 0x1c2126, 0.6));

  // ground disc
  const ground = new THREE.Mesh(new THREE.CircleGeometry(9, 64), new THREE.MeshStandardMaterial({ color: 0x1c2126, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);

  const groups = {};     // stream id -> meshes
  const flaps = {};      // stream id -> {obj, closed, open}
  let model;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load(el.dataset.model, (gltf) => {
    model = gltf.scene;
    // Blender Z-up -> glTF Y-up is handled by the exporter
    model.traverse((o) => {
      const m = o.name.match(/^(Contents|Flap|Wall|Num|Lbl)_(\w+?)(?:\.\d+)?$/);
      if (m) {
        const id = m[2];
        (groups[id] ||= []).push(o);
        o.userData.stream = id;
        if (m[1] === 'Flap') flaps[id] = { obj: o, closed: o.rotation.x, target: o.rotation.x };
      }
      if (o.isMesh) { o.material = o.material.clone(); o.userData.baseEmissive = o.material.emissive?.clone(); }
    });
    scene.add(model);
    el.classList.add('is-loaded');
  });

  const ray = new THREE.Raycaster(); const ptr = new THREE.Vector2();
  let downAt = 0;
  renderer.domElement.addEventListener('pointerdown', () => { downAt = performance.now(); controls.autoRotate = false; camGoal = null; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (performance.now() - downAt > 250 || !model) return;
    const r = renderer.domElement.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObject(model, true).find((h) => {
      let o = h.object; while (o && !o.userData.stream) o = o.parent; return o;
    });
    if (hit) { let o = hit.object; while (!o.userData.stream) o = o.parent; select(o.userData.stream); onPick?.(o.userData.stream); }
  });

  let selected = null; let camGoal = null;
  function select(id) {
    selected = id;
    controls.autoRotate = false;
    const c = groups[id]?.find((o) => o.name.startsWith('Contents'));
    if (c) {
      const box = new THREE.Box3().setFromObject(c); const ctr = box.getCenter(new THREE.Vector3());
      const dist = camera.position.distanceTo(controls.target);
      const dir = new THREE.Vector3(ctr.x * 0.35, 0.55, Math.sign(ctr.z) || 1).normalize();
      camGoal = controls.target.clone().add(dir.multiplyScalar(dist));
    }
    for (const [sid, list] of Object.entries(groups)) {
      for (const o of list) if (!/^(Num|Lbl)_/.test(o.name)) o.traverse((m) => {
        if (!m.isMesh || !m.material.emissive) return;
        m.material.emissive.set(sid === id ? 0x5e3a22 : 0x000000);
        m.material.emissiveIntensity = sid === id ? 0.6 : 0;
      });
    }
    // GLB is exported with every flap closed; open the picked bay's flap outward
    for (const [sid, f] of Object.entries(flaps)) {
      f.target = sid === id ? f.closed + (f.obj.position.z > 0 ? -1.2 : 1.2) : f.closed;
    }
  }

  function resize() {
    const w = el.clientWidth, h = el.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    camera.position.setLength(w < 640 ? 17 : 14);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(el); resize();

  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(el);
  renderer.setAnimationLoop(() => {
    if (!visible) return;
    for (const f of Object.values(flaps)) f.obj.rotation.x += (f.target - f.obj.rotation.x) * 0.12;
    if (camGoal) { camera.position.lerp(camGoal, 0.08); if (camera.position.distanceTo(camGoal) < 0.05) camGoal = null; }
    controls.update(); renderer.render(scene, camera);
  });
  return { select };
}
