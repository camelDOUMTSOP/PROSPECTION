// Logique métier pure (aucun accès au DOM ni au réseau) : dates, noms,
// recherche, état déduit des prospects, relances, clients, bilan, CSV, vCard.
// Ce fichier est importé par app.js et par les tests Node (tests/*.test.js).

export const TZ = 'Africa/Douala';

// ---------------------------------------------------------------- constantes
export const T = {
  CONTACT: 'contact', REPLY: 'reply', OBJECTION: 'objection', DEVIS: 'devis',
  FACTURE: 'facture', PAIEMENT: 'paiement', PROJET: 'projet', SAV: 'sav', NOTE: 'note',
};

export const ETAPES = {
  AUCUNE: 'Aucune',
  PERDU: 'Prospect perdu',
  REFUS: 'Refus complet : ne plus contacter',
  PAUSE: 'Pas intéressé pour le moment',
  RECONTACTER: 'À recontacter plus tard',
};

export const PROJET_ETAPES = ['Démarré', 'Contenus reçus', 'Maquette validée', 'Livré', 'Suivi en cours', 'Terminé'];
export const PAIEMENT_TYPES = ['Acompte', 'Solde', 'Paiement total'];
export const MOYENS = ['MTN Mobile Money', 'Orange Money', 'Autre'];
export const SAV_TYPES = ['Modification de contenu', 'Correction', 'Question', 'Autre'];
export const SAV_STATUTS = ['Ouvert', 'En cours', 'Résolu'];
export const RESOLUE = ['Oui', 'En cours', 'Non'];

export const STATES = {
  a_contacter: { label: 'À contacter', tone: 'muted' },
  contacte: { label: 'Contacté', tone: 'info' },
  conversation: { label: 'En conversation', tone: 'ok' },
  devis: { label: 'Devis envoyé', tone: 'warn' },
  acompte: { label: 'Acompte payé', tone: 'good' },
  paye: { label: 'Payé', tone: 'good' },
  pause: { label: 'Pas intéressé (pour le moment)', tone: 'muted' },
  cloture: { label: 'Sans réponse : clôturé', tone: 'muted' },
  perdu: { label: 'Perdu', tone: 'bad' },
  refus: { label: 'Ne pas contacter', tone: 'bad' },
};

// Toutes les colonnes de la feuille « Événements » (clé interne = en-tête sans accents).
export const EVENT_FIELDS = [
  'id', 'timestamp', 'date', 'heure', 'type', 'prospect_id', 'prospect_nom', 'nouveau',
  'type_message', 'modele', 'visuel', 'message', 'etiquette', 'objection_categorie',
  'objection_texte', 'resolue', 'comment_resolue', 'montant', 'type_paiement', 'moyen',
  'n_transaction', 'etape', 'note', 'cree_le', 'prochaine_relance', 'numero_relance',
  'compte_whatsapp', 'raison_refus', 'lot_id', 'numero_facture', 'statut_facture',
  'statut_projet', 'date_livraison', 'duree_suivi_mois', 'type_sav', 'statut_sav',
  'description_sav', 'rendez_vous', 'ref_id',
];

export const DEFAULT_CONFIG = {
  etiquettes: 'Conversation en cours | Intéressé | A posé une question | Demande un devis | Pas intéressé pour le moment | Réponse sans suite',
  objections: 'Budget | Activité pas encore structurée | A déjà un site | Pas besoin / pas le temps | Manque de confiance | Veut réfléchir | Autre',
  modeles: 'Modèle 1 | Modèle 2 | Modèle 3 | Perso',
  types_message: 'Premier message | Relance 1 | Relance 2 | Relance 3 | Relance 4 | Autre',
  comptes: 'Business 1 | Business 2 | Messenger',
  delai_premier: '2', delai_r1: '3', delai_r2: '5', delai_r3: '7', relances_max: '4',
  objectif_jour: '50', objectif_compte: '20', indicatif: '237',
  format_vcard: '{prénom} {nom} (propulsion)',
  premier_message: "Bonjour {civilité} {nom_complet}, je suis Camel, développeur web à Douala (GoLead Forge Agency). En tant que membre de la communauté PROPULSION, vous bénéficiez de -65 % sur la création de votre site web. Puis-je vous en dire plus ?",
  relance_1: "Bonjour {civilité} {nom_complet}, je reviens vers vous au sujet de l'offre -65 % sur les sites web réservée aux membres PROPULSION. Avez-vous eu le temps d'y jeter un œil ?\n---\nBonsoir {civilité} {nom_complet}, petit rappel concernant la remise de -65 % sur votre site web (offre PROPULSION). Est-ce que cela pourrait vous intéresser pour {activité} ?",
  relance_2: "Bonjour {civilité} {nom_complet}, un site web permet à vos clients de vous trouver sur Google et de vous écrire directement sur WhatsApp. L'offre -65 % PROPULSION est toujours valable. Souhaitez-vous un exemple adapté à {activité} ?\n---\nBonjour {civilité} {nom_complet}, je me permets de vous relancer : je peux vous montrer en 2 minutes ce que donnerait un site pour {activité}, avec la remise PROPULSION de -65 %. Ça vous dit ?",
  relance_3: "Bonjour {civilité} {nom_complet}, je sais que vous êtes très occupé(e). Si le moment n'est pas idéal, dites-le-moi simplement et je reviendrai plus tard. L'offre -65 % reste ouverte aux membres PROPULSION.\n---\nBonjour {civilité} {nom_complet}, avez-vous des questions sur le site web (prix, délais, contenu) ? Je reste disponible, l'offre -65 % PROPULSION tient toujours.",
  relance_4: "Bonjour {civilité} {nom_complet}, ce sera mon dernier message à ce sujet pour ne pas vous déranger. Si un jour vous souhaitez un site web pour {activité}, je reste joignable ici. Excellente continuation ! Camel, GoLead Forge Agency\n---\nBonjour {civilité} {nom_complet}, je clôture de mon côté pour ne pas vous importuner. Mon offre reste disponible si besoin plus tard. Belle journée à vous ! Camel, GoLead Forge Agency",
  app_url: '', email: '', agenda: 'oui',
  applis_comptes: 'Business 1: business | Business 2: business | Messenger: messenger',
  contacts_google: 'oui', contact_seulement_reponse: 'non',
};

