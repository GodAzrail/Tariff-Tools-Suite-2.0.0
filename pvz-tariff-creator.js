// pvz-tariff-creator.js
console.log('[pvz-tariff-creator] Загружен с умным наблюдателем и финальным редиректом');

class PVZTariffCreator {
    constructor() {
        this.isCreating = false;
        this.shouldStop = false;
        this.tariffsToCreate = [];
        this.currentIndex = 0;
        this.sidebar = null;
        this.logEntries = [];
        this.baseTariffsUrl = ''; 
        this.isProcessingStep = false; // Блокировщик двойного срабатывания таймера

        // 1. Восстанавливаем состояние из памяти браузера (если была перезагрузка)
        this.loadStateFromStorage();

        // 2. Если мы были в процессе создания, возобновляем интерфейс
        if (this.isCreating) {
            this.createSidebar();
            this.renderLog();
            this.updateSidebarDisplay();
            this.addLog('🔄 Возобновление автоматического создания тарифов...', 'info');
        }

        // 3. Запускаем постоянный наблюдатель за страницей
        this.startPageWatcher();
    }

    // === Работа с памятью (localStorage) ===
    saveStateToStorage() {
        const state = {
            isCreating: this.isCreating,
            currentIndex: this.currentIndex,
            tariffsToCreate: this.tariffsToCreate,
            baseTariffsUrl: this.baseTariffsUrl,
            logEntries: this.logEntries
        };
        localStorage.setItem('pvz_automation_state', JSON.stringify(state));
    }

    loadStateFromStorage() {
        const raw = localStorage.getItem('pvz_automation_state');
        if (!raw) return;
        try {
            const state = JSON.parse(raw);
            this.isCreating = !!state.isCreating;
            this.currentIndex = Number(state.currentIndex || 0);
            this.tariffsToCreate = Array.isArray(state.tariffsToCreate) ? state.tariffsToCreate : [];
            this.baseTariffsUrl = state.baseTariffsUrl || '';
            this.logEntries = Array.isArray(state.logEntries) ? state.logEntries : [];
        } catch (e) {
            console.error('[PVZ Creator] Ошибка чтения localStorage:', e);
        }
    }

    clearStorage() {
        localStorage.removeItem('pvz_automation_state');
    }

    // === Наблюдатель за страницей (Движок стейт-машины) ===
    startPageWatcher() {
        setInterval(async () => {
            if (!this.isCreating || this.shouldStop || this.isProcessingStep) return;

            this.isProcessingStep = true; // Блокируем новые вызовы, пока обрабатываем текущий

            // 1. Ищем поле ввода (индикатор того, что открыта сама форма)
            const nameInput = document.querySelector('input[placeholder*="Введите название тарифа"]');
            
            // 2. Ищем модальное окно выбора типа тарифа
            const dialog = document.querySelector('dialog[open]');
            const isTypeDialog = dialog && dialog.textContent.includes('Выберите тип тарифа');

            if (nameInput) {
                // СОСТОЯНИЕ 3: ФОРМА ОТКРЫТА -> ЗАПОЛНЯЕМ И СОХРАНЯЕМ
                await this.processCreatePage();
            } 
            else if (isTypeDialog) {
                // СОСТОЯНИЕ 2: ОТКРЫТО ОКНО ВЫБОРА -> ЖМЕМ "ДОСТАВКА В ПВЗ"
                this.addLog('💬 Выбираем тип тарифа...', 'info');
                const pvzButton = Array.from(dialog.querySelectorAll('button')).find(btn => {
                    const text = (btn.textContent || '').trim().toUpperCase();
                    return text === 'ДОСТАВКА В ПВЗ';
                });
                
                if (pvzButton) {
                    pvzButton.click();
                    this.addLog('✅ Нажата кнопка "Доставка в ПВЗ"', 'success');
                    await this.delay(1500); // Ждем пока загрузится сама форма
                } else {
                    this.addLog('⚠️ Кнопка "Доставка в ПВЗ" не найдена', 'warning');
                }
            } 
            else {
                // СОСТОЯНИЕ 1: СПИСОК ТАРИФОВ -> ИЩЕМ И ЖМЕМ КНОПКУ "СОЗДАТЬ"
                const createBtn = Array.from(document.querySelectorAll('button')).find(b => {
                    const text = (b.textContent || '').trim().toLowerCase();
                    // Ищем именно кнопку создания, игнорируя кнопки нашего сайдбара
                    return text.includes('создать') && text.length < 30 && !b.closest('#pvz-creator-sidebar');
                });

                if (createBtn) {
                    this.addLog('🖱️ Находимся в списке. Нажимаем кнопку "Создать"...', 'info');
                    createBtn.click();
                    await this.delay(1000); // Ждем пока появится модальное окно
                } else {
                    // Если потерялись (нас занесло на левую страницу) — возвращаемся на старт
                    if (this.baseTariffsUrl && window.location.href !== this.baseTariffsUrl) {
                        this.addLog('↩️ Неверный URL. Направляем на точную страницу старта...', 'warning');
                        window.location.href = this.baseTariffsUrl;
                    }
                }
            }

            this.isProcessingStep = false; // Снимаем блокировку
        }, 1500);
    }

