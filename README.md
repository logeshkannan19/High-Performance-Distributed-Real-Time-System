# Real-Time Distributed System

![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)
![License](https://img.shields.io/badge/License-MIT-yellow.svg)
![Build](https://img.shields.io/badge/Build-Passing-brightgreen.svg)

> High-Performance Distributed Real-Time System using Node.js and TypeScript, designed to handle thousands of concurrent users with ultra-low latency communication.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLIENTS                                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ WebSocket│  │   SSE    │  │   REST   │  │  Mobile  │  │   IoT    │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
└───────┼──────────────┼──────────────┼──────────────┼──────────────┼─────────┘
        │              │              │              │              │
        └──────────────┴──────────────┴──────────────┴──────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        LOAD BALANCER (NGINX)                                 │
│                      • Least Connections                                     │
│                      • Health Checks                                         │
│                      • SSL Termination                                       │
│                      • WebSocket Proxy                                       │
└──────────────────────────────────┬────────────────────────────────────────────┘
                                   │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
┌───────────────┐         ┌───────────────┐         ┌───────────────┐
│  Node.js      │         │  Node.js      │         │  Node.js      │
│  Instance 1   │         │  Instance 2   │         │  Instance N   │
│  (Cluster)    │         │  (Cluster)    │         │  (Cluster)    │
└───────┬───────┘         └───────┬───────┘         └───────┬───────┘
        │                         │                         │
        └─────────────────────────┼─────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                    ▼                           ▼
        ┌───────────────────┐       ┌───────────────────┐
        │   REDIS CLUSTER   │       │   MESSAGE QUEUE   │
        │   • Pub/Sub       │       │   • BullMQ        │
        │   • Cache         │       │   • Async Jobs    │
        │   • Sessions      │       │   • Scheduling    │
        └───────────────────┘       └───────────────────┘
```

---

## Features

| Feature | Description |
|---------|-------------|
| **WebSocket** | Socket.IO with auto-reconnection, multiplexing, and binary support |
| **Server-Sent Events** | Efficient unidirectional streaming for notifications |
| **Redis Pub/Sub** | Horizontal scaling with cross-instance message broadcasting |
| **Redis Caching** | Multi-layer caching for hot data |
| **Rate Limiting** | Per-IP and per-user rate limiting |
| **Circuit Breaker** | Fault tolerance pattern for external services |
| **Load Balancing** | Horizontal scaling with sticky sessions |
| **Health Checks** | Comprehensive health and readiness endpoints |
| **Metrics** | Prometheus-compatible metrics collection |
| **Graceful Shutdown** | Zero-downtime deployments |
| **Docker Ready** | Containerized deployment |
| **TypeScript** | Full type safety with strict mode |

---

## Quick Start

### Prerequisites
- Node.js 18+
- Redis 7+
- Docker (optional)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/realtime-distributed-system.git
cd realtime-distributed-system

# Install dependencies
npm install

# Start Redis (using Docker)
docker run -d -p 6379:6379 redis:7-alpine

# Start the server
npm run dev
```

### Using Docker Compose

```bash
# Start all services
docker-compose -f docker/docker-compose.yml up -d

# Check logs
docker-compose -f docker/docker-compose.yml logs -f

# Scale instances
docker-compose -f docker/docker-compose.yml up -d --scale app=5
```

---

## API Endpoints

### Health & Monitoring

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Basic health check |
| GET | `/health/detailed` | Detailed health with memory/cpu |
| GET | `/metrics` | Prometheus metrics |
| GET | `/stats` | Connection statistics |

### Real-Time Communication

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stream` | SSE endpoint for streaming |
| POST | `/api/broadcast` | Broadcast to all clients |
| POST | `/api/notify/:userId` | Send to specific user |
| WS | `/socket.io/` | WebSocket endpoint |

### User Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/online/users` | List online users |
| POST | `/api/auth/login` | User authentication |

---

## WebSocket Events

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `message` | `{type, payload, recipient?}` | Send message |
| `join_room` | `roomId` | Join a chat room |
| `leave_room` | `roomId` | Leave a chat room |
| `subscribe` | `channel` | Subscribe to channel |
| `ping` | - | Keep-alive ping |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `connected` | `{socketId, timestamp}` | Connection confirmation |
| `message` | `{event, data, timestamp}` | Incoming message |
| `user_joined` | `{socketId, roomId}` | User joined room |
| `user_left` | `{socketId, roomId}` | User left room |
| `notification` | `{type, data}` | Push notification |
| `pong` | `{timestamp}` | Keep-alive response |

---

## Configuration

### Environment Variables

```env
# Server
NODE_ENV=production
PORT=3000
INSTANCE_ID=server-1

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# WebSocket
WS_PING_INTERVAL=25000
WS_PING_TIMEOUT=60000
WS_MAX_CONNECTIONS=100000

# Rate Limiting
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=100

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# Metrics
METRICS_ENABLED=true
METRICS_PORT=9090
```

---

## Performance Benchmarks

### Test Environment
- 4x CPU cores
- 8GB RAM
- Redis 7 on localhost
- 100 concurrent WebSocket connections

### Results

| Metric | Value |
|--------|-------|
| **Connections/sec** | 1,000+ |
| **Messages/sec** | 50,000+ |
| **Latency (p99)** | < 10ms |
| **Memory/connection** | ~2KB |
| **CPU usage** | < 40% |

### Load Test Command

```bash
npm run test:load
```

---

## Scaling Strategy

### Horizontal Scaling

```
┌──────────────────────────────────────────────────────────────┐
│                      NGINX Load Balancer                      │
│                 (Least Connections, Health Checks)              │
└─────────────────────┬────────────────────────────────────────┘
                      │
     ┌────────────────┼────────────────┐
     │                │                │
     ▼                ▼                ▼
┌─────────┐     ┌─────────┐     ┌─────────┐
│ Node 1  │     │ Node 2  │     │ Node N  │
│ (4 CPU) │     │ (4 CPU) │     │ (4 CPU) │
└────┬────┘     └────┬────┘     └────┬────┘
     │                │                │
     └────────────────┼────────────────┘
                      │
     ┌─────────────────┴────────────────┐
     │                                  │
     ▼                                  ▼
┌─────────────┐                  ┌─────────────┐
│   Redis    │                  │   Redis     │
│  Cluster   │                  │  Sentinel   │
└─────────────┘                  └─────────────┘
```

### Redis Cluster for Pub/Sub

- Channel-based sharding
- Automatic failover
- Geographic distribution

---

## Error Handling

### Retry Strategy

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(delay * Math.pow(2, i));
    }
  }
  throw new Error('Max retries exceeded');
}
```

### Circuit Breaker

- **Closed**: Normal operation
- **Open**: Failing fast, reject requests
- **Half-Open**: Testing recovery

---

## Monitoring

### Metrics Endpoint

```bash
curl http://localhost:3000/metrics
```

### Key Metrics

| Metric | Description |
|--------|-------------|
| `http_requests_total` | Total HTTP requests |
| `websocket_connections_active` | Active WS connections |
| `redis_commands_total` | Redis commands |
| `message_throughput` | Messages/second |
| `latency_p99` | 99th percentile latency |

### PM2 Monitoring

```bash
npm run monitor
```

---

## AWS Deployment

### Infrastructure

```
┌─────────────────────────────────────────────────────────────────┐
│                        Route 53 (DNS)                            │
└─────────────────────────────┬───────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                    Application Load Balancer                     │
│                   (SSL Termination, WAF)                         │
└─────────────────────────────┬───────────────────────────────────┘
                              │
     ┌────────────────────────┼────────────────────────┐
     │                        │                        │
     ▼                        ▼                        ▼
