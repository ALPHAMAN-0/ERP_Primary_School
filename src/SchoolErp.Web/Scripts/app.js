/*
 * Application-level behaviour shared across screens.
 *
 * Deliberately small. The heavy interactive screen is mark entry, and its logic
 * lives in that view because it is specific to the §7 grading rules; anything
 * general enough to be reused lives here.
 */
(function () {
    'use strict';

    // Filter bars submit on change so a teacher switching class does not also
    // have to find a Go button.
    document.querySelectorAll('.filter-bar select[data-autosubmit]').forEach(function (select) {
        select.addEventListener('change', function () {
            if (select.form) select.form.submit();
        });
    });

    // Guard the destructive actions — switching a module off changes what every
    // other user can see.
    document.querySelectorAll('[data-confirm]').forEach(function (el) {
        el.addEventListener('click', function (event) {
            if (!window.confirm(el.getAttribute('data-confirm'))) event.preventDefault();
        });
    });

    // Print buttons, so a report card or receipt is one click from paper.
    document.querySelectorAll('[data-print]').forEach(function (el) {
        el.addEventListener('click', function () { window.print(); });
    });
})();
