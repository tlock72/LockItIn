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

let sb = null;
let me = null;                // {id, name, color, avatar_url, is_admin}
let games = [], allGames = [];
let players = {};             // id -> player
let scores = new Map();       // "player|game|date" -> row
let pendingShare = null;
let adminDirty = false;

const st = { tab: "today", game: null, period: "30", sort: null, post: null, newColor: null, editColor: null };
try {
  st.tab = localStorage.getItem("lii.tab") || st.tab;
  st.game = localStorage.getItem("lii.game");
  st.period = localStorage.getItem("lii.period") || st.period;
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

function av(pid, size = "") {
  const p = players[pid] || (me && me.id === pid ? me : {}) || {};
  const ini = (p.name || "?").trim().split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const img = p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="" loading="lazy" onerror="this.remove()">` : "";
  return `<span class="av ${size}" style="--c:${safeColor(p.color)}">${esc(ini)}${img}</span>`;
}
const person = (pid, size = "s") => `<span class="person">${av(pid, size)}<span class="nm">${esc(nameOf(pid))}</span></span>`;

function show(screen) {
  for (const id of ["screen-loading", "screen-setup", "screen-who", "main"]) $("#" + id).hidden = id !== screen;
}
let toastTimer;
function toast(text) {
  const t = $("#toast"); t.textContent = text; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2800);
}

/* ---------- confetti ---------- */
function confetti(colors) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const c = $("#confetti"), ctx = c.getContext("2d"), dpr = window.devicePixelRatio || 1;
  c.width = innerWidth * dpr; c.height = innerHeight * dpr; ctx.scale(dpr, dpr);
  const pal = colors && colors.length ? colors : COLORS;
  const parts = Array.from({ length: 140 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 13, vy: -Math.random() * 13 - 4,
    w: 6 + Math.random() * 6, h: 8 + Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
    c: pal[Math.floor(Math.random() * pal.length)],
  }));
  const start = performance.now();
  (function frame(t) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.38; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    }
    if (t - start < 2200) requestAnimationFrame(frame); else ctx.clearRect(0, 0, innerWidth, innerHeight);
  })(start);
}

/* ---------- share-text parsing ---------- */
function parseShare(gameId, text) {
  const t = text || "";
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
function gameTable(gid, days) {
  const g = gById(gid), from = days ? daysAgo(days - 1) : null, t = {};
  for (const [date, list] of Object.entries(byDate(gid, from))) {
    const multi = list.length > 1;
    for (const e of rankDay(list, g)) {
      const r = (t[e.uid] = t[e.uid] || { uid: e.uid, played: 0, total: 0, best: null, bestDate: null, wins: 0 });
      r.played++; r.total += e.s;
      if (r.best == null || better(g, e.s, r.best)) { r.best = e.s; r.bestDate = date; }
      if (multi && e.rank === 1) r.wins++;
    }
  }
  return Object.values(t).map((r) => ({
    ...r, avg: r.total / r.played, streak: gameStreak(r.uid, gid),
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

/* ---------- rendering ---------- */
function render() {
  if (!me || !games.length) return;
  if (!["today", "boards", "family"].includes(st.tab)) st.tab = "today";
  if (!gById(st.game)) st.game = games[0].id;
  if (!gById(st.post)) st.post = games[0].id;
  $$("[data-tab]").forEach((b) => (b.dataset.tab === st.tab && !b.classList.contains("me-btn") ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
  for (const t of ["today", "boards", "family"]) $("#tab-" + t).hidden = t !== st.tab;
  $("#meBtn").innerHTML = av(me.id, "m");
  renderToday(); renderBoards(); renderFamily();
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Up late" : h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
}
function yesterdayResults() {
  const y = daysAgo(1);
  return games.map((g) => ({ g, list: rankDay(rowsFor(g.id, y).filter((r) => r.play_date === y).map((r) => ({ uid: r.player_id, s: Number(r.score) })), g) }));
}

function renderToday() {
  const today = todayStr(), streak = anyStreak(me.id);
  $("#hello").textContent = `${greeting()}, ${me.name}!`;
  $("#helloSub").textContent = `${nice(today)} · ${streak ? `🔥 ${streak}-day streak` : "Post a score to start a streak"}`;
  const winners = [...new Set(yesterdayResults().flatMap((x) => x.list.filter((e) => e.rank === 1).map((e) => e.uid)))];
  $("#yTease").textContent = winners.length ? `${listNames(winners)} ${winners.length === 1 ? "took the crown" : "took the crowns"}. Tap to see.` : "Nobody played yesterday. Tap to see.";

  const fam = Object.keys(players).length;
  $("#cards").innerHTML = games.map((g) => {
    const list = rankDay(rowsFor(g.id, today).filter((r) => r.play_date === today).map((r) => ({ uid: r.player_id, s: Number(r.score) })), g);
    const mine = list.find((e) => e.uid === me.id), top = list[0];
    const link = g.url ? `<a class="play" href="${esc(g.url)}" target="_blank" rel="noopener">Play ↗</a>` : "";
    return `<article class="gcard" style="--gc:${gc(g.id)}">
      <div class="gtop"><h3>${icon(g.id)}${esc(g.name)}</h3>${link}</div>
      <div class="gbody">
        ${mine
          ? `<div class="mine"><span class="big">${fmt(mine.s)}</span>${g.max_score ? `<span class="of">/ ${fmt(g.max_score)}</span>` : ""}<span class="pill on">${mine.rank === 1 && list.length > 1 ? "👑 " : ""}#${mine.rank} of ${list.length}</span></div>`
          : `<div class="notyet">Not played yet</div>`}
        <div class="played"><span class="stackav">${list.slice(0, 8).map((e) => av(e.uid, "s")).join("")}</span><span>${list.length} of ${fam} played today</span></div>
        <div class="leader">${top && list.length > 1 ? `👑 <b>${esc(nameOf(top.uid))}</b> leads with ${fmt(top.s)}` : top ? `<b>${esc(nameOf(top.uid))}</b> is first in with ${fmt(top.s)}` : "Nobody's in yet. Be first!"}</div>
        <button class="btn" type="button" data-post="${esc(g.id)}">${mine ? "Update my score" : "Lock in my score"}</button>
      </div>
    </article>`;
  }).join("");
}

function sortHead(k, label, active) {
  return `<th><button data-sort="${k}" ${active ? 'aria-sort="descending"' : ""}>${label}${active ? " ↓" : ""}</button></th>`;
}
function renderBoards() {
  const g = gById(st.game), days = +st.period, low = g.better === "low";
  const pane = $("#tab-boards"); pane.style.setProperty("--gc", gc(g.id));
  $("#gamePicker").innerHTML = games.map((x) => `<button class="gp" role="tab" style="--gc:${gc(x.id)}" data-game="${esc(x.id)}" aria-selected="${x.id === g.id}">${icon(x.id)}<span>${esc(x.name)}</span></button>`).join("");
  $$("#period button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.p === st.period));

  const rows = gameTable(g.id, days);
  const sk = ["avg", "best", "total", "wins", "played", "streak"].includes(st.sort) ? st.sort : "avg";
  const asc = low && (sk === "avg" || sk === "best");
  rows.sort((a, b) => (asc ? a[sk] - b[sk] : b[sk] - a[sk]) || b.played - a.played);
  rows.forEach((r, i, a) => (r.rank = i && a[i - 1][sk] === r[sk] ? a[i - 1].rank : i + 1));
  const label = { avg: "average score", best: "best score", total: "total points", wins: "daily wins", played: "games played", streak: "current streak" }[sk];
  $("#rankNote").textContent = `Ranked by ${label}`;

  // podium
  const top = rows.slice(0, 3);
  const slot = (r, place) => r
    ? `<div class="pod p${place}"><span class="${place === 1 ? "crowned" : ""}">${av(r.uid, place === 1 ? "l" : "m")}</span><span class="nm">${esc(nameOf(r.uid))}</span><span class="val">${fmt(r[sk])}</span><div class="step">${place}</div></div>`
    : `<div class="pod p${place} empty"><span class="nm muted">–</span><div class="step">${place}</div></div>`;
  $("#podium").innerHTML = rows.length ? slot(top[1], 2) + slot(top[0], 1) + slot(top[2], 3) : "";

  // running stats tiles
  const period = rowsFor(g.id, days ? daysAgo(days - 1) : null);
  let hi = null; for (const r of period) if (!hi || better(g, Number(r.score), Number(hi.score))) hi = r;
  const famAvg = period.length ? period.reduce((s, r) => s + Number(r.score), 0) / period.length : null;
  const mostWins = rows.slice().sort((a, b) => b.wins - a.wins)[0];
  const longest = rows.slice().sort((a, b) => b.streak - a.streak)[0];
  const tile = (v, l, s) => `<div class="tile"><span class="label">${l}</span><span class="v">${v}</span><span class="s">${s}</span></div>`;
  $("#tiles").innerHTML = period.length
    ? tile(hi ? fmt(hi.score) : "–", low ? "Lowest score" : "Top score", hi ? `${esc(nameOf(hi.player_id))} · ${nice(hi.play_date, { month: "short", day: "numeric" })}` : "")
      + tile(fmt(famAvg), "Family average", `${period.length} scores posted`)
      + tile(mostWins && mostWins.wins ? mostWins.wins : "–", "Most wins", mostWins && mostWins.wins ? esc(nameOf(mostWins.uid)) : "No wins yet")
      + tile(longest && longest.streak ? `🔥 ${longest.streak}` : "–", "Hot streak", longest && longest.streak ? `${esc(nameOf(longest.uid))} · days in a row` : "Nobody on a streak")
    : "";

  // table
  const head = `<tr><th>#</th><th>Player</th>${sortHead("avg", "Avg", sk === "avg")}${sortHead("best", "Best", sk === "best")}${low ? "" : sortHead("total", "Total", sk === "total")}${sortHead("wins", "Wins", sk === "wins")}${sortHead("played", "Played", sk === "played")}${sortHead("streak", "🔥", sk === "streak")}<th>Form</th></tr>`;
  $("#board").innerHTML = rows.length
    ? `<table><thead>${head}</thead><tbody>${rows.map((r) => `<tr class="${r.uid === me.id ? "me" : ""}">
        <td class="rank ${MEDAL[r.rank] ? "" : "plain"}">${MEDAL[r.rank] || r.rank}</td>
        <td class="pl">${person(r.uid)}</td>
        <td>${fmt(r.avg)}</td><td>${fmt(r.best)}</td>${low ? "" : `<td>${fmt(r.total)}</td>`}<td>${r.wins}</td><td>${r.played}</td><td>${r.streak || "–"}</td>
        <td class="spark">${sparkline(r.form, g)}</td></tr>`).join("")}</tbody></table>`
    : `<div class="empty"><b>No ${esc(g.name)} scores ${days ? `in the last ${days} days` : "yet"}</b>Play today's ${esc(g.name)} and lock in your score to get on the board.</div>`;
  $("#boardNote").textContent = `A daily win needs at least two players. Form shows each person's last 10 ${g.name} scores. Tap a column to re-rank.`;

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
        return `<td class="cell ${e.rank === 1 && ranked[d].length > 1 ? "win" : ""}">${fmt(e.s)}</td>`;
      }).join("")}</tr>`).join("")}</tbody></table>`;
  }
}

