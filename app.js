/* ¡pues! — vanilla SPA, žádný build step, jediná obrazovka: denní zprávy španělsky s překladem a audiem */
'use strict';

/* ---------------- TTS (Web Speech API, es-ES) ----------------
   iOS: speak() musí běžet z tap handleru — všechna volání jsou onclick. */

/* jména skutečných (ne "žertovných" postavových — Eddy/Flo/Grandma/Grandpa/Reed/Rocko/Sandy/Shelley
   existují stejné ve všech jazycích a znějí roboticky) hlasů na macOS/iOS/Windows, v pořadí kvality */
const VOICE_PREFER = [/mónica|monica/i, /paulina/i, /elvira/i, /[aá]lvaro/i, /helena/i, /laura/i, /pablo/i];

let esVoice = null;
function pickVoice() {
  const voices = speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith('es'));
  esVoice = null;
  for (const pattern of VOICE_PREFER) {
    const hit = voices.find(v => pattern.test(v.name) && v.localService);
    if (hit) { esVoice = hit; break; }
  }
  if (!esVoice) {
    esVoice = voices.find(v => v.lang.toLowerCase() === 'es-es' && v.localService)
      || voices.find(v => v.lang.toLowerCase() === 'es-es')
      || voices.find(v => v.localService) || voices[0] || null;
  }
  // bez nainstalovaného španělského hlasu si TTS engine tiše vezme systémový výchozí (často česky) —
  // nejde to opravit z JS (chybí engine), jen na to upozornit
  document.getElementById('voice-note')?.classList.toggle('hidden', voices.length > 0);
}
if ('speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}

let ttsCurrent = null; // text, který právě hraje: druhý klik = pauza, třetí = pokračování

function speak(text, rate = 0.9) {
  if (!('speechSynthesis' in window)) return;
  if (player.items.length) playerStop(); // jednotlivé přehrání má přednost před frontou
  const ss = speechSynthesis;
  if (ttsCurrent === text && (ss.speaking || ss.paused)) {
    if (ss.paused) ss.resume();
    else ss.pause();
    return;
  }
  // iOS PWA občas nespustí "voiceschanged" — znovu zkontrolovat těsně před přehráním
  if (!esVoice) pickVoice();
  ss.cancel();
  ttsCurrent = text;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'es-ES';
  if (esVoice) u.voice = esVoice;
  u.rate = rate;
  u.onend = () => { if (ttsCurrent === text) ttsCurrent = null; };
  ss.speak(u);
}

/* ---------------- Escucha: fronta vět + plovoucí přehrávač ----------------
   Pasivní poslech celých Noticias (i dne z Archiva), rychlost 0.7 až 1.0.
   iOS: start vždy z tapnutí; navazující věty jedou z onend už povoleného hlasu. */

const player = { items: [], i: 0, rate: 0.85, playing: false, label: '' };
const PLAYER_RATES = [0.7, 0.85, 1.0];
let plUtter = null;

function playerUI() {
  const bar = $('#player');
  if (!bar) return;
  if (!player.items.length) {
    bar.classList.add('hidden');
    document.body.classList.remove('player-open');
    return;
  }
  bar.classList.remove('hidden');
  document.body.classList.add('player-open');
  $('#pl-ic-play').classList.toggle('hidden', player.playing);
  $('#pl-ic-pause').classList.toggle('hidden', !player.playing);
  $('#pl-label').innerHTML = `<b>${esc(player.label)}</b> · ${player.i + 1}/${player.items.length}`;
  $('#pl-rate').textContent = player.rate + '×';
}

function playerSpeakCurrent() {
  const ss = speechSynthesis;
  ss.cancel();
  ttsCurrent = null;
  if (!esVoice) pickVoice();
  const u = new SpeechSynthesisUtterance(player.items[player.i]);
  u.lang = 'es-ES';
  if (esVoice) u.voice = esVoice;
  u.rate = player.rate;
  u.onend = () => {
    if (plUtter !== u || !player.playing) return;
    if (player.i < player.items.length - 1) {
      player.i++;
      playerUI();
      playerSpeakCurrent();
    } else {
      playerStop();
    }
  };
  plUtter = u;
  ss.speak(u);
}

function playerStart(items, label) {
  if (!('speechSynthesis' in window) || !items.length) return;
  player.items = items;
  player.i = 0;
  player.label = label;
  player.playing = true;
  playerUI();
  playerSpeakCurrent();
}

function playerStop() {
  player.items = [];
  player.playing = false;
  plUtter = null;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  playerUI();
}

function splitSentences(text) {
  return (String(text).match(/[^.!?]+[.!?]+["»”']?|[^.!?]+$/g) || [String(text)])
    .map(s => s.trim()).filter(Boolean);
}

function initPlayerControls() {
  if (!$('#player')) return;
  $('#pl-play').onclick = () => {
    if (!player.items.length) return;
    const ss = speechSynthesis;
    if (player.playing) {
      ss.pause();
      player.playing = false;
    } else {
      player.playing = true;
      if (ss.paused) ss.resume();
      else playerSpeakCurrent();
    }
    playerUI();
  };
  $('#pl-next').onclick = () => {
    if (!player.items.length) return;
    if (player.i < player.items.length - 1) {
      player.i++;
      playerUI();
      if (player.playing) playerSpeakCurrent();
      else speechSynthesis.cancel();
    } else {
      playerStop();
    }
  };
  $('#pl-rate').onclick = () => {
    if (!player.items.length) return;
    player.rate = PLAYER_RATES[(PLAYER_RATES.indexOf(player.rate) + 1) % PLAYER_RATES.length];
    playerUI();
    if (player.playing) playerSpeakCurrent();
    else speechSynthesis.cancel();
  };
  $('#pl-stop').onclick = playerStop;
}

/* ---------------- helpers ---------------- */

const $ = sel => document.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function fetchJson(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error(path + ' → ' + r.status);
  return r.json();
}

/* klikatelný řádek ovladatelný i z klávesnice */
function keyable(el) {
  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  el.onkeydown = e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
  };
}

/* ---------------- den / noc ---------------- */

const THEME_KEY = 'pues-theme';
const sysDark = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
const storedTheme = () => { try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; } };

function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = t === 'dark' ? '#191412' : '#C60B1E';
  const btn = $('#theme-toggle');
  if (btn) {
    const lbl = t === 'dark' ? 'Přepnout na světlý režim' : 'Přepnout na tmavý režim';
    btn.setAttribute('aria-label', lbl);
    btn.title = lbl;
  }
}

if (sysDark) sysDark.addEventListener('change', () => {
  if (!storedTheme()) applyTheme(sysDark.matches ? 'dark' : 'light');
});

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
    <p class="muted">Každé ráno čerstvé. Tapnutím na zprávu rozbalíš češtinu.</p>
    ${'speechSynthesis' in window ? '<p style="margin:2px 0 10px"><button class="tts-btn" id="escuchar-todo">🎧 Escuchar todo</button></p>' : ''}`;

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
        <button class="tts-mini" title="Escuchar" aria-label="Přečíst španělsky">🔊</button>
        <div class="digest-text">
          <p class="testo" lang="es">${esc(n.es)}</p>
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
      <p class="testo" lang="es">${esc(daily.article.es)}</p>
      <button class="tts-btn" id="art-tts">🔊 Escuchar</button>
      <button class="cz-toggle" id="art-cz">🇨🇿 česky</button>
      <div class="cz-text hidden">${esc(daily.article.cz)}</div>
    </div>`;
  }

  html += `<p class="fonte">Zdroje: <a href="${esc(daily.sourceUrl)}">Wikipedia</a> (CC BY-SA) · <a href="https://ec.europa.eu/commission/presscorner/">Evropská komise</a>${daily.stories.some(s => s.origin === 'guardian') ? ' · <a href="https://www.theguardian.com/">The Guardian</a> (Open Platform)' : ''} · překlad ${esc(daily.translator || 'automatický')}</p>
    <p style="text-align:center;margin-top:14px"><a href="#" id="archivo-link">📚 Archivo — días anteriores</a></p>`;

  el.innerHTML = html;

  el.querySelectorAll('.digest-item').forEach(row => {
    const n = groups[+row.dataset.g].items[+row.dataset.i];
    row.querySelector('.tts-mini').onclick = e => { e.stopPropagation(); speak(n.es); };
    row.onclick = () => {
      row.querySelector('.cz-line').classList.toggle('hidden');
      row.classList.toggle('open');
    };
    keyable(row);
  });
  const todo = $('#escuchar-todo');
  if (todo) todo.onclick = () => {
    const items = groups.flatMap(g => g.items.map(n => n.es));
    if (daily.article) items.push(...splitSentences(daily.article.es));
    playerStart(items, 'Noticias');
  };
  if (daily.article) {
    const artToggle = () => el.querySelector('.article .cz-text').classList.toggle('hidden');
    el.querySelector('.article').onclick = artToggle;
    $('#art-tts').onclick = e => { e.stopPropagation(); speak(daily.article.es); };
    $('#art-cz').onclick = e => { e.stopPropagation(); artToggle(); };
  }
  $('#archivo-link').onclick = e => { e.preventDefault(); show('archivo'); };
}

