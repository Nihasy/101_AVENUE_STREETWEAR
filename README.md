# 101_AVENUE_STREETWEAR

Outils d'opérations pour la revente streetwear à Antananarivo. Site statique, sans build ni dépendance.

| Page | URL | Rôle |
|---|---|---|
| `index.html` | `/` | Accueil : accès aux trois outils + état rapide |
| `carnet.html` | `/carnet` | Carnet de stock et de ventes (KPIs, marge, export CSV) |
| `roadmap.html` | `/roadmap` | Feuille de route par phases avec gates et compte à rebours |
| `strategie.html` | `/strategie` | Stratégie pub : plafond de CPA, 4 vagues, tableau de bord, verdict |

## Lancer en local

Aucune installation. Ouvrir `index.html` dans un navigateur.

Pour reproduire les URL propres (`/carnet` au lieu de `/carnet.html`) comme en production :

```bash
npx serve .
```

## Déploiement

Déployé sur Vercel depuis la branche `main` — chaque push met le site à jour automatiquement.

`vercel.json` active les URL propres (`cleanUrls`) et envoie un en-tête `X-Robots-Tag: noindex, nofollow`, en cohérence avec la balise `robots` de chaque page.

## Données

Chaque appareil garde ses données dans le `localStorage` du navigateur : le site fonctionne donc hors ligne, et reste utilisable si la synchro tombe.

Clés utilisées : `swops.stock.v2` (carnet), `swops.roadmap.v1` (feuille de route) et `swops.strategie.v1` (stratégie).

Penser à **exporter les CSV régulièrement**. Les exports (`stock-tees-*.csv`, `strategie-pub-*.csv`) sont ignorés par git : ils contiennent des données de vente et n'ont pas à être publiés.

## Photos des t-shirts

Optionnel. Dans le carnet, une photo peut être prise ou choisie au moment de l'ajout au stock, ou ajoutée ensuite via le bouton `photo` de chaque article. Un clic sur une vignette l'agrandit et propose **remplacer** ou **retirer**.

« Retirer » détache la photo de l'article ; le fichier reste dans le bucket. Supabase refuse toute suppression qui ne passe pas par son API Storage, et cette API ne peut pas être protégée par le code de synchro : l'ouvrir laisserait n'importe qui effacer une photo dont l'adresse a fuité. Pour supprimer réellement un fichier : Supabase > Storage > `tees` > sélectionner > Delete.

**Mise en route :** SQL Editor > coller `supabase-photos.sql` > Run. Le nom du bucket est dans `config.js` (`bucket`) ; le mettre à `""` désactive complètement les photos.

L'image est compressée dans le navigateur — côté long ramené à 1000 px, qualité JPEG 0,72, soit une vingtaine de Ko pour une photo de t-shirt ordinaire et ~230 Ko dans le pire cas — puis envoyée au bucket ; **seul le nom du fichier est enregistré sur l'article**, donc la synchro reste légère.

Le bucket est lisible publiquement **par URL directe uniquement** : aucune règle de lecture n'est créée, donc le listage est fermé et les photos ne peuvent pas être énumérées. Les noms sont tirés au sort sur 24 caractères. Conséquence à connaître : qui obtient l'adresse exacte d'une photo peut l'ouvrir, logos compris — ne pas diffuser ces URL.

## Synchronisation téléphone / ordinateur

Optionnelle. Sans configuration, chaque appareil reste indépendant, exactement comme avant.

**Mise en route :**

1. Créer un projet sur [supabase.com](https://supabase.com) (gratuit, sans carte).
2. SQL Editor > New query > coller `supabase-schema.sql` > Run.
3. Settings > API : copier *Project URL* et la clé *anon*, les mettre dans `config.js`.
4. Pousser sur GitHub — Vercel redéploie tout seul.
5. Sur le premier appareil : bandeau *Synchro* > **Gérer** > copier le code affiché.
6. Sur le second : **Gérer** > coller le code > **Relier cet appareil**.

Ensuite tout est automatique : chaque modification part au bout d'une seconde et demie, et chaque appareil vérifie les nouveautés au chargement, au retour sur l'onglet, et toutes les 30 secondes.

**Si les deux appareils ont changé chacun de leur côté** (typiquement l'un hors réseau), rien n'est écrasé en silence : un bandeau demande lequel garder.

La clé *anon* est publique par nature — elle est visible dans le navigateur. La sécurité repose sur le **code de synchro** : la table est verrouillée et n'est accessible qu'à travers deux fonctions qui exigent ce code. Le traiter comme un mot de passe.

