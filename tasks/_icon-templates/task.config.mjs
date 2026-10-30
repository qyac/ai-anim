export default {
  title: 'icon templates', width: 1920, height: 1080, fps: 60, scale: 1,
  style: 'print',
  timeline: [
    { type: 'compare', id: 'cmp', dur: 4,
      title: '行业图标让对比一眼读懂', sub: 'COMPARE / 带判读标记',
      aTitle: '改之前', bTitle: '改之后',
      icons: ['cross', 'alert', 'check', 'check'],
      rows: [
        { label: '单帧耗时', a: 0.88, b: 0.34 },
        { label: '峰值内存', a: 0.72, b: 0.46 },
        { label: '包体积', a: 0.61, b: 0.52 },
        { label: '首屏时间', a: 0.80, b: 0.28 },
      ],
    },
    { type: 'device', id: 'dev', dur: 4, icon: 'cat', title: '窗口标题栏也能挂图标', chrome: 'app://nekohome', footer: 'device 模板的 icon 参数' },
  ],
};
