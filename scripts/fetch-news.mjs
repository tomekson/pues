/* ¡pues! — denní zprávy: Wikipedia Current events (CC BY-SA) → DeepL (EN→ES, EN→CS) → data/news/daily.json
   Běží v GitHub Actions (Node 20+, bez závislostí). Bez DEEPL_API_KEY jen vypíše, co by přeložil. */
'use strict';

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';

const STORIES_MAX = 5;
const KEY = process.env.DEEPL_API_KEY || '';

/* ---- filtr témat (data/news-filter.json, editovatelný bez zásahu do kódu) ---- */
const FILTER = JSON.parse(readFileSync('data/news-filter.json', 'utf8'));
const anyMatch = (patterns, text) => patterns.some(p => new RegExp(p, 'i').test(text));
const isBlocked = item =>
  anyMatch(FILTER.block, item.text) ||
  (item.section && anyMatch(FILTER.blockSections, item.section));
const scoreOf = item => {
  let s = FILTER.prefer.filter(p => new RegExp(p, 'i').test(item.text)).length;
  if (item.section && anyMatch(FILTER.preferSections, item.section)) s += 1;
  return s;
};

/* datum v Praze */
const now = new Date();
const prahaFmt = t => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).format(t); // YYYY-MM-DD
const praha = prahaFmt(now);
const vcera = prahaFmt(new Date(now.getTime() - 86400000));
const [y] = praha.split('-').map(Number);
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function pageFor(dateStr) {
  const [yy, mm, dd] = dateStr.split('-').map(Number);
  return `Portal:Current_events/${yy}_${MONTHS[mm - 1]}_${dd}`;
}
const page = pageFor(praha);