export function parseConfig(raw = {}) {
  const c = { ...DEFAULT_CONFIG };
  for (const [k, v] of Object.entries(raw || {})) if (v !== '' && v != null) c[k] = String(v);
  const list = (k) => String(c[k] || '').split('|').map((s) => s.trim()).filter(Boolean);
  const num = (k, d) => { const n = Number(c[k]); return Number.isFinite(n) ? n : d; };
  return {
    raw: c,
    etiquettes: list('etiquettes'),
    objections: list('objections'),
    modeles: list('modeles'),
    typesMessage: list('types_message'),
    comptes: list('comptes'),
    delais: [num('delai_premier', 2), num('delai_r1', 3), num('delai_r2', 5), num('delai_r3', 7)],
    relancesMax: num('relances_max', 4),
    objectifJour: num('objectif_jour', 50),
    objectifCompte: num('objectif_compte', 20),
    indicatif: String(c.indicatif || '237').replace(/\D/g, ''),
    formatVcard: c.format_vcard,
    templates: [c.premier_message, c.relance_1, c.relance_2, c.relance_3, c.relance_4],
    appUrl: c.app_url,
    appOf: parseAppMap(c.applis_comptes),
    contactsGoogle: /^o/i.test(c.contacts_google || ''),
    contactSeulementReponse: /^o/i.test(c.contact_seulement_reponse || ''),
  };
}

// ------------------------------------------------------------------- dates
const pad = (n) => String(n).padStart(2, '0');

function partsInTZ(d = new Date()) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const o = {}; for (const p of f) o[p.type] = p.value;
  return o;
}
export function todayISO(d = new Date()) { const o = partsInTZ(d); return `${o.year}-${o.month}-${o.day}`; }
export function nowHM(d = new Date()) { const o = partsInTZ(d); return `${o.hour}:${o.minute}`; }
export function nowISO(d = new Date()) { return d.toISOString(); }
export function roundHalfHour(hm) {
  const [h, m] = String(hm || '00:00').split(':').map(Number);
  let t = Math.round((h * 60 + m) / 30) * 30;
  if (t > 23 * 60 + 30) t = 23 * 60 + 30;
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}
export function timeSlots() {
  const out = [];
  for (let i = 0; i < 48; i++) out.push(`${pad(Math.floor(i / 2))}:${i % 2 ? '30' : '00'}`);
  return out;
}
function toUTC(iso) { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); }
export function addDays(iso, n) {
  if (!iso) return '';
  return new Date(toUTC(iso) + Number(n) * 864e5).toISOString().slice(0, 10);
}
export function addMonths(iso, n) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + Number(n), 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}
export function diffDays(a, b) { return Math.round((toUTC(b) - toUTC(a)) / 864e5); }
export function fmtDate(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
}
export function fmtDateLong(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)));
}
/** Accepte jj/mm/aaaa, jj/mm/aa, jj/mm, jj-mm-aaaa, aaaa-mm-jj ou un numéro de série Excel. */
export function parseDateFR(s, refYear) {
  if (s == null) return '';
  if (s instanceof Date && !isNaN(s)) return s.toISOString().slice(0, 10);
  const str = String(s).trim();
  if (!str) return '';
  let m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = str.match(/^(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?$/);
  if (m) {
    let y = m[3] ? Number(m[3]) : (refYear || Number(todayISO().slice(0, 4)));
    if (y < 100) y += 2000;
    const mo = Number(m[2]); const d = Number(m[1]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
    return `${y}-${pad(mo)}-${pad(d)}`;
  }
  if (/^\d{5}(\.\d+)?$/.test(str)) { // numéro de série Excel (jours depuis 1899-12-30)
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(str)) * 864e5).toISOString().slice(0, 10);
  }
  return '';
}
export function isoTimestamp(date, heure) { return `${date}T${heure || '12:00'}:00+01:00`; }
export function momentOf(heure) {
  if (!heure) return '';
  const h = Number(String(heure).split(':')[0]);
  if (!Number.isFinite(h)) return '';
  return h < 12 ? 'Matin (avant 12 h)' : h < 17 ? 'Après-midi (12 h – 17 h)' : 'Soir (après 17 h)';
}

