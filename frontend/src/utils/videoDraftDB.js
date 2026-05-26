/**
 * videoDraftDB.js
 * Tiny IndexedDB wrapper for persisting a recorded video draft.
 *
 * localStorage has a 5 MB limit — far too small for video.
 * IndexedDB holds hundreds of MB and survives page refresh.
 *
 * API:
 *   saveDraft({ blob, mimeType, elapsed })  → Promise<void>
 *   loadDraft()                             → Promise<{ blob, mimeType, elapsed } | null>
 *   clearDraft()                            → Promise<void>
 */

const DB_NAME    = "speakshine_drafts";
const STORE_NAME = "video";
const DRAFT_KEY  = "recorded_video_draft";
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

/**
 * Save a video draft to IndexedDB.
 * Overwrites any existing draft (only one draft at a time).
 */
export async function saveDraft({ blob, mimeType, elapsed }) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req   = store.put({ blob, mimeType, elapsed, savedAt: Date.now() }, DRAFT_KEY);
      req.onsuccess = () => resolve();
      req.onerror   = (e) => reject(e.target.error);
      tx.oncomplete = () => db.close();
    });
  } catch (err) {
    console.warn("[VideoDraft] saveDraft failed:", err);
  }
}

/**
 * Load the stored video draft, if any.
 * Returns null if no draft exists or IndexedDB is unavailable.
 */
export async function loadDraft() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req   = store.get(DRAFT_KEY);
      req.onsuccess = (e) => {
        db.close();
        const val = e.target.result;
        if (!val?.blob || val.blob.size === 0) return resolve(null);
        // Discard drafts older than 24 hours
        if (Date.now() - val.savedAt > 24 * 60 * 60 * 1000) {
          clearDraft().catch(() => {});
          return resolve(null);
        }
        resolve({ blob: val.blob, mimeType: val.mimeType, elapsed: val.elapsed });
      };
      req.onerror = (e) => { db.close(); reject(e.target.error); };
    });
  } catch (err) {
    console.warn("[VideoDraft] loadDraft failed:", err);
    return null;
  }
}

/**
 * Delete the stored draft (called on retake or after successful submit).
 */
export async function clearDraft() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req   = store.delete(DRAFT_KEY);
      req.onsuccess = () => resolve();
      req.onerror   = (e) => reject(e.target.error);
      tx.oncomplete = () => db.close();
    });
  } catch (err) {
    console.warn("[VideoDraft] clearDraft failed:", err);
  }
}
