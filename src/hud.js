// On-screen HUD: speed, location, keep-left warning and minimap.
export class Hud {
  constructor(data, proj, terrain, roads) {
    this.$speed = document.getElementById('speed');
    this.$area = document.getElementById('area');
    this.$road = document.getElementById('road');
    this.$warn = document.getElementById('warn');
    this.$toast = document.getElementById('toast');
    this.map = document.getElementById('minimap');
    this.areas = data.areas.map((a) => ({ ...a, ...proj.toXZ(a.at[0], a.at[1]) }));
    this.big = false;
    this.toastTimer = 0;

    // Pre-render the island map once.
    const W = 900, s = W / (terrain.maxX - terrain.minX);
    this.scale = s;
    this.ox = terrain.minX; this.oz = terrain.minZ;
    const base = document.createElement('canvas');
    base.width = W; base.height = Math.round((terrain.maxZ - terrain.minZ) * s);
    const g = base.getContext('2d');
    g.fillStyle = '#7cc6de'; g.fillRect(0, 0, base.width, base.height);
    g.fillStyle = '#e9e4cf'; g.strokeStyle = '#14213d'; g.lineWidth = 2;
    g.beginPath();
    terrain.poly.forEach((p, i) => g[i ? 'lineTo' : 'moveTo']((p.x - this.ox) * s, (p.z - this.oz) * s));
    g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = '#f07c1a'; g.lineWidth = 3; g.lineJoin = 'round';
    for (const road of roads.roads) {
      g.beginPath();
      road.samples.forEach((p, i) => g[i ? 'lineTo' : 'moveTo']((p.x - this.ox) * s, (p.z - this.oz) * s));
      g.stroke();
    }
    g.fillStyle = '#14213d'; g.font = '600 13px "Open Sans", sans-serif'; g.textAlign = 'center';
    for (const a of this.areas) {
      if (a.r < 100) continue;
      g.fillText(a.name, (a.x - this.ox) * s, (a.z - this.oz) * s - 6);
    }
    this.base = base;
  }

  toggleMap() {
    this.big = !this.big;
    this.map.classList.toggle('big', this.big);
  }

  toast(text, seconds = 2.5) {
    this.$toast.textContent = text;
    this.$toast.classList.add('show');
    this.toastTimer = seconds;
  }

  update(dt, car, info) {
    const mph = Math.round(Math.abs(car.speed) * 2.237);
    this.$speed.textContent = mph;

    const pos = car.root.position;
    let area = 'St. Thomas', best = Infinity;
    for (const a of this.areas) {
      const d = Math.hypot(a.x - pos.x, a.z - pos.z);
      if (d < a.r && d / a.r < best) { best = d / a.r; area = a.name; }
    }
    if (area !== this.$area.textContent) this.$area.textContent = area;
    const road = info.road || (car.onRoad ? '' : 'Off road');
    if (road !== this.$road.textContent) this.$road.textContent = road;

    this.$warn.classList.toggle('show', car.wrongSide > 0);

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.$toast.classList.remove('show');
    }

    // Minimap
    const c = this.map, g = c.getContext('2d');
    const cw = c.clientWidth, ch = c.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(cw * dpr) || c.height !== Math.round(ch * dpr)) {
      c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const px = (pos.x - this.ox) * this.scale, pz = (pos.z - this.oz) * this.scale;
    if (this.big) {
      const k = Math.min(cw / this.base.width, ch / this.base.height);
      const ox = (cw - this.base.width * k) / 2, oz = (ch - this.base.height * k) / 2;
      g.fillStyle = '#7cc6de'; g.fillRect(0, 0, cw, ch);
      g.drawImage(this.base, ox, oz, this.base.width * k, this.base.height * k);
      this.drawArrow(g, ox + px * k, oz + pz * k, car.heading, 9);
    } else {
      const zoom = 2.2;
      g.fillStyle = '#7cc6de'; g.fillRect(0, 0, cw, ch);
      g.save();
      g.translate(cw / 2, ch / 2);
      g.scale(zoom, zoom);
      g.drawImage(this.base, -px, -pz);
      g.restore();
      this.drawArrow(g, cw / 2, ch / 2, car.heading, 8);
    }
  }

  drawArrow(g, x, y, heading, size) {
    g.save();
    g.translate(x, y);
    g.rotate(-heading);
    g.fillStyle = '#14213d'; g.strokeStyle = '#ffffff'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, -size); g.lineTo(size * 0.7, size * 0.8); g.lineTo(0, size * 0.4); g.lineTo(-size * 0.7, size * 0.8);
    g.closePath(); g.fill(); g.stroke();
    g.restore();
  }
}
