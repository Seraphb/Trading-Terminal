import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ── Anthropic LLM integration ─────────────────────────────────────────────────
/**
 * @typedef {object} InvokeLLMOptions
 * @property {string} prompt
 * @property {unknown} response_json_schema
 * @property {boolean=} add_context_from_internet
 */

/**
 * @param {string} text
 */
function parseJsonResponse(text) {
  const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
  try {
    return JSON.parse(clean);
  } catch {}

  const objMatch = clean.match(/\{[\s\S]*\}/);
  if (objMatch) return JSON.parse(objMatch[0]);

  const arrMatch = clean.match(/\[[\s\S]*\]/);
  if (arrMatch) return JSON.parse(arrMatch[0]);

  throw new Error('No JSON found');
}

/**
 * @param {InvokeLLMOptions} options
 */
async function InvokeLLM({ prompt, response_json_schema, add_context_from_internet = false }) {
  const systemPrompt = response_json_schema
    ? `You are a helpful assistant. Always respond with valid JSON only — no markdown, no explanation, no code fences. Your response must conform to this schema: ${JSON.stringify(response_json_schema)}`
    : 'You are a helpful assistant.';

  const response = await fetch('/api/anthropic', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      add_context_from_internet,
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    let errorMessage = 'Anthropic API error';
    try {
      const err = await response.json();
      errorMessage = err?.error?.message || err?.message || errorMessage;
    } catch {}
    throw new Error(errorMessage);
  }

  const data = await response.json();
  const text = data.content?.map(b => b.text || '').join('').trim();

  if (response_json_schema) {
    try {
      return parseJsonResponse(text);
    } catch (e) {
      throw new Error('Failed to parse JSON response from AI: ' + e.message);
    }
  }
  return text;
}

// ── Signal entity (Supabase) ──────────────────────────────────────────────────
const Signal = {
  async list(orderBy = '-created_date', limit = 50) {
    const column = orderBy.startsWith('-') ? orderBy.slice(1) : orderBy;
    const ascending = !orderBy.startsWith('-');
    const { data, error } = await supabase
      .from('signals')
      .select('*')
      .order(column, { ascending })
      .limit(limit);
    if (error) throw error;
    return data || [];
  },

  async create(payload) {
    const { data, error } = await supabase
      .from('signals')
      .insert([{ ...payload, created_date: new Date().toISOString() }])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id, payload) {
    const { data, error } = await supabase
      .from('signals')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id) {
    const { error } = await supabase.from('signals').delete().eq('id', id);
    if (error) throw error;
    return true;
  },
};

// ── Drop-in replacement for base44 SDK ───────────────────────────────────────
export const base44 = {
  entities: { Signal },
  integrations: {
    Core: { InvokeLLM },
  },
  auth: {
    me: async () => ({ id: 'local-user', email: 'user@local.dev' }),
    logout: () => {},
    redirectToLogin: () => {},
  },
};
