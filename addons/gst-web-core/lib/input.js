/*eslint no-unused-vars: ["error", { "vars": "local" }]*/

import { GamepadManager } from './gamepad.js';
import { Queue } from './util.js';

/**
 * Map of known JavaScript keycodes which do not map to typable characters
 * to their X11 keysym equivalents.
 * @private
 */
const keycodeKeysyms = {
    8:   [0xFF08], // backspace
    9:   [0xFF09], // tab
    12:  [0xFF0B, 0xFF0B, 0xFF0B, 0xFFB5], // clear       / KP 5
    13:  [0xFF0D], // enter
    16:  [0xFFE1, 0xFFE1, 0xFFE2], // shift
    17:  [0xFFE3, 0xFFE3, 0xFFE4], // ctrl
    18:  [0xFFE9, 0xFFE9, 0xFFEA], // alt
    19:  [0xFF13], // pause/break
    20:  [0xFFE5], // caps lock
    27:  [0xFF1B], // escape
    32:  [0x0020], // space
    33:  [0xFF55, 0xFF55, 0xFF55, 0xFFB9], // page up     / KP 9
    34:  [0xFF56, 0xFF56, 0xFF56, 0xFFB3], // page down   / KP 3
    35:  [0xFF57, 0xFF57, 0xFF57, 0xFFB1], // end         / KP 1
    36:  [0xFF50, 0xFF50, 0xFF50, 0xFFB7], // home        / KP 7
    37:  [0xFF51, 0xFF51, 0xFF51, 0xFFB4], // left arrow  / KP 4
    38:  [0xFF52, 0xFF52, 0xFF52, 0xFFB8], // up arrow    / KP 8
    39:  [0xFF53, 0xFF53, 0xFF53, 0xFFB6], // right arrow / KP 6
    40:  [0xFF54, 0xFF54, 0xFF54, 0xFFB2], // down arrow  / KP 2
    45:  [0xFF63, 0xFF63, 0xFF63, 0xFFB0], // insert      / KP 0
    46:  [0xFFFF, 0xFFFF, 0xFFFF, 0xFFAE], // delete      / KP decimal
    91:  [0xFFE7], // left windows/command key (meta_l)
    92:  [0xFFE8], // right window/command key (meta_r)
    93:  [0xFF67], // menu key
    96:  [0xFFB0], // KP 0
    97:  [0xFFB1], // KP 1
    98:  [0xFFB2], // KP 2
    99:  [0xFFB3], // KP 3
    100: [0xFFB4], // KP 4
    101: [0xFFB5], // KP 5
    102: [0xFFB6], // KP 6
    103: [0xFFB7], // KP 7
    104: [0xFFB8], // KP 8
    105: [0xFFB9], // KP 9
    106: [0xFFAA], // KP multiply
    107: [0xFFAB], // KP add
    109: [0xFFAD], // KP subtract
    110: [0xFFAE], // KP decimal
    111: [0xFFAF], // KP divide
    112: [0xFFBE], // f1
    113: [0xFFBF], // f2
    114: [0xFFC0], // f3
    115: [0xFFC1], // f4
    116: [0xFFC2], // f5
    117: [0xFFC3], // f6
    118: [0xFFC4], // f7
    119: [0xFFC5], // f8
    120: [0xFFC6], // f9
    121: [0xFFC7], // f10
    122: [0xFFC8], // f11
    123: [0xFFC9], // f12
    144: [0xFF7F], // num lock
    145: [0xFF14], // scroll lock
    225: [0xFE03]  // altgraph (iso_level3_shift)
};

/**
 * Map of known JavaScript keyidentifiers / key values which do not map to typable
 * characters to their unshifted X11 keysym equivalents.
 * @private
 */
const keyidentifier_keysym = {
    "Again": [0xFF66],
    "AllCandidates": [0xFF3D],
    "Alphanumeric": [0xFF30],
    "Alt": [0xFFE9, 0xFFE9, 0xFFEA],
    "Attn": [0xFD0E],
    "AltGraph": [0xFE03],
    "ArrowDown": [0xFF54],
    "ArrowLeft": [0xFF51],
    "ArrowRight": [0xFF53],
    "ArrowUp": [0xFF52],
    "Backspace": [0xFF08],
    "CapsLock": [0xFFE5],
    "Cancel": [0xFF69],
    "Clear": [0xFF0B],
    "Convert": [0xFF23],
    "Copy": [0xFD15],
    "Crsel": [0xFD1C],
    "CrSel": [0xFD1C],
    "CodeInput": [0xFF37],
    "Compose": [0xFF20],
    "Control": [0xFFE3, 0xFFE3, 0xFFE4],
    "ContextMenu": [0xFF67],
    "Delete": [0xFFFF],
    "Down": [0xFF54],
    "End": [0xFF57],
    "Enter": [0xFF0D],
    "EraseEof": [0xFD06],
    "Escape": [0xFF1B],
    "Execute": [0xFF62],
    "Exsel": [0xFD1D],
    "ExSel": [0xFD1D],
    "F1": [0xFFBE],
    "F2": [0xFFBF],
    "F3": [0xFFC0],
    "F4": [0xFFC1],
    "F5": [0xFFC2],
    "F6": [0xFFC3],
    "F7": [0xFFC4],
    "F8": [0xFFC5],
    "F9": [0xFFC6],
    "F10": [0xFFC7],
    "F11": [0xFFC8],
    "F12": [0xFFC9],
    "F13": [0xFFCA],
    "F14": [0xFFCB],
    "F15": [0xFFCC],
    "F16": [0xFFCD],
    "F17": [0xFFCE],
    "F18": [0xFFCF],
    "F19": [0xFFD0],
    "F20": [0xFFD1],
    "F21": [0xFFD2],
    "F22": [0xFFD3],
    "F23": [0xFFD4],
    "F24": [0xFFD5],
    "Find": [0xFF68],
    "GroupFirst": [0xFE0C],
    "GroupLast": [0xFE0E],
    "GroupNext": [0xFE08],
    "GroupPrevious": [0xFE0A],
    "FullWidth": null,
    "HalfWidth": null,
    "HangulMode": [0xFF31],
    "Hankaku": [0xFF29],
    "HanjaMode": [0xFF34],
    "Help": [0xFF6A],
    "Hiragana": [0xFF25],
    "HiraganaKatakana": [0xFF27],
    "Home": [0xFF50],
    "Hyper": [0xFFED, 0xFFED, 0xFFEE],
    "Insert": [0xFF63],
    "JapaneseHiragana": [0xFF25],
    "JapaneseKatakana": [0xFF26],
    "JapaneseRomaji": [0xFF24],
    "JunjaMode": [0xFF38],
    "KanaMode": [0xFF2D],
    "KanjiMode": [0xFF21],
    "Katakana": [0xFF26],
    "Left": [0xFF51],
    "Meta": [0xFFE7, 0xFFE7, 0xFFE8],
    "ModeChange": [0xFF7E],
    "NonConvert": [0xFF22],
    "NumLock": [0xFF7F],
    "PageDown": [0xFF56],
    "PageUp": [0xFF55],
    "Pause": [0xFF13],
    "Play": [0xFD16],
    "PreviousCandidate": [0xFF3E],
    "PrintScreen": [0xFF61],
    "Redo": [0xFF66],
    "Right": [0xFF53],
    "Romaji": [0xFF24],
    "RomanCharacters": null,
    "Scroll": [0xFF14],
    "ScrollLock": [0xFF14],
    "Select": [0xFF60],
    "Separator": [0xFFAC],
    "Shift": [0xFFE1, 0xFFE1, 0xFFE2],
    "SingleCandidate": [0xFF3C],
    "Super": [0xFFEB, 0xFFEB, 0xFFEC],
    "Tab": [0xFF09],
    "UIKeyInputDownArrow": [0xFF54],
    "UIKeyInputEscape": [0xFF1B],
    "UIKeyInputLeftArrow": [0xFF51],
    "UIKeyInputRightArrow": [0xFF53],
    "UIKeyInputUpArrow": [0xFF52],
    "Up": [0xFF52],
    "Undo": [0xFF65],
    "Win": [0xFFE7, 0xFFE7, 0xFFE8],
    "Zenkaku": [0xFF28],
    "ZenkakuHankaku": [0xFF2A]
};

