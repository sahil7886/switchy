#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
release_root="$(dirname "$project_dir")"
version="$(node -p "require(process.argv[1]).version" "$project_dir/package.json")"
package_dir="${1:-$release_root/switchy-unpacked-$version}"
archive_path="${2:-$release_root/switchy-$version.zip}"

if [[ -e "$package_dir" || -e "$archive_path" ]]; then
  echo "Refusing to overwrite an existing release artifact." >&2
  exit 1
fi

mkdir "$package_dir"
release_files=(
  manifest.json
  background.js
  favicon-guard.js
  shortcut.js
  switcher.js
  onboarding.html
  onboarding.css
  onboarding.js
)

for file in "${release_files[@]}"; do
  cp "$project_dir/$file" "$package_dir/$file"
done
cp -R "$project_dir/assets" "$package_dir/assets"

node -e '
  const fs = require("fs");
  const path = require("path");
  const directory = process.argv[1];
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8"));
  const required = [
    manifest.background.service_worker,
    manifest.options_ui.page,
    ...manifest.content_scripts.flatMap((entry) => entry.js),
    ...Object.values(manifest.icons),
    "onboarding.css",
    "onboarding.js",
  ];
  for (const file of required) {
    if (!fs.existsSync(path.join(directory, file))) throw new Error(`Missing release file: ${file}`);
  }
  console.log(`Validated Switchy ${manifest.version} unpacked folder`);
' "$package_dir"

(
  cd "$package_dir"
  zip -qr "$archive_path" .
)
unzip -t "$archive_path" >/dev/null
echo "Created $package_dir and $archive_path"
