import React, { useEffect } from 'react';

const ChatMessage = ({ message, myId }) => {
    const isSystem = message.type !== 'normal';
    const isMyMessage = message.playerId === myId;

    return (
        <div style={{
            marginBottom: "8px",
            padding: "6px 8px",
            borderRadius: "8px",
            backgroundColor: isSystem
                ? "rgba(255, 215, 0, 0.1)"
                : isMyMessage
                    ? "rgba(33, 150, 243, 0.1)"
                    : "rgba(0, 0, 0, 0.05)",
            border: isSystem ? "1px solid rgba(255, 215, 0, 0.3)" : "none",
            wordWrap: "break-word",
            fontSize: "12px",
            lineHeight: "1.4"
        }}>
            {!isSystem && (
                <div style={{
                    fontWeight: "bold",
                    color: message.playerColor || "#333",
                    marginBottom: "2px",
                    fontSize: "11px"
                }}>
                    {isMyMessage ? "あなた" : message.playerName}
                    <span style={{
                        color: "#999",
                        fontWeight: "normal",
                        marginLeft: "6px",
                        fontSize: "10px"
                    }}>
                        {new Date(message.timestamp).toLocaleTimeString()}
                    </span>
                </div>
            )}
            <div style={{
                color: isSystem ? "#B8860B" : "#333",
                fontWeight: isSystem ? "500" : "normal",
                fontStyle: isSystem ? "italic" : "normal"
            }}>
                {message.message}
            </div>
        </div>
    );
};

export const ChatLayer = React.memo(({
    showChat,
    isTyping,
    chatMessages,
    chatError,
    chatInputRef,
    onTypingChange,
    onSendMessage,
    socketConnected,
    myId
}) => {
    // キーボード処理はそのまま
    useEffect(() => {
        const handleKeyDown = (e) => {
            const activeElement = document.activeElement;
            const isInputFocused = activeElement?.tagName === 'INPUT' ||
                activeElement?.tagName === 'TEXTAREA';

            if (isInputFocused) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    onTypingChange(false);
                    chatInputRef.current?.blur();
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const message = chatInputRef.current?.value?.trim();
                    if (message) {
                        onSendMessage(message);
                        chatInputRef.current.value = "";
                        setTimeout(() => chatInputRef.current?.focus(), 50);
                    }
                }
                return;
            }

            if ((e.code === 'KeyT' || e.code === 'Enter') && showChat && !isTyping) {
                e.preventDefault();
                onTypingChange(true);
                setTimeout(() => chatInputRef.current?.focus(), 100);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showChat, isTyping, onTypingChange, onSendMessage, chatInputRef]);

    if (!showChat) return null;

    return (
        <div
            data-chat-layer="true"
            style={{
                position: "absolute",
                top: "360px",   // ← 変更: 詳細情報パネルの下（高さに応じて調整が必要）
                left: "20px",   // ← 左側に配置
                width: "360px", // ← 変更: 詳細情報と同じ幅に
                height: "260px", // ← 変更: 横長にするため高さを低く
                backgroundColor: "rgba(255, 255, 255, 0.95)",
                borderRadius: "15px",
                boxShadow: "0 10px 40px rgba(0, 0, 0, 0.15)",
                backdropFilter: "blur(10px)",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                zIndex: 9999,
                isolation: 'isolate',
                pointerEvents: 'auto'
            }}
        >
            {/* ヘッダー */}
            <div style={{
                padding: "10px 16px", // ← パディングを少し小さく
                backgroundColor: "rgba(33, 150, 243, 0.1)",
                borderBottom: "1px solid rgba(0, 0, 0, 0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between"
            }}>
                <span style={{
                    fontWeight: "bold",
                    color: "#2196F3",
                    fontSize: "14px"
                }}>
                    💬 チャット ({chatMessages.length})
                </span>
            </div>

            {/* メッセージ表示 */}
            <div style={{
                flex: 1,
                padding: "6px", // ← パディングを小さく
                overflowY: "auto",
                maxHeight: "140px" // ← 高さ調整
            }}>
                {chatMessages.length === 0 ? (
                    <div style={{
                        textAlign: "center",
                        color: "#999",
                        fontSize: "11px",
                        marginTop: "10px",
                        fontStyle: "italic"
                    }}>
                        チャットメッセージはありません<br />
                        T/Enterで入力開始
                    </div>
                ) : (
                    chatMessages.map((message) => (
                        <ChatMessage key={message.id} message={message} myId={myId} />
                    ))
                )}
            </div>

            {/* 入力エリア */}
            <div style={{
                padding: "8px", // ← パディングを小さく
                borderTop: "1px solid rgba(0, 0, 0, 0.1)",
                backgroundColor: "rgba(0, 0, 0, 0.02)"
            }}>
                {chatError && (
                    <div style={{
                        color: "#CC0000",
                        fontSize: "10px",
                        marginBottom: "4px",
                        fontWeight: "500"
                    }}>
                        {chatError}
                    </div>
                )}

                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}> {/* ← flexDirection削除、横並びに */}
                    <input
                        ref={chatInputRef}
                        type="text"
                        onFocus={() => onTypingChange(true)}
                        onBlur={(e) => {
                            setTimeout(() => {
                                const chatLayer = document.querySelector('[data-chat-layer="true"]');
                                if (!chatLayer?.contains(document.activeElement)) {
                                    onTypingChange(false);
                                }
                            }, 150);
                        }}
                        placeholder="メッセージ入力..."
                        maxLength={100}
                        disabled={!socketConnected}
                        autoComplete="off"
                        spellCheck="false"
                        style={{
                            flex: 1, // ← 残りのスペースを使用
                            padding: "6px 10px",
                            border: `2px solid ${isTyping ? '#2196F3' : '#ddd'}`,
                            borderRadius: "15px",
                            fontSize: "11px",
                            outline: "none",
                            backgroundColor: "white",
                            color: "black",
                            boxSizing: "border-box"
                        }}
                    />

                    <button
                        type="button"
                        onClick={() => {
                            const message = chatInputRef.current?.value?.trim();
                            if (message) {
                                onSendMessage(message);
                                chatInputRef.current.value = "";
                                setTimeout(() => chatInputRef.current?.focus(), 50);
                            }
                        }}
                        disabled={!socketConnected}
                        style={{
                            padding: "6px 16px", // ← 幅を調整
                            backgroundColor: socketConnected ? "#2196F3" : "#ccc",
                            color: "white",
                            border: "none",
                            borderRadius: "15px",
                            cursor: socketConnected ? "pointer" : "not-allowed",
                            fontSize: "11px",
                            fontWeight: "500",
                            whiteSpace: "nowrap" // ← ボタンテキストが折り返さないように
                        }}
                    >
                        送信
                    </button>
                </div>

                <div style={{
                    fontSize: "9px",
                    color: "#999",
                    marginTop: "4px",
                    textAlign: "center"
                }}>
                    T/Enter: 開始 | Esc: 終了
                </div>
            </div>
        </div>
    );
});

ChatLayer.displayName = 'ChatLayer';
