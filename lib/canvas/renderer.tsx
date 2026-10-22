'use client';

import { useMemo } from 'react';
import {
  Renderer,
  type ComponentRenderer,
  type Spec,
  StateProvider,
  VisibilityProvider,
  ActionProvider,
  useJsonRenderMessage,
} from '@json-render/react';

import type { ChatMessage } from '@/lib/types';
import { registry, Fallback } from './registry';

const fallback: ComponentRenderer = ({ element }) => <Fallback type={element.type} />;

// Models sometimes write an element's children as a single key instead of an array.
function sanitizeSpec(spec: Spec): Spec {
  const elements = { ...spec.elements };
  for (const [key, element] of Object.entries(elements)) {
    const children: unknown = element.children;
    if (children != null && !Array.isArray(children)) {
      elements[key] = { ...element, children: typeof children === 'string' ? [children] : [] };
    }
  }
  return { ...spec, elements };
}

// The dashboard of a Canvas answer, rebuilt from its spec parts as they stream in.
export function CanvasSpecRenderer({ parts, isStreaming }: { parts: ChatMessage['parts']; isStreaming: boolean }) {
  const { spec } = useJsonRenderMessage(parts);
  const safeSpec = useMemo(() => (spec ? sanitizeSpec(spec) : null), [spec]);
  if (!safeSpec || Object.keys(safeSpec.elements).length === 0) return null;

  return (
    <div className="mt-4">
      <StateProvider initialState={safeSpec.state ?? {}}>
        <VisibilityProvider>
          <ActionProvider>
            <Renderer spec={safeSpec} registry={registry} fallback={fallback} loading={isStreaming} />
          </ActionProvider>
        </VisibilityProvider>
      </StateProvider>
    </div>
  );
}
