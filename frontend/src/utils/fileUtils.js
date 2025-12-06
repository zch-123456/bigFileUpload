import SparkMD5 from 'spark-md5'

// 默认分片大小：5MB
export const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024

/**
 * 计算文件MD5
 */
export const calculateFileMD5 = (file, onProgress) => {
  return new Promise((resolve, reject) => {
    const chunkSize = 5 * 1024 * 1024 // 5MB per chunk for hash calculation
    const chunks = Math.ceil(file.size / chunkSize)
    let currentChunk = 0
    const spark = new SparkMD5.ArrayBuffer()
    const fileReader = new FileReader()

    fileReader.onload = (e) => {
      spark.append(e.target.result)
      currentChunk++

      if (onProgress) {
        onProgress(Math.floor((currentChunk / chunks) * 100))
      }

      if (currentChunk < chunks) {
        loadNext()
      } else {
        const hash = spark.end()
        resolve(hash)
      }
    }

    fileReader.onerror = () => {
      reject(new Error('文件读取失败'))
    }

    const loadNext = () => {
      const start = currentChunk * chunkSize
      const end = Math.min(start + chunkSize, file.size)
      fileReader.readAsArrayBuffer(file.slice(start, end))
    }

    loadNext()
  })
}

/**
 * 将文件切片
 */
export const createFileChunks = (file, chunkSize = DEFAULT_CHUNK_SIZE) => {
  const chunks = []
  let start = 0
  let index = 0

  while (start < file.size) {
    const end = Math.min(start + chunkSize, file.size)
    const chunk = file.slice(start, end)
    
    chunks.push({
      index,
      chunk,
      size: chunk.size,
      start,
      end
    })

    start = end
    index++
  }

  return chunks
}

/**
 * 格式化文件大小
 */
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B'
  
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

