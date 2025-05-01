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

// Based on https://github.com/parsec-cloud/web-client/blob/master/src/gamepad.js

/*eslint no-unused-vars: ["error", { "vars": "local" }]*/
export const GP_TIMEOUT = 16;
const MAX_GAMEPADS = 4;

export class GamepadManager {
    constructor(gamepad, onButton, onAxis) {
        this.gamepad = gamepad; 
        this.numButtons = 0;
        this.numAxes = 0;
        this.onButton = onButton;
        this.onAxis = onAxis;
        this.state = {};
        this._active = true;
        this.interval = setInterval(() => {
            this._poll();
        }, GP_TIMEOUT);
    }

    enable() {
        if (!this._active) {
             this._active = true;
             console.log("GamepadManager polling activated.");
        }
    }

    disable() {
         if (this._active) {
            this._active = false;
            console.log("GamepadManager polling deactivated.");
         }
    }

    _poll() {
        if (!this._active) {
            return; // Do nothing if disabled
        }
        const gamepads = navigator.getGamepads();
        for (let i = 0; i < MAX_GAMEPADS; i++) {
            const currentGp = gamepads[i];
            if (currentGp) {
                let gpState = this.state[i];

                if (!gpState) {
                    gpState = this.state[i] = { axes: new Array(currentGp.axes.length).fill(0), buttons: new Array(currentGp.buttons.length).fill(0) };
                }

                if (gpState.buttons.length !== currentGp.buttons.length) {
                    gpState.buttons = new Array(currentGp.buttons.length).fill(0);
                }
                if (gpState.axes.length !== currentGp.axes.length) {
                     gpState.axes = new Array(currentGp.axes.length).fill(0);
                }


                for (let x = 0; x < currentGp.buttons.length; x++) {
                    if (currentGp.buttons[x] === undefined) continue;
                    const value = currentGp.buttons[x].value;
                    const pressed = currentGp.buttons[x].pressed;

                    // Check against previous state
                    if (gpState.buttons[x] !== value) {
                        this.onButton(i, x, value, pressed);
                        gpState.buttons[x] = value; 
                    }
                }

                for (let x = 0; x < currentGp.axes.length; x++) {
                    if (currentGp.axes[x] === undefined) continue;

                    let val = currentGp.axes[x];
                    // Apply deadzone
                    if (Math.abs(val) < 0.05) val = 0;

                    // Check against previous state
                    if (gpState.axes[x] !== val) {
                        this.onAxis(i, x, val);
                        gpState.axes[x] = val;
                    }
                }

            } else if (this.state[i]) {
                delete this.state[i];
            }
        }
    }

    destroy() {
        clearInterval(this.interval);
        this.state = {}; // Clear state on final destruction
        console.log("GamepadManager destroyed.");
    }
}
