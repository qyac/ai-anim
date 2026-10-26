#!/usr/bin/env node
/**
 * **假 TTS 驱动**（只用于离线验收，不产出人声）。
 *
 * 协议与 `tools/tts-edge.py` 一致（`scripts/lib/say.mjs` 的 resolveTts 认的那条）：
 *
 *   <驱动> --voice V --rate R --text 文本 --write-media 输出.mp3 [--write-words 输出.words.json]
 *
 * 它按**文本长度**生成一段等长的静音 mp3（用 ffmpeg 的 anullsrc），于是
 * 「改一句词 ⇒ 时长变了」这件事在离线可复现 —— 这正是 BACKLOG 1-23 `--pin-timing`
 * 要挡的场景：验证「钉住之后时间线不动」。
 *
 * 时长公式：0.55s + 每字 0.16s（中文按字、拉丁按 3 字符折算），夹在 0.6–8s。
 * 词级时间戳：按字等分，写进 `.words.json`（同样的口径，够 say 的 words 路径跑通）。
 *
 * 用法：node scripts/anim.mjs say <任务> --tts "node tools/fake-tts.mjs"
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
};
const text = arg('text') ?? '';
const media = arg('write-media');
const wordsOut = arg('write-words');
if (!media) { console.error('fake-tts: 缺 --write-media'); process.exit(2); }

const cjk = [...text].filter((c) => /[\u3000-\u9fff\uff00-\uffef]/.test(c)).length;
const latin = [...text].filter((c) => !/[\u3000-\u9fff\uff00-\uffef\s]/.test(c)).length;
const dur = Math.min(8, Math.max(0.6, 0.55 + cjk * 0.16 + (latin / 3) * 0.16));

const r = spawnSync(process.env.ANIM_FFMPEG || 'ffmpeg', [
  '-v', 'error', '-y',
  // ⚠ 不能用纯静音：say 会按"说到哪算到哪"剔掉尾部静音，全静音会被量成下限 0.12s，
  //    于是「文本变长 ⇒ 时长变长」这条前提就不成立了（第一版就是这么栽的）。
  '-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=24000:duration=${dur.toFixed(3)}`,
  '-af', 'volume=0.06',
  '-t', dur.toFixed(3), '-c:a', 'libmp3lame', '-b:a', '32k', media,
], { encoding: 'utf8' });
if (r.status !== 0) { console.error('fake-tts: ffmpeg 失败\n' + (r.stderr || '')); process.exit(1); }

if (wordsOut) {
  const chars = [...text];
  const step = dur / Math.max(1, chars.length);
  const words = chars.map((ch, i) => ({
    w: ch,
    start: +(i * step).toFixed(3),
    end: +((i + 1) * step).toFixed(3),
  })).filter((x) => x.w.trim() !== '');
  writeFileSync(wordsOut, JSON.stringify({ words }, null, 2) + '\n');
}
