# ¡pues! architektura

> Název aplikace se píše vždy `¡pues!` (s vykřičníkem obráceným i normálním) v kódu, UI i dokumentaci.
> Statická web app pro učení španělštiny (čeština L1). Jen denní zprávy — žádné lekce, slovíčka ani progress.
> Repo: `github.com/tomekson/pues` · Web: `https://tomekson.github.io/pues/`
> Sesterský projekt: [[project-allora]] (italština) — sdílí architekturu pipeline 1 ("Notizie del giorno"),
> ale ¡pues! se **zastavuje tam, kde allora teprve začíná růst** (viz níže "Co záměrně chybí").

## Principy

1. **Žádná databáze, žádný backend.** Denní zprávy = JSON commitnutý v repu, servírovaný GitHub Pages.
2. **Nula AI tokenů, natrvalo.** Celá pipeline (fetch, filtr, překlad, TTS) běží bez Claude/AI — jen GitHub
   Actions + free translation API. Na rozdíl od allory tu není žádná "pipeline 2" (Claude Code enrichment):
   ¡pues! nemá lekce ani sessions, které by šlo obohacovat, takže žádná AI vrstva není potřeba vůbec.
3. **Free tier všeho.** GitHub Pages + GitHub Actions (public repo = zdarma), DeepL API Free (1M znaků/měsíc)
   s automatickým fallbackem na MyMemory, browser TTS (Web Speech API).
4. **Jen pro Tomka.** Žádný auth, žádný localStorage, žádný progress — appka nemá co ukládat.

## Vrstvy

```
┌─────────────────────────────────────────────────────────┐
│ 1. SBĚR + PŘEKLAD (GitHub Actions cron, denně, 0 tokenů)│
│    Wikipedia (svět+CZ+EU+kuriozity) → DeepL/MyMemory    │
│    → data/news/daily.json                                │
├─────────────────────────────────────────────────────────┤
│ 2. APP (statická PWA na Pages, 0 tokenů)                 │
│    jediná obrazovka: čtečka zpráv, tap-to-translate,     │
│    TTS (Web Speech API, es-ES)                            │
└─────────────────────────────────────────────────────────┘
```

Žádná třetí vrstva. allora měla "Pipeline 2 — AI obohacení" (Claude Code generuje lekce/sessions) —
¡pues! ji nemá, protože nemá co obohacovat.

## Co záměrně chybí (a proč)

Postaveno podle allory, ale se zadáním "ani 12 lekcí, ani slovíčka, asi ani progress — jen denní zprávy
s překladem a audiem". Než něco z tohoto přidávat zpátky, přečti si, co bylo v allora a proč tady chybí:

| Co v allora existuje | Proč to ¡pues! nemá |
|---|---|
| 12 lekcí (`viaggio`/`tappa`, `curriculum.json`) | Explicitně vyloučeno zadáním |
| SRS slovíčka (`vocab.json`, SM-2 flashcards) | Explicitně vyloučeno zadáním |
| Progress dashboard (streak, export/import) | Appka nic neukládá — bez lekcí/slovíček není co trackovat |
| Roleplay (copy-paste prompt do claude.ai voice) | Vázáno na týdenní téma lekce, které tu není |
| Shadow věta dne + rule-based fonetický přepis | Šlo o výslovnostní drill navázaný na lekce (Pronuncia), navíc pravidla přepisu byla psaná pro italskou ortografii — pro španělštinu by šlo znovu odvodit (je pravidelnější než italština), ale je to nad rámec "jen zprávy s překladem a audiem" |
| Vícejazyčné úrovně A1/A2/B1 u textů | Existovaly jen u lekcí (session JSON); denní zprávy v allora už dnes běží na jedné úrovni — ¡pues! přebírá stejně jednoúrovňový model |
| Tabbar / více obrazovek | Jediná obrazovka nahrazuje 5 tabů — nemá smysl routovat mezi tím, co neexistuje |
| `/pues` slash-command skill | allora má `/allora` protože denně generuje AI lekce (Pipeline 2). ¡pues! nic negeneruje interaktivně — vše automatizuje cron, appka je čistě pasivní čtečka |

Pokud se v budoucnu ukáže, že něco z tohoto přece jen chybí, přidávej to vědomě — ne proto, že to "allora
taky má".

