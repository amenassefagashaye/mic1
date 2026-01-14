// WebSocket and Game State Management
const gameState = {
    // WebSocket connection
    ws: null,
    isConnected: false,
    reconnectAttempts: 0,
    maxReconnectAttempts: 5,
    
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
        '30ball': ['full-house'],
        '50ball': ['row', 'column', 'diagonal', 'four-corners', 'full-house'],
        'pattern': ['x-pattern', 'frame', 'postage-stamp', 'small-diamond'],
        'coverall': ['full-board']
    },
    winConditions: {
        'row': 'ረድፍ',
        'column': 'አምድ',
        'diagonal': 'ዲያግናል',
        'four-corners': 'አራት ማእዘኖች',
        'full-house': 'ሙሉ ቤት',
        'one-line': 'አንድ ረድፍ',
        'two-lines': 'ሁለት ረድፍ',
        'x-pattern': 'X ንድፍ',
        'frame': 'አውራ ቀለበት',
        'postage-stamp': 'ማህተም',
        'small-diamond': 'ዲያምንድ',
        'full-board': 'ሙሉ ቦርድ'
    }
};

// Board Types
const boardTypes = [
    { id: '75ball', name: '75-ቢንጎ', icon: '🎯', desc: '5×5 ከBINGO', range: 75, columns: 5 },
    { id: '90ball', name: '90-ቢንጎ', icon: '🇬🇧', desc: '9×3 ፈጣን', range: 90, columns: 9 },
    { id: '30ball', name: '30-ቢንጎ', icon: '⚡', desc: '3×3 ፍጥነት', range: 30, columns: 3 },
    { id: '50ball', name: '50-ቢንጎ', icon: '🎲', desc: '5×5 ከBINGO', range: 50, columns: 5 },
    { id: 'pattern', name: 'ንድፍ ቢንጎ', icon: '✨', desc: 'ተጠቀም ንድፍ', range: 75, columns: 5 },
    { id: 'coverall', name: 'ሙሉ ቤት', icon: '🏆', desc: 'ሁሉንም ምልክት ያድርጉ', range: 90, columns: 9 }
];

// WebSocket Configuration
const WS_CONFIG = {
    url: () => {
        // In production, this should be your Deno Deploy WebSocket URL
        // For local testing: 'ws://localhost:8000'
        // For Deno Deploy: 'wss://your-project.deno.dev'
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return 'ws://localhost:8000';
        }
        // Replace with your actual Deno Deploy URL
        return 'wss://assefa-bingo.deno.dev';
    },
    protocols: ['bingo-protocol']
};

// WebSocket Connection Management
function connectWebSocket() {
    try {
        const wsUrl = WS_CONFIG.url();
        console.log('Connecting to WebSocket:', wsUrl);
        
        gameState.ws = new WebSocket(wsUrl, WS_CONFIG.protocols);
        
        gameState.ws.onopen = handleWebSocketOpen;
        gameState.ws.onmessage = handleWebSocketMessage;
        gameState.ws.onerror = handleWebSocketError;
        gameState.ws.onclose = handleWebSocketClose;
        
    } catch (error) {
        console.error('WebSocket connection error:', error);
        showNotification('የአገናኝ ችግር። እባክዎ እንደገና ይሞክሩ።', false);
        setTimeout(reconnectWebSocket, 3000);
    }
}

function handleWebSocketOpen() {
    console.log('WebSocket connected successfully');
    gameState.isConnected = true;
    gameState.reconnectAttempts = 0;
    
    // Check if user is admin
    const urlParams = new URLSearchParams(window.location.search);
    const isAdminPage = urlParams.get('admin') === 'true';
    
    if (isAdminPage) {
        showAdminLogin();
    } else {
        // Send player connection message
        sendWebSocketMessage({
            type: 'player_connect',
            timestamp: Date.now()
        });
    }
}

function handleWebSocketMessage(event) {
    try {
        const data = JSON.parse(event.data);
        console.log('Received WebSocket message:', data);
        
        switch(data.type) {
            case 'login_success':
                handleAdminLoginSuccess(data);
                break;
                
            case 'login_failed':
                handleAdminLoginFailed(data);
                break;
                
            case 'number_drawn':
                handleNumberDrawn(data);
                break;
                
            case 'game_state':
                handleGameState(data);
                break;
                
            case 'player_count':
                updatePlayerCount(data);
                break;
                
            case 'winner_announced':
                handleWinnerAnnouncement(data);
                break;
                
            case 'error':
                showNotification(data.message || 'ስህተት ተከስቷል', false);
                break;
                
            default:
                console.log('Unknown message type:', data.type);
        }
    } catch (error) {
        console.error('Error parsing WebSocket message:', error);
    }
}

function handleWebSocketError(error) {
    console.error('WebSocket error:', error);
    gameState.isConnected = false;
}

