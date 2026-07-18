import { Geist_Mono } from 'next/font/google';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { useTheme } from 'next-themes';
import Latex from 'react-latex-next';
import { ReactRenderer } from 'marked-react';
import { Lexer } from 'marked';
import React, { useCallback, useMemo, useState, useRef, lazy, Suspense, useEffect, use } from 'react';
import { cn } from '@/lib/utils';
import { Check, Copy, WrapText, ArrowLeftRight, ChevronDown, ChevronUp, X, Eye, Code2 } from 'lucide-react';
import { sileo } from 'sileo';
import type { CitationLink, CitationGroup } from './shared';
import { parseTaggedLinkContent } from './shared';

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  preload: true,
  display: 'swap',
});

// Custom syntax themes that match Zetora's design system
const zetoraDarkTheme: { [key: string]: React.CSSProperties } = {
  'code[class*="language-"]': { color: '#e1e4e8', background: 'transparent' },
  'pre[class*="language-"]': { color: '#e1e4e8', background: 'transparent' },
  comment: { color: '#6a737d' },
  prolog: { color: '#6a737d' },
  doctype: { color: '#6a737d' },
  cdata: { color: '#6a737d' },
  punctuation: { color: '#e1e4e8' },
  namespace: { opacity: 0.7 },
  property: { color: '#79b8ff' },
  tag: { color: '#85e89d' },
  boolean: { color: '#79b8ff' },
  number: { color: '#79b8ff' },
  constant: { color: '#79b8ff' },
  symbol: { color: '#79b8ff' },
  deleted: { color: '#f97583' },
  selector: { color: '#85e89d' },
  'attr-name': { color: '#b392f0' },
  string: { color: '#9ecbff' },
  char: { color: '#9ecbff' },
  builtin: { color: '#79b8ff' },
  inserted: { color: '#85e89d' },
  operator: { color: '#e1e4e8' },
  entity: { color: '#79b8ff', cursor: 'help' },
  url: { color: '#79b8ff' },
  variable: { color: '#ffab70' },
  atrule: { color: '#b392f0' },
  'attr-value': { color: '#9ecbff' },
  function: { color: '#b392f0' },
  'class-name': { color: '#b392f0' },
  keyword: { color: '#f97583' },
  regex: { color: '#85e89d' },
  important: { color: '#f97583', fontWeight: 'bold' },
};

const zetoraLightTheme: { [key: string]: React.CSSProperties } = {
  'code[class*="language-"]': { color: '#24292e', background: 'transparent' },
  'pre[class*="language-"]': { color: '#24292e', background: 'transparent' },
  comment: { color: '#6a737d' },
  prolog: { color: '#6a737d' },
  doctype: { color: '#6a737d' },
  cdata: { color: '#6a737d' },
  punctuation: { color: '#24292e' },
  namespace: { opacity: 0.7 },
  property: { color: '#005cc5' },
  tag: { color: '#22863a' },
  boolean: { color: '#005cc5' },
  number: { color: '#005cc5' },
  constant: { color: '#005cc5' },
  symbol: { color: '#005cc5' },
  deleted: { color: '#d73a49' },
  selector: { color: '#22863a' },
  'attr-name': { color: '#6f42c1' },
  string: { color: '#032f62' },
  char: { color: '#032f62' },
  builtin: { color: '#005cc5' },
  inserted: { color: '#22863a' },
  operator: { color: '#24292e' },
  entity: { color: '#005cc5', cursor: 'help' },
  url: { color: '#005cc5' },
  variable: { color: '#e36209' },
  atrule: { color: '#6f42c1' },
  'attr-value': { color: '#032f62' },
  function: { color: '#6f42c1' },
  'class-name': { color: '#6f42c1' },
  keyword: { color: '#d73a49' },
  regex: { color: '#22863a' },
  important: { color: '#d73a49', fontWeight: 'bold' },
};

interface CodeBlockProps {
  language: string | undefined;
  children: string;
  elementKey: string;
}

// Threshold for auto-collapsing large code blocks
const AUTO_COLLAPSE_THRESHOLD = 25;
const PREVIEW_LINES = 4;

// Code block state type
interface CodeBlockState {
  collapsed: boolean;
  contentLength: number;
  userCollapsed: boolean;
}

// Global store for code block states - persists across component remounts
// NOTE: This MUST be module-level (not React context) because:
// 1. Marked re-creates all elements on each render, destroying any component state
// 2. React context would be recreated with the MarkdownRenderer, losing all state
// 3. This is a client-side component, so the Map is per-browser-tab, not shared across users
// The Map is keyed by content hash, so different code blocks have different keys
const codeBlockStates = new Map<string, CodeBlockState>();

// Cleanup old entries periodically to prevent memory leaks
// Entries older than 30 minutes are removed
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ENTRY_AGE_MS = 30 * 60 * 1000; // 30 minutes
const codeBlockTimestamps = new Map<string, number>();

let lastCleanupTime = Date.now();
function cleanupOldEntries() {
  const now = Date.now();
  if (now - lastCleanupTime < CLEANUP_INTERVAL_MS) return;

  lastCleanupTime = now;
  for (const [key, timestamp] of codeBlockTimestamps) {
    if (now - timestamp > MAX_ENTRY_AGE_MS) {
      codeBlockStates.delete(key);
      codeBlockTimestamps.delete(key);
    }
  }
}

// Helper to get a STABLE key for a code block based on its content prefix (not length)
// This ensures the same code block during streaming gets the same key
function getCodeBlockStateKey(content: string): string {
  // Use only the first 100 chars for the hash - this part stays stable during streaming
  const prefix = content.slice(0, 100);
  let hash = 0;
  for (let i = 0; i < prefix.length; i++) {
    hash = ((hash << 5) - hash + prefix.charCodeAt(i)) | 0;
  }
  return `cb-${Math.abs(hash).toString(36)}`;
}

// Unified CodeBlock component - consolidates LazyCodeBlockComponent and SyncCodeBlock
// The `allowPlainTextFallback` prop controls whether very large code (>10000 chars) renders as plain text
interface CodeBlockInnerProps extends CodeBlockProps {
  allowPlainTextFallback?: boolean;
}

