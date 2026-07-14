import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  zip: {
    // Name the packaged artifacts after the product (unzip-<version>-<browser>.zip)
    // without renaming the package, which would move the /file-tools/ Pages path.
    name: 'unzip',
  },
  manifest: ({ browser }) => ({
    name: 'Unzip',
    description: 'Private, offline ZIP extraction for Firefox and Chrome, entirely in your browser.',
    permissions: [],
    action: {},
    content_security_policy: {
      extension_pages:
        "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'",
    },
    // browser_specific_settings.gecko is Firefox-only; emitting it in the Chrome
    // build triggers an "unrecognized manifest key" warning, so gate it by target.
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'unzip@animesh.kundus.in',
              data_collection_permissions: { required: ['none'] },
            },
          },
        }
      : {}),
  }),
  vite: () => ({
    plugins: [tailwindcss()],
    // Disable Vite's module-preload polyfill so the built bundle contains no
    // fetch() shim. Modern Chrome and Firefox support modulepreload natively.
    build: { modulePreload: { polyfill: false } },
  }),
});
