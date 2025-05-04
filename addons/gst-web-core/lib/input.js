/*eslint no-unused-vars: ["error", { "vars": "local" }]*/

import { GamepadManager } from './gamepad.js';
import { Queue } from './util.js';

/**
 * Map of known JavaScript keycodes which do not map to typable characters
 * to their X11 keysym equivalents.
 *
 * @private
 * @type {!Object.<number, number[]>}
 */
const keycodeKeysyms = {
    8:   [0xFF08],
    9:   [0xFF09],
    12:  [0xFF0B, 0xFF0B, 0xFF0B, 0xFFB5],
    13:  [0xFF0D],
    16:  [0xFFE1, 0xFFE1, 0xFFE2],
    17:  [0xFFE3, 0xFFE3, 0xFFE4],
    18:  [0xFFE9, 0xFFE9, 0xFFEA],
    19:  [0xFF13],
    20:  [0xFFE5],
    27:  [0xFF1B],
    32:  [0x0020],
    33:  [0xFF55, 0xFF55, 0xFF55, 0xFFB9],
    34:  [0xFF56, 0xFF56, 0xFF56, 0xFFB3],
    35:  [0xFF57, 0xFF57, 0xFF57, 0xFFB1],
    36:  [0xFF50, 0xFF50, 0xFF50, 0xFFB7],
    37:  [0xFF51, 0xFF51, 0xFF51, 0xFFB4],
    38:  [0xFF52, 0xFF52, 0xFF52, 0xFFB8],
    39:  [0xFF53, 0xFF53, 0xFF53, 0xFFB6],
    40:  [0xFF54, 0xFF54, 0xFF54, 0xFFB2],
    45:  [0xFF63, 0xFF63, 0xFF63, 0xFFB0],
    46:  [0xFFFF, 0xFFFF, 0xFFFF, 0xFFAE],
    91:  [0xFFE7],
    92:  [0xFFE8],
    93:  [0xFF67],
    96:  [0xFFB0],
    97:  [0xFFB1],
    98:  [0xFFB2],
    99:  [0xFFB3],
    100: [0xFFB4],
    101: [0xFFB5],
    102: [0xFFB6],
    103: [0xFFB7],
    104: [0xFFB8],
    105: [0xFFB9],
    106: [0xFFAA],
    107: [0xFFAB],
    109: [0xFFAD],
    110: [0xFFAE],
    111: [0xFFAF],
    112: [0xFFBE],
    113: [0xFFBF],
    114: [0xFFC0],
    115: [0xFFC1],
    116: [0xFFC2],
    117: [0xFFC3],
    118: [0xFFC4],
    119: [0xFFC5],
    120: [0xFFC6],
    121: [0xFFC7],
    122: [0xFFC8],
    123: [0xFFC9],
    144: [0xFF7F],
    145: [0xFF14],
    225: [0xFE03]
};

/**
 * Map of known JavaScript keyidentifiers which do not map to typable
 * characters to their unshifted X11 keysym equivalents.
 *
 * @private
 * @type {!Object.<string, number[]>}
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
    "Convert": [0xFF21],
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
    "NumLock": [0xFF7F],
    "PageDown": [0xFF56],
    "PageUp": [0xFF55],
    "Pause": [0xFF13],
    "Play": [0xFD16],
    "PreviousCandidate": [0xFF3E],
    "PrintScreen": [0xFF61],
    "Redo": [0xFF66],
    "Right": [0xFF53],
    "RomanCharacters": null,
    "Scroll": [0xFF14],
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
 * Returns the keyboard location of the key associated with the given
 * keyboard event. The location differentiates key events which otherwise
 * have the same keycode, such as left shift vs. right shift.
 *
 * @private
 * @param {!KeyboardEvent} e
 *     A JavaScript keyboard event, as received through the DOM via a
 *     "keydown", "keyup", or "keypress" handler.
 *
 * @returns {!number}
 *     The location of the key event on the keyboard, as defined at:
 *     http://www.w3.org/TR/DOM-Level-3-Events/#events-KeyboardEvent
 */
const getEventLocation = function getEventLocation(e) {

    // Use standard location, if possible
    if ('location' in e)
        return e.location;

    // Failing that, attempt to use deprecated keyLocation
    if ('keyLocation' in e)
        return e.keyLocation;

    // If no location is available, assume left side
    return 0;
};

