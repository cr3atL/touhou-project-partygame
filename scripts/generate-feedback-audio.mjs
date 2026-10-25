// Original short feedback sounds, separate from the Touhou spell/UI samples.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const directory = fileURLToPath(new URL('../public/audio/', import.meta.url));
mkdirSync(directory, { recursive: true });
const rate = 44100;
let seed = 31;
const noise = () => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed/2147483648-1; };
function write(name, duration, sample) {
  const count = Math.ceil(duration*rate), bytes = Buffer.alloc(44+count*2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length-8,4); bytes.write('WAVEfmt ',8);
  bytes.writeUInt32LE(16,16); bytes.writeUInt16LE(1,20); bytes.writeUInt16LE(1,22);
  bytes.writeUInt32LE(rate,24); bytes.writeUInt32LE(rate*2,28); bytes.writeUInt16LE(2,32); bytes.writeUInt16LE(16,34);
  bytes.write('data',36); bytes.writeUInt32LE(count*2,40);
  for(let i=0;i<count;i++) bytes.writeInt16LE(Math.round(Math.max(-.95,Math.min(.95,sample(i/rate)))*32767),44+i*2);
  writeFileSync(join(directory,`${name}.wav`),bytes);
}
function tap(t, frequency, strength = 1) {
  if(t<0 || t>.065) return 0;
  const attack = Math.min(1,t/.0015), decay = Math.exp(-t*90);
  return attack*decay*(Math.sin(t*frequency*2*Math.PI)*.32+Math.sin(t*frequency*3.1*Math.PI)*.12+noise()*.12)*strength;
}
const ticks = [0,.041,.096,.164,.249,.354,.482,.637];
write('dice-roll',.78,t => ticks.reduce((sum,at,i) => sum+tap(t-at,460+i*37,.56+i*.035),0));
write('dice-settle',.16,t => tap(t,385,.95)+tap(t-.043,610,.38));
let low = 0;
write('piece-move',.65,t => {
  const n = noise(); low += .075*(n-low);
  const flight = t<.4 ? Math.sin(Math.PI*t/.4)**2 : 0;
  const air = (low*.65+Math.sin(2*Math.PI*(540*t+220*t*t))*.018)*flight;
  return air+tap(t-.52,290,.45);
});
