import { useState, useCallback } from "react";

type Language = "css" | "html" | "json" | "xml";

interface CodeViewerProps {
  code: string;
  language: Language;
  loading: boolean;
}

/**
 * CodeViewer — monospace code block with hand-rolled syntax highlighting
 * (no external highlighter to keep the bundle small) and a copy button.
 */
export function CodeViewer({ code, language, loading }: CodeViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: select the pre element
      const pre = document.querySelector(".code-viewer__pre");
      if (pre) {
        const range = document.createRange();
        range.selectNodeContents(pre);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  }, [code]);

  return (
    <div className={`code-viewer code-viewer--${language}`}>
      <div className="code-viewer__header">
        <span className="code-viewer__lang">{language.toUpperCase()}</span>
        <button
          type="button"
          className="code-viewer__copy"
          onClick={handleCopy}
          aria-label={`Copy ${language} to clipboard`}
          title={`Copy ${language} to clipboard`}
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
      <pre className="code-viewer__pre" tabIndex={0}>
        <code
          className="code-viewer__code"
          dangerouslySetInnerHTML={{ __html: highlight(code, language) }}
        />
      </pre>
      {loading && <div className="code-viewer__overlay">Loading…</div>}
    </div>
  );
}

/* ----- Minimal syntax highlighter (regex-based, ~200 LOC total) ----- */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const CSS_KEYWORDS = [
  "important", "inherit", "initial", "unset", "auto", "none",
];
const HTML_TAGS = [
  "doctype", "html", "head", "body", "title", "meta", "link", "script", "style",
  "div", "span", "p", "a", "img", "ul", "ol", "li", "table", "tr", "td", "th",
  "h1", "h2", "h3", "h4", "h5", "h6", "form", "input", "button", "label",
  "section", "article", "nav", "header", "footer", "main", "aside",
];

function highlight(code: string, language: Language): string {
  const escaped = escapeHtml(code);
  switch (language) {
    case "css":
      return highlightCss(escaped);
    case "html":
      return highlightHtml(escaped);
    case "xml":
      // SVG is XML — same tag/attr syntax as HTML, reuse the highlighter.
      return highlightHtml(escaped);
    case "json":
      return highlightJson(escaped);
  }
}

function highlightCss(s: string): string {
  // Order matters: comments → strings → property names → values
  return s
    .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="syn-c">$1</span>')
    .replace(/("(?:\\"|[^"])*"|'(?:\\'|[^'])*')/g, '<span class="syn-s">$1</span>')
    .replace(/(\b\d+(?:\.\d+)?(?:px|em|rem|%|deg|s|ms|fr)?\b)/g, '<span class="syn-n">$1</span>')
    .replace(/([\w-]+)(?=\s*:)/g, '<span class="syn-k">$1</span>')
    .replace(/(#[0-9a-fA-F]{3,8})/g, '<span class="syn-h">$1</span>')
    .replace(
      new RegExp(`\\b(${CSS_KEYWORDS.join("|")})\\b`, "g"),
      '<span class="syn-k">$1</span>',
    );
}

function highlightHtml(s: string): string {
  return s
    .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="syn-c">$1</span>')
    .replace(
      /(&lt;\/?)([a-zA-Z][a-zA-Z0-9-]*)/g,
      '$1<span class="syn-t">$2</span>',
    )
    .replace(
      /(\s)([a-zA-Z-]+)(=)("[^"]*")/g,
      '$1<span class="syn-a">$2</span>$3<span class="syn-s">$4</span>',
    )
    .replace(
      new RegExp(`&lt;/?(?:${HTML_TAGS.join("|")})`, "g"),
      (m) => `<span class="syn-t">${m.replace(/&lt;\/?/, "")}</span>`,
    );
}

function highlightJson(s: string): string {
  return s
    .replace(/(("(?:\\"|[^"])*")\s*:)/g, '<span class="syn-k">$1</span>:')
    .replace(/:\s*("(?:\\"|[^"])*")/g, ': <span class="syn-s">$1</span>')
    .replace(/:\s*(\b(?:true|false|null)\b)/g, ': <span class="syn-k">$1</span>')
    .replace(/:\s*(-?\d+(?:\.\d+)?)/g, ': <span class="syn-n">$1</span>');
}
