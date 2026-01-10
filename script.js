// =========================================================================
// --- 1. تعريف عناصر الواجهة الرسومية (HTML Elements) ---
// =========================================================================
const cells = document.querySelectorAll('[data-cell]');
const board = document.getElementById('board');
const statusText = document.getElementById('status-text');
const restartButton = document.getElementById('restart-button');
const backToMenuButton = document.getElementById('back-to-menu-button');
const startMenu = document.getElementById('start-menu');
const gameContainer = document.getElementById('game-container');

// أزرار القائمة
const pvpButton = document.getElementById('pvp-button');
const pvcButton = document.getElementById('pvc-button');
const findMatchButton = document.getElementById('find-match-button');
const createRoomButton = document.getElementById('create-room-button');
const joinRoomButton = document.getElementById('join-room-button');

// حقول الإدخال والعرض
const playerNameInput = document.getElementById('player-name');
const roomCodeInput = document.getElementById('room-code-input');
const roomCodeDisplay = document.getElementById('room-code-display');
const leaderboardElement = document.getElementById('leaderboard');
const difficultySelect = document.getElementById('difficulty-select');

// عناصر اللعبة
const scoreXElement = document.querySelector('#player-x-score .score');
const scoreOElement = document.querySelector('#player-o-score .score');
const scoreTieElement = document.querySelector('#tie-score .score');
const nameXElement = document.querySelector('#player-x-score .name');
const nameOElement = document.querySelector('#player-o-score .name');

// عناصر المحادثة
const chatContainer = document.getElementById('chat-container');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');

const sendChatButton = document.getElementById('send-chat-button');
const reactionsBar = document.getElementById('reactions-bar');
const skinSelect = document.getElementById('skin-select');
const soundToggle = document.getElementById('sound-toggle');
const spectateButton = document.getElementById('spectate-button');

const clickSound = new Audio('click.mp3');
const winSound = new Audio('win.mp3');
const drawSound = new Audio('draw.mp3');


// =========================================================================
// --- 2. متغيرات حالة اللعبة (Game State Variables) ---
// =========================================================================
const X_CLASS = 'x';
const O_CLASS = 'o';
const WINNING_COMBINATIONS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
];

let oTurn;
let gameMode;
const scores = { x: 0, o: 0, tie: 0 };
let currentLeaderboard = {};
let aiDifficulty = 'hard';
let isSpectator = false;
let currentSkin = localStorage.getItem('xo_skin') || 'classic';
let isSoundEnabled = localStorage.getItem('xo_sound') !== 'false'; // Default true

// --- متغيرات خاصة باللعب عبر الإنترنت ---
let socket;
let playerSymbol;
let room;
let myTurn;
let isOnlineGameEnded = false;
let myName = localStorage.getItem('xo_username') || "Player";
let myUserId = localStorage.getItem('xo_userid');

if (!myUserId) {
    myUserId = 'user_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('xo_userid', myUserId);
}
playerNameInput.value = myName === "Player" ? "" : myName;

let opponentName = "Opponent";


// =========================================================================
// --- 3. ربط الأحداث (Event Listeners) ---
// =========================================================================
pvpButton.addEventListener('click', () => selectGameMode('pvp'));
pvcButton.addEventListener('click', () => selectGameMode('pvc'));

findMatchButton.addEventListener('click', () => {
    if (validateName()) selectGameMode('online-match');
});

createRoomButton.addEventListener('click', () => {
    if (validateName()) selectGameMode('online-create');
});

joinRoomButton.addEventListener('click', () => {
    if (validateName() && validateRoomCode()) selectGameMode('online-join');
});

spectateButton.addEventListener('click', () => {
    if (validateRoomCode()) selectGameMode('online-spectate');
});

// إعدادات المظهر والصوت
skinSelect.value = currentSkin;
applySkin(currentSkin);
skinSelect.addEventListener('change', (e) => {
    currentSkin = e.target.value;
    localStorage.setItem('xo_skin', currentSkin);
    applySkin(currentSkin);
});

soundToggle.checked = isSoundEnabled;
soundToggle.addEventListener('change', (e) => {
    isSoundEnabled = e.target.checked;
    localStorage.setItem('xo_sound', isSoundEnabled);
});

// التفاعلات
document.querySelectorAll('.reaction-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        sendReaction(btn.innerText);
    });
});

restartButton.addEventListener('click', handleRestartClick);
backToMenuButton.addEventListener('click', showMainMenu);

