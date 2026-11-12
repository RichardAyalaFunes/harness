'use client';

// Page-level failure (a server component threw). The message is generic; the trace id is in the server log.
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (<div><div className="errbox" role="alert">Could not load this page. Try again; if it keeps happening, the details are in the server log.</div><button className="pill light" onClick={reset}>Try again</button></div>);
}