/* ---- pomocné ---- */
function cleanWiki(s) {
  return s
    .replace(/\[https?:\/\/[^\]]*\]/g, '')        // externí odkazy [url (Zdroj)]
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')  // [[cíl|text]] → text
    .replace(/\[\[([^\]]*)\]\]/g, '$1')           // [[text]] → text
    .replace(/'''?/g, '')                         // tučné/kurzíva
    .replace(/\{\{[^}]*\}\}/g, '')                // šablony
    .replace(/<[^>]*>/g, '')                      // html komentáře/tagy
    .replace(/\s+/g, ' ')
    .trim();
}

/* ---- 1+2. světové zprávy: dnešní stránka, doplněná ze včerejška ---- */
async function fetchWorld(dateStr) {
  const p = pageFor(dateStr);
  const api = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(p)}&format=json&prop=wikitext&formatversion=2`;
  const res = await fetch(api, { headers: { 'User-Agent': 'pues-news/1.0 (personal learning app; github.com/tomekson/pues)' } });
  const body = await res.json();
  if (body.error) {
    console.log(`Stránka ${p} zatím neexistuje (${body.error.code}).`);
    return [];
  }
  const items = [];
  let lastTopic = null; // článek události z nadřazené odrážky (pro Approfondimento)
  let section = null;   // '''Armed conflicts and attacks''' apod.
  for (const line of body.parse.wikitext.split('\n')) {
    const sm = line.match(/^'''(.+?)'''/);
    if (sm) { section = sm[1]; lastTopic = null; continue; }
    if (!/^\*+\s*\S/.test(line)) continue;
    const text = cleanWiki(line.replace(/^\*+/, ''));
    const isSentence = text.length >= 60 && /[.!?]$/.test(text);
    if (!isSentence) {
      const lm = line.match(/^\*+\s*\[\[([^\]|]+)/);
      if (lm) lastTopic = lm[1].trim();
      continue;
    }
    items.push({ text, topic: lastTopic, section });
  }
  return items;
}

/* dnešek + včerejšek → filtr → řazení podle preferencí */
const poolToday = await fetchWorld(praha);
const poolYesterday = await fetchWorld(vcera);
const seen = new Set();
const pool = [];
for (const it of [...poolToday, ...poolYesterday]) {
  if (seen.has(it.text)) continue;
  seen.add(it.text);
  pool.push(it);
}
const blockedCount = pool.filter(isBlocked).length;
const stories = pool
  .filter(it => !isBlocked(it))
  .map((it, i) => ({ ...it, score: scoreOf(it), order: i }))
  .sort((a, b) => b.score - a.score || a.order - b.order)
  .slice(0, STORIES_MAX);
console.log(`Světový pool: ${pool.length} zpráv, ${blockedCount} odfiltrováno (konflikty/sport), vybráno ${stories.length} podle preferencí.`);

/* ---- 2b. české zprávy: cs.wikipedia Portál:Aktuality (CC BY-SA) ---- */
const CZ_MAX = 4;
const CZ_MONTHS = { ledna: 1, 'února': 2, 'března': 3, dubna: 4, 'května': 5, 'června': 6, 'července': 7, srpna: 8, 'září': 9, 'října': 10, listopadu: 11, prosince: 12 };

async function fetchCzAktuality() {
  const url = 'https://cs.wikipedia.org/w/api.php?action=parse&page=' +
    encodeURIComponent('Portál:Aktuality/vlastní text') + '&format=json&prop=wikitext&formatversion=2';
  const r = await fetch(url, { headers: { 'User-Agent': 'pues-news/1.0 (personal learning app; github.com/tomekson/pues)' } });
  const j = await r.json();
  if (!j.parse) return [];
  const items = [];
  let day = null;
  for (const line of j.parse.wikitext.split('\n')) {
    const dm = line.match(/^;\s*\[\[\s*\d+\.\s*[^|]+\|\s*(\d+)\.\s*([a-zěščřžýáíéůú]+)\s*\]\]/i);
    if (dm && CZ_MONTHS[dm[2].toLowerCase()]) {
      day = `${y}-${String(CZ_MONTHS[dm[2].toLowerCase()]).padStart(2, '0')}-${String(+dm[1]).padStart(2, '0')}`;
      continue;
    }
    const tm = line.match(/^\s*\|\s*text\s*=\s*(.+)$/);
    if (tm && day) {
      const text = cleanWiki(tm[1].replace(/<ref[\s\S]*$/, ''));
      if (text.length >= 40) items.push({ date: day, text });
    }
  }
  // jen poslední 3 dny; nejnovější napřed
  items.sort((a, b) => b.date.localeCompare(a.date));
  const cutoff = new Date(`${praha}T00:00:00Z`).getTime() - 3 * 86400000;
  return items.filter(i => new Date(i.date + 'T00:00:00Z').getTime() >= cutoff);
}

/* ---- 2c2. Desde la UE — tiskové zprávy Evropské komise s OFICIÁLNÍMI překlady (ES/CS feedy) ---- */
const EU_UA = { headers: { 'User-Agent': 'pues-news/1.0 (personal learning app; github.com/tomekson/pues)' } };

function parseRss(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => {
    const g = re => ((m[1].match(re) || [])[1] || '').trim();
    return { title: g(/<title>([\s\S]*?)<\/title>/), desc: g(/<description>([\s\S]*?)<\/description>/), link: g(/<link>([\s\S]*?)<\/link>/) };
  });
}

function euText(title, desc) {
  const d = desc
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/^.{0,90}?\d{1,2}[.\s]+[\wěščřžýáíéůú]+[.\s]+\d{4}\s*/i, '') // úvodní boilerplate s datem
    .replace(/\s+/g, ' ').trim();
  let text = title.replace(/[.!?]$/, '') + '. ' + d;
  if (text.length > 320) {
    const cut = text.slice(0, 320);
    text = cut.slice(0, Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.')) + 1) || cut;
  }
  return text;
}

const docId = link => (link.match(/detail\/[a-z]{2}\/([a-z]+_\d+_\d+)/) || [])[1] || null;
const isOfficial = (link, lang) => link.includes(`/detail/${lang}/`);

async function fetchEu() {
  try {
    const [en, esF, csF] = await Promise.all(['en', 'es', 'cs'].map(async l => {
      const r = await fetch(`https://ec.europa.eu/commission/presscorner/api/rss?language=${l}`, EU_UA);
      return parseRss(await r.text());
    }));
    const byId = (list, lang) => Object.fromEntries(list.filter(x => isOfficial(x.link, lang)).map(x => [docId(x.link), x]));
    const esMap = byId(esF, 'es');
    const csMap = byId(csF, 'cs');
    const cands = [];
    en.forEach((item, order) => {
      const id = docId(item.link);
      if (!id || /^mex_/.test(id) || /^Daily News/i.test(item.title)) return; // denní agregát přeskočit
      const enText = euText(item.title, item.desc);
      if (anyMatch(FILTER.block, enText)) return;
      cands.push({
        order,
        pressRelease: /^ip_/.test(id),
        en: enText,
        es: esMap[id] ? euText(esMap[id].title, esMap[id].desc) : null,
        cz: csMap[id] ? euText(csMap[id].title, csMap[id].desc) : null,
      });
    });
    // přednost: oficiálně přeložené, pak tiskové zprávy, pak pořadí ve feedu
    cands.sort((a, b) =>
      ((b.es && b.cz) ? 1 : 0) - ((a.es && a.cz) ? 1 : 0) ||
      (b.pressRelease ? 1 : 0) - (a.pressRelease ? 1 : 0) ||
      a.order - b.order);
    return cands.slice(0, 3);
  } catch (e) {
    console.log('EU RSS selhal:', e.message);
    return [];
  }
}

const euRaw = await fetchEu();
const euOfficial = euRaw.filter(e => e.es && e.cz).length;
console.log(`Desde la UE: ${euRaw.length} zpráv, z toho ${euOfficial} s oficiálním překladem ES+CS.`);

/* ---- 2d. ¿Sabías qué? — Did you know z Wikipedie (CC BY-SA), pozitivní kuriozity ---- */
async function fetchDyk() {
  const u = 'https://en.wikipedia.org/w/api.php?action=parse&page=' + encodeURIComponent('Template:Did you know') + '&format=json&prop=wikitext&formatversion=2';
  const r = await fetch(u, { headers: { 'User-Agent': 'pues-news/1.0 (personal learning app; github.com/tomekson/pues)' } });
  const j = await r.json();
  if (!j.parse) return [];
  const out = [];
  for (const line of j.parse.wikitext.split('\n')) {
    if (!/^\*\s*\.\.\.\s*that/i.test(line.trim())) continue;
    let text = cleanWiki(line.replace(/^\*\s*/, '')).replace(/^\.\.\.\s*that\s+/i, '').replace(/\(pictured[^)]*\)\s*/i, '');
    if (!/\?$/.test(text) || text.length < 50 || text.length > 220) continue;
    text = 'Did you know that ' + text;
    if (anyMatch(FILTER.block, text)) continue;
    out.push(text);
    if (out.length >= 2) break;
  }
  return out;
}
const dykItems = await fetchDyk();
console.log(`¿Sabías qué?: ${dykItems.length} kuriozity.`);

const czPool = await fetchCzAktuality();
const czItems = czPool
  .filter(i => !anyMatch(FILTER.block, i.text))
  .map((i, idx) => ({ ...i, score: FILTER.prefer.filter(p => new RegExp(p, 'i').test(i.text)).length, order: idx }))
  .sort((a, b) => b.score - a.score || a.order - b.order)
  .slice(0, CZ_MAX);
console.log(`Český pool: ${czPool.length} zpráv, ${czPool.filter(i => anyMatch(FILTER.block, i.text)).length} odfiltrováno, vybráno ${czItems.length}.`);

/* ---- 2c. Reportaje: úvod wiki článku k první události s tématem ---- */
async function fetchExtract(title) {
  const u = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&titles=${encodeURIComponent(title)}&format=json&formatversion=2&redirects=1`;
  const r = await fetch(u, { headers: { 'User-Agent': 'pues-news/1.0 (personal learning app; github.com/tomekson/pues)' } });
  const j = await r.json();
  const p = j.query && j.query.pages && j.query.pages[0];
  return p && !p.missing ? (p.extract || '').trim() : '';
}

let article = null;
const seenTopics = new Set();
for (const s of stories) {
  if (!s.topic || seenTopics.has(s.topic)) continue;
  seenTopics.add(s.topic);
  let extract = await fetchExtract(s.topic);
  if (extract.length > 800) {
    const cut = extract.slice(0, 800);
    extract = cut.slice(0, Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.')) + 1) || cut;
  }
  if (extract.length >= 250) { article = { topic: s.topic, en: extract }; break; }
}

if (!stories.length && !czItems.length) {
  console.log('Žádné položky k překladu, končím.');
  process.exit(0);
}
console.log(`Nalezeno ${stories.length} světových zpráv (${page}) + ${czItems.length} českých (Portál:Aktuality)${article ? ` + reportaje: ${article.topic}` : ''}:`);
stories.forEach((s, i) => console.log(`  W${i + 1}. [${s.score}b|${s.section || '?'}] ${s.text.slice(0, 90)}…`));
czItems.forEach((s, i) => console.log(`  CZ${i + 1}. [${s.score}b|${s.date}] ${s.text.slice(0, 90)}…`));

if (process.env.DRY_RUN) {
  console.log('DRY_RUN: končím před překladem, nic nezapisuji.');
  process.exit(0);
}

/* ---- 3. překlad: DeepL (pokud je klíč), jinak/při selhání MyMemory ---- */
const endpoint = KEY.endsWith(':fx') ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate';
let engine = KEY ? 'DeepL' : 'MyMemory';

async function deepl(texts, source, target) {
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: texts, source_lang: source, target_lang: target }),
  });
  if (!r.ok) throw new Error(`DeepL ${source}→${target}: HTTP ${r.status} ${await r.text()}`);
  const j = await r.json();
  return j.translations.map(t => t.text);
}

/* MyMemory bere max ~500 znaků na dotaz → delší texty dělíme po větách */
function sentenceChunks(text, max = 440) {
  const parts = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [text];
  const chunks = [];
  let cur = '';
  for (const p of parts) {
    if ((cur + p).length > max && cur) { chunks.push(cur.trim()); cur = p; }
    else cur += p;
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

async function myMemory(text, source, target) {
  const out = [];
  for (const chunk of sentenceChunks(text)) {
    const u = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=${source.toLowerCase()}|${target.toLowerCase()}`;
    const r = await fetch(u);
    const j = await r.json();
    if (!j.responseData || j.responseStatus !== 200) throw new Error(`MyMemory ${source}→${target}: ${JSON.stringify(j.responseStatus)} ${j.responseDetails || ''}`);
    out.push(j.responseData.translatedText);
  }
  return out.join(' ');
}

async function translate(texts, source, target) {
  if (!texts.length) return [];
  if (KEY) {
    try {
      return await deepl(texts, source, target);
    } catch (e) {
      console.log(`DeepL selhal (${e.message.slice(0, 120)}), přepínám na MyMemory.`);
      engine = 'MyMemory (DeepL fallback)';
    }
  }
  const out = [];
  for (const t of texts) out.push(await myMemory(t, source, target));
  return out;
}

const worldTexts = stories.map(s => s.text);
const euNeedEs = euRaw.filter(e => !e.es).map(e => e.en);
const euNeedCz = euRaw.filter(e => !e.cz).map(e => e.en);
const [es, cz, czEs, artEs, artCz, dykEs, dykCz, euEsMt, euCzMt] = await Promise.all([
  translate(worldTexts, 'EN', 'ES'),
  translate(worldTexts, 'EN', 'CS'),
  translate(czItems.map(i => i.text), 'CS', 'ES'),
  translate(article ? [article.en] : [], 'EN', 'ES'),
  translate(article ? [article.en] : [], 'EN', 'CS'),
  translate(dykItems, 'EN', 'ES'),
  translate(dykItems, 'EN', 'CS'),
  translate(euNeedEs, 'EN', 'ES'),
  translate(euNeedCz, 'EN', 'CS'),
]);
let esIdx = 0, czIdx = 0;
const euItems = euRaw.map(e => ({
  en: e.en,
  es: e.es || euEsMt[esIdx++],
  cz: e.cz || euCzMt[czIdx++],
}));

/* ---- 4. zapiš JSON — české zprávy napřed ---- */
const out = {
  date: praha,
  source: 'Wikipedia: Portál:Aktuality + Portal:Current events (CC BY-SA 4.0)',
  sourceUrl: `https://en.wikipedia.org/wiki/${page.replaceAll(' ', '_')}`,
  translator: engine,
  stories: [
    ...czItems.map((item, i) => ({ es: czEs[i], cz: item.text, origin: 'cz' })),
    ...euItems.map(e => ({ en: e.en, es: e.es, cz: e.cz, origin: 'eu' })),
    ...stories.map((s, i) => ({ en: s.text, es: es[i], cz: cz[i], origin: 'world' })),
    ...dykItems.map((en, i) => ({ en, es: dykEs[i], cz: dykCz[i], origin: 'dyk' })),
  ],
  article: article ? {
    topic: article.topic,
    url: `https://en.wikipedia.org/wiki/${article.topic.replaceAll(' ', '_')}`,
    en: article.en,
    es: artEs[0],
    cz: artCz[0],
  } : null,
};

mkdirSync('data/news', { recursive: true });
writeFileSync('data/news/daily.json', JSON.stringify(out, null, 2) + '\n');
console.log(`Zapsáno data/news/daily.json (${out.stories.length} zpráv, ${praha}).`);