/**
 * All keysyms which should not repeat when held down.
 * @private
 */
const no_repeat = {
    0xFE03: true, // ISO Level 3 Shift (AltGr)
    0xFFE1: true, // Left shift
    0xFFE2: true, // Right shift
    0xFFE3: true, // Left ctrl
    0xFFE4: true, // Right ctrl
    0xFFE5: true, // Caps Lock
    0xFFE7: true, // Left meta
    0xFFE8: true, // Right meta
    0xFFE9: true, // Left alt
    0xFFEA: true, // Right alt
    0xFFEB: true, // Left super/hyper
    0xFFEC: true  // Right super/hyper
};

/**
 * Returns the keyboard location of the key associated with the given
 * keyboard event.
 * @private
 */
const getEventLocation = function getEventLocation(e) {
    if ('location' in e) return e.location;
    if ('keyLocation' in e) return e.keyLocation;
    return 0; // DOM_KEY_LOCATION_STANDARD
};

/**
 * Given an array of keysyms indexed by location, returns the keysym
 * for the given location, or the keysym for the standard location if
 * undefined.
 * @private
 */
const get_keysym = function get_keysym(keysyms, location) {
    if (!keysyms) return null;
    return keysyms[location] || keysyms[0];
};

/**
 * Returns true if the given keysym corresponds to a printable character,
 * false otherwise.
 * @private
 */
const isPrintable = function isPrintable(keysym) {
    return (keysym >= 0x00 && keysym <= 0xFF)
        || (keysym & 0xFFFF0000) === 0x01000000;
};

/**
 * Determines the keysym from a legacy keyIdentifier value.
 * @private
 */
function keysym_from_key_identifier(identifier, location, shifted) {
    if (!identifier) return null;

    var typedCharacter;

    // If identifier is U+xxxx, decode Unicode character
    var unicodePrefixLocation = identifier.indexOf("U+");
    if (unicodePrefixLocation >= 0) {
        var hex = identifier.substring(unicodePrefixLocation + 2);
        typedCharacter = String.fromCharCode(parseInt(hex, 16));
    }
    // If single character and not keypad, use that as typed character
    else if (identifier.length === 1 && location !== 3 /* DOM_KEY_LOCATION_NUMPAD */)
        typedCharacter = identifier;
    // Otherwise, look up corresponding keysym from table
    else
        return get_keysym(keyidentifier_keysym[identifier], location);

    // Alter case if necessary based on shift (heuristic)
    if (shifted === true)
        typedCharacter = typedCharacter.toUpperCase();
    else if (shifted === false)
        typedCharacter = typedCharacter.toLowerCase();

    // Get codepoint
    var codepoint = typedCharacter.charCodeAt(0);
    return keysym_from_charcode(codepoint);
}

/**
 * Returns true if the Unicode codepoint is a control character.
 * @private
 */
function isControlCharacter(codepoint) {
    return codepoint <= 0x1F || (codepoint >= 0x7F && codepoint <= 0x9F);
}

/**
 * Determines the keysym from a Unicode character code point.
 * @private
 */
function keysym_from_charcode(codepoint) {
    // Keysyms for control characters
    if (isControlCharacter(codepoint)) return 0xFF00 | codepoint;
    // Keysyms for ASCII chars
    if (codepoint >= 0x0000 && codepoint <= 0x00FF) return codepoint;
    // Keysyms for Unicode
    if (codepoint >= 0x0100 && codepoint <= 0x10FFFF) return 0x01000000 | codepoint;
    return null;
}

/**
 * Determines the keysym from a JavaScript keycode.
 * @private
 */
function keysym_from_keycode(keyCode, location) {
    return get_keysym(keycodeKeysyms[keyCode], location);
}

/**
 * Heuristically detects if the legacy keyIdentifier property looks incorrectly derived.
 * @private
 */
var key_identifier_sane = function key_identifier_sane(keyCode, keyIdentifier) {
    if (!keyIdentifier) return false;
    var unicodePrefixLocation = keyIdentifier.indexOf("U+");
    if (unicodePrefixLocation === -1) return true; // Assume non-Unicode is sane
    var codepoint = parseInt(keyIdentifier.substring(unicodePrefixLocation + 2), 16);
    if (keyCode !== codepoint) return true;
    // keyCode matches codepoint: Might be correct for A-Z, 0-9
    if ((keyCode >= 65 && keyCode <= 90) || (keyCode >= 48 && keyCode <= 57)) return true;
    // Otherwise, assume it's an incorrectly derived identifier
    return false;
};

/**
 * The state of all supported keyboard modifiers. (From Guacamole)
 * @private
 */
class ModifierState {
    constructor() {
        this.shift = false;
        this.ctrl = false;
        this.alt = false;
        this.meta = false;
        this.hyper = false; // Typically the "Windows" or "Super" key
    }

    static fromKeyboardEvent(e) {
        const state = new ModifierState();
        state.shift = e.shiftKey;
        state.ctrl = e.ctrlKey;
        state.alt = e.altKey;
        state.meta = e.metaKey;

        // Use DOM3 getModifierState() for others
        if (e.getModifierState) {
            // Note: "OS" is sometimes used for the Windows key, Super/Hyper are alternatives.
            state.hyper = e.getModifierState("OS")
                       || e.getModifierState("Super")
                       || e.getModifierState("Hyper")
                       || e.getModifierState("Win"); // Some browsers might use "Win"
        }
        return state;
    }
}


export class Input {
    /**
     * Input handling for WebRTC web application
     *
     * @constructor
     * @param {Element} [element] Video element to attach events to
     * @param {function} [send] Function used to send input events to server.
     */
    constructor(element, send) {
        /** @type {Element} */
        this.element = element;
        /** @type {function} */
        this.send = send;
        /** @type {boolean} */
        this.mouseRelative = false; // Should be managed by pointer lock status
        /** @type {Object} */
        this.m = null; // Window math cache
        /** @type {Integer} */
        this.buttonMask = 0; // Mouse button state
        /** @type {GamepadManager} */
        this.gamepadManager = null;
        /** @type {Integer} */
        this.x = 0; // Last mouse X
        /** @type {Integer} */
        this.y = 0; // Last mouse Y
        /** @type {function} */
        this.onmenuhotkey = null;
        /** @type {function} */
        this.onfullscreenhotkey = this.enterFullscreen;
        /** @type {function} */
        this.ongamepadconnected = null;
        /** @type {function} */
        this.ongamepaddisconneceted = null;
        /** @type {Array} */
        this.listeners = [];
        /** @type {Array} */
        this.listeners_context = [];
        /** @type {Object} */
        this._queue = new Queue(); // Mouse wheel threshold queue
        /** @type {boolean} */
        this._allowTrackpadScrolling = true;
        /** @type {boolean} */
        this._allowThreshold = true;
        /** @type {number} */
        this._smallestDeltaY = 10000;
        /** @type {number} */
        this._wheelThreshold = 100;
        /** @type {number} */
        this._scrollMagnitude = 10;
        /** @type {number|null} */
        this.cursorScaleFactor = null;

        // --- Guacamole Keyboard State ---
        /** @private @type {!number} */
        this._guacKeyboardID = Input._nextGuacID++;
        /** @private @type {!string} */
        this._EVENT_MARKER = '_GUAC_KEYBOARD_HANDLED_BY_' + this._guacKeyboardID;
        /** @private @type {!Object.<string, boolean>} */
        this._quirks = {
            keyupUnreliable: false,
            altIsTypableOnly: false,
            capsLockKeyupUnreliable: false
        };
        // Detect quirks
        if (navigator && navigator.platform) {
            if (navigator.platform.match(/ipad|iphone|ipod/i))
                this._quirks.keyupUnreliable = true;
            else if (navigator.platform.match(/^mac/i)) {
                this._quirks.altIsTypableOnly = true;
                this._quirks.capsLockKeyupUnreliable = true;
            }
        }
        /** @private @type {Array} */
        this._eventLog = [];
        /** @type {!ModifierState} */
        this.modifiers = new ModifierState();
        /** @type {!Object.<number, boolean>} */
        this.pressed = {}; // Keys currently held down (maps keysym -> true)
        /** @private @type {!Object.<number, boolean>} */
        this._implicitlyPressed = {}; // Keys pressed due to modifier sync
        /** @private @type {!Object.<number, boolean>} */
        this._last_keydown_sent = {}; // Track if keydown was sent (for preventDefault logic)
        /** @private @type {!Object.<number, number>} */
        this._recentKeysym = {}; // Maps keyCode -> last known keysym for keyup fallback
        /** @private @type {?number} */
        this._key_repeat_timeout = null;
        /** @private @type {?number} */
        this._key_repeat_interval = null;

        /** @type {boolean} Indicates if a composition is in progress. */
        this.isComposing = false;
        /** @type {string} Stores the current composition string. */
        this.compositionString = "";

        // --- Touch State ---
        /**
         * The identifier of the touch currently acting as the simulated
         * left mouse button. Null if no touch is active.
         * @private
         * @type {?number}
         */
        this._activeTouchIdentifier = null;
    }

