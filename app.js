/* LockItIn, family edition. Plain JS, no build step. */
(() => {
"use strict";

const cfg = window.LOCKITIN_CONFIG || {};
const COLORS = ["#FF5C8A", "#5B3DF5", "#12A16B", "#F29A1F", "#1FA2FF", "#D63DC8", "#00A99D", "#FF7A45", "#8B5E3C", "#E5484D"];
const KNOWN = ["krillion", "maptap", "timeguessr"];
const ICONS = {
  krillion: '<path d="M2 7c2-2.5 4-2.5 6 0s4 2.5 6 0 4-2.5 6 0"/><path d="M2 12c2-2.5 4-2.5 6 0s4 2.5 6 0 4-2.5 6 0"/><path d="M2 17c2-2.5 4-2.5 6 0s4 2.5 6 0 4-2.5 6 0"/>',
  maptap: '<path d="M12 21.5s7-6 7-11.5a7 7 0 0 0-14 0c0 5.5 7 11.5 7 11.5z"/><circle cx="12" cy="10" r="2.6"/>',
  timeguessr: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
};
const MEDAL = { 1: "🥇", 2: "🥈", 3: "🥉" };
// Christmas edition (xmas.css / xmas.js). Remove class="xmas" from <body> to switch it off.
const XMAS = document.body.classList.contains("xmas") && !!window.xmas;
const XMAS_COLORS = ["#C8102E", "#E3283E", "#1E8449", "#2FA866", "#FFD24A", "#E8A317", "#FFFFFF"];

let sb = null;
let me = null;                // {id, name, color, avatar_url, is_admin}
let games = [], allGames = [];
let players = {};             // id -> player
let scores = new Map();       // "player|game|date" -> row
let msgs = new Map();         // chat message id -> row (the last two weeks)
let pendingShare = null;
let pendingComment = null;    // "game|date|player" or "game|date|<message id>" from a tapped chat notification
let adminDirty = false;

// The app always opens on Today, and the leaderboards always open on All time.
// pm = what the podium ranks by ("wins" = days won, "avg" = average score).
// flipped = Today cards turned over to show today's result instead of the day's winner.
const st = { tab: "today", game: "all", period: "0", pm: "wins", sort: null, post: null, newColor: null, editColor: null, flipped: new Set(), flipAnim: null, winSeen: null };
try {
  st.game = localStorage.getItem("lii.board") || st.game;
  st.pm = localStorage.getItem("lii.boardPm") === "avg" ? "avg" : "wins";
} catch (e) {}

/* ---------- helpers ---------- */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const todayStr = () => ymd(new Date());
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
const nice = (d, opts) => new Date(d + "T12:00:00").toLocaleDateString(undefined, opts || { weekday: "long", month: "long", day: "numeric" });
const fmt = (n) => (n == null || isNaN(n) ? "–" : (Math.round(n * 10) / 10).toLocaleString());
const num = (s) => parseFloat(String(s).replace(/,/g, ""));
const save = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const errText = (e, fb) => (e && e.message && !/fetch|network|load failed/i.test(e.message) ? e.message : fb);
const key = (r) => `${r.player_id}|${r.game_id}|${r.play_date}`;
const gById = (id) => games.find((g) => g.id === id);
const gc = (id) => `var(--${KNOWN.includes(id) ? id : "other"})`;
const icon = (id) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[id] || '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z"/>'}</svg>`;
const safeColor = (c) => (/^#[0-9a-f]{6}$/i.test(c || "") ? c : "#5B3DF5");
const nameOf = (id) => players[id]?.name || "Someone";
const listNames = (ids) => { const n = ids.map(nameOf); return n.length < 2 ? n.join("") : n.slice(0, -1).join(", ") + " and " + n[n.length - 1]; };
const better = (g, a, b) => (g.better === "low" ? a < b : a > b);

// Family photos live in a private Supabase storage bucket. "storage:dad.jpg" means family/dad.jpg there.
const photoUrls = {};
const photoSrc = (u) => (!u ? "" : u.startsWith("storage:") ? photoUrls[u.slice(8)] || "" : /^https:\/\//.test(u) || /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(u) ? u : "");
async function resolvePhotos() {
  const want = new Set(["logo.jpg"]);
  for (const p of Object.values(players)) if (p.avatar_url && p.avatar_url.startsWith("storage:")) want.add(p.avatar_url.slice(8));
  const missing = [...want].filter((f) => !photoUrls[f]);
  if (missing.length) {
    try {
      const { data } = await sb.storage.from("family").createSignedUrls(missing, 60 * 60 * 24 * 7);
      for (const d of data || []) if (d.signedUrl && !d.error) photoUrls[d.path] = d.signedUrl;
    } catch (e) {}
  }
  if (photoUrls["logo.jpg"]) {
    document.documentElement.style.setProperty("--logo", `url("${photoUrls["logo.jpg"]}")`);
    document.body.classList.add("has-logo");
  }
}

function av(pid, size = "") {
  const p = players[pid] || (me && me.id === pid ? me : {}) || {};
  const ini = (p.name || "?").trim().split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const src = photoSrc(p.avatar_url);
  const img = src ? `<img src="${esc(src)}" alt="" loading="lazy" onerror="this.remove()">` : "";
  return `<span class="av ${size}" style="--c:${safeColor(p.color)}">${esc(ini)}${img}</span>`;
}
const person = (pid, size = "s") => `<span class="person">${av(pid, size)}<span class="nm">${esc(nameOf(pid))}</span></span>`;

function show(screen) {
  for (const id of ["screen-loading", "screen-setup", "screen-who", "main"]) $("#" + id).hidden = id !== screen;
}
let toastTimer, toastQ = [];
function toast(text, queue) {
  if (queue && !$("#toast").hidden) { if (toastQ.length < 4) toastQ.push(text); return; }
  const t = $("#toast"); t.textContent = text; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; if (toastQ.length) setTimeout(() => toast(toastQ.shift()), 200); }, 2800);
}

/* ---------- confetti ---------- */
function confetti(colors) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const c = $("#confetti"), ctx = c.getContext("2d"), dpr = window.devicePixelRatio || 1;
  c.width = innerWidth * dpr; c.height = innerHeight * dpr; ctx.scale(dpr, dpr);
  const pal = XMAS ? [...XMAS_COLORS, ...(colors || []).filter((x) => !/^#5B3DF5$/i.test(x))] : colors && colors.length ? colors : COLORS;
  const parts = Array.from({ length: 140 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 13, vy: -Math.random() * 13 - 4,
    w: 6 + Math.random() * 6, h: 8 + Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
    c: pal[Math.floor(Math.random() * pal.length)],
    k: XMAS ? ["rect", "flake", "star", "star"][Math.floor(Math.random() * 4)] : "rect",
  }));
  const start = performance.now();
  (function frame(t) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.38; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      if (p.k === "star") { window.xmas.star(ctx, p.x, p.y, p.w * 0.9, p.r, p.c, 1); continue; }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      if (p.k === "flake") window.xmas.flakeShape(ctx, p.w * 0.8, p.c === "#FFFFFF" ? "#BFD3EA" : p.c); else { ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); }
      ctx.restore();
    }
    if (t - start < 2200) requestAnimationFrame(frame); else ctx.clearRect(0, 0, innerWidth, innerHeight);
  })(start);
}

/* ---------- Krillion answer tiers ---------- */
// Krillion's share text is "Krillion #115 🦐", the score, then one emoji per answer.
// Worked out from a real result (415 = 2 Rare + 1 Plankton + 3 Deep Cut + 1 Schooler).
// Blanks and One in a Krillion are learned the first time they appear, from the score.
const KRILL_TIERS = [
  { k: "blank", label: "Blanks", pts: 0, icon: "▫️" },
  { k: "plankton", label: "Plankton", pts: 10, icon: "🫧" },
  { k: "schooler", label: "Schoolers", pts: 30, icon: "🐟" },
  { k: "rare", label: "Rare", pts: 60, icon: "🦑" },
  { k: "deepcut", label: "Deep cuts", pts: 85, icon: "🏮" },
  { k: "krillion", label: "One in a Krillion", pts: 100, icon: "🌟" },
];
const KRILL_BASE = { "🫧": "plankton", "🐟": "schooler", "🦑": "rare", "🏮": "deepcut" };
function krillMap() {
  const m = { ...KRILL_BASE };
  for (const r of scores.values()) if (r.game_id === "krillion" && r.details && r.details.map) Object.assign(m, r.details.map);
  return m;
}
function tierIcon(k) {
  const m = krillMap();
  return Object.keys(m).find((e) => m[e] === k) || KRILL_TIERS.find((t) => t.k === k).icon;
}
function graphemes(s) {
  try { return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s)].map((x) => x.segment); }
  catch (e) { return Array.from(s); }
}
function parseKrillion(text) {
  // Works whether the share keeps its line breaks or arrives squashed onto one line:
  // "Krillion #115 🦐 / 415 / 🦑🫧🏮🏮🦑🐟🏮". The score is the first number after the
  // header that isn't the puzzle number; the answer emojis are everything after it.
  const t = String(text || "").replace(/[  -​  　﻿]/g, " ");
  const hm = t.match(/krillion\s*(?:#\s*(\d+))?/i);
  const puzzle = hm && hm[1] ? hm[1] : null;
  const rest = hm ? t.slice(hm.index + hm[0].length) : t;
  const sm = rest.match(/(^|[^\d#,.])(\d{1,3}(?:,\d{3})+|\d+)(?![\d,.])\s*(?:pts|points)?/i);
  if (!sm) return null;
  const score = num(sm[2]);
  // Krillion has 7 questions: keep the first 7 answer emojis, and stop at a second
  // "Krillion #…" header in case the result was pasted twice.
  const after = rest.slice(sm.index + sm[0].length).split(/krillion/i)[0];
  const emo = graphemes(after).filter((g) => /\p{Extended_Pictographic}/u.test(g)).slice(0, 7);
  const map = krillMap(), tiers = Object.fromEntries(KRILL_TIERS.map((t) => [t.k, 0])), unknown = {};
  for (const e of emo) { if (map[e]) tiers[map[e]]++; else unknown[e] = (unknown[e] || 0) + 1; }
  const known = () => KRILL_TIERS.reduce((s, t) => s + tiers[t.k] * t.pts, 0);
  const learned = {}, uk = Object.keys(unknown), left = score - known();
  const unused = KRILL_TIERS.filter((t) => !Object.values(map).includes(t.k));
  if (uk.length === 1) {
    const t = unused.find((t) => t.pts * unknown[uk[0]] === left) || KRILL_TIERS.find((t) => t.pts * unknown[uk[0]] === left);
    if (t) { tiers[t.k] += unknown[uk[0]]; learned[uk[0]] = t.k; }
  } else if (uk.length === 2) {
    for (const [a, b] of [[uk[0], uk[1]], [uk[1], uk[0]]]) {
      const pair = unused.flatMap((ta) => unused.filter((tb) => tb !== ta).map((tb) => [ta, tb])).find(([ta, tb]) => ta.pts * unknown[a] + tb.pts * unknown[b] === left);
      if (pair) { tiers[pair[0].k] += unknown[a]; tiers[pair[1].k] += unknown[b]; learned[a] = pair[0].k; learned[b] = pair[1].k; break; }
    }
  }
  const counted = Object.values(tiers).reduce((s, n) => s + n, 0);
  return { score, puzzle: puzzle ? +puzzle : null, line: emo.join(""), tiers, map: learned, ok: counted === emo.length && known() === score && emo.length > 0 };
}
// MapTap share: "80👏 96🔥 49😟 80👏 91👑" then "Final score: 787". Each guess is out of 100.
function parseMapTap(text) {
  const t = String(text || "");
  const fm = t.match(/final\s*score\s*[:\-]?\s*([\d,]+)/i);
  if (!fm) return null;
  const before = t.slice(0, fm.index).replace(/https?:\/\/\S+|www\.\S+/gi, " ");
  const rounds = [...before.matchAll(/(?:^|[^\d,.])(\d{1,3})\s*(?=\p{Extended_Pictographic})/gu)].map((m) => +m[1]).filter((n) => n <= 100);
  return rounds.length ? { score: num(fm[1]), rounds } : null;
}
// TimeGuessr share: "TimeGuessr #1256 — 29,162/50,000" then a line per round:
// "1️⃣ 🏆7,816 · 📅 0y · 🌍 1105.8km"
function parseTimeGuessr(text) {
  const t = String(text || "");
  const sm = t.match(/([\d,]+)\s*\/\s*50,?000/);
  if (!sm) return null;
  const rounds = [];
  for (const line of t.split(/\r?\n/)) {
    const y = line.match(/📅\s*(\d+)\s*y/u), d = line.match(/🌍\s*([\d,.]+)\s*(km|m|mi)\b/iu);
    if (!y && !d) continue;
    const sc = line.match(/🏆\s*([\d,]+)/u);
    let km = d ? num(d[1]) : null;
    if (d && /^m$/i.test(d[2])) km /= 1000;
    if (d && /^mi$/i.test(d[2])) km *= 1.609344;
    rounds.push({ score: sc ? num(sc[1]) : null, years: y ? +y[1] : null, km: km != null ? Math.round(km * 10) / 10 : null });
  }
  return rounds.length ? { score: num(sm[1]), rounds } : null;
}
const avgOf = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const fmtKm = (k) => (k == null ? "–" : `${k >= 100 ? Math.round(k).toLocaleString() : (Math.round(k * 10) / 10).toLocaleString()} km`);
const fmtYrs = (y) => (y == null ? "–" : `${(Math.round(y * 10) / 10).toLocaleString()} yrs`);
// Per-round stats for one player's rows (MapTap guesses, TimeGuessr rounds)
function roundStats(gid, rows) {
  const out = { games: 0, n: 0 };
  if (gid === "maptap") {
    const g = rows.flatMap((r) => (r.details && r.details.rounds) || []).filter((x) => typeof x === "number");
    out.games = rows.filter((r) => r.details && r.details.rounds).length;
    Object.assign(out, { n: g.length, avg: avgOf(g), best: g.length ? Math.max(...g) : null });
  } else if (gid === "timeguessr") {
    const rs = rows.flatMap((r) => (r.details && r.details.rounds) || []);
    out.games = rows.filter((r) => r.details && r.details.rounds).length;
    const yrs = rs.map((x) => x.years).filter((x) => x != null), kms = rs.map((x) => x.km).filter((x) => x != null);
    Object.assign(out, { n: rs.length, yrs: avgOf(yrs), km: avgOf(kms), exact: yrs.filter((x) => x === 0).length });
  }
  return out;
}
// Older Krillion rows may hold a double-pasted line (more than 7 answers). Keep the first 7
// and recount the tiers; the 7 answers must add up to the score.
function tidyKrill(r) {
  const d = r && r.game_id === "krillion" && r.details;
  if (!d || !d.line) return r;
  const emo = graphemes(d.line).filter((g) => /\p{Extended_Pictographic}/u.test(g));
  if (emo.length <= 7) return r;
  const k = parseKrillion(`Krillion\n${r.score}\n${emo.slice(0, 7).join("")}`);
  return k ? { ...r, details: { ...d, line: k.line, tiers: k.tiers, ok: k.ok } } : r;
}
const tierLine = (tiers) => KRILL_TIERS.filter((t) => tiers && tiers[t.k]).map((t) => `${tierIcon(t.k)} ${t.label} ×${tiers[t.k]}`).join(" · ");

/* ---------- share-text parsing ---------- */
function parseShare(gameId, text) {
  const t = text || "";
  if (gameId === "krillion") { const k = parseKrillion(t); if (k) return k.score; }
  const specific = {
    maptap: [/final\s*score\s*[:\-]?\s*([\d,]+)/i],
    krillion: [/([\d,]+)\s*(?:pts|points)\b/i, /([\d,]+)\s*\/\s*700\b/, /score\s*[:\-]?\s*([\d,]+)/i, { re: /([\d,]+)\s*(?:m|meters|metres)\b/i, f: (v) => v / 10 }],
    timeguessr: [/([\d,]+)\s*\/\s*50,?000/, /total\s*(?:score)?\s*[:\-]?\s*([\d,]+)/i],
  }[gameId] || [];
  const generic = [/final\s*score\s*[:\-]?\s*([\d,.]+)/i, /score\s*[:\-]?\s*([\d,.]+)/i, /([\d,.]+)\s*(?:pts|points)\b/i, /([\d,.]+)\s*\/\s*[\d,]+/];
  for (const r of [...specific, ...generic]) {
    const m = t.match(r.re || r);
    if (m) { const v = num(m[1]); if (isFinite(v)) return r.f ? r.f(v) : v; }
  }
  return null;
}
function guessGame(text) {
  const t = (text || "").toLowerCase().replace(/\s+/g, "");
  return games.find((g) => t.includes(g.name.toLowerCase().replace(/\s+/g, "")) || (g.url && t.includes(g.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, ""))));
}

/* ---------- stats ---------- */
function rowsFor(gid, fromDate) {
  const out = [];
  for (const r of scores.values()) if (r.game_id === gid && (!fromDate || r.play_date >= fromDate)) out.push(r);
  return out;
}
function byDate(gid, fromDate) {
  const out = {};
  for (const r of rowsFor(gid, fromDate)) (out[r.play_date] = out[r.play_date] || []).push({ uid: r.player_id, s: Number(r.score), d: r.play_date });
  return out;
}
function rankDay(list, g) {
  const arr = list.slice().sort((a, b) => (g.better === "low" ? a.s - b.s : b.s - a.s));
  let rank = 0, prev = null;
  arr.forEach((e, i) => { if (prev === null || e.s !== prev) { rank = i + 1; prev = e.s; } e.rank = rank; });
  return arr;
}
function gameStreak(uid, gid) {
  const dates = new Set(rowsFor(gid).filter((r) => r.player_id === uid).map((r) => r.play_date));
  let n = 0, i = dates.has(todayStr()) ? 0 : 1;
  while (dates.has(daysAgo(i))) { n++; i++; }
  return n;
}
function anyStreak(uid) {
  const dates = new Set([...scores.values()].filter((r) => r.player_id === uid).map((r) => r.play_date));
  let n = 0, i = dates.has(todayStr()) ? 0 : 1;
  while (dates.has(daysAgo(i))) { n++; i++; }
  return n;
}
// A day's win is only decided once the day is over, or once everyone in the family has played that game.
// It still needs at least two players.
function decided(date, n) {
  const fam = Object.keys(players).length;
  return n > 1 && (date < todayStr() || n >= fam);
}
function gameTable(gid, days, everyone) {
  const g = gById(gid), from = days ? daysAgo(days - 1) : null, t = {};
  for (const [date, list] of Object.entries(byDate(gid, from))) {
    const multi = decided(date, list.length), ranked = rankDay(list, g), drew = ranked.filter((e) => e.rank === 1).length > 1;
    for (const e of ranked) {
      const r = (t[e.uid] = t[e.uid] || { uid: e.uid, played: 0, total: 0, best: null, bestDate: null, wins: 0, draws: 0 });
      r.played++; r.total += e.s;
      if (r.best == null || better(g, e.s, r.best)) { r.best = e.s; r.bestDate = date; }
      if (multi && e.rank === 1) drew ? r.draws++ : r.wins++;
    }
  }
  // everyone: include family members with no scores yet, so the board shows the whole family
  if (everyone) for (const uid of Object.keys(players)) t[uid] = t[uid] || { uid, played: 0, total: 0, best: null, bestDate: null, wins: 0, draws: 0 };
  return Object.values(t).map((r) => ({
    ...r, avg: r.played ? r.total / r.played : null, streak: r.played ? gameStreak(r.uid, gid) : 0,
    form: rowsFor(gid).filter((x) => x.player_id === r.uid).sort((a, b) => (a.play_date < b.play_date ? -1 : 1)).slice(-10).map((x) => Number(x.score)),
  }));
}
function sparkline(vals, g) {
  if (vals.length < 2) return '<span class="muted">–</span>';
  const W = 72, H = 22, lo = g.max_score ? 0 : Math.min(...vals), hi = g.max_score ? Number(g.max_score) : Math.max(...vals);
  const span = hi - lo || 1;
  const pts = vals.map((v, i) => [2 + (i * (W - 4)) / (vals.length - 1), H - 2 - ((g.better === "low" ? hi - v : v - lo) / span) * (H - 4)]);
  const last = pts[pts.length - 1];
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-label="Last ${vals.length} scores"><polyline points="${pts.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ")}" fill="none" stroke="${gc(g.id)}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3" fill="${gc(g.id)}"/></svg>`;
}

