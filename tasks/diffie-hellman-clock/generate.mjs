import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { clock, clockJump, clockPoint, example, modPow, powerTrail } from './math.mjs';

if (!process.argv[2]) throw new Error('Usage: node generate.mjs <output-directory>');
const out = resolve(process.argv[2]);
for (const dir of ['data', 'svg']) mkdirSync(resolve(out, dir), { recursive: true });
const write = (path, data) => writeFileSync(resolve(out, path), data);
const json = (name, data) => write('data/' + name + '.json', JSON.stringify(data,
  (_, value) => typeof value === 'bigint' ? Number(value) : value, 2) + '\n');

const { modulus: p, generator: g, aliceExponent: a, bobExponent: b } = example;
const A = modPow(g, a, p);
const B = modPow(g, b, p);
const aliceShared = modPow(B, a, p);
const bobShared = modPow(A, b, p);
const powers = powerTrail(g, Number(p - 1n), p);
const order = powers.slice(1).find(({ residue }) => residue === 1n).step;
const reduced = a * b % BigInt(order);

const points = Array.from({ length: clock.modulus }, (_, residue) => ({ residue, ...clockPoint(residue) }));
json('clock-points', { ...clock, angleOrigin: 'top', direction: 'clockwise', coordinateSystem: { x: 'right', y: 'down' }, points });
json('exchange', {
  publicParameters: { p, g, order },
  publicValues: { aliceToBob: A, bobToAlice: B },
  localOnly: { aliceExponent: a, bobExponent: b },
  sharedValues: { alice: aliceShared, bob: bobShared },
  exponentProduct: a * b, reducedExponent: reduced,
});

const colors = { alice: '#ff7790', bob: '#73c8ff', shared: '#ffdc86', ink: '#e8f6ff', muted: '#b7c8d8', guide: '#627c93' };
const routes = [
  { id: 'alice-public', base: g, exponent: a, color: colors.alice, bend: 0.14 },
  { id: 'bob-public', base: g, exponent: b, color: colors.bob, bend: 0.21 },
  { id: 'alice-shared', base: B, exponent: a, color: colors.alice, bend: 0.10 },
  { id: 'bob-shared', base: A, exponent: b, color: colors.bob, bend: 0.17 },
].map((route) => ({ ...route, rows: powerTrail(route.base, Number(route.exponent), p).map((row) => ({
  ...row, curve: row.from === null ? null : clockJump(Number(row.from), Number(row.residue), route.bend),
})) }));
json('power-trails', { zeroExponentResidue: 1, routes });
write('data/group-order.csv', ['exponent,residue,exact_transition_product', ...powers.map(({ step, residue, product }) =>
  [step, residue, product ?? ''].join(','))].join('\n') + '\n');

const bounds = [0, 6, 13, 19, 26, 33, 40, 45, 50];
const cues = ['parameters', 'alice-public', 'bob-public', 'public-values-and-toy-log', 'alice-shared', 'bob-shared', 'match-16', 'shared-secret'];
json('sync-50s', { durationSeconds: bounds.at(-1), scenes: cues.map((id, i) => ({ id, startSeconds: bounds[i], endSeconds: bounds[i + 1] })) });

const rounded = (value) => Number(value.toFixed(3));
const xy = (point) => `${rounded(point.x)} ${rounded(point.y)}`;
const line = (a, b, attrs) => `<line x1="${rounded(a.x)}" y1="${rounded(a.y)}" x2="${rounded(b.x)}" y2="${rounded(b.y)}" ${attrs}/>`;
const circle = (point, radius, attrs) => `<circle cx="${rounded(point.x)}" cy="${rounded(point.y)}" r="${radius}" ${attrs}/>`;
const text = (x, y, value, attrs = '') => `<text x="${rounded(x)}" y="${rounded(y)}" ${attrs}>${value}</text>`;

