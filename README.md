# Eliza Town 🏠💻💌

> A fork of [AI Town](https://github.com/a16z-infra/ai-town) powered by [ElizaOS](https://github.com/elizaOS/eliza).

![Eliza Town Banner](./public/assets/eliza-town-banner.png)

**Eliza Town** is a virtual world where players can create their own unique **ElizaOS Agents** and watch them live, interact, and evolve autonomously in a pixel-art town.

Unlike standard AI Town, **Eliza Town** integrates the powerful [ElizaOS framework](https://github.com/elizaOS/eliza), allowing for:
- 🧠 **Deep Personality**: Create agents with distinct personalities, bios, and styles.
- 🎨 **Visual Customization**: Choose from diverse pixel art sprites for your agents.
- 🗣️ **Real Interaction**: Chat with your agents and watch them interact with each other using the ElizaOS engine.
- 🔗 **External Connection**: Your in-game agents run on your own ElizaOS instance (Railway, Cloud, or Local).

## 🚀 Key Features

- **Create Custom Agents**: Use the in-game UI to spawn new agents. Connect them to your ElizaOS backend.
- **MMO Experience**: (Coming Soon) Persistent world where players can visit each other's towns.
- **Dynamic Conversations**: Agents remember history and context thanks to ElizaOS's memory system.

## 🛠️ Stack

| Component | Technology |
|-----------|------------|
| Agent Engine | [ElizaOS](https://github.com/elizaOS/eliza) |
| Game Engine & Database | [Convex](https://convex.dev/) |
| Rendering | [PixiJS](https://pixijs.com/) |
| Authentication | [Clerk](https://clerk.com/) (Optional) |
| Music Generation | [Replicate](https://replicate.com/) |

---

## 🏁 Installation Guide

### Prerequisites

- **Node.js 18+** (We recommend using [nvm](https://github.com/nvm-sh/nvm))
- A **[Convex](https://convex.dev/)** account (free tier available)

### Step 1: Clone & Install

```bash
git clone https://github.com/cayden970207/eliza-town.git
cd eliza-town
npm install
```

### Step 2: Configure Convex Backend

1. Initialize Convex (this will prompt you to log in if needed):
   ```bash
   npx convex dev
   ```
   This starts the development backend and syncs your functions.

2. Set environment variables in the Convex Dashboard or via CLI:
   ```bash
   # Required: ElizaOS Server URL
   npx convex env set ELIZA_SERVER_URL "https://fliza-agent-production.up.railway.app"
   
   # Optional: For character generation features
   npx convex env set GOOGLE_API_KEY "your-google-api-key"
   npx convex env set REPLICATE_API_TOKEN "your-replicate-token"
   ```

### Step 3: Run the Game

Start the frontend development server:
```bash
npm run dev
```

Visit **http://localhost:5173** to enter Eliza Town!

---

## 🔌 ElizaOS Server Configuration

By default, Eliza Town connects to a **shared ElizaOS server** hosted by the project maintainers. This allows you to start playing immediately without additional setup.

### Using Your Own ElizaOS Server (Optional)

If you want full control over your agents or want to customize the AI behavior:

1. **Deploy ElizaOS** using one of these methods:
   - [Railway](https://railway.app/) (Recommended for quick setup)
   - [Docker](https://github.com/elizaOS/eliza#docker)
   - Local installation (see [ElizaOS docs](https://elizaos.github.io/eliza/))

2. **Update the environment variable:**
   ```bash
   npx convex env set ELIZA_SERVER_URL "https://your-eliza-server.com"
   ```

3. **Ensure your ElizaOS server has an LLM configured** (e.g., OpenAI API key).

---

## 🤖 Creating Agents

1. Click the **"New Agent"** button in the top menu.
2. **Select a Sprite**: Browse the carousel to pick a pixel art avatar.
3. **Define Personality**: Choose tags (e.g., Friendly, Mysterious) and write a Bio.
4. **Spawn**: Click create, and your ElizaOS agent will appear in the world!

---

## 🧑‍💻 Contributing

We welcome contributions! Here's how to get started:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run tests: `npm test` (if available)
5. Submit a Pull Request

## Tests

- Unit tests: `npm test`
- E2E (Playwright): `npm run test:e2e` (runs with a deterministic mock backend)
- E2E UI runner: `npm run test:e2e:ui`

E2E coverage includes landing page actions, character creation/deletion, agent creation/removal,
join/release flows, conversations (invite/accept/reject/message/leave), and movement.
Playwright E2E runs automatically on pull requests.

### Project Structure

```
├── convex/          # Backend functions and schema
│   ├── elizaAgent/  # ElizaOS integration
│   └── agent/       # Conversation logic
├── src/
│   ├── components/  # React components
│   └── lib/         # Utilities and registries
├── data/            # World data and maps
└── public/assets/   # Runtime assets (sprites, tilesets)
```

---

## Credits

This project stands on the shoulders of giants:
- **[AI Town](https://github.com/a16z-infra/ai-town)** - The original base (MIT License)
- **[ElizaOS](https://github.com/elizaOS/eliza)** - The agent framework
- **[PixiJS](https://pixijs.com/)** - Rendering engine
- Assets by [George Bailey](https://opengameart.org/content/16x16-game-assets), [Hilau](https://opengameart.org/content/16x16-rpg-tileset), and [Ansimuz](https://opengameart.org/content/tiny-rpg-forest)

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