// One person's result on a ranked day: "win" (top score alone), "draw" (shared top score) or null. Needs 2+ players.
function outcome(ranked, uid) {
  const e = ranked.find((x) => x.uid === uid);
  if (!e || ranked.length < 2 || e.rank !== 1) return null;
  return ranked.filter((x) => x.rank === 1).length > 1 ? "draw" : "win";
}
const winsText = (w, d) => `${w} ${w === 1 ? "win" : "wins"}${d ? ` · ${d} ${d === 1 ? "draw" : "draws"}` : ""}`;
const drawsTag = (d) => (d ? ` <small class="drew">+${d} 🤝</small>` : "");

// A day's ranking for one game, and whether the day is settled (everyone has played, or the day is over).
function dayResult(g, date = todayStr()) {
  const list = rankDay(rowsFor(g.id, date).filter((r) => r.play_date === date).map((r) => ({ uid: r.player_id, s: Number(r.score) })), g);
  const done = decided(date, list.length);
  return { list, done, winners: done ? list.filter((e) => e.rank === 1).map((e) => e.uid) : [] };
}

// All games: one point for each game won outright each day (a win needs two players).
// A shared top score is a draw: counted separately, and it breaks ties.
function racePoints(from) {
  const pts = {}, days = {};
  for (const uid of Object.keys(players)) pts[uid] = { total: 0, by: {}, draws: 0 };
  for (const g of games) {
    for (const [date, list] of Object.entries(byDate(g.id, from))) {
      if (!decided(date, list.length)) continue;
      const win = rankDay(list, g).filter((e) => e.rank === 1);
      for (const e of win) {
        const p = (pts[e.uid] = pts[e.uid] || { total: 0, by: {}, draws: 0 });
        if (win.length > 1) { p.draws++; continue; }
        p.total++; p.by[g.id] = (p.by[g.id] || 0) + 1;
        ((days[date] = days[date] || [])).push({ uid: e.uid, gid: g.id, share: 1 });
      }
    }
  }
  return { pts, days };
}
const fmtPts = (n) => { const r = Math.round(n * 10) / 10; return r.toLocaleString(); };
const ptsWord = (n) => `${fmtPts(n)} ${Math.round(n * 10) === 10 ? "pt" : "pts"}`;

