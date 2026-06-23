const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 4000;
const DB_PATH = path.join(__dirname, '..', 'data.sqlite');
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const PHOTOS_DIR = path.join(UPLOADS_DIR, 'photos');
const DOCUMENTS_DIR = path.join(UPLOADS_DIR, 'documents');

for (const dir of [UPLOADS_DIR, PHOTOS_DIR, DOCUMENTS_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const db = new sqlite3.Database(DB_PATH);
db.run('PRAGMA foreign_keys = ON');

const dbRun = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function runCallback(err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });

const dbGet = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });

const dbAll = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });

const initDb = async () => {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      date_of_birth TEXT,
      contact_info TEXT,
      spouse_name TEXT,
      children_details TEXT,
      blood_relations TEXT,
      height REAL,
      weight REAL,
      insurance_policy TEXT,
      photo_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      original_name TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE
    )
  `);
};

const safeName = (name) => name.replace(/[^a-zA-Z0-9._-]/g, '_');

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, file, cb) => {
      cb(null, file.fieldname === 'photo' ? PHOTOS_DIR : DOCUMENTS_DIR);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      const base = path.basename(file.originalname, ext);
      cb(null, `${Date.now()}-${safeName(base)}${safeName(ext)}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));

const toArrayString = (value) => {
  if (!value) return JSON.stringify([]);
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(Array.isArray(parsed) ? parsed : [value]);
    } catch {
      return JSON.stringify(value.split(',').map((item) => item.trim()).filter(Boolean));
    }
  }
  return JSON.stringify([String(value)]);
};

const safeParse = (value, fallback) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const createRateLimiter = ({ windowMs, maxRequests }) => {
  const requests = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const recent = (requests.get(key) || []).filter((ts) => now - ts < windowMs);

    if (recent.length >= maxRequests) {
      return res.status(429).json({ message: 'Too many requests. Please try again later.' });
    }

    recent.push(now);
    requests.set(key, recent);
    next();
  };
};

const fileMutationLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 30 });

