import { tool } from 'ai';
import { z } from 'zod';
import { serverEnv } from '@/env/server';

import { createLogger } from '@/lib/logger';
import { EXTERNAL_API_TIMEOUT_MS } from '@/lib/timeouts';

const log = createLogger('trending-movies');

export const trendingMoviesTool = tool({
  description: 'Get trending movies from TMDB',
  inputSchema: z.object({}),
  execute: async () => {
    const TMDB_API_KEY = serverEnv.TMDB_API_KEY;
    const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

    try {
      const response = await fetch(`${TMDB_BASE_URL}/trending/movie/day?language=en-US`, {
        signal: AbortSignal.timeout(EXTERNAL_API_TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${TMDB_API_KEY}`,
          accept: 'application/json',
        },
      });

      const data = await response.json();
      const results = data.results.map((movie: any) => ({
        ...movie,
        poster_path: movie.poster_path ? `https://image.tmdb.org/t/p/original${movie.poster_path}` : null,
        backdrop_path: movie.backdrop_path ? `https://image.tmdb.org/t/p/original${movie.backdrop_path}` : null,
      }));

      return { results };
    } catch (error) {
      log.error('Trending movies error:', error);
      throw error;
    }
  },
});
