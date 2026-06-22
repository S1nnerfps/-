/* ============================================================
   TacticFlow — 数据模型层
   精简版：车队数据持久化 + 战术持久化
   ============================================================ */

const TeamData = {
  STORAGE_KEY: 'tacticflow_teamdata',

  defaultData() { return { teamName: '我的车队', createdAt: Date.now(), matchHistory: { totalMatches:0, wins:0, losses:0, mapsPlayed:{} }, playerRoster: { players:[] } }; },

  load() { try { const d = localStorage.getItem(this.STORAGE_KEY); return d ? JSON.parse(d) : this.defaultData(); } catch { return this.defaultData(); } },

  _cache: null,
  get() { if (!this._cache) this._cache = this.load(); return this._cache; },

  save(data) { try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data)); } catch {} },

  getWinRate() { const h = this.get().matchHistory; return h.totalMatches ? Math.round(h.wins / h.totalMatches * 100) : 0; },

  getMapWinRate(key) { const m = this.get().matchHistory.mapsPlayed[key]; return m?.played ? Math.round(m.won / m.played * 100) : 0; },
};