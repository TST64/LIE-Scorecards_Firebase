// =========================================================================
// BMAssistent / LIE Scorecard - Players & Authentication
// App_Logic_Spieler.js
// BSD (Allman) Style
// =========================================================================

var app = app || {};
app.logic = app.logic || {};

app.logic.submitPin = function(event)
{
    if (event)
    {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        if (typeof event.stopPropagation === 'function') event.stopPropagation();
    }

    const btn = document.getElementById('loginSubmitBtn') || (event && event.target);
    if (btn && btn.disabled) return false;

    const spielerId = document.getElementById('loginSpielerSelect')?.value;
    const pin = document.getElementById('loginPinInput')?.value;

    if (!spielerId || !pin || pin.trim() === "")
    {
        if (typeof app.logic.showToast === 'function') app.logic.showToast("Bitte Namen auswählen und PIN eintippen!", "info");
        return false;
    }

    const ausgewaehlterSpieler = (app.state && app.state.spieler) 
        ? app.state.spieler.find(function(s) { return String(s.id).trim() === String(spielerId).trim(); }) 
        : null;

    if (!ausgewaehlterSpieler)
    {
        if (typeof app.logic.showToast === 'function') app.logic.showToast("Spieler nicht im Speicher gefunden!", "error");
        return false;
    }

    app.state = app.state || {};
    app.state.currentUser = ausgewaehlterSpieler;
    localStorage.setItem('lie_scorecard_user_id', ausgewaehlterSpieler.id);

    if (app.logic.updateHeaderRoleIcon)
    {
        app.logic.updateHeaderRoleIcon();
    }

    if (app.router && typeof app.router.navigate === 'function')
    {
        app.router.navigate('dashboard');
    }

    return false;
};

app.logic.logout = function()
{
    app.logic.showConfirm(
        "Abmelden?", 
        "Möchtest du dich wirklich aus der LIE Scorecard abmelden?", 
        "standard", 
        function() 
        {
            if (app.state)
            {
                app.state.currentUser = null;
            }
            localStorage.removeItem('lie_scorecard_user_id');
            if (app.logic.updateHeaderRoleIcon)
            {
                app.logic.updateHeaderRoleIcon();
            }
            app.router.navigate('login');
            app.logic.showToast("Erfolgreich abgemeldet.", "success");
        }
    );
};