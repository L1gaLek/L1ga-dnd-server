/* char_sheet/sheet-bridge-globals.js
   Purpose: Backward-compatibility bridge after splitting info-dnd-player.js into modules.
   Many modules still reference helpers as globals (e.g., renderBasicTab, getProfBonus, etc.).
   This bridge defines those globals as lazy proxies to window.CharSheet.* implementations.
*/
(function () {
  function getPath(root, path) {
    return path.split('.').reduce((acc, k) => (acc && acc[k] != null) ? acc[k] : undefined, root);
  }

  function makeProxy(path, { defaultReturn } = {}) {
    return function proxyFn() {
      const CS = window.CharSheet;
      const fn = CS ? getPath(CS, path) : undefined;
      if (typeof fn === 'function') {
        return fn.apply(this, arguments);
      }
      // If called too early or module missing, fail softly to avoid breaking the whole UI.
      if (defaultReturn !== undefined) return defaultReturn;
      console.warn('[CharSheet][bridge] Missing function:', path);
    };
  }

  function defineGlobal(name, valueOrFactory) {
    if (Object.prototype.hasOwnProperty.call(window, name) && window[name]) return;
    Object.defineProperty(window, name, {
      configurable: true,
      enumerable: false,
      get() {
        const v = (typeof valueOrFactory === 'function') ? valueOrFactory() : valueOrFactory;
        return v;
      },
      set(v) {
        Object.defineProperty(window, name, { value: v, writable: true, configurable: true });
      }
    });
  }

  // ---- utils ----
  defineGlobal('escapeHtml', () => makeProxy('utils.escapeHtml', { defaultReturn: '' }));
  defineGlobal('formatMod', () => makeProxy('utils.formatMod', { defaultReturn: '' }));
  defineGlobal('safeInt', () => makeProxy('utils.safeInt', { defaultReturn: 0 }));
  defineGlobal('numLike', () => makeProxy('utils.numLike', { defaultReturn: 0 }));
  defineGlobal('getByPath', () => makeProxy('utils.getByPath'));
  defineGlobal('setByPath', () => makeProxy('utils.setByPath'));
  defineGlobal('getProfBonus', () => makeProxy('utils.getProfBonus', { defaultReturn: 0 }));
  defineGlobal('extractLanguagesHint', () => makeProxy('utils.extractLanguagesHint', { defaultReturn: '' }));
  defineGlobal('normalizeLanguagesLearned', () => makeProxy('utils.normalizeLanguagesLearned', { defaultReturn: [] }));

  // ---- modal helpers ----
  defineGlobal('openModal', () => makeProxy('modal.openModal'));
  defineGlobal('closeModal', () => makeProxy('modal.closeModal'));
  defineGlobal('ensureWiredCloseHandlers', () => makeProxy('db.ensureWiredCloseHandlers'));
  defineGlobal('wireQuickBasicInteractions', () => makeProxy('db.wireQuickBasicInteractions'));

  // ---- tabs renderers ----
  defineGlobal('renderBasicTab', () => makeProxy('tabs.renderBasicTab', { defaultReturn: '' }));
  defineGlobal('renderCombatTab', () => makeProxy('tabs.renderCombatTab', { defaultReturn: '' }));
  defineGlobal('renderSpellsTab', () => makeProxy('tabs.renderSpellsTab', { defaultReturn: '' }));
  defineGlobal('renderInventoryTab', () => makeProxy('tabs.renderInventoryTab', { defaultReturn: '' }));
  defineGlobal('renderNotesTab', () => makeProxy('tabs.renderNotesTab', { defaultReturn: '' }));
  defineGlobal('updateCoinsTotal', () => makeProxy('tabs.updateCoinsTotal'));

  // ---- bindings ----
  defineGlobal('getUiState', () => makeProxy('bindings.getUiState'));
  defineGlobal('captureUiStateFromDom', () => makeProxy('bindings.captureUiStateFromDom'));
  defineGlobal('restoreUiStateToDom', () => makeProxy('bindings.restoreUiStateToDom'));
  defineGlobal('markModalInteracted', () => makeProxy('bindings.markModalInteracted'));
  defineGlobal('isModalBusy', () => makeProxy('bindings.isModalBusy', { defaultReturn: false }));
  defineGlobal('scheduleSheetSave', () => makeProxy('bindings.scheduleSheetSave'));

  defineGlobal('bindEditableInputs', () => makeProxy('bindings.bindEditableInputs'));
  defineGlobal('bindSkillBoostDots', () => makeProxy('bindings.bindSkillBoostDots'));
  defineGlobal('bindSaveProfDots', () => makeProxy('bindings.bindSaveProfDots'));
  defineGlobal('bindStatRollButtons', () => makeProxy('bindings.bindStatRollButtons'));
  defineGlobal('bindAbilityAndSkillEditors', () => makeProxy('bindings.bindAbilityAndSkillEditors'));

  // ---- tab binders ----
  defineGlobal('bindNotesEditors', () => makeProxy('tabs.bindNotesEditors'));
  defineGlobal('bindInventoryEditors', () => makeProxy('tabs.bindInventoryEditors'));
  defineGlobal('bindSlotEditors', () => makeProxy('spells.bindSlotEditors'));
  defineGlobal('bindSpellAddAndDesc', () => makeProxy('spells.bindSpellAddAndDesc'));
  defineGlobal('bindCombatEditors', () => makeProxy('tabs.bindCombatEditors'));
  defineGlobal('bindLanguagesUi', () => makeProxy('db.bindLanguagesUi'));

  // ---- constants ----
  defineGlobal('COIN_TO_CP', () => (window.CharSheet && window.CharSheet.bindings && window.CharSheet.bindings.COIN_TO_CP) || window.COIN_TO_CP);

  // Optionally expose some debug helpers
  window.__CharSheetBridgeReady = true;
})();
