/* LockItIn Christmas edition: snow, fairy lights, the big HO HO HO, Santa's sleigh and jingle bells.
   Only runs while <body class="xmas">. app.js calls window.xmas.* for the festive extras. */
(() => {
"use strict";
if (!document.body.classList.contains("xmas")) return;

const $ = (s) => document.querySelector(s);
const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- countdown ---------- */
function sleeps() {
  const now = new Date(), y = now.getFullYear();
  const today = new Date(y, now.getMonth(), now.getDate());
  let xmas = new Date(y, 11, 25);
  if (today > new Date(y, 11, 26)) xmas = new Date(y + 1, 11, 25);
  return Math.round((xmas - today) / 864e5);
}
function countdownHtml() {
  const n = sleeps(), m = new Date().getMonth(), d = new Date().getDate();
  if (n === 0) return "🎄 <b>Merry Christmas,</b> everyone!";
  if (m === 11 && d === 26) return "🎁 Happy Boxing Day!";
  if (m === 11 && d > 26) return "✨ Happy holidays, family!";
  if (n === 1) return "🎅 Santa comes <b>tonight!</b>";
  return `🎄 <b>${n}</b> sleeps till Christmas`;
}

/* ---------- the big HO HO HO ---------- */
const WORDS = '<span class="ho-words" aria-hidden="true"><span class="ho">Ho</span><span class="ho">Ho</span><span class="ho">Ho!</span></span>';
const HOLLY = '<svg class="holly" viewBox="0 0 64 52" aria-hidden="true"><path d="M30 20c-6-10-18-12-26-8 4 2 4 6 2 9 5-1 8 2 7 6 6-4 12-5 17-7z" fill="#1E8449"/><path d="M34 20c4-11 16-15 25-12-4 3-3 7-1 9-5 0-8 3-6 7-6-3-12-3-18-4z" fill="#2EA463"/><circle cx="30" cy="24" r="5" fill="#E3283E"/><circle cx="38" cy="25" r="5" fill="#C8102E"/><circle cx="33" cy="31" r="5" fill="#E3283E"/><circle cx="28.5" cy="22.5" r="1.4" fill="#fff" opacity=".7"/><circle cx="36.5" cy="23.5" r="1.4" fill="#fff" opacity=".7"/></svg>';
function addBanner() {
  const y = $("#yesterdayBtn");
  if (!y || $("#hoBtn")) return;
  const b = document.createElement("button");
  b.type = "button"; b.className = "hohoho"; b.id = "hoBtn";
  b.innerHTML = `<span class="santa" aria-hidden="true"></span><span class="ho-text">${WORDS}<span class="ho-sub" id="hoSub"></span></span>${HOLLY}`;
  y.before(b);
  b.addEventListener("click", () => hoHoHo(b.querySelector(".santa")));
  refresh();
}
function refresh() {
  const s = $("#hoSub");
  if (s) s.innerHTML = countdownHtml();
  const b = $("#hoBtn");
  if (b) b.setAttribute("aria-label", "Ho Ho Ho! " + s.textContent.trim() + ". Tap for a Christmas surprise.");
}
function addWhoHo() {
  const t = $(".who-title");
  if (!t || $(".who-ho")) return;
  const b = document.createElement("button");
  b.type = "button"; b.className = "who-ho"; b.setAttribute("aria-label", "Ho Ho Ho!");
  b.innerHTML = WORDS;
  t.before(b);
  b.addEventListener("click", () => hoHoHo(b));
}

/* ---------- Ho Ho Ho! (tap): Santa laughs, bells jingle, the sleigh flies, snow bursts ---------- */
let laughing = false;
function hoHoHo(from) {
  const host = from && (from.closest(".hohoho, .who-ho") || from);
  if (host) { host.classList.remove("laugh"); void host.offsetWidth; host.classList.add("laugh"); setTimeout(() => host.classList.remove("laugh"), 1300); }
  if (laughing) return;
  laughing = true; setTimeout(() => (laughing = false), 1500);
  if (from) pop(from, "Ho Ho Ho!");
  jingle();
  snowBurst(from);
  setTimeout(sleigh, 350);
  if (navigator.vibrate) navigator.vibrate([30, 60, 30, 60, 30]);
}
function pop(el, text) {
  const r = el.getBoundingClientRect(), p = document.createElement("div");
  p.className = "ho-pop"; p.textContent = text; p.setAttribute("aria-hidden", "true");
  p.style.left = Math.min(Math.max(r.left + r.width / 2, 90), innerWidth - 90) + "px";
  p.style.top = Math.max(r.top - 30, 8) + "px";
  document.body.appendChild(p);
  setTimeout(() => p.remove(), 1500);
}

/* jingle bells, played with WebAudio (no sound files)
   Phones: by default iPhone treats web sounds like ringtones, so the ring/silent switch mutes them.
   We play the bells as media instead (like a video), so they follow the media volume and play with
   the ringer off. iOS 17+: the "playback" audio session, set before the AudioContext is made (a
   context made earlier stays on the ringer channel, so it is replaced). Older iPhones: a looping
   silent <audio> clip plays alongside the bells, which moves the page onto the media channel.
   The sound stops (and other apps' music can carry on) once the tune is over. */
let ac = null, quiet = null, idleT = 0, media = false;
const SILENT = "data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";
const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && "ontouchend" in document);
function audio() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
  }
  if (ac.state !== "running") ac.resume().catch(() => {});
  return ac;
}
function mediaChannel() {
  try {
    const s = navigator.audioSession;
    if (s && "type" in s) {
      if (s.type !== "playback") s.type = "playback";
      if (!media) { media = true; if (ac) { ac.close().catch(() => {}); ac = null; } }
    } else if (IOS) {
      quiet = quiet || Object.assign(new Audio(SILENT), { loop: true, playsInline: true });
      quiet.setAttribute("playsinline", ""); quiet.setAttribute("x-webkit-airplay", "deny");
      quiet.play().catch(() => {});
    }
  } catch (e) {}
}
function idleSoon(secs) {
  clearTimeout(idleT);
  idleT = setTimeout(() => {
    try { if (quiet) quiet.pause(); } catch (e) {}
    try { if (ac && ac.state === "running") ac.suspend().catch(() => {}); } catch (e) {}
  }, secs * 1000);
}
// Wake the audio on the first tap so the first jingle starts at once. On iOS 17+ we wait for the
// first jingle instead, so a tap anywhere never pauses music from another app.
function unlock() {
  if (navigator.audioSession && "type" in navigator.audioSession) return stopUnlock();
  const a = audio();
  if (!a) return;
  try { const s = a.createBufferSource(); s.buffer = a.createBuffer(1, 1, 22050); s.connect(a.destination); s.start(0); } catch (e) {}
  if (a.state === "running") { stopUnlock(); idleSoon(1); }
}
function stopUnlock() { for (const ev of ["touchend", "click", "keydown"]) document.removeEventListener(ev, unlock, true); }
for (const ev of ["touchend", "click", "keydown"]) document.addEventListener(ev, unlock, true);
function jingle() {
  try {
    mediaChannel();
    const a = audio();
    if (!a) return;
    const play = () => {
      if (a.currentTime < tuneEnd) return; // still playing: don't pile tunes on top of each other
      // The opening hook of "Last Christmas" (Wham!), in D major, about 108 bpm, with sleigh bells
      // and soft chords underneath (D, then B minor), like the record's intro.
      const A4 = 440, B4 = 493.9, D5 = 587.3, E5 = 659.3, Fs5 = 740;
      const tune = [[E5, 1], [E5, .5], [D5, 1.5], [0, .5], [A4, .5], [E5, .5], [E5, .5], [Fs5, .5], [D5, 1.5], [B4, .5], [B4, 1.5]];
      const t0 = a.currentTime + 0.05, beat = 0.56;
      let t = t0;
      for (const [f, len] of tune) { if (f) bell(f, t); t += beat * len; }
      pad([146.8, 185, 220], t0, beat * 3.5);              // D
      pad([123.5, 146.8, 185], t0 + beat * 3.5, beat * 5);  // Bm
      // sleigh-bell shakes on every half beat
      for (let i = 0; i < 17; i++) shake(t0 + i * beat / 2);
      tuneEnd = t;
      idleSoon(t - a.currentTime + 1.5);
    };
    // A phone's audio can still be waking up; start the tune once it is, so no notes get squashed.
    if (a.state === "running") play(); else a.resume().then(play, () => {});
  } catch (e) {}
}
let tuneEnd = 0;
// soft synth chord, fading in and out
function pad(freqs, t, len) {
  for (const f of freqs) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = "triangle"; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.045, t + 0.12);
    g.gain.setValueAtTime(0.045, t + len - 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.3);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + len + 0.35);
  }
}
function bell(f, t) {
  for (const [mult, vol, dec] of [[1, .22, .9], [2, .07, .5], [2.76, .04, .3], [5.4, .02, .2]]) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = "sine"; o.frequency.value = f * mult;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dec + 0.05);
  }
}
function shake(t) {
  const len = 0.08, buf = ac.createBuffer(1, ac.sampleRate * len, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = ac.createBufferSource(), hp = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = buf; hp.type = "highpass"; hp.frequency.value = 7000; g.gain.value = 0.05;
  s.connect(hp).connect(g).connect(ac.destination); s.start(t);
}

/* ---------- Santa's sleigh ---------- */
const SLEIGH = `<svg class="sleigh" viewBox="0 0 240 90" aria-hidden="true"><g class="sl-body">
  <g class="trail"><circle cx="4" cy="62" r="2"/><circle cx="14" cy="54" r="1.5"/><circle cx="22" cy="66" r="2.4"/><circle cx="-6" cy="58" r="1.4"/><path d="M30 48l1.5 3.5 3.5 1.5-3.5 1.5L30 58l-1.5-3.5L25 53l3.5-1.5z"/></g>
  <path d="M38 52h44c6 0 9-6 10-12h6c-1 14-8 22-18 22H44c-4 0-6 3-4 6h50" fill="none" stroke="var(--gold,#E8A317)" stroke-width="3" stroke-linecap="round"/>
  <path d="M40 38h44c4 0 6 2 6 6v4c0 3-2 5-5 5H46c-4 0-7-3-7-7z" fill="#C8102E"/>
  <path d="M40 38h44" stroke="var(--gold,#E8A317)" stroke-width="2.5"/>
  <rect x="44" y="28" width="12" height="12" rx="2" fill="#1E8449"/><path d="M50 28v12M44 34h12" stroke="#FFD24A" stroke-width="2"/>
  <circle cx="68" cy="30" r="9" fill="#C8102E"/><circle cx="68" cy="20" r="5.5" fill="#F7C8A8"/><path d="M62 22c0 6 3 9 6 9s6-3 6-9c-2 1-10 1-12 0z" fill="#fff"/>
  <path d="M62 17c1-6 6-9 12-6 3 2 5 5 6 8l-3 1c-2-3-5-4-8-3z" fill="#C8102E"/><circle cx="80" cy="20" r="2.4" fill="#fff"/><rect x="61.5" y="15.5" width="13" height="3.5" rx="1.7" fill="#fff"/>
  <path d="M74 32l18 4M80 38l12-2" stroke="currentColor" stroke-width="1.2" opacity=".6"/>
  <g fill="#8B5A2B" stroke="#8B5A2B" stroke-linecap="round" stroke-linejoin="round">
    <ellipse cx="118" cy="44" rx="15" ry="7"/><path d="M128 40l8-10" stroke-width="5"/><ellipse cx="139" cy="28" rx="6" ry="4"/>
    <path d="M136 25l-2-8m2 4l-5-3m7 6l3-8m-2 4l5-3" fill="none" stroke-width="1.6"/>
    <path d="M107 48l-8 8m12-7l-4 11m16-10l6 9m4-11l9 6" fill="none" stroke-width="3"/>
    <ellipse cx="170" cy="40" rx="15" ry="7"/><path d="M180 36l8-10" stroke-width="5"/><ellipse cx="191" cy="24" rx="6" ry="4"/>
    <path d="M188 21l-2-8m2 4l-5-3m7 6l3-8m-2 4l5-3" fill="none" stroke-width="1.6"/>
    <path d="M159 44l-8 8m12-7l-4 11m16-10l6 9m4-11l9 6" fill="none" stroke-width="3"/>
  </g>
  <circle cx="197" cy="25" r="2.8" fill="#FF2A3D"><animate attributeName="opacity" values="1;.4;1" dur=".6s" repeatCount="indefinite"/></circle>
  <path d="M90 42q14-4 28-2q26-4 52-4" fill="none" stroke="var(--gold,#E8A317)" stroke-width="1.2"/>
</g></svg>`;
let flying = false;
function sleigh() {
  if (flying || still() || document.hidden) return;
  let s = $(".sleigh");
  if (!s) { document.body.insertAdjacentHTML("beforeend", SLEIGH); s = $(".sleigh"); }
  flying = true;
  const dur = Math.max(4.5, Math.min(8, innerWidth / 160));
  s.style.setProperty("--dur", dur + "s");
  s.classList.remove("fly"); void s.getBoundingClientRect(); s.classList.add("fly");
  setTimeout(() => { s.classList.remove("fly"); flying = false; }, dur * 1000 + 150);
}
// Santa pops by on his own now and then while the app is open.
function scheduleSleigh() { setTimeout(() => { if (!$("#main")?.hidden || !$("#screen-who")?.hidden) sleigh(); scheduleSleigh(); }, 45000 + Math.random() * 45000); }

/* ---------- fairy lights ---------- */
const BULBS = ["#E3283E", "#FFC23D", "#2FA866", "#4FA3E0", "#FF7BD0"];
function lights() {
  const bar = $(".topbar");
  if (!bar) return;
  let l = bar.querySelector(".lights");
  if (!l) { l = document.createElement("div"); l.className = "lights"; l.setAttribute("aria-hidden", "true"); bar.appendChild(l); }
  const n = Math.ceil(bar.clientWidth / 34) + 1;
  if (l.childElementCount === n) return;
  l.innerHTML = Array.from({ length: n }, (_, i) =>
    `<span class="bulb" style="left:${i * 34 + 17}px;--bc:${BULBS[i % BULBS.length]};--r:${i % 2 ? 8 : -8}deg;--t:${(1.1 + ((i * 37) % 10) / 10).toFixed(2)}s;--dl:${(-((i * 53) % 17) / 10).toFixed(2)}s"></span>`).join("");
}

/* ---------- falling snow ---------- */
function snow() {
  const c = document.createElement("canvas");
  c.id = "snow"; c.setAttribute("aria-hidden", "true");
  document.body.prepend(c);
  const ctx = c.getContext("2d");
  let W = 0, H = 0, flakes = [], color = "#fff", running = false;
  const size = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight; c.width = W * dpr; c.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    color = getComputedStyle(document.body).getPropertyValue("--snow").trim() || "#fff";
    const want = Math.round(Math.min(110, (W * H) / 9000));
    while (flakes.length < want) flakes.push(flake(true));
    flakes.length = want;
    if (still()) draw();
  };
  const flake = (anywhere) => ({ x: Math.random() * W, y: anywhere ? Math.random() * H : -10, r: 1 + Math.random() * 2.8, s: 0.3 + Math.random() * 0.9, w: Math.random() * Math.PI * 2, a: 0.35 + Math.random() * 0.55, star: Math.random() < 0.18 });
  const draw = () => {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = color; ctx.strokeStyle = color;
    for (const f of flakes) {
      ctx.globalAlpha = f.a;
      if (f.star) {
        ctx.lineWidth = 1; ctx.beginPath();
        for (let k = 0; k < 3; k++) { const ang = (k * Math.PI) / 3 + f.w * 0.2, dx = Math.cos(ang) * f.r * 2, dy = Math.sin(ang) * f.r * 2; ctx.moveTo(f.x - dx, f.y - dy); ctx.lineTo(f.x + dx, f.y + dy); }
        ctx.stroke();
      } else { ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  };
  const tick = () => {
    if (!running) return;
    for (const f of flakes) {
      f.w += 0.012; f.y += f.s; f.x += Math.sin(f.w) * 0.45;
      if (f.y > H + 10) Object.assign(f, flake(false));
      if (f.x < -10) f.x = W + 10; else if (f.x > W + 10) f.x = -10;
    }
    draw();
    requestAnimationFrame(tick);
  };
  const go = () => { if (still() || document.hidden) { running = false; return; } if (!running) { running = true; requestAnimationFrame(tick); } };
  addEventListener("resize", () => { size(); lights(); });
  document.addEventListener("visibilitychange", go);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", size);
  size(); go();
}

/* a quick flurry from a point (used by Ho Ho Ho) */
function snowBurst(from) {
  if (still()) return;
  const r = from ? from.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 3, width: 0, height: 0 };
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const c = document.createElement("canvas"), dpr = window.devicePixelRatio || 1;
  c.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:64";
  c.width = innerWidth * dpr; c.height = innerHeight * dpr; document.body.appendChild(c);
  const ctx = c.getContext("2d"); ctx.scale(dpr, dpr);
  const pal = ["#FFFFFF", "#FFD24A", "#E3283E", "#2FA866"];
  const parts = Array.from({ length: 70 }, () => { const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 7; return { x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, r: 2 + Math.random() * 4, c: pal[Math.floor(Math.random() * pal.length)], rot: Math.random() * 6 }; });
  const start = performance.now();
  (function frame(t) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    const life = (t - start) / 1600;
    for (const p of parts) { p.vy += 0.16; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += 0.08; star(ctx, p.x, p.y, p.r, p.rot, p.c, 1 - life); }
    if (life < 1) requestAnimationFrame(frame); else c.remove();
  })(start);
}
function star(ctx, x, y, r, rot, color, alpha) {
  ctx.save(); ctx.globalAlpha = Math.max(0, alpha); ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = color; ctx.beginPath();
  for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.45 : r, a = (i * Math.PI) / 5; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill(); ctx.restore();
}
// Snowflake shape for the confetti in app.js.
function flakeShape(ctx, size, color) {
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.beginPath();
  for (let k = 0; k < 3; k++) { const a = (k * Math.PI) / 3, dx = Math.cos(a) * size, dy = Math.sin(a) * size; ctx.moveTo(-dx, -dy); ctx.lineTo(dx, dy); }
  ctx.stroke();
}

