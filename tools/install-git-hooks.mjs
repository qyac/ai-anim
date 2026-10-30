#!/usr/bin/env node
/**
 * 装 git 钩子：把 `core.hooksPath` 指到仓库里的 `.githooks/`。
 *
 *   node tools/install-git-hooks.mjs          # 安装
 *   node tools/install-git-hooks.mjs --off    # 卸载（回到 .git/hooks）
 *
 * 为什么不用 .git/hooks 直接放文件：那个目录**不进版本库** —— 换台机器就没了，
 * 新人不知道有钩子、也看不到它做了什么。放 .githooks/ 里，钩子本身是受评审的代码。
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const off = process.argv.includes('--off');
const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

if (off) {
  git(['config', '--unset', 'core.hooksPath']);
  console.log('✓ 已卸载（回到 .git/hooks）');
} else {
  git(['config', 'core.hooksPath', '.githooks']);
  console.log('✓ 钩子已启用：core.hooksPath = .githooks');
  console.log('  提交时会跑 tools/precommit-report.mjs（只读已有 mp4，不渲染）');
  console.log('  临时绕过：git commit --no-verify');
}
