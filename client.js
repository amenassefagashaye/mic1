// WebSocket and Game State Management
const gameState = {
    // WebSocket connection
    ws: null,
    isConnected: false,
    reconnectAttempts: 0,
    maxReconnectAttempts: 5,
    reconnectTimeout: null,
    
    // Admin state
    isAdmin: false,
    adminAuthenticated: false,
    
    // Game state
    gameType: null,
    payment: 0,
    paymentAmount: 25,
    stake: 25,
    totalWon: 0,
    boardId: 1,
    calledNumbers: [],
    markedNumbers: new Set(),
    gameActive: false,
    isCalling: false,
    callInterval: null,
    playerName: '',
    playerPhone: '',
    totalWithdrawn: 0,
    members: [],
    totalMembers: 90,
    calledNumbersDisplay: [],
    maxDisplayNumbers: 8,
    currentNumber: null,
    winningPatterns: {
        '75ball': ['row', 'column', 'diagonal', 'four-corners', 'full-house'],
        '90ball': ['one-line', 'two-lines', 'full-house'],
        '30ball': ['full-house']
    }
};

// WebSocket Connection Management
function initializeWebSocket() {
    // Determine WebSocket URL based on environment
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = window.location.port ? `:${window.location.port}` : '';
    const wsUrl = `${protocol}//${host}${port}/ws`;
    
    console.log('Connecting to WebSocket:', wsUrl);
    
    try {
        // Close existing connection if any
        if (gameState.ws && gameState.ws.readyState !== WebSocket.CLOSED) {
            gameState.ws.close();
        }
        
        // Create new WebSocket connection
        gameState.ws = new WebSocket(wsUrl);
        
        // Set up event handlers
        gameState.ws.onopen = handleWebSocketOpen;
        gameState.ws.onmessage = handleWebSocketMessage;
        gameState.ws.onerror = handleWebSocketError;
        gameState.ws.onclose = handleWebSocketClose;
        
    } catch (error) {
        console.error('Failed to create WebSocket connection:', error);
        attemptReconnect();
    }
}

function handleWebSocketOpen() {
    console.log('WebSocket connected successfully');
    gameState.isConnected = true;
    gameState.reconnectAttempts = 0;
    
    // Update UI to show connected state
    updateConnectionStatus(true);
    
    // Send initial handshake or authentication if needed
    if (gameState.isAdmin && gameState.adminAuthenticated) {
        sendWebSocketMessage({
            type: 'admin_auth',
            token: localStorage.getItem('admin_token')
        });
    } else if (gameState.playerName) {
        sendWebSocketMessage({
            type: 'player_join',
            name: gameState.playerName,
            phone: gameState.playerPhone,
            boardId: gameState.boardId
        });
    }
}

function handleWebSocketMessage(event) {
    try {
        const data = JSON.parse(event.data);
        console.log('Received WebSocket message:', data);
        
        // Handle different message types
        switch (data.type) {
            case 'game_state':
                updateGameState(data.gameState);
                break;
            case 'number_called':
                handleNumberCalled(data.number, data.gameType);
                break;
            case 'game_start':
                handleGameStart(data.gameType, data.stake);
                break;
            case 'game_end':
                handleGameEnd(data.winners);
                break;
            case 'player_joined':
                updatePlayerList(data.players);
                break;
            case 'admin_auth_response':
                handleAdminAuthResponse(data.success, data.message);
                break;
            case 'error':
                showError(data.message);
                break;
            case 'ping':
                // Respond to ping to keep connection alive
                sendWebSocketMessage({ type: 'pong' });
                break;
            default:
                console.log('Unknown message type:', data.type);
        }
    } catch (error) {
        console.error('Error processing WebSocket message:', error);
    }
}

function handleWebSocketError(error) {
    console.error('WebSocket error:', error);
    gameState.isConnected = false;
    updateConnectionStatus(false);
    
    // Attempt reconnect on error
    if (gameState.reconnectAttempts < gameState.maxReconnectAttempts) {
        attemptReconnect();
    }
}

function handleWebSocketClose(event) {
    console.log('WebSocket disconnected:', event.code, event.reason);
    gameState.isConnected = false;
    updateConnectionStatus(false);
    
    // Clear any calling intervals
    if (gameState.callInterval) {
        clearInterval(gameState.callInterval);
        gameState.callInterval = null;
    }
    
    // Attempt reconnect unless it was a normal closure
    if (event.code !== 1000 && gameState.reconnectAttempts < gameState.maxReconnectAttempts) {
        attemptReconnect();
    }
}

