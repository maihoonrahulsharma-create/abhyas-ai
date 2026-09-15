import { NextResponse } from 'next/server';
import { z } from 'zod';
import { extractText } from 'unpdf';
import { createClient } from '@/lib/supabase/server';
import { decryptApiKey } from '@/lib/apiKeyCrypto';

export const runtime = 'nodejs';
export const maxDuration = 300;

const schema = z.object({
  questions: z.array(z.object({
    question: z.string().min(1),
    options: z.array(z.string().min(1)).length(4),
    correctAnswer: z.number().int().min(0).max(3),
    explanation: z.string().min(1),
  })).min(1),
});

const systemPrompt = `You are Bheja Fry AI, a careful educational question generator. Return ONLY valid JSON matching the requested schema.

SOURCE COVERAGE IS MANDATORY. When a PDF, image, link, or other source material is supplied, consider the ENTIRE supplied source before selecting questions. Do NOT focus only on the first page, beginning, or most recently seen section.

For a multi-page PDF, use the full extracted PDF text as the source. Select questions from important concepts, facts, definitions, examples, processes, dates, formulas, and other examinable information across the ENTIRE document. When the requested question count allows it, distribute questions across different relevant sections/pages rather than taking all questions from one small section.

If only a few questions are requested, choose the most important and representative concepts from across the ENTIRE source rather than taking all questions from the beginning.

Create exactly the requested number of high-quality single-answer MCQs. Every question must have exactly four distinct plausible options and exactly one correct answer. Avoid duplicates and avoid asking multiple questions about the same small section when other important sections are available. Keep explanations concise. Follow the requested language and difficulty. Never invent source-specific facts.`;

async function extractPdfText(file: File) {
  const buffer = await file.arrayBuffer();
  const { text } = await extractText(new Uint8Array(buffer), {
    mergePages: true,
  });

  const extracted = Array.isArray(text) ? text.join('\n') : String(text || '');

  if (!extracted.trim()) {
    throw new Error('Could not extract readable text from the PDF.');
  }

  return extracted;
}
const jsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          question: { type: 'string' },
          options: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
          correctAnswer: { type: 'integer', minimum: 0, maximum: 3 },
          explanation: { type: 'string' },
        },
        required: ['question', 'options', 'correctAnswer', 'explanation'],
      },
      minItems: 1,
    },
  },
  required: ['questions'],
};


function publicUrl(u: string) {
  try {
    const x = new URL(u);
    if (!['http:', 'https:'].includes(x.protocol)) return false;
    const h = x.hostname.toLowerCase();
    if (['localhost', '127.0.0.1', '::1'].includes(h) || h.startsWith('10.') || h.startsWith('192.168.') || h.startsWith('172.16.') || h.startsWith('172.17.') || h.startsWith('172.18.') || h.startsWith('172.19.') || h.startsWith('172.2') || h.startsWith('172.30.') || h.startsWith('172.31.')) return false;
    return true;
  } catch { return false; }
}

type Msg = { role: 'system' | 'user'; content: any };

