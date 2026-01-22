const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const os = require('os');

console.log("🚀 Starting Enhanced Agar.io Server v9.0 with Chat...");

const app = express();
const server = http.createServer(app);

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

const LOCAL_IP = getLocalIP();

app.use(cors({
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
}));

const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['polling', 'websocket'],
    allowEIO3: true
});

const GAME_CONSTANTS = {
    WORLD_WIDTH: 2000,
    WORLD_HEIGHT: 2000,

    VIRUS_COUNT: 15,
    VIRUS_MASS: 100,
    VIRUS_SPLIT_MASS: 120,
    VIRUS_MAX_HITS: 7,
    VIRUS_SPLIT_INTO: 16,
    VIRUS_MIN_INTERACTION_MASS: 120,
    VIRUS_BONUS_MASS: 100,

    // 🦠 ウイルス自動スポーン設定
    VIRUS_MAX_COUNT: 15,              // 最大15個まで
    VIRUS_SPAWN_INTERVAL: 30000,      // 30秒ごと（1分に2個）
    VIRUS_SPAWN_PER_INTERVAL: 1,      // 1回につき1個

    MASS_TO_RADIUS: (mass) => Math.sqrt(mass / Math.PI) * 1.2,
    RADIUS_TO_MASS: (radius) => Math.PI * radius * radius,

    SPEED_FORMULA: (mass) => {
        const baseSpeed = 60 / Math.pow(mass, 0.4);
        return Math.max(baseSpeed, 8);
    },

    SPLIT_MIN_MASS: 35,
    EJECT_MIN_MASS: 38,
    EJECT_MASS: 14,
    EAT_MASS_RATIO: 1.25,
    EAT_MASS_RATIO_SPLIT: 1.33,
    DECAY_MIN_MASS: 35,
    DECAY_RATE: 0.002,
    DECAY_OFFSET: 32,

    MAX_CELLS_PER_PLAYER: 16,
    MERGE_TIMER: 15000,
    SPLIT_BOOST: 780,

    INITIAL_MASS: 20,

    MIN_CELL_DISTANCE: 8,
    POSITION_ADJUSTMENT_FORCE: 0.15,
    SMOOTH_FACTOR: 0.08,
    MIN_SPLIT_DISTANCE: 100,
    MERGE_PROTECTION_TIME: 2500,
    OVERLAP_CHECK_RADIUS: 1.1,

    FOOD_INITIAL_MASS: 10,
    FOOD_MAX_MASS: 15,
    FOOD_GROWTH_TIME: 300000,
    FOOD_GROWTH_RATE: 0.00001,
    FOOD_COUNT: 800,

    TICK_RATE: 25,
    LEADERBOARD_UPDATE_RATE: 1000,
    FOOD_RESPAWN_RATE: 5,

    GUN_ITEM_SPAWN_INTERVAL: 45000,  // 45秒ごと
    GUN_ITEM_MAX_COUNT: 6,
    GUN_BULLET_DAMAGE: 100,           // 弾のダメージ（質量減少量）
    GUN_BULLET_SPEED: 800,            // 弾の速度
    GUN_BULLET_RADIUS: 4,             // 弾の半径
    GUN_COOLDOWN: 500,                // 射撃クールダウン（0.5秒）
    GUN_MAX_BULLETS: 10,             // 🎯 最大10発に変更
    GUN_BULLETS_PER_ITEM: 5,         // 🎯 新規追加：1個につき5発


    // 🛡️ バリアアイテム
    BARRIER_ITEM_SPAWN_INTERVAL: 60000,  // 1分ごと
    BARRIER_ITEM_MAX_COUNT: 3,           // 最大3個
    BARRIER_DURATION: 10000,             // 10秒間無敵


    // 👟 スピードアップアイテム
    SPEEDUP_ITEM_SPAWN_INTERVAL: 45000,  // 45秒ごと
    SPEEDUP_ITEM_MAX_COUNT: 3,           // 最大3個
    SPEEDUP_DURATION: 5000,              // 5秒間
    SPEEDUP_MULTIPLIER: 2.0,             // スピード2倍

    // ===== 🛍️ SHOP（追加）=====
    SHOP_GUN_PRICE: 100,
    SHOP_GUN_DURATION: 30000,
    SHOP_GUN_BULLETS: 5,
    SHOP_MIN_MASS_TO_BUY: 150,

    SHOP_BARRIER_PRICE: 120,
    // バリアは「購入＝所持(未発動)」なので duration は activate_barrier 側で使う。
    // 既存に BARRIER_DURATION があるならそれを使ってもOK
    SHOP_BARRIER_DURATION: 10000,

};

// ===== 🛍️ SHOP HELPERS（追加）=====
function getTotalMass(player) {
    if (!player?.cells?.length) return 0;
    return player.cells.reduce((sum, cell) => sum + (cell.mass || 0), 0);
}

// 価格分をプレイヤーのセルから減算（最低10は残す：参考コードの挙動に合わせる）
function removeMassForPurchase(player, price) {
    let remaining = price;

    for (const cell of player.cells) {
        if (remaining <= 0) break;

        const canTake = (cell.mass || 0) - 10;
        if (canTake <= 0) continue;

        const take = Math.min(canTake, remaining);
        cell.setMass(cell.mass - take);
        remaining -= take;
    }

    return remaining <= 0;
}


class QuadTree {
    constructor(x, y, width, height, maxObjects = 15, maxLevels = 6, level = 0) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.maxObjects = maxObjects;
        this.maxLevels = maxLevels;
        this.level = level;
        this.objects = [];
        this.nodes = [];

        this._bounds = { x, y, width, height };
        this._centerX = x + width / 2;
        this._centerY = y + height / 2;
    }

    clear() {
        this.objects.length = 0;
        for (let i = 0; i < this.nodes.length; i++) {
            if (this.nodes[i]) {
                this.nodes[i].clear();
            }
        }
        this.nodes.length = 0;
    }

    split() {
        const subWidth = this.width / 2;
        const subHeight = this.height / 2;
        const nextLevel = this.level + 1;

        this.nodes[0] = new QuadTree(this._centerX, this.y, subWidth, subHeight, this.maxObjects, this.maxLevels, nextLevel);
        this.nodes[1] = new QuadTree(this.x, this.y, subWidth, subHeight, this.maxObjects, this.maxLevels, nextLevel);
        this.nodes[2] = new QuadTree(this.x, this._centerY, subWidth, subHeight, this.maxObjects, this.maxLevels, nextLevel);
        this.nodes[3] = new QuadTree(this._centerX, this._centerY, subWidth, subHeight, this.maxObjects, this.maxLevels, nextLevel);
    }

    getIndex(obj) {
        const verticalMidpoint = this._centerX;
        const horizontalMidpoint = this._centerY;

        const topQuadrant = (obj.y < horizontalMidpoint && obj.y + obj.radius < horizontalMidpoint);
        const bottomQuadrant = (obj.y > horizontalMidpoint);

        if (obj.x < verticalMidpoint && obj.x + obj.radius < verticalMidpoint) {
            if (topQuadrant) return 1;
            else if (bottomQuadrant) return 2;
        } else if (obj.x > verticalMidpoint) {
            if (topQuadrant) return 0;
            else if (bottomQuadrant) return 3;
        }
        return -1;
    }

    insert(obj) {
        if (this.nodes.length > 0) {
            const index = this.getIndex(obj);
            if (index !== -1) {
                this.nodes[index].insert(obj);
                return;
            }
        }

        this.objects.push(obj);

        if (this.objects.length > this.maxObjects && this.level < this.maxLevels) {
            if (this.nodes.length === 0) {
                this.split();
            }

            let i = 0;
            while (i < this.objects.length) {
                const index = this.getIndex(this.objects[i]);
                if (index !== -1) {
                    this.nodes[index].insert(this.objects.splice(i, 1)[0]);
                } else {
                    i++;
                }
            }
        }
    }

    retrieve(returnObjects, obj) {
        const index = this.getIndex(obj);
        if (index !== -1 && this.nodes.length > 0) {
            this.nodes[index].retrieve(returnObjects, obj);
        }

        for (let i = 0; i < this.objects.length; i++) {
            returnObjects.push(this.objects[i]);
        }
        return returnObjects;
    }
}

class GameObject {
    constructor(x, y, mass, type) {
        this.id = Math.random().toString(36).substr(2, 9);
        this.x = x;
        this.y = y;
        this.mass = mass;
        this.radius = GAME_CONSTANTS.MASS_TO_RADIUS(mass);
        this.type = type;
        this.toDelete = false;

        this.vx = 0;
        this.vy = 0;
        this.lastX = x;
        this.lastY = y;

        this.adjustmentX = 0;
        this.adjustmentY = 0;
        this.lastAdjustmentTime = 0;
    }

    update(deltaTime) {
        this.lastX = this.x;
        this.lastY = this.y;

        this.x += this.adjustmentX;
        this.y += this.adjustmentY;

        this.x += this.vx * deltaTime * 0.001;
        this.y += this.vy * deltaTime * 0.001;

        const friction = 0.92;
        this.vx *= friction;
        this.vy *= friction;

        this.adjustmentX *= 0.85;
        this.adjustmentY *= 0.85;

        this.x = Math.max(this.radius, Math.min(GAME_CONSTANTS.WORLD_WIDTH - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(GAME_CONSTANTS.WORLD_HEIGHT - this.radius, this.y));
    }

    distanceTo(other) {
        const dx = this.x - other.x;
        const dy = this.y - other.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    isOverlappingWith(other) {
        if (!other || other === this) return false;
        const distance = this.distanceTo(other);
        const minDistance = (this.radius + other.radius) * GAME_CONSTANTS.OVERLAP_CHECK_RADIUS + GAME_CONSTANTS.MIN_CELL_DISTANCE;
        return distance < minDistance;
    }

    adjustPositionAwayFrom(other) {
        if (!this.isOverlappingWith(other)) return;
        const dx = this.x - other.x;
        const dy = this.y - other.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance === 0) {
            const angle = Math.random() * Math.PI * 2;
            const adjustmentForce = GAME_CONSTANTS.POSITION_ADJUSTMENT_FORCE;
            this.adjustmentX += Math.cos(angle) * adjustmentForce;
            this.adjustmentY += Math.sin(angle) * adjustmentForce;
            return;
        }

        const minDistance = (this.radius + other.radius) * GAME_CONSTANTS.OVERLAP_CHECK_RADIUS + GAME_CONSTANTS.MIN_CELL_DISTANCE;
        const overlap = Math.max(0, minDistance - distance);

        if (overlap > 0) {
            const normalX = dx / distance;
            const normalY = dy / distance;

            const totalMass = this.mass + other.mass;
            const thisRatio = other.mass / totalMass;

            const adjustmentStrength = overlap * GAME_CONSTANTS.POSITION_ADJUSTMENT_FORCE * thisRatio;

            this.adjustmentX += normalX * adjustmentStrength * GAME_CONSTANTS.SMOOTH_FACTOR;
            this.adjustmentY += normalY * adjustmentStrength * GAME_CONSTANTS.SMOOTH_FACTOR;
        }
    }

    canEat(other) {
        const player = this.players ? this.players.get(this.playerId) : null;
        const isSplit = player && player.cells.length > 1;
        const requiredRatio = isSplit ? GAME_CONSTANTS.EAT_MASS_RATIO_SPLIT : GAME_CONSTANTS.EAT_MASS_RATIO;

        if (this.mass < other.mass * requiredRatio) return false;
        return this.distanceTo(other) < this.radius - other.radius / 2;
    }

    collidesWith(other) {
        return this.distanceTo(other) < this.radius + other.radius;
    }

    setMass(mass) {
        this.mass = mass;
        this.radius = GAME_CONSTANTS.MASS_TO_RADIUS(mass);
    }
}

class PlayerCell extends GameObject {
    constructor(x, y, mass, playerId, name = '') {
        super(x, y, mass, 'player');
        this.playerId = playerId;
        this.name = name;
        this.targetX = x;
        this.targetY = y;
        this.canMerge = false;
        this.mergeTimer = 0;
        this.lastSplitTime = 0;
        this.color = this.generateColor();
        this.skin = this.generateSkin();

        this.smoothFactor = 0.12;
        this.maxSpeed = GAME_CONSTANTS.SPEED_FORMULA(mass);

        this.protectionTime = 0;
        this.isProtected = false;
        this.positioningComplete = false;
    }

