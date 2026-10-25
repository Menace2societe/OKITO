# ClipFlow

ClipFlow est un studio de montage vidéo local et moderne : importez une vidéo,
recadrez-la, générez des sous-titres automatiques et exportez-la prête pour les
réseaux sociaux — le tout sans service cloud.

## Fonctionnalités

- **Import** : fichier local (`.mp4`, `.mkv`, `.mov`, `.mp3`) ou lien (YouTube, etc.).
- **Trim / Édition** : sélection de la séquence, cadrage 9:16 (vidéo entière
  sur fond flou, crop centré ou **suivi du visage** via OpenCV) / 1:1 / 16:9 et 7 filtres vidéo (Cinéma Intense,
  Vibrant Social, Warm Vlog, Cold Teal, Vintage Film, Noir & Blanc Profond, Aucun).
- **Clip aléatoire** : extrait de 15–30 s, 30–60 s ou 60–90 s tiré au hasard et
  calé sur les pauses de la voix (`silencedetect`) ; « Look aléatoire » tire un
  filtre et un style de sous-titres.
- **Meilleurs moments** : Whisper transcrit la vidéo entière (mis en cache),
  puis Claude choisit les passages les plus forts. Sans clé API, un score local
  (débit de parole, intensité sonore, mots d'accroche) prend le relais.
- **Plusieurs clips en un lancement** : 3, 5 ou 10 clips (aléatoires ou
  meilleurs moments), avec un look différent par clip si souhaité.
- **Sous-titres** : transcription locale via Whisper, mot prononcé surligné
  (effet TikTok) et 4 presets ASS (Bold TikTok, Neon Yellow, Impact Pop,
  Minimal Clean). Le texte corrigé garde le timing exact de la voix.
- **Audio** : normalisation EBU R128 à -14 LUFS (niveau TikTok / Reels / Shorts).
- **Prévisualisation** : lecteur HTML5 intégré aux étapes Trim et Subtitles pour
  valider le cadrage avant le rendu.
- **Export** : rendu FFmpeg en MP4, MKV ou MP3.

- **Jobs persistants** : la file de rendus est stockée en SQLite
  (`backend/data/jobs.db`) et survit à un redémarrage.
- **Ménage automatique** : `backend/media` est nettoyé au démarrage puis toutes
  les 6 h (fichiers de plus de `MEDIA_RETENTION_DAYS` jours, 7 par défaut,
  fichiers temporaires et imports en double). Un même fichier importé deux fois
  n'est stocké qu'une fois.

## Configuration

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | — | Active le choix des meilleurs moments par Claude |
| `CLIPFLOW_LLM` | `on` | `off` pour forcer le score local |
| `CLIPFLOW_LLM_MODEL` | `claude-opus-5-5` | Modèle utilisé pour les meilleurs moments |
| `MEDIA_RETENTION_DAYS` | `7` | Durée de conservation des fichiers média |
| `CLIPFLOW_ACCESS_CODE` | — | Mode en ligne : code exigé dans l'en-tête `X-ClipFlow-Key` (sauf `/api/health`, `/api/files/…`, `/media/…`) |
| `CLIPFLOW_CORS_ORIGINS` | `http://localhost:3000` | Domaines autorisés à appeler l'API depuis un navigateur, séparés par des virgules |
| `CLIPFLOW_ROLE` | `pc` | `pc` ou `cloud`, renvoyé par `/api/health` |

Sans ces trois variables, ClipFlow fonctionne en local exactement comme avant.
Le backend en ligne (Space Hugging Face) est décrit dans
`deploy/hf-backend/GUIDE.md`.

## Pile technique

- **Frontend** : Next.js 14 (App Router), React, Tailwind CSS, Radix UI.
- **Backend** : FastAPI, FFmpeg / FFprobe, faster-whisper, OpenCV, SQLite,
  SDK Anthropic (optionnel).

## Prérequis

- Node.js 18+
- Python 3.10+
- FFmpeg installé et disponible dans le `PATH` (ou dans `C:\ffmpeg\bin\`).

## Démarrage

```bash
# Frontend
npm install
npm run dev
```

```bash
# Backend
pip install -r requirements.txt
uvicorn backend.main:app --reload --port 8000
```

Le frontend est disponible sur `http://localhost:3000` et l'API sur
`http://localhost:8000`.

## Utilisation au quotidien (mode production)

```powershell
.\start-clipflow.ps1          # lance le backend, le frontend et tailscale serve
.\start-clipflow.ps1 -Build   # à faire après une modification du code
.\start-clipflow.ps1 -Stop    # arrête tout
```

Les deux serveurs n'écoutent que sur `127.0.0.1` : l'application est
accessible sur ce PC (`http://localhost:3000`) et, via `tailscale serve`, depuis
tes appareils Tailscale (`https://<nom-du-pc>.<tailnet>.ts.net`) — jamais depuis
l'internet public. Les journaux sont dans `logs/`.

### Liens YouTube depuis le site en ligne

YouTube bloque les serveurs gratuits : en ligne, les liens YouTube sont
téléchargés par ce PC. Pour l'activer, copier `.env.local.example` en
`.env.local`, y mettre le code d'accès, puis relancer `.\start-clipflow.ps1`.
Le script publie alors **le backend seul** sur internet avec
`tailscale funnel` (port 8443) et affiche son adresse publique. Chaque requête
doit porter le code ; le frontend local l'ajoute lui-même (`middleware.ts`,
`lib/backend-proxy.ts`). Sans `.env.local`, rien n'est publié.

Une seule fois : autoriser Funnel pour ce PC dans la console Tailscale
(la première commande `tailscale funnel` affiche le lien à ouvrir).

Démarrage automatique : un raccourci `ClipFlow.lnk` dans le dossier Démarrage
de Windows (`shell:startup`) lance le script, masqué, à chaque ouverture de
session. Supprimer ce raccourci pour désactiver le démarrage automatique.

## Structure

```
app/                  Pages Next.js (layout, page)
components/           Interface (step-wizard, steps, ui)
backend/
  main.py             Application FastAPI
  routes/             Endpoints (upload, download-url, process, status, files,
                      random-clip, analyze, batch, media)
  services/           FFmpeg, Whisper, ASS, suivi de visage, meilleurs moments,
                      jobs SQLite, nettoyage
  media/              Fichiers importés et rendus (nettoyé automatiquement)
  data/               Base SQLite des jobs
```

## Filtres et presets

Les filtres vidéo sont définis dans `backend/services/ffmpeg_service.py`
(`VIDEO_FILTERS`) et les presets de sous-titres dans
`backend/services/subtitle_service.py` (`ASS_STYLE_PRESETS`). Les libellés
côté interface sont dans `lib/presets.ts` : les clés doivent correspondre.