async function gemini(key: string, messages: Msg[], file?: { type: string; name: string; data: string }) {
  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const parts: any[] = [];
  const userContent = messages.find(m => m.role === 'user')?.content || [];
  if (Array.isArray(userContent)) {
    for (const item of userContent) if (item.type === 'text') parts.push({ text: item.text });
  } else if (typeof userContent === 'string') parts.push({ text: userContent });
  if (file) parts.push({ inlineData: { mimeType: file.type, data: file.data } });
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
  };
  const res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${data?.error?.message || 'request failed'}`);
  return String(data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '');
}

async function openRouter(key: string, messages: Msg[], file?: { type: string; name: string; data: string }) {
  const userContent: any[] = [{ type: 'text', text: String(messages[1]?.content?.[0]?.text || '') }];

  if (file) {
    if (file.type === 'application/pdf') {
      userContent.push({
        type: 'file',
        file: {
          filename: file.name,
          file_data: `data:${file.type};base64,${file.data}`,
        },
      });
    } else {
      userContent.push({
        type: 'image_url',
        image_url: {
          url: `data:${file.type};base64,${file.data}`,
        },
      });
    }
  }

  const res = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://quizforge.test:3001',
      'X-OpenRouter-Title': 'Bheja Fry AI',
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || 'openrouter/free',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.2,
      max_tokens: 4500,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'BhejaFryQuestions',
          strict: true,
          schema: jsonSchema,
        },
      },
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(`OpenRouter ${res.status}: ${data?.error?.message || 'request failed'}`);
  }

  const content = String(data?.choices?.[0]?.message?.content || '');

  if (!content.trim()) {
    throw new Error('OpenRouter returned an empty response.');
  }

  return content;
}

async function groq(key: string, messages: Msg[]) {
  const res = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
      messages,
      temperature: 0.2,
      max_tokens: 4500,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'BhejaFryQuestions',
          strict: true,
          schema: jsonSchema,
        },
      },
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(`Groq ${res.status}: ${data?.error?.message || 'request failed'}`);
  }

  const content = String(data?.choices?.[0]?.message?.content || '');

  if (!content.trim()) {
    throw new Error('Groq returned an empty response.');
  }

  return content;
}


async function huggingFace(key: string, messages: Msg[]) {
  const models = Array.from(new Set([
    process.env.HF_MODEL?.trim() || 'openai/gpt-oss-120b:cerebras',
    'openai/gpt-oss-120b:cerebras',
  ].filter(Boolean)));
  const errors: string[] = [];
  for (const model of models) {
    try {
      const res = await fetchWithTimeout('https://router.huggingface.co/v1/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: `${systemPrompt} Return JSON only. Do not wrap the JSON in markdown fences.` }, ...messages.filter(m => m.role === 'user')],
          temperature: 0.2, max_tokens: 4500,
          response_format: { type: 'json_schema', json_schema: { name: 'BhejaFryQuestions', strict: true, schema: jsonSchema } },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`Hugging Face ${res.status}: ${data?.error?.message || 'request failed'}`);
      const content = String(data?.choices?.[0]?.message?.content || '');
      if (!content.trim()) throw new Error('Hugging Face returned an empty response.');
      return content;
    } catch (e) { errors.push(`${model}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  throw new Error(errors.join(' | '));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 180000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function ollama(messages: Msg[], count: number) {
  const configuredBase = process.env.OLLAMA_BASE_URL?.trim();
  if (!configuredBase) throw new Error('Ollama is not configured.');
  const base = configuredBase.replace(/\/$/, '');
  const model = process.env.OLLAMA_MODEL || 'llama3.2:3b';
  return generateInBatches(count, 10, 2, async (batchCount, index) => {
    const batchMessages = withBatchCount(messages, count, batchCount, index);
    const originalText = batchMessages.map(m => typeof m.content === 'string' ? `${m.role}: ${m.content}` : `${m.role}: ${m.content.filter((x: any) => x.type === 'text').map((x: any) => x.text).join('\n')}`).join('\n\n');
    const res = await fetchWithTimeout(`${base}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: originalText }], stream: false, format: jsonSchema, options: { temperature: 0.15, num_ctx: 8192, num_predict: 4500 } }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${data?.error || 'request failed'}`);
    return String(data?.message?.content || '');
  });
}

function withBatchCount(messages: Msg[], total: number, batchCount: number, index: number): Msg[] {
  const replacement = `Create exactly ${batchCount} questions (batch ${index + 1} of ${Math.ceil(total / batchCount)}).`;
  return messages.map(m => {
    if (m.role !== 'user') return m;
    if (Array.isArray(m.content)) return { ...m, content: m.content.map((x: any) => x.type === 'text' ? { ...x, text: String(x.text).replace(new RegExp(`Create exactly ${total} questions`, 'g'), replacement) } : x) };
    return { ...m, content: String(m.content).replace(new RegExp(`Create exactly ${total} questions`, 'g'), replacement) };
  });
}

