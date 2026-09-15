create table if not exists public.user_api_keys (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique references auth.users(id) on delete cascade,
 ciphertext text not null,
 iv text not null,
 auth_tag text not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists user_api_keys_updated_at on public.user_api_keys;
create trigger user_api_keys_updated_at before update on public.user_api_keys for each row execute function public.set_updated_at();

create table if not exists public.chapters (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 title text not null, source_filename text, difficulty text not null default 'Moderate', language text not null default 'English', created_at timestamptz not null default now()
);
create table if not exists public.questions (
 id uuid primary key default gen_random_uuid(), chapter_id uuid not null references public.chapters(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade,
 question text not null, options jsonb not null, correct_answer int not null check(correct_answer between 0 and 3), explanation text not null, created_at timestamptz not null default now()
);
create table if not exists public.quiz_attempts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 total_questions int not null, score int not null, correct int not null, incorrect int not null, unattempted int not null, time_taken_seconds int not null, created_at timestamptz not null default now()
);

alter table public.user_api_keys enable row level security;
alter table public.chapters enable row level security; alter table public.questions enable row level security; alter table public.quiz_attempts enable row level security;

drop policy if exists api_keys_owner on public.user_api_keys;
create policy api_keys_owner on public.user_api_keys for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists chapters_owner on public.chapters; create policy chapters_owner on public.chapters for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists questions_owner on public.questions; create policy questions_owner on public.questions for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists attempts_owner on public.quiz_attempts; create policy attempts_owner on public.quiz_attempts for all using(auth.uid()=user_id) with check(auth.uid()=user_id);

create index if not exists chapters_user_created_idx on public.chapters(user_id,created_at desc);
create index if not exists questions_user_created_idx on public.questions(user_id,created_at desc);
create index if not exists attempts_user_created_idx on public.quiz_attempts(user_id,created_at desc);

-- Multi-provider BYOK keys. Values are encrypted by the Next.js server before storage.
create table if not exists public.user_ai_keys (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 provider text not null check(provider in ('gemini','openrouter','groq')),
 ciphertext text not null,
 iv text not null,
 auth_tag text not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id, provider)
);

alter table public.user_ai_keys enable row level security;
drop policy if exists user_ai_keys_owner on public.user_ai_keys;
create policy user_ai_keys_owner on public.user_ai_keys for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop trigger if exists user_ai_keys_updated_at on public.user_ai_keys;
create trigger user_ai_keys_updated_at before update on public.user_ai_keys for each row execute function public.set_updated_at();
create index if not exists user_ai_keys_user_idx on public.user_ai_keys(user_id);
