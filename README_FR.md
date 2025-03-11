# API Agenda Aurion

## Aperçu

Cette API fournit un moyen d'accéder et de récupérer par programme les informations de l'agenda d'Aurion, une plateforme académique. Elle répond aux défis de l'authentification et de la récupération de données d'Aurion, permettant aux développeurs d'intégrer facilement les données de l'agenda Aurion dans leurs applications.

## Fonctionnalités

-   Récupère et analyse les données de l'agenda Aurion.
-   Gère les redirections et l'authentification complexes d'Aurion.
-   Fournit une interface simple pour récupérer les événements pour une plage de dates donnée.

## Défis avec Aurion

L'accès aux données d'Aurion par programme présente plusieurs défis :

-   **Redirection :** Aurion nécessite une redirection lors du changement de page, avec des paramètres générés dynamiquement.
-   **Paramètres dynamiques :** les paramètres clés tels que `ViewState` et `IDTS` changent fréquemment et sont intégrés au contenu HTML. `ViewState` change à chaque page et `IDTS` varie mensuellement.
-   **Exigences relatives à l'en-tête et au corps :** des paramètres d'en-tête (par exemple, `Content-Type`) et de corps (`javax`parameters) spécifiques sont requis pour la plupart des requêtes.
-   **Navigation complexe :** l'accès à des données spécifiques nécessite de naviguer dans plusieurs menus et sous-menus.

Reportez-vous au fichier `url.md` pour des requêtes prédéfinies, ou enregistrez toutes les requêtes et les réponses en utilisant Aurion normalement pour comprendre le processus.

### Spécifications d'entrée/sortie

#### Entrée

L'API nécessite un nom d'utilisateur et un mot de passe pour l'authentification. Pour récupérer les données de l'agenda, les paramètres suivants sont spécial:

-   `idt_start` : un horodatage Unix (en millisecondes) représentant la date de début.
-   `idt_end` : un horodatage Unix (en millisecondes) représentant la date de fin. L'API récupérera les événements jusqu'à la fin de la journée spécifiée par cet horodatage.

#### Sortie

L'API renvoie une liste d'événements d'agenda. Chaque événement contient les informations suivantes :

-   **Titre :** une chaîne concaténée contenant la salle de classe, la description, la discipline, le type d'événement (par exemple, TD, PROJET, TP) et les instructeurs, séparés par des sauts de ligne. Un espace blanc de fin peut être présent.
-   **Heure de début :** Au format ISO 8601. (YYYY-MM-DDTHH:mm:ss.sssZ)
-   **Heure de fin :** Au format ISO 8601. (YYYY-MM-DDTHH:mm:ss.sssZ)

## Démarrage

### Prérequis

-   Node.js (version X ou supérieure)
-   npm ou yarn

### Installation
