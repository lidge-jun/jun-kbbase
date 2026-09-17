/* ===== Japandi Knowledge Base — App ===== */

const DOMAINS = {
  ai:         { label: 'AI',         color: '#6251b5' },
  dev:        { label: '개발 & CS',   color: '#2878a9' },
  accounting: { label: '회계',        color: '#2d855f' },
  economics:  { label: '경제 & 통계', color: '#c75b39' },
  design:     { label: '디자인',      color: '#b83f7d' },
  startup:    { label: '창업',        color: '#b7791f' },
  english:    { label: '영어',        color: '#16858b' },
  other:      { label: '기타',      color: '#78716c' },
};

const CODE_LANGUAGE_ALIASES = {
  'c++': 'cpp', cc: 'cpp', cxx: 'cpp', py: 'python', js: 'javascript',
  ts: 'typescript', sh: 'bash', yml: 'yaml', md: 'markdown', html: 'markup',
};
const CODE_LANGUAGE_LABELS = {
  cpp: 'C++', c: 'C', csharp: 'C#', java: 'Java',
  python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript',
  jsx: 'JSX', tsx: 'TSX', bash: 'Bash', shell: 'Shell', json: 'JSON',
  markup: 'HTML', css: 'CSS', sql: 'SQL', yaml: 'YAML', markdown: 'Markdown', text: 'Text',
};

let data = { concepts: [], questions: [], posts: [], drafts: [] };
let graph = { nodes: [], edges: [] };
let content = {};
let currentView = 'home';
let previousView = 'home';
let activeDomain = 'all';
let memoData = { noteId: null, memos: [] };
let memoDraft = { type: 'insight', text: '', anchor: null };
let memoPanelOpen = localStorage.getItem('memoPanel') === 'open';
let memoLoadToken = 0;
let memoResolvedPositions = new Map();
let memoOrphanIds = new Set();

/* ---------- BOOT ---------- */
async function init() {
  // Configure marked
  marked.setOptions({ breaks: true, gfm: true });
  marked.use({
    extensions: [{
      // Keep range notation (0~1) literal; strikethrough requires ~~text~~.
      name: 'singleTilde',
      level: 'inline',
      start(src) {
        const index = src.indexOf('~');
        return index === -1 ? undefined : index;
      },
      tokenizer(src) {
        if (src[0] !== '~' || src.startsWith('~~')) return;
        return { type: 'singleTilde', raw: '~' };
      },
      renderer() {
        return '~';
      },
    }, {
      name: 'wikilink',
      level: 'inline',
      start(src) {
        return src.indexOf('[[');
      },
      tokenizer(src) {
        const match = /^\[\[(?!\[)([^\[\]|]*?)(?:\|([^\[\]]*?))?\]\](?!\])/.exec(src);
        if (!match) return;

        const id = match[1].trim();
        const customLabel = match[2];
        const validId = /^[A-Za-z0-9._\-\uAC00-\uD7AF\u3040-\u30FF]+$/.test(id);
        const validLabel = customLabel === undefined || !/[\$<]/.test(customLabel);
        return {
          type: 'wikilink',
          raw: match[0],
          id,
          customLabel,
          valid: validId && validLabel,
        };
      },
      renderer(token) {
        if (!token.valid) return renderLiteralWikilink(token.raw);

        const item = allItems().find(candidate => candidate.id === token.id);
        const label = token.customLabel === undefined
          ? (item?.title || token.id)
          : token.customLabel.trim();
        const escapedLabel = escapeHtml(label);
        if (!Object.prototype.hasOwnProperty.call(content, token.id)) {
          return `<span class="wikilink-missing">${escapedLabel}</span>`;
        }
        return `<a class="wikilink" href="#/note/${encodeURIComponent(token.id)}" data-wikilink="${token.id}">${escapedLabel}</a>`;
      },
    }],
  });
  // Mermaid init
  if (window.mermaid) {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'neutral',
      fontFamily: 'Pretendard Variable, sans-serif',
      flowchart: {
        htmlLabels: true,
        wrappingWidth: 500,
        nodeSpacing: 50,
        rankSpacing: 50,
        padding: 15
      }
    });
  }

  // Static hosting (no local API) => read-only mode: hide edit UI, skip polling
  const versionPromise = fetch('/api/version')
    .then(r => { if (!r.ok) throw new Error('no api'); return r.json(); })
    .then(({ version }) => { lastVersion = version; })
    .catch(() => { window.KB_READONLY = true; document.body.classList.add('readonly'); });

  try {
    const [idx, gr, ct] = await Promise.all([
      fetch('data/index.json').then(r => r.json()),
      fetch('data/graph.json').then(r => r.json()),
      fetch('data/all-content.json').then(r => r.json()),
    ]);
    data = idx; graph = gr; content = ct;
  } catch { console.log('Run `npm run build` first.'); }
  await versionPromise;

  setupNav();
  setupSearch();
  setupDomainStrip();
  renderHome();
  renderSidebar();

  // Route from URL hash (#/note/<id> or #/<view>) so the address bar
  // always reflects what is on screen
  await applyHashRoute();
  reportCurrentPage();
  window.addEventListener('hashchange', applyHashRoute);

  // Live reload: poll content version; refresh when files change externally
  if (!window.KB_READONLY) setInterval(checkVersion, 3000);
}

/* ---------- ROUTING & LIVE STATE ---------- */
function setRoute(hash) {
  if (location.hash !== hash) history.replaceState(null, '', hash);
}

async function applyHashRoute() {
  const h = location.hash;
  const noteMatch = h.match(/^#\/note\/(.+)$/);
  if (noteMatch) {
    const id = decodeURIComponent(noteMatch[1]);
    if (vditorInstance) await destroyVditor(false);
    if (currentView !== 'detail' || currentDetailId !== id) showDetail(id);
    return;
  }
  const viewMatch = h.match(/^#\/(home|library|graph|journal)$/);
  if (viewMatch) {
    if (vditorInstance) await destroyVditor(false);
    if (currentView !== viewMatch[1]) switchView(viewMatch[1]);
  }
}

function reportCurrentPage() {
  if (window.KB_READONLY) return;
  const payload = { view: currentView, id: currentDetailId };
  if (currentDetailId) {
    const item = allItems().find(i => i.id === currentDetailId);
    payload.title = item ? item.title : null;
  }
  fetch('/api/current-page', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

let lastVersion = null;
async function checkVersion() {
  if (vditorInstance) return; // don't clobber an active edit session
  try {
    const { version } = await fetch('/api/version').then(r => r.json());
    if (lastVersion === null) { lastVersion = version; return; }
    if (version !== lastVersion) {
      const detailId = currentView === 'detail' ? currentDetailId : null;
      // The document is the scroll container (#main does not overflow)
      const scroller = document.scrollingElement;
      const scrollTop = scroller.scrollTop;
      await reloadData();
      if (detailId && currentView === 'detail' && currentDetailId === detailId) {
        showDetail(detailId);
        scroller.scrollTop = scrollTop;
      }
      lastVersion = version;
    }
  } catch {}
}

/* ---------- NAV ---------- */
function setupNav() {
  document.querySelectorAll('.tab[data-view]').forEach(b =>
    b.addEventListener('click', () => switchView(b.dataset.view)));
  document.querySelectorAll('.link-btn[data-view]').forEach(b =>
    b.addEventListener('click', () => switchView(b.dataset.view)));
  document.getElementById('logo-home').addEventListener('click', () => switchView('home'));

  document.getElementById('back-btn').addEventListener('click', () => {
    document.body.classList.remove('focus-mode');
    switchView(previousView);
  });

  const focusBtn = document.getElementById('focus-toggle');
  if (focusBtn) focusBtn.addEventListener('click', () =>
    document.body.classList.toggle('focus-mode'));

  document.getElementById('surprise-btn').addEventListener('click', surprise);
  setupDeploy();

  // keyboard
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      toggleSearch(false);
      clearMemoAnchor();
    }
    if (e.key === 'Escape' && vditorInstance) destroyVditor();
    // Cmd+E: toggle inline editor
    if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
      e.preventDefault();
      if (vditorInstance) { destroyVditor(); }
      else if (currentView === 'detail' && currentDetailId) { toggleVditor(currentDetailId); }
    }
    // Cmd+S: save immediately
    if ((e.metaKey || e.ctrlKey) && e.key === 's' && vditorInstance) {
      e.preventDefault();
      clearTimeout(saveTimer);
      saveVditor();
    }
  });
}

