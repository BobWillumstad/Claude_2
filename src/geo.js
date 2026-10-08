// Pure geometry / math helpers (no three.js dependency).

export function makeProjection(origin, hScale) {
  const mPerLon = 111320 * Math.cos((origin.lat * Math.PI) / 180);
  const mPerLat = 110574;
  return {
    // lon/lat -> game meters. +x = east, -z = north.
    toXZ(lon, lat) {
      return {
        x: (lon - origin.lon) * mPerLon * hScale,
        z: -(lat - origin.lat) * mPerLat * hScale,
      };
    },
    toLonLat(x, z) {
      return {
        lon: origin.lon + x / (mPerLon * hScale),
        lat: origin.lat - z / (mPerLat * hScale),
      };
    },
  };
}

export function pointInPolygon(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, zi = poly[i].z, xj = poly[j].x, zj = poly[j].z;
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function distToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const ex = ax + t * dx - px, ez = az + t * dz - pz;
  return Math.sqrt(ex * ex + ez * ez);
}

// Signed distance to polygon edge: positive inside (on land), negative outside.
export function signedDistance(x, z, poly) {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    d = Math.min(d, distToSegment(x, z, poly[j].x, poly[j].z, poly[i].x, poly[i].z));
  }
  return pointInPolygon(x, z, poly) ? d : -d;
}

// Catmull-Rom spline through points, resampled every `step` meters.
export function resampleSpline(points, step) {
  const dense = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const segLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    const n = Math.max(2, Math.ceil(segLen / (step / 4)));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push({ x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  dense.push({ ...points[points.length - 1] });
  // Re-space evenly.
  const out = [dense[0]];
  let acc = 0;
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1], b = dense[i];
    let seg = Math.hypot(b.x - a.x, b.z - a.z);
    let t0 = 0;
    while (acc + seg * (1 - t0) >= step) {
      const need = step - acc;
      t0 += need / seg;
      out.push({ x: a.x + (b.x - a.x) * t0, z: a.z + (b.z - a.z) * t0 });
      acc = 0;
    }
    acc += seg * (1 - t0);
  }
  const last = dense[dense.length - 1];
  if (Math.hypot(last.x - out[out.length - 1].x, last.z - out[out.length - 1].z) > step * 0.3) out.push(last);
  return out;
}

// Deterministic pseudo-random + value noise.
export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix, iz) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function valueNoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

export function fbm(x, z, octaves = 4) {
  let sum = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * (valueNoise(x * freq, z * freq) * 2 - 1);
    amp *= 0.5; freq *= 2.03;
  }
  return sum;
}

export function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
