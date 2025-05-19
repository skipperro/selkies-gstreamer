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
import {
  GamepadManager
} from './gamepad.js';
import {
  Queue
} from './util.js';
/**
 * Map of known JavaScript keycodes which do not map to typable characters
 * to their X11 keysym equivalents.
 * @private
 */
const keycodeKeysyms = {
  8: [0xFF08], // backspace
  9: [0xFF09], // tab
  12: [0xFF0B, 0xFF0B, 0xFF0B, 0xFFB5], // clear       / KP 5
  13: [0xFF0D], // enter
  16: [0xFFE1, 0xFFE1, 0xFFE2], // shift
  17: [0xFFE3, 0xFFE3, 0xFFE4], // ctrl
  18: [0xFFE9, 0xFFE9, 0xFFEA], // alt
  19: [0xFF13], // pause/break
  20: [0xFFE5], // caps lock
  27: [0xFF1B], // escape
  32: [0x0020], // space
  33: [0xFF55, 0xFF55, 0xFF55, 0xFFB9], // page up     / KP 9
  34: [0xFF56, 0xFF56, 0xFF56, 0xFFB3], // page down   / KP 3
  35: [0xFF57, 0xFF57, 0xFF57, 0xFFB1], // end         / KP 1
  36: [0xFF50, 0xFF50, 0xFF50, 0xFFB7], // home        / KP 7
  37: [0xFF51, 0xFF51, 0xFF51, 0xFFB4], // left arrow  / KP 4
  38: [0xFF52, 0xFF52, 0xFF52, 0xFFB8], // up arrow    / KP 8
  39: [0xFF53, 0xFF53, 0xFF53, 0xFFB6], // right arrow / KP 6
  40: [0xFF54, 0xFF54, 0xFF54, 0xFFB2], // down arrow  / KP 2
  45: [0xFF63, 0xFF63, 0xFF63, 0xFFB0], // insert      / KP 0
  46: [0xFFFF, 0xFFFF, 0xFFFF, 0xFFAE], // delete      / KP decimal
  91: [0xFFE7], // left windows/command key (meta_l)
  92: [0xFFE8], // right window/command key (meta_r)
  93: [0xFF67], // menu key
  96: [0xFFB0], // KP 0
  97: [0xFFB1], // KP 1
  98: [0xFFB2], // KP 2
  99: [0xFFB3], // KP 3
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
  225: [0xFE03] // altgraph (iso_level3_shift)
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
  0xFFEC: true // Right super/hyper
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
  return (keysym >= 0x00 && keysym <= 0xFF) ||
    (keysym & 0xFFFF0000) === 0x01000000;
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
  else if (identifier.length === 1 && location !== 3 /* DOM_KEY_LOCATION_NUMPAD */ )
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
      state.hyper = e.getModifierState("OS") ||
        e.getModifierState("Super") ||
        e.getModifierState("Hyper") ||
        e.getModifierState("Win"); // Some browsers might use "Win"
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
    this._TAP_THRESHOLD_DISTANCE_SQ = 10 * 10; // Check squared distance (faster)
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
    keyEvent.keysym = keysym_from_key_identifier(keyEvent.key, keyEvent.location) ||
      keysym_from_keycode(keyEvent.keyCode, keyEvent.location);
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
    if ((prevent_ctrl && keyEvent.modifiers.ctrl) ||
      (prevent_alt && keyEvent.modifiers.alt) ||
      keyEvent.modifiers.meta ||
      keyEvent.modifiers.hyper) {
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
    keyEvent.keysym = keysym_from_key_identifier(keyEvent.key, keyEvent.location) ||
      keysym_from_keycode(keyEvent.keyCode, keyEvent.location);
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
    } else if (!remoteState && localState === true) {
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
    this._guac_updateModifierState('alt', [0xFFE9, 0xFFEA, 0xFE03], keyEvent);
    this._guac_updateModifierState('shift', [0xFFE1, 0xFFE2], keyEvent);
    this._guac_updateModifierState('ctrl', [0xFFE3, 0xFFE4], keyEvent);
    this._guac_updateModifierState('meta', [0xFFE7, 0xFFE8], keyEvent);
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
      } else if (this._eventLog[1] && this._eventLog[1]._internalType === 'keypress') {
        keysym = this._eventLog[1].keysym;
        accepted_events = this._eventLog.splice(0, 2);
      } else if (this._eventLog[1]) {
        keysym = first.keysym;
        accepted_events = this._eventLog.splice(0, 1);
      } else {
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
    } else if (first._internalType === 'keyup') {
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
    } else {
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
    if (this._guac_interpret_events()) {
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
          this.x = 0;
          this.y = 0; // Fallback
        }
      } else {
        if (!this.m /*&& event.type === 'mousemove' - redundant check */ ) {
          this._windowMath();
        }
        if (this.m) {
          this.x = this._clientToServerX(event.clientX); // Assign mapped absolute to this.x
          this.y = this._clientToServerY(event.clientY); // Assign mapped absolute to this.y
        } else {
          this.x = 0;
          this.y = 0; // Fallback
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
    var toks = [mtype, this.x, this.y, this.buttonMask, 0];
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
        this.x = 0;
        this.y = 0;
      }
    } else {
      if (!this.m) this._windowMath();
      if (this.m) {
        this.x = this._clientToServerX(touchPoint.clientX);
        this.y = this._clientToServerY(touchPoint.clientY);
      } else {
        this.x = 0;
        this.y = 0;
      }
    }
  }
  _sendMouseState() {
    const mtype = (document.pointerLockElement === this.element || this.mouseRelative) ? "m2" : "m";
    const toks = [mtype, this.x, this.y, this.buttonMask, 0];
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
        /*
         * This Source Code Form is subject to the terms of the Mozilla Public
         * License, v. 2.0. If a copy of the MPL was not distributed with this
         * file, You can obtain one at https://mozilla.org/MPL/2.0/.
         */
        /* This Source Code Form is subject to the terms of the Mozilla Public
         * License, v. 2.0. If a copy of the MPL was not distributed with this
         * file, You can obtain one at https://mozilla.org/MPL/2.0/.
         *
         * This file incorporates work covered by the following copyright and
         * permission notice:
         *
         *   Copyright 2019 Google LLC
         *
         *   Licensed under the Apache License, Version 2.0 (the "License");
         *   you may not use this file except in compliance with the License.
         *   You may obtain a copy of the License at
         *
         *        http://www.apache.org/licenses/LICENSE-2.0
         *
         *   Unless required by applicable law or agreed to in writing, software
         *   distributed under the License is distributed on an "AS IS" BASIS,
         *   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
         *   See the License for the specific language governing permissions and
         *   limitations under the License.
         */
        /**
         * @typedef {Object} WebRTCDemoSignalling
         * @property {function} ondebug - Callback fired when a new debug message is set.
         * @property {function} onstatus - Callback fired when a new status message is set.
         * @property {function} onerror - Callback fired when an error occurs.
         * @property {function} onice - Callback fired when a new ICE candidate is received.
         * @property {function} onsdp - Callback fired when SDP is received.
         * @property {function} connect - initiate connection to server.
         * @property {function} disconnect - close connection to server.
         */
        export class WebRTCDemoSignalling {
          /**
           * Interface to WebRTC demo signalling server.
           * Protocol: https://github.com/GStreamer/gstreamer/blob/main/subprojects/gst-examples/webrtc/signalling/Protocol.md
           *
           * @constructor
           * @param {URL} [server]
           *    The URL object of the signalling server to connect to, created with `new URL()`.
           *    Signalling implementation is here:
           *      https://github.com/GStreamer/gstreamer/tree/main/subprojects/gst-examples/webrtc/signalling
           * @param {number} peerId - The peer ID for this signalling instance (1 for video, 3 for audio).
           */
          constructor(server, peerId) {
            /**
             * @private
             * @type {URL}
             */
            this._server = server;
            /**
             * @private
             * @type {number}
             */
            this.peer_id = peerId;
            /**
             * @private
             * @type {WebSocket}
             */
            this._ws_conn = null;
            /**
             * @event
             * @type {function}
             */
            this.onstatus = null;
            /**
             * @event
             * @type {function}
             */
            this.onerror = null;
            /**
             * @type {function}
             */
            this.ondebug = null;
            /**
             * @event
             * @type {function}
             */
            this.onice = null;
            /**
             * @event
             * @type {function}
             */
            this.onsdp = null;
            /**
             * @event
             * @type {function}
             */
            this.ondisconnect = null;
            /**
             * @type {string}
             */
            this.state = 'disconnected';
            /**
             * @type {number}
             */
            this.retry_count = 0;
            /**
             * @type {object}
             */
            this.webrtcInput = null;
          }
          /**
           * Sets status message.
           *
           * @private
           * @param {string} message
           */
          _setStatus(message) {
            if (this.onstatus !== null) {
              this.onstatus(message);
            }
          }
          /**
           * Sets a debug message.
           * @private
           * @param {string} message
           */
          _setDebug(message) {
            if (this.ondebug !== null) {
              this.ondebug(message);
            }
          }
          /**
           * Sets error message.
           *
           * @private
           * @param {string} message
           */
          _setError(message) {
            if (this.onerror !== null) {
              this.onerror(message);
            }
          }
          /**
           * Sets SDP
           *
           * @private
           * @param {string} message
           */
          _setSDP(sdp) {
            if (this.onsdp !== null) {
              this.onsdp(sdp);
            }
          }
          /**
           * Sets ICE
           *
           * @private
           * @param {RTCIceCandidate} icecandidate
           */
          _setICE(icecandidate) {
            if (this.onice !== null) {
              this.onice(icecandidate);
            }
          }
          /**
           * Fired whenever the signalling websocket is opened.
           * Sends the peer id to the signalling server.
           *
           * @private
           * @event
           */
          _onServerOpen() {
            const currRes = this.webrtcInput ? this.webrtcInput.getWindowResolution() : [window.innerWidth, window.innerHeight];
            const meta = {
              res: `${currRes[0]}x${currRes[1]}`,
              scale: window.devicePixelRatio,
            };
            this.state = 'connected';
            this._ws_conn.send(`HELLO ${this.peer_id} ${btoa(JSON.stringify(meta))}`);
            this._setStatus(`Registering with server, peer ID: ${this.peer_id}`);
            this.retry_count = 0;
          }
          /**
           * Fired whenever the signalling websocket emits and error.
           * Reconnects after 3 seconds.
           *
           * @private
           * @event
           */
          _onServerError() {
            this._setStatus('Connection error, retry in 3 seconds.');
            this.retry_count++;
            if (this._ws_conn.readyState === WebSocket.CLOSED) {
              setTimeout(() => {
                if (this.retry_count > 3) {
                  window.location.replace(
                    window.location.href.replace(window.location.pathname, '/')
                  );
                } else {
                  this.connect();
                }
              }, 3000);
            }
          }
          /**
           * Fired whenever a message is received from the signalling server.
           * Message types:
           *   HELLO: response from server indicating peer is registered.
           *   ERROR*: error messages from server.
           *   {"sdp": ...}: JSON SDP message
           *   {"ice": ...}: JSON ICE message
           *
           * @private
           * @event
           * @param {MessageEvent} event The event: https://developer.mozilla.org/en-US/docs/Web/API/MessageEvent
           */
          _onServerMessage(event) {
            this._setDebug(`server message: ${event.data}`);
            if (event.data === 'HELLO') {
              this._setStatus('Registered with server.');
              this._setStatus('Waiting for stream.');
              this.sendSessionRequest();
              return;
            }
            if (event.data.startsWith('ERROR')) {
              this._setStatus(`Error from server: ${event.data}`);
              return;
            }
            let msg;
            try {
              msg = JSON.parse(event.data);
            } catch (e) {
              if (e instanceof SyntaxError) {
                this._setError(`error parsing message as JSON: ${event.data}`);
              } else {
                this._setError(`failed to parse message: ${event.data}`);
              }
              return;
            }
            if (msg.sdp != null) {
              this._setSDP(new RTCSessionDescription(msg.sdp));
            } else if (msg.ice != null) {
              const icecandidate = new RTCIceCandidate(msg.ice);
              this._setICE(icecandidate);
            } else {
              this._setError(`unhandled JSON message: ${msg}`);
            }
          }
          /**
           * Fired whenever the signalling websocket is closed.
           * Reconnects after 1 second.
           *
           * @private
           * @event
           */
          _onServerClose() {
            if (this.state !== 'connecting') {
              this.state = 'disconnected';
              this._setError('Server closed connection.');
              if (this.ondisconnect !== null) this.ondisconnect();
            }
          }
          /**
           * Initiates the connection to the signalling server.
           * After this is called, a series of handshakes occurs between the signalling
           * server and the server (peer) to negotiate ICE candidates and media capabilities.
           */
          connect() {
            this.state = 'connecting';
            this._setStatus('Connecting to server.');
            this._ws_conn = new WebSocket(this._server.href);
            this._ws_conn.addEventListener('open', this._onServerOpen.bind(this));
            this._ws_conn.addEventListener('error', this._onServerError.bind(this));
            this._ws_conn.addEventListener('message', this._onServerMessage.bind(this));
            this._ws_conn.addEventListener('close', this._onServerClose.bind(this));
          }
          /**
           * Closes connection to signalling server.
           * Triggers onServerClose event.
           */
          disconnect() {
            if (this._ws_conn) {
              this._ws_conn.close();
            }
          }
          /**
           * Send ICE candidate.
           *
           * @param {RTCIceCandidate} ice
           */
          sendICE(ice) {
            if (this._ws_conn && this._ws_conn.readyState === WebSocket.OPEN) {
              this._setDebug(`sending ice candidate: ${JSON.stringify(ice)}`);
              this._ws_conn.send(JSON.stringify({
                ice
              }));
            } else {
              console.warn("Websocket not open, cannot send ICE candidate.");
            }
          }
          /**
           * Send local session description.
           *
           * @param {RTCSessionDescription} sdp
           */
          sendSDP(sdp) {
            if (this._ws_conn && this._ws_conn.readyState === WebSocket.OPEN) {
              this._setDebug(`sending local sdp: ${JSON.stringify(sdp)}`);
              this._ws_conn.send(JSON.stringify({
                sdp
              }));
            } else {
              console.warn("Websocket not open, cannot send SDP.");
            }
          }
          /**
           * Send SESSION request to the server to initiate WebRTC session.
           * @private
           */
          sendSessionRequest() {
            if (this._ws_conn && this._ws_conn.readyState === WebSocket.OPEN) {
              this._setDebug(
                `Sending SESSION request to server, peer ID: ${this.peer_id}`
              );
              this._ws_conn.send(`SESSION ${this.peer_id}`);
            } else {
              console.warn("Websocket not open, cannot send SESSION request.");
            }
          }
          /**
           * Sets the webrtc input object
           * @param {object} input - The webrtc.input object.
           */
          setInput(input) {
            this.webrtcInput = input;
          }
        }
        import {
          GamepadManager
        } from './lib/gamepad.js';
        import {
          Input
        } from './lib/input.js';
        import {
          WebRTCDemo
        } from './lib/webrtc.js';
        let webrtc;
        let audio_webrtc;
        let signalling;
        let audio_signalling;
        let decoder;
        let audioDecoderWorker = null;
        let canvas = null;
        let canvasContext = null;
        let websocket;
        let clientMode = null;
        let videoConnected = '';
        let audioConnected = '';
        let audioContext;
        let audioWorkletNode;
        let audioWorkletProcessorPort;
        const audioBufferQueue = [];
        window.currentAudioBufferSize = 0;
        /** @type {VideoFrame[]} */
        let videoFrameBuffer = [];
        let jpegStripeRenderQueue = [];
        let videoBufferSize = 0;
        let videoBufferSelectElement;
        let videoBufferDivElement;
        let serverClipboardTextareaElement;
        let serverClipboardContent = '';
        let triggerInitializeDecoder = () => {
          console.error("initializeDecoder function not yet assigned!");
        };
        let isVideoPipelineActive = true;
        let isAudioPipelineActive = true;
        let isMicrophoneActive = false;
        let isGamepadEnabled; // Will be loaded from localStorage
        let gamepadStates = {};
        let lastReceivedVideoFrameId = -1;
        const GAMEPAD_VIS_THRESHOLD = 0.1;
        const STICK_VIS_MULTIPLIER = 10;
        // Microphone related resources
        let micStream = null;
        let micAudioContext = null;
        let micSourceNode = null;
        let micWorkletNode = null;
        let preferredInputDeviceId = null;
        let preferredOutputDeviceId = null;
        let advancedAudioSettingsBtnElement;
        let audioDeviceSettingsDivElement;
        let audioInputSelectElement;
        let audioOutputSelectElement;
        let crfSelectElement;
        let metricsIntervalId = null;
        const METRICS_INTERVAL_MS = 100;
        const UPLOAD_CHUNK_SIZE = (1024 * 1024) - 1;
        const MAX_SIDEBAR_UPLOADS = 3;
        let uploadProgressContainerElement;
        let activeUploads = {};
        // Elements for resolution controls
        let manualWidthInput;
        let manualHeightInput;
        let scaleLocallyCheckbox;
        let setResolutionButton;
        let resetResolutionButton;
        window.isManualResolutionMode = false; // Will be loaded from localStorage
        let manualWidth = null; // Will be loaded from localStorage
        let manualHeight = null; // Will be loaded from localStorage
        let autoResizeHandler = null;
        let debouncedAutoResizeHandler = null;
        let originalWindowResizeHandler = null;
        let handleResizeUI_globalRef = null;
        // --- START VNC H.264 STRIPE DECODER ADDITIONS ---
        let vncStripeDecoders = {}; // Key: stripe_y_start, Value: { decoder: VideoDecoder, pendingChunks: [] }
        let vncStripeFrameMetadata = {}; // Key: chunkTimestamp, Value: { y: stripe_y_start, id: vncFrameID }
        let currentEncoderMode = 'x264enc-stiped'; // Default, will be updated from settings
        window.onload = () => {
          'use strict';
        };

        function getCookieValue(name) {
          const b = document.cookie.match(`(^|[^;]+)\\s*${name}\\s*=\\s*([^;]+)`);
          return b ? b.pop() : '';
        }
        const appName =
          window.location.pathname.endsWith('/') &&
          window.location.pathname.split('/')[1] || 'webrtc';
        let videoBitRate = 8000;
        let videoFramerate = 60;
        let videoCRF = 25;
        let audioBitRate = 320000;
        let showStart = true;
        const logEntries = [];
        const debugEntries = [];
        let status = 'connecting';
        let loadingText = '';
        const gamepad = {
          gamepadState: 'disconnected',
          gamepadName: 'none',
        };
        const connectionStat = {
          connectionStatType: 'unknown',
          connectionLatency: 0,
          connectionVideoLatency: 0,
          connectionAudioLatency: 0,
          connectionAudioCodecName: 'NA',
          connectionAudioBitrate: 0,
          connectionPacketsReceived: 0,
          connectionPacketsLost: 0,
          connectionBytesReceived: 0,
          connectionBytesSent: 0,
          connectionCodec: 'unknown',
          connectionVideoDecoder: 'unknown',
          connectionResolution: '',
          connectionFrameRate: 0,
          connectionVideoBitrate: 0,
          connectionAvailableBandwidth: 0,
        };
        const gpuStat = {
          gpuLoad: 0,
          gpuMemoryTotal: 0,
          gpuMemoryUsed: 0,
        };
        const cpuStat = {
          serverCPUUsage: 0,
          serverMemoryTotal: 0,
          serverMemoryUsed: 0,
        };
        let serverLatency = 0;
        let resizeRemote = true;
        let debug = false;
        let turnSwitch = false;
        let publishingAllowed = false;
        let publishingIdle = false;
        let publishingError = '';
        let publishingAppName = '';
        let publishingAppDisplayName = '';
        let publishingAppDescription = '';
        let publishingAppIcon = '';
        let publishingValid = false;
        let streamStarted = false;
        let inputInitialized = false;
        let scaleLocallyManual;
        window.fps = 0;
        let frameCount = 0;
        let lastFpsUpdateTime = performance.now();
        let uniqueStripedFrameIdsThisPeriod = new Set();
        let lastStripedFpsUpdateTime = performance.now();
        let statusDisplayElement;
        let videoElement;
        let audioElement;
        let playButtonElement;
        let overlayInput;
        let videoBitrateSelectElement;
        let encoderSelectElement;
        let framerateSelectElement;
        let systemStatsDivElement;
        let gpuStatsDivElement;
        let fpsCounterDivElement;
        let audioBufferDivElement;
        let videoToggleButtonElement;
        let audioToggleButtonElement;
        let gamepadToggleButtonElement;
        let micToggleButtonElement;
        const getIntParam = (key, default_value) => {
          const prefixedKey = `${appName}_${key}`;
          const value = window.localStorage.getItem(prefixedKey);
          // Return default_value if null or undefined, otherwise parse
          return (value === null || value === undefined) ? default_value : parseInt(value);
        };
        const setIntParam = (key, value) => {
          const prefixedKey = `${appName}_${key}`;
          if (value === null || value === undefined) {
            window.localStorage.removeItem(prefixedKey);
          } else {
            window.localStorage.setItem(prefixedKey, value.toString());
          }
        };
        const getBoolParam = (key, default_value) => {
          const prefixedKey = `${appName}_${key}`;
          const v = window.localStorage.getItem(prefixedKey);
          if (v === null) {
            return default_value;
          }
          return v.toString().toLowerCase() === 'true';
        };
        const setBoolParam = (key, value) => {
          const prefixedKey = `${appName}_${key}`;
          if (value === null || value === undefined) {
            window.localStorage.removeItem(prefixedKey);
          } else {
            window.localStorage.setItem(prefixedKey, value.toString());
          }
        };
        const getStringParam = (key, default_value) => {
          const prefixedKey = `${appName}_${key}`;
          const value = window.localStorage.getItem(prefixedKey);
          return (value === null || value === undefined) ? default_value : value;
        };
        const setStringParam = (key, value) => {
          const prefixedKey = `${appName}_${key}`;
          if (value === null || value === undefined) {
            window.localStorage.removeItem(prefixedKey);
          } else {
            window.localStorage.setItem(prefixedKey, value.toString());
          }
        };
        // --- Load Persisted Settings ---
        videoBitRate = getIntParam('videoBitRate', videoBitRate);
        videoFramerate = getIntParam('videoFramerate', videoFramerate);
        videoCRF = getIntParam('videoCRF', videoCRF);
        audioBitRate = getIntParam('audioBitRate', audioBitRate);
        resizeRemote = getBoolParam('resizeRemote', resizeRemote);
        debug = getBoolParam('debug', debug);
        turnSwitch = getBoolParam('turnSwitch', turnSwitch);
        videoBufferSize = getIntParam('videoBufferSize', 0);
        currentEncoderMode = getStringParam('encoder', 'x264enc-striped');
        scaleLocallyManual = getBoolParam('scaleLocallyManual', true);
        isManualResolutionMode = getBoolParam('isManualResolutionMode', false);
        manualWidth = getIntParam('manualWidth', null);
        manualHeight = getIntParam('manualHeight', null);
        isGamepadEnabled = getBoolParam('isGamepadEnabled', true);
        const getUsername = () => getCookieValue(`broker_${appName}`)?.split('#')[0] || 'webrtc';
        const enterFullscreen = () => {
          if (
            clientMode === 'webrtc' &&
            webrtc &&
            'input' in webrtc &&
            'enterFullscreen' in webrtc.input
          ) {
            webrtc.input.enterFullscreen();
          } else if (
            clientMode === 'websockets' &&
            'webrtcInput' in window
          ) {
            window.webrtcInput.enterFullscreen();
          }
        };
        const playStream = () => {
          if (clientMode === 'webrtc') {
            webrtc.playStream();
            audio_webrtc.playStream();
          }
          showStart = false;
          playButtonElement.classList.add('hidden');
          statusDisplayElement.classList.add('hidden');
        };
        const enableClipboard = () => {
          navigator.clipboard
            .readText()
            .then((text) => {
              webrtc._setStatus('clipboard enabled');
              webrtc.sendDataChannelMessage('cr');
            })
            .catch((err) => {
              if (clientMode === 'webrtc') {
                webrtc._setError(`Failed to read clipboard contents: ${err}`);
              } else if (clientMode === 'websockets') {
                console.error(`Failed to read clipboard contents: ${err}`);
              }
            });
        };
        const publish = () => {
          const data = {
            name: publishingAppName,
            displayName: publishingAppDisplayName,
            description: publishingAppDescription,
            icon: publishingAppIcon,
          };
          fetch(`./publish/${appName}`, {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
              },
              body: JSON.stringify(data),
            })
            .then((response) => response.json())
            .then((response) => {
              if (response.code === 201) {
                publishingIdle = false;
                checkPublishing();
              } else {
                publishingError = response.status;
                updatePublishingErrorDisplay();
              }
            });
        };
        const updateStatusDisplay = () => {
          statusDisplayElement.textContent = loadingText;
        };
        const appendLogEntry = (message) => {
          logEntries.push(applyTimestamp(`[signalling] ${message}`));
          updateLogOutput();
        };
        const appendLogError = (message) => {
          logEntries.push(applyTimestamp(`[signalling] [ERROR] ${message}`));
          updateLogOutput();
        };
        const appendDebugEntry = (message) => {
          debugEntries.push(`[signalling] ${message}`);
          updateDebugOutput();
        };
        const updateLogOutput = () => {};
        const updateDebugOutput = () => {};
        const updatePublishingErrorDisplay = () => {};
        const roundDownToEven = (num) => {
          return Math.floor(num / 2) * 2;
        };
        const injectCSS = () => {
          const style = document.createElement('style');
          style.textContent = `
body {
  font-family: sans-serif;
  margin: 0;
  padding: 0;
  overflow: hidden;
  background-color: #000;
  color: #fff;
}
#app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
}
#app.dev-mode {
  flex-direction: row;
}
.video-container {
  flex-grow: 1;
  flex-shrink: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
  width: 100%;
  position: relative;
  overflow: hidden;
}
.video-container video,
.video-container canvas,
.video-container #overlayInput {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
}
.video-container video {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.video-container #videoCanvas {
    z-index: 2;
    pointer-events: none;
    display: block;
}
.video-container #overlayInput {
    opacity: 0;
    z-index: 3;
    caret-color: transparent;
    background-color: transparent;
    color: transparent;
    pointer-events: auto;
    -webkit-user-select: none;
    border: none;
    outline: none;
    padding: 0;
    margin: 0;
}
.video-container #playButton {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
}
.hidden {
  display: none !important;
}
.video-container .status-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  padding: 5px;
  background-color: rgba(0, 0, 0, 0.7);
  color: #fff;
  text-align: center;
  z-index: 5;
}
#playButton {
  padding: 15px 30px;
  font-size: 1.5em;
  cursor: pointer;
  background-color: rgba(0, 0, 0, 0.5);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 3px;
  backdrop-filter: blur(5px);
}
#dev-sidebar {
  display: none;
}
#app.dev-mode #dev-sidebar {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  width: 300px;
  height: 100vh;
  background-color: #2e2e2e;
  color: #eee;
  padding: 10px;
  box-sizing: border-box;
  overflow-y: auto;
  gap: 10px; /* Add gap between items */
}
#dev-sidebar button {
    margin-bottom: 10px;
    padding: 8px;
    cursor: pointer;
    background-color: #444;
    color: white;
    border: 1px solid #555;
    border-radius: 3px;
    width: 100%;
    box-sizing: border-box;
    transition: background-color 0.2s ease;
}
#dev-sidebar button:hover {
    background-color: #555;
}
#dev-sidebar button.toggle-button.active {
    background-color: #3a8d3a;
    border-color: #5cb85c;
}
#dev-sidebar button.toggle-button.active:hover {
    background-color: #4cae4c;
}
#dev-sidebar button.toggle-button.inactive {
    background-color: #c9302c;
    border-color: #d43f3a;
}
#dev-sidebar button.toggle-button.inactive:hover {
    background-color: #d9534f;
}
.dev-setting-item {
    display: flex;
    flex-direction: column;
    margin-bottom: 10px;
}

.dev-setting-item label {
    margin-bottom: 5px;
    font-size: 0.9em;
    color: #bbb;
}
.dev-setting-item select {
    padding: 5px;
    background-color: #333;
    color: #eee;
    border: 1px solid #555;
    border-radius: 3px;
    font-size: 1em;
    width: 100%;
    box-sizing: border-box;
}
#audio-device-settings {
    border-top: 1px solid #555;
    padding-top: 10px;
    margin-top: 10px;
}
#audio-device-settings label {
    margin-top: 8px;
}
.dev-stats-item {
    display: flex;
    flex-direction: column;
    margin-bottom: 10px;
    border: 1px solid #555;
    padding: 8px;
    background-color: #333;
    font-family: monospace;
    font-size: 0.8em;
    white-space: pre-wrap;
    word-break: break-all;
}
.dev-stats-item label {
    margin-bottom: 5px;
    font-size: 0.9em;
    color: #bbb;
    font-family: sans-serif;
}
.dev-clipboard-item {
    display: flex;
    flex-direction: column;
    margin-bottom: 10px;
}
.dev-clipboard-item label {
    margin-bottom: 5px;
    font-size: 0.9em;
    color: #bbb;
}
.dev-clipboard-item textarea {
    padding: 5px;
    background-color: #333;
    color: #eee;
    border: 1px solid #555;
    border-radius: 3px;
    font-size: 0.9em;
    width: 100%;
    box-sizing: border-box;
    min-height: 80px; /* Give it some initial height */
    resize: vertical; /* Allow vertical resize */
    font-family: monospace; /* Use monospace for text content */
}
#upload-progress-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 10px;
    border-top: 1px solid #555;
    padding-top: 10px;
}
.upload-progress-item {
    background-color: #333;
    border: 1px solid #555;
    border-radius: 3px;
    padding: 6px;
    font-size: 0.8em;
    display: flex;
    flex-direction: column;
    gap: 4px;
    transition: opacity 0.5s ease-out;
}
.upload-progress-item.fade-out {
    opacity: 0;
}
.upload-progress-item .file-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: #ccc;
}
.upload-progress-bar-outer {
    width: 100%;
    height: 8px;
    background-color: #555;
    border-radius: 4px;
    overflow: hidden;
}
.upload-progress-bar-inner {
    height: 100%;
    width: 0%; /* Start at 0% */
    background-color: #ffc000; /* Progress color */
    border-radius: 4px;
    transition: width 0.1s linear;
}
.upload-progress-item.complete .upload-progress-bar-inner {
    background-color: #3a8d3a; /* Green for complete */
}
.upload-progress-item.error .upload-progress-bar-inner {
    background-color: #c9302c; /* Red for error */
    width: 100% !important; /* Show full bar for error indication */
}
.upload-progress-item.error .file-name {
    color: #ff8a8a; /* Lighter red for error text */
}
#gamepad-visualization-container {
    border-top: 1px solid #555;
    padding-top: 10px;
    margin-top: 10px;
}
#gamepad-visualization-container label {
    margin-bottom: 5px;
    font-size: 0.9em;
    color: #bbb;
    display: block; /* Ensure label is on its own line */
}
#gamepad-svg-vis {
    background-color: #222; /* Dark background for the SVG area */
    border-radius: 3px;
    display: block; /* Prevent extra space below */
    margin-top: 10px; /* <<< ADDED THIS LINE for padding */
}
  `;
          document.head.appendChild(style);
        };

        function updateToggleButtonAppearance(buttonElement, isActive) {
          if (!buttonElement) return;
          let label = 'Unknown';
          if (buttonElement.id === 'videoToggleBtn') label = 'Video';
          else if (buttonElement.id === 'audioToggleBtn') label = 'Audio';
          else if (buttonElement.id === 'micToggleBtn') label = 'Microphone';
          else if (buttonElement.id === 'gamepadToggleBtn') label = 'Gamepad';
          if (isActive) {
            buttonElement.textContent = `${label}: ON`;
            buttonElement.classList.remove('inactive');
            buttonElement.classList.add('active');
          } else {
            buttonElement.textContent = `${label}: OFF`;
            buttonElement.classList.remove('active');
            buttonElement.classList.add('inactive');
          }
        }
        /** NEW HELPER FUNCTION
         * Sends the current resolution (manual or container-based) and pixel ratio to the server.
         * @param {number} width - The width to send.
         * @param {number} height - The height to send.
         */
        function sendResolutionToServer(width, height) {
          const pixelRatio = window.devicePixelRatio;
          const resString = `${width}x${height}`;
          console.log(`Sending resolution to server: ${resString}, Pixel Ratio: ${pixelRatio}`);
          if (clientMode === 'webrtc') {
            if (webrtc && webrtc.sendDataChannelMessage) {
              webrtc.sendDataChannelMessage(`r,${resString}`);
              webrtc.sendDataChannelMessage(`s,${pixelRatio}`);
            } else {
              console.warn("Cannot send resolution via WebRTC: Data channel not ready.");
            }
          } else if (clientMode === 'websockets') {
            if (websocket && websocket.readyState === WebSocket.OPEN) {
              // Assuming WebSocket messages 'r,' and 's,' are handled similarly
              websocket.send(`r,${resString}`);
              websocket.send(`s,${pixelRatio}`);
            } else {
              console.warn("Cannot send resolution via WebSocket: Connection not open.");
            }
          }
        }
        /** HELPER FUNCTION
         * Applies CSS styles to the canvas based on manual resolution settings and scaling preference.
         * @param {number} targetWidth - The desired internal width of the stream.
         * @param {number} targetHeight - The desired internal height of the stream.
         * @param {boolean} scaleToFit - If true, scale visually while maintaining aspect ratio.
         */
        function applyManualCanvasStyle(targetWidth, targetHeight, scaleToFit) {
          if (!canvas || !canvas.parentElement) {
            console.error("Cannot apply manual canvas style: Canvas or parent container not found.");
            return;
          }
          // Set internal buffer size
          if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            console.log(`Canvas internal buffer set to manual: ${targetWidth}x${targetHeight}`);
          }
          const container = canvas.parentElement;
          const containerWidth = container.clientWidth;
          const containerHeight = container.clientHeight;
          if (scaleToFit) {
            // Scale Locally (Maintain Aspect Ratio) - Checked
            const targetAspectRatio = targetWidth / targetHeight;
            const containerAspectRatio = containerWidth / containerHeight;
            let cssWidth, cssHeight;
            if (targetAspectRatio > containerAspectRatio) {
              cssWidth = containerWidth;
              cssHeight = containerWidth / targetAspectRatio;
            } else {
              cssHeight = containerHeight;
              cssWidth = containerHeight * targetAspectRatio;
            }
            const topOffset = (containerHeight - cssHeight) / 2;
            const leftOffset = (containerWidth - cssWidth) / 2;
            canvas.style.position = 'absolute';
            canvas.style.width = `${cssWidth}px`;
            canvas.style.height = `${cssHeight}px`;
            canvas.style.top = `${topOffset}px`;
            canvas.style.left = `${leftOffset}px`;
            canvas.style.objectFit = 'contain'; // Should be redundant if buffer matches target
            console.log(`Applied manual style (Scaled): CSS ${cssWidth}x${cssHeight}, Buffer ${targetWidth}x${targetHeight}, Pos ${leftOffset},${topOffset}`);
          } else {
            // Scale Locally - Unchecked (Exact resolution, top-left, overflow)
            canvas.style.position = 'absolute';
            canvas.style.width = `${targetWidth}px`; // CSS matches buffer
            canvas.style.height = `${targetHeight}px`; // CSS matches buffer
            canvas.style.top = '0px';
            canvas.style.left = '0px';
            canvas.style.objectFit = 'fill'; // Or 'none'
            console.log(`Applied manual style (Exact): CSS ${targetWidth}x${targetHeight}, Buffer ${targetWidth}x${targetHeight}, Pos 0,0`);
          }
          canvas.style.display = 'block';
        }
        /** HELPER FUNCTION
         * Resets the canvas CSS styles to default (fill container).
         */
        function resetCanvasStyle(streamWidth, streamHeight) {
          if (!canvas) return;
          // Set internal buffer size
          if (canvas.width !== streamWidth || canvas.height !== streamHeight) {
            canvas.width = streamWidth;
            canvas.height = streamHeight;
            console.log(`Canvas internal buffer reset to: ${streamWidth}x${streamHeight}`);
          }
          // Set CSS display style
          canvas.style.position = 'absolute';
          canvas.style.width = '100%';
          canvas.style.height = '100%';
          canvas.style.top = '0px';
          canvas.style.left = '0px';
          canvas.style.objectFit = 'contain'; // Crucial for aspect ratio with 100%
          canvas.style.display = 'block'; // Ensure it's visible
          console.log(`Reset canvas CSS style to 100% width/height, object-fit: contain. Buffer: ${streamWidth}x${streamHeight}`);
        }
        /**
         * Enables the automatic resizing behavior based on window/container size.
         */
        function enableAutoResize() {
          if (directManualLocalScalingHandler) {
            console.log("Switching to Auto Mode: Removing direct manual local scaling listener.");
            window.removeEventListener('resize', directManualLocalScalingHandler);
          }
          if (originalWindowResizeHandler) {
            console.log("Switching to Auto Mode: Adding original (auto) debounced resize listener.");
            window.removeEventListener('resize', originalWindowResizeHandler); // Defensive removal
            window.addEventListener('resize', originalWindowResizeHandler);
            if (typeof handleResizeUI_globalRef === 'function') {
              console.log("Triggering immediate auto-resize calculation for auto mode.");
              handleResizeUI_globalRef();
            } else {
              console.warn("handleResizeUI function not directly callable from enableAutoResize. Auto-resize will occur on next event.");
            }
          } else {
            console.warn("Cannot enable auto-resize: originalWindowResizeHandler not found.");
          }
        }
        const directManualLocalScalingHandler = () => {
          if (window.isManualResolutionMode && manualWidth != null && manualHeight != null && manualWidth > 0 && manualHeight > 0) {
            applyManualCanvasStyle(manualWidth, manualHeight, scaleLocallyManual);
          }
        };
        /**
         * Disables the automatic resizing behavior.
         */
        function disableAutoResize() {
          if (originalWindowResizeHandler) {
            console.log("Switching to Manual Mode Local Scaling: Removing original (auto) resize listener.");
            window.removeEventListener('resize', originalWindowResizeHandler);
          }
          // Add the direct, non-debounced handler for manual local scaling
          console.log("Switching to Manual Mode Local Scaling: Adding direct manual scaling listener.");
          window.removeEventListener('resize', directManualLocalScalingHandler); // Defensive removal
          window.addEventListener('resize', directManualLocalScalingHandler);
          // Apply current manual style immediately to reflect the mode change and set initial view
          if (window.isManualResolutionMode && manualWidth != null && manualHeight != null && manualWidth > 0 && manualHeight > 0) {
            console.log("Applying current manual canvas style after enabling direct manual resize handler.");
            applyManualCanvasStyle(manualWidth, manualHeight, scaleLocallyManual);
          }
        }
        const initializeUI = () => {
          injectCSS();
          document.title = `Selkies - ${appName}`;
          window.addEventListener('requestFileUpload', handleRequestFileUpload);
          const appDiv = document.getElementById('app');
          if (!appDiv) {
            console.error("FATAL: Could not find #app element.");
            return;
          }
          const videoContainer = document.createElement('div');
          videoContainer.className = 'video-container';
          statusDisplayElement = document.createElement('div');
          statusDisplayElement.id = 'status-display';
          statusDisplayElement.className = 'status-bar';
          statusDisplayElement.textContent = 'Connecting...';
          statusDisplayElement.classList.toggle('hidden', !showStart);
          videoContainer.appendChild(statusDisplayElement);
          overlayInput = document.createElement('input');
          overlayInput.type = 'text';
          overlayInput.readOnly = true;
          overlayInput.id = 'overlayInput';
          videoContainer.appendChild(overlayInput);
          videoElement = document.createElement('video');
          videoElement.id = 'stream';
          videoElement.className = 'video';
          videoElement.autoplay = true;
          videoElement.playsInline = true;
          videoElement.contentEditable = 'true';
          videoContainer.appendChild(videoElement);
          canvas = document.getElementById('videoCanvas');
          if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'videoCanvas';
          }
          videoContainer.appendChild(canvas);
          // --- Initialize Canvas & Resize based on loaded settings ---
          if (isManualResolutionMode && manualWidth != null && manualHeight != null && manualWidth > 0 && manualHeight > 0) {
            applyManualCanvasStyle(manualWidth, manualHeight, scaleLocallyManual);
            disableAutoResize(); // Start disabled if manual mode is loaded
            console.log(`Initialized UI in Manual Resolution Mode: ${manualWidth}x${manualHeight}, ScaleLocally: ${scaleLocallyManual}`);
          } else {
            const initialStreamWidth = 1024; // Default if auto-size can't be determined yet
            const initialStreamHeight = 768;
            resetCanvasStyle(initialStreamWidth, initialStreamHeight);
            console.log("Initialized UI in Auto Resolution Mode (defaulting to 1024x768 for now)");
          }
          canvasContext = canvas.getContext('2d');
          if (!canvasContext) {
            console.error('Failed to get 2D rendering context');
          }
          audioElement = document.createElement('audio');
          audioElement.id = 'audio_stream';
          audioElement.style.display = 'none';
          audioElement.autoplay = true;
          audioElement.playsInline = true;
          videoContainer.appendChild(audioElement);
          playButtonElement = document.createElement('button');
          playButtonElement.id = 'playButton';
          playButtonElement.textContent = 'Play Stream';
          playButtonElement.classList.toggle('hidden', !showStart);
          videoContainer.appendChild(playButtonElement);
          const sidebarDiv = document.createElement('div');
          sidebarDiv.id = 'dev-sidebar';
          const hiddenFileInput = document.createElement('input');
          hiddenFileInput.type = 'file';
          hiddenFileInput.id = 'globalFileInput';
          hiddenFileInput.multiple = true;
          hiddenFileInput.style.display = 'none';
          document.body.appendChild(hiddenFileInput);
          hiddenFileInput.addEventListener('change', handleFileInputChange);
          if (!document.getElementById('keyboard-input-assist')) {
            const keyboardInputAssist = document.createElement('input');
            keyboardInputAssist.type = 'text';
            keyboardInputAssist.id = 'keyboard-input-assist';
            // Apply hiding styles directly
            keyboardInputAssist.style.position = 'absolute';
            keyboardInputAssist.style.left = '-9999px';
            keyboardInputAssist.style.top = '-9999px';
            keyboardInputAssist.style.width = '1px';
            keyboardInputAssist.style.height = '1px';
            keyboardInputAssist.style.opacity = '0';
            keyboardInputAssist.style.border = '0';
            keyboardInputAssist.style.padding = '0';
            keyboardInputAssist.style.caretColor = 'transparent';
            // Accessibility and browser hints
            keyboardInputAssist.setAttribute('aria-hidden', 'true');
            keyboardInputAssist.setAttribute('autocomplete', 'off');
            keyboardInputAssist.setAttribute('autocorrect', 'off');
            keyboardInputAssist.setAttribute('autocapitalize', 'off');
            keyboardInputAssist.setAttribute('spellcheck', 'false');
            document.body.appendChild(keyboardInputAssist); // Append to body
            console.log("Dynamically added #keyboard-input-assist element.");
          }
          appDiv.appendChild(videoContainer);
          updateStatusDisplay();
          updateLogOutput();
          updateDebugOutput();
          updatePublishingErrorDisplay();
          playButtonElement.addEventListener('click', playStream);
          if (clientMode === 'websockets') {
            playButtonElement.classList.add('hidden');
            statusDisplayElement.classList.remove('hidden');
          }
        };
        // --- START VNC H.264 STRIPE DECODER FUNCTIONS ---
        /**
         * Clears all active VNC stripe decoders and associated metadata.
         * Called when switching away from VNC mode, on resize, or pipeline stop.
         */
        function clearAllVncStripeDecoders() {
          console.log("Clearing all VNC stripe decoders.");
          for (const yPos in vncStripeDecoders) {
            if (vncStripeDecoders.hasOwnProperty(yPos)) {
              const decoderInfo = vncStripeDecoders[yPos];
              if (decoderInfo.decoder && decoderInfo.decoder.state !== "closed") {
                try {
                  decoderInfo.decoder.close();
                  console.log(`Closed VNC stripe decoder for Y=${yPos}`);
                } catch (e) {
                  console.error(`Error closing VNC stripe decoder for Y=${yPos}:`, e);
                }
              }
            }
          }
          vncStripeDecoders = {};
          vncStripeFrameMetadata = {}; // Also clear metadata for pending/decoded frames
          console.log("All VNC stripe decoders and metadata cleared.");
        }
        /**
         * Processes any pending H.264 chunks for a specific stripe's decoder.
         * This is typically called after the decoder has successfully configured.
         * @param {number} stripe_y_start The Y-offset of the stripe.
         */
        function processPendingChunksForStripe(stripe_y_start) {
          const decoderInfo = vncStripeDecoders[stripe_y_start];
          if (!decoderInfo || decoderInfo.decoder.state !== "configured" || !decoderInfo.pendingChunks) {
            return;
          }
          console.log(`Processing ${decoderInfo.pendingChunks.length} pending chunks for stripe Y=${stripe_y_start}`);
          while (decoderInfo.pendingChunks.length > 0) {
            const pending = decoderInfo.pendingChunks.shift();
            const chunk = new EncodedVideoChunk({
              type: pending.type,
              timestamp: pending.timestamp,
              data: pending.data
            });
            try {
              decoderInfo.decoder.decode(chunk);
            } catch (e) {
              console.error(`Error decoding pending chunk for stripe Y=${stripe_y_start}:`, e, chunk);
              // If decode fails, might need to reset this specific decoder
              // decoderInfo.decoder.reset(); // Or close and re-create on next key frame
            }
          }
        }
        /**
         * Handles a decoded VideoFrame from a VNC stripe decoder.
         * Draws the frame onto the main canvas at the correct Y-offset.
         * @param {VideoFrame} frame The decoded video frame.
         */
        window.vncStripesDecodedThisPeriod = 0;
        window.vncStripesArrivedThisPeriod = 0;
        window.lastVncStripeRateLogTime = performance.now();
        window.VNC_STRIPE_LOG_INTERVAL_MS = 1000;
        let decodedStripesQueue = [];

        function handleDecodedVncStripeFrame(yPos, vncFrameID, frame) { // vncFrameID can be omitted if not used
          decodedStripesQueue.push({
            yPos,
            frame,
            vncFrameID
          });
        }
        async function handleAdvancedAudioClick() {
          console.log("Advanced Audio Settings button clicked.");
          if (!audioDeviceSettingsDivElement || !audioInputSelectElement || !audioOutputSelectElement) {
            console.error("Audio device UI elements not found in dev sidebar.");
            return;
          }
          // Check if the settings are currently hidden
          const isHidden = audioDeviceSettingsDivElement.classList.contains('hidden');
          if (isHidden) {
            console.log("Settings are hidden, attempting to show and populate...");
            // Check for setSinkId support for output selection
            const supportsSinkId = typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype;
            const outputLabel = document.getElementById('audioOutputLabel');
            if (!supportsSinkId) {
              console.warn('Browser does not support selecting audio output device (setSinkId). Hiding output selection.');
              if (outputLabel) outputLabel.classList.add('hidden');
              audioOutputSelectElement.classList.add('hidden');
              return;
            } else {
              if (outputLabel) outputLabel.classList.remove('hidden');
              audioOutputSelectElement.classList.remove('hidden');
            }
            try {
              // Request temporary microphone permission to get device labels
              console.log("Requesting microphone permission for device listing...");
              const tempStream = await navigator.mediaDevices.getUserMedia({
                audio: true
              });
              tempStream.getTracks().forEach(track => track.stop());
              console.log("Microphone permission granted or already available (temporary stream stopped).");
              console.log("Enumerating media devices...");
              const devices = await navigator.mediaDevices.enumerateDevices();
              console.log("Devices found:", devices);
              // Clear existing options
              audioInputSelectElement.innerHTML = '';
              audioOutputSelectElement.innerHTML = '';
              // Populate dropdowns
              let inputCount = 0;
              let outputCount = 0;
              devices.forEach(device => {
                if (device.kind === 'audioinput') {
                  inputCount++;
                  const option = document.createElement('option');
                  option.value = device.deviceId;
                  option.textContent = device.label || `Microphone ${inputCount}`;
                  audioInputSelectElement.appendChild(option);
                } else if (device.kind === 'audiooutput' && supportsSinkId) {
                  outputCount++;
                  const option = document.createElement('option');
                  option.value = device.deviceId;
                  option.textContent = device.label || `Speaker ${outputCount}`;
                  audioOutputSelectElement.appendChild(option);
                }
              });
              console.log(`Populated ${inputCount} input devices and ${outputCount} output devices.`);
              // Make the container visible
              audioDeviceSettingsDivElement.classList.remove('hidden');
            } catch (err) {
              console.error('Error getting media devices or permissions:', err);
              // Keep it hidden and inform the user
              audioDeviceSettingsDivElement.classList.add('hidden');
              alert(`Could not list audio devices. Please ensure microphone permissions are granted.\nError: ${err.message || err.name}`);
            }
          } else {
            console.log("Settings are visible, hiding...");
            audioDeviceSettingsDivElement.classList.add('hidden');
          }
        }

        function handleAudioDeviceChange(event) {
          const selectedDeviceId = event.target.value;
          const isInput = event.target.id === 'audioInputSelect';
          const contextType = isInput ? 'input' : 'output';
          console.log(`Dev Sidebar: Audio device selected - Type: ${contextType}, ID: ${selectedDeviceId}. Posting message...`);
          window.postMessage({
            type: 'audioDeviceSelected',
            context: contextType,
            deviceId: selectedDeviceId
          }, window.location.origin);
        }

        function handleRequestFileUpload() {
          const hiddenInput = document.getElementById('globalFileInput');
          if (!hiddenInput) {
            console.error("Global file input not found!");
            return;
          }
          if (!websocket || websocket.readyState !== WebSocket.OPEN) {
            console.warn("WebSocket is not open. File upload cannot be initiated.");
            return;
          }
          console.log("Triggering click on hidden file input.");
          hiddenInput.click();
        }
        async function handleFileInputChange(event) {
          const files = event.target.files;
          if (!files || files.length === 0) {
            // Clear the input value in case the user cancels
            event.target.value = null;
            return;
          }
          console.log(`File input changed, processing ${files.length} files sequentially.`);
          if (!websocket || websocket.readyState !== WebSocket.OPEN) {
            console.error("WebSocket is not open. Cannot upload selected files.");
            // Maybe post an error message?
            window.postMessage({
              type: 'fileUpload',
              payload: {
                status: 'error',
                fileName: 'N/A',
                message: "WebSocket not open for upload."
              }
            }, window.location.origin);
            event.target.value = null;
            return;
          }
          try {
            for (let i = 0; i < files.length; i++) {
              const file = files[i];
              const pathToSend = file.name;
              console.log(`Uploading file ${i + 1}/${files.length}: ${pathToSend}`);
              // Await the upload of each file before starting the next
              await uploadFileObject(file, pathToSend);
            }
            console.log("Finished processing all files from input.");
          } catch (error) {
            const errorMsg = `An error occurred during the file input upload process: ${error.message || error}`;
            console.error(errorMsg);
            window.postMessage({
              type: 'fileUpload',
              payload: {
                status: 'error',
                fileName: 'N/A',
                message: errorMsg
              }
            }, window.location.origin);
            if (websocket && websocket.readyState === WebSocket.OPEN) {
              try {
                websocket.send(`FILE_UPLOAD_ERROR:GENERAL:File input processing failed`);
              } catch (_) {}
            }
          } finally {
            event.target.value = null;
          }
        }
        const startStream = () => {
          if (streamStarted) return;
          streamStarted = true;
          statusDisplayElement.classList.add('hidden');
          playButtonElement.classList.add('hidden');
        };

        function debounce(func, delay) {
          let timeoutId;
          return function(...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
              func.apply(this, args);
            }, delay);
          };
        }
        const initializeInput = () => {
          if (inputInitialized) {
            return;
          }
          inputInitialized = true;
          let inputInstance;
          const websocketSendInput = (message) => {
            if (
              clientMode === 'websockets' &&
              websocket &&
              websocket.readyState === WebSocket.OPEN
            ) {
              websocket.send(message);
            }
          };
          const webrtcSendInput = (message) => {
            if (clientMode === 'webrtc' && webrtc && webrtc.sendDataChannelMessage) {
              webrtc.sendDataChannelMessage(message);
            }
          };
          let sendInputFunction;
          if (clientMode === 'websockets') {
            sendInputFunction = websocketSendInput;
          } else if (clientMode === 'webrtc') {
            sendInputFunction = webrtcSendInput;
          } else {
            sendInputFunction = () => {};
          }
          inputInstance = new Input(overlayInput, sendInputFunction);
          // This function now calculates the container size for auto-resize purposes
          inputInstance.getWindowResolution = () => {
            const videoContainer = document.querySelector('.video-container');
            if (!videoContainer) {
              console.warn('video-container not found, using window size for resolution.');
              // Return raw window size, let the caller handle rounding if needed
              return [window.innerWidth, window.innerHeight];
            }
            const videoContainerRect = videoContainer.getBoundingClientRect();
            // Return raw container size, let the caller handle rounding if needed
            return [videoContainerRect.width, videoContainerRect.height];
          };
          inputInstance.ongamepadconnected = (gamepad_id) => {
            gamepad.gamepadState = 'connected';
            gamepad.gamepadName = gamepad_id;
            if (window.webrtcInput && window.webrtcInput.gamepadManager) {
              if (!isGamepadEnabled) {
                window.webrtcInput.gamepadManager.disable();
              }
            } else {
              console.error("Gamepad connected callback fired, but gamepadManager instance not found on webrtcInput.");
            }
          };
          inputInstance.ongamepaddisconnected = () => {
            gamepad.gamepadState = 'disconnected';
            gamepad.gamepadName = 'none';
          };
          inputInstance.attach();
          // Define the actual resize logic
          const handleResizeUI = () => {
            if (window.isManualResolutionMode) {
              console.log("Auto-resize skipped: Manual resolution mode active.");
              return;
            }
            console.log("Auto-resize triggered.");
            const windowResolution = inputInstance.getWindowResolution();
            const evenWidth = roundDownToEven(windowResolution[0]);
            const evenHeight = roundDownToEven(windowResolution[1]);
            sendResolutionToServer(evenWidth, evenHeight);
            // Update canvas buffer and reset style for auto mode
            resetCanvasStyle(evenWidth, evenHeight); // Pass the new stream dimensions
          };
          handleResizeUI_globalRef = handleResizeUI;
          // Store the debounced handler
          originalWindowResizeHandler = debounce(handleResizeUI, 500);
          // Add the listener only if NOT in manual mode initially
          if (!window.isManualResolutionMode) {
            console.log("Initializing Input: Attaching auto-resize listener.");
            window.addEventListener('resize', originalWindowResizeHandler);
            // Trigger initial resize calculation if not in manual mode
            handleResizeUI();
          } else {
            console.log("Initializing Input: Manual resolution mode active, skipping initial auto-resize listener attachment.");
          }
          if (clientMode === 'webrtc') {
            if (webrtc) {
              webrtc.input = inputInstance;
            }
          }
          overlayInput.addEventListener('dragover', handleDragOver);
          overlayInput.addEventListener('drop', handleDrop);
          window.webrtcInput = inputInstance;
          const keyboardInputAssist = document.getElementById('keyboard-input-assist');
          if (keyboardInputAssist && inputInstance) { // Check if both exist
            keyboardInputAssist.addEventListener('input', (event) => {
              const typedString = keyboardInputAssist.value;
              console.log(`Input event on assist: Value="${typedString}"`);
              if (typedString) {
                inputInstance._typeString(typedString);
                keyboardInputAssist.value = ''; // Clear after processing
              }
            });
            keyboardInputAssist.addEventListener('keydown', (event) => {
              if (event.key === 'Enter' || event.keyCode === 13) {
                console.log("Enter keydown detected on assist input.");
                const enterKeysym = 0xFF0D;
                inputInstance._guac_press(enterKeysym);
                setTimeout(() => inputInstance._guac_release(enterKeysym), 5);
                event.preventDefault();
                keyboardInputAssist.value = '';
              } else if (event.key === 'Backspace' || event.keyCode === 8) {
                console.log("Backspace keydown detected on assist input.");
                const backspaceKeysym = 0xFF08;
                inputInstance._guac_press(backspaceKeysym);
                setTimeout(() => inputInstance._guac_release(backspaceKeysym), 5);
                event.preventDefault();
              }
            });
            console.log("Added 'input' and 'keydown' listeners to #keyboard-input-assist.");
          } else {
            console.error("Could not add listeners to keyboard assist: Element or Input handler instance not found inside initializeInput.");
          }
        };
        /**
         * Attempts to apply the preferredOutputDeviceId to the playback audio context
         * and the audio element.
         */
        async function applyOutputDevice() {
          if (!preferredOutputDeviceId) {
            console.log("No preferred output device set, using default.");
            return;
          }
          const supportsSinkId = (typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype) ||
            (audioElement && typeof audioElement.setSinkId === 'function');
          if (!supportsSinkId) {
            console.warn("Browser does not support setSinkId, cannot apply output device preference.");
            // Hide the output selection UI elements if they exist and haven't been hidden already
            if (audioOutputSelectElement) audioOutputSelectElement.classList.add('hidden');
            const outputLabel = document.getElementById('audioOutputLabel');
            if (outputLabel) outputLabel.classList.add('hidden');
            return;
          }
          // Apply to Playback AudioContext
          if (audioContext) {
            if (audioContext.state === 'running') {
              try {
                // Check if the current sinkId is already the preferred one
                await audioContext.setSinkId(preferredOutputDeviceId);
                console.log(`Playback AudioContext output set to device: ${preferredOutputDeviceId}`);
              } catch (err) {
                console.error(`Error setting sinkId on Playback AudioContext (ID: ${preferredOutputDeviceId}): ${err.name}`, err);
              }
            } else {
              console.warn(`Playback AudioContext not running (state: ${audioContext.state}), cannot set sinkId yet.`);
            }
          } else {
            console.log("Playback AudioContext doesn't exist yet, sinkId will be applied on initialization.");
          }
          // Apply to <audio> element (for redundancy or direct playback scenarios)
          if (audioElement && typeof audioElement.setSinkId === 'function') {
            try {
              if (audioElement.sinkId !== preferredOutputDeviceId) {
                await audioElement.setSinkId(preferredOutputDeviceId);
                console.log(`<audio> element output set to device: ${preferredOutputDeviceId}`);
              }
            } catch (err) {
              console.error(`Error setting sinkId on <audio> element (ID: ${preferredOutputDeviceId}): ${err.name}`, err);
            }
          }
        }
        window.addEventListener('message', receiveMessage, false);

        function postSidebarButtonUpdate() {
          // Gather current states
          const updatePayload = {
            type: 'sidebarButtonStatusUpdate',
            video: isVideoPipelineActive,
            audio: isAudioPipelineActive,
            microphone: isMicrophoneActive,
            gamepad: isGamepadEnabled
          };
          console.log('Posting sidebarButtonStatusUpdate:', updatePayload);
          window.postMessage(updatePayload, window.location.origin);
        }

        function receiveMessage(event) {
          // 1. Origin Check (Security)
          if (event.origin !== window.location.origin) {
            console.warn(`Received message from unexpected origin: ${event.origin}. Expected ${window.location.origin}. Ignoring.`);
            return;
          }
          const message = event.data;
          // 2. Message Type Check (Basic Validation)
          if (typeof message !== 'object' || message === null) {
            console.warn('Received non-object message via window.postMessage:', message);
            return;
          }
          if (!message.type) {
            console.warn('Received message without a type property:', message);
            return;
          }
          // 3. Message Handling based on type
          switch (message.type) {
            case 'setScaleLocally':
              if (typeof message.value === 'boolean') {
                scaleLocallyManual = message.value;
                setBoolParam('scaleLocallyManual', scaleLocallyManual); // Persist the setting
                console.log(`Set scaleLocallyManual to ${scaleLocallyManual} and persisted.`);
                // If we are currently in manual mode, re-apply the style immediately
                if (window.isManualResolutionMode && manualWidth !== null && manualHeight !== null) {
                  console.log("Applying new scaling style in manual mode.");
                  applyManualCanvasStyle(manualWidth, manualHeight, scaleLocallyManual);
                }
              } else {
                console.warn("Invalid value received for setScaleLocally:", message.value);
              }
              break;
            case 'showVirtualKeyboard':
              console.log("Received 'showVirtualKeyboard' message.");
              const kbdAssistInput = document.getElementById('keyboard-input-assist');
              if (kbdAssistInput) {
                kbdAssistInput.value = '';
                kbdAssistInput.focus();
                console.log("Focused #keyboard-input-assist element.");
              } else {
                console.error("Could not find #keyboard-input-assist element to focus.");
              }
              break;
            case 'setManualResolution':
              // Validation already happened in the UI event listener, but double-check here
              const width = parseInt(message.width, 10);
              const height = parseInt(message.height, 10);
              if (isNaN(width) || width <= 0 || isNaN(height) || height <= 0) {
                console.error('Received invalid width/height for setManualResolution:', message);
                break;
              }
              console.log(`Setting manual resolution: ${width}x${height}`);
              window.isManualResolutionMode = true;
              manualWidth = roundDownToEven(width);
              manualHeight = roundDownToEven(height);
              console.log(`Rounded resolution to even numbers: ${manualWidth}x${manualHeight}`);
              setIntParam('manualWidth', manualWidth);
              setIntParam('manualHeight', manualHeight);
              setBoolParam('isManualResolutionMode', true);
              disableAutoResize(); // Stop listening to window resize
              sendResolutionToServer(manualWidth, manualHeight); // Send new res to server
              applyManualCanvasStyle(manualWidth, manualHeight, scaleLocallyManual); // Apply local styling
              if (currentEncoderMode === 'x264enc-striped') {
                console.log("Clearing VNC stripe decoders due to manual resolution change.");
                clearAllVncStripeDecoders();
                if (canvasContext) canvasContext.setTransform(1, 0, 0, 1, 0, 0);
                canvasContext.clearRect(0, 0, canvas.width, canvas.height);
              }
              break;
            case 'resetResolutionToWindow':
              console.log("Resetting resolution to window size.");
              window.isManualResolutionMode = false;
              manualWidth = null;
              manualHeight = null;
              // --- Clear Persisted Manual Resolution Settings ---
              setIntParam('manualWidth', null);
              setIntParam('manualHeight', null);
              setBoolParam('isManualResolutionMode', false);
              // Calculate current auto-resolution
              const currentWindowRes = window.webrtcInput ? window.webrtcInput.getWindowResolution() : [window.innerWidth, window.innerHeight];
              const autoWidth = roundDownToEven(currentWindowRes[0]);
              const autoHeight = roundDownToEven(currentWindowRes[1]);
              resetCanvasStyle(autoWidth, autoHeight); // Reset local canvas styling first
              if (currentEncoderMode === 'x264enc-striped') {
                console.log("Clearing VNC stripe decoders due to resolution reset to window.");
                clearAllVncStripeDecoders();
                if (canvasContext) canvasContext.setTransform(1, 0, 0, 1, 0, 0);
                canvasContext.clearRect(0, 0, canvas.width, canvas.height);
              }
              enableAutoResize(); // Re-enable listener and trigger immediate resize
              break;
            case 'settings':
              console.log('Received settings message:', message.settings);
              handleSettingsMessage(message.settings);
              break;
            case 'getStats':
              console.log('Received getStats message.');
              sendStatsMessage();
              break;
            case 'clipboardUpdateFromUI':
              console.log('Received clipboardUpdateFromUI message.');
              const newClipboardText = message.text;
              if (clientMode === 'websockets' && websocket && websocket.readyState === WebSocket.OPEN) {
                try {
                  const encodedText = btoa(newClipboardText); // Base64 encode
                  const clipboardMessage = `cw,${encodedText}`; // Prepend type
                  websocket.send(clipboardMessage);
                  console.log(`Sent clipboard update from UI to server: cw,...`);
                } catch (e) {
                  console.error('Failed to encode or send clipboard text from UI:', e);
                }
              } else if (clientMode === 'webrtc' && webrtc && webrtc.sendDataChannelMessage) {
                try {
                  const encodedText = btoa(newClipboardText); // Base64 encode
                  const clipboardMessage = `cw,${encodedText}`; // Prepend type
                  webrtc.sendDataChannelMessage(clipboardMessage);
                  console.log(`Sent clipboard update from UI to server via WebRTC: cw,...`);
                } catch (e) {
                  console.error('Failed to encode or send clipboard text from UI via WebRTC:', e);
                }
              } else {
                console.warn('Cannot send clipboard update from UI: Not connected.');
              }
              break;
            case 'pipelineStatusUpdate':
              console.log('Received pipelineStatusUpdate message:', message);
              let stateChangedFromStatus = false;
              if (message.video !== undefined && isVideoPipelineActive !== message.video) {
                console.log(`pipelineStatusUpdate: Updating isVideoPipelineActive to ${message.video}`);
                isVideoPipelineActive = message.video;
                stateChangedFromStatus = true;
              }
              if (message.audio !== undefined && isAudioPipelineActive !== message.audio) {
                console.log(`pipelineStatusUpdate: Updating isAudioPipelineActive to ${message.audio}`);
                isAudioPipelineActive = message.audio;
                stateChangedFromStatus = true;
              }
              if (message.microphone !== undefined && isMicrophoneActive !== message.microphone) {
                console.log(`pipelineStatusUpdate: Updating isMicrophoneActive to ${message.microphone}`);
                isMicrophoneActive = message.microphone;
                stateChangedFromStatus = true;
              }
              if (message.gamepad !== undefined && isGamepadEnabled !== message.gamepad) {
                console.log(`pipelineStatusUpdate: Updating isGamepadEnabled to ${message.gamepad}`);
                isGamepadEnabled = message.gamepad;
                stateChangedFromStatus = true;
              }
              if (stateChangedFromStatus) {
                console.log("pipelineStatusUpdate: State changed, posting sidebar button update.");
                postSidebarButtonUpdate();
              } else {
                console.log("pipelineStatusUpdate: No relevant state change detected.");
              }
              break;
            case 'fileUpload':
              console.log('Received fileUpload message:', message.payload);
              updateSidebarUploadProgress(message.payload);
              break;
            case 'pipelineControl':
              console.log(`Received pipeline control message: pipeline=${message.pipeline}, enabled=${message.enabled}`);
              const pipeline = message.pipeline;
              const desiredState = message.enabled;
              let stateChangedFromControl = false;
              if (pipeline === 'video' || pipeline === 'audio') {
                let wsMessage = '';
                if (pipeline === 'video') {
                  if (isVideoPipelineActive !== desiredState) {
                    isVideoPipelineActive = desiredState;
                    console.log(`pipelineControl: Immediately updating isVideoPipelineActive to ${isVideoPipelineActive}`);
                    stateChangedFromControl = true;
                    if (!isVideoPipelineActive) {
                      cleanupVideoBuffer();
                      if (currentEncoderMode === 'x264enc-striped') {
                        console.log("Video pipeline stopped in VNC mode, clearing stripe decoders.");
                        clearAllVncStripeDecoders();
                      }
                    }
                    wsMessage = desiredState ? 'START_VIDEO' : 'STOP_VIDEO';
                  }
                } else if (pipeline === 'audio') {
                  if (isAudioPipelineActive !== desiredState) {
                    isAudioPipelineActive = desiredState;
                    console.log(`pipelineControl: Immediately updating isAudioPipelineActive to ${isAudioPipelineActive}`);
                    stateChangedFromControl = true;
                    wsMessage = desiredState ? 'START_AUDIO' : 'STOP_AUDIO';
                    if (audioDecoderWorker) {
                      audioDecoderWorker.postMessage({
                        type: 'updatePipelineStatus',
                        data: {
                          isActive: isAudioPipelineActive
                        }
                      });
                    }
                  }
                }
                if (stateChangedFromControl) {
                  postSidebarButtonUpdate();
                }
                if (wsMessage && clientMode === 'websockets' && websocket && websocket.readyState === WebSocket.OPEN) {
                  console.log(`pipelineControl: Sending ${wsMessage} via websocket.`);
                  websocket.send(wsMessage);
                } else if (wsMessage) {
                  console.warn(`Cannot send ${pipeline} pipelineControl command: Not in websockets mode or websocket not open.`);
                }
              } else if (pipeline === 'microphone') {
                if (desiredState) {
                  startMicrophoneCapture();
                } else {
                  stopMicrophoneCapture();
                }
              } else {
                console.warn(`Received pipelineControl message for unknown pipeline: ${pipeline}`);
              }
              break;
            case 'audioDeviceSelected':
              console.log('Received audioDeviceSelected message:', message);
              const {
                context, deviceId
              } = message;
              if (!deviceId) {
                console.warn("Received audioDeviceSelected message without a deviceId.");
                break;
              }
              if (context === 'input') {
                console.log(`Setting preferred input device to: ${deviceId}`);
                if (preferredInputDeviceId !== deviceId) {
                  preferredInputDeviceId = deviceId;
                  if (isMicrophoneActive) {
                    console.log("Microphone is active, restarting to apply new input device...");
                    stopMicrophoneCapture();
                    setTimeout(startMicrophoneCapture, 150);
                  }
                }
              } else if (context === 'output') {
                console.log(`Setting preferred output device to: ${deviceId}`);
                if (preferredOutputDeviceId !== deviceId) {
                  preferredOutputDeviceId = deviceId;
                  applyOutputDevice();
                }
              } else {
                console.warn(`Unknown context in audioDeviceSelected message: ${context}`);
              }
              break;
            case 'gamepadControl':
              console.log(`Received gamepad control message: enabled=${message.enabled}`);
              const newGamepadState = message.enabled;
              if (isGamepadEnabled !== newGamepadState) {
                isGamepadEnabled = newGamepadState;
                setBoolParam('isGamepadEnabled', isGamepadEnabled); // Persist gamepad state
                postSidebarButtonUpdate(); // Post update for UI consistency
                if (window.webrtcInput && window.webrtcInput.gamepadManager) {
                  if (isGamepadEnabled) {
                    window.webrtcInput.gamepadManager.enable();
                    console.log("Gamepad input enabled.");
                  } else {
                    window.webrtcInput.gamepadManager.disable();
                    console.log("Gamepad input disabled.");
                  }
                } else {
                  console.warn("Could not toggle gamepad state: window.webrtcInput or gamepadManager not found.");
                }
              }
              break;
            case 'gamepadButtonUpdate':
            case 'gamepadAxisUpdate':
              if (message.gamepadIndex === 0) {
                if (!gamepadStates[0]) gamepadStates[0] = {
                  buttons: {},
                  axes: {}
                };
                if (message.type === 'gamepadButtonUpdate') {
                  const {
                    buttonIndex,
                    value
                  } = message;
                  if (!gamepadStates[0].buttons) gamepadStates[0].buttons = {};
                  gamepadStates[0].buttons[buttonIndex] = value;
                } else {
                  const {
                    axisIndex,
                    value
                  } = message;
                  if (!gamepadStates[0].axes) gamepadStates[0].axes = {};
                  const clampedValue = Math.max(-1, Math.min(1, value));
                  gamepadStates[0].axes[axisIndex] = clampedValue;
                }
                updateGamepadVisuals(0);
              }
              break;
            case 'requestFullscreen':
              console.log('Received requestFullscreen message. Calling enterFullscreen().');
              enterFullscreen();
              break;
            case 'command':
              if (typeof message.value === 'string') {
                const commandString = message.value;
                console.log(`Received 'command' message with value: "${commandString}". Forwarding to WebSocket.`);
                if (websocket && websocket.readyState === WebSocket.OPEN) {
                  try {
                    websocket.send(`cmd,${commandString}`);
                    console.log(`Sent command to server via WebSocket: cmd,${commandString}`);
                  } catch (e) {
                    console.error('Failed to send command via WebSocket:', e);
                  }
                } else {
                  console.warn('Cannot send command: WebSocket is not open or not available.');
                }
              } else {
                console.warn("Received 'command' message without a string value:", message);
              }
              break;
            default:
              break;
          }
        }

        function handleSettingsMessage(settings) {
          console.log('Applying settings:', settings);
          if (settings.videoBitRate !== undefined) {
            videoBitRate = parseInt(settings.videoBitRate);
            setIntParam('videoBitRate', videoBitRate); // Save to localStorage
            // Send to server
            if (clientMode === 'webrtc' && webrtc && webrtc.sendDataChannelMessage) {
              webrtc.sendDataChannelMessage(`vb,${videoBitRate}`);
              console.log(`Sent video bitrate ${videoBitRate} kbit/s to server via DataChannel.`);
            } else if (clientMode === 'websockets') {
              if (websocket && websocket.readyState === WebSocket.OPEN) {
                const message = `SET_VIDEO_BITRATE,${videoBitRate}`;
                console.log(`Sent websocket message: ${message}`);
                websocket.send(message);
              } else {
                console.warn("Websocket connection not open, cannot send video bitrate setting.");
              }
            }
          }
          if (settings.videoFramerate !== undefined) {
            videoFramerate = parseInt(settings.videoFramerate);
            setIntParam('videoFramerate', videoFramerate); // Save to localStorage
            // Send to server
            if (clientMode === 'webrtc' && webrtc && webrtc.sendDataChannelMessage) {
              webrtc.sendDataChannelMessage(`_arg_fps,${videoFramerate}`);
              console.log(`Sent video framerate ${videoFramerate} FPS to server via DataChannel (_arg_fps).`);
            } else if (clientMode === 'websockets') {
              if (websocket && websocket.readyState === WebSocket.OPEN) {
                const message = `SET_FRAMERATE,${videoFramerate}`;
                console.log(`Sent websocket message: ${message}`);
                websocket.send(message);
              } else {
                console.warn("Websocket connection not open, cannot send framerate setting.");
              }
            }
          }
          if (settings.resizeRemote !== undefined) {
            resizeRemote = settings.resizeRemote;
            setBoolParam('resizeRemote', resizeRemote); // Save to localStorage
            // Send to server (requires calculating resolution)
            const videoContainer = document.querySelector('.video-container');
            let res;
            if (!videoContainer) {
              console.warn('video-container not found, using window size for resizeRemote resolution.');
              res = `${roundDownToEven(window.innerWidth)}x${roundDownToEven(window.innerHeight)}`;
            } else {
              const videoContainerRect = videoContainer.getBoundingClientRect();
              const evenWidth = roundDownToEven(videoContainerRect.width);
              const evenHeight = roundDownToEven(videoContainerRect.height);
              res = `${evenWidth}x${evenHeight}`;
            }
            if (clientMode === 'webrtc' && webrtc && webrtc.sendDataChannelMessage) {
              webrtc.sendDataChannelMessage(`_arg_resize,${resizeRemote},${res}`);
              console.log(`Sent resizeRemote ${resizeRemote} with resolution ${res} to server via DataChannel.`);
            } else if (clientMode === 'websockets') {
              console.warn("ResizeRemote setting received, but not sending to server in websockets mode (not implemented).");
            }
          }
          if (settings.encoder !== undefined) {
            const newEncoderSetting = settings.encoder;
            const oldEncoderActual = currentEncoderMode; // Capture global state before update
            currentEncoderMode = newEncoderSetting; // Update global state
            setStringParam('encoder', currentEncoderMode); // Persist the new encoder setting
            // Send to server
            if (clientMode === 'webrtc' && webrtc && webrtc.sendDataChannelMessage) {
              webrtc.sendDataChannelMessage(`enc,${currentEncoderMode}`);
              console.log(`Sent encoder ${currentEncoderMode} to server via DataChannel.`);
            } else if (clientMode === 'websockets') {
              if (websocket && websocket.readyState === WebSocket.OPEN) {
                const message = `SET_ENCODER,${currentEncoderMode}`;
                console.log(`Sent websocket message: ${message}`);
                websocket.send(message);
              } else {
                console.warn("Websocket connection not open, cannot send encoder setting.");
              }
            }
            if (oldEncoderActual === 'x264enc-striped' && currentEncoderMode !== 'x264enc-striped') {
              clearAllVncStripeDecoders();
              console.log("Switched away from x264enc-striped, cleared stripe decoders.");
              // If switching to a mode that uses the main 'decoder', ensure it's ready or reinitialized
              if (currentEncoderMode === 'x264enc' && (!decoder || decoder.state === 'closed')) {
                triggerInitializeDecoder(); // For full-frame H.264
              }
            } else if (currentEncoderMode === 'x264enc-striped' && oldEncoderActual !== 'x264enc-striped') {
              if (canvasContext) {
                canvasContext.setTransform(1, 0, 0, 1, 0, 0);
                canvasContext.clearRect(0, 0, canvas.width, canvas.height);
                console.log("Switched to x264enc-striped, cleared canvas.");
              }
              // Close the main full-frame decoder if it's active, as VNC stripes use their own
              if (decoder && decoder.state !== 'closed') {
                console.log("Switching to VNC mode, closing main video decoder.");
                decoder.close();
                decoder = null;
              }
            }
            // Existing JPEG switch logic (mostly for canvas sizing)
            if (currentEncoderMode === 'jpeg' && oldEncoderActual !== 'jpeg') {
              console.log("Encoder changed to JPEG. Ensuring canvas buffer is correctly sized.");
              let currentTargetWidth, currentTargetHeight;
              if (window.isManualResolutionMode && manualWidth != null && manualHeight != null) {
                currentTargetWidth = manualWidth;
                currentTargetHeight = manualHeight;
                console.log(`JPEG Switch: Using manual resolution for canvas buffer: ${currentTargetWidth}x${currentTargetHeight}`);
                applyManualCanvasStyle(currentTargetWidth, currentTargetHeight, scaleLocallyManual);
              } else {
                if (window.webrtcInput && typeof window.webrtcInput.getWindowResolution === 'function') {
                  const currentWindowRes = window.webrtcInput.getWindowResolution();
                  currentTargetWidth = roundDownToEven(currentWindowRes[0]);
                  currentTargetHeight = roundDownToEven(currentWindowRes[1]);
                  console.log(`JPEG Switch: Using auto (window) resolution for canvas buffer: ${currentTargetWidth}x${currentTargetHeight}`);
                  resetCanvasStyle(currentTargetWidth, currentTargetHeight);
                } else {
                  console.warn("Cannot determine auto resolution for JPEG switch: webrtcInput or getWindowResolution not available.");
                }
              }
            }
          }
          if (settings.videoBufferSize !== undefined) {
            videoBufferSize = parseInt(settings.videoBufferSize);
            setIntParam('videoBufferSize', videoBufferSize); // Save to localStorage
            console.log(`Applied Video buffer size setting: ${videoBufferSize} frames.`);
          }
          if (settings.videoCRF !== undefined) {
            videoCRF = parseInt(settings.videoCRF, 10);
            setIntParam('videoCRF', videoCRF); // Save to localStorage
            console.log(`Applied Video CRF setting: ${videoCRF}.`);
            // Send to server via WebSocket
            if (clientMode === 'websockets') {
              if (websocket && websocket.readyState === WebSocket.OPEN) {
                const message = `SET_CRF,${videoCRF}`;
                console.log(`Sent websocket message: ${message}`);
                websocket.send(message);
              } else {
                console.warn("Websocket connection not open, cannot send CRF setting.");
              }
            } else {
              // Note: No equivalent WebRTC data channel message specified in the prompt
              console.warn("CRF setting received, but not sending to server in webrtc mode (not implemented/specified).");
            }
          }
          if (settings.turnSwitch !== undefined) {
            turnSwitch = settings.turnSwitch;
            setBoolParam('turnSwitch', turnSwitch); // Save to localStorage
            console.log(`Applied turnSwitch setting: ${turnSwitch}. Reloading...`);
            if (clientMode === 'webrtc' && (!webrtc || webrtc.peerConnection === null)) {
              console.log('WebRTC not connected, skipping immediate reload.');
              return; // Important to return if not reloading, to process other settings
            }
            setTimeout(() => {
              window.location.reload();
            }, 700);
          }
          if (settings.debug !== undefined) {
            debug = settings.debug;
            setBoolParam('debug', debug); // Save to localStorage
            console.log(`Applied debug setting: ${debug}. Reloading...`);
            if (clientMode === 'webrtc' && (!webrtc || webrtc.peerConnection === null)) {
              console.log('WebRTC not connected, skipping immediate reload.');
              return; // Important to return if not reloading, to process other settings
            }
            setTimeout(() => {
              window.location.reload();
            }, 700);
          }
        }

        function sendStatsMessage() {
          const stats = {
            connection: connectionStat,
            gpu: gpuStat,
            cpu: cpuStat,
            clientFps: window.fps,
            audioBuffer: window.currentAudioBufferSize,
            videoBuffer: videoFrameBuffer.length,
            isVideoPipelineActive: isVideoPipelineActive,
            isAudioPipelineActive: isAudioPipelineActive,
            isMicrophoneActive: isMicrophoneActive,
          };
          if (typeof encoderName !== 'undefined') { // encoderName is not defined in this scope, maybe currentEncoderMode?
            stats.encoderName = currentEncoderMode;
          }
          window.parent.postMessage({
            type: 'stats',
            data: stats
          }, window.location.origin);
          console.log('Sent stats message via window.postMessage:', stats);
        }
        document.addEventListener('DOMContentLoaded', () => {
          async function initializeDecoder() {
            if (decoder && decoder.state !== 'closed') {
              console.warn("VideoDecoder already exists, closing before re-initializing.");
              decoder.close();
            }
            // --- START: Dynamic Dimension Calculation ---
            let targetWidth = 1280; // Default fallback width
            let targetHeight = 720; // Default fallback height
            if (window.isManualResolutionMode && manualWidth != null && manualHeight != null) {
              // Use manually set resolution if active and valid
              targetWidth = manualWidth;
              targetHeight = manualHeight;
              console.log(`[initializeDecoder] Using manual resolution for config: ${targetWidth}x${targetHeight}`);
            } else if (window.webrtcInput && typeof window.webrtcInput.getWindowResolution === 'function') {
              try {
                const currentRes = window.webrtcInput.getWindowResolution();
                const autoWidth = roundDownToEven(currentRes[0]);
                const autoHeight = roundDownToEven(currentRes[1]);
                if (autoWidth > 0 && autoHeight > 0) {
                  targetWidth = autoWidth;
                  targetHeight = autoHeight;
                  console.log(`[initializeDecoder] Using auto resolution for config: ${targetWidth}x${targetHeight}`);
                } else {
                  console.warn(`[initializeDecoder] Auto resolution gave invalid dimensions (${autoWidth}x${autoHeight}), falling back to defaults.`);
                }
              } catch (e) {
                console.error("[initializeDecoder] Error getting auto resolution:", e, "Falling back to defaults.");
              }
            } else {
              console.warn("[initializeDecoder] Cannot determine manual or auto resolution, falling back to defaults (1280x720). Input handler might not be ready.");
            }
            decoder = new VideoDecoder({
              output: handleDecodedFrame,
              error: (e) => {
                console.error('VideoDecoder error:', e.message);
                if (e.message.includes('fatal') || decoder.state === 'closed' || decoder.state === 'unconfigured') {
                  console.warn('Attempting to reset VideoDecoder due to error or bad state.');
                  initializeDecoder();
                }
              },
            });
            // This config is for the main full-frame H.264 decoder (not VNC stripes)
            const decoderConfig = {
              codec: 'avc1.42E01E', // Common H.264 baseline codec string
              codedWidth: targetWidth,
              codedHeight: targetHeight,
              optimizeForLatency: true,
            };
            try {
              const support = await VideoDecoder.isConfigSupported(decoderConfig);
              if (support.supported) {
                decoder.configure(decoderConfig);
                // Log the config that was *actually* used
                console.log('Main VideoDecoder configured successfully with config:', decoderConfig);
              } else {
                console.error('Main VideoDecoder configuration not supported:', support, decoderConfig);
                decoder = null;
              }
            } catch (e) {
              console.error('Error configuring Main VideoDecoder with config:', e, decoderConfig);
              decoder = null;
            }
          }
          initializeUI();
          videoElement.addEventListener('loadeddata', () => {
            if (clientMode === 'webrtc' && webrtc && webrtc.input) {
              webrtc.input.getCursorScaleFactor();
            }
          });
          const pathname = window.location.pathname.substring(
            0,
            window.location.pathname.lastIndexOf('/') + 1
          );
          const protocol = location.protocol === 'http:' ? 'ws://' : 'wss://';
          audio_signalling = new WebRTCDemoSignalling(
            new URL(
              `${protocol}${window.location.host}${pathname}${appName}/signalling/`
            ),
            3
          );
          audio_webrtc = new WebRTCDemo(audio_signalling, audioElement, 3);
          audio_signalling.setInput(audio_webrtc.input);
          window.applyTimestamp = (msg) => {
            const now = new Date();
            const ts = `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;
            return `[${ts}] ${msg}`;
          };
          audio_signalling.onstatus = (message) => {
            loadingText = message;
            appendLogEntry(message);
            updateStatusDisplay();
          };
          audio_signalling.onerror = appendLogError;
          audio_signalling.ondisconnect = () => {
            const checkconnect = status === 'checkconnect';
            status = 'connecting';
            updateStatusDisplay();
            overlayInput.style.cursor = 'auto';
            audio_webrtc.reset();
            status = 'checkconnect';
            if (!checkconnect && signalling) signalling.disconnect();
          };
          const setupWebRTCMode = () => {
            if (metricsIntervalId) {
              clearInterval(metricsIntervalId);
              metricsIntervalId = null;
            }
            signalling = new WebRTCDemoSignalling(
              new URL(
                `${protocol}${window.location.host}${pathname}${appName}/signalling/`
              ),
              1
            );
            webrtc = new WebRTCDemo(signalling, videoElement, 1);
            signalling.setInput(webrtc.input);
            signalling.onstatus = (message) => {
              loadingText = message;
              appendLogEntry(message);
              updateStatusDisplay();
            };
            signalling.onerror = appendLogError;
            signalling.ondisconnect = () => {
              const checkconnect = status === 'checkconnect';
              status = 'connecting';
              updateStatusDisplay();
              overlayInput.style.cursor = 'auto';
              if (clientMode === 'webrtc' && webrtc) {
                webrtc.reset();
              }
              status = 'checkconnect';
              if (!checkconnect) audio_signalling.disconnect();
            };
            webrtc.onstatus = (message) => {
              appendLogEntry(applyTimestamp(`[webrtc] ${message}`));
            };
            webrtc.onerror = (message) => {
              appendLogError(applyTimestamp(`[webrtc] [ERROR] ${message}`));
            };
            webrtc.onconnectionstatechange = (state) => {
              videoConnected = state;
              if (videoConnected === 'connected') {
                if (!videoElement.paused) {
                  playButtonElement.classList.add('hidden');
                  statusDisplayElement.classList.add('hidden');
                }
                if (webrtc && webrtc.peerConnection) {
                  webrtc.peerConnection.getReceivers().forEach((receiver) => {
                    const intervalLoop = setInterval(async () => {
                      if (
                        receiver.track.readyState !== 'live' ||
                        receiver.transport.state !== 'connected'
                      ) {
                        clearInterval(intervalLoop);
                        return;
                      }
                      receiver.jitterBufferTarget = 0;
                      receiver.jitterBufferDelayHint = 0;
                      receiver.playoutDelayHint = 0;
                    }, 15);
                  });
                }
              }
              status =
                videoConnected === 'connected' && audioConnected === 'connected' ?
                state :
                videoConnected === 'connected' ?
                audioConnected :
                videoConnected;
              updateStatusDisplay();
            };
            webrtc.ondatachannelopen = initializeInput;
            webrtc.ondatachannelclose = () => {
              if (webrtc && webrtc.input) webrtc.input.detach();
            };
            webrtc.onclipboardcontent = (content) => {
              navigator.clipboard
                .writeText(content)
                .catch((err) => {
                  if (webrtc)
                    webrtc._setStatus(`Could not copy text to clipboard: ${err}`);
                });
            };
            webrtc.oncursorchange = (handle, curdata, hotspot, override) => {
              if (parseInt(handle, 10) === 0) {
                overlayInput.style.cursor = 'auto';
                return;
              }
              if (override) {
                overlayInput.style.cursor = override;
                return;
              }
              if (webrtc && !webrtc.cursor_cache.has(handle)) {
                const cursor_url = `url('data:image/png;base64,${curdata}')`;
                webrtc.cursor_cache.set(handle, cursor_url);
              }
              if (webrtc) {
                let cursor_url = webrtc.cursor_cache.get(handle);
                if (hotspot) {
                  cursor_url += ` ${hotspot.x} ${hotspot.y}, auto`;
                } else {
                  cursor_url += ', auto';
                }
                overlayInput.style.cursor = cursor_url;
              }
            };
            webrtc.onsystemaction = (action) => {
              if (webrtc) webrtc._setStatus(`Executing system action: ${action}`);
            };
            webrtc.onlatencymeasurement = (latency_ms) => {
              serverLatency = latency_ms * 2.0;
            };
            if (debug) {
              webrtc.ondebug = (message) => {
                appendDebugEntry(applyTimestamp(`[webrtc] ${message}`));
              };
            }
            if (webrtc) {
              webrtc.ongpustats = async (data) => {
                gpuStat.gpuLoad = Math.round(data.load * 100);
                gpuStat.gpuMemoryTotal = data.memory_total;
                gpuStat.gpuMemoryUsed = data.memory_used;
              };
            }
          };
          audio_webrtc.onstatus = (message) => {
            appendLogEntry(applyTimestamp(`[audio webrtc] ${message}`));
          };
          audio_webrtc.onerror = appendLogError;
          audio_webrtc.onconnectionstatechange = (state) => {
            audioConnected = state;
            if (audioConnected === 'connected') {
              if (audio_webrtc && audio_webrtc.peerConnection) {
                audio_webrtc.peerConnection.getReceivers().forEach((receiver) => {
                  const intervalLoop = setInterval(async () => {
                    if (
                      receiver.track.readyState !== 'live' ||
                      receiver.transport.state !== 'connected'
                    ) {
                      clearInterval(intervalLoop);
                      return;
                    }
                    receiver.jitterBufferTarget = 0;
                    receiver.jitterBufferDelayHint = 0;
                    receiver.playoutDelayHint = 0;
                  }, 15);
                });
              }
            }
            status =
              audioConnected === 'connected' && videoConnected === 'connected' ?
              state :
              audioConnected === 'connected' ?
              videoConnected :
              audioConnected;
            updateStatusDisplay();
          };
          if (debug) {
            audio_signalling.ondebug = (message) => {
              appendDebugEntry(`[audio signalling] ${message}`);
            };
            audio_webrtc.ondebug = (message) => {
              appendDebugEntry(applyTimestamp(`[audio webrtc] ${message}`));
            };
          }
          window.addEventListener('focus', () => {
            if (clientMode === 'webrtc' && webrtc && webrtc.sendDataChannelMessage)
              webrtc.sendDataChannelMessage('kr');
            if (
              clientMode === 'websockets' &&
              websocket &&
              websocket.readyState === WebSocket.OPEN
            )
              websocket.send('kr');
            navigator.clipboard
              .readText()
              .then((text) => {
                const encodedText = btoa(text);
                if (clientMode === 'webrtc' && webrtc && webrtc.sendDataChannelMessage)
                  webrtc.sendDataChannelMessage(`cw,${encodedText}`);
                if (
                  clientMode === 'websockets' &&
                  websocket &&
                  websocket.readyState === WebSocket.OPEN
                )
                  websocket.send(`cw,${encodedText}`);
              })
              .catch((err) => {
                if (clientMode === 'webrtc') {
                  webrtc._setStatus(`Failed to read clipboard contents: ${err}`);
                } else if (clientMode === 'websockets') {
                  console.error(`Failed to read clipboard contents: ${err}`);
                }
              });
          });
          window.addEventListener('blur', () => {
            if (clientMode === 'webrtc' && webrtc && webrtc.sendDataChannelMessage)
              webrtc.sendDataChannelMessage('kr');
            if (
              clientMode === 'websockets' &&
              websocket &&
              websocket.readyState === WebSocket.OPEN
            )
              websocket.send('kr');
          });
          document.addEventListener('visibilitychange', () => {
            if (clientMode !== 'websockets') return;
            if (document.hidden) {
              console.log('Tab is hidden, stopping video pipeline.');
              if (websocket && websocket.readyState === WebSocket.OPEN) {
                if (isVideoPipelineActive) {
                  websocket.send('STOP_VIDEO');
                  isVideoPipelineActive = false; // Assume it stops
                  window.postMessage({
                    type: 'pipelineStatusUpdate',
                    video: false
                  }, window.location.origin);
                  console.log("Tab hidden in VNC mode, clearing stripe decoders.");
                  clearAllVncStripeDecoders();
                } else {
                  console.log('Video pipeline already stopped, not sending STOP_VIDEO.');
                }
              } else {
                console.warn('Websocket not open, cannot send STOP_VIDEO.');
              }
              cleanupVideoBuffer();
            } else {
              console.log('Tab is visible, starting video pipeline.');
              if (websocket && websocket.readyState === WebSocket.OPEN) {
                if (!isVideoPipelineActive) { // Only start if it was stopped
                  websocket.send('START_VIDEO');
                  isVideoPipelineActive = true; // Assume it starts
                  window.postMessage({
                    type: 'pipelineStatusUpdate',
                    video: true
                  }, window.location.origin);
                  // If switching to VNC mode and tab becomes visible, canvas might need a clear
                  if (currentEncoderMode === 'x264enc-striped' && canvasContext) {
                    canvasContext.setTransform(1, 0, 0, 1, 0, 0);
                    canvasContext.clearRect(0, 0, canvas.width, canvas.height);
                  }
                } else {
                  console.log('Video pipeline already started, not sending START_VIDEO.');
                }
              } else {
                console.warn('Websocket not open, cannot send START_VIDEO.');
              }
            }
          });
          async function decodeAndQueueJpegStripe(startY, jpegData) {
            if (typeof ImageDecoder === 'undefined') {
              console.warn('ImageDecoder API not supported. Cannot decode JPEG stripes.');
              return;
            }
            try {
              const imageDecoder = new ImageDecoder({
                data: jpegData,
                type: 'image/jpeg'
              });
              const result = await imageDecoder.decode();
              jpegStripeRenderQueue.push({
                image: result.image,
                startY: startY
              });
              imageDecoder.close();
            } catch (error) {
              console.error('Error decoding JPEG stripe:', error, 'startY:', startY, 'dataLength:', jpegData.byteLength);
            }
          }
          /**
           * Handles a decoded video frame from the decoder.
           * Adds the frame to the videoFrameBuffer.
           * @param {VideoFrame} frame
           */
          function handleDecodedFrame(frame) {
            if (document.hidden) {
              console.log('Tab is hidden, dropping video frame.');
              frame.close();
              return;
            }
            if (!isVideoPipelineActive && clientMode === 'websockets') {
              console.log('Video pipeline inactive, dropping video frame.');
              frame.close();
              return;
            }
            videoFrameBuffer.push(frame);
          }
          triggerInitializeDecoder = initializeDecoder;
          console.log("initializeDecoder function assigned to triggerInitializeDecoder.");
          /**
           * Paints the oldest frame from the buffer onto the canvas if the buffer is full enough.
           * Runs on a requestAnimationFrame loop.
           */
          function paintVideoFrame() {
            if (!canvas || !canvasContext) {
              requestAnimationFrame(paintVideoFrame);
              return;
            }
            let videoPaintedThisFrame = false;
            let jpegPaintedThisFrame = false;
            // --- VNC STRIPE CHANGE: Conditional processing based on mode ---
            if (currentEncoderMode === 'x264enc-striped') {
              let paintedSomethingThisCycle = false;
              for (const stripeData of decodedStripesQueue) {
                canvasContext.drawImage(stripeData.frame, 0, stripeData.yPos);
                stripeData.frame.close(); // Close frame AFTER drawing
                paintedSomethingThisCycle = true;
              }
              decodedStripesQueue = []; // Clear the queue
              if (paintedSomethingThisCycle && !streamStarted) {
                startStream();
              }
            } else if (currentEncoderMode === 'jpeg') {
              // JPEG Stripe Rendering (additive)
              if (canvasContext && jpegStripeRenderQueue.length > 0) {
                if ((canvas.width === 0 || canvas.height === 0) || (canvas.width === 300 && canvas.height === 150)) {
                  const firstStripe = jpegStripeRenderQueue[0];
                  if (firstStripe && firstStripe.image && (firstStripe.startY + firstStripe.image.height > canvas.height || firstStripe.image.width > canvas.width)) {
                    console.warn(`[paintVideoFrame] Canvas dimensions (${canvas.width}x${canvas.height}) may be too small for JPEG stripes.`);
                  }
                }
                while (jpegStripeRenderQueue.length > 0) {
                  const segment = jpegStripeRenderQueue.shift();
                  if (segment && segment.image) {
                    try {
                      canvasContext.drawImage(segment.image, 0, segment.startY);
                      segment.image.close();
                      jpegPaintedThisFrame = true;
                    } catch (e) {
                      console.error("[paintVideoFrame] Error drawing JPEG segment:", e, segment);
                      if (segment.image && typeof segment.image.close === 'function') {
                        segment.image.close();
                      }
                    }
                  }
                }
                if (jpegPaintedThisFrame && !streamStarted) {
                  startStream();
                  initializeInput();
                }
              }
            } else { // Default to full-frame video (e.g., x264enc, nvh264enc)
              if (!document.hidden && isVideoPipelineActive && videoFrameBuffer.length > videoBufferSize) {
                const frameToPaint = videoFrameBuffer.shift();
                if (frameToPaint) {
                  canvasContext.drawImage(frameToPaint, 0, 0);
                  frameToPaint.close();
                  videoPaintedThisFrame = true;
                  frameCount++;
                  if (!streamStarted) {
                    startStream();
                    initializeInput();
                  }
                }
              }
            }
            requestAnimationFrame(paintVideoFrame);
          }
          async function initializeAudio() {
            if (!audioContext) {
              const contextOptions = {
                sampleRate: 48000,
              };
              audioContext = new(window.AudioContext || window.webkitAudioContext)(contextOptions);
              console.log(
                'Playback AudioContext initialized with options:', contextOptions,
                'Actual sampleRate:', audioContext.sampleRate,
                'Initial state:', audioContext.state
              );
              // Handle state changes (e.g., if it starts suspended and resumes later)
              audioContext.onstatechange = () => {
                console.log(`Playback AudioContext state changed to: ${audioContext.state}`);
                // Re-apply sinkId if it becomes running, in case it wasn't set before
                if (audioContext.state === 'running') {
                  applyOutputDevice();
                }
              };
            }
            try {
              const audioWorkletProcessorCode = `
        class AudioFrameProcessor extends AudioWorkletProcessor {
          constructor() {
            super();
            this.audioBufferQueue = [];
            this.currentAudioData = null;
            this.currentDataOffset = 0;
            this.port.onmessage = (event) => {
            if (event.data.audioData) { // event.data.audioData is an ArrayBuffer
                const pcmData = new Float32Array(event.data.audioData);
                this.audioBufferQueue.push(pcmData);
              } else if (event.data.type === 'getBufferSize') {
                this.port.postMessage({ type: 'audioBufferSize', size: this.audioBufferQueue.length });
              }
            };
          }

          process(inputs, outputs, parameters) {
            const output = outputs[0];
            const leftChannel = output ? output[0] : undefined;
            const rightChannel = output ? output[1] : undefined;

            if (!leftChannel || !rightChannel) {
              if (leftChannel) leftChannel.fill(0);
              if (rightChannel) rightChannel.fill(0);
              return true;
            }

            const samplesPerBuffer = leftChannel.length;

            if (this.audioBufferQueue.length === 0 && this.currentAudioData === null) {
              leftChannel.fill(0);
              rightChannel.fill(0);
              return true;
            }

            let data = this.currentAudioData;
            let offset = this.currentDataOffset;

            for (let sampleIndex = 0; sampleIndex < samplesPerBuffer; sampleIndex++) {
              if (!data || offset >= data.length) {
                if (this.audioBufferQueue.length > 0) {
                  data = this.currentAudioData = this.audioBufferQueue.shift();
                  offset = this.currentDataOffset = 0;
                } else {
                  this.currentAudioData = null;
                  this.currentDataOffset = 0;
                  leftChannel.fill(0, sampleIndex);
                  rightChannel.fill(0, sampleIndex);
                  return true;
                }
              }

              leftChannel[sampleIndex] = data[offset++];
              if (offset < data.length) {
                rightChannel[sampleIndex] = data[offset++];
              } else {
                 rightChannel[sampleIndex] = leftChannel[sampleIndex];
                 offset++;
              }
            }

            this.currentDataOffset = offset;
            if (offset >= data.length) {
                 this.currentAudioData = null;
                 this.currentDataOffset = 0;
            } else {
                 this.currentAudioData = data;
            }


            return true;
          }
        }

        registerProcessor('audio-frame-processor', AudioFrameProcessor);
      `;
              const audioWorkletBlob = new Blob([audioWorkletProcessorCode], {
                type: 'text/javascript',
              });
              const audioWorkletURL = URL.createObjectURL(audioWorkletBlob);
              await audioContext.audioWorklet.addModule(audioWorkletURL);
              URL.revokeObjectURL(audioWorkletURL);
              audioWorkletNode = new AudioWorkletNode(
                audioContext,
                'audio-frame-processor', {
                  numberOfOutputs: 1,
                  outputChannelCount: [2],
                }
              );
              audioWorkletProcessorPort = audioWorkletNode.port;
              audioWorkletProcessorPort.onmessage = (event) => {
                if (event.data.type === 'audioBufferSize') {
                  window.currentAudioBufferSize = event.data.size;
                }
              };
              audioWorkletNode.connect(audioContext.destination);
              console.log('Playback AudioWorkletProcessor initialized and connected.');
              await applyOutputDevice();
              if (audioDecoderWorker) { // Terminate existing worker if any
                console.warn("[Main] Terminating existing audio decoder worker before creating a new one.");
                audioDecoderWorker.postMessage({
                  type: 'close'
                }); // Ask it to clean up
                // Give it a moment to close gracefully before forceful termination
                await new Promise(resolve => setTimeout(resolve, 50));
                if (audioDecoderWorker) audioDecoderWorker.terminate();
                audioDecoderWorker = null;
              }
              const audioDecoderWorkerBlob = new Blob([audioDecoderWorkerCode], {
                type: 'application/javascript'
              });
              const audioDecoderWorkerURL = URL.createObjectURL(audioDecoderWorkerBlob);
              audioDecoderWorker = new Worker(audioDecoderWorkerURL);
              URL.revokeObjectURL(audioDecoderWorkerURL); // Clean up blob URL
              audioDecoderWorker.onmessage = (event) => {
                const {
                  type,
                  reason,
                  message
                } = event.data;
                if (type === 'decoderInitFailed') {
                  console.error(`[Main] Audio Decoder Worker failed to initialize: ${reason}`);
                  // Potentially try to re-initialize or disable audio pipeline
                } else if (type === 'decoderError') {
                  console.error(`[Main] Audio Decoder Worker reported error: ${message}`);
                } else if (type === 'decoderInitialized') {
                  console.log('[Main] Audio Decoder Worker confirmed its decoder is initialized.');
                } else if (type === 'decodedAudioData') {
                  const pcmBufferFromWorker = event.data.pcmBuffer;
                  // --- NEW: Handle decoded PCM data from worker ---
                  if (pcmBufferFromWorker && audioWorkletProcessorPort && audioContext && audioContext.state === 'running') {
                    if (window.currentAudioBufferSize < 10) { // Check AudioWorklet buffer before posting
                      audioWorkletProcessorPort.postMessage({
                        audioData: pcmBufferFromWorker
                      }, [pcmBufferFromWorker]);
                    } else {
                      // console.warn(`[Main] AudioWorklet buffer full (${window.currentAudioBufferSize}). Dropping PCM from worker.`);
                      // The pcmBuffer is not used, will be garbage collected.
                    }
                  } else if (!audioWorkletProcessorPort || !audioContext || audioContext.state !== 'running') {
                    // console.warn('[Main] AudioWorklet not ready for PCM data from worker. Dropping.');
                  }
                }
              };
              audioDecoderWorker.onerror = (error) => {
                console.error('[Main] Uncaught error in Audio Decoder Worker:', error.message, error);
                if (audioDecoderWorker) {
                  audioDecoderWorker.terminate(); // Terminate on unhandled error
                  audioDecoderWorker = null;
                }
                // Consider re-initializing the entire audio pipeline or notifying user
              };
              // Send the AudioWorklet port to the worker.
              // Crucially, also send the current pipeline status.
              if (audioWorkletProcessorPort) {
                audioDecoderWorker.postMessage({
                  type: 'init',
                  data: {
                    initialPipelineStatus: isAudioPipelineActive // Send current status
                  }
                });
                console.log('[Main] Audio Decoder Worker created and init message sent with AudioWorklet port.');
              } else {
                console.error("[Main] audioWorkletProcessorPort is null, cannot initialize audioDecoderWorker correctly.");
              }
            } catch (error) {
              console.error('Error initializing Playback AudioWorklet:', error);
              if (audioContext && audioContext.state !== 'closed') {
                audioContext.close(); // Clean up context if worklet failed
              }
              audioContext = null;
              audioWorkletNode = null;
              audioWorkletProcessorPort = null;
            }
          }
          async function initializeDecoderAudio() {
            if (audioDecoderWorker) {
              console.log('[Main] Requesting Audio Decoder Worker to reinitialize its decoder.');
              audioDecoderWorker.postMessage({
                type: 'reinitialize'
              });
            } else {
              console.warn('[Main] Cannot initialize decoder audio: Audio Decoder Worker not available. Call initializeAudio() first.');
              // If in websockets mode and the worker isn't up, try to start the full audio init.
              if (clientMode === 'websockets' && !audioContext) {
                console.log('[Main] Audio context missing, attempting to initialize full audio pipeline for websockets.');
                await initializeAudio(); // This will create the worker and send init.
              }
            }
          }
          const ws_protocol = location.protocol === 'http:' ? 'ws://' : 'wss://';
          const websocketEndpointURL = new URL(
            `${ws_protocol}${window.location.host}${pathname}websockets`
          );
          websocket = new WebSocket(websocketEndpointURL.href);
          websocket.binaryType = 'arraybuffer';
          const sendClientMetrics = () => {
            if (clientMode === 'websockets' && websocket && websocket.readyState === WebSocket.OPEN) {
              if (audioWorkletProcessorPort) { // Playback worklet port
                audioWorkletProcessorPort.postMessage({
                  type: 'getBufferSize'
                });
              }
              // --- FPS Calculation Logic ---
              const now = performance.now();
              const elapsedStriped = now - lastStripedFpsUpdateTime;
              const elapsedFullFrame = now - lastFpsUpdateTime;
              const fpsUpdateInterval = 1000; // ms
              // Check if we received striped frames with IDs recently
              if (uniqueStripedFrameIdsThisPeriod.size > 0) {
                if (elapsedStriped >= fpsUpdateInterval) {
                  const stripedFps = (uniqueStripedFrameIdsThisPeriod.size * 1000) / elapsedStriped;
                  window.fps = Math.round(stripedFps);
                  // Reset counters for the next period
                  uniqueStripedFrameIdsThisPeriod.clear();
                  lastStripedFpsUpdateTime = now;
                  frameCount = 0; // Reset full frame count too, as striped mode is active
                  lastFpsUpdateTime = now;
                }
                // If interval not reached, window.fps retains previous value
              }
              // Else, check if we painted full frames recently
              else if (frameCount > 0) {
                if (elapsedFullFrame >= fpsUpdateInterval) {
                  const fullFrameFps = (frameCount * 1000) / elapsedFullFrame;
                  window.fps = Math.round(fullFrameFps);
                  // Reset counters for the next period
                  frameCount = 0;
                  lastFpsUpdateTime = now;
                  uniqueStripedFrameIdsThisPeriod.clear(); // Reset striped count too
                  lastStripedFpsUpdateTime = now;
                }
                // If interval not reached, window.fps retains previous value
              }
              // Else (neither striped nor full frames processed recently)
              else {
                // If enough time has passed since *either* last update, reset FPS to 0
                if (elapsedStriped >= fpsUpdateInterval && elapsedFullFrame >= fpsUpdateInterval) {
                  window.fps = 0;
                  // Reset timers anyway
                  lastFpsUpdateTime = now;
                  lastStripedFpsUpdateTime = now;
                }
              }
              try {
                // Send the calculated FPS
                websocket.send('cfps,' + window.fps);
                if (lastReceivedVideoFrameId !== -1) { // Only send if we've received a frame
                  websocket.send(`CLIENT_FRAME_ACK ${lastReceivedVideoFrameId}`);
                }
              } catch (error) {
                console.error('[websockets] Error sending client metrics:', error);
              }
            }
          };
          websocket.onopen = () => {
            console.log('[websockets] Connection opened!');
            isVideoPipelineActive = true; // Assume pipelines start active on new connection
            isAudioPipelineActive = true;
            window.postMessage({
              type: 'pipelineStatusUpdate',
              video: true,
              audio: true
            }, window.location.origin);
            isMicrophoneActive = false; // Mic should always start off
            updateToggleButtonAppearance(micToggleButtonElement, isMicrophoneActive);
            const settingsPrefix = `${appName}_`;
            const settingsToSend = {};
            let foundSettings = false;
            // --- Collect ALL settings from localStorage ---
            for (const key in localStorage) {
              if (Object.hasOwnProperty.call(localStorage, key) && key.startsWith(settingsPrefix)) {
                const settingValue = localStorage.getItem(key); // Get raw string value
                // Use the full key (including prefix) for sending
                settingsToSend[key] = settingValue;
                foundSettings = true;
              }
            }
            if (foundSettings) {
              try {
                const settingsJson = JSON.stringify(settingsToSend);
                const message = `SETTINGS,${settingsJson}`;
                websocket.send(message);
                console.log('[websockets] Sent stored settings to server:', settingsToSend);
                // --- Send settings via postMessage ---
                window.postMessage({
                  type: 'initialClientSettings',
                  settings: settingsToSend
                }, window.location.origin);
                console.log('[client] Posted initial settings via window.postMessage:', settingsToSend);
              } catch (e) {
                console.error('[websockets] Error sending stored settings:', e);
              }
            } else {
              try {
                const message = 'SETTINGS,{}';
                websocket.send(message);
                console.log('[websockets] Sent blank settings to server (no settings found in localStorage).');
                // --- Send blank settings via postMessage ---
                window.postMessage({
                  type: 'initialClientSettings',
                  settings: {}
                }, window.location.origin);
                console.log('[client] Posted blank initial settings via window.postMessage.');
              } catch (e) {
                console.error('[websockets] Error sending blank settings:', e);
              }
            }
            if (metricsIntervalId === null) {
              metricsIntervalId = setInterval(sendClientMetrics, METRICS_INTERVAL_MS);
              console.log(`[websockets] Started sending client metrics every ${METRICS_INTERVAL_MS}ms.`);
            }
            // --- Send initial resolution based on loaded mode ---
            if (isManualResolutionMode && manualWidth != null && manualHeight != null) {
              console.log("[websockets] Manual mode active on connect, sending stored manual resolution.");
              sendResolutionToServer(manualWidth, manualHeight);
            } else {
              const videoContainer = document.querySelector('.video-container');
              let initialWidth, initialHeight;
              if (videoContainer) {
                const rect = videoContainer.getBoundingClientRect();
                initialWidth = roundDownToEven(rect.width);
                initialHeight = roundDownToEven(rect.height);
              } else {
                console.warn("Websocket Open: video-container not found for initial resolution, using window.");
                initialWidth = roundDownToEven(window.innerWidth);
                initialHeight = roundDownToEven(window.innerHeight);
              }
              console.log("[websockets] Auto mode active on connect, sending container/window resolution.");
              sendResolutionToServer(initialWidth, initialHeight);
            }
            // Request clipboard content
            websocket.send('cr');
            console.log('[websockets] Sent clipboard request (cr) to server.');
          };
          websocket.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
              if (clientMode === 'websockets') {
                const arrayBuffer = event.data;
                const dataView = new DataView(arrayBuffer);
                if (arrayBuffer.byteLength < 1) {
                  console.warn('Received empty binary message, ignoring.');
                  return;
                }
                const dataTypeByte = dataView.getUint8(0);
                // console.log("Received binary data, type:", dataTypeByte); // Less verbose log
                if (dataTypeByte === 0) { // Full H.264 frame (non-VNC)
                  if (arrayBuffer.byteLength < 4) {
                    console.warn('Received short video message (type 0), ignoring.');
                    return;
                  }
                  const frameTypeFlag = dataView.getUint8(1);
                  lastReceivedVideoFrameId = dataView.getUint16(2, false);
                  const videoDataArrayBuffer = arrayBuffer.slice(4);
                  if (!isVideoPipelineActive) return;
                  if (decoder && decoder.state === 'configured') {
                    const chunk = new EncodedVideoChunk({
                      type: frameTypeFlag === 1 ? 'key' : 'delta',
                      timestamp: performance.now() * 1000,
                      data: videoDataArrayBuffer,
                    });
                    try {
                      decoder.decode(chunk);
                    } catch (e) {
                      console.error('Video Decoding error:', e);
                      if (decoder.state === 'closed' || decoder.state === 'unconfigured') {
                        console.warn("Video Decoder is closed or unconfigured, reinitializing...");
                        initializeDecoder();
                      }
                    }
                  } else {
                    console.warn('Video Decoder not ready or not configured yet, video frame dropped.');
                    if (!decoder || decoder.state === 'closed') initializeDecoder();
                  }
                } else if (dataTypeByte === 1) { // Audio frame
                  const AUDIO_BUFFER_THRESHOLD = 5;
                  if (window.currentAudioBufferSize >= AUDIO_BUFFER_THRESHOLD) {
                    // console.warn(`Playback Audio buffer (${window.currentAudioBufferSize} buffers) is full (>= ${AUDIO_BUFFER_THRESHOLD}). Dropping audio frame.`);
                    return;
                  }
                  if (!isAudioPipelineActive) return;
                  if (audioDecoderWorker) {
                    // Ensure audioContext is running, as it's a prerequisite for AudioWorklet
                    if (audioContext && audioContext.state !== 'running') {
                      // console.warn(`[Main] Playback AudioContext is ${audioContext.state}, attempting resume before sending to worker.`);
                      audioContext.resume().catch(e => console.error("[Main] Error resuming audio context on audio frame arrival", e));
                    }
                    // IMPORTANT: Determine the correct slice for your Opus data.
                    // If server sends: [1-byte type][Opus Data], then .slice(1)
                    // If server sends: [1-byte type][1-byte other][Opus Data], then .slice(2)
                    // The original code had .slice(2) with a comment about 1 byte type & 1 byte unused/type.
                    // Let's assume .slice(2) was correct based on that comment.
                    const opusDataArrayBuffer = arrayBuffer.slice(2);
                    if (opusDataArrayBuffer.byteLength > 0) {
                      audioDecoderWorker.postMessage({
                        type: 'decode',
                        data: {
                          opusBuffer: opusDataArrayBuffer,
                          timestamp: performance.now() * 1000 // Provide a timestamp
                        }
                      }, [opusDataArrayBuffer]); // Transfer the ArrayBuffer
                    } else {
                      console.warn('[Main] Received audio frame with no Opus data after slicing.');
                    }
                  } else {
                    console.warn('[Main] Audio Decoder Worker not available, audio frame dropped. Attempting to initialize audio pipeline.');
                    if (clientMode === 'websockets') {
                      initializeAudio().then(() => { // initializeAudio is async
                        if (audioDecoderWorker) { // Check if worker got created
                          const opusDataArrayBuffer = arrayBuffer.slice(2); // Use consistent slicing
                          if (opusDataArrayBuffer.byteLength > 0) {
                            audioDecoderWorker.postMessage({
                              type: 'decode',
                              data: {
                                opusBuffer: opusDataArrayBuffer,
                                timestamp: performance.now() * 1000
                              }
                            }, [opusDataArrayBuffer]);
                          }
                        }
                      }).catch(err => console.error("[Main] Error during fallback audio initialization:", err));
                    }
                  }
                } else if (dataTypeByte === 0x02) { // Microphone data from server (should not happen)
                  console.log('Received unexpected microphone data (type 0x02) from server.');
                } else if (dataTypeByte === 0x03) { // JPEG Stripe
                  // 1 (type) + 1 + 2 + 2 = 6 bytes. Payload from byte 6.
                  if (arrayBuffer.byteLength < 6) { // Check against original assumption
                    console.warn('[websockets] Received short JPEG stripe message (type 0x03), ignoring.');
                    return;
                  }
                  const stripe_y_start = dataView.getUint16(4, false); // Original offset 4, Big Endiani
                  lastReceivedVideoFrameId = dataView.getUint16(2, false);
                  const jpegDataBuffer = arrayBuffer.slice(6);
                  if (jpegDataBuffer.byteLength === 0) {
                    console.warn('[websockets] Received JPEG stripe (type 0x03) with no image data, ignoring.');
                    return;
                  }
                  decodeAndQueueJpegStripe(stripe_y_start, jpegDataBuffer);
                }
                // --- START VNC H.264 STRIPE (0x04) HANDLING ---
                else if (dataTypeByte === 0x04) { // H.264 VNC Stripe
                  if (!isVideoPipelineActive) {
                    // console.log("VNC Stripe (0x04) received, but video pipeline inactive. Discarding.");
                    return;
                  }
                  if (typeof window.vncStripesArrivedThisPeriod !== 'undefined') {
                    window.vncStripesArrivedThisPeriod++;
                  }
                  const EXPECTED_HEADER_LENGTH = 10;
                  if (arrayBuffer.byteLength < EXPECTED_HEADER_LENGTH) { // Correct check
                    console.warn(`[websockets] Received short H.264 VNC stripe (type 0x04), length ${arrayBuffer.byteLength}, expected at least ${EXPECTED_HEADER_LENGTH}. Ignoring.`);
                    return;
                  }
                  const video_frame_type_byte = dataView.getUint8(1);
                  const vncFrameID = dataView.getUint16(2, false);
                  lastReceivedVideoFrameId = vncFrameID;
                  uniqueStripedFrameIdsThisPeriod.add(lastReceivedVideoFrameId);
                  const vncStripeYStart = dataView.getUint16(4, false);
                  const stripeWidth = dataView.getUint16(6, false);
                  const stripeHeight = dataView.getUint16(8, false);
                  const h264Payload = arrayBuffer.slice(EXPECTED_HEADER_LENGTH);
                  if (h264Payload.byteLength === 0) {
                    console.warn(`[websockets] Received H.264 VNC stripe (type 0x04) for Y=${vncStripeYStart} with no payload, ignoring.`);
                    return;
                  }
                  let decoderInfo = vncStripeDecoders[vncStripeYStart];
                  const chunkType = (video_frame_type_byte === 0x01) ? 'key' : 'delta';
                  if (!decoderInfo) {
                    const newStripeDecoder = new VideoDecoder({
                      output: handleDecodedVncStripeFrame.bind(null, vncStripeYStart, vncFrameID),
                      error: (e) => {
                        console.error(`Error in VideoDecoder for VNC stripe Y=${vncStripeYStart} (FrameID: ${vncFrameID}):`, e.message);
                      }
                    });
                    const decoderConfig = {
                      codec: 'avc1.42E01E',
                      codedWidth: stripeWidth,
                      codedHeight: stripeHeight,
                      optimizeForLatency: true,
                    };
                    vncStripeDecoders[vncStripeYStart] = {
                      decoder: newStripeDecoder,
                      pendingChunks: []
                    };
                    decoderInfo = vncStripeDecoders[vncStripeYStart];
                    VideoDecoder.isConfigSupported(decoderConfig)
                      .then(support => {
                        if (support.supported) {
                          // Return the promise from configure() to chain it
                          return newStripeDecoder.configure(decoderConfig);
                        } else {
                          console.error(`Decoder config not supported for VNC stripe Y=${vncStripeYStart}:`, decoderConfig, support);
                          // Clean up if config not supported
                          if (vncStripeDecoders[vncStripeYStart] && vncStripeDecoders[vncStripeYStart].decoder === newStripeDecoder) {
                            delete vncStripeDecoders[vncStripeYStart];
                          }
                          return Promise.reject(new Error("Configuration not supported")); // Propagate error
                        }
                      })
                      .then(() => {
                        // This .then() block executes ONLY if configure() was successful
                        console.log(`VideoDecoder successfully configured for VNC stripe Y=${vncStripeYStart}`);
                        // Now it's safe to process any chunks that were queued while configuring
                        processPendingChunksForStripe(vncStripeYStart);
                      })
                      .catch(e => {
                        console.error(`Error during support check or configuration for VNC stripe Y=${vncStripeYStart}:`, e);
                        // Ensure cleanup if configuration failed after being added to vncStripeDecoders
                        if (vncStripeDecoders[vncStripeYStart] && vncStripeDecoders[vncStripeYStart].decoder === newStripeDecoder) {
                          try {
                            if (newStripeDecoder.state !== 'closed') newStripeDecoder.close();
                          } catch (closeError) {
                            /* ignore */
                          }
                          delete vncStripeDecoders[vncStripeYStart];
                        }
                      });
                  }
                  // Decoder exists, queue or decode the chunk
                  if (decoderInfo) { // Check again as async configure might have failed and deleted it
                    const chunkTimestamp = performance.now() * 1000; // Microseconds, unique
                    const chunkData = {
                      type: chunkType,
                      timestamp: chunkTimestamp,
                      data: h264Payload
                    };
                    if (decoderInfo.decoder.state === "configured") {
                      const chunk = new EncodedVideoChunk({
                        type: chunkType,
                        timestamp: chunkTimestamp,
                        data: h264Payload
                      });
                      try {
                        decoderInfo.decoder.decode(chunk);
                      } catch (e) {
                        console.error(`Error decoding chunk for VNC stripe Y=${vncStripeYStart}:`, e, chunk);
                      }
                    } else { // "unconfigured" or "configuring"
                      // console.log(`VNC stripe Y=${vncStripeYStart} decoder not configured yet, adding to pending chunks.`);
                      decoderInfo.pendingChunks.push(chunkData);
                    }
                  }
                } else {
                  console.warn('Unknown binary data payload type received:', dataTypeByte);
                }
              }
            } else if (typeof event.data === 'string') {
              if (clientMode === 'websockets') {
                if (event.data.startsWith('{')) {
                  let obj;
                  try {
                    obj = JSON.parse(event.data);
                  } catch (e) {
                    console.error('Error parsing JSON message from server:', e, 'Message:', event.data);
                    return;
                  }
                  if (obj.type === 'system_stats') {
                    window.system_stats = obj;
                  } else if (obj.type === 'gpu_stats') {
                    window.gpu_stats = obj;
                  } else if (obj.type === 'server_settings') {
                    window.postMessage({
                      type: 'serverSettings',
                      encoders: obj.encoders
                    }, window.location.origin);
                  } else if (obj.type === 'server_apps') {
                    if (obj.apps && Array.isArray(obj.apps)) {
                      console.log('[websockets] Received server_apps:', obj.apps);
                      window.postMessage({
                        type: 'systemApps',
                        apps: obj.apps
                      }, window.location.origin);
                    } else {
                      console.warn('[websockets] Received server_apps message without a valid "apps" array:', obj);
                    }
                  } else if (obj.type === 'pipeline_status') {
                    console.log('Received pipeline status confirmation from server:', obj);
                    let statusChanged = false;
                    if (obj.video !== undefined && obj.video !== isVideoPipelineActive) {
                      isVideoPipelineActive = obj.video;
                      statusChanged = true;
                      if (!isVideoPipelineActive && currentEncoderMode === 'x264enc-striped') {
                        clearAllVncStripeDecoders(); // Clear if VNC video is stopped by server
                      }
                    }
                    if (obj.audio !== undefined && obj.audio !== isAudioPipelineActive) {
                      isAudioPipelineActive = obj.audio;
                      statusChanged = true;
                      if (audioDecoderWorker) {
                        audioDecoderWorker.postMessage({
                          type: 'updatePipelineStatus',
                          data: {
                            isActive: isAudioPipelineActive
                          }
                        });
                      }
                    }
                    if (statusChanged) {
                      window.postMessage({
                        type: 'pipelineStatusUpdate',
                        video: isVideoPipelineActive,
                        audio: isAudioPipelineActive
                      }, window.location.origin);
                    }
                  } else {
                    console.warn(`Received unexpected JSON message type from server: ${obj.type}`, obj);
                  }
                } else if (event.data.startsWith('cursor,')) {
                  try {
                    const cursorData = JSON.parse(event.data.substring(7));
                    if (parseInt(cursorData.handle, 10) === 0) {
                      overlayInput.style.cursor = 'auto';
                      return;
                    }
                    const cursor_url = `url('data:image/png;base64,${cursorData.curdata}')`;
                    let cursorStyle = cursor_url;
                    if (cursorData.hotspot) {
                      cursorStyle += ` ${cursorData.hotspot.x} ${cursorData.hotspot.y}, auto`;
                    } else {
                      cursorStyle += ', auto';
                    }
                    overlayInput.style.cursor = cursorStyle;
                  } catch (e) {
                    console.error('Error parsing cursor data:', e);
                  }
                } else if (event.data.startsWith('clipboard,')) {
                  try {
                    const clipboardDataBase64 = event.data.substring(10);
                    const clipboardData = atob(clipboardDataBase64);
                    navigator.clipboard.writeText(clipboardData).catch((err) => {
                      console.error('Could not copy text to clipboard: ' + err);
                    });
                    window.postMessage({
                      type: 'clipboardContentUpdate',
                      text: clipboardData
                    }, window.location.origin);
                  } catch (e) {
                    console.error('Error processing clipboard data:', e);
                  }
                } else if (event.data.startsWith('system,')) {
                  try {
                    const systemMsg = JSON.parse(event.data.substring(7));
                    if (systemMsg.action === 'reload') {
                      console.log('Received system reload action, reloading window.');
                      window.location.reload();
                    }
                  } catch (e) {
                    console.error('Error parsing system data:', e);
                  }
                } else if (event.data === 'VIDEO_STARTED' && !isVideoPipelineActive) {
                  console.log('Received VIDEO_STARTED confirmation.');
                  isVideoPipelineActive = true;
                  window.postMessage({
                    type: 'pipelineStatusUpdate',
                    video: true
                  }, window.location.origin);
                } else if (event.data === 'VIDEO_STOPPED' && isVideoPipelineActive) {
                  console.log('Received VIDEO_STOPPED confirmation.');
                  isVideoPipelineActive = false;
                  window.postMessage({
                    type: 'pipelineStatusUpdate',
                    video: false
                  }, window.location.origin);
                  cleanupVideoBuffer();
                  if (currentEncoderMode === 'x264enc-striped') { // Also clear VNC decoders
                    clearAllVncStripeDecoders();
                  }
                } else if (event.data === 'AUDIO_STARTED' && !isAudioPipelineActive) {
                  console.log('Received AUDIO_STARTED confirmation.');
                  isAudioPipelineActive = true;
                  window.postMessage({
                    type: 'pipelineStatusUpdate',
                    audio: true
                  }, window.location.origin);
                  if (audioDecoderWorker) {
                    audioDecoderWorker.postMessage({
                      type: 'updatePipelineStatus',
                      data: {
                        isActive: true
                      }
                    });
                  }
                } else if (event.data === 'AUDIO_STOPPED' && isAudioPipelineActive) {
                  console.log('Received AUDIO_STOPPED confirmation.');
                  isAudioPipelineActive = false;
                  window.postMessage({
                    type: 'pipelineStatusUpdate',
                    audio: false
                  }, window.location.origin);
                  if (audioDecoderWorker) {
                    audioDecoderWorker.postMessage({
                      type: 'updatePipelineStatus',
                      data: {
                        isActive: false
                      }
                    });
                  }
                } else {
                  if (window.webrtcInput && window.webrtcInput.on_message) {
                    const handled = window.webrtcInput.on_message(event.data);
                    if (!handled) {
                      // console.warn('Received unhandled string message (not input):', event.data);
                    }
                  } else {
                    // console.warn('Received unhandled string message (no input handler):', event.data);
                  }
                }
              } else if (event.data === 'MODE websockets') {
                clientMode = 'websockets';
                console.log('[websockets] Switched to websockets mode.');
                if (currentEncoderMode !== 'x264enc-striped') { // Only init main decoder if not in VNC mode
                  initializeDecoder();
                }
                initializeDecoderAudio();
                initializeInput();
                if (playButtonElement) playButtonElement.classList.add('hidden');
                if (statusDisplayElement) statusDisplayElement.classList.remove('hidden');
                console.log('Starting video painting loop (requestAnimationFrame).');
                requestAnimationFrame(paintVideoFrame);
                if (websocket && websocket.readyState === WebSocket.OPEN) {
                  websocket.send('cr');
                  console.log('[websockets] Sent clipboard request (cr) to server.');
                  if (!document.hidden && !isVideoPipelineActive) websocket.send('START_VIDEO');
                  if (!isAudioPipelineActive) websocket.send('START_AUDIO');
                }
              } else if (event.data === 'MODE webrtc') {
                clientMode = 'webrtc';
                console.log('[websockets] Switched to webrtc mode.');
                if (metricsIntervalId) {
                  clearInterval(metricsIntervalId);
                  metricsIntervalId = null;
                  console.log('[websockets] Stopped client metrics interval for webrtc mode.');
                }
                if (decoder) decoder.close(); // Close main full-frame decoder
                clearAllVncStripeDecoders(); // Clear VNC decoders when switching mode
                cleanupVideoBuffer();
                cleanupJpegStripeQueue();
                stopMicrophoneCapture();
                setupWebRTCMode();
                fetch('./turn')
                  .then((response) => response.json())
                  .then((config) => {
                    turnSwitch = getBoolParam('turnSwitch', turnSwitch);
                    audio_webrtc.forceTurn = turnSwitch;
                    audio_webrtc.rtcPeerConfig = config;
                    const windowResolution =
                      (clientMode === 'webrtc' && webrtc && webrtc.input) ?
                      webrtc.input.getWindowResolution() : [roundDownToEven(window.innerWidth), roundDownToEven(window.innerHeight)];
                    if (!scaleLocallyManual) {
                      videoElement.style.width = `${windowResolution[0] / window.devicePixelRatio}px`;
                      videoElement.style.height = `${windowResolution[1] / window.devicePixelRatio}px`;
                    }
                    if (config.iceServers.length > 1) {
                      appendDebugEntry(
                        applyTimestamp(
                          `[app] using TURN servers: ${config.iceServers[1].urls.join(
                    ', '
                  )}`
                        )
                      );
                    } else {
                      appendDebugEntry(applyTimestamp('[app] no TURN servers found.'));
                    }
                    audio_webrtc.connect();
                    webrtc.forceTurn = turnSwitch;
                    webrtc.rtcPeerConfig = config;
                    webrtc.connect();
                  });
              }
            }
          };
          websocket.onerror = (event) => {
            console.error('[websockets] Error:', event);
            if (metricsIntervalId) {
              clearInterval(metricsIntervalId);
              metricsIntervalId = null;
              console.log('[websockets] Stopped client metrics interval due to error.');
            }
          };
          websocket.onclose = (event) => {
            console.log('[websockets] Connection closed', event);
            if (metricsIntervalId) {
              clearInterval(metricsIntervalId);
              metricsIntervalId = null;
              console.log('[websockets] Stopped client metrics interval due to close.');
            }
            cleanupVideoBuffer();
            cleanupJpegStripeQueue();
            if (decoder) decoder.close();
            clearAllVncStripeDecoders(); // VNC decoders on close
            decoder = null;
            if (audioDecoderWorker) {
              console.log('[websockets] Closing: Terminating Audio Decoder Worker.');
              audioDecoderWorker.postMessage({
                type: 'close'
              });
              audioDecoderWorker = null;
            }
            stopMicrophoneCapture();
            isVideoPipelineActive = false;
            isAudioPipelineActive = false;
            isMicrophoneActive = false;
            window.postMessage({
              type: 'pipelineStatusUpdate',
              video: false,
              audio: false
            }, window.location.origin);
          };
          // Reconnect on drop 
          setInterval(() => {
            if (clientMode === 'websockets' && websocket && websocket.readyState === WebSocket.OPEN) {
              // Pass
            } else {
              location.reload()
            }
          }, 1000);
        });

        function cleanupVideoBuffer() {
          let closedCount = 0;
          while (videoFrameBuffer.length > 0) {
            const frame = videoFrameBuffer.shift();
            try {
              frame.close();
              closedCount++;
            } catch (e) {
              // Ignore errors closing already closed frames
            }
          }
          if (closedCount > 0) console.log(`Cleanup: Closed ${closedCount} video frames from main buffer.`);
        }

        function cleanupJpegStripeQueue() {
          let closedCount = 0;
          while (jpegStripeRenderQueue.length > 0) {
            const segment = jpegStripeRenderQueue.shift();
            if (segment && segment.image && typeof segment.image.close === 'function') {
              try {
                segment.image.close();
                closedCount++;
              } catch (e) {
                /* ignore */
              }
            }
          }
          if (closedCount > 0) console.log(`Cleanup: Closed ${closedCount} JPEG stripe images.`);
        }
        const audioDecoderWorkerCode = `
  let decoderAudio;
  let pipelineActive = true;
  let currentDecodeQueueSize = 0;
  const decoderConfig = {
    codec: 'opus',
    numberOfChannels: 2,
    sampleRate: 48000,
  };

  async function initializeDecoderInWorker() {
    if (decoderAudio && decoderAudio.state !== 'closed') {
      console.log('[AudioWorker] Closing existing AudioDecoder before re-initializing.');
      try {
        decoderAudio.close();
      } catch (e) {
        console.warn('[AudioWorker] Error closing existing AudioDecoder:', e);
      }
    }
    currentDecodeQueueSize = 0;

    decoderAudio = new AudioDecoder({
      output: handleDecodedAudioFrameInWorker, // This will be the async version
      error: (e) => {
        console.error('[AudioWorker] AudioDecoder error:', e.message, e);
        currentDecodeQueueSize = Math.max(0, currentDecodeQueueSize -1);
        if (e.message.includes('fatal') || (decoderAudio && (decoderAudio.state === 'closed' || decoderAudio.state === 'unconfigured'))) {
          console.warn('[AudioWorker] Attempting to reset AudioDecoder due to error or bad state.');
          initializeDecoderInWorker(); // Try to recover
        }
        // Optionally, notify main thread of persistent errors
        // self.postMessage({ type: 'decoderError', message: e.message });
      },
    });

    try {
      const support = await AudioDecoder.isConfigSupported(decoderConfig);
      if (support.supported) {
        await decoderAudio.configure(decoderConfig);
        console.log('[AudioWorker] AudioDecoder configured successfully.');
        self.postMessage({ type: 'decoderInitialized' });
      } else {
        console.error('[AudioWorker] AudioDecoder configuration not supported:', support);
        decoderAudio = null;
        self.postMessage({ type: 'decoderInitFailed', reason: 'configNotSupported' });
      }
    } catch (e) {
      console.error('[AudioWorker] Error configuring AudioDecoder:', e);
      decoderAudio = null;
      self.postMessage({ type: 'decoderInitFailed', reason: e.message });
    }
  }

  async function handleDecodedAudioFrameInWorker(frame) {
    currentDecodeQueueSize = Math.max(0, currentDecodeQueueSize - 1);

    if (!frame || typeof frame.copyTo !== 'function' || typeof frame.allocationSize !== 'function' || typeof frame.close !== 'function') {
        console.error('[AudioWorker] Invalid frame received in output callback or frame missing methods. Frame:', frame);
        if(frame && typeof frame.close === 'function') {
            try { frame.close(); } catch(e) { /* ignore */ }
        }
        return;
    }

    if (!pipelineActive) {
      try { frame.close(); } catch(e) { /* ignore */ }
      return;
    }

    let pcmDataArrayBuffer;

    try {
      const requiredByteLength = frame.allocationSize({ planeIndex: 0, format: 'f32' });
      if (requiredByteLength === 0) {
          console.warn('[AudioWorker] Frame allocation size is 0. Skipping. Frame format:', frame.format);
          // It's crucial to close the frame if we're not processing it further.
          try { frame.close(); } catch(e) { /* ignore */ }
          return;
      }

      pcmDataArrayBuffer = new ArrayBuffer(requiredByteLength);
      const pcmDataView = new Float32Array(pcmDataArrayBuffer);

      await frame.copyTo(pcmDataView, { planeIndex: 0, format: 'f32' });

      self.postMessage({ type: 'decodedAudioData', pcmBuffer: pcmDataArrayBuffer }, [pcmDataArrayBuffer]);
      pcmDataArrayBuffer = null; // Buffer is transferred

    } catch (error) {
      console.error('[AudioWorker] Audio processing error in handleDecodedAudioFrameInWorker:', error,
                    'Frame format:', frame?.format, 'Sample rate:', frame?.sampleRate,
                    'Channels:', frame?.numberOfChannels, 'Frames (samples):', frame?.numberOfFrames,
                    'Duration (us):', frame?.duration);
    } finally {
      // Frame should be closed by the time copyTo promise resolves or if an error occurs before/during copyTo.
      // If an error occurs *after* copyTo but *before* postMessage, the frame might still be open.
      // The AudioDecoder spec implies frames are single-use and should be closed.
      // If copyTo succeeds, the data is copied. If it fails, the frame should still be closed.
      if (frame && typeof frame.close === 'function') { // Check again as it might have been closed in an error path.
        try {
            frame.close();
        } catch (e) {
            // console.warn('[AudioWorker] Error closing frame in finally (already closed?):', e.message);
        }
      }
    }
  }

  self.onmessage = async (event) => {
    const { type, data } = event.data;

    switch (type) {
      case 'init': // Worker receives initial pipeline status
        pipelineActive = data.initialPipelineStatus;
        console.log('[AudioWorker] Initialized. Initial pipeline status:', pipelineActive);
        await initializeDecoderInWorker();
        break;
      case 'decode':
        if (!pipelineActive) return;

        if (decoderAudio && decoderAudio.state === 'configured') {
          const opusBuffer = data.opusBuffer;
          const chunk = new EncodedAudioChunk({
            type: 'key',
            timestamp: data.timestamp || (performance.now() * 1000),
            data: opusBuffer,
          });
          try {
            if (currentDecodeQueueSize < 20) { // Simple backpressure
              decoderAudio.decode(chunk);
              currentDecodeQueueSize++;
            } else {
              // console.warn(\`[AudioWorker] Decode queue full (\${currentDecodeQueueSize}), dropping frame.\`);
              // If dropping, we don't increment currentDecodeQueueSize for this chunk
            }
          } catch (e) {
            console.error('[AudioWorker] Error decoding audio chunk:', e);
            // Don't decrement currentDecodeQueueSize here, as the chunk wasn't successfully enqueued for output.
            // The 'output' or 'error' callback of the decoder will handle queue size adjustment.
            if (decoderAudio.state === 'closed' || decoderAudio.state === 'unconfigured') {
              await initializeDecoderInWorker();
            }
          }
        } else if (!decoderAudio || (decoderAudio && decoderAudio.state !== 'configuring')) {
          console.warn('[AudioWorker] Decoder not configured or in bad state when receiving decode message. Attempting to initialize.');
          await initializeDecoderInWorker();
          // TODO: Could consider queuing the chunk here and processing after successful init
        }
        break;
      case 'reinitialize':
        console.log('[AudioWorker] Received reinitialize request.');
        await initializeDecoderInWorker();
        break;
      case 'updatePipelineStatus':
        pipelineActive = data.isActive;
        console.log('[AudioWorker] Pipeline status updated to:', pipelineActive);
        if (!pipelineActive && decoderAudio && decoderAudio.state === 'configured') {
            // If pipeline becomes inactive, we might want to flush the decoder
            // This helps clear out any pending frames if the pipeline is paused for a while.
            // However, a simple flush might not be enough if there's a large input queue.
            // For now, just stopping new decodes is the primary action.
            // try {
            //   await decoderAudio.flush();
            //   console.log('[AudioWorker] Flushed AudioDecoder due to inactive pipeline.');
            // } catch (e) {
            //   console.warn('[AudioWorker] Error flushing AudioDecoder:', e);
            // }
        }
        break;
      case 'close':
        console.log('[AudioWorker] Received close request.');
        if (decoderAudio && decoderAudio.state !== 'closed') {
          try {
            decoderAudio.close();
            console.log('[AudioWorker] AudioDecoder closed.');
          } catch (e) { /* ignore */ }
        }
        decoderAudio = null;
        self.close(); // Worker terminates itself
        break;
      default:
        console.warn('[AudioWorker] Received unknown message type:', type);
    }
  };
`;
        // --- Microphone Worklet Code ---
        const micWorkletProcessorCode = `
class MicWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];

    if (input && input[0]) { // Check if input and channel data are available
      const inputChannelData = input[0];
      const int16Array = Int16Array.from(inputChannelData, x => x * 32767);
      if (! int16Array.every(item => item === 0)) {
        this.port.postMessage(int16Array.buffer, [int16Array.buffer]);
      }
    }
    return true; // Keep the processor alive
  }
}

