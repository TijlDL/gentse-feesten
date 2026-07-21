import type { GenreDef, GenreKey, Rij } from './types';

/* ================= CONFIG ================= */
export const START_H = 9, END_H = 31;              // 09:00 -> 07:00 (+1d)
export const DAYS = [17, 18, 19, 20, 21, 22, 23, 24, 25, 26];
export const DOW: Record<number, string> = { 17: 'vr', 18: 'za', 19: 'zo', 20: 'ma', 21: 'di', 22: 'wo', 23: 'do', 24: 'vr', 25: 'za', 26: 'zo' };

/* Genrekleuren uit de Stad-Gent-huisstijl.
   Let op: GEEN groen — groen is exclusief het "nu bezig"-signaal
   (live-bolletje, groene tijden, "je bent hier"). */
export const GENRES: Record<GenreKey, GenreDef> = {
  dj:      { label: 'DJ & electro',     c: 'var(--gent-cyan)' },
  rock:    { label: 'Rock & punk',      c: 'var(--gent-red)' },
  world:   { label: 'World & latin',    c: 'var(--gent-orange)' },
  pop:     { label: 'Pop & covers',     c: 'var(--gent-yellow)' },
  folk:    { label: 'Folk & Gents',     c: 'var(--gf-accent)' },
  klassiek:{ label: 'Klassiek & jazz',  c: 'var(--gent-blue)' },
  kids:    { label: 'Kinderen',         c: 'var(--gent-red-pastel)' },
  theater: { label: 'Theater & circus', c: 'var(--gf-accent-dark)' },
};

export const PLEINEN: Rij[] = [
  { id: 'sintjacobs',  naam: 'Walter De Buckplein',   tag: 'Trefpunt · tot 02u' },
  { id: 'vlasmarkt',   naam: 'Camping Vlasmarkt',     tag: 'nachtpodium · tot 06u' },
  { id: 'beesten',     naam: 'Oude Beestenmarkt',     tag: 'dj & electro' },
  { id: 'polepole',    naam: 'Polé Polé',             tag: 'Graslei · world' },
  { id: 'baudelo',     naam: 'Baudelopark',           tag: 'familie & singer-songwriter' },
  { id: 'boomtown',    naam: 'Boomtown',              tag: 'Ha Concerts · nieuwe Belgische pop' },
  { id: 'korenmarkt',  naam: 'Korenmarkt',            tag: 'covers & ambiance' },
  { id: 'groenten',    naam: 'Groentenmarkt',         tag: 'bij het Groot Vleeshuis' },
  { id: 'vrijdagmarkt',naam: 'Vrijdagmarkt',          tag: 'volks & Nederlandstalig' },
  { id: 'sintbaafs',   naam: 'Sint-Baafsplein',       tag: 'klassiek & Gents' },
  { id: 'veerle',      naam: 'Sint-Veerleplein',      tag: 'bij het Gravensteen' },
  { id: 'laurent',     naam: 'François Laurentplein', tag: 'Luisterplein' },
  { id: 'miramiro',    naam: 'Miramiro',              tag: 'straattheater & circus' },
  { id: 'braun',       naam: 'Emile Braunplein',      tag: 'dans & urban' },
  { id: 'kouter',      naam: 'Kouter',                tag: 'bal & harmonie' },
];

/* korte, leesbare beschrijvingen per genre (fallback als de dataset er geen heeft) */
export const DESCR: Record<GenreKey, (t: string, p: string) => string> = {
  dj: (t, p) => `${t} draait op ${p} een set die de dansvloer niet loslaat. Van warme opbouw naar stevige piek — kom op tijd, het plein loopt snel vol.`,
  rock: (t, p) => `Gitaren, zweet en decibels: ${t} zet ${p} op stelten. Vooraan wordt gesprongen, achteraan meegebruld.`,
  world: (t, p) => `${t} brengt zuiderse en wereldse ritmes naar ${p}. Heupen los — stilstaan is hier geen optie.`,
  pop: (t, p) => `${t} speelt de hits die iedereen kent, van klassiekers tot recente knallers. Ambiance verzekerd op ${p}.`,
  folk: (t, p) => `${t} brengt volkse klanken en meezingers op ${p}, ergens tussen café chantant en kroegconcert. Het publiek zingt vanzelf mee.`,
  klassiek: (t, p) => `${t} zorgt voor een muzikaal rustpunt op ${p}: een zittend (of leunend) concert om even op adem te komen tussen het feestgedruis.`,
  kids: (t, p) => `${t}: een voorstelling op maat van kinderen, op ${p}. Vooraan zitten mag, meedoen ook. Ideaal met het hele gezin.`,
  theater: (t, p) => `${t} verrast op ${p} met straattheater en circus: acrobatie, humor en momenten waarop je de adem inhoudt.`,
};
