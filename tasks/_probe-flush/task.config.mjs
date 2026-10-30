import { seq, cut } from '../../src/timeline.js';
import p from './scenes/p.js';

export default { title: 'probe', width: 1280, height: 720, fps: 60, scale: 1, style: 'flat',
  timeline: seq([cut(p, { dur: 1 })]) };
