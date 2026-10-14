'use client';

import React, { createContext, useContext, useMemo, useState } from 'react';
import type { DataUIPart } from 'ai';
import type { CustomUIDataTypes } from '@/lib/types';

// The MCP elicitation parts streamed in the current chat: the only streamed
// data read outside the message it belongs to. Every message part reads this
// context, so it holds nothing else and is cleared when the chat changes.
interface DataStreamContextValue {
  dataStream: DataUIPart<CustomUIDataTypes>[];
  setDataStream: React.Dispatch<React.SetStateAction<DataUIPart<CustomUIDataTypes>[]>>;
}

const DataStreamContext = createContext<DataStreamContextValue | null>(null);

export function DataStreamProvider({ children }: { children: React.ReactNode }) {
  const [dataStream, setDataStream] = useState<DataUIPart<CustomUIDataTypes>[]>([]);

  const value = useMemo(() => ({ dataStream, setDataStream }), [dataStream]);

  return <DataStreamContext.Provider value={value}>{children}</DataStreamContext.Provider>;
}

export function useDataStream() {
  const context = useContext(DataStreamContext);
  if (!context) {
    throw new Error('useDataStream must be used within a DataStreamProvider');
  }
  return context;
}