function svg(name, width, height, elements) {
  const body = elements.map((element) => '    ' + element).join('\n');
  write('svg/' + name + '.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <g font-family="Consolas, Microsoft YaHei, PingFang SC, sans-serif">
${body}
  </g>
</svg>\n`);
}

const center = { x: clock.center, y: clock.center };
const strokeGuide = `stroke="${colors.guide}"`;
const pointLabel = `fill="${colors.ink}" text-anchor="middle" dominant-baseline="central"`;
svg('clock', clock.size, clock.size, [
  circle(center, clock.trackRadius, `fill="none" ${strokeGuide} stroke-opacity="0.72" stroke-width="2"`),
  circle(center, 374, `fill="none" ${strokeGuide} stroke-opacity="0.48" stroke-width="2"`),
  ...points.flatMap(({ residue, x, y }) => {
    const labelPoint = clockPoint(residue, 414);
    return [
      line(clockPoint(residue, 355), clockPoint(residue, 374), `${strokeGuide} stroke-width="2"`),
      circle({ x, y }, 5, `fill="${colors.muted}"`),
      text(labelPoint.x, labelPoint.y, residue, `${pointLabel} font-size="35"`),
    ];
  }),
]);

svg('clock-parameters', clock.size, clock.size, [
  circle(clockPoint(1), 18, `fill="none" stroke="${colors.ink}" stroke-width="4"`),
  circle(clockPoint(Number(g)), 15, `fill="none" stroke="${colors.muted}" stroke-width="3" stroke-dasharray="5 5"`),
  text(center.x, center.y - 22, `p = ${p}`, `fill="${colors.ink}" text-anchor="middle" font-size="52"`),
  text(center.x, center.y + 45, `g = ${g}`, `fill="${colors.muted}" text-anchor="middle" font-size="43"`),
]);

for (const { id, color, rows } of routes) {
  const key = 'arrow-' + id;
  const used = new Set();
  const paths = rows.flatMap(({ from, residue, curve }) => {
    if (curve === null) return [];
    const edge = `${from}:${residue}`;
    if (used.has(edge)) return [];
    used.add(edge);
    const { start, control, end } = curve;
    return [`<path d="M ${xy(start)} Q ${xy(control)} ${xy(end)}" fill="none" stroke="${color}" stroke-width="5" stroke-opacity="0.84" marker-end="url(#${key})"/>`];
  });
  svg(id, clock.size, clock.size, [
    `<defs><marker id="${key}" markerWidth="5" markerHeight="5" refX="5" refY="2.5" orient="auto"><path d="M 0 0 L 5 2.5 L 0 5 Z" fill="${color}"/></marker></defs>`,
    ...paths,
    circle(clockPoint(Number(rows.at(-1).residue)), 16, `fill="none" stroke="${color}" stroke-width="4"`),
  ]);
}

svg('shared-value', clock.size, clock.size, [
  circle(clockPoint(Number(aliceShared)), 27, `fill="none" stroke="${colors.shared}" stroke-width="4"`),
  circle(clockPoint(Number(aliceShared)), 16, `fill="none" stroke="${colors.shared}" stroke-width="3"`),
  text(center.x, center.y - 20, aliceShared, `fill="${colors.shared}" text-anchor="middle" font-size="156" font-weight="700"`),
  text(center.x, center.y + 47, '共享值', `fill="${colors.shared}" text-anchor="middle" font-size="35"`),
]);

svg('public-values', 800, 270, [
  text(400, 49, '公开信道', `fill="${colors.muted}" text-anchor="middle" font-size="24"`),
  `<path d="M 185 93 H 609 M 589 80 L 609 93 L 589 106" fill="none" stroke="${colors.alice}" stroke-width="3"/>`,
  `<path d="M 615 223 H 191 M 211 210 L 191 223 L 211 236" fill="none" stroke="${colors.bob}" stroke-width="3"/>`,
  `<rect x="76" y="110" width="218" height="98" rx="14" fill="none" stroke="${colors.alice}" stroke-width="2"/>`,
  `<rect x="506" y="110" width="218" height="98" rx="14" fill="none" stroke="${colors.bob}" stroke-width="2"/>`,
  text(185, 172, `A = ${A}`, `fill="${colors.alice}" text-anchor="middle" font-size="46"`),
  text(615, 172, `B = ${B}`, `fill="${colors.bob}" text-anchor="middle" font-size="46"`),
]);

const startX = 80;
const spacing = 40;
const exponentX = (number) => startX + number * spacing;
const arcStart = exponentX(Number(reduced));
const arcEnd = exponentX(Number(a * b));
const rulerTicks = Array.from({ length: Number(a * b) + 1 }, (_, i) => i);
const labeledTicks = new Map([[0, colors.muted], [4, colors.alice], [6, colors.bob], [8, colors.shared], [16, colors.muted], [24, colors.shared]]);
svg('exponent-ruler', 1120, 260, [
  text(80, 43, '指数轴 · 幂循环周期 16', `fill="${colors.ink}" font-size="32" font-weight="700"`),
  `<path d="M ${arcStart} 158 Q ${(arcStart + arcEnd) / 2} 15 ${arcEnd} 158" fill="none" stroke="${colors.shared}" stroke-width="3"/>`,
  text((arcStart + arcEnd) / 2, 71, '+16', `fill="${colors.shared}" text-anchor="middle" font-size="23"`),
  line({ x: startX, y: 158 }, { x: arcEnd, y: 158 }, `${strokeGuide} stroke-width="3"`),
  ...rulerTicks.flatMap((i) => {
    const x = exponentX(i);
    const color = labeledTicks.get(i);
    return [line({ x, y: 158 }, { x, y: color ? 179 : 168 }, `stroke="${color ?? colors.guide}" stroke-width="2"`),
      ...(color ? [text(x, 207, i, `fill="${color}" text-anchor="middle" font-size="27"`)] : [])];
  }),
]);

const marked = new Map([[4, colors.alice], [6, colors.bob], [8, colors.shared], [16, colors.shared]]);
svg('toy-discrete-log-table', 1160, 256, [
  text(64, 48, '模 17 玩具例：枚举指数即可反查', `fill="${colors.ink}" font-size="33" font-weight="700"`),
  text(64, 140, '指数 n', `fill="${colors.muted}" font-size="23"`),
  text(64, 198, '余数', `fill="${colors.muted}" font-size="23"`),
  line({ x: 62, y: 158 }, { x: 1105, y: 158 }, strokeGuide),
  ...powers.flatMap(({ step, residue }) => {
    const x = 219 + step * 54;
    const color = marked.get(step) ?? colors.ink;
    const attrs = `fill="${color}" text-anchor="middle" font-size="26"`;
    return [text(x, 140, step, attrs), text(x, 198, residue, attrs)];
  }),
]);
