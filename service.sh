#!/system/bin/sh
# REDMI K100 PRO MAX 音质控制台 — service.sh — by 蓝鲸鱼🐳

MODDIR=${0%/*}
LOG="/data/local/tmp/k100pm_audio.log"
echo "" > "$LOG"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG"; }
log "service.sh 启动"

# resetprop路径检测
RESETPROP=""
for rp in "/data/adb/magisk/resetprop" "/data/adb/ksu/bin/resetprop" "/data/adb/ap/bin/resetprop"; do
  [ -x "$rp" ] && { RESETPROP="$rp"; break; }
done
[ -z "$RESETPROP" ] && command -v resetprop >/dev/null 2>&1 && RESETPROP="resetprop"

set_prop() {
  local key="$1" value="$2"
  if [ -n "$RESETPROP" ]; then
    "$RESETPROP" "$key" "$value" 2>/dev/null
  else
    setprop "$key" "$value" 2>/dev/null
  fi
}

if [ -z "$RESETPROP" ]; then
  log "resetprop不可用，跳过属性注入"
else
  # ── DAX3 参数：由 data/props.conf 驱动（WebUI → DAX 属性页可热改）──
  PROP_CONF="$MODDIR/data/props.conf"
  if [ -f "$PROP_CONF" ]; then
    prop_count=0
    while IFS= read -r _p_line; do
      case "$_p_line" in
        ''|'#'*) continue ;;
        *=*)
          _p_k=${_p_line%%=*}
          _p_v=${_p_line#*=}
          case "$_p_k" in ''|*[!A-Za-z0-9_.]*) continue ;; esac
          set_prop "$_p_k" "$_p_v"
          prop_count=$((prop_count + 1))
          ;;
      esac
    done < "$PROP_CONF"
    log "props.conf 已注入 $prop_count 项属性"
  else
    log "props.conf 缺失，回退内置默认值"
    set_prop persist.vendor.dolby.global.enable 1
    set_prop persist.vendor.dolby.dialog.enhancer.enable 1
    set_prop persist.vendor.dolby.dialog.enhancer.amount 7
    set_prop persist.vendor.dolby.virtualizer.enable 1
    set_prop persist.vendor.dolby.virtualizer.amount 6
    set_prop persist.vendor.dolby.bass.enable 1
    set_prop persist.vendor.dolby.bass.boost 6
    set_prop persist.vendor.dolby.spectral.enable 1
    set_prop persist.vendor.dolby.spectral.boost 7
    set_prop persist.vendor.dolby.ieq.enable 0
    set_prop vendor.dolby.dap.pcequal 0
    set_prop vendor.dolby.dap.pctype 0
    set_prop persist.vendor.audio.low_power false
    set_prop persist.vendor.audio_hal.low_power false
  fi

  log "DAX属性注入完成"
fi


# ── 低功耗清除（settings + resetprop + 白名单空列表挂载）──
if command -v settings >/dev/null 2>&1; then
  for k in audio_low_power_mode miui_audio_power_save hyper_audio_power_save; do
    settings put global "$k" 0 2>/dev/null
    settings put system "$k" 0 2>/dev/null
  done
fi
# 低功耗相关属性统一由 data/props.conf 注入（见上方循环），此处不再重复覆盖
LP_LIST="/odm/etc/audio/audio_lowpower_app_list.xml"
if [ -f "$LP_LIST" ]; then
  umount "$LP_LIST" 2>/dev/null
  mount --bind /dev/null "$LP_LIST" 2>/dev/null
  log "低功耗白名单已清空（bind /dev/null 去除）"
fi
# ── 兜底：清理 TrackCustomEfx 配置（若系统存在，则 bind /dev/null 无效化）──
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


# ════════════════════════════════════════════════════════════
# Dolby DVL 媒体杜比化 — 对齐 K90PM 2.1A/2.2A 方案
# 核心：动态探测设备上【真实存在】的 vendor AIDL 文件，
#       基于原系统文件 copy + sed 改成【只保 media 走杜比】，再 bind 回真实路径。
# 好处：① 不写死 sku 目录，任何 sku 都能命中
#       ② 基于设备原生文件改写，库声明/UUID 天然匹配，不会因成品不匹配而解析失败
#       ③ service 阶段（boot 完成后）才改写并 bind，AudioFlinger 后续能正确读取
#       ④ 不做 kill audioserver（纯媒体杜比化，避免卡屏/服务循环）
# ════════════════════════════════════════════════════════════
log "---------- Dolby DVL 媒体杜比化 ----------"
AIDL=""
for sku_dir in /vendor/etc/audio/sku_canoe /vendor/etc/audio/sku_myron /vendor/etc/audio/sku_* /vendor/etc/audio; do
  candidate="$sku_dir/audio_effects_config.xml"
  if [ -f "$candidate" ]; then
    AIDL="$candidate"
    log "  检测到 AIDL: $AIDL"
    break
  fi
done
DOLBY_WORK="$MODDIR/work/dolby"
need_dolby_fix=0
if [ -f "$AIDL" ]; then
  sed -n '/<postprocess>/,/<\/postprocess>/p' "$AIDL" | grep -q 'apply effect="dlb_music_listener"' || need_dolby_fix=1
fi
if [ "$need_dolby_fix" = "1" ]; then
  mkdir -p "$DOLBY_WORK"
  cp -f "$AIDL" "$DOLBY_WORK/audio_effects_config.xml"
  sed -i '/<postprocess>/,/<\/postprocess>/c\
    <postprocess>\
        <stream type="music"><apply effect="dlb_music_listener"\/><\/stream>\
    <\/postprocess>' "$DOLBY_WORK/audio_effects_config.xml"
  umount "$AIDL" 2>/dev/null
  [ -s "$DOLBY_WORK/audio_effects_config.xml" ] && chcon --reference="$AIDL" "$DOLBY_WORK/audio_effects_config.xml" 2>/dev/null && mount --bind "$DOLBY_WORK/audio_effects_config.xml" "$AIDL" 2>/dev/null
  sed -n '/<postprocess>/,/<\/postprocess>/p' "$AIDL" | grep -q 'apply effect="dlb_music_listener"' && log "Dolby DVL 媒体杜比化 ✓" || log "Dolby DVL 媒体杜比化 ✗"
else
  log "Dolby DVL 已媒体杜比化，跳过"
fi

# ── ODM 版媒体杜比化（若 /odm/etc/audio_effects_config.xml 存在则同样处理）──
ODM_AIDL="/odm/etc/audio_effects_config.xml"
if [ -f "$ODM_AIDL" ] && ! sed -n '/<postprocess>/,/<\/postprocess>/p' "$ODM_AIDL" 2>/dev/null | grep -q 'apply effect="dlb_music_listener"'; then
  mkdir -p "$DOLBY_WORK"
  cp -f "$ODM_AIDL" "$DOLBY_WORK/audio_effects_config_odm.xml"
  sed -i '/<postprocess>/,/<\/postprocess>/c\
    <postprocess>\
        <stream type="music"><apply effect="dlb_music_listener"\/><\/stream>\
    <\/postprocess>' "$DOLBY_WORK/audio_effects_config_odm.xml"
  umount "$ODM_AIDL" 2>/dev/null
  [ -s "$DOLBY_WORK/audio_effects_config_odm.xml" ] && chcon --reference="$ODM_AIDL" "$DOLBY_WORK/audio_effects_config_odm.xml" 2>/dev/null && mount --bind "$DOLBY_WORK/audio_effects_config_odm.xml" "$ODM_AIDL" 2>/dev/null
  sed -n '/<postprocess>/,/<\/postprocess>/p' "$ODM_AIDL" | grep -q 'apply effect="dlb_music_listener"' && log "ODM Dolby DVL 媒体杜比化 ✓" || log "ODM Dolby DVL 媒体杜比化 ✗"
else
  log "ODM Dolby DVL 已媒体杜比化或跳过"
fi

log "Dolby DVL 媒体杜比化完成（不重启音频服务，由高通效果链自然生效）"

# ════════════════════════════════════════════════════════════
# OTG：开机自动开启 + 防 10 分钟超时（data/otg.conf 可开关）
#   控制节点 /sys/class/xm_power/typec/cc_toggle 由 k100pm.sh 探测；
#   KEEP_ON=1 时后台 watchdog 每 INTERVAL 秒复查并自动重开。
# ════════════════════════════════════════════════════════════
if [ -f "$MODDIR/bin/k100pm.sh" ]; then
  log "---------- OTG 自动开启 ----------"
  /system/bin/sh "$MODDIR/bin/k100pm.sh" otg boot >> "$LOG" 2>&1
  log "OTG 初始化完成"
fi

log "service.sh 完成"