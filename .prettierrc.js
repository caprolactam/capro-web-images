import { config as epicWebConfig } from '@epic-web/config/prettier'

/** @type {import("prettier").Options} */
export default {
  ...epicWebConfig,
  jsxSingleQuote: true,
  singleAttributePerLine: true,
  useTabs: false,
}
