/* ============================================================
   graph.js — 可交互 20 段频响曲线（Canvas）
   ------------------------------------------------------------
   性能要点：
     · devicePixelRatio 封顶 2x（3x 屏像素量减少约 44%，肉眼差异极小）
     · 网格/刻度预渲染到离屏 canvas，每帧只 drawImage，不再逐帧画 10 条线 + 14 段文字
     · 去掉 shadowBlur（移动端 GPU 上极其昂贵），改用"宽淡描边 + 细实描边"两层
     · resize 去抖 + 尺寸未变直接跳过
   ============================================================ */
(function (global) {
  'use strict';

  var COLS = {
    accent: '#4fd1ff',
    accent2: '#a78bfa',
    grid: 'rgba(255,255,255,.055)',
    gridStrong: 'rgba(255,255,255,.10)',
    zero: 'rgba(120,200,255,.28)',
    text: 'rgba(150,168,190,.9)',
    textDim: 'rgba(120,138,160,.68)'
  };
  var DB_LIMIT = 20;      /* 可编辑上限 ±20 dB */
  var F_MIN = 20, F_MAX = 20000;
  var DPR_MAX = 2;

  function dprOf() {
    return Math.min(global.devicePixelRatio || 1, DPR_MAX);
  }

  function EQGraph(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = opts || {};
    this.freqs = this.opts.freqs || [];
    this.gains = this.opts.gains || [];
    this.reference = null;
    this.showRef = true;
    this.hover = -1;
    this.drag = -1;
    this.pad = { l: 36, r: 14, t: 18, b: 24 };
    this.range = 6;          /* 当前坐标纵向量程 ±range dB，按数据自适应 */
    this.dpr = 1;
    this.w = 600;
    this.h = 300;
    this._raf = 0;
    this._grad = null;
    this._gradKey = '';
    this._static = null;
    this._staticKey = '';
    this._resized = false;
    this._bind();
    this.resize();
  }

  EQGraph.prototype._bind = function () {
    var self = this;
    var c = this.canvas;

    function pos(e) {
      var r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function nearest(p) {
      var best = -1, bestD = 30;
      for (var i = 0; i < self.freqs.length; i++) {
        var dx = Math.abs(self.xOf(self.freqs[i]) - p.x);
        if (dx < bestD) { bestD = dx; best = i; }
      }
      return best;
    }

    c.addEventListener('pointerdown', function (e) {
      var p = pos(e);
      var idx = nearest(p);
      if (idx < 0) return;
      self.drag = idx;
      c.setPointerCapture(e.pointerId);
      self._setFromY(idx, p.y);
      e.preventDefault();
    });

    c.addEventListener('pointermove', function (e) {
      var p = pos(e);
      if (self.drag >= 0) {
        self._setFromY(self.drag, p.y);
        e.preventDefault();
        return;
      }
      var idx = nearest(p);
      if (idx !== self.hover) {
        self.hover = idx;
        self._queueDraw();
      }
      if (self.opts.onHover) {
        self.opts.onHover(idx, idx >= 0 ? self.gains[idx] : 0, p.x, p.y);
      }
    });

    function end(e) {
      if (self.drag < 0) return;
      self.drag = -1;
      try { c.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      self._queueDraw();
      if (self.opts.onDragEnd) self.opts.onDragEnd();
    }
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);

    c.addEventListener('pointerleave', function () {
      if (self.drag >= 0) return;
      if (self.hover !== -1) { self.hover = -1; self._queueDraw(); }
      if (self.opts.onHover) self.opts.onHover(-1, 0, 0, 0);
    });

    c.addEventListener('dblclick', function (e) {
      var p = pos(e);
      var idx = nearest(p);
      if (idx < 0) return;
      self.gains[idx] = 0;
      self._recalcRange();
      self._queueDraw();
      if (self.opts.onChange) self.opts.onChange(self.gains, idx);
    });

    if (global.ResizeObserver) {
      var pending = 0;
      this._ro = new ResizeObserver(function () {
        if (pending) return;
        pending = (global.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); })(function () {
          pending = 0;
          self.resize();
        });
      });
      this._ro.observe(c.parentElement || c);
    } else {
      global.addEventListener('resize', function () { self.resize(); });
    }
  };

  EQGraph.prototype._queueDraw = function () {
    if (this._raf) return;
    var self = this;
    var raf = global.requestAnimationFrame ?
      function (fn) { return global.requestAnimationFrame(fn); } :
      function (fn) { return setTimeout(fn, 16); };
    this._raf = raf(function () { self._raf = 0; self.draw(); });
  };

  EQGraph.prototype.setGains = function (gains) {
    this.gains = gains;
    this._recalcRange();
    this._queueDraw();
  };

  EQGraph.prototype._setFromY = function (idx, y) {
    var db = this.range - (y - this.pad.t) / this.innerH() * this.range * 2;
    db = Math.max(-DB_LIMIT, Math.min(DB_LIMIT, db));
    var centi = Math.round(db * 100);
    if (this.gains[idx] === centi) return;
    this.gains[idx] = centi;
    this._recalcRange();
    this._queueDraw();
    if (this.opts.onChange) this.opts.onChange(this.gains, idx);
  };

  EQGraph.prototype._recalcRange = function () {
    var m = 0;
    for (var i = 0; i < this.gains.length; i++) m = Math.max(m, Math.abs(this.gains[i] || 0));
    if (this.showRef && this.reference) {
      for (var j = 0; j < this.reference.length; j++) m = Math.max(m, Math.abs(this.reference[j] || 0));
    }
    var need = (m / 100) * 1.28;
    var r = 3;
    if (need > 3) r = 6;
    if (need > 6) r = 9;
    if (need > 9) r = 12;
    if (need > 12) r = 15;
    if (need > 15) r = 20;
    this.range = r;
  };

  EQGraph.prototype.resize = function () {
    var c = this.canvas;
    var cssW = c.clientWidth || (c.parentElement ? c.parentElement.clientWidth : 0) || 600;
    var cssH = c.clientHeight || 300;
    var dpr = dprOf();
    if (this._resized && this.w === cssW && this.h === cssH && this.dpr === dpr) return;
    this._resized = true;
    this.dpr = dpr;
    this.w = cssW;
    this.h = cssH;
    c.width = Math.max(1, Math.round(cssW * dpr));
    c.height = Math.max(1, Math.round(cssH * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._staticKey = '';
    this.draw();
  };

  EQGraph.prototype.innerW = function () { return Math.max(10, this.w - this.pad.l - this.pad.r); };
  EQGraph.prototype.innerH = function () { return Math.max(10, this.h - this.pad.t - this.pad.b); };

  EQGraph.prototype.xOf = function (f) {
    var t = Math.log10(f / F_MIN) / Math.log10(F_MAX / F_MIN);
    return this.pad.l + t * this.innerW();
  };
  EQGraph.prototype.yOf = function (centi) {
    var db = Math.max(-this.range, Math.min(this.range, centi / 100));
    return this.pad.t + (this.range - db) / (this.range * 2) * this.innerH();
  };

  EQGraph.prototype.setData = function (d) {
    if (d.freqs) this.freqs = d.freqs;
    if (d.gains) { this.gains = d.gains; this._recalcRange(); }
    if (typeof d.showRef === 'boolean') this.showRef = d.showRef;
    if ('reference' in d) this.reference = d.reference;
    this._queueDraw();
  };

  /* 网格 / 刻度离屏层：只在尺寸或纵向量程变化时重画一次 */
  EQGraph.prototype._staticLayer = function () {
    var key = this.w + 'x' + this.h + '@' + this.dpr + 'r' + this.range;
    if (this._static && this._staticKey === key) return this._static;
    var cv = this._static || (this._static = document.createElement('canvas'));
    cv.width = Math.max(1, Math.round(this.w * this.dpr));
    cv.height = Math.max(1, Math.round(this.h * this.dpr));
    var g = cv.getContext('2d');
    var w = this.w, h = this.h, pad = this.pad;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    var freqs = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    g.lineWidth = 1;
    g.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'top';
    for (var i = 0; i < freqs.length; i++) {
      var x = this.xOf(freqs[i]);
      g.strokeStyle = COLS.grid;
      g.beginPath(); g.moveTo(x, pad.t); g.lineTo(x, h - pad.b); g.stroke();
      g.fillStyle = COLS.textDim;
      var lab = freqs[i] >= 1000 ? (freqs[i] / 1000) + 'k' : String(freqs[i]);
      g.fillText(lab, x, h - pad.b + 6);
    }

    g.textAlign = 'right';
    g.textBaseline = 'middle';
    var R = this.range;
    for (var k = -4; k <= 4; k++) {
      var db = (R / 4) * k;
      var y = this.yOf(db * 100);
      var major = (k % 2 === 0);
      g.strokeStyle = db === 0 ? COLS.zero : (major ? COLS.grid : 'rgba(255,255,255,.028)');
      g.beginPath(); g.moveTo(pad.l, y); g.lineTo(w - pad.r, y); g.stroke();
      if (major) {
        g.fillStyle = db === 0 ? 'rgba(160,220,255,.7)' : COLS.textDim;
        g.fillText((db > 0 ? '+' : '') + (Math.round(db * 10) / 10), pad.l - 7, y);
      }
    }
    this._staticKey = key;
    return cv;
  };

  EQGraph.prototype.draw = function () {
    var g = this.ctx;
    if (!g || this.w < 20 || this.h < 40) return;
    var w = this.w, h = this.h, pad = this.pad;
    g.clearRect(0, 0, w, h);
    g.drawImage(this._staticLayer(), 0, 0, w, h);

    /* ---- 参考曲线 ---- */
    if (this.showRef && this.reference && this.reference.length) {
      g.save();
      g.setLineDash([5, 4]);
      g.strokeStyle = 'rgba(167,139,250,.72)';
      g.lineWidth = 1.6;
      g.beginPath();
      for (var r = 0; r < this.reference.length; r++) {
        var rx = this.xOf(this.freqs[r]), ry = this.yOf(this.reference[r]);
        if (r === 0) g.moveTo(rx, ry); else g.lineTo(rx, ry);
      }
      g.stroke();
      g.restore();
    }

    /* ---- 当前曲线 ---- */
    var pts = [];
    for (var k = 0; k < this.gains.length; k++) {
      pts.push([this.xOf(this.freqs[k]), this.yOf(this.gains[k])]);
    }
    if (!pts.length) return;
    var zeroY = this.yOf(0);

    var gkey = w + 'x' + h + 'r' + this.range;
    if (!this._grad || this._gradKey !== gkey) {
      this._grad = g.createLinearGradient(0, pad.t, 0, h - pad.b);
      this._grad.addColorStop(0, 'rgba(79,209,255,.30)');
      this._grad.addColorStop(.55, 'rgba(79,209,255,.10)');
      this._grad.addColorStop(1, 'rgba(79,209,255,0)');
      this._gradKey = gkey;
    }

    g.beginPath();
    g.moveTo(pts[0][0], zeroY);
    for (var a = 0; a < pts.length; a++) g.lineTo(pts[a][0], pts[a][1]);
    g.lineTo(pts[pts.length - 1][0], zeroY);
    g.closePath();
    g.fillStyle = this._grad;
    g.fill();

    g.beginPath();
    for (var b = 0; b < pts.length; b++) {
      if (b === 0) g.moveTo(pts[b][0], pts[b][1]);
      else g.lineTo(pts[b][0], pts[b][1]);
    }
    g.lineJoin = 'round';
    /* 两层描边代替 shadowBlur：宽淡光晕 + 细实线 */
    g.strokeStyle = 'rgba(79,209,255,.16)';
    g.lineWidth = 7;
    g.stroke();
    g.strokeStyle = COLS.accent;
    g.lineWidth = 2.2;
    g.stroke();

    /* ---- 节点 ---- */
    for (var n = 0; n < pts.length; n++) {
      var active = (n === this.drag || n === this.hover);
      var rad = active ? 5.6 : 4.2;
      g.beginPath();
      g.arc(pts[n][0], pts[n][1], rad, 0, Math.PI * 2);
      g.fillStyle = active ? '#eafcff' : 'rgba(10,20,28,.92)';
      g.fill();
      g.lineWidth = active ? 2 : 1.7;
      g.strokeStyle = active ? COLS.accent : 'rgba(79,209,255,.85)';
      g.stroke();
      if (active) {
        g.beginPath();
        g.arc(pts[n][0], pts[n][1], rad + 5, 0, Math.PI * 2);
        g.strokeStyle = 'rgba(79,209,255,.25)';
        g.lineWidth = 1;
        g.stroke();
      }
    }
  };

  /* ---------- 迷你曲线（曲线库卡片） ---------- */
  function sparkline(canvas, freqs, gains, color) {
    var dpr = dprOf();
    var w = canvas.clientWidth || 240, h = canvas.clientHeight || 64;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    var m = 0;
    for (var q = 0; q < gains.length; q++) m = Math.max(m, Math.abs(gains[q] || 0));
    var max = Math.max(1.5, Math.min(20, Math.ceil((m / 100) * 1.3 / 1.5) * 1.5)), pad = 6;
    function x(f) { return pad + Math.log10(f / 20) / Math.log10(1000) * (w - pad * 2); }
    function y(c) {
      var db = Math.max(-max, Math.min(max, c / 100));
      return pad + (max - db) / (max * 2) * (h - pad * 2);
    }

    g.strokeStyle = 'rgba(255,255,255,.07)';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(pad, y(0)); g.lineTo(w - pad, y(0)); g.stroke();

    g.beginPath();
    for (var i = 0; i < gains.length; i++) {
      var px = x(freqs[i]), py = y(gains[i]);
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    var c1 = color || 'rgba(79,209,255,.95)';
    g.strokeStyle = c1;
    g.lineWidth = 1.7;
    g.stroke();

    g.lineTo(x(freqs[freqs.length - 1]), y(0));
    g.lineTo(x(freqs[0]), y(0));
    g.closePath();
    g.fillStyle = color || 'rgba(79,209,255,.14)';
    g.globalAlpha = .16;
    g.fill();
    g.globalAlpha = 1;
  }

  global.EQGraph = EQGraph;
  global.EQSpark = sparkline;
})(window);
