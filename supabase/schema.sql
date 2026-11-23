-- Atlas Conquest: the global leaderboard.
--
-- Run this whole file once in the Supabase dashboard: SQL editor > New query > paste > Run.
-- It is safe to run again: it creates what is missing and replaces the functions.
--
-- What it sets up:
--   * one table, public.runs: one row per finished run, nothing that identifies a player;
--   * anyone may READ it (the page's public key included);
--   * nobody may insert, update or delete rows directly. A run gets in through one door only,
--     the function submit_run, which checks everything it is told before it stores a row;
--   * top_runs, which returns the best runs of a campaign in ranking order.
--
-- The numbers in here (countries per campaign, start multipliers, the flag palette, the name
-- length, the name filter) mirror the game's own. tests/leaderboard.test.ts and tests/names.test.ts fail if they drift.

-- ------------------------------------------------------------------ the table

create table if not exists public.runs (
  run_id        uuid         primary key,
  campaign      text         not null check (campaign in ('World', 'Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania')),
  empire_name   text         not null check (char_length(empire_name) between 1 and 22),
  flag_pattern  smallint     not null check (flag_pattern between 0 and 15),
  flag_colours  text[]       not null check (array_length(flag_colours, 1) = 3),
  start_country text         not null check (start_country ~ '^[A-Z]{3}$'),
  score         numeric(7,1) not null check (score >= 0),
  conquered     smallint     not null check (conquered >= 0),
  continents    smallint     not null check (continents >= 0),
  battles       integer      not null check (battles >= 0),
  best_streak   integer      not null check (best_streak >= 0),
  outcome       text         not null check (outcome in ('victory', 'defeat')),
  -- Set by the database, never by the player, so a run cannot be back-dated to win a tie.
  created_at    timestamptz  not null default now()
);

-- The ranking order: best score first, then fewer battles, then the earlier run.
create index if not exists runs_ranking on public.runs (campaign, score desc, battles, created_at, run_id);

-- ------------------------------------------------------------------ who may do what

alter table public.runs enable row level security;

drop policy if exists "Anyone may read the leaderboard" on public.runs;
create policy "Anyone may read the leaderboard" on public.runs
  for select to anon, authenticated using (true);

-- No policy allows insert, update or delete, so row level security refuses all three.
-- The table privileges say the same thing a second time.
revoke all on table public.runs from anon, authenticated;
grant select on table public.runs to anon, authenticated;

-- ------------------------------------------------------------------ names

-- The name filter, the same one the game applies (src/game/names.ts): slurs, racist, extremist and
-- sexual terms and swearing, seen through numbers for letters (n1gga), spaced letters (N I G G A),
-- stretched letters (niiigga), look-alike letters from other alphabets (fцck) and starred-out letters (f*ck).
-- tests/names.test.ts runs this function and checks it agrees with the game's on every test name.
create or replace function public.atlas_name_allowed(p_name text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $fn$
declare
  v_plain  text;
  v_text   text;
  v_word   text;
  v_run    text;
  v_pass   integer;
begin
  if p_name is null then
    return false;
  end if;
  -- Numbers that are hate symbols in their own right: 1488, 14/88.
  if p_name ~* '1[^0-9a-z]*4[^0-9a-z]*8[^0-9a-z]*8' then
    return false;
  end if;
  -- The name as the filter reads it: accents and look-alike letters from other alphabets undone,
  -- lower case, digits and symbols turned back into the letters they stand for, ph read as f.
  v_plain := regexp_replace(normalize(p_name, NFKD), '[\u0300-\u036f]', '', 'g');
  v_plain := translate(v_plain, 'АВЕКМНОРСТУХІЈЅЦПаеорсухіјѕцпԁɡΑΒΕΖΗΙΚΜΝΟΡΤΥΧαβεικνορτυχ', 'abekmhopctyxijsunaeopcyxijsundgabezhikmnoptyxabeikvoptux');
  v_plain := translate(lower(v_plain), '0123456789@$!|+€£(¢¡', 'oizeasgtbgasiitelcci');
  v_plain := replace(v_plain, 'ph', 'f');

  -- Everything run together: f.u.c.k, N I G G A, xXfuckXx.
  if regexp_replace(v_plain, '[^a-z]', '', 'g') ~ '(n+i+g+g+e+r+|n+i+g+g+a+|f+a+g+g+o+t+|w+e+t+b+a+c+k+|r+a+g+h+e+a+d+|t+o+w+e+l+h+e+a+d+|g+o+l+l+i+w+o+g+|r+e+d+s+k+i+n+|h+a+l+f+b+r+e+e+d+|z+i+p+p+e+r+h+e+a+d+|s+l+a+n+t+e+y+e+|c+h+i+n+a+m+a+n+|r+e+g+g+i+n+|h+i+t+l+e+r+|h+i+m+m+l+e+r+|g+o+e+b+b+e+l+s+|m+e+n+g+e+l+e+|m+[uv]+s+s+o+l+i+n+i+|n+e+o+n+a+z+i+|s+i+e+g+h+e+i+l+|s+w+a+s+t+i+k+a+|f+[uv]+h+r+e+r+|f+[uv]+e+h+r+e+r+|w+h+i+t+e+p+o+w+e+r+|w+h+i+t+e+p+r+i+d+e+|k+[uv]+k+l+[uv]+x+k+l+a+n+|k+k+k+|h+o+l+o+c+a+[uv]+s+t+|g+e+n+o+c+i+d+e+|e+t+h+n+i+c+c+l+e+a+n+s+i+n+g+|t+e+r+r+o+r+i+s+t+|t+e+r+r+o+r+i+s+m+|a+l+q+a+e+d+a+|a+l+q+a+i+d+a+|t+a+l+i+b+a+n+|b+i+n+l+a+d+e+n+|p+o+l+p+o+t+|p+o+r+n+|[uv]+a+g+i+n+a+|o+r+g+a+s+m+|n+i+p+p+l+e+|t+i+t+t+i+e+s+|b+l+o+w+j+o+b+|h+a+n+d+j+o+b+|r+i+m+j+o+b+|c+[uv]+m+s+h+o+t+|j+i+z+z+|h+e+n+t+a+i+|p+e+d+o+f+i+l+e+|p+a+e+d+o+f+i+l+e+|m+o+l+e+s+t+|b+e+s+t+i+a+l+i+t+y+|n+e+c+r+o+f+i+l+|w+h+o+r+e+|p+[uv]+s+s+y+|s+k+a+n+k+|f+[uv]+c+k+|a+s+s+h+o+l+e+|a+r+s+e+h+o+l+e+|b+i+t+c+h+|b+o+l+l+o+c+k+s+|d+i+c+k+h+e+a+d+|c+o+c+k+s+[uv]+c+k+e+r+|d+o+[uv]+c+h+e+b+a+g+|d+[uv]+m+b+a+s+s+|j+a+c+k+a+s+s+|b+e+l+l+e+n+d+|s+h+i+t+h+o+l+e+|s+h+i+t+h+e+a+d+|b+[uv]+l+l+s+h+i+t+|h+o+r+s+e+s+h+i+t+|d+i+p+s+h+i+t+|w+a+n+k+e+r+|k+i+l+l+y+o+[uv]+r+s+e+l+f+)' then
    return false;
  end if;

  -- Word by word, reading punctuation first as a gap (d.i.c.k), then as nothing at all (sh.it).
  -- Runs of single letters are joined back into one word: "n i g g a".
  for v_pass in 1..2 loop
    v_text := case when v_pass = 1 then regexp_replace(v_plain, '[^a-z]+', ' ', 'g') else regexp_replace(v_plain, '[^a-z ]', '', 'g') end;
    v_run := '';
    foreach v_word in array string_to_array(v_text, ' ') || array['']::text[] loop
      if char_length(v_word) = 1 then
        v_run := v_run || v_word;
        continue;
      end if;
      if v_run <> '' and v_run ~ '^(n+e+g+r+o+|c+o+o+n+|s+p+i+c+|c+h+i+n+k+|g+o+o+k+|k+i+k+e+|b+e+a+n+e+r+|p+a+k+i+|j+a+p+|w+o+g+|i+n+j+[uv]+n+|g+y+p+p+o+|g+y+p+o+|p+i+k+e+y+|h+o+n+k+y+|k+r+a+[uv]+t+|y+i+d+|h+e+e+b+|d+a+g+o+|w+o+p+|s+q+[uv]+a+w+|d+a+r+k+i+e+|d+a+r+k+y+|f+a+g+|d+y+k+e+|t+r+a+n+n+y+|h+o+m+o+|s+p+a+z+|s+p+a+s+t+i+c+|r+e+t+a+r+d+|r+e+t+a+r+d+e+d+|n+g+g+e+r+|n+g+g+r+|n+g+g+a+|n+i+g+g+|n+a+z+i+|h+e+i+l+|r+e+i+c+h+|a+r+y+a+n+|s+t+a+l+i+n+|i+s+i+s+|j+i+h+a+d+|k+l+a+n+|s+e+x+|s+e+x+y+|p+e+n+i+s+|c+[uv]+m+|s+e+m+e+n+|d+i+l+d+o+|a+n+a+l+|a+n+[uv]+s+|o+r+g+y+|h+o+r+n+y+|b+o+o+b+|t+i+t+s+|t+i+t+t+y+|c+l+i+t+|m+i+l+f+|x+x+x+|s+l+[uv]+t+|t+h+o+t+|r+a+p+e+|r+a+p+i+s+t+|p+e+d+o+|p+a+e+d+o+|i+n+c+e+s+t+|f+[uv]+k+|f+[uv]+q+|f+c+k+|f+k+|f+c+[uv]+k+|f+[uv]+k+k+|s+h+i+t+|s+h+i+t+t+y+|s+h+t+|a+s+s+|a+r+s+e+|c+[uv]+n+t+|c+n+t+|t+w+a+t+|d+i+c+k+|d+c+k+|c+o+c+k+|p+r+i+c+k+|p+i+s+s+|p+i+s+s+e+d+|c+r+a+p+|b+a+s+t+a+r+d+|b+[uv]+g+g+e+r+|t+o+s+s+e+r+|m+i+n+g+e+|w+a+n+k+|d+o+[uv]+c+h+e+|b+t+c+h+|k+y+s+|s+[uv]+i+c+i+d+e+)(s|es|z)?$' then
        return false;
      end if;
      v_run := '';
      if v_word <> '' and v_word ~ '^(n+e+g+r+o+|c+o+o+n+|s+p+i+c+|c+h+i+n+k+|g+o+o+k+|k+i+k+e+|b+e+a+n+e+r+|p+a+k+i+|j+a+p+|w+o+g+|i+n+j+[uv]+n+|g+y+p+p+o+|g+y+p+o+|p+i+k+e+y+|h+o+n+k+y+|k+r+a+[uv]+t+|y+i+d+|h+e+e+b+|d+a+g+o+|w+o+p+|s+q+[uv]+a+w+|d+a+r+k+i+e+|d+a+r+k+y+|f+a+g+|d+y+k+e+|t+r+a+n+n+y+|h+o+m+o+|s+p+a+z+|s+p+a+s+t+i+c+|r+e+t+a+r+d+|r+e+t+a+r+d+e+d+|n+g+g+e+r+|n+g+g+r+|n+g+g+a+|n+i+g+g+|n+a+z+i+|h+e+i+l+|r+e+i+c+h+|a+r+y+a+n+|s+t+a+l+i+n+|i+s+i+s+|j+i+h+a+d+|k+l+a+n+|s+e+x+|s+e+x+y+|p+e+n+i+s+|c+[uv]+m+|s+e+m+e+n+|d+i+l+d+o+|a+n+a+l+|a+n+[uv]+s+|o+r+g+y+|h+o+r+n+y+|b+o+o+b+|t+i+t+s+|t+i+t+t+y+|c+l+i+t+|m+i+l+f+|x+x+x+|s+l+[uv]+t+|t+h+o+t+|r+a+p+e+|r+a+p+i+s+t+|p+e+d+o+|p+a+e+d+o+|i+n+c+e+s+t+|f+[uv]+k+|f+[uv]+q+|f+c+k+|f+k+|f+c+[uv]+k+|f+[uv]+k+k+|s+h+i+t+|s+h+i+t+t+y+|s+h+t+|a+s+s+|a+r+s+e+|c+[uv]+n+t+|c+n+t+|t+w+a+t+|d+i+c+k+|d+c+k+|c+o+c+k+|p+r+i+c+k+|p+i+s+s+|p+i+s+s+e+d+|c+r+a+p+|b+a+s+t+a+r+d+|b+[uv]+g+g+e+r+|t+o+s+s+e+r+|m+i+n+g+e+|w+a+n+k+|d+o+[uv]+c+h+e+|b+t+c+h+|k+y+s+|s+[uv]+i+c+i+d+e+)(s|es|z)?$' then
        return false;
      end if;
    end loop;
  end loop;
  return true;
end;
$fn$;

-- ------------------------------------------------------------------ recording a run

-- The only way a run gets into the table. It checks that the run is one the game could have
-- produced, stores it (once per run id) and returns its place in its campaign.
create or replace function public.submit_run(
  p_run_id        uuid,
  p_campaign      text,
  p_empire_name   text,
  p_flag_pattern  integer,
  p_flag_colours  text[],
  p_start_country text,
  p_score         numeric,
  p_conquered     integer,
  p_continents    integer,
  p_battles       integer,
  p_best_streak   integer,
  p_outcome       text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_countries  integer;
  v_continents integer;
  v_name       text;
  v_run        public.runs%rowtype;
  v_rank       integer;
begin
  if p_run_id is null or p_campaign is null or p_empire_name is null or p_flag_pattern is null or p_flag_colours is null
     or p_start_country is null or p_score is null or p_conquered is null or p_continents is null or p_battles is null
     or p_best_streak is null or p_outcome is null then
    raise exception 'A run needs every field.';
  end if;

  -- The campaign: how many countries it has, and how many continents can be held in it.
  select c.countries, c.continents into v_countries, v_continents
  from (values
    ('World', 230, 6),
    ('Africa', 56, 1),
    ('Asia', 49, 1),
    ('Europe', 51, 1),
    ('North America', 38, 1),
    ('South America', 13, 1),
    ('Oceania', 23, 1)
  ) as c(name, countries, continents)
  where c.name = p_campaign;
  if not found then
    raise exception 'Unknown campaign.';
  end if;

  -- The empire's name: the game's own length limit, no control characters, and the filter.
  v_name := btrim(regexp_replace(p_empire_name, '[[:space:]]+', ' ', 'g'));
  if char_length(v_name) not between 1 and 22 or v_name ~ '[[:cntrl:]]' then
    raise exception 'That empire name is not valid.';
  end if;
  if not public.atlas_name_allowed(v_name) then
    raise exception 'That empire name is not allowed.';
  end if;

  -- The flag: one of the game's sixteen patterns, in three colours from its palette.
  if p_flag_pattern not between 0 and 15 then
    raise exception 'Unknown flag pattern.';
  end if;
  if array_ndims(p_flag_colours) is distinct from 1 or array_length(p_flag_colours, 1) is distinct from 3
     or not (p_flag_colours <@ array['#f4f4ec', '#1b1f33', '#d8343c', '#ef7d2e', '#ffcd3c', '#2fa84f', '#1fa2a0', '#5fb3f2', '#2b4fc4', '#7b3fb5', '#f078b4', '#8a5a3b']) then
    raise exception 'Flag colours must be three colours from the palette.';
  end if;

  if p_start_country !~ '^[A-Z]{3}$' then
    raise exception 'Unknown starting country.';
  end if;

  if p_outcome not in ('victory', 'defeat') then
    raise exception 'Unknown outcome.';
  end if;

  -- The starting country is given, not conquered, so the most there is to conquer is one fewer.
  if p_conquered not between 0 and v_countries - 1 then
    raise exception 'More countries conquered than the campaign has.';
  end if;
  -- A victory is every country; anything less is a defeat.
  if (p_outcome = 'victory') <> (p_conquered = v_countries - 1) then
    raise exception 'The outcome does not match the countries conquered.';
  end if;
  -- Holding every continent of a campaign is the same thing as winning it.
  if p_continents not between 0 and v_continents or (p_outcome = 'victory') <> (p_continents = v_continents) then
    raise exception 'The continents held do not match the outcome.';
  end if;

  -- The score is countries conquered x the start's multiplier + 10 per continent, and the
  -- multiplier is one of five. So no score can be higher than the campaign allows, and none
  -- can be a number the game never produces.
  if not exists (
    select 1 from unnest(array[1, 1.5, 2, 2.5, 3]) as m
    where round(p_conquered * m + p_continents * 10, 1) = p_score
  ) then
    raise exception 'The score does not add up.';
  end if;

  -- Every conquest takes a battle, and a defeat is one more battle that was lost.
  if p_battles < p_conquered + (case when p_outcome = 'defeat' then 1 else 0 end) or p_battles > 100000 then
    raise exception 'The battles fought do not match the countries conquered.';
  end if;
  -- A conquest ends on a right answer, so it leaves a streak of at least one.
  if p_best_streak not between 0 and 100000 or (p_conquered > 0 and p_best_streak < 1) then
    raise exception 'The best streak does not match the countries conquered.';
  end if;

  -- One row per run id: sending a run again changes nothing and returns the same place.
  insert into public.runs (run_id, campaign, empire_name, flag_pattern, flag_colours, start_country, score, conquered, continents, battles, best_streak, outcome)
  values (p_run_id, p_campaign, v_name, p_flag_pattern, p_flag_colours, p_start_country, p_score, p_conquered, p_continents, p_battles, p_best_streak, p_outcome)
  on conflict (run_id) do nothing;

  select r.* into v_run from public.runs r where r.run_id = p_run_id;

  -- Its place: one more than the number of runs in the campaign that rank above it.
  select count(*) + 1 into v_rank
  from public.runs r
  where r.campaign = v_run.campaign
    and (r.score > v_run.score
      or (r.score = v_run.score and (r.battles < v_run.battles
        or (r.battles = v_run.battles and (r.created_at < v_run.created_at
          or (r.created_at = v_run.created_at and r.run_id < v_run.run_id))))));
  return v_rank;
end;
$$;

-- ------------------------------------------------------------------ reading the leaderboard

-- The best runs of one campaign, or of every campaign when p_campaign is null, best first.
create or replace function public.top_runs(p_campaign text default null, p_limit integer default 5)
returns table (
  rank          bigint,
  run_id        uuid,
  campaign      text,
  empire_name   text,
  flag_pattern  smallint,
  flag_colours  text[],
  start_country text,
  score         numeric,
  conquered     smallint,
  continents    smallint,
  battles       integer,
  best_streak   integer,
  outcome       text,
  created_at    timestamptz
)
language sql
stable
set search_path = ''
as $$
  select ranked.place, ranked.run_id, ranked.campaign, ranked.empire_name, ranked.flag_pattern, ranked.flag_colours,
         ranked.start_country, ranked.score, ranked.conquered, ranked.continents, ranked.battles, ranked.best_streak,
         ranked.outcome, ranked.created_at
  from (
    select r.*, row_number() over (partition by r.campaign order by r.score desc, r.battles asc, r.created_at asc, r.run_id asc) as place
    from public.runs r
    where p_campaign is null or r.campaign = p_campaign
  ) as ranked
  where ranked.place <= least(greatest(coalesce(p_limit, 5), 1), 50)
  order by ranked.campaign, ranked.place;
$$;

-- ------------------------------------------------------------------ who may call the functions

revoke all on function public.submit_run(uuid, text, text, integer, text[], text, numeric, integer, integer, integer, integer, text) from public;
grant execute on function public.submit_run(uuid, text, text, integer, text[], text, numeric, integer, integer, integer, integer, text) to anon, authenticated;
grant execute on function public.top_runs(text, integer) to anon, authenticated;
grant execute on function public.atlas_name_allowed(text) to anon, authenticated;

-- Tell the API layer about the new functions straight away.
notify pgrst, 'reload schema';

-- To remove a run by hand (an offensive name that got past the filter, an obvious fake):
--   delete from public.runs where run_id = '...';
-- in this SQL editor, which is not bound by the rules above.
