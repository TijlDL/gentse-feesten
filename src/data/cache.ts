/* ================= DATACACHE (IndexedDB) =================
   De opgehaalde open-data-records worden lokaal bewaard en maar
   1× per feestdag opnieuw opgehaald. De cache is ongeldig zodra:
   - de feestdag wisselt (07u-grens — zelfde venster als de app), of
   - er een nieuwe build gedeployed is (buildId verschilt), of
   - de gebruiker expliciet op "Vernieuwen" drukt (force). */

const DB = 'gf-cache', STORE = 'kv', KEY = 'opendata';

export interface GFCache {
  buildId: string;
  dagKey: string;
  fetchedAt: number;
  used: string;          // gebruikte dataset-id
  recs: any[];           // volledige events-dataset (fase C)
  locRecs: any[] | null; // join-datasets
  thRecs: any[] | null;
}

/** Build-id van deze bundel (vite define); 'dev' als fallback. */
export const BUILD_ID: string = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';

/** Feestdag-sleutel: vóór 07u lokaal hoort de nacht nog bij gisteren. */
export function dagKeyNu(): string {
  const d = new Date(Date.now() - 7 * 3600e3);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const rq = indexedDB.open(DB, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore(STORE);
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}

/** Lees de cache; null bij afwezig/ongeldig/geen IndexedDB (private mode). */
export async function cacheLees(): Promise<GFCache | null> {
  try {
    const db = await openDb();
    return await new Promise(res => {
      const rq = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      rq.onsuccess = () => res((rq.result as GFCache) ?? null);
      rq.onerror = () => res(null);
    });
  } catch (_) { return null; }
}

/** Bewaar de cache; fouten (quota, private mode) worden stil genegeerd. */
export async function cacheZet(c: GFCache): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(c, KEY);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch (_) {/* cache is best effort */ }
}

/** Is deze cache nu geldig? */
export function cacheGeldig(c: GFCache | null): c is GFCache {
  return !!c && c.buildId === BUILD_ID && c.dagKey === dagKeyNu() && Array.isArray(c.recs) && c.recs.length > 0;
}
