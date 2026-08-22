import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  // 콘솔에서 설정한 앱 이름과 동일하게
  appName: 'inline-game',

  brand: {
    primaryColor: '#3182F6'
  },

  webView: {},
  webBundleDir: 'dist',

  permissions: []
});
