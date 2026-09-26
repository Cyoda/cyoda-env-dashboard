import React, { useState } from 'react'
import { Form, Input, Button, Row, Col } from 'antd'
import { UserOutlined, KeyOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import './Login.scss'

export interface LoginFormData {
  username: string
  password: string
}

export interface LoginProps {
  onLogin?: (formData: LoginFormData) => Promise<void>
  loading?: boolean
}

/**
 * Login Component
 * Standard username/password login form
 * 
 * Migrated from Vue: .old_project/packages/cyoda-ui-lib/src/components-library/elements/Login/Login.vue
 */
export const Login: React.FC<LoginProps> = ({ onLogin, loading: externalLoading }) => {
  const [form] = Form.useForm()
  const navigate = useNavigate()
  const [internalLoading, setInternalLoading] = useState(false)
  
  const loading = externalLoading !== undefined ? externalLoading : internalLoading

  const handleSubmit = async (values: LoginFormData) => {
    if (!onLogin) return

    try {
      setInternalLoading(true)
      await onLogin(values)
      navigate('/')
    } catch (error) {
      console.error('Login failed:', error)
      // Error handling should be done by the parent component
    } finally {
      setInternalLoading(false)
    }
  }

  return (
    <Row className="wrap-login-form" gutter={20}>
      <Col span={8} offset={8}>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          autoComplete="off"
        >
          <h3 className="header text-center">Login Form</h3>
          
          <div className="card-body">
            <Form.Item
              name="username"
              rules={[
                { required: true, message: 'Please input Username' }
              ]}
            >
              <Input
                prefix={<UserOutlined />}
                placeholder="Username"
                size="large"
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[
                { required: true, message: 'Please input Password' }
              ]}
            >
              <Input.Password
                prefix={<KeyOutlined />}
                placeholder="Password"
                size="large"
              />
            </Form.Item>
          </div>

          <div className="actions">
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              size="large"
            >
              Login
            </Button>
          </div>
        </Form>
      </Col>
    </Row>
  )
}