    generateColor() {
        const hash = this.playerId.split('').reduce((a, b) => {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
        }, 0);

        const hue = Math.abs(hash) % 360;
        const saturation = 65 + (Math.abs(hash) % 20);
        const lightness = 50 + (Math.abs(hash) % 15);

        return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }

    generateSkin() {
        const skins = ['default', 'dotted', 'striped', 'gradient'];
        const skinIndex = Math.abs(this.playerId.charCodeAt(0)) % skins.length;
        return skins[skinIndex];
    }

    update(deltaTime, player) {
        super.update(deltaTime);

        if (this.protectionTime > 0) {
            this.protectionTime -= deltaTime;
            if (this.protectionTime <= 0) {
                this.isProtected = false;
                this.positioningComplete = true;
            }
        }

        if (this.splitAnimationPhase > 0) {
            const animationSpeed = 0.12;
            this.splitAnimationPhase -= animationSpeed;

            if (this.splitAnimationPhase <= 0) {
                this.splitAnimationPhase = 0;
            } else {
                const progress = 1 - this.splitAnimationPhase;
                const easeProgress = 1 - Math.pow(1 - progress, 3);

                const animX = this.splitStartX + (this.splitTargetX - this.splitStartX) * easeProgress;
                const animY = this.splitStartY + (this.splitTargetY - this.splitStartY) * easeProgress;

                this.x = animX;
                this.y = animY;
            }
        }

        if (this.mergeTimer > 0) {
            this.mergeTimer -= deltaTime;
            if (this.mergeTimer <= 0) {
                this.canMerge = true;
            }
        }

        if (this.mass > GAME_CONSTANTS.DECAY_MIN_MASS) {
            const decayAmount = GAME_CONSTANTS.DECAY_RATE *
                (this.mass - GAME_CONSTANTS.DECAY_OFFSET) *
                (deltaTime / 1000);
            this.setMass(Math.max(GAME_CONSTANTS.DECAY_MIN_MASS, this.mass - decayAmount));
        }



        this.moveTowards(this.targetX, this.targetY, deltaTime, player);

        this.maxSpeed = GAME_CONSTANTS.SPEED_FORMULA(this.mass);
    }

    moveTowards(x, y, deltaTime, player) {
        const dx = x - this.x;
        const dy = y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 3) {
            const baseSpeed = this.maxSpeed;

            // 👟 スピードアップ中は2倍速
            const speedMultiplier = (this.speedUpActive) ? GAME_CONSTANTS.SPEEDUP_MULTIPLIER : 1.0;
            const moveSpeed = baseSpeed * (deltaTime / 1000) * speedMultiplier;
            const actualMove = Math.min(moveSpeed, distance * 0.25);

            const directionX = dx / distance;
            const directionY = dy / distance;

            this.x += directionX * actualMove;
            this.y += directionY * actualMove;

            this.vx = directionX * actualMove * 12;
            this.vy = directionY * actualMove * 12;
        } else {
            this.vx *= 0.88;
            this.vy *= 0.88;
            this.x += this.vx * (deltaTime / 1000);
            this.y += this.vy * (deltaTime / 1000);
        }

        this.x = Math.max(this.radius, Math.min(GAME_CONSTANTS.WORLD_WIDTH - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(GAME_CONSTANTS.WORLD_HEIGHT - this.radius, this.y));
    }

    split(angle, targetX, targetY) {
        if (this.mass < GAME_CONSTANTS.SPLIT_MIN_MASS) return null;

        const newMass = this.mass / 2;
        this.setMass(newMass);

        const safePosition = this.findSafeSplitPosition(angle);

        const newCell = new PlayerCell(safePosition.x, safePosition.y, newMass, this.playerId, this.name);
        newCell.color = this.color;
        newCell.skin = this.skin;
        newCell.mergeTimer = GAME_CONSTANTS.MERGE_TIMER;
        newCell.canMerge = false;
        newCell.lastSplitTime = Date.now();

        const boost = GAME_CONSTANTS.SPLIT_BOOST * 0.8;
        newCell.vx = Math.cos(angle) * boost;
        newCell.vy = Math.sin(angle) * boost;
        this.vx = Math.cos(angle + Math.PI) * boost * 0.3;
        this.vy = Math.sin(angle + Math.PI) * boost * 0.3;

        newCell.protectionTime = GAME_CONSTANTS.MERGE_PROTECTION_TIME;
        newCell.isProtected = true;
        this.protectionTime = GAME_CONSTANTS.MERGE_PROTECTION_TIME;
        this.isProtected = true;

        newCell.splitAnimationPhase = 1.0;
        newCell.splitStartX = this.x;
        newCell.splitStartY = this.y;
        newCell.splitTargetX = safePosition.x;
        newCell.splitTargetY = safePosition.y;

        this.mergeTimer = GAME_CONSTANTS.MERGE_TIMER;
        this.canMerge = false;
        this.lastSplitTime = Date.now();

        return newCell;
    }

    findSafeSplitPosition(angle) {
        const baseDistance = GAME_CONSTANTS.MIN_SPLIT_DISTANCE;
        const attempts = 12;

        for (let i = 0; i < attempts; i++) {
            const adjustedAngle = angle + (i * Math.PI / 6);
            const distance = baseDistance + (i * 10);

            const testX = this.x + Math.cos(adjustedAngle) * distance;
            const testY = this.y + Math.sin(adjustedAngle) * distance;

            const radius = GAME_CONSTANTS.MASS_TO_RADIUS(this.mass / 2);

            if (testX - radius >= 0 && testX + radius <= GAME_CONSTANTS.WORLD_WIDTH &&
                testY - radius >= 0 && testY + radius <= GAME_CONSTANTS.WORLD_HEIGHT) {
                return { x: testX, y: testY };
            }
        }

        const fallbackX = Math.max(this.radius, Math.min(GAME_CONSTANTS.WORLD_WIDTH - this.radius,
            this.x + Math.cos(angle) * baseDistance));
        const fallbackY = Math.max(this.radius, Math.min(GAME_CONSTANTS.WORLD_HEIGHT - this.radius,
            this.y + Math.sin(angle) * baseDistance));

        return { x: fallbackX, y: fallbackY };
    }

    ejectMass(angle, mouseDirection = null) {
        if (this.mass < GAME_CONSTANTS.EJECT_MIN_MASS) return null;

        const ejectRatio = 0.18;
        const minEject = 12;
        const maxEject = 16;
        const ejectAmount = Math.max(minEject, Math.min(maxEject, this.mass * ejectRatio));

        this.setMass(this.mass - ejectAmount);

        let finalAngle = angle;
        if (mouseDirection && mouseDirection.x !== undefined && mouseDirection.y !== undefined) {
            const dx = mouseDirection.x - this.x;
            const dy = mouseDirection.y - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance > 5) {
                finalAngle = Math.atan2(dy, dx);
            }
        }

        const angleSpread = (Math.random() - 0.5) * 0.15;
        finalAngle += angleSpread;

        const baseDistance = this.radius + 30;
        const massBonus = Math.min(20, this.mass * 0.05);
        const ejectDistance = baseDistance + massBonus;

        const ejectX = this.x + Math.cos(finalAngle) * ejectDistance;
        const ejectY = this.y + Math.sin(finalAngle) * ejectDistance;

        const ejectedMass = new EjectedMass(ejectX, ejectY, ejectAmount);

        const baseVelocity = 120;
        const massSpeedBonus = Math.min(50, 60 / Math.sqrt(this.mass / 35));
        const finalVelocity = baseVelocity + massSpeedBonus;

        ejectedMass.vx = Math.cos(finalAngle) * finalVelocity;
        ejectedMass.vy = Math.sin(finalAngle) * finalVelocity;

        const recoilStrength = 100;
        const recoilRatio = ejectAmount / this.mass;
        this.vx -= Math.cos(finalAngle) * recoilStrength * recoilRatio;
        this.vy -= Math.sin(finalAngle) * recoilStrength * recoilRatio;

        return ejectedMass;
    }
}

class Food extends GameObject {
    constructor(x, y, mass) {
        super(x, y, mass, 'food');
        this.color = this.generateFoodColor();
        this.breathPhase = Math.random() * Math.PI * 2;

        this.initialMass = GAME_CONSTANTS.FOOD_INITIAL_MASS;
        this.currentMass = this.initialMass;
        this.maxMass = GAME_CONSTANTS.FOOD_MAX_MASS;
        this.birthTime = Date.now();
        this.growthRate = GAME_CONSTANTS.FOOD_GROWTH_RATE;

        this.setMass(this.initialMass);
    }

    generateFoodColor() {
        const foodColors = [
            "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FECA57",
            "#FF9FF3", "#54A0FF", "#5F27CD", "#00D2D3", "#FF9F43",
            "#A8E6CF", "#FFD93D", "#6BCF7F", "#4D96FF", "#FF8A80",
            "#F06292", "#BA68C8", "#9575CD", "#7986CB", "#64B5F6",
            "#81C784", "#FFB74D", "#F48FB1", "#CE93D8", "#90CAF9"
        ];
        return foodColors[Math.floor(Math.random() * foodColors.length)];
    }

    update(deltaTime) {
        super.update(deltaTime);

        const age = Date.now() - this.birthTime;
        const maxAge = GAME_CONSTANTS.FOOD_GROWTH_TIME;

        if (age < maxAge && this.currentMass < this.maxMass) {
            const growthProgress = Math.min(age / maxAge, 1);
            const targetMass = this.initialMass + (this.maxMass - this.initialMass) * growthProgress;

            this.currentMass = Math.min(targetMass, this.maxMass);
            this.setMass(this.currentMass);
        }

        this.breathPhase += deltaTime * 0.003;
    }

    getNutritionalValue() {
        return Math.floor(this.currentMass);
    }
}

class EjectedMass extends GameObject {
    constructor(x, y, mass) {
        super(x, y, mass || GAME_CONSTANTS.EJECT_MASS, 'ejectedMass');
        this.color = '#FFFF00';
        this.life = 10000;
        this.originalLife = this.life;
        this.nutritionalValue = Math.floor(mass * 0.9);

        this.glowIntensity = 1.0;
        this.rotationSpeed = (Math.random() - 0.5) * 0.01;
        this.rotation = Math.random() * Math.PI * 2;
        this.pulsePhase = Math.random() * Math.PI * 2;
        this.birthTime = Date.now();

        this.trail = [];
        this.lastTrailUpdate = Date.now();
    }

    update(deltaTime) {
        super.update(deltaTime);

        const friction = 0.80;
        this.vx *= friction;
        this.vy *= friction;

        if (Math.abs(this.vx) < 10 && Math.abs(this.vy) < 10) {
            this.vx = 0;
            this.vy = 0;
        }

        // 🎯 速度が停止したら消滅
        if (Math.abs(this.vx) < 10 && Math.abs(this.vy) < 10) {
            this.toDelete = true;
            console.log('🔫 Bullet stopped and deleted');
        }

        this.life -= deltaTime;
        if (this.life <= 0) {
            this.toDelete = true;
        }
    }
}

class Virus extends GameObject {
    constructor(x, y) {
        super(x, y, GAME_CONSTANTS.VIRUS_MASS, 'virus');
        this.color = '#00FF00';
        this.hitCount = 0;
        this.maxHits = GAME_CONSTANTS.VIRUS_MAX_HITS;
        this.spikes = 20;
        this.rotationSpeed = 0.01;
        this.rotation = 0;
        this.pulsePhase = Math.random() * Math.PI * 2;
        this.lastHitTime = 0;
    }

