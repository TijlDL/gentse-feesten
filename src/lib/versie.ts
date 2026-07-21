import { BUILD_ID } from '../data/cache';

/* ================= VERSIE-CHECK =================
   Na een deploy krijgt iedereen de nieuwe versie zonder hard refresh:
   we vergelijken periodiek (en bij het terugkeren naar het tabblad)
   version.json op de server met de eigen BUILD_ID. Bij verschil →
   automatisch herladen. sessionStorage voorkomt een reload-lus als
   de CDN-cache nog even achterloopt. */

export function startVersieWacht(): void {
  if (import.meta.env.DEV) return;
  let bezig = false;
  const check = async () => {
    if (bezig || document.hidden) return;
    bezig = true;
    try {
      const r = await fetch('./version.json?t=' + Date.now(), { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        if (j && j.buildId && j.buildId !== BUILD_ID) {
          const k = 'gf-herladen-' + j.buildId;
          if (!sessionStorage.getItem(k)) {
            sessionStorage.setItem(k, '1');
            location.reload();
          }
        }
      }
    } catch (_) {/* offline of geblokkeerd: gewoon later opnieuw */ }
    bezig = false;
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  setInterval(check, 10 * 60 * 1000);
  setTimeout(check, 5000); /* ook kort na het opstarten (stale index.html uit browsercache) */
}