// ---------------------------------------------------------------- formatage
export function fmtFCFA(n) {
  if (n == null || n === '' || !Number.isFinite(Number(n))) return '—';
  return `${new Intl.NumberFormat('fr-FR').format(Math.round(Number(n))).replace(/\u202f|\u00a0/g, ' ')} FCFA`;
}
export function parseMoney(s) {
  if (s == null || s === '') return '';
  if (typeof s === 'number') return s;
  const str = String(s).toLowerCase().replace(/fcfa|cfa|f\b/g, '').trim();
  let mult = 1; let core = str;
  const k = str.match(/^([\d\s.,]+)\s*(k|mille|m|million|millions)$/);
  if (k) { core = k[1]; mult = /^m(illion)?s?$/.test(k[2]) && k[2] !== 'mille' ? 1e6 : 1e3; }
  const n = Number(core.replace(/[\s\u202f\u00a0.]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * mult) : '';
}
export function pct(a, b) { return b ? Math.round((a / b) * 1000) / 10 : 0; }
export function uid(prefix = 'EV') {
  const rnd = new Uint8Array(6);
  globalThis.crypto.getRandomValues(rnd);
  return `${prefix}-${Date.now().toString(36)}-${Array.from(rnd, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

// ------------------------------------------------------------ texte & noms
export function norm(s) {
  return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

const CIVILITES = new Set(['monsieur', 'madame', 'mademoiselle', 'messieurs', 'mesdames', 'mr', 'mrs', 'm', 'mme', 'mmes',
  'mlle', 'mlles', 'dr', 'docteur', 'doc', 'pr', 'professeur', 'prof', 'me', 'maitre', 'ing', 'ingenieur', 'sieur',
  'papa', 'maman', 'tonton', 'tata', 'mister', 'miss', 'sir', 'mm', 'mrs', 'ms']);

const CIV_DISPLAY = {
  monsieur: 'Monsieur', m: 'Monsieur', mr: 'Monsieur', mister: 'Monsieur',
  madame: 'Madame', mme: 'Madame', mrs: 'Madame', ms: 'Madame',
  mademoiselle: 'Mademoiselle', mlle: 'Mademoiselle',
  dr: 'Docteur', docteur: 'Docteur', pr: 'Professeur', professeur: 'Professeur', me: 'Maître', maitre: 'Maître',
};

/** Retire les civilités en tête (« monsieur », « mme », « dr »…) d'une chaîne normalisée. */
export function stripCivility(normalized) {
  const w = normalized.split(' ').filter(Boolean);
  while (w.length > 1 && CIVILITES.has(w[0])) w.shift();
  return w.join(' ');
}

/** Recolle les épellations « K-O-O-G-G » ou « K.O.O.G.G » en un mot. */
export function joinSpelled(text) {
  return String(text).replace(/(?<!\p{L})\p{L}(?:[ \t]*[-.][ \t]*\p{L}(?!\p{L}))+\.?/gu,
    (m) => m.replace(/[\s.\-]/g, ''));
}

/** Découpe une saisie (tapée ou dictée) en noms : virgule, point-virgule, retour à la ligne, « et ». */
export function splitNameChunks(text) {
  return joinSpelled(text).split(/[,;\n\r]+/).map((s) => s.trim()).filter(Boolean);
}
export function splitOnEt(chunk) {
  return chunk.split(/\s+(?:et|puis)\s+/i).map((s) => s.trim()).filter(Boolean);
}

export function nameParts(nom) {
  const words = String(nom || '').trim().split(/\s+/).filter(Boolean);
  let civilite = '';
  if (words.length > 1) {
    const k = norm(words[0]);
    if (CIV_DISPLAY[k]) { civilite = CIV_DISPLAY[k]; words.shift(); }
  }
  return {
    civilite,
    prenom: words[0] || '',
    nom: words.slice(1).join(' '),
    complet: words.join(' '),
  };
}

export function renderTemplate(tpl, p) {
  const np = nameParts(p.nom);
  const vars = {
    'civilité': np.civilite, civilite: np.civilite, 'prénom': np.prenom, prenom: np.prenom,
    nom: np.nom || np.prenom, nom_complet: np.complet, 'activité': p.activite || p.secteur || 'votre activité',
    activite: p.activite || p.secteur || 'votre activité', ville: p.ville || '', secteur: p.secteur || '',
  };
  return String(tpl || '')
    .replace(/\{([^{}]+)\}/g, (m, k) => (k.trim() in vars ? vars[k.trim()] : m))
    .replace(/[ \t]{2,}/g, ' ').replace(/ +([,.])/g, '$1').replace(/^ +| +$/gm, '').trim();
}
export function splitVariants(tpl) { return String(tpl || '').split(/\n\s*-{3,}\s*\n/).map((s) => s.trim()).filter(Boolean); }

// ------------------------------------------------------------ téléphone
export function phoneInfo(raw, cc = '237') {
  const s = String(raw ?? '').trim();
  if (!s) return { ok: false, wa: '', reason: 'Pas de numéro' };
  if (/v[eé]rif/i.test(s)) return { ok: false, wa: '', reason: 'Numéro à vérifier' };
  const first = s.split(/[/,;]| ou /)[0];
  let d = first.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (cc && d.length === 9 && /^[236]/.test(d)) d = cc + d;
  if (d.length < 10 || d.length > 15) return { ok: false, wa: d, reason: 'Numéro à vérifier' };
  return { ok: true, wa: d, intl: `+${d}` };
}
export function waLink(number, text) {
  return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

// ------------------------------------------------------------ choix de l'application WhatsApp (Android)
export const WA_APPS = {
  business: { pkg: 'com.whatsapp.w4b', label: 'WhatsApp Business' },
  messenger: { pkg: 'com.whatsapp', label: 'WhatsApp' },
};
/** « Business 1: business | Messenger: messenger » -> fonction compte -> application. */
export function parseAppMap(str) {
  const m = {};
  for (const part of String(str || '').split('|')) {
    const [k, v] = part.split(':').map((x) => (x || '').trim());
    if (k && v) m[norm(k)] = /mess|^wa$|whatsapp$/i.test(v) && !/bus/i.test(v) ? 'messenger' : 'business';
  }
  return (compte) => m[norm(compte)] || (/mess/i.test(compte || '') ? 'messenger' : 'business');
}
/** Autres comptes ouverts dans la même application : l'application ne peut pas choisir, il faut basculer à la main. */
export function sameAppAccounts(compte, cfg) {
  const app = cfg.appOf(compte);
  return cfg.comptes.filter((c) => c !== compte && cfg.appOf(c) === app);
}
/**
 * Lien qui ouvre une conversation dans une application précise.
 * mode 'intent' : intent Android, schéma whatsapp:// (forme la plus répandue) ;
 * mode 'smsto'  : intent Android, schéma smsto (variante) ;
 * mode 'wame'   : lien wa.me (application WhatsApp par défaut du téléphone).
 * Les intents portent wa.me en repli (S.browser_fallback_url) si l'application n'est pas installée.
 */
export function waAppLink(number, text, app, mode = 'intent') {
  const fallback = waLink(number, text);
  const q = `phone=${number}${text ? `&text=${encodeURIComponent(text)}` : ''}`;
  // 'choix' : aucune application imposée -> Android demande « WhatsApp ou WhatsApp Business ? »
  // (sauf si une application a été réglée « toujours » par défaut dans le téléphone).
  if (mode === 'choix') return `intent://send?${q}#Intent;scheme=whatsapp;S.browser_fallback_url=${encodeURIComponent(fallback)};end`;
  const a = WA_APPS[app];
  if (mode === 'wame' || !a) return fallback;
  const tail = `package=${a.pkg};S.browser_fallback_url=${encodeURIComponent(fallback)};end`;
  return mode === 'smsto'
    ? `intent://send/?${q}#Intent;scheme=smsto;${tail}`
    : `intent://send?${q}#Intent;scheme=whatsapp;${tail}`;
}

// ------------------------------------------------------------ prospects & recherche
export function prepareProspects(list) {
  return list.map((p, i) => {
    const n = norm(p.nom);
    const stripped = stripCivility(n);
    const o = {
      ...p,
      id: String(p.id || ''),
      _row: i + 1,
      _n: stripped,
      _w: stripped.split(' ').filter(Boolean),
      _hay: `${stripped} ${norm(p.ville)} ${norm(p.secteur)} ${norm(p.id)} ${norm(p.visuel)} ${norm(p.pays)}`.split(' ').filter(Boolean),
      _digits: String(p.numero || '').replace(/\D/g, ''),
    };
    return o;
  });
}

function priorityValue(p) {
  const n = Number(String(p.priorite ?? '').replace(',', '.'));
  return Number.isFinite(n) && String(p.priorite ?? '').trim() !== '' ? n : Infinity;
}
export function byPriority(a, b) {
  const pa = priorityValue(a); const pb = priorityValue(b);
  if (pa !== pb) return pa - pb;
  if (pa === Infinity && String(a.priorite || '') !== String(b.priorite || '')) return String(a.priorite || '~').localeCompare(String(b.priorite || '~'));
  return a._row - b._row;
}

/** Recherche instantanée : insensible aux accents et à la casse, tous les mots doivent correspondre (début de mot). */
export function searchProspects(list, query, { limit = 50, nameOnly = false } = {}) {
  const q = stripCivility(norm(joinSpelled(query)));
  if (!q) return [];
  const words = q.split(' ');
  const digits = String(query).replace(/\D/g, '');
  const out = [];
  for (const p of list) {
    const hay = nameOnly ? p._w : p._hay;
    let ok = words.every((w) => hay.some((h) => h.startsWith(w)));
    if (!ok && !nameOnly && digits.length >= 4 && p._digits.includes(digits)) ok = true;
    if (ok) {
      let score = 0;
      if (p._n === q) score -= 1000;
      else if (p._n.startsWith(q)) score -= 500;
      if (words.every((w) => p._w.some((h) => h.startsWith(w)))) score -= 100;
      out.push([score, p]);
    }
  }
  out.sort((a, b) => a[0] - b[0] || byPriority(a[1], b[1]));
  return out.slice(0, limit).map((x) => x[1]);
}

/**
 * Résout une saisie multiple en prospects.
 * Retour : [{ query, status: 'ok'|'multi'|'none', prospect?, candidates? }]
 */
export function resolveNames(list, text) {
  const results = [];
  const resolveOne = (query) => {
    const q = stripCivility(norm(query));
    if (!q) return null;
    const exact = list.filter((p) => p._n === q);
    if (exact.length === 1) return { query, status: 'ok', prospect: exact[0] };
    const found = searchProspects(list, query, { limit: 7, nameOnly: true });
    if (found.length === 1) return { query, status: 'ok', prospect: found[0] };
    if (found.length > 1) return { query, status: 'multi', candidates: (exact.length ? exact : found).slice(0, 6) };
    return { query, status: 'none' };
  };
  for (const chunk of splitNameChunks(text)) {
    if (/\s(et|puis)\s/i.test(chunk)) {
      const whole = resolveOne(chunk);
      if (whole && whole.status !== 'none') { results.push(whole); continue; }
      for (const part of splitOnEt(chunk)) { const r = resolveOne(part); if (r) results.push(r); }
    } else {
      const r = resolveOne(chunk); if (r) results.push(r);
    }
  }
  return results;
}

// ------------------------------------------------------------ événements & état
export function eventKey(e) { return `${e.date || ''} ${e.heure || '99:99'} ${e.cree_le || ''} ${e.id || ''}`; }
export function sortEvents(evs) { return [...evs].sort((a, b) => (eventKey(a) < eventKey(b) ? -1 : eventKey(a) > eventKey(b) ? 1 : 0)); }

export function numFromTypeMessage(type, prevMax) {
  if (type === 'Premier message') return 0;
  const m = String(type || '').match(/relance\s*(\d+)/i);
  if (m) return Number(m[1]);
  return prevMax >= 0 ? prevMax + 1 : 0;
}
export function typeMessageFromNum(n) { return n <= 0 ? 'Premier message' : `Relance ${n}`; }
export function relanceLabel(n) { return n <= 0 ? '1er message' : `R${n}`; }

/** Date de la prochaine relance après l'envoi du message numéro `num` (0 = premier message). */
export function nextRelanceDate(date, num, cfg) {
  if (!date || num >= cfg.relancesMax) return '';
  const d = cfg.delais[Math.max(0, num)];
  return d == null ? '' : addDays(date, d);
}

const isEtape = (e) => e.type === T.NOTE && e.etape && e.etape !== ETAPES.AUCUNE;
const sets = (e) => e.type === T.CONTACT || isEtape(e) || (e.type === T.NOTE && e.prochaine_relance);
const positive = (e) => e.type === T.REPLY || e.type === T.OBJECTION || e.type === T.DEVIS || e.type === T.PAIEMENT;

/** Calcule tout ce qu'on sait d'un prospect à partir de ses événements (triés chronologiquement). */
export function deriveProspect(p, rawEvents, cfg, today = todayISO()) {
  const evs = sortEvents(rawEvents || []);
  const by = (t) => evs.filter((e) => e.type === t);
  const contacts = by(T.CONTACT); const replies = by(T.REPLY); const objections = by(T.OBJECTION);
  const devis = by(T.DEVIS); const paiements = by(T.PAIEMENT); const factures = by(T.FACTURE);
  const projets = by(T.PROJET); const savs = by(T.SAV);
  const etapes = evs.filter(isEtape);
  const lastEtape = etapes[etapes.length - 1];
  const after = (ref) => (e) => eventKey(e) > eventKey(ref);
  const positiveAfterEtape = lastEtape ? evs.some((e) => positive(e) && after(lastEtape)(e)) : false;
  const etapeActive = lastEtape && !positiveAfterEtape ? lastEtape.etape : '';

  let maxNum = -1;
  for (const c of contacts) { const n = Number(c.numero_relance); if (Number.isFinite(n) && c.numero_relance !== '' && n > maxNum) maxNum = n; }
  if (contacts.length && maxNum < 0) maxNum = contacts.length - 1;

  const hasFull = paiements.some((x) => x.type_paiement === 'Solde' || x.type_paiement === 'Paiement total');
  let state;
  if (hasFull) state = 'paye';
  else if (paiements.length) state = 'acompte';
  else if (etapeActive.startsWith('Refus')) state = 'refus';
  else if (etapeActive === ETAPES.PERDU) state = 'perdu';
  else if (etapeActive === ETAPES.PAUSE) state = 'pause';
  else if (devis.length) state = 'devis';
  else if (replies.length || objections.length) state = 'conversation';
  else if (contacts.length) state = maxNum >= cfg.relancesMax ? 'cloture' : 'contacte';
  else state = 'a_contacter';

  // Prochaine relance : portée par le dernier événement qui la fixe (contact, étape, report).
  const setters = evs.filter(sets);
  const lastSetter = setters[setters.length - 1];
  const nextRelance = lastSetter ? (lastSetter.prochaine_relance || '') : '';
  const lastPositive = [...evs].reverse().find(positive);
  const manual = lastSetter && lastSetter.type === T.NOTE && (!lastPositive || eventKey(lastSetter) > eventKey(lastPositive));
  let relanceActive = false;
  if (nextRelance && !['paye', 'acompte', 'refus', 'perdu'].includes(state)) {
    if (state === 'contacte') relanceActive = true;
    else if (manual) relanceActive = true;
  }
  const due = relanceActive && nextRelance <= today;
  const overdue = relanceActive && nextRelance < today;

  const lastContact = contacts[contacts.length - 1];
  const firstContact = contacts[0];
  const lastReply = replies[replies.length - 1];

  // ---- client
  const totalPaye = paiements.reduce((s, x) => s + (Number(x.montant) || 0), 0);
  const devisMontant = devis.length ? Number(devis[devis.length - 1].montant) || null : null;
  const invMap = new Map();
  for (const f of factures) {
    const k = f.numero_facture || f.id;
    const cur = invMap.get(k) || { numero: k, montant: null, statut: 'émise', date: f.date, datePaye: '' };
    if (f.montant !== '' && f.montant != null && cur.montant == null) cur.montant = Number(f.montant);
    if (f.statut_facture) cur.statut = f.statut_facture;
    if (f.statut_facture === 'payée') cur.datePaye = f.date;
    invMap.set(k, cur);
  }
  const invoices = [...invMap.values()];
  let convenu = devisMontant;
  if (convenu == null && invoices.length && invoices[0].montant != null) convenu = invoices[0].montant;
  if (convenu == null && hasFull) convenu = totalPaye;
  const reste = convenu == null ? null : Math.max(0, convenu - totalPaye);
  const isClient = paiements.length > 0;
  const lastProjet = projets.filter((x) => x.statut_projet).pop();
  const etapeProjet = lastProjet ? lastProjet.statut_projet : '';
  const livre = [...projets].reverse().find((x) => x.date_livraison);
  const livraison = livre ? livre.date_livraison : '';
  const dureeSuivi = livre ? (Number(livre.duree_suivi_mois) || 2) : null;
  const finSuivi = livraison ? addMonths(livraison, dureeSuivi) : '';
  const savMap = new Map();
  for (const s of savs) {
    const root = s.ref_id || s.id;
    const cur = savMap.get(root) || { id: root, type: s.type_sav, description: s.description_sav, date: s.date, statut: 'Ouvert', updates: [] };
    if (!s.ref_id) { cur.type = s.type_sav; cur.description = s.description_sav; cur.date = s.date; }
    if (s.statut_sav) cur.statut = s.statut_sav;
    cur.updates.push(s);
    savMap.set(root, cur);
  }
  const savList = [...savMap.values()];
  const savOpen = savList.filter((s) => s.statut !== 'Résolu');
  let clientStatus = '';
  if (isClient) {
    if (etapeProjet === 'Terminé' || (finSuivi && finSuivi < today && !savOpen.length)) clientStatus = 'termine';
    else if (finSuivi && finSuivi >= today) clientStatus = 'suivi';
    else if (livraison || etapeProjet === 'Livré' || etapeProjet === 'Suivi en cours') clientStatus = 'livre';
    else clientStatus = 'en_cours';
  }
  const firstPaiement = paiements[0];
  const ph = phoneInfo(p.numero, cfg.indicatif);
  const lastEvent = evs[evs.length - 1];

  return {
    p, id: p.id, events: evs, state, stateLabel: STATES[state].label, tone: STATES[state].tone,
    refus: state === 'refus', etapeActive, raisonRefus: lastEtape && etapeActive ? lastEtape.raison_refus || '' : '',
    etiquette: lastReply ? lastReply.etiquette || '' : '',
    contacts, replies, objections, devis, paiements, factures, projets, savs,
    nbMessages: contacts.length, maxNum, nbRelances: Math.max(0, maxNum),
    nextNum: maxNum + 1, nextRelance: relanceActive ? nextRelance : '', due, overdue,
    lastContactDate: lastContact ? lastContact.date : '', firstContact, lastContact,
    firstReply: replies[0] || objections[0] || null,
    hasReplied: replies.length > 0 || objections.length > 0 || devis.length > 0 || paiements.length > 0,
    lastActivity: lastEvent ? lastEvent.date : '',
    phone: ph,
    isClient, totalPaye, devisMontant, convenu, reste, invoices, etapeProjet, livraison, dureeSuivi, finSuivi,
    joursSuivi: finSuivi ? diffDays(today, finSuivi) : null,
    savList, savOpen, clientStatus, firstPaiement,
  };
}

export function groupEvents(events) {
  const m = new Map();
  for (const e of events) {
    const k = String(e.prospect_id);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(e);
  }
  return m;
}

export function deriveAll(prospects, events, cfg, today = todayISO()) {
  const g = groupEvents(events);
  const list = prospects.map((p) => deriveProspect(p, g.get(String(p.id)) || [], cfg, today));
  const map = new Map(list.map((d) => [d.id, d]));
  return { list, map };
}

// ------------------------------------------------------------ agenda du jour
export function relancesDues(derivedList, today = todayISO()) {
  const due = derivedList.filter((d) => d.due && !d.refus);
  due.sort((a, b) => (a.nextRelance < b.nextRelance ? -1 : a.nextRelance > b.nextRelance ? 1 : byPriority(a.p, b.p)));
  return {
    overdue: due.filter((d) => d.nextRelance < today),
    today: due.filter((d) => d.nextRelance === today),
  };
}

/** Les n prochains prospects « à contacter » par priorité (hors plan, hors refus), regroupés par visuel. */
export function nextNewProspects(derivedList, excludeIds, n = 30) {
  const ex = new Set(excludeIds);
  const pool = derivedList.filter((d) => d.state === 'a_contacter' && !d.nextRelance && !ex.has(d.id) && d.phone.ok)
    .sort((a, b) => byPriority(a.p, b.p)).slice(0, n);
  const order = []; const groups = new Map();
  for (const d of pool) {
    const k = d.p.visuel || '';
    if (!groups.has(k)) { groups.set(k, []); order.push(k); }
    groups.get(k).push(d);
  }
  return order.flatMap((k) => groups.get(k));
}

export function messageFor(d, cfg, variantIndex = 0) {
  const n = Math.max(0, d.nextNum);
  if (n === 0) {
    if (d.p.message) return renderTemplate(d.p.message, d.p);
    const v = splitVariants(cfg.templates[0]);
    return renderTemplate(v[variantIndex % (v.length || 1)] || '', d.p);
  }
  const tpl = cfg.templates[Math.min(n, 4)];
  const v = splitVariants(tpl);
  if (!v.length) return '';
  // Alternance : on évite la même variante que la relance précédente envoyée à ce prospect.
  let idx = variantIndex % v.length;
  const prev = d.lastContact && d.lastContact.message;
  if (v.length > 1 && prev && renderTemplate(v[idx], d.p) === prev) idx = (idx + 1) % v.length;
  return renderTemplate(v[idx], d.p);
}

// ------------------------------------------------------------ rattrapage
/**
 * Construit les événements pour insérer un prospect dans un état donné.
 * opts : { nbMessages (0 = aucun, 1 = premier message seul, 2 = + R1…), dateDernier, repondu, etiquette,
 *          noteReponse, dateReponse, objectionCat, objectionTexte, objectionPlan, objectionResolue,
 *          devisMontant, devisDate, payeMontant, payeDate, prochaineRelance, compte, note, lotId, nowIso }
 */
export function buildCatchupEvents(d, opts, cfg, today = todayISO()) {
  const p = d.p; const out = [];
  let seq = 0;
  const base = Date.parse(opts.nowIso || new Date().toISOString());
  const mk = (type, date, extra) => ({
    id: uid(), type, date, heure: '', timestamp: isoTimestamp(date, ''), prospect_id: p.id, prospect_nom: p.nom,
    nouveau: p._new ? 'oui' : 'non', visuel: p.visuel || '', lot_id: opts.lotId || '',
    cree_le: new Date(base + seq++).toISOString(), ...extra,
  });
  const nb = Math.max(0, Number(opts.nbMessages) || 0);
  const lastNum = nb - 1;
  const dateDernier = opts.dateDernier || today;
  const contactCarries = nb > 0 && lastNum > d.maxNum && !opts.repondu;
  const autoNext = (date, k) => (opts.prochaineRelance !== undefined ? opts.prochaineRelance : nextRelanceDate(date, k, cfg));
  if (nb > 0 && lastNum > d.maxNum) {
    const dates = [];
    dates[lastNum] = dateDernier;
    for (let k = lastNum - 1; k >= 0; k--) dates[k] = addDays(dates[k + 1], -(cfg.delais[k] ?? 2));
    for (let k = Math.max(0, d.maxNum + 1); k <= lastNum; k++) {
      const isLast = k === lastNum;
      const pr = !isLast ? dates[k + 1] : (opts.repondu ? '' : autoNext(dates[k], k));
      out.push(mk(T.CONTACT, dates[k], {
        type_message: typeMessageFromNum(k), numero_relance: k, prochaine_relance: pr || '',
        compte_whatsapp: opts.compte || '', note: isLast && contactCarries && opts.note ? opts.note : 'Rattrapage',
      }));
    }
  }
  const replyDate = opts.dateReponse || dateDernier;
  if (opts.repondu) {
    out.push(mk(T.REPLY, replyDate, { etiquette: opts.etiquette || 'Conversation en cours', note: opts.noteReponse || '' }));
  }
  if (opts.objectionCat) {
    out.push(mk(T.OBJECTION, replyDate, {
      objection_categorie: opts.objectionCat, objection_texte: opts.objectionTexte || '',
      resolue: opts.objectionResolue || 'En cours', comment_resolue: opts.objectionPlan || '',
    }));
  }
  if (opts.devisMontant) out.push(mk(T.DEVIS, opts.devisDate || dateDernier, { montant: Number(opts.devisMontant) }));
  if (opts.payeMontant) {
    const full = opts.devisMontant ? Number(opts.payeMontant) >= Number(opts.devisMontant) : false;
    out.push(mk(T.PAIEMENT, opts.payeDate || dateDernier, { montant: Number(opts.payeMontant), type_paiement: full ? 'Paiement total' : 'Acompte', moyen: 'Autre' }));
  }
  // Date de relance non portée par un message (après une réponse, ou sans message) : note qui la fixe.
  const latest = out.reduce((m, e) => (e.date > m ? e.date : m), dateDernier);
  const noteDate = today > latest ? today : latest;
  const wantNote = opts.prochaineRelance && !contactCarries;
  const noteText = opts.note && !contactCarries ? opts.note : '';
  if (wantNote || noteText) {
    out.push(mk(T.NOTE, noteDate, { etape: ETAPES.AUCUNE, prochaine_relance: wantNote ? opts.prochaineRelance : '', note: noteText || 'Prochaine relance (rattrapage)' }));
  }
  return out;
}

// ------------------------------------------------------------ bilan
function groupRow() { return { contactes: 0, envois: 0, reponses: 0, devis: 0, payes: 0 }; }
export function computeStats(derivedList, events, cfg) {
  const contacted = derivedList.filter((d) => d.nbMessages > 0);
  const replied = contacted.filter((d) => d.hasReplied);
  const anyTouched = derivedList.filter((d) => d.events.length > 0);
  const engagedLabels = new Set(['Conversation en cours', 'Intéressé', 'A posé une question', 'Demande un devis']);
  const engaged = (d) => d.devis.length || d.paiements.length || d.replies.some((r) => engagedLabels.has(r.etiquette)) || d.objections.length;
  const withDevis = derivedList.filter((d) => d.devis.length);
  const payers = derivedList.filter((d) => d.paiements.length);
  const encaisse = events.filter((e) => e.type === T.PAIEMENT).reduce((s, e) => s + (Number(e.montant) || 0), 0);

  const funnel = [
    ['Contactés', anyTouched.filter((d) => d.nbMessages || d.hasReplied).length],
    ['Ont répondu', anyTouched.filter((d) => d.hasReplied).length],
    ['En conversation / intéressés', anyTouched.filter(engaged).length],
    ['Devis', anyTouched.filter((d) => d.devis.length || d.paiements.length).length],
    ['Ont payé', payers.length],
  ];

  const tables = { visuel: new Map(), secteur: new Map(), modele: new Map(), moment: new Map() };
  const add = (map, key, d) => {
    const k = key || '(non renseigné)';
    if (!map.has(k)) map.set(k, groupRow());
    const r = map.get(k);
    r.contactes++; r.envois += d.nbMessages; if (d.hasReplied) r.reponses++; if (d.devis.length) r.devis++; if (d.paiements.length) r.payes++;
  };
  for (const d of contacted) {
    add(tables.visuel, d.firstContact.visuel || d.p.visuel, d);
    add(tables.secteur, d.p.secteur, d);
    add(tables.modele, d.firstContact.modele, d);
    add(tables.moment, momentOf(d.firstContact.heure), d);
  }
  const toRows = (m) => [...m.entries()].map(([k, r]) => ({ key: k, ...r, taux: pct(r.reponses, r.contactes) }))
    .sort((a, b) => b.contactes - a.contactes);

  const relances = [];
  for (let k = 1; k <= Math.max(4, cfg.relancesMax); k++) {
    const got = contacted.filter((d) => d.maxNum >= k);
    const resp = got.filter((d) => {
      const rk = d.contacts.find((c) => Number(c.numero_relance) === k);
      const fr = d.firstReply;
      return fr && rk && eventKey(fr) >= eventKey(rk);
    });
    relances.push({ k, prospects: got.length, reponses: resp.length, taux: pct(resp.length, got.length) });
  }
  const beforeR1 = contacted.filter((d) => d.firstReply && !d.contacts.some((c) => Number(c.numero_relance) >= 1 && eventKey(c) <= eventKey(d.firstReply))).length;

  const objMap = new Map();
  for (const d of derivedList) for (const o of d.objections) {
    const k = o.objection_categorie || 'Autre';
    if (!objMap.has(k)) objMap.set(k, { key: k, total: 0, resolues: 0 });
    const r = objMap.get(k); r.total++; if (o.resolue === 'Oui') r.resolues++;
  }

  const clients = derivedList.filter((d) => d.isClient);
  const delais = clients.filter((d) => d.firstContact && d.firstPaiement).map((d) => diffDays(d.firstContact.date, d.firstPaiement.date));
  const secteurClients = new Map();
  for (const d of clients) secteurClients.set(d.p.secteur || '(non renseigné)', (secteurClients.get(d.p.secteur || '(non renseigné)') || 0) + 1);
  const savAll = clients.flatMap((d) => d.savList);

  return {
    tiles: {
      contactes: contacted.length, tauxReponse: pct(replied.length, contacted.length), repondu: replied.length,
      devis: withDevis.length, payes: payers.length, encaisse,
      tauxDevisPaiement: pct(withDevis.filter((d) => d.paiements.length).length, withDevis.length),
    },
    funnel,
    visuel: toRows(tables.visuel), secteur: toRows(tables.secteur), modele: toRows(tables.modele), moment: toRows(tables.moment),
    relances, beforeR1,
    objections: [...objMap.values()].sort((a, b) => b.total - a.total),
    clients: {
      nb: clients.length, ca: clients.reduce((s, d) => s + d.totalPaye, 0),
      reste: clients.reduce((s, d) => s + (d.reste || 0), 0),
      delaiMoyen: delais.length ? Math.round(delais.reduce((a, b) => a + b, 0) / delais.length) : null,
      savOuverts: savAll.filter((s) => s.statut !== 'Résolu').length, savResolus: savAll.filter((s) => s.statut === 'Résolu').length,
      secteurs: [...secteurClients.entries()].sort((a, b) => b[1] - a[1]),
    },
  };
}

// ------------------------------------------------------------ CSV & vCard
export function detectSeparator(line) {
  const c = { ';': 0, ',': 0, '\t': 0 };
  let q = false;
  for (const ch of line) { if (ch === '"') q = !q; else if (!q && ch in c) c[ch]++; }
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0][1] ? Object.entries(c).sort((a, b) => b[1] - a[1])[0][0] : ';';
}
export function parseCSV(text, sep) {
  const s = String(text).replace(/^\uFEFF/, '');
  sep = sep || detectSeparator(s.split(/\r?\n/)[0] || '');
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}
export function rowsToObjects(rows) {
  if (!rows.length) return [];
  const head = rows[0].map((h) => norm(h).replace(/ /g, '_'));
  return rows.slice(1).map((r, i) => { const o = { _line: i + 2 }; head.forEach((h, j) => { o[h] = r[j] != null ? String(r[j]).trim() : ''; }); return o; });
}
export function toCSV(rows, sep = ';') {
  const esc = (v) => { const s = v == null ? '' : String(v); return /["\n\r;,]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s; };
  return rows.map((r) => r.map(esc).join(sep)).join('\r\n');
}
export function toTSV(rows) { return rows.map((r) => r.map((v) => String(v ?? '').replace(/[\t\n\r]+/g, ' ')).join('\t')).join('\n'); }

export function buildVCard(items, format, cc) {
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const cards = [];
  for (const p of items) {
    const ph = phoneInfo(p.numero, cc);
    if (!ph.ok || p._refus) continue;
    const np = nameParts(p.nom);
    const fn = renderTemplate(format || '{prénom} {nom} (propulsion)', p) || p.nom;
    cards.push(['BEGIN:VCARD', 'VERSION:3.0', `N:${esc(np.nom)};${esc(np.prenom)};;;`, `FN:${esc(fn)}`,
      `TEL;TYPE=CELL:${ph.intl}`, p.secteur ? `ORG:${esc(p.secteur)}` : '', 'END:VCARD'].filter(Boolean).join('\r\n'));
  }
  return cards.join('\r\n') + (cards.length ? '\r\n' : '');
}

/** Prochain numéro de facture du type 2026-008. */
export function nextInvoiceNumber(events, year) {
  let max = 0;
  for (const e of events) {
    const m = String(e.numero_facture || '').match(/^(\d{4})-(\d+)$/);
    if (m && m[1] === String(year)) max = Math.max(max, Number(m[2]));
  }
  return `${year}-${String(max + 1).padStart(3, '0')}`;
}