    /** @private @type {number} */
    static _nextGuacID = 0;

    // --- Guacamole Internal Event Representation ---

    /** @private Base class for internal key events. */
    _KeyEvent(orig) {
        const now = new Date().getTime();
        return {
            keyCode: orig ? (orig.which || orig.keyCode) : 0,
            keyIdentifier: orig && orig.keyIdentifier, // Legacy
            key: orig && orig.key, // Standard
            location: orig ? getEventLocation(orig) : 0,
            modifiers: orig ? ModifierState.fromKeyboardEvent(orig) : new ModifierState(),
            timestamp: now,
            defaultPrevented: false, // Whether we decided to prevent default for this
            keysym: null, // Best guess keysym
            reliable: false, // Is the keysym guess reliable?
            getAge: () => new Date().getTime() - now,
        };
    }

    /** @private Represents a keydown event. */
    _KeydownEvent(orig) {
        const keyEvent = this._KeyEvent(orig);
        keyEvent._internalType = 'keydown';

        // Determine initial keysym guess (prefer standard 'key' if available)
        keyEvent.keysym = keysym_from_key_identifier(keyEvent.key, keyEvent.location) // Try standard 'key' first
                       || keysym_from_keycode(keyEvent.keyCode, keyEvent.location);

        keyEvent.keyupReliable = !this._quirks.keyupUnreliable;

        // DOM3 'key' and keyCode are reliable sources if the corresponding key is not printable
        if (keyEvent.keysym && !isPrintable(keyEvent.keysym)) {
            keyEvent.reliable = true;
        }

        // Use legacy keyIdentifier as a last resort, if it looks sane
        if (!keyEvent.keysym && key_identifier_sane(keyEvent.keyCode, keyEvent.keyIdentifier)) {
            keyEvent.keysym = keysym_from_key_identifier(keyEvent.keyIdentifier, keyEvent.location, keyEvent.modifiers.shift);
        }

        // Handle quirks affecting reliability and keyup
        if (keyEvent.modifiers.meta && keyEvent.keysym !== 0xFFE7 && keyEvent.keysym !== 0xFFE8) { // Meta L/R
             // Chrome Meta bug: keyup might not fire
            keyEvent.keyupReliable = false;
        } else if (keyEvent.keysym === 0xFFE5 && this._quirks.capsLockKeyupUnreliable) { // Caps Lock
            keyEvent.keyupReliable = false;
        }

        // Determine if AltGr might be in use (treat Alt on Mac as potentially AltGr)
        if (this._quirks.altIsTypableOnly && (keyEvent.keysym === 0xFFE9 || keyEvent.keysym === 0xFFEA)) { // Alt L/R
            keyEvent.keysym = 0xFE03; // AltGr
        }

        // Determine if default prevention might be needed (important for modifier combos)
        const prevent_alt = !keyEvent.modifiers.ctrl && !this._quirks.altIsTypableOnly;
        const prevent_ctrl = !keyEvent.modifiers.alt;

        // If default prevention is important (modifier combos), treat the event as reliable enough to act on
        if ((prevent_ctrl && keyEvent.modifiers.ctrl)
         || (prevent_alt  && keyEvent.modifiers.alt)
         || keyEvent.modifiers.meta
         || keyEvent.modifiers.hyper) {
            keyEvent.reliable = true;
        }

        // Record most recently known keysym by associated key code
        if (keyEvent.keysym !== null) {
             this._recentKeysym[keyEvent.keyCode] = keyEvent.keysym;
        }

        return keyEvent;
    }

    /** @private Represents a keypress event. */
    _KeypressEvent(orig) {
        const keyEvent = this._KeyEvent(orig);
        keyEvent._internalType = 'keypress';
        // Pull keysym from char code (keyCode holds charCode in keypress)
        keyEvent.keysym = keysym_from_charcode(keyEvent.keyCode);
        keyEvent.reliable = true; // Keypress is considered reliable for character
        return keyEvent;
    }

    /** @private Represents a keyup event. */
    _KeyupEvent(orig) {
        const keyEvent = this._KeyEvent(orig);
        keyEvent._internalType = 'keyup';
        // Determine keysym (prefer standard 'key', fallback to keyCode)
        keyEvent.keysym = keysym_from_key_identifier(keyEvent.key, keyEvent.location)
                       || keysym_from_keycode(keyEvent.keyCode, keyEvent.location);

        // Fall back to the most recently pressed keysym associated with the
        // keyCode if the inferred key doesn't seem to actually be pressed now
        // or if the keysym is null.
        if (keyEvent.keysym === null || !this.pressed[keyEvent.keysym]) {
            const recent = this._recentKeysym[keyEvent.keyCode];
            if (recent !== undefined) {
                keyEvent.keysym = recent;
            }
        }

        keyEvent.reliable = true; // Keyup is as reliable as it gets for releasing
        return keyEvent;
    }


    /**
     * Marks a key as pressed, sending the keydown event. Manages key repeat.
     * Returns true if the event WAS sent (used for preventDefault logic), false otherwise.
     * @private
     */
    _guac_press(keysym) {
        if (keysym === null) return false; // Cannot press null keysym

        // Only press if released
        if (!this.pressed[keysym]) {
            this.pressed[keysym] = true;
            delete this._implicitlyPressed[keysym]; // Explicit press overrides implicit

            // --- Send key event ---
            this.send("kd," + keysym);
            this._last_keydown_sent[keysym] = true; // Mark that we sent it

            // --- Stop any current repeat ---
            window.clearTimeout(this._key_repeat_timeout);
            window.clearInterval(this._key_repeat_interval);

            // --- Start repeat after a delay if not a modifier/special key ---
            if (!no_repeat[keysym]) {
                this._key_repeat_timeout = window.setTimeout(() => {
                    this._key_repeat_interval = window.setInterval(() => {
                        // Simulate release and press for repeat
                        if (this.pressed[keysym]) { // Check if still pressed
                            this.send("ku," + keysym);
                            // Wait a tiny moment before resending keydown for repeat
                            window.setTimeout(() => {
                                if (this.pressed[keysym]) { // Check again
                                    this.send("kd," + keysym);
                                }
                            }, 10); // Adjust delay if needed
                        } else {
                             window.clearInterval(this._key_repeat_interval); // Stop if released
                        }
                    }, 50); // Repeat interval
                }, 500); // Initial repeat delay
            }

            return true; // Event was sent
        }

        // Key already pressed, check if last keydown was sent (for preventDefault on repeats)
        return this._last_keydown_sent[keysym] || false;
    }

