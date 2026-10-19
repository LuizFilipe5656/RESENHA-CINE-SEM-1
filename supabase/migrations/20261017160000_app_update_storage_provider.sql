alter table public.app_updates
    add column if not exists storage_provider text not null default 'supabase'
    check (storage_provider in ('supabase', 'r2'));