function switchView(view) {
  if (view !== 'detail' && view !== 'search') previousView = view;
  currentView = view;
  if (view !== 'detail' && view !== 'search') { setRoute('#/' + view); currentDetailId = null; }
  reportCurrentPage();
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById('view-' + view);
  if (el) el.classList.add('active');
  document.querySelectorAll('.tab').forEach(b =>
    b.classList.toggle('active', b.dataset.view === view));
  // render on switch
  if (view === 'library') renderLibrary();
  if (view === 'graph') renderGraph();
  if (view === 'journal') renderJournal();
  if (view === 'home') renderHome();
  syncMemoPanel();
}

/* ---------- DOMAIN STRIP ---------- */
function setupDomainStrip() {
  document.querySelectorAll('.domain-pill').forEach(b => {
    b.addEventListener('click', () => {
      activeDomain = b.dataset.domain;
      document.querySelectorAll('.domain-pill').forEach(p =>
        p.classList.toggle('active', p.dataset.domain === activeDomain));
      // re-render current view
      if (currentView === 'library') renderLibrary();
      if (currentView === 'home') renderHome();
      if (currentView === 'graph') renderGraph();
      if (currentView === 'journal') renderJournal();
      renderSidebar();
    });
  });
}

function guessDomain(item) {
  const tags = (item.tags || []).map(t => t.toLowerCase());
  for (const [key] of Object.entries(DOMAINS)) {
    if (tags.includes(key)) return key;
  }
  if (tags.some(t => ['deep-learning','nlp','ml','gpt','llm','transformer'].includes(t))) return 'ai';
  if (tags.some(t => ['javascript','react','css','html','python','node','frontend','backend','cs','computer-science','algorithm','data-structure','operating-system','network','database'].includes(t))) return 'dev';
  if (tags.some(t => ['economy','economic','economics','finance','statistics','stats','probability','econometrics','경제','통계'].includes(t))) return 'economics';
  if (tags.some(t => ['ux','ui','figma','typography'].includes(t))) return 'design';
  if (tags.some(t => ['business','mvp','product'].includes(t))) return 'startup';
  if (tags.some(t => ['grammar','vocabulary','toeic','ielts'].includes(t))) return 'english';
  return 'other';
}

function filterByDomain(items) {
  if (activeDomain === 'all') return items;
  return items.filter(i => guessDomain(i) === activeDomain);
}

function domainColor(item) {
  const d = guessDomain(item);
  return DOMAINS[d]?.color || '#78716c';
}

/* ---------- SEARCH ---------- */
let _searchDebounce = null;
let _searchSelectedIdx = -1;

function setupSearch() {
  const toggle = document.getElementById('search-toggle');
  toggle.addEventListener('click', () => toggleSearch(true));

  const overlay = document.getElementById('search-overlay');
  overlay.addEventListener('click', e => {
    if (e.target === overlay) toggleSearch(false);
  });

  const input = document.getElementById('global-search');
  input.addEventListener('input', e => {
    clearTimeout(_searchDebounce);
    _searchDebounce = setTimeout(() => fetchSearchResults(e.target.value), 300);
  });

  input.addEventListener('keydown', e => {
    const items = document.querySelectorAll('#search-results .search-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _searchSelectedIdx = Math.min(_searchSelectedIdx + 1, items.length - 1);
      highlightSearchItem(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _searchSelectedIdx = Math.max(_searchSelectedIdx - 1, -1);
      highlightSearchItem(items);
    } else if (e.key === 'Enter' && _searchSelectedIdx >= 0 && items[_searchSelectedIdx]) {
      e.preventDefault();
      items[_searchSelectedIdx].click();
    } else if (e.key === 'Escape') {
      toggleSearch(false);
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.contentEditable === 'true') return;
      e.preventDefault();
      toggleSearch(true);
    }
  });
}

function toggleSearch(open) {
  const overlay = document.getElementById('search-overlay');
  overlay.classList.toggle('hidden', !open);
  if (open) {
    const input = document.getElementById('global-search');
    input.value = '';
    input.focus();
    document.getElementById('search-results').innerHTML = '';
    _searchSelectedIdx = -1;
  }
}

function highlightSearchItem(items) {
  items.forEach((el, i) => el.classList.toggle('selected', i === _searchSelectedIdx));
}

