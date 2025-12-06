import { useState, useRef } from 'react'
import { 
  Upload, Button, Progress, Card, Space, message, 
  Statistic, Row, Col, Alert, Tag 
} from 'antd'
import { 
  UploadOutlined, PauseOutlined, PlayCircleOutlined,
  CloseCircleOutlined, CheckCircleOutlined 
} from '@ant-design/icons'
import { uploadAPI } from '../api/upload'
import { 
  calculateFileMD5,
  calculateFileMD5Fast, 
  createFileChunks, 
  formatFileSize,
  DEFAULT_CHUNK_SIZE 
} from '../utils/fileUtils'

const { Dragger } = Upload

// 并发上传数量
const CONCURRENT_LIMIT = 3

const FileUpload = () => {
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState('idle') // idle, hashing, uploading, paused, merging, completed, error
  const [hashProgress, setHashProgress] = useState(0)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadedChunks, setUploadedChunks] = useState(new Set())
  const [uploadInfo, setUploadInfo] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [hashTime, setHashTime] = useState(null) // 存储hash计算耗时（毫秒）

  const uploadIdRef = useRef(null)
  const fileHashRef = useRef(null)
  const chunksRef = useRef([])
  const abortControllersRef = useRef([])
  const isPausedRef = useRef(false)

  // 选择文件
  const handleFileSelect = (file) => {
    console.log('选择的文件:', file)
    
    if (file.size === 0) {
      message.error('不能上传空文件')
      return false
    }

    setFile(file)
    setStatus('idle')
    setHashProgress(0)
    setUploadProgress(0)
    setUploadedChunks(new Set())
    setUploadInfo(null)
    setErrorMessage('')
    setHashTime(null)
    uploadIdRef.current = null
    fileHashRef.current = null
    
    message.success(`已选择文件: ${file.name}`)

    return false
  }

  // 开始上传
  const handleStartUpload = async () => {
    if (!file) {
      message.warning('请先选择文件')
      return
    }

    try {
      isPausedRef.current = false
      
      // 1. 计算文件哈希
      setStatus('hashing')
      message.info('正在计算文件哈希...')
      
      // 记录hash计算开始时间
      const hashStartTime = performance.now()
      const useWorker = file.size > 50 * 1024 * 1024 // 大于50MB使用Worker加速
      console.log(`[Hash计算] 开始计算文件哈希，文件大小: ${formatFileSize(file.size)}，使用Worker: ${useWorker}`)
      
      // 根据文件大小选择计算方法：大文件使用Worker并行计算
      const hash = await (useWorker 
        ? calculateFileMD5Fast(file, (progress) => {
            setHashProgress(progress)
          })
        : calculateFileMD5(file, (progress) => {
            setHashProgress(progress)
          }))
      
      // 记录hash计算结束时间并计算耗时
      const hashEndTime = performance.now()
      const hashDuration = hashEndTime - hashStartTime
      setHashTime(hashDuration)
      
      fileHashRef.current = hash
      console.log(`[Hash计算] 完成，耗时: ${hashDuration.toFixed(2)}ms (${(hashDuration / 1000).toFixed(2)}秒)`)
      console.log(`[Hash计算] 文件哈希: ${hash}`)
      console.log(`[Hash计算] 计算速度: ${(file.size / hashDuration * 1000 / 1024 / 1024).toFixed(2)} MB/s`)

      // 2. 检查文件是否已存在（秒传）
      const checkResult = await uploadAPI.check({
        fileHash: hash,
        fileName: file.name,
        fileSize: file.size
      })

      if (checkResult.data.exists) {
        message.success('文件已存在，秒传成功！')
        setStatus('completed')
        setUploadProgress(100)
        setUploadInfo(checkResult.data.file)
        return
      }

      // 3. 创建分片
      const chunks = createFileChunks(file, DEFAULT_CHUNK_SIZE)
      chunksRef.current = chunks
      console.log(`文件分为 ${chunks.length} 个分片`)

      // 4. 初始化上传任务
      let uploadId = checkResult.data.uploadId
      let alreadyUploaded = new Set(checkResult.data.uploadedChunks || [])

      if (!uploadId) {
        const initResult = await uploadAPI.init({
          fileHash: hash,
          fileName: file.name,
          fileSize: file.size,
          totalChunks: chunks.length,
          chunkSize: DEFAULT_CHUNK_SIZE,
          uploader: 'user'
        })

        uploadId = initResult.data.uploadId
        alreadyUploaded = new Set(initResult.data.uploadedChunks || [])
      }

      uploadIdRef.current = uploadId
      setUploadedChunks(alreadyUploaded)

      if (alreadyUploaded.size > 0) {
        message.info(`检测到断点，已上传 ${alreadyUploaded.size}/${chunks.length} 个分片`)
        setUploadProgress(Math.floor((alreadyUploaded.size / chunks.length) * 100))
      }

      // 5. 上传分片
      setStatus('uploading')
      await uploadChunksWithConcurrency(chunks, uploadId, alreadyUploaded)

    } catch (error) {
      console.error('上传错误:', error)
      setStatus('error')
      setErrorMessage(error.message)
      message.error(error.message)
    }
  }

  // 并发上传分片
  const uploadChunksWithConcurrency = async (chunks, uploadId, alreadyUploaded) => {
    const pendingChunks = chunks.filter(c => !alreadyUploaded.has(c.index))
    const total = chunks.length
    let uploaded = alreadyUploaded.size

    const uploadQueue = [...pendingChunks]
    const executing = []

    const uploadChunk = async (chunkInfo) => {
      if (isPausedRef.current) return

      const formData = new FormData()
      formData.append('file', chunkInfo.chunk)
      formData.append('uploadId', uploadId)
      formData.append('chunkIndex', chunkInfo.index)
      formData.append('chunkSize', chunkInfo.size)

      try {
        await uploadAPI.uploadChunk(formData)
        
        uploaded++
        setUploadedChunks(prev => new Set([...prev, chunkInfo.index]))
        setUploadProgress(Math.floor((uploaded / total) * 100))

        console.log(`分片 ${chunkInfo.index + 1}/${total} 上传成功`)
      } catch (error) {
        console.error(`分片 ${chunkInfo.index} 上传失败:`, error)
        throw error
      }
    }

    // 并发控制
    while (uploadQueue.length > 0) {
      if (isPausedRef.current) {
        break
      }

      while (executing.length < CONCURRENT_LIMIT && uploadQueue.length > 0) {
        const chunkInfo = uploadQueue.shift()
        const promise = uploadChunk(chunkInfo).then(() => {
          executing.splice(executing.indexOf(promise), 1)
        })
        executing.push(promise)
      }

      if (executing.length > 0) {
        await Promise.race(executing)
      }
    }

    // 等待所有正在执行的上传完成
    await Promise.all(executing)

    if (isPausedRef.current) {
      setStatus('paused')
      message.info('上传已暂停')
      return
    }

    // 6. 合并文件
    setStatus('merging')
    message.info('正在合并文件...')

    const mergeResult = await uploadAPI.merge({
      uploadId,
      fileHash: fileHashRef.current
    })

    setStatus('completed')
    setUploadProgress(100)
    setUploadInfo(mergeResult.data)
    message.success('文件上传成功！')
  }

  // 暂停上传
  const handlePause = () => {
    isPausedRef.current = true
    setStatus('paused')
    message.info('正在暂停...')
  }

  // 继续上传
  const handleResume = async () => {
    if (!uploadIdRef.current || !chunksRef.current.length) {
      message.error('没有可恢复的任务')
      return
    }

    try {
      isPausedRef.current = false
      setStatus('uploading')
      await uploadChunksWithConcurrency(
        chunksRef.current, 
        uploadIdRef.current, 
        uploadedChunks
      )
    } catch (error) {
      console.error('恢复上传错误:', error)
      setStatus('error')
      setErrorMessage(error.message)
      message.error(error.message)
    }
  }

  // 取消上传
  const handleCancel = async () => {
    if (!uploadIdRef.current) return

    try {
      await uploadAPI.cancel({ uploadId: uploadIdRef.current })
      setStatus('idle')
      setFile(null)
      setUploadProgress(0)
      setUploadedChunks(new Set())
      message.success('已取消上传')
    } catch (error) {
      message.error(error.message)
    }
  }

  // 重新上传
  const handleReset = () => {
    setFile(null)
    setStatus('idle')
    setHashProgress(0)
    setUploadProgress(0)
    setUploadedChunks(new Set())
    setUploadInfo(null)
    setErrorMessage('')
    setHashTime(null)
    uploadIdRef.current = null
    fileHashRef.current = null
    chunksRef.current = []
  }

  const getStatusTag = () => {
    const statusMap = {
      idle: { color: 'default', text: '待上传' },
      hashing: { color: 'processing', text: '计算哈希中' },
      uploading: { color: 'processing', text: '上传中' },
      paused: { color: 'warning', text: '已暂停' },
      merging: { color: 'processing', text: '合并中' },
      completed: { color: 'success', text: '上传完成' },
      error: { color: 'error', text: '上传失败' }
    }
    const { color, text } = statusMap[status] || statusMap.idle
    return <Tag color={color}>{text}</Tag>
  }

  return (
    <Card>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* 文件选择 */}
        <Dragger
          beforeUpload={handleFileSelect}
          showUploadList={false}
          disabled={status === 'uploading' || status === 'hashing' || status === 'merging'}
        >
          <p className="ant-upload-drag-icon">
            <UploadOutlined style={{ fontSize: 48, color: '#1890ff' }} />
          </p>
          <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
          <p className="ant-upload-hint">
            支持大文件上传，自动分片、断点续传、秒传检测
          </p>
        </Dragger>

        {/* 文件信息 */}
        {file && (
          <Card size="small" type="inner">
            <Row gutter={16}>
              <Col span={6}>
                <Statistic title="文件名" value={file.name} valueStyle={{ fontSize: 14 }} />
              </Col>
              <Col span={6}>
                <Statistic title="文件大小" value={formatFileSize(file.size)} />
              </Col>
              <Col span={6}>
                <Statistic 
                  title="分片数量" 
                  value={chunksRef.current.length || Math.ceil(file.size / DEFAULT_CHUNK_SIZE)} 
                />
              </Col>
              <Col span={6}>
                <Statistic title="状态" value="" suffix={getStatusTag()} />
              </Col>
            </Row>
          </Card>
        )}

        {/* 错误信息 */}
        {errorMessage && (
          <Alert message="上传失败" description={errorMessage} type="error" showIcon />
        )}

        {/* 哈希计算进度 */}
        {status === 'hashing' && (
          <div>
            <div style={{ marginBottom: 8 }}>
              <span>计算文件哈希: {hashProgress}%</span>
            </div>
            <Progress percent={hashProgress} status="active" />
          </div>
        )}

        {/* Hash计算耗时显示 */}
        {hashTime !== null && (
          <Alert
            message="Hash计算完成"
            description={
              <div>
                <p>计算耗时: <strong>{hashTime.toFixed(2)}ms</strong> ({((hashTime) / 1000).toFixed(2)}秒)</p>
                {file && (
                  <p>
                    计算速度: <strong>{((file.size / hashTime) * 1000 / 1024 / 1024).toFixed(2)} MB/s</strong>
                  </p>
                )}
              </div>
            }
            type="info"
            showIcon
            style={{ marginTop: 16 }}
          />
        )}

        {/* 上传进度 */}
        {['uploading', 'paused', 'merging', 'completed'].includes(status) && (
          <div>
            <div style={{ marginBottom: 8 }}>
              <span>
                上传进度: {uploadProgress}% 
                {chunksRef.current.length > 0 && 
                  ` (${uploadedChunks.size}/${chunksRef.current.length} 分片)`
                }
              </span>
            </div>
            <Progress 
              percent={uploadProgress} 
              status={
                status === 'completed' ? 'success' : 
                status === 'paused' ? 'exception' : 
                'active'
              } 
            />
          </div>
        )}

        {/* 上传完成信息 */}
        {status === 'completed' && uploadInfo && (
          <Alert
            message="上传成功！"
            description={
              <div>
                <p>文件名: {uploadInfo.fileName}</p>
                <p>大小: {formatFileSize(uploadInfo.fileSize)}</p>
                <p>
                  下载链接: 
                  <a href={uploadInfo.downloadUrl} target="_blank" rel="noopener noreferrer">
                    {uploadInfo.downloadUrl}
                  </a>
                </p>
              </div>
            }
            type="success"
            showIcon
            icon={<CheckCircleOutlined />}
          />
        )}

        {/* 操作按钮 */}
        <Space>
          {status === 'idle' && file && (
            <Button type="primary" icon={<UploadOutlined />} onClick={handleStartUpload}>
              开始上传
            </Button>
          )}
          
          {status === 'uploading' && (
            <>
              <Button icon={<PauseOutlined />} onClick={handlePause}>
                暂停
              </Button>
              <Button danger icon={<CloseCircleOutlined />} onClick={handleCancel}>
                取消
              </Button>
            </>
          )}

          {status === 'paused' && (
            <>
              <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleResume}>
                继续
              </Button>
              <Button danger icon={<CloseCircleOutlined />} onClick={handleCancel}>
                取消
              </Button>
            </>
          )}

          {(status === 'completed' || status === 'error') && (
            <Button onClick={handleReset}>
              重新上传
            </Button>
          )}
        </Space>
      </Space>
    </Card>
  )
}

export default FileUpload

