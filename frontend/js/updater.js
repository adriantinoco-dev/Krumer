/* ==========================================================================
   Krumer Personal Library - Auto-Update Manager (Electron Integration)
   ========================================================================== */

class AppUpdater {
  constructor() {
    this.modalEl = null;
    this.titleEl = null;
    this.statusEl = null;
    this.progressContainerEl = null;
    this.progressBarEl = null;
    this.progressTextEl = null;
    this.speedTextEl = null;
    this.actionBtnEl = null;
    this.cancelBtnEl = null;
    this.closeBtnEl = null;

    this.currentInfo = null;
    this.isDownloading = false;
  }

  init() {
    if (!window.electronAPI) return;

    this.createDomElements();
    this.registerListeners();
    this.checkDailyUpdate();
  }

  createDomElements() {
    if (document.getElementById('krumer-update-modal')) return;

    const modalMarkup = `
      <div id="krumer-update-modal" class="update-modal-backdrop hidden">
        <div class="update-modal-card">
          <div class="update-modal-header">
            <h3 id="update-modal-title">${I18N.t('update.title')}</h3>
            <button id="update-modal-close" class="update-modal-close-btn" title="${I18N.t('update.btn_close')}">&times;</button>
          </div>
          <div class="update-modal-body">
            <p id="update-modal-status">${I18N.t('update.checking')}</p>
            
            <div id="update-progress-container" class="update-progress-container hidden">
              <div class="update-progress-bar-bg">
                <div id="update-progress-bar" class="update-progress-bar-fill" style="width: 0%"></div>
              </div>
              <div class="update-progress-info">
                <span id="update-progress-text">0%</span>
                <span id="update-speed-text">0 MB/s</span>
              </div>
            </div>
          </div>
          <div class="update-modal-footer">
            <button id="update-modal-cancel" class="btn btn-secondary hidden">${I18N.t('update.btn_cancel')}</button>
            <button id="update-modal-action" class="btn btn-primary hidden">${I18N.t('update.btn_download')}</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalMarkup);

    this.modalEl = document.getElementById('krumer-update-modal');
    this.titleEl = document.getElementById('update-modal-title');
    this.statusEl = document.getElementById('update-modal-status');
    this.progressContainerEl = document.getElementById('update-progress-container');
    this.progressBarEl = document.getElementById('update-progress-bar');
    this.progressTextEl = document.getElementById('update-progress-text');
    this.speedTextEl = document.getElementById('update-speed-text');
    this.actionBtnEl = document.getElementById('update-modal-action');
    this.cancelBtnEl = document.getElementById('update-modal-cancel');
    this.closeBtnEl = document.getElementById('update-modal-close');

    this.closeBtnEl.addEventListener('click', () => this.hideModal());
    this.cancelBtnEl.addEventListener('click', () => this.handleCancel());
  }

  registerListeners() {
    window.electronAPI.onUpdateAvailable((info) => {
      this.currentInfo = info;
      const version = info ? (info.version || '') : '';
      this.showUpdateAvailable(version);
    });

    window.electronAPI.onDownloadProgress((progressObj) => {
      this.showDownloadProgress(progressObj);
    });

    window.electronAPI.onUpdateDownloaded((info) => {
      this.showUpdateDownloaded(info);
    });

    window.electronAPI.onUpdateError((errorMsg) => {
      this.showUpdateError(errorMsg);
    });
  }

  checkDailyUpdate() {
    const LAST_CHECK_KEY = 'krumer_last_update_check';
    const lastCheck = localStorage.getItem(LAST_CHECK_KEY);
    const now = Date.now();
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;

    if (!lastCheck || (now - parseInt(lastCheck, 10)) > ONE_DAY_MS) {
      localStorage.setItem(LAST_CHECK_KEY, now.toString());
      window.electronAPI.checkForUpdates();
    }
  }

  showUpdateAvailable(version) {
    this.titleEl.textContent = I18N.t('update.title_available');
    this.statusEl.textContent = I18N.t('update.available', version ? 'v' + version : '');
    
    this.progressContainerEl.classList.add('hidden');
    this.cancelBtnEl.classList.add('hidden');
    
    this.actionBtnEl.textContent = I18N.t('update.btn_download');
    this.actionBtnEl.classList.remove('hidden');
    this.actionBtnEl.onclick = () => this.startDownload();

    this.modalEl.classList.remove('hidden');
  }

  async startDownload() {
    this.isDownloading = true;
    this.statusEl.textContent = I18N.t('update.download_starting');
    
    this.progressContainerEl.classList.remove('hidden');
    this.progressBarEl.style.width = '0%';
    this.progressTextEl.textContent = '0%';
    this.speedTextEl.textContent = '0 MB/s';

    this.actionBtnEl.classList.add('hidden');
    this.cancelBtnEl.classList.remove('hidden');

    try {
      await window.electronAPI.startDownload();
    } catch (err) {
      this.showUpdateError(I18N.t('update.download_error', err.message || err));
    }
  }

  showDownloadProgress(progressObj) {
    if (!this.isDownloading) this.isDownloading = true;
    
    const percent = Math.round(progressObj.percent || 0);
    const speedBytes = progressObj.bytesPerSecond || 0;
    const speedMb = (speedBytes / (1024 * 1024)).toFixed(1);

    this.statusEl.textContent = I18N.t('update.downloading', percent);
    this.progressBarEl.style.width = `${percent}%`;
    this.progressTextEl.textContent = `${percent}%`;
    this.speedTextEl.textContent = I18N.t('update.speed', speedMb);
  }

  async handleCancel() {
    if (this.isDownloading) {
      await window.electronAPI.cancelDownload();
      this.isDownloading = false;
      this.statusEl.textContent = I18N.t('update.download_canceled');
      this.progressContainerEl.classList.add('hidden');
      this.cancelBtnEl.classList.add('hidden');
    } else {
      this.hideModal();
    }
  }

  showUpdateDownloaded(info) {
    this.isDownloading = false;
    this.titleEl.textContent = I18N.t('update.title_downloaded');
    this.statusEl.textContent = I18N.t('update.download_done');

    this.progressContainerEl.classList.add('hidden');
    this.cancelBtnEl.classList.add('hidden');

    this.actionBtnEl.textContent = I18N.t('update.btn_restart');
    this.actionBtnEl.classList.remove('hidden');
    this.actionBtnEl.onclick = () => {
      window.electronAPI.restartAndInstall();
    };

    this.modalEl.classList.remove('hidden');
  }

  showUpdateError(errorMsg) {
    this.isDownloading = false;
    this.titleEl.textContent = I18N.t('update.title_error');
    this.statusEl.textContent = I18N.t('update.error', errorMsg || I18N.t('update.error_no_connection'));

    this.progressContainerEl.classList.add('hidden');
    this.cancelBtnEl.classList.add('hidden');

    this.actionBtnEl.textContent = I18N.t('update.btn_ok');
    this.actionBtnEl.classList.remove('hidden');
    this.actionBtnEl.onclick = () => this.hideModal();

    this.modalEl.classList.remove('hidden');
  }

  hideModal() {
    if (this.modalEl) {
      this.modalEl.classList.add('hidden');
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.krumerUpdater = new AppUpdater();
  window.krumerUpdater.init();
});
