# ClipFlow

ClipFlow est un studio de montage vidéo local et moderne : importez une vidéo,
recadrez-la, générez des sous-titres automatiques et exportez-la prête pour les
réseaux sociaux — le tout sans service cloud.

## Fonctionnalités

- **Import** : fichier local (`.mp4`, `.mkv`, `.mov`, `.mp3`) ou lien (YouTube, etc.).
- **Trim / Édition** : sélection de la séquence, cadrage 9:16 / 1:1 / 16:9 et
  filtres vidéo (Cinéma Intense, Vibrant Social, Noir & Blanc Profond, Aucun).
- **Sous-titres** : transcription locale via Whisper et 3 presets ASS
  (Bold TikTok, Neon Yellow, Minimal Clean).
- **Prévisualisation** : lecteur HTML5 intégré aux étapes Trim et Subtitles pour
  valider le cadrage avant le rendu.
- **Export** : rendu FFmpeg en MP4, MKV ou MP3.

## Pile technique

- **Frontend** : Next.js 14 (App Router), React, Tailwind CSS, Radix UI.
- **Backend** : FastAPI, FFmpeg / FFprobe, faster-whisper.

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

## Structure

```
app/                  Pages Next.js (layout, page)
components/           Interface (step-wizard, steps, ui)
backend/
  main.py             Application FastAPI
  routes/             Endpoints (upload, download-url, process, status, files)
  services/           FFmpeg, Whisper, génération ASS (sous-titres)
  media/              Fichiers importés et rendus
```

## Filtres et presets

Les filtres vidéo sont définis dans `backend/services/ffmpeg_service.py`
(`VIDEO_FILTERS`) et les presets de sous-titres dans
`backend/services/subtitle_service.py` (`ASS_STYLE_PRESETS`).