/* ---------- rendering ---------- */
function render() {
  if (!me || !games.length) return;
  if (!["today", "boards", "family"].includes(st.tab)) st.tab = "today";
  if (st.game !== "all" && !gById(st.game)) st.game = "all";
  if (!gById(st.post)) st.post = games[0].id;
  $$("[data-tab]").forEach((b) => (b.dataset.tab === st.tab && !b.classList.contains("me-btn") && !b.classList.contains("home") ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
  for (const t of ["today", "boards", "family"]) $("#tab-" + t).hidden = t !== st.tab;
  $("#meBtn").innerHTML = av(me.id, "m");
  renderToday(); renderBoards(); renderFamily();
}

function greeting() {
  const h = new Date().getHours();
  if (XMAS) return h < 5 ? "Up late like Santa" : h < 12 ? "Merry morning" : h < 17 ? "Jolly afternoon" : "Festive evening";
  return h < 5 ? "Up late" : h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
}
function yesterdayResults() {
  const y = daysAgo(1);
  return games.map((g) => ({ g, list: rankDay(rowsFor(g.id, y).filter((r) => r.play_date === y).map((r) => ({ uid: r.player_id, s: Number(r.score), d: r.details })), g) }));
}

// "Dad leads with 820" while people are still to play; "Dad wins with 820" once everyone has.
function leaderLine(list, done) {
  const top = list[0];
  if (!top) return "Nobody's in yet. Be first!";
  if (list.length < 2) return `<b>${esc(nameOf(top.uid))}</b> is first in with ${fmt(top.s)}`;
  const firsts = list.filter((e) => e.rank === 1).map((e) => e.uid);
  const who = `<b>${firsts.map((u) => esc(nameOf(u))).join(" &amp; ")}</b>`;
  const many = firsts.length > 1;
  if (many) return `🤝 ${who} ${done ? "draw" : "are level"} on ${fmt(top.s)}`;
  return `${done ? "🏆" : "👑"} ${who} ${done ? "wins" : "leads"} with ${fmt(top.s)}`;
}

// Today's leaderboard for one game: everyone who has played, in rank order, then whoever hasn't yet (faded, "–").
// The same board shows on both sides of a Today card, so it stays put when the day's winner is announced.
// Short cards show it as a row of chips; tall cards stand it on a podium (2nd, 1st, 3rd, 4th).
function dayBoard(g, list) {
  const played = new Set(list.map((e) => e.uid));
  const rest = Object.keys(players).filter((u) => !played.has(u));
  const n = list.length;
  const rows = list.map((e, i) => {
    const h = n > 1 ? 1 - ((e.rank - 1) / (n - 1)) * 0.7 : 1; // level steps for a draw
    return `<div role="listitem" class="dp p${i + 1}${e.rank === 1 && n > 1 ? " w" : ""}${e.uid === me.id ? " me" : ""}" title="${esc(nameOf(e.uid))}: ${fmt(e.s)}">
      <span class="dpm">${MEDAL[e.rank] || "#" + e.rank}</span>${av(e.uid, "s")}<span class="dpn">${esc(nameOf(e.uid))}</span><span class="dps">${fmt(e.s)}</span>
      <span class="dpstep" style="--h:${h.toFixed(2)}">${e.rank}</span></div>`;
  }).concat(rest.map((u, i) => `<div role="listitem" class="dp p${n + i + 1} none${u === me.id ? " me" : ""}" title="${esc(nameOf(u))}: not played yet">
      <span class="dpm">·</span>${av(u, "s")}<span class="dpn">${esc(nameOf(u))}</span><span class="dps">–</span>
      <span class="dpstep" style="--h:.12"></span></div>`));
  return `<div class="dpod" role="list" aria-label="Today's ${esc(g.name)} leaderboard: ${n} of ${n + rest.length} played">${rows.join("")}</div>`;
}

function renderToday() {
  const today = todayStr(), streak = anyStreak(me.id);
  $("#hello").textContent = `${greeting()}, ${me.name}!`;
  $("#helloSub").textContent = `${nice(today)} · ${streak ? `🔥 ${streak}-day streak` : "Post a score to start a streak"}`;
  const winners = [...new Set(yesterdayResults().flatMap((x) => x.list.filter((e) => e.rank === 1).map((e) => e.uid)))];
  $("#yTease").textContent = winners.length ? `${listNames(winners)} ${winners.length === 1 ? "took the crown" : "took the crowns"}. Tap to see.` : "Nobody played yesterday. Tap to see.";

  $("#cards").innerHTML = games.map((g) => {
    const { list, done, winners } = dayResult(g, today);
    const mine = list.find((e) => e.uid === me.id);
    const won = winners.length > 0;                 // the day is settled: show the winner first
    const showWin = won && !st.flipped.has(g.id);
    const link = g.url ? `<a class="play" href="${esc(g.url)}" target="_blank" rel="noopener">Play ↗</a>` : "";
    const flip = won
      ? `<button class="flip" type="button" data-flip="${esc(g.id)}" aria-label="${showWin ? "Show today's result" : "Show the day's winner"}">${showWin ? "Today's result" : "🏆 Winner"}<span class="fi" aria-hidden="true">↻</span></button>`
      : "";
    const nc = chatItems(g.id, today).length;
    const talk = `<button class="talk${nc ? "" : " none"}" type="button" data-comments="${esc(g.id)}" aria-label="Today's ${esc(g.name)} chat${nc ? `, ${nc} ${nc === 1 ? "message" : "messages"}` : ""}">💬${nc ? ` ${nc}` : ""}</button>`;
    const cls = `gcard${won ? " decided" : ""}${showWin ? " showwin" : ""}${st.flipAnim === g.id ? " flipping" : ""}`;
    if (showWin) {
      const top = list[0], many = winners.length > 1;
      const champ = many
        ? `<span class="champav crowned">${winners.slice(0, 3).map((u) => av(u, "l")).join("")}</span>`
        : `<span class="champav crowned">${av(winners[0], "l")}</span>`;
      return `<article class="${cls}" style="--gc:${gc(g.id)}">
        <div class="gtop"><h3>${icon(g.id)}${esc(g.name)}</h3><span class="gtop-r">${talk}${flip}</span></div>
        <div class="gwin">
          <div class="champ">${champ}<div class="ctext"><div class="cflag">${many ? "🤝 It's a draw" : "🏆 Won the day"}</div><div class="cname">${esc(listNames(winners))}</div><div class="cscore">${fmt(top.s)}${g.max_score ? `<span class="of"> / ${fmt(g.max_score)}</span>` : ""}</div></div></div>
          ${dayBoard(g, list)}
        </div>
      </article>`;
    }
    return `<article class="${cls}" style="--gc:${gc(g.id)}">
      <div class="gtop"><h3>${icon(g.id)}${esc(g.name)}</h3><span class="gtop-r">${talk}${link}${flip}</span></div>
      <div class="gbody">
        ${mine
          ? `<div class="mine"><span class="big">${fmt(mine.s)}</span>${g.max_score ? `<span class="of">/ ${fmt(g.max_score)}</span>` : ""}<span class="pill on">${outcome(list, me.id) === "draw" ? "🤝 =" : outcome(list, me.id) === "win" ? "👑 #" : "#"}${mine.rank} of ${list.length}</span></div>`
          : `<div class="notyet">Not played yet</div>`}
        ${(() => { const d = mine && scores.get(`${me.id}|${g.id}|${today}`)?.details; return d && d.line ? `<div class="emojiline" title="${esc(tierLine(d.tiers))}">${esc(graphemes(d.line).slice(0, 7).join(""))}</div>` : ""; })()}
        ${dayBoard(g, list)}
        <div class="leader${done ? " won" : ""}">${leaderLine(list, done)}</div>
        <button class="btn" type="button" data-post="${esc(g.id)}">${mine ? `<span class="lg">Update my score</span><span class="sm">Update</span>` : `<span class="lg">Lock in my score</span><span class="sm">Lock in 🔒</span>`}</button>
      </div>
    </article>`;
  }).join("");
  st.flipAnim = null;
}

function sortHead(k, label, active) {
  return `<th><button data-sort="${k}" ${active ? 'aria-sort="descending"' : ""}>${label}${active ? " ↓" : ""}</button></th>`;
}
// Podium for the top four: 2nd, 1st, 3rd, 4th from left to right.
// Each step follows the person's rank, so people who are level stand on steps of the same height.
function podiumHTML(rows, valOf) {
  if (!rows.length) return "";
  const top = rows.slice(0, 4);
  const slot = (r, place) => {
    if (!r) return `<div class="pod p${place} empty"><span class="nm muted">–</span><div class="step">${place}</div></div>`;
    const k = Math.min(r.rank || place, 4);
    return `<div class="pod p${k}"><span class="${k === 1 ? "crowned" : ""}">${av(r.uid, k === 1 ? "l" : "m")}</span><span class="nm">${esc(nameOf(r.uid))}</span><span class="val">${valOf(r)}</span><div class="step">${k}</div></div>`;
  };
  const order = top.length >= 4 ? [2, 1, 3, 4] : [2, 1, 3];
  return `<div class="podium-in n${order.length}">${order.map((p) => slot(top[p - 1], p)).join("")}</div>`;
}

function renderBoards() {
  const all = st.game === "all";
  $("#gamePicker").innerHTML = `<button class="gp" role="tab" style="--gc:var(--accent)" data-game="all" aria-selected="${all}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg><span>All games</span></button>`
    + games.map((x) => `<button class="gp" role="tab" style="--gc:${gc(x.id)}" data-game="${esc(x.id)}" aria-selected="${!all && x.id === st.game}">${icon(x.id)}<span>${esc(x.name)}</span></button>`).join("");
  $$("#period button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.p === st.period));
  $$("#podMetric button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.m === st.pm));
  $("#podMetric").hidden = all;
  $("#perGame").hidden = all; $("#allGames").hidden = !all;
  if (all) return renderAllGames();

  const g = gById(st.game), days = +st.period, low = g.better === "low";
  const pane = $("#tab-boards"); pane.style.setProperty("--gc", gc(g.id));
  const rows = gameTable(g.id, days, true);
  const sk = ["avg", "best", "total", "wins", "draws", "played", "streak"].includes(st.sort) ? st.sort : st.pm;
  const lowFirst = (k) => low && (k === "avg" || k === "best");
  const cmp = (k) => (a, b) => {
    const x = a[k], y = b[k];
    if (x == null || y == null) return (x == null) - (y == null);
    return lowFirst(k) ? x - y : y - x;
  };
  // Ties on days won go to more draws, then the better average; ties on anything else go to more days won.
  const second = sk === "wins" ? (a, b) => cmp("draws")(a, b) || cmp("avg")(a, b) : cmp("wins");
  rows.sort((a, b) => cmp(sk)(a, b) || second(a, b) || b.played - a.played);
  rows.forEach((r, i, a) => (r.rank = i && a[i - 1][sk] === r[sk] && (sk !== "wins" || a[i - 1].draws === r.draws) ? a[i - 1].rank : i + 1));
  const label = { avg: "average score", best: "best score", total: "total points", wins: "days won", draws: "draws", played: "games played", streak: "current streak" }[sk];
  $("#rankNote").textContent = `Ranked by ${label} · ${days ? `last ${days} days` : "all time"}`;

  const valOf = (r) => sk === "wins" ? `${r.wins} ${r.wins === 1 ? "day" : "days"}${drawsTag(r.draws)}`
    : sk === "draws" ? `🤝 ${r.draws}`
    : sk === "streak" ? (r.streak ? `🔥 ${r.streak}` : "–")
    : r[sk] == null ? "–" : fmt(r[sk]);
  $("#podium").innerHTML = rows.some((r) => r.played) ? podiumHTML(rows, valOf) : "";

  // running stats tiles
  const period = rowsFor(g.id, days ? daysAgo(days - 1) : null);
  let hi = null; for (const r of period) if (!hi || better(g, Number(r.score), Number(hi.score))) hi = r;
  const famAvg = period.length ? period.reduce((s, r) => s + Number(r.score), 0) / period.length : null;
  const mostWins = rows.slice().sort((a, b) => b.wins - a.wins || b.draws - a.draws)[0];
  const longest = rows.slice().sort((a, b) => b.streak - a.streak)[0];
  const tile = (v, l, s) => `<div class="tile"><span class="label">${l}</span><span class="v">${v}</span><span class="s">${s}</span></div>`;
  $("#tiles").innerHTML = period.length
    ? tile(hi ? fmt(hi.score) : "–", low ? "Lowest score" : "Top score", hi ? `${esc(nameOf(hi.player_id))} · ${nice(hi.play_date, { month: "short", day: "numeric" })}` : "")
      + tile(fmt(famAvg), "Family average", `${period.length} scores posted`)
      + tile(mostWins && mostWins.wins ? mostWins.wins : "–", "Most wins", mostWins && mostWins.wins ? esc(nameOf(mostWins.uid)) + (mostWins.draws ? ` · ${mostWins.draws} 🤝` : "") : "No wins yet")
      + tile(longest && longest.streak ? `🔥 ${longest.streak}` : "–", "Hot streak", longest && longest.streak ? `${esc(nameOf(longest.uid))} · days in a row` : "Nobody on a streak")
    : "";

  // table
  const head = `<tr><th>#</th><th>Player</th>${sortHead("avg", "Avg", sk === "avg")}${sortHead("best", "Best", sk === "best")}${low ? "" : sortHead("total", "Total", sk === "total")}${sortHead("wins", "Wins", sk === "wins")}${sortHead("draws", "🤝", sk === "draws")}${sortHead("played", "Played", sk === "played")}${sortHead("streak", "🔥", sk === "streak")}<th>Form</th></tr>`;
  $("#board").innerHTML = rows.some((r) => r.played)
    ? `<table><thead>${head}</thead><tbody>${rows.map((r) => `<tr class="${r.uid === me.id ? "me" : ""}">
        <td class="rank ${MEDAL[r.rank] ? "" : "plain"}">${MEDAL[r.rank] || r.rank}</td>
        <td class="pl">${person(r.uid)}</td>
        <td>${fmt(r.avg)}</td><td>${fmt(r.best)}</td>${low ? "" : `<td>${r.played ? fmt(r.total) : "–"}</td>`}<td>${r.wins}</td><td>${r.draws || "–"}</td><td>${r.played}</td><td>${r.streak || "–"}</td>
        <td class="spark">${sparkline(r.form, g)}</td></tr>`).join("")}</tbody></table>`
    : `<div class="empty"><b>No ${esc(g.name)} scores ${days ? `in the last ${days} days` : "yet"}</b>Play today's ${esc(g.name)} and lock in your score to get on the board.</div>`;
  $("#boardNote").textContent = `A day is won once everyone has played it or the day is over, and needs at least two players; sharing the top score is a draw (🤝). Form shows each person's last 10 ${g.name} scores. Tap a column to re-rank the table and podium.`;

  // Krillion: answer tiers (from pasted results)
  const kw = $("#krill"), kh = $("#krillH");
  kw.hidden = kh.hidden = !["krillion", "maptap", "timeguessr"].includes(g.id);
  if (g.id === "maptap" || g.id === "timeguessr") {
    const mt = g.id === "maptap", by = {};
    for (const r of period) if (r.details && r.details.rounds) (by[r.player_id] = by[r.player_id] || []).push(r);
    const st2 = Object.fromEntries(Object.keys(by).map((u) => [u, roundStats(g.id, by[u])]));
    const fam = roundStats(g.id, Object.values(by).flat());
    const ids = Object.keys(st2).sort((a, b) => mt ? st2[b].avg - st2[a].avg : (st2[a].km - st2[b].km) || (st2[a].yrs - st2[b].yrs));
    kh.textContent = mt ? "Per guess" : "How close?";
    const cols = mt
      ? [["Avg per guess", (x) => fmt(x.avg)], ["Best guess", (x) => fmt(x.best)], ["Guesses", (x) => x.n]]
      : [["Avg distance", (x) => fmtKm(x.km)], ["Avg years off", (x) => fmtYrs(x.yrs)], ["Spot-on years", (x) => x.exact], ["Rounds", (x) => x.n]];
    kw.innerHTML = ids.length
      ? `<table class="catches"><thead><tr><th></th><th>Player</th>${cols.map((c) => `<th>${c[0]}</th>`).join("")}</tr></thead><tbody>
        ${ids.map((u) => `<tr class="${u === me.id ? "me" : ""}"><td></td><td class="pl">${person(u)}</td>${cols.map((c) => `<td>${c[1](st2[u])}</td>`).join("")}</tr>`).join("")}
        <tr class="famrow"><td></td><td class="pl">Family</td>${cols.map((c) => `<td>${c[1](fam)}</td>`).join("")}</tr></tbody></table>`
      : `<div class="empty"><b>No round details yet</b>Paste your ${esc(g.name)} result when you lock in your score and we'll track ${mt ? "your average score per guess" : "your average distance and years off"}.</div>`;
  }
  if (g.id === "krillion") {
    const tally = {}, fam = Object.fromEntries(KRILL_TIERS.map((t) => [t.k, 0]));
    for (const r of period) {
      const t = r.details && r.details.tiers; if (!t) continue;
      const row = (tally[r.player_id] = tally[r.player_id] || { games: 0, ...Object.fromEntries(KRILL_TIERS.map((x) => [x.k, 0])) });
      row.games++;
      for (const x of KRILL_TIERS) { row[x.k] += t[x.k] || 0; fam[x.k] += t[x.k] || 0; }
    }
    const ids = Object.keys(tally).sort((a, b) => tally[b].krillion - tally[a].krillion || tally[b].deepcut - tally[a].deepcut || tally[b].rare - tally[a].rare);
    kh.textContent = "Krillion catches";
    kw.innerHTML = ids.length
      ? `<table class="catches"><thead><tr><th></th><th>Player</th>${KRILL_TIERS.map((t) => `<th title="${t.label} (${t.pts} pts)"><span class="ti">${tierIcon(t.k)}</span>${t.label}</th>`).join("")}<th>Games</th></tr></thead><tbody>
        ${ids.map((u) => `<tr class="${u === me.id ? "me" : ""}"><td></td><td class="pl">${person(u)}</td>${KRILL_TIERS.map((t) => `<td class="${tally[u][t.k] ? "" : "zero"}">${tally[u][t.k]}</td>`).join("")}<td>${tally[u].games}</td></tr>`).join("")}
        <tr class="famrow"><td></td><td class="pl">Family</td>${KRILL_TIERS.map((t) => `<td>${fam[t.k]}</td>`).join("")}<td>${ids.reduce((s, u) => s + tally[u].games, 0)}</td></tr></tbody></table>`
      : `<div class="empty"><b>No answer tiers yet</b>Paste your Krillion result when you lock in your score and we'll count your Plankton, Schoolers, Rares, Deep Cuts and One in a Krillions.</div>`;
  }

  // last 14 days
  const grid = $("#grid"), gh = $("#gridH");
  const bd = byDate(g.id, daysAgo(13)), dayList = [...Array(14)].map((_, i) => daysAgo(13 - i));
  const uids = [...new Set(Object.values(bd).flat().map((e) => e.uid))];
  gh.textContent = "Last 14 days";
  gh.hidden = grid.hidden = !uids.length;
  if (uids.length) {
    const ranked = Object.fromEntries(dayList.map((d) => [d, rankDay(bd[d] || [], g)]));
    const dl = (d) => { const x = new Date(d + "T12:00:00"); return x.toLocaleDateString(undefined, { weekday: "narrow" }) + "<br>" + x.getDate(); };
    grid.innerHTML = `<table class="grid"><thead><tr><th></th><th>Player</th>${dayList.map((d) => `<th class="day">${dl(d)}</th>`).join("")}</tr></thead><tbody>${uids.map((u) =>
      `<tr class="${u === me.id ? "me" : ""}"><td></td><td class="pl">${person(u)}</td>${dayList.map((d) => {
        const e = ranked[d].find((x) => x.uid === u);
        if (!e) return `<td class="cell">·</td>`;
        return `<td class="cell ${(decided(d, ranked[d].length) && outcome(ranked[d], u)) || ""}">${fmt(e.s)}</td>`;
      }).join("")}</tr>`).join("")}</tbody></table>`;
  }
}

/* ---------- All games: days won across every game ---------- */
function raceOrder(pts) {
  return Object.keys(pts).sort((a, b) => pts[b].total - pts[a].total || (pts[b].draws || 0) - (pts[a].draws || 0) || nameOf(a).localeCompare(nameOf(b)));
}
function renderAllGames() {
  const days = +st.period, from = days ? daysAgo(days - 1) : null;
  const { pts } = racePoints(from);
  const order = raceOrder(pts);
  const rows = order.map((uid) => ({ uid, wins: pts[uid].total, draws: pts[uid].draws }));
  rows.forEach((r, i, a) => (r.rank = i && a[i - 1].wins === r.wins && a[i - 1].draws === r.draws ? a[i - 1].rank : i + 1));
  const any = rows.some((r) => r.wins > 0 || r.draws > 0);
  $("#tab-boards").style.setProperty("--gc", "var(--accent)");
  $("#rankNote").textContent = `Ranked by days won, one for each game won each day; draws 🤝 break ties · ${days ? `last ${days} days` : "all time"}`;
  $("#podium").innerHTML = any ? podiumHTML(rows, (r) => `${r.wins} ${r.wins === 1 ? "day" : "days"}${drawsTag(r.draws)}`) : "";

  const avail = games.reduce((n, g) => n + Object.entries(byDate(g.id, from)).filter(([d, l]) => decided(d, l.length)).length, 0);
  const won = rows.reduce((n, r) => n + r.wins, 0), drawn = avail - won;

  const totals = Object.fromEntries(games.map((g) => [g.id, order.reduce((n, u) => n + (pts[u].by[g.id] || 0), 0)]));
  $("#allTable").innerHTML = any
    ? `<table class="alltable"><thead><tr><th>#</th><th>Player</th><th>Won</th><th>🤝 Drew</th>${games.map((g) => `<th style="color:${gc(g.id)}">${esc(g.name)}</th>`).join("")}</tr></thead><tbody>
      ${rows.map((r) => `<tr class="${r.uid === me.id ? "me" : ""}"><td class="rank ${MEDAL[r.rank] ? "" : "plain"}">${MEDAL[r.rank] || r.rank}</td><td class="pl">${person(r.uid)}</td><td class="tot">${fmtPts(r.wins)}</td><td>${r.draws || "–"}</td>${games.map((g) => `<td>${pts[r.uid].by[g.id] ? fmtPts(pts[r.uid].by[g.id]) : "–"}</td>`).join("")}</tr>`).join("")}
      <tr class="famrow"><td></td><td class="pl">Family</td><td class="tot">${fmtPts(won)}</td><td>${drawn || "–"}</td>${games.map((g) => `<td>${fmtPts(totals[g.id])}</td>`).join("")}</tr></tbody></table>`
    : `<div class="empty"><b>No wins ${days ? `in the last ${days} days` : "yet"}</b>Win a game on a day when at least two of you play to get on the board.</div>`;
}
function renderFamily() {
  $("#meAvatar").innerHTML = av(me.id, "xl");
  $("#meName").textContent = me.name;
  $("#switchBtn").textContent = `Not ${me.name}? Switch person`;
  if (!$("details.edit").open) {
    $("#editName").value = me.name; $("#editPic").value = me.avatar_url || ""; st.editColor = me.color; showPicPreview();
    renderSwatches("#editColors", st.editColor);
  }
  const list = Object.values(players); // family order: Dad, Mum, Tobey, Jas
  $("#familyList").innerHTML = list.map((p) => {
    const mine = games.map((g) => gameTable(g.id, 0).find((r) => r.uid === p.id) || { wins: 0, draws: 0 });
    const wins = mine.reduce((s, r) => s + r.wins, 0), draws = mine.reduce((s, r) => s + r.draws, 0);
    const played = [...scores.values()].filter((r) => r.player_id === p.id).length;
    return `<div class="fam">${av(p.id, "m")}<div style="min-width:0"><div class="nm">${esc(p.name)}${p.id === me.id ? " (you)" : ""}</div><small>${played} scores · ${winsText(wins, draws)}${p.is_admin ? " · admin" : ""}</small></div></div>`;
  }).join("");

  $("#adminPanel").hidden = !me.is_admin;
  if (me.is_admin && !adminDirty) {
    $("#gameRows").innerHTML = allGames.filter((x) => x.active).map(gameRow).join("");
    $("#peopleRows").innerHTML = list.map((p) => `<div class="prow" data-pid="${p.id}">${av(p.id, "m")}<b>${esc(p.name)}</b>
      <div class="ctrls"><input data-k="pic" inputmode="url" placeholder="${p.avatar_url && p.avatar_url.startsWith("data:") ? "Photo chosen in the app" : "Profile picture link"}" value="${esc(p.avatar_url && p.avatar_url.startsWith("data:") ? "" : p.avatar_url || "")}" aria-label="Profile picture link for ${esc(p.name)}">
      <label class="row" style="gap:6px"><input type="checkbox" data-k="admin" ${p.is_admin ? "checked" : ""} ${p.id === me.id ? "disabled" : ""} style="width:auto"> Admin</label>
      <button class="btn small" type="button" data-saveperson>Save</button></div></div>`).join("");
  }
}
let rowSeq = 0;
function gameRow(g) {
  const i = rowSeq++;
  return `<div class="grow" data-id="${esc(g.id || "")}">
    <div class="field"><label class="label" for="gn${i}">Name</label><input id="gn${i}" data-k="name" value="${esc(g.name)}"></div>
    <div class="field"><label class="label" for="gm${i}">Max score</label><input id="gm${i}" data-k="max" inputmode="numeric" value="${g.max_score ?? ""}"></div>
    <div class="field full"><label class="label" for="gu${i}">Link</label><input id="gu${i}" data-k="url" inputmode="url" value="${esc(g.url || "")}" placeholder="https://"></div>
    <div class="field"><label class="label" for="gb${i}">Winner</label><select id="gb${i}" data-k="better"><option value="high" ${g.better !== "low" ? "selected" : ""}>Higher score</option><option value="low" ${g.better === "low" ? "selected" : ""}>Lower score</option></select></div>
    <div class="field" style="align-content:end"><button class="btn danger small" type="button" data-rm>Remove</button></div>
  </div>`;
}
function renderSwatches(sel, current) {
  $(sel).innerHTML = COLORS.map((c) => `<button type="button" class="swatch" role="radio" aria-label="Color ${c}" aria-checked="${c === current}" data-color="${c}" style="background:${c}"></button>`).join("");
}

/* ---------- sheets ---------- */
let lastFocus = null;
/* ---------- profile photo: pick, place, shrink ---------- */
const crop = { img: null, zoom: 1, x: 0, y: 0, base: 1, box: 300 };
function showPicPreview() {
  const v = $("#editPic").value, src = photoSrc(v);
  const p = me || {}, ini = (p.name || "?").trim().split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  $("#picPreview").innerHTML = `<span class="av l" style="--c:${safeColor(p.color)}">${esc(ini)}${src ? `<img src="${esc(src)}" alt="">` : ""}</span>`;
  $("#picRemove").hidden = !v;
}
function openCrop(file) {
  const msg = $("#cropMsg"); msg.textContent = ""; msg.className = "msg";
  const use = $("#cropUse"); use.disabled = false; use.classList.remove("busy", "done"); use.textContent = "Use photo";
  if (!/^image\//.test(file.type || "image/")) { toast("That isn't a photo."); return; }
  const url = URL.createObjectURL(file), img = new Image();
  img.onload = () => {
    crop.img = img; crop.zoom = 1; crop.x = 0; crop.y = 0;
    const el = $("#cropImg"); el.src = url;
    openSheet("#cropSheet");
    requestAnimationFrame(() => { crop.box = $("#crop").clientWidth || 300; crop.base = crop.box / Math.min(img.naturalWidth, img.naturalHeight); $("#cropZoom").value = 1; drawCrop(); });
  };
  img.onerror = () => { URL.revokeObjectURL(url); toast("Couldn't open that photo. Try another one."); };
  img.src = url;
}
function clampCrop() {
  const k = crop.base * crop.zoom, w = crop.img.naturalWidth * k, h = crop.img.naturalHeight * k;
  const mx = Math.max(0, (w - crop.box) / 2), my = Math.max(0, (h - crop.box) / 2);
  crop.x = Math.min(mx, Math.max(-mx, crop.x)); crop.y = Math.min(my, Math.max(-my, crop.y));
}
function drawCrop() {
  if (!crop.img) return;
  clampCrop();
  const k = crop.base * crop.zoom, w = crop.img.naturalWidth * k, h = crop.img.naturalHeight * k;
  const left = crop.box / 2 + crop.x - w / 2, top = crop.box / 2 + crop.y - h / 2;
  const el = $("#cropImg");
  el.style.width = crop.img.naturalWidth + "px"; el.style.height = crop.img.naturalHeight + "px";
  el.style.transform = `translate(${left}px, ${top}px) scale(${k})`;
}
function setZoom(z) {
  const old = crop.zoom; crop.zoom = Math.min(4, Math.max(1, z));
  crop.x *= crop.zoom / old; crop.y *= crop.zoom / old; // zoom around the middle
  $("#cropZoom").value = crop.zoom; drawCrop();
}
function wireCrop() {
  const box = $("#crop"), pts = new Map(); let pinch = null;
  box.addEventListener("pointerdown", (e) => { box.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: crop.zoom }; } });
  box.addEventListener("pointermove", (e) => {
    const p = pts.get(e.pointerId); if (!p || !crop.img) return;
    if (pts.size === 1) { crop.x += e.clientX - p.x; crop.y += e.clientY - p.y; }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()]; setZoom(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / (pinch.d || 1)); }
    else drawCrop();
  });
  const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
  box.addEventListener("pointerup", up); box.addEventListener("pointercancel", up);
  box.addEventListener("wheel", (e) => { if (!crop.img) return; e.preventDefault(); setZoom(crop.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); }, { passive: false });
}
// Square JPEG, small enough to keep in the players table (about 20-40 KB).
function cropToDataUrl(size = 320) {
  const k = crop.base * crop.zoom, w = crop.img.naturalWidth * k, h = crop.img.naturalHeight * k;
  const sx = (w / 2 - crop.box / 2 - crop.x) / k, sy = (h / 2 - crop.box / 2 - crop.y) / k, sw = crop.box / k;
  const c = document.createElement("canvas"); c.width = c.height = size;
  const ctx = c.getContext("2d"); ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size, size);
  ctx.drawImage(crop.img, sx, sy, sw, sw, 0, 0, size, size);
  return c.toDataURL("image/jpeg", 0.85);
}
function openSheet(id) { lastFocus = document.activeElement; $(id).hidden = false; document.body.style.overflow = "hidden"; }
function closeSheets() { $$(".sheet-wrap").forEach((s) => (s.hidden = true)); document.body.style.overflow = ""; if (lastFocus) lastFocus.focus?.(); }

