// Capture live powered bench, populated observations chart, light bench, learn wiring step, and fault state
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--enable-webgl', '--window-size=1920,1080'],
  });

  async function openExp31(modeText, dark = true) {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      colorScheme: dark ? 'dark' : 'light',
    });
    const page = await context.newPage();
    await page.goto(APP, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(1000);
    await page.evaluate((theme) => localStorage.setItem('vml-theme', theme), dark ? 'dark' : 'light');
    await page.reload({ waitUntil: 'networkidle' });
    await sleep(1200);
    await page.locator('text=Load test').first().click();
    await sleep(1200);
    await page.locator(`text=${modeText}`).first().click();
    await sleep(3500);
    return { page, context };
  }

  // 1. OBSERVE MODE: orbit angles, energise, live meters, populated observations + chart, light theme bench
  console.log('1. Observe mode: live meters + chart + light bench...');
  {
    const { page, context } = await openExp31('Observe', true);

    // Orbit angle 1 (drag canvas slightly left)
    await page.mouse.move(750, 500);
    await page.mouse.down();
    await page.mouse.move(900, 440, { steps: 10 });
    await page.mouse.up();
    await sleep(800);
    await page.screenshot({ path: resolve(OUT, '03b-bench-orbit1.png') });

    // Orbit angle 2 (drag canvas back right)
    await page.mouse.move(750, 500);
    await page.mouse.down();
    await page.mouse.move(580, 530, { steps: 10 });
    await page.mouse.up();
    await sleep(800);
    await page.screenshot({ path: resolve(OUT, '03c-bench-orbit2.png') });

    // Reset camera to Overview
    await page.locator('button:has-text("Overview")').first().click();
    await sleep(1200);

    // Energise Supply!
    const supBtn = page.locator('button:has-text("Supply: OFF")').first();
    if (await supBtn.isVisible()) {
      await supBtn.click();
      await sleep(800);
    }

    // Set Autotransformer slider to 230 V
    const slider = page.locator('input[type="range"]').first();
    if (await slider.isVisible()) {
      await slider.fill('230');
      await slider.dispatchEvent('change');
      await sleep(1000);
    }
    await page.screenshot({ path: resolve(OUT, '16b-meters-live-230v.png') });
    console.log('  ✓ 16b-meters-live-230v.png');

    // Add row 1 (No-load)
    const addRowBtn = page.locator('button:has-text("+ Add row")').first();
    if (await addRowBtn.isVisible()) {
      await addRowBtn.click();
      await sleep(400);
    }

    // Turn on lamps L1..L4, add row
    for (const l of ['L1', 'L2', 'L3', 'L4']) {
      await page.locator(`button:has-text("${l}")`).first().click();
      await sleep(100);
    }
    await sleep(800);
    await addRowBtn.click();
    await sleep(400);

    // Capture loaded bench with lamps glowing!
    await page.screenshot({ path: resolve(OUT, '17b-bench-loaded-lamps.png') });
    console.log('  ✓ 17b-bench-loaded-lamps.png');

    // Turn on L5..L8, add row; L9..L12, add row
    for (const l of ['L5', 'L6', 'L7', 'L8']) {
      await page.locator(`button:has-text("${l}")`).first().click();
      await sleep(80);
    }
    await sleep(500);
    await addRowBtn.click();
    await sleep(400);

    for (const l of ['L9', 'L10', 'L11', 'L12']) {
      await page.locator(`button:has-text("${l}")`).first().click();
      await sleep(80);
    }
    await sleep(500);
    await addRowBtn.click();
    await sleep(600);

    // Switch to Observations tab to see populated table + Efficiency vs Load VA curve!
    await page.locator('button:has-text("Observations")').first().click();
    await sleep(1200);
    await page.screenshot({ path: resolve(OUT, '09b-observations-chart.png') });
    console.log('  ✓ 09b-observations-chart.png');

    // Toggle theme to Light while on the 3D bench!
    const themeBtn = page.locator('button:has-text("Dark"), button:has-text("System")').first();
    if (await themeBtn.isVisible()) {
      await themeBtn.click();
      await sleep(500);
      // If it went to System or Light, check body class or click once more if needed
      const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      if (isDark) {
        await themeBtn.click();
        await sleep(500);
      }
    }
    await sleep(1200);
    await page.screenshot({ path: resolve(OUT, '11b-bench-light.png') });
    console.log('  ✓ 11b-bench-light.png');

    await context.close();
  }

  // 2. LEARN MODE: advance a few steps so wires + apparatus highlight + step popup show
  console.log('2. Learn mode: step 4/5 with wiring explanation...');
  {
    const { page, context } = await openExp31('Learn', true);
    for (let i = 0; i < 4; i++) {
      const nextBtn = page.locator('button:has-text("Next")').first();
      if (await nextBtn.isVisible()) {
        await nextBtn.click();
        await sleep(900);
      }
    }
    await page.screenshot({ path: resolve(OUT, '05b-learn-wiring-step.png') });
    console.log('  ✓ 05b-learn-wiring-step.png');
    await context.close();
  }

  // 3. SELF MODE: submit with incomplete/wrong wiring to show fault feedback
  console.log('3. Self mode: fault feedback...');
  {
    const { page, context } = await openExp31('Self', true);
    const submitBtn = page.locator('button:has-text("Submit")').first();
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      await sleep(1500);
    }
    await page.screenshot({ path: resolve(OUT, '07b-self-fault.png') });
    console.log('  ✓ 07b-self-fault.png');
    await context.close();
  }

  await browser.close();
  console.log('Done!');
}

main().catch((e) => { console.error(e); process.exit(1); });
