/**
 * offline_storage.js
 * IndexedDB wrapper for My Library offline exam storage.
 * Stores exam JSON + PDF bytes. Checked on startup to delete
 * files flagged is_deleted by the server.
 */
const DB_NAME    = 'aic_library';
const DB_VERSION = 1;
const STORE_NAME = 'exams';

class OfflineLibrary {
  constructor() {
    this.db = null;
  }

  async open() {
    return new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'exam_id' });
        }
      };
      req.onsuccess = e => { this.db = e.target.result; res(this); };
      req.onerror   = e => rej(e.target.error);
    });
  }

  async save(examId, data) {
    const tx    = this.db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((res, rej) => {
      const req = store.put({ exam_id: examId, ...data, saved_at: Date.now() });
      req.onsuccess = () => res(true);
      req.onerror   = e => rej(e.target.error);
    });
  }

  async load(examId) {
    const tx    = this.db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((res, rej) => {
      const req = store.get(examId);
      req.onsuccess = e => res(e.target.result || null);
      req.onerror   = e => rej(e.target.error);
    });
  }

  async delete(examId) {
    const tx    = this.db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((res, rej) => {
      const req = store.delete(examId);
      req.onsuccess = () => res(true);
      req.onerror   = e => rej(e.target.error);
    });
  }

  async listAll() {
    const tx    = this.db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((res, rej) => {
      const req = store.getAll();
      req.onsuccess = e => res(e.target.result);
      req.onerror   = e => rej(e.target.error);
    });
  }

  /** Called on page load: purge server-flagged deleted files */
  async syncDeletions(deletedIds = []) {
    for (const id of deletedIds) await this.delete(id);
  }
}

window.offlineLibrary = new OfflineLibrary();
window.offlineLibrary.open().catch(console.error);