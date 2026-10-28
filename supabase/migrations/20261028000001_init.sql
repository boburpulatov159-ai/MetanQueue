-- MetanQueue: core schema, row level security and queue functions.
-- Rule: clients never write queue/station tables directly; every change goes
-- through a SECURITY DEFINER function that checks who is calling.

-- ============ Types ============
create type public.station_status as enum ('pending', 'verified', 'rejected', 'suspended');
create type public.work_status as enum ('open', 'break', 'closed');
create type public.methane_status as enum ('available', 'low', 'none');
create type public.member_role as enum ('owner', 'operator');
create type public.ticket_status as enum ('waiting', 'called', 'arrived', 'served', 'no_show', 'cancelled');

-- ============ Tables ============
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (char_length(full_name) between 1 and 100),
  phone text unique check (phone ~ '^\+998[0-9]{9}$'), -- one account per phone number
  is_admin boolean not null default false,
  banned_until timestamptz,
  created_at timestamptz not null default now()
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Uzbek plates normalized: uppercase, no spaces, e.g. 01A123BC / 01123ABC
  plate text not null check (plate ~ '^[0-9]{2}[A-Z0-9]{4,7}$'),
  model text check (char_length(model) <= 60),
  created_at timestamptz not null default now(),
  unique (user_id, plate)
);

create table public.stations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  address text not null check (char_length(address) between 5 and 200),
  phone text not null check (phone ~ '^\+998[0-9]{9}$'),
  -- Tashkent city + region bounding box: stops stations "placed" elsewhere
  lat double precision not null check (lat between 40.5 and 42.4),
  lng double precision not null check (lng between 68.5 and 71.0),
  opens time,
  closes time, -- both null = 24/7
  columns smallint not null default 2 check (columns between 1 and 30),
  avg_service_min smallint not null default 5 check (avg_service_min between 1 and 60),
  max_queue smallint not null default 60 check (max_queue between 1 and 500),
  call_timeout_min smallint not null default 10 check (call_timeout_min between 3 and 60),
  status public.station_status not null default 'pending',
  work_status public.work_status not null default 'closed',
  methane public.methane_status not null default 'available',
  status_updated_at timestamptz not null default now(),
  -- bumped on every queue change; clients subscribe to this row via Realtime
  queue_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.station_members (
  station_id uuid not null references public.stations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null,
  created_at timestamptz not null default now(),
  primary key (station_id, user_id)
);

