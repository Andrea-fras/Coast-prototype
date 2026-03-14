export async function fetchWithRetry(url, options = {}, { retries = 3, baseDelay = 1000 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      const isNetworkError = !err.response;
      if (!isNetworkError || attempt === retries) throw err;
      await new Promise(r => setTimeout(r, baseDelay * (2 ** attempt)));
    }
  }
}
