export const W = 256,
  H = 96,
  T = 24;
export const blocks = [
  { name: "Воздух", color: "transparent", hard: 0 },
  { name: "Дёрн", color: "#6aab65", hard: 0.3 },
  { name: "Земля", color: "#926449", hard: 0.3 },
  { name: "Камень", color: "#697c86", hard: 0.8 },
  { name: "Дерево", color: "#a47748", hard: 0.5 },
  { name: "Листва", color: "#4b925e", hard: 0.15 },
  { name: "Уголь", color: "#35444e", hard: 1 },
  { name: "Железо", color: "#be9076", hard: 1.3 },
  { name: "Кристалл", color: "#87e2ce", hard: 1.8 },
  { name: "Доски", color: "#c49760", hard: 0.4 },
  { name: "Факел", color: "#ffce75", hard: 0.1 },
  { name: "Верстак", color: "#b78254", hard: 0.5 },
  { name: "Песок", color: "#d2bd82", hard: 0.3 },
  { name: "Коренная порода", color: "#293942", hard: 999 },
];
export const solid = (id: number) => ![0, 5, 10].includes(id);
export type Save = {
  version: 1;
  seed: number;
  tiles: number[];
  player: { x: number; y: number; hp: number };
  inventory: Record<string, number>;
  tool: number;
  born: number;
  updated: number;
  stats: { mined: number; placed: number; crafted: number; kills: number };
};
export function random(seed: number) {
  let s = seed | 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function surface(x: number, seed: number) {
  return (
    29 + Math.floor(Math.sin(x * 0.055 + seed) * 5 + Math.sin(x * 0.16) * 2)
  );
}
export function createWorld(seed = Math.floor(Math.random() * 1000000)): Save {
  const rng = random(seed),
    tiles = new Array(W * H).fill(0);
  for (let x = 0; x < W; x++) {
    const s = surface(x, seed);
    for (let y = s; y < H; y++) {
      let id = y === s ? 1 : y < s + 5 ? 2 : 3;
      if (y > s + 7) {
        const cave =
          Math.sin(x * 0.19 + Math.sin(y * 0.2) * 2) +
          Math.cos(y * 0.25 + x * 0.04);
        if (cave > 1.25) id = 0;
        else {
          const r = rng();
          if (r < 0.065) id = 6;
          if (r < 0.024 && y > 45) id = 7;
          if (r < 0.008 && y > 65) id = 8;
        }
      }
      if (y >= H - 2) id = 13;
      tiles[y * W + x] = id;
    }
    if (x > 5 && x < W - 5 && x % 9 === 0) {
      const h = 4 + Math.floor(rng() * 3);
      for (let y = s - h; y < s; y++) tiles[y * W + x] = 4;
      for (let dx = -2; dx <= 2; dx++)
        for (let dy = -2; dy <= 1; dy++)
          if (
            Math.abs(dx) + Math.abs(dy) < 4 &&
            tiles[(s - h + dy) * W + x + dx] === 0
          )
            tiles[(s - h + dy) * W + x + dx] = 5;
    }
  }
  const x = 12;
  return {
    version: 1,
    seed,
    tiles,
    player: { x: x * T, y: (surface(x, seed) - 3) * T, hp: 100 },
    inventory: { "4": 8, "10": 8 },
    tool: 0,
    born: Date.now(),
    updated: Date.now(),
    stats: { mined: 0, placed: 0, crafted: 0, kills: 0 },
  };
}
export const recipes = [
  { name: "Доски × 4", result: 9, count: 4, cost: { 4: 1 }, level: 0 },
  { name: "Верстак", result: 11, count: 1, cost: { 9: 8 }, level: 0 },
  { name: "Факелы × 4", result: 10, count: 4, cost: { 4: 1, 6: 1 }, level: 0 },
  {
    name: "Каменная кирка",
    result: -1,
    count: 1,
    cost: { 4: 3, 3: 8 },
    level: 1,
  },
  {
    name: "Железная кирка",
    result: -1,
    count: 1,
    cost: { 4: 4, 7: 8 },
    level: 2,
  },
  {
    name: "Кристальная кирка",
    result: -1,
    count: 1,
    cost: { 7: 6, 8: 5 },
    level: 3,
  },
] satisfies {
  name: string;
  result: number;
  count: number;
  cost: Record<number, number>;
  level: number;
}[];
export function craft(s: Save, index: number, nearBench: boolean) {
  const r = recipes[index];
  if (
    !r ||
    (r.level > 0 && (!nearBench || s.tool >= r.level)) ||
    Object.entries(r.cost).some(([id, n]) => (s.inventory[id] || 0) < n)
  )
    return false;
  for (const [id, n] of Object.entries(r.cost)) s.inventory[id] -= n;
  if (r.result === -1) s.tool = r.level;
  else s.inventory[r.result] = (s.inventory[r.result] || 0) + r.count;
  s.stats.crafted++;
  return true;
}
export function phase(s: Save, now = Date.now()) {
  return ((((now - s.born) % 720000) + 720000) % 720000) / 720000;
}
