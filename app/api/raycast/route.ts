import { webSearchTool } from '@/lib/tools';
import { isToolAvailable } from '@/lib/instance/capabilities';
import { xSearchTool } from '@/lib/tools/x-search';
import { convertToModelMessages, generateText, stepCountIs } from 'ai';
import { resolveModel } from '@/ai/providers';
import { z } from 'zod';

import { createLogger } from '@/lib/logger';
import { secretsEqual } from '@/lib/secure-compare';

const log = createLogger('raycast');

export const maxDuration = 800;

// Define separate system prompts for each group
const groupSystemPrompts = {
  web: `You are Zetora for Raycast, a powerful AI web search assistant.

Today's Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit', weekday: 'short' })}
Current Time: ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}

### Core Guidelines:
- Always run the web_search tool first before composing your response.
- Provide concise, well-formatted responses optimized for Raycast's interface.
- Use markdown formatting for better readability.
- Avoid hallucinations or fabrications. Stick to verified facts with proper citations.
- Respond in a direct, efficient manner suitable for quick information retrieval.

### Web Search Guidelines:
- Always make multiple targeted queries (2-4) to get comprehensive results.
- Never use the same query twice and always make more than 2 queries.
- **⚠️ CRITICAL: Always include date/time context in search queries:**
  - For current events: "latest", "${new Date().getFullYear()}", "today", "current", "recent"
  - For historical info: specific years or date ranges
  - For time-sensitive topics: "newest", "updated", "${new Date().getFullYear()}"
  - **NO TEMPORAL ASSUMPTIONS**: Never assume time periods - always be explicit about dates/years
  - Examples: "latest AI news ${new Date().getFullYear()}", "current stock prices today", "recent developments in ${new Date().getFullYear()}"
- You can select "general", "news" or "finance" in the search type.
- Place citations directly after relevant sentences or paragraphs.
- Citation format: [Source Title](URL)
- Ensure citations adhere strictly to the required format.

### Response Formatting:
- Start with a direct answer to the user's question.
- Use markdown headings (h2, h3) to organize information.
- Present information in a logical flow with proper citations.
- Keep responses concise but informative, optimized for Raycast's interface.
- Use bullet points or numbered lists for clarity when appropriate.

### Latex and Currency Formatting:
- Use $ for inline equations and $$ for block equations.
- Use "USD" instead of $ for currency.

Remember, you are designed to be efficient and helpful in the Raycast environment, providing quick access to web information.`,

  x: `You are a X/Twitter content curator that helps find relevant posts.
    The current date is ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit', weekday: 'short' })}.
    Once you get the content from the tools only write in paragraphs.
    No need to say that you are calling the tool, just call the tools first and run the search;
    then talk in long details in 2-6 paragraphs.
    make sure to use the start date and end date in the parameters. default is 1 month.
    If the user gives you a specific time like start date and end date, then add them in the parameters. default is 1 week.
    Always provide the citations at the end of each paragraph and in the end of sentences where you use it in which they are referred to with the given format to the information provided.
    Citation format: [Post Title](URL)

    The X handle can any company, person, or organization mentioned in the post that you know of or the user is asking about.

    # Latex and Currency Formatting to be used:
    - Always use '$' for inline equations and '$$' for block equations.
    - Avoid using '$' for dollar currency. Use "USD" instead.`,
};

const RaycastRequestSchema = z.object({
  messages: z.array(z.any()).min(1),
  model: z.string().min(1),
  group: z.enum(['web', 'x']).default('web'),
});

// This route is exempted from session-cookie middleware (proxy.ts) so the
// Raycast extension can call it without a browser session — it must instead
// be gated by its own shared secret, or it's a free LLM + web-search proxy
// for anyone who finds the URL.
function verifyRaycastSecret(req: Request): boolean {
  const secret = process.env.RAYCAST_API_SECRET;
  if (!secret || secret === 'placeholder') return false;
  const auth = req.headers.get('authorization');
  return secretsEqual(auth, `Bearer ${secret}`);
}

export async function POST(req: Request) {
  if (!verifyRaycastSecret(req)) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const parsed = RaycastRequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response('Invalid request: messages[] and model are required', { status: 400 });
  }
  const { messages, model, group } = parsed.data;

  const systemPrompt = groupSystemPrompts[group];

  // Determine which tools to activate based on the group
  const webSearchAvailable = isToolAvailable('web_search');
  const activeTools: ('web_search' | 'x_search')[] =
    group === 'x' ? ['x_search'] : webSearchAvailable ? ['web_search'] : [];

  try {
    const { text } = await generateText({
      model: await resolveModel(model),
      system: systemPrompt,
      stopWhen: stepCountIs(2),
      messages: await convertToModelMessages(messages),
      temperature: 0,
      toolChoice: 'auto',
      experimental_activeTools: activeTools,
      tools: {
        ...(webSearchAvailable ? { web_search: webSearchTool(undefined) } : {}),
        x_search: xSearchTool(undefined),
      },
    });

    return new Response(text);
  } catch (error) {
    log.error('Raycast route error:', error);
    return new Response('Failed to generate response', { status: 500 });
  }
}