    /**
     * Marks a key as released, sending the keyup event. Stops key repeat.
     * @private
     */
    _guac_release(keysym) {
        if (keysym === null) return; // Cannot release null

        // Only release if pressed
        if (this.pressed[keysym]) {
            delete this.pressed[keysym];
            delete this._implicitlyPressed[keysym];
            delete this._last_keydown_sent[keysym]; // Clear sent status

            // Stop repeat timers
            window.clearTimeout(this._key_repeat_timeout);
            window.clearInterval(this._key_repeat_interval);
            this._key_repeat_timeout = null;
            this._key_repeat_interval = null;


            // --- Send key event ---
            this.send("ku," + keysym);
        }
    }

    /**
     * Resets the keyboard state, releasing all keys. (Adapted from Guacamole)
     */
    resetKeyboard() {
        // Release all pressed keys
        for (const keysymStr in this.pressed) {
            // Prevent infinite loops if release causes issues
            if (this.pressed[keysymStr]) {
                this._guac_release(parseInt(keysymStr, 10));
            }
        }

        // Clear related state
        this.pressed = {};
        this._implicitlyPressed = {};
        this._last_keydown_sent = {};
        this._recentKeysym = {};
        this._eventLog = [];
        this.modifiers = new ModifierState();

        // Stop any lingering repeat timers
        window.clearTimeout(this._key_repeat_timeout);
        window.clearInterval(this._key_repeat_interval);
        this._key_repeat_timeout = null;
        this._key_repeat_interval = null;
    }

    /**
     * Updates internal modifier state based on event flags, pressing/releasing
     * modifier keys implicitly if needed.
     * @private
     */
    _guac_updateModifierState(modifierName, keysyms, keyEvent) {
        const localState = keyEvent.modifiers[modifierName];
        const remoteState = this.modifiers[modifierName];

        // Don't trust changes for the key *causing* the event
        if (keysyms.indexOf(keyEvent.keysym) !== -1) {
            return;
        }

        // Implicit release?
        if (remoteState && localState === false) {
            for (const keysym of keysyms) {
                this._guac_release(keysym);
            }
        }
        // Implicit press?
        else if (!remoteState && localState === true) {
            // Check if *any* key for this modifier is already explicitly pressed
            let alreadyPressed = false;
            for (const keysym of keysyms) {
                if (this.pressed[keysym] && !this._implicitlyPressed[keysym]) {
                     alreadyPressed = true;
                     break;
                }
            }
            if (alreadyPressed) return; // Don't implicitly press if already down

            // Press the primary keysym for the modifier
            const primaryKeysym = keysyms[0];
             // Mark as implicitly pressed only if the event wasn't *just* for the modifier itself
            if (keyEvent.keysym && keysyms.indexOf(keyEvent.keysym) === -1) {
                 this._implicitlyPressed[primaryKeysym] = true;
            }
            this._guac_press(primaryKeysym); // This will send kd if not already pressed
        }
    }

    /**
     * Syncs all modifier states based on a key event.
     * @private
     */
    _guac_syncModifierStates(keyEvent) {
        this._guac_updateModifierState('alt',   [0xFFE9, 0xFFEA, 0xFE03], keyEvent); // Alt, AltGr
        this._guac_updateModifierState('shift', [0xFFE1, 0xFFE2], keyEvent);         // Shift
        this._guac_updateModifierState('ctrl',  [0xFFE3, 0xFFE4], keyEvent);         // Ctrl
        this._guac_updateModifierState('meta',  [0xFFE7, 0xFFE8], keyEvent);         // Meta (Cmd/Win)
        this._guac_updateModifierState('hyper', [0xFFEB, 0xFFEC], keyEvent);         // Hyper/Super (Win)

        // Update the canonical state *after* processing changes
        this.modifiers = keyEvent.modifiers;
    }

    /**
     * Checks if all currently pressed keys were implicitly pressed.
     * @private
     */
    _guac_isStateImplicit() {
        for (const keysym in this.pressed) {
            if (!this._implicitlyPressed[keysym]) {
                return false;
            }
        }
        // Only return true if there *are* pressed keys, and all are implicit
        return Object.keys(this.pressed).length > 0;
    }


    /**
     * Releases Ctrl+Alt if they seem to be simulating AltGr.
     * @private
     */
    _guac_release_simulated_altgr(keysym) {
        // Requires Ctrl+Alt to be down according to our *current* state
        if (!this.modifiers.ctrl || !this.modifiers.alt) return;

        // Heuristic: Assume AltGr isn't needed for basic A-Z
        if ((keysym >= 0x0041 && keysym <= 0x005A) || (keysym >= 0x0061 && keysym <= 0x007A)) {
            return;
        }

        // If the target keysym looks printable, release Ctrl/Alt
        if (isPrintable(keysym)) {
            this._guac_release(0xFFE3); // Left ctrl
            this._guac_release(0xFFE4); // Right ctrl
            this._guac_release(0xFFE9); // Left alt
            this._guac_release(0xFFEA); // Right alt
        }
    }

    /**
     * Interprets the next available event(s) in the log.
     * Returns the processed event object (or null if none processed).
     * The event object has `defaultPrevented` set based on processing outcome.
     * @private
     */
    _guac_interpret_event() {
        const first = this._eventLog[0];
        if (!first) return null;

        let accepted_events = [];
        let keysym = null;
        let event_processed = null; // Keep track of the primary event processed

        // --- Keydown Event ---
        if (first._internalType === 'keydown') {
            event_processed = first;

            // Defer handling of Meta until context is known (might be shortcut vs. modifier)
            if (first.keysym === 0xFFE7 || first.keysym === 0xFFE8) { // Meta L/R
                if (this._eventLog.length === 1) return null; // Need more context

                const next = this._eventLog[1];
                // Corrected check: Use _internalType, not instanceof
                if (next.keysym !== first.keysym) { // Meta followed by different key
                    if (!next.modifiers.meta) { // If Meta flag isn't set on next event, drop this Meta press
                        return this._eventLog.shift(); // Consume and discard
                    }
                    // Otherwise (Meta flag IS set), treat Meta as a modifier - proceed below
                } else if (next && next._internalType === 'keydown') { // Meta followed by another Meta keydown (repeat?) - drop this one
                    return this._eventLog.shift(); // Consume and discard
                }
                // Else (Meta followed by keypress/keyup) - proceed below
            }


            // If event itself is reliable, use its keysym
            if (first.reliable) {
                keysym = first.keysym;
                accepted_events = this._eventLog.splice(0, 1);
            }
            // If keydown followed by keypress, use keypress keysym (more reliable for chars)
            else if (this._eventLog[1] && this._eventLog[1]._internalType === 'keypress') {
                keysym = this._eventLog[1].keysym;
                accepted_events = this._eventLog.splice(0, 2); // Consume both
            }
            // If keydown followed by something else (keyup, or another keydown),
            // we must handle this keydown now with its best-guess keysym.
            else if (this._eventLog[1]) {
                keysym = first.keysym;
                accepted_events = this._eventLog.splice(0, 1);
            }
            // Else: Only a single unreliable keydown event in the log. Wait for more.
            else {
                 return null;
            }

            // Process the determined keysym if we consumed events
            if (accepted_events.length > 0) {
                this._guac_syncModifierStates(first); // Sync modifiers based on the keydown event

                if (keysym !== null) {
                    this._guac_release_simulated_altgr(keysym); // Handle simulated AltGr case
                    const sent = this._guac_press(keysym); // Press the key (sends kd)

                    // Mark defaultPrevented based on whether we sent the key
                    // Guacamole's logic returns !result_of_onkeydown. We return !sent.
                    event_processed.defaultPrevented = sent;

                    // Update recent keysym mapping
                    this._recentKeysym[first.keyCode] = keysym;

                    // Release immediately if keyup is unreliable
                    if (!first.keyupReliable) {
                        this._guac_release(keysym);
                    }
                } else {
                     // No valid keysym determined, but event was consumed. Don't prevent default.
                     event_processed.defaultPrevented = false;
                }
                return event_processed; // Return the processed keydown event
            }
        } // --- End Keydown ---

        // --- Keyup Event ---
        else if (first._internalType === 'keyup') {
             event_processed = first;
             if (!this._quirks.keyupUnreliable) {
                 keysym = first.keysym;
                 if (keysym !== null) {
                     this._guac_release(keysym);
                     delete this._recentKeysym[first.keyCode]; // Clear recent mapping on release
                     // We generally prevent default on keyup if we handle it
                     event_processed.defaultPrevented = true;
                 } else {
                     // Unknown keyup, reset state
                     this.resetKeyboard();
                     event_processed.defaultPrevented = true;
                 }
                 this._guac_syncModifierStates(first); // Sync modifiers on keyup too
                 this._eventLog.shift(); // Consume the event
                 return event_processed;
             } else {
                 // Unreliable keyup - just discard
                 this._eventLog.shift();
                 return event_processed; // Return it, but defaultPrevented will be false
             }
        } // --- End Keyup ---

        // --- Other Events (like standalone Keypress) ---
        else {
            // Ignore / discard other event types if they somehow end up at the front
             event_processed = this._eventLog.shift();
             if (event_processed) event_processed.defaultPrevented = false;
             return event_processed;
        }

        // No event interpreted yet (likely waiting for more events)
        return null;
    }

