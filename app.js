var sectionConfig = {
  operation: {
    title: '运营',
    groups: [
      {
        title: '电站资料整改',
        items: [
          { id: 'rectify-pool', title: '整改任务池' },
          { id: 'rectify-report', title: '整改报表' }
        ]
      },
      {
        title: '招投标管理',
        items: [
          { id: 'bid-stats', title: '招投标统计' },
          { id: 'bid-mechanism', title: '机制电价投标管理' },
          { id: 'bid-abnormal', title: '异常电站' },
          { id: 'bid-agreement', title: '差价协议签署管理' }
        ]
      },
      {
        title: '可视化大屏',
        items: [
          { id: 'screen-power', title: '限电运营大屏' },
          { id: 'screen-sales', title: '销售项目经营驾驶舱' },
          { id: 'screen-market', title: '市场开发驾驶舱' },
          { id: 'screen-inventory', title: '库存资产滚动看板' },
          { id: 'screen-overview', title: '经营总览驾驶舱' }
        ]
      },
      {
        title: '任务管理',
        items: [
          { id: 'task-board', title: '任务看板' },
          { id: 'task-my', title: '我的任务' }
        ]
      }
    ]
  },
  ai: {
    title: 'AI',
    direct: 'tool-ai',
    groups: [
      {
        title: 'AI应用',
        items: [
          { id: 'tool-ai', title: '大运营AI智造局' }
        ]
      }
    ]
  },
  data: {
    title: '数据',
    groups: [
      {
        title: '数据概览',
        items: [
          { id: 'data-dashboard', title: '数据总览' },
          { id: 'data-report', title: '报表中心' }
        ]
      }
    ]
  },
  settings: {
    title: '设置',
    groups: [
      {
        title: '系统设置',
        items: [
          { id: 'settings-user', title: '用户管理' },
          { id: 'settings-role', title: '角色管理' },
          { id: 'settings-log', title: '操作日志' }
        ]
      }
    ]
  }
};

var pageConfig = {
  home: {
    title: '首页',
    content: function () {
      return '<div class="welcome-container">' +
        '<div class="welcome-icon">' +
          '<svg viewBox="0 0 100 100" fill="none">' +
            '<circle cx="50" cy="50" r="35" stroke="#4facfe" stroke-width="3" fill="none"/>' +
            '<circle cx="38" cy="42" r="4" fill="#4facfe"/>' +
            '<circle cx="62" cy="42" r="4" fill="#4facfe"/>' +
            '<path d="M36 60 Q50 72 64 60" stroke="#4facfe" stroke-width="3" fill="none" stroke-linecap="round"/>' +
          '</svg>' +
        '</div>' +
        '<div class="welcome-text">欢迎使用大运营数智管理系统!</div>' +
      '</div>';
    }
  }
};

var currentSection = 'operation';
var currentPage = 'home';
var subSidebarOpen = false;

function initApp() {
  renderSubMenu(currentSection);
  setupIconNav();
  setupMask();
  setupSearch();
  handleRoute();
  window.addEventListener('hashchange', handleRoute);
}

function openSubSidebar() {
  document.getElementById('subSidebar').classList.add('open');
  document.getElementById('subSidebarMask').classList.add('show');
  subSidebarOpen = true;
}

function closeSubSidebar() {
  document.getElementById('subSidebar').classList.remove('open');
  document.getElementById('subSidebarMask').classList.remove('show');
  subSidebarOpen = false;
}

function updateBreadcrumb(sectionId, groupTitle, itemTitle) {
  var breadcrumb = document.getElementById('breadcrumb');
  var section = sectionConfig[sectionId];
  var html = '<a class="breadcrumb-item" href="#/home">首页</a>';

  if (section && groupTitle) {
    html += '<span class="breadcrumb-sep">/</span>';
    html += '<a class="breadcrumb-item" href="javascript:void(0)">' + section.title + '</a>';
  }
  if (groupTitle) {
    html += '<span class="breadcrumb-sep">/</span>';
    html += '<a class="breadcrumb-item" href="javascript:void(0)">' + groupTitle + '</a>';
  }
  if (itemTitle) {
    html += '<span class="breadcrumb-sep">/</span>';
    html += '<span class="breadcrumb-item current">' + itemTitle + '</span>';
  }

  breadcrumb.innerHTML = html;
}

