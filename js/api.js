/* ============================================================
   TacticFlow — API 调用层
   支持 OpenAI / Claude / 自定义端点
   回退至本地规则引擎
   ============================================================ */

const APIService = {
  STORAGE_KEY: 'tacticflow_api_config',

  // 默认配置
  defaultConfig() {
    return {
      provider: 'openai',
      apiKey: '',
      model: 'gpt-4o',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      enabled: false,
    };
  },

  // 预设提供商
  providers: {
    openai: { name: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1-mini'], defaultEndpoint: 'https://api.openai.com/v1/chat/completions' },
    deepseek: { name: 'DeepSeek', models: ['deepseek-chat', 'deepseek-reasoner'], defaultEndpoint: 'https://api.deepseek.com/v1/chat/completions' },
    claude: { name: 'Claude (兼容)', models: ['claude-3-5-sonnet', 'claude-3-opus'], defaultEndpoint: 'https://api.anthropic.com/v1/messages' },
    custom: { name: '自定义', models: [], defaultEndpoint: '' },
  },

  // 加载配置
  loadConfig() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      return raw ? JSON.parse(raw) : this.defaultConfig();
    } catch {
      return this.defaultConfig();
    }
  },

  // 保存配置
  saveConfig(cfg) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(cfg));
  },

  // 测试连接
  async testConnection(cfg) {
    try {
      const resp = await this._call(cfg, [{ role: 'user', content: 'Say "OK"' }], 5);
      return resp?.toLowerCase().includes('ok');
    } catch {
      return false;
    }
  },

  // 核心 API 调用
  async _call(cfg, messages, timeoutSec = 20) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutSec * 1000);

    try {
      let url, headers, body;

      // Claude 兼容模式用特殊 header
      if (cfg.provider === 'claude') {
        url = cfg.endpoint || 'https://api.anthropic.com/v1/messages';
        headers = {
          'Content-Type': 'application/json',
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01',
        };
        const systemMsg = messages.find(m => m.role === 'system');
        const userMsgs = messages.filter(m => m.role === 'user' || m.role === 'assistant');
        body = JSON.stringify({
          model: cfg.model,
          max_tokens: 1024,
          system: systemMsg?.content || '',
          messages: userMsgs,
        });
      } else {
        // OpenAI 兼容
        url = cfg.endpoint || 'https://api.openai.com/v1/chat/completions';
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cfg.apiKey}`,
        };
        body = JSON.stringify({
          model: cfg.model,
          messages: messages,
          temperature: 0.4,
          max_tokens: 800,
        });
      }

      const resp = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`API ${resp.status}: ${txt.slice(0, 200)}`);
      }

      const data = await resp.json();

      // 解析响应
      if (cfg.provider === 'claude') {
        return data?.content?.[0]?.text || '';
      }
      return data?.choices?.[0]?.message?.content || '';

    } finally {
      clearTimeout(timer);
    }
  },

  // ==================== 分析调用 ====================

  /**
   * 快速分析
   * @param {Array} marks - 标记列表
   * @param {string} mapName - 地图名
   * @returns {Object} { tendency, confidence, advice, source }
   */
  async quickAnalysis(marks, mapName) {
    const cfg = this.loadConfig();
    if (!cfg.enabled || !cfg.apiKey) {
      return { ...this._ruleQuick(marks), source: 'rule' };
    }

    const prompt = this._buildQuickPrompt(marks, mapName);

    // DeepSeek 用兼容 OpenRouter 格式，无需特殊处理

    try {
      const resp = await this._call(cfg, [
        { role: 'system', content: '你是 CS2 战术教练。根据标记分析对手行为，简洁输出。' },
        { role: 'user', content: prompt },
      ], 12);

      const parsed = this._parseQuickResponse(resp);
      return { ...parsed, source: 'api', confidence: parsed.confidence || 75 };
    } catch (e) {
      console.warn('API 快速分析失败，回退规则引擎:', e.message);
      return { ...this._ruleQuick(marks), source: 'rule', fallback: true };
    }
  },

  /**
   * 深度分析
   * @returns {Object} { profile, tactics, source }
   */
  async deepAnalysis(marks, mapName) {
    const cfg = this.loadConfig();
    if (!cfg.enabled || !cfg.apiKey) {
      return { ...this._ruleDeep(marks), source: 'rule' };
    }

    const prompt = this._buildDeepPrompt(marks, mapName);

    try {
      const resp = await this._call(cfg, [
        { role: 'system', content: '你是资深 CS2 战术分析师。深度解读对手行为，给出可执行的战术建议。' },
        { role: 'user', content: prompt },
      ], 18);

      const parsed = this._parseDeepResponse(resp);
      return { ...parsed, source: 'api' };
    } catch (e) {
      console.warn('API 深度分析失败，回退规则引擎:', e.message);
      return { ...this._ruleDeep(marks), source: 'rule', fallback: true };
    }
  },

  /**
   * AI 战术评估
   */
  async evaluateTactic(marks, mapName) {
    const cfg = this.loadConfig();
    if (!cfg.enabled || !cfg.apiKey) {
      return this._ruleEvaluate(marks);
    }

    const prompt = this._buildEvaluatePrompt(marks, mapName);

    try {
      const resp = await this._call(cfg, [
        { role: 'system', content: '你是 CS2 战术评估专家。分析战术标记，给出 5 维评分和优化建议。输出 JSON。' },
        { role: 'user', content: prompt },
      ], 15);

      return this._parseEvalResponse(resp, marks);
    } catch (e) {
      console.warn('API 评估失败，回退规则引擎:', e.message);
      return this._ruleEvaluate(marks);
    }
  },

  // ==================== Prompt 构建 ====================

  _buildQuickPrompt(marks, mapName) {
    const arrows = marks.filter(m => m.type === 'arrow');
    const walls = marks.filter(m => m.type === 'wall');
    const circles = marks.filter(m => m.type === 'circle');

    const sideInfo = marks.map(m => `${m.type}(${m.side})`).join(', ');
    const arrowDirs = arrows.map(a => {
      const dx = a.x2 - a.x1, dy = a.y2 - a.y1;
      const len = Math.hypot(dx, dy);
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? '右' : '左') : (dy > 0 ? '下' : '上');
      return `${dir}(${Math.round(len)}px)`;
    }).join(', ');

    return `地图: ${mapName}
标记总数: ${marks.length} (箭头${arrows.length}, 墙壁${walls.length}, 圆圈${circles.length})
阵营分布: ${sideInfo}
箭头方向: ${arrowDirs || '无'}

请分析: 1) 对手倾向 2) 置信度(30-95) 3) 一句战术建议。用中文回复，格式:"[倾向] | [置信度] | [建议]"`;
  },

  _buildDeepPrompt(marks, mapName) {
    const sideCounts = { CT: 0, T: 0 };
    marks.forEach(m => { sideCounts[m.side] = (sideCounts[m.side] || 0) + 1; });

    return `地图: ${mapName} | 标记总数: ${marks.length}
