const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const waveEl = document.getElementById('waveEl');
const livesEl = document.getElementById('livesEl');
const moneyEl = document.getElementById('moneyEl');
const nextWaveBtn = document.getElementById('nextWaveBtn');
const gameOverScreen = document.getElementById('game-over');

// Set Canvas Size
canvas.width = window.innerWidth > 600 ? 600 : window.innerWidth;
canvas.height = window.innerHeight - 150;

const TILE_SIZE = 40;
const COLS = Math.floor(canvas.width / TILE_SIZE);
const ROWS = Math.floor(canvas.height / TILE_SIZE);

// Game State
let money = 350;
let lives = 20;
let wave = 1;
let enemies = [];
let turrets = [];
let projectiles = [];
let particles = [];
let floatingTexts = []; // ข้อความลอย (เช่น +$10)
let selectedTurretType = 'gun';
let gameActive = true;
let waveInProgress = false;

const TURRET_TYPES = {
    gun: { price: 50, range: 100, color: 'cyan', fireRate: 30, dmg: 15, speed: 8, size: 12 },
    laser: { price: 150, range: 160, color: '#ff00ff', fireRate: 5, dmg: 3, speed: 20, size: 8 },
    cannon: { price: 300, range: 130, color: '#ffff00', fireRate: 50, dmg: 60, speed: 5, size: 16 }
};

// Path Setup
const waypoints = [
    {x: 0, y: 2}, {x: 5, y: 2}, {x: 5, y: 8},
    {x: 2, y: 8}, {x: 2, y: 12}, {x: 8, y: 12},
    {x: 8, y: 4}, {x: COLS-1, y: 4}
];
const path = waypoints.map(p => ({ x: p.x * TILE_SIZE + TILE_SIZE/2, y: p.y * TILE_SIZE + TILE_SIZE/2 }));

// --- CLASSES ---

class Enemy {
    constructor(waveMultiplier) {
        this.wpIndex = 0;
        this.x = path[0].x;
        this.y = path[0].y;
        this.speed = 1.5 + (waveMultiplier * 0.15);
        this.radius = 10;
        this.hp = 40 + (waveMultiplier * 20);
        this.maxHp = this.hp;
        this.money = 15 + Math.floor(waveMultiplier * 2);
        this.hue = (waveMultiplier * 20) % 360; // เปลี่ยนสีตามเวฟ
    }

    update() {
        const target = path[this.wpIndex + 1];
        if (!target) return true;

        const angle = Math.atan2(target.y - this.y, target.x - this.x);
        this.x += Math.cos(angle) * this.speed;
        this.y += Math.sin(angle) * this.speed;

        if (Math.hypot(target.x - this.x, target.y - this.y) < 5) {
            this.wpIndex++;
            if (this.wpIndex >= path.length - 1) {
                lives--;
                livesEl.innerText = lives;
                // Effect ตอนหลุด
                createParticles(this.x, this.y, 'red', 10);
                if (lives <= 0) gameOver();
                return true;
            }
        }
        return false;
    }

    draw() {
        // Glow Effect
        ctx.shadowBlur = 10;
        ctx.shadowColor = `hsl(${this.hue}, 100%, 50%)`;
        
        ctx.fillStyle = `hsl(${this.hue}, 100%, 50%)`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI*2);
        ctx.fill();
        
        ctx.shadowBlur = 0; // Reset Glow

        // HP Bar
        const hpPercent = this.hp / this.maxHp;
        ctx.fillStyle = '#333';
        ctx.fillRect(this.x - 12, this.y - 18, 24, 4);
        ctx.fillStyle = `rgb(${255 * (1-hpPercent)}, ${255 * hpPercent}, 0)`;
        ctx.fillRect(this.x - 12, this.y - 18, 24 * hpPercent, 4);
    }
}