function handleWebSocketClose(event) {
    console.log('WebSocket closed:', event.code, event.reason);
    gameState.isConnected = false;
    
    if (!event.wasClean) {
        reconnectWebSocket();
    }
}

function reconnectWebSocket() {
    if (gameState.reconnectAttempts < gameState.maxReconnectAttempts) {
        gameState.reconnectAttempts++;
        console.log(`Reconnecting attempt ${gameState.reconnectAttempts}/${gameState.maxReconnectAttempts}`);
        
        setTimeout(() => {
            if (!gameState.isConnected) {
                connectWebSocket();
            }
        }, 2000 * gameState.reconnectAttempts);
    } else {
        showNotification('የአገናኝ ችግር። እባክዎ ገጹን ያድሱ።', false);
    }
}

function sendWebSocketMessage(message) {
    if (gameState.ws && gameState.ws.readyState === WebSocket.OPEN) {
        try {
            gameState.ws.send(JSON.stringify(message));
        } catch (error) {
            console.error('Error sending WebSocket message:', error);
        }
    } else {
        console.warn('WebSocket not connected, message not sent:', message);
    }
}

// Admin Functions
function showAdminLogin() {
    const password = prompt('እባክዎ የአስተዳዳሪ የይለፍ ቃል ያስገቡ:');
    
    if (password === 'asse2123') {
        sendWebSocketMessage({
            type: 'admin_login',
            password: password,
            timestamp: Date.now()
        });
    } else if (password !== null) {
        alert('የይለፍ ቃል ትክክል አይደለም።');
        window.location.href = window.location.pathname; // Remove ?admin=true
    } else {
        window.location.href = window.location.pathname;
    }
}

function handleAdminLoginSuccess(data) {
    gameState.isAdmin = true;
    gameState.adminAuthenticated = true;
    showNotification('እንኳን ደህና መጡ አስተዳዳሪ!', false);
    
    // Show admin controls
    document.getElementById('circularCallBtn').style.display = 'flex';
    document.getElementById('circularCallBtn').onclick = adminDrawNumber;
    document.getElementById('announceBtn').style.display = 'none';
    
    // Update UI for admin
    document.getElementById('gameHeader').textContent += ' (አስተዳዳሪ)';
}

function handleAdminLoginFailed(data) {
    alert('የይለፍ ቃል ትክክል አይደለም።');
    window.location.href = window.location.pathname;
}

function adminDrawNumber() {
    if (!gameState.isAdmin || !gameState.adminAuthenticated) return;
    
    sendWebSocketMessage({
        type: 'draw_number',
        timestamp: Date.now()
    });
}

// Game Functions
function handleNumberDrawn(data) {
    if (!data.number) return;
    
    const number = data.number;
    const displayText = data.display || number.toString();
    
    // Add to called numbers
    if (!gameState.calledNumbers.includes(number)) {
        gameState.calledNumbers.push(number);
    }
    
    // Update display
    if (gameState.currentNumber) {
        moveNumberToBar(gameState.currentNumber);
    }
    
    gameState.currentNumber = displayText;
    document.getElementById('currentNumberDisplay').textContent = displayText;
    
    // Play sound
    const audio = document.getElementById('callAudio');
    audio.currentTime = 0;
    audio.play().catch(() => {});
    
    // Mark on board if present
    markNumberOnBoard(number);
}

function handleGameState(data) {
    if (data.calledNumbers && Array.isArray(data.calledNumbers)) {
        gameState.calledNumbers = data.calledNumbers;
        updateCalledNumbersDisplay();
    }
    
    if (data.gameActive !== undefined) {
        gameState.gameActive = data.gameActive;
    }
}

function updatePlayerCount(data) {
    const count = data.count || 0;
    // Update UI with player count
    console.log(`Connected players: ${count}`);
}

function handleWinnerAnnouncement(data) {
    const winnerName = data.winnerName || 'Unknown';
    const pattern = data.pattern || 'unknown';
    const amount = data.amount || 0;
    
    // Show winner notification to all players
    document.getElementById('winnerName').textContent = winnerName;
    document.getElementById('winPattern').textContent = gameState.winConditions[pattern] || pattern;
    document.getElementById('displayWinAmount').textContent = `${amount.toLocaleString()} ብር`;
    document.getElementById('winnerNotification').style.display = 'block';
    
    // Play win sound
    const audio = document.getElementById('winAudio');
    audio.currentTime = 0;
    audio.play().catch(() => {});
}

// Helper Functions
function markNumberOnBoard(number) {
    const cells = document.querySelectorAll('.board-cell[data-number]');
    cells.forEach(cell => {
        if (parseInt(cell.dataset.number) === number) {
            if (!cell.classList.contains('marked')) {
                cell.classList.add('marked');
                gameState.markedNumbers.add(number);
            }
        }
    });
}

