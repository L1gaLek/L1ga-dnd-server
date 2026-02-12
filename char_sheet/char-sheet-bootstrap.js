/* char_sheet/char-sheet-bootstrap.js
   Stable namespace + compatibility shims for split CharSheet modules.
   Goal: make split files behave like the old monolith by ensuring:
   - window.CharSheet exists early
   - modules attach ONLY to CharSheet.* (no relying on accidental globals)
   - safe fallbacks/stubs prevent hard crashes during partial load
*/
(function () {
  const CS = window.CharSheet = window.CharSheet || {};
  CS.utils = CS.utils || {};
  CS.dom = CS.dom || {};
  CS.db = CS.db || {};
  CS.tabs = CS.tabs || {};
  CS.spells = CS.spells || {};
  CS.bindings = CS.bindings || {};
  CS.modal = CS.modal || {};
  CS.viewmodel = CS.viewmodel || {};

  CS._log = CS._log || function () {};
  CS._warn = CS._warn || function () { try { console.warn.apply(console, arguments); } catch (_) {} };

  // Soft-stubs: if a module hasn't loaded yet, calls won't crash the whole UI.
  function stub(name, ret) {
    return function () { CS._warn('[CharSheet] Missing module function:', name); return ret; };
  }

  // Provide minimal defaults used across modules.
  CS.utils.escapeHtml = CS.utils.escapeHtml || (s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
  CS.utils.safeInt = CS.utils.safeInt || (v => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0; });

  CS.modal.openModal = CS.modal.openModal || stub('modal.openModal');
  CS.modal.closeModal = CS.modal.closeModal || stub('modal.closeModal');

  CS.tabs.renderBasicTab = CS.tabs.renderBasicTab || stub('tabs.renderBasicTab', '');
  CS.tabs.renderCombatTab = CS.tabs.renderCombatTab || stub('tabs.renderCombatTab', '');
  CS.tabs.renderSpellsTab = CS.tabs.renderSpellsTab || stub('tabs.renderSpellsTab', '');
  CS.tabs.renderInventoryTab = CS.tabs.renderInventoryTab || stub('tabs.renderInventoryTab', '');
  CS.tabs.renderNotesTab = CS.tabs.renderNotesTab || stub('tabs.renderNotesTab', '');

  CS.bindings.bindEditableInputs = CS.bindings.bindEditableInputs || stub('bindings.bindEditableInputs');
  CS.bindings.restoreUiStateToDom = CS.bindings.restoreUiStateToDom || stub('bindings.restoreUiStateToDom');
  CS.bindings.captureUiStateFromDom = CS.bindings.captureUiStateFromDom || stub('bindings.captureUiStateFromDom');

  // IMPORTANT: keep ONLY these two globals for integration points outside CharSheet:
  // - window.InfoModal (used by message-ui.js)
  // - window.CharSheet (namespace)
})();
