#!/bin/sh
set -eu

if [ "$(uname)" != "Darwin" ] || [ "${1:-}" != "run" ]; then
  exec cargo "$@"
fi
shift

build_args=""
while [ $# -gt 0 ] && [ "$1" != "--" ]; do
  build_args="$build_args $1"
  shift
done
[ $# -gt 0 ] && shift

# shellcheck disable=SC2086
cargo build $build_args

root="$(cd "$(dirname "$0")/.." && pwd)"
tauri="$root/apps/desktop/src-tauri"
profile=debug
case " $build_args " in *" --release "*) profile=release ;; esac
target="${CARGO_TARGET_DIR:-$root/target}/$profile"

app="$target/Xiaoban Dev.app"
rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp "$target/xiaoban-desktop" "$app/Contents/MacOS/xiaoban-desktop"
cp -R "$tauri/lproj/." "$app/Contents/Resources/"
plist="$app/Contents/Info.plist"
cp "$tauri/Info.plist" "$plist"
plutil -insert CFBundleIdentifier -string app.xiaoban.desktop "$plist"
plutil -insert CFBundleExecutable -string xiaoban-desktop "$plist"
plutil -insert CFBundleName -string Xiaoban "$plist"
plutil -insert CFBundlePackageType -string APPL "$plist"
plutil -insert CFBundleIconFile -string icon.icns "$plist"
cp "$tauri/icons/icon.icns" "$app/Contents/Resources/icon.icns"

identity="${XIAOBAN_DEV_SIGNING_IDENTITY:-$(security find-identity -v -p codesigning | sed -n 's/.*"\(Apple Development: [^"]*\)".*/\1/p' | head -n 1)}"
if [ -n "$identity" ]; then
  codesign --force --sign "$identity" "$app"
else
  echo "dev-runner: no Apple Development identity found; the keychain will ask again after every rebuild" >&2
fi

exec "$app/Contents/MacOS/xiaoban-desktop" "$@"
