import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { createHmac, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const prisma = new PrismaClient();
const app = express();
const loginAttempts = new Map();
const scrypt = promisify(scryptCallback);
const JWT_SECRET = process.env.JWT_SECRET || '';
const PORT = Number(process.env.PORT || 5000);
const TRUST_PROXY_HOPS = Number(process.env.TRUST_PROXY_HOPS || 0);

if (!Number.isInteger(TRUST_PROXY_HOPS) || TRUST_PROXY_HOPS < 0) {
  console.error('TRUST_PROXY_HOPS doit être un entier positif ou zéro.');
  process.exit(1);
}
app.set('trust proxy', TRUST_PROXY_HOPS);

if (JWT_SECRET.length < 48) {
  console.error('JWT_SECRET doit contenir au moins 48 caractères aléatoires.');
  process.exit(1);
}

const INITIAL_DG_CODE = process.env.INITIAL_DG_CODE || '';

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

function loginRateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const recent = (loginAttempts.get(ip) || []).filter(timestamp => now - timestamp < 15 * 60 * 1000);
  if (recent.length >= 12) return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans 15 minutes.' });
  req.markLoginFailure = () => loginAttempts.set(ip, [...recent, Date.now()]);
  next();
}

async function hashCode(code) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(code, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}

function lookupCode(code) {
  return createHmac('sha256', JWT_SECRET).update(code).digest('hex');
}

async function verifyCode(code, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const [salt, expectedHex] = stored.split(':');
  if (!salt || !expectedHex) return false;
  const actual = await scrypt(code, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function recordAudit(utilisateur, role, action, detail, statut = 'Succès') {
  try {
    await prisma.auditLog.create({ data: { utilisateur: utilisateur || 'Inconnu', role: role || 'Public', action, detail, statut } });
  } catch (error) {
    console.error('Écriture du journal impossible :', error.message);
  }
}

function authenticate(req, res, next) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Veuillez vous connecter.' });
  try {
    req.auth = jwt.verify(token, JWT_SECRET, { issuer: 'ctt' });
    next();
  } catch {
    return res.status(401).json({ error: 'Session expirée. Veuillez vous reconnecter.' });
  }
}

function requireRole(...roles) {
  return async (req, res, next) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: req.auth.sub } });
      if (!user || !user.actif) return res.status(401).json({ error: 'Compte désactivé ou introuvable.' });
      const session = await prisma.authSession.findUnique({ where: { id: req.auth.jti } });
      if (!session || session.revokedAt || session.expiresAt <= new Date()) return res.status(401).json({ error: 'Session expirée ou fermée. Veuillez vous reconnecter.' });
      if (roles.length && !roles.includes(user.role)) return res.status(403).json({ error: 'Votre rôle ne permet pas cette action.' });
      req.user = user;
      next();
    } catch {
      return res.status(500).json({ error: 'Vérification du compte impossible.' });
    }
  };
}

async function initialize() {
  if (INITIAL_DG_CODE.length < 16) throw new Error('INITIAL_DG_CODE doit être configuré avec au moins 16 caractères pour le premier compte directeur.');
  // Recover accounts from the earlier schema without leaving plaintext codes in the database.
  const accountsToMigrate = await prisma.user.findMany({ where: { codeLookup: null } });
  for (const user of accountsToMigrate) {
    if (user.codeAcces) {
      await prisma.user.update({ where: { id: user.id }, data: { codeHash: await hashCode(user.codeAcces), codeLookup: lookupCode(user.codeAcces), codeAcces: null, actif: true } });
    } else if (user.role === 'DG') {
      await prisma.user.update({ where: { id: user.id }, data: { codeHash: await hashCode(INITIAL_DG_CODE), codeLookup: lookupCode(INITIAL_DG_CODE), actif: true } });
      await recordAudit('Système', 'DG', 'REINITIALISATION_CODE_DIRECTEUR', 'Le code directeur initial a été rétabli depuis la configuration protégée');
    } else {
      await prisma.user.update({ where: { id: user.id }, data: { codeHash: null, actif: false } });
    }
  }

  const director = await prisma.user.findFirst({ where: { role: 'DG' } });
  if (!director) {
    await prisma.user.create({ data: { nom: 'Directeur Général CISSE', role: 'DG', codeHash: await hashCode(INITIAL_DG_CODE), codeLookup: lookupCode(INITIAL_DG_CODE) } });
    await recordAudit('Système', 'DG', 'INITIALISATION_COMPTE_DIRECTEUR', 'Création du compte directeur initial');
  }
  await prisma.authSession.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }] } });

  const existingState = await prisma.applicationState.findUnique({ where: { id: 'main' } });
  if (!existingState) {
    const legacyDossiers = await prisma.transitDossier.findMany({ orderBy: { numeroDossier: 'asc' } });
    const dossiers = legacyDossiers.map(item => {
      const statut = ({ EN_COURS: 'En Transit', LIVRE: 'Livré', DEDOUANEMENT: 'Dédouanement' })[item.statut] || item.statut || 'Création';
      return {
        id: item.id,
        bl: item.numeroDossier,
        conteneur: item.documentRef || '',
        client: item.clientNom,
        axe: '',
        mode: item.typeTransport || 'Routier',
        statut,
        etapeNum: ({ Création: 1, Dédouanement: 2, 'En Transit': 3, Livré: 4 })[statut] || 1,
        colisCount: 0,
        fraisDouane: 0,
        manutention: 0,
        prestationCTT: 0,
        documents: [],
        chauffeur: '',
        immatriculation: '',
        dateMission: new Date().toISOString().slice(0, 10)
      };
    });
    await prisma.applicationState.create({ data: { id: 'main', dossiersJson: JSON.stringify(dossiers), facturesJson: JSON.stringify([]) } });
  }
}

