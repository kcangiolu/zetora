// Thrown when anonymization is on and a request would send content that
// cannot be pseudonymized (an image, audio, a file's raw text) to a provider
// that is not local. The message is shown to the user as is, so it says what
// was refused and which setting changes that.
export class EgressBlockedError extends Error {
  override name = 'EgressBlockedError';
}

// Thrown when the anonymization layer is active, detection failed (the
// presidio-service is unreachable/erroring), and fail-open was NOT
// requested — the caller must abort rather than risk sending cleartext.
export class AnonymizationUnavailableError extends Error {
  override name = 'AnonymizationUnavailableError';
}