/**
 * Given an array of keysyms indexed by location, returns the keysym
 * for the given location, or the keysym for the standard location if
 * undefined.
 *
 * @private
 * @param {number[]} keysyms
 *     An array of keysyms, where the index of the keysym in the array is
 *     the location value.
 *
 * @param {!number} location
 *     The location on the keyboard corresponding to the key pressed, as
 *     defined at: http://www.w3.org/TR/DOM-Level-3-Events/#events-KeyboardEvent
 */
const get_keysym = function get_keysym(keysyms, location) {

    if (!keysyms)
        return null;

    return keysyms[location] || keysyms[0];
};

/**
 * Returns true if the given keysym corresponds to a printable character,
 * false otherwise.
 *
 * @param {!number} keysym
 *     The keysym to check.
 *
 * @returns {!boolean}
 *     true if the given keysym corresponds to a printable character,
 *     false otherwise.
 */
const isPrintable = function isPrintable(keysym) {

    // Keysyms with Unicode equivalents are printable
    return (keysym >= 0x00 && keysym <= 0xFF)
        || (keysym & 0xFFFF0000) === 0x01000000;

};

function keysym_from_key_identifier(identifier, location, shifted) {

    if (!identifier)
        return null;

    var typedCharacter;

    // If identifier is U+xxxx, decode Unicode character
    var unicodePrefixLocation = identifier.indexOf("U+");
    if (unicodePrefixLocation >= 0) {
        var hex = identifier.substring(unicodePrefixLocation+2);
        typedCharacter = String.fromCharCode(parseInt(hex, 16));
    }

    // If single character and not keypad, use that as typed character
    else if (identifier.length === 1 && location !== 3)
        typedCharacter = identifier;

    // Otherwise, look up corresponding keysym
    else
        return get_keysym(keyidentifier_keysym[identifier], location);

    // Alter case if necessary
    if (shifted === true)
        typedCharacter = typedCharacter.toUpperCase();
    else if (shifted === false)
        typedCharacter = typedCharacter.toLowerCase();

    // Get codepoint
    var codepoint = typedCharacter.charCodeAt(0);
    return keysym_from_charcode(codepoint);

}

function isControlCharacter(codepoint) {
    return codepoint <= 0x1F || (codepoint >= 0x7F && codepoint <= 0x9F);
}

function keysym_from_charcode(codepoint) {

    // Keysyms for control characters
    if (isControlCharacter(codepoint)) return 0xFF00 | codepoint;

    // Keysyms for ASCII chars
    if (codepoint >= 0x0000 && codepoint <= 0x00FF)
        return codepoint;

    // Keysyms for Unicode
    if (codepoint >= 0x0100 && codepoint <= 0x10FFFF)
        return 0x01000000 | codepoint;

    return null;

}

function keysym_from_keycode(keyCode, location) {
    return get_keysym(keycodeKeysyms[keyCode], location);
}


export class Input {
    /**
     * Input handling for WebRTC web application
     *
     * @constructor
     * @param {Element} [element]
     *    Video element to attach events to
     * @param {function} [send]
     *    Function used to send input events to server.
     */
    constructor(element, send) {
        /**
         * @type {Element}
         */
        this.element = element;

        /**
         * @type {function}
         */
        this.send = send;

        /**
         * @type {boolean}
         */
        this.mouseRelative = false;

        /**
         * @type {Object}
         */
        this.m = null;

        /**
         * @type {Integer}
         */
        this.buttonMask = 0;

        /**
         * @type {GamepadManager}
         */
        this.gamepadManager = null;

        /**
         * @type {Integer}
         */
        this.x = 0;

        /**
         * @type {Integer}
         */
        this.y = 0;

        /**
         * @type {function}
         */
        this.onmenuhotkey = null;

        /**
         * @type {function}
         */
        this.onfullscreenhotkey = this.enterFullscreen;

        /**
         * @type {function}
         */
        this.ongamepadconnected = null;

        /**
         * @type {function}
         */
        this.ongamepaddisconneceted = null;

        /**
         * List of attached listeners, record keeping used to detach all.
         * @type {Array}
         */
        this.listeners = [];
        this.listeners_context = [];

        /**
         * @type {Object}
         */
        this._queue = new Queue(); // This queue is related to mouse wheel threshold, not resize directly, so keep it.

        // mouse and trackpad variables to adjust the scrolling based on pointer device
        this._allowTrackpadScrolling = true;
        this._allowThreshold = true;
        this._smallestDeltaY = 10000;
        this._wheelThreshold = 100;
        this._scrollMagnitude = 10;

        // variable used to scale cursor speed
        this.cursorScaleFactor = null;

        /**
         * @type {boolean}
         * Indicates if a composition is in progress.
         */
        this.isComposing = false;

        /**
         * @type {string}
         * Stores the current composition string.
         */
        this.compositionString = "";
    }