    update(deltaTime) {
        super.update(deltaTime);

        this.rotation += this.rotationSpeed * deltaTime * 0.001;
        this.pulsePhase += deltaTime * 0.002;
    }

    hit(ejectedMass) {
        this.mass += ejectedMass.mass;
        this.setMass(this.mass);
        this.hitCount++;

        if (this.mass >= GAME_CONSTANTS.VIRUS_SPLIT_MASS || this.hitCount >= this.maxHits) {
            return this.split();
        }
        return null;
    }

    split() {
        const newViruses = [];

        for (let i = 0; i < GAME_CONSTANTS.VIRUS_SPLIT_INTO; i++) {
            const angle = (Math.PI * 2 * i) / GAME_CONSTANTS.VIRUS_SPLIT_INTO + Math.random() * 0.5;
            const distance = this.radius * 3;

            const newVirus = new Virus(
                this.x + Math.cos(angle) * distance,
                this.y + Math.sin(angle) * distance
            );

            newVirus.vx = Math.cos(angle) * 500;
            newVirus.vy = Math.sin(angle) * 500;

            newViruses.push(newVirus);
        }

        this.setMass(GAME_CONSTANTS.VIRUS_MASS);
        this.hitCount = 0;
        this.vx = Math.random() * 200 - 100;
        this.vy = Math.random() * 200 - 100;

        return newViruses;
    }

    canInteractWithPlayer(playerCell) {
        const now = Date.now();

        if (playerCell.mass < GAME_CONSTANTS.VIRUS_MIN_INTERACTION_MASS) {
            return false;
        }

        if (now - this.lastHitTime < 500) {
            return false;
        }

        return this.collidesWith(playerCell);
    }

    processRiskReward(playerCell) {
        const now = Date.now();
        this.lastHitTime = now;

        const bonusMass = GAME_CONSTANTS.VIRUS_BONUS_MASS;
        const originalMass = playerCell.mass;
        const totalMassWithBonus = originalMass + bonusMass;

        const splitResult = this.forceSplitPlayerWithBonus(playerCell, totalMassWithBonus);

        this.toDelete = true;

        return {
            bonusMass: bonusMass,
            splitCount: splitResult.splitCount,
            newCells: splitResult.newCells,
            virusDestroyed: true
        };
    }

    forceSplitPlayerWithBonus(playerCell, totalMassWithBonus) {
        const splitCount = 7;
        const newCells = [];

        if (splitCount <= 1) {
            playerCell.setMass(totalMassWithBonus);
            return { splitCount: 0, newCells: [] };
        }

        const massPerCell = totalMassWithBonus / (splitCount + 1);

        playerCell.setMass(massPerCell);

        const positions = this.calculateSafePositions(playerCell, splitCount, massPerCell);

        for (let i = 0; i < splitCount; i++) {
            const position = positions[i];

            const newCell = new PlayerCell(position.x, position.y, massPerCell, playerCell.playerId, playerCell.name);
            newCell.color = playerCell.color;
            newCell.skin = playerCell.skin;
            newCell.mergeTimer = GAME_CONSTANTS.MERGE_TIMER;
            newCell.canMerge = false;
            newCell.lastSplitTime = Date.now();

            const velocity = 400 + Math.random() * 200;

            newCell.vx = Math.cos(position.angle) * velocity;
            newCell.vy = Math.sin(position.angle) * velocity;

            newCell.protectionTime = GAME_CONSTANTS.MERGE_PROTECTION_TIME;
            newCell.isProtected = true;

            newCell.splitAnimationPhase = 1.0;
            newCell.splitStartX = playerCell.x;
            newCell.splitStartY = playerCell.y;
            newCell.splitTargetX = position.x;
            newCell.splitTargetY = position.y;

            newCells.push(newCell);
        }

        const recoilAngle = Math.random() * Math.PI * 2;
        playerCell.vx = Math.cos(recoilAngle) * 150;
        playerCell.vy = Math.sin(recoilAngle) * 150;
        playerCell.protectionTime = GAME_CONSTANTS.MERGE_PROTECTION_TIME;
        playerCell.isProtected = true;

        return {
            splitCount: splitCount,
            newCells: newCells
        };
    }

    calculateSafePositions(centerCell, count, massPerCell) {
        const positions = [];
        const cellRadius = GAME_CONSTANTS.MASS_TO_RADIUS(massPerCell);
        const minDistance = (centerCell.radius + cellRadius) * 1.5 + GAME_CONSTANTS.MIN_CELL_DISTANCE * 3;

        for (let i = 0; i < count; i++) {
            let bestPosition = null;
            let maxDistanceToOthers = 0;
            const attempts = 16;

            for (let attempt = 0; attempt < attempts; attempt++) {
                const baseAngle = (Math.PI * 2 * i) / count;
                const angleVariation = (Math.random() - 0.5) * (Math.PI / 2);
                const angle = baseAngle + angleVariation;

                const distanceVariation = 20 + Math.random() * 40;
                const distance = minDistance + distanceVariation;

                const x = centerCell.x + Math.cos(angle) * distance;
                const y = centerCell.y + Math.sin(angle) * distance;

                if (x - cellRadius < 0 || x + cellRadius > GAME_CONSTANTS.WORLD_WIDTH ||
                    y - cellRadius < 0 || y + cellRadius > GAME_CONSTANTS.WORLD_HEIGHT) {
                    continue;
                }

                let minDistToOthers = Infinity;
                for (const pos of positions) {
                    const dx = x - pos.x;
                    const dy = y - pos.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    minDistToOthers = Math.min(minDistToOthers, dist);
                }

                if (minDistToOthers > maxDistanceToOthers) {
                    maxDistanceToOthers = minDistToOthers;
                    bestPosition = { x, y, angle };
                }

                if (minDistToOthers > cellRadius * 3) {
                    break;
                }
            }

            if (bestPosition) {
                positions.push(bestPosition);
            } else {
                const angle = (Math.PI * 2 * i) / count;
                const x = centerCell.x + Math.cos(angle) * minDistance;
                const y = centerCell.y + Math.sin(angle) * minDistance;
                positions.push({ x, y, angle });
            }
        }

        return positions;
    }
}

// 2. GunItem クラスを追加（Virus クラスの後に追加）
class GunItem extends GameObject {
    constructor(x, y) {
        super(x, y, 50, 'gunItem');  // mass 50, type 'gunItem'
        this.color = '#FFD700';  // 金色
        this.icon = '🔫';
        this.pulsePhase = Math.random() * Math.PI * 2;
        this.rotation = 0;
        this.rotationSpeed = 0.02;
    }

    update(deltaTime) {
        super.update(deltaTime);
        this.rotation += this.rotationSpeed * deltaTime * 0.001;
        this.pulsePhase += deltaTime * 0.003;
    }
}



// 3. Bullet クラスを追加（GunItem クラスの後に追加）
class Bullet extends GameObject {
    constructor(x, y, angle, shooterId) {
        super(x, y, 10, 'bullet');
        this.shooterId = shooterId;
        this.color = '#000000';
        this.angle = angle;
        this.life = 3000;  // 3秒で消滅
        this.damage = GAME_CONSTANTS.GUN_BULLET_DAMAGE;

        // 速度設定
        this.vx = Math.cos(angle) * GAME_CONSTANTS.GUN_BULLET_SPEED;
        this.vy = Math.sin(angle) * GAME_CONSTANTS.GUN_BULLET_SPEED;

        this.radius = GAME_CONSTANTS.GUN_BULLET_RADIUS;
    }

    update(deltaTime) {
        super.update(deltaTime);

        // 🎯 EjectedMass と同じ摩擦処理を追加
        const friction = 0.80;
        this.vx *= friction;
        this.vy *= friction;

        // 🎯 速度が遅くなったら0にする
        if (Math.abs(this.vx) < 10 && Math.abs(this.vy) < 10) {
            this.vx = 0;
            this.vy = 0;
            // 🎯 停止したら即座に削除
            this.toDelete = true;
            console.log('🔫 Bullet stopped and deleted at position:', this.x, this.y);
        }

        this.life -= deltaTime;
        if (this.life <= 0) {
            this.toDelete = true;
        }
    }
}

// 🛡️ BarrierItem クラス
class BarrierItem extends GameObject {
    constructor(x, y) {
        super(x, y, 50, 'barrierItem');  // mass 50, type 'barrierItem'
        this.color = '#00BFFF';  // 水色
        this.icon = '🛡️';
        this.pulsePhase = Math.random() * Math.PI * 2;
        this.rotation = 0;
        this.rotationSpeed = 0.02;
    }


    update(deltaTime) {
        super.update(deltaTime);
        this.rotation += this.rotationSpeed * deltaTime * 0.001;
        this.pulsePhase += deltaTime * 0.003;
    }
}

// 👟 SpeedUpItem クラス
class SpeedUpItem extends GameObject {
    constructor(x, y) {
        super(x, y, 50, 'speedUpItem');  // mass 50, type 'speedUpItem'
        this.color = '#FF1493';  // ピンク色
        this.icon = '👟';
        this.pulsePhase = Math.random() * Math.PI * 2;
        this.rotation = 0;
        this.rotationSpeed = 0.02;
    }

    update(deltaTime) {
        super.update(deltaTime);
        this.rotation += this.rotationSpeed * deltaTime * 0.001;
        this.pulsePhase += deltaTime * 0.003;
    }
}

class EnhancedAgarServer {
    constructor() {
        this.players = new Map();
        this.gameObjects = new Map();
        this.viruses = new Map();

        this.quadTree = new QuadTree(0, 0, GAME_CONSTANTS.WORLD_WIDTH, GAME_CONSTANTS.WORLD_HEIGHT);

        this.lastUpdateTime = Date.now();
        this.gameTime = 0;
        this.leaderboard = [];
        this.lastLeaderboardUpdate = 0;

        // 🎯 チャットシステム
        this.chatMessages = [];
        this.maxChatMessages = 50;
        // 🔫 銃アイテム関連
        this.gunItems = new Map();
        this.bullets = new Map();
        this.lastGunItemSpawn = Date.now();

        // 🛡️ バリアアイテム関連
        this.barrierItems = new Map();
        this.lastBarrierItemSpawn = Date.now();

        // 👟 スピードアップアイテム関連
        this.speedUpItems = new Map();
        this.lastSpeedUpItemSpawn = Date.now();

        // 🦠 ウイルス自動スポーン関連
        this.lastVirusSpawn = Date.now();

        this.stats = {
            updateTime: 0,
            collisionTime: 0,
            positionAdjustmentTime: 0,
            playersCount: 0,
            foodsCount: 0,
            virusesCount: 0,
            memoryUsage: 0,
            virusRiskRewards: 0,
            smallPlayersIgnored: 0,
            protectedCells: 0,
            positionAdjustments: 0,
            chatMessagesCount: 0,
            gunItemsCount: 0,
            bulletsCount: 0,
            playersWithGun: 0,
            barrierItemsCount: 0,
            playersWithBarrier: 0,
            speedUpItemsCount: 0,
            playersWithSpeedUp: 0

        };

        this.initializeWorld();
        this.startGameLoop();
        this.testFormulas();


    }

