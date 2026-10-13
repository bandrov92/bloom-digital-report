/**
 * Tailwind build config. css/tailwind.css is generated from src/tailwind.css by
 * `npm run build:css`, keeping only the classes used in these files.
 * Re-run the build after adding new Tailwind classes to any root page or js/ file.
 * Pages: index.html (portal), trainee.html (training kit), trainer.html (dashboard).
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: ['./*.html', './js/**/*.js'],
  theme: { extend: {} },
  plugins: [],
};
