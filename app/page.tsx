import { createClient } from '@/lib/supabase/server';
import Dashboard from '@/components/Dashboard';
import { redirect } from 'next/navigation';
export const dynamic='force-dynamic';
export default async function Home(){const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect('/auth');return <Dashboard email={user.email??''} userId={user.id}/>}
