import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // 日付・タイムゾーンの扱いは src/lib/dates.ts に一本化する（設計書 02 §4）
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'date-fns', message: '日付処理は @/lib/dates を使ってください（JST固定）。' },
            { name: '@date-fns/tz', message: '日付処理は @/lib/dates を使ってください（JST固定）。' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/lib/dates.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
)
