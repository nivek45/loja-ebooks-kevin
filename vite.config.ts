import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';
import resources from './config/resources.json';

const LOCAL_DATABASE_ID = '00000000-0000-4000-8000-000000000000';

const workerConfig = {
  main: 'vinext/server/fetch-handler',
  compatibility_flags: ['nodejs_compat'],
  d1_databases: [
    {
      binding: resources.d1,
      database_name: 'loja-ebooks-db',
      database_id: LOCAL_DATABASE_ID,
      migrations_dir: './drizzle',
    },
  ],
  r2_buckets: [
    {
      binding: resources.r2,
      bucket_name: 'loja-ebooks-files',
    },
  ],
};

export default defineConfig(async () => {
  // Mantém logs e dados temporários das ferramentas no diretório do projeto.
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  const { cloudflare } = await import('@cloudflare/vite-plugin');

  return {
    css: { postcss: { plugins: [tailwindcss()] } },
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        config: workerConfig,
      }),
    ],
  };
});
