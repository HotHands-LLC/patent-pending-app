create table if not exists patent_signing_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  patent_id uuid not null references patents(id) on delete cascade,
  requested_by uuid not null references auth.users(id),
  signer_user_id uuid references auth.users(id),
  signer_email text not null,
  signer_name text not null,
  document_type text not null check (document_type in (
    'aia_01',
    'sb0015a',
    'assignment',
    'aia_08',
    'other'
  )),
  document_label text not null,
  prefill_data jsonb default '{}',
  status text not null default 'pending' check (status in ('pending', 'viewed', 'signed', 'declined')),
  signed_at timestamptz,
  s_signature text,
  signed_date text,
  correspondence_id uuid references patent_correspondence(id),
  notification_sent_at timestamptz,
  reminder_count int default 0
);

alter table patent_signing_requests enable row level security;

create policy "Owner and signer access" on patent_signing_requests
  using (
    patent_id in (select id from patents where owner_id = auth.uid())
    or signer_user_id = auth.uid()
    or signer_email = (select email from auth.users where id = auth.uid())
  );

create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_signing_requests_updated_at
  before update on patent_signing_requests
  for each row execute function update_updated_at_column();
