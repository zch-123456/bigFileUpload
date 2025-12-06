const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

// 目标文件大小：2GB
const TARGET_SIZE = 2 * 1024 * 1024 * 1024; // 2GB in bytes
const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB chunks for faster writing
const OUTPUT_FILE = path.join(__dirname, 'complex-video-2gb.mp4');

console.log('开始生成2GB复杂视频文件...');
console.log(`目标文件: ${OUTPUT_FILE}`);
console.log(`目标大小: ${(TARGET_SIZE / (1024 * 1024 * 1024)).toFixed(2)} GB`);

// 创建写入流
const writeStream = fs.createWriteStream(OUTPUT_FILE);
let bytesWritten = 0;
let chunkCount = 0;

// 生成复杂数据块的函数
function generateComplexChunk(seed, chunkIndex) {
  const buffer = Buffer.alloc(CHUNK_SIZE);
  let offset = 0;
  
  // 1. 写入模拟的MP4文件头（包含ftyp, moov等box结构）
  if (chunkIndex === 0) {
    // ftyp box
    const ftyp = Buffer.from([
      0x00, 0x00, 0x00, 0x20, // box size
      0x66, 0x74, 0x79, 0x70, // 'ftyp'
      0x69, 0x73, 0x6F, 0x6D, // major brand 'isom'
      0x00, 0x00, 0x02, 0x00, // minor version
      0x69, 0x73, 0x6F, 0x6D, // compatible brands
      0x69, 0x73, 0x6F, 0x32,
      0x6D, 0x70, 0x34, 0x31,
      0x6D, 0x70, 0x34, 0x32
    ]);
    ftyp.copy(buffer, offset);
    offset += ftyp.length;
  }
  
  // 2. 使用多种算法生成复杂数据模式（高性能版本）
  // 使用更大的模式块以减少哈希计算次数，但保持数据复杂性
  const patternBlockSize = 256 * 1024; // 256KB 模式块
  let patternOffset = 0;
  
  while (offset < CHUNK_SIZE) {
    const remaining = CHUNK_SIZE - offset;
    const currentBlockSize = Math.min(patternBlockSize, remaining);
    
    // 为每个块生成复杂的基础数据
    const blockSeed = crypto.createHash('sha256')
      .update(seed)
      .update(`${chunkIndex}-${patternOffset}`)
      .digest();
    
    // 生成多种哈希模式并混合
    const patterns = [];
    
    // 快速生成多个哈希值
    for (let i = 0; i < 8; i++) {
      patterns.push(
        crypto.createHash('sha256')
          .update(blockSeed)
          .update(`pattern-${i}`)
          .digest()
      );
    }
    
    // 添加数学函数生成的模式
    const mathPattern = Buffer.alloc(Math.min(8192, currentBlockSize));
    for (let i = 0; i < mathPattern.length; i++) {
      const x = chunkIndex * CHUNK_SIZE + patternOffset + i;
      mathPattern[i] = Math.floor(
        (Math.sin(x * 0.1) * 127 + 128) +
        (Math.cos(x * 0.07) * 63 + 64) +
        (Math.sin(x * 0.03) * 31 + 32) +
        (Math.sin(x * 0.13) * 15 + 16) +
        (Math.cos(x * 0.19) * 7 + 8)
      ) % 256;
    }
    patterns.push(mathPattern);
    
    // 合并所有模式
    let combinedPattern = Buffer.concat(patterns);
    
    // 如果合并后的模式不够大，重复填充
    while (combinedPattern.length < currentBlockSize) {
      const extendHash = crypto.createHash('sha256')
        .update(combinedPattern.slice(-64)) // 使用最后64字节作为种子
        .update(`${patternOffset}-extend`)
        .digest();
      combinedPattern = Buffer.concat([combinedPattern, extendHash]);
    }
    
    // 复制到缓冲区
    combinedPattern.copy(buffer, offset, 0, currentBlockSize);
    offset += currentBlockSize;
    patternOffset += currentBlockSize;
  }
  
  return buffer;
}

// 写入进度显示
function writeProgress(bytesWritten, totalSize) {
  const percent = ((bytesWritten / totalSize) * 100).toFixed(2);
  const writtenMB = (bytesWritten / (1024 * 1024)).toFixed(2);
  const totalMB = (totalSize / (1024 * 1024)).toFixed(2);
  process.stdout.write(`\r进度: ${percent}% (${writtenMB} MB / ${totalMB} MB)`);
}

// 生成文件的异步函数
async function generateFile() {
  const seed = crypto.randomBytes(32);
  const startTime = Date.now();
  
  return new Promise((resolve, reject) => {
    writeStream.on('error', reject);
    
    function writeChunk() {
      if (bytesWritten >= TARGET_SIZE) {
        writeStream.end();
        return;
      }
      
      const remaining = TARGET_SIZE - bytesWritten;
      const currentChunkSize = Math.min(CHUNK_SIZE, remaining);
      
      // 生成复杂数据块
      const chunk = generateComplexChunk(seed, chunkCount);
      
      // 如果最后一块，只写入需要的部分
      const chunkToWrite = currentChunkSize < CHUNK_SIZE 
        ? chunk.slice(0, currentChunkSize)
        : chunk;
      
      if (!writeStream.write(chunkToWrite)) {
        writeStream.once('drain', writeChunk);
      } else {
        bytesWritten += chunkToWrite.length;
        chunkCount++;
        writeProgress(bytesWritten, TARGET_SIZE);
        
        // 继续写入下一块
        setImmediate(writeChunk);
      }
    }
    
    writeStream.on('finish', () => {
      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);
      console.log('\n\n文件生成完成!');
      console.log(`总耗时: ${duration} 秒`);
      console.log(`文件大小: ${(bytesWritten / (1024 * 1024 * 1024)).toFixed(2)} GB`);
      console.log(`文件路径: ${OUTPUT_FILE}`);
      resolve();
    });
    
    // 开始写入
    writeChunk();
  });
}

// 执行生成
generateFile()
  .then(() => {
    console.log('\n✅ 成功生成复杂视频文件!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 生成文件时出错:', error);
    process.exit(1);
  });

