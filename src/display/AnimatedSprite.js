/**
 * The base AnimatedSprite class
 *
 * @class AnimatedSprite
 * @extends Sprite
 * @constructor
 * @param animations {Object} An object of the form `{ animationName: [frame1, frame2] }` or you can also specify overrides on a per-animation basis:
 *      `{ animationName: { frames: [frame1, frame2], speed: 2 } }`. Each frame is a Texture object
 * @param [speed] {Number} The speed of the animations (can be overriden on a specific animations)
 * @param [start] {String} The animation to start with, defaults to the first found key otherwise
 */
gf.AnimatedSprite = function(anims, speed, start) {
    //massage animations into full format
    for(var a in anims) {
        if(start === undefined)
            start = a;

        var anim = anims[a];

        if(anim instanceof Array)
            anims[a] = { frames: anim };
    }

    gf.Sprite.call(this, anims[start].frames[0]);

    /**
     * The animation speed for this sprite
     *
     * @property speed
     * @type Number
     * @default 1
     */
    this.speed = speed || 1;

    /**
     * Whether or not to loop the animations. This can be overriden
     * on a per-animation level
     *
     * @property loop
     * @type Boolean
     * @default false
     */
    this.loop = false;

    /**
     * The registerd animations for this AnimatedSprite
     *
     * @property animations
     * @type Object
     * @readOnly
     */
    this.animations = anims;

    /**
     * The currently playing animation
     *
     * @property currentAnimation
     * @type String
     * @readOnly
     */
    this.currentAnimation = start;

    /**
     * The current frame being shown
     *
     * @property currentFrame
     * @type Number
     * @readOnly
     */
    this.currentFrame = 0;

    /**
     * Whether or not the animation is currently playing
     *
     * @property playing
     * @type Boolean
     * @readOnly
     */
    this.playing = false;
};

gf.inherits(gf.AnimatedSprite, gf.Sprite, {
    /**
     * Adds a new animation to this animated sprite
     *
     * @method addAnimation
     * @param name {String} The string name of the animation
     * @param frames {Array<Texture>} The array of texture frames
     * @param [speed] {Number} The animation speed
     * @param [loop] {Boolean} Loop the animation or not
     */
    addAnimation: function(name, frames, speed, loop) {
        if(typeof name === 'object') {
            this.animations[name.name] = name;
        } else {
            this.animations[name] = {
                name: name,
                frames: frames,
                speed: speed,
                loop: loop
            };
        }
    },
    /**
     * Goes to a frame and starts playing the animation from there
     *
     * @method addAnimation
     * @param [name] {String} The string name of the animation to play
     * @param frame {Number} The index of the frame to start on
     */
    gotoAndPlay: function(anim, frame) {
        if(typeof anim === 'number') {
            this.currenFrame = anim;
        } else {
            this.currenFrame = frame || 0;
            this.currentAnimation = anim;
        }

        this.playing = true;
    },
    /**
     * Goes to a frame and stops playing the animation
     *
     * @method addAnimation
     * @param [name] {String} The string name of the animation to go to
     * @param frame {Number} The index of the frame to stop on
     */
    gotoAndStop: function(anim, frame) {
        if(typeof anim === 'number') {
            this.currentFrame = anim;
        } else {
            this.currentFrame = frame || 0;
            this.currentAnimation = anim;
        }

        this.setTexture(this.animations[this.currentAnimation].frames[this.currentFrame]);
        this.playing = false;
    },
    /**
     * Starts playing the currently active animation
     *
     * @method play
     */
    play: function() {
        this.playing = true;
    },
    /**
     * Stops playing the currently active animation
     *
     * @method play
     */
    stop: function() {
        this.playing = false;
    },
    /**
     * Called by PIXI to update our textures and do the actual animation
     *
     * @method updateTransform
     * @private
     */
    updateTransform: function() {
        gf.Sprite.prototype.updateTransform.call(this);

        if(!this.playing) return;

        var anim = this.animations[this.currentAnimation],
            round,
            loop = anim.loop !== undefined ? anim.loop : this.loop;

        this.currentFrame += anim.speed || this.speed;
        round = gf.math.round(this.currentFrame);

        if(round < anim.frames.length) {
            this.setTexture(anim.frames[round]);
        }
        else {
            if(loop) {
                this.gotoAndPlay(0);
            } else {
                this.stop();
                this.emit('complete', this.currentAnimation);
            }
        }
    }
});