/* ---------------- Archivo (historie denních zpráv) ---------------- */

const ARCHIVE_PAGE_SIZE = 14;
let archivoPage = 0;

async function renderArchivo(el) {
  let index = [];
  try { index = await fetchJson('data/news/archive/index.json', { cache: 'no-cache' }); } catch (e) { /* archiv zatím prázdný */ }
  index.sort((a, b) => b.date.localeCompare(a.date));

  if (!index.length) {
    el.innerHTML = `
      <h2>Archivo</h2>
      <p class="muted"><a href="#" id="archivo-back">← Noticias</a></p>
      <div class="card"><p class="muted">Archiv se teprve začíná plnit. Vrať se zítra.</p></div>`;
    $('#archivo-back').onclick = e => { e.preventDefault(); show('noticias'); };
    return;
  }

  const pages = Math.ceil(index.length / ARCHIVE_PAGE_SIZE);
  archivoPage = Math.min(Math.max(archivoPage, 0), pages - 1);
  const slice = index.slice(archivoPage * ARCHIVE_PAGE_SIZE, (archivoPage + 1) * ARCHIVE_PAGE_SIZE);

  let html = `
    <h2>Archivo</h2>
    <p class="muted"><a href="#" id="archivo-back">← Noticias</a> · ${index.length} dní, stránka ${archivoPage + 1}/${pages}</p>
    <div class="card" style="padding:4px 2px" id="archivo-list">`;
  for (const d of slice) {
    html += `
      <div class="archivo-day" data-date="${d.date}">
        <span class="fecha">${esc(d.date)}</span>
        <span class="count">${d.count} zpráv</span>
      </div>
      <div class="archivo-day-content hidden" data-date-content="${d.date}"></div>`;
  }
  html += `</div>
    <div class="btn-row">
      <button class="btn" id="archivo-prev" ${archivoPage <= 0 ? 'disabled' : ''}>← Novější</button>
      <button class="btn" id="archivo-next" ${archivoPage >= pages - 1 ? 'disabled' : ''}>Starší →</button>
    </div>`;

  el.innerHTML = html;
  $('#archivo-back').onclick = e => { e.preventDefault(); show('noticias'); };
  $('#archivo-prev').onclick = () => { archivoPage--; renderArchivo(el); };
  $('#archivo-next').onclick = () => { archivoPage++; renderArchivo(el); };

  el.querySelectorAll('.archivo-day').forEach(row => {
    keyable(row);
    row.onclick = async () => {
      const date = row.dataset.date;
      const content = el.querySelector(`[data-date-content="${date}"]`);
      const isOpen = !content.classList.contains('hidden');
      el.querySelectorAll('.archivo-day-content').forEach(c => c.classList.add('hidden'));
      if (isOpen) return;
      content.classList.remove('hidden');
      if (!content.dataset.loaded) {
        content.innerHTML = '<p class="muted" style="padding:8px">Cargando…</p>';
        try {
          const day = await fetchJson(`data/news/archive/${date}.json`);
          let dh = 'speechSynthesis' in window
            ? `<p style="margin:4px 0 2px"><button class="tts-btn" data-day-play>🎧 Escuchar todo</button></p>` : '';
          day.stories.forEach((n, i) => {
            dh += `
            <div class="digest-item archivo-item" data-idx="${i}">
              <button class="tts-mini" title="Escuchar" aria-label="Přečíst španělsky">🔊</button>
              <div class="digest-text">
                <p class="testo" lang="es">${esc(n.es)}</p>
                <p class="cz-line hidden">${esc(n.cz)}</p>
              </div>
              <span class="chev" aria-hidden="true">🇨🇿</span>
            </div>`;
          });
          if (day.article) {
            dh += `
            <div class="card article" style="margin-top:8px">
              <h3>A fondo</h3>
              <p class="testo" lang="es">${esc(day.article.es)}</p>
              <button class="tts-btn" data-art-tts>🔊 Escuchar</button>
              <button class="cz-toggle" data-art-cz>🇨🇿 česky</button>
              <div class="cz-text hidden">${esc(day.article.cz)}</div>
            </div>`;
          }
          content.innerHTML = dh;
          content.dataset.loaded = '1';
          content.querySelectorAll('.archivo-item').forEach(row2 => {
            const n = day.stories[+row2.dataset.idx];
            row2.querySelector('.tts-mini').onclick = e => { e.stopPropagation(); speak(n.es); };
            row2.onclick = () => row2.querySelector('.cz-line').classList.toggle('hidden');
            keyable(row2);
          });
          const dayPlay = content.querySelector('[data-day-play]');
          if (dayPlay) dayPlay.onclick = e => {
            e.stopPropagation();
            const items = day.stories.map(n => n.es);
            if (day.article) items.push(...splitSentences(day.article.es));
            playerStart(items, date);
          };
          const artBox = content.querySelector('.article');
          if (artBox) {
            const toggle = () => artBox.querySelector('.cz-text').classList.toggle('hidden');
            artBox.onclick = toggle;
            artBox.querySelector('[data-art-tts]').onclick = e => { e.stopPropagation(); speak(day.article.es); };
            artBox.querySelector('[data-art-cz]').onclick = e => { e.stopPropagation(); toggle(); };
          }
        } catch (e) {
          content.innerHTML = `<p class="muted" style="padding:8px">Nepodařilo se načíst.</p>`;
        }
      }
    };
  });
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
    await show(currentView);
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
toTop.onclick = () => window.scrollTo({
  top: 0,
  behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
});

/* ---------------- router (noticias + archivo, bez tabbaru) ---------------- */

const views = { noticias: renderNoticias, archivo: renderArchivo };
let currentView = 'noticias';

function viewFromHash() {
  const v = (location.hash || '').replace(/^#\/?/, '');
  return views[v] ? v : 'noticias';
}

async function show(view) {
  currentView = view;
  if (viewFromHash() !== view) location.hash = view === 'noticias' ? '' : view;
  const el = $('#main');
  el.innerHTML = '<p class="muted" style="padding:20px">Cargando…</p>';
  try {
    await views[view](el);
  } catch (e) {
    el.innerHTML = `<div class="card"><strong>Chyba načítání dat</strong><p class="muted">${esc(e.message)}</p></div>`;
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', () => {
  const v = viewFromHash();
  if (v !== currentView) show(v);
});

/* ---------------- init ---------------- */

(async function init() {
  $('#footer-version').textContent = 'v' + APP_VERSION;
  applyTheme(document.documentElement.dataset.theme || (sysDark && sysDark.matches ? 'dark' : 'light'));
  $('#theme-toggle').onclick = () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(THEME_KEY, next); } catch (e) { }
    applyTheme(next);
  };
  initPlayerControls();
  show(viewFromHash());
  checkVersion();
})();
