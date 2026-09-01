/**
 * Execute async tasks with a concurrency limit using Promise-based pooling.
 * Like Promise.allSettled but with bounded parallelism.
 */
export async function pooledMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number = 4,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      const item = items[currentIndex]!;
      try {
        const value = await fn(item, currentIndex);
        results[currentIndex] = { status: 'fulfilled', value };
      } catch (reason) {
        results[currentIndex] = { status: 'rejected', reason };
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );

  await Promise.all(workers);
  return results;
}
