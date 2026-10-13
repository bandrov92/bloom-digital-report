/**
 * Tailwind build config. css/tailwind.css is generated from src/tailwind.css by
 * `npm run build:css`, keeping only the classes used in these files.
 * Re-run the build after adding new Tailwind classes to index.html or js/main.js.
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: ['./index.html', './js/**/*.js'],
  theme: { extend: {} },
  plugins: [],
};
