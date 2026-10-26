#!/system/bin/sh
# ============================================================================
#  REDMI K100 PRO MAX 音质控制台 · k100pm.sh · 1.0
#  ---------------------------------------------------------------
#  WebUI / 终端 共用的唯一配置入口。
#  只依赖 Android toybox（sh / getprop / md5sum / sed / grep）。
#  所有命令输出 JSON（log 除外），供 webroot 前端直接消费。
#
#  ── 性能说明（REDMI K100 Pro Max / Android 15 真机实测）──────────────────
#  Android 的 /system/bin/sh 是 mksh：read / case / echo / print 为内建，
#  但 **printf 是外部命令**（/system/bin/printf）。本机一次 fork ≈ 6~8 ms，
#  因此旧实现里成百上千次 printf / $(...) / getprop / head / tr 会让
#  `snapshot` 耗时约 5.9 s，WebUI 打开时直接卡住。
#
#  本版热路径原则：
#    1. 输出一律用内建 print -rn -- / print -r --（不再 fork printf）；
#    2. 拼 JSON 一律流式输出，不用 $(func) 捕获（捕获 = 额外 fork + 缓冲）；
#    3. getprop 只 dump 一次，属性值用 case 模式在内建层面查找；
#    4. 曲线文件用 read 内建一次读入 20 段，替代 tr/head/sed 管道；
#    5. 挂载表 /proc/mounts 只读一次，用 -ef 判断 bind 同源，节省 md5。
#  优化后 snapshot ≈ 0.15~0.25 s（具体见 README「性能」一节）。
# ============================================================================

# WebUI 执行环境可能缺少 PATH，先补系统路径
PATH="/system/bin:/system/xbin:/system/sbin:/data/adb/ksu/bin:/data/adb/magisk:${PATH}"
export PATH

# 模块目录：绝对路径直接用字符串裁剪（每次调用可省 ~7 ms）；
# 只有相对调用（终端里 sh bin/k100pm.sh）才补一次 cd/pwd 规范化。
case "$0" in
  */bin/*) MODDIR=${0%/bin/*} ;;
  */*)     MODDIR=${0%/*}/.. ;;
  *)       MODDIR="." ;;
esac
[ -n "$MODDIR" ] || MODDIR="/data/adb/modules/k100pm_audio_plus"
case "$MODDIR" in
  /*) ;;
  *)  MODDIR=$(cd "$MODDIR" 2>/dev/null && pwd) || MODDIR="." ;;
esac

DATA_DIR="$MODDIR/data"
CURVE_DIR="$DATA_DIR/curves"
TEMPLATE="$DATA_DIR/dax.template.xml"
BACKUP_DIR="$DATA_DIR/backup"
SLOTS_FILE="$DATA_DIR/slots.conf"
PROPS_FILE="$DATA_DIR/props.conf"
STATE_FILE="$DATA_DIR/state/applied"

DAX_REL="Link/odm/etc/dolby/dax-default.xml"
DAX_VENDOR_REL="vendor/etc/dolby/dax-default.xml"
DAX_FACTORY_REL="factory/etc/dolby/dax-default.xml"
DAX_SYS_ODM="/odm/etc/dolby/dax-default.xml"
DAX_SYS_VENDOR="/vendor/etc/dolby/dax-default.xml"

LOG_MAIN="/data/local/tmp/k100pm_audio.log"
LOG_WEBUI="/data/local/tmp/k100pm_webui.log"

# OTG 开机自动开启 / 防超时守护（v1.5C）
SELF="$MODDIR/bin/k100pm.sh"
OTG_CONF="$DATA_DIR/otg.conf"
OTG_PID_FILE="$DATA_DIR/state/otg.pid"
OTG_LOG="${TMPDIR:-/data/local/tmp}/k100pm_otg.log"

SLOT_LIST="IEQ1 IEQ2 IEQ3 GEQ0 GEQ1 GEQ2 GEQ3 GEQ4 GEQ5 GEQ6"
FREQS="47 141 234 328 469 656 844 1031 1313 1688 2250 3000 3750 4688 5813 7125 9000 11250 13875 19688"
MIN_GAIN=-2000
MAX_GAIN=2000

NL='
'

# ---------------------------------------------------------------------------
# 输出原语（全部内建，零 fork）
# ---------------------------------------------------------------------------
jstr() { # 原始文本 -> 带引号的 JSON 字符串
  case "$1" in
    *[[:cntrl:]]*|*'"'*|*'\'*) _jstr_esc "$1" ;;
    *)                         print -rn -- "\"$1\"" ;;
  esac
}

_jstr_esc() { # 含引号/反斜杠/控制字符的少见路径：压成单行再转义
  _js=$(print -rn -- "$1" | tr '\t\r\n' '   ' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')
  print -rn -- "\"$_js\""
}

jstr_log() { # 多行日志 -> 单行 JSON 字符串（换行/制表符转空格）
  _jl=$(print -rn -- "$1" | tr '\t\r\n' '   ' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')
  print -rn -- "\"$_jl\""
}

ok_json() { # $1 = 附加字段（不含首尾花括号）
  if [ -n "$1" ]; then
    print -rn -- '{"ok":true,'
    print -rn -- "$1"
    print -r -- '}'
  else
    print -r -- '{"ok":true}'
  fi
}

err_json() {
  print -rn -- '{"ok":false,"error":'
  jstr "$1"
  print -r -- '}'
}

die() {
  err_json "$1"
  exit 1
}

logw() {
  # 整组重定向：/data/local/tmp 不可写时也不要把 stderr 泄到 stdout
  {
    print -r -- "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_WEBUI"
  } 2>/dev/null
}

# ---------------------------------------------------------------------------
# 基础工具
# ---------------------------------------------------------------------------
md5_into() { # $1 path -> _MV（空表示不可用）
  _MV=""
  [ -f "$1" ] || return 1
  _MV=$(md5sum "$1" 2>/dev/null)
  _MV=${_MV%% *}
  [ -n "$_MV" ]
}

md5file() { # $1 path -> stdout（兼容旧接口，内部仍走一次 fork）
  [ -f "$1" ] || return 1
  set -- $(md5sum "$1" 2>/dev/null)
  [ -n "$1" ] && print -rn -- "$1"
}

file_size_into() { # $1 path -> _FS
  _FS=""
  [ -f "$1" ] || return 1
  _FS=$(wc -c < "$1" 2>/dev/null)
  set -- $_FS
  _FS=$1
  [ -n "$_FS" ]
}

file_size() { # $1 path -> stdout（兼容旧接口）
  [ -f "$1" ] || return 1
  set -- $(wc -c < "$1" 2>/dev/null)
  [ -n "$1" ] && print -rn -- "$1"
}

_MOUNTS=""
_MOUNTS_LOADED=0
mounts_load() { # /proc/mounts 只读一次（一次 fork）
  [ "$_MOUNTS_LOADED" = "1" ] && return 0
  _MOUNTS=$(cat /proc/mounts 2>/dev/null)
  _MOUNTS_LOADED=1
}

is_mounted() { # $1 path
  mounts_load
  case "$_MOUNTS" in
    *" $1 "*) return 0 ;;
  esac
  return 1
}

mount_src_into() { # $1 path -> _MS
  _MS=""
  mounts_load
  case "$_MOUNTS" in
    *" $1 "*)
      _mp=${_MOUNTS%%" $1 "*}
      _MS=${_mp##*"$NL"}
      ;;
  esac
}

resetprop_bin() {
  for _rp in "/data/adb/magisk/resetprop" "/data/adb/ksu/bin/resetprop" "/data/adb/ap/bin/resetprop"; do
    [ -x "$_rp" ] && { print -rn -- "$_rp"; return 0; }
  done
  command -v resetprop 2>/dev/null
}

root_type_into() { # -> _RT
  if [ -d /proc/sukisu ] || [ -d /data/adb/sukisu ]; then _RT=sukisu; return; fi
  if [ -f /data/adb/ksud ] || [ -x /data/adb/ksu/bin/ksud ]; then _RT=kernelsu; return; fi
  if [ -d /data/adb/ap ]; then _RT=apatch; return; fi
  if [ -d /data/adb/magisk ]; then _RT=magisk; return; fi
  _RT=unknown
}

root_type() { root_type_into; print -rn -- "$_RT"; }

tmpdir() { # $1 = 用途后缀，避免同一进程内互相覆盖
  _td="${TMPDIR:-/data/local/tmp}/k100pm.${1:-tmp}.$$"
  mkdir -p "$_td" 2>/dev/null || _td="${TMPDIR:-/tmp}/k100pm.${1:-tmp}.$$"
  mkdir -p "$_td" 2>/dev/null || _td="."
  print -rn -- "$_td"
}

# ---------------------------------------------------------------------------
# getprop：一次 grep 过滤 + 内建解析（替代每属性一次 getprop）
# 说明：mksh 的 ${var#*"[$k]: ["} 在 80 KB 字符串上会退化成 O(n²)（实测 11 s），
#       因此这里用「getprop | grep -F 一次性筛出目标行」再逐行 read 解析。
# ---------------------------------------------------------------------------
_GPD_LOADED=0
_PAT=""
props_load() {
  [ "$_GPD_LOADED" = "1" ] && return 0
  _GPD_LOADED=1
  _PAT=""
  # 状态页需要的内核属性（props.conf 里可能没有）
  _PAT="$_PAT -e [ro.product.model]: -e [ro.product.device]:"
  _PAT="$_PAT -e [ro.product.vendor.device]: -e [ro.build.version.release]:"
  _PAT="$_PAT -e [ro.build.version.sdk]: -e [ro.build.date]:"
  if [ -f "$PROPS_FILE" ]; then
    while IFS= read -r _ln || [ -n "$_ln" ]; do
      case "$_ln" in
        ''|'#'*) continue ;;
        *=*)
          _wk=${_ln%%=*}
          case "$_wk" in ''|*[!A-Za-z0-9_.]*) continue ;; esac
          _PAT="$_PAT -e [$_wk]:"
          ;;
      esac
    done < "$PROPS_FILE"
  fi
  _oldifs=$IFS
  set -f                      # 关掉通配，避免 [key] 被当成 pathname glob
  _pd=$(getprop 2>/dev/null | grep -F $_PAT 2>/dev/null)
  set +f
  IFS="$NL"
  set -- $_pd
  IFS=$_oldifs
  for _ln in "$@"; do
    case "$_ln" in
      '['*']: ['*)
        _wk=${_ln%%\]:*}
        _wk=${_wk#\[}
        _wv=${_ln#*"]: ["}
        _wv=${_wv%%]*}
        _sk=${_wk//./_}
        eval "PV_$_sk=\"\$_wv\""
        ;;
    esac
  done
}

pget_into() { # $1 key -> _PV（未设置则为空）
  props_load
  _sk=${1//./_}
  eval "_PV=\${PV_$_sk-}"
  if [ -z "$_PV" ]; then
    # 映射表里没有（或值确实为空）：直接问系统一次，保证正确性
    _PV=$(getprop "$1" 2>/dev/null)
  fi
}

# ---------------------------------------------------------------------------
# 曲线库：data/curves/<id>.gains + <id>.name + <id>.src
# ---------------------------------------------------------------------------
valid_id() {
  case "$1" in
    ''|*[!a-z0-9_.-]*) return 1 ;;
    [a-z0-9]*) return 0 ;;
    *) return 1 ;;
  esac
}

curve_exists() {
  valid_id "$1" && [ -f "$CURVE_DIR/$1.gains" ]
}

# 一次 read 读入 20 段（零 fork），结果放 _curve_gains / _curve_gains_json
_curve_gains=""
_curve_gains_json=""
_curve_load() { # $1 id
  curve_exists "$1" || return 1
  _g01=""; _g02=""; _g03=""; _g04=""; _g05=""; _g06=""; _g07=""; _g08=""; _g09=""; _g10=""
  _g11=""; _g12=""; _g13=""; _g14=""; _g15=""; _g16=""; _g17=""; _g18=""; _g19=""; _g20=""; _gx=""
  IFS=' ' read -r _g01 _g02 _g03 _g04 _g05 _g06 _g07 _g08 _g09 _g10 \
             _g11 _g12 _g13 _g14 _g15 _g16 _g17 _g18 _g19 _g20 _gx \
             < "$CURVE_DIR/$1.gains" 2>/dev/null || :
  [ -n "$_g20" ] || return 2
  [ -z "$_gx" ] || return 2
  _curve_gains="$_g01 $_g02 $_g03 $_g04 $_g05 $_g06 $_g07 $_g08 $_g09 $_g10 $_g11 $_g12 $_g13 $_g14 $_g15 $_g16 $_g17 $_g18 $_g19 $_g20"
  _curve_gains_json=${_curve_gains// /,}
  return 0
}

curve_gains() { # $1 id -> "g1 g2 ... g20"（兼容旧接口）
  _curve_load "$1" || return $?
  print -rn -- "$_curve_gains"
}

curve_name_into() { # $1 id -> _CN
  _CN=$1
  if [ -f "$CURVE_DIR/$1.name" ]; then
    _CN=""
    IFS= read -r _CN < "$CURVE_DIR/$1.name" 2>/dev/null || :
  fi
}

curve_src_into() { # $1 id -> _CS
  _CS=""
  if [ -f "$CURVE_DIR/$1.src" ]; then
    IFS= read -r _CS < "$CURVE_DIR/$1.src" 2>/dev/null || :
  fi
}

curve_name() {
  curve_name_into "$1"
  print -rn -- "$_CN"
}

curve_src() {
  curve_src_into "$1"
  print -rn -- "$_CS"
}

curve_builtin() { # $1 id
  [ -f "$CURVE_DIR/$1.builtin" ] && print -rn -- 'true' || print -rn -- 'false'
}

list_curve_ids() {
  for _p in "$CURVE_DIR"/*.gains; do
    [ -f "$_p" ] || continue
    _n=${_p##*/}
    print -r -- "${_n%.gains}"
  done
}

