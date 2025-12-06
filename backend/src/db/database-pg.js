const { Pool } = require('pg');

// 创建 PostgreSQL 连接池
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'bigfileupload',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  max: 20, // 最大连接数
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// 测试连接
pool.on('connect', () => {
  console.log('✅ PostgreSQL 数据库连接成功');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL 连接错误:', err);
});

// 转换 SQL 查询中的 ? 占位符为 PostgreSQL 的 $1, $2... 格式
function convertPlaceholders(query) {
  let index = 1;
  return query.replace(/\?/g, () => `$${index++}`);
}

// 包装器对象，提供类似 better-sqlite3 的 API
const db = {
  prepare: (query) => {
    const pgQuery = convertPlaceholders(query);
    return {
      get: async (...params) => {
        try {
          const result = await pool.query(pgQuery, params);
          return result.rows[0] || null;
        } catch (error) {
          console.error('数据库查询错误:', error);
          console.error('SQL:', pgQuery);
          console.error('参数:', params);
          throw error;
        }
      },
      all: async (...params) => {
        try {
          const result = await pool.query(pgQuery, params);
          return result.rows;
        } catch (error) {
          console.error('数据库查询错误:', error);
          console.error('SQL:', pgQuery);
          console.error('参数:', params);
          throw error;
        }
      },
      run: async (...params) => {
        try {
          const result = await pool.query(pgQuery, params);
          return {
            changes: result.rowCount,
            lastInsertRowid: result.rows[0]?.id
          };
        } catch (error) {
          console.error('数据库执行错误:', error);
          console.error('SQL:', pgQuery);
          console.error('参数:', params);
          throw error;
        }
      }
    };
  },
  // 提供原生查询方法
  query: async (query, params) => {
    return pool.query(query, params);
  }
};

// 初始化数据库表
async function initDatabase() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // 1. 创建上传任务表
    await client.query(`
      CREATE TABLE IF NOT EXISTS upload_task_zch_big_file (
        id SERIAL PRIMARY KEY,
        upload_id VARCHAR(100) UNIQUE NOT NULL,
        file_hash VARCHAR(64) NOT NULL,
        file_name VARCHAR(500) NOT NULL,
        file_size BIGINT NOT NULL,
        chunk_size INTEGER NOT NULL,
        total_chunks INTEGER NOT NULL,
        uploaded_chunks INTEGER DEFAULT 0,
        uploader VARCHAR(100),
        status SMALLINT DEFAULT 0,
        storage_type VARCHAR(20) DEFAULT 'local',
        storage_url TEXT,
        local_path TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. 创建分片记录表
    await client.query(`
      CREATE TABLE IF NOT EXISTS upload_chunk_zch_big_file (
        id SERIAL PRIMARY KEY,
        upload_id VARCHAR(100) NOT NULL,
        chunk_index INTEGER NOT NULL,
        chunk_size INTEGER NOT NULL,
        chunk_hash VARCHAR(64),
        status SMALLINT DEFAULT 0,
        local_path TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(upload_id, chunk_index)
      )
    `);

    // 3. 创建文件信息表
    await client.query(`
      CREATE TABLE IF NOT EXISTS file_info_zch_big_file (
        id SERIAL PRIMARY KEY,
        file_hash VARCHAR(64) UNIQUE NOT NULL,
        file_name VARCHAR(500) NOT NULL,
        file_size BIGINT NOT NULL,
        storage_url TEXT,
        storage_type VARCHAR(20) DEFAULT 'local',
        uploader VARCHAR(100),
        status SMALLINT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 4. 创建索引以提升查询性能
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_upload_task_file_hash_zch_big_file 
      ON upload_task_zch_big_file(file_hash)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_upload_task_status_zch_big_file 
      ON upload_task_zch_big_file(status)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_upload_chunk_upload_id_zch_big_file 
      ON upload_chunk_zch_big_file(upload_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_upload_chunk_status_zch_big_file 
      ON upload_chunk_zch_big_file(upload_id, status)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_file_info_hash_zch_big_file 
      ON file_info_zch_big_file(file_hash)
    `);

    // 5. 创建触发器自动更新 updated_at
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS update_upload_task_updated_at_zch_big_file ON upload_task_zch_big_file
    `);

    await client.query(`
      CREATE TRIGGER update_upload_task_updated_at_zch_big_file 
      BEFORE UPDATE ON upload_task_zch_big_file 
      FOR EACH ROW 
      EXECUTE FUNCTION update_updated_at_column()
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS update_upload_chunk_updated_at_zch_big_file ON upload_chunk_zch_big_file
    `);

    await client.query(`
      CREATE TRIGGER update_upload_chunk_updated_at_zch_big_file 
      BEFORE UPDATE ON upload_chunk_zch_big_file 
      FOR EACH ROW 
      EXECUTE FUNCTION update_updated_at_column()
    `);

    await client.query('COMMIT');
    console.log('✅ PostgreSQL 数据库表初始化完成');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ 数据库初始化失败:', error);
    throw error;
  } finally {
    client.release();
  }
}

// 优雅关闭
async function closeDatabase() {
  await pool.end();
  console.log('PostgreSQL 连接池已关闭');
}

module.exports = {
  db,
  pool,
  initDatabase,
  closeDatabase
};

