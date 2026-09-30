import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, MessageCircle, Plus } from 'lucide-react';

export default function SourceConversationPicker({ conversations, value, disabled, onSelect, onNew }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const typedRef = useRef({ text: '', at: 0 });
  const listId = useId();
  const options = [{ conversation_id: '', title: 'New conversation' }, ...conversations];
  const selectedIndex = Math.max(0, options.findIndex(option => option.conversation_id === (value || '')));
  const expanded = open && !disabled;

  useEffect(() => {
    if (!expanded) return;
    listRef.current?.focus();
    listRef.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
    const outside = event => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [expanded]);

  const focusOption = index => {
    const next = Math.max(0, Math.min(options.length - 1, index));
    setActiveIndex(next);
    listRef.current?.querySelector(`[data-option-index="${next}"]`)?.scrollIntoView({ block: 'nearest' });
  };
  const choose = index => {
    const option = options[index];
    if (!option) return;
    setOpen(false);
    triggerRef.current?.focus();
    if (option.conversation_id) {
      if (option.conversation_id !== value) onSelect(option.conversation_id);
    } else onNew();
  };
  const openList = index => { setActiveIndex(index); setOpen(true); };
  const onKeyDown = event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); triggerRef.current?.focus(); }
    else if (event.key === 'Tab') { setOpen(false); triggerRef.current?.focus(); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); focusOption(activeIndex + 1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); focusOption(activeIndex - 1); }
    else if (event.key === 'Home') { event.preventDefault(); focusOption(0); }
    else if (event.key === 'End') { event.preventDefault(); focusOption(options.length - 1); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(activeIndex); }
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = event.timeStamp;
      const text = (now - typedRef.current.at < 700 ? typedRef.current.text : '') + event.key.toLocaleLowerCase();
      typedRef.current = { text, at: now };
      const index = options.findIndex(option => option.title.toLocaleLowerCase().startsWith(text));
      if (index >= 0) focusOption(index);
    }
  };

  return <div className="ask-conversation-picker" ref={rootRef} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <button ref={triggerRef} type="button" className="ask-conversation-trigger" disabled={disabled}
      aria-label="Source conversation" aria-haspopup="listbox" aria-expanded={expanded} aria-controls={expanded ? listId : undefined}
      title={options[selectedIndex].title} onClick={() => expanded ? setOpen(false) : openList(selectedIndex)}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); openList(event.key === 'ArrowUp' ? options.length - 1 : selectedIndex);
        }
      }}>
      <MessageCircle size={14} aria-hidden="true" /><span>{options[selectedIndex].title}</span>
      <ChevronDown size={14} className="ask-picker-chevron" aria-hidden="true" />
    </button>
    {expanded && <div className="ask-conversation-popover">
      <p className="ask-picker-label">YOUR CONVERSATIONS</p>
      <ul ref={listRef} id={listId} role="listbox" aria-label="Source conversations" tabIndex={0}
        aria-activedescendant={`${listId}-${activeIndex}`} onKeyDown={onKeyDown}>
        {options.map((option, index) => <li key={option.conversation_id || 'new'} id={`${listId}-${index}`}
          data-option-index={index} role="option" aria-selected={index === selectedIndex}
          className={`ask-conversation-option ${index === activeIndex ? 'is-active' : ''} ${index === 0 ? 'ask-conversation-new' : ''}`}
          onPointerMove={() => setActiveIndex(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(index)}>
          {index === 0 ? <Plus size={16} aria-hidden="true" /> : <MessageCircle size={15} aria-hidden="true" />}
          <span>{option.title}</span>{index === selectedIndex && <Check size={15} className="ask-picker-check" aria-hidden="true" />}
        </li>)}
      </ul>
    </div>}
  </div>;
}
