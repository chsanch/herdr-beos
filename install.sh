#!/bin/sh
# Copies this repo's mods, themes and preview asset into the Herdr app's home
# (Herdr's hot reload and image cache don't follow symlinks), and the layout when
# it isn't there yet: Herdr rewrites the installed layout at run time (the Be
# menu's terminal colors), so it's yours after the first install. `--layout`
# replaces it with the repo's. `--keys` merges this repo's keys.json into the
# installed keys.json without overwriting a key the person already binds; it
# never runs unless asked. Run again after every edit: Herdr reloads.
#
#   ./install.sh                 mods, themes, asset; layout if missing
#   ./install.sh --layout        also replace the installed beos layout
#   ./install.sh --keys          also merge keys.json's layout:beos section
#
# For trying `--keys` on a copy: HERDR_KEYS_FILE=/path/to/keys.json
set -eu
repo=$(cd "$(dirname "$0")" && pwd)
home="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
keys_file="${HERDR_KEYS_FILE:-$home/keys.json}"
want_layout=0
want_keys=0
for arg in "$@"; do
  case "$arg" in
    --layout) want_layout=1 ;;
    --keys) want_keys=1 ;;
    *)
      echo "install.sh: unknown option: $arg" >&2
      echo "usage: ./install.sh [--layout] [--keys]" >&2
      exit 2
      ;;
  esac
done

# Earlier installs linked these; a link is replaced, a real file is updated.
for p in mods/beos mods/beos-files mods/beos-changes mods/beos-graph themes/beos.json themes/beos-dark.json layouts/beos.json layouts/beos.svg; do
  [ -L "$home/$p" ] && rm "$home/$p"
done

mkdir -p "$home/mods/beos" "$home/mods/beos-files" "$home/mods/beos-changes" "$home/mods/beos-graph" "$home/themes" "$home/layouts"
rsync -a --delete --exclude jsconfig.json --exclude '*.d.ts' --filter 'protect sounds/*.mp3' "$repo/mods/beos/" "$home/mods/beos/"
rsync -a --delete --exclude jsconfig.json --exclude '*.d.ts' "$repo/mods/beos-files/" "$home/mods/beos-files/"
rsync -a --delete --exclude jsconfig.json --exclude '*.d.ts' "$repo/mods/beos-changes/" "$home/mods/beos-changes/"
rsync -a --delete --exclude jsconfig.json --exclude '*.d.ts' "$repo/mods/beos-graph/" "$home/mods/beos-graph/"
cp "$repo/themes/beos.json" "$repo/themes/beos-dark.json" "$home/themes/"
cp "$repo/layouts/beos.svg" "$home/layouts/"
echo "copied BeOS mods, themes and layouts/beos.svg"

layout="$home/layouts/beos.json"
if [ ! -e "$layout" ] || [ "$want_layout" = 1 ]; then
  cp "$repo/layouts/beos.json" "$layout"
  echo "copied $layout"
fi

# Merges the repo's keys.json into the person's, section by section and key by
# key: a key already there is never overwritten, and a different action is
# reported instead. A missing keys.json is left missing (creating one would
# freeze all of Herdr's defaults).
if [ "$want_keys" = 1 ]; then
  python3 - "$repo/keys.json" "$keys_file" <<'PY'
import json, os, stat, sys, tempfile

src_path, dst_path = sys.argv[1], sys.argv[2]
try:
    with open(src_path, encoding="utf-8") as f:
        src = json.load(f)
except (OSError, ValueError) as e:
    sys.exit(f"keys: cannot read {src_path}: {e}")
if not os.path.exists(dst_path):
    sys.exit(f"keys: no keys.json at {dst_path}; nothing changed")
try:
    with open(dst_path, encoding="utf-8") as f:
        dst = json.load(f)
except (OSError, ValueError) as e:
    sys.exit(f"keys: cannot read {dst_path}: {e}; nothing changed")
if not isinstance(dst, dict):
    sys.exit(f"keys: {dst_path} is not a JSON object; nothing changed")

added, same, kept = [], [], []
for section, entries in src.items():
    target = dst.setdefault(section, {})
    if not isinstance(target, dict):
        sys.exit(f"keys: section {section!r} in {dst_path} is not an object; nothing changed")
    for key, action in entries.items():
        if key not in target:
            target[key] = action
            added.append((section, key, action))
        elif target[key] == action:
            same.append((section, key))
        else:
            kept.append((section, key, target[key], action))

if added:
    data = json.dumps(dst, indent=2, ensure_ascii=False) + "\n"
    mode = stat.S_IMODE(os.stat(dst_path).st_mode)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(dst_path) or ".", prefix=".keys-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(data)
        os.chmod(tmp, mode)
        os.replace(tmp, dst_path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise

print(f"keys: {dst_path}")
for section, key, action in added:
    print(f"  added {section} {key} -> {action}")
for section, key in same:
    print(f"  already {section} {key}")
for section, key, current, wanted in kept:
    print(f"  kept {section} {key} -> {current} (repo asks {wanted})")
if kept:
    print("keys: keys already bound were left untouched")
if not added and not same and not kept:
    print("  nothing to merge")
PY
fi

herdr-app check "$home/mods/beos"
herdr-app check "$home/mods/beos-files"
herdr-app check "$home/mods/beos-changes"
herdr-app check "$home/mods/beos-graph"
