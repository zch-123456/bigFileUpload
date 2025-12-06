/**
 * PostgreSQL 连接测试脚本
 * 使用方法：node scripts/test-pg-connection.js
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'bigfileupload',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

async function testConnection() {
  console.log('🔍 测试 PostgreSQL 连接...\n');
  console.log('连接配置:');
  console.log(`  Host: ${process.env.DB_HOST || 'localhost'}`);
  console.log(`  Port: ${process.env.DB_PORT || 5432}`);
  console.log(`  Database: ${process.env.DB_NAME || 'bigfileupload'}`);
  console.log(`  User: ${process.env.DB_USER || 'postgres'}`);
  console.log('');

  try {
    // 测试连接
    const client = await pool.connect();
    console.log('✅ 数据库连接成功！\n');

    // 获取 PostgreSQL 版本
    const versionResult = await client.query('SELECT version()');
    console.log('PostgreSQL 版本:');
    console.log(`  ${versionResult.rows[0].version}\n`);

    // 检查数据库大小
    const sizeResult = await client.query(`
      SELECT pg_size_pretty(pg_database_size($1)) as size
    `, [process.env.DB_NAME || 'bigfileupload']);
    console.log('数据库大小:');
    console.log(`  ${sizeResult.rows[0].size}\n`);

    // 检查表是否存在
    const tablesResult = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    if (tablesResult.rows.length > 0) {
      console.log('已存在的表:');
      tablesResult.rows.forEach(row => {
        console.log(`  - ${row.tablename}`);
      });
      console.log('');

      // 统计每个表的记录数
      console.log('表记录统计:');
      for (const row of tablesResult.rows) {
        const countResult = await client.query(`SELECT COUNT(*) as count FROM ${row.tablename}`);
        console.log(`  ${row.tablename}: ${countResult.rows[0].count} 条`);
      }
      console.log('');
    } else {
      console.log('⚠️  数据库中还没有表，请先启动服务以初始化表结构\n');
    }

    // 测试写入权限
    try {
      await client.query('BEGIN');
      await client.query('CREATE TEMP TABLE test_write (id INT)');
      await client.query('DROP TABLE test_write');
      await client.query('COMMIT');
      console.log('✅ 数据库写入权限测试通过\n');
    } catch (err) {
      await client.query('ROLLBACK');
      console.log('❌ 数据库写入权限测试失败:', err.message, '\n');
    }

    client.release();
    console.log('✅ 所有测试通过！');

  } catch (error) {
    console.error('❌ 连接失败:', error.message);
    console.error('\n请检查:');
    console.error('  1. PostgreSQL 服务是否运行');
    console.error('  2. .env 文件配置是否正确');
    console.error('  3. 数据库是否已创建');
    console.error('  4. 用户名和密码是否正确');
    console.error('  5. 防火墙是否允许连接\n');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

testConnection();