    /**
     * Gets the keysym from a keyboard event.
     * @private
     * @param {KeyboardEvent} event
     * @returns {number} keysym
     */
    _getKeysymFromEvent(event) {
        return  keysym_from_key_identifier(event.key, getEventLocation(event))
             || keysym_from_keycode(event.keyCode, getEventLocation(event));
    }


    /**
     * Calculates cursor scale factor when client and server have different resolutions
     * @param {Object}
     */
    getCursorScaleFactor({ remoteResolutionEnabled = false } = {}) {
        // If user enabled remote resize then reset the values
        if (remoteResolutionEnabled) {
            this.cursorScaleFactor = null;
            return;
        }

        var clientResolution = this.getWindowResolution();
        var serverHeight = this.element.offsetHeight;
        var serverWidth = this.element.offsetWidth;

        if (isNaN(serverWidth) || isNaN(serverHeight)) {
            return;
        }

        // If width and height are in the same range then scale factor is not required
        if (Math.abs(clientResolution[0] - serverWidth) <= 10  && Math.abs(clientResolution[1] - serverHeight) <= 10) {
            return;
        }

        this.cursorScaleFactor = Math.sqrt((serverWidth ** 2) + (serverHeight ** 2)) / Math.sqrt((clientResolution[0] ** 2) + (clientResolution[1] ** 2));
    }

    /**
     * Handles mouse button and motion events and sends them to WebRTC app.
     * @param {MouseEvent} event
     */
    _mouseButtonMovement(event) {
        const down = (event.type === 'mousedown' ? 1 : 0);
        var mtype = "m"; // Default message type for absolute coordinates
        let canvas = document.getElementById('videoCanvas');
        // --- Pointer Lock Handling (largely unchanged) ---
        if (event.type === 'mousemove' && !this.m && !document.pointerLockElement) {
             // If not locked and no initial math calculated yet, ignore move events
             // This prevents sending coordinates before _windowMath runs at least once.
             // In manual mode, we rely on canvas existing, so this check might be less critical,
             // but keeping it doesn't hurt.
            return;
        }

        // Hotkey to enable pointer lock (unchanged)
        if (down && event.button === 0 && event.ctrlKey && event.shiftKey) {
            event.target.requestPointerLock().catch(console.error);
            return; // Don't process the click itself as movement
        }

        // --- Coordinate Calculation ---
        if (document.pointerLockElement) {
            mtype = "m2"; // Message type for relative coordinates

            // --- Relative Movement Calculation ---
            if (window.isManualResolutionMode && canvas) {
                // MANUAL MODE + POINTER LOCK: Scale relative movement based on canvas visual vs internal size
                const canvasRect = canvas.getBoundingClientRect();
                // Check if canvas has valid dimensions to avoid division by zero
                if (canvasRect.width > 0 && canvasRect.height > 0 && canvas.width > 0 && canvas.height > 0) {
                    const scaleX = canvas.width / canvasRect.width;
                    const scaleY = canvas.height / canvasRect.height;
                    // Apply scaling to the movement delta
                    this.x = Math.round(event.movementX * scaleX);
                    this.y = Math.round(event.movementY * scaleY);
                } else {
                    // Fallback if canvas has no size
                    this.x = event.movementX;
                    this.y = event.movementY;
                    console.warn("Manual Pointer Lock: Canvas has zero dimensions, using unscaled movement.");
                }
            } else {
                // AUTO-RESIZE MODE + POINTER LOCK
                if (this.cursorScaleFactor != null) {
                    this.x = Math.trunc(event.movementX * this.cursorScaleFactor);
                    this.y = Math.trunc(event.movementY * this.cursorScaleFactor);
                } else {
                    this.x = event.movementX;
                    this.y = event.movementY;
                }
            }
        } else if (event.type === 'mousemove') {
            // --- Absolute Position Calculation ---
            if (window.isManualResolutionMode && canvas) {
                // MANUAL MODE + ABSOLUTE: Calculate based on canvas position and size
                const canvasRect = canvas.getBoundingClientRect();
                 // Check if canvas has valid dimensions
                if (canvasRect.width > 0 && canvasRect.height > 0 && canvas.width > 0 && canvas.height > 0) {
                    const mouseX_on_canvas = event.clientX - canvasRect.left;
                    const mouseY_on_canvas = event.clientY - canvasRect.top;

                    const scaleX = canvas.width / canvasRect.width;
                    const scaleY = canvas.height / canvasRect.height;

                    let serverX = mouseX_on_canvas * scaleX;
                    let serverY = mouseY_on_canvas * scaleY;

                    // Clamp to canvas internal bounds and round
                    this.x = Math.max(0, Math.min(canvas.width, Math.round(serverX)));
                    this.y = Math.max(0, Math.min(canvas.height, Math.round(serverY)));

                } else {
                    // Fallback if canvas has no size (treat as 0,0)
                    this.x = 0;
                    this.y = 0;
                     console.warn("Manual Abs Move: Canvas has zero dimensions, sending (0,0).");
                }
            } else {
                // AUTO-RESIZE MODE + ABSOLUTE: Use original logic based on this.m calculated by _windowMath
                if (this.m) { // Ensure _windowMath has run
                    this.x = this._clientToServerX(event.clientX);
                    this.y = this._clientToServerY(event.clientY);
                } else {
                    // Should not happen if initial check passed, but as a fallback:
                    this.x = 0;
                    this.y = 0;
                    console.warn("Auto Abs Move: this.m not initialized, sending (0,0).");
                }
            }
        }

        // --- Button Mask Update ---
        if (event.type === 'mousedown' || event.type === 'mouseup') {
            var mask = 1 << event.button;
            if (down) {
                this.buttonMask |= mask;
            } else {
                this.buttonMask &= ~mask;
            }
        }

        // --- Send Message (unchanged structure) ---
        // Note: The 5th element (wheel delta) is 0 for non-wheel events.
        var toks = [
            mtype,
            this.x,
            this.y,
            this.buttonMask,
            0 // Wheel delta is 0 here
        ];

        this.send(toks.join(","));

        event.preventDefault();
    }

