import { status } from '../lib/domain/spike.ts';

export const dynamic = 'force-dynamic';

export default function Page() {
  const s = status();
  return (<main><h1>Spike</h1><p id="pings">pings: {s.pings}</p><p id="root">{s.root}</p><p id="prompt">{s.prompt_first_line}</p></main>);
}
