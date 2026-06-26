/* =========================================================
   LÉGENDES DES MILLE ROYAUMES — Moteur de jeu
   HTML5 / CSS3 / JavaScript ES6 pur, sans bibliothèque externe.
   ========================================================= */

'use strict';

const CANVAS_W = 960;
const CANVAS_H = 540;
const GRAVITY = 0.62;
const FRICTION = 0.80;
const AIR_FRICTION = 0.96;
const MAX_FALL = 16;

const COLORS = {
    gold: '#ffd700', goldDark: '#b8860b', goldLight: '#ffe88c',
    night: '#1a1a3e', nightDeep: '#0a0612',
    purple: '#8b008b', purpleDeep: '#4b0082',
    turquoise: '#40e0d0', turquoiseDk: '#1f9c8f',
    red: '#dc143c', redDark: '#8b0000',
    sand: '#f4a460', sandLight: '#deb887', sandDark: '#c19a6b',
    skin: '#e8b88a', white: '#fff5d6',
    lava: '#ff4500', lavaGlow: '#ffaa00'
};

const clamp = (v, mn, mx) => Math.max(mn, Math.min(mx, v));
const lerp  = (a, b, t) => a + (b - a) * t;
const rand  = (mn, mx) => Math.random() * (mx - mn) + mn;
const randInt = (mn, mx) => Math.floor(rand(mn, mx + 1));
const choice = (arr) => arr[randInt(0, arr.length - 1)];
const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x &&
           a.y < b.y + b.h && a.y + a.h > b.y;
}

