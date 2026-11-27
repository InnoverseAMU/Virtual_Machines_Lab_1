// Capture more screenshots — each in a fresh page load to avoid state issues
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

  async function freshPage(dark = true) {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      colorScheme: dark ? 'dark' : 'light',
    });
    const page = await context.newPage();
    await page.goto(APP, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(1500);
    return { page, context };
  }

  // --- LEARN MODE ---
  console.log('Capturing Learn mode...');
  {
    const { page, context } = await freshPage();
    // Click on Exp 3.1
    await page.locator('text=Load test').first().click();
    await sleep(2000);
    // Now we should be on mode select, click Learn
    const learnBtn = page.locator('text=Learn').first();
    await learnBtn.waitFor({ timeout: 5000 }).catch(() => {});
    if (await learnBtn.isVisible()) {
      await learnBtn.click();
      await sleep(5000);
      await page.screenshot({ path: resolve(OUT, '05-learn-mode.png'), type: 'png' });
      console.log('  ✓ learn mode captured');
    } else {
      console.log('  ✗ Learn button not found');
      await page.screenshot({ path: resolve(OUT, '05-learn-mode-debug.png'), type: 'png' });
    }
    await context.close();
  }

  // --- SELF MODE (unwired bench) ---
  console.log('Capturing Self mode...');
  {
    const { page, context } = await freshPage();
    await page.locator('text=Load test').first().click();
    await sleep(2000);
    const selfBtn = page.locator('text=Self').first();
    await selfBtn.waitFor({ timeout: 5000 }).catch(() => {});
    if (await selfBtn.isVisible()) {
      await selfBtn.click();
      await sleep(5000);
      await page.screenshot({ path: resolve(OUT, '07-self-mode.png'), type: 'png' });
      console.log('  ✓ self mode captured');
    } else {
      console.log('  ✗ Self button not found');
      await page.screenshot({ path: resolve(OUT, '07-self-debug.png'), type: 'png' });
    }
    await context.close();
  }

  // --- OBSERVE MODE with sidebar Observations tab ---
  console.log('Capturing Observe mode with Observations tab...');
  {
    const { page, context } = await freshPage();
    await page.locator('text=Load test').first().click();
    await sleep(2000);
    // Click Observe
    const obsBtn = page.locator('text=Observe').first();
    await obsBtn.waitFor({ timeout: 5000 }).catch(() => {});
    if (await obsBtn.isVisible()) {
      await obsBtn.click();
      await sleep(5000);
      
      // Click Observations tab in sidebar
      const observationsTab = page.locator('text=Observations').first();
      if (await observationsTab.isVisible()) {
        await observationsTab.click();
        await sleep(2000);
      }
      await page.screenshot({ path: resolve(OUT, '09-observations.png'), type: 'png' });
      console.log('  ✓ observations captured');
      
      // Click on circuit diagram
      const diagBtn = page.locator('text=View circuit diagram').first();
      if (await diagBtn.isVisible()) {
        await diagBtn.click();
        await sleep(2000);
        await page.screenshot({ path: resolve(OUT, '08-circuit-diagram.png'), type: 'png' });
        console.log('  ✓ circuit diagram captured');
        // close diagram
        await page.keyboard.press('Escape');
        await sleep(500);
      }
      
      // Switch to Supply camera to see bench from supply side
      const supplyBtn = page.locator('text=Supply').first();
      if (await supplyBtn.isVisible()) {
        await supplyBtn.click();
        await sleep(2000);
        await page.screenshot({ path: resolve(OUT, '13-supply-view.png'), type: 'png' });
        console.log('  ✓ supply view captured');
      }
      
      // Switch to Meters camera
      const metersBtn = page.locator('text=Meters').first();
      if (await metersBtn.isVisible()) {
        await metersBtn.click();
        await sleep(2000);
        await page.screenshot({ path: resolve(OUT, '14-meters-view.png'), type: 'png' });
        console.log('  ✓ meters view captured');
      }

      // Switch to Transformer camera
      const transBtn = page.locator('text=Transformer').first();
      if (await transBtn.isVisible()) {
        await transBtn.click();
        await sleep(2000);
        await page.screenshot({ path: resolve(OUT, '15-transformer-view.png'), type: 'png' });
        console.log('  ✓ transformer view captured');
      }

      // Turn on supply and adjust variac to see meter readings
      const supplyToggle = page.locator('text=Supply: OFF').first();
      if (await supplyToggle.isVisible()) {
        await supplyToggle.click();
        await sleep(1000);
      }
      // Try clicking energise/on
      const energise = page.locator('text=Energise').first();
      if (await energise.isVisible().catch(() => false)) {
        await energise.click();
        await sleep(500);
      }
      // Adjust autotransformer
      const plusBtn = page.locator('text=+1').first();
      if (await plusBtn.isVisible()) {
        for (let i = 0; i < 50; i++) { await plusBtn.click(); await sleep(50); }
        await sleep(1000);
      }
      await page.screenshot({ path: resolve(OUT, '16-meters-live.png'), type: 'png' });
      console.log('  ✓ live meters captured');
      
      // Turn on a couple lamps  
      const l1 = page.locator('text=L1').first();
      if (await l1.isVisible()) {
        await l1.click(); await sleep(100);
        const l2 = page.locator('text=L2').first();
        if (await l2.isVisible()) await l2.click(); await sleep(100);
        const l3 = page.locator('text=L3').first();
        if (await l3.isVisible()) await l3.click(); await sleep(100);
      }
      await sleep(1000);
      // Switch to overview camera
      const overviewBtn = page.locator('text=Overview').first();
      if (await overviewBtn.isVisible()) {
        await overviewBtn.click();
        await sleep(2000);
      }
      await page.screenshot({ path: resolve(OUT, '17-bench-live-loaded.png'), type: 'png' });
      console.log('  ✓ bench live with load captured');
    }
    await context.close();
  }

  // --- LIGHT THEME ---
  console.log('Capturing light theme...');
  {
    const { page, context } = await freshPage(false);
    // Click Dark/Light toggle to switch to light mode
    const themeBtn = page.locator('text=Dark').first();
    if (await themeBtn.isVisible()) {
      await themeBtn.click();
      await sleep(1000);
    }
    await page.screenshot({ path: resolve(OUT, '11-light-theme.png'), type: 'png' });
    console.log('  ✓ light theme captured');
    await context.close();
  }

  // --- PHONE LAYOUT ---
  console.log('Capturing phone layout...');
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      colorScheme: 'dark',
    });
    const page = await ctx.newPage();
    await page.goto(APP, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(2000);
    await page.screenshot({ path: resolve(OUT, '10-phone-layout.png'), type: 'png' });
    console.log('  ✓ phone layout captured');
    await ctx.close();
  }

  console.log('\nAll additional captures complete! Files in:', OUT);
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
