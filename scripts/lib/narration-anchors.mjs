// @ts-check
/**
 * 词锚定时间线（`docs/BACKLOG.md` 1-17）—— 让旁白作者写
 * 「说到『兽语』时切镜头」，而不是 `cue: 0.6` 这种**猜出来**的秒数。
 *
 * ## 为什么要有这一层
 *
 * 旁白是唯一的时间源，但秒数是两头猜的：改一个词、换个音色、调一次语速，手写的
 * `cue` / `internal` 全部悄悄失效，而且**不报错**（画面照样渲，只是没人知道错位了）。
 * 词锚把"什么时刻发生"从秒数改成"哪个词的哪个边界"：改词重跑 `say`，锚点跟着词走。
 *
 * ## 作者写什么（`narration.mjs` 新增两个键，其余照旧）
 *
 * * 句上：`on: { line?, word, edge?, affinity? }` —— 这一句的 cue 锚在**另一句**
 *   （`line` 默认上一句）某个词的边界上。语义："上一句说到『兽语』时，切到我这句"。
 * * 段上：`reveal: { at: { line, word, edge? } }` —— 画面最后一次揭晓的 internal
 *   锚在某句某词边界。
 *
 * `line` 一律是**段内 0 起的句子下标**（与 `timing.json` 的 `index` 同口径）。
 * 词名必须与词级时间戳一字不差（驱动按什么切，锚名就是什么 —— 逐字符词表就写单字，
 * 多字词表可以把整段连起来写）。
 *
 * ## 求解顺序（铁律）
 *
 * 锚点 → 段内时刻（cue / internal）→ 然后才轮到 `solveTiming` 的 stretch / slot。
 * **段内偏移跟 stretch 乘这件事 `solveTiming` 已经做了**（`offset = cue * stretch`）——
 * 这里输出的就是段内 cue，绝不能自己乘。
 *
 * ## 报错哲学（与 `say.mjs` 的叠句警告同一口径：点名，绝不静默）
 *
 * * 词名写错 → **抛错**，并**列出被锚句所有可用词**，让作者一眼能改对；
 * * 每段锚点（on + reveal）总数 > 3 → 抛错（锚点太多就变成另一种猜秒数 —— BACKLOG 原文）；
 * * 第一句有 on → 抛错（没有"上一句"可锚）；
 * * on 锚到**自己或更晚的句子** → 抛错（那是一条往回绕的环，链式锚只许"后面的句子锚前面已解出的"）；
 * * affinity 写了不认识的值 → 抛错（静默取默认等于让错锚"看起来工作正常"）。
 *
 * ## 降级（不许静默）
 *
 * 被锚的句子 `words` 为空或 `approx === true`（按字数近似切分，不是真时间戳）→
 * **不解锚**：该句退回显式 cue、该段退回显式 internal，并进 `degraded[]`（含原因文案）。
 * 近似切分的时间不是"那个词真的说到哪"，锚上去会静默错位 —— 宁可退回秒、把话说明白。
 */

/** 每段允许的锚点（on + reveal）总数上限 —— 锚点太多就变成另一种猜秒数。 */
const MAX_ANCHORS_PER_SCENE = 3;

/** 数值口径：解出的时刻都按千分之一秒收口，与 `say.mjs` 的表一致。 */
const round3 = (x) => Math.round(x * 1000) / 1000;

/**
 * 从 `affinity` 键解出"词间停顿归谁"的系数（0 = 全归左边、1 = 全归右边）：
 * * 0.5（默认）：停顿对半分；
 * * `'left'` → 0：时刻落在停顿的**左**沿（end 边界不外扩、start 边界把前停顿全借进来）；
 * * `'right'` → 1：时刻落在停顿的**右**沿（end 边界把后停顿全吃进来、start 边界不外扩）；
 * * 数字 0..1：按比例。
 *
 * ⚠ 写错的值（不认识的字符串、超出 0..1 的数字）在这里就抛 —— 作者拼错键值时
 *   静默取默认，等于让错锚"看起来工作正常"，这比报错贵得多。
 *
 * @param {any} affinity
 * @returns {number}
 */
