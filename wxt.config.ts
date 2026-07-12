import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'File Tools',
    description: 'Open ZIP files offline and privately — nothing is uploaded.',
    permissions: [],
    action: {},
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
    browser_specific_settings: {
      gecko: {
        id: 'file-tools@local',
        data_collection_permissions: { required: ['none'] },
      },
    },
  },
  vite: () => ({ plugins: [tailwindcss()] }),
});