    /**
     * Handles touch events and sends them to WebRTC app.
     * @param {TouchEvent} event
     */
    _touch(event) {
        var mtype = "m"; // Touch events are always absolute position
        var mask = 1; // Simulate left mouse button for touch

        if (event.type === 'touchstart') {
            this.buttonMask |= mask;
        } else if (event.type === 'touchend') {
            this.buttonMask &= ~mask;
        } else if (event.type === 'touchmove') {
            event.preventDefault(); // Prevent scrolling page on touch drag
        }

        // Get coordinates from the first changed touch point
        const touchPoint = event.changedTouches[0];

        // --- Coordinate Calculation ---
        if (window.isManualResolutionMode && canvas) {
            // MANUAL MODE: Calculate based on canvas position and size
            const canvasRect = canvas.getBoundingClientRect();
             // Check if canvas has valid dimensions
            if (canvasRect.width > 0 && canvasRect.height > 0 && canvas.width > 0 && canvas.height > 0) {
                const touchX_on_canvas = touchPoint.clientX - canvasRect.left;
                const touchY_on_canvas = touchPoint.clientY - canvasRect.top;

                const scaleX = canvas.width / canvasRect.width;
                const scaleY = canvas.height / canvasRect.height;

                let serverX = touchX_on_canvas * scaleX;
                let serverY = touchY_on_canvas * scaleY;

                // Clamp to canvas internal bounds and round
                this.x = Math.max(0, Math.min(canvas.width, Math.round(serverX)));
                this.y = Math.max(0, Math.min(canvas.height, Math.round(serverY)));
            } else {
                // Fallback
                this.x = 0;
                this.y = 0;
                console.warn("Manual Touch: Canvas has zero dimensions, sending (0,0).");
            }
        } else {
            // AUTO-RESIZE MODE
            if (this.m) { // Ensure _windowMath has run
                this.x = this._clientToServerX(touchPoint.clientX);
                this.y = this._clientToServerY(touchPoint.clientY);
            } else {
                 // Fallback
                this.x = 0;
                this.y = 0;
                console.warn("Auto Touch: this.m not initialized, sending (0,0).");
            }
        }

        // --- Send Message (structure) ---
        var toks = [
            mtype,
            this.x,
            this.y,
            this.buttonMask,
            0 // Wheel delta is 0 here
        ];

        this.send(toks.join(","));
    }

