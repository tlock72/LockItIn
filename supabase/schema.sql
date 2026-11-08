-- LockItIn database setup (family edition).
-- Run this in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- Safe to run again: it only adds what's missing and moves older setups forward.

create extension if not exists pgcrypto;

-- ---------- tables ----------

create table if not exists games (
  id text primary key,
  name text not null,
  url text,
  better text not null default 'high' check (better in ('high', 'low')),
  max_score numeric,
  sort int not null default 0,
  active boolean not null default true
);

-- One row per family member.
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 24),
  color text,
  avatar_url text,           -- profile picture link; add later from the app or the dashboard
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
alter table players add column if not exists color text;
alter table players add column if not exists avatar_url text;
create unique index if not exists players_name_ci on players (lower(name));

-- Which person each phone/computer is logged in as. One person can use several devices.
create table if not exists devices (
  user_id uuid primary key references auth.users on delete cascade,
  player_id uuid not null references players on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists scores (
  player_id uuid not null references players on delete cascade,
  game_id text not null references games on delete cascade,
  play_date date not null,
  score numeric not null check (score >= 0),
  details jsonb,              -- extra per-game info, e.g. Krillion answer tiers
  comment text,               -- optional comment posted with the score
  created_at timestamptz not null default now(),
  primary key (player_id, game_id, play_date)
);
alter table scores add column if not exists details jsonb;
-- An optional comment posted with the score (shown on Today and in the score notification).
alter table scores add column if not exists comment text;
alter table scores drop constraint if exists scores_comment_len;
alter table scores add constraint scores_comment_len check (comment is null or char_length(comment) <= 280);
alter table scores add column if not exists comment_at timestamptz;  -- when the comment was last written (orders it in the day chat)

-- ---------- move older setups forward (invite codes and PINs are gone) ----------
do $$ begin
  if exists (select 1 from information_schema.columns where table_name = 'players' and column_name = 'user_id') then
    insert into devices (user_id, player_id)
      select user_id, id from players where user_id is not null
      on conflict (user_id) do nothing;
    alter table players drop column user_id;
  end if;
end $$;
alter table players drop column if exists pin_hash;
drop function if exists join_group(text, text);
drop function if exists reclaim_player(text, text);
drop function if exists set_invite_code(text);
drop function if exists whoami();
drop table if exists settings;

-- ---------- helpers ----------

create or replace function my_player_id() returns uuid
language sql stable security definer set search_path = public as $$
  select player_id from devices where user_id = auth.uid()
$$;

create or replace function i_am_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin from players p join devices d on d.player_id = p.id where d.user_id = auth.uid()), false)
$$;

-- ---------- row level security ----------

alter table games   enable row level security;
alter table players enable row level security;
alter table devices enable row level security;  -- no policies: only the functions below touch it
alter table scores  enable row level security;

drop policy if exists games_read on games;
create policy games_read on games for select to authenticated using (true);
drop policy if exists games_admin on games;
create policy games_admin on games for all to authenticated using (i_am_admin()) with check (i_am_admin());

