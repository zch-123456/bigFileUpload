// Hash Worker 池管理器，用于并行计算文件 hash
import SparkMD5 from 'spark-md5'

// 获取 CPU 核心数，用于确定 Worker 数量
const CPU_CORES = navigator.hardwareConcurrency || 4
const MAX_WORKERS = Math.min(CPU_CORES, 8) // 最多使用 8 个 Worker

/**
 * 使用 Web Worker 池并行计算文件 MD5
 * @param {File} file - 要计算 hash 的文件
 * @param {Function} onProgress - 进度回调函数
 * @param {number} chunkSize - 每个分片的大小（默认 5MB）
 * @returns {Promise<string>} - 文件的 MD5 hash
 */
export const calculateFileMD5WithWorkers = (file, onProgress, chunkSize = 5 * 1024 * 1024) => {
  return new Promise((resolve, reject) => {
    const totalChunks = Math.ceil(file.size / chunkSize)
    const workers = []
    const workerResults = new Array(totalChunks)
    let completedChunks = 0
    let hasError = false

    // 创建 Worker 池
    const workerCount = Math.min(MAX_WORKERS, totalChunks)
    
    // 创建内联 Worker（使用 importScripts 加载 SparkMD5）
    const createWorker = () => {
      // 使用内联 Worker，通过 importScripts 加载 SparkMD5
      // 注意：需要将 SparkMD5 复制到 public 目录或使用 CDN
      const workerCode = `
        // 使用 CDN 加载 SparkMD5（UMD 版本，支持 importScripts）
        importScripts('https://cdn.jsdelivr.net/npm/spark-md5@3.0.2/spark-md5.min.js');
        
        self.onmessage = function(e) {
          const { chunk, index } = e.data;
          
          try {
            // 计算这个分片的 hash
            const spark = new SparkMD5.ArrayBuffer();
            spark.append(chunk);
            const hash = spark.end();
            
            // 返回结果
            self.postMessage({
              success: true,
              index,
              hash,
              size: chunk.byteLength
            });
          } catch (error) {
            self.postMessage({
              success: false,
              index,
              error: error.message
            });
          }
        };
      `
      
      const blob = new Blob([workerCode], { type: 'application/javascript' })
      const workerUrl = URL.createObjectURL(blob)
      const worker = new Worker(workerUrl)
      
      // 存储 workerUrl 以便后续清理
      worker._workerUrl = workerUrl
      
      return worker
    }
    
    for (let i = 0; i < workerCount; i++) {
      const worker = createWorker()
      
      worker.onmessage = (e) => {
        const { success, index, hash, error } = e.data
        
        if (!success) {
          if (!hasError) {
            hasError = true
            cleanup()
            reject(new Error(`分片 ${index} 计算失败: ${error}`))
          }
          return
        }

        workerResults[index] = { hash, index }
        completedChunks++

        // 更新进度
        if (onProgress) {
          onProgress(Math.floor((completedChunks / totalChunks) * 100))
        }

        // 如果所有分片都计算完成，合并结果
        if (completedChunks === totalChunks && !hasError) {
          const finalHash = mergeHashes(workerResults)
          cleanup()
          resolve(finalHash)
        } else {
          // 继续处理下一个分片
          processNextChunk(worker)
        }
      }

      worker.onerror = (error) => {
        if (!hasError) {
          hasError = true
          cleanup()
          reject(new Error(`Worker 错误: ${error.message}`))
        }
      }

      workers.push(worker)
    }

    let currentChunkIndex = 0

    // 处理下一个分片
    const processNextChunk = (worker) => {
      if (currentChunkIndex >= totalChunks || hasError) {
        return
      }

      const start = currentChunkIndex * chunkSize
      const end = Math.min(start + chunkSize, file.size)
      const chunk = file.slice(start, end)

      // 读取分片数据
      const reader = new FileReader()
      reader.onload = (e) => {
        worker.postMessage({
          chunk: e.target.result,
          index: currentChunkIndex
        })
        currentChunkIndex++
      }
      reader.onerror = () => {
        if (!hasError) {
          hasError = true
          cleanup()
          reject(new Error('文件读取失败'))
        }
      }
      reader.readAsArrayBuffer(chunk)
    }

    // 清理所有 Worker
    const cleanup = () => {
      workers.forEach(worker => {
        worker.terminate()
        // 清理 Worker URL
        if (worker._workerUrl) {
          try {
            URL.revokeObjectURL(worker._workerUrl)
          } catch (err) {
            // 忽略清理错误
          }
        }
      })
    }

    // 启动所有 Worker 处理分片
    workers.forEach(worker => {
      processNextChunk(worker)
    })
  })
}

/**
 * 合并所有分片的 hash 结果
 * @param {Array} results - 分片 hash 结果数组
 * @returns {string} - 最终的 MD5 hash
 */
function mergeHashes(results) {
  // 按索引排序
  const sortedResults = results.sort((a, b) => a.index - b.index)
  
  // 合并所有分片的 hash
  const spark = new SparkMD5()
  sortedResults.forEach(result => {
    spark.append(result.hash)
  })
  
  return spark.end()
}

