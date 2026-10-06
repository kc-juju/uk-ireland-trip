/* Qatar dining guide bootstrap: content is supplied by the data layer. */
(function bootstrapQatarDiningGuide() {
    const mount = document.getElementById('guide-app');
    if (!mount || !window.QatarDiningData || !window.TripComponents) {
        throw new Error('Qatar dining guide data or components are unavailable.');
    }
    mount.innerHTML = window.TripComponents.renderDiningGuide(window.QatarDiningData);
}());
