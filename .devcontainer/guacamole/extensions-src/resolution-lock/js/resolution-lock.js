/**
 * Resolution Lock extension for Apache Guacamole.
 *
 * Adds a "Resolution Lock" section to the Ctrl+Alt+Shift menu:
 *  - Lock ON  (default 1688x950): fixed RDP resolution, no auto-resize
 *  - Turn off lock:               dynamic resize via Display Update channel
 *  - Scale with browser:          fit the remote display to the browser window
 *  - Turn on lock + custom input: type any WxH and lock to it
 *
 * State persists in localStorage across reconnects.
 */
(function () {
'use strict';

var STORE_KEY = 'guac-resolution-lock';
var DEFAULT_W = 1688;
var DEFAULT_H = 950;

function loadState() {
    try {
        var s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
        return {
            locked: s.locked !== false,          // default: lock ON
            width:  s.width  || DEFAULT_W,
            height: s.height || DEFAULT_H,
            mode:   s.mode   || 'lock'           // 'lock' | 'off' | 'scale'
        };
    } catch (e) {
        return { locked: true, width: DEFAULT_W, height: DEFAULT_H, mode: 'lock' };
    }
}

function saveState(s) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {}
}

/* Find the running Guacamole client via Angular's injector. */
function getClient() {
    try {
        var el = document.querySelector('[ng-app], [data-ng-app]');
        if (!el) el = document.body;
        var injector = window.angular && angular.element(el).injector();
        if (!injector) return null;
        // The connected client is exposed by the client manager / $rootScope
        var root = injector.get('$rootScope');
        if (root && root.client) return root.client;
        // Fallback: walk scopes looking for a GuacClient
        var found = null;
        (function walk(scope) {
            if (!scope || found) return;
            for (var k in scope) {
                var v = scope[k];
                if (v && v.getDisplay && v.disconnect) { found = v; return; }
            }
            var child = scope.$$childHead;
            while (child && !found) { walk(child); child = child.$$nextSibling; }
        })(root);
        return found;
    } catch (e) { return null; }
}

function applyResolution(state) {
    var client = getClient();
    if (!client) return false;
    try {
        var display = client.getDisplay();
        if (!display) return false;

        if (state.mode === 'off') {
            /* Dynamic: let the server follow the browser via Display Update.
               Guacamole RDP handles this when resize-method=display-update;
               here we just fit the local canvas. */
            display.scale(1);
            display.resize(Math.floor(window.innerWidth), Math.floor(window.innerHeight));
        } else if (state.mode === 'scale') {
            /* Scale-with-browser: fit remote display into the window. */
            var dw = display.getWidth(), dh = display.getHeight();
            var scale = Math.min(window.innerWidth / dw, window.innerHeight / dh, 1);
            display.scale(scale);
        } else {
            /* Locked: force the exact resolution. */
            display.scale(1);
            display.resize(state.width, state.height);
            if (client.sendSize) client.sendSize(state.width, state.height);
        }
        return true;
    } catch (e) { return false; }
}

/* Build the menu section DOM. */
function buildPanel(state, onChange) {
    var div = document.createElement('div');
    div.className = 'resolution-lock-panel';
    div.style.cssText = 'padding:8px 12px;border-top:1px solid #444;';

    div.innerHTML =
        '<div style="font-weight:bold;margin-bottom:6px;">Resolution Lock</div>' +
        '<label style="display:block;margin:4px 0;">' +
        '  <input type="radio" name="rl-mode" value="lock"' + (state.mode === 'lock' ? ' checked' : '') + '> Lock on (fixed size)' +
        '</label>' +
        '<div style="margin:4px 0 4px 18px;">' +
        '  <input type="number" id="rl-w" min="320" max="7680" value="' + state.width + '" style="width:70px;"> x ' +
        '  <input type="number" id="rl-h" min="200" max="4320" value="' + state.height + '" style="width:70px;">' +
        '</div>' +
        '<label style="display:block;margin:4px 0;">' +
        '  <input type="radio" name="rl-mode" value="off"' + (state.mode === 'off' ? ' checked' : '') + '> Turn off lock' +
        '</label>' +
        '<label style="display:block;margin:4px 0;">' +
        '  <input type="radio" name="rl-mode" value="scale"' + (state.mode === 'scale' ? ' checked' : '') + '> Scale with browser' +
        '</label>' +
        '<button id="rl-apply" style="margin-top:6px;padding:4px 12px;">Apply</button>' +
        '<div id="rl-status" style="margin-top:4px;font-size:11px;opacity:0.8;"></div>';

    div.querySelector('#rl-apply').addEventListener('click', function () {
        var mode = div.querySelector('input[name="rl-mode"]:checked').value;
        var w = parseInt(div.querySelector('#rl-w').value, 10) || DEFAULT_W;
        var h = parseInt(div.querySelector('#rl-h').value, 10) || DEFAULT_H;
        var next = { locked: mode === 'lock', width: w, height: h, mode: mode };
        saveState(next);
        var ok = applyResolution(next);
        div.querySelector('#rl-status').textContent = ok
            ? ('Applied: ' + (mode === 'lock' ? w + 'x' + h + ' locked' : mode === 'off' ? 'lock off' : 'scaling with browser'))
            : 'Client not ready yet — open a connection first, then Apply again.';
        onChange(next);
    });

    return div;
}

/* Watch for the Guacamole menu and inject our panel once. */
function inject() {
    var state = loadState();
    var injected = false;

    function tryInject() {
        if (injected) return;
        // The Ctrl+Alt+Shift menu: Guacamole renders .menu / guac-menu
        var menu = document.querySelector('.guac-menu .menu-body, .menu-body, [ng-controller="GuacMenuController"]');
        if (!menu || menu.querySelector('.resolution-lock-panel')) return;
        menu.appendChild(buildPanel(state, function (s) { state = s; }));
        injected = true;
    }

    new MutationObserver(tryInject).observe(document.documentElement, {
        childList: true, subtree: true
    });
    tryInject();

    // Apply the saved lock as soon as a client connects.
    var applied = false;
    setInterval(function () {
        if (!applied && getClient()) {
            if (applyResolution(state)) applied = true;
        }
    }, 1500);
}

if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', inject);
else
    inject();

})();
