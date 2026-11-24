import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../logic.js';

const cfg = L.parseConfig({});
const P = L.prepareProspects([
  { id: 'P1', nom: 'Ali Moussa', ville: 'Douala', secteur: 'BTP', numero: '600000001', priorite: '2' },
  { id: 'P2', nom: 'Ali Kamga', ville: 'Yaoundé', secteur: 'Commerce', numero: '+237 600 00 00 02', priorite: '1' },
  { id: 'P3', nom: 'Alain Ngono', ville: 'Douala', numero: '600000003' },
  { id: 'P4', nom: 'Koogg', ville: 'Kribi', numero: 'à vérifier' },
  { id: 'P5', nom: 'Stéphane Éboa', ville: 'Bafoussam', numero: '00237 600 11 22 33' },
  { id: 'P6', nom: 'Ali et Fils', ville: 'Douala', numero: '600000006' },
]);

test('normalisation et recherche insensible aux accents', () => {
  assert.equal(L.norm('Stéphane ÉBOA'), 'stephane eboa');
  assert.deepEqual(L.searchProspects(P, 'stephane').map((p) => p.id), ['P5']);
  assert.deepEqual(L.searchProspects(P, 'ali douala').map((p) => p.id).sort(), ['P1', 'P6']);
  assert.deepEqual(L.searchProspects(P, 'monsieur eboa').map((p) => p.id), ['P5']);
});

test('épellation et découpage', () => {
  assert.equal(L.joinSpelled('K-O-O-G-G'), 'KOOGG');
  assert.equal(L.joinSpelled('Monsieur K. O. O. G. G.'), 'Monsieur KOOGG');
  assert.equal(L.joinSpelled('Jean-Paul'), 'Jean-Paul');
  const r = L.resolveNames(P, 'Monsieur Ali, Alain et K-O-O-G-G ; Ali et Fils\nmadame inconnue');
  assert.deepEqual(r.map((x) => x.status), ['multi', 'ok', 'ok', 'ok', 'none']);
  assert.equal(r[0].candidates.length, 3);
  assert.equal(r[1].prospect.id, 'P3');
  assert.equal(r[2].prospect.id, 'P4');
  assert.equal(r[3].prospect.id, 'P6');
});

test('téléphone', () => {
  assert.equal(L.phoneInfo('600000001').wa, '237600000001');
  assert.equal(L.phoneInfo('+237 600 00 00 02').wa, '237600000002');
  assert.equal(L.phoneInfo('00237 600 11 22 33').wa, '237600112233');
  assert.equal(L.phoneInfo('à vérifier').ok, false);
  assert.equal(L.phoneInfo('1234').ok, false);
});

test('dates', () => {
  assert.equal(L.addDays('2026-02-27', 3), '2026-03-02');
  assert.equal(L.addMonths('2026-12-31', 2), '2027-02-28');
  assert.equal(L.parseDateFR('12/11/2026'), '2026-11-12');
  assert.equal(L.parseDateFR('5/1/26'), '2026-01-05');
  assert.equal(L.parseDateFR('46000'), '2025-12-09');
  assert.equal(L.roundHalfHour('08:44'), '08:30');
  assert.equal(L.roundHalfHour('08:46'), '09:00');
  assert.equal(L.roundHalfHour('23:50'), '23:30');
  assert.equal(L.fmtDate('2026-11-05'), '05/11/2026');
});

const ev = (type, date, extra = {}) => ({ id: L.uid(), type, date, heure: '10:00', prospect_id: 'P1', cree_le: date + 'T10:00:00Z', ...extra });

