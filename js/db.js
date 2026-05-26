// ── INDEXEDDB ─────────────────────────────────────────────────
const DB_NAME = 'F12XDB_v4';
const DB_VERSION = 1;
let db = null;

function initDB() {
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => { console.error('IndexedDB error', request.error); reject(request.error); };
      request.onsuccess = () => { db = request.result; resolve(db); };
      request.onupgradeneeded = (e) => {
        const database = e.target.result;
        if(!database.objectStoreNames.contains('batches')) database.createObjectStore('batches', { keyPath: 'batch_id' });
        if(!database.objectStoreNames.contains('interactions')) database.createObjectStore('interactions', { keyPath: 'id', autoIncrement: true });
        if(!database.objectStoreNames.contains('session')) database.createObjectStore('session', { keyPath: 'id' });
      };
    } catch (e) { reject(e); }
  });
}

async function saveBatchDB(batchData) {
  if(!db) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('batches', 'readwrite');
    const store = tx.objectStore('batches');
    const req = store.put(batchData);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function loadBatchesDB() {
  if(!db) return [];
  return new Promise((resolve, reject) => {
    const tx = db.transaction('batches', 'readonly');
    const store = tx.objectStore('batches');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function deleteBatchDB(batchId) {
  if(!db) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('batches', 'readwrite');
    const store = tx.objectStore('batches');
    const req = store.delete(batchId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function clearBatchesDB() {
  if(!db) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('batches', 'readwrite');
    const store = tx.objectStore('batches');
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function saveInteractionDB(interaction) {
  if(!db) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('interactions', 'readwrite');
    const store = tx.objectStore('interactions');
    const req = store.add(interaction);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function loadInteractionsDB() {
  if(!db) return [];
  return new Promise((resolve, reject) => {
    const tx = db.transaction('interactions', 'readonly');
    const store = tx.objectStore('interactions');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function clearInteractionsDB() {
  if(!db) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('interactions', 'readwrite');
    const store = tx.objectStore('interactions');
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function saveSessionDB(data) {
  if(!db) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('session', 'readwrite');
    const store = tx.objectStore('session');
    const req = store.put({ id: 'current', ...data });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function loadSessionDB() {
  if(!db) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('session', 'readonly');
    const store = tx.objectStore('session');
    const req = store.get('current');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
