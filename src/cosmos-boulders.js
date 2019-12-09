function launch(config) {


var SCREEN_WIDTH = 640;
var SCREEN_HEIGHT = 400;


/* --[ Utility functions ]-------------------------------------------------------- */


function degreesToRadians(deg) {
    return (deg / 360) * Math.PI * 2;
}


function sign(n) {
    return n > 0 ? 1 : (n < 0 ? -1 : 0);
}


function cap(n, absMax) {
    if (Math.abs(n) > absMax) {
        return absMax * sign(n);
    } else {
        return n;
    }
}


function updatePosition(obj) {
    var nx = (obj.get("x") + obj.get("vx"));
    while (nx > SCREEN_WIDTH) nx -= SCREEN_WIDTH;
    while (nx < 0) nx += SCREEN_WIDTH;
    var ny = (obj.get("y") + obj.get("vy"));
    while (ny > SCREEN_HEIGHT) ny -= SCREEN_HEIGHT;
    while (ny < 0) ny += SCREEN_HEIGHT;
    return obj.set("x", nx).set("y", ny);
}


function decr(x) {
    return x - 1;
}


function incr(x) {
    return x + 1;
}


function countDown(obj, callback) {
    var obj2 = obj.update("timer", decr);
    if (obj2.get("timer") <= 0) {
        return callback(obj2);
    } else {
        return obj2;
    }
}


function countDownToMode(obj, toMode) {
    return countDown(obj, function(obj2) {
        return obj2.set("mode", toMode);
    });
}


function fireWentDown(action) {
    return (!action.prev.firePressed) && action.firePressed;
}


function fireWentUp(action) {
    return action.prev.firePressed && (!action.firePressed);
}


/* --[ Player objects ]-------------------------------------------------------- */


function resetPlayer(player) {
    return player.set("x", SCREEN_WIDTH / 2)
                 .set("y", SCREEN_HEIGHT / 2)
                 .set("vx", 0.0)
                 .set("vy", 0.0)
                 .set("ax", 0.0)
                 .set("ay", 0.0)
                 // h (heading) is measured in degrees.  So, E is 0, S is 90, W is 180, and N is 270.
                 .set("h", 270)
                 .set("dh", 0)
                 // f (force) is in the direction of h
                 .set("f", 0)
                 .set("mode", 'GET_READY')  // GET_READY | PLAYING | EXPLODING | GONE
                 // generally speaking, this is how many more steps it shall remain in the present mode
                 .set("timer", 200);
}


function makePlayer() {
    return resetPlayer(Immutable.Map({
        score: 0,
        lives: 2,
        mass: 1.0
    }));
}


// Reducer that takes a Player and an Action and returns a new Player.
// Action must be one of: STEP | SCORE_POINTS | EXPLODE | CONTROLS_CHANGED
function updatePlayer(player, action) {
    if (typeof player === 'undefined') return makePlayer();

    if (action.type === 'STEP') {
        return updatePlayerForStep(player);
    } else if (action.type === 'SCORE_POINTS') {
        return player.set("score", player.get("score") + 10);
    } else if (action.type === 'EXPLODE') {
        return player.set("mode", 'EXPLODING').set("timer", 50);
    } else if (action.type === 'CONTROLS_CHANGED') {
        if (player.get("mode") === 'PLAYING') {
            return player.set("dh", action.leftPressed ? -5 : (action.rightPressed ? 5 : 0))
                         .set("f", action.thrustPressed ? 0.05 : 0.0);
        } else if (player.get("mode") === 'GET_READY' && fireWentUp(action)) {
            return player.set("dh", 0).set("f", 0).set("mode", 'PLAYING');
        } else {
            return player.set("dh", 0).set("f", 0);
        }
    }
    throw new Error("Unhandled action: " + action.type);
}


// Extracted from updatePlayer to avoid gigantic sprawling functions
function updatePlayerForStep(player) {
    if (player.get("mode") === 'GET_READY') {
        return countDownToMode(player, 'PLAYING');
    } else if (player.get("mode") == 'PLAYING') {
        var player2 = updatePosition(player).set("vx", cap(player.get("vx") + player.get("ax"), 6))
                                            .set("vy", cap(player.get("vy") + player.get("ay"), 6))
                                            .set("h", player.get("h") + player.get("dh"));
        var f = player.get("f");
        if (f > 0) { // thrusters on
            var theta = degreesToRadians(player.get("h"));
            var fx = Math.cos(theta) * f;
            var fy = Math.sin(theta) * f;

            // F=ma, so a = F/m
            var m = player.get("mass");
            return player2.set("ax", fx * m).set("ay", fy * m);
        } else {
            // no force, thus, no acceleration.
            return player2.set("ax", 0).set("ay", 0);
        }
    } else if (player.get("mode") === 'EXPLODING') {
        return countDown(player, function(player) {
            if (player.get("lives") > 0) {
                return resetPlayer(player.update("lives", decr));
            } else {
                return player.set("mode", 'GONE');
            }
        });
    }
    throw new Error("Unhandled mode: " + player.get("mode"));
}


/* --[ Missile objects ]-------------------------------------------------------- */


function makeMissile(x, y, vx, vy) {
    return Immutable.Map({
        x: x,
        y: y,
        vx: vx,
        vy: vy,
        mode: 'MOVING',  // MOVING | GONE
        timer: 50
    });
}


// Reducer that takes a Missile and an Action and returns a new Missile.
// Action must be one of: STEP | EXPLODE
function updateMissile(missile, action) {
    if (action.type === 'STEP') {
        if (missile.get("mode") === 'MOVING') {
            return countDownToMode(updatePosition(missile), 'GONE');
        } else {
            return missile;
        }
    } else if (action.type === 'EXPLODE') {
        if (missile.get("mode") === 'MOVING') {
            return missile.set("mode", 'GONE').set("timer", 50);
        } else {
            return missile;
        }
    }
    throw new Error("Unhandled action: " + action.type);
}


/* --[ Boulder objects ]-------------------------------------------------------- */


function makeBoulder(i) {
    return Immutable.Map({
        x: Math.floor(Math.random() * SCREEN_WIDTH),
        y: Math.floor(Math.random() * SCREEN_HEIGHT),
        vx: Math.random() - 1.0,
        vy: Math.random() - 1.0,
        mode: 'APPEARING',  // APPEARING | MOVING | EXPLODING | GONE
        timer: 60
    });
}


function makeBoulders() {
    var boulders = [];
    for (var i = 0; i < 8; i++) {
        boulders.push(makeBoulder(i));
    }
    return Immutable.List(boulders);
}


// Reducer that takes a Boulder and an Action and returns a new Boulder.
// Action must be one of: STEP | EXPLODE
function updateBoulder(boulder, action) {
    if (action.type === 'STEP') {
        if (boulder.get("mode") === 'APPEARING') {
            return countDownToMode(boulder, 'MOVING');
        } else if (boulder.get("mode") === 'MOVING') {
            return updatePosition(boulder);
        } else if (boulder.get("mode") === 'EXPLODING') {
            return countDownToMode(boulder, 'GONE');
        } else {
            return boulder;
        }
    } else if (action.type === 'EXPLODE') {
        if (boulder.get("mode") === 'MOVING') {
            return boulder.set("mode", 'EXPLODING').set("timer", 50);
        } else {
            return boulder;
        }
    }
    throw new Error("Unhandled action: " + action.type);
}


/* --[ Game objects ]-------------------------------------------------------- */


function resetGame(game) {
    return game.set("player", makePlayer())
               .set("boulders", makeBoulders())
               .set("missiles", Immutable.List())
               .set("mode", 'ATTRACT_TITLE')  // ATTRACT_TITLE | ATTRACT_HISCORES | GAME_ON | GAME_OVER
               .set("timer", 400);
}


function makeGame() {
    return resetGame(Immutable.Map({
        credits: 0,
        highScore: 0,
        timer: null
    }));
}


// Reducer that takes a Game and an Action and returns a new Game.
// Action must be one of: FRAME_READY | CONTROLS_CHANGED | COIN_INSERTED
function updateGame(game, action) {
    if (typeof game === 'undefined') return makeGame();

    if (action.type === 'FRAME_READY') {
        if (game.get("mode") === 'GAME_ON') {
            var player = updatePlayer(game.get("player"), { 'type': 'STEP' });

            var boulders = game.get("boulders").map(function(boulder) {
                return updateBoulder(boulder, { 'type': 'STEP' });
            });

            var missiles = game.get("missiles").reduce(function(accum, missile) {
                var missile2 = updateMissile(missile, { 'type': 'STEP' });
                if (missile2.get("mode") == 'GONE') {
                    return accum;
                } else {
                    return accum.push(missile2);
                }
            }, Immutable.List());

            var collisionResult = detectCollisions(player, missiles, boulders);
            var player2 = collisionResult[0];
            var missiles2 = collisionResult[1];
            var boulders2 = collisionResult[2];

            /* Assemble new game state from all that */
            var game2;
            if (player2.get("mode") === 'GONE') {
                game2 = game.set("mode", 'GAME_OVER')
                            .set("timer", 100)
                            .set("highScore", player2.get("score") > game.get("highScore") ? player2.get("score") : game.get("highScore"));
            } else {
                game2 = game;
            }
            return game2.set("player", player2)
                        .set("boulders", boulders2.size === 0 ? makeBoulders() : boulders2)
                        .set("missiles", missiles2);
        } else if (game.get("mode") === 'GAME_OVER') {
            var game2 = game.update("timer", decr);
            if (game2.get("timer") <= 0) {
                return resetGame(game2);
            } else {
                return game2;
            }
        } else if (game.get("mode") === 'ATTRACT_TITLE') {
            if (game.get("credits") > 0) {
                return game;
            } else {
                return countDown(game, function(game) {
                    return game.set("mode", 'ATTRACT_HISCORES').set("timer", 400);
                });
            }
        } else if (game.get("mode") === 'ATTRACT_HISCORES') {
            return countDown(game, function(game) {
                return game.set("mode", 'ATTRACT_TITLE').set("timer", 400);
            });
        }
        throw new Error("Unhandled mode: " + game.get("mode"));
    } else if (action.type === 'CONTROLS_CHANGED') {
        if (game.get("mode") === 'ATTRACT_TITLE' || game.get("mode") === 'ATTRACT_HISCORES') {
            if (action.prev.startPressed && (!action.startPressed)) {
                if (game.get("credits") > 0) {
                   var player = resetPlayer(game.get("player"));
                   return game.set("player", player).update("credits", decr).set("mode", 'GAME_ON');
                } else {
                    return game;
                }
            } else {
                return game;
            }
        } else if (game.get("mode") === 'GAME_ON') {
            var player = game.get("player");
            if (fireWentDown(action) && player.get("mode") === 'PLAYING') {
                var mx = player.get("x");
                var my = player.get("y");
                var h = player.get("h");
                var mv = 2.0;
                var mvx = Math.cos(degreesToRadians(h)) * mv;
                var mvy = Math.sin(degreesToRadians(h)) * mv;
                return game.update("missiles", function(m) {
                    return m.push(makeMissile(mx, my, mvx, mvy));
                });
            } else {
                return game.set("player", updatePlayer(game.get("player"), action));
            }
        } else if (game.get("mode") === 'GAME_OVER') {
            return game;
        }
        throw new Error("Unhandled mode: " + game.get("mode"));
    } else if (action.type === 'COIN_INSERTED') {
        var game2 = game.update("credits", incr);
        if (game2.get("mode") === 'ATTRACT_HISCORES') {
            return game2.set("mode", 'ATTRACT_TITLE');
        } else {
            return game2;
        }
    }
    throw new Error("Unhandled action: " + action.type);
}


// Extracted from updateGame to avoid gigantic sprawling functions.
// Returns an array of 3 items: new Player, new List of Missiles, new List of Boulders.
function detectCollisions(player, missiles, boulders) {
    return boulders.reduce(function(accum, boulder) {
        if (boulder.get("mode") == 'GONE') {
            return accum;
        } else if (boulder.get("mode") == 'MOVING') {
            var player = accum[0];
            var missiles = accum[1];
            var boulders = accum[2];
            /* 1. Check collision with player */
            if (player.get("mode") === 'PLAYING' &&
                Math.abs(player.get("x") - boulder.get("x")) < 10 &&
                Math.abs(player.get("y") + 5 - boulder.get("y")) < 10) {
                return [
                    updatePlayer(player, { type: 'EXPLODE' }),
                    missiles,
                    boulders.push(updateBoulder(boulder, { 'type': 'EXPLODE' }))
                ];
            }
            /* 2. Check collision with any missile */
            var missileCollisionResult = missiles.reduce(function(accum, missile) {
                var player = accum[0];
                var boulder = accum[1];
                var missiles = accum[2];
                if (Math.abs(missile.get("x") - boulder.get("x")) < 10 &&
                    Math.abs(missile.get("y") - boulder.get("y")) < 10) {
                    return [
                        updatePlayer(player, { type: 'SCORE_POINTS' }),
                        updateBoulder(boulder, { type: 'EXPLODE' }),
                        missiles.push(updateMissile(missile, { 'type': 'EXPLODE' }))
                    ];
                } else {
                    return [player, boulder, missiles.push(missile)];
                }
            }, [player, boulder, Immutable.List()]);
            return [missileCollisionResult[0], missileCollisionResult[2], boulders.push(missileCollisionResult[1])];
        } else {
            return [accum[0], accum[1], accum[2].push(boulder)];
        }
    }, [player, missiles, Immutable.List()]);
}


/* --[ InputContext objects ]-------------------------------------------------------- */


function makeInputContext() {
    return Immutable.Map({
        game: makeGame(),
        leftPressed: false,
        rightPressed: false,
        thrustPressed: false,
        firePressed: false
    });
}


// Reducer that takes an InputContext and an Action and returns a new InputContext.
// Action must be one of: FRAME_READY | COIN_INSERTED
function updateInputContext(inputContext, action) {
    if (typeof inputContext === 'undefined') return makeInputContext();

    var game = inputContext.get("game");

    if (action.type === 'FRAME_READY') {
        var leftPressed = inputContext.get("leftPressed");
        var rightPressed = inputContext.get("rightPressed");
        var thrustPressed = inputContext.get("thrustPressed");
        var firePressed = inputContext.get("firePressed");
        var startPressed = inputContext.get("startPressed");

        if (action.leftPressed !== leftPressed ||
            action.rightPressed !== rightPressed ||
            action.thrustPressed !== thrustPressed ||
            action.firePressed !== firePressed ||
            action.startPressed !== startPressed) {
            var action = {
                type: "CONTROLS_CHANGED",
                leftPressed: action.leftPressed,
                rightPressed: action.rightPressed,
                thrustPressed: action.thrustPressed,
                firePressed: action.firePressed,
                startPressed: action.startPressed,
                prev: {
                    leftPressed: leftPressed,
                    rightPressed: rightPressed,
                    thrustPressed: thrustPressed,
                    firePressed: firePressed,
                    startPressed: startPressed
                }
            };
            game = updateGame(game, action);
        }

        game = updateGame(game, { type: "FRAME_READY" });

        return inputContext.set("game", game)
                           .set("leftPressed", action.leftPressed)
                           .set("rightPressed", action.rightPressed)
                           .set("thrustPressed", action.thrustPressed)
                           .set("firePressed", action.firePressed)
                           .set("startPressed", action.startPressed);
    } else if (action.type === 'COIN_INSERTED') {
        return inputContext.set("game", updateGame(game, action));
    }
    throw new Error("Unhandled action: " + action.type);
}


/* --[ Display functions ]-------------------------------------------------------- */


function drawPlayer(player, ctx) {
    var mode = player.get("mode");

    if (mode === 'GET_READY') {
        ctx.font = "16px sans-serif";
        ctx.textBaseline = "bottom";        
        ctx.textAlign = "center";
        ctx.fillStyle = "white";
        ctx.fillText("Get Ready!", canvas.width / 2, canvas.height * 0.25);
    }

    var x = player.get("x");
    var y = player.get("y");

    ctx.save();
    ctx.translate(x, y);

    if (mode === 'GONE') {
        return;
    } else if (mode === 'EXPLODING') {
        ctx.beginPath();
        ctx.fillStyle = "black";
        ctx.arc(Math.floor(Math.random() * 16) - 8, Math.floor(Math.random() * 16) - 8, 4, 0, Math.PI * 2, false);
        ctx.fill();
    } else {
        var theta = degreesToRadians(player.get("h"));
        ctx.rotate(theta + (Math.PI / 2));

        if (mode === 'GET_READY') {
            if (Math.floor(player.get("timer") / 10) % 2 === 0) {
                ctx.fillStyle = 'green';
            } else {
                ctx.fillStyle = 'blue';
            }
        } else {
            ctx.fillStyle = "red";
        }
        ctx.beginPath();
        ctx.moveTo(-10, 10);
        ctx.lineTo(0, -10);
        ctx.lineTo(10, 10);
        ctx.lineTo(-10, 10);
        ctx.fill();

        if (player.get("f") > 0) {
            ctx.beginPath();
            ctx.fillStyle = "yellow";
            ctx.moveTo(-5, 10);
            ctx.lineTo(5, 10);
            ctx.lineTo(0, 15);
            ctx.lineTo(-5, 10);
            ctx.fill();
        }
    }

    ctx.restore();
}


function drawMissile(missile, ctx) {
    var mode = missile.get("mode")
    var x = missile.get("x")
    var y = missile.get("y")

    if (mode === 'GONE') {
        return;
    } else if (mode === 'EXPLODING') {
        ctx.beginPath();
        ctx.fillStyle = "white";
        ctx.arc(x + Math.floor(Math.random() * 16) - 8, y + Math.floor(Math.random() * 16) - 8, 4, 0, Math.PI * 2, false);
        ctx.fill();
    } else {
        ctx.beginPath();
        ctx.strokeStyle = "blue";
        ctx.lineWidth = 3;
        ctx.moveTo(x - 2, y);
        ctx.lineTo(x + 2, y);
        ctx.stroke();
    }
}


function drawBoulder(boulder, ctx) {
    var mode = boulder.get("mode")
    var x = boulder.get("x")
    var y = boulder.get("y")

    if (mode === 'GONE') {
        return;
    } else if (mode === 'APPEARING') {
        ctx.beginPath();
        ctx.strokeStyle = "white";
        ctx.lineWidth = 1;
        var timer = boulder.get("timer");
        ctx.arc(x, y, timer % 10, 0, Math.PI * 2, false);
        ctx.stroke();
    } else if (mode === 'EXPLODING') {
        ctx.beginPath();
        ctx.fillStyle = "white";
        ctx.arc(x + Math.floor(Math.random() * 16) - 8, y + Math.floor(Math.random() * 16) - 8, 4, 0, Math.PI * 2, false);
        ctx.fill();
    } else {
        ctx.beginPath();
        ctx.fillStyle = "yellow";
        ctx.arc(x, y, 12, 0, Math.PI * 2, false);
        ctx.fill();
    }
}


function drawGame(game, canvas, ctx) {
    var mode = game.get("mode");
    var player = game.get("player");

    ctx.fillStyle = "brown";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.font = "16px sans-serif";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "white";

    ctx.textAlign = "left";
    ctx.fillText("Score: " + player.get("score"), 0, canvas.height);
    ctx.fillText("High Score: " + game.get("highScore"), 0, 16);

    ctx.textAlign = "right";
    ctx.fillText("Lives: " + player.get("lives"), canvas.width, canvas.height);
    ctx.fillText("Credits: " + game.get("credits"), canvas.width, 16);

    ctx.textAlign = "center";

    if (mode === 'ATTRACT_TITLE') {
        ctx.font = "40px sans-serif";
        ctx.fillText("COSMOS", canvas.width / 2, canvas.height * 0.40);
        ctx.fillText("BOULDERS", canvas.width / 2, canvas.height * 0.50);
        ctx.font = "16px sans-serif";
        if (game.get("credits") > 0) {
            ctx.fillText("Press Start", canvas.width / 2, canvas.height * 0.66);
        } else {
            ctx.fillText("Insert Coin", canvas.width / 2, canvas.height * 0.66);
        }
    } else if (mode === 'ATTRACT_HISCORES') {
        ctx.fillText("High Score for Today:", canvas.width / 2, canvas.height * 0.25);
        ctx.font = "40px sans-serif";
        ctx.fillText("" + game.get("highScore"), canvas.width / 2, canvas.height * 0.55);
        ctx.font = "16px sans-serif";
        ctx.fillText("Can YOU beat it?", canvas.width / 2, canvas.height * 0.75);
    } else if (mode === 'GAME_ON') {
        drawPlayer(player, ctx);
        game.get("missiles").forEach(function(missile) { drawMissile(missile, ctx); });
        game.get("boulders").forEach(function(boulder) { drawBoulder(boulder, ctx); });
    } else if (mode === 'GAME_OVER') {
        ctx.fillText("Game Over", canvas.width / 2, canvas.height / 2);
    }
}


/* --[ Virtual Hardware ]-------------------------------------------------------- */


var Hardware = function() {
    this.init = function(config) {
        this.screen = {};
        this.screen.canvas = config.canvas;
        this.screen.ctx = this.screen.canvas.getContext("2d");
        this.onCoinInserted = config.onCoinInserted;

        this.leftPressed = false;
        this.rightPressed = false;
        this.thrustPressed = false;
        this.firePressed = false;
        this.startPressed = false;

        this.attachListeners(this.screen.canvas);

        config.onSetup(this);

        var $this = this;
        var animator;
        animator = function() {
            config.onFrameReady($this);
            requestAnimationFrame(animator);
        };
        requestAnimationFrame(animator);
    };

    this.keyMap = {
        '1': 'startPressed',
        'Control': 'firePressed',
        'ArrowLeft': 'leftPressed',
        'ArrowUp': 'thrustPressed',
        'ArrowRight': 'rightPressed',
        49: 'startPressed',
        17: 'firePressed',
        37: 'leftPressed',
        38: 'thrustPressed',
        39: 'rightPressed'
    };

    this.attachListeners = function(element) {
        var $this = this;
        element.addEventListener('keydown', function(e) {
            var keyId = event.key || event.keyCode;
            var u = $this.keyMap[keyId];
            if (u !== undefined) {
                $this[u] = true;
                e.cancelBubble = true;
                e.preventDefault();
            }
        }, true);
        element.addEventListener('keyup', function(e) {
            var keyId = event.key || event.keyCode;
            var u = $this.keyMap[keyId];
            if (u !== undefined) {
                $this[u] = false;
                e.cancelBubble = true;
                e.preventDefault();
            }
            if (keyId === '5' || keyId === 53) {
                $this.onCoinInserted($this);
            }
        }, true);
    };
};


/* --[ Main driver ]-------------------------------------------------------- */


var canvas = document.createElement('canvas');
canvas.width = SCREEN_WIDTH;
canvas.height = SCREEN_HEIGHT;
canvas.tabIndex = 0;
config.container.appendChild(canvas);

var store = null;
(new Hardware()).init({
    canvas: canvas,
    onSetup: function(hardware) {
        store = Redux.createStore(updateInputContext);
        function render() {
            drawGame(store.getState().get("game"), hardware.screen.canvas, hardware.screen.ctx);
        }
        render();
        store.subscribe(render);
    },
    onFrameReady: function(hardware) {
        store.dispatch({
            type: "FRAME_READY",
            leftPressed: hardware.leftPressed,
            rightPressed: hardware.rightPressed,
            thrustPressed: hardware.thrustPressed,
            firePressed: hardware.firePressed,
            startPressed: hardware.startPressed
        });
    },
    onCoinInserted: function(hardware) {
        store.dispatch({
            type: "COIN_INSERTED"
        });
    }
});


canvas.focus();

}
