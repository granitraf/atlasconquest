# Atlas Conquest: game mechanics

Atlas Conquest is a single-player, browser-based world conquest game. The player answers
multiple-choice geography questions to recruit an army once, at the start, and then to defeat
defenders in other countries. There is no AI opponent: countries only defend, they never attack. This document
describes the rules exactly as implemented. Every constant named here lives in
`src/game/rules.ts` or `src/game/questions.ts`.

**Numbers on screen are in thousands.** The rules work in units, and every unit is shown as
1,000 soldiers (`SOLDIERS_PER_UNIT`): the 10 starting troops read as 10,000, a country with 9
defenders as 9,000, a wrong answer as 2,000 lost, a conquest worth 3 as +3,000. Nothing else
changes: every proportion is the same. This document gives the units; multiply by 1,000 for
what the player sees. On phones the top bar and the battle bar write 20,000 as "20k".

**Defenders are called "enemies" on screen.** This document and the code keep the word
defenders for the rule; every label, tooltip and the rule book say enemies. One colour code
is used throughout: enemies in pink, troops gained in green, sea crossings in light blue.

## 1. Setup

- **Modes:** World (230 countries) or a single-continent campaign: Africa 56, Asia 49,
  Europe 51, North America 38, South America 13, Oceania 23. "Countries" includes territories
  with their own ISO code and complete data (e.g. Greenland, Puerto Rico).
- **Start:** the player picks any country in the mode as their home.
- **Empire name and flag:** cosmetic only. The flag is planted on every country held.
- **Starting resources are fixed and identical for every start:** 10 troops (shown as 10,000)
  and 1 life.
  Country size, population and wealth give no advantage.

## 2. Fame

Every country has one fame value, used both for start ratings and for question difficulty:
**0 famous, 1 mid-known, 2 obscure.** It is set in `config/fame.json` and written into the
bundled data by `npm run derive`.

- **Famous (0):** a hand-picked list of 35 countries an average player worldwide knows well.
- **Obscure (2):** a hand-picked list of less familiar countries of any size, plus every
  country under 5 million people that is not on another list.
- **Mid-known (1):** everything else, plus a "familiar" list of 23 small countries that are
  well known despite being under 5 million (Iceland, Jamaica, Malta, Luxembourg, Croatia,
  Qatar, Fiji and others).

Current counts: 35 famous, 88 mid-known, 107 obscure.

## 3. Start difficulty rating (affects score only)

The rating crosses fame with the start's position. It does not change troops, defenders or
questions; it only sets the score multiplier.

**Position**, counting only land neighbours that are in the mode, using their own defender
counts (section 8, before escalation):

| Position | Rule |
|---|---|
| Open | 3 or more land neighbours, at least 2 of them with 6 defenders or fewer |
| Cheap exit | at least one land neighbour with 6 defenders or fewer |
| Boxed in | has land neighbours, but every one has 7 or more defenders |
| Island | no land neighbours |

**Rating:**

| | Open | Cheap exit | Boxed in | Island |
|---|---|---|---|---|
| Famous | Easy | Easy | Easy | Easy |
| Mid-known | Medium | Medium | Hard | Very Hard |
| Obscure | Hard | Hard | Very Hard | Extreme |

**Multipliers:** Easy ×1, Medium ×1.5, Hard ×2, Very Hard ×2.5, Extreme ×3.

The start menu shows the label, the multiplier and a one-line reason for every country, and
can be filtered by rating.

Starts per rating (Easy / Medium / Hard / Very Hard / Extreme): World 35/41/62/41/51,
Africa 2/10/25/13/6, Asia 7/12/16/13/1, Europe 19/11/9/7/5, North America 3/5/5/6/19,
South America 2/2/8/0/1, Oceania 2/0/0/1/20.

## 4. Game structure

There are no turns. A game is: **one recruit phase** (5 questions, right after the starting
country is chosen) → **the map**, where the player picks a target and fights a battle, again
and again, until the game is won or lost. There is no End Turn button and nothing to wait
for: the only things to do on the map are attack or start a new game.

## 5. Troops

- Troops are one global pool. They are not stationed in countries; there are no garrisons,
  upkeep or movement.
- **Troops are gained in two ways only:**
  - the opening recruit phase (section 7), once;
  - conquering a country: **exactly a quarter of the defenders it had**, with nothing
    rounded (`conquestTroops`, `DEFENDERS_PER_TROOP` = 4). The count is the country's full
    strength in that battle: its own defenders, plus the extra for the size of the player's
    empire, plus the sea bonus. A wounded country still pays for its full strength.

    | Enemies on screen | 3,000 | 4,000 | 6,000 | 8,000 | 9,000 | 10,000 | 13,000 |
    |---|---|---|---|---|---|---|---|
    | Troops gained | +750 | +1,000 | +1,500 | +2,000 | +2,250 | +2,500 | +3,250 |

    In units that is 0.75 for 3 defenders up to 3.25 for 13, so the army is no longer always
    a whole number of thousands; on screen it is always a multiple of 250. Luxembourg, Malta
    and Palau are worth 750; Ireland 1,500; France 2,250; Germany 2,500; India and China
    3,250. How obscure a country is does not change what it pays. Each target's chip, its card and its map tooltip show the reward.
