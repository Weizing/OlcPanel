#!/bin/sh

# Start SOCKS5 proxy if enabled (for srv mode)
if [ ! -z "$SOCKS_PORT" ]; then
    echo "Starting SOCKS5 proxy on port $SOCKS_PORT..."

    STATS_FILE="/tmp/socks.stats"
    RX_LIMIT="${RX_LIMIT:-0}"
    TX_LIMIT="${TX_LIMIT:-0}"

    /app/socks5proxy -port "$SOCKS_PORT" -stats "$STATS_FILE" -rx-limit "$RX_LIMIT" -tx-limit "$TX_LIMIT" &

    # Wait for proxy to start
    sleep 1
fi

# Start olcrtc with all arguments
exec /app/olcrtc "$@"
