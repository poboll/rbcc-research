create extension if not exists pgcrypto;

create type public.member_role as enum ('owner', 'reviewer', 'researcher');
create type public.workflow_status as enum ('todo', 'active', 'blocked', 'done', 'archived');
create type public.evidence_kind as enum ('text', 'image', 'audio', 'video', 'document');
create type public.validation_status as enum ('pending', 'confirmed', 'rejected', 'partial');

create table public.groups (
  id text primary key,
  name text not null,
  short_name text not null,
  mascot text,
  event_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.members (
  id text primary key,
  display_name text not null,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id text not null references public.groups(id) on delete cascade,
  member_id text not null references public.members(id) on delete cascade,
  role public.member_role not null default 'researcher',
  joined_at timestamptz not null default now(),
  primary key (group_id, member_id)
);

create table public.routes (
  id text primary key,
  group_id text not null references public.groups(id) on delete cascade,
  day smallint not null check (day between 1 and 31),
  route_date date not null,
  label text not null,
  capacity integer check (capacity > 0),
  created_at timestamptz not null default now()
);

create table public.route_members (
  route_id text not null references public.routes(id) on delete cascade,
  member_id text not null references public.members(id) on delete cascade,
  primary key (route_id, member_id)
);

create table public.sites (
  id text primary key,
  name text not null,
  theme_name text,
  address text,
  profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.route_stops (
  id uuid primary key default gen_random_uuid(),
  route_id text not null references public.routes(id) on delete cascade,
  site_id text not null references public.sites(id) on delete restrict,
  stop_order smallint not null check (stop_order > 0),
  activity text,
  time_label text,
  meeting_point text,
  unique (route_id, stop_order),
  unique (route_id, site_id)
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  group_id text not null references public.groups(id) on delete cascade,
  member_id text not null references public.members(id) on delete cascade,
  route_stop_id uuid not null references public.route_stops(id) on delete cascade,
  status public.workflow_status not null default 'todo',
  route_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, route_stop_id)
);

create table public.research_questions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  author_member_id text references public.members(id) on delete set null,
  question_text text not null,
  tags text[] not null default '{}',
  lens text not null default 'pending',
  answer_text text,
  validation public.validation_status not null default 'pending',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.evidence_records (
  id uuid primary key default gen_random_uuid(),
  group_id text not null references public.groups(id) on delete cascade,
  assignment_id uuid references public.assignments(id) on delete cascade,
  creator_member_id text references public.members(id) on delete set null,
  kind public.evidence_kind not null,
  title text,
  caption text,
  text_content text,
  captured_at timestamptz,
  status public.workflow_status not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.media_objects (
  id uuid primary key default gen_random_uuid(),
  evidence_id uuid not null unique references public.evidence_records(id) on delete cascade,
  bucket text not null,
  object_key text not null unique,
  original_name text,
  mime_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  sha256 text,
  width integer,
  height integer,
  duration_ms integer,
  upload_status text not null default 'ready',
  created_at timestamptz not null default now()
);

create table public.problems (
  id uuid primary key default gen_random_uuid(),
  group_id text not null references public.groups(id) on delete cascade,
  assignment_id uuid references public.assignments(id) on delete cascade,
  author_member_id text references public.members(id) on delete set null,
  title text not null,
  problem_statement text,
  evidence_summary text,
  severity text,
  validation public.validation_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.solutions (
  id uuid primary key default gen_random_uuid(),
  group_id text not null references public.groups(id) on delete cascade,
  assignment_id uuid references public.assignments(id) on delete cascade,
  author_member_id text references public.members(id) on delete set null,
  title text not null,
  description text,
  metrics jsonb not null default '[]'::jsonb,
  status public.workflow_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.solution_problem_links (
  solution_id uuid not null references public.solutions(id) on delete cascade,
  problem_id uuid not null references public.problems(id) on delete cascade,
  primary key (solution_id, problem_id)
);

create table public.report_drafts (
  id uuid primary key default gen_random_uuid(),
  group_id text not null references public.groups(id) on delete cascade,
  assignment_id uuid references public.assignments(id) on delete cascade,
  owner_member_id text references public.members(id) on delete set null,
  mode text not null default 'iterate',
  sections jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (assignment_id, mode)
);

create table public.report_versions (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.report_drafts(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  sections jsonb not null,
  char_count integer not null default 0,
  model text,
  generation_mode text,
  generated_by_member_id text references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (draft_id, version_number)
);

create table public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  group_id text not null references public.groups(id) on delete cascade,
  site_id text references public.sites(id) on delete cascade,
  creator_member_id text references public.members(id) on delete set null,
  title text not null,
  content text not null,
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.collaboration_tasks (
  id uuid primary key default gen_random_uuid(),
  group_id text not null references public.groups(id) on delete cascade,
  route_id text references public.routes(id) on delete cascade,
  assignee_member_id text references public.members(id) on delete set null,
  title text not null,
  description text,
  status public.workflow_status not null default 'todo',
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.collaboration_updates (
  id uuid primary key default gen_random_uuid(),
  group_id text not null references public.groups(id) on delete cascade,
  member_id text references public.members(id) on delete set null,
  message text not null,
  status public.workflow_status not null default 'active',
  created_at timestamptz not null default now()
);

create table public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  group_id text not null references public.groups(id) on delete cascade,
  member_id text references public.members(id) on delete set null,
  assignment_id uuid references public.assignments(id) on delete cascade,
  role text not null check (role in ('system', 'user', 'assistant')),
  content text not null,
  model text,
  citations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index assignments_group_member_idx on public.assignments(group_id, member_id);
create index questions_assignment_idx on public.research_questions(assignment_id, position);
create index evidence_group_assignment_created_idx on public.evidence_records(group_id, assignment_id, created_at desc);
create index problems_group_assignment_idx on public.problems(group_id, assignment_id);
create index solutions_group_assignment_idx on public.solutions(group_id, assignment_id);
create index knowledge_group_site_idx on public.knowledge_documents(group_id, site_id);
create index tasks_group_status_idx on public.collaboration_tasks(group_id, status);
create index agent_messages_group_member_created_idx on public.agent_messages(group_id, member_id, created_at desc);

create or replace function public.is_group_member(target_group_id text)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.group_members gm join public.members m on m.id = gm.member_id where gm.group_id = target_group_id and m.auth_user_id = auth.uid()) $$;

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.routes enable row level security;
alter table public.assignments enable row level security;
alter table public.research_questions enable row level security;
alter table public.evidence_records enable row level security;
alter table public.problems enable row level security;
alter table public.solutions enable row level security;
alter table public.report_drafts enable row level security;
alter table public.knowledge_documents enable row level security;
alter table public.collaboration_tasks enable row level security;
alter table public.collaboration_updates enable row level security;
alter table public.agent_messages enable row level security;

create policy groups_member_read on public.groups for select using (public.is_group_member(id));
create policy group_members_member_read on public.group_members for select using (public.is_group_member(group_id));
create policy routes_member_all on public.routes for all using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));
create policy assignments_member_all on public.assignments for all using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));
create policy evidence_member_all on public.evidence_records for all using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));
create policy problems_member_all on public.problems for all using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));
create policy solutions_member_all on public.solutions for all using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));
create policy drafts_member_all on public.report_drafts for all using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));
create policy knowledge_member_all on public.knowledge_documents for all using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));
create policy tasks_member_all on public.collaboration_tasks for all using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));
create policy updates_member_all on public.collaboration_updates for all using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));
create policy messages_member_all on public.agent_messages for all using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));

create policy questions_member_all on public.research_questions for all
using (exists (select 1 from public.assignments a where a.id = assignment_id and public.is_group_member(a.group_id)))
with check (exists (select 1 from public.assignments a where a.id = assignment_id and public.is_group_member(a.group_id)));
