// Gatilhos baratos do renderer. O backend confirma a conectividade real e faz
// todo trabalho em background; nenhuma ação de leitura depende desta chamada.
(function initSyncTriggers() {
  if (!window.electronAPI?.syncTrigger) return;

  async function triggerSync() {
    if (!navigator.onLine) return;
    try {
      const status = await window.electronAPI.syncTrigger();
      renderStatus(status);
      setTimeout(refreshStatus, 1500);
    } catch (error) {
      console.warn('[Sync] Gatilho adiado:', error.message);
    }
  }

  function renderStatus(status) {
    window.dispatchEvent(new CustomEvent('krumer:sync-status', { detail: status }));
    const target = document.getElementById('sync-panel-status');
    if (!target) return;
    const marks = { synced: '✓', syncing: '↻', pending: '…', error: '!', offline: '○' };
    const mark = marks[status?.state] || '○';
    const pending = status?.pending ? ` (${status.pending})` : '';
    target.textContent = `${mark} Sync${pending}`;
    target.dataset.state = status?.state || 'offline';
    target.title = status?.lastError || '';
  }

  async function refreshStatus() {
    try { renderStatus(await window.electronAPI.syncGetStatus()); } catch { /* backend reiniciando */ }
  }

  window.addEventListener('online', triggerSync);
  window.addEventListener('offline', () => {
    renderStatus({ state: 'offline' });
  });
  window.addEventListener('focus', triggerSync);
  window.addEventListener('DOMContentLoaded', triggerSync, { once: true });
  setInterval(refreshStatus, 30000);
})();