    /**
     * Processes the event log, interpreting as many events as possible.
     * Returns true if the default action of the *last* processed event
     * should be prevented, false otherwise.
     * @private
     */
    _guac_interpret_events() {
        let last_event_processed = null;
        let current_event_processed;

        do {
            // Need to pass `this` context if _Key*Event are not bound or arrow functions
            // Binding them in the constructor or using arrow functions avoids this.
            // Let's assume they are defined such that `this` works (e.g., within constructor scope).
            current_event_processed = this._guac_interpret_event();
            if (current_event_processed) {
                last_event_processed = current_event_processed;
            }
        } while (current_event_processed !== null);

        // Reset keyboard state if we cannot expect any further keyup events
        // because all pressed keys were implicitly added by modifier sync.
        if (this._guac_isStateImplicit()) {
            this.resetKeyboard();
        }

        // Return whether the last processed event should prevent default
        return last_event_processed ? last_event_processed.defaultPrevented : false;
    }

    /**
     * Marks an event as handled by this Input instance to prevent reprocessing.
     * Returns true if marked successfully, false if already marked.
     * @private
     */
    _guac_markEvent(e) {
        if (e[this._EVENT_MARKER]) {
            return false;
        }
        e[this._EVENT_MARKER] = true;
        return true;
    }


    /**
     * Handles keydown events using the Guacamole interpretation logic.
     * @param {KeyboardEvent} event
     * @private
     */
    _handleKeyDown(event) {
        const keyboardInputAssist = document.getElementById('keyboard-input-assist');
        if (event.target === keyboardInputAssist) {
            // Let the hidden input handle this event naturally
            console.log("Ignoring keydown event targeted at keyboard-input-assist.");
            return;
        }
        // Ignore events if composing (handled by composition events)
        if (this.isComposing) return;

        // Prevent double handling
        if (!this._guac_markEvent(event)) return;


        // --- Menu/Fullscreen Hotkeys ---
        // Handle these *before* sending keys if they match
        if (event.code === 'KeyM' && event.ctrlKey && event.shiftKey) {
            if (document.fullscreenElement === null && this.onmenuhotkey !== null) {
                this.onmenuhotkey();
                event.preventDefault(); // Prevent 'm' key press
                return; // Stop further processing
            }
        }
        if (event.code === 'KeyF' && event.ctrlKey && event.shiftKey) {
            if (document.fullscreenElement === null && this.onfullscreenhotkey !== null) {
                this.onfullscreenhotkey();
                event.preventDefault(); // Prevent 'f' key press
                return; // Stop further processing
            }
        }
        // --- End Hotkey Handling ---

        // Ignore the event if explicitly marked as composing (redundant check?)
        // or when the "composition" keycode (229) is sent by some browsers during IME input.
        if (event.isComposing || event.keyCode === 229) {
            return; // Don't log or process IME-related keydown noise
        }

        // Create internal event representation
        const keydownEvent = this._KeydownEvent(event); // Use 'this' scope

        // Log event
        this._eventLog.push(keydownEvent);

        // Interpret events and prevent default if interpretation indicates it
        if (this._guac_interpret_events()) {
            event.preventDefault();
        }
    }

    /**
     * Handles keypress events using the Guacamole interpretation logic.
     * @param {KeyboardEvent} event
     * @private
     */
    _handleKeyPress(event) {
        // Ignore events if composing
        if (this.isComposing) return;

        // Prevent double handling
        if (!this._guac_markEvent(event)) return;

        // Ignore composition keycode
        if (event.keyCode === 229) return;

        // Create internal event representation
        const keypressEvent = this._KeypressEvent(event); // Use 'this' scope

        // Log event
        this._eventLog.push(keypressEvent);

        // Interpret events and prevent default if interpretation indicates it
        if (this._guac_interpret_events()) {
            event.preventDefault();
        }
    }

    /**
     * Handles keyup events using the Guacamole interpretation logic.
     * @param {KeyboardEvent} event
     * @private
     */
    _handleKeyUp(event) {
        // Ignore events if composing
        if (this.isComposing) return;

        // Prevent double handling
        if (!this._guac_markEvent(event)) return;

        // Ignore composition keycode
        if (event.keyCode === 229) return;

        // Create internal event representation
        const keyupEvent = this._KeyupEvent(event); // Use 'this' scope

        // Log event
        this._eventLog.push(keyupEvent);

        // The interpret function returns true if the *last* event (which would be this keyup)
        // decided to prevent default.
        if(this._guac_interpret_events()) {
             event.preventDefault();
        }
    }


    _compositionStart(event) {
        // Prevent double handling
        if (!this._guac_markEvent(event)) return;

        this.isComposing = true;
        this.compositionString = "";
        this.send("co,start");
    }

    _compositionUpdate(event) {
         // Prevent double handling
        if (!this._guac_markEvent(event)) return;

        if (!this.isComposing) return;

        if (event.data) {
            this.compositionString = event.data;
        }
        this.send("co,update," + this.compositionString);
    }

    _compositionEnd(event) {
         // Prevent double handling
        if (!this._guac_markEvent(event)) return;

        this.isComposing = false;
        if (event.data) {
            this.compositionString = event.data;
        }
        this.send("co,end," + this.compositionString);

        // if the server expects individual key presses for composed text.
        // If the server handles the "co,end,text" message directly, remove this.
        if (this.compositionString) {
            this._typeString(this.compositionString);
        }

        this.compositionString = "";
    }