app.post('/api/auth/login', loginRateLimit, async (req, res) => {
  const code = String(req.body.codeAcces || req.body.code || '').trim();
  if (!code || code.length > 128) return res.status(400).json({ error: "Veuillez saisir un code d'accès valide." });
  try {
    const candidate = await prisma.user.findFirst({ where: { codeLookup: lookupCode(code) } });
    const foundUser = candidate?.actif && await verifyCode(code, candidate.codeHash) ? candidate : null;
    if (!foundUser) {
      req.markLoginFailure?.();
      await recordAudit('Inconnu', 'Public', 'ECHEC_CONNEXION', 'Code invalide', 'Alerte');
      return res.status(401).json({ error: "Code d'accès invalide." });
    }
    const sessionId = randomUUID();
    loginAttempts.delete(req.ip || req.socket.remoteAddress || 'unknown');
    await prisma.authSession.create({ data: { id: sessionId, userId: foundUser.id, expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000) } });
    const token = jwt.sign({ sub: foundUser.id, jti: sessionId }, JWT_SECRET, { expiresIn: '8h', issuer: 'ctt' });
    await recordAudit(foundUser.nom, foundUser.role, 'CONNEXION_REUSSIE', 'Connexion réussie');
    return res.json({ message: 'Connexion réussie', token, user: { id: foundUser.id, nom: foundUser.nom, role: foundUser.role, clientName: foundUser.clientName } });
  } catch (error) {
    console.error('Connexion impossible :', error.message);
    return res.status(500).json({ error: 'Le service de connexion est indisponible.' });
  }
});

app.post('/api/auth/logout', authenticate, requireRole(), async (req, res) => {
  await prisma.authSession.updateMany({ where: { id: req.auth.jti, revokedAt: null }, data: { revokedAt: new Date() } });
  await recordAudit(req.user.nom, req.user.role, 'DECONNEXION', 'Déconnexion demandée depuis le logiciel');
  res.json({ message: 'Déconnexion enregistrée.' });
});

app.get('/api/data', authenticate, requireRole(), async (req, res) => {
  try {
    const state = await prisma.applicationState.findUnique({ where: { id: 'main' } });
    let dossiers = JSON.parse(state.dossiersJson);
    let factures = JSON.parse(state.facturesJson);
    if (req.user.role === 'CLIENT') {
      const client = (req.user.clientName || req.user.nom).toLocaleLowerCase();
      dossiers = dossiers.filter(item => String(item.client).toLocaleLowerCase() === client);
      const refs = new Set(dossiers.map(item => item.bl));
      factures = factures.filter(item => refs.has(item.blRef));
    } else if (req.user.role === 'CHAUFFEUR') {
      const chauffeur = req.user.nom.replace(/\s*\(chauffeur\)\s*/i, '').trim().toLocaleLowerCase();
      dossiers = dossiers.filter(item => String(item.chauffeur || '').toLocaleLowerCase() === chauffeur);
      const refs = new Set(dossiers.map(item => item.bl));
      factures = factures.filter(item => refs.has(item.blRef));
    }
    res.json({ dossiers, factures, version: state.version });
  } catch (error) {
    console.error('Lecture des données impossible :', error.message);
    res.status(500).json({ error: 'Lecture des dossiers impossible.' });
  }
});