- Troops are lost in two ways: a wrong answer in battle (−2) and retreating (−25%,
  section 10).
- The troops for a conquest arrive when the country changes hands.
- The whole pool is committed to every battle. Outside a battle the player always has at
  least 1 troop, so an attack is always possible.

## 6. Question difficulty

A question's difficulty is not fixed by its type. It is a score:

**score = type weight + country fame + close-call bonus + expert bonus**

Score 1–2 is **Easy**, 3–4 is **Medium**, 5 or more is **Hard**.

**Type weight** (one table, `TYPE_WEIGHT`):

| Weight | Types |
|---|---|
| 1 | flag, capital, water, driving side |
| 2 | border, currency, language, domain, brand, major feature, globe line, curated fact, national sport, main export, history makers, stars, largest religion |
| 3 | population, area, not-border, year of independence |

National sport, main export, history makers and stars carry the weight of the curated facts they are
(2): something a player knows about a country or does not, harder than its flag or capital,
no harder than its currency. The year of independence carries 3, with population and area:
it is a number to recall, the options are neighbouring decades, and nothing on the map helps.

**Expert bonus** (`EXPERT_BONUS`): +2 for the year of independence. A year is hard to know
about any country, however famous, so it scores Hard for every country.

**Country fame:** 0, 1 or 2 (section 2), for the country the question is about.

**Option closeness:** 0 or 1, the plain version of a question or its close call.

**Close-call bonus** (`CLOSENESS_BONUS`): what the close call adds to the score, by how much
harder it really makes the question.

| Bonus | Types | Why |
|---|---|---|
| +2 | border, not-border, major feature, population, area | Neighbouring countries and the next range over genuinely confuse people; for population and area the close call is the hardest way of asking (below) |
| +1 | flag, capital, water, brand, domain | A lookalike flag or a nearby capital helps a little |
| 0 | currency, language | Close options barely matter: France's euro is as easy to pick out from the pound as from anything |

No option is far-fetched at either level. Every wrong option is at least from the same
continent, every flag resembles the right one, and a capital question always includes
another city of the country itself.

- 0: the same continent, outside the country's own subregion where that is possible.
- 1: the closest calls there are: the same subregion first; neighbours-of-neighbours for
  border questions; hand-picked lookalikes and the most similar flags for flag questions; two
  of the country's own cities for capital questions.
- If a continent has too few candidates (few countries in South America or Oceania share a
  given kind of answer), the pool widens to the rest of the world rather than repeating one.
- For population and area the close call is a form of the question rather than a set of
  options: **"What is the population of X?"** (the range) and **"Which of these is closest in
  size to X?"**. Their plainer forms are the line-ups ("which has the most people", "which is
  the biggest") and "larger / smaller than X".
- For globe-line, curated-fact, national-sport, main-export, famous-person and
  year-of-independence questions closeness does not apply and counts as 0.

**Reason-out weighting.** Water, major feature, globe line, border and language questions can
be worked out from the map and the region. For less familiar countries a set share of
non-flag slots prefers one of these when the slot's tier has one (`REASON_OUT_SHARE`):
about 60% for obscure countries, about 40% for mid-known ones, no bias for famous ones.
The other slots prefer the remaining types.

**Variety comes before the tier.** How a slot is filled, in order of importance:

1. **Type rotation.** A type is not asked a second time while another type is still unused
   (in the battle, or in the recruit phase). Twelve questions against a country with twelve
   types to ask are twelve different types, so the four themes of section 12 each come up
   once before anything repeats and never crowd the others out.
2. **Nothing asked before.** The game remembers the last 300 questions asked on this device
   (`RECENT_SIGS_KEPT`), from the recruit phase and battles alike, and across games: a new game
   starts from that memory, kept in the browser. A remembered question is passed over while the
   types whose turn it is have something new to ask.
   - **Rotating wrong options.** For each remembered question the game also keeps the wrong
     options it showed (the last 6). When it is asked again, a few drafts are made from the
     same pools (`DECOY_DRAFTS`, 4) and the one repeating the fewest of them is used. Every
     draft is just as close a call, so the question is no easier; it just looks different.
3. **The slot's tier,** then the nearest tier (the easier one on a tie). Within a tier, types
   that cannot be asked any harder go first, which saves the others for later, harder slots.

Types with several forms (size, population, borders) take their forms in turn: the form
asked least so far comes first.

What each fame level can produce:

| Fame | Easy | Medium | Hard |
|---|---|---|---|
| Famous | flag, capital, water, globe line, facts, sport, export, person, currency, language; border, domain, brand, feature with plain options | border, domain, brand, feature as close calls; population and size line-ups; not-border with plain options | population range, closest in size, not-border as a close call, year of independence |
| Mid-known | capital and water with plain options | most types | border, feature, not-border as close calls; population range; closest in size; year of independence |
| Obscure | none | weight-1 types; most weight-2 types; currency and language at either level | border, feature, domain, brand as close calls; all weight-3 types; year of independence |

Measured over many battles (10 questions each, including the flag): famous countries come
out about 35% Easy, 35% Medium and 30% Hard; mid-known 11%, 49%, 40%; obscure 0%, 58%,
42%.

**Rewards follow the tier a question actually scored,** not the slot it filled (sections 7
and 9). The question card shows the tier.

## 7. Recruit phase (once, at the start)

- 5 questions about the starting country, asked once, before the first attack. It never
  comes back: not after a conquest, a retreat or anything else.
- Slots: **flag, Easy, Medium, Medium, Hard.** (Unlike battles, the recruit phase keeps this
  fixed ramp, so what a start can recruit stays predictable.)
- The first question is always the starting country's flag, always as a close call: at least
  one hand-picked lookalike flag, the rest from the other lookalikes and the flags most alike
  in colour. Its tier is whatever the score works out to.
- Every other slot is filled by the rules in section 6: an unused type, then the slot's tier
  or the nearest achievable one. The five questions are five different types.
- Reward per correct answer: Easy 1 troop, Medium 2, Hard 3. Wrong answer: 0.
- **The fifth correct answer in a row is doubled** (`streakMultiplier`: ×2 once the streak
  reaches 5).
- **What a perfect phase is worth depends on the start.** A famous country is not asked Hard
  questions in the recruit phase (its last slot is capped at Medium, so its Hard questions are
  kept for battles): 1 + 1 + 2 + 2 + (2 × 2) = 10, taking the army from 10 to 20. A mid-known country
  that can reach Hard ends on 3 × 2, and its flag scores Medium: 2 + 1 + 2 + 2 + (3 × 2) = 13, up to 23. An obscure country has no Easy questions:
  2 + 2 + 2 + 2 + (3 × 2) = 14, up to 24. Harder starts are asked harder questions and can
  field a larger army.
- **Streak:** consecutive correct answers across the whole game, in the recruit phase and in
  battles. Any wrong answer, timeout or retreat resets it to 0. After the recruit phase it
  only drives the rising pitch of the correct-answer sound and the best-streak statistic.

## 8. Attack phase: targets and defenders

**What can be attacked:**

- **Land:** any unowned in-mode country sharing a land border with player territory.
- **Sea:** any unowned coastal country whose centre is within 2,500 km (`SEA_RANGE_KM`) of
  the centre of an owned country **that has a coast on the same sea lane**.
- **Sea lanes** (`config/geography.json`, `lanes`): Atlantic, Pacific, Indian Ocean, Arctic,
  Mediterranean, Black Sea, Baltic, Red Sea, Persian Gulf, Caspian. Open seas belong to
  their ocean (the North Sea, the Caribbean and the Gulf of Guinea are Atlantic; the South
  China Sea is Pacific). Enclosed seas are lanes of their own, so they can only be entered
  from a country with a coast on them. From Germany (Atlantic and Baltic) the Atlantic shore
  is open as far as Morocco, and the Baltic; Italy, Greece, Turkey and Ukraine are not,
  however near. Spain, France or Morocco (Atlantic and Mediterranean) open the
  Mediterranean; Turkey or Russia open the Black Sea; Egypt links the Mediterranean and
  the Red Sea. The map tooltip names the sea that is missing.
- **Top-up to three:** an empire with a coast always has at least 3 targets (`MIN_TARGETS`)
  while that many remain. If land borders and the sea range together give fewer, the nearest
  coastal countries beyond the range are added, nearest first, until there are 3: shores on
  its own sea lanes first, and other seas only if that is still not enough. Pitcairn
  has only French Polynesia within range (2,158 km), so the Cook Islands (3,057 km) and Niue
  (4,138 km) open up too. Australia, whose centre is far from every shore but one, gets 3 as
  well. Anyone who already has 3 or more targets is unaffected: the range does not change.
- **Last resort:** if neither rule yields a target while countries remain, the 3 nearest
  countries of any kind are offered as crossings. Every country is reachable from every start
  in every mode (covered by a test).

**Defenders:**

- **A country's own defenders** scale with population:
  `round(3 + 3 × (log10(population) − 5.7))`, clamped to 3–14.
- **Escalation:** every country gains +1 defender for each 15 countries the player holds
  (`floor(held / 15)`), so the late game gets harder.