// Renders raw SVG markup from an ```svg code fence as an actual image.
// Uses a fully sandboxed iframe (no allow-scripts/allow-same-origin) so
// embedded <script> tags or event handlers in untrusted SVG content never
// execute, regardless of what the model produced.
const SvgPreview: React.FC<{ svg: string }> = ({ svg }) => {
  const srcDoc = useMemo(
    () =>
      `<!doctype html><html><head><meta charset="utf-8"><style>` +
      `html,body{margin:0;height:100%;display:flex;align-items:center;justify-content:center;background:transparent;}` +
      `svg{max-width:100%;max-height:380px;width:auto;height:auto;}` +
      `</style></head><body>${svg}</body></html>`,
    [svg],
  );

  return (
    <div className="flex items-center justify-center bg-background/40 p-4">
      <iframe srcDoc={srcDoc} sandbox="" title="SVG preview" className="w-full border-0" style={{ height: 400 }} />
    </div>
  );
};

const CodeBlockInner: React.FC<CodeBlockInnerProps> = ({
  children,
  language,
  elementKey,
  allowPlainTextFallback = false,
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const [isWrapped, setIsWrapped] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme } = useTheme();
  const lineCount = useMemo(() => children.split('\n').length, [children]);

  // SVG code fences render as an image by default, with a toggle back to source
  const isSvg = language?.trim().toLowerCase() === 'svg';
  const [showSource, setShowSource] = useState(false);

  // Use global state store for collapse state - persists across remounts
  // Key is stable (based on content prefix, not length)
  const stateKey = useMemo(() => getCodeBlockStateKey(children), [children]);

  const [isCollapsed, setIsCollapsed] = useState(() => {
    // Run cleanup periodically
    cleanupOldEntries();

    const stored = codeBlockStates.get(stateKey);
    if (stored) {
      // Update timestamp on access
      codeBlockTimestamps.set(stateKey, Date.now());
      // Content is growing (streaming) - expand unless user manually collapsed
      if (children.length > stored.contentLength && !stored.userCollapsed) {
        return false;
      }
      return stored.collapsed;
    }
    // New code block - start expanded during streaming, collapse later if needed
    const defaultCollapsed = lineCount > AUTO_COLLAPSE_THRESHOLD;
    codeBlockStates.set(stateKey, {
      collapsed: defaultCollapsed,
      contentLength: children.length,
      userCollapsed: false,
    });
    codeBlockTimestamps.set(stateKey, Date.now());
    return defaultCollapsed;
  });

  // Detect streaming and auto-expand
  useEffect(() => {
    const stored = codeBlockStates.get(stateKey);
    if (stored && children.length > stored.contentLength && !stored.userCollapsed) {
      // Content is growing and user hasn't manually collapsed - expand
      setIsCollapsed(false);
    }
    // Always update the stored content length and timestamp
    codeBlockStates.set(stateKey, {
      collapsed: isCollapsed,
      contentLength: children.length,
      userCollapsed: stored?.userCollapsed ?? false,
    });
    codeBlockTimestamps.set(stateKey, Date.now());
  }, [children.length, stateKey, isCollapsed]);

  // Sync collapse state changes to global store
  useEffect(() => {
    const stored = codeBlockStates.get(stateKey);
    codeBlockStates.set(stateKey, {
      collapsed: isCollapsed,
      contentLength: stored?.contentLength ?? children.length,
      userCollapsed: stored?.userCollapsed ?? false,
    });
    codeBlockTimestamps.set(stateKey, Date.now());
  }, [isCollapsed, stateKey, children.length]);

  // Get preview of first few lines for collapsed state
  const previewCode = useMemo(() => {
    if (!isCollapsed) return '';
    return children.split('\n').slice(0, PREVIEW_LINES).join('\n');
  }, [children, isCollapsed]);

  // Handle hydration - only access theme after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  // Use react-syntax-highlighter for secure, isolated rendering
  // For very large code blocks with allowPlainTextFallback, skip syntax highlighting
  const shouldHighlight = useMemo(() => {
    if (allowPlainTextFallback && children.length >= 10000) return false;
    return true;
  }, [children.length, allowPlainTextFallback]);

  // Get theme-aware syntax highlighting style (default to dark for SSR)
  // Light-background themes need light syntax colors; all others use dark
  const syntaxTheme = useMemo(() => {
    if (!mounted) return zetoraDarkTheme;
    const isLightTheme =
      resolvedTheme === 'light' || resolvedTheme === 'claudelight' || resolvedTheme === 'neutrallight';
    return isLightTheme ? zetoraLightTheme : zetoraDarkTheme;
  }, [mounted, resolvedTheme]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(children);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      sileo.success({
        title: 'Code copied to clipboard',
        description: 'You can now paste it anywhere',
        icon: <Copy className="h-4 w-4" />,
      });
    } catch (error) {
      console.error('Failed to copy code:', error);
      sileo.error({ title: 'Failed to copy code' });
    }
  }, [children]);

  const toggleWrap = useCallback(() => {
    setIsWrapped((prev) => {
      const newState = !prev;
      sileo.success({
        title: newState ? 'Code wrap enabled' : 'Code wrap disabled',
        description: newState ? 'Long lines will now wrap' : 'Long lines will scroll horizontally',
        icon: <WrapText className="h-4 w-4" />,
      });
      return newState;
    });
  }, []);

  const toggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => {
      const newState = !prev;
      // Track user intent in global store
      const stored = codeBlockStates.get(stateKey);
      codeBlockStates.set(stateKey, {
        collapsed: newState,
        contentLength: stored?.contentLength ?? children.length,
        userCollapsed: newState, // User manually collapsed if newState is true
      });
      codeBlockTimestamps.set(stateKey, Date.now());
      return newState;
    });
  }, [stateKey, children.length]);

  // Render code content (either with syntax highlighting or plain text)
  const renderCodeContent = (code: string) => {
    if (shouldHighlight) {
      return (
        <SyntaxHighlighter
          language={language || 'text'}
          style={syntaxTheme}
          customStyle={{
            margin: 0,
            padding: '0.5rem',
            fontSize: '0.875rem',
            lineHeight: '1.5',
            background: 'transparent',
          }}
        >
          {code}
        </SyntaxHighlighter>
      );
    }
    return (
      <pre
        className={cn(
          'font-mono text-sm leading-relaxed p-2',
          isWrapped && 'whitespace-pre-wrap wrap-break-words',
          !isWrapped && 'whitespace-pre overflow-x-auto',
        )}
      >
        {code}
      </pre>
    );
  };

  return (
    <div className="group relative my-5 rounded-xl border border-border/60 bg-accent/50 overflow-hidden">
      <div
        className={cn(
          'flex items-center justify-between px-3.5 py-2 cursor-pointer select-none',
          !isCollapsed && 'border-b border-border/40',
        )}
        onClick={toggleCollapse}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleCollapse();
            }}
            className="p-0.5 rounded text-muted-foreground/50 hover:text-foreground transition-colors"
            title={isCollapsed ? 'Expand code' : 'Collapse code'}
          >
            {isCollapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          </button>
          {language && (
            <span className="font-pixel text-xs text-muted-foreground/80 uppercase tracking-wider">{language}</span>
          )}
          <span className="text-[11px] text-muted-foreground/60 tabular-nums">{lineCount} lines</span>
        </div>

        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          {isSvg && (
            <button
              onClick={() => setShowSource((prev) => !prev)}
              className="p-1 rounded border border-border/40 bg-background/50 text-muted-foreground/50 hover:text-foreground active:text-foreground transition-colors touch-manipulation"
              title={showSource ? 'Show preview' : 'Show source'}
            >
              {showSource ? <Eye size={11} /> : <Code2 size={11} />}
            </button>
          )}
          {!isCollapsed && (
            <button
              onClick={toggleWrap}
              className={cn(
                'p-1 rounded border border-border/40 bg-background/50 transition-colors touch-manipulation',
                isWrapped ? 'text-primary' : 'text-muted-foreground/50 hover:text-foreground active:text-foreground',
              )}
              title={isWrapped ? 'Disable wrap' : 'Enable wrap'}
            >
              {isWrapped ? <ArrowLeftRight size={11} /> : <WrapText size={11} />}
            </button>
          )}
          <button
            onClick={handleCopy}
            className={cn(
              'p-1 rounded border border-border/40 bg-background/50 transition-colors touch-manipulation',
              isCopied ? 'text-primary' : 'text-muted-foreground/50 hover:text-foreground active:text-foreground',
            )}
            title={isCopied ? 'Copied!' : 'Copy code'}
          >
            {isCopied ? <Check size={11} /> : <Copy size={11} />}
          </button>
        </div>
      </div>

      {isSvg && !showSource ? (
        <SvgPreview svg={children} />
      ) : isCollapsed ? (
        <div className="relative cursor-pointer" onClick={toggleCollapse}>
          <div
            className="relative [&_pre]:m-0! [&_pre]:p-2! [&_code]:text-sm! [&_code]:leading-relaxed! [&_pre]:overflow-hidden! max-h-24 overflow-hidden"
            style={{ fontFamily: geistMono.style.fontFamily }}
          >
            {renderCodeContent(previewCode)}
          </div>
          <div className="absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-accent/50 via-accent/40 to-transparent pointer-events-none" />
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center pb-2 pointer-events-none">
            <span className="font-pixel text-[9px] text-muted-foreground/50 bg-accent/80 px-2.5 py-1 rounded-full flex items-center gap-1 tracking-wider">
              <ChevronDown size={10} />
              {lineCount - PREVIEW_LINES} more lines
            </span>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            'relative [&_pre]:m-0! [&_pre]:p-2! [&_code]:text-sm! [&_code]:leading-relaxed!',
            isWrapped &&
              '[&_pre]:whitespace-pre-wrap! [&_pre]:wrap-break-word! [&_code]:whitespace-pre-wrap! [&_code]:wrap-break-word!',
            !isWrapped && '[&_pre]:overflow-x-auto!',
          )}
          style={{ fontFamily: geistMono.style.fontFamily }}
        >
          {renderCodeContent(children)}
        </div>
      )}
    </div>
  );
};

