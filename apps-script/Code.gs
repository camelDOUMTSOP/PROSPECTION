/**
 * Suivi de prospection — GoLead Forge Agency
 * Google Apps Script à coller dans le Google Sheet (Extensions > Apps Script).
 *
 * - doPost : API JSON protégée par un jeton (onglet Config, ligne « jeton »).
 * - Onglets : Prospects, Événements, Config.
 * - LockService pour les écritures, refus des identifiants en double.
 * - dailyDigest : récapitulatif e-mail + événement Google Agenda chaque matin (déclencheur 7 h).
 *
 * Aucune donnée n'est stockée ailleurs que dans ce classeur.
 */

const SHEET_PROSPECTS = 'Prospects';
const SHEET_EVENTS = 'Événements';
const SHEET_CONFIG = 'Config';
const TZ = 'Africa/Douala';

const PROSPECT_HEADERS = ['ID', 'Priorité', 'Nom', 'Secteur', 'Ville', 'Pays', 'Numéro WhatsApp', 'Code visuel', 'Activité', 'Message préparé', 'Créé le', 'lot_id', 'Contact Google'];
// en-tête normalisé -> clé JSON
const PROSPECT_KEYS = {
  id: 'id', priorite: 'priorite', nom: 'nom', secteur: 'secteur', ville: 'ville', pays: 'pays',
  numero_whatsapp: 'numero', numero: 'numero', whatsapp: 'numero', telephone: 'numero',
  code_visuel: 'visuel', visuel: 'visuel', activite: 'activite', message_prepare: 'message', message: 'message',
  cree_le: 'cree_le', lot_id: 'lot_id', contact_google: 'contact_google',
};

const EVENT_HEADERS = ['id', 'timestamp', 'date', 'heure', 'type', 'prospect_id', 'prospect_nom', 'nouveau',
  'type_message', 'modèle', 'visuel', 'message', 'étiquette', 'objection_catégorie', 'objection_texte', 'résolue',
  'comment_résolue', 'montant', 'type_paiement', 'moyen', 'n_transaction', 'étape', 'note', 'créé_le',
  'prochaine_relance', 'numéro_relance', 'compte_whatsapp', 'raison_refus', 'lot_id', 'numéro_facture',
  'statut_facture', 'statut_projet', 'date_livraison', 'durée_suivi_mois', 'type_sav', 'statut_sav',
  'description_sav', 'rendez_vous', 'ref_id'];
const NUMERIC_EVENT_KEYS = { montant: 1, numero_relance: 1, duree_suivi_mois: 1 };
const DATE_KEYS = { date: 1, prochaine_relance: 1, date_livraison: 1 };

const CONFIG_DEFAULTS = [
  ['jeton', '', 'Jeton secret : à saisir une fois dans l\'application. Ne le partagez pas.'],
  ['etiquettes', 'Conversation en cours | Intéressé | A posé une question | Demande un devis | Pas intéressé pour le moment | Réponse sans suite', 'Étiquettes de réponse (séparées par |)'],
  ['objections', 'Budget | Activité pas encore structurée | A déjà un site | Pas besoin / pas le temps | Manque de confiance | Veut réfléchir | Autre', 'Catégories d\'objection'],
  ['modeles', 'Modèle 1 | Modèle 2 | Modèle 3 | Perso', 'Modèles de premier message'],
  ['types_message', 'Premier message | Relance 1 | Relance 2 | Relance 3 | Relance 4 | Autre', 'Types de message'],
  ['comptes', 'Business 1 | Business 2 | Messenger', 'Comptes WhatsApp'],
  ['delai_premier', '2', 'Jours entre le premier message et la relance 1'],
  ['delai_r1', '3', 'Jours entre la relance 1 et la relance 2'],
  ['delai_r2', '5', 'Jours entre la relance 2 et la relance 3'],
  ['delai_r3', '7', 'Jours entre la relance 3 et la relance 4 (message de clôture)'],
  ['relances_max', '4', 'Nombre maximal de relances'],
  ['objectif_jour', '50', 'Objectif de prospections par jour'],
  ['objectif_compte', '20', 'Objectif conseillé par compte WhatsApp et par jour'],
  ['indicatif', '237', 'Indicatif ajouté aux numéros à 9 chiffres'],
  ['format_vcard', '{prénom} {nom} (propulsion)', 'Nom affiché dans les contacts exportés'],
  ['premier_message', '', 'Premier message par défaut (si le prospect n\'a pas de « Message préparé »). Vide = modèle intégré.'],
  ['relance_1', '', 'Modèle de relance 1 (variantes séparées par une ligne ---). Vide = modèle intégré.'],
  ['relance_2', '', 'Modèle de relance 2'],
  ['relance_3', '', 'Modèle de relance 3'],
  ['relance_4', '', 'Modèle de relance 4 (clôture polie)'],
  ['app_url', '', 'Adresse de l\'application (GitHub Pages), utilisée dans l\'e-mail et l\'agenda'],
  ['email', '', 'Adresse du récapitulatif quotidien (vide = propriétaire du script)'],
  ['agenda', 'oui', 'Créer les événements Google Agenda (oui/non)'],
  ['applis_comptes', 'Business 1: business | Business 2: business | Messenger: messenger', 'Application WhatsApp de chaque compte (business ou messenger)'],
  ['contacts_google', 'oui', 'Créer automatiquement les nouveaux prospects dans Google Contacts (oui/non)'],
  ['contact_seulement_reponse', 'non', 'Enregistrer un contact Google seulement quand le prospect répond (oui/non)'],
];

