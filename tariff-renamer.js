
(function() {
    'use strict';

    class TariffRenamer {
        constructor() {
            this.isRenaming = false;
            this.shouldStop = false;
            this.renameRows = [];
            this.currentIndex = 0;
            this.sidebar = null;
            this.logEntries = [];
            this.xlsxLoaded = typeof XLSX !== 'undefined';
            this.renameStarted = false;
            this.stateKey = 'tariff_rename_state';
            this.dataKey = 'tariff_rename_data';
            this.logKey = 'tariff_rename_log';
            this.stopKey = 'tariff_rename_stop';
            this.returnUrlKey = 'tariff_rename_return_url';
            this.returnUrl = '';
            this.debug = false;
            this.maxLogEntries = 80;
            this.logRenderTimeout = null;
            this.log = (...args) => {
                if (this.debug) console.log('[TariffRenamer]', ...args);
            };

            this.log('========== ЗАГРУЗКА ==========');
            this.log('URL:', window.location.href);

            window.addEventListener('load', () => {
                if (!this.isRenaming) {
                    localStorage.removeItem(this.logKey);
                    this.logEntries = [];
                    this.renderLog();
                }
            });

            this.restoreFromStorage();
            this.restoreSidebarFromStorage();
            this.checkForContinueRename();

            setTimeout(() => {
                this.restoreSidebarFromStorage();
                this.checkForContinueRename();
            }, 500);

            setTimeout(() => {
                this.restoreSidebarFromStorage();
                this.checkForContinueRename();
            }, 2000);

            this.formCheckInterval = setInterval(() => {
                this.checkForEditForm();
            }, 500);

            window.addEventListener('storage', (e) => {
                if (e.key === this.stateKey) {
                    this.restoreFromStorage();
                    if (this.sidebar) {
                        this.updateSidebarDisplay();
                        this.restoreLogFromStorage();
                    }
                }
                if (e.key === this.stopKey) {
                    this.handleStopSignal();
                }
                if (e.key === this.dataKey) {
                    this.handleRenameData(e.newValue);
                }
            });
        }

        restoreFromStorage() {
            const savedState = localStorage.getItem(this.stateKey);
            if (savedState) {
                try {
                    const state = JSON.parse(savedState);
                    this.isRenaming = !!state.isRenaming;
                    this.renameRows = state.renameRows || [];
                    this.currentIndex = state.currentIndex || 0;
                    this.shouldStop = !!state.shouldStop;
                } catch (error) {
                    console.warn('[TariffRenamer] restoreFromStorage error', error);
                }
            }

            this.restoreReturnUrl();
        }

        saveStateToStorage() {
            const state = {
                isRenaming: this.isRenaming,
                renameRows: this.renameRows,
                currentIndex: this.currentIndex,
                shouldStop: this.shouldStop
            };
            localStorage.setItem(this.stateKey, JSON.stringify(state));
        }

        saveReturnUrl(url) {
            const cleanUrl = String(url || '').trim();
            if (!cleanUrl) return;

            this.returnUrl = cleanUrl;
            localStorage.setItem(this.returnUrlKey, cleanUrl);
        }

        restoreReturnUrl() {
            const savedUrl = localStorage.getItem(this.returnUrlKey);
            this.returnUrl = savedUrl || '';
            return this.returnUrl;
        }

        getReturnUrl() {
            return this.returnUrl || localStorage.getItem(this.returnUrlKey) || '';
        }

        clearReturnUrl() {
            this.returnUrl = '';
            localStorage.removeItem(this.returnUrlKey);
        }

        saveLogToStorage() {
            localStorage.setItem(this.logKey, JSON.stringify(this.logEntries));
        }

        restoreLogFromStorage() {
            const savedLog = localStorage.getItem(this.logKey);
            if (savedLog && this.sidebar) {
                try {
                    this.logEntries = JSON.parse(savedLog);
                    this.renderLog();
                } catch (error) {
                    console.warn('[TariffRenamer] restoreLogFromStorage error', error);
                }
            }
        }

        addSidebarLog(message, type = 'info') {
            const entry = {
                time: new Date().toLocaleTimeString(),
                message,
                type
            };

            this.logEntries.push(entry);
            while (this.logEntries.length > this.maxLogEntries) this.logEntries.shift();
            this.saveLogToStorage();

            clearTimeout(this.logRenderTimeout);
            this.logRenderTimeout = setTimeout(() => {
                this.renderLog();
            }, 100);
        }

        renderLog() {
            const logDiv = document.getElementById('sidebar-rename-log');
            if (!logDiv) return;

            logDiv.innerHTML = '';
            if (this.logEntries.length === 0) {
                const emptyMsg = document.createElement('div');
                emptyMsg.style.color = '#60a5fa';
                emptyMsg.textContent = '💡 Готов к переименованию';
                logDiv.appendChild(emptyMsg);
                return;
            }

            const colors = {
                success: '#4ade80',
                error: '#f87171',
                info: '#60a5fa',
                warning: '#fbbf24'
            };

            for (const entry of this.logEntries) {
                const entryDiv = document.createElement('div');
                entryDiv.style.color = colors[entry.type] || '#94a3b8';
                entryDiv.style.marginBottom = '6px';
                entryDiv.style.padding = '4px 0';
                entryDiv.style.borderBottom = '1px solid #334155';
                entryDiv.style.fontSize = '11px';
                entryDiv.textContent = `[${entry.time}] ${entry.message}`;
                logDiv.appendChild(entryDiv);
            }

            requestAnimationFrame(() => {
                logDiv.scrollTop = logDiv.scrollHeight;
            });
        }

        getValidRows() {
            return (this.renameRows || [])
                .map(row => ({
                    currentName: String(row.currentName || '').trim(),
                    newName: String(row.newName || '').trim()
                }))
                .filter(row => row.currentName && row.newName);
        }

        restoreSidebarFromStorage() {
            const savedData = localStorage.getItem(this.dataKey);
            if (savedData) {
                try {
                    const data = JSON.parse(savedData);
                    if (data.rows && data.rows.length > 0 && data.currentIndex < data.rows.length) {
                        this.log('Восстанавливаем панель прогресса из storage, индекс:', data.currentIndex);
                        this.renameRows = data.rows;
                        this.currentIndex = data.currentIndex;
                        this.isRenaming = true;

                        if (data.returnUrl) {
                            this.saveReturnUrl(data.returnUrl);
                        }

                        if (this.sidebar) {
                            this.sidebar.remove();
                            this.sidebar = null;
                        }

                        this.createSidebar();
                        this.showSidebar();
                        this.updateSidebarDisplay();
                        this.restoreLogFromStorage();

                        if (this.debug) {
                            this.addSidebarLog(`📊 Продолжение переименования: ${this.currentIndex + 1}/${this.renameRows.length}`, 'info');
                        }

                        if (!this.isEditFormPage()) {
                            this.openTariffForRename(this.renameRows[this.currentIndex]?.currentName);
                        }
                    }
                } catch (error) {
                    console.warn('[TariffRenamer] restoreSidebarFromStorage error', error);
                }
            }
        }

        checkForContinueRename() {
            const savedData = localStorage.getItem(this.dataKey);
            if (savedData && !this.renameStarted && !this.isStopRequested()) {
                try {
                    const data = JSON.parse(savedData);
                    if (data.rows && data.rows.length > 0 && data.currentIndex !== undefined && data.currentIndex < data.rows.length) {
                        this.log('Найдены данные для продолжения, индекс:', data.currentIndex);
                        this.renameRows = data.rows;
                        this.currentIndex = data.currentIndex;
                        this.isRenaming = true;

                        if (data.returnUrl) {
                            this.saveReturnUrl(data.returnUrl);
                        }

                        if (!this.sidebar) {
                            this.createSidebar();
                            this.showSidebar();
                            this.updateSidebarDisplay();
                            this.restoreLogFromStorage();
                        } else {
                            this.showSidebar();
                        }

                        if (this.debug) {
                            this.addSidebarLog(`🔄 Продолжаем переименование: ${this.currentIndex + 1}/${this.renameRows.length}`, 'info');
                        }

                        if (!this.isEditFormPage()) {
                            this.openTariffForRename(this.renameRows[this.currentIndex]?.currentName);
                        }
                    }
                } catch (error) {
                    console.warn('[TariffRenamer] checkForContinueRename error', error);
                }
            }
        }

        checkForEditForm() {
            const nameInput = this.findNameInputFast();

            if (nameInput && !this.renameStarted && this.isRenaming && !this.isStopRequested()) {
                this.log('🎉 Обнаружена форма редактирования!');
                this.renameStarted = true;

                let checkCount = 0;
                const waitForPageLoad = setInterval(() => {
                    if (this.isStopRequested()) {
                        clearInterval(waitForPageLoad);
                        return;
                    }

                    checkCount++;
                    const inputCheck = this.findNameInputFast();

                    if (inputCheck || document.readyState === 'complete' || checkCount > 30) {
                        clearInterval(waitForPageLoad);
                        setTimeout(() => {
                            this.startRenameOnPage();
                        }, 1000);
                    }
                }, 500);
            }
        }

        handleRenameData(dataStr) {
            if (!dataStr) return;
            try {
                const data = JSON.parse(dataStr);
                this.renameRows = data.rows || [];
                this.currentIndex = data.currentIndex || 0;

                if (data.returnUrl) {
                    this.saveReturnUrl(data.returnUrl);
                }

                if (this.debug) {
                    this.addSidebarLog(`📊 Загружено ${this.renameRows.length} записей, продолжаем с ${this.currentIndex + 1}`, 'success');
                }
            } catch (error) {
                console.warn('[TariffRenamer] handleRenameData error', error);
            }
        }

        isStopRequested() {
            return this.shouldStop || localStorage.getItem(this.stopKey) !== null;
        }

        stopRenameProcess(message = '⏹️ Переименование остановлено', type = 'warning') {
            this.shouldStop = true;
            this.isRenaming = false;
            this.renameStarted = false;

            localStorage.removeItem(this.dataKey);
            localStorage.removeItem(this.stateKey);
            this.clearReturnUrl();

            if (this.formCheckInterval) {
                clearInterval(this.formCheckInterval);
                this.formCheckInterval = null;
            }

            this.addSidebarLog(message, type);
            this.updateSidebarDisplay();
        }

        handleStopSignal() {
            this.stopRenameProcess('⏹️ Переименование остановлено из другой вкладки', 'warning');
        }

        showConfigSidebar() {
            const savedData = localStorage.getItem(this.dataKey);
            if (this.isRenaming || savedData) {
                if (savedData) {
                    try {
                        const data = JSON.parse(savedData);
                        if (data.rows && data.rows.length > 0) {
                            this.renameRows = data.rows;
                            this.currentIndex = data.currentIndex || 0;
                            this.isRenaming = this.currentIndex < this.renameRows.length;
                        }
                    } catch (error) {
                        console.warn('[TariffRenamer] showConfigSidebar read data error', error);
                    }
                }

                if (this.isRenaming) {
                    if (this.sidebar && this.sidebar.id === 'tariff-rename-sidebar') {
                        this.showSidebar();
                    } else {
                        this.createSidebar();
                        this.showSidebar();
                        this.updateSidebarDisplay();
                        this.restoreLogFromStorage();
                    }
                    return;
                }
            }

            if (!this.sidebar || this.sidebar.id !== 'tariff-rename-sidebar') {
                this.createSidebar();
            }
            this.showSidebar();
        }

        createSidebar() {
            
            if (this.sidebar && this.sidebar.id === 'tariff-rename-sidebar') return;
            if (this.sidebar) {
                this.sidebar.remove();
            }

            this.sidebar = document.createElement('div');
            this.sidebar.id = 'tariff-rename-sidebar';
            this.sidebar.style.cssText = `
                position: fixed;
                top: 0;
                right: 0;
                width: 450px;
                height: 100vh;
                background: #1e293b;
                box-shadow: -2px 0 20px rgba(0,0,0,0.3);
                z-index: 1000002;
                display: flex;
                flex-direction: column;
                font-family: 'Segoe UI', Arial, sans-serif;
                border-left: 1px solid #334155;
            `;

            this.sidebar.innerHTML = `
                <div style="padding: 16px 20px; background: #0f172a; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h3 style="color: #c084fc; margin: 0; font-size: 18px;">✏️ Переименование тарифов</h3>
                        <div style="color: #94a3b8; font-size: 11px; margin-top: 4px;">Массовое переименование тарифов из Excel</div>
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button id="sidebar-rename-minimize" style="background: none; border: none; color: #94a3b8; font-size: 18px; cursor: pointer; padding: 4px 8px;">−</button>
                        <button id="sidebar-rename-close" style="background: none; border: none; color: #94a3b8; font-size: 20px; cursor: pointer; padding: 4px 8px;">×</button>
                    </div>
                </div>

                <div id="sidebar-rename-status" style="background: #0f172a; margin: 16px; padding: 12px; border-radius: 8px; border-left: 3px solid #c084fc;">
                    <div style="color: #c084fc; font-size: 13px; font-weight: 500;" id="sidebar-rename-status-title">📋 Выберите файл</div>
                    <div style="color: #94a3b8; font-size: 11px; margin-top: 6px;" id="sidebar-rename-status-detail">Скачайте шаблон, заполните новый столбец и загрузите файл</div>
                </div>

                <div style="padding: 0 16px 16px 16px; display:flex; flex-direction:column; gap:10px;">
                    <button id="sidebar-rename-download" style="width:100%; padding:10px; background:linear-gradient(135deg,#60a5fa,#3b82f6); color:white; border:none; border-radius:6px; cursor:pointer;">📥 Скачать шаблон</button>
                    <input type="file" id="sidebar-rename-file" accept=".xls,.xlsx,.xlsm" style="background:#334155; color:white; border:none; padding:8px; border-radius:6px; width:100%; cursor:pointer;">
                </div>

                <div id="sidebar-rename-progress" style="margin: 0 16px 16px 16px;">
                    <div style="height: 8px; background: #334155; border-radius: 4px; overflow: hidden;">
                        <div id="sidebar-rename-progress-fill" style="width: 0%; height: 100%; background: linear-gradient(90deg, #c084fc, #8b5cf6);"></div>
                    </div>
                    <div id="sidebar-rename-progress-text" style="text-align: center; font-size: 12px; color: #94a3b8; margin-top:4px;">0%</div>
                </div>

                <div id="sidebar-rename-log" style="flex: 1 1 auto; min-height: 0; background: #0f172a; margin: 0 16px 16px 16px; padding: 12px; border-radius: 8px; overflow-y: auto; overflow-x: hidden; font-size: 11px; line-height: 1.4; font-family: monospace; white-space: pre-wrap; word-break: break-word;"></div>

                <div style="padding: 16px; border-top: 1px solid #334155;">
                    <div style="display:flex; gap:8px;">
                        <button id="sidebar-rename-start-btn" style="flex:1; padding: 10px; background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; border: none; border-radius: 6px; cursor: pointer;">🚀 Начать</button>
                        <button id="sidebar-rename-stop-btn" style="flex:1; padding: 10px; background: #dc2626; color: white; border: none; border-radius: 6px; cursor: pointer; display:none;">⏹️ Остановить</button>
                    </div>
                </div>
            `;

            document.body.appendChild(this.sidebar);

            document.getElementById('sidebar-rename-close').onclick = () => this.hideSidebar();
            document.getElementById('sidebar-rename-minimize').onclick = () => this.minimizeSidebar();
            document.getElementById('sidebar-rename-download').onclick = () => this.downloadTemplate();
            document.getElementById('sidebar-rename-file').onchange = (e) => this.loadExcelFile(e.target.files[0]);
            document.getElementById('sidebar-rename-start-btn').onclick = () => this.startRename();
            document.getElementById('sidebar-rename-stop-btn').onclick = () => this.stopRename();
        }

        showSidebar() {
            if (this.sidebar) {
                this.sidebar.style.display = 'flex';
                this.restoreSidebar();
                this.restoreLogFromStorage();
                this.updateSidebarDisplay();
            } else {
                this.createSidebar();
            }
        }

        hideSidebar() {
            if (this.sidebar) this.sidebar.style.display = 'none';
        }

        minimizeSidebar() {
            if (this.sidebar) {
                this.sidebar.style.transform = 'translateX(calc(100% - 40px))';
                const btn = document.getElementById('sidebar-rename-minimize');
                if (btn) {
                    btn.textContent = '+';
                    btn.onclick = () => this.restoreSidebar();
                }
            }
        }

        restoreSidebar() {
            if (this.sidebar) {
                this.sidebar.style.transform = 'translateX(0)';
                const btn = document.getElementById('sidebar-rename-minimize');
                if (btn) {
                    btn.textContent = '−';
                    btn.onclick = () => this.minimizeSidebar();
                }
            }
        }

        updateSidebarDisplay() {
            if (!this.sidebar) return;

            const title = document.getElementById('sidebar-rename-status-title');
            const detail = document.getElementById('sidebar-rename-status-detail');
            const fill = document.getElementById('sidebar-rename-progress-fill');
            const text = document.getElementById('sidebar-rename-progress-text');
            const startBtn = document.getElementById('sidebar-rename-start-btn');
            const stopBtn = document.getElementById('sidebar-rename-stop-btn');

            const total = this.getValidRows().length;
            const current = Math.min(this.currentIndex, total);
            const progress = total > 0 ? Math.round((current / total) * 100) : 0;

            if (fill) fill.style.width = `${progress}%`;
            if (text) text.textContent = total > 0 ? `${progress}% (${current}/${total})` : '0%';

            if (this.isRenaming) {
                if (title) title.textContent = '🔄 Переименование';
                if (detail) detail.textContent = `Обрабатывается тариф ${Math.min(this.currentIndex + 1, total)} из ${total}`;
                if (startBtn) startBtn.style.display = 'none';
                if (stopBtn) stopBtn.style.display = 'block';
            } else {
                if (title) title.textContent = total > 0 ? '✅ Данные загружены' : '📋 Выберите файл';
                if (detail) detail.textContent = total > 0
                    ? `Готово к запуску: ${total} записей`
                    : 'Скачайте шаблон, заполните новый столбец и загрузите файл';
                if (startBtn) {
                    startBtn.style.display = 'block';
                    startBtn.disabled = total === 0;
                    startBtn.style.opacity = total === 0 ? '0.5' : '1';
                    startBtn.style.cursor = total === 0 ? 'not-allowed' : 'pointer';
                }
                if (stopBtn) stopBtn.style.display = 'none';
            }
        }

        async loadExcelFile(file) {
            if (!file) return;

            if (typeof XLSX === 'undefined') {
                this.addSidebarLog('❌ Библиотека Excel не загружена', 'error');
                return;
            }

            this.processExcelFile(file);
        }

        processExcelFile(file) {
            this.addSidebarLog(`📁 Загрузка: ${file.name}`, 'info');

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

                    this.renameRows = rows.map(row => ({
                        currentName: String(row['Текущее название тарифа'] || '').trim(),
                        newName: String(row['Новое название тарифа'] || '').trim()
                    })).filter(row => row.currentName && row.newName);

                    this.currentIndex = 0;
                    this.shouldStop = false;
                    this.isRenaming = false;
                    this.saveStateToStorage();
                    this.updateSidebarDisplay();

                    this.addSidebarLog(`✅ Загружено записей для переименования: ${this.renameRows.length}`, 'success');
                } catch (error) {
                    this.addSidebarLog(`❌ Ошибка чтения Excel: ${error.message}`, 'error');
                }
            };

            reader.readAsArrayBuffer(file);
        }

        downloadTemplate() {
            try {
                const cards = Array.from(document.querySelectorAll('.css-nr5n4g'));
                const data = [['Текущее название тарифа', 'Новое название тарифа']];

                cards.forEach(card => {
                    const title = card.querySelector('.css-17i8ct5');
                    const name = String(title?.textContent || '').trim();
                    if (name) data.push([name, '']);
                });

                if (data.length <= 1) {
                    this.addSidebarLog('❌ Не удалось найти тарифы на странице', 'error');
                    return;
                }

                const wb = { SheetNames: [], Sheets: {} };
                const ws = this.buildSheet(data);
                ws['!cols'] = [{ wch: 45 }, { wch: 45 }];
                wb.SheetNames.push('Переименование');
                wb.Sheets['Переименование'] = ws;

                const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'binary' });
                const blob = new Blob([this.s2ab(wbout)], { type: 'application/octet-stream' });
                const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `tariff_rename_template_${timestamp}.xlsx`;
                document.body.appendChild(a);
                a.click();

                setTimeout(() => {
                    if (a.parentNode) a.parentNode.removeChild(a);
                    URL.revokeObjectURL(url);
                }, 100);

                this.addSidebarLog(`📥 Шаблон выгружен: ${data.length - 1} тарифов`, 'success');
            } catch (error) {
                this.addSidebarLog(`❌ Ошибка выгрузки шаблона: ${error.message}`, 'error');
            }
        }

        buildSheet(data) {
            const ws = {};
            const range = { s: { c: 0, r: 0 }, e: { c: 0, r: 0 } };

            for (let R = 0; R < data.length; ++R) {
                for (let C = 0; C < data[R].length; ++C) {
                    if (range.e.r < R) range.e.r = R;
                    if (range.e.c < C) range.e.c = C;
                    const value = data[R][C] == null ? '' : data[R][C];
                    const cell = { v: value, t: typeof value === 'number' ? 'n' : 's' };
                    ws[XLSX.utils.encode_cell({ c: C, r: R })] = cell;
                }
            }

            ws['!ref'] = XLSX.utils.encode_range(range);
            return ws;
        }

        s2ab(s) {
            const buf = new ArrayBuffer(s.length);
            const view = new Uint8Array(buf);
            for (let i = 0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xFF;
            return buf;
        }

        async startRename() {
            if (this.isStopRequested()) {
                localStorage.removeItem(this.stopKey);
                this.shouldStop = false;
            }

            if (!this.formCheckInterval) {
                this.formCheckInterval = setInterval(() => {
                    this.checkForEditForm();
                }, 500);
            }

            if (this.renameRows.length === 0) {
                this.addSidebarLog('❌ Нет данных для переименования', 'error');
                return;
            }

            if (!this.getReturnUrl() || !localStorage.getItem(this.returnUrlKey)) {
                this.saveReturnUrl(window.location.href);
                if (this.debug) {
                    this.addSidebarLog(`🔗 Запомнили исходную страницу: ${this.getReturnUrl()}`, 'info');
                }
            } else {
                this.restoreReturnUrl();
                if (this.debug) {
                    this.addSidebarLog(`🔗 Используем сохранённую исходную страницу: ${this.getReturnUrl()}`, 'info');
                }
            }

            this.addSidebarLog(`🚀 Начинаем переименование ${this.renameRows.length} тарифов...`, 'info');

            localStorage.setItem(this.dataKey, JSON.stringify({
                rows: this.renameRows,
                shouldStart: true,
                currentIndex: 0,
                returnUrl: this.getReturnUrl()
            }));

            this.isRenaming = true;
            this.currentIndex = 0;
            this.renameStarted = false;
            this.shouldStop = false;
            this.saveStateToStorage();
            this.updateSidebarDisplay();

            const firstRow = this.renameRows[0];
            if (!firstRow) {
                this.addSidebarLog('❌ Не найдена первая запись для переименования', 'error');
                return;
            }

            this.openTariffForRename(firstRow.currentName);
            this.addSidebarLog(`✅ Ищем тариф для переименования: ${firstRow.currentName}`, 'success');
            if (this.debug) {
                this.addSidebarLog('💡 Ожидание открытия формы редактирования...', 'info');
            }
        }

        openTariffForRename(tariffName) {
            this.log('Поиск тарифа для переименования:', tariffName);
            let attempts = 0;
            const maxAttempts = 30;

            const checkInterval = setInterval(() => {
                if (this.isStopRequested()) {
                    clearInterval(checkInterval);
                    return;
                }

                attempts++;
                const card = this.findTariffCardByName(tariffName);

                if (card) {
                    clearInterval(checkInterval);
                    const editButton = this.findEditButtonInTariffCard(card);

                    if (editButton) {
                        editButton.click();
                        this.addSidebarLog(`✏️ Открываем тариф в режиме редактирования: ${tariffName}`, 'info');
                    } else {
                        const titleElement = card.querySelector('.css-17i8ct5') || card.querySelector('a, span, h3, h4');
                        if (titleElement) {
                            titleElement.click();
                            this.addSidebarLog(`⚠️ Кнопка редактирования не найдена, открываем карточку: ${tariffName}`, 'warning');
                        } else {
                            this.addSidebarLog(`❌ Не удалось открыть тариф: ${tariffName}`, 'error');
                        }
                    }
                }

                if (attempts >= maxAttempts) {
                    clearInterval(checkInterval);
                    this.addSidebarLog(`❌ Тариф не найден: ${tariffName}`, 'error');
                }
            }, 500);
        }

        findTariffCardByName(name) {
            const normalizedTarget = String(name || '').trim().toLowerCase();
            if (!normalizedTarget) return null;

            const cards = Array.from(document.querySelectorAll('.css-nr5n4g'));
            const getTitleText = (card) => {
                const title = card.querySelector('.css-17i8ct5') || card.querySelector('a, span, h3, h4');
                return String(title?.textContent || card.textContent || '').trim().toLowerCase();
            };

            for (const card of cards) {
                const titleText = getTitleText(card);
                if (titleText === normalizedTarget) return card;
            }

            for (const card of cards) {
                const titleText = getTitleText(card);
                if (titleText.includes(normalizedTarget)) return card;
            }

            return null;
        }

        findEditButtonInTariffCard(card) {
            if (!card) return null;

            const buttons = Array.from(card.querySelectorAll('button'));
            for (const button of buttons) {
                if (button.querySelector('.icomoon-icon__pencil, span[class*="pencil"]')) {
                    return button;
                }
            }
            return null;
        }

        isEditFormPage() {
            return !!this.findNameInputFast();
        }

        findNameInputFast() {
            return document.querySelector('input[placeholder*="Введите название тарифа"]') ||
                   document.querySelector('input[name="name"]');
        }

        async startRenameOnPage() {
            this.log('========== НАЧАЛО ПЕРЕИМЕНОВАНИЯ НА СТРАНИЦЕ ==========');
            this.log('Записей всего:', this.renameRows.length, 'текущий индекс:', this.currentIndex);

            if (this.isStopRequested()) {
                this.stopRenameProcess();
                return;
            }

            if (this.renameRows.length === 0) return;
            if (this.currentIndex >= this.renameRows.length) {
                this.finishRename();
                return;
            }

            this.isRenaming = true;
            this.shouldStop = false;

            this.createSidebar();
            this.showSidebar();

            const remaining = this.renameRows.length - this.currentIndex;
            if (this.debug) {
                this.addSidebarLog(`🚀 Осталось ${remaining} тарифов (${this.currentIndex + 1}-${this.renameRows.length})`, 'info');
            }

            const row = this.renameRows[this.currentIndex];
            this.addSidebarLog(`📝 Переименование: ${row.currentName} → ${row.newName} (${this.currentIndex + 1}/${this.renameRows.length})`, 'info');

            this.updateSidebarDisplay();
            this.saveStateToStorage();

            const success = await this.renameTariff(row);

            if (this.isStopRequested()) {
                this.stopRenameProcess();
                return;
            }

            if (success) {
                this.addSidebarLog(`✅ Переименован: ${row.currentName} → ${row.newName}`, 'success');
                this.currentIndex++;
                this.saveStateToStorage();

                if (this.currentIndex < this.renameRows.length) {
                    if (this.debug) {
                        this.addSidebarLog(`🔄 Переход к следующему тарифу (${this.currentIndex + 1}/${this.renameRows.length})...`, 'info');
                    }

                    localStorage.setItem(this.dataKey, JSON.stringify({
                        rows: this.renameRows,
                        shouldStart: true,
                        currentIndex: this.currentIndex,
                        returnUrl: this.getReturnUrl()
                    }));

                    this.saveStateToStorage();

                    setTimeout(() => {
                        if (this.isStopRequested()) {
                            this.stopRenameProcess();
                            return;
                        }

                        const returnUrl = this.getReturnUrl();

                        if (returnUrl) {
                            if (this.debug) {
                                this.addSidebarLog(`↩️ Возвращаемся на исходную страницу: ${returnUrl}`, 'info');
                            }
                            window.location.href = returnUrl;
                        } else {
                            this.addSidebarLog('⚠️ Исходная ссылка не найдена, возвращаемся на страницу тарифов', 'warning');
                            window.location.href = window.location.origin + '/configurator/tariffs';
                        }
                    }, 1000);
                    return;
                } else {
                    this.finishRename();
                }
            } else {
                this.addSidebarLog(`❌ Ошибка: ${row.currentName}`, 'error');
                this.finishRename();
            }
        }

        async renameTariff(row) {
            let nameInput = null;
            let attempts = 0;

            while (!nameInput && attempts < 15) {
                if (this.isStopRequested()) return false;
                nameInput = this.findNameInputFast();
                if (!nameInput) {
                    await this.delay(300);
                    attempts++;
                }
            }

            if (!nameInput) {
                return false;
            }

            this.setInputValue(nameInput, row.newName);
            nameInput.blur();
            await this.delay(300);

            let saveButton = null;
            attempts = 0;

            while (!saveButton && attempts < 30) {
                if (this.isStopRequested()) return false;
                const buttons = document.querySelectorAll('button');
                for (const btn of buttons) {
                    const text = btn.textContent.trim();
                    if (text === 'Сохранить') {
                        const inDialog = !!btn.closest('dialog[open]');
                        if (!inDialog && !btn.disabled) {
                            saveButton = btn;
                            break;
                        }
                    }
                }
                if (!saveButton) {
                    await this.delay(500);
                    attempts++;
                }
            }

            if (!saveButton) {
                return false;
            }

            if (this.isStopRequested()) return false;

            saveButton.click();
            await this.delay(3000);
            return true;
        }

        setInputValue(input, value) {
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
            if (nativeSetter) nativeSetter.call(input, value);
            else input.value = value;

            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }

        finishRename() {
            this.isRenaming = false;
            this.shouldStop = false;
            this.renameStarted = false;
            this.addSidebarLog('✨ Переименование завершено!', 'success');

            localStorage.removeItem(this.dataKey);
            localStorage.removeItem(this.stateKey);
            localStorage.removeItem(this.stopKey);
            this.clearReturnUrl();

            this.currentIndex = 0;
            this.renameRows = [];

            if (this.formCheckInterval) {
                clearInterval(this.formCheckInterval);
                this.formCheckInterval = null;
            }

            this.updateSidebarDisplay();
        }

        stopRename() {
            this.stopRenameProcess('⏹️ Переименование остановлено пользователем', 'warning');

            localStorage.setItem(this.stopKey, Date.now().toString());
            setTimeout(() => {
                localStorage.removeItem(this.stopKey);
            }, 1000);
        }

        delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
    }

    if (!window.tariffRenamerPro) {
        window.tariffRenamerPro = new TariffRenamer();
    }
})();
