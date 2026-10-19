import { mathjax } from '@mathjax/src/mjs/mathjax.js';
import { TeX } from '@mathjax/src/mjs/input/tex.js';
import { SVG } from '@mathjax/src/mjs/output/svg.js';
import { MathJaxNewcmFont } from '@mathjax/mathjax-newcm-font/mjs/svg.js';
import { liteAdaptor } from '@mathjax/src/mjs/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from '@mathjax/src/mjs/handlers/html.js';
import '@mathjax/src/mjs/util/asyncLoad/esm.js';
import '@mathjax/src/mjs/input/tex/base/BaseConfiguration.js';
import '@mathjax/src/mjs/input/tex/ams/AmsConfiguration.js';

let mathJax: { adaptor: ReturnType<typeof liteAdaptor>; document: ReturnType<typeof mathjax.document> } | null = null;

// One MathJax document for the process: building it loads the TeX packages and fonts.
function getMathJax() {
  if (!mathJax) {
    const adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);
    const document = mathjax.document('', {
      InputJax: new TeX({ packages: ['base', 'ams'] }),
      OutputJax: new SVG({ fontCache: 'local', fontData: MathJaxNewcmFont }),
    });
    mathJax = { adaptor, document };
  }
  return mathJax;
}

// The SVG markup MathJax renders for a formula.
export function renderMathSvg(latex: string, display: boolean): string {
  const { adaptor, document } = getMathJax();
  return extractMathSvg(adaptor.outerHTML(document.convert(latex, { display })));
}

function extractMathSvg(markup: string) {
  const match = markup.match(/<svg[^>]*>[\s\S]*?<\/svg>/);
  if (!match) throw new Error('No SVG element found in MathJax output');
  return match[0];
}

// Strips strokes, borders and opacity, which sharp rasterizes as stray lines.
export function cleanMathSvg(
  svg: string,
  options: {
    removeRectElements?: boolean;
    removeLineElements?: boolean;
    removeRectStrokes?: boolean;
    removeLineStrokes?: boolean;
  },
) {
  let out = svg;
  out = out.replace(/stroke="[^"]*"/g, '');
  out = out.replace(/stroke-width="[^"]*"/g, '');
  out = out.replace(/stroke-opacity="[^"]*"/g, '');
  out = out.replace(/stroke-dasharray="[^"]*"/g, '');
  out = out.replace(/stroke-linecap="[^"]*"/g, '');
  out = out.replace(/stroke-linejoin="[^"]*"/g, '');
  out = out.replace(/outline="[^"]*"/g, '');
  out = out.replace(/border="[^"]*"/g, '');
  out = out.replace(/fill-opacity="[^"]*"/g, '');
  out = out.replace(/opacity="[^"]*"/g, '');
  out = out.replace(/style="([^"]*)"/g, (_match, styles) => {
    const cleaned = String(styles)
      .replace(/stroke[^;]*;?/g, '')
      .replace(/border[^;]*;?/g, '')
      .replace(/outline[^;]*;?/g, '')
      .replace(/;;+/g, ';')
      .replace(/^;|;$/g, '');
    return cleaned ? `style="${cleaned}"` : '';
  });
  if (options.removeRectElements) {
    out = out.replace(/<rect\b[^>]*\/>/g, '');
    out = out.replace(/<rect\b[^>]*>[\s\S]*?<\/rect>/g, '');
  }
  if (options.removeLineElements) {
    out = out.replace(/<line\b[^>]*\/>/g, '');
    out = out.replace(/<line\b[^>]*>[\s\S]*?<\/line>/g, '');
  }
  if (options.removeRectStrokes) out = out.replace(/<rect[^>]*stroke[^>]*>/g, '');
  if (options.removeLineStrokes) out = out.replace(/<line[^>]*stroke[^>]*>/g, '');
  return out;
}

// Common LaTeX macros as plain ASCII, for math MathJax could not render.
export function simplifyLatex(lx: string): string {
  return (
    (lx || '')
      .replace(/\\,|\\;|\\:\s*/g, ' ')
      .replace(/\\displaystyle|\\textstyle|\\scriptstyle/g, '')
      .replace(/\\text\{([^}]*)\}/g, '$1')
      .replace(/\\mathrm\{([^}]*)\}/g, '$1')
      .replace(/\\begin\{[bp]?matrix\}([\s\S]*?)\\end\{[bp]?matrix\}/g, (_m, content) => {
        const norm = String(content)
          .replace(/(?:\\\\|\\cr|\\0|\\n)/g, '; ')
          .replace(/&/g, ', ')
          .replace(/\s+/g, ' ')
          .trim();
        return '[' + norm + ']';
      })
      .replace(/\\begin\{pmatrix\}([\s\S]*?)\\end\{pmatrix\}/g, (_m, content) => {
        const norm = String(content)
          .replace(/(?:\\\\|\\cr|\\0|\\n)/g, '; ')
          .replace(/&/g, ', ')
          .replace(/\s+/g, ' ')
          .trim();
        return '(' + norm + ')';
      })
      .replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '$1/$2')
      // Keep greek commands ASCII-only in fallback to avoid WinAnsi issues
      .replace(/\\lambda\b/g, 'lambda')
      .replace(/\\alpha\b/g, 'alpha')
      .replace(/\\beta\b/g, 'beta')
      .replace(/\\gamma\b/g, 'gamma')
      .replace(/\\theta\b/g, 'theta')
      .replace(/\\tau\b/g, 'tau')
      .replace(/\\mu\b/g, 'mu')
      .replace(/\\Delta\b/g, 'Delta')
  );
}