    /**
     * Drops the threshold if pointer input values are of type mouse pointer
     */
    _dropThreshold() {
        var count = 0;

        var val1 = this._queue.dequeue();
        while (!this._queue.isEmpty()) {
            var valNext = this._queue.dequeue();

            // mouse input values would typically be constant and higher in magnitude, generally
            // in the range of 80 to 130
            if (valNext >= 80 && val1 == valNext) {
                count ++;
            }

            val1 = valNext;
        }

        // if we encounter such values for at least three in a row then we assume
        // the user shifted to mouse pointer device
        return count >= 2 ? true: false;
    }


    /**
     * A wrapper for _mouseWheel to adjusts the scrolling according to pointer device in use
     * @param {MouseWheelEvent} event
     */
    _mouseWheelWrapper(event) {
        var deltaY = Math.trunc(Math.abs(event.deltaY));

        if (this._queue.size() < 4) {
            this._queue.enqueue(deltaY);
        }

        if (this._queue.size() == 4) {

            if (this._dropThreshold()) {
                // user shifted to mouse pointer so reset the values
                this._allowThreshold = false;
                this._smallestDeltaY = 10000;
            } else {
                // setting this variable to true ensures the shift from mouse pointer back to trackpad
                this._allowThreshold = true;
            }
        }

        if (this._allowThreshold && this._allowTrackpadScrolling) {
            this._allowTrackpadScrolling = false;
            this._mouseWheel(event);

            // when threshold is allowed the scroll events being sent to server is limited
            setTimeout(() => this._allowTrackpadScrolling = true, this._wheelThreshold);
        } else if (!this._allowThreshold) {
            this._mouseWheel(event);
        }

    }

    /**
     * Handles mouse wheel events and sends them to WebRTC app.
     * @param {MouseWheelEvent} event
     */
    _mouseWheel(event) {
        var mtype = (document.pointerLockElement ? "m2" : "m");
        var button = 3;
        if (event.deltaY < 0) {
            button = 4;
        }

        var deltaY = Math.abs(Math.trunc(event.deltaY));

        // keep track of smallestDelta as a scale factor
        if (deltaY < this._smallestDeltaY && deltaY != 0) {
            this._smallestDeltaY = deltaY;
        }

        // normalise the delta values by the scale factor
        deltaY = Math.floor(deltaY / this._smallestDeltaY);

        var magnitude = Math.min(deltaY, this._scrollMagnitude);

        var mask = 1 << button;
        var toks;
        // Simulate button press and release.
        for (var i = 0; i < 2; i++) {
            if (i === 0)
                this.buttonMask |= mask;
            else
                this.buttonMask &= ~mask;
            toks = [
                mtype,
                this.x,
                this.y,
                this.buttonMask,
                magnitude
            ];
            this.send(toks.join(","));
        }

        //event.preventDefault();
    }

    /**
     * Captures mouse context menu (right-click) event and prevents event propagation.
     * @param {MouseEvent} event
     */
    _contextMenu(event) {
        event.preventDefault();
    }


    /**
     * Handles keydown events and sends keysym to WebRTC app.
     * @param {KeyboardEvent} event
     */
    _keydown(event) {
        if (!this.isComposing) { // Only send keyboard events if not composing
            const keysym = this._getKeysymFromEvent(event);
            if (keysym != null) {
                 this.send("kd," + keysym);
            }
        }
    }

    /**
     * Handles keyup events and sends keysym to WebRTC app.
     * @param {KeyboardEvent} event
     */
    _keyup(event) {
        if (!this.isComposing) { // Only send keyboard events if not composing
            const keysym = this._getKeysymFromEvent(event);
            if (keysym != null) {
                this.send("ku," + keysym);
            }
        }
    }


