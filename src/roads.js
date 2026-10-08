import * as THREE from 'three';
import { resampleSpline } from './geo.js';

const STEP = 2;
const CELL = 25;

export class RoadNetwork {
  constructor(data, proj, heightFn) {
    this.halfWidth = 4;
    this.roads = data.roads.map((r) => {
      const pts = r.points.map(([lon, lat]) => proj.toXZ(lon, lat));
      const s = resampleSpline(pts, STEP);
      for (let i = 0; i < s.length; i++) {
        const a = s[Math.max(0, i - 1)], b = s[Math.min(s.length - 1, i + 1)];
        const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        s[i].tx = (b.x - a.x) / len; s[i].tz = (b.z - a.z) / len;
        s[i].y = heightFn(s[i].x, s[i].z);
      }
      // Smooth the vertical profile so roads climb steadily instead of following every bump.
      for (let pass = 0; pass < 3; pass++) {
        const src = s.map((p) => p.y);
        for (let i = 0; i < s.length; i++) {
          let sum = 0, n = 0;
          for (let k = -10; k <= 10; k++) {
            const q = i + k;
            if (q >= 0 && q < s.length) { sum += src[q]; n++; }
          }
          s[i].y = Math.max(1.3, sum / n);
        }
      }
      return { name: r.name, samples: s };
    });

    // Snap road ends to the road they join so intersections line up.
    for (let r = 1; r < this.roads.length; r++) {
      const s = this.roads[r].samples;
      for (const end of [0, s.length - 1]) {
        let best = null, bestD = 15;
        for (let o = 0; o < r; o++) {
          for (const q of this.roads[o].samples) {
            const d = Math.hypot(q.x - s[end].x, q.z - s[end].z);
            if (d < bestD) { bestD = d; best = q; }
          }
        }
        if (!best) continue;
        const span = Math.min(30, s.length - 1);
        for (let k = 0; k <= span; k++) {
          const i = end === 0 ? k : s.length - 1 - k;
          const t = 1 - k / span;
          s[i].y += (best.y - s[i].y) * t * t * (3 - 2 * t);
        }
      }
    }

    this.hash = new Map();
    this.roads.forEach((road, r) => {
      road.samples.forEach((p, i) => {
        const key = `${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)}`;
        if (!this.hash.has(key)) this.hash.set(key, []);
        this.hash.get(key).push(r, i);
      });
    });
  }

  // Nearest road centerline point within maxDist (<= CELL), or null.
  nearest(x, z, maxDist = CELL) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let best = null, bestD2 = maxDist * maxDist;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const list = this.hash.get(`${cx + dx},${cz + dz}`);
        if (!list) continue;
        for (let n = 0; n < list.length; n += 2) {
          const p = this.roads[list[n]].samples[list[n + 1]];
          const d2 = (p.x - x) ** 2 + (p.z - z) ** 2;
          if (d2 < bestD2) { bestD2 = d2; best = { road: list[n], i: list[n + 1], p }; }
        }
      }
    }
    if (!best) return null;
    return { ...best, y: best.p.y, dist: Math.sqrt(bestD2) };
  }

  // Search outward until a road is found (used for respawning).
  nearestAnywhere(x, z) {
    let best = null, bestD = Infinity;
    this.roads.forEach((road, r) => road.samples.forEach((p, i) => {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) { bestD = d; best = { road: r, i, p }; }
    }));
    return best;
  }

  buildMeshes() {
    const group = new THREE.Group();
    const asphalt = [], yellow = [], white = [];
    const strip = (out, s, offA, offB, lift, filter) => {
      for (let i = 0; i < s.length - 1; i++) {
        if (filter && !filter(i)) continue;
        const a = s[i], b = s[i + 1];
        const corner = (p, off) => [p.x - p.tz * off, p.y + lift, p.z + p.tx * off];
        const a0 = corner(a, offA), a1 = corner(a, offB), b0 = corner(b, offA), b1 = corner(b, offB);
        out.push(...a0, ...b0, ...a1, ...a1, ...b0, ...b1);
      }
    };
    const hw = this.halfWidth;
    for (const road of this.roads) {
      const s = road.samples;
      strip(asphalt, s, -hw, hw, 0.12);
      strip(yellow, s, -0.12, 0.12, 0.14, (i) => i % 4 < 2);
      strip(white, s, -hw + 0.3, -hw + 0.45, 0.14);
      strip(white, s, hw - 0.45, hw - 0.3, 0.14);
    }
    const make = (arr, color, order) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      g.computeVertexNormals();
      // Strips are wound for a -Z-facing up normal; force normals straight up.
      const n = g.attributes.normal;
      for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({
        color, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -order, polygonOffsetUnits: -order * 2,
      }));
      m.receiveShadow = true;
      m.renderOrder = order;
      return m;
    };
    group.add(make(asphalt, 0x3b3d40, 1));
    group.add(make(yellow, 0xf4c53d, 2));
    group.add(make(white, 0xeeeeee, 2));
    return group;
  }
}
