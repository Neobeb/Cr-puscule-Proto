# Crepuscule Online

Prototype multijoueur en ligne pour tests de gameplay.

## Lancement local

1. Installer Node.js 20 ou plus.
2. Installer les dependances avec `npm install`.
3. Lancer le serveur de jeu avec `npm run start:server`.
4. Dans un autre terminal, lancer l'interface avec `npm start`.

Le front tourne en general sur `http://localhost:3000` et le serveur de jeu sur `http://localhost:3001`.

## Deploiement Render

Le projet contient deja un fichier `render.yaml`.

Sur Render :

1. Creez un compte puis connectez votre depot GitHub.
2. Importez le repository.
3. Render detectera `render.yaml`.
4. Validez la creation du service web.
5. Attendez la fin du build.

Le service demarrera avec :

- build command : `npm install && npm run build`
- start command : `npm run serve`
- health check : `/api/health`

## Limites actuelles

- Les parties sont stockees en memoire.
- Si le service redemarre, les parties en cours sont perdues.
- C'est suffisant pour une phase de test, mais pas pour une production durable.