// ======================================================================= API
function doGet() {
  return json_({ ok: true, app: 'prospection', message: 'API active. Utilisez l\'application (requêtes POST avec jeton).' });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'bad_request' });
  }
  try {
    if (!checkToken_(req.token)) return json_({ ok: false, error: 'unauthorized' });
    return json_(handle_(req.action, req.payload || {}));
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function handle_(action, payload) {
  switch (action) {
    case 'ping': return { ok: true, serverTime: new Date().toISOString() };
    case 'getAll': return getAll_();
    case 'addEvents': return withLock_(() => addEvents_(payload.events || []));
    case 'deleteEvents': return withLock_(() => deleteEventsWhere_((ev) => (payload.ids || []).indexOf(String(ev.id)) >= 0));
    case 'deleteLot': return withLock_(() => deleteEventsWhere_((ev) => payload.lot_id && String(ev.lot_id) === String(payload.lot_id)));
    case 'addProspects': return withLock_(() => addProspects_(payload.prospects || []));
    case 'updateConfig': return withLock_(() => updateConfig_(payload.values || {}));
    default: return { ok: false, error: 'unknown_action' };
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return { ok: false, error: 'busy' };
  try { return fn(); } finally { lock.releaseLock(); }
}

function checkToken_(token) {
  const expected = readConfig_(true).jeton;
  if (!expected || !token) return false;
  const a = String(token); const b = String(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ================================================================= helpers
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function norm_(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
function sheet_(name, headers) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (headers) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
  }
  return sh;
}
/** S'assure que toutes les colonnes attendues existent (ajoutées à droite si besoin). Retourne les en-têtes normalisés. */
function ensureHeaders_(sh, headers) {
  const lastCol = Math.max(1, sh.getLastColumn());
  let current = sh.getLastRow() >= 1 ? sh.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  current = current.map(String);
  if (current.every((h) => h === '')) current = [];
  const have = current.map(norm_);
  const missing = headers.filter((h) => have.indexOf(norm_(h)) < 0);
  if (missing.length) {
    sh.getRange(1, current.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
    current = current.concat(missing);
    sh.setFrozenRows(1);
  }
  return current.map(norm_);
}
function cellToValue_(v, key) {
  if (v instanceof Date) {
    if (key === 'heure') return Utilities.formatDate(v, TZ, 'HH:mm');
    if (DATE_KEYS[key]) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
    return Utilities.formatDate(v, TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
  }
  if (NUMERIC_EVENT_KEYS[key]) return v === '' || v == null ? '' : Number(v);
  return v == null ? '' : String(v);
}
function readTable_(sh, keyMap) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  const values = sh.getRange(1, 1, last, sh.getLastColumn()).getValues();
  const head = values[0].map((h) => { const n = norm_(h); return keyMap ? (keyMap[n] || '') : n; });
  const out = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (row.every((c) => c === '' || c == null)) continue;
    const o = {};
    for (let c = 0; c < head.length; c++) if (head[c]) o[head[c]] = cellToValue_(row[c], head[c]);
    out.push(o);
  }
  return out;
}

// =============================================================== lecture
function readConfig_(withToken) {
  const sh = ss_().getSheetByName(SHEET_CONFIG);
  const out = {};
  if (!sh || sh.getLastRow() < 1) return out;
  const values = sh.getRange(1, 1, sh.getLastRow(), 2).getValues();
  for (const [k, v] of values) {
    const key = norm_(k);
    if (!key || key === 'cle' || (key === 'jeton' && !withToken)) continue;
    out[key] = v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : String(v);
  }
  return out;
}
function readProspects_() {
  const sh = ss_().getSheetByName(SHEET_PROSPECTS);
  if (!sh) return [];
  return readTable_(sh, PROSPECT_KEYS).filter((p) => p.nom || p.id);
}
function readEvents_() {
  const sh = ss_().getSheetByName(SHEET_EVENTS);
  if (!sh) return [];
  return readTable_(sh).filter((e) => e.id);
}
function getAll_() {
  return { ok: true, prospects: readProspects_(), events: readEvents_(), config: readConfig_(false), serverTime: new Date().toISOString() };
}

// =============================================================== écriture
function addEvents_(events) {
  const sh = sheet_(SHEET_EVENTS, EVENT_HEADERS);
  const head = ensureHeaders_(sh, EVENT_HEADERS);
  const idCol = head.indexOf('id') + 1;
  const last = sh.getLastRow();
  const existing = {};
  if (last >= 2) sh.getRange(2, idCol, last - 1, 1).getValues().forEach((r) => { existing[String(r[0])] = 1; });
  const rows = []; const added = []; let skipped = 0;
  for (const ev of events) {
    const id = String(ev && ev.id || '');
    if (!id || existing[id]) { skipped++; continue; }
    existing[id] = 1;
    rows.push(head.map((k) => (ev[k] == null ? '' : ev[k])));
    added.push(ev);
  }
  if (rows.length) {
    const range = sh.getRange(last + 1, 1, rows.length, head.length);
    // Texte brut partout (évite que Sheets transforme dates, heures ou numéros), sauf colonnes numériques.
    range.setNumberFormats(rows.map(() => head.map((k) => (NUMERIC_EVENT_KEYS[k] ? '0' : '@'))));
    range.setValues(rows);
    try { calendarHooks_(added); } catch (err) { console.warn('Agenda : ' + err); }
    try { contactsAfterEvents_(added); } catch (err) { console.warn('Contacts : ' + err); }
  }
  return { ok: true, added: added.length, skipped };
}

function deleteEventsWhere_(predicate) {
  const sh = ss_().getSheetByName(SHEET_EVENTS);
  if (!sh || sh.getLastRow() < 2) return { ok: true, deleted: 0 };
  const lastCol = sh.getLastColumn();
  const values = sh.getRange(1, 1, sh.getLastRow(), lastCol).getValues();
  const head = values[0].map(norm_);
  const keep = []; let deleted = 0;
  for (let r = 1; r < values.length; r++) {
    const o = {}; head.forEach((h, c) => { o[h] = values[r][c]; });
    if (predicate(o)) deleted++; else keep.push(values[r]);
  }
  if (deleted) {
    sh.getRange(2, 1, values.length - 1, lastCol).clearContent();
    if (keep.length) sh.getRange(2, 1, keep.length, lastCol).setValues(keep);
  }
  return { ok: true, deleted };
}

function addProspects_(prospects) {
  const sh = sheet_(SHEET_PROSPECTS, PROSPECT_HEADERS);
  const rawHead = ensureHeaders_(sh, PROSPECT_HEADERS);
  const head = rawHead.map((h) => PROSPECT_KEYS[h] || '');
  const idCol = head.indexOf('id') + 1;
  const last = sh.getLastRow();
  const existing = {};
  if (last >= 2) sh.getRange(2, idCol, last - 1, 1).getValues().forEach((r) => { existing[String(r[0])] = 1; });
  const rows = []; let skipped = 0;
  for (const p of prospects) {
    const id = String(p.id || ('NEW-' + Utilities.getUuid().slice(0, 8)));
    if (existing[id]) { skipped++; continue; }
    existing[id] = 1;
    const o = Object.assign({}, p, { id, cree_le: p.cree_le || new Date().toISOString() });
    rows.push(head.map((k) => (k && o[k] != null ? o[k] : '')));
  }
  let contacts = null;
  if (rows.length) {
    const range = sh.getRange(last + 1, 1, rows.length, head.length);
    range.setNumberFormat('@');
    range.setValues(rows);
    try {
      const cfg = readConfig_(false);
      if (yes_(cfg.contacts_google, true) && !yes_(cfg.contact_seulement_reponse, false)) {
        const ids = rows.map((r) => String(r[head.indexOf('id')]));
        contacts = syncContacts_((p) => ids.indexOf(String(p.id)) >= 0);
      }
    } catch (err) { console.warn('Contacts : ' + err); contacts = { error: String(err.message || err) }; }
  }
  return { ok: true, added: rows.length, skipped, contacts };
}

function updateConfig_(values) {
  const sh = sheet_(SHEET_CONFIG, ['clé', 'valeur', 'description']);
  const last = sh.getLastRow();
  const keys = last >= 1 ? sh.getRange(1, 1, last, 1).getValues().map((r) => norm_(r[0])) : [];
  let n = 0;
  for (const k of Object.keys(values)) {
    const key = norm_(k);
    if (!key || key === 'jeton') continue; // le jeton ne se modifie jamais depuis l'application
    const i = keys.indexOf(key);
    if (i >= 0) sh.getRange(i + 1, 2).setNumberFormat('@').setValue(String(values[k]));
    else { sh.appendRow([key, String(values[k]), '']); keys.push(key); }
    n++;
  }
  return { ok: true, updated: n };
}

// ===================================================== installation (menu)
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Prospection')
    .addItem('1. Installer / vérifier les onglets', 'setup')
    .addItem('2. Afficher le jeton et le lien de configuration', 'showToken')
    .addItem('Remplir les ID manquants (Prospects)', 'fillMissingIds')
    .addItem('Installer le récapitulatif quotidien (7 h)', 'installDailyTrigger')
    .addItem('Envoyer le récapitulatif maintenant (test)', 'dailyDigest')
    .addItem('Autoriser Google Contacts (une fois)', 'authorizeContacts')
    .addItem('Créer les contacts Google manquants', 'syncMissingContacts')
    .addItem('Auto-test de l\'API (données factices)', 'selfTest')
    .addItem('Générer un nouveau jeton', 'regenerateToken')
    .addToUi();
}

function setup() {
  const ss = ss_();
  ss.setSpreadsheetTimeZone(TZ);
  const p = sheet_(SHEET_PROSPECTS, PROSPECT_HEADERS); ensureHeaders_(p, PROSPECT_HEADERS);
  const e = sheet_(SHEET_EVENTS, EVENT_HEADERS); ensureHeaders_(e, EVENT_HEADERS);
  e.getRange(1, 1, e.getMaxRows(), e.getMaxColumns()).setNumberFormat('@');
  const c = sheet_(SHEET_CONFIG, ['clé', 'valeur', 'description']);
  const existing = c.getLastRow() >= 1 ? c.getRange(1, 1, c.getLastRow(), 1).getValues().map((r) => norm_(r[0])) : [];
  for (const [k, v, d] of CONFIG_DEFAULTS) if (existing.indexOf(k) < 0) c.appendRow([k, v, d]);
  c.getRange('B:B').setNumberFormat('@');
  c.setColumnWidth(2, 420);
  const cfg = readConfig_(true);
  if (!cfg.jeton) setConfigToken_(newToken_());
  fillMissingIds();
  const msg = 'Installation terminée. Menu Prospection > « Afficher le jeton » pour configurer l\'application.';
  try { SpreadsheetApp.getUi().alert(msg); } catch (err) { console.log(msg); }
}

function newToken_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 40);
}
function setConfigToken_(token) {
  const sh = sheet_(SHEET_CONFIG, ['clé', 'valeur', 'description']);
  const keys = sh.getRange(1, 1, Math.max(1, sh.getLastRow()), 1).getValues().map((r) => norm_(r[0]));
  const i = keys.indexOf('jeton');
  if (i >= 0) sh.getRange(i + 1, 2).setNumberFormat('@').setValue(token);
  else sh.appendRow(['jeton', token, 'Jeton secret']);
}
function regenerateToken() {
  setConfigToken_(newToken_());
  showToken();
}

