-- =====================================================================
-- Streetwear Ops — schéma de synchronisation
-- À coller dans Supabase : projet > SQL Editor > New query > Run
-- =====================================================================
--
-- Principe de sécurité : la table est verrouillée (RLS activé, AUCUNE
-- policy), donc la clé publique "anon" ne peut PAS la lire directement.
-- Tout passe par deux fonctions SECURITY DEFINER qui exigent le code de
-- synchro. Sans le code, la clé publique ne donne accès à rien.

create table if not exists public.state (
  code       text primary key,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Verrouillage total de l'accès direct à la table
alter table public.state enable row level security;
revoke all on table public.state from anon, authenticated;

-- ---------------------------------------------------------------------
-- Lecture : ne renvoie que la ligne dont on connaît le code exact
-- ---------------------------------------------------------------------
create or replace function public.pull_state(p_code text)
returns table (data jsonb, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_code is null or length(p_code) < 12 then
    raise exception 'code de synchro invalide';
  end if;

  return query
    select s.data, s.updated_at
    from public.state s
    where s.code = p_code;
end;
$$;

-- ---------------------------------------------------------------------
-- Écriture : crée ou remplace la ligne du code fourni
-- ---------------------------------------------------------------------
create or replace function public.push_state(p_code text, p_data jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  ts timestamptz;
begin
  if p_code is null or length(p_code) < 12 then
    raise exception 'code de synchro invalide';
  end if;

  -- garde-fou : ~4 Mo max, largement au-dessus d'un stock de 100 tees
  if pg_column_size(p_data) > 4194304 then
    raise exception 'données trop volumineuses';
  end if;

  insert into public.state (code, data, updated_at)
  values (p_code, p_data, now())
  on conflict (code) do update
    set data = excluded.data,
        updated_at = now()
  returning public.state.updated_at into ts;

  return ts;
end;
$$;

-- Seules ces deux fonctions sont exposées à la clé publique
revoke all on function public.pull_state(text)         from public, anon, authenticated;
revoke all on function public.push_state(text, jsonb)  from public, anon, authenticated;
grant execute on function public.pull_state(text)        to anon, authenticated;
grant execute on function public.push_state(text, jsonb) to anon, authenticated;
