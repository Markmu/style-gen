"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface FileStoreContextValue {
  file: File | null;
  setFile: (file: File) => void;
  consumeFile: () => File | null;
}

const FileStoreContext = createContext<FileStoreContextValue | null>(null);

export function FileStoreProvider({ children }: { children: ReactNode }) {
  const [file, setFileState] = useState<File | null>(null);
  const fileRef = useRef<File | null>(null);

  const setFile = useCallback((f: File) => {
    fileRef.current = f;
    setFileState(f);
  }, []);

  const consumeFile = useCallback(() => {
    const f = fileRef.current;
    fileRef.current = null;
    setFileState(null);
    return f;
  }, []);

  return (
    <FileStoreContext.Provider value={{ file, setFile, consumeFile }}>
      {children}
    </FileStoreContext.Provider>
  );
}

export function useFileStore(): FileStoreContextValue {
  const ctx = useContext(FileStoreContext);
  if (!ctx) {
    throw new Error("useFileStore must be used within FileStoreProvider");
  }
  return ctx;
}
