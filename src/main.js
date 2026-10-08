import * as THREE from 'three';
import { ST_THOMAS } from './data/stthomas.js';
import { makeProjection } from './geo.js';
import { Terrain } from './terrain.js';
import { RoadNetwork } from './roads.js';
import { buildWorld } from './world.js';
import { Car } from './car.js';
import { Hud } from './hud.js';
import { CarAudio } from './audio.js';

const $loading = document.getElementById('loading-status');
const status = (t) => { $loading.textContent = t; return new Promise((r) => setTimeout(r, 0)); };

async function boot() {
  const data = ST_THOMAS;
  const proj = makeProjection(data.origin, data.hScale);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  document.getElementById('game').appendChild(renderer.domElement);
  const scene = new THREE.Scene();

  await status('Shaping the hills…');
  const terrain = new Terrain(data, proj);
  await status('Paving the roads…');
  const roads = new RoadNetwork(data, proj, (x, z) => terrain.heightAt(x, z));
  terrain.flattenRoads(roads);
  terrain.applyFlatZones(data.flatZones);
  scene.add(terrain.buildMesh());
  scene.add(roads.buildMeshes());
  await status('Planting palm trees…');
  const world = buildWorld(scene, renderer, data, proj, terrain, roads);

  const car = new Car();
  scene.add(car.root);
  const start = proj.toXZ(...data.start.at);
  car.placeOnRoad(roads, start.x, start.z, terrain);

  const hud = new Hud(data, proj, terrain, roads);
  const audio = new CarAudio();

  const input = { up: false, down: false, left: false, right: false, brake: false };
  const keymap = {
    KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'brake',
  };
  let paused = true;
  addEventListener('keydown', (e) => {
    if (keymap[e.code]) { input[keymap[e.code]] = true; e.preventDefault(); }
    if (e.repeat) return;
    if (e.code === 'KeyR') { car.placeOnRoad(roads, car.root.position.x, car.root.position.z, terrain); hud.toast('Back on the road'); }
    if (e.code === 'KeyM') hud.toggleMap();
    if (e.code === 'KeyC') car.lookBack = true;
    if (e.code === 'KeyH') audio.horn();
    if (e.code === 'KeyN') hud.toast(audio.toggleMute() ? 'Sound off' : 'Sound on');
    if (e.code === 'Escape') setPaused(!paused);
  });
  addEventListener('keyup', (e) => {
    if (keymap[e.code]) input[keymap[e.code]] = false;
    if (e.code === 'KeyC') car.lookBack = false;
  });
  addEventListener('blur', () => { for (const k in input) input[k] = false; });

  // Touch controls for phones/tablets.
  document.querySelectorAll('[data-key]').forEach((btn) => {
    const k = btn.dataset.key;
    const on = (e) => { e.preventDefault(); input[k] = true; };
    const off = (e) => { e.preventDefault(); input[k] = false; };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointerleave', off);
    btn.addEventListener('pointercancel', off);
  });

  const $start = document.getElementById('start');
  function setPaused(p) {
    paused = p;
    $start.classList.toggle('hidden', !p);
    document.getElementById('start-btn').textContent = 'Keep Driving';
  }
  document.getElementById('start-btn').addEventListener('click', () => {
    audio.start();
    setPaused(false);
    hud.toast('Welcome to St. Thomas — keep LEFT!', 4);
  });
  document.getElementById('loading').classList.add('hidden');
  $start.classList.remove('hidden');

  function resize() {
    renderer.setSize(innerWidth, innerHeight);
    car.camera.aspect = innerWidth / innerHeight;
    car.camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  const clock = new THREE.Clock();
  let frame = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    let info = {};
    if (!paused) {
      info = car.update(dt, input, terrain, roads, world.colliders);
      if (info.splash) { hud.toast('Splash! Wrong way to St. John…', 2.5); audio.splash(); }
    }
    world.update(dt, car.root.position);
    hud.update(dt, car, info);
    audio.update(paused ? 0 : car.speed, !paused && input.up);
    if (frame++ % 2 === 0) car.renderMirror(renderer, scene);
    renderer.render(scene, car.camera);
  });

  window.__game = { car, terrain, roads, world, input, renderer, scene };
}

boot().catch((err) => {
  console.error(err);
  $loading.textContent = 'Something went wrong: ' + err.message;
});
