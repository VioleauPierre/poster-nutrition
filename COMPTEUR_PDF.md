# Compteur anonyme du PDF — branche de test

## Objectif

Conserver **exactement** l'URL du QR code :
`https://affiche-diagnostic.pages.dev/compte_rendu_VF4.pdf`.

La fonction `functions/compte_rendu_VF4.pdf.js` ne modifie ni le PDF `compte_rendu_VF4.pdf`, ni l'URL, ni les en-têtes retournés par Cloudflare Pages. Elle sert l'asset statique existant via `env.ASSETS.fetch(request)`.

## Sécurité et séparation des bases

**Écriture désactivée par défaut.** Le compteur n'écrit en D1 que si la variable `PDF_COUNTER_ENABLED` vaut exactement `true` dans l'environnement Cloudflare concerné.

Selon les captures du 10 novembre 2026, **Preview et Production pointent tous deux vers `affiche-diagnostic-preview` sous le nom de binding `DB`**. Avant d'activer le comptage, séparer les bases D1 et n'activer la variable qu'en Preview pour les essais.

Dans chaque base, la table doit être :

```sql
CREATE TABLE IF NOT EXISTS pdf_daily_opens (
  day TEXT PRIMARY KEY NOT NULL,
  opens INTEGER NOT NULL
);
```

## Vérifications Preview

1. Ouvrir dans Cloudflare Pages > affiche-diagnostic > Deployments, identifier **un déploiement Preview** de la branche `feat/pdf-counter-preview-safe`. Le déploiement automatique dépend de la configuration des branches Cloudflare.
2. Ouvrir `<URL Preview>/compte_rendu_VF4.pdf`. Vérifier l'affichage intégral, la première et la dernière page et le téléchargement du PDF.
3. Avec `PDF_COUNTER_ENABLED` absent, vérifier que D1 n'est pas modifiée.
4. **Après séparation** de la base D1 Preview, définir `PDF_COUNTER_ENABLED=true` dans l'environnement Preview seulement, redéployer la Preview puis vérifier l'incrémentation et les requêtes Range.
5. Ne fusionner sur `main`, ne déployer en Production et n'activer le compteur en Production qu'avec une autorisation distincte.
6. Vérifier à nouveau l'URL exacte du QR code après autorisation Production.

## Lecture des statistiques

Depuis la console D1 de la bonne base :

```sql
SELECT day, opens FROM pdf_daily_opens ORDER BY day DESC;
SELECT COALESCE(SUM(opens), 0) AS total FROM pdf_daily_opens;
```

Les jours sont exprimés en UTC. Le chiffre représente des **requêtes initiales** de lecture/téléchargement du PDF, pas des visiteurs uniques ni une mesure garantie des lectures humaines. Les séquences Range atypiques et les affichages uniquement depuis un cache local peuvent ne pas être comptés. Aucun IP, cookie, user-agent, identifiant personnel ou URL de requête complète n'est stocké par ce code.
