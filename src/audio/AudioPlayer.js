/**
 * Grapefruit Audio API, provides an easy interface to use HTML5 Audio
 * The GF Audio API was based on
 * <a target="_blank" href="https://github.com/goldfire/howler.js">Howler.js</a>
 *
 * @class AudoPlayer
 * @extends Object
 * @uses gf.EventEmitter
 * @namespace gf
 * @constructor
 * @param manager {AudioManager} AudioManager instance for this audio player
 * @param settings {Object} All the settings for this player instance
 */
gf.AudioPlayer = function(manager, settings) {
    /**
     * The source of the audio, the actual URL to load up
     *
     * @property src
     * @type String
     */
    this.src = '';

    /**
     * Play the audio immediately after loading
     *
     * @property autoplay
     * @type Boolean
     * @default false
     */
    this.autoplay = false;

    /**
     * Buffer forces use of HTML5Audio which will buffer and play
     * instead of loading the entire file and then playing
     *
     * @property buffer
     * @type Boolean
     * @default false
     */
    this.buffer = false;

    /**
     * Override the format determined from the extension with this extension
     *
     * @property format
     * @type String
     * @default null
     */
    this.format = null;

    /**
     * Replay the audio immediately after finishing
     *
     * @property loop
     * @type Boolean
     * @default false
     */
    this.loop = false;

    /**
     * A 3D position where the audio should sound like it is coming from
     *
     * @property pos3d
     * @type Array<Number>
     * @default [0, 0, -0.5]
     */
    this.pos3d = [0, 0, -0.5];

    /**
     * A sound sprite that maps string keys to [start, duration] arrays. These can
     * be used to put multiple sound bits in one file, and play them separately
     *
     * @property sprite
     * @type Object
     * @default {}
     */
    this.sprite = {};

    /**
     * The volume of the audio player
     *
     * @property volume
     * @type Number
     * @default 1
     */
    Object.defineProperty(this, 'volume', {
        get: this.getVolume.bind(this),
        set: this.setVolume.bind(this)
    });

    this._volume = 1;
    this._duration = 0;
    this._loaded = false;
    this._manager = manager;
    this._canPlay = manager.canPlay;
    this._codecs = manager.codecs;
    this._webAudio = gf.support.webAudio && !this.buffer;
    this._nodes = [];
    this._onendTimer = [];

    //mixin user's settings
    gf.utils.setValues(this, settings);

    if(this._webAudio) {
        this._setupAudioNode();
    }

    this.load();
};

