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

// Initialize UI (Nav, Header) when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', UI.initNavigation);
} else {
    UI.initNavigation();
}

console.log('AppUtils loaded via ES Modules wrapper.');
