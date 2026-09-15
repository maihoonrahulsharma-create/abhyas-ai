import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type TranslateBody = {
  targetLanguage?: string;
  questions?: unknown;
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as TranslateBody;
    const targetLanguage = String(body.targetLanguage || '').trim();
    const questions = Array.isArray(body.questions) ? body.questions : [];

    if (!targetLanguage) {
      return NextResponse.json(
        { error: 'Target language is required.' },
        { status: 400 }
      );
    }

    if (!questions.length) {
      return NextResponse.json({ questions: [] });
    }

    // Keep translation deterministic and safe when no translation provider
    // is configured. The client can continue using the original questions.
    return NextResponse.json({
      questions,
      targetLanguage,
      translated: false,
    });
  } catch (error) {
    console.error('Translation error:', error);
    return NextResponse.json(
      { error: 'Translation failed.' },
      { status: 500 }
    );
  }
}
