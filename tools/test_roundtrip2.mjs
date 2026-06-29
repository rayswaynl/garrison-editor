/**
 * Round-trip gate v2 — fixed assertions.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { join } from 'path';

const BASE_URL = 'http://localhost:8108';
const MISSION = 'C:\\Users\\Steff\\a2waspwarfare\\Missions\\[55-2hc]warfarev2_073v48co.chernarus';
const GROUPS_CDF = join(MISSION, 'Common', 'Config', 'Groups', 'Groups_CDF.sqf');
const GARRISON_SQF = join(MISSION, 'Server', 'Functions', 'Server_GetTownGroupsDefender.sqf');

const groupsRaw = readFileSync(GROUPS_CDF, 'utf8');
const garrisonRaw = readFileSync(GARRISON_SQF, 'utf8');

let passed = 0;
let failed = 0;
const results = [];

function assert(name, condition, detail = '') {
  if (condition) {
    console.log(`  PASS: ${name}`);
    passed++;
    results.push({ name, pass: true });
  } else {
    console.error(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`);
    failed++;
    results.push({ name, pass: false, detail });
  }
}

async function pasteIntoTextarea(page, selector, text) {
  await page.evaluate(({ sel, txt }) => {
    const el = document.querySelector(sel);
    el.focus();
    const dt = new DataTransfer();
    dt.setData('text/plain', txt);
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
  }, { sel: selector, txt: text });
  await page.waitForTimeout(150);
}

async function getOutputText(page, selector) {
  return await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? el.textContent : null;
  }, selector);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  // =====================================================================
  // PAGE 1: Groups tests (fresh page)
  // =====================================================================
  {
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', err => consoleErrors.push(err.message));

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.click('#tabBtnExport');
    await page.waitForTimeout(300);

    // ---- Test 1: Groups no-op ----
    console.log('\n=== Test 1: Groups_CDF.sqf no-op round-trip ===');
    await pasteIntoTextarea(page, '#expGroupsPaste', groupsRaw);
    await page.click('button:has-text("Groups only")');
    await page.waitForTimeout(300);

    const groupsOut1 = await getOutputText(page, '#expOutGroupsCode');
    assert('Groups no-op: output byte-identical to input', groupsOut1 === groupsRaw,
      `input len=${groupsRaw.length} output len=${groupsOut1?.length}`);
    const rtBar1 = await page.evaluate(() => document.getElementById('expRoundtripBar').textContent);
    assert('Groups no-op: round-trip bar shows PASS', rtBar1.includes('PASS') && !rtBar1.includes('FAIL'),
      `bar: ${rtBar1.trim()}`);

    await page.screenshot({ path: 'tools/screenshots/export_groups_noop.png' });
    console.log('  Screenshot saved: export_groups_noop.png');

    // ---- Test 2: Groups edit — add unit to Squad[0], only that block changes ----
    console.log('\n=== Test 2: Groups edit — Squad variant 1, only that triplet changes ===');
    await page.click('#tabBtnTemplates');
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      MODEL.groups.CDF.templates.Squad[0].push('CDF_Soldier');
    });
    await page.click('#tabBtnExport');
    await page.waitForTimeout(200);
    await page.click('button:has-text("Groups only")');
    await page.waitForTimeout(300);

    const groupsOut2 = await getOutputText(page, '#expOutGroupsCode');
    assert('Groups edit: output differs from input', groupsOut2 !== groupsRaw);

    // Count how many blocks differ between original and patched
    // We do this by running the same parser in Node using eval-in-page
    const diffInfo = await page.evaluate((orig) => {
      const parsed = parseGroupsSqf(orig);
      // Re-run diff against current model (CDF)
      const changed = diffGroupsBlocks(parsed.blocks, 'CDF');
      return { changedCount: changed.length, total: parsed.blocks.length };
    }, groupsRaw);
    assert('Groups edit: exactly 1 block changed', diffInfo.changedCount === 1,
      `changed=${diffInfo.changedCount} total=${diffInfo.total}`);

    // Detect the EOL used in the source file
    const srcEol = groupsRaw.includes('\r\n') ? '\r\n' : '\n';

    // Verify the new unit appears (use source EOL in assertion)
    assert('Groups edit: new unit CDF_Soldier appended', groupsOut2 !== null &&
      groupsOut2.includes(`_u = _u + ["CDF_Soldier"];${srcEol}_l = _l + [_u];`));

    // Verify non-Squad blocks are untouched — Team block from original preserved verbatim
    const teamBlock = `_k = _k + ["Team"];${srcEol}_u\t\t= ["CDF_Soldier_TL"];${srcEol}_u = _u + ["CDF_Soldier_Medic"];${srcEol}_u = _u + ["CDF_Soldier"];${srcEol}_u = _u + ["CDF_Soldier_AR"];${srcEol}_u = _u + ["CDF_Soldier"];${srcEol}_l = _l + [_u];`;
    assert('Groups edit: Team block unchanged in patched output', groupsOut2 !== null && groupsOut2.includes(teamBlock));

    const rtBar2 = await page.evaluate(() => document.getElementById('expRoundtripBar').textContent);
    assert('Groups edit: bar shows 1/N patched', rtBar2.includes('1/') && rtBar2.includes('patched'),
      `bar: ${rtBar2.trim()}`);

    await page.screenshot({ path: 'tools/screenshots/export_groups_edited.png' });
    console.log('  Screenshot saved: export_groups_edited.png');

    assert('Groups page: zero console errors', consoleErrors.length === 0, consoleErrors.join('; '));
    await page.close();
  }

  // =====================================================================
  // PAGE 2: Garrison tests (fresh page — clean model)
  // =====================================================================
  {
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', err => consoleErrors.push(err.message));

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.click('#tabBtnExport');
    await page.waitForTimeout(300);

    // ---- Test 3: Garrison no-op ----
    console.log('\n=== Test 3: Server_GetTownGroupsDefender.sqf no-op round-trip ===');
    await pasteIntoTextarea(page, '#expGarPaste', garrisonRaw);
    await page.click('button:has-text("Garrison only")');
    await page.waitForTimeout(300);

    const garOut1 = await getOutputText(page, '#expOutGarCode');
    assert('Garrison no-op: output byte-identical to input', garOut1 === garrisonRaw,
      `input len=${garrisonRaw.length} output len=${garOut1?.length}`);
    const rtBar3 = await page.evaluate(() => document.getElementById('expRoundtripBar').textContent);
    assert('Garrison no-op: round-trip bar shows PASS', rtBar3.includes('PASS') && !rtBar3.includes('FAIL'),
      `bar: ${rtBar3.trim()}`);

    await page.screenshot({ path: 'tools/screenshots/export_garrison_noop.png' });
    console.log('  Screenshot saved: export_garrison_noop.png');

    // ---- Test 4: Garrison edit — SmallTown1 groups_max ----
    console.log('\n=== Test 4: Garrison edit — SmallTown1 groups_max, only that case changes ===');
    await page.evaluate(() => {
      MODEL.garrison.SmallTown1.groups_max = 9; // was 5
    });
    await page.click('button:has-text("Garrison only")');
    await page.waitForTimeout(300);

    const garOut2 = await getOutputText(page, '#expOutGarCode');
    assert('Garrison edit: output differs from input', garOut2 !== garrisonRaw);
    assert('Garrison edit: SmallTown1 now has groups_max=9', garOut2 !== null &&
      garOut2.includes('_groups_max = 9;'));

    // Verify exactly 1 block changed
    const garDiff = await page.evaluate((orig) => {
      const parsed = parseGarrisonSqf(orig);
      const changed = diffGarrisonBlocks(parsed.blocks);
      return { changedCount: changed.length, total: parsed.blocks.length };
    }, garrisonRaw);
    assert('Garrison edit: exactly 1 block changed', garDiff.changedCount === 1,
      `changed=${garDiff.changedCount} total=${garDiff.total}`);

    // Verify SmallTown2 is still in the output (unchanged block)
    assert('Garrison edit: SmallTown2 case still present', garOut2 !== null &&
      garOut2.includes('case "SmallTown2"'));
    // And SmallTown2 still has _groups_max = 5
    assert('Garrison edit: SmallTown2 groups_max still 5', (() => {
      if (!garOut2) return false;
      const idx = garOut2.indexOf('case "SmallTown2"');
      if (idx === -1) return false;
      const snippet = garOut2.slice(idx, idx + 300);
      return snippet.includes('_groups_max = 5;');
    })());

    const rtBar4 = await page.evaluate(() => document.getElementById('expRoundtripBar').textContent);
    assert('Garrison edit: bar shows 1/N patched', rtBar4.includes('1/') && rtBar4.includes('patched'),
      `bar: ${rtBar4.trim()}`);

    await page.screenshot({ path: 'tools/screenshots/export_garrison_edited.png' });
    console.log('  Screenshot saved: export_garrison_edited.png');

    assert('Garrison page: zero console errors', consoleErrors.length === 0, consoleErrors.join('; '));
    await page.close();
  }

  await browser.close();

  console.log('\n--- Summary ---');
  console.log(`Passed: ${passed}  Failed: ${failed}`);
  results.forEach(r => {
    const icon = r.pass ? 'PASS' : 'FAIL';
    console.log(`  [${icon}] ${r.name}${r.detail ? ': ' + r.detail : ''}`);
  });

  process.exit(failed > 0 ? 1 : 0);
})();
