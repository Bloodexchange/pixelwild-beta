import "./style.css";
import { Game } from "./game";
import { blocks, recipes, phase, createWorld, type Save } from "./world";
import { readSave, writeSave } from "./storage";
import { api, signOut } from "./cloud";
import { saveSchema } from "./validation";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { App } from "@capacitor/app";
const $ = <T extends HTMLElement = HTMLElement>(s: string) =>
  document.querySelector<T>(s)!;
$("#app").innerHTML = `<canvas id="world" aria-label="Игровой мир"></canvas>
<section id="home"><nav class="nav"><div class="brand"><img src="/icon.svg" alt="">PIXELWILD <span class="tag">BETA 0.1</span></div><div class="nav-right"><span class="muted">Маленькие блоки. Большие приключения.</span><button id="account-home">Аккаунт ↗</button></div></nav><div class="hero"><div><div class="eyebrow"><span class="dot"></span> ТВОЙ МИР НАЧИНАЕТСЯ ЗДЕСЬ</div><h1>Копай глубже.<br>Строй <span>своё.</span></h1><p>За каждым блоком — маленькое открытие. Исследуй пещеры, собирай ресурсы и преврати дикий мир в свой дом.</p><div class="actions"><button class="primary" id="play">Начать приключение &nbsp; →</button><button id="help-home">Как играть</button></div><div class="hint">Без интернета · Без рекламы · В твоём темпе</div></div></div><div class="world-label"><b>ТИХАЯ ДОЛИНА</b><p>Процедурный мир · 256 × 96 блоков</p></div><footer class="home-bottom"><div class="feature"><span class="feature-icon">◇</span><div><b>Исследуй</b><small>Пещеры и редкие кристаллы</small></div></div><div class="feature"><span class="feature-icon">▦</span><div><b>Создавай</b><small>От первой кирки до дома</small></div></div><div class="feature"><span class="feature-icon">☼</span><div><b>Оставайся</b><small>Мир помнит каждый блок</small></div></div></footer></section>
<section id="hud" class="hidden"><div class="hud-top"><div class="glass status"><strong>PIXELWILD</strong><div class="health"><i id="health"></i></div><div id="location" class="hint"></div></div><div class="hud-buttons"><button id="mode">⛏ Добыча</button><button id="craft">▦ Крафт</button><button id="menu">☰ Меню</button></div></div><div class="hud-bottom"><div class="game-tip" id="objective">Первый шаг: добудь дерево и создай верстак</div><div class="touch-controls"><div><button data-key="KeyA" aria-label="Влево">←</button><button data-key="KeyD" aria-label="Вправо">→</button></div><div><button data-key="KeyF" aria-label="Удар">⚔</button><button data-key="Space" aria-label="Прыжок">↑</button></div></div><div class="hotbar glass" id="hotbar"></div><div class="game-tip" id="save-status">Мир сохраняется на этом устройстве</div></div></section><div id="modal" class="dialog-wrap hidden"></div><div id="toast" class="hidden" role="status"></div>`;
const existing = await readSave();
const game = new Game($("#world"), existing);
game.paused = true;
if (existing) $("#play").textContent = "Продолжить приключение →";
let playing = false,
  toastTimer: ReturnType<typeof setTimeout>,
  saveQueue = Promise.resolve(),
  user: { id: string; name: string; email: string } | null = null,
  revision: number | null = null,
  cloudEnabled = false,
  syncing = false;