-- Private verification data, never shown on the public map.
create table public.station_applications (
  station_id uuid primary key references public.stations (id) on delete cascade,
  applicant_id uuid not null references public.profiles (id),
  company_name text not null check (char_length(company_name) between 2 and 120),
  inn text not null check (inn ~ '^[0-9]{9}$'),
  station_type text not null check (station_type in ('agnks', 'multi_fuel')),
  note text check (char_length(note) <= 1000),
  reject_reason text check (char_length(reject_reason) <= 500),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.queue_tickets (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null, -- null = walk-in issued by operator
  plate text not null check (plate ~ '^[0-9]{2}[A-Z0-9]{4,7}$'),
  service_date date not null,
  number integer not null check (number > 0),
  status public.ticket_status not null default 'waiting',
  created_at timestamptz not null default now(),
  called_at timestamptz,
  arrived_at timestamptz,
  finished_at timestamptz,
  unique (station_id, service_date, number)
);

-- Double-booking guards, enforced by the database even under concurrent requests.
create unique index one_active_ticket_per_user on public.queue_tickets (user_id)
  where status in ('waiting', 'called', 'arrived') and user_id is not null;
create unique index one_active_ticket_per_plate on public.queue_tickets (plate)
  where status in ('waiting', 'called', 'arrived');
create index tickets_station_active on public.queue_tickets (station_id, number)
  where status in ('waiting', 'called', 'arrived');
create index tickets_user_created on public.queue_tickets (user_id, created_at);

-- Append-only audit log.
create table public.queue_events (
  id bigint generated always as identity primary key,
  station_id uuid not null references public.stations (id) on delete cascade,
  ticket_id uuid references public.queue_tickets (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index events_station_created on public.queue_events (station_id, created_at desc);

-- ============ Helpers ============
-- Admin rights count only in a session confirmed with a second factor (TOTP).
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;

create function public.is_member(p_station uuid, p_owner_only boolean default false) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.station_members
    where station_id = p_station and user_id = auth.uid()
      and (not p_owner_only or role = 'owner')
  )
$$;

create function public.tashkent_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Tashkent')::date
$$;

create function public.require_user() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if exists (select 1 from public.profiles where id = uid and banned_until > now()) then
    raise exception 'banned' using errcode = '42501';
  end if;
  return uid;
end $$;

create function public.log_event(p_station uuid, p_ticket uuid, p_action text, p_detail jsonb default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.queue_events (station_id, ticket_id, actor_id, action, detail)
  values (p_station, p_ticket, auth.uid(), p_action, p_detail);
  update public.stations set queue_updated_at = now() where id = p_station;
$$;

-- New auth user -> profile row.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ Station functions ============
create function public.apply_station(
  p_name text, p_address text, p_phone text, p_lat double precision, p_lng double precision,
  p_company text, p_inn text, p_type text, p_columns smallint default 2,
  p_opens time default null, p_closes time default null, p_note text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); sid uuid;
begin
  -- one pending application at a time limits spam/fake submissions
  if exists (select 1 from public.station_applications a join public.stations s on s.id = a.station_id
             where a.applicant_id = uid and s.status = 'pending') then
    raise exception 'application_pending' using errcode = 'P0001';
  end if;
  insert into public.stations (name, address, phone, lat, lng, columns, opens, closes)
    values (trim(p_name), trim(p_address), p_phone, p_lat, p_lng, p_columns, p_opens, p_closes)
    returning id into sid;
  insert into public.station_members (station_id, user_id, role) values (sid, uid, 'owner');
  insert into public.station_applications (station_id, applicant_id, company_name, inn, station_type, note)
    values (sid, uid, trim(p_company), p_inn, p_type, nullif(trim(p_note), ''));
  perform public.log_event(sid, null, 'station_applied');
  return sid;
end $$;

create function public.review_station(p_station uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_user();
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not p_approve and coalesce(trim(p_reason), '') = '' then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  update public.stations set status = case when p_approve then 'verified' else 'rejected' end::public.station_status
    where id = p_station and status in ('pending', 'rejected');
  if not found then raise exception 'not_pending' using errcode = 'P0001'; end if;
  update public.station_applications
    set reviewed_by = auth.uid(), reviewed_at = now(), reject_reason = case when p_approve then null else trim(p_reason) end
    where station_id = p_station;
  perform public.log_event(p_station, null, case when p_approve then 'station_verified' else 'station_rejected' end,
                           jsonb_build_object('reason', p_reason));
end $$;

create function public.set_station_suspended(p_station uuid, p_suspended boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_user();
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.stations set status = case when p_suspended then 'suspended' else 'verified' end::public.station_status,
                             work_status = case when p_suspended then 'closed' else work_status end
    where id = p_station and status in ('verified', 'suspended');
  if not found then raise exception 'not_verified' using errcode = 'P0001'; end if;
  perform public.log_event(p_station, null, case when p_suspended then 'station_suspended' else 'station_restored' end,
                           jsonb_build_object('reason', p_reason));
end $$;

create function public.set_station_status(p_station uuid, p_work public.work_status, p_methane public.methane_status)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_user();
  if not public.is_member(p_station) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.stations set work_status = p_work, methane = p_methane, status_updated_at = now()
    where id = p_station and status = 'verified';
  if not found then raise exception 'station_not_verified' using errcode = 'P0001'; end if;
  perform public.log_event(p_station, null, 'status_changed', jsonb_build_object('work', p_work, 'methane', p_methane));
end $$;

create function public.update_station_settings(
  p_station uuid, p_phone text, p_columns smallint, p_avg_service_min smallint,
  p_max_queue smallint, p_call_timeout_min smallint, p_opens time, p_closes time
) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_user();
  if not public.is_member(p_station, true) then raise exception 'forbidden' using errcode = '42501'; end if;
  -- name, address and coordinates are not editable: changing them needs a new review
  update public.stations set phone = p_phone, columns = p_columns, avg_service_min = p_avg_service_min,
    max_queue = p_max_queue, call_timeout_min = p_call_timeout_min, opens = p_opens, closes = p_closes
    where id = p_station;
  perform public.log_event(p_station, null, 'settings_changed');
end $$;

create function public.add_operator(p_station uuid, p_phone text) returns void
language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  perform public.require_user();
  if not public.is_member(p_station, true) then raise exception 'forbidden' using errcode = '42501'; end if;
  select id into target from public.profiles where phone = p_phone;
  if target is null then raise exception 'user_not_found' using errcode = 'P0001'; end if;
  insert into public.station_members (station_id, user_id, role) values (p_station, target, 'operator')
    on conflict do nothing;
  perform public.log_event(p_station, null, 'operator_added', jsonb_build_object('user', target));
end $$;

-- ============ Queue functions ============
-- Average service minutes from the last 20 served tickets, falling back to the station setting.
create function public.station_avg_min(p_station uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select avg(extract(epoch from (finished_at - called_at)) / 60)
       from (select finished_at, called_at from public.queue_tickets
             where station_id = p_station and status = 'served' and called_at is not null
             order by finished_at desc limit 20) t),
    (select avg_service_min from public.stations where id = p_station))
$$;

create function public.join_queue(p_station uuid, p_vehicle uuid) returns public.queue_tickets
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  st public.stations;
  v_plate text;
  t public.queue_tickets;
begin
  -- lock the station row: serializes number assignment for this station
  select * into st from public.stations where id = p_station for update;
  if st.id is null or st.status <> 'verified' then raise exception 'station_unavailable' using errcode = 'P0001'; end if;
  if st.work_status <> 'open' then raise exception 'station_closed' using errcode = 'P0001'; end if;
  if st.methane = 'none' then raise exception 'no_methane' using errcode = 'P0001'; end if;

  select plate into v_plate from public.vehicles where id = p_vehicle and user_id = uid;
  if v_plate is null then raise exception 'vehicle_not_found' using errcode = 'P0001'; end if;

  if exists (select 1 from public.queue_tickets where user_id = uid and status in ('waiting', 'called', 'arrived')) then
    raise exception 'already_in_queue' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.queue_tickets where plate = v_plate and status in ('waiting', 'called', 'arrived')) then
    raise exception 'plate_in_queue' using errcode = 'P0001';
  end if;
  if (select count(*) from public.queue_tickets where user_id = uid and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  if (select count(*) from public.queue_tickets where station_id = p_station and status in ('waiting', 'called', 'arrived')) >= st.max_queue then
    raise exception 'queue_full' using errcode = 'P0001';
  end if;

  insert into public.queue_tickets (station_id, user_id, plate, service_date, number)
  values (p_station, uid, v_plate, public.tashkent_today(),
          coalesce((select max(number) from public.queue_tickets
                    where station_id = p_station and service_date = public.tashkent_today()), 0) + 1)
  returning * into t;
  perform public.log_event(p_station, t.id, 'joined');
  return t;
end $$;

create function public.add_walk_in(p_station uuid, p_plate text) returns public.queue_tickets
language plpgsql security definer set search_path = '' as $$
declare t public.queue_tickets; v_plate text := upper(regexp_replace(p_plate, '\s', '', 'g'));
begin
  perform public.require_user();
  if not public.is_member(p_station) then raise exception 'forbidden' using errcode = '42501'; end if;
  perform 1 from public.stations where id = p_station and status = 'verified' for update;
  if not found then raise exception 'station_unavailable' using errcode = 'P0001'; end if;
  if exists (select 1 from public.queue_tickets where plate = v_plate and status in ('waiting', 'called', 'arrived')) then
    raise exception 'plate_in_queue' using errcode = 'P0001';
  end if;
  insert into public.queue_tickets (station_id, user_id, plate, service_date, number)
  values (p_station, null, v_plate, public.tashkent_today(),
          coalesce((select max(number) from public.queue_tickets
                    where station_id = p_station and service_date = public.tashkent_today()), 0) + 1)
  returning * into t;
  perform public.log_event(p_station, t.id, 'walk_in');
  return t;
end $$;

create function public.cancel_ticket(p_ticket uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.queue_tickets;
begin
  perform public.require_user();
  update public.queue_tickets set status = 'cancelled', finished_at = now()
    where id = p_ticket and user_id = auth.uid() and status in ('waiting', 'called')
    returning * into t;
  if t.id is null then raise exception 'ticket_not_cancellable' using errcode = 'P0001'; end if;
  perform public.log_event(t.station_id, t.id, 'cancelled');
end $$;

-- Operator: call the earliest waiting ticket. Order cannot be changed by hand.
create function public.call_next(p_station uuid) returns public.queue_tickets
language plpgsql security definer set search_path = '' as $$
declare t public.queue_tickets;
begin
  perform public.require_user();
  if not public.is_member(p_station) then raise exception 'forbidden' using errcode = '42501'; end if;
  perform 1 from public.stations where id = p_station for update;
  update public.queue_tickets set status = 'called', called_at = now()
    where id = (select id from public.queue_tickets
                where station_id = p_station and status = 'waiting'
                order by service_date, number limit 1)
    returning * into t;
  if t.id is null then raise exception 'queue_empty' using errcode = 'P0001'; end if;
  perform public.log_event(p_station, t.id, 'called');
  return t;
end $$;

-- Operator: move a ticket forward. Allowed: called->arrived, called|arrived->served, called->no_show.
create function public.set_ticket_status(p_ticket uuid, p_status public.ticket_status) returns public.queue_tickets
language plpgsql security definer set search_path = '' as $$
declare t public.queue_tickets; strikes int;
begin
  perform public.require_user();
  select * into t from public.queue_tickets where id = p_ticket for update;
  if t.id is null or not public.is_member(t.station_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not ((t.status = 'called' and p_status in ('arrived', 'served', 'no_show'))
       or (t.status = 'arrived' and p_status = 'served')) then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  update public.queue_tickets set status = p_status,
    arrived_at = case when p_status = 'arrived' then now() else arrived_at end,
    finished_at = case when p_status in ('served', 'no_show') then now() else finished_at end
    where id = p_ticket returning * into t;
  perform public.log_event(t.station_id, t.id, p_status::text);
  if p_status = 'no_show' and t.user_id is not null then
    perform public.apply_no_show_penalty(t.user_id);
  end if;
  return t;
end $$;

-- 3 no-shows within 7 days -> 24h ban from joining queues.
create function public.apply_no_show_penalty(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.queue_tickets
      where user_id = p_user and status = 'no_show' and finished_at > now() - interval '7 days') >= 3 then
    update public.profiles set banned_until = now() + interval '24 hours' where id = p_user;
  end if;
end $$;

-- Called tickets not confirmed in time become no-shows (run by pg_cron every minute).
create function public.expire_called_tickets() returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in
    update public.queue_tickets t set status = 'no_show', finished_at = now()
    from public.stations s
    where s.id = t.station_id and t.status = 'called'
      and t.called_at < now() - make_interval(mins => s.call_timeout_min)
    returning t.id, t.station_id, t.user_id
  loop
    insert into public.queue_events (station_id, ticket_id, action) values (r.station_id, r.id, 'no_show_auto');
    update public.stations set queue_updated_at = now() where id = r.station_id;
    if r.user_id is not null then perform public.apply_no_show_penalty(r.user_id); end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Public queue numbers for the map: count of cars and an estimate, no personal data.
create function public.queue_stats()
returns table (station_id uuid, cars integer, wait_min integer)
language sql stable security definer set search_path = '' as $$
  select s.id,
         count(t.id)::int,
         ceil(count(t.id) filter (where t.status = 'waiting') * public.station_avg_min(s.id) / s.columns)::int
  from public.stations s
  left join public.queue_tickets t on t.station_id = s.id and t.status in ('waiting', 'called', 'arrived')
  where s.status = 'verified'
  group by s.id
$$;

-- The caller's active ticket with position and estimate.
create function public.my_ticket()
returns table (id uuid, station_id uuid, station_name text, station_address text, plate text, number integer,
               status public.ticket_status, called_at timestamptz, call_timeout_min smallint,
               ahead integer, wait_min integer)
language sql stable security definer set search_path = '' as $$
  select t.id, t.station_id, s.name, s.address, t.plate, t.number, t.status, t.called_at, s.call_timeout_min,
         a.ahead, ceil(a.ahead * public.station_avg_min(s.id) / s.columns)::int
  from public.queue_tickets t
  join public.stations s on s.id = t.station_id
  cross join lateral (
    select count(*)::int as ahead from public.queue_tickets o
    where o.station_id = t.station_id and o.status = 'waiting'
      and (o.service_date, o.number) < (t.service_date, t.number)
  ) a
  where t.user_id = auth.uid() and t.status in ('waiting', 'called', 'arrived')
$$;

-- ============ Row level security ============
alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.stations enable row level security;
alter table public.station_members enable row level security;
alter table public.station_applications enable row level security;
alter table public.queue_tickets enable row level security;
alter table public.queue_events enable row level security;

create policy "own profile or admin" on public.profiles for select
  using (id = auth.uid() or public.is_admin());
create policy "update own profile" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

create policy "own vehicles" on public.vehicles for select using (user_id = auth.uid());
create policy "add own vehicle" on public.vehicles for insert with check (user_id = auth.uid());
create policy "delete own vehicle" on public.vehicles for delete using (user_id = auth.uid());

create policy "verified, own or admin" on public.stations for select
  using (status = 'verified' or public.is_member(id) or public.is_admin());

create policy "members of own stations or admin" on public.station_members for select
  using (user_id = auth.uid() or public.is_member(station_id, true) or public.is_admin());

create policy "station owner or admin" on public.station_applications for select
  using (public.is_member(station_id, true) or public.is_admin());

create policy "own, station staff or admin" on public.queue_tickets for select
  using (user_id = auth.uid() or public.is_member(station_id) or public.is_admin());

create policy "station staff or admin" on public.queue_events for select
  using (public.is_member(station_id) or public.is_admin());

-- ============ Grants (explicit, independent of project defaults) ============
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant select on public.stations to anon, authenticated;
grant select on public.profiles, public.vehicles, public.station_members,
  public.station_applications, public.queue_tickets, public.queue_events to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
grant insert (user_id, plate, model), delete on public.vehicles to authenticated;

grant execute on function public.queue_stats() to anon, authenticated;
grant execute on function
  public.my_ticket(), public.join_queue(uuid, uuid), public.cancel_ticket(uuid),
  public.call_next(uuid), public.set_ticket_status(uuid, public.ticket_status), public.add_walk_in(uuid, text),
  public.apply_station(text, text, text, double precision, double precision, text, text, text, smallint, time, time, text),
  public.review_station(uuid, boolean, text), public.set_station_suspended(uuid, boolean, text),
  public.set_station_status(uuid, public.work_status, public.methane_status),
  public.update_station_settings(uuid, text, smallint, smallint, smallint, smallint, time, time),
  public.add_operator(uuid, text)
to authenticated;
-- RLS policies call these helpers, so the querying role must be able to execute them.
grant execute on function public.is_admin(), public.is_member(uuid, boolean) to anon, authenticated;