function renderSubMenu(section) {
  var subMenu = document.getElementById('subMenu');
  var config = sectionConfig[section];
  if (!config) { subMenu.innerHTML = ''; return; }

  var html = '';
  config.groups.forEach(function (group) {
    html += '<div class="sub-menu-group">';
    html += '<div class="sub-menu-group-title">' + group.title + '</div>';
    group.items.forEach(function (item) {
      html += '<a class="sub-menu-item" data-id="' + item.id + '" data-group="' + group.title + '" href="#/' + item.id + '">' + item.title + '</a>';
    });
    html += '</div>';
  });
  subMenu.innerHTML = html;

  subMenu.querySelectorAll('.sub-menu-item').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      var id = this.getAttribute('data-id');
      var group = this.getAttribute('data-group');
      var title = this.textContent;
      currentPage = id;
      updateBreadcrumb(currentSection, group, title);
      renderPage(id);
      document.querySelectorAll('.sub-menu-item').forEach(function (i) { i.classList.remove('active'); });
      this.classList.add('active');
      closeSubSidebar();
    });
  });
}

function setupIconNav() {
  document.querySelectorAll('.icon-nav-item').forEach(function (item) {
    item.addEventListener('click', function (e) {
      e.preventDefault();
      var section = this.getAttribute('data-section');

      if (subSidebarOpen && currentSection === section) {
        closeSubSidebar();
        return;
      }

      currentSection = section;

      document.querySelectorAll('.icon-nav-item').forEach(function (i) { i.classList.remove('active'); });
      this.classList.add('active');

      renderSubMenu(section);

      var conf = sectionConfig[section];
      if (conf && conf.direct) {
        closeSubSidebar();
        if (currentPage !== conf.direct) {
          window.location.hash = '#/' + conf.direct;
        }
        return;
      }

      openSubSidebar();
    });
  });
}

function setupMask() {
  document.getElementById('subSidebarMask').addEventListener('click', function () {
    closeSubSidebar();
  });
}

function setupSearch() {
  document.getElementById('searchInput').addEventListener('input', function () {
    var term = this.value.toLowerCase();
    document.querySelectorAll('.sub-menu-item').forEach(function (item) {
      var match = item.textContent.toLowerCase().indexOf(term) !== -1;
      item.style.display = match ? '' : 'none';
    });
  });
}

function renderPage(id) {
  var content = document.getElementById('content');
  var page = pageConfig[id];
  if (page) {
    content.innerHTML = typeof page.content === 'function' ? page.content() : page.content;
  } else {
    var title = getPageTitle(id);
    content.innerHTML =
      '<div class="page-container">' +
        '<div class="page-header"><h2>' + title + '</h2></div>' +
        '<div style="padding:40px;text-align:center;color:#999;">页面开发中...</div>' +
      '</div>';
  }
}

function getPageTitle(id) {
  var sections = Object.keys(sectionConfig);
  for (var s = 0; s < sections.length; s++) {
    var groups = sectionConfig[sections[s]].groups;
    for (var g = 0; g < groups.length; g++) {
      var items = groups[g].items;
      for (var i = 0; i < items.length; i++) {
        if (items[i].id === id) return items[i].title;
      }
    }
  }
  if (id === 'home') return '首页';
  return id;
}