async function fetchSearchResults(q) {
  const container = document.getElementById('search-results');
  if (!q || q.length < 2) { container.innerHTML = ''; return; }

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&depth=1&limit=15`);
    const json = await res.json();
    if (!json.results || json.results.length === 0) {
      container.innerHTML = `<p class="search-empty">결과 없음</p>`;
      return;
    }
    _searchSelectedIdx = -1;
    container.innerHTML = json.results.map((r, i) => searchItemHTML(r, i)).join('');
  } catch (e) {
    container.innerHTML = `<p class="search-empty">검색 오류</p>`;
  }
}

function searchItemHTML(r) {
  let matchBadge = '';
  if (r.matchType === 'ontology') {
    matchBadge = `<span class="search-relation">${r.viaTitle || r.via} <span class="rel-arrow">&rarr;</span> <span class="rel-label">${r.relation}</span></span>`;
  } else {
    matchBadge = `<span class="search-match-field">${r.matchField}</span>`;
    // Show ontology context for direct matches that are also graph neighbors
    if (r.relatedTo && r.relatedTo.length > 0) {
      const rel = r.relatedTo[0];
      matchBadge += `<span class="search-relation">${rel.viaTitle || rel.via} <span class="rel-arrow">&rarr;</span> <span class="rel-label">${rel.relation}</span></span>`;
    }
  }
  const color = domainColor(r);
  return `<div class="search-item" onclick="showDetail('${r.id}');toggleSearch(false)">
    <div class="search-item-dot" style="background:${color}"></div>
    <div class="search-item-body">
      <div class="search-item-title">${r.title}</div>
      <div class="search-item-meta">${matchBadge}${r.tags?.slice(0,3).map(t => `<span class="tag">${t}</span>`).join('') || ''}</div>
    </div>
    <div class="search-item-score">${r.score}</div>
  </div>`;
}

/* ---------- HOME ---------- */
function renderHome() {
  // greeting
  const h = new Date().getHours();
  const greet = h < 6 ? '좋은 밤이에요' : h < 12 ? '좋은 아침이에요' : h < 18 ? '좋은 오후예요' : '좋은 저녁이에요';
  document.getElementById('greeting').textContent = greet;
  document.getElementById('greeting-sub').textContent =
    allItems().length > 0
      ? `${allItems().length} 개의 개념, ${Object.keys(DOMAINS).length} 개 도메인`
      : '공부를 시작하면 여기에 지식이 쌓여요';

  // domain overview
  const overview = document.getElementById('domain-overview');
  const items = allItems();
  const counts = {};
  for (const [k] of Object.entries(DOMAINS)) counts[k] = 0;
  items.forEach(i => { counts[guessDomain(i)] = (counts[guessDomain(i)]||0)+1; });
  const maxCount = Math.max(1, ...Object.values(counts));

  overview.innerHTML = Object.entries(DOMAINS).map(([key, d]) => `
    <div class="domain-card" style="--domain-color:${d.color}" onclick="setDomainAndGo('${key}')">
      <span class="dc-count" style="color:${d.color}">${counts[key]||0}</span>
      <span class="dc-label">${d.label}</span>
      <div class="dc-bar" style="background:${d.color};width:${Math.max(8,(counts[key]||0)/maxCount*100)}%"></div>
    </div>
  `).join('');

  // recent
  const recent = document.getElementById('recent-items');
  const sorted = filterByDomain([...items]).sort((a,b) =>
    (b.date||b.created||'').localeCompare(a.date||a.created||'')).slice(0,5);
  recent.innerHTML = sorted.length
    ? '<div class="card-list">' + sorted.map(i => cardHTML(i)).join('') + '</div>'
    : `<p style="color:var(--text-3);font-size:13px">아직 개념이 없어요</p>`;

  // latest posts
  const posts = document.getElementById('latest-posts');
  const pub = filterByDomain(data.posts.filter(p => p.published)).slice(0,3);
  posts.innerHTML = pub.length
    ? pub.map(p => journalItemHTML(p)).join('')
    : `<p style="color:var(--text-3);font-size:13px">아직 발행한 글이 없어요</p>`;

  // stats
  document.getElementById('stats').innerHTML = `
    <span>${data.concepts.length} 개념</span>
    <span>${data.questions.length} 질문</span>
    <span>${data.posts.length} 글</span>
    <span>${graph.edges.length} 연결</span>
  `;
}

/* ---------- LIBRARY ---------- */
function renderLibrary() {
  const list = document.getElementById('library-list');
  const filter = document.getElementById('library-filter');
  const q = (filter?.value || '').toLowerCase();

  let items = filterByDomain(allItems());
  if (q) items = items.filter(i =>
    i.title.toLowerCase().includes(q) ||
    (i.tags||[]).some(t => t.toLowerCase().includes(q)));

  items.sort((a,b) => (b.date||b.created||'').localeCompare(a.date||a.created||''));

  list.innerHTML = items.length
    ? items.map(i => cardHTML(i)).join('')
    : `<p style="color:var(--text-3);font-size:13px;padding:20px 0">이 도메인에 아직 항목이 없어요</p>`;

  // rebind filter
  if (filter && !filter._bound) {
    filter.addEventListener('input', () => renderLibrary());
    filter._bound = true;
  }
}

/* ---------- JOURNAL ---------- */
function renderJournal() {
  const list = document.getElementById('journal-list');
  const pub = filterByDomain(data.posts.filter(p => p.published))
    .sort((a,b) => (b.date||'').localeCompare(a.date||''));

  list.innerHTML = pub.length
    ? pub.map(p => journalItemHTML(p)).join('')
    : `<p style="color:var(--text-3);font-size:13px">아직 발행한 글이 없어요</p>`;
}

/* ---------- DETAIL ---------- */
function showDetail(id) {
  currentDetailId = id;
  setRoute('#/note/' + encodeURIComponent(id));
  // Highlight active item in sidebar
  document.querySelectorAll('.sb-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === id);
  });
  const raw = content[id];
  const detail = document.getElementById('detail-content');
  const relatedDiv = document.getElementById('detail-related');

  if (!raw) {
    detail.innerHTML = `<h1 class="detail-title">${id}</h1><p>Content not found.</p>`;
    relatedDiv.innerHTML = '';
    switchView('detail');
    loadMemos(id);
    return;
  }

  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const body = match ? match[2] : raw;
  const meta = match ? match[1] : '';

  const titleMatch = meta.match(/title:\s*["']?(.+?)["']?\s*$/m);
  const title = titleMatch ? titleMatch[1] : id;
  const dateMatch = meta.match(/(?:date|created):\s*(.+)/);
  const tagsMatch = meta.match(/tags:\s*\[(.+?)\]/);
  const tags = tagsMatch ? tagsMatch[1].split(',').map(t=>t.trim().replace(/["']/g,'')) : [];

  // Find item for domain color
  const item = allItems().find(i => i.id === id);
  const color = item ? domainColor(item) : '#78716c';

  detail.innerHTML = `
    <h1 class="detail-title" style="border-left:3px solid ${color};padding-left:12px">${title}</h1>
    <div class="detail-meta">
      ${dateMatch ? `<span>${dateMatch[1]}</span>` : ''}
      ${tags.map(t => `<span class="tag">${t}</span>`).join('')}
      <button class="edit-btn" onclick="toggleMemoPanel()">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3H5a2 2 0 0 0-2 2v14l4-4h9a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Z"/><path d="M21 7v10a2 2 0 0 1-2 2H9"/></svg>
        메모 <span id="memo-count"></span>
      </button>
      <button class="edit-btn" onclick="toggleVditor('${id}')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        수정
      </button>
      <button class="edit-btn" onclick="deleteEntry('${id}','${item?.type||'concept'}')" style="color:var(--text-3)">삭제</button>
    </div>
    ${renderMarkdownWithMath(body)}
  `;

  // Rich content: Mermaid diagrams
  renderRichContent(detail);

  // Related items
  const related = findRelated(id);
  relatedDiv.innerHTML = related.length ? `
    <h3>관련 개념</h3>
    <div class="card-list">
      ${related.map(r => cardHTML(r)).join('')}
    </div>
  ` : '';

  switchView('detail');
  loadMemos(id);
  // scroll to top
  document.scrollingElement.scrollTop = 0;
  document.getElementById('main').scrollTop = 0;
}

/* ---------- MEMOS ---------- */
function setupMemoPanel() {
  document.getElementById('memo-close').addEventListener('click', () => toggleMemoPanel(false));
  document.getElementById('memo-save').addEventListener('click', addMemo);

  const input = document.getElementById('memo-input');
  input.value = memoDraft.text;
  input.addEventListener('input', () => { memoDraft.text = input.value; });
  input.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      addMemo();
    }
  });

  document.querySelectorAll('.memo-type').forEach(button => {
    button.addEventListener('click', () => {
      memoDraft.type = button.dataset.type;
      document.querySelectorAll('.memo-type').forEach(option => {
        const selected = option.dataset.type === memoDraft.type;
        option.classList.toggle('active', selected);
        option.setAttribute('aria-checked', String(selected));
      });
    });
  });

  document.getElementById('detail-content').addEventListener('mouseup', handleDetailMouseUp);

  // Selection popover: commit on click, dismiss on outside interaction
  const popBtn = document.getElementById('memo-popover-btn');
  // mousedown so the click cannot collapse the selection first
  popBtn.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); });
  popBtn.addEventListener('click', e => { e.stopPropagation(); commitPendingAnchor(); });
  document.addEventListener('mousedown', e => {
    if (pendingAnchor && !(e.target.closest && e.target.closest('#memo-popover'))) hideMemoPopover();
  });
  document.getElementById('main').addEventListener('scroll', () => { if (pendingAnchor) hideMemoPopover(); }, { passive: true });
  window.addEventListener('scroll', () => { if (pendingAnchor) hideMemoPopover(); }, { passive: true });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && pendingAnchor) hideMemoPopover(); });
}

function syncMemoPanel() {
  const shouldOpen = memoPanelOpen && currentView === 'detail' &&
    !document.body.classList.contains('editing-mode');
  const wasOpen = document.body.classList.contains('memo-open');
  document.body.classList.toggle('memo-open', shouldOpen);
  if (wasOpen && !shouldOpen) clearHighlights();
}

function toggleMemoPanel(open) {
  memoPanelOpen = open === undefined ? !memoPanelOpen : open;
  localStorage.setItem('memoPanel', memoPanelOpen ? 'open' : 'closed');
  syncMemoPanel();
  if (isMemoPanelVisible()) applyHighlights();
  else clearHighlights();
}

async function loadMemos(noteId) {
  const token = ++memoLoadToken;
  memoData = { noteId, memos: [], loading: true };
  memoResolvedPositions = new Map();
  memoOrphanIds = new Set();
  clearHighlights();
  renderMemoList();

  try {
    const response = await fetch(`/api/annotations?id=${encodeURIComponent(noteId)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const loaded = await response.json();
    if (token !== memoLoadToken || currentDetailId !== noteId) return;
    memoData = {
      noteId,
      updated: loaded.updated || null,
      memos: Array.isArray(loaded.memos) ? loaded.memos : [],
      loading: false,
    };
    if (isMemoPanelVisible()) applyHighlights();
    else renderMemoList();
  } catch (error) {
    if (token !== memoLoadToken || currentDetailId !== noteId) return;
    console.error('[memos] load failed', error);
    memoData = { noteId, memos: [], loading: false, loadError: true };
    renderMemoList();
    toast('메모 로드 실패');
  }
}

async function saveMemos() {
  if (memoData.loadError) {
    toast('메모를 불러오지 못해 저장할 수 없습니다');
    return false;
  }

  try {
    const response = await fetch('/api/annotations', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noteId: memoData.noteId, memos: memoData.memos }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return true;
  } catch (error) {
    console.error('[memos] save failed', error);
    toast('메모 저장 실패');
    return false;
  }
}

