/* @ds-bundle: {"format":4,"namespace":"BarberOS","components":[{"name":"Button"},{"name":"Field"},{"name":"Card"},{"name":"Badge"},{"name":"Divider"},{"name":"Table"},{"name":"StatCard"},{"name":"StatGrid"},{"name":"PageHeader"},{"name":"Modal"},{"name":"Sidebar"},{"name":"AppHeader"},{"name":"AppLayout"},{"name":"Icon"}]} */
(function () {
  var React = window.React;
  var h = React.createElement;
  var useState = React.useState, useEffect = React.useEffect, useRef = React.useRef;

  function cx() { return Array.prototype.filter.call(arguments, Boolean).join(' '); }
  function omit(obj, keys) { var o = {}; for (var k in obj) if (keys.indexOf(k) < 0) o[k] = obj[k]; return o; }

  /* Ícones lucide (ISC) usados no app, como caminhos SVG 24×24. */
  var ICONS = {
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    trendingUp: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
    trendingDown: '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
    dollar: '<line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    dashboard: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
    scissors: '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
    package: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
    truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
    cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
    folder: '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
    arrows: '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    logOut: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    panelOpen: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m14 9 3 3-3 3"/>',
    panelClose: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m16 15-3-3 3-3"/>'
  };

  function Icon(p) {
    var size = p.size || 14;
    return h('svg', {
      width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
      strokeWidth: p.strokeWidth || 1.75, strokeLinecap: 'round', strokeLinejoin: 'round',
      style: Object.assign({ flexShrink: 0 }, p.style), 'aria-hidden': true,
      dangerouslySetInnerHTML: { __html: ICONS[p.name] || '' }
    });
  }

  function Button(p) {
    var variant = p.variant || 'primary';
    var rest = omit(p, ['variant', 'size', 'full', 'icon', 'children', 'className']);
    var icon = p.icon ? h(Icon, { name: p.icon, size: 14, strokeWidth: variant === 'primary' ? 2.5 : 1.75 }) : null;
    return h('button', Object.assign({ type: 'button' }, rest, {
      className: cx('btn', 'btn-' + variant, p.size === 'sm' && 'btn-sm', p.full && 'btn-full', p.className)
    }), icon, variant === 'icon' ? null : p.children);
  }

  function Field(p) {
    var as = p.as || 'input';
    var rest = omit(p, ['label', 'as', 'options', 'error', 'className']);
    var control = as === 'select'
      ? h('select', Object.assign({}, rest, { className: 'input' }),
          (p.options || []).map(function (o) { return h('option', { key: o.value, value: o.value }, o.label); }))
      : h(as, Object.assign({}, rest, { className: 'input' }));
    return h('div', { className: cx('field', p.className) },
      p.label ? h('label', { className: 'label', htmlFor: p.id }, p.label) : null,
      control,
      p.error ? h('p', { className: 'bos-field-error' }, p.error) : null);
  }

  function Card(p) {
    var variant = p.variant || 'default';
    var rest = omit(p, ['variant', 'className', 'children']);
    var onMove = variant === 'glow' ? function (e) {
      var r = e.currentTarget.getBoundingClientRect();
      e.currentTarget.style.setProperty('--mx', ((e.clientX - r.left) / r.width) * 100 + '%');
      e.currentTarget.style.setProperty('--my', ((e.clientY - r.top) / r.height) * 100 + '%');
      if (p.onMouseMove) p.onMouseMove(e);
    } : p.onMouseMove;
    return h('div', Object.assign({}, rest, {
      onMouseMove: onMove,
      className: cx(variant === 'sm' ? 'card-sm' : 'card', variant === 'glow' && 'glow-card', p.className)
    }), p.children);
  }

  var BADGE = { pending: 'badge-pending', confirmed: 'badge-confirmed', done: 'badge-done', canceled: 'badge-canceled' };
  function Badge(p) {
    return h('span', { className: cx('badge', BADGE[p.status || 'pending'], p.className) }, p.children);
  }

  function Divider(p) { return h('div', { className: cx('divider', p.className), style: p.style }); }

  /* Lista em grade do app (padrão .list-header / .list-row): no mobile cada linha vira um card. */
  function Table(p) {
    var cols = p.columns || [];
    var rows = p.rows || [];
    var grid = cols.map(function (c) { return c.width || '1fr'; }).join(' ');
    var body;
    if (p.loading) body = h('div', { className: 'bos-list-empty' }, 'Carregando...');
    else if (!rows.length) body = h('div', { className: 'bos-list-empty' }, p.emptyText || 'Nenhum registro encontrado.');
    else body = rows.map(function (r, i) {
      return h('div', { key: r.id != null ? r.id : i, className: 'list-row bos-list-row', style: { gridTemplateColumns: grid } },
        cols.map(function (c, j) {
          var v = c.render ? c.render(r) : r[c.key];
          return h('div', { key: c.key || j, className: cx('bos-list-cell', j === 0 && 'bos-list-cell-main', c.align === 'right' && 'bos-list-cell-right') },
            j > 0 && c.label ? h('span', { className: 'mobile-only-label' }, c.label + ': ') : null, v);
        }));
    });
    return h('div', { className: cx('card bos-list', p.className) },
      h('div', { className: 'list-header bos-list-header', style: { gridTemplateColumns: grid } },
        cols.map(function (c, j) { return h('span', { key: c.key || j, className: c.align === 'right' ? 'bos-list-cell-right' : null }, c.label || ''); })),
      body);
  }

  function StatCard(p) {
    var small = p.size === 'sm';
    return h(Card, { variant: p.onClick ? 'glow' : 'default', onClick: p.onClick, className: cx('bos-stat', small && 'bos-stat-sm') },
      p.icon ? (small
        ? h('span', { className: 'bos-stat-icon-sm' }, h(Icon, { name: p.icon, size: 14 }))
        : h('div', { className: 'bos-stat-icon' }, h(Icon, { name: p.icon, size: 16 }))) : null,
      h('p', { className: 'bos-stat-value' }, p.value),
      h('p', { className: 'bos-stat-label' }, p.label),
      p.sub ? h('p', { className: 'bos-stat-sub' }, p.sub) : null);
  }

  function StatGrid(p) {
    return h('div', { className: cx('stat-grid bos-stat-grid', p.className), style: { gridTemplateColumns: 'repeat(' + (p.columns || 4) + ', 1fr)' } }, p.children);
  }

  function PageHeader(p) {
    return h('div', { className: 'page-header-row bos-page-header' },
      h('div', null,
        p.eyebrow ? h('p', { className: 'bos-eyebrow' }, p.eyebrow) : null,
        h('h1', { className: 'bos-page-title' }, p.title),
        p.subtitle ? h('p', { className: 'bos-page-subtitle' }, p.subtitle) : null),
      p.action || null);
  }

  function Modal(p) {
    var open = p.open !== false;
    useEffect(function () {
      if (!open) return;
      function onKey(e) {
        if (e.key === 'Escape' && p.onClose) { e.preventDefault(); p.onClose(); }
        if (e.key === 'F10' && p.onSave) { e.preventDefault(); p.onSave(); }
      }
      window.addEventListener('keydown', onKey);
      return function () { window.removeEventListener('keydown', onKey); };
    }, [open, p.onClose, p.onSave]);
    if (!open) return null;
    var footer = p.footer !== undefined ? p.footer : (p.onSave ? h('div', { className: 'bos-modal-footer' },
      h(Button, { variant: 'secondary', onClick: p.onClose }, p.cancelLabel || 'Cancelar (Esc)'),
      h(Button, { variant: 'primary', onClick: p.onSave, disabled: p.saving }, p.saving ? 'Salvando...' : (p.saveLabel || 'Salvar (F10)'))) : null);
    return h('div', {
      className: cx('bos-modal-overlay', p.inline && 'bos-modal-inline'),
      onClick: function (e) { if (e.target === e.currentTarget && p.onClose) p.onClose(); }
    },
      h('div', { className: 'card bos-modal', role: 'dialog', 'aria-modal': true, style: { maxWidth: (p.maxWidth || 380) + 'px' } },
        h('div', { className: 'bos-modal-head' },
          h('h2', { className: 'bos-modal-title' }, p.title),
          p.onClose ? h(Button, { variant: 'icon', onClick: p.onClose, title: 'Fechar', icon: 'x' }) : null),
        h('div', { className: 'bos-modal-body' }, p.children, p.error ? h('p', { className: 'bos-field-error' }, p.error) : null, footer)));
  }

  function NavItem(p) {
    return h('a', {
      href: p.href || '#', className: cx('bos-nav-item', p.active && 'is-active'),
      onClick: function (e) { if (p.onNavigate) { e.preventDefault(); p.onNavigate(p.item); } }
    },
      h(Icon, { name: p.item.icon, size: 15, strokeWidth: p.active ? 2.2 : 1.75 }),
      h('span', { className: 'bos-nav-label' }, p.item.label),
      p.active ? h('span', { className: 'bos-nav-dot' }) : null);
  }

  function NavGroup(p) {
    var contains = p.group.items.some(function (i) { return i.to === p.active; });
    var st = useState(contains || !!p.group.open); var open = st[0], setOpen = st[1];
    return h('div', { className: 'bos-nav-group' },
      h('button', { type: 'button', className: 'bos-nav-group-btn', onClick: function () { setOpen(!open); }, 'aria-expanded': open },
        h(Icon, { name: p.group.icon, size: 14, strokeWidth: 1.9 }),
        h('span', { className: 'bos-nav-label' }, p.group.label),
        h(Icon, { name: 'chevronDown', size: 13, style: { transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s ease' } })),
      open ? h('div', { className: 'bos-nav-group-items' }, p.group.items.map(function (i) {
        return h(NavItem, { key: i.to, item: i, href: i.to, active: i.to === p.active, onNavigate: p.onNavigate });
      })) : null);
  }

  function initials(name) {
    return String(name || '').split(' ').slice(0, 2).map(function (n) { return n[0] || ''; }).join('').toUpperCase();
  }

  function Sidebar(p) {
    var user = p.user || {};
    var items = function (list) {
      return (list || []).map(function (i) { return h(NavItem, { key: i.to, item: i, href: i.to, active: i.to === p.active, onNavigate: p.onNavigate }); });
    };
    return h('aside', { className: cx('app-sidebar bos-sidebar', p.hidden && 'is-hidden') },
      h('div', { className: 'bos-sidebar-brand' },
        p.logoSrc ? h('img', { src: p.logoSrc, alt: 'Logo', className: 'bos-sidebar-logo' }) : null,
        h('span', { className: 'bos-sidebar-name' }, p.brand || 'BarberOS'),
        h('span', { className: 'bos-sidebar-chip' }, p.chip || 'ERP')),
      h('nav', { className: 'bos-sidebar-nav' },
        items(p.items),
        p.groups && p.groups.length ? h('div', { className: 'bos-nav-gap' }) : null,
        (p.groups || []).map(function (g) { return h(NavGroup, { key: g.label, group: g, active: p.active, onNavigate: p.onNavigate }); }),
        p.footerItems && p.footerItems.length ? h('div', { className: 'bos-nav-gap' }) : null,
        items(p.footerItems)),
      h('div', { className: 'bos-sidebar-user' },
        h('div', { className: 'bos-sidebar-user-row' },
          h('div', { className: 'bos-avatar' }, initials(user.name)),
          h('div', { className: 'bos-sidebar-user-text' },
            h('p', { className: 'bos-sidebar-user-name' }, user.name || 'Usuário'),
            h('p', { className: 'bos-sidebar-user-role' }, user.role || '—')),
          p.onSignOut ? h('button', { type: 'button', className: 'bos-signout', title: 'Sair', onClick: p.onSignOut }, h(Icon, { name: 'logOut', size: 13 })) : null)));
  }

  function AppHeader(p) {
    return h('div', { className: 'app-header bos-header' },
      h('div', { className: 'bos-header-left' },
        p.onToggleSidebar ? h('button', {
          type: 'button', className: cx('sidebar-toggle-btn bos-header-toggle', p.sidebarOpen && 'sidebar-open'),
          title: p.sidebarOpen ? 'Esconder menu' : 'Mostrar menu', onClick: p.onToggleSidebar
        }, h(Icon, { name: p.sidebarOpen ? 'panelClose' : 'panelOpen', size: 14 })) : null,
        h('span', { className: 'bos-crumb-root' }, p.brand || 'BarberOS'),
        p.pageName ? h(Icon, { name: 'chevronRight', size: 12, style: { color: 'var(--surface-inset)' } }) : null,
        p.pageName ? h('span', { className: 'bos-crumb-page' }, p.pageName) : null),
      h('div', { className: 'bos-header-actions' },
        h('label', { className: 'app-header-search bos-header-search' },
          h(Icon, { name: 'search', size: 12 }),
          h('input', { type: 'text', placeholder: p.searchPlaceholder || 'Buscar...', onChange: p.onSearch ? function (e) { p.onSearch(e.target.value); } : undefined })),
        h('button', { type: 'button', className: 'bos-header-btn', title: 'Notificações' },
          h(Icon, { name: 'bell', size: 13 }),
          p.hasNotifications !== false ? h('span', { className: 'bos-header-dot' }) : null)));
  }

  function AppLayout(p) {
    var st = useState(function () {
      if (p.defaultSidebarOpen != null) return !p.defaultSidebarOpen;
      return typeof window !== 'undefined' && window.innerWidth < 768;
    });
    var hidden = st[0], setHidden = st[1];
    var sidebar = Object.assign({}, p.sidebar || {}, {
      hidden: hidden,
      onNavigate: function (item) {
        if (window.innerWidth < 768) setHidden(true);
        if (p.sidebar && p.sidebar.onNavigate) p.sidebar.onNavigate(item);
      }
    });
    return h('div', { className: 'bos-layout' },
      h(Sidebar, sidebar),
      !hidden ? h('div', { className: 'mobile-sidebar-backdrop', onClick: function () { setHidden(true); } }) : null,
      h('div', { className: 'bos-layout-main' },
        h(AppHeader, Object.assign({}, p.header || {}, { sidebarOpen: !hidden, onToggleSidebar: function () { setHidden(!hidden); } })),
        h('main', { className: 'bos-layout-content' }, h('div', { className: 'page' }, p.children))));
  }

  window.BarberOS = {
    Button: Button, Field: Field, Card: Card, Badge: Badge, Divider: Divider, Table: Table,
    StatCard: StatCard, StatGrid: StatGrid, PageHeader: PageHeader, Modal: Modal,
    Sidebar: Sidebar, AppHeader: AppHeader, AppLayout: AppLayout, Icon: Icon
  };
})();
