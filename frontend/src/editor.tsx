import { useEffect, useRef } from 'react';
import { basicSetup, EditorView } from 'codemirror';
import { indentWithTab } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { keymap } from '@codemirror/view';

export function Editor({ initial, jsx, label, onChange, onSubmit }: {
  initial: string; jsx: boolean; label: string; onChange: (text: string) => void; onSubmit?: () => void;
}) {
  const parent = useRef<HTMLDivElement>(null);
  const submit = useRef(onSubmit);
  submit.current = onSubmit;
  useEffect(() => {
    if (!parent.current) return;
    const view = new EditorView({ parent: parent.current, doc: initial, extensions: [
      keymap.of([indentWithTab]), basicSetup, javascript({ jsx }), oneDark, EditorView.contentAttributes.of({ 'aria-label': label }),
      EditorView.updateListener.of((update) => { if (update.docChanged) onChange(update.state.doc.toString()); }),
      EditorView.domEventHandlers({
        keydown: (event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && submit.current) {
            event.preventDefault(); submit.current(); return true;
          }
          return false;
        },
      }),
      EditorView.theme({ '&': { backgroundColor: 'var(--surface)', color: 'var(--text)', fontSize: '14px' },
        '.cm-gutters': { backgroundColor: 'var(--surface-raised)', color: 'var(--muted)', border: '0' },
        '.cm-scroller': { minHeight: '15rem', maxHeight: '34rem', overflow: 'auto' },
        '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--surface-raised)' } }, { dark: true }),
    ] });
    return () => view.destroy();
  }, [initial, jsx, label, onChange]);
  return <div className="editor" ref={parent} />;
}
