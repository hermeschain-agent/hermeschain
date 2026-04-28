#!/usr/bin/env node
/**
 * generate-rss — TASK-485
 *
 * Generates a /feed.xml RSS feed from CHANGELOG.md + docs/blog/*.md.
 * Run during build or via cron; writes to frontend/public/feed.xml.
 *
 *   node backend/scripts/generate-rss.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');
const OUT = path.join(REPO, 'frontend', 'public', 'feed.xml');
const SITE = process.env.HERMES_SITE_URL || 'https://hermeschain.io';

function escape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isoDate(d) {
  return new Date(d).toUTCString();
}

function readBlogPosts() {
  const dir = path.join(REPO, 'docs', 'blog');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      const content = fs.readFileSync(full, 'utf8');
      const titleMatch = content.match(/^#\s+(.+)/m);
      return {
        title: titleMatch ? titleMatch[1] : f.replace(/\.md$/, ''),
        link: `${SITE}/blog/${f.replace(/\.md$/, '')}`,
        pubDate: isoDate(stat.mtimeMs),
        description: content.slice(0, 500).replace(/^#.+/m, '').trim().slice(0, 280),
      };
    })
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
}

const items = readBlogPosts();
const itemsXml = items.map((item) => `
    <item>
      <title>${escape(item.title)}</title>
      <link>${escape(item.link)}</link>
      <pubDate>${item.pubDate}</pubDate>
      <description>${escape(item.description)}</description>
    </item>`).join('');

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Hermeschain</title>
    <link>${SITE}</link>
    <description>Updates from the autonomous AI blockchain</description>
    <language>en-us</language>
    <lastBuildDate>${isoDate(Date.now())}</lastBuildDate>${itemsXml}
  </channel>
</rss>`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, xml);
console.log(`[RSS] wrote ${items.length} item(s) → ${path.relative(REPO, OUT)}`);