    // Точка входа при загрузке Excel
    async startFromExcel(file) {
        if (this.isCreating) return;
        
        this.isCreating = true;
        this.shouldStop = false;
        this.tariffsToCreate = [];
        this.currentIndex = 0;
        this.logEntries = [];
        
        // КРИТИЧЕСКИЙ МОМЕНТ: Запоминаем ТОЧНЫЙ URL старта (с дивизионом, вкладками и т.д.)
        this.baseTariffsUrl = window.location.href; 

        this.createSidebar();
        this.addLog('🚀 Запуск массового создания ПВЗ-тарифов', 'info');

        try {
            const rows = await this.readExcelFile(file);
            this.parseTariffs(rows);
            this.addLog(`📊 Загружено ${this.tariffsToCreate.length} тарифов`, 'success');
            
            // Сохраняем начальное состояние
            this.saveStateToStorage();
            this.updateSidebarDisplay();
            
            // Дальше всё сделает startPageWatcher()
        } catch (e) {
            this.addLog(`❌ Ошибка: ${e.message}`, 'error');
            this.isCreating = false;
            this.clearStorage();
        }
    }

    // Логика обработки страницы создания тарифа
    async processCreatePage() {
        if (this.currentIndex >= this.tariffsToCreate.length) {
            this.finishImport();
            return;
        }

        const tariff = this.tariffsToCreate[this.currentIndex];
        this.addLog(`➡️ Заполняем тариф (${this.currentIndex + 1}/${this.tariffsToCreate.length}): ${tariff.name}`, 'info');
        this.updateSidebarDisplay();

        try {
            // Заполнение полей формы
            await this.fillFormFields(tariff);
            
            // Нажатие главной кнопки "Сохранить"
            const isSaved = await this.clickMainSaveButton(); 

            if (isSaved) {
                this.currentIndex++;
                
                // Проверяем, был ли это последний тариф
                if (this.currentIndex >= this.tariffsToCreate.length) {
                    this.finishImport();
                    this.addLog('↩️ Завершено! Возвращаемся к списку тарифов...', 'info');
                    await this.delay(2000); // Даем 2 секунды прочитать лог
                    window.location.href = this.baseTariffsUrl; // Финальный редирект на старт
                } else {
                    this.saveStateToStorage(); // Запоминаем новый индекс перед редиректом
                    this.addLog('↩️ Тариф сохранен! Перенаправляем на ТОЧНУЮ страницу старта...', 'success');
                    await this.delay(1000);
                    // ХАРД-РЕДИРЕКТ НА СТРАНИЦУ СТАРТА (Перезагрузит страницу и сохранит дивизион)
                    window.location.href = this.baseTariffsUrl; 
                }
            } else {
                this.addLog('❌ Не удалось сохранить тариф. Остановка автоматизации.', 'error');
                this.stop();
            }
        } catch (e) {
            this.addLog(`❌ Критическая ошибка на шаге: ${e.message}`, 'error');
            this.stop();
        }
    }