- **Sea crossing bonus:** `max(1, round(defenders / 3))` extra, worked out after escalation.

| Country | Own defenders | By sea |
|---|---|---|
| Vatican City, Nauru, Monaco, Iceland, Malta, Luxembourg | 3 | 4 |
| Ireland, New Zealand | 6 | 8 |
| Switzerland | 7 | landlocked |
| Netherlands, Australia, Romania | 8 | 11 |
| Spain, France, UK, Canada | 9 | 12 |
| Germany, Japan, Russia | 10 | 13 |
| Brazil, Indonesia, USA | 11 | 15 |
| China, India | 13 | 17 |

Distribution of own defenders across all 230: 64 countries have 3, 12 have 4, 19 have 5,
30 have 6, 31 have 7, 30 have 8, 25 have 9, 11 have 10, 6 have 11, 2 have 13.

The attack panel shows each target's defenders before the player commits, including wounds
(section 10) and the current escalation.

## 9. Battles

- Questions are about the target country.
- The first question is always the target's flag, as a close call (section 7).
- **After the flag, a shuffled rhythm.** Each battle deals its tiers from a deck of one Easy,
  two Medium and three Hard (`RHYTHM_DECK`), shuffled, and shuffled again whenever it runs
  out. Any tier can come straight after the flag, no two battles run alike, and the order is
  dealt when the battle starts, so a reload keeps it. Over every six questions the mix is the
  same, so a battle is no harder or easier on average than before. Slots are filled as in the
  recruit phase, with the same nearest-tier fallback: a famous country still never scores
  Hard, an obscure one never Easy.
- A correct answer kills 1 defender, or 2 if the question actually scored Hard. A wrong
  answer or timeout costs the player 2 troops.
- A question is never repeated within a battle, and no type is asked twice while another is
  still unused. A second attack on the same country (after a retreat) opens with its flag
  again and then asks questions the first attack did not.
- A country the player already holds is never the answer to a border question: it is on the
  player's own map.
- **Win:** defenders reach 0. The country becomes the player's, with the troops its defenders
  were worth (section 5). The player picks the next target straight away.
- **No Continue button.** After an answer the result stays up for 1.2 seconds if it was right
  and 3 seconds if it was wrong (long enough to read the correct answer), then the next
  question arrives by itself. While the result is up there is no button on the card at all,
  so nothing can be clicked by accident. `Enter` or `Space` skips the wait.
- **Lose:** troops reach 0. The game is over (one life).
- **The siege bar** (left of the map) is the enemy's wall: one brick per 1,000 enemies. A brick
  falls for every 1,000 beaten, so the bar fills exactly as far as the battle has got and
  never drops back. Above it: the most right answers still needed to win (a Hard answer
  counts twice). Below it: the wrong answers the army can still survive, which is
  `ceil(troops / 2) - 1`. A wrong answer shakes the bar and takes one away.
- **DECIMATE.** If a country falls while the streak is at 15 or more (`DECIMATE_STREAK`), a
  DECIMATE is ready. The streak only counts if it holds until the country falls: passing 15
  mid-battle makes the streak chip pulse, but one wrong answer before the country is taken
  breaks the streak and the charge with it.
  - While it is ready, every target is outlined in shimmering gold and the Attack button
    becomes a flaming DECIMATE button. It must be used on the next attack: it cannot be saved.
  - DECIMATE takes the chosen target (land or sea) with no questions: "[ LOCATION LOCKED ]"
    flickers over the map, a pixel explosion goes off on the target, and the country falls
    like any conquest, with its flash, fanfare and **full spoils**.
  - It counts as a battle won (so a run always has at least as many battles as conquests, as
    the leaderboard requires) and spends the streak, which starts again from 0. The best
    streak keeps the record.
- **The last stand.** With 2,000 troops or fewer in a battle (`isLastStand`), the next wrong
  answer ends the game. A heartbeat plays over a low drone, the edges of the screen pulse
  red, and the siege bar reads "Last chance". It stops when the battle ends or the player
  retreats.

## 10. Retreat and wounded countries

- Available at any point in a battle before it is decided.
- **Cost: 25% of the player's troops, rounded up (at least 1).** It does not depend on how
  the battle is going. It also resets the streak to 0.
- **The last troop cannot retreat.** With 1 troop the Retreat button is disabled: there is
  nothing to pay with, and an army of 0 could never attack again. A retreat therefore always
  leaves at least 1 troop and never ends the game.
- **The country stays wounded:** defenders already beaten stay down. Attacking it again meets
  only the defenders left standing (always at least 1).
- **Wounded countries win back 2 defenders each time the player attacks a different
  country** (`WOUND_HEAL_PER_BATTLE`), until back to full strength. Going straight back in
  finds the country exactly as it was left.
- Conquering a wounded country clears the wound.

## 11. Timers

- Every question is timed: 20 seconds in the recruit phase and land battles, 10 seconds in sea
  battles. Running out counts as a wrong answer.
