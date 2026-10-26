SKIPUNZIP=0
[ ! "$MODPATH" ] && MODPATH=${0%/*}

# ── 机型检测 ──
DEVICE=$(getprop ro.product.vendor.device)
DEVICE2=$(getprop ro.product.device)
DEVICE3=$(getprop ro.build.product)
DEVICE4=$(getprop ro.product.odm.device)
MODEL=$(getprop ro.product.model)
MARKET=$(getprop ro.product.marketname)
VERSION=$(getprop ro.build.version.release)
API=$(getprop ro.build.version.sdk)
case "$API" in ''|*[!0-9]*) API=0 ;; esac

# ── Dolby 路径检测 ──
FILE_PATHS="/vendor/etc/dolby/dax-default.xml /system/vendor/etc/dolby/dax-default.xml /odm/etc/dolby/dax-default.xml"

file_exists=false
for path in $FILE_PATHS; do
    if [ -f "$path" ]; then
        file_exists=true
        break
    fi
done

ui_print ""
ui_print "  ─────────────────────────────"
ui_print "  REDMI K100 PRO MAX 音质控制台 1.0"
ui_print "  作者：蓝鲸鱼🐳"
ui_print "  内置可视化 WebUI · K100PM 基准曲线"
ui_print "  ─────────────────────────────"
ui_print ""
ui_print "  K100PM tuning · Clear midrange"
ui_print "  Solid low-end · Wide soundstage"
ui_print "  Clean, pump-free dynamics"
ui_print "  Dolby full-chain optimized"
ui_print ""
ui_print "  ▸ 机型验证"

# ── 机型验证：不匹配直接终止，不修改任何文件 ──
DEV_OK=false
case "$DEVICE2" in songyuan*) DEV_OK=true ;; esac
case "$DEVICE3" in songyuan*) DEV_OK=true ;; esac
case "$DEVICE4" in songyuan*) DEV_OK=true ;; esac

MODEL_OK=false
case "$MODEL" in M098FE|*K100*|*k100*) MODEL_OK=true ;; esac
case "$MARKET" in *K100*|*k100*) MODEL_OK=true ;; esac

if [ "$DEV_OK" != true ]; then
  ui_print "  ✗ 机型不匹配：设备代号 ${DEVICE2:-未知}"
  ui_print "    仅支持 REDMI K100 Pro Max（songyuan）"
  ui_print "    已取消安装，未修改任何文件"
  abort
fi
if [ "$MODEL_OK" != true ]; then
  ui_print "  ✗ 机型不匹配：${MARKET:-未知} / ${MODEL:-未知}"
  ui_print "    仅支持 REDMI K100 Pro Max（songyuan）"
  ui_print "    已取消安装，未修改任何文件"
  abort
fi
if [ "$API" -lt 35 ]; then
  ui_print "  ✗ 系统版本过低：Android ${VERSION:-未知}（API ${API:-0}）"
  ui_print "    需要 Android 15+（API 35+）"
  ui_print "    已取消安装，未修改任何文件"
  abort
fi
if [ "$file_exists" != true ]; then
  ui_print "  ✗ 未检测到 Dolby 配置文件"
  ui_print "    可能不是原厂 ROM，已取消安装"
  ui_print "    未修改任何文件"
  abort
fi

ui_print "  ✓ 机型：${MARKET:-REDMI K100 Pro Max} / ${MODEL:-M098FE}"
ui_print "  ✓ 设备：${DEVICE2} / Android ${VERSION}（API ${API}）"
ui_print "  ✓ Dolby 配置检测通过"
ui_print ""

# ── 配置完整性校验（Link + vendor 双路径一致；factory 为出厂备份，不参与校验）──
EXPECT_MD5="3e393c0fa3afad67f8aeff7bfa70edea"
ACTUAL_MD5_LINK=$(unzip -p "$ZIPFILE" "Link/odm/etc/dolby/dax-default.xml" | md5sum | cut -d' ' -f1)
ACTUAL_MD5_VENDOR=$(unzip -p "$ZIPFILE" "vendor/etc/dolby/dax-default.xml" | md5sum | cut -d' ' -f1)
if [ "$ACTUAL_MD5_LINK" != "$EXPECT_MD5" ] || [ "$ACTUAL_MD5_VENDOR" != "$EXPECT_MD5" ]; then
  ui_print ""
  ui_print "  ⚠️  警告：检测到模块杜比文件已被修改"
  ui_print "  调音参数与官方版本不符，可能为二改版本"
  ui_print "  请从原始发布处重新下载"
  ui_print "  已取消安装，未修改任何文件"
  ui_print ""
  abort
fi

# ── 清理运行缓存（k100pm 命名）──
rm -rf "/data/local/tmp/k100pm_audio_work" 2>/dev/null
rm -rf "/data/local/tmp/k100pm_dolby_fix"  2>/dev/null
rm -f  "/data/local/tmp/k100pm_audio.log"  2>/dev/null
rm -f  "/data/local/tmp/k100pm_audio_done" 2>/dev/null
rm -f  "/data/local/tmp/k100pm_eq_current.json"  2>/dev/null
rm -f  "/data/local/tmp/k100pm_eq_presets.json"  2>/dev/null
rm -f  "/data/local/tmp/k100pm_eq_active_preset" 2>/dev/null
rm -f  "/data/local/tmp/k100pm_eq_temp_gl"       2>/dev/null
rm -f  "/data/local/tmp/k100pm_eq.log"           2>/dev/null
rm -rf "/data/local/tmp/k100pm.build."* 2>/dev/null
rm -rf "/data/local/tmp/k100pm.apply."* 2>/dev/null

# ── 升级时保留用户数据（自定义曲线 / 槽位 / 属性）──
STASH="/data/local/tmp/k100pm_upgrade"
rm -rf "$STASH" 2>/dev/null
STASHED=0
for mod_path in "/data/adb/modules/k100pm_audio_plus" \
                "/data/adb/ksu/modules/k100pm_audio_plus" \
                "/data/adb/ap/modules/k100pm_audio_plus"; do
  if [ -d "$mod_path/data" ] && [ "$mod_path" != "$MODPATH" ]; then
    mkdir -p "$STASH/curves" 2>/dev/null
    for gc in "$mod_path"/data/curves/*.gains; do
      [ -f "$gc" ] || continue
      gid="${gc##*/}"; gid="${gid%.gains}"
      [ -f "$mod_path/data/curves/$gid.builtin" ] && continue
      cp -f "$gc" "$STASH/curves/" 2>/dev/null
      [ -f "$mod_path/data/curves/$gid.name" ] && cp -f "$mod_path/data/curves/$gid.name" "$STASH/curves/" 2>/dev/null
      [ -f "$mod_path/data/curves/$gid.src" ] && cp -f "$mod_path/data/curves/$gid.src" "$STASH/curves/" 2>/dev/null
    done
    [ -f "$mod_path/data/slots.conf" ] && cp -f "$mod_path/data/slots.conf" "$STASH/" 2>/dev/null
    [ -f "$mod_path/data/props.conf" ] && cp -f "$mod_path/data/props.conf" "$STASH/" 2>/dev/null
    if [ -f "$mod_path/data/otg.conf" ]; then
      _oa=1; _ok=1; _oi=30; _on=""
      while IFS= read -r _ol || [ -n "$_ol" ]; do
        case "$_ol" in
          AUTO_ON=*)  _oa=${_ol#*=} ;;
          KEEP_ON=*)  _ok=${_ol#*=} ;;
          INTERVAL=*) _oi=${_ol#*=} ;;
          NODE=*)     _on=${_ol#*=} ;;
        esac
      done < "$mod_path/data/otg.conf" 2>/dev/null
      # v1.5C 默认是“开启”；没改过的配置不保留，升级后使用 v1.5D 的默认“关闭”。
      if [ "$_oa" = "1" ] && [ "$_ok" = "1" ] && [ "$_oi" = "30" ] && [ -z "$_on" ]; then
        :
      else
        cp -f "$mod_path/data/otg.conf" "$STASH/" 2>/dev/null
      fi
    fi
    STASHED=1
    break
  fi
done

# ── 检测已安装旧版本并彻底清理 ──
OLD_VER=""
for mod_path in "/data/adb/modules/k100pm_audio_plus" \
                "/data/adb/ksu/modules/k100pm_audio_plus" \
                "/data/adb/ap/modules/k100pm_audio_plus"; do
  if [ -f "$mod_path/module.prop" ]; then
    OLD_VER=$(grep '^version=' "$mod_path/module.prop" | cut -d= -f2)
    break
  fi
done
if [ -n "$OLD_VER" ] && [ "$mod_path" != "$MODPATH" ]; then
  ui_print "  ✦ 检测到旧版本: $OLD_VER，正在清理..."
  for mod_path in "/data/adb/modules/k100pm_audio_plus" \
                  "/data/adb/ksu/modules/k100pm_audio_plus" \
                  "/data/adb/ap/modules/k100pm_audio_plus"; do
    if [ -d "$mod_path" ] && [ "$mod_path" != "$MODPATH" ]; then
      rm -rf "$mod_path"
      ui_print "  ✓ 已清理: $mod_path"
    fi
  done
else
  ui_print "  ✦ 全新安装"
fi
sleep 0.3

    ui_print "  Applying tuning parameters..."
    ui_print ""
    ui_print "  ✓  K100PM 调整版默认曲线（IEQ ×3 / GEQ ×7）"
    ui_print "  ✓  Dolby DAX configuration"
    ui_print "  ✓  Low-power disabled"
    ui_print "  ✓  Dolby for all apps"
    ui_print "  ✓  OTG ready (default off)"
    ui_print "  ✓  System cache cleared"
    ui_print ""
    ui_print "  ─────────────────────────────"
    ui_print "  Install complete."
    ui_print "  Reboot to take effect."
    ui_print "  ─────────────────────────────"
    ui_print ""
    ui_print "  ▸ 可视化 WebUI："
    ui_print "    KernelSU / SukiSU：模块列表 → 本模块 → 打开"
    ui_print "    APatch / MMRL：同样在模块详情页打开 WebUI"
    ui_print ""

# ── 恢复升级前的用户数据 ──
if [ "$STASHED" = "1" ] && [ -d "$STASH" ]; then
  mkdir -p "$MODPATH/data/curves" 2>/dev/null
  for gc in "$STASH"/curves/*.gains; do
    [ -f "$gc" ] || continue
    gid="${gc##*/}"; gid="${gid%.gains}"
    [ -f "$MODPATH/data/curves/$gid.builtin" ] && continue
    cp -f "$gc" "$MODPATH/data/curves/" 2>/dev/null
    [ -f "$STASH/curves/$gid.name" ] && cp -f "$STASH/curves/$gid.name" "$MODPATH/data/curves/" 2>/dev/null
    [ -f "$STASH/curves/$gid.src" ] && cp -f "$STASH/curves/$gid.src" "$MODPATH/data/curves/" 2>/dev/null
    chmod 0644 "$MODPATH/data/curves/$gid.gains" 2>/dev/null
    ui_print "  ✓ 保留自定义曲线: $gid"
  done
  [ -f "$STASH/slots.conf" ] && cp -f "$STASH/slots.conf" "$MODPATH/data/slots.conf" 2>/dev/null
  [ -f "$STASH/props.conf" ] && cp -f "$STASH/props.conf" "$MODPATH/data/props.conf" 2>/dev/null
  [ -f "$STASH/otg.conf" ] && cp -f "$STASH/otg.conf" "$MODPATH/data/otg.conf" 2>/dev/null
  rm -rf "$STASH" 2>/dev/null