function moveNumberToBar(number) {
    gameState.calledNumbersDisplay.unshift(number);
    if (gameState.calledNumbersDisplay.length > gameState.maxDisplayNumbers) {
        gameState.calledNumbersDisplay.pop();
    }
    
    updateCalledNumbersDisplay();
}

function updateCalledNumbersDisplay() {
    const bar = document.getElementById('calledNumbersBar');
    bar.innerHTML = '';
    
    gameState.calledNumbersDisplay.forEach(num => {
        const span = document.createElement('span');
        span.className = 'called-number amharic-text';
        span.textContent = num;
        bar.appendChild(span);
    });
    
    if (gameState.calledNumbersDisplay.length === 0) {
        bar.innerHTML = '<span style="color: #888; font-style: italic;" class="amharic-text">ቁጥሮች ይጠራሉ...</span>';
    }
}

// Calculate potential win
function calculatePotentialWin(stake) {
    const validMembers = 90;
    const potential = (0.8 * validMembers * stake * 0.97);
    return Math.floor(potential);
}

// Initialize Game
function init() {
    setupBoardSelection();
    setupStakeOptions();
    setupBoardNumbers();
    generateMembers();
    updatePotentialWin();
    
    // Connect to WebSocket
    connectWebSocket();
    
    // Set up event listeners
    document.getElementById('nextBtn').onclick = () => {
        if (gameState.gameType) showPage(2);
        else showNotification('እባክዎ የቦርድ ዓይነት ይምረጡ', false);
    };
    
    document.getElementById('confirmBtn').onclick = confirmRegistration;
    document.getElementById('playerStake').onchange = updatePotentialWin;
    document.getElementById('paymentAmount').onchange = processPayment;
    document.getElementById('announceBtn').onclick = announceWin;
    
    // Mobile compatibility
    setupMobileTouchEvents();
}

