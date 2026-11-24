# Suivi de prospection — GoLead Forge Agency

Application web (mobile d'abord) pour enregistrer toute ta prospection WhatsApp : messages envoyés, relances, réponses, objections, devis, paiements, projets clients et SAV, puis analyser les résultats dans l'onglet **Bilan**.

- **Le site** (ce dossier) est statique : HTML, CSS et JavaScript natif, sans étape de build. Il est hébergé sur GitHub Pages.
- **Les données** sont dans **ton** Google Sheet. L'application les lit et les écrit via un Google Apps Script protégé par un jeton secret.
- **Aucun nom ni numéro de prospect** n'est dans le code ni dans le dépôt GitHub. Le jeton non plus : tu le saisis une fois sur ton téléphone.
- **Hors ligne** : l'application s'ouvre sans réseau. Ce que tu saisis est mis en file d'attente et envoyé au retour du réseau, sans doublon.
- **Aucun envoi automatique de message WhatsApp.** L'application prépare le message et ouvre WhatsApp, c'est toi qui appuies sur Envoyer.

---

## Sommaire

1. [Créer le Google Sheet et coller le script](#1-créer-le-google-sheet-et-coller-le-script)
2. [Déployer le script en application web](#2-déployer-le-script-en-application-web)
3. [Importer tes prospects](#3-importer-tes-prospects)
4. [Mettre l'application en ligne (GitHub Pages)](#4-mettre-lapplication-en-ligne-github-pages)
5. [Ouvrir l'application sur ton téléphone et saisir le jeton](#5-ouvrir-lapplication-sur-ton-téléphone-et-saisir-le-jeton)
6. [Activer l'e-mail et l'agenda du matin](#6-activer-le-mail-et-lagenda-du-matin)
6 bis. [Contacts WhatsApp : Google Contacts](#6-bis-contacts-whatsapp--google-contacts)
7. [Utilisation au quotidien](#7-utilisation-au-quotidien)
8. [Rattraper l'historique (les 400 prospects déjà contactés)](#8-rattraper-lhistorique)
9. [Règles de calcul](#9-règles-de-calcul)
10. [Tester avant d'importer tes vraies données](#10-tester-avant-dimporter-tes-vraies-données)
11. [Mises à jour, sauvegarde, sécurité](#11-mises-à-jour-sauvegarde-sécurité)
12. [Plus tard : relier une API WhatsApp officielle](#12-plus-tard--relier-une-api-whatsapp-officielle)
13. [Choix faits quand le cahier des charges était ambigu](#13-choix-faits-quand-le-cahier-des-charges-était-ambigu)

---

## 1. Créer le Google Sheet et coller le script

1. Va sur <https://sheets.google.com> avec ton compte Google et crée une **feuille vierge**. Nomme-la par exemple « Prospection GoLead ».
2. Menu **Extensions > Apps Script**. Un éditeur de code s'ouvre dans un nouvel onglet.
3. Supprime le contenu du fichier `Code.gs` qui s'y trouve, puis colle **tout** le contenu du fichier [`apps-script/Code.gs`](apps-script/Code.gs) de ce dépôt.
4. (Recommandé) Dans l'éditeur : roue dentée **Paramètres du projet** > coche « Afficher le fichier manifeste appsscript.json ». Ouvre `appsscript.json` et remplace son contenu par celui de [`apps-script/appsscript.json`](apps-script/appsscript.json) (fuseau Africa/Douala).
5. Clique sur **Enregistrer** (icône disquette).
6. Dans la liste des fonctions en haut, choisis **`setup`** puis clique sur **Exécuter**.
   - Google demande une autorisation : « Examiner les autorisations » > ton compte > « Paramètres avancés » > « Accéder à … (non sécurisé) » > **Autoriser**. C'est normal : c'est ton propre script.
   - Le script crée les onglets **Prospects**, **Événements** et **Config**, et génère un **jeton secret** (ligne `jeton` de l'onglet Config).
7. Retourne sur le Google Sheet et recharge la page : un menu **Prospection** apparaît.

> Ne partage jamais ce Google Sheet en « tout le monde avec le lien » : il contient tes prospects et le jeton.

## 2. Déployer le script en application web

1. Dans l'éditeur Apps Script : bouton bleu **Déployer > Nouveau déploiement**.
2. Roue dentée à côté de « Sélectionner le type » > **Application Web**.
3. Description : « Prospection ». **Exécuter en tant que : Moi**. **Qui a accès : Tout le monde**.
4. **Déployer**, puis copie l'**URL de l'application Web** (elle se termine par `/exec`).

« Tout le monde » est nécessaire pour que ton téléphone puisse joindre le script sans connexion Google ; c'est le **jeton** qui protège tes données : toute requête sans le bon jeton est refusée.

**Si tu modifies le script plus tard** : Déployer > Gérer les déploiements > crayon > Version : « Nouvelle version » > Déployer. L'URL reste la même.

## 3. Importer tes prospects

L'onglet **Prospects** attend ces colonnes (ligne 1), dans n'importe quel ordre :

| ID | Priorité | Nom | Secteur | Ville | Pays | Numéro WhatsApp | Code visuel | Activité | Message préparé |
|----|----------|-----|---------|-------|------|-----------------|-------------|----------|-----------------|

Le plus simple :

1. Ouvre ton fichier maître (Excel) sur ton ordinateur et vérifie que la première ligne contient ces titres (les accents et majuscules ne comptent pas : « numero whatsapp » marche aussi).
2. Dans le Google Sheet, onglet **Prospects** : **Fichier > Importer > Importer** (onglet « Importer ») > choisis ton fichier > Emplacement : **« Remplacer la feuille actuelle »**. Si ton fichier a plusieurs onglets, importe-le dans un nouvel onglet puis copie-colle les colonnes dans **Prospects**.
3. Menu **Prospection > Remplir les ID manquants** : chaque prospect sans ID reçoit un identifiant (P0001, P0002…). Ne change plus les ID ensuite : l'historique y est rattaché.
4. Ne mets jamais ce fichier dans le dépôt GitHub (le `.gitignore` exclut déjà `prospects.*`, `*.xlsx` et `*.xls`).

Remarques :
- **Priorité** : nombre, la plus petite passe en premier dans « nouveaux prospects à contacter ». Vide = à la fin.
- **Numéro WhatsApp** : `6XX XX XX XX`, `+237 6XX XX XX XX`, `00237…` sont acceptés. Un numéro à 9 chiffres reçoit l'indicatif 237 (modifiable dans Config). Si la cellule contient « à vérifier » ou un numéro trop court, le prospect est signalé « Numéro à vérifier », n'est pas proposé dans la journée et est exclu de l'export des contacts.
- **Code visuel** et **Message préparé** sont facultatifs. Si un prospect n'a pas de message préparé, le modèle « premier message » des réglages est utilisé.

## 4. Mettre l'application en ligne (GitHub Pages)

Ce dépôt (`prospection`, **public**) contient uniquement l'application. Le fichier `.github/workflows/pages.yml` la publie automatiquement à chaque modification sur la branche `main`.

1. Sur GitHub : **Settings > Pages > Build and deployment > Source : GitHub Actions** (une seule fois).
2. Onglet **Actions** > « Publication GitHub Pages » > **Run workflow** pour la première publication (ensuite c'est automatique).
3. Adresse de l'application : **https://cameldoumtsop.github.io/PROSPECTION/**

> GitHub Pages est gratuit pour un dépôt **public**. Le dépôt peut être public sans risque : il ne contient ni prospect, ni jeton, ni URL du script.

Ensuite, dans l'onglet **Config** du Google Sheet, mets l'adresse de l'application dans la ligne `app_url` (elle sert dans l'e-mail du matin, l'agenda et le lien de configuration).

## 5. Ouvrir l'application sur ton téléphone et saisir le jeton

1. Sur ton Android, ouvre l'adresse de l'application dans **Chrome**.
2. Saisis l'**adresse de l'Apps Script** (étape 2) et le **jeton** (Google Sheet > menu **Prospection > Afficher le jeton**), puis **Connecter**.
   - Plus simple : si `app_url` est rempli dans Config, « Afficher le jeton » donne aussi un **lien de configuration en un geste**. Envoie-le-toi par e-mail (pas par WhatsApp), ouvre-le sur le téléphone : l'application se configure toute seule et efface le lien de la barre d'adresse.
3. **Ajouter à l'écran d'accueil** : menu ⋮ de Chrome > **Installer l'application** (ou « Ajouter à l'écran d'accueil »). L'application s'ouvre alors comme une appli normale, même hors ligne.
4. Pour la dictée : au premier appui sur 🎤, Chrome demande l'accès au micro : **Autoriser**. Si le bouton micro n'apparaît pas (navigateur non compatible), utilise le micro de ton clavier.
5. Réglages (roue dentée) > **Notifications** pour recevoir un rappel local à l'ouverture quand des relances sont dues.

Sur ordinateur, même chose dans Chrome ou Edge.

## 6. Activer l'e-mail et l'agenda du matin

Dans le Google Sheet : menu **Prospection > Installer le récapitulatif quotidien (7 h)** (accepte les autorisations Gmail et Agenda).

Chaque jour vers 7 h (heure de Douala) :
- un **e-mail** « Aujourd'hui : X relances, Y nouveaux prospects, Z clients à suivre » (adresse : ligne `email` de Config, sinon ton adresse Google) ;
- un **événement Google Agenda** à 7 h 30 « Relances du jour : X » avec la liste des noms, le numéro de relance (R1, R2…) et le lien vers l'application, avec une notification sur ton téléphone. Il est remplacé (pas dupliqué) si le script tourne deux fois.

En plus, dès l'enregistrement :
- un **rendez-vous** (champ « Rendez-vous prévu » du formulaire Note ou étape) crée un événement Agenda avec rappels 1 h et 10 min avant ;
- une **livraison** (étape projet « Livré ») crée un événement « Fin de suivi : client » à la date de fin de suivi, avec rappel 7 jours avant.

Pour tester tout de suite : **Prospection > Envoyer le récapitulatif maintenant**. Pour désactiver l'agenda : `agenda` = `non` dans Config.

## 6 bis. Contacts WhatsApp : Google Contacts

Une page web ne peut pas écrire dans les contacts du téléphone. On passe donc par ton **compte Google**, synchronisé avec ton Android : un contact créé dans Google Contacts apparaît dans le téléphone, et WhatsApp affiche alors le nom du prospect.

Vérifie d'abord sur le téléphone : **Paramètres > Google > Paramètres des applis Google > Synchronisation des contacts Google** (ou Paramètres > Comptes > Google > Contacts) doit être activé.

### a) Import initial des 1 536 prospects (une seule fois, sur ordinateur)

Tu fournis le fichier `Contacts_PROPULSION_Google.csv` (format Google Contacts : nom « Prénom Nom (propulsion) », numéro +237…, étiquette PROPULSION). **Ne le mets jamais dans le dépôt** (le `.gitignore` exclut `Contacts_*.csv` et `contacts*.csv`).

1. Va sur <https://contacts.google.com> avec le **même compte Google** que ton téléphone.
2. Menu de gauche : **Importer** > **Sélectionner un fichier** > choisis `Contacts_PROPULSION_Google.csv` > **Importer**.
3. Les contacts arrivent avec l'étiquette du fichier (PROPULSION) et une étiquette « Importé le … » que tu peux supprimer ensuite (cela ne supprime pas les contacts).
4. **Doublons** : menu de gauche **Fusionner et corriger** (ou « Nettoyer ») > **Tout fusionner**, ou fusionne un par un si tu veux vérifier. Google rassemble les fiches qui ont le même numéro ou le même nom.
5. Attends quelques minutes : les contacts apparaissent sur le téléphone. Dans WhatsApp, tire la liste des discussions vers le bas (ou Nouvelle discussion > ⋮ > Actualiser) pour qu'il reconnaisse les noms.

### b) Nouveaux prospects ensuite : création automatique (API People)

Chaque prospect **ajouté après l'import** (nouveau prospect saisi dans un formulaire, ou créé lors d'un import de fichier) est créé automatiquement dans ton Google Contacts par l'Apps Script : même format de nom (réglage `format_vcard`), étiquette **PROPULSION**, numéro au format +237…. Le script vérifie d'abord qu'aucun contact n'a déjà ce numéro (comparaison sur les 9 derniers chiffres) : pas de doublon. Le résultat est noté dans la colonne **Contact Google** de l'onglet Prospects (« créé le … », « déjà présent », « non : numéro à vérifier ») et visible dans la fiche du prospect.

Mise en place (une seule autorisation) :
1. Dans l'éditeur Apps Script : menu de gauche **Services** (icône +) > **People API** > **Ajouter** (l'identifiant doit rester `People`). Si tu as collé `appsscript.json` (étape 1.4), c'est déjà fait.
2. Dans le Google Sheet : menu **Prospection > Autoriser Google Contacts (une fois)**. Google demande l'accès à tes contacts : **Autoriser**. Cette autorisation suffit ensuite pour l'application.
3. Pas besoin de redéployer : l'autorisation suffit. (Un nouveau déploiement n'est nécessaire que si tu modifies le code du script : Déployer > Gérer les déploiements > crayon > Nouvelle version.)

Règles :
- **Jamais** pour les numéros « à vérifier » ni pour les prospects « Ne pas contacter ».
- Les prospects du fichier maître ne sont pas recréés (ils viennent de l'import CSV ci-dessus).
- Option `contact_seulement_reponse` (Config ou Réglages) : `non` par défaut (contact créé dès l'ajout du prospect). Mets `oui` pour ne créer le contact qu'au moment où le prospect répond (réponse, objection, devis ou paiement).
- `contacts_google` = `non` désactive complètement la création automatique.
- Si une création a échoué (autorisation manquante, coupure), menu **Prospection > Créer les contacts Google manquants** rattrape jusqu'à 200 prospects par passage.

### c) Export vCard de secours

Écran Aujourd'hui > **Exporter les contacts de ma journée (.vcf)** : un fichier avec les prospects de la journée, à ouvrir sur le téléphone (« Importer dans Contacts »). Mêmes exclusions : numéros à vérifier et « Ne pas contacter ».

## 7. Utilisation au quotidien

### Aujourd'hui (écran d'accueil)
- Objectif du jour (50 par défaut, appuie sur le compteur pour le changer) et compteur par compte WhatsApp (20 conseillé par compte, alerte ⚠ au-delà).
- La liste **se remplit toute seule** : 1) relances en retard, 2) relances du jour, 3) nouveaux prospects pris dans l'ordre de priorité de ton fichier (regroupés par code visuel), autant qu'il en faut pour atteindre l'objectif du jour. Chaque « Fait » fait monter le compteur ; quand l'objectif est atteint, la liste s'arrête. **« Ajouter 30 prospects de plus »** permet de dépasser l'objectif.
- Chaque ligne affiche le message prêt (modifiable) et un sélecteur **« Envoyer avec : Business 1 / Business 2 / Messenger »** (dernier choix mémorisé, modifiable ligne par ligne). Le bouton **Ouvrir WhatsApp Business** ou **Ouvrir WhatsApp** ouvre la conversation **dans la bonne application** avec le message déjà écrit : tu n'as qu'à appuyer sur Envoyer. Puis **Fait** : l'envoi est enregistré (bon numéro de relance, heure arrondie, **compte choisi sur la ligne**), la prochaine relance est calculée et la ligne suivante s'affiche.
- Si deux comptes sont dans la **même application** (WhatsApp Business avec deux comptes, ou application clonée), l'application ne peut pas choisir le compte à ta place : un rappel jaune « bascule sur le compte X avant d'envoyer » s'affiche. L'application de chaque compte se règle dans Réglages > « Comptes et applications WhatsApp » (par défaut : Business 1 et Business 2 → WhatsApp Business, Messenger → WhatsApp).

#### Comment l'application choisit WhatsApp ou WhatsApp Business (Android)

Le lien `wa.me` ouvre l'application WhatsApp **par défaut** du téléphone. Pour viser une application précise, l'application utilise un lien Android « intent » avec le nom du paquet :

- WhatsApp Business : `intent://send?phone=237…&text=…#Intent;scheme=whatsapp;package=com.whatsapp.w4b;S.browser_fallback_url=<lien wa.me>;end`
- WhatsApp : la même chose avec `package=com.whatsapp`.

`S.browser_fallback_url` est le repli de Chrome : si l'application n'est pas installée, Chrome ouvre le lien wa.me. Et si rien ne s'ouvre au bout de 2,5 s, un bouton « Rien ne s'est ouvert ? Ouvrir avec wa.me » apparaît sous la ligne.

**À tester une fois sur ton téléphone** (je n'ai pas pu le faire : pas d'appareil Android ici ; le comportement des liens a été vérifié dans Chrome en émulation Android) : Réglages > **Liens WhatsApp (ce téléphone)** > saisis ton propre numéro > « Tester WhatsApp Business » puis « Tester WhatsApp », dans Chrome **et** dans l'application installée sur l'écran d'accueil. Trois formats sont proposés :
1. **Intent (recommandé)** : schéma `whatsapp`, la forme la plus répandue ;
2. **Intent smsto** : la variante `intent://send/?phone=…#Intent;scheme=smsto;package=…;end` ;
3. **wa.me seulement** : application par défaut, sans choix (dernier recours).

Garde le premier format qui ouvre la bonne application avec le texte prérempli ; le choix est mémorisé sur ce téléphone. Sur ordinateur, les liens wa.me sont toujours utilisés.
- Boutons rapides : **Il a répondu**, **Refus complet**, **Reporter…** (1, 2, 3, 7 ou 14 jours).
- **Exporter les contacts de ma journée (.vcf)** : export de secours (voir §6 bis). Les numéros à vérifier et les « Ne pas contacter » sont exclus.

### Envois (comme ton fichier Excel)
Pour **chacun de tes prospects**, comme une ligne de ton fichier : la position dans le bloc (« 3/24 »), le **nom**, la ville et le numéro, le **message** (prêt à envoyer, ou celui déjà envoyé) et le lien **Ouvrir WhatsApp**.
- Liste déroulante en haut : un bloc (secteur · visuel, avec le nombre restant) ou **« Tous les prospects »** dans l'ordre du fichier.
- **Ouvrir WhatsApp** : Android te demande **« WhatsApp ou WhatsApp Business ? »** et ouvre la conversation avec le message déjà écrit. Tu n'as plus qu'à appuyer sur Envoyer.
- Puis **Envoyé** : l'envoi est enregistré (avec le compte choisi en haut : Business 1, Business 2 ou Messenger), le prospect passe dans « Envoyés » et ses relances seront proposées automatiquement.
- Filtres **À envoyer / Envoyés / Tous** et recherche dans tous les blocs.

**Si Android ne te demande pas de choisir** et ouvre toujours la même application : tu as dû cocher « Toujours » un jour. Va dans Paramètres du téléphone > Applications > WhatsApp (puis WhatsApp Business) > **Ouvrir par défaut** > **Effacer les paramètres par défaut**. Le choix te sera de nouveau proposé.
Autre réglage possible (Réglages de l'application > Liens WhatsApp) : « Ouvrir directement l'application du compte » ouvre WhatsApp Business pour Business 1 et 2, WhatsApp pour Messenger, sans demander.

### Saisir
- **J'ai contacté des prospects** : tape ou dicte plusieurs noms (« Monsieur Ali, Alain et Koogg », ou épelé « K-O-O-G-G »). Une seule correspondance = ajout direct ; plusieurs = tu choisis (jusqu'à 6, avec la ville) ; aucune = tu peux le créer comme nouveau prospect (ID `NEW-…`). Puis un seul réglage pour tout le lot : type, modèle, compte, date, heure, prochaine relance, texte.
- **Il m'a répondu**, **Objection**, **Devis envoyé**, **Paiement reçu**, **Note ou étape**, **Demande SAV**.
- N'importe quel prospect, à n'importe quelle date (passée ou future), dans n'importe quel ordre : un paiement sans devis ni message est accepté et le prospect devient client.
- Le badge rouge sur « Saisir » = nombre de relances dues.

### Suivi
Recherche (sans accents ni majuscules, tous les mots doivent correspondre) + filtres. Appuie sur un prospect pour sa fiche : état, numéro, boutons **WhatsApp Business** / **WhatsApp**, statut du contact Google, boutons d'ajout, et l'historique complet. Suppression d'un événement : appuie deux fois sur « Supprimer ».

### Clients
Un prospect devient client au premier paiement. Liste filtrable (projet en cours, livrés, suivi en cours, SAV ouvert, terminés), SAV ouverts en haut. La fiche montre le total convenu, payé, reste à payer, factures (numéro type 2026-008, « Marquer payée »), paiements, étape du projet, fin de suivi et SAV (« Marquer résolue »).

### Bilan
Tuiles, entonnoir, tableaux par visuel / secteur / modèle / moment d'envoi, efficacité des relances, objections, clients. **Exporter tout l'historique (CSV)** (UTF-8 avec BOM, point-virgule : s'ouvre directement dans Excel en français) et **Copier le tableau** (à coller dans Excel ou Google Sheets).

### Réglages (roue dentée)
Objectifs, comptes WhatsApp, délais de relance, **modèles de messages de relance** (variables `{civilité}`, `{prénom}`, `{nom}`, `{nom_complet}`, `{activité}`, `{ville}` ; plusieurs variantes séparées par une ligne `---`, utilisées en alternance), listes d'étiquettes et d'objections, format des contacts. Tout est enregistré dans l'onglet Config du Google Sheet (tu peux aussi le modifier là-bas).

## 8. Rattraper l'historique

Onglet **Saisir > Rattrapage de l'historique** :

1. **Mettre à jour un prospect existant** (aussi dans chaque fiche) : choisis le prospect et décris son état en un écran : messages déjà envoyés (« Relance 3 faite »), date du dernier envoi, a répondu (étiquette, note), objection (et comment tu prévois de la traiter), devis (montant, date), prochaine relance (proposée automatiquement, modifiable). Les événements sont créés avec les dates passées calculées à rebours selon les délais de relance.
2. **Ajouter une liste (lot)** : colle ou dicte plusieurs noms, ou utilise la **sélection par filtre** (secteur, pays, ville, code visuel, plage de lignes), puis un état commun (ex. « Relance 1 faite le 15/11, sans réponse »). Chaque prospect reste modifiable ensuite.
3. **Importer un fichier** (CSV ou Excel) avec les colonnes :
   `prospect_id` (ou `nom`), `numero_relance_faite` (0 = premier message seul, 1 = relance 1 faite…), `date_dernier_envoi`, `a_repondu` (oui/non), `etiquette`, `montant_devis`, `montant_paye`, `prochaine_relance`, `note`.
   Bouton « Télécharger le modèle ». Aperçu avant import ; lignes non reconnues ou ambiguës signalées ; doublons exacts ignorés (dans le fichier, et événements déjà présents). Option pour créer les noms introuvables comme nouveaux prospects. La lecture des fichiers Excel charge une petite bibliothèque (SheetJS) depuis Internet ; hors ligne, enregistre le fichier en CSV.
4. **Lots et annulations** : chaque saisie groupée, lot ou import porte un `lot_id`. « Annuler ce lot » supprime tous ses événements d'un coup (les nouveaux prospects créés restent dans l'onglet Prospects).

## 9. Règles de calcul

L'état d'un prospect n'est jamais saisi : il est recalculé à partir de ses événements, **rangés par date de l'événement** (pas par date de saisie).

| État | Condition |
|------|-----------|
| Payé | un paiement « Solde » ou « Paiement total » |
| Acompte payé | seulement des acomptes |
| Ne pas contacter | dernière étape « Refus complet », sans réponse/devis/paiement après |
| Perdu | dernière étape « Prospect perdu », idem |
| Pas intéressé (pour le moment) | dernière étape « Pas intéressé pour le moment », idem |
| Devis envoyé | un devis |
| En conversation | une réponse ou une objection |
| Sans réponse : clôturé | relance 4 envoyée sans réponse |
| Contacté | au moins un message |
| À contacter | aucun événement |

**Relances** (modifiables dans Config) : premier message → R1 à J+2 → R2 à J+3 → R3 à J+5 → R4 (clôture polie) à J+7. Après R4 sans réponse : « Sans réponse : clôturé », plus proposé. Pour le recontacter plus tard : **Note ou étape > À recontacter plus tard** avec une date.
**À relancer** : état « contacté », date de prochaine relance atteinte. Une date fixée à la main (« À recontacter », « Reporter ») fait aussi réapparaître un prospect en conversation, clôturé ou en pause.
**Refus complet** : le prospect n'apparaît plus dans aucune liste ni sélection, son numéro est en rouge, et l'application demande une confirmation explicite si tu tentes de lui écrire.
**Taux de réponse** : sur les prospects contactés au moins une fois (réponse, objection, devis ou paiement comptent comme réponse).
**Client** : au moins un paiement. Reste à payer = dernier devis (ou première facture) − total payé. Fin de suivi = date de livraison + durée (2 mois par défaut). Terminé = étape « Terminé », ou fin de suivi dépassée sans SAV ouvert. SAV ouvert = dernier statut ≠ Résolu.
**Moment d'envoi** : matin avant 12 h, après-midi 12 h – 17 h, soir après 17 h (heure du premier message).

## 10. Tester avant d'importer tes vraies données

- **Mode démo** : sur l'écran de connexion, « Essayer en mode démo ». 60 prospects **fictifs** ([`demo/demo-prospects.csv`](demo/demo-prospects.csv), numéros `+237 600 000 0xx` non attribués) avec quelques historiques. Tout reste sur le téléphone. Réglages > « Quitter la démo » pour revenir à l'écran de connexion.
- **Tester le vrai Google Sheet avec des données factices** : importe `demo/demo-prospects.csv` dans l'onglet Prospects (Fichier > Importer, séparateur point-virgule), puis menu **Prospection > Auto-test de l'API** : ajout, refus du doublon, lecture, annulation de lot, refus d'un mauvais jeton. Vide ensuite l'onglet Prospects et l'onglet Événements (sauf la ligne 1) avant d'importer tes vrais prospects.
- **Tests automatiques** (pour un développeur, Node 22) : `npm test` (à la racine du dépôt). Ils vérifient les règles métier et exécutent `Code.gs` dans une simulation de Google Sheets (doublons, jeton, lots, récapitulatif, agenda, contacts Google sans doublon ni refus).

## 11. Mises à jour, sauvegarde, sécurité

- **Mise à jour de l'application** : après une modification des fichiers, change `VERSION` dans `sw.js` (ex. `prospection-v3`). Les téléphones prennent la nouvelle version à l'ouverture suivante (deux ouvertures au plus).
- **Sauvegarde** : le Google Sheet garde l'historique des versions (Fichier > Historique des versions). Exporte aussi régulièrement le CSV depuis Bilan.
- **Jeton compromis ou téléphone perdu** : menu **Prospection > Générer un nouveau jeton**, puis ressaisis-le sur ton téléphone. L'ancien est immédiatement refusé.
- **Déconnecter un téléphone** : Réglages > « Déconnecter ce téléphone » (efface le cache local et le jeton).
- Le jeton n'est jamais renvoyé par le script et ne peut pas être modifié depuis l'application.
- L'application ne stocke **aucun mot de passe ni accès confidentiel** de tes clients : ne les écris pas dans les notes.
- Vérification faite : le dépôt ne contient aucun vrai prospect, aucun numéro réel, aucun jeton, aucune URL de script.

## 12. Plus tard : relier une API WhatsApp officielle

L'application **n'envoie jamais de message toute seule** et n'utilise aucune bibliothèque non officielle (whatsapp-web.js, Baileys…) : elles violent les conditions de WhatsApp et exposent tes 3 comptes à un blocage définitif. Le mode semi-automatique (message prêt + ouverture de WhatsApp + tu appuies sur Envoyer) est la seule méthode prévue.

Si un jour tu veux automatiser, la seule voie autorisée est la **WhatsApp Business Platform (Cloud API) de Meta** :
1. Compte Meta Business vérifié, application sur <https://developers.facebook.com>, produit « WhatsApp », un **numéro dédié** (il ne peut plus être utilisé dans l'appli WhatsApp Business classique).
2. Les messages d'initiative (premier message, relances) doivent utiliser des **modèles approuvés par Meta** et sont **payants par conversation**. Les destinataires doivent avoir **accepté** d'être contactés (opt-in) : c'est rarement le cas pour de la prospection à froid.
3. Le jeton d'accès Meta ne doit **jamais** être dans le site (public). Il se range dans les **Propriétés du script** Apps Script (Paramètres du projet > Propriétés du script), et c'est l'Apps Script qui appelle `https://graph.facebook.com/v<version>/<PHONE_NUMBER_ID>/messages` avec `UrlFetchApp.fetch`.
4. Côté application : ajouter une action `sendTemplate` dans `doPost` (avec vérification du jeton, et refus si le prospect est « Ne pas contacter »), et un bouton qui l'appelle à la place de « Ouvrir WhatsApp ». Garder un plafond quotidien et le respect des refus.
5. Les réponses reçues arrivent par un **webhook** (une URL que Meta appelle) : il peut être l'Apps Script lui-même (`doPost` avec vérification de la signature) pour créer automatiquement les événements « reply ».

## 13. Choix faits quand le cahier des charges était ambigu

- **Prototype** : le fichier `index.html` du prototype n'a pas été fourni avec la demande ; l'application a été construite à partir du cahier des charges uniquement.
- **Emplacement** : l'application a son propre dépôt public `prospection` (le dépôt du site de l'agence reste privé), publié par une action GitHub (§4).
- **Événements jamais modifiés** : « reporter une relance », « marquer un SAV résolu » ou « facture payée » ajoutent un nouvel événement (note avec `prochaine_relance`, SAV avec `ref_id`, facture avec le même numéro et le statut « payée ») ; le dernier fait foi. Une erreur se corrige en supprimant l'événement.
- **Colonnes ajoutées** à la feuille Événements : `rendez_vous` (rendez-vous pour l'agenda) et `ref_id` (lien vers une demande SAV). Colonnes `Créé le`, `lot_id` et `Contact Google` ajoutées à Prospects.
- **Choix de l'application WhatsApp** : le sélecteur de chaque ligne propose les **comptes** (Business 1, Business 2, Messenger) plutôt que les deux applications, pour que le compte exact soit enregistré dans l'événement ; chaque compte est relié à une application dans Config (`applis_comptes`). Le format du lien (intent whatsapp, intent smsto, wa.me) se choisit par téléphone, car il dépend de l'appareil. Le bandeau « compte utilisé maintenant » a été retiré : c'est le sélecteur de ligne qui mémorise le dernier choix.
- **Contacts Google automatiques** : seulement pour les prospects créés depuis l'application (colonne « Créé le » remplie) ; ceux du fichier maître passent par l'import CSV initial. Un contact n'est jamais supprimé ni modifié par le script.
- **Types de message** : « Relance 4 » ajouté à la liste (les règles prévoient 4 relances). « Autre » prend le numéro suivant de l'historique du prospect.
- **Refus/perte puis paiement** : si un prospect « perdu » ou « refus » répond, reçoit un devis ou paie ensuite, l'état suit ce nouvel événement.
- **« Pas intéressé pour le moment »** existe à la fois comme étiquette de réponse et comme étape. L'étape met le prospect en pause (plus de relance), sauf si tu indiques une date « Recontacter le ».
- **Liste du jour** : calculée automatiquement (objectif du jour − envois déjà faits − relances dues). Le nombre de prospects ajoutés « en plus » est mémorisé sur le téléphone, pour la journée en cours.
- **Nouveaux prospects du récapitulatif e-mail** : objectif du jour − relances dues (dans la limite des prospects à contacter).
- **Variable `{nom}`** : dans les modèles, `{prénom}` = premier mot du nom (sans civilité) et `{nom}` = le reste ; `{nom_complet}` ajouté pour « Prénom Nom ». Les modèles de relance par défaut utilisent `{civilité} {nom_complet}`.
- **Numéro de relance** : `numero_relance` = 0 pour le premier message, 1 à 4 pour les relances ; dans l'import, `numero_relance_faite` = nombre de relances déjà faites.
- **Bilan « envois »** : les tableaux montrent à la fois les prospects contactés et le nombre total d'envois ; les taux sont calculés sur les prospects.

## Structure

```
prospection/
├── index.html              page unique
├── app.js                  interface (écrans, formulaires, dictée)
├── logic.js                règles métier (état, relances, bilan, CSV, vCard)
├── store.js                cache IndexedDB, file hors ligne, appels au script, mode démo
├── style.css               thème clair/sombre, mobile d'abord
├── sw.js                   service worker (hors ligne)
├── manifest.webmanifest    application installable
├── icons/                  icônes
├── demo/demo-prospects.csv 60 prospects fictifs
├── apps-script/Code.gs     script Google (API, menu, récapitulatif, agenda, contacts Google)
├── apps-script/appsscript.json
└── tests/                  tests Node (npm test)
```