- The clock restarts if the page is refreshed mid-question.

## 12. Question types

Twenty-one types, four options each (two for the driving side), all generated from bundled data. In every question the
country is named in the prompt and the answer is something about it, never its own name:
an answer that would name the country ("Niger River" for Niger, "Indian Ocean" for India,
the capital "Djibouti" for Djibouti) is never used. The one exception is the line-up
("which of these is the biggest?"), which ranks the country against three others: there the
country is one of the four options, and is sometimes the answer.

| Weight | Type | Prompt | Notes |
|---|---|---|---|
| 1 | Flag | Which flag belongs to X? | Four flag images, all alike in colour. See flag rules below. |
| 1 | Capital | What is the capital of X? | One wrong option (two for a close call) is another city of X itself, from `config/cities.json`: Sydney for Australia, Istanbul for Turkey. The rest are capitals from the same continent (the same subregion for a close call). Cities with any claim to being a capital (Cape Town, La Paz, The Hague, Abidjan, Colombo) are never offered. 192 countries have cities listed. Skipped where the capital carries the country's name. 214 of 230 qualify. |
| 1 | Water | Which sea or ocean does X border? | Coastal countries only; 21 named seas and oceans. Wrong options are bodies the country does not touch, not even arguably, and they are the nearest such bodies: three of the nearest four for a close call, three of the nearest eight otherwise. 179 qualify. |
| 2 | Border | Which country borders X? / Which country borders both X and Y? / Which country borders X to the east? / Which of these neighbours of X is landlocked? (or: is not landlocked?) | Four forms, taken in turn. The answer is never a country the player holds. In "borders both", Y is a held neighbour when there is one, so the player's own map is the clue. "To the east" is asked only where the neighbour's centre lies within 30° of that compass point, never about a microstate or an enclave, and no wrong option is a neighbour on that side. In the landlocked form all four options are real neighbours. 161 qualify. |
| 2 | Currency | What currency does X use? | Options are the kind only ("Dinar", not "Serbian Dinar"). Lookalike kinds (krona/krone, rial/riyal) are never offered together. |
| 2 | Language | Which is an official language of X? | One variant per official language. Corrections live in `config/languages.json`: for Kosovo the only language asked about is Albanian, and Serbian is never shown as an option. |
| 2 | Domain | What is the internet domain of X? | Close options are guessable codes from the name and real domains with the same first letter; otherwise real domains of other countries on the same continent. 229 qualify. |
| 2 | Brand | Which company was founded in X? | From a hand-picked list in `src/game/brands.ts`. 52 qualify. |
| 2 | Major feature | Which river flows through X? / Which desert lies in X? / Which mountain range runs through X? / Which rainforest is found in X? | Only where the country has a well-known one; options are always the same kind of feature, and the nearest ones of that kind (the Alps and the Apennines for the Pyrenees). 105 qualify. |
| 2 | Globe line | Which of these lines on the globe passes through X? | Equator, the two tropics, the Arctic Circle and the Prime Meridian, worked out from the country's shape, with "None of these" as an option. 47 qualify. |
| 2 | Curated fact | (written per fact) | Highest mountains, landmarks, dishes, former names, sporting moments and one-off hooks. See below. 218 qualify. |
| 2 | National sport | What is the national sport of X? | Only where a sport is officially declared or is a tradition strongly identified with the country: never "football, like everywhere". See the four themes below. 57 qualify, counting sporting facts worded their own way. |
| 2 | Main export | What is X's biggest export? | The largest export by value in recent years. 114 qualify. |
| 2 | History makers | Which of these historical leaders came from X? (and one wording per field: thinkers, religious leaders, composers, scientists, writers, artists, explorers) | 113 people in 54 countries. See "Famous figures" below. |
| 2 | Stars | Which of these music stars is from X? (and actors, footballers, sports stars) | 214 people in 90 countries. See "Famous figures" below. |
| 3 | Year of independence | In which year did X gain independence? | Four years in ascending order, a fixed distance apart. 150 qualify. |
| 2 | Largest religion | Which religion has the most followers in X? | Only where that is clear. See "Religion and driving side" below. 215 qualify. |
| 1 | Driving side | Which side of the road do they drive on in X? | **Two options:** Left, Right. Only where it is not obvious. See below. 114 qualify. |
| 3 | Population | What is the population of X? / Which of these has the most people? / Which of these has the fewest people? | Three forms, taken in turn. The range form shows four adjacent ranges out of ten (under 10k … over 250M). The line-ups rank X against three countries from its region; the winner leads by at least 1.3×. No closeness. |
| 3 | Area | Which of these is larger than X? / smaller than X? / Which of these is the biggest by area? / the smallest? / Which is closest in size to X? | Five forms, taken in turn. "Biggest" and "smallest" are line-ups of X and three countries from its region. Compared areas always differ by at least 1.3×. Effectively unlimited variants. No closeness. |
| 3 | Not-border | Which of these does NOT border X? | Needs 3+ neighbours, at least two of which the player does not hold; at most one held neighbour is shown. 113 qualify. |