    testFormulas() {
        console.log("\n🧪 Agar.io with CHAT SYSTEM & VIRUS RISK & REWARD:");
        console.log("💬 Real-time chat: Players can communicate during gameplay");
        console.log("📏 Small players (<120 mass): 🛡️ Virus immunity");
        console.log("⚡ Big players (120+ mass): 💰+100 mass, 💥split to 8 cells, 💀virus destroyed");
        console.log("🌊 Smooth positioning: Gentle non-overlapping adjustment");
        console.log("─".repeat(70));

        const testMasses = [10, 50, 100, 120, 200, 500, 1000];

        for (const mass of testMasses) {
            const radius = GAME_CONSTANTS.MASS_TO_RADIUS(mass);
            const speed = GAME_CONSTANTS.SPEED_FORMULA(mass);
            let virusEffect;

            if (mass < GAME_CONSTANTS.VIRUS_MIN_INTERACTION_MASS) {
                virusEffect = "🛡️ Immune";
            } else {
                const cellMass = (mass + 100) / 8;
                virusEffect = `💰+100, 💥→8×${cellMass.toFixed(1)}, 💀virus dies`;
            }

            console.log(`質量 ${mass.toString().padStart(4)} → 半径 ${radius.toFixed(2)} → 速度 ${speed.toFixed(1)} → ${virusEffect}`);
        }
        console.log("─".repeat(70));
        console.log("✅ Chat System Enabled (2000x2000 world)");
        console.log("💬 Real-time messaging between players");
        console.log("🎯 Strategic gameplay: Small=Safe, Big=High Risk & High Reward\n");
    }

    initializeWorld() {
        console.log("🌍 Initializing enhanced world with chat system...");

        for (let i = 0; i < GAME_CONSTANTS.FOOD_COUNT; i++) {
            this.createFood();
        }

        for (let i = 0; i < GAME_CONSTANTS.VIRUS_COUNT; i++) {
            this.createVirus();
        }

        console.log(`🍎 Foods: ${this.gameObjects.size} | 🦠 Viruses: ${this.viruses.size}`);
        console.log(`💬 Chat system initialized`);
    }

    createFood() {
        const x = Math.random() * (GAME_CONSTANTS.WORLD_WIDTH - 100) + 50;
        const y = Math.random() * (GAME_CONSTANTS.WORLD_HEIGHT - 100) + 50;

        const food = new Food(x, y, GAME_CONSTANTS.FOOD_INITIAL_MASS);
        this.gameObjects.set(food.id, food);
        return food;
    }

    createVirus() {
        const x = Math.random() * (GAME_CONSTANTS.WORLD_WIDTH - 200) + 100;
        const y = Math.random() * (GAME_CONSTANTS.WORLD_HEIGHT - 200) + 100;

        const virus = new Virus(x, y);
        this.viruses.set(virus.id, virus);
        this.gameObjects.set(virus.id, virus);

        return virus;
    }
    // 5. createGunItem メソッドを追加（createVirus の後に追加）F
    createGunItem() {
        const x = Math.random() * (GAME_CONSTANTS.WORLD_WIDTH - 200) + 100;
        const y = Math.random() * (GAME_CONSTANTS.WORLD_HEIGHT - 200) + 100;

        const gunItem = new GunItem(x, y);
        this.gunItems.set(gunItem.id, gunItem);
        this.gameObjects.set(gunItem.id, gunItem);

        console.log(`🔫 Gun item spawned at (${x.toFixed(0)}, ${y.toFixed(0)})`);
        return gunItem;
    }

    // 🛡️ createBarrierItem メソッド
    createBarrierItem() {
        const x = Math.random() * (GAME_CONSTANTS.WORLD_WIDTH - 200) + 100;
        const y = Math.random() * (GAME_CONSTANTS.WORLD_HEIGHT - 200) + 100;

        const barrierItem = new BarrierItem(x, y);
        this.barrierItems.set(barrierItem.id, barrierItem);
        this.gameObjects.set(barrierItem.id, barrierItem);

        console.log(`🛡️ Barrier item spawned at (${x.toFixed(0)}, ${y.toFixed(0)})`);
        return barrierItem;
    }

    // 👟 createSpeedUpItem メソッド
    createSpeedUpItem() {
        const x = Math.random() * (GAME_CONSTANTS.WORLD_WIDTH - 200) + 100;
        const y = Math.random() * (GAME_CONSTANTS.WORLD_HEIGHT - 200) + 100;

        const speedUpItem = new SpeedUpItem(x, y);
        this.speedUpItems.set(speedUpItem.id, speedUpItem);
        this.gameObjects.set(speedUpItem.id, speedUpItem);

        console.log(`👟 SpeedUp item spawned at (${x.toFixed(0)}, ${y.toFixed(0)})`);
        return speedUpItem;
    }

    // ===== 🛍️ SHOP: BUY GUN（追加）=====
    handleBuyGun(socketId) {
        const player = this.players.get(socketId);
        if (!player?.cells?.length) {
            return { success: false, message: "プレイヤーが見つかりません" };
        }

        if (player.hasGun) {
            return { success: false, message: "既に銃を装備しています" };
        }

        const totalMass = getTotalMass(player);
        if (totalMass < GAME_CONSTANTS.SHOP_MIN_MASS_TO_BUY) {
            return {
                success: false,
                message: `質量が足りません (必要: ${GAME_CONSTANTS.SHOP_MIN_MASS_TO_BUY}, 現在: ${Math.floor(totalMass)})`
            };
        }

        const paid = removeMassForPurchase(player, GAME_CONSTANTS.SHOP_GUN_PRICE);
        if (!paid) {
            return { success: false, message: "購入処理に失敗しました（質量減算不可）" };
        }

        player.hasGun = true;
        player.gunAcquiredTime = Date.now();
        player.gunBullets = GAME_CONSTANTS.SHOP_GUN_BULLETS;
        player.lastGunShot = 0;

        // 購入者へ：既存クライアントが gun_acquired を持っているなら送る（UI即反映）
        const sock = Array.from(io.sockets.sockets.values()).find(s => s.id === player.id);
        if (sock) {
            sock.emit("gun_acquired", {
                duration: GAME_CONSTANTS.SHOP_GUN_DURATION,
                bullets: player.gunBullets,
                source: "shop"
            });
        }

        // 全体通知
        io.emit("player_bought_gun", { playerId: player.id, playerName: player.name });

        return {
            success: true,
            message: `銃を購入しました！（弾数: ${player.gunBullets}）`,
            bulletsLeft: player.gunBullets,
            duration: GAME_CONSTANTS.SHOP_GUN_DURATION
        };
    }

    // ===== 🛍️ SHOP: BUY BARRIER（追加）=====
    handleBuyBarrier(socketId) {
        const player = this.players.get(socketId);
        if (!player?.cells?.length) {
            return { success: false, message: "プレイヤーが見つかりません" };
        }

        if (player.hasBarrier || player.barrierActive) {
            return { success: false, message: "既にバリアを所持/発動しています" };
        }

        const totalMass = getTotalMass(player);
        if (totalMass < GAME_CONSTANTS.SHOP_BARRIER_PRICE) {
            return {
                success: false,
                message: `質量が足りません（必要: ${GAME_CONSTANTS.SHOP_BARRIER_PRICE}, 現在: ${Math.floor(totalMass)}）`
            };
        }

        const paid = removeMassForPurchase(player, GAME_CONSTANTS.SHOP_BARRIER_PRICE);
        if (!paid) {
            return { success: false, message: "購入処理に失敗しました（質量減算不可）" };
        }

        // ✅ 購入＝所持（未発動）
        player.hasBarrier = true;
        player.barrierActive = false;
        player.barrierActivatedTime = 0;

        // 購入者へ：既存クライアントの barrier_acquired があるなら送る（UI即反映）
        const sock = Array.from(io.sockets.sockets.values()).find(s => s.id === player.id);
        if (sock) {
            sock.emit("barrier_acquired", { source: "shop" });
        }

        // 全体通知（イベント名は指定通り）
        io.emit("player_bought_barrier", { playerId: player.id, playerName: player.name });

        return {
            success: true,
            message: "バリアを購入しました！（未発動）"
        };
    }




    addPlayer(socketId, name) {
        const x = Math.random() * (GAME_CONSTANTS.WORLD_WIDTH - 400) + 200;
        const y = Math.random() * (GAME_CONSTANTS.WORLD_HEIGHT - 400) + 200;

        const playerCell = new PlayerCell(x, y, GAME_CONSTANTS.INITIAL_MASS, socketId, name);
        const player = {
            id: socketId,
            name: name || `Player_${socketId.substring(0, 6)}`,
            cells: [playerCell],
            score: GAME_CONSTANTS.INITIAL_MASS,
            alive: true,
            lastUpdate: Date.now(),
            lastEjectTime: 0,
            skin: playerCell.skin,
            virusRiskRewards: 0,
            // ===== 🛡️ BARRIER STATE（追加）=====
            hasBarrier: false,
            barrierActive: false,
            barrierActivatedTime: 0,

        };

        this.players.set(socketId, player);
        this.gameObjects.set(playerCell.id, playerCell);

        // 🎯 参加メッセージをチャットに追加
        const joinMessage = {
            id: Date.now() + Math.random(),
            message: `${player.name} が参加しました`,
            timestamp: Date.now(),
            type: 'system'
        };
        this.chatMessages.push(joinMessage);
        if (this.chatMessages.length > this.maxChatMessages) {
            this.chatMessages.shift();
        }
        io.emit("chat_message", joinMessage);

        console.log(`✅ ${player.name} joined - Mass: ${playerCell.mass} | Radius: ${playerCell.radius.toFixed(3)}`);
        return player;
    }

    removePlayer(socketId) {
        const player = this.players.get(socketId);
        if (player) {
            player.cells.forEach(cell => {
                this.gameObjects.delete(cell.id);
            });
            this.players.delete(socketId);

            // 🎯 退出メッセージをチャットに追加
            const leaveMessage = {
                id: Date.now() + Math.random(),
                message: `${player.name} が退出しました`,
                timestamp: Date.now(),
                type: 'system'
            };
            this.chatMessages.push(leaveMessage);
            if (this.chatMessages.length > this.maxChatMessages) {
                this.chatMessages.shift();
            }
            io.emit("chat_message", leaveMessage);

            console.log(`❌ ${player.name} left the game`);
        }
    }
    removePlayerByBullet(playerId, killerName) {
        const player = this.players.get(playerId);
        if (!player) return;

        // プレイヤーのセルを削除
        player.cells.forEach(cell => {
            this.gameObjects.delete(cell.id);
        });

        // 死亡情報を送信
        const playerSocket = Array.from(io.sockets.sockets.values())
            .find(s => s.id === playerId);

        if (playerSocket) {
            playerSocket.emit('player_death', {
                killedBy: killerName,
                finalMass: player.cells.reduce((sum, cell) => sum + cell.mass, 0),
                finalScore: player.score,
                timestamp: Date.now(),
                deathReason: 'bullet'  // 🎯 弾による死亡
            });
        }

        // プレイヤーを削除
        this.players.delete(playerId);

        // 退出メッセージ
        const leaveMessage = {
            id: Date.now() + Math.random(),
            message: `${player.name} が ${killerName} の弾で倒されました`,
            timestamp: Date.now(),
            type: 'system'
        };
        this.chatMessages.push(leaveMessage);
        if (this.chatMessages.length > this.maxChatMessages) {
            this.chatMessages.shift();
        }
        io.emit("chat_message", leaveMessage);

        console.log(`💀 ${player.name} was killed by ${killerName}'s bullet`);

        // 他のプレイヤーに通知
        io.emit('player_left', { playerId: playerId });
    }

    handlePlayerMove(socketId, data) {
        const player = this.players.get(socketId);
        if (!player || !player.cells.length) {
            return;
        }

        const { targetX, targetY } = data;

        if (typeof targetX !== 'number' || typeof targetY !== 'number' ||
            !isFinite(targetX) || !isFinite(targetY)) {
            return;
        }

        const clampedX = Math.max(50, Math.min(GAME_CONSTANTS.WORLD_WIDTH - 50, targetX));
        const clampedY = Math.max(50, Math.min(GAME_CONSTANTS.WORLD_HEIGHT - 50, targetY));

        for (let i = 0; i < player.cells.length; i++) {
            const cell = player.cells[i];
            cell.targetX = clampedX;
            cell.targetY = clampedY;
        }

        player.lastUpdate = Date.now();
    }