fi

set_permissions() {
    set_perm_recursive $MODPATH 0 0 0755 0644
    [ -d "$MODPATH/vendor" ] && set_perm_recursive $MODPATH/vendor 0 0 0755 0644 u:object_r:vendor_configs_file:s0
    [ -d "$MODPATH/Link" ] && set_perm_recursive $MODPATH/Link 0 0 0755 0644
    [ -d "$MODPATH/Link/odm/etc" ] && set_perm_recursive $MODPATH/Link/odm/etc 0 0 0755 0644 u:object_r:vendor_configs_file:s0
    [ -f "$MODPATH/post-fs-data.sh" ] && set_perm $MODPATH/post-fs-data.sh 0 0 0755
    [ -f "$MODPATH/service.sh" ] && set_perm $MODPATH/service.sh 0 0 0755
    [ -f "$MODPATH/uninstall.sh" ] && set_perm $MODPATH/uninstall.sh 0 0 0755
    [ -f "$MODPATH/bin/k100pm.sh" ] && set_perm $MODPATH/bin/k100pm.sh 0 0 0755
    [ -d "$MODPATH/bin" ] && set_perm_recursive $MODPATH/bin 0 0 0755 0755
    # WebUI 资源：确保 WebView 可读
    [ -d "$MODPATH/webroot" ] && set_perm_recursive $MODPATH/webroot 0 0 0755 0644
    [ -d "$MODPATH/data" ] && set_perm_recursive $MODPATH/data 0 0 0755 0644
    # 已应用状态（记录当前写入的配置哈希）
    [ -f "$MODPATH/data/state/applied" ] && set_perm $MODPATH/data/state/applied 0 0 0644
}
set_permissions
