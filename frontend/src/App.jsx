import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { io } from "socket.io-client";
import { ChatLayer } from './components/ChatLayer';

// 🎯 修正済みゲーム定数 - 2000x2000対応
const GAME_CONSTANTS = {
  MASS_TO_RADIUS: (mass) => Math.sqrt(mass / Math.PI) * 1.2,
  SPEED_FORMULA: (mass) => {
    const baseSpeed = 100 / Math.pow(mass, 0.4);
    return Math.max(baseSpeed, 8);
  },

  TARGET_FPS: 60,
  FRAME_TIME: 1000 / 60,
  SPLIT_MIN_MASS: 35,
  EJECT_MIN_MASS: 38,

  // 🎯 射出距離制限の定数
  EJECT_DISTANCE: {
    BASE_DISTANCE: 60,
    MAX_DISTANCE: 90,
    MIN_DISTANCE: 40,
    VELOCITY_DECAY: 0.75
  }
};

const getServerURL = () => {
  // ✅ Vercel本番はここが最優先（ViteはVITE_ が必要）
  const envUrl = import.meta.env.VITE_SOCKET_URL;
  if (envUrl) return envUrl;

  // ローカル開発
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return "http://localhost:8080";
  }

  // （必要なら残す：同一LAN等での直叩き用）
  return `http://${hostname}:8080`;
};


// 🎯 UIToggleButton
const UIToggleButton = ({ showUI, onToggle }) => {
  return (
    <div
      onClick={onToggle}
      style={{
        position: "absolute",
        top: "20px",
        left: "20px",
        width: "50px",
        height: "50px",
        backgroundColor: showUI ? "rgba(33, 150, 243, 0.9)" : "rgba(96, 125, 139, 0.9)",
        color: "white",
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        fontSize: "20px",
        fontWeight: "bold",
        boxShadow: "0 6px 20px rgba(0, 0, 0, 0.3)",
        transition: "all 0.3s ease",
        userSelect: "none",
        zIndex: 2000
      }}
      onMouseEnter={(e) => {
        e.target.style.backgroundColor = showUI ? "rgba(33, 150, 243, 1)" : "rgba(96, 125, 139, 1)";
        e.target.style.transform = "scale(1.05)";
      }}
      onMouseLeave={(e) => {
        e.target.style.backgroundColor = showUI ? "rgba(33, 150, 243, 0.9)" : "rgba(96, 125, 139, 0.9)";
        e.target.style.transform = "scale(1)";
      }}
      title={showUI ? "UIを非表示 (H)" : "UIを表示 (H)"}
    >
      {showUI ? "👁️" : "👁️‍🗨️"}
    </div>
  );
};

const ShopUI = ({ showShop, onClose, onBuyGun, currentMass, hasGun }) => {
  if (!showShop) return null;

  const gunPrice = 100;
  const canAfford = currentMass >= gunPrice;
  const alreadyHasGun = hasGun;

  return (
    <div style={{
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      backgroundColor: "rgba(20, 20, 30, 0.98)",
      border: "3px solid #FFD700",
      borderRadius: "20px",
      padding: "30px",
      minWidth: "400px",
      boxShadow: "0 10px 50px rgba(255, 215, 0, 0.4)",
      zIndex: 3000,
      color: "white",
      fontFamily: "Arial, sans-serif"
    }}>
      {/* ヘッダー */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "20px",
        borderBottom: "2px solid #FFD700",
        paddingBottom: "10px"
      }}>
        <h2 style={{
          margin: 0,
          fontSize: "28px",
          color: "#FFD700",
          textShadow: "0 0 10px rgba(255, 215, 0, 0.5)"
        }}>
          🛍️ ショップ
        </h2>
        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "2px solid #FF4444",
            color: "#FF4444",
            fontSize: "20px",
            cursor: "pointer",
            borderRadius: "50%",
            width: "35px",
            height: "35px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s"
          }}
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = "#FF4444";
            e.target.style.color = "white";
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = "transparent";
            e.target.style.color = "#FF4444";
          }}
        >
          ✕
        </button>
      </div>

      {/* 現在の質量表示 */}
      <div style={{
        backgroundColor: "rgba(33, 150, 243, 0.2)",
        padding: "15px",
        borderRadius: "10px",
        marginBottom: "20px",
        border: "2px solid rgba(33, 150, 243, 0.5)"
      }}>
        <div style={{ fontSize: "14px", color: "#AAA", marginBottom: "5px" }}>
          あなたの質量
        </div>
        <div style={{ fontSize: "32px", fontWeight: "bold", color: "#2196F3" }}>
          {Math.floor(currentMass)}
        </div>
      </div>

      {/* 商品リスト */}
      <div style={{
        backgroundColor: "rgba(255, 215, 0, 0.1)",
        padding: "20px",
        borderRadius: "15px",
        border: "2px solid rgba(255, 215, 0, 0.3)"
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "15px",
          marginBottom: "15px"
        }}>
          <div style={{ fontSize: "48px" }}>🔫</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "20px", fontWeight: "bold", color: "#FFD700" }}>
              銃
            </div>
            <div style={{ fontSize: "14px", color: "#AAA", marginTop: "5px" }}>
              • 弾数: 10発<br />
              • 持続時間: 30秒<br />
              • ダメージ: 100質量
            </div>
          </div>
          <div style={{
            fontSize: "24px",
            fontWeight: "bold",
            color: canAfford ? "#4CAF50" : "#FF4444"
          }}>
            {gunPrice}
          </div>
        </div>

        {/* 購入ボタン */}
        <button
          onClick={onBuyGun}
          disabled={!canAfford || alreadyHasGun}
          style={{
            width: "100%",
            padding: "15px",
            fontSize: "18px",
            fontWeight: "bold",
            border: "none",
            borderRadius: "10px",
            cursor: (canAfford && !alreadyHasGun) ? "pointer" : "not-allowed",
            backgroundColor: (canAfford && !alreadyHasGun) ? "#4CAF50" : "#555",
            color: "white",
            transition: "all 0.2s",
            boxShadow: (canAfford && !alreadyHasGun) ? "0 4px 15px rgba(76, 175, 80, 0.4)" : "none"
          }}
          onMouseEnter={(e) => {
            if (canAfford && !alreadyHasGun) {
              e.target.style.backgroundColor = "#45a049";
              e.target.style.transform = "scale(1.02)";
            }
          }}
          onMouseLeave={(e) => {
            if (canAfford && !alreadyHasGun) {
              e.target.style.backgroundColor = "#4CAF50";
              e.target.style.transform = "scale(1)";
            }
          }}
        >
          {alreadyHasGun ? "🔫 既に装備中" :
            canAfford ? "💰 購入する" : "❌ 質量が足りません"}
        </button>
      </div>

      {/* 操作説明 */}
      <div style={{
        marginTop: "20px",
        padding: "15px",
        backgroundColor: "rgba(96, 125, 139, 0.2)",
        borderRadius: "10px",
        fontSize: "14px",
        color: "#AAA",
        border: "1px solid rgba(96, 125, 139, 0.3)"
      }}>
        <div style={{ fontWeight: "bold", marginBottom: "8px", color: "#FFF" }}>
          📌 操作方法
        </div>
        <div>• <kbd style={kbdStyle}>B</kbd> キー: ショップを開閉</div>
        <div>• <kbd style={kbdStyle}>ESC</kbd> キー: ショップを閉じる</div>
      </div>
    </div>
  );
};

const kbdStyle = {
  backgroundColor: "rgba(255, 255, 255, 0.1)",
  padding: "2px 6px",
  borderRadius: "4px",
  border: "1px solid rgba(255, 255, 255, 0.3)",
  fontFamily: "monospace",
  fontSize: "12px"
};

const ShopMessage = ({ message, type }) => {
  if (!message) return null;

  return (
    <div style={{
      position: "fixed",
      top: "100px",
      left: "50%",
      transform: "translateX(-50%)",
      backgroundColor: type === "success" ? "rgba(76, 175, 80, 0.95)" : "rgba(244, 67, 54, 0.95)",
      color: "white",
      padding: "15px 30px",
      borderRadius: "10px",
      fontSize: "16px",
      fontWeight: "bold",
      boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
      zIndex: 4000,
      animation: "slideDown 0.3s ease-out"
    }}>
      {type === "success" ? "✅" : "❌"} {message}
    </div>
  );
};

// ============================================
// 4. Socket.ioイベントハンドラーに追加
// ============================================


// ============================================
// 5. キーボードイベントハンドラーに追加
// ============================================

// useEffect内のhandleKeyDownに以下を追加（'KeyH'の処理の後に）:

