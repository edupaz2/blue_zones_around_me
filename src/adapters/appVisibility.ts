export function onAppReturn(cb: () => void): () => void {
  const onVisibility = () => {
    if (document.visibilityState === 'visible') cb();
  };
  const onPageShow = () => cb();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pageshow', onPageShow);
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pageshow', onPageShow);
  };
}
