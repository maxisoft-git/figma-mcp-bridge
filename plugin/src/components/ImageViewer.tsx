import { useState, useCallback } from "react";

interface ImageViewerProps {
  base64: string;
  mime: string;
  source?: string;
  scaleMode?: string;
  fileName?: string;
  loading: boolean;
}

/**
 * ImageViewer — preview an image extracted from a Figma node.
 * Shows the rendered image, source (node / child / export), and a
 * download button (uses data: URL since plugin can't write to disk).
 */
export function ImageViewer({
  base64,
  mime,
  source,
  scaleMode,
  fileName,
  loading,
}: ImageViewerProps) {
  const [copied, setCopied] = useState(false);
  const src = `data:${mime};base64,${base64}`;
  const name = (fileName ?? "image").replace(/[^a-zA-Z0-9._-]/g, "_");
  const ext = mime === "image/png" ? "png"
    : mime === "image/jpeg" ? "jpg"
    : mime === "image/gif" ? "gif"
    : mime === "image/webp" ? "webp"
    : "bin";
  const downloadName = name.includes(`.${ext}`) ? name : `${name}.${ext}`;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(base64);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }, [base64]);

  return (
    <div className="image-viewer">
      <div className="image-viewer__header">
        <span className="image-viewer__mime">{mime}</span>
        {source && (
          <span className="image-viewer__source" title={`scaleMode: ${scaleMode ?? "—"}`}>
            {source}
          </span>
        )}
        <a
          className="image-viewer__download"
          href={src}
          download={downloadName}
          aria-label={`Download ${downloadName}`}
        >
          Download
        </a>
        <button
          type="button"
          className="image-viewer__copy"
          onClick={handleCopy}
          aria-label="Copy base64 to clipboard"
          title="Copy base64 to clipboard"
        >
          {copied ? "✓ Copied" : "Copy b64"}
        </button>
      </div>

      <div className="image-viewer__preview">
        <img
          src={src}
          alt={fileName ?? "Extracted image"}
          className="image-viewer__img"
        />
      </div>

      {loading && <div className="image-viewer__overlay">Loading…</div>}
    </div>
  );
}
