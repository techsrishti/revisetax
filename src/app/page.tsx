import { createClient } from '@/utils/supabase/server';
import { redirect } from "next/navigation";

export default async function Home() {
  const supabase = await createClient();
  
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    redirect('/auth/signin');
  }
  
  redirect('/dashboard');
}
