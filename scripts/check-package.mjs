import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
const output = path.resolve('.output/chrome-mv3');
const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions, ['storage']);
assert.deepEqual([...manifest.host_permissions].sort(), ['https://api.deepseek.com/*', 'https://x.com/*']);
assert.ok(manifest.background?.service_worker);
assert.equal(manifest.options_ui?.page, 'options.html');
assert.ok(manifest.content_scripts.every(s => s.matches.length === 1 && s.matches[0] === 'https://x.com/*'));
assert.equal(manifest.externally_connectable, undefined);
async function scan(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await scan(file);
    else if (/\.(js|html|css|json)$/.test(file)) {
      const content = await readFile(file, 'utf8');
      assert.ok(!/sk-[a-zA-Z0-9]{16,}/.test(content), '发现疑似硬编码密钥：' + file);
      assert.ok(!content.includes('test-only-not-a-credential'), '测试配置进入交付包');
      assert.ok(!/localhost|127\.0\.0\.1/.test(content), '开发地址进入交付包：' + file);
    }
  }
}
await scan(output);
console.log('插件包检查通过：MV3、限定站点与存储权限、无嵌入凭据或测试配置。');
