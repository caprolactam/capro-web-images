import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { default as defaultConfig } from '@epic-web/config/eslint'
import { includeIgnoreFile } from '@eslint/compat'
import eslintConfigPrettier from 'eslint-config-prettier'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const gitignorePath = path.resolve(__dirname, '.gitignore')

/** @type {import("eslint").Linter.Config} */
export default [
  ...defaultConfig,
  eslintConfigPrettier,
  includeIgnoreFile(gitignorePath),
]
