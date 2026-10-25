import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { it, expect } from 'vitest';
it('规则内核不依赖界面、房间服务或具体角色', () => {
  const folder = resolve('packages/core');
  for (const file of readdirSync(folder).filter(f => f.endsWith('.ts'))) {
    const code = readFileSync(resolve(folder, file), 'utf8');
    const imports = [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m => m[1]);
    expect(imports.some(i => /react|phaser|colyseus|apps\/|content\/characters/.test(i)), file).toBe(false);
  }
});
