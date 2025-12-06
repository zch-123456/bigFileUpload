# 后端服务

基于 Node.js + Express 的大文件上传后端服务。

## 技术栈

- Express - Web 框架
- Multer - 文件上传
- better-sqlite3 - SQLite 数据库
- fs-extra - 文件操作

## 启动

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 生产模式
pnpm start
```

## API 文档

### 1. 秒传检查
```
POST /api/upload/check
Body: { fileHash, fileName, fileSize }
```

### 2. 初始化任务
```
POST /api/upload/init
Body: { fileHash, fileName, fileSize, totalChunks, chunkSize }
```

### 3. 上传分片
```
POST /api/upload/chunk
Content-Type: multipart/form-data
FormData: { file, uploadId, chunkIndex, chunkSize }
```

### 4. 合并文件
```
POST /api/upload/merge
Body: { uploadId, fileHash }
```

### 5. 暂停任务
```
POST /api/upload/pause
Body: { uploadId }
```

### 6. 取消任务
```
POST /api/upload/cancel
Body: { uploadId }
```

### 7. 任务列表
```
GET /api/upload/list
```

## 目录结构

```
backend/
├── src/
│   ├── db/
│   │   └── database.js      # 数据库配置
│   ├── routes/
│   │   └── upload.js        # 上传路由
│   └── app.js               # Express 应用
├── uploads/
│   ├── temp/               # 临时分片
│   └── merged/             # 合并后文件
├── data/                   # SQLite 数据库
└── package.json
```

## 配置

### 环境变量

```bash
PORT=3000                   # 服务端口
```

### 存储配置

默认使用本地存储，文件保存在 `uploads/merged/` 目录。

如需使用云存储（OSS/S3），需要修改 `src/routes/upload.js` 中的存储逻辑。

