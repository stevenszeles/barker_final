#!/bin/zsh
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "${0:A}")"
.venv-publish/bin/python scripts/restore_dashboard.py --interactive
echo 'Finished. Press Return to close.'
read
