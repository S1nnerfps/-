/* ============================================================
   TacticFlow — 主控逻辑 v5 | 精简版
   画板交互 / 标记管理 / API 分析 / 战术持久化
   ============================================================ */

const App = {
  mapKey: null, mode: 'match', tool: null, side: 'CT',
  marks: [], savedTactics: [], drawing: false, dragStart: null, dragData: null,
  draggingMarkIdx: -1, dragOffset: null, dragType: null, suggestedMarks: [], _optMarks: null,

  init() {
    this._loadTactics();
    this._bindEvents();
    Utils.showPage('page-home');
  },

  _loadTactics() { try { this.savedTactics = JSON.parse(localStorage.tacticflow_tactics || '[]'); } catch { this.savedTactics = []; } },
  _saveTactics() { localStorage.tacticflow_tactics = JSON.stringify(this.savedTactics); },

  // ==================== 全局事件绑定 ====================
  _bindEvents() {
    // 首页 — 生成地图卡片
    this._buildMapCards();
    $('map-grid').addEventListener('click', e => { const el = e.target.closest('.map-card'); if (el) this._showMapDialog(el.dataset.k); });
    $('btn-open-editor').onclick = () => this.savedTactics.length ? this._showTacticListDialog() : this._openEditor('mirage');
    $('btn-open-datacenter').onclick = () => this._openDatacenter();
    $('btn-open-api-settings').onclick = () => this._showAPISettings();

    // 画板通用
    document.querySelectorAll('.brush-btn').forEach(b => b.addEventListener('click', () => this._selectTool(b)));
    $('btn-undo').onclick = () => { this.marks.pop(); this._redraw(); };
    $('btn-clear-all').onclick = () => { if (confirm('清空所有？')) { this.marks = []; this.suggestedMarks = []; this._redraw(); } };
    document.querySelectorAll('.btn-side').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('.btn-side').forEach(bb => bb.classList.remove('active')); b.classList.add('active'); this.side = b.dataset.side; }));
    $('btn-canvas-back').onclick = () => Utils.showPage('page-home');
    [$('btn-quick-analysis'), $('btn-end-round')].forEach(b => b && (b.onclick = () => this._showQuick()));
    [$('btn-deep-analysis'), $('btn-pause')].forEach(b => b && (b.onclick = () => this._showDeep()));
    $('btn-save-tactic').onclick = () => this._saveTactic();
    $('btn-load-tactic').onclick = () => this._showTacticListDialog();
    $('btn-ai-evaluate').onclick = () => this._showAIEvaluate();
    $('btn-ai-optimize').onclick = () => this._doAIOptimize();

    // Canvas 绘图
    const c = $('canvas-main');
    c.addEventListener('mousedown', e => this._onDown(e));
    c.addEventListener('mousemove', e => this._onMove(e));
    c.addEventListener('mouseup', () => this._onUp());
    c.addEventListener('mouseleave', () => { if (this.drawing || this.draggingMarkIdx >= 0) this._onUp(); });
    c.addEventListener('contextmenu', e => { e.preventDefault(); this.marks.pop(); this._redraw(); });
    c.addEventListener('touchstart', e => { e.preventDefault(); this._onDown(e.touches[0]); });
    c.addEventListener('touchmove', e => { e.preventDefault(); this._onMove(e.touches[0]); });
    c.addEventListener('touchend', () => this._onUp());

    // 弹窗
    $('btn-qa-ignore').onclick = () => Utils.hideModal('modal-quick-analysis');
    $('btn-qa-adopt').onclick = () => Utils.hideModal('modal-quick-analysis');
    $('btn-deep-close').onclick = () => Utils.hideModal('modal-deep-analysis');
    $('btn-deep-export').onclick = () => { Utils.hideModal('modal-deep-analysis'); this._openEditor(this.mapKey); };
    $('btn-eval-close').onclick = () => Utils.hideModal('modal-ai-eval');
    $('btn-eval-optimize').onclick = () => this._doAIOptimize();
    $('btn-compare-keep').onclick = () => Utils.hideModal('modal-ai-compare');
    $('btn-compare-adopt').onclick = () => { if (this._optMarks) { this.marks = this._optMarks; this._optMarks = null; this._redraw(); } Utils.hideModal('modal-ai-compare'); };
    document.querySelectorAll('.modal-overlay').forEach(o => o.addEventListener('click', e => { if (e.target === o) o.classList.remove('active'); }));

    // API 设置
    $('btn-api-save').onclick = () => { const cfg = this._readAPIConfig(); APIService.saveConfig(cfg); Utils.hideModal('modal-api-settings'); };
    $('btn-api-cancel').onclick = () => Utils.hideModal('modal-api-settings');
    $('btn-test-api').onclick = async () => { const cfg = this._readAPIConfig(); if (!cfg.apiKey) return; this._setAPIStatus('测试中...', 'loading'); const ok = await APIService.testConnection(cfg); this._setAPIStatus(ok ? '✅ 连接成功' : '❌ 连接失败', ok ? 'success' : 'error'); };
    $('api-provider').onchange = () => { const p = $('api-provider').value, info = APIService.providers[p]; $('api-model').innerHTML = info.models.map(m => `<option value="${m}">${m}</option>`).join(''); $('api-endpoint').value = info.defaultEndpoint; };

    // 深度分析 Tab + 数据中心返回
    document.querySelectorAll('.deep-tab').forEach(t => t.addEventListener('click', () => { document.querySelectorAll('.deep-tab').forEach(tt => tt.classList.remove('active')); t.classList.add('active'); document.querySelectorAll('.deep-panel').forEach(p => p.style.display = 'none'); $(t.dataset.tab === 'profile' ? 'deep-profile' : 'deep-tactics').style.display = 'block'; }));
    $('btn-dc-back').onclick = () => Utils.showPage('page-home');
  },

  // ==================== 首页 ====================
  _buildMapCards() {
    const grid = $('map-grid');
    if (grid.children.length) return;
    getMapKeys().forEach(key => {
      const md = getMap(key);
      const card = document.createElement('div');
      card.className = 'map-card';
      card.dataset.k = key;
      card.innerHTML = `<canvas width="180" height="120"></canvas><div class="map-card-name">${md.name}</div>`;
      grid.appendChild(card);
      setTimeout(() => Renderer.renderMapCard(card.querySelector('canvas'), key), 80);
    });
  },

  _showMapDialog(k) {
    const md = getMap(k);
    this._dialog(`${md.name} (${md.nameCN})`, '<p>选择模式</p>', [
      { text:'🎮 比赛', cls:'btn-primary', fn:()=> this._enterMode(k,'match') },
      { text:'📐 编辑', cls:'btn-secondary', fn:()=> this._enterMode(k,'editor') },
    ]);
  },

  _dialog(title, bodyHTML, buttons) {
    $('dialog-title').textContent = title; $('dialog-body').innerHTML = bodyHTML || '';
    $('dialog-actions').innerHTML = buttons.map((b,i) => `<button class="btn ${b.cls}" data-di="${i}">${b.text}</button>`).join('');
    const ov = $('modal-dialog'); ov.classList.add('active');
    ov.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { ov.classList.remove('active'); buttons[+b.dataset.di]?.fn?.(); }));
  },

  _enterMode(k, mode) {
    this.mapKey = k; this.mode = mode; this.tool = null; this.marks = []; this.suggestedMarks = []; this.side = 'CT';
    const isEditor = mode === 'editor';
    $('canvas-mode-badge').textContent = isEditor ? '编辑模式' : '比赛模式';
    $('canvas-mode-badge').style.background = isEditor ? 'var(--accent-orange)' : 'var(--accent-cyan)';
    $('side-toggle').style.display = 'flex';
    $('tactic-meta').style.display = isEditor ? 'flex' : 'none';
    $('editor-actions').style.display = isEditor ? 'flex' : 'none';
    $('match-actions').style.display = isEditor ? 'none' : 'flex';
    $('status-mode').textContent = `模式：${isEditor ? '战术编辑' : '比赛'}`;
    document.querySelectorAll('.brush-btn').forEach(b => b.classList.remove('active'));
    $('status-tool').textContent = '工具：无';
    $('canvas-hint').textContent = '选择工具后拖拽绘制（拖动已有标记可移动/调整）';
    Utils.showPage('page-canvas'); $('canvas-map-name').textContent = getMap(k).name;
    this._redraw();
  },

  _openEditor(k) { this._enterMode(k, 'editor'); },

  // ==================== 画板绘图 ====================
  _selectTool(btn) { document.querySelectorAll('.brush-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); this.tool = btn.dataset.tool; $('canvas-hint').textContent = `选中："${btn.querySelector('.brush-label').textContent}" — 拖拽绘制`; $('status-tool').textContent = `工具：${btn.querySelector('.brush-label').textContent}`; },

  _canvasRect() { const r = $('canvas-main').getBoundingClientRect(); return { l:r.left, t:r.top, sx:800/r.width, sy:800/r.height }; },

  _onDown(e) {
    const { l,t,sx,sy } = this._canvasRect(), cx = (e.clientX-l)*sx, cy = (e.clientY-t)*sy;
    const hit = this._findMarkAt(cx, cy);
    if (hit) { this.drawing = false; this.draggingMarkIdx = hit.idx; this.dragType = hit.anchor; this.dragStart = { x:cx, y:cy }; this.dragOffset = { x:cx, y:cy }; this.tool = null; $('canvas-hint').textContent = '拖动中…松开确认'; return; }
    if (!this.tool) { $('canvas-hint').textContent = '请先选择画笔工具'; return; }
    this.drawing = true; this.draggingMarkIdx = -1; this.dragStart = { x:cx, y:cy }; this.dragData = null;
  },

  _onMove(e) {
    const { l,t,sx,sy } = this._canvasRect(), cx = (e.clientX-l)*sx, cy = (e.clientY-t)*sy;
    if (this.draggingMarkIdx >= 0 && this.dragOffset) { const m = this.marks[this.draggingMarkIdx], dx = cx - this.dragOffset.x, dy = cy - this.dragOffset.y; this.dragOffset = { x:cx, y:cy }; if (m.type === 'arrow' || m.type === 'wall') { if (this.dragType === 'start') { m.x1 += dx; m.y1 += dy; } else if (this.dragType === 'end') { m.x2 += dx; m.y2 += dy; } else { m.x1 += dx; m.y1 += dy; m.x2 += dx; m.y2 += dy; } } else { if (this.dragType === 'edge') m.r = Math.min(Utils.distance(cx, cy, m.cx, m.cy), 80); else { m.cx += dx; m.cy += dy; } } this._redraw(); return; }
    if (!this.drawing || !this.dragStart) return;
    switch (this.tool) { case'arrow': case'wall': this.dragData = { x1:this.dragStart.x, y1:this.dragStart.y, x2:cx, y2:cy }; break; default: const maxR = ['smoke','flash','molotov','nade'].includes(this.tool) ? 40 : 80; this.dragData = { cx:this.dragStart.x, cy:this.dragStart.y, r:Math.min(Math.hypot(cx-this.dragStart.x, cy-this.dragStart.y), maxR) }; }
    this._redrawWithPreview();
  },

  _onUp() {
    if (this.draggingMarkIdx >= 0) { this.draggingMarkIdx = -1; this.dragOffset = null; this.dragType = null; $('canvas-hint').textContent = '选择工具后拖拽绘制'; return; }
    if (!this.drawing) return; this.drawing = false;
    if (!this.dragData) { this.dragStart = null; return; }
    const valid = ['arrow','wall'].includes(this.tool) ? Math.hypot(this.dragData.x2-this.dragData.x1, this.dragData.y2-this.dragData.y1)>8 : this.dragData.r>3;
    if (valid) this.marks.push({ id:Date.now()+Math.random(), type:this.tool, ...this.dragData, side:this.side });
    this.dragStart = null; this.dragData = null; this._redraw();
  },

  _findMarkAt(x, y) {
    for (let i = this.marks.length-1; i>=0; i--) {
      const m = this.marks[i];
      if (m.type==='arrow' || m.type==='wall') { const mx=(m.x1+m.x2)/2, my=(m.y1+m.y2)/2; if (Utils.distance(x,y,m.x1,m.y1)<12) return {idx:i, anchor:'start'}; if (Utils.distance(x,y,m.x2,m.y2)<12) return {idx:i, anchor:'end'}; if (Utils.distance(x,y,mx,my)<14) return {idx:i, anchor:'mid'}; }
      if (['circle','smoke','flash','molotov','nade'].includes(m.type)) { const d = Utils.distance(x,y,m.cx,m.cy); if (d<m.r+8 && d>m.r-14) return {idx:i, anchor:'edge'}; if (d<m.r) return {idx:i, anchor:'center'}; }
    }
    return null;
  },

  _redraw() { Renderer.renderMainCanvas($('canvas-main'), this.mapKey, this.marks); $('status-marks').textContent = `标记：${this.marks.length}`; },
  _redrawWithPreview() { this._redraw(); if (this.dragData) Renderer.drawPreview($('canvas-main').getContext('2d'), this.tool, this.dragData, this.side); },

  // ==================== 战术持久化 ====================
  _saveTactic() { const t = { name:($('tactic-name').value||'未命名').trim(), mapKey:this.mapKey, style:$('tactic-style').value, marks:JSON.parse(JSON.stringify(this.marks)), createdAt:Date.now() }; this.savedTactics.push(t); this._saveTactics(); this._dialog('已保存',`<p>✅ "${t.name}" 已保存（共${this.savedTactics.length}个）</p>`,[{text:'确定',cls:'btn-primary'}]); },

  _showTacticListDialog() {
    if (!this.savedTactics.length) { alert('暂无已保存战术'); return; }
    const items = this.savedTactics.map((t,i)=>`<div class="tactic-list-item" data-ti="${i}"><span class="tactic-list-name">${t.name}</span><span class="tactic-list-map">${t.mapKey}</span><span class="tactic-list-date">${new Date(t.createdAt).toLocaleDateString()}</span><button class="btn btn-ghost btn-small" data-td="${i}">🗑</button></div>`).join('');
    this._dialog('📂 已保存战术', `<div class="tactic-list-container">${items}</div>`, [{text:'关闭',cls:'btn-ghost'}]);
    setTimeout(() => {
      document.querySelectorAll('[data-ti]').forEach(el => el.addEventListener('click', ev => { if (ev.target.tagName==='BUTTON') return; this._loadTactic(+el.dataset.ti); $('modal-dialog').classList.remove('active'); }));
      document.querySelectorAll('[data-td]').forEach(el => el.addEventListener('click', ev => { ev.stopPropagation(); if (confirm('删除？')) { this.savedTactics.splice(+el.dataset.td,1); this._saveTactics(); $('modal-dialog').classList.remove('active'); this._showTacticListDialog(); }}));
    }, 100);
  },

  _loadTactic(i) { const t = this.savedTactics[i]; if (!t) return; this._enterMode(t.mapKey,'editor'); this.marks = JSON.parse(JSON.stringify(t.marks)); $('tactic-name').value = t.name; $('tactic-style').value = t.style; setTimeout(()=>this._redraw(), 150); },

  // ==================== 分析 ====================
  async _showQuick() { const r = await APIService.quickAnalysis(this.marks, getMap(this.mapKey)?.name || '未知地图'); $('qa-tendency').textContent = `${r.source==='api'?'🤖AI':r.fallback?'⚠离线':'📋本地'} ${r.tendency}`; $('qa-confidence').textContent = `置信度 ${r.confidence||70}%`; $('qa-advice').textContent = r.advice; Utils.showModal('modal-quick-analysis'); },

  async _showDeep() {
    const a = await APIService.deepAnalysis(this.marks, getMap(this.mapKey)?.name || '未知地图');
    this.suggestedMarks = a.suggestedMarks || [];
    const src = a.source==='api'?'🤖 AI':(a.fallback?'⚠ 离线':'📋 本地');
    $('dp-core').textContent = `${src} ${a.profile.corePlayer}`; $('dp-economy').textContent = a.profile.economyTrend;
    setTimeout(() => { Renderer.renderBarChart($('chart-attack-dir'), a.profile.attackDir||{}); Renderer.renderBarChart($('chart-defense-pos'), a.profile.defenseDist||{}); }, 120);
    const hasM = this.suggestedMarks.length > 0;
    $('deep-tactics-list').innerHTML = (a.tactics||[]).map((t,i)=>`<li>${t} ${hasM&&i<this.suggestedMarks.length?`<button class="btn btn-small btn-primary btn-adopt-mark" data-mi="${i}">➕ 应用标记</button>`:''}</li>`).join('');
    if (hasM) $('deep-tactics-list').innerHTML += `<li style="text-align:right"><button class="btn btn-primary btn-small" id="btn-adopt-all">✅ 采纳全部</button></li>`;
    Utils.showModal('modal-deep-analysis');
    setTimeout(() => {
      document.querySelectorAll('.btn-adopt-mark').forEach(b => b.addEventListener('click', ()=>{ const mi=+b.dataset.mi; if (this.suggestedMarks[mi]) { this.marks.push({...this.suggestedMarks[mi], id:Date.now()+Math.random()}); this._redraw(); b.textContent='✓已应用'; b.disabled=true; b.className='btn btn-small btn-ghost'; }}));
      const allBtn = $('btn-adopt-all'); if (allBtn) allBtn.addEventListener('click', ()=>{ this.suggestedMarks.forEach(m=>this.marks.push({...m, id:Date.now()+Math.random()})); this.suggestedMarks=[]; this._redraw(); Utils.hideModal('modal-deep-analysis'); });
    }, 100);
  },

  async _showAIEvaluate() { const r = await APIService.evaluateTactic(this.marks, getMap(this.mapKey)?.name||'未知地图'); $('eval-total-score').textContent = r.totalScore||0; $('eval-strengths').innerHTML = (r.strengths||[]).map(s=>`<li>${s}</li>`).join('')||'<li>无</li>'; $('eval-risks').innerHTML = (r.risks||[]).map(r=>`<li>${r}</li>`).join('')||'<li>无</li>'; if(r.dimensions) setTimeout(()=>Renderer.renderRadar($('canvas-radar'), r.dimensions), 120); Utils.showModal('modal-ai-eval'); },

  _doAIOptimize() { Utils.hideModal('modal-ai-eval'); const r = AIEngine.optimizeTactic(this.marks); const o=AIEngine.evaluateTactic(this.marks), n=AIEngine.evaluateTactic(r.newMarkers); $('compare-score-orig').textContent=o.totalScore; $('compare-score-ai').textContent=n.totalScore; $('compare-changes-list').innerHTML=r.changes.map(c=>`<li>${c}</li>`).join(''); this._optMarks=r.newMarkers; setTimeout(()=>{Renderer.renderTacticThumbnail($('canvas-compare-orig'),this.mapKey,this.marks);Renderer.renderTacticThumbnail($('canvas-compare-ai'),this.mapKey,r.newMarkers)},150); Utils.showModal('modal-ai-compare'); },

  // ==================== API 设置 ====================
  _readAPIConfig() { return { provider:$('api-provider').value, apiKey:$('api-key').value.trim(), model:$('api-model').value, endpoint:$('api-endpoint').value.trim(), enabled:!!$('api-key').value.trim() }; },
  _showAPISettings() {
    const cfg = APIService.loadConfig();
    const fields = { provider: cfg.provider, 'api-key': cfg.apiKey, model: cfg.model, endpoint: cfg.endpoint };
    Object.entries(fields).forEach(([id, v]) => { const el = $(id); if (el) el.value = v || ''; });
    this._setAPIStatus(cfg.enabled && cfg.apiKey ? `已配置: ${cfg.model}` : '未配置', cfg.enabled ? 'success' : '');
    Utils.showModal('modal-api-settings');
  },
  _setAPIStatus(text, cls) { $('api-status-text').textContent = text; $('api-status').className = 'api-status ' + (cls||''); },

  // ==================== 数据中心 ====================
  _openDatacenter() { Utils.showPage('page-datacenter'); const t = TeamData.get(); const cards = [{title:'总胜率',value:TeamData.getWinRate()+'%',detail:`${t.matchHistory.wins}胜/${t.matchHistory.losses}负`},{title:'总对局',value:t.matchHistory.totalMatches,detail:'历史对局'},{title:'已保存战术',value:this.savedTactics.length,detail:'本地存储'},{title:'车队名称',value:t.teamName,detail:''},{title:'队员数',value:t.playerRoster.players.length||5,detail:'默认5人'}]; $('dc-stats').innerHTML = cards.map(c => `<div class="dc-stat-card"><h4>${c.title}</h4><div class="stat-value">${c.value}</div><div class="stat-detail">${c.detail}</div></div>`).join(''); },
};

document.addEventListener('DOMContentLoaded', () => App.init());