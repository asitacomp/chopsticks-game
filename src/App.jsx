import React, { useState, useEffect } from 'react';
import { Users, Swords, Hand, Wifi, Copy, Check, Bot, Globe } from 'lucide-react';
import { db } from './firebase';
import { doc, getDoc, setDoc, onSnapshot, collection, query, where, getDocs, deleteDoc, updateDoc } from 'firebase/firestore';

export default function ChopsticksGame() {
  const [gameMode, setGameMode] = useState('menu');
  const [opponentType, setOpponentType] = useState('human'); // human or cpu
  const [gameState, setGameState] = useState({
    player1: { left: 1, right: 1 },
    player2: { left: 1, right: 1 },
    currentPlayer: 1,
    selectedHand: null,
    winner: null,
    phase: 'janken'
  });
  const [roomCode, setRoomCode] = useState('');
  const [myPlayer, setMyPlayer] = useState(null);
  const [showRules, setShowRules] = useState(false);
  const [copied, setCopied] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [jankenChoice, setJankenChoice] = useState(null);
  const [jankenResult, setJankenResult] = useState(null);
  const [searching, setSearching] = useState(false);

  // Firebaseからリアルタイムでゲーム状態を取得
  useEffect(() => {
    if (gameMode === 'online' && roomCode) {
      const gameRef = doc(db, 'games', roomCode);
      const unsubscribe = onSnapshot(gameRef, (docSnap) => {
        if (docSnap.exists()) {
          const state = docSnap.data();
          setGameState(state);
          setWaiting(false);
          setSearching(false);
          
          if (state.phase === 'janken' && state.janken1 && state.janken2) {
            determineJankenWinner(state);
          }
        }
      });
      
      return () => unsubscribe();
    }
  }, [gameMode, roomCode]);

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
    
    // CPUの手で生きている手を取得
    const cpuHands = [];
    if (p2.left > 0 && p2.left < 5) cpuHands.push('left');
    if (p2.right > 0 && p2.right < 5) cpuHands.push('right');
    
    // プレイヤーの手で生きている手を取得
    const targetHands = [];
    if (p1.left > 0 && p1.left < 5) targetHands.push({ player: 1, hand: 'left' });
    if (p1.right > 0 && p1.right < 5) targetHands.push({ player: 1, hand: 'right' });
    
    if (cpuHands.length === 0 || targetHands.length === 0) return;
    
    // ランダムに手を選択
    const attackHand = cpuHands[Math.floor(Math.random() * cpuHands.length)];
    const target = targetHands[Math.floor(Math.random() * targetHands.length)];
    
    // 攻撃実行
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
      currentPlayer: 1
    };
    
    checkWinner(newState);
  };

  const saveGameState = async (state) => {
    try {
      const gameRef = doc(db, 'games', roomCode);
      await setDoc(gameRef, state);
    } catch (error) {
      console.error('Failed to save game state:', error);
    }
  };

  const createRoom = async () => {
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
      janken1: null,
      janken2: null,
      roomType: 'private'
    };
    
    const gameRef = doc(db, 'games', code);
    await setDoc(gameRef, initialState);
    setGameState(initialState);
  };

  const findRandomMatch = async () => {
    setSearching(true);
    
    try {
      // 待機中のゲームを検索
      const gamesRef = collection(db, 'games');
      const q = query(gamesRef, where('roomType', '==', 'random'), where('players', '==', 1));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        // 既存のゲームに参加
        const gameDoc = querySnapshot.docs[0];
        const code = gameDoc.id;
        const state = gameDoc.data();
        
        state.players = 2;
        await updateDoc(doc(db, 'games', code), { players: 2 });
        
        setRoomCode(code);
        setMyPlayer(2);
        setGameMode('online');
        setGameState(state);
        setSearching(false);
      } else {
        // 新しいゲームを作成
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
          janken1: null,
          janken2: null,
          roomType: 'random'
        };
        
        const gameRef = doc(db, 'games', code);
        await setDoc(gameRef, initialState);
        setGameState(initialState);
      }
    } catch (error) {
      console.error('Failed to find match:', error);
      setSearching(false);
      alert('マッチングに失敗しました');
    }
  };

  const cancelSearch = async () => {
    if (roomCode && myPlayer === 1) {
      try {
        await deleteDoc(doc(db, 'games', roomCode));
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
    try {
      const gameRef = doc(db, 'games', code);
      const docSnap = await getDoc(gameRef);
      
      if (docSnap.exists()) {
        const state = docSnap.data();
        state.players = 2;
        await setDoc(gameRef, state);
        
        setRoomCode(code);
        setMyPlayer(2);
        setGameMode('online');
        setGameState(state);
      } else {
        alert('ルームが見つかりません');
      }
    } catch (error) {
      alert('ルームが見つかりません');
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
          currentPlayer: winner
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

  const selectHand = (player, hand) => {
    if (gameState.winner || gameState.phase !== 'playing') return;
    
    if (gameMode === 'online' && player !== myPlayer) return;
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
    
    if (gameMode === 'online' && parseInt(attackPlayer) !== myPlayer) return;
    if (gameMode === 'local' && opponentType === 'human' && parseInt(attackPlayer) !== gameState.currentPlayer) return;
    if (gameMode === 'local' && opponentType === 'cpu' && parseInt(attackPlayer) !== 1) return;

    const attackFingers = gameState[`player${attackPlayer}`][attackHand];
    const targetFingers = gameState[`player${targetPlayer}`][targetHand];
    
    if (attackFingers === 0 || attackFingers >= 5 || targetFingers === 0 || targetFingers >= 5) return;
    
    // 同じ手への攻撃は不可
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
      currentPlayer: gameState.currentPlayer === 1 ? 2 : 1
    };

    checkWinner(newState);
  };

  const transfer = (fromHand, toHand) => {
    if (gameState.winner || gameState.phase !== 'playing') return;
    
    let currentPlayerId;
    if (gameMode === 'online') {
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
      currentPlayer: gameState.currentPlayer === 1 ? 2 : 1
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
      janken1: null,
      janken2: null,
      roomType: gameState.roomType
    };
    setGameState(newState);
    setJankenChoice(null);
    setJankenResult(null);
    if (gameMode === 'online') saveGameState(newState);
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const leaveRoom = async () => {
    if (gameMode === 'online' && roomCode) {
      try {
        // ゲームを削除
        await deleteDoc(doc(db, 'games', roomCode));
      } catch (error) {
        console.error('Failed to delete game:', error);
      }
    }
    setGameMode('menu');
    setRoomCode('');
    setMyPlayer(null);
    setWaiting(false);
    setJankenChoice(null);
    setJankenResult(null);
    setSearching(false);
  };

  const renderHand = (player, hand, fingers) => {
    const isSelected = gameState.selectedHand === `${player}-${hand}`;
    const isDead = fingers === 0 || fingers >= 5;
    
    let isMyTurn = false;
    if (gameMode === 'online') {
      isMyTurn = player === myPlayer;
    } else if (opponentType === 'cpu') {
      isMyTurn = player === 1;
    } else {
      isMyTurn = player === gameState.currentPlayer;
    }

    return (
      <button
        onClick={() => {
          if (isMyTurn && !isDead) {
            selectHand(player, hand);
          } else if (gameState.selectedHand && !isDead) {
            attack(player, hand);
          }
        }}
        className={`
          relative w-24 h-32 rounded-2xl font-bold text-2xl transition-all
          ${isDead ? 'bg-gray-800 text-gray-600' : 'bg-gradient-to-br from-blue-500 to-purple-600 text-white'}
          ${isSelected ? 'ring-4 ring-yellow-400 scale-110' : ''}
          ${isMyTurn && !isDead ? 'hover:scale-105 active:scale-95' : ''}
          ${!isDead && gameState.selectedHand ? 'hover:ring-2 hover:ring-red-400' : ''}
        `}
        disabled={gameState.winner !== null || gameState.phase !== 'playing'}
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

  const getJankenEmoji = (choice) => {
    if (choice === 'rock') return '✊';
    if (choice === 'paper') return '✋';
    if (choice === 'scissors') return '✌️';
    return '?';
  };

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
                      phase: 'playing'
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
                      phase: 'playing'
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
              </h2>
              <div className="space-y-2">
                <button
                  onClick={findRandomMatch}
                  className="w-full py-3 bg-gradient-to-r from-green-600 to-teal-600 rounded-lg font-bold hover:scale-105 transition-transform"
                >
                  <Globe className="w-5 h-5 inline mr-2" />
                  ランダムマッチング
                </button>
                <button
                  onClick={createRoom}
                  className="w-full py-3 bg-gradient-to-r from-teal-600 to-cyan-600 rounded-lg font-bold hover:scale-105 transition-transform"
                >
                  <Wifi className="w-5 h-5 inline mr-2" />
                  ルームを作成
                </button>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="ルームコード"
                    className="w-full py-3 px-4 bg-slate-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    maxLength={6}
                  />
                  <button
                    onClick={() => joinRoom(roomCode)}
                    disabled={roomCode.length !== 6}
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
                <li>• オンライン対戦はじゃんけんで先攻後攻を決定</li>
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
          </div>

          {jankenResult ? (
            <div className="text-center">
              <div className="text-6xl mb-6 space-x-8">
                <span>{getJankenEmoji(jankenResult.j1)}</span>
                <span className="text-3xl">VS</span>
                <span>{getJankenEmoji(jankenResult.j2)}</span>
              </div>
              <div className="text-2xl font-bold mb-4">
                {jankenResult.winner === 'draw' ? (
                  <span className="text-yellow-400">引き分け! もう一度!</span>
                ) : (
                  <span className="text-green-400">
                    プレイヤー {jankenResult.winner} が先攻!
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
            <div className="grid grid-cols-3 gap-4">
              <button
                onClick={() => makeJankenChoice('rock')}
                className="aspect-square bg-gradient-to-br from-red-600 to-red-800 rounded-2xl text-6xl hover:scale-105 active:scale-95 transition-transform"
              >
                ✊
              </button>
              <button
                onClick={() => makeJankenChoice('paper')}
                className="aspect-square bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl text-6xl hover:scale-105 active:scale-95 transition-transform"
              >
                ✋
              </button>
              <button
                onClick={() => makeJankenChoice('scissors')}
                className="aspect-square bg-gradient-to-br from-green-600 to-green-800 rounded-2xl text-6xl hover:scale-105 active:scale-95 transition-transform"
              >
                ✌️
              </button>
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

          {gameMode === 'online' && (
            <div className="bg-slate-800 rounded-lg p-2 flex items-center justify-center gap-2">
              <Wifi className="w-4 h-4 text-green-400" />
              <span className="text-sm font-mono">{roomCode}</span>
              <button
                onClick={copyRoomCode}
                className="p-1 hover:bg-slate-700 rounded"
              >
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          )}
        </div>

        {gameState.winner && (
          <div className="bg-gradient-to-r from-yellow-500 to-orange-500 rounded-lg p-4 mb-4 text-center">
            <div className="text-xl font-bold">
              {opponentType === 'cpu' ? (
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
            {opponentType === 'cpu' ? <Bot className="w-4 h-4" /> : <Users className="w-4 h-4" />}
            <span className="font-bold">{opponentType === 'cpu' ? 'CPU' : 'プレイヤー 2'}</span>
            {((gameMode === 'online' && myPlayer === 2 && gameState.currentPlayer === 2) || 
              (gameMode === 'local' && opponentType === 'human' && gameState.currentPlayer === 2) ||
              (gameMode === 'local' && opponentType === 'cpu' && gameState.currentPlayer === 2)) && !gameState.winner && (
              <span className="px-2 py-0.5 bg-green-500 rounded-full text-xs">
                {opponentType === 'cpu' ? 'CPUのターン' : 'ターン'}
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
            <Users className="w-4 h-4" />
            <span className="font-bold">{opponentType === 'cpu' ? 'あなた' : 'プレイヤー 1'}</span>
            {((gameMode === 'online' && myPlayer === 1 && gameState.currentPlayer === 1) || 
              (gameMode === 'local' && gameState.currentPlayer === 1)) && !gameState.winner && (
              <span className="px-2 py-0.5 bg-green-500 rounded-full text-xs">あなたのターン</span>
            )}
          </div>
        </div>

        {((gameMode === 'online' && myPlayer && gameState.currentPlayer === myPlayer) || 
          (gameMode === 'local' && opponentType === 'cpu' && gameState.currentPlayer === 1) ||
          (gameMode === 'local' && opponentType === 'human')) && !gameState.winner && (
          <div className="mt-4 p-3 bg-slate-800 rounded-lg">
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
        )}
      </div>
    </div>
  );
}