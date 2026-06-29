/**
 * Round-trip gate for Task 4 (Playwright, ESM).
 * Tests:
 *   1. Groups_CDF.sqf no-op: paste → export → byte-identical
 *   2. Groups_CDF.sqf edit: add a unit to Squad variant 1 → only that triplet changed
 *   3. Server_GetTownGroupsDefender.sqf no-op: paste → export → byte-identical
 *   4. Server_GetTownGroupsDefender.sqf edit: change SmallTown1 groups_max → only that case changed
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
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
  // Trigger the paste event with the raw text so EXP.groupsRaw captures it correctly
  await page.evaluate(({ sel, txt }) => {
    const el = document.querySelector(sel);
    el.focus();
    // Simulate a paste event with the raw text
    const dt = new DataTransfer();
    dt.setData('text/plain', txt);
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
  }, { sel: selector, txt: text });
  // Small wait for event handler to fire
  await page.waitForTimeout(100);
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
  const page = await context.newPage();

  // Collect console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(err.message));

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500); // let data load

  // ---- Navigate to Export tab ----
  await page.click('#tabBtnExport');
  await page.waitForTimeout(300);

  console.log('\n=== Test 1: Groups_CDF.sqf no-op round-trip ===');
  await pasteIntoTextarea(page, '#expGroupsPaste', groupsRaw);
  await page.waitForTimeout(200);
  await page.click('button:has-text("Groups only")');
  await page.waitForTimeout(300);

  const groupsOut1 = await getOutputText(page, '#expOutGroupsCode');
  assert('Groups no-op: output equals input (byte-identical)', groupsOut1 === groupsRaw,
    `len input=${groupsRaw.length} len output=${groupsOut1?.length}`);

  // Check round-trip bar shows PASS
  const rtBar1 = await page.evaluate(() => document.getElementById('expRoundtripBar').textContent);
  assert('Groups no-op: round-trip bar shows PASS', rtBar1.includes('PASS') && !rtBar1.includes('FAIL'));

  // Screenshot after no-op
  await page.screenshot({ path: 'tools/screenshots/export_groups_noop.png', fullPage: false });
  console.log('  Screenshot: tools/screenshots/export_groups_noop.png');

  console.log('\n=== Test 2: Groups_CDF.sqf — edit Squad variant 1, only that triplet changes ===');
  // Switch to Templates tab and add a unit to CDF Squad variant 1
  await page.click('#tabBtnTemplates');
  await page.waitForTimeout(200);
  // CDF should already be selected; open the Squad block
  const squadBodyId = '#body-CDF-Squad';
  const squadBody = await page.$(squadBodyId);
  if (squadBody) {
    const isOpen = await page.evaluate(el => el.classList.contains('open'), squadBody);
    if (!isOpen) await page.click('#chev-CDF-Squad');
    await page.waitForTimeout(100);
  }

  // Add a unit to Squad variant 1 via the model directly (avoids picker complexity)
  await page.evaluate(() => {
    // Add a unit to Squad variant 0 (first)
    if (MODEL.groups.CDF && MODEL.groups.CDF.templates.Squad) {
      MODEL.groups.CDF.templates.Squad[0].push('CDF_Soldier');
    }
  });
  await page.waitForTimeout(100);

  // Go back to export and export
  await page.click('#tabBtnExport');
  await page.waitForTimeout(200);
  // Source is still pasted
  await page.click('button:has-text("Groups only")');
  await page.waitForTimeout(300);

  const groupsOut2 = await getOutputText(page, '#expOutGroupsCode');
  assert('Groups edited: output differs from input', groupsOut2 !== groupsRaw);

  // Verify only the first Squad triplet changed: find both in the diff
  // The original first Squad triplet ends with CDF_Soldier_RPG (10 units)
  // After edit it should end with CDF_Soldier (11 units)
  const origFirstSquad = `_k = _k + ["Squad"];\n_u\t\t= ["CDF_Soldier_TL"];\n_u = _u + ["CDF_Soldier_Strela"];\n_u = _u + ["CDF_Soldier_Medic"];\n_u = _u + ["CDF_Soldier_GL"];\n_u = _u + ["CDF_Soldier"];\n_u = _u + ["CDF_Soldier"];\n_u = _u + ["CDF_Soldier_Sniper"];\n_u = _u + ["CDF_Soldier_RPG"];\n_u = _u + ["CDF_Soldier_AR"];\n_u = _u + ["CDF_Soldier_RPG"];\n_l = _l + [_u];`;
  const newFirstSquad = origFirstSquad.replace('_l = _l + [_u];', '_u = _u + ["CDF_Soldier"];\n_l = _l + [_u];');

  assert('Groups edited: new unit appears in patched output', groupsOut2 !== null && groupsOut2.includes(newFirstSquad));
  // Second Squad variant (variant 2) should be unchanged
  const origSecondSquad = `_k = _k + ["Squad"];\n_u\t\t= ["CDF_Soldier_TL"];\n_u = _u + ["CDF_Soldier_Strela"];\n_u = _u + ["CDF_Soldier_Strela"];\n_u = _u + ["CDF_Soldier_Medic"];\n_u = _u + ["CDF_Soldier_GL"];\n_u = _u + ["CDF_Soldier_Sniper"];\n_u = _u + ["CDF_Soldier_RPG"];\n_u = _u + ["CDF_Soldier_MG"];\n_u = _u + ["CDF_Soldier_Engineer"];\n_u = _u + ["CDF_Soldier_AR"];\n_u = _u + ["CDF_Soldier_RPG"];\n_l = _l + [_u];`;
  assert('Groups edited: second Squad variant unchanged', groupsOut2 !== null && groupsOut2.includes(origSecondSquad));

  // Round-trip bar shows "1/N changed"
  const rtBar2 = await page.evaluate(() => document.getElementById('expRoundtripBar').textContent);
  assert('Groups edited: round-trip bar shows patch count', rtBar2.includes('1/') && rtBar2.includes('patched'));

  await page.screenshot({ path: 'tools/screenshots/export_groups_edited.png', fullPage: false });
  console.log('  Screenshot: tools/screenshots/export_groups_edited.png');

  console.log('\n=== Test 3: Server_GetTownGroupsDefender.sqf no-op round-trip ===');
  // Undo the Squad edit by reloading the page
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.click('#tabBtnExport');
  await page.waitForTimeout(200);

  await pasteIntoTextarea(page, '#expGarPaste', garrisonRaw);
  await page.waitForTimeout(200);
  await page.click('button:has-text("Garrison only")');
  await page.waitForTimeout(300);

  const garOut1 = await getOutputText(page, '#expOutGarCode');
  assert('Garrison no-op: output equals input (byte-identical)', garOut1 === garrisonRaw,
    `len input=${garrisonRaw.length} len output=${garOut1?.length}`);

  const rtBar3 = await page.evaluate(() => document.getElementById('expRoundtripBar').textContent);
  assert('Garrison no-op: round-trip bar shows PASS', rtBar3.includes('PASS') && !rtBar3.includes('FAIL'));

  await page.screenshot({ path: 'tools/screenshots/export_garrison_noop.png', fullPage: false });
  console.log('  Screenshot: tools/screenshots/export_garrison_noop.png');

  console.log('\n=== Test 4: Garrison edit — SmallTown1 groups_max change ===');
  // Edit SmallTown1 groups_max in the model
  await page.evaluate(() => {
    if (MODEL.garrison.SmallTown1) {
      MODEL.garrison.SmallTown1.groups_max = 9; // was 5
    }
  });
  await page.waitForTimeout(100);

  await page.click('button:has-text("Garrison only")');
  await page.waitForTimeout(300);

  const garOut2 = await getOutputText(page, '#expOutGarCode');
  assert('Garrison edited: output differs from input', garOut2 !== garrisonRaw);
  assert('Garrison edited: new groups_max appears', garOut2 !== null && garOut2.includes('_groups_max = 9;'));
  // The original SmallTown1 had groups_max=5, other towns should be unchanged
  assert('Garrison edited: SmallTown2 unchanged (groups_max=5)', garOut2 !== null && garOut2.includes(
    '\tcase "SmallTown2": {\n\t\t_units = [["Squad_Advanced", 1, 0], ["Team", 1, 0], ["Team_MG", 1, 0], ["Team_AT", 2, 0], ["Motorized", 1, 1], ["AA_Light", 1, 1], ["Armored_Light", 1, 1]];\n\t\t_percentage_inf = 80;\n\t\t_groups_max = 5;\n\t};'
  ));

  const rtBar4 = await page.evaluate(() => document.getElementById('expRoundtripBar').textContent);
  assert('Garrison edited: round-trip bar shows patch count', rtBar4.includes('1/') && rtBar4.includes('patched'));

  await page.screenshot({ path: 'tools/screenshots/export_garrison_edited.png', fullPage: false });
  console.log('  Screenshot: tools/screenshots/export_garrison_edited.png');

  console.log('\n=== Test 5: Console errors ===');
  assert('Zero console errors', consoleErrors.length === 0,
    consoleErrors.length > 0 ? consoleErrors.join('; ') : '');

  await browser.close();

  // Save a final combined screenshot path record
  console.log('\n--- Summary ---');
  console.log(`Passed: ${passed}  Failed: ${failed}`);
  results.forEach(r => {
    const icon = r.pass ? 'PASS' : 'FAIL';
    console.log(`  [${icon}] ${r.name}${r.detail ? ': ' + r.detail : ''}`);
  });

  process.exit(failed > 0 ? 1 : 0);
})();
