// LockItIn notifications (Supabase Edge Function "notify").
// The app calls this after someone locks in a score. It tells the rest of the family, and once
// everyone has played that game for the day it tells everyone who won.
// Set up: see "Notifications" in the README. No keys to copy: the notification keys are made
// the first time this runs and kept in the push_config table.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CONTACT = Deno.env.get("PUSH_CONTACT") || "https://github.com/tlock72/LockItIn";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };
const fmt = (n: unknown) => {
  const v = Math.round(Number(n) * 10) / 10;
  return isFinite(v) ? v.toLocaleString("en-GB") : "–";
};
const names = (list: string[]) => (list.length < 2 ? list.join("") : list.slice(0, -1).join(", ") + " and " + list[list.length - 1]);

type Sub = { endpoint: string; player_id: string; sub: { endpoint: string; keys: { p256dh: string; auth: string } } };
type Row = { player_id: string; score: number };

// Notification keys: made once, then reused.
let vapidReady: Promise<string> | null = null;
function vapid(): Promise<string> {
  vapidReady ??= (async () => {
    let { data } = await db.from("push_config").select("public_key, private_key").eq("id", 1).maybeSingle();
    if (!data) {
      const k = webpush.generateVAPIDKeys();
      await db.from("push_config").upsert({ id: 1, public_key: k.publicKey, private_key: k.privateKey }, { onConflict: "id", ignoreDuplicates: true });
      ({ data } = await db.from("push_config").select("public_key, private_key").eq("id", 1).single());
    }
    if (!data) throw new Error("Couldn't set up notification keys. Has supabase/schema.sql been run?");
    webpush.setVapidDetails(CONTACT, data.public_key, data.private_key);
    return data.public_key as string;
  })().catch((e) => { vapidReady = null; throw e; });
  return vapidReady;
}

// True the first time a key is seen, so each score and each day's winner is sent only once.
async function once(k: string) {
  const { error } = await db.from("push_log").insert({ k });
  return !error;
}

async function send(subs: Sub[], payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  const res = await Promise.allSettled(subs.map((s) => webpush.sendNotification(s.sub, body, { TTL: 60 * 60 * 12 })));
  const gone = subs.filter((_, i) => {
    const r = res[i];
    return r.status === "rejected" && [404, 410].includes((r.reason as { statusCode?: number })?.statusCode ?? 0);
  });
  if (gone.length) await db.from("push_subs").delete().in("endpoint", gone.map((s) => s.endpoint));
  return res.filter((r) => r.status === "fulfilled").length;
}

function rank(rows: Row[], low: boolean) {
  const arr = rows.map((r) => ({ uid: r.player_id, s: Number(r.score), rank: 0 })).sort((a, b) => (low ? a.s - b.s : b.s - a.s));
  let rk = 0, prev: number | null = null;
  arr.forEach((e, i) => { if (prev === null || e.s !== prev) { rk = i + 1; prev = e.s; } e.rank = rk; });
  return arr;
}

async function onScore(me: string, gameId: string, date: string) {
  const [row, game, people, day, subs] = await Promise.all([
    db.from("scores").select("score, comment").eq("player_id", me).eq("game_id", gameId).eq("play_date", date).maybeSingle(),
    db.from("games").select("id, name, better, max_score").eq("id", gameId).maybeSingle(),
    db.from("players").select("id, name"),
    db.from("scores").select("player_id, score").eq("game_id", gameId).eq("play_date", date),
    db.from("push_subs").select("endpoint, player_id, sub"),
  ]);
  if (!row.data || !game.data) return { sent: 0 };
  const g = game.data, fam = people.data || [], all = (subs.data || []) as Sub[];
  const nameOf = (id: string) => fam.find((p) => p.id === id)?.name || "Someone";
  const list = rank((day.data || []) as Row[], g.better === "low");
  let sent = 0;

  // 1. "Tobey locked in Krillion" / "520" to everyone else. With a comment: "Tobey locked in Krillion and left a comment",
  //    and tapping it opens the comment in the app.
  const comment = String(row.data.comment || "").trim();
  const ck = comment ? `|${comment.length}:${[...comment].reduce((h, c) => (h * 31 + c.codePointAt(0)!) >>> 0, 7)}` : "";
  if (await once(`score|${me}|${g.id}|${date}|${row.data.score}${ck}`)) {
    sent += await send(all.filter((s) => s.player_id !== me), comment
      ? {
        title: `💬 ${nameOf(me)} locked in ${g.name} and left a comment`,
        body: `${fmt(row.data.score)} · “${comment.length > 120 ? comment.slice(0, 119) + "…" : comment}”`,
        tag: `score-${g.id}-${date}-${me}`,
        url: `./?comment=${encodeURIComponent(`${g.id}|${date}|${me}`)}`,
      }
      : {
        title: `🔒 ${nameOf(me)} locked in ${g.name}`,
        body: fmt(row.data.score),
        tag: `score-${g.id}-${date}-${me}`,
        url: "./",
      });
  }

  // 2. Once everyone has played: "Tobey won the day!" to everyone, with the day's podium.
  if (fam.length > 1 && list.length >= fam.length) {
    const winners = list.filter((e) => e.rank === 1).map((e) => e.uid);
    if (await once(`win|${g.id}|${date}|${[...winners].sort().join(",")}`)) {
      sent += await send(all, {
        title: winners.length > 1 ? `🤝 ${names(winners.map(nameOf))} drew!` : `🏆 ${names(winners.map(nameOf))} won the day!`,
        body: `${g.name}: ${list.map((e) => `${MEDAL[e.rank] || "#" + e.rank} ${nameOf(e.uid)} ${fmt(e.s)}`).join(" · ")}`,
        tag: `win-${g.id}-${date}`,
        url: "./",
      });
    }
  }
  return { sent };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // Who's asking: the family member logged in on the calling device.
    const caller = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false },
    });
    const { data: me } = await caller.rpc("my_player_id");
    if (!me) return json({ error: "Pick who you are first" }, 401);

    const body = await req.json().catch(() => ({}));
    const publicKey = await vapid();
    if (body.type === "key") return json({ publicKey });
    if (body.type === "test") {
      const { data } = await db.from("push_subs").select("endpoint, player_id, sub").eq("player_id", me);
      return json({ sent: await send((data || []) as Sub[], { title: "LockItIn", body: "Notifications are on 🔔", tag: "test", url: "./" }) });
    }
    if (body.type === "score" && body.game_id && /^\d{4}-\d{2}-\d{2}$/.test(String(body.play_date))) {
      return json(await onScore(me as string, String(body.game_id), String(body.play_date)));
    }
    return json({ error: "Unknown request" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