    async fillFormFields(tariff) {
        const nameInput = document.querySelector('input[placeholder*="Введите название тарифа"]');
        if (nameInput) {
            nameInput.value = tariff.name;
            nameInput.dispatchEvent(new Event('input', {bubbles: true}));
            this.addLog(`📝 Название: ${tariff.name}`, 'success');
        }

        await this.openAndSelectZones(tariff.zones);
        await this.openAndSelectBranches(tariff.branches);

        const daysInput = document.querySelector('input[placeholder*="Количество дней доставки"]');
        if (daysInput) {
            daysInput.value = tariff.deliveryDays || '0';
            daysInput.dispatchEvent(new Event('input', {bubbles: true}));
            this.addLog(`📅 Дней: ${daysInput.value}`, 'success');
        }

        const cutoffInput = document.querySelector('input[placeholder*="Отсечка оформления заказа"]');
        if (cutoffInput) {
            cutoffInput.value = tariff.cutoffTime || '00:00';
            cutoffInput.dispatchEvent(new Event('input', {bubbles: true}));
            this.addLog(`⏰ Отсечка: ${cutoffInput.value}`, 'success');
        }

        await this.fillMgxGrid(tariff.mgxRows);
    }

    async clickMainSaveButton() {
        this.addLog('🔍 Ищем ГЛАВНУЮ кнопку "Сохранить"...', 'info');
        let attempts = 0;
        while (attempts < 30) {
            if (this.shouldStop) return false;
            const saveBtn = Array.from(document.querySelectorAll('button')).find(btn => {
                const text = (btn.textContent || '').trim();
                return text === 'Сохранить' && !btn.disabled && !btn.closest('dialog[open]');
            });

            if (saveBtn) {
                this.addLog(`🔍 Найдена ГЛАВНАЯ кнопка "Сохранить"`, 'info');
                saveBtn.scrollIntoView({ block: 'center', behavior: 'smooth' });
                saveBtn.focus();
                
                await this.delay(300); 
                saveBtn.click();

                this.addLog('💾 ✅ Нажата ГЛАВНАЯ кнопка "Сохранить"', 'success');
                await this.delay(2500); // Даем время серверу принять запрос
                return true;
            }

            await this.delay(400);
            attempts++;
        }
        this.addLog('⚠️ ГЛАВНАЯ кнопка "Сохранить" не найдена', 'error');
        return false;
    }

    async clickDialogSaveButton(dialog) {
        const saveBtn = Array.from(dialog.querySelectorAll('button')).find(b => {
            return (b.textContent || '').trim() === 'Сохранить' && !b.disabled;
        });
        if (saveBtn) {
            saveBtn.click();
            await this.delay(800);
            return true;
        }
        return false;
    }

    async openAndSelectZones(zones) {
        if (!zones || zones.length === 0) return;
        const pencil = this.findPencilIcon('Зоны доставки');
        if (!pencil) return this.addLog('⚠️ Иконка Зон не найдена', 'warning');
        pencil.click();
        await this.delay(1500);
        const dialog = document.querySelector('dialog[open]');
        if (!dialog) return;
        for (const zone of zones) {
            const cb = this.findCheckboxByText(dialog, zone);
            if (cb && !cb.checked) cb.click();
        }
        await this.clickDialogSaveButton(dialog);
        await this.delay(1000);
        this.addLog(`📍 Зоны: ${zones.join(', ')}`, 'success');
    }

    async openAndSelectBranches(branches) {
        if (!branches || branches.length === 0) return;
        const pencil = this.findPencilIcon('Филиалы обслуживания');
        if (!pencil) return this.addLog('⚠️ Иконка Филиалов не найдена', 'warning');
        pencil.click();
        await this.delay(1500);
        const dialog = document.querySelector('dialog[open]');
        if (!dialog) return;
        for (const branch of branches) {
            const cb = this.findCheckboxByText(dialog, branch);
            if (cb && !cb.checked) cb.click();
        }
        await this.clickDialogSaveButton(dialog);
        await this.delay(1000);
        this.addLog(`🏢 Филиалы: ${branches.join(', ')}`, 'success');
    }