app.put('/api/data', authenticate, requireRole('DG', 'AGENT', 'COMPTABLE'), async (req, res) => {
  try {
    const state = await prisma.applicationState.findUnique({ where: { id: 'main' } });
    const existingDossiers = JSON.parse(state.dossiersJson);
    const existingFactures = JSON.parse(state.facturesJson);
    const canEditDossiers = ['DG', 'AGENT'].includes(req.user.role);
    const canEditFactures = ['DG', 'COMPTABLE'].includes(req.user.role);
    const submittedDossiers = Array.isArray(req.body.dossiers) ? req.body.dossiers : null;
    let dossiers = existingDossiers;
    if (canEditDossiers && submittedDossiers) {
      dossiers = submittedDossiers;
    } else if (req.user.role === 'COMPTABLE' && submittedDossiers) {
      // Comptables may save delivery notes only; all other dossier fields remain server-owned.
      const requestedById = new Map(submittedDossiers.filter(item => item && item.id).map(item => [item.id, item]));
      dossiers = existingDossiers.map(dossier => {
        const requested = requestedById.get(dossier.id);
        if (!requested || !requested.deliveryNote || typeof requested.deliveryNote !== 'object' || Array.isArray(requested.deliveryNote)) return dossier;
        const note = requested.deliveryNote;
        const date = String(note.date || '');
        const count = Number(note.nombreColis);
        return { ...dossier, deliveryNote: {
          numero: String(note.numero || '').trim().slice(0, 80),
          date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '',
          destinataire: String(note.destinataire || '').trim().slice(0, 200),
          lieu: String(note.lieu || '').trim().slice(0, 200),
          receptionnaire: String(note.receptionnaire || '').trim().slice(0, 200),
          observations: String(note.observations || '').trim().slice(0, 2000),
          nombreColis: Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0,
          conteneur: String(note.conteneur || '').trim().slice(0, 100),
          chauffeur: String(note.chauffeur || '').trim().slice(0, 200),
          immatriculation: String(note.immatriculation || '').trim().slice(0, 100)
        } };
      });
    }
    let factures = canEditFactures && Array.isArray(req.body.factures) ? req.body.factures : existingFactures;
    if (req.user.role === 'AGENT' && Array.isArray(req.body.factures)) {
      const requested = new Map(req.body.factures.map(invoice => [invoice.id, invoice]));
      factures = existingFactures.map(invoice => {
        const change = requested.get(invoice.id);
        if (!change) return invoice;
        return { ...invoice, blRef: String(change.blRef || invoice.blRef), client: String(change.client || invoice.client) };
      });
      const existingIds = new Set(existingFactures.map(invoice => invoice.id));
      for (const invoice of req.body.factures.filter(item => !existingIds.has(item.id))) {
        const dossier = dossiers.find(item => item.bl === invoice.blRef);
        if (!dossier) continue;
        const ht = Number(dossier.fraisDouane || 0) + Number(dossier.manutention || 0) + Number(dossier.prestationCTT || 0);
        factures.push({ id: String(invoice.id || randomBytes(12).toString('hex')), numero: String(invoice.numero || `FAC-${Date.now()}`), blRef: dossier.bl, client: dossier.client, ht, tva: Math.round(ht * 0.18), ttc: ht + Math.round(ht * 0.18), statut: 'Non payée', date: dossier.dateMission || new Date().toISOString().slice(0, 10) });
      }
    }
    const baseVersion = Number(req.body.version);
    if (!Number.isInteger(baseVersion) || baseVersion < 1) return res.status(400).json({ error: 'Version de données manquante. Actualisez les données.' });
    const write = await prisma.applicationState.updateMany({
      where: { id: 'main', version: baseVersion },
      data: { dossiersJson: JSON.stringify(dossiers), facturesJson: JSON.stringify(factures), version: { increment: 1 } }
    });
    if (write.count === 0) return res.status(409).json({ error: 'Ces données ont changé depuis leur affichage. Rechargez-les puis recommencez la modification.' });
    const auditChanges = [];
    if (canEditDossiers && submittedDossiers) auditChanges.push('des dossiers');
    else if (req.user.role === 'COMPTABLE' && submittedDossiers) auditChanges.push('des bordereaux de livraison');
    if ((canEditFactures || req.user.role === 'AGENT') && Array.isArray(req.body.factures)) auditChanges.push('des factures');
    await recordAudit(req.user.nom, req.user.role, 'MODIFICATION_DONNEES', `Mise à jour ${auditChanges.join(' et ') || 'des données'}`);
    res.json({ ok: true, version: baseVersion + 1 });
  } catch (error) {
    console.error('Enregistrement impossible :', error.message);
    res.status(500).json({ error: 'Enregistrement des données impossible.' });
  }
});

