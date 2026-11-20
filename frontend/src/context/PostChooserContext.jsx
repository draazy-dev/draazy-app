import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import PostChooser from '../components/PostChooser.jsx';

const PostChooserContext = createContext(null);
const PostChooserOpenContext = createContext(false);

export function usePostChooser() {
  const ctx = useContext(PostChooserContext);
  if (!ctx) throw new Error('usePostChooser() must be used inside <PostChooserProvider>');
  return ctx;
}

export function usePostChooserOpen() {
  return useContext(PostChooserOpenContext);
}

export function PostChooserProvider({ children }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ openPostChooser: () => setOpen(true) }), []);

  return (
    <PostChooserContext.Provider value={value}>
      <PostChooserOpenContext.Provider value={open}>
        {children}
        <PostChooser open={open} onClose={close} />
      </PostChooserOpenContext.Provider>
    </PostChooserContext.Provider>
  );
}