sendChatButton.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatMessage();
});

// تحميل لوحة المتصدرين عند البدء
loadLeaderboard();

// =========================================================================
// --- 4. الوظائف الرئيسية لتشغيل اللعبة (Core Game Functions) ---
// =========================================================================

function validateName() {
    const name = playerNameInput.value.trim();
    if (!name) {
        alert("الرجاء إدخال اسمك أولاً!");
        return false;
    }
    myName = name;
    localStorage.setItem('xo_username', name);
    return true;
}

function validateRoomCode() {
    const code = roomCodeInput.value.trim();
    if (!code) {
        alert("الرجاء إدخال كود الغرفة!");
        return false;
    }
    return true;
}

function selectGameMode(mode) {
    gameMode = mode;
    startMenu.classList.add('hidden');
    gameContainer.classList.remove('hidden');

    // إعادة تعيين النتائج عند بدء وضع جديد
    scores.x = 0; scores.o = 0; scores.tie = 0;
    updateScoreboard();

    if (mode.startsWith('online')) {
        connectToServer(mode);
        chatContainer.classList.remove('hidden');
        if (mode !== 'online-spectate') {
            reactionsBar.classList.remove('hidden');
        } else {
            // Spectators can see reactions but maybe restrict sending? Let's allow simple sending for fun.
            reactionsBar.classList.remove('hidden');
        }
    } else {
        chatContainer.classList.add('hidden');
        reactionsBar.classList.add('hidden');
        nameXElement.innerText = (mode === 'pvc') ? "أنت" : "Player X";
        nameOElement.innerText = (mode === 'pvc') ? "الكمبيوتر" : "Player O";

        if (mode === 'pvc') {
            aiDifficulty = difficultySelect.value;
        }

        startGame();
    }
}

function showMainMenu() {
    gameContainer.classList.add('hidden');
    startMenu.classList.remove('hidden');
    if (socket) socket.disconnect();
    roomCodeDisplay.classList.add('hidden');
    chatMessages.innerHTML = ''; // مسح المحادثة
}

function startGame() {
    isOnlineGameEnded = false;
    oTurn = false;
    restartButton.innerText = 'إعادة اللعب';
    restartButton.disabled = false;
    statusText.innerText = '';

    cells.forEach(cell => {
        cell.classList.remove(X_CLASS, O_CLASS, 'winning-cell');
        cell.removeEventListener('click', handleClick);
        cell.addEventListener('click', handleClick); // تم إزالة { once: true } لإصلاح مشكلة اللعب أونلاين
    });

    if (!gameMode.startsWith('online')) {
        setStatusText();
    }
}

function handleClick(e) {
    const cell = e.target;

    if (isSpectator) return; // المراقب لا يلعب

    // منع النقر على خلية مشغولة بالفعل
    if (cell.classList.contains(X_CLASS) || cell.classList.contains(O_CLASS)) {
        return;
    }

    let currentClass;

    // تحديد الرمز الحالي بناءً على وضع اللعب
    if (gameMode.startsWith('online')) {
        if (!myTurn) return; // لا تفعل شيئًا إذا لم يكن دورك
        currentClass = playerSymbol === 'X' ? X_CLASS : O_CLASS;
    } else {
        currentClass = oTurn ? O_CLASS : X_CLASS;
    }

    // 1. ضع العلامة على اللوحة وشغل الصوت
    placeMark(cell, currentClass);
    if (isSoundEnabled) clickSound.play();

    // 2. إذا كان اللعب عبر الإنترنت، أرسل الحركة إلى الخادم فورًا
    if (gameMode.startsWith('online')) {
        const cellIndex = [...cells].indexOf(cell);
        socket.emit('playerMove', { cellIndex: cellIndex, room: room });
        myTurn = false; // لقد انتهى دورك بمجرد إرسال الحركة
    }

    // 3. تحقق من نتيجة الحركة (فوز)
    if (checkWin(currentClass)) {
        endGame(false, currentClass);
    }
    // 4. أو تحقق من نتيجة الحركة (تعادل)
    else if (isDraw()) {
        endGame(true);
    }
    // 5. إذا لم تنته اللعبة، انتقل للدور التالي
    else {
        // في الأوضاع غير المتصلة بالإنترنت، قم بتبديل الأدوار
        if (!gameMode.startsWith('online')) {
            swapTurns();
            setStatusText();
            // إذا كان الدور على الكمبيوتر، فدعه يلعب
            if (gameMode === 'pvc' && oTurn) {
                handleComputerMove();
            }
        } else {
            // في وضع الإنترنت، فقط قم بتحديث النص
            setStatusText();
        }
    }
}

