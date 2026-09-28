#!/usr/bin/env bash
set -euo pipefail

project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
dist_root="$project_root/dist"

rm -rf "$dist_root"
mkdir -p "$dist_root/server" "$dist_root/.openai"
node "$project_root/scripts/build-worker.mjs"
cp "$project_root/.openai/hosting.json" "$dist_root/.openai/hosting.json"
mkdir -p "$project_root/docs/scores"
cp "$project_root/app/index.html" "$project_root/docs/index.html"
cp "$project_root/app/index.html" "$project_root/docs/scores/index.html"
touch "$project_root/docs/.nojekyll"

echo "Built $dist_root"
