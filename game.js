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

// Tile types
const TILE_FLOOR = 0;
const TILE_WALL = 1;
const TILE_DOOR = 2;

// Game world array
let gameWorld = [];

// Adjust the player's initial position here
// Set initial position to the bottom right, but keep it centered in the viewport initially
let player = {
  id: null, x: 100, y: 100, width: 64, height: 64, // Adjust initial x, y to move player down and right from the center
  direction: DIRECTIONS.DOWN, moving: false, sprite: new Image(),
  frameIndex: 0, frameCount: 8
};
player.sprite.src = 'Images/player_sprite_frames.png';
player.sprite.onload = () => requestAnimationFrame(gameLoop);
player.sprite.onerror = e => console.error("Failed to load player sprite:", e);

let players = {}, playerMessages = {}, keysPressed = {};
const movementSpeed = 200, animationSpeed = 0.1;
let lastRenderTime = 0, animationTimer = 0;

const canvas = document.getElementById('gameCanvas'), ctx = canvas.getContext('2d');

// Function to adjust the canvas size dynamically
function adjustCanvasSize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
adjustCanvasSize(); // Adjust canvas size on initial load
window.addEventListener('resize', adjustCanvasSize); // Adjust canvas size on window resize

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

// Update player position with refined collision detection and door passage handling
function updatePlayerPosition(deltaTime) {
    let dx = 0, dy = 0;
    player.moving = false;
  
    if (keysPressed['a'] || keysPressed['ArrowLeft']) { dx -= movementSpeed; player.moving = true; }
    if (keysPressed['d'] || keysPressed['ArrowRight']) { dx += movementSpeed; player.moving = true; }
    if (keysPressed['w'] || keysPressed['ArrowUp']) { dy -= movementSpeed; player.moving = true; }
    if (keysPressed['s'] || keysPressed['ArrowDown']) { dy += movementSpeed; player.moving = true; }
  
    // Determine intended direction
    determineDirection(dx, dy);
  
    const newX = player.x + dx * deltaTime;
    const newY = player.y + dy * deltaTime;
  
    // Check for collision and adjust for doors
    if (canMoveTo(newX, newY)) {
      // Align with the door center if moving through a door
      if (isMovingThroughDoor(newX, newY)) {
        alignWithDoorCenter(dx, dy);
      } else {
        player.x = newX;
        player.y = newY;
      }
    }
    
  
    function canMoveTo(x, y) {
        // This checks the intended destination for collision with walls or allows movement through doors
        const tileX = Math.floor(x / TILE_SIZE);
        const tileY = Math.floor(y / TILE_SIZE);
        const tile = gameWorld[tileY][tileX];
        return tile !== TILE_WALL; // Allow movement if not moving into a wall
      }
      
      // Check if the movement is through a door tile
      function isMovingThroughDoor(x, y) {
        const tileX = Math.floor(x / TILE_SIZE);
        const tileY = Math.floor(y / TILE_SIZE);
        return gameWorld[tileY][tileX] === TILE_DOOR;
      }
      
      // Adjust the player's position to align with the center of the door
      function alignWithDoorCenter(dx, dy) {
        if (dx !== 0) { // Horizontal movement through a door
          const tileY = Math.floor(player.y / TILE_SIZE);
          const doorX = Math.floor(player.x / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2;
          player.x = doorX;
        }
        if (dy !== 0) { // Vertical movement through a door
          const tileX = Math.floor(player.x / TILE_SIZE);
          const doorY = Math.floor(player.y / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2;
          player.y = doorY;
        }
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

// Improved camera movement for smooth background scrolling
let cameraX = player.x - canvas.width / 2;
let cameraY = player.y - canvas.height / 2;
const cameraEase = 0.05; // Control the smoothing; lower values for smoother movement

function updateCameraPosition() {
    // Calculate the desired position to keep the player centered
    const desiredX = player.x - canvas.width / 2;
    const desiredY = player.y - canvas.height / 2;

    // Apply easing to the camera movement for smoother transition
    cameraX += (desiredX - cameraX) * cameraEase;
    cameraY += (desiredY - cameraY) * cameraEase;
}

// Adjusting the drawBackground function to prevent sub-pixel rendering issues
function drawBackground() {
    updateCameraPosition(); // Ensure camera position is updated smoothly

    ctx.imageSmoothingEnabled = false; // Disable image smoothing

    const viewWidth = Math.ceil(canvas.width / TILE_SIZE);
    const viewHeight = Math.ceil(canvas.height / TILE_SIZE);
    const startCol = Math.floor(cameraX / TILE_SIZE);
    const endCol = startCol + viewWidth;
    const startRow = Math.floor(cameraY / TILE_SIZE);
    const endRow = startRow + viewHeight;
    // Use Math.round for offsetX and offsetY to avoid sub-pixel rendering
    const offsetX = -Math.round(cameraX % TILE_SIZE);
    const offsetY = -Math.round(cameraY % TILE_SIZE);

    for (let y = startRow; y <= endRow; y++) {
        for (let x = startCol; x <= endCol; x++) {
            if (x >= 0 && x < WORLD_WIDTH && y >= 0 && y < WORLD_HEIGHT) {
                const tile = gameWorld[y][x];
                if (tileImages[tile]) {
                    // Ensure x and y positions are rounded to the nearest whole number
                    ctx.drawImage(tileImages[tile], Math.round((x - startCol) * TILE_SIZE + offsetX), Math.round((y - startRow) * TILE_SIZE + offsetY), TILE_SIZE, TILE_SIZE);
                }
            } else {
                // Draw a default tile if outside the world bounds, ensuring x and y are rounded
                ctx.fillStyle = '#000';
                ctx.fillRect(Math.round((x - startCol) * TILE_SIZE + offsetX), Math.round((y - startRow) * TILE_SIZE + offsetY), TILE_SIZE, TILE_SIZE);
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