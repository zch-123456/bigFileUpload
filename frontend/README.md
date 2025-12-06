# 前端应用

基于 React + Vite + Ant Design 5 的大文件上传前端应用。

## 技术栈

- React 18 - UI 框架
- Vite 5 - 构建工具
- Ant Design 5 - UI 组件库
- Axios - HTTP 客户端
- spark-md5 - MD5 计算

## 启动

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 构建
pnpm build

# 预览
pnpm preview
```

## 功能特性

### 1. 文件上传
- 拖拽上传
- 文件选择
- MD5 计算
- 秒传检测
- 分片上传
- 进度显示

### 2. 断点续传
- 自动检测已上传分片
- 从断点继续上传

### 3. 任务控制
- 暂停上传
- 恢复上传
- 取消上传

### 4. 任务管理
- 查看所有任务
- 实时状态更新
- 进度展示

## 组件说明

### FileUpload 组件
主要上传组件，负责：
- 文件选择和展示
- MD5 计算
- 分片上传
- 进度管理
- 任务控制

### TaskList 组件
任务列表组件，负责：
- 显示所有上传任务
- 展示任务状态和进度
- 刷新任务列表

## 工具函数

### fileUtils.js
- `calculateFileMD5()` - 计算文件 MD5
- `createFileChunks()` - 创建文件分片
- `formatFileSize()` - 格式化文件大小

### upload.js (API)
- `check()` - 秒传检查
- `init()` - 初始化任务
- `uploadChunk()` - 上传分片
- `merge()` - 合并文件
- `pause()` - 暂停任务
- `cancel()` - 取消任务
- `getTaskList()` - 获取任务列表

## 配置

### 代理配置
`vite.config.js` 中配置了 API 代理：
```javascript
proxy: {
  '/api': {
    target: 'http://localhost:3000',
    changeOrigin: true
  }
}
```

### 分片配置
在 `src/utils/fileUtils.js` 中修改：
```javascript
export const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024 // 5MB
```

### 并发配置
在 `src/components/FileUpload.jsx` 中修改：
```javascript
const CONCURRENT_LIMIT = 3 // 并发数
```

