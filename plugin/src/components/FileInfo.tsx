import type { FileStatus } from "../types/messages";

interface FileInfoProps {
  status: FileStatus;
  openFiles: number;
}

export function FileInfo({ status, openFiles }: FileInfoProps) {
  return (
    <div className="info-section">
      <div className="info-row">
        <span className="info-label">File:</span>
        <span className="info-value">
          {status.fileName}
          {openFiles > 1 && (
            <span className="info-muted"> · {openFiles} open</span>
          )}
        </span>
      </div>
      <div className="info-row">
        <span className="info-label">FileKey:</span>
        <span className="info-value info-value--mono" title={status.fileKey}>
          {status.fileKey || "—"}
        </span>
      </div>
      <div className="info-row">
        <span className="info-label">Selection:</span>
        <span className="info-value">{status.selectionCount} node(s)</span>
      </div>
    </div>
  );
}
