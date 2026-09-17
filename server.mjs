import { createServer } from 'http';
import { readFile, writeFile, unlink, mkdir } from 'fs/promises';
import { join, extname, basename } from 'path';
import { execSync, spawn } from 'child_process';

const BASE = new URL('.', import.meta.url).pathname;
const ROOT = join(BASE, 'site');
const PORT = 3456;

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.md':   'text/markdown',
};

const DIRS = {
  concept:  join(BASE, 'knowledge/concepts'),
  question: join(BASE, 'knowledge/questions'),
  post:     join(BASE, 'posts'),
  draft:    join(BASE, 'posts/draft'),
};
const ANNOT_DIR = join(BASE, 'knowledge/annotations');

// Bumped on every content change so the frontend can live-reload
let contentVersion = Date.now();
let lastRebuildError = null;
// Last page the user opened in the browser (reported by the frontend)
let currentPage = { view: 'home', id: null, title: null, at: null };

function rebuild() {
  try {
    execSync('node build.js', { cwd: BASE, timeout: 10000 });
    contentVersion = Date.now();
    lastRebuildError = null;
    return true;
  } catch (e) {
    lastRebuildError = e.message;
    console.error('Build failed:', e.message);
    return false;
  }
}

function gitCommit(title) {
  try {
    execSync('git add -A', { cwd: BASE, timeout: 5000 });
    const safe = (title || 'update').replace(/[^\w\s\uAC00-\uD7AF\u3040-\u30FF.-]/g, '').slice(0, 80);
    execSync(`git commit -m "auto: ${safe}" --allow-empty`, { cwd: BASE, timeout: 5000 });
  } catch (e) { /* ignore git errors */ }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function jsonRes(res, code, data) {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

function slugify(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9\uAC00-\uD7AF\u3040-\u30FF]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'untitled';
}

function sanitizeId(id) {
  if (!id) return null;
  // Strip path traversal and non-safe chars
  return id.replace(/\.\./g, '').replace(/[\/\\]/g, '').replace(/[^a-zA-Z0-9\uAC00-\uD7AF\u3040-\u30FF._-]/g, '').slice(0, 80) || null;
}

const server = createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    jsonRes(res, 204, null);
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  // ---- API ----

  // POST /api/save  { type, id?, title, domain, tags[], body, published? }
  if (path === '/api/save' && req.method === 'POST') {
    try {
      const d = await readBody(req);
      const type = d.type || 'concept';
      const dir = DIRS[type] || DIRS.concept;
      await mkdir(dir, { recursive: true });

      const id = sanitizeId(d.id) || slugify(d.title || 'untitled');
      const filename = `${id}.md`;
      const tags = (d.tags || []).join(', ');
      const relates = (d.relates_to || [])
        .map(r => `  - id: ${r.id}\n    relation: ${r.relation || 'relates_to'}`)
        .join('\n');

      let frontmatter = `---\nid: ${id}\ntitle: "${(d.title||'').replace(/"/g,'\\"')}"\ntags: [${tags}]`;
      if (d.domain) frontmatter += `\ndomain: ${d.domain}`;
      if (relates) frontmatter += `\nrelates_to:\n${relates}`;
      if (type === 'post' || type === 'draft') {
        frontmatter += `\ndate: ${new Date().toISOString().slice(0,10)}`;
        frontmatter += `\npublished: ${d.published !== false}`;
        if (d.references?.length) frontmatter += `\nreferences: [${d.references.join(', ')}]`;
      }
      frontmatter += `\ncreated: ${d.created || new Date().toISOString().slice(0,10)}`;
      frontmatter += '\n---\n\n';

      const content = frontmatter + (d.body || '');
      await writeFile(join(dir, filename), content, 'utf-8');
      rebuild();
      gitCommit(d.title || 'save');
      jsonRes(res, 200, { ok: true, id, file: filename });
    } catch (e) {
      jsonRes(res, 400, { error: e.message });
    }
    return;
  }

  // DELETE /api/delete?type=concept&id=xxx
  if (path === '/api/delete' && req.method === 'DELETE') {
    try {
      const type = url.searchParams.get('type') || 'concept';
      const id = sanitizeId(url.searchParams.get('id'));
      if (!id) throw new Error('id required');
      const dir = DIRS[type] || DIRS.concept;
      await unlink(join(dir, `${id}.md`));
      rebuild();
      gitCommit('delete ' + id);
      jsonRes(res, 200, { ok: true });
    } catch (e) {
      jsonRes(res, 400, { error: e.message });
    }
    return;
  }

  // GET /api/raw?id=xxx  — raw markdown for editing
  if (path === '/api/raw' && req.method === 'GET') {
    const id = sanitizeId(url.searchParams.get('id'));
    try {
      // search all dirs
      for (const dir of Object.values(DIRS)) {
        try {
          const raw = await readFile(join(dir, `${id}.md`), 'utf-8');
          jsonRes(res, 200, { id, raw });
          return;
        } catch {}
      }
      jsonRes(res, 404, { error: 'not found' });
    } catch (e) {
      jsonRes(res, 500, { error: e.message });
    }
    return;
  }

  // POST /api/rebuild
  if (path === '/api/rebuild' && req.method === 'POST') {
    if (!rebuild()) {
      jsonRes(res, 500, { ok: false, error: lastRebuildError || 'Build failed' });
      return;
    }
    jsonRes(res, 200, { ok: true });
    return;
  }


  // GET /api/search?q=<query>&depth=1&limit=20 — ontology-aware search
  if (path === '/api/search' && req.method === 'GET') {
    const q = (url.searchParams.get('q') || '').trim();
    const depthParam = Math.min(parseInt(url.searchParams.get('depth') || '1', 10), 3);
    const limitParam = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 50);

    if (!q || q.length < 1) {
      jsonRes(res, 400, { error: 'q parameter required (min 1 char)' });
      return;
    }

    try {
      const indexRaw = await readFile(join(ROOT, 'data/index.json'), 'utf-8');
      const contentRaw = await readFile(join(ROOT, 'data/all-content.json'), 'utf-8');

      const idx = JSON.parse(indexRaw);
      const allContent = JSON.parse(contentRaw);

      // Build adjacency map from relates_to in index
      const adjacency = {};
      const allItems = [...(idx.concepts||[]), ...(idx.questions||[]), ...(idx.posts||[]), ...(idx.drafts||[])];
      const itemMap = {};
      for (const item of allItems) {
        itemMap[item.id] = item;
        if (!adjacency[item.id]) adjacency[item.id] = [];
        for (const rel of (item.relates_to || [])) {
          const targetId = rel.id || rel;
          const relation = rel.relation || 'relates_to';
          adjacency[item.id].push({ id: targetId, relation, direction: 'outgoing' });
          if (!adjacency[targetId]) adjacency[targetId] = [];
          adjacency[targetId].push({ id: item.id, relation, direction: 'incoming' });
        }
      }

      const query = q.toLowerCase();
      const scored = new Map();

      // Phase 1: Direct text matching
      for (const item of allItems) {
        let score = 0;
        let matchField = '';
        if (item.title.toLowerCase().includes(query)) {
          score += item.title.toLowerCase() === query ? 100 : 80;
          matchField = 'title';
        }
        if (item.id.toLowerCase().includes(query)) {
          score += 60;
          if (!matchField) matchField = 'id';
        }
        if ((item.tags || []).some(t => t.toLowerCase().includes(query))) {
          score += 50;
          if (!matchField) matchField = 'tag';
        }
        const body = (allContent[item.id] || '').toLowerCase();
        if (body.includes(query)) {
          score += 30;
          if (!matchField) matchField = 'body';
        }
        if (score > 0) {
          scored.set(item.id, { score, matchType: 'direct', matchField });
        }
      }

      // Phase 2: Ontology graph traversal from direct matches
      // Also annotate direct-matched nodes with their relation context
      const relatedTo = new Map(); // id -> [{ via, viaTitle, relation, direction }]
      if (depthParam > 0) {
        const directMatches = [...scored.keys()];
        const visited = new Set(directMatches);
        let frontier = directMatches;
        for (let d = 1; d <= depthParam; d++) {
          const nextFrontier = [];
          for (const nodeId of frontier) {
            for (const edge of (adjacency[nodeId] || [])) {
              const relInfo = { via: nodeId, relation: edge.relation, direction: edge.direction, depth: d };
              if (visited.has(edge.id)) {
                // Node already scored (direct match) — annotate with relation context
                if (!relatedTo.has(edge.id)) relatedTo.set(edge.id, []);
                relatedTo.get(edge.id).push(relInfo);
                continue;
              }
              visited.add(edge.id);
              nextFrontier.push(edge.id);
              const baseScore = Math.round((scored.get(nodeId)?.score || 50) * (0.5 / d));
              if (!scored.has(edge.id) || scored.get(edge.id).score < baseScore) {
                scored.set(edge.id, {
                  score: baseScore,
                  matchType: 'ontology',
                  matchField: 'relation',
                  relation: edge.relation,
                  direction: edge.direction,
                  via: nodeId,
                  depth: d,
                });
              }
            }
          }
          frontier = nextFrontier;
        }
      }

      // Build results sorted by score
      const results = [...scored.entries()]
        .sort((a, b) => b[1].score - a[1].score)
        .slice(0, limitParam)
        .map(([id, info]) => {
          const item = itemMap[id];
          const rels = relatedTo.get(id);
          return {
            id,
            title: item?.title || id,
            type: item?.type || 'concept',
            tags: item?.tags || [],
            excerpt: item?.excerpt || '',
            score: info.score,
            matchType: info.matchType,
            matchField: info.matchField,
            ...(info.relation && { relation: info.relation }),
            ...(info.direction && { direction: info.direction }),
            ...(info.via && { via: info.via, viaTitle: itemMap[info.via]?.title || info.via }),
            ...(info.depth && { depth: info.depth }),
            ...(rels && { relatedTo: rels.map(r => ({ via: r.via, viaTitle: itemMap[r.via]?.title || r.via, relation: r.relation, direction: r.direction })) }),
          };
        });

      jsonRes(res, 200, { query: q, depth: depthParam, results });
    } catch (e) {
      jsonRes(res, 500, { error: e.message });
    }
    return;
  }

  // GET /api/annotations?id=<noteId> — memo layer for a note (empty shape when none)
  if (path === '/api/annotations' && req.method === 'GET') {
    const id = sanitizeId(url.searchParams.get('id'));
    if (!id) { jsonRes(res, 400, { error: 'id required' }); return; }
    try {
      const raw = await readFile(join(ANNOT_DIR, `${id}.json`), 'utf-8');
      jsonRes(res, 200, JSON.parse(raw));
    } catch (e) {
      // ENOENT only → empty shape; corrupted JSON / permission errors must NOT
      // masquerade as empty (a subsequent PUT would overwrite real data)
      if (e.code === 'ENOENT') jsonRes(res, 200, { noteId: id, updated: null, memos: [] });
      else jsonRes(res, 500, { error: e.message });
    }
    return;
  }

  // PUT /api/annotations  { noteId, memos[] } — whole-file replace + git commit
  if (path === '/api/annotations' && req.method === 'PUT') {
    try {
      const d = await readBody(req);
      const id = sanitizeId(d.noteId);
      if (!id) throw new Error('noteId required');
      if (!Array.isArray(d.memos)) throw new Error('memos must be an array');
      for (const m of d.memos) {
        if (typeof m.text !== 'string' || !m.id) throw new Error('memo needs id and text');
      }
      await mkdir(ANNOT_DIR, { recursive: true });
      const payload = { noteId: id, updated: new Date().toISOString(), memos: d.memos };
      await writeFile(join(ANNOT_DIR, `${id}.json`), JSON.stringify(payload, null, 2), 'utf-8');
      gitCommit('memo ' + id);
      jsonRes(res, 200, { ok: true, count: d.memos.length });
    } catch (e) { jsonRes(res, 400, { error: e.message }); }
    return;
  }

  // GET /api/version — frontend polls this to live-reload after external edits
  if (path === '/api/version' && req.method === 'GET') {
    jsonRes(res, 200, { version: contentVersion });
    return;
  }

  // GET/POST /api/current-page — which page is open in the browser right now
  if (path === '/api/current-page') {
    if (req.method === 'POST') {
      try {
        const d = await readBody(req);
        currentPage = {
          view: d.view || 'home',
          id: d.id || null,
          title: d.title || null,
          at: new Date().toISOString(),
        };
        jsonRes(res, 200, { ok: true });
      } catch (e) { jsonRes(res, 400, { error: e.message }); }
    } else {
      jsonRes(res, 200, currentPage);
    }
    return;
  }

  // POST /api/deploy — run deploy-mirror.js in the background
  // GET  /api/deploy — read .deploy-state.json
  if (path === '/api/deploy') {
    const stateFile = join(BASE, '.deploy-state.json');
    if (req.method === 'POST') {
      try {
        const cur = JSON.parse(await readFile(stateFile, 'utf-8').catch(() => '{}'));
        if (cur.status === 'building' || cur.status === 'deploying') { jsonRes(res, 409, { ok: false, error: 'already running' }); return; }
      } catch {}
      const child = spawn('node', ['deploy-mirror.js'], { cwd: BASE, detached: true, stdio: 'ignore' });
      child.unref();
      jsonRes(res, 202, { ok: true, status: 'building' });
      return;
    }
    try {
      jsonRes(res, 200, JSON.parse(await readFile(stateFile, 'utf-8')));
    } catch {
      jsonRes(res, 200, { status: 'idle' });
    }
    return;
  }

  // POST /api/save-raw  { id, type, raw }  — write raw markdown directly
  if (path === '/api/save-raw' && req.method === 'POST') {
    try {
      const d = await readBody(req);
      const type = d.type || 'concept';
      const dir = DIRS[type] || DIRS.concept;
      await mkdir(dir, { recursive: true });

      // Extract id from frontmatter or use provided id
      let id = sanitizeId(d.id);
      if (!id) {
        const idMatch = (d.raw || '').match(/^id:\s*(\S+)/m);
        const titleMatch = (d.raw || '').match(/^title:\s*["']?([^\n"']+?)["']?\s*$/m);
        id = sanitizeId(idMatch ? idMatch[1].trim() : null) || slugify(titleMatch ? titleMatch[1].trim() : 'untitled');
      }
      const filename = `${id}.md`;
      await writeFile(join(dir, filename), d.raw || '', 'utf-8');
      rebuild();
      gitCommit(id);
      jsonRes(res, 200, { ok: true, id, file: filename });
    } catch (e) {
      jsonRes(res, 400, { error: e.message });
    }
    return;
  }

  // ---- STATIC ----
  let filePath = join(ROOT, path === '/' ? '/index.html' : path);
  try {
    const data = await readFile(filePath);
    const ext = extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  } catch {
    try {
      const index = await readFile(join(ROOT, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(index);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  }
});

// site/data/ 는 gitignore 대상이라 새 체크아웃·다른 기기에는 없을 수 있다.
// 시작할 때 한 번 빌드해서 빈 화면이 뜨지 않게 한다.
rebuild();

server.listen(PORT, () => {
  console.log(`Knowledge Base running at http://localhost:${PORT}`);
});
