#!/usr/bin/env bash
# Restore the Admin Console driver-fleet fix after a sandbox reset.
set -euo pipefail
cd "$(dirname "$0")/../.."            # -> /home/user (repo sits in /home/user/enterprise-hub)
rm -rf always-unzip-it
git clone --quiet https://github.com/Ephraimmo/always-unzip-it.git always-unzip-it
cd always-unzip-it
git apply "$OLDPWD/enterprise-hub/admin-app-restore/admin-drivers-fix.patch"
npm install --no-audit --no-fund
npm run dev
