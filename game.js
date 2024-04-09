// Client-side JavaScript for handling game logic and communication with the server
const socket = io.connect('https://cool-accessible-pint.glitch.me');

// Directions based on sprite sheet layout
const DIRECTIONS = {
  DOWN: 0, LEFT: 1, RIGHT: 2, UP: 3, DOWN_LEFT: 4, DOWN_RIGHT: 5, UP_LEFT: 6, UP_RIGHT: 7
};

// Game world configuration
const TILE_SIZE = 64;
const WORLD_WIDTH = 200;
const WORLD_HEIGHT = 200;
const CAMERA_WIDTH = 30;
const CAMERA_HEIGHT = 20;

// Tile types
const TILE_FLOOR = 0;
const TILE_WALL = 1;
const TILE_DOOR = 2;

// Game world array
let gameWorld = [];

// Player object definition
let player = {
  id: null, x: 400, y: 300, width: 64, height: 64,
  direction: DIRECTIONS.DOWN, moving: false, sprite: new Image(),
  frameIndex: 0, frameCount: 8
};
player.sprite.src = 'Images/player_sprite_frames.png';
player.sprite.onload = () => requestAnimationFrame(gameLoop);
player.sprite.onerror = e => console.error("Failed to load player sprite:", e);

let players = {}, playerMessages = {}, keysPressed = {};
const movementSpeed = 200, animationSpeed = 0.1, canvas = document.getElementById('gameCanvas'), ctx = canvas.getContext('2d');
let lastRenderTime = 0, animationTimer = 0;

canvas.width = CAMERA_WIDTH * TILE_SIZE;
canvas.height = CAMERA_HEIGHT * TILE_SIZE;

// Load tile images
const tileImages = {};
const tileTypes = [TILE_FLOOR, TILE_WALL, TILE_DOOR];
let loadedImages = 0;

function loadTileImage(type) {
  tileImages[type] = new Image();
  tileImages[type].src = `Images/tile_${type}.png`;
  tileImages[type].onload = () => {
    loadedImages++;
    if (loadedImages === tileTypes.length) {
      requestAnimationFrame(gameLoop);
    }
  };
  tileImages[type].onerror = () => {
    console.error(`Failed to load tile image: Images/tile_${type}.png`);
  };
}

tileTypes.forEach(loadTileImage);

// Initialize the game world
function initializeGameWorld() {
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    gameWorld[y] = [];
    for (let x = 0; x < WORLD_WIDTH; x++) {
      if (x === 0 || x === WORLD_WIDTH - 1 || y === 0 || y === WORLD_HEIGHT - 1) {
        gameWorld[y][x] = TILE_WALL;
      } else {
        gameWorld[y][x] = TILE_FLOOR;
      }
    }
  }
  
  // Create rooms and corridors
  createRoom(20, 20, 40, 40);
  createRoom(80, 80, 60, 60);
  createRoom(20, 120, 50, 50);
  createRoom(120, 20, 60, 40);
  
  createCorridor(50, 30, 80, 30);
  createCorridor(30, 50, 30, 120);
  createCorridor(130, 50, 130, 80);
  createCorridor(70, 110, 120, 110);
}

// Create a room with walls and a door
function createRoom(x, y, width, height) {
  for (let i = y; i < y + height; i++) {
    for (let j = x; j < x + width; j++) {
      if (i === y || i === y + height - 1 || j === x || j === x + width - 1) {
        gameWorld[i][j] = TILE_WALL;
      } else {
        gameWorld[i][j] = TILE_FLOOR;
      }
    }
  }
  gameWorld[y + Math.floor(height / 2)][x] = TILE_DOOR;
}

// Create a corridor between two points
function createCorridor(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.max(Math.abs(dx), Math.abs(dy));
  
  for (let i = 0; i <= length; i++) {
    const x = x1 + Math.round(i * dx / length);
    const y = y1 + Math.round(i * dy / length);
    gameWorld[y][x] = TILE_FLOOR;
  }
}

