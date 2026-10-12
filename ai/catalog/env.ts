// Env values left at their 'placeholder' default (env/server.ts) count as unset.
export function isConfigured(value: string | undefined): value is string {
  return !!value && !value.startsWith('placeholder');
}
