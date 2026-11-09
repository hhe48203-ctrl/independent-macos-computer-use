import globals from 'globals';

export default [
  {
    files: ['src/**/*.{js,mjs}'],
    languageOptions: { globals: globals.nodeBuiltin },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { ignoreRestSiblings: true }],
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
    },
  },
  {
    files: ['src/server.mjs'],
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-restricted-properties': ['error', {
        object: 'process',
        property: 'stdout',
        message: 'MCP owns stdout. Send diagnostics to stderr.',
      }],
    },
  },
];