function affinityFactor(affinity) {
  if (affinity == null) return 0.5;
  if (affinity === 'left') return 0;
  if (affinity === 'right') return 1;
  const n = Number(affinity);
  if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
  throw new Error(
    `锚点的 affinity 只接受 0..1 之间的数字或 'left' | 'right'（时刻落在停顿的左沿 / 右沿），`
    + `现在写的是 ${JSON.stringify(affinity)} —— 拼错就抛，绝不静默取默认。`,
  );
}

/**
 * 在**被锚句自己的合成产物**（words，句内相对秒）里找词，给出"词边界 + 亲和调整"后的时刻。
 *
 * 边界语义（左右亲和是这一层的核心，不许静默归错）：
 *
 * * `edge: 'end'`（默认）：`at = end + 后停顿 × f` —— 'left'(0) 停在词的原生终点，
 *   'right'(1) 吃进整个词间停顿，默认对半；
 * * `edge: 'start'`：`at = start − 前停顿 × (1 − f)` —— 向左借，'left'(0) 把整个
 *   前停顿都借进来，'right'(1) 停在词的原生起点，默认对半。
 *
 * 停顿一律 `max(0, …)` 夹住：时间戳偶有重叠（驱动毛刺）时**宁可贴着词、不倒退**。
 * 没有相邻词时（首词的 start 之前、末词的 end 之后）停顿按 0 处理 ——
 * 词表说的是"这句说了多久"，句外的时间不属于这句的词。
 *
 * 词找不到 → **抛错并列出该句所有可用词**（报错哲学：点名 + 给出改对所需的信息）。
 *
 * @param {{text: string, words: any[]|null, approx?: boolean}} target 被锚的那句（合成产物在手）
 * @param {{word?: string, edge?: 'start'|'end', affinity?: any}} spec 锚的写法
 * @param {string} where 报错时点名"锚的是哪一句"（如 `[alpha] 第 2 句 → 被锚的第 1 句`）
 * @returns {{ at: number, index: number }}
 */
function wordTime(target, spec, where) {
  const edge = spec.edge ?? 'end';
  const f = affinityFactor(spec.affinity);
  const list = Array.isArray(target?.words) ? target.words : [];
  const i = list.findIndex((w) => w?.w === spec.word);
  if (i < 0) {
    const avail = list.map((w) => String(w?.w ?? '')).filter((s) => s.trim());
    throw new Error(
      `${where} 锚的词 ${JSON.stringify(String(spec.word))} 在这句的词级时间戳里找不到。`
      + `可用词（${avail.length} 个）：${avail.map((s) => JSON.stringify(s)).join(' / ')}。`
      + `锚名必须与词表一字不差 —— 逐字符词表就写单个字，多字词表可以把整段连起来写。`
      + `同一个词出现多次时锚的是**第一个**。`,
    );
  }
  const w = list[i];
  if (edge === 'start') {
    const prevEnd = i > 0 ? Number(list[i - 1].end) : Number(w.start);
    const pause = Math.max(0, Number(w.start) - prevEnd);
    return { at: round3(Number(w.start) - pause * (1 - f)), index: i };
  }
  const nextStart = i + 1 < list.length ? Number(list[i + 1].start) : Number(w.end);
  const pause = Math.max(0, nextStart - Number(w.end));
  return { at: round3(Number(w.end) + pause * f), index: i };
}

/**
 * 降级守门：被锚的句子必须拿得到**真**词级时间戳。
 * `words` 为空（驱动没写词表）或 `approx === true`（按字数近似切分）都不许锚 ——
 * 近似切分的时间不是"那个词真的说到哪"，锚上去会静默错位，宁可退回秒。
 *
 * @returns {null | { why: string }} null = 可以解锚；对象 = 降级原因（进 `degraded[]`）
 */
function anchorUnavailable(target, label) {
  if (!Array.isArray(target?.words) || !target.words.length) {
    return { why: `被锚的${label}没有词级时间戳（words 为空）—— 驱动没写出词表` };
  }
  if (target.approx) {
    return { why: `被锚的${label}是按字数近似切分（approx=true，不是真时间戳）—— 锚上去会静默错位` };
  }
  return null;
}

