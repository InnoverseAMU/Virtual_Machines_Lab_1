// Capture real screenshots from the Virtual Machines Lab app using Playwright
import { createRequire } from 'module';
const require = createRequire('/home/asad/claude-skills/lemo-opuscar/package.json');
const { chromium } = require('playwright-core');
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, 'captures');
mkdirSync(OUT, { recursive: true });

const APP = 'http://localhost:5173';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-gpu',
      '--use-gl=swiftshader',
      '--enable-webgl',
      '--window-size=1920,1080',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
  });

  // 1. EXPERIMENT PICKER (home / landing page)
  console.log('1. Capturing experiment picker...');
  const page1 = await context.newPage();
  await page1.goto(APP, { waitUntil: 'networkidle', timeout: 30000 });
  // Set dark theme via localStorage
  await page1.evaluate(() => localStorage.setItem('vml-theme', 'dark'));
  await page1.reload({ waitUntil: 'networkidle' });
  await sleep(2000);
  await page1.screenshot({ path: resolve(OUT, '01-experiment-picker.png'), type: 'png' });
  console.log('  ✓ experiment picker captured');

  // 2. Click on Experiment 3.1 (Load test of single-phase transformer)
  // Look for the first experiment card or link
  console.log('2. Navigating to Exp 3.1...');
  try {
    // Try clicking by text
    const ex31 = await page1.locator('text=Load test').first();
    if (await ex31.isVisible()) {
      await ex31.click();
      await sleep(3000);
    }
  } catch {
    // Navigate directly
    await page1.goto(APP + '/#/experiment/ex3.1', { waitUntil: 'networkidle' });
    await sleep(3000);
  }
  await page1.screenshot({ path: resolve(OUT, '02-experiment-landing.png'), type: 'png' });
  console.log('  ✓ experiment landing captured');

  // 3. OBSERVE MODE — pre-wired bench
  console.log('3. Trying Observe mode...');
  try {
    const observeBtn = await page1.locator('text=Observe').first();
    if (await observeBtn.isVisible()) {
      await observeBtn.click();
      await sleep(4000);
    }
  } catch {
    console.log('  Could not find Observe button, trying alternatives...');
  }
  await page1.screenshot({ path: resolve(OUT, '03-observe-mode.png'), type: 'png' });
  console.log('  ✓ observe mode captured');

  // 4. Wait for 3D bench to render, then capture
  console.log('4. Capturing 3D bench...');
  await sleep(3000);
  await page1.screenshot({ path: resolve(OUT, '04-3d-bench.png'), type: 'png' });
  console.log('  ✓ 3D bench captured');

  // 5. LEARN MODE — go back and select Learn
  console.log('5. Trying Learn mode...');
  await page1.goBack();
  await sleep(2000);
  try {
    const learnBtn = await page1.locator('text=Learn').first();
    if (await learnBtn.isVisible()) {
      await learnBtn.click();
      await sleep(4000);
    }
  } catch {
    console.log('  Could not find Learn button');
  }
  await page1.screenshot({ path: resolve(OUT, '05-learn-mode.png'), type: 'png' });
  console.log('  ✓ learn mode captured');

  // 6. Capture the learn step popup/explanation if visible
  await sleep(2000);
  await page1.screenshot({ path: resolve(OUT, '06-learn-step.png'), type: 'png' });
  console.log('  ✓ learn step captured');

  // 7. SELF MODE — go back and select Self
  console.log('7. Trying Self mode...');
  await page1.goBack();
  await sleep(2000);
  try {
    const selfBtn = await page1.locator('text=Self').first();
    if (await selfBtn.isVisible()) {
      await selfBtn.click();
      await sleep(4000);
    }
  } catch {
    console.log('  Could not find Self button');
  }
  await page1.screenshot({ path: resolve(OUT, '07-self-mode.png'), type: 'png' });
  console.log('  ✓ self mode captured');

  // 8. Circuit diagram panel
  console.log('8. Looking for circuit diagram panel...');
  try {
    const diagBtn = await page1.locator('text=Diagram').first();
    if (await diagBtn.isVisible()) {
      await diagBtn.click();
      await sleep(2000);
    }
  } catch {}
  try {
    const circBtn = await page1.locator('text=Circuit').first();
    if (await circBtn.isVisible()) {
      await circBtn.click();
      await sleep(2000);
    }
  } catch {}
  await page1.screenshot({ path: resolve(OUT, '08-circuit-diagram.png'), type: 'png' });
  console.log('  ✓ circuit diagram captured');

  // 9. Observations tab (sidebar)
  console.log('9. Looking for Observations sidebar...');
  try {
    const obsBtn = await page1.locator('text=Observations').first();
    if (await obsBtn.isVisible()) {
      await obsBtn.click();
      await sleep(2000);
    }
  } catch {}
  try {
    const obsBtn2 = await page1.locator('text=Observe').first();
    if (await obsBtn2.isVisible()) {
      await obsBtn2.click();
      await sleep(2000);
    }
  } catch {}
  await page1.screenshot({ path: resolve(OUT, '09-observations.png'), type: 'png' });
  console.log('  ✓ observations captured');

  // 10. Take a screenshot of the full page at different viewport for phone layout
  console.log('10. Capturing phone layout...');
  await page1.setViewportSize({ width: 390, height: 844 });
  await sleep(2000);
  await page1.screenshot({ path: resolve(OUT, '10-phone-layout.png'), type: 'png' });
  console.log('  ✓ phone layout captured');

  // Reset viewport
  await page1.setViewportSize({ width: 1920, height: 1080 });

  // 11. Light theme screenshot
  console.log('11. Capturing light theme...');
  await page1.evaluate(() => localStorage.setItem('vml-theme', 'light'));
  await page1.reload({ waitUntil: 'networkidle' });
  await sleep(3000);
  await page1.screenshot({ path: resolve(OUT, '11-light-theme.png'), type: 'png' });
  console.log('  ✓ light theme captured');

  // Switch back to dark
  await page1.evaluate(() => localStorage.setItem('vml-theme', 'dark'));
  await page1.reload({ waitUntil: 'networkidle' });
  await sleep(2000);
  await page1.screenshot({ path: resolve(OUT, '12-dark-theme.png'), type: 'png' });
  console.log('  ✓ dark theme captured');

  console.log('\nAll captures complete! Files in:', OUT);
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