类型分布: 箭头${marks.filter(m=>m.type==='arrow').length} 墙壁${marks.filter(m=>m.type==='wall').length} 圆圈${marks.filter(m=>m.type==='circle').length}
阵营分布: CT ${sideCounts.CT} / T ${sideCounts.T}

请输出:
## 对手画像
- 核心特征:
- 经济趋势推测:

## 战术建议（每条建议需要附带具体操作标记）
1. [战术文字] | MARK:arrow(CT/T)|x1,y1,x2,y2 或 MARK:circle(CT/T)|cx,cy,r 或 MARK:wall(CT/T)|x1,y1,x2,y2
2. [战术文字] | MARK:arrow(CT/T)|x1,y1,x2,y2
3. [战术文字] | MARK:circle(CT/T)|cx,cy,r

坐标范围 0-800，请根据地图特点和战术逻辑给出合理坐标。T=黄色方, CT=蓝色方。

用中文回复。`;
  },

  _buildEvaluatePrompt(marks, mapName) {
    const desc = marks.map(m => `${m.type}(${m.side}) at ${Math.round(m.x1||m.cx||0)},${Math.round(m.y1||m.cy||0)}`).join('; ');
    return `地图: ${mapName} | 标记: ${desc}
评估此战术的 5 个维度(0-100): 控图覆盖率, 投掷物效率, 影响力重叠度, 时间窗口可行性, 风险等级(高=高风险)
返回 JSON: {"totalScore":<0-100>,"dimensions":{"mapControl":<>,...},"strengths":["",...],"risks":["",...]}`;
  },

  // ==================== 响应解析 ====================

  _parseQuickResponse(text) {
    const parts = text.split('|').map(p => p.trim());
    return {
      tendency: parts[0] || '分析中',
      confidence: parseInt(parts[1]) || 70,
      advice: parts[2] || text,
    };
  },

  _parseDeepResponse(text) {
    const lines = text.split('\n').filter(l => l.trim());
    const profile = { corePlayer: '', economyTrend: '', attackDir: {}, defenseDist: {} };
    const tactics = [];
    const suggestedMarks = [];
    let section = '';

    for (const line of lines) {
      if (line.includes('对手画像')) { section = 'profile'; continue; }
      if (line.includes('战术建议')) { section = 'tactics'; continue; }

      // 先提取 MARK: 标记
      const markMatch = line.match(/MARK:(\w+)\((\w+)\)\|([\d,]+)/);
      let cleanLine = line;
      let mark = null;
      if (markMatch) {
        const type = markMatch[1].toLowerCase();
        const side = markMatch[2].toUpperCase();
        const coords = markMatch[3].split(',').map(Number);
        if (coords.length >= 2) {
          if (['smoke', 'flash', 'molotov', 'nade', 'circle'].includes(type)) {
            mark = { type, side, cx: coords[0], cy: coords[1], r: coords[2] || 30 };
          } else if (type === 'arrow' && coords.length >= 4) {
            mark = { type, side, x1: coords[0], y1: coords[1], x2: coords[2], y2: coords[3] };
          } else if (type === 'wall' && coords.length >= 4) {
            mark = { type, side, x1: coords[0], y1: coords[1], x2: coords[2], y2: coords[3] };
          }
          if (mark) suggestedMarks.push(mark);
          cleanLine = line.replace(markMatch[0], '').trim();
        }
      }

      if (section === 'profile') {
        const clean = cleanLine.replace(/^[#*\- ]+/, '').trim();
        if (clean.includes('核心')) profile.corePlayer = clean;
        if (clean.includes('经济')) profile.economyTrend = clean;
      }
      if (section === 'tactics') {
        const clean = cleanLine.replace(/^[#*\- \d.]+/, '').trim();
        if (clean.length > 3) tactics.push(clean);
      }
    }

    if (!tactics.length) tactics.push(text.slice(0, 200));
    return { profile, tactics, suggestedMarks };
  },

  _parseEvalResponse(text, marks) {
    try {
      // 尝试提取 JSON
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const json = JSON.parse(match[0]);
        return {
          totalScore: json.totalScore || 50,
          dimensions: json.dimensions || {},
          strengths: json.strengths || [],
          risks: json.risks || [],
          source: 'api',
        };
      }
    } catch {}

    return this._ruleEvaluate(marks);
  },

  // ==================== 规则引擎回退（本地实现） ====================

  _ruleQuick(marks) {
    return AIEngine.quickAnalysis(marks);
  },

  _ruleDeep(marks) {
    return AIEngine.deepAnalysis(marks);
  },

  _ruleEvaluate(marks) {
    const result = AIEngine.evaluateTactic(marks, null);
    return {
      totalScore: result.totalScore,
      dimensions: result.dimensions,
      strengths: result.strengths,
      risks: result.risks,
      source: 'rule',
    };
  },
};