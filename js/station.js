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
  renderer.toneMappingExposure = 1.3;
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
  scene.add(new THREE.HemisphereLight(0xeef1f3, 0x2a3036, 0.9));
  // soft fills on both long sides so the bay signs read from any angle
  for (const z of [12, -12]) { const f = new THREE.DirectionalLight(0xffffff, 1.1); f.position.set(0, 3, z); scene.add(f); }

  // ground disc
  const ground = new THREE.Mesh(new THREE.CircleGeometry(9, 64), new THREE.MeshStandardMaterial({ color: 0x353c43, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);

  const groups = {};     // stream id -> meshes
  const parts = {};      // stream id -> { bin, lid, flap, door, lbl, contents }
  let model;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load(el.dataset.model, (gltf) => {
    model = gltf.scene;
    model.traverse((o) => {
      const m = o.name.match(/^(Bin|Lid|Flap|Door|Lbl|Contents)_([a-z]+)(?:\.\d+)?$/);
      if (m) {
        const id = m[2], kind = m[1].toLowerCase();
        (groups[id] ||= []).push(o); o.userData.stream = id;
        (parts[id] ||= {})[kind] = o;
      }
      if (o.isMesh) { o.material = o.material.clone(); }
    });
    for (const p of Object.values(parts)) {
      p.flap.userData.closed = p.flap.rotation.x; p.flap.userData.target = p.flap.rotation.x;
      p.door.userData.target = 0; p.side = p.flap.position.z < 0 ? 1 : -1;   // 1 = side A (faces -z), -1 = side B
    }
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
    const hit = ray.intersectObject(model, true).find((h) => { let o = h.object; while (o && !o.userData.stream) o = o.parent; return o; });
    if (hit) { let o = hit.object; while (!o.userData.stream) o = o.parent; select(o.userData.stream); onPick?.(o.userData.stream); }
  });

  let selected = null; let camGoal = null;
  function select(id) {
    selected = id; controls.autoRotate = false;
    const c = parts[id]?.bin;
    if (c) {
      const ctr = new THREE.Box3().setFromObject(c).getCenter(new THREE.Vector3());
      const dist = camera.position.distanceTo(controls.target);
      const dir = new THREE.Vector3(ctr.x * 0.35, 0.5, Math.sign(ctr.z) || 1).normalize();
      camGoal = controls.target.clone().add(dir.multiplyScalar(dist));
    }
    for (const [sid, list] of Object.entries(groups)) for (const o of list) if (!/^(Lbl)_/.test(o.name)) o.traverse((m) => {
      if (!m.isMesh || !m.material.emissive) return;
      m.material.emissive.set(sid === id ? 0x5e3a22 : 0x000000); m.material.emissiveIntensity = sid === id ? 0.45 : 0;
    });
    // drop the picked bin's front flap down to a loading ledge
    for (const [sid, p] of Object.entries(parts)) p.flap.userData.target = p.flap.userData.closed + (sid === id && !p.pivot ? -p.side * Math.PI / 2 : 0);
  }

  // forklift moves: lift a bin off the skid, then tip it to its right so the top-hinged trap door swings open
  function rig(id) {
    const p = parts[id]; if (!p || p.pivot) return p;
    const bx = new THREE.Box3().setFromObject(p.bin); const ctr = bx.getCenter(new THREE.Vector3()); p.w = bx.max.x - bx.min.x;
    const piv = new THREE.Object3D(); piv.position.copy(ctr); scene.add(piv);
    for (const k of ['bin', 'lid', 'flap', 'door', 'lbl', 'contents']) piv.attach(p[k]);
    p.pivot = piv; p.home = ctr.clone(); p.goal = { pos: ctr.clone(), rot: 0, door: 0 };
    p.flap.userData.target = p.flap.userData.closed;
    return p;
  }
  function liftBin(id) {
    const p = rig(id); if (!p) return false;
    const out = !p.out; p.out = out; p.tipped = false;
    p.goal.pos = p.home.clone().add(new THREE.Vector3(0, out ? 0.9 : 0, out ? -p.side * 2.4 : 0));
    p.goal.rot = 0; p.goal.door = 0; p.contents.visible = true;
    controls.autoRotate = false; return out;
  }
  function tipBin(id) {
    const p = rig(id); if (!p) return false;
    if (!p.out) liftBin(id);
    p.tipped = !p.tipped;
    const th = p.tipped ? 1.75 : 0;                 // ~100 degrees
    p.goal.pos = p.home.clone().add(new THREE.Vector3(0, p.tipped ? 0.9 + Math.max(0.5, p.w * 0.5) : 0.9, -p.side * 2.4));
    p.goal.rot = p.side * th; p.goal.door = -p.side * th;
    if (!p.tipped) p.contents.visible = true;
    controls.autoRotate = false; return p.tipped;
  }
  function resetAll() { for (const [id, p] of Object.entries(parts)) if (p.out) { p.out = true; liftBin(id); } }

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
    for (const p of Object.values(parts)) {
      p.flap.rotation.x += (p.flap.userData.target - p.flap.rotation.x) * 0.12;
      if (!p.pivot) continue;
      p.pivot.position.lerp(p.goal.pos, 0.06);
      p.pivot.rotation.z += (p.goal.rot - p.pivot.rotation.z) * 0.05;
      p.door.rotation.z += (p.goal.door - p.door.rotation.z) * 0.05;
      if (p.tipped && Math.abs(p.pivot.rotation.z) > 1.2) p.contents.visible = false;
    }
    if (camGoal) { camera.position.lerp(camGoal, 0.08); if (camera.position.distanceTo(camGoal) < 0.05) camGoal = null; }
    controls.update(); renderer.render(scene, camera);
  });
  return { select, liftBin, tipBin, resetAll };
}
