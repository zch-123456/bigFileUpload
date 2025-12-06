# 📦 大文件分片上传系统

## ✨ 功能特性

- ✅ **分片上传** - 将大文件切分为小块，提高上传效率
- ✅ **断点续传** - 支持上传中断后继续上传
- ✅ **秒传检测** - 基于文件 MD5，已上传文件直接秒传
- ✅ **并发控制** - 支持多个分片并发上传（默认3个）
- ✅ **暂停/恢复** - 可暂停和恢复上传任务
- ✅ **进度展示** - 实时显示上传进度
- ✅ **任务管理** - 查看所有上传任务状态
- ✅ **完整性校验** - 上传完成后校验文件完整性
- ✅ **集群支持** - 支持多节点部署（需配置共享存储）

## 🛠 技术栈

### 前端
- **React 18** - UI 框架
- **Vite 5** - 构建工具
- **Ant Design 5** - UI 组件库
- **Axios** - HTTP 请求
- **spark-md5** - MD5 计算

### 后端
- **Node.js** - 运行环境
- **Express** - Web 框架
- **Multer** - 文件上传中间件
- **PostgreSQL** - 关系型数据库（生产环境推荐）
- **pg** - PostgreSQL 驱动
- **fs-extra** - 文件系统操作

## 📋 系统架构

### 接口设计

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/upload/check` | POST | 秒传检查 |
| `/api/upload/init` | POST | 初始化上传任务 |
| `/api/upload/chunk` | POST | 上传单个分片 |
| `/api/upload/merge` | POST | 合并分片 |
| `/api/upload/pause` | POST | 暂停任务 |
| `/api/upload/cancel` | POST | 取消任务 |
| `/api/upload/list` | GET | 查询任务列表 |

### 数据库设计

#### 1. upload_task - 上传任务表
存储上传任务的全局信息

```sql
- id: 主键
- upload_id: 任务唯一ID（UUID）
- file_hash: 文件哈希（用于秒传）
- file_name: 文件名称
- file_size: 文件大小
- total_chunks: 分片总数
- uploaded_chunks: 已上传分片数
- status: 任务状态
- created_at: 创建时间
```

#### 2. upload_chunk - 分片表
记录每个分片的上传状态

```sql
- id: 主键
- upload_id: 所属任务ID
- chunk_index: 分片索引
- chunk_size: 分片大小
- status: 分片状态
- local_path: 本地路径
```

#### 3. file_info - 文件信息表
存储已上传文件的元数据

```sql
- id: 主键
- file_hash: 文件哈希（唯一）
- file_name: 文件名
- file_size: 文件大小
- storage_url: 存储地址
- created_at: 创建时间
```

### 状态流转

```
WAITING（待上传）
    ↓
UPLOADING（上传中）
    ↓
MERGING（合并中）
    ↓
COMPLETED（已完成）

支持中途：
- PAUSED（暂停）
- CANCELED（取消）
- FAILED（失败）
```

## 🚀 快速开始

### 环境要求

- Node.js >= 16
- pnpm >= 8
- PostgreSQL >= 12 （数据库）

### 数据库配置

#### 1. 创建 PostgreSQL 数据库

```sql
-- 连接到 PostgreSQL
psql -U postgres

-- 创建数据库
CREATE DATABASE bigfileupload;

-- 退出
\q
```

#### 2. 配置环境变量

```powershell
# 进入 backend 目录
cd backend

# 复制环境变量模板
Copy-Item .env.example .env

# 编辑 .env 文件
notepad .env
```

在 `.env` 文件中配置你的 PostgreSQL 连接信息：

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=bigfileupload
DB_USER=postgres
DB_PASSWORD=your_password_here
PORT=3001
```

> 💡 **提示**：数据库表会在首次启动时自动创建，无需手动执行 SQL 脚本。

> 📖 **详细配置**：查看 [PostgreSQL迁移指南.md](PostgreSQL迁移指南.md) 了解更多信息。

### 安装依赖

```bash
# 安装根目录依赖
pnpm install

# 安装前端依赖
cd frontend
pnpm install

# 安装后端依赖
cd ../backend
pnpm install
```

### 启动开发服务器

#### 方式一：同时启动前后端

```bash
# 在项目根目录执行
pnpm dev
```

#### 方式二：分别启动

```powershell
# 终端1 - 启动后端（端口 3000）
cd backend
pnpm dev

# 终端2 - 启动前端（端口 5173）
cd frontend
pnpm dev
```

### 访问应用

前端访问地址：http://localhost:5173

后端API地址：http://localhost:3000

## 📁 项目结构

