(function() {
    'use strict';

    class TariffCreatorPro {
        constructor() {
            this.storageKeys = {
                data: 'tariff_create_data',
                state: 'tariff_create_state',
                log: 'tariff_create_log',
                config: 'tariff_create_config'
            };

            this.isImporting = false;
            this.shouldStop = false;
            this.importStarted = false;
            this.tariffsToCreate = [];
            this.currentIndex = 0;
            this.sidebar = null;
            this.baseTariffsUrl = '';
            this.logEntries = [];
            this.config = {
                paymentCard: false,
                paymentCash: false,
                acceptanceSameDay: false,
                acceptanceNextDay: false,
                saleProduct: true,
                saleMarkdown: false,
                saleLegal: false,
                saleService: false
            };

            console.log('[TariffCreatorPro] ========== ЗАГРУЗКА ==========');
            console.log('[TariffCreatorPro] URL:', window.location.href);

            this.restoreFromStorage();
            this.restoreConfigFromStorage();
            this.registerStorageListener();
            this.registerPageWatchers();

            setTimeout(() => this.checkForContinueImport(), 600);
            setTimeout(() => this.checkForContinueImport(), 2000);
        }

        registerStorageListener() {
            window.addEventListener('storage', (e) => {
                if (e.key === this.storageKeys.state || e.key === this.storageKeys.data) {
                    this.restoreFromStorage();
                    if (this.sidebar) {
                        this.updateSidebarDisplay();
                        this.restoreLogFromStorage();
                    }
                }
            });
        }

        registerPageWatchers() {
            this.formCheckInterval = setInterval(() => {
                if (!this.isImporting || this.importStarted) return;
                if (this.isCreatePage() && this.findNameInput()) {
                    console.log('[TariffCreatorPro] 🎉 Обнаружена форма создания тарифа');
                    this.importStarted = true;
                    setTimeout(() => this.startImportOnCreatePage(), 1200);
                }
            }, 500);
        }

        isCreatePage() {
            return !!this.findNameInput();
        }

        isTariffsListPage() {
            return /\/configurator\/tariffs(?:\/[0-9a-f-]+)?\/?(?:\?|#)?$/i.test(window.location.href);
        }

        findNameInput() {
            return document.querySelector('input[placeholder*="Введите название тарифа"]');
        }

        restoreConfigFromStorage() {
            const raw = localStorage.getItem(this.storageKeys.config);
            if (!raw) return;
            try {
                this.config = { ...this.config, ...JSON.parse(raw) };
            } catch (error) {
                console.error('[TariffCreatorPro] Ошибка чтения конфига:', error);
            }
        }

        restoreFromStorage() {
            const stateRaw = localStorage.getItem(this.storageKeys.state);
            if (!stateRaw) return;
            try {
                const state = JSON.parse(stateRaw);
                this.isImporting = !!state.isImporting;
                this.currentIndex = Number(state.currentIndex || 0);
                this.tariffsToCreate = Array.isArray(state.tariffs) ? state.tariffs : [];
                this.baseTariffsUrl = state.baseTariffsUrl || this.baseTariffsUrl || window.location.href;
            } catch (error) {
                console.error('[TariffCreatorPro] Ошибка чтения состояния:', error);
            }
        }

        saveStateToStorage() {
            localStorage.setItem(this.storageKeys.state, JSON.stringify({
                isImporting: this.isImporting,
                currentIndex: this.currentIndex,
                tariffs: this.tariffsToCreate,
                baseTariffsUrl: this.baseTariffsUrl
            }));
        }

        saveDataToStorage() {
            localStorage.setItem(this.storageKeys.data, JSON.stringify({
                tariffs: this.tariffsToCreate,
                config: this.config,
                currentIndex: this.currentIndex,
                shouldStart: true,
                baseTariffsUrl: this.baseTariffsUrl
            }));
        }

        clearStorage() {
            localStorage.removeItem(this.storageKeys.data);
            localStorage.removeItem(this.storageKeys.state);
            localStorage.removeItem(this.storageKeys.log);
        }

        saveLogToStorage() {
            localStorage.setItem(this.storageKeys.log, JSON.stringify(this.logEntries));
        }

        restoreLogFromStorage() {
            const raw = localStorage.getItem(this.storageKeys.log);
            if (!raw || !this.sidebar) return;
            try {
                this.logEntries = JSON.parse(raw);
                this.renderLog();
            } catch (error) {
                console.error('[TariffCreatorPro] Ошибка чтения лога:', error);
            }
        }

        addSidebarLog(message, type = 'info') {
            const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            this.logEntries.push({ time, message, type });
            if (this.logEntries.length > 200) this.logEntries.shift();
            this.saveLogToStorage();
            this.renderLog();
        }

        renderLog() {
            const logDiv = document.getElementById('tariff-create-log');
            if (!logDiv) return;
            logDiv.innerHTML = '';
            const colors = { success: '#4ade80', error: '#f87171', info: '#60a5fa', warning: '#fbbf24' };
            if (this.logEntries.length === 0) {
                const empty = document.createElement('div');
                empty.style.color = '#60a5fa';
                empty.textContent = '💡 Готов к массовому созданию';
                logDiv.appendChild(empty);
                return;
            }
            for (const entry of this.logEntries) {
                const div = document.createElement('div');
                div.style.cssText = 'margin-bottom: 6px; padding: 4px 0; border-bottom: 1px solid #334155; font-size: 11px;';
                div.style.color = colors[entry.type] || '#94a3b8';
                div.textContent = `[${entry.time}] ${entry.message}`;
                logDiv.appendChild(div);
            }
            requestAnimationFrame(() => { logDiv.scrollTop = logDiv.scrollHeight; });
        }


        closeOtherSidebars() {
            const sidebarIds = [
                'tariff-export-sidebar',
                'tariff-create-config-sidebar',
                'tariff-create-progress-sidebar',
                'tariff-update-config-sidebar',
                'tariff-update-sidebar'
            ];
            sidebarIds.forEach(id => {
                if (!this.sidebar || id !== this.sidebar.id) {
                    const el = document.getElementById(id);
                    if (el) el.style.display = 'none';
                }
            });
        }

        showConfigSidebar() {
            if (this.isImporting && this.tariffsToCreate.length > 0) {
                this.createProgressSidebar();
                this.showSidebar();
                this.updateSidebarDisplay();
                this.restoreLogFromStorage();
                return;
            }
            this.createConfigSidebar();
            this.showSidebar();
            this.restoreLogFromStorage();
        }

        showSidebar() {
            this.closeOtherSidebars();
            if (this.sidebar) this.sidebar.style.display = 'flex';
        }

        hideSidebar() {
            if (this.sidebar) this.sidebar.style.display = 'none';
        }

        minimizeSidebar() {
            this.hideSidebar();
        }

        createBaseSidebar(id, title, subtitle, accent) {
            if (this.sidebar) this.sidebar.remove();
            this.sidebar = document.createElement('div');
            this.sidebar.id = id;
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
                        <h3 style="color: ${accent}; margin: 0; font-size: 18px;">${title}</h3>
                        <div style="color: #94a3b8; font-size: 11px; margin-top: 4px;">${subtitle}</div>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button id="tariff-create-minimize" style="background: none; border: none; color: #94a3b8; font-size: 18px; cursor: pointer; padding: 4px 8px;">−</button>
                        <button id="tariff-create-close" style="background: none; border: none; color: #94a3b8; font-size: 20px; cursor: pointer; padding: 4px 8px;">×</button>
                    </div>
                </div>
            `;
            document.body.appendChild(this.sidebar);
            document.getElementById('tariff-create-close').onclick = () => this.hideSidebar();
            document.getElementById('tariff-create-minimize').onclick = () => this.minimizeSidebar();
        }

        createConfigSidebar() {
            this.createBaseSidebar(
                'tariff-create-config-sidebar',
                '➕ Массовое создание тарифов',
                'Создание новых тарифов из Excel',
                '#10b981'
            );

            const content = document.createElement('div');
            content.style.cssText = 'display:flex; flex-direction:column; flex:1 1 auto; min-height:0; overflow:hidden;';
            content.innerHTML = `
                <div style="padding: 16px; background: #0f172a; margin: 16px; border-radius: 8px;">
                    <div style="margin-bottom: 12px;">
                        <label style="color: #94a3b8; font-size: 12px; display: block; margin-bottom: 6px;">📁 Excel файл</label>
                        <input type="file" id="tariff-create-file-input" accept=".xls,.xlsx,.xlsm" style="background: #334155; color: white; border: none; padding: 8px; border-radius: 6px; width: 100%; cursor: pointer;">
                    </div>
                    <div style="color:#94a3b8; font-size:11px; line-height:1.5;">
                        Формат колонок такой же, как в импорте/обновлении: название, зоны, филиалы, интервалы, цены, способы оплаты и виды продажи.
                    </div>
                </div>

                <div id="tariff-create-status-box" style="background: #0f172a; margin: 0 16px 16px 16px; padding: 12px; border-radius: 8px; border-left: 3px solid #10b981;">
                    <div style="color: #10b981; font-size: 13px; font-weight: 500;" id="tariff-create-status-title">📋 Выберите файл</div>
                    <div style="color: #94a3b8; font-size: 11px; margin-top: 6px;" id="tariff-create-status-detail">После выбора файла нажмите «Начать создание»</div>
                </div>

                <div style="margin: 0 16px 16px 16px;">
                    <div style="height: 8px; background: #334155; border-radius: 4px; overflow: hidden;">
                        <div id="tariff-create-progress-fill" style="width: 0%; height: 100%; background: linear-gradient(90deg, #10b981, #059669);"></div>
                    </div>
                    <div id="tariff-create-progress-text" style="text-align: center; font-size: 12px; color: #94a3b8; margin-top:4px;">0%</div>
                </div>

                <div id="tariff-create-log" style="flex: 1 1 auto; min-height: 0; background: #0f172a; margin: 0 16px 16px 16px; padding: 12px; border-radius: 8px; overflow-y: auto; overflow-x: hidden; font-size: 11px; line-height: 1.4; font-family: monospace; white-space: pre-wrap; word-break: break-word;"></div>

                <div style="padding: 16px; border-top: 1px solid #334155; display:flex; gap:8px;">
                    <button id="tariff-create-start" style="flex:1; padding: 10px; background: linear-gradient(135deg, #10b981, #059669); color:white; border:none; border-radius:6px; cursor:pointer;">🚀 Начать создание</button>
                    <button id="tariff-create-stop" style="flex:1; padding: 10px; background: #dc2626; color:white; border:none; border-radius:6px; cursor:pointer; display:none;">⏹️ Остановить</button>
                </div>
            `;
            this.sidebar.appendChild(content);

            document.getElementById('tariff-create-file-input').onchange = (e) => this.loadExcelFile(e.target.files[0]);
            document.getElementById('tariff-create-start').onclick = () => this.startImport();
            document.getElementById('tariff-create-stop').onclick = () => this.stopImport();
            this.renderLog();
            this.updateSidebarDisplay();
        }

        createProgressSidebar() {
            this.createBaseSidebar(
                'tariff-create-progress-sidebar',
                '➕ Массовое создание тарифов',
                'Создание новых тарифов из Excel',
                '#10b981'
            );

            const content = document.createElement('div');
            content.style.cssText = 'display:flex; flex-direction:column; flex:1 1 auto; min-height:0; overflow:hidden;';
            content.innerHTML = `
                <div id="tariff-create-status-box" style="background: #0f172a; margin: 16px; padding: 12px; border-radius: 8px; border-left: 3px solid #10b981;">
                    <div style="color: #10b981; font-size: 13px; font-weight: 500;" id="tariff-create-status-title">⏳ Подготовка</div>
                    <div style="color: #94a3b8; font-size: 11px; margin-top: 6px;" id="tariff-create-status-detail">Ожидание перехода на форму создания</div>
                </div>
                <div style="margin: 0 16px 16px 16px;">
                    <div style="height: 8px; background: #334155; border-radius: 4px; overflow: hidden;">
                        <div id="tariff-create-progress-fill" style="width: 0%; height: 100%; background: linear-gradient(90deg, #10b981, #059669);"></div>
                    </div>
                    <div id="tariff-create-progress-text" style="text-align: center; font-size: 12px; color: #94a3b8; margin-top:4px;">0%</div>
                </div>
                <div id="tariff-create-log" style="flex: 1 1 auto; min-height: 0; background: #0f172a; margin: 0 16px 16px 16px; padding: 12px; border-radius: 8px; overflow-y: auto; overflow-x: hidden; font-size: 11px; line-height: 1.4; font-family: monospace; white-space: pre-wrap; word-break: break-word;"></div>
                <div style="padding: 16px; border-top: 1px solid #334155; display:flex; gap:8px;">
                    <button id="tariff-create-start" style="flex:1; padding: 10px; background: #334155; color:#cbd5e1; border:none; border-radius:6px; cursor:default;" disabled>▶️ В процессе</button>
                    <button id="tariff-create-stop" style="flex:1; padding: 10px; background: #dc2626; color:white; border:none; border-radius:6px; cursor:pointer;">⏹️ Остановить</button>
                </div>
            `;
            this.sidebar.appendChild(content);
            document.getElementById('tariff-create-stop').onclick = () => this.stopImport();
            this.renderLog();
            this.updateSidebarDisplay();
        }

        updateSidebarDisplay() {
            const total = this.tariffsToCreate.length;
            const completed = Math.min(this.currentIndex, total);
            const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

            const fill = document.getElementById('tariff-create-progress-fill');
            const text = document.getElementById('tariff-create-progress-text');
            const title = document.getElementById('tariff-create-status-title');
            const detail = document.getElementById('tariff-create-status-detail');
            const startBtn = document.getElementById('tariff-create-start');
            const stopBtn = document.getElementById('tariff-create-stop');

            if (fill) fill.style.width = `${percent}%`;
            if (text) text.textContent = `${percent}% (${completed}/${total})`;

            if (title) {
                if (!total) title.textContent = '📋 Выберите файл';
                else if (this.isImporting && this.currentIndex < total) title.textContent = `🚀 Создание тарифа ${this.currentIndex + 1} из ${total}`;
                else if (total && this.currentIndex >= total) title.textContent = '✅ Создание завершено';
                else title.textContent = `📦 Загружено тарифов: ${total}`;
            }

            if (detail) {
                if (!total) detail.textContent = 'После выбора файла нажмите «Начать создание»';
                else if (this.isImporting && this.currentIndex < total) detail.textContent = this.isCreatePage() ? 'Заполняем форму создания на текущей странице' : 'Переходим к форме создания тарифа';
                else detail.textContent = `Всего загружено ${total} тарифов`;
            }

            if (startBtn && !startBtn.disabled) startBtn.style.display = this.isImporting ? 'none' : 'block';
            if (stopBtn) stopBtn.style.display = this.isImporting ? 'block' : 'none';
        }

        saveConfig() {
            localStorage.setItem(this.storageKeys.config, JSON.stringify(this.config));
        }

        async loadExcelFile(file) {
            if (!file) return;
            if (typeof XLSX === 'undefined') {
                this.addSidebarLog('❌ Библиотека XLSX не загружена', 'error');
                return;
            }
            this.addSidebarLog(`📁 Загрузка файла: ${file.name}`, 'info');
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
                    this.parseTariffs(rows);
                    this.saveConfig();
                    this.saveStateToStorage();
                    this.saveDataToStorage();
                    this.addSidebarLog(`✅ Загружено ${this.tariffsToCreate.length} тарифов`, 'success');
                    this.updateSidebarDisplay();
                } catch (error) {
                    console.error(error);
                    this.addSidebarLog(`❌ Ошибка чтения Excel: ${error.message}`, 'error');
                }
            };
            reader.readAsArrayBuffer(file);
        }

        parseTariffs(rows) {
            this.tariffsToCreate = [];
            this.currentIndex = 0;
            if (!Array.isArray(rows) || rows.length === 0) return;

            const parseBool = (value) => {
                const text = String(value ?? '').replace(/ /g, ' ').trim().toLowerCase();
                return text === 'да' || text === 'true' || text === '1' || text === 'yes';
            };
            const normalizeCell = (value) => {
                const text = String(value ?? '').replace(/ /g, ' ').trim();
                return text && text !== '-' && text !== '—' ? text : '';
            };
            const headerRow = (rows[0] || []).map(value => String(value ?? '').replace(/ /g, ' ').trim());
            const headerIndex = new Map(headerRow.map((header, index) => [header, index]));
            const getCell = (row, header, fallbackIndex = -1) => {
                const index = headerIndex.has(header) ? headerIndex.get(header) : fallbackIndex;
                return index >= 0 ? row[index] : '';
            };
            const parseIntervals = (value) => {
                const raw = String(value ?? '').replace(/ /g, ' ').trim();
                if (!raw || raw === '-' || raw === '—') return [];
                return raw
                    .split(';')
                    .map(item => item.trim())
                    .filter(Boolean)
                    .map(item => {
                        const match = item.match(/^(\d{2}:\d{2})(?::\d{2})?-(\d{2}:\d{2})(?::\d{2})?\s*\(до\s*(\d{2}:\d{2})(?::\d{2})?,\s*вн:\s*([^,]+),\s*кл:\s*([^\)]+)\)$/i);
                        if (!match) return null;
                        return {
                            startTime: match[1],
                            endTime: match[2],
                            orderBefore: match[3],
                            internalPriceAdjustment: normalizeCell(match[4]),
                            priceAdjustment: normalizeCell(match[5])
                        };
                    })
                    .filter(Boolean);
            };

            console.log('[TariffCreatorPro] Заголовки Excel:', headerRow);

            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row || row.length < 3) continue;
                const tariffName = normalizeCell(getCell(row, 'Название тарифа', 0));
                if (!tariffName) continue;

                const zonesValue = getCell(row, 'Зоны доставки', 1);
                const branchesValue = getCell(row, 'Филиалы', 2);
                const zones = normalizeCell(zonesValue) ? String(zonesValue).split(';').map(z => z.trim()).filter(Boolean) : [];
                const branches = normalizeCell(branchesValue) ? String(branchesValue).split(';').map(b => b.trim()).filter(Boolean) : [];
                const intervals = parseIntervals(getCell(row, 'Интервалы доставки', 3));
                const elevatorPrice = {
                    internalPrice: normalizeCell(getCell(row, 'Подъем на лифте внутренняя, руб', 4)),
                    customerPrice: normalizeCell(getCell(row, 'Подъем на лифте клиент, руб', 5))
                };
                const mgxRow = {
                    weight: normalizeCell(getCell(row, 'Макс. вес (МГХ), кг', 6)),
                    internal: normalizeCell(getCell(row, 'Цена внутренняя, руб', 7)),
                    customer: normalizeCell(getCell(row, 'Цена покупателя, руб', 8)),
                    return: normalizeCell(getCell(row, 'Цена возврата, руб', 9))
                };
                const floorRow = {
                    weight: normalizeCell(getCell(row, 'Макс. вес (подъем), кг', 10)),
                    internalPrice: normalizeCell(getCell(row, 'Стоимость внутренняя за 1 этаж, руб', 11)),
                    internalThreshold: normalizeCell(getCell(row, 'Начиная с этажа (внутр.)', 12)),
                    customerPrice: normalizeCell(getCell(row, 'Стоимость для клиента за 1 этаж, руб', 13)),
                    customerThreshold: normalizeCell(getCell(row, 'Начиная с этажа (клиент)', 14))
                };
                const paymentCard = parseBool(getCell(row, 'Оплата картой', 15));
                const paymentCash = parseBool(getCell(row, 'Оплата наличными', 16));
                const acceptanceSameDay = parseBool(getCell(row, 'В день оформления', 17));
                const acceptanceNextDay = parseBool(getCell(row, 'На следующий день', 18));
                const saleProduct = parseBool(getCell(row, 'Исправный товар', 19));
                const saleMarkdown = parseBool(getCell(row, 'Уцененный товар', 20));
                const saleLegal = parseBool(getCell(row, 'Юридические лица', 21));
                const saleService = parseBool(getCell(row, 'Сервисный центр', 22));

                let tariff = this.tariffsToCreate.find(t => t.name === tariffName);
                if (!tariff) {
                    tariff = {
                        name: tariffName,
                        zones,
                        branches,
                        intervals,
                        elevatorPrice,
                        mgxRows: [],
                        floorRows: [],
                        payment: { card: paymentCard, cash: paymentCash },
                        acceptance: { sameDay: acceptanceSameDay, nextDay: acceptanceNextDay },
                        saleTypes: { product: saleProduct, markdown: saleMarkdown, legal: saleLegal, service: saleService },
                        sale: { product: saleProduct, markdown: saleMarkdown, legal: saleLegal, service: saleService }
                    };
                    this.tariffsToCreate.push(tariff);
                }

                if ((!tariff.intervals || tariff.intervals.length === 0) && intervals.length > 0) tariff.intervals = intervals;
                if ((!tariff.elevatorPrice?.internalPrice && !tariff.elevatorPrice?.customerPrice) && (elevatorPrice.internalPrice || elevatorPrice.customerPrice)) {
                    tariff.elevatorPrice = elevatorPrice;
                }
                if (mgxRow.weight || mgxRow.internal || mgxRow.customer || mgxRow.return) tariff.mgxRows.push(mgxRow);
                if (floorRow.weight || floorRow.internalPrice || floorRow.customerPrice) tariff.floorRows.push(floorRow);
            }
        }

        async startImport() {
            if (!this.tariffsToCreate.length) {
                this.addSidebarLog('⚠️ Сначала загрузите Excel файл', 'warning');
                return;
            }

            this.isImporting = true;
            this.shouldStop = false;
            this.importStarted = false;
            this.saveStateToStorage();
            this.saveDataToStorage();
            this.createProgressSidebar();
            this.showSidebar();
            this.updateSidebarDisplay();
            this.addSidebarLog(`🚀 Запускаем создание ${this.tariffsToCreate.length} тарифов`, 'info');

            await this.routeToNextStep();
        }

        async routeToNextStep() {
            if (this.shouldStop) return;
            if (this.currentIndex >= this.tariffsToCreate.length) {
                this.finishImport();
                return;
            }

            if (this.isCreatePage() && this.findNameInput()) {
                this.importStarted = true;
                await this.startImportOnCreatePage();
                return;
            }

            if (this.isTariffsListPage()) {
                this.addSidebarLog('📄 Открываем форму создания тарифа', 'info');
                this.openCreatePageFromList();
                return;
            }

            this.addSidebarLog('↪️ Переход к списку тарифов', 'info');
            window.location.href = `${window.location.origin}/configurator/tariffs/`;
        }

        checkForContinueImport() {
            const raw = localStorage.getItem(this.storageKeys.data);
            if (!raw) return;
            try {
                const data = JSON.parse(raw);
                if (!Array.isArray(data.tariffs) || data.tariffs.length === 0) return;
                this.tariffsToCreate = data.tariffs;
                this.config = { ...this.config, ...(data.config || {}) };
                this.currentIndex = Number(data.currentIndex || 0);
                this.baseTariffsUrl = data.baseTariffsUrl || this.baseTariffsUrl || window.location.href;
                this.isImporting = !!data.shouldStart && this.currentIndex < this.tariffsToCreate.length;
                this.saveStateToStorage();
                if (!this.isImporting) return;
                this.createProgressSidebar();
                this.showSidebar();
                this.updateSidebarDisplay();
                this.restoreLogFromStorage();

                if (this.isCreatePage() && this.findNameInput() && !this.importStarted) {
                    this.importStarted = true;
                    setTimeout(() => this.startImportOnCreatePage(), 1200);
                } else if (this.isTariffsListPage()) {
                    setTimeout(() => this.openCreatePageFromList(), 1200);
                }
            } catch (error) {
                console.error('[TariffCreatorPro] Ошибка восстановления данных:', error);
            }
        }

        openCreatePageFromList() {
            const buttons = Array.from(document.querySelectorAll('button'));
            const createBtn = buttons.find(btn => {
                const text = (btn.textContent || '').trim();
                return text === 'Создать' || text.includes('Создать');
            });

            if (createBtn) {
                createBtn.click();
                this.addSidebarLog('🖱️ Нажата кнопка «Создать» на текущей странице тарифов', 'info');
                return;
            }

            this.addSidebarLog('❌ Кнопка «Создать» на текущей странице тарифов не найдена', 'error');
            this.stopImport();
        }

        async startImportOnCreatePage() {
            if (!this.isImporting || this.shouldStop) return;
            if (this.currentIndex >= this.tariffsToCreate.length) {
                this.finishImport();
                return;
            }
            const updater = await this.waitForTariffUpdater();
            if (!updater || typeof updater.createTariff !== 'function') {
                this.addSidebarLog('❌ Не найден рабочий модуль tariffUpdaterPro', 'error');
                return;
            }

            const tariff = this.tariffsToCreate[this.currentIndex];
            this.addSidebarLog(`📝 Создаем тариф: ${tariff.name} (${this.currentIndex + 1}/${this.tariffsToCreate.length})`, 'info');
            this.updateSidebarDisplay();

            try {
                if (typeof updater.prepareForCreatorRun === 'function') {
                    updater.prepareForCreatorRun();
                }
                const success = await updater.createTariff(tariff);
                if (!success) {
                    const failure = typeof updater.getLastCreateFailure === 'function' ? updater.getLastCreateFailure() : null;
                    if (failure?.step) {
                        const detailSuffix = failure.details?.block ? ` (блок: ${failure.details.block})` : '';
                        this.addSidebarLog(`❌ Ошибка создания тарифа: ${tariff.name}; шаг: ${failure.step}${detailSuffix}`, 'error');
                        console.error('[TariffCreatorPro] Детали createTariff:', failure);
                    } else {
                        this.addSidebarLog(`❌ Ошибка создания тарифа: ${tariff.name}`, 'error');
                    }
                    this.stopImport();
                    return;
                }
                this.addSidebarLog(`✅ Создан тариф: ${tariff.name}`, 'success');
                this.currentIndex += 1;
                this.importStarted = false;
                this.saveStateToStorage();
                this.saveDataToStorage();
                this.updateSidebarDisplay();

                if (this.currentIndex >= this.tariffsToCreate.length) {
                    this.finishImport();
                    return;
                }

                this.addSidebarLog('↩️ Возвращаемся к исходной странице тарифов для продолжения создания', 'info');
                setTimeout(() => {
                    if (this.baseTariffsUrl) {
                        window.location.href = this.baseTariffsUrl;
                    } else {
                        window.history.back();
                    }
                }, 1000);
            } catch (error) {
                console.error(error);
                this.addSidebarLog(`❌ Ошибка создания: ${error.message}`, 'error');
                this.stopImport();
            }
        }

        waitForTariffUpdater() {
            return new Promise((resolve) => {
                let attempts = 0;
                const timer = setInterval(() => {
                    attempts += 1;
                    if (window.tariffUpdaterPro && typeof window.tariffUpdaterPro.createTariff === 'function') {
                        clearInterval(timer);
                        resolve(window.tariffUpdaterPro);
                    } else if (attempts > 40) {
                        clearInterval(timer);
                        resolve(null);
                    }
                }, 250);
            });
        }

        stopImport() {
            this.shouldStop = true;
            this.isImporting = false;
            this.importStarted = false;
            this.saveStateToStorage();
            this.clearStorage();
            this.addSidebarLog('⏹️ Массовое создание остановлено', 'warning');
            this.updateSidebarDisplay();
        }

        finishImport() {
            this.isImporting = false;
            this.importStarted = false;
            this.addSidebarLog('✨ Массовое создание завершено', 'success');
            this.updateSidebarDisplay();
            this.clearStorage();
        }
    }

    window.TariffCreatorPro = TariffCreatorPro;

    window.ensureTariffCreatorPro = function ensureTariffCreatorPro() {
        try {
            if (!window.tariffCreatorPro || typeof window.tariffCreatorPro.showConfigSidebar !== 'function') {
                window.tariffCreatorPro = new TariffCreatorPro();
            }
            return window.tariffCreatorPro;
        } catch (error) {
            console.error('[TariffCreatorPro] Ошибка инициализации:', error);
            return null;
        }
    };

    window.ensureTariffCreatorPro();
})();
