import { requirePage } from '@/lib/auth';
import { ImportClient } from './ImportClient';

export const metadata = { title: 'نقل البيانات' };
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // the import runs as this page's server action

export default async function ImportPage() {
  const ctx = await requirePage('settings');
  return <ImportClient salonName={ctx.salonName} />;
}