/**
 * 解一个锚：把"锚在谁身上"折成段内秒数。
 *
 * on 的语义是 cue 链：`cue_i = cue_{line} + wordTime(被锚句)`；reveal 同理落在
 * internal 上。被锚句如果自己也是 on 解出来的，直接用**已解出的** cue（链式锚；
 * 链上某一环降级了，就用它退回的显式 cue，链不断、结果仍确定）。
 *
 * @param {{
 *   lines: any[], spec: {line?: number, word?: string, edge?: 'start'|'end', affinity?: any},
 *   selfIdx: number, defLine: number, resolvedCues: (number|null)[],
 *   where: string, defLineLabel: string,
 * }} a
 *   `selfIdx` = 写锚的这句的下标（on 用；reveal 传 -1 表示"段级锚没有自己"）；
 *   `defLine` = line 缺省时锚哪句（on = 上一句；reveal 必须显式写 line，没有缺省）。
 * @returns {{ ok: true, cue: number, at: number, index: number, targetIdx: number }
 *          | { ok: false, why: string }}
 */
function resolveAnchor({ lines, spec, selfIdx, defLine, resolvedCues, where }) {
  if (spec.line == null && defLine < 0) {
    throw new Error(
      `${where} 没写 line —— reveal 的 at 必须写 line（锚在哪句上），它没有"默认上一句"。`,
    );
  }
  const idx = spec.line ?? defLine;
  const label = `第 ${idx + 1} 句`;
  const target = lines[idx];
  if (!target) {
    throw new Error(
      `${where} 锚的${label}不存在（这段一共 ${lines.length} 句）。`
      + `line 是段内 0 起的句子下标 —— 写错下标直接抛，绝不静默。`,
    );
  }
  if (selfIdx >= 0 && idx >= selfIdx) {
    throw new Error(
      `${where} 锚的${label}是它自己或排在它后面的句子 —— on 链只许"后面的句子锚前面已解出的"，
       往回锚没有解（会绕成环）。` + (idx === selfIdx
        ? `要锚自己这句里的时刻，把锚挪到别的句上。`
        : `把 line 改小，或把 on 挪到被锚的那句后面。`),
    );
  }
  const bad = anchorUnavailable(target, label);
  if (bad) return { ok: false, why: bad.why };
  // 被锚句此刻一定已解出（on 链按句序解；reveal 在所有句子之后解）。
  // 它若因降级退回了显式 cue，链就接在显式值上 —— 结果仍确定，而且 degrade 里有记录。
  const base = resolvedCues[idx] ?? Number(target.cue);
  const { at, index } = wordTime(target, spec, `${where} → 被锚的${label}`);
  return { ok: true, cue: round3(base + at), at, index, targetIdx: idx };
}

/**
 * 纯函数：把"词锚定"的旁白脚本解成 `solveTiming` 能直接吃的段内时刻表。
 *
 * 输入的 scenes 形状（`runSay` 合成完每句带上了词级时间戳 `words` —— 句内相对秒）：
 *
 * ```
 * [{ id, internal, reveal?, lines: [{ cue, text, dur, words|null, approx, on? }] }]
 * ```
 *
 * 返回（`scenes` 形状与输入一致，直接喂 `solveTiming`）：
 *
 * ```
 * {
 *   scenes:   [{ id, internal, lines: […] }],   // 只改写了被锚句的 cue / 段的 internal
 *   anchors:  [{ id, kind, word, edge, affinity, at, resolved, line, lineNo }],
 *             // 每个解出的锚。affinity 是**实际采用的取向**（0.5 / 'left' / 'right'），
 *             // at = 词边界相对被锚句的秒数（含亲和调整），resolved = 解出的段内时刻。
 *   degraded: [{ id, kind, why }],              // 降级的句子 / 段（含原因，绝不静默）
 * }
 * ```
 *
 * @param {{ scenes: any[], fallbackBeat?: number }} a
 *   `fallbackBeat` 目前**不用**：锚点全在段内时间里，拍子只在 `solveTiming` 给 slot
 *   取整时才进来。留在签名里是为了调用方（`runSay`）能把同一批参数原样递过来。
 */
