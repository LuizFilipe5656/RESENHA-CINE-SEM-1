alter table public.app_updates
    add column if not exists display_version text not null default '';
