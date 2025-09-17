/**
 * Creates a memoized version of a function that stores results for arbitrary parameters.
 * The memoization persists for the lifetime of the returned function.
 *
 * @param fn - The function to memoize
 * @returns A new function that caches results of the original function
 */
export function memoize<T extends (...args: any[]) => any>(fn: T): T {
  const cache = new Map<string, any>();

  return ((...args: any[]) => {
    // Create a memoized key by stringifying the arguments
    const key = JSON.stringify(args);

    // Check if result is already memoized
    if (cache.has(key)) {
      return cache.get(key);
    }

    // Execute the function and memoize the result
    const result = fn(...args);
    cache.set(key, result);

    return result;
  }) as T;
}
