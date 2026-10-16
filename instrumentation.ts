export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { patchGlobalWebStreams } = await import('experimental-fast-webstreams');
    patchGlobalWebStreams();

    // Serve the model picker from the first request on, and keep it current.
    const { loadModelCatalog, startModelCatalogRefresh } = await import('@/ai/catalog/store');
    await loadModelCatalog();
    startModelCatalogRefresh();

    if (process.env.LOOKOUT_SCHEDULER === 'bullmq') {
      const { startLookoutWorker } = await import('@/lib/services/bullmq');
      const { createLogger } = await import('@/lib/logger');
      startLookoutWorker();
      createLogger('instrumentation').info('BullMQ lookout worker started');
    }
  }
}
