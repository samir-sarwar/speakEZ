create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default 'Speaker',
  timezone text not null default 'America/Toronto',
  daily_goal_minutes integer not null default 5 check (daily_goal_minutes between 1 and 120),
  parrot_variant text not null default 'mint',
  is_premium boolean not null default false,
  stripe_customer_id text,
  stripe_subscription_id text,
  xp integer not null default 0,
  level integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.usage_limits (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  lifetime_free_analyses_used integer not null default 0,
  lifetime_free_analyses_allowed integer not null default 1,
  monthly_premium_analyses_used integer not null default 0,
  month_key text not null default to_char(now(), 'YYYY-MM')
);

create table if not exists public.prompts (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in (
    'prompt',
    'word',
    'interview',
    'storytelling',
    'debate',
    'sales_pitch',
    'elevator_pitch',
    'timed_response',
    'daily_challenge'
  )),
  text text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  content_type text not null,
  session_style text not null check (session_style in ('quick_fire', 'prep_mode', 'freestyle')),
  prompt_id uuid references public.prompts(id) on delete set null,
  prompt_text text not null,
  prep_seconds integer not null default 0,
  response_seconds integer,
  duration_seconds integer not null default 0,
  storage_path text,
  status text not null default 'draft' check (status in ('draft', 'uploaded', 'local_only', 'analyzing', 'complete', 'failed')),
  created_at timestamptz not null default now()
);

create table if not exists public.ai_analyses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.practice_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'transcribing', 'analyzing', 'complete', 'failed')),
  transcript text,
  overall_score integer check (overall_score between 0 and 100),
  category_scores jsonb not null default '{}'::jsonb,
  filler_words text[] not null default '{}',
  pacing_wpm integer,
  strengths text[] not null default '{}',
  improvements text[] not null default '{}',
  encouragement text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.analysis_messages (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.ai_analyses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.streak_events (
  user_id uuid not null references public.profiles(id) on delete cascade,
  practice_date date not null,
  minutes integer not null default 0,
  primary key (user_id, practice_date)
);

create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_key text not null,
  label text not null,
  description text not null,
  unlocked_at timestamptz not null default now(),
  unique(user_id, badge_key)
);

alter table public.profiles enable row level security;
alter table public.usage_limits enable row level security;
alter table public.practice_sessions enable row level security;
alter table public.ai_analyses enable row level security;
alter table public.analysis_messages enable row level security;
alter table public.streak_events enable row level security;
alter table public.badges enable row level security;
alter table public.prompts enable row level security;

create policy "Users can read own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users can read own usage" on public.usage_limits for select using (auth.uid() = user_id);
create policy "Users can read prompts" on public.prompts for select using (active = true);
create policy "Users can read own sessions" on public.practice_sessions for select using (auth.uid() = user_id);
create policy "Users can delete own sessions" on public.practice_sessions for delete using (auth.uid() = user_id);
create policy "Users can read own analyses" on public.ai_analyses for select using (auth.uid() = user_id);
create policy "Users can read own messages" on public.analysis_messages for select using (auth.uid() = user_id);
create policy "Users can read own streaks" on public.streak_events for select using (auth.uid() = user_id);
create policy "Users can read own badges" on public.badges for select using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', 'Speaker'));

  insert into public.usage_limits (user_id)
  values (new.id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create index if not exists prompts_type_active_idx on public.prompts(type, active);
create index if not exists sessions_user_created_idx on public.practice_sessions(user_id, created_at desc);
create index if not exists analyses_user_created_idx on public.ai_analyses(user_id, created_at desc);