    handlePlayerSplit(socketId, data) {
        const player = this.players.get(socketId);
        if (!player || player.cells.length >= GAME_CONSTANTS.MAX_CELLS_PER_PLAYER) {
            return false;
        }

        const now = Date.now();
        const newCells = [];
        const mouseX = data.mouseX || data.x || 0;
        const mouseY = data.mouseY || data.y || 0;

        player.cells.forEach((cell, index) => {
            if (cell.mass >= GAME_CONSTANTS.SPLIT_MIN_MASS &&
                now - cell.lastSplitTime > 1000) {

                const dx = mouseX - cell.x;
                const dy = mouseY - cell.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const angle = distance > 0 ? Math.atan2(dy, dx) : 0;

                const newCell = cell.split(angle, mouseX, mouseY);

                if (newCell) {
                    newCells.push(newCell);
                    this.gameObjects.set(newCell.id, newCell);
                }
            }
        });

        if (newCells.length > 0) {
            player.cells.push(...newCells);
            console.log(`✂️ ${player.name} split into ${player.cells.length} cells`);
            return true;
        }

        return false;
    }

    handlePlayerEject(socketId, data) {
        const player = this.players.get(socketId);
        if (!player) return false;

        const now = Date.now();

        if (player.lastEjectTime && now - player.lastEjectTime < 120) {
            return false;
        }

        let ejectedCount = 0;

        let mouseDirection = null;
        if (data && typeof data.mouseX === 'number' && typeof data.mouseY === 'number') {
            if (isFinite(data.mouseX) && isFinite(data.mouseY) &&
                data.mouseX >= 0 && data.mouseX <= GAME_CONSTANTS.WORLD_WIDTH &&
                data.mouseY >= 0 && data.mouseY <= GAME_CONSTANTS.WORLD_HEIGHT) {
                mouseDirection = {
                    x: data.mouseX,
                    y: data.mouseY
                };
            }
        }

        for (const cell of player.cells) {
            cell.update(deltaTime, player);  // 👟 player を渡す
            if (ejectedCount >= 1) break;

            if (cell.mass >= GAME_CONSTANTS.EJECT_MIN_MASS) {
                let defaultAngle = 0;
                if (!mouseDirection) {
                    const dx = cell.targetX - cell.x;
                    const dy = cell.targetY - cell.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance > 10) {
                        defaultAngle = Math.atan2(dy, dx);
                    } else {
                        defaultAngle = Math.random() * Math.PI * 2;
                    }
                }

                const ejectedMass = cell.ejectMass(defaultAngle, mouseDirection);

                if (ejectedMass) {
                    this.gameObjects.set(ejectedMass.id, ejectedMass);
                    ejectedCount++;
                }
            }
        }

        if (ejectedCount > 0) {
            player.lastEjectTime = now;
            return true;
        }

