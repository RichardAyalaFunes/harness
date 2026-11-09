import { notFound } from 'next/navigation';
import { Banner } from '../../../../components/Banner.tsx';
import { RoleScreen } from '../../../../components/RoleScreen.tsx';
import { loadRole } from '../../../../lib/domain/page-data.ts';

export const dynamic = 'force-dynamic';
const TABS = ['pipeline', 'brief', 'changes', 'current'];

export default async function Page({ params }: { params: Promise<{ id: string; tab?: string[] }> }) {
  const { id, tab } = await params;
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(id) || (tab && (tab.length > 1 || !TABS.includes(tab[0]!)))) notFound();
  const data = await loadRole(id);
  if (!data) notFound();
  return (<><Banner model={data.model} /><RoleScreen d={data.d} cands={data.cands} initialTab={tab?.[0] ?? 'pipeline'} /></>);
}
