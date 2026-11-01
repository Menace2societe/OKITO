---
name: ClipFlow
description: Atelier de découpe de clips verticaux, habillé en tirage de studio photo.
colors:
  toile: "hsl(207 48% 35%)"
  toile-fonce: "hsl(207 49% 28%)"
  tampon: "hsl(272 52% 35%)"
  papier: "hsl(60 23% 98%)"
  fond: "hsl(210 17% 92%)"
  encre: "hsl(216 13% 13%)"
  gris: "hsl(213 9% 33%)"
  filet: "hsl(213 13% 85%)"
  filet-fort: "hsl(211 10% 60%)"
  survol: "hsl(210 20% 95%)"
  erreur: "hsl(4 68% 40%)"
  ok: "hsl(145 55% 30%)"
  blanc: "#ffffff"
typography:
  marque:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 800
    lineHeight: 1.333
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 112"
  etapes:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 800
    lineHeight: 1.25
    fontVariation: "'wdth' 88"
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 92"
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.333
    fontVariation: "'wdth' 92"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  body-strong:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.5
  secondaire:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  tampon-temps:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.25
    fontFeature: "'tnum'"
    fontVariation: "'wdth' 90"
  tampon-duree:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.25
    fontFeature: "'tnum'"
  bouton-grand:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.556
rounded:
  none: "0px"
spacing:
  gouttiere-mobile: "16px"
  gouttiere: "40px"
  colonnes: "40px"
  sections: "40px"
  apres-filet: "32px"
  bloc: "24px"
  panneau: "20px"
  cellule: "12px 16px"
  bord-tirage-mobile: "12px"
  bord-tirage: "20px"
components:
  button-primary:
    backgroundColor: "{colors.toile}"
    textColor: "{colors.blanc}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.none}"
    padding: "0 20px"
    height: "48px"
  button-primary-lg:
    backgroundColor: "{colors.toile}"
    textColor: "{colors.blanc}"
    typography: "{typography.bouton-grand}"
    rounded: "{rounded.none}"
    padding: "0 28px"
    height: "56px"
  button-outline:
    backgroundColor: "{colors.papier}"
    textColor: "{colors.encre}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.none}"
    padding: "0 20px"
    height: "48px"
  button-outline-hover:
    backgroundColor: "{colors.survol}"
  button-ghost-icon:
    textColor: "{colors.encre}"
    rounded: "{rounded.none}"
    size: "48px"
  option-choisie:
    backgroundColor: "{colors.encre}"
    textColor: "{colors.blanc}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.none}"
    padding: "0 16px"
    height: "48px"
  option-libre:
    backgroundColor: "{colors.papier}"
    textColor: "{colors.encre}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "0 16px"
    height: "48px"
  input:
    backgroundColor: "{colors.papier}"
    textColor: "{colors.encre}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "8px 16px"
    height: "48px"
  barre-studio:
    backgroundColor: "{colors.toile}"
    textColor: "{colors.blanc}"
    padding: "16px 40px"
    height: "96px"
  pied-fixe:
    backgroundColor: "{colors.papier}"
    textColor: "{colors.encre}"
    padding: "16px 40px"
    height: "88px"
  panneau:
    backgroundColor: "{colors.papier}"
    textColor: "{colors.encre}"
    rounded: "{rounded.none}"
    padding: "20px"
  tirage:
    backgroundColor: "{colors.papier}"
    rounded: "{rounded.none}"
    padding: "20px 20px 0"
  tampon:
    textColor: "{colors.tampon}"
    typography: "{typography.tampon-temps}"
    rounded: "{rounded.none}"
    padding: "6px 12px"
---

# Design System: ClipFlow

## Overview

**Creative North Star: "Le tirage de studio"**

ClipFlow se présente comme le comptoir d'un studio photo de quartier. Une barre bleue, de la couleur d'une toile de fond peinte, porte le nom et les quatre étapes en grands mots. Dessous, sur un mur gris-bleu, l'aperçu du clip est posé comme un tirage : bord blanc de papier photo, une seule ombre, et un tampon violet incliné qui porte les temps du passage. Tout le reste est du papier à angles droits, séparé par des filets d'un pixel.

