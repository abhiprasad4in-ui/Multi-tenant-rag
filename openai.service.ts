import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const EMBEDDING_MODEL = 'text-embedding-3-small'; // 1536 dimensions, cheap
const CHAT_MODEL = 'gpt-4o-mini';

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.slice(0, 8000), // token safety limit
  });
  return response.data[0].embedding;
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts.map((t) => t.slice(0, 8000)),
  });
  return response.data.map((d) => d.embedding);
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function generateAnswer(
  systemPrompt: string,
  userQuery: string,
  context: string
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `Context:\n${context}\n\nQuestion: ${userQuery}`,
    },
  ];

  const response = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages,
    max_tokens: 1000,
    temperature: 0.2, // low temp = more factual, less hallucination
  });

  return response.choices[0]?.message?.content ?? '';
}
