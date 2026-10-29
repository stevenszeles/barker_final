#!/bin/zsh
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")"
if [[ ! -x .venv-publish/bin/python ]]; then
  python3.11 -m venv .venv-publish
  .venv-publish/bin/python -m pip install -r requirements-publish.txt
fi
if [[ ! -d frontend/node_modules ]]; then
  (cd frontend && npm ci)
fi
.venv-publish/bin/python scripts/publish_dashboard.py "$@"
echo 'Finished. Press Return to close.'
read
