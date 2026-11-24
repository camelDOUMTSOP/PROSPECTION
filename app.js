// Interface de l'application de suivi de prospection (JavaScript natif, sans build).
import * as L from './logic.js';
import { Store, LS } from './store.js';

const { T, ETAPES } = L;
const store = new Store();
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

// ------------------------------------------------------------------ état global
let cfg = L.parseConfig({});
let P = [];                       // prospects préparés pour la recherche
let D = { list: [], map: new Map() }; // état déduit de chaque prospect
let today = L.todayISO();
let tab = LS.get('tab', 'today');
const ui = { suiviFilter: 'en_cours', suiviQuery: '', suiviLimit: 80, clientFilter: 'tous', envoiStatut: 'a_envoyer', envoiBloc: null, envoiOpen: null, envoiQuery: '' };

function recompute() {
  today = L.todayISO();
  cfg = L.parseConfig(store.data.config);
  P = L.prepareProspects(store.data.prospects);
  D = L.deriveAll(P, store.data.events, cfg, today);
  updateBadges();
}

// ------------------------------------------------------------------ petites aides d'interface
const ICON = {
  wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .3-3.4-.7a11.6 11.6 0 0 1-4.6-4.1 5.2 5.2 0 0 1-1.1-2.8 3 3 0 0 1 1-2.2c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.9 2c0 .2.1.4 0 .5l-.4.6-.4.4c-.1.2-.3.3-.1.6a8.7 8.7 0 0 0 1.6 2 7.9 7.9 0 0 0 2.3 1.4c.3.1.5.1.6-.1l1-1.1c.2-.3.4-.2.6-.1l1.9.9.6.3c.1.2.1.7-.1 1.4Z"/></svg>',
  mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v7a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V22h2v-3.1a7 7 0 0 0 6-6.9h-2Z"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20v-2Z"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 16.2-4.2-4.2-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z"/></svg>',
};
const pill = (text, tone = '') => `<span class="pill ${tone}">${esc(text)}</span>`;
const statePill = (d) => pill(d.stateLabel, d.tone);
const fmtD = (iso) => L.fmtDate(iso);
const plural = (n, s, p) => `${n} ${n > 1 ? (p || `${s}s`) : s}`;

function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove('show'), ms);
}

/** Boîte de dialogue simple. buttons : [{label, value, cls}] ; retourne la valeur choisie (ou null). */
function dialog({ title = '', body = '', buttons = [{ label: 'OK', value: true, cls: 'primary' }], mount } = {}) {
  return new Promise((resolve) => {
    const m = $('#modal');
    m.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      ${title ? `<h3>${esc(title)}</h3>` : ''}<div class="modal-body">${body}</div>
      <div class="modal-actions">${buttons.map((b, i) => `<button type="button" class="btn ${b.cls || ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}
      <button type="button" class="btn ghost" data-i="-1">Annuler</button></div></div>`;
    m.hidden = false;
    const close = (v) => { m.hidden = true; m.innerHTML = ''; resolve(v); };
    m.onclick = (e) => {
      if (e.target === m) return close(null);
      const b = e.target.closest('[data-i]'); if (!b) return;
      const i = Number(b.dataset.i);
      if (i < 0) return close(null);
      const v = buttons[i].value;
      close(typeof v === 'function' ? v(m) : v);
    };
    mount?.(m);
    setTimeout(() => (m.querySelector('input,textarea') || m.querySelector('.btn'))?.focus(), 30);
  });
}
const confirmBox = (title, body, label = 'Confirmer', cls = 'danger') => dialog({ title, body: `<p>${body}</p>`, buttons: [{ label, value: true, cls }] }).then(Boolean);

function download(name, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.append(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  }
}

// ------------------------------------------------------------------ dictée vocale
function micBtn() { return SR ? `<button type="button" class="mic" data-mic aria-label="Dicter">${ICON.mic}</button>` : ''; }
const MIC_HINT = SR ? '' : '<p class="hint">Astuce : utilise le micro de ton clavier pour dicter.</p>';
let activeRec = null;
function startDictation(btn) {
  const field = btn.parentElement.querySelector('textarea, input');
  if (!field) return;
  if (activeRec) { activeRec.stop(); return; }
  const rec = new SR();
  rec.lang = 'fr-FR'; rec.interimResults = true; rec.maxAlternatives = 1; rec.continuous = false;
  const base = field.value;
  const sep = base && !/[\s,;]$/.test(base) ? (field.dataset.multi ? ', ' : ' ') : '';
  let finalText = '';
  rec.onresult = (ev) => {
    let interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      if (ev.results[i].isFinal) finalText += ev.results[i][0].transcript; else interim += ev.results[i][0].transcript;
    }
    field.value = base + sep + finalText + interim;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  };
  rec.onerror = (ev) => { if (ev.error === 'not-allowed') toast('Micro refusé : autorise-le dans Chrome, ou utilise le micro du clavier.'); };
  rec.onend = () => {
    btn.classList.remove('rec'); activeRec = null;
    field.value = (base + sep + finalText).trim() || base;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new CustomEvent('dictation-end', { bubbles: true }));
  };
  try { rec.start(); activeRec = rec; btn.classList.add('rec'); } catch { toast('Dictée indisponible.'); }
}

// ------------------------------------------------------------------ superpositions (fiches, formulaires)
const overlays = [];
function openOverlay({ html, mount, refresh, cls = '' }) {
  const el = document.createElement('section');
  el.className = `overlay ${cls}`;
  el.innerHTML = html;
  $('#overlays').append(el);
  const ov = { el, refresh };
  overlays.push(ov);
  history.pushState({ ov: overlays.length }, '');
  document.body.classList.add('has-overlay');
  mount?.(el, ov);
  el.scrollTop = 0;
  return ov;
}
function closeOverlay() { if (overlays.length) history.back(); }
window.addEventListener('popstate', () => {
  if (!$('#modal').hidden) { $('#modal').hidden = true; $('#modal').innerHTML = ''; }
  const ov = overlays.pop();
  if (ov) ov.el.remove();
  if (!overlays.length) document.body.classList.remove('has-overlay');
  else overlays[overlays.length - 1].refresh?.();
});
const ovHead = (title, extra = '') => `<header class="ov-head"><button type="button" class="icon-btn" data-act="close" aria-label="Retour">${ICON.back}</button><h2>${esc(title)}</h2>${extra}</header>`;

// ------------------------------------------------------------------ sélecteur de prospects
class Picker {
  constructor(root, { multi = false, initial = [], onChange = () => {}, label = '' } = {}) {
    Object.assign(this, { root, multi, onChange, label });
    this.selected = []; this.pending = []; this.created = [];
    root.innerHTML = `<div class="pk-selected"></div><div class="pk-pending"></div>
      <div class="pk-inputrow field-row">
        ${multi ? `<textarea class="pk-input" data-multi="1" rows="2" placeholder="Tape ou dicte : « Monsieur Ali, Alain et Koogg »" autocomplete="off"></textarea>`
          : '<input class="pk-input" type="search" placeholder="Rechercher un prospect (nom, ville, numéro…)" autocomplete="off">'}
        ${micBtn()}
      </div>
      ${multi ? '<button type="button" class="btn pk-resolve">Ajouter ces noms</button>' : ''}
      <div class="pk-results" role="listbox"></div>`;
    this.input = $('.pk-input', root);
    this.input.addEventListener('input', () => this.search());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (this.multi) this.resolve();
        else { const first = $('.pk-results [data-pick]', root); if (first) first.click(); }
      }
    });
    this.input.addEventListener('dictation-end', () => (this.multi ? this.resolve() : this.search()));
    root.addEventListener('click', (e) => this.onClick(e));
    for (const id of initial) { const p = this.find(id); if (p) this.add(p, true); }
    this.render();
  }
  all() { return this.created.length ? P.concat(this.created) : P; }
  find(id) { return this.all().find((p) => p.id === id); }
  add(p, silent) {
    if (!this.multi) this.selected = [];
    if (!this.selected.some((x) => x.id === p.id)) this.selected.push(p);
    if (!silent) { this.render(); this.onChange(this.selected); }
  }
  fragment() {
    const v = this.input.value;
    if (!this.multi) return v;
    const parts = v.split(/[,;\n]|\s+et\s+/i);
    return parts[parts.length - 1];
  }
  search() {
    const box = $('.pk-results', this.root);
    const q = this.fragment().trim();
    if (q.length < 2) { box.innerHTML = ''; return; }
    const res = L.searchProspects(this.all(), q, { limit: 8 });
    box.innerHTML = res.map((p) => this.itemHtml(p)).join('')
      + (!this.multi && !res.length ? this.newHtml(q, -1) : '')
      + (!res.length && this.multi ? '<p class="muted small">Aucun résultat. Appuie sur « Ajouter ces noms » pour créer un nouveau prospect.</p>' : '');
  }
  itemHtml(p, extra = '') {
    const d = D.map.get(p.id);
    const tone = d && d.refus ? 'bad' : '';
    return `<button type="button" class="pk-item ${tone}" data-pick="${esc(p.id)}" ${extra}>
      <b>${esc(p.nom)}</b><span>${esc([p.ville, p.secteur].filter(Boolean).join(' · '))}</span>
      ${d ? pill(d.refus ? 'Ne pas contacter' : d.stateLabel, d.tone) : pill('Nouveau', 'info')}</button>`;
  }
  newHtml(name, idx) {
    return `<div class="pk-new" data-idx="${idx}"><p>« ${esc(name)} » n'existe pas encore.</p>
      <div class="field-row"><input class="pk-newname" value="${esc(name)}" aria-label="Nom du nouveau prospect">
      <input class="pk-newphone" inputmode="tel" placeholder="N° WhatsApp (facultatif)" aria-label="Numéro WhatsApp"></div>
      <div class="btn-row"><button type="button" class="btn primary" data-create="${idx}">Ajouter comme nouveau prospect</button>
      ${idx >= 0 ? `<button type="button" class="btn ghost" data-skip="${idx}">Ignorer</button>` : ''}</div></div>`;
  }
  resolve() {
    const text = this.input.value.trim();
    if (!text) return;
    const res = L.resolveNames(this.all(), text);
    for (const r of res) {
      if (r.status === 'ok') this.add(r.prospect, true);
      else this.pending.push(r);
    }
    this.input.value = '';
    $('.pk-results', this.root).innerHTML = '';
    this.render(); this.onChange(this.selected);
  }
  createProspect(name, phone) {
    const p = {
      id: L.uid('NEW').replace(/^NEW-(\w+)-(\w{4}).*/, 'NEW-$1$2').toUpperCase(), nom: name.trim(), numero: phone.trim(),
      priorite: '', secteur: '', ville: '', pays: '', visuel: '', activite: '', message: '', cree_le: new Date().toISOString(), _new: true,
    };
    const prepared = L.prepareProspects([p])[0];
    prepared._new = true;
    this.created.push(prepared);
    return prepared;
  }
  onClick(e) {
    const t = e.target.closest('button'); if (!t || !this.root.contains(t)) return;
    if (t.classList.contains('pk-resolve')) return this.resolve();
    if (t.dataset.pick) {
      const idx = t.closest('[data-pend]')?.dataset.pend;
      const p = this.find(t.dataset.pick);
      if (idx != null) this.pending.splice(Number(idx), 1);
      if (p) {
        this.add(p, true);
        if (idx == null) {
          if (this.multi) { const v = this.input.value; const frag = this.fragment(); this.input.value = v.slice(0, v.length - frag.length).replace(/(\s+et\s*|[,;\s]*)$/i, (m) => (m.trim() ? `${m.trim()} ` : '')); }
          else this.input.value = '';
          $('.pk-results', this.root).innerHTML = '';
        }
      }
      this.render(); this.onChange(this.selected);
      return;
    }
    if (t.dataset.remove) { this.selected = this.selected.filter((x) => x.id !== t.dataset.remove); this.render(); this.onChange(this.selected); return; }
    if (t.dataset.skip != null) { this.pending.splice(Number(t.dataset.skip), 1); this.render(); return; }
    if (t.dataset.newfor != null) { this.pending[Number(t.dataset.newfor)].status = 'none'; this.render(); return; }
    if (t.dataset.create != null) {
      const box = t.closest('.pk-new');
      const name = $('.pk-newname', box).value; const phone = $('.pk-newphone', box).value;
      if (!name.trim()) return;
      const idx = Number(t.dataset.create);
      if (idx >= 0) this.pending.splice(idx, 1);
      this.add(this.createProspect(name, phone), true);
      if (!this.multi) { this.input.value = ''; $('.pk-results', this.root).innerHTML = ''; }
      this.render(); this.onChange(this.selected);
      return;
    }
    if (t.dataset.change != null) { this.selected = []; this.render(); this.input.focus(); this.onChange(this.selected); }
  }
  render() {
    const sel = $('.pk-selected', this.root);
    if (this.multi) {
      sel.innerHTML = this.selected.length ? `<p class="small muted">${plural(this.selected.length, 'prospect sélectionné', 'prospects sélectionnés')}</p><div class="chips">${this.selected.map((p) => {
        const d = D.map.get(p.id);
        const bad = d && d.refus;
        return `<span class="chip ${bad ? 'bad' : ''}">${esc(p.nom)}${p._new ? ' <i>(nouveau)</i>' : ''}${bad ? ' · Ne pas contacter' : ''}<button type="button" data-remove="${esc(p.id)}" aria-label="Retirer ${esc(p.nom)}">×</button></span>`;
      }).join('')}</div>` : '';
    } else {
      const p = this.selected[0];
      const d = p && D.map.get(p.id);
      sel.innerHTML = p ? `<div class="pk-chosen ${d && d.refus ? 'bad' : ''}"><div><b>${esc(p.nom)}</b><span class="small muted">${esc([p.ville, p.secteur].filter(Boolean).join(' · '))}</span>
        ${d ? statePill(d) : pill('Nouveau prospect', 'info')}</div><button type="button" class="btn ghost" data-change>Changer</button></div>` : '';
      $('.pk-inputrow', this.root).hidden = !!p;
      if (p) $('.pk-results', this.root).innerHTML = '';
    }
    $('.pk-pending', this.root).innerHTML = this.pending.map((r, i) => (r.status === 'multi'
      ? `<div class="pk-amb" data-pend="${i}"><p>« ${esc(r.query)} » : plusieurs prospects, lequel ?</p>${r.candidates.map((p) => this.itemHtml(p)).join('')}
         <div class="btn-row"><button type="button" class="btn ghost" data-newfor="${i}">Nouveau prospect</button><button type="button" class="btn ghost" data-skip="${i}">Ignorer</button></div></div>`
      : this.newHtml(r.query.replace(/^\s*(monsieur|madame|mme|mr|m\.|dr|mlle)\s+/i, ''), i))).join('');
  }
  /** À l'enregistrement : résout le texte restant ; retourne false s'il reste des choix à faire. */
  finalize() {
    if (this.input.value.trim() && this.multi) this.resolve();
    return this.pending.length === 0;
  }
}

