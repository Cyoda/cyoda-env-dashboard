import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '../../test-utils'
import userEvent from '@testing-library/user-event'
import { Login } from './Login'

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate
  }
})

describe('Login', () => {
  const renderLogin = (props = {}) => {
    return render(<Login {...props} />)
  }

  it('renders login form with title', () => {
    renderLogin()
    expect(screen.getByText('Login Form')).toBeInTheDocument()
  })

  it('renders username and password fields', () => {
    renderLogin()
    expect(screen.getByPlaceholderText('Username')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument()
  })

  it('renders login button', () => {
    renderLogin()
    expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument()
  })

  it('shows validation errors for empty fields', async () => {
    const user = userEvent.setup({ delay: null })
    renderLogin()

    const loginButton = screen.getByRole('button', { name: /login/i })
    await user.click(loginButton)

    await waitFor(() => {
      expect(screen.getByText('Please input Username')).toBeInTheDocument()
      expect(screen.getByText('Please input Password')).toBeInTheDocument()
    })
  })

  it('calls onLogin with form data when submitted', async () => {
    const user = userEvent.setup({ delay: null })
    const mockOnLogin = vi.fn().mockResolvedValue(undefined)
    
    renderLogin({ onLogin: mockOnLogin })

    const usernameInput = screen.getByPlaceholderText('Username')
    const passwordInput = screen.getByPlaceholderText('Password')
    const loginButton = screen.getByRole('button', { name: /login/i })

    await user.type(usernameInput, 'testuser')
    await user.type(passwordInput, 'testpass123')
    await user.click(loginButton)

    await waitFor(() => {
      expect(mockOnLogin).toHaveBeenCalledWith({
        username: 'testuser',
        password: 'testpass123'
      })
    })
  })

  it('navigates to home after successful login', async () => {
    const user = userEvent.setup({ delay: null })
    const mockOnLogin = vi.fn().mockResolvedValue(undefined)
    
    renderLogin({ onLogin: mockOnLogin })

    const usernameInput = screen.getByPlaceholderText('Username')
    const passwordInput = screen.getByPlaceholderText('Password')
    const loginButton = screen.getByRole('button', { name: /login/i })

    await user.type(usernameInput, 'testuser')
    await user.type(passwordInput, 'testpass123')
    await user.click(loginButton)

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/')
    })
  })

  it('shows loading state when loading prop is true', () => {
    renderLogin({ loading: true })
    const loginButton = screen.getByRole('button', { name: /login/i })
    expect(loginButton).toHaveClass('ant-btn-loading')
  })

  it('handles login errors gracefully', async () => {
    const user = userEvent.setup({ delay: null })
    const mockOnLogin = vi.fn().mockRejectedValue(new Error('Login failed'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    
    renderLogin({ onLogin: mockOnLogin })

    const usernameInput = screen.getByPlaceholderText('Username')
    const passwordInput = screen.getByPlaceholderText('Password')
    const loginButton = screen.getByRole('button', { name: /login/i })

    await user.type(usernameInput, 'testuser')
    await user.type(passwordInput, 'wrongpass')
    await user.click(loginButton)

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled()
    })

    consoleSpy.mockRestore()
  })
})

