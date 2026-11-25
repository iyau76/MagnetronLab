// Keep a failed chapter hidden so the current experiment remains recoverable.
export async function waitForChapter(frame, timeoutMs = 10000) {
  if(!frame.getAttribute('src') && frame.dataset.src)frame.src=frame.dataset.src;
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (typeof frame.contentWindow?.initialize === 'function') return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('章节资源未能载入，请刷新后重试');
}
