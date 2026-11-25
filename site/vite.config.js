import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  // SITE_URL is the same variable the asset build uses, so one setting covers both.
  const siteUrl = (env.VITE_SITE_URL || process.env.SITE_URL || '').replace(/\/+$/, '');
  return {
    plugins: [{
      // Social previews want a full address for the image when one is known.
      name: 'site-url',
      transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', siteUrl),
    }],
    build: {
      outDir: 'dist',
      target: 'es2020',
      rollupOptions: { input: { main: 'index.html', admin: 'admin.html' } },
    },
  };
});
