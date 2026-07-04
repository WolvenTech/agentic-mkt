import js from '@eslint/js';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'marketing-pipelines/**'],
  },
  // All Code node source files - basic linting
  {
    files: ['src/workflows/*/code-nodes/**/*.js'],
    // Code node source files may contain @@TOKEN@@ placeholders (ADR-003) that are
    // only valid JavaScript once rendered at workflow-build time. Rewrite each token
    // to a string literal of itself before parsing so lint coverage applies to the
    // whole file instead of excluding it; this does not affect the committed source.
    processor: {
      preprocess(text) {
        return [text.replace(/@@[A-Z_]+@@/g, (token) => JSON.stringify(token))];
      },
      postprocess(messages) {
        return messages[0] ?? [];
      },
      supportsAutofix: false,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        // n8n Code node runtime globals
        $input: 'readonly',
        $: 'readonly',
        $json: 'readonly',
        $execution: 'readonly',
        $getWorkflowStaticData: 'readonly',
        Buffer: 'readonly',
        Date: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];
