import type { IncomingMessage, ServerResponse } from "node:http";
import { auth, configured, db } from "../server/auth.js";
import { saveSchema } from "../src/validation.js";
import { z } from "zod";
const upload = z.object({
  state: saveSchema,
  revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});
export default async function handler(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  const origin = req.headers.origin;
  const allowed = [process.env.BETTER_AUTH_URL, "https://localhost"];
  if (origin && allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
    res.setHeader("Access-Control-Expose-Headers", "set-auth-token");
  }
  const json = (status: number, data: unknown) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(data));
  };
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  const url = new URL(
    req.url || "/",
    process.env.BETTER_AUTH_URL || "https://localhost",
  );
  if (url.pathname === "/api/health") {
    json(200, {
      status: configured() ? "configured" : "offline-only",
      version: "0.1.0",
    });
    return;
  }
  if (!configured()) {
    json(503, {
      error: "Облачный сервер ещё не настроен. Можно играть офлайн.",
    });
    return;
  }
  if (origin && !allowed.includes(origin)) {
    json(403, { error: "Недопустимый источник запроса" });
    return;
  }
  if (
    ["POST", "PUT"].includes(req.method || "") &&
    !origin &&
    !req.headers.authorization
  ) {
    json(403, { error: "Требуется источник запроса" });
    return;
  }
  try {
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers))
      if (v) headers.set(k, Array.isArray(v) ? v.join(",") : v);
    let body: string | undefined;
    if (!["GET", "HEAD"].includes(req.method || "GET")) {
      if (req.body !== undefined)
        body =
          typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      else {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
          const b = Buffer.from(chunk);
          size += b.length;
          if (size > 500000) {
            json(413, { error: "Сохранение слишком большое" });
            return;
          }
          chunks.push(b);
        }
        body = Buffer.concat(chunks).toString();
      }
      if (Buffer.byteLength(body || "") > 500000) {
        json(413, { error: "Сохранение слишком большое" });
        return;
      }
    }
    if (url.pathname.startsWith("/api/auth/")) {
      const result = await auth().handler(
        new Request(url, { method: req.method, headers, body }),
      );
      res.statusCode = result.status;
      result.headers.forEach((v, k) => {
        if (k !== "set-cookie") res.setHeader(k, v);
      });
      const cookies = result.headers.getSetCookie();
      if (cookies.length) res.setHeader("set-cookie", cookies);
      res.end(await result.text());
      return;
    }
    if (url.pathname !== "/api/world") {
      json(404, { error: "Не найдено" });
      return;
    }
    const session = await auth().api.getSession({ headers });
    if (!session) {
      json(401, { error: "Сначала войди в аккаунт" });
      return;
    }
    if (req.method === "GET") {
      const { rows } = await db().query(
        "SELECT state, revision FROM worlds WHERE user_id=$1",
        [session.user.id],
      );
      json(200, rows[0] ?? { state: null, revision: 0 });
      return;
    }
    if (req.method !== "PUT") {
      res.setHeader("Allow", "GET, PUT");
      json(405, { error: "Метод не поддерживается" });
      return;
    }
    const parsed = upload.safeParse(JSON.parse(body || "{}"));
    if (!parsed.success) {
      json(400, { error: "Неподдерживаемый формат сохранения" });
      return;
    }
    const { state, revision } = parsed.data;
    const result =
      revision === 0
        ? await db().query(
            "INSERT INTO worlds(user_id,state,revision) VALUES($1,$2,1) ON CONFLICT(user_id) DO NOTHING RETURNING revision",
            [session.user.id, JSON.stringify(state)],
          )
        : await db().query(
            "UPDATE worlds SET state=$2,revision=revision+1,updated_at=now() WHERE user_id=$1 AND revision=$3 RETURNING revision",
            [session.user.id, JSON.stringify(state), revision],
          );
    if (!result.rows.length) {
      json(409, { error: "Конфликт версий" });
      return;
    }
    json(200, { revision: result.rows[0].revision });
  } catch (error) {
    if (error instanceof SyntaxError) {
      json(400, { error: "Неверный JSON" });
      return;
    }
    console.error("Request failed", {
      type: error instanceof Error ? error.name : "Unknown",
    });
    json(500, { error: "Сервер временно недоступен. Локальный мир сохранён." });
  }
}
