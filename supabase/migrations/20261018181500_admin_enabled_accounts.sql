alter table public.accounts
    add column if not exists is_admin boolean not null default false;
