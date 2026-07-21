import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' → relatieve assets: werkt op tijldl.github.io/gentse-feesten/,
// op een custom domein én lokaal via `vite preview`.
export default defineConfig({
  base: './',
  plugins: [react()],
});
