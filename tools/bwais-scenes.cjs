'use strict';
// Synthetic Picture-Completion scenes (code-generated, NOT licensed WAIS/RAVIT art).
// Each scene is line-art SVG (inner markup, viewBox 0 0 200 150) where ONE part is
// deliberately absent. `a` is the expected answer (the missing part), for offline
// researcher scoring. This is a structural analog, not the actual instrument.

// reusable paw-print (for the dog-footprint trail)
function paw(x, y){
  return `<ellipse cx="${x}" cy="${y}" rx="9" ry="6"/>`+
    `<circle cx="${x-6}" cy="${y-8}" r="3"/><circle cx="${x}" cy="${y-10}" r="3"/><circle cx="${x+6}" cy="${y-8}" r="3"/>`;
}

module.exports = [
  // 1 尾巴 (tail) — dog with no tail
  { id:1, a:'尾巴', svg:`<ellipse cx="92" cy="82" rx="46" ry="26"/><circle cx="146" cy="60" r="16"/><path d="M140 48 l-7 -12"/><path d="M58 106 v22 M78 108 v20 M108 108 v20 M128 106 v22"/>` },
  // 2 鼻子 (nose) — face with eyes + mouth, no nose
  { id:2, a:'鼻子', svg:`<circle cx="100" cy="75" r="45"/><circle cx="84" cy="68" r="4" fill="#1e293b"/><circle cx="116" cy="68" r="4" fill="#1e293b"/><path d="M86 96 q14 9 28 0"/>` },
  // 3 扳机 (trigger) — pistol with empty trigger guard
  { id:3, a:'扳机', svg:`<path d="M38 58 h96 v22 h-64 l-8 46 h-30 l7 -46 h-1 z"/><circle cx="82" cy="98" r="11"/>` },
  // 4 方块 (square) — row of squares, third one missing (dashed)
  { id:4, a:'方块', svg:`<rect x="28" y="60" width="30" height="30"/><rect x="70" y="60" width="30" height="30"/><rect x="112" y="60" width="30" height="30" stroke-dasharray="6 4"/><rect x="154" y="60" width="30" height="30"/>` },
  // 5 脚 (foot) — standing person, one foot present, other leg ends bare
  { id:5, a:'脚', svg:`<circle cx="100" cy="40" r="14"/><path d="M100 54 v42"/><path d="M100 66 l-20 16 M100 66 l20 16"/><path d="M100 96 l-14 34 M86 130 h-14"/><path d="M100 96 l14 34"/>` },
  // 6 鳍 (fin) — fish with tail + eye, no dorsal fin
  { id:6, a:'鳍', svg:`<path d="M40 75 q46 -34 92 0 q-46 34 -92 0 z"/><path d="M132 75 l26 -20 v40 z"/><circle cx="64" cy="70" r="4" fill="#1e293b"/>` },
  // 7 梳 (comb) — only the comb spine, teeth missing
  { id:7, a:'梳', svg:`<rect x="40" y="58" width="120" height="14" rx="4"/><path d="M56 72 v18 M84 72 v18 M112 72 v18 M140 72 v18" stroke-dasharray="4 5"/>` },
  // 8 珠子 (bead) — string of beads with one gap
  { id:8, a:'珠子', svg:`<path d="M36 75 h128"/><circle cx="50" cy="75" r="11"/><circle cx="76" cy="75" r="11"/><circle cx="124" cy="75" r="11"/><circle cx="150" cy="75" r="11"/>` },
  // 9 镜梁 (glasses bridge) — two lenses + temples, no bridge
  { id:9, a:'镜梁', svg:`<circle cx="70" cy="76" r="22"/><circle cx="130" cy="76" r="22"/><path d="M48 76 h-22 M152 76 h22"/>` },
  // 10 箭头 (arrow) — pole + shaft, no arrowhead
  { id:10, a:'箭头', svg:`<path d="M70 132 v-72"/><path d="M70 60 h84"/>` },
  // 11 指头 (finger) — hand with 4 fingers, no thumb
  { id:11, a:'指头', svg:`<path d="M72 132 v-42 q0 -10 10 -10 h38 q10 0 10 10 v42 z"/><path d="M82 80 v-30 M97 80 v-36 M112 80 v-36 M127 80 v-30"/>` },
  // 12 路标 (road sign) — roadside + pole, no sign panel
  { id:12, a:'路标', svg:`<path d="M34 132 L100 92 L166 132"/><path d="M120 132 v-54"/>` },
  // 13 水柱 (water jet) — fountain base, no water column above
  { id:13, a:'水柱', svg:`<path d="M58 100 h84 l-12 22 h-60 z"/><path d="M94 100 v-12 h12 v12"/>` },
  // 14 人影 (human shadow) — sun + person + ground, no shadow
  { id:14, a:'人影', svg:`<circle cx="152" cy="38" r="12"/><path d="M152 20 v-6 M152 56 v6 M134 38 h-6 M170 38 h6"/><circle cx="78" cy="66" r="9"/><path d="M78 75 v22 M78 82 l-9 13 M78 82 l9 13 M78 97 l-7 16 M78 97 l7 16"/><path d="M40 128 h120"/>` },
  // 15 烟囱 (chimney) — house, roof, door, windows, no chimney
  { id:15, a:'烟囱', svg:`<path d="M52 100 v42 h96 v-42"/><path d="M40 100 l60 -42 l60 42"/><rect x="86" y="116" width="22" height="26"/><rect x="60" y="110" width="18" height="14"/><rect x="124" y="110" width="18" height="14"/>` },
  // 16 桨柱 (paddle) — boat hull + seat, no paddle
  { id:16, a:'桨柱', svg:`<path d="M48 92 q52 30 104 0 l-16 22 h-72 z"/><path d="M72 92 v-20 h56 v20"/>` },
  // 17 门把手 (door handle) — door with panels, no handle
  { id:17, a:'门把手', svg:`<rect x="70" y="38" width="60" height="94"/><rect x="80" y="48" width="40" height="36"/><rect x="80" y="94" width="40" height="30"/>` },
  // 18 马踏镫 (stirrup) — horse + rider leg, stirrup position dashed (missing)
  { id:18, a:'马踏镫', svg:`<ellipse cx="92" cy="92" rx="42" ry="18"/><path d="M58 108 v20 M78 108 v20 M106 108 v20 M126 108 v20"/><path d="M100 58 v28"/><circle cx="100" cy="92" r="7" stroke-dasharray="3 3"/>` },
  // 19 5 (the number) — number row with the 5 slot blank
  { id:19, a:'5', svg:`<text x="40" y="82" font-size="26" font-family="monospace">1</text><text x="64" y="82" font-size="26" font-family="monospace">2</text><text x="88" y="82" font-size="26" font-family="monospace">3</text><text x="112" y="82" font-size="26" font-family="monospace">4</text><rect x="136" y="60" width="26" height="26" stroke-dasharray="5 4"/><text x="168" y="82" font-size="26" font-family="monospace">6</text>` },
  // 20 眉毛 (eyebrow) — face with eyes/nose/mouth, no eyebrows
  { id:20, a:'眉毛', svg:`<circle cx="100" cy="75" r="40"/><circle cx="85" cy="70" r="4" fill="#1e293b"/><circle cx="115" cy="70" r="4" fill="#1e293b"/><path d="M100 78 v12 M95 90 h10"/><path d="M88 102 q12 8 24 0"/>` },
  // 21 狗脚迹 (dog paw print) — trail of paws, third one missing
  { id:21, a:'狗脚迹', svg:`${paw(48,90)}${paw(88,78)}${paw(168,90)}<path d="M112 88 h24" stroke-dasharray="4 5"/>` },
];