// Setup functions (same as original but moved to separate functions)
function setupBoardSelection() {
    const grid = document.getElementById('boardTypeGrid');
    grid.innerHTML = '';
    
    boardTypes.forEach(type => {
        const card = document.createElement('div');
        card.className = 'board-type-card';
        card.innerHTML = `
            <div class="board-type-icon">${type.icon}</div>
            <div class="board-type-title amharic-text">${type.name}</div>
            <div class="board-type-desc amharic-text">${type.desc}</div>
        `;
        card.onclick = () => {
            document.querySelectorAll('.board-type-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            gameState.gameType = type.id;
            if (type.id === 'pattern') {
                const patterns = gameState.winningPatterns.pattern;
                gameState.currentPattern = patterns[Math.floor(Math.random() * patterns.length)];
            }
        };
        
        grid.appendChild(card);
    });
}

function setupStakeOptions() {
    const select = document.getElementById('playerStake');
    const stakes = [25, 50, 100, 200, 500, 1000, 2000, 5000];
    stakes.forEach(stake => {
        const option = document.createElement('option');
        option.value = stake;
        option.textContent = `${stake} ብር`;
        select.appendChild(option);
    });
    select.value = 25;
    gameState.stake = 25;
}

function setupBoardNumbers() {
    const select = document.getElementById('boardSelect');
    for (let i = 1; i <= 100; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `ቦርድ ${i}`;
        select.appendChild(option);
    }
    select.value = 1;
}

function generateMembers() {
    const names = [
        'መለስ ዜናዊ', 'አብይ አህመድ', 'ሳህለ ወልደ ማርያም', 'ደመቀ መኮንን',
        'ተዋሕዶ ረዳ', 'ብርሃን ነጋ', 'ሙሉጌታ ገብረ ክርስቶስ', 'ፍቅር አለማየሁ'
    ];
    
    const boardTypesList = ['75-ቢንጎ', '90-ቢንጎ', '30-ቢንጎ', '50-ቢንጎ', 'ንድፍ', 'ሙሉ ቤት'];
    
    gameState.members = [];
    
    for (let i = 1; i <= 90; i++) {
        const name = names[Math.floor(Math.random() * names.length)];
        const boardType = boardTypesList[Math.floor(Math.random() * boardTypesList.length)];
        const boards = Math.floor(Math.random() * 5) + 1;
        const paid = i <= 85;
        const won = Math.random() > 0.9 && paid;
        const stake = [25, 50, 100, 200, 500, 1000, 2000, 5000][Math.floor(Math.random() * 8)];
        const payment = paid ? stake + Math.floor(Math.random() * 100) : 0;
        const balance = payment + (won ? calculatePotentialWin(stake) * Math.random() : 0);
        const withdrawn = Math.random() > 0.7 ? Math.floor(balance * 0.5) : 0;
        
        gameState.members.push({
            id: i,
            name: `${name} ${i}`,
            phone: `09${Math.floor(Math.random() * 90000000 + 10000000)}`,
            boardType: boardType,
            boards: boards,
            paid: paid,
            won: won,
            stake: stake,
            payment: payment,
            balance: balance,
            withdrawn: withdrawn
        });
    }
    
    gameState.members.sort((a, b) => b.payment - a.payment);
}

// Page Navigation
function showPage(pageNum) {
    document.querySelectorAll('.page-container').forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(`page${pageNum}`).classList.add('active');
    
    if (pageNum === 3) {
        generateGameBoard();
        startNewGame();
    }
    if (pageNum === 4) {
        updateFinance();
    }
    if (pageNum === 5) {
        showHelpTab('general');
    }
}

function showHelpTab(tabId) {
    document.querySelectorAll('.help-nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelectorAll('.help-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    document.querySelector(`.help-nav-btn[onclick="showHelpTab('${tabId}')"]`).classList.add('active');
    document.getElementById(`help-${tabId}`).classList.add('active');
}

// Show Members Modal
function showMembers() {
    const membersList = document.getElementById('membersList');
    membersList.innerHTML = '';
    
    gameState.members.forEach(member => {
        const row = document.createElement('tr');
        row.className = 'member-row';
        row.innerHTML = `
            <td>${member.id}</td>
            <td class="member-name">${member.name}</td>
            <td>${member.phone}</td>
            <td class="${member.paid ? 'member-paid' : 'member-not-paid'}">${member.paid ? '✓' : '✗'}</td>
            <td>${member.stake} ብር</td>
            <td>${Math.floor(member.balance)} ብር</td>
        `;
        membersList.appendChild(row);
    });
    
    document.getElementById('membersModal').style.display = 'block';
}

function showPotentialWin() {
    const tbody = document.getElementById('winningTableBody');
    tbody.innerHTML = '';
    
    const stakes = [25, 50, 100, 200, 500, 1000, 2000, 5000];
    stakes.forEach(stake => {
        const winAmount = calculatePotentialWin(stake);
        const row = document.createElement('tr');
        row.className = stake === gameState.stake ? 'current-stake-row' : '';
        row.innerHTML = `
            <td class="amharic-text">${stake} ብር</td>
            <td class="win-amount">${winAmount.toLocaleString()} ብር</td>
        `;
        tbody.appendChild(row);
    });
    
    document.getElementById('potentialWinModal').style.display = 'block';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function updatePotentialWin() {
    const stake = parseInt(document.getElementById('playerStake').value) || 25;
    const winAmount = calculatePotentialWin(stake);
    
    document.getElementById('currentWinDisplay').textContent = winAmount.toLocaleString();
    gameState.stake = stake;
}

// Notification Functions
function showNotification(message, showContinue) {
    document.getElementById('notificationText').textContent = message;
    document.getElementById('continueBtn').style.display = showContinue ? 'flex' : 'none';
    document.getElementById('notification').style.display = 'block';
}

function hideNotification() {
    document.getElementById('notification').style.display = 'none';
}

function continueWithIncomplete() {
    hideNotification();
    gameState.playerName = document.getElementById('playerName').value || 'Guest';
    gameState.playerPhone = document.getElementById('playerPhone').value || '0000000000';
    gameState.stake = parseInt(document.getElementById('playerStake').value) || 25;
    gameState.boardId = document.getElementById('boardSelect').value || 1;
    showPage(3);
}

// Payment Functions
function processPayment() {
    const amount = parseInt(document.getElementById('paymentAmount').value);
    
    if (!amount || amount < 25) {
        return;
    }
    
    gameState.payment = amount;
    gameState.paymentAmount = amount;
    
    const select = document.getElementById('paymentAmount');
    select.style.background = '#28a745';
    select.style.color = 'white';
}

function confirmRegistration() {
    const name = document.getElementById('playerName').value;
    const phone = document.getElementById('playerPhone').value;
    const stake = document.getElementById('playerStake').value;
    const board = document.getElementById('boardSelect').value;
    
    const incomplete = !name || !phone || !stake || !board || gameState.payment === 0;
    
    if (incomplete) {
        showNotification('መረጃዎች ሙሉ አይደሉም። በዚህ ሁኔታ መቀጠል ይፈልጋሉ?', true);
        return;
    }
    
    gameState.playerName = name;
    gameState.playerPhone = phone;
    gameState.stake = parseInt(stake);
    gameState.boardId = board;
    
    // Add to members
    const existing = gameState.members.find(m => m.phone === phone);
    if (!existing) {
        const boardTypeName = boardTypes.find(t => t.id === gameState.gameType)?.name || '75-ቢንጎ';
        gameState.members.unshift({
            id: gameState.members.length + 1,
            name: name,
            phone: phone,
            boardType: boardTypeName,
            boards: 1,
            paid: true,
            won: false,
            stake: gameState.stake,
            payment: gameState.payment,
            balance: gameState.payment,
            withdrawn: 0
        });
    }
    
    showPage(3);
}

// Game Board Generation Functions
function generateGameBoard() {
    const board = document.getElementById('gameBoard');
    const header = document.getElementById('gameHeader');
    const type = boardTypes.find(t => t.id === gameState.gameType);
    
    board.innerHTML = '';
    header.textContent = `${type.name} - ቦርድ ${gameState.boardId}`;
    
    switch(gameState.gameType) {
        case '75ball':
        case '50ball':
            generateBingoBoard(type);
            break;
        case '90ball':
            generate90BallBoard(type);
            break;
        case '30ball':
            generate30BallBoard(type);
            break;
        case 'pattern':
            generatePatternBoard(type);
            break;
        case 'coverall':
            generateCoverallBoard(type);
            break;
    }
}

function generateBingoBoard(type) {
    const board = document.getElementById('gameBoard');
    const wrapper = document.createElement('div');
    wrapper.className = 'board-75-wrapper';
    
    // BINGO Labels
    const labels = document.createElement('div');
    labels.className = 'bingo-labels';
    'BINGO'.split('').forEach(letter => {
        const label = document.createElement('div');
        label.className = 'bingo-label';
        label.textContent = letter;
        labels.appendChild(label);
    });
    wrapper.appendChild(labels);
    
    // Board Grid
    const grid = document.createElement('div');
    grid.className = type.id === '75ball' ? 'board-75' : 'board-50';
    
    const columnRanges = type.id === '75ball' ? 
        [[1,15], [16,30], [31,45], [46,60], [61,75]] :
        [[1,10], [11,20], [21,30], [31,40], [41,50]];
    
    const columnNumbers = columnRanges.map(range => {
        let nums = new Set();
        while (nums.size < 5) {
            nums.add(Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0]);
        }
        return Array.from(nums).sort((a, b) => a - b);
    });
    
    for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 5; col++) {
            const cell = document.createElement('button');
            cell.className = 'board-cell';
            
            if (row === 2 && col === 2) {
                cell.textContent = '★';
                cell.classList.add('center-cell');
                cell.dataset.center = 'true';
                cell.onclick = () => {
                    if (!cell.classList.contains('marked')) {
                        cell.classList.add('marked');
                    }
                };
            } else {
                const num = columnNumbers[col][row];
                cell.textContent = num;
                cell.dataset.number = num;
                cell.dataset.row = row;
                cell.dataset.column = col;
                cell.onclick = () => toggleMark(cell, num);
            }
            
            grid.appendChild(cell);
        }
    }
    
    wrapper.appendChild(grid);
    board.appendChild(wrapper);
}

