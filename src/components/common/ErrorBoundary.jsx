// ErrorBoundary — isolates a subtree so a render/hook-init crash in it does NOT
// take down the whole app. `fallback` is rendered instead of the failed subtree:
// either a React node, or a function `(error) => node` (handy for supplying a
// degraded context provider that still renders the rest of the app).
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
    if (this.props.onError) this.props.onError(error, info);
    else console.error(`[ErrorBoundary${this.props.label ? ` ${this.props.label}` : ''}]`, error, info);
  }

  render() {
    if (this.state.error) {
      const { fallback } = this.props;
      return typeof fallback === 'function' ? fallback(this.state.error) : (fallback ?? null);
    }
    return this.props.children;
  }
}
