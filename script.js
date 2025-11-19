const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const logBox = document.getElementById('log-box');

// UI Elements
const levelEl = document.getElementById('level-el');
const hpEl = document.getElementById('hp-el');
const maxHpEl = document.getElementById('max-hp-el');
const floorEl = document.getElementById('floor-el');
const goldEl = document.getElementById('gold-el');

// Game Config
const TILE_SIZE = 32;
const GRID_SIZE = 15; // 15x15 ช่อง
canvas.width = TILE_SIZE * GRID_SIZE;
canvas.height = TILE_SIZE * GRID_SIZE;

// Colors
const COLORS = {
    floor: '#222',
    wall: '#555',
    player: '#00ff00',
    enemy: '#ff0000',
    stairs: '#ffff00',
    potion: '#00ffff'
};

// Game State
let player = {
    x: 1, y: 1,
    level: 1,
    hp: 100,
    maxHp: 100,
    xp: 0,
    nextLevelXp: 100,
    atk: 10,
    gold: 0,
    floor: 1
};

let map = [];
let enemies = [];
let particles = []; // Text damage effect

// --- SYSTEM FUNCTIONS ---

function log(msg, color = '#aaa') {
    const p = document.createElement('div');
    p.style.color = color;
    p.innerText = `> ${msg}`;
    logBox.prepend(p);
    if (logBox.children.length > 20) logBox.lastChild.remove();
}

function saveGame() {
    localStorage.setItem('rpgSave', JSON.stringify(player));
    log("บันทึกเกมเรียบร้อย!", "lime");
}

function loadGame() {
    const save = localStorage.getItem('rpgSave');
    if (save) {
        player = JSON.parse(save);
        updateUI();
        log("โหลดเซฟสำเร็จ!", "lime");
    }
}

function resetGame() {
    if(confirm("เริ่มเล่นใหม่? ข้อมูลเก่าจะหายหมดนะ")) {
        localStorage.removeItem('rpgSave');
        location.reload();
    }
}

// --- MAP GENERATION ---

function generateMap() {
    map = [];
    enemies = [];
    
    // 1. Fill with walls
    for (let y = 0; y < GRID_SIZE; y++) {
        let row = [];
        for (let x = 0; x < GRID_SIZE; x++) {
            // ขอบเป็นกำแพง
            if (x === 0 || x === GRID_SIZE - 1 || y === 0 || y === GRID_SIZE - 1) {
                row.push(1); // Wall
            } else {
                // สุ่มกำแพงข้างใน (15% โอกาส)
                row.push(Math.random() < 0.15 ? 1 : 0);
            }
        }
        map.push(row);
    }

    // 2. Place Stairs (ทางลง)
    let sx, sy;
    do {
        sx = Math.floor(Math.random() * (GRID_SIZE - 2)) + 1;
        sy = Math.floor(Math.random() * (GRID_SIZE - 2)) + 1;
    } while (map[sy][sx] === 1 || (sx === player.x && sy === player.y));
    map[sy][sx] = 2; // Stairs

    // 3. Spawn Enemies (จำนวนตามชั้น)
    const enemyCount = 3 + Math.floor(player.floor / 2);
    for (let i = 0; i < enemyCount; i++) {
        spawnEnemy();
    }
    
    // Ensure player pos is clear
    map[player.y][player.x] = 0;
}

function spawnEnemy() {
    let ex, ey;
    do {
        ex = Math.floor(Math.random() * (GRID_SIZE - 2)) + 1;
        ey = Math.floor(Math.random() * (GRID_SIZE - 2)) + 1;
    } while (map[ey][ex] !== 0 || (ex === player.x && ey === player.y));
    
    // Enemy Stat Scale ตามชั้น
    const scale = player.floor;
    enemies.push({
        x: ex, y: ey,
        hp: 20 + (scale * 10),
        maxHp: 20 + (scale * 10),
        atk: 2 + scale,
        xp: 10 + (scale * 5),
        gold: Math.floor(Math.random() * 10) + scale
    });
}

// --- GAMEPLAY ---

function movePlayer(dx, dy) {
    if (player.hp <= 0) return;

    const newX = player.x + dx;
    const newY = player.y + dy;

    // เช็คกำแพง
    if (map[newY][newX] === 1) return;

    // เช็คศัตรู
    const enemyIndex = enemies.findIndex(e => e.x === newX && e.y === newY);
    if (enemyIndex !== -1) {
        attackEnemy(enemyIndex);
    } else {
        player.x = newX;
        player.y = newY;
        
        // เช็คบันได
        if (map[player.y][player.x] === 2) {
            nextFloor();
        }
    }
    
    updateUI();
    draw();
}

function attackEnemy(index) {
    const enemy = enemies[index];
    
    // Player Hit
    const dmg = Math.floor(player.atk * (Math.random() * 0.4 + 0.8)); // atk +/- 20%
    enemy.hp -= dmg;
    createParticle(enemy.x, enemy.y, `-${dmg}`, 'white');
    
    if (enemy.hp <= 0) {
        // Enemy Die
        enemies.splice(index, 1);
        player.xp += enemy.xp;
        player.gold += enemy.gold;
        log(`กำจัดศัตรู! ได้ ${enemy.xp} XP, ${enemy.gold} Gold`, "gold");
        checkLevelUp();
    } else {
        // Enemy Counter Attack
        const enemyDmg = Math.max(1, Math.floor(enemy.atk - (player.level * 0.5))); // เกราะทิพย์
        player.hp -= enemyDmg;
        createParticle(player.x, player.y, `-${enemyDmg}`, 'red');
        log(`โดนสวนกลับ ${enemyDmg} ดาเมจ!`, "red");
        
        if (player.hp <= 0) {
            player.hp = 0;
            log("GAME OVER! คุณตายแล้ว", "red");
            alert("คุณเสียชีวิต... กด Reset เพื่อเริ่มใหม่");
        }
    }
}

