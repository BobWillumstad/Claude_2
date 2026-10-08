import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './geo.js';

// Everything in the scene that isn't the terrain, roads or the player's car.
export function buildWorld(scene, renderer, data, proj, terrain, roads) {
  const rand = mulberry32(1917); // Transfer Day — the year the USVI became a U.S. territory
  const colliders = [];
  const xz = (ll) => proj.toXZ(ll[0], ll[1]);

  // ---------- Sky, light, fog ----------
  const sky = new Sky();
  sky.scale.setScalar(20000);
  const u = sky.material.uniforms;
  u.turbidity.value = 4; u.rayleigh.value = 1.4; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.85;
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(38), THREE.MathUtils.degToRad(140));
  u.sunPosition.value.copy(sunDir);
  scene.add(sky);
  scene.fog = new THREE.Fog(0xbfd9ea, 400, 3200);

  scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x6b7f4a, 1.1));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 1; sc.far = 800;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  // ---------- Ocean ----------
  const waterNormals = makeWaterNormals();
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(30000, 30000),
    new THREE.MeshPhongMaterial({
      color: 0x0f8fb0, specular: 0xffffff, shininess: 90, transparent: true, opacity: 0.62,
      normalMap: waterNormals, normalScale: new THREE.Vector2(0.35, 0.35),
    }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = 0;
  waterNormals.repeat.set(1200, 1200);
  scene.add(ocean);

  // ---------- Buildings ----------
  const buildings = [];
  const isClear = (x, z, r) => {
    const road = roads.nearest(x, z, 25);
    if (road && road.dist < roads.halfWidth + r + 2) return false;
    if (terrain.heightAt(x, z) < 1.2) return false;
    for (const zone of data.flatZones) {
      const R = zone.rect;
      if (R && x > R.x0 - 30 && x < R.x1 + 30 && z > R.z0 - 30 && z < R.z1 + 30) return false;
    }
    for (const b of buildings) if ((b.x - x) ** 2 + (b.z - z) ** 2 < (b.r + r + 1.5) ** 2) return false;
    return true;
  };
  const wallColors = [0xf6e7c1, 0xf2b8a2, 0xb8e0d2, 0xf9d77e, 0xe8eef2, 0xc6c5ec, 0xa8d5ef, 0xf4a259, 0xffffff];
  const roofColors = [0xb3412e, 0xa63a2a, 0xc2562f, 0x2f6f4f, 0xe9e9e9];
  const addBuilding = (x, z, w, d, h, rot, wall, roof) => {
    const y = Math.min(
      terrain.heightAt(x - w / 2, z - d / 2), terrain.heightAt(x + w / 2, z - d / 2),
      terrain.heightAt(x - w / 2, z + d / 2), terrain.heightAt(x + w / 2, z + d / 2));
    buildings.push({ x, z, y: y - 0.5, w, d, h: h + 0.5, rot, wall, roof, r: Math.max(w, d) * 0.5 });
  };
  for (const town of data.towns) {
    const c = xz(town.at);
    let placed = 0, tries = 0;
    while (placed < town.count && tries++ < town.count * 30) {
      const a = rand() * Math.PI * 2, rr = Math.sqrt(rand());
      const x = c.x + Math.cos(a) * town.rx * rr, z = c.z + Math.sin(a) * town.rz * rr;
      const w = 6 + rand() * 9, d = 6 + rand() * 8, h = 4 + rand() * (rr < 0.4 ? 9 : 5);
      if (!isClear(x, z, Math.max(w, d) / 2)) continue;
      const near = roads.nearest(x, z, 25);
      const rot = near ? Math.atan2(near.p.tx, near.p.tz) : rand() * Math.PI;
      addBuilding(x, z, w, d, h, rot, pick(wallColors, rand), pick(roofColors, rand));
      placed++;
    }
  }
  // Hillside houses scattered along the roads, like the real island.
  for (let n = 0, tries = 0; n < 260 && tries < 6000; tries++) {
    const road = roads.roads[Math.floor(rand() * roads.roads.length)];
    const p = road.samples[Math.floor(rand() * road.samples.length)];
    const side = rand() < 0.5 ? -1 : 1, off = 12 + rand() * 30;
    const x = p.x - p.tz * off * side, z = p.z + p.tx * off * side;
    const w = 7 + rand() * 6, d = 6 + rand() * 6;
    if (!isClear(x, z, Math.max(w, d) / 2)) continue;
    addBuilding(x, z, w, d, 3.5 + rand() * 3, Math.atan2(p.tx, p.tz), pick(wallColors, rand), pick(roofColors, rand));
    n++;
  }
  // Fort Christian — the red fort on the Charlotte Amalie waterfront.
  {
    const f = xz([-64.9292, 18.3412]);
    addBuilding(f.x, f.z, 22, 22, 7, 0.2, 0xb8322a, 0x8f241d);
    addBuilding(f.x + 9, f.z - 9, 7, 7, 13, 0.2, 0xb8322a, 0x8f241d);
  }
  {
    const wallGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const roofGeo = new THREE.ConeGeometry(0.75, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0);
    const walls = new THREE.InstancedMesh(wallGeo, new THREE.MeshLambertMaterial(), buildings.length);
    const roofs = new THREE.InstancedMesh(roofGeo, new THREE.MeshLambertMaterial(), buildings.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), color = new THREE.Color();
    buildings.forEach((b, i) => {
      q.setFromAxisAngle(up, b.rot);
      walls.setMatrixAt(i, m.compose(p.set(b.x, b.y, b.z), q, s.set(b.w, b.h, b.d)));
      walls.setColorAt(i, color.set(b.wall));
      roofs.setMatrixAt(i, m.compose(p.set(b.x, b.y + b.h, b.z), q, s.set(b.w * 1.02, Math.min(b.w, b.d) * 0.35, b.d * 1.02)));
      roofs.setColorAt(i, color.set(b.roof));
      colliders.push({ x: b.x, z: b.z, r: b.r * 0.92 });
    });
    walls.castShadow = roofs.castShadow = true;
    walls.receiveShadow = true;
    scene.add(walls, roofs);
  }

  // ---------- Trees ----------
  const palms = [], trees = [];
  for (let tries = 0; tries < 60000 && trees.length < 7000; tries++) {
    const x = terrain.minX + rand() * (terrain.maxX - terrain.minX);
    const z = terrain.minZ + rand() * (terrain.maxZ - terrain.minZ);
    const h = terrain.heightAt(x, z);
    if (h < 0.9) continue;
    const road = roads.nearest(x, z, 25);
    if (road && road.dist < roads.halfWidth + 3) continue;
    if (buildings.some((b) => Math.abs(b.x - x) < b.r + 2 && Math.abs(b.z - z) < b.r + 2)) continue;
    if (h < 4.5) { if (palms.length < 900) palms.push({ x, z, y: h }); }
    else if (rand() < 0.85) trees.push({ x, z, y: h });
  }
  // Extra palms lining the Charlotte Amalie waterfront.
  for (const p of roads.roads[0].samples) {
    if (p.x > -500 && p.x < 400 && Math.round(p.x) % 3 === 0 && rand() < 0.12) {
      const x = p.x + p.tz * 7, z = p.z - p.tx * 7;
      if (terrain.heightAt(x, z) > 0.9) palms.push({ x, z, y: terrain.heightAt(x, z) });
    }
  }
  scene.add(makePalms(palms, rand), makeTrees(trees, rand));

  // ---------- Landmarks ----------
  const labels = [];
  const label = (text, ll, height = 30) => {
    const p = xz(ll);
    const s = makeLabel(text);
    s.position.set(p.x, Math.max(terrain.heightAt(p.x, p.z), 0) + height, p.z);
    scene.add(s);
    labels.push(s);
  };

  // Havensight cruise dock + cruise ship
  {
    const d = xz([-64.9225, 18.3322]);
    const dock = box(160, 3, 16, 0xd8d2c4);
    dock.position.set(d.x - 60, 0.5, d.z + 20); dock.rotation.y = -0.55;
    scene.add(dock);
    const ship = makeCruiseShip();
    ship.position.set(d.x - 72, 0, d.z + 45); ship.rotation.y = -0.55;
    scene.add(ship);
    label('Havensight Cruise Dock', [-64.9245, 18.3305], 45);
  }
  // Sailboats in Charlotte Amalie harbor
  for (let i = 0; i < 26; i++) {
    const c = xz([-64.933 + (rand() - 0.5) * 0.02, 18.334 + (rand() - 0.5) * 0.006]);
    if (terrain.heightAt(c.x, c.z) > -2) continue;
    const boat = makeSailboat(rand);
    boat.position.set(c.x, 0, c.z); boat.rotation.y = rand() * Math.PI * 2;
    scene.add(boat);
  }
  // Airport runway + terminal + parked plane
  {
    const zone = data.flatZones.find((z) => z.name === 'runway').rect;
    const len = zone.x1 - zone.x0, wid = zone.z1 - zone.z0;
    const cx = (zone.x0 + zone.x1) / 2, cz = (zone.z0 + zone.z1) / 2;
    const rw = box(len, 0.2, wid, 0x2e3033);
    rw.position.set(cx, 1.05, cz); rw.receiveShadow = true;
    scene.add(rw);
    for (let x = zone.x0 + 20; x < zone.x1 - 20; x += 30) {
      const dash = box(14, 0.05, 1, 0xffffff);
      dash.position.set(x, 1.18, cz);
      scene.add(dash);
    }
    const term = box(70, 9, 22, 0xf2efe6);
    term.position.set(cx + 60, terrain.heightAt(cx + 60, zone.z0 - 45) + 4.5, zone.z0 - 45);
    term.castShadow = true;
    scene.add(term);
    colliders.push({ x: term.position.x - 22, z: term.position.z, r: 12 }, { x: term.position.x + 22, z: term.position.z, r: 12 }, { x: term.position.x, z: term.position.z, r: 12 });
    const plane = makePlane();
    plane.position.set(cx - 40, 1.2, cz - 8);
    scene.add(plane);
    colliders.push({ x: plane.position.x, z: plane.position.z, r: 5 });
    label('Cyril E. King Airport', [-64.977, 18.3372], 30);
  }
  // Red Hook ferry dock + ferry to St. John
  {
    const d = xz([-64.8465, 18.3248]);
    const dock = box(40, 2.5, 8, 0xd8d2c4);
    dock.position.set(d.x + 18, 0.6, d.z + 4); dock.rotation.y = 0.4;
    scene.add(dock);
    const ferry = makeFerry();
    ferry.position.set(d.x + 25, 0, d.z + 16); ferry.rotation.y = 0.4;
    scene.add(ferry);
    label('Red Hook Ferry — St. John', [-64.848, 18.3262], 28);
  }
  // Mountain Top
  {
    const m = xz([-64.9495, 18.3575]);
    const x = m.x + 20, z = m.z - 18;
    const b = box(26, 8, 16, 0xf9d77e);
    b.position.set(x, terrain.heightAt(x, z) + 4, z); b.castShadow = true;
    scene.add(b);
    colliders.push({ x, z, r: 11 });
    label('Mountain Top', [-64.9495, 18.3585], 30);
  }
  label('Magens Bay', [-64.9315, 18.3635], 20);
  label("Drake's Seat", [-64.9335, 18.3565], 18);
  label('Charlotte Amalie', [-64.931, 18.3438], 50);
  label('Fort Christian', [-64.9292, 18.3412], 24);
  label('Coki Point', [-64.8635, 18.3505], 18);
  label('Hull Bay', [-64.9565, 18.3735], 18);
  label('Crown Mountain', [-64.961, 18.3585], 30);
  label('Bolongo Bay', [-64.888, 18.3125], 18);
  label("Frenchman's Reef", [-64.9145, 18.3175], 24);

  // Beach umbrellas at Magens Bay
  for (let i = 0; i < 14; i++) {
    const c = xz([-64.9345 + i * 0.0004, 18.3612 + Math.sin(i) * 0.0002]);
    const h = terrain.heightAt(c.x, c.z);
    if (h < 0.7) continue;
    const u2 = makeUmbrella(i);
    u2.position.set(c.x, h, c.z);
    scene.add(u2);
  }

  return {
    colliders,
    sun, ocean, labels,
    update(dt, focus) {
      waterNormals.offset.x += dt * 0.004;
      waterNormals.offset.y += dt * 0.0025;
      sun.position.copy(focus).addScaledVector(sunDir, 400);
      sun.target.position.copy(focus);
      for (const l of labels) {
        const d = l.position.distanceTo(focus);
        l.material.opacity = THREE.MathUtils.clamp(Math.min((900 - d) / 300, (d - 40) / 60), 0, 1);
        l.visible = l.material.opacity > 0.01;
      }
    },
  };
}

