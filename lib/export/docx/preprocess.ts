import { matricesToText, numberFootnotesAndCitations } from '@/lib/export/markdown';

// Math as readable text, matrices as rows, footnotes and citations as numbers.
export function preprocessMarkdown(md: string): string {
  if (!md) return '';

  // Convert display math \[...\] to readable text FIRST (before markdown parsing)
  md = md.replace(/\\\[([\s\S]*?)\\\]/g, (_m: string, latex: string) => {
    return latexToText(latex);
  });

  // Convert display math $$...$$ to readable text
  md = md.replace(/\$\$([\s\S]*?)\$\$/g, (_m: string, latex: string) => {
    return latexToText(latex);
  });

  // Convert inline math $...$ to readable text
  md = md.replace(/\$([^$\n]+)\$/g, (_m: string, latex: string) => {
    return latexToText(latex);
  });

  // Convert inline math \(...\) to readable text
  md = md.replace(/\\\(([\s\S]*?)\\\)/g, (_m: string, latex: string) => {
    return latexToText(latex);
  });

  return numberFootnotesAndCitations(matricesToText(md));
}

// LaTeX as readable Unicode text (Word gets no rendered math).
export function latexToText(lx: string): string {
  return (
    (lx || '')
      // Spacing commands
      .replace(/\\,|\\;|\\:|\\quad|\\qquad/g, ' ')
      .replace(/\\displaystyle|\\textstyle|\\scriptstyle|\\left|\\right/g, '')
      // Text and formatting commands
      .replace(/\\text\{([^}]*)\}/g, '$1')
      .replace(/\\textbf\{([^}]*)\}/g, '$1')
      .replace(/\\textit\{([^}]*)\}/g, '$1')
      .replace(/\\mathrm\{([^}]*)\}/g, '$1')
      .replace(/\\mathbf\{([^}]*)\}/g, '$1')
      .replace(/\\mathit\{([^}]*)\}/g, '$1')
      .replace(/\\mathcal\{([^}]*)\}/g, '$1')
      .replace(/\\mathbb\{([^}]*)\}/g, '$1')
      .replace(/\\operatorname\{([^}]*)\}/g, '$1')
      .replace(/\\operatorname\*\{([^}]*)\}/g, '$1')
      // Fractions and roots
      .replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '($1)/($2)')
      .replace(/\\dfrac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '($1)/($2)')
      .replace(/\\tfrac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '($1)/($2)')
      .replace(/\\sqrt\[([^\]]+)\]\{([^}]*)\}/g, '($2)^(1/$1)')
      .replace(/\\sqrt\{([^}]*)\}/g, '√($1)')
      // Greek letters (lowercase)
      .replace(/\\alpha\b/g, 'α')
      .replace(/\\beta\b/g, 'β')
      .replace(/\\gamma\b/g, 'γ')
      .replace(/\\delta\b/g, 'δ')
      .replace(/\\epsilon\b/g, 'ε')
      .replace(/\\varepsilon\b/g, 'ε')
      .replace(/\\zeta\b/g, 'ζ')
      .replace(/\\eta\b/g, 'η')
      .replace(/\\theta\b/g, 'θ')
      .replace(/\\vartheta\b/g, 'θ')
      .replace(/\\iota\b/g, 'ι')
      .replace(/\\kappa\b/g, 'κ')
      .replace(/\\lambda\b/g, 'λ')
      .replace(/\\mu\b/g, 'μ')
      .replace(/\\nu\b/g, 'ν')
      .replace(/\\xi\b/g, 'ξ')
      .replace(/\\pi\b/g, 'π')
      .replace(/\\rho\b/g, 'ρ')
      .replace(/\\sigma\b/g, 'σ')
      .replace(/\\tau\b/g, 'τ')
      .replace(/\\upsilon\b/g, 'υ')
      .replace(/\\phi\b/g, 'φ')
      .replace(/\\varphi\b/g, 'φ')
      .replace(/\\chi\b/g, 'χ')
      .replace(/\\psi\b/g, 'ψ')
      .replace(/\\omega\b/g, 'ω')
      // Greek letters (uppercase)
      .replace(/\\Gamma\b/g, 'Γ')
      .replace(/\\Delta\b/g, 'Δ')
      .replace(/\\Theta\b/g, 'Θ')
      .replace(/\\Lambda\b/g, 'Λ')
      .replace(/\\Xi\b/g, 'Ξ')
      .replace(/\\Pi\b/g, 'Π')
      .replace(/\\Sigma\b/g, 'Σ')
      .replace(/\\Phi\b/g, 'Φ')
      .replace(/\\Psi\b/g, 'Ψ')
      .replace(/\\Omega\b/g, 'Ω')
      // Math operators and symbols
      .replace(/\\infty\b/g, '∞')
      .replace(/\\sum\b/g, 'Σ')
      .replace(/\\prod\b/g, 'Π')
      .replace(/\\int\b/g, '∫')
      .replace(/\\partial\b/g, '∂')
      .replace(/\\nabla\b/g, '∇')
      .replace(/\\times\b/g, '×')
      .replace(/\\cdot\b/g, '·')
      .replace(/\\cdots\b/g, '···')
      .replace(/\\ldots\b/g, '...')
      .replace(/\\dots\b/g, '...')
      .replace(/\\vdots\b/g, '⋮')
      .replace(/\\ddots\b/g, '⋱')
      .replace(/\\leq\b/g, '≤')
      .replace(/\\le\b/g, '≤')
      .replace(/\\geq\b/g, '≥')
      .replace(/\\ge\b/g, '≥')
      .replace(/\\neq\b/g, '≠')
      .replace(/\\ne\b/g, '≠')
      .replace(/\\approx\b/g, '≈')
      .replace(/\\sim\b/g, '~')
      .replace(/\\equiv\b/g, '≡')
      .replace(/\\pm\b/g, '±')
      .replace(/\\mp\b/g, '∓')
      .replace(/\\div\b/g, '÷')
      .replace(/\\to\b/g, '→')
      .replace(/\\rightarrow\b/g, '→')
      .replace(/\\leftarrow\b/g, '←')
      .replace(/\\Rightarrow\b/g, '⇒')
      .replace(/\\Leftarrow\b/g, '⇐')
      .replace(/\\iff\b/g, '⟺')
      .replace(/\\forall\b/g, '∀')
      .replace(/\\exists\b/g, '∃')
      .replace(/\\in\b/g, '∈')
      .replace(/\\notin\b/g, '∉')
      .replace(/\\subset\b/g, '⊂')
      .replace(/\\subseteq\b/g, '⊆')
      .replace(/\\supset\b/g, '⊃')
      .replace(/\\supseteq\b/g, '⊇')
      .replace(/\\cup\b/g, '∪')
      .replace(/\\cap\b/g, '∩')
      .replace(/\\emptyset\b/g, '∅')
      .replace(/\\varnothing\b/g, '∅')
      .replace(/\\neg\b/g, '¬')
      .replace(/\\land\b/g, '∧')
      .replace(/\\lor\b/g, '∨')
      .replace(/\\oplus\b/g, '⊕')
      .replace(/\\otimes\b/g, '⊗')
      .replace(/\\perp\b/g, '⊥')
      .replace(/\\parallel\b/g, '∥')
      .replace(/\\angle\b/g, '∠')
      .replace(/\\circ\b/g, '°')
      .replace(/\\degree\b/g, '°')
      .replace(/\\prime\b/g, '′')
      // Brackets
      .replace(/\\langle\b/g, '⟨')
      .replace(/\\rangle\b/g, '⟩')
      .replace(/\\lfloor\b/g, '⌊')
      .replace(/\\rfloor\b/g, '⌋')
      .replace(/\\lceil\b/g, '⌈')
      .replace(/\\rceil\b/g, '⌉')
      .replace(/\\vert\b/g, '|')
      .replace(/\\mid\b/g, '|')
      .replace(/\\\\\|/g, '‖')
      // Superscripts
      .replace(/\^(\{[^}]+\}|\w)/g, (_m, exp) => {
        const e = exp.startsWith('{') ? exp.slice(1, -1) : exp;
        const superscriptMap: Record<string, string> = {
          '0': '⁰',
          '1': '¹',
          '2': '²',
          '3': '³',
          '4': '⁴',
          '5': '⁵',
          '6': '⁶',
          '7': '⁷',
          '8': '⁸',
          '9': '⁹',
          n: 'ⁿ',
          i: 'ⁱ',
          '+': '⁺',
          '-': '⁻',
          T: 'ᵀ',
          a: 'ᵃ',
          b: 'ᵇ',
          c: 'ᶜ',
          d: 'ᵈ',
          e: 'ᵉ',
          f: 'ᶠ',
          g: 'ᵍ',
          h: 'ʰ',
          j: 'ʲ',
          k: 'ᵏ',
          l: 'ˡ',
          m: 'ᵐ',
          o: 'ᵒ',
          p: 'ᵖ',
          r: 'ʳ',
          s: 'ˢ',
          t: 'ᵗ',
          u: 'ᵘ',
          v: 'ᵛ',
          w: 'ʷ',
          x: 'ˣ',
          y: 'ʸ',
          z: 'ᶻ',
        };
        return e
          .split('')
          .map((c: string) => superscriptMap[c] || `^${c}`)
          .join('');
      })
      // Subscripts
      .replace(/_(\{[^}]+\}|\w)/g, (_m, sub) => {
        const s = sub.startsWith('{') ? sub.slice(1, -1) : sub;
        const subscriptMap: Record<string, string> = {
          '0': '₀',
          '1': '₁',
          '2': '₂',
          '3': '₃',
          '4': '₄',
          '5': '₅',
          '6': '₆',
          '7': '₇',
          '8': '₈',
          '9': '₉',
          i: 'ᵢ',
          j: 'ⱼ',
          n: 'ₙ',
          '+': '₊',
          '-': '₋',
          a: 'ₐ',
          e: 'ₑ',
          o: 'ₒ',
          x: 'ₓ',
          h: 'ₕ',
          k: 'ₖ',
          l: 'ₗ',
          m: 'ₘ',
          p: 'ₚ',
          s: 'ₛ',
          t: 'ₜ',
          r: 'ᵣ',
          u: 'ᵤ',
          v: 'ᵥ',
        };
        return s
          .split('')
          .map((c: string) => subscriptMap[c] || `_${c}`)
          .join('');
      })
      // Clean up remaining backslash commands and braces
      .replace(/\\\\/g, ' ')
      .replace(/\\[a-zA-Z]+\*?/g, ' ')
      .replace(/[{}]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}
