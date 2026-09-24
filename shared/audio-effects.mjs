// Shared by the renderer, settings validation and the bilingual effect picker.
export const AUDIO_EFFECTS = [
  {id:'pulse',label:'音量呼吸',description:'重拍更亮，间隙更暗，跟随音乐起伏'},
  {id:'spectrum',label:'频谱跳动',description:'八段频谱从低音到高音跳动'},
  {id:'ripple',label:'鼓点扩散',description:'每次重拍，从中心向外散开'},
  {id:'mirror',label:'中心声浪',description:'声音越强，向两侧展开得越远'},
  {id:'wave',label:'旋律波浪',description:'波纹随旋律流动，随音量起伏'},
  {id:'rain',label:'音符落雨',description:'不同频段化作从上落下的光点'},
  {id:'comet',label:'节奏流星',description:'重拍带出一道横穿键盘的流星'},
  {id:'sparkle',label:'星点闪动',description:'声音越丰富，闪动的星点越多'},
  {id:'heartbeat',label:'心跳爱心',description:'爱心跟随重拍，轻轻跳动两下'},
  {id:'split',label:'高低音对话',description:'左侧响应低音，右侧响应高音'},
];
