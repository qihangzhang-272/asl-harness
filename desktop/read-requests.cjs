// Only reads are cancellable. Writes keep the existing confirmation/serialization boundary.
class ReadRequests {
  constructor() { this.pending = new Map(); }
  async run(id, action) {
    if (typeof id !== 'string' || !/^[\w-]{1,80}$/.test(id)) throw new Error('无效的读取请求');
    if (this.pending.has(id)) throw new Error('重复的读取请求');
    if (this.pending.size >= 8) throw new Error('读取过多，请稍后重试');
    const controller = new AbortController();
    this.pending.set(id, controller);
    try {
      const value = await action(controller.signal);
      if (controller.signal.aborted) throw new Error('读取已取消');
      return value;
    } catch (error) {
      if (controller.signal.aborted) throw new Error('读取已取消');
      throw error;
    } finally { this.pending.delete(id); }
  }
  cancel(id) { this.pending.get(id)?.abort(); }
}
module.exports = { ReadRequests };
