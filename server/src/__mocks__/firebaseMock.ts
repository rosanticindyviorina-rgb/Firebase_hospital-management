/**
 * Complete Firebase Admin mock for unit testing.
 * Simulates Firestore document operations in memory.
 */

// In-memory Firestore store
const store: Record<string, Record<string, any>> = {};

function getStore(collection: string, docId: string): any | undefined {
  return store[collection]?.[docId];
}

function setStore(collection: string, docId: string, data: any): void {
  if (!store[collection]) store[collection] = {};
  store[collection][docId] = { ...data };
}

function deleteStore(collection: string, docId: string): void {
  if (store[collection]) {
    delete store[collection][docId];
  }
}

export function clearStore(): void {
  Object.keys(store).forEach(key => delete store[key]);
}

export function seedStore(collection: string, docId: string, data: any): void {
  setStore(collection, docId, data);
}

export function getStoreData(collection: string, docId: string): any {
  return getStore(collection, docId);
}

export function getAllInCollection(collection: string): Record<string, any> {
  return store[collection] || {};
}

// Track batch operations
let batchOps: Array<{ type: string; collection: string; docId: string; data: any }> = [];

// Auto-incrementing doc ID
let autoDocCounter = 0;

const mockTimestamp = { toMillis: () => Date.now(), _seconds: Math.floor(Date.now() / 1000) };

// subcollection store: 'parentCollection/parentDoc/subCollection' -> { docId: data }
const subStore: Record<string, Record<string, any>> = {};

function getSubPath(parentCol: string, parentDoc: string, subCol: string): string {
  return `${parentCol}/${parentDoc}/${subCol}`;
}

function createMockDocRef(collection: string, docId?: string): any {
  const id = docId || `auto_${++autoDocCounter}`;
  return {
    id,
    get: jest.fn(async () => {
      const data = getStore(collection, id);
      return {
        exists: !!data,
        data: () => data ? { ...data } : undefined,
        id,
      };
    }),
    set: jest.fn(async (data: any, options?: any) => {
      if (options?.merge) {
        const existing = getStore(collection, id) || {};
        setStore(collection, id, { ...existing, ...resolveFieldValues(data) });
      } else {
        setStore(collection, id, resolveFieldValues(data));
      }
    }),
    update: jest.fn(async (data: any) => {
      const existing = getStore(collection, id) || {};
      const resolved = resolveFieldValues(data);
      // Handle dot-notation keys like 'taskProgress.task_1'
      for (const [key, val] of Object.entries(resolved)) {
        if (key.includes('.')) {
          const parts = key.split('.');
          let obj = existing;
          for (let i = 0; i < parts.length - 1; i++) {
            if (!obj[parts[i]]) obj[parts[i]] = {};
            obj = obj[parts[i]];
          }
          obj[parts[parts.length - 1]] = val;
        } else {
          existing[key] = val;
        }
      }
      setStore(collection, id, existing);
    }),
    delete: jest.fn(async () => {
      deleteStore(collection, id);
    }),
    collection: jest.fn((subCollectionName: string) => {
      return createMockCollectionRef(getSubPath(collection, id, subCollectionName));
    }),
  };
}

function createMockCollectionRef(collection: string): any {
  return {
    doc: jest.fn((docId?: string) => createMockDocRef(collection, docId)),
    where: jest.fn(function (this: any, field: string, op: string, value: any) {
      // Build a chainable query object
      const filters = [{ field, op, value }];
      const queryObj: any = {
        where: jest.fn((f: string, o: string, v: any) => {
          filters.push({ field: f, op: o, value: v });
          return queryObj;
        }),
        orderBy: jest.fn(() => queryObj),
        limit: jest.fn((n: number) => {
          queryObj._limit = n;
          return queryObj;
        }),
        count: jest.fn(() => ({
          get: jest.fn(async () => {
            const items = Object.values(store[collection] || {}).filter(doc =>
              filters.every(f => matchFilter(doc, f.field, f.op, f.value))
            );
            return { data: () => ({ count: items.length }) };
          }),
        })),
        get: jest.fn(async () => {
          let items = Object.entries(store[collection] || {})
            .filter(([, doc]) => filters.every(f => matchFilter(doc, f.field, f.op, f.value)))
            .map(([id, doc]) => ({
              id,
              data: () => ({ ...doc }),
              exists: true,
            }));
          if (queryObj._limit) items = items.slice(0, queryObj._limit);
          return { docs: items, empty: items.length === 0 };
        }),
        _limit: null,
      };
      return queryObj;
    }),
    orderBy: jest.fn(function () {
      const queryObj: any = {
        where: jest.fn(() => queryObj),
        orderBy: jest.fn(() => queryObj),
        limit: jest.fn((n: number) => {
          queryObj._limit = n;
          return queryObj;
        }),
        startAfter: jest.fn(() => queryObj),
        get: jest.fn(async () => {
          const items = Object.entries(store[collection] || {}).map(([id, doc]) => ({
            id,
            data: () => ({ ...doc }),
            exists: true,
          }));
          const limited = queryObj._limit ? items.slice(0, queryObj._limit) : items;
          return { docs: limited, empty: limited.length === 0 };
        }),
        _limit: null,
      };
      return queryObj;
    }),
    count: jest.fn(() => ({
      get: jest.fn(async () => ({
        data: () => ({ count: Object.keys(store[collection] || {}).length }),
      })),
    })),
  };
}

