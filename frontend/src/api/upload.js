import axios from 'axios'

const instance = axios.create({
  baseURL: '/api',
  timeout: 60000
})

// 请求拦截器
instance.interceptors.request.use(
  config => config,
  error => Promise.reject(error)
)

// 响应拦截器
instance.interceptors.response.use(
  response => response.data,
  error => {
    const message = error.response?.data?.message || error.message || '请求失败'
    return Promise.reject(new Error(message))
  }
)

export const uploadAPI = {
  /**
   * 检查文件是否已上传（秒传）
   */
  check: (data) => instance.post('/upload/check', data),

  /**
   * 初始化上传任务
   */
  init: (data) => instance.post('/upload/init', data),

  /**
   * 上传分片
   */
  uploadChunk: (formData, onProgress) => {
    return instance.post('/upload/chunk', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress
    })
  },

  /**
   * 合并文件
   */
  merge: (data) => instance.post('/upload/merge', data),

  /**
   * 暂停任务
   */
  pause: (data) => instance.post('/upload/pause', data),

  /**
   * 取消任务
   */
  cancel: (data) => instance.post('/upload/cancel', data),

  /**
   * 获取任务列表
   */
  getTaskList: () => instance.get('/upload/list')
}

export default instance

