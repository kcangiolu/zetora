export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { patchGlobalWebStreams } = await import('experimental-fast-webstreams');
    patchGlobalWebStreams();

    // Serve the model picker from the first request on.
    const { loadModelCatalog } = await import('@/ai/catalog/store');
    await loadModelCatalog();

    if (process.env.BULLMQ_ENABLED === 'true') {
      const { startLookoutWorker } = await import('@/lib/services/bullmq');
      startLookoutWorker();
      console.log('[Zetora] BullMQ Lookout Worker started');
    }
  }
}
