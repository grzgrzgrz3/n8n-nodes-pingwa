module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { sourceType: 'module', extraFileExtensions: ['.json'] },
  ignorePatterns: ['dist/**', 'node_modules/**', '**/*.test.ts', 'jest.config.js', 'gulpfile.js', '.eslintrc.js'],
  overrides: [
    {
      files: ['package.json'],
      plugins: ['eslint-plugin-n8n-nodes-base'],
      extends: ['plugin:n8n-nodes-base/community'],
      rules: { 'n8n-nodes-base/community-package-json-name-still-default': 'off' },
    },
    {
      files: ['./credentials/**/*.ts', './nodes/**/*.ts'],
      plugins: ['eslint-plugin-n8n-nodes-base'],
      extends: ['plugin:n8n-nodes-base/nodes'],
    },
  ],
};