A type is skipped for a country that lacks the data.

**Flag rules:**

- **Identical flags** (Chad and Romania, Indonesia and Monaco, and any two countries sharing
  one flag file) are never offered together, at any difficulty.
- **Every wrong flag resembles the right one.** For each country the ten flags most like its
  own are worked out from the flag images by `npm run derive` (`flagKin`): which colours a
  flag uses, in what amounts, and roughly where. Andorra's blue, yellow and red bring up
  Moldova, Romania, Chad, Colombia and Ecuador; the United States brings up Liberia, Malaysia
  and Puerto Rico.
- Closeness 0: any three of those ten. Closeness 1: the hand-picked **lookalike flags**
  (Ireland and Côte d'Ivoire, Netherlands and Luxembourg, and 21 more groups in
  `LOOKALIKE_FLAGS`) first, then the four most similar of the ten.

**Seas, features and globe lines** come from `config/geography.json` and the map shapes,
applied by `npm run derive`. Each sea and feature lists the countries that clearly have it
and an "avoid" list of arguable cases (a river that only touches a border, a sea a country
barely reaches). An avoided item is never the right answer and never a wrong option.

**Curated facts** live in `public/data/facts.json` (816 facts; reviewed in
`reports/facts-review.md`, and the four themes in `reports/new-questions-review.md`).

- Each fact has a country, a category (landmark, person, food, history, nature, culture,
  film, sport, economy), a prompt, an answer and a recognition rating: 3 known worldwide,
  2 known to a well-read player, 1 known mostly inside the country.
- **A fact is asked only if its recognition is 2 or higher** (`FACT_MIN_RECOGNITION`), and so is
  a person (`PERSON_MIN_RECOGNITION`). If a country has nothing that qualifies in a
  category, that category is simply not asked about it; there is no filler.
- **Hooks:** every one of the 230 countries has at least one memorable, specific fact (177
  have one, 47 have two, 6 have three), phrased as a question about that country.
- **Wrong options** are either hand-picked for that fact, or answers to the same kind of fact
  about other countries, nearest regions first. An option is never something that is also
  true for the country: answers shared between countries (a peak on a border, a dish claimed
  by neighbours) list those countries, and closely related answers (oil and gas as exports)
  are never set against each other. A fact can also list things that are arguably true of
  its country (`avoid`): they are never offered as wrong options for it.

**The themes.** National sport, main export, history makers and stars are curated facts asked
as question types of their own, so each takes its turn in the rotation; the year of
independence comes from `config/independence.json`, applied by `npm run derive`. Every
entry, every doubtful one and every country left out is listed in
`reports/new-questions-review.md`.

- **National sport** (45 countries). Only a sport that is officially declared (kabaddi in
  Bangladesh, arnis in the Philippines, pato in Argentina) or a tradition strongly
  identified with the country (sumo, hurling, buzkashi). Where two sports have a claim both
  are recorded and the second is never offered as wrong: Canada's answer is ice hockey and
  lacrosse is never an option. Wrong options are hand-picked from sports played in the
  region. A sport of ice or snow (`WINTER_SPORTS`) is never offered for a country closer to
  the equator than 35° (`WINTER_SPORT_MIN_LATITUDE`), and football is never an option.
  Related answers (the kinds of wrestling, the codes of rugby) are never set against each
  other.
- **Main export** (114 countries). The largest export by value in recent years. Related
  answers share a group and are never set against each other: crude oil, refined petroleum
  and natural gas; clothing and textiles. Wrong options are the main exports of other
  countries, nearest regions first, and never one of the country's own other big exports,
  which each fact lists.
- **Year of independence** (150 countries). The date most widely taught. The four options
  are in ascending order with the right year in a random position, 10 years apart for a year
  from 1900 on and 20 years apart before it (`independenceGap`), so they are never one or
  two years apart. No option is later than 2025 (`LATEST_YEAR`). Where a country has a
  second significant year (declared and recognised, first and restored) it is recorded, and
  no wrong option comes within 5 years of it (`INDEPENDENCE_CLEARANCE`). Countries that
  were never colonised, became independent by steps, have competing dates too close
  together, or are territories are left out: 80 in all.
