import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'inline-game', // 콘솔에서 설정한 앱 이름과 동일하게
  brand: {
    displayName: 'In Line',
    primaryColor: '#000000',
    icon: '', // 콘솔에서 업로드한 아이콘 URL로 교체
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