    async fillMgxGrid(mgxRows) {
        if (!mgxRows || mgxRows.length === 0) return;
        const pencil = this.findPencilIcon('МГХ сетка');
        if (!pencil) return this.addLog('⚠️ Иконка МГХ не найдена', 'warning');
        pencil.click();
        await this.delay(1500);
        const dialog = document.querySelector('dialog[open]');
        if (!dialog) return;

        const bulkInternal = dialog.querySelector('#af-bulk0');
        const bulkCustomer = dialog.querySelector('#af-bulk1');
        if (bulkInternal && bulkCustomer) {
            bulkInternal.value = mgxRows.map(r => r.internal).join('\n');
            bulkCustomer.value = mgxRows.map(r => r.customer).join('\n');
            bulkInternal.dispatchEvent(new Event('input', {bubbles: true}));
            bulkCustomer.dispatchEvent(new Event('input', {bubbles: true}));
            const transferBtn = dialog.querySelector('#af-transfer-all');
            if (transferBtn) transferBtn.click();
        }
        await this.delay(1500);
        await this.clickDialogSaveButton(dialog);
        this.addLog(`📊 МГХ заполнена (${mgxRows.length} строк)`, 'success');
    }

    findPencilIcon(labelText) {
        const labels = Array.from(document.querySelectorAll('span, div, label'));
        for (const el of labels) {
            if (el.textContent.trim() === labelText) {
                return el.parentElement.querySelector('span[class*="pencil"], .icomoon-icon__pencil');
            }
        }
        return null;
    }

    findCheckboxByText(dialog, text) {
        const wanted = String(text).trim().toLowerCase();
        const candidates = dialog.querySelectorAll('label, span, div');
        for (const el of candidates) {
            if (String(el.textContent).trim().toLowerCase() === wanted) {
                const checkbox = el.querySelector('input[type="checkbox"]') || el.closest('label')?.querySelector('input[type="checkbox"]');
                if (checkbox) return checkbox;
            }
        }
        return null;
    }

