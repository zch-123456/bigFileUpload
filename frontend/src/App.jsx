import { useState } from 'react'
import { Layout, Tabs, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import FileUpload from './components/FileUpload'
import TaskList from './components/TaskList'
import './App.css'

const { Header, Content } = Layout

function App() {
  const [activeKey, setActiveKey] = useState('upload')

  const items = [
    {
      key: 'upload',
      label: '文件上传',
      children: <FileUpload />
    },
    {
      key: 'tasks',
      label: '任务列表',
      children: <TaskList />
    }
  ]

  return (
    <ConfigProvider locale={zhCN}>
      <Layout style={{ minHeight: '100vh' }}>
        <Header style={{ 
          background: '#fff', 
          padding: '0 24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <h1 style={{ margin: 0, lineHeight: '64px', fontSize: '24px' }}>
            📦 大文件分片上传系统
          </h1>
        </Header>
        <Content style={{ padding: '24px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
          <Tabs 
            activeKey={activeKey} 
            onChange={setActiveKey} 
            items={items}
            size="large"
          />
        </Content>
      </Layout>
    </ConfigProvider>
  )
}

export default App

