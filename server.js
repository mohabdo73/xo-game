// server.js - الخادم
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');
const LEADERBOARD_FILE = path.join(__dirname, 'leaderboard.json');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

let waitingPlayer = null;
// =========================================================================
// --- إدارة حالة الألعاب على الخادم ---
// =========================================================================
const rooms = {}; // سيحتفظ هذا الكائن بحالة كل لعبة نشطة

// هذا الجزء يخدم ملفات HTML/CSS/JS للعميل
app.use(express.static(__dirname));

io.on('connection', (socket) => {
    console.log('لاعب جديد متصل:', socket.id);

    // إرسال لوحة المتصدرين فور الاتصال
    sendLeaderboard(socket);

    // =========================================================================
    // --- إدارة الاتصال والأحداث ---
    // =========================================================================

    // 0. تسجيل معرف المستخدم (Reconnection Key)
    socket.on('registerUser', (userId) => {
        socket.userId = userId;
    });

    // 1. إنشاء غرفة جديدة
    socket.on('createRoom', (data) => {
        const roomId = data.roomId || Math.random().toString(36).substring(2, 8).toUpperCase();
        const playerName = data.playerName || 'Player X';
        const userId = socket.userId;

        if (rooms[roomId]) {
            socket.emit('error', { message: 'الغرفة موجودة بالفعل!' });
            return;
        }

        rooms[roomId] = {
            players: {
                'X': { id: socket.id, userId: userId, name: playerName, connected: true },
                'O': null
            },
            spectators: [],
            board: Array(9).fill(null),
            turn: 'X',
            playAgainVotes: 0,
            disconnectTimeout: null // مؤقت لحذف الغرفة عند الانقطاع
        };

        socket.join(roomId);
        socket.room = roomId;
        socket.emit('roomCreated', { roomId: roomId, symbol: 'X' });
        console.log(`تم إنشاء الغرفة ${roomId} بواسطة ${playerName} `);
    });

    // 2. الانضمام لغرفة موجودة
    socket.on('joinRoom', (data) => {
        const roomId = data.roomId;
        const playerName = data.playerName || 'Player O';
        const userId = socket.userId;
        const room = rooms[roomId];

        if (!room) {
            socket.emit('error', { message: 'الغرفة غير موجودة!' });
            return;
        }

        // Check for Reconnection first
        if (room.players.X && room.players.X.userId === userId) {
            handleReconnection(socket, roomId, 'X');
            return;
        }
        if (room.players.O && room.players.O.userId === userId) {
            handleReconnection(socket, roomId, 'O');
            return;
        }

        if (room.players.O) {
            socket.emit('error', { message: 'الغرفة ممتلئة!' });
            return;
        }

        room.players.O = { id: socket.id, userId: userId, name: playerName, connected: true };
        socket.join(roomId);
        socket.room = roomId;

        if (room.disconnectTimeout) {
            clearTimeout(room.disconnectTimeout);
            room.disconnectTimeout = null;
        }

        // إبلاغ اللاعبين ببدء اللعبة مع الأسماء
        io.to(room.players.X.id).emit('gameStart', {
            symbol: 'X',
            room: roomId,
            turn: true,
            opponentName: playerName
        });

        io.to(socket.id).emit('gameStart', {
            symbol: 'O',
            room: roomId,
            turn: false,
            opponentName: room.players.X.name
        });

        // إرسال اللوحة الحالية (فقط في حالة إعادة الاتصال قد نحتاج لتحديث البورد، هنا نبدأ جديد)
        // لكن لو كان هناك حالة سابقة (في حالة ما) يمكن إرسالها. هنا بداية جديدة.

        console.log(`انضم ${playerName} للغرفة ${roomId} `);
    });

    // 2.5 محاولة إعادة الانضمام المباشر (Rejoin Specific)
    // هذا مفيد إذا عمل اللاعب Refresh للصفحة
    socket.on('rejoinGame', (data) => {
        const roomId = data.roomId;
        const userId = socket.userId;
        const room = rooms[roomId];

        if (room) {
            if (room.players.X && room.players.X.userId === userId) {
                handleReconnection(socket, roomId, 'X');
                return;
            }
            if (room.players.O && room.players.O.userId === userId) {
                handleReconnection(socket, roomId, 'O');
                return;
            }
        }
        // إذا لم تنجح إعادة الاتصال، أخبر العميل
        socket.emit('rejoinFailed');
    });

    // 3. البحث العشوائي (الإبقاء على الميزة القديمة)
    // NOTE: For simplicity, matchmaking doesn't support aggressive reconnection nicely unless we store waiting players by userId.
    socket.on('findMatch', (data) => {
        const playerName = data.playerName || 'Player';
        const userId = socket.userId;

        // منع اللاعب من اللعب ضد نفسه
        if (waitingPlayer && waitingPlayer.userId === userId) {
            return;
        }

        if (waitingPlayer) {
            const playerX = waitingPlayer.socket;
            const playerO = socket;
            const roomId = playerX.id + '#' + playerO.id;
            const waitingPlayerName = waitingPlayer.name; // حفظ الاسم قبل الحذف
            const waitingPlayerUserId = waitingPlayer.userId;

            waitingPlayer = null;

            rooms[roomId] = {
                players: {
                    'X': { id: playerX.id, userId: waitingPlayerUserId, name: waitingPlayerName, connected: true },
                    'O': { id: playerO.id, userId: userId, name: playerName, connected: true }
                },
                board: Array(9).fill(null),
                turn: 'X',
                playAgainVotes: 0,
                disconnectTimeout: null
            };

            playerX.join(roomId);
            playerO.join(roomId);
            playerX.room = roomId;
            playerO.room = roomId;

            io.to(playerX.id).emit('gameStart', {
                symbol: 'X',
                room: roomId,
                turn: true,
                opponentName: playerName
            });
            io.to(playerO.id).emit('gameStart', {
                symbol: 'O',
                room: roomId,
                turn: false,
                opponentName: waitingPlayerName
            });

        } else {
            waitingPlayer = { socket: socket, name: playerName, userId: userId };
            socket.emit('waitingForPlayer');
        }
    });

    // 3.5 وضع المشاهدة
    socket.on('joinSpectator', (data) => {
        const roomId = data.roomId;
        const room = rooms[roomId];

        if (!room) {
            socket.emit('error', { message: 'الغرفة غير موجودة!' });
            return;
        }

        socket.join(roomId);
        room.spectators.push(socket.id);

        socket.emit('spectatorGameState', {
            room: roomId,
            players: room.players,
            board: room.board,
            turn: room.turn
        });

        console.log(`مشاهد انضم للغرفة ${roomId}`);
    });

    // 4. المحادثة الفورية والتفاعلات
    socket.on('chatMessage', (data) => {
        const room = data.room;
        if (room && rooms[room]) {
            io.to(room).emit('chatMessage', {
                sender: data.sender,
                message: data.message
            });
        }
    });

    socket.on('reaction', (data) => {
        const room = data.room;
        if (room && rooms[room]) {
            io.to(room).emit('reaction', {
                sender: socket.id,
                content: data.content
            });
        }
    });

    // =========================================================================
    // --- التحقق من صحة الحركات على الخادم ---
    // =========================================================================
    socket.on('playerMove', (data) => {
        const room = data.room;
        const cellIndex = data.cellIndex;
        const game = rooms[room];

        if (!game) return;

        const playerSymbol = game.players.X.id === socket.id ? 'X' : 'O';
        const isTurnCorrect = game.turn === playerSymbol;
        const isCellEmpty = game.board[cellIndex] === null;

        if (isTurnCorrect && isCellEmpty) {
            game.board[cellIndex] = playerSymbol;
            game.turn = playerSymbol === 'X' ? 'O' : 'X';

            io.to(room).emit('opponentMove', {
                cellIndex: data.cellIndex,
                symbol: playerSymbol,
                turn: game.turn
            });

            // التحقق من الفوز لتحديث المتصدرين
            if (checkWin(game.board, playerSymbol)) {
                // الفائز هو playerSymbol
                const winnerName = (playerSymbol === 'X') ? game.players.X.name : game.players.O.name;
                updateLeaderboard(winnerName);
            }
        }
    });

    // =========================================================================
    // --- معالجة طلبات إعادة اللعب ---
    // =========================================================================
    socket.on('playAgainRequest', (data) => {
        const room = data.room;
        const game = rooms[room];

        if (game) {
            game.playAgainVotes++;
            if (game.playAgainVotes === 2) {
                // كلا اللاعبين وافقا
                game.board = Array(9).fill(null);
                game.turn = 'X';
                game.playAgainVotes = 0;

                io.to(game.players.X.id).emit('gameStart', {
                    symbol: 'X',
                    room: room,
                    turn: true,
                    opponentName: game.players.O.name
                });
                io.to(game.players.O.id).emit('gameStart', {
                    symbol: 'O',
                    room: room,
                    turn: false,
                    opponentName: game.players.X.name
                });
            } else {
                // إبلاغ الخصم بالطلب
                socket.to(room).emit('opponentWantsToPlayAgain');
            }
        }
    });

    // =========================================================================
    // --- معالجة انقطاع الاتصال ---
    // =========================================================================
    socket.on('disconnect', () => {
        console.log('لاعب قطع الاتصال:', socket.id);
        if (waitingPlayer && waitingPlayer.socket === socket) {
            waitingPlayer = null;
        }

        const room = socket.room;
        if (room && rooms[room]) {
            const game = rooms[room];

            // تحديد أي لاعب انفصل
            const isX = game.players.X && game.players.X.id === socket.id;
            const isO = game.players.O && game.players.O.id === socket.id;

            if (isX) game.players.X.connected = false;
            if (isO) game.players.O.connected = false;

            // إبلاغ الخصم
            socket.to(room).emit('opponentDisconnected');

            // إذا كان كلا اللاعبين غير متصلين، أو إذا أردنا مهلة زمنية للحذف
            // سننتظر 30 ثانية قبل حذف الغرفة للسماح بإعادة الاتصال
            if (!game.disconnectTimeout) {
                game.disconnectTimeout = setTimeout(() => {
                    // التحقق مما إذا كان اللاعب لا يزال غير متصل
                    if (rooms[room]) {
                        io.to(room).emit('opponentLeft');
                        delete rooms[room];
                        console.log(`تم حذف الغرفة ${room} لعدم عودة اللاعبين.`);
                    }
                }, 30000); // 30 ثانية مهلة
            }
        }
    });


    // =========================================================================
    // --- دوال مساعدة (Leaderboard & Logic) ---
    // =========================================================================

    function handleReconnection(socket, roomId, symbol) {
        const room = rooms[roomId];
        if (!room) return;

        // تحديث Socket ID
        room.players[symbol].id = socket.id;
        room.players[symbol].connected = true;
        socket.join(roomId);
        socket.room = roomId;

        // إلغاء مؤقت الحذف إذا كان الجميع متصلين
        if (room.players.X && room.players.X.connected && room.players.O && room.players.O.connected) {
            if (room.disconnectTimeout) {
                clearTimeout(room.disconnectTimeout);
                room.disconnectTimeout = null;
            }
            io.to(roomId).emit('opponentReconnected');
        }

        // إرسال حالة اللعبة الحالية للاعب العائد
        socket.emit('gameRejoined', {
            symbol: symbol,
            room: roomId,
            board: room.board,
            turn: room.turn === symbol,
            opponentName: symbol === 'X' ? (room.players.O ? room.players.O.name : 'Waiting...') : room.players.X.name
        });

        console.log(`اللاعب ${room.players[symbol].name} عاد للغرفة ${roomId}`);
    }

    function updateLeaderboard(winnerName) {
        let leaderboard = {};
        try {
            if (fs.existsSync(LEADERBOARD_FILE)) {
                leaderboard = JSON.parse(fs.readFileSync(LEADERBOARD_FILE));
            }
        } catch (e) { console.error("Error reading leaderboard:", e); }

        if (leaderboard[winnerName]) {
            leaderboard[winnerName]++;
        } else {
            leaderboard[winnerName] = 1;
        }

        try {
            fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(leaderboard));
        } catch (e) { console.error("Error writing leaderboard:", e); }

        // بث التحديث للجميع
        // Access io from outer scope
        // io is not defined here if this was inside io.on, but moving it out means io must be global or passed.
        // io is defined at top level, so this is fine.
        io.emit('leaderboardUpdate', leaderboard);
    }

    function sendLeaderboard(socket) {
        try {
            if (fs.existsSync(LEADERBOARD_FILE)) {
                const leaderboard = JSON.parse(fs.readFileSync(LEADERBOARD_FILE));
                socket.emit('leaderboardUpdate', leaderboard);
            }
        } catch (e) { }
    }

    function checkWin(board, currentClass) {
        const WINNING_COMBINATIONS = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8],
            [0, 3, 6], [1, 4, 7], [2, 5, 8],
            [0, 4, 8], [2, 4, 6]
        ];
        return WINNING_COMBINATIONS.some(combination => {
            return combination.every(index => board[index] === currentClass);
        });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`الخادم يعمل على المنفذ ${PORT} `));