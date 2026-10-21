# CTT — Intégration des formulaires douaniers

## Objet

Compléter la fiche de dossier CTT à partir des deux formulaires fournis (`CTTT.png` et `CCCC.png`). Chaque renseignement doit rester rattaché au dossier B/L et au client concerné. Les champs absents des pièces justificatives doivent rester vides : le logiciel ne doit jamais inventer une référence, une date, un poids ou un montant.

## Changements déjà apportés à la copie de travail

Le formulaire de création et de modification du dossier contient désormais deux sections :

1. **Toutes opérations en douane** : propriétaire/destinataire, date d’arrivée du navire, itinéraire/transitaire, provenance, bureau de dédouanement, navire, port, date de chargement et lignes de marchandises (marque, nombre de colis, désignation, poids, valeur).
2. **Transit importation et débours** : numéro de transit, références et dates de déclaration et liquidation, CNT, destinataire, date de remise des documents, camion, LTA, wagon, lignes de colis (nombre, désignation, numéro/marques, poids brut, observations) et débours par catégorie avec montant en FCFA.

Les lignes de marchandises et de débours peuvent être ajoutées ou supprimées. Ces informations sont enregistrées dans chaque objet dossier existant ; le format JSON déjà utilisé par le serveur accepte ces champs sans migration SQL. Les données douanières restent séparées des trois montants de facturation historiques : les débours ne sont pas additionnés automatiquement à la facture CTT, afin d’éviter un double comptage.

## Règles fonctionnelles à conserver

- Le B/L reste la référence principale du dossier. Un dossier ne doit pas être fusionné avec un autre uniquement parce que son conteneur, son client ou son numéro de transit ressemble.
- Associer chaque dossier au nom client canonique déjà lié au compte client. La saisie doit reprendre exactement ce nom. Une amélioration ultérieure devrait remplacer cette association textuelle par un identifiant client stable.
- Les clients ne doivent recevoir que les dossiers qui leur sont associés. Les débours détaillés sont des données internes ; leur affichage au client doit être décidé avec CTT avant mise en service.
- Conserver la valeur saisie comme texte pour les références (B/L, CNT, déclaration, liquidation, camion, LTA, wagon), y compris les zéros initiaux et les lettres.
- Les dates doivent être stockées au format ISO `AAAA-MM-JJ` et affichées au format local. Ne pas utiliser la date de mission pour remplacer les dates d’arrivée, de déclaration, de liquidation, de remise ou de chargement.
- Les poids, valeurs et montants doivent préciser leur unité/devise. Les formulaires montrent des montants de débours, mais ne définissent pas la devise des valeurs marchandises ni l’unité des poids : faire confirmer ces unités par CTT avant de calculer ou convertir.
- Le total des débours est la somme des montants renseignés, sans inclure les lignes vides. Laisser les frais sans justificatif à zéro/vide et conserver leur libellé d’origine.
- Garder un historique des corrections des références douanières et des montants, avec utilisateur et date, avant toute utilisation comptable réelle.

## Suite de travail recommandée pour le mainteneur

1. Ajouter l’affichage lisible de ces données dans le détail du dossier, avec les tableaux de colis et le récapitulatif des débours réservé aux rôles internes autorisés.
2. Créer deux aperçus/impressions séparés reprenant fidèlement les formulaires fournis, avec les données du dossier. Une impression doit être identifiée par son type et sa date ; elle ne doit pas remplacer l’autre formulaire.
3. Ajouter des contrôles de cohérence : champs obligatoires selon le type d’opération, valeurs numériques positives, détection d’un B/L déjà utilisé, et avertissement avant changement du client associé.
4. Vérifier l’isolation entre deux comptes clients différents, la conservation de tous les nouveaux champs après fermeture/réouverture du navigateur et après sauvegarde/restauration de la base.
5. Vérifier les unités (FCFA, poids, valeur des marchandises) et les libellés ambigus avec le responsable CTT avant de figer les totaux ou l’impression officielle.

## Déploiement et données

La copie transmissible doit être fournie sans `.env` ni base SQLite. Le développeur doit créer un `.env` local à partir de `.env.example` et protéger les secrets. Pour mettre à jour une installation qui contient déjà les données CTT, sauvegarder la base puis conserver cette base ; ne pas la remplacer par une base vide. Ne pas publier le serveur sur Internet sans configuration HTTPS et hébergement sécurisé.

## État de validation

Les champs douaniers ont été ajoutés au formulaire de dossier. La facturation dispose maintenant d’une saisie autonome avec lignes de prestations, quantité, prix unitaire, TVA calculée, numéro unique, sélection du dossier, modification, suivi du paiement et impression avec logo. Le bordereau de livraison dispose d’une saisie distincte (numéro, date, destinataire, lieu, réceptionnaire, colis, véhicule et réserves) et d’un aperçu imprimable avec logo et marchandises du dossier.

La compilation de l’interface a réussi. La mise en service complète doit encore valider la création de la base sur le poste cible, les unités comptables et un parcours réel de facture/livraison avant d’utiliser le logiciel pour les opérations officielles.