class Turret {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.stats = TURRET_TYPES[type];
        this.angle = 0;
        this.cooldown = 0;
        this.recoil = 0; // สำหรับ Animation ตอนยิง
    }

    update() {
        if (this.cooldown > 0) this.cooldown--;
        if (this.recoil > 0) this.recoil--;

        let target = null;
        let minDst = Infinity;
        for (let enemy of enemies) {
            const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
            if (dist < this.stats.range && dist < minDst) {
                minDst = dist;
                target = enemy;
            }
        }

        if (target) {
            this.angle = Math.atan2(target.y - this.y, target.x - this.x);
            if (this.cooldown <= 0) {
                this.shoot(target);
                this.cooldown = this.stats.fireRate;
                this.recoil = 5; // Recoil frame
            }
        }
    }

    shoot(target) {
        projectiles.push(new Projectile(this.x, this.y, target, this.stats));
        // Muzzle Flash Effect
        const tipX = this.x + Math.cos(this.angle) * 20;
        const tipY = this.y + Math.sin(this.angle) * 20;
        createParticles(tipX, tipY, this.stats.color, 3);
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Range Indicator (Selected or Hover - Simplified to always faint)
        // ctx.beginPath(); ctx.arc(0, 0, this.stats.range, 0, Math.PI*2); ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.stroke();

        ctx.rotate(this.angle);

        // Base
        ctx.fillStyle = '#222';
        ctx.beginPath();
        ctx.rect(-12, -12, 24, 24);
        ctx.fill();
        ctx.strokeStyle = this.stats.color;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Gun Barrel (Recoil animation)
        const recoilOffset = this.recoil; 
        ctx.fillStyle = this.stats.color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.stats.color;
        
        // ทรงกระบอกปืนตามประเภท
        if (this.type === 'gun') {
            ctx.fillRect(5 - recoilOffset, -4, 18, 8);
        } else if (this.type === 'laser') {
             ctx.fillRect(0 - recoilOffset, -2, 22, 4);
             ctx.fillRect(0 - recoilOffset, -5, 5, 10);
        } else { // Cannon
             ctx.fillRect(0 - recoilOffset, -8, 24, 16);
        }

        // Center Dome
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI*2);
        ctx.fill();
        
        ctx.shadowBlur = 0;
        ctx.restore();
    }
}

class Projectile {
    constructor(x, y, target, stats) {
        this.x = x;
        this.y = y;
        this.target = target;
        this.stats = stats;
        
        const angle = Math.atan2(target.y - y, target.x - x);
        this.vx = Math.cos(angle) * stats.speed;
        this.vy = Math.sin(angle) * stats.speed;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;

        for (let enemy of enemies) {
            const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
            if (dist < enemy.radius + 5) {
                enemy.hp -= this.stats.dmg;
                // Effect Impact
                createParticles(this.x, this.y, this.stats.color, 5);
                
                if (enemy.hp <= 0) {
                    // Kill Reward
                    addMoney(enemy.money);
                    createFloatingText(`+$${enemy.money}`, enemy.x, enemy.y, '#ffd700');
                    // Death Explosion
                    createParticles(enemy.x, enemy.y, `hsl(${enemy.hue}, 100%, 50%)`, 15);
                }
                return true; 
            }
        }
        if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) return true;
        return false;
    }

    draw() {
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.stats.color;
        ctx.fillStyle = this.stats.color;
        
        ctx.beginPath();
        if (this.stats.type === 'laser') {
             ctx.moveTo(this.x, this.y);
             ctx.lineTo(this.x - this.vx*2, this.y - this.vy*2); // Trail
             ctx.strokeStyle = this.stats.color;
             ctx.lineWidth = 2;
             ctx.stroke();
        } else {
            ctx.arc(this.x, this.y, 3, 0, Math.PI*2);
            ctx.fill();
        }
        ctx.shadowBlur = 0;
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 3 + 1;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.life = 1.0;
        this.decay = Math.random() * 0.05 + 0.02;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= this.decay;
        return this.life <= 0;
    }
    draw() {
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.globalCompositeOperation = 'lighter'; // Neon blending
        ctx.beginPath();
        ctx.arc(this.x, this.y, 2, 0, Math.PI*2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
    }
}

class FloatingText {
    constructor(text, x, y, color) {
        this.text = text;
        this.x = x;
        this.y = y;
        this.color = color;
        this.life = 1.0;
        this.vy = -1; // ลอยขึ้น
    }
    update() {
        this.y += this.vy;
        this.life -= 0.02;
        return this.life <= 0;
    }
    draw() {
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.font = "bold 14px Arial";
        ctx.fillText(this.text, this.x, this.y);
        ctx.globalAlpha = 1.0;
    }
}

// --- SYSTEMS ---

function createParticles(x, y, color, count) {
    for(let i=0; i<count; i++) particles.push(new Particle(x, y, color));
}

function createFloatingText(text, x, y, color) {
    floatingTexts.push(new FloatingText(text, x, y, color));
}

function addMoney(amount) {
    money += amount;
    moneyEl.innerText = money;
    updateShopUI();
}

