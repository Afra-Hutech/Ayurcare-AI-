import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[AyurCare]', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0a0f16] p-6">
          <div className="max-w-md rounded-2xl border border-rose-200 dark:border-rose-900 bg-white dark:bg-slate-900 p-6 shadow-lg">
            <h1 className="text-lg font-bold text-rose-700 dark:text-rose-300">Something went wrong</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
              {this.state.error?.message || 'An unexpected error occurred in the patient app.'}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 w-full rounded-xl bg-[#28328c] dark:bg-[#14bef0] text-white text-sm font-bold py-2.5"
            >
              Reload AyurCare
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
