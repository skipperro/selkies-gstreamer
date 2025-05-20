/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
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
         * Map tracking currently active touches and their start data.
         * Key: touch identifier, Value: {startX, startY, startTime, identifier}
         * @private
         * @type {Map<number, Object>}
         */
        this._activeTouches = new Map();

        /**
         * Identifier of the touch acting as the simulated left mouse button (single touch only).
         * Null if no touch is active or if multi-touch gesture is in progress.
         * @private
         * @type {?number}
         */
        this._activeTouchIdentifier = null;
        /**
         * Flag indicating if a two-finger gesture (potential swipe) is currently active.
         * @private
         * @type {boolean}
         */
        this._isTwoFingerGesture = false;

        /** @private @const @type {number} Minimum vertical distance in pixels for a swipe. */
        this._MIN_SWIPE_DISTANCE = 30; // Reduced slightly for responsiveness
        /** @private @const @type {number} Maximum duration in milliseconds for a swipe. */
        this._MAX_SWIPE_DURATION = 600; // Increased slightly
        /** @private @const @type {number} Ratio deltaY must exceed deltaX for vertical swipe. */
        this._VERTICAL_SWIPE_RATIO = 1.5; // Adjusted slightly
        /** @private @const @type {number} Pixels of vertical swipe per scroll tick magnitude. */
        this._SCROLL_PIXELS_PER_TICK = 40; // Tune this value for desired sensitivity
        /** @private @const @type {number} Maximum scroll magnitude per swipe. */
        this._MAX_SCROLL_MAGNITUDE = 8; // Prevents excessive scrolling

        /** @private @const @type {number} Max distance finger can move to be considered a tap. */
        this._TAP_THRESHOLD_DISTANCE_SQ = 10*10; // Check squared distance (faster)
        /** @private @const @type {number} Max duration for a tap. */
        this._TAP_MAX_DURATION = 250;
    }

    /** @private @type {number} */
    static _nextGuacID = 0;

    // --- Guacamole Internal Event Representation ---
    // ... (Guacamole keyboard logic remains unchanged) ...
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
    _KeydownEvent(orig) {
        const keyEvent = this._KeyEvent(orig);
        keyEvent._internalType = 'keydown';
        keyEvent.keysym = keysym_from_key_identifier(keyEvent.key, keyEvent.location)
                       || keysym_from_keycode(keyEvent.keyCode, keyEvent.location);
        keyEvent.keyupReliable = !this._quirks.keyupUnreliable;
        if (keyEvent.keysym && !isPrintable(keyEvent.keysym)) {
            keyEvent.reliable = true;
        }
        if (!keyEvent.keysym && key_identifier_sane(keyEvent.keyCode, keyEvent.keyIdentifier)) {
            keyEvent.keysym = keysym_from_key_identifier(keyEvent.keyIdentifier, keyEvent.location, keyEvent.modifiers.shift);
        }
        if (keyEvent.modifiers.meta && keyEvent.keysym !== 0xFFE7 && keyEvent.keysym !== 0xFFE8) {
            keyEvent.keyupReliable = false;
        } else if (keyEvent.keysym === 0xFFE5 && this._quirks.capsLockKeyupUnreliable) {
            keyEvent.keyupReliable = false;
        }
        if (this._quirks.altIsTypableOnly && (keyEvent.keysym === 0xFFE9 || keyEvent.keysym === 0xFFEA)) {
            keyEvent.keysym = 0xFE03;
        }
        const prevent_alt = !keyEvent.modifiers.ctrl && !this._quirks.altIsTypableOnly;
        const prevent_ctrl = !keyEvent.modifiers.alt;
        if ((prevent_ctrl && keyEvent.modifiers.ctrl)
         || (prevent_alt  && keyEvent.modifiers.alt)
         || keyEvent.modifiers.meta
         || keyEvent.modifiers.hyper) {
            keyEvent.reliable = true;
        }
        if (keyEvent.keysym !== null) {
             this._recentKeysym[keyEvent.keyCode] = keyEvent.keysym;
        }
        return keyEvent;
    }
    _KeypressEvent(orig) {
        const keyEvent = this._KeyEvent(orig);
        keyEvent._internalType = 'keypress';
        keyEvent.keysym = keysym_from_charcode(keyEvent.keyCode);
        keyEvent.reliable = true;
        return keyEvent;
    }
    _KeyupEvent(orig) {
        const keyEvent = this._KeyEvent(orig);
        keyEvent._internalType = 'keyup';
        keyEvent.keysym = keysym_from_key_identifier(keyEvent.key, keyEvent.location)
                       || keysym_from_keycode(keyEvent.keyCode, keyEvent.location);
        if (keyEvent.keysym === null || !this.pressed[keyEvent.keysym]) {
            const recent = this._recentKeysym[keyEvent.keyCode];
            if (recent !== undefined) {
                keyEvent.keysym = recent;
            }
        }
        keyEvent.reliable = true;
        return keyEvent;
    }
    _guac_press(keysym) {
        if (keysym === null) return false;
        if (!this.pressed[keysym]) {
            this.pressed[keysym] = true;
            delete this._implicitlyPressed[keysym];
            this.send("kd," + keysym);
            this._last_keydown_sent[keysym] = true;
            window.clearTimeout(this._key_repeat_timeout);
            window.clearInterval(this._key_repeat_interval);
            if (!no_repeat[keysym]) {
                this._key_repeat_timeout = window.setTimeout(() => {
                    this._key_repeat_interval = window.setInterval(() => {
                        if (this.pressed[keysym]) {
                            this.send("ku," + keysym);
                            window.setTimeout(() => {
                                if (this.pressed[keysym]) {
                                    this.send("kd," + keysym);
                                }
                            }, 10);
                        } else {
                             window.clearInterval(this._key_repeat_interval);
                        }
                    }, 50);
                }, 500);
            }
            return true;
        }
        return this._last_keydown_sent[keysym] || false;
    }
    _guac_release(keysym) {
        if (keysym === null) return;
        if (this.pressed[keysym]) {
            delete this.pressed[keysym];
            delete this._implicitlyPressed[keysym];
            delete this._last_keydown_sent[keysym];
            window.clearTimeout(this._key_repeat_timeout);
            window.clearInterval(this._key_repeat_interval);
            this._key_repeat_timeout = null;
            this._key_repeat_interval = null;
            this.send("ku," + keysym);
        }
    }
    resetKeyboard() {
        for (const keysymStr in this.pressed) {
            if (this.pressed[keysymStr]) {
                this._guac_release(parseInt(keysymStr, 10));
            }
        }
        this.pressed = {};
        this._implicitlyPressed = {};
        this._last_keydown_sent = {};
        this._recentKeysym = {};
        this._eventLog = [];
        this.modifiers = new ModifierState();
        window.clearTimeout(this._key_repeat_timeout);
        window.clearInterval(this._key_repeat_interval);
        this._key_repeat_timeout = null;
        this._key_repeat_interval = null;
    }
    _guac_updateModifierState(modifierName, keysyms, keyEvent) {
        const localState = keyEvent.modifiers[modifierName];
        const remoteState = this.modifiers[modifierName];
        if (keysyms.indexOf(keyEvent.keysym) !== -1) {
            return;
        }
        if (remoteState && localState === false) {
            for (const keysym of keysyms) {
                this._guac_release(keysym);
            }
        }
        else if (!remoteState && localState === true) {
            let alreadyPressed = false;
            for (const keysym of keysyms) {
                if (this.pressed[keysym] && !this._implicitlyPressed[keysym]) {
                     alreadyPressed = true;
                     break;
                }
            }
            if (alreadyPressed) return;
            const primaryKeysym = keysyms[0];
            if (keyEvent.keysym && keysyms.indexOf(keyEvent.keysym) === -1) {
                 this._implicitlyPressed[primaryKeysym] = true;
            }
            this._guac_press(primaryKeysym);
        }
    }
    _guac_syncModifierStates(keyEvent) {
        this._guac_updateModifierState('alt',   [0xFFE9, 0xFFEA, 0xFE03], keyEvent);
        this._guac_updateModifierState('shift', [0xFFE1, 0xFFE2], keyEvent);
        this._guac_updateModifierState('ctrl',  [0xFFE3, 0xFFE4], keyEvent);
        this._guac_updateModifierState('meta',  [0xFFE7, 0xFFE8], keyEvent);
        this._guac_updateModifierState('hyper', [0xFFEB, 0xFFEC], keyEvent);
        this.modifiers = keyEvent.modifiers;
    }
    _guac_isStateImplicit() {
        for (const keysym in this.pressed) {
            if (!this._implicitlyPressed[keysym]) {
                return false;
            }
        }
        return Object.keys(this.pressed).length > 0;
    }
    _guac_release_simulated_altgr(keysym) {
        if (!this.modifiers.ctrl || !this.modifiers.alt) return;
        if ((keysym >= 0x0041 && keysym <= 0x005A) || (keysym >= 0x0061 && keysym <= 0x007A)) {
            return;
        }
        if (isPrintable(keysym)) {
            this._guac_release(0xFFE3);
            this._guac_release(0xFFE4);
            this._guac_release(0xFFE9);
            this._guac_release(0xFFEA);
        }
    }
    _guac_interpret_event() {
        const first = this._eventLog[0];
        if (!first) return null;
        let accepted_events = [];
        let keysym = null;
        let event_processed = null;
        if (first._internalType === 'keydown') {
            event_processed = first;
            if (first.keysym === 0xFFE7 || first.keysym === 0xFFE8) {
                if (this._eventLog.length === 1) return null;
                const next = this._eventLog[1];
                if (next.keysym !== first.keysym) {
                    if (!next.modifiers.meta) {
                        return this._eventLog.shift();
                    }
                } else if (next && next._internalType === 'keydown') {
                    return this._eventLog.shift();
                }
            }
            if (first.reliable) {
                keysym = first.keysym;
                accepted_events = this._eventLog.splice(0, 1);
            }
            else if (this._eventLog[1] && this._eventLog[1]._internalType === 'keypress') {
                keysym = this._eventLog[1].keysym;
                accepted_events = this._eventLog.splice(0, 2);
            }
            else if (this._eventLog[1]) {
                keysym = first.keysym;
                accepted_events = this._eventLog.splice(0, 1);
            }
            else {
                 return null;
            }
            if (accepted_events.length > 0) {
                this._guac_syncModifierStates(first);
                if (keysym !== null) {
                    this._guac_release_simulated_altgr(keysym);
                    const sent = this._guac_press(keysym);
                    event_processed.defaultPrevented = sent;
                    this._recentKeysym[first.keyCode] = keysym;
                    if (!first.keyupReliable) {
                        this._guac_release(keysym);
                    }
                } else {
                     event_processed.defaultPrevented = false;
                }
                return event_processed;
            }
        }
        else if (first._internalType === 'keyup') {
             event_processed = first;
             if (!this._quirks.keyupUnreliable) {
                 keysym = first.keysym;
                 if (keysym !== null) {
                     this._guac_release(keysym);
                     delete this._recentKeysym[first.keyCode];
                     event_processed.defaultPrevented = true;
                 } else {
                     this.resetKeyboard();
                     event_processed.defaultPrevented = true;
                 }
                 this._guac_syncModifierStates(first);
                 this._eventLog.shift();
                 return event_processed;
             } else {
                 this._eventLog.shift();
                 return event_processed;
             }
        }
        else {
             event_processed = this._eventLog.shift();
             if (event_processed) event_processed.defaultPrevented = false;
             return event_processed;
        }
        return null;
    }
    _guac_interpret_events() {
        let last_event_processed = null;
        let current_event_processed;
        do {
            current_event_processed = this._guac_interpret_event();
            if (current_event_processed) {
                last_event_processed = current_event_processed;
            }
        } while (current_event_processed !== null);
        if (this._guac_isStateImplicit()) {
            this.resetKeyboard();
        }
        return last_event_processed ? last_event_processed.defaultPrevented : false;
    }
    _guac_markEvent(e) {
        if (e[this._EVENT_MARKER]) {
            return false;
        }
        e[this._EVENT_MARKER] = true;
        return true;
    }
    _handleKeyDown(event) {
        const WHITELIST_CLASS = 'allow-native-input';
        if (this._targetHasClass(event.target, WHITELIST_CLASS)) {
            console.debug('Input: KeyDown on whitelisted element, allowing native behavior.');
            return;
        }
        const keyboardInputAssist = document.getElementById('keyboard-input-assist');
        if (event.target === keyboardInputAssist) {
            console.log("Ignoring keydown event targeted at keyboard-input-assist.");
            return;
        }
        if (this.isComposing) return;
        if (!this._guac_markEvent(event)) return;
        if (event.code === 'KeyM' && event.ctrlKey && event.shiftKey) {
            if (document.fullscreenElement === null && this.onmenuhotkey !== null) {
                this.onmenuhotkey();
                event.preventDefault();
                return;
            }
        }
        if (event.code === 'KeyF' && event.ctrlKey && event.shiftKey) {
            if (document.fullscreenElement === null && this.onfullscreenhotkey !== null) {
                this.onfullscreenhotkey();
                event.preventDefault();
                return;
            }
        }
        if (event.isComposing || event.keyCode === 229) {
            return;
        }
        const keydownEvent = this._KeydownEvent(event);
        this._eventLog.push(keydownEvent);
        if (this._guac_interpret_events()) {
            event.preventDefault();
        }
    }
    _handleKeyPress(event) {
        const WHITELIST_CLASS = 'allow-native-input';
        if (this._targetHasClass(event.target, WHITELIST_CLASS)) {
            console.debug('Input: KeyPress on whitelisted element, allowing native behavior.');
            return;
        }
        if (this.isComposing) return;
        if (!this._guac_markEvent(event)) return;
        if (event.keyCode === 229) return;
        const keypressEvent = this._KeypressEvent(event);
        this._eventLog.push(keypressEvent);
        if (this._guac_interpret_events()) {
            event.preventDefault();
        }
    }
    _handleKeyUp(event) {
        const WHITELIST_CLASS = 'allow-native-input';
        if (this._targetHasClass(event.target, WHITELIST_CLASS)) {
            console.debug('Input: KeyUp on whitelisted element, allowing native behavior.');
            return;
        }
        if (this.isComposing) return;
        if (!this._guac_markEvent(event)) return;
        if (event.keyCode === 229) return;
        const keyupEvent = this._KeyupEvent(event);
        this._eventLog.push(keyupEvent);
        if(this._guac_interpret_events()) {
             event.preventDefault();
        }
    }
    _compositionStart(event) {
        if (!this._guac_markEvent(event)) return;
        this.isComposing = true;
        this.compositionString = "";
        this.send("co,start");
    }
    _compositionUpdate(event) {
        if (!this._guac_markEvent(event)) return;
        if (!this.isComposing) return;
        if (event.data) {
            this.compositionString = event.data;
        }
        this.send("co,update," + this.compositionString);
    }
    _compositionEnd(event) {
        if (!this._guac_markEvent(event)) return;
        this.isComposing = false;
        if (event.data) {
            this.compositionString = event.data;
        }
        this.send("co,end," + this.compositionString);
        if (this.compositionString) {
            this._typeString(this.compositionString);
        }
        this.compositionString = "";
    }
    _typeString(str) {
        for (let i = 0; i < str.length; i++) {
            const codepoint = str.codePointAt ? str.codePointAt(i) : str.charCodeAt(i);
            if (codepoint === undefined) continue;
            const keysym = keysym_from_charcode(codepoint);
            if (keysym !== null) {
                 const sent = this._guac_press(keysym);
                 if (sent) {
                     setTimeout(() => this._guac_release(keysym), 5);
                 }
            }
             if (codepoint > 0xFFFF) i++;
        }
    }

    _mouseButtonMovement(event) {
        const down = (event.type === 'mousedown' ? 1 : 0);
        var mtype = "m";
        let canvas = document.getElementById('videoCanvas');
        // Back and forward mouse macros
        if (event.type === 'mousedown' || event.type === 'mouseup') {
            if (event.button === 3) {
                event.preventDefault();
                console.debug('Input: Browser "Back" (mouse button 3) default action prevented.');
            } else if (event.button === 4) {
                event.preventDefault();
                console.debug('Input: Browser "Forward" (mouse button 4) default action prevented.');
            }
        }
        if (down && event.button === 0 && event.ctrlKey && event.shiftKey) {
            const targetElement = event.target.requestPointerLock ? event.target : this.element;
            targetElement.requestPointerLock().catch(err => console.error("Pointer lock failed:", err));
            event.preventDefault();
            return;
        }

        // Check if pointer is locked to either element
        if (document.pointerLockElement === this.element || document.pointerLockElement === canvas) {
            mtype = "m2";
            let movementX = event.movementX || 0; // Raw movement X
            let movementY = event.movementY || 0; // Raw movement Y

            // Calculate this.x, this.y (scaled deltas for the server)
            if (window.isManualResolutionMode && canvas) {
                const canvasRect = canvas.getBoundingClientRect();
                if (canvasRect.width > 0 && canvasRect.height > 0 && canvas.width > 0 && canvas.height > 0) {
                    const scaleX = canvas.width / canvasRect.width;
                    const scaleY = canvas.height / canvasRect.height;
                    this.x = Math.round(movementX * scaleX); // Assign scaled delta to this.x
                    this.y = Math.round(movementY * scaleY); // Assign scaled delta to this.y
                } else {
                    this.x = movementX; // Fallback: Assign raw delta to this.x
                    this.y = movementY; // Fallback: Assign raw delta to this.y
                }
            } else {
                if (this.cursorScaleFactor != null) {
                    this.x = Math.trunc(movementX * this.cursorScaleFactor); // Assign scaled delta to this.x
                    this.y = Math.trunc(movementY * this.cursorScaleFactor); // Assign scaled delta to this.y
                } else {
                    this.x = movementX; // Fallback: Assign raw delta to this.x
                    this.y = movementY; // Fallback: Assign raw delta to this.y
                }
            }

            const FAKE_CURSOR_ID = 'poc-dynamic-cursor-final';
            const fullscreenParent = this.element.parentElement;

            if (fullscreenParent) { // Only proceed if the parent exists
                const fakeCursor = fullscreenParent.querySelector(`#${FAKE_CURSOR_ID}`); // Find the cursor element

                if (fakeCursor) { // Only proceed if the cursor element exists
                    // Get current visual position
                    const currentX = parseFloat(fakeCursor.style.left || '0') || 0;
                    const currentY = parseFloat(fakeCursor.style.top || '0') || 0;

                    // Calculate new visual position using RAW movement deltas
                    let newX = currentX + movementX; // Use raw movementX here
                    let newY = currentY + movementY; // Use raw movementY here

                    // Get parent bounds for clamping
                    const containerWidth = fullscreenParent.clientWidth;
                    const containerHeight = fullscreenParent.clientHeight;
                    const cursorWidth = parseFloat(fakeCursor.style.width || '0') || 0;
                    const cursorHeight = parseFloat(fakeCursor.style.height || '0') || 0;

                    // Clamp visual position to parent bounds
                    newX = Math.max(0, Math.min(containerWidth - cursorWidth, newX));
                    newY = Math.max(0, Math.min(containerHeight - cursorHeight, newY));

                    // Update visual cursor style
                    fakeCursor.style.left = `${newX}px`;
                    fakeCursor.style.top = `${newY}px`;
                }
            }
        } else if (event.type === 'mousemove') {
             if (window.isManualResolutionMode && canvas) {
                const canvasRect = canvas.getBoundingClientRect();
                if (canvasRect.width > 0 && canvasRect.height > 0 && canvas.width > 0 && canvas.height > 0) {
                    const mouseX_on_canvas = event.clientX - canvasRect.left;
                    const mouseY_on_canvas = event.clientY - canvasRect.top;
                    const scaleX = canvas.width / canvasRect.width;
                    const scaleY = canvas.height / canvasRect.height;
                    let serverX = mouseX_on_canvas * scaleX;
                    let serverY = mouseY_on_canvas * scaleY;
                    this.x = Math.max(0, Math.min(canvas.width, Math.round(serverX))); // Assign scaled absolute to this.x
                    this.y = Math.max(0, Math.min(canvas.height, Math.round(serverY))); // Assign scaled absolute to this.y
                } else {
                    this.x = 0; this.y = 0; // Fallback
                }
            } else {
                if (!this.m /*&& event.type === 'mousemove' - redundant check */ ) {
                    this._windowMath();
                }
                if (this.m) {
                    this.x = this._clientToServerX(event.clientX); // Assign mapped absolute to this.x
                    this.y = this._clientToServerY(event.clientY); // Assign mapped absolute to this.y
                } else {
                    this.x = 0; this.y = 0; // Fallback
                }
            }
        }

        // --- Original Button Mask Update ---
        if (event.type === 'mousedown' || event.type === 'mouseup') {
            var mask = 1 << event.button;
            if (down) {
                this.buttonMask |= mask;
            } else {
                this.buttonMask &= ~mask;
            }
        }

        // --- Original Send Call ---
        // Sends the mtype ('m' or 'm2') and the calculated this.x/this.y
        var toks = [ mtype, this.x, this.y, this.buttonMask, 0 ];
        this.send(toks.join(","));
    }

    _calculateTouchCoordinates(touchPoint) {
        let canvas = document.getElementById('videoCanvas');
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
                this.x = 0; this.y = 0;
            }
        } else {
            if (!this.m) this._windowMath();
            if (this.m) {
                this.x = this._clientToServerX(touchPoint.clientX);
                this.y = this._clientToServerY(touchPoint.clientY);
            } else {
                this.x = 0; this.y = 0;
            }
        }
    }
    _sendMouseState() {
        const mtype = (document.pointerLockElement === this.element || this.mouseRelative) ? "m2" : "m";
        const toks = [ mtype, this.x, this.y, this.buttonMask, 0 ];
        this.send(toks.join(","));
    }


    /**
     * Handles touch events, supporting single-touch mouse simulation (tap/drag)
     * and two-finger vertical swipes for variable scrolling.
     * @param {TouchEvent} event
     * @private
     */
    _handleTouchEvent(event) {
        // Prevent double handling
        if (!this._guac_markEvent(event)) return;

        const type = event.type;
        const now = Date.now();
        let preventDefault = false; // Track if we should prevent default action

        // --- Touch Start ---
        if (type === 'touchstart') {
            for (let i = 0; i < event.changedTouches.length; i++) {
                const touch = event.changedTouches[i];
                if (!this._activeTouches.has(touch.identifier)) {
                    // Calculate initial server coords here
                    const serverX = this._clientToServerX(touch.clientX);
                    const serverY = this._clientToServerY(touch.clientY);
                    this._activeTouches.set(touch.identifier, {
                        startX: touch.clientX,
                        startY: touch.clientY,
                        currentX: touch.clientX, // Initialize current position
                        currentY: touch.clientY,
                        startTime: now,
                        identifier: touch.identifier,
                        serverX: serverX, // Store initial server coords
                        serverY: serverY
                    });
                    // Update this.x/y to the latest touch point for reference, but don't send yet
                    this.x = serverX;
                    this.y = serverY;
                }
            }

            const touchCount = this._activeTouches.size;

            if (touchCount === 1) {
                // Potential single touch (tap or drag start). DO NOTHING yet regarding mouse button.
                this._isTwoFingerGesture = false;
                // Don't set _activeTouchIdentifier yet.
                preventDefault = true; // Prevent default for initial touch

            } else if (touchCount === 2) {
                // Definitively a two-finger gesture start.
                this._isTwoFingerGesture = true;
                // Cancel any potential single-touch drag state that might have been inferred briefly
                this._activeTouchIdentifier = null;
                this.buttonMask &= ~1; // Ensure button is up
                preventDefault = true; // Prevent default for two-finger start (zoom/pan)

            } else {
                // More than two fingers - cancel ongoing gestures.
                 if (this._isTwoFingerGesture) {
                     this._isTwoFingerGesture = false;
                 }
                 if (this._activeTouchIdentifier !== null) {
                    // Release button if a drag was active
                    this.buttonMask &= ~1;
                    this._sendMouseState(); // Send mouse up for the cancelled drag
                    this._activeTouchIdentifier = null;
                 }
                 // Don't necessarily prevent default for >2 touches
            }
        }

        // --- Touch Move ---
        else if (type === 'touchmove') {
            let activeTouchMoved = false;
            for (let i = 0; i < event.changedTouches.length; i++) {
                const touch = event.changedTouches[i];
                const touchData = this._activeTouches.get(touch.identifier);
                if (touchData) {
                    // Update current position for all moving touches
                    touchData.currentX = touch.clientX;
                    touchData.currentY = touch.clientY;

                    if (this._isTwoFingerGesture) {
                        // If two fingers are down, just prevent default scroll/zoom
                        preventDefault = true;
                    } else if (this._activeTouches.size === 1) {
                        // Only one finger is down total
                        if (this._activeTouchIdentifier === touch.identifier) {
                             // This is the already active dragging finger
                            this._calculateTouchCoordinates(touch); // Updates this.x, this.y
                            this._sendMouseState(); // Send mouse move (button is already down)
                            activeTouchMoved = true;
                            preventDefault = true;
                        } else if (this._activeTouchIdentifier === null) {
                            // Single finger moving, but not yet designated as a drag
                            // Check if it moved enough to start a drag
                            const dx = touchData.currentX - touchData.startX;
                            const dy = touchData.currentY - touchData.startY;
                            const distSq = dx*dx + dy*dy;

                            if (distSq >= this._TAP_THRESHOLD_DISTANCE_SQ) {
                                // Moved enough: Start drag
                                this._activeTouchIdentifier = touch.identifier;
                                this._calculateTouchCoordinates(touch); // Set initial drag coords
                                this.buttonMask |= 1; // <<<<<<<<<<<< MOUSE DOWN HERE
                                this._sendMouseState(); // Send initial mouse down + position
                                activeTouchMoved = true;
                                preventDefault = true;
                            } else {
                                // Moved slightly, but not enough to be a drag yet. Prevent default.
                                preventDefault = true;
                            }
                        }
                    }
                }
            }
            // If the active dragging touch didn't move in *this* event, but others did,
            // still prevent default to avoid interference.
             if (this._activeTouchIdentifier !== null && !activeTouchMoved) {
                  preventDefault = true;
             }
        }

        // --- Touch End / Cancel ---
        else if (type === 'touchend' || type === 'touchcancel') {
            const endedTouches = event.changedTouches;
            let swipeDetected = false;

            for (let i = 0; i < endedTouches.length; i++) {
                const endedTouch = endedTouches[i];
                const identifier = endedTouch.identifier;
                const startData = this._activeTouches.get(identifier);

                if (!startData) continue; // Touch wasn't tracked? Ignore.

                 // Update final position for calculations
                startData.currentX = endedTouch.clientX;
                startData.currentY = endedTouch.clientY;

                const endTime = now;
                const duration = endTime - startData.startTime;
                const deltaX = startData.currentX - startData.startX;
                const deltaY = startData.currentY - startData.startY;
                const deltaDistSq = deltaX*deltaX + deltaY*deltaY;

                // --- Check for Swipe ---
                // Swipe check happens if _isTwoFingerGesture was true when this finger lifted
                // OR if it was the *second* finger lifting very quickly after the first one.
                if (this._isTwoFingerGesture) {
                    // Check swipe criteria
                    if (duration < this._MAX_SWIPE_DURATION &&
                        Math.abs(deltaY) > this._MIN_SWIPE_DISTANCE &&
                        Math.abs(deltaY) > Math.abs(deltaX) * this._VERTICAL_SWIPE_RATIO)
                    {
                        // Vertical Swipe Detected!
                        const direction = (deltaY < 0) ? 'up' : 'down';
                        // Calculate magnitude based on distance
                        const magnitude = Math.max(1, Math.min(this._MAX_SCROLL_MAGNITUDE,
                                               Math.ceil(Math.abs(deltaY) / this._SCROLL_PIXELS_PER_TICK)));

                        this._triggerMouseWheel(direction, magnitude);
                        swipeDetected = true;
                        preventDefault = true;

                        // Reset state immediately after successful swipe
                        this._activeTouches.clear(); // Remove all touches
                        this._isTwoFingerGesture = false;
                        this._activeTouchIdentifier = null;
                        this.buttonMask &= ~1; // Ensure button is up
                        // No need to send state here, _triggerMouseWheel handles it

                        break; // Gesture finished, stop processing ended touches for this event

                    } else {
                        // Two-finger gesture ended but wasn't a vertical swipe.
                        // Just let it fall through to remove the touch.
                    }
                }

                // --- Check for Tap ---
                // Only consider tap if it wasn't part of a swipe and was a single touch action
                else if (!swipeDetected && this._activeTouchIdentifier === null && this._activeTouches.size === 1) {
                     if (duration < this._TAP_MAX_DURATION && deltaDistSq < this._TAP_THRESHOLD_DISTANCE_SQ) {
                         // Tap detected! Simulate a quick click.
                         this._calculateTouchCoordinates(endedTouch); // Set final coords
                         this.buttonMask |= 1; // Press
                         this._sendMouseState();
                         preventDefault = true;
                         // Use setTimeout to ensure release happens after press is processed
                         setTimeout(() => {
                             this.buttonMask &= ~1; // Release
                             this._sendMouseState();
                         }, 10); // Short delay for release
                         // Note: We don't clear _activeTouches here yet, it happens below
                     }
                }

                // --- Check for Drag End ---
                else if (!swipeDetected && identifier === this._activeTouchIdentifier) {
                    // End of a single-touch drag
                    this._calculateTouchCoordinates(endedTouch); // Update final position
                    this.buttonMask &= ~1; // Release button
                    this._sendMouseState();
                    this._activeTouchIdentifier = null; // Stop drag state
                    preventDefault = true; // Prevent default for drag end
                }

                // --- Remove Ended Touch ---
                this._activeTouches.delete(identifier);

            } // End loop through changedTouches

            // --- Post-End State Update ---
            // Don't run this if a swipe cleared everything already
            if (!swipeDetected) {
                const remainingTouchCount = this._activeTouches.size;

                // Reset two-finger flag if count drops below 2
                if (this._isTwoFingerGesture && remainingTouchCount < 2) {
                    this._isTwoFingerGesture = false;
                }

                // If all touches are gone, ensure state is clean
                if (remainingTouchCount === 0) {
                    this._activeTouchIdentifier = null;
                    this._isTwoFingerGesture = false;
                    // Ensure button is up if it wasn't handled by drag end/tap
                    if ((this.buttonMask & 1) === 1) {
                       this.buttonMask &= ~1;
                       // Don't necessarily need to send state if nothing happened
                    }
                }
                // Note: We don't automatically start a drag if one finger remains after
                // a two-finger gesture ends without a swipe. User needs to move it.
            }
        } // End Touch End / Cancel

        // Apply preventDefault if needed and touch is on our element
        if (preventDefault && this.element.contains(event.target)) {
            event.preventDefault();
        }
    }

   /**
     * Simulates a mouse wheel scroll event with variable magnitude.
     * @private
     * @param {'up' | 'down'} direction - The direction of the scroll.
     * @param {number} magnitude - The intensity of the scroll (number of ticks).
     */
    _triggerMouseWheel(direction, magnitude) {
        // Ensure magnitude is at least 1
        magnitude = Math.max(1, Math.round(magnitude));

        // Determine mouse message type based on pointer lock state
        const mtype = (document.pointerLockElement === this.element ? "m2" : "m");
        const button = (direction === 'up') ? 4 : 3; // Wheel up: 4, Wheel down: 3
        const mask = 1 << button;
        let toks;

        // Use the last known mouse coordinates (this.x, this.y) from the touch start/move
        this.buttonMask |= mask;
        toks = [ mtype, this.x, this.y, this.buttonMask, magnitude ];
        this.send(toks.join(","));

        // Ensure button release happens shortly after press
        setTimeout(() => {
             // Check if the button is still pressed before releasing
             if ((this.buttonMask & mask) !== 0) {
                this.buttonMask &= ~mask;
                toks = [ mtype, this.x, this.y, this.buttonMask, magnitude ];
                this.send(toks.join(","));
             }
        }, 10); // Small delay before sending release
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

    /** @private Called when pointer lock status changes */
    _pointerLock() {
        if (document.pointerLockElement === this.element) {
            this.send("p,1");
        } else {
            this.send("p,0");
        }
        const FAKE_CURSOR_ID = 'poc-dynamic-cursor-final';
        const fullscreenParent = this.element.parentElement; // Get the parent we fullscreen

        // Look inside the parent first, then fallback to document (less likely needed)
        let fakeCursor = fullscreenParent ? fullscreenParent.querySelector(`#${FAKE_CURSOR_ID}`) : null;
        if (!fakeCursor) {
            fakeCursor = document.getElementById(FAKE_CURSOR_ID); // Fallback check
        }

        const isLockedNow = (document.pointerLockElement === this.element);

        if (isLockedNow) {
            if (!fakeCursor) {
                 // Ensure the parent element actually exists before trying to use it
                 if (!fullscreenParent) {
                     console.error("POC _pointerLock: Cannot create cursor - this.element has no parentElement!");
                     return; // Cannot proceed without a parent to append to
                 }

                console.log("POC _pointerLock: Creating fake cursor inside parent element.");
                fakeCursor = document.createElement('div');
                fakeCursor.id = FAKE_CURSOR_ID;

                fakeCursor.style.position = 'absolute';
                fakeCursor.style.width = '10px';
                fakeCursor.style.height = '10px';
                fakeCursor.style.backgroundColor = 'lime';
                fakeCursor.style.borderWidth = '1px';
                fakeCursor.style.borderColor = 'black';
                fakeCursor.style.borderStyle = 'solid';
                fakeCursor.style.borderRadius = '50%';
                fakeCursor.style.pointerEvents = 'none';
                fakeCursor.style.zIndex = '10000';

                // Initialize position relative to the fullscreen parent
                fakeCursor.style.left = '0px';
                fakeCursor.style.top = '0px';

                fakeCursor.style.display = 'block';

                // --- Append to the PARENT element ---
                fullscreenParent.appendChild(fakeCursor);
                console.log("POC _pointerLock: Appended fake cursor to parentElement:", fullscreenParent);

            } else {
                 console.log("POC _pointerLock: Fake cursor exists, ensuring display.");
                 fakeCursor.style.display = 'block';
                 // Ensure it's still inside the correct parent if something moved it
                 if (fakeCursor.parentNode !== fullscreenParent) {
                     console.log("POC _pointerLock: Re-appending cursor to parentElement.");
                     fullscreenParent.appendChild(fakeCursor);
                 }
            }
        } else {
            // --- Pointer is UNLOCKED ---
            if (fakeCursor) {
                console.log("POC _pointerLock: Removing fake cursor.");
                fakeCursor.remove();
            } else {
                 console.log("POC _pointerLock: Fake cursor already removed or not found.");
            }
        }
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

    /**
     * Checks if the event target or its ancestors have a specific class.
     * @private
     * @param {EventTarget} target - The event target element.
     * @param {string} className - The class name to check for.
     * @returns {boolean} - True if the class is found, false otherwise.
     */
    _targetHasClass(target, className) {
        let element = target;
        while (element && element.classList) {
            if (element.classList.contains(className)) {
                return true;
            }
            element = element.parentElement;
        }
        return false;
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
            this.listeners_context.push(addListener(this.element, 'touchstart', this._handleTouchEvent, this, false));
            this.listeners_context.push(addListener(this.element, 'touchend', this._handleTouchEvent, this, false));
            this.listeners_context.push(addListener(this.element, 'touchmove', this._handleTouchEvent, this, false));
            this.listeners_context.push(addListener(this.element, 'touchcancel', this._handleTouchEvent, this, false));
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
        this._activeTouches.clear();
        this._activeTouchIdentifier = null;
        this._isTwoFingerGesture = false;
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
    const options = {
        capture: useCapture,
    };
    obj.addEventListener(name, newFunc, options);
    return [obj, name, newFunc, options];
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