    /**
     * Presses and releases keys to type a string (e.g., from composition end).
     * @param {string} str String to type.
     * @private
     */
    _typeString(str) {
        for (let i = 0; i < str.length; i++) {
            // Use codePointAt for proper Unicode handling if needed
            const codepoint = str.codePointAt ? str.codePointAt(i) : str.charCodeAt(i);
            if (codepoint === undefined) continue;

            const keysym = keysym_from_charcode(codepoint);

            if (keysym !== null) {
                 // Simulate press/release - use internal methods directly
                 const sent = this._guac_press(keysym);
                 // We need a slight delay or a way to ensure release happens after press
                 if (sent) {
                     setTimeout(() => this._guac_release(keysym), 5);
                 }
            }
            // Handle multi-byte characters from codePointAt if necessary
             if (codepoint > 0xFFFF) i++;
        }
    }


    _mouseButtonMovement(event) {
        const down = (event.type === 'mousedown' ? 1 : 0);
        var mtype = "m"; // Default message type for absolute coordinates
        let canvas = document.getElementById('videoCanvas'); // Assuming canvas ID

        // Pointer Lock Hotkey
        if (down && event.button === 0 && event.ctrlKey && event.shiftKey) {
            // Check if target supports requestPointerLock (might be window/document)
            const targetElement = event.target.requestPointerLock ? event.target : this.element;
            targetElement.requestPointerLock().catch(err => console.error("Pointer lock failed:", err));
            event.preventDefault(); // Prevent default action of the click
            return;
        }

        // --- Coordinate Calculation ---
        if (document.pointerLockElement === this.element || document.pointerLockElement === canvas) {
            mtype = "m2"; // Relative coordinates

            // Relative Movement Calculation
            let movementX = event.movementX || 0;
            let movementY = event.movementY || 0;

            if (window.isManualResolutionMode && canvas) {
                // Apply scaling if needed for manual mode
                const canvasRect = canvas.getBoundingClientRect();
                if (canvasRect.width > 0 && canvasRect.height > 0 && canvas.width > 0 && canvas.height > 0) {
                    const scaleX = canvas.width / canvasRect.width;
                    const scaleY = canvas.height / canvasRect.height;
                    this.x = Math.round(movementX * scaleX);
                    this.y = Math.round(movementY * scaleY);
                } else {
                    this.x = movementX; // Fallback
                    this.y = movementY;
                }
            } else {
                 // Auto-resize mode scaling
                if (this.cursorScaleFactor != null) {
                    this.x = Math.trunc(movementX * this.cursorScaleFactor);
                    this.y = Math.trunc(movementY * this.cursorScaleFactor);
                } else {
                    this.x = movementX;
                    this.y = movementY;
                }
            }

        } else if (event.type === 'mousemove') {
            // Absolute Position Calculation
             if (window.isManualResolutionMode && canvas) {
                const canvasRect = canvas.getBoundingClientRect();
                if (canvasRect.width > 0 && canvasRect.height > 0 && canvas.width > 0 && canvas.height > 0) {
                    const mouseX_on_canvas = event.clientX - canvasRect.left;
                    const mouseY_on_canvas = event.clientY - canvasRect.top;
                    const scaleX = canvas.width / canvasRect.width;
                    const scaleY = canvas.height / canvasRect.height;
                    let serverX = mouseX_on_canvas * scaleX;
                    let serverY = mouseY_on_canvas * scaleY;
                    this.x = Math.max(0, Math.min(canvas.width, Math.round(serverX)));
                    this.y = Math.max(0, Math.min(canvas.height, Math.round(serverY)));
                } else {
                    this.x = 0; this.y = 0; // Fallback
                }
            } else {
                // Auto-resize mode absolute
                if (!this.m && event.type === 'mousemove') {
                    // Calculate math if needed and not yet done
                    this._windowMath();
                }
                if (this.m) {
                    this.x = this._clientToServerX(event.clientX);
                    this.y = this._clientToServerY(event.clientY);
                } else {
                    this.x = 0; this.y = 0; // Fallback if math failed
                }
            }
        }

        // Button Mask Update
        if (event.type === 'mousedown' || event.type === 'mouseup') {
            var mask = 1 << event.button;
            if (down) {
                this.buttonMask |= mask;
            } else {
                this.buttonMask &= ~mask;
            }
        }

        // Send Message
        var toks = [ mtype, this.x, this.y, this.buttonMask, 0 ]; // Wheel delta is 0
        this.send(toks.join(","));
    }

    /**
     * Calculates the server coordinates based on client touch coordinates.
     * Stores the result in `this.x` and `this.y`.
     * @private
     * @param {Touch} touchPoint - The browser Touch object.
     */
    _calculateTouchCoordinates(touchPoint) {
        let canvas = document.getElementById('videoCanvas'); // Assuming canvas ID
        if (window.isManualResolutionMode && canvas) {
            const canvasRect = canvas.getBoundingClientRect();
            if (canvasRect.width > 0 && canvasRect.height > 0 && canvas.width > 0 && canvas.height > 0) {
                const touchX_on_canvas = touchPoint.clientX - canvasRect.left;
                const touchY_on_canvas = touchPoint.clientY - canvasRect.top;
                const scaleX = canvas.width / canvasRect.width;
                const scaleY = canvas.height / canvasRect.height;
                let serverX = touchX_on_canvas * scaleX;
                let serverY = touchY_on_canvas * scaleY;
                this.x = Math.max(0, Math.min(canvas.width, Math.round(serverX)));
                this.y = Math.max(0, Math.min(canvas.height, Math.round(serverY)));
            } else {
                this.x = 0; this.y = 0; // Fallback
            }
        } else {
            // Auto-resize mode
            if (!this.m) this._windowMath(); // Calculate math if needed
            if (this.m) {
                this.x = this._clientToServerX(touchPoint.clientX);
                this.y = this._clientToServerY(touchPoint.clientY);
            } else {
                this.x = 0; this.y = 0; // Fallback
            }
        }
    }

    /**
     * Sends the current mouse state (coordinates and button mask).
     * @private
     */
    _sendMouseState() {
        // Touch always uses absolute coordinates for mouse simulation
        const mtype = "m";
        const toks = [ mtype, this.x, this.y, this.buttonMask, 0 ]; // Wheel delta is 0
        this.send(toks.join(","));
    }


    /**
     * Handles touch events, simulating a single left mouse button press/drag/release.
     * Inspired by Guacamole.Touch's state management.
     * @param {TouchEvent} event
     * @private
     */
    _handleTouchEvent(event) {
        // Prevent double handling (though unlikely for touch compared to keyboard)
        if (!this._guac_markEvent(event)) return;

        const type = event.type;

        // Iterate through touches that changed in this event
        for (let i = 0; i < event.changedTouches.length; i++) {
            const changedTouch = event.changedTouches[i];
            const identifier = changedTouch.identifier;

            if (type === 'touchstart') {
                // If no touch is currently active, make this the active one
                if (this._activeTouchIdentifier === null) {
                    this._activeTouchIdentifier = identifier;

                    // Calculate initial position
                    this._calculateTouchCoordinates(changedTouch);

                    // Simulate left mouse button down
                    this.buttonMask |= 1;

                    // Send initial mouse down state
                    this._sendMouseState();

                    // Prevent default actions like scrolling/zooming if the touch starts on our element
                    if (this.element.contains(event.target)) {
                        event.preventDefault();
                    }

                    // Only handle the first touch that starts
                    break;
                }
            }
            else if (type === 'touchmove') {
                // If this move event belongs to the currently active touch
                if (identifier === this._activeTouchIdentifier) {
                    // Calculate new position
                    this._calculateTouchCoordinates(changedTouch);

                    // Send updated mouse move state (button is already down)
                    this._sendMouseState();

                    // Prevent scrolling page during drag
                     event.preventDefault();

                    // Only handle the move of the active touch
                    break;
                }
            }
            else if (type === 'touchend' || type === 'touchcancel') {
                // If this end/cancel event belongs to the currently active touch
                if (identifier === this._activeTouchIdentifier) {
                    // Calculate final position
                    this._calculateTouchCoordinates(changedTouch);

                    // Simulate left mouse button up
                    this.buttonMask &= ~1;

                    // Send final mouse up state
                    this._sendMouseState();

                    // Stop tracking the active touch
                    this._activeTouchIdentifier = null;

                     // Prevent default just in case (though less critical for touchend)
                    // event.preventDefault();

                    // Only handle the end/cancel of the active touch
                    break;
                }
            }
        } // End loop through changedTouches
    }