function generate90BallBoard(type) {
    const board = document.getElementById('gameBoard');
    const wrapper = document.createElement('div');
    wrapper.className = 'board-90-wrapper';
    
    // Column labels
    const labels = document.createElement('div');
    labels.className = 'board-90-labels';
    for (let i = 1; i <= 9; i++) {
        const label = document.createElement('div');
        label.className = 'board-90-label';
        label.textContent = `${(i-1)*10+1}-${i*10}`;
        labels.appendChild(label);
    }
    wrapper.appendChild(labels);
    
    // Board Grid
    const grid = document.createElement('div');
    grid.className = 'board-90';
    
    const ranges = [
        [1,10], [11,20], [21,30], [31,40], [41,50],
        [51,60], [61,70], [71,80], [81,90]
    ];
    
    const columnNumbers = ranges.map(range => {
        const count = Math.floor(Math.random() * 3) + 1;
        let nums = new Set();
        while (nums.size < count) {
            nums.add(Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0]);
        }
        return Array.from(nums).sort((a, b) => a - b);
    });
    
    const layout = Array(3).fill().map(() => Array(9).fill(null));
    
    columnNumbers.forEach((nums, col) => {
        const positions = [0,1,2].sort(() => Math.random() - 0.5).slice(0, nums.length);
        positions.forEach((row, idx) => {
            layout[row][col] = nums[idx];
        });
    });
    
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 9; col++) {
            const cell = document.createElement('button');
            cell.className = 'board-cell';
            const num = layout[row][col];
            
            if (num) {
                cell.textContent = num;
                cell.dataset.number = num;
                cell.dataset.row = row;
                cell.dataset.column = col;
                
                if (row === 1 && col === 4) {
                    cell.classList.add('center-cell');
                    cell.dataset.center = 'true';
                }
                
                cell.onclick = () => toggleMark(cell, num);
            } else {
                cell.classList.add('blank-cell');
                cell.textContent = '✗';
            }
            
            grid.appendChild(cell);
        }
    }
    
    wrapper.appendChild(grid);
    board.appendChild(wrapper);
}