La densité est celle d'un outil de travail : une colonne de contrôles à droite de l'aperçu, des sections séparées par des filets, des listes en colonnes fixes. La hiérarchie vient de la taille et de la graisse d'Archivo et de sa largeur variable, pas de la couleur ni de la profondeur. La couleur est rare : le bleu pour la barre et l'action qui fait avancer, le violet pour ce qui est choisi et pour les temps, l'encre pour l'option sélectionnée.

Le système refuse l'éditeur vidéo sombre avec sa ligne de temps en bas, et l'interface blanche à boutons bleus arrondis. Il n'utilise ni dégradé, ni halo, ni coin arrondi, ni petite étiquette en capitales.

**Key Characteristics:**
- Angles droits partout (rayon 0), filets d'1 px pour séparer.
- Une seule ombre dans tout le système : celle du tirage.
- Un seul bouton plein (bleu toile) par écran.
- Le violet du tampon marque la sélection, les temps et l'avancement.
- Archivo auto-hébergée, largeur variable : étroite pour les titres, large pour la marque.
- Cibles d'au moins 48 px, texte d'au moins 15 px, chiffres tabulaires pour les temps.

## Colors

Une palette de studio : un bleu de toile peinte, un violet d'encre à tampon, et des papiers et gris légèrement bleutés. Toutes les valeurs vivent sous la classe `.univers-tirage` (`app/globals.css`), qui remappe aussi les variables shadcn (`--primary` devient la toile, `--ring` le tampon, `--radius` 0).

