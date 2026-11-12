import { Banner } from '../components/Banner.tsx';
import { PositionsView } from '../components/PositionsView.tsx';
import { loadPositions } from '../lib/domain/page-data.ts';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const { positions, model } = await loadPositions();
  return (<><Banner model={model} />{positions.length ? <PositionsView positions={positions} /> : <div className="glass panel"><h3>No data yet</h3><p className="sub">Run <code>pnpm harness rebuild</code> to build the demo database, then reload.</p></div>}</>);
}
