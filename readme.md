# Atlas Conquest

A single-player, Risk-style world conquest game for the browser where geography knowledge is your army.
Answer questions about your starting country to recruit an army, once, then answer questions about
your neighbours to conquer them. After that, new troops come only from conquests.

Vite + React + TypeScript, with D3 (`d3-geo`, `d3-zoom`) and `topojson-client` for the map. The game
itself has no backend: it saves to `localStorage`, and all data, fonts and flags are bundled, so no question
ever comes from a live API. The one optional network feature is the [global leaderboard](#the-global-leaderboard). Sound effects are synthesised in the browser; there are no audio files. The campaign
names are spoken by the browser's own speech synthesis, using a British English voice when the device has one.

The whole game is pixel art. The map is drawn on a single pixel grid (terrain, territory tints, borders,
outlines and markers all share it), text is set in VT323 and Press Start 2P, and flags are low-resolution
images scaled up without smoothing.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

The game data is already in `public/data` and `public/flags`. To rebuild it from the original sources:

```bash
npm run setup      # downloads shapes, facts, flags and the NASA terrain image; logs what it dropped
npm run derive     # re-applies config/fame.json and config/geography.json to the bundled data (no download)
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests for the game logic (Vitest) |
| `npm run verify` | Plays the game in headless Google Chrome and checks it end to end |
| `npm run names` | Copies the empire name blocklist and allowlist into `supabase/schema.sql` |
| `npm run build` | Type-checks and builds to `dist/` |
| `npm run preview` | Serves the production build |

`npm run verify` needs Google Chrome installed. It starts its own servers. Run one suite with
`npm run verify -- game` (`map`, `game`, `mobile`, `production`), or one section of the game suite with
`npm run verify -- game iceland`. Screenshots land in `e2e/screenshots/`.

## The global leaderboard

Finished runs can be recorded on a global leaderboard: the top five of each campaign, shown on the end
screen and behind the Leaderboard button on the start screen. It lives in a [Supabase](https://supabase.com)
project and is optional: without it the game plays exactly the same and the leaderboard shows as unavailable.

To set it up:

1. Create a Supabase project.
2. In its SQL editor, run the whole of `supabase/schema.sql` once.
3. Copy `.env.example` to `.env.local` and fill in the project URL and its **public** key (called "anon" or
   "publishable", under Project Settings > API). Restart `npm run dev`.
4. Wherever the game is hosted, set the same two variables for the build (`npm run build` bakes them in).

`.env.local` is ignored by git. Never use the `service_role` / secret key: anything starting with `VITE_`
is shipped to every player. The public key is meant to be public; the database is what guards the table.

**What the database allows.** Anyone may read the leaderboard. Nobody may insert, update or delete rows
directly. A run is recorded only through the function `submit_run`, which checks the campaign, the name
(letters and single spaces, 3 to 16 characters, and the custom blocklist and allowlist), the flag (one of the game's patterns and palette colours), that the
score is one the game can produce for that campaign, that a victory really is every country, and that
there are at least as many battles as conquests. It keeps one row per run id and stamps the time itself.

**What cheating it does not prevent.** The game runs entirely in the player's browser, so the database
only ever hears what a browser tells it.

- Anyone can call `submit_run` by hand with a made-up run. As long as the numbers are ones the game could
  produce, it is accepted: a perfect World victory at the highest multiplier can be claimed without playing.
- The multiplier is not checked against the starting country, so an easy start can be reported as an
  Extreme one.
- Looking up answers, or reading the game's state in the browser's developer tools, cannot be detected.
- One person can submit any number of runs under any number of names; nothing ties a run to a player, by
  design, so there is no per-player limit and no rate limit.
- The database checks names against the custom blocklist only. The obscenity library's list runs in the game,
  so a name only that list refuses (common swear words with no slur in them) can still be sent to the database
  by hand. No word list is complete and both only know English: a determined player will eventually find a
  spelling neither catches.

Closing these would need the game to be replayed and judged on a server, or player accounts. Until then,
remove a bad row by hand in the SQL editor: `delete from public.runs where run_id = '...';`

## How to play

The game explains itself: the **Rules** button above the map on the start screen opens an illustrated rule book
(`src/components/Rules.tsx`), whose numbers are read from the rules code. The full rules, with every number, are
in [MECHANICS.md](MECHANICS.md). In short:

1. Name your empire and design its flag, then pick a mode (the whole world, or one continent) and a
   starting country. Every start gets 10,000 troops and a single life. Starts are rated Easy, Medium, Hard,
   Very Hard or Extreme (score ×1 to ×3) from how well known the country is and where it sits.
2. **Recruit phase, once:** 5 questions about your starting country, opening with its flag and getting
   harder. Easy pays 1,000 troops, Medium 2,000, Hard 3,000, and the fifth correct answer in a row is
   doubled: a perfect phase takes a famous start from 10,000 troops to 20,000, and a harder start up
   to 24,000.
3. **Attack:** there are no turns. Click a glowing country (land border) or a dashed one (sea
   crossing), then Attack. Every battle opens with the target's flag, then escalates. A correct answer
   defeats 1,000 defenders (2,000 if the question scored Hard); a wrong one costs you 2,000 troops. Run out of
   troops and the game is over. The next question always arrives by itself.
4. **Conquests are the only other source of troops:** exactly a quarter of the enemies the country
   had. Luxembourg (3,000 enemies) is worth 750, France (9,000) is worth 2,250, India (13,000) is worth
   3,250.
5. **Retreat** gets you out alive for a quarter of your army and your streak, but never with your last
   thousand. The country stays wounded and wins back 2,000 defenders each time you attack somewhere else.
6. **Defenders** scale with population (3,000 to 13,000), and every country gains 1,000 more for each 15
   countries you hold. Sea crossings face a third more, with half the time per question.
7. **Question difficulty** is a score: the kind of question, plus how obscure the country is, plus how
   close the wrong options are. Eighteen question types, from flags and seas to national sports, main exports,
   years of independence, famous people and a memorable hook for every country. No option is far-fetched: wrong answers come from the same
   continent, flag options all resemble the right flag, and a capital question always includes another
   city of the same country.
8. **Score** is countries conquered × your start's multiplier, plus 10 for every continent held in full.

Controls: mouse wheel, drag, pinch, `+` / `-` keys or buttons to move the map. `1`–`4` or `A`–`D`
answer a question; `Enter` skips the short wait after an answer. The speaker button in the top bar mutes the sound.

## Project layout

```
scripts/setup-data.mjs   one-time data download and processing
scripts/derive.mjs       applies the config files to the data: fame, seas, features, globe lines
config/fame.json         the editable fame lists: famous, familiar, obscure
config/geography.json    which seas, rivers, deserts, ranges and rainforests each country has
config/independence.json the year each country gained independence, with any second significant year
public/data/facts.json   the curated facts and hooks (hand-edited; reviewed in reports/facts-review.md)
MECHANICS.md             the rules in full
supabase/schema.sql      the leaderboard's database: one table, read-only to the public, and the function that records a run
.env.example             the two settings the leaderboard needs (copy to .env.local)
reports/                 review files: difficulty (fame, start ratings), every curated fact, and the four newer themes
                         (national sport, main export, year of independence, famous person) with every doubtful entry
public/data, public/flags   the bundled data
src/game/                pure game logic, no React or DOM
  rules.ts               defenders and escalation, wounds, streaks, battle resolution, retreat, targets, start ratings, scoring
  questions.ts           question generation and difficulty scoring (type weight + fame + closeness)
  brands.ts              hand-picked brands by founding country, for the brand question
  flag.ts                the empire flag: preset patterns, colours, validation
  state.ts               the reducer: (state, action) -> state, plus save validation
  world.ts, rng.ts, types.ts
src/map/
  geo.ts                 projection and shape preparation
  raster.ts              the pixel rasteriser: grid sizing, hard-edged lines, dashes, marker sprites
  terrain.ts             procedural terrain fallback
src/components/          rendering only: map, HUD, question card, attack panel, start and end screens
src/logo.json            the emblem's pixels: two crossed gold swords (drawn, with the favicon, by `npm run logo`)
src/names/               the empire name check: validateEmpireName.ts, blocked-names.json, allowed-names.json
                         (after editing a list: `npm run names`, then re-run supabase/schema.sql in Supabase)
src/leaderboard.ts       the leaderboard client: sends a finished run, reads the top five (plain fetch, no library)
src/sound.ts             synthesised sound effects (hover pulse, snap, whoosh, trumpet call, countdown tick) and the campaign voice
src/App.tsx              wires state to components
tests/                   unit tests for src/game, the rasteriser and the sound pitch
e2e/                     browser checks
```

All randomness comes from a seed stored in the game state, so the reducer is deterministic and a saved
game resumes exactly where it left off.

### How the map is drawn

`WorldMap.tsx` draws into two small canvases (one value per map pixel, roughly a quarter of the screen
resolution) that are scaled up with `image-rendering: pixelated`. The grid cell is always a power of two
in map units, chosen so a cell is 2 to 4 CSS pixels on screen; each time the zoom doubles the grid steps
to cells half the size, which nest exactly inside the old ones. Terrain comes from a matching mip level of
the 4096x2048 image, so terrain pixels and border pixels are the same pixels. Borders and outlines are
rasterised with Bresenham lines (no anti-aliasing). An invisible SVG layer with the country shapes handles
hit-testing.

## Decisions worth knowing

- **Continents.** The Americas are split into North America and South America, giving six continent
  campaigns.
- **Countries.** 230 are in play: everything with both a Natural Earth 50m shape and complete facts,
  including territories with their own ISO code (Greenland, Puerto Rico). 22 entries were dropped (listed
  in `public/data/manifest.json` and in the browser console). Kosovo is joined by name; the Somaliland and
  Northern Cyprus shapes are merged into Somalia and Cyprus so the map has no unclickable holes.
- **Fame is one value per country,** used for start ratings and question difficulty alike. Edit
  `config/fame.json` and run `npm run derive`.
- **Answers never name the country.** "Niger River" is not asked about Niger, nor "Indian Ocean" about
  India, nor a capital that shares the country's name.
- **Curated facts are only asked if well known** (recognition 2 or 3), and a wrong option is never
  something that is also true for the country.
- **Attacking** takes two clicks (select, then Attack) so a stray tap on a phone cannot start a battle.
- **The map hides country names while a question is open,** and country flags are not shown in menus,
  because either would answer questions for you.
- **Treasure-chest look.** Panels are dark brown with gold fittings; the palette is a handful of CSS
  variables at the top of `src/styles.css`.

## Data sources

- Shapes: [world-atlas](https://github.com/topojson/world-atlas) `countries-50m.json` (Natural Earth, public domain).
- Facts: the [REST Countries](https://gitlab.com/restcountries/restcountries) dataset.
- Flags: [flagcdn.com](https://flagcdn.com) SVGs, rasterised by the setup script into small PNGs (12 and
  32 px tall) that the game shows at twice their size.
- Terrain: NASA Blue Marble Next Generation (July, with topography and bathymetry), resized to 4096×2048,
  reduced to 64 colours, with land brightened and all water remapped to a lighter blue. If
  that image is missing or fails to load, the game generates a pixel terrain texture from the land shapes
  instead (try it with `?terrain=procedural`).
- Fonts: [VT323](https://fonts.google.com/specimen/VT323) and
  [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) (SIL Open Font License), installed
  from the `@fontsource` packages and bundled into the build.