        return false;
    }

    handleGunShoot(socketId, data) {
        const player = this.players.get(socketId);
        if (!player || !player.hasGun || !player.cells[0]) {
            return false;
        }

        const now = Date.now();

        // クールダウンチェック
        if (player.lastGunShot && now - player.lastGunShot < GAME_CONSTANTS.GUN_COOLDOWN) {
            return false;
        }

        // 弾数チェック
        if (player.gunBullets <= 0) {
            // 🎯 弾数が0になったら銃を失う
            player.hasGun = false;
            player.gunBullets = 0;

            const socket = Array.from(io.sockets.sockets.values())
                .find(s => s.id === socketId);
            if (socket) {
                socket.emit('gun_expired');
            }

            console.log(`🔫 ${player.name}'s gun ran out of bullets`);
            return false;
        }

        const cell = player.cells[0];
        const dx = data.mouseX - cell.x;
        const dy = data.mouseY - cell.y;
        const angle = Math.atan2(dy, dx);

        // 弾を生成
        const bulletX = cell.x + Math.cos(angle) * (cell.radius + 10);
        const bulletY = cell.y + Math.sin(angle) * (cell.radius + 10);
        const bullet = new Bullet(bulletX, bulletY, angle, socketId);

        this.bullets.set(bullet.id, bullet);
        this.gameObjects.set(bullet.id, bullet);

        // 弾数を減らす
        player.gunBullets--;
        player.lastGunShot = now;

        // クライアントに通知
        const socket = Array.from(io.sockets.sockets.values())
            .find(s => s.id === socketId);
        if (socket) {
            socket.emit('gun_shot_success', {
                bulletsLeft: player.gunBullets
            });
        }

        // 🎯 弾数が0になったかチェック
        if (player.gunBullets <= 0) {
            player.hasGun = false;
            if (socket) {
                socket.emit('gun_expired');
            }
            console.log(`🔫 ${player.name} used last bullet`);
        }

        console.log(`🔫 ${player.name} shot! Bullets left: ${player.gunBullets}`);
        return true;
    }

    // 🛡️ バリア発動処理（新規追加）
    handleBarrierActivate(socketId) {
        const player = this.players.get(socketId);
        if (!player) {
            console.log(`❌ Player not found: ${socketId}`);
            return false;
        }

        // バリアを持っていない場合
        if (!player.hasBarrier) {
            console.log(`🛡️❌ ${player.name} does not have barrier`);
            return false;
        }

        // すでに発動中の場合
        if (player.barrierActive) {
            console.log(`🛡️❌ ${player.name}'s barrier is already active`);
            return false;
        }

        // ✅ バリアを発動
        player.barrierActive = true;
        player.barrierAcquiredTime = Date.now();

        console.log(`🛡️✅ ${player.name} activated barrier! Duration: 10s`);

        const socket = Array.from(io.sockets.sockets.values())
            .find(s => s.id === player.id);
        if (socket) {
            socket.emit('barrier_activated', {
                duration: GAME_CONSTANTS.BARRIER_DURATION
            });
        }
        // 👟 スピードアップ時間の更新
        if (player.speedUpActive && player.speedUpTimeLeft > 0) {
            player.speedUpTimeLeft -= deltaTime;
            if (player.speedUpTimeLeft <= 0) {
                player.speedUpActive = false;
                player.hasSpeedUp = false;
                player.speedUpTimeLeft = 0;

                const socket = Array.from(io.sockets.sockets.values())
                    .find(s => s.id === player.id);
                if (socket) {
                    socket.emit('speedup_expired');
                }
                console.log(`👟 ${player.name}'s speedup expired`);
            }
        }



        return true;
    }
    // 🎯 チャットメッセージ処理
    handleChatMessage(socketId, data) {
        const player = this.players.get(socketId);
        if (!player) {
            return { success: false, error: "プレイヤーが見つかりません" };
        }

        const message = data.message?.trim();
        if (!message) {
            return { success: false, error: "メッセージが空です" };
        }

        if (message.length > 100) {
            return { success: false, error: "メッセージが長すぎます(100文字以内)" };
        }

        const chatMessage = {
            id: Date.now() + Math.random(),
            playerId: socketId,
            playerName: player.name,
            playerColor: player.cells[0]?.color || '#333',
            message: message,
            timestamp: Date.now(),
            type: 'normal'
        };

        this.chatMessages.push(chatMessage);
        if (this.chatMessages.length > this.maxChatMessages) {
            this.chatMessages.shift();
        }

        this.stats.chatMessagesCount = this.chatMessages.length;

        io.emit("chat_message", chatMessage);

        console.log(`💬 ${player.name}: ${message}`);

        return { success: true, message: chatMessage };
    }

    updateGame(deltaTime) {
        const updateStart = Date.now();
        this.gameTime += deltaTime;



        for (const [id, obj] of this.gameObjects) {
            obj.update(deltaTime);

            if (obj.toDelete) {
                this.gameObjects.delete(id);

            }
        }
        // 🎯 bullets Map からの削除処理を追加
        for (const [id, bullet] of this.bullets) {
            if (bullet.toDelete) {
                this.bullets.delete(id);
                console.log('🔫 Bullet cleaned up:', id);
            }
        }



        const currentFoodCount = Array.from(this.gameObjects.values())
            .filter(obj => obj.type === 'food').length;

        if (currentFoodCount < GAME_CONSTANTS.FOOD_COUNT) {
            for (let i = 0; i < 3; i++) {
                this.createFood();
            }
        }

        this.players.forEach(player => {
            this.checkCellMerging(player);
        });

        this.handleSmoothPositioning();

        this.checkCollisions();

        this.checkVirusInteractions();

        if (this.gameTime - this.lastLeaderboardUpdate > GAME_CONSTANTS.LEADERBOARD_UPDATE_RATE) {
            this.updateLeaderboard();
            this.lastLeaderboardUpdate = this.gameTime;
        }
        // 🔫 銃アイテムのスポーン（30秒ごとに6個まで）
        const now = Date.now();
        if (now - this.lastGunItemSpawn >= GAME_CONSTANTS.GUN_ITEM_SPAWN_INTERVAL) {
            // 🎯 既存の銃アイテムが2個未満の場合のみスポーン
            if (this.gunItems.size < GAME_CONSTANTS.GUN_ITEM_MAX_COUNT) {
                this.createGunItem();
                console.log(`🔫 Gun item spawned! Total: ${this.gunItems.size}/${GAME_CONSTANTS.GUN_ITEM_MAX_COUNT}`);
            }
            this.lastGunItemSpawn = now;
        }

        // 🛡️ バリアアイテムのスポーン（1分ごとに1個まで）
        if (now - this.lastBarrierItemSpawn >= GAME_CONSTANTS.BARRIER_ITEM_SPAWN_INTERVAL) {
            if (this.barrierItems.size < GAME_CONSTANTS.BARRIER_ITEM_MAX_COUNT) {
                this.createBarrierItem();
                console.log(`🛡️ Barrier item spawned! Total: ${this.barrierItems.size}/${GAME_CONSTANTS.BARRIER_ITEM_MAX_COUNT}`);
            }
            this.lastBarrierItemSpawn = now;
        }

        // 🛡️ バリアの有効時間チェック（修正版）
        for (const player of this.players.values()) {
            // ✅ barrierActiveがtrueの時のみ期限チェック
            if (player.barrierActive && player.barrierAcquiredTime &&
                now - player.barrierAcquiredTime >= GAME_CONSTANTS.BARRIER_DURATION) {
                player.hasBarrier = false;
                player.barrierActive = false;
                console.log(`🛡️ ${player.name}'s barrier expired`);

                // クライアントに通知
                const socket = Array.from(io.sockets.sockets.values())
                    .find(s => s.id === player.id);
                if (socket) {
                    socket.emit('barrier_expired');
                }
            }
        }


        // 👟 スピードアップアイテムのスポーン（45秒ごとに4個まで）
        if (now - this.lastSpeedUpItemSpawn >= GAME_CONSTANTS.SPEEDUP_ITEM_SPAWN_INTERVAL) {
            if (this.speedUpItems.size < GAME_CONSTANTS.SPEEDUP_ITEM_MAX_COUNT) {
                this.createSpeedUpItem();
                console.log(`👟 SpeedUp item spawned! Total: ${this.speedUpItems.size}/${GAME_CONSTANTS.SPEEDUP_ITEM_MAX_COUNT}`);
            }
            this.lastSpeedUpItemSpawn = now;
        }

        // 🦠 ウイルスの自動スポーン（30秒ごとに15個まで）
        if (now - this.lastVirusSpawn >= GAME_CONSTANTS.VIRUS_SPAWN_INTERVAL) {
            if (this.viruses.size < GAME_CONSTANTS.VIRUS_MAX_COUNT) {
                this.createVirus();
                console.log(`🦠 Virus auto-spawned! Total: ${this.viruses.size}/${GAME_CONSTANTS.VIRUS_MAX_COUNT}`);
            }
            this.lastVirusSpawn = now;
        }

        // === オブジェクトの更新 ===
        for (const obj of this.gameObjects.values()) {
            // ✅ 削除マークされていないオブジェクトのみ更新
            if (!obj.toDelete) {
                obj.update(deltaTime);
            }
        }

        // === 銃アイテムの更新 ===
        for (const [id, item] of this.gunItems.entries()) {
            // ✅ 削除マークされていないアイテムのみ更新
            if (!item.toDelete) {
                item.update(deltaTime);
            }
        }

        // === バリアアイテムの更新 ===
        for (const [id, item] of this.barrierItems.entries()) {
            // ✅ 削除マークされていないアイテムのみ更新
            if (!item.toDelete) {
                item.update(deltaTime);
            }
        }

        // 👟 スピードアップアイテムの更新
        for (const [id, item] of this.speedUpItems.entries()) {
            // ✅ 削除マークされていないアイテムのみ更新
            if (!item.toDelete) {
                item.update(deltaTime);
            }
        }


        // 弾の衝突チェック
        this.checkBulletCollisions();

        this.stats.updateTime = Date.now() - updateStart;
        this.stats.playersCount = this.players.size;
        this.stats.foodsCount = currentFoodCount;
        this.stats.virusesCount = this.viruses.size;
        this.stats.chatMessagesCount = this.chatMessages.length;

        this.stats.gunItemsCount = this.gunItems.size;
        this.stats.bulletsCount = this.bullets.size;
        this.stats.playersWithGun = Array.from(this.players.values())
            .filter(p => p.hasGun).length;
        this.stats.barrierItemsCount = this.barrierItems.size;
        this.stats.playersWithBarrier = Array.from(this.players.values())
            .filter(p => p.hasBarrier).length;

        // 👟 スピードアップの統計情報（新規追加）
        this.stats.speedUpItemsCount = this.speedUpItems.size;
        this.stats.playersWithSpeedUp = Array.from(this.players.values())
            .filter(p => p.hasSpeedUp).length;

    }

    handleSmoothPositioning() {
        const positioningStart = Date.now();
        let adjustmentCount = 0;

        for (const player of this.players.values()) {
            for (let i = 0; i < player.cells.length; i++) {
                const cell1 = player.cells[i];

                for (let j = i + 1; j < player.cells.length; j++) {
                    const cell2 = player.cells[j];

                    if (cell1.canMerge && cell2.canMerge &&
                        cell1.distanceTo(cell2) < (cell1.radius + cell2.radius) * 0.9) {
                        continue;
                    }

                    if ((cell1.isProtected || cell2.isProtected) && cell1.isOverlappingWith(cell2)) {
                        cell1.adjustPositionAwayFrom(cell2);
                        cell2.adjustPositionAwayFrom(cell1);
                        adjustmentCount++;
                    } else if (cell1.isOverlappingWith(cell2)) {
                        cell1.adjustPositionAwayFrom(cell2);
                        cell2.adjustPositionAwayFrom(cell1);
                        adjustmentCount++;
                    }
                }

                for (const otherPlayer of this.players.values()) {
                    if (otherPlayer.id === player.id) continue;

                    for (const otherCell of otherPlayer.cells) {
                        if (cell1.isOverlappingWith(otherCell)) {
                            cell1.adjustPositionAwayFrom(otherCell);
                            adjustmentCount++;
                        }
                    }
                }
            }
        }

        this.stats.positionAdjustmentTime = Date.now() - positioningStart;
        this.stats.positionAdjustments = adjustmentCount;

        let protectedCount = 0;
        for (const player of this.players.values()) {
            for (const cell of player.cells) {
                if (cell.isProtected) {
                    protectedCount++;
                }
            }
        }
        this.stats.protectedCells = protectedCount;
    }

    checkCellMerging(player) {
        if (player.cells.length <= 1) return;

        for (let i = 0; i < player.cells.length - 1; i++) {
            for (let j = i + 1; j < player.cells.length; j++) {
                const cell1 = player.cells[i];
                const cell2 = player.cells[j];

                if (cell1.isProtected || cell2.isProtected) {
                    continue;
                }

                if (cell1.canMerge && cell2.canMerge) {

                    const distance = cell1.distanceTo(cell2);
                    const mergeDistance = (cell1.radius + cell2.radius) * 1.2;

                    if (distance < mergeDistance) {
                        if (cell1.mass >= cell2.mass) {
                            cell1.setMass(cell1.mass + cell2.mass);
                            this.gameObjects.delete(cell2.id);
                            player.cells.splice(j, 1);
                        } else {
                            cell2.setMass(cell1.mass + cell2.mass);
                            this.gameObjects.delete(cell1.id);
                            player.cells.splice(i, 1);
                        }
                        console.log(`🔗 ${player.name} merged cells: ${player.cells.length} cells remaining`);
                        break;
                    }
                    continue;
                }

            }
        }
    }

    checkCollisions() {
        const collisionStart = Date.now();

        this.quadTree.clear();

        for (const obj of this.gameObjects.values()) {
            this.quadTree.insert({
                x: obj.x - obj.radius,
                y: obj.y - obj.radius,
                width: obj.radius * 2,
                height: obj.radius * 2,
                radius: obj.radius,
                object: obj
            });
        }

        for (const player of this.players.values()) {
            for (const cell of player.cells) {
                const nearbyObjects = [];
                this.quadTree.retrieve(nearbyObjects, {
                    x: cell.x - cell.radius,
                    y: cell.y - cell.radius,
                    width: cell.radius * 2,
                    height: cell.radius * 2,
                    radius: cell.radius
                });

                for (const nearby of nearbyObjects) {
                    const obj = nearby.object;
                    if (obj === cell) continue;

                    this.processCollision(cell, obj);
                }
            }
        }

        // プレイヤー同士の衝突
        for (const predator of this.players.values()) {
            if (!predator.alive || !predator.cells.length) continue;

            for (let i = 0; i < predator.cells.length; i++) {
                const predatorCell = predator.cells[i];

                for (const prey of this.players.values()) {
                    if (predator.id === prey.id || !prey.alive || !prey.cells.length) continue;

                    // 🛡️ どちらかがバリアを持っている場合は衝突判定をスキップ
                    if (predator.hasBarrier || prey.hasBarrier) {
                        continue;
                    }

                    for (let j = prey.cells.length - 1; j >= 0; j--) {
                        const preyCell = prey.cells[j];


                    }
                }
            }
        }
        // ✅ 削除予定のオブジェクトを除外してQuadTreeに挿入
        for (const obj of this.gameObjects.values()) {
            if (!obj.toDelete && obj.type !== 'bullet') {  // 弾は別処理
                this.quadTree.insert(obj);
            }
        }

        // プレイヤーセルの衝突チェック
        for (const player of this.players.values()) {
            for (const cell of player.cells) {
                // ✅ 削除予定のセルはスキップ
                if (cell.toDelete) continue;

                const nearbyObjects = [];
                this.quadTree.retrieve(nearbyObjects, cell);

                for (const other of nearbyObjects) {
                    // ✅ 既に削除マークされているオブジェクトはスキップ
                    if (other.toDelete) continue;

                    // 自分自身との衝突はスキップ
                    if (other.id === cell.id) continue;

                    // 同じプレイヤーのセル同士はスキップ
                    if (other.type === 'player' && other.playerId === cell.playerId) {
                        continue;
                    }

                    // 衝突判定
                    if (cell.collidesWith(other)) {
                        this.processCollision(cell, other);
                    }
                }
            }
        }

        // ✅ 削除マークされたオブジェクトを実際に削除
        for (const [id, obj] of this.gameObjects.entries()) {
            if (obj.toDelete) {
                this.gameObjects.delete(id);

                // 各種マップからも削除
                if (obj.type === 'gunItem') {
                    this.gunItems.delete(id);
                } else if (obj.type === 'barrierItem') {
                    this.barrierItems.delete(id);
                } else if (obj.type === 'virus') {
                    this.viruses.delete(id);
                }
            }
        }

        this.stats.collisionTime = Date.now() - collisionStart;
    }







    processCollision(playerCell, other) {
        if (!playerCell.collidesWith(other)) return;

        switch (other.type) {
            case 'food':
                if (playerCell.canEat(other)) {
                    const nutritionalValue = other.getNutritionalValue();
                    playerCell.setMass(playerCell.mass + nutritionalValue);
                    other.toDelete = true;

                    const player = this.players.get(playerCell.playerId);
                    if (player) {
                        player.score += nutritionalValue;
                    }
                }
                break;

            case 'ejectedMass':
                if (playerCell.canEat(other)) {
                    playerCell.setMass(playerCell.mass + other.mass);
                    other.toDelete = true;

                    const player = this.players.get(playerCell.playerId);
                    if (player) {
                        player.score += Math.floor(other.mass);
                    }
                }
                break;

            // processCollision メソッド内の case 'player': 部分を修正
            // 🎯 修正: processCollision 関数の case 'player' 部分
            // この部分を既存のserver.jsの該当箇所と置き換えてください

            case 'player':
                const otherPlayer = this.players.get(other.playerId);
                if (otherPlayer && otherPlayer.id !== playerCell.playerId) {

                    const player = this.players.get(playerCell.playerId);

                    // 🛡️ どちらかがバリア発動中の場合は捕食できない
                    if (player?.barrierActive || otherPlayer?.barrierActive) {
                        console.log(`🛡️ Barrier blocked player collision`);
                        break;
                    }

                    if (playerCell.canEat(other)) {
                        // プレイヤーを食べる処理
                        const gainedMass = other.mass;
                        playerCell.setMass(playerCell.mass + gainedMass);
                        player.score += Math.floor(gainedMass);

                        const preyPlayer = this.players.get(other.playerId);
                        if (preyPlayer) {
                            // 🎯 修正: 食べられたセルを除外
                            preyPlayer.cells = preyPlayer.cells.filter(cell => cell.id !== other.id);

                            // 🎯 修正: スコアを減らす（失った質量分）
                            preyPlayer.score = Math.max(0, preyPlayer.score - Math.floor(gainedMass));

                            // 🎯 修正: 残りのセルの合計質量を計算
                            const remainingMass = preyPlayer.cells.reduce((sum, cell) => sum + cell.mass, 0);
                            console.log(`📉 ${preyPlayer.name} lost a cell (${gainedMass.toFixed(1)} mass). Remaining cells: ${preyPlayer.cells.length}, Total mass: ${remainingMass.toFixed(1)}`);

                            // 🎯 全てのセルが失われた場合のみ敗北
                            if (preyPlayer.cells.length === 0) {
                                console.log(`💀 ${preyPlayer.name} was completely eliminated by ${player.name}`);

                                io.to(preyPlayer.id).emit('player_death', {
                                    killedBy: player.name,
                                    finalMass: gainedMass,
                                    finalScore: preyPlayer.score,
                                    timestamp: Date.now()
                                });

                                this.removePlayer(preyPlayer.id);
                            }
                        }

                        other.toDelete = true;

                        io.emit('player_eaten', {
                            predatorId: player.id,
                            preyId: other.playerId,
                            cellId: other.id,
                            remainingCells: preyPlayer ? preyPlayer.cells.length : 0  // 🎯 残りのセル数を通知
                        });

                    } else if (other.canEat(playerCell)) {
                        // 自分が食べられる処理
                        const lostMass = playerCell.mass;
                        other.setMass(other.mass + lostMass);
                        otherPlayer.score += Math.floor(lostMass);

                        // 🎯 修正: 自分のセルを除外
                        player.cells = player.cells.filter(cell => cell.id !== playerCell.id);

                        // 🎯 修正: スコアを減らす（失った質量分）
                        player.score = Math.max(0, player.score - Math.floor(lostMass));

                        // 🎯 修正: 残りのセルの合計質量を計算
                        const remainingMass = player.cells.reduce((sum, cell) => sum + cell.mass, 0);
                        console.log(`📉 ${player.name} lost a cell (${lostMass.toFixed(1)} mass). Remaining cells: ${player.cells.length}, Total mass: ${remainingMass.toFixed(1)}`);

                        // 🎯 全てのセルが失われた場合のみ敗北
                        if (player.cells.length === 0) {
                            console.log(`💀 ${player.name} was completely eliminated by ${otherPlayer.name}`);

                            io.to(player.id).emit('player_death', {
                                killedBy: otherPlayer.name,
                                finalMass: lostMass,
                                finalScore: player.score,
                                timestamp: Date.now()
                            });

                            this.removePlayer(player.id);
                        }

                        playerCell.toDelete = true;

                        io.emit('player_eaten', {
                            predatorId: otherPlayer.id,
                            preyId: player.id,
                            cellId: playerCell.id,
                            remainingCells: player ? player.cells.length : 0  // 🎯 残りのセル数を通知
                        });
                    }
                }
                break;

            case 'virus':
                const virus = other;
                const player = this.players.get(playerCell.playerId);

                if (!player) break;

                if (playerCell.mass < GAME_CONSTANTS.VIRUS_MIN_INTERACTION_MASS) {
                    this.stats.smallPlayersIgnored++;
                    break;
                }

                if (virus.canInteractWithPlayer(playerCell)) {
                    const result = virus.processRiskReward(playerCell);

                    player.score += result.bonusMass;
                    player.virusRiskRewards++;
                    this.stats.virusRiskRewards++;

                    if (result.newCells.length > 0) {
                        result.newCells.forEach(newCell => {
                            this.gameObjects.set(newCell.id, newCell);
                        });
                        player.cells.push(...result.newCells);
                    }

                    if (result.virusDestroyed) {
                        virus.toDelete = true;
                        this.viruses.delete(virus.id);
                    }

                    io.emit('virus_risk_reward', {
                        playerId: player.id,
                        bonusMass: result.bonusMass,
                        splitCount: result.splitCount,
                        newMass: playerCell.mass,
                        totalCells: player.cells.length,
                        totalRiskRewards: player.virusRiskRewards,
                        virusDestroyed: true
                    });
                }
                break;

            case 'gunItem':
                if (playerCell.canEat(other)) {
                    const player = this.players.get(playerCell.playerId);
                    if (player) {

                        // 🛡️ バリアを持っている、または発動中の場合は取得不可（🎯 追加）
                        if (player.hasBarrier || player.barrierActive) {
                            console.log(`🔫❌ ${player.name} cannot pick up gun while having/using barrier`);
                            break;
                        }
                        // 🎯 既存の弾数に+5、最大10発まで
                        const newBullets = Math.min(
                            (player.gunBullets || 0) + GAME_CONSTANTS.GUN_BULLETS_PER_ITEM,
                            GAME_CONSTANTS.GUN_MAX_BULLETS
                        );

                        player.hasGun = true;
                        player.gunBullets = newBullets;
                        player.lastGunShot = 0;

                        other.toDelete = true;
                        this.gunItems.delete(other.id);

                        console.log(`🔫 ${player.name} acquired gun item! Bullets: ${newBullets}/${GAME_CONSTANTS.GUN_MAX_BULLETS}`);

                        // クライアントに通知
                        const socket = Array.from(io.sockets.sockets.values())
                            .find(s => s.id === player.id);
                        if (socket) {
                            socket.emit('gun_acquired', {
                                bullets: newBullets
                            });
                        }

                        io.emit('gun_item_collected', {
                            playerId: player.id,
                            playerName: player.name
                        });
                    }
                }
                break;
                // 🔫 銃アイテムの取得処理（修正版）
                if (other.toDelete || !this.gunItems.has(other.id)) {
                    break;
                }
                if (playerCell.canEat(other)) {
                    const player = this.players.get(playerCell.playerId);
                    if (!player) {
                        break;
                    }


                    // 🔫 既に銃を持っている場合は取得不可
                    if (player.hasGun) {
                        console.log(`🔫❌ ${player.name} already has gun`);
                        break;
                    }

                    // ✅ アイテムを即座に削除してマークして重複処理を防ぐ
                    other.toDelete = true;
                    this.gunItems.delete(other.id);
                    this.gameObjects.delete(other.id);

                    // ✅ プレイヤーに銃を付与
                    player.hasGun = true;
                    player.gunBullets = GAME_CONSTANTS.GUN_BULLETS_PER_ITEM;
                    player.gunAcquiredTime = Date.now();
                    player.lastShootTime = 0;

                    console.log(`🔫 ${player.name} acquired gun item! Bullets: ${player.gunBullets}`);

                    // ✅ 取得したプレイヤーにのみ通知
                    const socket = Array.from(io.sockets.sockets.values())
                        .find(s => s.id === player.id);
                    if (socket) {
                        socket.emit('gun_acquired', {
                            bullets: player.gunBullets
                        });
                    }

                    // ✅ 全プレイヤーに収集イベントを通知
                    io.emit('gun_item_collected', {
                        playerId: player.id,
                        playerName: player.name,
                        itemId: other.id  // アイテムIDを追加
                    });
                }
                break;

            // 🛡️ バリアアイテムの取得処理（新規追加）
            case 'barrierItem':
                if (playerCell.canEat(other)) {
                    const player = this.players.get(playerCell.playerId);
                    if (player) {
                        // 🔫 銃を持っている場合はバリアを拾えない
                        if (player.hasGun) {
                            console.log(`🛡️❌ ${player.name} cannot pick up barrier while having gun`);
                            return;
                        }

                        // 🛡️ 既にバリアを持っている場合は拾えない
                        if (player.hasBarrier) {
                            console.log(`🛡️❌ ${player.name} already has barrier`);
                            return;
                        }

                        // ✅ 保持状態にする（発動はしない）
                        player.hasBarrier = true;
                        player.barrierActive = false;

                        other.toDelete = true;
                        this.barrierItems.delete(other.id);

                        console.log(`🛡️ ${player.name} acquired barrier item! (not activated yet)`);

                        const socket = Array.from(io.sockets.sockets.values())
                            .find(s => s.id === player.id);
                        if (socket) {
                            socket.emit('barrier_acquired', {
                                // durationは送信しない（まだ発動していない）
                            });
                        }

                        io.emit('barrier_item_collected', {
                            playerId: player.id,
                            playerName: player.name
                        });
                    }
                }
                break;

                if (other.toDelete || !this.barrierItems.has(other.id)) {
                    break;
                }

                if (playerCell.canEat(other)) {
                    const player = this.players.get(playerCell.playerId);
                    if (!player) {
                        break;
                    }

                    // 🔫 銃を持っている場合は取得不可
                    if (player.hasGun) {
                        console.log(`🛡️❌ ${player.name} cannot pick up barrier while having gun`);
                        break;
                    }

                    // 🛡️ 既にバリアを持っている場合は取得不可
                    if (player.hasBarrier) {
                        console.log(`🛡️❌ ${player.name} already has barrier`);
                        break;
                    }

                    // ✅ アイテムを即座に削除してマークして重複処理を防ぐ
                    other.toDelete = true;
                    this.barrierItems.delete(other.id);
                    this.gameObjects.delete(other.id);

                    // ✅ プレイヤーにバリアを付与
                    player.hasBarrier = true;
                    player.barrierActive = false;

                    console.log(`🛡️ ${player.name} acquired barrier item! (not activated yet)`);

                    // ✅ 取得したプレイヤーにのみ通知
                    const socket = Array.from(io.sockets.sockets.values())
                        .find(s => s.id === player.id);
                    if (socket) {
                        socket.emit('barrier_acquired', {});
                    }

                    // ✅ 全プレイヤーに収集イベントを通知
                    io.emit('barrier_item_collected', {
                        playerId: player.id,
                        playerName: player.name,
                        itemId: other.id  // アイテムIDを追加
                    });
                }
                break;


            case 'speedUpItem':
                if (other.toDelete || !this.speedUpItems.has(other.id)) {
                    break;
                }
                if (playerCell.canEat(other)) {
                    const player = this.players.get(playerCell.playerId);
                    if (!player) {
                        break;
                    }

                    // 🔫 銃を持っている場合は取得不可
                    if (player.hasGun) {
                        console.log(`👟❌ ${player.name} cannot pick up speedup while having gun`);
                        break;
                    }

                    // 🛡️ バリアを持っている場合は取得不可
                    if (player.hasBarrier) {
                        console.log(`👟❌ ${player.name} cannot pick up speedup while having barrier`);
                        break;
                    }

                    // 👟 既にスピードアップを持っている場合は取得不可
                    if (player.hasSpeedUp) {
                        console.log(`👟❌ ${player.name} already has speedup`);
                        break;
                    }

                    // ✅ アイテムを即座に削除してマークして重複処理を防ぐ
                    other.toDelete = true;
                    this.speedUpItems.delete(other.id);
                    this.gameObjects.delete(other.id);

                    // ✅ プレイヤーにスピードアップを付与
                    player.hasSpeedUp = true;
                    player.speedUpActive = false;

                    console.log(`👟 ${player.name} acquired speedup item! (not activated yet)`);

                    // ✅ 取得したプレイヤーにのみ通知
                    const socket = Array.from(io.sockets.sockets.values())
                        .find(s => s.id === player.id);
                    if (socket) {
                        socket.emit('speedup_acquired', {});
                    }

                    // ✅ 全プレイヤーに収集イベントを通知
                    io.emit('speedup_item_collected', {
                        playerId: player.id,
                        playerName: player.name,
                        itemId: other.id
                    });
                }
                break;



        }
    }

    checkVirusInteractions() {
        for (const virus of this.viruses.values()) {
            for (const obj of this.gameObjects.values()) {
                if (obj.type === 'ejectedMass' && virus.collidesWith(obj)) {
                    const newViruses = virus.hit(obj);
                    obj.toDelete = true;

                    if (newViruses && newViruses.length > 0) {
                        newViruses.forEach(newVirus => {
                            this.viruses.set(newVirus.id, newVirus);
                            this.gameObjects.set(newVirus.id, newVirus);
                        });
                    }
                }
            }
        }
    }

    // 8. checkBulletCollisions メソッドを追加（checkVirusInteractions の後に追加）
    checkBulletCollisions() {
        for (const bullet of this.bullets.values()) {
            if (bullet.toDelete) continue;

            for (const player of this.players.values()) {
                if (player.id === bullet.shooterId) continue;

                // 🛡️ バリアが発動中の場合は弾を無効化
                if (player.barrierActive) {
                    continue;
                }

                for (let i = 0; i < player.cells.length; i++) {
                    const cell = player.cells[i];


                    if (bullet.collidesWith(cell)) {
                        const shooter = this.players.get(bullet.shooterId);

                        // 🎯 質量100以下の場合、即ゲームオーバー
                        if (cell.mass <= 100) {
                            console.log(`💀 ${player.name} killed by ${shooter?.name || 'Unknown'}'s bullet (mass: ${cell.mass.toFixed(0)})`);

                            // プレイヤーを削除
                            this.removePlayerByBullet(player.id, shooter?.name || 'Unknown');

                            // 弾を削除
                            bullet.toDelete = true;
                            this.bullets.delete(bullet.id);

                            // 射撃者にボーナススコア
                            if (shooter) {
                                shooter.score += 500;  // キルボーナス
                            }

                            // クライアントに通知
                            io.emit('player_killed_by_bullet', {
                                victimId: player.id,
                                victimName: player.name,
                                shooterId: bullet.shooterId,
                                shooterName: shooter?.name || 'Unknown',
                                bulletX: bullet.x,
                                bulletY: bullet.y
                            });

                            break;
                        }

                        // 🎯 質量100超の場合、通常ダメージ
                        const newMass = Math.max(20, cell.mass - bullet.damage);
                        const damageTaken = cell.mass - newMass;
                        cell.setMass(newMass);

                        bullet.toDelete = true;
                        this.bullets.delete(bullet.id);

                        console.log(`💥 ${shooter?.name || 'Unknown'}'s bullet hit ${player.name} (-${damageTaken.toFixed(0)} mass, remaining: ${newMass.toFixed(0)})`);

                        io.emit('bullet_hit', {
                            shooterId: bullet.shooterId,
                            targetId: player.id,
                            damage: damageTaken,
                            targetCellId: cell.id,
                            bulletX: bullet.x,
                            bulletY: bullet.y,
                            remainingMass: newMass
                        });

                        break;
                    }
                }
            }
        }
    }

    updateLeaderboard() {
        this.leaderboard = Array.from(this.players.values())
            .map(player => ({
                name: player.name,
                score: player.score,
                mass: player.cells.reduce((sum, cell) => sum + cell.mass, 0),
                skin: player.skin,
                virusRiskRewards: player.virusRiskRewards,
                cellCount: player.cells.length,
                protectedCells: player.cells.filter(cell => cell.isProtected).length,
                status: player.cells.reduce((sum, cell) => sum + cell.mass, 0) < 120 ?
                    '🛡️ Safe' : '⚡ Risk Zone'
            }))
            .sort((a, b) => b.mass - a.mass)
            .slice(0, 10);
    }

    getGameState() {
        const now = Date.now();  // ✅ 追加

        const players = {};
        for (const [id, player] of this.players.entries()) {
            const totalMass = player.cells.reduce((sum, cell) => sum + cell.mass, 0);

            players[id] = {
                id: player.id,
                name: player.name,
                color: player.cells[0]?.color || '#FF6B6B',  // ✅ プレイヤーの色を追加
                cells: player.cells.map(cell => ({
                    id: cell.id,
                    x: Math.round(cell.x * 100) / 100,
                    y: Math.round(cell.y * 100) / 100,
                    mass: Math.round(cell.mass * 10) / 10,
                    radius: Math.round(cell.radius * 100) / 100,
                    color: cell.color || '#FF6B6B',  // ✅ セルの色も確実に設定
                    skin: cell.skin
                })),
                score: player.score,
                mass: totalMass,
                alive: player.alive,

                // 🔫 銃アイテム
                hasGun: player.hasGun || false,
                gunBullets: player.gunBullets || 0,

                // 🛡️ バリアアイテム
                hasBarrier: player.hasBarrier || false,
                barrierActive: player.barrierActive || false,
                barrierTimeLeft: player.barrierActive && player.barrierAcquiredTime
                    ? Math.max(0, GAME_CONSTANTS.BARRIER_DURATION - (now - player.barrierAcquiredTime))
                    : 0
            };
        }

        return {
            players: players,  // ✅ playersData ではなく players
            foods: Array.from(this.gameObjects.values())
                .filter(obj => obj.type === 'food')
                .map(food => ({
                    id: food.id,
                    x: Math.round(food.x * 100) / 100,
                    y: Math.round(food.y * 100) / 100,
                    mass: food.mass,
                    radius: food.radius,
                    color: food.color,
                    type: food.type
                })),

            viruses: Array.from(this.viruses.values()).map(virus => ({
                id: virus.id,
                x: Math.round(virus.x * 100) / 100,
                y: Math.round(virus.y * 100) / 100,
                mass: virus.mass,
                radius: virus.radius,
                type: virus.type
            })),

            ejectedMasses: Array.from(this.gameObjects.values())
                .filter(obj => obj.type === 'ejectedMass')
                .map(ej => ({
                    id: ej.id,
                    x: Math.round(ej.x * 100) / 100,
                    y: Math.round(ej.y * 100) / 100,
                    mass: ej.mass,
                    radius: ej.radius,
                    type: ej.type
                })),

            // 🔫 銃アイテムと弾
            gunItems: Array.from(this.gunItems.values()).map(item => ({
                id: item.id,
                x: Math.round(item.x * 100) / 100,
                y: Math.round(item.y * 100) / 100,
                radius: item.radius,
                type: item.type
            })),

            bullets: Array.from(this.bullets.values()).map(bullet => ({
                id: bullet.id,
                x: Math.round(bullet.x * 100) / 100,
                y: Math.round(bullet.y * 100) / 100,
                radius: bullet.radius,
                angle: bullet.angle,
                shooterId: bullet.shooterId,
                type: bullet.type
            })),

            // 🛡️ バリアアイテム
            barrierItems: Array.from(this.barrierItems.values()).map(item => ({
                id: item.id,
                x: Math.round(item.x * 100) / 100,
                y: Math.round(item.y * 100) / 100,
                radius: item.radius,
                type: item.type
            })),



            leaderboard: this.leaderboard,
            worldSize: {
                width: GAME_CONSTANTS.WORLD_WIDTH,
                height: GAME_CONSTANTS.WORLD_HEIGHT
            },
            stats: this.stats,
            chatMessages: this.chatMessages
        };
    }


    startGameLoop() {
        console.log("🎮 Starting enhanced game loop with chat system...");

        setInterval(() => {
            const now = Date.now();
            const deltaTime = now - this.lastUpdateTime;
            this.lastUpdateTime = now;

            this.updateGame(deltaTime);
        }, 1000 / GAME_CONSTANTS.TICK_RATE);

        setInterval(() => {
            if (this.players.size > 0) {
                const gameState = this.getGameState();
                io.emit('game_update', gameState);
            }
        }, 1000 / 20);

        setInterval(() => {
            if (process.memoryUsage) {
                this.stats.memoryUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
            }
        }, 5000);
    }
}