function showToken() {
  const cfg = readConfig_(true);
  const url = ScriptApp.getService().getUrl() || '(déployez d\'abord : Déployer > Nouveau déploiement > Application Web)';
  let link = '';
  if (cfg.app_url && ScriptApp.getService().getUrl()) {
    link = cfg.app_url.replace(/[#?].*$/, '') + '#setup=' + encodeURIComponent(url) + '&token=' + encodeURIComponent(cfg.jeton);
  }
  const text = 'URL de l\'API :\n' + url + '\n\nJeton :\n' + cfg.jeton +
    (link ? '\n\nLien de configuration en un geste (à ouvrir sur votre téléphone, ne le partagez pas) :\n' + link
      : '\n\n(Renseignez app_url dans l\'onglet Config pour obtenir un lien de configuration en un geste.)');
  console.log(text);
  try {
    const html = HtmlService.createHtmlOutput('<pre style="white-space:pre-wrap;word-break:break-all;font:13px monospace">' +
      text.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</pre>').setWidth(560).setHeight(380);
    SpreadsheetApp.getUi().showModalDialog(html, 'Configuration de l\'application');
  } catch (err) { /* exécution depuis l'éditeur : voir le journal */ }
}

function fillMissingIds() {
  const sh = ss_().getSheetByName(SHEET_PROSPECTS);
  if (!sh || sh.getLastRow() < 2) return 0;
  const head = ensureHeaders_(sh, PROSPECT_HEADERS).map((h) => PROSPECT_KEYS[h] || '');
  const idCol = head.indexOf('id') + 1; const nomCol = head.indexOf('nom') + 1;
  const n = sh.getLastRow() - 1;
  const ids = sh.getRange(2, idCol, n, 1).getValues();
  const noms = sh.getRange(2, nomCol, n, 1).getValues();
  const seen = {}; let filled = 0;
  for (let i = 0; i < n; i++) {
    let id = String(ids[i][0] || '').trim();
    if (!noms[i][0] && !id) continue;
    if (!id || seen[id]) { id = 'P' + String(i + 1).padStart(4, '0'); while (seen[id]) id += 'b'; ids[i][0] = id; filled++; }
    seen[id] = 1;
  }
  if (filled) sh.getRange(2, idCol, n, 1).setNumberFormat('@').setValues(ids);
  return filled;
}

// ========================================================= auto-test factice
function selfTest() {
  const lot = 'TEST-' + Date.now();
  const id1 = 'EV-test-' + Date.now();
  const ev = { id: id1, type: 'note', date: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'), heure: '08:00', prospect_id: 'TEST-PROSPECT', prospect_nom: 'Prospect factice', note: 'auto-test', lot_id: lot, cree_le: new Date().toISOString() };
  const lines = [];
  const r1 = handle_('addEvents', { events: [ev, ev] });
  lines.push('Ajout (avec doublon dans la requête) : ' + JSON.stringify(r1));
  const r2 = handle_('addEvents', { events: [ev] });
  lines.push('Ré-envoi du même identifiant : ' + JSON.stringify(r2));
  const all = handle_('getAll', {});
  lines.push('Lecture : ' + all.prospects.length + ' prospects, ' + all.events.length + ' événements, jeton exposé : ' + ('jeton' in all.config));
  const r3 = handle_('deleteLot', { lot_id: lot });
  lines.push('Annulation du lot : ' + JSON.stringify(r3));
  lines.push('Jeton invalide refusé : ' + !checkToken_('mauvais-jeton'));
  const ok = r1.added === 1 && r1.skipped === 1 && r2.added === 0 && r3.deleted === 1 && !('jeton' in all.config);
  lines.push(ok ? 'RÉSULTAT : OK' : 'RÉSULTAT : ÉCHEC');
  console.log(lines.join('\n'));
  try { SpreadsheetApp.getUi().alert(lines.join('\n')); } catch (err) { /* éditeur */ }
  return ok;
}

// ============================================ récapitulatif quotidien (§4.7)
function installDailyTrigger() {
  ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === 'dailyDigest').forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('dailyDigest').timeBased().atHour(7).nearMinute(0).everyDays(1).inTimezone(TZ).create();
  const msg = 'Récapitulatif quotidien installé : chaque jour vers 7 h (heure de Douala).';
  try { SpreadsheetApp.getUi().alert(msg); } catch (err) { console.log(msg); }
}

function addDays_(iso, n) {
  const p = iso.split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10);
}
function addMonths_(iso, n) {
  const p = iso.split('-').map(Number);
  const t = new Date(Date.UTC(p[0], p[1] - 1 + n, 1));
  const lastDay = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(p[2], lastDay));
  return t.toISOString().slice(0, 10);
}
function evKey_(e) { return (e.date || '') + ' ' + (e.heure || '99:99') + ' ' + (e.cree_le || '') + ' ' + (e.id || ''); }

/**
 * Version simplifiée des règles de l'application (logic.js) pour le récapitulatif.
 * Retourne { relances: [{nom, num, date}], nouveaux, clients: [{nom, raison}] }.
 */
function computeDigest_(prospects, events, config, today) {
  const max = Number(config.relances_max || 4);
  const byP = {};
  events.forEach((e) => { (byP[e.prospect_id] = byP[e.prospect_id] || []).push(e); });
  const relances = []; const clients = []; let aContacter = 0;
  prospects.forEach((p) => {
    const evs = (byP[p.id] || []).slice().sort((a, b) => (evKey_(a) < evKey_(b) ? -1 : 1));
    if (!evs.length) { aContacter++; return; }
    const isEtape = (e) => e.type === 'note' && e.etape && e.etape !== 'Aucune';
    const positive = (e) => ['reply', 'objection', 'devis', 'paiement'].indexOf(e.type) >= 0;
    const etapes = evs.filter(isEtape); const lastEtape = etapes[etapes.length - 1];
    const posAfter = lastEtape && evs.some((e) => positive(e) && evKey_(e) > evKey_(lastEtape));
    const etape = lastEtape && !posAfter ? lastEtape.etape : '';
    const pay = evs.filter((e) => e.type === 'paiement');
    const contacts = evs.filter((e) => e.type === 'contact');
    let maxNum = -1; contacts.forEach((c) => { if (c.numero_relance !== '' && Number(c.numero_relance) > maxNum) maxNum = Number(c.numero_relance); });
    if (contacts.length && maxNum < 0) maxNum = contacts.length - 1;
    let state = 'a_contacter';
    if (pay.length) state = 'client';
    else if (/^Refus/.test(etape)) state = 'refus';
    else if (etape === 'Prospect perdu') state = 'perdu';
    else if (etape === 'Pas intéressé pour le moment') state = 'pause';
    else if (evs.some((e) => e.type === 'devis')) state = 'devis';
    else if (evs.some((e) => e.type === 'reply' || e.type === 'objection')) state = 'conversation';
    else if (contacts.length) state = maxNum >= max ? 'cloture' : 'contacte';
    if (state === 'a_contacter') aContacter++;
    const setters = evs.filter((e) => e.type === 'contact' || isEtape(e) || (e.type === 'note' && e.prochaine_relance));
    const ls = setters[setters.length - 1];
    const lp = evs.filter(positive).pop();
    const manual = ls && ls.type === 'note' && (!lp || evKey_(ls) > evKey_(lp));
    const next = ls ? ls.prochaine_relance : '';
    if (next && next <= today && ['client', 'refus', 'perdu'].indexOf(state) < 0 && (state === 'contacte' || manual)) {
      relances.push({ nom: p.nom, num: maxNum + 1, date: next });
    }
    if (state === 'client') {
      const devis = evs.filter((e) => e.type === 'devis').pop();
      const paid = pay.reduce((s, e) => s + (Number(e.montant) || 0), 0);
      const liv = evs.filter((e) => e.type === 'projet' && e.date_livraison).pop();
      const projet = evs.filter((e) => e.type === 'projet' && e.statut_projet).pop();
      if (liv) {
        const fin = addMonths_(liv.date_livraison, Number(liv.duree_suivi_mois) || 2);
        if (fin >= today && fin <= addDays_(today, 7) && !(projet && projet.statut_projet === 'Terminé')) clients.push({ nom: p.nom, raison: 'fin de suivi le ' + fin.split('-').reverse().join('/') });
        if (devis && Number(devis.montant) > paid) clients.push({ nom: p.nom, raison: 'solde à encaisser' });
      }
      const sav = {};
      evs.filter((e) => e.type === 'sav').forEach((e) => { const k = e.ref_id || e.id; sav[k] = { statut: e.statut_sav || (sav[k] && sav[k].statut) || 'Ouvert', date: (sav[k] && sav[k].date) || e.date }; });
      Object.keys(sav).forEach((k) => { if (sav[k].statut !== 'Résolu') clients.push({ nom: p.nom, raison: 'SAV ouvert depuis le ' + sav[k].date.split('-').reverse().join('/') }); });
    }
  });
  relances.sort((a, b) => (a.date < b.date ? -1 : 1));
  const objectif = Number(config.objectif_jour || 50);
  return { relances, nouveaux: Math.max(0, Math.min(aContacter, objectif - relances.length)), clients };
}

function dailyDigest() {
  const config = readConfig_(false);
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const d = computeDigest_(readProspects_(), readEvents_(), config, today);
  const appUrl = config.app_url || '';
  const label = (n) => (n <= 0 ? '1er message' : 'R' + n);
  const lines = d.relances.map((r) => '• ' + r.nom + ' (' + label(r.num) + (r.date < today ? ', en retard' : '') + ')');
  const clientLines = d.clients.map((c) => '• ' + c.nom + ' : ' + c.raison);
  const subject = 'Aujourd\'hui : ' + d.relances.length + ' relances, ' + d.nouveaux + ' nouveaux prospects, ' + d.clients.length + ' clients à suivre';
  const body = subject + '\n\nRelances :\n' + (lines.join('\n') || '(aucune)') +
    '\n\nClients à suivre :\n' + (clientLines.join('\n') || '(aucun)') + (appUrl ? '\n\nOuvrir l\'application : ' + appUrl : '');
  const to = config.email || Session.getEffectiveUser().getEmail();
  if (to) MailApp.sendEmail(to, subject, body);

  if (String(config.agenda || 'oui').toLowerCase() !== 'non') {
    const cal = CalendarApp.getDefaultCalendar();
    const start = Utilities.parseDate(today + ' 07:30', TZ, 'yyyy-MM-dd HH:mm');
    const end = Utilities.parseDate(today + ' 07:45', TZ, 'yyyy-MM-dd HH:mm');
    // Pas de doublon si le script tourne deux fois le même jour.
    cal.getEvents(start, end).filter((ev) => /^Relances du jour/.test(ev.getTitle())).forEach((ev) => ev.deleteEvent());
    const desc = 'Relances :\n' + (lines.join('\n') || '(aucune)') + '\n\nNouveaux prospects proposés : ' + d.nouveaux +
      '\n\nClients à suivre :\n' + (clientLines.join('\n') || '(aucun)') + (appUrl ? '\n\n' + appUrl : '');
    const ev = cal.createEvent('Relances du jour : ' + d.relances.length, start, end, { description: desc });
    ev.removeAllReminders();
    ev.addPopupReminder(0);
  }
  return d;
}

/** Rendez-vous et fins de suivi : un événement Agenda dès l'enregistrement (identifiant unique = pas de doublon). */
function calendarHooks_(events) {
  const config = readConfig_(false);
  if (String(config.agenda || 'oui').toLowerCase() === 'non') return;
  const cal = CalendarApp.getDefaultCalendar();
  const appUrl = config.app_url || '';
  events.forEach((e) => {
    if (e.rendez_vous) {
      const m = String(e.rendez_vous).match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
      if (m) {
        const start = Utilities.parseDate(m[1] + ' ' + m[2], TZ, 'yyyy-MM-dd HH:mm');
        const ev = cal.createEvent('Rendez-vous : ' + (e.prospect_nom || ''), start, new Date(start.getTime() + 30 * 60000),
          { description: (e.note || '') + (appUrl ? '\n' + appUrl : '') });
        ev.removeAllReminders(); ev.addPopupReminder(60); ev.addPopupReminder(10);
      }
    }
    if (e.type === 'projet' && e.date_livraison) {
      const fin = addMonths_(String(e.date_livraison), Number(e.duree_suivi_mois) || 2);
      const day = Utilities.parseDate(fin, TZ, 'yyyy-MM-dd');
      const ev = cal.createAllDayEvent('Fin de suivi : ' + (e.prospect_nom || ''), day,
        { description: 'Livraison le ' + String(e.date_livraison).split('-').reverse().join('/') + ', suivi de ' + (e.duree_suivi_mois || 2) + ' mois.' + (appUrl ? '\n' + appUrl : '') });
      ev.removeAllReminders(); ev.addPopupReminder(7 * 24 * 60); ev.addPopupReminder(15 * 60);
    }
  });
}

// ======================================= contacts Google (§4.8, API People)
// Nécessite le service avancé « People API » (Éditeur > Services > + > People API).
// Seuls les prospects créés depuis l'application (nouveau prospect, import) sont concernés :
// les 1 536 prospects du fichier maître sont importés une fois dans Google Contacts par CSV.

const CONTACT_LABEL = 'PROPULSION';
function yes_(v, def) { const s = String(v == null ? '' : v).trim(); return s ? /^o|^y|^1|^true/i.test(s) : def; }

function phoneIntl_(raw, cc) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s || /v[eé]rif/i.test(s)) return '';
  let d = s.split(/[/,;]| ou /)[0].replace(/\D/g, '');
  if (d.indexOf('00') === 0) d = d.slice(2);
  if (cc && d.length === 9 && /^[236]/.test(d)) d = cc + d;
  return d.length >= 10 && d.length <= 15 ? '+' + d : '';
}
function contactName_(nom, format) {
  const civ = { monsieur: 1, m: 1, mr: 1, madame: 1, mme: 1, mademoiselle: 1, mlle: 1, dr: 1, docteur: 1, pr: 1, professeur: 1, me: 1, maitre: 1 };
  const words = String(nom || '').trim().split(/\s+/).filter(String);
  if (words.length > 1 && civ[norm_(words[0])]) words.shift();
  const prenom = words[0] || ''; const reste = words.slice(1).join(' ');
  return String(format || '{prénom} {nom} (propulsion)')
    .replace(/\{(prénom|prenom)\}/g, prenom).replace(/\{nom_complet\}/g, words.join(' ')).replace(/\{nom\}/g, reste)
    .replace(/\{(civilité|civilite|activité|activite|ville|secteur)\}/g, '').replace(/\s{2,}/g, ' ').trim();
}