gf.inherits(gf.AudioPlayer, Object, {
    /**
     * Load the audio file for this player, this is called from the ctor
     * there is no reason to call it manually.
     *
     * @method load
     * @return {AudioPlayer}
     * @private
     */
    load: function() {
        //if using web audio, load up the buffer
        if(this._webAudio) {
            this.loadBuffer(this.src);
        }
        //otherwise create some Audio nodes
        else {
            //create a new adio node
            var node = new Audio();
            this._nodes.push(node);

            //setup the audio node
            node.src = this.src;
            node._pos = 0;
            node.preload = 'auto';
            node.volume = this._manager.muted ? 0 : this._volume * this._manager.volume;

            //setup the event listener to start playing the sound when it has buffered
            var self = this, evt = function() {
                self._duration = node.duration;

                //setup a default sprite
                self.sprite._default = [0, node.duration * 1000];

                //check if loaded
                if(!self._loaded) {
                    self._loaded = true;
                    self.emit('load', {
                        message: 'Audio file loaded.',
                        data: self.src
                    });
                }

                //if autoplay then start it
                if(self.autoplay) {
                    self.play();
                }

                //clear the event listener
                node.removeEventListener('canplaythrough', evt, false);
            };
            node.addEventListener('canplaythrough', evt, false);
            node.load();
        }

        return this;
    },
    /**
     * Play a sound from the current time (0 by default).
     *
     * @method play
     * @param [sprite] {String} Plays from the specified position in the sound sprite definition.
     * @param [callback] {Function} Returns the unique playback id for this sound instance.
     * @return {AudioPlayer}
     */
    play: function(sprite, cb) {
        var self = this;

        if(typeof sprite === 'function') {
            cb = sprite;
            sprite = null;
        }

        //if no sprite specified, use default
        if(!sprite) {
            sprite = '_default';
        }

        //if we haven't loaded yet, wait until we do
        if(!this._loaded) {
            this.on('load', function() {
                self.play(sprite, cb);
            });

            return this;
        }

        //if the sprite doesn't exist, play nothing
        if(!this.sprite[sprite]) {
            if(typeof cb === 'function') cb();
            return this;
        }

        //get an audio node to use to play
        this._inactiveNode(function(node) {
            var pos = node._pos > 0 ? node._pos : self.sprite[sprite][0] / 1000,
            duration = (self.sprite[sprite][1] / 1000) - node._pos,
            loop = (self.loop || self.sprite[sprite][2]),
            soundId = (typeof cb === 'string') ? cb : (Math.round(Date.now() * Math.random()) + ''),
            timerId;

            node._sprite = sprite;

            //after the audio finishes:
            (function(o) {
                timerId = setTimeout(function() {
                    //if looping restsart it
                    if(!self._webAudio && o.loop) {
                        self.stop(o.id, o.timer).play(o.sprite, o.id);
                    }

                    // set web audio node to paused
                    if(self._webAudio && !o.loop) {
                        self._nodeById(o.id).paused = true;
                    }

                    //end the track if it is HTML audio and a sprite
                    if(!self._webAudio && !o.loop) {
                        self.stop(o.id, o.timer);
                    }

                    //fire off the end event
                    self.emit('end', {
                        message: 'Audio has finished playing',
                        data: o.id
                    });
                }, duration * 1000);

                //store the timer
                self._onendTimer.push(timerId);

                //remember which timer to kill
                o.timer = timerId;
            })({
                id: soundId,
                sprite: sprite,
                loop: loop
            });

            //setup webAudio functions
            if(self._webAudio) {
                //set the play id to this node and load into context
                node.id = soundId;
                node.paused = false;
                self.refreshBuffer([loop, pos, duration], soundId);
                self._playStart = self._manager.ctx.currentTime;
                node.gain.value = self._volume;

                if(typeof node.bufferSource.start === 'undefined') {
                    node.bufferSource.noteGrainOn(0, pos, duration);
                } else {
                    node.bufferSource.start(0, pos, duration);
                }
            } else {
                if(node.readyState === 4) {
                    node.id = soundId;
                    node.currentTime = pos;
                    node.muted = self._manager.muted;
                    node.volume = self._volume * self._manager.volume;
                    node.play();
                } else {
                    self._clearEndTimer(timerId);

                    (function() {
                        var sound = self,
                            playSpr = sprite,
                            fn = cb,
                            newNode = node;

                        var evt = function() {
                            sound.play(playSpr, fn);

                            //clear listener
                            newNode.removeEventListener('canplaythrough', evt, false);
                        };
                        newNode.addEventListener('canplaythrough', evt, false);
                    })();

                    return self;
                }
            }

            self.emit('play', {
                message: 'Playing audio file',
                data: soundId
            });

            if(typeof cb === 'function')
                cb(soundId);
        });

        return this;
    },
    /**
     * Pause playback and save the current position.
     *
     * @method pause
     * @param [id] {String} The play instance ID.
     * @param [timerId] {String} Clear the correct timeout ID.
     * @return {AudioPlayer}
     */
    pause: function(id, timerId) {
        var self = this;

        //if we haven't loaded this sound yet, wait until we play it to pause it
        if(!this._loaded) {
            this.on('play', function() {
                self.play(id);
            });

            return this;
        }

        //clear the onend timer
        this._clearEndTimer(timerId || 0);

        var activeNode = id ? this._nodeById(id) : this._activeNode();
        if(activeNode) {
            if(this._webAudio) {
                //ensure the sound was created
                if(!activeNode.bufferSource)
                    return this;

                activeNode.paused = true;
                activeNode._pos += this._manager.ctx.currentTime - this._playStart;

                if(typeof activeNode.bufferSource.stop === 'undefined') {
                    activeNode.bufferSource.noteOff(0);
                } else {
                    activeNode.bufferSource.stop(0);
                }
            } else {
                activeNode._pos = activeNode.currentTime;
                activeNode.pause();
            }
        }

        this.emit('pause', {
            message: 'Audio file paused',
            data: id
        });

        return this;
    },
    /**
     * Stop playback and reset to start.
     *
     * @method stop
     * @param [id] {String} The play instance ID.
     * @param [timerId] {String} Clear the correct timeout ID.
     * @return {AudioPlayer}
     */
    stop: function(id, timerId) {
        var self = this;

        //if we haven't loaded this sound yet, wait until we play it to stop it
        if(!this._loaded) {
            this.on('play', function() {
                self.stop(id);
            });

            return this;
        }

        //clear onend timer
        this._clearEndTimer(timerId || 0);

        var activeNode = id ? this._nodeById(id) : this._activeNode();
        if(activeNode) {
            activeNode._pos = 0;

            if(this._webAudio) {
                if(!activeNode.bufferSource)
                    return this;

                activeNode.paused = true;

                if(typeof activeNode.bufferSource.stop === 'undefined') {
                    activeNode.bufferSource.noteOff(0);
                } else {
                    activeNode.bufferSource.stop(0);
                }
            } else {
                activeNode.pause();
                activeNode.currentTime = 0;
            }
        }

        return this;
    },
    /**
     * Mute this sound.
     *
     * @method mute
     * @param [id] {String} The play instance ID.
     * @return {AudioPlayer}
     */
    mute: function(id) {
        return this.setMuted(true, id);
    },
    /**
     * Unmute this sound.
     *
     * @method unmute
     * @param [id] {String} The play instance ID.
     * @return {AudioPlayer}
     */
    unmute: function(id) {
        return this.setMuted(false, id);
    },
    /**
     * Set the muted state of this sound.
     *
     * @method setMuted
     * @param muted {Boolean}
     * @param [id] {String} The play instance ID.
     * @return {AudioPlayer}
     */
    setMuted: function(muted, id) {
        var self  = this;

        //if we haven't loaded this sound yet, wait until we play it to mute it
        if(!this._loaded) {
            this.on('play', function() {
                self.setMuted(muted, id);
            });

            return this;
        }

        var activeNode = id ? this._nodeById(id) : this._activeNode();
        if(activeNode) {
            if(this._webAudio) {
                activeNode.gain.value = muted ? 0 : this._volume;
            } else {
                activeNode.volume =  muted ? 0 : this._volume;
            }
        }

        return this;
    },
    /**
     * Set the position of playback.
     *
     * @method seek
     * @param pos {Number} The position to move current playback to.
     * @param [id] {String} The play instance ID.
     * @return {AudioPlayer}
     */
    seek: function(pos, id) {
        var self = this;

        //if we haven't loaded this sound yet, wait until it is to seek it
        if(!this._loaded) {
            this.on('load', function() {
                self.seek(pos);
            });

            return this;
        }

        //if position is < 0, or invalid, then set to 0
        if(!pos || pos < 0)
            pos = 0;

        var activeNode = id ? this._nodeById(id) : this._activeNode();
        if(activeNode) {
            if(this._webAudio) {
                activeNode._pos = pos;
                this.pause(activeNode.id).play(activeNode._sprite, id);
            } else {
                activeNode.currentTime = pos;
            }
        }

        return this;
    },
    /**
     * Get the position of playback.
     *
     * @method getPosition
     * @param [id] {String} The play instance ID.
     * @return {Number}
     */
    getPosition: function(id) {
        var self = this;

        //if we haven't loaded this sound yet, wait until it is to seek it
        if(!this._loaded) {
            this.on('load', function() {
                self.getPosition(id);
            });

            return this;
        }

        var activeNode = id ? this._nodeById(id) : this._activeNode();
        if(activeNode) {
            if(this._webAudio) {
                return activeNode._pos + (this._manager.ctx.currentTime - this._playStart);
            } else {
                return activeNode.currentTime;
            }
        }

        return 0;
    },
    /**
     * Fade a currently playing sound between two volumes.
     *
     * @method fade
     * @param from {Number} The volume to fade from (0.0 to 1.0).
     * @param to {Number} The volume to fade to (0.0 to 1.0).
     * @param len {Number} Time in milliseconds to fade.
     * @param [id] {String} The play instance ID.
     * @param [callback] {Function} Fired when the fade is complete.
     * @return {AudioPlayer}
     */
    fade: function(from, to, len, id, cb) {
        var self = this,
            diff = Math.abs(from - to),
            dir = from > to ? 'dowm' : 'up',
            steps = diff / 0.01,
            stepTime = len / steps;

        if(typeof id === 'function') {
            cb = id;
            id = null;
        }

        //if we haven't loaded this sound yet, wait until it is to seek it
        if(!this._loaded) {
            this.on('load', function() {
                self.fade(from, to, len, id, cb);
            });

            return this;
        }

        this.setVolume(from, id);

        for(var i = 1; i <= steps; ++i) {
            var change = this._volume + ((dir === 'up' ? 0.01 : -0.01) * i),
                vol = Math.round(1000 * change) / 1000,
                wait = stepTime * i;

            this._doFadeStep(vol, wait, to, id, cb);
        }
    },
    /**
     * Returns the current volume of the player
     *
     * @method getVolume
     * @return {Number} The current volume
     */
    getVolume: function() {
        return this._volume;
    },
    /**
     * Sets the current volume of the player
     *
     * @method setVolume
     * @param vol {Number} The current volume
     * @param [id] {String} The play instance ID.
     * @return {AudioPlayer}
     */
    setVolume: function(vol, id) {
        var self = this;

        // make sure volume is a number
        vol = parseFloat(vol);

        //if we haven't loaded this sound yet, wait until we play it to change the volume
        if(!this._loaded) {
            this.on('play', function() {
                self.setVolume(vol, id);
            });

            return this;
        }

        //set the volume
        if(vol >= 0 && vol <= 1) {
            this._volume = vol;

            var activeNode = id ? this._nodeById(id) : this._activeNode();
            if(activeNode) {
                if(this._webAudio) {
                    activeNode.gain.volume = vol;
                } else {
                    activeNode.volume = vol * this._manager.volume;
                }
            }
        }

        return this;
    },
    /**
     * Set the 3D position of the audio source.
     * The most common usage is to set the 'x' position
     * to affect the left/right ear panning. Setting any value higher than
     * 1.0 will begin to decrease the volume of the sound as it moves further away.
     * NOTE: This only works with Web Audio API, HTML5 Audio playback
     * will not be affected.
     *
     * @method setPosition
     * @param x {Number} The x-position of the playback from -1000.0 to 1000.0
     * @param y {Number} The y-position of the playback from -1000.0 to 1000.0
     * @param z {Number} The z-position of the playback from -1000.0 to 1000.0
     * @param [id] {String} The play instance ID.
     * @return {AudioPlayer}
     */
    setPosition: function(x, y, z, id) {
        var self = this;

        //set a default for the optional 'y' and 'z'
        x = !x ? 0 : x;
        y = !y ? 0 : y;
        z = (!z && z !== 0) ? -0.5 : z;

        //if we haven't loaded this sound yet, wait until we play it to change the position
        if(!this._loaded) {
            this.on('play', function() {
                self.setPosition(x, y, z, id);
            });

            return this;
        }

        if(this._webAudio) {
            var activeNode = id ? this._nodeById(id) : this._activeNode();
            if(activeNode) {
                this.pos3d[0] = x;
                this.pos3d[1] = y;
                this.pos3d[2] = z;
                activeNode.panner.setPosition(x, y, z);
            }
        }

        return this;
    },
    /**
     * Performs a step in the fade transition
     *
     * @method _doFadeStep
     * @private
     */
    _doFadeStep: function(vol, wait, end, id, cb) {
        var self = this;

        setTimeout(function() {
            self.setVolume(vol, id);

            if(vol === end) {
                if(typeof cb === 'function')
                    cb();
            }
        }, wait);
    },
    /**
     * Get an audio node by ID.
     *
     * @method _nodeById
     * @return {AudioPlayer} Audio node.
     * @private
     */
    _nodeById: function(id) {
        var node = this._nodes[0]; //default return value

        //find the node with this ID
        for(var i = 0, il = this._nodes.length; i < il; ++i) {
            if(this._nodes[i].id === id) {
                node = this._nodes[i];
                break;
            }
        }

        return node;
    },
    /**
     * Get the first active audio node.
     *
     * @method _activeNode
     * @return {AudioPlayer} Audio node.
     * @private
     */
    _activeNode: function() {
        var node;

        //find the first playing node
        for(var i = 0, il = this._nodes.length; i < il; ++i) {
            if(!this._nodes[i].paused) {
                node = this._nodes[i];
                break;
            }
        }

        //remove excess inactive nodes
        this._drainPool();

        return node;
    },
    /**
     * Get the first inactive audio node.
     * If there is none, create a new one and add it to the pool.
     *
     * @method _inactiveNode
     * @param cb {Function} callback Function to call when the audio node is ready.
     * @private
     */
    _inactiveNode: function(cb) {
        var node;

        //find first inactive node to recycle
        for(var i = 0, il = this._nodes.length; i < il; ++i) {
            if(this._nodes[i].paused && this._nodes[i].readyState === 4) {
                cb(node = this._nodes[i]);
                break;
            }
        }

        //remove excess inactive nodes
        this._drainPool();

        if(node) return;

        //create new node if there are no inactives
        if(this._webAudio) {
            node = this._setupAudioNode();
            cb(node);
        } else {
            this.load();
            node = this._nodes[this.nodes.length - 1];
            node.addEventListener('loadedmetadata', function() {
                cb(node);
            });
        }
    },
    /**
     * If there are more than 5 inactive audio nodes in the pool, clear out the rest.
     *
     * @method _drainPool
     * @private
     */
    _drainPool: function() {
        var inactive = 0,
            i = 0, il = 0;

        //count inactive nodes
        for(i = 0, il = this._nodes.length; i < il; ++i) {
            if(this._nodes[i].paused) {
                inactive++;
            }
        }

        //remove excess inactive nodes
        for(i = this._nodes.length; i >= 0; --i) {
            if(inactive <= 5)
                break;

            if(this._nodes[i].paused) {
                inactive--;
                this._nodes.splice(i, 1);
            }
        }
    },
    /**
     * Clear 'onend' timeout before it ends.
     *
     * @method _clearEndTimer
     * @param timerId {Number} timerId The ID of the sound to be cancelled.
     * @private
     */
    _clearEndTimer: function(timerId) {
        var timer = this._onendTimer.indexOf(timerId);

        //make sure the timer is cleared
        timer = timer >= 0 ? timer : 0;

        if(this._onendTimer[timer]) {
            clearTimeout(this._onendTimer[timer]);
            this._onendTimer.splice(timer, 1);
        }
    },
    /**
     * Setup the gain node and panner for a Web Audio instance.
     *
     * @method _setupAudioNode
     * @return {Object} The new audio node.
     * @private
     */
    _setupAudioNode: function() {
        var node = this._nodes,
            i = this._nodes.length;

        //create gain node
        node.push((typeof this._manager.ctx.createGain === 'undefined') ? this._manager.ctx.createGainNode : this._manager.ctx.createGain());
        node[i].gain.value = this._volume;
        node[i].paused = true;
        node[i]._pos = 0;
        node[i].readyState = 4;
        node[i].connect(this._manager.masterGain);

        //create the panner
        node[i].panner = this._manager.ctx.createPanner();
        node[i].panner.setPosition(this.pos3d[0], this.pos3d[1], this.pos3d[2]);
        node[i].panner.connect(node[i]);

        return node[i];
    }
});
gf.EventEmitter.call(gf.AudioPlayer.prototype);

