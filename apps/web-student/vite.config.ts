import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@speak-shine/shared-types': path.resolve(__dirname, '../../packages/shared-types/src'),
      '@speak-shine/validation-schemas': path.resolve(__dirname, '../../packages/validation-schemas/src'),
      '@speak-shine/ui-kit': path.resolve(__dirname, '../../packages/ui-kit/src'),
    },
  },
  server: {
    port: 3000,
  },
});
