alter table public.app_updates
    add column if not exists chunks jsonb not null default '[]'::jsonb;
