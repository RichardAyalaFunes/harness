'use client';
import { createContext, useContext } from 'react';

/** Human names for sources: "Kickoff call: AI Agent Engineer, 28 Oct" instead of internal ids. */
export const SrcCtx = createContext<{ name: (id: string) => string; title: (id: string) => string }>({ name: (id) => id, title: (id) => id });
export const useSrc = () => useContext(SrcCtx);
