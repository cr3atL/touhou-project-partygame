import { VERSIONS } from '../../../packages/core/types';

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

export async function waitForRoomServer(endpoint: string, request: typeof fetch = fetch): Promise<void> {
  const health = new URL(endpoint);
  health.protocol = health.protocol === 'wss:' ? 'https:' : 'http:';
  health.pathname = `${health.pathname.replace(/\/$/, '')}/health`;
  health.search = ''; health.hash = '';
  let response: Response;
  try {
    response = await request(health.href, { signal: AbortSignal.timeout(90000), cache: 'no-store' });
  } catch {
    throw new Error('房间服务暂时无法连接，请稍后重试');
  }
  if (!response.ok) throw new Error('房间服务暂时不可用，请稍后重试');
  const status = await response.json();
  if (!status.ok || status.protocol !== VERSIONS.protocol || status.rules !== VERSIONS.rules) {
    throw new Error('房间版本不兼容，请刷新页面后重试');
  }
}
