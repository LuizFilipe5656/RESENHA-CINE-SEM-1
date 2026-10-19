create table if not exists public.app_updates (
    singleton boolean primary key default true check (singleton),
    version text not null,
    storage_path text not null,
    sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
    file_size bigint not null check (file_size > 0),
    release_notes text not null default '',
    published_at timestamptz not null default now()
);

alter table public.app_updates enable row level security;
revoke all on public.app_updates from anon, authenticated, public;
grant all on public.app_updates to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'app-updates',
    'app-updates',
    false,
    524288000,
    array[
        'application/octet-stream',
        'application/x-msdownload',
        'application/vnd.microsoft.portable-executable'
    ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
