import * as THREE from 'three';
import { signedDistance, fbm, smoothstep } from './geo.js';

const SAND = [0.91, 0.84, 0.63];
const WET_SAND = [0.72, 0.80, 0.70];
const DEEP = [0.10, 0.26, 0.40];
const GRASS = [0.32, 0.52, 0.20];
const FOREST = [0.18, 0.37, 0.15];
const SCRUB = [0.52, 0.52, 0.29];
const ROCK = [0.47, 0.41, 0.32];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export class Terrain {
  constructor(data, proj) {
    this.data = data;
    this.proj = proj;
    this.poly = data.outline.map(([lon, lat]) => proj.toXZ(lon, lat));
    this.peaks = data.peaks.map(([lon, lat, h, r]) => ({ ...proj.toXZ(lon, lat), h: h * data.vScale, r }));

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of this.poly) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    const margin = 450;
    this.cell = 6;
    this.minX = Math.floor((minX - margin) / this.cell) * this.cell;
    this.minZ = Math.floor((minZ - margin) / this.cell) * this.cell;
    this.nx = Math.ceil((maxX + margin - this.minX) / this.cell) + 1;
    this.nz = Math.ceil((maxZ + margin - this.minZ) / this.cell) + 1;
    this.maxX = this.minX + (this.nx - 1) * this.cell;
    this.maxZ = this.minZ + (this.nz - 1) * this.cell;

    this.h = new Float32Array(this.nx * this.nz);
    this.coast = new Float32Array(this.nx * this.nz);
    this.roadW = new Float32Array(this.nx * this.nz);
    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        const x = this.minX + i * this.cell, z = this.minZ + j * this.cell;
        const d = signedDistance(x, z, this.poly);
        this.coast[j * this.nx + i] = d;
        this.h[j * this.nx + i] = this.rawHeight(x, z, d);
      }
    }
  }

  rawHeight(x, z, d) {
    if (d < 0) {
      const dd = -d;
      return Math.max(-40, 0.8 - 0.05 * dd - 0.0006 * dd * dd);
    }
    let max = 0, sum = 0;
    for (const p of this.peaks) {
      const r2 = (x - p.x) ** 2 + (z - p.z) ** 2;
      const g = p.h * Math.exp(-r2 / (2 * p.r * p.r));
      max = Math.max(max, g); sum += g;
    }
    const hills = max + 0.3 * (sum - max);
    const s = smoothstep(10, 340, d);
    const n = fbm(x / 140, z / 140, 4) * 9 + fbm(x / 35, z / 35, 2) * 1.5;
    return 0.8 + s * (8 + hills + n);
  }

  // Bilinear sample of the height grid.
  heightAt(x, z) {
    const fx = (x - this.minX) / this.cell, fz = (z - this.minZ) / this.cell;
    if (fx < 0 || fz < 0 || fx >= this.nx - 1 || fz >= this.nz - 1) return -40;
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const k = j * this.nx + i;
    const a = this.h[k], b = this.h[k + 1], c = this.h[k + this.nx], d = this.h[k + this.nx + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  }

  // Carve roads into the hillside: flatten under the road, blend out to the sides.
  flattenRoads(roads) {
    const reach = 22;
    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        const k = j * this.nx + i;
        if (this.coast[k] < -30) continue;
        const x = this.minX + i * this.cell, z = this.minZ + j * this.cell;
        const hit = roads.nearest(x, z, reach);
        if (!hit) continue;
        const inner = roads.halfWidth + 2.5;
        const w = hit.dist < inner ? 1 : 1 - smoothstep(inner, reach, hit.dist);
        this.h[k] = this.h[k] + (hit.y - this.h[k]) * w;
        this.roadW[k] = w;
      }
    }
  }

  applyFlatZones(zones) {
    for (const z of zones) {
      const a = this.proj.toXZ(...z.from), b = this.proj.toXZ(...z.to);
      const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
      const z0 = Math.min(a.z, b.z), z1 = Math.max(a.z, b.z);
      for (let j = 0; j < this.nz; j++) {
        for (let i = 0; i < this.nx; i++) {
          const x = this.minX + i * this.cell, zz = this.minZ + j * this.cell;
          const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - zz, 0, zz - z1);
          const d = Math.hypot(dx, dz);
          if (d > z.pad) continue;
          const k = j * this.nx + i;
          const w = 1 - smoothstep(0, z.pad, d);
          this.h[k] = this.h[k] + (z.h - this.h[k]) * w;
        }
      }
      z.rect = { x0, x1, z0, z1 };
    }
  }

  isLand(x, z) {
    return this.heightAt(x, z) > 0.6;
  }

  buildMesh() {
    const { nx, nz, cell } = this;
    const pos = new Float32Array(nx * nz * 3);
    const col = new Float32Array(nx * nz * 3);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const x = this.minX + i * cell, z = this.minZ + j * cell, h = this.h[k];
        pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;

        const hl = this.h[k - (i > 0 ? 1 : 0)], hr = this.h[k + (i < nx - 1 ? 1 : 0)];
        const hu = this.h[k - (j > 0 ? nx : 0)], hd = this.h[k + (j < nz - 1 ? nx : 0)];
        const slope = Math.hypot(hr - hl, hd - hu) / (2 * cell);

        let c;
        if (h < 0.2) {
          c = mix(WET_SAND, DEEP, smoothstep(0.2, 14, -h));
        } else if (h < 2.4) {
          c = mix(SAND, GRASS, smoothstep(1.6, 2.4, h));
        } else {
          const n = fbm(x / 90, z / 90, 3) * 0.5 + 0.5;
          c = mix(GRASS, FOREST, smoothstep(25, 90, h) * 0.8 + n * 0.25);
          // East end of St. Thomas is drier scrub.
          c = mix(c, SCRUB, smoothstep(300, 1500, x) * 0.6 * (1 - n * 0.5));
          c = mix(c, ROCK, smoothstep(0.55, 0.95, slope));
          c = mix(c, ROCK, this.roadW[k] * 0.35);
        }
        const v = 0.92 + fbm(x / 9, z / 9, 2) * 0.16;
        // Palette is authored in sRGB; vertex colors are linear.
        col[k * 3] = (c[0] * v) ** 2.2; col[k * 3 + 1] = (c[1] * v) ** 2.2; col[k * 3 + 2] = (c[2] * v) ** 2.2;
      }
    }
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let p = 0;
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        idx[p++] = a; idx[p++] = c; idx[p++] = b;
        idx[p++] = b; idx[p++] = c; idx[p++] = d;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.receiveShadow = true;
    return mesh;
  }
}
