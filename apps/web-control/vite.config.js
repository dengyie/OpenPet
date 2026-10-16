const { defineConfig } = require('vite')
const react = require('@vitejs/plugin-react')
const path = require('node:path')

module.exports = defineConfig({
  root: __dirname,
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, '../../dist/web-control'),
    emptyOutDir: true,
    sourcemap: false
  }
})
