/**
 * 数据迁移脚本：从 JSON 文件迁移到 PostgreSQL
 * 使用方法：node scripts/migrate-json-to-pg.js
 */

require('dotenv').config();
const fs = require('fs-extra');
const path = require('path');
const { Pool } = require('pg');

const jsonFile = path.join(__dirname, '../data/upload.json');

// 创建 PostgreSQL 连接池
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'bigfileupload',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

async function migrate() {
  console.log('开始数据迁移...');
  console.log(`从文件: ${jsonFile}`);
  
  try {
    // 检查 JSON 文件是否存在
    if (!fs.existsSync(jsonFile)) {
      console.log('❌ JSON 数据文件不存在，无需迁移');
      return;
    }

    // 读取 JSON 数据
    const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
    console.log(`📊 发现数据:`);
    console.log(`  - 上传任务: ${data.upload_tasks?.length || 0} 条`);
    console.log(`  - 分片记录: ${data.upload_chunks?.length || 0} 条`);
    console.log(`  - 文件信息: ${data.file_infos?.length || 0} 条`);

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. 迁移上传任务
      console.log('\n📦 迁移上传任务...');
      let taskCount = 0;
      for (const task of data.upload_tasks || []) {
        try {
          await client.query(`
            INSERT INTO upload_task_zch_big_file (
              upload_id, file_hash, file_name, file_size,
              chunk_size, total_chunks, uploaded_chunks, uploader,
              status, storage_type, storage_url, local_path,
              created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            ON CONFLICT (upload_id) DO NOTHING
          `, [
            task.upload_id,
            task.file_hash,
            task.file_name,
            task.file_size,
            task.chunk_size,
            task.total_chunks,
            task.uploaded_chunks || 0,
            task.uploader || 'anonymous',
            task.status || 0,
            task.storage_type || 'local',
            task.storage_url,
            task.local_path,
            task.created_at || new Date().toISOString(),
            task.updated_at || new Date().toISOString()
          ]);
          taskCount++;
        } catch (err) {
          console.warn(`  警告: 跳过任务 ${task.upload_id} - ${err.message}`);
        }
      }
      console.log(`  ✅ 成功迁移 ${taskCount} 条上传任务`);

      // 2. 迁移分片记录
      console.log('\n📦 迁移分片记录...');
      let chunkCount = 0;
      for (const chunk of data.upload_chunks || []) {
        try {
          await client.query(`
            INSERT INTO upload_chunk_zch_big_file (
              upload_id, chunk_index, chunk_size, chunk_hash,
              status, local_path, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (upload_id, chunk_index) DO NOTHING
          `, [
            chunk.upload_id,
            chunk.chunk_index,
            chunk.chunk_size,
            chunk.chunk_hash,
            chunk.status || 0,
            chunk.local_path,
            chunk.created_at || new Date().toISOString(),
            chunk.updated_at || new Date().toISOString()
          ]);
          chunkCount++;
        } catch (err) {
          console.warn(`  警告: 跳过分片 ${chunk.upload_id}/${chunk.chunk_index} - ${err.message}`);
        }
      }
      console.log(`  ✅ 成功迁移 ${chunkCount} 条分片记录`);

      // 3. 迁移文件信息
      console.log('\n📦 迁移文件信息...');
      let fileCount = 0;
      for (const file of data.file_infos || []) {
        try {
          await client.query(`
            INSERT INTO file_info_zch_big_file (
              file_hash, file_name, file_size, storage_url,
              storage_type, uploader, status, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (file_hash) DO NOTHING
          `, [
            file.file_hash,
            file.file_name,
            file.file_size,
            file.storage_url,
            file.storage_type || 'local',
            file.uploader || 'anonymous',
            file.status || 1,
            file.created_at || new Date().toISOString()
          ]);
          fileCount++;
        } catch (err) {
          console.warn(`  警告: 跳过文件 ${file.file_hash} - ${err.message}`);
        }
      }
      console.log(`  ✅ 成功迁移 ${fileCount} 条文件信息`);

      await client.query('COMMIT');
      console.log('\n✅ 数据迁移完成！');
      
      // 备份 JSON 文件
      const backupFile = jsonFile + `.backup.${Date.now()}`;
      fs.copyFileSync(jsonFile, backupFile);
      console.log(`\n📦 原 JSON 文件已备份到: ${backupFile}`);
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('\n❌ 迁移失败:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// 运行迁移
migrate().then(() => {
  console.log('\n迁移任务结束');
  process.exit(0);
});