function attemptReconnect() {
    if (gameState.reconnectTimeout) {
        clearTimeout(gameState.reconnectTimeout);
    }
    
    if (gameState.reconnectAttempts >= gameState.maxReconnectAttempts) {
        console.error('Max reconnection attempts reached');
        showError('Connection lost. Please refresh the page.');
        return;
    }
    
    gameState.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, gameState.reconnectAttempts), 10000);
    
    console.log(`Attempting reconnect ${gameState.reconnectAttempts}/${gameState.maxReconnectAttempts} in ${delay}ms`);
    
    gameState.reconnectTimeout = setTimeout(() => {
        initializeWebSocket();
    }, delay);
}

function sendWebSocketMessage(message) {
    if (!gameState.ws || gameState.ws.readyState !== WebSocket.OPEN) {
        console.error('WebSocket is not connected');
        
        // Try to reconnect if not already trying
        if (gameState.reconnectAttempts === 0) {
            attemptReconnect();
        }
        
        // Store message to send after reconnection
        if (!gameState.pendingMessages) {
            gameState.pendingMessages = [];
        }
        gameState.pendingMessages.push(message);
        return false;
    }
    
    try {
        const messageString = JSON.stringify(message);
        gameState.ws.send(messageString);
        console.log('Sent WebSocket message:', message);
        return true;
    } catch (error) {
        console.error('Error sending WebSocket message:', error);
        return false;
    }
}

function updateConnectionStatus(connected) {
    const statusElement = document.getElementById('connection-status');
    if (statusElement) {
        statusElement.textContent = connected ? 'Connected' : 'Disconnected';
        statusElement.className = connected ? 'status-connected' : 'status-disconnected';
    }
    
    // Update connection indicator in UI
    const indicator = document.querySelector('.connection-indicator');
    if (indicator) {
        indicator.style.backgroundColor = connected ? '#4CAF50' : '#f44336';
    }
}

// Game State Handlers
function updateGameState(newState) {
    // Update game state with new data from server
    Object.assign(gameState, newState);
    
    // Update UI elements
    updateGameUI();
}

function handleNumberCalled(number, gameType) {
    gameState.currentNumber = number;
    gameState.calledNumbers.push(number);
    
    // Update display of called numbers
    if (gameState.calledNumbersDisplay.length >= gameState.maxDisplayNumbers) {
        gameState.calledNumbersDisplay.shift();
    }
    gameState.calledNumbersDisplay.push(number);
    
    updateCalledNumbersDisplay();
    
    // Check if player has won
    checkWinningConditions();
}

function handleGameStart(gameType, stake) {
    gameState.gameType = gameType;
    gameState.stake = stake;
    gameState.gameActive = true;
    gameState.calledNumbers = [];
    gameState.markedNumbers.clear();
    gameState.calledNumbersDisplay = [];
    
    // Update UI for game start
    document.getElementById('game-status').textContent = `${gameType} Game Active - Stake: $${stake}`;
    document.getElementById('start-game-btn').disabled = true;
    document.getElementById('call-number-btn').disabled = false;
    
    // Initialize board based on game type
    initializeGameBoard(gameType);
}

function handleGameEnd(winners) {
    gameState.gameActive = false;
    gameState.isCalling = false;
    
    if (gameState.callInterval) {
        clearInterval(gameState.callInterval);
        gameState.callInterval = null;
    }
    
    // Display winners
    displayWinners(winners);
    
    // Update UI for game end
    document.getElementById('game-status').textContent = 'Game Ended';
    document.getElementById('start-game-btn').disabled = false;
    document.getElementById('call-number-btn').disabled = true;
}

function updatePlayerList(players) {
    gameState.members = players;
    gameState.totalMembers = players.length;
    
    // Update player list in UI
    const playerList = document.getElementById('player-list');
    if (playerList) {
        playerList.innerHTML = players.map(player => 
            `<div class="player-item">${player.name} (Board ${player.boardId})</div>`
        ).join('');
    }
}

function handleAdminAuthResponse(success, message) {
    if (success) {
        gameState.adminAuthenticated = true;
        console.log('Admin authenticated successfully');
        // Enable admin controls
        enableAdminControls();
    } else {
        console.error('Admin authentication failed:', message);
        showError('Admin authentication failed');
    }
}

// UI Update Functions
function updateGameUI() {
    // Update various UI elements based on game state
    document.getElementById('total-won').textContent = `$${gameState.totalWon}`;
    document.getElementById('total-withdrawn').textContent = `$${gameState.totalWithdrawn}`;
    document.getElementById('total-members').textContent = gameState.totalMembers;
    
    // Update current number display
    const currentNumberEl = document.getElementById('current-number');
    if (currentNumberEl && gameState.currentNumber) {
        currentNumberEl.textContent = gameState.currentNumber;
        currentNumberEl.className = 'number-called';
    }
}

