import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Сбой рендера страницы:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 12, padding: 24, background: '#09090b', color: '#f6f0ee',
          fontFamily: 'Inter, sans-serif', textAlign: 'center',
        }}>
          <div style={{ fontSize: 40 }}>🐼💥</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Что-то пошло не так на этой странице</div>
          <div style={{ fontSize: 13, color: '#a1a1aa', maxWidth: 420 }}>
            Попробуй обновить страницу. Если ошибка повторится — сообщи, что именно делал(а) перед этим.
          </div>
          <div style={{ fontSize: 11, color: '#71717a', maxWidth: 420, wordBreak: 'break-word', marginTop: 8 }}>
            {String(this.state.error?.message || this.state.error)}
          </div>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            style={{
              marginTop: 12, background: '#e11d2e', color: 'white', border: 'none',
              borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >
            🔄 Обновить страницу
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