function renderFamily() {
  $("#meAvatar").innerHTML = av(me.id, "xl");
  $("#meName").textContent = me.name;
  $("#switchBtn").textContent = `Not ${me.name}? Switch person`;
  $("#myStats").innerHTML = games.map((g) => {
    const r = gameTable(g.id, 0).find((x) => x.uid === me.id);
    return `<div class="mystat" style="--gc:${gc(g.id)}"><span class="g">${esc(g.name)}</span>${r
      ? `<span>Avg ${fmt(r.avg)} · Best ${fmt(r.best)}</span><span class="s">${r.wins} wins · ${r.played} played${r.streak ? ` · 🔥 ${r.streak}` : ""}</span>`
      : `<span class="s">Not played yet</span>`}</div>`;
  }).join("");
  if (!$("details.edit").open) {
    $("#editName").value = me.name; $("#editPic").value = me.avatar_url || ""; st.editColor = me.color;
    renderSwatches("#editColors", st.editColor);
  }
  const list = Object.values(players).sort((a, b) => a.name.localeCompare(b.name));
  $("#familyList").innerHTML = list.map((p) => {
    const wins = games.reduce((s, g) => s + (gameTable(g.id, 0).find((r) => r.uid === p.id)?.wins || 0), 0);
    const played = [...scores.values()].filter((r) => r.player_id === p.id).length;
    return `<div class="fam">${av(p.id, "m")}<div style="min-width:0"><div class="nm">${esc(p.name)}${p.id === me.id ? " (you)" : ""}</div><small>${played} scores · ${wins} wins${p.is_admin ? " · admin" : ""}</small></div></div>`;
  }).join("");

  $("#adminPanel").hidden = !me.is_admin;
  if (me.is_admin && !adminDirty) {
    $("#gameRows").innerHTML = allGames.filter((x) => x.active).map(gameRow).join("");
    $("#peopleRows").innerHTML = list.map((p) => `<div class="prow" data-pid="${p.id}">${av(p.id, "m")}<b>${esc(p.name)}</b>
      <div class="ctrls"><input data-k="pic" inputmode="url" placeholder="Profile picture link" value="${esc(p.avatar_url || "")}" aria-label="Profile picture link for ${esc(p.name)}">
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
function openSheet(id) { lastFocus = document.activeElement; $(id).hidden = false; document.body.style.overflow = "hidden"; }
function closeSheets() { $$(".sheet-wrap").forEach((s) => (s.hidden = true)); document.body.style.overflow = ""; if (lastFocus) lastFocus.focus?.(); }

function openPost(gid, text) {
  st.post = gid || st.post || games[0].id;
  $("#paste").value = text || ""; $("#score").value = ""; $("#msg").textContent = ""; $("#msg").className = "msg";
  $("#date").value = todayStr(); $("#date").max = todayStr();
  renderPostGame();
  openSheet("#postSheet");
  if (text) onPasteText(text); else {
    const existing = scores.get(`${me.id}|${st.post}|${todayStr()}`);
    if (existing) $("#score").value = existing.score;
  }
}
function renderPostGame() {
  const g = gById(st.post);
  $("#postSheet .sheet").style.setProperty("--gc", gc(g.id));
  $("#postTitle").textContent = `Lock in your ${g.name} score`;
  $("#postChips").innerHTML = games.map((x) => `<button class="chip" type="button" style="--gc:${gc(x.id)}" data-g="${esc(x.id)}" aria-pressed="${x.id === g.id}">${esc(x.name)}</button>`).join("");
}
function openYesterday() {
  const y = daysAgo(1), res = yesterdayResults();
  $("#yDate").textContent = nice(y);
  $("#yBody").innerHTML = res.map(({ g, list }) => {
    const win = list.filter((e) => e.rank === 1), rest = list.filter((e) => e.rank !== 1);
    const body = !list.length
      ? `<div class="yempty">Nobody played ${esc(g.name)}. 🦗</div>`
      : `<div class="ywin">${win.map((e) => av(e.uid, "l")).join("")}<div><div class="who-n">${esc(listNames(win.map((e) => e.uid)))}</div><div class="sc">${fmt(win[0].s)}${g.max_score ? ` <span class="muted" style="font-size:15px">/ ${fmt(g.max_score)}</span>` : ""}</div>${list.length === 1 ? `<div class="note">Only player. Still counts in our hearts.</div>` : ""}</div></div>
         ${rest.length ? `<div class="yrest">${rest.map((e) => `<span>${MEDAL[e.rank] || "#" + e.rank} ${esc(nameOf(e.uid))} · ${fmt(e.s)}</span>`).join("")}</div>` : ""}`;
    return `<div class="ygame" style="--gc:${gc(g.id)}"><div class="ygame-h"><span>${esc(g.name)}</span><span>${list.length} played</span></div>${body}</div>`;
  }).join("");
  openSheet("#ySheet");
  const winnerColors = res.flatMap((x) => x.list.filter((e) => e.rank === 1).map((e) => safeColor(players[e.uid]?.color)));
  if (winnerColors.length) setTimeout(() => confetti(["#F2B21B", "#FFD95A", ...winnerColors]), 150);
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
}
async function loadAll() {
  const [g] = await Promise.all([
    sb.from("games").select("*").order("sort").then((r) => { if (r.error) throw r.error; return r.data; }),
    loadPlayers(),
    fetchAll("scores", "player_id,game_id,play_date,score").then((s) => { scores = new Map(s.map((r) => [key(r), r])); }),
  ]);
  allGames = g; games = g.filter((x) => x.active);
  render();
}
let subscribed = false;
function subscribe() {
  if (subscribed) return; subscribed = true;
  sb.channel("lockitin-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "scores" }, (p) => {
      if (p.eventType === "DELETE") { if (p.old && p.old.player_id) scores.delete(key(p.old)); else return loadAll(); }
      else scores.set(key(p.new), p.new);
      render();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "players" }, () => loadPlayers().then(render).catch(() => {}))
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
  $("#whoGrid").innerHTML = list.map((p) => `<button class="who" type="button" data-claim="${p.id}">${av(p.id, "l")}<span>${esc(p.name)}</span></button>`).join("");
  $("#newTitle").textContent = list.length ? "Not on the list? Add yourself" : "You're first! Add yourself";
  const used = new Set(list.map((p) => p.color));
  st.newColor = st.newColor || COLORS.find((c) => !used.has(c)) || COLORS[0];
  renderSwatches("#newColors", st.newColor);
  $("#whoMsg").className = "msg" + (message ? " err" : ""); $("#whoMsg").textContent = message || "";
}
async function enterMain(welcome) {
  show("main");
  try { await loadAll(); } catch (e) { toast("Can't reach the scoreboard right now."); }
  subscribe();
  if (welcome) { toast(welcome); confetti([safeColor(me.color), "#F2B21B"]); }
  if (pendingShare) { const g = guessGame(pendingShare); openPost(g ? g.id : null, pendingShare); pendingShare = null; }
}

/* ---------- actions ---------- */
function prefill() {
  const v = parseShare(st.post, $("#paste").value), msg = $("#msg");
  msg.className = "msg";
  if (v != null) { $("#score").value = v; msg.textContent = `Found it: ${fmt(v)}`; }
  else if ($("#paste").value.trim()) msg.textContent = "Couldn't spot a score in that. Type it in below.";
  else msg.textContent = "";
}
function onPasteText(text) {
  $("#paste").value = text;
  const hit = guessGame(text);
  if (hit && hit.id !== st.post) { st.post = hit.id; renderPostGame(); }
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
  const row = { player_id: me.id, game_id: g.id, play_date: date, score: v };
  $("#save").disabled = true;
  const { error } = await sb.from("scores").upsert(row, { onConflict: "player_id,game_id,play_date" });
  $("#save").disabled = false;
  if (error) return fail(errText(error, "Couldn't save. Check your connection and try again."));
  scores.set(key(row), row);
  const dayList = rankDay(rowsFor(g.id).filter((r) => r.play_date === date).map((r) => ({ uid: r.player_id, s: Number(r.score) })), g);
  const mine = dayList.find((e) => e.uid === me.id);
  const leading = mine && mine.rank === 1 && dayList.length > 1;
  closeSheets();
  toast(pb ? `New personal best in ${g.name}! 🎉` : leading ? `You're top of the family in ${g.name}! 👑` : `${g.name} locked in: ${fmt(v)} 🔒`);
  confetti(pb || leading ? ["#F2B21B", "#FFD95A", safeColor(me.color)] : [safeColor(me.color), "#FFFFFF", "#5B3DF5"]);
  if (navigator.vibrate) navigator.vibrate(pb || leading ? [20, 40, 20] : 15);
  render();
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
    if (nav) { st.tab = nav.dataset.tab; save("lii.tab", st.tab); render(); window.scrollTo(0, 0); return; }
    const post = t.closest("[data-post]");
    if (post) { openPost(post.dataset.post); return; }
    const chip = t.closest(".chip");
    if (chip) { st.post = chip.dataset.g; renderPostGame(); prefill(); return; }
    if (t.closest("[data-close]") || t.classList.contains("sheet-wrap")) { closeSheets(); return; }
    const gp = t.closest("[data-game]");
    if (gp) { st.game = gp.dataset.game; st.sort = null; save("lii.game", st.game); renderBoards(); return; }
    const per = t.closest("#period button");
    if (per) { st.period = per.dataset.p; save("lii.period", st.period); renderBoards(); return; }
    const so = t.closest("[data-sort]");
    if (so) { st.sort = so.dataset.sort; renderBoards(); return; }
    const rm = t.closest("[data-rm]");
    if (rm) { rm.closest(".grow").remove(); adminDirty = true; return; }
    const sp = t.closest("[data-saveperson]");
    if (sp) {
      const row = sp.closest(".prow");
      const { error } = await sb.rpc("admin_update_player", { p_player: row.dataset.pid, p_avatar_url: row.querySelector('[data-k="pic"]').value, p_admin: row.querySelector('[data-k="admin"]').checked });
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
  $("#paste").addEventListener("input", () => onPasteText($("#paste").value));
  $("#pasteBtn").onclick = async () => {
    try { const txt = await navigator.clipboard.readText(); if (txt) onPasteText(txt); }
    catch (e) { $("#paste").focus(); $("#msg").className = "msg"; $("#msg").textContent = "Long-press the box and choose Paste."; }
  };
  $("#save").onclick = saveScore;
  $("#score").addEventListener("keydown", (e) => { if (e.key === "Enter") saveScore(); });
  $("#switchBtn").onclick = async () => {
    await sb.rpc("leave_device");
    me = null; showWho();
  };
  $("#saveMe").onclick = async () => {
    const m = $("#meMsg");
    const { error } = await sb.rpc("update_me", { p_name: $("#editName").value, p_color: st.editColor || me.color, p_avatar_url: $("#editPic").value });
    m.className = "msg" + (error ? " err" : ""); m.textContent = error ? errText(error, "Couldn't save.") : "Saved!";
    if (!error) { await refreshMe(); await loadPlayers(); $("details.edit").open = false; render(); toast("Looking good! ✨"); }
  };

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

  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && me && !$("#main").hidden) loadAll().catch(() => {}); });
}

/* ---------- boot ---------- */
async function boot() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  const q = new URLSearchParams(location.search);
  const shared = [q.get("title"), q.get("text"), q.get("url")].filter(Boolean).join("\n");
  if (shared) { pendingShare = shared; history.replaceState(null, "", location.pathname); }
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
