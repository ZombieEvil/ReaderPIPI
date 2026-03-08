# Pipi Reader Web

Prototype statique HTML / CSS / JS pour lire :

- des fichiers **PDF locaux**
- des fichiers **`.pipi` en clair**
- des fichiers **`.pipi` chiffrés** si le mot de passe est connu

## Ce que j'ai implémenté

- import multiple par clic ou glisser-déposer
- bibliothèque locale
- rendu des PDF avec **PDF.js**
- parsing du format `.pipi` texte basé sur le séparateur `%%%-%%%`
- affichage des métadonnées : titre, description, auteur, artiste, statut, langue, source, couverture
- liste des chapitres
- ouverture d'un chapitre via son URL
- association automatique d'un chapitre `.pipi` à un PDF local si les noms correspondent (`Chapitre 1` ↔ `1.pdf`)
- tentative de déchiffrement des `.pipi` au format OpenSSL via mot de passe

## Limites réelles

1. Certains liens de chapitres distants peuvent être bloqués par **CORS** dans le navigateur.
2. Si un `.pipi` est chiffré avec un mot de passe inconnu ou un schéma différent, la lecture ne pourra pas être garantie en pur front-end.
3. Le prototype rend toutes les pages du PDF en vertical ; ce n'est pas encore un lecteur virtualisé pour très gros chapitres.

## Lancer le projet

Comme c'est un site statique, il suffit d'ouvrir `index.html` dans un navigateur moderne.

Pour éviter certains soucis de sécurité navigateur, le mieux est de servir le dossier avec un petit serveur local, par exemple :

```bash
python -m http.server 8000
```

Puis ouvrir :

```text
http://localhost:8000/
```

## Fichiers

- `index.html`
- `styles.css`
- `app.js`
- `README.md`
