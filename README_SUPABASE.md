# Supabase — Setup (NFT)

## 1) SQL (cola tudo no SQL Editor e executa)

```sql
create extension if not exists pgcrypto;

-- limpar
drop table if exists public.comments cascade;
drop table if exists public.news cascade;
drop table if exists public.site_settings cascade;
drop table if exists public.newsletter_subscriptions cascade;
drop table if exists public.journalists cascade;
drop table if exists public.commentators cascade;

-- notícias
create table public.news (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  lead text,
  content text not null,
  image_url text,
  slug text unique,
  category text default 'Todas',
  breaking boolean default false,
  journalist_id uuid,
  journalist_name text,
  created_at timestamptz not null default now()
);

-- jornalistas (admin gere)
create table public.journalists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  bio text,
  avatar_url text,
  active boolean default true,
  created_at timestamptz not null default now()
);

-- comentadores (admin gere) — os visitantes escrevem nome manualmente nos comentários
create table public.commentators (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  bio text,
  avatar_url text,
  active boolean default true,
  created_at timestamptz not null default now()
);

alter table public.news
  add constraint fk_news_journalist
  foreign key (journalist_id) references public.journalists(id) on delete set null;

-- comentários (thread infinito)
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  news_id uuid not null references public.news(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  author text,
  body text not null check (char_length(body) <= 500),
  created_at timestamptz not null default now()
);

create index idx_news_created_at on public.news(created_at desc);
create index idx_comments_news_id on public.comments(news_id);
create index idx_comments_parent_id on public.comments(parent_id);

-- settings key/value
create table public.site_settings (
  key text primary key,
  value text
);

-- newsletter subs
create table public.newsletter_subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  created_at timestamptz not null default now()
);

-- Para funcionar já, desativar RLS (depois podemos criar policies)
alter table public.news disable row level security;
alter table public.comments disable row level security;
alter table public.site_settings disable row level security;
alter table public.newsletter_subscriptions disable row level security;
alter table public.journalists disable row level security;
alter table public.commentators disable row level security;
```

## 2) Storage (imagens)

Supabase → Storage → Create bucket:

- Name: `news-images`
- Public: ON

## 3) Notas

- Login do admin é LOCAL (email + pass no frontend), não usa Supabase Auth.
- As notícias são assinadas automaticamente pelo jornalista escolhido (ou “Tomé Caldelas” por defeito).
- Comentários têm replies infinitos via `parent_id`.
