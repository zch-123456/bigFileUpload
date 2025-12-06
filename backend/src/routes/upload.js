const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/database');

const TEMP_DIR = path.join(__dirname, '../../uploads/temp');
const MERGED_DIR = path.join(__dirname, '../../uploads/merged');

// 配置 multer - 使用内存存储
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 限制单个分片最大10MB
  }
});

// 任务状态枚举
const TaskStatus = {
  WAITING: 0,
  UPLOADING: 1,
  MERGING: 2,
  COMPLETED: 3,
  CANCELED: 4,
  FAILED: 5,
  CHUNK_MERGED: 6,
  PAUSED: 7
};

// 1. 秒传检查
router.post('/check', async (req, res) => {
  try {
    const { fileHash, fileName, fileSize } = req.body;

    if (!fileHash) {
      return res.status(400).json({
        success: false,
        message: '缺少文件哈希值'
      });
    }

    // 检查文件是否已存在
    const fileInfo = await db.prepare('SELECT * FROM file_info_zch_big_file WHERE file_hash = ?').get(fileHash);
    
    if (fileInfo) {
      return res.json({
        success: true,
        data: {
          exists: true,
          file: {
            fileName: fileInfo.file_name,
            fileSize: fileInfo.file_size,
            storageUrl: fileInfo.storage_url
          }
        }
      });
    }

    // 检查是否有未完成的上传任务
    const task = await db.prepare(
      'SELECT * FROM upload_task_zch_big_file WHERE file_hash = ? AND status NOT IN (?, ?)'
    ).get(fileHash, TaskStatus.COMPLETED, TaskStatus.CANCELED);

    if (task) {
      // 获取已上传的分片
      const chunks = await db.prepare(
        'SELECT chunk_index FROM upload_chunk_zch_big_file WHERE upload_id = ? AND status = ?'
      ).all(task.upload_id, 1);

      return res.json({
        success: true,
        data: {
          exists: false,
          uploadId: task.upload_id,
          uploadedChunks: chunks.map(c => c.chunk_index)
        }
      });
    }

    res.json({
      success: true,
      data: {
        exists: false
      }
    });
  } catch (error) {
    console.error('秒传检查错误:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 2. 初始化上传任务
router.post('/init', async (req, res) => {
  try {
    const { fileHash, fileName, fileSize, totalChunks, chunkSize, uploader } = req.body;

    if (!fileHash || !fileName || !totalChunks) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数'
      });
    }

    // 检查是否已有未完成任务
    const existTask = await db.prepare(
      'SELECT * FROM upload_task_zch_big_file WHERE file_hash = ? AND status NOT IN (?, ?)'
    ).get(fileHash, TaskStatus.COMPLETED, TaskStatus.CANCELED);

    if (existTask) {
      const chunks = await db.prepare(
        'SELECT chunk_index FROM upload_chunk_zch_big_file WHERE upload_id = ? AND status = ?'
      ).all(existTask.upload_id, 1);

      return res.json({
        success: true,
        data: {
          uploadId: existTask.upload_id,
          uploadedChunks: chunks.map(c => c.chunk_index)
        }
      });
    }

    // 创建新任务
    const uploadId = uuidv4();
    
    await db.prepare(`
      INSERT INTO upload_task_zch_big_file (
        upload_id, file_hash, file_name, file_size,
        chunk_size, total_chunks, uploader, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(uploadId, fileHash, fileName, fileSize, chunkSize, totalChunks, uploader || 'anonymous', TaskStatus.WAITING);

    res.json({
      success: true,
      data: {
        uploadId,
        uploadedChunks: []
      }
    });
  } catch (error) {
    console.error('初始化任务错误:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 3. 上传分片
router.post('/chunk', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      console.error('[Multer错误]', err);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: '文件分片太大，超过10MB限制'
        });
      }
      return res.status(500).json({
        success: false,
        message: `文件上传错误: ${err.message}`
      });
    }
    next();
  });
}, async (req, res) => {
  const startTime = Date.now();
  try {
    const { uploadId, chunkIndex, chunkSize, chunkHash } = req.body;
    const file = req.file;

    console.log(`[分片上传] 开始处理 uploadId=${uploadId}, chunkIndex=${chunkIndex}, size=${chunkSize}`);

    if (!uploadId || chunkIndex === undefined || !file) {
      console.error('[分片上传] 缺少必要参数', { uploadId, chunkIndex, hasFile: !!file });
      return res.status(400).json({
        success: false,
        message: '缺少必要参数'
      });
    }

    if (!file.buffer) {
      console.error('[分片上传] 文件buffer为空');
      return res.status(400).json({
        success: false,
        message: '文件数据为空'
      });
    }

    // 检查任务状态
    const task = await db.prepare('SELECT * FROM upload_task_zch_big_file WHERE upload_id = ?').get(uploadId);
    
    if (!task) {
      console.error('[分片上传] 任务不存在', uploadId);
      return res.status(404).json({
        success: false,
        message: '任务不存在'
      });
    }

    if ([TaskStatus.COMPLETED, TaskStatus.CANCELED].includes(task.status)) {
      console.error('[分片上传] 任务状态异常', { uploadId, status: task.status });
      return res.status(400).json({
        success: false,
        message: '任务已完成或已取消'
      });
    }

    // 检查分片是否已存在
    const existChunk = await db.prepare(
      'SELECT * FROM upload_chunk_zch_big_file WHERE upload_id = ? AND chunk_index = ?'
    ).get(uploadId, parseInt(chunkIndex));

    if (existChunk && existChunk.status === 1) {
      console.log(`[分片上传] 分片已存在 chunkIndex=${chunkIndex}`);
      return res.json({
        success: true,
        data: {
          uploadId,
          chunkIndex: parseInt(chunkIndex),
          message: '分片已存在'
        }
      });
    }

    // 保存分片到磁盘
    console.log(`[分片上传] 开始写入磁盘 chunkIndex=${chunkIndex}, bufferSize=${file.buffer.length}`);
    const chunkDir = path.join(TEMP_DIR, uploadId);
    fs.ensureDirSync(chunkDir);
    const chunkPath = path.join(chunkDir, `chunk-${chunkIndex}`);
    
    try {
      await fs.writeFile(chunkPath, file.buffer);
      console.log(`[分片上传] 写入磁盘成功 chunkIndex=${chunkIndex}`);
    } catch (writeError) {
      console.error(`[分片上传] 写入磁盘失败 chunkIndex=${chunkIndex}`, writeError);
      throw writeError;
    }

    // 保存分片记录
    console.log(`[分片上传] 保存数据库记录 chunkIndex=${chunkIndex}`);
    if (existChunk) {
      await db.prepare(`
        UPDATE upload_chunk_zch_big_file 
        SET status = 1, chunk_size = ?, local_path = ?, updated_at = CURRENT_TIMESTAMP
        WHERE upload_id = ? AND chunk_index = ?
      `).run(parseInt(chunkSize), chunkPath, uploadId, parseInt(chunkIndex));
    } else {
      await db.prepare(`
        INSERT INTO upload_chunk_zch_big_file (
          upload_id, chunk_index, chunk_size, chunk_hash, status, local_path
        ) VALUES (?, ?, ?, ?, 1, ?)
      `).run(uploadId, parseInt(chunkIndex), parseInt(chunkSize), chunkHash, chunkPath);
    }

    // 更新任务状态
    const uploadedCountResult = await db.prepare(
      'SELECT COUNT(*) as count FROM upload_chunk_zch_big_file WHERE upload_id = ? AND status = ?'
    ).get(uploadId, 1);
    const uploadedCount = parseInt(uploadedCountResult.count);

    await db.prepare(`
      UPDATE upload_task_zch_big_file 
      SET uploaded_chunks = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE upload_id = ?
    `).run(uploadedCount, TaskStatus.UPLOADING, uploadId);

    const duration = Date.now() - startTime;
    console.log(`[分片上传] 完成 chunkIndex=${chunkIndex}, 耗时=${duration}ms, 已上传=${uploadedCount}/${task.total_chunks}`);

    res.json({
      success: true,
      data: {
        uploadId,
        chunkIndex: parseInt(chunkIndex),
        uploadedChunks: uploadedCount,
        totalChunks: task.total_chunks
      }
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[分片上传] 错误 耗时=${duration}ms`, error);
    console.error('错误堆栈:', error.stack);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 4. 合并分片
router.post('/merge', async (req, res) => {
  try {
    const { uploadId, fileHash } = req.body;

    if (!uploadId) {
      return res.status(400).json({
        success: false,
        message: '缺少上传ID'
      });
    }

    // 检查任务
    const task = await db.prepare('SELECT * FROM upload_task_zch_big_file WHERE upload_id = ?').get(uploadId);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: '任务不存在'
      });
    }

    // 检查所有分片是否都已上传
    const uploadedChunksResult = await db.prepare(
      'SELECT COUNT(*) as count FROM upload_chunk_zch_big_file WHERE upload_id = ? AND status = ?'
    ).get(uploadId, 1);
    const uploadedChunks = parseInt(uploadedChunksResult.count);

    if (uploadedChunks !== task.total_chunks) {
      return res.status(400).json({
        success: false,
        message: `分片未完全上传，已上传 ${uploadedChunks}/${task.total_chunks}`
      });
    }

    // 更新任务状态为合并中
    await db.prepare(
      'UPDATE upload_task_zch_big_file SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE upload_id = ?'
    ).run(TaskStatus.MERGING, uploadId);

    // 获取所有分片按顺序
    const chunks = await db.prepare(
      'SELECT * FROM upload_chunk_zch_big_file WHERE upload_id = ? ORDER BY chunk_index ASC'
    ).all(uploadId);

    // 合并文件
    const mergedFileName = `${Date.now()}-${task.file_name}`;
    const mergedFilePath = path.join(MERGED_DIR, mergedFileName);
    const writeStream = fs.createWriteStream(mergedFilePath);

    for (const chunk of chunks) {
      const chunkData = await fs.readFile(chunk.local_path);
      writeStream.write(chunkData);
    }

    writeStream.end();

    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    // 验证文件哈希
    const mergedFileHash = await calculateFileHash(mergedFilePath);
    
    if (fileHash && mergedFileHash !== fileHash) {
      // 哈希不匹配，标记为失败
      await db.prepare(
        'UPDATE upload_task_zch_big_file SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE upload_id = ?'
      ).run(TaskStatus.FAILED, uploadId);

      return res.status(400).json({
        success: false,
        message: '文件校验失败，哈希值不匹配'
      });
    }

    const storageUrl = `/files/${mergedFileName}`;

    // 更新任务状态为完成
    await db.prepare(`
      UPDATE upload_task_zch_big_file 
      SET status = ?, storage_url = ?, local_path = ?, updated_at = CURRENT_TIMESTAMP
      WHERE upload_id = ?
    `).run(TaskStatus.COMPLETED, storageUrl, mergedFilePath, uploadId);

    // 保存到文件信息表
    try {
      await db.prepare(`
        INSERT INTO file_info_zch_big_file (file_hash, file_name, file_size, storage_url, uploader)
        VALUES (?, ?, ?, ?, ?)
      `).run(task.file_hash, task.file_name, task.file_size, storageUrl, task.uploader);
    } catch (e) {
      // 文件可能已存在，忽略
    }

    // 清理临时分片文件
    const tempDir = path.join(TEMP_DIR, uploadId);
    fs.remove(tempDir).catch(err => console.error('清理临时文件失败:', err));

    res.json({
      success: true,
      message: '文件合并成功',
      data: {
        fileName: task.file_name,
        fileSize: task.file_size,
        storageUrl,
        downloadUrl: `http://localhost:${process.env.PORT || 3001}${storageUrl}`
      }
    });
  } catch (error) {
    console.error('合并文件错误:', error);
    
    // 更新任务状态为失败
    if (req.body.uploadId) {
      await db.prepare(
        'UPDATE upload_task_zch_big_file SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE upload_id = ?'
      ).run(TaskStatus.FAILED, req.body.uploadId);
    }

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 5. 暂停任务
router.post('/pause', async (req, res) => {
  try {
    const { uploadId } = req.body;

    if (!uploadId) {
      return res.status(400).json({
        success: false,
        message: '缺少上传ID'
      });
    }

    const task = await db.prepare('SELECT * FROM upload_task_zch_big_file WHERE upload_id = ?').get(uploadId);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: '任务不存在'
      });
    }

    await db.prepare(
      'UPDATE upload_task_zch_big_file SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE upload_id = ?'
    ).run(TaskStatus.PAUSED, uploadId);

    res.json({
      success: true,
      message: '任务已暂停'
    });
  } catch (error) {
    console.error('暂停任务错误:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 6. 取消任务
router.post('/cancel', async (req, res) => {
  try {
    const { uploadId } = req.body;

    if (!uploadId) {
      return res.status(400).json({
        success: false,
        message: '缺少上传ID'
      });
    }

    const task = await db.prepare('SELECT * FROM upload_task_zch_big_file WHERE upload_id = ?').get(uploadId);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: '任务不存在'
      });
    }

    await db.prepare(
      'UPDATE upload_task_zch_big_file SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE upload_id = ?'
    ).run(TaskStatus.CANCELED, uploadId);

    // 清理临时文件
    const tempDir = path.join(TEMP_DIR, uploadId);
    fs.remove(tempDir).catch(err => console.error('清理临时文件失败:', err));

    res.json({
      success: true,
      message: '任务已取消'
    });
  } catch (error) {
    console.error('取消任务错误:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 7. 查询任务列表
router.get('/list', async (req, res) => {
  try {
    const tasks = await db.prepare(`
      SELECT 
        upload_id, file_name, file_size, total_chunks, 
        uploaded_chunks, status, uploader, created_at, updated_at
      FROM upload_task_zch_big_file
      ORDER BY created_at DESC
      LIMIT 100
    `).all();

    const statusMap = {
      0: 'WAITING',
      1: 'UPLOADING',
      2: 'MERGING',
      3: 'COMPLETED',
      4: 'CANCELED',
      5: 'FAILED',
      6: 'CHUNK_MERGED',
      7: 'PAUSED'
    };

    const formattedTasks = tasks.map(task => ({
      ...task,
      statusText: statusMap[task.status],
      progress: task.total_chunks > 0 
        ? Math.floor((task.uploaded_chunks / task.total_chunks) * 100) 
        : 0
    }));

    res.json({
      success: true,
      data: formattedTasks
    });
  } catch (error) {
    console.error('查询任务列表错误:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 辅助函数：计算文件哈希
function calculateFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

module.exports = router;

