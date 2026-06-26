import { useState, useCallback } from "react";

interface SvgViewerProps {
  svg: string;
  loading: boolean;
}

/**
 * SvgViewer — shows the raw SVG markup as monospaced code.
 *
 * No syntax highlighting: SVG content is large and the regex-based
 * highlighter that works fine for CSS/HTML can produce visible
 * artifacts in long SVG strings (the `<` from `&lt;` entities and
 * the `<span>` wrapper are both rendered, and at scale the result
 * looks "broken" even when the underlying HTML is valid).
 *
 * The Copy button places the raw SVG string on the clipboard so
 * the user can paste it into an editor, browser, or Figma's
 * import-SVG flow.
 */
export function SvgViewer({ svg, loading }: SvgViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(svg);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }, [svg]);

  return (
    <div className="svg-viewer">
      <div className="svg-viewer__header">
        <span className="svg-viewer__lang">SVG</span>
        <span className="svg-viewer__size">
          {(svg.length / 1024).toFixed(1)} KB
        </span>
        <button
          type="button"
          className="svg-viewer__copy"
          onClick={handleCopy}
          aria-label="Copy SVG to clipboard"
          title="Copy SVG to clipboard"
        >
          {copied ? "✓ Copied" : "Copy SVG"}
        </button>
      </div>

      <pre className="svg-viewer__pre" tabIndex={0}>
        <code className="svg-viewer__code">{svg}</code>
      </pre>

      {loading && <div className="svg-viewer__overlay">Loading…</div>}
    </div>
  );
}
