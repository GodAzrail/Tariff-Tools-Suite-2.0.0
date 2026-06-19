document.addEventListener('DOMContentLoaded', () => {
  const status = document.getElementById('status');

  if (!status) {
    console.warn('[Tariff Tools Suite] Status element not found');
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs?.[0]?.url || '';
    const isTariffs = url.includes('/configurator/tariffs');
    const isDelOrgs = url.includes('/configurator/del-orgs');

    if (isTariffs) {
      status.innerHTML = `✅ Активная вкладка: страница тарифов.`;
    } else if (isDelOrgs) {
      status.innerHTML = '✅ Активная вкладка: страница del-orgs. Здесь работают resize-скрипты.';
    } else {
      status.innerHTML = `⚠️ Открой поддерживаемую страницу:
\`/configurator/tariffs\` или \`/configurator/del-orgs\``;
    }
  });
});
