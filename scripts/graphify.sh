#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIN="$ROOT/graphify-out/.graphify_python"

if [[ -f "$PIN" ]]; then
    PY="$(tr -d '\r\n' < "$PIN")"
elif [[ -x "$HOME/.local/share/uv/tools/graphifyy/bin/python" ]]; then
    PY="$HOME/.local/share/uv/tools/graphifyy/bin/python"
elif command -v graphify >/dev/null 2>&1; then
    BIN="$(which graphify)"
    SHEBANG="$(head -1 "$BIN" | tr -d '#!')"
    if [[ -x "$SHEBANG" ]]; then
        PY="$SHEBANG"
    else
        PY="python3"
    fi
else
    PY="python3"
fi

COMMAND="${1:-update}"
shift || true

cd "$ROOT"

case "$COMMAND" in
    update)
        exec "$PY" -m graphify . --update --code-only --no-viz "$@"
        ;;
    rebuild)
        exec "$PY" -m graphify . --code-only --no-viz --force "$@"
        ;;
    report)
        exec "$PY" -m graphify cluster-only . --no-viz "$@"
        ;;
    *)
        exec "$PY" -m graphify "$COMMAND" "$@"
        ;;
esac
