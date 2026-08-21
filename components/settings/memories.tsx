'use client';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

import { all } from 'better-all';

import { CalendarIcon, TrashIcon, PencilIcon, PlusIcon } from '@phosphor-icons/react';

import { X, Trash2, Check } from 'lucide-react';

import { useState } from 'react';

import { sileo } from 'sileo';
import { useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { getAllMemories, deleteMemory, addMemoryManual, updateMemory, MemoryItem } from '@/lib/memory-actions';
import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

import { HugeiconsIcon } from '@/components/ui/hugeicons';
import { Brain02Icon } from '@hugeicons/core-free-icons';

// Custom visx-based chart components

export function MemoriesSection() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingMemoryIds, setDeletingMemoryIds] = useState<Set<string>>(new Set());
  const [isAdding, setIsAdding] = useState(false);
  const [newMemoryContent, setNewMemoryContent] = useState('');
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');

  const {
    data: memoriesData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: memoriesLoading,
  } = useInfiniteQuery({
    queryKey: ['memories'],
    queryFn: async ({ pageParam }) => {
      const pageNumber = pageParam as number;
      return await getAllMemories(pageNumber);
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const hasMore = lastPage.memories.length >= 20;
      return hasMore ? allPages.length + 1 : undefined;
    },
    staleTime: 1000 * 60 * 5,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteMemory,
    onSuccess: (_, memoryId) => {
      setDeletingMemoryIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(memoryId);
        return newSet;
      });
      queryClient.invalidateQueries({ queryKey: ['memories'] });
      sileo.success({
        title: 'Memory deleted successfully',
        description: 'The memory has been removed',
        icon: <Trash2 className="h-4 w-4" />,
      });
    },
    onError: (_, memoryId) => {
      setDeletingMemoryIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(memoryId);
        return newSet;
      });
      sileo.error({
        title: 'Failed to delete memory',
        description: 'Please try again',
        icon: <X className="h-4 w-4" />,
      });
    },
  });

  const handleDeleteMemory = (id: string) => {
    setDeletingMemoryIds((prev) => new Set(prev).add(id));
    deleteMutation.mutate(id);
  };

  const addMutation = useMutation({
    mutationFn: addMemoryManual,
    onSuccess: () => {
      setIsAdding(false);
      setNewMemoryContent('');
      queryClient.invalidateQueries({ queryKey: ['memories'] });
      sileo.success({ title: 'Memory added', icon: <Check className="h-4 w-4" /> });
    },
    onError: () => {
      sileo.error({ title: 'Failed to add memory', description: 'Please try again', icon: <X className="h-4 w-4" /> });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) => updateMemory(id, content),
    onSuccess: () => {
      setEditingMemoryId(null);
      setEditingContent('');
      queryClient.invalidateQueries({ queryKey: ['memories'] });
      sileo.success({ title: 'Memory updated', icon: <Check className="h-4 w-4" /> });
    },
    onError: () => {
      sileo.error({
        title: 'Failed to update memory',
        description: 'Please try again',
        icon: <X className="h-4 w-4" />,
      });
    },
  });

  const handleStartAdd = () => {
    setIsAdding(true);
    setNewMemoryContent('');
  };

  const handleCancelAdd = () => {
    setIsAdding(false);
    setNewMemoryContent('');
  };

  const handleSaveAdd = () => {
    if (!newMemoryContent.trim()) return;
    addMutation.mutate(newMemoryContent);
  };

  const handleStartEdit = (memory: MemoryItem) => {
    setEditingMemoryId(memory.id);
    setEditingContent(memory.content || getMemoryContent(memory));
  };

  const handleCancelEdit = () => {
    setEditingMemoryId(null);
    setEditingContent('');
  };

  const handleSaveEdit = (id: string) => {
    if (!editingContent.trim()) return;
    updateMutation.mutate({ id, content: editingContent });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    }).format(date);
  };

  const getMemoryContent = (memory: MemoryItem): string => {
    if (memory.summary) return memory.summary;
    if (memory.title) return memory.title;
    if (memory.memory) return memory.memory;
    if (memory.name) return memory.name;
    return 'No content available';
  };

  const displayedMemories = memoriesData?.pages.flatMap((page) => page.memories) || [];

  const totalMemories = memoriesData?.pages.reduce((acc, page) => acc + page.memories.length, 0) || 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-pixel-grid text-xs text-muted-foreground/50">01</span>
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold tabular-nums">{totalMemories}</span>{' '}
            {totalMemories === 1 ? 'memory' : 'memories'} stored
          </p>
        </div>
        {!isAdding && (
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={handleStartAdd}>
            <PlusIcon className="h-3 w-3" />
            Add memory
          </Button>
        )}
      </div>

      {isAdding && (
        <div className="p-3.5 rounded-xl border border-border/60 bg-card/30 space-y-2.5">
          <Textarea
            autoFocus
            placeholder="Something to remember about you..."
            value={newMemoryContent}
            onChange={(e) => setNewMemoryContent(e.target.value)}
            className="text-[13px] min-h-20"
            disabled={addMutation.isPending}
          />
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleCancelAdd}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleSaveAdd}
              disabled={!newMemoryContent.trim() || addMutation.isPending}
            >
              {addMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1 scrollbar-w-1 scrollbar-track-transparent scrollbar-thumb-muted-foreground/20 hover:scrollbar-thumb-muted-foreground/30">
        {memoriesLoading && !displayedMemories.length ? (
          <div className="flex justify-center items-center h-32">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : displayedMemories.length === 0 ? (
          <div className="flex flex-col justify-center items-center h-36 border border-dashed border-border/60 rounded-xl bg-muted/10">
            <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center mb-3">
              <HugeiconsIcon icon={Brain02Icon} className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No memories found</p>
            <p className="text-[11px] text-muted-foreground/60 mt-1">
              Memories are created automatically from your conversations
            </p>
          </div>
        ) : (
          <>
            {displayedMemories.map((memory: MemoryItem) =>
              editingMemoryId === memory.id ? (
                <div key={memory.id} className="p-3.5 rounded-xl border border-border/60 bg-card/30 space-y-2.5">
                  <Textarea
                    autoFocus
                    value={editingContent}
                    onChange={(e) => setEditingContent(e.target.value)}
                    className="text-[13px] min-h-20"
                    disabled={updateMutation.isPending}
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleCancelEdit}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => handleSaveEdit(memory.id)}
                      disabled={!editingContent.trim() || updateMutation.isPending}
                    >
                      {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  key={memory.id}
                  className="group relative p-3.5 rounded-xl border border-border/60 bg-card/30 hover:bg-card/60 transition-all"
                >
                  <div className="pr-16">
                    {memory.title && <h4 className="text-sm font-medium mb-1 text-foreground">{memory.title}</h4>}
                    <p className="text-[13px] leading-relaxed text-muted-foreground">
                      {memory.content || getMemoryContent(memory)}
                    </p>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-2.5">
                      <div className="flex items-center gap-1">
                        <CalendarIcon className="h-3 w-3" />
                        <span>{formatDate(memory.createdAt || memory.created_at || '')}</span>
                      </div>
                      {memory.type && (
                        <span className="font-pixel text-[11px] text-muted-foreground/50 uppercase tracking-wider">
                          {memory.type}
                        </span>
                      )}
                      {memory.status && memory.status !== 'done' && (
                        <div className="px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 rounded text-[9px] font-medium">
                          {memory.status}
                        </div>
                      )}
                    </div>
                  </div>
                  <div
                    className={cn(
                      'absolute right-2 top-2 flex items-center gap-1',
                      'opacity-0 group-hover:opacity-100 transition-opacity',
                    )}
                    style={{ opacity: 1 }} // Always visible on mobile
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleStartEdit(memory)}
                      className="h-6 w-6 text-muted-foreground hover:text-foreground touch-manipulation"
                    >
                      <PencilIcon className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteMemory(memory.id)}
                      disabled={deletingMemoryIds.has(memory.id)}
                      className="h-6 w-6 text-muted-foreground hover:text-destructive touch-manipulation"
                    >
                      {deletingMemoryIds.has(memory.id) ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <TrashIcon className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>
              ),
            )}

            {hasNextPage && !searchQuery.trim() && (
              <div className="pt-2 flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => fetchNextPage()}
                  disabled={!hasNextPage || isFetchingNextPage}
                  size="sm"
                  className="h-8"
                >
                  {isFetchingNextPage ? (
                    <>
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    'Load More'
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Component for Connectors
