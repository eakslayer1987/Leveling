const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const waveEl = document.getElementById('waveEl');
const livesEl = document.getElementById('livesEl');
const moneyEl = document.getElementById('moneyEl');
const nextWaveBtn = document.getElementById('nextWaveBtn');
const gameOverScreen = document.getElementById('game-over');

// Set Canvas Size
canvas.width = window.innerWidth > 600 ? 600 : window.innerWidth;
canvas.height = window.innerHeight - 150; // เผื่อที่ให้ UI

// Game Config
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
let selectedTurretType = 'gun';
let gameActive = true;
let waveInProgress = false;

// Turret Types
const TURRET_TYPES = {
    gun: { price: 50, range: 100, color: 'cyan', fireRate: 30, dmg: 10, speed: 5 },
    laser: { price: 150, range: 150, color: '#ff00ff', fireRate: 5, dmg: 2, speed: 15 }, // ยิงรัว เบา
    cannon: { price: 300, range: 120, color: '#ffff00', fireRate: 60, dmg: 50, speed: 3 } // ยิงช้า แรง
};

// Map Path (สร้างเส้นทางเดิน)
// จุด Waypoints ที่ศัตรูจะเดินผ่าน
const waypoints = [
    {x: 0, y: 2},
    {x: 5, y: 2},
    {x: 5, y: 8},
    {x: 2, y: 8},
    {x: 2, y: 12},
    {x: 8, y: 12},
    {x: 8, y: 4},
    {x: COLS-1, y: 4}
];

// แปลง Waypoints ให้เป็นพิกัดจริงบนจอ
const path = waypoints.map(p => ({ x: p.x * TILE_SIZE + TILE_SIZE/2, y: p.y * TILE_SIZE + TILE_SIZE/2 }));

// --- CLASSES ---

class Enemy {
    constructor(waveMultiplier) {
        this.wpIndex = 0; // Waypoint ปัจจุบัน
        this.x = path[0].x;
        this.y = path[0].y;
        this.speed = 1.5 + (waveMultiplier * 0.1);
        this.radius = 10;
        this.hp = 30 + (waveMultiplier * 15);
        this.maxHp = this.hp;
        this.money = 10 + Math.floor(waveMultiplier * 2);
        this.frozen = 0;
    }

    update() {
        // เดินตาม Path
        const target = path[this.wpIndex + 1];
        if (!target) return true; // ถึงจุดหมาย

        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);

        this.x += Math.cos(angle) * this.speed;
        this.y += Math.sin(angle) * this.speed;

        // ถ้าใกล้ถึง waypoint ถัดไป ให้เปลี่ยนเป้า
        if (dist < 5) {
            this.wpIndex++;
            if (this.wpIndex >= path.length - 1) {
                lives--;
                livesEl.innerText = lives;
                if (lives <= 0) gameOver();
                return true; // ลบออกจาก array
            }
        }
        return false;
    }

    draw() {
        ctx.fillStyle = `hsl(${this.hp * 2}, 100%, 50%)`; // สีเปลี่ยนตามเลือด
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI*2);
        ctx.fill();
        
        // Health Bar
        ctx.fillStyle = 'red';
        ctx.fillRect(this.x - 10, this.y - 15, 20, 4);
        ctx.fillStyle = '#0f0';
        ctx.fillRect(this.x - 10, this.y - 15, 20 * (this.hp / this.maxHp), 4);
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
    }

    update() {
        if (this.cooldown > 0) this.cooldown--;

        // หาศัตรูที่ใกล้ที่สุด
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
            }
        }
    }

    shoot(target) {
        projectiles.push(new Projectile(this.x, this.y, target, this.stats));
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // วาดระยะ (ถ้าเอาเมาส์ชี้ - ในที่นี้วาดจางๆ ไว้สวยๆ)
        ctx.beginPath();
        ctx.arc(0, 0, this.stats.range, 0, Math.PI*2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.stroke();

        // หมุนป้อม
        ctx.rotate(this.angle);
        
        // ฐาน
        ctx.fillStyle = '#333';
        ctx.fillRect(-15, -15, 30, 30);
        
        // กระบอกปืน
        ctx.fillStyle = this.stats.color;
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI*2);
        ctx.fill();
        ctx.fillRect(0, -4, 20, 8); // ลำกล้อง

        ctx.restore();
    }
}

