interface PageLocation { hostname: string; protocol: string }
export function defaultRoomEndpoint(location: PageLocation, configured?: string): string {
  if(configured?.trim())return configured.trim();
  return location.protocol==='https:'?'':`ws://${location.hostname||'localhost'}:2567`;
}
export function validateRoomEndpoint(value: string, protocol: string): string {
  let url:URL;try{url=new URL(value.trim());}catch{throw new Error('请填写房间服务地址');}
  if(!['ws:','wss:'].includes(url.protocol))throw new Error('房间服务地址须使用 ws:// 或 wss://');
  if(protocol==='https:'&&url.protocol!=='wss:')throw new Error('此页面需要 wss:// 安全房间服务');
  return url.href;
}
