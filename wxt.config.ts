import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'Meaning Check · 帮我确认意思',
    description: '结合原帖和直接回复，读懂英文 X 回复的意思、语气与依据。',
    manifest_version: 3,
    minimum_chrome_version: '114',
    permissions: ['storage'],
    host_permissions: ['https://x.com/*', 'https://api.deepseek.com/*'],
    action: { default_title: 'Meaning Check 设置' },
  },
});
