/** Groen "nu bezig"-bolletje — zelfde vorm als het "je bent hier"-icoon.
    Samen met de groene tijd vormt dit het live-signaal; groen is bewust
    géén genrekleur (zie GENRES in config.ts). Kleur = currentColor,
    dus binnen .tr.on wordt hij vanzelf groen. */
export function LiveDot() {
  return (
    <svg viewBox="0 0 12 12" width="10" height="10" fill="currentColor"
      style={{ verticalAlign: '-0.5px', marginRight: 4 }} aria-label="nu bezig">
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="6" r="5.4" fill="none" stroke="currentColor" strokeWidth="1" opacity=".45" />
    </svg>
  );
}