function openPost(gid, text) {
  st.post = gid || st.post || games[0].id;
  st.krill = st.rounds = null;
  $("#paste").value = text || ""; $("#score").value = "";
  st.commentFor = null; $("#msg").textContent = ""; $("#msg").className = "msg";
  $("#date").value = todayStr(); $("#date").max = todayStr();
  renderPostGame();
  fillComment();
  openSheet("#postSheet");
  if (text) onPasteText(text); else {
    const existing = scores.get(`${me.id}|${st.post}|${todayStr()}`);
    if (existing) $("#score").value = existing.score;
  }
}
// The comment box shows what you already said about this game and day, so you can change or clear it.
function fillComment() {
  const k = `${me.id}|${st.post}|${$("#date").value || todayStr()}`;
  if (st.commentFor === k) return;
  st.commentFor = k;
  $("#comment").value = scores.get(k)?.comment || "";
  commentLeft();
}
function commentLeft() {
  const n = 280 - $("#comment").value.length;
  $("#commentLeft").textContent = n < 60 ? `${n} left` : "";
}
function renderPostGame() {
  const g = gById(st.post);
  $("#postSheet .sheet").style.setProperty("--gc", gc(g.id));
  $("#postTitle").textContent = `Lock in your ${g.name} score`;
  $("#postChips").innerHTML = games.map((x) => `<button class="chip" type="button" style="--gc:${gc(x.id)}" data-g="${esc(x.id)}" aria-pressed="${x.id === g.id}">${esc(x.name)}</button>`).join("");
}
/* ---------- day chat ---------- */
// Each game has a running chat for each day: score comments (from Lock in) plus chat messages, oldest first.
// Item ids: a message's own id, or "score:<player id>" for a score comment. Replies point at either.
function chatItems(gid, date) {
  const out = [];
  for (const r of rowsFor(gid, date)) if (r.play_date === date && r.comment)
    out.push({ id: `score:${r.player_id}`, uid: r.player_id, body: r.comment, at: r.comment_at || r.created_at || "", score: Number(r.score) });
  for (const m of msgs.values()) if (m.game_id === gid && m.play_date === date)
    out.push({ id: m.id, uid: m.player_id, body: m.body, at: m.created_at || "", reply: m.reply_to, msg: true });
  return out.sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0));
}
const timeOf = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); };
function chatItem(id) {
  if (!id) return null;
  if (id.startsWith("score:")) {
    const r = st.chat && scores.get(`${id.slice(6)}|${st.chat.gid}|${st.chat.date}`);
    return r && r.comment ? { id, uid: r.player_id, body: r.comment } : null;
  }
  const m = msgs.get(id);
  return m ? { id, uid: m.player_id, body: m.body } : null;
}
// focus: a message id, "score:<player>" or just a player id (older notifications) to highlight.
function openComments(gid, date, focus) {
  const g = gById(gid); if (!g) return;
  const fresh = !st.chat || st.chat.gid !== gid || st.chat.date !== date || $("#cSheet").hidden;
  st.chat = { gid, date, focus: focus ? (msgs.has(focus) || focus.startsWith("score:") ? focus : `score:${focus}`) : null, reply: fresh ? null : st.chat.reply };
  $("#cSheet .sheet").style.setProperty("--gc", gc(g.id));
  $("#cTitle").textContent = `${g.name} chat`;
  $("#cDate").textContent = date === todayStr() ? `Today · ${nice(date, { month: "long", day: "numeric" })}` : nice(date);
  renderChat();
  if ($("#cSheet").hidden) openSheet("#cSheet");
  if (fresh) $("#chatText").value = "";
  chatGrow();
  const f = $("#cBody .bub.focus");
  setTimeout(() => (f ? f.scrollIntoView({ block: "center", behavior: "smooth" }) : chatBottom()), 60);
}
function chatBottom() { const sh = $("#cSheet .sheet"); sh.scrollTop = sh.scrollHeight; }
function renderChat() {
  const { gid, date, focus, reply } = st.chat, g = gById(gid);
  const items = chatItems(gid, date);
  const ranked = rankDay(rowsFor(gid, date).filter((r) => r.play_date === date).map((r) => ({ uid: r.player_id, s: Number(r.score) })), g);
  let prev = null;
  $("#cBody").innerHTML = items.length ? items.map((e) => {
    const mine = e.uid === me.id, cont = prev && prev.uid === e.uid && !e.score; prev = e;
    const q = chatItem(e.reply);
    const quote = e.reply ? `<div class="quote"><b>${q ? esc(q.uid === me.id ? "You" : nameOf(q.uid)) : ""}</b> ${q ? esc(q.body.length > 70 ? q.body.slice(0, 69) + "…" : q.body) : "<i>Deleted message</i>"}</div>` : "";
    const rk = e.score != null ? ranked.find((x) => x.uid === e.uid) : null;
    const tagS = e.score != null ? `<span class="stag">🔒 ${fmt(e.score)}${rk && ranked.length > 1 ? ` · ${MEDAL[rk.rank] || "#" + rk.rank}` : ""}</span>` : "";
    return `<div class="bub${mine ? " me" : ""}${cont ? " cont" : ""}${e.id === focus ? " focus" : ""}" data-mid="${esc(e.id)}">
      ${mine ? "" : `<span class="bav">${cont ? "" : av(e.uid, "s")}</span>`}
      <div class="bwrap">
        ${cont || mine ? "" : `<div class="bname">${esc(nameOf(e.uid))}</div>`}
        <div class="bb">${quote}${tagS}<p>${esc(e.body)}</p></div>
        <div class="bmeta"><span>${esc(timeOf(e.at))}</span><button type="button" class="blink" data-reply="${esc(e.id)}">Reply</button>${mine && e.msg ? `<button type="button" class="blink" data-delmsg="${esc(e.id)}">Delete</button>` : ""}</div>
      </div>
    </div>`;
  }).join("") : `<div class="yempty">No chat on ${esc(g.name)} yet. Say something! 🦗</div>`;
  const r = chatItem(reply);
  $("#replyBar").hidden = !r;
  if (r) $("#replyTo").innerHTML = `Replying to <b>${esc(r.uid === me.id ? "yourself" : nameOf(r.uid))}</b>: ${esc(r.body.length > 60 ? r.body.slice(0, 59) + "…" : r.body)}`;
}
function chatGrow() { const t = $("#chatText"); t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 120) + "px"; $("#chatSend").disabled = !t.value.trim(); }
async function sendChat() {
  const t = $("#chatText"), body = t.value.trim();
  if (!body || !st.chat) return;
  const { gid, date, reply } = st.chat;
  $("#chatSend").disabled = true;
  const { data, error } = await sb.from("messages").insert({ game_id: gid, play_date: date, player_id: me.id, body: body.slice(0, 500), reply_to: reply || null }).select().single();
  if (error) { $("#chatSend").disabled = false; toast(errText(error, "Couldn't send that. Check your connection.")); return; }
  msgs.set(data.id, data);
  t.value = ""; st.chat.reply = null; st.chat.focus = null; chatGrow();
  renderChat(); renderToday(); chatBottom();
  callNotify({ type: "message", id: data.id }).catch(() => {});
}
async function deleteChat(id) {
  if (!confirm("Delete this message?")) return;
  const { error } = await sb.from("messages").delete().eq("id", id);
  if (error) { toast(errText(error, "Couldn't delete that.")); return; }
  msgs.delete(id); renderChat(); renderToday();
}
// A chat message arrived from someone else.
function announceMsg(m) {
  const g = gById(m.game_id); if (!g) return;
  const open = st.chat && !$("#cSheet").hidden && st.chat.gid === m.game_id && st.chat.date === m.play_date;
  if (open) { renderChat(); const sh = $("#cSheet .sheet"); if (sh.scrollHeight - sh.scrollTop - sh.clientHeight < 200) chatBottom(); }
  const tgt = m.reply_to ? (m.reply_to.startsWith("score:") ? m.reply_to.slice(6) : msgs.get(m.reply_to)?.player_id) : null;
  const head = tgt === me.id ? `↩️ ${nameOf(m.player_id)} replied to you` : `💬 ${nameOf(m.player_id)} in the ${g.name} chat`;
  const body = m.body.length > 120 ? m.body.slice(0, 119) + "…" : m.body;
  if (!open) toast(`${head}: “${clip(m.body, 60)}”`, true);
  localNotify(head, body, `chat-${g.id}-${m.play_date}`, `./?comment=${encodeURIComponent(`${g.id}|${m.play_date}|${m.id}`)}`);
}
// "krillion|2026-11-08|<player id or message id>" from a chat notification.
function openCommentLink(v) {
  const [gid, date, focus] = String(v || "").split("|");
  if (!gid || !/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return;
  if (!me || !games.length) { pendingComment = v; return; }
  if ($("#cSheet").hidden || !st.chat || st.chat.gid !== gid) closeSheets();
  if (st.tab !== "today") { st.tab = "today"; render(); }
  openComments(gid, date, focus);
}
function openYesterday() {
  const y = daysAgo(1), res = yesterdayResults();
  $("#yDate").textContent = nice(y);
  $("#yBody").innerHTML = res.map(({ g, list }) => {
    const win = list.filter((e) => e.rank === 1), rest = list.filter((e) => e.rank !== 1);
    const body = !list.length
      ? `<div class="yempty">Nobody played ${esc(g.name)}. 🦗</div>`
      : `<div class="ywin">${win.map((e) => av(e.uid, "l")).join("")}<div><div class="who-n">${esc(listNames(win.map((e) => e.uid)))}${win.length > 1 && list.length > 1 ? " 🤝 drew" : ""}</div><div class="sc">${fmt(win[0].s)}${g.max_score ? ` <span class="muted" style="font-size:15px">/ ${fmt(g.max_score)}</span>` : ""}</div>${win[0].d && win[0].d.line ? `<div class="emojiline">${esc(graphemes(win[0].d.line).slice(0, 7).join(""))}</div>` : ""}${list.length === 1 ? `<div class="note">Only player. Still counts in our hearts.</div>` : ""}</div></div>
         ${rest.length ? `<div class="yrest">${rest.map((e) => `<span>${MEDAL[e.rank] || "#" + e.rank} ${esc(nameOf(e.uid))} · ${fmt(e.s)}</span>`).join("")}</div>` : ""}`;
    return `<div class="ygame" style="--gc:${gc(g.id)}"><div class="ygame-h"><span>${esc(g.name)}</span><span>${list.length} played</span></div>${body}</div>`;
  }).join("");
  openSheet("#ySheet");
  const winnerColors = res.flatMap((x) => x.list.filter((e) => e.rank === 1).map((e) => safeColor(players[e.uid]?.color)));
  if (winnerColors.length) setTimeout(() => confetti(["#F2B21B", "#FFD95A", ...winnerColors]), 150);
}

/* ---------- notifications ---------- */
// In the app: a toast whenever someone else locks in a score, and when someone wins the day.
// On phones and computers: real notifications through the "notify" Supabase Edge Function (see README).
const push = { ok: "serviceWorker" in navigator && "PushManager" in window && "Notification" in window, on: false };
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const installed = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const b64u = (s) => { const b = atob((s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
const quiet = (p) => Promise.resolve(p).catch(() => {});
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("timeout")), ms))]);
const swReady = () => withTimeout(navigator.serviceWorker.ready, 6000);
async function currentSub() { try { return push.ok ? await (await swReady()).pushManager.getSubscription() : null; } catch (e) { return null; } }

