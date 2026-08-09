-- =====================================================================
-- Streetwear Ops — stockage des photos de t-shirts
-- À coller dans Supabase : projet > SQL Editor > New query > Run
-- (à exécuter APRÈS supabase-schema.sql)
-- =====================================================================
--
-- Modèle retenu : bucket public en lecture par URL directe, mais dont le
-- contenu ne peut pas être listé.
--
--   - "public = true" fait servir les fichiers par /object/public/... sans
--     authentification : affichage instantané, servi par le CDN.
--   - AUCUNE policy SELECT n'est créée : l'API de listage reste donc fermée.
--     Impossible d'énumérer les photos, ni de découvrir celles des autres.
--   - Les noms de fichiers sont tirés au sort côté navigateur (24 caractères,
--     ~124 bits) : une adresse ne se devine pas.
--
-- Conséquence assumée : qui obtient l'adresse exacte d'une photo peut
-- l'ouvrir, logos compris. Ne pas diffuser ces URL publiquement.

-- ---------------------------------------------------------------------
-- Le bucket, avec des limites strictes pour borner les abus
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tees', 'tees', true, 2097152, array['image/jpeg','image/webp','image/png'])
on conflict (id) do update
  set public            = true,
      file_size_limit   = 2097152,                                   -- 2 Mo max
      allowed_mime_types = array['image/jpeg','image/webp','image/png'];

-- ---------------------------------------------------------------------
-- Dépôt autorisé, et rien d'autre
-- ---------------------------------------------------------------------
-- On repart d'un état propre pour que le script soit rejouable
drop policy if exists "tees depot"            on storage.objects;
drop policy if exists "tees lecture"          on storage.objects;
drop policy if exists "tees modification"     on storage.objects;
drop policy if exists "tees suppression"      on storage.objects;

-- Seul le dépôt est permis. Pas de policy SELECT : le listage reste fermé.
-- Pas de policy UPDATE ni DELETE : personne ne peut écraser ni effacer
-- une photo déjà déposée.
create policy "tees depot"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'tees');

-- ---------------------------------------------------------------------
-- Vérification rapide (doit renvoyer une ligne : tees, public = true)
-- ---------------------------------------------------------------------
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'tees';
