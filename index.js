// Import statements
import { eventSource, event_types, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';

// Constants and Types
const CSS_THEME_STYLE_VAR = '--custom-theme-style-inputs';

const DEFAULT_CSS_TEMPLATE = `
:root {
  --custom-theme-style-inputs: [
  {
    "type": "slider",
    "varId": "customCSS-font-size",
    "displayText": "CustomCSS font size",
    "default": "5",
    "min": 0,
    "max": 32,
    "step": 1
  },
  {
    "type": "color",
    "varId": "customCSS-background",
    "displayText": "CustomCSS background",
    "default": "rgba(149, 78, 178, 40)"
  },
  {
    "type": "color",
    "varId": "customCSS-Drawer-iconColor",
    "displayText": "Drawer icon Color",
    "default": "rgba(19, 78, 78, 30)"
  },
  {
    "type": "text",
    "varId": "customAnimation-duration",
    "displayText": "animation duration",
    "default": "0.1s"
  },
  {
    "type": "select",
    "varId": "expressionVisibility",
    "displayText": "Expression Visibility",
    "default": "visible",
    "options": [
      {
        "label": "visible",
        "value": "visible"
      },
      {
        "label": "hidden",
        "value": "hidden"
      },
      {
        "label": "collapse",
        "value": "collapse"
      }
    ]
  },
  {
    "type": "select",
    "varId": "expressionWidth",
    "displayText": "Expression size",
    "default": "512px",
    "options": [
      {
        "label": "512px",
        "value": "512px"
      },
      {
        "label": "0px",
        "value": "0px"
      }
    ]
  }
]
}

/* !!! Exemples. If using slider always * 1(Unit) !!!*/
* {
    --animation-duration: calc(var(--customAnimation-duration) * 1s);
}

.expression-holder {
    width: var(--expressionWidth) !important;
    height: var(--expressionWidth) !important;
    min-width: var(--expressionWidth) !important;
    min-height: var(--expressionWidth) !important;
}

.drawer-icon {
    color: var(--customCSS-Drawer-iconColor) !important;
}

#expression-image {
    visibility: var(--expressionVisibility);
}

#customCSS {
    background: var(--customCSS-background);
    font-size: calc(var(--customCSS-font-size) * 1px);
}
`;

class CustomThemeSettingsManager {

    constructor() {
        this.settings = this.initializeSettings();
        this.previousStyleValue = null;
        this.isAppReady = false;
    }

    initializeSettings() {
        if (!extension_settings.CTSI) {
            extension_settings.CTSI = {};
        }
        return extension_settings.CTSI;
    }

    parseCSSField(cssVariable) {
        try {
            // Get the CSS value and handle empty cases
            const cssContent = getComputedStyle(document.documentElement).getPropertyValue(cssVariable);
            if (!cssContent) {
                console.log(`[CTSI] CSS variable ${cssVariable} is not defined, returning empty array`);
                return [];
            }
            const trimmedCssContent = cssContent.trim();
            if (!cssContent || cssContent === 'none' || cssContent === '""' || cssContent === "''") {
                console.log('[CTSI] No CSS content found, returning empty array');
                return [];
            }

            // Try to parse JSON
            const parsed = JSON.parse(cssContent);

            // Make sure we have an array
            if (!Array.isArray(parsed)) {
                console.log('[CTSI] CSS content is not an array, returning empty array');
                return [];
            }

            // Track seen varIds to prevent duplicates
            const seenVarIds = new Set();

            // Basic validation of entries and handle duplicates
            return parsed.filter(entry => {
                const isValid = entry.type && entry.varId && entry.displayText;

                if (!isValid) {
                    console.log(`[CTSI] Skipping invalid entry: missing required fields`, entry);
                    return false;
                }

                // Check for duplicate varId
                if (seenVarIds.has(entry.varId)) {
                    console.warn(`[CTSI] Duplicate varId found: ${entry.varId}. Only first occurrence will be used.`);
                    return false;
                }

                seenVarIds.add(entry.varId);
                return true;
            });

        } catch (error) {
            console.log(`[CTSI] Failed to parse ${cssVariable}:`, error);
            return [];
        }
    }

    updateCSSVariables(savedValues) {
        Object.entries(savedValues).forEach(([varId, value]) => {
            if (!varId || varId === 'undefined') return; // Skip invalid keys

            const unitKey = `${varId}-unit`;
            const unit = savedValues[unitKey] || ''; // Use unit if available
            const valueWithUnit = unit ? `${value}${unit}` : value; // Append unit if applicable

            // Ensure value is valid (e.g., avoid empty strings for required settings)
            if (valueWithUnit !== '') {
                document.documentElement.style.setProperty(`--${varId}`, valueWithUnit);
            }
        });
    }

    saveSettings(entries) {
        this.settings.entries = entries;
        this.updateCSSVariables(entries);
        saveSettingsDebounced();
        console.log('[CTSI] Settings saved:', this.settings);
    }

    initializeSettingsEntries(parsedEntries) {
        const currentVarIds = parsedEntries.map(entry => entry.varId);

        // Remove invalid or obsolete entries
        Object.keys(this.settings.entries || {}).forEach(key => {
            if (!currentVarIds.includes(key) || !key || key === 'undefined') {
                console.log(`[CTSI] Removing invalid/obsolete entry: ${key}`);
                delete this.settings.entries[key];
                document.documentElement.style.removeProperty(`--${key}`);
            }
        });

        // Initialize valid entries
        this.settings.entries = this.settings.entries || {};
        parsedEntries.forEach(entry => {
            if (!entry.varId || entry.varId === 'undefined') return; // Skip invalid varIds

            if (!this.settings.entries[entry.varId]) {
                if (entry.type === 'checkbox') {
                    this.settings.entries[entry.varId] = entry.checked || false;
                } else if (entry.type === 'select') {
                    const defaultOption = entry.options.find(opt => opt.value === entry.default) || entry.options[0];
                    this.settings.entries[entry.varId] = defaultOption.value;
                } else {
                    this.settings.entries[entry.varId] = entry.default || '';
                }
            }
        });
    }

    generateHTMLForEntry(entry, savedValue) {
        const value = savedValue !== undefined ? savedValue : entry.default;

        switch (entry.type) {
            case 'slider':
                return this.generateSliderEntry(entry, value);
            case 'color':
                return this.generateColorEntry(entry, value);
            case 'text':
                return this.generateTextEntry(entry, value);
            case 'checkbox':
                return this.generateCheckboxEntry(entry, value);
            case 'select':
                return this.generateSelectEntry(entry, value);
            default:
                console.warn(`[CTSI] Unknown entry type: ${entry.type}`);
                return '';
        }
    }

    generateSliderEntry(entry, value) {
        return `
            <div class="flex-container alignitemscenter">      
                <span data-i18n="${entry.displayText}">${entry.displayText}</span><br>
                <div class="alignitemscenter flex-container flexFlowColumn flexBasis48p flexGrow flexShrink gap0">
                    <input 
                        class="neo-range-slider" 
                        type="range" 
                        id="cts-slider-${entry.varId}" 
                        name="${entry.varId}" 
                        min="${entry.min}" 
                        max="${entry.max}" 
                        value="${value}" 
                        step="${entry.step || 1}">
                    <input 
                        class="neo-range-input" 
                        type="number" 
                        id="cts-number-${entry.varId}" 
                        name="${entry.varId}" 
                        min="${entry.min}" 
                        max="${entry.max}" 
                        value="${value}" 
                        step="${entry.step || 1}">
                </div>
            </div>`;
    }

    generateColorEntry(entry, value) {
        return `
            <div class="flex-container alignItemsBaseline">
                <span>${entry.displayText}</span>
                <toolcool-color-picker id="cts-${entry.varId}" color="${value}"></toolcool-color-picker>
            </div>`;
    }

    generateTextEntry(entry, value) {
        return `
            <label class="flex-container alignItemsBaseline">
                <span>${entry.displayText}</span><br>
                <input type="text" class="text_pole wide100p widthNatural flex1 margin0" id="cts-${entry.varId}" value="${value}" />
            </label>`;
    }

    generateCheckboxEntry(entry, value) {
        return `
            <label class="checkbox_label alignItemsBaseline">
                <span>${entry.displayText}</span>
                <input id="cts-${entry.varId}" type="checkbox" ${value ? 'checked' : ''}>
            </label>`;
    }

    generateSelectEntry(entry, value) {
        const options = entry.options.map(opt => `
            <option value="${opt.value}" ${opt.value === value ? 'selected' : ''}>
                ${opt.label}
            </option>`).join('');

        return `
            <div class="flex-container alignItemsBaseline">
                <span>${entry.displayText}</span>
                <select class="widthNatural flex1 margin0" id="cts-${entry.varId}">
                    ${options}
                </select>
            </div>`;
    }


    setupEventListeners(parsedEntries) {
        // Store references to the event handlers for later removal
        this.eventHandlers = this.eventHandlers || {};

        // Listen for input changes on sliders or range inputs
        const handleInputChange = (event) => {
            const $input = $(event.target);
            const value = $input.val();
            const varId = $input.attr('name'); // Ensure varId exists
            const isSlider = $input.hasClass('neo-range-slider');

            if (!varId || varId === 'undefined') return; // Skip invalid varId

            const $slider = isSlider ? $input : $(`#cts-slider-${varId}`);
            const $numberInput = isSlider ? $(`#cts-number-${varId}`) : $input;

            $slider.val(value);
            $numberInput.val(value);

            const unit = $(`#cts-unit-${varId}`).val() || ''; // Get the unit if applicable
            this.settings.entries[varId] = unit ? `${value}${unit}` : value; // Save value with unit if needed
            this.saveSettings(this.settings.entries);
            console.log(`[CTSI] ${varId} updated to: ${value}${unit}`);
        };

        const handleUnitChange = (event) => {
            const $select = $(event.target);
            const varId = $select.attr('id').replace('cts-unit-', ''); // Extract varId from the unit selector id
            const value = $(`#cts-number-${varId}`).val(); // Get the number value
            const unit = $select.val(); // Get the selected unit

            // Update the settings with the new value and unit
            this.settings.entries[varId] = `${value}${unit}`;
            this.saveSettings(this.settings.entries);
            console.log(`[CTSI] ${varId} unit updated to: ${value}${unit}`);
        };

        $(document).on('input', '.neo-range-slider, .neo-range-input', handleInputChange);
        $(document).on('change', '.unit-selector', handleUnitChange);

        // Store references to the event handlers for later removal
        this.eventHandlers.handleInputChange = handleInputChange;
        this.eventHandlers.handleUnitChange = handleUnitChange;

        parsedEntries.forEach(entry => {
            const inputElement = document.querySelector(`#cts-${entry.varId}`);
            if (!inputElement) return;

            const handleColorChange = (evt) => {
                const newColor = evt.detail.rgba;
                this.settings.entries[entry.varId] = newColor;
                this.saveSettings(this.settings.entries);
                console.log(`[CTSI] ${entry.varId} color changed to:`, newColor);
            };

            const handleInput = () => {
                const value = inputElement.type === 'checkbox' ? inputElement.checked : inputElement.value;
                this.settings.entries[entry.varId] = value;
                this.saveSettings(this.settings.entries);
                console.log(`[CTSI] ${entry.varId} changed to:`, value);
            };

            if (entry.type === 'color') {
                inputElement.addEventListener('change', handleColorChange);
                this.eventHandlers[`handleColorChange_${entry.varId}`] = handleColorChange;
            } else {
                inputElement.addEventListener('input', handleInput);
                this.eventHandlers[`handleInput_${entry.varId}`] = handleInput;
            }
        });
    }

    removeEventListeners() {
        if (this.eventHandlers) {
            $(document).off('input', '.neo-range-slider, .neo-range-input', this.eventHandlers.handleInputChange);
            $(document).off('change', '.unit-selector', this.eventHandlers.handleUnitChange);

            Object.keys(this.eventHandlers).forEach(key => {
                if (key.startsWith('handleColorChange_') || key.startsWith('handleInput_')) {
                    const varId = key.split('_')[1];
                    const inputElement = document.querySelector(`#cts-${varId}`);
                    if (inputElement) {
                        inputElement.removeEventListener('change', this.eventHandlers[key]);
                        inputElement.removeEventListener('input', this.eventHandlers[key]);
                    }
                }
            });

            this.eventHandlers = null;
        }
    }



    regenerateAndCleanSettings() {
      
        console.log('[CTSI]: Theme style changed, regenerating UI.');
        this.removeEventListeners();
        this.populateSettingsUI();
        this.saveSettings(this.settings.entries);

    }

    addSettings() {
        const html = `
            <div id="ctsi-drawer" class="inline-drawer wide100p flexFlowColumn">
                <div class="inline-drawer-toggle inline-drawer-header userSettingsInnerExpandable">
                    <b>Custom Theme Inputs</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div id="ctsi-drawer-content" style="font-size:small;">
                    <div class="flex-container ctsi-container inline-drawer-content flexFlowColumn">
                        <div class="flex-container ctsi-flex-container" >
                            <div id="cts-row-1" class="flex-container flexFlowColumn" style="flex: 1; flex-direction: column;">
                            </div>
                            <div id="cts-row-2" class="flex-container flexFlowColumn" style="flex: 1; flex-direction: column;">
                            </div>
                        </div>
                        <div class="flex-container ctsi-button-container">
                            <div id="ctsi-copy-to-clipboard" title="Copy to Clipboard" data-i18n="[title]Copy to Clipboard" class="menu_button margin0 interactable" tabindex="0">
                                <i class="fa-solid fa-copy"></i>
                            </div>
                            <div id="ctsi-update-customCSS" title="Update customCSS" data-i18n="[title]Update customCSS" class="menu_button margin0 interactable" tabindex="0">
                                <i class="fa-solid fa-save"></i>
                            </div>
                            <div id="ctsi-reset-defaults" title="Reset to Defaults" data-i18n="[title]Reset to Defaults" class="menu_button margin0 interactable" tabindex="0">
                                <i class="fa-solid fa-undo"></i>
                            </div>
                        </div>
                    </div>

                </div>
               
            </div>
            <hr>`;

        document.querySelector('[name="FontBlurChatWidthBlock"]')
            .insertAdjacentHTML('beforeend', html);

        this.populateSettingsUI();
        this.setupButtons();
    }

    setupButtons() {
        document.getElementById('ctsi-copy-to-clipboard').addEventListener('click', () => {
            const cssContent = this.generateCSSContent();
            navigator.clipboard.writeText(cssContent).then(() => {
                console.log('[CTSI] CSS content copied to clipboard');
            }).catch(err => {
                console.error('[CTSI] Failed to copy CSS content to clipboard:', err);
            });
        });
        
        document.getElementById('ctsi-update-customCSS').addEventListener('click', () => {
            try {
                const ROOT_BLOCK = ':root {';
                const cssContent = this.generateCSSContent();
                const customCSSArea = document.getElementById('customCSS');
        
                if (!customCSSArea || !cssContent) {
                    console.error('[CTSI] Missing CSS area or content');
                    return;
                }
        
                const existingContent = customCSSArea.value;
                const rootStart = existingContent.indexOf(ROOT_BLOCK);
                let updatedContent = existingContent;
        
                if (rootStart !== -1) {
                    let braceCount = 1;
                    let rootEnd = -1;
                    
                    for (let i = rootStart + ROOT_BLOCK.length; i < existingContent.length; i++) {
                        const char = existingContent[i];
                        if (char === '{') braceCount++;
                        else if (char === '}') braceCount--;
                        
                        if (braceCount === 0) {
                            rootEnd = i + 1;
                            break;
                        }
                    }
        
                    if (rootEnd !== -1) {
                        updatedContent = existingContent.slice(0, rootStart) + 
                                       existingContent.slice(rootEnd).trim();
                    }
                }
        
                customCSSArea.value = `${cssContent}\n${updatedContent}`;
                customCSSArea.dispatchEvent(new Event('input', { bubbles: true }));
                console.log('[CTSI] CSS content updated successfully');
            } catch (error) {
                console.error('[CTSI] Error updating CSS:', error);
            }
        });

        document.getElementById('ctsi-reset-defaults').addEventListener('click', () => {


            this.settings.entries = {};
            this.updateCSSVariables({});
            const parsedStyle = this.parseCSSField(CSS_THEME_STYLE_VAR);
            this.previousStyleValue = parsedStyle;
            this.regenerateAndCleanSettings();
            console.log('[CTSI] Settings reset to default values');
        });
    }

    generateCSSContent() {
        const entries = this.settings.entries;
        const cssEntries = Object.keys(entries).map(varId => {
            const entry = entries[varId];
            const parsedEntry = this.getParsedEntry(varId);
            return {
                type: parsedEntry.type,
                varId: varId,
                displayText: parsedEntry.displayText,
                default: entry,
                ...(parsedEntry.min !== undefined && { min: parsedEntry.min }),
                ...(parsedEntry.max !== undefined && { max: parsedEntry.max }),
                ...(parsedEntry.step !== undefined && { step: parsedEntry.step }),
                ...(parsedEntry.options !== undefined && { options: parsedEntry.options })
            };
        });

        return `:root {
  --custom-theme-style-inputs: ${JSON.stringify(cssEntries, null, 2)}
}`;
    }

    getParsedEntry(varId) {
        const parsedEntries = this.parseCSSField(CSS_THEME_STYLE_VAR);
        return parsedEntries.find(entry => entry.varId === varId) || {};
    }

    getEntryType(varId) {
        const parsedEntry = this.getParsedEntry(varId);
        return parsedEntry.type || 'text';
    }

    getEntryDisplayText(varId) {
        const parsedEntry = this.getParsedEntry(varId);
        return parsedEntry.displayText || varId;
    }


    setupInsertCSSButton() {
        document.getElementById('insert-css')?.addEventListener('click', () => {
            const customCSSArea = document.getElementById('customCSS');
            if (customCSSArea) {
                const existingContent = customCSSArea.value;
                customCSSArea.value = `${DEFAULT_CSS_TEMPLATE}\n${existingContent}`;
                
                const event = new Event('input', { bubbles: true });
                customCSSArea.dispatchEvent(event);
            }
        });
    }

    populateSettingsUI() {
        const row1 = document.querySelector('#cts-row-1');
        const row2 = document.querySelector('#cts-row-2');

        if (!row1 || !row2) {
            console.error('[CTSI] Row containers not found!');
            return;
        }

        const parsedEntries = this.parseCSSField(CSS_THEME_STYLE_VAR);
        if (!parsedEntries || parsedEntries.length === 0) {
            this.settings.entries = {};
            this.updateCSSVariables({});
            console.warn(`[CTSI] No custom style found in ${CSS_THEME_STYLE_VAR}`);

            // Show message when no entries are found
            row1.innerHTML = '<div class="flex-container flexFlowColumn"><p class="alert-message">No custom theme styles found. Click "Insert Default CSS Template" to add example styles.</p></div>';
            row2.innerHTML = '<button id="insert-css" class="menu_button menu_button_icon interactable flex1">Insert Default CSS Template</button>';
            this.setupInsertCSSButton();
            return;
        }

        this.initializeSettingsEntries(parsedEntries);

        row1.innerHTML = '';
        row2.innerHTML = '';

        parsedEntries.forEach((entry, index) => {
            const savedValue = this.settings.entries[entry.varId];
            const inputHTML = this.generateHTMLForEntry(entry, savedValue);

            if (index < parsedEntries.length / 2) {
                row1.insertAdjacentHTML('beforeend', inputHTML);
            } else {
                row2.insertAdjacentHTML('beforeend', inputHTML);
            }
        });

        this.setupEventListeners(parsedEntries);
    }

    initialize() {
        eventSource.on(event_types.APP_READY, () => {
            this.isAppReady = true;
            this.updateCSSVariables(this.settings.entries || {});
            this.addSettings();
        });

        eventSource.on(event_types.SETTINGS_UPDATED, () => {
            if (this.isAppReady) {
                const parsedStyle = this.parseCSSField(CSS_THEME_STYLE_VAR);
                const hasChanged = JSON.stringify(parsedStyle) !== JSON.stringify(this.previousStyleValue);
                if (hasChanged) {
                    this.previousStyleValue = parsedStyle;
                    this.regenerateAndCleanSettings();
                }
            } else {
                console.log('[CTSI] SETTINGS_UPDATED ignored because APP_READY has not been triggered yet.');
            }
        });
    }
}

// Initialize the theme settings manager
const customThemeManager = new CustomThemeSettingsManager();
customThemeManager.initialize();

export default customThemeManager;
