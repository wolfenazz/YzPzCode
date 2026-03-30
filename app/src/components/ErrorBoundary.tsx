import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: '#fafafa', backgroundColor: '#09090b', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ maxWidth: 480, textAlign: 'center' }}>
            <h1 style={{ color: '#f87171', fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Something went wrong</h1>
            <pre style={{ color: '#a1a1aa', whiteSpace: 'pre-wrap', fontSize: 12, marginBottom: 24 }}>
              {this.state.error?.toString()}
            </pre>
            <button
              onClick={this.handleReset}
              style={{
                padding: '8px 24px',
                backgroundColor: 'rgba(127, 29, 29, 0.3)',
                border: '1px solid rgba(127, 29, 29, 0.5)',
                color: '#f87171',
                cursor: 'pointer',
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                fontFamily: 'monospace',
              }}
            >
              [ Try Again ]
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
