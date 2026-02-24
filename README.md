# md2Lark

Markdown to Lark (Feishu) document converter.

Autonomous development powered by [Miyabi](https://github.com/ShunsukeHayashi/Autonomous-Operations) Agentic OS.

## Setup

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env with your tokens

# Build
npm run build

# Run tests
npm test
```

## Usage

```typescript
import { convert } from 'md2lark';

const doc = convert({
  markdown: '# Hello World\nThis is a test.',
  title: 'My Document',
});
```

## Development

```bash
npm run dev           # Run in development mode
npm run typecheck     # Type checking
npm run lint          # Linting
npm run test:watch    # Watch mode tests
npm run test:coverage # Coverage report
```

## Miyabi Integration

This project uses Miyabi's autonomous agent pipeline:

- **Issue** creation triggers automatic analysis, implementation, review, and PR
- **53+ labels** for state management across 10 categories
- **7 AI agents** handle the full development lifecycle

```bash
npx miyabi status          # Check project status
npx miyabi doctor          # Health check
```

## License

MIT
