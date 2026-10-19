alter table public.app_settings
    add column if not exists maintenance_enabled boolean not null default false,
    add column if not exists maintenance_message text not null default '';
