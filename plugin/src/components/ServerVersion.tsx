interface ServerVersionProps {
  pluginVersion: string;
  serverVersion: string | null;
}

export function ServerVersion({ pluginVersion, serverVersion }: ServerVersionProps) {
  if (!serverVersion || serverVersion === pluginVersion) return null;

  return (
    <div className="version-warning">
      Plugin v{pluginVersion} ← Server v{serverVersion}
      <br />
      <span className="version-hint">Re-import plugin to update</span>
    </div>
  );
}
