import { writeFileSync } from 'node:fs';
const colors=['#df6073','#e1b447','#5b9ed4','#63ad86'];
const width=3200,height=2400,cx=1600,cy=1180,step=178;
const point=([x,y])=>({x:Math.round(cx+(x-6)*step),y:Math.round(cy+(y-6)*step*.76)});
const ground=i=>`G${String((i+52)%52).padStart(2,'0')}`;
const rotate=([x,y],turns)=>{for(let i=0;i<turns;i++)[x,y]=[12-y,x];return [x,y];};
const quarter=[[9,0],[9,1],[9,2],[9,3],[9,3],[10,3],[11,3],[12,3],[12,4],[12,5],[12,6],[12,7],[12,8]];
const grid=Array.from({length:4},(_,owner)=>quarter.map(p=>rotate(p,owner))).flat();
const full=[[-62,0],[-31,-37],[31,-37],[62,0],[31,37],[-31,37]];
const shapes={full,backA:[full[1],full[2],full[3],full[4]],backB:[full[4],full[5],full[0],full[1]],slashA:[full[2],full[5],full[0],full[1]],slashB:[full[5],full[2],full[3],full[4]]};
const split={0:'backB',7:'backB',13:'slashA',20:'slashA',26:'backA',33:'backA',39:'slashB',46:'slashB',3:'slashA',4:'slashB',16:'backA',17:'backB',29:'slashB',30:'slashA',42:'backB',43:'backA'};
function tile(id,at,color,layer,shape='full',route_index){
  const p=point(at),vertices=shapes[shape],dx=vertices.reduce((n,p)=>n+p[0],0)/vertices.length,dy=vertices.reduce((n,p)=>n+p[1],0)/vertices.length;
  return {id,x:p.x+dx,y:p.y+dy,tileX:p.x,tileY:p.y,color,layer,shape,polygon:vertices.map(([x,y])=>`${x+p.x},${y+p.y}`).join(' '),...(route_index===undefined?{}:{route_index})};
}
const nodes=grid.map((p,i)=>tile(ground(i),p,(i+3)%4,'public',split[i]??'full',i));
const seats=[],docks=[],edges=[];
for(let i=0;i<52;i++)edges.push({source:ground(i),target:ground(i+1),kind:'road'});
const home=[.9,1.8,3,3.7,4.5,5.3];
for(let owner=0;owner<4;owner++){
  const start=owner*13;
  for(let i=0;i<6;i++){
    const id=`P${owner+1}-F${i+1}`;
    nodes.push(tile(id,rotate([6,home[i]],owner),owner,'finish'));
    edges.push({source:i?`P${owner+1}-F${i}`:ground(start+49),target:id,kind:'finish'});
  }
  const dock=point(rotate([11,1],owner)),exit=point(rotate([10,-.5],owner));
  nodes.push(tile(`launch-${owner}`,rotate([10,-.5],owner),owner,'launch'));
  edges.push({source:`launch-${owner}`,target:ground(start),kind:'launch'});
  docks.push({center:[dock.x,dock.y],exit:[exit.x,exit.y]});
  seats.push({id:owner,start:ground(start),launch:`launch-${owner}`,entry:ground(start+49),flight:{from:ground(start+17),to:ground(start+29),cross:`P${(owner+2)%4+1}-F3`}});
}
const board={version:'1.1.0',coordinate_system:{width,height},nodes,edges,seats,presentation:{docks}};
writeFileSync('packages/core/data/board.json',JSON.stringify(board,null,2)+'\n');
const svg=[`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="四色飞行棋"><defs><radialGradient id="paper"><stop stop-color="#fffdf3"/><stop offset="1" stop-color="#e9eddf"/></radialGradient><marker id="arrow" markerWidth="8" markerHeight="8" refX="5" refY="3" orient="auto"><path d="M0 0L6 3L0 6" fill="none" stroke="#8b9180"/></marker></defs>`];
svg.push(`<path d="M${nodes.slice(0,52).map(n=>`${n.tileX} ${n.tileY}`).join('L')}Z" fill="none" stroke="#30494b" stroke-width="90" stroke-linejoin="round"/>`);
for(const seat of seats){
  const c=colors[seat.id],dock=docks[seat.id], [x,y]=dock.center;
  svg.push(`<rect x="${x-155}" y="${y-108}" width="310" height="225" rx="70" fill="${c}" opacity=".13" stroke="${c}" stroke-width="7"/><text x="${x}" y="${y-65}" text-anchor="middle" font-size="32" font-family="sans-serif" fill="${c}">P${seat.id+1}</text>`);
  for(let i=0;i<4;i++)svg.push(`<ellipse cx="${x+(i%2?45:-45)}" cy="${y+(i>1?60:0)}" rx="34" ry="23" fill="#fff9ed" stroke="${c}" stroke-width="3"/>`);
  const from=nodes.find(n=>n.id===seat.flight.from),to=nodes.find(n=>n.id===seat.flight.to);
  svg.push(`<path d="M${from.tileX} ${from.tileY}L${to.tileX} ${to.tileY}" fill="none" stroke="${c}" stroke-width="24" opacity=".32"/>`);
  const cross=nodes.find(n=>n.id===seat.flight.cross),dx=(to.tileX-from.tileX)/6,dy=(to.tileY-from.tileY)/6;
  for(const side of [-1,1]){const ax=cross.x+side*dx,ay=cross.y+side*dy,rotation=Math.atan2(dy,dx)*180/Math.PI;svg.push(`<path d="M-15 -13L0 0L-15 13M0 -13L15 0L0 13" transform="translate(${ax} ${ay}) rotate(${rotation})" stroke="${c}" stroke-width="7" fill="none"/>`);}
}
for(const edge of edges){
  const a=nodes.find(n=>n.id===edge.source),b=nodes.find(n=>n.id===edge.target);
  const stroke=edge.kind==='road'?'#c5cbbd':colors[b.color];
  svg.push(`<path d="M${a.tileX} ${a.tileY}L${b.tileX} ${b.tileY}" fill="none" stroke="${stroke}" stroke-width="${edge.kind==='finish'?12:6}" opacity="${edge.kind==='finish'?.18:.7}" ${edge.kind==='launch'?'marker-end="url(#arrow)"':''}/>`);
}
for(const n of [...nodes].sort((a,b)=>a.tileY-b.tileY)){
  const c=colors[n.color],thickness=n.polygon.split(' ').map(p=>{const [x,y]=p.split(',').map(Number);return `${x},${y+17}`;}).join(' ');
  svg.push(`<g data-node="${n.id}" data-shape="${n.shape}"><polygon points="${thickness}" fill="${c}" stroke="#697061" stroke-width="2"/><polygon points="${n.polygon}" fill="${c}" stroke="#fff8e8" stroke-width="4"/>`);
  if(n.layer==='finish')svg.push(`<path d="M${n.x-12} ${n.y-7}l12 -10l12 10m-12 -10v28" transform="rotate(${180+n.color*90} ${n.x} ${n.y})" fill="none" stroke="#fff8e7" stroke-width="6" opacity=".85"/>`);
  if(seats.some(s=>s.entry===n.id))svg.push(`<path d="M${n.x-20} ${n.y-12}h24v24m-12 -10l12 10l12 -10" transform="rotate(${n.color*90} ${n.x} ${n.y})" fill="none" stroke="#fff8e7" stroke-width="6" stroke-linejoin="round"/>`);
  if(seats.some(s=>s.flight.cross===n.id))svg.push(`<circle cx="${n.x}" cy="${n.y}" r="16" fill="#fff8e7"/>`);
  if(n.layer==='launch')svg.push(`<path d="M${n.x-20} ${n.y+8}l40 -16l-16 29l-5 -15Z" fill="#fff9e8"/>`);
  if(seats.some(s=>s.flight.from===n.id))svg.push(`<circle cx="${n.x}" cy="${n.y}" r="10" fill="#fff9e8"/>`);
  svg.push('</g>');
}
svg.push(`<path d="M1600 1120l60 60l-60 60l-60 -60Z" fill="#efe3bb" stroke="#c8ac69" stroke-width="5"/><text x="1600" y="1192" text-anchor="middle" fill="#927f57" font-size="32">巡游</text></svg>`);
writeFileSync('public/maps/board.svg',svg.join('\n'));

// Keep the same logical centers and routes while filling the mobile tile footprint.
const mobileSvg=svg.map(part=>{
  const id=part.match(/^<g data-node="([^"]+)"/);
  if(!id)return part;
  const n=nodes.find(n=>n.id===id[1]);
  return part.replace('>',` transform="translate(${n.tileX} ${n.tileY}) scale(1.35) translate(${-n.tileX} ${-n.tileY})">`);
}).join('\n');
writeFileSync('public/maps/board-mobile.svg',mobileSvg);
