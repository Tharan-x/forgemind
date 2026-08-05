/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: [require.resolve('./index.js')],
  env: {
    browser: true,
    es2022: true,
  },
  plugins: ['react', 'react-hooks', '@next/eslint-plugin-next'],
  extends: [
    require.resolve('./index.js'),
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'next/core-web-vitals',
    'prettier',
  ],
  rules: {
    'react/react-in-jsx-scope': 'off', // Not needed with React 17+ JSX transform
    'react/prop-types': 'off',         // TypeScript handles this
  },
  settings: {
    react: { version: 'detect' },
  },
};
