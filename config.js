/* Configuration de la synchronisation téléphone <-> ordinateur.
 *
 * Où trouver ces deux valeurs :
 *   Supabase > ton projet > Settings > API
 *     - "Project URL"            -> url
 *     - "anon" / "public" key    -> key
 *
 * Remplace les deux lignes ci-dessous, puis pousse sur GitHub.
 * Tant que ce n'est pas rempli, le site fonctionne exactement comme avant,
 * en local sur chaque appareil, sans synchro.
 *
 * La clé "anon" est publique par nature : elle finit dans le navigateur et
 * n'est pas un secret. C'est pour ça que la table est verrouillée et que
 * tout passe par ton code de synchro (voir supabase-schema.sql).
 *
 * ATTENTION : ici on met UNIQUEMENT la clé "anon" / "public"
 * (ou "sb_publishable_..."). Jamais la clé "service_role" ni "sb_secret_..." :
 * elles contournent toutes les protections de la base, et ce fichier est
 * téléchargeable par n'importe qui depuis le site.
 */
window.SWOPS_SUPABASE = {
  url: "https://fihbqdccxltlzmuawwuo.supabase.co",
  key: "sb_publishable_91zx7E86_gRDhmHHd8gcQA_q9h8ar_6",

  // Bucket des photos de t-shirts (voir supabase-photos.sql).
  // Mettre "" pour désactiver complètement les photos.
  bucket: "tees"
};
