/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  extends: ['@forgemind/eslint-config'],
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: './tsconfig.json',
  },
  env: {
    node: true,
    es2022: true,
  },
};
