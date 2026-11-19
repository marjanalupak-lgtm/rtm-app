-- Migration 004: project trash. "Delete" moves a project to trash; only trashed projects can be deleted for good.
alter table public.projects add column if not exists deleted_at timestamptz;
alter table public.projects add column if not exists deleted_by text;
drop policy if exists "proj delete" on public.projects;
create policy "proj delete" on public.projects for delete to authenticated using (public.is_owner(id) and deleted_at is not null);
