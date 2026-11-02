---
version: 1
slug: "app-page-tsx"
primary_target: "app/page.tsx"
related_targets: ["components/step-wizard.tsx","components/access-gate.tsx"]
---

# ClipFlow : l'atelier (assistant en 4 étapes et écran du code d'accès)

Mode : Operate. Construction en code, d'après la maquette `.impeccable/mocks/decision/assigned.html` (étape Découpe, 1440 × 900).

Public : Jonathan, seul créateur, sur ordinateur, connexion fragile. Tâche : passer d'une longue vidéo à un clip publiable. Contraintes : mêmes appels API, mêmes champs, même logique d'état ; textes français simples ; un seul bouton principal par écran ; cibles 48 px ; texte 15 px minimum ; données d'exemple marquées « exemple ».

Périmètre, dans l'ordre : Découpe (pilote), puis Import, Sous-titres, Export, clips en lot, écran du code d'accès ; ensuite une page 404 et une page hors ligne simples, si Jonathan confirme. Pas de page d'accueil publique.

## Direction contract

THESIS: Chaque clip sort comme un tirage de studio photo de quartier : un portrait vertical à bord blanc, tamponné de ses temps. Refuse l'éditeur sombre à ligne de temps en bas et le SaaS blanc à boutons bleus arrondis.

OWN-WORLD: Bleu toile de fond #2F5D86 sur l'en-tête et le bouton principal ; papier photo blanc #FBFBF8 pour les zones de travail sur un fond gris-bleu #E7EBEF ; encre #1C1F24 ; violet de tampon #5B2A86 réservé à la sélection et aux temps. Archivo (largeur variable), auto-hébergée. Angles droits, filets d'1 px, aucune ombre sauf le tirage. Pas de dégradé, de halo, d'icône décorative ni d'étiquette en petites capitales.

STORY: Jonathan voit d'abord l'image de son clip, sait à quelle étape il est et si le PC relais répond, ajuste le passage, puis avance d'un seul bouton.

FIRST VIEWPORT: Barre bleue de 96 px : « ClipFlow », les 4 étapes en grands mots (l'étape courante soulignée), témoin du PC, nom et durée du fichier. Dessous, à gauche l'aperçu 9:16 en tirage avec son tampon violet ; à droite le titre de l'étape, la sélection sur la piste, les outils, puis la liste des moments en colonnes fixes. Pied fixe : « Retour » en lien, « Suivant : … » seul bouton plein, à droite.

FORM: Tirage de studio, 5e de ma liste ordonnée (désignée par le tirage). Signature : le tampon des temps qui se pose sur le tirage quand on choisit un moment ou qu'un rendu se termine. Apports : étapes en grands mots (Metro) ; même mobilier par moment (catalogue) ; états en marques imprimées (rail) ; une seule zone domine (plan) ; colonnes fixes (tableau à palettes). seed:5bd845d3391bf5d6

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
