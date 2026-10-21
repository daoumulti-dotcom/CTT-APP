import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const root = path.dirname(new URL(import.meta.url).pathname).replace(/^\/(\w:)/, '$1');
const envPath = path.join(root, '.env');
const dbPath = path.join(root, 'prisma', 'dev.db');
const exampleTokens = ['REMPLACER_PAR_UNE_CLE_ALEATOIRE', 'REMPLACER_PAR_UN_CODE_DIRECTEUR'];
const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const needsSetup = !existing || exampleTokens.some(token => existing.includes(token));

if (!needsSetup) {
  console.log('Configuration locale déjà présente.');
  process.exit(0);
}
if (fs.existsSync(dbPath)) {
  console.error('Configuration manquante pour une base de données existante. Restaurez le fichier .env d’origine pour protéger les accès et données clients.');
  process.exit(1);
}

const jwtSecret = randomBytes(48).toString('hex');
const directorCode = `CTT-${randomBytes(18).toString('base64url')}`;
const env = [
  'PORT=5000',
  'DATABASE_URL="file:./dev.db"',
  `JWT_SECRET=${jwtSecret}`,
  `INITIAL_DG_CODE=${directorCode}`,
  'TRUST_PROXY_HOPS=0',
  ''
].join('\n');
fs.writeFileSync(envPath, env, { encoding: 'utf8', flag: 'w' });
fs.writeFileSync(path.join(root, 'CODE_DIRECTEUR_INITIAL.txt'), `Code directeur initial du logiciel CTT\n\n${directorCode}\n\nConservez ce code confidentiel. Vous pourrez ensuite le modifier depuis l’espace de gestion des utilisateurs.\n`, { encoding: 'utf8', flag: 'w' });
console.log('Configuration locale créée automatiquement.');
console.log(`Code directeur initial : ${directorCode}`);
console.log('Ce code est également enregistré dans CODE_DIRECTEUR_INITIAL.txt à côté du logiciel.');
