// Simulation minimale des services Google (SpreadsheetApp, LockService, ContentService, CalendarApp, MailApp…)
// pour exécuter apps-script/Code.gs dans Node avec des données factices.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';

function makeSheet(name) {
  const data = []; // tableau 2D
  const sh = {
    name, data, frozen: 0,
    getName: () => name,
    getLastRow: () => { for (let r = data.length; r > 0; r--) if (data[r - 1].some((c) => c !== '' && c != null)) return r; return 0; },
    getLastColumn: () => data.reduce((m, r) => { let l = 0; r.forEach((c, i) => { if (c !== '' && c != null) l = i + 1; }); return Math.max(m, l); }, 0),
    getMaxRows: () => Math.max(1000, data.length), getMaxColumns: () => Math.max(26, sh.getLastColumn()),
    setFrozenRows: (n) => { sh.frozen = n; }, setColumnWidth: () => sh,
    appendRow: (row) => { const r = sh.getLastRow(); setCells(r + 1, 1, [row]); },
    getRange: (a, b, c, d) => {
      if (typeof a === 'string') { const col = a.charCodeAt(0) - 64; return range(1, col, sh.getMaxRows(), 1); }
      return range(a, b, c || 1, d || 1);
    },
  };
  function setCells(r0, c0, vals) {
    vals.forEach((row, i) => {
      while (data.length < r0 + i) data.push([]);
      row.forEach((v, j) => { data[r0 - 1 + i][c0 - 1 + j] = v; });
    });
  }
  function range(r0, c0, nr, nc) {
    const rg = {
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => { const v = (data[r0 - 1 + i] || [])[c0 - 1 + j]; return v == null ? '' : v; })),
      setValues: (vals) => { if (vals.length !== nr || vals.some((r) => r.length !== nc)) throw new Error('Dimensions incorrectes'); setCells(r0, c0, vals); return rg; },
      setValue: (v) => { setCells(r0, c0, [[v]]); return rg; },
      clearContent: () => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (data[r0 - 1 + i]) data[r0 - 1 + i][c0 - 1 + j] = ''; return rg; },
      setFontWeight: () => rg, setNumberFormat: () => rg,
      setNumberFormats: (f) => { if (f.length !== nr) throw new Error('formats'); return rg; },
    };
    return rg;
  }
  return sh;
}

export function createGAS() {
  const sheets = new Map();
  const ss = {
    getSheetByName: (n) => sheets.get(n) || null,
    insertSheet: (n) => { const s = makeSheet(n); sheets.set(n, s); return s; },
    setSpreadsheetTimeZone: () => {},
  };
  const calendar = []; const mails = []; let lockHeld = false;
  const people = { contacts: [], groups: [], members: {} };
  const fmt = (d, tz, pattern) => {
    const o = {}; new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      .formatToParts(d).forEach((p) => { o[p.type] = p.value; });
    return pattern.replace('yyyy', o.year).replace('MM', o.month).replace('dd', o.day).replace('HH', o.hour).replace('mm', o.minute).replace(/'T'/, 'T').replace('ss', o.second).replace('XXX', '+01:00');
  };
  const mkEv = (title, start, end, opts, allDay) => { const e = { title, start, end, opts, allDay, reminders: [], getTitle: () => title, deleteEvent: () => { calendar.splice(calendar.indexOf(e), 1); }, removeAllReminders: () => { e.reminders = []; }, addPopupReminder: (m) => e.reminders.push(m) }; calendar.push(e); return e; };
  const ctx = {
    console: { log: () => {}, warn: () => {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, getUi: () => { throw new Error('no ui'); } },
    LockService: { getScriptLock: () => ({ tryLock: () => { if (lockHeld) return false; lockHeld = true; return true; }, releaseLock: () => { lockHeld = false; } }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ content: s, setMimeType() { return this; } }) },
    Utilities: {
      getUuid: () => randomUUID(), formatDate: fmt,
      parseDate: (s) => { const [d, t] = s.split(' '); return new Date(`${d}T${t || '00:00'}:00+01:00`); },
    },
    CalendarApp: { getDefaultCalendar: () => ({ createEvent: (t, s, e, o) => mkEv(t, s, e, o, false), createAllDayEvent: (t, d, o) => mkEv(t, d, d, o, true), getEvents: (s, e) => calendar.filter((x) => x.start >= s && x.start < e) }) },
    MailApp: { sendEmail: (to, subject, body) => mails.push({ to, subject, body }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'proprietaire@example.com' }) },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/FAUX/exec' }), getProjectTriggers: () => [], newTrigger: () => ({}) },
    HtmlService: {},
    People: {
      ContactGroups: {
        list: () => ({ contactGroups: people.groups.map((g) => ({ ...g })) }),
        create: ({ contactGroup }) => { const g = { resourceName: `contactGroups/${people.groups.length + 1}`, name: contactGroup.name }; people.groups.push(g); return g; },
        Members: { modify: (req, group) => { (people.members[group] = people.members[group] || []).push(...req.resourceNamesToAdd); return {}; } },
      },
      People: {
        createContact: (p) => { const r = { resourceName: `people/c${people.contacts.length + 1}`, ...p }; people.contacts.push(r); return r; },
        Connections: { list: () => ({ connections: people.contacts.map((c) => ({ phoneNumbers: c.phoneNumbers })) }) },
      },
    },
  };
  vm.createContext(ctx);
  const code = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
  vm.runInContext(code + '\n;globalThis.__api = { doPost, doGet, setup, readConfig_, dailyDigest, computeDigest_, fillMissingIds, selfTest, handle_, syncMissingContacts };', ctx);
  const api = ctx.__api;
  const post = (body) => JSON.parse(api.doPost({ postData: { contents: JSON.stringify(body) } }).content);
  return { api, ctx, sheets, calendar, mails, people, post, token: () => api.readConfig_(true).jeton };
}
