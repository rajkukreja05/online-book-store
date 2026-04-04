/**
 * Simple FAQ accordion
 */
(function () {
    function init() {
        document.querySelectorAll('.faq-card').forEach(function (card) {
            var btn = card.querySelector('.faq-q');
            var ans = card.querySelector('.faq-a');
            if (!btn || !ans) return;

            btn.addEventListener('click', function () {
                var open = card.classList.toggle('is-open');
                btn.setAttribute('aria-expanded', open ? 'true' : 'false');
                ans.hidden = !open;
            });
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();

