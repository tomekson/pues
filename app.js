/* ¡pues! — vanilla SPA, žádný build step, jediná obrazovka: denní zprávy španělsky s překladem a audiem */
'use strict';

/* ---------------- TTS (Web Speech API, es-ES) ----------------
   iOS: speak() musí běžet z tap handleru — všechna volání jsou onclick. */

let esVoice = null;
function pickVoice() {
  const voices = speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith('es'));
  esVoice = voices.find(v => v.lang.toLowerCase() === 'es-es' && v.localService)
    || voices.find(v => v.lang.toLowerCase() === 'es-es')
    || voices.find(v => v.localService) || voices[0] || null;
}
if ('speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}

let ttsCurrent = null; // text, který právě hraje: druhý klik = pauza, třetí = pokračování

function speak(text, rate = 0.9) {
  if (!('speechSynthesis' in window)) return;
  const ss = speechSynthesis;
  if (ttsCurrent === text && (ss.speaking || ss.paused)) {
    if (ss.paused) ss.resume();
    else ss.pause();
    return;
  }
  ss.cancel();
  ttsCurrent = text;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'es-ES';
  if (esVoice) u.voice = esVoice;
  u.rate = rate;
  u.onend = () => { if (ttsCurrent === text) ttsCurrent = null; };
  ss.speak(u);
}

/* ---------------- helpers ---------------- */

const $ = sel => document.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function fetchJson(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error(path + ' → ' + r.status);
  return r.json();
}

/* ---------------- Noticias ---------------- */

async function renderNoticias(el) {
  let daily = null;
  try { daily = await fetchJson('data/news/daily.json', { cache: 'no-cache' }); } catch (e) { /* zatím žádné denní zprávy */ }

  if (!daily || !daily.stories || !daily.stories.length) {
    el.innerHTML = `<h2>Noticias del día</h2>
      <div class="card"><p class="muted">Dnešní zprávy zatím nejsou k dispozici. Zkus to později.</p></div>`;
    return;
  }

  let html = `
    <div class="session-meta">
      <h2>Noticias del día</h2>
      <span class="muted">${esc(daily.date)}</span>
    </div>
    <p class="muted">Každé ráno čerstvé. Tapnutím na zprávu rozbalíš češtinu.</p>`;

  const groups = [
    { title: 'Desde Chequia', items: daily.stories.filter(n => n.origin === 'cz') },
    { title: 'Prensa', items: daily.stories.filter(n => n.origin === 'guardian') },
    { title: 'Desde el mundo', items: daily.stories.filter(n => n.origin === 'world' || !n.origin) },
    { title: 'Desde la Unión Europea', items: daily.stories.filter(n => n.origin === 'eu') },
    { title: '¿Sabías qué?', items: daily.stories.filter(n => n.origin === 'dyk') },
  ].filter(g => g.items.length);

  groups.forEach((g, gi) => {
    html += `<div class="card digest"><h3>${esc(g.title)}</h3>`;
    g.items.forEach((n, i) => {
      html += `
      <div class="digest-item" data-g="${gi}" data-i="${i}">
        <button class="tts-mini" title="Escuchar">🔊</button>
        <div class="digest-text">
          <p class="testo">${esc(n.es)}</p>
          <p class="cz-line hidden">${esc(n.cz)}</p>
        </div>
        <span class="chev" aria-hidden="true">🇨🇿</span>
      </div>`;
    });
    html += `</div>`;
  });

  if (daily.article) {
    html += `
    <div class="card article">
      <h3>A fondo</h3>
      <p class="testo">${esc(daily.article.es)}</p>
      <button class="tts-btn" id="art-tts">🔊 Escuchar</button>
      <button class="cz-toggle" id="art-cz">🇨🇿 česky</button>
      <div class="cz-text hidden">${esc(daily.article.cz)}</div>
    </div>`;
  }

  html += `<p class="fonte">Zdroje: <a href="${esc(daily.sourceUrl)}">Wikipedia</a> (CC BY-SA) · <a href="https://ec.europa.eu/commission/presscorner/">Evropská komise</a>${daily.stories.some(s => s.origin === 'guardian') ? ' · <a href="https://www.theguardian.com/">The Guardian</a> (Open Platform)' : ''} · překlad ${esc(daily.translator || 'automatický')}</p>`;

  el.innerHTML = html;

  el.querySelectorAll('.digest-item').forEach(row => {
    const n = groups[+row.dataset.g].items[+row.dataset.i];
    row.querySelector('.tts-mini').onclick = e => { e.stopPropagation(); speak(n.es); };
    row.onclick = () => {
      row.querySelector('.cz-line').classList.toggle('hidden');
      row.classList.toggle('open');
    };
  });
  if (daily.article) {
    const artToggle = () => el.querySelector('.article .cz-text').classList.toggle('hidden');
    el.querySelector('.article').onclick = artToggle;
    $('#art-tts').onclick = e => { e.stopPropagation(); speak(daily.article.es); };
    $('#art-cz').onclick = e => { e.stopPropagation(); artToggle(); };
  }
}

/* ---------------- update banner + SW ---------------- */

async function checkVersion() {
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    const j = await r.json();
    if (j.v !== APP_VERSION) {
      $('#update-text').textContent = `Je k dispozici nová verze v${j.v}`;
      $('#update-banner').classList.remove('hidden');
    }
  } catch (e) { /* offline — v pohodě */ }
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVersion(); });