### Primary
- **Bleu toile de fond** (`toile`) : fond de la barre du haut (en-tête de l'app et de l'écran du code d'accès), fond du bouton principal, curseur et piste remplie du réglage de cadrage, interrupteur activé, couleur d'accent native des contrôles du navigateur. Texte blanc dessus.
- **Bleu toile foncé** (`toile-fonce`) : prévu pour le survol et l'appui du bouton principal ; voir les écarts dans le rapport, le bouton utilise aujourd'hui la toile à 90 % d'opacité.

### Secondary
- **Violet de tampon** (`tampon`) : la sélection et les temps. Cadre de 2 px et voile à 10 % de la plage choisie sur la piste, poignées de la piste, tampon des temps sur le tirage, valeur « Passage » de la fiche du clip, titre et voile à 8 % du moment choisi, ligne de sous-titre en cours de lecture, passage d'un clip prêt dans la série. Il remplit aussi les barres d'avancement (envoi, analyse, transcription, rendu, série), et sert à l'anneau de focus, au curseur de saisie et à la sélection de texte.

### Neutral
- **Papier photo** (`papier`) : bord du tirage, panneaux, listes, champs, boutons à contour, options non choisies, pied fixe.
- **Mur du studio** (`fond`) : fond de page sous le papier.
- **Encre** (`encre`) : texte principal ; fond plein des options choisies (formats, durées, qualité, style de sous-titres) et du bandeau d'aperçu des styles.
- **Gris légende** (`gris`) : texte secondaire, légendes, en-têtes de colonnes, textes d'aide (7,4:1 sur le papier).
- **Filet** (`filet`) : filets d'1 px entre sections, lignes de liste, bords des panneaux, piste vide des barres d'avancement.
- **Filet fort** (`filet-fort`) : bords des contrôles (boutons à contour, champs, groupes d'options, interrupteur), soulignement des liens au repos, pointillés de la zone de dépôt.
- **Papier au survol** (`survol`) : fond au survol des options, boutons à contour, lignes de liste, éléments de menu.
- **Erreur** (`erreur`) et **Fait** (`ok`) : messages d'erreur et témoin « PC relais allumé / éteint ». Jamais en fond de bloc.

### Named Rules
**La règle du tampon.** Le violet ne sert qu'à ce qui est choisi, à ce qui se mesure en temps, et au focus. Jamais en fond de bouton, jamais en titre, jamais en décor.

**La règle de l'encre pleine.** Une option sélectionnée se marque en aplat d'encre avec texte blanc, pas en bleu : le bleu plein est réservé à l'action qui fait avancer.

**L'exception du rendu.** Les aperçus des styles de sous-titres gardent les vraies couleurs du rendu vidéo (blanc, jaune, vert, contours noirs, capitales du style Impact), posées sur un bandeau d'encre. De même, le fond flou derrière une vidéo verticale imite le rendu FFmpeg. Ces couleurs et effets appartiennent à la vidéo, pas à l'interface ; ils ne sortent jamais de l'aperçu.

## Typography

**Display Font:** Archivo (avec system-ui, sans-serif), fichier variable auto-hébergé `app/fonts/archivo-latin-variable.woff2`, axes graisse 100–900 et largeur 62–125 %.
**Body Font:** Archivo, même fichier.

**Character:** Une seule famille, jouée sur sa largeur : resserrée (88–92 %) pour les étapes et les titres, qui gagnent de la présence sans prendre de place, élargie (112 %) pour le nom ClipFlow. Le texte courant reste à largeur normale.

### Hierarchy
- **Marque** (800, 24 px, largeur 112 %, approche -0,01em) : « ClipFlow » dans la barre bleue.
- **Étapes** (30 px, largeur 88 %, interligne 1,25) : les quatre étapes dans la barre ; l'étape courante en 800 blanc soulignée d'un trait blanc de 3 px, les autres en 500, blanc à 85 % (passées) ou 65 % (à venir).
- **Headline** (800, 34 px, largeur 92 %, interligne 1,25, approche -0,01em) : le titre unique de chaque écran (« Choisis le passage », « Code d'accès »).
- **Title** (700, 24 px, largeur 92 %) : titres de section (« Format », « Filtre vidéo »), invite de la zone de dépôt.
- **Body** (400 ou 600, 16 px, interligne 1,5) : taille de base de l'univers ; libellés, valeurs, boutons, champs.
- **Secondaire** (400, 15 px) : légendes, aides, en-têtes de colonnes, messages d'erreur, témoin du PC. C'est le plancher : rien n'est écrit plus petit.
- **Tampon** (700, 17 px, largeur 90 % pour les temps ; 500, 15 px pour la durée) : chiffres tabulaires.
- **Bouton grand** (600, 18 px) : bouton principal du pied fixe et de l'export.

Les textes d'aide sont limités à 68 caractères de large.

### Named Rules
**La règle des 15 px.** Aucun texte sous 15 px ; le texte de base est à 16 px.

**La règle des chiffres alignés.** Tout temps, durée, pourcentage ou taille de fichier est en chiffres tabulaires (classe `chiffres`), pour que les colonnes et les compteurs ne bougent pas.

**La règle des mots, pas des étiquettes.** Pas de petites étiquettes en capitales ni de surtitres : la hiérarchie se fait par la taille, la graisse et la largeur.

## Layout

Une page de 1440 px de large au plus, centrée, avec des gouttières de 16 px sur téléphone et 40 px à partir de 640 px. En haut, la barre bleue (96 px de haut à partir de 1024 px). En bas, un pied fixe sur papier, séparé par un filet (88 px à partir de 1024 px) : le lien « Retour » à gauche, le bouton « Suivant : … » à droite.

À partir de 1024 px, chaque étape est une grille à deux colonnes séparées de 40 px : à gauche le tirage (largeur naturelle, collé en haut pendant le défilement), à droite la colonne de travail. Le tirage mesure 270 × 480 px en vertical, 420 × 420 en carré, 560 × 315 en horizontal. Sous 1024 px, tout passe en une colonne, l'aperçu au-dessus, et la barre ne montre que l'étape courante suivie de « étape n sur 4 ».

La colonne de travail empile des sections espacées de 40 px ; à partir de la deuxième, chacune s'ouvre sur un filet suivi de 32 px. À l'intérieur, les blocs sont espacés de 24 puis 16 px. Les listes (meilleurs moments, série de clips, fiche du clip) ont des colonnes de largeur fixe et des cellules de 12 × 16 px ; sous 768 px, les colonnes secondaires se replient sous la première.

### Named Rules
**La règle de la zone unique.** Le tirage et la colonne de travail se partagent l'écran ; aucun troisième panneau, aucune barre latérale.

## Elevation & Depth

Le système est plat. La profondeur vient des matières : papier clair posé sur un mur gris-bleu, filets d'1 px. Une seule chose a une ombre : le tirage.

### Shadow Vocabulary
- **Ombre du tirage** (`0 1px 0 hsl(var(--filet-fort)), 0 12px 28px -16px rgba(28,31,36,0.45)`) : un liseré net sous le bord, puis une ombre courte et resserrée qui décolle le tirage du mur. Uniquement sur le bord blanc de l'aperçu (et sur le tirage vide de l'étape Import).

### Named Rules
**La règle de l'ombre unique.** Seul le tirage porte une ombre. Panneaux, boutons, champs et menus restent à plat, délimités par un filet.

## Shapes

Angles droits partout : `--radius` vaut 0 dans l'univers, ce qui annule les rayons hérités des composants shadcn. Les bords sont des filets d'1 px (`filet` pour séparer, `filet-fort` pour délimiter un contrôle). Les groupes d'options sont des rangées de cases collées dans un seul cadre, séparées par des filets intérieurs. Les grilles de choix (formats, styles de sous-titres) sont des cases séparées par un filet d'1 px obtenu par un écart de 1 px sur fond de filet.

La seule forme inclinée est le tampon, tourné de -4°, cadre de 2,5 px. La zone de dépôt passe en pointillés au survol et pendant le glisser.

## Components

### Buttons
Rectangles nets, sans rayon, texte à 600.
- **Shape :** angles droits (0 px), hauteur 48 px (56 px pour la grande taille).
- **Principal :** toile pleine, texte blanc, 0 × 20 px (grand : 0 × 28 px, 18 px). Un seul par écran : « Suivant : … » dans le pied fixe, « Lancer le rendu », « Télécharger le clip » ou « Relancer le rendu » à l'export, « Entrer » au code d'accès.
- **Survol / Focus :** survol en toile à 90 % ; focus par anneau violet de 2 px décalé de 2 px ; désactivé à 50 % d'opacité.
- **À contour :** papier, filet fort d'1 px, texte encre ; survol en papier de survol. Pour toutes les actions secondaires (« Meilleurs moments », « Clip aléatoire », « Choisir un fichier », « Lancer 5 clips »…).
- **Fantôme icône :** carré de 48 px sans fond, icône de 16 px, survol en papier de survol ; utilisé seulement dans l'éditeur de lignes (écouter, ajouter au vocabulaire), toujours avec un libellé accessible.
- **Lien :** « Retour », « Nouvelle vidéo », « .srt », « Télécharger » dans la série : texte souligné (décalage 4 px), soulignement filet fort qui passe à l'encre au survol ; hauteur minimale 48 px.
- **Chargement :** icône qui tourne de 16 px (20 px sur le grand bouton) avant le libellé.

### Options collées
- **Style :** cases de 48 px de haut dans un cadre filet fort, séparées par des filets ; papier au repos, papier de survol au survol.
- **Choisie :** aplat d'encre, texte blanc à 600. Rôle de bouton à état (`aria-pressed`) ou de bouton radio. Variante haute (72 px) avec nom et usage pour les formats d'image.

### Cards / Containers
- **Corner Style :** 0 px.
- **Background :** papier sur le mur.
- **Shadow Strategy :** aucune (voir Elevation & Depth).
- **Border :** filet d'1 px.
- **Internal Padding :** 20 px pour un panneau de réglages ; 12 × 16 px par cellule de liste ; 24 à 32 px pour le panneau du code d'accès.

### Inputs / Fields
- **Style :** papier, filet fort d'1 px, 48 px de haut, 16 px de marge intérieure, texte 16 px ; indication en gris.
- **Focus :** anneau violet de 2 px décalé de 2 px.
- **Error / Disabled :** message d'erreur en rouge à 15 px sous le champ, relié par `aria-describedby` ; désactivé à 50 %.
- **Réglage simple :** piste de 6 px en filet, partie remplie en toile, curseur carré de 24 px en papier cerclé de toile, avec une zone de prise de 48 px.
- **Interrupteur :** rectangle de 48 × 28 px, cadre filet fort, rempli de toile quand il est activé, carré de papier qui glisse ; toujours posé dans une rangée de 48 px avec son libellé cliquable.
- **Menu déroulant :** déclencheur identique au champ ; éléments de 48 px, papier de survol au focus.

### Navigation
- **Barre studio :** fond toile, texte blanc. « ClipFlow », puis les étapes en grands mots (voir Typography), puis à droite le témoin du PC (pastille de 10 px et libellé à 15 px), le nom et la durée du fichier séparés par un filet blanc à 30 %, et le lien « Nouvelle vidéo ». Les étapes ne sont pas cliquables : on avance par le pied fixe.
- **Pied fixe :** papier, filet en haut, collé en bas de l'écran. Lien de retour à gauche (raccourci en « Retour » sur téléphone), bouton principal à droite.

### Le tirage (signature)
L'aperçu de la vidéo dans un bord de papier photo : 12 px de bord sur téléphone, 20 px au-delà de 640 px, sans bord en bas ; dessous, une légende en gris à 15 px (cadrage, filtre ou style) et, à droite, le tampon. Seul élément du système avec une ombre.

### Le tampon (signature)
Cadre violet de 2,5 px, incliné de -4°, opacité 94 %, 6 × 12 px de marge intérieure. Ligne 1 : « début → fin » à 17 px, 700, largeur 90 %. Ligne 2 : la durée et le format à 15 px, 500. Quand on choisit un moment, tire un clip aléatoire ou qu'un rendu se termine, il se pose : 320 ms, `cubic-bezier(0.16, 1, 0.3, 1)`, de 118 % et transparent à 97 % puis 100 %. Sans animation si l'utilisateur réduit les mouvements.

### Barre d'avancement
Piste de 6 px en filet, remplissage violet dont la largeur suit le pourcentage en 500 ms ; pourcentage en chiffres tabulaires à 600 au-dessus, à droite. Quand la durée est inconnue (transcription), la barre est pleine et pulse.

## Do's and Don'ts

### Do:
- **Do** garder un seul bouton plein bleu toile par écran ; toutes les autres actions sont à contour ou en lien.
- **Do** marquer une option choisie par un aplat d'encre et texte blanc.
- **Do** réserver le violet du tampon à la sélection, aux temps, à l'avancement et au focus.
- **Do** donner 48 px au moins à toute cible (bouton, option, lien, zone de prise des curseurs).
- **Do** écrire à 16 px par défaut et jamais sous 15 px ; temps et pourcentages en chiffres tabulaires.
- **Do** séparer par des filets d'1 px et garder des angles droits.
- **Do** poser l'aperçu dans le tirage, avec son tampon des temps.
- **Do** laisser aux aperçus de styles de sous-titres les vraies couleurs du rendu vidéo, sur bandeau d'encre.

### Don't:
- **Don't** arrondir un coin.
- **Don't** mettre d'ombre ailleurs que sur le tirage.
- **Don't** utiliser de dégradé ni de halo.
- **Don't** ajouter de petites étiquettes en capitales ni de surtitres au-dessus des titres.
- **Don't** utiliser le violet en fond de bouton ou en décor, ni le bleu toile pour marquer une option choisie.
- **Don't** ajouter d'icône décorative ; une icône n'apparaît que pour une action (lecture, retour, suivant, chargement, ajout au vocabulaire).
- **Don't** sortir les couleurs du rendu vidéo (jaune, vert, contours noirs) de l'aperçu des sous-titres.
