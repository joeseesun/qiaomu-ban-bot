import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
export default defineConfig({define:{DEBUG_MODE:false},test:{include:['src/writer/**/*.test.ts'],maxWorkers:4,globals:true,alias:{'webextension-polyfill':fileURLToPath(new URL('./src/writer/utils/__mocks__/webextension-polyfill.ts',import.meta.url))}}});
