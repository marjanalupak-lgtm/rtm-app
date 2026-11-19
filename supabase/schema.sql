-- Run once in Supabase → SQL Editor.
create table if not exists public.requirements (
  id text primary key,
  date_added text default '', release text default '', type text default '', category text default '',
  source text default '', spec_link text default '', parent text default '', epic_id text default '',
  epic_title text default '', story_id text default '', statement text default '', acceptance text default '',
  design_required text default '', design_link text default '', design_status text default '', design_owner text default '',
  priority text default '', status text default 'Draft', owner text default '', delivery text default 'Not Started',
  dependency text default '', test_case text default '', test_case_status text default '', test_exec text default '',
  defect text default '', notes text default '',
  updated_at timestamptz default now(), updated_by text default ''
);

create table if not exists public.requirement_history (
  hid bigint generated always as identity primary key,
  req_id text not null,
  changed_at timestamptz not null default now(),
  changed_by text not null default '',
  action text not null,
  changes jsonb not null default '[]'
);
create index if not exists requirement_history_req on public.requirement_history(req_id, changed_at desc);

-- Only signed-in team members can read/write. History is append-only.
alter table public.requirements enable row level security;
alter table public.requirement_history enable row level security;
create policy "team read" on public.requirements for select to authenticated using (true);
create policy "team write" on public.requirements for insert to authenticated with check (true);
create policy "team update" on public.requirements for update to authenticated using (true);
create policy "team delete" on public.requirements for delete to authenticated using (true);
create policy "history read" on public.requirement_history for select to authenticated using (true);
create policy "history append" on public.requirement_history for insert to authenticated with check (true);

-- Live updates for everyone looking at the RTM.
alter publication supabase_realtime add table public.requirements;