```
BigFileUpload/
├── frontend/                 # 前端项目
│   ├── src/
│   │   ├── api/             # API 接口
│   │   ├── components/      # React 组件
│   │   │   ├── FileUpload.jsx    # 文件上传组件
│   │   │   └── TaskList.jsx      # 任务列表组件
│   │   ├── utils/           # 工具函数
│   │   │   └── fileUtils.js      # 文件处理工具
│   │   ├── App.jsx          # 主应用组件
│   │   └── main.jsx         # 入口文件
│   ├── package.json
│   └── vite.config.js
│
├── backend/                  # 后端项目
│   ├── src/
│   │   ├── db/
│   │   │   ├── database.js       # 数据库入口
│   │   │   └── database-pg.js    # PostgreSQL 实现
│   │   ├── routes/
│   │   │   └── upload.js         # 上传路由
│   │   └── app.js                # Express 应用
│   ├── scripts/
│   │   ├── migrate-json-to-pg.js # 数据迁移脚本
│   │   └── test-pg-connection.js # 连接测试脚本
│   ├── uploads/             # 上传文件存储
│   │   ├── temp/           # 临时分片
│   │   └── merged/         # 合并后文件
│   ├── .env.example        # 环境变量模板
│   └── package.json
│
├── package.json             # 根 package.json
├── pnpm-workspace.yaml      # pnpm 工作区配置
└── README.md
```

## 🎯 使用说明

### 1. 上传文件

1. 点击或拖拽文件到上传区域
2. 系统自动计算文件 MD5 哈希
3. 检测是否已存在（秒传）
4. 开始分片上传
5. 上传完成后自动合并
6. 显示下载链接

### 2. 断点续传

如果上传过程中断（刷新页面、网络断开等）：

1. 重新选择相同文件
2. 系统自动识别已上传的分片
3. 从断点处继续上传

### 3. 暂停/恢复

- 上传过程中可点击"暂停"按钮
- 点击"继续"按钮恢复上传

### 4. 查看任务

切换到"任务列表"标签页查看所有上传任务的状态

## ⚙️ 配置说明

### 分片大小

默认分片大小为 5MB，可在 `frontend/src/utils/fileUtils.js` 中修改：

```javascript
export const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024 // 5MB
```

### 并发数量

默认并发上传 3 个分片，可在 `frontend/src/components/FileUpload.jsx` 中修改：

```javascript
const CONCURRENT_LIMIT = 3
```

### 后端端口

后端默认端口为 3000，可通过环境变量修改：

```bash
PORT=3000 pnpm dev
```

## 🔧 核心实现

### 前端核心逻辑

#### 1. 文件切片

```javascript
const createFileChunks = (file, chunkSize) => {
  const chunks = []
  let start = 0
  let index = 0
  
  while (start < file.size) {
    const end = Math.min(start + chunkSize, file.size)
    chunks.push({
      index,
      chunk: file.slice(start, end),
      size: end - start
    })
    start = end
    index++
  }
  
  return chunks
}
```

#### 2. MD5 计算

```javascript
const calculateFileMD5 = (file, onProgress) => {
  return new Promise((resolve, reject) => {
    const spark = new SparkMD5.ArrayBuffer()
    const fileReader = new FileReader()
    // ... 逐块读取计算
    resolve(spark.end())
  })
}
```

#### 3. 并发上传控制

```javascript
const uploadChunksWithConcurrency = async (chunks) => {
  const executing = []
  for (const chunk of chunks) {
    const promise = uploadChunk(chunk)
    executing.push(promise)
    
    if (executing.length >= CONCURRENT_LIMIT) {
      await Promise.race(executing)
    }
  }
  await Promise.all(executing)
}
```

### 后端核心逻辑

#### 1. 分片存储

```javascript
// 使用 multer 存储分片
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadId = req.body.uploadId
    const chunkDir = path.join(TEMP_DIR, uploadId)
    fs.ensureDirSync(chunkDir)
    cb(null, chunkDir)
  },
  filename: (req, file, cb) => {
    cb(null, `chunk-${req.body.chunkIndex}`)
  }
})
```

#### 2. 文件合并

```javascript
const mergeChunks = async (uploadId, chunks) => {
  const mergedPath = path.join(MERGED_DIR, fileName)
  const writeStream = fs.createWriteStream(mergedPath)
  
  for (const chunk of chunks) {
    const data = await fs.readFile(chunk.local_path)
    writeStream.write(data)
  }
  
  writeStream.end()
}
```

## 🐛 常见问题

### 1. 上传失败

- 检查网络连接
- 确认后端服务正常运行
- 查看浏览器控制台错误信息

### 2. 文件合并失败

- 检查磁盘空间是否充足
- 确认所有分片都已上传

### 3. 秒传不生效

- 确保文件内容完全相同
- 文件名可以不同，但内容必须一致

## 🔒 生产环境部署建议

1. **使用专业数据库**：将 SQLite 替换为 MySQL/PostgreSQL
2. **配置共享存储**：使用 NFS/NAS 或对象存储（OSS/S3）
3. **添加用户认证**：实现登录和权限控制
4. **限流和监控**：添加上传速率限制和系统监控
5. **HTTPS 部署**：使用 SSL 证书
6. **负载均衡**：使用 Nginx 进行反向代理和负载均衡

