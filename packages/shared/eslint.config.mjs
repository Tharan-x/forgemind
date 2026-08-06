import baseConfig from '@forgemind/eslint-config';

/** @type {import("eslint").Linter.FlatConfig[]} */
const eslintConfig = [
  ...baseConfig,
  {
    ignores: ['node_modules/**', 'dist/**', '*.tsbuildinfo'],
  },
];

export default eslintConfig;