app.get('/api/admin/logs', authenticate, requireRole('DG'), async (_req, res) => {
  const logs = await prisma.auditLog.findMany({ orderBy: { timestamp: 'desc' }, take: 500 });
  res.json(logs.map(log => ({ ...log, timestamp: log.timestamp.toLocaleString('fr-FR') })));
});

app.get('/api/admin/users', authenticate, requireRole('DG'), async (_req, res) => {
  const users = await prisma.user.findMany({ orderBy: [{ role: 'asc' }, { nom: 'asc' }], select: { id: true, nom: true, role: true, clientName: true, actif: true } });
  res.json(users);
});

app.post('/api/admin/users', authenticate, requireRole('DG'), async (req, res) => {
  const nom = String(req.body.nom || '').trim();
  const role = String(req.body.role || '').trim();
  const codeAcces = String(req.body.codeAcces || '').trim();
  const clientName = role === 'CLIENT' ? String(req.body.clientName || nom).trim() : null;
  if (!nom || !['AGENT', 'COMPTABLE', 'CHAUFFEUR', 'CLIENT'].includes(role) || codeAcces.length < 8 || codeAcces.length > 128) {
    return res.status(400).json({ error: 'Nom, rôle valide et code de 8 à 128 caractères obligatoires.' });
  }
  try {
    const codeHash = await hashCode(codeAcces);
    const user = await prisma.user.create({ data: { nom, role, clientName, codeHash, codeLookup: lookupCode(codeAcces) } });
    await recordAudit(req.user.nom, req.user.role, 'CREATION_COMPTE', `Création accès ${role} pour ${nom}`);
    return res.status(201).json({ id: user.id, nom: user.nom, role: user.role, clientName: user.clientName, actif: user.actif, codeAcces });
  } catch (error) {
    if (error.code === 'P2002') return res.status(400).json({ error: 'Ce code est déjà utilisé.' });
    console.error('Création du compte impossible :', error.message);
    return res.status(500).json({ error: 'Création du compte impossible.' });
  }
});

app.put('/api/admin/users/:id/toggle', authenticate, requireRole('DG'), async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  if (user.role === 'DG') return res.status(403).json({ error: 'Le compte directeur ne peut pas être désactivé ici.' });
  const updated = await prisma.user.update({ where: { id: user.id }, data: { actif: !user.actif }, select: { id: true, nom: true, role: true, actif: true } });
  await prisma.authSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await recordAudit(req.user.nom, req.user.role, 'MODIFICATION_ACCES', `Statut ${user.nom} changé à ${updated.actif ? 'Actif' : 'Désactivé'}`);
  res.json(updated);
});

app.put('/api/admin/users/:id/reset-code', authenticate, requireRole('DG'), async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  const codeAcces = randomBytes(18).toString('base64url');
  await prisma.user.update({ where: { id: user.id }, data: { codeAcces: null, codeHash: await hashCode(codeAcces), codeLookup: lookupCode(codeAcces) } });
  await prisma.authSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await recordAudit(req.user.nom, req.user.role, 'REINITIALISATION_CODE', `Nouveau code remis à ${user.nom}`);
  res.json({ id: user.id, nom: user.nom, codeAcces });
});

app.get('/api/admin/backup-db', authenticate, requireRole('DG'), async (req, res) => {
  const snapshotPath = path.join(__dirname, 'prisma', `snapshot-${randomBytes(8).toString('hex')}.db`);
  try {
    await recordAudit(req.user.nom, req.user.role, 'SAUVEGARDE_BDD', 'Téléchargement de la base SQLite');
    await prisma.$executeRawUnsafe(`VACUUM INTO '${snapshotPath.replace(/'/g, "''")}'`);
    res.download(snapshotPath, `backup_cisse_transit_${Date.now()}.db`, () => fs.rm(snapshotPath, { force: true }, () => {}));
  } catch (error) {
    fs.rm(snapshotPath, { force: true }, () => {});
    console.error('Sauvegarde impossible :', error.message);
    res.status(500).json({ error: 'Création de la sauvegarde impossible.' });
  }
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

async function start() {
  await initialize();
  app.listen(PORT, '0.0.0.0', () => console.log(`Serveur CTT opérationnel sur le port ${PORT}.`));
}

start().catch(error => {
  console.error('Démarrage impossible :', error.message);
  process.exit(1);
});
