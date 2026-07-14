import { useCallback, useEffect, useState } from "react";
import { json } from "./api.js";

export function useAsyncJson(path, dependencies = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const reload = useCallback(async () => {
    if (!path) return;
    setState(current => ({ ...current, loading: true, error: null }));
    try { setState({ data: await json(path), loading: false, error: null }); }
    catch (error) { setState({ data: null, loading: false, error: error.message }); }
  }, [path]);
  useEffect(() => { void reload(); }, [reload, ...dependencies]);
  return { ...state, reload };
}

export function useRoute() {
  const [location, setLocation] = useState(() => ({ pathname: window.location.pathname, search: window.location.search }));
  useEffect(() => {
    const onChange = () => setLocation({ pathname: window.location.pathname, search: window.location.search });
    window.addEventListener("popstate", onChange);
    window.addEventListener("rbcc:navigate", onChange);
    return () => { window.removeEventListener("popstate", onChange); window.removeEventListener("rbcc:navigate", onChange); };
  }, []);
  return location;
}

export function navigate(href) {
  history.pushState(null, "", href);
  window.dispatchEvent(new Event("rbcc:navigate"));
  window.scrollTo({ top: 0, behavior: "instant" });
}
