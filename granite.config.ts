import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'inline-game', // 콘솔에서 설정한 앱 이름과 동일하게
  brand: {
    displayName: 'In Line',
    primaryColor: '#3182F6',
    icon: 'https://static.toss.im/appsintoss/27829/98f6c571-6e3e-46af-af2b-6db5dbe9abcb.png',
  },
  web: {
    host: 'localhost',
    port: 5173,
    commands: {
      dev: 'vite',
      build: 'vite build',
    },
  },
  webViewProps: {
    type: 'game', // 게임 카테고리: TDS 불필요, 게임 전용 네비게이션
  },
  permissions: [],
});