class Projectile {
    constructor(x, y, target, stats) {
        this.x = x;
        this.y = y;
        this.target = target; // ล็อกเป้า (Homing นิดหน่อย)
        this.speed = stats.speed;
        this.dmg = stats.dmg;
        this.color = stats.color;
        this.radius = 4;
        
        // คำนวณทิศทางแรกเริ่ม
        const angle = Math.atan2(target.y - y, target.x - x);
        this.vx = Math.cos(angle) * this.speed;
        this.vy = Math.sin(angle) * this.speed;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;

        // เช็คชน
        for (let enemy of enemies) {
            const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
            if (dist < enemy.radius + this.radius) {
                enemy.hp -= this.dmg;
                // Effect
                for(let i=0; i<3; i++) particles.push(new Particle(this.x, this.y, this.color));
                return true; // ชนแล้วหายไป
            }
        }
        
        // ออกนอกจอ
        if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) return true;
        return false;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI*2);
        ctx.fill();
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.life = 1.0;
        this.vx = (Math.random() - 0.5) * 3;
        this.vy = (Math.random() - 0.5) * 3;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= 0.1;
        return this.life <= 0;
    }
    draw() {
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, 3, 3);
        ctx.globalAlpha = 1.0;
    }
}

// --- GAME LOGIC ---

function spawnWave() {
    if (waveInProgress) return;
    waveInProgress = true;
    nextWaveBtn.disabled = true;
    nextWaveBtn.innerText = "WAVE INCOMING...";
    
    let count = 0;
    const maxEnemies = 5 + Math.floor(wave * 1.5);
    
    const spawnInterval = setInterval(() => {
        enemies.push(new Enemy(wave));
        count++;
        if (count >= maxEnemies) {
            clearInterval(spawnInterval);
        }
    }, 1000 - (Math.min(500, wave * 20))); // ยิ่งเวฟสูงยิ่งมาถี่
}

function checkWaveEnd() {
    if (waveInProgress && enemies.length === 0) {
        waveInProgress = false;
        wave++;
        waveEl.innerText = wave;
        money += 50; // จบเวฟได้โบนัส
        moneyEl.innerText = money;
        nextWaveBtn.disabled = false;
        nextWaveBtn.innerText = "START NEXT WAVE";
    }
}

function gameOver() {
    gameActive = false;
    document.getElementById('finalWave').innerText = wave;
    gameOverScreen.classList.remove('hidden');
}

// Input
canvas.addEventListener('mousedown', (e) => {
    if (!gameActive) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Snap to Grid
    const col = Math.floor(x / TILE_SIZE);
    const row = Math.floor(y / TILE_SIZE);
    const centerX = col * TILE_SIZE + TILE_SIZE/2;
    const centerY = row * TILE_SIZE + TILE_SIZE/2;
    
    // 1. เช็คว่าวางทับ Path ไหม
    // (วิธีง่ายๆ: เช็คระยะห่างจากเส้น Waypoints)
    let onPath = false;
    for (let i = 0; i < path.length - 1; i++) {
        const p1 = path[i];
        const p2 = path[i+1];
        // เช็คว่าเป็นจุดบนเส้นนี้ไหม (Simplified)
        const distToSegment = pointToSegmentDist(centerX, centerY, p1.x, p1.y, p2.x, p2.y);
        if (distToSegment < TILE_SIZE/2) onPath = true;
    }
    
    // 2. เช็คว่าทับป้อมเดิมไหม
    const existing = turrets.find(t => t.x === centerX && t.y === centerY);
    
    if (!onPath && !existing) {
        const cost = TURRET_TYPES[selectedTurretType].price;
        if (money >= cost) {
            money -= cost;
            moneyEl.innerText = money;
            turrets.push(new Turret(centerX, centerY, selectedTurretType));
        }
    }
});

// Utility: Distance from point to line segment
function pointToSegmentDist(px, py, x1, y1, x2, y2) {
    const l2 = (x1-x2)**2 + (y1-y2)**2;
    if (l2 == 0) return Math.hypot(px-x1, py-y1);
    let t = ((px-x1)*(x2-x1) + (py-y1)*(y2-y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t*(x2-x1)), py - (y1 + t*(y2-y1)));
}

// Main Loop
function animate() {
    if (!gameActive) return;
    requestAnimationFrame(animate);
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw Path Line
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 20;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for(let i=1; i<path.length; i++) ctx.lineTo(path[i].x, path[i].y);
    ctx.stroke();
    // Path Highlight
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.1)';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Update & Draw Turrets
    turrets.forEach(t => { t.update(); t.draw(); });

    // Update & Draw Enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        const reachedEnd = e.update();
        if (e.hp <= 0) {
            money += e.money;
            moneyEl.innerText = money;
            enemies.splice(i, 1);
        } else if (reachedEnd) {
            enemies.splice(i, 1);
        } else {
            e.draw();
        }
    }

    // Update & Draw Projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
        if (projectiles[i].update()) projectiles.splice(i, 1);
        else projectiles[i].draw();
    }
    
    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        if (particles[i].update()) particles.splice(i, 1);
        else particles[i].draw();
    }

    checkWaveEnd();
}

// UI Functions
window.selectTurret = function(type) {
    selectedTurretType = type;
    document.querySelectorAll('.turret-select').forEach(el => el.classList.remove('selected'));
    document.getElementById(`btn-${type}`).classList.add('selected');
}

nextWaveBtn.addEventListener('click', spawnWave);

animate();