function App() {
  // === Socket管理 ===
  const socketRef = useRef(null);
  const SOCKET_URL = getServerURL();

  // === Canvas refs ===
  const canvasRef = useRef(null);
  const minimapCanvasRef = useRef(null);

  // === ゲーム状態 ===
  const [players, setPlayers] = useState({});
  const [foods, setFoods] = useState([]);
  const [viruses, setViruses] = useState([]);
  const [ejectedMasses, setEjectedMasses] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [myId, setMyId] = useState(null);
  const [playerName, setPlayerName] = useState("");
  const [gameStarted, setGameStarted] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const [worldSize, setWorldSize] = useState({ width: 2000, height: 2000 });
  const [gameOver, setGameOver] = useState(false);
  const [deathInfo, setDeathInfo] = useState(null);
  const [isAlive, setIsAlive] = useState(true);

  // 🔫 銃アイテム関連の state
  const [gunItems, setGunItems] = useState([]);
  const [bullets, setBullets] = useState([]);
  const [hasGun, setHasGun] = useState(false);
  const [gunBullets, setGunBullets] = useState(0);
  const [gunTimeLeft, setGunTimeLeft] = useState(0);
  const [showShop, setShowShop] = useState(false);
  const [shopMessage, setShopMessage] = useState("");
  const [shopMessageType, setShopMessageType] = useState("");

  // === パフォーマンス監視 ===
  const [debugInfo, setDebugInfo] = useState({
    fps: 0,
    ping: 0,
    players: 0,
    memoryUsage: 0,
    renderTime: 0,
    socketConnected: false,
    gameInitialized: false,
    objectsCount: 0
  });

  // 🎯 チャット関連のstate
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatError, setChatError] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  // 🎯 UI表示state
  const [showUI, setShowUI] = useState(() => {
    const saved = localStorage.getItem('agar-show-ui');
    return saved !== null ? JSON.parse(saved) : true;
  });

  // === Real-time refs ===
  const playersRef = useRef({});
  const foodsRef = useRef([]);
  const virusesRef = useRef([]);
  const ejectedMassesRef = useRef([]);
  const leaderboardRef = useRef([]);
  const myIdRef = useRef(null);

  // 🔫 銃アイテム関連の refs
  const gunItemsRef = useRef([]);
  const bulletsRef = useRef([]);
  const hasGunRef = useRef(false);
  const gunBulletsRef = useRef(0);

  // === アニメーション状態 ===
  const animationState = useRef({
    camera: {
      targetX: 0,
      targetY: 0,
      targetScale: 1,
      velocityX: 0,
      velocityY: 0,
      scaleVelocity: 0,
      smoothing: 0.08
    },
    cells: new Map(),
    effects: [],
    particles: [],
    lastTime: 0,
    deltaTime: 0
  });

  // === レンダリング最適化 ===
  const animationFrameRef = useRef();
  const lastRenderTime = useRef(0);
  const fpsCounter = useRef({ frames: 0, lastTime: 0, renderTimes: [] });

  // === カメラとUI ===
  const cameraRef = useRef({ x: 0, y: 0, scale: 1 });

  // === マウス管理 ===
  const mouseRef = useRef({
    screenX: 0,
    screenY: 0,
    worldX: 0,
    worldY: 0,
    isActive: false
  });

  const keysRef = useRef({
    space: false, w: false, f: false,
    up: false, down: false, left: false, right: false
  });

  const ejectState = useRef({
    lastEjectTime: 0,
    ejectCount: 0
  });

  const chatInputRef = useRef(null);
  const chatMessagesRef = useRef(null);
  const chatMessagesStateRef = useRef([]);
  const isTypingRef = useRef(false);

  // 🎯 isTypingRefをstateと同期
  useEffect(() => {
    isTypingRef.current = isTyping;
  }, [isTyping]);

  // 🎯 改善された射出距離計算関数
  const calculateEjectDistance = useCallback((cellMass, targetDistance) => {
    const cellRadius = GAME_CONSTANTS.MASS_TO_RADIUS(cellMass);
    const minDist = cellRadius * 2;
    const maxDist = cellRadius * 4;

    let baseDistance = Math.min(
      GAME_CONSTANTS.EJECT_DISTANCE.BASE_DISTANCE,
      maxDist
    );

    if (cellMass > 100) {
      baseDistance = Math.min(baseDistance * 1.2, maxDist);
    }

    return Math.max(minDist, Math.min(baseDistance, maxDist));
  }, []);

  // 単発射出関数
  const performSingleEject = useCallback(() => {
    const now = Date.now();

    if (now - ejectState.current.lastEjectTime < 200) {
      return;
    }

    const mousePos = mouseRef.current;
    const myPlayer = playersRef.current[myIdRef.current];

    if (!myPlayer?.cells?.[0] || !mousePos.isActive) {
      console.log('❌ Cannot eject: no player or inactive mouse');
      return;
    }

    const ejectableCells = myPlayer.cells.filter(cell =>
      cell.mass >= GAME_CONSTANTS.EJECT_MIN_MASS
    );

    if (ejectableCells.length === 0) {
      console.log('❌ Cannot eject: insufficient mass (need 38+)');
      return;
    }

    const mainCell = ejectableCells[0];
    const targetDistance = calculateEjectDistance(mainCell.mass);

    const dx = mousePos.worldX - mainCell.x;
    const dy = mousePos.worldY - mainCell.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    let targetX, targetY;
    if (distance > 0) {
      const normalizedX = dx / distance;
      const normalizedY = dy / distance;
      targetX = mainCell.x + normalizedX * targetDistance;
      targetY = mainCell.y + normalizedY * targetDistance;
    } else {
      const randomAngle = Math.random() * Math.PI * 2;
      targetX = mainCell.x + Math.cos(randomAngle) * targetDistance;
      targetY = mainCell.y + Math.sin(randomAngle) * targetDistance;
    }

    const ejectData = {
      mouseX: targetX,
      mouseY: targetY,
      timestamp: now,
      playerId: myIdRef.current,
      maxDistance: targetDistance,
      cellMass: mainCell.mass
    };

    socketRef.current?.emit("eject", ejectData);

    ejectState.current.lastEjectTime = now;
    ejectState.current.ejectCount++;

    console.log(`🎯 Short-range eject executed (mass: ${mainCell.mass}, distance: ${targetDistance.toFixed(1)})`);

  }, [calculateEjectDistance]);

  // 🔫 銃の発射関数
  const shootGun = useCallback(() => {
    if (!hasGunRef.current || gunBulletsRef.current <= 0) {
      console.log('❌ Cannot shoot: no gun or no bullets');
      return;
    }

    const mousePos = mouseRef.current;
    const myPlayer = playersRef.current[myIdRef.current];

    if (!myPlayer?.cells?.[0] || !mousePos.isActive) {
      console.log('❌ Cannot shoot: no player or inactive mouse');
      return;
    }

    socketRef.current?.emit("shoot_gun", {
      mouseX: mousePos.worldX,
      mouseY: mousePos.worldY,
      timestamp: Date.now()
    });

    console.log(`🔫 Gun shot! (${gunBulletsRef.current} bullets left)`);
  }, []);

  // === 画面サイズとDPR対応 ===
  const [canvasSize, setCanvasSize] = useState(() => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: dpr
    };
  });

  // === Ping測定 ===
  const pingTracker = useRef({ start: 0, samples: [], avgPing: 0 });

  // UI状態の保存
  useEffect(() => {
    localStorage.setItem('agar-show-ui', JSON.stringify(showUI));
  }, [showUI]);

  // === Refs同期 ===
  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { foodsRef.current = foods; }, [foods]);
  useEffect(() => { virusesRef.current = viruses; }, [viruses]);
  useEffect(() => { ejectedMassesRef.current = ejectedMasses; }, [ejectedMasses]);
  useEffect(() => { leaderboardRef.current = leaderboard; }, [leaderboard]);
  useEffect(() => { myIdRef.current = myId; }, [myId]);
  useEffect(() => { gunItemsRef.current = gunItems; }, [gunItems]);
  useEffect(() => { bulletsRef.current = bullets; }, [bullets]);
  useEffect(() => { hasGunRef.current = hasGun; }, [hasGun]);
  useEffect(() => { gunBulletsRef.current = gunBullets; }, [gunBullets]);
  useEffect(() => { chatMessagesStateRef.current = chatMessages; }, [chatMessages]);

  // === ウィンドウリサイズ最適化 ===
  useEffect(() => {
    let resizeTimeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        setCanvasSize({
          width: window.innerWidth,
          height: window.innerHeight,
          dpr: dpr
        });
      }, 100);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimeout);
    };
  }, []);

  // === Socket接続 ===
  useEffect(() => {
    if (socketRef.current) return;

    console.log("🔌 Connecting to enhanced server:", SOCKET_URL);

    socketRef.current = io(SOCKET_URL, {
      transports: ["polling", "websocket"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 15,
      timeout: 20000,
      forceNew: true,
      withCredentials: false,
      autoConnect: true,
      extraHeaders: {
        "Access-Control-Allow-Origin": "*"
      }
    });

    const pingInterval = setInterval(() => {
      if (socketRef.current?.connected) {
        pingTracker.current.start = Date.now();
        socketRef.current.emit("ping", Date.now());
      }
    }, 2000);

    return () => {
      clearInterval(pingInterval);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [SOCKET_URL]);

  // UI切り替え関数
  const toggleUI = useCallback(() => {
    setShowUI(prev => !prev);
  }, []);

  // === セルアニメーション作成 ===
  const createCellAnimation = useCallback((cell) => ({
    x: cell.x,
    y: cell.y,
    targetX: cell.x,
    targetY: cell.y,
    velocityX: 0,
    velocityY: 0,
    radius: cell.radius,
    targetRadius: cell.radius,
    radiusVelocity: 0,
    rotation: 0,
    rotationSpeed: (Math.random() - 0.5) * 0.002,
    breathPhase: Math.random() * Math.PI * 2,
    pulsePhase: 0,
    pulseIntensity: 0,
    glowIntensity: 0,
    growthEffect: 0,
    lastMass: cell.mass || 0,
    splitAnimationPhase: cell.splitAnimationPhase || 0,
    splitStartX: cell.splitStartX || cell.x,
    splitStartY: cell.splitStartY || cell.y,
    splitTargetX: cell.splitTargetX || cell.x,
    splitTargetY: cell.splitTargetY || cell.y,
    splitTrail: [],
  }), []);

  // 🎯 プレイヤー死亡ハンドラー
  const handlePlayerDeath = useCallback((data) => {
    console.log('💀 Player death:', data);

    setDeathInfo({
      killedBy: data.killedBy || 'Unknown',
      finalMass: data.finalMass || 0,
      finalScore: data.finalScore || 0
    });

    setGameOver(true);
    setGameStarted(false);
    setIsAlive(false);
  }, []);

  // === Socket イベント処理 ===
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const handleConnect = () => {
      console.log("✅ Enhanced socket connected");
      setConnectionStatus("connected");
      setDebugInfo(prev => ({ ...prev, socketConnected: true }));
    };

    const handleDisconnect = (reason) => {
      console.log("❌ Socket disconnected:", reason);
      setConnectionStatus("disconnected");
      setGameStarted(false);
      setDebugInfo(prev => ({
        ...prev,
        socketConnected: false,
        gameInitialized: false
      }));
    };

    const handleGameInit = (data) => {
      console.log("🎮 Enhanced game initialized:", data);

      setPlayers(data.players || {});
      setFoods(data.foods || []);
      setViruses(data.viruses || []);
      setEjectedMasses(data.ejectedMasses || []);
      setLeaderboard(data.leaderboard || []);
      setMyId(data.myId);

      // 🔫 銃アイテムと弾の初期化
      if (data.gunItems) setGunItems(data.gunItems);
      if (data.bullets) setBullets(data.bullets);

      // 自分の銃の状態を初期化
      const myPlayer = data.players?.[data.myId];
      if (myPlayer) {
        setHasGun(myPlayer.hasGun || false);
        setGunBullets(myPlayer.gunBullets || 0);
        setGunTimeLeft(myPlayer.gunTimeLeft || 0);
      }

      if (data.chatMessages) {
        setChatMessages(data.chatMessages);
      }

      if (data.worldSize) setWorldSize(data.worldSize);

      setDebugInfo(prev => ({
        ...prev,
        gameInitialized: true,
        objectsCount: (data.foods?.length || 0) + (data.viruses?.length || 0) + (data.ejectedMasses?.length || 0)
      }));

      const myPlayerData = data.players?.[data.myId];
      if (myPlayerData?.cells?.[0]) {
        const cell = myPlayerData.cells[0];
        cameraRef.current.x = cell.x;
        cameraRef.current.y = cell.y;
        cameraRef.current.scale = Math.max(0.5, Math.min(2.0, 600 / Math.max(cell.radius * 2, 40)));
      }
    };

    const handleGameUpdate = (data) => {
      if (data.players) setPlayers(prev => ({ ...prev, ...data.players }));
      if (data.foods) setFoods(data.foods);
      if (data.viruses) setViruses(data.viruses);
      if (data.ejectedMasses) setEjectedMasses(data.ejectedMasses);
      if (data.leaderboard) setLeaderboard(data.leaderboard);

      // 🔫 銃アイテムと弾の更新
      if (data.gunItems) setGunItems(data.gunItems);
      if (data.bullets) setBullets(data.bullets);

      // 自分の銃の状態を更新
      const myPlayer = data.players?.[myIdRef.current];
      if (myPlayer) {
        setHasGun(myPlayer.hasGun || false);
        setGunBullets(myPlayer.gunBullets || 0);
        setGunTimeLeft(myPlayer.gunTimeLeft || 0);
      }

      if (data.chatMessages && data.chatMessages.length > chatMessagesStateRef.current.length) {
        setChatMessages(data.chatMessages);
      }

      setDebugInfo(prev => ({
        ...prev,
        players: Object.keys(data.players || {}).length || prev.players,
        objectsCount: (data.foods?.length || 0) + (data.viruses?.length || 0) + (data.ejectedMasses?.length || 0)
      }));
    };

    const handlePlayerJoined = (data) => {
      setPlayers(prev => ({ ...prev, [data.playerId]: data.player }));
    };

    const handlePlayerLeft = (data) => {
      setPlayers(prev => {
        const { [data.playerId]: removed, ...rest } = prev;
        return rest;
      });
    };

    const handlePlayerEaten = (data) => {
      setPlayers(prev => {
        const { [data.preyId]: removed, ...rest } = prev;
        return rest;
      });
      triggerEatEffect(data.predatorId);
    };

    const handlePong = (timestamp) => {
      const ping = Date.now() - pingTracker.current.start;
      pingTracker.current.samples.push(ping);

      if (pingTracker.current.samples.length > 10) {
        pingTracker.current.samples.shift();
      }

      const avgPing = Math.round(
        pingTracker.current.samples.reduce((a, b) => a + b, 0) /
        pingTracker.current.samples.length
      );

      setDebugInfo(prev => ({ ...prev, ping: avgPing }));
    };

    const handleVirusRiskReward = (data) => {
      console.log(`🦠⚡ Virus Risk & Reward:`, data);

      if (data.playerId === myIdRef.current) {
        triggerVirusRiskRewardEffect(data);
      }
    };

    const handleChatMessage = (message) => {
      setChatMessages(prev => {
        const newMessages = [...prev, message];
        return newMessages.slice(-50);
      });

      setTimeout(() => {
        if (chatMessagesRef.current) {
          chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
        }
      }, 100);
    };

    const handleChatError = (error) => {
      setChatError(error.message || "チャットエラー");
      setTimeout(() => setChatError(""), 3000);
    };

    // 🔫 銃アイテム取得
    const handleGunAcquired = (data) => {
      console.log('🔫 Gun acquired!', data);
      setHasGun(true);
      setGunBullets(data.bullets);
      setGunTimeLeft(data.duration);
    };

    // 🔫 銃の期限切れ
    const handleGunExpired = () => {
      console.log('🔫 Gun expired');
      setHasGun(false);
      setGunBullets(0);
      setGunTimeLeft(0);
    };

    // 🔫 発射成功
    const handleGunShotSuccess = (data) => {
      setGunBullets(data.bulletsLeft);
    };

    // 🔫 弾が当たった
    const handleBulletHit = (data) => {
      console.log('💥 Bullet hit!', data);
    };

    // 🔫 銃アイテム収集通知
    const handleGunItemCollected = (data) => {
      console.log(`🔫 ${data.playerName} collected gun item!`);
    };

    // 🛍️ ショップ関連のハンドラー（👈 ここに追加）
    const handleBuyGunResult = (result) => {
      if (result.success) {
        setShopMessage(result.message);
        setShopMessageType("success");
        setShowShop(false);
      } else {
        setShopMessage(result.message);
        setShopMessageType("error");
      }
      setTimeout(() => {
        setShopMessage("");
        setShopMessageType("");
      }, 3000);
    };

    const handlePlayerBoughtGun = (data) => {
      console.log(`🛍️ ${data.playerName} bought a gun from shop!`);
    };


    socket.on("virus_risk_reward", handleVirusRiskReward);
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("game_init", handleGameInit);
    socket.on("game_update", handleGameUpdate);
    socket.on("player_joined", handlePlayerJoined);
    socket.on("player_left", handlePlayerLeft);
    socket.on("player_eaten", handlePlayerEaten);
    socket.on("pong", handlePong);
    socket.on("chat_message", handleChatMessage);
    socket.on("chat_error", handleChatError);
    socket.on("player_death", handlePlayerDeath);
    socket.on("gun_acquired", handleGunAcquired);
    socket.on("gun_expired", handleGunExpired);
    socket.on("gun_shot_success", handleGunShotSuccess);
    socket.on("bullet_hit", handleBulletHit);
    socket.on("gun_item_collected", handleGunItemCollected);
    socket.on("buy_gun_result", handleBuyGunResult);        // 👈 追加
    socket.on("player_bought_gun", handlePlayerBoughtGun);  // 👈 追加

    return () => {
      socket.off("virus_risk_reward");
      socket.off("connect");
      socket.off("disconnect");
      socket.off("game_init");
      socket.off("game_update");
      socket.off("player_joined");
      socket.off("player_left");
      socket.off("player_eaten");
      socket.off("pong");
      socket.off("chat_message");
      socket.off("chat_error");
      socket.off("player_death");
      socket.off("gun_acquired");
      socket.off("gun_expired");
      socket.off("gun_shot_success");
      socket.off("bullet_hit");
      socket.off("gun_item_collected");
      socket.off("buy_gun_result");        // 👈 追加
      socket.off("player_bought_gun");     // 👈 追加
    };

  }, [handlePlayerDeath]);

  // === 🎯 updateMousePosition を useCallback として定義 ===
  const updateMousePosition = useCallback((clientX, clientY) => {
    const camera = cameraRef.current;
    const centerX = canvasSize.width / 2;
    const centerY = canvasSize.height / 2;

    const worldX = camera.x + (clientX - centerX) / camera.scale;
    const worldY = camera.y + (clientY - centerY) / camera.scale;

    mouseRef.current = {
      screenX: clientX,
      screenY: clientY,
      worldX: worldX,
      worldY: worldY,
      isActive: true
    };
  }, [canvasSize]);

  // === 🎯 マウス処理の useEffect（統合版） ===
  useEffect(() => {
    const handleMouseMove = (e) => {
      updateMousePosition(e.clientX, e.clientY);
    };

    const handleMouseClick = (e) => {
      updateMousePosition(e.clientX, e.clientY);

      if (isTypingRef.current) {
        return;
      }

      // 🔫 左クリックで銃を発射
      if (e.button === 0 && hasGunRef.current) {
        e.preventDefault();
        shootGun();
      }
    };

    if (gameStarted) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("click", handleMouseClick);

      const centerX = canvasSize.width / 2;
      const centerY = canvasSize.height / 2;
      updateMousePosition(centerX, centerY);

      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("click", handleMouseClick);
      };
    }
  }, [gameStarted, updateMousePosition, shootGun, canvasSize]);

  // チャット送信関数
  const sendChatMessage = useCallback((message) => {
    if (!socketRef.current?.connected) {
      setChatError("サーバーに接続されていません");
      setTimeout(() => setChatError(""), 3000);
      return;
    }

    if (message.length > 100) {
      setChatError("メッセージが長すぎます(100文字以内)");
      setTimeout(() => setChatError(""), 3000);
      return;
    }

    socketRef.current.emit("chat_message", { message });
  }, []);

  // キーボード処理
  useEffect(() => {
    if (!gameStarted) return;

    const handleKeyDown = (e) => {
      const activeElement = document.activeElement;
      const isInputFocused = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA'
      );

      if (isInputFocused) {
        return;
      }

      e.preventDefault();

      // UI切り替え
      if (e.code === 'KeyH') {
        toggleUI();
        return;
      }

      // 🛍️ ショップ開閉
      if (e.code === 'KeyB') {
        setShowShop(prev => !prev);
        return;
      }

      // 🛍️ ESCでショップを閉じる
      if (e.code === 'Escape') {
        if (showShop) {
          setShowShop(false);
          return;
        }
      }

      switch (e.code) {
        case 'Space':
          if (!keysRef.current.space) {
            keysRef.current.space = true;
            const mousePos = mouseRef.current;
            const myPlayer = playersRef.current[myIdRef.current];
            if (myPlayer?.cells?.[0]) {
              socketRef.current?.emit("split", {
                mouseX: mousePos.worldX || 0,
                mouseY: mousePos.worldY || 0,
                timestamp: Date.now()
              });
            }
          }
          break;

        case 'KeyW':
          if (!keysRef.current.w) {
            keysRef.current.w = true;
            performSingleEject();
          }
          break;

        // 🔫 Fキーで銃を発射
        case 'KeyF':
          if (!keysRef.current.f) {
            keysRef.current.f = true;
            if (hasGunRef.current) {
              shootGun();
            }
          }
          break;

        case 'ArrowUp':
        case 'KeyE':
          keysRef.current.up = true;
          break;

        case 'ArrowDown':
        case 'KeyD':
          keysRef.current.down = true;
          break;

        case 'ArrowLeft':
        case 'KeyS':
          keysRef.current.left = true;
          break;

        case 'ArrowRight':
          keysRef.current.right = true;
          break;
      }
    };

    const handleKeyUp = (e) => {
      const activeElement = document.activeElement;
      const isInputFocused = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA'
      );

      if (isInputFocused) {
        return;
      }

      switch (e.code) {
        case 'Space':
          keysRef.current.space = false;
          break;
        case 'KeyW':
          keysRef.current.w = false;
          break;
        case 'KeyF':
          keysRef.current.f = false;
          break;
        case 'ArrowUp':
        case 'KeyE':
          keysRef.current.up = false;
          break;
        case 'ArrowDown':
        case 'KeyD':
          keysRef.current.down = false;
          break;
        case 'ArrowLeft':
        case 'KeyS':
          keysRef.current.left = false;
          break;
        case 'ArrowRight':
          keysRef.current.right = false;
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown, false);
    window.addEventListener('keyup', handleKeyUp, false);

    const sendMove = () => {
      const activeElement = document.activeElement;
      const isInputFocused = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA'
      );

      if (isInputFocused || isTypingRef.current) {
        return;
      }

      const myPlayer = playersRef.current[myIdRef.current];
      if (!myPlayer?.cells?.[0] || !socketRef.current?.connected) return;

      let targetX = mouseRef.current.worldX;
      let targetY = mouseRef.current.worldY;

      let keyX = 0, keyY = 0;
      if (keysRef.current.up) keyY -= 1;
      if (keysRef.current.down) keyY += 1;
      if (keysRef.current.left) keyX -= 1;
      if (keysRef.current.right) keyX += 1;

      if (keyX !== 0 || keyY !== 0) {
        const magnitude = Math.sqrt(keyX * keyX + keyY * keyY);
        const normalizedX = keyX / magnitude;
        const normalizedY = keyY / magnitude;

        const myCell = myPlayer.cells[0];
        targetX = myCell.x + normalizedX * 600;
        targetY = myCell.y + normalizedY * 600;
      }

      targetX = Math.max(50, Math.min(worldSize.width - 50, targetX));
      targetY = Math.max(50, Math.min(worldSize.height - 50, targetY));

      socketRef.current.emit("move_player", {
        targetX: targetX,
        targetY: targetY,
        timestamp: Date.now()
      });
    };

    const moveInterval = setInterval(sendMove, 20);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, false);
      window.removeEventListener('keyup', handleKeyUp, false);
      clearInterval(moveInterval);
    };
  }, [gameStarted, performSingleEject, shootGun, toggleUI, worldSize, showShop]);

  // === カメラ物理更新 ===
  const updateCameraPhysics = useCallback((deltaTime) => {
    const myPlayer = playersRef.current[myIdRef.current];
    if (!myPlayer?.cells?.[0]) return;

    const cell = myPlayer.cells[0];

    const dx = cell.x - cameraRef.current.x;
    const dy = cell.y - cameraRef.current.y;

    cameraRef.current.x += dx * 0.08;
    cameraRef.current.y += dy * 0.08;

    const baseZoom = 800;
    const cellSize = cell.radius * 2;

    const minScale = 0.4;
    const maxScale = 3.0;

    const targetScale = Math.max(minScale, Math.min(maxScale, baseZoom / Math.max(cellSize, 30)));
    const scaleDiff = targetScale - cameraRef.current.scale;
    cameraRef.current.scale += scaleDiff * 0.06;
  }, []);

  // === セルアニメーション更新 ===
  const updateCellAnimations = useCallback((deltaTime) => {
    const dt = deltaTime * 0.001;
    const time = performance.now() * 0.001;

    for (const [playerId, player] of Object.entries(playersRef.current)) {
      if (!player.cells) continue;

      for (let i = 0; i < player.cells.length; i++) {
        const cell = player.cells[i];
        let cellAnim = animationState.current.cells.get(`${playerId}_${i}`);

        if (!cellAnim) {
          cellAnim = createCellAnimation(cell);
          animationState.current.cells.set(`${playerId}_${i}`, cellAnim);
        }

        if (cell.splitAnimationPhase && cell.splitAnimationPhase > 0) {
          cellAnim.splitAnimationPhase = cell.splitAnimationPhase;
          cellAnim.splitStartX = cell.splitStartX || cell.x;
          cellAnim.splitStartY = cell.splitStartY || cell.y;
          cellAnim.splitTargetX = cell.splitTargetX || cell.x;
          cellAnim.splitTargetY = cell.splitTargetY || cell.y;

          const progress = 1 - cellAnim.splitAnimationPhase;
          const easeProgress = 1 - Math.pow(1 - progress, 3);

          cellAnim.x = cellAnim.splitStartX +
            (cellAnim.splitTargetX - cellAnim.splitStartX) * easeProgress;
          cellAnim.y = cellAnim.splitStartY +
            (cellAnim.splitTargetY - cellAnim.splitStartY) * easeProgress;

          if (!cellAnim.splitTrail) cellAnim.splitTrail = [];

          if (cellAnim.splitTrail.length < 8) {
            cellAnim.splitTrail.push({
              x: cellAnim.x,
              y: cellAnim.y,
              alpha: 1.0,
              size: cell.radius * 0.8
            });
          } else {
            cellAnim.splitTrail.shift();
            cellAnim.splitTrail.push({
              x: cellAnim.x,
              y: cellAnim.y,
              alpha: 1.0,
              size: cell.radius * 0.8
            });
          }

          cellAnim.splitTrail.forEach((trail, index) => {
            trail.alpha = (index + 1) / cellAnim.splitTrail.length * 0.4;
          });

        } else {
          const positionLerp = 0.12;
          cellAnim.targetX = cell.x;
          cellAnim.targetY = cell.y;

          const dx = cellAnim.targetX - cellAnim.x;
          const dy = cellAnim.targetY - cellAnim.y;

          cellAnim.x += dx * positionLerp;
          cellAnim.y += dy * positionLerp;

          if (cellAnim.splitTrail && cellAnim.splitTrail.length > 0) {
            cellAnim.splitTrail = cellAnim.splitTrail.filter(trail => {
              trail.alpha *= 0.9;
              return trail.alpha > 0.05;
            });
          }
        }

        cellAnim.targetRadius = cell.radius;
        const radiusDiff = cellAnim.targetRadius - cellAnim.radius;

        if (Math.abs(radiusDiff) > 0.05) {
          cellAnim.radius += radiusDiff * 0.08;
        }

        const currentMass = cell.mass || 0;
        if (currentMass > cellAnim.lastMass) {
          cellAnim.growthEffect = 1.0;
          cellAnim.pulseIntensity = 0.4;
        }
        cellAnim.lastMass = currentMass;

        cellAnim.breathPhase += dt * 1.5;
        const breathIntensity = 0.015 + Math.sin(time * 2 + playerId.charCodeAt(0)) * 0.008;

        cellAnim.rotation += cellAnim.rotationSpeed * dt;

        if (cellAnim.pulseIntensity > 0) {
          cellAnim.pulsePhase += dt * 10;
          cellAnim.pulseIntensity *= 0.93;
        }

        if (cellAnim.growthEffect > 0) {
          cellAnim.growthEffect *= 0.95;
        }

        cell.animX = cellAnim.x;
        cell.animY = cellAnim.y;
        cell.animRadius = cellAnim.radius + Math.sin(cellAnim.breathPhase) * breathIntensity * cellAnim.radius;
        cell.animRotation = cellAnim.rotation;
        cell.animPulse = cellAnim.pulseIntensity;
        cell.animGrowth = cellAnim.growthEffect;

        cell.animSplitTrail = cellAnim.splitTrail || [];
        cell.animSplitPhase = cellAnim.splitAnimationPhase || 0;
      }
    }
  }, [createCellAnimation]);

  // === エフェクトトリガー ===
  const triggerEatEffect = useCallback((cell) => {
    return;
  }, []);

  const buyGun = useCallback(() => {
    if (!socketRef.current?.connected) {
      setShopMessage("サーバーに接続されていません");
      setShopMessageType("error");
      setTimeout(() => setShopMessage(""), 3000);
      return;
    }

    socketRef.current.emit("buy_gun", {
      timestamp: Date.now()
    });

    console.log("🛍️ Attempting to buy gun...");
  }, []);

  const getCurrentMass = useCallback(() => {
    const myPlayer = playersRef.current[myIdRef.current];
    if (!myPlayer?.cells) return 0;
    return myPlayer.cells.reduce((sum, cell) => sum + cell.mass, 0);
  }, []);

  // === パーティクル更新 ===
  const updateParticles = useCallback((deltaTime) => {
    const dt = deltaTime * 0.001;

    animationState.current.particles = animationState.current.particles.filter(particle => {
      particle.life -= dt / particle.maxLife;

      if (particle.life <= 0) return false;

      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.94;
      particle.vy *= 0.94;
      particle.size *= 0.96;

      return true;
    });
  }, []);

  // === ウイルスリスク&リワードエフェクト ===
  const triggerVirusRiskRewardEffect = useCallback((data) => {
    console.log('🦠⚡ Virus interaction effect triggered', data);
  }, []);

  // === Canvas設定 ===
  const setupCanvas = useCallback((canvas, ctx) => {
    const dpr = canvasSize.dpr;

    canvas.width = canvasSize.width * dpr;
    canvas.height = canvasSize.height * dpr;
    canvas.style.width = canvasSize.width + 'px';
    canvas.style.height = canvasSize.height + 'px';

    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    return ctx;
  }, [canvasSize]);

  // === 色彩補助関数 ===
  const lightenColor = useCallback((color, amount) => {
    if (color.startsWith('hsl')) {
      const match = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
      if (match) {
        const h = parseInt(match[1]);
        const s = parseInt(match[2]);
        const l = Math.min(100, parseInt(match[3]) + amount * 100);
        return `hsl(${h}, ${s}%, ${l}%)`;
      }
    }
    return color;
  }, []);

  const darkenColor = useCallback((color, amount) => {
    if (color.startsWith('hsl')) {
      const match = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
      if (match) {
        const h = parseInt(match[1]);
        const s = parseInt(match[2]);
        const l = Math.max(0, parseInt(match[3]) - amount * 100);
        return `hsl(${h}, ${s}%, ${l}%)`;
      }
    }
    return color;
  }, []);

  // === セル描画 ===
  const drawEnhancedCell = useCallback((ctx, cell, player, isMyCell, camera, time) => {
    const animX = cell.animX || cell.x;
    const animY = cell.animY || cell.y;
    const animRadius = cell.animRadius || cell.radius;
    const animRotation = cell.animRotation || 0;
    const animPulse = cell.animPulse || 0;
    const animGrowth = cell.animGrowth || 0;

    ctx.save();

    if (Math.abs(animRotation) > 0.001) {
      ctx.translate(animX, animY);
      ctx.rotate(animRotation);
      ctx.translate(-animX, -animY);
    }

    const pulseScale = 1 + animPulse * 0.12 + animGrowth * 0.08;
    const finalRadius = animRadius * pulseScale;

    if (animGrowth > 0 || isMyCell) {
      ctx.save();
      ctx.shadowColor = player.color;
      ctx.shadowBlur = (15 * animGrowth + (isMyCell ? 8 : 0)) / camera.scale;
      ctx.globalAlpha = animGrowth * 0.6 + (isMyCell ? 0.3 : 0);

      ctx.beginPath();
      ctx.arc(animX, animY, finalRadius * 1.2, 0, Math.PI * 2);
      ctx.fillStyle = player.color;
      ctx.fill();
      ctx.restore();
    }

    if (finalRadius > 12) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
      ctx.shadowBlur = Math.min(8, finalRadius * 0.1) / camera.scale;
      ctx.shadowOffsetX = 3 / camera.scale;
      ctx.shadowOffsetY = 3 / camera.scale;
    }

    const gradient = ctx.createRadialGradient(
      animX - finalRadius * 0.3, animY - finalRadius * 0.3, 0,
      animX, animY, finalRadius
    );

    gradient.addColorStop(0, lightenColor(player.color, 0.4));
    gradient.addColorStop(0.7, player.color);
    gradient.addColorStop(1, darkenColor(player.color, 0.2));

    ctx.beginPath();
    ctx.arc(animX, animY, finalRadius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.shadowColor = 'transparent';

    if (isMyCell) {
      const glowIntensity = 0.8 + Math.sin(time * 4) * 0.2;
      ctx.strokeStyle = '#00AAFF';
      ctx.lineWidth = 4 / camera.scale;
      ctx.shadowColor = '#00AAFF';
      ctx.shadowBlur = 12 * glowIntensity / camera.scale;
    } else {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 2 / camera.scale;
    }

    ctx.beginPath();
    ctx.arc(animX, animY, finalRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }, [lightenColor, darkenColor]);

  // === ウイルス描画 ===
  const drawVirus = useCallback((ctx, virus, camera, time) => {
    const spikes = 20;
    const innerRadius = virus.radius * 0.65;
    const outerRadius = virus.radius;
    const pulseIntensity = 1 + Math.sin(virus.pulsePhase || time * 3) * 0.1;

    ctx.save();
    ctx.translate(virus.x, virus.y);
    ctx.rotate((virus.rotation || 0) + time * 0.5);

    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 6 / camera.scale;
    ctx.shadowOffsetX = 2 / camera.scale;
    ctx.shadowOffsetY = 2 / camera.scale;

    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const angle = (i * Math.PI) / spikes;
      const radius = (i % 2 === 0 ? outerRadius : innerRadius) * pulseIntensity;
      const spikeVariation = 1 + Math.sin(time * 4 + angle * 3) * 0.1;
      const x = Math.cos(angle) * radius * spikeVariation;
      const y = Math.sin(angle) * radius * spikeVariation;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();

    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, outerRadius);
    gradient.addColorStop(0, '#00FF88');
    gradient.addColorStop(0.6, '#00CC44');
    gradient.addColorStop(1, '#008822');

    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 3 / camera.scale;
    ctx.stroke();

    ctx.shadowColor = 'transparent';
    ctx.beginPath();
    ctx.arc(0, 0, innerRadius * 0.8 * pulseIntensity, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
    ctx.fill();

    ctx.restore();
  }, []);

  // 🔫 銃アイテムの描画
  const drawGunItem = useCallback((ctx, gunItem, camera, time) => {
    const pulseIntensity = 1 + Math.sin(gunItem.pulsePhase || time * 3) * 0.15;
    const finalRadius = gunItem.radius * pulseIntensity;

    ctx.save();
    ctx.translate(gunItem.x, gunItem.y);
    ctx.rotate(gunItem.rotation || 0);

    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 8 / camera.scale;
    ctx.shadowOffsetX = 3 / camera.scale;
    ctx.shadowOffsetY = 3 / camera.scale;

    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, finalRadius);
    gradient.addColorStop(0, '#FFD700');
    gradient.addColorStop(0.6, '#FFA500');
    gradient.addColorStop(1, '#FF8C00');

    ctx.beginPath();
    ctx.arc(0, 0, finalRadius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 3 / camera.scale;
    ctx.stroke();

    ctx.shadowColor = 'transparent';

    ctx.font = `${finalRadius * 1.2}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000';
    ctx.fillText('🔫', 0, 0);

    ctx.restore();
  }, []);

  // 🔫 弾の描画
  const drawBullet = useCallback((ctx, bullet, camera) => {
    ctx.save();

    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 4 / camera.scale;
    ctx.shadowOffsetX = 2 / camera.scale;
    ctx.shadowOffsetY = 2 / camera.scale;

    const gradient = ctx.createRadialGradient(
      bullet.x - bullet.radius * 0.3, bullet.y - bullet.radius * 0.3, 0,
      bullet.x, bullet.y, bullet.radius
    );
    gradient.addColorStop(0, '#FF6666');
    gradient.addColorStop(0.6, '#FF4444');
    gradient.addColorStop(1, '#CC0000');

    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.shadowColor = 'transparent';

    ctx.strokeStyle = '#FF0000';
    ctx.lineWidth = 2 / camera.scale;
    ctx.stroke();

    ctx.restore();
  }, []);

  // === パーティクル描画 ===
  const drawParticles = useCallback((ctx, camera) => {
    for (const particle of animationState.current.particles) {
      ctx.save();

      ctx.globalAlpha = particle.life * 0.8;
      ctx.fillStyle = particle.color;

      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }, []);

  // === テキスト描画 ===
  const drawEnhancedText = useCallback((ctx, text, x, y, fontSize, camera, isMain = false) => {
    const scaledFontSize = fontSize / camera.scale;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (isMain) {
      ctx.font = `bold ${scaledFontSize}px "Segoe UI", Arial, sans-serif`;

      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 6 / camera.scale;
      ctx.shadowOffsetX = 2 / camera.scale;
      ctx.shadowOffsetY = 2 / camera.scale;

      ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
      ctx.lineWidth = 4 / camera.scale;
      ctx.strokeText(text, x, y);

      ctx.fillStyle = 'white';
      ctx.fillText(text, x, y);
    } else {
      ctx.font = `bold ${scaledFontSize}px Arial`;
      ctx.fillStyle = '#FFD700';
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.lineWidth = 2 / camera.scale;
      ctx.strokeText(text, x, y);
      ctx.fillText(text, x, y);
    }

    ctx.restore();
  }, []);

  // === メインレンダリングループ ===
  const draw = useCallback((timestamp) => {
    const renderStart = performance.now();

    const deltaTime = timestamp - animationState.current.lastTime;
    animationState.current.lastTime = timestamp;

    const deltaTimeClamped = Math.min(deltaTime, 33.33);

    if (deltaTimeClamped < GAME_CONSTANTS.FRAME_TIME * 0.8) {
      animationFrameRef.current = requestAnimationFrame(draw);
      return;
    }

    fpsCounter.current.frames++;
    if (timestamp - fpsCounter.current.lastTime > 1000) {
      const fps = Math.round(fpsCounter.current.frames * 1000 / (timestamp - fpsCounter.current.lastTime));
      fpsCounter.current.frames = 0;
      fpsCounter.current.lastTime = timestamp;
      setDebugInfo(prev => ({ ...prev, fps }));
    }

    const canvas = canvasRef.current;
    if (!canvas || !gameStarted) {
      animationFrameRef.current = requestAnimationFrame(draw);
      return;
    }

    const ctx = canvas.getContext("2d");
    setupCanvas(canvas, ctx);

    const myPlayer = playersRef.current[myIdRef.current];
    if (!myPlayer?.cells?.[0]) {
      animationFrameRef.current = requestAnimationFrame(draw);
      return;
    }

    const time = timestamp * 0.001;

    updateCameraPhysics(deltaTimeClamped);
    updateCellAnimations(deltaTimeClamped);
    updateParticles(deltaTimeClamped);

    const bgOffset = Math.sin(time * 0.1) * 0.02;
    const bgGradient = ctx.createRadialGradient(
      canvasSize.width / 2, canvasSize.height / 2, 0,
      canvasSize.width / 2, canvasSize.height / 2, Math.max(canvasSize.width, canvasSize.height)
    );
    bgGradient.addColorStop(0, `hsl(210, 25%, ${94 + bgOffset * 100}%)`);
    bgGradient.addColorStop(1, `hsl(210, 20%, ${90 + bgOffset * 100}%)`);

    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);

    const camera = cameraRef.current;

    ctx.save();
    ctx.translate(canvasSize.width / 2, canvasSize.height / 2);
    ctx.scale(camera.scale, camera.scale);
    ctx.translate(-camera.x, -camera.y);

    const gridSize = 60;
    const viewWidth = canvasSize.width / camera.scale;
    const viewHeight = canvasSize.height / camera.scale;

    const startX = Math.floor((camera.x - viewWidth / 2) / gridSize) * gridSize;
    const startY = Math.floor((camera.y - viewHeight / 2) / gridSize) * gridSize;
    const endX = Math.ceil((camera.x + viewWidth / 2) / gridSize) * gridSize;
    const endY = Math.ceil((camera.y + viewHeight / 2) / gridSize) * gridSize;

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.lineWidth = 1 / camera.scale;

    ctx.beginPath();
    for (let x = startX; x <= endX; x += gridSize) {
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }
    for (let y = startY; y <= endY; y += gridSize) {
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }
    ctx.stroke();

    const maxViewDistance = Math.max(viewWidth, viewHeight) / 2 + 200;

    for (const food of foodsRef.current) {
      if (!food.x || !food.y) continue;

      const dx = Math.abs(food.x - camera.x);
      const dy = Math.abs(food.y - camera.y);

      if (dx < maxViewDistance && dy < maxViewDistance) {
        let foodRadius = food.radius || GAME_CONSTANTS.MASS_TO_RADIUS(food.mass || 1);
        const breathEffect = 1 + Math.sin(time * 2 + food.x * 0.005) * 0.1;
        const finalRadius = foodRadius * breathEffect;

        ctx.save();

        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 4 / camera.scale;
        ctx.shadowOffsetX = 1 / camera.scale;
        ctx.shadowOffsetY = 1 / camera.scale;

        const gradient = ctx.createRadialGradient(
          food.x - finalRadius * 0.3, food.y - finalRadius * 0.3, 0,
          food.x, food.y, finalRadius
        );
        gradient.addColorStop(0, lightenColor(food.color || '#FF6B6B', 0.5));
        gradient.addColorStop(1, food.color || '#FF6B6B');

        ctx.beginPath();
        ctx.arc(food.x, food.y, finalRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 1 / camera.scale;
        ctx.stroke();

        ctx.restore();
      }
    }

    for (const eject of ejectedMassesRef.current) {
      const dx = Math.abs(eject.x - camera.x);
      const dy = Math.abs(eject.y - camera.y);

      if (dx < maxViewDistance && dy < maxViewDistance) {
        ctx.save();

        ctx.globalAlpha = eject.alpha || 1.0;

        let pulseScale = 1.0;
        if (eject.pulsePhase !== undefined) {
          pulseScale = 1 + Math.sin(eject.pulsePhase * 4) * 0.05;
        }

        const finalRadius = (eject.radius || 6) * pulseScale;

        const ejectGradient = ctx.createRadialGradient(
          eject.x - finalRadius * 0.4, eject.y - finalRadius * 0.4, 0,
          eject.x, eject.y, finalRadius
        );
        ejectGradient.addColorStop(0, '#AAFFAA');
        ejectGradient.addColorStop(0.5, '#66DD66');
        ejectGradient.addColorStop(1, '#339933');

        ctx.shadowColor = '#44DD44';
        ctx.shadowBlur = 2 / camera.scale;

        ctx.beginPath();
        ctx.arc(eject.x, eject.y, finalRadius, 0, Math.PI * 2);
        ctx.fillStyle = ejectGradient;
        ctx.fill();

        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = '#22BB22';
        ctx.lineWidth = 1 / camera.scale;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(eject.x, eject.y, finalRadius * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fill();

        ctx.restore();
      }
    }

    for (const virus of virusesRef.current) {
      const dx = Math.abs(virus.x - camera.x);
      const dy = Math.abs(virus.y - camera.y);

      if (dx < maxViewDistance && dy < maxViewDistance) {
        drawVirus(ctx, virus, camera, time);
      }
    }

    // 🔫 銃アイテム描画
    for (const gunItem of gunItemsRef.current) {
      const dx = Math.abs(gunItem.x - camera.x);
      const dy = Math.abs(gunItem.y - camera.y);

      if (dx < maxViewDistance && dy < maxViewDistance) {
        drawGunItem(ctx, gunItem, camera, time);
      }
    }

    // 🔫 弾の描画
    for (const bullet of bulletsRef.current) {
      const dx = Math.abs(bullet.x - camera.x);
      const dy = Math.abs(bullet.y - camera.y);

      if (dx < maxViewDistance && dy < maxViewDistance) {
        drawBullet(ctx, bullet, camera);
      }
    }

    for (const [id, player] of Object.entries(playersRef.current)) {
      if (!player.cells) continue;

      for (let i = 0; i < player.cells.length; i++) {
        const cell = player.cells[i];
        const dx = Math.abs((cell.animX || cell.x) - camera.x);
        const dy = Math.abs((cell.animY || cell.y) - camera.y);

        if (dx < maxViewDistance && dy < maxViewDistance) {
          const isMyCell = id === myIdRef.current;

          drawEnhancedCell(ctx, cell, player, isMyCell, camera, time);

          if (i === 0 && (cell.animRadius || cell.radius) > 3) {
            const fontSize = Math.max(12, (cell.animRadius || cell.radius) / 4);
            const textX = cell.animX || cell.x;
            const textY = cell.animY || cell.y;

            drawEnhancedText(ctx, player.name, textX, textY, fontSize, camera, true);

            if (isMyCell) {
              const youFontSize = Math.max(10, (cell.animRadius || cell.radius) / 6);
              drawEnhancedText(
                ctx, "YOU",
                textX, textY - (cell.animRadius || cell.radius) - 15 / camera.scale,
                youFontSize, camera, false
              );
            }

            if ((cell.animRadius || cell.radius) > 25 && (cell.mass || 0) > 30) {
              const massFontSize = Math.max(8, (cell.animRadius || cell.radius) / 8);
              drawEnhancedText(
                ctx, `${Math.floor(cell.mass || 0)}`,
                textX, textY + (cell.animRadius || cell.radius) + 12 / camera.scale,
                massFontSize, camera, false
              );
            }
          }
        }
      }
    }

    drawParticles(ctx, camera);

    ctx.restore();

    if (fpsCounter.current.frames % 4 === 0) {
      drawMinimap();
    }

    const renderTime = performance.now() - renderStart;
    if (fpsCounter.current.renderTimes.length < 20) {
      fpsCounter.current.renderTimes.push(renderTime);
    } else {
      fpsCounter.current.renderTimes[fpsCounter.current.frames % 20] = renderTime;
    }

    animationFrameRef.current = requestAnimationFrame(draw);
  }, [gameStarted, canvasSize, setupCanvas, updateCameraPhysics, updateCellAnimations, updateParticles,
    drawEnhancedCell, drawVirus, drawGunItem, drawBullet, drawParticles, drawEnhancedText, lightenColor]);

  // === ミニマップ描画 ===
  const drawMinimap = useCallback(() => {
    const minimapCanvas = minimapCanvasRef.current;
    if (!minimapCanvas || !gameStarted) return;

    const ctx = minimapCanvas.getContext("2d");
    const dpr = canvasSize.dpr;
    const minimapSize = 160;

    minimapCanvas.width = minimapSize * dpr;
    minimapCanvas.height = minimapSize * dpr;
    minimapCanvas.style.width = minimapSize + 'px';
    minimapCanvas.style.height = minimapSize + 'px';
    ctx.scale(dpr, dpr);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const scale = minimapSize / Math.max(worldSize.width, worldSize.height);

    ctx.clearRect(0, 0, minimapSize, minimapSize);

    // 背景
    const bgGradient = ctx.createLinearGradient(0, 0, minimapSize, minimapSize);
    bgGradient.addColorStop(0, 'rgba(15, 25, 35, 0.95)');
    bgGradient.addColorStop(1, 'rgba(35, 45, 55, 0.95)');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, minimapSize, minimapSize);

    // 境界線
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, worldSize.width * scale - 4, worldSize.height * scale - 4);

    // ウイルス表示（緑色）
    for (const virus of virusesRef.current) {
      const x = virus.x * scale;
      const y = virus.y * scale;

      ctx.fillStyle = '#00AA44';
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 🔫 銃アイテム表示（金色、ウイルスより大きく目立つように）
    for (const gunItem of gunItemsRef.current) {
      const x = gunItem.x * scale;
      const y = gunItem.y * scale;

      // 外側の光るエフェクト
      ctx.save();
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 8;

      // 金色の円
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();

      // 黒い外枠
      ctx.strokeStyle = '#FF8C00';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.restore();

      // 🔫 アイコン（小さく表示）
      ctx.save();
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🔫', x, y);
      ctx.restore();
    }

    // プレイヤー表示
    for (const [id, player] of Object.entries(playersRef.current)) {
      if (player.cells && player.cells.length > 0) {
        const cell = player.cells[0];
        const x = cell.x * scale;
        const y = cell.y * scale;
        const size = Math.max(2, Math.min(6, (cell.radius || 10) * scale * 0.2));

        ctx.save();
        ctx.shadowColor = id === myIdRef.current ? '#FFD700' : player.color;
        ctx.shadowBlur = id === myIdRef.current ? 6 : 3;

        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fillStyle = id === myIdRef.current ? '#FFD700' : player.color;
        ctx.fill();

        if (id === myIdRef.current) {
          ctx.strokeStyle = '#FFF';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // 視界範囲表示
    const myPlayer = playersRef.current[myIdRef.current];
    if (myPlayer && myPlayer.cells && myPlayer.cells.length > 0) {
      const camera = cameraRef.current;
      const viewportWidth = canvasSize.width / camera.scale;
      const viewportHeight = canvasSize.height / camera.scale;

      const viewX = (camera.x - viewportWidth / 2) * scale;
      const viewY = (camera.y - viewportHeight / 2) * scale;
      const viewW = viewportWidth * scale;
      const viewH = viewportHeight * scale;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(viewX, viewY, viewW, viewH);
      ctx.setLineDash([]);
    }
  }, [gameStarted, worldSize, canvasSize]);

  // === 描画ループ開始 ===
  useEffect(() => {
    if (gameStarted) {
      animationFrameRef.current = requestAnimationFrame(draw);
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [gameStarted, draw]);

  // === ゲーム開始 ===
  const startGame = useCallback(() => {
    if (playerName.trim() && connectionStatus === "connected" && socketRef.current) {
      socketRef.current.emit("join_game", { name: playerName.trim() });
      setGameStarted(true);
    }
  }, [playerName, connectionStatus]);

  // === コンティニュー処理 ===
  const handleContinue = useCallback(() => {
    if (socketRef.current?.connected && playerName.trim()) {
      setGameOver(false);
      setDeathInfo(null);
      setIsAlive(true);

      socketRef.current.emit("join_game", { name: playerName.trim() });
      setGameStarted(true);

      console.log("🔄 Continuing game as:", playerName);
    }
  }, [playerName]);

  // === メニューに戻る処理 ===
  const handleBackToMenu = useCallback(() => {
    setGameOver(false);
    setGameStarted(false);
    setDeathInfo(null);
    setIsAlive(true);
    setPlayerName("");

    console.log("🏠 Back to menu");
  }, []);

  // myStats
  const myStats = useMemo(() => {
    const myPlayer = players[myId];
    if (!myPlayer?.cells) return {
      mass: 0,
      radius: 0,
      cellCount: 0,
      score: 0,
      speed: 0,
      canSplit: false,
      canEject: false,
      ejectableCells: 0,
      ejectDistance: 0,
      virusRiskRewards: 0,
      status: 'unknown'
    };

    const totalMass = myPlayer.cells.reduce((sum, cell) => sum + (cell.mass || 0), 0);
    const mainCell = myPlayer.cells[0];
    const radius = mainCell ? GAME_CONSTANTS.MASS_TO_RADIUS(mainCell.mass || 0) : 0;
    const speed = mainCell?.maxSpeed || (mainCell ? GAME_CONSTANTS.SPEED_FORMULA(mainCell.mass || 0) : 0);
    const clientSpeed = mainCell ? GAME_CONSTANTS.SPEED_FORMULA(mainCell.mass || 0) : 0;

    const ejectableCells = myPlayer.cells.filter(cell =>
      cell.mass >= GAME_CONSTANTS.EJECT_MIN_MASS
    ).length;

    const ejectDistance = mainCell ? calculateEjectDistance(mainCell.mass) : 0;
    const virusStatus = totalMass < 120 ? 'safe' : 'risk';

    return {
      mass: totalMass,
      radius: radius,
      cellCount: myPlayer.cells.length,
      score: myPlayer.score || 0,
      speed: speed,
      clientSpeed: clientSpeed,
      canSplit: totalMass >= GAME_CONSTANTS.SPLIT_MIN_MASS,
      canEject: ejectableCells > 0,
      ejectableCells: ejectableCells,
      ejectDistance: ejectDistance,
      virusRiskRewards: myPlayer.virusRiskRewards || 0,
      status: virusStatus
    };
  }, [players, myId, calculateEjectDistance]);

  // === リーダーボード表示 ===
  const renderLeaderboard = useMemo(() => {
    return leaderboard.slice(0, 10).map((entry, index) => (
      <div key={index} style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "6px 10px",
        backgroundColor: entry.name === players[myId]?.name ?
          "rgba(255, 215, 0, 0.25)" :
          index < 3 ? "rgba(0, 200, 0, 0.1)" : "transparent",
        borderRadius: "6px",
        fontSize: "13px",
        borderLeft: index < 3 ? "3px solid #FFD700" : "none"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{
            fontWeight: "bold",
            color: index === 0 ? "#FFD700" : index === 1 ? "#C0C0C0" : index === 2 ? "#CD7F32" : "#333",
            minWidth: "20px"
          }}>
            {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}.`}
          </span>
          <span style={{ color: "#333" }}>
            {entry.name}
          </span>
        </div>
        <span style={{ color: "#666", fontWeight: "bold" }}>
          {Math.floor(entry.mass || 0)}
        </span>
      </div>
    ));
  }, [leaderboard, players, myId]);

  // === メモリ監視 ===
  useEffect(() => {
    const memoryInterval = setInterval(() => {
      if (performance && performance.memory) {
        setDebugInfo(prev => ({
          ...prev,
          memoryUsage: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
          renderTime: fpsCounter.current.renderTimes.length > 0 ?
            Math.round(fpsCounter.current.renderTimes.reduce((a, b) => a + b, 0) / fpsCounter.current.renderTimes.length * 100) / 100 : 0
        }));
      }
    }, 2000);

    return () => clearInterval(memoryInterval);
  }, []);

  // === コンティニュー画面 ===
  if (gameOver && deathInfo) {
    return (
      <div style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        fontFamily: '"Segoe UI", Arial, sans-serif',
        margin: 0,
        padding: 0,
        overflow: "hidden"
      }}>
        <div style={{
          background: "rgba(255,255,255,0.95)",
          padding: "50px",
          borderRadius: "25px",
          textAlign: "center",
          width: "90%",
          maxWidth: "500px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          backdropFilter: "blur(10px)",
          margin: "0 auto"
        }}>
          <h1 style={{
            fontSize: "3rem",
            margin: "0 0 15px 0",
            background: "linear-gradient(45deg, #ff6b6b, #ee5a6f)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            textShadow: "0 2px 4px rgba(0,0,0,0.1)",
            textAlign: "center"
          }}>
            💀 ゲームオーバー
          </h1>

          <div style={{
            color: "#555",
            marginBottom: "30px",
            fontSize: "16px",
            lineHeight: "1.8",
            background: "rgba(0,0,0,0.05)",
            padding: "20px",
            borderRadius: "15px",
            textAlign: "center"
          }}>
            <div style={{ fontSize: "18px", fontWeight: "bold", color: "#333", marginBottom: "15px" }}>
              {deathInfo.killedBy ? `${deathInfo.killedBy} に倒されました` : "敗北しました"}
            </div>
            <div style={{ fontSize: "14px", color: "#666" }}>
              最終質量: <strong>{Math.round(deathInfo.finalMass)}</strong>
            </div>
            <div style={{ fontSize: "14px", color: "#666" }}>
              最終スコア: <strong>{Math.round(deathInfo.finalScore)}</strong>
            </div>
          </div>

          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: "15px"
          }}>
            <button
              onClick={handleContinue}
              disabled={!socketRef.current?.connected}
              style={{
                width: "100%",
                padding: "15px",
                fontSize: "18px",
                fontWeight: "700",
                background: socketRef.current?.connected
                  ? "linear-gradient(45deg, #667eea, #764ba2)"
                  : "#ccc",
                color: "white",
                border: "none",
                borderRadius: "12px",
                cursor: socketRef.current?.connected ? "pointer" : "not-allowed",
                transition: "all 0.3s ease",
                boxShadow: "0 4px 15px rgba(0,0,0,0.2)",
                display: "block"
              }}
              onMouseEnter={(e) => {
                if (socketRef.current?.connected) {
                  e.target.style.transform = "translateY(-2px)";
                  e.target.style.boxShadow = "0 6px 20px rgba(0,0,0,0.3)";
                }
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = "translateY(0)";
                e.target.style.boxShadow = "0 4px 15px rgba(0,0,0,0.2)";
              }}
            >
              🔄 もう一度プレイ ({playerName})
            </button>

            <button
              onClick={handleBackToMenu}
              style={{
                width: "100%",
                padding: "15px",
                fontSize: "16px",
                fontWeight: "600",
                background: "rgba(100, 100, 100, 0.1)",
                color: "#555",
                border: "2px solid #ddd",
                borderRadius: "12px",
                cursor: "pointer",
                transition: "all 0.3s ease",
                display: "block"
              }}
              onMouseEnter={(e) => {
                e.target.style.background = "rgba(100, 100, 100, 0.2)";
                e.target.style.borderColor = "#999";
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "rgba(100, 100, 100, 0.1)";
                e.target.style.borderColor = "#ddd";
              }}
            >
              🏠 メニューに戻る
            </button>
          </div>

          {!socketRef.current?.connected && (
            <div style={{
              marginTop: "15px",
              color: "#CC0000",
              fontSize: "14px",
              fontWeight: "600",
              textAlign: "center"
            }}>
              ⚠️ サーバーに接続されていません
            </div>
          )}
        </div>
      </div>
    );
  }

  // === ログイン画面 ===
  if (!gameStarted) {
    return (
      <div style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        fontFamily: '"Segoe UI", Arial, sans-serif',
        margin: 0,
        padding: 0,
        overflow: "hidden"
      }}>
        <div style={{
          background: "rgba(255,255,255,0.95)",
          padding: "50px",
          borderRadius: "25px",
          textAlign: "center",
          width: "90%",
          maxWidth: "500px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          backdropFilter: "blur(10px)",
          margin: "0 auto"
        }}>
          <h1 style={{
            fontSize: "3rem",
            margin: "0 0 15px 0",
            background: "linear-gradient(45deg, #667eea, #764ba2)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            textShadow: "0 2px 4px rgba(0,0,0,0.1)",
            textAlign: "center"
          }}>
            🦠 Agar.io クローン
          </h1>

          <p style={{
            color: "#666",
            marginBottom: "25px",
            fontSize: "16px",
            fontWeight: "600",
            textAlign: "center"
          }}>
            🎯 短距離射出システム + 🔫銃アイテム v11.0
          </p>

          <div style={{
            color: "#555",
            marginBottom: "30px",
            fontSize: "14px",
            lineHeight: "1.6",
            background: "rgba(0,0,0,0.05)",
            padding: "20px",
            borderRadius: "15px",
            textAlign: "center"
          }}>
            <div style={{ marginBottom: "10px", fontWeight: "bold", color: "#333" }}>
              🎮 操作方法
            </div>
            🖱️ マウス: セルがカーソルを追従<br />
            ⌨️ ESDF/矢印: キーボード移動<br />
            ⌨️ スペース: 分裂（質量35以上）<br />
            ⌨️ W: 短距離質量射出（質量38以上）<br />
            🔫 F/クリック: 銃発射（銃所持時）<br />
            <div style={{ marginTop: "10px", color: "#FF8C00", fontWeight: "bold" }}>
              🔫 銃アイテム:<br />
              ⏱️ 1分ごとに1個スポーン<br />
              ⏰ 10秒間有効<br />
              💥 弾が当たると相手の質量-100<br />
              🎯 最大20発
            </div>
          </div>

          <input
            type="text"
            placeholder="プレイヤー名を入力"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && startGame()}
            maxLength={15}
            style={{
              width: "100%",
              padding: "15px",
              fontSize: "16px",
              marginBottom: "20px",
              border: "2px solid #ddd",
              borderRadius: "12px",
              textAlign: "center",
              boxSizing: "border-box",
              transition: "all 0.3s ease",
              outline: "none",
              display: "block"
            }}
            onFocus={(e) => e.target.style.borderColor = "#667eea"}
            onBlur={(e) => e.target.style.borderColor = "#ddd"}
          />

          <button
            onClick={startGame}
            disabled={!playerName.trim() || connectionStatus !== "connected"}
            style={{
              width: "100%",
              padding: "15px",
              fontSize: "18px",
              fontWeight: "700",
              background: (!playerName.trim() || connectionStatus !== "connected")
                ? "#ccc"
                : "linear-gradient(45deg, #667eea, #764ba2)",
              color: "white",
              border: "none",
              borderRadius: "12px",
              cursor: (!playerName.trim() || connectionStatus !== "connected")
                ? "not-allowed"
                : "pointer",
              transition: "all 0.3s ease",
              boxShadow: "0 4px 15px rgba(0,0,0,0.2)",
              display: "block"
            }}
          >
            {connectionStatus === "connecting" ? "🔄 接続中..." :
              connectionStatus === "connected" ? "🔫 銃アイテム Agar.io プレイ" : "❌ 接続エラー"}
          </button>

          {connectionStatus !== "connected" && (
            <div style={{
              marginTop: "15px",
              color: "#CC0000",
              fontSize: "14px",
              fontWeight: "600",
              textAlign: "center"
            }}>
              {connectionStatus === "connecting" && "サーバーに接続中..."}
              {connectionStatus === "disconnected" && "サーバーに接続できません"}
            </div>
          )}
        </div>
      </div>
    );
  }

  // === メインゲーム画面 ===
  return (
    <div style={{
      position: "relative",
      width: "100vw",
      height: "100vh",
      overflow: "hidden",
      backgroundColor: "#000",
      fontFamily: '"Segoe UI", Arial, sans-serif'
    }}>
      <canvas
        ref={canvasRef}
        width={canvasSize.width * canvasSize.dpr}
        height={canvasSize.height * canvasSize.dpr}
        style={{
          backgroundColor: "white",
          cursor: "crosshair",
          display: "block",
          width: canvasSize.width + 'px',
          height: canvasSize.height + 'px',
          touchAction: 'none',
          pointerEvents: isTyping ? 'none' : 'auto'
        }}
        tabIndex={-1}
        onMouseDown={(e) => {
          if (isTypingRef.current) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }}
        onClick={(e) => {
          if (isTypingRef.current) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }}
        onFocus={(e) => {
          if (isTypingRef.current) {
            e.preventDefault();
            e.target.blur();
            chatInputRef.current?.focus();
          }
        }}
      />

      <canvas
        ref={minimapCanvasRef}
        width={160 * canvasSize.dpr}
        height={160 * canvasSize.dpr}
        style={{
          position: "absolute",
          top: "20px",
          right: "20px",
          width: "160px",
          height: "160px",
          border: "3px solid rgba(255, 255, 255, 0.9)",
          borderRadius: "15px",
          backgroundColor: "rgba(0, 0, 0, 0.1)",
          backdropFilter: "blur(15px)",
          boxShadow: "0 10px 40px rgba(0, 0, 0, 0.4)"
        }}
      />

      <div style={{
        position: "absolute",
        top: "210px",
        right: "20px",
        backgroundColor: "rgba(255,255,255,0.93)",
        padding: "20px",
        borderRadius: "15px",
        minWidth: "220px",
        maxHeight: "350px",
        overflowY: "auto",
        boxShadow: "0 10px 40px rgba(0, 0, 0, 0.15)",
        backdropFilter: "blur(10px)"
      }}>
        <div style={{
          fontWeight: "bold",
          marginBottom: "15px",
          color: "#2196F3",
          textAlign: "center",
          fontSize: "16px"
        }}>
          🏆 リーダーボード
        </div>
        {renderLeaderboard}
      </div>

      <UIToggleButton showUI={showUI} onToggle={toggleUI} />

      {showUI && (
        <>
          <div style={{
            position: "absolute",
            top: "80px",
            left: "20px",
            color: "#333",
            fontSize: "14px",
            backgroundColor: "rgba(255,255,255,0.93)",
            padding: "20px",
            borderRadius: "15px",
            minWidth: "320px",
            boxShadow: "0 10px 40px rgba(0, 0, 0, 0.15)",
            backdropFilter: "blur(10px)",
            opacity: showUI ? 1 : 0,
            transform: showUI ? "translateY(0)" : "translateY(-20px)",
            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
          }}>
            <div style={{
              fontWeight: "bold",
              marginBottom: "12px",
              color: "#2196F3",
              fontSize: "16px",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}>
              👤 {players[myId]?.name || "Loading..."}
            </div>

            <div>💪 質量: <strong>{Math.round(myStats.mass).toLocaleString()}</strong></div>
            <div>📏 半径: <strong>{myStats.radius.toFixed(3)}</strong></div>
            <div>🧬 細胞数: {myStats.cellCount}/16</div>
            <div>⭐ スコア: {myStats.score.toLocaleString()}</div>
            <div>🔍 ズーム: {(cameraRef.current?.scale || 1).toFixed(2)}x</div>
            <div>🗺️ 世界: {worldSize.width}×{worldSize.height}</div>

            {hasGun && (
              <div style={{
                marginTop: "10px",
                padding: "8px",
                backgroundColor: "rgba(255, 215, 0, 0.2)",
                borderRadius: "8px",
                border: "2px solid #FFD700"
              }}>
                <div style={{ fontWeight: "bold", color: "#FF8C00" }}>
                  🔫 銃装備中
                </div>
                <div style={{ fontSize: "12px" }}>
                  弾数: {gunBullets} / 20
                </div>
                <div style={{ fontSize: "12px" }}>
                  残り: {Math.ceil(gunTimeLeft / 1000)}秒
                </div>
              </div>
            )}

            <div style={{
              fontSize: "11px",
              color: "#666",
              marginTop: "12px",
              borderTop: "1px solid #eee",
              paddingTop: "12px"
            }}>
              <div>FPS: {debugInfo.fps} | Ping: {debugInfo.ping}ms</div>
              <div>Players: {debugInfo.players} | Objects: {debugInfo.objectsCount}</div>
              <div>Memory: {debugInfo.memoryUsage}MB | Render: {debugInfo.renderTime}ms</div>
            </div>
          </div>

          {/* ショップUI */}
          <ShopUI
            showShop={showShop}
            onClose={() => setShowShop(false)}
            onBuyGun={buyGun}
            currentMass={getCurrentMass()}
            hasGun={hasGun}
          />

          {/* ショップメッセージ */}
          <ShopMessage message={shopMessage} type={shopMessageType} />

          <ChatLayer
            showChat={true}
            isTyping={isTyping}
            chatMessages={chatMessages}
            chatError={chatError}
            chatInputRef={chatInputRef}
            onTypingChange={(value) => {
              isTypingRef.current = value;
              setIsTyping(value);
            }}
            onSendMessage={sendChatMessage}
            socketConnected={socketRef.current?.connected}
            myId={myId}
          />
        </>
      )}

      {hasGun && (
        <div style={{
          position: "absolute",
          bottom: "20px",
          left: "50%",
          transform: "translateX(-50%)",
          backgroundColor: "rgba(255, 215, 0, 0.95)",
          color: "#000",
          padding: "15px 30px",
          borderRadius: "15px",
          fontSize: "18px",
          fontWeight: "bold",
          boxShadow: "0 8px 30px rgba(255, 215, 0, 0.5)",
          border: "3px solid #FF8C00",
          display: "flex",
          alignItems: "center",
          gap: "15px",
          zIndex: 1000
        }}>
          <span style={{ fontSize: "24px" }}>🔫</span>
          <div>
            <div>弾数: {gunBullets} / 20</div>
            <div style={{ fontSize: "14px", fontWeight: "normal" }}>
              残り時間: {Math.ceil(gunTimeLeft / 1000)}秒
            </div>
          </div>
          <div style={{ fontSize: "12px", color: "#333" }}>
            F / クリック: 発射
          </div>
        </div>
      )}

      {!showUI && (
        <div style={{
          position: "absolute",
          top: "20px",
          left: "50%",
          transform: "translateX(-50%)",
          backgroundColor: "rgba(0,0,0,0.7)",
          color: "white",
          padding: "8px 16px",
          borderRadius: "15px",
          fontSize: "12px",
          fontWeight: "500",
          opacity: 0.7
        }}>
          💡 H: 詳細情報とチャット | T/Enter: チャット入力
        </div>
      )}

      {connectionStatus !== "connected" && (
        <div style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          backgroundColor: "rgba(0,0,0,0.9)",
          color: "white",
          padding: "30px",
          borderRadius: "15px",
          textAlign: "center",
          fontSize: "18px",
          fontWeight: "600",
          boxShadow: "0 10px 40px rgba(0, 0, 0, 0.5)"
        }}>
          {connectionStatus === "connecting" && "🔄 改善版サーバーに接続中..."}
          {connectionStatus === "disconnected" && "❌ 接続が切れました"}
        </div>
      )}
    </div>
  );
}

export default App;