async function callNotify(body) {
  const { data, error } = await sb.functions.invoke("notify", { body });
  if (error) throw error;
  return data || {};
}
// After saving a score: ask the server to tell everyone (and announce a winner once everyone has played).
function tellFamily(row) { callNotify({ type: "score", game_id: row.game_id, play_date: row.play_date }).catch(() => {}); }

// Phone/computer notification while LockItIn is open in the background but push isn't set up.
async function localNotify(title, body, tag, url) {
  if (push.on || document.visibilityState === "visible" || !push.ok || Notification.permission !== "granted") return;
  try { (await swReady()).showNotification(title, { body, tag, icon: "icons/icon-192.png", data: { url: url || "./" } }); } catch (e) {}
}
const clip = (c, n) => (c.length > n ? c.slice(0, n - 1) + "…" : c);
function announceScore(r, updated, onlyComment) {
  const g = gById(r.game_id); if (!g) return;
  const c = String(r.comment || "").trim(), tag = `score-${g.id}-${r.play_date}-${r.player_id}`;
  const link = `./?comment=${encodeURIComponent(`${g.id}|${r.play_date}|${r.player_id}`)}`;
  if (onlyComment) {
    toast(`💬 ${nameOf(r.player_id)} on ${g.name}: “${clip(c, 60)}”`, true);
    localNotify(`💬 ${nameOf(r.player_id)} left a comment on ${g.name}`, `${fmt(r.score)} · “${clip(c, 120)}”`, tag, link);
    return;
  }
  const when = r.play_date === todayStr() ? "" : ` (${nice(r.play_date, { month: "short", day: "numeric" })})`;
  const { list } = dayResult(g, r.play_date), e = list.find((x) => x.uid === r.player_id);
  const place = e && list.length > 1 ? ` · ${e.rank === 1 ? "👑 top" : "#" + e.rank} of ${list.length}` : "";
  const text = `${nameOf(r.player_id)} ${updated ? "updated" : "locked in"} ${g.name}${when}: ${fmt(r.score)}${place}`;
  toast(`🔒 ${text}${c ? ` 💬 “${clip(c, 40)}”` : ""}`, true);
  const verb = `${nameOf(r.player_id)} ${updated ? "updated" : "locked in"} ${g.name}`;
  if (c) localNotify(`💬 ${verb} and left a comment`, `${fmt(r.score)} · “${clip(c, 120)}”`, tag, link);
  else localNotify(`🔒 ${verb}`, fmt(r.score), tag);
}
// Called whenever scores change. The first call only remembers the current winners, so opening the app is quiet.
function checkWins() {
  const first = !st.winSeen; st.winSeen = st.winSeen || {};
  for (const g of games) {
    const { list, winners } = dayResult(g);
    const k = winners.length ? `${todayStr()}|${winners.slice().sort().join(",")}` : "";
    if (first || !k || st.winSeen[g.id] === k) { st.winSeen[g.id] = k; continue; }
    st.winSeen[g.id] = k;
    st.flipped.delete(g.id); // show the winner side
    const youWon = winners.includes(me.id);
    toast(youWon ? `🏆 You won today's ${g.name}! Take a bow.` : `🏆 ${listNames(winners)} won today's ${g.name}!`, true);
    localNotify(winners.length > 1 ? `🤝 ${listNames(winners)} drew!` : `🏆 ${listNames(winners)} won the day!`, `${g.name}: ${list.map((e) => `${MEDAL[e.rank] || "#" + e.rank} ${nameOf(e.uid)} ${fmt(e.s)}`).join(" · ")}`, `win-${g.id}`);
    confetti(["#F2B21B", "#FFD95A", ...winners.map((u) => safeColor(players[u]?.color))]);
    if (navigator.vibrate) navigator.vibrate([30, 60, 30]);
  }
}