- **Famous figures**, in two types:
  - **History makers:** leaders (Lincoln, Churchill, Marcus Aurelius, Atatürk, Nkrumah),
    thinkers (Confucius, Socrates), religious leaders, composers, scientists, writers,
    artists and explorers. 113 people in 54 countries.
  - **Stars:** music stars (Dua Lipa, Rihanna, BTS, Burna Boy), actors (Margot Robbie, Cillian
    Murphy, Joseph Zada), footballers and sports stars. 214 people in 90 countries.
  - **Two levels of fame.** Someone known worldwide (recognition 3) is the plain version of the
    question; someone a well-read player would know (2) is its harder version, worth 2 more
    (`CLOSENESS_BONUS`). People known mostly at home (1) are never asked.
  - **Wrong options** are people of the same field (pop stars against pop stars, composers
    against composers), nearest regions first, and just as famous as the answer wherever there
    are enough of them, so the one name a player recognises is never the giveaway.
  - **People with a second home** list it (`sharedWith`) and are never a wrong option for it:
    Dua Lipa is from Kosovo and is never offered as wrong for the United Kingdom or Albania;
    Rita Ora, born in Pristina too, is never a wrong answer for Kosovo; Alexander Hamilton,
    born on Nevis, never for the United States.
  - **A few surprising birthplaces** with their own wrong options: Trajan (Spain), Catherine
    the Great (Poland), Saladin (Iraq), Anne Frank (Germany), Russell Crowe (New Zealand),
    Keanu Reeves (Lebanon), Emma Watson (France), Audrey Hepburn (Belgium), Freddie Mercury
    (Tanzania).
  - **Left out on purpose:** dictators and perpetrators of atrocities, and figures of today's
    politics. Retired leaders (Obama, Merkel, Ardern) are in.
  - **They share one turn** in the rotation (`SHARED_TURN`): a battle asks about a history
    maker or a star, not both, until every other type has had its go. About 3% of battle
    questions are about people.
  - A country with nobody well known (Palau, Nauru) is never asked either.

**Religion and driving side** come from `config/religions.json` and `config/driving.json`,
applied by `npm run derive`. Both were written from memory; the doubtful entries are listed
in `reports/new-questions-review.md`.

- **Largest religion** (215 countries). The religion with the most followers among people who
  have one, so a country where most people have none (Czechia, Estonia) still has an answer.
  The answers are Christianity, Islam, Hinduism, Buddhism and Judaism. Fifteen countries are
  never asked, because two religions are close (Nigeria, Bosnia and Herzegovina, Ivory
  Coast, Eritrea, Chad), the figures disagree (Madagascar, Togo, Guinea-Bissau, Vietnam,
  North Korea), religions overlap (Japan, China, Taiwan, Hong Kong), or the answer is the
  country itself (Vatican City).
  - **Wrong options** are the tempting ones: first the other religions with a large following
    in the country itself (`rivals`: Hinduism and Islam in Suriname, Buddhism in South
    Korea), then the religions that are the largest in the nearest other countries. The two
    most tempting are always on the card; the third is one of the next two. Sikhism, the
    largest religion nowhere, is offered around India and where it has a large community.
- **Driving side** (114 countries). The only question with two options, always in the order
  Left, Right. It is asked only where the answer is not obvious:
  - every country that drives on the left (69), except the United Kingdom;
  - a country that drives on the right only if it has a land border with a left-driving
    country (Myanmar, Rwanda, China, Brazil…) or is listed as a surprise (`alsoAsk`: the
    Philippines, Nigeria, the right-driving islands of the Caribbean and the Pacific…): 45.
  - Never the United States, Canada, mainland Europe or most of Latin America.
  - It weighs what a flag does (weight 1): Easy for famous and mid-known countries, Medium
    for obscure ones, which have no Easy questions. Either way a right answer kills one
    defender. The keys 1–2 and A–B answer it; 3, 4, C and D do nothing.

## 13. Information deliberately hidden

- While any question is open (recruit or battle), hovering the map shows "???" instead of
  country names, except for the country under attack.
- Country flags are not shown in the start menu or the attack panel, because the first
  question of the recruit phase and of every battle is a flag. A target's flag appears in the battle
  bar only after its flag question has been asked.

## 14. Ending and score

- **Victory:** the player owns every country in the mode.
- **Game over:** troops reach 0 in a battle.
- **Score = countries conquered × start multiplier + 10 × continents held in full.**
  The home country does not count as conquered. In World mode up to six continent bonuses are
  possible; in a continent campaign the bonus is earned exactly once, on victory.
- The end screen shows the empire, countries conquered, continents conquered, best streak,
  battles fought and the score breakdown, and the global top five for the campaign (below).

### The global leaderboard

The one part of the game that uses the network. It changes no rule and no number: with no
leaderboard configured, or none reachable, it shows as unavailable and everything else plays
the same.

- **What is recorded:** one row per finished run (victory or game over; a game that is
  abandoned is not finished): campaign, empire name, flag pattern and its three colours,
  starting country, final score, countries conquered, continents held, battles fought, best
  streak, outcome, and the time the database received it. Nothing identifies the player.
- **Ranking,** per campaign: final score; ties go to fewer battles fought, then to the
  earlier run.
