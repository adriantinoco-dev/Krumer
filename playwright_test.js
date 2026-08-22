const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  await page.goto('http://localhost:8001/test_highlight.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  const log = await page.$eval('#log', el => el.textContent);
  console.log('--- LOG CONTENT ---');
  console.log(log);
  const hasHighlight = await page.evaluate(() => {
    return document.documentElement.innerHTML.slice(0, 2000);
  });
  console.log('--- PAGE HTML SNIPPET ---');
  console.log(hasHighlight.slice(0, 2000));
  await browser.close();
  process.exit(0);
})();
