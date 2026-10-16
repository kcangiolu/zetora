import { serverEnv } from '@/env/server';
import { DaytonaSandboxProvider } from './daytona-provider';
import { DockerSandboxProvider } from './docker-provider';
import type { SandboxProvider } from './types';

// Where Python code runs, chosen for the whole instance by SANDBOX_PROVIDER:
// 'docker' (the bundled `sandbox` service) or 'daytona' (Daytona's cloud).
export function getSandboxProvider(): SandboxProvider {
  switch (serverEnv.SANDBOX_PROVIDER) {
    case 'docker':
      if (!serverEnv.DOCKER_SANDBOX_URL) {
        throw new Error('Code execution: SANDBOX_PROVIDER=docker needs DOCKER_SANDBOX_URL (see .env.example)');
      }
      return new DockerSandboxProvider(serverEnv.DOCKER_SANDBOX_URL);
    case 'daytona':
      if (!serverEnv.DAYTONA_API_KEY) {
        throw new Error('Code execution: SANDBOX_PROVIDER=daytona needs DAYTONA_API_KEY (see .env.example)');
      }
      if (!serverEnv.DAYTONA_SNAPSHOT) {
        throw new Error(
          'Code execution: SANDBOX_PROVIDER=daytona needs DAYTONA_SNAPSHOT, created by scripts/create-daytona-snapshot.py',
        );
      }
      return new DaytonaSandboxProvider(serverEnv.DAYTONA_API_KEY, serverEnv.DAYTONA_SNAPSHOT);
    default:
      throw new Error('Code execution is not configured: set SANDBOX_PROVIDER to docker or daytona (see .env.example)');
  }
}
