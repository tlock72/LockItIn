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
  if (fam.length > 1 && list.length >= fam.length) sent += await announceWin(g, date, list, nameOf, all);
  return { sent };
}

// "Tobey won the day!" (or "Mum and Jas drew!") to everyone, with the day's podium. Only once per result.
async function announceWin(g: { id: string; name: string }, date: string, list: ReturnType<typeof rank>, nameOf: (id: string) => string, all: Sub[]) {
  if (list.length < 2) return 0;
  const winners = list.filter((e) => e.rank === 1).map((e) => e.uid);
  if (!(await once(`win|${g.id}|${date}|${[...winners].sort().join(",")}`))) return 0;
  return await send(all, {
    title: winners.length > 1 ? `🤝 ${names(winners.map(nameOf))} drew ${g.name}!` : `🏆 ${names(winners.map(nameOf))} won ${g.name}!`,
    body: `${list.map((e) => `${MEDAL[e.rank] || "#" + e.rank} ${nameOf(e.uid)} ${fmt(e.s)}`).join(" · ")}`,
    tag: `win-${g.id}-${date}`,
    url: "./",
  });
}

// Run by a Supabase cron job every hour. Once a day is over (UK time), announce the winner of every game
// that 2+ people played, even if not everyone did. Days already announced are skipped.
const ukDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d);
async function endOfDay() {
  const now = Date.now(), dates = [ukDate(new Date(now - 864e5)), ukDate(new Date(now - 2 * 864e5))];
  const [games, people, day, subs] = await Promise.all([
    db.from("games").select("id, name, better"),
    db.from("players").select("id, name"),
    db.from("scores").select("player_id, game_id, play_date, score").in("play_date", dates),
    db.from("push_subs").select("endpoint, player_id, sub"),
  ]);
  const fam = people.data || [], all = (subs.data || []) as Sub[];
  const nameOf = (id: string) => fam.find((p) => p.id === id)?.name || "Someone";
  let sent = 0;
  for (const date of dates) for (const g of games.data || []) {
    const rows = ((day.data || []) as (Row & { game_id: string; play_date: string })[]).filter((r) => r.game_id === g.id && r.play_date === date);
    sent += await announceWin(g, date, rank(rows, g.better === "low"), nameOf, all);
  }
  return { sent };
}

// A chat message: tell everyone else. Whoever it replies to gets "Mum replied to you".
async function onMessage(me: string, id: string) {
  const { data: m } = await db.from("messages").select("id, game_id, play_date, player_id, body, reply_to").eq("id", id).maybeSingle();
  if (!m || m.player_id !== me || !(await once(`msg|${m.id}`))) return { sent: 0 };
  const [game, people, subs, target] = await Promise.all([
    db.from("games").select("name").eq("id", m.game_id).maybeSingle(),
    db.from("players").select("id, name"),
    db.from("push_subs").select("endpoint, player_id, sub"),
    m.reply_to && !String(m.reply_to).startsWith("score:")
      ? db.from("messages").select("player_id").eq("id", m.reply_to).maybeSingle()
      : Promise.resolve({ data: m.reply_to ? { player_id: String(m.reply_to).slice(6) } : null }),
  ]);
  const fam = people.data || [], all = ((subs.data || []) as Sub[]).filter((s) => s.player_id !== me);
  const nameOf = (pid: string) => fam.find((p) => p.id === pid)?.name || "Someone";
  const to = (target.data as { player_id?: string } | null)?.player_id;
  const body = m.body.length > 140 ? m.body.slice(0, 139) + "…" : m.body;
  const base = { body, tag: `chat-${m.game_id}-${m.play_date}`, url: `./?comment=${encodeURIComponent(`${m.game_id}|${m.play_date}|${m.id}`)}` };
  const gname = game.data?.name || "game";
  let sent = 0;
  if (to && to !== me) sent += await send(all.filter((s) => s.player_id === to), { ...base, title: `↩️ ${nameOf(me)} replied to you in ${gname}` });
  sent += await send(all.filter((s) => s.player_id !== to || to === me), { ...base, title: `💬 ${nameOf(me)} in the ${gname} chat` });
  return { sent };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // The hourly cron job proves itself with the secret kept in push_config.
    const cron = req.headers.get("x-cron-secret");
    if (cron) {
      const { data } = await db.from("push_config").select("cron_secret").eq("id", 1).maybeSingle();
      if (!data?.cron_secret || data.cron_secret !== cron) return json({ error: "Bad cron secret" }, 401);
      await vapid();
      return json(await endOfDay());
    }

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
    if (body.type === "message" && /^[0-9a-f-]{36}$/.test(String(body.id))) {
      return json(await onMessage(me as string, String(body.id)));
    }
    return json({ error: "Unknown request" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
