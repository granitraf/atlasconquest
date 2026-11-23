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
  - conquering a country: **1 troop for every 3 defenders it had, rounded, at least 1**
    (`conquestTroops`, `DEFENDERS_PER_TROOP`). The count is the country's full strength in
    that battle: its own defenders, plus the extra for the size of the player's empire, plus
    the sea bonus. A wounded country still pays for its full strength.

    | Defenders | 3–4 | 5–7 | 8–10 | 11–13 | 14–16 | 17–19 |
    |---|---|---|---|---|---|---|
    | Troops | +1 | +2 | +3 | +4 | +5 | +6 |

    Luxembourg, Malta and Palau (3 defenders) are worth 1; Ireland (6) 2; France (9) and
    Germany (10) 3; the USA (11), India and China (13) 4. How obscure a country is does not
    change what it pays. Each target's chip, its card and its map tooltip show the reward.
- Troops are lost in two ways: a wrong answer in battle (−2) and retreating (−25%,
  section 10).
- The troops for a conquest arrive when the country changes hands.
- The whole pool is committed to every battle. Outside a battle the player always has at
  least 1 troop, so an attack is always possible.

## 6. Question difficulty

A question's difficulty is not fixed by its type. It is a score:

**score = type weight + country fame + option closeness**

Score 1–2 is **Easy**, 3–4 is **Medium**, 5–6 is **Hard**.

**Type weight** (one table, `TYPE_WEIGHT`):

| Weight | Types |
|---|---|
| 1 | flag, capital, water |
| 2 | border, currency, language, domain, brand, major feature, globe line, curated fact |
| 3 | population, area, not-border |

**Country fame:** 0, 1 or 2 (section 2), for the country the question is about.

**Option closeness:** 0 or 1.

- 0: the wrong options come from anywhere in the world except the country's own subregion.
- 1: the wrong options are close calls: same subregion first, then the continent;
  neighbours-of-neighbours for border questions; lookalike flags for flag questions.
- For population, area, globe-line and curated-fact questions closeness does not apply and
  counts as 0.

**Reason-out weighting.** Water, major feature, globe line, border and language questions can
be worked out from the map and the region. For less familiar countries a set share of
non-flag slots prefers one of these when the slot's tier has one (`REASON_OUT_SHARE`):
about 60% for obscure countries, about 40% for mid-known ones, no bias for famous ones.
The other slots prefer the remaining types.

**Variety comes before the tier.** How a slot is filled, in order of importance:

1. **Type rotation.** A type is not asked a second time while another type is still unused
   (in the battle, or in the recruit phase). Twelve questions against a country with twelve
   types to ask are twelve different types.
2. **Nothing asked before.** The game remembers its last 150 questions, from the recruit phase
   and battles alike. A remembered question is passed over while the types whose turn it is
   have something new to ask.
3. **The slot's tier,** then the nearest tier (the easier one on a tie). Within a tier, types
   that cannot be asked any harder go first, which saves the others for later, harder slots.

Types with several forms (size, population, borders) take their forms in turn: the form
asked least so far comes first, so "closest in size" is one size question in five.

What each fame level can produce:

| Fame | Easy | Medium | Hard |
|---|---|---|---|
| Famous | weight-1 types; weight-2 types with far options | weight-2 types with close options; all weight-3 types | none |
| Mid-known | flag and capital with far options | everything else except… | not-border with close options |
| Obscure | none | weight-1 types; weight-2 types with far options | weight-2 types with close options; all weight-3 types |

**Rewards follow the tier a question actually scored,** not the slot it filled (sections 7
and 9). The question card shows the tier.

## 7. Recruit phase (once, at the start)

- 5 questions about the starting country, asked once, before the first attack. It never
  comes back: not after a conquest, a retreat or anything else.
- Slots: **flag, Easy, Medium, Medium, Hard.**
- The first question is always the starting country's flag. Its closeness is a coin flip
  (`FLAG_CLOSE_CHANCE`, 0.5) and its tier is whatever the score works out to.
- Every other slot is filled by the rules in section 6: an unused type, then the slot's tier
  or the nearest achievable one. The five questions are five different types.
