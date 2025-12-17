import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

// Error boundary component to catch React errors
// Must be a class component (React doesn't support hooks for error boundaries yet)
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error: error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to server
    try {
      fetch('/api/errors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: error.message || 'React component error',
          source: 'ErrorBoundary',
          stack: error.stack,
          error: error.toString(),
          componentStack: errorInfo.componentStack,
          userAgent: navigator.userAgent,
          url: window.location.href,
        }),
      }).catch(() => {
        // Silently fail if error reporting fails
      });
    } catch (err) {
      // Silently fail if error reporting fails
    }

    // Update state with error info
    this.setState({
      error: error,
      errorInfo: errorInfo,
    });
  }

  render() {
    if (this.state.hasError) {
      // Fallback UI
      return React.createElement('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '20px',
          backgroundColor: '#000000',
          color: '#ffffff',
          fontFamily: 'Arial, sans-serif',
        },
      }, [
        React.createElement('h1', {
          key: 'title',
          style: {
            fontSize: '2rem',
            marginBottom: '20px',
            color: '#ff0000',
          },
        }, 'Something went wrong'),
        React.createElement('p', {
          key: 'message',
          style: {
            fontSize: '1rem',
            marginBottom: '20px',
            textAlign: 'center',
            maxWidth: '600px',
          },
        }, this.state.error?.message || 'An unexpected error occurred'),
        React.createElement('button', {
          key: 'reload',
          onClick: () => {
            window.location.reload();
          },
          style: {
            padding: '10px 20px',
            fontSize: '1rem',
            backgroundColor: '#333333',
            color: '#ffffff',
            border: '1px solid #666666',
            borderRadius: '4px',
            cursor: 'pointer',
          },
        }, 'Reload Page'),
      ]);
    }

    return this.props.children;
  }
}

