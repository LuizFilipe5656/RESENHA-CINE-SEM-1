create table if not exists public.app_announcements (
    id uuid primary key default gen_random_uuid(),
    message text not null check (char_length(trim(message)) between 1 and 500),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

insert into public.app_announcements (id, message)
select
    case
        when announcement_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then announcement_id::uuid
        else gen_random_uuid()
    end,
    trim(announcement_message)
from public.app_settings
where trim(coalesce(announcement_message, '')) <> ''
on conflict (id) do nothing;

alter table public.app_announcements enable row level security;
revoke all on public.app_announcements from anon, authenticated, public;
grant all on public.app_announcements to service_role;