## Datový model

```
data/
├── news/
│   ├── daily.json         ← denní fetch+překlad (Actions), přepisuje se každý den
│   │   {date, source, sourceUrl, translator,
│   │    stories: [{es, cz, origin: cz|eu|world|dyk|guardian, en?}],
│   │    article: {topic, url, en, es, cz} | null}
│   └── archive/           ← trvalá historie, nikdy se nepřepisuje
│       ├── index.json     ← [{date, count}], nejnovější první
│       └── <YYYY-MM-DD>.json  ← {date, stories, article} — stejný tvar jako daily.json
└── news-filter.json       ← editovatelný filtr témat (block/prefer), stejný formát jako allora
```

## Pipeline — denní zprávy

GitHub Actions workflow `.github/workflows/fetch-news.yml` + `scripts/fetch-news.mjs`:

- **cron denně 04:30 UTC** (~06:30 Prahy) + **záložní 07:00 UTC** (GitHub scheduled runs mívají
  hodiny zpoždění) + `workflow_dispatch` pro ruční spuštění
- Zdroje (stejné jako allora, jen cílový jazyk ES místo IT):
  - **Wikipedia Portal:Current_events** (EN, CC BY-SA) — světové zprávy, filtr `data/news-filter.json`
    (blokuje válku/konflikty/sport, preferuje ekonomiku/EU/tech/Španělsko)
  - **cs.wikipedia Portál:Aktuality** (CZ, CC BY-SA) — české zprávy
  - **Evropská komise presscorner RSS** (`?language=es` a `?language=cs`) — tiskové zprávy s
    **oficiálním** překladem do španělštiny a češtiny, DeepL/MyMemory jen jako fallback pro
    nepřeložené položky
  - **The Guardian Open Platform** (`content.guardianapis.com`, sekce business/technology/money) —
    volitelný `GUARDIAN_API_KEY` repo secret; bez klíče se zdroj potichu přeskočí, pipeline nespadne.
    Sekce v appce "Prensa"
  - **Wikipedia "Did you know"** (EN) — denní pozitivní kuriozita, sekce "¿Sabías qué?"
  - Approfondimento → **"A fondo"**: úvod wiki článku k první zprávě, která má přiřazené téma
- Filtr témat `data/news-filter.json`: blokuje válku/konflikty/sport/katastrofy a nehody (sekce i
  klíčová slova EN+CZ), preferuje ekonomiku/EU/tech/Španělsko — platí pro všechny zdroje kromě EU
  (tam se blokuje jen `block`, ne sekce) a Guardian
- Překlad: **DeepL API Free** (`DEEPL_API_KEY` repo secret), auto-fallback na **MyMemory** bez klíče
  nebo při chybě/limitu — pipeline nikdy nespadne, jen změní `translator` pole ve výstupu
- Archiv: po zápisu `daily.json` se stejná data uloží i do `data/news/archive/<datum>.json` a
  upsertnou do `archive/index.json` — `daily.json` se dál přepisuje denně, archiv ne
- Commit z workflow zároveň drží scheduled cron naživu (60denní auto-disable při neaktivitě repa)

## App (statická PWA, dva pohledy: Noticias + Archivo)

Minimální hash router (`views`/`show()`/`viewFromHash()` v `app.js`) — žádný tabbar, **Archivo** je
dostupné jen přes odkaz na konci Noticias, ne přes menu (appka menu vůbec nemá):

- **Desde Chequia** / **Prensa** / **Desde el mundo** / **Desde la Unión Europea** / **¿Sabías qué?** —
  skupiny denních zpráv (v tomto pořadí), tap na položku rozbalí českou verzi (`cz-line`), 🔊 tlačítko
  přehraje španělský text
- **A fondo** — delší článek k dnešnímu tématu, stejné tap-to-translate + TTS
- **Archivo** (`#archivo`) — historie dnů z `archive/index.json`, stránkovaná po 14, kliknutím na den
  se lazy-loadne `archive/<datum>.json` a zprávy se zobrazí stejným stylem (tap-to-translate + TTS)
- **TTS:** `speechSynthesis`, `lang: es-ES`, hlas preferuje `es-ES` variantu před ostatními `es-*`
  (viz `pickVoice()` v `app.js`). iOS: `speak()` musí běžet z tap handleru (WebKit), jinak potichu selže.
