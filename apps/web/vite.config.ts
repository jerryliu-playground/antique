import basicSsl from '@vitejs/plugin-basic-ssl';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // HTTPS 是麦克风的硬性前提(SPEC 6.3):自签证书,手机首次访问点"仍要继续"即可
  plugins: [react(), tailwindcss(), basicSsl()],
  server: {
    host: true, // 手机走局域网 IP 访问
    proxy: {
      // 客户端一律连同源,由 vite 代理到游戏服务端,手机上无需配置
      '/socket.io': { target: 'http://localhost:3001', ws: true },
    },
  },
});
