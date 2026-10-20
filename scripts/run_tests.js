if (typeof global.requestAnimationFrame === 'undefined') {
  global.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
}
if (typeof global.cancelAnimationFrame === 'undefined') {
  global.cancelAnimationFrame = (id) => clearTimeout(id);
}

const path = require('path');
const createJiti = require('jiti');
const jiti = createJiti(__filename, {
  alias: {
    '@': path.resolve(__dirname, '../src'),
  },
});
async function run() {
  const resetModule = jiti('./test_reset.ts');
  if (resetModule && resetModule.testPromise) {
    await resetModule.testPromise;
  }
  const claimsModule = jiti('./test_claims.ts');
  if (claimsModule && claimsModule.testPromise) {
    await claimsModule.testPromise;
  }
  const clearModule = jiti('./test_clear.ts');
  if (clearModule && clearModule.testPromise) {
    await clearModule.testPromise;
  }
  const authNavModule = jiti('./test_auth_navigator.ts');
  if (authNavModule && authNavModule.testPromise) {
    await authNavModule.testPromise;
  }
  const superUserModule = jiti('./test_superuser.ts');
  if (superUserModule && superUserModule.testPromise) {
    await superUserModule.testPromise;
  }
  const securityModule = jiti('./test_security_p0_p1.ts');
  if (securityModule && securityModule.testPromise) {
    await securityModule.testPromise;
  }
  const buttonSwipeModule = jiti('./test_button_swipe_animation.ts');
  if (buttonSwipeModule && buttonSwipeModule.testPromise) {
    await buttonSwipeModule.testPromise;
  }
  const randomizationModule = jiti('./test_player_randomization.ts');
  if (randomizationModule && randomizationModule.testPromise) {
    await randomizationModule.testPromise;
  }
  const tradePackagesModule = jiti('./test_trade_packages.ts');
  if (tradePackagesModule && tradePackagesModule.testPromise) {
    await tradePackagesModule.testPromise;
  }
  const enhancementsModule = jiti('./test_selected_enhancements.ts');
  if (enhancementsModule && enhancementsModule.testPromise) {
    await enhancementsModule.testPromise;
  }
  const credsModule = jiti('./test_stored_credentials_resync.ts');
  if (credsModule && credsModule.testPromise) {
    await credsModule.testPromise;
  }
  const byeWeeksModule = jiti('./test_bye_weeks.ts');
  if (byeWeeksModule && byeWeeksModule.runByeWeekTests) {
    await byeWeeksModule.runByeWeekTests();
  }
  const deckPriorityModule = jiti('./test_potential_match_deck_priority.ts');
  if (deckPriorityModule && deckPriorityModule.testPromise) {
    await deckPriorityModule.testPromise;
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