async function renderNotif() {
  const on = $("#notifOn"), off = $("#notifOff"), test = $("#notifTest"), note = $("#notifNote");
  const sub = await currentSub();
  push.on = !!sub && Notification.permission === "granted";
  on.hidden = push.on; off.hidden = test.hidden = !push.on;
  if (!push.ok) {
    on.hidden = true;
    note.textContent = isIOS && !installed()
      ? "To get notifications on iPhone, add LockItIn to your Home Screen (Share, then Add to Home Screen), open it from there, and come back here."
      : "This browser can't show notifications. You'll still see a pop-up in the app when someone locks in a score or wins the day.";
  } else if (Notification.permission === "denied") {
    on.hidden = true;
    note.textContent = "Notifications are blocked for LockItIn. Allow them in this device's settings, then come back here.";
  } else {
    note.textContent = push.on
      ? "On for this device 🔔 You'll get a buzz when anyone locks in a score, and when someone wins the day."
      : "Get a buzz when anyone locks in a score, and when someone wins the day.";
  }
}
async function notifEnable() {
  const m = $("#notifMsg"), btn = $("#notifOn"); m.className = "msg"; m.textContent = "";
  btn.disabled = true; btn.textContent = "Turning on…";
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") throw new Error("Notifications weren't allowed. You can allow them in this device's settings.");
    const { publicKey } = await callNotify({ type: "key" }).catch(() => { throw new Error("Notifications aren't switched on in Supabase yet. Ask an admin (see the README)."); });
    const reg = await swReady();
    let sub = await reg.pushManager.getSubscription();
    if (sub && sub.options && sub.options.applicationServerKey) {
      const cur = btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      if (cur !== publicKey) { await sub.unsubscribe(); sub = null; }
    }
    sub = sub || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(publicKey) });
    const { error } = await sb.rpc("save_push", { p_sub: sub.toJSON() });
    if (error) throw error;
    m.className = "msg ok"; m.textContent = "✓ Notifications on";
    toast("Notifications on 🔔");
  } catch (e) {
    m.className = "msg err"; m.textContent = errText(e, "Couldn't turn notifications on. Try again.");
  }
  btn.disabled = false; btn.textContent = "Turn on notifications";
  renderNotif();
}
async function notifDisable() {
  const sub = await currentSub();
  if (sub) { await quiet(sb.rpc("drop_push", { p_endpoint: sub.endpoint })); await sub.unsubscribe().catch(() => {}); }
  $("#notifMsg").className = "msg"; $("#notifMsg").textContent = "Notifications off for this device.";
  renderNotif();
}
// Keep this device's notifications pointing at whoever is logged in on it.
async function syncPush() {
  const sub = await currentSub();
  if (sub && Notification.permission === "granted") await quiet(sb.rpc("save_push", { p_sub: sub.toJSON() }));
  renderNotif();
}

