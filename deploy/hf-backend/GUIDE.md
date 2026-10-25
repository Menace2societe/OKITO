# Backend ClipFlow sur Hugging Face

Le backend en ligne tourne sur le Space **Menace2society/clipflow-backend**
(matériel ZeroGPU, gratuit). Il traite les vidéos importées ; les liens YouTube
passent par le PC.

- Page du Space : <https://huggingface.co/spaces/Menace2society/clipflow-backend>
- API : `https://menace2society-clipflow-backend.hf.space/cf/api/…`
- Test rapide : `…/cf/api/health` doit répondre `"status": "ok"`.

## Réglages du Space

Dans **Settings** → **Variables and secrets** :

| Nom | Type | Valeur |
| --- | --- | --- |
| `CLIPFLOW_ACCESS_CODE` | Secret | Le code d'accès choisi pour ClipFlow |
| `CLIPFLOW_CORS_ORIGINS` | Variable | L'adresse du site ClipFlow, ex. `https://clipflow.vercel.app` |
| `ANTHROPIC_API_KEY` | Secret (optionnel) | Pour les meilleurs moments choisis par Claude |

Tant que `CLIPFLOW_ACCESS_CODE` n'est pas défini, l'API est ouverte : le Space
doit alors rester **privé**. Ne le passer en public qu'une fois le code défini.

## Mettre à jour le backend en ligne

Après une modification de `backend/` (une fois `hf auth login` fait) :

```powershell
.\venv\Scripts\python.exe deploy\hf-backend\build_space.py
.\venv\Scripts\hf.exe upload Menace2society/clipflow-backend deploy\hf-backend\dist . --repo-type=space
```

Le Space se reconstruit en une minute environ.

## Ce qui diffère du backend local

- Page d'accueil Gradio minimale : ZeroGPU n'accepte que des apps Gradio
  ayant une fonction `@spaces.GPU` (voir `space_app.py`).
- API montée sous `/cf` au lieu de la racine.
- Whisper sur CPU en modèle `small` (`base` en mode « Rapide »), sans
  isolation de la voix (Demucs).
- Encodage x264 en `veryfast` au lieu de `fast` : rendu plus rapide, fichier
  un peu plus lourd (`CLIPFLOW_X264_PRESET`).
- Les fichiers sont effacés à chaque redémarrage du Space.
- Le Space s'endort sans visite : le premier accès suivant prend une à deux
  minutes.
