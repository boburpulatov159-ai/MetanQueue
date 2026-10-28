-- Realtime + scheduled jobs. Guarded so the migration also runs on plain Postgres (local tests).

-- Clients subscribe to station rows: queue_updated_at / status changes trigger a refetch.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.stations;
  end if;
end $$;

-- Every minute: called tickets past the station's timeout become no-shows.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('expire-called-tickets', '* * * * *', 'select public.expire_called_tickets()');
  end if;
end $$;
