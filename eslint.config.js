import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

// Catch missing component imports: a Vite build alone does not detect <MissingPanel />.
const jsxIntegrity = {
  rules: {
    'defined-components': {
      meta: { type: 'problem', schema: [], messages: { missing: 'JSX component {{name}} is not defined or imported.' } },
      create(context) {
        return {
          JSXOpeningElement(node) {
            let name = node.name;
            while (name.type === 'JSXMemberExpression') name = name.object;
            if (name.type !== 'JSXIdentifier' || /^[a-z]/.test(name.name)) return;
            for (let scope = context.sourceCode.getScope(node); scope; scope = scope.upper) {
              if (scope.set.has(name.name)) {
                context.sourceCode.markVariableAsUsed(name.name, node);
                return;
              }
            }
            context.report({ node: name, messageId: 'missing', data: { name: name.name } });
          },
        };
      },
    },
  },
};

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: { 'jsx-integrity': jsxIntegrity },
    rules: {
      'jsx-integrity/defined-components': 'error',
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
])
