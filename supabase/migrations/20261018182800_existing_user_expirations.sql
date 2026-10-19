update public.accounts
set expires_at = now() + interval '30 days'
where is_admin = false
    and expires_at is null;
