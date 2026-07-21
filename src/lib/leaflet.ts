/* Leaflet wordt pas geladen wanneer de kaartweergave voor het eerst opent. */
let leafP: Promise<void> | null = null;

export function ensureLeaflet(): Promise<void> {
  if (window.L) return Promise.resolve();
  if (leafP) return leafP;
  leafP = new Promise((res, rej) => {
    const l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.appendChild(l);
    const sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    sc.onload = () => res(); sc.onerror = () => rej(new Error('leaflet niet bereikbaar'));
    document.head.appendChild(sc);
    setTimeout(() => window.L ? res() : rej(new Error('leaflet timeout')), 9000);
  });
  return leafP;
}
