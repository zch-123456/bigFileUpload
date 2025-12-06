// 加载环境变量
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const uploadRoutes = require('./routes/upload');
const { initDatabase } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3001;

// 确保上传目录存在
const UPLOAD_DIR = path.join(__dirname, '../uploads');
const TEMP_DIR = path.join(UPLOAD_DIR, 'temp');
const MERGED_DIR = path.join(UPLOAD_DIR, 'merged');

fs.ensureDirSync(TEMP_DIR);
fs.ensureDirSync(MERGED_DIR);

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 静态文件服务（用于访问已上传的文件）
app.use('/files', express.static(MERGED_DIR));

// 路由
app.use('/api/upload', uploadRoutes);

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

// 启动服务器
async function startServer() {
  try {
    // 初始化数据库
    await initDatabase();
    
    app.listen(PORT, () => {
      console.log(`🚀 服务器运行在 http://localhost:${PORT}`);
      console.log(`📁 临时文件目录: ${TEMP_DIR}`);
      console.log(`📦 合并文件目录: ${MERGED_DIR}`);
      console.log(`💾 数据库类型: PostgreSQL`);
    });
  } catch (error) {
    console.error('❌ 服务器启动失败:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;





