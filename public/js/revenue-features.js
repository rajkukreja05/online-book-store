/**
 * BookHaven — advertisement placeholders, referral links, offer modal
 */
(function () {
    var SESSION_POPUP_KEY = 'bh_offer_popup_v1';
    var STICKY_DISMISS_KEY = 'bh_sticky_cta_dismissed';
    var TICKER_ROTATE_MS = 6000;
    var REFERRAL_PREFIX = 'BH-REF-';

    var OFFER_VARIANTS = [
        {
            tag: 'Referral & welcome offer',
            title: '15% off first order + ₹100 for you',
            desc: 'Invite friends with your link. They save on their first purchase — you earn wallet credit after they pay.'
        },
        {
            tag: 'Limited partner slot',
            title: 'Double wallet day — extra ₹50',
            desc: 'Stack referral rewards with seasonal partner campaigns. Share your link before the window closes.'
        },
        {
            tag: 'Bundle & read more',
            title: 'Free bookmark on 2+ books',
            desc: 'Sponsored bundles help fund new inventory. Combine with referral savings at checkout when eligible.'
        }
    ];

    var TICKER_MESSAGES = [
        { icon: 'fa-percent', text: 'Flash hours: extra 8% off carts over ₹799 — ends at midnight tonight.' },
        { icon: 'fa-ticket-alt', text: 'New here? Use BH-WELCOME10 for 10% off your first order at checkout.' },
        { icon: 'fa-gift', text: 'Referrals: friends save 15% on first order; you earn ₹100 wallet credit.' },
        { icon: 'fa-bullhorn', text: 'Ad slots & affiliate placements keep catalog prices competitive.' },
        { icon: 'fa-envelope-open-text', text: 'Subscribe to email deals — partner offers and member-only drops.' },
        { icon: 'fa-credit-card', text: 'Bank partners: check home page for BH-BANK10 and UPI cashback hints.' }
    ];

    function getUser() {
        try {
            return JSON.parse(localStorage.getItem('user') || 'null');
        } catch (e) {
            return null;
        }
    }

    function shortCodeFromUser(user) {
        if (!user) return '';
        var raw = (user._id && String(user._id)) || user.email || 'guest';
        var s = '';
        for (var i = 0; i < raw.length; i++) {
            s += raw.charCodeAt(i).toString(16);
        }
        return (s.slice(-4) + s.slice(0, 4)).replace(/[^a-f0-9]/gi, '').slice(0, 4).toUpperCase() || 'BOOK';
    }

    function getReferralCode() {
        var user = getUser();
        if (!user) return REFERRAL_PREFIX + 'LOGIN';
        return REFERRAL_PREFIX + shortCodeFromUser(user);
    }

    function getReferralShareUrl() {
        var href = window.location.href;
        var lastSlash = href.lastIndexOf('/');
        var base = lastSlash >= 0 ? href.slice(0, lastSlash + 1) : href + '/';
        var code = getReferralCode();
        return base + 'signup.html?ref=' + encodeURIComponent(code);
    }

    function fillReferralInputs() {
        var code = getReferralCode();
        var url = getReferralShareUrl();
        document.querySelectorAll('[data-referral-code]').forEach(function (el) {
            el.textContent = code;
        });
        var inputs = document.querySelectorAll('input[data-referral-link]');
        inputs.forEach(function (inp) {
            inp.value = url;
            inp.setAttribute('readonly', 'readonly');
        });
    }

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
        if (typeof showToast === 'function') {
            showToast(message);
        } else {
            alert(message);
        }
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

    function bindCopyButtons() {
        document.querySelectorAll('[data-copy-referral]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var url = getReferralShareUrl();
                copyText(url)
                    .then(function () {
                        showMiniToast('Referral link copied! Share it to unlock discounts.');
                    })
                    .catch(function () {
                        showMiniToast('Could not copy — select and copy the link manually.');
                    });
            });
        });
        document.querySelectorAll('[data-copy-referral-code]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var code = getReferralCode();
                copyText(code)
                    .then(function () {
                        showMiniToast('Referral code copied: ' + code);
                    })
                    .catch(function () {
                        showMiniToast('Could not copy the code.');
                    });
            });
        });
    }

    function applyOfferVariant() {
        var tagEl = document.getElementById('offer-modal-tag');
        var titleEl = document.getElementById('offer-modal-title');
        var descEl = document.getElementById('offer-modal-desc');
        if (!titleEl || !descEl) return;
        var idx = Math.floor(Math.random() * OFFER_VARIANTS.length);
        var v = OFFER_VARIANTS[idx];
        if (tagEl) tagEl.textContent = v.tag;
        titleEl.textContent = v.title;
        descEl.textContent = v.desc;
    }

    function initTicker() {
        var el = document.getElementById('revenue-ticker-text');
        if (!el) return;
        var i = Math.floor(Math.random() * TICKER_MESSAGES.length);
        function tick() {
            var m = TICKER_MESSAGES[i % TICKER_MESSAGES.length];
            var icon = m.icon || 'fa-star';
            el.innerHTML =
                '<i class="fas ' + icon + '"></i> <span>' + m.text + '</span>';
            i += 1;
        }
        tick();
        setInterval(tick, TICKER_ROTATE_MS);
    }

    function initStickyCta() {
        var bar = document.getElementById('revenue-sticky-cta');
        if (!bar) return;
        if (sessionStorage.getItem(STICKY_DISMISS_KEY) === '1') {
            bar.classList.remove('is-visible');
            document.body.classList.remove('revenue-sticky-on');
            return;
        }
        setTimeout(function () {
            bar.classList.add('is-visible');
            document.body.classList.add('revenue-sticky-on');
        }, 4500);
        var dismiss = document.getElementById('revenue-sticky-dismiss');
        if (dismiss) {
            dismiss.addEventListener('click', function () {
                bar.classList.remove('is-visible');
                document.body.classList.remove('revenue-sticky-on');
                sessionStorage.setItem(STICKY_DISMISS_KEY, '1');
            });
        }
        var copy = document.getElementById('revenue-sticky-copy');
        if (copy) {
            copy.addEventListener('click', function () {
                copyText(getReferralShareUrl())
                    .then(function () {
                        showMiniToast('Link copied — share it!');
                    })
                    .catch(function () {});
            });
        }
    }

    function initNewsletter() {
        var btn = document.getElementById('newsletter-submit');
        var input = document.getElementById('newsletter-email');
        if (!btn || !input) return;
        btn.addEventListener('click', function () {
            var v = (input.value || '').trim();
            if (!v || v.indexOf('@') < 0) {
                showMiniToast('Enter a valid email to subscribe.');
                return;
            }
            try {
                localStorage.setItem('bh_newsletter_email', v);
            } catch (e) {}
            showMiniToast('Thanks! You will receive deals & partner offers.');
            input.value = '';
        });
    }

    function openOfferModal() {
        var overlay = document.getElementById('offer-modal-overlay');
        if (!overlay) return;
        overlay.classList.add('is-open');
        overlay.setAttribute('aria-hidden', 'false');
    }

    function closeOfferModal() {
        var overlay = document.getElementById('offer-modal-overlay');
        if (!overlay) return;
        overlay.classList.remove('is-open');
        overlay.setAttribute('aria-hidden', 'true');
    }

    function initOfferModal() {
        if (document.body && document.body.getAttribute('data-no-offer-popup') === 'true') {
            return;
        }
        var overlay = document.getElementById('offer-modal-overlay');
        if (!overlay) return;

        if (sessionStorage.getItem(SESSION_POPUP_KEY) === '1') {
            overlay.classList.remove('is-open');
            return;
        }

        setTimeout(function () {
            openOfferModal();
            sessionStorage.setItem(SESSION_POPUP_KEY, '1');
        }, 600);

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) closeOfferModal();
        });
        var closeBtn = document.getElementById('offer-modal-close');
        if (closeBtn) closeBtn.addEventListener('click', closeOfferModal);
        var dismissBtn = document.getElementById('offer-modal-dismiss');
        if (dismissBtn) dismissBtn.addEventListener('click', closeOfferModal);
        var shopBtn = document.getElementById('offer-modal-shop');
        if (shopBtn) {
            shopBtn.addEventListener('click', function () {
                closeOfferModal();
                window.location.href = 'catalog.html';
            });
        }
    }

    function init() {
        fillReferralInputs();
        bindCopyButtons();
        applyOfferVariant();
        initOfferModal();
        initTicker();
        initStickyCta();
        initNewsletter();
    }

    window.BookHavenRevenue = {
        getReferralCode: getReferralCode,
        getReferralShareUrl: getReferralShareUrl,
        refreshReferralUI: fillReferralInputs
    };

    document.addEventListener('DOMContentLoaded', init);
})();
