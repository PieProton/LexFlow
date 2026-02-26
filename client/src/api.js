const api = {
  getSummary: async () => {
    try {
      // PERF FIX (Gemini L2-4): delegate to Rust backend command instead of loading all
      // practices client-side. Previously this caused CPU freezes on large vaults because
      // it loaded the entire encrypted vault, decrypted it, and iterated all practices in JS.
      // Now computed server-side in a single atomic vault read.
      return await window.api.getSummary();
    } catch (error) {
      return { activePractices: 0, urgentDeadlines: 0 };
    }
  }
};

export default api;