function pick(arr, rand) { return arr[Math.floor(rand() * arr.length)]; }

function box(w, h, d, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function makeWaterNormals() {
  const size = 256, c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d'), img = g.createImageData(size, size);
  const hgt = (x, y) =>
    Math.sin((x / size) * Math.PI * 2 * 3 + Math.sin((y / size) * Math.PI * 2 * 2)) * 0.5 +
    Math.sin((y / size) * Math.PI * 2 * 5 + (x / size) * Math.PI * 2 * 2) * 0.35 +
    Math.sin(((x + y) / size) * Math.PI * 2 * 7) * 0.15;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = hgt(x + 1, y) - hgt(x - 1, y), dy = hgt(x, y + 1) - hgt(x, y - 1);
    const n = new THREE.Vector3(-dx * 4, -dy * 4, 1).normalize();
    const i = (y * size + x) * 4;
    img.data[i] = (n.x * 0.5 + 0.5) * 255; img.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
    img.data[i + 2] = (n.z * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function makeLabel(text) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = '700 44px Catamaran, "Open Sans", system-ui, sans-serif';
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 60;
  c.width = w; c.height = 84;
  g.font = font;
  g.fillStyle = 'rgba(20, 33, 61, 0.88)';
  roundRect(g, 0, 0, w, 84, 42); g.fill();
  g.fillStyle = '#f07c1a';
  roundRect(g, 18, 34, 14, 14, 7); g.fill();
  g.fillStyle = '#ffffff';
  g.textBaseline = 'middle';
  g.fillText(text, 42, 44);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  s.scale.set(w / 6, 14, 1);
  return s;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function makePalms(list, rand) {
  const group = new THREE.Group();
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 1, 6).translate(0, 0.5, 0);
  const fronds = [];
  for (let i = 0; i < 7; i++) {
    const f = new THREE.BoxGeometry(0.5, 0.06, 3.2).translate(0, 0, 1.6);
    f.rotateX(0.35); f.rotateY((i / 7) * Math.PI * 2);
    fronds.push(f);
  }
  const crownGeo = mergeGeometries(fronds);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x8a7154 }), list.length);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: 0x3f8f3a }), list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  list.forEach((p, i) => {
    const h = 6 + rand() * 5;
    e.set((rand() - 0.5) * 0.3, rand() * 6.28, (rand() - 0.5) * 0.3);
    q.setFromEuler(e);
    trunks.setMatrixAt(i, m.compose(new THREE.Vector3(p.x, p.y - 0.2, p.z), q, new THREE.Vector3(1, h, 1)));
    const top = new THREE.Vector3(0, h, 0).applyQuaternion(q).add(new THREE.Vector3(p.x, p.y - 0.2, p.z));
    crowns.setMatrixAt(i, m.compose(top, q, new THREE.Vector3(1, 1, 1)));
  });
  trunks.castShadow = crowns.castShadow = true;
  group.add(trunks, crowns);
  return group;
}

