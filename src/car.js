import * as THREE from 'three';

const WHEELBASE = 2.5;
const TRACK = 1.6;
const CAR_RADIUS = 1.5;
const MAX_SPEED = 42;        // m/s (~94 mph)
const OFFROAD_MAX = 18;
const REVERSE_MAX = 8;

// An open-top island Jeep, driven from the left seat (the USVI drives on the LEFT
// side of the road, but most cars are left-hand drive).
export class Car {
  constructor() {
    this.root = new THREE.Group();     // position + heading
    this.body = new THREE.Group();     // pitch + roll
    this.root.add(this.body);

    this.heading = 0;
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.y = 0;
    this.steer = 0;
    this.pitch = 0;
    this.roll = 0;
    this.airborne = false;
    this.onRoad = true;
    this.wrongSide = 0;
    this.speed = 0;
    this.bump = 0;
    this.splashTimer = 0;
    this.lookBack = false;

    this.camera = new THREE.PerspectiveCamera(72, 1, 0.08, 9000);
    this.eye = new THREE.Vector3(-0.38, 1.58, 0.15);
    this.camera.position.copy(this.eye);
    this.body.add(this.camera);

    this.mirrorTarget = new THREE.WebGLRenderTarget(384, 112);
    this.mirrorTarget.texture.wrapS = THREE.RepeatWrapping;
    this.mirrorTarget.texture.repeat.x = -1;
    this.mirrorCam = new THREE.PerspectiveCamera(32, 384 / 112, 0.5, 3000);
    this.mirrorCam.position.set(0, 1.62, -0.5);
    this.mirrorCam.rotation.set(-0.03, Math.PI, 0);
    this.body.add(this.mirrorCam);

    this.buildCockpit();
  }

