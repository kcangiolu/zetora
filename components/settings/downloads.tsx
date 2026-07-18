'use client';

import { FileFilter, formatBytes, FileTypeIcon } from './shared';

import { Button } from '@/components/ui/button';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

import { all } from 'better-all';
import { getBetterAllOptions } from '@/lib/better-all';
import { MagnifyingGlassIcon, TrashIcon } from '@phosphor-icons/react';

import {
  ExternalLink,
  Sparkles,
  Check,
  X,
  Trash2,
} from 'lucide-react';

import { useState, useMemo } from 'react';
import { allSettled as betterAllSettled } from 'better-all';
import { sileo } from 'sileo';
import { useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';

import { Loader2, Search } from 'lucide-react';

import { cn } from '@/lib/utils';

// Custom visx-based chart components

import { Input } from '@/components/ui/input';

interface GeneratedFileEntry {
  id: string;
  key: string;
  url: string;
  filename: string;
  mediaType: string | null;
  kind: 'image' | 'document';
  toolName: string | null;
  sizeBytes: number | null;
  chatId: string | null;
  createdAt: string;
}

interface DownloadsResponse {
  files: GeneratedFileEntry[];
  nextCursor: string | null;
}

export function DownloadsSection() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FileFilter>('all');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error: fetchError,
  } = useInfiniteQuery<DownloadsResponse>({
    queryKey: ['downloads'],
    queryFn: async ({ pageParam }) => {
      const cursor = pageParam as string | undefined;
      const url = cursor ? `/api/downloads?cursor=${encodeURIComponent(cursor)}&limit=50` : '/api/downloads?limit=50';
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 1000 * 60,
  });

  const allFiles = useMemo(() => data?.pages.flatMap((p) => p.files) ?? [], [data?.pages]);

  const counts = useMemo(
    () => ({
      all: allFiles.length,
      images: allFiles.filter((f) => f.kind === 'image').length,
      documents: allFiles.filter((f) => f.kind === 'document').length,
    }),
    [allFiles],
  );

  const displayFiles = useMemo(() => {
    let list = allFiles;
    if (activeFilter === 'images') list = list.filter((f) => f.kind === 'image');
    if (activeFilter === 'documents') list = list.filter((f) => f.kind === 'document');
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((f) => f.filename.toLowerCase().includes(q));
    }
    return list;
  }, [allFiles, activeFilter, searchQuery]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch('/api/downloads', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error('Delete failed');
    },
  });

  const handleDelete = async (file: GeneratedFileEntry) => {
    await deleteMutation.mutateAsync(file.id).catch(() => null);
    queryClient.invalidateQueries({ queryKey: ['downloads'] });
    sileo.success({ title: 'File deleted', icon: <Trash2 className="h-4 w-4" /> });
  };

  const handleBulkDelete = () => {
    if (selected.size === 0) return;
    setConfirmInput('');
    setConfirmOpen(true);
  };

  const executeBulkDelete = async () => {
    setBulkDeleting(true);
    setConfirmOpen(false);
    const toDelete = allFiles.filter((f) => selected.has(f.id));
    const results = await betterAllSettled(
      Object.fromEntries(
        toDelete.map((f, i) => [
          `delete:${i}`,
          async () =>
            fetch('/api/downloads', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: f.id }),
            }),
        ]),
      ),
      getBetterAllOptions(),
    );
    const failed = Object.values(results).filter((r) => r.status === 'rejected').length;
    setBulkDeleting(false);
    setSelected(new Set());
    setConfirmInput('');
    queryClient.invalidateQueries({ queryKey: ['downloads'] });
    if (failed === 0)
      sileo.success({
        title: `${toDelete.length} file${toDelete.length > 1 ? 's' : ''} deleted`,
        icon: <Trash2 className="h-4 w-4" />,
      });
    else
      sileo.error({
        title: `${failed} file${failed > 1 ? 's' : ''} failed to delete`,
        icon: <X className="h-4 w-4" />,
      });
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const allDisplaySelected = displayFiles.length > 0 && displayFiles.every((f) => selected.has(f.id));
  const someSelected = selected.size > 0;

  const toggleSelectAll = () => {
    if (allDisplaySelected) {
      setSelected((prev) => {
        const s = new Set(prev);
        displayFiles.forEach((f) => s.delete(f.id));
        return s;
      });
    } else {
      setSelected((prev) => {
        const s = new Set(prev);
        displayFiles.forEach((f) => s.add(f.id));
        return s;
      });
    }
  };

  const filters: { value: FileFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'images', label: 'Images' },
    { value: 'documents', label: 'Docs' },
  ];

  const confirmWord = 'delete';
  const confirmValid = confirmInput.trim().toLowerCase() === confirmWord;

  return (
    <>
      {/* Bulk-delete confirmation dialog */}
      <Dialog
        open={confirmOpen}
        onOpenChange={(o) => {
          setConfirmOpen(o);
          if (!o) setConfirmInput('');
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Delete {selected.size} file{selected.size > 1 ? 's' : ''}?
            </DialogTitle>
            <DialogDescription>
              This is permanent and cannot be undone. Type{' '}
              <span className="font-semibold text-foreground">{confirmWord}</span> to confirm.
            </DialogDescription>
          </DialogHeader>

          <Input
            autoFocus
            placeholder={confirmWord}
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && confirmValid) executeBulkDelete();
            }}
            className={cn(
              'mt-1 transition-colors',
              confirmInput && !confirmValid && 'border-destructive focus-visible:ring-destructive/30',
            )}
          />

          <DialogFooter className="mt-2">
            <Button
              variant="outline"
              onClick={() => {
                setConfirmOpen(false);
                setConfirmInput('');
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" disabled={!confirmValid || bulkDeleting} onClick={executeBulkDelete}>
              {bulkDeleting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Deleting…
                </>
              ) : (
                `Delete ${selected.size}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-4">
        <p className="text-xs text-muted-foreground/70 -mt-1">
          Images and documents generated by the AI tools (image generation/editing, code interpreter charts,
          document export) — stored on your own bucket.
        </p>

        {fetchError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            Failed to load downloads. Please try again.
          </div>
        )}

        <div className="rounded-xl border border-border/60 divide-y divide-border/40 px-4">
          <div className="flex items-center gap-3 py-2.5">
            <Search className="size-3.5 text-muted-foreground/50 shrink-0" />
            <input
              type="text"
              placeholder="Search files…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/40"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between py-2.5">
            <div className="flex items-center gap-1">
              {filters.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setActiveFilter(f.value)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all duration-150',
                    activeFilter === f.value
                      ? 'bg-foreground text-background font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                  )}
                >
                  {f.label}
                  <span
                    className={cn(
                      'text-[10px] tabular-nums leading-none',
                      activeFilter === f.value ? 'opacity-70' : 'text-muted-foreground/50',
                    )}
                  >
                    {counts[f.value]}
                  </span>
                </button>
              ))}
            </div>
            <span className="text-[11px] tabular-nums text-muted-foreground/50">
              {counts.all > 0 ? formatBytes(allFiles.reduce((s, f) => s + (f.sizeBytes ?? 0), 0)) : ''}
            </span>
          </div>
        </div>

        {someSelected && (
          <div className="flex items-center justify-between px-4 py-2.5 rounded-xl border border-primary/25 bg-primary/5">
            <div className="flex items-center gap-2.5">
              <button
                onClick={toggleSelectAll}
                className={cn(
                  'w-4 h-4 rounded-sm border-2 shrink-0 flex items-center justify-center transition-all',
                  allDisplaySelected ? 'bg-primary border-primary' : 'border-primary/60 bg-background',
                )}
              >
                {allDisplaySelected && <Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={3.5} />}
              </button>
              <span className="text-sm font-medium text-primary">{selected.size} selected</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear
              </button>
              <Button
                size="sm"
                variant="destructive"
                className="h-7 px-3 text-xs gap-1.5"
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
              >
                {bulkDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <TrashIcon className="h-3 w-3" />}
                Delete {selected.size}
              </Button>
            </div>
          </div>
        )}

        {isLoading && !allFiles.length ? (
          <div className="flex justify-center items-center h-32">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : displayFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 rounded-xl border border-dashed border-border/60">
            <Sparkles className="h-5 w-5 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">
              {allFiles.length === 0 ? 'Nothing generated yet' : 'No files match'}
            </p>
            <p className="text-xs text-muted-foreground/50 mt-0.5">
              {allFiles.length === 0
                ? 'Images and documents Zetora generates for you will appear here'
                : 'Try a different search or filter'}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border/60 divide-y divide-border/40 overflow-hidden">
            <div
              className="flex items-center gap-3 px-4 py-2.5 bg-muted/20 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={toggleSelectAll}
            >
              <div
                className={cn(
                  'w-4 h-4 rounded-sm border-2 shrink-0 flex items-center justify-center transition-all',
                  allDisplaySelected ? 'bg-primary border-primary' : 'border-border/60 bg-background',
                )}
              >
                {allDisplaySelected && <Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={3.5} />}
              </div>
              <span className="text-xs text-muted-foreground">
                {displayFiles.length} {displayFiles.length === 1 ? 'file' : 'files'}
              </span>
            </div>

            <div className="overflow-y-auto max-h-[55vh] divide-y divide-border/40 scrollbar-w-1 scrollbar-track-transparent scrollbar-thumb-muted-foreground/20 hover:scrollbar-thumb-muted-foreground/30">
              {displayFiles.map((file) => {
                const isSelected = selected.has(file.id);
                return (
                  <div
                    key={file.id}
                    onClick={() => toggleSelect(file.id)}
                    className={cn(
                      'group flex items-center gap-3 px-4 py-3.5 cursor-pointer select-none transition-colors',
                      isSelected ? 'bg-primary/5' : 'hover:bg-accent/30',
                    )}
                  >
                    <div
                      className={cn(
                        'w-4 h-4 rounded-sm border-2 shrink-0 flex items-center justify-center transition-all',
                        isSelected
                          ? 'bg-primary border-primary'
                          : 'border-border/60 bg-background group-hover:border-primary/40',
                      )}
                    >
                      {isSelected && <Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={3.5} />}
                    </div>

                    <FileTypeIcon mediaType={file.mediaType} filename={file.filename} />

                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm font-medium truncate', isSelected && 'text-primary')}>
                        {file.filename}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                        <span className="tabular-nums">{formatBytes(file.sizeBytes ?? 0)}</span>
                        <span className="opacity-30">·</span>
                        <span>
                          {new Date(file.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                        {file.toolName && (
                          <>
                            <span className="opacity-30">·</span>
                            <span className="truncate">{file.toolName}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {file.chatId && (
                        <a
                          href={`/search/${file.chatId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="h-7 px-2 flex items-center gap-1 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          title="Go to chat"
                        >
                          <MagnifyingGlassIcon className="h-3.5 w-3.5" />
                          <span>Go to search</span>
                        </a>
                      )}
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title="Open file"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          await handleDelete(file);
                        }}
                        disabled={deleteMutation.isPending}
                        className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
                        title="Delete"
                      >
                        {deleteMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <TrashIcon className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {hasNextPage && (
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="w-full py-3 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1.5"
              >
                {isFetchingNextPage ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading…
                  </>
                ) : (
                  'Load more'
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// Component for Memories
