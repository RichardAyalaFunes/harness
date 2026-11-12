import Link from 'next/link';

export default function NotFound() {
  return (<div className="glass panel" role="alert"><h3>Not found</h3><p className="sub">That position or page does not exist.</p><Link className="pill dark" href="/">Back to positions</Link></div>);
}
