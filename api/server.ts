/**
 * 本地开发服务器入口
 */
import app from './app.js';

const PORT = Number(process.env.PORT || 3001);
// HOST 不配则监听所有网卡（0.0.0.0）；
// 内网单人场景建议设为内网 IP，如 192.168.x.x，避免暴露到公网网卡
const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  const display = HOST === '0.0.0.0' ? `所有网卡 :${PORT}` : `${HOST}:${PORT}`;
  console.log(`Server ready on ${display}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;
