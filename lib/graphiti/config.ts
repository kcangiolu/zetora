import 'server-only';

import { serverEnv } from '@/env/server';

export const GRAPHITI_BASE_URL = serverEnv.GRAPHITI_API_URL || 'http://localhost:8001';
