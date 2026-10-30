#!/usr/bin/env node
/**
 * tools/sfx-fetch.mjs —— 从 SoundDino 拉音效（候选清单 + 下载 + 记录出处）。
 *
 *   node tools/sfx-fetch.mjs --list whoosh-transition        # 列出该分类的曲目
 *   node tools/sfx-fetch.mjs --get 73722,79283 --out tasks/x/audio/sfx
 *   node tools/sfx-fetch.mjs --pick 1,3 --category whoosh-transition --out …
 *
 * 站点事实（2026-10 实测）：
 *   · 分类页 https://sounddino.com/en/effects/<slug>/ 里每条曲目带
 *     data-id / data-duration / data-track="/mp3/xx/soundNN.mp3" —— 音频就是同域静态文件；
 *   · 首页 FAQ 写明：免费授权、可商用、**不需要署名**、可直接下 MP3；
 *   · 但页脚有匿名配额「Downloads left today Sounds 5/5 · Music 5/5」——
 *     所以我们默认 --max 5，宁可多跑几次，也不去顶站点限额；
 *   · 直链能下（实测 18 KB / 0.21s），但我们仍然限速 + 重试，不做并发轰炸。
 *
 * 下载后往 <out>/sfx.manifest.json 追加一条：id / title / group / duration / bytes / sha1 /
 * source（曲目页 URL）/ license（本站免费授权，商用可、无需署名 —— 以站点条款为准）。
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes('--' + n);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) anim-sfx/1.0';
const SITE = 'https://sounddino.com';
const MAX_PER_RUN = Number(opt('max', '5'));
const GAP_MS = Number(opt('gap', '800'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getText(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(url + ' → HTTP ' + res.status);
  return res.text();
}

/** 解析分类页：按出现顺序返回 { id, title, group, durationSec, track } */
export function parseCategory(html) {
  const out = [];
  const re = /<li class="playtrack[^"]*"([^>]*)>([\s\S]*?)(?=<li class="playtrack|<\/ul>)/g;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    const body = m[2];
    const id = (attrs.match(/data-id="(\d+)"/) || [])[1];
    const track = (attrs.match(/data-track="([^"]+)"/) || [])[1];
    const dur = Number((attrs.match(/data-duration="([\d.]+)"/) || [])[1] || 0);
    const title = (body.match(/<div class="name">([^<]*)</) || [])[1] || '';
    if (!id || !track) continue;
    out.push({ id, title: title.trim(), durationSec: dur, track });
  }
  // 分组标题：在 id 出现之前最近的 <h2>
  const heads = [...html.matchAll(/<h2>([^<]+)<\/h2>/g)].map((x) => ({ at: x.index, name: x[1].trim() }));
  for (const it of out) {
    const at = html.indexOf('data-id="' + it.id + '"');
    let g = '';
    for (const h of heads) if (h.at < at) g = h.name;
    it.group = g;
  }
  return out;
}

async function listCategory(slug) {
  const url = SITE + '/en/effects/' + slug + '/';
  const html = await getText(url);
  const items = parseCategory(html);
  return { url, items };
}

function sha1(buf) { return createHash('sha1').update(buf).digest('hex').slice(0, 12); }

/**
 * 纯 JS 数 mp3 帧算时长 —— 沙箱里 node 不能 spawn ffprobe，而页面上的 data-duration 只是取整。
 * 只处理 MPEG-1/2 Layer III（SFX 素材绝大多数是它）；解析失败就退回页面的近似值。
 */
