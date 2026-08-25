/* ============================================================
   电站资料审核及整改管理 - 整改任务池 / 整改报表
   依据《OMS端电站资料审核及整改管理业务需求说明书-详细版》实现
   ============================================================ */
(function () {
  'use strict';

  /* ==================== 状态机定义（合规性资料整改端到端业务流程） ==================== */
  /* 节点：任务下发(导入) → 整改问题确认(业务经理) → 整改问题二次确认(区域运营) → 整改执行(业务经理)
     → 整改结果校验(系统/TFS) → 整改结果确认反馈(总部运营) → 整改完成/整改关闭(系统) */
  var RC_STATUS = {
    PENDING_CONFIRM:        { name: '待业务经理确认', cls: 'st-confirm' },
    PENDING_REGION_CONFIRM: { name: '待区域运营二次确认', cls: 'st-region-confirm' },
    PENDING_RECTIFY:        { name: '待整改',         cls: 'st-rectify' },
    PENDING_HQ_REVIEW:      { name: '待总部运营确认整改结果', cls: 'st-hq-review' },
    COMPLETED:              { name: '整改完成',       cls: 'st-completed' },
    CLOSED:                 { name: '整改关闭',       cls: 'st-closed' }
  };
  var RC_STATUS_ORDER = [
    'PENDING_CONFIRM', 'PENDING_REGION_CONFIRM', 'PENDING_RECTIFY', 'PENDING_HQ_REVIEW', 'COMPLETED', 'CLOSED'
  ];

  /* 整改问题枚举（导入模板） */
  var RC_PROBLEM_TYPES = ['购售电合同相关', '备案证明相关', '接入手续相关', '用电缴费辅助审核', '电网编号', '辅助审核材料', '电碳资料', '差价协议'];
  /* 整改分类枚举 */
  var RC_FIX_CATEGORIES = ['资料更新', '特殊闭环', '补充闭环资料'];

  var RC_REGIONS = ['东部区域管理中心', '北部区域管理中心', '中部区域管理中心', '南部区域管理中心', '西部区域管理中心', '西南区域管理中心'];
  var RC_MANAGERS = ['李明轩', '王思琪', '张建国', '刘子涵', '陈雨桐', '杨志远', '张三'];
  var RC_FUNDERS = ['华东新能源基金', '国银新能源租赁', '远东绿色产业基金', '平安基础设施投资'];
  var RC_SALES_DEPTS = ['金融一部', '金融二部', '战略客户部', '大客户部'];
  var RC_RESP_DEPTS = ['责任部门', '户用光伏事业部', '工商业事业部', '运维管理部'];

  /* ==================== 数据构造工具 ==================== */
  /* 问题结构：整改问题(枚举) + 整改分类 + 整改原因 + 整改措施（均来自导入清单）
     status: 待确认/待整改/不可整改/已提交/校验未通过/待总部确认/整改通过/总部驳回 */
  function P(id, problem, category, reason, measure, status, extra) {
    var p = {
      id: id, problem: problem, category: category, reason: reason, measure: measure,
      status: status || '待确认',
      rectifiable: null,          /* 业务经理确认：true 可整改 / false 不可整改 */
      cannotReason: '', regionConfirmed: false,
      fixType: null,              /* TFS资料更新 / 人工补充说明 */
      manualNote: '', attachments: [],
      tfs: null                   /* TFS闭环信息：{ docNo, flowStatus, closedTime, updateTime, archives } */
    };
    if (extra) { for (var k in extra) p[k] = extra[k]; }
    return p;
  }

  function TL(time, actor, role, action, note) {
    return { time: time, actor: actor, role: role, action: action, note: note || '' };
  }

  function T(o) {
    return {
      id: o.id, station: o.station, docNo: o.docNo, user: o.user, address: o.address,
      company: o.company, region: o.region, status: o.status,
      deadline: o.deadline || '', manager: o.manager || '', managerNo: o.managerNo || '',
      managerDept: o.managerDept || '责任部门',
      funder: o.funder || '华东新能源基金',
      salesDept: o.salesDept || '金融一部',
      batch: o.batch || '',               /* 整改批次说明（导入时填写） */
      planDate: o.planDate || '',         /* 计划完成时间（业务经理确认节点填写） */
      actualDate: o.actualDate || '',     /* 实际完成时间（按节点流转自动识别） */
      closeType: o.closeType || '', closeReason: o.closeReason || '',
      feedback: o.feedback || null,       /* 业务经理确认反馈 */
      tags: o.tags || [],
      /* ---- 425报表匹配字段 ---- */
      isStock: o.isStock || '存量',
      province: o.province || '', agent: o.agent || '', salesman: o.salesman || '',
      applyTime: o.applyTime || '', gridTime: o.gridTime || '', capacity: o.capacity || '',
      bizMode: o.bizMode || '', applyStatus: o.applyStatus || '',
      powerNo: o.powerNo || '', powerNoBind: o.powerNoBind || '',
      hasFiling: o.hasFiling || '', hasPpa: o.hasPpa || '',
      createdAt: o.createdAt,
      round: o.round || 1,
      rounds: o.rounds || [],
      problems: o.problems || [],
      timeline: o.timeline || []
    };
  }

  /* TFS闭环信息：单据流程状态 / 最近一次闭环流程完成时间 / 闭环资料更新时间 / 归档资料清单 */
  function tfs(docNo, flowStatus, closedTime, updateTime, archives) {
    return { docNo: docNo, flowStatus: flowStatus, closedTime: closedTime, updateTime: updateTime, archives: archives || [] };
  }

  /* ==================== Mock 数据 ==================== */
  var rcTasks = [
    /* 1. 待业务经理确认（导入即指定责任人工号，自动匹配责任部门） */
    T({
      id: 'ZG20260823001', station: '广东廉江石岭分布式光伏电站', docNo: 'HZZ2026052600877',
      user: '张三', address: '广东省石岭镇石郊村民委员会上探塘村2号', company: '苏州吴中产业园新能源有限公司',
      region: '东部区域管理中心', status: 'PENDING_CONFIRM', deadline: '2026-06-23',
      manager: '张三', managerNo: 'EMP10233', managerDept: '责任部门',
      funder: '华东新能源基金', salesDept: '金融一部', batch: '2026年6月第一批',
      isStock: '存量', province: '广东省公司', agent: '广州粤能代理商', salesman: '刘一帆',
      applyTime: '2026-03-12', gridTime: '2023-06-18', capacity: '12.60kW', bizMode: '户用全款',
      applyStatus: '已并网', powerNo: '0311002200318765', powerNoBind: '已绑定', hasFiling: '否', hasPpa: '否',
      createdAt: '2026-08-19 09:12:33', round: 2,
      problems: [
        P('P1', '购售电合同相关', '资料更新', '购售电合同地址有误', '更新购售电合同地址'),
        P('P2', '备案证明相关', '补充闭环资料', '缺少县级发改部门备案批复扫描件', '补充备案批复扫描件并加盖公章'),
        P('P3', '接入手续相关', '资料更新', '并网验收报告中装机容量与备案容量不一致（5MW/4.8MW）', '核实并统一装机容量口径后更新报告')
      ],
      timeline: [
        TL('2026-08-19 09:12:33', '周敏', '总部运营', '导入整改任务', '批次「2026年6月第一批」，任务下发至责任人 张三（工号 EMP10233），自动匹配责任部门，进入【待业务经理确认】')
      ],
      rounds: [
        { round: 1, frozenTime: '2026-08-01 10:22:37', result: '总部驳回',
          manager: '张三', managerDept: '责任部门', deadline: '2026-06-23', planDate: '2026-06-20', actualDate: '2026-06-21',
          batch: '2026年6月第一批',
          note: '第1轮共1项问题，总部确认驳回：购售电合同地址更新后与备案仍不一致。该轮整改说明、附件与审批意见已冻结保留。',
          problems: [
            P('P1', '购售电合同相关', '资料更新', '购售电合同地址有误', '更新购售电合同地址', '总部驳回', {
              rectifiable: false, cannotReason: '历史合同原件遗失，地址字段无法与备案一致。',
              fixType: 'TFS资料更新',
              tfs: tfs('TFS-CLS-86012', '已闭环', '2026-06-20 15:22:10', '2026-06-20 15:30:44', [{ name: '购售电合同-更新版.pdf', time: '2026-06-20 15:30:44' }])
            })
          ],
          timeline: [
            TL('2026-06-15 11:02:19', '周敏', '总部运营', '导入整改任务', '批次「2026年6月第一批」，任务下发至责任人 张三'),
            TL('2026-06-16 14:32:32', '张三', '业务经理', '整改问题确认', '确认任务，计划完成日期：2026-06-20'),
            TL('2026-06-20 16:10:05', '张三', '业务经理', '提交整改结果', '提交1项问题整改成果，触发系统校验'),
            TL('2026-06-20 16:10:22', '系统', '系统', '整改结果校验通过', '校验通过，任务进入【待总部运营确认整改结果】'),
            TL('2026-08-01 10:22:37', '周敏', '总部运营', '确认整改结果-驳回', '合同地址与备案仍不一致，退回重新整改。原任务下创建第2轮整改记录')
          ]
        }
      ]
    }),
    /* 2. 待业务经理确认 */
    T({
      id: 'ZG20260822002', station: '山东德州平原风电场', docNo: 'HZZ2026081000117',
      user: '孙长河', address: '山东省德州市平原县王凤楼镇', company: '平原鲁能新能源有限公司',
      region: '北部区域管理中心', status: 'PENDING_CONFIRM', deadline: '2026-08-26',
      manager: '张建国', managerNo: 'EMP20876', managerDept: '工商业事业部',
      funder: '国银新能源租赁', salesDept: '金融二部', batch: '2026年8月第二批',
      isStock: '存量', province: '山东省公司', agent: '德州诚信代理商', salesman: '赵磊',
      applyTime: '2026-05-08', gridTime: '2024-11-02', capacity: '50.00kW', bizMode: '工商业租赁',
      applyStatus: '已并网', powerNo: '0311003300872341', powerNoBind: '已绑定', hasFiling: '是', hasPpa: '否',
      createdAt: '2026-08-22 14:02:33',
      problems: [
        P('P1', '备案证明相关', '资料更新', '建设用地规划许可证已过有效期未续期', '提供有效期内证照或续期证明'),
        P('P2', '辅助审核材料', '补充闭环资料', '环评批复扫描件分辨率过低无法辨认批复文号', '重新上传高清扫描件')
      ],
      timeline: [
        TL('2026-08-22 14:02:33', '周敏', '总部运营', '导入整改任务', '批次「2026年8月第二批」，任务下发至责任人 张建国（工号 EMP20876），进入【待业务经理确认】')
      ]
    }),
    /* 3. 待区域运营二次确认（部分不可整改） */
    T({
      id: 'ZG20260821003', station: '河北张家口怀来光伏电站', docNo: 'HZZ2026080200064',
      user: '钱进', address: '河北省张家口市怀来县沙城镇', company: '怀来八达岭光伏有限公司',
      region: '北部区域管理中心', status: 'PENDING_REGION_CONFIRM', deadline: '2026-08-22',
      manager: '张建国', managerNo: 'EMP20876', managerDept: '工商业事业部',
      funder: '华东新能源基金', salesDept: '战略客户部', batch: '2026年8月第一批',
      isStock: '存量', province: '河北省公司', agent: '张家口坝上代理商', salesman: '孙鹏',
      applyTime: '2026-04-19', gridTime: '2024-08-25', capacity: '30.00kW', bizMode: '户用租赁',
      applyStatus: '已并网', powerNo: '0311001200655432', powerNoBind: '已绑定', hasFiling: '是', hasPpa: '是',
      createdAt: '2026-08-19 10:11:05', tags: ['duesoon'],
      feedback: { type: 'cannot', expectDate: '2026-08-21', time: '2026-08-23 11:20:44', note: '组件检测报告可按期更新；“历史土地权属证明”原始档案遗失无法补办，申请标记为不可整改。',
        cannotList: [{ id: 'P2', reason: '历史遗留档案遗失，经当地国土部门确认无法补办，已提供情况说明。' }] },
      problems: [
        P('P1', '辅助审核材料', '资料更新', '组件检测报告超过一年有效期', '提供最新批次组件检测报告', '待整改', { rectifiable: true }),
        P('P2', '备案证明相关', '特殊闭环', '2009年原始土地权属档案遗失，当地国土部门无法补办', '补充权属证明材料', '不可整改', {
          rectifiable: false, cannotReason: '历史遗留档案遗失，经当地国土部门确认无法补办，已提供情况说明。'
        })
      ],
      timeline: [
        TL('2026-08-19 10:11:05', '周敏', '总部运营', '导入整改任务', '批次「2026年8月第一批」，任务下发至责任人 张建国'),
        TL('2026-08-23 11:20:44', '张建国', '业务经理', '整改问题确认', '1项可整改（计划完成 2026-08-21）；1项申请不可整改（备案证明相关），问题原因与整改措施已推送TFS，提交区域运营二次确认')
      ]
    }),
    /* 4. 待区域运营二次确认（超期承诺） */
    T({
      id: 'ZG20260820004', station: '山西大同浑源光伏电站', docNo: 'HZZ2026080700291',
      user: '冯玉兰', address: '山西省大同市浑源县永安镇', company: '浑源恒阳光伏发电有限公司',
      region: '北部区域管理中心', status: 'PENDING_REGION_CONFIRM', deadline: '2026-08-25',
      manager: '张建国', managerNo: 'EMP20876', managerDept: '工商业事业部',
      funder: '远东绿色产业基金', salesDept: '大客户部', batch: '2026年8月第二批',
      isStock: '非存量', province: '山西省公司', agent: '大同恒信代理商', salesman: '马强',
      applyTime: '2026-06-11', gridTime: '2025-03-30', capacity: '80.00kW', bizMode: '工商业自投',
      applyStatus: '已并网', powerNo: '0311004400912876', powerNoBind: '未绑定', hasFiling: '是', hasPpa: '是',
      createdAt: '2026-08-20 08:52:37',
      feedback: { type: 'overdue', expectDate: '2026-08-29', time: '2026-08-23 16:05:21', note: '涉及组件更换备案，厂家出具证明需5个工作日，计划完成时间晚于要求完成时间。' },
      problems: [
        P('P1', '接入手续相关', '资料更新', '安全生产许可证有效期至2026-06-30已过期', '提供换发后的新证', '待整改', { rectifiable: true }),
        P('P2', '购售电合同相关', '补充闭环资料', '电费结算协议缺少电网公司盖章页', '补充完整盖章页', '待整改', { rectifiable: true })
      ],
      timeline: [
        TL('2026-08-20 08:52:37', '周敏', '总部运营', '导入整改任务', '批次「2026年8月第二批」，任务下发至责任人 张建国'),
        TL('2026-08-23 16:05:21', '张建国', '业务经理', '整改问题确认', '全部可整改，计划完成日期 2026-08-29 晚于要求完成时间 2026-08-25，提交区域运营二次确认超期承诺')
      ]
    }),
    /* 5. 待整改（刚确认，未开始处理） */
    T({
      id: 'ZG20260819005', station: '广东梅州五华光伏电站', docNo: 'HZZ2026080300235',
      user: '罗海峰', address: '广东省梅州市五华县水寨镇', company: '五华粤电光伏有限公司',
      region: '南部区域管理中心', status: 'PENDING_RECTIFY', deadline: '2026-08-28', planDate: '2026-08-26',
      manager: '陈雨桐', managerNo: 'EMP30521', managerDept: '户用光伏事业部',
      funder: '远东绿色产业基金', salesDept: '金融一部', batch: '2026年8月第一批',
      isStock: '存量', province: '广东省公司', agent: '梅州兴宁代理商', salesman: '钟敏',
      applyTime: '2026-05-25', gridTime: '2024-12-15', capacity: '25.00kW', bizMode: '户用租赁',
      applyStatus: '已并网', powerNo: '0311002200441238', powerNoBind: '已绑定', hasFiling: '是', hasPpa: '否',
      createdAt: '2026-08-19 13:26:59',
      problems: [
        P('P1', '电网编号', '资料更新', '电网编号与营销系统登记不一致', '核对并更正电网编号信息', '待整改', {
          rectifiable: true,
          tfs: tfs('TFS-CLS-88310', '已闭环', '2026-08-24 10:22:15', '2026-08-24 10:25:30', [{ name: '电网编号更正说明.pdf', time: '2026-08-24 10:25:30' }])
        }),
        P('P2', '备案证明相关', '补充闭环资料', '缺少水保方案批复文件', '补充批复文件', '待整改', {
          rectifiable: true,
          tfs: tfs('TFS-CLS-88311', '已闭环', '2026-08-24 11:05:44', '2026-08-24 11:08:12', [{ name: '水保方案批复.pdf', time: '2026-08-24 11:08:12' }])
        })
      ],
      timeline: [
        TL('2026-08-19 13:26:59', '周敏', '总部运营', '导入整改任务', '批次「2026年8月第一批」，任务下发至责任人 陈雨桐'),
        TL('2026-08-20 09:41:36', '陈雨桐', '业务经理', '整改问题确认', '全部可整改，计划完成日期 2026-08-26，问题原因与整改措施已推送TFS，任务进入【待整改】')
      ]
    }),
    /* 6. 待整改（处理中：1项TFS流程中，1项不可整改已确认，1项待处理） */
    T({
      id: 'ZG20260818006', station: '江苏盐城大丰风电场', docNo: 'HZZ2026080600158',
      user: '吴国栋', address: '江苏省盐城市大丰区三龙镇', company: '大丰港新能源发展有限公司',
      region: '东部区域管理中心', status: 'PENDING_RECTIFY', deadline: '2026-08-20', planDate: '2026-08-19',
      manager: '李明轩', managerNo: 'EMP10032', managerDept: '户用光伏事业部',
      funder: '华东新能源基金', salesDept: '金融二部', batch: '2026年8月第一批',
      isStock: '存量', province: '江苏省公司', agent: '盐城沿海代理商', salesman: '徐斌',
      applyTime: '2026-04-02', gridTime: '2024-09-21', capacity: '60.00kW', bizMode: '工商业租赁',
      applyStatus: '已并网', powerNo: '0311005500238765', powerNoBind: '已绑定', hasFiling: '是', hasPpa: '是',
      createdAt: '2026-08-18 11:38:52', tags: ['duesoon'],
      problems: [
        P('P1', '辅助审核材料', '资料更新', '电能质量检测报告缺少谐波测试章节', '补充完整检测章节', '待整改', {
          rectifiable: true, fixType: 'TFS资料更新',
          tfs: tfs('TFS-CLS-88213', '审批中', '', '', [])
        }),
        P('P2', '接入手续相关', '特殊闭环', '海域使用证正在换发，主管部门已受理未出证', '提供有效证明', '不可整改', {
          rectifiable: false, cannotReason: '海域使用证换发周期约60个工作日，要求时限内无法取得，已提供主管部门受理回执。', regionConfirmed: true
        }),
        P('P3', '备案证明相关', '补充闭环资料', '箱变出厂试验报告第5-8页扫描不清', '重新上传清晰版本', '待整改', {
          rectifiable: true,
          tfs: tfs('TFS-CLS-88255', '已闭环', '2026-08-23 15:41:20', '2026-08-23 15:44:02', [{ name: '箱变出厂试验报告-清晰版.pdf', time: '2026-08-23 15:44:02' }])
        })
      ],
      timeline: [
        TL('2026-08-18 11:38:52', '周敏', '总部运营', '导入整改任务', '批次「2026年8月第一批」，任务下发至责任人 李明轩'),
        TL('2026-08-18 16:40:03', '李明轩', '业务经理', '整改问题确认', '1项申请不可整改（接入手续相关），提交区域运营二次确认'),
        TL('2026-08-19 09:12:35', '林岚', '区域运营', '二次确认通过', '同意“接入手续相关”标记为不可整改，其余问题继续整改，任务进入【待整改】'),
        TL('2026-08-23 14:22:10', '李明轩', '业务经理', 'TFS资料更新', '电能质量检测报告已提交TFS闭环流程（单号 TFS-CLS-88213），流程审批中')
      ]
    }),
    /* 7. 待整改（系统校验未通过退回） */
    T({
      id: 'ZG20260817007', station: '湖北襄阳枣阳光伏电站', docNo: 'HZZ2026080400176',
      user: '何丽君', address: '湖北省襄阳市枣阳市兴隆镇', company: '枣阳汉光新能源有限公司',
      region: '中部区域管理中心', status: 'PENDING_RECTIFY', deadline: '2026-08-24', planDate: '2026-08-22',
      manager: '王思琪', managerNo: 'EMP40115', managerDept: '工商业事业部',
      funder: '平安基础设施投资', salesDept: '战略客户部', batch: '2026年8月第一批',
      isStock: '存量', province: '湖北省公司', agent: '襄阳楚光代理商', salesman: '胡军',
      applyTime: '2026-03-28', gridTime: '2024-07-11', capacity: '45.00kW', bizMode: '工商业自投',
      applyStatus: '已并网', powerNo: '0311006600773421', powerNoBind: '已绑定', hasFiling: '否', hasPpa: '是',
      createdAt: '2026-08-17 09:17:26',
      problems: [
        P('P1', '接入手续相关', '补充闭环资料', '缺少省电网公司接入批复文件', '补充接入系统批复文件', '校验未通过', {
          rectifiable: true, fixType: 'TFS资料更新',
          tfs: tfs('TFS-CLS-88290', '已闭环', '2026-08-15 10:05:33', '2026-08-15 10:05:33', [{ name: '接入系统批复.pdf', time: '2026-08-15 10:05:33' }]),
          checkMsg: '闭环时间 2026-08-15 10:05:33 早于任务下发时间 2026-08-17 09:17:26，需重新发起闭环流程'
        }),
        P('P2', '辅助审核材料', '资料更新', '消防验收意见书缺少消防部门验收专用章', '补充完整验收意见书', '待整改', {
          rectifiable: true,
          tfs: tfs('TFS-CLS-88291', '已闭环', '2026-08-22 10:15:20', '2026-08-22 10:18:42', [{ name: '消防验收意见书-补章版.pdf', time: '2026-08-22 10:18:42' }])
        })
      ],
      timeline: [
        TL('2026-08-17 09:17:26', '周敏', '总部运营', '导入整改任务', '批次「2026年8月第一批」，任务下发至责任人 王思琪'),
        TL('2026-08-18 15:44:18', '王思琪', '业务经理', '整改问题确认', '全部可整改，计划完成日期 2026-08-22，任务进入【待整改】'),
        TL('2026-08-22 09:30:52', '王思琪', '业务经理', '提交整改结果', '提交2项问题整改成果，触发系统校验'),
        TL('2026-08-22 09:31:05', '系统', '系统', '整改结果校验未通过', '「接入手续相关」闭环时间早于任务下发时间，校验不通过，任务保持【待整改】，已通知业务经理')
      ]
    }),
    /* 8. 待总部运营确认整改结果（全部校验通过） */
    T({
      id: 'ZG20260816008', station: '浙江温州苍南光伏电站', docNo: 'HZZ2026080100092',
      user: '谢明玉', address: '浙江省温州市苍南县灵溪镇', company: '苍南瓯光新能源有限公司',
      region: '东部区域管理中心', status: 'PENDING_HQ_REVIEW', deadline: '2026-08-21', planDate: '2026-08-16',
      manager: '李明轩', managerNo: 'EMP10032', managerDept: '户用光伏事业部',
      funder: '国银新能源租赁', salesDept: '金融二部', batch: '2026年8月第一批',
      isStock: '存量', province: '浙江省公司', agent: '温州瓯江代理商', salesman: '林芳',
      applyTime: '2026-04-15', gridTime: '2024-10-08', capacity: '35.00kW', bizMode: '户用租赁',
      applyStatus: '已并网', powerNo: '0311007700189234', powerNoBind: '已绑定', hasFiling: '是', hasPpa: '是',
      createdAt: '2026-08-16 10:41:15',
      problems: [
        P('P1', '购售电合同相关', '资料更新', '电力业务许可证法人名称与营业执照不一致', '核实法人名称并更新证照', '待总部确认', {
          rectifiable: true, fixType: 'TFS资料更新',
          tfs: tfs('TFS-CLS-88102', '已闭环', '2026-08-22 09:33:27', '2026-08-22 09:35:10', [{ name: '电力业务许可证.pdf', time: '2026-08-22 09:35:10' }])
        }),
        P('P2', '电碳资料', '补充闭环资料', '缺少绿电交易凭证附件', '补充上传绿电交易凭证', '待总部确认', {
          rectifiable: true, fixType: 'TFS资料更新',
          tfs: tfs('TFS-CLS-88105', '已闭环', '2026-08-22 11:02:44', '2026-08-22 11:05:31', [{ name: '绿电交易凭证.pdf', time: '2026-08-22 11:05:31' }])
        })
      ],
      timeline: [
        TL('2026-08-16 10:41:15', '周敏', '总部运营', '导入整改任务', '批次「2026年8月第一批」，任务下发至责任人 李明轩'),
        TL('2026-08-17 14:12:08', '李明轩', '业务经理', '整改问题确认', '全部可整改，计划完成日期 2026-08-16，任务进入【待整改】'),
        TL('2026-08-23 17:20:43', '李明轩', '业务经理', '提交整改结果', '2项问题处理完成，触发系统校验'),
        TL('2026-08-23 17:21:02', '系统', '系统', '整改结果校验通过', '2项问题均满足：TFS单据已闭环、闭环时间晚于任务下发时间、闭环资料更新时间晚于任务下发时间，任务进入【待总部运营确认整改结果】')
      ]
    }),
    /* 9. 待总部运营确认整改结果（含不可整改项） */
    T({
      id: 'ZG20260815009', station: '安徽阜阳颍上光伏电站', docNo: 'HZZ2026072800203',
      user: '郑立新', address: '安徽省阜阳市颍上县八里河镇', company: '颍上皖能光伏有限公司',
      region: '东部区域管理中心', status: 'PENDING_HQ_REVIEW', deadline: '2026-08-28', planDate: '2026-08-26',
      manager: '陈雨桐', managerNo: 'EMP30521', managerDept: '户用光伏事业部',
      funder: '华东新能源基金', salesDept: '大客户部', batch: '2026年8月第一批',
      isStock: '存量', province: '安徽省公司', agent: '阜阳皖北代理商', salesman: '王强',
      applyTime: '2026-05-06', gridTime: '2024-11-19', capacity: '20.00kW', bizMode: '户用租赁',
      applyStatus: '已并网', powerNo: '0311008800552198', powerNoBind: '已绑定', hasFiling: '是', hasPpa: '是',
      createdAt: '2026-08-15 16:08:49',
      problems: [
        P('P1', '差价协议', '资料更新', '差价协议签约主体与项目公司不一致', '更正签约主体并重新上传协议', '待总部确认', {
          rectifiable: true,
          tfs: tfs('TFS-CLS-88017', '已闭环', '2026-08-21 11:27:53', '2026-08-21 11:30:02', [{ name: '差价协议-更正版.pdf', time: '2026-08-21 11:30:02' }])
        }),
        P('P2', '备案证明相关', '特殊闭环', '压覆矿产资源批复属历史遗留无法补办', '提供压覆批复文件', '不可整改', {
          rectifiable: false, cannotReason: '历史矿区重叠批复属于政策性遗留问题，经与自然资源部门确认无法补办。', regionConfirmed: true
        })
      ],
      timeline: [
        TL('2026-08-15 16:08:49', '周敏', '总部运营', '导入整改任务', '批次「2026年8月第一批」，任务下发至责任人 陈雨桐'),
        TL('2026-08-16 10:22:37', '陈雨桐', '业务经理', '整改问题确认', '1项申请不可整改，提交区域运营二次确认'),
        TL('2026-08-17 09:18:26', '沈静', '区域运营', '二次确认通过', '同意“备案证明相关”标记为不可整改'),
        TL('2026-08-23 16:02:11', '陈雨桐', '业务经理', '提交整改结果', '1项可整改问题处理完成，触发系统校验'),
        TL('2026-08-23 16:02:30', '系统', '系统', '整改结果校验通过', '校验通过，任务进入【待总部运营确认整改结果】')
      ]
    }),
    /* 10. 整改完成 */
    T({
      id: 'ZG20260710010', station: '福建漳州云霄光伏电站', docNo: 'HZZ2026070100123',
      user: '蔡文博', address: '福建省漳州市云霄县莆美镇', company: '云霄闽光新能源有限公司',
      region: '东部区域管理中心', status: 'COMPLETED', deadline: '2026-07-20', planDate: '2026-07-18', actualDate: '2026-07-25',
      manager: '李明轩', managerNo: 'EMP10032', managerDept: '户用光伏事业部',
      funder: '平安基础设施投资', salesDept: '金融一部', batch: '2026年7月第一批',
      isStock: '存量', province: '福建省公司', agent: '漳州闽南代理商', salesman: '陈丽',
      applyTime: '2026-03-08', gridTime: '2024-05-27', capacity: '15.00kW', bizMode: '户用全款',
      applyStatus: '已并网', powerNo: '0311009900334456', powerNoBind: '已绑定', hasFiling: '是', hasPpa: '是',
      createdAt: '2026-07-10 09:33:14',
      problems: [
        P('P1', '备案证明相关', '补充闭环资料', '缺少竣工环保验收报告', '补充验收报告', '整改通过', {
          rectifiable: true, fixType: 'TFS资料更新',
          tfs: tfs('TFS-CLS-87561', '已闭环', '2026-07-18 14:02:16', '2026-07-18 14:05:41', [{ name: '环保验收报告.pdf', time: '2026-07-18 14:05:41' }])
        }),
        P('P2', '辅助审核材料', '资料更新', '安评报告超过两年有效期', '提供最新评价报告', '整改通过', {
          rectifiable: true, fixType: 'TFS资料更新',
          tfs: tfs('TFS-CLS-87562', '已闭环', '2026-07-18 14:05:41', '2026-07-18 14:08:22', [{ name: '安评报告.pdf', time: '2026-07-18 14:08:22' }])
        })
      ],
      timeline: [
        TL('2026-07-10 09:33:14', '周敏', '总部运营', '导入整改任务', '批次「2026年7月第一批」，任务下发至责任人 李明轩'),
        TL('2026-07-18 16:44:52', '李明轩', '业务经理', '提交整改结果', '2项问题处理完成，触发系统校验'),
        TL('2026-07-18 16:45:10', '系统', '系统', '整改结果校验通过', '2项问题校验均通过，任务进入【待总部运营确认整改结果】'),
        TL('2026-07-25 15:30:00', '周敏', '总部运营', '确认整改结果', '整改结果确认通过，任务进入【整改完成】，实际完成时间 2026-07-25')
      ]
    }),
    /* 11. 整改关闭（全部不可整改经审批） */
    T({
      id: 'ZG20260601011', station: '江西赣州南康光伏电站', docNo: 'HZZ2026060100077',
      user: '赖春华', address: '江西省赣州市南康区镜坝镇', company: '南康赣能光伏有限公司',
      region: '中部区域管理中心', status: 'CLOSED', closeType: '不可整改',
      closeReason: '全部问题均为历史遗留政策性文件缺失，经区域运营二次确认、总部运营审批后关闭。',
      deadline: '2026-06-30', planDate: '2026-06-28', actualDate: '2026-06-18',
      manager: '王思琪', managerNo: 'EMP40115', managerDept: '工商业事业部',
      funder: '华东新能源基金', salesDept: '战略客户部', batch: '2026年6月第一批',
      isStock: '存量', province: '江西省公司', agent: '赣州南岭代理商', salesman: '刘敏',
      applyTime: '2026-02-14', gridTime: '2023-12-09', capacity: '18.00kW', bizMode: '户用租赁',
      applyStatus: '已并网', powerNo: '0311011100221109', powerNoBind: '已绑定', hasFiling: '是', hasPpa: '是',
      createdAt: '2026-06-01 10:05:29',
      problems: [
        P('P1', '备案证明相关', '特殊闭环', '建站时未办理文物勘探，现无法补办', '提供文物勘探批复', '不可整改', {
          rectifiable: false, cannotReason: '建站于2012年，文物部门确认无法事后补办。', regionConfirmed: true
        }),
        P('P2', '接入手续相关', '特殊闭环', '林地手续属历史遗留问题', '提供林地批复', '不可整改', {
          rectifiable: false, cannotReason: '涉及2012年历史林地手续，林草部门无法补办。', regionConfirmed: true
        })
      ],
      timeline: [
        TL('2026-06-01 10:05:29', '周敏', '总部运营', '导入整改任务', '批次「2026年6月第一批」，任务下发至责任人 王思琪'),
        TL('2026-06-03 09:40:11', '王思琪', '业务经理', '整改问题确认', '2项问题均申请不可整改，提交区域运营二次确认'),
        TL('2026-06-04 10:26:54', '蒙娜', '区域运营', '二次确认通过', '全部问题确认不可整改，提交总部运营审批'),
        TL('2026-06-18 15:20:37', '周敏', '总部运营', '确认整改结果', '全部不可整改单审批通过，任务进入【整改关闭】，关闭类型：不可整改')
      ]
    }),
    /* 12. 整改关闭（总部运营手动关闭） */
    T({
      id: 'ZG20260615012', station: '陕西榆林靖边风电场', docNo: 'HZZ2026061500145',
      user: '马建军', address: '陕西省榆林市靖边县东坑镇', company: '靖边秦风新能源有限公司',
      region: '西部区域管理中心', status: 'CLOSED', closeType: '手动关闭',
      closeReason: '经核实，导入清单中该电站问题整改要求与资方最新审核结论重复，总部运营手动关闭。',
      deadline: '2026-06-30', actualDate: '2026-06-20',
      manager: '杨志远', managerNo: 'EMP50098', managerDept: '运维管理部',
      funder: '远东绿色产业基金', salesDept: '大客户部', batch: '2026年6月第二批',
      isStock: '存量', province: '陕西省公司', agent: '榆林塞北代理商', salesman: '高翔',
      applyTime: '2026-01-22', gridTime: '2023-08-14', capacity: '100.00kW', bizMode: '工商业自投',
      applyStatus: '已并网', powerNo: '0311022200889901', powerNoBind: '未绑定', hasFiling: '是', hasPpa: '是',
      createdAt: '2026-06-15 11:47:36',
      problems: [
        P('P1', '电碳资料', '资料更新', '碳减排核算报告版本过期', '更新核算报告', '待整改', { rectifiable: true })
      ],
      timeline: [
        TL('2026-06-15 11:47:36', '周敏', '总部运营', '导入整改任务', '批次「2026年6月第二批」，任务下发至责任人 杨志远'),
        TL('2026-06-20 14:05:52', '周敏', '总部运营', '手动关闭', '整改要求与资方最新审核结论重复，手动关闭任务，进入【整改关闭】')
      ]
    })
  ];

  /* ==================== 页面状态 ==================== */
  var poolState = {
    tab: 'ALL',
    filters: { taskNo: '', docNo: '', status: '', region: '', batch: '', funder: '', salesDept: '', respDept: '', manager: '', rectifiable: '', overdue: '', from: '', to: '' },
    page: 1,
    pageSize: 10,
    selected: {}
  };

  /* ==================== 通用工具 ==================== */
  function el(id) { return document.getElementById(id); }

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function findTask(id) {
    for (var i = 0; i < rcTasks.length; i++) if (rcTasks[i].id === id) return rcTasks[i];
    return null;
  }

  function todayStr() {
    var d = new Date();
    var m = ('0' + (d.getMonth() + 1)).slice(-2);
    var day = ('0' + d.getDate()).slice(-2);
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function nowStr() {
    var d = new Date();
    var p = function (n) { return ('0' + n).slice(-2); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
      p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  function dateCmp(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }

  /* 时限判断：资方要求完成时间按自然日，超过当天23:59:59且未提交判定超期 */
  function deadlineInfo(task) {
    if (!task.deadline) return { label: '未设置', cls: '' };
    if (task.status === 'COMPLETED' || task.status === 'CLOSED') return { label: '—', cls: '' };
    if (task.status === 'PENDING_HQ_REVIEW') return { label: '已提交', cls: '' };
    var today = todayStr();
    if (dateCmp(today, task.deadline) > 0) return { label: '已超期', cls: 'overdue', overdue: true };
    var diff = Math.round((new Date(task.deadline) - new Date(today)) / 86400000);
    if (diff <= 3) return { label: '临期(剩' + diff + '天)', cls: 'duesoon', duesoon: true };
    return { label: '剩' + diff + '天', cls: '' };
  }

  function pushTL(task, actor, role, action, note) {
    task.timeline.push(TL(nowStr(), actor, role, action, note));
  }

  /* ---------- Toast ---------- */
  function toast(msg, type) {
    var wrap = document.querySelector('.rc-toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'rc-toast-wrap';
      document.body.appendChild(wrap);
    }
    var t = document.createElement('div');
    t.className = 'rc-toast ' + (type || 'info');
    var icon = type === 'success' ? '✓' : (type === 'error' ? '✕' : 'ℹ');
    var color = type === 'success' ? '#52c41a' : (type === 'error' ? '#f5222d' : '#4facfe');
    t.innerHTML = '<span style="color:' + color + ';font-weight:600;">' + icon + '</span><span>' + esc(msg) + '</span>';
    wrap.appendChild(t);
    setTimeout(function () {
      t.style.opacity = '0';
      t.style.transition = 'opacity .3s';
      setTimeout(function () { t.remove(); }, 320);
    }, 3200);
  }

  /* ---------- 弹窗 ---------- */
  var rcModalEl = null;

  function openModal(opt) {
    closeModal();
    var mask = document.createElement('div');
    mask.className = 'rc-mask';
    var roleHtml = opt.role ? '<span class="rc-modal-role">操作角色：' + esc(opt.role) + '</span>' : '';
    var titleContent = opt.titleHtml || esc(opt.title);
    mask.innerHTML =
      '<div class="rc-modal" style="width:' + (opt.width || 560) + 'px">' +
        '<div class="rc-modal-header">' +
          '<div class="rc-modal-title">' + titleContent + roleHtml + '</div>' +
          '<button class="rc-modal-close" data-rc-close>&times;</button>' +
        '</div>' +
        '<div class="rc-modal-body">' + opt.body + '</div>' +
        '<div class="rc-modal-footer"></div>' +
      '</div>';
    document.body.appendChild(mask);
    rcModalEl = mask;

    var footer = mask.querySelector('.rc-modal-footer');
    (opt.footer || []).forEach(function (btn, idx) {
      var b = document.createElement('button');
      b.className = 'rc-btn ' + (btn.cls || '');
      b.textContent = btn.text;
      b.addEventListener('click', function () { btn.onClick && btn.onClick(); });
      footer.appendChild(b);
    });

    mask.addEventListener('mousedown', function (e) { if (e.target === mask) closeModal(); });
    mask.querySelector('[data-rc-close]').addEventListener('click', closeModal);
    if (opt.onOpen) opt.onOpen(mask);
  }

  function closeModal() {
    if (rcModalEl) { rcModalEl.remove(); rcModalEl = null; }
  }

  /* ---------- 抽屉 ---------- */
  var rcDrawerEls = null;

  function openDrawer(opt) {
    closeDrawer();
    var mask = document.createElement('div');
    mask.className = 'rc-drawer-mask';
    var drawer = document.createElement('div');
    drawer.className = 'rc-drawer';
    if (opt.width) drawer.style.width = opt.width + 'px';
    drawer.innerHTML =
      '<div class="rc-drawer-header">' +
        '<div>' +
          '<div class="rc-drawer-title">' + opt.titleHtml + '</div>' +
          (opt.subTitle ? '<div class="rc-drawer-sub">' + esc(opt.subTitle) + '</div>' : '') +
        '</div>' +
        '<button class="rc-modal-close" data-rc-close>&times;</button>' +
      '</div>' +
      '<div class="rc-drawer-body">' + opt.body + '</div>' +
      (opt.footerHtml ? '<div class="rc-drawer-footer">' + opt.footerHtml + '</div>' : '');
    document.body.appendChild(mask);
    document.body.appendChild(drawer);
    rcDrawerEls = { mask: mask, drawer: drawer };
    mask.addEventListener('click', closeDrawer);
    drawer.querySelector('[data-rc-close]').addEventListener('click', closeDrawer);
    if (opt.onOpen) opt.onOpen(drawer);
  }

  function closeDrawer() {
    if (rcDrawerEls) {
      rcDrawerEls.mask.remove();
      rcDrawerEls.drawer.remove();
      rcDrawerEls = null;
    }
  }

  /* ==================== 任务池页面 ==================== */
  function optsHtml(list, allText) {
    return '<option value="">' + (allText || '请选择') + '</option>' + list.map(function (v) {
      return '<option value="' + v + '">' + v + '</option>';
    }).join('');
  }

  /* 是否可整改推导：全部问题不可整改→不可整改；部分→部分整改；已确认均可整改→可整改；未确认→— */
  function rectifiableOf(t) {
    if (t.status === 'CLOSED' && t.closeType === '不可整改') return '不可整改';
    var confirmed = t.problems.filter(function (p) { return p.status === '不可整改' && p.regionConfirmed; }).length;
    if (confirmed > 0) return confirmed === t.problems.length ? '不可整改' : '部分整改';
    if (t.status === 'PENDING_CONFIRM' || t.status === 'PENDING_REGION_CONFIRM') return '—';
    if (t.status === 'CLOSED') return '—';
    return '可整改';
  }

  function poolPageHtml() {
    return '' +
    '<div class="rc-page">' +
      '<div class="rc-card rc-filter-card">' +
        '<div class="rc-filter-grid rc-filter-grid-4">' +
          '<div class="rc-field"><label>任务编号</label><div class="rc-input-batch"><input id="rc-f-taskno" type="text" placeholder="请输入"><span class="rc-batch-ico" data-batch="taskno" title="批量查询">☰</span></div></div>' +
          '<div class="rc-field"><label>申请公文号</label><div class="rc-input-batch"><input id="rc-f-docno" type="text" placeholder="请输入"><span class="rc-batch-ico" data-batch="docno" title="批量查询">☰</span></div></div>' +
          '<div class="rc-field"><label>整改状态</label><select id="rc-f-status"><option value="">请选择</option>' +
            RC_STATUS_ORDER.map(function (s) { return '<option value="' + s + '">' + RC_STATUS[s].name + '</option>'; }).join('') +
          '</select></div>' +
          '<div class="rc-field"><label>所属区域</label><select id="rc-f-region">' + optsHtml(RC_REGIONS) + '</select></div>' +
          '<div class="rc-field"><label>整改批次</label><input id="rc-f-round" type="text" placeholder="请输入批次说明"></div>' +
          '<div class="rc-field"><label>资方机构</label><select id="rc-f-funder">' + optsHtml(RC_FUNDERS) + '</select></div>' +
          '<div class="rc-field"><label>销售部门</label><select id="rc-f-salesdept">' + optsHtml(RC_SALES_DEPTS) + '</select></div>' +
          '<div class="rc-field"><label>责任部门</label><select id="rc-f-respdept">' + optsHtml(RC_RESP_DEPTS) + '</select></div>' +
          '<div class="rc-field"><label>责任人</label><input id="rc-f-manager" type="text" placeholder="请输入"></div>' +
          '<div class="rc-field"><label>是否可整改</label><select id="rc-f-rectifiable"><option value="">请选择</option><option value="可整改">可整改</option><option value="部分整改">部分整改</option><option value="不可整改">不可整改</option></select></div>' +
          '<div class="rc-field"><label>超期状态</label><select id="rc-f-overdue"><option value="">请选择</option><option value="normal">正常</option><option value="duesoon">即将超期</option><option value="overdue">已超期</option></select></div>' +
          '<div class="rc-field rc-field-range"><label>要求完成日期</label><input id="rc-f-from" type="date" placeholder="请选择"><span class="rc-range-sep">~</span><input id="rc-f-to" type="date" placeholder="请选择"></div>' +
        '</div>' +
        '<div class="rc-filter-actions">' +
          '<button class="rc-btn" id="rc-f-reset">重置</button>' +
          '<button class="rc-btn rc-btn-primary" id="rc-f-search">查询</button>' +
        '</div>' +
      '</div>' +
      '<div class="rc-card">' +
        '<div class="rc-toolbar">' +
          '<button class="rc-btn rc-btn-primary" id="rcImport">导入整改任务</button>' +
          '<span class="rc-toolbar-sel" id="rcSelInfo"></span>' +
          '<button class="rc-btn" id="rcExport">导出</button>' +
        '</div>' +
        '<div class="rc-table-wrap" id="rcTableWrap"></div>' +
        '<div class="rc-pager" id="rcPager"></div>' +
      '</div>' +
    '</div>';
  }

  function poolFiltered() {
    var f = poolState.filters;
    return rcTasks.filter(function (t) {
      if (f.status && t.status !== f.status) return false;
      if (f.region && t.region !== f.region) return false;
      if (f.funder && t.funder !== f.funder) return false;
      if (f.salesDept && t.salesDept !== f.salesDept) return false;
      if (f.respDept && t.managerDept !== f.respDept) return false;
      if (f.manager && t.manager.indexOf(f.manager) === -1) return false;
      if (f.rectifiable && rectifiableOf(t) !== f.rectifiable) return false;
      if (f.batch && (!t.batch || t.batch.indexOf(f.batch) === -1)) return false;
      if (f.overdue) {
        var info = deadlineInfo(t);
        if (f.overdue === 'overdue' && !info.overdue) return false;
        if (f.overdue === 'duesoon' && !info.duesoon) return false;
        if (f.overdue === 'normal' && (info.overdue || info.duesoon)) return false;
      }
      if (f.from && (!t.deadline || t.deadline < f.from)) return false;
      if (f.to && (!t.deadline || t.deadline > f.to)) return false;
      if (f.taskNo) {
        var nos = f.taskNo.toLowerCase().split(/[\s,，、;；]+/).filter(Boolean);
        if (!nos.some(function (n) { return t.id.toLowerCase().indexOf(n) !== -1; })) return false;
      }
      if (f.docNo) {
        var docs = f.docNo.toLowerCase().split(/[\s,，、;；]+/).filter(Boolean);
        if (!docs.some(function (n) { return t.docNo.toLowerCase().indexOf(n) !== -1; })) return false;
      }
      return true;
    });
  }

  function taskTagsHtml(t) {
    var tags = '';
    if (t.round >= 2) tags += '<span class="rc-tag tag-round">第' + t.round + '轮</span>';
    if (t.tags.indexOf('syncing') !== -1) tags += '<span class="rc-tag tag-syncing">TFS推送中</span>';
    if (t.tags.indexOf('syncerr') !== -1) tags += '<span class="rc-tag tag-syncerr">TFS推送异常</span>';
    return tags ? '<div class="rc-tags">' + tags + '</div>' : '';
  }

  /* 要求完成日期单元格：即将超期(3天内)黄色、已超期红色 */
  function deadlineCellHtml(t) {
    if (!t.deadline) return '<td>—</td>';
    var info = deadlineInfo(t);
    if (info.overdue) return '<td><span class="rc-date-overdue">' + t.deadline + '</span> <span class="rc-date-flag flag-overdue">已超期</span></td>';
    if (info.duesoon) return '<td><span class="rc-date-duesoon">' + t.deadline + '</span> <span class="rc-date-flag flag-duesoon">即将超期</span></td>';
    return '<td>' + t.deadline + '</td>';
  }

  function renderPoolTable() {
    var list = poolFiltered();
    var totalPages = Math.max(1, Math.ceil(list.length / poolState.pageSize));
    if (poolState.page > totalPages) poolState.page = totalPages;
    var start = (poolState.page - 1) * poolState.pageSize;
    var pageList = list.slice(start, start + poolState.pageSize);

    var html = '<table class="rc-table">' +
      '<thead><tr>' +
        '<th style="width:36px"><input type="checkbox" id="rcCheckAll"></th>' +
        '<th style="width:126px">任务编号</th>' +
        '<th style="min-width:210px">申请公文号/户主姓名/电站地址</th>' +
        '<th style="width:150px">整改状态</th>' +
        '<th style="width:84px">是否可整改</th>' +
        '<th style="width:130px">资方机构</th>' +
        '<th style="width:140px">所属区域/项目公司</th>' +
        '<th style="width:86px">销售部门</th>' +
        '<th style="width:96px">责任人</th>' +
        '<th style="width:130px">要求完成日期</th>' +
        '<th style="width:104px">计划完成日期</th>' +
        '<th style="width:104px">实际完成日期</th>' +
        '<th style="width:60px">操作</th>' +
      '</tr></thead><tbody>';

    if (!pageList.length) {
      html += '<tr><td colspan="13" style="text-align:center;padding:48px 0;color:#999;">暂无符合条件的整改任务</td></tr>';
    }

    pageList.forEach(function (t) {
      var st = RC_STATUS[t.status];
      var checked = poolState.selected[t.id] ? ' checked' : '';
      var rect = rectifiableOf(t);
      var rectCls = rect === '不可整改' ? 'rc-rect-no' : (rect === '部分整改' ? 'rc-rect-part' : '');
      html += '<tr>' +
        '<td><input type="checkbox" class="rc-row-check" data-id="' + t.id + '"' + checked + '></td>' +
        '<td><span class="rc-task-no" data-act="detail" data-id="' + t.id + '">' + t.id + '</span>' + taskTagsHtml(t) + '</td>' +
        '<td class="rc-cell-lines">' +
          '<div class="rc-line-main">' + esc(t.docNo) + '</div>' +
          '<div class="rc-line-name">' + esc(t.user) + '</div>' +
          '<div class="rc-line-sub" title="' + esc(t.address) + '">' + esc(t.address) + '</div>' +
        '</td>' +
        '<td><span class="rc-pill ' + st.cls + '">' + st.name + '</span></td>' +
        '<td><span class="' + rectCls + '">' + rect + '</span></td>' +
        '<td>' + esc(t.funder) + '</td>' +
        '<td class="rc-cell-lines">' +
          '<div class="rc-line-main2">' + esc(t.region) + '</div>' +
          '<div class="rc-line-sub" title="' + esc(t.company) + '">' + esc(t.company) + '</div>' +
        '</td>' +
        '<td>' + esc(t.salesDept) + '</td>' +
        '<td class="rc-cell-lines">' +
          '<div class="rc-line-main2">' + (t.manager ? esc(t.manager) : '<span style="color:#bbb">未分派</span>') + '</div>' +
          (t.manager ? '<div class="rc-line-sub">' + esc(t.managerDept) + '</div>' : '') +
        '</td>' +
        deadlineCellHtml(t) +
        '<td>' + (t.planDate || '—') + '</td>' +
        '<td>' + (t.actualDate || '—') + '</td>' +
        '<td><button class="rc-link" data-act="detail" data-id="' + t.id + '">详情</button></td>' +
      '</tr>';
    });

    html += '</tbody></table>';
    el('rcTableWrap').innerHTML = html;
    bindTableEvents(pageList);
    renderPager(list.length, totalPages);
    updateSelInfo();
  }

  /* ---------- 复选框 / 选中 ---------- */
  function bindTableEvents(pageList) {
    var checkAll = el('rcCheckAll');
    if (checkAll) {
      checkAll.checked = pageList.length > 0 && pageList.every(function (t) { return poolState.selected[t.id]; });
      checkAll.addEventListener('change', function () {
        var on = this.checked;
        pageList.forEach(function (t) {
          if (on) poolState.selected[t.id] = true; else delete poolState.selected[t.id];
        });
        renderPoolTable();
      });
    }
    el('rcTableWrap').querySelectorAll('.rc-row-check').forEach(function (ck) {
      ck.addEventListener('change', function () {
        var id = this.getAttribute('data-id');
        if (this.checked) poolState.selected[id] = true; else delete poolState.selected[id];
        var all = el('rcCheckAll');
        if (all) {
          var rows = el('rcTableWrap').querySelectorAll('.rc-row-check');
          all.checked = rows.length > 0 && Array.prototype.every.call(rows, function (r) { return poolState.selected[r.getAttribute('data-id')]; });
        }
        updateSelInfo();
      });
    });
  }

  function updateSelInfo() {
    var n = Object.keys(poolState.selected).length;
    var info = el('rcSelInfo');
    if (info) info.textContent = n ? '已选 ' + n + ' 项' : '';
  }

  /* ---------- 分页：共X条记录 第X/X页 + 页码 + 每页条数 + 跳至 ---------- */
  function renderPager(total, totalPages) {
    var html = '<span class="rc-pager-total">共 ' + total + ' 条记录 第 ' + poolState.page + ' / ' + totalPages + ' 页</span>' +
      '<button class="rc-page-btn" id="rcPrev"' + (poolState.page <= 1 ? ' disabled' : '') + '>&lt;</button>';
    var pages = pagerNumbers(poolState.page, totalPages);
    pages.forEach(function (p) {
      if (p === '…') html += '<span class="rc-page-ellipsis">…</span>';
      else html += '<button class="rc-page-btn' + (p === poolState.page ? ' active' : '') + '" data-page="' + p + '">' + p + '</button>';
    });
    html += '<button class="rc-page-btn" id="rcNext"' + (poolState.page >= totalPages ? ' disabled' : '') + '>&gt;</button>' +
      '<select class="rc-page-size" id="rcPageSize">' +
        [10, 20, 50].map(function (n) { return '<option value="' + n + '"' + (poolState.pageSize === n ? ' selected' : '') + '>' + n + '条/页</option>'; }).join('') +
      '</select>' +
      '<span class="rc-pager-jump">跳至 <input type="number" id="rcJump" min="1" max="' + totalPages + '" value="' + poolState.page + '"> 页</span>';
    el('rcPager').innerHTML = html;

    var prev = el('rcPrev'), next = el('rcNext');
    if (prev) prev.addEventListener('click', function () { poolState.page--; renderPoolTable(); });
    if (next) next.addEventListener('click', function () { poolState.page++; renderPoolTable(); });
    el('rcPager').querySelectorAll('[data-page]').forEach(function (b) {
      b.addEventListener('click', function () { poolState.page = parseInt(this.getAttribute('data-page'), 10); renderPoolTable(); });
    });
    el('rcPageSize').addEventListener('change', function () {
      poolState.pageSize = parseInt(this.value, 10);
      poolState.page = 1;
      renderPoolTable();
    });
    el('rcJump').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var p = parseInt(this.value, 10);
      if (!p || p < 1) p = 1;
      if (p > totalPages) p = totalPages;
      poolState.page = p;
      renderPoolTable();
    });
  }

  function pagerNumbers(cur, total) {
    if (total <= 9) {
      var arr = [];
      for (var i = 1; i <= total; i++) arr.push(i);
      return arr;
    }
    var set = [1];
    for (var j = cur - 2; j <= cur + 2; j++) { if (j > 1 && j < total) set.push(j); }
    set.push(total);
    set = set.filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
    var out = [];
    for (var k = 0; k < set.length; k++) {
      if (k > 0 && set[k] - set[k - 1] > 1) out.push('…');
      out.push(set[k]);
    }
    return out;
  }

  function refreshPool() {
    if (!el('rcTableWrap')) return;
    renderPoolTable();
  }

  var RC_FILTER_IDS = ['rc-f-taskno', 'rc-f-docno', 'rc-f-status', 'rc-f-region', 'rc-f-round', 'rc-f-funder', 'rc-f-salesdept', 'rc-f-respdept', 'rc-f-manager', 'rc-f-rectifiable', 'rc-f-overdue', 'rc-f-from', 'rc-f-to'];

  /* 任务池事件委托 */
  function initPoolPage() {
    el('rc-f-search').addEventListener('click', function () {
      poolState.filters = {
        taskNo: el('rc-f-taskno').value.trim(),
        docNo: el('rc-f-docno').value.trim(),
        status: el('rc-f-status').value,
        region: el('rc-f-region').value,
        batch: el('rc-f-round').value.trim(),
        funder: el('rc-f-funder').value,
        salesDept: el('rc-f-salesdept').value,
        respDept: el('rc-f-respdept').value,
        manager: el('rc-f-manager').value.trim(),
        rectifiable: el('rc-f-rectifiable').value,
        overdue: el('rc-f-overdue').value,
        from: el('rc-f-from').value,
        to: el('rc-f-to').value
      };
      poolState.page = 1;
      renderPoolTable();
      toast('查询完成', 'success');
    });

    el('rc-f-reset').addEventListener('click', function () {
      RC_FILTER_IDS.forEach(function (id) { el(id).value = ''; });
      poolState.filters = { taskNo: '', docNo: '', status: '', region: '', batch: '', funder: '', salesDept: '', respDept: '', manager: '', rectifiable: '', overdue: '', from: '', to: '' };
      poolState.page = 1;
      renderPoolTable();
    });

    ['rc-f-taskno', 'rc-f-docno', 'rc-f-manager'].forEach(function (id) {
      el(id).addEventListener('keydown', function (e) {
        if (e.key === 'Enter') el('rc-f-search').click();
      });
    });

    /* 批量查询图标 */
    document.querySelectorAll('.rc-batch-ico').forEach(function (ico) {
      ico.addEventListener('click', function () {
        openBatchQueryModal(this.getAttribute('data-batch'));
      });
    });

    /* 导入整改任务 */
    el('rcImport').addEventListener('click', openImportModal);

    /* 导出 */
    el('rcExport').addEventListener('click', function () {
      var list = poolFiltered();
      var selN = Object.keys(poolState.selected).length;
      var scope = selN > 0 ? '选中的 ' + selN + ' 条任务' : '当前筛选结果共 ' + list.length + ' 条任务';
      toast('已生成导出任务（' + scope + '），文件将发送至您的站内信，请稍后查收', 'success');
    });

    el('rcTableWrap').addEventListener('click', function (e) {
      var target = e.target.closest('[data-act]');
      if (!target) return;
      var act = target.getAttribute('data-act');
      var id = target.getAttribute('data-id');
      dispatchAction(act, id);
    });

    renderPoolTable();
  }

  /* ==================== 批量查询弹窗 ==================== */
  function openBatchQueryModal(type) {
    var isTaskNo = type === 'taskno';
    var label = isTaskNo ? '任务编号' : '申请公文号';
    openModal({
      title: '批量查询 - ' + label,
      width: 480,
      body:
        '<div class="rc-form-item">' +
          '<label>' + label + '（支持多个，用换行 / 逗号 / 空格分隔，最多 200 个）</label>' +
          '<textarea id="rcBatchInput" class="rc-textarea" rows="8" placeholder="' + (isTaskNo ? 'ZG20260823001\nZG20260810002\nZG20260809003' : 'HZZ2026052600877\nHZZ2026081000117\nHZZ2026080200064') + '"></textarea>' +
        '</div>' +
        '<div class="rc-form-tip">批量输入将与当前其他查询条件组合生效</div>',
      footer: [
        { text: '取消', onClick: closeModal },
        { text: '确定', cls: 'rc-btn-primary', onClick: function () {
          var v = el('rcBatchInput').value.trim();
          (isTaskNo ? el('rc-f-taskno') : el('rc-f-docno')).value = v.replace(/\s+/g, ' ');
          closeModal();
          el('rc-f-search').click();
        } }
      ]
    });
  }

  /* ==================== 导入整改任务弹窗 ==================== */
  function openImportModal() {
    openModal({
      title: '导入整改任务',
      role: '总部运营',
      width: 520,
      body:
        '<div class="rc-import-steps">' +
          '<div class="rc-import-step"><span class="rc-step-no">1</span><div><b>下载导入模板</b><div class="rc-form-tip">模板字段：申请文号、资方机构、销售部门、批次说明、整改问题/原因/分类/措施（可多组）、责任人（工号）、责任部门、要求完成时间</div></div>' +
            '<button class="rc-btn rc-btn-sm" id="rcDlTpl">下载模板</button></div>' +
          '<div class="rc-import-step"><span class="rc-step-no">2</span><div><b>上传填写完成的文件</b><div class="rc-form-tip">支持 .xlsx / .xls，单次最多 500 条；责任部门根据责任人工号自动匹配，其余电站信息由 425 报表自动匹配</div></div></div>' +
        '</div>' +
        '<div class="rc-upload-box" id="rcUploadBox">' +
          '<div class="rc-upload-ico">📄</div>' +
          '<div>点击或拖拽文件到此处上传</div>' +
          '<div class="rc-form-tip" id="rcUploadHint">未选择文件</div>' +
          '<input type="file" id="rcFileInput" accept=".xlsx,.xls" style="display:none">' +
        '</div>',
      footer: [
        { text: '取消', onClick: closeModal },
        { text: '开始导入', cls: 'rc-btn-primary', onClick: function () {
          var hint = el('rcUploadHint');
          if (!hint || !hint.getAttribute('data-file')) {
            toast('请先选择要上传的文件', 'error');
            return;
          }
          closeModal();
          toast('文件上传成功，系统正在校验并导入，完成后将通过站内信通知您结果', 'success');
        } }
      ],
      onOpen: function () {
        el('rcDlTpl').addEventListener('click', function () {
          toast('模板「整改任务导入模板.xlsx」已开始下载', 'success');
        });
        var box = el('rcUploadBox');
        var input = el('rcFileInput');
        box.addEventListener('click', function () { input.click(); });
        input.addEventListener('change', function () {
          if (this.files && this.files[0]) {
            el('rcUploadHint').textContent = '已选择：' + this.files[0].name;
            el('rcUploadHint').setAttribute('data-file', '1');
            box.classList.add('has-file');
          }
        });
      }
    });
  }

  /* ==================== 动作分发 ==================== */
  function dispatchAction(act, id) {
    var task = findTask(id);
    if (!task) return;
    switch (act) {
      case 'confirm': openConfirmModal(task); break;
      case 'regionConfirm': openRegionConfirmModal(task); break;
      case 'rectify': openSubmitModal(task); break;
      case 'hqReview': openHqReviewModal(task); break;
      case 'close': openCloseModal(task); break;
      case 'detail': openTaskDetail(task); break;
    }
  }

  function taskSummaryHtml(t) {
    return '<div class="rc-summary">' +
      '<b>' + esc(t.station) + '</b>（任务编号 <b>' + t.id + '</b>' + (t.batch ? '，批次：' + esc(t.batch) : '') + '）<br>' +
      '申请公文号：' + esc(t.docNo) + '　户主：' + esc(t.user) + '　区域：' + esc(t.region) + '<br>' +
      '整改问题 <b>' + t.problems.length + '</b> 项' +
      (t.deadline ? '　要求完成时间：<b>' + t.deadline + '</b>' : '') +
      '　责任人：<b>' + esc(t.manager) + '</b>（' + esc(t.managerNo) + ' / ' + esc(t.managerDept) + '）' +
    '</div>';
  }

  function bindRadioCards(mask) {
    mask.querySelectorAll('.rc-radio-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var name = this.getAttribute('data-name');
        mask.querySelectorAll('.rc-radio-card[data-name="' + name + '"]').forEach(function (c) {
          c.classList.remove('checked');
        });
        this.classList.add('checked');
        this.querySelector('input').checked = true;
        var evt = new Event('change', { bubbles: true });
        this.querySelector('input').dispatchEvent(evt);
      });
    });
  }

  /* ==================== 1. 业务经理确认（整改问题确认节点：完成时间 + 能否整改到问题级） ==================== */
  function openConfirmModal(task) {
    /* 问题明细卡片：整改问题 + 整改分类标签 + 整改原因 + 整改措施；勾选后展开不可整改原因输入框 */
    var probCards = task.problems.map(function (p) {
      return '<div class="rc-prob-card" data-pid="' + p.id + '">' +
        '<label class="rc-prob-card-head">' +
          '<input type="checkbox" class="rc-cannot-check" data-pid="' + p.id + '">' +
          '<span class="rc-prob-card-title">' + esc(p.problem) + '</span>' +
          '<span class="rc-tag tag-round">' + esc(p.category) + '</span>' +
        '</label>' +
        '<div class="rc-prob-card-body">' +
          '<div class="rc-prob-kv"><span class="k">整改原因</span><span class="v">' + esc(p.reason) + '</span></div>' +
          '<div class="rc-prob-kv"><span class="k">整改措施</span><span class="v">' + esc(p.measure) + '</span></div>' +
        '</div>' +
        '<div class="rc-prob-card-reason">' +
          '<input type="text" class="rc-cannot-reason" data-pid="' + p.id + '" placeholder="请填写该问题不能整改的原因">' +
        '</div>' +
      '</div>';
    }).join('');

    openModal({
      titleHtml: '业务经理确认-' + task.id + (task.round > 1 ? ' <span class="rc-tag tag-round">第' + task.round + '轮</span>' : ''),
      role: '业务经理 · ' + (task.manager || ''),
      width: 760,
      body:
        '<div class="rc-confirm-summary">' +
          '<div class="rc-desc-grid rc-desc-grid-2">' +
            descItem('申请公文号', task.docNo) +
            descItem('姓名', task.user) +
            descItem('所属区域', task.region) +
            descItem('资方机构', task.funder) +
          '</div>' +
          '<div class="rc-confirm-addr">' + descItem('电站地址', task.address) + '</div>' +
        '</div>' +
        '<div class="rc-form-item rc-form-item-row">' +
          '<div class="rc-form-label"><span class="req">*</span>是否能够整改</div>' +
          '<div class="rc-radio-inline">' +
            '<label><input type="radio" name="rcRectifiable" value="all" checked>全部可整改</label>' +
            '<label><input type="radio" name="rcRectifiable" value="cannot">部分/全部不可整改</label>' +
          '</div>' +
        '</div>' +
        '<div class="rc-form-item rc-form-item-row" style="align-items:flex-start">' +
          '<div class="rc-form-label" style="padding-top:7px"><span class="req">*</span>预计完成日期</div>' +
          '<div style="flex:1">' +
            '<div class="rc-date-row">' +
              '<input type="date" id="rcExpectDate" value="' + (task.deadline || todayStr()) + '">' +
              '<span class="rc-date-side">资方要求完成时间：' + (task.deadline || '—') + '</span>' +
            '</div>' +
            '<div class="rc-form-tip">若预计完成日期晚于资方要求完成时间，需经区域运营确认。</div>' +
          '</div>' +
        '</div>' +
        '<div class="rc-form-item" id="rcCannotBox" style="display:none">' +
          '<div class="rc-form-label"><span class="req">*</span>选择不可整改问题并填写原因</div>' +
          '<div class="rc-prob-cards">' + probCards + '</div>' +
        '</div>' +
        '<div class="rc-form-item" style="margin-bottom:0">' +
          '<div class="rc-form-label">反馈说明</div>' +
          '<textarea id="rcConfirmNote" class="rc-textarea" rows="4"></textarea>' +
        '</div>',
      footer: [
        { text: '取消', onClick: closeModal },
        { text: '确定', cls: 'rc-btn-primary', onClick: function () {
          var allOk = document.querySelector('input[name="rcRectifiable"]:checked').value === 'all';
          var expectDate = el('rcExpectDate').value;
          if (!expectDate) { toast('请填写预计完成日期', 'error'); return; }
          var note = el('rcConfirmNote').value.trim();
          task.planDate = expectDate;

          if (!allOk) {
            var cannotList = [];
            var valid = true;
            document.querySelectorAll('.rc-cannot-check:checked').forEach(function (ck) {
              var pid = ck.getAttribute('data-pid');
              var reason = document.querySelector('.rc-cannot-reason[data-pid="' + pid + '"]').value.trim();
              if (!reason) { valid = false; }
              cannotList.push({ id: pid, reason: reason });
            });
            if (!cannotList.length) { toast('请至少勾选一个不可整改的问题', 'error'); return; }
            if (!valid) { toast('请为每个勾选的问题填写不可整改原因', 'error'); return; }
            /* 问题级标记 */
            task.problems.forEach(function (p) {
              var hit = cannotList.filter(function (c) { return c.id === p.id; })[0];
              if (hit) { p.rectifiable = false; p.cannotReason = hit.reason; p.status = '不可整改'; }
              else { p.rectifiable = true; p.status = '待整改'; }
            });
            task.feedback = { type: 'cannot', expectDate: expectDate, time: nowStr(), note: note, cannotList: cannotList };
            task.status = 'PENDING_REGION_CONFIRM';
            pushTL(task, task.manager, '业务经理', '整改问题确认',
              '计划完成日期 ' + expectDate + '；' + cannotList.length + ' 项问题申请不可整改，问题原因与整改措施已推送TFS，提交区域运营二次确认' + (note ? '。说明：' + note : ''));
            closeModal();
            toast('存在不可整改问题，已提交区域运营二次确认', 'success');
            refreshPool();
            return;
          }

          task.problems.forEach(function (p) { p.rectifiable = true; p.status = '待整改'; });
          if (task.deadline && dateCmp(expectDate, task.deadline) > 0) {
            task.feedback = { type: 'overdue', expectDate: expectDate, time: nowStr(), note: note };
            task.status = 'PENDING_REGION_CONFIRM';
            pushTL(task, task.manager, '业务经理', '整改问题确认',
              '全部可整改，计划完成日期 ' + expectDate + ' 晚于要求完成时间 ' + task.deadline + '，提交区域运营二次确认超期承诺' + (note ? '。说明：' + note : ''));
            closeModal();
            toast('计划完成时间晚于要求完成时间，已提交区域运营二次确认超期承诺', 'success');
          } else {
            task.status = 'PENDING_RECTIFY';
            pushTL(task, task.manager, '业务经理', '整改问题确认',
              '全部可整改，计划完成日期 ' + expectDate + '，问题原因与整改措施已推送TFS，任务进入【待整改】' + (note ? '。说明：' + note : ''));
            closeModal();
            toast('确认完成，任务进入【待整改】', 'success');
          }
          refreshPool();
        } }
      ],
      onOpen: function (mask) {
        /* 是否可整改 radio 联动问题明细区 */
        mask.querySelectorAll('input[name="rcRectifiable"]').forEach(function (r) {
          r.addEventListener('change', function () {
            var cannot = document.querySelector('input[name="rcRectifiable"]:checked').value === 'cannot';
            el('rcCannotBox').style.display = cannot ? '' : 'none';
          });
        });
        /* 问题勾选：卡片选中态 + 原因输入框展开 */
        mask.querySelectorAll('.rc-cannot-check').forEach(function (ck) {
          ck.addEventListener('change', function () {
            this.closest('.rc-prob-card').classList.toggle('checked', this.checked);
          });
        });
      }
    });
  }

  /* ==================== 2. 区域运营二次确认（超期/部分无法整改/全部无法整改） ==================== */
  function openRegionConfirmModal(task) {
    var fb = task.feedback || {};

    /* 业务经理反馈卡片 */
    var fbHtml = '<div class="rc-feedback-card">' +
      '<div class="rc-feedback-title">业务经理反馈<span class="rc-feedback-meta">（' + esc(task.manager) + '  ' + esc(fb.time || '') + '）</span></div>' +
      '<div class="rc-desc-grid rc-desc-grid-2">' +
        descItem('预计完成日期', fb.expectDate || '—') +
        descItem('资方要求完成日期', (task.deadline || '—') + (fb.expectDate && task.deadline && dateCmp(fb.expectDate, task.deadline) > 0 ? '  <span style="color:#cf1322">（超期）</span>' : '')) +
      '</div>' +
      (fb.note ? '<div class="rc-feedback-note">反馈说明：' + esc(fb.note) + '</div>' : '');

    /* 不可整改问题项：结构化卡片展示（问题+分类+原因+措施+不可整改原因） */
    if (fb.type === 'cannot' && fb.cannotList && fb.cannotList.length) {
      fbHtml += '<div class="rc-feedback-sub-title">不可整改问题项：</div>' +
        fb.cannotList.map(function (c, idx) {
          var p = task.problems.filter(function (x) { return x.id === c.id; })[0];
          if (!p) return '';
          return '<div class="rc-cannot-item">' +
            '<div class="rc-cannot-item-head"><span class="rc-cannot-idx">' + (idx + 1) + '</span>' +
              '<span class="rc-prob-card-title">' + esc(p.problem) + '</span>' +
              '<span class="rc-tag tag-round">' + esc(p.category) + '</span></div>' +
            '<div class="rc-prob-card-body">' +
              '<div class="rc-prob-kv"><span class="k">整改原因</span><span class="v">' + esc(p.reason) + '</span></div>' +
              '<div class="rc-prob-kv"><span class="k">整改措施</span><span class="v">' + esc(p.measure) + '</span></div>' +
            '</div>' +
            '<div class="rc-cannot-reason-box">不可整改原因：' + esc(c.reason) + '</div>' +
          '</div>';
        }).join('');
    }
    fbHtml += '</div>';

    openModal({
      titleHtml: '区域运营确认-' + task.id + (task.round > 1 ? ' <span class="rc-tag tag-round">第' + task.round + '轮</span>' : ''),
      role: '区域运营',
      width: 720,
      body:
        '<div class="rc-confirm-summary">' +
          '<div class="rc-desc-grid rc-desc-grid-2">' +
            descItem('申请公文号', task.docNo) +
            descItem('姓名', task.user) +
            descItem('所属区域', task.region) +
            descItem('资方机构', task.funder) +
          '</div>' +
          '<div class="rc-confirm-addr">' + descItem('电站地址', task.address) + '</div>' +
        '</div>' +
        fbHtml +
        '<div class="rc-form-item rc-form-item-row">' +
          '<div class="rc-form-label"><span class="req">*</span>确认结论</div>' +
          '<div class="rc-radio-inline">' +
            '<label><input type="radio" name="rcRgc" value="pass" checked>确认通过</label>' +
            '<label><input type="radio" name="rcRgc" value="reject">驳回修改</label>' +
          '</div>' +
        '</div>' +
        '<div class="rc-form-item" style="margin-bottom:0">' +
          '<div class="rc-form-label"><span class="req">*</span>确认/驳回意见</div>' +
          '<textarea id="rcRgcOpinion" class="rc-textarea" rows="4"></textarea>' +
        '</div>',
      footer: [
        { text: '取消', onClick: closeModal },
        { text: '确定', cls: 'rc-btn-primary', onClick: function () {
          var pass = document.querySelector('input[name="rcRgc"]:checked').value === 'pass';
          var opinion = el('rcRgcOpinion').value.trim();
          if (!opinion) { toast('请填写意见', 'error'); return; }

          if (!pass) {
            task.status = 'PENDING_CONFIRM';
            task.problems.forEach(function (p) { p.status = '待确认'; p.rectifiable = null; });
            pushTL(task, '林岚', '区域运营', '二次确认驳回', '驳回意见：' + opinion + '。退回【待业务经理确认】');
            closeModal();
            toast('已驳回，任务退回【待业务经理确认】，系统已通知业务经理', 'success');
            refreshPool();
            return;
          }

          if (task.feedback && task.feedback.type === 'cannot' && task.feedback.cannotList) {
            var allCannot = task.feedback.cannotList.length >= task.problems.length;
            if (allCannot) {
              task.problems.forEach(function (p) { p.status = '不可整改'; p.regionConfirmed = true; });
              task.status = 'PENDING_HQ_REVIEW';
              pushTL(task, '林岚', '区域运营', '二次确认通过', '全部问题确认不可整改，提交总部运营审批。意见：' + opinion);
              closeModal();
              toast('全部问题不可整改，已提交总部运营审批', 'success');
            } else {
              task.feedback.cannotList.forEach(function (c) {
                task.problems.forEach(function (p) {
                  if (p.id === c.id) { p.status = '不可整改'; p.cannotReason = c.reason; p.regionConfirmed = true; }
                });
              });
              task.status = 'PENDING_RECTIFY';
              pushTL(task, '林岚', '区域运营', '二次确认通过',
                task.feedback.cannotList.length + ' 项问题标记为不可整改，其余问题继续整改，任务进入【待整改】。意见：' + opinion);
              closeModal();
              toast('确认通过，不可整改项已标记，任务进入【待整改】', 'success');
            }
          } else {
            task.status = 'PENDING_RECTIFY';
            task.planDate = task.feedback ? task.feedback.expectDate : task.planDate;
            pushTL(task, '林岚', '区域运营', '二次确认通过', '同意超期承诺（计划完成 ' + (task.feedback ? task.feedback.expectDate : '') + '），任务进入【待整改】。意见：' + opinion);
            closeModal();
            toast('确认通过，任务进入【待整改】', 'success');
          }
          refreshPool();
        } }
      ]
    });
  }

  /* ==================== 3.1 整改提交确认（显示当前轮次问题明细，区分可整改/不可整改） ==================== */
  function openSubmitModal(task) {
    /* 可整改项：卡片式（序号 + 问题 + 分类 + 整改方式 + 原因/措施） */
    var okItems = task.problems.filter(function (p) { return p.status !== '不可整改'; });
    var okHtml = okItems.map(function (p, idx) {
      return '<div class="rc-submit-card">' +
        '<div class="rc-submit-card-head"><span class="rc-cannot-idx rc-idx-blue">' + (idx + 1) + '</span>' +
          '<span class="rc-prob-card-title">' + esc(p.problem) + '</span>' +
          '<span class="rc-tag tag-round">' + esc(p.category) + '</span>' +
          (p.status === '校验未通过' ? '<span class="rc-submit-card-side"><span class="rc-check-fail">上次校验未通过</span></span>' : '') + '</div>' +
        '<div class="rc-prob-card-body">' +
          '<div class="rc-prob-kv"><span class="k">整改原因</span><span class="v">' + esc(p.reason) + '</span></div>' +
          '<div class="rc-prob-kv"><span class="k">整改措施</span><span class="v">' + esc(p.measure) + '</span></div>' +
        '</div>' +
        (p.status === '校验未通过' && p.checkMsg
          ? '<div class="rc-alert rc-alert-danger" style="margin:0 14px 12px">✗ 上次系统校验未通过：' + esc(p.checkMsg) + '</div>' : '') +
      '</div>';
    }).join('');

    /* 不可整改项：卡片式（复用二次确认弹窗的不可整改卡片样式） */
    var noItems = task.problems.filter(function (p) { return p.status === '不可整改'; });
    var noHtml = noItems.map(function (p, idx) {
      return '<div class="rc-cannot-item">' +
        '<div class="rc-cannot-item-head"><span class="rc-cannot-idx">' + (idx + 1) + '</span>' +
          '<span class="rc-prob-card-title">' + esc(p.problem) + '</span>' +
          '<span class="rc-tag tag-round">' + esc(p.category) + '</span>' +
          '<span class="rc-submit-card-side"><span class="rc-tag tag-duesoon">不可整改</span></span></div>' +
        '<div class="rc-prob-card-body">' +
          '<div class="rc-prob-kv"><span class="k">整改原因</span><span class="v">' + esc(p.reason) + '</span></div>' +
          '<div class="rc-prob-kv"><span class="k">整改措施</span><span class="v">' + esc(p.measure) + '</span></div>' +
        '</div>' +
        '<div class="rc-cannot-reason-box">不可整改原因：' + esc(p.cannotReason) + '</div>' +
      '</div>';
    }).join('');

    openModal({
      titleHtml: '整改提交-' + task.id + (task.round > 1 ? ' <span class="rc-tag tag-round">第' + task.round + '轮</span>' : ''),
      role: '业务经理 · ' + (task.manager || ''),
      width: 720,
      body:
        '<div class="rc-confirm-summary">' +
          '<div class="rc-desc-grid rc-desc-grid-2">' +
            descItem('申请公文号', task.docNo) +
            descItem('姓名', task.user) +
            descItem('所属区域', task.region) +
            descItem('资方机构', task.funder) +
          '</div>' +
          '<div class="rc-confirm-addr">' + descItem('电站地址', task.address) + '</div>' +
        '</div>' +
        '<div class="rc-form-item">' +
          '<div class="rc-form-label" style="display:flex;align-items:center">可整改项' +
            '<button class="rc-btn rc-btn-sm" id="rcGotoTfs" style="margin-left:auto">跳转TFS处理资料</button>' +
          '</div>' +
          '<div class="rc-submit-list">' + (okHtml || '<div class="rc-form-tip">无可整改项</div>') + '</div>' +
        '</div>' +
        (noItems.length ?
          '<div class="rc-form-item" style="margin-bottom:0">' +
            '<div class="rc-form-label">不可整改项</div>' +
            '<div class="rc-submit-list">' + noHtml + '</div>' +
          '</div>' : ''),
      footer: [
        { text: '取消', onClick: closeModal },
        { text: '确定', cls: 'rc-btn-primary', onClick: function () {
          closeModal();
          runSystemCheck(task);
        } }
      ],
      onOpen: function (mask) {
        mask.querySelector('#rcGotoTfs').addEventListener('click', function () {
          /* 模拟业务经理在 TFS 完成资料更新：为未闭环的可整改问题生成闭环信息 */
          var cnt = 0;
          task.problems.forEach(function (p) {
            if (p.status === '不可整改') return;
            if (p.tfs && p.tfs.flowStatus === '已闭环' && p.tfs.closedTime >= task.createdAt) return;
            var docNo = (p.tfs && p.tfs.docNo) || ('TFS-CLS-' + Math.floor(88000 + Math.random() * 999));
            var now = nowStr();
            p.tfs = tfs(docNo, '已闭环', now, now, [{ name: p.problem + '-更新资料.pdf', time: now }]);
            p.checkMsg = '';
            cnt++;
          });
          if (cnt) pushTL(task, '系统', '系统', 'TFS闭环回传', cnt + ' 项问题已在 TFS 完成资料更新并闭环');
          toast('已跳转 TFS 完成资料更新（模拟），闭环信息已回传', 'success');
        });
      }
    });
  }

  /* ---------- 系统校验（模拟TFS接口自动校验） ---------- */
  function runSystemCheck(task) {
    var openTime = task.createdAt; /* 任务下发时间 */
    var results = task.problems.map(function (p) {
      if (p.status === '不可整改') {
        return { p: p, skip: true };
      }
      /* TFS校验规则：是否闭环 + 闭环时间晚于任务时间 + 资料更新时间晚于任务时间 */
      if (!p.tfs) return { p: p, ok: false, msg: '未获取到TFS单据闭环信息' };
      if (p.tfs.flowStatus !== '已闭环') return { p: p, ok: false, msg: 'TFS单据流程状态为「' + p.tfs.flowStatus + '」，尚未闭环' };
      if (p.tfs.closedTime && p.tfs.closedTime < openTime) return { p: p, ok: false, msg: '闭环时间 ' + p.tfs.closedTime + ' 早于任务下发时间 ' + openTime + '，需重新发起闭环流程' };
      if (p.tfs.updateTime && p.tfs.updateTime < openTime) return { p: p, ok: false, msg: '闭环资料更新时间 ' + p.tfs.updateTime + ' 早于任务下发时间 ' + openTime };
      return { p: p, ok: true, msg: '单据已闭环，闭环时间 ' + p.tfs.closedTime + '，资料更新时间 ' + p.tfs.updateTime + '，均晚于任务下发时间' };
    });

    var failed = results.filter(function (r) { return !r.skip && !r.ok; });

    /* 问题状态更新（无论成败先落状态） */
    results.forEach(function (r) {
      if (r.skip) return;
      r.p.status = r.ok ? '待总部确认' : '校验未通过';
      r.p.checkMsg = r.ok ? '' : r.msg;
    });

    /* 全部校验通过：气泡提示 + 状态流转 */
    if (!failed.length) {
      task.status = 'PENDING_HQ_REVIEW';
      task.problems.forEach(function (p) { if (p.status !== '不可整改') p.status = '待总部确认'; });
      pushTL(task, task.manager, '业务经理', '提交整改结果', '整改成果提交，触发系统校验');
      pushTL(task, '系统', '系统', '整改结果校验通过', '全部问题满足：TFS单据已闭环、闭环时间与资料更新时间均晚于任务下发时间，任务进入【待总部运营确认整改结果】');
      toast('校验通过，任务进入【待总部运营确认整改结果】', 'success');
      refreshPool();
      return;
    }

    /* 有校验未通过项：弹出校验结果弹窗（卡片式；失败项展示TFS信息，不可整改项不参与校验） */
    var itemsHtml = results.filter(function (r) { return !r.skip; }).map(function (r, idx) {
      var itemHtml = '<div class="rc-check-card' + (r.ok ? '' : ' rc-check-card-fail') + '">' +
        '<div class="rc-check-card-head"><span class="rc-cannot-idx ' + (r.ok ? 'rc-idx-blue' : 'rc-idx-red') + '">' + (idx + 1) + '</span>' +
          '<span class="rc-prob-card-title">' + esc(r.p.problem) + '</span>' +
          '<span class="rc-tag tag-round">' + esc(r.p.category) + '</span>' +
          '<span class="rc-submit-card-side">' + (r.ok ? '<span class="rc-check-pass">校验通过</span>' : '<span class="rc-check-fail">校验失败</span>') + '</span></div>' +
        '<div class="rc-prob-card-body">' +
          '<div class="rc-prob-kv"><span class="k">整改原因</span><span class="v">' + esc(r.p.reason) + '</span></div>' +
          '<div class="rc-prob-kv"><span class="k">整改措施</span><span class="v">' + esc(r.p.measure) + '</span></div>' +
        '</div>';
      if (!r.ok) {
        /* 失败项：TFS单据信息 + 未通过原因 */
        itemHtml += '<div class="rc-check-tfs-box">' +
          '<div class="rc-check-tfs-title">TFS 单据信息</div>' +
          (r.p.tfs
            ? '<div class="rc-check-tfs-grid">' +
                '<span>单据编号：<span class="rc-tfs-link" data-tfs="' + esc(r.p.tfs.docNo) + '">' + esc(r.p.tfs.docNo) + '</span></span>' +
                '<span>流程状态：' + esc(r.p.tfs.flowStatus || '—') + '</span>' +
                '<span>闭环时间：' + esc(r.p.tfs.closedTime || '—') + '</span>' +
                '<span>资料更新时间：' + esc(r.p.tfs.updateTime || '—') + '</span>' +
              '</div>'
            : '<div class="rc-form-tip" style="margin:0">未获取到TFS单据闭环信息</div>') +
          '<div class="rc-check-fail-reason">✗ ' + esc(r.msg) + '</div>' +
        '</div>';
      }
      return itemHtml + '</div>';
    }).join('');

    openModal({
      title: '整改结果校验',
      width: 680,
      body:
        '<div class="rc-alert rc-alert-warn" style="font-size:13px">⚠ 部分问题整改校验未通过，请核实后重新提交！</div>' +
        '<div class="rc-submit-list">' + itemsHtml + '</div>',
      footer: [
        { text: '关闭', onClick: function () {
          closeModal();
          pushTL(task, '系统', '系统', '整改结果校验未通过',
            failed.map(function (r) { return '「' + r.p.problem + '」' + r.msg; }).join('；') + '。任务保持【待整改】，已通知业务经理');
          toast('校验未通过，任务保持【待整改】', 'error');
          refreshPool();
        } }
      ],
      onOpen: function (mask) {
        mask.querySelectorAll('.rc-tfs-link').forEach(function (link) {
          link.addEventListener('click', function () {
            toast('已跳转 TFS 单据详情页（' + this.getAttribute('data-tfs') + '）（模拟）', 'info');
          });
        });
      }
    });
  }

  /* ==================== 4. 总部运营确认整改结果（通过→整改完成；驳回→退回待整改；全部不可整改→审批关闭） ==================== */
  function openHqReviewModal(task) {
    var cannotList = task.problems.filter(function (p) { return p.status === '不可整改'; });
    var allCannot = cannotList.length > 0 && cannotList.length === task.problems.length;

    /* 可整改项卡片（含TFS闭环校验信息） */
    var okItems = task.problems.filter(function (p) { return p.status !== '不可整改'; });
    var okHtml = okItems.map(function (p, idx) {
      return '<div class="rc-submit-card">' +
        '<div class="rc-submit-card-head"><span class="rc-cannot-idx rc-idx-blue">' + (idx + 1) + '</span>' +
          '<span class="rc-prob-card-title">' + esc(p.problem) + '</span>' +
          '<span class="rc-tag tag-round">' + esc(p.category) + '</span>' +
          '<span class="rc-submit-card-side"><span class="rc-check-pass">✓ 校验通过</span></span></div>' +
        '<div class="rc-prob-card-body">' +
          '<div class="rc-prob-kv"><span class="k">整改原因</span><span class="v">' + esc(p.reason) + '</span></div>' +
          '<div class="rc-prob-kv"><span class="k">整改措施</span><span class="v">' + esc(p.measure) + '</span></div>' +
        '</div>' +
        (p.tfs
          ? '<div class="rc-hq-tfs-row">单据 <span class="rc-tfs-link" data-tfs="' + esc(p.tfs.docNo) + '">' + esc(p.tfs.docNo) + '</span>' +
            ' · ' + esc(p.tfs.flowStatus) + ' · 闭环 ' + esc(p.tfs.closedTime || '—') + ' · 资料更新 ' + esc(p.tfs.updateTime || '—') + '</div>'
          : '') +
      '</div>';
    }).join('');

    /* 不可整改项卡片（黄色系） */
    var noHtml = cannotList.map(function (p, idx) {
      return '<div class="rc-cannot-item">' +
        '<div class="rc-cannot-item-head"><span class="rc-cannot-idx">' + (idx + 1) + '</span>' +
          '<span class="rc-prob-card-title">' + esc(p.problem) + '</span>' +
          '<span class="rc-tag tag-round">' + esc(p.category) + '</span>' +
          '<span class="rc-submit-card-side"><span class="rc-tag tag-duesoon">不可整改</span></span></div>' +
        '<div class="rc-prob-card-body">' +
          '<div class="rc-prob-kv"><span class="k">整改原因</span><span class="v">' + esc(p.reason) + '</span></div>' +
          '<div class="rc-prob-kv"><span class="k">整改措施</span><span class="v">' + esc(p.measure) + '</span></div>' +
        '</div>' +
        '<div class="rc-cannot-reason-box">不可整改原因：' + esc(p.cannotReason) + '</div>' +
      '</div>';
    }).join('');

    openModal({
      titleHtml: '总部确认整改结果-' + task.id + (task.round > 1 ? ' <span class="rc-tag tag-round">第' + task.round + '轮</span>' : ''),
      role: '总部运营',
      width: 760,
      body:
        '<div class="rc-confirm-summary">' +
          '<div class="rc-desc-grid rc-desc-grid-2">' +
            descItem('申请公文号', task.docNo) +
            descItem('姓名', task.user) +
            descItem('所属区域', task.region) +
            descItem('资方机构', task.funder) +
          '</div>' +
          '<div class="rc-confirm-addr">' + descItem('电站地址', task.address) + '</div>' +
        '</div>' +
        (okItems.length ?
          '<div class="rc-form-item">' +
            '<div class="rc-form-label">可整改项</div>' +
            '<div class="rc-submit-list">' + okHtml + '</div>' +
          '</div>' : '') +
        (cannotList.length ?
          '<div class="rc-form-item">' +
            '<div class="rc-form-label">不可整改项<span class="rc-form-tip" style="display:inline;margin-left:8px">已经区域运营二次确认' + (allCannot ? '，全部不可整改，确认通过后任务将整改关闭' : '') + '</span></div>' +
            '<div class="rc-submit-list">' + noHtml + '</div>' +
          '</div>' : '') +
        '<div class="rc-form-item rc-form-item-row">' +
          '<div class="rc-form-label"><span class="req">*</span>确认结论</div>' +
          '<div class="rc-radio-inline">' +
            '<label><input type="radio" name="rcHqv" value="pass" checked>' + (allCannot ? '审批通过（关闭）' : '确认通过') + '</label>' +
            '<label><input type="radio" name="rcHqv" value="reject">驳回修改</label>' +
          '</div>' +
        '</div>' +
        '<div class="rc-form-item" style="margin-bottom:0">' +
          '<div class="rc-form-label"><span class="req">*</span>确认/驳回意见</div>' +
          '<textarea id="rcHqvOpinion" class="rc-textarea" rows="4"></textarea>' +
        '</div>',
      footer: [
        { text: '取消', onClick: closeModal },
        { text: '提交', cls: 'rc-btn-primary', onClick: function () {
          var pass = document.querySelector('input[name="rcHqv"]:checked').value === 'pass';
          var opinion = el('rcHqvOpinion').value.trim();
          if (!opinion) { toast('请填写意见', 'error'); return; }

          if (!pass) {
            task.problems.forEach(function (p) { if (p.status === '待总部确认') p.status = '总部驳回'; });
            pushTL(task, '周敏', '总部运营', '确认整改结果-驳回',
              '驳回意见：' + opinion + '。已在原主任务下创建第' + (task.round + 1) + '轮整改记录，退回【待整改】，系统已通知业务经理');
            /* 冻结本轮快照（问题明细、整改说明、附件、审批意见、过程记录），再创建新轮次 */
            task.rounds.push({
              round: task.round, result: '总部驳回', frozenTime: nowStr(),
              manager: task.manager, managerDept: task.managerDept,
              deadline: task.deadline, planDate: task.planDate, actualDate: '',
              batch: task.batch,
              note: '第' + task.round + '轮共' + task.problems.length + '项问题，总部确认驳回：' + opinion,
              problems: JSON.parse(JSON.stringify(task.problems)),
              timeline: task.timeline.slice()
            });
            task.round += 1;
            task.status = 'PENDING_RECTIFY';
            task.problems.forEach(function (p) { if (p.status === '总部驳回') { p.status = '待整改'; } });
            closeModal();
            toast('已驳回，已创建第' + task.round + '轮整改记录，任务退回【待整改】', 'success');
          } else if (allCannot) {
            task.status = 'CLOSED';
            task.closeType = '不可整改';
            task.closeReason = opinion;
            task.actualDate = todayStr();
            pushTL(task, '周敏', '总部运营', '确认整改结果', '无法整改单审批通过，任务进入【整改关闭】，关闭类型：不可整改。意见：' + opinion);
            closeModal();
            toast('审批通过，任务已整改关闭（关闭类型：不可整改）', 'success');
          } else {
            task.status = 'COMPLETED';
            task.actualDate = todayStr();
            task.problems.forEach(function (p) { if (p.status === '待总部确认') p.status = '整改通过'; });
            pushTL(task, '周敏', '总部运营', '确认整改结果', '整改结果确认通过，任务进入【整改完成】，实际完成时间 ' + task.actualDate + '。意见：' + opinion);
            closeModal();
            toast('确认通过，任务进入【整改完成】', 'success');
          }
          refreshPool();
        } }
      ],
      onOpen: function (mask) {
        bindRadioCards(mask);
        mask.querySelectorAll('.rc-tfs-link').forEach(function (link) {
          link.addEventListener('click', function () {
            toast('已跳转 TFS 单据详情页（' + this.getAttribute('data-tfs') + '）（模拟）', 'info');
          });
        });
      }
    });
  }

  /* ==================== 5. 手动关闭（总部运营，任意状态可操作） ==================== */
  function openCloseModal(task) {
    openModal({
      title: '手动关闭任务',
      role: '总部运营',
      width: 560,
      body:
        taskSummaryHtml(task) +
        '<div class="rc-alert rc-alert-warn">手动关闭后任务进入【整改关闭】，不再流转；关闭操作将记录操作人、时间与原因。当前状态：<b>' + RC_STATUS[task.status].name + '</b></div>' +
        '<div class="rc-form-item">' +
          '<div class="rc-form-label"><span class="req">*</span>关闭类型</div>' +
          '<div class="rc-radio-cards">' +
            '<label class="rc-radio-card checked" data-name="cls">' +
              '<input type="radio" name="rcCls" value="手动关闭" checked>' +
              '<div><div class="rc-rc-title">手动关闭</div><div class="rc-rc-desc">重复导入、问题失效等场景</div></div>' +
            '</label>' +
            '<label class="rc-radio-card" data-name="cls">' +
              '<input type="radio" name="rcCls" value="无需整改">' +
              '<div><div class="rc-rc-title">无需整改</div><div class="rc-rc-desc">经核实无需整改</div></div>' +
            '</label>' +
          '</div>' +
        '</div>' +
        '<div class="rc-form-item">' +
          '<div class="rc-form-label"><span class="req">*</span>关闭原因</div>' +
          '<textarea id="rcCloseReason" placeholder="请填写关闭原因，将记录到过程记录"></textarea>' +
        '</div>',
      footer: [
        { text: '取消', onClick: closeModal },
        { text: '确认关闭', cls: 'rc-btn-danger', onClick: function () {
          var ctype = document.querySelector('input[name="rcCls"]:checked').value;
          var reason = el('rcCloseReason').value.trim();
          if (!reason) { toast('请填写关闭原因', 'error'); return; }
          task.status = 'CLOSED';
          task.closeType = ctype;
          task.closeReason = reason;
          task.actualDate = todayStr();
          pushTL(task, '周敏', '总部运营', '手动关闭', '关闭类型：' + ctype + '。原因：' + reason + '。任务进入【整改关闭】');
          closeModal();
          toast('任务已关闭（关闭类型：' + ctype + '）', 'success');
          refreshPool();
        } }
      ],
      onOpen: bindRadioCards
    });
  }

  /* ==================== 任务详情抽屉 ==================== */
  function openTaskDetail(task) {
    var st = RC_STATUS[task.status];

    /* 任务信息（两列键值对） */
    var taskInfoHtml =
      '<div class="rc-section" id="rcSecTask"><div class="rc-section-title">任务信息</div>' +
        '<div class="rc-desc-grid rc-desc-grid-2">' +
          descItem('任务编号', task.id) +
          descItem('责任人', task.manager ? task.manager + '（' + task.managerDept + '）' : '—') +
          descItem('销售部门', task.salesDept) +
          descItem('是否可整改', rectifiableOf(task)) +
          descItem('要求完成日期', task.deadline || '—') +
          descItem('计划完成日期', task.planDate || '—') +
          descItem('实际完成日期', task.actualDate || '—') +
          descItem('整改批次说明', task.batch || '—') +
          (task.closeType ? descItem('关闭类型', task.closeType) : '') +
        '</div>' +
        (task.closeReason ? '<div class="rc-form-tip" style="margin-top:10px">关闭原因：' + esc(task.closeReason) + '</div>' : '') +
        (task.feedback ? '<div class="rc-form-tip" style="margin-top:10px">业务经理反馈：计划完成 ' + esc(task.feedback.expectDate || '—') + (task.feedback.note ? '；说明：' + esc(task.feedback.note) : '') + '</div>' : '') +
      '</div>';

    /* 电站信息（两列键值对） */
    var stationHtml =
      '<div class="rc-section" id="rcSecStation"><div class="rc-section-title">电站信息</div>' +
        '<div class="rc-desc-grid rc-desc-grid-2">' +
          descItem('申请公文号', '<span class="rc-tfs-link" data-docno="' + esc(task.docNo) + '">' + esc(task.docNo) + '</span>') +
          descItem('姓名', task.user) +
          descItem('所属区域', task.region) +
          descItem('资方机构', task.funder) +
          descItem('电站地址', task.address) +
          descItem('是否存量', task.isStock) +
          descItem('项目公司', task.company) +
          descItem('业务员', task.salesman) +
          descItem('省公司', task.province) +
          descItem('并网时间', task.gridTime) +
          descItem('申请时间', task.applyTime) +
          descItem('业务模式大类', task.bizMode) +
          descItem('并网容量', task.capacity) +
          descItem('发电户号', task.powerNo) +
          descItem('申请状态', task.applyStatus) +
          descItem('是否上传备案证', task.hasFiling) +
          descItem('发电户号绑定状态', task.powerNoBind) +
          descItem('是否上传购售电合同', task.hasPpa) +
        '</div>' +
      '</div>';

    /* 底部操作区（不同状态显示不同按钮；总部运营可手动关闭任意非终态任务） */
    var footerBtns = [];
    var actBtn = function (act, text, danger) {
      return '<button class="rc-btn ' + (danger ? 'rc-btn-danger' : 'rc-btn-primary') + '" data-dact="' + act + '" data-id="' + task.id + '">' + text + '</button>';
    };
    switch (task.status) {
      case 'PENDING_CONFIRM': footerBtns.push(actBtn('confirm', '业务经理确认')); break;
      case 'PENDING_REGION_CONFIRM': footerBtns.push(actBtn('regionConfirm', '区域运营二次确认')); break;
      case 'PENDING_RECTIFY': footerBtns.push(actBtn('rectify', '整改处理')); break;
      case 'PENDING_HQ_REVIEW': footerBtns.push(actBtn('hqReview', '确认整改结果')); break;
    }
    if (task.status !== 'COMPLETED' && task.status !== 'CLOSED') {
      footerBtns.push(actBtn('close', '手动关闭', true));
    }

    openDrawer({
      width: 1020,
      titleHtml: '整改任务详情-' + task.id + ' <span class="rc-pill ' + st.cls + '">' + st.name + '</span>' +
        (task.round > 1 ? '<span class="rc-tag tag-round">第' + task.round + '轮</span>' : ''),
      subTitle: task.station + ' · ' + task.company,
      body:
        '<div class="rc-detail-main">' +
          '<div class="rc-anchor-nav" id="rcAnchorNav">' +
            '<div class="rc-anchor-item active" data-anchor="rcSecTask">任务信息</div>' +
            '<div class="rc-anchor-item" data-anchor="rcSecStation">电站信息</div>' +
            '<div class="rc-anchor-item" data-anchor="rcSecRound">轮次信息</div>' +
            '<div class="rc-anchor-item" data-anchor="rcSecLog">任务日志</div>' +
          '</div>' +
          '<div class="rc-detail-content">' +
            taskInfoHtml + stationHtml +
            '<div class="rc-section" id="rcSecRound"><div class="rc-section-title">整改轮次与过程</div>' +
              '<div class="rc-round-tabs" id="rcRoundTabs">' + buildRoundTabs(task) + '</div>' +
              '<div id="rcRoundBody"></div>' +
            '</div>' +
          '</div>' +
        '</div>',
      footerHtml: footerBtns.length ? footerBtns.join('') : null,
      onOpen: function (drawer) {
        renderRoundView(task, task.round, drawer);
        drawer.querySelectorAll('.rc-round-tab').forEach(function (tab) {
          tab.addEventListener('click', function () {
            renderRoundView(task, parseInt(this.getAttribute('data-round'), 10), drawer);
          });
        });
        /* 锚点导航：点击滚动定位 + 滚动高亮（用 getBoundingClientRect 适配嵌套容器） */
        var body = drawer.querySelector('.rc-drawer-body');
        drawer.querySelectorAll('.rc-anchor-item').forEach(function (item) {
          item.addEventListener('click', function () {
            var target = drawer.querySelector('#' + this.getAttribute('data-anchor'));
            if (target) {
              var rect = target.getBoundingClientRect();
              var bodyRect = body.getBoundingClientRect();
              body.scrollTop += rect.top - bodyRect.top - 8;
            }
          });
        });
        body.addEventListener('scroll', function () {
          var ids = ['rcSecTask', 'rcSecStation', 'rcSecRound', 'rcSecLog'];
          var active = ids[0];
          var bodyTop = body.getBoundingClientRect().top;
          ids.forEach(function (id) {
            var sec = drawer.querySelector('#' + id);
            if (sec && sec.getBoundingClientRect().top - bodyTop <= 40) active = id;
          });
          /* 滚动到底部时激活最后一项（任务日志） */
          if (body.scrollTop + body.clientHeight >= body.scrollHeight - 10) active = ids[ids.length - 1];
          drawer.querySelectorAll('.rc-anchor-item').forEach(function (item) {
            item.classList.toggle('active', item.getAttribute('data-anchor') === active);
          });
        });
        drawer.querySelectorAll('[data-dact]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var act = this.getAttribute('data-dact');
            closeDrawer();
            dispatchAction(act, task.id);
          });
        });
        drawer.addEventListener('click', function (e) {
          var link = e.target.closest('.rc-tfs-link');
          if (link) toast('已跳转 TFS 单据详情页（' + (link.getAttribute('data-tfs') || link.getAttribute('data-docno')) + '）（模拟）', 'info');
        });
      }
    });
  }

  /* 轮次页签：当前最新轮次在最前（带“当前轮次”标记），历史轮次按轮次倒序 */
  function buildRoundTabs(task) {
    var html = '<div class="rc-round-tab active" data-round="' + task.round + '">第' + task.round + '轮' +
      '<span class="rc-pill ' + RC_STATUS[task.status].cls + '">当前轮次</span></div>';
    task.rounds.slice().sort(function (a, b) { return b.round - a.round; }).forEach(function (r) {
      html += '<div class="rc-round-tab" data-round="' + r.round + '">第' + r.round + '轮' +
        '<span class="rc-pill ' + roundResultCls(r.result) + '">' + esc(r.result) + '</span></div>';
    });
    return html;
  }

  function roundResultCls(result) {
    if (result.indexOf('驳回') !== -1) return 'st-hq-review';
    if (result.indexOf('完成') !== -1) return 'st-completed';
    return 'st-closed';
  }

  /* 渲染指定轮次：当前轮展示进行中数据+操作按钮；历史轮额外展示该轮信息，内容冻结只读 */
  function renderRoundView(task, roundNo, drawer) {
    var isCurrent = roundNo === task.round;
    var rec = null;
    task.rounds.forEach(function (r) { if (r.round === roundNo) rec = r; });

    drawer.querySelectorAll('.rc-round-tab').forEach(function (tab) {
      tab.classList.toggle('active', parseInt(tab.getAttribute('data-round'), 10) === roundNo);
    });
    var footer = drawer.querySelector('.rc-drawer-footer');
    if (footer) footer.style.display = isCurrent ? '' : 'none';

    var problems = isCurrent ? task.problems : (rec && rec.problems ? rec.problems : []);
    var tl = isCurrent ? task.timeline : (rec && rec.timeline ? rec.timeline : []);

    var html = '';
    if (isCurrent) {
      var tipTxt = task.status === 'COMPLETED'
        ? '第 ' + roundNo + ' 轮整改已完成（终态），数据仅供查阅。'
        : (task.status === 'CLOSED'
          ? '第 ' + roundNo + ' 轮已关闭（' + esc(task.closeType) + '），数据仅供查阅。'
          : '第 ' + roundNo + ' 轮整改进行中，数据实时更新；历史轮次已冻结，可切换页签查阅。');
      html += '<div class="rc-alert rc-alert-info">' + tipTxt + '</div>';
    } else {
      /* 历史轮次：冻结提示条 + 该轮信息 */
      html += '<div class="rc-alert rc-alert-warn">第 ' + roundNo + ' 轮已于 ' + esc(rec.frozenTime || rec.time || '') + ' 冻结，该轮整改说明、附件与审批意见仅供查阅，不可修改。</div>' +
        '<div class="rc-desc-grid rc-desc-grid-2" style="margin:4px 0 14px">' +
          descItem('该轮责任人', rec.manager ? rec.manager + '（' + (rec.managerDept || '责任部门') + '）' : '—') +
          descItem('要求完成日期', rec.deadline || '—') +
          descItem('计划完成日期', rec.planDate || '—') +
          descItem('实际完成日期', rec.actualDate || '—') +
          descItem('整改批次说明', rec.batch || '—') +
        '</div>';
    }

    /* 问题明细 */
    html += '<div class="rc-section-sub-title">问题明细' +
      '<span class="rc-tfs-link" style="margin-left:auto;font-weight:400" data-docno="' + esc(task.docNo) + '">查看电站详情</span></div>' +
      '<table class="rc-prob-table"><thead><tr>' +
        '<th style="width:44px">序号</th><th style="width:32%">整改原因/整改问题</th><th style="width:32%">整改措施/整改分类</th><th style="width:20%">是否可整改</th>' +
      '</tr></thead><tbody>' + probRowsHtml(problems) + '</tbody></table>';

    /* 任务日志 */
    html += '<div class="rc-section" id="rcSecLog" style="margin-top:18px"><div class="rc-section-title" style="border:none;padding-left:0;margin-bottom:8px">任务日志</div>' +
      logTableHtml(tl) + '</div>';

    drawer.querySelector('#rcRoundBody').innerHTML = html;
  }

  /* 问题明细行：序号 / 整改原因·整改问题 / 整改措施·整改分类 / 是否可整改 */
  function probRowsHtml(problems) {
    return problems.map(function (p, idx) {
      var rectCell;
      if (p.status === '不可整改' || p.rectifiable === false) {
        rectCell = '<div style="color:#d48806">不可整改</div>' +
          (p.cannotReason ? '<div class="rc-sub-text">' + esc(p.cannotReason) + '</div>' : '');
      } else if (p.rectifiable === true) {
        rectCell = '<span style="color:#389e0d">可整改</span>';
      } else {
        rectCell = '<span style="color:#bbb">—</span>';
      }
      return '<tr>' +
        '<td>' + (idx + 1) + '</td>' +
        '<td><div>' + esc(p.reason) + '</div><div class="rc-sub-text">' + esc(p.problem) + '</div></td>' +
        '<td><div>' + esc(p.measure) + '</div><div class="rc-sub-text">' + esc(p.category) + '</div></td>' +
        '<td>' + rectCell + '</td>' +
      '</tr>';
    }).join('');
  }

  /* 任务日志表格：序号 / 操作时间 / 操作人 / 操作类型 / 操作内容 */
  function logTableHtml(list) {
    if (!list.length) return '<div class="rc-form-tip">暂无记录</div>';
    var rows = list.map(function (item, idx) {
      var parts = (item.time || '').split(' ');
      return '<tr>' +
        '<td>' + (idx + 1) + '</td>' +
        '<td><div>' + esc(parts[0] || '') + '</div><div class="rc-sub-text">' + esc(parts[1] || '') + '</div></td>' +
        '<td>' + esc(item.actor) + '</td>' +
        '<td>' + esc(item.action) + '</td>' +
        '<td style="white-space:normal">' + esc(item.note || '—') + '</td>' +
      '</tr>';
    }).join('');
    return '<table class="rc-prob-table"><thead><tr>' +
      '<th style="width:44px">序号</th><th style="width:110px">操作时间</th><th style="width:90px">操作人</th><th style="width:130px">操作类型</th><th>操作内容</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function descItem(k, v) {
    return '<div class="rc-desc-item"><div class="k">' + esc(k) + '</div><div class="v">' + (v || v === 0 ? v : '—') + '</div></div>';
  }

  function probStatusCls(status) {
    var map = {
      '待确认': 'st-assign', '待整改': 'st-rectify', '不可整改': 'st-region-confirm',
      '已提交': 'st-region-review', '校验未通过': 'st-closed', '待总部确认': 'st-hq-review',
      '整改通过': 'st-completed', '总部驳回': 'st-closed'
    };
    return map[status] || 'st-closed';
  }

  /* ==================== 整改报表 ==================== */
  var RC_REPORT = {
    kpi: [
      { k: '任务总量', v: '286', unit: '单', trend: '较上月 +12.6%', trendCls: 'rp-trend-flat' },
      { k: '进行中', v: '74', unit: '单', trend: '待业务经理确认 9 · 待整改 23', trendCls: 'rp-trend-flat' },
      { k: '整改完成', v: '189', unit: '单', trend: '完成率 66.1%', trendCls: 'rp-trend-down' },
      { k: '整改关闭', v: '23', unit: '单', trend: '手动关闭 15 · 不可整改 8', trendCls: 'rp-trend-flat' },
      { k: '平均处理时长', v: '4.6', unit: '天', trend: '环比 -0.8天', trendCls: 'rp-trend-down' },
      { k: '总部确认通过率', v: '86.4', unit: '%', trend: '环比 +2.1%', trendCls: 'rp-trend-down' }
    ],
    overdue: [
      { name: '业务整改超期率', value: 12.5, color: '#fa8c16' },
      { name: '系统校验驳回率', value: 6.8, color: '#722ed1' },
      { name: '整体闭环超期率', value: 15.2, color: '#cf1322' }
    ],
    statusDist: [
      { name: '待业务经理确认', value: 18, color: '#d48806' },
      { name: '待区域运营二次确认', value: 6, color: '#096dd9' },
      { name: '待整改', value: 23, color: '#13c2c2' },
      { name: '待总部运营确认整改结果', value: 4, color: '#2f54eb' },
      { name: '整改完成', value: 189, color: '#52c41a' },
      { name: '整改关闭', value: 23, color: '#8c8c8c' }
    ],
    monthly: [
      { m: '2026-03', created: 38, done: 30 },
      { m: '2026-04', created: 45, done: 39 },
      { m: '2026-05', created: 41, done: 38 },
      { m: '2026-06', created: 52, done: 44 },
      { m: '2026-07', created: 49, done: 45 },
      { m: '2026-08', created: 61, done: 38 }
    ],
    regions: [
      { name: '东部区域管理中心', value: 68 },
      { name: '北部区域管理中心', value: 54 },
      { name: '中部区域管理中心', value: 47 },
      { name: '南部区域管理中心', value: 39 },
      { name: '西部区域管理中心', value: 31 },
      { name: '西南区域管理中心', value: 22 }
    ],
    categories: [
      { name: '购售电合同相关', value: 86 },
      { name: '备案证明相关', value: 64 },
      { name: '接入手续相关', value: 52 },
      { name: '辅助审核材料', value: 38 },
      { name: '电网编号', value: 29 },
      { name: '用电缴费辅助审核', value: 21 },
      { name: '电碳资料', value: 17 },
      { name: '差价协议', value: 12 }
    ],
    roundsDist: [
      { name: '首次校验通过', value: 68 },
      { name: '二次提交通过', value: 22 },
      { name: '三次及以上', value: 10 }
    ],
    managers: [
      { name: '李明轩', region: '东部区域管理中心', total: 42, done: 35, overdueRate: 8.2, avgDays: 4.1, passRate: 88.5, cannotRate: 4.8 },
      { name: '王思琪', region: '中部区域管理中心', total: 38, done: 30, overdueRate: 10.5, avgDays: 4.8, passRate: 84.2, cannotRate: 5.3 },
      { name: '张建国', region: '北部区域管理中心', total: 36, done: 27, overdueRate: 15.6, avgDays: 5.5, passRate: 80.6, cannotRate: 8.3 },
      { name: '陈雨桐', region: '南部区域管理中心', total: 33, done: 28, overdueRate: 6.1, avgDays: 3.9, passRate: 90.9, cannotRate: 3.0 },
      { name: '刘子涵', region: '西南区域管理中心', total: 24, done: 18, overdueRate: 18.4, avgDays: 5.9, passRate: 79.2, cannotRate: 12.5 },
      { name: '杨志远', region: '西部区域管理中心', total: 22, done: 16, overdueRate: 21.3, avgDays: 6.2, passRate: 77.3, cannotRate: 13.6 }
    ],
    companies: [
      { name: '苏州吴中产业园新能源有限公司', value: 14 },
      { name: '大丰港新能源发展有限公司', value: 12 },
      { name: '平原鲁能新能源有限公司', value: 10 },
      { name: '怀来八达岭光伏有限公司', value: 9 },
      { name: '浑源恒阳光伏发电有限公司', value: 8 }
    ]
  };

  function reportPageHtml() {
    var kpiHtml = RC_REPORT.kpi.map(function (k) {
      return '<div class="rp-kpi"><div class="k">' + k.k + '</div>' +
        '<div class="v">' + k.v + '<span class="unit">' + k.unit + '</span></div>' +
        '<div class="trend ' + k.trendCls + '">' + k.trend + '</div></div>';
    }).join('');

    var regionMax = Math.max.apply(null, RC_REPORT.regions.map(function (r) { return r.value; }));
    var regionBars = RC_REPORT.regions.map(function (r) {
      return '<div class="rp-bar-row"><div class="rp-bar-name">' + r.name + '</div>' +
        '<div class="rp-bar-track"><div class="rp-bar-fill" style="width:' + Math.round(r.value / regionMax * 100) + '%"></div></div>' +
        '<div class="rp-bar-val">' + r.value + '</div></div>';
    }).join('');

    var catMax = Math.max.apply(null, RC_REPORT.categories.map(function (c) { return c.value; }));
    var catBars = RC_REPORT.categories.map(function (c) {
      return '<div class="rp-bar-row"><div class="rp-bar-name">' + c.name + '</div>' +
        '<div class="rp-bar-track"><div class="rp-bar-fill" style="width:' + Math.round(c.value / catMax * 100) + '%;background:linear-gradient(90deg,#722ed1,#b37feb)"></div></div>' +
        '<div class="rp-bar-val">' + c.value + '</div></div>';
    }).join('');

    var compMax = Math.max.apply(null, RC_REPORT.companies.map(function (c) { return c.value; }));
    var compBars = RC_REPORT.companies.map(function (c) {
      return '<div class="rp-bar-row"><div class="rp-bar-name" title="' + c.name + '">' + c.name + '</div>' +
        '<div class="rp-bar-track"><div class="rp-bar-fill" style="width:' + Math.round(c.value / compMax * 100) + '%;background:linear-gradient(90deg,#13c2c2,#5cdbd3)"></div></div>' +
        '<div class="rp-bar-val">' + c.value + '</div></div>';
    }).join('');

    var roundBars = RC_REPORT.roundsDist.map(function (r) {
      return '<div class="rp-bar-row"><div class="rp-bar-name">' + r.name + '</div>' +
        '<div class="rp-bar-track"><div class="rp-bar-fill" style="width:' + r.value + '%;background:linear-gradient(90deg,#fa8c16,#ffc53d)"></div></div>' +
        '<div class="rp-bar-val">' + r.value + '%</div></div>';
    }).join('');

    var monthMax = Math.max.apply(null, RC_REPORT.monthly.map(function (m) { return Math.max(m.created, m.done); }));
    var trendCols = RC_REPORT.monthly.map(function (m) {
      var ch = Math.round(m.created / monthMax * 150);
      var dh = Math.round(m.done / monthMax * 150);
      return '<div class="rp-trend-col">' +
        '<div class="rp-trend-bars">' +
          '<div class="rp-trend-bar created" data-v="新增 ' + m.created + '" style="height:' + ch + 'px"></div>' +
          '<div class="rp-trend-bar done" data-v="完成 ' + m.done + '" style="height:' + dh + 'px"></div>' +
        '</div>' +
        '<div class="rp-trend-label">' + m.m.slice(5) + '月</div>' +
      '</div>';
    }).join('');

    var managerRows = RC_REPORT.managers.map(function (m, i) {
      var overCls = m.overdueRate > 15 ? 'color:#cf1322;font-weight:500' : (m.overdueRate > 10 ? 'color:#b8860b' : 'color:#389e0d');
      return '<tr>' +
        '<td><span class="rp-rank' + (i < 3 ? ' top' : '') + '">' + (i + 1) + '</span></td>' +
        '<td><b>' + m.name + '</b></td><td>' + m.region + '</td><td>' + m.total + '</td><td>' + m.done + '</td>' +
        '<td style="' + overCls + '">' + m.overdueRate + '%</td><td>' + m.avgDays + '天</td><td>' + m.passRate + '%</td><td>' + m.cannotRate + '%</td>' +
      '</tr>';
    }).join('');

    return '' +
    '<div class="rc-page">' +
      '<div class="rc-card rp-toolbar">' +
        '<select id="rpPeriod"><option>2026年8月</option><option>2026年第3季度</option><option>2026年</option><option>近12个月</option></select>' +
        '<select id="rpRegion"><option value="">全部区域</option>' + RC_REGIONS.map(function (r) { return '<option>' + r + '</option>'; }).join('') + '</select>' +
        '<select id="rpRound"><option value="">全部批次</option><option>2026年8月第一批</option><option>2026年8月第二批</option><option>2026年7月第一批</option></select>' +
        '<button class="rc-btn rc-btn-primary" id="rpSearch">查询</button>' +
        '<div class="spacer"></div>' +
        '<button class="rc-btn" id="rpExport">导出报表</button>' +
      '</div>' +

      '<div class="rp-kpi-grid">' + kpiHtml + '</div>' +

      '<div class="rp-grid">' +
        '<div class="rp-chart-card rp-span-4"><div class="rp-chart-title">超期率监控<span class="sub">按自然日口径</span></div>' +
          '<div class="rp-ring-row" id="rpRings"></div>' +
        '</div>' +
        '<div class="rp-chart-card rp-span-4"><div class="rp-chart-title">任务状态分布<span class="sub">当前在办+历史</span></div>' +
          '<div class="rp-donut-flex"><div class="rp-donut" id="rpDonut"></div><div class="rp-legend" id="rpDonutLegend"></div></div>' +
        '</div>' +
        '<div class="rp-chart-card rp-span-4"><div class="rp-chart-title">系统校验通过分布<span class="sub">完成任务的校验通过次数</span></div>' +
          '<div style="padding-top:12px">' + roundBars + '</div>' +
          '<div class="rc-form-tip" style="margin-top:16px">不可整改率：<b style="color:#722ed1">7.2%</b>（按问题明细口径统计）</div>' +
        '</div>' +
        '<div class="rp-chart-card rp-span-7"><div class="rp-chart-title">月度新增 vs 完成趋势</div>' +
          '<div class="rp-trend-chart">' + trendCols + '</div>' +
          '<div class="rp-chart-legend"><span><i style="background:#4facfe"></i>新增任务</span><span><i style="background:#95de64"></i>完成闭环</span></div>' +
        '</div>' +
        '<div class="rp-chart-card rp-span-5"><div class="rp-chart-title">按区域统计<span class="sub">任务量</span></div>' + regionBars + '</div>' +
        '<div class="rp-chart-card rp-span-7"><div class="rp-chart-title">业务经理整改统计<span class="sub">按任务量排序</span></div>' +
          '<table class="rp-table"><thead><tr><th></th><th>业务经理</th><th>区域</th><th>任务量</th><th>完成量</th><th>超期率</th><th>平均时长</th><th>复审通过率</th><th>不可整改率</th></tr></thead>' +
          '<tbody>' + managerRows + '</tbody></table>' +
        '</div>' +
        '<div class="rp-chart-card rp-span-5"><div class="rp-chart-title">按问题类型统计<span class="sub">问题明细数</span></div>' + catBars + '</div>' +
        '<div class="rp-chart-card rp-span-5"><div class="rp-chart-title">按项目公司统计<span class="sub">任务量 TOP5</span></div>' + compBars + '</div>' +
      '</div>' +
    '</div>';
  }

  function renderRings() {
    var wrap = el('rpRings');
    if (!wrap) return;
    var html = '';
    RC_REPORT.overdue.forEach(function (o) {
      var r = 44, c = 2 * Math.PI * r;
      var len = c * o.value / 100;
      html += '<div class="rp-ring-item"><div class="rp-ring">' +
        '<svg width="108" height="108" viewBox="0 0 108 108">' +
          '<circle cx="54" cy="54" r="' + r + '" fill="none" stroke="#f0f2f5" stroke-width="9"/>' +
          '<circle cx="54" cy="54" r="' + r + '" fill="none" stroke="' + o.color + '" stroke-width="9" stroke-linecap="round" ' +
            'stroke-dasharray="' + len.toFixed(1) + ' ' + (c - len).toFixed(1) + '"/>' +
        '</svg>' +
        '<div class="val" style="color:' + o.color + '">' + o.value + '%</div>' +
      '</div><div class="rp-ring-name">' + o.name + '</div></div>';
    });
    wrap.innerHTML = html;
  }

  function renderDonut() {
    var box = el('rpDonut');
    var legend = el('rpDonutLegend');
    if (!box || !legend) return;
    var total = RC_REPORT.statusDist.reduce(function (s, d) { return s + d.value; }, 0);
    var r = 68, c = 2 * Math.PI * r;
    var offset = 0;
    var circles = '';
    RC_REPORT.statusDist.forEach(function (d) {
      var len = c * d.value / total;
      circles += '<circle cx="85" cy="85" r="' + r + '" fill="none" stroke="' + d.color + '" stroke-width="20" ' +
        'stroke-dasharray="' + len.toFixed(1) + ' ' + (c - len).toFixed(1) + '" stroke-dashoffset="' + (-offset).toFixed(1) + '">' +
        '<title>' + d.name + '：' + d.value + '</title></circle>';
      offset += len;
    });
    box.innerHTML = '<svg width="170" height="170" viewBox="0 0 170 170">' + circles + '</svg>' +
      '<div class="center"><div class="n">' + total + '</div><div class="t">任务总量</div></div>';
    legend.innerHTML = RC_REPORT.statusDist.map(function (d) {
      return '<div class="rp-legend-item"><span class="rp-legend-dot" style="background:' + d.color + '"></span>' +
        d.name + '<span class="num">' + d.value + '</span></div>';
    }).join('');
  }

  function initReportPage() {
    renderRings();
    renderDonut();
    el('rpSearch').addEventListener('click', function () {
      toast('已按筛选条件刷新报表（原型演示数据）', 'success');
    });
    el('rpExport').addEventListener('click', function () {
      toast('报表导出任务已创建，完成后将通知下载（模拟）', 'info');
    });
  }

  /* ==================== 页面注册与路由挂载 ==================== */
  window.addPage('rectify-pool', { title: '整改任务池', content: poolPageHtml });
  window.addPage('rectify-report', { title: '整改报表', content: reportPageHtml });

  var rcOrigRenderPage = window.renderPage;
  window.renderPage = function (id) {
    rcOrigRenderPage(id);
    if (id === 'rectify-pool') initPoolPage();
    else if (id === 'rectify-report') initReportPage();
  };

})();
