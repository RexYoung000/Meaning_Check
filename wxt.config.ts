import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifestVersion: 3,
  manifest: {
    name: '__MSG_extensionName__',
    description: '__MSG_extensionDescription__',
    default_locale: 'en',
    icons: {16:'icons/16.png',32:'icons/32.png',48:'icons/48.png',128:'icons/128.png'},
    minimum_chrome_version: '114',
    permissions: ['storage','scripting','activeTab'],
    host_permissions: ['https://x.com/*', 'https://www.reddit.com/*', 'https://reddit.com/*', 'https://api.deepseek.com/*'],
    optional_host_permissions: ['https://*/*','http://localhost/*','http://127.0.0.1/*'],
    action: { default_title: 'Meaning Check', default_icon: {16:'icons/16.png',32:'icons/32.png'} },
  },
});
