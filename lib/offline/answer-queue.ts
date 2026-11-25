"use client";

export interface OfflineQueuedAnswer {
  queueKey: string; // `${attemptId}:${questionId}`
  attemptId: string;
  questionId: string;
  selectedOptionId: string | null;
  selectedOptionIds: string[];
  statementAnswers: Record<string, boolean>;
  essayAnswer: string | null;
  isFlagged: boolean;
  isAnswered: boolean;
  answerVersion: number;
  idempotencyKey: string;
  clientUpdatedAt: string;
}

const DB_NAME = "cbt_smart_exam_offline_v1";
const STORE_NAME = "pending_answers";

function openQueueDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "queueKey" });
        store.createIndex("by_attempt", "attemptId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function enqueueOfflineAnswer(item: OfflineQueuedAnswer): Promise<void> {
  try {
    const db = await openQueueDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn("[OfflineQueue] IndexedDB write failed:", err);
  }
}

export async function getOfflineAnswersForAttempt(
  attemptId: string
): Promise<OfflineQueuedAnswer[]> {
  try {
    const db = await openQueueDb();
    const items = await new Promise<OfflineQueuedAnswer[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const index = tx.objectStore(STORE_NAME).index("by_attempt");
      const req = index.getAll(attemptId);
      req.onsuccess = () => resolve((req.result as OfflineQueuedAnswer[]) || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return items;
  } catch {
    return [];
  }
}

export async function removeOfflineAnswer(queueKey: string): Promise<void> {
  try {
    const db = await openQueueDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(queueKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore cleanup errors
  }
}

export async function clearOfflineAttemptQueue(attemptId: string): Promise<void> {
  const items = await getOfflineAnswersForAttempt(attemptId);
  for (const item of items) {
    await removeOfflineAnswer(item.queueKey);
  }
}