function makeTrees(list, rand) {
  const geo = new THREE.IcosahedronGeometry(1, 0).translate(0, 0.7, 0);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ flatShading: true }), list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
  const greens = [0x2f6b2a, 0x3b7d30, 0x4c8a35, 0x2a5e2a, 0x6b8a3a];
  list.forEach((p, i) => {
    const s = 2 + rand() * 3.5;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28);
    mesh.setMatrixAt(i, m.compose(new THREE.Vector3(p.x, p.y - 0.5, p.z), q, new THREE.Vector3(s, s * (0.7 + rand() * 0.6), s)));
    mesh.setColorAt(i, c.set(greens[Math.floor(rand() * greens.length)]));
  });
  mesh.castShadow = true;
  return mesh;
}

function makeCruiseShip() {
  const g = new THREE.Group();
  const hull = box(180, 16, 28, 0xffffff); hull.position.y = 4; g.add(hull);
  const stripe = box(180.5, 2, 28.5, 0x14213d); stripe.position.y = 0; g.add(stripe);
  for (let i = 0; i < 4; i++) {
    const deck = box(150 - i * 22, 5, 25 - i * 2, i % 2 ? 0xf3f3f3 : 0xdfe7ef);
    deck.position.set(-6 + i * 3, 14.5 + i * 5, 0); g.add(deck);
  }
  const funnel = box(10, 12, 7, 0xf07c1a); funnel.position.set(-40, 38, 0); g.add(funnel);
  return g;
}

