export type TestStatus = 'created' | 'running' | 'completed' | 'failed';

export type CreateTestResponse = {
  testId: string;
};

export type TestSummary = {
  id: string;
  status: TestStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  vus: number;
  duration: string;
  collectionName?: string;
  error?: string;
  k6Summary?: unknown;
};

