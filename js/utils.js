/* ============================================================
   TacticFlow — 通用工具函数
   ============================================================ */

const Utils = {
  // ---- DOM 快捷操作 ----
  $(id) {
    return document.getElementById(id);
  },

  // ---- 随机整数 [min, max] ----
  randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  // ---- 随机浮点数 ----
  randFloat(min, max) {
    return Math.random() * (max - min) + min;
  },

  // ---- 数组随机取一项 ----
  pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  },

  // ---- 数组洗牌 ----
  shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

  // ---- 两坐标点距离 ----
  distance(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  },

  // ---- 角度转弧度 ----
  degToRad(deg) {
    return (deg * Math.PI) / 180;
  },

  // ---- 坐标旋转 ----
  rotatePoint(px, py, cx, cy, angleRad) {
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const dx = px - cx;
    const dy = py - cy;
    return {
      x: cx + dx * cos - dy * sin,
      y: cy + dx * sin + dy * cos,
    };
  },

  // ---- 限制数值范围 ----
  clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  },

  // ---- 显示弹窗 ----
  showModal(id) {
    const modal = this.$(id);
    if (modal) modal.classList.add('active');
  },

  // ---- 隐藏弹窗 ----
  hideModal(id) {
    const modal = this.$(id);
    if (modal) modal.classList.remove('active');
  },

  // ---- 显示页面 ----
  showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const page = this.$(id);
    if (page) page.classList.add('active');
  },

  // ---- 格式化金钱 ----
  formatMoney(val) {
    return '$' + val.toLocaleString();
  },

  // ---- Canvas 清除 ----
  clearCanvas(canvasId) {
    const c = this.$(canvasId);
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
  },

  // ---- 时间戳转 MM:SS ----
  formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  },
};

// 快捷别名
const $ = (id) => Utils.$(id);