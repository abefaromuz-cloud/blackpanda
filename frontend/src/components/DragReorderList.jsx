import { useEffect, useState } from 'react';

// Универсальный drag-and-drop список на pointer events — одинаково работает мышкой и тачем.
// items: массив; getKey(item) -> string; renderItem(item, dragHandleProps) -> JSX; onReorder(orderedKeys) вызывается после отпускания.
export default function DragReorderList({ items, getKey, renderItem, onReorder, className = '' }) {
  const [list, setList] = useState(items);
  const [draggingKey, setDraggingKey] = useState(null);

  useEffect(() => { if (!draggingKey) setList(items); }, [items, draggingKey]);

  function onPointerDown(e, key) {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDraggingKey(key);
  }

  function onPointerMove(e) {
    if (!draggingKey) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const row = el?.closest('[data-drag-key]');
    if (!row) return;
    const overKey = row.getAttribute('data-drag-key');
    if (overKey === draggingKey) return;
    setList(prev => {
      const from = prev.findIndex(i => getKey(i) === draggingKey);
      const to = prev.findIndex(i => getKey(i) === overKey);
      if (from === -1 || to === -1) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(from, 1);
      copy.splice(to, 0, moved);
      return copy;
    });
  }

  function onPointerUp() {
    if (draggingKey) onReorder(list.map(getKey));
    setDraggingKey(null);
  }

  return (
    <div className={className} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      {list.map(item => {
        const key = getKey(item);
        return (
          <div key={key} data-drag-key={key} style={{ display: 'contents' }}>
            {renderItem(item, { onPointerDown: (e) => onPointerDown(e, key), style: { touchAction: 'none', cursor: 'grab' } })}
          </div>
        );
      })}
    </div>
  );
}
