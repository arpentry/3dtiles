import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Expose environment variables to the client
    'process.env': process.env,
  },
  // Ensure environment variables are available during build
  envPrefix: 'VITE_',
});
