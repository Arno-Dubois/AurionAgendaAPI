/**
 * Runs async tasks one at a time, in call order.
 *
 * An Aurion session is stateful (cookie + rolling ViewState), so two requests must never
 * interleave on it.
 */
export class SerialQueue {
  #tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(task, task);
    this.#tail = result.catch(() => undefined);
    return result;
  }
}