test('état déduit et relances', () => {
  const p = P[0];
  let d = L.deriveProspect(p, [], cfg, '2026-11-22');
  assert.equal(d.state, 'a_contacter');
  const c0 = ev('contact', '2026-11-10', { numero_relance: 0, prochaine_relance: L.nextRelanceDate('2026-11-10', 0, cfg) });
  d = L.deriveProspect(p, [c0], cfg, '2026-11-22');
  assert.equal(d.state, 'contacte'); assert.equal(d.nextRelance, '2026-11-12'); assert.ok(d.due && d.overdue); assert.equal(d.nextNum, 1);
  const c1 = ev('contact', '2026-11-12', { numero_relance: 1, prochaine_relance: '2026-11-15' });
  d = L.deriveProspect(p, [c1, c0], cfg, '2026-11-15');
  assert.ok(d.due && !d.overdue); assert.equal(d.nbRelances, 1);
  const r = ev('reply', '2026-11-16', { etiquette: 'Intéressé' });
  d = L.deriveProspect(p, [c0, c1, r], cfg, '2026-11-22');
  assert.equal(d.state, 'conversation'); assert.equal(d.due, false); assert.equal(d.etiquette, 'Intéressé');
  const refus = ev('note', '2026-11-17', { etape: L.ETAPES.REFUS });
  d = L.deriveProspect(p, [c0, c1, r, refus], cfg, '2026-11-22');
  assert.equal(d.state, 'refus');
  const pay = ev('paiement', '2026-11-20', { type_paiement: 'Acompte', montant: 50000 });
  d = L.deriveProspect(p, [c0, c1, r, refus, pay], cfg, '2026-11-22');
  assert.equal(d.state, 'acompte'); assert.ok(d.isClient);
  // après R4 : clôturé
  const evs = [0, 1, 2, 3, 4].map((n) => ev('contact', `2026-10-0${n + 1}`, { numero_relance: n, prochaine_relance: L.nextRelanceDate(`2026-10-0${n + 1}`, n, cfg) }));
  d = L.deriveProspect(p, evs, cfg, '2026-11-22');
  assert.equal(d.state, 'cloture'); assert.equal(d.due, false);
  // recontact manuel
  d = L.deriveProspect(p, [...evs, ev('note', '2026-11-01', { etape: L.ETAPES.RECONTACTER, prochaine_relance: '2026-11-20' })], cfg, '2026-11-22');
  assert.equal(d.due, true);
  // paiement sans aucun autre événement (§4.1 bis)
  d = L.deriveProspect(p, [ev('paiement', '2026-11-18', { type_paiement: 'Paiement total', montant: 120000 })], cfg, '2026-11-22');
  assert.equal(d.state, 'paye'); assert.equal(d.reste, 0);
});

test('client : reste, factures, suivi, SAV', () => {
  const p = P[1];
  const e = [
    ev('devis', '2026-09-01', { montant: 300000, prospect_id: 'P2' }),
    ev('paiement', '2026-09-03', { type_paiement: 'Acompte', montant: 100000 }),
    ev('facture', '2026-09-03', { numero_facture: '2026-008', montant: 300000, statut_facture: 'émise' }),
    ev('projet', '2026-10-01', { statut_projet: 'Livré', date_livraison: '2026-10-01', duree_suivi_mois: 2 }),
  ];
  const s1 = ev('sav', '2026-11-10', { type_sav: 'Correction', statut_sav: 'Ouvert', description_sav: 'Lien cassé' });
  e.push(s1);
  let d = L.deriveProspect(p, e, cfg, '2026-11-22');
  assert.equal(d.reste, 200000); assert.equal(d.finSuivi, '2026-12-01'); assert.equal(d.joursSuivi, 9);
  assert.equal(d.savOpen.length, 1); assert.equal(d.clientStatus, 'suivi');
  e.push(ev('sav', '2026-11-12', { ref_id: s1.id, statut_sav: 'Résolu' }));
  d = L.deriveProspect(p, e, cfg, '2026-12-05');
  assert.equal(d.savOpen.length, 0); assert.equal(d.clientStatus, 'termine');
  assert.equal(L.nextInvoiceNumber(e, 2026), '2026-009');
});

test('rattrapage : 3e relance faite il y a des jours', () => {
  const d0 = L.deriveProspect(P[4], [], cfg, '2026-11-22');
  const evs = L.buildCatchupEvents(d0, { nbMessages: 4, dateDernier: '2026-11-20', lotId: 'LOT-1' }, cfg, '2026-11-22');
  assert.equal(evs.length, 4);
  assert.deepEqual(evs.map((e) => e.date), ['2026-11-10', '2026-11-12', '2026-11-15', '2026-11-20']);
  const d = L.deriveProspect(P[4], evs, cfg, '2026-11-22');
  assert.equal(d.state, 'contacte'); assert.equal(d.nbRelances, 3); assert.equal(d.nextRelance, '2026-11-27');
  const evs2 = L.buildCatchupEvents(d0, { nbMessages: 1, dateDernier: '2026-11-12', repondu: true, etiquette: 'Intéressé', devisMontant: 250000, prochaineRelance: '2026-11-25' }, cfg, '2026-11-22');
  const d2 = L.deriveProspect(P[4], evs2, cfg, '2026-11-25');
  assert.equal(d2.state, 'devis'); assert.equal(d2.due, true);
});