// Lazy-loaded wrapper for large code blocks
const LazyCodeBlockComponent: React.FC<CodeBlockProps> = (props) => (
  <CodeBlockInner {...props} allowPlainTextFallback={true} />
);

const LazyCodeBlock = lazy(() => Promise.resolve({ default: LazyCodeBlockComponent }));

// Synchronous CodeBlock component for smaller blocks
const SyncCodeBlock: React.FC<CodeBlockProps> = (props) => <CodeBlockInner {...props} allowPlainTextFallback={false} />;

export const CodeBlock: React.FC<CodeBlockProps> = React.memo(
  ({ language, children, elementKey }) => {
    // Use lazy loading for large code blocks
    if (children.length > 5000) {
      return (
        <Suspense
          fallback={
            <div className="group relative my-5 rounded-md border border-border bg-accent overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-accent border-b border-border">
                <div className="flex items-center gap-2">
                  {language && (
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {language}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">{children.split('\n').length} lines</span>
                </div>
              </div>
              <div className="font-mono text-sm leading-relaxed p-2 text-muted-foreground">
                <div className="animate-pulse">Loading code block...</div>
              </div>
            </div>
          }
        >
          <LazyCodeBlock language={language} elementKey={elementKey}>
            {children}
          </LazyCodeBlock>
        </Suspense>
      );
    }

    // Use synchronous rendering for smaller blocks
    return (
      <SyncCodeBlock language={language} elementKey={elementKey}>
        {children}
      </SyncCodeBlock>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.children === nextProps.children &&
      prevProps.language === nextProps.language &&
      prevProps.elementKey === nextProps.elementKey
    );
  },
);

CodeBlock.displayName = 'CodeBlock';

// Optimized synchronous content processor using useMemo
export const useProcessedContent = (content: string) => {
  return useMemo(() => {
    const citations: CitationLink[] = [];
    const latexBlocks: Array<{ id: string; content: string; isBlock: boolean }> = [];
    const appPreviewBlocks: Array<{ id: string; href: string; title?: string }> = [];
    const downloadBlocks: Array<{ id: string; href: string; title?: string }> = [];
    let modifiedContent = content;

    try {
      // Extract and protect code blocks FIRST
      const codeBlocks: Array<{ id: string; content: string }> = [];

      // Combined pattern that matches triple backticks first (longer matches), then single backticks
      // This prevents the issue where single backticks match parts of already-protected content
      const allCodeMatches: Array<{ match: string; index: number; length: number }> = [];

      // First, find all triple-backtick code blocks
      const tripleBacktickPattern = /```[\s\S]*?```/g;
      let match;
      while ((match = tripleBacktickPattern.exec(modifiedContent)) !== null) {
        allCodeMatches.push({
          match: match[0],
          index: match.index,
          length: match[0].length,
        });
      }

      // Then, find all inline code (single backticks) that don't overlap with triple-backtick blocks
      const inlineCodePattern = /`[^`\n]+`/g;
      while ((match = inlineCodePattern.exec(modifiedContent)) !== null) {
        const matchStart = match.index;
        const matchEnd = match.index + match[0].length;

        // Check if this inline code is inside a triple-backtick block
        const isInsideTripleBacktick = allCodeMatches.some(
          (m) => matchStart >= m.index && matchEnd <= m.index + m.length,
        );

        if (!isInsideTripleBacktick) {
          allCodeMatches.push({
            match: match[0],
            index: match.index,
            length: match[0].length,
          });
        }
      }

      // Sort by index to process in order
      allCodeMatches.sort((a, b) => a.index - b.index);

      // Replace all code blocks with placeholders
      let newContent = '';
      let lastIndex = 0;

      for (const codeMatch of allCodeMatches) {
        // Use very unique placeholder that won't match markdown syntax
        const id = `<<<CODEBLOCK_PROTECTED_${codeBlocks.length}>>>`;
        codeBlocks.push({ id, content: codeMatch.match });

        newContent += modifiedContent.slice(lastIndex, codeMatch.index) + id;
        lastIndex = codeMatch.index + codeMatch.length;
      }

      newContent += modifiedContent.slice(lastIndex);
      modifiedContent = newContent;

      // Extract explicit rich-link tags before normal markdown/link processing.
      const richTagPatterns = [
        {
          regex: /<app_preview>([\s\S]*?)<\/app_preview>/gi,
          prefix: 'XAPPPREVX',
          target: appPreviewBlocks,
        },
        {
          regex: /<download>([\s\S]*?)<\/download>/gi,
          prefix: 'XDOWNLOADX',
          target: downloadBlocks,
        },
      ] as const;

      for (const { regex, prefix, target } of richTagPatterns) {
        regex.lastIndex = 0;
        let richTagProcessed = '';
        let lastRichTagIndex = 0;
        let richTagMatch: RegExpExecArray | null;

        while ((richTagMatch = regex.exec(modifiedContent)) !== null) {
          const parsed = parseTaggedLinkContent(richTagMatch[1]);
          if (!parsed) continue;

          const id = `${prefix}${target.length}XEND`;
          target.push({ id, href: parsed.href, title: parsed.title });
          richTagProcessed += modifiedContent.slice(lastRichTagIndex, richTagMatch.index) + id;
          lastRichTagIndex = richTagMatch.index + richTagMatch[0].length;
        }

        richTagProcessed += modifiedContent.slice(lastRichTagIndex);
        modifiedContent = richTagProcessed;
      }

      // Protect table rows to preserve pipe delimiters
      const tableBlocks: Array<{ id: string; content: string }> = [];
      const tableRowPattern = /^\|.+\|$/gm;
      const tableMatches = [...modifiedContent.matchAll(tableRowPattern)];

      if (tableMatches.length > 0) {
        let lastIndex = 0;
        let newContent = '';

        for (let i = 0; i < tableMatches.length; i++) {
          const match = tableMatches[i];
          const id = `TABLEROW${tableBlocks.length}END`;
          tableBlocks.push({ id, content: match[0] });

          newContent += modifiedContent.slice(lastIndex, match.index) + id;
          lastIndex = match.index! + match[0].length;
        }

        newContent += modifiedContent.slice(lastIndex);
        modifiedContent = newContent;
      }

      // Extract monetary amounts FIRST to protect them from LaTeX patterns
      const monetaryBlocks: Array<{ id: string; content: string }> = [];
      // Match monetary amounts with optional scale words and currency codes
      // Exclude mathematical expressions by using negative lookahead for backslashes or ending $
      const monetaryRegex =
        /(^|[\s([>~≈<)/])\$\d+(?:,\d{3})*(?:\.\d+)?(?:[kKmMbBtT]|\s+(?:thousand|million|billion|trillion|k|K|M|B|T))?(?:\s+(?:USD|EUR|GBP|CAD|AUD|JPY|CNY|CHF))?(?:\s*(?:per\s+(?:million|thousand|token|month|year)|\/(?:mo|month|yr|year|wk|week|day|token|hr|hour)))?(?=\s|$|[).,;!?<\]/])(?![^$]*\\[^$]*\$)/g;

      let monetaryProcessed = '';
      let lastMonetaryIndex = 0;
      const monetaryMatches = [...modifiedContent.matchAll(monetaryRegex)];

      for (let i = 0; i < monetaryMatches.length; i++) {
        const match = monetaryMatches[i];
        const prefix = match[1];
        const id = `MONETARY${monetaryBlocks.length}END`;
        monetaryBlocks.push({ id, content: match[0].slice(prefix.length) });

        monetaryProcessed += modifiedContent.slice(lastMonetaryIndex, match.index) + prefix + id;
        lastMonetaryIndex = match.index! + match[0].length;
      }

      monetaryProcessed += modifiedContent.slice(lastMonetaryIndex);
      modifiedContent = monetaryProcessed;

      // Also protect monetary amounts inside protected table rows
      if (typeof tableBlocks !== 'undefined' && tableBlocks.length > 0) {
        for (let t = 0; t < tableBlocks.length; t++) {
          let rowContent = tableBlocks[t].content;
          const rowMonetaryMatches = [...rowContent.matchAll(monetaryRegex)];
          if (rowMonetaryMatches.length === 0) continue;
          let lastIndex = 0;
          let newRow = '';
          for (let i = 0; i < rowMonetaryMatches.length; i++) {
            const match = rowMonetaryMatches[i];
            const prefix = match[1];
            const id = `MONETARY${monetaryBlocks.length}END`;
            monetaryBlocks.push({ id, content: match[0].slice(prefix.length) });
            newRow += rowContent.slice(lastIndex, match.index) + prefix + id;
            lastIndex = match.index! + match[0].length;
          }
          newRow += rowContent.slice(lastIndex);
          tableBlocks[t].content = newRow;
        }
      }

      // Extract LaTeX blocks AFTER monetary amounts are protected
      const allLatexPatterns = [
        { patterns: [/\\\[([\s\S]*?)\\\]/g, /\$\$([\s\S]*?)\$\$/g], isBlock: true, prefix: 'XLATEXBLOCKX' },
        {
          patterns: [
            /\\\(([\s\S]*?)\\\)/g,
            // Match $ expressions containing LaTeX commands (backslash followed by letters)
            /\$[^\$\n]*\\[a-zA-Z]+[^\$\n]*\$/g,
            // Match $ expressions containing LaTeX commands, superscripts, subscripts, or braces
            /\$[^\$\n]*[\\^_{}][^\$\n]*\$/g,
            // Match function-call style math like $O(1)$, $f(n)$, $T(n^2)$ (letter followed by parens)
            // Must run BEFORE the broad parenthetical pattern to prevent false cross-dollar matches
            /\$[a-zA-Z]+\([^\)]*\)[^\$\n]*\$/g,
            // Match algebraic expressions with parentheses and variables
            /\$[^\$\n]*\([^\)]*[a-zA-Z][^\)]*\)[^\$\n]*\$/g,
            // Match matrix notation with square brackets
            /\$[^\$\n]*\[[^\]]*\][^\$\n]*\$/g,
            // Match absolute value notation with pipes
            /\$[^\$\n]*\|[^\|]*\|[^\$\n]*\$/g,
            // Match $ expressions with multiple letters and equals signs (e.g., $Av = 2v$)
            /\$[a-zA-Z]+[^\$\n]*[=<>≤≥≠][^\$\n]*\$/g,
            // Match $ expressions with single-letter variable followed by operator and number/variable
            /\$[a-zA-Z]\s*[=<>≤≥≠]\s*[0-9a-zA-Z][^\$\n]*\$/g,
            // Match $ expressions with number followed by LaTeX-style operators
            /\$[0-9][^\$\n]*[\\^_≤≥≠∈∉⊂⊃∪∩θΘπΠαβγδεζηλμνξρσςτφχψωΑΒΓΔΕΖΗΛΜΝΞΡΣΤΦΧΨΩ°][^\$\n]*\$/g,
            // Match pure numeric inline math like $5$ or $3.14$
            /\$\d+(?:\.\d+)?\$/g,
            // Match simple mathematical variables (single letter or Greek letters, but not plain numbers)
            /\$[a-zA-ZθΘπΠαβγδεζηλμνξρσςτφχψωΑΒΓΔΕΖΗΛΜΝΞΡΣΤΦΧΨΩ]+\$/g,
            // Match simple single-letter variables (like $ m $, $ b $, $ x $, $ y $)
            /\$\s*[a-zA-Z]\s*\$/g,
          ],
          isBlock: false,
          prefix: 'XLATEXINLINEX',
        },
      ];

      for (const { patterns, isBlock, prefix } of allLatexPatterns) {
        for (const pattern of patterns) {
          // Use exec() instead of matchAll() so we can reset regex position when skipping bad matches
          // This allows us to find valid LaTeX expressions that might be at the end of a rejected long span
          const regex = new RegExp(pattern.source, pattern.flags);
          let lastIndex = 0;
          let newContent = '';
          let match;

          while ((match = regex.exec(modifiedContent)) !== null) {
            const full = match[0];

            // Skip if it contains a protected code block placeholder (prevents matching across inline code)
            // When skipping, only consume up to (and including) the first $ so regex can find matches starting later
            if (/<<<CODEBLOCK_PROTECTED_\d+>>>/.test(full)) {
              // Copy content up to and including the first character of the bad match (the opening $)
              newContent += modifiedContent.slice(lastIndex, match.index + 1);
              lastIndex = match.index + 1;
              // Reset regex to search from right after the opening $
              regex.lastIndex = match.index + 1;
              continue;
            }

            // Heuristics to avoid misclassifying currency and long cross-dollar spans as LaTeX
            if (!isBlock) {
              const isDollarDelimited = full.startsWith('$') && full.endsWith('$');
              const inner = isDollarDelimited ? full.slice(1, -1) : full; // handles \( ... \) via pattern itself

              // 1) Skip if looks like currency (e.g., $13 billion, $500, $80B)
              const currencyLike =
                /^(\s*)\d{1,3}(?:[,\s]?\d{3})*(?:\.\d+)?(?:\s*(?:k|K|M|B|T|thousand|million|billion|trillion))?(\s*(?:USD|EUR|GBP|CAD|AUD|JPY|CNY|CHF))?\s*$/i.test(
                  inner.replace(/\u00A0/g, ' ').trim(),
                );

              // 2) Skip if it contains obvious URL/link syntax which indicates markdown, not math
              // Only check for actual link patterns, not standalone brackets (which are common in math)
              const containsUrlOrMarkdown = /https?:\/\/|\]\(|:\/\//.test(inner);

              // 3) Skip very long spans (likely accidental cross-dollar match)
              const isTooLong = inner.length > 80;

              // 4) Skip if inner content starts or ends with whitespace (standard TeX convention:
              // $x$ is math but $ x$ or $x $ is not). This prevents false cross-dollar matches
              // like "$O(1)$ some text with (parens) $O(n)$" being misread as one expression.
              // Exception: single-letter variables like $ m $ are still allowed.
              const hasEdgeWhitespace = isDollarDelimited && (/^\s/.test(inner) || /\s$/.test(inner));
              const isSingleLetterVar = hasEdgeWhitespace && /^\s*[a-zA-Z]\s*$/.test(inner);

              if (currencyLike || containsUrlOrMarkdown || isTooLong || (hasEdgeWhitespace && !isSingleLetterVar)) {
                // Do not replace; keep original content but only skip the opening $
                newContent += modifiedContent.slice(lastIndex, match.index + 1);
                lastIndex = match.index + 1;
                regex.lastIndex = match.index + 1;
                continue;
              }
            }

            const id = `${prefix}${latexBlocks.length}XEND`;
            latexBlocks.push({ id, content: full, isBlock });

            newContent += modifiedContent.slice(lastIndex, match.index) + id;
            lastIndex = match.index + full.length;
          }

          newContent += modifiedContent.slice(lastIndex);
          modifiedContent = newContent;
        }
      }

      // Additionally, extract LaTeX inside protected table rows so it renders later
      if (typeof tableBlocks !== 'undefined' && tableBlocks.length > 0) {
        for (let t = 0; t < tableBlocks.length; t++) {
          let rowContent = tableBlocks[t].content;
          for (const { patterns, isBlock, prefix } of allLatexPatterns) {
            for (const pattern of patterns) {
              const matches = [...rowContent.matchAll(pattern)];
              if (matches.length === 0) continue;
              let lastIndex = 0;
              let newRow = '';
              for (let i = 0; i < matches.length; i++) {
                const match = matches[i];
                const id = `${prefix}${latexBlocks.length}XEND`;
                latexBlocks.push({ id, content: match[0], isBlock });
                newRow += rowContent.slice(lastIndex, match.index) + id;
                lastIndex = match.index! + match[0].length;
              }
              newRow += rowContent.slice(lastIndex);
              rowContent = newRow;
            }
          }
          tableBlocks[t].content = rowContent;
        }
      }

      // Escape unescaped pipe characters inside explicit markdown link texts to avoid table cell splits
      // Example: [A | B](url) -> [A \| B](url)
      try {
        const explicitLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
        const linkMatches = [...modifiedContent.matchAll(explicitLinkPattern)];
        if (linkMatches.length > 0) {
          let rebuilt = '';
          let lastPos = 0;
          for (let i = 0; i < linkMatches.length; i++) {
            const m = linkMatches[i];
            const full = m[0];
            const textPart = m[1];
            const urlPart = m[2];
            // Replace only unescaped '|'
            const fixedText = textPart.replace(/(^|[^\\])\|/g, '$1\\|');
            rebuilt += modifiedContent.slice(lastPos, m.index!) + `[${fixedText}](${urlPart})`;
            lastPos = m.index! + full.length;
          }
          rebuilt += modifiedContent.slice(lastPos);
          modifiedContent = rebuilt;
        }
      } catch {}

      // Process citations (simplified for performance)
      // Updated regex to handle brackets and exclamation marks in citation text
      // The pattern now matches text that may contain ] characters before the final ](url) pattern
      // Uses negative lookahead to allow ] in text as long as it's not followed by ( or [
      // Uses + quantifier to ensure at least one character is captured (prevents empty brackets)
      const refWithUrlRegex =
        /(?:\[(?:(?:\[?(PDF|DOC|HTML)\]?\s+)?((?:[^\]]|](?!\s*[(\[]))+))\]|\b([^.!?\n]+?(?:\s+[-–—]\s+\w+|\s+\([^)]+\)))\b)(?:\s*(?:\(|\[\s*|\s+))(https?:\/\/[^\s)]+)(?:\s*[)\]]|\s|$)/g;

      let citationProcessed = '';
      let lastCitationIndex = 0;
      const citationMatches = [...modifiedContent.matchAll(refWithUrlRegex)];

      for (let i = 0; i < citationMatches.length; i++) {
        const match = citationMatches[i];
        const [fullMatch, docType, bracketText, plainText, url] = match;
        const text = bracketText || plainText;
        // Skip if text is empty/undefined to prevent malformed citations
        // Preserve the skipped match's content while keeping position tracking correct
        if (!text) {
          const matchStart = match.index ?? 0;
          const matchEnd = matchStart + fullMatch.length;
          citationProcessed += modifiedContent.slice(lastCitationIndex, matchEnd);
          lastCitationIndex = matchEnd;
          continue;
        }
        const fullText = (docType ? `[${docType}] ` : '') + text;
        const cleanUrl = url.replace(/[.,;:]+$/, '');
        citations.push({ text: fullText.trim(), link: cleanUrl });

        citationProcessed +=
          modifiedContent.slice(lastCitationIndex, match.index) + `[${fullText.trim()}](${cleanUrl})`;
        lastCitationIndex = match.index! + fullMatch.length;
      }

      citationProcessed += modifiedContent.slice(lastCitationIndex);
      modifiedContent = citationProcessed;

      // Group consecutive citations using marked's Lexer for robust link parsing
      const citationGroups: CitationGroup[] = [];

      // Helper function to extract links using marked's Lexer (handles all edge cases)
      // Uses a hybrid approach: Lexer to parse links correctly, then finds positions in text
      function extractLinksWithLexer(
        text: string,
      ): Array<{ raw: string; href: string; text: string; index: number; end: number }> {
        const links: Array<{ raw: string; href: string; text: string; index: number; end: number }> = [];

        try {
          // Tokenize the text to find all links using marked's robust parser
          const tokens = Lexer.lexInline(text);

          // Build a map of link tokens with their hrefs and texts
          const linkTokens: Array<{ href: string; text: string; raw: string }> = [];
          for (const token of tokens) {
            if (token.type === 'link') {
              const linkText =
                typeof token.text === 'string' ? token.text : token.tokens?.map((t) => t.raw || '').join('') || '';
              linkTokens.push({
                href: token.href,
                text: linkText,
                raw: token.raw,
              });
            }
          }

          // Now find positions of these links in the original text
          // We'll search for each link pattern, but validate against Lexer results
          let searchPos = 0;
          for (const linkToken of linkTokens) {
            // Try to find this link in the text starting from searchPos
            // Use a more flexible regex that handles edge cases, but validate with Lexer
            const escapedHref = linkToken.href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Match link pattern with flexible bracket/paren handling
            const linkPattern = new RegExp(`\\[([^\\]]+)\\]\\(${escapedHref}\\)`, 'g');
            linkPattern.lastIndex = searchPos;
            const match = linkPattern.exec(text);

            if (match && match[0] === linkToken.raw) {
              // Validate: re-parse this match with Lexer to ensure it's correct
              let isValidated = false;
              try {
                const validateTokens = Lexer.lexInline(match[0]);
                const validateLink = validateTokens.find((t) => t.type === 'link');
                if (
                  validateLink &&
                  'href' in validateLink &&
                  (validateLink as { href: string }).href === linkToken.href
                ) {
                  isValidated = true;
                }
              } catch {
                // Validation failed, but match looks good - we'll use it anyway since match[0] === linkToken.raw
              }

              // Use the match if validated OR if raw matches (regex found the correct link)
              if (isValidated || match[0] === linkToken.raw) {
                links.push({
                  raw: match[0],
                  href: linkToken.href,
                  text: linkToken.text,
                  index: match.index!,
                  end: match.index! + match[0].length,
                });
                searchPos = match.index! + match[0].length;
                continue;
              }
            }

            // Fallback: search for the raw link text directly
            const rawIndex = text.indexOf(linkToken.raw, searchPos);
            if (rawIndex !== -1) {
              links.push({
                raw: linkToken.raw,
                href: linkToken.href,
                text: linkToken.text,
                index: rawIndex,
                end: rawIndex + linkToken.raw.length,
              });
              searchPos = rawIndex + linkToken.raw.length;
            } else {
              // Last resort: try to find by href and reconstruct
              // Search backwards from href to find the opening bracket, then match forward
              const hrefIndex = text.indexOf(linkToken.href, searchPos);
              if (hrefIndex !== -1) {
                // Search backwards from href position to find the opening bracket '['
                // Use a reasonable lookback limit (e.g., 500 chars) to handle long link text
                const maxLookback = Math.min(500, hrefIndex);
                const searchStart = Math.max(0, hrefIndex - maxLookback);
                const searchEnd = Math.min(text.length, hrefIndex + linkToken.href.length + 10); // Small lookahead for closing paren
                const searchWindow = text.slice(searchStart, searchEnd);

                // Find the last '[' before the href that could be the start of our link
                // Then match the full link pattern from that position
                const bracketPos = searchWindow.lastIndexOf('[', hrefIndex - searchStart);
                let linkFound = false;

                if (bracketPos !== -1) {
                  // Try to match the full link pattern from this bracket position
                  const patternFromBracket = new RegExp(`\\[([^\\]]+)\\]\\(${escapedHref}\\)`);
                  const matchFromBracket = searchWindow.slice(bracketPos).match(patternFromBracket);
                  if (matchFromBracket) {
                    const absoluteIndex = searchStart + bracketPos;
                    links.push({
                      raw: matchFromBracket[0],
                      href: linkToken.href,
                      text: matchFromBracket[1],
                      index: absoluteIndex,
                      end: absoluteIndex + matchFromBracket[0].length,
                    });
                    searchPos = absoluteIndex + matchFromBracket[0].length;
                    linkFound = true;
                  } else {
                    // If direct match fails, try a broader search with the pattern
                    const windowPattern = new RegExp(`\\[([^\\]]+)\\]\\(${escapedHref}\\)`);
                    const windowMatch = searchWindow.match(windowPattern);
                    if (windowMatch) {
                      const absoluteIndex = searchStart + searchWindow.indexOf(windowMatch[0]);
                      links.push({
                        raw: windowMatch[0],
                        href: linkToken.href,
                        text: windowMatch[1],
                        index: absoluteIndex,
                        end: absoluteIndex + windowMatch[0].length,
                      });
                      searchPos = absoluteIndex + windowMatch[0].length;
                      linkFound = true;
                    }
                  }
                } else {
                  // No bracket found, try pattern match on the entire window as fallback
                  const windowPattern = new RegExp(`\\[([^\\]]+)\\]\\(${escapedHref}\\)`);
                  const windowMatch = searchWindow.match(windowPattern);
                  if (windowMatch) {
                    const absoluteIndex = searchStart + searchWindow.indexOf(windowMatch[0]);
                    links.push({
                      raw: windowMatch[0],
                      href: linkToken.href,
                      text: windowMatch[1],
                      index: absoluteIndex,
                      end: absoluteIndex + windowMatch[0].length,
                    });
                    searchPos = absoluteIndex + windowMatch[0].length;
                    linkFound = true;
                  }
                }

                // If we found the href but couldn't reconstruct the full link, advance searchPos
                // to prevent getting stuck on the same position for subsequent links
                if (!linkFound) {
                  searchPos = hrefIndex + linkToken.href.length;
                }
              } else {
                // href not found at all - advance searchPos to prevent infinite loops
                // Try to find the next potential link position by searching for common link patterns
                const nextBracket = text.indexOf('[', searchPos);
                if (nextBracket !== -1) {
                  searchPos = nextBracket;
                } else {
                  // No more brackets found, advance to end of text to stop searching
                  searchPos = text.length;
                }
              }
            }
          }
        } catch (error) {
          // Fallback to improved regex if Lexer fails
          // This regex handles URLs with parentheses by using balanced matching
          const linkPattern = /\[([^\]]*(?:\\.[^\]]*)*)\]\(([^)]*(?:\([^)]*\)[^)]*)*)\)/g;
          let match;
          while ((match = linkPattern.exec(text)) !== null) {
            links.push({
              raw: match[0],
              href: match[2],
              text: match[1].replace(/\\(.)/g, '$1'), // Unescape
              index: match.index,
              end: match.index + match[0].length,
            });
          }
        }

        // Sort by index to ensure correct order
        links.sort((a, b) => a.index - b.index);
        return links;
      }

      // Extract all links using Lexer
      const allLinks = extractLinksWithLexer(modifiedContent);

      if (allLinks.length >= 2) {
        // Find groups of consecutive links (only whitespace between them)
        const groups: Array<{ links: typeof allLinks; startIndex: number; endIndex: number }> = [];
        let currentGroup: typeof allLinks = [allLinks[0]];

        for (let i = 1; i < allLinks.length; i++) {
          const prevLink = allLinks[i - 1];
          const currLink = allLinks[i];
          const between = modifiedContent.slice(prevLink.end, currLink.index);

          // Check if only whitespace between links
          if (/^\s*$/.test(between)) {
            currentGroup.push(currLink);
          } else {
            // End current group if it has 2+ links
            if (currentGroup.length >= 2) {
              groups.push({
                links: currentGroup,
                startIndex: currentGroup[0].index,
                endIndex: currentGroup[currentGroup.length - 1].end,
              });
            }
            // Start new group
            currentGroup = [currLink];
          }
        }

        // Don't forget the last group
        if (currentGroup.length >= 2) {
          groups.push({
            links: currentGroup,
            startIndex: currentGroup[0].index,
            endIndex: currentGroup[currentGroup.length - 1].end,
          });
        }

        // Replace groups with citation group placeholders (process in reverse to maintain indices)
        if (groups.length > 0) {
          let groupProcessed = modifiedContent;
          for (let g = groups.length - 1; g >= 0; g--) {
            const group = groups[g];
            const urls = group.links.map((l) => l.href);
            const texts = group.links.map((l) => l.text);
            const groupId = `XCITATIONGRPX${citationGroups.length}XEND`;

            citationGroups.push({ urls, texts, id: groupId });

            // Processing right-to-left means replacements don't affect earlier indices
            groupProcessed = groupProcessed.slice(0, group.startIndex) + groupId + groupProcessed.slice(group.endIndex);
          }
          modifiedContent = groupProcessed;
        }
      }

      // Additionally, process citation groups inside protected table rows
      // Use the same Lexer-based approach for consistency
      if (typeof tableBlocks !== 'undefined' && tableBlocks.length > 0) {
        for (let t = 0; t < tableBlocks.length; t++) {
          let rowContent = tableBlocks[t].content;

          // Extract links using Lexer (same function as above)
          const rowLinks = extractLinksWithLexer(rowContent);

          if (rowLinks.length < 2) continue;

          // Find groups of consecutive links (only whitespace between them)
          const groups: Array<{ links: typeof rowLinks; startIndex: number; endIndex: number }> = [];
          let currentGroup: typeof rowLinks = [rowLinks[0]];

          for (let i = 1; i < rowLinks.length; i++) {
            const prevLink = rowLinks[i - 1];
            const currLink = rowLinks[i];
            const between = rowContent.slice(prevLink.end, currLink.index);

            // Check if only whitespace between links
            if (/^\s*$/.test(between)) {
              currentGroup.push(currLink);
            } else {
              // End current group if it has 2+ links
              if (currentGroup.length >= 2) {
                groups.push({
                  links: currentGroup,
                  startIndex: currentGroup[0].index,
                  endIndex: currentGroup[currentGroup.length - 1].end,
                });
              }
              // Start new group
              currentGroup = [currLink];
            }
          }

          // Don't forget the last group
          if (currentGroup.length >= 2) {
            groups.push({
              links: currentGroup,
              startIndex: currentGroup[0].index,
              endIndex: currentGroup[currentGroup.length - 1].end,
            });
          }

          if (groups.length === 0) continue;

          // Replace groups with citation group placeholders (process in reverse to maintain indices)
          let newRow = rowContent;
          for (let g = groups.length - 1; g >= 0; g--) {
            const group = groups[g];
            const urls = group.links.map((l) => l.href);
            const texts = group.links.map((l) => l.text);
            const groupId = `XCITATIONGRPX${citationGroups.length}XEND`;

            citationGroups.push({ urls, texts, id: groupId });

            // Processing right-to-left means replacements don't affect earlier indices
            newRow = newRow.slice(0, group.startIndex) + groupId + newRow.slice(group.endIndex);
          }

          tableBlocks[t].content = newRow;
        }
      }

      // Restore protected blocks in the main content and in collected citation texts
      // Use replaceAll or global regex to ensure ALL instances are replaced
      monetaryBlocks.forEach(({ id, content }) => {
        const regex = new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        modifiedContent = modifiedContent.replace(regex, content);
        // Also restore inside citation titles so hover cards don't show placeholders
        for (let i = 0; i < citations.length; i++) {
          citations[i].text = citations[i].text.replace(regex, content);
        }
        // Also restore inside latexBlocks content to prevent placeholders showing in rendered LaTeX
        for (let i = 0; i < latexBlocks.length; i++) {
          latexBlocks[i].content = latexBlocks[i].content.replace(regex, content);
        }
      });

      codeBlocks.forEach(({ id, content }) => {
        const regex = new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        modifiedContent = modifiedContent.replace(regex, content);
        for (let i = 0; i < citations.length; i++) {
          citations[i].text = citations[i].text.replace(regex, content);
        }
        // Also restore inside latexBlocks content to prevent placeholders showing in rendered LaTeX
        for (let i = 0; i < latexBlocks.length; i++) {
          latexBlocks[i].content = latexBlocks[i].content.replace(regex, content);
        }
      });

      // Restore table rows LAST so they render with all LaTeX processed
      tableBlocks.forEach(({ id, content }) => {
        // Restore any protected monetary or code placeholders within the row content first
        let restoredRow = content;
        monetaryBlocks.forEach(({ id: mid, content: mcontent }) => {
          const mregex = new RegExp(mid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
          restoredRow = restoredRow.replace(mregex, mcontent);
        });
        codeBlocks.forEach(({ id: cid, content: ccontent }) => {
          const cregex = new RegExp(cid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
          restoredRow = restoredRow.replace(cregex, ccontent);
        });

        const tregex = new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        modifiedContent = modifiedContent.replace(tregex, restoredRow);
        for (let i = 0; i < citations.length; i++) {
          citations[i].text = citations[i].text.replace(tregex, restoredRow);
        }
      });

      // Escape standalone ~ (not part of ~~) to prevent unintended strikethrough.
      // marked v17 treats ~text~ as <del>, which breaks patterns like ~$230 billion.
      // Using negative lookbehind/lookahead so intentional ~~text~~ is left intact.
      modifiedContent = modifiedContent.replace(/(?<![~\\])~(?!~)/g, '\\~');

      return {
        processedContent: modifiedContent,
        citations,
        citationGroups,
        latexBlocks,
        appPreviewBlocks,
        downloadBlocks,
        isProcessing: false,
      };
    } catch (error) {
      console.error('Error processing content:', error);
      return {
        processedContent: content,
        citations: [],
        citationGroups: [],
        latexBlocks: [],
        appPreviewBlocks: [],
        downloadBlocks: [],
        isProcessing: false,
      };
    }
  }, [content]);
};

export const InlineCode: React.FC<{ code: string; elementKey: string }> = React.memo(({ code }) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 1500);
      sileo.success({
        title: 'Code copied to clipboard',
        description: 'You can now paste it anywhere',
        icon: <Copy className="h-4 w-4" />,
      });
    } catch (error) {
      console.error('Failed to copy code:', error);
      sileo.error({
        title: 'Failed to copy code',
        description: 'Please try again or copy manually',
        icon: <X className="h-4 w-4" />,
      });
    }
  }, [code]);

  return (
    <code
      className={cn(
        'inline rounded px-1.5 py-0.5 font-mono text-[0.8em]',
        'bg-muted/40 border border-border/30',
        'text-foreground/80',
        'before:content-none after:content-none',
        'hover:bg-muted/60 active:bg-muted/60 transition-colors duration-150 cursor-pointer',
        'align-baseline touch-manipulation tracking-wide',
        isCopied && 'ring-1 ring-primary/30 bg-primary/5',
      )}
      onClick={handleCopy}
      title={isCopied ? 'Copied!' : 'Click to copy'}
    >
      {code}
    </code>
  );
});

InlineCode.displayName = 'InlineCode';

// Safe LaTeX wrapper with error handling
export const SafeLatex: React.FC<{
  children: string;
  delimiters: Array<{ left: string; right: string; display: boolean }>;
  isBlock?: boolean;
}> = React.memo(({ children, delimiters, isBlock = false }) => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [children]);

  if (hasError) {
    // Fallback: render raw LaTeX text in a code-style format
    return (
      <code
        className={cn(
          'inline rounded px-1 py-0.5 font-mono text-[0.9em]',
          'bg-muted/50 text-foreground/85',
          isBlock && 'block my-4 p-2',
        )}
        style={{
          fontFamily: geistMono.style.fontFamily,
          fontSize: '0.85em',
        }}
        title="LaTeX rendering failed - showing raw content"
      >
        {children}
      </code>
    );
  }

  try {
    return (
      <Latex delimiters={delimiters} strict={false}>
        {children}
      </Latex>
    );
  } catch (error) {
    console.warn('LaTeX rendering error:', error, 'Content:', children);
    setHasError(true);
    return (
      <code
        className={cn(
          'inline rounded px-1 py-0.5 font-mono text-[0.9em]',
          'bg-muted/50 text-foreground/85',
          isBlock && 'block my-4 p-2',
        )}
        style={{
          fontFamily: geistMono.style.fontFamily,
          fontSize: '0.85em',
        }}
        title="LaTeX rendering failed - showing raw content"
      >
        {children}
      </code>
    );
  }
});

SafeLatex.displayName = 'SafeLatex';