/** Étiquette PROPULSION (créée si besoin). */
function contactGroup_() {
  const res = People.ContactGroups.list({ pageSize: 1000 });
  const g = (res.contactGroups || []).filter((x) => x.name === CONTACT_LABEL || x.formattedName === CONTACT_LABEL)[0];
  return g ? g.resourceName : People.ContactGroups.create({ contactGroup: { name: CONTACT_LABEL } }).resourceName;
}
/** Numéros déjà présents dans Google Contacts (9 derniers chiffres), pour éviter les doublons. */
function existingPhones_() {
  const set = {}; let pageToken;
  do {
    const res = People.People.Connections.list('people/me', { personFields: 'phoneNumbers', pageSize: 1000, pageToken });
    (res.connections || []).forEach((p) => (p.phoneNumbers || []).forEach((n) => {
      const d = String(n.canonicalForm || n.value || '').replace(/\D/g, '');
      if (d.length >= 8) set[d.slice(-9)] = 1;
    }));
    pageToken = res.nextPageToken;
  } while (pageToken);
  return set;
}

/**
 * Crée dans Google Contacts les prospects choisis par `filter` (et pas encore traités).
 * Exclut les numéros à vérifier et les prospects « Ne pas contacter ».
 * Écrit le résultat dans la colonne « Contact Google » (créé / déjà présent / numéro à vérifier…).
 */