function memoTypeIcon(type) {
  const icons = {
    insight: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M8.5 14.5A6 6 0 1 1 15.5 14.5C14.5 15.3 14 16.1 14 18h-4c0-1.9-.5-2.7-1.5-3.5Z"/></svg>',
    question: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 1 1 5.6 1.5c-.9 1.1-2.7 1.5-2.7 3.5"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>',
    link: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
    todo: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  };
  return icons[type] || icons.insight;
}

function formatMemoTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const part = number => String(number).padStart(2, '0');
  return `${part(date.getMonth() + 1)}-${part(date.getDate())} ${part(date.getHours())}:${part(date.getMinutes())}`;
}

function buildProjection(root) {
  let text = '';
  const map = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.parentElement?.closest('.katex, pre, code, .mermaid, svg')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    },
  });

  let node;
  while ((node = walker.nextNode())) {
    text += node.data;
    for (let offset = 0; offset < node.data.length; offset++) {
      map.push({ node, nodeStart: offset });
    }
  }
  return { text, map };
}

function projectionOffset(projection, node, nodeOffset) {
  const start = projection.map.findIndex(point => point.node === node);
  if (start < 0 || nodeOffset < 0 || nodeOffset > node.data.length) return null;
  return start + nodeOffset;
}

function projectionPoint(projection, offset) {
  if (offset < projection.map.length) {
    const point = projection.map[offset];
    return { node: point.node, offset: point.nodeStart };
  }
  const last = projection.map.at(-1);
  return last ? { node: last.node, offset: last.nodeStart + 1 } : null;
}

function captureAnchor(range) {
  const root = document.getElementById('detail-content');
  const projection = buildProjection(root);
  if (range.startContainer.nodeType !== Node.TEXT_NODE ||
      range.endContainer.nodeType !== Node.TEXT_NODE) return null;

  const start = projectionOffset(projection, range.startContainer, range.startOffset);
  const end = projectionOffset(projection, range.endContainer, range.endOffset);
  if (start === null || end === null || end <= start) return null;
  return {
    exact: projection.text.slice(start, end),
    prefix: projection.text.slice(Math.max(0, start - 30), start),
    suffix: projection.text.slice(end, end + 30),
  };
}

function normalizeWithOffsets(value) {
  let text = '';
  const starts = [];
  const ends = [];
  for (let index = 0; index < value.length;) {
    if (/\s/.test(value[index])) {
      let end = index + 1;
      while (end < value.length && /\s/.test(value[end])) end++;
      text += ' ';
      starts.push(index);
      ends.push(end);
      index = end;
    } else {
      text += value[index];
      starts.push(index);
      ends.push(index + 1);
      index++;
    }
  }
  return { text, starts, ends };
}

function findOccurrences(text, fragment, limit = Infinity) {
  if (!fragment) return [];
  const matches = [];
  let from = 0;
  while (matches.length < limit) {
    const index = text.indexOf(fragment, from);
    if (index < 0) break;
    matches.push(index);
    from = index + 1;
  }
  return matches;
}

function commonPrefixLength(left, right) {
  let length = 0;
  while (length < left.length && length < right.length && left[length] === right[length]) length++;
  return length;
}

function commonSuffixLength(left, right) {
  let length = 0;
  while (length < left.length && length < right.length &&
      left[left.length - 1 - length] === right[right.length - 1 - length]) length++;
  return length;
}

function anchorContextScore(text, candidate, anchor) {
  const prefix = String(anchor.prefix || '').replace(/\s+/g, ' ');
  const suffix = String(anchor.suffix || '').replace(/\s+/g, ' ');
  const before = text.slice(Math.max(0, candidate.start - 30), candidate.start);
  const after = text.slice(candidate.end, candidate.end + 30);
  return commonSuffixLength(before, prefix) + commonPrefixLength(after, suffix);
}

function bestAnchorCandidate(candidates, text, anchor) {
  return candidates.reduce((best, candidate) => {
    const score = anchorContextScore(text, candidate, anchor);
    if (!best || score > best.score || (score === best.score && candidate.start < best.start)) {
      return { ...candidate, score };
    }
    return best;
  }, null);
}

function approximateAnchorCandidate(exact, text, anchor) {
  const fragmentLength = Math.min(exact.length, Math.max(15, Math.ceil(exact.length / 3)));
  if (!fragmentLength) return null;
  const head = exact.slice(0, fragmentLength);
  const tail = exact.slice(-fragmentLength);
  const heads = findOccurrences(text, head, 20);
  const tails = findOccurrences(text, tail, 20);
  const pairs = [];

  for (const headStart of heads) {
    for (const tailStart of tails) {
      const end = tailStart + fragmentLength;
      if (headStart < tailStart && end - headStart <= exact.length * 2) {
        pairs.push({ start: headStart, end });
      }
    }
  }
  if (pairs.length) return bestAnchorCandidate(pairs, text, anchor);
  if (fragmentLength < 15) return null;

  const fragments = [
    ...heads.map(start => ({ start, end: start + fragmentLength })),
    ...tails.map(start => ({ start, end: start + fragmentLength })),
  ];
  return bestAnchorCandidate(fragments, text, anchor);
}

function resolveAnchor(anchor, projection) {
  if (!anchor || typeof anchor.exact !== 'string' || !anchor.exact) return null;
  const normalized = normalizeWithOffsets(projection.text);
  const exact = anchor.exact.replace(/\s+/g, ' ');
  if (!exact) return null;

  const exactMatches = findOccurrences(normalized.text, exact)
    .map(start => ({ start, end: start + exact.length }));
  const candidate = exactMatches.length
    ? bestAnchorCandidate(exactMatches, normalized.text, anchor)
    : approximateAnchorCandidate(exact, normalized.text, anchor);
  if (!candidate) return null;
  return {
    start: normalized.starts[candidate.start],
    end: normalized.ends[candidate.end - 1],
  };
}

function clearHighlights() {
  const root = document.getElementById('detail-content');
  if (!root) return;
  root.querySelectorAll('mark.memo-hl').forEach(mark => mark.replaceWith(...mark.childNodes));
  root.normalize();
}

function buildHighlightSegments(intervals) {
  const boundaries = [...new Set(intervals.flatMap(item => [item.start, item.end]))]
    .sort((a, b) => a - b);
  const segments = [];
  for (let index = 0; index < boundaries.length - 1; index++) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    const ids = intervals
      .filter(item => item.start <= start && item.end >= end)
      .map(item => item.id);
    if (ids.length) segments.push({ start, end, ids });
  }
  return segments;
}

function splitSegmentsByTextNode(segments, projection) {
  const ranges = [];
  for (const segment of segments) {
    let cursor = segment.start;
    while (cursor < segment.end) {
      const point = projectionPoint(projection, cursor);
      if (!point) break;
      const length = Math.min(segment.end - cursor, point.node.data.length - point.offset);
      if (length <= 0) break;
      ranges.push({
        node: point.node,
        startOffset: point.offset,
        endOffset: point.offset + length,
        documentStart: cursor,
        ids: segment.ids,
      });
      cursor += length;
    }
  }
  return ranges;
}

function wrapHighlightRange(range) {
  if (!range.node.isConnected || range.startOffset >= range.endOffset) return;
  let selected = range.node;
  if (range.startOffset > 0) selected = selected.splitText(range.startOffset);
  const length = range.endOffset - range.startOffset;
  if (length < selected.data.length) selected.splitText(length);
  const mark = document.createElement('mark');
  mark.className = 'memo-hl';
  mark.dataset.memoIds = range.ids.join(' ');
  selected.replaceWith(mark);
  mark.appendChild(selected);
}

function isMemoPanelVisible() {
  return document.body.classList.contains('memo-open') &&
    currentView === 'detail' && !document.body.classList.contains('editing-mode');
}

function applyHighlights() {
  if (!isMemoPanelVisible()) return;
  const root = document.getElementById('detail-content');
  clearHighlights();
  const projection = buildProjection(root);
  const intervals = [];
  memoResolvedPositions = new Map();
  memoOrphanIds = new Set();

  for (const memo of memoData.memos.filter(item => item.anchor)) {
    const resolved = resolveAnchor(memo.anchor, projection);
    if (!resolved) {
      memoOrphanIds.add(memo.id);
      continue;
    }
    memoResolvedPositions.set(memo.id, resolved.start);
    intervals.push({ ...resolved, id: memo.id });
  }

  const segments = buildHighlightSegments(intervals);
  splitSegmentsByTextNode(segments, projection)
    .sort((left, right) => right.documentStart - left.documentStart)
    .forEach(wrapHighlightRange);
  renderMemoList();
}