function fmtTime(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, '0')}`;
}

/* ---- InputManager ---- */
class InputManager {
    constructor() {
        this.keys = {};
        this.justPressed = {};
        this.touch = { left: false, right: false, jump: false, attack: false, run: false };
        window.addEventListener('keydown', (e) => {
            if (!this.keys[e.code]) this.justPressed[e.code] = true;
            this.keys[e.code] = true;
            if (['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.code)) e.preventDefault();
        });
        window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
        this._setupTouch();
    }
    _setupTouch() {
        const map = { 'btn-left':'left','btn-right':'right','btn-jump':'jump','btn-attack':'attack','btn-run':'run' };
        for (const [id, key] of Object.entries(map)) {
            const el = document.getElementById(id);
            if (!el) continue;
            const press = (e) => {
                e.preventDefault();
                if (!this.touch[key] && (key === 'jump' || key === 'attack')) this.justPressed['touch_'+key] = true;
                this.touch[key] = true;
                el.classList.add('pressed');
            };
            const release = (e) => { e.preventDefault(); this.touch[key] = false; el.classList.remove('pressed'); };
            el.addEventListener('touchstart', press, { passive:false });
            el.addEventListener('touchend', release, { passive:false });
            el.addEventListener('touchcancel', release, { passive:false });
            el.addEventListener('mousedown', press);
            el.addEventListener('mouseup', release);
            el.addEventListener('mouseleave', release);
        }
    }
    left()   { return this.keys['ArrowLeft'] || this.keys['KeyA'] || this.touch.left; }
    right()  { return this.keys['ArrowRight']|| this.keys['KeyD'] || this.touch.right; }
    jump()   { return this.keys['ArrowUp']   || this.keys['KeyW'] || this.touch.jump; }
    attack() { return this.keys['Space']                              || this.touch.attack; }
    run()    { return this.keys['ShiftLeft']|| this.keys['ShiftRight']|| this.touch.run; }
    jumpPressed()   { return this.justPressed['ArrowUp']||this.justPressed['KeyW']||this.justPressed['touch_jump']; }
    attackPressed() { return this.justPressed['Space']  ||this.justPressed['touch_attack']; }
    endFrame() { this.justPressed = {}; }
}

/* ---- SoundManager ---- */
class SoundManager {
    constructor() { this.ctx = null; this.muted = false; this.masterGain = null; }
    init() {
        if (this.ctx) return;
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AC();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.35;
            this.masterGain.connect(this.ctx.destination);
        } catch (e) { console.warn('Web Audio non disponible.', e); }
    }
    _tone(freq, dur, type='sine', vol=0.3, slide=0) {
        if (!this.ctx || this.muted) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type; osc.frequency.setValueAtTime(freq, t);
        if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq+slide), t+dur);
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t+dur);
        osc.connect(gain).connect(this.masterGain);
        osc.start(t); osc.stop(t+dur);
    }
    _noise(dur, vol=0.3, filterFreq=1000) {
        if (!this.ctx || this.muted) return;
        const t = this.ctx.currentTime;
        const bufSize = Math.floor(this.ctx.sampleRate * dur);
        const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i=0; i<bufSize; i++) data[i] = (Math.random()*2-1)*(1-i/bufSize);
        const src = this.ctx.createBufferSource(); src.buffer = buf;
        const filt = this.ctx.createBiquadFilter(); filt.type='lowpass'; filt.frequency.value=filterFreq;
        const gain = this.ctx.createGain(); gain.gain.value = vol;
        src.connect(filt).connect(gain).connect(this.masterGain);
        src.start(t);
    }
    jump(){this._tone(420,0.18,'square',0.18,320);}
    doubleJump(){this._tone(620,0.20,'square',0.20,380);}
    attack(){this._tone(880,0.10,'sawtooth',0.18,-380);}
    hitEnemy(){this._tone(280,0.10,'square',0.22,-120);this._noise(0.06,0.10,2000);}
    coin(){this._tone(880,0.07,'sine',0.22);setTimeout(()=>this._tone(1320,0.10,'sine',0.22),70);}
    fruit(){this._tone(520,0.10,'sine',0.20,220);}
    potion(){this._tone(440,0.20,'triangle',0.22,440);}
    diamond(){this._tone(1320,0.08,'sine',0.22);setTimeout(()=>this._tone(1760,0.10,'sine',0.22),80);setTimeout(()=>this._tone(2200,0.14,'sine',0.20),180);}
    key(){this._tone(660,0.10,'triangle',0.22);setTimeout(()=>this._tone(990,0.14,'triangle',0.22),100);}
    hurt(){this._tone(180,0.22,'sawtooth',0.25,-80);this._noise(0.10,0.15,800);}
    death(){this._tone(220,0.6,'sawtooth',0.28,-180);}
    bossHit(){this._tone(140,0.18,'square',0.30,-40);this._noise(0.10,0.18,600);}
    bossDeath(){this._noise(0.5,0.35,400);this._tone(110,0.5,'sawtooth',0.30,-70);setTimeout(()=>this._tone(80,0.6,'sawtooth',0.25,-50),200);}
    victory(){const n=[523,659,784,1047];n.forEach((x,i)=>setTimeout(()=>this._tone(x,0.25,'triangle',0.25),i*180));}
    levelComplete(){const n=[440,554,659];n.forEach((x,i)=>setTimeout(()=>this._tone(x,0.18,'triangle',0.22),i*120));}
    explosion(){this._noise(0.45,0.40,700);this._tone(90,0.45,'sawtooth',0.30,-50);}
    arrow(){this._tone(660,0.12,'sawtooth',0.18,-380);}
    chestOpen(){const n=[523,659,784,1047,1319];n.forEach((x,i)=>setTimeout(()=>this._tone(x,0.22,'triangle',0.25),i*110));}
}

/* ---- Particle ---- */
class Particle {
    constructor(x, y, opts = {}) {
        this.x = x; this.y = y;
        this.vx = opts.vx ?? rand(-2, 2);
        this.vy = opts.vy ?? rand(-4, -1);
        this.life = opts.life ?? 1.0;
        this.maxLife = this.life;
        this.size = opts.size ?? rand(2, 5);
        this.color = opts.color ?? COLORS.gold;
        this.gravity = opts.gravity ?? 0.15;
        this.shrink = opts.shrink ?? true;
        this.glow = opts.glow ?? false;
        this.dead = false;
    }
    update(dt) {
        this.x += this.vx; this.y += this.vy;
        this.vy += this.gravity; this.vx *= 0.98;
        this.life -= dt;
        if (this.life <= 0) this.dead = true;
    }
    draw(ctx, cam) {
        const a = clamp(this.life / this.maxLife, 0, 1);
        const s = this.shrink ? this.size * a : this.size;
        ctx.save();
        ctx.globalAlpha = a;
        if (this.glow) { ctx.shadowBlur = 12; ctx.shadowColor = this.color; }
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x - cam.x, this.y - cam.y, Math.max(0.5, s), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

class ParticleSystem {
    constructor() { this.particles = []; }
    add(p) { this.particles.push(p); }
    burst(x, y, count, opts = {}) {
        for (let i = 0; i < count; i++) {
            const ang = rand(0, Math.PI * 2);
            const spd = rand(opts.minSpd ?? 1, opts.maxSpd ?? 5);
            this.add(new Particle(x, y, {
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd - (opts.upBias ?? 0),
                life: rand(opts.minLife ?? 0.4, opts.maxLife ?? 0.9),
                size: rand(opts.minSize ?? 2, opts.maxSize ?? 5),
                color: Array.isArray(opts.color) ? choice(opts.color) : (opts.color ?? COLORS.gold),
                gravity: opts.gravity ?? 0.15,
                glow: opts.glow ?? false
            }));
        }
    }
    update(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update(dt);
            if (this.particles[i].dead) this.particles.splice(i, 1);
        }
    }
    draw(ctx, cam) { for (const p of this.particles) p.draw(ctx, cam); }
    clear() { this.particles.length = 0; }
}

/* ---- Camera ---- */
class Camera {
    constructor() { this.x = 0; this.y = 0; this.shakeT = 0; this.shakeMag = 0; }
    follow(target, levelW, levelH) {
        const tx = target.x + target.w / 2 - CANVAS_W / 2;
        const ty = target.y + target.h / 2 - CANVAS_H / 2;
        this.x = lerp(this.x, tx, 0.12);
        this.y = lerp(this.y, ty, 0.12);
        this.x = clamp(this.x, 0, Math.max(0, levelW - CANVAS_W));
        this.y = clamp(this.y, 0, Math.max(0, levelH - CANVAS_H));
    }
    shake(mag = 8, dur = 0.3) { this.shakeMag = mag; this.shakeT = dur; }
    update(dt) { if (this.shakeT > 0) this.shakeT -= dt; }
    get offsetX() { return this.shakeT > 0 ? rand(-this.shakeMag, this.shakeMag) : 0; }
    get offsetY() { return this.shakeT > 0 ? rand(-this.shakeMag, this.shakeMag) : 0; }
}

/* ---- Entity de base ---- */
class Entity {
    constructor(x, y, w, h) {
        this.x = x; this.y = y; this.w = w; this.h = h;
        this.vx = 0; this.vy = 0; this.dead = false; this.onGround = false;
    }
    get cx() { return this.x + this.w / 2; }
    get cy() { return this.y + this.h / 2; }
    rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
}
/* =========================================================
   8. JOUEUR — Héros inspiré de Sindbad / Aladin (original)
   ========================================================= */
class Player extends Entity {
    constructor(x, y) {
        super(x, y, 28, 44);
        this.speed = 3.2;
        this.runSpeed = 5.4;
        this.jumpForce = 12.5;
        this.maxHealth = 5;
        this.health = 5;
        this.maxEnergy = 100;
        this.energy = 100;
        this.coins = 0;
        this.score = 0;
        this.keys = 0;
        this.facing = 1;
        this.state = 'idle';
        this.jumpsLeft = 2;
        this.coyoteTime = 0;
        this.jumpBuffer = 0;
        this.attackTimer = 0;
        this.attackCooldown = 0;
        this.hurtTimer = 0;
        this.iframes = 0;
        this.animTime = 0;
        this.spawnX = x;
        this.spawnY = y;
        this.deathTimer = 0;
        this.victoryTimer = 0;
    }

    reset(x, y) {
        this.x = x; this.y = y;
        this.vx = 0; this.vy = 0;
        this.health = this.maxHealth;
        this.energy = this.maxEnergy;
        this.state = 'idle';
        this.iframes = 0;
        this.jumpsLeft = 2;
        this.dead = false;
        this.deathTimer = 0;
    }

    respawn() {
        this.x = this.spawnX;
        this.y = this.spawnY;
        this.vx = 0; this.vy = 0;
        this.state = 'idle';
        this.iframes = 90;
        this.jumpsLeft = 2;
        this.dead = false;
    }

    takeDamage(amount, source, game) {
        if (this.iframes > 0 || this.state === 'dead' || this.state === 'victory') return;
        this.health -= amount;
        this.iframes = 70;
        this.state = 'hurt';
        this.hurtTimer = 25;
        const dir = source && source.cx < this.cx ? 1 : -1;
        this.vx = dir * 5;
        this.vy = -6;
        game.sound.hurt();
        game.camera.shake(6, 0.25);
        game.particles.burst(this.cx, this.cy, 12, {
            color: [COLORS.red, COLORS.gold, COLORS.white], minSpd: 2, maxSpd: 5, glow: true
        });
        if (this.health <= 0) this.die(game);
    }

    die(game) {
        this.health = 0;
        this.state = 'dead';
        this.deathTimer = 90;
        this.vy = -10;
        game.sound.death();
        game.particles.burst(this.cx, this.cy, 24, {
            color: [COLORS.purple, COLORS.gold, COLORS.white], minSpd: 2, maxSpd: 6, glow: true
        });
    }

    update(dt, input, game) {
        this.animTime += dt;

        if (this.state === 'dead') {
            this.vy += GRAVITY * 0.5;
            if (this.vy > MAX_FALL) this.vy = MAX_FALL;
            this.deathTimer--;
            if (this.deathTimer <= 0) game.onPlayerDeath();
            return;
        }

        if (this.state === 'victory') {
            this.victoryTimer--;
            this.animTime += dt;
            return;
        }

        if (this.iframes > 0) this.iframes--;
        if (this.hurtTimer > 0) { this.hurtTimer--; if (this.hurtTimer === 0 && this.onGround) this.state = 'idle'; }
        if (this.attackTimer > 0) this.attackTimer--;
        if (this.attackCooldown > 0) this.attackCooldown--;
        if (this.coyoteTime > 0) this.coyoteTime--;
        if (this.jumpBuffer > 0) this.jumpBuffer--;

        const speed = input.run() ? this.runSpeed : this.speed;
        if (input.left())  { this.vx = -speed; this.facing = -1; }
        else if (input.right()) { this.vx = speed; this.facing = 1; }
        else { this.vx *= this.onGround ? FRICTION : AIR_FRICTION; if (Math.abs(this.vx) < 0.1) this.vx = 0; }

        if (input.jumpPressed()) this.jumpBuffer = 8;
        if (this.jumpBuffer > 0 && (this.onGround || this.coyoteTime > 0 || this.jumpsLeft > 0)) {
            if (this.onGround || this.coyoteTime > 0) {
                this.vy = -this.jumpForce;
                this.jumpsLeft = 1;
                this.coyoteTime = 0;
                game.sound.jump();
                game.particles.burst(this.cx, this.y + this.h, 8, {
                    color: [COLORS.sandLight, COLORS.sand], minSpd: 1, maxSpd: 3, gravity: 0.05, upBias: 0
                });
            } else if (this.jumpsLeft > 0) {
                this.vy = -this.jumpForce * 0.92;
                this.jumpsLeft--;
                game.sound.doubleJump();
                for (let i = 0; i < 14; i++) {
                    const a = (i / 14) * Math.PI * 2;
                    game.particles.add(new Particle(this.cx, this.cy, {
                        vx: Math.cos(a) * 3.5, vy: Math.sin(a) * 3.5,
                        life: 0.5, size: 3, color: COLORS.turquoise, gravity: 0, glow: true
                    }));
                }
            }
            this.jumpBuffer = 0;
            this.onGround = false;
        }

        if (!input.jump() && this.vy < -4) this.vy = -4;

        if (input.attackPressed() && this.attackCooldown <= 0 && this.state !== 'hurt') {
            this.attackTimer = 18;
            this.attackCooldown = 28;
            this.state = 'attack';
            game.sound.attack();
        }

        this.vy += GRAVITY;
        if (this.vy > MAX_FALL) this.vy = MAX_FALL;

        if (this.state !== 'attack' && this.state !== 'hurt') {
            if (!this.onGround) this.state = this.vy < 0 ? 'jump' : 'fall';
            else if (Math.abs(this.vx) > 0.5) this.state = input.run() ? 'run' : 'walk';
            else this.state = 'idle';
        }
        if (this.state === 'attack' && this.attackTimer === 0 && this.onGround) this.state = 'idle';
    }

    attackHitbox() {
        if (this.state !== 'attack' || this.attackTimer < 6 || this.attackTimer > 16) return null;
        const reach = 38;
        return {
            x: this.facing === 1 ? this.x + this.w - 4 : this.x - reach + 4,
            y: this.y + 6, w: reach, h: this.h - 10
        };
    }

    draw(ctx, cam) {
        const x = Math.round(this.x - cam.x);
        const y = Math.round(this.y - cam.y);
        const w = this.w, h = this.h;
        const t = this.animTime;

        if (this.iframes > 0 && Math.floor(this.iframes / 4) % 2 === 0) return;

        ctx.save();
        if (this.facing === -1) { ctx.translate(x + w, y); ctx.scale(-1, 1); }
        else ctx.translate(x, y);

        if (this.onGround) {
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.beginPath();
            ctx.ellipse(w / 2, h + 2, w * 0.55, 4, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        const moving = (this.state === 'walk' || this.state === 'run');
        const swing = moving ? Math.sin(t * (this.state === 'run' ? 18 : 12)) : 0;
        const jumpPose = (this.state === 'jump' || this.state === 'fall');
        const legA = jumpPose ? -0.4 : swing * 0.6;
        const legB = jumpPose ? 0.4 : -swing * 0.6;

        // Jambes (pantalon violet)
        ctx.fillStyle = COLORS.purpleDeep;
        ctx.save();
        ctx.translate(w / 2 - 4, h - 16); ctx.rotate(legB);
        ctx.fillRect(-3, 0, 6, 16);
        ctx.fillStyle = COLORS.goldDark; ctx.fillRect(-4, 12, 8, 5);
        ctx.restore();
        ctx.fillStyle = COLORS.purple;
        ctx.save();
        ctx.translate(w / 2 + 2, h - 16); ctx.rotate(legA);
        ctx.fillRect(-3, 0, 6, 16);
        ctx.fillStyle = COLORS.goldDark; ctx.fillRect(-4, 12, 8, 5);
        ctx.restore();

        // Tunique turquoise
        ctx.fillStyle = COLORS.turquoise;
        ctx.fillRect(w / 2 - 9, 14, 18, 20);
        ctx.fillStyle = COLORS.gold;
        ctx.fillRect(w / 2 - 9, 28, 18, 4);
        ctx.fillStyle = COLORS.turquoiseDk;
        ctx.fillRect(w / 2 - 9, 22, 18, 2);

        // Bras
        const armSwing = moving ? -swing * 0.5 : 0;
        const attackPose = this.state === 'attack';
        ctx.fillStyle = COLORS.turquoiseDk;
        ctx.save();
        ctx.translate(w / 2 - 8, 18); ctx.rotate(armSwing);
        ctx.fillRect(-3, 0, 5, 14);
        ctx.restore();

        ctx.save();
        ctx.translate(w / 2 + 6, 18);
        if (attackPose) {
            const ap = 1 - (this.attackTimer - 6) / 10;
            const ang = lerp(-1.2, 1.0, ap);
            ctx.rotate(ang);
            ctx.fillStyle = COLORS.skin;
            ctx.fillRect(-2, 0, 5, 12);
            ctx.translate(0, 10);
            ctx.fillStyle = COLORS.goldDark;
            ctx.fillRect(-2, -2, 6, 4);
            ctx.fillStyle = COLORS.gold;
            ctx.beginPath();
            ctx.moveTo(2, 0);
            ctx.quadraticCurveTo(18, 4, 24, -2);
            ctx.lineTo(24, 2);
            ctx.quadraticCurveTo(18, 8, 2, 4);
            ctx.fill();
            ctx.shadowBlur = 8; ctx.shadowColor = COLORS.goldLight;
            ctx.fillStyle = COLORS.goldLight;
            ctx.beginPath();
            ctx.moveTo(2, 1);
            ctx.quadraticCurveTo(18, 5, 24, -1);
            ctx.lineTo(24, 0);
            ctx.quadraticCurveTo(18, 6, 2, 2);
            ctx.fill();
        } else {
            ctx.rotate(armSwing * 0.8);
            ctx.fillStyle = COLORS.skin;
            ctx.fillRect(-2, 0, 5, 14);
            ctx.fillStyle = COLORS.goldDark;
            ctx.fillRect(-1, 12, 4, 3);
            ctx.fillStyle = COLORS.gold;
            ctx.fillRect(0, 14, 2, 16);
        }
        ctx.restore();

        // Tête
        const headBob = moving ? Math.sin(t * 12) * 0.5 : 0;
        ctx.save();
        ctx.translate(0, headBob);
        ctx.fillStyle = COLORS.skin;
        ctx.fillRect(w / 2 - 7, 0, 14, 14);
        ctx.fillStyle = COLORS.white;
        ctx.fillRect(w / 2 - 8, -2, 16, 8);
        ctx.fillRect(w / 2 - 8, 5, 16, 2);
        ctx.fillStyle = COLORS.gold;
        ctx.fillRect(w / 2 - 8, 3, 16, 2);
        ctx.fillStyle = COLORS.turquoise;
        ctx.fillRect(w / 2 + 4, -5, 3, 4);
        ctx.fillStyle = COLORS.nightDeep;
        ctx.fillRect(w / 2 + 2, 6, 2, 2);
        ctx.fillStyle = COLORS.sandDark;
        ctx.fillRect(w / 2 - 4, 11, 8, 2);
        ctx.restore();

        if (this.state === 'victory') {
            ctx.fillStyle = COLORS.skin;
            ctx.fillRect(w / 2 - 14, -2, 5, 16);
        }

        ctx.restore();
    }
}
/* =========================================================
   9. ENNEMIS — Bandit, Momie, Scorpion, Chauve-souris,
   Squelette, Gardien.
   ========================================================= */
class Enemy extends Entity {
    constructor(x, y, w, h, opts = {}) {
        super(x, y, w, h);
        this.health = opts.health ?? 2;
        this.maxHealth = this.health;
        this.damage = opts.damage ?? 1;
        this.speed = opts.speed ?? 1.2;
        this.patrolMin = x - (opts.range ?? 80);
        this.patrolMax = x + (opts.range ?? 80);
        this.dir = 1;
        this.state = 'patrol';
        this.hurtTimer = 0;
        this.deathTimer = 0;
        this.animTime = 0;
        this.touchDamage = opts.touchDamage ?? 1;
        this.scoreValue = opts.scoreValue ?? 50;
        this.type = opts.type ?? 'bandit';
        this.attackCooldown = 0;
        this.aggroRange = opts.aggroRange ?? 180;
        this.canFly = opts.canFly ?? false;
    }

    takeDamage(amount, dir, game) {
        if (this.state === 'dead') return;
        this.health -= amount;
        this.hurtTimer = 12;
        this.vx = dir * 4;
        game.sound.hitEnemy();
        game.particles.burst(this.cx, this.cy, 6, { color: [COLORS.gold, COLORS.white], minSpd: 1, maxSpd: 3, glow: true });
        if (this.health <= 0) this.die(game);
        else this.state = 'hurt';
    }

    die(game) {
        this.state = 'dead';
        this.deathTimer = 30;
        game.sound.bossHit();
        game.particles.burst(this.cx, this.cy, 16, {
            color: [COLORS.purple, COLORS.gold, COLORS.red], minSpd: 2, maxSpd: 5, glow: true, upBias: 2
        });
        if (Math.random() < 0.6) game.level.spawnPickup(this.cx, this.cy, 'coin');
        if (Math.random() < 0.18) game.level.spawnPickup(this.cx, this.cy, 'fruit');
        game.player.score += this.scoreValue;
        game.spawnScorePopup(this.cx, this.cy, '+' + this.scoreValue);
    }

    update(dt, game) {
        this.animTime += dt;
        if (this.hurtTimer > 0) this.hurtTimer--;
        if (this.attackCooldown > 0) this.attackCooldown--;

        if (this.state === 'dead') {
            this.deathTimer--;
            this.vy += GRAVITY * 0.4;
            this.y += this.vy;
            this.x += this.vx; this.vx *= 0.9;
            if (this.deathTimer <= 0) this.dead = true;
            return;
        }

        if (this.hurtTimer > 0) {
            this.x += this.vx; this.vx *= 0.85;
            this.vy += GRAVITY; this.y += this.vy;
            return;
        }

        const p = game.player;
        const dx = p.cx - this.cx;
        const dy = p.cy - this.cy;
        const distToPlayer = Math.hypot(dx, dy);

        if (this.state !== 'attack' && distToPlayer < this.aggroRange && Math.abs(dy) < 80) {
            this.state = 'chase';
            this.dir = dx > 0 ? 1 : -1;
        } else if (this.state === 'chase' && distToPlayer > this.aggroRange * 1.4) {
            this.state = 'patrol';
        }

        if (this.state === 'patrol') {
            this.vx = this.dir * this.speed * 0.5;
            if (this.x <= this.patrolMin) { this.dir = 1; this.x = this.patrolMin; }
            if (this.x >= this.patrolMax) { this.dir = -1; this.x = this.patrolMax; }
        } else if (this.state === 'chase') {
            this.vx = this.dir * this.speed;
        }

        if (distToPlayer < 32 && this.attackCooldown <= 0) {
            this.state = 'attack';
            this.attackCooldown = 50;
            if (p.iframes <= 0 && p.state !== 'dead') p.takeDamage(this.touchDamage, this, game);
        }

        if (!this.canFly) {
            this.vy += GRAVITY;
            if (this.vy > MAX_FALL) this.vy = MAX_FALL;
        } else {
            this.vy = Math.sin(this.animTime * 3) * 0.8;
        }

        this.x += this.vx;
        this.y += this.vy;
    }

    draw(ctx, cam) {
        const x = Math.round(this.x - cam.x);
        const y = Math.round(this.y - cam.y);
        const w = this.w, h = this.h, t = this.animTime;
        ctx.save();
        if (this.dir === -1) { ctx.translate(x + w, y); ctx.scale(-1, 1); }
        else ctx.translate(x, y);
        if (this.hurtTimer > 0 && Math.floor(this.hurtTimer / 2) % 2 === 0) ctx.globalAlpha = 0.5;
        if (this.state === 'dead') ctx.globalAlpha = clamp(this.deathTimer / 30, 0, 1);
        if (this.onGround && !this.canFly) {
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.ellipse(w / 2, h + 2, w * 0.5, 3, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        this._drawSprite(ctx, w, h, t);
        ctx.restore();
    }

    _drawSprite(ctx, w, h, t) {
        const swing = Math.sin(t * 10) * 0.5;
        ctx.fillStyle = COLORS.night;
        ctx.fillRect(w / 2 - 6, h - 14, 4, 14);
        ctx.save(); ctx.translate(w / 2 + 2, h - 14); ctx.rotate(swing * 0.4);
        ctx.fillRect(-2, 0, 4, 14); ctx.restore();
        ctx.fillStyle = COLORS.redDark;
        ctx.fillRect(w / 2 - 8, 10, 16, 18);
        ctx.fillStyle = COLORS.goldDark;
        ctx.fillRect(w / 2 - 8, 22, 16, 2);
        ctx.fillStyle = '#5a0000';
        ctx.fillRect(w / 2 - 10, 8, 4, 18);
        ctx.fillStyle = COLORS.night;
        ctx.fillRect(w / 2 - 8, 0, 16, 12);
        ctx.fillStyle = COLORS.skin;
        ctx.fillRect(w / 2 - 4, 6, 8, 7);
        ctx.fillStyle = COLORS.red;
        ctx.fillRect(w / 2 + 1, 8, 2, 2);
        ctx.fillStyle = COLORS.gold;
        ctx.fillRect(w / 2 + 6, 16, 2, 14);
        ctx.fillStyle = COLORS.goldDark;
        ctx.fillRect(w / 2 + 4, 14, 6, 3);
    }
}

class Bandit extends Enemy {
    constructor(x, y) {
        super(x, y, 26, 40, { health: 2, speed: 1.6, range: 100, type: 'bandit', scoreValue: 50, aggroRange: 200 });
    }
}

class Mummy extends Enemy {
    constructor(x, y) {
        super(x, y, 30, 46, { health: 4, speed: 0.9, range: 90, type: 'mummy', scoreValue: 80, touchDamage: 1, aggroRange: 220 });
    }
    _drawSprite(ctx, w, h, t) {
        const swing = Math.sin(t * 6) * 0.4;
        ctx.fillStyle = COLORS.sandLight;
        ctx.save(); ctx.translate(w / 2 - 5, h - 16); ctx.rotate(swing * 0.5);
        ctx.fillRect(-3, 0, 6, 16); ctx.restore();
        ctx.save(); ctx.translate(w / 2 + 3, h - 16); ctx.rotate(-swing * 0.5);
        ctx.fillRect(-3, 0, 6, 16); ctx.restore();
        ctx.fillRect(w / 2 - 9, 12, 18, 22);
        ctx.fillStyle = COLORS.sand;
        for (let i = 0; i < 4; i++) ctx.fillRect(w / 2 - 9, 14 + i * 5, 18, 1);
        ctx.fillStyle = COLORS.sandLight;
        ctx.fillRect(w / 2 - 12, 14, 4, 16);
        ctx.fillRect(w / 2 + 8, 14, 4, 16);
        ctx.fillRect(w / 2 - 7, 0, 14, 14);
        ctx.fillStyle = COLORS.sand;
        ctx.fillRect(w / 2 - 7, 4, 14, 1);
        ctx.fillRect(w / 2 - 7, 9, 14, 1);
        ctx.fillStyle = COLORS.red;
        ctx.shadowBlur = 6; ctx.shadowColor = COLORS.red;
        ctx.fillRect(w / 2 - 4, 6, 3, 2);
        ctx.fillRect(w / 2 + 2, 6, 3, 2);
        ctx.shadowBlur = 0;
    }
}

class Scorpion extends Enemy {
    constructor(x, y) {
        super(x, y, 38, 22, { health: 2, speed: 2.2, range: 120, type: 'scorpion', scoreValue: 60, touchDamage: 1, aggroRange: 240 });
    }
    _drawSprite(ctx, w, h, t) {
        const sk = Math.sin(t * 14) * 0.3;
        ctx.fillStyle = COLORS.purpleDeep;
        ctx.fillRect(4, 8, w - 12, 12);
        ctx.fillStyle = COLORS.purple;
        ctx.fillRect(0, 6, 14, 12);
        ctx.fillStyle = COLORS.goldDark;
        ctx.fillRect(-6, 8, 8, 5);
        ctx.fillRect(-6, 14, 8, 4);
        ctx.fillStyle = COLORS.purpleDeep;
        for (let i = 0; i < 3; i++) {
            ctx.save();
            ctx.translate(8 + i * 8, 18);
            ctx.rotate(sk + i * 0.3);
            ctx.fillRect(-1, 0, 2, 6);
            ctx.restore();
        }
        ctx.strokeStyle = COLORS.purple;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(w - 10, 14);
        ctx.quadraticCurveTo(w + 6, 4, w - 2, -4);
        ctx.stroke();
        ctx.fillStyle = COLORS.red;
        ctx.shadowBlur = 6; ctx.shadowColor = COLORS.red;
        ctx.beginPath();
        ctx.moveTo(w - 4, -6);
        ctx.lineTo(w - 1, 0);
        ctx.lineTo(w - 7, 0);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = COLORS.gold;
        ctx.fillRect(3, 10, 2, 2);
        ctx.fillRect(7, 10, 2, 2);
    }
}

class Bat extends Enemy {
    constructor(x, y) {
        super(x, y, 28, 20, { health: 1, speed: 2.6, range: 0, type: 'bat', scoreValue: 40, touchDamage: 1, aggroRange: 260, canFly: true });
        this.baseY = y;
    }
    update(dt, game) {
        super.update(dt, game);
        if (this.state !== 'chase') this.y = this.baseY + Math.sin(this.animTime * 2) * 8;
    }
    _drawSprite(ctx, w, h, t) {
        const flap = Math.sin(t * 18);
        ctx.fillStyle = COLORS.purpleDeep;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = COLORS.purple;
        ctx.beginPath();
        ctx.moveTo(w / 2, h / 2);
        ctx.quadraticCurveTo(2, h / 2 - 6 + flap * 4, 0, h / 2 + 2);
        ctx.quadraticCurveTo(4, h / 2 + 2, w / 2, h / 2 + 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(w / 2, h / 2);
        ctx.quadraticCurveTo(w - 2, h / 2 - 6 + flap * 4, w, h / 2 + 2);
        ctx.quadraticCurveTo(w - 4, h / 2 + 2, w / 2, h / 2 + 2);
        ctx.fill();
        ctx.fillStyle = COLORS.red;
        ctx.shadowBlur = 5; ctx.shadowColor = COLORS.red;
        ctx.fillRect(w / 2 - 3, h / 2 - 1, 2, 2);
        ctx.fillRect(w / 2 + 1, h / 2 - 1, 2, 2);
        ctx.shadowBlur = 0;
    }
}

class Skeleton extends Enemy {
    constructor(x, y) {
        super(x, y, 26, 42, { health: 3, speed: 1.2, range: 100, type: 'skeleton', scoreValue: 70, touchDamage: 1, aggroRange: 280 });
        this.shootCooldown = 80;
    }
    update(dt, game) {
        super.update(dt, game);
        if (this.shootCooldown > 0) this.shootCooldown--;
        const dx = game.player.cx - this.cx;
        const dy = game.player.cy - this.cy;
        if (this.state === 'chase' && this.shootCooldown <= 0 && Math.abs(dy) < 100 && Math.abs(dx) < 320) {
            const dir = dx > 0 ? 1 : -1;
            game.level.projectiles.push(new Projectile(this.cx + dir * 16, this.cy, dir * 4, -1, 'bone', 1, 200));
            this.shootCooldown = 110;
            game.sound.arrow();
        }
    }
    _drawSprite(ctx, w, h, t) {
        const swing = Math.sin(t * 8) * 0.4;
        ctx.fillStyle = COLORS.sandLight;
        ctx.save(); ctx.translate(w / 2 - 4, h - 18); ctx.rotate(swing * 0.5);
        ctx.fillRect(-2, 0, 4, 18); ctx.restore();
        ctx.save(); ctx.translate(w / 2 + 2, h - 18); ctx.rotate(-swing * 0.5);
        ctx.fillRect(-2, 0, 4, 18); ctx.restore();
        ctx.fillRect(w / 2 - 7, 12, 14, 18);
        ctx.fillStyle = COLORS.nightDeep;
        for (let i = 0; i < 3; i++) ctx.fillRect(w / 2 - 5, 15 + i * 4, 10, 1);
        ctx.fillStyle = COLORS.white;
        ctx.fillRect(w / 2 - 6, 0, 12, 12);
        ctx.fillStyle = COLORS.nightDeep;
        ctx.fillRect(w / 2 - 4, 4, 3, 3);
        ctx.fillRect(w / 2 + 1, 4, 3, 3);
        ctx.fillRect(w / 2 - 3, 9, 6, 2);
        ctx.fillStyle = COLORS.sandLight;
        ctx.save(); ctx.translate(w / 2 + 6, 16); ctx.rotate(swing * 0.3);
        ctx.fillRect(0, 0, 3, 14); ctx.restore();
    }
}

class Guardian extends Enemy {
    constructor(x, y) {
        super(x, y, 36, 50, { health: 6, speed: 1.0, range: 80, type: 'guardian', scoreValue: 120, touchDamage: 2, aggroRange: 260 });
    }
    _drawSprite(ctx, w, h, t) {
        const swing = Math.sin(t * 6) * 0.3;
        ctx.fillStyle = COLORS.goldDark;
        ctx.fillRect(w / 2 - 8, h - 18, 7, 18);
        ctx.save(); ctx.translate(w / 2 + 1, h - 18); ctx.rotate(swing * 0.4);
        ctx.fillRect(0, 0, 7, 18); ctx.restore();
        ctx.fillStyle = COLORS.gold;
        ctx.fillRect(w / 2 - 11, 12, 22, 24);
        ctx.fillStyle = COLORS.goldDark;
        ctx.fillRect(w / 2 - 11, 22, 22, 3);
        ctx.fillRect(w / 2 - 2, 12, 4, 24);
        ctx.fillRect(w / 2 - 8, 0, 16, 14);
        ctx.fillStyle = COLORS.goldDark;
        ctx.fillRect(w / 2 - 8, 10, 16, 2);
        ctx.fillStyle = COLORS.nightDeep;
        ctx.fillRect(w / 2 - 5, 5, 10, 2);
        ctx.fillStyle = '#d8d8e8';
        ctx.fillRect(w / 2 + 10, 6, 4, 30);
        ctx.fillStyle = COLORS.goldDark;
        ctx.fillRect(w / 2 + 8, 4, 8, 4);
    }
}

/* =========================================================
   10. PROJECTILES (os, flèches, orbes magiques)
   ========================================================= */
class Projectile extends Entity {
    constructor(x, y, vx, vy, kind, damage, life = 200) {
        super(x, y, 10, 10);
        this.vx = vx; this.vy = vy;
        this.kind = kind;
        this.damage = damage;
        this.life = life;
        this.gravity = (kind === 'bone') ? 0.18 : 0;
        this.rot = 0;
    }
    update(dt, game) {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += this.gravity;
        this.rot += 0.2;
        this.life--;
        if (this.life <= 0) this.dead = true;
        if (game.player.iframes <= 0 && game.player.state !== 'dead' && aabb(this, game.player.rect())) {
            game.player.takeDamage(this.damage, this, game);
            this.dead = true;
            game.particles.burst(this.cx, this.cy, 8, { color: [COLORS.gold, COLORS.white], glow: true });
        }
    }
    draw(ctx, cam) {
        const x = this.x - cam.x, y = this.y - cam.y;
        ctx.save();
        ctx.translate(x + this.w / 2, y + this.h / 2);
        ctx.rotate(this.rot);
        if (this.kind === 'bone') {
            ctx.fillStyle = COLORS.sandLight;
            ctx.fillRect(-6, -2, 12, 4);
            ctx.beginPath(); ctx.arc(-6, 0, 3, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(6, 0, 3, 0, Math.PI * 2); ctx.fill();
        } else if (this.kind === 'arrow') {
            ctx.fillStyle = COLORS.goldDark;
            ctx.fillRect(-8, -1, 14, 2);
            ctx.fillStyle = COLORS.gold;
            ctx.beginPath();
            ctx.moveTo(6, -4); ctx.lineTo(12, 0); ctx.lineTo(6, 4); ctx.fill();
        } else if (this.kind === 'orb') {
            ctx.shadowBlur = 14; ctx.shadowColor = COLORS.purple;
            ctx.fillStyle = COLORS.purple;
            ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = COLORS.turquoise;
            ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
        } else if (this.kind === 'sting') {
            ctx.fillStyle = COLORS.red;
            ctx.shadowBlur = 8; ctx.shadowColor = COLORS.red;
            ctx.beginPath();
            ctx.moveTo(-6, -3); ctx.lineTo(6, 0); ctx.lineTo(-6, 3); ctx.fill();
        } else if (this.kind === 'shock') {
            ctx.shadowBlur = 12; ctx.shadowColor = COLORS.gold;
            ctx.fillStyle = COLORS.goldLight;
            ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }
}
/* =========================================================
   11. BOSS — 3 boss distincts
   ========================================================= */
class Boss extends Entity {
    constructor(x, y, w, h, opts = {}) {
        super(x, y, w, h);
        this.maxHealth = opts.health ?? 30;
        this.health = this.maxHealth;
        this.damage = opts.damage ?? 1;
        this.name = opts.name ?? 'Boss';
        this.type = opts.type ?? 'scorpion';
        this.dir = -1;
        this.state = 'idle';
        this.animTime = 0;
        this.attackTimer = 0;
        this.attackCooldown = 120;
        this.currentAttack = null;
        this.deathTimer = 0;
        this.flashTimer = 0;
        this.invuln = 0;
        this.scoreValue = opts.scoreValue ?? 1000;
        this.phase = 1;
        this.bossActive = false;
        this.startX = x; this.startY = y;
    }

    activate(game) {
        this.bossActive = true;
        game.ui.showBossBar(this.name);
    }

    takeDamage(amount, dir, game) {
        if (this.state === 'dead' || this.invuln > 0) return;
        this.health -= amount;
        this.flashTimer = 6;
        game.sound.bossHit();
        game.particles.burst(this.cx, this.cy, 8, { color: [COLORS.gold, COLORS.white], minSpd: 2, maxSpd: 4, glow: true });
        const ratio = this.health / this.maxHealth;
        if (ratio < 0.5 && this.phase === 1) {
            this.phase = 2;
            this.invuln = 60;
            game.camera.shake(10, 0.5);
            game.particles.burst(this.cx, this.cy, 30, {
                color: [COLORS.red, COLORS.gold, COLORS.purple], minSpd: 3, maxSpd: 7, glow: true, upBias: 3
            });
        }
        if (this.health <= 0) this.die(game);
        game.ui.updateBossBar(this.health / this.maxHealth);
    }

    die(game) {
        this.state = 'dead';
        this.deathTimer = 120;
        game.sound.bossDeath();
        game.camera.shake(14, 0.8);
        game.particles.burst(this.cx, this.cy, 50, {
            color: [COLORS.gold, COLORS.red, COLORS.purple, COLORS.white], minSpd: 3, maxSpd: 8, glow: true, upBias: 4
        });
        game.player.score += this.scoreValue;
        game.spawnScorePopup(this.cx, this.cy, '+' + this.scoreValue);
        game.bossesDefeated++;
        game.ui.hideBossBar();
    }

    update(dt, game) {
        this.animTime += dt;
        if (this.flashTimer > 0) this.flashTimer--;
        if (this.invuln > 0) this.invuln--;

        if (this.state === 'dead') {
            this.deathTimer--;
            if (this.deathTimer % 8 === 0) {
                game.sound.explosion();
                const ex = this.cx + rand(-this.w / 2, this.w / 2);
                const ey = this.cy + rand(-this.h / 2, this.h / 2);
                game.particles.burst(ex, ey, 16, {
                    color: [COLORS.lava, COLORS.gold, COLORS.red], minSpd: 2, maxSpd: 6, glow: true, upBias: 2
                });
                game.camera.shake(6, 0.2);
            }
            if (this.deathTimer <= 0) { this.dead = true; game.onBossDefeated(); }
            return;
        }

        if (!this.bossActive) return;
        if (this.attackCooldown > 0) this.attackCooldown--;
        if (this.attackTimer > 0) this.attackTimer--;
        this._ai(dt, game);

        if (aabb(this, game.player.rect()) && game.player.iframes <= 0 && game.player.state !== 'dead') {
            game.player.takeDamage(this.damage, this, game);
        }

        if (this.type !== 'genie') {
            this.vy += GRAVITY;
            if (this.vy > MAX_FALL) this.vy = MAX_FALL;
        }
        // Note : x et y sont appliqués dans CollisionManager.resolveBoss
    }

    _ai(dt, game) {}
}

/* ---- Boss 1 : Grand Scorpion Royal ---- */
class ScorpionBoss extends Boss {
    constructor(x, y) {
        super(x, y, 90, 60, {
            health: 30, damage: 1, name: 'Grand Scorpion Royal',
            type: 'scorpion', scoreValue: 1000
        });
        this.patrolMin = x - 200;
        this.patrolMax = x + 200;
    }
    _ai(dt, game) {
        const p = game.player;
        const dx = p.cx - this.cx;
        this.dir = dx > 0 ? 1 : -1;

        if (this.attackTimer <= 0 && this.attackCooldown <= 0) {
            const r = Math.random();
            if (this.phase === 2 && r < 0.35) {
                this.currentAttack = 'summon';
                this.attackTimer = 60;
                this.attackCooldown = 180;
                for (let i = 0; i < 2; i++) {
                    const sx = this.cx + rand(-40, 40);
                    const sy = this.y + this.h - 20;
                    game.level.enemies.push(new Scorpion(sx, sy));
                    game.particles.burst(sx, sy, 10, { color: [COLORS.purple, COLORS.gold], glow: true });
                }
            } else if (r < 0.55) {
                this.currentAttack = 'sting';
                this.attackTimer = 40;
                this.attackCooldown = 140;
                for (let i = -1; i <= 1; i++) {
                    const dir = this.dir;
                    game.level.projectiles.push(new Projectile(
                        this.cx + dir * 30, this.cy - 10,
                        dir * 5 + i * 1.5, -2 + i, 'sting', 1, 180
                    ));
                }
                game.sound.arrow();
            } else {
                this.currentAttack = 'charge';
                this.attackTimer = 50;
                this.attackCooldown = 130;
                this.vx = this.dir * 6;
            }
        }

        if (this.currentAttack === 'charge' && this.attackTimer > 0) {
            this.vx = this.dir * 6;
        } else if (this.attackTimer <= 0) {
            this.vx = this.dir * 1.5;
            this.currentAttack = null;
        }
    }
    draw(ctx, cam) {
        const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
        const w = this.w, h = this.h, t = this.animTime;
        ctx.save();
        if (this.dir === -1) { ctx.translate(x + w, y); ctx.scale(-1, 1); }
        else ctx.translate(x, y);
        if (this.flashTimer > 0) ctx.globalAlpha = 0.6;
        if (this.state === 'dead') ctx.globalAlpha = clamp(this.deathTimer / 120, 0, 1);

        ctx.fillStyle = COLORS.purpleDeep;
        ctx.fillRect(20, 20, w - 30, h - 30);
        ctx.fillStyle = COLORS.purple;
        ctx.fillRect(0, 14, 28, 32);
        ctx.fillStyle = COLORS.gold;
        ctx.fillRect(-20, 10, 22, 12);
        ctx.fillRect(-20, 36, 22, 12);
        ctx.fillStyle = COLORS.goldDark;
        ctx.fillRect(-22, 14, 6, 6);
        ctx.fillRect(-22, 38, 6, 6);
        ctx.fillStyle = COLORS.purpleDeep;
        for (let i = 0; i < 4; i++) {
            ctx.save();
            ctx.translate(24 + i * 12, h - 8);
            ctx.rotate(Math.sin(t * 6 + i) * 0.3);
            ctx.fillRect(-1, 0, 2, 10);
            ctx.restore();
        }
        ctx.strokeStyle = COLORS.purple;
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.moveTo(w - 20, 30);
        ctx.quadraticCurveTo(w + 20, 0, w - 10, -30);
        ctx.stroke();
        ctx.fillStyle = COLORS.red;
        ctx.shadowBlur = 10; ctx.shadowColor = COLORS.red;
        ctx.beginPath();
        ctx.moveTo(w - 14, -34);
        ctx.lineTo(w - 6, -24);
        ctx.lineTo(w - 22, -24);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = COLORS.gold;
        ctx.shadowBlur = 6; ctx.shadowColor = COLORS.gold;
        ctx.fillRect(6, 22, 4, 4);
        ctx.fillRect(14, 22, 4, 4);
        ctx.shadowBlur = 0;
        ctx.fillStyle = COLORS.gold;
        ctx.fillRect(4, 8, 20, 4);
        ctx.fillRect(6, 4, 3, 4);
        ctx.fillRect(13, 4, 3, 4);
        ctx.fillRect(20, 4, 3, 4);
        ctx.restore();
    }
}

/* ---- Boss 2 : Génie Corrompu (volant) ---- */
class GenieBoss extends Boss {
    constructor(x, y) {
        super(x, y, 70, 80, {
            health: 40, damage: 1, name: 'Génie Corrompu',
            type: 'genie', scoreValue: 1500
        });
        this.baseY = y;
        this.teleportTimer = 0;
        this.targetX = x; this.targetY = y;
    }
    _ai(dt, game) {
        const p = game.player;
        this.dir = p.cx > this.cx ? 1 : -1;
        this.y = this.baseY + Math.sin(this.animTime * 1.5) * 20;

        if (this.teleportTimer > 0) {
            this.teleportTimer--;
            if (this.teleportTimer === 0) {
                this.targetX = clamp(p.cx + (Math.random() < 0.5 ? -250 : 250), 100, game.level.width - 100);
                this.targetY = this.baseY + rand(-40, 40);
                this.x = this.targetX;
                this.y = this.targetY;
                this.invuln = 0;
                game.particles.burst(this.x, this.y, 24, {
                    color: [COLORS.purple, COLORS.turquoise], glow: true, minSpd: 2, maxSpd: 5
                });
            }
            return;
        }

        if (this.attackTimer <= 0 && this.attackCooldown <= 0) {
            const r = Math.random();
            if (this.phase === 2 && r < 0.4) {
                this.currentAttack = 'teleport';
                this.attackTimer = 30;
                this.attackCooldown = 120;
                this.teleportTimer = 30;
                this.invuln = 30;
                game.particles.burst(this.cx, this.cy, 24, {
                    color: [COLORS.purple, COLORS.white], glow: true, minSpd: 2, maxSpd: 5
                });
            } else if (r < 0.7) {
                this.currentAttack = 'orbs';
                this.attackTimer = 30;
                this.attackCooldown = 100;
                const count = this.phase === 2 ? 5 : 3;
                for (let i = 0; i < count; i++) {
                    const dx = p.cx - this.cx;
                    const dy = p.cy - this.cy;
                    const baseAng = Math.atan2(dy, dx);
                    const a = baseAng + (i - (count - 1) / 2) * 0.25;
                    game.level.projectiles.push(new Projectile(
                        this.cx, this.cy, Math.cos(a) * 4, Math.sin(a) * 4, 'orb', 1, 200
                    ));
                }
                game.sound.arrow();
            } else {
                this.currentAttack = 'dive';
                this.attackTimer = 50;
                this.attackCooldown = 130;
                this.vy = 6;
            }
        }

        if (this.currentAttack === 'dive' && this.attackTimer > 0) {
            this.vy = 6;
            if (this.attackTimer < 20) this.vy = -6;
        } else if (this.attackTimer <= 0) {
            this.vy = 0;
            this.currentAttack = null;
        }

        this.x += (p.cx - this.cx) * 0.005;
    }
    draw(ctx, cam) {
        const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
        const w = this.w, h = this.h, t = this.animTime;
        ctx.save();
        if (this.dir === -1) { ctx.translate(x + w, y); ctx.scale(-1, 1); }
        else ctx.translate(x, y);
        if (this.flashTimer > 0) ctx.globalAlpha = 0.6;
        if (this.state === 'dead') ctx.globalAlpha = clamp(this.deathTimer / 120, 0, 1);

        ctx.shadowBlur = 18; ctx.shadowColor = COLORS.purple;
        ctx.fillStyle = COLORS.purpleDeep;
        ctx.beginPath();
        ctx.ellipse(w / 2, h - 18, w / 2 - 4, 16, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = COLORS.purple;
        ctx.fillRect(w / 2 - 16, 20, 32, 30);
        ctx.fillStyle = COLORS.gold;
        ctx.fillRect(w / 2 - 18, 38, 36, 4);
        ctx.fillStyle = COLORS.turquoiseDk;
        ctx.fillRect(w / 2 - 14, 0, 28, 24);
        ctx.fillStyle = COLORS.purple;
        ctx.fillRect(w / 2 - 16, -4, 32, 10);
        ctx.fillStyle = COLORS.gold;
        ctx.fillRect(w / 2 - 16, 4, 32, 2);
        ctx.fillStyle = COLORS.red;
        ctx.shadowBlur = 10; ctx.shadowColor = COLORS.red;
        ctx.fillRect(w / 2 - 8, 10, 5, 4);
        ctx.fillRect(w / 2 + 3, 10, 5, 4);
        ctx.shadowBlur = 0;
        ctx.fillStyle = COLORS.night;
        ctx.fillRect(w / 2 - 8, 18, 16, 6);
        ctx.fillStyle = COLORS.turquoiseDk;
        const armAng = Math.sin(t * 3) * 0.3;
        ctx.save(); ctx.translate(w / 2 - 14, 26); ctx.rotate(-armAng);
        ctx.fillRect(-12, 0, 14, 6); ctx.restore();
        ctx.save(); ctx.translate(w / 2 + 14, 26); ctx.rotate(armAng);
        ctx.fillRect(-2, 0, 14, 6); ctx.restore();
        ctx.fillStyle = COLORS.purple;
        ctx.globalAlpha *= 0.7;
        ctx.beginPath();
        ctx.moveTo(w / 2 - 12, h - 12);
        ctx.quadraticCurveTo(w / 2, h + 12, w / 2 + 12, h - 6);
        ctx.quadraticCurveTo(w / 2 + 4, h, w / 2 - 12, h - 12);
        ctx.fill();
        ctx.restore();
    }
}

/* ---- Boss 3 : Gardien du Trésor ---- */
class TreasureGuardianBoss extends Boss {
    constructor(x, y) {
        super(x, y, 80, 90, {
            health: 50, damage: 2, name: 'Gardien du Trésor',
            type: 'guardian', scoreValue: 2500
        });
        this.patrolMin = x - 220;
        this.patrolMax = x + 220;
        this.slamTimer = 0;
    }
    _ai(dt, game) {
        const p = game.player;
        const dx = p.cx - this.cx;
        this.dir = dx > 0 ? 1 : -1;

        if (this.attackTimer <= 0 && this.attackCooldown <= 0) {
            const r = Math.random();
            if (r < 0.35) {
                this.currentAttack = 'charge';
                this.attackTimer = 60;
                this.attackCooldown = 120;
                this.vx = this.dir * 7;
            } else if (r < 0.7) {
                this.currentAttack = 'slash';
                this.attackTimer = 35;
                this.attackCooldown = 100;
            } else {
                this.currentAttack = 'slam';
                this.attackTimer = 50;
                this.attackCooldown = 150;
                this.slamTimer = 25;
            }
        }

        if (this.currentAttack === 'charge' && this.attackTimer > 0) {
            this.vx = this.dir * 7;
        } else if (this.currentAttack === 'slam' && this.attackTimer > 0) {
            this.vx = 0;
            if (this.slamTimer > 0) {
                this.slamTimer--;
                if (this.slamTimer === 0) {
                    for (let i = 0; i < 2; i++) {
                        const dir = i === 0 ? -1 : 1;
                        game.level.projectiles.push(new Projectile(
                            this.cx + dir * 30, this.y + this.h - 20,
                            dir * 5, 0, 'shock', 1, 100
                        ));
                    }
                    game.camera.shake(12, 0.4);
                    game.sound.explosion();
                }
            }
        } else if (this.attackTimer <= 0) {
            this.vx = this.dir * 1.2;
            this.currentAttack = null;
        }
    }
    draw(ctx, cam) {
        const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
        const w = this.w, h = this.h, t = this.animTime;
        ctx.save();
        if (this.dir === -1) { ctx.translate(x + w, y); ctx.scale(-1, 1); }
        else ctx.translate(x, y);
        if (this.flashTimer > 0) ctx.globalAlpha = 0.6;
        if (this.state === 'dead') ctx.globalAlpha = clamp(this.deathTimer / 120, 0, 1);

        ctx.shadowBlur = 14; ctx.shadowColor = COLORS.gold;
        ctx.fillStyle = COLORS.goldDark;
        ctx.fillRect(w / 2 - 22, h - 30, 18, 30);
        ctx.fillRect(w / 2 + 4, h - 30, 18, 30);
        ctx.fillStyle = COLORS.gold;
        ctx.fillRect(w / 2 - 28, 20, 56, 50);
        ctx.fillStyle = COLORS.goldDark;
        ctx.fillRect(w / 2 - 28, 38, 56, 4);
        ctx.fillRect(w / 2 - 4, 20, 8, 50);
        ctx.fillStyle = COLORS.red;
        ctx.shadowBlur = 12; ctx.shadowColor = COLORS.red;
        ctx.beginPath(); ctx.arc(w / 2, 36, 5, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 14; ctx.shadowColor = COLORS.gold;
        ctx.fillStyle = COLORS.gold;
        ctx.fillRect(w / 2 - 34, 22, 8, 18);
        ctx.fillRect(w / 2 + 26, 22, 8, 18);
        ctx.fillRect(w / 2 - 18, 0, 36, 22);
        ctx.fillStyle = COLORS.goldDark;
        ctx.fillRect(w / 2 - 18, 16, 36, 3);
        ctx.beginPath();
        ctx.moveTo(w / 2 - 18, 0); ctx.lineTo(w / 2 - 28, -10); ctx.lineTo(w / 2 - 14, 0); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(w / 2 + 18, 0); ctx.lineTo(w / 2 + 28, -10); ctx.lineTo(w / 2 + 14, 0); ctx.fill();
        ctx.fillStyle = COLORS.nightDeep;
        ctx.fillRect(w / 2 - 12, 8, 24, 3);
        ctx.fillStyle = COLORS.red;
        ctx.shadowBlur = 8; ctx.shadowColor = COLORS.red;
        ctx.fillRect(w / 2 - 8, 8, 4, 3);
        ctx.fillRect(w / 2 + 4, 8, 4, 3);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#d8d8e8';
        const swing = this.currentAttack === 'slash' ? Math.sin((35 - this.attackTimer) / 35 * Math.PI) * 1.5 : 0;
        ctx.save();
        ctx.translate(w / 2 + 28, 30);
        ctx.rotate(-0.3 + swing);
        ctx.fillRect(0, 0, 8, 50);
        ctx.fillStyle = COLORS.goldDark;
        ctx.fillRect(-4, 0, 16, 6);
        ctx.restore();
        ctx.restore();
    }
}
/* =========================================================
   12. OBJETS À RAMASSER
   ========================================================= */
class Pickup extends Entity {
    constructor(x, y, kind) {
        const sizes = { coin: 16, fruit: 18, potion: 20, diamond: 18, key: 18 };
        super(x, y, sizes[kind] || 16, sizes[kind] || 16);
        this.kind = kind;
        this.animTime = Math.random() * 6;
        this.baseY = y;
        this.collected = false;
    }
    update(dt, game) {
        this.animTime += dt;
        this.y = this.baseY + Math.sin(this.animTime * 3) * 3;
        if (aabb(this, game.player.rect()) && game.player.state !== 'dead') {
            this._collect(game);
            this.dead = true;
        }
    }
    _collect(game) {
        const p = game.player;
        switch (this.kind) {
            case 'coin':
                p.coins++; p.score += 10; game.sound.coin();
                game.spawnScorePopup(this.cx, this.cy, '+10');
                break;
            case 'fruit':
                p.energy = clamp(p.energy + 30, 0, p.maxEnergy); p.score += 20; game.sound.fruit();
                game.spawnScorePopup(this.cx, this.cy, '+énergie');
                break;
            case 'potion':
                p.health = clamp(p.health + 1, 0, p.maxHealth); p.score += 50; game.sound.potion();
                game.spawnScorePopup(this.cx, this.cy, '+1 vie');
                break;
            case 'diamond':
                p.score += 200; game.sound.diamond();
                game.spawnScorePopup(this.cx, this.cy, '+200');
                game.particles.burst(this.cx, this.cy, 16, { color: [COLORS.turquoise, COLORS.gold], glow: true });
                break;
            case 'key':
                p.keys++; game.sound.key();
                game.spawnScorePopup(this.cx, this.cy, '🔑 clé');
                break;
        }
        game.particles.burst(this.cx, this.cy, 6, {
            color: [COLORS.gold, COLORS.white], minSpd: 1, maxSpd: 3, glow: true
        });
    }
    draw(ctx, cam) {
        const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
        const w = this.w, h = this.h, t = this.animTime;
        ctx.save();
        ctx.translate(x + w / 2, y + h / 2);
        const glowColors = { coin: COLORS.gold, fruit: COLORS.red, potion: COLORS.purple, diamond: COLORS.turquoise, key: COLORS.gold };
        ctx.shadowBlur = 10;
        ctx.shadowColor = glowColors[this.kind] || COLORS.gold;

        if (this.kind === 'coin') {
            const r = w / 2 - 1;
            const sq = Math.abs(Math.sin(t * 3));
            ctx.fillStyle = COLORS.gold;
            ctx.beginPath(); ctx.ellipse(0, 0, r * (0.4 + sq * 0.6), r, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = COLORS.goldDark;
            ctx.fillRect(-1, -3, 2, 6);
        } else if (this.kind === 'fruit') {
            ctx.fillStyle = COLORS.red;
            ctx.beginPath(); ctx.arc(0, 1, w / 2 - 2, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = COLORS.lavaGlow;
            ctx.fillRect(-3, -2, 3, 3);
            ctx.strokeStyle = COLORS.sandDark;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(0, -w / 2); ctx.lineTo(2, -w / 2 - 4); ctx.stroke();
        } else if (this.kind === 'potion') {
            ctx.fillStyle = COLORS.purple;
            ctx.fillRect(-w / 4, -2, w / 2, h / 2 + 2);
            ctx.fillStyle = COLORS.purpleDeep;
            ctx.fillRect(-w / 4, h / 4, w / 2, h / 4);
            ctx.fillStyle = COLORS.goldDark;
            ctx.fillRect(-3, -h / 2, 6, 4);
            ctx.fillStyle = COLORS.gold;
            ctx.fillRect(-4, -h / 2 + 4, 8, 2);
        } else if (this.kind === 'diamond') {
            ctx.fillStyle = COLORS.turquoise;
            ctx.beginPath();
            ctx.moveTo(0, -h / 2); ctx.lineTo(w / 2, 0); ctx.lineTo(0, h / 2); ctx.lineTo(-w / 2, 0);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = COLORS.goldLight;
            ctx.beginPath();
            ctx.moveTo(0, -h / 2 + 2); ctx.lineTo(w / 4, -2); ctx.lineTo(0, 0); ctx.lineTo(-w / 4, -2);
            ctx.closePath(); ctx.fill();
        } else if (this.kind === 'key') {
            ctx.fillStyle = COLORS.gold;
            ctx.beginPath(); ctx.arc(-w / 4, 0, 5, 0, Math.PI * 2); ctx.fill();
            ctx.fillRect(-w / 4 + 3, -2, w - 4, 4);
            ctx.fillRect(w / 4, 0, 2, 5);
            ctx.fillRect(w / 4 + 4, 0, 2, 5);
            ctx.fillStyle = COLORS.nightDeep;
            ctx.beginPath(); ctx.arc(-w / 4, 0, 2, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }
}

/* ---- Coffre au trésor ---- */
class Chest extends Entity {
    constructor(x, y, isFinal = false) {
        super(x, y, 40, 32);
        this.opened = false;
        this.openTimer = 0;
        this.isFinal = isFinal;
        this.requiresKey = !isFinal;
        this.animTime = 0;
    }
    update(dt, game) {
        this.animTime += dt;
        if (this.opened) {
            this.openTimer += dt;
            if (this.openTimer > 1.2 && this.isFinal) {
                game.onVictory();
                this.openTimer = -9999;
            }
            return;
        }
        if (aabb(this, game.player.rect()) && game.player.state !== 'dead') {
            if (this.requiresKey && game.player.keys < 1) return;
            if (this.requiresKey) game.player.keys--;
            this.opened = true;
            game.sound.chestOpen();
            game.particles.burst(this.cx, this.cy, 20, {
                color: [COLORS.gold, COLORS.goldLight, COLORS.white], minSpd: 2, maxSpd: 5, glow: true, upBias: 3
            });
            if (!this.isFinal) {
                for (let i = 0; i < 5; i++) {
                    game.level.spawnPickup(this.cx + rand(-20, 20), this.cy, 'coin');
                }
                if (Math.random() < 0.5) game.level.spawnPickup(this.cx, this.cy, 'diamond');
                game.spawnScorePopup(this.cx, this.cy, 'Coffre ouvert !');
                game.player.score += 100;
            }
        }
    }
    draw(ctx, cam) {
        const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
        const w = this.w, h = this.h;
        ctx.save();
        ctx.translate(x, y);
        if (!this.opened) {
            ctx.shadowBlur = 12 + Math.sin(this.animTime * 4) * 4;
            ctx.shadowColor = this.isFinal ? COLORS.gold : COLORS.turquoise;
        }
        ctx.fillStyle = COLORS.goldDark;
        ctx.fillRect(0, 10, w, h - 10);
        ctx.fillStyle = COLORS.gold;
        ctx.fillRect(2, 12, w - 4, h - 14);
        ctx.save();
        ctx.translate(w / 2, 10);
        if (this.opened) {
            const angle = clamp(this.openTimer * 4, 0, -1.2);
            ctx.rotate(angle);
        } else {
            ctx.rotate(0);
        }
        ctx.fillStyle = COLORS.gold;
        ctx.fillRect(-w / 2, -10, w, 12);
        ctx.fillStyle = COLORS.goldDark;
        ctx.fillRect(-w / 2, -10, w, 3);
        ctx.fillRect(-w / 2, -1, w, 3);
        ctx.restore();
        if (!this.opened) {
            ctx.fillStyle = COLORS.goldDark;
            ctx.fillRect(w / 2 - 4, 14, 8, 8);
            ctx.fillStyle = COLORS.nightDeep;
            ctx.fillRect(w / 2 - 1, 17, 2, 3);
        }
        if (this.isFinal && this.opened) {
            ctx.globalAlpha = clamp(this.openTimer * 0.8, 0, 1);
            ctx.fillStyle = COLORS.goldLight;
            for (let i = 0; i < 8; i++) {
                ctx.save();
                ctx.translate(w / 2, 8);
                ctx.rotate(i * Math.PI / 4 + this.animTime);
                ctx.beginPath();
                ctx.moveTo(0, 0); ctx.lineTo(60, -6); ctx.lineTo(60, 6); ctx.fill();
                ctx.restore();
            }
            ctx.globalAlpha = 1;
        }
        ctx.restore();
    }
}

/* =========================================================
   13. PIÈGES
   ========================================================= */
class Trap extends Entity {
    constructor(x, y, w, h, kind) {
        super(x, y, w, h);
        this.kind = kind;
        this.animTime = Math.random() * 6;
        this.cycle = 0;
    }
    update(dt, game) {
        this.animTime += dt;
        if (aabb(this, game.player.rect()) && game.player.state !== 'dead') {
            if (this.kind === 'lava') {
                game.player.takeDamage(2, null, game);
                game.player.vy = -10;
            } else if (this.kind === 'spikes' || this.kind === 'saw' || this.kind === 'fire') {
                game.player.takeDamage(1, null, game);
                game.player.vy = -8;
            } else if (this.kind === 'quicksand') {
                game.player.vx *= 0.4;
                if (game.player.y > this.y - 4) {
                    game.player.y = this.y - 4;
                    if (Math.random() < 0.05) game.player.takeDamage(1, null, game);
                }
            }
        }
    }
    draw(ctx, cam) {
        const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
        const w = this.w, h = this.h, t = this.animTime;
        ctx.save();
        ctx.translate(x, y);

        if (this.kind === 'spikes') {
            ctx.fillStyle = '#d8d8e8';
            const n = Math.floor(w / 10);
            for (let i = 0; i < n; i++) {
                ctx.beginPath();
                ctx.moveTo(i * 10, h);
                ctx.lineTo(i * 10 + 5, 0);
                ctx.lineTo(i * 10 + 10, h);
                ctx.fill();
            }
            ctx.fillStyle = COLORS.goldDark;
            ctx.fillRect(0, h - 3, w, 3);
        } else if (this.kind === 'lava') {
            ctx.fillStyle = COLORS.redDark;
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = COLORS.lava;
            ctx.beginPath();
            ctx.moveTo(0, 6);
            for (let i = 0; i <= w; i += 8) ctx.lineTo(i, 6 + Math.sin(t * 4 + i * 0.2) * 3);
            ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();
            ctx.fillStyle = COLORS.lavaGlow;
            ctx.shadowBlur = 10; ctx.shadowColor = COLORS.lava;
            ctx.beginPath();
            ctx.moveTo(0, 10);
            for (let i = 0; i <= w; i += 8) ctx.lineTo(i, 10 + Math.sin(t * 4 + i * 0.2) * 3);
            ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();
            ctx.shadowBlur = 0;
        } else if (this.kind === 'saw') {
            const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2;
            ctx.translate(cx, cy);
            ctx.rotate(t * 8);
            ctx.fillStyle = '#c0c0c0';
            ctx.beginPath();
            for (let i = 0; i < 12; i++) {
                const a = i * Math.PI / 6;
                ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
                ctx.lineTo(Math.cos(a + 0.1) * (r - 5), Math.sin(a + 0.1) * (r - 5));
            }
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = COLORS.goldDark;
            ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
        } else if (this.kind === 'fire') {
            const flick = Math.sin(t * 10);
            ctx.fillStyle = COLORS.redDark;
            ctx.fillRect(0, h - 4, w, 4);
            ctx.fillStyle = COLORS.lava;
            ctx.beginPath();
            ctx.moveTo(0, h);
            for (let i = 0; i <= w; i += 4) ctx.lineTo(i, h - 10 - Math.abs(Math.sin(t * 6 + i * 0.4)) * 14 - flick * 2);
            ctx.lineTo(w, h); ctx.fill();
            ctx.fillStyle = COLORS.lavaGlow;
            ctx.shadowBlur = 8; ctx.shadowColor = COLORS.lava;
            ctx.beginPath();
            ctx.moveTo(2, h);
            for (let i = 2; i <= w - 2; i += 4) ctx.lineTo(i, h - 6 - Math.abs(Math.sin(t * 6 + i * 0.4)) * 8);
            ctx.lineTo(w - 2, h); ctx.fill();
            ctx.shadowBlur = 0;
        } else if (this.kind === 'quicksand') {
            ctx.fillStyle = COLORS.sandDark;
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = COLORS.sand;
            for (let i = 0; i < w; i += 6) {
                ctx.beginPath();
                ctx.arc(i, 4 + Math.sin(t * 2 + i) * 1.5, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }
}

/* ---- Piège à flèches ---- */
class ArrowTrap extends Entity {
    constructor(x, y, dir, period = 180) {
        super(x, y, 20, 20);
        this.dir = dir;
        this.period = period;
        this.timer = period;
    }
    update(dt, game) {
        this.timer--;
        if (this.timer <= 0) {
            this.timer = this.period;
            game.level.projectiles.push(new Projectile(
                this.x + (this.dir === 1 ? this.w : 0),
                this.y + 6,
                this.dir * 5, 0, 'arrow', 1, 200
            ));
            game.sound.arrow();
        }
    }
    draw(ctx, cam) {
        const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
        ctx.save();
        ctx.translate(x, y);
        ctx.fillStyle = COLORS.sandDark;
        ctx.fillRect(0, 0, this.w, this.h);
        ctx.fillStyle = COLORS.goldDark;
        if (this.dir === 1) ctx.fillRect(this.w - 6, 4, 6, 12);
        else ctx.fillRect(0, 4, 6, 12);
        const ratio = 1 - this.timer / this.period;
        ctx.fillStyle = COLORS.red;
        ctx.fillRect(2, this.h - 4, (this.w - 4) * ratio, 2);
        ctx.restore();
    }
}

/* ---- Plateforme mouvante ---- */
class MovingPlatform extends Entity {
    constructor(x, y, w, h, x2, y2, speed = 1) {
        super(x, y, w, h);
        this.startX = x; this.startY = y;
        this.endX = x2; this.endY = y2;
        this.t = 0;
        this.speed = speed;
        this.dir = 1;
        this.carried = null;
    }
    update(dt, game) {
        this.t += this.speed * this.dir;
        if (this.t >= 100) { this.t = 100; this.dir = -1; }
        if (this.t <= 0)   { this.t = 0;   this.dir = 1; }
        const px = lerp(this.startX, this.endX, this.t / 100);
        const py = lerp(this.startY, this.endY, this.t / 100);
        const dx = px - this.x;
        const dy = py - this.y;
        if (this.carried && game.player.onGround) {
            game.player.x += dx;
            game.player.y += dy;
        }
        this.x = px; this.y = py;
        this.carried = null;
    }
    draw(ctx, cam) {
        const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
        ctx.save();
        ctx.translate(x, y);
        ctx.fillStyle = COLORS.goldDark;
        ctx.fillRect(0, 0, this.w, this.h);
        ctx.fillStyle = COLORS.gold;
        ctx.fillRect(2, 2, this.w - 4, this.h - 4);
        ctx.fillStyle = COLORS.goldDark;
        ctx.fillRect(0, 0, 4, this.h);
        ctx.fillRect(this.w - 4, 0, 4, this.h);
        ctx.restore();
    }
}

/* =========================================================
   14. PLATEFORME
   ========================================================= */
class Platform {
    constructor(x, y, w, h, kind = 'solid') {
        this.x = x; this.y = y; this.w = w; this.h = h;
        this.kind = kind;
    }
    draw(ctx, cam, theme) {
        if (this.kind === 'decoration') return;
        const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
        const w = this.w, h = this.h;
        ctx.save();
        const colors = {
            desert: { top: COLORS.sandLight, mid: COLORS.sand, dark: COLORS.sandDark },
            palace: { top: COLORS.turquoise, mid: COLORS.turquoiseDk, dark: COLORS.purpleDeep },
            ruins:  { top: '#5a4a7a', mid: '#3a2a5a', dark: COLORS.nightDeep }
        };
        const c = colors[theme] || colors.desert;
        ctx.fillStyle = c.dark;
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = c.mid;
        ctx.fillRect(x, y, w, h - 4);
        ctx.fillStyle = c.top;
        ctx.fillRect(x, y, w, 6);
        ctx.fillStyle = c.dark;
        if (this.kind === 'ground' || h > 30) {
            for (let i = 0; i < w; i += 32) ctx.fillRect(x + i, y + 8, 1, h - 8);
            for (let j = 12; j < h; j += 24) ctx.fillRect(x, y + j, w, 1);
        }
        ctx.fillStyle = COLORS.goldDark;
        ctx.fillRect(x, y, 2, 6);
        ctx.fillRect(x + w - 2, y, 2, 6);
        ctx.restore();
    }
}

/* ---- Porte verrouillée ---- */
class Door extends Entity {
    constructor(x, y) {
        super(x, y, 30, 60);
        this.opened = false;
        this.animTime = 0;
    }
    update(dt, game) {
        this.animTime += dt;
        if (this.opened) return;
        if (aabb(this, game.player.rect()) && game.player.keys > 0) {
            game.player.keys--;
            this.opened = true;
            game.sound.key();
            game.particles.burst(this.cx, this.cy, 12, { color: [COLORS.gold, COLORS.white], glow: true });
        }
    }
    isSolid() { return !this.opened; }
    draw(ctx, cam) {
        if (this.opened) {
            const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
            ctx.save();
            ctx.fillStyle = COLORS.goldDark;
            ctx.fillRect(x, y, 4, this.h);
            ctx.fillRect(x + this.w - 4, y, 4, this.h);
            ctx.fillRect(x, y, this.w, 4);
            ctx.restore();
            return;
        }
        const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
        ctx.save();
        ctx.translate(x, y);
        ctx.fillStyle = COLORS.purpleDeep;
        ctx.fillRect(0, 0, this.w, this.h);
        ctx.fillStyle = COLORS.purple;
        ctx.fillRect(2, 2, this.w - 4, this.h - 4);
        ctx.fillStyle = COLORS.gold;
        ctx.fillRect(4, 6, this.w - 8, 3);
        ctx.fillRect(4, this.h - 10, this.w - 8, 3);
        ctx.fillStyle = COLORS.gold;
        ctx.beginPath(); ctx.arc(this.w / 2, this.h / 2, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = COLORS.nightDeep;
        ctx.beginPath(); ctx.arc(this.w / 2, this.h / 2, 2, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 8 + Math.sin(this.animTime * 4) * 3;
        ctx.shadowColor = COLORS.gold;
        ctx.restore();
    }
}
/* =========================================================
   15. NIVEAU
   ========================================================= */
class Level {
    constructor(data) {
        this.name = data.name;
        this.theme = data.theme;
        this.width = data.width;
        this.height = data.height;
        this.timeLimit = data.timeLimit;
        this.platforms = data.platforms.map(p => new Platform(p.x, p.y, p.w, p.h, p.kind || 'solid'));
        this.doors = (data.doors || []).map(d => new Door(d.x, d.y));
        this.enemies = [];
        this.items = [];
        this.traps = [];
        this.projectiles = [];
        this.movingPlatforms = [];
        this.arrowTraps = [];
        this.boss = null;
        this.finalChest = null;
        this.checkpoint = data.playerStart;
        this.bgLayers = data.bgLayers || [];
        this.deco = data.deco || [];
        for (const e of (data.enemies || [])) {
            const cls = { bandit: Bandit, mummy: Mummy, scorpion: Scorpion, bat: Bat, skeleton: Skeleton, guardian: Guardian }[e.type];
            if (cls) this.enemies.push(new cls(e.x, e.y));
        }
        for (const i of (data.items || [])) this.items.push(new Pickup(i.x, i.y, i.kind));
        for (const t of (data.traps || [])) this.traps.push(new Trap(t.x, t.y, t.w, t.h, t.kind));
        for (const m of (data.movingPlatforms || [])) this.movingPlatforms.push(new MovingPlatform(m.x, m.y, m.w, m.h, m.x2, m.y2, m.speed || 1));
        for (const a of (data.arrowTraps || [])) this.arrowTraps.push(new ArrowTrap(a.x, a.y, a.dir, a.period || 180));
        this.chests = (data.chests || []).map(c => new Chest(c.x, c.y, false));
        if (data.boss) {
            const cls = { scorpion: ScorpionBoss, genie: GenieBoss, guardian: TreasureGuardianBoss }[data.boss.type];
            if (cls) this.boss = new cls(data.boss.x, data.boss.y);
        }
        if (data.finalChest) this.finalChest = new Chest(data.finalChest.x, data.finalChest.y, true);
    }

    spawnPickup(x, y, kind) {
        const p = new Pickup(x, y, kind);
        p.baseY = y;
        this.items.push(p);
    }

    getSolids() {
        const solids = this.platforms.slice();
        for (const d of this.doors) if (d.isSolid()) solids.push(d);
        for (const m of this.movingPlatforms) solids.push(m);
        return solids;
    }

    update(dt, game) {
        for (const e of this.enemies) e.update(dt, game);
        this.enemies = this.enemies.filter(e => !e.dead);
        for (const it of this.items) it.update(dt, game);
        this.items = this.items.filter(i => !i.dead);
        for (const t of this.traps) t.update(dt, game);
        for (const m of this.movingPlatforms) m.update(dt, game);
        for (const a of this.arrowTraps) a.update(dt, game);
        for (const p of this.projectiles) p.update(dt, game);
        this.projectiles = this.projectiles.filter(p => !p.dead);
        for (const c of this.chests) c.update(dt, game);
        if (this.finalChest) this.finalChest.update(dt, game);
        if (this.boss) {
            this.boss.update(dt, game);
            if (!this.boss.bossActive && !this.boss.dead) {
                const dx = Math.abs(this.boss.cx - game.player.cx);
                if (dx < 280) this.boss.activate(game);
            }
        }
    }

    drawBackground(ctx, cam) {
        const sky = {
            desert: ['#2d1b69', '#8b3a62', '#f4a460'],
            palace: ['#1a1a3e', '#4b0082', '#8b008b'],
            ruins:  ['#0a0612', '#2d1b69', '#4b0082']
        }[this.theme] || ['#1a1a3e', '#2d1b69', '#4b0082'];

        const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
        grad.addColorStop(0, sky[0]);
        grad.addColorStop(0.5, sky[1]);
        grad.addColorStop(1, sky[2]);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        if (this.theme !== 'desert') {
            ctx.fillStyle = '#fff5d6';
            ctx.globalAlpha = 0.7;
            for (let i = 0; i < 40; i++) {
                const sx = (i * 137 - cam.x * 0.1) % CANVAS_W;
                const sy = (i * 73) % (CANVAS_H * 0.6);
                ctx.fillRect(sx < 0 ? sx + CANVAS_W : sx, sy, 2, 2);
            }
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#fff5d6';
            ctx.shadowBlur = 30; ctx.shadowColor = '#fff5d6';
            ctx.beginPath(); ctx.arc(CANVAS_W - 100, 80, 30, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
        } else {
            ctx.fillStyle = '#ff8c00';
            ctx.shadowBlur = 40; ctx.shadowColor = '#ff8c00';
            ctx.beginPath(); ctx.arc(CANVAS_W - 120, 120, 40, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
        }

        this._drawParallax(ctx, cam);
    }

    _drawParallax(ctx, cam) {
        const drawLayer = (items, factor, color, yOff = 0) => {
            ctx.fillStyle = color;
            for (const it of items) {
                const x = it.x - cam.x * factor;
                if (x + it.w < -50 || x > CANVAS_W + 50) continue;
                ctx.beginPath();
                ctx.moveTo(x, CANVAS_H + yOff);
                if (it.shape === 'mountain') {
                    ctx.lineTo(x + it.w / 2, CANVAS_H - it.h + yOff);
                    ctx.lineTo(x + it.w, CANVAS_H + yOff);
                } else if (it.shape === 'dome') {
                    ctx.arc(x + it.w / 2, CANVAS_H + yOff, it.w / 2, Math.PI, 0);
                } else if (it.shape === 'tower') {
                    ctx.rect(x, CANVAS_H - it.h + yOff, it.w, it.h + yOff);
                }
                ctx.fill();
            }
        };
        for (const layer of this.bgLayers) {
            drawLayer(layer.items, layer.factor, layer.color, layer.yOff || 0);
        }
        for (const d of this.deco) {
            const x = d.x - cam.x;
            if (x + 60 < 0 || x > CANVAS_W + 60) continue;
            this._drawDeco(ctx, x, d.y - cam.y, d.kind, d.t || 0);
        }
    }

    _drawDeco(ctx, x, y, kind, t) {
        ctx.save();
        ctx.translate(x, y);
        if (kind === 'palm') {
            ctx.fillStyle = '#6b4423';
            ctx.fillRect(-3, 0, 6, 60);
            ctx.fillStyle = COLORS.turquoiseDk;
            for (let i = 0; i < 6; i++) {
                const a = i * Math.PI / 3 - Math.PI / 2;
                ctx.save();
                ctx.translate(0, 0);
                ctx.rotate(a + Math.sin(t + i) * 0.05);
                ctx.beginPath();
                ctx.ellipse(20, 0, 22, 6, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        } else if (kind === 'lantern') {
            ctx.fillStyle = COLORS.goldDark;
            ctx.fillRect(-1, -20, 2, 10);
            ctx.fillStyle = COLORS.red;
            ctx.shadowBlur = 12; ctx.shadowColor = COLORS.lava;
            ctx.beginPath();
            ctx.ellipse(0, 0, 8, 10, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = COLORS.gold;
            ctx.fillRect(-8, -2, 16, 2);
        } else if (kind === 'column') {
            ctx.fillStyle = COLORS.sandLight;
            ctx.fillRect(-8, 0, 16, 80);
            ctx.fillStyle = COLORS.sandDark;
            ctx.fillRect(-10, 0, 20, 6);
            ctx.fillRect(-10, 74, 20, 6);
        } else if (kind === 'cloud') {
            ctx.fillStyle = 'rgba(255, 245, 214, 0.25)';
            ctx.beginPath();
            ctx.arc(0, 0, 20, 0, Math.PI * 2);
            ctx.arc(20, 5, 18, 0, Math.PI * 2);
            ctx.arc(-20, 5, 16, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    draw(ctx, cam) {
        for (const p of this.platforms) p.draw(ctx, cam, this.theme);
        for (const d of this.doors) d.draw(ctx, cam);
        for (const m of this.movingPlatforms) m.draw(ctx, cam);
        for (const t of this.traps) t.draw(ctx, cam);
        for (const a of this.arrowTraps) a.draw(ctx, cam);
        for (const it of this.items) it.draw(ctx, cam);
        for (const c of this.chests) c.draw(ctx, cam);
        if (this.finalChest) this.finalChest.draw(ctx, cam);
        for (const e of this.enemies) e.draw(ctx, cam);
        if (this.boss) this.boss.draw(ctx, cam);
        for (const p of this.projectiles) p.draw(ctx, cam);
    }
}

/* =========================================================
   16. GESTIONNAIRE DE COLLISIONS
   ========================================================= */
class CollisionManager {
    static resolvePlayer(player, solids) {
        const wasOnGround = player._wasOnGround || false;
        player.onGround = false;

        player.x += player.vx;
        for (const s of solids) {
            if (aabb(player.rect(), s)) {
                const overlapY = Math.min(player.y + player.h, s.y + s.h) - Math.max(player.y, s.y);
                if (overlapY > 4) {
                    if (player.vx > 0) { player.x = s.x - player.w; }
                    else if (player.vx < 0) { player.x = s.x + s.w; }
                    player.vx = 0;
                }
            }
        }

        player.y += player.vy;
        for (const s of solids) {
            if (aabb(player.rect(), s)) {
                if (player.vy > 0) {
                    player.y = s.y - player.h;
                    player.onGround = true;
                    player.jumpsLeft = 2;
                    if (s.carried !== undefined) s.carried = player;
                } else if (player.vy < 0) {
                    player.y = s.y + s.h;
                }
                player.vy = 0;
            }
        }

        if (wasOnGround && !player.onGround && player.jumpsLeft === 2) player.coyoteTime = 6;
        player._wasOnGround = player.onGround;
    }

    static resolveEnemy(e, solids) {
        e.onGround = false;
        e.x += e.vx;
        for (const s of solids) {
            if (aabb(e.rect(), s)) {
                const overlapY = Math.min(e.y + e.h, s.y + s.h) - Math.max(e.y, s.y);
                if (overlapY > 4) {
                    if (e.vx > 0) e.x = s.x - e.w;
                    else if (e.vx < 0) e.x = s.x + s.w;
                    e.vx = 0;
                }
            }
        }
        e.y += e.vy;
        for (const s of solids) {
            if (aabb(e.rect(), s)) {
                if (e.vy > 0) {
                    e.y = s.y - e.h;
                    e.onGround = true;
                    e.vy = 0;
                } else if (e.vy < 0) {
                    e.y = s.y + s.h;
                    e.vy = 0;
                }
            }
        }
        if (e.x < 0) e.x = 0;
        if (e.x + e.w > 5000) e.x = 5000 - e.w;
    }

    static resolveBoss(boss, solids) {
        boss.onGround = false;
        if (boss.type === 'genie') {
            boss.x += boss.vx;
            boss.y += boss.vy;
            return;
        }
        boss.x += boss.vx;
        boss.y += boss.vy;
        for (const s of solids) {
            if (aabb(boss.rect(), s)) {
                const overlapY = Math.min(boss.y + boss.h, s.y + s.h) - Math.max(boss.y, s.y);
                if (overlapY > 8 && Math.abs(boss.vx) > 0.01) {
                    if (boss.vx > 0) boss.x = s.x - boss.w;
                    else if (boss.vx < 0) boss.x = s.x + s.w;
                    boss.vx = 0;
                }
            }
        }
        for (const s of solids) {
            if (aabb(boss.rect(), s)) {
                if (boss.vy > 0) {
                    boss.y = s.y - boss.h;
                    boss.onGround = true;
                    boss.vy = 0;
                }
            }
        }
    }
}

/* =========================================================
   17. INTERFACE UTILISATEUR (HUD + popups)
   ========================================================= */
class UI {
    constructor() {
        this.livesEl = document.getElementById('hud-lives-value');
        this.energyEl = document.getElementById('hud-energy-value');
        this.coinsEl = document.getElementById('hud-coins-value');
        this.scoreEl = document.getElementById('hud-score-value');
        this.timerEl = document.getElementById('hud-timer-value');
        this.levelEl = document.getElementById('hud-level-value');
        this.bossEl  = document.getElementById('hud-boss-value');
        this.keysEl  = document.getElementById('hud-keys-value');
        this.bossBar = document.getElementById('boss-health-bar');
        this.bossNameEl = document.getElementById('boss-name');
        this.bossFill = document.getElementById('boss-bar-fill');
    }
    update(player, timeLeft, levelIndex, bossesDefeated) {
        this.livesEl.textContent = player.health;
        this.energyEl.textContent = Math.floor(player.energy);
        this.coinsEl.textContent = player.coins;
        this.scoreEl.textContent = player.score;
        this.timerEl.textContent = fmtTime(timeLeft);
        this.levelEl.textContent = levelIndex + 1;
        this.bossEl.textContent = bossesDefeated;
        this.keysEl.textContent = player.keys;
    }
    showBossBar(name) {
        this.bossNameEl.textContent = name;
        this.bossBar.classList.remove('hidden');
        this.bossFill.style.width = '100%';
    }
    updateBossBar(ratio) {
        this.bossFill.style.width = (clamp(ratio, 0, 1) * 100) + '%';
    }
    hideBossBar() {
        this.bossBar.classList.add('hidden');
    }
}
/* =========================================================
   18. CLASSE PRINCIPALE DU JEU
   ========================================================= */
class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.input = new InputManager();
        this.sound = new SoundManager();
        this.particles = new ParticleSystem();
        this.camera = new Camera();
        this.ui = new UI();

        this.player = null;
        this.level = null;
        this.levels = [];
        this.currentLevel = 0;
        this.bossesDefeated = 0;
        this.totalCoins = 0;
        this.totalTime = 0;
        this.timeLeft = 0;
        this.state = 'menu';
        this.lastTime = 0;
        this.scorePopups = [];
        this.clouds = [];
        this._initClouds();

        this._setupOverlays();
        this._setupResize();
        this._buildLevels();

        this._loop = this._loop.bind(this);
        requestAnimationFrame(this._loop);
    }

    _initClouds() {
        for (let i = 0; i < 6; i++) {
            this.clouds.push({
                x: rand(0, CANVAS_W * 2),
                y: rand(30, 180),
                spd: rand(0.2, 0.6),
                scale: rand(0.6, 1.4)
            });
        }
    }

    _setupOverlays() {
        document.getElementById('btn-start').addEventListener('click', () => this.startGame());
        document.getElementById('btn-restart-gameover').addEventListener('click', () => this.startGame());
        document.getElementById('btn-restart-victory').addEventListener('click', () => this.startGame());
        document.getElementById('btn-next-level').addEventListener('click', () => this.nextLevel());
    }

    _setupResize() {
        const resize = () => {
            const wrap = document.getElementById('canvas-wrapper');
            const maxW = wrap.clientWidth;
            const maxH = wrap.clientHeight;
            const ratio = CANVAS_W / CANVAS_H;
            let w = maxW, h = maxW / ratio;
            if (h > maxH) { h = maxH; w = maxH * ratio; }
            this.canvas.style.width = Math.floor(w) + 'px';
            this.canvas.style.height = Math.floor(h) + 'px';
        };
        window.addEventListener('resize', resize);
        resize();
    }

    startGame() {
        this.sound.init();
        this.currentLevel = 0;
        this.bossesDefeated = 0;
        this.totalCoins = 0;
        this.totalTime = 0;
        this.player = new Player(80, 200);
        this._hideAllOverlays();
        this._loadLevel(0);
        this.state = 'playing';
    }

    _hideAllOverlays() {
        ['overlay-start', 'overlay-gameover', 'overlay-victory', 'overlay-level-complete'].forEach(id => {
            document.getElementById(id).classList.add('hidden');
        });
    }

    _loadLevel(idx) {
        this.level = new Level(this.levels[idx]);
        this.player.x = this.level.checkpoint.x;
        this.player.y = this.level.checkpoint.y;
        this.player.spawnX = this.player.x;
        this.player.spawnY = this.player.y;
        this.player.vx = 0; this.player.vy = 0;
        this.player.keys = 0;
        this.timeLeft = this.level.timeLimit;
        this.camera.x = 0; this.camera.y = 0;
        this.particles.clear();
        this.ui.hideBossBar();
    }

    nextLevel() {
        this.currentLevel++;
        if (this.currentLevel >= this.levels.length) {
            this.onVictory();
            return;
        }
        this._hideAllOverlays();
        this._loadLevel(this.currentLevel);
        this.state = 'playing';
    }

    onPlayerDeath() {
        this._loseLife();
    }

    _loseLife() {
        if (this.player.health <= 0) {
            this.state = 'gameOver';
            document.getElementById('overlay-gameover').classList.remove('hidden');
            return;
        }
        this.player.respawn();
        this.timeLeft = this.level.timeLimit;
        this.camera.shake(8, 0.3);
    }

    onBossDefeated() {
        if (this.level.finalChest) {
            this.state = 'playing';
        } else {
            setTimeout(() => {
                if (this.currentLevel >= this.levels.length - 1) {
                    this.state = 'playing';
                } else {
                    this.state = 'levelComplete';
                    this.sound.levelComplete();
                    document.getElementById('level-complete-text').textContent =
                        `Boss vaincu ! Préparez-vous pour le niveau ${this.currentLevel + 2}...`;
                    document.getElementById('overlay-level-complete').classList.remove('hidden');
                }
            }, 1500);
        }
    }

    onVictory() {
        this.state = 'victory';
        this.sound.victory();
        document.getElementById('final-score').textContent = this.player.score;
        document.getElementById('final-time').textContent = fmtTime(this.totalTime);
        document.getElementById('final-coins').textContent = this.player.coins;
        document.getElementById('final-bosses').textContent = this.bossesDefeated;
        document.getElementById('overlay-victory').classList.remove('hidden');
    }

    spawnScorePopup(x, y, text) {
        this.scorePopups.push({ x, y, text, life: 1.0, vy: -1 });
    }

    _buildLevels() {
        this.levels = [LEVEL_1, LEVEL_2, LEVEL_3];
    }

    _update(dt) {
        if (this.state !== 'playing') return;

        this.timeLeft -= dt;
        this.totalTime += dt;
        if (this.timeLeft <= 0) {
            this.timeLeft = 0;
            this.player.takeDamage(1, null, this);
            this.timeLeft = this.level.timeLimit;
        }

        this.player.update(dt, this.input, this);
        const solids = this.level.getSolids();
        CollisionManager.resolvePlayer(this.player, solids);

        if (this.player.y > this.level.height + 100) {
            this.player.takeDamage(1, null, this);
            if (this.player.health > 0) this.player.respawn();
        }

        const atk = this.player.attackHitbox();
        if (atk) {
            for (const e of this.level.enemies) {
                if (e.state === 'dead') continue;
                if (aabb(atk, e.rect())) e.takeDamage(1, this.player.facing, this);
            }
            if (this.level.boss && this.level.boss.state !== 'dead' && this.level.boss.bossActive) {
                if (aabb(atk, this.level.boss.rect())) {
                    this.level.boss.takeDamage(1, this.player.facing, this);
                    this.particles.burst(this.player.facing === 1 ? this.level.boss.x : this.level.boss.x + this.level.boss.w, this.level.boss.cy, 6, { color: [COLORS.gold, COLORS.white], glow: true });
                }
            }
        }

        this.level.update(dt, this);

        for (const e of this.level.enemies) {
            if (e.state === 'dead') continue;
            CollisionManager.resolveEnemy(e, solids);
        }
        if (this.level.boss) CollisionManager.resolveBoss(this.level.boss, solids);

        this.particles.update(dt);

        for (let i = this.scorePopups.length - 1; i >= 0; i--) {
            const p = this.scorePopups[i];
            p.y += p.vy;
            p.life -= dt * 1.2;
            if (p.life <= 0) this.scorePopups.splice(i, 1);
        }

        this.camera.follow(this.player, this.level.width, this.level.height);
        this.camera.update(dt);

        for (const c of this.clouds) {
            c.x -= c.spd;
            if (c.x < -100) c.x = CANVAS_W + 100;
        }

        this.input.endFrame();
        this.ui.update(this.player, this.timeLeft, this.currentLevel, this.bossesDefeated);
    }

    _draw() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        if (!this.level) return;

        this.level.drawBackground(ctx, this.camera);

        ctx.save();
        for (const c of this.clouds) {
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = COLORS.white;
            const x = c.x - this.camera.x * 0.05;
            const sx = x < 0 ? x + CANVAS_W * 2 : x;
            ctx.beginPath();
            ctx.arc(sx, c.y, 18 * c.scale, 0, Math.PI * 2);
            ctx.arc(sx + 18 * c.scale, c.y, 14 * c.scale, 0, Math.PI * 2);
            ctx.arc(sx - 16 * c.scale, c.y + 4, 12 * c.scale, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.restore();

        const cam = { x: this.camera.x + this.camera.offsetX, y: this.camera.y + this.camera.offsetY };

        this.level.draw(ctx, cam);
        if (this.player) this.player.draw(ctx, cam);
        this.particles.draw(ctx, cam);

        ctx.save();
        ctx.font = 'bold 16px Trebuchet MS, sans-serif';
        ctx.textAlign = 'center';
        for (const p of this.scorePopups) {
            ctx.globalAlpha = clamp(p.life, 0, 1);
            ctx.fillStyle = COLORS.gold;
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 3;
            ctx.strokeText(p.text, p.x - cam.x, p.y - cam.y);
            ctx.fillText(p.text, p.x - cam.x, p.y - cam.y);
        }
        ctx.restore();
    }

    _loop(ts) {
        if (!this.lastTime) this.lastTime = ts;
        const dt = Math.min(0.05, (ts - this.lastTime) / 1000);
        this.lastTime = ts;
        this._update(dt);
        this._draw();
        requestAnimationFrame(this._loop);
    }
}
/* =========================================================
   19. DONNÉES DES NIVEAUX
   ========================================================= */

/* ---------- NIVEAU 1 : Désert / Temple / Oasis ---------- */
const LEVEL_1 = {
    name: 'Le Désert aux Sables Dorés',
    theme: 'desert',
    width: 3200,
    height: 600,
    timeLimit: 180,
    playerStart: { x: 60, y: 380 },
    bgLayers: [
        { factor: 0.15, color: 'rgba(75, 0, 130, 0.5)', yOff: 0, items: [
            { x: 0, w: 400, h: 200, shape: 'mountain' },
            { x: 350, w: 350, h: 240, shape: 'mountain' },
            { x: 700, w: 380, h: 180, shape: 'mountain' },
            { x: 1100, w: 420, h: 220, shape: 'mountain' },
            { x: 1550, w: 360, h: 200, shape: 'mountain' },
            { x: 1950, w: 400, h: 240, shape: 'mountain' },
            { x: 2400, w: 380, h: 200, shape: 'mountain' },
            { x: 2800, w: 400, h: 220, shape: 'mountain' }
        ]},
        { factor: 0.35, color: 'rgba(244, 164, 96, 0.6)', yOff: 0, items: [
            { x: 0, w: 500, h: 120, shape: 'dome' },
            { x: 480, w: 600, h: 140, shape: 'dome' },
            { x: 1080, w: 550, h: 130, shape: 'dome' },
            { x: 1650, w: 600, h: 150, shape: 'dome' },
            { x: 2250, w: 550, h: 130, shape: 'dome' },
            { x: 2820, w: 500, h: 140, shape: 'dome' }
        ]}
    ],
    deco: [
        { x: 200, y: 410, kind: 'palm', t: 0 },
        { x: 600, y: 410, kind: 'palm', t: 1 },
        { x: 900, y: 100, kind: 'cloud' },
        { x: 1500, y: 70, kind: 'cloud' },
        { x: 1200, y: 380, kind: 'lantern' },
        { x: 1800, y: 380, kind: 'lantern' },
        { x: 2400, y: 380, kind: 'column' }
    ],
    platforms: [
        { x: 0, y: 540, w: 800, h: 60, kind: 'ground' },
        { x: 850, y: 540, w: 500, h: 60, kind: 'ground' },
        { x: 1450, y: 540, w: 600, h: 60, kind: 'ground' },
        { x: 2150, y: 540, w: 400, h: 60, kind: 'ground' },
        { x: 2650, y: 540, w: 550, h: 60, kind: 'ground' },
        { x: 300, y: 420, w: 100, h: 20 },
        { x: 500, y: 360, w: 100, h: 20 },
        { x: 700, y: 300, w: 120, h: 20 },
        { x: 950, y: 420, w: 120, h: 20 },
        { x: 1150, y: 360, w: 100, h: 20 },
        { x: 1700, y: 420, w: 120, h: 20 },
        { x: 1900, y: 360, w: 100, h: 20 },
        { x: 2100, y: 300, w: 120, h: 20 },
        { x: 2700, y: 440, w: 120, h: 20 },
        { x: 2900, y: 380, w: 120, h: 20 },
        { x: 2350, y: 380, w: 200, h: 20 }
    ],
    enemies: [
        { type: 'bandit', x: 400, y: 500 },
        { type: 'scorpion', x: 900, y: 518 },
        { type: 'bandit', x: 1200, y: 500 },
        { type: 'bat', x: 1500, y: 200 },
        { type: 'scorpion', x: 1700, y: 518 },
        { type: 'bandit', x: 2000, y: 500 },
        { type: 'bat', x: 2200, y: 180 },
        { type: 'scorpion', x: 2500, y: 518 }
    ],
    items: [
        { kind: 'coin', x: 320, y: 380 },
        { kind: 'coin', x: 540, y: 320 },
        { kind: 'coin', x: 740, y: 260 },
        { kind: 'fruit', x: 1000, y: 380 },
        { kind: 'coin', x: 1200, y: 320 },
        { kind: 'diamond', x: 2160, y: 260 },
        { kind: 'coin', x: 1750, y: 380 },
        { kind: 'coin', x: 1950, y: 320 },
        { kind: 'potion', x: 2380, y: 340 },
        { kind: 'coin', x: 2750, y: 400 },
        { kind: 'coin', x: 2950, y: 340 },
        { kind: 'key', x: 760, y: 260 }
    ],
    traps: [
        { kind: 'spikes', x: 820, y: 524, w: 30, h: 16 },
        { kind: 'spikes', x: 1420, y: 524, w: 30, h: 16 },
        { kind: 'quicksand', x: 2050, y: 524, w: 100, h: 16 }
    ],
    chests: [
        { x: 1500, y: 504 }
    ],
    boss: { type: 'scorpion', x: 3000, y: 480 }
};

/* ---------- NIVEAU 2 : Palais / Cavernes / Lave ---------- */
const LEVEL_2 = {
    name: 'Le Palais aux Lanternes',
    theme: 'palace',
    width: 3400,
    height: 600,
    timeLimit: 180,
    playerStart: { x: 60, y: 380 },
    bgLayers: [
        { factor: 0.15, color: 'rgba(72, 0, 120, 0.6)', yOff: 0, items: [
            { x: 0, w: 400, h: 280, shape: 'tower' },
            { x: 350, w: 200, h: 320, shape: 'tower' },
            { x: 550, w: 350, h: 260, shape: 'tower' },
            { x: 900, w: 250, h: 300, shape: 'tower' },
            { x: 1200, w: 400, h: 280, shape: 'tower' },
            { x: 1650, w: 300, h: 320, shape: 'tower' },
            { x: 2000, w: 400, h: 280, shape: 'tower' },
            { x: 2450, w: 250, h: 300, shape: 'tower' },
            { x: 2750, w: 400, h: 280, shape: 'tower' }
        ]},
        { factor: 0.4, color: 'rgba(45, 27, 105, 0.7)', yOff: 0, items: [
            { x: 100, w: 350, h: 200, shape: 'dome' },
            { x: 500, w: 400, h: 220, shape: 'dome' },
            { x: 950, w: 350, h: 200, shape: 'dome' },
            { x: 1350, w: 400, h: 220, shape: 'dome' },
            { x: 1800, w: 350, h: 200, shape: 'dome' },
            { x: 2200, w: 400, h: 220, shape: 'dome' },
            { x: 2650, w: 350, h: 200, shape: 'dome' }
        ]}
    ],
    deco: [
        { x: 200, y: 380, kind: 'column' },
        { x: 400, y: 380, kind: 'lantern' },
        { x: 700, y: 380, kind: 'column' },
        { x: 1000, y: 380, kind: 'lantern' },
        { x: 1300, y: 380, kind: 'column' },
        { x: 1600, y: 380, kind: 'lantern' },
        { x: 1900, y: 380, kind: 'column' },
        { x: 2200, y: 380, kind: 'lantern' },
        { x: 2500, y: 380, kind: 'column' },
        { x: 2800, y: 380, kind: 'lantern' },
        { x: 500, y: 80, kind: 'cloud' },
        { x: 1200, y: 50, kind: 'cloud' },
        { x: 2000, y: 90, kind: 'cloud' }
    ],
    platforms: [
        { x: 0, y: 540, w: 600, h: 60, kind: 'ground' },
        { x: 700, y: 540, w: 400, h: 60, kind: 'ground' },
        { x: 1200, y: 540, w: 500, h: 60, kind: 'ground' },
        { x: 1800, y: 540, w: 400, h: 60, kind: 'ground' },
        { x: 2300, y: 540, w: 500, h: 60, kind: 'ground' },
        { x: 2900, y: 540, w: 500, h: 60, kind: 'ground' },
        { x: 250, y: 420, w: 100, h: 20 },
        { x: 450, y: 340, w: 100, h: 20 },
        { x: 800, y: 420, w: 120, h: 20 },
        { x: 1000, y: 340, w: 100, h: 20 },
        { x: 1300, y: 420, w: 120, h: 20 },
        { x: 1500, y: 340, w: 100, h: 20 },
        { x: 1700, y: 260, w: 100, h: 20 },
        { x: 1900, y: 420, w: 120, h: 20 },
        { x: 2100, y: 340, w: 100, h: 20 },
        { x: 2400, y: 420, w: 120, h: 20 },
        { x: 2600, y: 340, w: 100, h: 20 },
        { x: 2800, y: 260, w: 100, h: 20 },
        { x: 3000, y: 420, w: 120, h: 20 }
    ],
    enemies: [
        { type: 'skeleton', x: 400, y: 498 },
        { type: 'bandit', x: 800, y: 500 },
        { type: 'skeleton', x: 1300, y: 498 },
        { type: 'mummy', x: 1500, y: 494 },
        { type: 'bat', x: 1700, y: 180 },
        { type: 'skeleton', x: 2000, y: 498 },
        { type: 'mummy', x: 2400, y: 494 },
        { type: 'bat', x: 2600, y: 200 },
        { type: 'skeleton', x: 2900, y: 498 }
    ],
    items: [
        { kind: 'coin', x: 280, y: 380 },
        { kind: 'coin', x: 480, y: 300 },
        { kind: 'fruit', x: 830, y: 380 },
        { kind: 'coin', x: 1030, y: 300 },
        { kind: 'diamond', x: 1730, y: 220 },
        { kind: 'coin', x: 1330, y: 380 },
        { kind: 'coin', x: 1530, y: 300 },
        { kind: 'potion', x: 1930, y: 380 },
        { kind: 'coin', x: 2130, y: 300 },
        { kind: 'coin', x: 2430, y: 380 },
        { kind: 'key', x: 2630, y: 300 },
        { kind: 'diamond', x: 2830, y: 220 },
        { kind: 'coin', x: 3030, y: 380 }
    ],
    traps: [
        { kind: 'lava', x: 600, y: 540, w: 100, h: 60 },
        { kind: 'lava', x: 1100, y: 540, w: 100, h: 60 },
        { kind: 'saw', x: 1700, y: 510, w: 30, h: 30 },
        { kind: 'lava', x: 2200, y: 540, w: 100, h: 60 },
        { kind: 'spikes', x: 2800, y: 524, w: 100, h: 16 }
    ],
    movingPlatforms: [
        { x: 1150, y: 380, w: 80, h: 16, x2: 1150, y2: 280, speed: 0.8 },
        { x: 2250, y: 380, w: 80, h: 16, x2: 2380, y2: 380, speed: 1.0 }
    ],
    arrowTraps: [
        { x: 1600, y: 280, dir: -1, period: 150 }
    ],
    chests: [
        { x: 3050, y: 504 }
    ],
    boss: { type: 'genie', x: 3200, y: 250 }
};

/* ---------- NIVEAU 3 : Temple perdu / Ruines / Pièges ---------- */
const LEVEL_3 = {
    name: 'Le Temple Oublié',
    theme: 'ruins',
    width: 3600,
    height: 600,
    timeLimit: 200,
    playerStart: { x: 60, y: 380 },
    bgLayers: [
        { factor: 0.15, color: 'rgba(26, 26, 62, 0.7)', yOff: 0, items: [
            { x: 0, w: 400, h: 280, shape: 'tower' },
            { x: 400, w: 350, h: 320, shape: 'tower' },
            { x: 800, w: 400, h: 260, shape: 'tower' },
            { x: 1250, w: 350, h: 300, shape: 'tower' },
            { x: 1650, w: 400, h: 280, shape: 'tower' },
            { x: 2100, w: 350, h: 320, shape: 'tower' },
            { x: 2500, w: 400, h: 280, shape: 'tower' },
            { x: 2950, w: 350, h: 300, shape: 'tower' }
        ]},
        { factor: 0.4, color: 'rgba(10, 6, 18, 0.7)', yOff: 0, items: [
            { x: 100, w: 350, h: 200, shape: 'mountain' },
            { x: 500, w: 400, h: 220, shape: 'mountain' },
            { x: 950, w: 350, h: 200, shape: 'mountain' },
            { x: 1350, w: 400, h: 220, shape: 'mountain' },
            { x: 1800, w: 350, h: 200, shape: 'mountain' },
            { x: 2200, w: 400, h: 220, shape: 'mountain' },
            { x: 2650, w: 350, h: 200, shape: 'mountain' },
            { x: 3050, w: 400, h: 220, shape: 'mountain' }
        ]}
    ],
    deco: [
        { x: 200, y: 380, kind: 'column' },
        { x: 400, y: 380, kind: 'lantern' },
        { x: 700, y: 380, kind: 'column' },
        { x: 1000, y: 380, kind: 'lantern' },
        { x: 1300, y: 380, kind: 'column' },
        { x: 1600, y: 380, kind: 'lantern' },
        { x: 1900, y: 380, kind: 'column' },
        { x: 2200, y: 380, kind: 'lantern' },
        { x: 2500, y: 380, kind: 'column' },
        { x: 2800, y: 380, kind: 'lantern' },
        { x: 3100, y: 380, kind: 'column' }
    ],
    platforms: [
        { x: 0, y: 540, w: 500, h: 60, kind: 'ground' },
        { x: 600, y: 540, w: 400, h: 60, kind: 'ground' },
        { x: 1100, y: 540, w: 300, h: 60, kind: 'ground' },
        { x: 1500, y: 540, w: 400, h: 60, kind: 'ground' },
        { x: 2000, y: 540, w: 300, h: 60, kind: 'ground' },
        { x: 2400, y: 540, w: 400, h: 60, kind: 'ground' },
        { x: 2900, y: 540, w: 700, h: 60, kind: 'ground' },
        { x: 200, y: 420, w: 100, h: 20 },
        { x: 400, y: 340, w: 100, h: 20 },
        { x: 600, y: 260, w: 100, h: 20 },
        { x: 800, y: 420, w: 100, h: 20 },
        { x: 1000, y: 340, w: 100, h: 20 },
        { x: 1200, y: 420, w: 100, h: 20 },
        { x: 1400, y: 340, w: 100, h: 20 },
        { x: 1600, y: 260, w: 100, h: 20 },
        { x: 1800, y: 420, w: 100, h: 20 },
        { x: 2000, y: 340, w: 100, h: 20 },
        { x: 2200, y: 420, w: 100, h: 20 },
        { x: 2400, y: 340, w: 100, h: 20 },
        { x: 2600, y: 260, w: 100, h: 20 },
        { x: 2800, y: 420, w: 100, h: 20 },
        { x: 3000, y: 340, w: 100, h: 20 },
        { x: 3200, y: 420, w: 100, h: 20 },
        { x: 2900, y: 380, w: 100, h: 20 }
    ],
    enemies: [
        { type: 'guardian', x: 300, y: 490 },
        { type: 'skeleton', x: 700, y: 498 },
        { type: 'mummy', x: 1000, y: 494 },
        { type: 'bat', x: 1300, y: 200 },
        { type: 'guardian', x: 1600, y: 490 },
        { type: 'skeleton', x: 1900, y: 498 },
        { type: 'mummy', x: 2200, y: 494 },
        { type: 'bat', x: 2500, y: 200 },
        { type: 'guardian', x: 2700, y: 490 }
    ],
    items: [
        { kind: 'coin', x: 230, y: 380 },
        { kind: 'coin', x: 430, y: 300 },
        { kind: 'diamond', x: 630, y: 220 },
        { kind: 'fruit', x: 830, y: 380 },
        { kind: 'coin', x: 1030, y: 300 },
        { kind: 'potion', x: 1230, y: 380 },
        { kind: 'coin', x: 1430, y: 300 },
        { kind: 'diamond', x: 1630, y: 220 },
        { kind: 'coin', x: 1830, y: 380 },
        { kind: 'key', x: 2030, y: 300 },
        { kind: 'fruit', x: 2230, y: 380 },
        { kind: 'coin', x: 2430, y: 300 },
        { kind: 'diamond', x: 2630, y: 220 },
        { kind: 'potion', x: 2830, y: 380 },
        { kind: 'coin', x: 3030, y: 300 },
        { kind: 'coin', x: 3230, y: 380 }
    ],
    traps: [
        { kind: 'spikes', x: 500, y: 524, w: 100, h: 16 },
        { kind: 'saw', x: 900, y: 510, w: 30, h: 30 },
        { kind: 'fire', x: 1400, y: 524, w: 100, h: 16 },
        { kind: 'spikes', x: 1900, y: 524, w: 100, h: 16 },
        { kind: 'saw', x: 2300, y: 510, w: 30, h: 30 },
        { kind: 'fire', x: 2800, y: 524, w: 100, h: 16 }
    ],
    doors: [
        { x: 2850, y: 480 }
    ],
    movingPlatforms: [
        { x: 1050, y: 380, w: 80, h: 16, x2: 1050, y2: 260, speed: 0.8 },
        { x: 2050, y: 380, w: 80, h: 16, x2: 2180, y2: 380, speed: 1.0 }
    ],
    arrowTraps: [
        { x: 1200, y: 280, dir: -1, period: 130 },
        { x: 2200, y: 280, dir: 1, period: 150 }
    ],
    chests: [
        { x: 1500, y: 504 },
        { x: 2500, y: 504 }
    ],
    boss: { type: 'guardian', x: 3300, y: 450 },
    finalChest: { x: 3400, y: 508 }
};

/* =========================================================
   20. INITIALISATION
   ========================================================= */
let game;
window.addEventListener('load', () => {
    game = new Game();
});