function endGame(draw, winnerClass = null) {
    if (draw) {
        statusText.innerText = 'تعادل!';
        scores.tie++;
        if (isSoundEnabled) drawSound.play();
    } else {
        const winnerName = (winnerClass === O_CLASS) ? nameOElement.innerText : nameXElement.innerText;
        statusText.innerText = `${winnerName} فاز!`;

        if (winnerClass === 'x') scores.x++; else scores.o++;

        const winningCombination = getWinningCombination(winnerClass);
        highlightWinningCells(winningCombination);
        if (isSoundEnabled) winSound.play();

        // تحديث لوحة المتصدرين إذا فاز اللاعب المحلي
        if (!gameMode.startsWith('online')) {
            // منطق بسيط للمحلي
        } else {
            // Leaderboard is now handled by server
        }
    }
    updateScoreboard();

    cells.forEach(cell => cell.removeEventListener('click', handleClick));

    if (gameMode.startsWith('online')) {
        restartButton.innerText = 'العب مرة أخرى';
        isOnlineGameEnded = true;
    }
}

// =========================================================================
// --- 5. وظائف مساعدة (Helper Functions) ---
// =========================================================================

function isDraw() {
    return [...cells].every(cell => cell.classList.contains(X_CLASS) || cell.classList.contains(O_CLASS));
}

function placeMark(cell, currentClass) {
    cell.classList.add(currentClass);
}

function swapTurns() {
    oTurn = !oTurn;
}

function setStatusText() {
    if (gameMode.startsWith('online')) {
        statusText.innerText = myTurn ? "دورك الآن." : `دور ${opponentName}...`;
    } else {
        const currentPlayerName = oTurn ? nameOElement.innerText : nameXElement.innerText;
        statusText.innerText = `الدور على ${currentPlayerName}`;
    }
}

function checkWin(currentClass) {
    return WINNING_COMBINATIONS.some(combination => {
        return combination.every(index => cells[index].classList.contains(currentClass));
    });
}

function getWinningCombination(winnerClass) {
    return WINNING_COMBINATIONS.find(combination => {
        return combination.every(index => cells[index].classList.contains(winnerClass));
    });
}

function highlightWinningCells(combination) {
    if (!combination) return;
    combination.forEach(index => cells[index].classList.add('winning-cell'));
}

function updateScoreboard() {
    scoreXElement.innerText = scores.x;
    scoreOElement.innerText = scores.o;
    scoreTieElement.innerText = scores.tie;
}

function handleRestartClick() {
    if (gameMode.startsWith('online')) {
        if (isOnlineGameEnded) {
            socket.emit('playAgainRequest', { room });
            statusText.innerText = 'تم إرسال طلب... في انتظار الخصم...';
            restartButton.disabled = true;
        }
    } else {
        startGame();
    }
}

// =========================================================================
// --- 6. ذكاء الكمبيوتر (AI with Minimax) ---
// =========================================================================
function handleComputerMove() {
    board.style.pointerEvents = 'none';
    setTimeout(() => {
        const bestMove = getAiMove();
        if (bestMove.index !== undefined) {
            cells[bestMove.index].click();
        }
        board.style.pointerEvents = 'auto';
    }, 600);
}

function getAiMove() {
    if (aiDifficulty === 'easy') {
        return getRandomMove();
    } else if (aiDifficulty === 'medium') {
        // 60% فرصة للعب الذكي، 40% عشوائي - لتكون متوسطة حقاً
        return Math.random() < 0.6 ? getMinimaxMove() : getRandomMove();
    } else {
        return getMinimaxMove();
    }
}

function getRandomMove() {
    const availableCells = [];
    cells.forEach((cell, index) => {
        if (!cell.classList.contains(X_CLASS) && !cell.classList.contains(O_CLASS)) {
            availableCells.push(index);
        }
    });

    if (availableCells.length === 0) return {};

    const randomIndex = Math.floor(Math.random() * availableCells.length);
    return { index: availableCells[randomIndex] };
}

