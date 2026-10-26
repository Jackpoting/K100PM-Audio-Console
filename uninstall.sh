#!/system/bin/sh
# REDMI K100 PRO MAX 音质控制台 — 卸载清理 — by 蓝鲸鱼🐳
MODDIR=${0%/*}

# ── 解除挂载 ──
LP_LIST="/odm/etc/audio/audio_lowpower_app_list.xml"
[ -f "$LP_LIST" ] && umount "$LP_LIST" 2>/dev/null

for t in \
  "/odm/etc/dolby/dax-default.xml" \
  "/vendor/etc/dolby/dax-default.xml" \
  "/odm/etc/audio_effects_config.xml"; do
  umount "$t" 2>/dev/null
done

# ── 清理运行残留 ──
rm -f  "/data/local/tmp/k100pm_audio.log"   2>/dev/null
rm -f  "/data/local/tmp/k100pm_webui.log"   2>/dev/null
rm -rf "/data/local/tmp/k100pm_audio_work"  2>/dev/null
rm -rf "/data/local/tmp/k100pm_dolby_fix"   2>/dev/null
rm -f  "/data/local/tmp/k100pm_audio_done"  2>/dev/null
rm -f  "/data/local/tmp/k100pm_eq_current.json"   2>/dev/null
rm -f  "/data/local/tmp/k100pm_eq_presets.json"  2>/dev/null
rm -f  "/data/local/tmp/k100pm_eq_active_preset" 2>/dev/null
rm -f  "/data/local/tmp/k100pm_eq_temp_gl"       2>/dev/null
rm -f  "/data/local/tmp/k100pm_eq.log"           2>/dev/null
rm -rf "/data/local/tmp"/k100pm.build.* 2>/dev/null
rm -rf "/data/local/tmp"/k100pm.apply.* 2>/dev/null
rm -rf "/data/local/tmp/k100pm_upgrade" 2>/dev/null

# ── 停止 OTG 守护进程 ──
if [ -f "$MODDIR/data/state/otg.pid" ]; then
  kill "$(cat "$MODDIR/data/state/otg.pid" 2>/dev/null)" 2>/dev/null
  rm -f "$MODDIR/data/state/otg.pid" 2>/dev/null
fi
rm -f "/data/local/tmp/k100pm_otg.log" 2>/dev/null

# ── 清理模块工作目录 ──
[ -d "$MODDIR/work" ] && rm -rf "$MODDIR/work" 2>/dev/null

echo "=== REDMI K100 PRO MAX 音质控制台 卸载完成，请重启手机生效 ==="
