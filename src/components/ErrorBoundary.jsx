import { Component } from "react";

// A crash in one lazy route used to blank the entire site. Nothing in the tree
// caught render errors, so React did the only thing it can in that situation and
// unmounted everything above the throw — the Three.js hero on `/` included, even
// though the failure was somewhere else entirely. This is the catch that was
// missing: an error is contained to the route it came from, and the visitor gets
// a message instead of a black screen.
//
// Still a class in a codebase with no other classes because error boundaries are
// the one React feature with no hook equivalent — `getDerivedStateFromError` and
// `componentDidCatch` have no functional form.
class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // The only record of a production failure on a site with no error reporting
    // service. `componentStack` is what makes it actionable — it names the
    // component that threw, which the error message alone usually doesn't.
    console.error(
      `Error in ${this.props.feature || "the app"}:`,
      error,
      info?.componentStack,
    );
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const { feature } = this.props;

    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-primary px-6">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-tertiary px-8 py-10 text-center shadow-card">
          <h1 className="text-white-100 text-[22px] font-bold">
            Something went wrong
          </h1>

          <p className="text-secondary mt-3 text-[15px] leading-relaxed">
            {feature ? `${feature} ran` : "This page ran"} into an error and
            couldn’t load.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 xs:flex-row xs:justify-center">
            {/* Both recoveries are full document loads rather than client-side
                navigation on purpose. This boundary is still mounted and still
                holding `hasError`, so a router transition would re-render the
                same fallback and look like a dead button; only a fresh load
                rebuilds the tree. */}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full rounded-xl bg-[#915EFF] px-6 py-3 text-[15px] font-semibold text-white transition-opacity hover:opacity-90 xs:w-auto"
            >
              Try again
            </button>

            {/* Offered only when the failure is somewhere other than the
                portfolio itself, where it would just point at this same page. */}
            {feature && (
              <a
                href="/"
                className="text-secondary hover:text-white-100 w-full rounded-xl border border-white/10 px-6 py-3 text-[15px] font-semibold transition-colors xs:w-auto"
              >
                Back to portfolio
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