    /**
     * Captures keyboard events to detect pressing of CTRL-SHIFT hotkeys.
     * @param {KeyboardEvent} event
     */
    _key(event) {
        // disable problematic browser shortcuts
        if (event.code === 'F5' && event.ctrlKey ||
            event.code === 'KeyI' && event.ctrlKey && event.shiftKey ||
            event.code === 'F11' ||
            event.code === 'KeyD' && event.ctrlKey ||
            event.code === 'Tab') {
            event.preventDefault();
            return;
        }

        // capture menu hotkey
        if (event.type === 'keydown' && event.code === 'KeyM' && event.ctrlKey && event.shiftKey) {
            if (document.fullscreenElement === null && this.onmenuhotkey !== null) {
                this.onmenuhotkey();
                event.preventDefault();
            }

            return;
        }

        // capture fullscreen hotkey
        if (event.type === 'keydown' && event.code === 'KeyF' && event.ctrlKey && event.shiftKey) {
            if (document.fullscreenElement === null && this.onfullscreenhotkey !== null) {
                this.onfullscreenhotkey();
                event.preventDefault();
            }
            return;
        }
    }

    /**
     * Handles compositionstart events.
     * @param {CompositionEvent} event
     */
    _compositionStart(event) {
        this.isComposing = true;
        this.compositionString = "";
        this.send("co,start");
    }

    /**
     * Handles compositionupdate events.
     * @param {CompositionEvent} event
     */
    _compositionUpdate(event) {
        if (event.data) {
            this.compositionString = event.data;
        }
        this.send("co,update," + this.compositionString);
    }

    /**
     * Handles compositionend events.
     * @param {CompositionEvent} event
     */
    _compositionEnd(event) {
        this.isComposing = false;
        if (event.data) {
            this.compositionString = event.data;
        }
        this.send("co,end," + this.compositionString);
        this.compositionString = "";
    }


    /**
     * Sends WebRTC app command to toggle display of the remote mouse pointer.
     */
    _pointerLock() {
        if (document.pointerLockElement !== null) {
            this.send("p,1");
        } else {
            this.send("p,0");
        }
    }

    /**
     * Sends WebRTC app command to hide the remote pointer when exiting pointer lock.
     */
    _exitPointerLock() {
        document.exitPointerLock();
        // hide the pointer.
        this.send("p,0");
    }

    /**
     * Captures display and video dimensions required for computing mouse pointer position.
     * This should be fired whenever the window size changes.
     */
    _windowMath() {
        // Use the overlayInput element (this.element) for calculations, as it defines the interactive area boundary.
        const elementRect = this.element.getBoundingClientRect();
        const windowW = elementRect.width; // Use element's actual rendered width
        const windowH = elementRect.height; // Use element's actual rendered height

        // Determine the "frame" size.
        const frameW = this.element.offsetWidth;
        const frameH = this.element.offsetHeight;

        // Prevent division by zero if element hasn't rendered fully
        if (windowW <= 0 || windowH <= 0 || frameW <= 0 || frameH <= 0) {
            console.warn("_windowMath: Element dimensions are zero or invalid, skipping calculation.");
            this.m = null; // Ensure m is null if calculation fails
            return;
        }

        // Calculate scaling factor to fit the frame within the window/element bounds
        const multiX = windowW / frameW;
        const multiY = windowH / frameH;
        const multi = Math.min(multiX, multiY); // Fit factor (aspect ratio handling)

        const vpWidth = frameW * multi;  // Visual viewport width within the element
        const vpHeight = frameH * multi; // Visual viewport height within the element

        // Calculate offsets to center the visual viewport within the element
        const offsetX = (windowW - vpWidth) / 2.0;
        const offsetY = (windowH - vpHeight) / 2.0;

        // Calculate multipliers to convert element-relative coords to frame-relative coords
        // Prevent division by zero if visual viewport size is zero
        const mouseMultiX = (vpWidth > 0) ? frameW / vpWidth : 1;
        const mouseMultiY = (vpHeight > 0) ? frameH / vpHeight : 1;

        this.m = {
            mouseMultiX: mouseMultiX,
            mouseMultiY: mouseMultiY,
            mouseOffsetX: offsetX,
            mouseOffsetY: offsetY,
            // Store element's position relative to viewport for coordinate translation
            elementClientX: elementRect.left,
            elementClientY: elementRect.top,
            frameW: frameW,
            frameH: frameH,
        };
    }
    /**
     * Translates pointer position X based on current window math.
     * @param {Integer} clientX
     */
    _clientToServerX(clientX) {
        // This logic assumes this.m is calculated correctly for AUTO-RESIZE mode.
        if (!this.m) return 0; // Guard against uninitialized this.m

        // Calculate mouse position relative to the element's top-left corner
        const elementRelativeX = clientX - this.m.elementClientX;

        // Calculate position relative to the *centered visual viewport* within the element
        const viewportRelativeX = elementRelativeX - this.m.mouseOffsetX;

        // Scale to frame coordinates
        let serverX = viewportRelativeX * this.m.mouseMultiX;

        // Clamp to frame bounds
        serverX = Math.max(0, Math.min(this.m.frameW, Math.round(serverX)));

        return serverX;
    }
    /**
     * Translates pointer position Y based on current window math.
     * @param {Integer} clientY
     */
    _clientToServerY(clientY) {
        // This logic assumes this.m is calculated correctly for AUTO-RESIZE mode.
        if (!this.m) return 0; // Guard against uninitialized this.m

        // Calculate mouse position relative to the element's top-left corner
        const elementRelativeY = clientY - this.m.elementClientY;

         // Calculate position relative to the *centered visual viewport* within the element
        const viewportRelativeY = elementRelativeY - this.m.mouseOffsetY;

        // Scale to frame coordinates
        let serverY = viewportRelativeY * this.m.mouseMultiY;

        // Clamp to frame bounds
        serverY = Math.max(0, Math.min(this.m.frameH, Math.round(serverY)));

        return serverY;
    }
    /**
     * Sends command to WebRTC app to connect virtual joystick and initializes the local GamepadManger.
     * @param {GamepadEvent} event
     */
    _gamepadConnected(event) {
        this.gamepadManager = new GamepadManager(event.gamepad, this._gamepadButton.bind(this), this._gamepadAxis.bind(this));

        if (this.ongamepadconnected !== null) {
            this.ongamepadconnected(event.gamepad.id);
        }

        // Send joystick connect message over data channel.
        this.send("js,c," + event.gamepad.index + "," + btoa(event.gamepad.id) + "," + this.gamepadManager.numAxes + "," + this.gamepadManager.numButtons);
    }

