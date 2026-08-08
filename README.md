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

Tout est stocké dans le `localStorage` du navigateur — **aucun serveur, aucune base de données**. Les données sont donc liées à un appareil et à un navigateur : elles ne se synchronisent pas entre le téléphone et l'ordinateur, et vider les données du site les efface définitivement.

Clés utilisées : `swops.stock.v2` (carnet), `swops.roadmap.v1` (feuille de route) et `swops.strategie.v1` (stratégie).

Penser à **exporter le CSV régulièrement** depuis le carnet. Les exports (`stock-tees-*.csv`) sont ignorés par git : ils contiennent des données de vente et n'ont pas à être publiés.
