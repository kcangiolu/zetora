export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { patchGlobalWebStreams } = await import('experimental-fast-webstreams');
    patchGlobalWebStreams();

    if (process.env.BULLMQ_ENABLED === 'true') {
      const { startLookoutWorker } = await import('@/lib/services/bullmq');
      startLookoutWorker();
      console.log('[Zetora] BullMQ Lookout Worker started');
    }
  }
}
