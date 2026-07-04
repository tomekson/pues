# ¡pues! (Spanish Learning Project — News Only)

## Pravidlo názvu

Projekt se jmenuje **`¡pues!`** a píše se VŽDY přesně takto (obrácený vykřičník + malá písmena + vykřičník),
napříč kódem, UI texty i dokumentací. Nikdy "Pues", nikdy bez vykřičníků (výjimka: technické identifikátory
jako název repa `pues`, složky, cache klíče `pues-vX.XX`).

## Rozsah projektu — jen denní zprávy

¡pues! je **záměrně minimální** sesterský projekt k [[project-allora]] (italština). Obsahuje jen jedinou
funkci: denní zprávy španělsky s tap-to-translate do češtiny a TTS přehráváním. **Žádné lekce, žádná
slovíčka/SRS, žádný progress dashboard, žádný roleplay.** Než cokoliv z tohoto přidávat, přečti si
sekci "Co záměrně chybí (a proč)" v `ARCHITECTURE.md` — je tam zaznamenané, co bylo v allora vyzkoušené
a proč to sem záměrně nepatří. Nekopíruj funkce z allory jen proto, že tam jsou.

## Pravidla textů v UI

- Sekce zpráv mají španělské názvy (Desde Chequia, Desde la Unión Europea, Desde el mundo, ¿Sabías qué?,
  A fondo) — český text je jen překlad po tapnutí, ne UI popisky
- Žádné technické detaily ani vysvětlování záměru návrhu v UI, jen co má uživatel udělat

## Kontext

- **Repo:** github.com/tomekson/pues, branch main, GitHub Pages
- **URL:** https://tomekson.github.io/pues/
- **Architektura:** viz `ARCHITECTURE.md` — statická PWA, JSON místo databáze, GitHub Actions na
  fetch+překlad zpráv, nula AI/Claude tokenů (na rozdíl od allory tu není žádná interaktivní skill —
  celá appka je pasivní čtečka, pipeline běží sama na cronu)
- **DEEPL_API_KEY:** repo secret (GitHub Actions), auto-fallback na MyMemory bez klíče/při chybě

## Auto-memory

Memories z práce na ¡pues! (rozhodnutí o obsahu, filtru zpráv, designu) ukládej do auto-memory —
budou automaticky izolovány do tohoto projektu díky CWD.
