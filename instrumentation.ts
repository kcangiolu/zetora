export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { patchGlobalWebStreams } = await import('experimental-fast-webstreams');
    patchGlobalWebStreams();

    // Registers extensions job handlers (if any) as a side effect — must run
    // before startExtensionsWorker() below.
    const { loadExtensions } = await import('@/lib/extensions');
    await loadExtensions();

    if (process.env.BULLMQ_ENABLED === 'true') {
      const { startLookoutWorker, startExtensionsWorker } = await import('@/lib/services/bullmq');
      startLookoutWorker();
      console.log('[Zetora] BullMQ Lookout Worker started');

      if (startExtensionsWorker()) {
        console.log('[Zetora] BullMQ Extensions Worker started');
      }
    }
  }
}