-- Everyone signed in can see the family list (that's how you pick yourself on a new device).
drop policy if exists players_read on players;
create policy players_read on players for select to authenticated using (true);

drop policy if exists scores_read on scores;
create policy scores_read on scores for select to authenticated using (my_player_id() is not null);
drop policy if exists scores_write_own on scores;
create policy scores_write_own on scores for insert to authenticated with check (player_id = my_player_id());
drop policy if exists scores_update_own on scores;
create policy scores_update_own on scores for update to authenticated using (player_id = my_player_id()) with check (player_id = my_player_id());
drop policy if exists scores_delete_own on scores;
create policy scores_delete_own on scores for delete to authenticated using (player_id = my_player_id() or i_am_admin());

grant usage on schema public to authenticated;
grant select, insert, update, delete on games, scores to authenticated;
revoke all on games, scores from anon;
revoke all on players, devices from anon, authenticated;
grant select on players to authenticated;

-- ---------- actions the app calls ----------

create or replace function whoami() returns table (id uuid, name text, color text, avatar_url text, is_admin boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.color, p.avatar_url, p.is_admin
  from players p join devices d on d.player_id = p.id where d.user_id = auth.uid()
$$;

-- New family member. The very first person becomes the admin.
create or replace function join_family(p_name text, p_color text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_name text := btrim(p_name); v_id uuid; v_first boolean;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 24 then raise exception 'Pick a name between 1 and 24 characters'; end if;
  if exists (select 1 from players where lower(name) = lower(v_name)) then
    raise exception 'Someone is already called that. If it''s you, tap your name above';
  end if;
  select not exists (select 1 from players) into v_first;
  insert into players (name, color, is_admin) values (v_name, p_color, v_first) returning id into v_id;
  insert into devices (user_id, player_id) values (auth.uid(), v_id)
    on conflict (user_id) do update set player_id = excluded.player_id;
  return v_id;
end $$;

-- "That's me": log this device in as an existing family member.
create or replace function claim_player(p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from players where id = p_player) then raise exception 'That person isn''t in the family list'; end if;
  insert into devices (user_id, player_id) values (auth.uid(), p_player)
    on conflict (user_id) do update set player_id = excluded.player_id;
end $$;

-- "Not you?": log this device out.
create or replace function leave_device() returns void
language sql security definer set search_path = public as $$
  delete from devices where user_id = auth.uid()
$$;

-- Change your own name, color or profile picture link.
create or replace function update_me(p_name text, p_color text, p_avatar_url text) returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := my_player_id(); v_name text := btrim(p_name);
begin
  if v_me is null then raise exception 'Pick who you are first'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 24 then raise exception 'Pick a name between 1 and 24 characters'; end if;
  if exists (select 1 from players where lower(name) = lower(v_name) and id <> v_me) then raise exception 'Someone is already called that'; end if;
  update players set name = v_name, color = p_color, avatar_url = nullif(btrim(p_avatar_url), '') where id = v_me;
end $$;

-- Admins can set anyone's profile picture link and admin flag.
create or replace function admin_update_player(p_player uuid, p_avatar_url text, p_admin boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not i_am_admin() then raise exception 'Only admins can do that'; end if;
  update players set avatar_url = nullif(btrim(p_avatar_url), ''), is_admin = p_admin where id = p_player;
end $$;

drop function if exists set_admin(uuid, boolean);

revoke all on function join_family(text, text), claim_player(uuid), leave_device(), update_me(text, text, text), admin_update_player(uuid, text, boolean) from public, anon;
grant execute on function whoami(), join_family(text, text), claim_player(uuid), leave_device(), update_me(text, text, text), admin_update_player(uuid, text, boolean), my_player_id(), i_am_admin() to authenticated;

-- ---------- notifications ----------
-- Each device that switched on notifications. Only the "notify" Edge Function reads these (with the service key).
create table if not exists push_subs (
  endpoint text primary key,
  player_id uuid not null references players on delete cascade,
  sub jsonb not null,
  created_at timestamptz not null default now()
);
-- The notification keys. The Edge Function makes them the first time it runs; nobody else can read them.
create table if not exists push_config (
  id int primary key default 1 check (id = 1),
  public_key text not null,
  private_key text not null
);
-- What has already been sent, so a score or a day's winner is only announced once.
create table if not exists push_log (
  k text primary key,
  at timestamptz not null default now()
);
alter table push_subs   enable row level security;  -- no policies: only the functions below and the Edge Function touch these
alter table push_config enable row level security;
alter table push_log    enable row level security;
revoke all on push_subs, push_config, push_log from anon, authenticated;

-- Switch on notifications for this device (or move them to whoever is logged in on it now).
create or replace function save_push(p_sub jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := my_player_id(); v_end text := p_sub->>'endpoint';
begin
  if v_me is null then raise exception 'Pick who you are first'; end if;
  if v_end is null or v_end !~ '^https://' then raise exception 'That isn''t a notification address'; end if;
  insert into push_subs (endpoint, player_id, sub) values (v_end, v_me, p_sub)
    on conflict (endpoint) do update set player_id = excluded.player_id, sub = excluded.sub;
end $$;

-- Switch off notifications for this device.
create or replace function drop_push(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from push_subs where endpoint = p_endpoint
$$;

revoke all on function save_push(jsonb), drop_push(text) from public, anon;
grant execute on function save_push(jsonb), drop_push(text) to authenticated;

-- End of day: every hour a cron job asks the "notify" Edge Function to announce the winner of each game
-- for days that are over (2+ players, even if not everyone played). It proves itself with cron_secret.
alter table push_config add column if not exists cron_secret text not null
  default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('lockitin-end-of-day', '5 * * * *', $cron$
  select net.http_post(
    url := 'https://fseylrnsbljqdwibkmae.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzZXlscm5zYmxqcWR3aWJrbWFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQwNzQxOTcsImV4cCI6MjEwOTY1MDE5N30.X1WdukQWuxkH4EJKgaNw-NubHbcsorKJCdJ6ECq43pw',
      'x-cron-secret', (select cron_secret from public.push_config where id = 1)),
    body := '{"type":"eod"}'::jsonb)
  where exists (select 1 from public.push_config where id = 1)
$cron$);

-- ---------- day chat ----------
-- Each game has a running chat for each day. A score's own comment (scores.comment) shows in it too.
-- reply_to: another message's id, or "score:<player id>" to reply to that person's score comment.
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references games on delete cascade,
  play_date date not null,
  player_id uuid not null references players on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  reply_to text,
  created_at timestamptz not null default now()
);
create index if not exists messages_day on messages (game_id, play_date);
alter table messages enable row level security;
drop policy if exists messages_read on messages;
create policy messages_read on messages for select to authenticated using (my_player_id() is not null);
drop policy if exists messages_write_own on messages;
create policy messages_write_own on messages for insert to authenticated with check (player_id = my_player_id());
drop policy if exists messages_delete_own on messages;
create policy messages_delete_own on messages for delete to authenticated using (player_id = my_player_id() or i_am_admin());
grant select, insert, delete on messages to authenticated;
alter table messages replica identity full;

-- ---------- chat reactions ----------
-- Emoji reactions on day-chat items. item_id is a message id, or "score:<player id>" for that person's score comment.
create table if not exists reactions (
  game_id text not null references games on delete cascade,
  play_date date not null,
  item_id text not null,
  player_id uuid not null references players on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (game_id, play_date, item_id, player_id, emoji)
);
alter table reactions enable row level security;
drop policy if exists reactions_read on reactions;
create policy reactions_read on reactions for select to authenticated using (my_player_id() is not null);
drop policy if exists reactions_write_own on reactions;
create policy reactions_write_own on reactions for insert to authenticated with check (player_id = my_player_id());
drop policy if exists reactions_delete_own on reactions;
create policy reactions_delete_own on reactions for delete to authenticated using (player_id = my_player_id() or i_am_admin());
grant select, insert, delete on reactions to authenticated;
alter table reactions replica identity full;

-- A deleted message takes its reactions with it.
create or replace function drop_message_reactions() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from reactions where game_id = old.game_id and play_date = old.play_date and item_id = old.id::text;
  return old;
end $$;
drop trigger if exists messages_drop_reactions on messages;
create trigger messages_drop_reactions after delete on messages for each row execute function drop_message_reactions();

-- ---------- live updates ----------
do $$ begin alter publication supabase_realtime add table reactions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table messages; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table scores; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table players; exception when duplicate_object then null; end $$;

-- ---------- the family's games ----------
insert into games (id, name, url, better, max_score, sort) values
  ('krillion',   'Krillion',   'https://krillion.io',    'high', 700,   1),
  ('maptap',     'MapTap',     'https://www.maptap.gg',  'high', 1000,  2),
  ('timeguessr', 'TimeGuessr', 'https://timeguessr.com', 'high', 50000, 3)
on conflict (id) do nothing;
-- Farflung was in the first version; it's not one of the family's games.
delete from games where id = 'farflung' and not exists (select 1 from scores where game_id = 'farflung');
update games set sort = 2 where id = 'maptap';