    /**
     * Sends joystick disconnect command to WebRTC app.
     */
    _gamepadDisconnect(event) {
        if (this.ongamepaddisconneceted !== null) {
            this.ongamepaddisconneceted();
        }

        this.send("js,d," + event.gamepad.index);
    }

    /**
     * Send gamepad button to WebRTC app.
     *
     * @param {number} gp_num  - the gamepad number
     * @param {number} btn_num - the uinput converted button number
     * @param {number} val - the button value, 1 or 0 for pressed or not-pressed.
     */
    _gamepadButton(gp_num, btn_num, val) {
        this.send("js,b," + gp_num + "," + btn_num + "," + val);
        window.postMessage({
            type: 'gamepadButtonUpdate',
            gamepadIndex: gp_num,
            buttonIndex: btn_num,
            value: val
        }, window.location.origin);
    }

    /**
     * Send the gamepad axis to the WebRTC app.
     *
     * @param {number} gp_num - the gamepad number
     * @param {number} axis_num - the uinput converted axis number
     * @param {number} val - the normalize value between [0, 255]
     */
    _gamepadAxis(gp_num, axis_num, val) {
        this.send("js,a," + gp_num + "," + axis_num + "," + val)
        window.postMessage({
            type: 'gamepadAxisUpdate',
            gamepadIndex: gp_num,
            axisIndex: axis_num,
            value: val
        }, window.location.origin);
    }

    /**
     * When fullscreen is entered, request keyboard and pointer lock.
     */
    _onFullscreenChange() {
        if (document.fullscreenElement !== null) {
            if (document.pointerLockElement === null) {
                this.element.requestPointerLock().then(
                ).catch(
                );
            }
            this.requestKeyboardLock();
        }
        // Reset local keyboard. When holding to exit full-screen the escape key can get stuck.

        // Reset stuck keys on server side.
        this.send("kr");
    }

    /**
     * Attaches input event handles to document, window and element.
     */
    attach() {
        this.listeners.push(addListener(this.element, 'resize', this._windowMath, this));
        this.listeners.push(addListener(document, 'pointerlockchange', this._pointerLock, this));
        this.listeners.push(addListener(this.element.parentElement, 'fullscreenchange', this._onFullscreenChange, this));
        this.listeners.push(addListener(window, 'resize', this._windowMath, this));

        // Gamepad support
        this.listeners.push(addListener(window, 'gamepadconnected', this._gamepadConnected, this));
        this.listeners.push(addListener(window, 'gamepaddisconnected', this._gamepadDisconnect, this));

        // Adjust for scroll offset
        this.listeners.push(addListener(window, 'scroll', () => {
            this.m.scrollX = window.scrollX;
            this.m.scrollY = window.scrollY;
        }, this));

        this.attach_context();
    }

