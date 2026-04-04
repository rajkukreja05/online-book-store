/**
 * Home page — flash sale countdown, welcome coupon copy
 */
(function () {
    var COUPON = 'BH-WELCOME10';

    function showMiniToast(message) {
        var toast = document.getElementById('toast');
        var msg = document.getElementById('toast-message');
        if (toast && msg) {
            msg.textContent = message;
            toast.classList.add('show');
            setTimeout(function () {
                toast.classList.remove('show');
            }, 2500);
            return;
        }
        if (typeof showToast === 'function') showToast(message);
        else alert(message);
    }

    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        }
        return new Promise(function (resolve, reject) {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            try {
                document.execCommand('copy');
                resolve();
            } catch (e) {
                reject(e);
            }
            document.body.removeChild(ta);
        });
    }

    function pad2(n) {
        return String(n).padStart(2, '0');
    }

    function getFlashEnd() {
        var end = new Date();
        end.setHours(23, 59, 59, 999);
        return end.getTime();
    }

    function tickFlashCountdown() {
        var hEl = document.getElementById('fc-h');
        var mEl = document.getElementById('fc-m');
        var sEl = document.getElementById('fc-s');
        if (!hEl || !mEl || !sEl) return;

        var end = getFlashEnd();
        function tick() {
            var now = Date.now();
            var ms = Math.max(0, end - now);
            var sec = Math.floor(ms / 1000);
            var h = Math.floor(sec / 3600);
            var m = Math.floor((sec % 3600) / 60);
            var s = sec % 60;
            hEl.textContent = pad2(h);
            mEl.textContent = pad2(m);
            sEl.textContent = pad2(s);
        }
        tick();
        setInterval(tick, 1000);
    }

    function initCouponCopy() {
        var btn = document.getElementById('btn-copy-welcome-coupon');
        if (!btn) return;
        btn.addEventListener('click', function () {
            copyText(COUPON)
                .then(function () {
                    showMiniToast('Code ' + COUPON + ' copied!');
                })
                .catch(function () {
                    showMiniToast('Select and copy the code manually.');
                });
        });
    }

    function init() {
        tickFlashCountdown();
        initCouponCopy();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