    _dropThreshold() {
        var count = 0;
        var val1 = this._queue.dequeue();
        while (!this._queue.isEmpty()) {
            var valNext = this._queue.dequeue();
            if (valNext >= 80 && val1 == valNext) { count++; }
            val1 = valNext;
        }
        return count >= 2;
    }

    _mouseWheelWrapper(event) {
        var deltaY = Math.trunc(Math.abs(event.deltaY));
        if (this._queue.size() < 4) { this._queue.enqueue(deltaY); }
        if (this._queue.size() == 4) {
            if (this._dropThreshold()) {
                this._allowThreshold = false; this._smallestDeltaY = 10000;
            } else {
                this._allowThreshold = true;
            }
        }
        if (this._allowThreshold && this._allowTrackpadScrolling) {
            this._allowTrackpadScrolling = false;
            this._mouseWheel(event);
            setTimeout(() => this._allowTrackpadScrolling = true, this._wheelThreshold);
        } else if (!this._allowThreshold) {
            this._mouseWheel(event);
        }
         // Prevent default page scrolling
        event.preventDefault();
    }

    _mouseWheel(event) {
        var mtype = (document.pointerLockElement === this.element ? "m2" : "m"); // Check against our element
        var button = (event.deltaY < 0) ? 4 : 3; // Wheel up: 4, Wheel down: 3
        var deltaY = Math.abs(Math.trunc(event.deltaY));
        if (deltaY < this._smallestDeltaY && deltaY != 0) { this._smallestDeltaY = deltaY; }
        deltaY = Math.max(1, Math.floor(deltaY / this._smallestDeltaY)); // Ensure delta is at least 1
        var magnitude = Math.min(deltaY, this._scrollMagnitude);
        var mask = 1 << button;
        var toks;
        // Simulate press/release for scroll event
        this.buttonMask |= mask;
        toks = [ mtype, this.x, this.y, this.buttonMask, magnitude ];
        this.send(toks.join(","));
        this.buttonMask &= ~mask;
        toks = [ mtype, this.x, this.y, this.buttonMask, magnitude ];
        this.send(toks.join(","));
    }

    _contextMenu(event) {
        // Prevent browser context menu only if the event is on our element
        if (this.element.contains(event.target)) {
            event.preventDefault();
        }
    }

    _pointerLock() {
        // Check against our specific element
        if (document.pointerLockElement === this.element) {
            this.send("p,1"); // Show remote pointer
        } else {
            this.send("p,0"); // Hide remote pointer
        }
    }

    _exitPointerLock() {
        // Check if lock is active *on our element* before trying to exit
        if (document.pointerLockElement === this.element) {
            document.exitPointerLock();
        }
        // Always hide pointer after attempting exit
        this.send("p,0");
    }

    _windowMath() {
        const elementRect = this.element.getBoundingClientRect();
        const windowW = elementRect.width;
        const windowH = elementRect.height;
        const frameW = this.element.offsetWidth;
        const frameH = this.element.offsetHeight;
        if (windowW <= 0 || windowH <= 0 || frameW <= 0 || frameH <= 0) {
            this.m = null; return;
        }
        const multiX = windowW / frameW;
        const multiY = windowH / frameH;
        const multi = Math.min(multiX, multiY);
        const vpWidth = frameW * multi;
        const vpHeight = frameH * multi;
        const offsetX = (windowW - vpWidth) / 2.0;
        const offsetY = (windowH - vpHeight) / 2.0;
        const mouseMultiX = (vpWidth > 0) ? frameW / vpWidth : 1;
        const mouseMultiY = (vpHeight > 0) ? frameH / vpHeight : 1;
        this.m = {
            mouseMultiX: mouseMultiX, mouseMultiY: mouseMultiY,
            mouseOffsetX: offsetX, mouseOffsetY: offsetY,
            elementClientX: elementRect.left, elementClientY: elementRect.top,
            frameW: frameW, frameH: frameH,
        };
    }

    _clientToServerX(clientX) {
        if (!this.m) return 0;
        const elementRelativeX = clientX - this.m.elementClientX;
        const viewportRelativeX = elementRelativeX - this.m.mouseOffsetX;
        let serverX = viewportRelativeX * this.m.mouseMultiX;
        serverX = Math.max(0, Math.min(this.m.frameW, Math.round(serverX)));
        return serverX;
    }

    _clientToServerY(clientY) {
        if (!this.m) return 0;
        const elementRelativeY = clientY - this.m.elementClientY;
        const viewportRelativeY = elementRelativeY - this.m.mouseOffsetY;
        let serverY = viewportRelativeY * this.m.mouseMultiY;
        serverY = Math.max(0, Math.min(this.m.frameH, Math.round(serverY)));
        return serverY;
    }

    _gamepadConnected(event) {
        this.gamepadManager = new GamepadManager(event.gamepad, this._gamepadButton.bind(this), this._gamepadAxis.bind(this));
        if (this.ongamepadconnected !== null) { this.ongamepadconnected(event.gamepad.id); }
        this.send("js,c," + event.gamepad.index + "," + btoa(event.gamepad.id) + "," + this.gamepadManager.numAxes + "," + this.gamepadManager.numButtons);
    }

    _gamepadDisconnect(event) {
         if (this.ongamepaddisconneceted !== null) { this.ongamepaddisconneceted(); }
         this.send("js,d," + event.gamepad.index);
         this.gamepadManager = null; // Clear manager on disconnect
    }

    _gamepadButton(gp_num, btn_num, val) {
        this.send("js,b," + gp_num + "," + btn_num + "," + val);
        window.postMessage({ type: 'gamepadButtonUpdate', gamepadIndex: gp_num, buttonIndex: btn_num, value: val }, window.location.origin);
    }

    _gamepadAxis(gp_num, axis_num, val) {
        this.send("js,a," + gp_num + "," + axis_num + "," + val)
        window.postMessage({ type: 'gamepadAxisUpdate', gamepadIndex: gp_num, axisIndex: axis_num, value: val }, window.location.origin);
    }

    _onFullscreenChange() {
        if (document.fullscreenElement === this.element.parentElement) { // Check if *our* element's parent is fullscreen
            // Try to acquire pointer lock on our element
            if (document.pointerLockElement !== this.element) {
                this.element.requestPointerLock().catch(err => console.warn("Pointer lock failed on fullscreen:", err));
            }
            this.requestKeyboardLock(); // Attempt keyboard lock
        } else {
            // Exited fullscreen
            // Optionally exit pointer lock if it's still active on our element
            if (document.pointerLockElement === this.element) {
                 document.exitPointerLock();
            }
            // Reset keyboard state on server and locally
            this.send("kr"); // Send server reset command
            this.resetKeyboard(); // Reset local state
        }
    }

    getCursorScaleFactor({ remoteResolutionEnabled = false } = {}) {
        if (remoteResolutionEnabled) { this.cursorScaleFactor = null; return; }
        var clientResolution = this.getWindowResolution();
        var serverHeight = this.element.offsetHeight; var serverWidth = this.element.offsetWidth;
        if (isNaN(serverWidth) || isNaN(serverHeight) || serverWidth <=0 || serverHeight <= 0) { return; }
        if (Math.abs(clientResolution[0] - serverWidth) <= 10 && Math.abs(clientResolution[1] - serverHeight) <= 10) { this.cursorScaleFactor = null; return; } // Reset if close
        this.cursorScaleFactor = Math.sqrt((serverWidth ** 2) + (serverHeight ** 2)) / Math.sqrt((clientResolution[0] ** 2) + (clientResolution[1] ** 2));
    }

