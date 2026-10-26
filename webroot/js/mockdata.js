/* 自动生成：预览模式演示数据（K100PM WebUI）*/
window.K100PM_MOCK = (function () {
  'use strict';
  var SLOTS = ['IEQ1','IEQ2','IEQ3','GEQ0','GEQ1','GEQ2','GEQ3','GEQ4','GEQ5','GEQ6'];
  var ORIG = {
    IEQ1:'orig_ieq_detailed', IEQ2:'orig_ieq_balanced', IEQ3:'orig_ieq_warm',
    GEQ0:'orig_geq_0', GEQ1:'orig_geq_1', GEQ2:'orig_geq_2', GEQ3:'orig_geq_3',
    GEQ4:'orig_geq_4', GEQ5:'orig_geq_5', GEQ6:'orig_geq_6'
  };
  var seed = {
 "freqs": [
  47,
  141,
  234,
  328,
  469,
  656,
  844,
  1031,
  1313,
  1688,
  2250,
  3000,
  3750,
  4688,
  5813,
  7125,
  9000,
  11250,
  13875,
  19688
 ],
 "curves": [
  {
   "id": "flat",
   "name": "平直参考线",
   "source": "20 段全部 0.00 dB",
   "builtin": true,
   "gains": [
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0
   ]
  },
  {
   "id": "k100pm_base",
   "name": "K100PM 基准曲线",
   "source": "基准曲线 · dolby-dap-20-v1",
   "builtin": true,
   "gains": [
    320,
    299,
    126,
    80,
    96,
    36,
    1,
    14,
    23,
    37,
    38,
    23,
    17,
    14,
    13,
    13,
    14,
    19,
    58,
    320
   ]
  },
  {
   "id": "k100pm_tuned",
   "name": "K100PM 调整版",
   "source": "默认配置 · 由 WebUI 调校",
   "builtin": true,
   "gains": [
    320,
    299,
    126,
    80,
    96,
    36,
    800,
    14,
    -440,
    37,
    38,
    23,
    17,
    14,
    930,
    13,
    14,
    19,
    58,
    320
   ]
  },
  {
   "id": "orig_geq_0",
   "name": "原厂 GEQ · 预设 0",
   "source": "模块原配置 v1.3A",
   "builtin": true,
   "gains": [
    32,
    180,
    60,
    20,
    0,
    0,
    0,
    28,
    18,
    15,
    22,
    18,
    16,
    0,
    0,
    8,
    10,
    0,
    0,
    0
   ]
  },
  {
   "id": "orig_geq_1",
   "name": "原厂 GEQ · 预设 1",
   "source": "模块原配置 v1.3A",
   "builtin": true,
   "gains": [
    0,
    0,
    0,
    20,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0
   ]
  },
  {
   "id": "orig_geq_2",
   "name": "原厂 GEQ · 预设 2",
   "source": "模块原配置 v1.3A",
   "builtin": true,
   "gains": [
    0,
    0,
    0,
    20,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0
   ]
  },
  {
   "id": "orig_geq_3",
   "name": "原厂 GEQ · 预设 3",
   "source": "模块原配置 v1.3A",
   "builtin": true,
   "gains": [
    0,
    0,
    0,
    20,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0
   ]
  },
  {
   "id": "orig_geq_4",
   "name": "原厂 GEQ · 预设 4",
   "source": "模块原配置 v1.3A",
   "builtin": true,
   "gains": [
    0,
    0,
    0,
    20,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0
   ]
  },
  {
   "id": "orig_geq_5",
   "name": "原厂 GEQ · 预设 5",
   "source": "模块原配置 v1.3A",
   "builtin": true,
   "gains": [
    0,
    0,
    0,
    20,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0
   ]
  },
  {
   "id": "orig_geq_6",
   "name": "原厂 GEQ · 预设 6",
   "source": "模块原配置 v1.3A",
   "builtin": true,
   "gains": [
    0,
    0,
    0,
    20,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0
   ]
  },
  {
   "id": "orig_ieq_balanced",
   "name": "原厂 IEQ · balanced",
   "source": "模块原配置 v1.3A",
   "builtin": true,
   "gains": [
    157,
    167,
    218,
    218,
    203,
    188,
    192,
    192,
    205,
    213,
    218,
    209,
    193,
    159,
    134,
    97,
    71,
    22,
    -90,
    -283
   ]
  },
  {
   "id": "orig_ieq_detailed",
   "name": "原厂 IEQ · detailed",
   "source": "模块原配置 v1.3A",
   "builtin": true,
   "gains": [
    150,
    142,
    188,
    216,
    189,
    195,
    202,
    199,
    210,
    225,
    230,
    236,
    235,
    235,
    214,
    165,
    112,
    49,
    -24,
    -217
   ]
  },
  {
   "id": "orig_ieq_warm",
   "name": "原厂 IEQ · warm",
   "source": "模块原配置 v1.3A",
   "builtin": true,
   "gains": [
    114,
    146,
    183,
    169,
    170,
    128,
    103,
    90,
    98,
    126,
    127,
    140,
    96,
    85,
    80,
    66,
    38,
    -32,
    -132,
    -275
   ]
  }
 ],
 "slots": {
  "IEQ1": {
   "curve": "k100pm_tuned",
   "name": "K100PM 调整版",
   "builtin": true
  },
  "IEQ2": {
   "curve": "k100pm_tuned",
   "name": "K100PM 调整版",
   "builtin": true
  },
  "IEQ3": {
   "curve": "k100pm_tuned",
   "name": "K100PM 调整版",
   "builtin": true
  },
  "GEQ0": {
   "curve": "k100pm_tuned",
   "name": "K100PM 调整版",
   "builtin": true
  },
  "GEQ1": {
   "curve": "k100pm_tuned",
   "name": "K100PM 调整版",
   "builtin": true
  },
  "GEQ2": {
   "curve": "k100pm_tuned",
   "name": "K100PM 调整版",
   "builtin": true
  },
  "GEQ3": {
   "curve": "k100pm_tuned",
   "name": "K100PM 调整版",
   "builtin": true
  },
  "GEQ4": {
   "curve": "k100pm_tuned",
   "name": "K100PM 调整版",
   "builtin": true
  },
  "GEQ5": {
   "curve": "k100pm_tuned",
   "name": "K100PM 调整版",
   "builtin": true
  },
  "GEQ6": {
   "curve": "k100pm_tuned",
   "name": "K100PM 调整版",
   "builtin": true
  }
 },
 "props": [
  {
   "key": "persist.vendor.dolby.global.enable",
   "value": "1",
   "current": "",
   "type": "switch",
   "group": "杜比总开关"
  },
  {
   "key": "persist.vendor.dolby.dialog.enhancer.enable",
   "value": "1",
   "current": "",
   "type": "switch",
   "group": "人声 / 对白增强"
  },
  {
   "key": "persist.vendor.dolby.dialog.enhancer.amount",
   "value": "7",
   "current": "",
   "type": "int",
   "group": "人声 / 对白增强"
  },
  {
   "key": "persist.vendor.dolby.volume.leveler.enable",
   "value": "0",
   "current": "",
   "type": "switch",
   "group": "音量均衡器"
  },
  {
   "key": "persist.vendor.dolby.volume.leveler.amount",
   "value": "0",
   "current": "",
   "type": "int",
   "group": "音量均衡器"
  },
  {
   "key": "persist.vendor.dolby.virtualizer.enable",
   "value": "1",
   "current": "",
   "type": "switch",
   "group": "声场虚拟化"
  },
  {
   "key": "persist.vendor.dolby.virtualizer.amount",
   "value": "6",
   "current": "",
   "type": "int",
   "group": "声场虚拟化"
  },
  {
   "key": "persist.vendor.dolby.bass.enable",
   "value": "1",
   "current": "",
   "type": "switch",
   "group": "低频增强"
  },
  {
   "key": "persist.vendor.dolby.bass.boost",
   "value": "6",
   "current": "",
   "type": "int",
   "group": "低频增强"
  },
  {
   "key": "persist.vendor.dolby.spectral.enable",
   "value": "1",
   "current": "",
   "type": "switch",
   "group": "高频细节"
  },
  {
   "key": "persist.vendor.dolby.spectral.boost",
   "value": "7",
   "current": "",
   "type": "int",
   "group": "高频细节"
  },
  {
   "key": "persist.vendor.dolby.ieq.enable",
   "value": "0",
   "current": "",
   "type": "switch",
   "group": "IEQ / 后处理链"
  },
  {
   "key": "vendor.dolby.dap.pcequal",
   "value": "0",
   "current": "",
   "type": "int",
   "group": "IEQ / 后处理链"
  },
  {
   "key": "vendor.dolby.dap.pctype",
   "value": "0",
   "current": "",
   "type": "int",
   "group": "IEQ / 后处理链"
  },
  {
   "key": "persist.vendor.audio.low_power",
   "value": "false",
   "current": "",
   "type": "text",
   "group": "低功耗限制"
  },
  {
   "key": "persist.vendor.audio_hal.low_power",
   "value": "false",
   "current": "",
   "type": "text",
   "group": "低功耗限制"
  },
  {
   "key": "persist.vendor.audio.power.save.enable",
   "value": "0",
   "current": "",
   "type": "switch",
   "group": "低功耗限制"
  },
  {
   "key": "persist.vendor.audio.power.save.setting",
   "value": "0",
   "current": "",
   "type": "int",
   "group": "低功耗限制"
  },
  {
   "key": "persist.vendor.audio.silencelowpower.support",
   "value": "false",
   "current": "",
   "type": "text",
   "group": "低功耗限制"
  },
  {
   "key": "persist.sys.miuix.volume.power_save",
   "value": "0",
   "current": "",
   "type": "int",
   "group": "低功耗限制"
  },
  {
   "key": "persist.sys.miui.audio.power_save",
   "value": "0",
   "current": "",
   "type": "int",
   "group": "低功耗限制"
  },
  {
   "key": "persist.sys.hyper.audio.power_save",
   "value": "0",
   "current": "",
   "type": "int",
   "group": "低功耗限制"
  }
 ],
 "status": {
  "ok": true,
  "version": "1.0",
  "versionCode": "100",
  "moduleDir": "/data/adb/modules/k100pm_audio_plus",
  "root": "kernelsu",
  "device": {
   "model": "REDMI K100 Pro Max",
   "device": "songyuan",
   "vendorDevice": "songyuan",
   "android": "15",
   "sdk": "35"
  },
  "dax": {
   "md5": "3e393c0fa3afad67f8aeff7bfa70edea",
   "size": "137481",
   "template": true,
   "appliedAt": "2026-10-26 14:38:23",
   "appliedMd5": "3e393c0fa3afad67f8aeff7bfa70edea",
   "inSync": true
  },
  "counts": {
   "curves": 13,
   "props": 22
  },
  "mounts": [
   {
    "tag": "odm",
    "path": "/odm/etc/dolby/dax-default.xml",
    "exists": true,
    "mounted": true,
    "source": "/data/adb/modules/k100pm_audio_plus/Link/odm/etc/dolby/dax-default.xml",
    "md5": "3e393c0fa3afad67f8aeff7bfa70edea",
    "synced": true
   },
   {
    "tag": "vendor",
    "path": "/vendor/etc/dolby/dax-default.xml",
    "exists": true,
    "mounted": true,
    "source": "/data/adb/modules/k100pm_audio_plus/vendor/etc/dolby/dax-default.xml",
    "md5": "3e393c0fa3afad67f8aeff7bfa70edea",
    "synced": true
   }
  ],
  "slots": {
   "IEQ1": {
    "curve": "k100pm_tuned",
    "name": "K100PM 调整版",
    "builtin": true
   },
   "IEQ2": {
    "curve": "k100pm_tuned",
    "name": "K100PM 调整版",
    "builtin": true
   },
   "IEQ3": {
    "curve": "k100pm_tuned",
    "name": "K100PM 调整版",
    "builtin": true
   },
   "GEQ0": {
    "curve": "k100pm_tuned",
    "name": "K100PM 调整版",
    "builtin": true
   },
   "GEQ1": {
    "curve": "k100pm_tuned",
    "name": "K100PM 调整版",
    "builtin": true
   },
   "GEQ2": {
    "curve": "k100pm_tuned",
    "name": "K100PM 调整版",
    "builtin": true
   },
   "GEQ3": {
    "curve": "k100pm_tuned",
    "name": "K100PM 调整版",
    "builtin": true
   },
   "GEQ4": {
    "curve": "k100pm_tuned",
    "name": "K100PM 调整版",
    "builtin": true
   },
   "GEQ5": {
    "curve": "k100pm_tuned",
    "name": "K100PM 调整版",
    "builtin": true
   },
   "GEQ6": {
    "curve": "k100pm_tuned",
    "name": "K100PM 调整版",
    "builtin": true
   }
  },
  "referenceCurve": {
   "id": "k100pm_base",
   "name": "K100PM 基准曲线",
   "applied": true
  },
  "webui": true
 },
 "checks": [
  {
   "name": "配置模板",
   "ok": true,
   "detail": "127635 bytes"
  },
  {
   "name": "10 个槽位曲线",
   "ok": true,
   "detail": "IEQ1-3 / GEQ0-6 均已绑定"
  },
  {
   "name": "三份配置一致",
   "ok": true,
   "detail": "3e393c0fa3afad67f8aeff7bfa70edea"
  },
  {
   "name": "DAX 结构完整",
   "ok": true,
   "detail": "60 段 IEQ / 140 段 GEQ"
  },
  {
   "name": "出厂备份",
   "ok": true,
   "detail": "edbb40cb4793624433a885619c4ad939"
  },
  {
   "name": "WebUI 资源",
   "ok": true,
   "detail": "webroot/index.html"
  },
  {
   "name": "运行态挂载",
   "ok": true,
   "detail": "odm=True vendor=True"
  }
 ],
 "log": {
  "service": "[2026-10-26 00:50:46] service.sh 启动\n[2026-10-26 00:50:46] Root: kernelsu / resetprop: /data/adb/ksu/bin/resetprop\n[2026-10-26 00:50:46] props.conf 已注入 22 项属性\n[2026-10-26 00:50:46] DAX属性注入完成\n[2026-10-26 00:50:46] 低功耗白名单已清空（bind /dev/null 去除）\n[2026-10-26 00:50:46] ---------- Dolby DVL 媒体杜比化 ----------\n[2026-10-26 00:50:46]   检测到 AIDL: /vendor/etc/audio/sku_canoe/audio_effects_config.xml\n[2026-10-26 00:50:46] Dolby DVL 媒体杜比化 ✓\n[2026-10-26 00:50:46] service.sh 完成",
  "webui": "[2026-10-26 00:50:46] apply: 已写入 10 个槽位 (md5=3e393c0fa3afad67f8aeff7bfa70edea)\n[2026-10-26 00:50:46] assign-all target_k100pm"
 },
 "origMd5": "7e28478a49d48b862a9764ff4a40ef59",
 "currentMd5": "3e393c0fa3afad67f8aeff7bfa70edea"
};
  var state = JSON.parse(JSON.stringify(seed));
  var seq = 0;
  state.otg = {
    ok: true,
    supported: true,
    node: '/sys/class/xm_power/typec/cc_toggle',
    value: '0',
    enabled: false,
    config: { AUTO_ON: 0, KEEP_ON: 0, INTERVAL: 30, NODE: '' },
    watch: { running: false, pid: 0 }
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function curve(id) {
    for (var i = 0; i < state.curves.length; i++) if (state.curves[i].id === id) return state.curves[i];
    return null;
  }
  function nameOf(id) { var c = curve(id); return c ? c.name : id; }
  function now() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
      p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  function md5ish() {
    var s = '';
    for (var i = 0; i < 32; i++) s += '0123456789abcdef'[(Math.random() * 16) | 0];
    return s;
  }
  function logit(line) {
    var l = state.log.webui ? state.log.webui.split('\n') : [];
    l.push('[' + now() + '] ' + line);
    state.log.webui = l.slice(-80).join('\n');
  }
  function setMd5(md5) {
    state.status.dax.md5 = md5;
    state.status.dax.appliedMd5 = md5;
    state.status.dax.appliedAt = now();
    state.status.dax.inSync = true;
    (state.status.mounts || []).forEach(function (m) { m.md5 = md5; m.synced = true; });
  }

  async function run(args) {
    await new Promise(function (r) { setTimeout(r, 90); });
    var cmd = args[0];
    switch (cmd) {
      case 'status': return clone(state.status);
      case 'curves': return { ok: true, freqs: state.freqs, curves: clone(state.curves) };
      case 'slots': return { ok: true, slots: clone(state.slots) };
      case 'props': return { ok: true, props: clone(state.props) };
      case 'log': return { ok: true, service: state.log.service, webui: state.log.webui, at: now().slice(11) };
      case 'verify': return { ok: true, checks: clone(state.checks) };
      case 'assign':
        state.slots[args[1]] = { curve: args[2], name: nameOf(args[2]), builtin: !!(curve(args[2]) || {}).builtin };
        logit('assign ' + args[1] + '=' + args[2]);
        return { ok: true, slot: args[1], curve: args[2] };
      case 'assign-all':
        SLOTS.forEach(function (k) {
          state.slots[k] = { curve: args[1], name: nameOf(args[1]), builtin: !!(curve(args[1]) || {}).builtin };
        });
        logit('assign-all ' + args[1]);
        return { ok: true, curve: args[1], slots: 10 };
      case 'apply':
        setMd5(md5ish());
        logit('apply: 已写入 10 个槽位');
        state.checks.forEach(function (c) { if (c.name === '三份配置一致') c.detail = state.status.dax.md5; });
        return { ok: true, md5: state.status.dax.md5, size: '137529', needReload: true };
      case 'save-curve': {
        var id = args[1], name = args[2];
        var gains = args.slice(3).map(Number);
        state.curves.push({ id: id, name: name, source: '自定义 · WebUI', builtin: false, gains: gains });
        logit('save-curve ' + id + ' (' + name + ')');
        return { ok: true, id: id, name: name };
      }
      case 'delete-curve': {
        var cid = args[1];
        for (var k in state.slots) if (state.slots[k].curve === cid) throw new Error('该曲线正被槽位 ' + k + ' 使用，请先切换');
        state.curves = state.curves.filter(function (c) { return c.id !== cid; });
        logit('delete-curve ' + cid);
        return { ok: true, id: cid };
      }
      case 'set-prop': {
        var p = state.props.filter(function (x) { return x.key === args[1]; })[0];
        if (!p) throw new Error('属性未在 props.conf 中管理: ' + args[1]);
        p.value = String(args[2]);
        p.current = String(args[2]);
        logit('set-prop ' + args[1] + '=' + args[2]);
        return { ok: true, key: args[1], value: String(args[2]), current: String(args[2]) };
      }
      case 'reset':
        SLOTS.forEach(function (k) {
          state.slots[k] = { curve: ORIG[k], name: nameOf(ORIG[k]), builtin: true };
        });
        setMd5(state.origMd5);
        logit('reset: 已恢复原厂曲线与配置');
        return { ok: true, md5: state.origMd5, needReload: true };
      case 'reload':
        logit('reload ' + (args[1] || 'audio'));
        return { ok: true, what: args[1] || 'audio', note: '预览模式：未真正重启服务' };
      case 'reboot':
        logit('reboot 请求');
        return { ok: true, rebooting: true };
      case 'otg': {
        var sub = args[1] || 'status';
        if (sub === 'config') {
          for (var ai = 2; ai < args.length; ai++) {
            var kv = String(args[ai]).split('=');
            if (kv[0] === 'AUTO_ON' || kv[0] === 'KEEP_ON') state.otg.config[kv[0]] = Number(kv[1]) ? 1 : 0;
            else if (kv[0] === 'INTERVAL') state.otg.config.INTERVAL = Number(kv[1]) || 30;
            else if (kv[0] === 'NODE') state.otg.config.NODE = kv[1] || '';
          }
          state.otg.watch.running = !!state.otg.config.KEEP_ON;
          return { ok: true, config: clone(state.otg.config) };
        }
        if (sub === 'apply') {
          state.otg.enabled = !!(state.otg.config.AUTO_ON || state.otg.config.KEEP_ON);
          state.otg.value = state.otg.enabled ? '1' : '0';
          state.otg.watch.running = !!state.otg.config.KEEP_ON;
          return clone(state.otg);
        }
        if (sub === 'on' || sub === 'off') {
          state.otg.enabled = sub === 'on';
          state.otg.value = state.otg.enabled ? '1' : '0';
          return clone(state.otg);
        }
        if (sub === 'probe') {
          return {
            ok: true,
            lines: [
              '# 预览模式（不会写入设备）',
              'node = ' + state.otg.node + ' = ' + state.otg.value,
              'config: AUTO_ON=' + state.otg.config.AUTO_ON +
                ' KEEP_ON=' + state.otg.config.KEEP_ON +
                ' INTERVAL=' + state.otg.config.INTERVAL,
              'watch running=' + state.otg.watch.running
            ]
          };
        }
        return clone(state.otg);
      }
      default:
        throw new Error('预览模式不支持命令: ' + cmd);
    }
  }

  return { run: run, state: function () { return state; } };
})();
