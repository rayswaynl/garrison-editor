/**
 * Smoke tests for improvements:
 *   1. coreUnits handoff seeds templates from payload (not GUE defaults)
 *   2. EXP.groupsRaw stays in sync after textarea keyboard edit
 *   3. addVariantToKey respects the correct tier for tiered factions
 */
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:8108';
let passed = 0, failed = 0;

function assert(name, cond, detail = '') {
  if (cond) { console.log(`  PASS: ${name}`); passed++; }
  else { console.error(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); failed++; }
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  // ===================================================================
  // Smoke 1: coreUnits handoff seeds templates from payload (not GUE)
  // ===================================================================
  console.log('\n=== Smoke 1: coreUnits handoff ===');
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(e.message));

    // Inject handoff payload BEFORE navigation
    await page.addInitScript(() => {
      localStorage.setItem('wasp-faction-handoff', JSON.stringify({
        token: 'TEST',
        side: 'GUER',
        coreUnits: [
          { cls: 'TEST_Soldier_TL',  factory_key: 'Barracks', price: 150, buildTime: 30, crew: -1, upgrade: 0 },
          { cls: 'TEST_Soldier_AR',  factory_key: 'Barracks', price: 120, buildTime: 25, crew: -1, upgrade: 0 },
          { cls: 'TEST_Soldier_RPG', factory_key: 'Barracks', price: 200, buildTime: 40, crew: -1, upgrade: 0 },
          { cls: 'TEST_BRDM',        factory_key: 'Light',    price: 600, buildTime: 90, crew: -1, upgrade: 0 },
          { cls: 'TEST_T72',         factory_key: 'Heavy',    price: 1500, buildTime: 180, crew: -1, upgrade: 0 }
        ],
        _source: 'faction-builder',
        _ts: Date.now()
      }));
    });

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const bannerVisible = await page.evaluate(() => {
      const b = document.getElementById('factionHandoffBanner');
      return b && b.style.display !== 'none';
    });
    assert('Handoff: banner visible', bannerVisible);

    const bannerToken = await page.evaluate(() => document.getElementById('fhbToken').textContent);
    assert('Handoff: banner shows TEST token', bannerToken === 'TEST', `got "${bannerToken}"`);

    // Accept
    await page.click('#fhbAddBtn');
    await page.waitForTimeout(300);

    const result = await page.evaluate(() => {
      const g = MODEL.groups['TEST'];
      if (!g) return { exists: false };
      return {
        exists: true,
        side: g.side,
        keys: Object.keys(g.templates),
        squadUnits: g.templates['Squad'] ? g.templates['Squad'][0] : null,
        motorizedUnits: g.templates['Motorized'] ? g.templates['Motorized'][0] : null,
        armoredUnits: g.templates['Armored_Light'] ? g.templates['Armored_Light'][0] : null,
        hasGueClassname: JSON.stringify(g.templates).includes('GUE_')
      };
    });

    assert('Handoff: TEST faction created', result.exists, JSON.stringify(result));
    assert('Handoff: side is GUER', result.side === 'GUER', `got "${result.side}"`);
    assert('Handoff: Squad key from Barracks units', Array.isArray(result.squadUnits), `keys=${JSON.stringify(result.keys)}`);
    assert('Handoff: Squad has TEST_Soldier_TL', result.squadUnits?.includes('TEST_Soldier_TL'));
    assert('Handoff: Squad has TEST_Soldier_AR', result.squadUnits?.includes('TEST_Soldier_AR'));
    assert('Handoff: Motorized key from Light units', Array.isArray(result.motorizedUnits));
    assert('Handoff: Motorized has TEST_BRDM', result.motorizedUnits?.includes('TEST_BRDM'));
    assert('Handoff: Armored_Light key from Heavy units', Array.isArray(result.armoredUnits));
    assert('Handoff: Armored_Light has TEST_T72', result.armoredUnits?.includes('TEST_T72'));
    assert('Handoff: no GUE_ classnames in templates', !result.hasGueClassname, 'GUE_ classname found — still seeding from GUE');

    const selectedFaction = await page.evaluate(() => MODEL.faction);
    assert('Handoff: TEST faction selected after accept', selectedFaction === 'TEST', `got "${selectedFaction}"`);

    assert('Handoff smoke: zero console errors', errors.length === 0, errors.join('; '));
    await page.screenshot({ path: 'tools/screenshots/handoff_smoke.png' });
    console.log('  Screenshot saved: handoff_smoke.png');
    await ctx.close();
  }

  // ===================================================================
  // Smoke 2: EXP.groupsRaw stays in sync after textarea keyboard edit
  // ===================================================================
  console.log('\n=== Smoke 2: EXP.groupsRaw textarea sync ===');
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(e.message));

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.click('#tabBtnExport');
    await page.waitForTimeout(300);

    // Paste initial content
    const mockSqf = '_k = _k + ["Squad"];\n_u\t\t= ["CDF_Soldier_TL"];\n_u = _u + ["CDF_Soldier"];\n_l = _l + [_u];\n';
    await page.evaluate(({ txt }) => {
      const el = document.querySelector('#expGroupsPaste');
      el.focus();
      const dt = new DataTransfer();
      dt.setData('text/plain', txt);
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, { txt: mockSqf });
    await page.waitForTimeout(200);

    const rawAfterPaste = await page.evaluate(() => EXP.groupsRaw);
    assert('Textarea: EXP.groupsRaw set after paste', rawAfterPaste === mockSqf, `len=${rawAfterPaste?.length}`);

    // Simulate keyboard edit (type additional content)
    const modifiedSqf = mockSqf + '_k = _k + ["Team"];\n_u\t\t= ["CDF_Soldier_TL"];\n_u = _u + ["CDF_Soldier"];\n_l = _l + [_u];\n';
    await page.evaluate(({ txt }) => {
      const el = document.querySelector('#expGroupsPaste');
      el.value = txt;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, { txt: modifiedSqf });
    await page.waitForTimeout(100);

    const rawAfterEdit = await page.evaluate(() => EXP.groupsRaw);
    assert('Textarea: EXP.groupsRaw updated after keyboard edit',
      rawAfterEdit === modifiedSqf,
      `expected len=${modifiedSqf.length} got len=${rawAfterEdit?.length}`);
    assert('Textarea: EXP.groupsRaw has new Team block', rawAfterEdit?.includes('"Team"'));

    // Clear and verify null
    await page.evaluate(() => {
      const el = document.querySelector('#expGroupsPaste');
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(100);
    const rawAfterClear = await page.evaluate(() => EXP.groupsRaw);
    assert('Textarea: EXP.groupsRaw null after clear', rawAfterClear === null, `got: ${rawAfterClear}`);

    assert('Textarea smoke: zero console errors', errors.length === 0, errors.join('; '));
    await ctx.close();
  }

  // ===================================================================
  // Smoke 3: addVariantToKey respects the correct tier
  // ===================================================================
  console.log('\n=== Smoke 3: addVariantToKey tier routing ===');
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(e.message));

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Inject a tiered faction for deterministic testing
    await page.evaluate(() => {
      MODEL.groups['TIER_TEST'] = {
        side: 'GUER',
        templates: {
          Squad_0: [['TierA_Soldier']],
          Squad_1: [['TierB_Soldier']],
          Team: [['Simple_Soldier']]
        }
      };
      // Re-build chips and select
      buildFactionChips();
      selectFaction('TIER_TEST');
    });
    await page.waitForTimeout(300);

    // Open the Squad tiered block
    const chevId = '#chev-TIER_TEST-Squad';
    const chevEl = await page.$(chevId);
    if (chevEl) {
      await page.click(chevId);
      await page.waitForTimeout(150);
    }

    // Verify per-tier "+ Variant" buttons exist in body (not in header)
    const bodyBtnCount = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#body-TIER_TEST-Squad button'))
        .filter(b => b.textContent.trim() === '+ Variant').length
    );
    assert('Tiered: per-tier "+ Variant" buttons in body', bodyBtnCount >= 2, `found ${bodyBtnCount}`);

    const headerBtnCount = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#chev-TIER_TEST-Squad'))
        .flatMap(el => Array.from(el.closest('.tpl-key-hdr').querySelectorAll('button')))
        .filter(b => b.textContent.trim() === '+ Variant').length
    );
    assert('Tiered: no "+ Variant" in tiered block header', headerBtnCount === 0, `found ${headerBtnCount} in header`);

    // Click first tier button → should add to Squad_0
    const s0Before = await page.evaluate(() => MODEL.groups['TIER_TEST'].templates.Squad_0.length);
    const s1Before = await page.evaluate(() => MODEL.groups['TIER_TEST'].templates.Squad_1.length);

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('#body-TIER_TEST-Squad button'))
        .filter(b => b.textContent.trim() === '+ Variant');
      btns[0]?.click();
    });
    await page.waitForTimeout(200);

    const s0After = await page.evaluate(() => MODEL.groups['TIER_TEST'].templates.Squad_0.length);
    const s1After = await page.evaluate(() => MODEL.groups['TIER_TEST'].templates.Squad_1.length);

    assert('Tiered: first tier btn adds to Squad_0',
      s0After === s0Before + 1, `Squad_0: ${s0Before}→${s0After}`);
    assert('Tiered: first tier btn does NOT touch Squad_1',
      s1After === s1Before, `Squad_1: ${s1Before}→${s1After}`);

    // Click second tier button → should add to Squad_1
    await page.evaluate(() => {
      // After re-render, find buttons again
      const btns = Array.from(document.querySelectorAll('#body-TIER_TEST-Squad button'))
        .filter(b => b.textContent.trim() === '+ Variant');
      btns[1]?.click();
    });
    await page.waitForTimeout(200);

    const s1After2 = await page.evaluate(() => MODEL.groups['TIER_TEST'].templates.Squad_1.length);
    assert('Tiered: second tier btn adds to Squad_1',
      s1After2 === s1Before + 1, `Squad_1: ${s1Before}→${s1After2}`);

    // Flat key (Team) must still have header-level "+ Variant" button
    const teamHdrBtn = await page.evaluate(() => {
      // Open Team block first
      const chev = document.getElementById('chev-TIER_TEST-Team');
      if (chev) {
        const hdr = chev.closest('.tpl-key-hdr');
        return Array.from(hdr.querySelectorAll('button'))
          .filter(b => b.textContent.trim() === '+ Variant').length;
      }
      return 0;
    });
    assert('Flat key (Team): header has "+ Variant" button', teamHdrBtn >= 1, `found ${teamHdrBtn}`);

    assert('Tier smoke: zero console errors', errors.length === 0, errors.join('; '));
    await page.screenshot({ path: 'tools/screenshots/tier_smoke.png' });
    console.log('  Screenshot saved: tier_smoke.png');
    await ctx.close();
  }

  await browser.close();

  console.log('\n--- Smoke Summary ---');
  console.log(`Passed: ${passed}  Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
})();
