const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const emptyDb = {
  admins: [],
  sessions: [],
  departments: [],
  employees: [],
  menus: [],
  orders: [],
  balanceLogs: [],
  verifyLogs: [],
  auditLogs: [],
  devices: []
};

function normalizeDb(db) {
  return { ...emptyDb, ...db };
}

function ensureDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(emptyDb, null, 2));
}

function readDb() {
  ensureDb();
  return normalizeDb(JSON.parse(fs.readFileSync(DB_FILE, 'utf8')));
}

function writeDb(db) {
  ensureDb();
  fs.writeFileSync(DB_FILE, JSON.stringify(normalizeDb(db), null, 2));
}

function nextId(items) {
  return items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
}

function now() { return new Date().toISOString(); }
function money(value) { return Math.round(Number(value || 0) * 100) / 100; }
function today() { return new Date().toISOString().slice(0, 10); }
function uuid() { return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'); }
function sha256(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }

function addAudit(db, action, detail, operator = 'system') {
  db.auditLogs.push({ id: nextId(db.auditLogs || []), action, detail, operator, createdAt: now() });
}

function formatDateLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateLocal(value) {
  const [y, m, d] = String(value).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function eachDate(start, end) {
  const out = [];
  const d = parseDateLocal(start);
  const last = parseDateLocal(end);
  while (d <= last) {
    out.push(formatDateLocal(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

module.exports = { readDb, writeDb, nextId, now, money, today, uuid, sha256, addAudit, eachDate };