registerProcessor('mic-worklet-processor', MicWorkletProcessor);
`;
        async function startMicrophoneCapture() {
          // Check if already active or prerequisites missing
          if (isMicrophoneActive || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            if (!isMicrophoneActive) {
              console.warn('getUserMedia not supported or mediaDevices not available.');
              // Ensure state reflects reality and trigger UI update
              isMicrophoneActive = false;
              postSidebarButtonUpdate(); // Post update even on failure to start due to lack of support
            } else {
              console.warn('Microphone already active.');
              postSidebarButtonUpdate();
            }
            return; // Exit if already active or not supported
          }
          console.log('Attempting to start microphone capture...');
          // Define constraints variable here to be accessible in catch block
          let constraints;
          try {
            // 1. Get Microphone Stream with selected device preference
            constraints = { // Assign to the outer scope variable
              audio: {
                deviceId: preferredInputDeviceId ? {
                  exact: preferredInputDeviceId
                } : undefined,
                sampleRate: 24000,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
              },
              video: false
            };
            console.log("Requesting microphone with constraints:", JSON.stringify(constraints.audio));
            micStream = await navigator.mediaDevices.getUserMedia(constraints);
            console.log('Microphone access granted.');
            // Log actual settings and update preferred device if needed
            const audioTracks = micStream.getAudioTracks();
            if (audioTracks.length > 0) {
              const settings = audioTracks[0].getSettings();
              console.log("Actual microphone settings obtained:", settings);
              if (!preferredInputDeviceId && settings.deviceId) {
                console.log(`Default input device resolved to: ${settings.deviceId} (${settings.label || 'No Label'})`);
                preferredInputDeviceId = settings.deviceId;
              }
              // Log if the requested sample rate was achieved
              if (settings.sampleRate && settings.sampleRate !== 24000) {
                console.warn(`Requested sampleRate 24000 but got ${settings.sampleRate}`);
              }
            }
            // 2. Create *separate* AudioContext for Microphone
            if (micAudioContext && micAudioContext.state !== 'closed') {
              console.warn("Closing existing micAudioContext before creating a new one.");
              await micAudioContext.close();
              micAudioContext = null; // Clear reference
            }
            micAudioContext = new AudioContext({
              sampleRate: 24000
            }); // Use the requested sample rate
            console.log('Microphone AudioContext created. Initial State:', micAudioContext.state, 'Sample Rate:', micAudioContext.sampleRate);
            if (micAudioContext.state === 'suspended') {
              console.log('Mic AudioContext is suspended, attempting resume...');
              await micAudioContext.resume();
              console.log('Mic AudioContext resumed. New State:', micAudioContext.state);
            }
            // Check if the actual context sample rate matches requested
            if (micAudioContext.sampleRate !== 24000) {
              console.warn(`Requested AudioContext sampleRate 24000 but created context has ${micAudioContext.sampleRate}`);
            }
            // 3. Add MicWorkletProcessor Module (Ensure micWorkletProcessorCode is defined)
            if (typeof micWorkletProcessorCode === 'undefined' || !micWorkletProcessorCode) {
              throw new Error("micWorkletProcessorCode is not defined. Cannot add AudioWorklet module.");
            }
            const micWorkletBlob = new Blob([micWorkletProcessorCode], {
              type: 'application/javascript'
            }); // Use correct MIME type
            const micWorkletURL = URL.createObjectURL(micWorkletBlob);
            try {
              await micAudioContext.audioWorklet.addModule(micWorkletURL);
              console.log('Microphone AudioWorklet module added.');
            } finally {
              URL.revokeObjectURL(micWorkletURL); // Revoke URL immediately after addModule promise resolves/rejects
            }
            // 4. Create Source and Worklet Nodes
            micSourceNode = micAudioContext.createMediaStreamSource(micStream);
            micWorkletNode = new AudioWorkletNode(micAudioContext, 'mic-worklet-processor'); // Ensure this name matches registerProcessor
            console.log('Microphone source and worklet nodes created.');
            // 5. Set up WebSocket message handler for processed audio
            micWorkletNode.port.onmessage = (event) => {
              const pcm16Buffer = event.data;
              const wsState = websocket ? websocket.readyState : 'No WebSocket';
              if (websocket && websocket.readyState === WebSocket.OPEN && isMicrophoneActive) {
                if (!pcm16Buffer || !(pcm16Buffer instanceof ArrayBuffer) || pcm16Buffer.byteLength === 0) {
                  return;
                }
                // Message format: 1 byte type (0x02) + PCM data
                const messageBuffer = new ArrayBuffer(1 + pcm16Buffer.byteLength);
                const messageView = new DataView(messageBuffer);
                messageView.setUint8(0, 0x02); // Type byte for PCM audio
                new Uint8Array(messageBuffer, 1).set(new Uint8Array(pcm16Buffer)); // Copy PCM data
                try {
                  websocket.send(messageBuffer);
                } catch (e) {
                  console.error("Error sending microphone data via websocket:", e);
                }
              } else if (!isMicrophoneActive) {
                // console.log("Microphone inactive, dropping message from worklet."); // Can be noisy
              } else {
                console.warn("WebSocket not open or null, cannot send microphone data. State:", wsState);
              }
            };
            micWorkletNode.port.onmessageerror = (event) => {
              console.error("Error receiving message from mic worklet:", event);
            };
            // 6. Connect the nodes
            micSourceNode.connect(micWorkletNode);
            console.log('Microphone nodes connected.');
            // 7. Update State and Trigger UI Update via postMessage
            isMicrophoneActive = true;
            postSidebarButtonUpdate(); // Post message to update UI
            console.log('Microphone capture started successfully.');
          } catch (error) {
            console.error('Failed to start microphone capture:', error);
            if (constraints) { // Log constraints if they were defined
              console.error('Error occurred after requesting constraints:', JSON.stringify(constraints.audio));
            }
            if (error.name === 'NotAllowedError') {
              alert("Microphone access was denied. Please grant permission in your browser settings.");
            } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
              alert("No microphone found, or the selected microphone is unavailable. Please check your hardware and browser settings.");
              // Clear preference if specific device failed
              if (preferredInputDeviceId) {
                console.warn(`Failed to find preferred device ${preferredInputDeviceId}. Clearing preference.`);
                preferredInputDeviceId = null;
              }
            } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
              alert("Could not read from the microphone. It might be in use by another application or there could be a hardware issue.");
            } else if (error.name === 'OverconstrainedError') {
              alert(`Could not satisfy microphone requirements (e.g., sample rate ${constraints?.audio?.sampleRate}). Try default settings.`);
              console.error("OverconstrainedError details:", error.constraint);
            } else if (error.message.includes("addModule")) {
              alert("Failed to load audio processing module. Please check console for details.");
            } else {
              alert(`An unexpected error occurred while starting the microphone: ${error.message}`);
            }
            // Clean up any resources that might have been partially created
            stopMicrophoneCapture();
            // Ensure state reflects failure and trigger UI update via postMessage
            isMicrophoneActive = false;
            postSidebarButtonUpdate(); // Post message to update UI to reflect failure
          }
        }

        function stopMicrophoneCapture() {
          // Only proceed if the microphone is actually active
          if (!isMicrophoneActive && !micStream && !micAudioContext) { // Check all relevant states
            // console.log('Stop capture called, but microphone appears to be already inactive or not initialized.');
            if (isMicrophoneActive) { // If state is true but resources are null, correct state.
              isMicrophoneActive = false;
              postSidebarButtonUpdate();
            }
            return;
          }
          console.log('Stopping microphone capture...');
          // 1. Stop MediaStream Tracks
          if (micStream) {
            micStream.getTracks().forEach(track => {
              track.stop();
              console.log(`Microphone track stopped: ${track.kind} (${track.label})`);
            });
            micStream = null; // Clear the reference
          } else {
            // console.log('No active microphone stream (micStream) found to stop tracks for.');
          }
          // 2. Disconnect Nodes (Disconnect in reverse order: worklet first)
          if (micWorkletNode) {
            // Remove listeners first to prevent potential errors during/after disconnect
            micWorkletNode.port.onmessage = null;
            micWorkletNode.port.onmessageerror = null;
            try {
              micWorkletNode.disconnect();
              console.log('Microphone worklet node disconnected.');
            } catch (e) {
              console.warn("Error disconnecting worklet node (already disconnected?):", e);
            }
            micWorkletNode = null; // Clear reference
          } else {
            // console.log('No microphone worklet node (micWorkletNode) found to disconnect.');
          }
          if (micSourceNode) {
            try {
              micSourceNode.disconnect();
              console.log('Microphone source node disconnected.');
            } catch (e) {
              console.warn("Error disconnecting source node (already disconnected?):", e);
            }
            micSourceNode = null; // Clear reference
          } else {
            // console.log('No microphone source node (micSourceNode) found to disconnect.');
          }
          // 3. Close Microphone AudioContext
          if (micAudioContext) {
            if (micAudioContext.state !== 'closed') {
              console.log(`Closing microphone AudioContext (State: ${micAudioContext.state})...`);
              micAudioContext.close().then(() => {
                console.log('Microphone AudioContext closed successfully.');
              }).catch(e => {
                console.error('Error closing microphone AudioContext:', e);
              }).finally(() => {
                micAudioContext = null; // Clear reference after attempt
              });
            } else {
              // console.log('Microphone AudioContext already closed.');
              micAudioContext = null; // Ensure reference is cleared
            }
          } else {
            // console.log('No microphone AudioContext (micAudioContext) found to close.');
          }
          // 4. Update State and Trigger UI Update via postMessage
          if (isMicrophoneActive) { // Only update if state was true
            isMicrophoneActive = false;
            postSidebarButtonUpdate(); // Post message to update UI
            console.log('Microphone capture stopped state updated and UI update posted.');
          }
        }

        function cleanup() {
          if (metricsIntervalId) {
            clearInterval(metricsIntervalId);
            metricsIntervalId = null;
            console.log('Cleanup: Stopped client metrics interval.');
          }
          if (window.isCleaningUp) return;
          window.isCleaningUp = true;
          console.log("Cleanup: Starting cleanup process...");
          // Stop microphone first
          stopMicrophoneCapture();
          if (clientMode === 'webrtc' && signalling) {
            signalling.disconnect();
            signalling = null;
          }
          if (audio_signalling) {
            audio_signalling.disconnect();
            audio_signalling = null;
          }
          if (clientMode === 'webrtc' && webrtc) {
            webrtc.reset();
            webrtc = null;
          }
          if (audio_webrtc) {
            audio_webrtc.reset();
            audio_webrtc = null;
          }
          if (websocket) {
            websocket.onopen = null;
            websocket.onmessage = null;
            websocket.onerror = null;
            websocket.onclose = null;
            if (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING) {
              websocket.close();
              console.log("Cleanup: Closed websocket connection.");
            }
            websocket = null;
          }
          // Cleanup Playback Audio Context
          if (audioContext) {
            if (audioContext.state !== 'closed') {
              console.log(`Cleanup: Closing Playback AudioContext (state: ${audioContext.state})`);
              audioContext.close().then(() => console.log('Cleanup: Playback AudioContext closed.')).catch(e => console.error('Cleanup: Error closing Playback AudioContext:', e));
            }
            audioContext = null;
            audioWorkletNode = null;
            audioWorkletProcessorPort = null;
            audioBufferQueue.length = 0;
            window.currentAudioBufferSize = 0;
            if (audioDecoderWorker) {
              console.log("Cleanup: Terminating Audio Decoder Worker.");
              audioDecoderWorker.postMessage({
                type: 'close'
              }); // Ask worker to close its decoder
              audioDecoderWorker = null;
            }
          }
          if (decoder) { // Main full-frame decoder
            if (decoder.state !== 'closed') {
              decoder.close();
              console.log("Cleanup: Closed Main VideoDecoder.");
            }
            decoder = null;
          }
          cleanupVideoBuffer(); // For main video frames
          cleanupJpegStripeQueue(); // For JPEG stripes
          clearAllVncStripeDecoders(); // For H.264 VNC stripes
          // Reset audio device preferences
          preferredInputDeviceId = null;
          preferredOutputDeviceId = null;
          console.log("Cleanup: Reset preferred audio device IDs.");
          status = 'connecting';
          loadingText = '';
          showStart = true;
          streamStarted = false;
          inputInitialized = false;
          if (statusDisplayElement) statusDisplayElement.textContent = 'Connecting...';
          if (statusDisplayElement) statusDisplayElement.classList.remove('hidden');
          if (playButtonElement) playButtonElement.classList.remove('hidden');
          if (overlayInput) overlayInput.style.cursor = 'auto';
          serverClipboardContent = '';
          isVideoPipelineActive = true; // Reset to default assumption
          isAudioPipelineActive = true; // Reset to default assumption
          isMicrophoneActive = false; // Always starts off
          connectionStat.connectionStatType = 'unknown';
          connectionStat.connectionLatency = 0;
          // ... (rest of connectionStat resets) ...
          gamepad.gamepadState = 'disconnected';
          gamepad.gamepadName = 'none';
          // ... (rest of state variable resets) ...
          window.fps = 0;
          frameCount = 0;
          lastFpsUpdateTime = performance.now();
          console.log("Cleanup: Finished cleanup process.");
          window.isCleaningUp = false;
        }
        /**
         * Handles the 'dragover' event to allow dropping.
         * @param {DragEvent} ev
         */
        function handleDragOver(ev) {
          ev.preventDefault(); // Necessary to allow dropping
          ev.dataTransfer.dropEffect = 'copy';
        }
        /**
         * Handles the 'drop' event on the overlayInput element.
         * Collects entries first, then processes sequentially using async/await.
         * @param {DragEvent} ev
         */
        async function handleDrop(ev) {
          ev.preventDefault();
          ev.stopPropagation();
          if (!websocket || websocket.readyState !== WebSocket.OPEN) {
            const errorMsg = "WebSocket is not open. Cannot upload files.";
            console.error(errorMsg);
            // Send error message to window if needed
            window.postMessage({
              type: 'fileUpload',
              payload: {
                status: 'error',
                fileName: 'N/A',
                message: errorMsg
              }
            }, window.location.origin);
            return;
          }
          console.log("File(s) dropped, collecting entries...");
          const entriesToProcess = []; // Array to hold valid entries
          if (ev.dataTransfer.items) {
            // Synchronously collect all entries from the item list
            for (let i = 0; i < ev.dataTransfer.items.length; i++) {
              const item = ev.dataTransfer.items[i];
              const entry = item.webkitGetAsEntry() || item.getAsEntry();
              if (entry) {
                entriesToProcess.push(entry); // Add the entry to our array
              } else {
                console.warn("Could not get FileSystemEntry for dropped item.", item);
              }
            }
          } else {
            for (let i = 0; i < ev.dataTransfer.files.length; i++) {
              console.warn("Legacy file drop detected. Handling files directly.");
            }
            if (entriesToProcess.length === 0 && ev.dataTransfer.files.length > 0) {
              console.log("Processing legacy files sequentially.");
              try {
                for (let i = 0; i < ev.dataTransfer.files.length; i++) {
                  await uploadFileObject(ev.dataTransfer.files[i], ev.dataTransfer.files[i].name);
                }
                console.log("Finished processing all legacy files.");
              } catch (error) {
                const errorMsg = `An error occurred during the legacy file upload process: ${error.message || error}`;
                console.error(errorMsg);
                window.postMessage({
                  type: 'fileUpload',
                  payload: {
                    status: 'error',
                    fileName: 'N/A',
                    message: errorMsg
                  }
                }, window.location.origin);
                if (websocket && websocket.readyState === WebSocket.OPEN) {
                  try {
                    websocket.send(`FILE_UPLOAD_ERROR:GENERAL:Legacy processing failed`);
                  } catch (_) {}
                }
              } finally {
                // No explicit cleanup needed here for legacy files
              }
              return;
            }
          }
          console.log(`Collected ${entriesToProcess.length} entries to process sequentially.`);
          // Now, sequentially process the entries from our stable array
          try {
            for (const entry of entriesToProcess) {
              const entryName = entry.name || 'Unknown Entry Name';
              console.log(`Processing collected entry: ${entryName}`);
              await handleDroppedEntry(entry);
            }
            console.log("Finished processing all collected entries.");
          } catch (error) {
            const errorMsg = `An error occurred during the sequential upload process: ${error.message || error}`;
            console.error(errorMsg);
            window.postMessage({
              type: 'fileUpload',
              payload: {
                status: 'error',
                fileName: 'N/A',
                message: errorMsg
              }
            }, window.location.origin);
            if (websocket && websocket.readyState === WebSocket.OPEN) {
              try {
                websocket.send(`FILE_UPLOAD_ERROR:GENERAL:Processing failed`);
              } catch (_) {}
            }
          } finally {
            console.log("Upload process finished.");
          }
        }
        /**
         * Promisified version of entry.file()
         * @param {FileSystemFileEntry} fileEntry
         * @returns {Promise<File>}
         */
        function getFileFromEntry(fileEntry) {
          return new Promise((resolve, reject) => {
            fileEntry.file(resolve, reject);
          });
        }
        /**
         * Recursively handles a dropped FileSystemEntry (file or directory) sequentially.
         * @param {FileSystemEntry} entry
         */
        async function handleDroppedEntry(entry) {
          if (entry.isFile) {
            const pathName = entry.fullPath || entry.name; // Use fullPath if available
            try {
              // Get the file object using the promisified helper
              const file = await getFileFromEntry(entry);
              // Await the upload of this file, passing the path
              await uploadFileObject(file, pathName);
            } catch (err) {
              const errorMsg = `Error getting or uploading file from entry ${pathName}: ${err.message || err}`;
              console.error(errorMsg);
              window.postMessage({
                type: 'fileUpload',
                payload: {
                  status: 'error',
                  fileName: pathName,
                  message: errorMsg
                }
              }, window.location.origin);
              if (websocket && websocket.readyState === WebSocket.OPEN) {
                try {
                  websocket.send(`FILE_UPLOAD_ERROR:${pathName}:Failed to get/upload file`);
                } catch (_) {}
              }
              throw err;
            }
          } else if (entry.isDirectory) {
            const dirPath = entry.fullPath || entry.name;
            console.log(`Reading directory: ${dirPath}`);
            const dirReader = entry.createReader();
            // Await the processing of the entire directory
            await readDirectoryEntries(dirReader);
          }
        }
        /**
         * Promisified version of dirReader.readEntries()
         * Reads one batch of entries.
         * @param {FileSystemDirectoryReader} dirReader
         * @returns {Promise<FileSystemEntry[]>}
         */
        function readEntriesPromise(dirReader) {
          return new Promise((resolve, reject) => {
            dirReader.readEntries(resolve, reject);
          });
        }
        /**
         * Recursively reads and processes all entries in a directory sequentially.
         * @param {FileSystemDirectoryReader} dirReader
         */
        async function readDirectoryEntries(dirReader) {
          let entries;
          do {
            // Await reading a batch of entries
            entries = await readEntriesPromise(dirReader);
            if (entries.length > 0) {
              // Process each entry in the batch sequentially
              for (const entry of entries) {
                await handleDroppedEntry(entry);
              }
            }
          } while (entries.length > 0);
        }
        /**
         * Uploads a single File object by chunking it. Returns a Promise.
         * Sends start, progress, end, and error messages via window.postMessage.
         * @param {File} file The File object to upload.
         * @param {string} pathToSend The relative path of the file to send to the server.
         * @returns {Promise<void>} Resolves when upload is complete, rejects on error.
         */
        function uploadFileObject(file, pathToSend) {
          // Wrap in a Promise
          return new Promise((resolve, reject) => {
            if (!websocket || websocket.readyState !== WebSocket.OPEN) {
              const errorMsg = `WebSocket closed before file ${pathToSend} could be uploaded.`;
              console.error(errorMsg);
              // Send error message to window
              window.postMessage({
                type: 'fileUpload',
                payload: {
                  status: 'error',
                  fileName: pathToSend,
                  message: errorMsg
                }
              }, window.location.origin);
              reject(new Error(errorMsg));
              return;
            }
            console.log(`Starting upload for: ${pathToSend} (${file.size} bytes)`);
            // Send START message via window.postMessage
            window.postMessage({
              type: 'fileUpload',
              payload: {
                status: 'start',
                fileName: pathToSend,
                fileSize: file.size
              }
            }, window.location.origin);
            websocket.send(`FILE_UPLOAD_START:${pathToSend}:${file.size}`);
            let offset = 0;
            const reader = new FileReader();
            reader.onload = function(e) {
              if (!websocket || websocket.readyState !== WebSocket.OPEN) {
                const errorMsg = `WebSocket closed during upload of ${pathToSend}. Aborting.`;
                console.error(errorMsg);
                // Send error message to window
                window.postMessage({
                  type: 'fileUpload',
                  payload: {
                    status: 'error',
                    fileName: pathToSend,
                    message: errorMsg
                  }
                }, window.location.origin);
                reject(new Error(errorMsg));
                return;
              }
              if (e.target.error) {
                const errorMsg = `Error reading file ${pathToSend}: ${e.target.error}`;
                console.error(errorMsg);
                // Send error message to window
                window.postMessage({
                  type: 'fileUpload',
                  payload: {
                    status: 'error',
                    fileName: pathToSend,
                    message: errorMsg
                  }
                }, window.location.origin);
                // Try to notify server before rejecting
                try {
                  websocket.send(`FILE_UPLOAD_ERROR:${pathToSend}:${e.target.error}`);
                } catch (_) {}
                reject(e.target.error);
                return;
              }
              try {
                const prefixedView = new Uint8Array(1 + e.target.result.byteLength);
                prefixedView[0] = 0x01; // Data type for file chunk
                prefixedView.set(new Uint8Array(e.target.result), 1);
                websocket.send(prefixedView.buffer);
                offset += e.target.result.byteLength;
                // Calculate and send PROGRESS message via window.postMessage
                const progress = file.size > 0 ? Math.round((offset / file.size) * 100) : 100;
                window.postMessage({
                  type: 'fileUpload',
                  payload: {
                    status: 'progress',
                    fileName: pathToSend,
                    progress: progress,
                    fileSize: file.size
                  }
                }, window.location.origin);
                if (offset < file.size) {
                  readChunk(offset); // Read next chunk
                } else {
                  console.log(`Finished uploading ${pathToSend}`);
                  websocket.send(`FILE_UPLOAD_END:${pathToSend}`);
                  window.postMessage({
                    type: 'fileUpload',
                    payload: {
                      status: 'end',
                      fileName: pathToSend,
                      fileSize: file.size
                    }
                  }, window.location.origin);
                  resolve();
                }
              } catch (wsError) {
                const errorMsg = `WebSocket error sending chunk for ${pathToSend}: ${wsError}`;
                console.error(errorMsg);
                window.postMessage({
                  type: 'fileUpload',
                  payload: {
                    status: 'error',
                    fileName: pathToSend,
                    message: errorMsg
                  }
                }, window.location.origin);
                try {
                  websocket.send(`FILE_UPLOAD_ERROR:${pathToSend}:WebSocket send failed`);
                } catch (_) {}
                reject(wsError);
              }
            };
            reader.onerror = function(e) {
              const errorMsg = `FileReader error for ${pathToSend}: ${e.target.error}`;
              console.error(errorMsg);
              // Send error message to window
              window.postMessage({
                type: 'fileUpload',
                payload: {
                  status: 'error',
                  fileName: pathToSend,
                  message: errorMsg
                }
              }, window.location.origin);
              if (websocket && websocket.readyState === WebSocket.OPEN) {
                try {
                  websocket.send(`FILE_UPLOAD_ERROR:${pathToSend}:${e.target.error}`);
                } catch (_) {}
              }
              reject(e.target.error);
            };

            function readChunk(startOffset) {
              // Check websocket state *before* reading next chunk
              if (!websocket || websocket.readyState !== WebSocket.OPEN) {
                const errorMsg = `WebSocket closed before reading next chunk for ${pathToSend}. Aborting.`;
                console.error(errorMsg);
                // Send error message to window
                window.postMessage({
                  type: 'fileUpload',
                  payload: {
                    status: 'error',
                    fileName: pathToSend,
                    message: errorMsg
                  }
                }, window.location.origin);
                reject(new Error(errorMsg));
                return;
              }
              const endOffset = Math.min(startOffset + UPLOAD_CHUNK_SIZE, file.size);
              const slice = file.slice(startOffset, endOffset);
              reader.readAsArrayBuffer(slice);
            }
            // Start reading the first chunk
            readChunk(0);
          });
        }
        window.addEventListener('beforeunload', cleanup);
        window.webrtcInput = null;
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
              const distSq = dx * dx + dy * dy;
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
        const deltaDistSq = deltaX * deltaX + deltaY * deltaY;
        // --- Check for Swipe ---
        // Swipe check happens if _isTwoFingerGesture was true when this finger lifted
        // OR if it was the *second* finger lifting very quickly after the first one.
        if (this._isTwoFingerGesture) {
          // Check swipe criteria
          if (duration < this._MAX_SWIPE_DURATION &&
            Math.abs(deltaY) > this._MIN_SWIPE_DISTANCE &&
            Math.abs(deltaY) > Math.abs(deltaX) * this._VERTICAL_SWIPE_RATIO) {
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
    toks = [mtype, this.x, this.y, this.buttonMask, magnitude];
    this.send(toks.join(","));
    // Ensure button release happens shortly after press
    setTimeout(() => {
      // Check if the button is still pressed before releasing
      if ((this.buttonMask & mask) !== 0) {
        this.buttonMask &= ~mask;
        toks = [mtype, this.x, this.y, this.buttonMask, magnitude];
        this.send(toks.join(","));
      }
    }, 10); // Small delay before sending release
  }
  _dropThreshold() {
    var count = 0;
    var val1 = this._queue.dequeue();
    while (!this._queue.isEmpty()) {
      var valNext = this._queue.dequeue();
      if (valNext >= 80 && val1 == valNext) {
        count++;
      }
      val1 = valNext;
    }
    return count >= 2;
  }
  _mouseWheelWrapper(event) {
    var deltaY = Math.trunc(Math.abs(event.deltaY));
    if (this._queue.size() < 4) {
      this._queue.enqueue(deltaY);
    }
    if (this._queue.size() == 4) {
      if (this._dropThreshold()) {
        this._allowThreshold = false;
        this._smallestDeltaY = 10000;
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
    if (deltaY < this._smallestDeltaY && deltaY != 0) {
      this._smallestDeltaY = deltaY;
    }
    deltaY = Math.max(1, Math.floor(deltaY / this._smallestDeltaY)); // Ensure delta is at least 1
    var magnitude = Math.min(deltaY, this._scrollMagnitude);
    var mask = 1 << button;
    var toks;
    // Simulate press/release for scroll event
    this.buttonMask |= mask;
    toks = [mtype, this.x, this.y, this.buttonMask, magnitude];
    this.send(toks.join(","));
    this.buttonMask &= ~mask;
    toks = [mtype, this.x, this.y, this.buttonMask, magnitude];
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
      this.m = null;
      return;
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
      mouseMultiX: mouseMultiX,
      mouseMultiY: mouseMultiY,
      mouseOffsetX: offsetX,
      mouseOffsetY: offsetY,
      elementClientX: elementRect.left,
      elementClientY: elementRect.top,
      frameW: frameW,
      frameH: frameH,
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
    if (this.ongamepadconnected !== null) {
      this.ongamepadconnected(event.gamepad.id);
    }
    this.send("js,c," + event.gamepad.index + "," + btoa(event.gamepad.id) + "," + this.gamepadManager.numAxes + "," + this.gamepadManager.numButtons);
  }
  _gamepadDisconnect(event) {
    if (this.ongamepaddisconneceted !== null) {
      this.ongamepaddisconneceted();
    }
    this.send("js,d," + event.gamepad.index);
    this.gamepadManager = null; // Clear manager on disconnect
  }
  _gamepadButton(gp_num, btn_num, val) {
    this.send("js,b," + gp_num + "," + btn_num + "," + val);
    window.postMessage({
      type: 'gamepadButtonUpdate',
      gamepadIndex: gp_num,
      buttonIndex: btn_num,
      value: val
    }, window.location.origin);
  }
  _gamepadAxis(gp_num, axis_num, val) {
    this.send("js,a," + gp_num + "," + axis_num + "," + val)
    window.postMessage({
      type: 'gamepadAxisUpdate',
      gamepadIndex: gp_num,
      axisIndex: axis_num,
      value: val
    }, window.location.origin);
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
  getCursorScaleFactor({
    remoteResolutionEnabled = false
  } = {}) {
    if (remoteResolutionEnabled) {
      this.cursorScaleFactor = null;
      return;
    }
    var clientResolution = this.getWindowResolution();
    var serverHeight = this.element.offsetHeight;
    var serverWidth = this.element.offsetWidth;
    if (isNaN(serverWidth) || isNaN(serverHeight) || serverWidth <= 0 || serverHeight <= 0) {
      return;
    }
    if (Math.abs(clientResolution[0] - serverWidth) <= 10 && Math.abs(clientResolution[1] - serverHeight) <= 10) {
      this.cursorScaleFactor = null;
      return;
    } // Reset if close
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
    return [Math.max(1, parseInt(offsetRatioWidth - offsetRatioWidth % 2)), Math.max(1, parseInt(offsetRatioHeight - offsetRatioHeight % 2))];
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
        this.element.requestPointerLock().catch(() => {});
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
      this.element.requestPointerLock().catch(() => {});
    }
  }
  /**
   * Requests keyboard lock (requires fullscreen).
   */
  requestKeyboardLock() {
    if (document.fullscreenElement && 'keyboard' in navigator && 'lock' in navigator.keyboard) {
      // Keys to attempt to lock (browser might ignore some)
      const keys = ["AltLeft", "AltRight", "Tab", "Escape", "MetaLeft", "MetaRight", "ContextMenu"];
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
