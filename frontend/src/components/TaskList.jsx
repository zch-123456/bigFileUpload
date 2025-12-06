import { useState, useEffect } from 'react'
import { Table, Tag, Button, message, Card, Space } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { uploadAPI } from '../api/upload'
import { formatFileSize } from '../utils/fileUtils'

const TaskList = () => {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchTasks = async () => {
    setLoading(true)
    try {
      const result = await uploadAPI.getTaskList()
      setTasks(result.data || [])
    } catch (error) {
      message.error('获取任务列表失败: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTasks()
  }, [])

  const getStatusTag = (status) => {
    const statusMap = {
      'WAITING': { color: 'default', text: '待上传' },
      'UPLOADING': { color: 'processing', text: '上传中' },
      'MERGING': { color: 'processing', text: '合并中' },
      'COMPLETED': { color: 'success', text: '已完成' },
      'CANCELED': { color: 'default', text: '已取消' },
      'FAILED': { color: 'error', text: '失败' },
      'CHUNK_MERGED': { color: 'success', text: '已合并' },
      'PAUSED': { color: 'warning', text: '已暂停' }
    }
    const { color, text } = statusMap[status] || { color: 'default', text: status }
    return <Tag color={color}>{text}</Tag>
  }

  const columns = [
    {
      title: '文件名',
      dataIndex: 'file_name',
      key: 'file_name',
      ellipsis: true,
      width: 250
    },
    {
      title: '文件大小',
      dataIndex: 'file_size',
      key: 'file_size',
      render: (size) => formatFileSize(size),
      width: 120
    },
    {
      title: '进度',
      key: 'progress',
      render: (_, record) => {
        const percent = record.progress || 0
        return (
          <div>
            <div style={{ marginBottom: 4 }}>
              {percent}% ({record.uploaded_chunks}/{record.total_chunks})
            </div>
            <div style={{ 
              height: 6, 
              background: '#f0f0f0', 
              borderRadius: 3,
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${percent}%`,
                height: '100%',
                background: record.statusText === 'COMPLETED' ? '#52c41a' : '#1890ff',
                transition: 'width 0.3s'
              }} />
            </div>
          </div>
        )
      },
      width: 180
    },
    {
      title: '状态',
      dataIndex: 'statusText',
      key: 'status',
      render: (status) => getStatusTag(status),
      width: 100
    },
    {
      title: '上传人',
      dataIndex: 'uploader',
      key: 'uploader',
      width: 100
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (time) => new Date(time).toLocaleString('zh-CN'),
      width: 180
    }
  ]

  return (
    <Card>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>上传任务列表</h3>
          <Button 
            icon={<ReloadOutlined />} 
            onClick={fetchTasks}
            loading={loading}
          >
            刷新
          </Button>
        </div>

        <Table
          columns={columns}
          dataSource={tasks}
          rowKey="upload_id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条记录`
          }}
        />
      </Space>
    </Card>
  )
}

export default TaskList

