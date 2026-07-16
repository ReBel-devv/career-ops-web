/**
 * A minimal single-consumer async queue used to multiplex two producers into
 * one event stream: the SDK message loop, and the `canUseTool` callback (which
 * needs to push `permission_request` events but cannot itself `yield` into the
 * generator). Push from anywhere; drain with `for await`.
 */
export class EventQueue<T> {
  private readonly items: T[] = [];
  private readonly waiters: ((r: IteratorResult<T>) => void)[] = [];
  private closed = false;

  /** Enqueue an item (ignored once the queue is closed). */
  push(item: T): void {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter) waiter({ value: item, done: false });
    else this.items.push(item);
  }

  /** Close the queue; the async iterator ends once buffered items drain. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    let waiter: ((r: IteratorResult<T>) => void) | undefined;
    while ((waiter = this.waiters.shift())) {
      waiter({ value: undefined as never, done: true });
    }
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    for (;;) {
      if (this.items.length > 0) {
        yield this.items.shift() as T;
        continue;
      }
      if (this.closed) return;
      const result = await new Promise<IteratorResult<T>>((resolve) =>
        this.waiters.push(resolve),
      );
      if (result.done) return;
      yield result.value;
    }
  }
}
