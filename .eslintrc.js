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
      files: ['./credentials/**/*.ts'],
      plugins: ['eslint-plugin-n8n-nodes-base'],
      extends: ['plugin:n8n-nodes-base/credentials'],
    },
    {
      files: ['./nodes/**/*.ts'],
      plugins: ['eslint-plugin-n8n-nodes-base'],
      extends: ['plugin:n8n-nodes-base/nodes'],
      rules: {
        // These demand the string literal 'main', while the n8n verification ruleset
        // (@n8n/community-nodes/node-connection-type-literal, enforced by
        // @n8n/scan-community-package) demands NodeConnectionTypes.Main. Verification wins.
        'n8n-nodes-base/node-class-description-inputs-wrong-regular-node': 'off',
        'n8n-nodes-base/node-class-description-inputs-wrong-trigger-node': 'off',
        'n8n-nodes-base/node-class-description-outputs-wrong': 'off',
      },
    },
  ],
};
