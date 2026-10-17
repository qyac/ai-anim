#!/usr/bin/env node
// 文档事实核对：代码里的清单 <-> 文档里的清单。
//
// 为什么存在（2026-10-17 实测）：TIMELINE_KEYS 已经从 12 个变成 13 个（新增 `focus`），
// 而 CONFIG-ONLY.md 还写着"只有这 12 个"、键表里也没有 focus；AGENTS.md §3.2 同理。
// 后果不是排版问题 —— `focus` 是**版面守门的主体声明**，配置档任务照文档办事就不会写它，
// 于是"一屏只让观众看一件事"这条检查对最常见的出片路径**永远 skipped**。而 skipped 不等于通过。
//
// 只查"时间线字段"这一项：它是 new Set([...]) 硬编码、最好解析，出错代价也最大。
// 后处理参数表 / 模板参数表**故意不查** —— 那两张表格式一改就假阳性，
// 一个动不动误报的守门，两周后就没人看了（这条同样是实测结论）。
//
// 判据：
//   A. 每个"声明点"必须覆盖全部 TIMELINE_KEYS —— 漏一个键就报
//   B. 文档里"只有这 N 个"的 N 必须等于 KEYS.length —— 数字对不上就报
//   C. 找不到声明点 = warn（**不** exit 1）—— 允许文档重构，但要在输出里看得见
//
//   node tools/lint-doc-facts.mjs            # 查
//   node tools/lint-doc-facts.mjs --selftest # 内置用例（判据自检）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** 从 src/timeline.js 取出时间线字段的真值（唯一事实源）。 */
export function readTimelineKeys(root = ROOT) {
  const src = fs.readFileSync(path.join(root, "src/timeline.js"), "utf8");
  const m = src.match(/TIMELINE_KEYS\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
  if (!m) throw new Error("src/timeline.js 里找不到 TIMELINE_KEYS = new Set([...])");
  // 只取被单引号包住的标识符；注释里的中文与反引号不参与
  return [...m[1].matchAll(/'([A-Za-z][\w]*)'/g)].map((x) => x[1]);
}

/** 收集一个"声明块"：从锚点行开始，连同紧随其后的表格。空行不打断，遇到非表格正文就停。 */
export function collectBlock(lines, anchorIdx) {
  const out = [];
  let started = false;
  for (let i = anchorIdx; i < lines.length; i++) {
    const l = lines[i];
    if (l.trimStart().startsWith("|")) { started = true; out.push(l); continue; }
    if (i === anchorIdx) { out.push(l); continue; }   // 锚点行本身（可能不在表格里）
    if (l.trim() === "") continue;                     // 锚点与表格之间的空行
    break;
  }
  return out.join("\n");
}

/** 文档里的"声明点"。锚点是**宽松**的：只要求那一行提到这件事，不要求固定句式。 */
export const SITES = [
  { file: "AGENTS.md", anchor: /\*\*时间线字段\*\*/, label: "AGENTS.md §3.2 的时间线字段" },
  { file: "docs/CONFIG-ONLY.md", anchor: /属于时间线的键|时间线的键只有/, label: "CONFIG-ONLY.md 的键表" },
];

/**
 * B：数字声明。**只认这一个语境** —— 泛化的「那 N 个」会误吃「那 3 个面」「11 个模板」
 * （第一版就是这么误报的；一个会误报的守门等于没有）。
 */
export const NUM_RES = [
  /属于时间线的键只有这\s*(\d+)\s*个/g,
  /那\s*(\d+)\s*个键/g,
];

export function check(root = ROOT) {
  const keys = readTimelineKeys(root);
  const out = [];
  const warns = [];
  let ok = true;

  for (const site of SITES) {
    const p = path.join(root, site.file);
    if (!fs.existsSync(p)) { warns.push("找不到 " + site.file); continue; }
    const lines = fs.readFileSync(p, "utf8").split("\n");
    const idx = lines.findIndex((l) => site.anchor.test(l));
    if (idx < 0) { warns.push(site.file + "：找不到声明锚点 —— 文档改过结构？这一项**没判**"); continue; }
    const block = collectBlock(lines, idx);
    const missing = keys.filter((k) => !block.includes("`" + k + "`"));
    if (missing.length) {
      ok = false;
      out.push("✗ " + site.label + "：漏了 " + missing.map((m) => "`" + m + "`").join(" / ") + "（代码有 " + keys.length + " 个）");
    } else {
      out.push("✓ " + site.label + "：" + keys.length + "/" + keys.length + " 个键都在");
    }
  }

  // B：数字声明
  for (const site of SITES) {
    const p = path.join(root, site.file);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, "utf8");
    for (const re of NUM_RES) for (const m of text.matchAll(re)) {
      const n = Number(m[1]);
      if (n !== keys.length) {
        ok = false;
        out.push("✗ " + site.file + "：写着「" + m[0] + "」，但代码里 TIMELINE_KEYS 是 " + keys.length + " 个");
      }
    }
  }

  out.unshift("TIMELINE_KEYS = " + keys.length + " 个：" + keys.join(" "));
  return { ok, lines: out, warns };
}

// ── 自测：验证判据本身（不依赖仓库当前状态）────────────────────────────
function selftest() {
  const cases = [];
  const push = (name, cond) => cases.push([name, !!cond]);

  push("collectBlock 会带上紧跟的表格", (() => {
    const b = collectBlock(["声明：", "", "| a |", "| b |", "", "正文"], 0);
    return b.includes("| a |") && b.includes("| b |") && !b.includes("正文");
  })());
  push("collectBlock 遇到非表格正文就停", !collectBlock(["声明", "正文第一行", "继续"], 0).includes("继续"));
  push("认出「属于时间线的键只有这 13 个」", [..."属于时间线的键只有这 13 个".matchAll(NUM_RES[0])].map((m) => m[1])[0] === "13");
  push("认出「那 13 个键」", [..."因为它不属于那 13 个键".matchAll(NUM_RES[1])].map((m) => m[1])[0] === "13");
  push("不误吃「11 个模板」", [..."11 个模板一览".matchAll(NUM_RES[0])].length === 0);
  push("不误吃「那 3 个面」", [..."盒子只画朝镜头那 3 个面的棱".matchAll(NUM_RES[1])].length === 0);
  push("能解析出 TIMELINE_KEYS 且含 focus", (() => { const k = readTimelineKeys(); return k.includes("focus") && k.length >= 13; })());

  let bad = 0;
  for (const [n, v] of cases) { console.log((v ? "PASS  " : "FAIL  ") + n); if (!v) bad++; }
  console.log(bad ? "\n" + bad + " 项失败" : "\n✓ 全部通过（" + cases.length + " 项）");
  process.exit(bad ? 1 : 0);
}

if (process.argv[1]?.endsWith("lint-doc-facts.mjs")) {
  if (process.argv.includes("--selftest")) selftest();
  const { ok, lines, warns } = check(ROOT);
  console.log(lines.join("\n"));
  for (const w of warns) console.log("⚠ " + w);
  if (!ok) {
    console.log("\n修法：把代码里新增/删掉的键同步到两处 —— AGENTS.md §3.2 的「时间线字段」格，和 docs/CONFIG-ONLY.md 的键表与那个数字。");
    process.exit(1);
  }
  if (warns.length) console.log("\n（有 ⚠ 项没判 —— 没跑不等于通过）");
}
