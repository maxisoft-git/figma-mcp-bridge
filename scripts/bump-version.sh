#!/bin/bash
# Bump plugin version in all places at once.
#
# Usage:
#   ./scripts/bump-version.sh                        # print current version
#   ./scripts/bump-version.sh patch                  # 0.5.1 → 0.5.2 (auto-increment)
#   ./scripts/bump-version.sh minor                  # 0.5.1 → 0.6.0
#   ./scripts/bump-version.sh major                  # 0.5.1 → 1.0.0
#   ./scripts/bump-version.sh 0.6.0                  # explicit version
#   ./scripts/bump-version.sh patch --dry-run        # show what would change
#   ./scripts/bump-version.sh patch --server         # also bump server version
#   ./scripts/bump-version.sh patch --commit         # git add + commit + tag
#
# Updates:
#   1. plugin/package.json
#   2. plugin/src/main/version.ts
#   3. plugin/src/ui/version.ts
#   4. server/package.json   (only with --server)
#   5. CHANGELOG.md          (always — adds dated section)
#
# Server version has its own release cycle via release.yml workflow,
# so by default it's left alone.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PLUGIN_DIR="$ROOT_DIR/plugin"
SERVER_DIR="$ROOT_DIR/server"
PKG_JSON="$PLUGIN_DIR/package.json"
MAIN_VERSION="$PLUGIN_DIR/src/main/version.ts"
UI_VERSION="$PLUGIN_DIR/src/ui/version.ts"
SERVER_PKG_JSON="$SERVER_DIR/package.json"
CHANGELOG="$ROOT_DIR/CHANGELOG.md"

# --- arg parsing -----------------------------------------------------------

DRY_RUN=false
BUMP_SERVER=false
AUTO_COMMIT=false
INPUT=""

usage() {
  sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)  DRY_RUN=true ;;
    --server)   BUMP_SERVER=true ;;
    --commit)   AUTO_COMMIT=true ;;
    -h|--help)  usage ;;
    -*)         die "Unknown flag: $1" ;;
    *)          INPUT="$1" ;;
  esac
  shift
done

# --- helpers ---------------------------------------------------------------

die() { echo "ERROR: $*" >&2; exit 1; }
log() { [[ "$DRY_RUN" == "true" ]] && echo "  [dry-run] $*" || echo "  $*" >&2; }

current_plugin_version() {
  node -e "console.log(require('$PKG_JSON').version)"
}

current_server_version() {
  node -e "console.log(require('$SERVER_PKG_JSON').version)"
}

is_valid_semver() { [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; }

bump() {
  local current="$1" level="$2"
  IFS='.' read -r major minor patch <<< "$current"
  case "$level" in
    major) echo "$((major + 1)).0.0" ;;
    minor) echo "${major}.$((minor + 1)).0" ;;
    patch) echo "${major}.${minor}.$((patch + 1))" ;;
    *) die "Unknown bump level: $level" ;;
  esac
}

update_file() {
  local file="$1" content="$2"
  if [[ "$DRY_RUN" == "true" ]]; then
    log "would write to $file:"
    log "---"
    log "$content" | sed 's/^/    /'
    log "---"
  else
    printf '%s' "$content" > "$file"
    log "✓ $file"
  fi
}

# --- resolve new version ---------------------------------------------------

PLUGIN_OLD="$(current_plugin_version)"

if [[ -z "$INPUT" ]]; then
  echo "$PLUGIN_OLD"
  exit 0
fi

if [[ "$INPUT" == "patch" || "$INPUT" == "minor" || "$INPUT" == "major" ]]; then
  PLUGIN_NEW="$(bump "$PLUGIN_OLD" "$INPUT")"
elif is_valid_semver "$INPUT"; then
  PLUGIN_NEW="$INPUT"
else
  die "Invalid input '$INPUT'. Use: <version>, patch, minor, or major"
fi

[[ "$PLUGIN_NEW" != "$PLUGIN_OLD" ]] || die "New version is same as current ($PLUGIN_OLD)"

if [[ "$BUMP_SERVER" == "true" ]]; then
  SERVER_OLD="$(current_server_version)"
  # bump server by same level if explicit level was given, else match plugin
  if [[ "$INPUT" == "patch" || "$INPUT" == "minor" || "$INPUT" == "major" ]]; then
    SERVER_NEW="$(bump "$SERVER_OLD" "$INPUT")"
  else
    SERVER_NEW="$PLUGIN_NEW"
  fi
fi

# --- header ----------------------------------------------------------------

[[ "$DRY_RUN" == "true" ]] && echo "[DRY-RUN] No files will be modified" >&2
echo "Plugin: $PLUGIN_OLD → $PLUGIN_NEW" >&2
[[ "$BUMP_SERVER" == "true" ]] && echo "Server: $SERVER_OLD → $SERVER_NEW" >&2
echo "" >&2