function generate30BallBoard(type) {
    const board = document.getElementById('gameBoard');
    const wrapper = document.createElement('div');
    wrapper.className = 'board-30-wrapper';
    
    // Column labels
    const labels = document.createElement('div');
    labels.className = 'board-30-labels';
    for (let i = 1; i <= 3; i++) {
        const label = document.createElement('div');
        label.className = 'board-30-label';
        label.textContent = `${(i-1)*10+1}-${i*10}`;
        labels.appendChild(label);
    }
    wrapper.appendChild(labels);
    
    // Board Grid
    const grid = document.createElement('div');
    grid.className = 'board-30';
    
    let nums = new Set();
    while (nums.size < 9) {
        nums.add(Math.floor(Math.random() * 30) + 1);
    }
    const numbers = Array.from(nums).sort((a, b) => a - b);
    
    for (let i = 0; i < 9; i++) {
        const cell = document.createElement('button');
        cell.className = 'board-cell';
        cell.textContent = numbers[i];
        cell.dataset.number = numbers[i];
        cell.dataset.index = i;
        
        if (i === 4) {
            cell.classList.add('center-cell');
            cell.dataset.center = 'true';
        }
        
        cell.onclick = () => toggleMark(cell, numbers[i]);
        
        grid.appendChild(cell);
    }
    
    wrapper.appendChild(grid);
    board.appendChild(wrapper);
}

function generatePatternBoard(type) {
    const board = document.getElementById('gameBoard');
    const wrapper = document.createElement('div');
    wrapper.className = 'board-pattern-wrapper';
    
    // BINGO Labels
    const labels = document.createElement('div');
    labels.className = 'board-pattern-labels';
    'BINGO'.split('').forEach(letter => {
        const label = document.createElement('div');
        label.className = 'board-pattern-label';
        label.textContent = letter;
        labels.appendChild(label);
    });
    wrapper.appendChild(labels);
    
    // Board Grid
    const grid = document.createElement('div');
    grid.className = 'board-pattern';
    
    const columnRanges = [[1,15], [16,30], [31,45], [46,60], [61,75]];
    const columnNumbers = columnRanges.map(range => {
        let nums = new Set();
        while (nums.size < 5) {
            nums.add(Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0]);
        }
        return Array.from(nums).sort((a, b) => a - b);
    });
    
    // Define pattern cells
    const patternCells = getPatternCells(gameState.currentPattern);
    
    for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 5; col++) {
            const cell = document.createElement('button');
            cell.className = 'board-cell';
            
            if (row === 2 && col === 2) {
                cell.textContent = '★';
                cell.classList.add('center-cell');
                cell.dataset.center = 'true';
                cell.onclick = () => {
                    if (!cell.classList.contains('marked')) {
                        cell.classList.add('marked');
                    }
                };
            } else {
                const num = columnNumbers[col][row];
                cell.textContent = num;
                cell.dataset.number = num;
                cell.dataset.row = row;
                cell.dataset.column = col;
                
                if (patternCells.includes(`${row}-${col}`)) {
                    cell.classList.add('pattern-cell');
                }
                
                cell.onclick = () => toggleMark(cell, num);
            }
            
            grid.appendChild(cell);
        }
    }
    
    wrapper.appendChild(grid);
    board.appendChild(wrapper);
}

function generateCoverallBoard(type) {
    const board = document.getElementById('gameBoard');
    const wrapper = document.createElement('div');
    wrapper.className = 'board-coverall-wrapper';
    
    // Column labels
    const labels = document.createElement('div');
    labels.className = 'board-coverall-labels';
    for (let i = 1; i <= 9; i++) {
        const label = document.createElement('div');
        label.className = 'board-coverall-label';
        label.textContent = `${(i-1)*10+1}-${i*10}`;
        labels.appendChild(label);
    }
    wrapper.appendChild(labels);
    
    // Board Grid
    const grid = document.createElement('div');
    grid.className = 'board-coverall';
    
    let allNumbers = Array.from({length: 90}, (_, i) => i + 1);
    allNumbers = shuffleArray(allNumbers).slice(0, 45);
    
    for (let i = 0; i < 45; i++) {
        const row = Math.floor(i / 9);
        const col = i % 9;
        const cell = document.createElement('button');
        cell.className = 'board-cell';
        cell.textContent = allNumbers[i];
        cell.dataset.number = allNumbers[i];
        cell.dataset.index = i;
        
        if (row === 2 && col === 4) {
            cell.classList.add('center-cell');
            cell.dataset.center = 'true';
        }
        
        cell.onclick = () => toggleMark(cell, allNumbers[i]);
        
        grid.appendChild(cell);
    }
    
    wrapper.appendChild(grid);
    board.appendChild(wrapper);
}

