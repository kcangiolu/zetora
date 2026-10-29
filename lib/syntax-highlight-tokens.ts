import type { CSSProperties } from 'react';

// react-syntax-highlighter keeps a token's class names when the theme has no entry for them, and
// some Prism token names are also Tailwind utilities: a Markdown table cell (`table`) would get
// `display: table` and land on its own line. An empty entry strips the class.
export const tailwindTokenNames: { [key: string]: CSSProperties } = {
  block: {},
  inline: {},
  outline: {},
  static: {},
  table: {},
};