const gameServer = new EnhancedAgarServer();

// Socket.IO処理
io.on("connection", (socket) => {
    console.log(`🔗 Client connected: ${socket.id}`);

    socket.on("move_player", (data) => {
        try {
            gameServer.handlePlayerMove(socket.id, data);
        } catch (error) {
            console.error(`❌ Move_player error for ${socket.id}:`, error);
        }
    });

    socket.on("move", (data) => {
        try {
            if (data.x !== undefined && data.y !== undefined) {
                gameServer.handlePlayerMove(socket.id, { targetX: data.x, targetY: data.y });
            }
        } catch (error) {
            console.error(`❌ Move error for ${socket.id}:`, error);
        }
    });

    socket.on("join_game", (data) => {
        try {
            const player = gameServer.addPlayer(socket.id, data?.name);
            const gameState = gameServer.getGameState();

            socket.emit("game_init", {
                myId: socket.id,
                ...gameState
            });

            socket.broadcast.emit('player_joined', {
                playerId: socket.id,
                player: gameState.players[socket.id]
            });

        } catch (error) {
            console.error(`❌ Join error for ${socket.id}:`, error);
            socket.emit("join_error", { message: "Failed to join game" });
        }
    });

    socket.on("split", (data) => {
        try {
            const success = gameServer.handlePlayerSplit(socket.id, data);
        } catch (error) {
            console.error(`❌ Split error for ${socket.id}:`, error);
        }
    });

    socket.on("eject", (data) => {
        try {
            const success = gameServer.handlePlayerEject(socket.id, data || { x: 1, y: 0 });
        } catch (error) {
            console.error(`❌ Eject error for ${socket.id}:`, error);
        }
    });

    // 🎯 チャットメッセージイベント
    socket.on("chat_message", (data) => {
        try {
            const result = gameServer.handleChatMessage(socket.id, data);
            if (!result.success) {
                socket.emit("chat_error", { message: result.error });
            }
        } catch (error) {
            console.error(`❌ Chat error for ${socket.id}:`, error);
            socket.emit("chat_error", { message: "チャット送信エラー" });
        }
    });

    socket.on("ping", (timestamp) => {
        socket.emit("pong", timestamp);
    });

    socket.on("disconnect", (reason) => {
        console.log(`🔌 Client disconnected: ${socket.id} - ${reason}`);
        gameServer.removePlayer(socket.id);
        socket.broadcast.emit('player_left', { playerId: socket.id });
    });
    // 🔫 銃の発射
    socket.on("shoot_gun", (data) => {
        try {
            const success = gameServer.handleGunShoot(socket.id, data);
            if (success) {
                const player = gameServer.players.get(socket.id);
                socket.emit('gun_shot_success', {
                    bulletsLeft: player.gunBullets
                });
            }
        } catch (error) {
            console.error(`❌ Shoot_gun error for ${socket.id}:`, error);
        }
    });
    socket.on("buy_gun", () => {
        try {
            const result = gameServer.handleBuyGun(socket.id);
            socket.emit("buy_gun_result", result);
        } catch (error) {
            console.error("❌ buy_gun error:", error);
            socket.emit("buy_gun_result", { success: false, message: "購入エラーが発生しました" });
        }
    });


    // 🛡️ バリア発動イベント（新規追加）
    socket.on("activate_barrier", (data) => {
        try {
            const success = gameServer.handleBarrierActivate(socket.id);
            if (!success) {
                console.log(`🛡️ Failed to activate barrier for ${socket.id}`);
            }
        } catch (error) {
            console.error(`❌ Activate_barrier error for ${socket.id}:`, error);
        }
    });
    socket.on("buy_barrier", () => {
        try {
            const result = gameServer.handleBuyBarrier(socket.id);
            socket.emit("buy_barrier_result", result);
        } catch (error) {
            console.error("❌ buy_barrier error:", error);
            socket.emit("buy_barrier_result", { success: false, message: "購入エラーが発生しました" });
        }
    });


    // 👟 スピードアップ発動
    socket.on('activate_speedup', (data) => {
        const player = this.players.get(socket.id);
        if (!player || !player.hasSpeedUp || player.speedUpActive) {
            return;
        }

        player.speedUpActive = true;
        player.speedUpStartTime = Date.now();
        player.speedUpTimeLeft = GAME_CONSTANTS.SPEEDUP_DURATION;

        console.log(`👟 ${player.name} activated speedup!`);

        socket.emit('speedup_activated', {
            duration: GAME_CONSTANTS.SPEEDUP_DURATION
        });

        io.emit('speedup_item_collected', {
            playerId: player.id,
            playerName: player.name
        });
    });
});

