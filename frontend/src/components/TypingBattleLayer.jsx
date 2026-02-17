import React, { useEffect, useRef } from 'react';

export const TypingBattleLayer = ({ activeBattle, socket }) => {
    const inputRef = useRef(null);
    const MAX_HP = 1000;

    useEffect(() => {
        if (activeBattle) {
            console.log("🔥 Typing Battle Layer Mounted!");
            inputRef.current?.focus();
        }
    }, [activeBattle]);

    const handleKeyDown = (e) => {
        console.log("⌨️ Key pressed:", e.key);

        if (!activeBattle || !socket) return;
        e.stopPropagation();

        if (e.key.length === 1) {
            const char = e.key.toLowerCase();
            socket.emit('battle_type', {
                battleId: activeBattle.battleId,
                char: char
            });
        }
    };

    if (!activeBattle) return null;

    const myHpRate = Math.max(0, activeBattle.myHp) / MAX_HP * 100;
    const oppHpRate = Math.max(0, activeBattle.oppHp) / MAX_HP * 100;

    return (
        <div
            onClick={() => inputRef.current?.focus()}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 9999,
                display: 'flex',
                justifyContent: 'center',
                padding: '20px',
                pointerEvents: 'auto'
            }}
        >
            <div style={{
                background: '#111',
                color: 'white',
                padding: '30px 40px',
                borderRadius: '0 0 20px 20px',
                border: '4px solid #ff9900',
                minWidth: '600px',
                maxWidth: '800px',
                boxShadow: '0 4px 20px rgba(255, 153, 0, 0.5)'
            }}>
                <h2 style={{ color: '#ff9900', margin: '0 0 20px 0', textAlign: 'center' }}>
                    ⚔️ SUSHI BATTLE MODE ⚔️
                </h2>

                {/* タイピングワード表示 */}
                <div style={{
                    fontSize: '40px',
                    fontFamily: 'monospace',
                    margin: '20px 0',
                    textAlign: 'center',
                    letterSpacing: '2px'
                }}>
                    <span style={{ color: '#00ff00' }}>
                        {activeBattle.word.slice(0, activeBattle.myProgress).toLowerCase()}
                    </span>
                    <span style={{ color: '#ffffff' }}>
                        {activeBattle.word.slice(activeBattle.myProgress).toLowerCase()}
                    </span>
                </div>

                <div style={{ marginTop: '20px' }}>
                    {/* 自分のHPバー */}
                    <div style={{
                        textAlign: 'left',
                        fontSize: '12px',
                        color: '#00ccff',
                        marginBottom: '5px',
                        fontWeight: 'bold'
                    }}>
                        🍣 YOUR HP: {Math.max(0, activeBattle.myHp)} / {MAX_HP}
                    </div>
                    <div style={{
                        width: '100%',
                        height: '14px',
                        background: '#333',
                        borderRadius: '7px',
                        overflow: 'hidden',
                        marginBottom: '15px',
                        border: '1px solid #555'
                    }}>
                        <div style={{
                            width: `${myHpRate}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, #0066ff, #00ccff)',
                            transition: 'width 0.3s ease-out'
                        }}></div>
                    </div>

                    {/* 相手のHPバー */}
                    <div style={{
                        textAlign: 'left',
                        fontSize: '12px',
                        color: '#ff4444',
                        marginBottom: '5px',
                        fontWeight: 'bold'
                    }}>
                        👾 ENEMY HP: {Math.max(0, activeBattle.oppHp)} / {MAX_HP}
                    </div>
                    <div style={{
                        width: '100%',
                        height: '14px',
                        background: '#333',
                        borderRadius: '7px',
                        overflow: 'hidden',
                        border: '1px solid #555'
                    }}>
                        <div style={{
                            width: `${oppHpRate}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, #cc0000, #ff4444)',
                            transition: 'width 0.3s ease-out'
                        }}></div>
                    </div>
                </div>

                <input
                    ref={inputRef}
                    type="text"
                    autoFocus
                    onKeyDown={handleKeyDown}
                    style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
                />

                <p style={{
                    textAlign: 'center',
                    fontSize: '14px',
                    color: '#aaa',
                    margin: '15px 0 0 0'
                }}>
                    💻 半角英数で入力してください
                </p>
            </div>
        </div>
    );
};