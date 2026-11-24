// Données de l'application : cache local (IndexedDB), file d'attente hors ligne,
// appels à l'Apps Script (ou au serveur de démonstration local).
//
// Principe : chaque modification est une « opération » (addEvents, deleteEvents, deleteLot,
// addProspects, updateConfig). Elle est appliquée tout de suite à l'écran, enregistrée dans la
// file IndexedDB, puis envoyée au serveur. Le serveur ignore les identifiants déjà reçus :
// renvoyer une opération après une coupure ne crée jamais de doublon.

import * as L from './logic.js';

const DB_NAME = 'prospection';
const LS = {
  get(k, d = '') { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* stockage indisponible */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* idem */ } },
};
export { LS };

// ------------------------------------------------------------------ IndexedDB
let dbPromise;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        if (!d.objectStoreNames.contains('queue')) d.createObjectStore('queue', { keyPath: 'opId' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}
async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    Promise.resolve(fn(s)).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const idb = {
  get: (k) => tx('kv', 'readonly', (s) => reqP(s.get(k))),
  set: (k, v) => tx('kv', 'readwrite', (s) => { s.put(v, k); }),
  queueAll: () => tx('queue', 'readonly', (s) => reqP(s.getAll())),
  queuePut: (op) => tx('queue', 'readwrite', (s) => { s.put(op); }),
  queueDel: (id) => tx('queue', 'readwrite', (s) => { s.delete(id); }),
  clear: () => Promise.all([tx('kv', 'readwrite', (s) => { s.clear(); }), tx('queue', 'readwrite', (s) => { s.clear(); })]),
};

// ------------------------------------------------------------------ application locale d'une opération
export function applyOp(data, op) {
  const p = op.payload || {};
  switch (op.action) {
    case 'addEvents': {
      const ids = new Set(data.events.map((e) => e.id));
      for (const e of p.events || []) if (!ids.has(e.id)) { data.events.push(e); ids.add(e.id); }
      break;
    }
    case 'deleteEvents': { const s = new Set(p.ids || []); data.events = data.events.filter((e) => !s.has(e.id)); break; }
    case 'deleteLot': data.events = data.events.filter((e) => !p.lot_id || e.lot_id !== p.lot_id); break;
    case 'addProspects': {
      const ids = new Set(data.prospects.map((x) => String(x.id)));
      for (const x of p.prospects || []) if (!ids.has(String(x.id))) { data.prospects.push(x); ids.add(String(x.id)); }
      break;
    }
    case 'updateConfig': data.config = { ...data.config, ...(p.values || {}) }; break;
    default: break;
  }
  return data;
}

// ------------------------------------------------------------------ serveur de démonstration (local)
const DEMO_KEY = 'demo-db';
async function demoSeed() {
  const txt = await fetch('demo/demo-prospects.csv').then((r) => r.text());
  const rows = L.rowsToObjects(L.parseCSV(txt));
  const prospects = rows.map((r) => ({
    id: r.id, priorite: r.priorite, nom: r.nom, secteur: r.secteur, ville: r.ville, pays: r.pays,
    numero: r.numero_whatsapp, visuel: r.code_visuel, activite: r.activite, message: r.message_prepare,
  }));
  const today = L.todayISO();
  const cfg = L.parseConfig({});
  const events = [];
  let seq = 0;
  const mk = (pid, type, offset, extra = {}) => {
    const p = prospects.find((x) => x.id === pid);
    const date = L.addDays(today, offset);
    events.push({ id: L.uid(), type, date, heure: extra.heure || '10:00', timestamp: L.isoTimestamp(date, extra.heure || '10:00'),
      prospect_id: pid, prospect_nom: p.nom, nouveau: 'non', visuel: p.visuel, cree_le: new Date(Date.now() - 1e8 + seq++).toISOString(), lot_id: 'DEMO', ...extra });
  };
  const contact = (pid, offset, n, extra = {}) => mk(pid, 'contact', offset, { numero_relance: n, type_message: L.typeMessageFromNum(n),
    modele: n === 0 ? ['Modèle 1', 'Modèle 2', 'Modèle 3'][seq % 3] : '', compte_whatsapp: ['Business 1', 'Business 2', 'Messenger'][seq % 3],
    prochaine_relance: L.nextRelanceDate(L.addDays(today, offset), n, cfg), heure: ['08:30', '13:00', '18:30'][seq % 3], ...extra });
  contact('DEMO-001', -6, 0); contact('DEMO-001', -4, 1);                    // relance R2 en retard
  contact('DEMO-002', -2, 0);                                                // relance R1 aujourd'hui
  contact('DEMO-003', -5, 0); mk('DEMO-003', 'reply', -4, { etiquette: 'Intéressé', note: 'Veut voir des exemples' });
  contact('DEMO-005', -10, 0); mk('DEMO-005', 'reply', -9, { etiquette: 'Demande un devis' }); mk('DEMO-005', 'devis', -8, { montant: 250000 });
  mk('DEMO-005', 'objection', -7, { objection_categorie: 'Budget', objection_texte: 'Trouve que c\'est cher', resolue: 'En cours', comment_resolue: 'Proposer un paiement en 2 fois' });
  contact('DEMO-006', -40, 0); mk('DEMO-006', 'reply', -39, { etiquette: 'Intéressé' }); mk('DEMO-006', 'devis', -38, { montant: 300000 });
  mk('DEMO-006', 'paiement', -36, { type_paiement: 'Acompte', montant: 150000, moyen: 'MTN Mobile Money' });
  mk('DEMO-006', 'facture', -36, { numero_facture: `${today.slice(0, 4)}-001`, montant: 300000, statut_facture: 'émise' });
  mk('DEMO-006', 'projet', -30, { statut_projet: 'Livré', date_livraison: L.addDays(today, -30), duree_suivi_mois: 1 });
  mk('DEMO-006', 'sav', -5, { type_sav: 'Modification de contenu', statut_sav: 'Ouvert', description_sav: 'Changer les horaires d\'ouverture' });
  contact('DEMO-007', -20, 0); mk('DEMO-007', 'paiement', -15, { type_paiement: 'Paiement total', montant: 180000, moyen: 'Orange Money' });
  mk('DEMO-007', 'projet', -14, { statut_projet: 'Démarré' });
  contact('DEMO-008', -12, 0); mk('DEMO-008', 'note', -11, { etape: L.ETAPES.REFUS, raison_refus: 'Ne souhaite pas être contacté' });
  [0, 1, 2, 3, 4].forEach((n, i) => contact('DEMO-009', -30 + [0, 2, 5, 10, 17][i], n));
  contact('DEMO-010', -3, 0); contact('DEMO-011', -1, 0); contact('DEMO-012', -7, 0); contact('DEMO-012', -5, 1); contact('DEMO-012', -2, 2);
  return { prospects, events, config: {} };
}
const demo = {
  async load() {
    const raw = LS.get(DEMO_KEY);
    if (raw) return JSON.parse(raw);
    const d = await demoSeed(); LS.set(DEMO_KEY, JSON.stringify(d)); return d;
  },
  async call(action, payload) {
    if (navigator.onLine === false) throw new TypeError('Failed to fetch (hors ligne)');
    await new Promise((r) => setTimeout(r, 120));
    const d = await demo.load();
    let res = { ok: true };
    if (action === 'getAll') res = { ok: true, ...d, serverTime: new Date().toISOString() };
    else if (action === 'ping') res = { ok: true };
    else {
      const before = { e: d.events.length, p: d.prospects.length };
      applyOp(d, { action, payload });
      res = { ok: true, added: d.events.length - before.e + d.prospects.length - before.p };
      LS.set(DEMO_KEY, JSON.stringify(d));
    }
    return JSON.parse(JSON.stringify(res));
  },
  reset() { LS.del(DEMO_KEY); },
};

// ------------------------------------------------------------------ Store
export class Store extends EventTarget {
  constructor() {
    super();
    this.data = { prospects: [], events: [], config: {} };
    this.queue = [];
    this.status = 'idle'; // idle | syncing | offline | auth | error
    this.lastSync = LS.get('lastSync');
    this.flushing = false;
  }
  get mode() { return LS.get('mode'); }
  get url() { return LS.get('apiUrl'); }
  get token() { return LS.get('apiToken'); }
  get configured() { return this.mode === 'demo' || (this.mode === 'api' && this.url && this.token); }

  setStatus(s, detail = '') { this.status = s; this.statusDetail = detail; this.emit('status'); }
  emit(type) { this.dispatchEvent(new Event(type)); }

  async init() {
    try {
      const cached = await idb.get('data');
      if (cached) this.data = cached;
      this.queue = (await idb.queueAll()).sort((a, b) => a.seq - b.seq);
    } catch (err) { console.warn('IndexedDB indisponible', err); }
    this.emit('change');
    window.addEventListener('online', () => this.sync());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.sync(); });
    setInterval(() => { if (this.queue.length) this.flush(); }, 30000);
  }

  async configure(mode, url = '', token = '') {
    LS.set('mode', mode); LS.set('apiUrl', url.trim()); LS.set('apiToken', token.trim());
    const res = await this.call('ping', {});
    if (!res.ok) throw new Error(res.error === 'unauthorized' ? 'Jeton refusé par le script.' : (res.error || 'Erreur'));
    await this.refresh();
  }

  async reset() {
    LS.del('mode'); LS.del('apiUrl'); LS.del('apiToken'); LS.del('lastSync');
    demo.reset();
    this.data = { prospects: [], events: [], config: {} }; this.queue = [];
    await idb.clear().catch(() => {});
    this.emit('change');
  }

  async call(action, payload) {
    if (this.mode === 'demo') return demo.call(action, payload);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);
    try {
      let r;
      try {
        r = await fetch(this.url, {
          method: 'POST', redirect: 'follow', signal: ctrl.signal,
          // text/plain : évite la requête préalable CORS que l'Apps Script ne sait pas traiter.
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ token: this.token, action, payload }),
        });
      } catch (err) {
        if (navigator.onLine === false) throw new Error('pas de réseau sur le téléphone.');
        if (err.name === 'AbortError') throw new Error('le script n\'a pas répondu en 45 s.');
        throw new Error('le script est injoignable. Vérifie que l\'adresse se termine par /exec et que le déploiement est en accès « Tout le monde ».');
      }
      const text = await r.text();
      try { return JSON.parse(text); } catch {
        throw new Error(/<html|<!doctype/i.test(text)
          ? 'le script a renvoyé une page Google au lieu des données : redéploie-le avec « Exécuter en tant que : Moi » et « Qui a accès : Tout le monde ».'
          : `réponse inattendue du script (code ${r.status}).`);
      }
    } finally { clearTimeout(timer); }
  }

  async save() { try { await idb.set('data', this.data); } catch { /* ignore */ } }

  /** Applique une ou plusieurs opérations : écran immédiat, file d'attente, envoi. */
  async apply(...ops) {
    for (const o of ops) {
      const op = { opId: L.uid('OP'), seq: Date.now() + Math.random(), ...o };
      applyOp(this.data, op);
      this.queue.push(op);
      try { await idb.queuePut(op); } catch { /* ignore */ }
    }
    await this.save();
    this.emit('change');
    this.flush();
  }

  async flush() {
    if (this.flushing || !this.configured) return;
    this.flushing = true;
    try {
      while (this.queue.length) {
        const op = this.queue[0];
        this.setStatus('syncing');
        let res;
        try { res = await this.call(op.action, op.payload); } catch (err) {
          this.setStatus('offline', String(err.message || err));
          return;
        }
        if (!res || !res.ok) {
          if (res && res.error === 'unauthorized') { this.setStatus('auth'); return; }
          if (res && res.error === 'busy') { this.setStatus('offline', 'Serveur occupé, nouvel essai bientôt'); return; }
          // Erreur définitive sur cette opération : on la met de côté pour ne pas bloquer la file.
          console.error('Opération refusée', op, res);
          op.failed = (op.failed || 0) + 1;
          if (op.failed < 3) { this.setStatus('error', res && res.error); return; }
        }
        this.queue.shift();
        try { await idb.queueDel(op.opId); } catch { /* ignore */ }
        this.emit('queue');
      }
      this.lastSync = new Date().toISOString(); LS.set('lastSync', this.lastSync);
      this.setStatus('idle');
    } finally { this.flushing = false; }
  }

  /** Recharge tout depuis le serveur, puis ré-applique ce qui n'est pas encore envoyé. */
  async refresh() {
    if (!this.configured) return;
    await this.flush();
    this.setStatus('syncing');
    let res;
    try { res = await this.call('getAll', {}); } catch (err) { this.setStatus('offline', String(err.message || err)); return; }
    if (!res.ok) { this.setStatus(res.error === 'unauthorized' ? 'auth' : 'error', res.error); return; }
    const data = { prospects: res.prospects || [], events: res.events || [], config: res.config || {} };
    for (const op of this.queue) applyOp(data, op);
    this.data = data;
    await this.save();
    this.lastSync = new Date().toISOString(); LS.set('lastSync', this.lastSync);
    this.setStatus(this.queue.length ? 'offline' : 'idle');
    this.emit('change');
    if (this.queue.length) this.flush();
  }

  async sync(force = false) {
    if (this.queue.length) await this.flush();
    if (force || !this.lastRefresh || Date.now() - this.lastRefresh > 60000) { this.lastRefresh = Date.now(); await this.refresh(); }
  }
}