    async readExcelFile(file) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = e => {
                try {
                    const wb = XLSX.read(new Uint8Array(e.target.result), {type: 'array'});
                    resolve(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header: 1}));
                } catch (err) { reject(err); }
            };
            r.onerror = reject;
            r.readAsArrayBuffer(file);
        });
    }

    parseTariffs(rows) {
        this.tariffsToCreate = [];
        if (!rows || rows.length < 2) return;

        const header = rows[0].map(h => String(h || '').trim());
        const headerMap = new Map(header.map((h, i) => [h, i]));
        const get = (row, key, fb = -1) => row[headerMap.has(key) ? headerMap.get(key) : fb] || '';

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const name = String(get(row, 'Название тарифа', 0)).trim();
            if (!name) continue;

            let t = this.tariffsToCreate.find(x => x.name === name);
            if (!t) {
                t = {
                    name,
                    zones: String(get(row, 'Зоны доставки', 1)).split(';').map(z => z.trim()).filter(Boolean),
                    branches: String(get(row, 'Филиалы', 2)).split(';').map(b => b.trim()).filter(Boolean),
                    deliveryDays: get(row, 'Количество дней доставки', -1),
                    cutoffTime: get(row, 'Отсечка оформления заказа', -1),
                    mgxRows: []
                };
                this.tariffsToCreate.push(t);
            }

            t.mgxRows.push({
                weight: get(row, 'Макс. вес (МГХ), кг', 3),
                internal: get(row, 'Цена внутренняя, руб', 4),
                customer: get(row, 'Цена покупателя, руб', 5)
            });
        }
    }

    createSidebar() {
        if (this.sidebar) this.sidebar.remove();
        this.sidebar = document.createElement('div');
        this.sidebar.id = 'pvz-creator-sidebar';
        this.sidebar.style.cssText = `position:fixed;top:0;right:0;width:420px;height:100vh;background:#1e293b;box-shadow:-2px 0 20px rgba(0,0,0,0.3);z-index:1000002;display:flex;flex-direction:column;font-family:'Segoe UI',Arial,sans-serif;border-left:1px solid #334155;`;

        this.sidebar.innerHTML = `
            <div style="padding:16px 20px;background:#0f172a;border-bottom:1px solid #334155;display:flex;justify-content:space-between;align-items:center;">
                <div><h3 style="color:#60a5fa;margin:0;font-size:18px;">➕ Создание ПВЗ-тарифов</h3></div>
                <button id="pvz-close" style="background:none;border:none;color:#94a3b8;font-size:22px;cursor:pointer;">×</button>
            </div>
            <div style="padding:16px;flex:1;display:flex;flex-direction:column;min-height:0;">
                <div style="margin-bottom:12px;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:6px;color:#94a3b8;font-size:13px;">
                        <span>Прогресс</span>
                        <span id="pvz-progress">0 / 0</span>
                    </div>
                    <div style="height:8px;background:#334155;border-radius:4px;overflow:hidden;">
                        <div id="pvz-fill" style="width:0%;height:100%;background:linear-gradient(90deg,#3b82f6,#60a5fa);"></div>
                    </div>
                </div>
                <div id="pvz-log" style="flex:1;background:#0f172a;border-radius:8px;padding:12px;overflow-y:auto;font-size:12px;font-family:monospace;"></div>
            </div>
            <div style="padding:16px;border-top:1px solid #334155;">
                <button id="pvz-stop" style="width:100%;padding:10px;background:#dc2626;color:white;border:none;border-radius:6px;cursor:pointer;">⏹️ Остановить</button>
            </div>
        `;

        document.body.appendChild(this.sidebar);
        document.getElementById('pvz-close').onclick = () => this.hideSidebar();
        document.getElementById('pvz-stop').onclick = () => this.stop();
    }

    addLog(message, type = 'info') {
        this.logEntries.push({ time: new Date().toLocaleTimeString(), message, type });
        this.saveStateToStorage(); // Синхронизируем логи в хранилище
        this.renderLog();
    }

    renderLog() {
        const logDiv = document.getElementById('pvz-log');
        if (!logDiv) return;
        logDiv.innerHTML = '';
        const colors = { success: '#4ade80', error: '#f87171', info: '#60a5fa', warning: '#fbbf24' };
        for (const entry of this.logEntries) {
            const div = document.createElement('div');
            div.style.color = colors[entry.type] || '#cbd5e1';
            div.style.marginBottom = '4px';
            div.textContent = `[${entry.time}] ${entry.message}`;
            logDiv.appendChild(div);
        }
        logDiv.scrollTop = logDiv.scrollHeight;
    }

    updateSidebarDisplay() {
        const progressEl = document.getElementById('pvz-progress');
        const fillEl = document.getElementById('pvz-fill');
        if (progressEl) progressEl.textContent = `${this.currentIndex} / ${this.tariffsToCreate.length}`;
        if (fillEl && this.tariffsToCreate.length > 0) {
            fillEl.style.width = `${(this.currentIndex / this.tariffsToCreate.length) * 100}%`;
        }
    }

    stop() {
        this.shouldStop = true;
        this.isCreating = false;
        this.clearStorage();
        this.addLog('Остановлено пользователем', 'warning');
        this.updateSidebarDisplay();
    }

    finishImport() {
        this.isCreating = false;
        this.addLog('🏁 Все тарифы успешно созданы конвейером!', 'success');
        this.updateSidebarDisplay();
        this.clearStorage();
    }

    hideSidebar() {
        if (this.sidebar) this.sidebar.remove();
        this.sidebar = null;
    }

    delay(ms) {
        return new Promise(r => setTimeout(r, ms));
    }
}

// Переинициализация синглтона при перезагрузках страницы
window.pvzTariffCreator = new PVZTariffCreator();
window.startPVZTariffCreationFromExcel = f => window.pvzTariffCreator.startFromExcel(f);