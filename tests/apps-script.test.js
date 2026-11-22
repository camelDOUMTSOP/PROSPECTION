import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGAS } from './gas-mock.js';
import * as L from '../logic.js';

function loadDemoProspects(g) {
  const rows = L.parseCSV(readFileSync(new URL('../demo/demo-prospects.csv', import.meta.url), 'utf8'));
  const sh = g.sheets.get('Prospects');
  sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  return rows.length - 1;
}

test('Apps Script : installation, jeton, ajout sans doublon, lecture, suppression, lot', () => {
  const g = createGAS();
  g.api.setup();
  const token = g.token();
  assert.ok(token && token.length >= 32, 'jeton généré');
  assert.equal(g.post({ token: 'faux', action: 'getAll' }).error, 'unauthorized');
  assert.equal(g.post({ action: 'getAll' }).error, 'unauthorized');
  const n = loadDemoProspects(g);

  const all0 = g.post({ token, action: 'getAll' });
  assert.equal(all0.prospects.length, n);
  assert.equal(all0.prospects[0].numero, '+237 600 000 001');
  assert.ok(!('jeton' in all0.config), 'le jeton ne sort jamais');

  const e1 = { id: 'EV-1', type: 'contact', date: '2026-11-20', heure: '09:30', prospect_id: 'DEMO-001', numero_relance: 0, prochaine_relance: '2026-11-22', lot_id: 'LOT-A', montant: '' };
  const e2 = { ...e1, id: 'EV-2', prospect_id: 'DEMO-002' };
  let r = g.post({ token, action: 'addEvents', payload: { events: [e1, e2, e1] } });
  assert.deepEqual([r.added, r.skipped], [2, 1]);
  r = g.post({ token, action: 'addEvents', payload: { events: [e1] } });
  assert.deepEqual([r.added, r.skipped], [0, 1], 'renvoi après coupure réseau : pas de doublon');

  const all = g.post({ token, action: 'getAll' });
  assert.equal(all.events.length, 2);
  assert.equal(all.events[0].prochaine_relance, '2026-11-22');
  assert.equal(all.events[0].numero_relance, 0);

  r = g.post({ token, action: 'addEvents', payload: { events: [{ id: 'EV-3', type: 'paiement', date: '2026-11-21', prospect_id: 'NEW-x', montant: 50000, lot_id: 'LOT-B' }] } });
  assert.equal(r.added, 1);
  assert.equal(g.post({ token, action: 'deleteEvents', payload: { ids: ['EV-2'] } }).deleted, 1);
  assert.equal(g.post({ token, action: 'deleteLot', payload: { lot_id: 'LOT-B' } }).deleted, 1);
  assert.deepEqual(g.post({ token, action: 'getAll' }).events.map((e) => e.id), ['EV-1']);

  r = g.post({ token, action: 'addProspects', payload: { prospects: [{ id: 'NEW-1', nom: 'Nouveau Fictif', numero: '600000999' }, { id: 'DEMO-001', nom: 'doublon' }] } });
  assert.deepEqual([r.added, r.skipped], [1, 1]);
  assert.equal(g.post({ token, action: 'getAll' }).prospects.length, n + 1);

  r = g.post({ token, action: 'updateConfig', payload: { values: { objectif_jour: '40', jeton: 'pirate' } } });
  assert.equal(r.updated, 1);
  assert.equal(g.token(), token, 'le jeton ne peut pas être modifié par l\'API');
  assert.equal(g.post({ token, action: 'getAll' }).config.objectif_jour, '40');

  // Agenda : rendez-vous et fin de suivi créés à l'enregistrement
  g.post({ token, action: 'addEvents', payload: { events: [
    { id: 'EV-RDV', type: 'note', date: '2026-11-22', prospect_id: 'DEMO-003', prospect_nom: 'Dr Didier Testeur', rendez_vous: '2026-11-25T10:00' },
    { id: 'EV-LIV', type: 'projet', date: '2026-11-22', prospect_id: 'DEMO-003', prospect_nom: 'Dr Didier Testeur', statut_projet: 'Livré', date_livraison: '2026-11-22', duree_suivi_mois: 2 },
  ] } });
  assert.deepEqual(g.calendar.map((e) => e.title), ['Rendez-vous : Dr Didier Testeur', 'Fin de suivi : Dr Didier Testeur']);
  assert.equal(g.api.selfTest(), true);
});

