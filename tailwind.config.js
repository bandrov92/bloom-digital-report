/**
 * Tailwind build config. css/tailwind.css is generated from src/tailwind.css by
 * `npm run build:css`, keeping only the classes used in these files.
 * Re-run the build after adding new Tailwind classes to any root page or js/ file.
 * Pages: index.html (portal), trainee.html (training kit), trainer.html (dashboard).
 * @type {import('tailwindcss').Config}
 */

/** System fallbacks shown while the web fonts load, or if they fail to load. */
const FALLBACK = ['"Segoe UI"', 'Tahoma', '"Noto Sans Arabic"', 'Arial', 'sans-serif'];

module.exports = {
  content: ['./*.html', './js/**/*.js'],
  theme: {
    extend: {
      fontFamily: {
        // font-sans is the default for <html> (Tailwind preflight): body copy.
        sans: ['"Thmanyah Serif Text"', ...FALLBACK],
        // font-display: headings (applied to h1–h6 in src/tailwind.css).
        display: ['"Thmanyah Serif Display"', ...FALLBACK],
      },
    },
  },
  plugins: [],
};