function getPatternCells(pattern) {
    const patterns = {
        'x-pattern': ['0-0', '0-4', '1-1', '1-3', '2-2', '3-1', '3-3', '4-0', '4-4'],
        'frame': ['0-0', '0-1', '0-2', '0-3', '0-4', '4-0', '4-1', '4-2', '4-3', '4-4', '1-0', '2-0', '3-0', '1-4', '2-4', '3-4'],
        'postage-stamp': ['0-0', '0-1', '1-0', '1-1', '3-3', '3-4', '4-3', '4-4'],
        'small-diamond': ['1-2', '2-1', '2-2', '2-3', '3-2']
    };
    return patterns[pattern] || patterns['x-pattern'];
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function toggleMark(cell, number) {
    if (!gameState.gameActive) return;
    
    if (cell.classList.contains('marked')) {
        cell.classList.remove('marked');
        gameState.markedNumbers.delete(number);
    } else {
        cell.classList.add('marked');
        gameState.markedNumbers.add(number);
    }
}

function startNewGame() {
    gameState.gameActive = true;
    gameState.calledNumbers = [];
    gameState.calledNumbersDisplay = [];
    gameState.markedNumbers.clear();
    gameState.currentNumber = null;
    
    // Reset circular call button
    document.getElementById('currentNumberDisplay').textContent = '';
    document.getElementById('circularCallBtn').classList.remove('calling');
    
    updateCalledNumbersDisplay();
}

function announceWin() {
    if (!gameState.gameActive) return;
    
    const win = calculateWin();
    if (win) {
        const winAmount = calculatePotentialWin(gameState.stake);
        gameState.totalWon += winAmount;
        
        // Send winner announcement to server
        sendWebSocketMessage({
            type: 'announce_winner',
            winnerName: gameState.playerName,
            pattern: win.pattern,
            amount: winAmount,
            timestamp: Date.now()
        });
        
        document.getElementById('winnerName').textContent = gameState.playerName;
        document.getElementById('winPattern').textContent = gameState.winConditions[win.pattern] || win.pattern;
        document.getElementById('displayWinAmount').textContent = `${winAmount.toLocaleString()} ብር`;
        document.getElementById('winnerNotification').style.display = 'block';
        
        const audio = document.getElementById('winAudio');
        audio.currentTime = 0;
        audio.play().catch(() => {});
    } else {
        showNotification('አሸናፊ ንድፍ አልተጠናቀቀም። እባክዎ ይቆጥሩ!', false);
    }
}

function calculateWin() {
    const type = gameState.gameType;
    const patterns = gameState.winningPatterns[type];
    
    for (const pattern of patterns) {
        if (checkPattern(pattern)) {
            return { pattern: pattern };
        }
    }
    
    return null;
}

function checkPattern(pattern) {
    const cells = document.querySelectorAll('.board-cell:not(.blank-cell)');
    const markedCells = Array.from(cells).filter(cell => 
        cell.classList.contains('marked') || 
        (cell.classList.contains('center-cell') && 
         (gameState.gameType === '75ball' || gameState.gameType === '50ball' || gameState.gameType === 'pattern'))
    );
    
    const markedPositions = new Set();
    markedCells.forEach(cell => {
        if (cell.dataset.row !== undefined && cell.dataset.column !== undefined) {
            markedPositions.add(`${cell.dataset.row}-${cell.dataset.column}`);
        } else if (cell.dataset.index !== undefined) {
            markedPositions.add(`i${cell.dataset.index}`);
        }
    });
    
    switch(gameState.gameType) {
        case '75ball':
        case '50ball':
            return check75BallPattern(pattern, markedPositions);
        case '90ball':
            return check90BallPattern(pattern, markedPositions);
        case '30ball':
            return check30BallPattern(pattern, markedPositions);
        case 'pattern':
            return checkPatternBingo(pattern, markedPositions);
        case 'coverall':
            return checkCoverallPattern(pattern, markedPositions);
        default:
            return false;
    }
}

function check75BallPattern(pattern, markedPositions) {
    switch(pattern) {
        case 'row':
            for (let row = 0; row < 5; row++) {
                let complete = true;
                for (let col = 0; col < 5; col++) {
                    const pos = `${row}-${col}`;
                    if (row === 2 && col === 2) continue;
                    if (!markedPositions.has(pos)) {
                        complete = false;
                        break;
                    }
                }
                if (complete) return true;
            }
            return false;
            
        case 'column':
            for (let col = 0; col < 5; col++) {
                let complete = true;
                for (let row = 0; row < 5; row++) {
                    const pos = `${row}-${col}`;
                    if (row === 2 && col === 2) continue;
                    if (!markedPositions.has(pos)) {
                        complete = false;
                        break;
                    }
                }
                if (complete) return true;
            }
            return false;
            
        case 'diagonal':
            let diag1Complete = true;
            for (let i = 0; i < 5; i++) {
                const pos = `${i}-${i}`;
                if (i === 2) continue;
                if (!markedPositions.has(pos)) {
                    diag1Complete = false;
                    break;
                }
            }
            if (diag1Complete) return true;
            
            let diag2Complete = true;
            for (let i = 0; i < 5; i++) {
                const pos = `${i}-${4-i}`;
                if (i === 2) continue;
                if (!markedPositions.has(pos)) {
                    diag2Complete = false;
                    break;
                }
            }
            return diag2Complete;
            
        case 'four-corners':
            const corners = ['0-0', '0-4', '4-0', '4-4'];
            return corners.every(pos => markedPositions.has(pos));
            
        case 'full-house':
            for (let row = 0; row < 5; row++) {
                for (let col = 0; col < 5; col++) {
                    if (row === 2 && col === 2) continue;
                    const pos = `${row}-${col}`;
                    if (!markedPositions.has(pos)) {
                        return false;
                    }
                }
            }
            return true;
            
        default:
            return false;
    }
}

function check90BallPattern(pattern, markedPositions) {
    const rowCounts = [0, 0, 0];
    const totalCells = 15;
    
    const markedCells = Array.from(document.querySelectorAll('.board-cell:not(.blank-cell)')).filter(cell => 
        cell.classList.contains('marked')
    );
    
    markedCells.forEach(cell => {
        if (cell.dataset.row !== undefined) {
            const row = parseInt(cell.dataset.row);
            if (row >= 0 && row < 3) {
                rowCounts[row]++;
            }
        }
    });
    
    switch(pattern) {
        case 'one-line':
            return rowCounts.some(count => count >= 5);
            
        case 'two-lines':
            const rowsWithAllNumbers = rowCounts.filter(count => count >= 5);
            return rowsWithAllNumbers.length >= 2;
            
        case 'full-house':
            return markedCells.length >= totalCells;
            
        default:
            return false;
    }
}

function check30BallPattern(pattern, markedPositions) {
    if (pattern === 'full-house') {
        return markedPositions.size >= 9;
    }
    return false;
}

function checkPatternBingo(pattern, markedPositions) {
    const patternCells = getPatternCells(pattern);
    return patternCells.every(pos => markedPositions.has(pos));
}

function checkCoverallPattern(pattern, markedPositions) {
    if (pattern === 'full-board') {
        return markedPositions.size >= 45;
    }
    return false;
}

function continueGame() {
    document.getElementById('winnerNotification').style.display = 'none';
    startNewGame();
}

function updateFinance() {
    const balance = gameState.payment + gameState.totalWon - gameState.totalWithdrawn;
    const withdraw = Math.floor(balance * 0.97);
    
    document.getElementById('totalPayment').value = `${gameState.payment} ብር`;
    document.getElementById('totalWon').value = `${gameState.totalWon.toLocaleString()} ብር`;
    document.getElementById('currentBalance').value = `${balance.toLocaleString()} ብር`;
    document.getElementById('withdrawAmount').value = `${withdraw.toLocaleString()} ብር`;
}

function processWithdrawal() {
    const account = document.getElementById('withdrawAccount').value;
    const amount = parseInt(document.getElementById('withdrawAmount').value.replace(/,/g, ''));
    
    if (!account) {
        showNotification('የአካውንት ቁጥር ያስገቡ', false);
        return;
    }
    
    if (amount < 25) {
        showNotification('ዝቅተኛ መጠን 25 ብር', false);
        return;
    }
    
    const balance = gameState.payment + gameState.totalWon - gameState.totalWithdrawn;
    if (amount > balance) {
        showNotification('በቂ ሚዛን የለም', false);
        return;
    }
    
    gameState.totalWithdrawn += amount;
    updateFinance();
    showNotification(`${amount.toLocaleString()} ብር በተሳካ ሁኔታ ተወግዷል!`, false);
}

function setupMobileTouchEvents() {
    document.addEventListener('touchstart', (e) => {
        if (e.touches.length > 1) e.preventDefault();
    }, { passive: false });
    
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    
    // Handle orientation change
    window.addEventListener('orientationchange', () => {
        setTimeout(() => {
            window.scrollTo(0, 0);
            if (gameState.gameType) {
                generateGameBoard();
            }
        }, 100);
    });
    
    // Close modals when clicking outside
    window.addEventListener('click', (e) => {
        const membersModal = document.getElementById('membersModal');
        const potentialWinModal = document.getElementById('potentialWinModal');
        
        if (e.target === membersModal) {
            membersModal.style.display = 'none';
        }
        if (e.target === potentialWinModal) {
            potentialWinModal.style.display = 'none';
        }
    });
    
    // Ensure boards fit on resize
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (gameState.gameType) {
                generateGameBoard();
            }
        }, 250);
    });
}

// Initialize on load
window.addEventListener('DOMContentLoaded', init);