function clearMemoAnchor() {
  memoDraft.anchor = null;
  const quote = document.getElementById('memo-quote');
  if (!quote) return;
  quote.textContent = '';
  quote.classList.add('hidden');
}

// Pending anchor captured at selection time; committed when the popover is clicked
let pendingAnchor = null;

function hideMemoPopover() {
  pendingAnchor = null;
  document.getElementById('memo-popover').classList.add('hidden');
}

function showMemoPopover(range, anchor) {
  pendingAnchor = anchor;
  const pop = document.getElementById('memo-popover');
  pop.classList.remove('hidden');
  const rect = range.getBoundingClientRect();
  // Position above the selection, clamped to the viewport
  const popRect = pop.getBoundingClientRect();
  let top = rect.top - popRect.height - 8;
  if (top < 60) top = rect.bottom + 8; // fall below when near the chrome
  let left = rect.left + rect.width / 2 - popRect.width / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - popRect.width - 8));
  pop.style.top = `${top}px`;
  pop.style.left = `${left}px`;
}

function commitPendingAnchor() {
  clearMemoAnchor();
  if (pendingAnchor) {
    memoDraft.anchor = pendingAnchor;
    const quote = document.getElementById('memo-quote');
    quote.textContent = pendingAnchor.exact.length > 40 ? `${pendingAnchor.exact.slice(0, 40)}...` : pendingAnchor.exact;
    quote.classList.remove('hidden');
  }
  hideMemoPopover();
  toggleMemoPanel(true);
  document.getElementById('memo-input').focus();
}

function handleDetailMouseUp() {
  const detail = document.getElementById('detail-content');
  if (vditorInstance || detail.classList.contains('editing')) return;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    hideMemoPopover();
    clearMemoAnchor();
    return;
  }

  const range = selection.getRangeAt(0);
  if (!detail.contains(range.startContainer) || !detail.contains(range.endContainer)) return;
  const anchor = captureAnchor(range);
  if (anchor) showMemoPopover(range, anchor);
  else hideMemoPopover();
}

function activateMemoCard(memo, card) {
  if (!memo.anchor) return;
  const selector = `mark[data-memo-ids~="${CSS.escape(String(memo.id))}"]`;
  const mark = document.getElementById('detail-content').querySelector(selector);
  if (!mark) {
    card.classList.remove('memo-shake');
    void card.offsetWidth;
    card.classList.add('memo-shake');
    setTimeout(() => card.classList.remove('memo-shake'), 420);
    return;
  }
  mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
  mark.classList.remove('memo-flash');
  void mark.offsetWidth;
  mark.classList.add('memo-flash');
  setTimeout(() => mark.classList.remove('memo-flash'), 1200);
}

function renderMemoList() {
  const list = document.getElementById('memo-list');
  const count = document.getElementById('memo-count');
  if (count) count.textContent = memoData.memos.length ? String(memoData.memos.length) : '';

  const anchored = memoData.memos.filter(memo => memo.anchor).sort((a, b) => {
    const left = memoResolvedPositions.get(a.id);
    const right = memoResolvedPositions.get(b.id);
    if (left !== undefined && right !== undefined) return left - right;
    if (left !== undefined) return -1;
    if (right !== undefined) return 1;
    return (a.created || '').localeCompare(b.created || '');
  });
  const free = memoData.memos.filter(memo => !memo.anchor)
    .sort((a, b) => (a.created || '').localeCompare(b.created || ''));
  list.innerHTML = [...anchored, ...free].map(memo => {
    const exact = memo.anchor?.exact || '';
    const quote = exact.length > 40 ? `${exact.slice(0, 40)}...` : exact;
    const orphan = memoOrphanIds.has(memo.id);
    const anchoredAttributes = memo.anchor
      ? 'data-anchored="true" tabindex="0" role="button" aria-label="본문 위치로 이동"'
      : '';
    return `<article class="memo-card" data-id="${escapeHtml(memo.id)}" data-type="${escapeHtml(memo.type || 'insight')}" ${anchoredAttributes}>
      <div class="memo-card-head">
        <span class="memo-card-type">${memoTypeIcon(memo.type)}</span>
        <time datetime="${escapeHtml(memo.created || '')}">${formatMemoTime(memo.created)}</time>
        ${orphan ? '<span class="memo-orphan">위치 변경됨</span>' : ''}
        <button class="memo-delete" data-id="${escapeHtml(memo.id)}" onclick="deleteMemo(this.dataset.id)" title="메모 삭제" aria-label="메모 삭제">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>
      ${quote ? `<blockquote class="memo-quote memo-card-quote">${escapeHtml(quote)}</blockquote>` : ''}
      <p>${escapeHtml(memo.text)}</p>
    </article>`;
  }).join('');

  list.querySelectorAll('.memo-card').forEach(card => {
    const memo = memoData.memos.find(item => item.id === card.dataset.id);
    card.addEventListener('click', event => {
      if (!event.target.closest('.memo-delete')) activateMemoCard(memo, card);
    });
    card.addEventListener('keydown', event => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target === card) {
        event.preventDefault();
        activateMemoCard(memo, card);
      }
    });
  });
}

async function addMemo() {
  const input = document.getElementById('memo-input');
  const text = input.value.trim();
  if (!text) return;
  if (memoData.loadError) {
    toast('메모를 불러오지 못해 저장할 수 없습니다');
    return;
  }

  const now = new Date().toISOString();
  const memo = {
    id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    type: memoDraft.type,
    text,
    anchor: memoDraft.anchor,
    created: now,
    updated: now,
  };
  memoData.memos.push(memo);
  if (!await saveMemos()) {
    memoData.memos.pop();
    renderMemoList();
    return;
  }
  memoDraft.text = '';
  input.value = '';
  clearMemoAnchor();
  if (isMemoPanelVisible()) applyHighlights();
  else renderMemoList();
}

async function deleteMemo(id) {
  if (memoData.loadError) {
    toast('메모를 불러오지 못해 저장할 수 없습니다');
    return;
  }
  const previous = memoData.memos;
  memoData.memos = memoData.memos.filter(memo => memo.id !== id);
  if (!await saveMemos()) memoData.memos = previous;
  if (isMemoPanelVisible()) applyHighlights();
  else renderMemoList();
}

function findRelated(id) {
  const priorities = new Map();
  graph.edges.forEach(e => {
    const src = typeof e.source === 'object' ? e.source.id : e.source;
    const tgt = typeof e.target === 'object' ? e.target.id : e.target;
    const linkedId = src === id ? tgt : (tgt === id ? src : null);
    if (!linkedId) return;
    const priority = e.relation === 'links_to' ? 1 : 0;
    priorities.set(linkedId, Math.min(priorities.get(linkedId) ?? priority, priority));
  });
  return allItems()
    .filter(i => priorities.has(i.id))
    .sort((a, b) => priorities.get(a.id) - priorities.get(b.id))
    .slice(0, 5);
}