function makeFerry() {
  const g = new THREE.Group();
  const hull = box(28, 4, 9, 0xffffff); hull.position.y = 1; g.add(hull);
  const cabin = box(16, 4, 8, 0x0081c6); cabin.position.set(-2, 5, 0); g.add(cabin);
  return g;
}

function makeSailboat(rand) {
  const g = new THREE.Group();
  const len = 9 + rand() * 6;
  const hull = box(len, 1.4, len * 0.32, 0xffffff); hull.position.y = 0.4; g.add(hull);
  const mast = box(0.2, len * 1.3, 0.2, 0xdddddd); mast.position.set(0.5, len * 0.65 + 0.8, 0); g.add(mast);
  return g;
}

function makePlane() {
  const g = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: 0xf5f5f5 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.6, 34, 12).rotateZ(Math.PI / 2), white);
  body.position.y = 3; g.add(body);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(6, 0.4, 32), white); wing.position.set(1, 2.4, 0); g.add(wing);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(4, 6, 0.4), new THREE.MeshLambertMaterial({ color: 0x0081c6 }));
  tail.position.set(-15, 6.5, 0); g.add(tail);
  const stab = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 11), white); stab.position.set(-15, 4, 0); g.add(stab);
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

function makeUmbrella(i) {
  const g = new THREE.Group();
  const pole = box(0.08, 2.4, 0.08, 0xffffff); pole.position.y = 1.2; g.add(pole);
  const top = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.6, 8),
    new THREE.MeshLambertMaterial({ color: [0xf07c1a, 0x0081c6, 0xf4c53d, 0xc6c5ec][i % 4] }));
  top.position.y = 2.5; top.castShadow = true; g.add(top);
  return g;
}
