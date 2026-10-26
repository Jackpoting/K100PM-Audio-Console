/* ============================================================
   bridge.js — KernelSU WebUI ⇄ k100pm.sh
   ------------------------------------------------------------
   KernelSU v3.x 的 JS 桥：
     ksu.exec(cmd)                -> 同步返回 stdout 字符串（不是 Promise）
     ksu.exec(cmd, callback)      -> void，结果回调
     ksu.exec(cmd, callback, opt) -> void
   因此只能传 1 个参数调用；传第二个参数会命中 void 重载，
   返回值变成 undefined —— 这正是旧版“未找到 k100pm.sh”的原因。

   性能要点：
     · 模块目录优先直接用 location 推导（/…/webroot/index.html → /…），
       不再每次启动先探 6 个候选路径（省 1 次 exec 往返）；
     · 命令失败时才回退到完整探测，并把成功路径缓存到本次会话。
   ============================================================ */
(function (global) {
  'use strict';

  var KSU = global.ksu;
  var hasKsu = !!(KSU && typeof KSU.exec === 'function');
  var cliDir = null;        /* 已确认可用的模块目录 */
  var verified = false;     /* cliDir 是否经过实际命令验证 */

  function shq(s) {
    return "'" + String(s).replace(/'/g, "'\\''") + "'";
  }

  function moduleDirFromLocation() {
    try {
      var p = decodeURIComponent(global.location.pathname || '');
      var i = p.indexOf('/webroot/');
      if (i > 0) return p.slice(0, i);
    } catch (e) { /* ignore */ }
    return null;
  }

  function candidatePaths() {
    var list = [];
    var derived = moduleDirFromLocation();
    if (derived) list.push(derived);
    [
      '/data/adb/modules/k100pm_audio_plus',
      '/data/adb/modules_update/k100pm_audio_plus',
      '/data/adb/ksu/modules/k100pm_audio_plus',
      '/data/adb/ap/modules/k100pm_audio_plus',
      'k100pm_audio_plus'
    ].forEach(function (p) { if (list.indexOf(p) < 0) list.push(p); });
    return list;
  }

  /**
   * 统一执行入口，兼容三种桥实现：
   *   1) 同步 String  （KernelSU v3.x）
   *   2) Promise<{errno,stdout,stderr}>（部分分支）
   *   3) JSON 字符串 {"errno":..,"stdout":..}
   */
  async function rawExec(cmd) {
    if (!hasKsu) throw new Error('未检测到 KernelSU WebUI 接口');
    var r = KSU.exec(cmd);                       /* 只传 1 个参数 */
    if (r && typeof r === 'object' && typeof r.then === 'function') r = await r;

    if (typeof r === 'string') {
      var t = r.trim();
      if (t.charAt(0) === '{') {
        try {
          var o = JSON.parse(t);
          if (o && typeof o === 'object' && ('stdout' in o || 'errno' in o || 'stderr' in o)) {
            return { code: o.errno || o.code || 0, out: o.stdout || '', err: o.stderr || '' };
          }
        } catch (e) { /* 纯文本输出 */ }
      }
      return { code: 0, out: r, err: '' };
    }
    if (r && typeof r === 'object') {
      return {
        code: r.errno || r.code || 0,
        out: r.stdout || r.out || '',
        err: r.stderr || r.err || ''
      };
    }
    return { code: -1, out: '', err: '' };
  }

  async function resolveCli() {
    var diag = [];
    var dirs = candidatePaths();
    for (var i = 0; i < dirs.length; i++) {
      var p = dirs[i] + '/bin/k100pm.sh';
      try {
        var res = await rawExec('[ -f ' + shq(p) + ' ] && echo __found__ 2>&1');
        var out = (res.out || '').trim();
        if (out.indexOf('__found__') >= 0) return dirs[i];
        diag.push(p + ' => ' + (out || '(空)').replace(/\s+/g, ' ').slice(0, 50));
      } catch (e) {
        diag.push(p + ' => 异常 ' + String((e && e.message) || e).slice(0, 60));
      }
    }
    throw new Error('未找到 k100pm.sh —— ' + diag.join(' | '));
  }

  async function runAt(dir, args) {
    var cmd = '/system/bin/sh ' + shq(dir + '/bin/k100pm.sh') + ' ' + args.map(shq).join(' ');
    var r = await rawExec(cmd);
    var out = (r.out || '').trim();

    if (!out) {
      /* stdout 为空时补一次 2>&1，把 stderr 带回来做诊断（仅失败路径多一次 exec） */
      var d = { out: '', err: r.err || '' };
      try { d = await rawExec(cmd + ' 2>&1'); } catch (e) { /* ignore */ }
      var detail = ((d.out || '') + ' ' + (d.err || '')).trim();
      throw new Error(detail ? detail.slice(0, 220) : ('命令无输出：' + args[0]));
    }
    var data;
    try {
      data = JSON.parse(out);
    } catch (e) {
      throw new Error('返回非 JSON：' + out.slice(0, 180));
    }
    if (data && data.ok === false) throw new Error(data.error || '操作失败');
    return data;
  }

  async function cli(args) {
    if (!Array.isArray(args)) args = [args];
    if (!hasKsu) return global.K100PM_MOCK.run(args);

    if (!cliDir) {
      cliDir = moduleDirFromLocation();
      verified = false;
    }
    if (cliDir) {
      try {
        var res = await runAt(cliDir, args);
        verified = true;
        return res;
      } catch (e) {
        if (verified) throw e;
        cliDir = null;          /* 推导路径不可用 → 走完整探测 */
      }
    }
    cliDir = await resolveCli();
    verified = true;
    return runAt(cliDir, args);
  }

  /**
   * 初始化失败时的诊断快照，用于页面上的错误面板。
   */
  async function diagnose() {
    var info = {
      href: global.location.href,
      ua: navigator.userAgent,
      hasKsu: hasKsu,
      execType: typeof (KSU && KSU.exec),
      candidates: candidatePaths(),
      probes: []
    };
    try { info.ksuKeys = KSU ? Object.keys(KSU) : []; } catch (e) { info.ksuKeys = []; }
    try { info.execSource = String((KSU && KSU.exec) || '').slice(0, 160); } catch (e) { /* ignore */ }

    for (var i = 0; i < info.candidates.length; i++) {
      var p = info.candidates[i] + '/bin/k100pm.sh';
      try {
        var r = await rawExec('[ -f ' + shq(p) + ' ] && echo __found__ 2>&1');
        info.probes.push({ path: p, out: String(r.out || '').slice(0, 120) });
      } catch (e) {
        info.probes.push({ path: p, error: String((e && e.message) || e).slice(0, 120) });
      }
    }
    try {
      var idr = await rawExec('id 2>&1');
      info.id = String(idr.out || '').trim().slice(0, 140);
    } catch (e2) {
      info.idError = String((e2 && e2.message) || e2);
    }
    return info;
  }

  /**
   * 把文本写到设备文件（导出曲线用）。预览模式改为浏览器下载。
   */
  async function writeFile(path, text) {
    if (!hasKsu) {
      download((path.split('/').pop() || 'k100pm.json'), text);
      return { preview: true, path: path };
    }
    var cmd =
      'mkdir -p ' + shq(path.replace(/\/[^/]*$/, '')) + ' 2>/dev/null; ' +
      'cat > ' + shq(path) + " <<'K100PM_EOF'\n" + text + '\nK100PM_EOF\n' +
      'echo __wrote__';
    var r = await rawExec(cmd);
    if ((r.out || '').indexOf('__wrote__') < 0) {
      throw new Error((r.out || '').trim().slice(0, 160) || '写入失败（无权限？）');
    }
    return { preview: false, path: path };
  }

  /**
   * 极轻量启动信标：把一行文字追加到 /data/local/tmp/k100pm_webui.boot.log。
   * 仅在初始化失败时调用（正常启动不再额外花一次 exec）。
   */
  function beacon(text) {
    if (!hasKsu) return;
    try {
      var line = new Date().toISOString() + ' ' + String(text).replace(/[\r\n]/g, ' ').slice(0, 200);
      rawExec("echo " + shq(line) + " >> /data/local/tmp/k100pm_webui.boot.log 2>/dev/null");
    } catch (e) { /* ignore */ }
  }

  function download(filename, text) {
    try {
      var blob = new Blob([text], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 800);
    } catch (e) { /* ignore */ }
  }

  global.Bridge = {
    isPreview: !hasKsu,
    cli: cli,
    diagnose: diagnose,
    beacon: beacon,
    writeFile: writeFile,
    download: download,
    shq: shq
  };
})(window);