# ---------------------------------------------------------------------------
# 槽位：IEQ1..3 / GEQ0..6 -> 曲线 id
# ---------------------------------------------------------------------------
default_slot_curve() {
  case "$1" in
    IEQ1) print -rn -- 'orig_ieq_detailed' ;;
    IEQ2) print -rn -- 'orig_ieq_balanced' ;;
    IEQ3) print -rn -- 'orig_ieq_warm' ;;
    GEQ*) print -rn -- "orig_geq_${1#GEQ}" ;;
    *)    print -rn -- 'flat' ;;
  esac
}

load_slots() { # 零 fork：直接展开默认值
  IEQ1=""; IEQ2=""; IEQ3=""
  GEQ0=""; GEQ1=""; GEQ2=""; GEQ3=""; GEQ4=""; GEQ5=""; GEQ6=""
  [ -f "$SLOTS_FILE" ] && . "$SLOTS_FILE" 2>/dev/null
  [ -n "$IEQ1" ] || IEQ1=orig_ieq_detailed
  [ -n "$IEQ2" ] || IEQ2=orig_ieq_balanced
  [ -n "$IEQ3" ] || IEQ3=orig_ieq_warm
  [ -n "$GEQ0" ] || GEQ0=orig_geq_0
  [ -n "$GEQ1" ] || GEQ1=orig_geq_1
  [ -n "$GEQ2" ] || GEQ2=orig_geq_2
  [ -n "$GEQ3" ] || GEQ3=orig_geq_3
  [ -n "$GEQ4" ] || GEQ4=orig_geq_4
  [ -n "$GEQ5" ] || GEQ5=orig_geq_5
  [ -n "$GEQ6" ] || GEQ6=orig_geq_6
}

write_slots() {
  {
    print -r -- '# K100PM 槽位映射 · 由 WebUI / k100pm.sh 自动维护'
    for _s in $SLOT_LIST; do
      eval "_v=\${$_s}"
      print -r -- "$_s=$_v"
    done
  } > "$SLOTS_FILE.new" 2>/dev/null || return 1
  mv -f "$SLOTS_FILE.new" "$SLOTS_FILE" 2>/dev/null
}

slot_valid() {
  case " $SLOT_LIST " in
    *" $1 "*) return 0 ;;
    *) return 1 ;;
  esac
}

# ---------------------------------------------------------------------------
# DAX 配置生成
# ---------------------------------------------------------------------------
gen_ieq_block() { # 20 个增益参数
  print -r -- '      <ieq-bands>'
  for _f in $FREQS; do
    print -r -- "        <band_ieq frequency=\"$_f\" target=\"$1\"/>"
    shift
  done
  print -r -- '      </ieq-bands>'
}

gen_geq_block() { # 20 个增益参数
  print -r -- '      <graphic-equalizer-bands>'
  for _f in $FREQS; do
    print -r -- "        <band_geq frequency=\"$_f\" gain=\"$1\"/>"
    shift
  done
  print -r -- '      </graphic-equalizer-bands>'
}

