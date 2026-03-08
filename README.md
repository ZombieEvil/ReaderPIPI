# Pipi Reader Web v3.2

Cette version règle le vrai blocage que tu vois sur GitHub Pages : **Dropbox bloque le chargement JavaScript du PDF**, donc PDF.js ne peut pas extraire les pages directement depuis une URL partagée.

## Ce qui marche maintenant
- **PDF local** importé dans le site → rendu intégré en pages canvas
- **PDF distant** → rendu intégré **si tu ajoutes le proxy PDF**
- **PDF natif** reste disponible en secours

## Pourquoi ça bloquait
GitHub Pages est un site statique. Il ne peut pas enlever les règles CORS mises par Dropbox.

## Déploiement rapide du proxy avec Cloudflare Workers
1. Crée un worker Cloudflare.
2. Remplace son contenu par `cloudflare-worker.js`.
3. Déploie le worker.
4. Copie l’URL du worker (ex: `https://pipi-proxy.toncompte.workers.dev/`).
5. Dans le site, colle cette URL dans **Proxy PDF** puis clique sur **Enregistrer**.
6. Recharge le chapitre.

## Format du proxy
Le site appelle le worker comme ceci :

`https://ton-worker.workers.dev/?url=https%3A%2F%2Fwww.dropbox.com%2F...`

Le worker récupère le PDF, renvoie les bons en-têtes CORS et permet à PDF.js d’afficher les pages directement dans le site.
