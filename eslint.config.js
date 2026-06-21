import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'prefer-const': 'off',
      'no-var': 'off',
      'no-console': 'off',
      'no-empty': 'off',
      'no-constant-condition': 'off',
      'no-prototype-builtins': 'off',
      'no-control-regex': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', '*.js', '*.mjs', 'src/viewer/dagre.min.js'],
  },
);
