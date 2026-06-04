import { serverEnv } from '@/env/server';
import { DaytonaSandboxProvider } from './daytona-provider';
import { DockerSandboxProvider } from './docker-provider';
import type { SandboxProvider } from './types';

export type SandboxProviderType = 'daytona' | 'docker';

export function getSandboxProvider(preferredProvider?: SandboxProviderType): SandboxProvider {
  const provider = preferredProvider ?? serverEnv.SANDBOX_PROVIDER ?? 'daytona';

  if (provider === 'docker') {
    return new DockerSandboxProvider(serverEnv.DOCKER_SANDBOX_URL);
  }

  if (!serverEnv.DAYTONA_API_KEY) {
    throw new Error(
      'DAYTONA_API_KEY is required when using Daytona sandbox provider. ' +
      'Set SANDBOX_PROVIDER=docker to use the local Docker sandbox instead.'
    );
  }

  return new DaytonaSandboxProvider(serverEnv.DAYTONA_API_KEY);
}
