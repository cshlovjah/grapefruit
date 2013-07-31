/**
 * input object
 */
gf.input = {};

/**
 * The base Input object, holds common functions and properties between input types
 *
 * @class Input
 * @extends Object
 * @uses gf.EventEmitter
 * @namespace gf.input
 * @constructor
 * @param view {DOMElement} The DOMElement to bind input events to
 */
gf.input.Input = function(view) {
    gf.EventEmitter.call(this);

    /**
     * For backwards compatibility
     *
     * @method bind
     * @deprecated use on
     */
    this.bind = this.on;

    /**
     * The dom element to bind events to
     *
     * @property view
     * @type Game
     */
    this.view = view;
};

gf.inherits(gf.input.Input, Object, {
    /**
     * Prevents the default action of an event
     *
     * @method preventDefault
     * @param event {DOMEvent} The event to prevent default actions for
     */
    preventDefault: function(e) {
        if(e.preventDefault) e.preventDefault();
        else e.returnValue = false;

        return false;
    },
    /**
     * Prevents an event from bubbling up the DOM.
     *
     * @method stopPropogation
     * @param event {DOMEvent} The event to prevent bubbling for
     */
    stopPropogation: function(e) {
        if(e.stopPropagation) e.stopPropagation();
        else e.cancelBubble = true;
    }
});
