create table if not exists public.accounts (
    id uuid primary key default gen_random_uuid(),
    username text not null unique,
    password_salt text not null,
    password_hash text not null,
    password_iterations integer not null default 310000,
    expires_at timestamptz not null,
    created_at timestamptz not null default now(),
    suspended boolean not null default false,
    constraint accounts_username_format check (username ~ '^[a-z0-9._-]{3,32}$')
);

create table if not exists public.admin_credentials (
    id uuid primary key default gen_random_uuid(),
    username text not null unique,
    password_salt text not null,
    password_hash text not null,
    password_iterations integer not null default 310000,
    created_at timestamptz not null default now(),
    constraint admin_credentials_username_format check (username ~ '^[a-z0-9._-]{3,32}$')
);

create unique index if not exists admin_credentials_singleton
    on public.admin_credentials ((true));

create table if not exists public.api_sessions (
    token_hash text primary key,
    account_id uuid references public.accounts (id) on delete cascade,
    admin_id uuid references public.admin_credentials (id) on delete cascade,
    expires_at timestamptz not null,
    constraint api_sessions_single_owner check (num_nonnulls(account_id, admin_id) = 1)
);

create index if not exists api_sessions_expiry on public.api_sessions (expires_at);

create table if not exists public.app_settings (
    singleton boolean primary key default true check (singleton),
    addons_tab_visible boolean not null default false
);

insert into public.app_settings (singleton, addons_tab_visible)
values (true, false)
on conflict (singleton) do nothing;

create table if not exists public.login_attempts (
    attempt_key text primary key,
    failed_attempts integer not null default 0,
    blocked_until timestamptz
);

alter table public.accounts enable row level security;
alter table public.admin_credentials enable row level security;
alter table public.api_sessions enable row level security;
alter table public.app_settings enable row level security;
alter table public.login_attempts enable row level security;

revoke all on public.accounts, public.admin_credentials, public.api_sessions,
    public.app_settings, public.login_attempts from anon, authenticated;
revoke all on public.accounts, public.admin_credentials, public.api_sessions,
    public.app_settings, public.login_attempts from public;
grant all on public.accounts, public.admin_credentials, public.api_sessions,
    public.app_settings, public.login_attempts to service_role;
