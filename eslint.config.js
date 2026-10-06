import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // R3F: в useFrame объекты three.js меняют напрямую (позиции, uniform'ы) —
      // это норма для 60 кадров в секунду, а не мутация состояния React.
      'react-hooks/immutability': 'off',
    },
  },
  { files: ['*.config.{js,ts}'], languageOptions: { globals: globals.node } },
)
