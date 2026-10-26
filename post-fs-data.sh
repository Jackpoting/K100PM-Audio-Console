#!/system/bin/sh

MODDIR=${0%/*}
LOG="/data/local/tmp/k100pm_audio.log"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [post-fs-data] $1" >> "$LOG"; }
echo "" > "$LOG"
log "启动"

# ── Root 环境检测（兼容 Magisk / KernelSU / APatch / SuiSu）──
ROOT_TYPE="unknown"
[ -d "/proc/sukisu" ] && ROOT_TYPE="sukisu"
[ "$ROOT_TYPE" = "unknown" ] && { [ -f "/data/adb/ksud" ] || [ -x "/data/adb/ksu/bin/ksud" ]; } && ROOT_TYPE="kernelsu"
[ "$ROOT_TYPE" = "unknown" ] && [ -d "/data/adb/magisk" ] && ROOT_TYPE="magisk"
[ "$ROOT_TYPE" = "unknown" ] && [ -d "/data/adb/ap" ] && ROOT_TYPE="apatch"
RESETPROP=""
for rp in "/data/adb/magisk/resetprop" "/data/adb/ksu/bin/resetprop" "/data/adb/ap/bin/resetprop"; do
  [ -x "$rp" ] && { RESETPROP="$rp"; break; }
done
[ -z "$RESETPROP" ] && command -v resetprop >/dev/null 2>&1 && RESETPROP="resetprop"
log "Root: $ROOT_TYPE / resetprop: ${RESETPROP:-不可用}"
bind_tree() {
    local src_root="$1"
    local dst_root="$2"
    [ -d "$src_root" ] || return 0
    find "$src_root" -type f | while IFS= read -r src; do
        rel="${src#$src_root/}"
        dst="${dst_root%/}/$rel"
        [ -e "$dst" ] || continue
        mount --bind "$src" "$dst"
        restorecon "$dst" 2>/dev/null
    done
}


bind_tree "$MODDIR/Link" "/"
bind_tree "$MODDIR/vendor" "/vendor"
# ── SELinux 上下文（显式 chcon，确保挂载文件为 vendor_configs_file 域）──
# 对齐 K90 2.1A：必须覆盖 Link/odm/etc 顶层（含 audio_effects_config.xml）及各子目录，
# 否则 audioserver 读取被 SELinux 拒，杜比媒体杜比化不生效。
chcon_files() {
  for f in \
    "$MODDIR"/Link/odm/etc/*.xml \
    "$MODDIR"/Link/odm/etc/dolby/*.xml \
    "$MODDIR"/Link/odm/etc/audio/*.xml \
    "$MODDIR"/Link/odm/etc/audio/sku_canoe/*.xml \
    "$MODDIR"/vendor/etc/*.xml \
    "$MODDIR"/vendor/etc/dolby/*.xml \
    "$MODDIR"/vendor/etc/audio/sku_canoe/*.xml; do
    [ -f "$f" ] && chcon u:object_r:vendor_configs_file:s0 "$f" 2>/dev/null
  done
}
chcon_files
log "SELinux 上下文已设置"
# ── 移除系统音量限制/低功耗白名单（直接 bind /dev/null 覆盖，去除白名单内容）──
LP_TARGET="/odm/etc/audio/audio_lowpower_app_list.xml"
if [ -f "$LP_TARGET" ]; then
    umount "$LP_TARGET" 2>/dev/null
    mount --bind /dev/null "$LP_TARGET" 2>/dev/null
fi
# ── 兜底：清理 TrackCustomEfx 配置（若系统存在，则 bind /dev/null 无效化，避免按应用拉低响度）──
for t in \
    "/odm/etc/audio/trackefx_config.xml" \
    "/vendor/etc/trackefx_config.xml" \
    "/odm/etc/trackefx_config.xml"; do
    if [ -f "$t" ]; then
        umount "$t" 2>/dev/null
        mount --bind /dev/null "$t" 2>/dev/null
        log "trackefx 已无效化: $t"
    fi
done