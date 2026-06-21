// =========================================================================
// src/utils/storageAdapter.ts
// FSRMS Hardening Ops — Pluggable Storage Architecture Interfaces
// =========================================================================

export interface StorageObjectStore {
  get(key: any): Promise<any>;
  put(value: any): Promise<any>;
  delete(key: any): Promise<void>;
  getAll(): Promise<any[]>;
  count(): Promise<number>;
}

export interface StorageTransaction {
  objectStore(name: string): StorageObjectStore;
  done: Promise<void>;
}

export interface StorageAdapter {
  get(storeName: string, key: any): Promise<any>;
  put(storeName: string, value: any): Promise<any>;
  delete(storeName: string, key: any): Promise<any>;
  getAll(storeName: string): Promise<any[]>;
  count(storeName: string): Promise<number>;
  close(): void;
  transaction(storeNames: string | string[], mode?: 'readonly' | 'readwrite'): StorageTransaction;
}
