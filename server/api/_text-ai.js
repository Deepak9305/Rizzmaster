import OpenAI from 'openai';

export const DEFAULT_TEXT_MODEL = 'nvidia/nemotron-3.5-super-vl';

export const generateText = async (request, timeoutMs) => {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error('OpenRouter API key is not configured on the server.');

  const model = process.env.OPENROUTER_MODEL?.trim() || DEFAULT_TEXT_MODEL;
  const client = new OpenAI({
    apiKey,
    baseURL: process.env.OPENROUTER_BASE_URL?.trim() || 'https://openrouter.ai/api/v1',
    timeout: timeoutMs,
    maxRetries: 0,
    defaultHeaders: {
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL?.trim() || 'https://rizzmaster.online',
      'X-Title': process.env.OPENROUTER_APP_NAME?.trim() || 'Rizz Master',
    },
  });

  const completion = await client.chat.completions.create({
    model,
    messages: request.messages,
    temperature: request.temperature,
    max_tokens: Math.max(request.max_tokens || 1200, 120),
    reasoning: { enabled: false, exclude: true },
    provider: {
      order: ['deepinfra', 'primeintellect'],
      only: ['deepinfra', 'primeintellect'],
      allow_fallbacks: true,
      require_parameters: true,
    },
  });
  if (completion.error) throw new Error('OpenRouter could not complete the request.');
  const choice = completion.choices?.[0];
  if (choice?.finish_reason === 'length') {
    throw new Error('AI response exceeded its token limit. Please try again.');
  }
  const content = choice?.message?.content?.trim();
  if (!content) throw new Error('AI provider returned an empty response.');
  return content;
};
