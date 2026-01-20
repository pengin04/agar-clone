import { useEffect, useState } from 'react';

const GameOverScreen = ({ deathStats, onRespawn, onQuit }) => {
  const [animationPhase, setAnimationPhase] = useState(0);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    // アニメーションフェーズの進行
    const timer1 = setTimeout(() => setAnimationPhase(1), 100);
    const timer2 = setTimeout(() => setAnimationPhase(2), 600);
    const timer3 = setTimeout(() => setShowDetails(true), 1200);
    
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, []);

  // 生存時間のフォーマット
  const formatTime = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // ランクに応じたメッセージ
  const getRankMessage = (rank, totalPlayers) => {
    const percentage = (rank / totalPlayers) * 100;
    if (percentage <= 10) return { text: '🏆 素晴らしい！', color: '#FFD700' };
    if (percentage <= 25) return { text: '🥈 よくやった！', color: '#C0C0C0' };
    if (percentage <= 50) return { text: '🥉 良い戦いだった', color: '#CD7F32' };
    return { text: '💪 次は頑張ろう', color: '#888' };
  };

  const rankMessage = getRankMessage(deathStats.rank, deathStats.totalPlayers);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      backdropFilter: 'blur(8px)',
      animation: 'fadeIn 0.4s ease-out',
    }}>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { 
            opacity: 0;
            transform: translateY(30px);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes scaleIn {
          from { 
            opacity: 0;
            transform: scale(0.8);
          }
          to { 
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 20px rgba(255, 107, 107, 0.5); }
          50% { box-shadow: 0 0 40px rgba(255, 107, 107, 0.8); }
        }
        .stat-card {
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 12px;
          padding: 20px;
          margin: 10px;
          min-width: 180px;
          text-align: center;
          animation: slideUp 0.5s ease-out;
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .stat-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 10px 30px rgba(255, 255, 255, 0.2);
        }
        .respawn-button {
          animation: pulse 2s infinite ease-in-out;
        }
        .respawn-button:hover {
          animation: glow 1.5s infinite ease-in-out;
        }
      `}</style>

      <div style={{
        maxWidth: '900px',
        width: '90%',
        padding: '40px',
        borderRadius: '24px',
        background: 'linear-gradient(135deg, rgba(30, 30, 50, 0.95) 0%, rgba(20, 20, 35, 0.98) 100%)',
        border: '2px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 20px 80px rgba(0, 0, 0, 0.6)',
        animation: animationPhase >= 1 ? 'scaleIn 0.5s ease-out' : 'none',
        opacity: animationPhase >= 1 ? 1 : 0,
      }}>
        
        {/* タイトル */}
        <div style={{
          textAlign: 'center',
          marginBottom: '30px',
          animation: animationPhase >= 2 ? 'slideUp 0.6s ease-out' : 'none',
          opacity: animationPhase >= 2 ? 1 : 0,
        }}>
          <h1 style={{
            fontSize: '48px',
            fontWeight: 'bold',
            background: 'linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            margin: '0 0 10px 0',
            textShadow: '0 4px 20px rgba(255, 107, 107, 0.3)',
          }}>
            ゲームオーバー
          </h1>
          
          <div style={{
            fontSize: '24px',
            color: rankMessage.color,
            fontWeight: '600',
            marginTop: '10px',
          }}>
            {rankMessage.text}
          </div>
        </div>

        {/* メイン統計 */}
        {showDetails && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'stretch',
            flexWrap: 'wrap',
            gap: '15px',
            marginBottom: '30px',
          }}>
            
            {/* 最終スコア */}
            <div className="stat-card" style={{ animationDelay: '0.1s' }}>
              <div style={{ fontSize: '14px', color: '#aaa', marginBottom: '8px' }}>
                最終スコア
              </div>
              <div style={{ 
                fontSize: '36px', 
                fontWeight: 'bold', 
                color: '#4ECDC4',
                textShadow: '0 2px 10px rgba(78, 205, 196, 0.5)',
              }}>
                {deathStats.finalScore?.toLocaleString() || 0}
              </div>
            </div>

            {/* 最終質量 */}
            <div className="stat-card" style={{ animationDelay: '0.2s' }}>
              <div style={{ fontSize: '14px', color: '#aaa', marginBottom: '8px' }}>
                最終質量
              </div>
              <div style={{ 
                fontSize: '36px', 
                fontWeight: 'bold', 
                color: '#FFD93D',
                textShadow: '0 2px 10px rgba(255, 217, 61, 0.5)',
              }}>
                {Math.floor(deathStats.finalMass || 0)}
              </div>
            </div>

            {/* ランキング */}
            <div className="stat-card" style={{ animationDelay: '0.3s' }}>
              <div style={{ fontSize: '14px', color: '#aaa', marginBottom: '8px' }}>
                ランキング
              </div>
              <div style={{ 
                fontSize: '36px', 
                fontWeight: 'bold', 
                color: '#FF6B6B',
                textShadow: '0 2px 10px rgba(255, 107, 107, 0.5)',
              }}>
                {deathStats.rank}/{deathStats.totalPlayers}
              </div>
            </div>

          </div>
        )}

        {/* 詳細統計 */}
        {showDetails && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            flexWrap: 'wrap',
            gap: '15px',
            marginBottom: '35px',
          }}>
            
            {/* 生存時間 */}
            <div className="stat-card" style={{ 
              animationDelay: '0.4s',
              minWidth: '160px',
            }}>
              <div style={{ fontSize: '13px', color: '#aaa', marginBottom: '6px' }}>
                ⏱️ 生存時間
              </div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#fff' }}>
                {formatTime(deathStats.survivalTime || 0)}
              </div>
            </div>

            {/* 最大質量 */}
            <div className="stat-card" style={{ 
              animationDelay: '0.5s',
              minWidth: '160px',
            }}>
              <div style={{ fontSize: '13px', color: '#aaa', marginBottom: '6px' }}>
                🏋️ 最大質量
              </div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#fff' }}>
                {Math.floor(deathStats.maxMass || 0)}
              </div>
            </div>

            {/* 捕食数 */}
            <div className="stat-card" style={{ 
              animationDelay: '0.6s',
              minWidth: '160px',
            }}>
              <div style={{ fontSize: '13px', color: '#aaa', marginBottom: '6px' }}>
                🍴 捕食数
              </div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#fff' }}>
                {deathStats.cellsEaten || 0}
              </div>
            </div>

          </div>
        )}

        {/* キラー情報 */}
        {showDetails && deathStats.killedBy && (
          <div style={{
            textAlign: 'center',
            marginBottom: '30px',
            padding: '15px',
            background: 'rgba(255, 107, 107, 0.1)',
            borderRadius: '12px',
            border: '1px solid rgba(255, 107, 107, 0.3)',
            animation: 'slideUp 0.6s ease-out',
            animationDelay: '0.7s',
            opacity: 0,
            animationFillMode: 'forwards',
          }}>
            <div style={{ fontSize: '14px', color: '#FF6B6B', marginBottom: '5px' }}>
              倒されたプレイヤー
            </div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#fff' }}>
              {deathStats.killedBy}
            </div>
          </div>
        )}

        {/* ボタン群 */}
        {showDetails && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '20px',
            marginTop: '35px',
            animation: 'slideUp 0.6s ease-out',
            animationDelay: '0.8s',
            opacity: 0,
            animationFillMode: 'forwards',
          }}>
            
            {/* リスポーンボタン */}
            <button
              onClick={onRespawn}
              className="respawn-button"
              style={{
                padding: '18px 50px',
                fontSize: '20px',
                fontWeight: 'bold',
                color: '#fff',
                background: 'linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%)',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                boxShadow: '0 8px 25px rgba(255, 107, 107, 0.4)',
                transition: 'all 0.3s ease',
                outline: 'none',
              }}
              onMouseEnter={(e) => {
                e.target.style.transform = 'translateY(-3px)';
                e.target.style.boxShadow = '0 12px 35px rgba(255, 107, 107, 0.6)';
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = '0 8px 25px rgba(255, 107, 107, 0.4)';
              }}
            >
              🔄 再挑戦する
            </button>

            {/* 終了ボタン */}
            {onQuit && (
              <button
                onClick={onQuit}
                style={{
                  padding: '18px 40px',
                  fontSize: '18px',
                  fontWeight: '600',
                  color: '#fff',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  outline: 'none',
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = 'rgba(255, 255, 255, 0.2)';
                  e.target.style.borderColor = 'rgba(255, 255, 255, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'rgba(255, 255, 255, 0.1)';
                  e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                }}
              >
                終了
              </button>
            )}

          </div>
        )}

      </div>
    </div>
  );
};

export default GameOverScreen;
