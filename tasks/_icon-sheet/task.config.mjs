import { seq, cut } from '../../src/timeline.js';
import icons from './scenes/icons.js';

export default {
  title: 'icon sheet', width: 1920, height: 1080, fps: 60, scale: 1,
  style: 'flat',
  timeline: seq([cut(icons, { dur: 3, world: 'auto' })]),
};