function getMinimaxMove() {
    let bestScore = -Infinity;
    let move = {};
    for (let i = 0; i < cells.length; i++) {
        if (!cells[i].classList.contains(X_CLASS) && !cells[i].classList.contains(O_CLASS)) {
            cells[i].classList.add(O_CLASS);
            let score = minimax(false);
            cells[i].classList.remove(O_CLASS);
            if (score > bestScore) {
                bestScore = score;
                move.index = i;
            }
        }
    }
    return move;
}

function minimax(isMaximizing) {
    if (checkWin(O_CLASS)) return 10;
    if (checkWin(X_CLASS)) return -10;
    if (isDraw()) return 0;

    if (isMaximizing) {
        let bestScore = -Infinity;
        for (let i = 0; i < cells.length; i++) {
            if (!cells[i].classList.contains(X_CLASS) && !cells[i].classList.contains(O_CLASS)) {
                cells[i].classList.add(O_CLASS);
                bestScore = Math.max(minimax(false), bestScore);
                cells[i].classList.remove(O_CLASS);
            }
        }
        return bestScore;
    } else {
        let bestScore = Infinity;
        for (let i = 0; i < cells.length; i++) {
            if (!cells[i].classList.contains(X_CLASS) && !cells[i].classList.contains(O_CLASS)) {
                cells[i].classList.add(X_CLASS);
                bestScore = Math.min(minimax(true), bestScore);
                cells[i].classList.remove(X_CLASS);
            }
        }
        return bestScore;
    }
}

