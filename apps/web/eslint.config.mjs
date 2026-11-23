import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Photos are already resized and re-encoded to WebP by the API (C-05); next/image's optimizer
      // would only re-fetch them through the dev server. Plain <img> with width/height is enough.
      '@next/next/no-img-element': 'off',
    },
  },
  { ignores: ['.next/**', 'next-env.d.ts', 'coverage/**'] },
];

export default config;
