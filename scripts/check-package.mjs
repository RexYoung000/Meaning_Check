import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
const output=path.resolve('.output/chrome-mv3');
const manifest=JSON.parse(await readFile(path.join(output,'manifest.json'),'utf8'));
assert.equal(manifest.manifest_version,3);
assert.deepEqual([...manifest.permissions].sort(),['activeTab','scripting','storage']);
const hosts=['https://api.deepseek.com/*','https://reddit.com/*','https://www.reddit.com/*','https://x.com/*'];
assert.deepEqual([...manifest.host_permissions].sort(),hosts);
assert.deepEqual([...manifest.optional_host_permissions].sort(),['http://127.0.0.1/*','http://localhost/*','https://*/*']);
assert.ok(manifest.background?.service_worker);assert.equal(manifest.options_ui?.page,'options.html');assert.equal(manifest.options_ui?.open_in_tab,true);assert.equal(manifest.action?.default_popup,'popup.html');
assert.ok(manifest.content_scripts.every(s=>s.matches.every(p=>hosts.includes(p)&&!p.includes('api.deepseek'))));
assert.equal(manifest.externally_connectable,undefined);
assert.equal(manifest.default_locale,'en');
assert.equal(await readFile(path.join(output,'LICENSE.txt'),'utf8'),await readFile('LICENSE','utf8'));
for(const size of [16,32,48,128]){const png=await readFile(path.join(output,manifest.icons[size]));assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);}
async function scan(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await scan(file);else if(/\.(js|html|css|json)$/.test(file)){const text=await readFile(file,'utf8');assert.ok(!/sk-[a-zA-Z0-9]{16,}/.test(text),'疑似硬编码密钥：'+file);assert.ok(!text.includes('test-only-not-a-credential'),'测试凭据进入交付包');}}}
await scan(output);
console.log('插件包检查通过：限定固定权限、按需站点授权、双语与图标、无嵌入凭据或测试配置。');
