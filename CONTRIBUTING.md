# Contributing to High-Performance Distributed Real-Time System

Thank you for your interest in contributing!

## Development Setup

```bash
# Clone the repository
git clone https://github.com/logeshkannan19/High-Performance-Distributed-Real-Time-System.git
cd High-Performance-Distributed-Real-Time-System

# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test

# Build
npm run build
```

## Branch Strategy

- `main` - Production-ready code
- `develop` - Development integration
- `feature/*` - New features
- `fix/*` - Bug fixes
- `refactor/*` - Code refactoring

## Code Standards

### TypeScript
- Use strict TypeScript mode
- Prefer interfaces over types for object shapes
- Use explicit return types on exported functions
- Avoid `any` type

### Naming Conventions
- Classes: PascalCase (`WebSocketServer`)
- Functions/variables: camelCase (`handleConnection`)
- Constants: UPPER_SNAKE_CASE (`MAX_CONNECTIONS`)
- Files: kebab-case (`websocket-server.ts`)

### Commits
```
feat: add new WebSocket event
fix: resolve connection timeout issue
docs: update API documentation
refactor: improve error handling
test: add unit tests for Redis manager
```

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`npm test`)
5. Commit with clear message
6. Push and create PR

## Testing

- Write unit tests for all new functionality
- Maintain 80%+ code coverage
- Use Jest for testing
- Mock external dependencies

## Questions?

Open an issue or start a discussion.
