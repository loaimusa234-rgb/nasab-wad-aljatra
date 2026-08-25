const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PRIVATE_DIR = process.env.PRIVATE_DOCS_DIR || path.join(DATA_DIR, 'private_documents');
const DB_FILE = path.join(DATA_DIR, 'requests.json');
fs.mkdirSync(PRIVATE_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '[]');

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PRIVATE_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').slice(0, 10);
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 10 }
});

function readRequests() { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
function writeRequests(data) { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); }

app.get('/healthz', (_req, res) => res.status(200).json({ ok: true, service: 'nasab-wad-aljatra' }));
app.get('/api/requests', (_req, res) => res.json(readRequests().map(({ files, ...safe }) => ({ ...safe, fileCount: files?.length || 0 }))));

app.post('/api/requests', upload.fields([
  { name: 'personalPhoto', maxCount: 1 },
  { name: 'identityDocument', maxCount: 1 },
  { name: 'supportingDocuments', maxCount: 8 }
]), (req, res) => {
  const required = ['fullName', 'phone', 'birthDate', 'location', 'lineage'];
  const missing = required.filter(k => !String(req.body[k] || '').trim());
  if (missing.length) return res.status(400).json({ error: 'بيانات مطلوبة ناقصة', missing });
  if (!req.files?.personalPhoto?.[0] || !req.files?.identityDocument?.[0]) {
    return res.status(400).json({ error: 'الصورة الشخصية وإثبات الهوية مطلوبان' });
  }
  const requests = readRequests();
  const item = {
    id: `N-${new Date().getFullYear()}-${String(requests.length + 1).padStart(4, '0')}`,
    createdAt: new Date().toISOString(),
    status: 'قيد المراجعة',
    fullName: req.body.fullName,
    phone: req.body.phone,
    birthDate: req.body.birthDate,
    location: req.body.location,
    lineage: req.body.lineage,
    notes: req.body.notes || '',
    files: Object.values(req.files || {}).flat().map(f => ({ field: f.fieldname, storedName: f.filename, originalName: f.originalname }))
  };
  requests.push(item);
  writeRequests(requests);
  res.status(201).json({ id: item.id, status: item.status });
});

app.use((_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, '0.0.0.0', () => console.log(`Nasab Wad Aljatra listening on ${PORT}`));