test('modèles de message et vCard', () => {
  const p = { nom: 'Monsieur Stéphane Éboa', activite: 'la menuiserie', numero: '600112233' };
  assert.equal(L.renderTemplate('Bonjour {civilité} {nom_complet}, pour {activité} !', p), 'Bonjour Monsieur Stéphane Éboa, pour la menuiserie !');
  assert.equal(L.renderTemplate('Bonjour {civilité} {prénom},', { nom: 'Koogg' }), 'Bonjour Koogg,');
  const v = L.buildVCard([p, { nom: 'X', numero: 'à vérifier' }], '{prénom} {nom} (propulsion)', '237');
  assert.match(v, /FN:Stéphane Éboa \(propulsion\)/); assert.match(v, /TEL;TYPE=CELL:\+237600112233/);
  assert.equal((v.match(/BEGIN:VCARD/g) || []).length, 1);
});

test('CSV', () => {
  const rows = L.parseCSV('﻿nom;note\n"Ali; fils";"dit ""oui"""\n');
  assert.deepEqual(rows, [['nom', 'note'], ['Ali; fils', 'dit "oui"']]);
  assert.equal(L.toCSV([['a;b', 'c']]), '"a;b";c');
  assert.equal(L.parseMoney('150 000 FCFA'), 150000);
  assert.equal(L.parseMoney('150k'), 150000);
});

test('bilan', () => {
  const e = [ev('contact', '2026-11-01', { numero_relance: 0, modele: 'Modèle 1', heure: '09:00', visuel: 'V1' }), ev('reply', '2026-11-02', { etiquette: 'Intéressé' })];
  const { list } = L.deriveAll(P, e, cfg, '2026-11-22');
  const s = L.computeStats(list, e, cfg);
  assert.equal(s.tiles.contactes, 1); assert.equal(s.tiles.tauxReponse, 100);
  assert.equal(s.moment[0].key, 'Matin (avant 12 h)');
  assert.equal(s.beforeR1, 1);
});

test('liens WhatsApp ciblés et comptes', () => {
  const c = L.parseConfig({});
  assert.equal(c.appOf('Business 2'), 'business'); assert.equal(c.appOf('Messenger'), 'messenger');
  assert.deepEqual(L.sameAppAccounts('Business 1', c), ['Business 2']);
  assert.deepEqual(L.sameAppAccounts('Messenger', c), []);
  const l = L.waAppLink('237600000001', 'Bonjour & merci', 'business');
  assert.equal(l, 'intent://send?phone=237600000001&text=Bonjour%20%26%20merci#Intent;scheme=whatsapp;package=com.whatsapp.w4b;S.browser_fallback_url=https%3A%2F%2Fwa.me%2F237600000001%3Ftext%3DBonjour%2520%2526%2520merci;end');
  assert.match(L.waAppLink('237600000001', 'x', 'messenger', 'smsto'), /^intent:\/\/send\/\?phone=237600000001&text=x#Intent;scheme=smsto;package=com\.whatsapp;/);
  assert.equal(L.waAppLink('237600000001', 'x', 'business', 'wame'), 'https://wa.me/237600000001?text=x');
  const ch = L.waAppLink('237600000001', 'x', 'business', 'choix');
  assert.equal(ch, 'intent://send?phone=237600000001&text=x#Intent;scheme=whatsapp;S.browser_fallback_url=https%3A%2F%2Fwa.me%2F237600000001%3Ftext%3Dx;end');
  assert.ok(!ch.includes('package='), 'aucune application imposée : Android propose le choix');
  const c2 = L.parseConfig({ applis_comptes: 'Business 1: business | Business 2: messenger' });
  assert.equal(c2.appOf('Business 2'), 'messenger');
});