async function generateInBatches(
  count: number,
  batchSize: number,
  concurrency: number,
  runBatch: (batchCount: number, index: number) => Promise<string>
) {
  if (count <= batchSize) return runBatch(count, 0);
  const jobs: Array<{ index: number; size: number }> = [];
  for (let index = 0, offset = 0; offset < count; index++, offset += batchSize) jobs.push({ index, size: Math.min(batchSize, count - offset) });
  const results: string[] = new Array(jobs.length);
  for (let cursor = 0; cursor < jobs.length; cursor += concurrency) {
    const wave = jobs.slice(cursor, cursor + concurrency);
    const settled = await Promise.allSettled(wave.map(j => runBatch(j.size, j.index)));
    const failures: string[] = [];
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') results[wave[i].index] = r.value;
      else failures.push(`batch ${wave[i].index + 1}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
    });
    if (failures.length) throw new Error(failures.join(' | '));
    if (cursor + concurrency < jobs.length) await new Promise(resolve => setTimeout(resolve, 10000));
  }
  const questions: any[] = [];
  for (const raw of results) {
    const parsed = schema.safeParse(extractJson(raw));
    if (!parsed.success) throw new Error('AI returned invalid JSON or an invalid question structure in a batch.');
    questions.push(...parsed.data.questions);
  }
  if (questions.length !== count) throw new Error(`Batch generation returned ${questions.length} questions instead of ${count}.`);
  return JSON.stringify({ questions });
}

function extractJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const sanitize = (value: string) => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ');
  try { return JSON.parse(cleaned); } catch {}
  const start = cleaned.indexOf('{'); const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const candidate = cleaned.slice(start, end + 1);
    try { return JSON.parse(candidate); } catch {}
    try { return JSON.parse(sanitize(candidate)); } catch {}
  }
  throw new Error('AI returned invalid JSON.');
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const form = await request.formData();
    const file = form.get('file');
    const topic = String(form.get('topic') || '').trim();
    const link = String(form.get('link') || '').trim();
    const count = Math.min(Math.max(Number(form.get('count') || 10), 1), 50);
    const difficulty = String(form.get('difficulty') || 'Moderate');
    const language = String(form.get('language') || 'English');
    const mode = String(form.get('mode') || 'test');
    const hasFile = file instanceof File;

    if (hasFile) {
      if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return NextResponse.json({ error: 'Only PDF, PNG, JPG, or WEBP files are supported' }, { status: 400 });
      if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: 'File must be 20MB or smaller' }, { status: 400 });
    }
    if (link && !publicUrl(link)) return NextResponse.json({ error: 'Please enter a public http(s) link.' }, { status: 400 });
    if (!topic && !hasFile && !link) return NextResponse.json({ error: 'Give a topic, PDF/photo, or link to generate questions.' }, { status: 400 });

    const sourceBits: string[] = [];

if (topic) sourceBits.push(`Topic: ${topic}`);

if (link) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(link, {
      signal: controller.signal,
      headers: { 'user-agent': 'QuizForgeAI/1.0' },
    });

    if (!res.ok) throw new Error(`Link returned ${res.status}`);

    const text = await res.text();

    const clean = text
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120000);

    sourceBits.push(`Web source content:\n${clean}`);
  } finally {
    clearTimeout(timeout);
  }
}

let filePayload: { type: string; name: string; data: string } | undefined;

if (hasFile) {
  if (file.type === 'application/pdf') {
    const pdfText = await extractPdfText(file);
    sourceBits.push(`FULL PDF SOURCE:\n${pdfText}`);
  } else {
    filePayload = {
      type: file.type,
      name: file.name || 'source',
      data: Buffer.from(await file.arrayBuffer()).toString('base64'),
    };
  }
}

const userText = `${sourceBits.join('\n\n')}

Create exactly ${count} questions for ${
  mode === 'quiz' ? 'instant quiz practice' : 'exam test'
} mode. Language: ${language}. Difficulty: ${difficulty}.`;

const messages: Msg[] = [
  { role: 'system', content: systemPrompt },
  {
    role: 'user',
    content: [{ type: 'text', text: userText }],
  },
];

    const { data: keyRows, error: keyError } = await supabase.from('user_ai_keys').select('provider,ciphertext,iv,auth_tag').eq('user_id', user.id);
    if (keyError) return NextResponse.json({ error: keyError.message }, { status: 500 });
    const keys: Record<string, string> = {};
    for (const row of keyRows || []) { try { keys[row.provider] = decryptApiKey(row); } catch {} }

    const errors: string[] = [];
    const trace: Array<{ provider: string; status: 'success' | 'failed' | 'skipped'; durationMs?: number; error?: string }> = [];
    let raw = '';
    const providers: Array<[string, () => Promise<string>]> = [];
    const batched = (run: (m: Msg[], f?: { type: string; name: string; data: string }) => Promise<string>, fileArg?: { type: string; name: string; data: string }) =>
      count > 20 ? () => generateInBatches(count, 5, 1, (batchCount, index) => run(withBatchCount(messages, count, batchCount, index), fileArg)) : () => run(messages, fileArg);
    const batchedText = (run: (m: Msg[]) => Promise<string>) =>
      count > 20 ? () => generateInBatches(count, 5, 1, (batchCount, index) => run(withBatchCount(messages, count, batchCount, index))) : () => run(messages);
   const isPdf = hasFile && file.type === 'application/pdf';
const isImage = hasFile && !isPdf;

const skipped: Array<{
  provider: string;
  status: 'skipped';
  error: string;
}> = [];

// PDF has already been converted into FULL TEXT by unpdf.
// Therefore PDF can use normal text-based AI providers without
// sending the actual PDF file to providers that charge for file processing.

if (isPdf) {
  // Prefer Groq/Hugging Face first for extracted PDF text.
  // This avoids unnecessary Gemini quota usage and OpenRouter file charges.
  if (keys.groq) {
    providers.push([
      'Groq',
      batchedText(m => groq(keys.groq, m)),
    ]);
  }

  if (keys.huggingface) {
    providers.push([
      'Hugging Face',
      batchedText(m => huggingFace(keys.huggingface, m)),
    ]);
  }

  // Gemini/OpenRouter are text-only fallback here.
  // The PDF itself is NOT attached to these requests.
  if (keys.gemini) {
    providers.push([
      'Gemini',
      batchedText(m => gemini(keys.gemini, m)),
    ]);
  }

  if (keys.openrouter) {
    providers.push([
      'OpenRouter',
      batchedText(m => openRouter(keys.openrouter, m)),
    ]);
  }

  skipped.push({
    provider: 'Ollama Local',
    status: 'skipped',
    error: 'Ollama Local is not enabled for uploaded PDF processing.',
  });

} else if (isImage) {
  // Images still require a multimodal provider.
  if (keys.gemini) {
    providers.push([
      'Gemini',
      batched(
        (m, f) => gemini(keys.gemini, m, f),
        filePayload
      ),
    ]);
  }

  if (keys.openrouter) {
    providers.push([
      'OpenRouter',
      batched(
        (m, f) => openRouter(keys.openrouter, m, f),
        filePayload
      ),
    ]);
  }

  if (keys.groq) {
    skipped.push({
      provider: 'Groq',
      status: 'skipped',
      error: 'Uploaded image requires a multimodal provider path.',
    });
  }

  if (keys.huggingface) {
    skipped.push({
      provider: 'Hugging Face',
      status: 'skipped',
      error: 'Uploaded image requires a multimodal provider path.',
    });
  }

  skipped.push({
    provider: 'Ollama Local',
    status: 'skipped',
    error: 'Ollama Local is not enabled for uploaded image processing.',
  });

} else {
  // Normal topic/link text generation.
  if (keys.gemini) {
    providers.push([
      'Gemini',
      batchedText(m => gemini(keys.gemini, m)),
    ]);
  }

  if (keys.openrouter) {
    providers.push([
      'OpenRouter',
      batchedText(m => openRouter(keys.openrouter, m)),
    ]);
  }

  if (keys.groq) {
    providers.push([
      'Groq',
      batchedText(m => groq(keys.groq, m)),
    ]);
  }

  if (keys.huggingface) {
    providers.push([
      'Hugging Face',
      batchedText(m => huggingFace(keys.huggingface, m)),
    ]);
  }

  providers.push([
    'Ollama Local',
    () => ollama(messages, count),
  ]);
}

    if (!providers.length) return NextResponse.json({ error: 'No compatible AI provider is configured for this source. Add a Gemini or OpenRouter key for PDF/image input, or add Gemini, OpenRouter, Groq, or Hugging Face for text/link input.', providerTrace: [...trace, ...skipped] }, { status: 503 });

    for (const [name, fn] of providers) {
      const started = Date.now();
      try {
        raw = await fn();
        const parsed = validateQuestions(raw, count, name);
        trace.push({ provider: name, status: 'success', durationMs: Date.now() - started });
        return NextResponse.json({ questions: parsed.questions, provider: name, providerTrace: [...trace, ...skipped] });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${name}: ${msg}`);
        trace.push({ provider: name, status: 'failed', durationMs: Date.now() - started, error: msg });
      }
    }
    return NextResponse.json({ error: `All compatible AI providers failed. ${errors.join(' | ')}`, providerTrace: [...trace, ...skipped] }, { status: 503 });

  } catch (e) {
    console.error(e); return NextResponse.json({ error: e instanceof Error ? e.message : 'Generation failed' }, { status: 500 });
  }
}

function validateQuestions(raw: string, count: number, provider: string) {
  let parsed: z.infer<typeof schema>;
  try {
    const result = schema.safeParse(extractJson(raw));
    if (!result.success) throw new Error(`${provider} returned invalid JSON or an invalid question structure.`);
    parsed = result.data;
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : `${provider} returned invalid JSON.`);
  }
  if (parsed.questions.length !== count) throw new Error(`${provider} did not return exactly ${count} valid questions.`);
  const qs = parsed.questions.map(q => ({ ...q, question: q.question.trim(), options: q.options.map(x => x.trim()), explanation: q.explanation.trim() }));
  if (qs.some(q => new Set(q.options.map(x => x.toLowerCase())).size !== 4)) throw new Error(`${provider} returned duplicate options.`);
  return { questions: qs };
}