# --- 1. plugin/package.json -------------------------------------------------

NEW_PKG="$(node -e "
  const pkg = require('$PKG_JSON');
  pkg.version = '$PLUGIN_NEW';
  process.stdout.write(JSON.stringify(pkg, null, 2) + '\n');
")"
if [[ "$DRY_RUN" == "true" ]]; then
  log "would update $PKG_JSON (version field only)"
else
  printf '%s' "$NEW_PKG" > "$PKG_JSON"
  log "✓ $PKG_JSON"
fi

# --- 2. src/main/version.ts -------------------------------------------------

MAIN_CONTENT="export const PLUGIN_VERSION = \"$PLUGIN_NEW\";
"
update_file "$MAIN_VERSION" "$MAIN_CONTENT"

# --- 3. src/ui/version.ts ---------------------------------------------------

UI_CONTENT="/**
 * Plugin version (UI bundle).
 *
 * Single source of truth for the UI side. The main thread bundle
 * has its own copy at \`src/main/version.ts\` since vite builds are
 * separate (root: \"./src/ui\" for UI, entry: \"src/main/code.ts\" for main).
 *
 * Keep in sync with \`package.json\` and \`src/main/version.ts\`.
 */
export const PLUGIN_VERSION = \"$PLUGIN_NEW\";
"
update_file "$UI_VERSION" "$UI_CONTENT"

# --- 4. server/package.json (only if --server) ------------------------------

if [[ "$BUMP_SERVER" == "true" ]]; then
  NEW_SERVER_PKG="$(node -e "
    const pkg = require('$SERVER_PKG_JSON');
    pkg.version = '$SERVER_NEW';
    process.stdout.write(JSON.stringify(pkg, null, 2) + '\n');
  ")"
  if [[ "$DRY_RUN" == "true" ]]; then
    log "would update $SERVER_PKG_JSON"
  else
    printf '%s' "$NEW_SERVER_PKG" > "$SERVER_PKG_JSON"
    log "✓ $SERVER_PKG_JSON"
  fi
fi

# --- 5. CHANGELOG.md --------------------------------------------------------

TODAY="$(date +%Y-%m-%d)"
if [[ "$DRY_RUN" == "true" ]]; then
  log "would prepend new section to $CHANGELOG:"
  log "---"
  log "## [$PLUGIN_NEW] — $TODAY"
  log ""
  log "### Changes"
  log "- "
  log "---"
else
  if [[ -f "$CHANGELOG" ]]; then
    TMP="$(mktemp)"
    {
      echo "## [$PLUGIN_NEW] — $TODAY"
      echo ""
      echo "### Changes"
      echo "- "
      cat "$CHANGELOG"
    } > "$TMP"
    mv "$TMP" "$CHANGELOG"
    log "✓ $CHANGELOG (prepended new section)"
  else
    update_file "$CHANGELOG" "## [$PLUGIN_NEW] — $TODAY

### Changes
- "
  fi
fi

# --- 6. git commit + tag (only if --commit) ---------------------------------

if [[ "$AUTO_COMMIT" == "true" ]]; then
  if [[ "$DRY_RUN" == "true" ]]; then
    log "would run: git add plugin/package.json plugin/src/main/version.ts plugin/src/ui/version.ts$([ "$BUMP_SERVER" == "true" ] && echo " server/package.json") CHANGELOG.md"
    log "would run: git commit -m 'chore: bump plugin version to $PLUGIN_NEW'"
    log "would run: git tag v$PLUGIN_NEW"
  else
    cd "$ROOT_DIR"
    FILES_TO_ADD="plugin/package.json plugin/src/main/version.ts plugin/src/ui/version.ts"
    [[ "$BUMP_SERVER" == "true" ]] && FILES_TO_ADD="$FILES_TO_ADD server/package.json"
    FILES_TO_ADD="$FILES_TO_ADD CHANGELOG.md"
    git add $FILES_TO_ADD
    git commit -m "chore: bump plugin version to $PLUGIN_NEW"
    git tag "v$PLUGIN_NEW"
    log "✓ git commit + tag v$PLUGIN_NEW"
  fi
fi

# --- summary ---------------------------------------------------------------

echo "" >&2
[[ "$DRY_RUN" == "true" ]] && echo "Dry-run complete. Re-run without --dry-run to apply." >&2 || {
  echo "Done. Next steps:" >&2
  echo "  1. Edit CHANGELOG.md to describe changes" >&2
  echo "  2. cd plugin && bun run build" >&2
  echo "  3. Re-import plugin in Figma" >&2
  [[ "$BUMP_SERVER" == "true" ]] && echo "  4. cd server && npm run build && publish" >&2
}
