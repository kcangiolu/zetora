/* eslint-disable @next/next/no-img-element */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { sileo } from 'sileo';
import { all } from 'better-all';
import { getBetterAllOptions } from '@/lib/better-all';
import { checkImageModeration } from '@/app/actions';
import { getOversizedFileReason, MAX_UPLOADED_IMAGE_SIZE } from '@/components/ui/form-component/attachment-utils';
import { compressImageForUpload } from '@/components/ui/form-component/image-compression';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Download,
  X,
  ExternalLink,
  Maximize2,
  FileText,
  AlignLeft,
  AlertCircle,
  RefreshCw,
  LogIn,
  CornerDownRight,
  Upload,
  CheckCircle2,
  Trash2,
  Loader2,
  Globe,
  AtSign,
  BookOpen,
  MessageCircle,
  Youtube,
  Music,
  Film,
  MapPin,
  CloudSun,
  Languages,
  Terminal,
  Plane,
  LineChart,
  Puzzle,
  Database,
  TrendingUp,
  DollarSign,
  Coins,
  Search,
  Wrench,
  Github,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { UIMessagePart } from 'ai';
import { deleteTrailingMessages } from '@/app/actions';
import { getErrorActions, getErrorIcon, isSignInRequired, isRateLimited } from '@/lib/errors';
import { UserIcon } from '@phosphor-icons/react';
import { HugeiconsIcon } from '@/components/ui/hugeicons';
import { Copy01Icon, PencilEdit02Icon } from '@hugeicons/core-free-icons';
import { Attachment, ChatMessage, ChatTools, CustomUIDataTypes } from '@/lib/types';
import { UseChatHelpers } from '@ai-sdk/react';
import { ComprehensiveUserData } from '@/lib/user-data-server';
import { cn } from '@/lib/utils';
// Enhanced Error Display Component
interface EnhancedErrorDisplayProps {
  error: any;
  handleRetry?: () => Promise<void>;
  handleDelete?: () => Promise<void>;
  user?: any;
  isOwner?: boolean;
  selectedVisibilityType?: 'public' | 'private';
}