export function resolveNarration({ scenes }) {
  const anchors = [];
  const degraded = [];
  const outScenes = [];
  for (const sc of scenes) {
    const lines = sc?.lines ?? [];
    const nOn = lines.filter((l) => l?.on).length;
    const nAnchors = nOn + (sc?.reveal ? 1 : 0);
    // 上限：on 与 reveal 一起数。锚点太多就变成另一种秒数（BACKLOG 原文）——
    // 锚点只表达"在哪个词上做什么"，永远表达不了"接下来持续多久"。
    if (nAnchors > MAX_ANCHORS_PER_SCENE) {
      throw new Error(
        `[${sc?.id}] 这段一共写了 ${nAnchors} 个锚点（on ${nOn} 个${sc?.reveal ? ' + reveal 1 个' : ''}，
         上限 ${MAX_ANCHORS_PER_SCENE} 个）—— 锚点太多就变成另一种猜秒数：`
        + `锚只说"在哪个词上做什么"，说不了"接下来几秒是谁的"，删掉几个，把明确的节奏留给 cue。`,
      );
    }
    // 第一句若有 on → 没有"上一句"可锚，直接抛（写错就点名，不静默）
    if (lines[0]?.on) {
      throw new Error(
        `[${sc?.id}] 第 1 句写了 on —— 它没有"上一句"可锚。`
        + `要么给它显式 cue（这一段从哪说起），要么把锚挪到后一句上。`,
      );
    }
    /** 已解出的 cue（0 起下标 → 段内秒）。on 链按句序解，被锚句一定已解过。 */
    const resolvedCues = Array(lines.length).fill(null);
    const outLines = [];
    for (const [i, l] of lines.entries()) {
      if (!l?.on) {
        resolvedCues[i] = Number(l.cue);
        outLines.push({ ...l });
        continue;
      }
      const where = `[${sc?.id}] 第 ${i + 1} 句（${JSON.stringify(String(l.text ?? ''))}）`;
      const r = resolveAnchor({ lines, spec: l.on, selfIdx: i, defLine: i - 1, resolvedCues, where });
      if (r.ok) {
        resolvedCues[i] = r.cue;
        anchors.push({
          id: `${sc?.id}-${i + 1}`, kind: 'on', word: String(l.on.word),
          edge: l.on.edge ?? 'end', affinity: l.on.affinity ?? 0.5,
          at: r.at, resolved: r.cue, line: r.targetIdx, lineNo: r.targetIdx + 1,
        });
        outLines.push({ ...l, cue: r.cue });
      } else {
        // 降级：退回显式 cue（loadNarrationScript 保证每句都有），链从这里接在显式值上
        resolvedCues[i] = Number(l.cue);
        degraded.push({ id: `${sc?.id}-${i + 1}`, kind: 'on', why: `${r.why} —— 这句退回显式 cue ${Number(l.cue)}s` });
        outLines.push({ ...l });
      }
    }
    let internal = Number(sc?.internal);
    if (sc?.reveal) {
      const where = `[${sc?.id}] reveal`;
      const r = resolveAnchor({
        lines, spec: sc.reveal.at ?? {}, selfIdx: -1, defLine: -1, resolvedCues, where,
      });
      if (r.ok) {
        internal = r.cue;
        anchors.push({
          id: `${sc?.id}-reveal`, kind: 'reveal', word: String(sc.reveal.at.word),
          edge: sc.reveal.at.edge ?? 'end', affinity: sc.reveal.at.affinity ?? 0.5,
          at: r.at, resolved: r.cue, line: r.targetIdx, lineNo: r.targetIdx + 1,
        });
      } else {
        degraded.push({ id: `${sc?.id}-reveal`, kind: 'reveal', why: `${r.why} —— 这段退回显式 internal ${internal}s` });
      }
    }
    outScenes.push({ ...sc, internal, lines: outLines });
  }
  return { scenes: outScenes, anchors, degraded };
}
