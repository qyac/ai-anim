// @ts-check
/**
 * 量具（`tools/probe-*.mjs`）的页面骨架：私有 Vite + 无头 Chrome + `__anim` 就绪等待。
 *
 * 为什么要有它：13 支 probe 里有 9 支**逐字抄了同一段启动代码**（只有端口号不同）。
 * 端口冲突、Chrome 参数、`waitForFunction` 的超时三件事各改各的，已经很难保持同步。
 * 现在只有这一份；端口由调用方给（两支探针同时跑时不会撞车）。
 *
 * 两种用法：
 *   · 单页量具：`const p = await openProbePage({ task, port }); … await p.close();`
 *   · 多页量具（要循环 scale）：`startVite()` + `launchBrowser()` + `gotoProbe()` 自己拼。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Chrome 的启动参数：ANGLE 默认后端 + 允许软件 GL（CI / 无独显时也能跑）。 */
export const CHROME_ARGS = [
  '--use-angle=default',
  '--enable-gpu-rasterization',
  '--ignore-gpu-blocklist',
  '--enable-unsafe-swiftshader',
  '--disable-background-timer-throttling',
];

/** 等私有 Vite 端口能连上（`vite` 进程已退出时也会超时返回 false）。 */
export async function portReady(url, timeoutMs = 40000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1200) });
      if (res.ok) return true;
    } catch { /* retry */ }
    await sleep(180);
  }
  return false;
}

/**
 * 起一个私有 Vite（`ANIM_NO_HMR=1`：量具不热更新）。
 * @param {number} port
 */
export async function startVite(port) {
  const viteEntry = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const proc = spawn(process.execPath, [viteEntry, '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'], env: { ...process.env, ANIM_NO_HMR: '1' },
  });
  const url = `http://127.0.0.1:${port}`;
  if (!(await portReady(url))) {
    proc.kill();
    throw new Error(`私有 Vite 起不来（端口 ${port}）`);
  }
  return { url, proc, stop: () => proc.kill() };
}

/**
 * 起无头 Chrome。
 * @param {string[]} [extraArgs] 追加在 `CHROME_ARGS` 之后
 */
export function launchBrowser(extraArgs = []) {
  return chromium.launch({
    channel: 'chrome', headless: true,
    args: [...CHROME_ARGS, ...extraArgs],
  });
}

/**
 * 打开一个探针页面并等 `__anim` 就绪。
 * @param {import('playwright-core').Page} page
 * @param {{ url: string, task?: string, scale?: number, query?: string,
 *           waitReady?: boolean, timeout?: number }} o
 */
export async function gotoProbe(page, o) {
  const { url, task = '_calib', scale, query = '', waitReady = true, timeout = 120000 } = o;
  const qs = new URLSearchParams({ task, offline: '1', hud: '0' });
  if (scale != null) qs.set('scale', String(scale));
  for (const [k, v] of new URLSearchParams(query)) if (!qs.has(k)) qs.set(k, v);
  await page.goto(`${url}/?${qs.toString()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (!waitReady) return null;
  const st = await page.waitForFunction(
    () => { const a = window.__anim; return a && a.status && a.status().state !== 'booting' ? a.status() : null; },
    null, { timeout },
  ).then((h) => h.jsonValue());
  if (st.state !== 'ready') throw new Error(`页面没就绪: ${JSON.stringify(st)}`);
  return st;
}

/**
 * 单页量具的一步到位版：起 Vite + Chrome、开页面、等就绪。
 * `close()` 只关自己起的东西（传进来的 `browser` / `url` 不关）。
 *
 * @param {{ task?: string, url?: string, port?: number, scale?: number, query?: string,
 *           viewport?: { width: number, height: number }, deviceScaleFactor?: number,
 *           browser?: any, extraArgs?: string[], onPageError?: (e: Error) => void,
 *           onPage?: (page: any) => void, waitReady?: boolean, timeout?: number }} [o]
 */
export async function openProbePage(o = {}) {
  const {
    task = '_calib', url = '', port, scale, query = '',
    viewport = { width: 1280, height: 720 }, deviceScaleFactor = 1,
    browser, extraArgs = [], onPageError, onPage, waitReady = true, timeout = 120000,
  } = o;
  const vite = url ? null : await startVite(port);
  const base = url || vite.url;
  const ownsBrowser = !browser;
  const b = browser ?? await launchBrowser(extraArgs);
  const page = await b.newPage({ viewport, deviceScaleFactor });
  page.on('pageerror', onPageError ?? ((e) => console.log('PAGEERROR', e.message)));
  onPage?.(page);                 // 需要在 goto 之前挂 console / request 监听的量具用这个钩子
  try {
    const status = await gotoProbe(page, { url: base, task, scale, query, waitReady, timeout });
    return {
      page, browser: b, vite, url: base, status,
      close: async () => { if (ownsBrowser) await b.close(); vite?.stop(); },
    };
  } catch (err) {
    if (ownsBrowser) await b.close();
    vite?.stop();
    throw err;
  }
}
