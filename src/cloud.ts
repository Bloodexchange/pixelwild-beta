import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
const native = Capacitor.isNativePlatform();
const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
export async function api(path: string, method = "GET", body?: unknown) {
  if (native && !base)
    throw new Error("Облачный сервер пока не подключён. Игра офлайн доступна.");
  const token = native
    ? (await Preferences.get({ key: "pixelwild-session" })).value
    : null;
  let res: Response;
  try {
    res = await fetch(base + "/api/" + path, {
      method,
      credentials: native ? "omit" : "same-origin",
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error("Нет связи с сервером. Мир остаётся на устройстве.");
  }
  const data = await res
    .json()
    .catch(() => ({ error: "Сервер ещё не настроен." }));
  if (!res.ok)
    throw new Error(
      res.status === 409
        ? "В облаке есть другая версия. Сначала скачай её или экспортируй локальный мир."
        : data.error || data.message || "Не удалось выполнить запрос.",
    );
  const next = res.headers.get("set-auth-token");
  if (native && next)
    await Preferences.set({ key: "pixelwild-session", value: next });
  return data;
}
export async function signOut() {
  await api("auth/sign-out", "POST", {});
  await Preferences.remove({ key: "pixelwild-session" });
}
