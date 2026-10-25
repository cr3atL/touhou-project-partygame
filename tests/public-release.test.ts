import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {CharacterCatalog} from '../apps/web/src/CharacterCatalog';
import {publicAsset} from '../apps/web/src/assets';
import {defaultRoomEndpoint,validateRoomEndpoint} from '../apps/web/src/connection';
import {CHARACTER_LIST} from '../packages/content';
describe('公开发布',()=>{
 it('首页完整展示七人及实时主动、被动说明',()=>{const html=renderToStaticMarkup(createElement(CharacterCatalog));expect(html.match(/<article /g)).toHaveLength(7);for(const c of CHARACTER_LIST){expect(html).toContain(c.name);expect(html).toContain(c.active);expect(html).toContain(c.passive);expect(html).toContain(c.activeText);expect(html).toContain(c.passiveText);}});
 it('公开界面没有试验入口、指定骰子或场景加载依赖',()=>{const code=readFileSync('apps/web/src/App.tsx','utf8');expect(code).not.toMatch(/试验|setDebug|debugDie|SCENARIOS|session\/scenarios|searchParams.*qa/);});
 it('仓库子路径下地图和角色资源正确解析',()=>{expect(publicAsset('/maps/board.svg','/touhou-project-partygame/')).toBe('/touhou-project-partygame/maps/board.svg');expect(publicAsset('characters/reimu-chibi.svg','/touhou-project-partygame')).toBe('/touhou-project-partygame/characters/reimu-chibi.svg');expect(publicAsset('maps/board.svg','/')).toBe('/maps/board.svg');});
 it('Pages默认不尝试连接不存在的房间服务器',()=>{expect(defaultRoomEndpoint({hostname:'cr3atl.github.io',protocol:'https:'})).toBe('');});
 it('本机局域网默认连接保留，可配置公开房间服务',()=>{expect(defaultRoomEndpoint({hostname:'192.168.10.76',protocol:'http:'})).toBe('ws://192.168.10.76:2567');expect(defaultRoomEndpoint({hostname:'cr3atl.github.io',protocol:'https:'},'wss://rooms.example.test')).toBe('wss://rooms.example.test');});
 it('HTTPS页面拒绝混合连接，接受wss，不接受非WebSocket协议',()=>{expect(()=>validateRoomEndpoint('ws://localhost:2567','https:')).toThrow(/wss/);expect(validateRoomEndpoint('wss://rooms.example.test','https:')).toBe('wss://rooms.example.test/');expect(()=>validateRoomEndpoint('https://example.test','http:')).toThrow(/ws/);expect(()=>validateRoomEndpoint('','https:')).toThrow();});
});