/* ---------- festive tab icons ---------- */
const TAB_ICONS = {
  today: '<path d="M12 2.5l1.2 2.4 2.6.4-1.9 1.8.5 2.6L12 8.5l-2.4 1.2.5-2.6-1.9-1.8 2.6-.4z"/><path d="M12 10.5l-5 6h2.5L5.5 21h13l-4-4.5H17z"/><path d="M12 21v1.5"/>',
  boards: '<path d="M3 13h6v8H3zM9 8h6v13H9zM15 11h6v10h-6z"/><path d="M12 8v13M6 13v8M18 11v10"/><path d="M12 8c-1-2.6-4-3-3.6-.8M12 8c1-2.6 4-3 3.6-.8"/>',
  family: '<circle cx="8" cy="6" r="2.6"/><path d="M5.6 9.3h4.8l3 2-1 1.5-2-1v3l1.8 4.5-1.6.8L8 16l-2.6 4.1-1.6-.8 1.8-4.5v-3l-2 1-1-1.5z"/><circle cx="17" cy="9" r="2.2"/><path d="M15 11.8h4l2.4 1.6-.8 1.3-1.6-.8v2.4l1.4 3.6-1.3.7L17 17.4l-2.1 3.2-1.3-.7 1.4-3.6v-2.4l-1.6.8-.8-1.3z"/>',
};
function tabIcons() {
  for (const b of document.querySelectorAll(".tabbar button[data-tab]")) {
    const svg = b.querySelector("svg"), p = TAB_ICONS[b.dataset.tab];
    if (svg && p) svg.innerHTML = p;
  }
}

/* ---------- start ---------- */
addBanner(); addWhoHo(); tabIcons(); snow(); lights(); scheduleSleigh();
new ResizeObserver(lights).observe($(".topbar") || document.body);
// Keep the countdown right if the app stays open past midnight.
setInterval(refresh, 60 * 1000);
// A first fly-by shortly after opening.
setTimeout(sleigh, 2500);

window.xmas = { hoHoHo, sleigh, jingle, snowBurst, flakeShape, star, refresh };
})();
