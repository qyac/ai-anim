#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
 * GPT-SoVITS 驱动（给 `anim say --tts` 用的那条协议）。
 *
 * 协议（与 tools/tts-edge.py 一致）：
 *   <驱动> --voice V --rate R --text 文本 --write-media 输出.wav|mp3 [--write-words 词级.json]
 *
 * 做法：把请求转给本机的 GPT-SoVITS API 服务（api_v2.py，默认 9880），
 * 参考音频/参考文本/模型路径通过环境变量给（它们不属于"一句台词"的维度）：
 *
 *   ANIM_GSV_API       http://127.0.0.1:9880      # api_v2.py 起的服务
 *   ANIM_GSV_REF       C:/.../ref/voice.wav       # 3–10s 参考音频（干净、无音乐）
 *   ANIM_GSV_REF_TEXT  参考音频里说的那句原文      # 必填，零样本克隆要用
 *   ANIM_GSV_REF_LANG  zh                         # zh / en / ja / ko / auto
 *   ANIM_GSV_TEXT_LANG zh
 *   ANIM_GSV_SPEED     1.0                        # 语速倍数（rate 参数会再乘上去）
 *
 * 为什么走 API 而不是 in-process：GPT-SoVITS 首次加载模型要几十秒、常驻显存/内存；
 * 而我们一次要合成十几句 —— 起一次服务、逐句请求，比每句重启一次进程快一个数量级。
 *
 * ⚠ 本机没有 NVIDIA GPU，推理走 CPU：单句 5–20 秒量级（取决于句长），属正常。
 */"""
import argparse
import json
import os
import sys
import wave

def parse_rate(s):
    s = (s or '').strip().replace('%', '')
    try:
        return 1.0 + float(s) / 100.0
    except Exception:
        return 1.0

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--voice', default='')
    ap.add_argument('--rate', default='+0%')
    ap.add_argument('--text', required=True)
    ap.add_argument('--write-media', required=True)
    ap.add_argument('--write-words', default='')
    a = ap.parse_args()

    api = os.environ.get('ANIM_GSV_API', 'http://127.0.0.1:9880').rstrip('/')
    ref = os.environ.get('ANIM_GSV_REF', '')
    ref_text = os.environ.get('ANIM_GSV_REF_TEXT', '')
    if not ref or not os.path.exists(ref):
        print('gpt-sovits 驱动：缺 ANIM_GSV_REF（参考音频，3–10 秒）', file=sys.stderr)
        sys.exit(2)
    if not ref_text:
        print('gpt-sovits 驱动：缺 ANIM_GSV_REF_TEXT（参考音频的原文）', file=sys.stderr)
        sys.exit(2)

    speed = float(os.environ.get('ANIM_GSV_SPEED', '1.0')) * parse_rate(a.rate)
    payload = {
        'text': a.text,
        'text_lang': os.environ.get('ANIM_GSV_TEXT_LANG', 'zh'),
        'ref_audio_path': ref,
        'prompt_text': ref_text,
        'prompt_lang': os.environ.get('ANIM_GSV_REF_LANG', 'zh'),
        'speed_factor': round(speed, 3),
        'media_type': 'wav',
        'streaming_mode': False,
    }
    try:
        import urllib.request
        req = urllib.request.Request(
            api + '/tts',
            data=json.dumps(payload, ensure_ascii=False).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
        )
        # 本机系统代理会把 127.0.0.1 也代理掉（表现是 HTTP 502 Bad Gateway），这里显式直连
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(req, timeout=600) as r:
            data = r.read()
    except Exception as e:
        print('gpt-sovits 驱动：请求 %s 失败：%s' % (api, e), file=sys.stderr)
        print('  先起服务：python api_v2.py -a 127.0.0.1 -p 9880', file=sys.stderr)
        sys.exit(1)

    if len(data) < 1000:
        print('gpt-sovits 驱动：返回体太小（%d 字节），大概是服务报错' % len(data), file=sys.stderr)
        sys.exit(1)
    with open(a.write_media, 'wb') as f:
        f.write(data)

    # 词级时间戳：GPT-SoVITS 不直接给，这里按字数均分（与 tts-edge 的"近似"口径一致）
    if a.write_words:
        try:
            with wave.open(a.write_media, 'rb') as w:
                dur = w.getnframes() / float(w.getframerate())
        except Exception:
            dur = 0.0
        chars = [c for c in a.text if c.strip()]
        step = dur / max(1, len(chars))
        words = [{'w': c, 'start': round(i * step, 3), 'end': round((i + 1) * step, 3)} for i, c in enumerate(chars)]
        with open(a.write_words, 'w', encoding='utf-8') as f:
            json.dump({'words': words}, f, ensure_ascii=False)

if __name__ == '__main__':
    main()