function findMenuItem(id) {
  var sections = Object.keys(sectionConfig);
  for (var s = 0; s < sections.length; s++) {
    var section = sectionConfig[sections[s]];
    var groups = section.groups;
    for (var g = 0; g < groups.length; g++) {
      var items = groups[g].items;
      for (var i = 0; i < items.length; i++) {
        if (items[i].id === id) {
          return { sectionId: sections[s], groupTitle: groups[g].title, title: items[i].title };
        }
      }
    }
  }
  return null;
}

function handleRoute() {
  var hash = window.location.hash.replace('#/', '') || 'home';
  var id = hash.split('/')[0];

  if (id === 'home') {
    currentPage = 'home';
    updateBreadcrumb('home', null, null);
    renderPage('home');
    return;
  }

  var found = findMenuItem(id);
  if (found) {
    currentPage = id;
    currentSection = found.sectionId;
    document.querySelectorAll('.icon-nav-item').forEach(function (nav) {
      nav.classList.toggle('active', nav.getAttribute('data-section') === currentSection);
    });
    renderSubMenu(currentSection);
    var secConf = sectionConfig[found.sectionId];
    if (secConf && secConf.direct) {
      document.getElementById('breadcrumb').innerHTML =
        '<a class="breadcrumb-item" href="#/home">首页</a>' +
        '<span class="breadcrumb-sep">/</span>' +
        '<span class="breadcrumb-item current">' + found.title + '</span>';
    } else {
      updateBreadcrumb(found.sectionId, found.groupTitle, found.title);
    }
    renderPage(id);
  } else {
    currentPage = id;
    updateBreadcrumb(null, null, id);
    renderPage(id);
  }
}

window.addMenuItem = function (section, groupTitle, item) {
  if (!sectionConfig[section]) {
    sectionConfig[section] = { title: section, groups: [] };
  }
  var group = sectionConfig[section].groups.find(function (g) { return g.title === groupTitle; });
  if (!group) {
    group = { title: groupTitle, items: [] };
    sectionConfig[section].groups.push(group);
  }
  group.items.push(item);
  renderSubMenu(currentSection);
};

window.addPage = function (id, data) {
  pageConfig[id] = data;
};

/* ========== 通知中心 ========== */
var notifData = [
  {
    id: 1,
    title: '《API-20260818160819-蒲公英英测试测试_zwl1》验收退回',
    desc: '胡苹退回了任务，退回原因：退回原因退回原因退回原因退回原因退回原因退回原因退回原因退回原因退回原因退回原因退回原因…',
    time: '2026-08-18 16:36:58',
    tags: ['任务退回', '任务动态'],
    unread: true
  },
  {
    id: 2,
    title: '《API-20260818163209-银杏三级三级三级三级三级》任务…',
    desc: '胡苹发布了任务《API-20260818163209-银杏三级三级三级三级三级》（截止 2026-08-20），请@何敏 牵头落实，@赵彦彦配合推进，@赵翊杉、屈昊、姜莉芸…',
    time: '2026-08-18 16:32:10',
    tags: ['任务指派', '任务动态'],
    unread: true
  },
  {
    id: 3,
    title: '《API-20260818161754-玫瑰🌹@1s哈💕✨》已取消',
    desc: '胡苹取消了任务，取消原因：465',
    time: '2026-08-18 16:18:14',
    tags: ['任务取消', '任务动态'],
    unread: true
  },
  {
    id: 4,
    title: '《API-20260818161754-玫瑰🌹@1s哈💕✨》任务已发布',
    desc: '胡苹发布了任务《API-20260818161754-玫瑰🌹@1s哈💕✨》（截止 2026-08-19），请@何敏 牵头落实，@屈昊、饶伟、李鹏、谢泽梵、杨柳、陈玥廷…',
    time: '2026-08-18 16:17:57',
    tags: ['任务指派', '任务动态'],
    unread: true
  },
  {
    id: 5,
    title: '《API-20260818161623-雏菊三级三级三级三级三级》已撤回',
    desc: '胡苹撤回了任务，撤回原因：132',
    time: '2026-08-18 16:16:52',
    tags: ['任务暂停', '任务动态'],
    unread: true
  },
  {
    id: 6,
    title: '《API-20260818161623-雏菊三级三级三级三级三级》任务…',
    desc: '胡苹发布了任务《API-20260818161623-雏菊三级三级三级三级三级》（截止 2026-08-20），请@何敏 牵头落实，@赵翊杉、饶伟、任超、华徐、曹梦羚知悉',
    time: '2026-08-18 16:16:25',
    tags: ['任务指派', '任务动态'],
    unread: false
  }
];

