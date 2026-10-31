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
profile=debug
case " $build_args " in *" --release "*) profile=release ;; esac
binary="${CARGO_TARGET_DIR:-$root/target}/$profile/xiaoban-desktop"

identity="${XIAOBAN_DEV_SIGNING_IDENTITY:-$(security find-identity -v -p codesigning | sed -n 's/.*"\(Apple Development: [^"]*\)".*/\1/p' | head -n 1)}"
if [ -n "$identity" ]; then
  codesign --force --sign "$identity" --identifier app.xiaoban.desktop "$binary"
else
  echo "dev-runner: no Apple Development identity found; the keychain will ask again after every rebuild" >&2
fi

exec "$binary" "$@"