// ------------------------------------------------------------------ moteur de formulaires
function chipsHtml(name, options, value) {
  return `<div class="seg" role="radiogroup">${options.map((o) => {
    const [v, lab] = Array.isArray(o) ? o : [o, o];
    return `<button type="button" role="radio" aria-checked="${String(v) === String(value)}" data-seg="${esc(name)}" data-value="${esc(v)}">${esc(lab)}</button>`;
  }).join('')}</div>`;
}
function fieldHtml(f, v) {
  const val = v[f.name] ?? '';
  const id = `f-${f.name}`;
  const lab = f.label ? `<label for="${id}">${esc(f.label)}${f.optional ? ' <span class="muted">(facultatif)</span>' : ''}</label>` : '';
  let input = '';
  switch (f.type) {
    case 'prospect': return `<div class="field" data-field="${f.name}">${f.label ? `<span class="label">${esc(f.label)}</span>` : ''}<div class="picker" data-picker="${f.name}"></div></div>`;
    case 'chips': return `<div class="field" data-field="${f.name}"><span class="label">${esc(f.label)}</span>${chipsHtml(f.name, typeof f.options === 'function' ? f.options() : f.options, val)}</div>`;
    case 'select': input = `<select id="${id}" name="${f.name}">${(typeof f.options === 'function' ? f.options() : f.options).map((o) => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(ov)}" ${String(ov) === String(val) ? 'selected' : ''}>${esc(ol)}</option>`; }).join('')}</select>`; break;
    case 'time': {
      const slots = L.timeSlots(); if (val && !slots.includes(val)) slots.push(val);
      input = `<select id="${id}" name="${f.name}"><option value="">—</option>${slots.map((s) => `<option ${s === val ? 'selected' : ''}>${s}</option>`).join('')}</select>`; break;
    }
    case 'date': input = `<input id="${id}" name="${f.name}" type="date" value="${esc(val)}">`; break;
    case 'datetime': input = `<input id="${id}" name="${f.name}" type="datetime-local" value="${esc(val)}">`; break;
    case 'money': input = `<input id="${id}" name="${f.name}" inputmode="numeric" placeholder="ex. 150 000" value="${esc(val)}" autocomplete="off"><output class="money-out" for="${id}"></output>`; break;
    case 'number': input = `<input id="${id}" name="${f.name}" type="number" inputmode="numeric" min="0" value="${esc(val)}">`; break;
    case 'textarea': input = `<div class="field-row"><textarea id="${id}" name="${f.name}" rows="${f.rows || 3}" placeholder="${esc(f.placeholder || '')}">${esc(val)}</textarea>${micBtn()}</div>`; break;
    case 'text': input = `<div class="field-row"><input id="${id}" name="${f.name}" value="${esc(val)}" placeholder="${esc(f.placeholder || '')}" autocomplete="off">${f.dictate === false ? '' : micBtn()}</div>`; break;
    case 'info': return `<div class="field info" data-field="${f.name}">${f.html(v)}</div>`;
    case 'custom': return `<div class="field" data-field="${f.name}">${f.render(v)}</div>`;
    default: break;
  }
  return `<div class="field" data-field="${f.name}">${lab}${input}${f.help ? `<p class="hint">${f.help}</p>` : ''}</div>`;
}

function openForm(def) {
  const v = { ...def.initial };
  for (const f of def.fields) if (v[f.name] === undefined && f.default !== undefined) v[f.name] = typeof f.default === 'function' ? f.default(v) : f.default;
  const pickers = {};
  const html = `${ovHead(def.title)}<form class="ov-body form" novalidate>${def.intro ? `<p class="muted">${def.intro}</p>` : ''}${MIC_HINT}
    ${def.fields.map((f) => fieldHtml(f, v)).join('')}<div class="spacer"></div></form>
    <footer class="ov-foot"><button type="button" class="btn primary big" data-submit>${esc(def.submitLabel || 'Enregistrer')}</button></footer>`;
  const ov = openOverlay({ html, cls: 'form-ov' });
  const el = ov.el;
  const ctx = {
    v, pickers, el, dirty: new Set(),
    set(name, value) {
      v[name] = value;
      const inp = el.querySelector(`[name="${name}"]`);
      if (inp) inp.value = value ?? '';
      $$(`[data-seg="${name}"]`, el).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === String(value))));
      refreshVis();
    },
    rerenderField(name) {
      const f = def.fields.find((x) => x.name === name);
      const box = el.querySelector(`[data-field="${name}"]`);
      if (f && box) { box.outerHTML = fieldHtml(f, v); refreshVis(); }
    },
  };
  const refreshVis = () => {
    for (const f of def.fields) {
      const box = el.querySelector(`[data-field="${f.name}"]`);
      if (box) box.hidden = f.show ? !f.show(v, ctx) : false;
      if (f.type === 'info' && box) box.innerHTML = f.html(v, ctx);
    }
  };
  const changed = (name) => { def.onChange?.(name, ctx); refreshVis(); };
  for (const f of def.fields.filter((x) => x.type === 'prospect')) {
    pickers[f.name] = new Picker(el.querySelector(`[data-picker="${f.name}"]`), {
      multi: f.multi, initial: [].concat(v[f.name] || []),
      onChange: (sel) => { v[f.name] = sel; changed(f.name); },
    });
    v[f.name] = pickers[f.name].selected;
  }
  def.mount?.(ctx);
  el.addEventListener('input', (e) => {
    const n = e.target.name; if (!n) return;
    v[n] = e.target.value; ctx.dirty.add(n);
    if (e.target.classList.contains('money-out') === false && e.target.nextElementSibling?.classList.contains('money-out')) {
      const m = L.parseMoney(e.target.value); e.target.nextElementSibling.textContent = m ? L.fmtFCFA(m) : '';
    }
    changed(n);
  });
  el.addEventListener('change', (e) => { const n = e.target.name; if (n) { v[n] = e.target.value; ctx.dirty.add(n); changed(n); } });
  el.addEventListener('click', async (e) => {
    const seg = e.target.closest('[data-seg]');
    if (seg) { ctx.dirty.add(seg.dataset.seg); ctx.set(seg.dataset.seg, seg.dataset.value); changed(seg.dataset.seg); return; }
    if (e.target.closest('[data-submit]')) {
      const btn = e.target.closest('[data-submit]');
      for (const pk of Object.values(pickers)) {
        if (!pk.finalize()) { toast('Choisis le bon prospect pour chaque nom (ou « Ignorer »).'); pk.root.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
        v[Object.keys(pickers).find((k) => pickers[k] === pk)] = pk.selected;
      }
      btn.disabled = true;
      try {
        const ok = await def.submit(v, ctx);
        if (ok !== false) closeOverlay();
      } catch (err) { console.error(err); toast(`Erreur : ${err.message || err}`); } finally { btn.disabled = false; }
    }
  });
  refreshVis();
  $$('.money-out', el).forEach((o) => { const inp = o.previousElementSibling; const m = L.parseMoney(inp.value); o.textContent = m ? L.fmtFCFA(m) : ''; });
  return ctx;
}

// ------------------------------------------------------------------ enregistrement
function baseEvent(type, p, v = {}) {
  const date = v.date || today; const heure = v.heure || '';
  return {
    id: L.uid(), type, date, heure, timestamp: L.isoTimestamp(date, heure), prospect_id: p.id, prospect_nom: p.nom,
    nouveau: p._new ? 'oui' : 'non', visuel: p.visuel || '', cree_le: new Date().toISOString(), lot_id: v.lot_id || '',
  };
}
function cleanProspect(p) {
  const o = {}; for (const k of ['id', 'priorite', 'nom', 'secteur', 'ville', 'pays', 'numero', 'visuel', 'activite', 'message', 'cree_le', 'lot_id']) o[k] = p[k] ?? '';
  return o;
}
async function commit(events, prospects = []) {
  const ops = [];
  const news = prospects.filter((p) => p._new && !store.data.prospects.some((x) => x.id === p.id));
  if (news.length) ops.push({ action: 'addProspects', payload: { prospects: news.map(cleanProspect) } });
  if (events.length) ops.push({ action: 'addEvents', payload: { events } });
  if (ops.length) await store.apply(...ops);
}
const derivedOf = (p) => D.map.get(p.id) || L.deriveProspect(p, [], cfg, today);
const newLotId = () => `LOT-${today.replace(/-/g, '')}-${L.uid('').slice(-6)}`;

async function checkRefus(list, action = 'lui envoyer un message') {
  const bad = list.filter((p) => D.map.get(p.id)?.refus);
  if (!bad.length) return list;
  const r = await dialog({
    title: 'Ne pas contacter',
    body: `<p><b>${bad.map((p) => esc(p.nom)).join(', ')}</b> ${bad.length > 1 ? 'ont' : 'a'} refusé tout contact. Respecte ce refus.</p><p>Veux-tu vraiment ${esc(action)} ?</p>`,
    buttons: [{ label: list.length > bad.length ? 'Les retirer et continuer' : 'Ne rien faire', value: 'skip', cls: 'primary' }, { label: 'Oui, je confirme', value: 'force', cls: 'danger' }],
  });
  if (r === 'force') return list;
  if (r === 'skip') return list.filter((p) => !bad.includes(p));
  return null;
}

// ------------------------------------------------------------------ formulaires (§4.1)
const dateFields = (withTime = true) => [
  { name: 'date', type: 'date', label: 'Date', default: () => today },
  ...(withTime ? [{ name: 'heure', type: 'time', label: 'Heure approximative', default: () => L.roundHalfHour(L.nowHM()) }] : []),
];
const prospectField = (label = 'Prospect') => ({ name: 'prospect', type: 'prospect', label });
const one = (v) => (v.prospect || [])[0];
const needOne = (v) => { const p = one(v); if (!p) { toast('Choisis un prospect.'); return null; } return p; };

const FORMS = {
  contact(initial = {}) {
    const lastCompte = LS.get('compte', cfg.comptes[0] || '');
    return openForm({
      title: 'J\'ai contacté des prospects',
      initial: { prospects: initial.pid ? [initial.pid] : [], ...initial },
      fields: [
        { name: 'prospects', type: 'prospect', multi: true, label: 'Prospects contactés' },
        { name: 'type_message', type: 'chips', label: 'Type de message', options: () => cfg.typesMessage, default: initial.type_message || 'Premier message' },
        { name: 'modele', type: 'chips', label: 'Modèle', options: () => cfg.modeles, default: LS.get('modele', cfg.modeles[0] || '') },
        { name: 'compte_whatsapp', type: 'chips', label: 'Compte WhatsApp utilisé', options: () => cfg.comptes, default: lastCompte },
        ...dateFields(),
        { name: 'prochaine_relance', type: 'date', label: 'Prochaine relance', help: 'Calculée selon les règles de relance, modifiable.' },
        { name: 'message', type: 'textarea', label: 'Texte du message', optional: true, placeholder: 'Colle ici le message envoyé', rows: 3 },
      ],
      onChange(name, ctx) {
        if (['type_message', 'date', 'prospects'].includes(name) && !ctx.dirty.has('prochaine_relance')) {
          const first = (ctx.v.prospects || [])[0];
          const prev = first ? derivedOf(first).maxNum : -1;
          ctx.set('prochaine_relance', L.nextRelanceDate(ctx.v.date || today, L.numFromTypeMessage(ctx.v.type_message, prev), cfg));
        }
      },
      mount(ctx) { ctx.set('prochaine_relance', L.nextRelanceDate(ctx.v.date, L.numFromTypeMessage(ctx.v.type_message, -1), cfg)); },
      async submit(v, ctx) {
        let list = v.prospects || [];
        if (!list.length) { toast('Ajoute au moins un prospect.'); return false; }
        list = await checkRefus(list);
        if (!list || !list.length) return false;
        LS.set('compte', v.compte_whatsapp); LS.set('modele', v.modele);
        const lot = list.length > 1 ? newLotId() : '';
        const events = list.map((p) => {
          const d = derivedOf(p);
          const num = L.numFromTypeMessage(v.type_message, d.maxNum);
          const pr = ctx.dirty.has('prochaine_relance') ? v.prochaine_relance : L.nextRelanceDate(v.date, num, cfg);
          return { ...baseEvent(T.CONTACT, p, { ...v, lot_id: lot }), type_message: v.type_message, modele: v.modele, message: v.message || '',
            numero_relance: num, prochaine_relance: pr || '', compte_whatsapp: v.compte_whatsapp };
        });
        await commit(events, list);
        toast(`${plural(events.length, 'envoi enregistré', 'envois enregistrés')}.`);
        return true;
      },
    });
  },
  reply(initial = {}) {
    return openForm({
      title: 'Il m\'a répondu',
      initial: { prospect: initial.pid ? [initial.pid] : [] },
      fields: [prospectField(),
        { name: 'etiquette', type: 'chips', label: 'Étiquette', options: () => cfg.etiquettes, default: 'Conversation en cours' },
        { name: 'note', type: 'textarea', label: 'Note', optional: true, placeholder: 'Ce qu\'il a dit…' },
        ...dateFields()],
      async submit(v) {
        const p = needOne(v); if (!p) return false;
        await commit([{ ...baseEvent(T.REPLY, p, v), etiquette: v.etiquette, note: v.note || '' }], [p]);
        toast(`Réponse de ${p.nom} enregistrée.`); return true;
      },
    });
  },
  objection(initial = {}) {
    return openForm({
      title: 'Objection',
      initial: { prospect: initial.pid ? [initial.pid] : [] },
      fields: [prospectField(),
        { name: 'objection_categorie', type: 'chips', label: 'Catégorie', options: () => cfg.objections, default: cfg.objections[0] },
        { name: 'objection_texte', type: 'textarea', label: 'Ce qu\'il a dit' },
        { name: 'resolue', type: 'chips', label: 'Résolue ?', options: L.RESOLUE, default: 'En cours' },
        { name: 'comment_resolue', type: 'textarea', label: 'Comment j\'ai répondu', optional: true },
        ...dateFields()],
      async submit(v) {
        const p = needOne(v); if (!p) return false;
        await commit([{ ...baseEvent(T.OBJECTION, p, v), objection_categorie: v.objection_categorie, objection_texte: v.objection_texte || '', resolue: v.resolue, comment_resolue: v.comment_resolue || '' }], [p]);
        toast('Objection enregistrée.'); return true;
      },
    });
  },
  devis(initial = {}) {
    return openForm({
      title: 'Devis envoyé',
      initial: { prospect: initial.pid ? [initial.pid] : [] },
      fields: [prospectField(),
        { name: 'montant', type: 'money', label: 'Montant (FCFA)', help: 'Sert aussi de montant total convenu pour le calcul du reste à payer.' },
        { name: 'note', type: 'textarea', label: 'Note', optional: true }, ...dateFields()],
      async submit(v) {
        const p = needOne(v); if (!p) return false;
        const m = L.parseMoney(v.montant); if (!m) { toast('Indique le montant.'); return false; }
        await commit([{ ...baseEvent(T.DEVIS, p, v), montant: m, note: v.note || '' }], [p]);
        toast(`Devis de ${L.fmtFCFA(m)} enregistré.`); return true;
      },
    });
  },
  paiement(initial = {}) {
    return openForm({
      title: 'Paiement reçu',
      initial: { prospect: initial.pid ? [initial.pid] : [] },
      fields: [prospectField(),
        { name: 'type_paiement', type: 'chips', label: 'Type', options: L.PAIEMENT_TYPES, default: 'Acompte' },
        { name: 'montant', type: 'money', label: 'Montant (FCFA)' },
        { name: 'moyen', type: 'chips', label: 'Moyen', options: L.MOYENS, default: 'MTN Mobile Money' },
        { name: 'n_transaction', type: 'text', label: 'N° de transaction', optional: true, dictate: false },
        { name: 'note', type: 'textarea', label: 'Note', optional: true, rows: 2 }, ...dateFields()],
      async submit(v) {
        const p = needOne(v); if (!p) return false;
        const m = L.parseMoney(v.montant); if (!m) { toast('Indique le montant.'); return false; }
        const wasClient = D.map.get(p.id)?.isClient;
        await commit([{ ...baseEvent(T.PAIEMENT, p, v), type_paiement: v.type_paiement, montant: m, moyen: v.moyen, n_transaction: v.n_transaction || '', note: v.note || '' }], [p]);
        toast(wasClient ? `Paiement de ${L.fmtFCFA(m)} enregistré.` : `${p.nom} est maintenant client.`); return true;
      },
    });
  },
  note(initial = {}) {
    return openForm({
      title: 'Note ou étape',
      initial: { prospect: initial.pid ? [initial.pid] : [] },
      fields: [prospectField(),
        { name: 'etape', type: 'chips', label: 'Étape', options: Object.values(ETAPES), default: initial.etape || ETAPES.AUCUNE },
        { name: 'prochaine_relance', type: 'date', label: 'Recontacter le', show: (v) => v.etape === ETAPES.RECONTACTER || v.etape === ETAPES.PAUSE || v.etape === ETAPES.AUCUNE,
          help: 'Facultatif. Le prospect réapparaîtra dans « À faire aujourd\'hui » à cette date.' },
        { name: 'raison_refus', type: 'text', label: 'Raison', optional: true, show: (v) => [ETAPES.REFUS, ETAPES.PERDU, ETAPES.PAUSE].includes(v.etape) },
        { name: 'note', type: 'textarea', label: 'Note', optional: true },
        { name: 'rendez_vous', type: 'datetime', label: 'Rendez-vous prévu', optional: true, help: 'Crée un événement dans ton Google Agenda.' },
        ...dateFields()],
      async submit(v) {
        const p = needOne(v); if (!p) return false;
        if (v.etape === ETAPES.RECONTACTER && !v.prochaine_relance) { toast('Indique la date pour recontacter.'); return false; }
        if (v.etape === ETAPES.AUCUNE && !v.note && !v.prochaine_relance && !v.rendez_vous) { toast('Écris une note.'); return false; }
        await commit([{ ...baseEvent(T.NOTE, p, v), etape: v.etape, prochaine_relance: v.prochaine_relance || '', raison_refus: v.raison_refus || '', note: v.note || '', rendez_vous: v.rendez_vous || '' }], [p]);
        toast('Enregistré.'); return true;
      },
    });
  },
  facture(initial = {}) {
    return openForm({
      title: 'Facture',
      initial: { prospect: initial.pid ? [initial.pid] : [], numero_facture: initial.numero_facture, statut_facture: initial.statut_facture, montant: initial.montant },
      fields: [prospectField('Client'),
        { name: 'numero_facture', type: 'text', label: 'Numéro de facture', dictate: false, default: () => L.nextInvoiceNumber(store.data.events, today.slice(0, 4)) },
        { name: 'montant', type: 'money', label: 'Montant (FCFA)' },
        { name: 'statut_facture', type: 'chips', label: 'Statut', options: ['émise', 'payée'], default: 'émise' },
        { name: 'note', type: 'textarea', label: 'Note', optional: true, rows: 2 }, ...dateFields(false)],
      async submit(v) {
        const p = needOne(v); if (!p) return false;
        await commit([{ ...baseEvent(T.FACTURE, p, v), numero_facture: v.numero_facture, montant: L.parseMoney(v.montant), statut_facture: v.statut_facture, note: v.note || '' }], [p]);
        toast(`Facture ${v.numero_facture} enregistrée.`); return true;
      },
    });
  },
  projet(initial = {}) {
    return openForm({
      title: 'Étape du projet',
      initial: { prospect: initial.pid ? [initial.pid] : [] },
      fields: [prospectField('Client'),
        { name: 'statut_projet', type: 'chips', label: 'Étape', options: L.PROJET_ETAPES, default: 'Démarré' },
        { name: 'date_livraison', type: 'date', label: 'Date de livraison', show: (v) => v.statut_projet === 'Livré', default: () => today },
        { name: 'duree_suivi_mois', type: 'number', label: 'Durée du suivi (mois)', show: (v) => v.statut_projet === 'Livré', default: 2 },
        { name: 'note', type: 'textarea', label: 'Note', optional: true, rows: 2 }, ...dateFields(false)],
      async submit(v) {
        const p = needOne(v); if (!p) return false;
        const livre = v.statut_projet === 'Livré';
        await commit([{ ...baseEvent(T.PROJET, p, v), statut_projet: v.statut_projet, date_livraison: livre ? v.date_livraison || v.date : '',
          duree_suivi_mois: livre ? Number(v.duree_suivi_mois) || 2 : '', note: v.note || '' }], [p]);
        toast(livre ? `Livré. Fin du suivi le ${fmtD(L.addMonths(v.date_livraison || v.date, Number(v.duree_suivi_mois) || 2))}.` : 'Étape enregistrée.');
        return true;
      },
    });
  },
  sav(initial = {}) {
    return openForm({
      title: 'Nouvelle demande SAV',
      initial: { prospect: initial.pid ? [initial.pid] : [] },
      fields: [prospectField('Client'),
        { name: 'type_sav', type: 'chips', label: 'Type', options: L.SAV_TYPES, default: L.SAV_TYPES[0] },
        { name: 'description_sav', type: 'textarea', label: 'Description' },
        { name: 'statut_sav', type: 'chips', label: 'Statut', options: L.SAV_STATUTS, default: 'Ouvert' }, ...dateFields(false)],
      async submit(v) {
        const p = needOne(v); if (!p) return false;
        await commit([{ ...baseEvent(T.SAV, p, v), type_sav: v.type_sav, description_sav: v.description_sav || '', statut_sav: v.statut_sav }], [p]);
        toast('Demande SAV enregistrée.'); return true;
      },
    });
  },
  savUpdate(initial) {
    const d = D.map.get(initial.pid); const s = d?.savList.find((x) => x.id === initial.sav);
    if (!d || !s) return null;
    return openForm({
      title: 'Mettre à jour la demande SAV', intro: `${esc(d.p.nom)} · ${esc(s.type || '')} : ${esc(s.description || '')}`,
      fields: [{ name: 'statut_sav', type: 'chips', label: 'Statut', options: L.SAV_STATUTS, default: initial.status || 'Résolu' },
        { name: 'note', type: 'textarea', label: 'Ce qui a été fait', optional: true }, ...dateFields(false)],
      async submit(v) {
        await commit([{ ...baseEvent(T.SAV, d.p, v), ref_id: s.id, type_sav: s.type, statut_sav: v.statut_sav, description_sav: v.note || '', note: v.note || '' }]);
        toast('Demande mise à jour.'); return true;
      },
    });
  },
  rattrapage(initial = {}) { return openCatchup({ list: false, pid: initial.pid }); },
  lot() { return openCatchup({ list: true }); },
  import() { return openImport(); },
};

// ------------------------------------------------------------------ rattrapage (§4.5)
function distinct(key) { return [...new Set(P.map((p) => p[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')); }
function openCatchup({ list, pid }) {
  const NB = [[0, 'Aucun message'], [1, '1er message seul'], [2, 'Relance 1 faite'], [3, 'Relance 2 faite'], [4, 'Relance 3 faite'], [5, 'Relance 4 faite']];
  const filterHtml = () => `<details class="filters"><summary>Sélection par filtre (facultatif)</summary>
    <div class="grid2">${['secteur', 'pays', 'ville', 'visuel'].map((k) => `<label>${{ secteur: 'Secteur', pays: 'Pays', ville: 'Ville', visuel: 'Code visuel' }[k]}
      <select data-flt="${k}"><option value="">Tous</option>${distinct(k).map((x) => `<option>${esc(x)}</option>`).join('')}</select></label>`).join('')}
      <label>De la ligne<input data-flt="from" type="number" min="1" inputmode="numeric"></label>
      <label>À la ligne<input data-flt="to" type="number" min="1" inputmode="numeric"></label></div>
    <label class="check"><input type="checkbox" data-flt="onlynew" checked> Seulement les prospects sans historique</label>
    <button type="button" class="btn" data-flt-apply>Ajouter les prospects correspondants</button><p class="hint" data-flt-count></p></details>`;
  const ctx = openForm({
    title: list ? 'Ajouter une liste (lot)' : 'Mettre à jour un prospect existant',
    intro: list ? 'Colle ou dicte plusieurs noms, choisis l\'état commun : un lot est créé d\'un coup (annulable en bloc).'
      : 'Renseigne l\'état actuel du prospect : les événements sont créés avec les bonnes dates passées.',
    initial: { prospects: pid ? [pid] : [] },
    fields: [
      { name: 'prospects', type: 'prospect', multi: true, label: list ? 'Prospects du lot' : 'Prospect' },
      ...(list ? [{ name: 'filtres', type: 'custom', render: filterHtml }] : []),
      { name: 'nbMessages', type: 'chips', label: 'Messages déjà envoyés', options: NB, default: '1' },
      { name: 'dateDernier', type: 'date', label: 'Date du dernier envoi', default: () => today, show: (v) => Number(v.nbMessages) > 0 },
      { name: 'compte', type: 'chips', label: 'Compte WhatsApp', options: () => ['', ...cfg.comptes].map((c) => [c, c || 'Inconnu']), default: '', show: (v) => Number(v.nbMessages) > 0 },
      { name: 'repondu', type: 'chips', label: 'A-t-il répondu ?', options: [['non', 'Non'], ['oui', 'Oui']], default: 'non' },
      { name: 'etiquette', type: 'chips', label: 'Étiquette', options: () => cfg.etiquettes, default: 'Conversation en cours', show: (v) => v.repondu === 'oui' },
      { name: 'dateReponse', type: 'date', label: 'Date de la réponse', show: (v) => v.repondu === 'oui' },
      { name: 'noteReponse', type: 'textarea', label: 'Note sur la réponse', optional: true, rows: 2, show: (v) => v.repondu === 'oui' },
      { name: 'objectionCat', type: 'chips', label: 'Objection', options: () => [['', 'Aucune'], ...cfg.objections], default: '' },
      { name: 'objectionTexte', type: 'textarea', label: 'Ce qu\'il a dit', optional: true, rows: 2, show: (v) => !!v.objectionCat },
      { name: 'objectionPlan', type: 'textarea', label: 'Comment je prévois de la traiter', optional: true, rows: 2, show: (v) => !!v.objectionCat },
      { name: 'devis', type: 'chips', label: 'Devis envoyé ?', options: [['non', 'Non'], ['oui', 'Oui']], default: 'non' },
      { name: 'devisMontant', type: 'money', label: 'Montant du devis (FCFA)', show: (v) => v.devis === 'oui' },
      { name: 'devisDate', type: 'date', label: 'Date du devis', show: (v) => v.devis === 'oui' },
      { name: 'prochaineRelance', type: 'date', label: 'Prochaine relance', help: 'Proposée selon les règles de relance, modifiable. Vide = aucune.' },
      { name: 'note', type: 'textarea', label: 'Note', optional: true, rows: 2 },
      { name: 'resume', type: 'info', html: (v) => catchupSummary(v) },
    ],
    onChange(name, c) {
      if (['nbMessages', 'dateDernier', 'repondu'].includes(name) && !c.dirty.has('prochaineRelance')) autoNext(c);
    },
    mount(c) {
      autoNext(c);
      if (!list) return;
      const box = c.el.querySelector('[data-field="filtres"]');
      const match = () => {
        const f = {}; $$('[data-flt]', box).forEach((i) => { f[i.dataset.flt] = i.type === 'checkbox' ? i.checked : i.value; });
        return P.filter((p) => (!f.secteur || p.secteur === f.secteur) && (!f.pays || p.pays === f.pays) && (!f.ville || p.ville === f.ville)
          && (!f.visuel || p.visuel === f.visuel) && (!f.from || p._row >= Number(f.from)) && (!f.to || p._row <= Number(f.to))
          && (!f.onlynew || !(D.map.get(p.id)?.events.length)) && !D.map.get(p.id)?.refus);
      };
      box.addEventListener('change', () => { $('[data-flt-count]', box).textContent = `${match().length} prospects correspondent.`; });
      box.addEventListener('click', (e) => {
        if (!e.target.closest('[data-flt-apply]')) return;
        const m = match();
        if (m.length > 600 && !window.confirm(`${m.length} prospects : continuer ?`)) return;
        const pk = c.pickers.prospects; m.forEach((p) => pk.add(p, true)); pk.render(); pk.onChange(pk.selected);
        toast(`${m.length} prospects ajoutés au lot.`);
      });
    },
    async submit(v, c) {
      const sel = v.prospects || [];
      if (!sel.length) { toast('Choisis au moins un prospect.'); return false; }
      const lotId = newLotId();
      const opts = {
        nbMessages: Number(v.nbMessages), dateDernier: v.dateDernier || today, compte: v.compte, repondu: v.repondu === 'oui',
        etiquette: v.etiquette, dateReponse: v.dateReponse || '', noteReponse: v.noteReponse || '',
        objectionCat: v.objectionCat, objectionTexte: v.objectionTexte, objectionPlan: v.objectionPlan,
        devisMontant: v.devis === 'oui' ? L.parseMoney(v.devisMontant) : '', devisDate: v.devisDate || '',
        prochaineRelance: v.prochaineRelance || '', note: v.note || '', lotId,
      };
      const events = sel.flatMap((p) => L.buildCatchupEvents(derivedOf(p), opts, cfg, today));
      if (!events.length) { toast('Rien à enregistrer (ces messages existent déjà ?).'); return false; }
      await commit(events, sel);
      toast(`${plural(events.length, 'événement créé', 'événements créés')} pour ${plural(sel.length, 'prospect')}.`);
      return true;
    },
  });
  function autoNext(c) {
    const nb = Number(c.v.nbMessages);
    c.set('prochaineRelance', c.v.repondu === 'oui' || nb === 0 ? '' : L.nextRelanceDate(c.v.dateDernier || today, nb - 1, cfg));
  }
  return ctx;
}
function catchupSummary(v) {
  const n = (v.prospects || []).length;
  const nb = Number(v.nbMessages);
  const parts = [];
  if (nb > 0) parts.push(`${nb === 1 ? 'premier message' : `premier message + ${nb - 1} relance${nb > 2 ? 's' : ''}`} (dernier le ${fmtD(v.dateDernier)})`);
  parts.push(v.repondu === 'oui' ? `a répondu (${v.etiquette})` : 'sans réponse');
  if (v.objectionCat) parts.push(`objection : ${v.objectionCat}`);
  if (v.devis === 'oui' && v.devisMontant) parts.push(`devis ${L.fmtFCFA(L.parseMoney(v.devisMontant))}`);
  parts.push(v.prochaineRelance ? `prochaine relance le ${fmtD(v.prochaineRelance)}` : 'pas de relance prévue');
  return `<p class="summary">${n ? `${plural(n, 'prospect')} : ` : ''}${esc(parts.join(', '))}.</p>`;
}

// ------------------------------------------------------------------ import CSV / Excel (§4.5.4)
const IMPORT_COLS = ['prospect_id', 'nom', 'numero_relance_faite', 'date_dernier_envoi', 'a_repondu', 'etiquette', 'montant_devis', 'montant_paye', 'prochaine_relance', 'note'];
async function readSpreadsheetFile(file) {
  if (/\.xlsx?$/i.test(file.name)) {
    if (!window.XLSX) {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'; s.onload = res; s.onerror = () => rej(new Error('Lecture Excel impossible hors ligne : enregistre le fichier en CSV.'));
        document.head.append(s);
      });
    }
    const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    return window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, dateNF: 'dd/mm/yyyy', defval: '' });
  }
  return L.parseCSV(await file.text());
}
const truthy = (s) => /^(oui|o|yes|y|1|x|vrai|true)$/i.test(String(s || '').trim());
function analyseImport(rows) {
  const objs = L.rowsToObjects(rows);
  const seen = new Set(); const out = [];
  for (const r of objs) {
    const key = IMPORT_COLS.map((c) => norm1(r[c])).join('|');
    const item = { line: r._line, raw: r };
    if (seen.has(key)) { item.status = 'doublon'; out.push(item); continue; }
    seen.add(key);
    let p = r.prospect_id ? P.find((x) => x.id === r.prospect_id) : null;
    if (!p && (r.nom || r.prospect_id)) {
      const res = L.resolveNames(P, (r.nom || r.prospect_id).replace(/[,;]/g, ' '));
      if (res.length === 1 && res[0].status === 'ok') p = res[0].prospect;
      else if (res.length === 1 && res[0].status === 'multi') { item.status = 'ambigu'; item.reason = `plusieurs prospects : ${res[0].candidates.map((x) => x.nom).join(', ')}`; }
    }
    if (!p && !item.status) { item.status = 'inconnu'; item.reason = r.nom || r.prospect_id ? 'prospect introuvable' : 'ni ID ni nom'; }
    if (p) {
      item.p = p; item.status = 'ok';
      const nr = String(r.numero_relance_faite ?? '').trim();
      const nb = nr === '' ? (r.date_dernier_envoi ? 1 : 0) : /^(aucun|-1|non)$/i.test(nr) ? 0 : (Number(nr.replace(/\D/g, '')) || 0) + 1;
      item.opts = {
        nbMessages: nb, dateDernier: L.parseDateFR(r.date_dernier_envoi) || today, repondu: truthy(r.a_repondu),
        etiquette: r.etiquette || (truthy(r.a_repondu) ? 'Conversation en cours' : ''), devisMontant: L.parseMoney(r.montant_devis),
        payeMontant: L.parseMoney(r.montant_paye), prochaineRelance: r.prochaine_relance ? L.parseDateFR(r.prochaine_relance) : undefined, note: r.note || '',
      };
      if (r.date_dernier_envoi && !L.parseDateFR(r.date_dernier_envoi)) { item.status = 'inconnu'; item.reason = `date illisible : ${r.date_dernier_envoi}`; }
    }
    out.push(item);
  }
  return out;
}
function norm1(s) { return L.norm(s); }
function sameEvent(a, b) { return a.type === b.type && a.date === b.date && String(a.numero_relance ?? '') === String(b.numero_relance ?? '') && String(a.montant ?? '') === String(b.montant ?? '') && (a.etiquette || '') === (b.etiquette || ''); }
function importSummary(o) {
  const s = [];
  if (o.nbMessages) s.push(`${L.relanceLabel(o.nbMessages - 1)} le ${fmtD(o.dateDernier)}`);
  if (o.repondu) s.push(`répondu${o.etiquette ? ` (${o.etiquette})` : ''}`);
  if (o.devisMontant) s.push(`devis ${L.fmtFCFA(o.devisMontant)}`);
  if (o.payeMontant) s.push(`payé ${L.fmtFCFA(o.payeMontant)}`);
  if (o.prochaineRelance) s.push(`relance ${fmtD(o.prochaineRelance)}`);
  return s.join(' · ') || 'note seule';
}
function openImport() {
  let items = [];
  const ov = openOverlay({
    cls: 'form-ov',
    html: `${ovHead('Importer un fichier')}<div class="ov-body">
      <p>Colonnes reconnues : <code>${IMPORT_COLS.join(', ')}</code>. Une ligne par prospect. <b>numero_relance_faite</b> : 0 = premier message seul, 1 = relance 1 faite… Dates au format jj/mm/aaaa.</p>
      <div class="btn-row"><button type="button" class="btn" data-tpl>Télécharger le modèle</button>
      <label class="btn primary file-btn">Choisir un fichier (CSV ou Excel)<input type="file" accept=".csv,.txt,.xlsx,.xls,text/csv" hidden></label></div>
      <label class="check"><input type="checkbox" data-create> Créer comme nouveaux prospects les noms introuvables</label>
      <div class="preview"></div></div>
      <footer class="ov-foot"><button type="button" class="btn primary big" data-go disabled>Importer</button></footer>`,
  });
  const el = ov.el;
  const renderPreview = () => {
    const create = $('[data-create]', el).checked;
    const ok = items.filter((i) => i.status === 'ok' || (create && i.status === 'inconnu' && (i.raw.nom || '').trim()));
    $('[data-go]', el).disabled = !ok.length;
    $('[data-go]', el).textContent = `Importer ${plural(ok.length, 'ligne')}`;
    $('.preview', el).innerHTML = items.length ? `<p>${plural(items.filter((i) => i.status === 'ok').length, 'ligne reconnue', 'lignes reconnues')},
      ${plural(items.filter((i) => i.status === 'inconnu' || i.status === 'ambigu').length, 'non reconnue', 'non reconnues')},
      ${plural(items.filter((i) => i.status === 'doublon').length, 'doublon ignoré', 'doublons ignorés')}.</p>
      <div class="tscroll"><table class="stat"><thead><tr><th>Ligne</th><th>Prospect</th><th>État importé</th><th></th></tr></thead><tbody>
      ${items.map((i) => `<tr class="${i.status === 'ok' ? '' : 'warnrow'}"><td>${i.line}</td><td>${esc(i.p ? i.p.nom : (i.raw.nom || i.raw.prospect_id || '—'))}</td>
        <td>${i.opts ? esc(importSummary(i.opts)) : esc(i.reason || '')}</td><td>${{ ok: pill('OK', 'good'), doublon: pill('Doublon', 'muted'), ambigu: pill('Ambigu', 'warn'), inconnu: pill('Non reconnu', 'bad') }[i.status]}</td></tr>`).join('')}
      </tbody></table></div>` : '';
  };
  el.addEventListener('change', async (e) => {
    if (e.target.matches('[data-create]')) return renderPreview();
    if (e.target.type !== 'file' || !e.target.files[0]) return;
    try { items = analyseImport(await readSpreadsheetFile(e.target.files[0])); renderPreview(); } catch (err) { toast(err.message || String(err)); }
  });
  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-tpl]')) {
      const rows = [IMPORT_COLS, ['P0001', '', '2', '15/11/2026', 'non', '', '', '', '', 'Exemple : premier message + 2 relances'],
        ['', 'Nom Exemple', '0', '12/11/2026', 'oui', 'Intéressé', '150000', '', '25/11/2026', 'A demandé un devis']];
      download('modele-import-prospection.csv', `﻿${L.toCSV(rows)}`, 'text/csv;charset=utf-8');
      return;
    }
    if (!e.target.closest('[data-go]')) return;
    const create = $('[data-create]', el).checked;
    const lotId = newLotId(); const events = []; const prospects = [];
    for (const i of items) {
      let p = i.p;
      if (!p && create && i.status === 'inconnu' && (i.raw.nom || '').trim()) {
        p = L.prepareProspects([{ id: `NEW-${L.uid('').slice(1, 9).toUpperCase()}${i.line}`, nom: i.raw.nom.trim(), numero: i.raw.numero || i.raw.numero_whatsapp || '', cree_le: new Date().toISOString(), lot_id: lotId }])[0];
        p._new = true; prospects.push(p);
        const nr = String(i.raw.numero_relance_faite ?? '').trim();
        i.opts = { nbMessages: nr === '' ? (i.raw.date_dernier_envoi ? 1 : 0) : (Number(nr) || 0) + 1, dateDernier: L.parseDateFR(i.raw.date_dernier_envoi) || today,
          repondu: truthy(i.raw.a_repondu), etiquette: i.raw.etiquette, devisMontant: L.parseMoney(i.raw.montant_devis), payeMontant: L.parseMoney(i.raw.montant_paye),
          prochaineRelance: i.raw.prochaine_relance ? L.parseDateFR(i.raw.prochaine_relance) : undefined, note: i.raw.note || '' };
      }
      if (!p || !i.opts) continue;
      const d = derivedOf(p);
      const evs = L.buildCatchupEvents(d, { ...i.opts, lotId }, cfg, today).filter((ne) => !d.events.some((oe) => sameEvent(oe, ne)));
      events.push(...evs);
    }
    if (!events.length && !prospects.length) { toast('Rien de nouveau à importer.'); return; }
    await commit(events, prospects);
    toast(`Import terminé : ${plural(events.length, 'événement')} (lot ${lotId}).`);
    closeOverlay();
  });
  return ov;
}

// ------------------------------------------------------------------ lots (annulation en bloc)
function lotsList() {
  const m = new Map();
  for (const e of store.data.events) {
    if (!e.lot_id) continue;
    if (!m.has(e.lot_id)) m.set(e.lot_id, { id: e.lot_id, n: 0, prospects: new Set(), types: new Map(), created: e.cree_le || '' });
    const l = m.get(e.lot_id); l.n++; l.prospects.add(e.prospect_id); l.types.set(e.type, (l.types.get(e.type) || 0) + 1);
    if ((e.cree_le || '') < l.created) l.created = e.cree_le;
  }
  return [...m.values()].sort((a, b) => (a.created < b.created ? 1 : -1));
}
const TYPE_LABEL = { contact: 'Message', reply: 'Réponse', objection: 'Objection', devis: 'Devis', facture: 'Facture', paiement: 'Paiement', projet: 'Projet', sav: 'SAV', note: 'Note' };
function openLots() {
  const html = () => {
    const lots = lotsList();
    return `${ovHead('Lots et imports')}<div class="ov-body"><p class="muted">Chaque saisie groupée, lot ou import a un identifiant. L'annuler supprime tous ses événements (les nouveaux prospects créés restent dans l'onglet Prospects).</p>
      ${lots.length ? lots.map((l) => `<article class="card lot"><div><b>${esc(l.id)}</b><p class="small muted">${l.created ? `${fmtD(l.created.slice(0, 10))} · ` : ''}${plural(l.prospects.size, 'prospect')} · ${[...l.types].map(([t, n]) => `${n} ${TYPE_LABEL[t] || t}`).join(', ')}</p></div>
        ${l.id === 'DEMO' ? '' : `<button type="button" class="btn danger-ghost" data-act="del-lot" data-lot="${esc(l.id)}">Annuler ce lot</button>`}</article>`).join('') : '<p class="empty">Aucun lot pour l\'instant.</p>'}</div>`;
  };
  const ov = openOverlay({ html: html(), refresh: () => { ov.el.innerHTML = html(); } });
}

// ------------------------------------------------------------------ fiche prospect / client
function describeEvent(e) {
  const bits = [];
  switch (e.type) {
    case T.CONTACT: bits.push(`${e.type_message || L.typeMessageFromNum(Number(e.numero_relance) || 0)}${e.modele ? ` · ${e.modele}` : ''}${e.compte_whatsapp ? ` · ${e.compte_whatsapp}` : ''}`);
      if (e.prochaine_relance) bits.push(`prochaine relance ${fmtD(e.prochaine_relance)}`); break;
    case T.REPLY: bits.push(e.etiquette || 'Réponse'); break;
    case T.OBJECTION: bits.push(`${e.objection_categorie}${e.resolue ? ` · résolue : ${e.resolue}` : ''}`); if (e.objection_texte) bits.push(`« ${e.objection_texte} »`); if (e.comment_resolue) bits.push(`Réponse : ${e.comment_resolue}`); break;
    case T.DEVIS: bits.push(L.fmtFCFA(e.montant)); break;
    case T.PAIEMENT: bits.push(`${e.type_paiement} · ${L.fmtFCFA(e.montant)}${e.moyen ? ` · ${e.moyen}` : ''}${e.n_transaction ? ` · n° ${e.n_transaction}` : ''}`); break;
    case T.FACTURE: bits.push(`Facture ${e.numero_facture}${e.montant ? ` · ${L.fmtFCFA(e.montant)}` : ''} · ${e.statut_facture}`); break;
    case T.PROJET: bits.push(e.statut_projet + (e.date_livraison ? ` · livré le ${fmtD(e.date_livraison)}, suivi ${e.duree_suivi_mois || 2} mois` : '')); break;
    case T.SAV: bits.push(`${e.ref_id ? 'Mise à jour' : (e.type_sav || 'Demande')} · ${e.statut_sav || ''}`); if (e.description_sav) bits.push(e.description_sav); break;
    case T.NOTE: if (e.etape && e.etape !== ETAPES.AUCUNE) bits.push(e.etape); if (e.raison_refus) bits.push(`Raison : ${e.raison_refus}`);
      if (e.prochaine_relance) bits.push(`relance le ${fmtD(e.prochaine_relance)}`); if (e.rendez_vous) bits.push(`RDV ${fmtD(e.rendez_vous.slice(0, 10))} ${e.rendez_vous.slice(11, 16)}`); break;
    default: break;
  }
  if (e.note && e.note !== 'Rattrapage') bits.push(e.note);
  if (e.message) bits.push(`<span class="quote">${esc(e.message)}</span>`);
  return bits.map((b, i) => (i === bits.length - 1 && e.message ? b : esc(b))).join('<br>');
}
function timelineHtml(d) {
  if (!d.events.length) return '<p class="empty">Aucun événement pour l\'instant.</p>';
  return `<ol class="timeline">${[...d.events].reverse().map((e) => `<li class="tl-${e.type}">
    <div class="tl-head"><b>${TYPE_LABEL[e.type] || e.type}</b><span class="muted small">${fmtD(e.date)}${e.heure ? ` · ${e.heure}` : ''}${e.lot_id ? ` · ${esc(e.lot_id)}` : ''}</span></div>
    <div class="tl-body">${describeEvent(e)}</div>
    <button type="button" class="del" data-act="del-event" data-id="${esc(e.id)}">Supprimer</button></li>`).join('')}</ol>`;
}
function clientBlock(d) {
  if (!d.isClient) return '';
  const fin = d.finSuivi ? `${fmtD(d.finSuivi)} (${d.joursSuivi >= 0 ? `dans ${plural(d.joursSuivi, 'jour')}` : `dépassée de ${plural(-d.joursSuivi, 'jour')}`})` : '—';
  return `<section class="card client">
    <h3>Client</h3>
    <div class="kpis"><div><span>Total convenu</span><b>${L.fmtFCFA(d.convenu)}</b></div><div><span>Total payé</span><b>${L.fmtFCFA(d.totalPaye)}</b></div>
    <div class="${d.reste ? 'warn' : ''}"><span>Reste à payer</span><b>${d.reste == null ? '—' : L.fmtFCFA(d.reste)}</b></div></div>
    <dl class="kv"><dt>Étape du projet</dt><dd>${esc(d.etapeProjet || 'Pas encore démarré')}</dd><dt>Livraison</dt><dd>${fmtD(d.livraison) || '—'}</dd><dt>Fin du suivi</dt><dd>${fin}</dd></dl>
    <h4>Factures</h4>${d.invoices.length ? `<ul class="plain">${d.invoices.map((f) => `<li><b>${esc(f.numero)}</b> · ${L.fmtFCFA(f.montant)} · ${f.statut === 'payée' ? pill('payée', 'good') : pill('émise', 'warn')} · ${fmtD(f.date)}
      ${f.statut !== 'payée' ? `<button type="button" class="btn small-btn" data-act="invoice-paid" data-pid="${esc(d.id)}" data-num="${esc(f.numero)}">Marquer payée</button>` : ''}</li>`).join('')}</ul>` : '<p class="muted small">Aucune facture.</p>'}
    <h4>Paiements</h4>${d.paiements.length ? `<ul class="plain">${d.paiements.map((x) => `<li>${fmtD(x.date)} · ${esc(x.type_paiement)} · <b>${L.fmtFCFA(x.montant)}</b> · ${esc(x.moyen || '')}</li>`).join('')}</ul>` : ''}
    <h4>SAV</h4>${d.savList.length ? `<ul class="plain">${d.savList.map((s) => `<li>${fmtD(s.date)} · ${esc(s.type || '')} : ${esc(s.description || '')} · ${pill(s.statut, s.statut === 'Résolu' ? 'good' : 'bad')}
      ${s.statut !== 'Résolu' ? `<button type="button" class="btn small-btn" data-act="sav-update" data-pid="${esc(d.id)}" data-sav="${esc(s.id)}" data-status="Résolu">Marquer résolue</button>
      ${s.statut === 'Ouvert' ? `<button type="button" class="btn small-btn ghost" data-act="sav-update" data-pid="${esc(d.id)}" data-sav="${esc(s.id)}" data-status="En cours">En cours</button>` : ''}` : ''}</li>`).join('')}</ul>` : '<p class="muted small">Aucune demande.</p>'}
  </section>`;
}
function ficheHtml(id) {
  const d = D.map.get(id);
  if (!d) return `${ovHead('Prospect')}<div class="ov-body"><p class="empty">Prospect introuvable.</p></div>`;
  const p = d.p;
  const num = d.phone.ok
    ? `<span class="${d.refus ? 'danger-text' : ''}">${esc(d.phone.intl)}</span>${d.refus ? ' ' + pill('Ne pas contacter', 'bad') : ''}`
    : `${esc(p.numero || '—')} ${pill(d.phone.reason, 'warn')}`;
  const btn = (form, label) => `<button type="button" class="btn" data-act="form" data-form="${form}" data-pid="${esc(id)}">${label}</button>`;
  return `${ovHead(p.nom)}<div class="ov-body">
    ${d.refus ? `<div class="alert bad"><b>Ne pas contacter.</b> Cette personne a refusé tout contact${d.raisonRefus ? ` (${esc(d.raisonRefus)})` : ''}. Respecte son choix.</div>` : ''}
    <div class="pills">${statePill(d)}${d.etiquette ? pill(d.etiquette, 'info') : ''}${d.due ? pill('Relancer', 'accent') : ''}${d.isClient ? pill('Client', 'good') : ''}</div>
    <dl class="kv">
      <dt>Numéro</dt><dd>${num}</dd>
      <dt>Secteur</dt><dd>${esc(p.secteur || '—')}</dd><dt>Activité</dt><dd>${esc(p.activite || '—')}</dd>
      <dt>Ville</dt><dd>${esc([p.ville, p.pays].filter(Boolean).join(', ') || '—')}</dd>
      <dt>Visuel</dt><dd>${esc(p.visuel || '—')}</dd><dt>ID · priorité</dt><dd>${esc(p.id)}${p.priorite ? ` · ${esc(p.priorite)}` : ''}</dd>
      <dt>Messages</dt><dd>${d.nbMessages ? `${plural(d.nbMessages, 'envoi')} · ${plural(d.nbRelances, 'relance')} · dernier le ${fmtD(d.lastContactDate)}` : 'aucun'}</dd>
      <dt>Prochaine relance</dt><dd>${d.nextRelance ? `${fmtD(d.nextRelance)} (${L.relanceLabel(d.nextNum)})` : '—'}</dd>
    </dl>
    ${d.phone.ok ? `<div class="btn-row">${['business', 'messenger'].map((app) => `<a class="btn wa" href="${esc(L.waLink(d.phone.wa))}" target="_blank" rel="noopener" data-act="wa-open" data-app="${app}" data-pid="${esc(id)}">${ICON.wa} ${L.WA_APPS[app].label}</a>`).join('')}
      <button type="button" class="btn ghost" data-act="copy" data-text="${esc(d.phone.intl)}">Copier le numéro</button></div><div class="wa-fallback"></div>` : ''}
    ${p.contact_google ? `<p class="small muted">Contact Google : ${esc(p.contact_google)}</p>` : ''}
    ${clientBlock(d)}
    <h3>Ajouter</h3>
    <div class="grid-btns">${btn('contact', 'Message envoyé')}${btn('reply', 'Il a répondu')}${btn('objection', 'Objection')}${btn('devis', 'Devis')}${btn('paiement', 'Paiement')}${btn('note', 'Note / étape')}
      ${btn('facture', 'Facture')}${btn('projet', 'Étape projet')}${btn('sav', 'Demande SAV')}${btn('rattrapage', 'Mettre à jour (rattrapage)')}</div>
    <h3>Historique</h3>${timelineHtml(d)}</div>`;
}
function openFiche(id) {
  const ov = openOverlay({ html: ficheHtml(id), refresh: () => { const y = ov.el.scrollTop; ov.el.innerHTML = ficheHtml(id); ov.el.scrollTop = y; } });
}

// ------------------------------------------------------------------ ouverture de WhatsApp (§4.6)
const IS_ANDROID = /Android/i.test(navigator.userAgent);
const LINK_MODES = [['choix', 'Me demander l\'application à chaque fois (recommandé)'], ['intent', 'Ouvrir directement l\'application du compte'], ['smsto', 'Variante smsto'], ['wame', 'wa.me seulement']];
const linkMode = () => (IS_ANDROID ? LS.get('linkMode2', 'choix') : 'wame');
const currentCompte = () => { const c = LS.get('compte', ''); return cfg.comptes.includes(c) ? c : (cfg.comptes[0] || ''); };
const appLabel = (compte) => L.WA_APPS[cfg.appOf(compte)].label;
function waHref(number, text, app) { return L.waAppLink(number, text, app, linkMode()); }
function switchHint(compte) {
  const others = L.sameAppAccounts(compte, cfg);
  return others.length ? `Plusieurs comptes dans ${esc(appLabel(compte))} : bascule sur le compte « ${esc(compte)} » avant d'envoyer.` : '';
}
/** Prépare le lien juste avant l'ouverture et propose wa.me si rien ne s'ouvre (intent refusé). */
function openWa(a, number, text, app, box) {
  const href = waHref(number, text, app);
  a.href = href;
  if (href.startsWith('intent:')) {
    a.removeAttribute('target');
    let left = false;
    const mark = () => { if (document.hidden) left = true; };
    const blur = () => { left = true; };
    document.addEventListener('visibilitychange', mark); window.addEventListener('blur', blur);
    setTimeout(() => {
      document.removeEventListener('visibilitychange', mark); window.removeEventListener('blur', blur);
      if (!left && box && box.isConnected) {
        box.innerHTML = `<a class="btn ghost" href="${esc(L.waLink(number, text))}" target="_blank" rel="noopener">Rien ne s'est ouvert ? Ouvrir avec wa.me</a>`;
      }
    }, 2500);
  } else { a.target = '_blank'; a.rel = 'noopener'; }
}

