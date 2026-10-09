/** @type {import('@ladle/react').UserConfig} */
export default {
  stories: 'stories/**/*.stories.{js,jsx}',
  port: 61010,
  viteConfig: '.ladle/vite.config.mjs',
  addons: { theme: { enabled: false }, width: { enabled: false } },
};