marker_of() { # 槽位 -> 模板标记
  case "$1" in
    IEQ1) print -rn -- 'K100PM:IEQ1' ;;
    IEQ2) print -rn -- 'K100PM:IEQ2' ;;
    IEQ3) print -rn -- 'K100PM:IEQ3' ;;
    GEQ0) print -rn -- 'K100PM:GEQ0' ;;
    GEQ1) print -rn -- 'K100PM:GEQ1' ;;
    GEQ2) print -rn -- 'K100PM:GEQ2' ;;
    GEQ3) print -rn -- 'K100PM:GEQ3' ;;
    GEQ4) print -rn -- 'K100PM:GEQ4' ;;
    GEQ5) print -rn -- 'K100PM:GEQ5' ;;
    GEQ6) print -rn -- 'K100PM:GEQ6' ;;
  esac
}

sanity_xml() { # $1 file
  [ -s "$1" ] || return 1
  grep -q 'K100PM:' "$1" && return 1
  [ "$(grep -c '<band_ieq ' "$1" 2>/dev/null)" = "60" ] || return 1
  [ "$(grep -c '<band_geq ' "$1" 2>/dev/null)" = "140" ] || return 1
  [ "$(grep -c '<preset ' "$1" 2>/dev/null)" = "10" ] || return 1
  [ "$(grep -c '</device_data>' "$1" 2>/dev/null)" = "1" ] || return 1
  return 0
}

build_xml() { # $1 输出文件；使用当前槽位映射 + 模板
  _outfile=$1
  [ -f "$TEMPLATE" ] || return 1
  load_slots
  _bd=$(tmpdir build) || return 1
  for _slot in $SLOT_LIST; do
    eval "_cid=\${$_slot}"
    if ! curve_exists "$_cid"; then _cid=$(default_slot_curve "$_slot"); fi
    if ! curve_exists "$_cid"; then rm -rf "$_bd"; logw "曲线缺失: $_slot/$_cid"; return 1; fi
    if ! _curve_load "$_cid"; then rm -rf "$_bd"; logw "曲线无效: $_cid"; return 1; fi
    # shellcheck disable=SC2086
    set -- $_curve_gains
    case "$_slot" in
      IEQ*) gen_ieq_block "$@" > "$_bd/$_slot" ;;
      GEQ*) gen_geq_block "$@" > "$_bd/$_slot" ;;
    esac
  done

  while IFS= read -r _line || [ -n "$_line" ]; do
    case "$_line" in
      *'<!--#K100PM:IEQ1#-->'*) cat "$_bd/IEQ1" ;;
      *'<!--#K100PM:IEQ2#-->'*) cat "$_bd/IEQ2" ;;
      *'<!--#K100PM:IEQ3#-->'*) cat "$_bd/IEQ3" ;;
      *'<!--#K100PM:GEQ0#-->'*) cat "$_bd/GEQ0" ;;
      *'<!--#K100PM:GEQ1#-->'*) cat "$_bd/GEQ1" ;;
      *'<!--#K100PM:GEQ2#-->'*) cat "$_bd/GEQ2" ;;
      *'<!--#K100PM:GEQ3#-->'*) cat "$_bd/GEQ3" ;;
      *'<!--#K100PM:GEQ4#-->'*) cat "$_bd/GEQ4" ;;
      *'<!--#K100PM:GEQ5#-->'*) cat "$_bd/GEQ5" ;;
      *'<!--#K100PM:GEQ6#-->'*) cat "$_bd/GEQ6" ;;
      *) print -r -- "$_line" ;;
    esac
  done < "$TEMPLATE" > "$_outfile"

  rm -rf "$_bd"
  sanity_xml "$_outfile" || return 2
  return 0
}

install_xml() { # $1 生成的 xml
  [ -s "$1" ] || { logw "源文件为空，拒绝写入"; return 1; }
  sanity_xml "$1" || { logw "结构校验失败，拒绝写入"; return 1; }
  for _rel in "$DAX_REL" "$DAX_VENDOR_REL" "$DAX_FACTORY_REL"; do
    _dst="$MODDIR/$_rel"
    mkdir -p "${_dst%/*}" 2>/dev/null
    cat "$1" > "$_dst" 2>/dev/null || { logw "写入失败: $_dst"; return 1; }
  done
  chcon u:object_r:vendor_configs_file:s0 "$MODDIR/$DAX_REL" "$MODDIR/$DAX_VENDOR_REL" 2>/dev/null
  chcon u:object_r:system_file:s0 "$MODDIR/$DAX_FACTORY_REL" 2>/dev/null
  return 0
}

bind_targets() {
  [ "$K100PM_NO_MOUNT" = "1" ] && return 0
  if [ -f "$DAX_SYS_ODM" ] && ! is_mounted "$DAX_SYS_ODM"; then
    mount --bind "$MODDIR/$DAX_REL" "$DAX_SYS_ODM" 2>/dev/null && logw "bind 生效: $DAX_SYS_ODM"
  fi
  if [ -f "$DAX_SYS_VENDOR" ] && ! is_mounted "$DAX_SYS_VENDOR"; then
    mount --bind "$MODDIR/$DAX_VENDOR_REL" "$DAX_SYS_VENDOR" 2>/dev/null && logw "bind 生效: $DAX_SYS_VENDOR"
  fi
  return 0
}

apply_config() {
  _td=$(tmpdir apply) || die "无法创建临时目录"
  _out="$_td/dax-default.xml"
  build_xml "$_out"
  _rc=$?
  if [ "$_rc" != "0" ]; then
    rm -rf "$_td"
    [ "$_rc" = "1" ] && die "生成失败：模板或曲线缺失"
    die "生成失败：XML 结构校验未通过"
  fi
  install_xml "$_out" || { rm -rf "$_td"; die "写入模块配置失败（权限？）"; }
  bind_targets
  md5_into "$MODDIR/$DAX_REL"; _md5=$_MV
  file_size_into "$_out"; _size=$_FS
  mkdir -p "${STATE_FILE%/*}" 2>/dev/null
  {
    print -r -- "$(date '+%Y-%m-%d %H:%M:%S')"
    print -r -- "$_md5"
    print -r -- "$_size"
  } > "$STATE_FILE" 2>/dev/null
  rm -rf "$_td"
  logw "apply: 已写入 10 个槽位 (md5=$_md5)"
  return 0
}

# ---------------------------------------------------------------------------
# 命令：status
# ---------------------------------------------------------------------------
slot_json_list() {
  load_slots
  _first=1
  for _s in $SLOT_LIST; do
    eval "_cid=\${$_s}"
    [ "$_first" = "1" ] || print -rn -- ','
    _first=0
    print -rn -- "\"$_s\":{\"curve\":"
    jstr "$_cid"
    print -rn -- ',"name":'
    curve_name_into "$_cid"
    jstr "$_CN"
    print -rn -- ',"builtin":'
    if [ -f "$CURVE_DIR/$_cid.builtin" ]; then print -rn -- 'true'; else print -rn -- 'false'; fi
    print -rn -- '}'
  done
}

