// Original, temporary vector art. Replace individual assets without changing game rules.
import { mkdir, writeFile } from 'node:fs/promises';
const cast = [
  ['reimu','#50353b','#c84558','#fff4dc','#8e3a42'],
  ['marisa','#e6bc66','#303141','#fff4de','#ad713b'],
  ['yukari','#edcd74','#78549b','#fff0d5','#9c528e'],
  ['remilia','#9fb8db','#da9daf','#f9dbe6','#bb405d'],
  ['flandre','#efd17e','#bc4054','#fff3d7','#c5444c'],
  ['yuyuko','#edb1cc','#79a7c9','#f4e7f2','#8a5aab'],
  ['youmu','#d5e1dd','#438577','#f4f5e9','#4d8b83'],
];
const bow = (x,y,color,s=1) => `<g transform="translate(${x} ${y}) scale(${s})" fill="${color}"><path d="M0 0L-23-13-23 15Z M0 0L23-13 23 15Z"/><circle r="5" fill="#f7e5c9"/></g>`;
for (const [id,hair,dress,white,eye] of cast) {
  for (const chibi of [true,false]) {
    const cy=chibi?68:61, rx=chibi?29:20, ry=chibi?28:25;
    const waist=chibi?116:129, hem=chibi?151:228, foot=chibi?177:298;
    let back='', accessory='', trim='';
    if(id==='remilia') back=`<path d="M65 110Q24 59 14 115L34 108 40 132 60 127 M115 110Q156 59 166 115L146 108 140 132 120 127" fill="#554260"/>`;
    if(id==='flandre') { back='<path d="M65 110L28 85 12 58 M115 110L151 80 165 49" fill="none" stroke="#514557" stroke-width="5"/>'; back+=['#dd575d','#e7ad43','#6ebfae','#6da6db','#967cc4','#d45e9c','#f1d47e','#74bcde'].map((c,i)=>{let x=i<4?13+i*12:127+(i-4)*12,y=i<4?63+i*8:91-(i-4)*11;return `<path d="M${x} ${y}l-5 11 5 8 5-8Z" fill="${c}" stroke="#fff1cc"/>`;}).join(''); }
    if(id==='youmu') back=`<path d="M56 ${waist+6}L142 48" stroke="#293f46" stroke-width="9"/><path d="M57 ${waist}L147 43" stroke="#d4e6df" stroke-width="4"/><path d="M28 107Q-9 85 4 60 21 45 26 65 21 84 39 80 51 95 28 107" fill="#e4fff5" stroke="#78aa9a" stroke-width="2"/>`;
    if(id==='marisa') accessory=`<path d="M44 49L64 16 89 4 109 37 137 51Q92 63 44 49" fill="#303141"/><path d="M62 36L113 37 120 47 55 48Z" fill="#faf3df"/>${bow(119,43,'#eadbc8',.55)}`;
    if(id==='reimu') accessory=bow(90,cy-28,'#ce4456',chibi?1.15:1)+`<path d="M61 ${cy-2}l-8 34 14-8 M119 ${cy-2}l8 34-14-8" fill="#d94d60"/>`;
    if(id==='yukari') {accessory=`<path d="M53 ${cy-17}Q43 ${cy-48} 90 ${cy-42} 133 ${cy-46} 128 ${cy-14}Q90 ${cy-2} 53 ${cy-17}" fill="#f6dfdf"/>${bow(117,cy-26,'#8055a3',.6)}`; back+=`<path d="M141 ${hem}L148 66" stroke="#b89b62" stroke-width="3"/><path d="M119 69Q147 15 176 69Q147 58 119 69" fill="#e9c4df" stroke="#8d658d" stroke-width="2"/>`; }
    if(['remilia','flandre','yuyuko'].includes(id)) accessory=`<path d="M52 ${cy-17}Q53 ${cy-46} 89 ${cy-39} 119 ${cy-46} 129 ${cy-16}Q90 ${cy-6} 52 ${cy-17}" fill="${white}"/>${bow(117,cy-19,dress,.6)}`;
    if(id==='yuyuko') { accessory+=`<path d="M75 ${cy-33}L90 ${cy-47} 105 ${cy-33}Z" fill="#88b4d2"/><path d="M84 ${cy-33}Q90 ${cy-45} 96 ${cy-33}" fill="none" stroke="#ac547e" stroke-width="2"/>`; trim=`<path d="M99 ${waist+12}Q128 ${waist-8} 142 ${waist+28}L103 ${waist+32}Z" fill="#f2c9df" stroke="#ad7499" stroke-width="2"/>`; }
    if(id==='youmu') accessory=bow(110,cy-23,'#303f40',.65);
    const art=`<svg xmlns="http://www.w3.org/2000/svg" width="180" height="${chibi?190:320}" viewBox="0 0 180 ${chibi?190:320}"><title>${id} · temporary ${chibi?'chibi':'portrait'}</title><defs><linearGradient id="cloth" x2="1" y2="1"><stop stop-color="${dress}"/><stop offset="1" stop-color="${dress}" stop-opacity=".75"/></linearGradient></defs><g stroke="#3f3949" stroke-width="${chibi?2.5:1.8}" stroke-linejoin="round">${back}<path d="M${90-rx} ${cy-8}Q50 ${cy+10} 57 ${waist+12}L85 ${waist-8} 119 ${waist+10}Q131 ${cy+4} ${90+rx} ${cy-8}" fill="${hair}"/><path d="M76 ${hem-7}L75 ${foot-5} 86 ${foot-5} 88 ${hem-7}M94 ${hem-7}L95 ${foot-5} 106 ${foot-5} 104 ${hem-7}" fill="${white}"/><path d="M74 ${foot-10}l-6 11h20l-2-11M96 ${foot-10}l-1 11h20l-9-11" fill="#493942"/><path d="M76 ${cy+ry-2}Q90 ${cy+ry+8} 104 ${cy+ry-2}L111 ${waist} 135 ${hem}Q91 ${hem+17} 46 ${hem}L69 ${waist}Z" fill="url(#cloth)"/><path d="M75 ${cy+ry}L90 ${waist-3} 105 ${cy+ry} 98 ${waist+2} 82 ${waist+2}Z" fill="${white}"/><path d="M71 ${waist}Q91 ${waist+6} 110 ${waist}" fill="none" stroke="${white}" stroke-width="7"/><path d="M48 ${hem-2}Q91 ${hem+13} 133 ${hem-2}" fill="none" stroke="${white}" stroke-width="7"/><path d="M74 ${cy+ry+3}Q57 ${cy+ry+8} 46 ${waist+7}L61 ${waist+14} 80 ${cy+ry+18}M104 ${cy+ry+2}Q120 ${cy+ry+10} 127 ${waist+9}L113 ${waist+14} 99 ${cy+ry+18}" fill="${id==='reimu'?white:dress}"/><ellipse cx="53" cy="${waist+11}" rx="6" ry="7" fill="#ffe2ce"/><ellipse cx="121" cy="${waist+11}" rx="6" ry="7" fill="#ffe2ce"/><ellipse cx="90" cy="${cy}" rx="${rx}" ry="${ry}" fill="#ffe4d2"/><path d="M${90-rx} ${cy+2}Q${52+(chibi?0:12)} ${cy-39} 90 ${cy-ry-5}Q${128-(chibi?0:12)} ${cy-34} ${90+rx} ${cy+7}L107 ${cy-9} 101 ${cy+1} 90 ${cy-15} 82 ${cy-2} 71 ${cy-9}Z" fill="${hair}"/><g fill="${eye}" stroke="none"><ellipse cx="${chibi?79:82}" cy="${cy+6}" rx="${chibi?4.5:3.5}" ry="${chibi?7:5.5}"/><ellipse cx="${chibi?101:99}" cy="${cy+6}" rx="${chibi?4.5:3.5}" ry="${chibi?7:5.5}"/><circle cx="${chibi?80:83}" cy="${cy+3}" r="1.5" fill="white"/><circle cx="100" cy="${cy+3}" r="1.5" fill="white"/></g><path d="M86 ${cy+18}Q90 ${cy+21} 94 ${cy+17}" stroke="#aa6970" fill="none" stroke-width="1.5"/>${accessory}${trim}</g></svg>`;
    await mkdir('public/characters',{recursive:true});
    await writeFile(`public/characters/${id}-${chibi?'chibi':'portrait'}.svg`,art);
  }
}
console.log('14 temporary original vector character assets generated.');