/* ---------- GRAPH ---------- */
function renderGraph() {
  const container = document.getElementById('graph-container');
  const rect = container.getBoundingClientRect();
  const width = rect.width || 600;
  const height = rect.height || 400;

  container.innerHTML = '';

  let nodes = [...graph.nodes];
  let edges = [...graph.edges].map(e => ({...e}));

  if (activeDomain !== 'all') {
    const domainNodeIds = new Set(
      nodes.filter(n => {
        const item = allItems().find(i => i.id === n.id);
        return item && guessDomain(item) === activeDomain;
      }).map(n => n.id)
    );
    nodes = nodes.filter(n => domainNodeIds.has(n.id));
    edges = edges.filter(e => domainNodeIds.has(e.source) && domainNodeIds.has(e.target));
  }

  if (nodes.length === 0) {
    container.innerHTML = `<p style="padding:40px;color:var(--text-3);text-align:center;font-size:13px">
      아직 노드가 없어요. 개념을 추가하고 <code>npm run build</code>를 실행하세요.</p>`;
    renderLegend();
    return;
  }

  const svg = d3.select(container).append('svg').attr('viewBox', [0,0,width,height]);
  const g = svg.append('g');

  const nodeIds = new Set(nodes.map(n => n.id));
  const links = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

  const sim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(70))
    .force('charge', d3.forceManyBody().strength(-180))
    .force('center', d3.forceCenter(width/2, height/2))
    .force('collide', d3.forceCollide(25));

  const link = g.append('g').selectAll('line').data(links).join('line').attr('class','g-link');

  const node = g.append('g').selectAll('g').data(nodes).join('g').attr('class','g-node')
    .call(d3.drag().on('start', ds).on('drag', dd).on('end', de));

  node.append('circle')
    .attr('r', d => d.type === 'post' ? 8 : 6)
    .attr('fill', d => {
      const item = allItems().find(i => i.id === d.id);
      return item ? domainColor(item) : '#78716c';
    })
    .attr('stroke', '#fff')
    .attr('stroke-width', 1.5)
    .on('click', (e, d) => showDetail(d.id));

  node.append('text').attr('dx',11).attr('dy',4)
    .text(d => d.title.length > 20 ? d.title.slice(0,18) + '...' : d.title);

  sim.on('tick', () => {
    link.attr('x1',d=>d.source.x).attr('y1',d=>d.source.y)
        .attr('x2',d=>d.target.x).attr('y2',d=>d.target.y);
    node.attr('transform', d => `translate(${d.x},${d.y})`);
  });

  function ds(e){if(!e.active)sim.alphaTarget(.3).restart();e.subject.fx=e.subject.x;e.subject.fy=e.subject.y}
  function dd(e){e.subject.fx=e.x;e.subject.fy=e.y}
  function de(e){if(!e.active)sim.alphaTarget(0);e.subject.fx=null;e.subject.fy=null}

  svg.call(d3.zoom().scaleExtent([.3,5]).on('zoom', e => g.attr('transform',e.transform)));

  renderLegend();
}

function renderLegend() {
  const el = document.getElementById('graph-legend');
  el.innerHTML = Object.entries(DOMAINS).map(([,d]) =>
    `<span class="legend-item"><span class="legend-dot" style="background:${d.color}"></span>${d.label}</span>`
  ).join('');
}

/* ---------- SURPRISE ---------- */
function surprise() {
  const items = allItems();
  if (!items.length) return;
  const pick = items[Math.floor(Math.random() * items.length)];
  showDetail(pick.id);
}

/* ---------- HELPERS ---------- */
function allItems() {
  return [...data.concepts, ...data.questions, ...data.posts, ...data.drafts];
}

function cardHTML(item) {
  const color = domainColor(item);
  return `<div class="card" onclick="showDetail('${item.id}')">
    <button class="card-edit" onclick="event.stopPropagation();toggleVditor('${item.id}')" title="수정">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
    </button>
    <div class="card-domain" style="background:${color}"></div>
    <div class="card-body">
      <h3>${item.title}</h3>
      <p class="excerpt">${item.excerpt || ''}</p>
      <div class="card-tags">
        ${(item.tags||[]).slice(0,3).map(t => `<span class="tag">${t}</span>`).join('')}
      </div>
    </div>
  </div>`;
}

function journalItemHTML(post) {
  return `<div class="journal-item" onclick="showDetail('${post.id}')">
    <span class="journal-date">${post.date||''}</span>
    <span class="journal-title">${post.title}</span>
    <span class="journal-tags">${(post.tags||[]).slice(0,2).map(t=>`<span class="tag">${t}</span>`).join('')}</span>
    <button class="j-edit" onclick="event.stopPropagation();toggleVditor('${post.id}')" title="수정">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
    </button>
  </div>`;
}

function setDomainAndGo(domain) {
  activeDomain = domain;
  document.querySelectorAll('.domain-pill').forEach(p =>
    p.classList.toggle('active', p.dataset.domain === domain));
  switchView('library');
}

// Expose to onclick handlers
window.showDetail = showDetail;
window.setDomainAndGo = setDomainAndGo;

/* ---------- LEFT SIDEBAR ---------- */
function setupSidebar() {
  const toggle = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('left-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');

  toggle.addEventListener('click', () => toggleSidebar());
  backdrop.addEventListener('click', () => toggleSidebar(false));

  const searchInput = document.getElementById('sb-search-input');
  searchInput.addEventListener('input', () => renderSidebar(searchInput.value));
}

function toggleSidebar(force) {
  const sidebar = document.getElementById('left-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const isOpen = !sidebar.classList.contains('sidebar-closed');
  const shouldOpen = force !== undefined ? force : !isOpen;

  sidebar.classList.toggle('sidebar-closed', !shouldOpen);
  document.body.classList.toggle('sb-open', shouldOpen);

  // Show backdrop only on narrow screens
  if (window.innerWidth <= 640) {
    backdrop.classList.toggle('hidden', !shouldOpen);
  } else {
    backdrop.classList.add('hidden');
  }
}

function renderSidebar(query) {
  const q = (query || '').toLowerCase();
  const conceptsEl = document.getElementById('sb-concepts');
  const postsEl = document.getElementById('sb-posts');

  // Concepts + questions
  let concepts = [...data.concepts, ...data.questions];
  if (activeDomain !== 'all') concepts = concepts.filter(i => guessDomain(i) === activeDomain);
  if (q) concepts = concepts.filter(i =>
    i.title.toLowerCase().includes(q) ||
    (i.tags || []).some(t => t.toLowerCase().includes(q))
  );
  concepts.sort((a, b) => (b.date || b.created || '').localeCompare(a.date || a.created || ''));

  conceptsEl.innerHTML = concepts.length
    ? concepts.map(i => sidebarItemHTML(i)).join('')
    : `<div class="sb-empty">${q ? '결과 없음' : '아직 없어요'}</div>`;

  // Posts
  let posts = [...data.posts, ...data.drafts];
  if (activeDomain !== 'all') posts = posts.filter(i => guessDomain(i) === activeDomain);
  if (q) posts = posts.filter(i =>
    i.title.toLowerCase().includes(q) ||
    (i.tags || []).some(t => t.toLowerCase().includes(q))
  );
  posts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  postsEl.innerHTML = posts.length
    ? posts.map(i => sidebarItemHTML(i, true)).join('')
    : `<div class="sb-empty">${q ? '결과 없음' : '아직 없어요'}</div>`;
}

function sidebarItemHTML(item, showDate) {
  const color = domainColor(item);
  const date = showDate && item.date ? `<span class="sb-date">${item.date.slice(5)}</span>` : '';
  return `<button class="sb-item" data-id="${item.id}" onclick="showDetail('${item.id}')">
    <span class="sb-dot" style="background:${color}"></span>
    <span style="flex:1;overflow:hidden;text-overflow:ellipsis">${item.title}</span>
    ${date}
    <span class="sb-edit" onclick="event.stopPropagation();toggleVditor('${item.id}')" title="수정">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
    </span>
  </button>`;
}

/* ---------- VDITOR INLINE EDITOR ---------- */
var vditorInstance = null;
var editingId = null;
var saveTimer = null;
var currentDetailId = null;

function setupVditor() {
  document.getElementById('fab-create').addEventListener('click', createNewConcept);
}

async function toggleVditor(id) {
  const targetId = id || currentDetailId;
  if (!targetId && !id) return;

  // If already editing this id, close editor
  if (vditorInstance && editingId === targetId) {
    await destroyVditor();
    return;
  }
  // If editing something else, close first
  if (vditorInstance) await destroyVditor();

  // Navigate to detail if not already there
  if (currentView !== 'detail' || currentDetailId !== targetId) {
    showDetail(targetId);
    await new Promise(r => setTimeout(r, 100));
  }

  await initVditor(targetId);
}

async function initVditor(id) {
  clearHighlights();
  document.body.classList.add('editing-mode');
  syncMemoPanel();
  editingId = id;
  let rawText = '';
  if (id) {
    try {
      const res = await fetch(`/api/raw?id=${encodeURIComponent(id)}`);
      const d = await res.json();
      rawText = d.raw || '';
    } catch { rawText = ''; }
  }

  const detail = document.getElementById('detail-content');
  detail.innerHTML = '<div id="vditor-editor"></div>';
  detail.classList.add('editing');
  document.getElementById('detail-related').innerHTML = '';

  vditorInstance = new Vditor('vditor-editor', {
    mode: 'ir', theme: 'classic',
    height: 'auto',
    minHeight: 400,
    placeholder: '내용을 입력하세요...',
    toolbar: ['headings','bold','italic','strike','link','|','list','ordered-list','check','|','code','inline-code','table','line','|','undo','redo'],
    input() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveVditor(), 2000);
    },
    after() {
      if (vditorInstance && rawText) vditorInstance.setValue(rawText);
      if (vditorInstance) vditorInstance.focus();
    },
  });
}

