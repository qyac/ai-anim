import { seq, cut } from '../../src/timeline.js';
import demo from './scenes/demo.js';

export default {
  title: 'asset lab', width: 1920, height: 1080, fps: 60, scale: 1,
  style: 'flat',
  timeline: seq([cut(demo, { dur: 3, world: 'auto' })]),
};