    getWindowResolution() {
        // Ensure body exists and has dimensions
        const bodyWidth = document.body ? document.body.offsetWidth : window.innerWidth;
        const bodyHeight = document.body ? document.body.offsetHeight : window.innerHeight;
        const ratio = window.devicePixelRatio || 1;
        const offsetRatioWidth = bodyWidth * ratio;
        const offsetRatioHeight = bodyHeight * ratio;
        // Ensure results are positive integers
        return [ Math.max(1, parseInt(offsetRatioWidth - offsetRatioWidth % 2)), Math.max(1, parseInt(offsetRatioHeight - offsetRatioHeight % 2)) ];
    }

    /**
     * Attaches input event handles to document, window and element.
     */
    attach() {
        this.listeners.push(addListener(this.element, 'resize', this._windowMath, this));
        this.listeners.push(addListener(document, 'pointerlockchange', this._pointerLock, this));
        // Listen for fullscreenchange on the document, as fullscreen can be exited externally
        this.listeners.push(addListener(document, 'fullscreenchange', this._onFullscreenChange, this));
        this.listeners.push(addListener(window, 'resize', this._windowMath, this));

        // Gamepad support
        this.listeners.push(addListener(window, 'gamepadconnected', this._gamepadConnected, this));
        this.listeners.push(addListener(window, 'gamepaddisconnected', this._gamepadDisconnect, this));

        this.attach_context();
    }

    /**
     * Attaches context-sensitive listeners (mouse, keyboard, touch).
     */
    attach_context() {
        // Use capture phase for keyboard events to intercept early
        this.listeners_context.push(addListener(window, 'keydown', this._handleKeyDown, this, true));
        this.listeners_context.push(addListener(window, 'keypress', this._handleKeyPress, this, true));
        this.listeners_context.push(addListener(window, 'keyup', this._handleKeyUp, this, true));

        // Mouse / Wheel / ContextMenu listeners on the element
        this.listeners_context.push(addListener(this.element, 'wheel', this._mouseWheelWrapper, this));
        this.listeners_context.push(addListener(this.element, 'contextmenu', this._contextMenu, this));

        // Composition events on the element
        this.listeners_context.push(addListener(this.element, 'compositionstart', this._compositionStart, this));
        this.listeners_context.push(addListener(this.element, 'compositionupdate', this._compositionUpdate, this));
        this.listeners_context.push(addListener(this.element, 'compositionend', this._compositionEnd, this));


        if ('ontouchstart' in window) {
            // Attach touch listeners to the element to handle interactions within it
            // Use the refactored handler
            this.listeners_context.push(addListener(this.element, 'touchstart', this._handleTouchEvent, this));
            this.listeners_context.push(addListener(this.element, 'touchend', this._handleTouchEvent, this));
            this.listeners_context.push(addListener(this.element, 'touchmove', this._handleTouchEvent, this));
            this.listeners_context.push(addListener(this.element, 'touchcancel', this._handleTouchEvent, this)); // Also handle cancel
        } else {
            // Attach mouse listeners to the element
            this.listeners_context.push(addListener(this.element, 'mousemove', this._mouseButtonMovement, this));
            this.listeners_context.push(addListener(this.element, 'mousedown', this._mouseButtonMovement, this));
            // Listen for mouseup on the *window* to catch releases outside the element
            this.listeners_context.push(addListener(window, 'mouseup', this._mouseButtonMovement, this));
        }

        // If already fullscreen when attached, try to lock pointer/keyboard
        if (document.fullscreenElement === this.element.parentElement) {
             if (document.pointerLockElement !== this.element) {
                this.element.requestPointerLock().catch(()=>{});
             }
             this.requestKeyboardLock();
        } else if (document.pointerLockElement === this.element) {
             // If pointer is locked but not fullscreen, update pointer state
             this._pointerLock();
        }


        this._windowMath(); // Initial calculation
    }

    /**
     * Removes general listeners.
     */
    detach() {
        removeListeners(this.listeners);
        this.listeners = []; // Clear array
        this.detach_context();
    }

    /**
     * Removes context-sensitive listeners and resets state.
     */
    detach_context() {
        removeListeners(this.listeners_context);
        this.listeners_context = []; // Clear array

        // Reset keyboard state on server and locally
        this.send("kr");
        this.resetKeyboard();

        // Reset touch state
        this._activeTouchIdentifier = null;
        if ((this.buttonMask & 1) === 1) { // If touch was active (left button down)
             this.buttonMask &= ~1; // Ensure button mask is cleared
             this._sendMouseState(); // Send final mouse up state
        }


        // Attempt to exit pointer lock if active on our element
        this._exitPointerLock();
    }

    /**
     * Enters fullscreen and requests pointer lock.
     */
    enterFullscreen() {
        // Ensure parentElement exists before requesting fullscreen
        if (this.element.parentElement && document.fullscreenElement === null) {
            this.element.parentElement.requestFullscreen()
                .then(() => {
                    // Request pointer lock *after* fullscreen is successful
                    // Note: _onFullscreenChange will also attempt this
                    // if (document.pointerLockElement !== this.element) {
                    //     this.element.requestPointerLock().catch(()=>{});
                    // }
                })
                .catch(err => console.error("Fullscreen request failed:", err));
        } else if (document.fullscreenElement !== null && document.pointerLockElement !== this.element) {
             // Already fullscreen, just try pointer lock
             this.element.requestPointerLock().catch(()=>{});
        }
    }

    /**
     * Requests keyboard lock (requires fullscreen).
     */
    requestKeyboardLock() {
        if (document.fullscreenElement && 'keyboard' in navigator && 'lock' in navigator.keyboard) {
            // Keys to attempt to lock (browser might ignore some)
            const keys = [ "AltLeft", "AltRight", "Tab", "Escape", "MetaLeft", "MetaRight", "ContextMenu" ];
            navigator.keyboard.lock(keys).then(() => {
                console.log('Keyboard lock active.');
            }).catch(err => {
                console.warn('Keyboard lock failed:', err);
            });
        }
    }
}


// --- Helper Functions for Listeners ---

/**
 * Helper function to keep track of attached event listeners.
 * @param {EventTarget} obj - The object to attach the listener to (Element, Window, Document)
 * @param {string} name - The event name
 * @param {function} func - The listener function
 * @param {Object} [ctx] - Optional context (`this`) for the function
 * @param {boolean} [useCapture=false] - Whether to use the capture phase
 * @returns {Array} - An array representing the listener for removal
 */
function addListener(obj, name, func, ctx, useCapture = false) {
    // Ensure obj is a valid EventTarget
    if (!obj || typeof obj.addEventListener !== 'function') {
        console.error("addListener: Invalid target object", obj);
        return null; // Return null or throw error
    }
    const newFunc = ctx ? func.bind(ctx) : func;
    // Use options object for clarity, especially with capture/passive
    const options = {
        capture: useCapture,
        // Default passive based on event type (heuristic)
        // Make touchstart/touchmove non-passive to allow preventDefault
        passive: !useCapture && !['wheel', 'touchmove', 'touchstart', 'mousedown', 'click', 'mouseup', 'contextmenu'].includes(name)
    };
    obj.addEventListener(name, newFunc, options);
    return [obj, name, newFunc, options]; // Store options for removal
}

/**
 * Helper function to remove all attached event listeners.
 * @param {Array} listeners - Array of listener representations from addListener
 */
function removeListeners(listeners) {
    for (const listener of listeners) {
        if (listener && listener[0] && typeof listener[0].removeEventListener === 'function') {
            // Use the same options (specifically capture flag) for removal
            listener[0].removeEventListener(listener[1], listener[2], listener[3]);
        }
    }
    // Clear the array after removing listeners
    listeners.length = 0;
}
