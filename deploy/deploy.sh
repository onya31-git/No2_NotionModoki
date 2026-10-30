#!/usr/bin/env bash
# WSL でビルドし、Raspberry Pi 上の PocketBase へ配置する。
# 使い方: ./deploy/deploy.sh [-r] [pi@raspberrypi.local]
#   -r : pb_migrations を更新したとき（スキーマ変更時）に指定。静的ファイルだけなら再起動不要。
# 環境変数 PI_HOST / PB_DIR でも接続先と配置先を指定できる。
set -euo pipefail

RESTART=0
while getopts r opt; do
  case $opt in
    r) RESTART=1 ;;
    *) echo "usage: $0 [-r] [user@host]" >&2; exit 1 ;;
  esac
done
shift $((OPTIND - 1))

PI_HOST="${1:-${PI_HOST:-pi@raspberrypi.local}}"
PB_DIR="${PB_DIR:-/home/pi/pocketbase}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# 1. ビルド（Pi 側では Node.js を一切使わない）
(cd "$ROOT/web" && npm run build)

# 2. マイグレーションを同期
tar -C "$ROOT/pocketbase" -czf - pb_migrations \
  | ssh "$PI_HOST" "tar -xzf - -C '$PB_DIR'"

# 3. 新しい pb_public に展開してから入れ替え（古いハッシュ付きアセットを残さない）
tar -C "$ROOT/web/dist" -czf - . | ssh "$PI_HOST" "set -e
cd '$PB_DIR'
rm -rf pb_public.new pb_public.old
mkdir pb_public.new
tar -xzf - -C pb_public.new
if [ -d pb_public ]; then mv pb_public pb_public.old; fi
mv pb_public.new pb_public
rm -rf pb_public.old"

if [ "$RESTART" = 1 ]; then
  ssh -t "$PI_HOST" "sudo systemctl restart pocketbase"
fi

echo "デプロイ完了: http://${PI_HOST#*@}:8090/"