mount_json_list() {
  _first=1
  for _pair in "odm:$DAX_SYS_ODM:$DAX_REL" "vendor:$DAX_SYS_VENDOR:$DAX_VENDOR_REL"; do
    _tag=${_pair%%:*}
    _rest=${_pair#*:}
    _path=${_rest%%:*}
    _rel=${_rest#*:}
    [ "$_first" = "1" ] || print -rn -- ','
    _first=0
    _exists=false; _mounted=false; _synced=false
    _src=""; _hmd5=""; _mmd5=""
    [ -f "$_path" ] && _exists=true
    if is_mounted "$_path"; then
      _mounted=true
      mount_src_into "$_path"
      _src=$_MS
    fi
    md5_into "$MODDIR/$_rel"; _mmd5=$_MV
    if [ "$_exists" = "true" ]; then
      if [ "$_path" -ef "$MODDIR/$_rel" ]; then
        # bind 挂载同 inode：内容必然一致，省掉两次 137 KB md5
        _hmd5=$_mmd5
        _synced=true
      else
        md5_into "$_path"; _hmd5=$_MV
        [ -n "$_hmd5" ] && [ "$_hmd5" = "$_mmd5" ] && _synced=true
      fi
    fi
    print -rn -- "{\"tag\":"
    jstr "$_tag"
    print -rn -- ',"path":'
    jstr "$_path"
    print -rn -- ",\"exists\":$_exists,\"mounted\":$_mounted,\"source\":"
    jstr "$_src"
    print -rn -- ',"md5":'
    jstr "$_hmd5"
    print -rn -- ",\"synced\":$_synced}"
  done
}

emit_status() {
  # module.prop（内建 read，不再 sed 两次）
  _ver=""; _vcode=""
  if [ -f "$MODDIR/module.prop" ]; then
    while IFS= read -r _pl || [ -n "$_pl" ]; do
      case "$_pl" in
        version=*)     _ver=${_pl#version=} ;;
        versionCode=*) _vcode=${_pl#versionCode=} ;;
      esac
    done < "$MODDIR/module.prop"
  fi

  props_load
  pget_into ro.product.model;        _model=$_PV
  pget_into ro.product.device;       _dev=$_PV
  pget_into ro.product.vendor.device; _vdev=$_PV
  pget_into ro.build.version.release; _rel=$_PV
  pget_into ro.build.version.sdk;     _api=$_PV

  md5_into "$MODDIR/$DAX_REL"; _daxmd5=$_MV
  file_size_into "$MODDIR/$DAX_REL"; _daxsize=$_FS

  _applied_at=""; _applied_md5=""; _applied_size=""
  if [ -f "$STATE_FILE" ]; then
    {
      IFS= read -r _applied_at
      IFS= read -r _applied_md5
      IFS= read -r _applied_size
    } < "$STATE_FILE" 2>/dev/null
  fi
  _in_sync=false
  [ -n "$_daxmd5" ] && [ "$_daxmd5" = "$_applied_md5" ] && _in_sync=true

  _props_count=0
  if [ -f "$PROPS_FILE" ]; then
    while IFS= read -r _line || [ -n "$_line" ]; do
      case "$_line" in
        ''|'#'*) continue ;;
        *=*)
          _pk=${_line%%=*}
          case "$_pk" in ''|*[!A-Za-z0-9_.]*) continue ;; esac
          _props_count=$((_props_count + 1))
          ;;
      esac
    done < "$PROPS_FILE"
  fi

  _curve_count=0
  for _cp in "$CURVE_DIR"/*.gains; do
    [ -f "$_cp" ] && _curve_count=$((_curve_count + 1))
  done

  root_type_into; _root=$_RT

  print -rn -- '{"ok":true,"version":'
  jstr "$_ver"
  print -rn -- ',"versionCode":'
  jstr "$_vcode"
  print -rn -- ',"moduleDir":'
  jstr "$MODDIR"
  print -rn -- ',"root":'
  jstr "$_root"

  print -rn -- ',"device":{"model":'
  jstr "$_model"
  print -rn -- ',"device":'
  jstr "$_dev"
  print -rn -- ',"vendorDevice":'
  jstr "$_vdev"
  print -rn -- ',"android":'
  jstr "$_rel"
  print -rn -- ',"sdk":'
  jstr "$_api"
  print -rn -- '}'

  print -rn -- ',"dax":{"md5":'
  jstr "$_daxmd5"
  print -rn -- ',"size":'
  jstr "$_daxsize"
  print -rn -- ',"template":'
  if [ -f "$TEMPLATE" ]; then print -rn -- 'true'; else print -rn -- 'false'; fi
  print -rn -- ',"appliedAt":'
  jstr "$_applied_at"
  print -rn -- ',"appliedMd5":'
  jstr "$_applied_md5"
  print -rn -- ",\"inSync\":$_in_sync}"

  print -rn -- ",\"counts\":{\"curves\":$_curve_count,\"props\":$_props_count}"

  print -rn -- ',"mounts":['
  mount_json_list
  print -rn -- ']'

  print -rn -- ',"slots":{'
  slot_json_list
  print -rn -- '}'

  print -rn -- ',"referenceCurve":{"id":"k100pm_base","name":"K100PM 基准曲线","applied":'
  if _curve_load k100pm_base; then print -rn -- 'true'; else print -rn -- 'false'; fi
  print -rn -- '}'

  print -rn -- ',"webui":true}'
}

# ---------------------------------------------------------------------------
# 命令：curves / slots / props 输出
# ---------------------------------------------------------------------------
emit_curves() {
  print -rn -- '{"ok":true,"freqs":['
  set -- $FREQS
  _sep=""
  for _fq in "$@"; do
    print -rn -- "$_sep$_fq"
    _sep=,
  done
  print -rn -- '],"curves":['

  _first=1
  for _p in "$CURVE_DIR"/*.gains; do
    [ -f "$_p" ] || continue
    _id=${_p##*/}
    _id=${_id%.gains}
    if ! _curve_load "$_id"; then continue; fi
    [ "$_first" = "1" ] || print -rn -- ','
    _first=0
    print -rn -- '{"id":'
    jstr "$_id"
    print -rn -- ',"name":'
    curve_name_into "$_id"
    jstr "$_CN"
    print -rn -- ',"source":'
    curve_src_into "$_id"
    jstr "$_CS"
    print -rn -- ',"builtin":'
    if [ -f "$CURVE_DIR/$_id.builtin" ]; then print -rn -- 'true'; else print -rn -- 'false'; fi
    print -rn -- ',"gains":['
    print -rn -- "$_curve_gains_json"
    print -rn -- ']}'
  done
  print -rn -- ']}'
}

emit_slots() {
  print -rn -- '{"ok":true,"slots":{'
  slot_json_list
  print -rn -- '}}'
}

_pgroup() { # "# ===== 分组名 =====" -> _pg（纯内建，替代 sed 四次）
  _pg=${1#\#}
  while :; do case "$_pg" in ' '*) _pg=${_pg# } ;; *) break ;; esac; done
  while :; do case "$_pg" in '='*) _pg=${_pg#=} ;; *) break ;; esac; done
  while :; do case "$_pg" in ' '*) _pg=${_pg# } ;; *) break ;; esac; done
  while :; do case "$_pg" in *' ') _pg=${_pg% } ;; *) break ;; esac; done
  while :; do case "$_pg" in *'=') _pg=${_pg%=} ;; *) break ;; esac; done
  while :; do case "$_pg" in *' ') _pg=${_pg% } ;; *) break ;; esac; done
}

emit_props() {
  print -rn -- '{"ok":true,"props":['
  _first=1
  _GROUP="通用"
  if [ -f "$PROPS_FILE" ]; then
    while IFS= read -r _line || [ -n "$_line" ]; do
      case "$_line" in
        '# '@group*)
          _GROUP=${_line#*group }
          ;;
        '#'*)
          _pgroup "$_line"
          [ -n "$_pg" ] && _GROUP=$_pg
          ;;
        *=*)
          _pk=${_line%%=*}
          _pv=${_line#*=}
          case "$_pk" in ''|*[!A-Za-z0-9_.]*) continue ;; esac
          pget_into "$_pk"
          _type=text
          case "$_pk" in
            *.enable) _type=switch ;;
            *) case "$_pv" in -[0-9]*|[0-9]*) _type=int ;; esac ;;
          esac
          [ "$_first" = "1" ] || print -rn -- ','
          _first=0
          print -rn -- '{"key":'
          jstr "$_pk"
          print -rn -- ',"value":'
          jstr "$_pv"
          print -rn -- ',"current":'
          jstr "$_PV"
          print -rn -- ',"type":'
          jstr "$_type"
          print -rn -- ',"group":'
          jstr "$_GROUP"
          print -rn -- '}'
          ;;
      esac
    done < "$PROPS_FILE"
  fi
  print -rn -- ']}'
}

# ---------------------------------------------------------------------------
# 命令：assign
# ---------------------------------------------------------------------------
cmd_assign() {
  [ -n "$2" ] && [ -n "$3" ] || die "用法: assign <槽位> <曲线ID>"
  slot_valid "$2" || die "未知槽位: $2"
  curve_exists "$3" || die "曲线不存在: $3"
  load_slots
  eval "$2=\$3"
  write_slots || die "写入槽位配置失败"
  logw "assign $2=$3"
  print -rn -- '{"ok":true,"slot":'
  jstr "$2"
  print -rn -- ',"curve":'
  jstr "$3"
  print -r -- '}'
}

cmd_assign_all() {
  [ -n "$2" ] || die "用法: assign-all <曲线ID>"
  curve_exists "$2" || die "曲线不存在: $2"
  load_slots
  for _s in $SLOT_LIST; do eval "$_s=\$2"; done
  write_slots || die "写入槽位配置失败"
  logw "assign-all $2"
  print -rn -- '{"ok":true,"curve":'
  jstr "$2"
  print -r -- ',"slots":10}'
}

