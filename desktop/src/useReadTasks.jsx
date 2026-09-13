import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, X } from 'lucide-react';

const cancellable = new Set(['run', 'readSkill', 'githubSkills', 'localSkills', 'localModes', 'native', 'mcp', 'discover', 'repositoryUpdates']);

export function useReadTasks(onError) {
  const pending = useRef(new Map());
  const [items, setItems] = useState([]);
  function cancel(key) {
    const request = pending.current.get(key);
    if (!request) return;
    pending.current.delete(key);
    window.asl.cancelRead(request.id).catch(() => {});
    setItems([...pending.current.values()]);
  }
  async function read(key, label, work) {
    cancel(key);
    const request = { id: crypto.randomUUID(), key, label };
    pending.current.set(key, request);
    setItems([...pending.current.values()]);
    const current = () => pending.current.get(key) === request;
    const call = async (method, ...args) => {
      if (!current()) throw new Error('读取已取消');
      const reply = cancellable.has(method)
        ? await window.asl.read(request.id, method, args)
        : await window.asl[method](...args);
      if (!current()) throw new Error('读取已取消');
      if (!reply.ok) throw new Error(reply.error);
      return reply.value;
    };
    try { return await work(call); }
    catch (error) { if (current()) onError(error); }
    finally {
      if (current()) { pending.current.delete(key); setItems([...pending.current.values()]); }
    }
  }
  useEffect(() => () => {
    for (const request of pending.current.values()) window.asl.cancelRead(request.id).catch(() => {});
    pending.current.clear();
  }, []);
  return { read, cancel, items };
}

export function ReadStatus({ tasks }) {
  return tasks.items.length > 0 && <div className="read-status" aria-live="polite">
    {tasks.items.map(item => <div key={item.key}><LoaderCircle size={16} className="spin"/>
      <span>{item.label}</span><button className="text-button" aria-label={`取消${item.label}`} onClick={() => tasks.cancel(item.key)}><X size={14}/>取消</button>
    </div>)}
  </div>;
}
