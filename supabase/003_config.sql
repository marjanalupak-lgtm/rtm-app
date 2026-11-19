-- Migration 003: per-project configuration + custom field values. Run once in Supabase → SQL Editor.
alter table public.projects add column if not exists config jsonb not null default '{}';
alter table public.requirements add column if not exists extra jsonb not null default '{}';