function toast(s: string) {
  $("#toast").textContent = s;
  $("#toast").classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.add("hidden"), 3000);
}
async function save() {
  const snapshot = structuredClone(game.state);
  saveQueue = saveQueue.catch(() => {}).then(() => writeSave(snapshot));
  try {
    await saveQueue;
    $("#save-status").textContent = "✓ Сохранено на устройстве";
  } catch {
    $("#save-status").textContent =
      "Не удалось сохранить — экспортируй мир через меню";
  }
}
function render() {
  const ids = [4, 2, 3, 9, 10, 11, 7, 8];
  $("#hotbar").innerHTML = ids
    .map(
      (id, i) =>
        `<button class="slot ${game.selected === id ? "active" : ""}" data-block="${id}" title="${blocks[id].name}" aria-label="${blocks[id].name}: ${game.state.inventory[id] || 0}"><em>${i + 1}</em><span class="block" style="background:${blocks[id].color}"></span><small>${game.state.inventory[id] || 0}</small></button>`,
    )
    .join("");
  $("#health").style.width = game.state.player.hp + "%";
  $("#objective").textContent =
    game.state.tool >= 3
      ? "Ты освоил глубины! Построй дом своей мечты."
      : game.state.tool >= 2
        ? "Найди 5 кристаллов в глубине и создай лучшую кирку"
        : game.state.tool >= 1
          ? "Следующая цель: 8 железа для новой кирки"
          : game.state.stats.crafted > 0
            ? "Поставь верстак рядом и собери 8 камня для кирки"
            : "Первый шаг: добудь дерево и создай верстак";
}
game.onChange = render;
game.onToast = toast;
game.onSave = () => void save();
render();
function close() {
  $("#modal").classList.add("hidden");
  $("#modal").innerHTML = "";
  game.paused = !playing;
  game.release();
}
function modal(title: string, html: string) {
  game.paused = true;
  game.release();
  $("#modal").innerHTML =
    `<section class="dialog" role="dialog" aria-modal="true" aria-label="${title}"><header class="dialog-head"><h2>${title}</h2><button class="close" aria-label="Закрыть">×</button></header>${html}</section>`;
  $("#modal").classList.remove("hidden");
  $(".close").onclick = close;
  $(".close").focus();
}
function start() {
  playing = true;
  game.paused = false;
  $("#home").classList.add("hidden");
  $("#hud").classList.remove("hidden");
  void save();
}
$("#play").onclick = start;
function help() {
  modal(
    "Здесь всё начинается с блока",
    `<p><b>Компьютер:</b> A/D или стрелки — идти, Space — прыгнуть. Зажми левую кнопку мыши на блоке, чтобы добыть его. Кнопка «Добыча / Стройка» переключает режим. F — удар по слизню. 1–8 — быстрый выбор блока.</p><p><b>Телефон:</b> стрелки внизу — движение и прыжок, меч — атака. Зажми блок на экране для добычи. Для строительства выбери блок внизу и переключи режим.</p><h3>Твой первый вечер</h3><p>1. Добудь дерево.<br>2. В крафте сделай 8 досок и верстак.<br>3. Поставь верстак рядом, добудь 8 камня.<br>4. Сделай кирку и отправляйся за железом.<br>5. Для кристаллов нужна железная кирка.</p><div class="offline-note">День длится 12 минут. Время суток идёт даже после выхода. В меню игра ставится на паузу. После поражения ресурсы остаются с тобой. Облако необязательно; основной мир хранится на устройстве.</div>`,
  );
}
$("#help-home").onclick = help;
function toggleMode() {
  game.mode = game.mode === "mine" ? "build" : "mine";
  $("#mode").textContent = game.mode === "mine" ? "⛏ Добыча" : "▧ Стройка";
}
$("#mode").onclick = toggleMode;
$("#hotbar").onclick = (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-block]");
  if (b) {
    game.selected = Number(b.dataset.block);
    render();
  }
};
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-key]")) {
  b.onpointerdown = (e) => {
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    game.keys.add(b.dataset.key!);
  };
  b.onpointerup = b.onpointercancel = () => game.keys.delete(b.dataset.key!);
}
function crafting() {
  modal(
    "Мастерская",
    `<p>${game.nearBench() ? "● Верстак рядом — можно улучшить кирку" : "Поставь верстак рядом, чтобы создавать кирки."}</p><div id="recipes">${recipes
      .map(
        (r, i) =>
          `<div class="recipe"><div><b>${r.name}</b><small>${Object.entries(
            r.cost,
          )
            .map(
              ([id, n]) =>
                `${blocks[Number(id)].name} ${game.state.inventory[id] || 0}/${n}`,
            )
            .join(
              " · ",
            )}</small></div><button data-recipe="${i}" ${Object.entries(r.cost).some(([id, n]) => (game.state.inventory[id] || 0) < n) || (r.level > 0 && (!game.nearBench() || game.state.tool >= r.level)) ? "disabled" : ""}>Создать</button></div>`,
      )
      .join(
        "",
      )}</div><h3>Рюкзак · нажми, чтобы выбрать блок</h3><div class="inventory">${Object.entries(
      game.state.inventory,
    )
      .filter(([, n]) => n > 0)
      .map(
        ([id, n]) =>
          `<button data-inventory="${id}"><span class="block" style="background:${blocks[Number(id)].color}"></span>${blocks[Number(id)].name} × ${n}</button>`,
      )
      .join("")}</div>`,
  );
  $("#recipes").onclick = (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-recipe]");
    if (el && game.make(Number(el.dataset.recipe))) crafting();
  };
  $(".inventory").onclick = (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>(
      "[data-inventory]",
    );
    if (el) {
      game.selected = Number(el.dataset.inventory);
      render();
      close();
    }
  };
}
$("#craft").onclick = crafting;
async function exportWorld() {
  const name = `pixelwild-${game.state.seed}-${Date.now()}.json`;
  try {
    if (Capacitor.isNativePlatform()) {
      const result = await Filesystem.writeFile({
        path: name,
        data: JSON.stringify(game.state),
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      await Share.share({ title: "Мир Pixelwild", url: result.uri });
      return;
    }
    const blob = new Blob([JSON.stringify(game.state)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch {
    toast("Не удалось экспортировать мир. Попробуй ещё раз.");
  }
}
function menu() {
  void save();
  const s = game.state.stats;
  modal(
    "У костра",
    `<div class="stats-row"><div><b>${s.mined}</b><small>БЛОКОВ ДОБЫТО</small></div><div><b>${s.placed}</b><small>ПОСТРОЕНО</small></div><div><b>${s.kills}</b><small>СЛИЗНЕЙ ПОБЕЖДЕНО</small></div></div><div class="menu-list"><button class="primary" id="resume">Продолжить →</button><button id="cloud-menu">☁ Аккаунт и облачное сохранение</button><button id="instructions">Управление и первые шаги</button><button id="sound">Звук: ${game.sound ? "включён" : "выключен"}</button><button id="export">Экспорт мира в файл</button><button id="import">Импорт мира из файла</button><button id="new-world">Создать другой мир…</button><button id="to-home">На главный экран</button></div><p>Мир #${game.state.seed} · Pixelwild 0.1.0 Beta</p>`,
  );
  $("#resume").onclick = close;
  $("#cloud-menu").onclick = account;
  $("#instructions").onclick = help;
  $("#sound").onclick = () => {
    game.sound = !game.sound;
    menu();
  };
  $("#export").onclick = exportWorld;
  $("#import").onclick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async () => {
      try {
        const f = input.files?.[0];
        if (!f) return;
        if (f.size > 500000) throw new Error("Файл слишком большой");
        const s = saveSchema.parse(JSON.parse(await f.text()));
        modal(
          "Заменить мир?",
          `<p>Текущий мир будет заменён импортированным. Сначала можно экспортировать его.</p><div class="actions"><button id="backup">Экспортировать текущий</button><button id="confirm-import" class="primary">Заменить</button></div>`,
        );
        $("#backup").onclick = exportWorld;
        $("#confirm-import").onclick = () => {
          cloudEnabled = false;
          revision = null;
          game.load(s);
          void save();
          close();
        };
      } catch {
        toast("Это не поддерживаемое сохранение Pixelwild.");
      }
    };
    input.click();
  };
  $("#new-world").onclick = () => {
    modal(
      "Новое приключение?",
      `<p>На устройстве хранится один активный мир. Экспортируй текущий, чтобы вернуться к нему позже.</p><div class="actions"><button id="backup">Экспортировать текущий</button><button id="confirm-new" class="primary">Создать новый мир</button></div>`,
    );
    $("#backup").onclick = exportWorld;
    $("#confirm-new").onclick = () => {
      cloudEnabled = false;
      revision = null;
      game.load(createWorld());
      void save();
      close();
    };
  };
  $("#to-home").onclick = () => {
    playing = false;
    close();
    $("#hud").classList.add("hidden");
    $("#home").classList.remove("hidden");
    $("#play").textContent = "Продолжить приключение →";
  };
}
$("#menu").onclick = menu;
async function sync() {
  if (!cloudEnabled || !user || syncing || revision === null) return;
  syncing = true;
  try {
    const d = await api("world", "PUT", { state: game.state, revision });
    revision = d.revision;
    $("#save-status").textContent = "✓ На устройстве и в облаке";
  } catch (e) {
    cloudEnabled = false;
    toast((e as Error).message);
  } finally {
    syncing = false;
  }
}
function account() {
  if (user) {
    modal(
      "Твой мир с тобой",
      `<p class="account-name" id="account-label"></p><div class="offline-note">На устройстве и в облаке могут быть разные миры. Выбери, какой сохранить. После загрузки или отправки включится автосохранение в облако каждые 30 секунд до выхода из игры.</div><div class="actions"><button id="upload" class="primary">Сохранить в облако</button><button id="download">Загрузить из облака</button><button id="logout">Выйти из аккаунта</button></div><p id="account-message" role="status"></p>`,
    );
    $("#account-label").textContent = user.name + " · " + user.email;
    $("#upload").onclick = async () => {
      try {
        const d = await api("world");
        if (d.state) {
          modal(
            "Заменить облачную версию?",
            `<p>Сохранённый в облаке мир будет заменён текущим миром с этого устройства.</p><button id="confirm-upload" class="primary">Сохранить текущий мир в облако</button>`,
          );
          $("#confirm-upload").onclick = async () => {
            revision = d.revision;
            cloudEnabled = true;
            await sync();
            account();
          };
        } else {
          revision = 0;
          cloudEnabled = true;
          await sync();
          toast("Мир сохранён в облаке");
        }
      } catch (e) {
        toast((e as Error).message);
      }
    };
    $("#download").onclick = async () => {
      try {
        const d = await api("world");
        if (!d.state) {
          toast("В облаке пока нет мира. Сначала сохрани его.");
          return;
        }
        const state = saveSchema.parse(d.state);
        modal(
          "Загрузить облачный мир?",
          `<p>Мир на устройстве будет заменён. При необходимости сначала экспортируй его.</p><div class="actions"><button id="backup">Экспортировать текущий</button><button id="confirm-download" class="primary">Загрузить</button></div>`,
        );
        $("#backup").onclick = exportWorld;
        $("#confirm-download").onclick = () => {
          game.load(state);
          revision = d.revision;
          cloudEnabled = true;
          void save();
          close();
          toast("Облачный мир загружен");
        };
      } catch (e) {
        toast((e as Error).message);
      }
    };
    $("#logout").onclick = async () => {
      try {
        await signOut();
        user = null;
        cloudEnabled = false;
        revision = null;
        account();
      } catch (e) {
        toast((e as Error).message);
      }
    };
    return;
  }
  let signup = false;
  function form() {
    modal(
      "Сохрани своё приключение",
      `<p>Аккаунт нужен только для переноса мира между устройствами. Офлайн можно играть без регистрации.</p><div class="tabs"><button id="tab-login" class="${signup ? "" : "active"}">Вход</button><button id="tab-signup" class="${signup ? "active" : ""}">Регистрация</button></div><form id="auth-form">${signup ? '<label>Имя<input name="name" required minlength="2" maxlength="40" autocomplete="nickname" placeholder="Путешественник"></label>' : ""}<label>Электронная почта<input name="email" type="email" required autocomplete="email" placeholder="you@example.com"></label><label>Пароль<input name="password" type="password" required minlength="10" maxlength="128" autocomplete="${signup ? "new-password" : "current-password"}" placeholder="Не меньше 10 символов"></label><button class="primary" id="submit-auth">${signup ? "Создать аккаунт" : "Войти"} →</button><p class="error" id="auth-error" role="alert"></p></form><div class="offline-note">Бета: восстановление пароля через почту ещё не подключено. Сохрани пароль в менеджере паролей.</div>`,
    );
    $("#tab-login").onclick = () => {
      signup = false;
      form();
    };
    $("#tab-signup").onclick = () => {
      signup = true;
      form();
    };
    $("#auth-form").onsubmit = async (e) => {
      e.preventDefault();
      const button = $<HTMLButtonElement>("#submit-auth");
      button.disabled = true;
      const data = Object.fromEntries(
        new FormData(e.target as HTMLFormElement),
      );
      try {
        const result = await api(
          signup ? "auth/sign-up/email" : "auth/sign-in/email",
          "POST",
          data,
        );
        user = result.user;
        account();
        toast("Вход выполнен. Выбери действие с облачным миром.");
      } catch (e) {
        $("#auth-error").textContent = (e as Error).message;
        button.disabled = false;
      }
    };
  }
  form();
}
$("#account-home").onclick = account;
window.addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement).matches("input")) return;
  if (e.code === "Escape") {
    if (!$("#modal").classList.contains("hidden")) close();
    else if (playing) menu();
  }
  if (!playing || !$("#modal").classList.contains("hidden")) return;
  if (e.code === "KeyE") crafting();
  if (e.code === "KeyB") toggleMode();
  if (/^Digit[1-8]$/.test(e.code)) {
    game.selected = [4, 2, 3, 9, 10, 11, 7, 8][Number(e.code.slice(-1)) - 1];
    render();
  }
});
document.addEventListener("visibilitychange", () => {
  game.release();
  if (document.hidden) {
    void save();
    game.paused = true;
  } else game.paused = !playing || !$("#modal").classList.contains("hidden");
});
if (Capacitor.isNativePlatform()) {
  void App.addListener("appStateChange", ({ isActive }) => {
    if (!isActive) {
      game.release();
      game.paused = true;
      void save();
    } else game.paused = !playing || !$("#modal").classList.contains("hidden");
  });
  void App.addListener("backButton", () => {
    if (!$("#modal").classList.contains("hidden")) close();
    else if (playing) menu();
    else void App.minimizeApp();
  });
}
setInterval(() => {
  if (playing) void save();
}, 5000);
setInterval(() => void sync(), 30000);
setInterval(() => {
  $("#health").style.width = game.state.player.hp + "%";
  $("#location").textContent =
    `${phase(game.state) > 0.55 ? "☾ Ночь" : "☼ День"} · Глубина ${Math.max(0, Math.floor(game.state.player.y / 24) - 30)} м`;
}, 1000);
void api("auth/get-session")
  .then((d) => {
    user = d?.user ?? null;
  })
  .catch(() => {});
