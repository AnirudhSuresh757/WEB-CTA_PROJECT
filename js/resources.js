/**
 * RESOURCES MODULE — Lab Materials, References & Downloads
 *
 * Features:
 *   - Categorized resource cards
 *   - Search / filter
 *   - Lab manuals, PDFs, reference links
 *   - Download tracking
 *   - Terminal-inspired rendering
 */
var Resources = (function () {
  'use strict';

  // ── Default Resources ──
  var DEFAULT_RESOURCES = [
    // Lab Manuals
    {
      id: 'res-01',
      title: 'HTML5 Lab Manual',
      description: 'Complete lab manual for HTML5 semantic elements, forms, and accessibility.',
      category: 'manuals',
      type: 'pdf',
      url: '#',
      icon: '📄',
      tags: ['html', 'semantic', 'forms']
    },
    {
      id: 'res-02',
      title: 'CSS3 Lab Manual',
      description: 'Covers flexbox, grid, animations, media queries, and responsive design.',
      category: 'manuals',
      type: 'pdf',
      url: '#',
      icon: '📄',
      tags: ['css', 'flexbox', 'grid', 'responsive']
    },
    {
      id: 'res-03',
      title: 'JavaScript Lab Manual',
      description: 'DOM manipulation, events, async programming, fetch API, and storage.',
      category: 'manuals',
      type: 'pdf',
      url: '#',
      icon: '📄',
      tags: ['javascript', 'dom', 'async', 'fetch']
    },

    // PDFs
    {
      id: 'res-04',
      title: 'HTML & CSS Cheat Sheet',
      description: 'Quick reference for common HTML elements and CSS properties.',
      category: 'pdfs',
      type: 'pdf',
      url: '#',
      icon: '📋',
      tags: ['html', 'css', 'reference']
    },
    {
      id: 'res-05',
      title: 'JavaScript ES6+ Features',
      description: 'Arrow functions, destructuring, modules, promises, and more.',
      category: 'pdfs',
      type: 'pdf',
      url: '#',
      icon: '📋',
      tags: ['javascript', 'es6', 'modern']
    },
    {
      id: 'res-06',
      title: 'Responsive Design Patterns',
      description: 'Common responsive layout patterns with media query examples.',
      category: 'pdfs',
      type: 'pdf',
      url: '#',
      icon: '📋',
      tags: ['responsive', 'media-queries', 'layout']
    },

    // Reference Links
    {
      id: 'res-07',
      title: 'MDN Web Docs',
      description: 'Comprehensive documentation for HTML, CSS, and JavaScript APIs.',
      category: 'references',
      type: 'link',
      url: 'https://developer.mozilla.org/',
      icon: '🔗',
      tags: ['mdn', 'documentation', 'api']
    },
    {
      id: 'res-08',
      title: 'W3C Specifications',
      description: 'Official web standards from the World Wide Web Consortium.',
      category: 'references',
      type: 'link',
      url: 'https://www.w3.org/TR/',
      icon: '🔗',
      tags: ['w3c', 'standards', 'specification']
    },
    {
      id: 'res-09',
      title: 'Can I Use',
      description: 'Browser compatibility tables for HTML5, CSS3, and JavaScript features.',
      category: 'references',
      type: 'link',
      url: 'https://caniuse.com/',
      icon: '🔗',
      tags: ['compatibility', 'browser', 'support']
    },
    {
      id: 'res-10',
      title: 'CSS-Tricks',
      description: 'Tutorials, guides, and tips for modern CSS techniques.',
      category: 'references',
      type: 'link',
      url: 'https://css-tricks.com/',
      icon: '🔗',
      tags: ['css', 'tutorials', 'guides']
    },

    // Downloads
    {
      id: 'res-11',
      title: 'Starter Template Pack',
      description: 'HTML5 boilerplate, CSS reset, and project scaffolding templates.',
      category: 'downloads',
      type: 'download',
      url: '#',
      icon: '📦',
      tags: ['template', 'boilerplate', 'starter']
    },
    {
      id: 'res-12',
      title: 'Icon Library',
      description: 'SVG icon set for web projects — UI, social, arrows, and more.',
      category: 'downloads',
      type: 'download',
      url: '#',
      icon: '📦',
      tags: ['icons', 'svg', 'ui']
    },
    {
      id: 'res-13',
      title: 'Color Palette Generator',
      description: 'Cyberpunk-themed color palettes with CSS variable exports.',
      category: 'downloads',
      type: 'download',
      url: '#',
      icon: '📦',
      tags: ['color', 'palette', 'theme']
    },

    // Tools
    {
      id: 'res-14',
      title: 'VS Code Extensions',
      description: 'Recommended extensions: Live Server, Prettier, ESLint, Emmet.',
      category: 'tools',
      type: 'link',
      url: '#',
      icon: '🛠',
      tags: ['vscode', 'extensions', 'editor']
    },
    {
      id: 'res-15',
      title: 'Chrome DevTools Guide',
      description: 'Inspect elements, debug JavaScript, audit performance, and more.',
      category: 'tools',
      type: 'link',
      url: '#',
      icon: '🛠',
      tags: ['chrome', 'devtools', 'debugging']
    },
    {
      id: 'res-16',
      title: 'Git & GitHub Basics',
      description: 'Version control fundamentals: init, commit, push, pull, branching.',
      category: 'tools',
      type: 'link',
      url: '#',
      icon: '🛠',
      tags: ['git', 'github', 'version-control']
    }
  ];

  // ── Categories ──
  var CATEGORIES = [
    { id: 'all', label: 'All', icon: '◈' },
    { id: 'manuals', label: 'Manuals', icon: '📄' },
    { id: 'pdfs', label: 'PDFs', icon: '📋' },
    { id: 'references', label: 'References', icon: '🔗' },
    { id: 'downloads', label: 'Downloads', icon: '📦' },
    { id: 'tools', label: 'Tools', icon: '🛠' }
  ];

  // ── State ──
  var _resources = [];
  var _currentCategory = 'all';
  var _searchQuery = '';
  var _callbacks = {};

  // ── Storage ──
  var STORAGE_KEY = 'sys_resources';
  var DOWNLOADS_KEY = 'sys_resource_downloads';

  function _load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_resources));
    } catch (e) { /* quota */ }
  }

  function _getDownloads() {
    try {
      var raw = localStorage.getItem(DOWNLOADS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function _saveDownload(id) {
    try {
      var downloads = _getDownloads();
      downloads[id] = (downloads[id] || 0) + 1;
      localStorage.setItem(DOWNLOADS_KEY, JSON.stringify(downloads));
    } catch (e) { /* quota */ }
  }

  // ── Init ──
  function init() {
    var saved = _load();
    _resources = saved && saved.length ? saved : DEFAULT_RESOURCES.slice();
    return _publicAPI();
  }

  // ── Search & Filter ──
  function _getFiltered() {
    var filtered = _resources;

    // Category filter
    if (_currentCategory !== 'all') {
      filtered = filtered.filter(function (r) {
        return r.category === _currentCategory;
      });
    }

    // Search filter
    if (_searchQuery) {
      var q = _searchQuery.toLowerCase();
      filtered = filtered.filter(function (r) {
        return r.title.toLowerCase().indexOf(q) !== -1 ||
               r.description.toLowerCase().indexOf(q) !== -1 ||
               r.tags.some(function (t) { return t.indexOf(q) !== -1; });
      });
    }

    return filtered;
  }

  function _getStats() {
    var stats = { total: _resources.length, byCategory: {} };
    for (var i = 0; i < CATEGORIES.length; i++) {
      var cat = CATEGORIES[i].id;
      if (cat === 'all') continue;
      stats.byCategory[cat] = _resources.filter(function (r) { return r.category === cat; }).length;
    }
    return stats;
  }

  // ── Rendering ──
  function renderResources() {
    _renderStats();
    _renderFilters();
    _renderSearch();
    _renderResourceList();
    _fire('render');
  }

  function _renderStats() {
    var stats = _getStats();
    var downloads = _getDownloads();

    var totalEl = document.getElementById('resTotal');
    var manualEl = document.getElementById('resManuals');
    var refEl = document.getElementById('resReferences');
    var dlEl = document.getElementById('resDownloads');

    if (totalEl) totalEl.textContent = stats.total;
    if (manualEl) manualEl.textContent = (stats.byCategory.manuals || 0) + (stats.byCategory.pdfs || 0);
    if (refEl) refEl.textContent = (stats.byCategory.references || 0);
    if (dlEl) {
      var totalDls = 0;
      for (var k in downloads) { totalDls += downloads[k]; }
      dlEl.textContent = totalDls;
    }
  }

  function _renderFilters() {
    var container = document.getElementById('resFilters');
    if (!container || container._bound) return;
    container._bound = true;

    var html = '';
    for (var i = 0; i < CATEGORIES.length; i++) {
      var cat = CATEGORIES[i];
      var active = cat.id === _currentCategory ? ' assign-filter--active' : '';
      html += '<button class="assign-filter' + active + '" data-res-cat="' + cat.id + '">';
      html += cat.icon + ' ' + cat.label;
      html += '</button>';
    }
    container.innerHTML = html;

    container.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-res-cat]');
      if (!btn) return;
      var cat = btn.getAttribute('data-res-cat');
      if (cat === _currentCategory) return;
      _currentCategory = cat;

      var tabs = container.querySelectorAll('.assign-filter');
      for (var i = 0; i < tabs.length; i++) {
        tabs[i].classList.toggle('assign-filter--active', tabs[i].getAttribute('data-res-cat') === cat);
      }

      // Update terminal prompt label
      var labelEl = document.getElementById('resFilterLabel');
      if (labelEl) labelEl.textContent = cat === 'all' ? '*' : cat + '/*';

      _renderResourceList();
    });
  }

  function _renderSearch() {
    var input = document.getElementById('resSearch');
    if (!input || input._bound) return;
    input._bound = true;

    input.addEventListener('input', function () {
      _searchQuery = input.value.trim();
      _renderResourceList();
    });
  }

  function _renderResourceList() {
    var container = document.getElementById('resList');
    if (!container) return;

    var filtered = _getFiltered();
    var downloads = _getDownloads();

    if (filtered.length === 0) {
      container.innerHTML = '<div class="res-empty">> NO RESOURCES MATCH QUERY<span class="res-cursor">_</span></div>';
      return;
    }

    var html = '';
    for (var i = 0; i < filtered.length; i++) {
      var r = filtered[i];
      var dlCount = downloads[r.id] || 0;
      var typeClass = 'res-card--' + r.type;

      html += '<div class="res-card ' + typeClass + ' animate-in" data-res-id="' + r.id + '">';

      // Header
      html += '<div class="res-card__header">';
      html += '<span class="res-card__icon">' + r.icon + '</span>';
      html += '<div class="res-card__info">';
      html += '<div class="res-card__title">' + _escape(r.title) + '</div>';
      html += '<div class="res-card__cat">' + _escape(r.category.toUpperCase()) + '</div>';
      html += '</div>';
      html += '</div>';

      // Description
      html += '<div class="res-card__desc">' + _escape(r.description) + '</div>';

      // Tags
      html += '<div class="res-card__tags">';
      for (var j = 0; j < r.tags.length; j++) {
        html += '<span class="res-tag">' + _escape(r.tags[j]) + '</span>';
      }
      html += '</div>';

      // Footer
      html += '<div class="res-card__footer">';
      html += '<span class="res-card__type">' + _getTypeLabel(r.type) + '</span>';

      if (r.type === 'link') {
        html += '<a class="res-card__btn" href="' + _escape(r.url) + '" target="_blank" rel="noopener">Open ↗</a>';
      } else if (r.type === 'pdf') {
        html += '<a class="res-card__btn" href="' + _escape(r.url) + '" target="_blank" rel="noopener">View PDF</a>';
      } else if (r.type === 'download') {
        html += '<button class="res-card__btn" data-res-dl="' + r.id + '">Download ▼</button>';
      }

      if (dlCount > 0) {
        html += '<span class="res-card__dl-count">' + dlCount + ' downloads</span>';
      }

      html += '</div>'; // footer
      html += '</div>'; // card
    }

    container.innerHTML = html;
    _bindResourceEvents(container);
  }

  function _getTypeLabel(type) {
    switch (type) {
      case 'pdf': return '[ PDF ]';
      case 'link': return '[ LINK ]';
      case 'download': return '[ FILE ]';
      default: return '[ ' + type.toUpperCase() + ' ]';
    }
  }

  function _bindResourceEvents(container) {
    var dlBtns = container.querySelectorAll('[data-res-dl]');
    for (var i = 0; i < dlBtns.length; i++) {
      dlBtns[i].addEventListener('click', function (e) {
        var id = e.target.getAttribute('data-res-dl');
        _saveDownload(id);
        _renderStats();
        _renderResourceList();
        _fire('download', { id: id });
      });
    }
  }

  // ── Utils ──
  function _escape(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ── Event System ──
  function on(event, callback) {
    if (!_callbacks[event]) _callbacks[event] = [];
    _callbacks[event].push(callback);
  }

  function off(event, callback) {
    if (!_callbacks[event]) return;
    _callbacks[event] = _callbacks[event].filter(function (cb) { return cb !== callback; });
  }

  function _fire(event, data) {
    var cbs = _callbacks[event];
    if (!cbs) return;
    for (var i = 0; i < cbs.length; i++) {
      try { cbs[i](data || {}); } catch (e) { /* swallow */ }
    }
  }

  // ── Public API ──
  function _publicAPI() {
    return {
      init: init,
      renderResources: renderResources,
      getAll: function () { return _resources.slice(); },
      getStats: _getStats,
      on: on,
      off: off
    };
  }

  return {
    init: init,
    renderResources: renderResources,
    getAll: function () { return _resources.slice(); },
    getStats: _getStats,
    on: on,
    off: off
  };
})();
