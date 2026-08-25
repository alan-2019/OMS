/* ============================================================
   大运营AI智造局 - HTML页面共享空间
   支持：自定义上传HTML页面 / 点赞 / 收藏 / 我的点赞·收藏查询 / 排序筛选
   （纯内存 Mock，刷新后重置为初始数据）
   ============================================================ */
(function () {
  'use strict';

  var CURRENT_USER = '张超';
  var PAGE_SIZE = 6;

  /* ==================== 分类定义 ==================== */
  var AI_CATS = [
    { id: 'dev',   title: '开发作战地图',       desc: '开发条线作战地图及经营分析相关HTML页面', theme: 'blue',   main: '#4facfe', soft: '#bfe0ff' },
    { id: 'sales', title: '销售作战地图',       desc: '销售条线作战地图相关HTML页面',           theme: 'orange', main: '#ffa940', soft: '#ffe1b8' },
    { id: 'plan',  title: '计划及项目公司管理', desc: '计划管理及项目公司管理相关HTML页面',       theme: 'cyan',   main: '#36cfc9', soft: '#b8f0ec' },
    { id: 'power', title: '电力运营及电价分析', desc: '电力运营与电价分析相关HTML页面',           theme: 'purple', main: '#9254de', soft: '#e2ccf7' },
    { id: 'ops',   title: '运维监控',           desc: '运维监控分析相关HTML页面',               theme: 'indigo', main: '#5b7fff', soft: '#ccd7ff' },
    { id: 'task',  title: '专项任务分析',       desc: '专项任务统计分析相关HTML页面',             theme: 'green',  main: '#52c41a', soft: '#cdeeb6' }
  ];

  function catOf(id) {
    for (var i = 0; i < AI_CATS.length; i++) if (AI_CATS[i].id === id) return AI_CATS[i];
    return AI_CATS[0];
  }

  /* 分类卡片装饰插画 */
  function catArt(main, soft) {
    return '<svg viewBox="0 0 108 86" fill="none">' +
      '<ellipse cx="54" cy="74" rx="36" ry="8" fill="' + soft + '"/>' +
      '<ellipse cx="54" cy="69" rx="22" ry="5" fill="' + main + '" opacity=".35"/>' +
      '<path d="M18 52 Q54 38 90 52" stroke="' + main + '" stroke-width="1.5" opacity=".45"/>' +
      '<circle cx="54" cy="34" r="19" fill="' + main + '" opacity=".9"/>' +
      '<circle cx="47" cy="28" r="5.5" fill="#fff" opacity=".55"/>' +
      '<circle cx="88" cy="18" r="3.2" fill="' + main + '" opacity=".55"/>' +
      '<circle cx="20" cy="24" r="2.6" fill="' + main + '" opacity=".4"/>' +
      '<circle cx="80" cy="44" r="2.2" fill="' + main + '" opacity=".35"/>' +
      '</svg>';
  }

  /* ==================== 演示HTML生成器 ==================== */
  function demoHtml(cfg) {
    var months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月'];
    var bars = '';
    for (var i = 0; i < 8; i++) {
      var h = 30 + ((cfg.seed * (i + 3)) % 62);
      bars += '<div class="bar" style="height:' + h + '%"><span>' + months[i] + '</span></div>';
    }
    var stats = '';
    cfg.stats.forEach(function (s) {
      stats += '<div class="stat"><div class="stat-v">' + s[1] + '</div><div class="stat-l">' + s[0] + '</div></div>';
    });
    var rows = '';
    cfg.rows.forEach(function (r) {
      rows += '<tr><td>' + r.join('</td><td>') + '</td></tr>';
    });
    return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>' + cfg.title + '</title><style>' +
      '*{margin:0;padding:0;box-sizing:border-box}' +
      'body{font-family:"PingFang SC","Microsoft YaHei",sans-serif;background:#f4f6fa;color:#2b3a4d}' +
      '.hd{background:linear-gradient(120deg,' + cfg.accent + ',#2f5cff);color:#fff;padding:30px 40px}' +
      '.hd h1{font-size:26px;letter-spacing:1px}' +
      '.hd p{margin-top:8px;font-size:13px;opacity:.85}' +
      '.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;padding:24px 40px}' +
      '.stat{background:#fff;border-radius:10px;padding:20px;box-shadow:0 2px 8px rgba(31,45,61,.06)}' +
      '.stat-v{font-size:26px;font-weight:700;color:' + cfg.accent + '}' +
      '.stat-l{margin-top:6px;font-size:12px;color:#8a94a6}' +
      '.panel{margin:0 40px 30px;background:#fff;border-radius:10px;padding:22px 24px 42px;box-shadow:0 2px 8px rgba(31,45,61,.06)}' +
      '.panel h3{font-size:15px;margin-bottom:20px}' +
      '.bars{display:flex;align-items:flex-end;gap:14px;height:150px;padding:0 6px}' +
      '.bar{flex:1;background:linear-gradient(180deg,' + cfg.accent + ',rgba(120,150,255,.2));border-radius:5px 5px 0 0;position:relative}' +
      '.bar span{position:absolute;bottom:-24px;left:0;right:0;text-align:center;font-size:11px;color:#8a94a6}' +
      'table{width:100%;border-collapse:collapse;font-size:13px}' +
      'th,td{padding:10px 12px;text-align:left;border-bottom:1px solid #eef0f4}' +
      'th{color:#8a94a6;font-weight:500;background:#fafbfc}' +
      '</style></head><body>' +
      '<div class="hd"><h1>' + cfg.title + '</h1><p>' + cfg.subtitle + '</p></div>' +
      '<div class="stats">' + stats + '</div>' +
      '<div class="panel"><h3>趋势分析</h3><div class="bars">' + bars + '</div></div>' +
      '<div class="panel"><h3>明细数据</h3><table><thead><tr><th>' + cfg.cols.join('</th><th>') + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '</body></html>';
  }

  /* ==================== Mock 数据 ==================== */
  function seedPage(id, name, cat, status, desc, uploader, time, like, fav, likedByMe, favByMe, cfg) {
    return {
      id: id, name: name, category: cat, status: status, desc: desc,
      uploader: uploader, time: time, html: demoHtml(cfg),
      likeCount: like, favCount: fav, likedByMe: !!likedByMe, favByMe: !!favByMe
    };
  }

  var aiPages = [
    seedPage('p1', '项目公司管理看板_浅色系', 'dev', '未发布', '测试', '何敏', '2026-08-18 14:49:28', 12, 5, true, false, {
      title: '项目公司管理看板', subtitle: '项目公司全景经营数据监控（浅色系）', accent: '#4facfe', seed: 7,
      stats: [['项目总数', '248'], ['装机容量(MW)', '1856.3'], ['年发电量(万kWh)', '342.7'], ['在运项目', '36']],
      cols: ['项目公司', '装机容量', '年发电量', '状态'],
      rows: [['苏州吴中产业园新能源', '12.6MW', '1,386万kWh', '在运'], ['广东廉江石岭光伏', '8.2MW', '902万kWh', '在运'], ['山东滨州沾化风电', '50MW', '12,400万kWh', '在建'], ['河北张家口坝上光伏', '30MW', '4,120万kWh', '在运']]
    }),
    seedPage('p2', '机制电价投前管理', 'dev', '未发布', '机制电价投前测算与投标管理页面', '何敏', '2026-08-18 14:46:45', 8, 3, false, true, {
      title: '机制电价投前管理', subtitle: '机制电价投前测算 · 投标策略 · 中标分析', accent: '#5b7fff', seed: 13,
      stats: [['在途项目', '18'], ['测算均价(元/kWh)', '0.382'], ['中标率', '64%'], ['本月投标', '7']],
      cols: ['省份', '机制电价', '申报容量', '测算结果'],
      rows: [['山东省', '0.3949元/kWh', '120MW', '建议申报'], ['广东省', '0.4021元/kWh', '80MW', '建议申报'], ['河北省', '0.3718元/kWh', '200MW', '谨慎申报'], ['江苏省', '0.4156元/kWh', '60MW', '建议申报']]
    }),
    seedPage('p3', '销售作战地图_大区业绩总览', 'sales', '已发布', '各大区销售业绩、目标达成及趋势总览', '王思琪', '2026-08-15 10:22:10', 25, 11, false, false, {
      title: '销售作战地图 · 大区业绩总览', subtitle: '销售业绩达成与区域对比分析', accent: '#ffa940', seed: 21,
      stats: [['签约金额(亿元)', '12.6'], ['目标达成率', '87.5%'], ['在售项目', '56'], ['本月新增', '9']],
      cols: ['大区', '签约金额', '达成率', '同比'],
      rows: [['东部区域', '3.8亿', '95.2%', '+12.4%'], ['南部区域', '2.9亿', '88.1%', '+8.7%'], ['北部区域', '2.4亿', '82.3%', '+5.1%'], ['西部区域', '1.8亿', '76.9%', '-2.3%']]
    }),
    seedPage('p4', '计划执行跟踪看板', 'plan', '已发布', '计划下达、执行进度与偏差预警跟踪', '李明轩', '2026-08-12 09:05:31', 6, 2, false, false, {
      title: '计划执行跟踪看板', subtitle: '年度计划下达 · 执行进度 · 偏差预警', accent: '#36cfc9', seed: 9,
      stats: [['年度计划项目', '132'], ['按期完成率', '91.2%'], ['偏差预警', '6'], ['本月下达', '14']],
      cols: ['计划批次', '项目数', '完成率', '预警'],
      rows: [['2026年第一批', '45', '93.3%', '1'], ['2026年第二批', '38', '89.5%', '2'], ['2026年第三批', '31', '90.3%', '2'], ['2026年第四批', '18', '94.4%', '1']]
    }),
    seedPage('p5', '电力运营日分析', 'power', '已发布', '发电量、上网电量与电价日维度分析', '张建国', '2026-08-10 16:40:02', 18, 9, true, false, {
      title: '电力运营日分析', subtitle: '发电量 · 上网电量 · 电价 日维度追踪', accent: '#9254de', seed: 17,
      stats: [['日发电量(万kWh)', '486.2'], ['日上网电量(万kWh)', '471.5'], ['综合电价(元/kWh)', '0.386'], ['等效利用小时', '4.2']],
      cols: ['电站', '日发电量', '上网电价', '完成率'],
      rows: [['廉江石岭光伏', '3.42万kWh', '0.401元', '102.1%'], ['沾化风电', '58.6万kWh', '0.372元', '96.8%'], ['坝上光伏', '14.7万kWh', '0.388元', '99.4%'], ['吴中产业园', '5.31万kWh', '0.415元', '104.2%']]
    }),
    seedPage('p6', '运维监控实时大屏', 'ops', '未发布', '电站运行状态、告警与运维工单实时监控', '刘子涵', '2026-08-08 11:18:47', 4, 1, false, false, {
      title: '运维监控实时大屏', subtitle: '运行状态 · 告警中心 · 工单闭环', accent: '#5b7fff', seed: 11,
      stats: [['在线电站', '236'], ['当前告警', '12'], ['在途工单', '28'], ['消缺及时率', '96.4%']],
      cols: ['告警电站', '告警类型', '级别', '处理状态'],
      rows: [['廉江石岭光伏', '逆变器过温', '重要', '处理中'], ['坝上光伏', '通讯中断', '紧急', '已派单'], ['吴中产业园', '组串电流异常', '一般', '已闭环'], ['沾化风电', '风机振动超限', '重要', '处理中']]
    }),
    seedPage('p7', '专项任务统计月报', 'task', '已发布', '专项任务完成率、逾期与整改闭环月报', '陈雨桐', '2026-08-05 14:30:19', 9, 7, false, true, {
      title: '专项任务统计月报', subtitle: '任务完成率 · 逾期预警 · 整改闭环', accent: '#52c41a', seed: 15,
      stats: [['本月任务', '86'], ['按期完成率', '92.4%'], ['逾期任务', '5'], ['整改闭环率', '97.1%']],
      cols: ['任务类型', '任务数', '完成率', '逾期'],
      rows: [['资料整改', '32', '93.8%', '2'], ['数据治理', '24', '91.7%', '1'], ['专项检查', '18', '94.4%', '1'], ['流程优化', '12', '91.7%', '1']]
    }),
    seedPage('p8', '项目公司经营分析', 'plan', '未发布', '项目公司收入、成本与利润多维分析', '何敏', '2026-08-02 15:55:26', 2, 0, false, false, {
      title: '项目公司经营分析', subtitle: '收入 · 成本 · 利润多维分析', accent: '#13c2c2', seed: 19,
      stats: [['营业收入(亿元)', '8.42'], ['营业成本(亿元)', '5.16'], ['净利润(亿元)', '1.98'], ['利润率', '23.5%']],
      cols: ['项目公司', '收入', '成本', '利润率'],
      rows: [['苏州吴中新能源', '1.26亿', '0.72亿', '26.8%'], ['广东廉江新能源', '0.98亿', '0.64亿', '22.4%'], ['山东沾化风电', '3.12亿', '1.95亿', '21.6%'], ['河北坝上光伏', '1.54亿', '0.98亿', '24.1%']]
    })
  ];

  /* ==================== 页面状态 ==================== */
  var aiState = {
    tab: 'all',        /* all / liked / fav */
    category: null,    /* 分类过滤 */
    status: '',        /* 已发布 / 未发布 */
    uploader: '',      /* 上传人 */
    keyword: '',       /* 页面名称关键字 */
    sortField: null,   /* null / like / fav */
    sortDir: 'desc',   /* desc 降序 / asc 升序 */
    page: 1
  };

  /* ==================== 工具函数 ==================== */
  function el(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escAttr(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function now() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' +
      pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }

  function toast(msg, type) {
    var t = document.createElement('div');
    t.className = 'aif-toast ' + (type || 'info');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('show'); }, 10);
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { t.remove(); }, 300);
    }, 2200);
  }

  /* ==================== 页面骨架 ==================== */
  function aiPageHtml() {
    return '<div class="aif-wrap">' +
      '<div class="aif-cats" id="aifCats"></div>' +
      '<div class="aif-panel">' +
        '<div class="aif-toolbar">' +
          '<div class="aif-tabs" id="aifTabs">' +
            '<div class="aif-tab active" data-tab="all">全部</div>' +
            '<div class="aif-tab" data-tab="liked">我的点赞</div>' +
            '<div class="aif-tab" data-tab="fav">我的收藏</div>' +
          '</div>' +
          '<button class="btn btn-primary" id="aifUploadBtn">+ 上传页面</button>' +
          '<button class="btn" id="aifCustomSortBtn">自定义排序</button>' +
          '<div class="aif-filters">' +
            '<button class="aif-sort-btn" id="aifSortLike" title="按点赞数排序：点击切换降序/升序">' +
              '点赞数<span class="aif-sort-arr"><i class="up">▲</i><i class="down">▼</i></span>' +
            '</button>' +
            '<button class="aif-sort-btn" id="aifSortFav" title="按收藏数排序：点击切换降序/升序">' +
              '收藏数<span class="aif-sort-arr"><i class="up">▲</i><i class="down">▼</i></span>' +
            '</button>' +
            '<select class="aif-select" id="aifStatusSel">' +
              '<option value="">全部状态</option>' +
              '<option value="已发布">已发布</option>' +
              '<option value="未发布">未发布</option>' +
            '</select>' +
            '<select class="aif-select" id="aifUploaderSel"><option value="">全部上传人</option></select>' +
            '<input class="aif-input" id="aifKeyword" placeholder="请输入页面名称">' +
            '<button class="btn btn-primary" id="aifQueryBtn">查询</button>' +
            '<button class="aif-reset-btn" id="aifResetBtn" title="重置">' +
              '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                '<polyline points="23 4 23 10 17 10"/>' +
                '<path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>' +
              '</svg>' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div class="aif-grid" id="aifGrid"></div>' +
        '<div class="aif-footer">' +
          '<div class="aif-total" id="aifTotal"></div>' +
          '<div class="aif-pager" id="aifPager"></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* ==================== 渲染：分类卡片 ==================== */
  function renderCats() {
    var box = el('aifCats');
    if (!box) return;
    var html = '';
    AI_CATS.forEach(function (c) {
      html += '<div class="aif-cat theme-' + c.theme + (aiState.category === c.id ? ' active' : '') + '" data-cat="' + c.id + '">' +
        '<div class="aif-cat-title">' + c.title + '</div>' +
        '<div class="aif-cat-desc">' + c.desc + '</div>' +
        '<div class="aif-cat-art">' + catArt(c.main, c.soft) + '</div>' +
      '</div>';
    });
    box.innerHTML = html;
  }

  /* ==================== 渲染：列表 ==================== */
  function getFiltered() {
    var list = aiPages.slice();
    if (aiState.tab === 'liked') list = list.filter(function (p) { return p.likedByMe; });
    else if (aiState.tab === 'fav') list = list.filter(function (p) { return p.favByMe; });
    if (aiState.category) list = list.filter(function (p) { return p.category === aiState.category; });
    if (aiState.status) list = list.filter(function (p) { return p.status === aiState.status; });
    if (aiState.uploader) list = list.filter(function (p) { return p.uploader === aiState.uploader; });
    if (aiState.keyword) list = list.filter(function (p) { return p.name.indexOf(aiState.keyword) !== -1; });

    if (aiState.sortField === 'like') {
      list.sort(function (a, b) { return aiState.sortDir === 'desc' ? b.likeCount - a.likeCount : a.likeCount - b.likeCount; });
    } else if (aiState.sortField === 'fav') {
      list.sort(function (a, b) { return aiState.sortDir === 'desc' ? b.favCount - a.favCount : a.favCount - b.favCount; });
    }
    return list;
  }

  function cardHtml(p) {
    var cat = catOf(p.category);
    return '<div class="aif-card" data-id="' + p.id + '">' +
      '<div class="aif-thumb" title="点击预览">' +
        '<iframe sandbox="" srcdoc="' + escAttr(p.html) + '" scrolling="no" tabindex="-1"></iframe>' +
        '<span class="aif-thumb-cat">' + cat.title + '</span>' +
        '<div class="aif-thumb-hover">' +
          '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>' +
          '</svg>预览' +
        '</div>' +
      '</div>' +
      '<div class="aif-card-body">' +
        '<div class="aif-card-title">' +
          '<span class="t">' + esc(p.name) + '</span>' +
          '<button class="aif-open-new" title="新标签页打开">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
              '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>' +
              '<polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>' +
            '</svg>' +
          '</button>' +
        '</div>' +
        '<div class="aif-card-info">' +
          '<span class="aif-status-tag ' + (p.status === '已发布' ? 'st-published' : 'st-draft') + '">' + p.status + '</span>' +
          '<div class="aif-card-meta">' + esc(p.uploader) + ' | ' + p.time + '</div>' +
        '</div>' +
        '<div class="aif-card-desc">' + esc(p.desc) + '</div>' +
        '<div class="aif-card-actions">' +
          '<button class="aif-act-btn like-btn' + (p.likedByMe ? ' on' : '') + '" title="' + (p.likedByMe ? '取消点赞' : '点赞') + '">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' +
              '<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3z"/>' +
              '<path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>' +
            '</svg>' +
            '<span class="cnt">' + p.likeCount + '</span>' +
          '</button>' +
          '<button class="aif-act-btn fav-btn' + (p.favByMe ? ' on' : '') + '" title="' + (p.favByMe ? '取消收藏' : '收藏') + '">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' +
              '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>' +
            '</svg>' +
            '<span class="cnt">' + p.favCount + '</span>' +
          '</button>' +
          '<button class="aif-act-more" title="更多">···</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function renderGrid() {
    var grid = el('aifGrid');
    if (!grid) return;
    var list = getFiltered();
    var totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    if (aiState.page > totalPages) aiState.page = totalPages;
    var start = (aiState.page - 1) * PAGE_SIZE;
    var pageItems = list.slice(start, start + PAGE_SIZE);

    if (!pageItems.length) {
      var emptyText = '暂无数据';
      if (aiState.tab === 'liked') emptyText = '暂无点赞的页面，快去给喜欢的页面点个赞吧';
      else if (aiState.tab === 'fav') emptyText = '暂无收藏的页面，点击卡片上的星标即可收藏';
      grid.innerHTML = '<div class="aif-empty">' + emptyText + '</div>';
    } else {
      grid.innerHTML = pageItems.map(cardHtml).join('');
    }

    el('aifTotal').textContent = '共 ' + list.length + ' 条，第 ' + aiState.page + ' / ' + totalPages + ' 页';

    var pagerHtml = '<button class="aif-page-btn" data-pg="prev"' + (aiState.page <= 1 ? ' disabled' : '') + '>&lt;</button>';
    for (var i = 1; i <= totalPages; i++) {
      pagerHtml += '<button class="aif-page-btn' + (i === aiState.page ? ' cur' : '') + '" data-pg="' + i + '">' + i + '</button>';
    }
    pagerHtml += '<button class="aif-page-btn" data-pg="next"' + (aiState.page >= totalPages ? ' disabled' : '') + '>&gt;</button>';
    el('aifPager').innerHTML = pagerHtml;

    setTimeout(fitThumbs, 0);
  }

  /* 缩略图 iframe 宽度自适应缩放 */
  function fitThumbs() {
    var thumbs = document.querySelectorAll('.aif-thumb');
    for (var i = 0; i < thumbs.length; i++) {
      var w = thumbs[i].clientWidth;
      if (!w) continue;
      var iframe = thumbs[i].querySelector('iframe');
      if (iframe) iframe.style.transform = 'scale(' + (w / 1200) + ')';
    }
  }

  /* 上传人下拉重建（保留当前选中） */
  function rebuildUploaderSel() {
    var sel = el('aifUploaderSel');
    if (!sel) return;
    var cur = sel.value;
    var names = [];
    aiPages.forEach(function (p) {
      if (names.indexOf(p.uploader) === -1) names.push(p.uploader);
    });
    var html = '<option value="">全部上传人</option>';
    names.forEach(function (n) {
      html += '<option value="' + escAttr(n) + '"' + (n === cur ? ' selected' : '') + '>' + esc(n) + '</option>';
    });
    sel.innerHTML = html;
  }

  /* ==================== 点赞 / 收藏 ==================== */
  function findPage(id) {
    for (var i = 0; i < aiPages.length; i++) if (aiPages[i].id === id) return aiPages[i];
    return null;
  }

  function toggleLike(id) {
    var p = findPage(id);
    if (!p) return;
    p.likedByMe = !p.likedByMe;
    p.likeCount += p.likedByMe ? 1 : -1;
    renderGrid();
  }

  function toggleFav(id) {
    var p = findPage(id);
    if (!p) return;
    p.favByMe = !p.favByMe;
    p.favCount += p.favByMe ? 1 : -1;
    renderGrid();
  }

  /* ==================== 预览弹窗 ==================== */
  function ensurePreviewModal() {
    var mask = el('aifPreviewMask');
    if (mask) return mask;
    mask = document.createElement('div');
    mask.className = 'aif-modal-mask';
    mask.id = 'aifPreviewMask';
    mask.innerHTML = '<div class="aif-modal">' +
      '<div class="aif-modal-header">' +
        '<span class="aif-modal-title" id="aifPvTitle"></span>' +
        '<span class="aif-modal-meta" id="aifPvMeta"></span>' +
        '<button class="aif-modal-close" id="aifPvClose">&times;</button>' +
      '</div>' +
      '<div class="aif-modal-body"><iframe id="aifPvFrame" sandbox="allow-scripts"></iframe></div>' +
    '</div>';
    document.body.appendChild(mask);
    el('aifPvClose').addEventListener('click', function () { mask.classList.remove('show'); });
    mask.addEventListener('click', function (e) { if (e.target === mask) mask.classList.remove('show'); });
    return mask;
  }

  function openPreview(id) {
    var p = findPage(id);
    if (!p) return;
    var mask = ensurePreviewModal();
    el('aifPvTitle').textContent = p.name;
    el('aifPvMeta').textContent = p.uploader + ' 上传于 ' + p.time;
    el('aifPvFrame').srcdoc = p.html;
    mask.classList.add('show');
  }

  function openNewTab(id) {
    var p = findPage(id);
    if (!p) return;
    var blob = new Blob([p.html], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  /* ==================== 上传弹窗 ==================== */
  function ensureUploadModal() {
    var mask = el('aifUploadMask');
    if (mask) return mask;
    mask = document.createElement('div');
    mask.className = 'aif-modal-mask';
    mask.id = 'aifUploadMask';

    var catOptions = '';
    AI_CATS.forEach(function (c) { catOptions += '<option value="' + c.id + '">' + c.title + '</option>'; });

    mask.innerHTML = '<div class="aif-upmodal">' +
      '<div class="aif-modal-header">' +
        '<span class="aif-modal-title">上传页面</span>' +
        '<button class="aif-modal-close" id="aifUpClose">&times;</button>' +
      '</div>' +
      '<div class="aif-upmodal-body">' +
        '<div class="aif-form-row">' +
          '<div class="aif-form-label"><span class="req">*</span>页面名称</div>' +
          '<div class="aif-form-ctrl"><input class="aif-input" id="aifUpName" placeholder="请输入页面名称"></div>' +
        '</div>' +
        '<div class="aif-form-row">' +
          '<div class="aif-form-label"><span class="req">*</span>所属分类</div>' +
          '<div class="aif-form-ctrl"><select class="aif-select" id="aifUpCat">' + catOptions + '</select></div>' +
        '</div>' +
        '<div class="aif-form-row">' +
          '<div class="aif-form-label">状态</div>' +
          '<div class="aif-form-ctrl"><select class="aif-select" id="aifUpStatus">' +
            '<option value="未发布">未发布</option><option value="已发布">已发布</option>' +
          '</select></div>' +
        '</div>' +
        '<div class="aif-form-row">' +
          '<div class="aif-form-label">页面描述</div>' +
          '<div class="aif-form-ctrl"><textarea id="aifUpDesc" placeholder="请输入页面描述（选填）"></textarea></div>' +
        '</div>' +
        '<div class="aif-form-row">' +
          '<div class="aif-form-label"><span class="req">*</span>HTML文件</div>' +
          '<div class="aif-form-ctrl">' +
            '<input type="file" id="aifUpFile" accept=".html,.htm">' +
            '<div class="aif-file-tip">仅支持 .html / .htm 文件，上传后其他用户可查看</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="aif-upmodal-footer">' +
        '<button class="btn" id="aifUpCancel">取消</button>' +
        '<button class="btn btn-primary" id="aifUpSubmit">确定上传</button>' +
      '</div>' +
    '</div>';
    document.body.appendChild(mask);

    function close() { mask.classList.remove('show'); }
    el('aifUpClose').addEventListener('click', close);
    el('aifUpCancel').addEventListener('click', close);
    mask.addEventListener('click', function (e) { if (e.target === mask) close(); });
    el('aifUpSubmit').addEventListener('click', submitUpload);
    return mask;
  }

  function submitUpload() {
    var name = el('aifUpName').value.trim();
    var cat = el('aifUpCat').value;
    var status = el('aifUpStatus').value;
    var desc = el('aifUpDesc').value.trim();
    var fileInput = el('aifUpFile');
    var file = fileInput.files && fileInput.files[0];

    if (!name) { toast('请输入页面名称', 'info'); return; }
    if (!file) { toast('请选择要上传的 HTML 文件', 'info'); return; }
    if (!/\.html?$/i.test(file.name)) { toast('仅支持 .html / .htm 文件', 'info'); return; }

    var reader = new FileReader();
    reader.onload = function () {
      aiPages.unshift({
        id: 'p' + Date.now(),
        name: name,
        category: cat,
        status: status,
        desc: desc || '暂无描述',
        uploader: CURRENT_USER,
        time: now(),
        html: String(reader.result || ''),
        likeCount: 0, favCount: 0, likedByMe: false, favByMe: false
      });
      el('aifUploadMask').classList.remove('show');
      el('aifUpName').value = '';
      el('aifUpDesc').value = '';
      fileInput.value = '';
      /* 上传成功后切回"全部"标签，便于看到新页面 */
      aiState.tab = 'all';
      aiState.page = 1;
      syncTabs();
      rebuildUploaderSel();
      renderGrid();
      toast('上传成功，其他用户现在可以查看该页面', 'success');
    };
    reader.onerror = function () { toast('文件读取失败，请重试', 'info'); };
    reader.readAsText(file);
  }

  /* ==================== 交互绑定 ==================== */
  function syncTabs() {
    var tabs = el('aifTabs');
    if (!tabs) return;
    var items = tabs.querySelectorAll('.aif-tab');
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle('active', items[i].getAttribute('data-tab') === aiState.tab);
    }
  }

  /* 排序按钮状态同步：激活方向高亮 */
  function syncSortBtns() {
    var pairs = [['aifSortLike', 'like'], ['aifSortFav', 'fav']];
    for (var i = 0; i < pairs.length; i++) {
      var btn = el(pairs[i][0]);
      if (!btn) continue;
      var active = aiState.sortField === pairs[i][1];
      btn.classList.toggle('on', active);
      btn.classList.toggle('desc', active && aiState.sortDir === 'desc');
      btn.classList.toggle('asc', active && aiState.sortDir === 'asc');
    }
  }

  function initAiPage() {
    renderCats();
    rebuildUploaderSel();
    syncTabs();
    renderGrid();

    /* 分类卡片：点击过滤，再点取消 */
    el('aifCats').addEventListener('click', function (e) {
      var card = e.target.closest ? e.target.closest('.aif-cat') : null;
      if (!card) return;
      var catId = card.getAttribute('data-cat');
      aiState.category = (aiState.category === catId) ? null : catId;
      aiState.page = 1;
      renderCats();
      renderGrid();
    });

    /* 我的点赞 / 我的收藏 快捷查询 */
    el('aifTabs').addEventListener('click', function (e) {
      var tab = e.target.closest ? e.target.closest('.aif-tab') : null;
      if (!tab) return;
      aiState.tab = tab.getAttribute('data-tab');
      aiState.page = 1;
      syncTabs();
      renderGrid();
    });

    /* 排序按钮：未选中 → 降序 → 升序 → 取消排序，两个按钮互斥 */
    function bindSortBtn(btnEl, field) {
      btnEl.addEventListener('click', function () {
        if (aiState.sortField !== field) {
          aiState.sortField = field;
          aiState.sortDir = 'desc';
        } else if (aiState.sortDir === 'desc') {
          aiState.sortDir = 'asc';
        } else {
          aiState.sortField = null;
          aiState.sortDir = 'desc';
        }
        aiState.page = 1;
        syncSortBtns();
        renderGrid();
      });
    }
    bindSortBtn(el('aifSortLike'), 'like');
    bindSortBtn(el('aifSortFav'), 'fav');

    /* 查询 */
    el('aifQueryBtn').addEventListener('click', function () {
      aiState.status = el('aifStatusSel').value;
      aiState.uploader = el('aifUploaderSel').value;
      aiState.keyword = el('aifKeyword').value.trim();
      aiState.page = 1;
      renderGrid();
    });

    el('aifKeyword').addEventListener('keydown', function (e) {
      if (e.keyCode === 13) el('aifQueryBtn').click();
    });

    /* 重置 */
    el('aifResetBtn').addEventListener('click', function () {
      el('aifStatusSel').value = '';
      el('aifUploaderSel').value = '';
      el('aifKeyword').value = '';
      aiState = { tab: 'all', category: null, status: '', uploader: '', keyword: '', sortField: null, sortDir: 'desc', page: 1 };
      syncTabs();
      syncSortBtns();
      renderCats();
      renderGrid();
    });

    /* 上传 */
    el('aifUploadBtn').addEventListener('click', function () {
      ensureUploadModal().classList.add('show');
    });

    el('aifCustomSortBtn').addEventListener('click', function () {
      toast('自定义排序为演示功能，可使用右侧点赞数/收藏数排序按钮', 'info');
    });

    /* 卡片事件代理 */
    el('aifGrid').addEventListener('click', function (e) {
      var card = e.target.closest ? e.target.closest('.aif-card') : null;
      var pg = e.target.closest ? e.target.closest('.aif-page-btn') : null;

      if (pg && !pg.disabled) {
        var v = pg.getAttribute('data-pg');
        var totalPages = Math.max(1, Math.ceil(getFiltered().length / PAGE_SIZE));
        if (v === 'prev') aiState.page = Math.max(1, aiState.page - 1);
        else if (v === 'next') aiState.page = Math.min(totalPages, aiState.page + 1);
        else aiState.page = parseInt(v, 10);
        renderGrid();
        return;
      }
      if (!card) return;
      var id = card.getAttribute('data-id');

      if (e.target.closest('.like-btn')) { toggleLike(id); return; }
      if (e.target.closest('.fav-btn')) { toggleFav(id); return; }
      if (e.target.closest('.aif-open-new')) { openNewTab(id); return; }
      if (e.target.closest('.aif-act-more')) { toast('更多操作：编辑 / 删除 / 分享（演示）', 'info'); return; }
      if (e.target.closest('.aif-thumb')) { openPreview(id); return; }
    });
  }

  /* 窗口尺寸变化时重算缩略图缩放 */
  window.addEventListener('resize', function () {
    if (el('aifGrid')) fitThumbs();
  });

  /* ==================== 页面注册与路由挂载 ==================== */
  window.addPage('tool-ai', { title: '大运营AI智造局', content: aiPageHtml });

  var aiOrigRenderPage = window.renderPage;
  window.renderPage = function (id) {
    aiOrigRenderPage(id);
    if (id === 'tool-ai') initAiPage();
  };

})();
