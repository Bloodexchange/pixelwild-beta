import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
await mkdir("artifacts", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1365, height: 768 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(process.env.BASE_URL || "http://127.0.0.1:4173");
await page.getByRole("button", { name: /Начать приключение/ }).waitFor();
await page.screenshot({ path: "artifacts/home-desktop.png" });
await page.click("#play");
await page.waitForTimeout(700);
await page.click("#craft");
await page.locator('[data-recipe="0"]').click();
assert.match(await page.locator(".inventory").innerText(), /Доски × 4/);
await page.locator('[data-recipe="0"]').click();
await page.locator('[data-recipe="1"]').click();
assert.match(await page.locator(".inventory").innerText(), /Верстак × 1/);
await page.click(".close");
await page.keyboard.down("KeyD");
await page.waitForTimeout(700);
await page.keyboard.up("KeyD");
await page.click("#menu");
await page.waitForTimeout(250);
await page.click("#resume");
const saved = await page.evaluate(() =>
  JSON.parse(localStorage.getItem("CapacitorStorage.pixelwild-world")),
);
assert.equal(saved.stats.crafted, 3);
assert.ok(saved.player.x > 288);
// Mine the ground directly under the player, using the same camera geometry as the renderer.
const pos = await page.evaluate((s) => {
  const c = document.querySelector("canvas"),
    cx = Math.max(0, Math.min(256 * 24 - c.width, s.player.x - c.width / 2)),
    cy = Math.max(
      0,
      Math.min(96 * 24 - c.height, s.player.y - c.height * 0.47),
    );
  const tx = Math.floor((s.player.x + 8) / 24);
  let ty = Math.floor((s.player.y + 34) / 24);
  while (s.tiles[ty * 256 + tx] === 0) ty++;
  return {
    x: ((tx * 24 + 12 - cx) * innerWidth) / c.width,
    y: ((ty * 24 + 12 - cy) * innerHeight) / c.height,
  };
}, saved);
await page.mouse.move(pos.x, pos.y);
await page.mouse.down();
await page.waitForTimeout(900);
await page.mouse.up();
await page.click("#menu");
await page.waitForTimeout(250);
await page.click("#resume");
const after = await page.evaluate(() =>
  JSON.parse(localStorage.getItem("CapacitorStorage.pixelwild-world")),
);
assert.ok(after.stats.mined > 0, "mining changed the world");
await page.screenshot({ path: "artifacts/game-desktop.png" });
await page.reload();
await page.click("#play");
await page.click("#craft");
assert.match(await page.locator(".inventory").innerText(), /Верстак × 1/);
await page.click(".close");
await context.setOffline(true);
await page.keyboard.down("KeyD");
await page.waitForTimeout(300);
await page.keyboard.up("KeyD");
await page.click("#menu");
await page.waitForTimeout(250);
assert.ok(
  (await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("CapacitorStorage.pixelwild-world"))
        .player.x,
  )) > saved.player.x,
);
await context.setOffline(false);
const mobile = await browser.newContext({
  viewport: { width: 844, height: 390 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1,
});
const mp = await mobile.newPage();
mp.on("pageerror", (e) => errors.push(e.message));
await mp.goto(process.env.BASE_URL || "http://127.0.0.1:4173");
await mp.click("#play");
assert.equal(await mp.locator(".touch-controls").isVisible(), true);
await mp.screenshot({ path: "artifacts/game-mobile.png" });
assert.deepEqual(errors, []);
console.log(
  "PASS: menu, crafting, movement, mining, persistence, offline movement and mobile controls; no JS errors.",
);
await browser.close();
