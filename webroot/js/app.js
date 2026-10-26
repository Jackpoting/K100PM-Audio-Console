/* ============================================================
   app.js — K100PM WebUI 主逻辑
   ============================================================ */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var SLOTS = ['IEQ1', 'IEQ2', 'IEQ3', 'GEQ0', 'GEQ1', 'GEQ2', 'GEQ3', 'GEQ4', 'GEQ5', 'GEQ6'];
  var SLOT_HINT = {
    IEQ1: 'Detailed', IEQ2: 'Balanced', IEQ3: 'Warm',
    GEQ0: '预设 0', GEQ1: '预设 1', GEQ2: '预设 2', GEQ3: '预设 3',
    GEQ4: '预设 4', GEQ5: '预设 5', GEQ6: '预设 6'
  };
  var ORIG_MAP = {
    IEQ1: 'orig_ieq_detailed', IEQ2: 'orig_ieq_balanced', IEQ3: 'orig_ieq_warm',
    GEQ0: 'orig_geq_0', GEQ1: 'orig_geq_1', GEQ2: 'orig_geq_2', GEQ3: 'orig_geq_3',
    GEQ4: 'orig_geq_4', GEQ5: 'orig_geq_5', GEQ6: 'orig_geq_6'
  };
  var ROOT_LABEL = {
    kernelsu: 'KernelSU', sukisu: 'SukiSU Ultra', magisk: 'Magisk',
    apatch: 'APatch', unknown: '未知 Root'
  };
  /* 20 段计划固定，先画骨架，不等 shell 往返（首屏更快） */
  var DEFAULT_FREQS = [47, 141, 234, 328, 469, 656, 844, 1031, 1313, 1688,
    2250, 3000, 3750, 4688, 5813, 7125, 9000, 11250, 13875, 19688];

  var S = {
    preview: !!window.Bridge.isPreview,
    status: null,
    freqs: [],
    curves: [],
    curveMap: {},
    slots: {},
    backendSlots: {},
    props: [],
    checks: null,
    draft: { gains: [], baseId: 'k100pm_base', name: 'K100PM 基准曲线', baseline: [] },
    showRef: true,
    graph: null,
    logAuto: false,
    logTimer: null,
    logBusy: false,
    otg: null,
    otgBusy: false,
    refreshPromise: null,
    busy: false
  };

  /* ---------------- utils ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtDb(c) {
    var v = (c || 0) / 100;
    return (v > 0 ? '+' : '') + v.toFixed(2);
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function eqArr(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  function freqLabel(f) { return f >= 1000 ? (f / 1000).toFixed(f % 1000 ? 1 : 0) + 'k' : String(f); }

  function toast(msg, kind) {
    var box = $('#toasts');
    var el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.innerHTML = '<i class="dot"></i><span>' + esc(msg) + '</span>';
    box.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .25s, transform .25s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      setTimeout(function () { el.remove(); }, 280);
    }, kind === 'err' ? 4600 : 3200);
  }

  function setBusy(on) {
    S.busy = !!on;
    document.body.classList.toggle('is-busy', !!on);
  }

  /* ---------------- modal ---------------- */
  var modalResolve = null;
  function openModal(opt) {
    return new Promise(function (resolve) {
      modalResolve = resolve;
      $('#modalTitle').textContent = opt.title || '提示';
      $('#modalDesc').textContent = opt.desc || '';
      $('#modalDesc').hidden = !opt.desc;
      var inp = $('#modalInput');
      if (opt.input) {
        inp.hidden = false;
        inp.value = opt.value || '';
        inp.placeholder = opt.placeholder || '';
        inp.type = opt.inputType || 'text';
      } else {
        inp.hidden = true;
      }
      var ok = $('#modalOk');
      ok.textContent = opt.okText || '确定';
      ok.className = 'btn ' + (opt.danger ? 'danger' : 'primary');
      $('#modalCancel').textContent = opt.cancelText || '取消';
      $('#modalRoot').hidden = false;
      if (opt.input) setTimeout(function () { inp.focus(); inp.select(); }, 40);
    });
  }
  function closeModal(value) {
    $('#modalRoot').hidden = true;
    var r = modalResolve;
    modalResolve = null;
    if (r) r(value);
  }
  function modalConfirm(title, desc, okText, danger) {
    return openModal({ title: title, desc: desc, okText: okText, danger: danger }).then(function (v) {
      return v === true;
    });
  }
  function modalPrompt(title, desc, value, placeholder) {
    return openModal({
      title: title, desc: desc, input: true, value: value,
      placeholder: placeholder, okText: '保存'
    }).then(function (v) {
      if (v === null || v === true) return null;
      var s = String(v).trim();
      return s || null;
    });
  }

  /* ---------------- 数据加载 ---------------- */
  function indexCurves() {
    var m = {};
    for (var i = 0; i < S.curves.length; i++) m[S.curves[i].id] = S.curves[i];
    S.curveMap = m;
  }

  function cloneSlots(src) {
    var o = {};
    for (var k in src) {
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      var v = src[k] || {};
      o[k] = { curve: v.curve, name: v.name };
    }
    return o;
  }

  function applySnapshot(snap) {
    S.status = snap.status;
    S.freqs = snap.curves.freqs;
    S.curves = snap.curves.curves;
    S.slots = snap.slots.slots;
    S.props = snap.props.props;
    indexCurves();
    if (S.graph && S.freqs.length) S.graph.setData({ freqs: S.freqs });
    if (S.bandRows && S.bandRows.length !== S.freqs.length) buildBands();
  }

  /* 同一时刻只允许一个 snapshot，重复点击直接复用（避免排队卡顿）；
     force=true 用于写操作之后，必须拿到最新快照 */
  function refreshAll(keepDraft, force) {
    if (S.refreshPromise && !force) return S.refreshPromise;
    S.refreshPromise = doRefresh(keepDraft).then(function (r) {
      S.refreshPromise = null;
      return r;
    }, function (e) {
      S.refreshPromise = null;
      throw e;
    });
    return S.refreshPromise;
  }

  async function doRefresh(keepDraft) {
    setBusy(true);
    try {
      var snap = null;
      try { snap = await Bridge.cli(['snapshot']); } catch (e) { snap = null; }
      if (snap && snap.status && snap.curves && snap.slots && snap.props) {
        applySnapshot(snap);
      } else {
        var res = await Promise.all([
          Bridge.cli(['status']),
          Bridge.cli(['curves']),
          Bridge.cli(['slots']),
          Bridge.cli(['props'])
        ]);
        S.status = res[0];
        S.freqs = res[1].freqs;
        S.curves = res[1].curves;
        S.slots = res[2].slots;
        S.props = res[3].props;
        indexCurves();
        if (S.graph && S.freqs.length) S.graph.setData({ freqs: S.freqs });
        if (S.bandRows && S.bandRows.length !== S.freqs.length) buildBands();
      }
      S.backendSlots = cloneSlots(S.slots);
      if (!keepDraft || !S.draft.gains.length) initDraft();
      renderAll();
      setBusy(false);
      return true;
    } catch (e) {
      setBusy(false);
      toast(e.message || String(e), 'err');
      throw e;
    }
  }

  function curveById(id) {
    return S.curveMap[id] || null;
  }
  function curveByGains(gains) {
    for (var i = 0; i < S.curves.length; i++) if (eqArr(S.curves[i].gains, gains)) return S.curves[i];
    return null;
  }

  function initDraft() {
    var slotCurve = curveById((S.slots.IEQ1 || {}).curve);
    /* 优先恢复“当前槽位实际使用”的曲线：应用过自定义曲线后重新打开页面，
       20 段增益仍是上次写入的那一组，而不是被 tuned 覆盖。 */
    var base = slotCurve || curveById('k100pm_tuned') || curveById('k100pm_base') || S.curves[0];
    if (!base) {
      S.draft = { gains: new Array(20).fill(0), baseId: '', name: '未命名', baseline: new Array(20).fill(0) };
      return;
    }
    S.draft = {
      gains: base.gains.slice(),
      baseId: base.id,
      name: base.name,
      baseline: base.gains.slice()
    };
  }

  function loadDraft(id) {
    var c = curveById(id);
    if (!c) return;
    S.draft = {
      gains: c.gains.slice(), baseId: c.id, name: c.name, baseline: c.gains.slice()
    };
    renderMixer();
    renderApplyBar();
  }

  function draftDirty() {
    return !eqArr(S.draft.gains, S.draft.baseline);
  }
  function slotsDirty() {
    for (var i = 0; i < SLOTS.length; i++) {
      var k = SLOTS[i];
      var a = (S.slots[k] || {}).curve;
      var b = (S.backendSlots[k] || {}).curve;
      if (a !== b) return true;
    }
    return false;
  }

  /* ---------------- 渲染：头部 ---------------- */
  function renderHeader() {
    var st = S.status || {};
    var ver = (st.version || '1.0');
    $('#verLabel').textContent = ver.indexOf('v') >= 0 ? ver.split(' ').pop() : ver;
    $('#rootLabel').textContent = ROOT_LABEL[st.root] || st.root || '未知';

    var mounts = (st.mounts || []).filter(function (m) { return m.exists; });
    var mounted = mounts.filter(function (m) { return m.mounted; }).length;
    var chips = [];

    var model = (st.device && (st.device.model || st.device.vendorDevice)) || '未知机型';
    var devOk = !!(st.device && (st.device.model || st.device.device));
    chips.push('<span class="chip ' + (devOk ? 'ok' : 'warn') + '"><i></i>' + esc(model) + '</span>');

    if (!mounts.length) {
      chips.push('<span class="chip warn"><i></i>未检测到 Dolby 配置</span>');
    } else if (mounted === mounts.length) {
      chips.push('<span class="chip ok"><i></i>已挂载 ' + mounted + '/' + mounts.length + '</span>');
    } else if (mounted > 0) {
      chips.push('<span class="chip warn"><i></i>部分挂载 ' + mounted + '/' + mounts.length + '</span>');
    } else {
      chips.push('<span class="chip warn"><i></i>未挂载（重启后生效）</span>');
    }

    if (st.dax && st.dax.inSync) chips.push('<span class="chip ok"><i></i>配置已同步</span>');
    else chips.push('<span class="chip warn"><i></i>配置待写入</span>');

    var curveCount = st.counts ? st.counts.curves : (S.curves ? S.curves.length : 0);
    chips.push('<span class="chip ' + (curveCount > 0 ? 'ok' : 'warn') + '"><i></i>' + curveCount + ' 条曲线</span>');
    $('#statusChips').innerHTML = chips.join('');
  }

  /* ---------------- 渲染：调音台 ---------------- */
  function renderMixer() {
    var ref = curveById('k100pm_base');
    var refLabel = $('#legendRefName');
    if (refLabel) refLabel.textContent = ref ? ref.name : '—';
    if (S.graph) {
      S.graph.setData({
        gains: S.draft.gains,
        reference: ref ? ref.gains : null,
        showRef: S.showRef
      });
    }
    $('#draftName').textContent = S.draft.name;
    $('#legendName').textContent = S.draft.name;
    var mx = Math.max.apply(null, S.draft.gains);
    var mn = Math.min.apply(null, S.draft.gains);
    var txt = '最大 ' + fmtDb(mx) + ' · 最小 ' + fmtDb(mn) + ' dB';
    S._readout = txt;
    $('#rangeReadout').textContent = txt;
    var dirty = draftDirty();
    S._dirty = dirty;
    $('#dirtyDot').hidden = !dirty;
    /* 自愈：20 段行不存在/长度不符/被移出 DOM 时重建，保证增益区始终是 20 段 */
    if (!S.bandRows || S.bandRows.length !== S.freqs.length ||
        !S.bandRows[0] || !document.contains(S.bandRows[0].row)) {
      buildBands();
    }
    syncBands();
    renderSlots();
    renderApplyBar();
  }

  function buildBands() {
    var wrap = $('#bands');
    var html = '';
    for (var i = 0; i < S.freqs.length; i++) {
      html += '<div class="band" data-idx="' + i + '">' +
        '<div class="band-label">' + freqLabel(S.freqs[i]) + '<span style="opacity:.5">Hz</span></div>' +
        '<input type="range" min="-2000" max="2000" step="5" value="0" data-idx="' + i + '" aria-label="' + S.freqs[i] + 'Hz 增益">' +
        '<input class="band-val" type="text" inputmode="decimal" value="0.00" data-idx="' + i + '" aria-label="' + S.freqs[i] + 'Hz 数值">' +
        '</div>';
    }
    wrap.innerHTML = html;

    S.bandRows = [];
    for (var r = 0; r < S.freqs.length; r++) {
      var rowEl = wrap.querySelector('.band[data-idx="' + r + '"]');
      S.bandRows.push({
        row: rowEl,
        range: rowEl.querySelector('input[type=range]'),
        val: rowEl.querySelector('.band-val')
      });
    }

    if (!wrap.dataset.bound) {
      wrap.dataset.bound = '1';
      wrap.addEventListener('input', function (e) {
        var t = e.target;
        if (!t.dataset || t.dataset.idx == null) return;
        var idx = +t.dataset.idx;
        if (t.type === 'range') {
          setGain(idx, +t.value);
        } else {
          var v = parseFloat(t.value.replace(/[^0-9.+-]/g, ''));
          if (isNaN(v)) return;
          setGain(idx, Math.round(clamp(v, -20, 20) * 100), true);
        }
      });

      wrap.addEventListener('change', function (e) {
        var t = e.target;
        if (t.classList && t.classList.contains('band-val')) {
          var idx = +t.dataset.idx;
          var v = parseFloat(t.value.replace(/[^0-9.+-]/g, ''));
          if (isNaN(v)) v = 0;
          setGain(idx, Math.round(clamp(v, -20, 20) * 100), true);
        }
      });
    }
  }

  function updateReadout() {
    var mx = -2000, mn = 2000;
    for (var i = 0; i < S.draft.gains.length; i++) {
      var g = S.draft.gains[i];
      if (g > mx) mx = g;
      if (g < mn) mn = g;
    }
    var txt = '最大 ' + fmtDb(mx) + ' · 最小 ' + fmtDb(mn) + ' dB';
    if (S._readout !== txt) { S._readout = txt; $('#rangeReadout').textContent = txt; }
    var dirty = draftDirty();
    if (S._dirty !== dirty) { S._dirty = dirty; $('#dirtyDot').hidden = !dirty; }
  }

  function updateBandRow(idx, centi) {
    var br = S.bandRows && S.bandRows[idx];
    if (!br) return;
    if (document.activeElement !== br.range) br.range.value = centi;
    if (document.activeElement !== br.val) br.val.value = fmtDb(centi);
  }

  function setGain(idx, centi, updateInput) {
    centi = clamp(Math.round(centi), -2000, 2000);
    S.draft.gains[idx] = centi;
    var br = S.bandRows && S.bandRows[idx];
    if (br) {
      if (updateInput && document.activeElement !== br.range) br.range.value = centi;
      if (document.activeElement !== br.val) br.val.value = fmtDb(centi);
    }
    if (S.graph) S.graph.setGains(S.draft.gains);
    updateReadout();
    renderApplyBar();
  }

  function syncBands() {
    if (!S.bandRows) return;
    for (var i = 0; i < S.bandRows.length; i++) {
      var br = S.bandRows[i];
      var v = S.draft.gains[i] || 0;
      if (document.activeElement !== br.range) br.range.value = v;
      if (document.activeElement !== br.val) br.val.value = fmtDb(v);
    }
  }

  function curveSetSig() {
    var a = [];
    for (var i = 0; i < S.curves.length; i++) a.push(S.curves[i].id + '=' + S.curves[i].name);
    return a.join('|');
  }

  function updateSlotBadge() {
    var badge = $('#slotStateBadge');
    var dirty = slotsDirty();
    var txt = dirty ? '有未写入的映射' : '已同步';
    if (badge.textContent === txt) return;
    badge.textContent = txt;
    badge.className = dirty ? 'badge warn' : 'badge';
  }

  function renderSlots() {
    if (!S.curves.length) return;
    var wrap = $('#slotGrid');
    var sig = '';
    for (var i = 0; i < SLOTS.length; i++) {
      sig += SLOTS[i] + '=' + ((S.slots[SLOTS[i]] || {}).curve || '') + ';';
    }
    sig += '#' + S.curves.length + ';' + curveSetSig();
    if (S._slotSig !== sig) {
      S._slotSig = sig;
      var ids = [];
      for (var c = 0; c < S.curves.length; c++) ids.push(S.curves[c].id);
      var html = '';
      for (var n = 0; n < SLOTS.length; n++) {
        var k = SLOTS[n];
        var cur = (S.slots[k] || {}).curve || '';
        var isGeq = k.indexOf('GEQ') === 0;
        html += '<div class="slot">' +
          '<span class="slot-tag ' + (isGeq ? 'geq' : '') + '">' + k + '</span>' +
          '<select data-slot="' + k + '" aria-label="' + k + ' 曲线">' +
          ids.map(function (id) {
            var cv = curveById(id);
            return '<option value="' + esc(id) + '"' + (id === cur ? ' selected' : '') + '>' + esc(cv ? cv.name : id) + '</option>';
          }).join('') +
          '</select></div>';
      }
      wrap.innerHTML = html;
    }
    updateSlotBadge();
  }

  /* ---------------- 渲染：曲线库 ---------------- */
  function renderLibrary() {
    var grid = $('#curveGrid');
    if (!S.curves.length) { grid.innerHTML = '<p class="muted">暂无曲线</p>'; return; }
    var sig = S.curves.map(function (c) {
      return c.id + ':' + c.name + ':' + c.gains.join(',');
    }).join('|') + '#' + S.draft.baseId;
    if (S._libSig === sig) return;
    S._libSig = sig;
    function rank(c) {
      if (c.id === 'k100pm_tuned') return 0;
      if (c.id === 'k100pm_base') return 1;
      if (c.id === 'flat') return 2;
      return c.builtin ? 3 : 4;
    }
    var list = S.curves.slice().sort(function (a, b) {
      var ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    });
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      var tagCls = c.id === 'k100pm_tuned' ? 'default' :
        (c.id === 'k100pm_base' ? 'target' : (c.builtin ? 'orig' : 'custom'));
      var tagTxt = c.id === 'k100pm_tuned' ? 'DEFAULT' :
        (c.id === 'k100pm_base' ? 'BASE' : (c.id === 'flat' ? 'REF' : (c.builtin ? 'ORIGINAL' : 'CUSTOM')));
      var isCur = c.id === S.draft.baseId;
      var mx = Math.max.apply(null, c.gains), mn = Math.min.apply(null, c.gains);
      html += '<article class="curve-card-sm' + (isCur ? ' is-current' : '') + '" data-curve="' + esc(c.id) + '">' +
        '<header><div><h3>' + esc(c.name) + '</h3><div class="src">' + esc(c.source || c.id) + '</div></div>' +
        '<span class="tag ' + tagCls + '">' + tagTxt + '</span></header>' +
        '<canvas data-spark="' + esc(c.id) + '"></canvas>' +
        '<div class="curve-meta"><span>max ' + fmtDb(mx) + '</span><span>min ' + fmtDb(mn) + '</span></div>' +
        '<div class="curve-actions">' +
        '<button class="btn ghost sm" data-act="edit" data-id="' + esc(c.id) + '">编辑</button>' +
        '<button class="btn ghost sm" data-act="use" data-id="' + esc(c.id) + '">应用到全部</button>' +
        '<button class="btn ghost sm" data-act="export" data-id="' + esc(c.id) + '">导出</button>' +
        (c.builtin ? '' : '<button class="btn ghost sm" data-act="delete" data-id="' + esc(c.id) + '">删除</button>') +
        '</div></article>';
    }
    grid.innerHTML = html;

    $$('#curveGrid canvas[data-spark]').forEach(function (cv) {
      var c = curveById(cv.dataset.spark);
      if (c) window.EQSpark(cv, S.freqs, c.gains, null);
    });
  }

  /* ---------------- 渲染：属性 ---------------- */
  function renderProps() {
    var wrap = $('#propsWrap');
    if (!S.props.length) { wrap.innerHTML = '<p class="muted">未读取到属性</p>'; return; }
    var sig = S.props.map(function (p) { return p.key + '=' + p.value + '/' + (p.current || ''); }).join('|');
    if (S._propSig === sig) return;
    S._propSig = sig;
    var groups = [];
    var map = {};
    S.props.forEach(function (p) {
      if (!map[p.group]) { map[p.group] = []; groups.push(p.group); }
      map[p.group].push(p);
    });
    var html = '';
    groups.forEach(function (g) {
      html += '<div class="prop-group"><h3>' + esc(g) + '</h3>';
      map[g].forEach(function (p) {
        var short = p.key.replace(/^persist\.vendor\./, '').replace(/^persist\./, '');
        var ctl;
        if (p.type === 'switch') {
          ctl = '<label class="switch"><input type="checkbox" data-prop="' + esc(p.key) + '"' +
            (String(p.current || p.value) === '1' ? ' checked' : '') + '><span></span></label>';
        } else {
          ctl = '<input type="text" data-prop="' + esc(p.key) + '" value="' + esc(p.current || p.value) + '">';
        }
        html += '<div class="prop-row" data-row="' + esc(p.key) + '">' +
          '<div class="prop-name"><span>' + esc(short) + '</span><em>' + esc(p.key) + '</em></div>' +
          '<div class="prop-ctl">' + ctl + '</div></div>';
      });
      html += '</div>';
    });
    wrap.innerHTML = html;

    if (!wrap.dataset.bound) {
      wrap.dataset.bound = '1';
      wrap.addEventListener('input', markPropRow);
      wrap.addEventListener('change', markPropRow);
    }
    function markPropRow(e) {
      var inp = e.target;
      if (!inp.dataset || !inp.dataset.prop) return;
      var p = S.props.filter(function (x) { return x.key === inp.dataset.prop; })[0];
      if (!p) return;
      var row = $('.prop-row[data-row="' + p.key + '"]');
      var val = inp.type === 'checkbox' ? (inp.checked ? '1' : '0') : inp.value.trim();
      row.classList.toggle('changed', val !== p.value);
    }
  }

  /* ---------------- 渲染：状态 ---------------- */
  function renderStatusView() {
    var st = S.status || {};
    var d = st.device || {};
    var sig = (st.version || '') + '|' + (st.root || '') + '|' + (st.moduleDir || '') +
      '|' + (st.dax ? (st.dax.md5 + '/' + st.dax.size + '/' + st.dax.inSync + '/' + st.dax.appliedAt) : '') +
      '|' + (st.counts ? st.counts.curves + '/' + st.counts.props : '') +
      '|' + (st.mounts || []).map(function (m) {
        return m.path + ',' + m.exists + ',' + m.mounted + ',' + m.synced + ',' + m.source;
      }).join(';');
    if (S._statusSig === sig) return;
    S._statusSig = sig;
    var rows = [
      ['模块版本', st.version || '-'],
      ['版本号', st.versionCode || '-'],
      ['机型', (d.model || '-') + ' (' + (d.vendorDevice || d.device || '-') + ')'],
      ['Android', (d.android || '-') + ' · API ' + (d.sdk || '-')],
      ['Root', ROOT_LABEL[st.root] || st.root || '-'],
      ['模块路径', st.moduleDir || '-'],
      ['配置哈希', (st.dax && st.dax.md5) ? st.dax.md5.slice(0, 16) + '…' : '-'],
      ['配置大小', (st.dax && st.dax.size) ? st.dax.size + ' bytes' : '-'],
      ['上次写入', (st.dax && st.dax.appliedAt) || '-'],
      ['内容同步', st.dax && st.dax.inSync ? '是' : '否'],
      ['曲线 / 属性', (st.counts ? st.counts.curves : 0) + ' / ' + (st.counts ? st.counts.props : 0)]
    ];
    $('#infoGrid').innerHTML = rows.map(function (r) {
      return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>';
    }).join('');

    var mounts = st.mounts || [];
    $('#mountList').innerHTML = mounts.map(function (m) {
      var cls = 'bad', txt = '未检测';
      if (m.synced) { cls = 'ok'; txt = '已同步'; }
      else if (m.mounted) { cls = 'warn'; txt = '已挂载·待同步'; }
      else if (m.exists) { cls = 'warn'; txt = '未挂载'; }
      return '<div class="mount"><div class="mount-top">' +
        '<span class="mount-path">' + esc(m.path) + '</span>' +
        '<span class="state ' + cls + '">' + txt + '</span></div>' +
        '<div class="mount-sub">' + (m.mounted ? 'source: ' + esc(m.source) : '尚未 bind 到该路径') + '</div>' +
        '</div>';
    }).join('') || '<p class="muted">无数据</p>';

    $('#chainNotes').innerHTML =
      '<span>模块文件：<code>Link/odm/etc/dolby/dax-default.xml</code> → <code>/odm/etc/dolby/dax-default.xml</code></span>' +
      '<span>模块文件：<code>vendor/etc/dolby/dax-default.xml</code> → <code>/vendor/etc/dolby/dax-default.xml</code></span>' +
      '<span>写入顺序：生成 → 三份副本同源 → bind 挂载 → 重启音频服务 / 重启手机</span>' +
      '<span class="chain-note">bind 挂载由 post-fs-data.sh 在开机阶段完成；WebUI 写入采用原地覆盖（保持同一 inode），已挂载路径无需重新挂载即可读到新内容。</span>';
  }

  function renderChecks() {
    var box = $('#checkList');
    if (!S.checks) { box.innerHTML = '<p class="muted">点击「重新校验」开始检测</p>'; return; }
    box.innerHTML = S.checks.map(function (c) {
      return '<div class="check ' + (c.ok ? 'ok' : 'bad') + '">' +
        '<span class="ico"><svg viewBox="0 0 24 24">' +
        (c.ok ? '<path d="M5 13l4 4L19 7"/>' : '<path d="M6 6l12 12M18 6L6 18"/>') +
        '</svg></span><div><b>' + esc(c.name) + '</b><span>' + esc(c.detail) + '</span></div></div>';
    }).join('');
  }

  /* ---------------- 渲染：应用条 ---------------- */
  function renderApplyBar() {
    var show = draftDirty() || slotsDirty();
    if (S._applyShown === show && S._applyDirty === (show ? draftDirty() : null)) return;
    S._applyShown = show;
    S._applyDirty = show ? draftDirty() : null;
    $('#applyBar').hidden = !show;
    document.body.classList.toggle('has-applybar', show);
    if (!show) return;
    $('#applyBar .applybar-text b').textContent = S._applyDirty ? '曲线已修改' : '槽位映射已修改';
    $('#applyBar .applybar-text span').textContent = S._applyDirty
      ? '尚未写入模块配置' : '尚未写入 Dolby 配置';
  }

  function isActiveView(name) {
    var v = document.querySelector('.view.is-active');
    return !!v && v.dataset.view === name;
  }

  /* 只渲染当前可见页；其它页在切 Tab 时再画，首屏不再为不可见 DOM 买单 */
  function renderActiveView() {
    if (isActiveView('library')) renderLibrary();
    else if (isActiveView('props')) renderProps();
    else if (isActiveView('status')) {
      renderStatusView();
      if (S.checks) renderChecks();
    }
  }

  function renderAll() {
    renderHeader();
    if (!S.freqs.length) return;
    renderMixer();
    renderActiveView();
  }

  /* ---------------- 动作 ---------------- */
  function defaultCurveName() {
    var base = String(S.draft.name || '自定义曲线')
      .replace(/\s*调整版$/, '')
      .trim() || 'K100PM';
    return draftDirty() ? (base + ' 调整版') : base;
  }

  async function saveDraftCurve() {
    if (S.busy) return null;
    var name = await modalPrompt('保存曲线', '把当前 20 段增益保存为自定义曲线（可随时在曲线库重新载入）。', defaultCurveName(), '例如：低频增强');
    if (!name) return null;
    var id = 'custom_' + Date.now().toString(36);
    await Bridge.cli(['save-curve', id, name].concat(S.draft.gains.map(String)));
    S.curves.push({
      id: id, name: name, source: '自定义 · WebUI', builtin: false,
      gains: S.draft.gains.slice()
    });
    indexCurves();
    S.draft.baseId = id;
    S.draft.name = name;
    S.draft.baseline = S.draft.gains.slice();
    renderLibrary();
    renderMixer();
    renderApplyBar();
    toast('已保存曲线「' + name + '」', 'ok');
    return id;
  }

  /* 一次 exec 写完整份槽位映射（旧版每个槽位一次 exec，最多 10 次往返） */
  async function pushSlots() {
    var pairs = [];
    for (var i = 0; i < SLOTS.length; i++) {
      var k = SLOTS[i];
      var want = (S.slots[k] || {}).curve;
      var has = (S.backendSlots[k] || {}).curve;
      if (want && want !== has) pairs.push(k + '=' + want);
    }
    if (pairs.length) await Bridge.cli(['assign-map'].concat(pairs));
  }

  async function applyConfig(opts) {
    opts = opts || {};
    if (S.busy) return false;
    setBusy(true);
    try {
      await pushSlots();
      var res = await Bridge.cli(['apply']);
      S.draft.baseline = S.draft.gains.slice();
      S.backendSlots = cloneSlots(S.slots);
      await refreshAll(true, true);
      setBusy(false);
      toast('已写入配置 · ' + String(res.md5 || '').slice(0, 10) + '…', 'ok');
      if (opts.askReload !== false) {
        setTimeout(function () { maybeReload(); }, 350);
      }
      return true;
    } catch (e) {
      setBusy(false);
      toast(e.message || String(e), 'err');
      return false;
    }
  }

  async function maybeReload() {
    var ok = await modalConfirm(
      '配置已写入',
      '重启音频服务可让新曲线立即生效（会有短暂静音）。若无效，请重启手机。',
      '重启音频服务'
    );
    if (ok) await reloadAudio(true);
  }

  async function applyAllSlots() {
    var gains = S.draft.gains.slice();
    var existing = curveByGains(gains);
    var id;
    if (existing) {
      id = existing.id;
    } else {
      id = await saveDraftCurve();
      if (!id) return;
    }
    await Bridge.cli(['assign-all', id]);
    S.slots = {};
    SLOTS.forEach(function (k) { S.slots[k] = { curve: id }; });
    S.backendSlots = cloneSlots(S.slots);
    await applyConfig();
  }

  async function reloadAudio(silent) {
    if (S.busy) return;
    try {
      setBusy(true);
      await Bridge.cli(['reload', 'audio']);
      setBusy(false);
      if (!silent) toast('音频服务已重启', 'ok');
    } catch (e) {
      setBusy(false);
      toast(e.message || String(e), 'err');
    }
  }

  async function doVerify() {
    if (S.busy) return;
    try {
      var res = await Bridge.cli(['verify']);
      S.checks = res.checks;
      renderChecks();
      var bad = S.checks.filter(function (c) { return !c.ok; }).length;
      toast(bad ? bad + ' 项未通过' : '全部检查通过', bad ? 'err' : 'ok');
    } catch (e) {
      toast(e.message || String(e), 'err');
    }
  }

  function exportCurve(id) {
    var c = curveById(id);
    if (!c) return;
    var payload = {
      format: 'com.weich.daptune.profile',
      version: 1,
      name: c.name,
      band_plan: 'dolby-dap-20-v1',
      frequencies_hz: S.freqs,
      gains_q4: c.gains,
      gains_db: c.gains.map(function (g) { return +(g / 100).toFixed(2); }),
      exported_by: '蓝鲸鱼🐳 · 1.0',
      exported_at: new Date().toISOString()
    };
    var safe = (c.id || 'curve').replace(/[^a-z0-9_-]/gi, '_');
    var text = JSON.stringify(payload, null, 2);
    var primary = '/sdcard/Download/k100pm_' + safe + '.json';
    var fallback = ((S.status && S.status.moduleDir) || '/data/local/tmp') + '/export/k100pm_' + safe + '.json';
    Bridge.writeFile(primary, text).then(function (r) {
      toast(r.preview ? '已导出（浏览器下载）' : '已导出到 ' + primary, 'ok');
    }).catch(function () {
      Bridge.writeFile(fallback, text).then(function (r2) {
        toast(r2.preview ? '已导出（浏览器下载）' : '已导出到 ' + fallback, 'ok');
      }).catch(function (e2) {
        toast('导出失败：' + (e2.message || e2), 'err');
      });
    });
  }

  async function importProfile(file) {
    try {
      var text = await file.text();
      var obj = JSON.parse(text);
      var freqs = obj.frequencies_hz || obj.freqs;
      var gains = obj.gains_q4 || obj.gains || obj.gains_db;
      if (!gains && Array.isArray(obj.bands)) gains = obj.bands.map(function (b) { return b.gain; });
      if (!Array.isArray(gains) || gains.length !== 20) {
        throw new Error('未找到 20 段增益（支持 gains_q4 / gains / gains_db / bands[].gain）');
      }
      gains = gains.map(function (v) { return typeof v === 'string' ? parseFloat(v) : v; });
      if (gains.some(function (v) { return typeof v !== 'number' || isNaN(v); })) throw new Error('增益数组包含非法值');
      var hasFloat = gains.some(function (v) { return Math.abs(v - Math.round(v)) > 1e-9; });
      if (obj.gains_db || hasFloat) gains = gains.map(function (v) { return Math.round(v * 100); });
      if (freqs && freqs.length === 20) {
        for (var i = 0; i < 20; i++) {
          if (Number(freqs[i]) !== Number(S.freqs[i])) {
            throw new Error('频点与 dolby-dap-20-v1 不一致：第 ' + (i + 1) + ' 段 ' + freqs[i] + 'Hz');
          }
        }
      }
      gains = gains.map(function (v) { return clamp(Math.round(v), -2000, 2000); });
      var name = (obj.name || file.name.replace(/\.json$/i, '') || '导入曲线').slice(0, 40);
      var id = 'custom_' + Date.now().toString(36);
      await Bridge.cli(['save-curve', id, name].concat(gains.map(String)));
      await refreshAll(true, true);
      loadDraft(id);
      toast('已导入「' + name + '」', 'ok');
    } catch (e) {
      toast('导入失败：' + (e.message || e), 'err');
    }
  }

  /* ---------------- 日志 ---------------- */
  async function refreshLog() {
    if (S.logBusy) return;      /* 自动刷新/手动刷新不叠加 */
    S.logBusy = true;
    try {
      var res = await Bridge.cli(['log', '160']);
      renderLogText(res);
    } catch (e) {
      $('#logView').textContent = '读取失败：' + (e.message || e);
    } finally {
      S.logBusy = false;
    }
  }

  /* 只有停留在日志页且开启自动刷新时才轮询，切走即停 */
  function syncLogTimer() {
    var on = S.logAuto && isActiveView('log');
    if (S.logTimer) { clearInterval(S.logTimer); S.logTimer = null; }
    if (on) S.logTimer = setInterval(refreshLog, 4000);
  }
  function colorLine(line) {
    var cls = '';
    if (/✓|✔|成功|已注入|已写入|完成|bind 生效|生效/.test(line)) cls = 'ok';
    if (/✗|✘|失败|错误|denied|abort|not found|error:/i.test(line)) cls = 'err';
    if (/^\s*$/.test(line)) cls = 'dim';
    return '<span class="' + cls + '">' + esc(line) + '</span>';
  }
  function renderLogText(res) {
    var svc = (res.service || '').split('\n');
    var web = (res.webui || '').split('\n');
    var out = [];
    out.push('<span class="dim"># service.log · 开机阶段</span>');
    out = out.concat(svc.map(colorLine));
    out.push('');
    out.push('<span class="dim"># webui.log · 本页操作</span>');
    out = out.concat(web.map(colorLine));
    $('#logView').innerHTML = out.join('\n');
    $('#logMeta').textContent = '读取于 ' + (res.at || '') + ' · 自动刷新 ' + (S.logAuto ? '开' : '关');
    var el = $('#logView');
    el.scrollTop = el.scrollHeight;
  }

  /* ---------------- OTG ---------------- */
  function renderOtg() {
    var o = S.otg;
    var badge = $('#otgBadge');
    var info = $('#otgInfo');
    var nodeEl = $('#otgNode');
    if (!o) {
      badge.textContent = '读取失败';
      badge.className = 'badge warn';
      nodeEl.textContent = '—';
      info.innerHTML = '<dt>状态</dt><dd>无法读取 OTG 状态</dd>';
      return;
    }
    var supported = !!o.supported;
    var enabled = !!o.enabled;
    var cfg = o.config || {};
    var watch = o.watch || {};
    badge.textContent = supported ? (enabled ? '已开启' : '已关闭') : '未检测到节点';
    badge.className = 'badge' + (supported && enabled ? '' : ' warn');
    nodeEl.textContent = o.node || '未检测到';
    var rows = [
      ['状态', supported ? (enabled ? '已开启' : '已关闭') : '不支持 / 未找到控制节点'],
      ['当前值', (o.value === '' || o.value == null) ? '-' : o.value],
      ['守护进程', watch.running ? ('运行中 · PID ' + watch.pid) : '未运行'],
      ['开机自动开启', cfg.AUTO_ON ? '是' : '否'],
      ['保持常开', cfg.KEEP_ON ? '是' : '否'],
      ['复查间隔', (cfg.INTERVAL || '-') + ' 秒']
    ];
    info.innerHTML = rows.map(function (r) {
      return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>';
    }).join('');
    $('#btnOtgOn').disabled = !supported;
    $('#btnOtgOff').disabled = !supported;
    $('#otgAuto').checked = !!cfg.AUTO_ON;
    $('#otgKeep').checked = !!cfg.KEEP_ON;
    var sel = $('#otgInterval');
    var v = String(cfg.INTERVAL || 30);
    var found = false;
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === v) { found = true; break; }
    }
    if (!found) {
      var opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v + ' 秒';
      sel.appendChild(opt);
    }
    sel.value = v;
  }

  async function refreshOtg() {
    if (S.otgBusy) return;
    S.otgBusy = true;
    try {
      S.otg = await Bridge.cli(['otg', 'status']);
      renderOtg();
    } catch (e) {
      S.otg = null;
      renderOtg();
      toast('OTG 状态读取失败：' + (e.message || e), 'err');
    } finally {
      S.otgBusy = false;
    }
  }

  async function otgToggle(act) {
    if (S.busy) return;
    setBusy(true);
    try {
      S.otg = await Bridge.cli(['otg', act]);
      renderOtg();
      toast(act === 'on' ? 'OTG 已开启' : 'OTG 已关闭', 'ok');
    } catch (e) {
      toast(e.message || String(e), 'err');
    }
    setBusy(false);
  }

  async function otgOffWithConfirm() {
    var keep = S.otg && S.otg.config && S.otg.config.KEEP_ON;
    if (keep) {
      var ok = await modalConfirm(
        '关闭 OTG',
        '「保持常开」当前已开启，关闭 OTG 会同时关闭保持常开，否则守护进程会在数秒后重新打开它。继续？',
        '关闭 OTG', true);
      if (!ok) return;
      try {
        await Bridge.cli(['otg', 'config', 'KEEP_ON=0']);
        await Bridge.cli(['otg', 'stop']);
        $('#otgKeep').checked = false;
      } catch (e) { /* 继续尝试关闭 */ }
    }
    await otgToggle('off');
  }

  async function saveOtg() {
    if (S.busy) return;
    var auto = $('#otgAuto').checked ? '1' : '0';
    var keep = $('#otgKeep').checked ? '1' : '0';
    var interval = $('#otgInterval').value;
    setBusy(true);
    try {
      await Bridge.cli(['otg', 'config', 'AUTO_ON=' + auto, 'KEEP_ON=' + keep, 'INTERVAL=' + interval]);
      S.otg = await Bridge.cli(['otg', 'apply']);
      renderOtg();
      toast('OTG 设置已保存并应用', 'ok');
    } catch (e) {
      toast(e.message || String(e), 'err');
    }
    setBusy(false);
  }

  async function otgProbe() {
    var pre = $('#otgProbeOut');
    var hint = $('#otgProbeHint');
    pre.hidden = false;
    pre.textContent = '正在收集诊断信息…';
    hint.hidden = true;
    try {
      var res = await Bridge.cli(['otg', 'probe']);
      pre.textContent = (res.lines || []).join('\n');
    } catch (e) {
      pre.textContent = '诊断失败：' + (e.message || e)
        + '\n\n常见原因：模块脚本未以 root 执行，或 /data/local/tmp 不可写。';
    }
  }

  function bindOtg() {
    if (!$('#btnOtgRefresh')) return;   /* 旧版缓存 HTML 缺少 OTG 节点时不影响其它页面 */
    $('#btnOtgRefresh').addEventListener('click', function () { refreshOtg(); });
    $('#btnOtgProbe').addEventListener('click', function () { otgProbe(); });
    $('#btnOtgOn').addEventListener('click', function () { otgToggle('on'); });
    $('#btnOtgOff').addEventListener('click', function () { otgOffWithConfirm(); });
    $('#btnOtgSave').addEventListener('click', function () { saveOtg(); });
  }

  /* ---------------- 事件绑定 ---------------- */
  function bindTabs() {
    $('#tabs').addEventListener('click', function (e) {
      var btn = e.target.closest('.tab');
      if (!btn) return;
      var tab = btn.dataset.tab;
      $$('.tab').forEach(function (t) { t.classList.toggle('is-active', t === btn); });
      $$('.view').forEach(function (v) { v.classList.toggle('is-active', v.dataset.view === tab); });
      if (tab === 'mixer' && S.graph) setTimeout(function () { S.graph.resize(); }, 30);
      renderActiveView();
      if (tab === 'log') refreshLog();
      if (tab === 'otg') refreshOtg();
      syncLogTimer();
    });
  }

  function bindHeader() {
    $('#btnRefresh').addEventListener('click', function () {
      refreshAll(true).then(function () { toast('状态已刷新', 'ok'); }).catch(function () {});
    });
    $('#btnReload').addEventListener('click', function () { reloadAudio(false); });
    $('#btnReboot').addEventListener('click', function () { confirmReboot(); });
    $('#btnStatusRefresh').addEventListener('click', function () { refreshAll(true).catch(function () {}); });
    $('#btnReload2').addEventListener('click', function () { reloadAudio(false); });
    $('#btnReboot2').addEventListener('click', function () { confirmReboot(); });
    $('#btnReset').addEventListener('click', confirmReset);
    $('#btnVerify').addEventListener('click', doVerify);
  }

  async function confirmReboot() {
    var ok = await modalConfirm('重启手机', '设备将立即重启，未保存的曲线修改会丢失。确认继续？', '重启', true);
    if (!ok) return;
    try { await Bridge.cli(['reboot']); toast('正在重启…', 'ok'); }
    catch (e) { toast(e.message || String(e), 'err'); }
  }

  async function confirmReset() {
    var ok = await modalConfirm(
      '恢复原厂曲线',
      '将把三份 dax-default.xml 还原为模块原始调音，并把 IEQ/GEQ 槽位恢复为原厂映射。自定义曲线不会删除。',
      '恢复', true);
    if (!ok) return;
    try {
      setBusy(true);
      await Bridge.cli(['reset']);
      await refreshAll(true, true);
      initDraft();
      renderMixer();
      setBusy(false);
      toast('已恢复原厂配置', 'ok');
    } catch (e) {
      setBusy(false);
      toast(e.message || String(e), 'err');
    }
  }

  function bindMixer() {
    var restore = $('#btnBandsRestore');
    if (restore) restore.addEventListener('click', function () {
      S.draft.gains = S.draft.baseline.slice();
      renderMixer();
      renderApplyBar();
      toast('已恢复当前曲线的 20 段增益', 'ok');
    });
    $('#btnZero').addEventListener('click', function () {
      S.draft.gains = new Array(20).fill(0);
      renderMixer();
    });
    $('#btnSaveCurve').addEventListener('click', function () {
      saveDraftCurve().catch(function (e) { toast(e.message || String(e), 'err'); });
    });
    $('#btnApplyAll').addEventListener('click', function () {
      applyAllSlots().catch(function (e) { toast(e.message || String(e), 'err'); });
    });
    $('#refToggle').addEventListener('change', function (e) {
      S.showRef = e.target.checked;
      if (S.graph) S.graph.setData({ showRef: S.showRef });
    });

    $('#slotGrid').addEventListener('change', function (e) {
      var sel = e.target.closest('select[data-slot]');
      if (!sel) return;
      var k = sel.dataset.slot;
      var c = curveById(sel.value);
      S.slots[k] = { curve: sel.value, name: c ? c.name : sel.value };
      renderSlots();
      renderApplyBar();
    });

    async function assignToSlots(filter) {
      var match = curveByGains(S.draft.gains);
      var id = match ? match.id : null;
      if (!id) {
        try {
          id = await saveDraftCurve();
        } catch (err) {
          toast(err.message || String(err), 'err');
          return;
        }
        if (!id) return;
      }
      SLOTS.forEach(function (k) {
        if (filter === 'ieq' && k.indexOf('IEQ') !== 0) return;
        if (filter === 'geq' && k.indexOf('GEQ') !== 0) return;
        var c = curveById(id);
        S.slots[k] = { curve: id, name: c ? c.name : id };
      });
      renderSlots();
      renderApplyBar();
      toast(filter === 'all' ? '10 个槽位已指向当前曲线（未写入）' : (filter === 'ieq' ? 'IEQ 槽位已更新（未写入）' : 'GEQ 槽位已更新（未写入）'), 'ok');
    }
    $('#btnSlotsAllDraft').addEventListener('click', function () { assignToSlots('all').catch(function (e) { toast(e.message || String(e), 'err'); }); });
    $('#btnSlotsIeq').addEventListener('click', function () { assignToSlots('ieq').catch(function (e) { toast(e.message || String(e), 'err'); }); });
    $('#btnSlotsGeq').addEventListener('click', function () { assignToSlots('geq').catch(function (e) { toast(e.message || String(e), 'err'); }); });
    $('#btnSlotsOrig').addEventListener('click', function () {
      SLOTS.forEach(function (k) {
        var c = curveById(ORIG_MAP[k]);
        S.slots[k] = { curve: ORIG_MAP[k], name: c ? c.name : ORIG_MAP[k] };
      });
      renderSlots();
      renderApplyBar();
      toast('已改为原厂映射（未写入）', 'ok');
    });
    $('#btnWriteSlots').addEventListener('click', function () {
      applyConfig().catch(function (e) { toast(e.message || String(e), 'err'); });
    });

    $('#btnDiscard').addEventListener('click', function () {
      S.draft.gains = S.draft.baseline.slice();
      S.slots = JSON.parse(JSON.stringify(S.backendSlots));
      renderMixer();
      renderApplyBar();
      toast('已放弃未写入的修改', 'ok');
    });
    $('#btnApplyBar').addEventListener('click', function () {
      applyConfig().catch(function (e) { toast(e.message || String(e), 'err'); });
    });
  }

  function bindLibrary() {
    $('#btnImport').addEventListener('click', function () { $('#fileInput').click(); });
    $('#fileInput').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) importProfile(f);
      e.target.value = '';
    });
    $('#curveGrid').addEventListener('click', async function (e) {
      var btn = e.target.closest('button[data-act]');
      if (!btn) return;
      var id = btn.dataset.id;
      var act = btn.dataset.act;
      if (act === 'edit') {
        loadDraft(id);
        $('#tabs .tab[data-tab="mixer"]').click();
      } else if (act === 'use') {
        try {
          setBusy(true);
          await Bridge.cli(['assign-all', id]);
          S.slots = {};
          SLOTS.forEach(function (k) { S.slots[k] = { curve: id }; });
          S.backendSlots = cloneSlots(S.slots);
          await applyConfig({ askReload: false });
          loadDraft(id);
          setBusy(false);
        } catch (err) {
          setBusy(false);
          toast(err.message || String(err), 'err');
        }
      } else if (act === 'export') {
        exportCurve(id);
      } else if (act === 'delete') {
        var c = curveById(id);
        var ok = await modalConfirm('删除曲线', '确定删除「' + (c ? c.name : id) + '」？', '删除', true);
        if (!ok) return;
        try {
          await Bridge.cli(['delete-curve', id]);
          if (S.draft.baseId === id) initDraft();
          await refreshAll(true, true);
          toast('已删除', 'ok');
        } catch (err) {
          toast(err.message || String(err), 'err');
        }
      }
    });
  }

  function bindProps() {
    $('#btnPropsReload').addEventListener('click', function () {
      refreshAll(true).then(function () { toast('已重新读取', 'ok'); }).catch(function () {});
    });
    $('#btnPropsSave').addEventListener('click', async function () {
      if (S.busy) return;
      var inputs = $$('#propsWrap [data-prop]');
      var changes = [];
      for (var i = 0; i < inputs.length; i++) {
        var inp = inputs[i];
        var key = inp.dataset.prop;
        var p = S.props.filter(function (x) { return x.key === key; })[0];
        if (!p) continue;
        var val = inp.type === 'checkbox' ? (inp.checked ? '1' : '0') : inp.value.trim();
        if (val === p.value) continue;
        if (p.type === 'int' && !/^-?\d+$/.test(val)) {
          toast('「' + key + '」需要整数', 'err');
          return;
        }
        changes.push([key, val]);
      }
      if (!changes.length) { toast('没有需要保存的修改', 'ok'); return; }
      try {
        setBusy(true);
        /* 一次 exec 批量写入 + 应用，替代逐项往返 */
        var pairs = changes.map(function (c) { return c[0] + '=' + c[1]; });
        await Bridge.cli(['set-props'].concat(pairs));
        await refreshAll(true, true);
        setBusy(false);
        toast('已保存并应用 ' + changes.length + ' 项属性', 'ok');
      } catch (e) {
        setBusy(false);
        toast(e.message || String(e), 'err');
      }
    });
  }

  function bindLog() {
    $('#btnLogReload').addEventListener('click', refreshLog);
    $('#autoLog').addEventListener('change', function (e) {
      S.logAuto = e.target.checked;
      syncLogTimer();
      if (S.logAuto && isActiveView('log')) refreshLog();
      $('#logMeta').textContent = '自动刷新 ' + (S.logAuto ? '开（4s）' : '关');
    });
  }

  /* ---------------- 初始化失败面板 ---------------- */
  async function showFatal(err) {
    var panel = $('#fatalPanel');
    if (!panel) return;
    $('#tabs').style.display = 'none';
    panel.hidden = false;
    $('#fatalMsg').textContent = String((err && err.message) || err);
    Bridge.beacon('fatal: ' + String((err && err.message) || err).slice(0, 180));
    $('#fatalDiag').textContent = '正在收集诊断信息…';
    try {
      var diag = await Bridge.diagnose();
      diag.time = new Date().toISOString();
      $('#fatalDiag').textContent = JSON.stringify(diag, null, 2);
    } catch (e) {
      $('#fatalDiag').textContent = '诊断收集失败：' + String((e && e.message) || e);
    }
    panel.scrollIntoView({ block: 'start' });
  }

  function bindFatal() {
    var retry = $('#btnFatalRetry');
    if (retry) retry.addEventListener('click', function () {
      $('#fatalPanel').hidden = true;
      $('#tabs').style.display = '';
      boot();
    });
    var copy = $('#btnFatalCopy');
    if (copy) copy.addEventListener('click', function () {
      var text = $('#fatalMsg').textContent + '\n' + $('#fatalDiag').textContent;
      var done = function () { toast('诊断信息已复制', 'ok'); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text); });
      } else {
        fallbackCopy(text);
      }
    });
    function fallbackCopy(text) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        toast('诊断信息已复制', 'ok');
      } catch (e) { toast('复制失败，请手动选择文本', 'err'); }
    }
  }

  /* ---------------- 启动 ---------------- */
  function trackTopbar() {
    var bar = document.querySelector('.topbar');
    if (!bar) return;
    function apply() {
      document.documentElement.style.setProperty('--topbar-h', bar.offsetHeight + 'px');
    }
    apply();
    if (window.ResizeObserver) new ResizeObserver(apply).observe(bar);
    window.addEventListener('resize', apply);
  }

  /* 等一帧真正上屏（ksu.exec 是同步阻塞的，先让骨架画完） */
  function nextPaint() {
    return new Promise(function (resolve) {
      if (window.requestAnimationFrame) {
        requestAnimationFrame(function () { setTimeout(resolve, 0); });
      } else {
        setTimeout(resolve, 0);
      }
    });
  }

  /* 单个可选控件缺失（如旧缓存 HTML）不应打断骨架与 20 段增益渲染 */
  function safe(fn, name) {
    try {
      fn();
    } catch (e) {
      if (window.console && console.warn) {
        console.warn('[k100pm] init ' + name + ' failed: ' + (e && e.message));
      }
    }
  }

  async function boot() {
    trackTopbar();
    if (S.preview) $('#previewBanner').hidden = false;
    safe(bindTabs, 'tabs');
    safe(bindHeader, 'header');
    safe(bindMixer, 'mixer');
    safe(bindLibrary, 'library');
    safe(bindProps, 'props');
    safe(bindLog, 'log');
    safe(bindOtg, 'otg');
    safe(bindFatal, 'fatal');

    $('#modalCancel').addEventListener('click', function () { closeModal(null); });
    $('#modalRoot').addEventListener('click', function (e) {
      if (e.target.dataset.close) closeModal(null);
    });
    $('#modalOk').addEventListener('click', function () {
      var inp = $('#modalInput');
      closeModal(inp.hidden ? true : inp.value);
    });
    $('#modalInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') $('#modalOk').click();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('#modalRoot').hidden) closeModal(null);
    });

    /* ---- 骨架先行：不等 shell 往返，先把可交互界面画出来 ---- */
    S.freqs = DEFAULT_FREQS.slice();
    S.draft = {
      gains: new Array(20).fill(0),
      baseId: '',
      name: '读取中…',
      baseline: new Array(20).fill(0)
    };
    buildBands();
    S.graph = new EQGraph($('#curveCanvas'), {
      freqs: S.freqs,
      gains: S.draft.gains,
      onChange: function (gains, idx) {
        S.draft.gains = gains;
        if (idx >= 0) updateBandRow(idx, gains[idx]);
        updateReadout();
        renderApplyBar();
      },
      onHover: function (idx, cents, x, y) {
        S.hover = { idx: idx, cents: cents, x: x, y: y };
        if (S.hoverRaf) return;
        S.hoverRaf = requestAnimationFrame(function () {
          S.hoverRaf = 0;
          var h = S.hover, tip = $('#curveTip');
          if (!h) return;
          if (h.idx < 0) { tip.hidden = true; return; }
          tip.hidden = false;
          tip.textContent = S.freqs[h.idx] + ' Hz · ' + fmtDb(h.cents) + ' dB';
          /* transform 定位：不触发布局（旧版改 left/top 会每帧 reflow） */
          var gx = clamp(h.x, 60, (S.graph ? S.graph.w : 320) - 60);
          tip.style.transform = 'translate(-50%,-130%) translate(' + gx + 'px,' + h.y + 'px)';
        });
      }
    });
    renderMixer();

    /* 让浏览器先渲染一帧骨架，再执行会阻塞 UI 线程的 ksu.exec */
    await nextPaint();

    try {
      await refreshAll(false);
    } catch (e) {
      Bridge.beacon('boot fail: ' + String((e && e.message) || e));
      $('#statusChips').innerHTML = '<span class="chip bad"><i></i>初始化失败</span>';
      toast('初始化失败：' + (e.message || e), 'err');
      showFatal(e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
