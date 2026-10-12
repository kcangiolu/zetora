import { createLogger } from '@/lib/logger';

const log = createLogger('errors');

export type ErrorType = 'bad_request' | 'unauthorized' | 'forbidden' | 'not_found' | 'rate_limit' | 'offline';

export type Surface = 'chat' | 'auth' | 'api' | 'stream' | 'database' | 'history' | 'model';

export type ErrorCode = `${ErrorType}:${Surface}`;

export type ErrorVisibility = 'response' | 'log' | 'none';

export const visibilityBySurface: Record<Surface, ErrorVisibility> = {
  database: 'log',
  chat: 'response',
  auth: 'response',
  stream: 'response',
  api: 'response',
  history: 'response',
  model: 'response',
};

export class ChatSDKError extends Error {
  public type: ErrorType;
  public surface: Surface;
  public statusCode: number;

  constructor(errorCode: ErrorCode, cause?: string) {
    super();

    const [type, surface] = errorCode.split(':');

    this.type = type as ErrorType;
    this.cause = cause;
    this.surface = surface as Surface;
    this.message = getMessageByErrorCode(errorCode);
    this.statusCode = getStatusCodeByType(this.type);
  }

  public toResponse() {
    const code: ErrorCode = `${this.type}:${this.surface}`;
    const visibility = visibilityBySurface[this.surface];

    const { message, cause, statusCode } = this;

    if (visibility === 'log') {
      log.error({
        code,
        message,
        cause,
      });

      return Response.json(
        { code: '', message: 'Something went wrong. Please try again later.' },
        { status: statusCode },
      );
    }

    return Response.json({ code, message, cause }, { status: statusCode });
  }
}

export function getMessageByErrorCode(errorCode: ErrorCode): string {
  if (errorCode.includes('database')) {
    return 'An error occurred while executing a database query.';
  }

  switch (errorCode) {
    case 'bad_request:api':
      return "The request couldn't be processed. Please check your input and try again.";
    case 'rate_limit:api':
      return 'You have reached your daily free limit for today.';

    case 'unauthorized:auth':
      return 'You need to sign in before continuing.';
    case 'forbidden:auth':
      return 'Your account does not have access to this feature.';

    case 'rate_limit:chat':
      return 'You have exceeded your maximum number of messages for the day. Please try again later.';
    case 'not_found:chat':
      return 'The requested chat was not found. Please check the chat ID and try again.';
    case 'forbidden:chat':
      return 'This chat belongs to another user. Please check the chat ID and try again.';
    case 'bad_request:chat':
      return "This conversation's mode is locked by its first message and can't be switched.";
    case 'unauthorized:chat':
      return 'You need to sign in to view this chat. Please sign in and try again.';
    case 'offline:chat':
      return "We're having trouble sending your message. Please check your internet connection and try again.";

    case 'not_found:model':
      return 'No model is available for this request.';
    case 'unauthorized:model':
      return 'You need to sign in to access this AI model.';
    case 'bad_request:model':
      return "/startwith isn't supported by this model — try a llama.cpp/Ollama custom model, or an Anthropic model.";

    case 'forbidden:api':
      return 'Access denied';

    default:
      return 'Something went wrong. Please try again later.';
  }
}

function getStatusCodeByType(type: ErrorType) {
  switch (type) {
    case 'bad_request':
      return 400;
    case 'unauthorized':
      return 401;
    case 'forbidden':
      return 403;
    case 'not_found':
      return 404;
    case 'rate_limit':
      return 429;
    case 'offline':
      return 503;
    default:
      return 500;
  }
}

// Utility functions for error handling
export function isAuthError(error: ChatSDKError): boolean {
  return error.surface === 'auth';
}

export function isModelError(error: ChatSDKError): boolean {
  return error.surface === 'model';
}

export function isSignInRequired(error: ChatSDKError): boolean {
  return (
    error.type === 'unauthorized' && (error.surface === 'auth' || error.surface === 'chat' || error.surface === 'model')
  );
}

export function isRateLimited(error: ChatSDKError): boolean {
  return error.type === 'rate_limit';
}

// Helper function to get error action suggestions
export function getErrorActions(error: ChatSDKError): {
  primary?: { label: string; action: string };
  secondary?: { label: string; action: string };
} {
  if (isSignInRequired(error)) {
    return {
      primary: { label: 'Sign In', action: 'signin' },
      secondary: { label: 'Try Again', action: 'retry' },
    };
  }

  if (isRateLimited(error)) {
    return {
      primary: { label: 'Try Again Later', action: 'retry' },
    };
  }

  return {
    primary: { label: 'Try Again', action: 'retry' },
  };
}

// Helper function to get error icon type
export function getErrorIcon(error: ChatSDKError): 'warning' | 'error' | 'auth' {
  if (isSignInRequired(error)) return 'auth';
  if (error.type === 'offline') return 'warning';
  return 'error';
}