# 批量槽位映射：assign-map IEQ1=xxx GEQ0=yyy ...（一次 exec 写完整份映射）
cmd_assign_map() {
  shift
  [ $# -gt 0 ] || die "用法: assign-map <槽位=曲线ID> [...]"
  load_slots
  for _pair in "$@"; do
    _slot=${_pair%%=*}
    _cid=${_pair#*=}
    slot_valid "$_slot" || die "未知槽位: $_slot"
    curve_exists "$_cid" || die "曲线不存在: $_cid"
    eval "$_slot=\$_cid"
  done
  write_slots || die "写入槽位配置失败"
  logw "assign-map $*"
  print -r -- "{\"ok\":true,\"updated\":$#}"
}

cmd_apply() {
  apply_config
  md5_into "$MODDIR/$DAX_REL"; _md5=$_MV
  file_size_into "$MODDIR/$DAX_REL"; _size=$_FS
  print -rn -- '{"ok":true,"md5":'
  jstr "$_md5"
  print -rn -- ',"size":'
  jstr "$_size"
  print -r -- ',"needReload":true}'
}

# ---------------------------------------------------------------------------
# 命令：曲线增删
# ---------------------------------------------------------------------------
cmd_save_curve() { # $2 id $3 name $4..$23 gains
  [ -n "$2" ] || die "用法: save-curve <id> <名称> <20 个增益>"
  valid_id "$2" || die "非法曲线 ID（仅 a-z0-9_.-）"
  _cid="$2"
  shift 2
  _name="$1"
  shift
  [ $# -eq 20 ] || die "需要 20 个频段增益，实际收到 $#"
  _out=""
  for _g in "$@"; do
    case "$_g" in
      ''|*[!0-9-]*) die "增益必须为整数: $_g" ;;
    esac
    [ "$_g" -ge "$MIN_GAIN" ] 2>/dev/null || die "增益超出范围: $_g"
    [ "$_g" -le "$MAX_GAIN" ] 2>/dev/null || die "增益超出范围: $_g"
    _out="$_out $_g"
  done
  [ -d "$CURVE_DIR" ] || mkdir -p "$CURVE_DIR" 2>/dev/null
  print -r -- "${_out# }" > "$CURVE_DIR/$_cid.gains" 2>/dev/null || die "写入曲线失败"
  print -r -- "$_name" > "$CURVE_DIR/$_cid.name" 2>/dev/null
  print -r -- "自定义 · WebUI" > "$CURVE_DIR/$_cid.src" 2>/dev/null
  rm -f "$CURVE_DIR/$_cid.builtin" 2>/dev/null
  logw "save-curve $_cid ($_name)"
  print -rn -- '{"ok":true,"id":'
  jstr "$_cid"
  print -rn -- ',"name":'
  jstr "$_name"
  print -r -- '}'
}

cmd_del_curve() {
  [ -n "$2" ] || die "用法: delete-curve <id>"
  curve_exists "$2" || die "曲线不存在: $2"
  [ -f "$CURVE_DIR/$2.builtin" ] && die "内置曲线不可删除"
  load_slots
  for _s in $SLOT_LIST; do
    eval "_v=\${$_s}"
    [ "$_v" = "$2" ] && die "该曲线正被槽位 $_s 使用，请先切换"
  done
  rm -f "$CURVE_DIR/$2.gains" "$CURVE_DIR/$2.name" "$CURVE_DIR/$2.src" 2>/dev/null
  logw "delete-curve $2"
  print -rn -- '{"ok":true,"id":'
  jstr "$2"
  print -r -- '}'
}

# ---------------------------------------------------------------------------
# 命令：props
# ---------------------------------------------------------------------------
cmd_props() {
  [ -f "$PROPS_FILE" ] || die "缺少 props.conf"
  emit_props
  print -r -- ''
}

cmd_set_prop() {
  [ -n "$2" ] && [ -n "$3" ] || die "用法: set-prop <key> <value>"
  case "$2" in ''|*[!A-Za-z0-9_.]*) die "非法属性名" ;; esac
  case "$3" in *[!A-Za-z0-9_.:+-]*) die "非法属性值（仅字母数字 . _ : + -）" ;; esac
  grep -q "^$2=" "$PROPS_FILE" 2>/dev/null || die "属性未在 props.conf 中管理: $2"
  _tmp="$PROPS_FILE.new"
  while IFS= read -r _line || [ -n "$_line" ]; do
    case "$_line" in
      "$2="*) print -r -- "$2=$3" ;;
      *)       print -r -- "$_line" ;;
    esac
  done < "$PROPS_FILE" > "$_tmp" && mv -f "$_tmp" "$PROPS_FILE"
  _rp=$(resetprop_bin)
  if [ -n "$_rp" ]; then
    "$_rp" "$2" "$3" 2>/dev/null
  else
    setprop "$2" "$3" 2>/dev/null
  fi
  pget_into "$2"
  logw "set-prop $2=$3"
  print -rn -- '{"ok":true,"key":'
  jstr "$2"
  print -rn -- ',"value":'
  jstr "$3"
  print -rn -- ',"current":'
  jstr "$_PV"
  print -r -- '}'
}

# 批量属性：set-props k1=v1 k2=v2 ...（一次 exec 写文件 + 逐项 resetprop）
cmd_set_props() {
  shift
  [ $# -gt 0 ] || die "用法: set-props <key=value> [...]"
  for _pair in "$@"; do
    _k=${_pair%%=*}
    _v=${_pair#*=}
    case "$_k" in ''|*[!A-Za-z0-9_.]*) die "非法属性名: $_k" ;; esac
    case "$_v" in ''|*[!A-Za-z0-9_.:+-]*) die "非法属性值: $_v" ;; esac
    grep -q "^$_k=" "$PROPS_FILE" 2>/dev/null || die "属性未在 props.conf 中管理: $_k"
  done

  _tmp="$PROPS_FILE.new"
  while IFS= read -r _line || [ -n "$_line" ]; do
    case "$_line" in
      ''|'#'*) print -r -- "$_line" ;;
      *=*)
        _pk=${_line%%=*}
        _new=""
        for _pair in "$@"; do
          case "$_pair" in "$_pk="*) _new=${_pair#*=}; break ;; esac
        done
        if [ -n "$_new" ]; then print -r -- "$_pk=$_new"; else print -r -- "$_line"; fi
        ;;
      *) print -r -- "$_line" ;;
    esac
  done < "$PROPS_FILE" > "$_tmp" && mv -f "$_tmp" "$PROPS_FILE" || die "写入 props.conf 失败"

  _rp=$(resetprop_bin)
  for _pair in "$@"; do
    _k=${_pair%%=*}
    _v=${_pair#*=}
    if [ -n "$_rp" ]; then
      "$_rp" "$_k" "$_v" 2>/dev/null
    else
      setprop "$_k" "$_v" 2>/dev/null
    fi
  done
  logw "set-props $*"
  print -r -- "{\"ok\":true,\"updated\":$#}"
}

# ---------------------------------------------------------------------------
# 命令：reset / reload / reboot / verify / log / info
# ---------------------------------------------------------------------------
cmd_reset() {
  [ -f "$BACKUP_DIR/dax-default.orig.xml" ] || die "缺少出厂备份"
  cat "$BACKUP_DIR/dax-default.orig.xml" > "$MODDIR/$DAX_REL" || die "恢复失败"
  cat "$BACKUP_DIR/dax-default.orig.xml" > "$MODDIR/$DAX_VENDOR_REL" 2>/dev/null
  cat "$BACKUP_DIR/dax-default.orig.xml" > "$MODDIR/$DAX_FACTORY_REL" 2>/dev/null
  chcon u:object_r:vendor_configs_file:s0 "$MODDIR/$DAX_REL" "$MODDIR/$DAX_VENDOR_REL" 2>/dev/null
  IEQ1=orig_ieq_detailed; IEQ2=orig_ieq_balanced; IEQ3=orig_ieq_warm
  GEQ0=orig_geq_0; GEQ1=orig_geq_1; GEQ2=orig_geq_2; GEQ3=orig_geq_3
  GEQ4=orig_geq_4; GEQ5=orig_geq_5; GEQ6=orig_geq_6
  write_slots || die "写入槽位配置失败"
  bind_targets
  md5_into "$MODDIR/$DAX_REL"; _md5=$_MV
  mkdir -p "${STATE_FILE%/*}" 2>/dev/null
  {
    print -r -- "$(date '+%Y-%m-%d %H:%M:%S')"
    print -r -- "$_md5"
    print -r -- "restore"
  } > "$STATE_FILE" 2>/dev/null
  logw "reset: 已恢复原厂曲线与配置"
  print -rn -- '{"ok":true,"md5":'
  jstr "$_md5"
  print -r -- ',"needReload":true}'
}

