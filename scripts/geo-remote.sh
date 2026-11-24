#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
captions=""
image=""
publish=""
while (($#)); do
  case "$1" in
    --captions) captions="${2:?JSON yolu eksik}"; shift 2 ;;
    --image) image="${2:?Görsel yolu eksik}"; shift 2 ;;
    --publish) publish="--publish"; shift ;;
    *) echo "Bilinmeyen argüman: $1" >&2; exit 2 ;;
  esac
done
[[ -f "$captions" && -f "$image" ]] || { echo 'Metin ve görsel dosyası gerekli.' >&2; exit 2; }
day=$(TZ=Europe/Istanbul date +%F)
host=root@5.182.33.26
container=dgecwxjms61k579zpew9y0rd-181546513318
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
cp "$captions" "$stage/captions.json"
cp "$image" "$stage/personal-card.png"
label=$(ssh -o BatchMode=yes -o ConnectTimeout=15 "$host" "docker inspect '$container' --format '{{index .Config.Labels \"botfusions.geo-trial.release\"}}'")
[[ "$label" == '2026-10-03' ]] || { echo 'Sunucuda doğrulanan GEO imajı çalışmıyor.' >&2; exit 1; }
revision=$(ssh -o BatchMode=yes "$host" "docker inspect '$container' --format '{{index .Config.Labels \"botfusions.linkedin-mcp.revision\"}}'")
[[ "$revision" == 'd580c695995762db8d02b2f1c83c47317ef5a37e' ]] || { echo 'Sunucuda onaylanan GitHub MCP sürümü yok.' >&2; exit 1; }
ssh -o BatchMode=yes "$host" "mkdir -p '/var/lib/botfusions-geo-trial/geo-trial-content/$day'"
scp -q "$stage/captions.json" "$stage/personal-card.png" "$host:/var/lib/botfusions-geo-trial/geo-trial-content/$day/"
ssh -o BatchMode=yes "$host" "docker exec '$container' npm run geo:linkedin -- --captions '/app/data/geo-trial-content/$day/captions.json' --image '/app/data/geo-trial-content/$day/personal-card.png' $publish"
if [[ "$publish" == '--publish' ]]; then
  mkdir -p data/geo-trial-receipts
  scp -q "$host:/var/lib/botfusions-geo-trial/geo-trial-receipts/$day.json" "data/geo-trial-receipts/$day.json"
fi