async function destroyVditor(renderDetail = true) {
  if (saveTimer) { clearTimeout(saveTimer); await saveVditor(); }
  if (vditorInstance) { vditorInstance.destroy(); vditorInstance = null; }
  const detail = document.getElementById('detail-content');
  detail.classList.remove('editing');
  document.body.classList.remove('editing-mode');
  syncMemoPanel();
  if (renderDetail && editingId) { showDetail(editingId); }
  editingId = null;
}

async function saveVditor() {
  if (!vditorInstance) return;
  const raw = vditorInstance.getValue();
  if (!raw || !raw.trim()) return;

  // Detect type from item or default
  const item = editingId ? allItems().find(i => i.id === editingId) : null;
  const type = item ? (item.type === 'post' ? 'post' : item.type === 'question' ? 'question' : 'concept') : 'concept';

  try {
    const res = await fetch('/api/save-raw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editingId || undefined, type, raw }),
    });
    const result = await res.json();
    if (result.ok) {
      if (!editingId) editingId = result.id;
      toast('저장됨');
      await reloadData();
    } else { toast('저장 실패'); }
  } catch { toast('서버 연결 실패'); }
}

function createNewConcept() {
  clearHighlights();
  document.body.classList.add('editing-mode');
  syncMemoPanel();
  const domain = activeDomain !== 'all' ? activeDomain : 'other';
  const today = new Date().toISOString().slice(0,10);
  editingId = null;
  currentDetailId = null;
  switchView('detail');

  const detail = document.getElementById('detail-content');
  detail.innerHTML = '<div id="vditor-editor"></div>';
  detail.classList.add('editing');
  document.getElementById('detail-related').innerHTML = '';

  const template = `---\nid: \ntitle: \ntags: [${domain}]\ndomain: ${domain}\ncreated: ${today}\n---\n\n`;

  vditorInstance = new Vditor('vditor-editor', {
    mode: 'ir', theme: 'classic',
    height: 'auto',
    minHeight: 400,
    placeholder: '새 개념을 작성하세요...',
    toolbar: ['headings','bold','italic','strike','link','|','list','ordered-list','check','|','code','inline-code','table','line','|','undo','redo'],
    input() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveVditor(), 2000);
    },
    after() {
      if (vditorInstance) vditorInstance.setValue(template);
      if (vditorInstance) vditorInstance.focus();
    },
  });
}

