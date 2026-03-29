-- Migration: Create contacts table for /api/contact form submissions
-- P24: Pattie Email Alias + Comms Flow Architecture

create table if not exists public.contacts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null,
  message     text not null,
  created_at  timestamptz not null default now()
);

-- Enable RLS — only service role can read/insert
alter table public.contacts enable row level security;

-- Service role bypasses RLS by default; no additional policies needed for server-side inserts.
-- Admin read policy (optional, for future admin UI)
create policy "service role can manage contacts"
  on public.contacts
  for all
  to service_role
  using (true)
  with check (true);

comment on table public.contacts is 'Inbound contact form submissions from patentpending.app/contact';