- **Escucha** — plovoucí přehrávač (fronta vět): „🎧 Escuchar todo" v Noticias i u rozbaleného dne
  v Archivu, play/pauza, další věta, rychlost 0.7/0.85/1.0×. Jednotlivé 🔊 má přednost — zastaví frontu.
  Pruh na přehrávači = bandera 1:2:1 (stejně jako lišta nahoře).
- **Noche (tmavý režim)** — přepínač v hlavičce, klíč `localStorage: pues-theme`, výchozí podle
  `prefers-color-scheme` (a sleduje jeho změny, dokud uživatel ručně nepřepne). Inline bootstrap
  skript v `<head>` nastaví `data-theme` před CSS (žádný flash), přepíná i `meta theme-color`.
- **Desktop + mobil:** hover stavy jen `@media (hover: hover)`, větší dotykové plochy
  `@media (pointer: coarse)`; řádky zpráv a dnů ovladatelné klávesnicí (`role=button`, Enter/mezerník),
  španělský text má `lang="es"` (screen readery, správná výslovnost)
- Update banner (`version.json` polling), pull-to-refresh, scroll-to-top, offline cache přes `sw.js` —
  převzato z allory beze změny (infrastruktura, ne "lekce/slovíčka/progress", takže v rámci zadání OK)

## Barevná paleta — teorie barev

Španělská vlajka: **rojo** `#C60B1E` (pruhy 1:2:1) a **amarillo/gualda** `#FFC400`. Doplňková barva
zvolená stejnou logikou jako u allory (azzurro k zeleno-bílo-červené): komplementární barva na
barevném kole k dominantní `rojo` (odstín ~355°) leží kolem ~175° — **turquesa** `#0E7D73`. Zvolena
schválně jiná barva než allořino azzurro (modrá), aby byly appky vizuálně odlišitelné, přestože sdílí
stejnou typografickou kostru (serif wordmark, systémový sans obsah).

- `--rojo` / `--rojo-oscuro` — primární akcent, tlačítka, nadpisy
- `--amarillo` — jen na tmavém podkladu (ikona, bandera pruh) — na krémovém pozadí má nedostatečný kontrast pro text
- `--turquesa` — doplňkový akcent: odkazy, cz-line border, cz-toggle text
- `--crema` / `--papel` / `--tinta` / `--gris` / `--linea` — pozadí, karty, text, šedá, linky (paralelní k allořině latte/carta/inchiostro/grigio/linea)

**Noche (dark) varianta** (`[data-theme=dark]` v `style.css`): teplý tmavý inkoust odvozený z tinty
(`--crema: #191412`, `--papel: #241D1A`, `--tinta: #F2E9DC`), rojo a turquesa zesvětlené kvůli kontrastu
(`#D9434E` / `#F0908E` / `#3FB8AA`), `--amarillo` beze změny — právě na tmavém podkladu funguje
(viz poznámka výše). Bandera zůstává v obou režimech.

## Verzování a deploy (převzato z allory)

- 3 soubory synchronně: `index.html` (`APP_VERSION`), `sw.js` (`CACHE = 'pues-vX.XX'`), `version.json`
- +0.01 drobnost · +0.10 menší UI změna · +1.00 nová funkce — velikost určuje Tomek
- Update banner uvnitř PWA přes `visibilitychange` + `version.json`
- Deploy = push na `main`, GitHub Pages servíruje root

## Struktura repa

```
pues/
├── index.html          ← celá SPA (Noticias + Archivo, hash router)
├── app.js / style.css
├── sw.js                ← service worker (offline cache)
├── manifest.json         ← PWA manifest
├── version.json
├── icon.svg / icon-180.png / icon-512.png
├── data/
│   ├── news/daily.json
│   ├── news/archive/    ← trvalá historie (index.json + <datum>.json)
│   └── news-filter.json
├── scripts/
│   └── fetch-news.mjs   ← Wikipedia+EU+Guardian → DeepL/MyMemory → JSON (běží v Actions)
├── .github/workflows/fetch-news.yml
├── CLAUDE.md            ← instrukce pro Opus/Sonnet
└── ARCHITECTURE.md      ← tento soubor
```