    attach_context() {
        this.listeners_context.push(addListener(this.element, 'wheel', this._mouseWheelWrapper, this));
        this.listeners_context.push(addListener(this.element, 'contextmenu', this._contextMenu, this));
        this.listeners_context.push(addListener(window, 'keydown', this._key, this));
        this.listeners_context.push(addListener(window, 'keyup', this._key, this));

        // Composition events
        this.listeners_context.push(addListener(this.element, 'compositionstart', this._compositionStart, this));
        this.listeners_context.push(addListener(this.element, 'compositionupdate', this._compositionUpdate, this));
        this.listeners_context.push(addListener(this.element, 'compositionend', this._compositionEnd, this));


        if ('ontouchstart' in window) {
            this.listeners_context.push(addListener(window, 'touchstart', this._touch, this));
            this.listeners_context.push(addListener(this.element, 'touchend', this._touch, this));
            this.listeners_context.push(addListener(this.element, 'touchmove', this._touch, this));

            this.send("p,1");
        } else {
            this.listeners_context.push(addListener(this.element, 'mousemove', this._mouseButtonMovement, this));
            this.listeners_context.push(addListener(this.element, 'mousedown', this._mouseButtonMovement, this));
            this.listeners_context.push(addListener(this.element, 'mouseup', this._mouseButtonMovement, this));
        }

        // Using guacamole keyboard because it has the keysym translations.
        this.listeners_context.push(addListener(window, 'keydown', this._keydown, this));
        this.listeners_context.push(addListener(window, 'keyup', this._keyup, this));


        if (document.fullscreenElement !== null && document.pointerLockElement === null) {
            this.element.requestPointerLock().then(
            ).catch(
            );
        }

        this._windowMath();
    }

    detach() {
        removeListeners(this.listeners);

        this.detach_context();
    }

    detach_context() {
        removeListeners(this.listeners_context);

        this.send("kr");
        this._exitPointerLock();
    }

    enterFullscreen() {
        if (document.pointerLockElement === null) {
            this.element.requestPointerLock().then(
            ).catch(
            );
        }
        if (document.fullscreenElement === null) {
            this.element.parentElement.requestFullscreen().then(
            ).catch(
            );
        }
    }

    /**
     * Request keyboard lock, must be in fullscreen mode to work.
     */
    requestKeyboardLock() {
        if ('keyboard' in navigator && 'lock' in navigator.keyboard) {
            // event codes: https://www.w3.org/TR/uievents-code/#key-alphanumeric-writing-system
            const keys = [
                "AltLeft",
                "AltRight",
                "Tab",
                "Escape",
                "ContextMenu",
                "MetaLeft",
                "MetaRight"
            ];
            navigator.keyboard.lock(keys).then(
            ).catch(
            )
        }
    }

    getWindowResolution() {
        return [
            parseInt( (() => {var offsetRatioWidth = document.body.offsetWidth * window.devicePixelRatio; return offsetRatioWidth - offsetRatioWidth % 2})() ),
            parseInt( (() => {var offsetRatioHeight = document.body.offsetHeight * window.devicePixelRatio; return offsetRatioHeight - offsetRatioHeight % 2})() )
        ];
    }
}

/**
 * Helper function to keep track of attached event listeners.
 * @param {Object} obj
 * @param {string} name
 * @param {function} func
 * @param {Object} ctx
 */
function addListener(obj, name, func, ctx) {
    const newFunc = ctx ? func.bind(ctx) : func;
    if (name === "mouseup" || name === "mousedown" || name === "mousemove" || name === "contextmenu" || name === "keydown" || name === "keyup") {
        obj.addEventListener(name, newFunc);
    } else {
        obj.addEventListener(name, newFunc, { passive: true});
    }

    return [obj, name, newFunc];
}

/**
 * Helper function to remove all attached event listeners.
 * @param {Array} listeners
 */
function removeListeners(listeners) {
    for (const listener of listeners)
        listener[0].removeEventListener(listener[1], listener[2]);
}
