// Génère demo/demo-prospects.csv : 60 prospects FICTIFS (noms inventés, numéros +237 600 000 0xx non attribués).
import { writeFileSync } from 'node:fs';
const prenoms = ['Alain', 'Brice', 'Carine', 'Didier', 'Estelle', 'Fabrice', 'Gisèle', 'Hervé', 'Inès', 'Joël', 'Karine', 'Léon', 'Mireille', 'Noël', 'Odile', 'Patrice', 'Rose', 'Serge', 'Thérèse', 'Ulrich'];
const noms = ['Exemple', 'Fictif', 'Démo', 'Testeur', 'Modèle', 'Essai'];
const civ = ['Monsieur', 'Madame', '', 'Dr', ''];
const secteurs = [['BTP', 'la construction'], ['Restauration', 'votre restaurant'], ['Beauté', 'votre salon'], ['Commerce', 'votre boutique'], ['Santé', 'votre cabinet'], ['Transport', 'vos services de transport']];
const villes = [['Douala', 'Cameroun'], ['Yaoundé', 'Cameroun'], ['Bafoussam', 'Cameroun'], ['Abidjan', 'Côte d\'Ivoire'], ['Libreville', 'Gabon']];
const rows = [['ID', 'Priorité', 'Nom', 'Secteur', 'Ville', 'Pays', 'Numéro WhatsApp', 'Code visuel', 'Activité', 'Message préparé']];
for (let i = 1; i <= 60; i++) {
  const s = secteurs[i % secteurs.length]; const v = villes[i % villes.length];
  const nom = `${civ[i % civ.length]} ${prenoms[i % prenoms.length]} ${noms[i % noms.length]}`.trim();
  const visuel = i % 4 === 0 ? '' : `V${(i % 3) + 1}`;
  const num = i % 17 === 0 ? 'à vérifier' : `+237 600 000 ${String(i).padStart(3, '0')}`;
  const msg = i % 2 ? `Bonjour ${nom}, membre PROPULSION : -65 % sur votre site web pour ${s[1]}. Je vous montre un exemple ? (message de démonstration)` : '';
  rows.push([`DEMO-${String(i).padStart(3, '0')}`, String(1 + (i % 5)), nom, s[0], v[0], v[1], num, visuel, s[1], msg]);
}
const esc = (c) => (/[;"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
writeFileSync(new URL('../demo/demo-prospects.csv', import.meta.url), '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n') + '\r\n');
console.log(`${rows.length - 1} prospects fictifs écrits.`);