function updateShopUI() {
    // เช็คเงินเพื่อเปิด/ปิดปุ่ม
    for (const type in TURRET_TYPES) {
        const btn = document.getElementById(`btn-${type}`);
        if (money < TURRET_TYPES[type].price) {
            btn.classList.add('disabled');
        } else {
            btn.classList.remove('disabled');
        }
    }
}

function spawnWave() {
    if (waveInProgress) return;
    waveInProgress = true;
    nextWaveBtn.disabled = true;
    
    let count = 0;
    const maxEnemies = 8 + (wave * 2);
    
    const spawnInterval = setInterval(() => {
        enemies.push(new Enemy(wave));
        count++;
        if (count >= maxEnemies) {
            clearInterval(spawnInterval);
        }
    }, Math.max(200, 1000 - (wave * 50)));
}

function checkWaveEnd() {
    if (waveInProgress && enemies.length === 0) {
        waveInProgress = false;
        wave++;
        waveEl.innerText = wave;
        addMoney(100); // Wave Clear Bonus
        createFloatingText("WAVE CLEAR! +$100", canvas.width/2 - 50, canvas.height/2, '#00ff00');
        nextWaveBtn.disabled = false;
    }
}

function gameOver() {
    gameActive = false;
    document.getElementById('finalWave').innerText = wave;
    gameOverScreen.classList.remove('hidden');
}

// Input Handling
canvas.addEventListener('mousedown', (e) => {
    if (!gameActive) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const col = Math.floor(x / TILE_SIZE);
    const row = Math.floor(y / TILE_SIZE);
    const cx = col * TILE_SIZE + TILE_SIZE/2;
    const cy = row * TILE_SIZE + TILE_SIZE/2;
    
    // Check path collision
    let onPath = false;
    for (let i = 0; i < path.length - 1; i++) {
        const p1 = path[i]; const p2 = path[i+1];
        const l2 = (p1.x-p2.x)**2 + (p1.y-p2.y)**2;
        let t = ((cx-p1.x)*(p2.x-p1.x) + (cy-p1.y)*(p2.y-p1.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        const dist = Math.hypot(cx - (p1.x + t*(p2.x-p1.x)), cy - (p1.y + t*(p2.y-p1.y)));
        if (dist < TILE_SIZE/2) onPath = true;
    }

    const existing = turrets.find(t => t.x === cx && t.y === cy);
    const cost = TURRET_TYPES[selectedTurretType].price;

    if (!onPath && !existing) {
        if (money >= cost) {
            addMoney(-cost);
            turrets.push(new Turret(cx, cy, selectedTurretType));
            createFloatingText(`-$${cost}`, cx, cy - 20, '#ff4444');
            // Effect ตอนวาง
            createParticles(cx, cy, 'white', 10);
        } else {
            createFloatingText("NO MONEY!", cx, cy, 'red');
        }
    }
});

window.selectTurret = function(type) {
    selectedTurretType = type;
    document.querySelectorAll('.turret-select').forEach(el => el.classList.remove('selected'));
    document.getElementById(`btn-${type}`).classList.add('selected');
}

nextWaveBtn.addEventListener('click', spawnWave);

// Initial UI Check
updateShopUI();

// Animation Loop
function animate() {
    if (!gameActive) return;
    requestAnimationFrame(animate);
    
    // Dark Background with slight trail (optional) or clear
    ctx.fillStyle = '#050505'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw Path
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for(let i=1; i<path.length; i++) ctx.lineTo(path[i].x, path[i].y);
    
    // Neon Path Glow
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#0044ff';
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(0, 80, 255, 0.3)';
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Center Path Line
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0, 100, 255, 0.5)';
    ctx.stroke();

    // Game Entities
    turrets.forEach(t => { t.update(); t.draw(); });

    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        const remove = e.update();
        if (e.hp <= 0) {
            addMoney(e.money);
            createFloatingText(`+$${e.money}`, e.x, e.y, '#ffd700');
            createParticles(e.x, e.y, `hsl(${e.hue}, 100%, 50%)`, 15); // Explosion
            enemies.splice(i, 1);
        } else if (remove) {
            enemies.splice(i, 1);
        } else {
            e.draw();
        }
    }

    for (let i = projectiles.length - 1; i >= 0; i--) {
        if (projectiles[i].update()) projectiles.splice(i, 1);
        else projectiles[i].draw();
    }
    
    for (let i = particles.length - 1; i >= 0; i--) {
        if (particles[i].update()) particles.splice(i, 1);
        else particles[i].draw();
    }

    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        if (floatingTexts[i].update()) floatingTexts.splice(i, 1);
        else floatingTexts[i].draw();
    }

    checkWaveEnd();
}

animate();
