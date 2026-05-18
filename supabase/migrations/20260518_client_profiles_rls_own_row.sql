-- AUTH-FIX r8 | 2026-05-18 | Job_PM
-- client_profiles had RLS on with 0 policies -> all anon-key reads denied.
-- /auth/post-oauth profile lookup returned empty for every user, routing
-- existing customers/admins through the signup wizard.
create policy "users read own profile"
  on public.client_profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "users update own profile"
  on public.client_profiles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
