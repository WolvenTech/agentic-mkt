import js from '@eslint/js';

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'marketing-pipelines/**',
      // Files with @@ placeholder tokens - cannot be parsed as-is (tokens valid only after rendering)
      'src/workflows/call-agent/code-nodes/assemble-prompt.js',
      'src/workflows/call-agent/code-nodes/parse-agent-output.js',
      'src/workflows/marketing-pipeline/code-nodes/extract-task-fields.js',
      'src/workflows/marketing-pipeline/code-nodes/format-draft-comment.js',
    ],
  },
  // All Code node source files - basic linting
  {
    files: ['src/workflows/*/code-nodes/**/*.js'],
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
