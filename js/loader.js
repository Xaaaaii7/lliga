// Backward Compatibility Loader
// Imports new ES Modules and exposes them globally as AppUtils

import * as Config from './modules/config.js';
import * as Utils from './modules/utils.js';
import * as Supabase from './modules/supabase-client.js';
import * as Auth from './modules/auth.js';
import * as UI from './modules/ui.js';
import * as Domain from './modules/domain.js';

// Expose configuration
window.SUPABASE_CONFIG = Config.SUPABASE_CONFIG;

// Combine all helpers into AppUtils
const AppUtils = {
    ...Utils,
    ...Supabase,
    ...Auth,
    ...Domain,
    // Add direct refs for convenience if they were used directly before (though common.js put them in AppUtils)
};

// Expose globally
window.AppUtils = AppUtils;

// Also expose individual helpers globally for backward compatibility (e.g. fmtDate, normalizeText)
Object.keys(AppUtils).forEach(key => {
    if (typeof window[key] === 'undefined') {
        window[key] = AppUtils[key];
    }
});

// Initialize UI (Nav, Header) when DOM is ready
// initNavigation es ahora async, así que necesitamos manejarlo correctamente
const initNav = () => {
    UI.initNavigation().catch(err => {
        console.error('Error inicializando navegación:', err);
    });
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNav);
} else {
    initNav();
}

console.log('AppUtils loaded via ES Modules wrapper.');
