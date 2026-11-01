// 魚檔刀工王 排行榜 API — Netlify Functions + Netlify Blobs
// © 2026 HY Intelligence
import { getStore } from "@netlify/blobs";

const FISH = ["鯇魚","青花魚","鱸魚","三文魚","石斑","鯧魚","紅衫魚","黃花魚","油甘魚","金目鯛","劍旗魚","藍鰭吞拿"];
const MAX_PLAYERS = 1000;
const MIN_GAP_MS = 15000; // 同一個人最少隔 15 秒先可以再交分

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

async function pidOf(token) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(d)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const cleanNick = (n) => String(n || "").replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 14) || "無名刀手";
const publicView = (p) => ({ id: p.id, nick: p.nick, best: p.best, plays: p.plays });

export default async (req) => {
  const store = getStore({ name: "fish-knife-leaderboard", consistency: "strong" });
  const board = (await store.get("board", { type: "json" })) || { players: {} };

  if (req.method === "GET") {
    return json({ players: Object.values(board.players).map(publicView) });
  }

  if (req.method === "DELETE") {
    // 管理用：/api/scores?id=<玩家id>&key=<ADMIN_KEY>
    const url = new URL(req.url);
    const key = process.env.ADMIN_KEY;
    if (!key || url.searchParams.get("key") !== key) return json({ error: "forbidden" }, 403);
    delete board.players[url.searchParams.get("id")];
    await store.setJSON("board", board);
    return json({ ok: true });
  }

  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const token = String(body.token || "");
  if (token.length < 16 || token.length > 100) return json({ error: "bad token" }, 400);
  const id = await pidOf(token);
  const now = Date.now();
  let p = board.players[id];

  if (!p) {
    if (Object.keys(board.players).length >= MAX_PLAYERS) return json({ error: "board full" }, 507);
    p = { id, nick: "無名刀手", best: {}, plays: 0, t: 0 };
  }
  p.nick = cleanNick(body.nick);

  if (body.fish !== undefined) {
    const fish = String(body.fish), score = Math.round(Number(body.score));
    if (!FISH.includes(fish) || !Number.isFinite(score) || score < 0 || score > 1000) return json({ error: "bad score" }, 400);
    if (now - (p.t || 0) < MIN_GAP_MS) return json({ error: "too fast" }, 429);
    p.plays = (p.plays || 0) + 1;
    p.t = now;
    if (score > (p.best[fish] || 0)) p.best[fish] = score;
  }

  board.players[id] = p;
  await store.setJSON("board", board);
  return json({ ok: true, player: publicView(p) });
};

export const config = { path: "/api/scores" };