function updateCalledNumbersDisplay() {
    const container = document.getElementById('called-numbers-container');
    if (!container) return;
    
    container.innerHTML = gameState.calledNumbersDisplay
        .map(number => `<div class="called-number">${number}</div>`)
        .join('');
}

function initializeGameBoard(gameType) {
    const boardContainer = document.getElementById('game-board');
    boardContainer.innerHTML = '';
    
    let numbers = [];
    let rows, cols;
    
    switch (gameType) {
        case '75ball':
            rows = 5;
            cols = 15;
            numbers = generateBingoNumbers(1, 75, 24); // 5x5 with free center
            break;
        case '90ball':
            rows = 3;
            cols = 9;
            numbers = generateBingoNumbers(1, 90, 15); // 3x9
            break;
        case '30ball':
            rows = 3;
            cols = 9;
            numbers = generateBingoNumbers(1, 30, 15); // 3x9
            break;
    }
    
    // Create board grid
    for (let i = 0; i < rows; i++) {
        const row = document.createElement('div');
        row.className = 'board-row';
        
        for (let j = 0; j < cols; j++) {
            const cell = document.createElement('div');
            cell.className = 'board-cell';
            
            const index = i * cols + j;
            if (index < numbers.length) {
                cell.textContent = numbers[index];
                cell.dataset.number = numbers[index];
                
                // Add click handler for marking numbers
                cell.addEventListener('click', () => toggleNumberMark(numbers[index]));
            }
            
            row.appendChild(cell);
        }
        boardContainer.appendChild(row);
    }
}

function generateBingoNumbers(min, max, count) {
    const numbers = new Set();
    while (numbers.size < count) {
        numbers.add(Math.floor(Math.random() * (max - min + 1)) + min);
    }
    return Array.from(numbers).sort((a, b) => a - b);
}

function toggleNumberMark(number) {
    if (!gameState.gameActive) return;
    
    if (gameState.markedNumbers.has(number)) {
        gameState.markedNumbers.delete(number);
    } else {
        gameState.markedNumbers.add(number);
    }
    
    // Update UI
    const cell = document.querySelector(`[data-number="${number}"]`);
    if (cell) {
        cell.classList.toggle('marked');
    }
}

function checkWinningConditions() {
    if (!gameState.gameActive) return;
    
    // Implement winning pattern checking based on game type
    // This is a simplified version - implement actual pattern checking
    
    const patterns = gameState.winningPatterns[gameState.gameType] || [];
    
    patterns.forEach(pattern => {
        if (checkPattern(pattern)) {
            // Send win notification to server
            sendWebSocketMessage({
                type: 'win_claim',
                boardId: gameState.boardId,
                pattern: pattern,
                markedNumbers: Array.from(gameState.markedNumbers)
            });
        }
    });
}

function checkPattern(pattern) {
    // Simplified pattern checking - implement actual logic
    switch (pattern) {
        case 'full-house':
            return gameState.markedNumbers.size >= 15; // Adjust based on game
        default:
            return false;
    }
}

function displayWinners(winners) {
    const winnersContainer = document.getElementById('winners-container');
    if (!winnersContainer) return;
    
    if (winners.length === 0) {
        winnersContainer.innerHTML = '<p>No winners this game</p>';
        return;
    }
    
    const winnersList = winners.map(winner => 
        `<div class="winner-item">
            <strong>${winner.playerName}</strong> - ${winner.pattern} - $${winner.prize}
        </div>`
    ).join('');
    
    winnersContainer.innerHTML = winnersList;
}

// Admin Functions
function enableAdminControls() {
    // Enable admin-only buttons and inputs
    const adminControls = document.querySelectorAll('.admin-control');
    adminControls.forEach(control => {
        control.disabled = false;
        control.style.display = 'block';
    });
}

function adminLogin() {
    const username = document.getElementById('admin-username').value;
    const password = document.getElementById('admin-password').value;
    
    // Send login request via WebSocket
    sendWebSocketMessage({
        type: 'admin_login',
        username: username,
        password: password
    });
}

function startGame() {
    const gameType = document.getElementById('game-type-select').value;
    const stake = parseInt(document.getElementById('stake-amount').value) || 25;
    
    sendWebSocketMessage({
        type: 'start_game',
        gameType: gameType,
        stake: stake
    });
}

function callNumber() {
    if (!gameState.isCalling) {
        // Start auto-calling
        gameState.isCalling = true;
        gameState.callInterval = setInterval(() => {
            sendWebSocketMessage({ type: 'call_number' });
        }, 3000); // Call every 3 seconds
        
        document.getElementById('call-number-btn').textContent = 'Stop Calling';
    } else {
        // Stop calling
        gameState.isCalling = false;
        if (gameState.callInterval) {
            clearInterval(gameState.callInterval);
            gameState.callInterval = null;
        }
        document.getElementById('call-number-btn').textContent = 'Start Calling Numbers';
    }
}

