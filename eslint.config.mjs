import { defineConfig } from 'eslint/config';
import angular from 'angular-eslint';
import tseslint from 'typescript-eslint';

export default defineConfig([
  { ignores: ['www/**', 'platforms/**', 'plugins/**', 'dist/**', 'coverage/**'] },
  {
    files: ['src/**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    plugins: { '@angular-eslint': angular.tsPlugin },
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/component-class-suffix': ['error', { suffixes: ['Page', 'Component'] }],
      '@angular-eslint/component-selector': ['error', { type: 'element', prefix: 'app', style: 'kebab-case' }],
      '@angular-eslint/directive-selector': ['error', { type: 'attribute', prefix: 'app', style: 'camelCase' }],
    },
  },
  {
    files: ['src/**/*.html'],
    extends: angular.configs.templateRecommended,
  },
]);
