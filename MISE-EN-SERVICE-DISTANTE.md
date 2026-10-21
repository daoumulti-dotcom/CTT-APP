# Mise en service distante sécurisée de CTT

Cette configuration prépare une instance CTT unique sur un VPS Linux, utilisable depuis le bureau, la route ou le domicile avec un navigateur. Caddy termine HTTPS automatiquement. Le port applicatif 5000 et le fichier SQLite restent privés. La base et les sauvegardes restent dans des volumes persistants.

## Éléments à obtenir avant la mise en ligne

- Un nom de domaine contrôlé par CTT.
- Un VPS permanent sous Linux, avec accès administrateur SSH et adresse IPv4 publique. La taille de l'hébergement dépend du nombre d'utilisateurs simultanés.
- Un accès au fournisseur DNS du domaine.
- Une fenêtre de migration où l'équipe évite les modifications pendant la création de la sauvegarde finale.

La configuration ne publie pas directement le port 5000. Le domaine doit pointer vers le VPS et les ports entrants 80 et 443 doivent être autorisés. Le port SSH doit être limité aux adresses d'administration si le fournisseur le permet. En cas d'adresse IPv6 DNS, elle doit aussi pointer vers un serveur correctement configuré en IPv6.

## Préparer le serveur CTT

1. Installer Docker Engine et le plug-in Docker Compose sur le VPS.
2. Copier le contenu du dossier de déploiement vers `/opt/ctt`, sans le dossier `node_modules`, sans `.env` et sans base cliente dans l'image.
3. Créer les dossiers persistants accessibles au compte `node` du conteneur :

   ```sh
   sudo install -d -o 1000 -g 1000 -m 750 /opt/ctt/data /opt/ctt/backups
   ```

4. Copier `Caddyfile.example` vers `Caddyfile`, puis remplacer `ctt.example.com` par le domaine choisi.
5. Copier `.env.production.example` vers `.env.production`. Mettre le fichier en accès limité (`chmod 600 .env.production`). Renseigner les secrets directement sur le VPS, jamais dans le navigateur ni dans une conversation.
6. Pour conserver les codes d'accès existants lors du transfert de la base, garder exactement la valeur `JWT_SECRET` de l'installation CTT actuelle. Cette valeur ne doit pas être révélée. Régénérer ce secret invaliderait les empreintes des codes et obligerait à réinitialiser les accès.

## Transférer les données CTT actuelles

1. Depuis le compte directeur actuel, créer une sauvegarde avec le bouton **Sauvegarde BDD**.
2. Transférer le fichier `.db` téléchargé vers `/opt/ctt/data/ctt.db` par un canal SSH sécurisé. Ne pas placer la base dans le dépôt, dans le ZIP public, ou dans OneDrive.
3. Régler le propriétaire du fichier pour le conteneur :

   ```sh
   sudo chown 1000:1000 /opt/ctt/data/ctt.db
   sudo chmod 640 /opt/ctt/data/ctt.db
   ```

4. Dans `.env.production`, conserver le même `JWT_SECRET` que celui qui a servi à créer la base. Configurer `DATABASE_URL=file:/app/data/ctt.db` et `TRUST_PROXY_HOPS=1`.

La sauvegarde contient des données personnelles et commerciales. La transmettre uniquement au serveur choisi et supprimer les copies temporaires non protégées après vérification.

## Lancer et vérifier

Depuis `/opt/ctt` :

```sh
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 ctt caddy backup
```

Le VPS doit être joignable sur 80/443 et le DNS doit pointer vers lui pour que Caddy obtienne puis renouvelle le certificat HTTPS. Le service `backup` crée une sauvegarde SQLite quotidienne dans `/opt/ctt/backups` et conserve 30 jours de copies locales. Configurez aussi une copie chiffrée hors du VPS chez le fournisseur choisi : une sauvegarde conservée uniquement sur le même serveur ne protège pas d'une panne complète du VPS.

Avant de distribuer le lien :

- vérifier l'ouverture de `https://<domaine>` depuis un réseau mobile, sans Wi-Fi du bureau ;
- tester la connexion directeur, agent, client et chauffeur et confirmer que chacun ne voit que les dossiers attendus ;
- enregistrer une modification depuis deux appareils, confirmer la synchronisation et traiter proprement tout conflit de version ;
- imprimer facture et bordereau depuis téléphone et ordinateur ;
- restaurer une sauvegarde dans une instance de préproduction et vérifier les données et les codes d'accès ;
- créer les comptes individuels nécessaires, vérifier les rattachements clients/chauffeurs, et ne jamais partager les codes entre utilisateurs.

## Limites et entretien

Cette version conserve SQLite et un état applicatif regroupé en JSON avec contrôle de version. C'est un choix simple pour une petite équipe avec peu d'écritures simultanées ; deux personnes qui modifient en même temps peuvent recevoir un conflit leur demandant de recharger. Si le volume d'utilisateurs ou les modifications simultanées augmentent, planifier une migration vers PostgreSQL et des tables métier normalisées avant d'augmenter la charge.

Le HTTPS public réduit les risques d'interception, mais ne remplace ni les mises à jour du serveur, ni une sauvegarde hors site testée, ni un suivi des alertes et des tentatives de connexion. Ne redirigez jamais le port 5000 sur le routeur ou le pare-feu public.
