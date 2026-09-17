import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join, basename, extname } from 'path';

const ROOT = new URL('.', import.meta.url).pathname;
const KNOWLEDGE_DIR = join(ROOT, 'knowledge/concepts');
const QUESTIONS_DIR = join(ROOT, 'knowledge/questions');
const POSTS_DIR = join(ROOT, 'posts');
const SITE_DIR = join(ROOT, 'site');
const WIKILINK_ID_RE = /^[A-Za-z0-9._\-\uAC00-\uD7AF\u3040-\u30FF]+$/;

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };
  const meta = {};
  const lines = match[1].split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const idx = line.indexOf(':');
    if (idx === -1 || line.match(/^\s/)) { i++; continue; }
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();

    // Inline array: [item1, item2]
    if (val.startsWith('[') && val.endsWith(']')) {
      meta[key] = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
      i++; continue;
    }

    // Multi-line array
    if (val === '' || val === '[]') {
      const arr = [];
      i++;
      while (i < lines.length && lines[i].match(/^\s+-/)) {
        const item = lines[i].replace(/^\s+-\s*/, '').trim();
        if (item.startsWith('id:')) {
          const obj = { id: item.replace('id:', '').trim() };
          i++;
          while (i < lines.length && lines[i].match(/^\s+\w+:/) && !lines[i].match(/^\s+-/)) {
            const subIdx = lines[i].indexOf(':');
            obj[lines[i].slice(0, subIdx).trim()] = lines[i].slice(subIdx + 1).trim();
            i++;
          }
          arr.push(obj);
        } else {
          arr.push(item);
          i++;
        }
      }
      meta[key] = arr.length > 0 ? arr : [];
      continue;
    }

    meta[key] = val.replace(/^["']|["']$/g, '');
    i++;
  }
  return { meta, body: match[2] };
}