//define some prototype functions that are only available when using the WebAudio API
if(gf.support.webAudio) {
    /**
     * Buffer a sound from URL (or from cache) and decode to audio source (Web Audio API).
     *
     * @method loadBuffer
     * @param url {String} The path to the sound file.
     * @private
     */
    gf.AudioPlayer.prototype.loadBuffer = function(url) {
        //load from cache
        if(url in gf.assetCache) {
            this._duration = gf.assetCache[url].duration;
            this.loadSound();
        } else {
            //load the buffer from the URL
            var self = this;

            gf.utils.ajax({
                method: 'GET',
                url: url,
                dataType: 'arraybuffer',
                load: function(data) {
                    //decode the buffer into an audio source
                    self._manager.ctx.decodeAudioData(data, function(buffer) {
                        if(buffer) {
                            gf.assetCache[url] = buffer;
                            self.loadSound(buffer);
                        }
                    });
                },
                error: function() {
                    //if there was an error, switch to HTML Audio
                    if(self._webAudio) {
                        self._buffer = true;
                        self._webAudio = false;
                        self._nodes = [];
                        self.load();
                    }
                }
            });
        }
    };

    /**
     * Finishes loading the Web Audio API sound and fires the loaded event
     *
     * @method loadSound
     * @param buffer {Object} The decoded buffer sound source.
     * @private
     */
    gf.AudioPlayer.prototype.loadSound = function(buffer) {
        this._duration = buffer ? buffer.duration : this._duration;

        //setup a default sprite
        this.sprite._default = [0, this._duration * 1000];

        //fire the load event
        if(!this._loaded) {
            this._loaded = true;
            this.emit('load', {
                message: 'Audio file loaded.',
                data: this.src
            });
        }

        //autoplay is appropriate
        if(this.autoplay) {
            this.play();
        }
    };

    /**
     * Load the sound back into the buffer source.
     *
     * @method refreshBuffer
     * @param loop {Array} Loop boolean, pos, and duration.
     * @param [id] {String} The play instance ID.
     * @private
     */
    gf.AudioPlayer.prototype.refreshBuffer = function(loop, id) {
        var node = this._nodeById(id);

        //setup the buffer source for playback
        node.bufferSource = this._manager.ctx.createBufferSource();
        node.bufferSource.buffer = gf.assetCache[this.src];
        node.bufferSource.connect(node.panner);
        node.bufferSource.loop = loop[0];

        if(loop[0]) {
            node.bufferSource.loopStart = loop[1];
            node.bufferSource.loopEnd = loop[1] + loop[2];
        }
    };
}