function syncContacts_(filter, limit) {
  const cfg = readConfig_(false);
  const sh = ss_().getSheetByName(SHEET_PROSPECTS);
  const head = ensureHeaders_(sh, PROSPECT_HEADERS).map((h) => PROSPECT_KEYS[h] || '');
  const prospects = readProspects_();
  const refus = refusedIds_();
  const todo = prospects.filter((p) => !p.contact_google && filter(p)).slice(0, limit || 200);
  if (!todo.length) return { created: 0, skipped: 0 };
  const col = head.indexOf('contact_google') + 1; const idCol = head.indexOf('id') + 1;
  const ids = sh.getRange(2, idCol, sh.getLastRow() - 1, 1).getValues().map((r) => String(r[0]));
  const mark = (id, text) => { const i = ids.indexOf(String(id)); if (i >= 0) sh.getRange(i + 2, col).setValue(text); };
  let phones = null; let group = null; const added = []; let created = 0; let skipped = 0;
  todo.forEach((p) => {
    if (refus[p.id]) { skipped++; return; } // pas marqué : rien à créer tant que le refus tient
    const tel = phoneIntl_(p.numero, String(cfg.indicatif || '237').replace(/\D/g, ''));
    if (!tel) { mark(p.id, 'non : numéro à vérifier'); skipped++; return; }
    if (!phones) { phones = existingPhones_(); group = contactGroup_(); }
    const key = tel.replace(/\D/g, '').slice(-9);
    if (phones[key]) { mark(p.id, 'déjà présent'); skipped++; return; }
    const person = People.People.createContact({
      names: [{ givenName: contactName_(p.nom, cfg.format_vcard) }],
      phoneNumbers: [{ value: tel, type: 'mobile' }],
      organizations: p.secteur ? [{ name: p.secteur }] : undefined,
      biographies: [{ value: 'Prospect PROPULSION (' + p.id + ')', contentType: 'TEXT_PLAIN' }],
    });
    phones[key] = 1; added.push(person.resourceName); created++;
    mark(p.id, 'créé le ' + Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy'));
  });
  if (added.length) People.ContactGroups.Members.modify({ resourceNamesToAdd: added }, group);
  return { created, skipped };
}

function refusedIds_() {
  const out = {}; const last = {};
  readEvents_().filter((e) => e.type === 'note' && e.etape && e.etape !== 'Aucune')
    .sort((a, b) => (evKey_(a) < evKey_(b) ? -1 : 1)).forEach((e) => { last[e.prospect_id] = e.etape; });
  Object.keys(last).forEach((id) => { if (/^Refus/.test(last[id])) out[id] = 1; });
  return out;
}

/** Option « seulement quand le prospect répond » : la réponse déclenche la création du contact. */
function contactsAfterEvents_(events) {
  const cfg = readConfig_(false);
  if (!yes_(cfg.contacts_google, true) || !yes_(cfg.contact_seulement_reponse, false)) return null;
  const ids = {};
  events.filter((e) => ['reply', 'objection', 'devis', 'paiement'].indexOf(e.type) >= 0).forEach((e) => { ids[e.prospect_id] = 1; });
  if (!Object.keys(ids).length) return null;
  // Concerne les prospects créés depuis l'application (« Créé le » rempli).
  return syncContacts_((p) => ids[p.id] && p.cree_le);
}

/** Menu : demande l'autorisation Google Contacts une fois. */
function authorizeContacts() {
  const g = contactGroup_();
  const msg = 'Google Contacts autorisé. Étiquette ' + CONTACT_LABEL + ' prête (' + g + ').';
  try { SpreadsheetApp.getUi().alert(msg); } catch (err) { console.log(msg); }
}

/** Menu : rattrape les contacts non créés (prospects créés par l'application, colonne « Contact Google » vide). */
function syncMissingContacts() {
  const cfg = readConfig_(false);
  const onlyReply = yes_(cfg.contact_seulement_reponse, false);
  let replied = null;
  if (onlyReply) { replied = {}; readEvents_().forEach((e) => { if (['reply', 'objection', 'devis', 'paiement'].indexOf(e.type) >= 0) replied[e.prospect_id] = 1; }); }
  const r = syncContacts_((p) => p.cree_le && (!replied || replied[p.id]), 200);
  const msg = 'Contacts créés : ' + r.created + ', ignorés : ' + r.skipped + ' (200 au maximum par passage).';
  try { SpreadsheetApp.getUi().alert(msg); } catch (err) { console.log(msg); }
  return r;
}