- Reward per correct answer: Easy 1 troop, Medium 2, Hard 3. Wrong answer: 0.
- **The fifth correct answer in a row is doubled** (`streakMultiplier`: ×2 once the streak
  reaches 5).
- **What a perfect phase is worth depends on the start.** A famous country has no Hard
  questions: 1 + 1 + 2 + 2 + (2 × 2) = 10, taking the army from 10 to 20. A mid-known country
  that can reach Hard ends on 3 × 2, and its flag can score Medium: up to 23. An obscure country has no Easy questions:
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
- Slots: **flag, Easy, Medium, Medium,** then each further question is **Hard 75% of the
  time and Medium 25%.** Slots are filled as in the recruit phase, with the same
  nearest-tier fallback. The opening flag's closeness is the same coin flip.
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

Fourteen types, four options each, all generated from bundled data. In every question the
country is named in the prompt and the answer is something about it, never its own name:
an answer that would name the country ("Niger River" for Niger, "Indian Ocean" for India,
the capital "Djibouti" for Djibouti) is never used. The one exception is the line-up
("which of these is the biggest?"), which ranks the country against three others: there the
country is one of the four options, and is sometimes the answer.

| Weight | Type | Prompt | Notes |
|---|---|---|---|
| 1 | Flag | Which flag belongs to X? | Four flag images. See flag rules below. |
| 1 | Capital | What is the capital of X? | Skipped where the capital carries the country's name. 214 of 230 qualify. |
| 1 | Water | Which sea or ocean does X border? | Coastal countries only; 21 named seas and oceans. Wrong options are bodies the country does not touch, not even arguably. 179 qualify. |
| 2 | Border | Which country borders X? / Which country borders both X and Y? / Which country borders X to the east? / Which of these neighbours of X is landlocked? (or: is not landlocked?) | Four forms, taken in turn. The answer is never a country the player holds. In "borders both", Y is a held neighbour when there is one, so the player's own map is the clue. "To the east" is asked only where the neighbour's centre lies within 30° of that compass point, never about a microstate or an enclave, and no wrong option is a neighbour on that side. In the landlocked form all four options are real neighbours. 161 qualify. |
| 2 | Currency | What currency does X use? | Options are the kind only ("Dinar", not "Serbian Dinar"). Lookalike kinds (krona/krone, rial/riyal) are never offered together. |
| 2 | Language | Which is an official language of X? | One variant per official language. Corrections live in `config/languages.json`: for Kosovo the only language asked about is Albanian, and Serbian is never shown as an option. |
| 2 | Domain | What is the internet domain of X? | Close options are guessable codes from the name and real domains with the same first letter; far options are unrelated real domains. 229 qualify. |
| 2 | Brand | Which company was founded in X? | From a hand-picked list in `src/game/brands.ts`. 52 qualify. |
| 2 | Major feature | Which river flows through X? / Which desert lies in X? / Which mountain range runs through X? / Which rainforest is found in X? | Only where the country has a well-known one; options are always the same kind of feature. 105 qualify. |
| 2 | Globe line | Which of these lines on the globe passes through X? | Equator, the two tropics, the Arctic Circle and the Prime Meridian, worked out from the country's shape, with "None of these" as an option. 47 qualify. |
| 2 | Curated fact | (written per fact) | Famous people, top exports, highest mountains, landmarks, dishes, former names and one-off hooks. See below. All 230 qualify. |
| 3 | Population | What is the population of X? / Which of these has the most people? / Which of these has the fewest people? | Three forms, taken in turn. The range form shows four adjacent ranges out of ten (under 10k … over 250M). The line-ups rank X against three countries from its region; the winner leads by at least 1.3×. No closeness. |
| 3 | Area | Which of these is larger than X? / smaller than X? / Which of these is the biggest by area? / the smallest? / Which is closest in size to X? | Five forms, taken in turn. "Biggest" and "smallest" are line-ups of X and three countries from its region. Compared areas always differ by at least 1.3×. Effectively unlimited variants. No closeness. |
| 3 | Not-border | Which of these does NOT border X? | Needs 3+ neighbours, at least two of which the player does not hold; at most one held neighbour is shown. 113 qualify. |