async function scanDir(dir, type) {
  const entries = [];
  try {
    const files = await readdir(dir);
    for (const file of files) {
      if (extname(file) !== '.md') continue;
      const content = await readFile(join(dir, file), 'utf-8');
      const { meta, body } = parseFrontmatter(content);
      entries.push({
        id: meta.id || basename(file, '.md'),
        type,
        title: meta.title || basename(file, '.md'),
        tags: Array.isArray(meta.tags) ? meta.tags : [],
        relates_to: Array.isArray(meta.relates_to) ? meta.relates_to : [],
        references: Array.isArray(meta.references) ? meta.references : [],
        date: meta.date || meta.created || '',
        published: meta.published === 'true' || meta.published === true,
        file: file,
        excerpt: body.slice(0, 200).replace(/[#*\n]/g, ' ').trim()
      });
    }
  } catch (e) {
    // directory might not exist yet
  }
  return entries;
}

function stripInlineCode(line) {
  let output = '';
  let cursor = 0;

  while (cursor < line.length) {
    if (line[cursor] !== '`') {
      output += line[cursor++];
      continue;
    }

    const openingStart = cursor;
    while (line[cursor] === '`') cursor++;
    const delimiterLength = cursor - openingStart;
    let closingStart = cursor;
    let closingEnd = -1;

    while (closingStart < line.length) {
      if (line[closingStart] !== '`') {
        closingStart++;
        continue;
      }
      let runEnd = closingStart;
      while (line[runEnd] === '`') runEnd++;
      if (runEnd - closingStart === delimiterLength) {
        closingEnd = runEnd;
        break;
      }
      closingStart = runEnd;
    }

    if (closingEnd === -1) {
      output += line.slice(openingStart, cursor);
    } else {
      cursor = closingEnd;
    }
  }
  return output;
}

function extractWikilinks(body) {
  const targets = [];
  const matcher = /(?<!\[)\[\[([^\[\]|]+?)(?:\|([^\[\]]*?))?\]\](?!\])/g;
  let fence = null;
  let inIndentedCode = false;
  let previousBlank = true;

  for (const line of body.split('\n')) {
    if (fence) {
      const closingFence = new RegExp(`^ {0,3}${fence.char}{${fence.length},}[\\t ]*$`);
      if (closingFence.test(line)) fence = null;
      previousBlank = line.trim() === '';
      continue;
    }

    const openingFence = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (openingFence) {
      fence = { char: openingFence[1][0], length: openingFence[1].length };
      inIndentedCode = false;
      previousBlank = false;
      continue;
    }

    if (line.trim() === '') {
      previousBlank = true;
      continue;
    }

    const indented = /^(?: {4,}|\t)/.test(line);
    if (indented && (inIndentedCode || previousBlank)) {
      inIndentedCode = true;
      previousBlank = false;
      continue;
    }
    if (!indented) inIndentedCode = false;

    const searchable = stripInlineCode(line);
    for (const match of searchable.matchAll(matcher)) {
      const id = match[1].trim();
      const label = match[2];
      if (!WIKILINK_ID_RE.test(id) || (label !== undefined && /[$<]/.test(label))) continue;
      targets.push(id);
    }
    previousBlank = false;
  }

  return targets;
}

async function buildGraph(concepts, questions, posts, fullContent) {
  const nodes = [];
  const edges = [];
  const allItems = [...concepts, ...questions, ...posts];
  const knownIds = new Set(allItems.map(item => item.id));
  const seenWikilinks = new Set();

  for (const item of allItems) {
    nodes.push({ id: item.id, title: item.title, type: item.type, tags: item.tags });
    if (item.relates_to) {
      for (const rel of item.relates_to) {
        if (typeof rel === 'string') {
          edges.push({ source: item.id, target: rel, relation: 'relates_to' });
        } else if (rel.id) {
          edges.push({ source: item.id, target: rel.id, relation: rel.relation || 'relates_to' });
        }
      }
    }
    if (item.references) {
      for (const ref of item.references) {
        edges.push({ source: item.id, target: ref, relation: 'references' });
      }
    }
    const raw = fullContent[item.id];
    if (!raw) continue;
    const { body } = parseFrontmatter(raw);
    for (const target of extractWikilinks(body)) {
      if (target === item.id || !knownIds.has(target)) continue;
      const edgeKey = `${item.id}\0${target}`;
      if (seenWikilinks.has(edgeKey)) continue;
      seenWikilinks.add(edgeKey);
      edges.push({ source: item.id, target, relation: 'links_to' });
    }
  }
  return { nodes, edges };
}

async function main() {
  console.log('Building knowledge base...');
  
  const concepts = await scanDir(KNOWLEDGE_DIR, 'concept');
  const questions = await scanDir(QUESTIONS_DIR, 'question');
  const posts = await scanDir(POSTS_DIR, 'post');
  // Also scan draft posts
  const draftsDir = join(POSTS_DIR, 'draft');
  const drafts = await scanDir(draftsDir, 'draft');

  const fullContent = await buildFullContent(KNOWLEDGE_DIR, QUESTIONS_DIR, POSTS_DIR, draftsDir);
  const graph = await buildGraph(concepts, questions, [...posts, ...drafts], fullContent);

  await mkdir(join(SITE_DIR, 'data'), { recursive: true });

  await writeFile(
    join(SITE_DIR, 'data/index.json'),
    JSON.stringify({ concepts, questions, posts, drafts }, null, 2)
  );

  await writeFile(
    join(SITE_DIR, 'data/graph.json'),
    JSON.stringify(graph, null, 2)
  );

  // Copy markdown files for runtime rendering
  await writeFile(
    join(SITE_DIR, 'data/all-content.json'),
    JSON.stringify(fullContent, null, 2)
  );

  console.log(`Built: ${concepts.length} concepts, ${questions.length} questions, ${posts.length} posts, ${drafts.length} drafts`);
  console.log(`Graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges`);
}

async function buildFullContent(...dirs) {
  const content = {};
  for (const dir of dirs) {
    try {
      const files = await readdir(dir);
      for (const file of files) {
        if (extname(file) !== '.md') continue;
        const raw = await readFile(join(dir, file), 'utf-8');
        // Use frontmatter id if available, else filename
        const idMatch = raw.match(/^---\n[\s\S]*?^id:\s*(.+)$/m);
        const key = idMatch ? idMatch[1].trim() : basename(file, '.md');
        content[key] = raw;
      }
    } catch (e) {}
  }
  return content;
}

main().catch(console.error);
