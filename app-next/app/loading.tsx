// Shown by Next while a page's data loads: the same skeleton the old UI used.
export default function Loading() {
  return (
    <div className="skel" aria-busy="true" aria-label="Loading">
      <div className="sk sk-hero" /><div className="sk sk-bar" />
      <div className="skrow"><div className="sk sk-card" /><div className="sk sk-card" /><div className="sk sk-card" /></div>
    </div>
  );
}