var tagClassMap = {
  '任务退回': 'tag-return',
  '任务动态': 'tag-dynamic',
  '任务指派': 'tag-assign',
  '任务取消': 'tag-cancel',
  '任务暂停': 'tag-pause',
  '任务验收': 'tag-accept'
};

function renderNotifList(filter) {
  var list = document.getElementById('notifList');
  var items = notifData;
  if (filter === 'unread') items = notifData.filter(function (n) { return n.unread; });
  if (filter === 'read') items = notifData.filter(function (n) { return !n.unread; });

  var html = '';
  items.forEach(function (item) {
    html += '<div class="notif-item' + (item.unread ? ' unread' : '') + '">';
    html += '<div class="notif-dot"></div>';
    html += '<div class="notif-content">';
    html += '<div class="notif-header">';
    html += '<span class="notif-title">' + item.title + '</span>';
    html += '<div class="notif-tags">';
    item.tags.forEach(function (tag) {
      html += '<span class="notif-tag ' + (tagClassMap[tag] || 'tag-dynamic') + '">' + tag + '</span>';
    });
    html += '</div>';
    html += '</div>';
    html += '<div class="notif-desc">' + item.desc + '</div>';
    html += '<div class="notif-time">' + item.time + '</div>';
    html += '</div>';
    html += '</div>';
  });

  if (!items.length) {
    html = '<div style="padding:60px 0;text-align:center;color:#999;">暂无消息</div>';
  }

  list.innerHTML = html;
}

function setupNotifDrawer() {
  var bellBtn = document.querySelector('.topbar-icon-btn[title="通知"]');
  var drawer = document.getElementById('notifDrawer');
  var mask = document.getElementById('drawerMask');
  var closeBtn = document.getElementById('drawerClose');

  bellBtn.addEventListener('click', function () {
    drawer.classList.add('open');
    mask.classList.add('show');
    renderNotifList('all');
  });

  function closeDrawer() {
    drawer.classList.remove('open');
    mask.classList.remove('show');
  }

  mask.addEventListener('click', closeDrawer);
  closeBtn.addEventListener('click', closeDrawer);

  document.querySelectorAll('.notif-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.notif-tab').forEach(function (t) { t.classList.remove('active'); });
      this.classList.add('active');
      renderNotifList(this.getAttribute('data-tab'));
    });
  });

  document.querySelectorAll('.notif-category.parent').forEach(function (cat) {
    cat.addEventListener('click', function () {
      var children = this.parentElement.querySelector('.notif-category-children');
      if (children) {
        children.classList.toggle('collapsed');
        this.classList.toggle('expanded');
      }
    });
  });

  document.querySelectorAll('.notif-category.child, .notif-category[data-cat="all"]').forEach(function (cat) {
    cat.addEventListener('click', function () {
      document.querySelectorAll('.notif-category').forEach(function (c) { c.classList.remove('active'); });
      this.classList.add('active');
    });
  });

  document.getElementById('markAllRead').addEventListener('click', function () {
    notifData.forEach(function (n) { n.unread = false; });
    var activeTab = document.querySelector('.notif-tab.active');
    renderNotifList(activeTab ? activeTab.getAttribute('data-tab') : 'all');
  });
}

var origInitApp = initApp;
initApp = function () {
  origInitApp();
  setupNotifDrawer();
};

document.addEventListener('DOMContentLoaded', initApp);
