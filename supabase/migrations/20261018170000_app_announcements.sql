alter table public.app_settings
    add column if not exists announcement_message text not null default '',
    add column if not exists announcement_id text not null default '';
