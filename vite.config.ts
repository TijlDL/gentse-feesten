import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' → relatieve assets: werkt op tijldl.github.io/gentse-feesten/,
// op een custom domein én lokaal via `vite preview`.

// Unieke id per build: stuurt (1) de cache-invalidatie van de open data
// (eerste start na een deploy haalt opnieuw op) en (2) de versie-check
// die openstaande tabs na een deploy automatisch laat verversen.
const buildId = new Date().toISOString();

export default defineConfig({
  base: './',
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  plugins: [
    react(),
    {
      name: 'gf-version-json',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ buildId }) });
      },
    },
  ],
});
