let timer = null;

self.onmessage = (event) => {
  if (event.data?.type === 'stop') {
    if (timer !== null) clearInterval(timer);
    timer = null;
    return;
  }

  if (event.data?.type === 'start') {
    if (timer !== null) clearInterval(timer);
    timer = setInterval(() => self.postMessage('tick'), event.data.intervalMs);
  }
};