/* ---------- data ---------- */
async function fetchAll(table, cols) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(cols).range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}
async function loadPlayers() {
  const { data, error } = await sb.from("players").select("id,name,color,avatar_url,is_admin,created_at").order("created_at");
  if (error) throw error;
  players = Object.fromEntries(data.map((p) => [p.id, p]));
  if (me && players[me.id]) me = { ...me, ...players[me.id] };
  await resolvePhotos();
}
async function loadAll() {
  const [g] = await Promise.all([
    sb.from("games").select("*").order("sort").then((r) => { if (r.error) throw r.error; return r.data; }),
    loadPlayers(),
    sb.from("messages").select("*").gte("play_date", daysAgo(14)).order("created_at").then((r) => { if (!r.error) msgs = new Map(r.data.map((m) => [m.id, m])); }),
    fetchAll("scores", "player_id,game_id,play_date,score,details,comment,comment_at,created_at").then((s) => { scores = new Map(s.map((r) => [key(r), tidyKrill(r)])); }),
  ]);
  allGames = g; games = g.filter((x) => x.active);
  render(); checkWins(); render();
}
let subscribed = false;
function subscribe() {
  if (subscribed) return; subscribed = true;
  sb.channel("lockitin-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "scores" }, (p) => {
      if (p.eventType === "DELETE") { if (p.old && p.old.player_id) scores.delete(key(p.old)); else return loadAll(); }
      else {
        const prev = scores.get(key(p.new));
        scores.set(key(p.new), tidyKrill(p.new));
        if (me && p.new.player_id !== me.id) {
          const newC = String(p.new.comment || "").trim(), oldC = String(prev?.comment || "").trim();
          if (!prev || Number(prev.score) !== Number(p.new.score)) announceScore(p.new, !!prev);
          else if (newC && newC !== oldC) announceScore(p.new, true, true);
        }
      }
      checkWins(); render();
      if (st.chat && !$("#cSheet").hidden) renderChat();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "players" }, () => loadPlayers().then(render).catch(() => {}))
    .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (p) => {
      if (p.eventType === "DELETE") { if (p.old && p.old.id) msgs.delete(p.old.id); }
      else { const had = msgs.has(p.new.id); msgs.set(p.new.id, p.new); if (!had && me && p.new.player_id !== me.id) announceMsg(p.new); }
      if (st.chat && !$("#cSheet").hidden) renderChat();
      renderToday();
    })
    .subscribe();
}
async function refreshMe() {
  const { data, error } = await sb.rpc("whoami");
  if (error) throw error;
  me = (data && data[0]) || null;
}

/* ---------- who's playing ---------- */
async function showWho(message) {
  show("screen-who");
  try { await loadPlayers(); } catch (e) { players = {}; }
  const list = Object.values(players);
  $("#whoGrid").innerHTML = list.map((p) => `<button class="who" type="button" data-claim="${p.id}">${av(p.id, "xl")}<span>${esc(p.name)}</span></button>`).join("");
  $("#newTitle").textContent = list.length ? "Not on the list? Add yourself" : "You're first! Add yourself";
  $("#newForm").open = !list.length;
  const used = new Set(list.map((p) => p.color));
  st.newColor = st.newColor || COLORS.find((c) => !used.has(c)) || COLORS[0];
  renderSwatches("#newColors", st.newColor);
  $("#whoMsg").className = "msg" + (message ? " err" : ""); $("#whoMsg").textContent = message || "";
}
async function enterMain(welcome) {
  show("main");
  try { await loadAll(); } catch (e) { toast("Can't reach the scoreboard right now."); }
  subscribe();
  syncPush();
  if (welcome) { toast(welcome); confetti([safeColor(me.color), "#F2B21B"]); }
  if (pendingShare) { const g = guessGame(pendingShare); openPost(g ? g.id : null, pendingShare); pendingShare = null; }
  if (pendingComment) { const v = pendingComment; pendingComment = null; openCommentLink(v); }
}

/* ---------- actions ---------- */
function prefill() {
  const v = parseShare(st.post, $("#paste").value), msg = $("#msg");
  msg.className = "msg";
  st.krill = st.post === "krillion" ? parseKrillion($("#paste").value) : null;
  if (st.krill && !st.krill.line) st.krill = null;
  st.rounds = st.post === "maptap" ? parseMapTap($("#paste").value) : st.post === "timeguessr" ? parseTimeGuessr($("#paste").value) : null;
  const rx = st.rounds && roundStats(st.post, [{ details: st.rounds }]);
  if (v != null) {
    $("#score").value = v;
    msg.textContent = st.krill
      ? `Found it: ${fmt(v)}. ${tierLine(st.krill.tiers)}${st.krill.ok ? "" : " (some answers I couldn't place)"}`
      : rx && rx.n ? `Found it: ${fmt(v)}. ${st.post === "maptap" ? `Avg ${fmt(rx.avg)} per guess` : `Avg ${fmtKm(rx.km)} away, ${fmtYrs(rx.yrs)} off`}`
      : `Found it: ${fmt(v)}`;
  }
  else if ($("#paste").value.trim()) msg.textContent = "Couldn't spot a score in that. Type it in below.";
  else msg.textContent = "";
}
function onPasteText(text) {
  $("#paste").value = text;
  const hit = guessGame(text);
  if (hit && hit.id !== st.post) { st.post = hit.id; renderPostGame(); fillComment(); }
  prefill();
}
async function saveScore() {
  const msg = $("#msg"); msg.className = "msg";
  const g = gById(st.post), v = num($("#score").value), date = $("#date").value || todayStr();
  const fail = (t) => { msg.className = "msg err"; msg.textContent = t; };
  if (!isFinite(v) || v < 0) return fail("Type your score as a number, like 528.");
  if (g.max_score && v > g.max_score) return fail(`${g.name} only goes up to ${fmt(g.max_score)}. Check the number?`);
  if (date > todayStr()) return fail("That date hasn't happened yet!");
  const mineBefore = rowsFor(g.id).filter((r) => r.player_id === me.id && r.play_date !== date).map((r) => Number(r.score));
  const pb = mineBefore.length && mineBefore.every((s) => better(g, v, s));
  const comment = $("#comment").value.trim().slice(0, 280) || null;
  const old = scores.get(`${me.id}|${g.id}|${date}`);
  const comment_at = !comment ? null : old && old.comment === comment ? old.comment_at || null : new Date().toISOString();
  const row = { player_id: me.id, game_id: g.id, play_date: date, score: v, details: null, comment, comment_at };
  if ((g.id === "maptap" || g.id === "timeguessr") && st.rounds && st.rounds.score === v) row.details = { rounds: st.rounds.rounds };
  if (g.id === "krillion" && st.krill && st.krill.score === v) {
    const { tiers, line, puzzle, map, ok } = st.krill;
    row.details = { tiers, line, puzzle, map, ok };
  }
  $("#save").disabled = true;
  const { error } = await sb.from("scores").upsert(row, { onConflict: "player_id,game_id,play_date" });
  $("#save").disabled = false;
  if (error) return fail(errText(error, "Couldn't save. Check your connection and try again."));
  scores.set(key(row), row);
  tellFamily(row);
  const dayList = rankDay(rowsFor(g.id).filter((r) => r.play_date === date).map((r) => ({ uid: r.player_id, s: Number(r.score) })), g);
  const mine = dayList.find((e) => e.uid === me.id);
  const leading = mine && mine.rank === 1 && dayList.length > 1;
  closeSheets();
  if (comment && !pb && !leading) toast(`${g.name} locked in: ${fmt(v)} 🔒 · 💬 comment posted`); else
  toast(XMAS
    ? (pb ? `Ho Ho Ho! New personal best in ${g.name}! 🎁` : leading ? `Ho Ho Ho! You're top of the family in ${g.name}! 🎅` : `Ho Ho Ho! ${g.name} locked in: ${fmt(v)} 🎁`)
    : (pb ? `New personal best in ${g.name}! 🎉` : leading ? `You're top of the family in ${g.name}! 👑` : `${g.name} locked in: ${fmt(v)} 🔒`));
  if (XMAS) setTimeout(window.xmas.sleigh, 600);
  confetti(pb || leading ? ["#F2B21B", "#FFD95A", safeColor(me.color)] : [safeColor(me.color), "#FFFFFF", "#5B3DF5"]);
  if (navigator.vibrate) navigator.vibrate(pb || leading ? [20, 40, 20] : 15);
  checkWins(); render();
}