// =========================================================================
// --- 7. قسم اللعب عبر الإنترنت (Online Multiplayer Section) ---
// =========================================================================
function connectToServer(mode) {
    const serverUrl = window.location.origin; // تلقائي لنفس الخادم
    socket = io(serverUrl);

    socket.on('connect', () => {
        socket.emit('registerUser', myUserId);

        // إذا كان هناك غرفة مخزنة نحاول الانضمام لها (Rejoin Logic)
        const storedRoom = localStorage.getItem('xo_active_room');
        if (storedRoom && !mode.startsWith('online')) {
            // Note: If we are just opening the page and want to auto-reconnect, we'd need more logic.
            // But here, if we are initiating a connection via button click, we follow the button's intent.
            // However, we can also check for auto-rejoin on page load?
            // For now, let's stick to the mode requested.
        }

        if (mode === 'online-create') {
            socket.emit('createRoom', { playerName: myName });
        } else if (mode === 'online-join') {
            const roomId = roomCodeInput.value.trim();
            socket.emit('joinRoom', { roomId: roomId, playerName: myName });
        } else if (mode === 'online-match') {
            socket.emit('findMatch', { playerName: myName });
        } else if (mode === 'online-spectate') {
            const roomId = roomCodeInput.value.trim();
            isSpectator = true;
            socket.emit('joinSpectator', { roomId: roomId });
        } else if (mode === 'rejoin') {
            const roomId = localStorage.getItem('xo_active_room');
            if (roomId) socket.emit('rejoinGame', { roomId: roomId });
        }
    });

    socket.on('roomCreated', (data) => {
        statusText.innerText = `تم إنشاء الغرفة! الكود: ${data.roomId}`;
        roomCodeDisplay.innerText = `كود الغرفة: ${data.roomId}`;
        roomCodeDisplay.classList.remove('hidden');
        startMenu.classList.remove('hidden'); // إبقاء القائمة ظاهرة حتى ينضم أحد
        gameContainer.classList.add('hidden');

        localStorage.setItem('xo_active_room', data.roomId);

        // عرض رسالة انتظار في القائمة
        const waitMsg = document.createElement('p');
        waitMsg.id = 'temp-wait-msg';
        waitMsg.innerText = 'في انتظار انضمام صديقك...';
        waitMsg.style.color = 'var(--accent-color-1)';
        document.querySelector('.room-controls').appendChild(waitMsg);
    });

    socket.on('waitingForPlayer', () => {
        statusText.innerText = 'جاري البحث عن خصم عشوائي...';
    });

    socket.on('gameStart', (data) => {
        // إخفاء عناصر الانتظار في القائمة إذا كانت موجودة
        const waitMsg = document.getElementById('temp-wait-msg');
        if (waitMsg) waitMsg.remove();

        startMenu.classList.add('hidden');
        gameContainer.classList.remove('hidden');

        playerSymbol = data.symbol;
        room = data.room;
        myTurn = data.turn;
        opponentName = data.opponentName || "Opponent";

        // تحديث الأسماء في الواجهة
        if (playerSymbol === 'X') {
            nameXElement.innerText = myName + " (أنت)";
            nameOElement.innerText = opponentName;
        } else {
            nameOElement.innerText = myName + " (أنت)";
            nameXElement.innerText = opponentName;
        }

        localStorage.setItem('xo_active_room', room);

        startGame();
        setStatusText();
        addChatMessage("System", `بدأت اللعبة ضد ${opponentName}`);
    });

    socket.on('gameRejoined', (data) => {
        startMenu.classList.add('hidden');
        gameContainer.classList.remove('hidden');
        chatContainer.classList.remove('hidden');

        playerSymbol = data.symbol;
        room = data.room;

        // Restore Board
        const boardState = data.board;
        cells.forEach((cell, index) => {
            cell.classList.remove(X_CLASS, O_CLASS);
            // Remove old listeners to be safe before adding new ones
            cell.removeEventListener('click', handleClick);

            if (boardState[index] === 'X') cell.classList.add(X_CLASS);
            if (boardState[index] === 'O') cell.classList.add(O_CLASS);
        });

        myTurn = data.turn; // Turn is already calculated for me
        opponentName = data.opponentName;

        if (playerSymbol === 'X') {
            nameXElement.innerText = myName + " (أنت)";
            nameOElement.innerText = opponentName;
        } else {
            nameOElement.innerText = myName + " (أنت)";
            nameXElement.innerText = opponentName;
        }

        startGame(); // Re-bind listeners

        // Re-apply marks visually just in case startGame cleared them (it does clear them!)
        // So we need to re-apply classes AFTER startGame() calls remove...
        cells.forEach((cell, index) => {
            if (boardState[index] === 'X') cell.classList.add(X_CLASS);
            if (boardState[index] === 'O') cell.classList.add(O_CLASS);
        });

        setStatusText();
        addChatMessage("System", `تم استعادة الاتصال بالغرفة ${room}`);
    });

    socket.on('opponentMove', (data) => {
        const opponentClass = playerSymbol === 'X' ? O_CLASS : X_CLASS;
        const cell = cells[data.cellIndex];

        placeMark(cell, opponentClass);
        if (isSoundEnabled) clickSound.play();

        if (checkWin(opponentClass)) {
            endGame(false, opponentClass);
        } else if (isDraw()) {
            endGame(true);
        } else {
            myTurn = true;
            setStatusText();
        }
    });

    // FIX: Handle chat messages from server (for both me and opponent)
    socket.on('chatMessage', (data) => {
        const isMe = data.sender === myName;
        addChatMessage(data.sender, data.message, isMe);
    });

    socket.on('opponentLeft', () => {
        statusText.innerText = 'الخصم قطع الاتصال! لقد فزت.';
        isOnlineGameEnded = true;
        cells.forEach(cell => cell.removeEventListener('click', handleClick));
        addChatMessage("System", "الخصم غادر الغرفة نهائياً.");
        localStorage.removeItem('xo_active_room');
    });

    socket.on('opponentDisconnected', () => {
        statusText.innerText = 'انقطع اتصال الخصم... في انتظاره (30 ثانية)';
        addChatMessage("System", "انقطع اتصال الخصم. في انتظاره...");
    });

    socket.on('opponentReconnected', () => {
        statusText.innerText = 'عاد الخصم!';
        addChatMessage("System", "عاد الخصم للعبة.");
        setStatusText();
    });

    socket.on('leaderboardUpdate', (data) => {
        currentLeaderboard = data;
        renderLeaderboard();
    });

    socket.on('rejoinFailed', () => {
        // If rejoin failed, clear local storage and go to menu
        localStorage.removeItem('xo_active_room');
        showMainMenu();
        alert("تعذر استعادة اللعبة السابقة.");
    });

    socket.on('opponentWantsToPlayAgain', () => {
        statusText.innerText = 'خصمك يريد اللعب مرة أخرى!';
        restartButton.disabled = false;
        addChatMessage("System", "الخصم يريد اللعب مرة أخرى.");
    });

    socket.on('error', (data) => {
        alert(data.message);
        showMainMenu();
    });


    socket.on('spectatorGameState', (data) => {
        startMenu.classList.add('hidden');
        gameContainer.classList.remove('hidden');
        chatContainer.classList.remove('hidden');
        room = data.room;

        nameXElement.innerText = data.players.X.name;
        nameOElement.innerText = data.players.O ? data.players.O.name : "Waiting...";

        // Render Board
        cells.forEach((cell, index) => {
            cell.classList.remove(X_CLASS, O_CLASS, 'winning-cell');
            if (data.board[index] === 'X') cell.classList.add(X_CLASS);
            if (data.board[index] === 'O') cell.classList.add(O_CLASS);
        });

        statusText.innerText = `مشاهدة المباراة: ${data.room}`;
        addChatMessage("System", "لقد انضممت كمشاهد.");
    });

    socket.on('reaction', (data) => {
        showFloatingReaction(data.content);
    });
}