export function mp3Duration(buf) {
  const BR = {
    // [版本][层] → kbps 表（版本：1=MPEG1, 2=MPEG2, 2.5=MPEG2.5）
    1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
    2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  };
  const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
  let i = 0;
  // 跳过 ID3v2
  if (buf.length > 10 && buf.toString('latin1', 0, 3) === 'ID3') {
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    i = 10 + size;
  }
  let frames = 0, samples = 0;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) { i++; continue; }
    const verBits = (buf[i + 1] >> 3) & 0x03;   // 3=MPEG1, 2=MPEG2, 0=MPEG2.5
    const layer = (buf[i + 1] >> 1) & 0x03;     // 1 = Layer III
    const brIdx = (buf[i + 2] >> 4) & 0x0f;
    const srIdx = (buf[i + 2] >> 2) & 0x03;
    const pad = (buf[i + 2] >> 1) & 0x01;
    if (layer !== 1 || brIdx === 0 || brIdx === 15 || srIdx === 3) { i++; continue; }
    const table = verBits === 3 ? BR[1] : BR[2];
    const bitrate = table[brIdx] * 1000;
    const sr = SR[verBits] ? SR[verBits][srIdx] : 44100;
    const spf = verBits === 3 ? 1152 : 576;
    const len = Math.floor(((spf / 8) * bitrate) / sr) + pad;
    if (!Number.isFinite(len) || len <= 0) { i++; continue; }
    frames++;
    samples += spf;
    i += len;
  }
  if (!frames) return 0;
  const sr = (() => {
    // 用最后一帧的采样率近似（CBR 素材足够准）
    for (let k = buf.length - 4; k > 0; k--) {
      if (buf[k] === 0xff && (buf[k + 1] & 0xe0) === 0xe0) {
        const v = (buf[k + 1] >> 3) & 0x03, s = (buf[k + 2] >> 2) & 0x03;
        if (SR[v] && s !== 3) return SR[v][s];
      }
    }
    return 44100;
  })();
  return samples / sr;
}

async function download(items, outDir, category) {
  mkdirSync(outDir, { recursive: true });
  const manPath = path.join(outDir, 'sfx.manifest.json');
  const man = existsSync(manPath) ? JSON.parse(readFileSync(manPath, 'utf8')) : { sounds: [] };
  let n = 0;
  for (const it of items) {
    if (n >= MAX_PER_RUN) { console.log('· 到本次上限 --max ' + MAX_PER_RUN + '，剩下的下次再拉'); break; }
    if (man.sounds.some((s) => s.id === it.id)) { console.log('· 已有 ' + it.id + '，跳过'); continue; }
    const url = SITE + it.track;
    const res = await fetch(url, { headers: { 'user-agent': UA } });
    if (!res.ok) { console.log('✗ ' + it.id + ' → HTTP ' + res.status); continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    const safe = (it.title || 'sound').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 40) || 'sound';
    const file = (category ? category + '__' : '') + it.id + '__' + safe + '.mp3';
    writeFileSync(path.join(outDir, file), buf);
    man.sounds.push({
      id: it.id, title: it.title, group: it.group || '',
      file, bytes: buf.length, sha1: sha1(buf),
      durationSec: Number((mp3Duration(buf) || it.durationSec).toFixed(2)),
      source: SITE + '/en/effects/' + category + '/',
      license: 'SoundDino 免费授权（可商用 / 无需署名；以站点条款为准）',
      fetchedAt: new Date().toISOString().slice(0, 10),
    });
    console.log('✓ ' + it.id + ' ' + (it.title || '') + ' → ' + file + ' (' + (buf.length / 1024).toFixed(0) + ' KB)');
    n++;
    await sleep(GAP_MS);
  }
  writeFileSync(manPath, JSON.stringify(man, null, 2) + '\n');
  console.log('· manifest: ' + manPath + '（共 ' + man.sounds.length + ' 条）');
}

const category = opt('category', 'whoosh-transition');
const outArg = opt('out', '');
const listOnly = flag('list');
const pick = opt('pick', '');
const ids = opt('get', '');

try {
  const { url, items } = await listCategory(category);
  console.log('分类页 ' + url + ' · ' + items.length + ' 条');
  let chosen = [];
  if (ids) {
    const want = ids.split(',').map((s) => s.trim());
    chosen = items.filter((it) => want.includes(it.id));
    const miss = want.filter((w) => !items.some((it) => it.id === w));
    if (miss.length) console.log('· 本页没有这些 id：' + miss.join(','));
  } else if (pick) {
    const idxs = pick.split(',').map((s) => Number(s.trim()) - 1);
    chosen = idxs.map((i) => items[i]).filter(Boolean);
  }
  if (listOnly || (!chosen.length && !outArg)) {
    items.forEach((it, i) => console.log('  ' + String(i + 1).padStart(3) + '  ' + it.id.padEnd(8) + it.durationSec + 's  ' + (it.group || '-').padEnd(22) + (it.title || '')));
    console.log('\n用法：--pick 1,3 --category ' + category + ' --out tasks/<任务>/audio/sfx');
  } else {
    if (!outArg) throw new Error('下载要 --out <目录>（通常 tasks/<任务>/audio/sfx）');
    await download(chosen, path.resolve(ROOT, outArg), category);
  }
} catch (e) {
  console.error('✗ ' + (e && e.message ? e.message : e));
  process.exitCode = 1;
}
