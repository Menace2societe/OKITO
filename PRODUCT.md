# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Jonathan Kamunga, chef de projet et développeur à Kinshasa, qui découpe ses propres vidéos (ou celles de ses projets) en clips verticaux pour TikTok, Instagram Reels et YouTube Shorts. ClipFlow sert d'abord un utilisateur unique qui connaît l'outil ; d'autres personnes peuvent l'ouvrir avec le code d'accès, mais elles ne sont pas le public prioritaire.

## Product Purpose

Transformer une longue vidéo en clips prêts à publier : trouver les bons passages, recadrer en vertical, sous-titrer mot à mot et exporter. Ce qui prendrait des heures de montage pour une minute de clip doit tenir en quelques réglages. Réussite : un clip publiable sort sans ouvrir un logiciel de montage.

## Positioning

Un studio de clips qui tourne sur ses propres moteurs (FFmpeg, Whisper, OpenCV) : local sur le PC, ou en ligne via un Space Hugging Face, avec le PC comme relais pour les liens YouTube. Les « meilleurs moments » sont choisis par Claude quand une clé API est présente, sinon par un score local ; « Clip aléatoire » coupe sur les pauses de la voix.

## Operating Context

- Utilisé surtout **sur ordinateur, avec une connexion fragile** (coupures, débit faible) pendant l'envoi de la vidéo et le rendu. L'envoi a une barre de progression ; le Space en ligne met 1 à 2 minutes à se réveiller après une pause.
- Parcours en 4 étapes : Import (fichier local ou lien) → Découpe (sélection, format, cadrage, filtre, clip aléatoire, meilleurs moments) → Sous-titres (transcription, édition ligne par ligne, style) → Export (MP4, MKV, MP3, clips en lot).
- Version en ligne fermée par un code d'accès (demandé sur WhatsApp) ; un témoin indique si le PC relais est allumé.

## Capabilities and Constraints

- Import `.mp4`, `.mkv`, `.mov`, `.mp3` ou lien (YouTube, etc. via le PC relais).
- Cadrage 9:16 (vidéo entière sur fond flou, crop centré ou suivi du visage), 1:1, 16:9 ; 7 filtres vidéo.
- Clip aléatoire (15–30 s, 30–60 s, 60–90 s), meilleurs moments, 3, 5 ou 10 clips en un lancement, look aléatoire.
- Sous-titres Whisper avec le mot prononcé surligné, 4 styles, correction ligne par ligne qui garde le timing ; isolation de la voix (Demucs).
- Son normalisé à -14 LUFS ; export MP4, MKV ou MP3 ; file de rendus persistante (SQLite).
- Pas de comptes, pas de rôles, pas d'inscription : seul l'écran de code d'accès précède l'app en ligne.
- Stack : Next.js 14 (App Router), Tailwind, Radix UI côté interface ; FastAPI, FFmpeg, faster-whisper, OpenCV, SQLite côté serveur. Front sur Vercel.

## Brand Commitments

- Nom : ClipFlow. Seul élément d'identité existant : `app/icon.svg`.
- Textes en français simple, avec les accents. Les erreurs disent le problème et la solution.

## Evidence on Hand

- Icône : `app/icon.svg`.
- Aucun logo complet, aucun utilisateur nommé, aucun témoignage, aucun clip réel publiable. Ne rien inventer de tout cela ; toute vidéo ou donnée d'exemple doit être marquée « exemple ».

## Product Principles

1. Le clip d'abord : chaque écran rapproche d'un fichier publiable, sans détour.
2. Robuste sur un réseau fragile : l'état de l'envoi, du réveil du serveur et du rendu est toujours visible et compréhensible.
3. Un outil de travail pour quelqu'un qui le connaît : rapide à relancer, pas de pédagogie superflue.
4. Honnête sur ce que fait la machine : on dit quand c'est Claude ou le score local qui choisit, et quand le PC relais est éteint.

## Accessibility & Inclusion

Texte d'au moins 15 px, cibles d'au moins 48 px, contraste lisible même sur un écran en plein jour.
