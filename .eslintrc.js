/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  extends: ['@forgemind/eslint-config'],
  ignorePatterns: [
    'node_modules/',
    'dist/',
    '.next/',
    '.turbo/',
    '*.tsbuildinfo',
    'apps/web/.next/',
    'packages/*/dist/',
  ],
};
