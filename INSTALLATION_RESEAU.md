# Installation de CTT sur plusieurs ordinateurs

## Organisation recommandée

Installez le logiciel sur **un seul ordinateur Windows qui reste allumé**. Cet ordinateur héberge l'application et sa base de données. Les autres utilisateurs n'installent pas une copie séparée : ils ouvrent l'adresse du serveur dans leur navigateur.

La base commune se trouve dans `prisma/dev.db`. Gardez le dossier du serveur sur son disque local, dans un dossier dont seuls les responsables autorisés peuvent lire les fichiers. Le fichier `.env` contient les secrets de connexion et ne doit jamais être envoyé aux postes des agents, chauffeurs, comptables ou clients.

## Première installation du serveur

1. Copiez le dossier complet `Logiciel-CTT` sur l'ordinateur serveur. Pour une nouvelle installation, configurez `.env` et laissez le logiciel créer sa base. Pour une mise à jour, sauvegardez puis conservez la base `prisma/dev.db` existante.
2. Installez Node.js LTS sur cet ordinateur et vérifiez que la connexion Internet est disponible pour l'installation initiale des composants.
3. Ouvrez `LANCER_APPLICATION.bat`. Au premier lancement, il installe les composants manquants, compile l'interface, met la base à niveau, puis démarre le serveur.
4. Sur le serveur, le navigateur s'ouvre à `http://localhost:5000`.
5. Le premier code directeur est dans la variable `INITIAL_DG_CODE` du fichier `.env`. Remettez-le au directeur de manière confidentielle. Il pourra ensuite créer ou réinitialiser les accès individuels depuis « Accès utilisateurs ».

Au premier lancement, les anciens codes encore présents dans une base existante sont transformés en empreintes sécurisées. Le logiciel ne les réaffiche ensuite plus. Si un ancien compte n'a plus de code récupérable, il est désactivé jusqu'à ce que le directeur lui génère un nouveau code puis le réactive.

## Connexion des autres ordinateurs

1. Reliez les postes au même réseau local que le serveur.
2. Sur le serveur, trouvez son adresse IPv4 locale avec `ipconfig` (par exemple `192.168.1.25`). Réservez cette adresse dans le routeur ou l'adressage réseau pour qu'elle ne change pas.
3. Dans le pare-feu Windows du serveur, autorisez TCP 5000 uniquement sur le profil **Réseau privé** et uniquement depuis le réseau de l'entreprise.
4. Sur chaque poste, ouvrez un navigateur et saisissez `http://ADRESSE-DU-SERVEUR:5000`, par exemple `http://192.168.1.25:5000`.
5. Chaque personne utilise son propre code. Le directeur crée et désactive les accès ; les clients et chauffeurs ne voient que les dossiers qui leur sont associés.

Ne lancez pas le fichier `.bat` sur les postes clients : cela démarrerait un serveur séparé et créerait une autre base de données. Ils utilisent uniquement le navigateur.

## Données existantes et sauvegardes

La base SQLite existante et ses comptes sont conservés. Lors de sa première connexion, le directeur peut aussi importer une fois les anciens dossiers et factures enregistrés dans le navigateur qu'il utilisait auparavant. Laissez cette première connexion se terminer avant d'effectuer d'autres modifications.

Depuis le compte directeur, utilisez « Sauvegarde BDD » régulièrement et copiez le fichier téléchargé dans un emplacement de sauvegarde protégé, différent de l'ordinateur serveur. Arrêtez le serveur avant de remplacer ou restaurer `prisma/dev.db`.

## Protection du réseau

Cette configuration sert à un usage sur le réseau local de l'entreprise. L'adresse utilise HTTP : ne publiez pas le port 5000 sur Internet et ne transmettez pas les codes sur un réseau Wi-Fi public. Avant tout accès à distance ou usage sur Internet, placez l'application derrière HTTPS avec un certificat valide et un accès réseau protégé (par exemple VPN).

Pour mettre à jour le logiciel, sauvegardez d'abord la base, arrêtez le serveur, remplacez les fichiers de l'application sans remplacer `.env` ni `prisma/dev.db`, puis relancez `LANCER_APPLICATION.bat`.

## Accès depuis les smartphones, tablettes et depuis l'étranger

L'interface s'adapte aux petits écrans. Sur téléphone ou tablette, ouvrez simplement l'adresse du service dans un navigateur récent et connectez-vous avec le code personnel attribué par le directeur. Il n'est pas nécessaire d'installer une copie du logiciel sur chaque appareil. Les clients et chauffeurs gardent leur accès limité aux informations prévues pour leur compte.

L'adresse locale `http://ADRESSE-DU-SERVEUR:5000` ne fonctionne que sur le réseau de l'entreprise. Pour se connecter depuis n'importe quel pays et tout réseau, l'application doit être hébergée sur un serveur permanent accessible publiquement, reliée à un nom de domaine, puis publiée uniquement derrière HTTPS avec un certificat valide. Le domaine et l'hébergement doivent être choisis et configurés avant de pouvoir fournir une adresse mondiale aux utilisateurs.

Pour cette mise en service distante :

1. Choisissez un domaine contrôlé par l'entreprise et un hébergement serveur permanent adapté à l'application Node.js.
2. Déployez le serveur et le site sur cet hébergement, avec le fichier `.env` conservé côté serveur et des secrets propres à la production. Ne copiez jamais `.env` dans le navigateur, sur les téléphones, dans un dépôt public ou dans une image distribuée.
3. Configurez le domaine en HTTPS avec renouvellement automatique du certificat. Seuls les ports web sécurisés doivent être accessibles depuis Internet ; le port applicatif `5000` et l'accès direct au fichier SQLite doivent rester privés. Si un seul proxy HTTPS de confiance se trouve devant Node.js, configurez `TRUST_PROXY_HOPS=1` dans l'environnement du serveur afin que la protection contre les essais répétés utilise l'adresse IP du visiteur. N'activez ce réglage que si le port `5000` n'est accessible qu'à travers ce proxy.
4. Conservez `prisma/dev.db` sur un stockage persistant du serveur, hors des fichiers temporaires de déploiement. Automatisez des sauvegardes chiffrées et testez leur restauration avant de confier des données réelles au service.
5. Faites vérifier le déploiement HTTPS, les sauvegardes, les accès individuels et la reconnexion/déconnexion avant de transmettre le lien et les codes aux utilisateurs.

Le serveur fourni écoute sur le port `5000` et est actuellement documenté pour un usage local. L'ouverture de ce port directement sur Internet n'est pas une configuration de production. Le déploiement mondial nécessite la configuration du domaine, de l'hébergement, du proxy HTTPS et du stockage persistant ; aucun hébergement ni domaine n'est configuré dans ce dossier.