/* ---------- events ---------- */
function wire() {
  document.addEventListener("click", async (e) => {
    const t = e.target;
    const claim = t.closest("[data-claim]");
    if (claim) {
      claim.disabled = true;
      const { error } = await sb.rpc("claim_player", { p_player: claim.dataset.claim });
      if (error) { claim.disabled = false; $("#whoMsg").className = "msg err"; $("#whoMsg").textContent = errText(error, "Couldn't log in. Try again."); return; }
      await refreshMe(); enterMain(`Welcome back, ${me.name}! 👋`); return;
    }
    const sw = t.closest(".swatch");
    if (sw) {
      const group = sw.parentElement.id;
      if (group === "newColors") { st.newColor = sw.dataset.color; renderSwatches("#newColors", st.newColor); }
      else { st.editColor = sw.dataset.color; renderSwatches("#editColors", st.editColor); }
      return;
    }
    const nav = t.closest("[data-tab]");
    if (nav) {
      // Leaving Today turns every card back to the winner side; the logo always goes home to Today.
      // Tapping the tab you're already on just glides back to the top (no re-render, no flash).
      const sc = $("#scroller");
      if (nav.dataset.tab === st.tab) { sc.scrollTo({ top: 0, behavior: "smooth" }); return; }
      st.flipped.clear();
      st.tab = nav.dataset.tab; sc.scrollTop = 0; render(); return;
    }
    const fl = t.closest("[data-flip]");
    if (fl) {
      const id = fl.dataset.flip;
      if (st.flipped.has(id)) st.flipped.delete(id); else st.flipped.add(id);
      st.flipAnim = id; renderToday();
      const again = $(`[data-flip="${CSS.escape(id)}"]`); if (again) again.focus({ preventScroll: true });
      return;
    }
    const post = t.closest("[data-post]");
    if (post) { openPost(post.dataset.post); return; }
    const chip = t.closest(".chip");
    if (chip) { st.post = chip.dataset.g; renderPostGame(); fillComment(); prefill(); return; }
    const talk = t.closest("[data-comments]");
    if (talk) { openComments(talk.dataset.comments, todayStr()); return; }
    const rp = t.closest("[data-reply]");
    if (rp) { st.chat.reply = rp.dataset.reply; renderChat(); $("#chatText").focus(); return; }
    const dm = t.closest("[data-delmsg]");
    if (dm) { deleteChat(dm.dataset.delmsg); return; }
    if (t.closest("#replyX")) { st.chat.reply = null; renderChat(); return; }
    if (t.closest("[data-close]") || t.classList.contains("sheet-wrap")) { closeSheets(); return; }
    const gp = t.closest("[data-game]");
    if (gp) { st.game = gp.dataset.game; st.sort = null; save("lii.board", st.game); renderBoards(); return; }
    const per = t.closest("#period button");
    if (per) { st.period = per.dataset.p; renderBoards(); return; }
    const pm = t.closest("#podMetric button");
    if (pm) { st.pm = pm.dataset.m; st.sort = null; save("lii.boardPm", st.pm); renderBoards(); return; }
    const so = t.closest("[data-sort]");
    if (so) { st.sort = so.dataset.sort; renderBoards(); return; }
    const rm = t.closest("[data-rm]");
    if (rm) { rm.closest(".grow").remove(); adminDirty = true; return; }
    const sp = t.closest("[data-saveperson]");
    if (sp) {
      const row = sp.closest(".prow");
      const cur = players[row.dataset.pid]?.avatar_url || "", typed = row.querySelector('[data-k="pic"]').value;
      const { error } = await sb.rpc("admin_update_player", { p_player: row.dataset.pid, p_avatar_url: typed || (cur.startsWith("data:") ? cur : ""), p_admin: row.querySelector('[data-k="admin"]').checked });
      adminMsg(error ? errText(error, "Couldn't save that.") : "Saved.", !!error);
      if (!error) { await loadPlayers(); render(); }
    }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheets(); });

  $("#newForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("#newName").value.trim(), m = $("#whoMsg");
    if (!name) { m.className = "msg err"; m.textContent = "Type your name first."; return; }
    m.className = "msg"; m.textContent = "Adding you…";
    const { error } = await sb.rpc("join_family", { p_name: name, p_color: st.newColor });
    if (error) { m.className = "msg err"; m.textContent = errText(error, "Couldn't add you. Try again."); return; }
    await refreshMe(); enterMain(`Welcome to the family, ${me.name}! 🎉`);
  });
  $("#yesterdayBtn").onclick = openYesterday;
  $("#notifOn").onclick = notifEnable;
  $("#notifOff").onclick = notifDisable;
  $("#notifTest").onclick = async () => {
    const m = $("#notifMsg"); m.className = "msg"; m.textContent = "Sending…";
    try { const r = await callNotify({ type: "test" }); m.className = "msg ok"; m.textContent = r.sent ? "✓ Sent. It should pop up in a moment." : "Nothing was sent. Try turning notifications off and on again."; }
    catch (e) { m.className = "msg err"; m.textContent = "Couldn't reach the notification service."; }
  };
  $("#paste").addEventListener("input", () => onPasteText($("#paste").value));
  $("#comment").addEventListener("input", commentLeft);
  $("#chatText").addEventListener("input", chatGrow);
  $("#chatText").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing && !matchMedia("(pointer:coarse)").matches) { e.preventDefault(); sendChat(); } });
  $("#chatForm").addEventListener("submit", (e) => { e.preventDefault(); sendChat(); });
  $("#date").addEventListener("change", fillComment);
  $("#pasteBtn").onclick = async () => {
    try { const txt = await navigator.clipboard.readText(); if (txt) onPasteText(txt); }
    catch (e) { $("#paste").focus(); $("#msg").className = "msg"; $("#msg").textContent = "Long-press the box and choose Paste."; }
  };
  $("#save").onclick = saveScore;
  $("#score").addEventListener("keydown", (e) => { if (e.key === "Enter") saveScore(); });
  $("#switchBtn").onclick = async () => {
    const sub = await currentSub();
    if (sub) await quiet(sb.rpc("drop_push", { p_endpoint: sub.endpoint }));
    await sb.rpc("leave_device");
    me = null; showWho();
  };
  // The LockItIn wordmark hops letter by letter when you hover or tap it.
  $$(".brand").forEach((b) => {
    const w = b.querySelector(".word"); if (!w) return;
    const hop = () => { if (w.classList.contains("jump")) return; w.classList.add("jump"); setTimeout(() => w.classList.remove("jump"), 1050); };
    b.addEventListener("pointerenter", hop); b.addEventListener("pointerdown", hop);
  });
  $("#picFile").addEventListener("change", (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) openCrop(f); });
  $("#picRemove").onclick = () => { const was = $("#editPic").value; $("#editPic").value = ""; showPicPreview(); saveMe({ toastText: "Photo removed.", photo: true, undo: was }); };
  $("#cropZoom").addEventListener("input", (e) => { if (crop.img) setZoom(+e.target.value); });
  $("#cropUse").onclick = async () => {
    if (!crop.img) return;
    const was = $("#editPic").value;
    $("#editPic").value = cropToDataUrl(); showPicPreview();
    // Stay on the sheet with "Saving…" until the photo is really stored, so it's clear it worked.
    const ok = await saveMe({ btn: $("#cropUse"), msg: $("#cropMsg"), toastText: "Photo saved! The whole family can see it now ✨", photo: true, undo: was });
    if (ok) closeSheets();
  };
  wireCrop();
  $("#saveMe").onclick = () => saveMe({ btn: $("#saveMe"), toastText: "Saved! Looking good ✨" });
  let savedTimer;
  async function saveMe({ btn, msg, toastText, photo, undo } = {}) {
    const m = msg || $("#meMsg"), label = btn && btn.textContent;
    m.className = "msg"; m.textContent = "";
    if (btn) { btn.disabled = true; btn.classList.add("busy"); btn.textContent = "Saving…"; }
    const { error } = await sb.rpc("update_me", { p_name: $("#editName").value, p_color: st.editColor || me.color, p_avatar_url: $("#editPic").value });
    if (error) {
      if (undo !== undefined) { $("#editPic").value = undo; showPicPreview(); }
      if (btn) { btn.disabled = false; btn.classList.remove("busy"); btn.textContent = label; }
      m.className = "msg err"; m.textContent = errText(error, "Couldn't save. Check your connection and try again.");
      return false;
    }
    await refreshMe(); await loadPlayers(); render();
    if (btn) { btn.disabled = false; btn.classList.remove("busy"); btn.classList.add("done"); btn.textContent = "Saved ✓"; }
    $("#meMsg").className = "msg ok"; $("#meMsg").textContent = photo ? "✓ Photo saved" : "✓ Saved";
    $("#picPreview").classList.toggle("saved", !!photo);
    const big = $("#meAvatar"); big.classList.remove("saved"); void big.offsetWidth; big.classList.add("saved");
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => { big.classList.remove("saved"); $("#picPreview").classList.remove("saved"); if (btn) { btn.classList.remove("done"); btn.textContent = label; } }, 3500);
    toast(toastText);
    if (photo && $("#editPic").value) confetti([safeColor(me.color), "#FFFFFF", "#F2B21B"]);
    if (navigator.vibrate) navigator.vibrate(15);
    return true;
  }

  const adminMsg = (t, err) => { $("#adminMsg").textContent = t; $("#adminMsg").className = "msg" + (err ? " err" : ""); };
  $("#gameRows").addEventListener("input", () => (adminDirty = true));
  $("#addGame").onclick = () => { $("#gameRows").insertAdjacentHTML("beforeend", gameRow({ name: "", url: "", better: "high", max_score: null })); adminDirty = true; $("#gameRows").lastElementChild.querySelector("input").focus(); };
  $("#saveGames").onclick = async () => {
    const rows = $$("#gameRows .grow").map((r, i) => {
      const v = (k) => r.querySelector(`[data-k="${k}"]`).value.trim();
      const name = v("name"), mx = num(v("max"));
      const id = r.dataset.id || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      return { id, name, url: /^https?:\/\//.test(v("url")) ? v("url") : null, better: v("better"), max_score: isFinite(mx) && mx > 0 ? mx : null, sort: i + 1, active: true };
    }).filter((x) => x.name && x.id);
    if (!rows.length) return adminMsg("Keep at least one game.", true);
    if (new Set(rows.map((x) => x.id)).size !== rows.length) return adminMsg("Two games have the same name. Rename one.", true);
    const ids = new Set(rows.map((x) => x.id));
    const retired = allGames.filter((x) => x.active && !ids.has(x.id)).map((x) => ({ ...x, active: false }));
    const { error } = await sb.from("games").upsert([...rows, ...retired]);
    if (error) return adminMsg(errText(error, "Couldn't save games."), true);
    adminDirty = false; adminMsg("Games saved."); loadAll();
  };

  wirePull();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && me && !$("#main").hidden) loadAll().catch(() => {}); });
}

/* ---------- pull to refresh ---------- */
// Drag down at the top of any tab: the padlock unlocks and the three game dots charge up;
// let go past the line and it snaps shut, the dots orbit while scores reload, then burst.
function wirePull() {
  const sc = $("#scroller"), ptr = $("#ptr"), label = $("#ptrLabel");
  const PULL = XMAS ? "Pull for a Ho Ho Ho" : "Pull to refresh";
  label.textContent = PULL;
  const LINE = 80, HOLD = 84, MAX = 140;
  let y0 = 0, x0 = 0, d = 0, mode = "", busy = false, raf = 0;
  const paint = () => {
    raf = 0;
    const p = Math.min(1, d / LINE);
    sc.style.transform = d ? `translate3d(0,${d}px,0)` : "";
    ptr.style.setProperty("--d", d + "px"); ptr.style.setProperty("--p", p.toFixed(3));
    if (busy) return; // while refreshing, the lock's own animation owns the classes and label
    ptr.classList.toggle("c1", p > 0.3); ptr.classList.toggle("c2", p > 0.6); ptr.classList.toggle("c3", p >= 1);
    const ready = p >= 1;
    if (ready !== ptr.classList.contains("ready")) { ptr.classList.toggle("ready", ready); label.textContent = ready ? (XMAS ? "Let go… Ho Ho Ho! 🎅" : "Let go to lock it in 🔒") : PULL; }
  };
  const set = (v) => { d = v; if (!raf) raf = requestAnimationFrame(paint); };
  const spring = (to) => {
    sc.classList.add("springing"); ptr.classList.add("springing"); set(to);
    setTimeout(() => { sc.classList.remove("springing"); ptr.classList.remove("springing"); }, 450);
  };
  const reset = () => { ptr.className = "ptr"; sc.classList.remove("pulling"); label.textContent = PULL; };

  sc.addEventListener("touchstart", (e) => {
    if (busy || e.touches.length !== 1 || sc.scrollTop > 0) { mode = "no"; return; }
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; mode = "";
  }, { passive: true });
  sc.addEventListener("touchmove", (e) => {
    if (mode === "no" || busy) return;
    const dy = e.touches[0].clientY - y0, dx = e.touches[0].clientX - x0;
    if (!mode) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      // sideways swipes (tables, the 14-day grid) and upward scrolls are left alone
      if (dy <= 0 || Math.abs(dx) > dy || sc.scrollTop > 0) { mode = "no"; return; }
      mode = "pull"; sc.classList.add("pulling");
      ptr.style.setProperty("--ptr-top", sc.offsetTop + "px"); ptr.classList.add("on");
    }
    e.preventDefault();
    set(dy <= 0 ? 0 : MAX * (1 - Math.exp(-dy / (MAX * 1.2)))); // gets heavier the further you pull
  }, { passive: false });
  const end = async () => {
    if (mode !== "pull") { mode = ""; return; }
    mode = "";
    if (d < LINE) { spring(0); setTimeout(() => { if (!busy && !d) reset(); }, 420); return; }
    busy = true; spring(HOLD);
    if (XMAS) window.xmas.jingle();
    ptr.classList.remove("ready"); ptr.classList.add("busy");
    label.textContent = XMAS ? "Santa's checking the scores…" : "Locking in fresh scores…"; $("#ptrStatus").textContent = "Refreshing";
    navigator.serviceWorker?.getRegistration?.().then((r) => r && r.update()).catch(() => {});
    let ok = true;
    try { await Promise.all([loadAll(), new Promise((r) => setTimeout(r, 900))]); } catch (err) { ok = false; }
    ptr.classList.remove("busy"); ptr.classList.add(ok ? "done" : "fail");
    label.textContent = ok ? (XMAS ? "Ho Ho Ho! Fresh 🎄" : "Fresh! ✨") : "Couldn't refresh. Try again?";
    $("#ptrStatus").textContent = ok ? "Scores up to date" : "Couldn't refresh";
    setTimeout(() => {
      spring(0);
      setTimeout(() => { busy = false; reset(); }, 430);
    }, ok ? 650 : 1300);
  };
  sc.addEventListener("touchend", end);
  sc.addEventListener("touchcancel", end);
}

/* ---------- boot ---------- */
async function boot() {
  // On the home-screen app, behave like a real app: no pinch, double-tap or tap-a-box zooming.
  if (installed()) {
    document.documentElement.classList.add("standalone");
    $('meta[name="viewport"]').setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover");
    for (const ev of ["gesturestart", "gesturechange"]) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  const q = new URLSearchParams(location.search);
  const shared = [q.get("title"), q.get("text"), q.get("url")].filter(Boolean).join("\n");
  if (shared) { pendingShare = shared; history.replaceState(null, "", location.pathname); }
  if (q.get("comment")) { pendingComment = q.get("comment"); history.replaceState(null, "", location.pathname); }
  // Tapping a comment notification while LockItIn is already open.
  if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", (e) => {
    if (!e.data || e.data.type !== "open") return;
    try { const c = new URL(e.data.url).searchParams.get("comment"); if (c) openCommentLink(c); } catch (err) {}
  });
  wire();
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) { show("screen-setup"); return; }
  sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  try {
    const { data } = await sb.auth.getSession();
    if (!data.session) {
      const { error } = await sb.auth.signInAnonymously();
      if (error) throw new Error("Sign-in is switched off in Supabase. Turn on anonymous sign-ins.");
    }
    await refreshMe();
  } catch (e) {
    showWho(errText(e, "Can't reach LockItIn right now. Check your connection and reload."));
    return;
  }
  if (me) enterMain(); else showWho();
}
boot();
})();
