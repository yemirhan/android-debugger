#!/bin/bash
set -euo pipefail

# Run on macOS after updating the 1024px source artwork.
resources_dir="$(cd "$(dirname "$0")/../resources" && pwd)"
icon_tmp_dir="$(mktemp -d)"
trap 'rm -rf "$icon_tmp_dir"' EXIT
iconset_dir="$icon_tmp_dir/icon.iconset"
mkdir -p "$iconset_dir"

for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$resources_dir/icon.png" \
    --out "$iconset_dir/icon_${size}x${size}.png" >/dev/null
  sips -z "$((size * 2))" "$((size * 2))" "$resources_dir/icon.png" \
    --out "$iconset_dir/icon_${size}x${size}@2x.png" >/dev/null
done

iconutil -c icns "$iconset_dir" -o "$resources_dir/icon.icns"
