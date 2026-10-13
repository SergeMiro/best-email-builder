import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.js',
    builder: 'src/builder.js',
    library: 'src/library.js',
    server: 'src/server/index.js',
  },
  format: ['esm'],
  target: 'es2022',
  platform: 'neutral',
  splitting: true,
  sourcemap: true,
  clean: false,
  outDir: 'dist',
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
  // Dependencies stay external: the application's bundler resolves them.
  skipNodeModulesBundle: true,
  external: [/^node:/, 'react', 'react-dom', 'react/jsx-runtime'],
});