const parseCustomer = (row, req) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const photoUrl = row.photo_path ? `${baseUrl}/${row.photo_path.replace(/\\/g, '/')}` : null;
  return {
    ...row,
    contact_info: safeParse(row.contact_info, { phone: '', email: '', address: '' }),
    children_details: safeParse(row.children_details, []),
    blood_relations: safeParse(row.blood_relations, []),
    insurance_policy: safeParse(row.insurance_policy, {}),
    photo_url: photoUrl,
  };
};

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/dashboard', async (req, res, next) => {
  try {
    const total = await dbGet('SELECT COUNT(*) as count FROM customers');
    const recentRows = await dbAll('SELECT * FROM customers ORDER BY datetime(created_at) DESC LIMIT 5');
    res.json({
      totalCustomers: total?.count || 0,
      recentCustomers: recentRows.map((row) => parseCustomer(row, req)),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/customers', async (req, res, next) => {
  try {
    const search = req.query.search?.trim();
    let rows;
    if (search) {
      const like = `%${search}%`;
      rows = await dbAll(
        `SELECT * FROM customers
         WHERE name LIKE ? OR contact_info LIKE ? OR insurance_policy LIKE ?
         ORDER BY datetime(created_at) DESC`,
        [like, like, like],
      );
    } else {
      rows = await dbAll('SELECT * FROM customers ORDER BY datetime(created_at) DESC');
    }

    res.json(rows.map((row) => parseCustomer(row, req)));
  } catch (error) {
    next(error);
  }
});

app.get('/api/customers/:id', async (req, res, next) => {
  try {
    const row = await dbGet('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ message: 'Customer not found' });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const documents = await dbAll('SELECT * FROM documents WHERE customer_id = ? ORDER BY datetime(uploaded_at) DESC', [req.params.id]);

    res.json({
      ...parseCustomer(row, req),
      documents: documents.map((doc) => ({
        ...doc,
        url: `${baseUrl}/${doc.file_path.replace(/\\/g, '/')}`,
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/customers', fileMutationLimiter, upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'documents', maxCount: 10 }]), async (req, res, next) => {
  try {
    const { name, date_of_birth, contact_info, spouse_name, children_details, blood_relations, height, weight, insurance_policy } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ message: 'Name is required' });
    }

    const photo = req.files?.photo?.[0];
    const documents = req.files?.documents || [];

    const result = await dbRun(
      `INSERT INTO customers
       (name, date_of_birth, contact_info, spouse_name, children_details, blood_relations, height, weight, insurance_policy, photo_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        date_of_birth || null,
        contact_info || JSON.stringify({ phone: '', email: '', address: '' }),
        spouse_name || null,
        children_details || JSON.stringify([]),
        toArrayString(blood_relations),
        height || null,
        weight || null,
        insurance_policy || JSON.stringify({}),
        photo ? path.join('uploads', 'photos', photo.filename) : null,
      ],
    );

    await Promise.all(
      documents.map((doc) =>
        dbRun(
          `INSERT INTO documents (customer_id, original_name, file_name, file_path, mime_type)
           VALUES (?, ?, ?, ?, ?)`,
          [
            result.id,
            doc.originalname,
            doc.filename,
            path.join('uploads', 'documents', doc.filename),
            doc.mimetype,
          ],
        ),
      ),
    );

    const created = await dbGet('SELECT * FROM customers WHERE id = ?', [result.id]);
    res.status(201).json(parseCustomer(created, req));
  } catch (error) {
    next(error);
  }
});

app.put('/api/customers/:id', fileMutationLimiter, upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'documents', maxCount: 10 }]), async (req, res, next) => {
  try {
    const existing = await dbGet('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ message: 'Customer not found' });

    const { name, date_of_birth, contact_info, spouse_name, children_details, blood_relations, height, weight, insurance_policy } = req.body;
    const photo = req.files?.photo?.[0];
    const documents = req.files?.documents || [];

    if (photo && existing.photo_path) {
      await fsp.rm(path.join(__dirname, '..', existing.photo_path), { force: true });
    }

    await dbRun(
      `UPDATE customers SET
        name = ?,
        date_of_birth = ?,
        contact_info = ?,
        spouse_name = ?,
        children_details = ?,
        blood_relations = ?,
        height = ?,
        weight = ?,
        insurance_policy = ?,
        photo_path = ?,
        updated_at = datetime('now')
       WHERE id = ?`,
      [
        name?.trim() || existing.name,
        date_of_birth ?? existing.date_of_birth,
        contact_info ?? existing.contact_info,
        spouse_name ?? existing.spouse_name,
        children_details ?? existing.children_details,
        blood_relations ? toArrayString(blood_relations) : existing.blood_relations,
        height ?? existing.height,
        weight ?? existing.weight,
        insurance_policy ?? existing.insurance_policy,
        photo ? path.join('uploads', 'photos', photo.filename) : existing.photo_path,
        req.params.id,
      ],
    );

    await Promise.all(
      documents.map((doc) =>
        dbRun(
          `INSERT INTO documents (customer_id, original_name, file_name, file_path, mime_type)
           VALUES (?, ?, ?, ?, ?)`,
          [
            req.params.id,
            doc.originalname,
            doc.filename,
            path.join('uploads', 'documents', doc.filename),
            doc.mimetype,
          ],
        ),
      ),
    );

    const updated = await dbGet('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    res.json(parseCustomer(updated, req));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/customers/:id/documents/:docId', fileMutationLimiter, async (req, res, next) => {
  try {
    const doc = await dbGet('SELECT * FROM documents WHERE id = ? AND customer_id = ?', [req.params.docId, req.params.id]);
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    await dbRun('DELETE FROM documents WHERE id = ?', [req.params.docId]);
    await fsp.rm(path.join(__dirname, '..', doc.file_path), { force: true });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.delete('/api/customers/:id', fileMutationLimiter, async (req, res, next) => {
  try {
    const customer = await dbGet('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    const docs = await dbAll('SELECT * FROM documents WHERE customer_id = ?', [req.params.id]);
    await dbRun('DELETE FROM documents WHERE customer_id = ?', [req.params.id]);
    await dbRun('DELETE FROM customers WHERE id = ?', [req.params.id]);

    await Promise.all([
      ...docs.map((doc) => fsp.rm(path.join(__dirname, '..', doc.file_path), { force: true })),
      customer.photo_path ? fsp.rm(path.join(__dirname, '..', customer.photo_path), { force: true }) : Promise.resolve(),
    ]);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  res.status(status).json({ message: err.message || 'Internal server error' });
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Backend listening on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database', error);
    process.exit(1);
  });
