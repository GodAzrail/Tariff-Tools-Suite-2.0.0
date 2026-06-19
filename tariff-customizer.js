// tariff-customizer.js - v6 (Dual-Defense React Patch)
(function() {
    'use strict';

    if (!window.originalPushState) window.originalPushState = history.pushState;
    if (!window.originalReplaceState) window.originalReplaceState = history.replaceState;

    class TariffCustomizer {
        constructor() {
            this.pinnedTariffs = new Set();
            this.favoriteTariffs = new Set();
            this.vipTariffs = new Set();
            this.superTariffs = new Set();
            this.tariffPositions = {};
            this.draggedItem = null;
            this.container = null;
            this.mainColumn = null;
            this.favoriteColumn = null;
            this.vipColumn = null;
            this.superColumn = null;
            this.cards = [];
            this.favoriteCards = [];
            this.vipCards = [];
            this.superCards = [];
            this.storageKey = 'tariff_customizer_v3';
            this.isUpdating = false;
            this.initialized = false;
            this.observer = null;
            this.updateTimeout = null;
            this.initAttempts = 0;
            this.checkInterval = null;
            this.isRestoring = false;
            this.resizeTimeout = null;
            this.isDestroying = false;
            this.isHandlingNavigation = false;
            this.lastUrl = '';
            this.navigationTimeout = null;
            this.initDelayTimeout = null;
            this.loadMoreObserver = null;
            this.isLoadingMore = false;
            
            this.categoryMenu = null;
            this.currentCardForMenu = null;
            this.currentTariffIdForMenu = null;
            
            console.log('[TariffCustomizer] ========== ИНИЦИАЛИЗАЦИЯ v6 ==========');
            this.patchReactDOM(); 
            this.setupTabInterception(); // Перехват кликов по вкладкам
            this.init();
        }

        // ==========================================
        // ПАТЧ 1: Абсолютное подавление NotFoundError
        // ==========================================
        patchReactDOM() {
            if (window.__tariffReactPatched) return;
            window.__tariffReactPatched = true;
            
            const originalRemoveChild = Node.prototype.removeChild;
            Node.prototype.removeChild = function(child) {
                try {
                    return originalRemoveChild.call(this, child);
                } catch (e) {
                    if (e.name === 'NotFoundError') {
                        // React потерял элемент. Пытаемся удалить его оттуда, где он сейчас находится.
                        if (child && child.parentNode) {
                            try { return originalRemoveChild.call(child.parentNode, child); } catch (err) {}
                        }
                        return child; // Глушим ошибку, отдаем React то, что он просил
                    }
                    throw e;
                }
            };

            const originalInsertBefore = Node.prototype.insertBefore;
            Node.prototype.insertBefore = function(newNode, referenceNode) {
                try {
                    return originalInsertBefore.call(this, newNode, referenceNode);
                } catch (e) {
                    if (e.name === 'NotFoundError') {
                        if (referenceNode && referenceNode.parentNode) {
                            try { return originalInsertBefore.call(referenceNode.parentNode, newNode, referenceNode); } catch (err) {}
                        }
                        try { return this.appendChild(newNode); } catch(err) {}
                        return newNode;
                    }
                    throw e;
                }
            };
        }

        // ==========================================
        // ПАТЧ 2: Перехват вкладок до срабатывания React
        // ==========================================
        setupTabInterception() {
            if (window.__tariffTabListener) return;
            window.__tariffTabListener = true;

            // Используем mousedown и capture:true, чтобы сработать ДО того как React обработает onClick
            document.addEventListener('mousedown', (e) => {
                const tabBtn = e.target.closest('.css-1h3gid1 button, ._transientButton_o6g7k_1');
                if (tabBtn && this.initialized && !this.isDestroying) {
                    console.log('[TariffCustomizer] Переключение вкладки! Экстренный сброс DOM для React...');
                    
                    // Блокируем наши обсерверы, чтобы не мешать
                    this.isUpdating = true; 
                    this.destroy(); // Возвращаем карточки на место
                    
                    // Перезапускаемся, когда React закончит рендер новой вкладки
                    setTimeout(() => {
                        this.init();
                    }, 400);
                }
            }, true);
        }

        isExportPauseActive() {
            return window.__tariffExportPauseCustomizer === true || localStorage.getItem('tariff_export_pause_customizer') === '1';
        }

        forceResizeText() {
            this.isUpdating = true;
            const width = window.innerWidth;
            let titleSize, descSize, priceSize, dateSize;
            
            if (width <= 2163 && width > 1920) { titleSize = '15px'; descSize = '13px'; priceSize = '17px'; dateSize = '10px'; }
            else if (width <= 1920 && width > 1600) { titleSize = '14px'; descSize = '12px'; priceSize = '16px'; dateSize = '9px'; }
            else if (width <= 1600 && width > 1200) { titleSize = '13px'; descSize = '11px'; priceSize = '15px'; dateSize = '8px'; }
            else if (width <= 1200 && width > 900) { titleSize = '12px'; descSize = '10px'; priceSize = '14px'; dateSize = '7px'; }
            else if (width <= 900) { titleSize = '11px'; descSize = '9px'; priceSize = '13px'; dateSize = '6px'; }
            
            const applySize = (elements, size) => {
                if (size) elements.forEach(el => { el.style.setProperty('font-size', size, 'important'); el.style.fontSize = size; });
                else elements.forEach(el => el.style.removeProperty('font-size'));
            };

            applySize(document.querySelectorAll('.css-17i8ct5'), titleSize);
            applySize(document.querySelectorAll('.css-1qatje8'), descSize);
            applySize(document.querySelectorAll('.css-1kn2u3p'), priceSize);
            applySize(document.querySelectorAll('.tariff-date-moved'), dateSize);
            
            setTimeout(() => { this.isUpdating = false; }, 50);
        }

        injectForceStyles() {
            if (document.querySelector('#tariff-force-styles')) return;
            const style = document.createElement('style');
            style.id = 'tariff-force-styles';
            style.textContent = `
                @media (min-width: 2164px) { .tariff-top-columns, .tariff-bottom-columns { display: flex !important; flex-direction: row !important; flex-wrap: nowrap !important; align-items: stretch !important; gap: 24px !important; } .tariff-top-columns .tariff-column, .tariff-bottom-columns .tariff-column { min-width: 0 !important; box-sizing: border-box !important; } }
                @media (max-width: 2163px) and (min-width: 1601px) { .tariff-top-columns, .tariff-bottom-columns { display: flex !important; flex-direction: row !important; flex-wrap: nowrap !important; align-items: stretch !important; gap: 20px !important; } .tariff-top-columns .tariff-column, .tariff-bottom-columns .tariff-column { min-width: 0 !important; box-sizing: border-box !important; } .tariff-column { padding-left: 18px !important; padding-right: 18px !important; } }
                @media (max-width: 1600px) and (min-width: 1281px) { .tariff-top-columns, .tariff-bottom-columns { display: flex !important; flex-direction: row !important; flex-wrap: nowrap !important; align-items: stretch !important; gap: 16px !important; } .tariff-top-columns .tariff-column, .tariff-bottom-columns .tariff-column { min-width: 0 !important; box-sizing: border-box !important; } .tariff-column { padding-left: 16px !important; padding-right: 16px !important; } }
                @media (max-width: 1280px) { .tariff-top-columns, .tariff-bottom-columns { display: flex !important; flex-direction: row !important; flex-wrap: nowrap !important; align-items: stretch !important; gap: 12px !important; } .tariff-top-columns .tariff-column, .tariff-bottom-columns .tariff-column { min-width: 0 !important; box-sizing: border-box !important; } .tariff-column { padding-left: 14px !important; padding-right: 14px !important; } }
                @media (max-width: 2163px) and (min-width: 1921px) { .css-17i8ct5 { font-size: 15px !important; line-height: 1.2 !important; } .css-1qatje8 { font-size: 13px !important; } .css-1kn2u3p { font-size: 17px !important; } .tariff-date-moved { font-size: 10px !important; } }
                @media (max-width: 1920px) and (min-width: 1601px) { .css-17i8ct5 { font-size: 14px !important; line-height: 1.2 !important; } .css-1qatje8 { font-size: 12px !important; } .css-1kn2u3p { font-size: 16px !important; } .tariff-date-moved { font-size: 9px !important; } }
                @media (max-width: 1600px) and (min-width: 1201px) { .css-17i8ct5 { font-size: 13px !important; line-height: 1.2 !important; } .css-1qatje8 { font-size: 11px !important; } .css-1kn2u3p { font-size: 15px !important; } .tariff-date-moved { font-size: 8px !important; } }
                @media (max-width: 1200px) and (min-width: 901px) { .css-17i8ct5 { font-size: 12px !important; line-height: 1.2 !important; } .css-1qatje8 { font-size: 10px !important; } .css-1kn2u3p { font-size: 14px !important; } .tariff-date-moved { font-size: 7px !important; } }
                @media (max-width: 900px) { .css-17i8ct5 { font-size: 11px !important; line-height: 1.2 !important; } .css-1qatje8 { font-size: 9px !important; } .css-1kn2u3p { font-size: 13px !important; } .tariff-date-moved { font-size: 6px !important; } }
            `;
            document.head.appendChild(style);
        }

        injectGlobalStyles() {
            if (document.querySelector('#tariff-customizer-styles')) return;
            const style = document.createElement('style');
            style.id = 'tariff-customizer-styles';
            style.textContent = `
                @keyframes tariffFadeIn { from { opacity: 0; transform: translateX(100%); } to { opacity: 1; transform: translateX(0); } }
                .tariff-layout { display: flex; flex-direction: column; gap: 24px; width: 100%; margin-top: 20px; }
                .tariff-top-columns, .tariff-bottom-columns { display: flex; gap: 24px; width: 100%; flex-wrap: nowrap; align-items: stretch; }
                .tariff-column { flex: 1 1 0; min-width: 0; box-sizing: border-box; background: linear-gradient(135deg, #f8fafc, #f1f5f9); border-radius: 20px; padding: 20px; border: 2px dashed #cbd5e1; transition: all 0.3s ease; position: relative; min-height: 200px; }
                .tariff-column.drag-over-column { border-color: #3b82f6; background: linear-gradient(135deg, #eff6ff, #dbeafe); transform: scale(1.01); }
                .tariff-column::before { position: absolute; top: -12px; left: 20px; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; box-shadow: 0 2px 4px rgba(0,0,0,0.1); z-index: 1; }
                .tariff-column.empty::after { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #94a3b8; font-size: 14px; text-align: center; pointer-events: none; white-space: nowrap; z-index: 0; }
                .tariff-column:not(.empty)::after { display: none !important; }
                .favorite-column::before { content: '⭐ Избранные тарифы 1'; background: linear-gradient(135deg, #f59e0b, #d97706); }
                .vip-column::before { content: '💎 Избранные тарифы 2'; background: linear-gradient(135deg, #8b5cf6, #7c3aed); }
                .super-column::before { content: '🌟 Избранные тарифы 3'; background: linear-gradient(135deg, #ec489a, #db2777); }
                .main-column::before { content: '📋 Все тарифы'; background: linear-gradient(135deg, #64748b, #475569); }
                .favorite-column.empty::after { content: 'Перетащите сюда тарифы в Избранные тарифы 1'; }
                .vip-column.empty::after { content: 'Перетащите сюда тарифы в Избранные тарифы 2'; }
                .super-column.empty::after { content: 'Перетащите сюда тарифы в Избранные тарифы 3'; }
                .main-column.empty::after { content: 'Нет доступных тарифов'; }
                
                .css-nr5n4g.e1wi2kqa9 { width: 100% !important; min-width: 100% !important; max-width: 100% !important; flex: 0 0 100% !important; box-sizing: border-box !important; margin-bottom: 16px; transition: all 0.3s ease; position: relative; z-index: 1; }
                .css-nr5n4g.e1wi2kqa9:last-child { margin-bottom: 0; }
                .css-nr5n4g.dragging { opacity: 0.4; transform: scale(0.98); }
                
                .tariff-header-wrapper { display: flex; flex-direction: column; gap: -2px !important; width: 100%; }
                .tariff-date-moved { font-size: 12px; color: #64748b; margin-top: -7px !important; line-height: 1.3; transition: font-size 0.2s ease; }
                .original-date-hidden { display: none !important; }
                .drag-over { border: 2px solid #3b82f6 !important; background: linear-gradient(135deg, rgba(59, 130, 246, 0.05), rgba(59, 130, 246, 0.02)) !important; transform: scale(1.01); }
                
                .tariff-pin-btn, .tariff-drag-handle { position: relative; overflow: hidden; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important; background: #f1f5f9 !important; border: 1px solid #cbd5e1 !important; color: #475569 !important; width: 28px !important; height: 28px !important; min-width: 28px !important; min-height: 28px !important; border-radius: 6px !important; padding: 0 !important; margin-left: 6px !important; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
                .tariff-pin-btn span, .tariff-drag-handle span { font-size: 14px !important; }
                .tariff-pin-btn:hover, .tariff-drag-handle:hover { transform: scale(1.05); background: #e2e8f0 !important; border-color: #94a3b8 !important; color: #1e293b !important; }
                .tariff-drag-handle { cursor: grab; }
                .tariff-drag-handle:active { cursor: grabbing; }
                .tariff-pin-btn.pinned-favorite { background: linear-gradient(135deg, #f59e0b, #d97706) !important; border-color: transparent !important; color: white !important; }
                .tariff-pin-btn.pinned-vip { background: linear-gradient(135deg, #8b5cf6, #7c3aed) !important; border-color: transparent !important; color: white !important; }
                .tariff-pin-btn.pinned-super { background: linear-gradient(135deg, #ec489a, #db2777) !important; border-color: transparent !important; color: white !important; }
                .tariff-pin-btn.pinned-favorite:hover, .tariff-pin-btn.pinned-vip:hover, .tariff-pin-btn.pinned-super:hover { transform: scale(1.05); filter: brightness(1.1); }
                .css-1yydxi7 { display: flex !important; align-items: center !important; justify-content: flex-end !important; width: 100% !important; }
            `;
            document.head.appendChild(style);
        }

        setupPageVisibility() {
            document.addEventListener('visibilitychange', () => { if (!document.hidden && this.initialized) setTimeout(() => this.forceResizeText(), 100); });
            window.addEventListener('pageshow', (e) => { if (e.persisted && this.initialized) setTimeout(() => this.forceResizeText(), 100); });
            window.addEventListener('beforeunload', () => { if (this.initialized) this.saveSettings(); });
        }

        setupResizeListener() {
            window.addEventListener('resize', () => {
                clearTimeout(this.resizeTimeout);
                this.resizeTimeout = setTimeout(() => { if (this.initialized) this.forceResizeText(); }, 100);
            });
        }

        setupSpaDetection() {
            const self = this;
            history.pushState = function() { window.originalPushState.apply(this, arguments); self.scheduleNavigation(); };
            history.replaceState = function() { window.originalReplaceState.apply(this, arguments); self.scheduleNavigation(); };
            window.addEventListener('popstate', () => self.scheduleNavigation());
            
            let lastUrl = window.location.href;
            if (this.checkInterval) clearInterval(this.checkInterval);
            this.checkInterval = setInterval(() => {
                const currentUrl = window.location.href;
                if (currentUrl !== lastUrl && !this.isHandlingNavigation && !this.isDestroying) {
                    lastUrl = currentUrl;
                    this.scheduleNavigation();
                }
            }, 2000);
        }
        
        scheduleNavigation() {
            if (this.navigationTimeout) clearTimeout(this.navigationTimeout);
            this.navigationTimeout = setTimeout(() => this.handleNavigation(), 300);
        }
        
        handleNavigation() {
            if (this.isHandlingNavigation || this.isDestroying || this.isExportPauseActive()) return;
            const currentUrl = window.location.href;
            if (currentUrl === this.lastUrl || !currentUrl.includes('/tariffs/')) return;
            
            this.isHandlingNavigation = true;
            this.lastUrl = currentUrl;
            
            if (this.initialized) this.saveSettings();
            this.destroy();
            
            setTimeout(() => {
                this.init();
                setTimeout(() => { this.isHandlingNavigation = false; }, 500);
            }, 200);
        }
        
        destroy() {
            if (this.isDestroying) return;
            this.isDestroying = true;
            this.initialized = false;
            
            if (this.loadMoreObserver) { this.loadMoreObserver.disconnect(); this.loadMoreObserver = null; }
            if (this.observer) { this.observer.disconnect(); this.observer = null; }
            [this.updateTimeout, this.resizeTimeout, this.navigationTimeout, this.initDelayTimeout].forEach(t => clearTimeout(t));
            if (this.checkInterval) clearInterval(this.checkInterval);
            if (this.categoryMenu) { this.categoryMenu.remove(); this.categoryMenu = null; }

            ['#tariff-customizer-styles', '#tariff-force-styles'].forEach(id => { const el = document.querySelector(id); if (el) el.remove(); });

            const layout = document.querySelector('.tariff-layout');
            if (layout && this.container) {
                const allCards = [];
                layout.querySelectorAll('.tariff-column').forEach(column => {
                    Array.from(column.children).forEach(child => {
                        if (child.classList && child.classList.contains('css-nr5n4g')) {
                            child.removeAttribute('draggable');
                            allCards.push(child);
                        }
                    });
                });
                
                // Возвращаем карточки в оригинальный контейнер, чтобы React нашел их при удалении
                allCards.forEach(card => {
                    try { this.container.appendChild(card); } catch(e) {}
                });
                layout.remove();
            }
            
            this.container = null; this.mainColumn = null; this.favoriteColumn = null; this.vipColumn = null; this.superColumn = null;
            this.cards = []; this.favoriteCards = []; this.vipCards = []; this.superCards = [];
            history.pushState = window.originalPushState; history.replaceState = window.originalReplaceState;
            this.isDestroying = false;
        }

        init() {
            if (this.initialized || this.initDelayTimeout || this.isExportPauseActive() || !window.location.href.includes('/tariffs/')) return;
            
            this.initDelayTimeout = setTimeout(() => {
                this.initDelayTimeout = null;
                this.createGlobalMenu();
                this.setupSpaDetection();
                this.setupPageVisibility();
                this.injectGlobalStyles();
                this.injectForceStyles();
                this.loadSettings();
                this.waitForContainerAndCards();
            }, 100);
        }

        createGlobalMenu() {
            if (this.categoryMenu || document.getElementById('tariff-global-menu')) return;
            this.categoryMenu = document.createElement('div');
            this.categoryMenu.id = 'tariff-global-menu';
            this.categoryMenu.style.cssText = `position: fixed; display: none; flex-direction: column; gap: 4px; background: white; border: 1px solid #cbd5e1; border-radius: 8px; padding: 4px; z-index: 10000; box-shadow: 0 4px 12px rgba(0,0,0,0.15);`;
            
            const categories = [ { id: 'main', name: '📋 Основные', color: '#64748b' }, { id: 'favorite', name: '⭐ Избранные 1', color: '#f59e0b' }, { id: 'vip', name: '💎 Избранные 2', color: '#8b5cf6' }, { id: 'super', name: '🌟 Избранные 3', color: '#ec489a' } ];
            
            categories.forEach(cat => {
                const option = document.createElement('button');
                option.textContent = cat.name;
                option.style.cssText = `padding: 6px 12px; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; background: white; color: ${cat.color}; text-align: left;`;
                option.onmouseenter = () => option.style.background = '#f1f5f9';
                option.onmouseleave = () => option.style.background = 'white';
                option.onclick = (e) => {
                    e.stopPropagation();
                    if (this.currentCardForMenu && this.currentTariffIdForMenu) this.moveCardToCategory(this.currentCardForMenu, this.currentTariffIdForMenu, cat.id);
                    this.categoryMenu.style.display = 'none';
                };
                this.categoryMenu.appendChild(option);
            });
            document.body.appendChild(this.categoryMenu);
            document.addEventListener('click', (e) => { if (this.categoryMenu && this.categoryMenu.style.display === 'flex' && !this.categoryMenu.contains(e.target)) this.categoryMenu.style.display = 'none'; });
        }

        restoreState() {
            if (this.isRestoring || !this.initialized) return;
            if (!this.mainColumn || !this.favoriteColumn || !this.vipColumn || !this.superColumn) return;
            
            this.isRestoring = true;
            this.isUpdating = true;
            
            const allCards = [...Array.from(this.mainColumn.querySelectorAll('.css-nr5n4g')), ...Array.from(this.favoriteColumn.querySelectorAll('.css-nr5n4g')), ...Array.from(this.vipColumn.querySelectorAll('.css-nr5n4g')), ...Array.from(this.superColumn.querySelectorAll('.css-nr5n4g'))];
            
            if (allCards.length === 0) { this.isRestoring = false; this.isUpdating = false; return; }
            
            allCards.forEach(card => {
                const cardId = this.getCardId(card);
                if (this.favoriteTariffs.has(cardId)) { if (card.parentNode !== this.favoriteColumn) this.favoriteColumn.appendChild(card); }
                else if (this.vipTariffs.has(cardId)) { if (card.parentNode !== this.vipColumn) this.vipColumn.appendChild(card); }
                else if (this.superTariffs.has(cardId)) { if (card.parentNode !== this.superColumn) this.superColumn.appendChild(card); }
                else { if (card.parentNode !== this.mainColumn) this.mainColumn.appendChild(card); }
            });
            
            this.collectCards();
            if (Object.keys(this.tariffPositions).length > 0) this.applyStoredOrderToAllColumns();
            
            this.updateAllPinButtons();
            this.updateColumnsEmptyState();
            this.saveSettings();
            
            this.isUpdating = false;
            setTimeout(() => { this.isRestoring = false; this.forceResizeText(); }, 200);
        }
        
        applyStoredOrderToAllColumns() {
            this.isUpdating = true;
            const sortCardsInColumn = (column, cards) => {
                if (!column || !cards.length) return;
                [...cards].sort((a, b) => (this.tariffPositions[this.getCardId(a)] ?? 999999) - (this.tariffPositions[this.getCardId(b)] ?? 999999))
                          .forEach(card => column.appendChild(card));
            };
            sortCardsInColumn(this.mainColumn, this.cards); sortCardsInColumn(this.favoriteColumn, this.favoriteCards);
            sortCardsInColumn(this.vipColumn, this.vipCards); sortCardsInColumn(this.superColumn, this.superCards);
            this.isUpdating = false;
        }

        waitForContainerAndCards() {
            if (this.initialized) return;
            this.initAttempts++;
            this.container = this.findContainer();
            
            if (this.container && this.container.querySelectorAll('.css-nr5n4g').length > 0) {
                this.initializeUI();
                this.setupLoadMoreObserver();
                this.initAttempts = 0;
            } else if (this.initAttempts < 20) setTimeout(() => this.waitForContainerAndCards(), 300);
        }
        
        setupLoadMoreObserver() {
            this.loadMoreObserver = new MutationObserver((mutations) => {
                let hasNewCards = false;
                for (const mutation of mutations) {
                    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                        for (const node of mutation.addedNodes) if (node.nodeType === 1 && node.classList?.contains('css-nr5n4g')) { hasNewCards = true; break; }
                    }
                }
                if (hasNewCards && !this.isLoadingMore && this.initialized) {
                    this.isLoadingMore = true;
                    setTimeout(() => { this.handleNewCards(); this.isLoadingMore = false; }, 100);
                }
            });
            if (this.container) this.loadMoreObserver.observe(this.container, { childList: true, subtree: true });
        }
        
        handleNewCards() {
            if (!this.initialized) return;
            this.isUpdating = true;
            
            if (this.container && this.mainColumn) {
                const orphanCards = Array.from(this.container.children).filter(el => el.classList && el.classList.contains('css-nr5n4g'));
                orphanCards.forEach(card => this.mainColumn.appendChild(card));
            }

            this.collectCards();
            const allCards = [...this.cards, ...this.favoriteCards, ...this.vipCards, ...this.superCards];
            let hasNew = false;
            
            allCards.forEach(card => {
                const id = this.getCardId(card);
                if (!card.querySelector('.tariff-pin-btn')) { this.createPinButton(card, id); hasNew = true; }
                if (!card.querySelector('.tariff-drag-handle')) { this.createDragHandle(card, id); hasNew = true; }
            });
            
            if (hasNew) {
                this.moveDateUnderTitle();
                this.restoreState();
                this.saveCurrentPositions();
                this.forceResizeText();
            }
            this.isUpdating = false;
        }

        findContainer() {
            const container = document.querySelector('.css-1fttcpj');
            if (container && container.querySelectorAll('.css-nr5n4g').length > 0) return container;
            const firstCard = document.querySelector('.css-nr5n4g');
            if (firstCard && firstCard.parentElement) return firstCard.parentElement;
            return null;
        }

        initializeUI() {
            if (this.initialized) return;
            this.isUpdating = true;
            
            this.createColumnsLayout();
            this.collectCards();
            this.moveDateUnderTitle();
            if (Object.keys(this.tariffPositions).length > 0) this.applyStoredOrderToAllColumns();
            this.addCustomizationUI();
            this.setupObserver();
            
            this.initialized = true;
            this.isUpdating = false;
            
            setTimeout(() => { this.restoreState(); this.forceResizeText(); this.setupResizeListener(); }, 100);
            setTimeout(() => { this.showNotification('✨ Кастомизация тарифов готова', 'success'); }, 500);
        }
        
        createColumnsLayout() {
            if (!this.container || document.querySelector('.tariff-layout')) return;
            
            const layout = document.createElement('div'); layout.className = 'tariff-layout';
            const topColumns = document.createElement('div'); topColumns.className = 'tariff-top-columns';
            const favoriteColumn = document.createElement('div'); favoriteColumn.className = 'tariff-column favorite-column'; favoriteColumn.id = 'favorite-column';
            const vipColumn = document.createElement('div'); vipColumn.className = 'tariff-column vip-column'; vipColumn.id = 'vip-column';
            const superColumn = document.createElement('div'); superColumn.className = 'tariff-column super-column'; superColumn.id = 'super-column';
            topColumns.appendChild(favoriteColumn); topColumns.appendChild(vipColumn); topColumns.appendChild(superColumn);
            
            const bottomColumns = document.createElement('div'); bottomColumns.className = 'tariff-bottom-columns';
            const mainColumn = document.createElement('div'); mainColumn.className = 'tariff-column main-column'; mainColumn.id = 'main-column';
            bottomColumns.appendChild(mainColumn);
            
            layout.appendChild(topColumns); layout.appendChild(bottomColumns);
            
            const originalCards = Array.from(this.container.querySelectorAll('.css-nr5n4g'));
            this.container.insertBefore(layout, this.container.firstChild);
            
            this.favoriteColumn = favoriteColumn; this.vipColumn = vipColumn; this.superColumn = superColumn; this.mainColumn = mainColumn;
            
            originalCards.forEach(card => {
                const cardId = this.getCardId(card);
                if (this.favoriteTariffs.has(cardId)) favoriteColumn.appendChild(card);
                else if (this.vipTariffs.has(cardId)) vipColumn.appendChild(card);
                else if (this.superTariffs.has(cardId)) superColumn.appendChild(card);
                else mainColumn.appendChild(card);
            });
            this.setupColumnsDragDrop();
        }
        
        setupColumnsDragDrop() {
            [this.favoriteColumn, this.vipColumn, this.superColumn, this.mainColumn].forEach(column => {
                if (!column) return;
                column.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (this.draggedItem) column.classList.add('drag-over-column'); });
                column.addEventListener('dragleave', (e) => { if (e.currentTarget.contains(e.relatedTarget)) return; column.classList.remove('drag-over-column'); });
                column.addEventListener('drop', (e) => {
                    e.preventDefault(); column.classList.remove('drag-over-column');
                    if (this.draggedItem) {
                        const targetCard = e.target.closest('.css-nr5n4g');
                        if (targetCard && targetCard !== this.draggedItem && targetCard.parentNode === column) this.moveCard(this.draggedItem, targetCard, column.id);
                        else this.moveCardToColumn(this.draggedItem, column.id);
                    }
                });
            });
        }
        
        moveCardToColumn(card, columnId) {
            this.isUpdating = true;
            const cardId = this.getCardId(card);
            let targetColumn; let category;
            
            this.favoriteTariffs.delete(cardId); this.vipTariffs.delete(cardId); this.superTariffs.delete(cardId);
            
            switch(columnId) {
                case 'favorite-column': targetColumn = this.favoriteColumn; category = 'favorite'; this.favoriteTariffs.add(cardId); break;
                case 'vip-column': targetColumn = this.vipColumn; category = 'vip'; this.vipTariffs.add(cardId); break;
                case 'super-column': targetColumn = this.superColumn; category = 'super'; this.superTariffs.add(cardId); break;
                default: targetColumn = this.mainColumn; category = 'main'; break;
            }
            
            targetColumn.appendChild(card);
            this.collectCards(); this.updateAllPinButtons(); this.saveCurrentPositions(); this.updateColumnsEmptyState();
            
            const msgs = { favorite: '⭐ Добавлено в Избранные 1', vip: '💎 Добавлено в Избранные 2', super: '🌟 Добавлено в Избранные 3', main: '📋 Возвращено в основные' };
            this.showNotification(msgs[category], 'success');
            this.isUpdating = false;
        }

        moveCard(sourceCard, targetCard, targetColumnId) {
             this.isUpdating = true;
             if (sourceCard.parentNode !== targetCard.parentNode) {
                 const cardId = this.getCardId(sourceCard);
                 this.favoriteTariffs.delete(cardId); this.vipTariffs.delete(cardId); this.superTariffs.delete(cardId);
                 if (targetColumnId === 'favorite-column') this.favoriteTariffs.add(cardId);
                 else if (targetColumnId === 'vip-column') this.vipTariffs.add(cardId);
                 else if (targetColumnId === 'super-column') this.superTariffs.add(cardId);
             }

             const parent = targetCard.parentNode;
             if (sourceCard.parentNode !== targetCard.parentNode || Array.from(parent.children).indexOf(sourceCard) > Array.from(parent.children).indexOf(targetCard)) {
                 parent.insertBefore(sourceCard, targetCard);
             } else {
                 parent.insertBefore(sourceCard, targetCard.nextSibling);
             }
             
             this.collectCards(); this.updateAllPinButtons(); this.saveCurrentPositions(); this.updateColumnsEmptyState();
             this.showNotification('✨ Порядок изменен', 'success');
             this.isUpdating = false;
        }
        
        updateAllPinButtons() {
            document.querySelectorAll('.css-nr5n4g').forEach(card => {
                const cardId = this.getCardId(card);
                const pinBtn = card.querySelector('.tariff-pin-btn');
                if (pinBtn) {
                    let category = 'main';
                    if (this.favoriteTariffs.has(cardId)) category = 'favorite';
                    else if (this.vipTariffs.has(cardId)) category = 'vip';
                    else if (this.superTariffs.has(cardId)) category = 'super';
                    
                    pinBtn.className = `tariff-pin-btn ${category !== 'main' ? `pinned-${category}` : ''}`;
                    pinBtn.title = category !== 'main' ? `В категории: ${category}` : 'Выберите категорию';
                    const icons = { favorite: '⭐', vip: '💎', super: '🌟', main: '📋' };
                    pinBtn.innerHTML = `<span>${icons[category]}</span>`;
                }
            });
        }
        
        updateColumnsEmptyState() {
            [this.favoriteColumn, this.vipColumn, this.superColumn, this.mainColumn].forEach(col => {
                if (col) { if (col.children.length > 0) col.classList.remove('empty'); else col.classList.add('empty'); }
            });
        }

        moveDateUnderTitle() {
            [...this.cards, ...this.favoriteCards, ...this.vipCards, ...this.superCards].forEach(card => {
                const titleContainer = card.querySelector('.css-qv45v3');
                if (!titleContainer || titleContainer.querySelector('.tariff-header-wrapper')) return;
                
                const dateElement = titleContainer.querySelector('.css-knzesm');
                const titleElement = titleContainer.querySelector('.css-17i8ct5');
                if (!dateElement || !titleElement) return;
                
                const wrapper = document.createElement('div'); wrapper.className = 'tariff-header-wrapper';
                const titleClone = titleElement.cloneNode(true); const dateClone = dateElement.cloneNode(true);
                dateClone.classList.add('tariff-date-moved');
                
                titleElement.style.display = 'none';
                dateElement.classList.add('original-date-hidden');
                
                wrapper.appendChild(titleClone); wrapper.appendChild(dateClone);
                titleContainer.appendChild(wrapper);
            });
        }

        getCardId(card) {
            if (card.dataset.tariffId) return card.dataset.tariffId;
            const titleElement = card.querySelector('.css-17i8ct5');
            if (titleElement) {
                let tariffName = titleElement.textContent.trim().replace(/[^\wа-яё]/gi, '_').replace(/_+/g, '_').toLowerCase();
                card.dataset.tariffId = tariffName; return tariffName;
            }
            const fallbackId = 'tariff_' + Date.now() + '_' + Math.random();
            card.dataset.tariffId = fallbackId; return fallbackId;
        }

        saveCurrentPositions() {
            const allCardsOrdered = [];
            if (this.mainColumn) allCardsOrdered.push(...Array.from(this.mainColumn.querySelectorAll('.css-nr5n4g')));
            if (this.favoriteColumn) allCardsOrdered.push(...Array.from(this.favoriteColumn.querySelectorAll('.css-nr5n4g')));
            if (this.vipColumn) allCardsOrdered.push(...Array.from(this.vipColumn.querySelectorAll('.css-nr5n4g')));
            if (this.superColumn) allCardsOrdered.push(...Array.from(this.superColumn.querySelectorAll('.css-nr5n4g')));
            
            const newPositions = {};
            allCardsOrdered.forEach((card, index) => { newPositions[this.getCardId(card)] = index; });
            this.tariffPositions = newPositions; this.saveSettings();
        }

        collectCards() {
            if (this.mainColumn) this.cards = Array.from(this.mainColumn.querySelectorAll('.css-nr5n4g'));
            if (this.favoriteColumn) this.favoriteCards = Array.from(this.favoriteColumn.querySelectorAll('.css-nr5n4g'));
            if (this.vipColumn) this.vipCards = Array.from(this.vipColumn.querySelectorAll('.css-nr5n4g'));
            if (this.superColumn) this.superCards = Array.from(this.superColumn.querySelectorAll('.css-nr5n4g'));
            this.updateColumnsEmptyState();
        }

        saveSettings() {
            localStorage.setItem(this.storageKey, JSON.stringify({ favoriteTariffs: Array.from(this.favoriteTariffs), vipTariffs: Array.from(this.vipTariffs), superTariffs: Array.from(this.superTariffs), tariffPositions: this.tariffPositions, version: '3.3', timestamp: Date.now() }));
        }

        loadSettings() {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) {
                try {
                    const s = JSON.parse(saved);
                    this.favoriteTariffs = new Set(s.favoriteTariffs || []); this.vipTariffs = new Set(s.vipTariffs || []);
                    this.superTariffs = new Set(s.superTariffs || []); this.tariffPositions = s.tariffPositions || {};
                } catch (e) { console.error('Ошибка загрузки:', e); }
            }
        }

        createPinButton(card, tariffId) {
            const buttonContainer = card.querySelector('.css-1yydxi7');
            if (!buttonContainer || buttonContainer.querySelector('.tariff-pin-btn')) return null;
            
            let category = 'main';
            if (this.favoriteTariffs.has(tariffId)) category = 'favorite'; else if (this.vipTariffs.has(tariffId)) category = 'vip'; else if (this.superTariffs.has(tariffId)) category = 'super';
            
            const pinButton = document.createElement('button');
            pinButton.className = `tariff-pin-btn ${category !== 'main' ? `pinned-${category}` : ''}`;
            pinButton.title = category !== 'main' ? `В категории: ${category}` : 'Выберите категорию';
            const icons = { favorite: '⭐', vip: '💎', super: '🌟', main: '📋' };
            pinButton.innerHTML = `<span>${icons[category]}</span>`;
            
            pinButton.addEventListener('click', (e) => {
                e.stopPropagation(); if (!this.categoryMenu) return;
                this.currentCardForMenu = card; this.currentTariffIdForMenu = tariffId;
                const rect = pinButton.getBoundingClientRect();
                this.categoryMenu.style.display = 'flex'; this.categoryMenu.style.top = `${rect.bottom + 4}px`; this.categoryMenu.style.left = `${rect.left}px`;
            });
            
            buttonContainer.insertBefore(pinButton, buttonContainer.firstChild); return pinButton;
        }
        
        createDragHandle(card, tariffId) {
            const buttonContainer = card.querySelector('.css-1yydxi7');
            if (!buttonContainer || buttonContainer.querySelector('.tariff-drag-handle')) return null;
            
            const dragHandle = document.createElement('button');
            dragHandle.className = 'tariff-drag-handle'; dragHandle.title = 'Зажмите для перетаскивания карточки'; dragHandle.innerHTML = '<span>⋮⋮</span>';
            
            dragHandle.addEventListener('mouseenter', () => card.setAttribute('draggable', 'true'));
            dragHandle.addEventListener('mouseleave', () => card.removeAttribute('draggable'));
            
            card.addEventListener('dragstart', (e) => {
                this.draggedItem = card; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', tariffId);
                setTimeout(() => card.classList.add('dragging'), 0);
            });
            
            card.addEventListener('dragend', () => { card.classList.remove('dragging'); this.draggedItem = null; document.querySelectorAll('.tariff-column').forEach(col => col.classList.remove('drag-over-column')); });
            
            const pinBtn = buttonContainer.querySelector('.tariff-pin-btn');
            if (pinBtn) pinBtn.insertAdjacentElement('afterend', dragHandle); else buttonContainer.insertBefore(dragHandle, buttonContainer.firstChild);
            return dragHandle;
        }
        
        moveCardToCategory(card, tariffId, category) {
            this.isUpdating = true; let targetColumn;
            this.favoriteTariffs.delete(tariffId); this.vipTariffs.delete(tariffId); this.superTariffs.delete(tariffId);
            switch(category) {
                case 'favorite': targetColumn = this.favoriteColumn; this.favoriteTariffs.add(tariffId); break;
                case 'vip': targetColumn = this.vipColumn; this.vipTariffs.add(tariffId); break;
                case 'super': targetColumn = this.superColumn; this.superTariffs.add(tariffId); break;
                default: targetColumn = this.mainColumn; break;
            }
            targetColumn.appendChild(card); this.collectCards(); this.updateAllPinButtons(); this.saveCurrentPositions(); this.updateColumnsEmptyState();
            const msgs = { favorite: '⭐ Перемещено в избранное', vip: '💎 Перемещено в VIP', super: '🌟 Перемещено в супер избранное', main: '📋 Перемещено в основные' };
            this.showNotification(msgs[category], 'success'); this.isUpdating = false;
        }

        addCustomizationUI() {
            [...this.cards, ...this.favoriteCards, ...this.vipCards, ...this.superCards].forEach(card => {
                const id = this.getCardId(card);
                if (!card.querySelector('.tariff-pin-btn')) this.createPinButton(card, id);
                if (!card.querySelector('.tariff-drag-handle')) this.createDragHandle(card, id);
            });
        }

        setupObserver() {
            if (this.observer) this.observer.disconnect();
            this.observer = new MutationObserver((mutations) => {
                if (this.isUpdating || !this.initialized) return;
                let needRefresh = false;
                for (const mutation of mutations) {
                    if (mutation.type === 'childList') {
                        if (mutation.addedNodes.length > 0) needRefresh = true;
                        if (mutation.target.classList?.contains('tariff-column')) this.updateColumnsEmptyState();
                    }
                }
                if (needRefresh) {
                    clearTimeout(this.updateTimeout);
                    this.updateTimeout = setTimeout(() => {
                        if (this.initialized && !this.isUpdating && !this.isDestroying) {
                            this.isUpdating = true; this.collectCards(); this.addCustomizationUI(); this.updateAllPinButtons(); this.updateColumnsEmptyState(); this.isUpdating = false;
                        }
                    }, 300);
                }
            });
            this.observer.observe(document.body, { childList: true, subtree: true });
        }

        showNotification(msg, type = 'info') {
            const notification = document.createElement('div');
            notification.className = 'tariff-notification'; notification.textContent = msg;
            notification.style.cssText = `animation: tariffFadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.2); position: fixed; bottom: 24px; right: 24px; padding: 12px 20px; border-radius: 10px; z-index: 10001; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.25s ease; box-shadow: 0 4px 12px rgba(0,0,0,0.15); background: ${type === 'success' ? '#10b981' : '#3b82f6'}; color: white;`;
            document.body.appendChild(notification); setTimeout(() => notification.remove(), 2000);
        }
    }

    if (!window.tariffCustomizerInstance) {
        console.log('[TariffCustomizer] 🚀 Скрипт загружен');
        if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', () => { window.tariffCustomizerInstance = new TariffCustomizer(); }); } 
        else { window.tariffCustomizerInstance = new TariffCustomizer(); }
    }
})();