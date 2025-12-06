import React, { useState, useEffect } from 'react';
import { Users, Swords, Hand, Copy, Check, Bot, Globe, Clock, Wifi, WifiOff } from 'lucide-react';

// Firebaseのインポート（動的に確認）
let db = null;
let firestoreFunctions = null;

try {
  const firebaseModule = await import('./firebase');
  db = firebaseModule.db;
  
  const firestoreModule = await import('firebase/firestore');
  firestoreFunctions = {
    doc: firestoreModule.doc,
    getDoc: firestoreModule.getDoc,
    setDoc: firestoreModule.setDoc,
    onSnapshot: firestoreModule.onSnapshot,
    collection: firestoreModule.collection,
    query: firestoreModule.query,
    where: firestoreModule.where,
    getDocs: firestoreModule.getDocs,
    deleteDoc: firestoreModule.deleteDoc,
    updateDoc: firestoreModule.updateDoc,
    serverTimestamp: firestoreModule.serverTimestamp
  };
} catch (e) {
  console.log('Firebase not available, online features disabled');
}

export default function ChopsticksGame() {
  const [gameMode, setGameMode] = useState('menu');
  const [opponentType, setOpponentType] = useState('human');
  const [gameState, setGameState] = useState({
    player1: { left: 1, right: 1 },
    player2: { left: 1, right: 1 },
    currentPlayer: 1,
    selectedHand: null,
    winner: null,
    phase: 'playing',
    turnStartTime: Date.now()
  });
  const [roomCode, setRoomCode] = useState('');
  const [myPlayer, setMyPlayer] = useState(null);
  const [showRules, setShowRules] = useState(false);
  const [copied, setCopied] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [searching, setSearching] = useState(false);
  const [username, setUsername] = useState('');
  const [showNameInput, setShowNameInput] = useState(false);
  const [opponentName, setOpponentName] = useState('');
  const [timeLeft, setTimeLeft] = useState(30);
  const [timeoutCount, setTimeoutCount] = useState({ player1: 0, player2: 0 });
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  const [jankenChoice, setJankenChoice] = useState(null);
  const [jankenResult, setJankenResult] = useState(null);

  const hasFirebase = db !== null && firestoreFunctions !== null;

  // ローカルストレージからユーザー名を読み込み
  useEffect(() => {
    const savedName = localStorage.getItem('chopsticks_username');
    if (savedName) {
      setUsername(savedName);
    }
  }, []);

  const saveUsername = (name) => {
    localStorage.setItem('chopsticks_username', name);
    setUsername(name);
  };

  // Firebaseリアルタイム監視
  useEffect(() => {
    if (gameMode === 'online' && roomCode && hasFirebase) {
      const gameRef = firestoreFunctions.doc(db, 'games', roomCode);
      
      const unsubscribe = firestoreFunctions.onSnapshot(gameRef, (docSnap) => {
        if (docSnap.exists()) {
          const state = docSnap.data();
          setGameState(state);
          setWaiting(false);
          setSearching(false);
          
          if (myPlayer === 1 && state.player2Name) {
            setOpponentName(state.player2Name);
          } else if (myPlayer === 2 && state.player1Name) {
            setOpponentName(state.player1Name);
          }
          
          // タイムアウト回数をチェック
          if (state.timeoutCount) {
            setTimeoutCount(state.timeoutCount);
            const opponentTimeouts = myPlayer === 1 ? state.timeoutCount.player2 : state.timeoutCount.player1;
            if (opponentTimeouts >= 2) {
              setOpponentDisconnected(true);
            }
          }
          
          // じゃんけん結果判定
          if (state.phase === 'janken' && state.janken1 && state.janken2 && !jankenResult) {
            determineJankenWinner(state);
          }
        }
      });
      
      const heartbeatInterval = setInterval(() => {
        updateHeartbeat();
      }, 5000);
      
      return () => {
        unsubscribe();
        clearInterval(heartbeatInterval);
      };
    }
  }, [gameMode, roomCode, myPlayer, hasFirebase]);

  const updateHeartbeat = async () => {
    if (!roomCode || !myPlayer || !hasFirebase) return;
    try {
      const gameRef = firestoreFunctions.doc(db, 'games', roomCode);
      await firestoreFunctions.updateDoc(gameRef, {
        [`player${myPlayer}LastActive`]: Date.now()
      });
    } catch (error) {
      console.error('Heartbeat failed:', error);
    }
  };

  const makeJankenChoice = async (choice) => {
    setJankenChoice(choice);
    const newState = {
      ...gameState,
      [`janken${myPlayer}`]: choice
    };
    setGameState(newState);
    await saveGameState(newState);
  };

  const determineJankenWinner = (state) => {
    const j1 = state.janken1;
    const j2 = state.janken2;
    
    if (!j1 || !j2) return;
    
    let winner = null;
    if (j1 === j2) {
      winner = 'draw';
    } else if (
      (j1 === 'rock' && j2 === 'scissors') ||
      (j1 === 'scissors' && j2 === 'paper') ||
      (j1 === 'paper' && j2 === 'rock')
    ) {
      winner = 1;
    } else {
      winner = 2;
    }
    
    setJankenResult({ winner, j1, j2 });
    
    if (winner !== 'draw') {
      setTimeout(async () => {
        const newState = {
          ...state,
          phase: 'playing',
          currentPlayer: winner,
          turnStartTime: Date.now()
        };
        setGameState(newState);
        setJankenResult(null);
        await saveGameState(newState);
      }, 3000);
    } else {
      setTimeout(async () => {
        const newState = {
          ...state,
          janken1: null,
          janken2: null
        };
        setGameState(newState);
        setJankenChoice(null);
        setJankenResult(null);
        await saveGameState(newState);
      }, 3000);
    }
  };

  const getJankenEmoji = (choice) => {
    if (choice === 'rock') return '✊';
    if (choice === 'paper') return '✋';
    if (choice === 'scissors') return '✌️';
    return '?';
  };

  // タイマー管理
  useEffect(() => {
    if (gameState.phase === 'playing' && !gameState.winner) {
      const interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - gameState.turnStartTime) / 1000);
        const remaining = 30 - elapsed;
        setTimeLeft(remaining);
        
        if (remaining <= 0) {
          handleTimeOut();
        }
      }, 100);
      
      return () => clearInterval(interval);
    }
  }, [gameState.currentPlayer, gameState.phase, gameState.winner, gameState.turnStartTime]);

  const handleTimeOut = () => {
    const currentPlayerKey = `player${gameState.currentPlayer}`;
    const newTimeoutCount = {
      ...timeoutCount,
      [currentPlayerKey]: (timeoutCount[currentPlayerKey] || 0) + 1
    };
    
    setTimeoutCount(newTimeoutCount);
    
    // 2回タイムアウトで切断扱い
    if (newTimeoutCount[currentPlayerKey] >= 2) {
      if (gameMode === 'online' && gameState.currentPlayer !== myPlayer) {
        setOpponentDisconnected(true);
      }
    }
    
    const newState = {
      ...gameState,
      selectedHand: null,
      currentPlayer: gameState.currentPlayer === 1 ? 2 : 1,
      turnStartTime: Date.now(),
      timeoutCount: newTimeoutCount
    };
    setGameState(newState);
    if (gameMode === 'online') saveGameState(newState);
  };

  // CPU の思考
  useEffect(() => {
    if (opponentType === 'cpu' && gameMode === 'local' && gameState.currentPlayer === 2 && !gameState.winner && gameState.phase === 'playing') {
      const timer = setTimeout(() => {
        cpuMove();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [gameState.currentPlayer, gameState.winner, opponentType, gameMode, gameState.phase]);

  const cpuMove = () => {
    const p2 = gameState.player2;
    const p1 = gameState.player1;
    
    const cpuHands = [];
    if (p2.left > 0 && p2.left < 5) cpuHands.push('left');
    if (p2.right > 0 && p2.right < 5) cpuHands.push('right');
    
    const targetHands = [];
    if (p1.left > 0 && p1.left < 5) targetHands.push({ player: 1, hand: 'left' });
    if (p1.right > 0 && p1.right < 5) targetHands.push({ player: 1, hand: 'right' });
    
    if (cpuHands.length === 0 || targetHands.length === 0) return;
    
    const attackHand = cpuHands[Math.floor(Math.random() * cpuHands.length)];
    const target = targetHands[Math.floor(Math.random() * targetHands.length)];
    
    const attackFingers = p2[attackHand];
    const targetFingers = p1[target.hand];
    
    let newFingers = targetFingers + attackFingers;
    if (newFingers >= 5) {
      newFingers = 0;
    }
    
    const newState = {
      ...gameState,
      player1: {
        ...gameState.player1,
        [target.hand]: newFingers
      },
      currentPlayer: 1,
      turnStartTime: Date.now()
    };
    
    checkWinner(newState);
  };

  const saveGameState = async (state) => {
    if (!hasFirebase) return;
    try {
      const gameRef = firestoreFunctions.doc(db, 'games', roomCode);
      await firestoreFunctions.setDoc(gameRef, {
        ...state,
        [`player${myPlayer}LastActive`]: Date.now()
      }, { merge: true });
    } catch (error) {
      console.error('Failed to save game state:', error);
    }
  };

  const createRoom = async () => {
    if (!username) {
      setShowNameInput(true);
      return;
    }
    
    if (!hasFirebase) {
      alert('Firebaseが設定されていません。オンライン機能を使用するには、src/firebase.jsを正しく設定してください。');
      return;
    }
    
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoomCode(code);
    setMyPlayer(1);
    setGameMode('online');
    setWaiting(true);
    
    const initialState = {
      player1: { left: 1, right: 1 },
      player2: { left: 1, right: 1 },
      currentPlayer: 1,
      selectedHand: null,
      winner: null,
      players: 1,
      phase: 'janken',
      roomType: 'private',
      player1Name: username,
      player2Name: null,
      player1LastActive: Date.now(),
      player2LastActive: null,
      turnStartTime: Date.now(),
      janken1: null,
      janken2: null,
      timeoutCount: { player1: 0, player2: 0 }
    };
    
    const gameRef = firestoreFunctions.doc(db, 'games', code);
    await firestoreFunctions.setDoc(gameRef, initialState);
    setGameState(initialState);
  };

  const findRandomMatch = async () => {
    if (!username) {
      setShowNameInput(true);
      return;
    }
    
    if (!hasFirebase) {
      alert('Firebaseが設定されていません');
      return;
    }
    
    setSearching(true);
    
    try {
      const gamesRef = firestoreFunctions.collection(db, 'games');
      const q = firestoreFunctions.query(gamesRef, 
        firestoreFunctions.where('roomType', '==', 'random'), 
        firestoreFunctions.where('players', '==', 1)
      );
      const querySnapshot = await firestoreFunctions.getDocs(q);
      
      if (!querySnapshot.empty) {
        const gameDoc = querySnapshot.docs[0];
        const code = gameDoc.id;
        const state = gameDoc.data();
        
        state.players = 2;
        state.player2Name = username;
        await firestoreFunctions.updateDoc(firestoreFunctions.doc(db, 'games', code), { 
          players: 2,
          player2Name: username,
          player2LastActive: Date.now()
        });
        
        setRoomCode(code);
        setMyPlayer(2);
        setGameMode('online');
        setGameState(state);
        setSearching(false);
        setOpponentName(state.player1Name || 'プレイヤー 1');
      } else {
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        setRoomCode(code);
        setMyPlayer(1);
        setGameMode('online');
        setWaiting(true);
        
        const initialState = {
          player1: { left: 1, right: 1 },
          player2: { left: 1, right: 1 },
          currentPlayer: 1,
          selectedHand: null,
          winner: null,
          players: 1,
          phase: 'janken',
          roomType: 'random',
          player1Name: username,
          player2Name: null,
          player1LastActive: Date.now(),
          player2LastActive: null,
          turnStartTime: Date.now(),
          janken1: null,
          janken2: null,
          timeoutCount: { player1: 0, player2: 0 }
        };
        
        const gameRef = firestoreFunctions.doc(db, 'games', code);
        await firestoreFunctions.setDoc(gameRef, initialState);
        setGameState(initialState);
      }
    } catch (error) {
      console.error('Failed to find match:', error);
      setSearching(false);
      alert('マッチングに失敗しました: ' + error.message);
    }
  };

  const cancelSearch = async () => {
    if (roomCode && myPlayer === 1 && hasFirebase) {
      try {
        await firestoreFunctions.deleteDoc(firestoreFunctions.doc(db, 'games', roomCode));
      } catch (error) {
        console.error('Failed to delete game:', error);
      }
    }
    setSearching(false);
    setWaiting(false);
    setGameMode('menu');
    setRoomCode('');
    setMyPlayer(null);
  };

  const joinRoom = async (code) => {
    if (!username) {
      setShowNameInput(true);
      return;
    }
    
    if (!hasFirebase) {
      alert('Firebaseが設定されていません');
      return;
    }
    
    try {
      const gameRef = firestoreFunctions.doc(db, 'games', code);
      const docSnap = await firestoreFunctions.getDoc(gameRef);
      
      if (docSnap.exists()) {
        const state = docSnap.data();
        state.players = 2;
        state.player2Name = username;
        await firestoreFunctions.setDoc(gameRef, {
          ...state,
          player2LastActive: Date.now()
        });
        
        setRoomCode(code);
        setMyPlayer(2);
        setGameMode('online');
        setGameState(state);
        setOpponentName(state.player1Name || 'プレイヤー 1');
      } else {
        alert('ルームが見つかりません');
      }
    } catch (error) {
      alert('ルームが見つかりません: ' + error.message);
    }
  };

  const selectHand = (player, hand) => {
    if (gameState.winner || gameState.phase !== 'playing') return;
    
    // オンラインモード: 自分のプレイヤーかつ自分のターンのみ
    if (gameMode === 'online') {
      if (player !== myPlayer || gameState.currentPlayer !== myPlayer) return;
    }
    
    // ローカルモード
    if (gameMode === 'local' && opponentType === 'human' && player !== gameState.currentPlayer) return;
    if (gameMode === 'local' && opponentType === 'cpu' && player !== 1) return;
    
    const fingers = gameState[`player${player}`][hand];
    if (fingers === 0 || fingers >= 5) return;

    const newState = {
      ...gameState,
      selectedHand: gameState.selectedHand === `${player}-${hand}` ? null : `${player}-${hand}`
    };
    
    setGameState(newState);
    if (gameMode === 'online') saveGameState(newState);
  };

  const attack = (targetPlayer, targetHand) => {
    if (gameState.winner || gameState.phase !== 'playing') return;
    if (!gameState.selectedHand) return;
    
    const [attackPlayer, attackHand] = gameState.selectedHand.split('-');
    
    // オンラインモード: 自分のターンのみ
    if (gameMode === 'online' && gameState.currentPlayer !== myPlayer) return;
    if (gameMode === 'online' && parseInt(attackPlayer) !== myPlayer) return;
    
    // ローカルモード
    if (gameMode === 'local' && opponentType === 'human' && parseInt(attackPlayer) !== gameState.currentPlayer) return;
    if (gameMode === 'local' && opponentType === 'cpu' && parseInt(attackPlayer) !== 1) return;

    const attackFingers = gameState[`player${attackPlayer}`][attackHand];
    const targetFingers = gameState[`player${targetPlayer}`][targetHand];
    
    if (attackFingers === 0 || attackFingers >= 5 || targetFingers === 0 || targetFingers >= 5) return;
    if (parseInt(targetPlayer) === parseInt(attackPlayer) && targetHand === attackHand) return;

    let newFingers = targetFingers + attackFingers;
    if (newFingers >= 5) {
      newFingers = 0;
    }
    
    const newState = {
      ...gameState,
      [`player${targetPlayer}`]: {
        ...gameState[`player${targetPlayer}`],
        [targetHand]: newFingers
      },
      selectedHand: null,
      currentPlayer: gameState.currentPlayer === 1 ? 2 : 1,
      turnStartTime: Date.now(),
      timeoutCount: { player1: 0, player2: 0 } // 成功時はリセット
    };

    checkWinner(newState);
  };

  const selfAttack = (targetHand) => {
    if (gameState.winner || gameState.phase !== 'playing') return;
    if (!gameState.selectedHand) return;
    
    const [attackPlayer, attackHand] = gameState.selectedHand.split('-');
    
    // オンラインモード: 自分のターンのみ
    if (gameMode === 'online' && gameState.currentPlayer !== myPlayer) return;
    if (gameMode === 'online' && parseInt(attackPlayer) !== myPlayer) return;
    
    // ローカルモード
    if (gameMode === 'local' && opponentType === 'human' && parseInt(attackPlayer) !== gameState.currentPlayer) return;
    if (gameMode === 'local' && opponentType === 'cpu' && parseInt(attackPlayer) !== 1) return;
    
    if (targetHand === attackHand) return;

    const attackFingers = gameState[`player${attackPlayer}`][attackHand];
    const targetFingers = gameState[`player${attackPlayer}`][targetHand];
    
    if (attackFingers === 0 || attackFingers >= 5 || targetFingers === 0 || targetFingers >= 5) return;

    let newFingers = targetFingers + attackFingers;
    if (newFingers >= 5) {
      newFingers = 0;
    }
    
    const newState = {
      ...gameState,
      [`player${attackPlayer}`]: {
        ...gameState[`player${attackPlayer}`],
        [targetHand]: newFingers
      },
      selectedHand: null,
      currentPlayer: gameState.currentPlayer === 1 ? 2 : 1,
      turnStartTime: Date.now(),
      timeoutCount: { player1: 0, player2: 0 } // 成功時はリセット
    };

    checkWinner(newState);
  };

  const transfer = (fromHand, toHand) => {
    if (gameState.winner || gameState.phase !== 'playing') return;
    
    let currentPlayerId;
    if (gameMode === 'online') {
      // オンラインモード: 自分のターンのみ
      if (gameState.currentPlayer !== myPlayer) return;
      currentPlayerId = myPlayer;
    } else if (opponentType === 'cpu') {
      currentPlayerId = 1;
    } else {
      currentPlayerId = gameState.currentPlayer;
    }
    
    const player = `player${currentPlayerId}`;
    const from = gameState[player][fromHand];
    const to = gameState[player][toHand];
    
    if (from < 2) return;

    const amount = 1;
    if (from - amount < 0) return;

    let newTo = to + amount;
    if (newTo >= 5) {
      newTo = 0;
    }

    const newState = {
      ...gameState,
      [player]: {
        ...gameState[player],
        [fromHand]: from - amount,
        [toHand]: newTo
      },
      selectedHand: null,
      currentPlayer: gameState.currentPlayer === 1 ? 2 : 1,
      turnStartTime: Date.now(),
      timeoutCount: { player1: 0, player2: 0 } // 成功時はリセット
    };

    checkWinner(newState);
  };

  const checkWinner = (state) => {
    if (state.player1.left === 0 && state.player1.right === 0) {
      state.winner = 2;
    } else if (state.player2.left === 0 && state.player2.right === 0) {
      state.winner = 1;
    }
    setGameState(state);
    if (gameMode === 'online') saveGameState(state);
  };

  const reset = () => {
    const newState = {
      player1: { left: 1, right: 1 },
      player2: { left: 1, right: 1 },
      currentPlayer: 1,
      selectedHand: null,
      winner: null,
      players: gameState.players,
      phase: gameMode === 'online' ? 'janken' : 'playing',
      roomType: gameState.roomType,
      player1Name: gameState.player1Name,
      player2Name: gameState.player2Name,
      player1LastActive: gameState.player1LastActive,
      player2LastActive: gameState.player2LastActive,
      turnStartTime: Date.now(),
      janken1: null,
      janken2: null,
      timeoutCount: { player1: 0, player2: 0 }
    };
    setGameState(newState);
    setTimeLeft(30);
    setJankenChoice(null);
    setJankenResult(null);
    setTimeoutCount({ player1: 0, player2: 0 });
    setOpponentDisconnected(false);
    if (gameMode === 'online') saveGameState(newState);
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const leaveRoom = async () => {
    if (gameMode === 'online' && roomCode && hasFirebase) {
      try {
        await firestoreFunctions.deleteDoc(firestoreFunctions.doc(db, 'games', roomCode));
      } catch (error) {
        console.error('Failed to delete game:', error);
      }
    }
    setGameMode('menu');
    setRoomCode('');
    setMyPlayer(null);
    setWaiting(false);
    setSearching(false);
    setOpponentName('');
    setTimeLeft(30);
    setJankenChoice(null);
    setJankenResult(null);
    setTimeoutCount({ player1: 0, player2: 0 });
    setOpponentDisconnected(false);
  };

  const renderHand = (player, hand, fingers) => {
    const isSelected = gameState.selectedHand === `${player}-${hand}`;
    const isDead = fingers === 0 || fingers >= 5;
    
    let isMyTurn = false;
    let canInteract = false;
    
    if (gameMode === 'online') {
      isMyTurn = player === myPlayer && gameState.currentPlayer === myPlayer;
      canInteract = gameState.currentPlayer === myPlayer;
    } else if (opponentType === 'cpu') {
      isMyTurn = player === 1;
      canInteract = gameState.currentPlayer === 1;
    } else {
      isMyTurn = player === gameState.currentPlayer;
      canInteract = true;
    }

    return (
      <button
        onClick={() => {
          if (!canInteract) return;
          
          const [attackPlayer] = gameState.selectedHand ? gameState.selectedHand.split('-') : [null];
          const isSelfAttack = gameState.selectedHand && parseInt(attackPlayer) === player;
          
          if (isMyTurn && !isDead && !isSelfAttack) {
            selectHand(player, hand);
          } else if (gameState.selectedHand && !isDead && !isSelfAttack) {
            attack(player, hand);
          }
        }}
        className={`
          relative w-24 h-32 rounded-2xl font-bold text-2xl transition-all
          ${isDead ? 'bg-gray-800 text-gray-600' : 'bg-gradient-to-br from-blue-500 to-purple-600 text-white'}
          ${isSelected ? 'ring-4 ring-yellow-400 scale-110' : ''}
          ${isMyTurn && !isDead && canInteract ? 'hover:scale-105 active:scale-95' : ''}
          ${!isDead && gameState.selectedHand && canInteract ? 'hover:ring-2 hover:ring-red-400' : ''}
          ${!canInteract ? 'opacity-50 cursor-not-allowed' : ''}
        `}
        disabled={gameState.winner !== null || gameState.phase !== 'playing' || !canInteract}
      >
        <div className="absolute top-2 left-2 text-xs opacity-70">
          {hand === 'left' ? '左' : '右'}
        </div>
        <div className="flex items-center justify-center h-full">
          {isDead ? '💀' : fingers}
        </div>
        {isSelected && (
          <div className="absolute -top-2 -right-2 w-6 h-6 bg-yellow-400 rounded-full animate-pulse" />
        )}
      </button>
    );
  };

  if (showNameInput) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white p-4 flex items-center justify-center">
        <div className="max-w-md w-full bg-slate-800 rounded-xl p-6">
          <h2 className="text-2xl font-bold mb-4 text-center">ユーザー名を入力</h2>
          <input
            type="text"
            placeholder="あなたの名前"
            className="w-full py-3 px-4 bg-slate-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 mb-4"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={20}
            autoFocus
            onKeyPress={(e) => {
              if (e.key === 'Enter' && username.trim()) {
                saveUsername(username.trim());
                setShowNameInput(false);
              }
            }}
          />
          <button
            onClick={() => {
              if (username.trim()) {
                saveUsername(username.trim());
                setShowNameInput(false);
              }
            }}
            disabled={!username.trim()}
            className="w-full py-3 bg-purple-600 rounded-lg font-bold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            決定
          </button>
        </div>
      </div>
    );
  }

  if (gameMode === 'menu') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white p-4 flex items-center justify-center">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-2 flex items-center justify-center gap-2">
              <Swords className="w-10 h-10" />
              戦争 Online
            </h1>
            <p className="text-gray-400">Chopsticks Game</p>
            {username && (
              <div className="mt-4 inline-flex items-center gap-2 bg-slate-800 px-4 py-2 rounded-lg">
                <Users className="w-4 h-4" />
                <span className="font-bold">{username}</span>
                <button
                  onClick={() => setShowNameInput(true)}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  変更
                </button>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="bg-slate-800 rounded-xl p-4">
              <h2 className="font-bold mb-3 flex items-center gap-2">
                <Users className="w-5 h-5" />
                ローカル対戦
              </h2>
              <div className="space-y-2">
                <button
                  onClick={() => {
                    setOpponentType('human');
                    setGameMode('local');
                    setGameState({
                      player1: { left: 1, right: 1 },
                      player2: { left: 1, right: 1 },
                      currentPlayer: 1,
                      selectedHand: null,
                      winner: null,
                      phase: 'playing',
                      turnStartTime: Date.now()
                    });
                  }}
                  className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg font-bold hover:scale-105 transition-transform"
                >
                  <Users className="w-5 h-5 inline mr-2" />
                  友達と対戦
                </button>
                <button
                  onClick={() => {
                    setOpponentType('cpu');
                    setGameMode('local');
                    setGameState({
                      player1: { left: 1, right: 1 },
                      player2: { left: 1, right: 1 },
                      currentPlayer: 1,
                      selectedHand: null,
                      winner: null,
                      phase: 'playing',
                      turnStartTime: Date.now()
                    });
                  }}
                  className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg font-bold hover:scale-105 transition-transform"
                >
                  <Bot className="w-5 h-5 inline mr-2" />
                  CPUと対戦
                </button>
              </div>
            </div>

            <div className="bg-slate-800 rounded-xl p-4">
              <h2 className="font-bold mb-3 flex items-center gap-2">
                <Wifi className="w-5 h-5" />
                オンライン対戦
                {!hasFirebase && <span className="text-xs text-red-400">(Firebase未設定)</span>}
              </h2>
              <div className="space-y-2">
                <button
                  onClick={findRandomMatch}
                  disabled={!hasFirebase}
                  className="w-full py-3 bg-gradient-to-r from-green-600 to-teal-600 rounded-lg font-bold hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Globe className="w-5 h-5 inline mr-2" />
                  ランダムマッチング
                </button>
                <button
                  onClick={createRoom}
                  disabled={!hasFirebase}
                  className="w-full py-3 bg-gradient-to-r from-teal-600 to-cyan-600 rounded-lg font-bold hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Wifi className="w-5 h-5 inline mr-2" />
                  ルームを作成
                </button>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="ルームコード"
                    className="w-full py-3 px-4 bg-slate-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    maxLength={6}
                    disabled={!hasFirebase}
                  />
                  <button
                    onClick={() => joinRoom(roomCode)}
                    disabled={roomCode.length !== 6 || !hasFirebase}
                    className="absolute right-2 top-2 px-3 py-1 bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    参加
                  </button>
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowRules(!showRules)}
            className="w-full mt-6 text-sm text-blue-300 underline"
          >
            {showRules ? 'ルールを隠す' : 'ルールを表示'}
          </button>

          {showRules && (
            <div className="bg-slate-800 rounded-lg p-4 mt-4 text-sm">
              <h3 className="font-bold mb-2">ルール:</h3>
              <ul className="space-y-1 text-gray-300">
                <li>• 最初は両手に1本ずつ指がある</li>
                <li>• 各ターンは30秒の制限時間あり⏱️</li>
                <li>• 自分の手で相手の手を攻撃（自分の手にも攻撃可能）</li>
                <li>• 攻撃された手は指が増える</li>
                <li>• 手の指が5本以上になったら即死亡💀</li>
                <li>• 2本以上あれば分解できる</li>
                <li>• 両手が死んだら負け</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (searching || waiting) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white p-4 flex items-center justify-center">
        <div className="max-w-md w-full text-center">
          <div className="mb-8">
            <div className="w-20 h-20 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <h2 className="text-2xl font-bold mb-2">
              {searching ? '対戦相手を探しています...' : '相手の参加を待っています...'}
            </h2>
            {roomCode && (
              <div className="bg-slate-800 rounded-lg p-3 mt-4 inline-block">
                <p className="text-sm text-gray-400 mb-2">ルームコード</p>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-mono font-bold">{roomCode}</span>
                  <button onClick={copyRoomCode} className="p-2 hover:bg-slate-700 rounded">
                    {copied ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            )}
          </div>
          <button
            onClick={cancelSearch}
            className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-bold"
          >
            キャンセル
          </button>
        </div>
      </div>
    );
  }

  // じゃんけん画面（オンラインモードのみ）
  if (gameMode === 'online' && gameState.phase === 'janken') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white p-4 flex items-center justify-center">
        <div className="max-w-md w-full">
          <div className="text-center mb-6">
            <button
              onClick={leaveRoom}
              className="px-3 py-1 bg-slate-700 rounded-lg text-sm hover:bg-slate-600 mb-4"
            >
              ← 戻る
            </button>
            <h1 className="text-3xl font-bold mb-2">じゃんけん</h1>
            <p className="text-gray-400">先攻後攻を決めましょう</p>
            <div className="bg-slate-800 rounded-lg p-2 mt-4 inline-block">
              <Wifi className="w-4 h-4 inline mr-2 text-green-400" />
              <span className="text-sm font-mono">{roomCode}</span>
            </div>
            {opponentName && (
              <div className="mt-2 flex items-center justify-center gap-2 text-sm">
                <span className="text-gray-300">{opponentName}</span>
              </div>
            )}
          </div>

          {jankenResult ? (
            <div className="text-center">
              <div className="text-6xl mb-6 flex items-center justify-center gap-8">
                <span>{getJankenEmoji(jankenResult.j1)}</span>
                <span className="text-3xl">VS</span>
                <span>{getJankenEmoji(jankenResult.j2)}</span>
              </div>
              <div className="text-2xl font-bold mb-4">
                {jankenResult.winner === 'draw' ? (
                  <span className="text-yellow-400">引き分け! もう一度!</span>
                ) : (
                  <span className="text-green-400">
                    {jankenResult.winner === myPlayer ? 'あなたが先攻!' : `${opponentName}が先攻!`}
                  </span>
                )}
              </div>
            </div>
          ) : jankenChoice ? (
            <div className="text-center">
              <div className="text-6xl mb-4">{getJankenEmoji(jankenChoice)}</div>
              <p className="text-xl text-yellow-400 animate-pulse">
                相手の選択を待っています...
              </p>
            </div>
          ) : (
            <div>
              <p className="text-center mb-4 text-gray-300">選んでください</p>
              <div className="grid grid-cols-3 gap-4">
                <button
                  onClick={() => makeJankenChoice('rock')}
                  className="aspect-square bg-gradient-to-br from-red-600 to-red-800 rounded-2xl text-6xl hover:scale-105 active:scale-95 transition-transform flex items-center justify-center"
                >
                  ✊
                </button>
                <button
                  onClick={() => makeJankenChoice('paper')}
                  className="aspect-square bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl text-6xl hover:scale-105 active:scale-95 transition-transform flex items-center justify-center"
                >
                  ✋
                </button>
                <button
                  onClick={() => makeJankenChoice('scissors')}
                  className="aspect-square bg-gradient-to-br from-green-600 to-green-800 rounded-2xl text-6xl hover:scale-105 active:scale-95 transition-transform flex items-center justify-center"
                >
                  ✌️
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white p-4 flex flex-col">
      <div className="max-w-md mx-auto w-full flex-1 flex flex-col">
        <div className="text-center mb-4">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={leaveRoom}
              className="px-3 py-1 bg-slate-700 rounded-lg text-sm hover:bg-slate-600"
            >
              ← 戻る
            </button>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Swords className="w-6 h-6" />
              戦争
            </h1>
            <div className="w-16"></div>
          </div>

          {gameMode === 'online' && roomCode && (
            <div className="bg-slate-800 rounded-lg p-2 flex items-center justify-center gap-2 mb-2">
              <Wifi className="w-4 h-4 text-green-400" />
              <span className="text-sm font-mono">{roomCode}</span>
              <button onClick={copyRoomCode} className="p-1 hover:bg-slate-700 rounded">
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          )}

          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-lg ${
            timeLeft <= 10 ? 'bg-red-600 animate-pulse' : 'bg-slate-800'
          }`}>
            <Clock className="w-5 h-5" />
            <span>{timeLeft}秒</span>
          </div>
        </div>

        {gameState.winner && (
          <div className="bg-gradient-to-r from-yellow-500 to-orange-500 rounded-lg p-4 mb-4 text-center">
            <div className="text-xl font-bold">
              {gameMode === 'online' ? (
                gameState.winner === myPlayer ? '🎉 あなたの勝利! 🎉' : `😢 ${opponentName}の勝利 😢`
              ) : opponentType === 'cpu' ? (
                gameState.winner === 1 ? '🎉 あなたの勝利! 🎉' : '😢 CPUの勝利 😢'
              ) : (
                `🎉 プレイヤー ${gameState.winner} 勝利! 🎉`
              )}
            </div>
            <button
              onClick={reset}
              className="mt-2 px-6 py-2 bg-white text-purple-900 rounded-lg font-bold hover:bg-gray-100"
            >
              もう一度
            </button>
          </div>
        )}

        <div className="mb-6">
          <div className="flex items-center justify-center gap-2 mb-3">
            {gameMode === 'online' && myPlayer === 2 ? (
              <>
                <Users className="w-4 h-4" />
                <span className="font-bold">あなた</span>
              </>
            ) : (
              <>
                <Users className="w-4 h-4" />
                <span className="font-bold">
                  {gameMode === 'online' && opponentName ? opponentName : opponentType === 'cpu' ? 'CPU' : 'プレイヤー 2'}
                </span>
              </>
            )}
            {((gameMode === 'online' && myPlayer === 2 && gameState.currentPlayer === 2) ||
              (gameMode === 'online' && myPlayer === 1 && gameState.currentPlayer === 2) ||
              (gameMode === 'local' && opponentType === 'human' && gameState.currentPlayer === 2) ||
              (gameMode === 'local' && opponentType === 'cpu' && gameState.currentPlayer === 2)) && !gameState.winner && (
              <span className="px-2 py-0.5 bg-green-500 rounded-full text-xs">
                {gameMode === 'online' && myPlayer === 2 ? 'あなたのターン' : opponentType === 'cpu' ? 'CPUのターン' : 'ターン'}
              </span>
            )}
          </div>
          <div className="flex justify-center gap-6">
            {renderHand(2, 'left', gameState.player2.left)}
            {renderHand(2, 'right', gameState.player2.right)}
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center my-4">
          <div className="text-center">
            <Hand className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <div className="text-xs text-gray-400">
              {gameState.selectedHand ? (
                <span className="text-yellow-400 font-bold">手を選んで攻撃!</span>
              ) : (
                '自分の手を選択'
              )}
            </div>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex justify-center gap-6 mb-3">
            {renderHand(1, 'left', gameState.player1.left)}
            {renderHand(1, 'right', gameState.player1.right)}
          </div>
          <div className="flex items-center justify-center gap-2">
            {gameMode === 'online' && myPlayer === 1 ? (
              <>
                <Users className="w-4 h-4" />
                <span className="font-bold">あなた</span>
              </>
            ) : (
              <>
                <Users className="w-4 h-4" />
                <span className="font-bold">
                  {gameMode === 'online' && myPlayer === 2 ? (opponentName || 'プレイヤー 1') : opponentType === 'cpu' ? 'あなた' : 'プレイヤー 1'}
                </span>
              </>
            )}
            {((gameMode === 'online' && myPlayer === 1 && gameState.currentPlayer === 1) ||
              (gameMode === 'online' && myPlayer === 2 && gameState.currentPlayer === 1) ||
              (gameMode === 'local' && gameState.currentPlayer === 1)) && !gameState.winner && (
              <span className="px-2 py-0.5 bg-green-500 rounded-full text-xs">
                {(gameMode === 'online' && myPlayer === 1) || (gameMode === 'local') ? 'あなたのターン' : 'ターン'}
              </span>
            )}
          </div>
        </div>

        {((gameMode === 'online' && myPlayer && gameState.currentPlayer === myPlayer) ||
          (gameMode === 'local' && opponentType === 'cpu' && gameState.currentPlayer === 1) ||
          (gameMode === 'local' && opponentType === 'human')) && !gameState.winner && (
          <div className="mt-4 space-y-3">
            <div className="p-3 bg-slate-800 rounded-lg">
              <div className="text-xs text-center mb-2 text-gray-300">自分の手に攻撃</div>
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => selfAttack('left')}
                  className="px-3 py-2 bg-red-600 rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
                  disabled={!gameState.selectedHand}
                >
                  左手を攻撃
                </button>
                <button
                  onClick={() => selfAttack('right')}
                  className="px-3 py-2 bg-red-600 rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
                  disabled={!gameState.selectedHand}
                >
                  右手を攻撃
                </button>
              </div>
            </div>
            <div className="p-3 bg-slate-800 rounded-lg">
              <div className="text-xs text-center mb-2 text-gray-300">分解 (2本以上から)</div>
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => transfer('left', 'right')}
                  className="px-3 py-2 bg-blue-600 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                  disabled={
                    (gameMode === 'online' && gameState[`player${myPlayer}`]?.left < 2) ||
                    (gameMode === 'local' && opponentType === 'cpu' && gameState.player1.left < 2) ||
                    (gameMode === 'local' && opponentType === 'human' && gameState[`player${gameState.currentPlayer}`]?.left < 2)
                  }
                >
                  左 → 右
                </button>
                <button
                  onClick={() => transfer('right', 'left')}
                  className="px-3 py-2 bg-blue-600 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                  disabled={
                    (gameMode === 'online' && gameState[`player${myPlayer}`]?.right < 2) ||
                    (gameMode === 'local' && opponentType === 'cpu' && gameState.player1.right < 2) ||
                    (gameMode === 'local' && opponentType === 'human' && gameState[`player${gameState.currentPlayer}`]?.right < 2)
                  }
                >
                  右 → 左
                </button>
              </div>
            </div>
          </div>
        )}

        {gameMode === 'online' && opponentDisconnected && (
          <div className="mt-4 p-3 bg-red-900/50 rounded-lg text-center text-sm">
            <WifiOff className="w-5 h-5 inline mr-2" />
            相手が2回連続でタイムアウトしました（切断）
          </div>
        )}
      </div>
    </div>
  );
}