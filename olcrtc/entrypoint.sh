#!/bin/sh

echo "=== OlcRTC Container Starting ==="
echo "SOCKS_PORT: $SOCKS_PORT"
echo "RX_LIMIT: $RX_LIMIT"
echo "TX_LIMIT: $TX_LIMIT"

# Start SOCKS5 proxy if enabled (for srv mode)
if [ ! -z "$SOCKS_PORT" ]; then
    echo "Starting SOCKS5 proxy on port $SOCKS_PORT..."

    STATS_FILE="/tmp/socks.stats"
    RX_LIMIT="${RX_LIMIT:-0}"
    TX_LIMIT="${TX_LIMIT:-0}"

    # Start proxy and capture output
    /app/socks5proxy -port "$SOCKS_PORT" -stats "$STATS_FILE" -rx-limit "$RX_LIMIT" -tx-limit "$TX_LIMIT" 2>&1 &
    PROXY_PID=$!
    echo "SOCKS5 proxy PID: $PROXY_PID"

    # Wait for proxy to start and verify it's listening
    for i in 1 2 3 4 5; do
        sleep 1
        if netstat -tuln 2>/dev/null | grep -q ":$SOCKS_PORT " || ss -tuln 2>/dev/null | grep -q ":$SOCKS_PORT "; then
            echo "SOCKS5 proxy started successfully on port $SOCKS_PORT"
            break
        fi
        echo "Waiting for SOCKS5 proxy to start... ($i/5)"
        if [ $i -eq 5 ]; then
            echo "ERROR: SOCKS5 proxy did not start!"
            echo "Checking if process is running:"
            ps aux | grep socks5proxy
        fi
    done
else
    echo "SOCKS_PORT not set, skipping SOCKS5 proxy"
fi

echo "Starting OlcRTC..."
# Start olcrtc with all arguments
exec /app/olcrtc "$@"
