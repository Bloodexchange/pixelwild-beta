import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, craft, phase, W, H, solid } from "../src/world";
import { saveSchema } from "../src/validation";
test("same seed generates the same world, safe spawn and solid bedrock", () => {
  const a = createWorld(123),
    b = createWorld(123);
  assert.deepEqual(a.tiles, b.tiles);
  assert.equal(a.tiles.length, W * H);
  assert.ok(a.tiles.slice(-W * 2).every((n) => n === 13));
  const x = Math.floor(a.player.x / 24),
    y = Math.floor(a.player.y / 24);
  assert.equal(solid(a.tiles[y * W + x]), false);
  assert.ok(saveSchema.safeParse(a).success);
  assert.ok(a.tiles.includes(8));
});
test("crafting consumes resources exactly and cannot duplicate tools", () => {
  const s = createWorld(123);
  assert.equal(craft(s, 0, false), true);
  assert.equal(s.inventory[4], 7);
  assert.equal(s.inventory[9], 4);
  s.inventory[3] = 8;
  assert.equal(craft(s, 3, false), false);
  assert.equal(craft(s, 3, true), true);
  assert.equal(s.tool, 1);
  assert.equal(s.inventory[3], 0);
  assert.equal(craft(s, 3, true), false);
});
test("day clock continues across offline time", () => {
  const s = createWorld(123);
  assert.equal(phase(s, s.born + 360000), 0.5);
  assert.equal(phase(s, s.born + 720000), 0);
});
test("untrusted saves reject bad sizes, block ids and inventory values", () => {
  const s = createWorld(1);
  assert.equal(saveSchema.safeParse({ ...s, tiles: [0] }).success, false);
  assert.equal(
    saveSchema.safeParse({ ...s, inventory: { 4: -1 } }).success,
    false,
  );
  assert.equal(
    saveSchema.safeParse({ ...s, player: { ...s.player, x: Infinity } })
      .success,
    false,
  );
  s.tiles[0] = 999;
  assert.equal(saveSchema.safeParse(s).success, false);
});