cmd_reload() {
  _what="${2:-audio}"
  case "$_what" in
    dolby)
      am force-stop com.dolby.daxappUI 2>/dev/null
      am force-stop com.dolby.daxservice 2>/dev/null
      am force-stop com.dolby.dms 2>/dev/null
      ;;
    *)
      setprop ctl.restart audioserver 2>/dev/null
      sleep 1
      if getprop init.svc.audioserver 2>/dev/null | grep -q '^running'; then :; else
        killall audioserver 2>/dev/null
      fi
      ;;
  esac
  logw "reload $_what"
  print -rn -- '{"ok":true,"what":'
  jstr "$_what"
  print -rn -- ',"note":'
  jstr "音频服务已重启，部分场景仍需重启手机后完全生效"
  print -r -- '}'
}

cmd_reboot() {
  logw "reboot 请求"
  sync
  (svc power reboot 2>/dev/null || reboot 2>/dev/null) &
  print -r -- '{"ok":true,"rebooting":true}'
}

cmd_verify() {
  _n=0
  print -rn -- '{"ok":true,"checks":['
  add_check() { # $1 name $2 ok(true/false) $3 detail
    [ "$_n" = "0" ] || print -rn -- ','
    _n=$((_n + 1))
    print -rn -- '{"name":'
    jstr "$1"
    print -rn -- ",\"ok\":$2,\"detail\":"
    jstr "$3"
    print -rn -- '}'
  }
  if [ -f "$TEMPLATE" ] && file_size_into "$TEMPLATE" && [ "$_FS" -gt 100000 ] 2>/dev/null; then
    file_size_into "$TEMPLATE"
    add_check "配置模板" true "$_FS bytes"
  else
    add_check "配置模板" false "data/dax.template.xml 缺失或损坏"
  fi
  load_slots
  _bad=""
  for _s in $SLOT_LIST; do
    eval "_cid=\${$_s}"
    curve_exists "$_cid" || _bad="$_bad $_s:$_cid"
  done
  if [ -z "$_bad" ]; then
    add_check "10 个槽位曲线" true "IEQ1-3 / GEQ0-6 均已绑定"
  else
    add_check "10 个槽位曲线" false "缺失:$_bad"
  fi
  md5_into "$MODDIR/$DAX_REL"; _m1=$_MV
  md5_into "$MODDIR/$DAX_VENDOR_REL"; _m2=$_MV
  md5_into "$MODDIR/$DAX_FACTORY_REL"; _m3=$_MV
  if [ -n "$_m1" ] && [ "$_m1" = "$_m2" ] && [ "$_m1" = "$_m3" ]; then
    add_check "三份配置一致" true "$_m1"
  else
    add_check "三份配置一致" false "Link/vendor/factory 不一致"
  fi
  if sanity_xml "$MODDIR/$DAX_REL"; then
    add_check "DAX 结构完整" true "60 段 IEQ / 140 段 GEQ"
  else
    add_check "DAX 结构完整" false "段数或结尾异常"
  fi
  if [ -f "$BACKUP_DIR/dax-default.orig.xml" ]; then
    md5_into "$BACKUP_DIR/dax-default.orig.xml"
    add_check "出厂备份" true "$_MV"
  else
    add_check "出厂备份" false "缺失 data/backup/dax-default.orig.xml"
  fi
  if [ -f "$MODDIR/webroot/index.html" ]; then
    add_check "WebUI 资源" true "webroot/index.html"
  else
    add_check "WebUI 资源" false "webroot 缺失"
  fi
  _odm=false; _vend=false
  is_mounted "$DAX_SYS_ODM" && _odm=true
  is_mounted "$DAX_SYS_VENDOR" && _vend=true
  if [ "$_odm" = "true" ] || [ "$_vend" = "true" ]; then
    add_check "运行态挂载" true "odm=$_odm vendor=$_vend"
  else
    add_check "运行态挂载" false "未检测到 bind 挂载（重启后生效或模块未挂载）"
  fi
  print -r -- ']}'
}

cmd_log() {
  _n="${2:-200}"
  case "$_n" in ''|*[!0-9]*) _n=200 ;; esac
  print -rn -- '{"ok":true,"service":'
  if [ -f "$LOG_MAIN" ]; then
    _svc=$(tail -n "$_n" "$LOG_MAIN" 2>/dev/null)
    jstr_log "$_svc"
  else
    print -rn -- '"（暂无 service.log）"'
  fi
  print -rn -- ',"webui":'
  if [ -f "$LOG_WEBUI" ]; then
    _web=$(tail -n "$_n" "$LOG_WEBUI" 2>/dev/null)
    jstr_log "$_web"
  else
    print -rn -- '"（暂无 webui.log）"'
  fi
  print -rn -- ',"at":'
  jstr "$(date '+%H:%M:%S')"
  print -r -- '}'
}

cmd_info() {
  props_load
  pget_into ro.product.model;         _model=$_PV
  pget_into ro.product.device;        _dev=$_PV
  pget_into ro.product.vendor.device; _vdev=$_PV
  pget_into ro.build.version.release; _rel=$_PV
  pget_into ro.build.version.sdk;     _api=$_PV
  pget_into ro.build.date;            _build=$_PV
  root_type_into
  print -rn -- '{"ok":true,"device":{"model":'
  jstr "$_model"
  print -rn -- ',"device":'
  jstr "$_dev"
  print -rn -- ',"vendorDevice":'
  jstr "$_vdev"
  print -rn -- ',"android":'
  jstr "$_rel"
  print -rn -- ',"sdk":'
  jstr "$_api"
  print -rn -- ',"build":'
  jstr "$_build"
  print -rn -- '},"root":'
  jstr "$_RT"
  print -rn -- ',"moduleDir":'
  jstr "$MODDIR"
  print -rn -- ',"dolby":'
  if [ -f "$DAX_SYS_ODM" ]; then print -rn -- 'true'; else print -rn -- 'false'; fi
  print -r -- '}'
}

# 一次 exec 返回 WebUI 首屏所需的全部数据（status + curves + slots + props）
cmd_snapshot() {
  print -rn -- '{"ok":true,"status":'
  emit_status
  print -rn -- ',"curves":'
  emit_curves
  print -rn -- ',"slots":'
  emit_slots
  print -rn -- ',"props":'
  emit_props
  print -r -- '}'
}

# ===========================================================================
# OTG：开机自动开启 + 防 10 分钟超时
# ---------------------------------------------------------------------------
# HyperOS 的「USB OTG」开关最终落在 /sys/class/xm_power/typec/cc_toggle
# （Settings 的 OtgUtils.isChecked/setCheck 读写该节点，MiCharge HAL 代理），
# 本模块以 root 直接写节点，绕过 Settings 的 10 分钟自动关闭计时；
# 同时用 watchdog 周期复查，被系统/HAL 关掉时自动重新打开。
# ===========================================================================
otg_log() {
  {
    print -r -- "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$OTG_LOG"
  } 2>/dev/null
}

otg_load_conf() { # -> AUTO_ON / KEEP_ON / INTERVAL / NODE
  AUTO_ON=1
  KEEP_ON=1
  INTERVAL=30
  NODE=""
  [ -f "$OTG_CONF" ] || return 0
  while IFS= read -r _ol || [ -n "$_ol" ]; do
    case "$_ol" in
      ''|'#'*) continue ;;
      *=*)
        _ok=${_ol%%=*}
        _ov=${_ol#*=}
        case "$_ok" in
          AUTO_ON)  case "$_ov" in 0|1) AUTO_ON=$_ov ;; esac ;;
          KEEP_ON)  case "$_ov" in 0|1) KEEP_ON=$_ov ;; esac ;;
          INTERVAL) case "$_ov" in ''|*[!0-9]*) ;; *)
                      [ "$_ov" -ge 5 ] 2>/dev/null && [ "$_ov" -le 3600 ] 2>/dev/null && INTERVAL=$_ov
                      ;;
                    esac ;;
          NODE)     case "$_ov" in /*|'') NODE=$_ov ;; esac ;;
        esac
        ;;
    esac
  done < "$OTG_CONF" 2>/dev/null
  return 0
}

otg_detect() { # -> otg_node
  otg_node=""
  if [ -n "$NODE" ] && [ -e "$NODE" ]; then otg_node=$NODE; return 0; fi
  # 已知优先顺序：cc_toggle 是 Settings 真正读写的开关节点
  for _on in \
    /sys/class/xm_power/typec/cc_toggle \
    /sys/class/xm_power/typec/otg_enable \
    /sys/class/xm_power/typec/otg_control \
    /sys/class/xm_power/typec/otg_switch \
    /sys/class/power_supply/usb/otg_enable \
    /sys/class/power_supply/usb/otg_switch \
    /sys/class/power_supply/battery/otg_enable; do
    [ -e "$_on" ] && { otg_node=$_on; return 0; }
  done
  # 兜底扫描（只接受名字里带 otg 或 cc_toggle 的可写节点）
  for _on in /sys/class/xm_power/typec/* /sys/class/power_supply/*/*otg* /sys/class/dual_role_usb/*/mode; do
    [ -e "$_on" ] || continue
    case "${_on##*/}" in
      cc_toggle|otg_enable|otg_control|otg_switch|*_otg*|otg|mode) otg_node=$_on; return 0 ;;
    esac
  done
  return 1
}

