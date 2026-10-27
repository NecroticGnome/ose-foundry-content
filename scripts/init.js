/**
 * @file Registers this module's rules pages with the system.
 */
Hooks.once("init", () => {
  if (CONFIG.OSE?.rulesReferences) {
    CONFIG.OSE.rulesReferences.primeRequisites =
      "Compendium.classicfantasycompendium.classic-fantasy-srd.JournalEntry.wREjcx8jyuN3ZofS.JournalEntryPage.737LRjy54HtTRWKg#prime-requisite";
  }
});