- **End screen:** the global top five for the campaign just played, with the player's run
  picked out in gold. A run outside the top five is shown below it with its rank.
- **Start screen:** a Leaderboard button to the right of Rules opens a page, in place of the
  map, with the top five of each of the seven campaigns. Nothing is asked of the leaderboard
  until that page is opened or a run ends.
- **One row per run.** Each game gets a random id, kept beside the save. Looking at the end
  screen again after a refresh sends the same id, and the database keeps one row for it.
- **Names** are checked by one pure function, `validateEmpireName` in
  `src/names/validateEmpireName.ts`, which returns valid or invalid and a reason code
  (`empty`, `invalid_characters`, `too_short`, `too_long`, `not_allowed`):
  - Letters A to Z, apostrophes inside or at the end of a word (O'Brien, King's, Dragons')
    and single spaces, 3 to 24 characters after trimming. A curly apostrophe (as phones type
    it) becomes a straight one. Anything else never reaches the field while typing; the hint
    under it reads "Letters and apostrophes, 3 to 24 characters".
  - Words on the allowlist (`src/names/allowed-names.json`: Essex, Scunthorpe, Pakistan,
    Japan, spice, raccoon...) are taken out first, as whole words only.
  - The rest is checked with apostrophes ignored (so N'igger is caught), as typed, with the
    spaces removed, and with letters repeated three or
    more times squeezed, against the obscenity library's English list and the custom
    blocklist (`src/names/blocked-names.json`), whose terms are refused anywhere inside the
    name.
  - A name that fails shows "That name isn't allowed. Try another." (never the word) and
    disables Begin conquest. An empty name is allowed: the empire is named after its home
    country ("Empire of Germany", or the country's own name, or "New Empire" where the country's
    name is too long). A saved name that no longer passes becomes "New Empire".
  - The database repeats the format rules and the custom lists (`npm run names` copies them
    into `supabase/schema.sql`), but not the obscenity library.
- **The database** is a Supabase project set up by `supabase/schema.sql`. Anyone may read
  the table; nobody may insert, update or delete rows directly. A run gets in only through
  the function `submit_run`, which refuses anything the game could not have produced: an
  unknown campaign, a name that is too long or blocked, a flag outside the sixteen patterns
  and twelve colours, more conquests than the campaign has countries, a victory that is not
  every country, a score that is not conquests × one of the five multipliers + 10 per
  continent, fewer battles than conquests. The project's address and public key come from
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see `.env.example`).
- **What it does not prevent** is listed in the readme: the checks stop impossible runs,
  not invented ones.

## 15. Consequences that follow from these rules

These are derived facts, not design intentions.

- Troops cannot be farmed. The army is at most 20 to 24 after recruiting, and after that it
  grows only by conquest.
- **The army holds steady at about 89% accuracy.** A conquest pays a quarter of a troop per
  defender, and each defender costs one correct answer, with every wrong answer on the way
  costing 2 troops. Above that accuracy the army grows; below it, it shrinks. Sea crossings and
  the extra defenders of a large empire raise the reward in step with the work, so this does
  not drift as the game goes on.
- A Hard answer kills 2 defenders, so an obscure country takes fewer answers than it has
  defenders. That is the only advantage obscurity brings; the troops are the same.
- Every defender is worth the same, so no size of country is better value than another.
- All 229 conquests of a World game are worth 349.75 troops at base strength (349,750 on
  screen; more with sea crossings and escalation). The smallest countries pay 0.75.
- Retreat still costs a quarter of the army rounded up to a whole unit, and must leave at
  least 1 unit, so an army below 2 (2,000 on screen) cannot retreat.
- The choice of start sets the opening army: a famous start tops out at 20 troops with easier
  questions, an obscure one at up to 24 with harder ones, and scores more per conquest.
- A famous target is asked Hard questions only of the genuinely hard kinds: its population
  range, which country is closest in size, which country does NOT border it (as a close call),
  and its year of independence where it has one. Those kill 2 defenders; the rest kill 1.
- Every country, however small its data, has at least the population range and "closest in
  size" to reach Hard with.
- Because an unused type beats the slot's tier, a long battle against a famous country ends
  on its leftover Easy types (capital, sea, globe line, curated fact, national sport, main
  export, history makers and stars) once the others have each been asked.
- The only way to lose is to reach 0 troops inside a battle. With 2 troops a retreat (−1)
  avoids this; with 1 troop there is no retreat and the next wrong answer ends the game.
- A wrong answer costs a flat 2 troops regardless of army size, while a retreat costs a
  quarter of the army, so retreating is cheap for a small army and expensive for a large one.
  With 2 to 4 troops a retreat costs 1, half the price of a wrong answer, and the country
  retreated from stays wounded until another country is attacked.
- Defenders grow with the empire: at 45 countries held every target has 3 more defenders; at
  150 held, 10 more.
