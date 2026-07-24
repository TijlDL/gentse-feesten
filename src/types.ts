/* ================= DOMEINTYPES ================= */

/** Coördinaat als [lat, lon] — zoals de dataset ze aanlevert. */
export type Coord = [number, number];

export type GenreKey = 'dj' | 'rock' | 'world' | 'pop' | 'folk' | 'klassiek' | 'kids' | 'theater';

/** Eén programmapunt (na verwerking van een open-data-record). */
export interface GFEvent {
  id: string;
  dag: number;            // feestdag (17..26); uren <07:00 tellen bij de vorige dag
  start: number;          // uur in feestdag-venster (9..31); 02:00 → 26
  dur: number;            // duur in uren (na duurbepaling)
  rawDur?: number | null; // duur uit een vertrouwd eindveld, anders null
  eindeGeschat?: boolean; // einde is een schatting (geen betrouwbaar eindveld) → toon "±"
  titel: string;
  plein: string | null;   // plein-id, of null → "doorlopend & elders"
  genre: GenreKey;
  gratis: boolean;
  kids: boolean;
  demo?: boolean;
  img?: string | null;
  descr?: string | null;
  loc?: string | null;    // ruwe locatienaam uit de dataset
  url?: string | null;
  cat?: string | null;    // categorie voor de rest-strook (expo/wandeling/water/doorlopend/elders)
}

/** Eén rij in het raster: een feestplein of een live-locatie. */
export interface Rij {
  id: string;
  naam: string;
  tag: string;
  /** dag-anker: representatieve coord per feestdag (uit de dataset) */
  dagCoord?: Record<number, Coord>;
  /** alle clusters van die dag — afstand rekent tegen de dichtstbijzijnde */
  dagPts?: Record<number, Coord[]>;
  sec?: string;           // 'elders' → rij hoort in de elders-sectie
}

export interface GenreDef { label: string; c: string }

export type View = 'tijd' | 'kaarten' | 'kaart';

/** Centrale UI-state — zelfde vorm als het vanilla `state`-object.
    N.B.: de liniaal-tijd (`state.tijd` in vanilla) leeft bewust in een ref
    (tijdRef in App) — scrubben muteert die zónder re-render, zoals voorheen.
    `loading`/`loadError` leven in de data-store. */
export interface State {
  zoekOpen: boolean;
  geo: Coord | null;
  geoBusy: boolean;
  dag: number;
  genres: Set<string>;
  pleinen: Set<string>;
  gratisOnly: boolean;    // filter: enkel gratis tonen (standaard uit → alles tonen)
  kids: boolean;
  q: string;
  van: number | null;     // tijdsvenster-filter
  tot: number | null;
  view: View;
}

/** Categorie-bundel voor de "doorlopend & elders"-strook. */
export interface StripCat {
  cat: string;
  n: number;
  items: { tt: string; nm: string }[];
}

/* ================= DIAGNOSE-GLOBALS =================
   Bewust op window — gedocumenteerd gereedschap voor het finetunen
   van PLEIN_MATCH / PLEIN_ZONES (zie CLAUDE.md). */
declare global {
  interface Window {
    L?: any;                                   // Leaflet (lazy via CDN)
    GF_AUDIT?: unknown;
    GF_GROEPEN?: unknown;
    GF_ELDERS?: unknown;
    GF_BAUDELO?: unknown;
    GF_KALIBRATIE?: unknown;
    _GF_PLEIN_COORDS?: Record<string, Coord>;
    _GF_KAL_COORDS?: Record<string, Coord>;
    _GF_LOCGEO?: Map<string, Coord>;
  }
}
