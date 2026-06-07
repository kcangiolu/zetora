import 'server-only';

import { generateText } from 'ai';
import { jsonrepair } from 'jsonrepair';

import { hasVisionSupport } from '@/ai/providers';
import { getComprehensiveUserData, getCachedUserPreferencesByUserId } from '@/lib/user-data-server';
import { resolveTertiaryModel } from '@/ai/tertiary';

interface AutoRouterRoute {
  name: string;
  description: string;
  model: string;
}

export async function routeWithAutoRouter({
  query,
  routes,
  hasImages = false,
}: {
  query: string;
  routes: AutoRouterRoute[];
  hasImages?: boolean;
}) {
  try {
    const user = await getComprehensiveUserData();
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    if (!user.isProUser) {
      return { success: false, error: 'pro_required' };
    }

    const routerPrefs = await getCachedUserPreferencesByUserId(user.id).catch(() => null);
    const routerPrefsMap = (routerPrefs?.preferences ?? {}) as Record<string, string>;

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return { success: false, error: 'Query cannot be empty' };
    }

    const sanitizedRoutes = routes
      .map((route) => ({
        name: route.name.trim(),
        description: route.description.trim(),
        model: route.model.trim(),
      }))
      .filter((route) => route.name && route.description && route.model);

    if (!sanitizedRoutes.length) {
      return { success: false, error: 'No routes configured' };
    }

    const routeConfig = sanitizedRoutes.map(({ name, description }) => ({
      name,
      description,
    }));

    const conversation = [{ role: 'user', content: trimmedQuery }];

    const taskInstruction = `
You are a helpful assistant designed to find the best suited route.
You are provided with route description within <routes></routes> XML tags:
<routes>

${JSON.stringify(routeConfig)}

</routes>

<conversation>

${JSON.stringify(conversation)}

</conversation>
`;

    const imageContext = hasImages
      ? '\n\nIMPORTANT: The user attached image(s). Prefer a route whose model supports vision/image analysis. If none do, return {"route": "other"}.'
      : '';

    const formatPrompt = `
Your task is to decide which route is best suit with user intent on the conversation in <conversation></conversation> XML tags. Follow the instruction:
1. If the latest intent from user is irrelevant or user intent is full filled, response with other route {"route": "other"}.
2. You must analyze the route descriptions and find the best match route for user latest intent.
3. You only response the name of the route that best matches the user's request, use the exact name in the <routes></routes>.
${imageContext}

Based on your analysis, provide your response in the following JSON formats if you decide to match any route:
{"route": "route_name"}
`;

    const { text } = await generateText({
      model: await resolveTertiaryModel('auto-router', routerPrefsMap),
      messages: [{ role: 'user', content: taskInstruction + formatPrompt }],
      maxOutputTokens: 200,
      temperature: 0,
    });

    const rawMatch = text.match(/\{[\s\S]*\}/);
    const parsed = rawMatch ? JSON.parse(jsonrepair(rawMatch[0])) : null;
    const routeName = parsed?.route as string | undefined;

    const matchedRoute = sanitizedRoutes.find((route) => route.name === routeName);
    let resolvedModel = matchedRoute?.model || 'zetora-default';

    if (hasImages && !hasVisionSupport(resolvedModel)) {
      const visionRoute = sanitizedRoutes.find((route) => hasVisionSupport(route.model));
      resolvedModel = visionRoute?.model || 'zetora-default';
    }

    console.log('Resolved model:', resolvedModel);

    return {
      success: true,
      model: resolvedModel,
      route: matchedRoute?.name || 'other',
    };
  } catch (error) {
    console.error('Error routing with auto router:', error);
    return { success: false, error: 'Failed to route query' };
  }
}