otg_cur() { # -> _oc（去掉首尾空格）
  _oc=""
  [ -n "$otg_node" ] && [ -e "$otg_node" ] && _oc=$(cat "$otg_node" 2>/dev/null)
  while :; do case "$_oc" in ' '*) _oc=${_oc# } ;; *) break ;; esac; done
  while :; do case "$_oc" in *' ') _oc=${_oc% } ;; *) break ;; esac; done
}

otg_state() { # -> OTG_SUPPORTED / OTG_ON / OTG_VAL / otg_node
  OTG_SUPPORTED=false
  OTG_ON=false
  OTG_VAL=""
  otg_node=""
  otg_detect || return 1
  OTG_SUPPORTED=true
  otg_cur
  OTG_VAL=$_oc
  case "$_oc" in
    1|on|ON|On|host|HOST|Host|enable|enabled|Enable|ENABLE|true|TRUE|True) OTG_ON=true ;;
  esac
  return 0
}

otg_on_value() { # 按节点当前格式推断"开"值 -> _OV
  otg_cur
  case "$_oc" in
    *host*|*HOST*)               _OV=host ;;
    *device*|*DEVICE*)           _OV=host ;;
    *disable*|*DISABLE*)         _OV=enable ;;
    *off*|*OFF*)                 _OV=on ;;
    *enable*|*ENABLE*)           _OV=enable ;;
    *on*|*ON*)                   _OV=on ;;
    *true*|*TRUE*)               _OV=true ;;
    *)                           _OV=1 ;;
  esac
}

otg_off_value() {
  otg_cur
  case "$_oc" in
    *host*|*HOST*|*device*|*DEVICE*) _OV=device ;;
    *disable*|*DISABLE*)             _OV=disable ;;
    *enable*|*ENABLE*)               _OV=disable ;;
    *off*|*OFF*)                     _OV=off ;;
    *on*|*ON*)                       _OV=off ;;
    *true*|*TRUE*)                   _OV=false ;;
    *)                               _OV=0 ;;
  esac
}

otg_write_state() { # on|off -> 写节点并回读校验
  OTG_ERR=""
  [ -n "$otg_node" ] || { OTG_ERR="未找到 OTG 控制节点"; return 1; }
  if [ "$1" = "on" ]; then otg_on_value; else otg_off_value; fi
  _wv=$_OV
  print -r -- "$_wv" > "$otg_node" 2>/dev/null || {
    OTG_ERR="写入失败: $otg_node（权限或 SELinux 限制）"
    return 1
  }
  sleep 0.1
  otg_cur
  OTG_VAL=$_oc
  if [ -z "$_oc" ]; then return 0; fi   # 只写节点：写入成功即视为成功
  case "$1" in
    on)
      case "$_oc" in
        1|on|ON|On|host|HOST|Host|enable|enabled|Enable|ENABLE|true|TRUE|True) return 0 ;;
      esac
      ;;
    off)
      case "$_oc" in
        0|off|OFF|Off|device|DEVICE|disable|disabled|Disable|DISABLE|false|FALSE|False) return 0 ;;
      esac
      ;;
  esac
  [ "$_oc" = "$_wv" ] && return 0
  OTG_ERR="回读异常: 写入 $_wv，读回 $_oc"
  return 1
}

otg_watch_running() { # -> OTG_WRUN / OTG_WPID（校验 cmdline，避免重启后 pid 复用误判）
  OTG_WRUN=false
  OTG_WPID=""
  [ -f "$OTG_PID_FILE" ] || return 1
  OTG_WPID=$(cat "$OTG_PID_FILE" 2>/dev/null)
  if [ -z "$OTG_WPID" ] || ! kill -0 "$OTG_WPID" 2>/dev/null; then
    rm -f "$OTG_PID_FILE" 2>/dev/null
    OTG_WPID=""
    return 1
  fi
  if [ -r "/proc/$OTG_WPID/cmdline" ]; then
    _wc=$(tr '\0' ' ' < "/proc/$OTG_WPID/cmdline" 2>/dev/null)
    case "$_wc" in
      *k100pm.sh*"otg watch"*) OTG_WRUN=true; return 0 ;;
    esac
    rm -f "$OTG_PID_FILE" 2>/dev/null   # pid 被别的进程复用，视为未运行
    OTG_WPID=""
    return 1
  fi
  OTG_WRUN=true
  return 0
}

otg_start_watch() {
  otg_watch_running && return 0
  mkdir -p "${OTG_PID_FILE%/*}" 2>/dev/null
  if command -v setsid >/dev/null 2>&1; then
    setsid /system/bin/sh "$SELF" otg watch >/dev/null 2>&1 &
  else
    /system/bin/sh "$SELF" otg watch >/dev/null 2>&1 &
  fi
  sleep 0.2
  otg_watch_running
}

otg_stop_watch() {
  otg_watch_running
  if [ "$OTG_WRUN" = true ]; then
    kill "$OTG_WPID" 2>/dev/null
    sleep 0.2
  fi
  rm -f "$OTG_PID_FILE" 2>/dev/null
}

cmd_otg_watch() {
  otg_load_conf
  mkdir -p "${OTG_PID_FILE%/*}" 2>/dev/null
  otg_watch_running && exit 0
  print -r -- "$$" > "$OTG_PID_FILE" 2>/dev/null
  trap 'rm -f "$OTG_PID_FILE" 2>/dev/null' EXIT
  trap 'rm -f "$OTG_PID_FILE" 2>/dev/null; exit 0' INT TERM HUP
  otg_log "watchdog start pid=$$ interval=$INTERVAL"
  _tries=0
  _last_err=""
  while :; do
    otg_load_conf
    [ "$KEEP_ON" = "1" ] || break
    if otg_state && [ "$OTG_ON" = true ]; then
      _tries=99
      _last_err=""
    else
      if otg_write_state on; then
        otg_log "watchdog: 已重新开启 ($otg_node=$OTG_VAL)"
        _tries=99
        _last_err=""
      else
        if [ "$_last_err" != "$OTG_ERR" ]; then
          otg_log "watchdog: 开启失败: $OTG_ERR"
          _last_err=$OTG_ERR
        fi
      fi
    fi
    if [ "$_tries" -lt 10 ]; then
      _tries=$((_tries + 1))
      sleep 2
    else
      sleep "$INTERVAL"
    fi
  done
  rm -f "$OTG_PID_FILE" 2>/dev/null
  otg_log "watchdog exit pid=$$"
}

cmd_otg_status() {
  otg_load_conf
  otg_state
  otg_watch_running
  print -rn -- '{"ok":true,"supported":'
  if [ "$OTG_SUPPORTED" = true ]; then print -rn -- 'true'; else print -rn -- 'false'; fi
  print -rn -- ',"node":'
  jstr "$otg_node"
  print -rn -- ',"value":'
  jstr "$OTG_VAL"
  print -rn -- ',"enabled":'
  if [ "$OTG_ON" = true ]; then print -rn -- 'true'; else print -rn -- 'false'; fi
  print -rn -- ',"config":{"AUTO_ON":'"$AUTO_ON"',"KEEP_ON":'"$KEEP_ON"',"INTERVAL":'"$INTERVAL"',"NODE":'
  jstr "$NODE"
  print -rn -- '},"watch":{"running":'
  if [ "$OTG_WRUN" = true ]; then print -rn -- 'true'; else print -rn -- 'false'; fi
  print -rn -- ',"pid":'
  if [ -n "$OTG_WPID" ] && [ "$OTG_WPID" -gt 0 ] 2>/dev/null; then
    print -rn -- "$OTG_WPID"
  else
    print -rn -- '0'
  fi
  print -r -- '}}'
}