// Game loop for rendering and updating
function gameLoop(timeStamp) {
  const deltaTime = (timeStamp - lastRenderTime) / 1000;
  requestAnimationFrame(gameLoop);
  if (player.id) {
    updatePlayerPosition(deltaTime);
    handleAnimation(deltaTime);
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();
  drawPlayers();
  lastRenderTime = timeStamp;
}

// Send chat message to the server
function sendMessage() {
  const messageInput = document.getElementById('chatInput'), message = messageInput.value.trim();
  if (message) {
    socket.emit('chatMessage', { message });
    messageInput.value = '';
  }
}

// Update player position based on input
function updatePlayerPosition(deltaTime) {
  let dx = 0, dy = 0;
  player.moving = false;

  // Determine direction and set moving flag
  if (keysPressed['a'] || keysPressed['ArrowLeft']) { dx -= movementSpeed; player.moving = true; }
  if (keysPressed['d'] || keysPressed['ArrowRight']) { dx += movementSpeed; player.moving = true; }
  if (keysPressed['w'] || keysPressed['ArrowUp']) { dy -= movementSpeed; player.moving = true; }
  if (keysPressed['s'] || keysPressed['ArrowDown']) { dy += movementSpeed; player.moving = true; }

  // Adjust direction based on movement
  if (dy < 0 && dx < 0) player.direction = DIRECTIONS.UP_LEFT;
  else if (dy < 0 && dx > 0) player.direction = DIRECTIONS.UP_RIGHT;
  else if (dy > 0 && dx < 0) player.direction = DIRECTIONS.DOWN_LEFT;
  else if (dy > 0 && dx > 0) player.direction = DIRECTIONS.DOWN_RIGHT;
  else if (dy < 0) player.direction = DIRECTIONS.UP;
  else if (dy > 0) player.direction = DIRECTIONS.DOWN;
  else if (dx < 0) player.direction = DIRECTIONS.LEFT;
  else if (dx > 0) player.direction = DIRECTIONS.RIGHT;

  const newX = player.x + dx * deltaTime;
  const newY = player.y + dy * deltaTime;

  // Check collision with walls
  const tileX = Math.floor(newX / TILE_SIZE);
  const tileY = Math.floor(newY / TILE_SIZE);
  if (gameWorld[tileY][tileX] !== TILE_WALL) {
    player.x = newX;
    player.y = newY;
  }

  // Emit movement if position or frameIndex changed
  if (newX !== player.x || newY !== player.y || player.frameIndex !== player.lastFrameIndex) {
    player.lastFrameIndex = player.frameIndex;
    socket.emit('playerMovement', { x: player.x, y: player.y, direction: player.direction, frameIndex: player.frameIndex });
  }
}

// Handle animation based on player movement
function handleAnimation(deltaTime) {
  if (player.moving) {
    animationTimer += deltaTime;
    if (animationTimer >= animationSpeed) {
      player.frameIndex = (player.frameIndex + 1) % player.frameCount;
      animationTimer = 0;
    }
  } else {
    player.frameIndex = 0; // Reset animation frame if not moving
  }
  player.frameIndex = Math.max(0, Math.min(player.frameIndex, player.frameCount - 1)); // Ensure frameIndex is within valid range
}

// Draw the game world
function drawBackground() {
    const cameraX = player.x - canvas.width / 2;
    const cameraY = player.y - canvas.height / 2;
  
    // Additional safeguard: Only draw if all images are loaded
    if (loadedImages !== tileTypes.length) return;
  
    for (let y = 0; y < CAMERA_HEIGHT; y++) {
      for (let x = 0; x < CAMERA_WIDTH; x++) {
        const worldX = Math.floor(cameraX / TILE_SIZE) + x;
        const worldY = Math.floor(cameraY / TILE_SIZE) + y;
  
        if (worldX >= 0 && worldX < WORLD_WIDTH && worldY >= 0 && worldY < WORLD_HEIGHT) {
          const tile = gameWorld[worldY][worldX];
          if (tileImages[tile] && tileImages[tile].complete && tileImages[tile].naturalHeight !== 0) {
            ctx.drawImage(tileImages[tile], x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          } else {
            // Fallback fill if image isn't ready, could log or handle differently here
            ctx.fillStyle = '#000';
            ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          }
        } else {
          ctx.fillStyle = '#000';
          ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }
  }
  

// Render players on canvas
function drawPlayers() {
  Object.values(players).forEach(drawPlayer);
  drawPlayer(player); // Draw current player last to be on top
}

// Draw a single player on the canvas
function drawPlayer(p) {
  if (!p.sprite.complete || p.frameIndex === undefined) return;
  const srcX = p.frameIndex * p.width;
  const srcY = p.direction * p.height;
  const screenX = p.x - player.x + canvas.width / 2 - p.width / 2;
  const screenY = p.y - player.y + canvas.height / 2 - p.height / 2;

  ctx.drawImage(p.sprite, srcX, srcY, p.width, p.height, screenX, screenY, p.width, p.height);
  ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.font = '16px Arial';
  ctx.fillText(p.name, screenX + p.width / 2, screenY - 20);
  if (playerMessages[p.id]) {
    ctx.fillStyle = 'yellow';
    ctx.fillText(playerMessages[p.id], screenX + p.width / 2, screenY - 40);
  }
}

// Keyboard event listeners for movement
document.addEventListener('keydown', e => keysPressed[e.key] = true);
document.addEventListener('keyup', e => delete keysPressed[e.key]);

// Socket event listeners for game state updates
socket.on('currentPlayers', playersData => {
  Object.values(playersData).forEach(p => { p.sprite = new Image(); p.sprite.src = player.sprite.src; });
  players = playersData;
  if (socket.id in players) {
    Object.assign(player, players[socket.id], { sprite: player.sprite });
  }
});

socket.on('newPlayer', playerData => {
  players[playerData.id] = Object.assign(playerData, { sprite: new Image(), frameIndex: 0, direction: DIRECTIONS.DOWN });
  players[playerData.id].sprite.src = player.sprite.src;
});

socket.on('playerMoved', data => {
  if (data.playerId in players) {
    players[data.playerId].x = data.x;
    players[data.playerId].y = data.y;
    players[data.playerId].direction = data.direction;
    players[data.playerId].frameIndex = data.frameIndex;
  }
});

socket.on('playerDisconnected', id => delete players[id]);
socket.on('chatMessage', data => {
  playerMessages[data.playerId] = data.message;
  setTimeout(() => delete playerMessages[data.playerId], 5000);
});

// Initialize the game world
initializeGameWorld();

requestAnimationFrame(gameLoop);