// ------------------------------------------------------------------ écran Aujourd'hui (§4.6)
// La journée se remplit toute seule : relances dues + nouveaux prospects jusqu'à l'objectif du jour.
// Les nouveaux sont pris dans l'ordre de priorité du fichier (regroupés par visuel) ; « Ajouter 30 de plus » dépasse l'objectif.
const extraKey = () => `extra-${today}`;
const getExtra = () => Number(LS.get(extraKey(), '0')) || 0;
function todayData() {
  const { overdue, today: tod } = L.relancesDues(D.list, today);
  const contactsToday = store.data.events.filter((e) => e.type === T.CONTACT && e.date === today);
  const auto = Math.max(0, cfg.objectifJour - contactsToday.length - overdue.length - tod.length);
  const plan = L.nextNewProspects(D.list, [], auto + getExtra());
  return { overdue, tod, plan, contactsToday };
}
function sendLabel(compte) { return linkMode() === 'choix' || linkMode() === 'wame' ? `${ICON.wa} Ouvrir WhatsApp` : `${ICON.wa} Ouvrir ${esc(appLabel(compte))}`; }
function updateCardSend(card) {
  const compte = card.dataset.compte;
  const a = $('[data-act="today-wa"]', card); if (a) a.innerHTML = sendLabel(compte);
  const h = $('.switch-hint', card); if (h) { h.innerHTML = switchHint(compte); h.hidden = !h.innerHTML; }
  $$('[data-seg="row-compte"]', card).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === compte)));
}
function taskCard(d, idx, section) {
  const msg = L.messageFor(d, cfg, idx);
  const compte = currentCompte();
  const hint = switchHint(compte);
  const late = d.overdue ? pill(`en retard · prévu ${fmtD(d.nextRelance)}`, 'bad') : '';
  return `<article class="task" data-pid="${esc(d.id)}" data-compte="${esc(compte)}">
    <div class="task-head"><button type="button" class="name-btn" data-act="fiche" data-pid="${esc(d.id)}">${esc(d.p.nom)}</button>${pill(L.relanceLabel(d.nextNum), section === 'new' ? 'info' : 'accent')}${late}</div>
    <p class="small muted">${esc([d.p.secteur, d.p.ville, d.p.visuel && `visuel ${d.p.visuel}`, d.etiquette].filter(Boolean).join(' · '))}</p>
    <textarea class="msg" rows="4" aria-label="Message prêt à envoyer">${esc(msg)}</textarea>
    <div class="sendwith"><span class="small muted">Envoyer avec :</span>${chipsHtml('row-compte', cfg.comptes.map((c) => [c, c]), compte)}</div>
    <p class="switch-hint" ${hint ? '' : 'hidden'}>${hint}</p>
    <div class="btn-row two">${d.phone.ok ? `<a class="btn wa" href="${esc(L.waLink(d.phone.wa, msg))}" target="_blank" rel="noopener" data-act="today-wa">${sendLabel(compte)}</a>` : `<span class="btn disabled">${esc(d.phone.reason)}</span>`}
      <button type="button" class="btn primary" data-act="today-done">${ICON.check} Fait</button></div>
    <div class="wa-fallback"></div>
    <div class="btn-row three"><button type="button" class="btn ghost" data-act="today-reply">Il a répondu</button><button type="button" class="btn ghost danger-text" data-act="today-refus">Refus complet</button>
      <button type="button" class="btn ghost" data-act="today-report">Reporter…</button></div></article>`;
}
function renderToday() {
  const { overdue, tod, plan, contactsToday } = todayData();
  const n = contactsToday.length; const goal = cfg.objectifJour;
  const perAccount = cfg.comptes.map((c) => [c, contactsToday.filter((e) => e.compte_whatsapp === c).length]);
  let lastVis = null;
  const planCards = plan.map((d, i) => {
    const head = d.p.visuel !== lastVis && plan.some((x) => x.p.visuel) ? `<h4 class="group">${d.p.visuel ? `Visuel ${esc(d.p.visuel)}` : 'Sans visuel'}</h4>` : '';
    lastVis = d.p.visuel; return head + taskCard(d, i, 'new');
  }).join('');
  const total = overdue.length + tod.length + plan.length;
  return `<section class="banner">
      <p class="date">${esc(L.fmtDateLong(today))}</p>
      <button type="button" class="goal" data-act="edit-goal"><span class="big">${n} / ${goal}</span><span>prospections aujourd'hui</span>
        <span class="progress"><i style="width:${Math.min(100, goal ? (n / goal) * 100 : 0)}%"></i></span></button>
      <div class="accounts">${perAccount.map(([c, k]) => `<span class="acc ${k > cfg.objectifCompte ? 'over' : ''}">${esc(c)} : ${k} / ${cfg.objectifCompte}${k > cfg.objectifCompte ? ' ⚠' : ''}</span>`).join('')}</div>
    </section>
    <div class="btn-row"><button type="button" class="btn" data-act="add-30">Ajouter 30 prospects de plus</button>
      <button type="button" class="btn ghost" data-act="vcf">Exporter les contacts de ma journée (.vcf)</button></div>
    ${!total ? `<p class="empty">${n >= goal ? 'Objectif du jour atteint, bravo ! Tu peux ajouter 30 prospects de plus si tu veux continuer.' : 'Plus aucun prospect « à envoyer » avec un numéro valide.'}</p>` : ''}
    ${overdue.length ? `<h3 class="section">Relances en retard <span class="count">${overdue.length}</span></h3>${overdue.map((d, i) => taskCard(d, i, 'late')).join('')}` : ''}
    ${tod.length ? `<h3 class="section">Relances du jour <span class="count">${tod.length}</span></h3>${tod.map((d, i) => taskCard(d, i + overdue.length, 'today')).join('')}` : ''}
    ${plan.length ? `<h3 class="section">Nouveaux prospects <span class="count">${plan.length}</span></h3><p class="small muted">Pris automatiquement dans l'ordre de ton fichier pour atteindre ${goal} aujourd'hui.</p>${planCards}` : ''}
    <p class="small muted center">Aucun message n'est envoyé automatiquement : c'est toi qui appuies sur Envoyer dans WhatsApp.</p>`;
}
async function todayDone(card) {
  const d = D.map.get(card.dataset.pid); if (!d) return;
  const num = d.nextNum;
  const heure = L.roundHalfHour(L.nowHM());
  const ev = {
    ...baseEvent(T.CONTACT, d.p, { date: today, heure }), type_message: L.typeMessageFromNum(num),
    modele: num === 0 ? (d.p.message ? 'Message préparé' : (cfg.modeles[0] || 'Modèle 1')) : `Relance ${num}`,
    message: $('.msg', card).value, numero_relance: num, prochaine_relance: L.nextRelanceDate(today, num, cfg),
    compte_whatsapp: card.dataset.compte || currentCompte(),
  };
  card.classList.add('done');
  if (tab === 'envois') ui.envoiOpen = nextPendingEnvoi(d.id);
  const next = card.nextElementSibling?.matches('.task') ? card.nextElementSibling : card.parentElement.querySelectorAll('.task')[[...card.parentElement.querySelectorAll('.task')].indexOf(card) + 1];
  const nextId = next?.dataset.pid;
  await commit([ev]);
  toast(`${d.p.nom} : ${L.relanceLabel(num)} enregistré${ev.prochaine_relance ? `, prochaine relance le ${fmtD(ev.prochaine_relance)}` : ' (dernier message : clôturé)'}.`);
  const target = tab === 'envois' ? ui.envoiOpen : nextId;
  if (target) $(`.task[data-pid="${CSS.escape(target)}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}
async function reportRelance(d) {
  const days = await dialog({ title: `Reporter la relance de ${d.p.nom}`, body: '<p>Reporter de combien de jours ?</p>',
    buttons: [1, 2, 3, 7, 14].map((n) => ({ label: plural(n, 'jour'), value: n })) });
  if (!days) return;
  const date = L.addDays(today, days);
  await commit([{ ...baseEvent(T.NOTE, d.p, { date: today, heure: L.roundHalfHour(L.nowHM()) }), etape: ETAPES.AUCUNE, prochaine_relance: date, note: `Relance reportée de ${plural(days, 'jour')}` }]);
  toast(`Relance reportée au ${fmtD(date)}.`);
}
async function markRefus(d) {
  const raison = await dialog({ title: `Refus complet : ${d.p.nom}`, body: '<p>Il ne sera plus jamais proposé dans les relances ni les sélections.</p><label>Raison (facultatif)<input class="refus-raison"></label>',
    buttons: [{ label: 'Confirmer le refus', cls: 'danger', value: (m) => $('.refus-raison', m).value || ' ' }] });
  if (raison == null) return;
  await commit([{ ...baseEvent(T.NOTE, d.p, { date: today, heure: L.roundHalfHour(L.nowHM()) }), etape: ETAPES.REFUS, raison_refus: raison.trim() }]);
  toast(`${d.p.nom} : ne plus contacter.`);
}
function exportVcf() {
  const { overdue, tod, plan } = todayData();
  const items = [...overdue, ...tod, ...plan].filter((d) => !d.refus).map((d) => d.p);
  const ok = items.filter((p) => L.phoneInfo(p.numero, cfg.indicatif).ok);
  if (!ok.length) { toast('Aucun contact à exporter (liste vide ou numéros à vérifier).'); return; }
  download(`contacts-journee-${today}.vcf`, L.buildVCard(ok, cfg.formatVcard, cfg.indicatif), 'text/vcard;charset=utf-8');
  toast(`${plural(ok.length, 'contact exporté', 'contacts exportés')}${items.length > ok.length ? ` (${items.length - ok.length} numéros à vérifier exclus)` : ''}.`);
}

// ------------------------------------------------------------------ écran Envois (comme le fichier Excel)
// Toute la file des messages, rangée par secteur et bloc de visuel, avec la position « 3/13 » dans le bloc.
function envoiStatus(d) {
  if (d.refus) return ['Ne pas contacter', 'bad', 'autre'];
  if (d.isClient) return ['Client', 'good', 'envoye'];
  if (d.hasReplied) return [d.etiquette || 'A répondu', 'ok', 'envoye'];
  if (d.nbMessages) return [`Envoyé le ${fmtD(d.firstContact.date)}${d.nbRelances ? ` · ${L.relanceLabel(d.maxNum)}` : ''}`, 'info', 'envoye'];
  if (!d.phone.ok) return ['Numéro à vérifier', 'warn', 'autre'];
  if (d.etapeActive) return [d.stateLabel, 'muted', 'autre'];
  if (d.nextRelance) return [`Reporté au ${fmtD(d.nextRelance)}`, 'muted', 'a_envoyer'];
  return ['À envoyer', 'accent', 'a_envoyer'];
}
let envoiCache = { key: '', blocs: [] };
function envoiBlocs() {
  const key = `${store.data.events.length}-${store.data.prospects.length}-${today}-${store.data.events[store.data.events.length - 1]?.id}`;
  if (envoiCache.key === key) return envoiCache.blocs;
  const m = new Map();
  for (const d of [...D.list].sort((a, b) => L.byPriority(a.p, b.p))) {
    const k = `${d.p.secteur || 'Sans secteur'}|${d.p.visuel || ''}`;
    if (!m.has(k)) m.set(k, { key: k, secteur: d.p.secteur || 'Sans secteur', visuel: d.p.visuel || '', items: [] });
    m.get(k).items.push(d);
  }
  const blocs = [...m.values()];
  for (const b of blocs) {
    b.items = b.items.map((d, i) => ({ d, pos: i + 1, st: envoiStatus(d) }));
    b.reste = b.items.filter((x) => x.st[2] === 'a_envoyer').length;
    b.envoyes = b.items.filter((x) => x.st[2] === 'envoye').length;
    b.label = `${b.secteur}${b.visuel ? ` · Visuel ${b.visuel}` : ''}`;
  }
  envoiCache = { key, blocs };
  return blocs;
}
const ENVOI_STATUTS = [['a_envoyer', 'À envoyer'], ['envoye', 'Envoyés'], ['tous', 'Tous']];
function envoiVisible() {
  const blocs = envoiBlocs();
  if (ui.envoiBloc == null || (ui.envoiBloc !== '*' && !blocs.some((b) => b.key === ui.envoiBloc))) ui.envoiBloc = (blocs.find((b) => b.reste) || blocs[0] || {}).key || '';
  const q = ui.envoiQuery.trim();
  const ids = q ? new Set(L.searchProspects(P, q, { limit: 2000 }).map((p) => p.id)) : null;
  const list = [];
  for (const b of blocs) {
    if (!q && ui.envoiBloc !== '*' && b.key !== ui.envoiBloc) continue;
    for (const x of b.items) {
      if (ids && !ids.has(x.d.id)) continue;
      if (ui.envoiStatut !== 'tous' && x.st[2] !== ui.envoiStatut) continue;
      list.push({ ...x, bloc: b });
    }
  }
  return list;
}
function nextPendingEnvoi(afterId) {
  const list = envoiVisible().filter((x) => x.st[2] === 'a_envoyer');
  const i = list.findIndex((x) => x.d.id === afterId);
  return (list[i + 1] || list.find((x) => x.d.id !== afterId) || {}).d?.id || null;
}
function envoiCard(x, total) {
  const d = x.d; const pending = x.st[2] === 'a_envoyer';
  const sentMsg = d.firstContact && d.firstContact.message;
  const msg = pending || !sentMsg ? L.messageFor(d, cfg, x.pos - 1) : sentMsg;
  const compte = currentCompte();
  const num = d.phone.ok ? d.phone.intl : (d.p.numero || '—');
  const rows = Math.min(10, Math.max(3, Math.ceil(msg.length / 42) + (msg.match(/\n/g) || []).length));
  return `<article class="task ecard ${pending ? '' : 'sent'}" data-pid="${esc(d.id)}" data-compte="${esc(compte)}">
    <div class="ehead"><span class="pos">${x.pos}/${total}</span><button type="button" class="name-btn" data-act="fiche" data-pid="${esc(d.id)}">${esc(d.p.nom)}</button>${pill(x.st[0], x.st[1])}</div>
    <p class="small muted">${esc([d.p.ville, d.p.pays].filter(Boolean).join(', '))} · <span class="${d.refus ? 'danger-text' : ''}">${esc(num)}</span>${d.p.visuel ? ` · visuel ${esc(d.p.visuel)}` : ''}</p>
    <span class="small muted elabel">${pending ? 'Message à envoyer' : 'Message envoyé'}</span>
    <textarea class="msg" rows="${rows}" aria-label="Message">${esc(msg)}</textarea>
    <div class="btn-row ${pending ? 'two' : ''}">${d.phone.ok && !d.refus ? `<a class="btn wa" href="${esc(L.waLink(d.phone.wa, msg))}" target="_blank" rel="noopener" data-act="today-wa">${sendLabel(compte)}</a>`
      : `<span class="btn disabled">${esc(d.refus ? 'Ne pas contacter' : d.phone.reason)}</span>`}
      ${pending ? `<button type="button" class="btn primary" data-act="today-done">${ICON.check} Envoyé</button>` : ''}</div>
    <div class="wa-fallback"></div></article>`;
}
function envoiListHtml() {
  const list = envoiVisible();
  if (!list.length) return `<p class="empty">${ui.envoiQuery ? 'Aucun prospect trouvé.' : 'Rien dans ce bloc pour ce filtre. Choisis un autre bloc.'}</p>`;
  let lastBloc = null;
  const shown = list.slice(0, ui.envoiLimit || 60);
  return shown.map((x) => {
    const head = x.bloc !== lastBloc && (ui.envoiQuery || ui.envoiBloc === '*') ? `<h4 class="group">${esc(x.bloc.label)}</h4>` : '';
    lastBloc = x.bloc;
    return head + envoiCard(x, x.bloc.items.length);
  }).join('') + (list.length > shown.length ? `<button type="button" class="btn" data-act="envoi-more">Afficher la suite (${list.length - shown.length} restants)</button>` : '');
}
function renderEnvois() {
  const blocs = envoiBlocs();
  envoiVisible();
  const totalReste = blocs.reduce((a, b) => a + b.reste, 0);
  const totalEnv = blocs.reduce((a, b) => a + b.envoyes, 0);
  const cur = blocs.find((b) => b.key === ui.envoiBloc);
  return `<section class="banner compact-banner"><p class="date-plain"><b>${totalReste}</b> à envoyer · <b>${totalEnv}</b> envoyés</p>
      <select id="envoiBloc" aria-label="Bloc (secteur · visuel)"><option value="*" ${ui.envoiBloc === '*' ? 'selected' : ''}>Tous les prospects (ordre du fichier)</option>${blocs.map((b) => `<option value="${esc(b.key)}" ${b.key === ui.envoiBloc ? 'selected' : ''}>${esc(b.label)} — ${b.reste} à envoyer / ${b.items.length}</option>`).join('')}</select>
      ${cur ? `<span class="progress"><i style="width:${cur.items.length ? Math.round((cur.envoyes / cur.items.length) * 100) : 0}%"></i></span><p class="small muted">${cur.envoyes} envoyés sur ${cur.items.length} dans ce bloc${cur.visuel ? ` · visuel à joindre : ${esc(cur.visuel)}` : ''}</p>` : ''}
      <div class="sendwith"><span class="small muted">Compte :</span>${chipsHtml('compte-now', cfg.comptes, currentCompte())}</div>
    </section>
    <div class="searchbar"><input type="search" id="envoiSearch" placeholder="Chercher un prospect (tous les blocs)" value="${esc(ui.envoiQuery)}" autocomplete="off">${micBtn()}</div>
    <div class="filters-row">${ENVOI_STATUTS.map(([k, lab]) => `<button type="button" aria-selected="${ui.envoiStatut === k}" data-act="envoi-statut" data-f="${k}">${lab}</button>`).join('')}</div>
    <div id="envoiList">${envoiListHtml()}</div>`;
}

// ------------------------------------------------------------------ écran Saisir (§4.1)
function clientAlerts() {
  const a = [];
  for (const d of D.list) {
    if (!d.isClient) continue;
    if (d.finSuivi && d.joursSuivi >= 0 && d.joursSuivi <= 7 && d.clientStatus !== 'termine') a.push({ d, tone: 'warn', text: `Fin de suivi dans ${plural(d.joursSuivi, 'jour')} (${fmtD(d.finSuivi)})` });
    if ((d.livraison || ['Livré', 'Suivi en cours', 'Terminé'].includes(d.etapeProjet)) && d.reste > 0) a.push({ d, tone: 'accent', text: `Solde à encaisser : ${L.fmtFCFA(d.reste)}` });
    for (const s of d.savOpen) { const n = L.diffDays(s.date, today); if (n > 3) a.push({ d, tone: 'bad', text: `SAV ouvert depuis ${plural(n, 'jour')} : ${s.type || ''}` }); }
  }
  return a;
}
function renderSaisir() {
  const nToday = store.data.events.filter((e) => e.type === T.CONTACT && e.date === today).length;
  const { overdue, today: tod } = L.relancesDues(D.list, today);
  const due = [...overdue, ...tod];
  const alerts = clientAlerts();
  const B = (form, label, sub = '') => `<button type="button" class="tile-btn" data-act="form" data-form="${form}"><b>${label}</b>${sub ? `<span>${sub}</span>` : ''}</button>`;
  return `<button type="button" class="hero-btn" data-act="form" data-form="contact"><b>J'ai contacté des prospects</b><span>${plural(nToday, 'envoi', 'envois')} aujourd'hui</span></button>
    <div class="tiles">${B('reply', 'Il m\'a répondu')}${B('objection', 'Objection')}${B('devis', 'Devis envoyé')}${B('paiement', 'Paiement reçu')}${B('note', 'Note ou étape')}${B('sav', 'Demande SAV', 'client')}</div>
    ${alerts.length ? `<h3 class="section">Alertes clients <span class="count">${alerts.length}</span></h3>${alerts.map((x) => `<button type="button" class="row alert-row ${x.tone}" data-act="fiche" data-pid="${esc(x.d.id)}"><b>${esc(x.d.p.nom)}</b><span>${esc(x.text)}</span></button>`).join('')}` : ''}
    <h3 class="section">À relancer aujourd'hui <span class="count">${due.length}</span></h3>
    ${due.length ? due.slice(0, 30).map((d) => `<button type="button" class="row" data-act="fiche" data-pid="${esc(d.id)}"><b>${esc(d.p.nom)}</b><span>${L.relanceLabel(d.nextNum)} · ${d.overdue ? `en retard (${fmtD(d.nextRelance)})` : 'aujourd\'hui'}</span></button>`).join('')
      + (due.length > 30 ? `<p class="small muted">… et ${due.length - 30} autres.</p>` : '') + '<button type="button" class="btn" data-act="tab" data-tab="today">Ouvrir l\'agenda du jour avec les messages prêts</button>'
      : '<p class="empty">Aucune relance due.</p>'}
    <h3 class="section">Rattrapage de l'historique</h3>
    <div class="tiles">${B('rattrapage', 'Mettre à jour un prospect existant')}${B('lot', 'Ajouter une liste (lot)')}${B('import', 'Importer un fichier')}
      <button type="button" class="tile-btn" data-act="lots"><b>Lots et annulations</b></button></div>`;
}

// ------------------------------------------------------------------ écran Suivi (§4.2)
const SUIVI_FILTERS = [
  ['en_cours', 'En cours', (d) => ['contacte', 'conversation', 'devis', 'acompte'].includes(d.state)],
  ['relancer', 'À relancer', (d) => d.due],
  ['conversation', 'En conversation', (d) => d.state === 'conversation'],
  ['devis', 'Devis', (d) => d.state === 'devis'],
  ['payes', 'Payés', (d) => d.state === 'paye' || d.state === 'acompte'],
  ['perdus', 'Perdus', (d) => ['perdu', 'refus', 'cloture', 'pause'].includes(d.state)],
  ['tous', 'Tous', () => true],
];
function suiviRows() {
  const f = SUIVI_FILTERS.find((x) => x[0] === ui.suiviFilter) || SUIVI_FILTERS[0];
  let list = ui.suiviQuery.trim() ? L.searchProspects(P, ui.suiviQuery, { limit: 2000 }).map((p) => D.map.get(p.id)) : D.list;
  list = list.filter((d) => d && f[2](d));
  if (!ui.suiviQuery.trim()) {
    list = [...list].sort((a, b) => (ui.suiviFilter === 'tous' ? L.byPriority(a.p, b.p) : (b.lastActivity || '').localeCompare(a.lastActivity || '')));
  }
  return list;
}
function prospectRow(d) {
  return `<button type="button" class="row prow" data-act="fiche" data-pid="${esc(d.id)}">
    <span class="prow-main"><b>${esc(d.p.nom)}</b><span class="small muted">${esc([d.p.secteur, d.p.ville].filter(Boolean).join(' · '))}</span></span>
    <span class="prow-side">${statePill(d)}${d.due ? pill('Relancer', 'accent') : ''}
      <span class="small muted">${d.lastContactDate ? `${fmtD(d.lastContactDate)} · ${plural(d.nbRelances, 'relance')}` : ''}</span></span></button>`;
}
function suiviListHtml() {
  const rows = suiviRows();
  return `${rows.slice(0, ui.suiviLimit).map(prospectRow).join('') || '<p class="empty">Aucun prospect.</p>'}
    ${rows.length > ui.suiviLimit ? `<button type="button" class="btn" data-act="more">Afficher plus (${rows.length - ui.suiviLimit} restants)</button>` : ''}`;
}
function renderSuivi() {
  return `<div class="searchbar"><input type="search" id="suiviSearch" placeholder="Rechercher (nom, ville, secteur, numéro…)" value="${esc(ui.suiviQuery)}" autocomplete="off">${micBtn()}</div>
    <div class="filters-row" role="tablist">${SUIVI_FILTERS.map(([k, lab, fn]) => `<button type="button" role="tab" aria-selected="${ui.suiviFilter === k}" data-act="filter" data-f="${k}">${lab} <span>${D.list.filter(fn).length}</span></button>`).join('')}</div>
    <div id="suiviList">${suiviListHtml()}</div>`;
}

// ------------------------------------------------------------------ écran Clients (§4.2 bis)
const CLIENT_FILTERS = [
  ['tous', 'Tous', () => true],
  ['en_cours', 'Projet en cours', (d) => d.clientStatus === 'en_cours'],
  ['livres', 'Livrés', (d) => !!d.livraison || ['Livré', 'Suivi en cours', 'Terminé'].includes(d.etapeProjet)],
  ['suivi', 'Suivi en cours', (d) => d.clientStatus === 'suivi'],
  ['sav', 'SAV ouvert', (d) => d.savOpen.length > 0],
  ['termines', 'Terminés', (d) => d.clientStatus === 'termine'],
];
function renderClients() {
  const clients = D.list.filter((d) => d.isClient);
  const f = CLIENT_FILTERS.find((x) => x[0] === ui.clientFilter) || CLIENT_FILTERS[0];
  const savOpen = clients.filter((d) => d.savOpen.length);
  const row = (d) => `<button type="button" class="row prow" data-act="fiche" data-pid="${esc(d.id)}">
    <span class="prow-main"><b>${esc(d.p.nom)}</b><span class="small muted">${esc(d.p.secteur || '')}${d.etapeProjet ? ` · ${esc(d.etapeProjet)}` : ' · projet non démarré'}</span></span>
    <span class="prow-side">${d.savOpen.length ? pill('SAV ouvert', 'bad') : ''}<span class="small">${d.reste ? `reste ${L.fmtFCFA(d.reste)}` : (d.reste === 0 ? 'soldé' : '')}</span>
      <span class="small muted">${d.finSuivi ? `fin suivi ${fmtD(d.finSuivi)}` : ''}</span></span></button>`;
  return `${savOpen.length ? `<section class="card alert bad"><h3>SAV ouvert (${savOpen.length})</h3>${savOpen.map((d) => `<button type="button" class="row" data-act="fiche" data-pid="${esc(d.id)}"><b>${esc(d.p.nom)}</b><span>${d.savOpen.map((s) => `${esc(s.type || '')} depuis le ${fmtD(s.date)}`).join(' ; ')}</span></button>`).join('')}</section>` : ''}
    <div class="btn-row three"><button type="button" class="btn" data-act="form" data-form="projet">Étape projet</button><button type="button" class="btn" data-act="form" data-form="facture">Facture</button><button type="button" class="btn" data-act="form" data-form="sav">Nouvelle demande SAV</button></div>
    <div class="filters-row">${CLIENT_FILTERS.map(([k, lab, fn]) => `<button type="button" aria-selected="${ui.clientFilter === k}" data-act="cfilter" data-f="${k}">${lab} <span>${clients.filter(fn).length}</span></button>`).join('')}</div>
    ${clients.filter(f[2]).map(row).join('') || '<p class="empty">Aucun client dans cette catégorie. Un prospect devient client dès son premier paiement.</p>'}`;
}

// ------------------------------------------------------------------ écran Bilan (§4.3)
let lastStats = null;
function statTable(title, rows, first) {
  if (!rows.length) return '';
  return `<section class="card"><h3>${esc(title)}</h3><div class="tscroll"><table class="stat"><thead><tr><th>${esc(first)}</th><th>Contactés</th><th>Envois</th><th>Rép.</th><th class="w">Taux</th><th>Devis</th><th>Payés</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td>${esc(r.key)}</td><td>${r.contactes}</td><td>${r.envois}</td><td>${r.reponses}</td><td><span class="bar"><i style="width:${r.taux}%"></i><em>${String(r.taux).replace('.', ',')} %</em></span></td><td>${r.devis}</td><td>${r.payes}</td></tr>`).join('')}</tbody></table></div></section>`;
}
function renderBilan() {
  const s = computeStatsCached();
  const t = s.tiles; const c = s.clients;
  const tile = (label, val) => `<div class="tile"><span>${label}</span><b>${val}</b></div>`;
  const max = Math.max(1, ...s.funnel.map((f) => f[1]));
  const pctS = (x) => `${String(x).replace('.', ',')} %`;
  return `<div class="tiles stats">${tile('Prospects contactés', t.contactes)}${tile('Taux de réponse', pctS(t.tauxReponse))}${tile('Devis envoyés', t.devis)}
      ${tile('Ont payé', t.payes)}${tile('Encaissé', L.fmtFCFA(t.encaisse))}${tile('Devis → paiement', pctS(t.tauxDevisPaiement))}</div>
    <section class="card"><h3>Entonnoir</h3>${s.funnel.map(([lab, n], i) => `<div class="funnel"><span>${lab}</span><span class="bar"><i style="width:${(n / max) * 100}%"></i><em>${n}${i ? ` · ${pctS(L.pct(n, s.funnel[0][1]))}` : ''}</em></span></div>`).join('')}</section>
    ${statTable('Par visuel', s.visuel, 'Visuel')}${statTable('Par secteur', s.secteur, 'Secteur')}${statTable('Par modèle (premier envoi)', s.modele, 'Modèle')}${statTable('Par moment d\'envoi (premier envoi)', s.moment, 'Moment')}
    <section class="card"><h3>Efficacité des relances</h3><p class="small muted">Réponses obtenues avant toute relance : <b>${s.beforeR1}</b>.</p>
      <div class="tscroll"><table class="stat"><thead><tr><th>Relances reçues</th><th>Prospects</th><th>Ont répondu ensuite</th><th class="w">Taux</th></tr></thead>
      <tbody>${s.relances.map((r) => `<tr><td>au moins ${r.k}</td><td>${r.prospects}</td><td>${r.reponses}</td><td><span class="bar"><i style="width:${r.taux}%"></i><em>${pctS(r.taux)}</em></span></td></tr>`).join('')}</tbody></table></div></section>
    <section class="card"><h3>Objections</h3>${s.objections.length ? `<div class="tscroll"><table class="stat"><thead><tr><th>Catégorie</th><th>Nombre</th><th>Résolues</th></tr></thead><tbody>${s.objections.map((o) => `<tr><td>${esc(o.key)}</td><td>${o.total}</td><td>${o.resolues}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Aucune objection enregistrée.</p>'}</section>
    <section class="card"><h3>Clients</h3><div class="tiles stats">${tile('Clients', c.nb)}${tile('Chiffre d\'affaires encaissé', L.fmtFCFA(c.ca))}${tile('Reste à encaisser', L.fmtFCFA(c.reste))}
      ${tile('Délai moyen 1er message → 1er paiement', c.delaiMoyen == null ? '—' : plural(c.delaiMoyen, 'jour'))}${tile('SAV ouverts / résolus', `${c.savOuverts} / ${c.savResolus}`)}</div>
      ${c.secteurs.length ? `<h4>Clients par secteur</h4><ul class="plain">${c.secteurs.map(([k, n]) => `<li>${esc(k)} : <b>${n}</b></li>`).join('')}</ul>` : ''}</section>
    <div class="btn-row"><button type="button" class="btn primary" data-act="export-csv">Exporter tout l'historique (CSV)</button><button type="button" class="btn" data-act="copy-table">Copier le tableau</button></div>`;
}
let statsCache = { key: '', value: null };
function computeStatsCached() {
  const key = `${store.data.events.length}-${store.data.prospects.length}-${today}-${store.data.events[store.data.events.length - 1]?.id}`;
  if (statsCache.key !== key) statsCache = { key, value: L.computeStats(D.list, store.data.events, cfg) };
  lastStats = statsCache.value;
  return lastStats;
}
function exportCSV() {
  const head = [...L.EVENT_FIELDS, 'secteur', 'ville', 'pays', 'etat_actuel'];
  const rows = [head];
  for (const e of L.sortEvents(store.data.events)) {
    const d = D.map.get(String(e.prospect_id));
    rows.push(head.map((k) => {
      if (k === 'secteur' || k === 'ville' || k === 'pays') return d ? d.p[k] : '';
      if (k === 'etat_actuel') return d ? d.stateLabel : '';
      if (['date', 'prochaine_relance', 'date_livraison'].includes(k)) return fmtD(e[k]);
      return e[k] ?? '';
    }));
  }
  download(`prospection-historique-${today}.csv`, `﻿${L.toCSV(rows, ';')}`, 'text/csv;charset=utf-8');
}
async function copyBilan() {
  const s = computeStatsCached();
  const rows = [['Indicateur', 'Valeur'], ['Prospects contactés', s.tiles.contactes], ['Taux de réponse (%)', s.tiles.tauxReponse], ['Devis envoyés', s.tiles.devis],
    ['Ont payé', s.tiles.payes], ['FCFA encaissés', s.tiles.encaisse], ['Taux devis → paiement (%)', s.tiles.tauxDevisPaiement], [], ['Entonnoir', ''], ...s.funnel];
  for (const [title, list] of [['Visuel', s.visuel], ['Secteur', s.secteur], ['Modèle', s.modele], ['Moment', s.moment]]) {
    rows.push([], [title, 'Contactés', 'Envois', 'Réponses', 'Taux (%)', 'Devis', 'Payés'], ...list.map((r) => [r.key, r.contactes, r.envois, r.reponses, r.taux, r.devis, r.payes]));
  }
  rows.push([], ['Relances reçues', 'Prospects', 'Ont répondu ensuite', 'Taux (%)'], ...s.relances.map((r) => [`au moins ${r.k}`, r.prospects, r.reponses, r.taux]));
  rows.push([], ['Objection', 'Nombre', 'Résolues'], ...s.objections.map((o) => [o.key, o.total, o.resolues]));
  rows.push([], ['Clients', s.clients.nb], ['CA encaissé', s.clients.ca], ['Reste à encaisser', s.clients.reste], ['Délai moyen (jours)', s.clients.delaiMoyen ?? ''], ['SAV ouverts', s.clients.savOuverts], ['SAV résolus', s.clients.savResolus]);
  toast((await copyText(L.toTSV(rows))) ? 'Tableau copié : colle-le dans Excel ou Google Sheets.' : 'Copie impossible.');
}

// ------------------------------------------------------------------ réglages
const SETTINGS = [
  ['Objectifs', [['objectif_jour', 'Objectif de prospections par jour', 'number'], ['objectif_compte', 'Objectif conseillé par compte WhatsApp', 'number'], ['comptes', 'Comptes WhatsApp (séparés par |)']]],
  ['Règles de relance', [['delai_premier', 'Jours après le premier message', 'number'], ['delai_r1', 'Jours après la relance 1', 'number'], ['delai_r2', 'Jours après la relance 2', 'number'], ['delai_r3', 'Jours après la relance 3', 'number'], ['relances_max', 'Nombre maximal de relances', 'number']]],
  ['Messages prêts', [['premier_message', 'Premier message (si le prospect n\'a pas de « Message préparé »)', 'textarea'], ['relance_1', 'Relance 1', 'textarea'], ['relance_2', 'Relance 2', 'textarea'], ['relance_3', 'Relance 3', 'textarea'], ['relance_4', 'Relance 4 (clôture polie)', 'textarea']],
    'Variables : {civilité} {prénom} {nom} {nom_complet} {activité} {ville}. Plusieurs variantes : sépare-les par une ligne contenant seulement ---. Elles sont alternées.'],
  ['Listes', [['etiquettes', 'Étiquettes de réponse'], ['objections', 'Catégories d\'objection'], ['modeles', 'Modèles de premier message'], ['types_message', 'Types de message']], 'Valeurs séparées par |.'],
  ['Comptes et applications WhatsApp', [['applis_comptes', 'Application de chaque compte (compte: business ou messenger, séparés par |)']],
    'Ex. « Business 1: business | Business 2: business | Messenger: messenger ». Si deux comptes partagent la même application (multi-comptes ou application clonée), l\'application affiche un rappel pour basculer de compte avant d\'envoyer.'],
  ['Contacts Google', [['contacts_google', 'Créer automatiquement les nouveaux prospects dans Google Contacts (oui/non)'], ['contact_seulement_reponse', 'Enregistrer un contact seulement quand le prospect répond (oui/non)']],
    'Nom au format ci-dessous, étiquette PROPULSION, pas de doublon de numéro. Jamais pour les numéros à vérifier ni les prospects « Ne pas contacter ».'],
  ['Contacts et agenda', [['format_vcard', 'Nom des contacts (Google et .vcf)'], ['indicatif', 'Indicatif ajouté aux numéros à 9 chiffres'], ['app_url', 'Adresse de l\'application (pour l\'e-mail et l\'agenda)'], ['email', 'E-mail du récapitulatif (vide = propriétaire du script)'], ['agenda', 'Créer les événements Google Agenda (oui/non)']]],
];
function openSettings() {
  const statusText = { idle: 'à jour', syncing: 'synchronisation…', offline: 'hors ligne : envoi dès le retour du réseau', auth: 'jeton refusé', error: 'erreur' }[store.status];
  const html = `${ovHead('Réglages')}<form class="ov-body form settings" novalidate>
    <section class="card"><h3>Connexion</h3>
      <p>${store.mode === 'demo' ? '<b>Mode démonstration</b> : données fictives enregistrées sur ce téléphone uniquement.' : 'Connecté à ton Google Sheet via l\'Apps Script.'}</p>
      <p class="small muted">État : ${esc(statusText)} · ${plural(store.queue.length, 'modification en attente', 'modifications en attente')}${store.lastSync ? ` · dernière synchro ${new Date(store.lastSync).toLocaleString('fr-FR', { timeZone: L.TZ })}` : ''}</p>
      <p class="small muted">${plural(store.data.prospects.length, 'prospect')} · ${plural(store.data.events.length, 'événement')}</p>
      <div class="btn-row"><button type="button" class="btn" data-act="sync-now">Synchroniser maintenant</button><button type="button" class="btn" data-act="lots">Lots et annulations</button>
      <button type="button" class="btn" data-act="notif">Notifications</button><button type="button" class="btn danger-ghost" data-act="logout">${store.mode === 'demo' ? 'Quitter la démo' : 'Déconnecter ce téléphone'}</button></div></section>
    <section class="card"><h3>Liens WhatsApp (ce téléphone)</h3>
      ${IS_ANDROID ? `<p class="hint">Format du lien qui ouvre l'application choisie. Si un format n'ouvre pas la bonne application, essaie le suivant avec le test ci-dessous (envoie-toi le message à toi-même).</p>
      <div class="seg">${LINK_MODES.map(([k, lab]) => `<button type="button" role="radio" data-act="link-mode" data-mode="${k}" aria-checked="${linkMode() === k}">${lab}</button>`).join('')}</div>
      <label class="field" style="margin-top:12px"><span class="label">Numéro de test</span><input class="test-num" inputmode="tel" placeholder="ton propre numéro"></label>
      <div class="btn-row">${['business', 'messenger'].map((app) => `<a class="btn wa" href="#" data-act="link-test" data-app="${app}">${ICON.wa} Tester ${L.WA_APPS[app].label}</a>`).join('')}</div><div class="wa-fallback"></div>`
        : '<p class="hint">Sur ordinateur, les liens wa.me sont utilisés (WhatsApp Web ou l\'application de bureau). Le choix de l\'application fonctionne sur Android.</p>'}</section>
    ${SETTINGS.map(([title, fields, hint]) => `<section class="card"><h3>${title}</h3>${hint ? `<p class="hint">${esc(hint)}</p>` : ''}${fields.map(([k, lab, type]) => `<label class="field"><span class="label">${esc(lab)}</span>
      ${type === 'textarea' ? `<textarea name="${k}" rows="6">${esc(cfg.raw[k])}</textarea>` : `<input name="${k}" ${type === 'number' ? 'type="number" inputmode="numeric"' : ''} value="${esc(cfg.raw[k])}">`}</label>`).join('')}</section>`).join('')}
    <p class="small muted">Le jeton secret ne s'affiche jamais ici. Pour le changer : menu Prospection du Google Sheet.</p><div class="spacer"></div></form>
    <footer class="ov-foot"><button type="button" class="btn primary big" data-act="save-settings">Enregistrer les réglages</button></footer>`;
  openOverlay({ html, cls: 'form-ov' });
}
async function saveSettings(btn) {
  const form = btn.closest('.overlay').querySelector('form');
  const values = {};
  for (const el of form.elements) if (el.name && String(cfg.raw[el.name] ?? '') !== el.value) values[el.name] = el.value;
  if (Object.keys(values).length) await store.apply({ action: 'updateConfig', payload: { values } });
  toast(Object.keys(values).length ? 'Réglages enregistrés.' : 'Aucun changement.');
  closeOverlay();
}

// ------------------------------------------------------------------ première connexion
function renderSetup() {
  document.body.classList.add('setup');
  $('#view').innerHTML = `<section class="card setup-card">
    <h2>Bienvenue</h2>
    <p>Relie l'application à ton Google Sheet. Tu trouves l'adresse du script et le jeton dans le Google Sheet : menu <b>Prospection &gt; Afficher le jeton</b>.</p>
    <form id="setupForm" class="form" novalidate>
      <label class="field"><span class="label">Adresse de l'Apps Script (se termine par /exec)</span><input name="url" inputmode="url" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(store.url)}" autocomplete="off"></label>
      <label class="field"><span class="label">Jeton secret</span><input name="token" type="password" autocomplete="off" value="${esc(store.token)}"></label>
      <button class="btn primary big" type="submit">Connecter</button>
      <p class="setup-error danger-text" role="alert"></p>
    </form>
    <hr><p>Tu veux d'abord voir l'application avec des données fictives ?</p>
    <button type="button" class="btn" data-act="demo">Essayer en mode démo</button>
    <p class="small muted">Le jeton reste sur ce téléphone. Aucune donnée de prospect n'est stockée dans le code du site.</p></section>`;
  $('#setupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target; const btn = f.querySelector('button'); btn.disabled = true; btn.textContent = 'Connexion…';
    try {
      await store.configure('api', f.url.value, f.token.value);
      document.body.classList.remove('setup'); toast('Connecté.'); render();
    } catch (err) {
      LS.set('mode', '');
      $('.setup-error').textContent = `Connexion impossible : ${err.message || err}`;
    } finally { btn.disabled = false; btn.textContent = 'Connecter'; }
  });
}

// ------------------------------------------------------------------ rendu principal
function render() {
  if (!store.configured) { renderSetup(); updateSync(); return; }
  document.body.classList.remove('setup');
  const view = $('#view');
  const y = window.scrollY;
  const fn = { today: renderToday, envois: renderEnvois, saisir: renderSaisir, suivi: renderSuivi, clients: renderClients, bilan: renderBilan }[tab] || renderToday;
  const titles = { today: 'Aujourd\'hui', envois: 'Envois', saisir: 'Saisir', suivi: 'Suivi', clients: 'Clients', bilan: 'Bilan' };
  $('#topTitle').textContent = titles[tab];
  view.innerHTML = fn();
  $$('.tabs [data-tab]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.tab === tab)));
  if (tab === 'envois') {
    $('#envoiBloc').addEventListener('change', (e) => { ui.envoiBloc = e.target.value; ui.envoiOpen = null; ui.envoiLimit = 60; render(); window.scrollTo(0, 0); });
    const s = $('#envoiSearch');
    s.addEventListener('input', () => { ui.envoiQuery = s.value; ui.envoiLimit = 60; $('#envoiList').innerHTML = envoiListHtml(); });
  }
  if (tab === 'suivi') {
    const s = $('#suiviSearch');
    s.addEventListener('input', () => { ui.suiviQuery = s.value; ui.suiviLimit = 80; $('#suiviList').innerHTML = suiviListHtml(); });
  }
  window.scrollTo(0, y);
}
function updateBadges() {
  const { overdue, today: tod } = L.relancesDues(D.list, today);
  const n = overdue.length + tod.length;
  const b = $('#badgeSaisir'); b.hidden = !n; b.textContent = n > 99 ? '99+' : n;
  const sav = D.list.filter((d) => d.savOpen.length).length;
  const c = $('#badgeClients'); c.hidden = !sav; c.textContent = sav;
  if (navigator.setAppBadge) { (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {}); }
}
function updateSync() {
  const b = $('#syncBtn');
  const q = store.queue.length;
  const map = {
    idle: ['ok', q ? `${q} en attente` : 'À jour'], syncing: ['busy', 'Synchro…'], offline: ['off', q ? `Hors ligne · ${q}` : 'Hors ligne'],
    auth: ['bad', 'Jeton refusé'], error: ['bad', 'Erreur'],
  };
  const [cls, text] = map[store.status] || map.idle;
  b.className = `sync ${cls}`; b.textContent = store.configured ? text : '';
  b.title = store.statusDetail || '';
}

// ------------------------------------------------------------------ actions (délégation des clics)
const ACT = {
  close: () => closeOverlay(),
  tab: (b) => { tab = b.dataset.tab; LS.set('tab', tab); window.scrollTo(0, 0); render(); },
  form: (b) => FORMS[b.dataset.form]?.({ pid: b.dataset.pid }),
  fiche: (b) => openFiche(b.dataset.pid),
  lots: () => openLots(),
  filter: (b) => { ui.suiviFilter = b.dataset.f; ui.suiviLimit = 80; render(); },
  cfilter: (b) => { ui.clientFilter = b.dataset.f; render(); },
  'envoi-more': () => { ui.envoiLimit = (ui.envoiLimit || 60) + 100; $('#envoiList').innerHTML = envoiListHtml(); },
  'envoi-statut': (b) => { ui.envoiStatut = b.dataset.f; ui.envoiOpen = null; ui.envoiLimit = 60; render(); },
  more: () => { ui.suiviLimit += 200; $('#suiviList').innerHTML = suiviListHtml(); },
  'export-csv': () => exportCSV(),
  'copy-table': () => copyBilan(),
  copy: async (b) => toast((await copyText(b.dataset.text)) ? 'Copié.' : 'Copie impossible.'),
  'add-30': () => {
    const before = todayData().plan.length;
    LS.set(extraKey(), String(getExtra() + 30)); render();
    const added = todayData().plan.length - before;
    toast(added ? `${plural(added, 'prospect ajouté', 'prospects ajoutés')} à ta journée.` : 'Plus aucun prospect « à envoyer » avec un numéro valide.');
  },
  vcf: () => exportVcf(),
  'today-wa': (b) => {
    const card = b.closest('.task'); const d = D.map.get(card.dataset.pid);
    $('.wa-fallback', card).innerHTML = '';
    openWa(b, d.phone.wa, $('.msg', card).value, cfg.appOf(card.dataset.compte), $('.wa-fallback', card));
  },
  'today-done': (b) => todayDone(b.closest('.task')),
  'today-reply': (b) => FORMS.reply({ pid: b.closest('.task').dataset.pid }),
  'today-refus': (b) => markRefus(D.map.get(b.closest('.task').dataset.pid)),
  'today-report': (b) => reportRelance(D.map.get(b.closest('.task').dataset.pid)),
  'edit-goal': async () => {
    const v = await dialog({ title: 'Objectif du jour', body: `<label>Prospections par jour<input type="number" inputmode="numeric" class="goal-in" value="${cfg.objectifJour}"></label>`,
      buttons: [{ label: 'Enregistrer', cls: 'primary', value: (m) => $('.goal-in', m).value }] });
    if (v && Number(v) > 0) await store.apply({ action: 'updateConfig', payload: { values: { objectif_jour: String(Number(v)) } } });
  },
  'wa-open': async (b, e) => {
    const d = D.map.get(b.dataset.pid);
    const box = b.closest('.ov-body')?.querySelector('.wa-fallback');
    if (d && d.refus && !b.dataset.confirmed) {
      e.preventDefault();
      const ok = await checkRefus([d.p], 'ouvrir WhatsApp pour lui écrire');
      if (ok && ok.length) { b.dataset.confirmed = '1'; openWa(b, d.phone.wa, '', b.dataset.app, box); b.click(); delete b.dataset.confirmed; }
      return;
    }
    openWa(b, d.phone.wa, '', b.dataset.app, box);
  },
  'link-mode': (b) => {
    LS.set('linkMode2', b.dataset.mode);
    $$('[data-act="link-mode"]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    toast('Format des liens enregistré pour ce téléphone.');
  },
  'link-test': (b) => {
    const box = b.closest('.card'); const num = L.phoneInfo($('.test-num', box).value, cfg.indicatif);
    if (!num.ok) { b.removeAttribute('href'); toast('Saisis un numéro valide (le tien par exemple).'); return; }
    openWa(b, num.wa, 'Test de lien depuis l\'application de prospection', b.dataset.app, $('.wa-fallback', box));
  },
  'del-event': async (b) => {
    if (!b.classList.contains('confirm')) {
      b.classList.add('confirm'); b.textContent = 'Confirmer la suppression ?';
      setTimeout(() => { if (b.isConnected) { b.classList.remove('confirm'); b.textContent = 'Supprimer'; } }, 4000);
      return;
    }
    await store.apply({ action: 'deleteEvents', payload: { ids: [b.dataset.id] } }); toast('Événement supprimé.');
  },
  'del-lot': async (b) => {
    if (!b.classList.contains('confirm')) { b.classList.add('confirm'); b.textContent = 'Confirmer l\'annulation ?'; setTimeout(() => { if (b.isConnected) { b.classList.remove('confirm'); b.textContent = 'Annuler ce lot'; } }, 4000); return; }
    await store.apply({ action: 'deleteLot', payload: { lot_id: b.dataset.lot } }); toast('Lot annulé.');
  },
  'sav-update': (b) => FORMS.savUpdate({ pid: b.dataset.pid, sav: b.dataset.sav, status: b.dataset.status }),
  'invoice-paid': async (b) => {
    const d = D.map.get(b.dataset.pid); const inv = d.invoices.find((f) => f.numero === b.dataset.num);
    await commit([{ ...baseEvent(T.FACTURE, d.p, { date: today }), numero_facture: inv.numero, montant: inv.montant ?? '', statut_facture: 'payée' }]);
    toast(`Facture ${inv.numero} marquée payée. Pense à enregistrer le paiement s'il ne l'est pas.`);
  },
  'save-settings': (b) => saveSettings(b),
  'sync-now': async () => { await store.sync(true); toast(store.status === 'idle' ? 'Synchronisé.' : 'Synchronisation impossible pour l\'instant.'); },
  logout: async () => {
    if (store.queue.length && !(await confirmBox('Modifications non envoyées', `${store.queue.length} modifications ne sont pas encore dans le Google Sheet. Elles seront perdues.`, 'Déconnecter quand même'))) return;
    if (!(await confirmBox('Déconnecter ce téléphone ?', 'Les données en cache et le jeton seront effacés de ce téléphone (le Google Sheet n\'est pas modifié).', 'Déconnecter'))) return;
    await store.reset(); while (overlays.length) { overlays.pop().el.remove(); } document.body.classList.remove('has-overlay'); render();
  },
  demo: async () => { await store.configure('demo'); toast('Mode démo : données fictives.'); render(); },
  notif: async () => {
    if (!('Notification' in window)) { toast('Notifications non disponibles sur ce navigateur.'); return; }
    const r = await Notification.requestPermission();
    toast(r === 'granted' ? 'Notifications activées : un rappel s\'affichera à l\'ouverture si des relances sont dues.' : 'Notifications refusées.');
  },
};
document.addEventListener('click', (e) => {
  const mic = e.target.closest('[data-mic]');
  if (mic) { e.preventDefault(); startDictation(mic); return; }
  const cn = e.target.closest('[data-seg="compte-now"]');
  if (cn) {
    LS.set('compte', cn.dataset.value);
    $$('[data-seg="compte-now"]').forEach((x) => x.setAttribute('aria-checked', String(x === cn)));
    $$('.ecard').forEach((c) => { c.dataset.compte = cn.dataset.value; updateCardSend(c); });
    return;
  }
  const seg = e.target.closest('[data-seg="row-compte"]');
  if (seg) { const card = seg.closest('.task'); card.dataset.compte = seg.dataset.value; LS.set('compte', seg.dataset.value); updateCardSend(card); return; }
  const b = e.target.closest('[data-act]');
  if (b && ACT[b.dataset.act]) ACT[b.dataset.act](b, e);
});
$('#settingsBtn').addEventListener('click', () => (store.configured ? openSettings() : null));
$('#syncBtn').addEventListener('click', () => store.sync(true));

// ------------------------------------------------------------------ démarrage
function notifyOnOpen() {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (LS.get('notified') === today) return;
    const { overdue, today: tod } = L.relancesDues(D.list, today);
    const n = overdue.length + tod.length;
    if (!n) return;
    LS.set('notified', today);
    const body = `${plural(n, 'relance due', 'relances dues')} aujourd'hui${overdue.length ? ` (dont ${overdue.length} en retard)` : ''}.`;
    navigator.serviceWorker?.ready.then((reg) => reg.showNotification('Prospection', { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'relances' }))
      .catch(() => new Notification('Prospection', { body }));
  } catch { /* ignore */ }
}
function readSetupHash() {
  const m = location.hash.match(/setup=([^&]+)&token=([^&]+)/);
  if (!m) return null;
  history.replaceState(null, '', location.pathname + location.search);
  return { url: decodeURIComponent(m[1]), token: decodeURIComponent(m[2]) };
}
async function start() {
  const setup = readSetupHash();
  store.addEventListener('change', () => {
    recompute();
    render();
    overlays.forEach((o) => o.refresh?.());
    updateSync();
  });
  store.addEventListener('status', updateSync);
  store.addEventListener('queue', updateSync);
  await store.init();
  if (setup) {
    try { await store.configure('api', setup.url, setup.token); toast('Application configurée.'); } catch (err) { toast(`Configuration impossible : ${err.message}`); }
  } else if (store.configured) {
    await store.sync(true);
  }
  render();
  notifyOnOpen();
  // Minuit passé (application restée ouverte) : on recalcule la journée.
  setInterval(() => { if (L.todayISO() !== today) { recompute(); render(); } }, 60000);
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker', err));
start();
