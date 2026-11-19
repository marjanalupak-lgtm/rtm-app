-- Migration 002: projects + per-project members. Run once in Supabase → SQL Editor.
-- Each requirement belongs to a project; only project members can see or edit it.

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  organization text not null default '',
  description text not null default '',
  status text not null default 'Active',
  created_by text not null default (auth.jwt() ->> 'email'),
  created_at timestamptz not null default now()
);

create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('owner', 'member')),
  added_at timestamptz not null default now(),
  primary key (project_id, email)
);

-- Requirements: add project, IDs unique per project.
alter table public.requirements add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table public.requirement_history add column if not exists project_id uuid references public.projects(id) on delete cascade;
-- Existing rows (from before projects) move into "My first project", owned by whoever entered them.
do $$
declare pid uuid; owner_email text;
begin
  if exists (select 1 from public.requirements where project_id is null) then
    select lower(updated_by) into owner_email from public.requirements
      where project_id is null and updated_by like '%@%' order by updated_at limit 1;
    insert into public.projects(name, created_by) values ('My first project', coalesce(owner_email, '')) returning id into pid;
    if owner_email is not null then
      insert into public.project_members(project_id, email, role) values (pid, owner_email, 'owner') on conflict do nothing;
    end if;
    update public.requirements set project_id = pid where project_id is null;
    update public.requirement_history set project_id = pid where project_id is null;
  end if;
end $$;
alter table public.requirements alter column project_id set not null;
alter table public.requirements drop constraint if exists requirements_pkey;
alter table public.requirements add primary key (project_id, id);
create index if not exists requirement_history_proj on public.requirement_history(project_id, req_id, changed_at desc);

-- Membership helpers (security definer avoids RLS recursion).
create or replace function public.my_email() returns text language sql stable as
$$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.is_member(pid uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from project_members m where m.project_id = pid and lower(m.email) = public.my_email()) $$;

create or replace function public.is_owner(pid uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from project_members m where m.project_id = pid and lower(m.email) = public.my_email() and m.role = 'owner') $$;

-- Creator becomes owner automatically.
create or replace function public.add_creator_as_owner() returns trigger
language plpgsql security definer set search_path = public as
$$ begin
  insert into project_members(project_id, email, role) values (new.id, public.my_email(), 'owner') on conflict do nothing;
  return new;
end $$;
drop trigger if exists projects_owner on public.projects;
create trigger projects_owner after insert on public.projects for each row execute function public.add_creator_as_owner();

-- RLS
alter table public.projects enable row level security;
alter table public.project_members enable row level security;

drop policy if exists "team read" on public.requirements;
drop policy if exists "team write" on public.requirements;
drop policy if exists "team update" on public.requirements;
drop policy if exists "team delete" on public.requirements;
drop policy if exists "history read" on public.requirement_history;
drop policy if exists "history append" on public.requirement_history;

create policy "proj read" on public.projects for select to authenticated using (public.is_member(id) or created_by = public.my_email());
create policy "proj create" on public.projects for insert to authenticated with check (true);
create policy "proj update" on public.projects for update to authenticated using (public.is_owner(id));
create policy "proj delete" on public.projects for delete to authenticated using (public.is_owner(id));

create policy "members read" on public.project_members for select to authenticated using (public.is_member(project_id));
create policy "members add" on public.project_members for insert to authenticated with check (public.is_owner(project_id));
create policy "members change" on public.project_members for update to authenticated using (public.is_owner(project_id));
create policy "members remove" on public.project_members for delete to authenticated using (public.is_owner(project_id));

create policy "req read" on public.requirements for select to authenticated using (public.is_member(project_id));
create policy "req add" on public.requirements for insert to authenticated with check (public.is_member(project_id));
create policy "req edit" on public.requirements for update to authenticated using (public.is_member(project_id));
create policy "req delete" on public.requirements for delete to authenticated using (public.is_member(project_id));

create policy "hist read" on public.requirement_history for select to authenticated using (public.is_member(project_id));
create policy "hist add" on public.requirement_history for insert to authenticated with check (public.is_member(project_id));

grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.project_members to authenticated;
grant execute on function public.my_email(), public.is_member(uuid), public.is_owner(uuid) to authenticated;
