import { redirect } from 'next/navigation';
import { requirePage } from '@/lib/auth';

export default async function Home() {
  const ctx = await requirePage();
  if (ctx.role === 'staff') redirect('/my-day');
  if (ctx.role === 'accountant') redirect('/money');
  redirect('/schedule');
}
