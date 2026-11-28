# Diffie–Hellman · 模 17 时钟素材包

**题面建议：为什么只交换两个公开数字，双方就能算出同一个共享秘密？** 四条模幂轨迹都在同一张模 17 时钟上取点，配套指数轴和完整余数表。按八幕时长合计，交付时间表为 **50 秒**。

## 核算结果

| 路径 | 本地计算 | 时钟指针依次停靠 |
| --- | --- | --- |
| Alice 公开值 | \(A=3^4\bmod17=13\) | `1 → 3 → 9 → 10 → 13` |
| Bob 公开值 | \(B=3^6\bmod17=15\) | `1 → 3 → 9 → 10 → 13 → 5 → 15` |
| Alice 共享值 | \(B^4\bmod17=16\) | `1 → 15 → 4 → 9 → 16` |
| Bob 共享值 | \(A^6\bmod17=16\) | `1 → 13 → 16 → 4 → 1 → 13 → 16` |

每条轨迹从 1 起步，对应指数为零。每一步把当前余数乘以该路径的底数，再取模。接收的公开值 15 或 13 是后两条路径的底数，分别在第一跳抵达。余数时钟按模 17 运算，底数 3 的幂在指数轴上每 16 步回到原位。查表可见 \(3^8\equiv16\equiv-1\pmod{17}\)，\(3^{16}\equiv1\pmod{17}\)，且 16 是最小正周期。因此 \(3^{24}\equiv3^8\equiv16\pmod{17}\)。

用完整余数表演示离散对数的反查：公开值 13 和 15 分别出现在第 4、6 步。在这个玩具例里，最多枚举 16 个指数位置就能覆盖所有非零余数。现实中的有限域 DH 采用规模远大的参数，并依赖相应群上的计算难题。给定 \(g^x\) 求 \(x\) 是离散对数问题，给定 \(g^a,g^b\) 求 \(g^{ab}\) 是计算型 DH 问题。双方各用自己的私密指数继续做一次向前模幂，即可得到同一个共享值。 [Diffie 与 Hellman 原论文](https://doi.org/10.1109/TIT.1976.1055638)

协议术语采用「密钥协商」与「共享值」。这里的 16 是玩具共享值。实际协议用密钥派生函数从共享秘密导出密钥材料，并通过身份认证把交换绑定到预期的对端。 [NIST SP 800-56A Rev. 3](https://csrc.nist.gov/pubs/sp/800/56/a/r3/final)

## 素材与接口

| 文件 | 用途 |
| --- | --- |
| `svg/clock.svg`、`svg/clock-parameters.svg` | 0–16 时钟底板，以及参数、起点 1 和生成元 3 的独立叠加层 |
| `svg/alice-public.svg`、`svg/bob-public.svg` | 两条公开值轨迹，末端分别为 13 和 15 |
| `svg/alice-shared.svg`、`svg/bob-shared.svg` | 两条共享值轨迹，末端均为 16 |
| `svg/public-values.svg`、`svg/shared-value.svg` | 公开交换寄存器，以及共享值 16 的高亮层 |
| `svg/exponent-ruler.svg`、`svg/toy-discrete-log-table.svg` | 0–24 指数轴和模 17 反查表 |
| `data/clock-points.json` | 刻度点的画布坐标，0 在正上方，余数顺时针递增 |
| `data/power-trails.json` | 每跳的序号、上个余数、取模前乘积、当前余数和二次贝塞尔控制点。重复跳转保留完整顺序 |
| `data/group-order.csv` | 从指数 0 到 16 的完整映射，末行重复起点 1 |
| `data/exchange.json`、`data/sync-50s.json` | 公开参数、本地指数、共享值和八幕时间点 |
| `math.mjs`、`generate.mjs` | 无依赖的模幂与轨迹函数、素材生成脚本 |

时钟的各叠加层使用同一个 `0 0 960 960` 视框，坐标 `x` 向右、`y` 向下。全部 SVG 为透明背景、浅色描边。轨迹 SVG 合并重复出现的同向弧，动画可直接读取 JSON 的逐跳顺序。传给 `jumpPoint` 的 `progress` 为 0–1，`bend` 取该路径导出的同名字段。

```js
import { clockPoint, jumpPoint, modPow } from './math.mjs';

const sharedValue = modPow(15n, 4n, 17n); // 16n
const end = clockPoint(Number(sharedValue));
const marker = jumpPoint(9, 16, 0.5, 0.10); // Alice 的最后一跳
```

在解压目录运行 `node generate.mjs ./regenerated`，可重新生成 SVG 和数据。
