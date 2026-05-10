FROM golang:1.25-alpine AS builder

WORKDIR /build

RUN apk add --no-cache git

RUN git clone --recurse-submodules https://github.com/openlibrecommunity/olcrtc.git .

RUN go build -o olcrtc ./cmd/olcrtc

FROM alpine:latest

RUN apk add --no-cache ca-certificates

WORKDIR /app

COPY --from=builder /build/olcrtc /app/olcrtc

RUN chmod +x /app/olcrtc

ENTRYPOINT ["/app/olcrtc"]
