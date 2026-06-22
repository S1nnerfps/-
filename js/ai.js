/* ============================================================
   TacticFlow — AI 规则引擎 v2
   匹配当前标记体系: arrow/circle/wall/smoke/flash/molotov/nade
   ============================================================ */

const AIEngine = {

  // ==================== 5 维评估 ====================
  evaluateTactic(marks, mapData) {
    const dims = {
      mapControl: 0, utilityEfficiency: 0, influenceOverlap: 0, timeWindow: 0, riskLevel: 0,
    };

    if (!marks || marks.length === 0) {
      return { dimensions: dims, totalScore: 0, strengths: [], risks: ['未添加任何标记'] };
    }

    // 分类标记
    const arrows = marks.filter(m => m.type === 'arrow');
    const circles = marks.filter(m => m.type === 'circle');
    const walls = marks.filter(m => m.type === 'wall');
    const utils = marks.filter(m => ['smoke','flash','molotov','nade'].includes(m.type));
    const smokes = marks.filter(m => m.type === 'smoke');
    const flashes = marks.filter(m => m.type === 'flash');

    // 1. 控图覆盖率 — 检查箭头/墙壁/道具是否覆盖地图区域
    const allX = marks.flatMap(m => [
      m.x1 ?? m.cx ?? 0, m.x2 ?? m.cx ?? 0
    ]).filter(v => v > 0 && v < 800);
    const allY = marks.flatMap(m => [
      m.y1 ?? m.cy ?? 0, m.y2 ?? m.cy ?? 0
    ]).filter(v => v > 0 && v < 800);

    if (allX.length >= 4) {
      const xSpan = Math.max(...allX) - Math.min(...allX);
      const ySpan = Math.max(...allY) - Math.min(...allY);
      // 覆盖的归一化面积
      const coverage = (xSpan * ySpan) / (800 * 800);
      dims.mapControl = Math.round(Utils.clamp(coverage * 100 + 20, 0, 100));
    } else {
      dims.mapControl = 10;
    }

    // 2. 投掷物效率 — 道具种类和数量
    const utilTypes = new Set(utils.map(u => u.type)).size;
    dims.utilityEfficiency = Math.round(Utils.clamp(
      utils.length * 12 + utilTypes * 15 + smokes.length * 8 + flashes.length * 8, 0, 100
    ));

    // 3. 影响力重叠 — 检查圆圈/道具重叠情况
    const allCircles = [...circles, ...utils].filter(m => m.cx !== undefined);
    if (allCircles.length >= 2) {
      let overlaps = 0, pairs = 0;
      for (let i = 0; i < allCircles.length; i++) {
        for (let j = i + 1; j < allCircles.length; j++) {
          pairs++;
          const d = Utils.distance(allCircles[i].cx, allCircles[i].cy, allCircles[j].cx, allCircles[j].cy);
          if (d < (allCircles[i].r || 20) + (allCircles[j].r || 20)) overlaps++;
        }
      }
      const ratio = pairs > 0 ? overlaps / pairs : 0;
      dims.influenceOverlap = Math.round(Utils.clamp(ratio * 100, 30, 95));
    } else {
      dims.influenceOverlap = 40;
    }

    // 4. 时间窗口可行性 — 箭头跨度/标记分布的合理性
    if (arrows.length > 0) {
      let maxDist = 0;
      for (const a of arrows) {
        maxDist = Math.max(maxDist, Utils.distance(a.x1, a.y1, a.x2, a.y2));
      }
      dims.timeWindow = Math.round(Utils.clamp(100 - (maxDist / 800) * 70, 15, 100));
    } else if (marks.length > 3) {
      dims.timeWindow = 55;
    } else {
      dims.timeWindow = 30;
    }

    // 5. 风险等级 — 防守线 vs 进攻箭头数量
    const atkArrows = arrows.filter(a => a.side === 'T');  // T=进攻方箭头
    const defWalls = walls;
    if (atkArrows.length > 0 || defWalls.length > 0) {
      const ratio = atkArrows.length / Math.max(defWalls.length || 1, 1);
      dims.riskLevel = Math.round(Utils.clamp(ratio * 35 + 25, 10, 90));
    } else if (circles.length > 3) {
      dims.riskLevel = 40;
    } else {
      dims.riskLevel = 35;
    }

    // 综合评分
    const totalScore = Math.round(
      dims.mapControl * 0.25 +
      dims.utilityEfficiency * 0.25 +
      dims.influenceOverlap * 0.15 +
      dims.timeWindow * 0.15 +
      (100 - dims.riskLevel) * 0.20
    );

    const strengths = [], risks = [];
    if (dims.mapControl >= 65) strengths.push('控图覆盖充分');
    else if (dims.mapControl < 30) risks.push('控图覆盖率不足');
    if (dims.utilityEfficiency >= 60) strengths.push('投掷物使用有效');
    else if (dims.utilityEfficiency < 25 && utils.length < 2) risks.push('投掷物配置偏少');
    if (dims.influenceOverlap >= 65) strengths.push('站位协作良好');
    if (dims.timeWindow >= 60) strengths.push('执行时间充裕');
    else if (dims.timeWindow < 30) risks.push('标记跨度较大');
    if (dims.riskLevel >= 65) risks.push('整体风险偏高');
    else if (dims.riskLevel < 30) strengths.push('风险控制良好');

    return { dimensions: dims, totalScore, strengths, risks };
  },

  // ==================== 战术优化 ====================
  optimizeTactic(marks, mapData) {
    const changes = [];
    const newMarks = JSON.parse(JSON.stringify(marks));

    if (newMarks.length === 0) {
      changes.push('当前无标记，无法优化');
      return { newMarkers: newMarks, changes };
    }

    const arrows = newMarks.filter(m => m.type === 'arrow');
    const walls = newMarks.filter(m => m.type === 'wall');
    const utils = newMarks.filter(m => ['smoke','flash','molotov','nade'].includes(m.type));

    // 策略1：无烟雾弹 → 添加
    if (!newMarks.some(m => m.type === 'smoke') && walls.length > 0) {
      const w = walls[0];
      newMarks.push({ id: Date.now() + Math.random(), type: 'smoke', cx: (w.x1 + w.x2) / 2 - 30, cy: (w.y1 + w.y2) / 2 - 30, r: 20, side: 'CT' });
      changes.push('在防线前方添加烟雾弹掩护');
    }

    // 策略2：无箭头 → 从标记密集区生成
    if (arrows.length === 0 && walls.length > 1) {
      const w = walls[Math.floor(walls.length / 2)];
      newMarks.push({ id: Date.now() + Math.random(), type: 'arrow', x1: w.x2, y1: w.y2, x2: w.x2 + 60, y2: w.y2 + 30, side: 'T' });
      changes.push('从防线位置生成进攻箭头');
    }

    // 策略3：无墙壁防守 → 添加
    if (walls.length === 0 && arrows.length > 0) {
      const a = arrows[0];
      newMarks.push({ id: Date.now() + Math.random(), type: 'wall', x1: a.x2 - 30, y1: a.y2 + 10, x2: a.x2 + 30, y2: a.y2 + 10, side: 'CT' });
      changes.push('在箭头终点添加防守防线');
    }

    // 策略4：道具偏少
    if (utils.length < 2 && newMarks.length > 3) {
      const cx = newMarks.reduce((s, m) => s + (m.cx ?? m.x1 ?? 400), 0) / newMarks.length;
      const cy = newMarks.reduce((s, m) => s + (m.cy ?? m.y1 ?? 400), 0) / newMarks.length;
      newMarks.push({ id: Date.now() + Math.random(), type: 'flash', cx: Math.round(cx) + 40, cy: Math.round(cy) - 40, r: 8, side: 'T' });
      changes.push('添加闪光弹标记增强突破能力');
    }

    return { newMarkers: newMarks, changes };
  },

  // 本地快速分析 (app.js 已覆盖，保留作为 API 回退)
  quickAnalysis(marks) {
    if (!marks || marks.length < 3) return { tendency: '数据不足', confidence: 0, advice: '需要至少 3 条标记' };
    const arrows = marks.filter(m => m.type === 'arrow');
    const walls = marks.filter(m => m.type === 'wall');
    const utils = marks.filter(m => ['circle','smoke','flash','molotov','nade'].includes(m.type));
    const conf = Math.min(Utils.clamp(marks.length * 6, 25, 85), 85);

    let tendency = '信息不足';
    const advices = [];
    if (arrows.length >= 2) {
      const avgDx = arrows.reduce((s, a) => s + (a.x2 - a.x1), 0) / arrows.length;
      tendency = avgDx > 0 ? '进攻倾向右半区' : avgDx < 0 ? '进攻倾向左半区' : '方向分散';
    }
    if (walls.length > utils.length) advices.push('防守态势明显');
    if (arrows.length > walls.length) advices.push('进攻多于防守');
    if (utils.length > 3) advices.push('投掷物密集');
    if (!advices.length) advices.push('继续收集标记');
    return { tendency, confidence: conf, advice: advices[0] };
  },

  deepAnalysis(marks) {
    if (!marks || marks.length < 5) return {
      profile: { attackDir: {}, defenseDist: {}, corePlayer: '数据不足', economyTrend: '数据不足' },
      tactics: ['至少需要 5 条标记'], suggestedMarks: [],
    };
    const arrows = marks.filter(m => m.type === 'arrow');
    const walls = marks.filter(m => m.type === 'wall');
    const utils = marks.filter(m => ['circle','smoke','flash','molotov','nade'].includes(m.type));
    const tactics = [];
    if (arrows.length > walls.length + 2) tactics.push('对手偏向进攻，可设防守陷阱');
    if (walls.length > 4) tactics.push('多条防线，集中突破一点');
    if (utils.length > 5) tactics.push('投掷物覆盖密集，佯攻消耗道具');
    if (!tactics.length) tactics.push('继续收集标记');
    return {
      profile: {
        attackDir: { T: arrows.length, CT: walls.length },
        defenseDist: { '上半区': utils.filter(m => (m.cy ?? 0) < 400).length, '下半区': utils.filter(m => (m.cy ?? 0) >= 400).length },
        corePlayer: arrows.length > walls.length ? '进攻方主导' : '防守方主导',
        economyTrend: marks.length > 8 ? '数据充分' : '数据收集中',
      },
      tactics, suggestedMarks: [],
    };
  },
};