  buildCockpit() {
    const paint = new THREE.MeshLambertMaterial({ color: 0xf07c1a });
    const navy = new THREE.MeshLambertMaterial({ color: 0x14213d });
    const black = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    const add = (geo, mat, x, y, z, parent = this.body) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z); m.castShadow = true;
      parent.add(m);
      return m;
    };
    const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);

    add(B(1.6, 0.14, 1.5), paint, 0, 1.0, -1.55);                 // hood
    add(B(1.62, 0.5, 0.1), black, 0, 0.8, -2.3);                   // grille
    add(B(0.32, 0.12, 1.3), black, -0.9, 0.98, -1.55);             // fenders
    add(B(0.32, 0.12, 1.3), black, 0.9, 0.98, -1.55);
    add(B(1.7, 0.32, 0.4), navy, 0, 1.06, -0.62);                  // dashboard
    add(B(0.08, 0.42, 1.7), paint, -0.86, 0.95, 0.2);              // door tubs
    add(B(0.08, 0.42, 1.7), paint, 0.86, 0.95, 0.2);
    add(B(0.04, 0.62, 0.04), black, -0.8, 1.52, -0.82);            // windshield frame
    add(B(0.04, 0.62, 0.04), black, 0.8, 1.52, -0.82);
    add(B(1.65, 0.04, 0.04), black, 0, 1.84, -0.82);
    add(B(0.06, 0.8, 0.06), black, -0.78, 1.55, 1.0);              // roll bar
    add(B(0.06, 0.8, 0.06), black, 0.78, 1.55, 1.0);
    add(B(1.6, 0.06, 0.06), black, 0, 1.95, 1.0);
    add(B(0.06, 0.06, 1.8), black, -0.78, 1.95, 0.1);
    add(B(0.06, 0.06, 1.8), black, 0.78, 1.95, 0.1);

    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 0.56),
      new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.06, depthWrite: false }));
    glass.position.set(0, 1.52, -0.82);
    this.body.add(glass);

    // Gauge cluster facing the driver.
    this.gauge = this.makeGauge();
    this.gauge.position.set(-0.38, 1.3, -0.47);
    this.gauge.rotation.x = -0.35;
    this.body.add(this.gauge);

    // Steering wheel
    this.wheel = new THREE.Group();
    this.wheel.position.set(-0.38, 1.2, -0.28);
    this.wheel.rotation.x = -0.45;
    this.body.add(this.wheel);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.02, 8, 28), black);
    this.wheel.add(rim);
    for (const a of [0, Math.PI / 2, Math.PI]) {
      const spoke = new THREE.Mesh(B(0.17, 0.025, 0.02), black);
      spoke.position.set(Math.cos(a + Math.PI) * 0.085, Math.sin(a + Math.PI) * 0.085, 0);
      spoke.rotation.z = a;
      this.wheel.add(spoke);
    }
    this.wheel.add(new THREE.Mesh(new THREE.CircleGeometry(0.05, 16), navy));

    // Rear-view mirror shows a live render.
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.1),
      new THREE.MeshBasicMaterial({ map: this.mirrorTarget.texture }));
    mirror.position.set(-0.05, 1.72, -0.76);
    mirror.rotation.x = 0.05;
    this.body.add(mirror);
    const frame = new THREE.Mesh(B(0.37, 0.12, 0.02), black);
    frame.position.set(-0.05, 1.72, -0.775);
    this.body.add(frame);

    // Wheels (seen in shadows and from outside).
    this.tires = [];
    for (const [x, z] of [[-0.85, -1.55], [0.85, -1.55], [-0.85, 1.0], [0.85, 1.0]]) {
      const t = add(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 14).rotateZ(Math.PI / 2), black, x, 0.4, z);
      this.tires.push(t);
    }
    this.cockpitParts = this.body.children.filter((c) => c !== this.camera && c !== this.mirrorCam);
  }

  makeGauge() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    this.gaugeCanvas = c;
    this.gaugeTex = new THREE.CanvasTexture(c);
    this.gaugeTex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), new THREE.MeshBasicMaterial({ map: this.gaugeTex }));
  }

  drawGauge(mph) {
    const g = this.gaugeCanvas.getContext('2d');
    g.fillStyle = '#14213d'; g.fillRect(0, 0, 256, 128);
    g.strokeStyle = '#c6c5ec'; g.lineWidth = 4;
    g.beginPath(); g.arc(128, 118, 100, Math.PI, 2 * Math.PI); g.stroke();
    g.fillStyle = '#ffffff'; g.font = '600 14px sans-serif'; g.textAlign = 'center';
    for (let v = 0; v <= 100; v += 20) {
      const a = Math.PI + (v / 100) * Math.PI;
      g.fillText(String(v), 128 + Math.cos(a) * 82, 122 + Math.sin(a) * 82);
    }
    const a = Math.PI + Math.min(mph, 100) / 100 * Math.PI;
    g.strokeStyle = '#f07c1a'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(128, 118); g.lineTo(128 + Math.cos(a) * 95, 118 + Math.sin(a) * 95); g.stroke();
    this.gaugeTex.needsUpdate = true;
  }

  forward(out = new THREE.Vector3()) { return out.set(-Math.sin(this.heading), 0, -Math.cos(this.heading)); }
  right(out = new THREE.Vector3()) { return out.set(Math.cos(this.heading), 0, -Math.sin(this.heading)); }

  // Put the car in the left lane of the nearest road.
  placeOnRoad(roads, x, z, terrain) {
    const hit = roads.nearestAnywhere(x, z);
    const p = hit.p;
    this.heading = Math.atan2(-p.tx, -p.tz);
    const r = this.right();
    this.root.position.set(p.x - r.x * 2, 0, p.z - r.z * 2);
    this.y = terrain.heightAt(this.root.position.x, this.root.position.z);
    this.vel.set(0, 0, 0); this.vy = 0; this.steer = 0; this.splashTimer = 0;
  }

  update(dt, input, terrain, roads, colliders) {
    const pos = this.root.position;
    if (this.splashTimer > 0) {
      this.splashTimer -= dt;
      this.y -= dt * 1.5;
      this.root.position.y = this.y;
      if (this.splashTimer <= 0) this.placeOnRoad(roads, pos.x, pos.z, terrain);
      return { splashing: true };
    }

    const f = this.forward(), r = this.right();
    let vf = this.vel.dot(f), vr = this.vel.dot(r);

    const near = roads.nearest(pos.x, pos.z, 25);
    this.onRoad = !!near && near.dist < roads.halfWidth + 1;
    const maxSpeed = this.onRoad ? MAX_SPEED : OFFROAD_MAX;

    if (!this.airborne) {
      if (input.up) {
        if (vf < -0.5) vf += 16 * dt;
        else vf += 8.5 * Math.max(0, 1 - vf / maxSpeed) * dt;
      } else if (input.down) {
        if (vf > 0.5) vf -= 16 * dt;
        else vf = Math.max(-REVERSE_MAX, vf - 5 * dt);
      } else {
        vf -= Math.sign(vf) * Math.min(Math.abs(vf), 1.6 * dt);
      }
      if (input.brake) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 9 * dt);
      if (!this.onRoad) vf -= vf * 0.5 * dt;
      if (vf > maxSpeed) vf -= (vf - maxSpeed) * 1.5 * dt;

      // Hills: gravity pulls you back on the climb.
      const hF = terrain.heightAt(pos.x + f.x * 1.6, pos.z + f.z * 1.6);
      const hB = terrain.heightAt(pos.x - f.x * 1.6, pos.z - f.z * 1.6);
      vf -= 9.8 * ((hF - hB) / 3.2) * dt * 0.8;

      const grip = input.brake ? 1.2 : this.onRoad ? 9 : 4;
      vr *= Math.exp(-grip * dt);
    }

    const maxSteer = 0.6 / (1 + Math.abs(vf) / 14);
    const target = ((input.left ? 1 : 0) - (input.right ? 1 : 0)) * maxSteer;
    this.steer += (target - this.steer) * Math.min(1, dt * 7);
    if (!this.airborne) this.heading += (vf / WHEELBASE) * Math.tan(this.steer) * dt * (input.brake ? 1.35 : 1);

    this.forward(f); this.right(r);
    this.vel.copy(f).multiplyScalar(vf).addScaledVector(r, vr);
    pos.x += this.vel.x * dt;
    pos.z += this.vel.z * dt;

    // Bump into buildings and other solid things.
    this.bump = Math.max(0, this.bump - dt * 3);
    for (const c of colliders) {
      const dx = pos.x - c.x, dz = pos.z - c.z, min = c.r + CAR_RADIUS;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2), nx = dx / d, nz = dz / d;
        pos.x = c.x + nx * min; pos.z = c.z + nz * min;
        const into = this.vel.x * nx + this.vel.z * nz;
        if (into < 0) {
          this.vel.x -= into * nx * 1.3; this.vel.z -= into * nz * 1.3;
          this.vel.multiplyScalar(0.55);
          this.bump = Math.min(1, -into / 15);
        }
      }
    }

    // Vertical: follow the ground, but let crests launch the Jeep.
    const ground = terrain.heightAt(pos.x, pos.z);
    if (this.airborne || this.y > ground + 0.25) {
      this.airborne = true;
      this.vy -= 22 * dt;
      this.y += this.vy * dt;
      if (this.y <= ground) {
        this.bump = Math.min(1, Math.max(this.bump, -this.vy / 12));
        this.y = ground; this.vy = 0; this.airborne = false;
      }
    } else {
      const newVy = (ground - this.y) / Math.max(dt, 1e-3);
      this.vy = THREE.MathUtils.clamp(newVy, -30, 30);
      this.y = ground;
    }
    pos.y = this.y;

    if (ground < -0.9) {
      this.splashTimer = 1.6;
      this.vel.set(0, 0, 0);
      return { splash: true };
    }

    // Body tilt from the slope under the wheels.
    if (!this.airborne) {
      const fw = this.forward(), rt = this.right();
      const hF = terrain.heightAt(pos.x + fw.x * WHEELBASE / 2, pos.z + fw.z * WHEELBASE / 2);
      const hB = terrain.heightAt(pos.x - fw.x * WHEELBASE / 2, pos.z - fw.z * WHEELBASE / 2);
      const hR = terrain.heightAt(pos.x + rt.x * TRACK / 2, pos.z + rt.z * TRACK / 2);
      const hL = terrain.heightAt(pos.x - rt.x * TRACK / 2, pos.z - rt.z * TRACK / 2);
      const k = Math.min(1, dt * 10);
      this.pitch += (Math.atan2(hF - hB, WHEELBASE) - this.pitch) * k;
      this.roll += (Math.atan2(hR - hL, TRACK) - this.roll) * k;
    }
    this.root.rotation.y = this.heading;
    this.body.rotation.set(this.pitch, 0, this.roll + (this.steer * vf) * 0.0015);

    // Camera: slight shake on bumps, look back on demand.
    const shake = this.bump * 0.04 + (this.onRoad ? 0 : Math.min(Math.abs(vf), 15) * 0.0012);
    this.camera.position.set(
      this.eye.x + (Math.random() - 0.5) * shake,
      this.eye.y + (Math.random() - 0.5) * shake,
      this.eye.z);
    this.camera.rotation.set(-0.06, this.lookBack ? Math.PI : 0, 0);
    this.wheel.rotation.z = this.steer * 4;

    // Keep-left check: which side of the centerline are we on, relative to travel direction?
    this.wrongSide = 0;
    if (near && this.onRoad && Math.abs(vf) > 4) {
      const dir = Math.sign(f.x * near.p.tx + f.z * near.p.tz);
      const ox = pos.x - near.p.x, oz = pos.z - near.p.z;
      const side = dir * (ox * -near.p.tz + oz * near.p.tx);
      if (side > 0.6) this.wrongSide = 1;
    }

    this.speed = vf;
    this.drawGauge(Math.abs(vf) * 2.237);
    return { road: near && this.onRoad ? roads.roads[near.road].name : null };
  }

  renderMirror(renderer, scene) {
    for (const p of this.cockpitParts) p.visible = false;
    renderer.setRenderTarget(this.mirrorTarget);
    renderer.render(scene, this.mirrorCam);
    renderer.setRenderTarget(null);
    for (const p of this.cockpitParts) p.visible = true;
  }
}
