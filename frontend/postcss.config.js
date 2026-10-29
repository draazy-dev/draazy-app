import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import minFontSize from './src/styles/min-font-size.js';

export default {
  plugins: [
    tailwindcss(),
    autoprefixer(),
    minFontSize(),
  ],
};