// API Routes
app.get("/", (req, res) => {
    const stats = gameServer.stats;
    res.json({
        message: "🦠 Enhanced Agar.io Server v9.0 with Chat System",
        status: "running",
        worldSize: `${GAME_CONSTANTS.WORLD_WIDTH}x${GAME_CONSTANTS.WORLD_HEIGHT}`,
        players: stats.playersCount,
        foods: stats.foodsCount,
        viruses: stats.virusesCount,
        chatMessages: stats.chatMessagesCount,
        memory: `${stats.memoryUsage}MB`,
        features: [
            "✅ 💬 リアルタイムチャット機能",
            "✅ 🎮 プレイ中会話可能",
            "✅ 🛡️ 誤操作防止システム",
            "✅ 2000x2000最適化世界",
            "✅ ウイルスリスク&リワード",
            "✅ 高パフォーマンス最適化"
        ]
    });
});

app.get("/api/stats", (req, res) => {
    res.json(gameServer.stats);
});

// サーバー起動
const PORT = process.env.PORT || 8080;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🎉 Enhanced Agar.io Server v9.0 with Chat running!`);
    console.log(`📍 Port: ${PORT}`);
    console.log(`🌐 Local: http://localhost:${PORT}`);
    console.log(`🌐 Network: http://${LOCAL_IP}:${PORT}`);
    console.log(`🎮 Game: http://${LOCAL_IP}:3000`);
    console.log(`\n🚀 Enhanced Features:`);
    console.log(`  💬 リアルタイムチャット機能`);
    console.log(`  🎮 プレイ中に会話可能`);
    console.log(`  🛡️ 誤操作防止システム`);
    console.log(`  📏 最大100文字メッセージ`);
    console.log(`  🗺️ 2000×2000最適化世界`);
    console.log(`  🦠 ウイルスリスク&リワード`);
    console.log(`\n✅ Ready for chat-enabled gameplay!\n`);
});