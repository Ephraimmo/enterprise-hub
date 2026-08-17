#!/usr/bin/env bash
# Restore the ForkFleet Driver App (registration/login + details dialog) after a sandbox reset.
set -euo pipefail
cd "$(dirname "$0")/../.."            # -> /home/user (repo sits in /home/user/enterprise-hub)
rm -rf forkfleet-driver-hub
git clone --quiet https://github.com/Ephraimmo/forkfleet-driver-hub.git forkfleet-driver-hub
cd forkfleet-driver-hub
git apply "$OLDPWD/enterprise-hub/driver-app-restore/driver-login.patch"
npm install --no-audit --no-fund
npm run dev