async function applyUpdate() {
  try {
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    const regs = await navigator.serviceWorker?.getRegistrations?.() || [];
    await Promise.all(regs.map(r => r.update().catch(() => {})));
  } catch (e) { /* i tak reloadneme */ }
  location.reload();
}

$('#update-btn').onclick = () => {
  const btn = $('#update-btn');
  btn.disabled = true;
  btn.textContent = 'Aktualizuji…';
  applyUpdate();
};

/* ---------------- pull-to-refresh (mobil) ---------------- */

const ptr = $('#ptr');
let ptrStart = 0;
let ptrDist = 0;
let ptrActive = false;

async function ptrRefresh() {
  ptr.textContent = 'Aktualizuji…';
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    const j = await r.json();
    if (j.v !== APP_VERSION) { await applyUpdate(); return; }
    await show();
  } catch (e) { /* offline, nevadí */ }
  ptr.classList.add('hidden');
}

window.addEventListener('touchstart', e => {
  if (window.scrollY <= 0) {
    ptrStart = e.touches[0].clientY;
    ptrDist = 0;
    ptrActive = true;
  }
}, { passive: true });

window.addEventListener('touchmove', e => {
  if (!ptrActive) return;
  ptrDist = e.touches[0].clientY - ptrStart;
  if (ptrDist > 25 && window.scrollY <= 0) {
    ptr.classList.remove('hidden');
    ptr.textContent = ptrDist > 80 ? '↻ pusť pro obnovení' : '↓ přetáhni pro obnovení';
    ptr.style.transform = `translate(-50%, ${Math.min(ptrDist / 2.5, 44)}px)`;
  }
}, { passive: true });

window.addEventListener('touchend', () => {
  if (!ptrActive) return;
  ptrActive = false;
  ptr.style.transform = 'translate(-50%, 12px)';
  if (ptrDist > 80 && window.scrollY <= 0) ptrRefresh();
  else ptr.classList.add('hidden');
}, { passive: true });

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

/* ---------------- plovoucí nahoru ---------------- */

const toTop = $('#to-top');
window.addEventListener('scroll', () => {
  toTop.classList.toggle('hidden', window.scrollY < 400);
}, { passive: true });
toTop.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });

/* ---------------- router (jediná obrazovka) ---------------- */

async function show() {
  const el = $('#main');
  el.innerHTML = '<p class="muted" style="padding:20px">Cargando…</p>';
  try {
    await renderNoticias(el);
  } catch (e) {
    el.innerHTML = `<div class="card"><strong>Chyba načítání dat</strong><p class="muted">${esc(e.message)}</p></div>`;
  }
  window.scrollTo(0, 0);
}

/* ---------------- init ---------------- */

(async function init() {
  $('#footer-version').textContent = 'v' + APP_VERSION;
  show();
  checkVersion();
})();
