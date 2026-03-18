-- Migration: research_ids_candidates table
-- Session: cont.40 / Prompt 47A — Task 2
-- Date: 2026-03-18

create table if not exists research_ids_candidates (
  id                  uuid        primary key default gen_random_uuid(),
  created_at          timestamptz default now(),
  patent_id           uuid        not null references patents(id) on delete cascade,
  owner_id            uuid        not null references auth.users(id) on delete cascade,
  -- Reference info (from research_results or manually entered)
  research_result_id  uuid        references research_results(id) on delete set null,
  application_number  text,
  patent_number       text,
  title               text        not null,
  inventor_names      text[],
  filing_date         date,
  cpc_codes           text[],
  -- IDS workflow
  status              text        not null default 'pending'
                      check (status in ('pending', 'include', 'exclude')),
  relevance_notes     text,
  -- Metadata
  added_by            text        default 'autoresearch',  -- 'autoresearch' | 'manual'
  updated_at          timestamptz default now()
);

-- RLS: owner can read/write their own candidates
alter table research_ids_candidates enable row level security;

create policy "Owner access" on research_ids_candidates
  for all
  using (owner_id = auth.uid());

-- Indexes
create index if not exists idx_ids_patent  on research_ids_candidates (patent_id);
create index if not exists idx_ids_owner   on research_ids_candidates (owner_id);
create index if not exists idx_ids_status  on research_ids_candidates (status);

-- Trigger: update updated_at on row change
create or replace function set_ids_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_ids_updated_at
  before update on research_ids_candidates
  for each row execute function set_ids_updated_at();
