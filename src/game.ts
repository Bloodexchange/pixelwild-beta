import {
  W,
  H,
  T,
  blocks,
  solid,
  createWorld,
  craft,
  phase,
  type Save,
} from "./world";
type Mob = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  cool: number;
};
export class Game {
  state: Save;
  ctx: CanvasRenderingContext2D;
  keys = new Set<string>();
  camera = { x: 0, y: 0 };
  vx = 0;
  vy = 0;
  ground = false;
  selected = 4;
  mode: "mine" | "build" = "mine";
  paused = false;
  target: { x: number; y: number } | null = null;
  holding = false;
  progress = 0;
  lastTarget = "";
  mobs: Mob[] = [];
  particles: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    color: string;
  }[] = [];
  elapsed = 0;
  attackCooldown = 0;
  damageCooldown = 0;
  sound = true;
  audio?: AudioContext;
  raf = 0;
  prev = 0;
  tick = 0;
  accumulator = 0;
  onChange = () => {};
  onToast = (s: string) => {};
  onSave = () => {};
  constructor(
    public canvas: HTMLCanvasElement,
    state?: Save,
  ) {
    this.state = state ?? createWorld();
    this.ctx = canvas.getContext("2d")!;
    this.resize();
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("keydown", (e) => {
      if ((e.target as HTMLElement).matches("input")) return;
      if (
        ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
          e.code,
        )
      )
        e.preventDefault();
      this.keys.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.release());
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.aim(e);
      this.holding = true;
      if (e.button === 2) this.place();
    });
    canvas.addEventListener("pointermove", (e) => this.aim(e));
    canvas.addEventListener("pointerup", () => {
      this.holding = false;
      this.progress = 0;
    });
    canvas.addEventListener("pointercancel", () => this.release());
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }
  release() {
    this.keys.clear();
    this.holding = false;
    this.progress = 0;
  }
  resize() {
    const scale = devicePixelRatio > 1 ? 1.5 : 1;
    this.canvas.width = Math.floor(innerWidth * scale);
    this.canvas.height = Math.floor(innerHeight * scale);
  }
  aim(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    this.target = {
      x: Math.floor(
        (((e.clientX - r.left) * this.canvas.width) / r.width + this.camera.x) /
          T,
      ),
      y: Math.floor(
        (((e.clientY - r.top) * this.canvas.height) / r.height +
          this.camera.y) /
          T,
      ),
    };
  }
  tile(x: number, y: number) {
    if (x < 0 || x >= W || y >= H) return 13;
    if (y < 0) return 0;
    return this.state.tiles[y * W + x];
  }
  hit(x: number, y: number, w = 16, h = 34) {
    for (let by = Math.floor(y / T); by <= Math.floor((y + h - 1) / T); by++)
      for (let bx = Math.floor(x / T); bx <= Math.floor((x + w - 1) / T); bx++)
        if (solid(this.tile(bx, by))) return true;
    return false;
  }
  nearBench() {
    const p = this.state.player;
    for (let y = -4; y <= 4; y++)
      for (let x = -4; x <= 4; x++)
        if (this.tile(Math.floor(p.x / T) + x, Math.floor(p.y / T) + y) === 11)
          return true;
    return false;
  }
  make(index: number) {
    if (craft(this.state, index, this.nearBench())) {
      this.beep(600);
      this.onChange();
      this.onSave();
      return true;
    }
    this.onToast("Нужны ресурсы; для кирки поставь рядом верстак.");
    return false;
  }
  reachable() {
    if (!this.target) return false;
    const p = this.state.player;
    return (
      Math.hypot(
        this.target.x * T + 12 - p.x - 8,
        this.target.y * T + 12 - p.y - 17,
      ) <
      T * 5
    );
  }
  place() {
    if (!this.target || !this.reachable()) return;
    const { x, y } = this.target,
      id = this.selected,
      p = this.state.player;
    if (
      x < 0 ||
      x >= W ||
      y < 0 ||
      y >= H - 2 ||
      this.tile(x, y) !== 0 ||
      !(this.state.inventory[id] > 0) ||
      (x * T < p.x + 16 &&
        (x + 1) * T > p.x &&
        y * T < p.y + 34 &&
        (y + 1) * T > p.y)
    )
      return;
    if (
      ![
        this.tile(x + 1, y),
        this.tile(x - 1, y),
        this.tile(x, y + 1),
        this.tile(x, y - 1),
      ].some((v) => v !== 0)
    )
      return;
    this.state.tiles[y * W + x] = id;
    this.state.inventory[id]--;
    this.state.stats.placed++;
    this.beep(240);
    this.onChange();
  }
  attack() {
    if (this.attackCooldown > 0) return;
    this.attackCooldown = 0.35;
    this.beep(160);
    const p = this.state.player;
    for (const m of this.mobs)
      if (Math.hypot(m.x - p.x, m.y - p.y) < 85) {
        m.hp -= 20 + this.state.tool * 12;
        m.vx = (m.x > p.x ? 1 : -1) * 200;
        this.burst(m.x, m.y, "#b5dc7d");
        if (m.hp <= 0) {
          this.state.stats.kills++;
          this.state.inventory[6] = (this.state.inventory[6] || 0) + 1;
          this.onChange();
        }
      }
    this.mobs = this.mobs.filter((m) => m.hp > 0);
  }
  beep(freq: number) {
    if (!this.sound) return;
    try {
      this.audio ??= new AudioContext();
      void this.audio.resume();
      const o = this.audio.createOscillator(),
        g = this.audio.createGain();
      o.type = "square";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.025, this.audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.audio.currentTime + 0.07);
      o.connect(g);
      g.connect(this.audio.destination);
      o.start();
      o.stop(this.audio.currentTime + 0.08);
    } catch {}
  }
  burst(x: number, y: number, color: string) {
    for (let i = 0; i < 8; i++)
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 100,
        vy: -Math.random() * 100,
        life: 0.5,
        color,
      });
  }
  respawn() {
    const fresh = createWorld(this.state.seed);
    this.state.player = { ...fresh.player };
    this.vx = 0;
    this.vy = 0;
    this.damageCooldown = 3;
    this.onToast("Ты снова у начала пути. Все ресурсы сохранены.");
    this.onChange();
  }
  load(s: Save) {
    this.state = s;
    this.mobs = [];
    this.release();
    this.vx = this.vy = 0;
    this.onChange();
  }
  update(dt: number) {
    if (this.paused) return;
    this.elapsed += dt;
    this.tick += dt;
    const p = this.state.player;
    this.attackCooldown -= dt;
    this.damageCooldown -= dt;
    const dir =
      Number(this.keys.has("KeyD") || this.keys.has("ArrowRight")) -
      Number(this.keys.has("KeyA") || this.keys.has("ArrowLeft"));
    this.vx = dir * 145;
    if (
      (this.keys.has("Space") ||
        this.keys.has("KeyW") ||
        this.keys.has("ArrowUp")) &&
      this.ground
    ) {
      this.vy = -355;
      this.ground = false;
      this.beep(350);
    }
    this.vy = Math.min(600, this.vy + 950 * dt);
    const nx = p.x + this.vx * dt;
    if (!this.hit(nx, p.y)) p.x = nx;
    const ny = p.y + this.vy * dt;
    this.ground = false;
    if (!this.hit(p.x, ny)) p.y = ny;
    else {
      if (this.vy > 0) this.ground = true;
      this.vy = 0;
    }
    if (p.y > H * T) this.respawn();
    if (this.keys.has("KeyF")) this.attack();
    if (this.holding && this.target && this.reachable()) {
      if (this.mode === "build") {
        if (this.tick > 0.2) {
          this.place();
          this.tick = 0;
        }
      } else {
        const { x, y } = this.target,
          id = this.tile(x, y),
          key = x + "," + y;
        if (key !== this.lastTarget) {
          this.progress = 0;
          this.lastTarget = key;
        }
        if (id && id !== 13 && y >= 0 && x >= 0 && x < W) {
          if (id === 8 && this.state.tool < 2) {
            this.onToast("Для кристаллов нужна железная кирка");
            this.holding = false;
          } else {
            this.progress += dt * (1 + this.state.tool * 1.2);
            if (this.progress >= blocks[id].hard) {
              this.state.tiles[y * W + x] = 0;
              const drop = id === 1 ? 2 : id === 5 ? 4 : id;
              this.state.inventory[drop] =
                (this.state.inventory[drop] || 0) + 1;
              this.state.stats.mined++;
              this.progress = 0;
              this.burst(x * T + 12, y * T + 12, blocks[id].color);
              this.beep(100 + id * 20);
              this.onChange();
            }
          }
        }
      }
    } else this.progress = 0;
    if (this.elapsed > 7 && this.mobs.length < 7) {
      this.elapsed = 0;
      const x =
        p.x + (Math.random() < 0.5 ? -1 : 1) * (220 + Math.random() * 220);
      for (let y = Math.max(0, Math.floor(p.y / T) - 12); y < H - 2; y++)
        if (
          solid(this.tile(Math.floor(x / T), y)) &&
          !solid(this.tile(Math.floor(x / T), y - 1))
        ) {
          this.mobs.push({ x, y: y * T - 18, vx: 0, vy: 0, hp: 40, cool: 0 });
          break;
        }
    }
    for (const m of this.mobs) {
      m.cool -= dt;
      if (m.cool < 0) {
        m.vx = Math.sign(p.x - m.x) * 45;
        m.vy = -230;
        m.cool = 1.6;
      }
      m.vy = Math.min(500, m.vy + 800 * dt);
      if (!this.hit(m.x + m.vx * dt, m.y, 23, 18)) m.x += m.vx * dt;
      if (!this.hit(m.x, m.y + m.vy * dt, 23, 18)) m.y += m.vy * dt;
      else m.vy = 0;
      if (
        Math.hypot(m.x - p.x, m.y - p.y - 15) < 29 &&
        this.damageCooldown <= 0
      ) {
        p.hp -= 8;
        this.damageCooldown = 1.2;
        this.beep(70);
        if (p.hp <= 0) this.respawn();
        this.onChange();
      }
    }
    this.mobs = this.mobs.filter(
      (m) => Math.abs(m.x - p.x) < 1000 && m.y < H * T,
    );
    if (p.hp < 100 && this.damageCooldown < -5)
      p.hp = Math.min(100, p.hp + dt * 2);
    for (const a of this.particles) {
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.vy += 300 * dt;
      a.life -= dt;
    }
    this.particles = this.particles.filter((a) => a.life > 0);
  }
  frame(t: number) {
    const dt = Math.min((t - (this.prev || t)) / 1000, 0.1);
    this.prev = t;
    this.accumulator += dt;
    while (this.accumulator >= 1 / 60) {
      this.update(1 / 60);
      this.accumulator -= 1 / 60;
    }
    this.draw();
    this.raf = requestAnimationFrame((v) => this.frame(v));
  }
  draw() {
    const c = this.ctx,
      w = this.canvas.width,
      h = this.canvas.height,
      p = this.state.player;
    this.camera.x = Math.max(0, Math.min(W * T - w, p.x - w / 2));
    this.camera.y = Math.max(0, Math.min(H * T - h, p.y - h * 0.47));
    const cx = this.camera.x,
      cy = this.camera.y,
      ph = phase(this.state),
      night = ph > 0.55;
    c.imageSmoothingEnabled = false;
    c.fillStyle = night ? "#152c48" : "#8bbdc3";
    c.fillRect(0, 0, w, h);
    if (night) {
      c.fillStyle = "#b8d5d5";
      for (let i = 0; i < 65; i++)
        c.fillRect((i * 137.7) % w, (i * i * 11) % Math.max(1, h * 0.55), 2, 2);
    }
    c.fillStyle = night ? "#f2ecc9" : "#fff1be";
    c.fillRect(w * 0.75, 65, 40, 40);
    c.fillStyle = night ? "#304d5c" : "#77a4a6";
    for (let layer = 0; layer < 3; layer++) {
      c.fillStyle = night
        ? ["#223e52", "#2b4b57", "#355b5e"][layer]
        : ["#7fadb0", "#719e9f", "#5f8e8d"][layer];
      c.beginPath();
      c.moveTo(0, h);
      for (let x = 0; x <= w + 24; x += 24)
        c.lineTo(
          x,
          h * 0.52 +
            Math.sin((x + cx * (0.1 + layer * 0.12)) * 0.004 + layer) * 95 +
            layer * 35 -
            cy * 0.12,
        );
      c.lineTo(w, h);
      c.fill();
    }
    c.save();
    c.translate(-Math.floor(cx), -Math.floor(cy));
    const x0 = Math.floor(cx / T),
      y0 = Math.floor(cy / T);
    for (let y = y0; y <= Math.min(H - 1, y0 + Math.ceil(h / T)); y++)
      for (let x = x0; x <= Math.min(W - 1, x0 + Math.ceil(w / T)); x++) {
        const id = this.tile(x, y),
          px = x * T,
          py = y * T;
        if (!id) {
          if (y > 38) {
            c.fillStyle = "#263b42";
            c.fillRect(px, py, T, T);
          }
          continue;
        }
        if (id === 10) {
          c.fillStyle = "#80543c";
          c.fillRect(px + 10, py + 10, 4, 14);
          c.fillStyle = "#ffd38a";
          c.fillRect(px + 7, py + 3, 10, 10);
          continue;
        }
        c.fillStyle = id === 1 ? "#916349" : blocks[id].color;
        c.fillRect(px, py, T, T);
        c.fillStyle = "rgba(0,0,0,.12)";
        c.fillRect(px, py + T - 2, T, 2);
        const n = (x * 31 + y * 17) % 13;
        c.fillRect(px + 3 + n, py + 7, 5, 3);
        c.fillRect(px + 3, py + 16, 4, 3);
        c.fillStyle = "rgba(255,255,255,.1)";
        c.fillRect(px, py, T, 2);
        if (id === 1) {
          c.fillStyle = "#76ad61";
          c.fillRect(px, py, T, 6);
          c.fillRect(px + 3, py + 5, 4, 4);
        }
        if (id === 4) {
          c.fillStyle = "#775238";
          c.fillRect(px + 6, py, 3, T);
          c.fillRect(px + 17, py, 2, T);
        }
        if ([6, 7, 8].includes(id)) {
          c.fillStyle = id === 6 ? "#192a33" : id === 7 ? "#e0b195" : "#c2fff0";
          c.fillRect(px + 5, py + 6, 5, 5);
          c.fillRect(px + 14, py + 14, 6, 5);
        }
        if (id === 9 || id === 11) {
          c.fillStyle = "#765539";
          c.fillRect(px, py + 10, T, 2);
          if (id === 11) {
            c.fillStyle = "#e1b67c";
            c.fillRect(px, py, T, 5);
          }
        }
      }
    for (const m of this.mobs) {
      c.fillStyle = "#88ba69";
      c.fillRect(m.x, m.y + 4, 23, 14);
      c.fillRect(m.x + 4, m.y, 15, 8);
      c.fillStyle = "#233d3c";
      c.fillRect(m.x + 5, m.y + 7, 3, 3);
      c.fillRect(m.x + 15, m.y + 7, 3, 3);
    }
    const blink =
      this.damageCooldown > 0 && Math.floor(Date.now() / 90) % 2 === 0;
    if (!blink) {
      const x = Math.round(p.x),
        y = Math.round(p.y),
        walk = this.vx ? Math.sin(Date.now() / 80) * 3 : 0;
      c.fillStyle = "#354552";
      c.fillRect(x + 2, y + 25, 5, 9 + walk);
      c.fillRect(x + 10, y + 25, 5, 9 - walk);
      c.fillStyle = "#d6a06f";
      c.fillRect(x + 2, y + 3, 14, 12);
      c.fillStyle = "#4c3733";
      c.fillRect(x, y, 18, 6);
      c.fillRect(x, y + 4, 4, 5);
      c.fillStyle = "#e4bd7b";
      c.fillRect(x, y + 15, 17, 12);
      c.fillStyle = "#738779";
      c.fillRect(x + 3, y + 17, 10, 10);
      c.fillStyle = "#253e40";
      c.fillRect(x + 12, y + 8, 2, 3);
      c.fillStyle = "#aa8051";
      c.fillRect(x + 18, y + 16, 3, 15);
      c.fillStyle = ["#a4b3af", "#a4b3af", "#cfbfba", "#98f3dc"][
        this.state.tool
      ];
      c.fillRect(x + 14, y + 14, 13, 4);
    }
    for (const a of this.particles) {
      c.fillStyle = a.color;
      c.fillRect(a.x, a.y, 4, 4);
    }
    if (this.target && this.reachable()) {
      const { x, y } = this.target;
      c.strokeStyle = this.mode === "mine" ? "#fff1c8" : "#a9ecc7";
      c.lineWidth = 2;
      c.strokeRect(x * T + 1, y * T + 1, T - 2, T - 2);
      if (this.progress) {
        c.fillStyle = "#fff1c8";
        c.fillRect(
          x * T,
          y * T - 5,
          T * Math.min(1, this.progress / blocks[this.tile(x, y)].hard),
          3,
        );
      }
    }
    c.restore();
    const darkness = Math.min(
      0.75,
      Math.max(0, (p.y / T - 32) / 40) + (night ? 0.2 : 0),
    );
    if (darkness > 0) {
      const g = c.createRadialGradient(
        p.x - cx + 8,
        p.y - cy + 17,
        35,
        p.x - cx + 8,
        p.y - cy + 17,
        Math.max(150, w * 0.4),
      );
      g.addColorStop(0, "rgba(8,18,27,0)");
      g.addColorStop(1, `rgba(8,18,27,${darkness})`);
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }
  }
}