async function deleteEntry(id, type) {
  if (!confirm('정말 삭제할까요?')) return;
  try {
    await fetch(`/api/delete?type=${type || 'concept'}&id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    toast('삭제 완료');
    await reloadData();
    switchView(previousView || 'home');
  } catch { toast('삭제 실패'); }
}

async function reloadData() {
  const [idx, gr, ct] = await Promise.all([
    fetch('data/index.json').then(r => r.json()),
    fetch('data/graph.json').then(r => r.json()),
    fetch('data/all-content.json').then(r => r.json()),
  ]);
  data = idx; graph = gr; content = ct;
  // Re-render current view
  if (currentView === 'home') renderHome();
  if (currentView === 'library') renderLibrary();
  if (currentView === 'graph') renderGraph();
  if (currentView === 'journal') renderJournal();
  renderSidebar();
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}

/* ---------- DEPLOY (mirror prepare) ---------- */
function setupDeploy() {
  const btn = document.getElementById('deploy-btn');
  if (!btn || window.KB_READONLY) { if (btn) btn.style.display = 'none'; return; }

  let pollTimer = null;
  const poll = async () => {
    try {
      const s = await fetch('/api/deploy').then(r => r.json());
      if (s.status === 'building' || s.status === 'deploying') {
        btn.classList.add('deploying');
        return;
      }
      clearInterval(pollTimer); pollTimer = null;
      btn.classList.remove('deploying');
      if (s.status === 'deployed') toast('배포 완료 ✓ 미러가 갱신됐어요');
      else if (s.status === 'error') toast('배포 준비 실패: ' + (s.error || '').slice(0, 60));
    } catch { clearInterval(pollTimer); pollTimer = null; btn.classList.remove('deploying'); }
  };

  btn.addEventListener('click', async () => {
    if (btn.classList.contains('deploying')) return;
    try {
      const r = await fetch('/api/deploy', { method: 'POST' });
      if (r.status === 409) { toast('이미 준비 중이에요'); return; }
      btn.classList.add('deploying');
      toast('배포 시작... (1-2분 걸려요)');
      pollTimer = setInterval(poll, 2000);
    } catch { toast('서버 연결 실패'); }
  });
}

// Expose
window.toggleVditor = toggleVditor;
window.deleteEntry = deleteEntry;
window.toggleMemoPanel = toggleMemoPanel;
window.deleteMemo = deleteMemo;

/* ---------- MATH-SAFE MARKDOWN ---------- */
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

function renderLiteralWikilink(raw) {
  const inner = raw.slice(2, -2);
  const mathPlaceholder = /<span data-mathph="\d+"><\/span>/g;
  let rendered = '[[';
  let offset = 0;

  for (const match of inner.matchAll(mathPlaceholder)) {
    rendered += escapeHtml(inner.slice(offset, match.index));
    rendered += match[0];
    offset = match.index + match[0].length;
  }
  return rendered + escapeHtml(inner.slice(offset)) + ']]';
}

function renderMarkdownWithMath(src) {
  const placeholders = [];
  let i = 0;

  // Protect block math $$...$$
  let safe = src.replace(/\$\$([\s\S]*?)\$\$/g, (_, tex) => {
    const idx = i++;
    placeholders.push({ idx, tex: tex.trim(), display: true });
    return `<span data-mathph="${idx}"></span>`;
  });

  // Protect inline math $...$  (not $$)
  safe = safe.replace(/(?<!\$)\$(?!\$)([^\n$]+?)\$(?!\$)/g, (_, tex) => {
    const idx = i++;
    placeholders.push({ idx, tex: tex.trim(), display: false });
    return `<span data-mathph="${idx}"></span>`;
  });

  // Marked 12 can leave strong delimiters literal when a link is followed by CJK text.
  safe = KBMarkdownRenderer.stabilizeCjkStrongBoundaries(safe);

  // Run marked on the safe text
  let html = marked.parse(safe);

  html = html.replaceAll(KBMarkdownRenderer.CJK_STRONG_BOUNDARY_MARKER, '');

  // Keep a plain-text fallback for malformed legacy content.
  html = html.replace(/\*\*([^*<]+(?:\*(?!\*)[^*<]*)*)\*\*/g, '<strong>$1</strong>');

  // Restore math with KaTeX rendering
  for (const p of placeholders) {
    try {
      const rendered = katex.renderToString(p.tex, {
        displayMode: p.display,
        throwOnError: false,
        trust: true,
      });
      html = html.replace(`<span data-mathph="${p.idx}"></span>`, rendered);
    } catch {
      const fallback = p.display
        ? `<div class="math-error"><code>${p.tex}</code></div>`
        : `<code>${p.tex}</code>`;
      html = html.replace(`<span data-mathph="${p.idx}"></span>`, fallback);
    }
  }

  return html;
}

/* ---------- RICH CONTENT ---------- */
function getCodeLanguage(block) {
  const languageClass = [...block.classList].find(name => name.startsWith('language-'));
  const rawId = languageClass ? languageClass.slice('language-'.length).toLowerCase() : '';
  const id = CODE_LANGUAGE_ALIASES[rawId] || rawId;
  if (languageClass && rawId !== id) block.classList.replace(languageClass, `language-${id}`);
  return { id, label: CODE_LANGUAGE_LABELS[id] || id };
}

function createCodeCopyButton(block, languageLabel) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'code-copy-btn';
  button.textContent = '복사';
  button.setAttribute('aria-label', `${languageLabel ? `${languageLabel} ` : ''}코드 복사`);
  button.setAttribute('aria-live', 'polite');
  button.addEventListener('click', async () => {
    if (button.classList.contains('copied')) return;
    try {
      await navigator.clipboard.writeText(block.textContent);
      button.textContent = '복사됨';
      button.classList.add('copied');
      setTimeout(() => {
        if (!button.isConnected) return;
        button.textContent = '복사';
        button.classList.remove('copied');
      }, 1500);
    } catch {
      toast('코드를 복사하지 못했어요');
    }
  });
  return button;
}

function enhanceCodeBlocks(container) {
  container.querySelectorAll('pre > code').forEach(block => {
    const pre = block.parentElement;
    const language = getCodeLanguage(block);

    if (window.Prism) Prism.highlightElement(block);

    const wrapper = document.createElement('div');
    wrapper.className = 'code-block';

    const toolbar = document.createElement('div');
    toolbar.className = 'code-toolbar';

    const label = document.createElement('span');
    label.className = 'code-language';
    label.textContent = language.label;

    const button = createCodeCopyButton(block, language.label);

    toolbar.append(label, button);
    pre.before(wrapper);
    wrapper.append(toolbar, pre);
  });
}

// Mermaid Modal Lightbox singleton
let mermaidModalInstance = null;

function ensureMermaidModal() {
  if (mermaidModalInstance) return mermaidModalInstance;

  const modal = document.createElement('div');
  modal.className = 'mermaid-modal';
  modal.id = 'mermaid-modal';
  modal.innerHTML = `
    <div class="mermaid-modal-header">
      <div class="mermaid-modal-title">다이어그램 크게 보기 (Mermaid Diagram)</div>
      <div class="mermaid-modal-controls">
        <button class="mermaid-modal-btn" id="mm-zoom-in" title="확대 (Zoom In)">확대 (+)</button>
        <button class="mermaid-modal-btn" id="mm-zoom-out" title="축소 (Zoom Out)">축소 (-)</button>
        <button class="mermaid-modal-btn" id="mm-zoom-reset" title="원래 크기 (100%)">100%</button>
        <button class="mermaid-modal-btn" id="mm-close" title="닫기 (Esc)">닫기 (✕)</button>
      </div>
    </div>
    <div class="mermaid-modal-body" id="mm-body">
      <div class="mermaid-modal-content" id="mm-content"></div>
    </div>
  `;
  document.body.appendChild(modal);

  let scale = 1.0;
  const content = modal.querySelector('#mm-content');
  const body = modal.querySelector('#mm-body');

  function updateTransform() {
    content.style.transform = `scale(${scale})`;
  }

  function open(svgElement) {
    content.innerHTML = '';
    const clone = svgElement.cloneNode(true);
    clone.style.maxWidth = 'none';
    clone.style.height = 'auto';
    content.appendChild(clone);
    scale = 1.0;
    updateTransform();
    modal.classList.add('active');
  }

  function close() {
    modal.classList.remove('active');
    setTimeout(() => { content.innerHTML = ''; }, 200);
  }

  modal.querySelector('#mm-zoom-in').addEventListener('click', (e) => {
    e.stopPropagation();
    scale = Math.min(3.5, scale + 0.25);
    updateTransform();
  });

  modal.querySelector('#mm-zoom-out').addEventListener('click', (e) => {
    e.stopPropagation();
    scale = Math.max(0.4, scale - 0.25);
    updateTransform();
  });

  modal.querySelector('#mm-zoom-reset').addEventListener('click', (e) => {
    e.stopPropagation();
    scale = 1.0;
    updateTransform();
  });

  modal.querySelector('#mm-close').addEventListener('click', (e) => {
    e.stopPropagation();
    close();
  });

  body.addEventListener('click', (e) => {
    if (e.target === body) close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      close();
    }
  });

  // Wheel zoom in modal
  body.addEventListener('wheel', (e) => {
    if (!modal.classList.contains('active')) return;
    e.preventDefault();
    if (e.deltaY < 0) {
      scale = Math.min(3.5, scale + 0.15);
    } else {
      scale = Math.max(0.4, scale - 0.15);
    }
    updateTransform();
  }, { passive: false });

  mermaidModalInstance = { open, close };
  return mermaidModalInstance;
}

// Inject directive to ensure generous wrappingWidth for flowcharts
function injectMermaidDirectives(code) {
  const trimmed = code.trim();
  if (trimmed.startsWith('flowchart') || trimmed.startsWith('graph')) {
    if (!trimmed.startsWith('%%{')) {
      return `%%{init: {'flowchart': {'htmlLabels': true, 'wrappingWidth': 520}}}%%\n${trimmed}`;
    }
  }
  return trimmed;
}

function renderRichContent(container) {
  // Mermaid: convert ```mermaid code blocks and wrap with scrollable toolbar container
  const mermaidBlocks = container.querySelectorAll('pre code.language-mermaid');
  const nodesToRender = [];
  const wrappers = [];

  mermaidBlocks.forEach((block) => {
    const pre = block.parentElement;
    const rawCode = injectMermaidDirectives(block.textContent);

    const wrapper = document.createElement('div');
    wrapper.className = 'mermaid-wrapper';

    const toolbar = document.createElement('div');
    toolbar.className = 'mermaid-toolbar';
    toolbar.innerHTML = `
      <div class="mermaid-toolbar-title">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
        <span>다이어그램 (Mermaid)</span>
        <span class="mermaid-scroll-hint">좌우 스크롤 가능 ↔</span>
      </div>
      <div class="mermaid-toolbar-actions">
        <button type="button" class="mermaid-btn btn-mm-expand" title="전체화면 크게 보기 (더블클릭 가능)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"></path><path d="M9 21H3v-6"></path><path d="M21 3l-7 7"></path><path d="M3 21l7-7"></path></svg>
          <span>크게 보기</span>
        </button>
      </div>
    `;

    const scrollPane = document.createElement('div');
    scrollPane.className = 'mermaid-scroll-pane';

    const div = document.createElement('div');
    div.className = 'mermaid';
    div.textContent = rawCode;

    scrollPane.appendChild(div);
    wrapper.appendChild(toolbar);
    wrapper.appendChild(scrollPane);
    pre.replaceWith(wrapper);

    nodesToRender.push(div);
    wrappers.push({ wrapper, scrollPane, div, toolbar });

    // Zoom modal trigger on expand button or double clicking diagram pane
    const triggerZoom = () => {
      const svg = div.querySelector('svg');
      if (svg) {
        const modal = ensureMermaidModal();
        modal.open(svg);
      }
    };

    toolbar.querySelector('.btn-mm-expand').addEventListener('click', triggerZoom);
    scrollPane.addEventListener('dblclick', triggerZoom);
  });

  if (window.mermaid && nodesToRender.length) {
    mermaid.run({ nodes: nodesToRender })
      .then(() => {
        // Fix intrinsic SVG width/height from viewBox to prevent compression/cutoff
        wrappers.forEach(({ wrapper, scrollPane, div, toolbar }) => {
          const svg = div.querySelector('svg');
          if (!svg) return;

          const vb = svg.viewBox?.baseVal;
          if (vb && vb.width > 0 && vb.height > 0) {
            svg.removeAttribute('width');
            svg.removeAttribute('height');
            svg.style.maxWidth = 'none';
            svg.style.width = vb.width + 'px';
            svg.style.height = vb.height + 'px';
            div.style.width = vb.width + 'px';
            div.style.display = 'block';

            // Show scroll hint if wider than container
            if (vb.width > scrollPane.clientWidth) {
              const hint = toolbar.querySelector('.mermaid-scroll-hint');
              if (hint) hint.classList.add('visible');
            }
          }
        });
      })
      .catch((err) => {
        console.warn('[Mermaid Render Error]', err);
      });
  }

  // Code blocks: language label, copy action, and Prism syntax highlighting
  enhanceCodeBlocks(container);

  // Images: ensure they load correctly from assets
  container.querySelectorAll('img').forEach(img => {
    if (img.src.startsWith('/') || img.src.startsWith('http')) return;
    // Relative path - prepend assets dir
    img.src = '/assets/' + img.getAttribute('src');
  });
}

// Boot
init();
setupVditor();
setupSidebar();
setupMemoPanel();
