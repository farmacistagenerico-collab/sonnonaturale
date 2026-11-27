-- Sonno Naturale — initial Supabase schema
-- Apply in the Supabase SQL Editor for a NEW project. Review before production use.
-- No service_role key is ever used by the browser app.

begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  role text not null default 'client' check (role in ('client', 'coach')),
  preferred_language text not null default 'it' check (preferred_language in ('it', 'en')),
  created_at timestamptz not null default now()
);

create table if not exists public.coach_clients (
  coach_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (coach_id, client_id),
  check (coach_id <> client_id)
);

-- SECURITY DEFINER helpers avoid recursive RLS lookups. They can only answer
-- questions about the signed-in user and do not expose any table contents.
create or replace function public.is_coach()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'coach'
  );
$$;

create or replace function public.is_assigned_client(p_client_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.coach_clients cc
    join public.profiles coach on coach.id = cc.coach_id
    where cc.coach_id = (select auth.uid())
      and cc.client_id = p_client_id
      and coach.role = 'coach'
  );
$$;

-- Every newly registered account is a client. Coach privileges are granted
-- manually by the project owner after verifying Daniele's account.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role, preferred_language)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'client',
    case when new.raw_user_meta_data ->> 'preferred_language' = 'en' then 'en' else 'it' end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.sleep_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  night_date date not null,
  bed_time time,
  wake_time time,
  sleep_latency_minutes integer check (sleep_latency_minutes between 0 and 600),
  awakenings integer check (awakenings between 0 and 50),
  subjective_rating integer check (subjective_rating between 1 and 5),
  notes text not null default '' check (char_length(notes) <= 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, night_date)
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  title_it text not null check (char_length(title_it) between 1 and 180),
  title_en text not null check (char_length(title_en) between 1 and 180),
  description_it text not null default '' check (char_length(description_it) <= 1000),
  description_en text not null default '' check (char_length(description_en) <= 1000),
  due_date date,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (created_by <> client_id)
);

create table if not exists public.goal_completions (
  goal_id uuid not null references public.goals(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  completed_at timestamptz not null default now(),
  reflection text not null default '' check (char_length(reflection) <= 1000),
  primary key (goal_id, client_id)
);

create table if not exists public.coach_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check (char_length(body) between 1 and 3000),
  visible_to_client boolean not null default true,
  created_at timestamptz not null default now(),
  check (author_id <> client_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

-- Keep an auditable record of policy acknowledgement. Final consent wording,
-- legal basis and retention must be reviewed for the actual service before launch.
create table if not exists public.privacy_consents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  policy_version text not null check (char_length(policy_version) between 1 and 40),
  accepted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  check (withdrawn_at is null or withdrawn_at >= accepted_at)
);

create index if not exists coach_clients_client_idx on public.coach_clients(client_id);
create index if not exists sleep_entries_client_date_idx on public.sleep_entries(client_id, night_date desc);
create index if not exists goals_client_order_idx on public.goals(client_id, sort_order, due_date);
create index if not exists coach_notes_client_created_idx on public.coach_notes(client_id, created_at desc);
create index if not exists messages_pair_created_idx on public.messages(sender_id, recipient_id, created_at);
create index if not exists privacy_consents_client_idx on public.privacy_consents(client_id, accepted_at desc);

-- Explicit grants: no anonymous table access and no client-side role changes.
revoke all on public.profiles, public.coach_clients, public.sleep_entries,
  public.goals, public.goal_completions, public.coach_notes, public.messages,
  public.privacy_consents from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, preferred_language) on public.profiles to authenticated;
grant select on public.coach_clients to authenticated;
grant select, insert, update, delete on public.sleep_entries to authenticated;
grant select, insert, update, delete on public.goals to authenticated;
grant select, insert, delete on public.goal_completions to authenticated;
grant select, insert on public.coach_notes to authenticated;
grant select, insert on public.messages to authenticated;
grant select, insert on public.privacy_consents to authenticated;

grant usage on schema public to authenticated;
grant execute on function public.is_coach() to authenticated;
grant execute on function public.is_assigned_client(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.coach_clients enable row level security;
alter table public.sleep_entries enable row level security;
alter table public.goals enable row level security;
alter table public.goal_completions enable row level security;
alter table public.coach_notes enable row level security;
alter table public.messages enable row level security;
alter table public.privacy_consents enable row level security;

create policy "profiles_read_self_or_assigned_coach" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_assigned_client(id)));
create policy "profiles_update_self" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "assignments_read_participants" on public.coach_clients
  for select to authenticated
  using (coach_id = (select auth.uid()) or client_id = (select auth.uid()));
-- Assignment creation/deletion is intentionally reserved for the project owner
-- until an invitation flow with verified coach permissions is implemented.

create policy "sleep_entries_client_all" on public.sleep_entries
  for all to authenticated
  using (client_id = (select auth.uid()))
  with check (client_id = (select auth.uid()));
create policy "sleep_entries_assigned_coach_read" on public.sleep_entries
  for select to authenticated
  using ((select public.is_assigned_client(client_id)));

create policy "goals_read_participants" on public.goals
  for select to authenticated
  using (client_id = (select auth.uid()) or (select public.is_assigned_client(client_id)));
create policy "goals_coach_create" on public.goals
  for insert to authenticated
  with check (created_by = (select auth.uid()) and (select public.is_assigned_client(client_id)));
create policy "goals_coach_update" on public.goals
  for update to authenticated
  using ((select public.is_assigned_client(client_id)))
  with check ((select public.is_assigned_client(client_id)));
create policy "goals_coach_delete" on public.goals
  for delete to authenticated
  using ((select public.is_assigned_client(client_id)));

create policy "goal_completions_read_participants" on public.goal_completions
  for select to authenticated
  using (client_id = (select auth.uid()) or exists (
    select 1 from public.goals g
    where g.id = goal_id and (select public.is_assigned_client(g.client_id))
  ));
create policy "goal_completions_client_create" on public.goal_completions
  for insert to authenticated
  with check (client_id = (select auth.uid()) and exists (
    select 1 from public.goals g where g.id = goal_id and g.client_id = (select auth.uid())
  ));
create policy "goal_completions_client_remove" on public.goal_completions
  for delete to authenticated
  using (client_id = (select auth.uid()));

create policy "coach_notes_read_participants" on public.coach_notes
  for select to authenticated
  using ((author_id = (select auth.uid())) or
    (client_id = (select auth.uid()) and visible_to_client) or
    (select public.is_assigned_client(client_id)));
create policy "coach_notes_coach_create" on public.coach_notes
  for insert to authenticated
  with check (author_id = (select auth.uid()) and (select public.is_assigned_client(client_id)));

create policy "messages_read_assigned_participants" on public.messages
  for select to authenticated
  using (
    (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()))
    and exists (
      select 1 from public.coach_clients cc
      where (cc.coach_id = sender_id and cc.client_id = recipient_id)
         or (cc.client_id = sender_id and cc.coach_id = recipient_id)
    )
  );
create policy "messages_send_within_assignment" on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid()) and exists (
      select 1 from public.coach_clients cc
      where (cc.coach_id = sender_id and cc.client_id = recipient_id)
         or (cc.client_id = sender_id and cc.coach_id = recipient_id)
    )
  );

create policy "consents_read_self" on public.privacy_consents
  for select to authenticated
  using (client_id = (select auth.uid()));
create policy "consents_create_self" on public.privacy_consents
  for insert to authenticated
  with check (client_id = (select auth.uid()));

commit;
