import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const fullName = String(user.user_metadata?.full_name || user.user_metadata?.name || '').trim();
        const mobile = String(user.user_metadata?.mobile || '').replace(/\D/g, '');
        if (fullName && /^\d{10}$/.test(mobile)) {
          await supabase.from('profiles').upsert({ id: user.id, full_name: fullName, mobile, updated_at: new Date().toISOString() });
        }
      }
      return NextResponse.redirect(`${origin}/`);
    }
  }

  return NextResponse.redirect(`${origin}/auth?error=google_signin_failed`);
}