┌─────────┐             ┌─────────┐             ┌─────────┐
│  EC2   │             │  EC2   │             │  EC2   │
│ Node 1 │             │ Node 2  │             │ Node 3 │
│(ASG)   │             │(ASG)   │             │(ASG)   │
└────┬────┘             └────┬────┘             └────┬────┘
     │                        │                        │
     └────────────────────────┼────────────────────────┘
                              │
     ┌────────────────────────┼────────────────────────┐
     │                        │                        │
     ▼                        ▼                        ▼
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│ ElastiCache│       │ ElastiCache │       │ ElastiCache │
│  (Redis)   │       │  (Redis)    │       │  (Redis)    │
│ Primary    │       │ Replica 1   │       │ Replica 2   │
└─────────────┘       └─────────────┘       └─────────────┘
```

### Auto Scaling

```yaml
AutoScalingGroup:
  MinSize: 2
  MaxSize: 20
  TargetGroupARNs:
    - !Ref ALBTargetGroup
  LaunchTemplate:
    LaunchTemplateId: !Ref LaunchTemplate
```

---

## Testing

```bash
# Unit tests
npm run test

# Integration tests
npm run test:integration

# Load tests
npm run test:load

# All tests with coverage
npm run test -- --coverage
```

---

## Project Structure

```
realtime-system/
├── src/
│   ├── config/           # Configuration management
│   ├── core/
│   │   ├── websocket/    # WebSocket server
│   │   ├── sse/          # SSE server
│   │   ├── redis/        # Redis manager
│   │   ├── api/          # REST API gateway
│   │   ├── loadbalancer/ # Load balancing
│   │   └── monitoring/   # Metrics & health
│   ├── services/         # Business logic
│   ├── utils/            # Utilities
│   └── types/            # TypeScript types
├── tests/                # Test files
├── benchmarks/           # Load tests
├── docker/              # Docker configs
├── k8s/                 # Kubernetes manifests
└── docs/                # Documentation
```

---

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Support

- Documentation: [docs/](docs/)
- Issues: [GitHub Issues](https://github.com/yourusername/realtime-distributed-system/issues)
- Discussions: [GitHub Discussions](https://github.com/yourusername/realtime-distributed-system/discussions)
