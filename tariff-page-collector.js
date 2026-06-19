// tariff-page-collector.js
// Faster collector: waits for modal readiness instead of hard 2s + 1s delays
(function() {
    'use strict';

    console.log('[TariffPageCollector] Loaded (fast mode)');

    const tariffToCollect = localStorage.getItem('tariff_to_collect');
    if (tariffToCollect) {
        const request = JSON.parse(tariffToCollect);
        console.log(`[TariffPageCollector] Collecting data for: ${request.name}`);

        waitForModal(5000).then((modal) => {
            if (!modal) {
                console.log('[TariffPageCollector] Modal not found');
                return;
            }

            const data = extractFullTariffData(modal, request.name);

            localStorage.setItem('collected_tariff_data', JSON.stringify({
                requestId: request.requestId,
                tariffData: data
            }));

            console.log('[TariffPageCollector] Data collected');
            setTimeout(() => window.close(), 50);
        });
    }

    function waitForModal(timeoutMs) {
        return new Promise((resolve) => {
            const started = Date.now();

            const tryFind = () => {
                const modal = document.querySelector('.css-ibn1fq')
                    || Array.from(document.querySelectorAll('dialog[open], [role="dialog"], [aria-modal="true"]'))
                        .find(el => (el.textContent || '').trim().length > 100);

                if (modal) {
                    resolve(modal);
                    return true;
                }
                return false;
            };

            if (tryFind()) return;

            const interval = setInterval(() => {
                if (tryFind()) {
                    clearInterval(interval);
                    return;
                }
                if (Date.now() - started >= timeoutMs) {
                    clearInterval(interval);
                    resolve(null);
                }
            }, 100);
        });
    }

    function normalizeCellText(value) {
        const text = String(value || '').trim();
        return text && text !== '—' ? text : '';
    }

    function extractElevatorPrices(modal) {
        const result = { internalPrice: '', customerPrice: '' };
        const floorSection = modal.querySelector('.edt22co2');
        if (!floorSection) return result;

        const text = floorSection.textContent || '';
        const match = text.match(/Стоимость\s+подъема\s+на\s+лифте:\s*([^\s]+)\s*руб[^\d-]*([^\s]+)\s*руб/i);
        if (match) {
            result.internalPrice = normalizeCellText(match[1]);
            result.customerPrice = normalizeCellText(match[2]);
        }

        return result;
    }

    function extractSaleTypes(modal) {
        const saleTypes = {
            product: false,
            markdown: false,
            legal: false,
            service: false
        };

        const section = Array.from(modal.querySelectorAll('div, section'))
            .find(el => (el.textContent || '').includes('Допустимый к оформлению вид продажи'));

        const root = section || modal;

        const findCheckbox = (kind) =>
            root.querySelector(`input[type="checkbox"][id*="sale-${kind}"]`)
            || root.querySelector(`input[type="checkbox"][id*="${kind}"]`);

        saleTypes.product = !!findCheckbox('product')?.checked;
        saleTypes.markdown = !!findCheckbox('markdown')?.checked;
        saleTypes.legal = !!findCheckbox('legal')?.checked;
        saleTypes.service = !!findCheckbox('service')?.checked;

        return saleTypes;
    }

    function extractIntervals(modal) {
        const intervals = [];
        const intervalsTable = modal.querySelector('.e15ujbib1 table tbody');
        if (!intervalsTable) return intervals;

        intervalsTable.querySelectorAll('tr').forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 6) {
                const checkbox = row.querySelector('input[type="checkbox"]');
                if (checkbox && !checkbox.checked) return;

                intervals.push({
                    orderBefore: normalizeCellText(cells[1]?.textContent),
                    startTime: normalizeCellText(cells[2]?.textContent),
                    endTime: normalizeCellText(cells[3]?.textContent),
                    internalPriceAdjustment: normalizeCellText(cells[4]?.textContent),
                    priceAdjustment: normalizeCellText(cells[5]?.textContent)
                });
            }
        });

        return intervals;
    }

    function extractFullTariffData(modal, tariffName) {
        const zones = [];
        modal.querySelectorAll('.e1fyrg6v2 ._chip_134hh_1 span').forEach(el => {
            const text = el.textContent.trim();
            if (text) zones.push(text);
        });

        const branches = [];
        modal.querySelectorAll('.ememj2e2 ._chip_134hh_1 span').forEach(el => {
            const text = el.textContent.trim();
            if (text) branches.push(text);
        });

        const mgxRows = [];
        const mgxTable = modal.querySelector('.e6l3n3q1 table tbody');
        if (mgxTable) {
            mgxTable.querySelectorAll('tr').forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 7) {
                    mgxRows.push({
                        weight: normalizeCellText(cells[0]?.textContent),
                        internal: normalizeCellText(cells[4]?.textContent),
                        customer: normalizeCellText(cells[5]?.textContent),
                        return: normalizeCellText(cells[6]?.textContent)
                    });
                }
            });
        }

        const floorRows = [];
        const floorTable = modal.querySelector('.edt22co2 table tbody');
        if (floorTable) {
            floorTable.querySelectorAll('tr').forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 8) {
                    floorRows.push({
                        weight: normalizeCellText(cells[0]?.textContent),
                        internalPrice: normalizeCellText(cells[4]?.textContent),
                        internalThreshold: normalizeCellText(cells[5]?.textContent),
                        customerPrice: normalizeCellText(cells[6]?.textContent),
                        customerThreshold: normalizeCellText(cells[7]?.textContent)
                    });
                }
            });
        }

        let payment = { card: false, cash: false };
        const paymentSection = modal.querySelector('.edlmfm3');
        if (paymentSection) {
            const cardCheckbox = paymentSection.querySelector('input[id*="cashless"]');
            const cashCheckbox = paymentSection.querySelector('input[id*="cash"]');
            payment.card = !!(cardCheckbox && cardCheckbox.checked);
            payment.cash = !!(cashCheckbox && cashCheckbox.checked);
        }

        let acceptance = { sameDay: false, nextDay: false };
        const acceptanceSection = modal.querySelector('.e1lmeb342');
        if (acceptanceSection) {
            const sameDayRadio = acceptanceSection.querySelector('#sameDay input');
            const nextDayRadio = acceptanceSection.querySelector('#nextDay input');
            acceptance.sameDay = !!(sameDayRadio && sameDayRadio.checked);
            acceptance.nextDay = !!(nextDayRadio && nextDayRadio.checked);
        }

        // === Новые поля для ПВЗ (из твоего HTML) ===
        const deliveryDaysInput = document.querySelector('input[placeholder*="Количество дней доставки"]');
        const cutoffInput = document.querySelector('input[placeholder*="Отсечка оформления заказа"]');
        const costLimitInput = document.querySelector('input[placeholder*="Стоимость заказа"]');

        return {
            tariffName,
            name: tariffName,
            zones,
            branches,
            mgxRows,
            floorRows,
            elevatorPrices: extractElevatorPrices(modal),
            intervals: extractIntervals(modal),
            payment,
            acceptance,
            saleTypes: extractSaleTypes(modal),
            deliveryDays: deliveryDaysInput ? deliveryDaysInput.value : '0',
            cutoffTime: cutoffInput ? cutoffInput.value : '00:00',
            costLimit: costLimitInput ? costLimitInput.value : ''
        };
    }
})();