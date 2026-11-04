import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'shared'),
      '@database': resolve(__dirname, 'database'),
      '@': resolve(__dirname, 'src')
    }
  },
  test: {
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    // Renderer tests opt into jsdom with a `// @vitest-environment jsdom` header.
    environment: 'node',
    setupFiles: ['tests/unit/setup.ts'],
    restoreMocks: true
  }
})