function endGame() {
    sendWebSocketMessage({
        type: 'end_game'
    });
}

// Player Functions
function joinGame() {
    const name = document.getElementById('player-name').value.trim();
    const phone = document.getElementById('player-phone').value.trim();
    const boardId = parseInt(document.getElementById('board-id').value) || 1;
    
    if (!name || !phone) {
        showError('Please enter your name and phone number');
        return;
    }
    
    gameState.playerName = name;
    gameState.playerPhone = phone;
    gameState.boardId = boardId;
    
    sendWebSocketMessage({
        type: 'player_join',
        name: name,
        phone: phone,
        boardId: boardId
    });
}

function makePayment() {
    const amount = gameState.paymentAmount;
    
    sendWebSocketMessage({
        type: 'make_payment',
        amount: amount,
        playerName: gameState.playerName,
        playerPhone: gameState.playerPhone
    });
}

function withdrawWinnings() {
    const amount = parseInt(prompt('Enter amount to withdraw:', gameState.totalWon)) || 0;
    
    if (amount > 0 && amount <= gameState.totalWon) {
        sendWebSocketMessage({
            type: 'withdraw',
            amount: amount,
            playerPhone: gameState.playerPhone
        });
    }
}

// Utility Functions
function showError(message) {
    const errorEl = document.getElementById('error-message');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
        setTimeout(() => {
            errorEl.style.display = 'none';
        }, 5000);
    }
    
    console.error('Error:', message);
}

// Event Listeners Setup
function setupEventListeners() {
    // Admin controls
    const adminLoginBtn = document.getElementById('admin-login-btn');
    if (adminLoginBtn) {
        adminLoginBtn.addEventListener('click', adminLogin);
    }
    
    const startGameBtn = document.getElementById('start-game-btn');
    if (startGameBtn) {
        startGameBtn.addEventListener('click', startGame);
    }
    
    const callNumberBtn = document.getElementById('call-number-btn');
    if (callNumberBtn) {
        callNumberBtn.addEventListener('click', callNumber);
    }
    
    const endGameBtn = document.getElementById('end-game-btn');
    if (endGameBtn) {
        endGameBtn.addEventListener('click', endGame);
    }
    
    // Player controls
    const joinGameBtn = document.getElementById('join-game-btn');
    if (joinGameBtn) {
        joinGameBtn.addEventListener('click', joinGame);
    }
    
    const paymentBtn = document.getElementById('make-payment-btn');
    if (paymentBtn) {
        paymentBtn.addEventListener('click', makePayment);
    }
    
    const withdrawBtn = document.getElementById('withdraw-btn');
    if (withdrawBtn) {
        withdrawBtn.addEventListener('click', withdrawWinnings);
    }
    
    // Tab switching (if applicable)
    const adminTab = document.getElementById('admin-tab');
    const playerTab = document.getElementById('player-tab');
    
    if (adminTab && playerTab) {
        adminTab.addEventListener('click', () => switchTab('admin'));
        playerTab.addEventListener('click', () => switchTab('player'));
    }
    
    // Reconnect button
    const reconnectBtn = document.getElementById('reconnect-btn');
    if (reconnectBtn) {
        reconnectBtn.addEventListener('click', () => {
            gameState.reconnectAttempts = 0;
            initializeWebSocket();
        });
    }
}

function switchTab(tabName) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(content => {
        content.style.display = 'none';
    });
    
    // Show selected tab content
    document.getElementById(`${tabName}-tab-content`).style.display = 'block';
    
    // Update active tab styling
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    // Set game state
    gameState.isAdmin = (tabName === 'admin');
}

// Initialize application
function initializeApp() {
    console.log('Initializing Bingo Game Client...');
    
    // Check if user is admin (from localStorage or URL parameter)
    const urlParams = new URLSearchParams(window.location.search);
    const adminToken = localStorage.getItem('admin_token');
    
    if (urlParams.get('admin') === 'true' || adminToken) {
        gameState.isAdmin = true;
        switchTab('admin');
    } else {
        switchTab('player');
    }
    
    // Set up event listeners
    setupEventListeners();
    
    // Initialize WebSocket connection
    initializeWebSocket();
    
    // Set up heartbeat to keep connection alive
    setInterval(() => {
        if (gameState.isConnected && gameState.ws.readyState === WebSocket.OPEN) {
            sendWebSocketMessage({ type: 'heartbeat' });
        }
    }, 30000); // Send heartbeat every 30 seconds
    
    console.log('App initialized');
}

// Start the application when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

// Export for testing/debugging
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { gameState, initializeWebSocket, sendWebSocketMessage };
}