const EnhancedErrorDisplay: React.FC<EnhancedErrorDisplayProps> = ({
  error,
  handleRetry,
  handleDelete,
  user,
  isOwner = true,
  selectedVisibilityType,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const canDelete = handleDelete && ((user && isOwner) || (!user && selectedVisibilityType === 'private'));
  let parsedError: any = null;
  let isChatSDKError = false;

  if (error) {
    try {
      const errorData = JSON.parse(error.message);
      if (errorData.code && errorData.message) {
        parsedError = {
          type: errorData.code.split(':')[0],
          surface: errorData.code.split(':')[1],
          message: errorData.message,
          cause: errorData.cause,
        };
        isChatSDKError = true;
      }
    } catch (e) {
      // Not JSON, fallback
      parsedError = {
        type: 'unknown',
        surface: 'chat',
        message: error.message,
        cause: (error as any).cause,
      };
      isChatSDKError = false;
    }
  }

  // Get error details
  const errorIcon = getErrorIcon(parsedError as any);
  const errorMessage = isChatSDKError
    ? parsedError.message
    : typeof error === 'string'
      ? error
      : (error as any).message || 'Something went wrong while processing your message';
  const errorCause = isChatSDKError ? parsedError.cause : typeof error === 'string' ? undefined : (error as any).cause;
  const errorCode = isChatSDKError ? `${parsedError.type}:${parsedError.surface}` : null;
  const actions = isChatSDKError
    ? getErrorActions(parsedError as any)
    : { primary: { label: 'Try Again', action: 'retry' } };

  // Get icon component based on error type
  const getIconComponent = () => {
    switch (errorIcon) {
      case 'auth':
        return <UserIcon className="h-4 w-4 text-blue-500 dark:text-blue-300" weight="fill" />;
      case 'warning':
        return <AlertCircle className="h-4 w-4 text-orange-500 dark:text-orange-300" />;
      default:
        return <AlertCircle className="h-4 w-4 text-red-500 dark:text-red-300" />;
    }
  };

  // Get color scheme based on error type
  const getColorScheme = () => {
    switch (errorIcon) {
      case 'auth':
        return {
          bg: 'bg-primary/5 dark:bg-primary/10',
          border: 'border-primary/20 dark:border-primary/30',
          iconBg: 'bg-primary/10 dark:bg-primary/20',
          title: 'text-primary dark:text-primary',
          text: 'text-primary/80 dark:text-primary/80',
          button: 'bg-primary hover:bg-primary/90 text-primary-foreground',
        };
      case 'warning':
        return {
          bg: 'bg-muted dark:bg-muted',
          border: 'border-muted-foreground/20 dark:border-muted-foreground/30',
          iconBg: 'bg-muted-foreground/10 dark:bg-muted-foreground/20',
          title: 'text-muted-foreground dark:text-muted-foreground',
          text: 'text-muted-foreground/80 dark:text-muted-foreground/80',
          button: 'bg-muted-foreground hover:bg-muted-foreground/90 text-background',
        };
      default:
        return {
          bg: 'bg-destructive/5 dark:bg-destructive/10',
          border: 'border-destructive/20 dark:border-destructive/30',
          iconBg: 'bg-destructive/10 dark:bg-destructive/20',
          title: 'text-destructive dark:text-destructive',
          text: 'text-destructive/80 dark:text-destructive/80',
          button: 'bg-destructive hover:bg-destructive/90 text-destructive-foreground',
        };
    }
  };

  const colors = getColorScheme();

  // Handle action clicks
  const handleAction = (action: string) => {
    switch (action) {
      case 'signin':
        window.location.href = '/sign-in';
        break;
      case 'retry':
        if (handleRetry) {
          handleRetry();
        }
        break;
      default:
        if (handleRetry) {
          handleRetry();
        }
    }
  };

  // Determine if user can perform action
  const canPerformAction = (action: string) => {
    if (action === 'retry') {
      return (user || selectedVisibilityType === 'private') && handleRetry;
    }
    return true;
  };

  return (
    <div className="mt-3">
      <div className={`rounded-lg border ${colors.border} bg-background dark:bg-background overflow-hidden`}>
        <div className={`${colors.bg} px-4 py-3 border-b ${colors.border} flex items-start gap-3`}>
          <div className="mt-0.5">
            <div className={`${colors.iconBg} p-1.5 rounded-full`}>{getIconComponent()}</div>
          </div>
          <div className="flex-1">
            <h3 className={`font-medium ${colors.title}`}>
              {isChatSDKError && isSignInRequired(parsedError as any) && 'Sign In Required'}
              {isChatSDKError && isRateLimited(parsedError as any) && 'Rate Limited'}
              {isChatSDKError &&
                !isSignInRequired(parsedError as any) &&
                !isRateLimited(parsedError as any) &&
                'Error'}
              {!isChatSDKError && 'Error'}
            </h3>
            <p className={`text-sm ${colors.text} mt-0.5`}>{errorMessage}</p>
            {errorCode && <p className={`text-xs ${colors.text} mt-1 font-mono`}>Error Code: {errorCode}</p>}
          </div>
        </div>

        <div className="px-4 py-3">
          {errorCause && (
            <div className="mb-3 p-3 bg-muted dark:bg-muted rounded-md border border-border dark:border-border font-mono text-xs text-muted-foreground dark:text-muted-foreground overflow-x-auto">
              {errorCause.toString()}
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-muted-foreground dark:text-muted-foreground text-xs">
              {!user && selectedVisibilityType === 'public'
                ? 'Please sign in to retry or try a different prompt'
                : 'You can retry your request or try a different approach'}
            </p>
            <div className="flex gap-2">
              {canDelete && (
                <Button
                  onClick={async () => {
                    if (isDeleting || !handleDelete) return;
                    try {
                      setIsDeleting(true);
                      await handleDelete();
                    } finally {
                      setIsDeleting(false);
                    }
                  }}
                  disabled={isDeleting}
                  variant="outline"
                  size="sm"
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  {isDeleting ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                  )}
                  Delete
                </Button>
              )}
              {actions.secondary && canPerformAction(actions.secondary.action) && (
                <Button
                  onClick={() => handleAction(actions.secondary!.action)}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                >
                  {actions.secondary.action === 'retry' && <RefreshCw className="mr-2 h-3.5 w-3.5" />}
                  {actions.secondary.label}
                </Button>
              )}
              {actions.primary && canPerformAction(actions.primary.action) && (
                <Button onClick={() => handleAction(actions.primary!.action)} className={colors.button} size="sm">
                  {actions.primary.action === 'signin' && <LogIn className="mr-2 h-3.5 w-3.5" />}
                  {actions.primary.action === 'retry' && <RefreshCw className="mr-2 h-3.5 w-3.5" />}
                  {actions.primary.label}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export { EnhancedErrorDisplay };

function MissingAssistantResponseNotice({
  user,
  selectedVisibilityType,
  isOwner = true,
  handleRetry,
  handleDelete,
}: {
  user?: ComprehensiveUserData | null;
  selectedVisibilityType?: 'public' | 'private';
  isOwner?: boolean;
  handleRetry?: () => Promise<void>;
  handleDelete?: () => Promise<void>;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const canAct = (user && isOwner) || (!user && selectedVisibilityType === 'private');

  return (
    <div className="flex items-start mt-4">
      <div className="w-full">
        <div className="flex flex-col gap-4 bg-primary/10 border border-primary/20 dark:border-primary/20 rounded-lg p-4">
          <div className=" mb-4 max-w-2xl">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-secondary-foreground dark:text-secondary-foreground mt-0.5 shrink-0" />
              <div className="flex-1">
                <h3 className="font-medium text-secondary-foreground dark:text-secondary-foreground mb-1">
                  No response generated
                </h3>
                <p className="text-sm text-secondary-foreground/80 dark:text-secondary-foreground/80">
                  It looks like the assistant didn’t provide a response to your message.
                </p>
              </div>
            </div>
          </div>

          <div className="px-4 py-3 flex items-center justify-between bg-primary/10 border border-primary/20 dark:border-primary/20 rounded-lg mb-4 max-w-2xl">
            <p className="text-muted-foreground dark:text-muted-foreground text-xs">
              {!user && selectedVisibilityType === 'public'
                ? 'Please sign in to retry or try a different prompt'
                : 'Try regenerating the response, delete it, or rephrase your question'}
            </p>
            {canAct && (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isDeleting}
                  onClick={async () => {
                    if (isDeleting || !handleDelete) return;
                    try {
                      setIsDeleting(true);
                      await handleDelete();
                    } finally {
                      setIsDeleting(false);
                    }
                  }}
                  className="text-muted-foreground hover:text-destructive"
                >
                  {isDeleting ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                  )}
                  Delete
                </Button>
                <Button
                  onClick={handleRetry}
                  className="bg-secondary hover:bg-secondary/90 text-secondary-foreground"
                  size="sm"
                >
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  Generate Response
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface MessageProps {
  message: ChatMessage;
  index: number;
  lastUserMessageIndex: number;
  renderPart: (
    part: ChatMessage['parts'][number],
    messageIndex: number,
    partIndex: number,
    parts: ChatMessage['parts'][number][],
    message: ChatMessage,
  ) => React.ReactNode;
  status: UseChatHelpers<ChatMessage>['status'];
  messages: ChatMessage[];
  setMessages: UseChatHelpers<ChatMessage>['setMessages'];
  sendMessage: UseChatHelpers<ChatMessage>['sendMessage'];
  regenerate: UseChatHelpers<ChatMessage>['regenerate'];
  // See messages.tsx's own isHermesChat comment: regenerate() always targets
  // /api/search, which a Hermes-mode chat never uses.
  isHermesChat?: boolean;
  // Hermes's best-effort `react` ack on THIS user message (👀 seen → ✅/❌ done), or null.
  hermesReaction?: string | null;
  setSuggestedQuestions: (questions: string[]) => void;
  suggestedQuestions: string[];
  user?: ComprehensiveUserData | null;
  selectedVisibilityType?: 'public' | 'private';
  isLastMessage?: boolean;
  error?: any;
  isMissingAssistantResponse?: boolean;
  handleRetry?: () => Promise<void>;
  handleDelete?: () => Promise<void>;
  isOwner?: boolean;
  onHighlight?: (text: string) => void;
  shouldReduceHeight?: boolean;
  attachmentsRenderer?: (attachments: Attachment[]) => React.ReactNode;
  onBeforeSubmit?: () => void;
  isEditing: boolean;
  onEditingChange: (messageId: string | null) => void;
  editDraft: MessageEditDraft | null;
  setEditDraft: React.Dispatch<React.SetStateAction<MessageEditDraft | null>>;
}

// In-progress state of the message editor, owned by the message list so it
// survives Virtuoso unmounting and remounting the edited item.
export interface MessageEditDraft {
  content: string;
  hasAttachmentEdits: boolean;
}

// Message Editor Component
interface MessageEditorProps {
  message: ChatMessage;
  setMode: (mode: 'view' | 'edit') => void;
  // null until the first change: the editor then shows the message's own content.
  draft: MessageEditDraft | null;
  setDraft: React.Dispatch<React.SetStateAction<MessageEditDraft | null>>;
  setMessages: UseChatHelpers<ChatMessage>['setMessages'];
  regenerate: UseChatHelpers<ChatMessage>['regenerate'];
  isHermesChat?: boolean;
  messages: ChatMessage[];
  setSuggestedQuestions: (questions: string[]) => void;
  user?: ComprehensiveUserData | null;
}

const MAX_EDITOR_FILES = 4;
const MAX_EDITOR_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_EDITOR_DOCUMENT_SIZE = 50 * 1024 * 1024;
// No restriction beyond the browser's own file picker — any other extension
// is still accepted server-side (see isTextLikeType in app/api/upload) and
// routed to inline/RAG based on whether it decodes as text.
const EDITOR_ACCEPTED_FILE_TYPES = undefined;
const EDITOR_DOCUMENT_MIME_TYPES = [
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

function getMaxSizeForFile(file: File): number {
  return isImageFile(file) ? MAX_EDITOR_IMAGE_SIZE : MAX_EDITOR_DOCUMENT_SIZE;
}

function insertFileParts(
  parts: ChatMessage['parts'][number][],
  newFileParts: ChatMessage['parts'][number][],
): ChatMessage['parts'][number][] {
  if (newFileParts.length === 0) return parts;

  const updatedParts: ChatMessage['parts'][number][] = [];
  let inserted = false;

  for (const part of parts) {
    if (!inserted && part.type === 'text') {
      updatedParts.push(...newFileParts);
      inserted = true;
    }
    updatedParts.push(part);
  }

  if (!inserted) {
    updatedParts.push(...newFileParts);
  }

  return updatedParts;
}

function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const MessageEditor: React.FC<MessageEditorProps> = ({
  message,
  setMode,
  draft,
  setDraft,
  setMessages,
  regenerate,
  isHermesChat = false,
  messages,
  setSuggestedQuestions,
  user,
}) => {
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isDragActive, setIsDragActive] = useState<boolean>(false);
  const originalContent =
    message.parts
      ?.map((part) => (part.type === 'text' ? part.text : ''))
      .join('')
      .trim() || '';
  const draftContent = draft?.content ?? originalContent;
  const hasAttachmentEdits = draft?.hasAttachmentEdits ?? false;
  const updateDraft = useCallback(
    (changes: Partial<MessageEditDraft>) =>
      setDraft((current) => ({
        content: current?.content ?? originalContent,
        hasAttachmentEdits: current?.hasAttachmentEdits ?? false,
        ...changes,
      })),
    [setDraft, originalContent],
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      adjustHeight();
    }
  }, []);

  const adjustHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight + 2}px`;
    }
  };

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateDraft({ content: event.target.value });
    adjustHeight();
  };

  const uploadFile = useCallback(async (file: File): Promise<Attachment> => {
    try {
      const isImage = file.type.startsWith('image/');
      const fileToUpload = isImage ? await compressImageForUpload(file) : file;

      if (isImage && fileToUpload.size > MAX_UPLOADED_IMAGE_SIZE) {
        throw new Error(
          `Still over ${MAX_UPLOADED_IMAGE_SIZE / (1024 * 1024)}MB after compression — try a smaller or simpler image, or an animated GIF/HEIC photo that can't be auto-compressed.`,
        );
      }

      const presignResponse = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: fileToUpload.name,
          contentType: fileToUpload.type,
          size: fileToUpload.size,
        }),
      });

      if (!presignResponse.ok) {
        const errorText = await presignResponse.text();
        throw new Error(`Failed to get upload URL: ${presignResponse.status} ${errorText}`);
      }

      const { presignedUrl, url } = await presignResponse.json();

      const uploadResponse = await fetch(presignedUrl, {
        method: 'PUT',
        body: fileToUpload,
        headers: {
          'Content-Type': fileToUpload.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload file: ${uploadResponse.status}`);
      }

      return {
        name: fileToUpload.name,
        contentType: fileToUpload.type,
        url,
      };
    } catch (error) {
      sileo.error({
        title: `Failed to upload ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
      throw error;
    }
  }, []);

  const handleFilesUpload = useCallback(
    async (files: File[], onFinish: () => void) => {
      if (files.length === 0) {
        onFinish();
        return;
      }

      const currentFileCount = message.parts?.filter((part) => part.type === 'file').length ?? 0;
      const imageFiles: File[] = [];
      const pdfFiles: File[] = [];
      const documentFiles: File[] = [];
      const textFiles: File[] = []; // any other extension — inlined or RAG'd server-side if it decodes as text
      const oversizedFiles: File[] = [];

      files.forEach((file) => {
        if (file.size > getMaxSizeForFile(file)) {
          oversizedFiles.push(file);
          return;
        }

        if (file.type.startsWith('image/')) {
          imageFiles.push(file);
        } else if (file.type === 'application/pdf') {
          pdfFiles.push(file);
        } else if (EDITOR_DOCUMENT_MIME_TYPES.includes(file.type)) {
          documentFiles.push(file);
        } else {
          textFiles.push(file);
        }
      });

      if (oversizedFiles.length > 0) {
        oversizedFiles.forEach((file) => {
          sileo.error({ title: `${file.name} is too large`, description: getOversizedFileReason(file) });
        });
      }

      const validFiles: File[] = [...imageFiles, ...documentFiles, ...pdfFiles, ...textFiles];
      if (validFiles.length === 0) {
        onFinish();
        return;
      }

      const totalAttachments = currentFileCount + validFiles.length;
      if (totalAttachments > MAX_EDITOR_FILES) {
        sileo.error({ title: `You can only attach up to ${MAX_EDITOR_FILES} files.` });
        onFinish();
        return;
      }

      if (imageFiles.length > 0) {
        try {
          sileo.info({ title: 'Checking images for safety...' });
          const imageMap = await all(
            Object.fromEntries(imageFiles.map((file, index) => [`img:${index}`, async () => fileToDataURL(file)])),
            getBetterAllOptions(),
          );
          const imageDataURLs = imageFiles.map((_, index) => imageMap[`img:${index}`]);
          const moderationResult = await checkImageModeration(imageDataURLs);
          if (moderationResult !== 'safe') {
            const [status, category] = moderationResult.split('\n');
            if (status === 'unsafe') {
              sileo.error({
                title: `Image content violates safety guidelines (${category}). Please choose different images.`,
              });
              onFinish();
              return;
            }
          }
        } catch (error) {
          sileo.error({ title: 'Unable to verify image safety. Please try again.' });
          onFinish();
          return;
        }
      }

      setIsUploading(true);

      try {
        const uploadedAttachments: Attachment[] = [];
        for (const file of validFiles) {
          try {
            const attachment = await uploadFile(file);
            uploadedAttachments.push(attachment);
          } catch (error) {
            // Continue uploading remaining files
          }
        }

        if (uploadedAttachments.length > 0) {
          const newFileParts = uploadedAttachments.map((attachment) => ({
            type: 'file' as const,
            url: attachment.url,
            name: attachment.name,
            mediaType: attachment.contentType || attachment.mediaType || '',
          }));

          setMessages((currentMessages) => {
            const messageIndex = currentMessages.findIndex((m) => m.id === message.id);
            if (messageIndex === -1) return currentMessages;
            const currentMessage = currentMessages[messageIndex];
            const currentParts = Array.isArray(currentMessage.parts) ? currentMessage.parts : [];
            const updatedMessage = {
              ...currentMessage,
              parts: insertFileParts(currentParts, newFileParts),
            };
            const updatedMessages = [...currentMessages];
            updatedMessages[messageIndex] = updatedMessage;
            return updatedMessages;
          });

          updateDraft({ hasAttachmentEdits: true });
          sileo.success({
            title: `${uploadedAttachments.length} file${uploadedAttachments.length > 1 ? 's' : ''} uploaded successfully`,
          });
        } else {
          sileo.error({ title: 'No files were successfully uploaded' });
        }
      } catch (error) {
        sileo.error({ title: 'Failed to upload one or more files. Please try again.' });
      } finally {
        setIsUploading(false);
        onFinish();
      }
    },
    [message.id, message.parts, setMessages, uploadFile, updateDraft],
  );

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      await handleFilesUpload(files, () => {
        event.target.value = '';
      });
    },
    [handleFilesUpload],
  );

  const handleUploadClick = useCallback(() => {
    if (isUploading || isSubmitting) return;
    fileInputRef.current?.click();
  }, [isSubmitting, isUploading]);

  const handleDragOver = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (isUploading || isSubmitting) return;
      if (event.dataTransfer.items && event.dataTransfer.items.length > 0) {
        const hasFile = Array.from(event.dataTransfer.items).some((item) => item.kind === 'file');
        if (hasFile) setIsDragActive(true);
      }
    },
    [isSubmitting, isUploading],
  );

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragActive(false);
      if (isUploading || isSubmitting) return;
      const files = Array.from(event.dataTransfer.files || []);
      await handleFilesUpload(files, () => {});
    },
    [handleFilesUpload, isSubmitting, isUploading],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftContent.trim()) {
      sileo.error({ title: 'Please enter a valid message.' });
      return;
    }
    if (isHermesChat) {
      sileo.error({
        title: 'Editing is not available here',
        description: 'Agent conversations are append-only — send a new message instead.',
      });
      return;
    }

    try {
      setIsSubmitting(true);

      if (user && message.id) {
        await deleteTrailingMessages({
          id: message.id,
        });
      }

      setMessages((messages) => {
        const index = messages.findIndex((m) => m.id === message.id);

        if (index !== -1) {
          const originalParts = Array.isArray(message.parts) ? message.parts : [];

          // Replace existing text part(s) with a single updated text part, preserving non-text parts and order
          const updatedTextPart = { type: 'text', text: draftContent } as ChatMessage['parts'][number];
          const mergedParts: ChatMessage['parts'][number][] = [];
          let textInserted = false;

          for (const p of originalParts) {
            if (p.type === 'text') {
              if (!textInserted) {
                mergedParts.push(updatedTextPart);
                textInserted = true;
              }
            } else {
              mergedParts.push(p);
            }
          }

          if (!textInserted) {
            mergedParts.unshift(updatedTextPart);
          }

          const updatedMessage: ChatMessage = {
            ...message,
            parts: mergedParts,
          };

          const before = messages.slice(0, index);
          return [...before, updatedMessage];
        }

        return messages;
      });

      setSuggestedQuestions([]);

      setMode('view');

      await regenerate();
    } catch (error) {
      console.error('Error updating message:', error);
      sileo.error({ title: 'Failed to update message. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isUnchanged = draftContent.trim() === originalContent && !hasAttachmentEdits;

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-3">
      {/* Editor area */}
      <div
        className={cn(
          'w-full rounded-2xl border border-border bg-accent/80 px-4 py-3 transition-colors',
          isDragActive && 'border-primary/70 bg-primary/5',
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Textarea
          ref={textareaRef}
          value={draftContent}
          onChange={handleInput}
          autoFocus
          className="prose prose-sm sm:prose-base prose-neutral dark:prose-invert prose-p:my-0 prose-pre:my-1 prose-code:before:hidden prose-code:after:hidden
          font-sans font-normal max-w-none text-base! text-foreground dark:text-foreground max-h-[60vh] overflow-y-auto
          w-full resize-none border-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 p-0! outline-none min-h-0!
          transition-colors bg-transparent!"
          placeholder="Edit your message..."
          style={{
            lineHeight: '1.5',
          }}
        />

        {/* Show editable attachments inside editor */}
        {message.parts && message.parts.filter((part) => part.type === 'file').length > 0 && (
          <div className="mt-3">
            <EditableAttachmentsBadge
              attachments={message.parts.filter((part) => part.type === 'file') as unknown as Attachment[]}
              onRemoveAttachment={(index) => {
                const updatedAttachments = message.parts.filter(
                  (_: ChatMessage['parts'][number], i: number) => i !== index,
                );
                setMessages((messages) => {
                  const messageIndex = messages.findIndex((m) => m.id === message.id);
                  if (messageIndex !== -1) {
                    const updatedMessage = {
                      ...message,
                      parts: updatedAttachments,
                    };
                    const updatedMessages = [...messages];
                    updatedMessages[messageIndex] = updatedMessage;
                    return updatedMessages;
                  }
                  return messages;
                });
                updateDraft({ hasAttachmentEdits: true });
              }}
            />
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept={EDITOR_ACCEPTED_FILE_TYPES}
          multiple
          onChange={handleFileChange}
          className="hidden"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleUploadClick}
          disabled={isSubmitting || isUploading}
          className="rounded-lg px-3"
          title="Upload files"
        >
          {isUploading ? (
            <div className="size-4 border-2 border-foreground/60 border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Upload className="h-4 w-4" />
              <span className="ml-2">Upload</span>
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setMode('view')}
          disabled={isSubmitting || isUploading}
          className="rounded-lg px-4"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={isSubmitting || isUploading || isUnchanged}
          className="rounded-lg px-5 bg-primary hover:bg-primary/90"
        >
          {isSubmitting ? (
            <div className="size-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
          ) : (
            'Done'
          )}
        </Button>
      </div>
    </form>
  );
};

// Max height for collapsed user messages (in pixels)
const USER_MESSAGE_MAX_HEIGHT = 125;

// Tool outputs that ARE the deliverable, not a research/reasoning step — kept
// visible when "Zetora task complete" is collapsed, same as the final text
// answer, regardless of whether the model also references them in its text.
// tool-datetime renders as the live clock widget (components/message-parts),
// a small graphical result worth keeping on screen rather than reducing to
// a badge like a plain research step.
export const DELIVERABLE_TOOL_PART_TYPES = new Set([
  'tool-generate_image',
  'tool-edit_image',
  'tool-download_file',
  'tool-datetime',
]);

function isDeliverablePart(part: ChatMessage['parts'][number]): boolean {
  if (part.type === 'text') return true;
  // Hermes's own interactive/media parts are never a Zetora-native reasoning/tool-call
  // step to collapse — they ARE the message. Without this, a Hermes reply that pairs
  // text with a hermes_prompt/hermes_media part gets its second part swept into the
  // same hidden-steps bucket as a native tool call, and since the "Zetora task
  // complete" toggle that would un-collapse it is itself hidden in Hermes mode (see
  // the `!isHermesChat` guard below), the card becomes permanently inaccessible.
  if (part.type === 'data-hermes_prompt' || part.type === 'data-hermes_media') return true;
  if (!DELIVERABLE_TOOL_PART_TYPES.has(part.type)) return false;
  const anyPart = part as unknown as { state?: string; output?: { success?: boolean } };
  return anyPart.state === 'output-available' && anyPart.output?.success !== false;
}

// Internal routing tools that aren't a user-meaningful "action" — never
// worth a badge (skill: always the model's first move; greeting: pure text
// formatting, no external effect).
const TOOL_BADGE_SKIP = new Set<string>(['skill', 'greeting']);

// Icon + label per tool, used to summarize a completed turn's tool calls
// into small badges once "Zetora task complete" hides the raw steps. Tools
// not listed here (e.g. MCP dynamic tools) fall back to a generic icon and
// a humanized version of their name.
const TOOL_BADGES: Partial<Record<keyof ChatTools, { label: string; Icon: LucideIcon }>> = {
  web_search: { label: 'Web search', Icon: Globe },
  xai_web_search: { label: 'Web search', Icon: Globe },
  x_search: { label: 'X search', Icon: AtSign },
  xai_x_search: { label: 'X search', Icon: AtSign },
  academic_search: { label: 'Academic search', Icon: BookOpen },
  youtube_search: { label: 'YouTube search', Icon: Youtube },
  spotify_search: { label: 'Spotify search', Icon: Music },
  reddit_search: { label: 'Reddit search', Icon: MessageCircle },
  github_search: { label: 'GitHub search', Icon: Github },
  prediction_search: { label: 'Prediction markets', Icon: LineChart },
  retrieve: { label: 'Read page', Icon: FileText },
  movie_or_tv_search: { label: 'Movies & TV', Icon: Film },
  trending_movies: { label: 'Movies & TV', Icon: Film },
  trending_tv: { label: 'Movies & TV', Icon: Film },
  find_place_on_map: { label: 'Maps', Icon: MapPin },
  nearby_places_search: { label: 'Maps', Icon: MapPin },
  get_weather_data: { label: 'Weather', Icon: CloudSun },
  text_translate: { label: 'Translation', Icon: Languages },
  code_interpreter: { label: 'Code execution', Icon: Terminal },
  track_flight: { label: 'Flight tracker', Icon: Plane },
  extreme_search: { label: 'Deep research', Icon: Sparkles },
  connectors_search: { label: 'Connector search', Icon: Puzzle },
  search_memories: { label: 'Memory lookup', Icon: Database },
  add_memory: { label: 'Memory saved', Icon: Database },
  code_context: { label: 'Code search', Icon: Search },
  file_query_search: { label: 'File search', Icon: FileText },
  stock_chart: { label: 'Stock chart', Icon: TrendingUp },
  currency_converter: { label: 'Currency', Icon: DollarSign },
  coin_data: { label: 'Crypto data', Icon: Coins },
  coin_data_by_contract: { label: 'Crypto data', Icon: Coins },
  coin_ohlc: { label: 'Crypto data', Icon: Coins },
};

function humanizeToolName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

type ToolCallSummary = { key: string; label: string; Icon: LucideIcon; count: number };

// Turns a finished turn's tool/dynamic-tool parts into a small, deduped list
// of badges (one per distinct tool, with a ×N count for repeats) — the
// persistent trace of what happened during the turn that "Zetora task
// complete" otherwise hides entirely. Deliverables are excluded since they
// already stay visible in their own right.
function summarizeToolCalls(parts: ChatMessage['parts'] | undefined): ToolCallSummary[] {
  const summaries = new Map<string, { label: string; Icon: LucideIcon; count: number }>();
  for (const part of parts ?? []) {
    if (isDeliverablePart(part)) continue;
    let toolName: string | undefined;
    if (part.type.startsWith('tool-')) {
      toolName = part.type.slice('tool-'.length);
    } else if (part.type === 'dynamic-tool') {
      toolName = (part as { toolName?: string }).toolName;
    }
    if (!toolName || TOOL_BADGE_SKIP.has(toolName)) continue;
    const badge = TOOL_BADGES[toolName as keyof ChatTools];
    const existing = summaries.get(toolName);
    if (existing) {
      existing.count += 1;
    } else {
      summaries.set(toolName, {
        label: badge?.label ?? humanizeToolName(toolName),
        Icon: badge?.Icon ?? Wrench,
        count: 1,
      });
    }
  }
  return Array.from(summaries.entries()).map(([key, value]) => ({ key, ...value }));
}

export const Message: React.FC<MessageProps> = ({
  message,
  index,
  lastUserMessageIndex,
  renderPart,
  status,
  messages,
  setMessages,
  sendMessage,
  setSuggestedQuestions,
  suggestedQuestions,
  user,
  selectedVisibilityType = 'private',
  regenerate,
  isHermesChat = false,
  hermesReaction = null,
  isLastMessage,
  error,
  isMissingAssistantResponse,
  handleRetry,
  handleDelete,
  isOwner = true,
  onHighlight,
  shouldReduceHeight = false,
  attachmentsRenderer,
  onBeforeSubmit,
  isEditing,
  onEditingChange,
  editDraft,
  setEditDraft,
}) => {
  // Only meaningful for assistant messages, but computed unconditionally
  // since hooks below depend on it and hooks can't be called conditionally.
  const isTurnStreaming = isLastMessage && (status === 'streaming' || status === 'submitted');

  // State for expanding/collapsing long user messages
  const [isExpanded, setIsExpanded] = useState(false);
  // State to track if the message exceeds max height
  const [exceedsMaxHeight, setExceedsMaxHeight] = useState(false);
  // Collapses the reasoning/tool-call steps of an assistant turn under a
  // single "Zetora task complete" header — the final text answer stays
  // visible regardless. Starts expanded while streaming (so the user can
  // watch it work) and auto-collapses once the turn finishes; click to
  // reopen and inspect the steps.
  const [isTaskExpanded, setIsTaskExpanded] = useState(isTurnStreaming);
  const wasTurnStreamingRef = React.useRef(isTurnStreaming);
  React.useEffect(() => {
    if (wasTurnStreamingRef.current && !isTurnStreaming) {
      setIsTaskExpanded(false);
    }
    wasTurnStreamingRef.current = isTurnStreaming;
  }, [isTurnStreaming]);
  // Ref to check content height
  const messageContentRef = React.useRef<HTMLDivElement>(null);
  // Edit mode lives in the message list (see MessageEditDraft), not here
  const mode = isEditing ? 'edit' : 'view';
  const setMode = useCallback(
    (nextMode: 'view' | 'edit') => onEditingChange(nextMode === 'edit' ? message.id : null),
    [onEditingChange, message.id],
  );

  const fileAttachments = React.useMemo(
    () => (message.parts?.filter((part) => part.type === 'file') as unknown as Attachment[]) ?? [],
    [message.parts],
  );

  // Determine if user message should top-align avatar based on combined text length
  const combinedUserText: string = React.useMemo(() => {
    return (
      message.parts
        ?.map((part) => (part.type === 'text' ? part.text : ''))
        .join('')
        .trim() || ''
    );
  }, [message.parts]);

  const shouldTopAlignUser: boolean = React.useMemo(() => combinedUserText.length > 50, [combinedUserText]);

  // Check if message content exceeds max height
  React.useEffect(() => {
    if (messageContentRef.current) {
      const contentHeight = messageContentRef.current.scrollHeight;
      setExceedsMaxHeight(contentHeight > USER_MESSAGE_MAX_HEIGHT);
    }
  }, [combinedUserText]);

  // Dynamic font size based on content length with mobile responsiveness
  const getDynamicFontSize = useCallback((content: string) => {
    const length = content.trim().length;
    const lines = content.split('\n').length;

    // Very short messages (like single words or short phrases)
    if (length <= 20 && lines === 1) {
      return '[&>*]:!text-lg sm:[&>*]:text-xl font-normal'; // Smaller on mobile
    }
    // Short messages (one line, moderate length)
    else if (length <= 120 && lines === 1) {
      return '[&>*]:!text-base sm:[&>*]:!text-lg'; // Smaller on mobile
    }
    // Medium messages (2-3 lines or longer single line)
    else if (lines <= 3 || length <= 200) {
      return '[&>*]:!text-sm sm:[&>*]:!text-base'; // Smaller on mobile
    }
    // Longer messages
    else {
      return '[&>*]:!text-sm sm:[&>*]:!text-base'; // Even smaller on mobile
    }
  }, []);

  const handleSuggestedQuestionClick = useCallback(
    async (question: string) => {
      // Only proceed if user is authenticated for public chats
      if (selectedVisibilityType === 'public' && !user) return;

      setSuggestedQuestions([]);
      onBeforeSubmit?.();

      sendMessage({
        parts: [{ type: 'text', text: question.trim() } as UIMessagePart<CustomUIDataTypes, ChatTools>],
        role: 'user',
      });
    },
    [sendMessage, setSuggestedQuestions, user, selectedVisibilityType, onBeforeSubmit],
  );

  if (message.role === 'user') {
    // Check if the message has parts that should be rendered
    if (message.parts && Array.isArray(message.parts) && message.parts.length > 0) {
      return (
        <div className="mb-0! px-0">
          <div className="grow min-w-0">
            {mode === 'edit' ? (
              <MessageEditor
                message={message}
                setMode={setMode}
                draft={editDraft}
                setDraft={setEditDraft}
                setMessages={setMessages}
                regenerate={regenerate}
                isHermesChat={isHermesChat}
                messages={messages}
                setSuggestedQuestions={setSuggestedQuestions}
                user={user}
              />
            ) : (
              <div className="group relative flex items-center gap-3 justify-end">
                {/* Actions on the left - vertically centered */}
                <div className="flex items-center gap-0.5 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200">
                  {/* Not offered on a Hermes chat: the edit path deletes the trailing
                      messages and re-runs the turn through /api/search, neither of which
                      means anything for a relayed conversation. MessageEditor's own submit
                      guard stays as the defensive backstop. */}
                  {!isHermesChat && ((user && isOwner) || (!user && selectedVisibilityType === 'private')) && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setMode('edit')}
                          className="p-1.5 rounded-full hover:bg-accent/80 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                          disabled={status === 'submitted' || status === 'streaming'}
                          aria-label="Edit message"
                        >
                          <HugeiconsIcon icon={PencilEdit02Icon} size={18} className="size-[18px]" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Edit message</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(
                            message.parts
                              ?.map((part) => (part.type === 'text' ? part.text : ''))
                              .join('')
                              .trim() || '',
                          );
                          sileo.success({ title: 'Copied to clipboard' });
                        }}
                        className="p-1.5 rounded-full hover:bg-accent/80 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                        aria-label="Copy message"
                      >
                        <HugeiconsIcon icon={Copy01Icon} size={18} className="size-[18px]" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Copy message</p>
                    </TooltipContent>
                  </Tooltip>
                </div>

                {/* Message content */}
                <div className="max-w-full">
                  <div
                    ref={messageContentRef}
                    className={`relative ${!isExpanded && exceedsMaxHeight ? 'max-h-[125px] overflow-hidden' : ''}`}
                  >
                    <div className="bg-accent/80 rounded-md px-4 py-2.5">
                      <div
                        className={`font-sans font-normal max-w-none ${getDynamicFontSize(combinedUserText)} text-foreground dark:text-foreground whitespace-pre-wrap wrap-break-word`}
                      >
                        {combinedUserText}
                      </div>
                      {fileAttachments.length > 0 && (
                        <div className="mt-2">
                          {attachmentsRenderer ? (
                            attachmentsRenderer(fileAttachments)
                          ) : (
                            <AttachmentsBadge attachments={fileAttachments} />
                          )}
                        </div>
                      )}
                    </div>

                    {!isExpanded && exceedsMaxHeight && (
                      <div className="absolute bottom-0 left-0 right-0 h-16 bg-linear-to-t from-background via-background/80 to-transparent pointer-events-none" />
                    )}
                  </div>

                  {/* Hermes's react ack (👀 seen → ✅/❌ done) on this message — see
                      message.tsx's hermesReaction prop / agent-event/route.ts's `react`. */}
                  {isHermesChat && hermesReaction && (
                    <div className="flex justify-end mt-1">
                      <span className="text-sm leading-none" aria-label={`Hermes reacted: ${hermesReaction}`}>
                        {hermesReaction}
                      </span>
                    </div>
                  )}

                  {exceedsMaxHeight && (
                    <button
                      onClick={() => setIsExpanded(!isExpanded)}
                      className="text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent/80 rounded px-1 py-0.5 mt-1 transition-colors inline-flex items-center gap-1"
                    >
                      <span>{isExpanded ? 'Show less' : 'Show more'}</span>
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* If this is the last message with no assistant reply (e.g. after deleting one), offer to generate one */}
            {isMissingAssistantResponse && (
              <MissingAssistantResponseNotice
                user={user}
                selectedVisibilityType={selectedVisibilityType}
                isOwner={isOwner}
                handleRetry={handleRetry}
                handleDelete={handleDelete}
              />
            )}
          </div>
        </div>
      );
    }
  }

  if (message.role === 'assistant') {
    const hasParts = Boolean(message.parts && message.parts.length > 0);
    // Only the final answer and deliverables (generated images/files) stay
    // visible when collapsed — reasoning, tool calls, and other step parts
    // are what "Zetora task complete" hides. Meaningless for Hermes (see the
    // header's own !isHermesChat guard below) — always show every part rather
    // than relying solely on isDeliverablePart to allowlist each hermes_* type.
    const showAllSteps = isTurnStreaming || isTaskExpanded || !hasParts || isHermesChat;

    // When collapsed, don't just drop hidden steps silently — replace each
    // run of consecutive hidden parts (reasoning, tool calls) with a single
    // small badge row right where it happened, e.g. between the two text
    // blocks it separates. Expanding "Zetora task complete" swaps back to
    // rendering every part in full, in place.
    const partsList: React.ReactNode[] = [];
    if (showAllSteps) {
      message.parts?.forEach((part: ChatMessage['parts'][number], partIndex: number) => {
        const key = `${message.id || index}-part-${partIndex}-${part.type}`;
        partsList.push(
          <div key={key}>
            {renderPart(part, index, partIndex, message.parts as ChatMessage['parts'][number][], message)}
          </div>,
        );
      });
    } else {
      let hiddenRun: ChatMessage['parts'][number][] = [];
      const flushHiddenRun = (atIndex: number) => {
        if (hiddenRun.length === 0) return;
        const summaries = summarizeToolCalls(hiddenRun);
        hiddenRun = [];
        if (summaries.length === 0) return;
        partsList.push(
          <div key={`${message.id || index}-tool-trace-${atIndex}`} className="flex flex-wrap items-center gap-1 my-1.5">
            {summaries.map(({ key, label, Icon, count }) => (
              <Badge
                key={key}
                variant="outline"
                className="h-5 px-1.5 gap-1 text-[10px] font-normal text-muted-foreground border-border/70 bg-transparent"
              >
                <Icon className="h-2.5 w-2.5" />
                <span>{label}</span>
                {count > 1 && <span className="opacity-70">×{count}</span>}
              </Badge>
            ))}
          </div>,
        );
      };
      message.parts?.forEach((part: ChatMessage['parts'][number], partIndex: number) => {
        if (isDeliverablePart(part)) {
          flushHiddenRun(partIndex);
          const key = `${message.id || index}-part-${partIndex}-${part.type}`;
          partsList.push(
            <div key={key}>
              {renderPart(part, index, partIndex, message.parts as ChatMessage['parts'][number][], message)}
            </div>,
          );
        } else {
          hiddenRun.push(part);
        }
      });
      flushHiddenRun(message.parts?.length ?? 0);
    }

    return (
      <div className={cn(shouldReduceHeight ? '' : 'min-h-[calc(100vh-18rem)]', '')}>
        {/* Collapses the reasoning/tool-call steps once streaming is done —
            lets the user hide everything but the final answer at a glance.
            Each hidden run's tool badges (rendered inline in partsList,
            right where the steps they replace happened) are the trace that
            survives the collapse, so it's never just a bare text block. */}
        {/* Meaningless for a Hermes message: there are no Zetora-native tool-call parts
            to collapse (Hermes messages are plain text, occasionally with its own
            markdown code fences for a tool-use summary it chose to report) — the label
            would misleadingly imply Zetora itself ran a tool-calling turn. */}
        {!isTurnStreaming && hasParts && !isHermesChat && (
          <button
            onClick={() => setIsTaskExpanded((v) => !v)}
            className="flex items-center gap-1.5 mb-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <CheckCircle2 className="h-3 w-3 text-primary/70" />
            <span>Zetora task complete</span>
            {isTaskExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        )}
        {partsList}

        {/* Missing assistant response UI moved inside assistant message */}
        {isMissingAssistantResponse && (
          <MissingAssistantResponseNotice
            user={user}
            selectedVisibilityType={selectedVisibilityType}
            isOwner={isOwner}
            handleRetry={handleRetry}
            handleDelete={handleDelete}
          />
        )}

        {/* Display error message with retry/delete buttons */}
        {error && (
          <EnhancedErrorDisplay
            error={error}
            handleRetry={handleRetry}
            handleDelete={handleDelete}
            user={user}
            isOwner={isOwner}
            selectedVisibilityType={selectedVisibilityType}
          />
        )}

        {suggestedQuestions.length > 0 && (user || selectedVisibilityType === 'private') && status !== 'streaming' && (
          <div className="w-full max-w-xl sm:max-w-2xl mt-4">
            <div className="flex items-center gap-1.5 mb-2 pr-3">
              <AlignLeft size={16} className="text-muted-foreground dark:text-muted-foreground" />
              <h2 className="font-medium texl-lg text-foreground dark:text-foreground">Follow-up</h2>
            </div>
            <div className="flex flex-col border-t border-border dark:border-border">
              {suggestedQuestions.map((question, i) => (
                <button
                  key={i}
                  onClick={() => handleSuggestedQuestionClick(question)}
                  className="w-full py-2.5 px-1 text-left flex justify-start items-center border-b last:border-none border-border dark:border-border"
                >
                  <CornerDownRight size={16} className="text-primary shrink-0 pr-1" />
                  <span className="text-foreground text-sm dark:text-foreground font-normal pr-3 hover:text-primary/80 dark:hover:text-primary/80">
                    {question}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
};

// Add display name for better debugging
Message.displayName = 'Message';

// Editable attachments badge component for edit mode
const EditableAttachmentsBadge = ({
  attachments,
  onRemoveAttachment,
}: {
  attachments: Attachment[];
  onRemoveAttachment: (index: number) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  // Every entry here already came from a `type === 'file'` message part
  // (see callers), including generic text files with an arbitrary
  // extension — no content-type filtering needed.
  const fileAttachments = attachments;

  if (fileAttachments.length === 0) return null;

  const isPdf = (attachment: Attachment) =>
    attachment.contentType === 'application/pdf' || attachment.mediaType === 'application/pdf';

  const getEditableDocumentType = (attachment: Attachment): 'csv' | 'docx' | 'xlsx' | 'pdf' | 'image' | null => {
    const contentType = attachment.contentType || attachment.mediaType || '';
    if (contentType === 'application/pdf') return 'pdf';
    if (contentType === 'text/csv') return 'csv';
    if (contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
    if (
      contentType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      contentType === 'application/vnd.ms-excel'
    )
      return 'xlsx';
    if (contentType.startsWith('image/')) return 'image';
    return null;
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {fileAttachments.map((attachment, i) => {
          // Truncate filename to 15 characters
          const fileName = attachment.name || `File ${i + 1}`;
          const truncatedName = fileName.length > 15 ? fileName.substring(0, 12) + '...' : fileName;

          const isImage = attachment.contentType?.startsWith('image/') || attachment.mediaType?.startsWith('image/');

          return (
            <div
              key={i}
              className="group flex items-center gap-1.5 max-w-xs rounded-full pl-1 pr-2 py-1 bg-muted dark:bg-muted border border-border dark:border-border"
            >
              <button
                onClick={() => {
                  setSelectedIndex(i);
                  setIsOpen(true);
                }}
                className="flex items-center gap-1.5 hover:bg-muted-foreground/10 dark:hover:bg-muted-foreground/10 rounded-full pl-0 pr-1 transition-colors"
              >
                <div className="h-6 w-6 rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-background">
                  {(() => {
                    const docType = getEditableDocumentType(attachment);
                    if (docType === 'image') {
                      return <img src={attachment.url} alt={fileName} className="h-full w-full object-cover" />;
                    }
                    return (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-muted-foreground"
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                      </svg>
                    );
                  })()}
                </div>
                <span className="text-xs font-medium text-foreground dark:text-foreground truncate">
                  {truncatedName}
                </span>
              </button>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => onRemoveAttachment(i)}
                className="h-4 w-4 p-0 text-muted-foreground hover:text-destructive dark:hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                title="Remove attachment"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          );
        })}
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="p-0 bg-background dark:bg-background sm:max-w-3xl w-[90vw] max-h-[85vh] overflow-hidden">
          <div className="flex flex-col h-full max-h-[85vh]">
            <header className="p-2 border-b border-border dark:border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    navigator.clipboard.writeText(fileAttachments[selectedIndex].url);
                    sileo.success({ title: 'File URL copied to clipboard' });
                  }}
                  className="h-8 w-8 rounded-md text-muted-foreground dark:text-muted-foreground"
                  title="Copy link"
                >
                  <Copy className="h-4 w-4" />
                </Button>

                <a
                  href={fileAttachments[selectedIndex].url}
                  download={fileAttachments[selectedIndex].name}
                  target="_blank"
                  className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground dark:text-muted-foreground hover:bg-muted dark:hover:bg-muted transition-colors"
                  title="Download"
                >
                  <Download className="h-4 w-4" />
                </a>

                {isPdf(fileAttachments[selectedIndex]) && (
                  <a
                    href={fileAttachments[selectedIndex].url}
                    target="_blank"
                    className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground dark:text-muted-foreground hover:bg-muted dark:hover:bg-muted transition-colors"
                    title="Open in new tab"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}

                <Badge
                  variant="secondary"
                  className="rounded-full px-2.5 py-0.5 text-xs font-medium bg-background dark:bg-background border border-border dark:border-border"
                >
                  {selectedIndex + 1} of {fileAttachments.length}
                </Badge>
              </div>

              <DialogClose className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground dark:text-muted-foreground hover:bg-muted dark:hover:bg-muted transition-colors">
                <X className="h-4 w-4" />
              </DialogClose>
            </header>

            <div className="flex-1 p-1 overflow-auto flex items-center justify-center">
              <div className="relative flex items-center justify-center w-full h-full">
                {isPdf(fileAttachments[selectedIndex]) ? (
                  <div className="w-full h-[60vh] flex flex-col rounded-md overflow-hidden border border-border dark:border-border mx-auto">
                    <div className="bg-muted dark:bg-muted py-1.5 px-2 flex items-center justify-between border-b border-border dark:border-border">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-red-500 dark:text-red-400" />
                        <span className="text-sm font-medium text-foreground dark:text-foreground truncate max-w-[200px]">
                          {fileAttachments[selectedIndex].name || `PDF ${selectedIndex + 1}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <a
                          href={fileAttachments[selectedIndex].url}
                          target="_blank"
                          className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground dark:text-muted-foreground hover:bg-muted-foreground/10 dark:hover:bg-muted-foreground/10 transition-colors"
                          title="Open fullscreen"
                        >
                          <Maximize2 className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </div>
                    <div className="flex-1 w-full bg-white">
                      <object
                        data={fileAttachments[selectedIndex].url}
                        type="application/pdf"
                        className="w-full h-full"
                      >
                        <div className="flex flex-col items-center justify-center w-full h-full bg-muted dark:bg-muted">
                          <FileText className="h-12 w-12 text-red-500 dark:text-red-400 mb-4" />
                          <p className="text-muted-foreground dark:text-muted-foreground text-sm mb-2">
                            PDF cannot be displayed directly
                          </p>
                          <div className="flex gap-2">
                            <a
                              href={fileAttachments[selectedIndex].url}
                              target="_blank"
                              className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-md hover:bg-red-600 transition-colors"
                            >
                              Open PDF
                            </a>
                            <a
                              href={fileAttachments[selectedIndex].url}
                              download={fileAttachments[selectedIndex].name}
                              className="px-3 py-1.5 bg-muted dark:bg-muted text-muted-foreground dark:text-muted-foreground text-xs font-medium rounded-md hover:bg-muted-foreground/10 dark:hover:bg-muted-foreground/10 transition-colors"
                            >
                              Download
                            </a>
                          </div>
                        </div>
                      </object>
                    </div>
                  </div>
                ) : (
                  (() => {
                    const editDocType = getEditableDocumentType(fileAttachments[selectedIndex]);
                    if (editDocType === 'csv' || editDocType === 'xlsx' || editDocType === 'docx') {
                      const fileLabel =
                        editDocType === 'csv'
                          ? 'CSV Spreadsheet'
                          : editDocType === 'xlsx'
                            ? 'Excel Spreadsheet'
                            : 'Word Document';
                      return (
                        <div className="flex flex-col items-center justify-center h-[60vh] w-full">
                          <div className="flex flex-col items-center justify-center p-8 rounded-xl border border-border bg-muted/30">
                            <div className="p-4 rounded-full bg-muted mb-4">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="48"
                                height="48"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="text-muted-foreground"
                              >
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                                {editDocType === 'csv' && (
                                  <>
                                    <line x1="8" y1="13" x2="16" y2="13"></line>
                                    <line x1="8" y1="17" x2="16" y2="17"></line>
                                  </>
                                )}
                                {editDocType === 'xlsx' && (
                                  <>
                                    <rect x="8" y="12" width="8" height="6" rx="1"></rect>
                                    <line x1="12" y1="12" x2="12" y2="18"></line>
                                    <line x1="8" y1="15" x2="16" y2="15"></line>
                                  </>
                                )}
                                {editDocType === 'docx' && (
                                  <>
                                    <line x1="16" y1="13" x2="8" y2="13"></line>
                                    <line x1="16" y1="17" x2="8" y2="17"></line>
                                    <line x1="10" y1="9" x2="8" y2="9"></line>
                                  </>
                                )}
                              </svg>
                            </div>
                            <h3 className="text-lg font-semibold text-foreground mb-1">
                              {fileAttachments[selectedIndex].name || `${fileLabel} ${selectedIndex + 1}`}
                            </h3>
                            <p className="text-sm text-muted-foreground mb-4">{fileLabel}</p>
                            <a
                              href={fileAttachments[selectedIndex].url}
                              download={fileAttachments[selectedIndex].name}
                              className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors"
                            >
                              Download File
                            </a>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div className="flex items-center justify-center h-[60vh]">
                        <img
                          src={fileAttachments[selectedIndex].url}
                          alt={fileAttachments[selectedIndex].name || `Image ${selectedIndex + 1}`}
                          className="max-w-full max-h-[60vh] object-contain rounded-md mx-auto"
                        />
                      </div>
                    );
                  })()
                )}

                {fileAttachments.length > 1 && (
                  <>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setSelectedIndex((prev) => (prev === 0 ? fileAttachments.length - 1 : prev - 1))}
                      className="absolute left-2 top-1/2 transform -translate-y-1/2 h-8 w-8 rounded-full bg-background/90 dark:bg-background/90 border border-border dark:border-border shadow-xs"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setSelectedIndex((prev) => (prev === fileAttachments.length - 1 ? 0 : prev + 1))}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 w-8 rounded-full bg-background/90 dark:bg-background/90 border border-border dark:border-border shadow-xs"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>

            {fileAttachments.length > 1 && (
              <div className="border-t border-neutral-200 dark:border-neutral-800 p-2">
                <div className="flex items-center justify-center gap-2 overflow-x-auto py-1 max-w-full">
                  {fileAttachments.map((attachment, idx) => {
                    const thumbEditDocType = getEditableDocumentType(attachment);
                    return (
                      <button
                        key={idx}
                        onClick={() => setSelectedIndex(idx)}
                        className={`relative h-10 w-10 rounded-md overflow-hidden shrink-0 transition-all ${
                          selectedIndex === idx
                            ? 'ring-2 ring-primary ring-offset-1 ring-offset-background'
                            : 'opacity-70 hover:opacity-100'
                        }`}
                      >
                        {thumbEditDocType === 'image' ? (
                          <img
                            src={attachment.url}
                            alt={attachment.name || `Thumbnail ${idx + 1}`}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center bg-muted">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="text-muted-foreground"
                            >
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                              <polyline points="14 2 14 8 20 8"></polyline>
                            </svg>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <footer className="border-t border-neutral-200 dark:border-neutral-800 p-2">
              <div className="text-xs text-neutral-600 dark:text-neutral-400 flex items-center justify-between">
                <span className="truncate max-w-[70%]">
                  {fileAttachments[selectedIndex].name || `File ${selectedIndex + 1}`}
                </span>
              </div>
            </footer>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

// Document type helper
const getDocumentType = (attachment: Attachment): 'csv' | 'docx' | 'xlsx' | 'pdf' | 'image' | null => {
  const contentType = attachment.contentType || attachment.mediaType || '';
  if (contentType === 'application/pdf') return 'pdf';
  if (contentType === 'text/csv') return 'csv';
  if (contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (
    contentType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    contentType === 'application/vnd.ms-excel'
  )
    return 'xlsx';
  if (contentType.startsWith('image/')) return 'image';
  return null;
};

// Export the attachments badge component for reuse
const AttachmentsBadge = ({ attachments }: { attachments: Attachment[] }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  // Every entry here already came from a `type === 'file'` message part
  // (see callers), including generic text files with an arbitrary
  // extension — no content-type filtering needed.
  const fileAttachments = attachments;

  React.useEffect(() => {
    console.log('fileAttachments', fileAttachments);
  }, [fileAttachments]);

  if (fileAttachments.length === 0) return null;

  const isPdf = (attachment: Attachment) =>
    attachment.contentType === 'application/pdf' || attachment.mediaType === 'application/pdf';

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {fileAttachments.map((attachment, i) => {
          // Truncate filename to 15 characters
          const fileName = attachment.name || `File ${i + 1}`;
          const truncatedName = fileName.length > 15 ? fileName.substring(0, 12) + '...' : fileName;

          return (
            <button
              key={i}
              onClick={() => {
                setSelectedIndex(i);
                setIsOpen(true);
              }}
              className="flex items-center gap-1.5 max-w-xs rounded-full pl-1 pr-3 py-1 bg-muted dark:bg-muted border border-border dark:border-border hover:bg-muted-foreground/10 dark:hover:bg-muted-foreground/10 transition-colors"
            >
              <div className="h-6 w-6 rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-background">
                {(() => {
                  const docType = getDocumentType(attachment);
                  if (docType === 'image') {
                    return <img src={attachment.url} alt={fileName} className="h-full w-full object-cover" />;
                  }
                  // All document types use the same muted color
                  return (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-muted-foreground"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                      {docType === 'pdf' && (
                        <>
                          <path d="M9 15v-2h6v2"></path>
                          <path d="M12 18v-5"></path>
                        </>
                      )}
                      {docType === 'csv' && (
                        <>
                          <line x1="8" y1="13" x2="16" y2="13"></line>
                          <line x1="8" y1="17" x2="16" y2="17"></line>
                        </>
                      )}
                      {docType === 'xlsx' && (
                        <>
                          <rect x="8" y="12" width="8" height="6" rx="1"></rect>
                          <line x1="12" y1="12" x2="12" y2="18"></line>
                          <line x1="8" y1="15" x2="16" y2="15"></line>
                        </>
                      )}
                      {docType === 'docx' && (
                        <>
                          <line x1="16" y1="13" x2="8" y2="13"></line>
                          <line x1="16" y1="17" x2="8" y2="17"></line>
                          <line x1="10" y1="9" x2="8" y2="9"></line>
                        </>
                      )}
                    </svg>
                  );
                })()}
              </div>
              <span className="text-xs font-medium text-foreground dark:text-foreground truncate">{truncatedName}</span>
            </button>
          );
        })}
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="p-0 bg-background dark:bg-background sm:max-w-3xl w-[90vw] max-h-[85vh] overflow-hidden">
          <div className="flex flex-col h-full max-h-[85vh]">
            <header className="p-2 border-b border-border dark:border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    navigator.clipboard.writeText(fileAttachments[selectedIndex].url);
                    sileo.success({ title: 'File URL copied to clipboard' });
                  }}
                  className="h-8 w-8 rounded-md text-muted-foreground dark:text-muted-foreground"
                  title="Copy link"
                >
                  <Copy className="h-4 w-4" />
                </Button>

                <a
                  href={fileAttachments[selectedIndex].url}
                  download={fileAttachments[selectedIndex].name}
                  target="_blank"
                  className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground dark:text-muted-foreground hover:bg-muted dark:hover:bg-muted transition-colors"
                  title="Download"
                >
                  <Download className="h-4 w-4" />
                </a>

                {isPdf(fileAttachments[selectedIndex]) && (
                  <a
                    href={fileAttachments[selectedIndex].url}
                    target="_blank"
                    className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground dark:text-muted-foreground hover:bg-muted dark:hover:bg-muted transition-colors"
                    title="Open in new tab"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}

                <Badge
                  variant="secondary"
                  className="rounded-full px-2.5 py-0.5 text-xs font-medium bg-background dark:bg-background border border-border dark:border-border"
                >
                  {selectedIndex + 1} of {fileAttachments.length}
                </Badge>
              </div>

              <DialogClose className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground dark:text-muted-foreground hover:bg-muted dark:hover:bg-muted transition-colors">
                <X className="h-4 w-4" />
              </DialogClose>
            </header>

            <div className="flex-1 p-1 overflow-auto flex items-center justify-center">
              <div className="relative flex items-center justify-center w-full h-full">
                {(() => {
                  const selectedFile = fileAttachments[selectedIndex];
                  const docType = getDocumentType(selectedFile);

                  if (docType === 'pdf') {
                    return (
                      <div className="w-full h-[60vh] flex flex-col rounded-md overflow-hidden border border-border dark:border-border mx-auto">
                        <div className="bg-muted dark:bg-muted py-1.5 px-2 flex items-center justify-between border-b border-border dark:border-border">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-red-500 dark:text-red-400" />
                            <span className="text-sm font-medium text-foreground dark:text-foreground truncate max-w-[200px]">
                              {selectedFile.name || `PDF ${selectedIndex + 1}`}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <a
                              href={selectedFile.url}
                              target="_blank"
                              className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground dark:text-muted-foreground hover:bg-muted-foreground/10 dark:hover:bg-muted-foreground/10 transition-colors"
                              title="Open fullscreen"
                            >
                              <Maximize2 className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        </div>
                        <div className="flex-1 w-full bg-white">
                          <object data={selectedFile.url} type="application/pdf" className="w-full h-full">
                            <div className="flex flex-col items-center justify-center w-full h-full bg-muted dark:bg-muted">
                              <FileText className="h-12 w-12 text-red-500 dark:text-red-400 mb-4" />
                              <p className="text-muted-foreground dark:text-muted-foreground text-sm mb-2">
                                PDF cannot be displayed directly
                              </p>
                              <div className="flex gap-2">
                                <a
                                  href={selectedFile.url}
                                  target="_blank"
                                  className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-md hover:bg-red-600 transition-colors"
                                >
                                  Open PDF
                                </a>
                                <a
                                  href={selectedFile.url}
                                  download={selectedFile.name}
                                  className="px-3 py-1.5 bg-muted dark:bg-muted text-muted-foreground dark:text-muted-foreground text-xs font-medium rounded-md hover:bg-muted-foreground/10 dark:hover:bg-muted-foreground/10 transition-colors"
                                >
                                  Download
                                </a>
                              </div>
                            </div>
                          </object>
                        </div>
                      </div>
                    );
                  }

                  if (docType === 'csv' || docType === 'xlsx' || docType === 'docx') {
                    const fileLabel =
                      docType === 'csv'
                        ? 'CSV Spreadsheet'
                        : docType === 'xlsx'
                          ? 'Excel Spreadsheet'
                          : 'Word Document';

                    return (
                      <div className="flex flex-col items-center justify-center h-[60vh] w-full">
                        <div className="flex flex-col items-center justify-center p-8 rounded-xl border border-border bg-muted/30">
                          <div className="p-4 rounded-full bg-muted mb-4">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="48"
                              height="48"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="text-muted-foreground"
                            >
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                              <polyline points="14 2 14 8 20 8"></polyline>
                              {docType === 'csv' && (
                                <>
                                  <line x1="8" y1="13" x2="16" y2="13"></line>
                                  <line x1="8" y1="17" x2="16" y2="17"></line>
                                </>
                              )}
                              {docType === 'xlsx' && (
                                <>
                                  <rect x="8" y="12" width="8" height="6" rx="1"></rect>
                                  <line x1="12" y1="12" x2="12" y2="18"></line>
                                  <line x1="8" y1="15" x2="16" y2="15"></line>
                                </>
                              )}
                              {docType === 'docx' && (
                                <>
                                  <line x1="16" y1="13" x2="8" y2="13"></line>
                                  <line x1="16" y1="17" x2="8" y2="17"></line>
                                  <line x1="10" y1="9" x2="8" y2="9"></line>
                                </>
                              )}
                            </svg>
                          </div>
                          <h3 className="text-lg font-semibold text-foreground mb-1">
                            {selectedFile.name || `${fileLabel} ${selectedIndex + 1}`}
                          </h3>
                          <p className="text-sm text-muted-foreground mb-4">{fileLabel}</p>
                          <a
                            href={selectedFile.url}
                            download={selectedFile.name}
                            className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-md transition-colors flex items-center gap-2"
                          >
                            <Download className="h-4 w-4" />
                            Download
                          </a>
                        </div>
                      </div>
                    );
                  }

                  // Default: image preview
                  return (
                    <div className="flex items-center justify-center h-[60vh]">
                      <img
                        src={selectedFile.url}
                        alt={selectedFile.name || `Image ${selectedIndex + 1}`}
                        className="max-w-full max-h-[60vh] object-contain rounded-md mx-auto"
                      />
                    </div>
                  );
                })()}

                {fileAttachments.length > 1 && (
                  <>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setSelectedIndex((prev) => (prev === 0 ? fileAttachments.length - 1 : prev - 1))}
                      className="absolute left-2 top-1/2 transform -translate-y-1/2 h-8 w-8 rounded-full bg-background/90 dark:bg-background/90 border border-border dark:border-border shadow-xs"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setSelectedIndex((prev) => (prev === fileAttachments.length - 1 ? 0 : prev + 1))}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 w-8 rounded-full bg-background/90 dark:bg-background/90 border border-border dark:border-border shadow-xs"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>

            {fileAttachments.length > 1 && (
              <div className="border-t border-border p-2">
                <div className="flex items-center justify-center gap-2 overflow-x-auto py-1 max-w-full">
                  {fileAttachments.map((attachment, idx) => {
                    const thumbDocType = getDocumentType(attachment);
                    return (
                      <button
                        key={idx}
                        onClick={() => setSelectedIndex(idx)}
                        className={`relative h-10 w-10 rounded-md overflow-hidden shrink-0 transition-all ${
                          selectedIndex === idx
                            ? 'ring-2 ring-primary ring-offset-1 ring-offset-background'
                            : 'opacity-70 hover:opacity-100'
                        }`}
                      >
                        {thumbDocType === 'image' ? (
                          <img
                            src={attachment.url}
                            alt={attachment.name || `Thumbnail ${idx + 1}`}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center bg-muted">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="text-muted-foreground"
                            >
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                              <polyline points="14 2 14 8 20 8"></polyline>
                            </svg>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <footer className="border-t border-border dark:border-border p-2">
              <div className="text-xs text-muted-foreground dark:text-muted-foreground flex items-center justify-between">
                <span className="truncate max-w-[70%]">
                  {fileAttachments[selectedIndex].name || `File ${selectedIndex + 1}`}
                </span>
              </div>
            </footer>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