// =========================================================================
// --- 7.5 وظائف التفاعلات والمظهر ---
// =========================================================================

function applySkin(skin) {
    board.className = 'board'; // Reset
    if (skin !== 'classic') {
        board.classList.add(`skin-${skin}`);
    }
}

function sendReaction(emoji) {
    if (socket && room) {
        socket.emit('reaction', { room: room, content: emoji });
        showFloatingReaction(emoji); // Show locally instantly
    }
}

function showFloatingReaction(emoji) {
    const reaction = document.createElement('div');
    reaction.classList.add('floating-reaction');
    reaction.innerText = emoji;

    // Random position near center
    const x = Math.random() * 200 - 100;
    const y = Math.random() * 100 - 50;

    reaction.style.left = `calc(50% + ${x}px)`;
    reaction.style.top = `calc(50% + ${y}px)`;

    gameContainer.appendChild(reaction);

    setTimeout(() => reaction.remove(), 2000);
}

// =========================================================================
// --- 8. وظائف المحادثة (Chat Functions) ---
// =========================================================================
function sendChatMessage() {
    const message = chatInput.value.trim();
    if (message && socket && room) {
        socket.emit('chatMessage', { room: room, message: message, sender: myName });
        // FIX: Removed local addChatMessage, waiting for server broadcast
        chatInput.value = '';
    }
}

function addChatMessage(sender, message, isMe = false) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('chat-message');

    if (sender === "System") {
        msgDiv.style.background = "rgba(255, 255, 255, 0.1)";
        msgDiv.style.textAlign = "center";
        msgDiv.style.width = "100%";
        msgDiv.innerText = message;
    } else {
        msgDiv.classList.add(isMe ? 'my-message' : 'opponent-message');
        msgDiv.innerHTML = `<span class="sender-name">${sender}</span>${message}`;
    }

    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// =========================================================================
// --- 9. لوحة المتصدرين (Leaderboard Functions) ---
// =========================================================================
function saveWinToLeaderboard(name) {
    // Deprecated for Client, now Server handles it.
}

function loadLeaderboard() {
    // Initially try to render empty or wait for server
    renderLeaderboard();
}

function renderLeaderboard() {
    leaderboardElement.innerHTML = '';
    const sortedPlayers = Object.keys(currentLeaderboard).sort((a, b) => currentLeaderboard[b] - currentLeaderboard[a]);

    if (sortedPlayers.length === 0) {
        leaderboardElement.innerHTML = '<p>لا يوجد فائزون بعد.</p>';
        return;
    }

    sortedPlayers.slice(0, 5).forEach(player => {
        const div = document.createElement('div');
        div.classList.add('leaderboard-item');
        div.innerHTML = `<span>${player}</span><span class="wins">${currentLeaderboard[player]} فوز</span>`;
        leaderboardElement.appendChild(div);
    });
}

// Auto-Connect on Load if there is an active room
window.addEventListener('load', () => {
    // Small delay to ensure socket script loaded if external (it is local though)
    const activeRoom = localStorage.getItem('xo_active_room');
    if (activeRoom) {
        // We need to trigger connection mode 'rejoin'
        // But we need 'myName' and 'socket' initialized.
        // Let's create a temporary connection to try rejoining.
        selectGameMode('rejoin');
    }

    // Also, if we are just "browsing", we might want to see the leaderboard updates live?
    // We can open a socket just for leaderboard if we are at menu?
    // For now, let's keep it simple: Connect when playing/finding.
    // BUT: Leaderboard is shown on menu. So we should probably connect to receive updates?
    // Let's connect socket globally on load for menu updates.

    if (!socket) {
        const serverUrl = window.location.origin;
        socket = io(serverUrl);
        socket.on('connect', () => {
            socket.emit('registerUser', myUserId);
            if (activeRoom) {
                selectGameMode('rejoin');
            }
        });
        socket.on('leaderboardUpdate', (data) => {
            currentLeaderboard = data;
            renderLeaderboard();
        });
    }
});