test('Apps Script : récapitulatif quotidien cohérent avec l\'application', () => {
  const g = createGAS();
  g.api.setup();
  const token = g.token();
  loadDemoProspects(g);
  const cfg = L.parseConfig({});
  const today = L.todayISO();
  const evs = [];
  const mk = (pid, type, date, extra) => evs.push({ id: L.uid(), type, date, heure: '10:00', prospect_id: pid, cree_le: new Date().toISOString(), ...extra });
  mk('DEMO-001', 'contact', L.addDays(today, -5), { numero_relance: 0, prochaine_relance: L.addDays(today, -3) });
  mk('DEMO-002', 'contact', L.addDays(today, -2), { numero_relance: 0, prochaine_relance: today });
  mk('DEMO-003', 'contact', L.addDays(today, -2), { numero_relance: 0, prochaine_relance: today });
  mk('DEMO-003', 'reply', L.addDays(today, -1), { etiquette: 'Intéressé' });
  mk('DEMO-004', 'contact', L.addDays(today, -9), { numero_relance: 0, prochaine_relance: L.addDays(today, -7) });
  mk('DEMO-004', 'note', L.addDays(today, -8), { etape: L.ETAPES.REFUS });
  mk('DEMO-005', 'paiement', L.addDays(today, -60), { type_paiement: 'Acompte', montant: 100000 });
  mk('DEMO-005', 'devis', L.addDays(today, -61), { montant: 300000 });
  mk('DEMO-005', 'projet', L.addDays(today, -55), { statut_projet: 'Livré', date_livraison: L.addMonths(L.addDays(today, 3), -2), duree_suivi_mois: 2 });
  mk('DEMO-006', 'sav', L.addDays(today, -4), { type_sav: 'Correction', statut_sav: 'Ouvert' });
  mk('DEMO-006', 'paiement', L.addDays(today, -30), { type_paiement: 'Paiement total', montant: 200000 });
  g.post({ token, action: 'addEvents', payload: { events: evs } });
  g.calendar.length = 0;
  g.post({ token, action: 'updateConfig', payload: { values: { app_url: 'https://exemple.github.io/prospection/' } } });

  const d = g.api.dailyDigest();
  const all = g.post({ token, action: 'getAll' });
  const { list } = L.deriveAll(L.prepareProspects(all.prospects), all.events, cfg, today);
  const app = L.relancesDues(list, today);
  assert.deepEqual([...d.relances.map((r) => r.nom)].sort(), [...app.overdue, ...app.today].map((x) => x.p.nom).sort());
  assert.equal(d.relances.length, 2);
  assert.equal(g.mails.length, 1);
  assert.match(g.mails[0].subject, /^Aujourd'hui : 2 relances, \d+ nouveaux prospects, 3 clients à suivre$/);
  const cal = g.calendar.filter((e) => /^Relances du jour/.test(e.title));
  assert.equal(cal.length, 1); assert.equal(cal[0].title, 'Relances du jour : 2');
  assert.match(cal[0].opts.description, /exemple\.github\.io/);
  g.api.dailyDigest();
  assert.equal(g.calendar.filter((e) => /^Relances du jour/.test(e.title)).length, 1, 'pas de doublon dans l\'agenda');
});

test('Apps Script : contacts Google (People API) pour les nouveaux prospects', () => {
  const g = createGAS();
  g.api.setup();
  const token = g.token();
  loadDemoProspects(g);
  const now = new Date().toISOString();
  // Un contact existe déjà avec ce numéro (importé par CSV) : pas de doublon.
  g.people.contacts.push({ resourceName: 'people/old', phoneNumbers: [{ value: '+237 600 000 777', canonicalForm: '+237600000777' }] });
  const r = g.post({ token, action: 'addProspects', payload: { prospects: [
    { id: 'NEW-A', nom: 'Monsieur Jean Fictif', numero: '600000555', secteur: 'BTP', cree_le: now },
    { id: 'NEW-B', nom: 'Doublon Fictif', numero: '+237600000777', cree_le: now },
    { id: 'NEW-C', nom: 'Sans Numéro', numero: 'à vérifier', cree_le: now },
  ] } });
  assert.equal(r.added, 3);
  assert.equal(r.contacts.created, 1);
  assert.equal(g.people.contacts.length, 2);
  const c = g.people.contacts[1];
  assert.equal(c.names[0].givenName, 'Jean Fictif (propulsion)');
  assert.equal(c.phoneNumbers[0].value, '+237600000555');
  const group = g.people.groups.find((x) => x.name === 'PROPULSION');
  assert.ok(group); assert.deepEqual([...g.people.members[group.resourceName]], [c.resourceName]);
  const ps = g.post({ token, action: 'getAll' }).prospects;
  const st = (id) => ps.find((p) => p.id === id).contact_google;
  assert.match(st('NEW-A'), /^créé le/); assert.equal(st('NEW-B'), 'déjà présent'); assert.equal(st('NEW-C'), 'non : numéro à vérifier');
  assert.equal(st('DEMO-001'), '', 'les prospects du fichier maître ne sont pas touchés');

  // Option « seulement quand le prospect répond »
  g.post({ token, action: 'updateConfig', payload: { values: { contact_seulement_reponse: 'oui' } } });
  g.post({ token, action: 'addProspects', payload: { prospects: [
    { id: 'NEW-D', nom: 'Rose Fictive', numero: '600000556', cree_le: now },
    { id: 'NEW-E', nom: 'Refus Fictif', numero: '600000557', cree_le: now },
  ] } });
  assert.equal(g.people.contacts.length, 2, 'pas encore de contact tant qu\'il n\'a pas répondu');
  g.post({ token, action: 'addEvents', payload: { events: [
    { id: 'EV-R1', type: 'note', date: '2026-11-20', prospect_id: 'NEW-E', etape: 'Refus complet : ne plus contacter' },
    { id: 'EV-R2', type: 'reply', date: '2026-11-21', prospect_id: 'NEW-D', etiquette: 'Intéressé' },
  ] } });
  assert.equal(g.people.contacts.length, 3);
  assert.equal(g.people.contacts[2].names[0].givenName, 'Rose Fictive (propulsion)');
  // Un refus n'est jamais enregistré, même via le menu de rattrapage.
  g.post({ token, action: 'updateConfig', payload: { values: { contact_seulement_reponse: 'non' } } });
  g.api.syncMissingContacts();
  assert.equal(g.people.contacts.length, 3);
});