A type is skipped for a country that lacks the data.

**Flag rules:**

- **Identical flags** (Chad and Romania, Indonesia and Monaco, and any two countries sharing
  one flag file) are never offered together, at any difficulty.
- **Lookalike flags** (Ireland and Côte d'Ivoire, Netherlands and Luxembourg, and 21 more
  groups in `LOOKALIKE_FLAGS`) are offered together only when closeness is 1, where they are
  the preferred wrong options.

**Seas, features and globe lines** come from `config/geography.json` and the map shapes,
applied by `npm run derive`. Each sea and feature lists the countries that clearly have it
and an "avoid" list of arguable cases (a river that only touches a border, a sea a country
barely reaches). An avoided item is never the right answer and never a wrong option.

**Curated facts** live in `public/data/facts.json` (706 facts; reviewed in
`reports/facts-review.md`).

- Each fact has a country, a category (landmark, person, food, history, nature, culture,
  film, sport, economy), a prompt, an answer and a recognition rating: 3 known worldwide,
  2 known to a well-read player, 1 known mostly inside the country.
- **A fact is asked only if its recognition is 2 or higher** (`FACT_MIN_RECOGNITION`). If a
  country has nothing that qualifies in a category, that category is simply not asked about
  it; there is no filler.
- **Hooks:** every one of the 230 countries has at least one memorable, specific fact (178
  have one, 46 have two, 6 have three), phrased as a question about that country.
- **Wrong options** are either hand-picked for that fact, or answers to the same kind of fact
  about other countries, nearest regions first. An option is never something that is also
  true for the country: answers shared between countries (a peak on a border, a dish claimed
  by neighbours) list those countries, and closely related answers (oil and gas as exports)
  are never set against each other.

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
  battles fought and the score breakdown.

## 15. Consequences that follow from these rules

These are derived facts, not design intentions.

- Troops cannot be farmed. The army is at most 20 to 24 after recruiting, and after that it
  grows only by conquest.
- **The army holds steady at about 86% accuracy.** A conquest pays a third of a troop per
  defender, and each defender costs one correct answer, with every wrong answer on the way
  costing 2 troops. Above that accuracy the army grows; below it, it shrinks. Sea crossings and
  the extra defenders of a large empire raise the reward in step with the work, so this does
  not drift as the game goes on.
- A Hard answer kills 2 defenders, so an obscure country takes fewer answers than it has
  defenders. That is the only advantage obscurity brings; the troops are the same.
- Rounding makes 5, 8, 11 and 14 defenders the best value per defender, and 4, 7, 10 and 13
  the worst.
- All 229 conquests of a World game are worth 466 troops at base strength (more with sea
  crossings and escalation). Every country pays at least 1.
- The choice of start sets the opening army: a famous start tops out at 20 troops with easier
  questions, an obscure one at up to 24 with harder ones, and scores more per conquest.
- A famous target can never be asked a Hard question, so every correct answer against it
  kills exactly 1 defender. Against an obscure target most late questions are Hard and kill 2.
- A mid-known target has a single Hard combination (not-border with close options), which
  needs three land neighbours. Mid-known islands and countries with fewer neighbours never
  produce a Hard question; mid-known countries that do qualify are asked it once per battle,
  in the first Hard slot, and the other late slots are Medium.
- Because an unused type beats the slot's tier, a long battle against a famous country ends
  on its leftover Easy types (capital, sea, globe line, curated fact) once the Medium ones
  have each been asked.
- The only way to lose is to reach 0 troops inside a battle. With 2 troops a retreat (−1)
  avoids this; with 1 troop there is no retreat and the next wrong answer ends the game.
- A wrong answer costs a flat 2 troops regardless of army size, while a retreat costs a
  quarter of the army, so retreating is cheap for a small army and expensive for a large one.
  With 2 to 4 troops a retreat costs 1, half the price of a wrong answer, and the country
  retreated from stays wounded until another country is attacked.
- Defenders grow with the empire: at 45 countries held every target has 3 more defenders; at
  150 held, 10 more.
