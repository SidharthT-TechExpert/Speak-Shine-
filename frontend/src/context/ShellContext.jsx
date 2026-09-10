import { createContext, useContext, useState, useRef, useCallback } from "react";

const ShellContext = createContext({
  isInsideShell: false,
  headerTitle: "",
  headerSubtitle: "",
  setHeaderMeta: () => {},
  scrollerRef: { current: null },
  scrollToTop: () => {},
});

export function ShellProvider({ children }) {
  const [headerTitle, setHeaderTitle] = useState("");
  const [headerSubtitle, setHeaderSubtitle] = useState("");
  const scrollerRef = useRef(null);

  const setHeaderMeta = useCallback(({ title, subtitle } = {}) => {
    if (title !== undefined) setHeaderTitle(title || "");
    if (subtitle !== undefined) setHeaderSubtitle(subtitle || "");
  }, []);

  const scrollToTop = useCallback(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTo({ top: 0, behavior: "instant" });
    }
  }, []);

  return (
    <ShellContext.Provider
      value={{
        isInsideShell: true,
        headerTitle,
        headerSubtitle,
        setHeaderMeta,
        scrollerRef,
        scrollToTop,
      }}
    >
      {children}
    </ShellContext.Provider>
  );
}

export function useShell() {
  return useContext(ShellContext);
}

export default ShellContext;