function matchFilter(doc: any, field: string, op: string, value: any): boolean {
  const fieldVal = doc[field];
  switch (op) {
    case '==': return fieldVal === value;
    case '!=': return fieldVal !== value;
    case '>': return fieldVal > value;
    case '>=': return fieldVal >= value;
    case '<': return fieldVal < value;
    case '<=': return fieldVal <= value;
    default: return true;
  }
}

function resolveFieldValues(data: any): any {
  const resolved: any = {};
  for (const [key, val] of Object.entries(data)) {
    if (val && typeof val === 'object' && (val as any).__type === 'increment') {
      resolved[key] = (val as any).__value; // Will need to add to existing in update
    } else if (val && typeof val === 'object' && (val as any).__type === 'serverTimestamp') {
      resolved[key] = mockTimestamp;
    } else if (val && typeof val === 'object' && (val as any).__type === 'arrayUnion') {
      resolved[key] = (val as any).__value;
    } else {
      resolved[key] = val;
    }
  }
  return resolved;
}

// Mock batch
function createMockBatch() {
  const ops: Array<() => Promise<void>> = [];
  return {
    set: jest.fn((ref: any, data: any, options?: any) => {
      ops.push(async () => {
        await ref.set(data, options);
      });
    }),
    update: jest.fn((ref: any, data: any) => {
      ops.push(async () => {
        await ref.update(data);
      });
    }),
    create: jest.fn((ref: any, data: any) => {
      ops.push(async () => {
        await ref.set(data);
      });
    }),
    delete: jest.fn((ref: any) => {
      ops.push(async () => {
        await ref.delete();
      });
    }),
    commit: jest.fn(async () => {
      for (const op of ops) {
        await op();
      }
    }),
  };
}

// Mock Firestore DB
export const mockDb = {
  collection: jest.fn((name: string) => createMockCollectionRef(name)),
  collectionGroup: jest.fn((name: string) => {
    // collectionGroup searches across all subcollections
    return {
      where: jest.fn(function (field: string, op: string, value: any) {
        const queryObj: any = {
          where: jest.fn(() => queryObj),
          count: jest.fn(() => ({
            get: jest.fn(async () => ({ data: () => ({ count: 0 }) })),
          })),
          get: jest.fn(async () => ({ docs: [], empty: true })),
        };
        return queryObj;
      }),
    };
  }),
  batch: jest.fn(() => createMockBatch()),
};

// Mock Firebase Admin
export const mockFirebaseAdmin = {
  firestore: {
    FieldValue: {
      serverTimestamp: jest.fn(() => ({ __type: 'serverTimestamp' })),
      increment: jest.fn((val: number) => ({ __type: 'increment', __value: val })),
      arrayUnion: jest.fn((...vals: any[]) => ({ __type: 'arrayUnion', __value: vals })),
    },
    Timestamp: {
      fromMillis: jest.fn((ms: number) => ({ toMillis: () => ms, _seconds: Math.floor(ms / 1000) })),
    },
  },
  auth: jest.fn(() => ({
    verifyIdToken: jest.fn(async (token: string) => {
      if (token === 'valid-token-user1') return { uid: 'user1' };
      if (token === 'valid-token-admin1') return { uid: 'admin1' };
      if (token === 'valid-token-superadmin1') return { uid: 'superadmin1' };
      throw new Error('Invalid token');
    }),
    updateUser: jest.fn(async () => ({})),
  })),
};

export const mockAuth = mockFirebaseAdmin.auth();

// Mock Collections
export const MockCollections = {
  USERS: 'users',
  DEVICES: 'devices',
  REFERRALS: 'referrals',
  TASKS: 'tasks',
  SPINS: 'spins',
  LEDGER: 'ledger',
  BANS: 'bans',
  CONFIG: 'config',
  REFERRAL_CODES: 'referral_codes',
  ADMIN_ACTIONS: 'admin_actions',
  ADMINS: 'admins',
  WITHDRAWALS: 'withdrawals',
  SALARY_APPROVALS: 'salary_approvals',
};
