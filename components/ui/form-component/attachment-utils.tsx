import React, { useCallback } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Attachment {
  name: string;
  contentType?: string;
  mediaType?: string;
  url: string;
  size: number;
}

interface UploadingAttachment {
  file: File;
  progress: number;
}

export const ArrowUpIcon = ({ size = 16 }: { size?: number }) => {
  return (
    <svg height={size} strokeLinejoin="round" viewBox="0 0 16 16" width={size} style={{ color: 'currentcolor' }}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8.70711 1.39644C8.31659 1.00592 7.68342 1.00592 7.2929 1.39644L2.21968 6.46966L1.68935 6.99999L2.75001 8.06065L3.28034 7.53032L7.25001 3.56065V14.25V15H8.75001V14.25V3.56065L12.7197 7.53032L13.25 8.06065L14.3107 6.99999L13.7803 6.46966L8.70711 1.39644Z"
        fill="currentColor"
      ></path>
    </svg>
  );
};

export const StopIcon = ({ size = 16 }: { size?: number }) => {
  return (
    <svg height={size} viewBox="0 0 16 16" width={size} style={{ color: 'currentcolor' }}>
      <path fillRule="evenodd" clipRule="evenodd" d="M3 3H13V13H3V3Z" fill="currentColor"></path>
    </svg>
  );
};

export const MAX_FILES = 4;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB for images
const MAX_DOCUMENT_SIZE = 50 * 1024 * 1024; // 50MB for documents
export const MAX_INPUT_CHARS = 50000;

const isImageFile = (file: File): boolean => file.type.startsWith('image/');
export const getMaxSizeForFile = (file: File): number => (isImageFile(file) ? MAX_IMAGE_SIZE : MAX_DOCUMENT_SIZE);

const truncateFilename = (filename: string, maxLength: number = 20) => {
  if (filename.length <= maxLength) return filename;
  const extension = filename.split('.').pop();
  const name = filename.substring(0, maxLength - 4);
  return `${name}...${extension}`;
};

export const AttachmentPreview: React.FC<{
  attachment: Attachment | UploadingAttachment;
  onRemove: () => void;
  isUploading: boolean;
}> = React.memo(({ attachment, onRemove, isUploading }) => {
  const formatFileSize = useCallback((bytes: number): string => {
    if (bytes < 1024) return bytes + ' bytes';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
  }, []);

  const isUploadingAttachment = useCallback(
    (attachment: Attachment | UploadingAttachment): attachment is UploadingAttachment => {
      return 'progress' in attachment;
    },
    [],
  );

  const isPdf = useCallback(
    (attachment: Attachment | UploadingAttachment): boolean => {
      if (isUploadingAttachment(attachment)) {
        return attachment.file.type === 'application/pdf';
      }
      return (attachment as Attachment).contentType === 'application/pdf';
    },
    [isUploadingAttachment],
  );

  const getDocumentType = useCallback(
    (attachment: Attachment | UploadingAttachment): 'pdf' | 'csv' | 'xlsx' | 'docx' | 'image' | null => {
      const contentType = isUploadingAttachment(attachment)
        ? attachment.file.type
        : (attachment as Attachment).contentType;

      if (contentType === 'application/pdf') return 'pdf';
      if (contentType === 'text/csv') return 'csv';
      if (contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
      if (
        contentType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        contentType === 'application/vnd.ms-excel'
      )
        return 'xlsx';
      if (contentType?.startsWith('image/')) return 'image';
      return null;
    },
    [isUploadingAttachment],
  );

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'relative flex items-center',
        'bg-background/90 backdrop-blur-xs',
        'border border-border/80',
        'rounded-lg p-2 pr-8 gap-2.5',
        'shrink-0 z-0',
        'hover:bg-background',
        'transition-all duration-200',
        'group',
        'shadow-none!',
      )}
    >
      {isUploading ? (
        <div className="w-8 h-8 flex items-center justify-center">
          <svg
            className="animate-spin h-4 w-4 text-muted-foreground"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        </div>
      ) : isUploadingAttachment(attachment) ? (
        <div className="w-8 h-8 flex items-center justify-center">
          <div className="relative w-6 h-6">
            <svg className="w-full h-full" viewBox="0 0 100 100">
              <circle
                className="text-muted stroke-current"
                strokeWidth="8"
                cx="50"
                cy="50"
                r="40"
                fill="transparent"
              ></circle>
              <circle
                className="text-primary stroke-current"
                strokeWidth="8"
                strokeLinecap="round"
                cx="50"
                cy="50"
                r="40"
                fill="transparent"
                strokeDasharray={`${attachment.progress * 251.2}, 251.2`}
                transform="rotate(-90 50 50)"
              ></circle>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[10px] font-medium text-foreground">{Math.round(attachment.progress * 100)}%</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="w-8 h-8 rounded-lg overflow-hidden bg-muted shrink-0 ring-1 ring-border flex items-center justify-center">
          {(() => {
            const docType = getDocumentType(attachment);
            if (docType === 'image') {
              return (
                <img
                  src={(attachment as Attachment).url}
                  alt={`Preview of ${attachment.name}`}
                  className="h-full w-full object-cover"
                />
              );
            }
            // All document types (pdf, csv, xlsx, docx)
            return (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
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
      )}
      <div className="grow min-w-0">
        {!isUploadingAttachment(attachment) && (
          <p className="text-xs font-medium truncate text-foreground">{truncateFilename(attachment.name)}</p>
        )}
        <p className="text-[10px] text-muted-foreground">
          {isUploadingAttachment(attachment) ? 'Uploading...' : formatFileSize((attachment as Attachment).size)}
        </p>
      </div>
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className={cn(
          'absolute -top-1.5 -right-1.5 p-0.5 m-0 rounded-full',
          'bg-background/90 backdrop-blur-xs',
          'border border-border/80',
          'transition-all duration-200 z-20',
          'opacity-0 group-hover:opacity-100',
          'scale-75 group-hover:scale-100',
          'hover:bg-muted/50',
          'shadow-none!',
        )}
      >
        <X className="h-3 w-3 text-muted-foreground" />
      </motion.button>
    </motion.div>
  );
});

AttachmentPreview.displayName = 'AttachmentPreview';
