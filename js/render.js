/* ============================================================
   TacticFlow — 渲染引擎 v3
   地图图片背景 + 三种画笔拖拽绘制
   ============================================================ */

const Renderer = {
  _imgCache: {},

  _getMapImage(mapKey, cb) {
    if (this._imgCache[mapKey]) { cb(this._imgCache[mapKey]); return; }
    const img = new Image();
    img.onload = () => { this._imgCache[mapKey] = img; cb(img); };
    img.onerror = () => cb(null);
    img.src = `img/maps/${mapKey}.jpg`;
  },

  C: {
    ctArrow: '#3878C8',
    ctCircle: '#3878C8',
    ctWall: '#3878C8',
    tArrow: '#F5C842',
    tCircle: '#F5C842',
    tWall: '#F5C842',
    bg: '#0d1117',
    grid: 'rgba(48,54,61,0.2)',
  },

  /** 根据 side 取颜色 */
  _colorFor(type, side) {
    const isT = side === 'T';
    switch (type) {
      case 'arrow': return isT ? this.C.tArrow : this.C.ctArrow;
      case 'circle': return isT ? this.C.tCircle : this.C.ctCircle;
      case 'wall': return isT ? this.C.tWall : this.C.ctWall;
      default: return '#58a6ff';
    }
  },

  /** 画首页地图卡片 */
  renderMapCard(canvas, mapKey) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    this._getMapImage(mapKey, (img) => {
      ctx.fillStyle = this.C.bg; ctx.fillRect(0, 0, w, h);
      if (img) ctx.drawImage(img, 0, 0, w, h);
    });
  },

  /** 画主画板：地图背景 + 所有已确认标记 */
  renderMainCanvas(canvas, mapKey, marks) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = this.C.bg; ctx.fillRect(0, 0, w, h);

    this._getMapImage(mapKey, (img) => {
      ctx.fillStyle = this.C.bg; ctx.fillRect(0, 0, w, h);
      if (img) ctx.drawImage(img, 0, 0, w, h);
      this._drawGrid(ctx, w, h, 80);
      if (marks) marks.forEach(m => this._drawMark(ctx, m));
    });
  },

  /** 画单条标记 */
  _drawMark(ctx, m) {
    ctx.save();
    const color = m.color || this._colorFor(m.type, m.side);
    switch (m.type) {
      case 'arrow':
        this._drawArrow(ctx, m.x1, m.y1, m.x2, m.y2, color, m.side);
        break;
      case 'circle':
      case 'smoke':
      case 'flash':
      case 'molotov':
      case 'nade':
        this._drawCircleShape(ctx, m.cx, m.cy, m.r, color, m.side, m.type);
        break;
      case 'wall':
        this._drawWall(ctx, m.x1, m.y1, m.x2, m.y2, color, m.side);
        break;
    }
    ctx.restore();
  },

  _drawGrid(ctx, w, h, step) {
    ctx.strokeStyle = this.C.grid; ctx.lineWidth = 0.5;
    for (let x = 0; x < w; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  },

  /** 箭头：从 (x1,y1)→(x2,y2)，带三角箭头 */
  _drawArrow(ctx, x1, y1, x2, y2, color, side) {
    const a = Math.atan2(y2 - y1, x2 - x1), head = 10;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - head * Math.cos(a - 0.45), y2 - head * Math.sin(a - 0.45));
    ctx.lineTo(x2 - head * Math.cos(a + 0.45), y2 - head * Math.sin(a + 0.45));
    ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    // 起点小圆
    ctx.beginPath(); ctx.arc(x1, y1, 3.5, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
    // side 标签
    if (side) {
      ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(side, (x1 + x2) / 2, (y1 + y2) / 2 - 8);
    }
  },

  /** 圆形/道具 */
  _drawCircleShape(ctx, cx, cy, r, color, side, type) {
    const isUtil = ['smoke', 'flash', 'molotov', 'nade'].includes(type);

    // 道具半径上限更小
    if (isUtil) r = Math.min(r, 40);
    else r = Math.min(r, 80);

    if (type === 'flash') {
      // 闪光弹 → 爆开位置点
      ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(245,200,66,0.5)';
      ctx.fill();
      ctx.strokeStyle = '#F5C842';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#F5C842';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚡', cx, cy - 12);
    } else if (type === 'smoke') {
      // 烟雾弹 → 灰色雾状圆
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(136,136,136,0.25)';
      ctx.fill();
      ctx.strokeStyle = '#999';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ccc';
      ctx.font = `${Math.max(12, r * 0.35)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('💨', cx, cy);
    } else if (type === 'molotov') {
      // 燃烧弹 → 橙色火焰圆
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(232,117,26,0.2)';
      ctx.fill();
      ctx.strokeStyle = '#E8751A';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#E8751A';
      ctx.font = `${Math.max(12, r * 0.35)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🔥', cx, cy);
    } else if (type === 'nade') {
      // 手雷 → 红色爆炸圆
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(209,56,56,0.2)';
      ctx.fill();
      ctx.strokeStyle = '#D13838';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      // 爆炸星形
      this._drawStar(ctx, cx, cy, 4, r * 0.4, r * 0.18);
    } else {
      // 普通圆圈
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      const alpha = color.startsWith('#') ? color + '33' : 'rgba(88,166,255,0.2)';
      ctx.fillStyle = alpha; ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
    }

    // 中心点 + 标签
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
    if (side) {
      ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(side, cx, cy - r - 6);
    }
  },

  /** 墙壁/防线：从 (x1,y1)→(x2,y2)，两端短竖线 */
  _drawWall(ctx, x1, y1, x2, y2, color, side) {
    const a = Math.atan2(y2 - y1, x2 - x1), halfW = 8;
    const cos = Math.cos(a), sin = Math.sin(a);
    // 主线
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.stroke();
    // 两端短竖
    ctx.lineWidth = 3;
    const drawCap = (x, y) => {
      const px = -sin * halfW, py = cos * halfW;
      ctx.beginPath(); ctx.moveTo(x + px, y + py); ctx.lineTo(x - px, y - py); ctx.stroke();
    };
    drawCap(x1, y1); drawCap(x2, y2);
    // 小点
    ctx.beginPath(); ctx.arc(x1, y1, 3, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
    if (side) {
      ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(side, (x1 + x2) / 2, (y1 + y2) / 2 - 10);
    }
  },

  /** 绘制拖拽预览（半透明） */
  drawPreview(ctx, tool, params, side) {
    ctx.save(); ctx.globalAlpha = 0.55;
    const m = { type: tool, ...params, side };
    this._drawMark(ctx, m);
    ctx.restore();
  },

  // ---- 分析图表 ----
  renderRadar(canvas, dims) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height, cx = w / 2, cy = h / 2, maxR = Math.min(w, h) / 2 - 30;
    const labels = ['控图覆盖', '投掷效率', '影响力', '时间窗口', '风险(R)'];
    const vals = [dims.mapControl, dims.utilityEfficiency, dims.influenceOverlap, dims.timeWindow, 100 - dims.riskLevel];
    ctx.clearRect(0, 0, w, h);
    for (let lv = 1; lv <= 5; lv++) {
      const r = maxR / 5 * lv; ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = Math.PI * 2 / 5 * i - Math.PI / 2, px = cx + r * Math.cos(a), py = cy + r * Math.sin(a);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.strokeStyle = '#252d3a'; ctx.lineWidth = 0.5; ctx.stroke();
    }
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * 2 / 5 * i - Math.PI / 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + maxR * Math.cos(a), cy + maxR * Math.sin(a)); ctx.strokeStyle = '#252d3a'; ctx.stroke();
    }
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * 2 / 5 * i - Math.PI / 2, r = vals[i] / 100 * maxR;
      i === 0 ? ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a)) : ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    ctx.closePath(); ctx.fillStyle = 'rgba(88,166,255,0.15)'; ctx.fill(); ctx.strokeStyle = '#58a6ff'; ctx.lineWidth = 2; ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * 2 / 5 * i - Math.PI / 2, r = vals[i] / 100 * maxR;
      ctx.beginPath(); ctx.arc(cx + r * Math.cos(a), cy + r * Math.sin(a), 3.5, 0, Math.PI * 2); ctx.fillStyle = '#58a6ff'; ctx.fill();
    }
    ctx.fillStyle = '#8b949e'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * 2 / 5 * i - Math.PI / 2;
      ctx.fillText(labels[i], cx + (maxR + 22) * Math.cos(a), cy + (maxR + 22) * Math.sin(a) + 3);
    }
  },

  renderBarChart(canvas, data) {
    const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
    if (!entries.length) { ctx.fillStyle = '#8b949e'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('暂无数据', w / 2, h / 2); return; }
    const maxV = Math.max(...entries.map(e => e[1]), 1), barW = Math.min(28, (w - 70) / entries.length), chartH = h - 28;
    entries.forEach((e, i) => {
      const bh = e[1] / maxV * chartH, x = 35 + i * (barW + 7), y = h - bh - 16;
      ctx.fillStyle = '#58a6ff'; ctx.fillRect(x, y, barW, bh);
      ctx.fillStyle = '#8b949e'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(e[0], x + barW / 2, h - 4); ctx.fillText(e[1], x + barW / 2, y - 4);
    });
  },

  renderTacticThumbnail(canvas, mapKey, marks) {
    const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height, s = Math.min(w, h) / 800;
    this._getMapImage(mapKey, (img) => {
      ctx.fillStyle = this.C.bg; ctx.fillRect(0, 0, w, h);
      if (img) ctx.drawImage(img, 0, 0, w, h);
      if (marks) marks.forEach(m => {
        const sm = { ...m };
        for (const k of ['x1', 'y1', 'x2', 'y2', 'cx', 'cy']) if (sm[k] !== undefined) sm[k] *= s;
        if (sm.r !== undefined) sm.r *= s;
        this._drawMark(ctx, sm);
      });
    });
  },
};