cmd_otg_on() {
  otg_load_conf
  otg_state || die "未找到 OTG 控制节点（可用「诊断」查看系统节点）"
  otg_write_state on || die "$OTG_ERR"
  otg_log "manual on: $otg_node=$OTG_VAL"
  cmd_otg_status
}

cmd_otg_off() {
  otg_load_conf
  otg_state || die "未找到 OTG 控制节点（可用「诊断」查看系统节点）"
  otg_write_state off || die "$OTG_ERR"
  otg_log "manual off: $otg_node=$OTG_VAL"
  cmd_otg_status
}

cmd_otg_config() { # $3.. = KEY=VALUE
  shift 2
  [ $# -gt 0 ] || die "用法: otg config KEY=VALUE [...]（AUTO_ON/KEEP_ON/INTERVAL/NODE）"
  otg_load_conf
  for _p in "$@"; do
    _k=${_p%%=*}
    _v=${_p#*=}
    case "$_k" in
      AUTO_ON|KEEP_ON)
        case "$_v" in 0|1) eval "$_k=\$_v" ;; *) die "$_k 只能是 0 或 1" ;; esac
        ;;
      INTERVAL)
        case "$_v" in ''|*[!0-9]*) die "INTERVAL 必须是整数" ;; esac
        [ "$_v" -ge 5 ] 2>/dev/null && [ "$_v" -le 3600 ] 2>/dev/null || die "INTERVAL 范围 5-3600 秒"
        INTERVAL=$_v
        ;;
      NODE)
        case "$_v" in /*|'') NODE=$_v ;; *) die "NODE 必须是绝对路径或留空" ;; esac
        ;;
      *) die "未知配置项: $_k" ;;
    esac
  done
  mkdir -p "$DATA_DIR" 2>/dev/null
  {
    print -r -- '# K100PM OTG 配置（WebUI / CLI 可改）'
    print -r -- "AUTO_ON=$AUTO_ON"
    print -r -- "KEEP_ON=$KEEP_ON"
    print -r -- "INTERVAL=$INTERVAL"
    print -r -- "NODE=$NODE"
  } > "$OTG_CONF.new" 2>/dev/null || die "写入 otg.conf 失败"
  mv -f "$OTG_CONF.new" "$OTG_CONF" 2>/dev/null || die "写入 otg.conf 失败"
  otg_log "config: AUTO_ON=$AUTO_ON KEEP_ON=$KEEP_ON INTERVAL=$INTERVAL NODE=$NODE"
  print -rn -- '{"ok":true,"config":{"AUTO_ON":'"$AUTO_ON"',"KEEP_ON":'"$KEEP_ON"',"INTERVAL":'"$INTERVAL"',"NODE":'
  jstr "$NODE"
  print -r -- '}}'
}

cmd_otg_stop() {
  otg_load_conf
  otg_stop_watch
  otg_log "manual stop watchdog"
  cmd_otg_status
}

cmd_otg_apply() { # $1 = apply|boot（boot 由 service.sh 调用）
  _mode="${1:-apply}"
  otg_load_conf
  if [ "$AUTO_ON" = "1" ] || [ "$KEEP_ON" = "1" ]; then
    if otg_state; then
      if [ "$OTG_ON" != true ]; then
        otg_write_state on || otg_log "$_mode: 开启失败: $OTG_ERR"
      fi
    else
      otg_log "$_mode: 未找到 OTG 控制节点"
    fi
  fi
  if [ "$KEEP_ON" = "1" ] && [ "$OTG_SUPPORTED" = true ]; then
    otg_start_watch
  else
    otg_stop_watch
    [ "$KEEP_ON" = "1" ] && otg_log "$_mode: KEEP_ON=1 但未找到控制节点，未启动守护"
  fi
  otg_log "$_mode: auto=$AUTO_ON keep=$KEEP_ON interval=$INTERVAL node=$otg_node enabled=$OTG_ON"
  cmd_otg_status
}

cmd_otg_probe() {
  _td="${TMPDIR:-/data/local/tmp}/k100pm.otgprobe.$$"
  {
    print -r -- "# id / selinux"
    id 2>&1
    print -r -- ""
    print -r -- "# config"
    cat "$OTG_CONF" 2>/dev/null
    print -r -- ""
    print -r -- "# sysfs: /sys/class/xm_power/typec/"
    ls -lZ /sys/class/xm_power/typec/ 2>&1
    print -r -- ""
    print -r -- "# candidate nodes"
    for _pn in \
      /sys/class/xm_power/typec/cc_toggle \
      /sys/class/xm_power/typec/otg_enable \
      /sys/class/xm_power/typec/otg_control \
      /sys/class/xm_power/typec/otg_switch \
      /sys/class/xm_power/typec/otg_ui_support \
      /sys/class/xm_power/typec/cid_status \
      /sys/class/power_supply/usb/otg_enable \
      /sys/class/power_supply/usb/otg_switch; do
      if [ -e "$_pn" ]; then
        print -r -- "$_pn = $(cat "$_pn" 2>&1)"
      else
        print -r -- "$_pn = (不存在)"
      fi
    done
    print -r -- ""
    print -r -- "# power_supply"
    ls /sys/class/power_supply/ 2>&1
    print -r -- ""
    print -r -- "# getprop otg"
    getprop 2>/dev/null | grep -i otg
    print -r -- ""
    print -r -- "# settings global/secure/system otg"
    settings list global 2>&1 | grep -i otg
    settings list secure 2>&1 | grep -i otg
    settings list system 2>&1 | grep -i otg
    print -r -- ""
    print -r -- "# watchdog"
    otg_watch_running
    print -r -- "running=$OTG_WRUN pid=$OTG_WPID"
    print -r -- ""
    print -r -- "# process"
    ps -A 2>/dev/null | grep -i "k100pm" | grep -v grep
  } > "$_td" 2>&1
  print -rn -- '{"ok":true,"lines":['
  _first=1
  while IFS= read -r _l || [ -n "$_l" ]; do
    [ "$_first" = "1" ] || print -rn -- ','
    _first=0
    jstr "$_l"
  done < "$_td"
  print -r -- ']}'
  rm -f "$_td" 2>/dev/null
}

cmd_otg() {
  _sub="${2:-status}"
  case "$_sub" in
    status) cmd_otg_status ;;
    on)     cmd_otg_on ;;
    off)    cmd_otg_off ;;
    apply)  cmd_otg_apply apply ;;
    boot)   cmd_otg_apply boot ;;
    stop)   cmd_otg_stop ;;
    config) cmd_otg_config "$@" ;;
    probe)  cmd_otg_probe ;;
    watch)  cmd_otg_watch ;;
    *)      die "未知 otg 子命令: $_sub（status/on/off/apply/boot/stop/config/probe）" ;;
  esac
}

# ---------------------------------------------------------------------------
# 入口
# ---------------------------------------------------------------------------
case "$1" in
  status)        emit_status; print -r -- '' ;;
  snapshot)      cmd_snapshot ;;
  curves)        emit_curves; print -r -- '' ;;
  slots)         emit_slots; print -r -- '' ;;
  assign)        cmd_assign "$@" ;;
  assign-all)    cmd_assign_all "$@" ;;
  assign-map)    cmd_assign_map "$@" ;;
  apply)         cmd_apply ;;
  save-curve)    cmd_save_curve "$@" ;;
  delete-curve)  cmd_del_curve "$@" ;;
  props)         cmd_props ;;
  set-prop)      cmd_set_prop "$@" ;;
  set-props)     cmd_set_props "$@" ;;
  reset)         cmd_reset ;;
  reload)        cmd_reload "$@" ;;
  reboot)        cmd_reboot ;;
  verify)        cmd_verify ;;
  log)           cmd_log "$@" ;;
  info)          cmd_info ;;
  otg)           cmd_otg "$@" ;;
  ""|help|-h)
    print -r -- 'k100pm.sh — REDMI K100 PRO MAX 音质控制台 CLI'
    print -r -- '  status | snapshot | curves | slots | props | log [n] | info | verify'
    print -r -- '  assign <slot> <curve> | assign-all <curve> | assign-map <slot=curve>...'
    print -r -- '  apply | reset | save-curve <id> <name> <20 gains> | delete-curve <id>'
    print -r -- '  set-prop <key> <value> | set-props <key=value>... | reload [audio|dolby] | reboot'
    print -r -- '  otg status | on | off | apply | stop | probe'
    print -r -- '  otg config AUTO_ON=0|1 KEEP_ON=0|1 INTERVAL=5..3600 NODE=/sys/...'
    ;;
  *)
    die "未知命令: $1"
    ;;
esac
