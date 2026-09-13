// Flat ESLint config para todo el monorepo.
// Enfocado en seguridad: bloquea SQL crudo sin parametrizar, eval, innerHTML.
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/*.dc.html',
      'packages/db/prisma/migrations/**',
      '**/next-env.d.ts', // autogenerado por Next, no se edita ni se lintea
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // ── Seguridad ──────────────────────────────────────────────────────
      'no-restricted-properties': [
        'error',
        { object: 'prisma', property: '$queryRawUnsafe', message: 'SQLi: usá prisma.$queryRaw`...` (tagged template).' },
        { object: 'prisma', property: '$executeRawUnsafe', message: 'SQLi: usá prisma.$executeRaw`...` (tagged template).' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name=/\\$(query|execute)RawUnsafe/]",
          message: 'SQLi: prohibido *RawUnsafe. Usá la forma tagged template de Prisma.',
        },
        {
          selector: "CallExpression[callee.name='eval']",
          message: 'eval está prohibido.',
        },
      ],
      'react/no-danger': 'off', // se maneja abajo con no-restricted-syntax donde aplique

      // ── Calidad ────────────────────────────────────────────────────────
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/consistent-type-imports': 'warn',
    },
  },
  {
    // En componentes React, bloquear dangerouslySetInnerHTML sin sanitizar.
    files: ['**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'XSS: evitá dangerouslySetInnerHTML. Si es inevitable, sanitizá con DOMPurify y documentá el porqué.',
        },
      ],
    },
  },
);