function checkLevelUp() {
    if (player.xp >= player.nextLevelXp) {
        player.level++;
        player.xp -= player.nextLevelXp;
        player.nextLevelXp = Math.floor(player.nextLevelXp * 1.5);
        player.maxHp += 20;
        player.hp = player.maxHp;
        player.atk += 5;
        log(`LEVEL UP! เลเวล ${player.level} แล้ว!`, "lime");
        createParticle(player.x, player.y, "LEVEL UP!", "lime");
    }
}

function nextFloor() {
    player.floor++;
    log(`ลงสู่ชั้นที่ ${player.floor}...`, "cyan");
    generateMap();
    saveGame(); // Auto save เมื่อลงชั้น
}

function heal() {
    if (player.gold >= 50) {
        player.gold -= 50;
        player.hp = Math.min(player.hp + 50, player.maxHp);
        log("ซื้อยาเติมเลือด (+50 HP)", "cyan");
        updateUI();
        draw();
    } else {
        log("เงินไม่พอ! (ต้องการ 50 Gold)", "orange");
    }
}

// --- RENDERING ---

function draw() {
    // Clear
    ctx.fillStyle = COLORS.floor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Map
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            if (map[y][x] === 1) {
                // Wall
                ctx.fillStyle = COLORS.wall;
                ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                // เงาเพื่อให้ดูมีมิติ
                ctx.fillStyle = '#000';
                ctx.globalAlpha = 0.2;
                ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE + TILE_SIZE - 5, TILE_SIZE, 5);
                ctx.globalAlpha = 1.0;
            } else if (map[y][x] === 2) {
                // Stairs
                ctx.fillStyle = COLORS.stairs;
                ctx.fillRect(x * TILE_SIZE + 8, y * TILE_SIZE + 8, 16, 16);
            }
        }
    }

    // Draw Enemies
    enemies.forEach(e => {
        ctx.fillStyle = COLORS.enemy;
        // วาดศัตรู (สี่เหลี่ยมแดงมีตา)
        ctx.fillRect(e.x * TILE_SIZE + 4, e.y * TILE_SIZE + 4, 24, 24);
        // HP Bar
        const hpPercent = e.hp / e.maxHp;
        ctx.fillStyle = 'red';
        ctx.fillRect(e.x * TILE_SIZE + 4, e.y * TILE_SIZE - 2, 24, 4);
        ctx.fillStyle = 'lime';
        ctx.fillRect(e.x * TILE_SIZE + 4, e.y * TILE_SIZE - 2, 24 * hpPercent, 4);
    });

    // Draw Player
    ctx.fillStyle = COLORS.player;
    ctx.fillRect(player.x * TILE_SIZE + 4, player.y * TILE_SIZE + 4, 24, 24);
    // หมวก
    ctx.fillStyle = '#fff';
    ctx.fillRect(player.x * TILE_SIZE + 10, player.y * TILE_SIZE + 8, 12, 6);

    // Draw Particles (Text damage)
    particles.forEach((p, i) => {
        ctx.fillStyle = p.color;
        ctx.font = "bold 14px monospace";
        ctx.fillText(p.text, p.x * TILE_SIZE, p.y * TILE_SIZE - p.life);
        p.life++;
        if(p.life > 20) particles.splice(i, 1);
    });
    
    if(particles.length > 0) requestAnimationFrame(draw); // Keep animating particles
}

function createParticle(x, y, text, color) {
    particles.push({x, y, text, color, life: 0});
    draw(); // trigger redraw
}

function updateUI() {
    levelEl.innerText = player.level;
    hpEl.innerText = player.hp;
    maxHpEl.innerText = player.maxHp;
    floorEl.innerText = player.floor;
    goldEl.innerText = player.gold;
}

// --- INPUTS ---

window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') movePlayer(0, -1);
    if (e.key === 'ArrowDown') movePlayer(0, 1);
    if (e.key === 'ArrowLeft') movePlayer(-1, 0);
    if (e.key === 'ArrowRight') movePlayer(1, 0);
});

document.getElementById('btn-up').addEventListener('click', () => movePlayer(0, -1));
document.getElementById('btn-down').addEventListener('click', () => movePlayer(0, 1));
document.getElementById('btn-left').addEventListener('click', () => movePlayer(-1, 0));
document.getElementById('btn-right').addEventListener('click', () => movePlayer(1, 0));

document.getElementById('btn-heal').addEventListener('click', heal);
document.getElementById('btn-save').addEventListener('click', saveGame);
document.getElementById('btn-reset').addEventListener('click', resetGame);

// START
loadGame(); // ลองโหลดเซฟเก่า
generateMap(); // สร้างด่าน
updateUI();
draw();