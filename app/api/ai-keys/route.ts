import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { encryptApiKey } from '@/lib/apiKeyCrypto';

export const runtime = 'nodejs';

const providers = ['gemini', 'openrouter', 'groq', 'huggingface'] as const;
type Provider = typeof providers[number];

function validProvider(value: string): value is Provider { return (providers as readonly string[]).includes(value); }

async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data, error } = await supabase.from('user_ai_keys').select('provider,updated_at').eq('user_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const configured = Object.fromEntries(providers.map(p => [p, false]));
  for (const row of data || []) configured[row.provider] = true;
  return NextResponse.json({ configured });
}

export async function POST(request: Request) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null) as { provider?: string; apiKey?: string } | null;
  const provider = body?.provider?.toLowerCase() || '';
  const apiKey = body?.apiKey?.trim() || '';
  if (!validProvider(provider)) return NextResponse.json({ error: 'Unsupported AI provider.' }, { status: 400 });
  if (apiKey.length < 10 || apiKey.length > 500) return NextResponse.json({ error: 'Please enter a valid-looking API key.' }, { status: 400 });
  const encrypted = encryptApiKey(apiKey);
  const { error } = await supabase.from('user_ai_keys').upsert({ user_id: user.id, provider, ...encrypted }, { onConflict: 'user_id,provider' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, provider });
}

export async function DELETE(request: Request) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null) as { provider?: string } | null;
  const provider = body?.provider?.toLowerCase() || '';
  if (!validProvider(provider)) return NextResponse.json({ error: 'Unsupported AI provider.' }, { status: 400 });
  const { error } = await supabase.from('user_ai_keys').delete().eq('user_id', user.id).eq('provider', provider);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
